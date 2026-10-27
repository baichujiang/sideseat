import XCTest
import Darwin

/// Owned Messages acceptance on the explicitly selected test surface. API-seeded contact/history/notification are explicit prerequisites only.
@MainActor final class FiveRootMessagesPhoneUITests: XCTestCase {
    private struct Account: Decodable { let role: String; let id: String; let identifier: String; let password: String; let displayName: String }
    private struct Seed: Decodable {
        let schemaVersion: Int; let runID: String; let preparedAt: String; let connectionID: String
        let seedOwnerMessageID: String; let seedPeerMessageID: String; let seedOwnerText: String; let seedPeerText: String
        let notificationToken: String; let notificationTitle: String; let notificationLocation: String
    }
    private struct Fixture: Decodable {
        let kind: String; let schemaVersion: Int; let runID: String; let baseURL: String; let bundle: String
        let accounts: [Account]; let messages: Seed
    }
    private var fixture: Fixture!, app: XCUIApplication!
    private var prefix: String { "Messages " + fixture.runID }
    private var sent: String { prefix + " 你好" }
    private var response: String { prefix + " 收到回复" }
    private var quote: String { prefix + " 引用回复" }
    private var unsent: String { prefix + " 取消草稿" }
    private var row: XCUIElement { app.buttons["inbox-row-\(fixture.messages.connectionID)"] }
    private var composer: XCUIElement { app.textViews["chat-composer-field"] }
    private func element(_ id: String) -> XCUIElement { app.descendants(matching: .any).matching(identifier: id).firstMatch }
    override func setUpWithError() throws {
        continueAfterFailure = false
        try XCTSkipUnless(ProcessInfo.processInfo.environment["SIDESEAT_MESSAGES_EXECUTE"] == "1", "Messages execution waits for complete Calendar acceptance.")
    }
    override func tearDown() async throws { await MainActor.run { app?.terminate() } }

