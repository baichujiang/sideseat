import XCTest
import Darwin

/// Opt-in real account tests. The runner keeps the fixture and result bundle private.
/// No authenticated-session, matching, intention or recommendation fixture is used.
@MainActor final class FiveRootTogetherLiveUITests: XCTestCase {
    private struct Account: Decodable {
        let role: String
        let identifier: String
        let password: String
        let id: String
    }

    private struct Fixture: Decodable {
        let baseURL: String
        let runID: String
        let accounts: [Account]
        let bundle: String?
        let activityTitle: String?
        let lifecycleTitle: String?
        let editedTitle: String?
        let pausedEditedTitle: String?
        let greeting: String?
        let reply: String?
    }

    private struct ObserverState: Decodable {
        let opportunityID: String?
    }

    private var app: XCUIApplication!
    private var fixture: Fixture!
    private var fixtureURL: URL!
    private var section = "recommendations"
    private let environment = ProcessInfo.processInfo.environment

    override func setUpWithError() throws {
        continueAfterFailure = false
        let path = environment["SIDESEAT_FIVE_ROOT_FIXTURE"] ?? ""
        try XCTSkipUnless(!path.isEmpty, "Set SIDESEAT_FIVE_ROOT_FIXTURE to the private real-account fixture.")
        fixtureURL = URL(fileURLWithPath: path)
        fixture = try JSONDecoder().decode(Fixture.self, from: Data(contentsOf: fixtureURL))
        XCTAssertNotNil(URL(string: fixture.baseURL)?.host, "The runner must supply an explicit API base URL.")
        XCTAssertEqual(Set(fixture.accounts.map(\.role)), Set(["owner", "peer"]))
        XCTAssertEqual(Set(fixture.accounts.map(\.id)).count, 2, "The two participants must be different accounts.")
    }

    override func tearDown() async throws {
        await MainActor.run { app?.terminate() }
    }

    func test01EditorLifecyclePersistsAndPreservesPausedState() throws {
        try requireVerifiedRun()
        let title = fixture.lifecycleTitle ?? "五页同行编辑咖啡"
        let editedTitle = fixture.editedTitle ?? title + " 已修改"
        let pausedEditedTitle = fixture.pausedEditedTitle ?? title + " 暂停编辑"
        login("owner")
        openTogether()
        openNewIntention()
        XCTAssertTrue(app.buttons["intent-topic-coffee"].exists)
        XCTAssertTrue(app.buttons["intent-editor-save"].isEnabled,
            "The default coffee category is valid; its activity description is optional.")
        replaceText(activityField, with: String(repeating: "x", count: 81))
        XCTAssertTrue(waitUntil { !self.app.buttons["intent-editor-save"].isEnabled })
        XCTAssertTrue(element("intent-editor-issue").exists,
            "Descriptions over the actual 80 UTF-16 unit limit must show validation and prevent publishing.")
        replaceText(activityField, with: title + " 草稿")
        XCTAssertTrue(waitUntil { self.app.buttons["intent-editor-save"].isEnabled })
        cancelEditor()
        phase("lifecycle-draft-cancelled")

        login("owner")
        openTogether()
        openNewIntention()
        XCTAssertTrue(element("intent-editor-draft-restored").waitForExistence(timeout: 8))
        XCTAssertEqual(activityField.value as? String, title + " 草稿")
        replaceText(activityField, with: title)
        saveEditor()
        let intentID = ownIntentionID(titled: title)
        assertStatus(intentID, "正在寻找")
        capture("lifecycle-published")
        phase("lifecycle-published")

        editIntention(intentID, title: editedTitle)
        XCTAssertTrue(ownEdit(intentID).label.contains(editedTitle))
        phase("lifecycle-edited")
        performMenuAction("toggle-pause", intentID: intentID)
        assertStatus(intentID, "已暂停")
        phase("lifecycle-paused")
        editIntention(intentID, title: pausedEditedTitle)
        assertStatus(intentID, "已暂停")
        capture("lifecycle-paused-edit-keeps-status")
        phase("lifecycle-paused-edited")
        performMenuAction("toggle-pause", intentID: intentID)
        assertStatus(intentID, "正在寻找")
        phase("lifecycle-resumed")

        performMenuAction("share", intentID: intentID)
        cancelShareSheet(intentID: intentID)
        phase("lifecycle-share-cancelled")
        performMenuAction("delete", intentID: intentID)
        let prompt = element("weekly-intent-delete-prompt-\(intentID)")
        XCTAssertTrue(element("weekly-intent-delete-prompt-\(intentID)").waitForExistence(timeout: 5))
        app.buttons["weekly-intent-delete-cancel-\(intentID)"].tap()
        XCTAssertTrue(prompt.waitForNonExistence(timeout: 5))
        XCTAssertTrue(ownEdit(intentID).exists)
        phase("lifecycle-delete-cancelled")

        login("owner")
        openTogether()
        showOwnIntention(intentID)
        XCTAssertTrue(ownEdit(intentID).label.contains(pausedEditedTitle))
        assertStatus(intentID, "正在寻找")
        capture("lifecycle-reloaded")
        phase("lifecycle-reloaded")
        performMenuAction("delete", intentID: intentID)
        XCTAssertTrue(prompt.waitForExistence(timeout: 5))
        app.buttons["weekly-intent-delete-confirm-\(intentID)"].tap()
        XCTAssertTrue(ownEdit(intentID).waitForNonExistence(timeout: 15))
        capture("lifecycle-deleted")
        phase("lifecycle-deleted")
    }

