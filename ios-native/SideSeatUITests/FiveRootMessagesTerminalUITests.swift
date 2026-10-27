import XCTest
import Darwin

/// Independent, disposable local cohorts for irreversible chat actions.
@MainActor final class FiveRootMessagesTerminalUITests: XCTestCase {
    private struct Account: Decodable {
        let role: String; let id: String; let identifier: String; let password: String; let displayName: String
    }
    private struct Seed: Decodable {
        let schemaVersion: Int; let runID: String; let caseKind: String; let preparedAt: String
        let connectionID: String; let seedOwnerMessageID: String; let seedPeerMessageID: String
        let seedOwnerText: String; let seedPeerText: String; let remark: String; let reportDetails: String
    }
    private struct Fixture: Decodable {
        let kind: String; let schemaVersion: Int; let runID: String; let baseURL: String; let bundle: String
        let accounts: [Account]; let terminal: Seed
    }
    private var fixture: Fixture!, app: XCUIApplication!
    private var row: XCUIElement { app.buttons["inbox-row-\(fixture.terminal.connectionID)"] }
    private func element(_ id: String) -> XCUIElement { app.descendants(matching: .any).matching(identifier: id).firstMatch }

    override func setUpWithError() throws {
        continueAfterFailure = false
        try XCTSkipUnless(ProcessInfo.processInfo.environment["SIDESEAT_MESSAGES_TERMINAL_EXECUTE"] == "1",
                          "Terminal flows require an explicitly prepared independent local cohort.")
    }
    override func tearDown() async throws { await MainActor.run { app?.terminate() } }

    func testRemarkMessageReportAndBlock() throws {
        try loadFixture(caseKind: "safety"); try login("owner"); try messagesRoot(expectingConversation: true)
        try openChat(); try openInfo(); try phase("baseline")
        try tap(app.buttons["direct-info-remark"])
        try replace(app.textFields["direct-remark-field"], with: fixture.terminal.remark)
        try back(); try require(element("direct-chat-info").waitForExistence(timeout: 10), "Cancel by returning from the unsaved remark editor.")
        try phase("remark-cancelled")
        try tap(app.buttons["direct-info-remark"])
        try replace(app.textFields["direct-remark-field"], with: fixture.terminal.remark)
        try tap(app.buttons["direct-remark-save"], minimumHeight: 35.99)
        try require(element("direct-chat-info").waitForExistence(timeout: 15)
                    && app.buttons["direct-info-remark"].label.contains(fixture.terminal.remark), "Saving must update the private remark in chat info.")
        try capture("01-saved-private-remark"); try phase("remark-saved")
        try login("owner"); try messagesRoot(expectingConversation: true)
        try require(row.label.contains(fixture.terminal.remark), "The owner's saved remark must survive relogin in the inbox.")
        try openChat(); try openInfo(); try tap(app.buttons["direct-info-remark"])
        try require(app.textFields["direct-remark-field"].value as? String == fixture.terminal.remark, "The editor must reload the full saved remark.")
        try capture("02-owner-remark-reloaded"); try phase("remark-owner-relaunched")
        try login("peer"); try messagesRoot(expectingConversation: true)
        try require(!row.label.contains(fixture.terminal.remark), "The peer must not inherit another account's private remark.")
        try openChat(); try openInfo(); try tap(app.buttons["direct-info-remark"])
        try require(isEmpty(app.textFields["direct-remark-field"]), "The peer's own remark remains empty.")
        try capture("03-peer-private-remark-isolated"); try phase("remark-peer-isolated")
        try login("owner"); try messagesRoot(expectingConversation: true); try openChat(); try openInfo()
        try tap(app.buttons["direct-info-remark"]); try replace(app.textFields["direct-remark-field"], with: "")
        try tap(app.buttons["direct-remark-save"], minimumHeight: 35.99)
        try require(element("direct-chat-info").waitForExistence(timeout: 15)
                    && !app.buttons["direct-info-remark"].label.contains(fixture.terminal.remark), "Clearing must restore the original display name.")
        try phase("remark-cleared"); try back()
        try openReport(); try replace(element("chat-report-details"), with: fixture.terminal.reportDetails)
        try tap(app.buttons["chat-report-cancel"], minimumHeight: 35.99)
        try require(element("chat-report-sheet").waitForNonExistence(timeout: 15), "Cancel the message report without submission.")
        try phase("report-cancelled")
        try openReport(); try replace(element("chat-report-details"), with: fixture.terminal.reportDetails)
        try capture("04-message-report-before-submit")
        try tap(app.buttons["chat-report-send"], minimumHeight: 35.99)
        try require(element("chat-report-sheet").waitForNonExistence(timeout: 20), "Only the actual successful report dismisses its form.")
        try phase("report-sent")
        try openInfo(); try terminalAction("block", confirm: false)
        try require(element("direct-chat-info").exists, "Cancelling block must preserve chat info and the active conversation.")
        try phase("block-cancelled")
        try terminalAction("block", confirm: true); try awaitClosedInbox()
        try capture("05-blocked-conversation-removed"); try phase("block-confirmed")
        try login("owner"); try messagesRoot(expectingConversation: false); try phase("block-owner-relaunched")
        try login("peer"); try messagesRoot(expectingConversation: false)
        try capture("06-peer-blocked-conversation-absent"); try phase("block-peer-relaunched"); try phase("complete")
    }