    func testOwnedConversationMessagesLocalStateAndCleanup() throws {
        try loadFixture(); try login("owner"); try messagesRoot()
        try tap(app.buttons["inbox-message-requests"])
        try require(element("message-requests-list").waitForExistence(timeout: 10) && element("message-requests-empty").exists,
            "Fresh accepted contacts must not fabricate a new greeting request.")
        try back(); try readNotification(expected: "未读")
        try capture("01-owner-notification-read"); try back()
        try phase("owner-shortcuts-and-notice-read")
        try openChat(search: true, peerRole: "peer")
        let sentID = try send(sent)
        try capture("02-owner-real-message"); try phase("owner-sent")

        try login("peer"); try messagesRoot()
        try require(row.waitForExistence(timeout: 20) && row.label.contains(sent), "The same inbox row must show the real incoming message.")
        try tap(row); try require(app.staticTexts[sent].firstMatch.waitForExistence(timeout: 20), "The participant must receive the owner's real message.")
        let responseID = try send(response)
        try capture("03-peer-received-and-replied"); try phase("peer-replied")

        try login("owner"); try messagesRoot(); try readNotification(expected: "已读"); try back()
        try openChat(search: true, peerRole: "peer")
        try require(app.staticTexts[sent].firstMatch.waitForExistence(timeout: 20) && app.staticTexts[response].firstMatch.waitForExistence(timeout: 20), "Both real messages must survive owner relogin.")
        try tap(app.buttons["direct-chat-actions"])
        try tap(app.buttons["direct-info-search"])
        try require(element("thread-search-sheet").waitForExistence(timeout: 10), "Open the current loaded-message search.")
        let search = app.searchFields.firstMatch
        try require(search.waitForExistence(timeout: 10), "The real chat search field must appear.")
        search.tap(); search.typeText(sent)
        let match = app.buttons["thread-search-row-\(sentID)"]
        try require(match.waitForExistence(timeout: 10) && !app.buttons["thread-search-row-\(responseID)"].exists, "Chat search must isolate the owner's actual message.")
        try capture("04-real-message-search"); try tap(match)
        try require(element("thread-search-sheet").waitForNonExistence(timeout: 15)
            && waitUntil { self.app.buttons["direct-chat-title"].isHittable }, "Selecting the search result returns to the same timeline.")
        try tap(app.buttons["direct-chat-title"], minimumHeight: 35.99)
        try require(element("participant-context-sheet").waitForExistence(timeout: 10), "The current title opens the participant summary.")
        try capture("05-participant-summary"); try tap(app.navigationBars.buttons.matching(NSPredicate(format: "label IN %@", ["完成", "Done"])).firstMatch, minimumHeight: 35.99)
        try require(!element("conversation-context-bar").exists, "A fresh contact has no invented intention or legacy plan context.")
        try phase("history-search-and-participant")

        try reply(to: responseID); try replaceComposer(unsent)
        try tap(app.buttons["chat-reply-cancel"])
        try require(!element("chat-reply-preview").exists, "Cancelling a quote must remove its reference.")
        try replaceComposer("")
        try require(!app.buttons["chat-composer-send"].isEnabled, "A cleared private draft cannot be submitted.")
        try login("owner"); try messagesRoot(); try openChat(search: false, peerRole: "peer")
        try require(composer.value as? String == "" || composer.value as? String == composer.placeholderValue,
            "The cancelled draft must stay unsent after restart; persistent draft recovery is not claimed.")
        try require(!element("chat-reply-preview").exists && !app.staticTexts[unsent].exists, "No cancelled quote or message may reappear.")
        try phase("draft-cancelled")
        try reply(to: responseID)
        let quoteID = try send(quote)
        try require(element("chat-quote-\(quoteID)").waitForExistence(timeout: 10), "The actual sent reply must contain a quote reference.")
        try capture("06-real-quoted-message"); try phase("quote-sent")
        try deleteMessage(quoteID, confirm: false)
        try require(app.staticTexts[quote].firstMatch.exists, "Cancelling message deletion must preserve its content.")
        try phase("delete-cancelled")
        try deleteMessage(quoteID, confirm: true)
        try phase("owner-quote-deleted")
        try backToInbox()
        try rowAction("pin")
        try require(waitUntil { (self.row.value as? String ?? "").contains("置顶") }, "Pin must update the actual owned conversation.")
        try phase("owner-pinned")
        try rowAction("read")
        try require(element("inbox-manual-unread-\(fixture.messages.connectionID)").exists, "Manual unread is a real local reminder.")
        try phase("owner-local-unread")
        try login("owner"); try messagesRoot()
        try require((row.value as? String ?? "").contains("置顶") && element("inbox-manual-unread-\(fixture.messages.connectionID)").exists,
            "Pin and the account's local unread reminder must survive relogin.")
        try readNotification(expected: "已读"); try back(); try capture("07-owner-persisted-local-state")
        try phase("owner-relaunched-local-state")

        try login("peer"); try messagesRoot()
        try require(!(row.value as? String ?? "").contains("置顶") && !element("inbox-manual-unread-\(fixture.messages.connectionID)").exists,
            "The other account must not inherit pin or local reminder state.")
        try readNotification(expected: "未读"); try capture("08-peer-independent-notification-read"); try back()
        try phase("peer-account-isolated")
        try openChat(search: false, peerRole: "owner")
        try require(element("chat-tombstone-\(quoteID)").waitForExistence(timeout: 20), "The other participant must see the actual deleted quote.")
        try deleteMessage(responseID, confirm: true)
        try phase("peer-reply-deleted")

        try login("owner"); try messagesRoot()
        try require(element("inbox-manual-unread-\(fixture.messages.connectionID)").exists, "Reading on another account must not clear the owner's local reminder.")
        try openChat(search: false, peerRole: "peer")
        try require(element("chat-tombstone-\(responseID)").waitForExistence(timeout: 20), "The owner must receive the other participant's deletion.")
        try backToInbox()
        try require(!element("inbox-manual-unread-\(fixture.messages.connectionID)").exists, "Opening this conversation clears only the owner's reminder.")
        try phase("owner-reminder-cleared")
        try openChat(search: false, peerRole: "peer"); try deleteMessage(sentID, confirm: true); try backToInbox()
        try rowAction("pin")
        try require(waitUntil { !(self.row.value as? String ?? "").contains("置顶") }, "Restore the owned inbox pin preference.")
        try capture("09-cleaned-owned-messages-and-restored-inbox")
        try phase("messages-cleaned"); try phase("complete")
    }