    func test02TwoPeopleDiscoverSaveGreetReplyAndKeepOneChat() throws {
        try requireVerifiedRun()
        let title = fixture.activityTitle ?? "五页同行真实闭环"
        let greeting = fixture.greeting ?? "五页同行首条招呼"
        let reply = fixture.reply ?? "五页同行收到回复"
        login("owner")
        openTogether()
        publishCoffee(title)
        phase("owner-published")

        login("peer")
        openTogether()
        publishCoffee(title)
        phase("peer-published")
        // A read-only DB observer identifies this exact pair, never an arbitrary card.
        let opportunityID = try observedOpportunityID()
        let bookmarkID = "mutual-opportunity-bookmark-\(opportunityID)"
        let bookmark = app.buttons[bookmarkID]
        if !bookmark.waitForExistence(timeout: 15) {
            let more = app.buttons["together-find-more"]
            if more.exists { reveal(more); more.tap() }
        }
        XCTAssertTrue(bookmark.waitForExistence(timeout: 25), "The real matching/discovery flow must expose the two fixture participants.")
        let profile = app.buttons["mutual-opportunity-profile-\(opportunityID)"]
        reveal(profile)
        capture("recommendation")
        profile.tap()
        XCTAssertTrue(waitUntil { self.element("public-profile").exists || self.element("together-private-profile").exists })
        capture("peer-profile")
        let profileDone = app.buttons["together-profile-done"]
        XCTAssertTrue(profileDone.waitForExistence(timeout: 8))
        profileDone.tap()
        XCTAssertTrue(profile.waitForExistence(timeout: 8))
        phase("profile-returned")

        reveal(bookmark)
        XCTAssertEqual(bookmark.label, "收藏意愿")
        let originalPosition = bookmark.frame
        bookmark.tap()
        XCTAssertTrue(waitUntil { bookmark.exists && bookmark.label == "取消收藏" })
        XCTAssertLessThanOrEqual(abs(bookmark.frame.minY - originalPosition.minY), 3,
            "Saving keeps this recommendation in place while browsing.")
        capture("bookmarked-in-place")
        phase("bookmarked")
        selectSection("bookmarks")
        XCTAssertTrue(bookmark.waitForExistence(timeout: 10))
        reveal(bookmark)
        XCTAssertEqual(bookmark.label, "取消收藏")
        capture("saved-card")
        selectSection("recommendations")
        XCTAssertTrue(bookmark.waitForExistence(timeout: 10))
        reveal(bookmark)
        XCTAssertEqual(bookmark.label, "取消收藏")
        phase("bookmark-roundtrip")

        let messageID = "mutual-opportunity-message-\(opportunityID)"
        let message = app.buttons[messageID]
        reveal(message)
        message.tap()
        let body = element("opportunity-message-body")
        XCTAssertTrue(body.waitForExistence(timeout: 8))
        XCTAssertFalse(app.buttons["opportunity-message-submit"].isEnabled)
        replaceText(body, with: greeting)
        cancelPresentedForm()
        XCTAssertTrue(body.waitForNonExistence(timeout: 8))
        capture("greeting-cancelled")
        phase("composer-cancelled")

        // Relaunch with real form login also checks that a cancelled private draft survives.
        login("peer")
        openTogether()
        selectSection("bookmarks")
        XCTAssertTrue(message.waitForExistence(timeout: 12))
        reveal(message)
        message.tap()
        XCTAssertTrue(body.waitForExistence(timeout: 8))
        XCTAssertEqual(body.value as? String, greeting)
        let send = app.buttons["opportunity-message-submit"]
        XCTAssertTrue(send.isEnabled)
        send.tap()
        XCTAssertTrue(element("intention-chat-waiting").waitForExistence(timeout: 20))
        XCTAssertEqual(element("intention-chat-first-message").label, greeting)
        XCTAssertFalse(app.buttons["chat-composer-send"].exists)
        capture("sender-waiting-for-reply")
        phase("greeting-sent")

        login("owner")
        openTab(["消息", "Messages"])
        let requests = app.buttons["inbox-message-requests"]
        XCTAssertTrue(requests.waitForExistence(timeout: 12))
        requests.tap()
        XCTAssertTrue(element("message-requests-list").waitForExistence(timeout: 10))
        let request = app.buttons["message-request-\(opportunityID)"]
        XCTAssertTrue(request.waitForExistence(timeout: 20))
        request.tap()
        let replyField = app.textViews["chat-composer-field"]
        XCTAssertTrue(replyField.waitForExistence(timeout: 10))
        XCTAssertEqual(element("intention-chat-first-message").label, greeting)
        replaceText(replyField, with: reply)
        app.buttons["chat-composer-send"].tap()
        assertChat(greeting: greeting, reply: reply, title: title)
        capture("receiver-replied-chat-context")
        phase("reply-sent")

        login("peer")
        openTogether()
        selectSection("bookmarks")
        let viewChat = app.buttons["mutual-opportunity-open-\(opportunityID)"]
        XCTAssertTrue(viewChat.waitForExistence(timeout: 15))
        reveal(viewChat)
        viewChat.tap()
        assertChat(greeting: greeting, reply: reply, title: title)
        capture("sender-same-chat-context")
        returnToTogether()
        selectSection("bookmarks")
        XCTAssertTrue(viewChat.waitForExistence(timeout: 12))
        reveal(viewChat)
        viewChat.tap()
        assertChat(greeting: greeting, reply: reply, title: title)
        XCTAssertFalse(element("plan-create-sheet").exists)
        XCTAssertFalse(element("unified-plan-detail").exists)
        capture("saved-view-chat-roundtrip")
        phase("chat-roundtrip")
    }