    func testEndConversationCancelConfirmAndRelogin() throws {
        try loadFixture(caseKind: "end"); try login("owner"); try messagesRoot(expectingConversation: true)
        try openChat(); try openInfo(); try phase("baseline")
        try terminalAction("end", confirm: false)
        try require(element("direct-chat-info").exists, "Cancelling End chat must preserve the conversation.")
        try capture("01-end-cancel-preserves-conversation"); try phase("end-cancelled")
        try terminalAction("end", confirm: true); try awaitClosedInbox()
        try capture("02-ended-conversation-removed"); try phase("end-confirmed")
        try login("owner"); try messagesRoot(expectingConversation: false); try phase("end-owner-relaunched")
        try login("peer"); try messagesRoot(expectingConversation: false)
        try capture("03-peer-ended-conversation-absent"); try phase("end-peer-relaunched"); try phase("complete")
    }

    private func loadFixture(caseKind: String) throws {
        try require(ProcessInfo.processInfo.environment["SIMULATOR_UDID"] == "AEBD816E-53A7-4012-B76A-FEF82CF02A6B", "Use only the owned Simulator; never spoof device identity.")
        try require(ProcessInfo.processInfo.environment["SIDESEAT_MESSAGES_TERMINAL_CASE"] == caseKind, "Execute exactly one selected independent terminal case.")
        let raw = ProcessInfo.processInfo.environment["SIDESEAT_MESSAGES_TERMINAL_FIXTURE_JSON"] ?? ""
        try require(raw.hasPrefix("{"), "Inject only the exact private owned fixture payload.")
        fixture = try JSONDecoder().decode(Fixture.self, from: Data(raw.utf8))
        try require(fixture.kind == "five-roots-live" && fixture.schemaVersion == 1 && fixture.baseURL == "http://127.0.0.1:3344"
                    && fixture.bundle == "app.sideseat.mobile.preview", "Terminal DB oracles use only the explicitly owned local API.")
        try require(fixture.runID.range(of: "^[a-f0-9]{12}$", options: .regularExpression) != nil && fixture.accounts.count == 2
                    && Set(fixture.accounts.map(\.role)) == ["owner", "peer"] && Set(fixture.accounts.map(\.id)).count == 2
                    && fixture.accounts.allSatisfy { $0.identifier == "e2e_roots_\($0.role)_\(fixture.runID)" }, "Only two fresh internal actors are authorized.")
        let m = fixture.terminal, prefix = "Terminal " + fixture.runID
        try require(m.schemaVersion == 1 && m.runID == fixture.runID && m.caseKind == caseKind && !m.preparedAt.isEmpty
                    && [m.connectionID, m.seedOwnerMessageID, m.seedPeerMessageID].allSatisfy { $0.range(of: "^c[a-z0-9]{20,32}$", options: .regularExpression) != nil }
                    && m.seedOwnerMessageID != m.seedPeerMessageID && m.seedOwnerText == prefix + " seed owner"
                    && m.seedPeerText == prefix + " seed peer" && m.remark == "QA friend " + fixture.runID
                    && m.reportDetails == "Terminal report " + fixture.runID, "Validate every terminal prerequisite without API progress writes.")
    }
    private func login(_ role: String) throws {
        let account = try XCTUnwrap(fixture.accounts.first { $0.role == role })
        app?.terminate(); app = XCUIApplication(bundleIdentifier: fixture.bundle)
        app.launchArguments = ["--ui-testing-signed-out", "--ui-testing-ephemeral-credentials", "--ui-testing-skip-tutorial", "--ui-testing-local-api",
            "--ui-testing-language=zh-Hans", "--ui-testing-appearance=light", "-UIPreferredContentSizeCategoryName", "UICTContentSizeCategoryL"]
        app.launchEnvironment = ["SIDESEAT_API_BASE_URL_OVERRIDE": fixture.baseURL]; app.launch()
        let name = app.textFields["login-identifier"], password = app.secureTextFields["login-password"]
        try require(name.waitForExistence(timeout: 25), "Use the real login form.")
        name.tap(); name.typeText(account.identifier); password.tap(); password.typeText(account.password); app.buttons["login-submit"].tap()
        try require(waitUntil(timeout: 35) { self.app.state == .runningForeground && !name.exists && !password.exists
            && self.app.tabBars.firstMatch.exists && self.app.tabBars.firstMatch.buttons.count == 5 }, "The owned actor must reach the real five-tab shell.")
    }
    private func messagesRoot(expectingConversation: Bool) throws {
        let tab = app.tabBars.buttons.element(boundBy: 3)
        try require(tab.label == "消息", "Use the actual Messages root."); try tap(tab)
        try require(app.buttons["inbox-notifications"].waitForExistence(timeout: 20), "The real inbox must load.")
        if expectingConversation { try require(row.waitForExistence(timeout: 20), "The explicit owned contact must appear.") }
        else { try awaitClosedInbox() }
    }
    private func openChat() throws {
        try tap(row); try require(element("direct-chat").waitForExistence(timeout: 20)
            && app.staticTexts[fixture.terminal.seedPeerText].firstMatch.waitForExistence(timeout: 15), "Open the exact real conversation and its seeded peer message.")
    }
    private func openInfo() throws {
        try tap(app.buttons["direct-chat-actions"])
        try require(element("direct-chat-info").waitForExistence(timeout: 15), "Open the current actual chat-info page.")
    }
    private func openReport() throws {
        let bubble = element("chat-bubble-\(fixture.terminal.seedPeerMessageID)")
        try require(bubble.waitForExistence(timeout: 15) && bubble.isHittable, "Report only the exact owned peer message.")
        bubble.press(forDuration: 0.8); try tap(app.buttons["chat-report-\(fixture.terminal.seedPeerMessageID)"])
        try require(element("chat-report-sheet").waitForExistence(timeout: 15), "The message report form must open.")
    }
    private func terminalAction(_ action: String, confirm: Bool) throws {
        try tap(app.buttons["direct-info-\(action)"])
        try require(element("direct-info-\(action)-prompt").waitForExistence(timeout: 10), "An irreversible action requires its existing confirmation.")
        try capture("prompt-\(action)-\(confirm ? "confirm" : "cancel")")
        try tap(app.buttons["direct-info-\(confirm ? "confirm" : "cancel")-\(action)"])
        try require(element("direct-info-\(action)-prompt").waitForNonExistence(timeout: 15), "The selected confirmation action must dismiss its prompt.")
    }
    private func awaitClosedInbox() throws {
        try require(waitUntil { self.app.buttons["inbox-notifications"].isHittable && !self.row.exists
            && !self.element("direct-chat").exists && !self.element("direct-chat-info").exists }, "The terminal conversation must disappear and return to the loaded inbox.")
    }
    private func isEmpty(_ field: XCUIElement) -> Bool {
        let value = field.value as? String ?? ""; return value.isEmpty || value == field.placeholderValue
    }
    private func replace(_ field: XCUIElement, with text: String) throws {
        try tap(field, minimumHeight: nil)
        if !isEmpty(field) {
            if field.elementType == .textField {
                let old = field.value as? String ?? ""
                field.coordinate(withNormalizedOffset: CGVector(dx: 1, dy: 0.5))
                    .withOffset(CGVector(dx: -8, dy: 0)).tap()
                field.typeText(String(repeating: XCUIKeyboardKey.delete.rawValue, count: old.count))
            } else {
                field.typeKey("a", modifierFlags: .command)
                field.typeText(XCUIKeyboardKey.delete.rawValue)
            }
            let deadline = Date().addingTimeInterval(2)
            while Date() < deadline {
                if field.exists && isEmpty(field) { break }
                RunLoop.current.run(until: Date().addingTimeInterval(0.1))
            }
        }
        try require(field.exists && isEmpty(field), "Clear all previous text before typing.")
        if !text.isEmpty { field.typeText(text); try require(field.value as? String == text, "The full intended text must remain intact.") }
    }
    private func back() throws { try tap(app.navigationBars.buttons.element(boundBy: 0), minimumHeight: 35.99) }
    private func tap(_ item: XCUIElement, minimumHeight: CGFloat? = 43.99) throws {
        try require(item.waitForExistence(timeout: 15) && item.isHittable && item.isEnabled, "Reach the real enabled control before tapping.")
        if let minimumHeight { try require(item.frame.height >= minimumHeight, "Keep the actual touch target intact.") }; item.tap()
    }
    private func waitUntil(timeout: TimeInterval = 30, _ condition: () -> Bool) -> Bool {
        let until = Date().addingTimeInterval(timeout)
        repeat { if condition() { return true }; RunLoop.current.run(until: Date().addingTimeInterval(0.2)) } while Date() < until
        return condition()
    }
    private func require(_ condition: Bool, _ message: String) throws {
        guard condition else {
            if let app, app.state == .runningForeground, !app.textFields["login-identifier"].exists, !app.secureTextFields.firstMatch.exists {
                let tree = XCTAttachment(string: app.debugDescription); tree.name = "terminal-private-failure-AX"; tree.lifetime = .keepAlways; add(tree)
                try capture("terminal-private-failure-screen")
            }
            XCTFail(message); throw NSError(domain: "FiveRootMessagesTerminal", code: 1, userInfo: [NSLocalizedDescriptionKey: message])
        }
    }
    private func capture(_ name: String) throws {
        let attachment = XCTAttachment(screenshot: app.screenshot()); attachment.name = name; attachment.lifetime = .keepAlways; add(attachment)
    }
    private func phase(_ name: String) throws {
        print("MESSAGES_TERMINAL_PHASE \(name)"); fflush(stdout); try FiveRootQAReadBarrier.wait(for: name)
    }
}