    private func loadFixture() throws {
        try require(ProcessInfo.processInfo.environment["SIMULATOR_UDID"] == nil, "Use the default physical iPhone 14 Plus.")
        let raw = ProcessInfo.processInfo.environment["SIDESEAT_MESSAGES_FIXTURE_JSON"] ?? ""
        try XCTSkipUnless(!raw.isEmpty, "Supply the fresh two-account Messages fixture.")
        fixture = try JSONDecoder().decode(Fixture.self, from: raw.hasPrefix("{") ? Data(raw.utf8) : Data(contentsOf: URL(fileURLWithPath: raw)))
        try require(fixture.kind == "five-roots-live" && fixture.schemaVersion == 1 && fixture.baseURL == "https://api.sideseat.de"
            && fixture.bundle == "app.sideseat.mobile.preview", "Use only the dedicated production factory cohort.")
        try require(fixture.runID.range(of: "^[a-f0-9]{12}$", options: .regularExpression) != nil && fixture.accounts.count == 2
            && Set(fixture.accounts.map(\.role)) == ["owner", "peer"] && Set(fixture.accounts.map(\.id)).count == 2, "Use two unique owned roles.")
        try require(fixture.accounts.allSatisfy { $0.identifier == "e2e_roots_\($0.role)_\(fixture.runID)" }, "No ordinary account is allowed.")
        let m = fixture.messages
        let ids = [m.connectionID, m.seedOwnerMessageID, m.seedPeerMessageID]
        try require(m.schemaVersion == 1 && m.runID == fixture.runID && Self.parsePreparedAt(m.preparedAt) != nil
            && ids.allSatisfy { $0.range(of: "^c[a-z0-9]{20,32}$", options: .regularExpression) != nil }
            && m.seedOwnerMessageID != m.seedPeerMessageID && m.seedOwnerText == prefix + " seed owner" && m.seedPeerText == prefix + " seed peer"
            && m.notificationTitle == prefix + " 通知前提" && m.notificationLocation == prefix + " QA"
            && m.notificationToken.range(of: "^[A-Za-z0-9_-]{32}$", options: .regularExpression) != nil, "Validate every explicit Messages precondition.")
    }
    private func login(_ role: String) throws {
        let account = try XCTUnwrap(fixture.accounts.first { $0.role == role })
        app?.terminate(); app = XCUIApplication(bundleIdentifier: fixture.bundle)
        app.launchArguments = ["--ui-testing-signed-out", "--ui-testing-ephemeral-credentials", "--ui-testing-skip-tutorial",
            "--ui-testing-language=zh-Hans", "--ui-testing-appearance=light", "-UIPreferredContentSizeCategoryName", "UICTContentSizeCategoryL"]
        app.launchEnvironment = [:]; app.launch()
        let name = app.textFields["login-identifier"]
        try require(name.waitForExistence(timeout: 25), "Use the real form login.")
        name.tap(); name.typeText(account.identifier)
        let password = app.secureTextFields["login-password"]
        password.tap(); password.typeText(account.password); app.buttons["login-submit"].tap()
        let deadline = Date().addingTimeInterval(35)
        var ready = false
        repeat {
            ready = app.state == .runningForeground && !name.exists && !password.exists
                && app.tabBars.firstMatch.exists && app.tabBars.firstMatch.buttons.count == 5
            if ready { break }
            RunLoop.current.run(until: Date().addingTimeInterval(0.2))
        } while Date() < deadline
        try require(ready, "The owned account must leave both login inputs and reach the real five-tab shell.")
    }
    private func messagesRoot() throws {
        let tab = app.tabBars.buttons.element(boundBy: 3)
        try require(tab.label == "消息", "The current Messages root is tab index 3.")
        try tap(tab)
        try require(app.buttons["inbox-notifications"].waitForExistence(timeout: 20) && row.waitForExistence(timeout: 20), "The live Messages root must load the owned conversation.")
    }
    private func readNotification(expected: String) throws {
        try tap(app.buttons["inbox-notifications"])
        let item = app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH %@", "notification-shared:\(fixture.messages.notificationToken):")).firstMatch
        try require(item.waitForExistence(timeout: 20) && item.label.contains(fixture.messages.notificationTitle), "A real cancelled-plan domain snapshot must supply the notification.")
        try require(item.value as? String == expected, "Notification read state is local to this account on this device.")
        if expected == "未读" {
            try tap(app.buttons["notifications-read-all"], minimumHeight: 35.99)
            try require(item.value as? String == "已读", "Read all must update the actual local notification.")
        }
        try require(!app.buttons["notifications-read-all"].isEnabled, "The only owned notification is now read.")
    }
    private func openChat(search: Bool, peerRole: String) throws {
        if search {
            let peer = try XCTUnwrap(fixture.accounts.first { $0.role == peerRole })
            let field = app.searchFields["inbox-search-field"]
            try tap(field, minimumHeight: nil); field.typeText(peer.displayName)
            try require(row.waitForExistence(timeout: 10), "Name search must retain the same owned connection.")
        }
        try tap(row)
        try require(element("direct-chat").waitForExistence(timeout: 20) && composer.waitForExistence(timeout: 15), "Open the real direct timeline.")
    }
    private var messageIDs: Set<String> {
        Set(app.descendants(matching: .any).matching(NSPredicate(format: "identifier BEGINSWITH 'chat-bubble-'"))
            .allElementsBoundByIndex.map { String($0.identifier.dropFirst("chat-bubble-".count)) }.filter { !$0.hasPrefix("local-") })
    }
    private func send(_ value: String) throws -> String {
        let before = messageIDs; try replaceComposer(value); try tap(app.buttons["chat-composer-send"])
        try require(waitUntil { self.messageIDs.subtracting(before).count == 1 && self.app.staticTexts[value].firstMatch.exists }, "A real server-backed message must replace the local optimistic send.")
        return try XCTUnwrap(messageIDs.subtracting(before).first)
    }
    private func reply(to id: String) throws {
        try revealMessage(id); element("chat-bubble-\(id)").press(forDuration: 0.8)
        try tap(app.buttons["chat-reply-\(id)"])
        try require(element("chat-reply-preview").exists, "The current reply reference must appear in the composer.")
    }
    private func deleteMessage(_ id: String, confirm: Bool) throws {
        try revealMessage(id); element("chat-bubble-\(id)").press(forDuration: 0.8)
        try tap(app.buttons["chat-delete-\(id)"])
        try require(element("chat-delete-prompt").waitForExistence(timeout: 10), "Deletion must keep its current confirmation.")
        try tap(app.buttons[confirm ? "chat-delete-confirm" : "chat-delete-cancel"])
        if confirm { try require(element("chat-tombstone-\(id)").waitForExistence(timeout: 20), "Delete only this account's actual message.") }
    }
    private func revealMessage(_ id: String) throws {
        let bubble = element("chat-bubble-\(id)"), scroll = app.scrollViews["chat-message-list"]
        for _ in 0..<10 where !bubble.isHittable { scroll.swipeDown(velocity: .slow) }
        try require(bubble.exists && bubble.isHittable, "The exact message must be reachable before its contextual action.")
    }
    private func replaceComposer(_ text: String) throws {
        try tap(composer, minimumHeight: nil)
        let old = composer.value as? String ?? ""
        if !old.isEmpty && old != composer.placeholderValue {
            composer.typeKey("a", modifierFlags: .command)
            composer.typeText(XCUIKeyboardKey.delete.rawValue)
            let deadline = Date().addingTimeInterval(2)
            while Date() < deadline {
                let value = composer.value as? String ?? ""
                if composer.exists && (value.isEmpty || value == composer.placeholderValue) { break }
                RunLoop.current.run(until: Date().addingTimeInterval(0.1))
            }
        }
        let value = composer.value as? String ?? ""
        try require(composer.exists && (value.isEmpty || value == composer.placeholderValue), "Clear all previous text before writing.")
        if !text.isEmpty { composer.typeText(text); try require(composer.value as? String == text, "The real composer must contain the exact intended text.") }
    }
    private func backToInbox() throws {
        try back()
        if app.buttons["inbox-search-cancel"].isHittable { try tap(app.buttons["inbox-search-cancel"]) }
        try require(row.waitForExistence(timeout: 15), "Return to the same owned inbox row.")
    }
    private func rowAction(_ action: String) throws {
        row.press(forDuration: 0.8)
        try require(!app.buttons["inbox-row-\(fixture.messages.connectionID)-hide-menu"].exists,
            "Direct chats do not expose the group/course Hide action.")
        try tap(app.buttons["inbox-row-\(fixture.messages.connectionID)-\(action)-menu"])
    }
    private func back() throws { try tap(app.navigationBars.buttons.element(boundBy: 0), minimumHeight: 35.99) }
    private func tap(_ item: XCUIElement, minimumHeight: CGFloat? = 43.99) throws {
        try require(item.waitForExistence(timeout: 15) && item.isHittable && item.isEnabled, "The real owned UI control must be reachable.")
        if let minimumHeight { try require(item.frame.height >= minimumHeight, "Keep actual touch targets complete.") }
        item.tap()
    }
    private func waitUntil(_ condition: () -> Bool) -> Bool {
        let until = Date().addingTimeInterval(30)
        repeat { if condition() { return true }; RunLoop.current.run(until: Date().addingTimeInterval(0.2)) } while Date() < until
        return condition()
    }
    private func require(_ condition: Bool, _ message: String) throws {
        guard condition else {
            if let app, app.state == .runningForeground, !app.textFields["login-identifier"].exists, !app.secureTextFields.firstMatch.exists {
                let tree = XCTAttachment(string: app.debugDescription); tree.name = "messages-private-failure-AX"; tree.lifetime = .keepAlways; add(tree)
                let screen = XCTAttachment(screenshot: app.screenshot()); screen.name = "messages-private-failure-screen"; screen.lifetime = .keepAlways; add(screen)
            }
            XCTFail(message); throw NSError(domain: "FiveRootMessages", code: 1, userInfo: [NSLocalizedDescriptionKey: message])
        }
    }
    private static func parsePreparedAt(_ value: String) -> Date? {
        let fractional = ISO8601DateFormatter()
        fractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return fractional.date(from: value) ?? ISO8601DateFormatter().date(from: value)
    }
    private func phase(_ value: String) throws {
        print("MESSAGES_PHASE \(value)"); fflush(stdout)
        try FiveRootQAReadBarrier.wait(for: value)
    }
    private func capture(_ value: String) throws {
        try require(!app.textFields["login-identifier"].exists && !app.secureTextFields.firstMatch.exists, "Never capture credentials.")
        let image = XCTAttachment(screenshot: app.screenshot()); image.name = "five-root-messages-" + value; image.lifetime = .keepAlways; add(image)
    }
}