    private func requireVerifiedRun() throws {
        try XCTSkipUnless(fixture.baseURL == "http://127.0.0.1:3344",
            "Verified business cases run only against the owned local QA API.")
        try XCTSkipUnless(fixture.runID.range(of: "^[a-f0-9]{12}$", options: .regularExpression) != nil
            && fixture.accounts.allSatisfy({ $0.identifier == "e2e_roots_\($0.role)_\(fixture.runID)" }),
            "Only this run's two internally named QA accounts are accepted.")
    }

    private func login(_ role: String, requiresShell: Bool = true) {
        let account = fixture.accounts.first { $0.role == role }!
        app?.terminate()
        let bundle = environment["SIDESEAT_FIVE_ROOT_QA_BUNDLE"]
            ?? environment["SIDESEAT_PLAN_PRESENTATION_QA_BUNDLE"] ?? fixture.bundle ?? "app.sideseat.mobile.preview"
        app = XCUIApplication(bundleIdentifier: bundle)
        app.launchArguments = ["--ui-testing-signed-out", "--ui-testing-ephemeral-credentials",
            "--ui-testing-skip-tutorial", "--ui-testing-language=zh-Hans", "--ui-testing-appearance=light",
            "-UIPreferredContentSizeCategoryName", "UICTContentSizeCategoryL"]
        let host = URL(string: fixture.baseURL)?.host?.lowercased() ?? ""
        if ["localhost", "127.0.0.1", "::1", "[::1]"].contains(host) {
            app.launchArguments.append("--ui-testing-local-api")
            app.launchEnvironment["SIDESEAT_API_BASE_URL_OVERRIDE"] = fixture.baseURL
        }
        app.launch()
        let identifier = app.textFields["login-identifier"]
        XCTAssertTrue(identifier.waitForExistence(timeout: 15))
        identifier.tap(); identifier.typeText(account.identifier)
        let password = app.secureTextFields["login-password"]
        XCTAssertTrue(password.exists)
        password.tap(); password.typeText(account.password)
        app.buttons["login-submit"].tap()
        XCTAssertTrue(waitUntil(timeout: 30) { self.app.tabBars.firstMatch.exists || self.element("required-setup").exists },
            "Real form login must reach the shell or a real readiness gate.")
        dismissNotificationPrompt()
        if requiresShell {
            XCTAssertTrue(app.tabBars.firstMatch.waitForExistence(timeout: 15),
                "The verified fixture must reach the shell through normal authentication/readiness.")
        }
        section = "recommendations"
    }

    private func dismissNotificationPrompt() {
        let springboard = XCUIApplication(bundleIdentifier: "com.apple.springboard")
        let deny = springboard.buttons.matching(NSPredicate(format: "label IN %@",
            ["不允许", "Don’t Allow", "Don't Allow", "Nicht erlauben"])).firstMatch
        if deny.waitForExistence(timeout: 2) { deny.tap() }
    }

    private func openTogether() {
        openTab(["同行", "Together"])
        XCTAssertTrue(element("together-home").waitForExistence(timeout: 20))
        selectSection("recommendations")
    }

    private func openTab(_ labels: [String]) {
        let tab = app.tabBars.buttons.matching(NSPredicate(format: "label IN %@", labels)).firstMatch
        XCTAssertTrue(tab.waitForExistence(timeout: 12)); tab.tap()
    }

    private func selectSection(_ target: String) {
        let button = app.buttons["together-tab-\(target)"]
        if !button.exists {
            let menu = app.buttons["together-section-menu"]
            XCTAssertTrue(menu.waitForExistence(timeout: 8)); menu.tap()
        }
        XCTAssertTrue(button.waitForExistence(timeout: 8)); button.tap()
        section = target
        XCTAssertTrue(currentList.waitForExistence(timeout: 10))
        let picker = element("together-section-picker")
        XCTAssertTrue(picker.waitForNonExistence(timeout: 8))
    }

    private var currentList: XCUIElement { app.scrollViews["together-section-\(section)"].firstMatch }
    private var activityField: XCUIElement { element("intent-editor-activity") }
    private func element(_ id: String) -> XCUIElement {
        app.descendants(matching: .any).matching(identifier: id).firstMatch
    }
    private func ownEdit(_ id: String) -> XCUIElement { app.buttons["weekly-intent-edit-\(id)"] }

    private func openNewIntention() {
        selectSection("recommendations")
        let add = app.buttons["together-add-intent"]
        let first = app.buttons["together-add-first-intent"]
        XCTAssertTrue(waitUntil { add.exists || first.exists })
        let target = add.exists ? add : first
        reveal(target); target.tap()
        XCTAssertTrue(element("intent-editor").waitForExistence(timeout: 10))
    }

    private func publishCoffee(_ title: String) {
        openNewIntention()
        let coffee = app.buttons["intent-topic-coffee"]
        XCTAssertTrue(coffee.waitForExistence(timeout: 8)); coffee.tap()
        replaceText(activityField, with: title)
        saveEditor()
        let id = ownIntentionID(titled: title)
        assertStatus(id, "正在寻找")
        capture("published-coffee")
    }

    private func ownIntentionID(titled title: String) -> String {
        let edit = app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH %@ AND label CONTAINS %@",
            "weekly-intent-edit-", title)).firstMatch
        XCTAssertTrue(edit.waitForExistence(timeout: 15), "The published activity must return to the own-intention rail.")
        return String(edit.identifier.dropFirst("weekly-intent-edit-".count))
    }

    private func showOwnIntention(_ id: String) {
        let edit = ownEdit(id)
        reveal(app.scrollViews["together-intention-rail"])
        let rail = app.scrollViews["together-intention-rail"]
        for _ in 0..<7 where !edit.isHittable { rail.swipeLeft() }
        for _ in 0..<7 where !edit.isHittable { rail.swipeRight() }
        XCTAssertTrue(edit.waitForExistence(timeout: 8)); reveal(edit)
    }

    private func editIntention(_ id: String, title: String) {
        showOwnIntention(id); ownEdit(id).tap()
        XCTAssertTrue(element("intent-editor").waitForExistence(timeout: 8))
        replaceText(activityField, with: title)
        saveEditor()
    }

    private func saveEditor() {
        let save = app.buttons["intent-editor-save"]
        XCTAssertTrue(save.waitForExistence(timeout: 8)); XCTAssertTrue(save.isEnabled); save.tap()
        XCTAssertTrue(element("intent-editor").waitForNonExistence(timeout: 20), "A real save must succeed before the next phase.")
    }

    private func cancelEditor() {
        cancelPresentedForm()
        XCTAssertTrue(element("intent-editor").waitForNonExistence(timeout: 8))
    }

    private func cancelPresentedForm() { tapNavigationButton(["取消", "Cancel"]) }

    private func tapNavigationButton(_ labels: [String]) {
        let button = app.navigationBars.buttons.matching(NSPredicate(format: "label IN %@", labels)).firstMatch
        XCTAssertTrue(button.waitForExistence(timeout: 5)); button.tap()
    }

    private func performMenuAction(_ action: String, intentID: String) {
        showOwnIntention(intentID)
        let menu = app.buttons["weekly-intent-menu-\(intentID)"]
        reveal(menu); menu.tap()
        let item = app.buttons["weekly-intent-\(action)-\(intentID)"]
        XCTAssertTrue(item.waitForExistence(timeout: 8)); item.tap()
    }

    private func assertStatus(_ id: String, _ label: String) {
        let status = app.staticTexts.matching(identifier: "weekly-intent-status-\(id)").firstMatch
        XCTAssertTrue(waitUntil(timeout: 15) { status.exists && status.label == label },
            "Expected status \(label), got \(status.exists ? status.label : "missing")")
    }

    private func cancelShareSheet(intentID: String) {
        // The system share preview contains a recovery-capable URL: never attach it.
        let error = element("weekly-intent-share-error-prompt-\(intentID)")
        let close = app.buttons.matching(NSPredicate(format: "label IN %@",
            ["关闭", "Close", "取消", "Cancel"])).firstMatch
        XCTAssertTrue(waitUntil(timeout: 15) { close.exists || error.exists })
        XCTAssertFalse(error.exists, "The real share-link request must succeed.")
        XCTAssertTrue(close.exists); close.tap()
        XCTAssertTrue(ownEdit(intentID).waitForExistence(timeout: 8))
    }

    private func assertChat(greeting: String, reply: String, title: String) {
        XCTAssertTrue(element("direct-chat").waitForExistence(timeout: 20))
        XCTAssertTrue(app.staticTexts[greeting].firstMatch.waitForExistence(timeout: 12))
        XCTAssertTrue(app.staticTexts[reply].firstMatch.waitForExistence(timeout: 12))
        let context = app.buttons["conversation-context-bar"]
        XCTAssertTrue(context.waitForExistence(timeout: 8)); context.tap()
        XCTAssertTrue(element("conversation-context-sheet").waitForExistence(timeout: 8))
        XCTAssertTrue(app.staticTexts[title].firstMatch.waitForExistence(timeout: 8))
        XCTAssertTrue(app.buttons["conversation-context-make-plan"].exists,
            "The original intention is available as context, without automatically creating a plan.")
        capture("original-intention-context")
        tapNavigationButton(["完成", "Done"])
        XCTAssertTrue(element("conversation-context-sheet").waitForNonExistence(timeout: 8))
    }

    private func returnToTogether() {
        for _ in 0..<4 where element("direct-chat").exists || element("intention-chat").exists {
            let back = app.navigationBars.buttons.firstMatch
            XCTAssertTrue(back.exists); back.tap()
        }
        openTogether()
    }

    private func replaceText(_ field: XCUIElement, with text: String) {
        XCTAssertTrue(field.waitForExistence(timeout: 8)); field.tap()
        for _ in 0..<3 {
            let current = field.value as? String ?? ""
            if current.isEmpty || current == field.placeholderValue { break }
            field.press(forDuration: 1.1)
            let selectAll = app.descendants(matching: .any).matching(
                NSPredicate(format: "label IN %@", ["全选", "Select All"])).firstMatch
            if selectAll.waitForExistence(timeout: 2) {
                selectAll.tap()
                field.typeText(XCUIKeyboardKey.delete.rawValue)
            } else {
                // iOS omits Select All when the long press already selected the whole word.
                let cut = app.descendants(matching: .any).matching(
                    NSPredicate(format: "label IN %@", ["剪切", "Cut"])).firstMatch
                XCTAssertTrue(cut.waitForExistence(timeout: 2), "System text selection must be available before replacement.")
                cut.tap()
            }
        }
        let cleared = field.value as? String ?? ""
        XCTAssertTrue(cleared.isEmpty || cleared == field.placeholderValue, "System text selection must clear the previous value.")
        field.typeText(text)
        XCTAssertEqual(field.value as? String, text, "The UI must contain exactly the replacement text before continuing.")
    }

    private func reveal(_ target: XCUIElement) {
        XCTAssertTrue(target.waitForExistence(timeout: 10))
        for _ in 0..<8 where !fullyVisible(target) { currentList.swipeUp() }
        for _ in 0..<8 where !fullyVisible(target) { currentList.swipeDown() }
        XCTAssertTrue(target.isHittable, "The intended control must be reachable on this Together section.")
    }

    private func fullyVisible(_ target: XCUIElement) -> Bool {
        guard target.exists, target.isHittable else { return false }
        let list = currentList.frame
        let top = max(list.minY, element("together-segmented-control").frame.maxY)
        let bottom = min(list.maxY, app.tabBars.firstMatch.frame.minY)
        return CGRect(x: list.minX, y: top, width: list.width, height: max(0, bottom - top))
            .insetBy(dx: -1, dy: -1).contains(target.frame)
    }

    private func observedOpportunityID() throws -> String {
        let stateURL = environment["SIDESEAT_FIVE_ROOT_OBSERVER_STATE"].map { URL(fileURLWithPath: $0) }
            ?? fixtureURL.deletingLastPathComponent().appendingPathComponent("together-observer-state.json")
        var observed: String?
        XCTAssertTrue(waitUntil(timeout: 30) {
            guard let data = try? Data(contentsOf: stateURL),
                  let state = try? JSONDecoder().decode(ObserverState.self, from: data),
                  let id = state.opportunityID, !id.isEmpty else { return false }
            observed = id
            return true
        }, "The read-only observer must identify the exact two-account recommendation before opening it.")
        return try XCTUnwrap(observed)
    }

    private func waitUntil(timeout: TimeInterval = 12, _ condition: () -> Bool) -> Bool {
        let deadline = Date().addingTimeInterval(timeout)
        repeat {
            if condition() { return true }
            RunLoop.current.run(until: Date().addingTimeInterval(0.25))
        } while Date() < deadline
        return condition()
    }

    private func capture(_ name: String) {
        XCTAssertFalse(app.secureTextFields["login-password"].exists,
            "Screenshots must exclude authentication credentials.")
        let attachment = XCTAttachment(screenshot: app.screenshot())
        attachment.name = "five-root-together-\(name)"
        attachment.lifetime = .keepAlways
        add(attachment)
    }

    private func phase(_ name: String) {
        print("FIVE_ROOT_TOGETHER_PHASE \(name)")
        fflush(stdout)
        RunLoop.current.run(until: Date().addingTimeInterval(3))
    }
}
