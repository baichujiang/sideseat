import XCTest

func sideSeatLiveEnvironmentValue(_ key: String, fallback: String) -> String {
    guard let value = ProcessInfo.processInfo.environment[key] else {
        return fallback
    }
    return value.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? fallback : value
}

@MainActor
extension XCUIApplication {
    func configureForSideSeatLiveAPI() {
        launchArguments.append("--ui-testing-local-api")
        launchEnvironment["SIDESEAT_API_BASE_URL_OVERRIDE"] = sideSeatLiveEnvironmentValue(
            "SIDESEAT_LIVE_API_BASE_URL",
            fallback: "http://127.0.0.1:3000"
        )
    }
}

/// Manual/local smoke: real login against the Development API (port 3000).
@MainActor
final class LiveLoginSmokeUITests: XCTestCase {
    override func setUpWithError() throws {
        continueAfterFailure = false
        try XCTSkipUnless(
            ProcessInfo.processInfo.environment["SIDESEAT_LIVE_UI_TESTS"] == "1",
            "Set SIDESEAT_LIVE_UI_TESTS=1 against the local Development API."
        )
    }

    func testRealLoginReachesHomeShell() {
        let username = sideSeatLiveEnvironmentValue("E2E_USER", fallback: "test_001")
        let password = sideSeatLiveEnvironmentValue("E2E_PASSWORD", fallback: "Password123")
        let app = XCUIApplication()
        // Exercise the resilient Keychain path (no ephemeral override).
        app.launchArguments = [
            "--ui-testing-signed-out",
            "--ui-testing-skip-tutorial",
        ]
        app.configureForSideSeatLiveAPI()
        app.launch()

        let identifier = app.textFields["login-identifier"]
        XCTAssertTrue(identifier.waitForExistence(timeout: 5))
        identifier.tap()
        identifier.typeText(username)

        let passwordField = app.secureTextFields["login-password"]
        passwordField.tap()
        passwordField.typeText(password)
        app.buttons["login-submit"].tap()

        // Home shell exposes the calendar add control; also accept other tabs.
        let signedInSignals: [XCUIElement] = [
            app.buttons["calendar-add-menu"],
            app.buttons["new-event"],
            app.descendants(matching: .any)["inbox-list"],
            app.descendants(matching: .any)["me-profile"],
            app.tabBars.buttons["Home"],
            app.tabBars.buttons["首页"],
        ]
        let deadline = Date().addingTimeInterval(20)
        while Date() < deadline {
            if signedInSignals.contains(where: \.exists) {
                return
            }
            if app.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", "Keychain")).firstMatch.exists {
                XCTFail("Keychain error still shown after resilient credential store.")
                return
            }
            RunLoop.current.run(until: Date().addingTimeInterval(0.2))
        }
        XCTFail("Signed-in shell did not appear after login.")
    }
}

/// Real social journeys against the isolated local API and PostgreSQL database.
/// The test-account seed removes `[live-ui]` artifacts before each suite run.
@MainActor
final class SocialLiveUITests: XCTestCase {
    private let password = "Password123"

    override func setUpWithError() throws {
        continueAfterFailure = false
        try XCTSkipUnless(
            ProcessInfo.processInfo.environment["SIDESEAT_LIVE_UI_TESTS"] == "1",
            "Set SIDESEAT_LIVE_UI_TESTS=1 against the isolated local Development API."
        )
    }

    func testSignupPersistsAcrossRelaunchAndAccountCanBeDeleted() {
        let username = "liveui_\(Int(Date().timeIntervalSince1970))"
        let displayName = "Live Signup"
        var app = XCUIApplication()
        app.launchArguments = [
            "--ui-testing-signed-out",
            "--ui-testing-skip-tutorial",
        ]
        app.configureForSideSeatLiveAPI()
        app.launch()

        let createAccount = app.buttons["login-create-account"]
        XCTAssertTrue(createAccount.waitForExistence(timeout: 8))
        createAccount.tap()
        let displayNameField = app.textFields["signup-display-name"]
        XCTAssertTrue(displayNameField.waitForExistence(timeout: 5))
        displayNameField.tap()
        displayNameField.typeText(displayName)
        let usernameField = app.textFields["signup-username"]
        usernameField.tap()
        usernameField.typeText(username)
        app.buttons["signup-password-visibility"].tap()
        let passwordField = app.textFields["signup-password"]
        passwordField.tap()
        passwordField.typeText(password)
        app.buttons["signup-confirm-password-visibility"].tap()
        let confirmationField = app.textFields["signup-confirm-password"]
        confirmationField.tap()
        confirmationField.typeText(password)
        let submit = app.buttons.matching(
            NSPredicate(format: "label IN %@", ["Create account", "创建账户"])
        ).firstMatch
        XCTAssertEqual((passwordField.value as? String)?.count, password.count)
        XCTAssertEqual((confirmationField.value as? String)?.count, password.count)
        XCTAssertTrue(waitUntilEnabled(submit, timeout: 5))
        submit.tap()

        XCTAssertTrue(tabButton(in: app, labels: ["Calendar", "日历"]).waitForExistence(timeout: 20))
        assertSignedInProfile(username: username, in: app)
        XCTAssertTrue(app.staticTexts[displayName].firstMatch.waitForExistence(timeout: 8))
        app.terminate()

        app = XCUIApplication()
        app.launchArguments = ["--ui-testing-skip-tutorial"]
        app.configureForSideSeatLiveAPI()
        app.launch()
        XCTAssertTrue(tabButton(in: app, labels: ["Calendar", "日历"]).waitForExistence(timeout: 20))
        assertSignedInProfile(username: username, in: app)

        let settings = app.buttons["me-settings"]
        XCTAssertTrue(settings.waitForExistence(timeout: 8))
        settings.tap()
        let deleteAccount = app.buttons["settings-delete-account"]
        for _ in 0..<6 where !deleteAccount.isHittable {
            app.swipeUp()
        }
        XCTAssertTrue(deleteAccount.waitForExistence(timeout: 5))
        deleteAccount.tap()
        XCTAssertTrue(app.descendants(matching: .any)["delete-account-sheet"].waitForExistence(timeout: 5))
        app.switches["delete-account-understood"]
            .coordinate(withNormalizedOffset: CGVector(dx: 0.9, dy: 0.5))
            .tap()
        let confirmation = app.textFields["delete-account-confirm"]
        confirmation.tap()
        confirmation.typeText(username)
        let deleteSubmit = app.buttons["delete-account-submit"]
        XCTAssertTrue(waitUntilEnabled(deleteSubmit, timeout: 5))
        deleteSubmit.tap()
        XCTAssertTrue(app.textFields["login-identifier"].waitForExistence(timeout: 15))
    }

    func testDiscoverPostCreateEditAndClose() {
        let timestamp = Int(Date().timeIntervalSince1970)
        let originalTitle = "[live-ui] Study post \(timestamp)"
        let editedTitle = "\(originalTitle) edited"
        let app = launchAndLogin(username: "test_001")

        tabButton(in: app, labels: ["Create", "发布"]).tap()
        let title = app.textViews["buddy-title"]
        XCTAssertTrue(title.waitForExistence(timeout: 8))
        title.tap()
        title.typeText(originalTitle)
        let body = app.textViews["buddy-body"]
        body.tap()
        body.typeText("Looking for a focused study session. #liveui")
        let keyboardDone = app.buttons["buddy-keyboard-done"].firstMatch
        XCTAssertTrue(keyboardDone.waitForExistence(timeout: 3))
        keyboardDone.tap()

        let submit = app.buttons["buddy-submit"].firstMatch
        XCTAssertTrue(submit.waitForExistence(timeout: 3))
        XCTAssertTrue(submit.isEnabled)
        submit.tap()

        XCTAssertTrue(app.descendants(matching: .any)["discover-post-detail"].waitForExistence(timeout: 12))
        XCTAssertTrue(app.staticTexts[originalTitle].waitForExistence(timeout: 5))

        app.buttons["discover-plan-actions"].tap()
        let edit = app.buttons["discover-plan-edit"].firstMatch
        XCTAssertTrue(edit.waitForExistence(timeout: 3))
        edit.tap()
        XCTAssertTrue(app.descendants(matching: .any)["buddy-edit-view"].waitForExistence(timeout: 5))

        let editTitle = app.textViews["buddy-title"]
        editTitle.coordinate(withNormalizedOffset: CGVector(dx: 0.95, dy: 0.5)).tap()
        editTitle.typeText(" edited")
        let editKeyboardDone = app.buttons["buddy-keyboard-done"].firstMatch
        XCTAssertTrue(editKeyboardDone.waitForExistence(timeout: 3))
        editKeyboardDone.tap()
        let save = app.buttons["buddy-submit"].firstMatch
        XCTAssertTrue(save.isEnabled)
        save.tap()

        XCTAssertTrue(app.descendants(matching: .any)["buddy-edit-view"].waitForNonExistence(timeout: 12))
        XCTAssertTrue(app.staticTexts[editedTitle].waitForExistence(timeout: 8))

        app.buttons["discover-plan-actions"].tap()
        let close = app.buttons.matching(
            NSPredicate(format: "label IN %@", ["Close plan", "关闭计划", "Plan schließen"])
        ).firstMatch
        XCTAssertTrue(close.waitForExistence(timeout: 3))
        close.tap()
        let confirmClose = app.buttons.matching(
            NSPredicate(format: "label IN %@", ["Close plan", "关闭计划", "Plan schließen"])
        ).firstMatch
        XCTAssertTrue(confirmClose.waitForExistence(timeout: 3))
        confirmClose.tap()

        let closed = app.staticTexts.matching(
            NSPredicate(format: "label IN %@", ["Closed", "已关闭", "Geschlossen"])
        ).firstMatch
        XCTAssertTrue(closed.waitForExistence(timeout: 10))
    }

    func testCrossAccountMessageAndPlanAcceptanceAddsBothCalendars() {
        let timestamp = Int(Date().timeIntervalSince1970)
        let message = "[live-ui] message \(timestamp)"
        let planTitle = "[live-ui] Coffee plan \(timestamp)"

        let sender = launchAndLogin(username: "test_001")
        openDirectChat(in: sender, peerName: "Test 002")
        sendMessage(message, in: sender)
        createPlan(planTitle, in: sender)
        sender.terminate()

        let receiver = launchAndLogin(username: "test_002")
        let chats = tabButton(in: receiver, labels: ["Chats", "聊天", "消息"])
        XCTAssertTrue(chats.waitForExistence(timeout: 8))
        chats.tap()
        XCTAssertTrue(receiver.descendants(matching: .any)["inbox-list"].waitForExistence(timeout: 10))
        let planPreview = receiver.staticTexts.matching(
            NSPredicate(format: "label CONTAINS %@", planTitle)
        ).firstMatch
        XCTAssertTrue(planPreview.waitForExistence(timeout: 10))
        let unread = receiver.staticTexts.matching(
            NSPredicate(
                format: "label CONTAINS[c] 'unread' OR label CONTAINS '未读' OR label CONTAINS[c] 'ungelesen'"
            )
        ).firstMatch
        XCTAssertTrue(unread.waitForExistence(timeout: 5))

        receiver.staticTexts["Test 001"].firstMatch.tap()
        XCTAssertTrue(receiver.descendants(matching: .any)["direct-chat"].waitForExistence(timeout: 10))
        XCTAssertTrue(receiver.staticTexts[message].waitForExistence(timeout: 8))
        XCTAssertTrue(receiver.staticTexts[planTitle].waitForExistence(timeout: 8))

        let accept = receiver.buttons.matching(
            NSPredicate(format: "label IN %@", ["Accept", "接受", "Annehmen"])
        ).firstMatch
        XCTAssertTrue(accept.waitForExistence(timeout: 5))
        accept.tap()
        let viewCalendar = receiver.buttons.matching(
            NSPredicate(format: "label IN %@", ["View calendar", "查看日历", "Kalender anzeigen"])
        ).firstMatch
        XCTAssertTrue(viewCalendar.waitForExistence(timeout: 12))
        viewCalendar.tap()
        XCTAssertTrue(receiver.descendants(matching: .any)["home-week-timetable"].waitForExistence(timeout: 8))
        XCTAssertTrue(receiver.staticTexts[planTitle].waitForExistence(timeout: 10))
        receiver.terminate()

        let proposer = launchAndLogin(username: "test_001")
        XCTAssertTrue(proposer.descendants(matching: .any)["home-week-timetable"].waitForExistence(timeout: 10))
        XCTAssertTrue(proposer.staticTexts[planTitle].waitForExistence(timeout: 10))
    }

    func testProfileEditPersistsAcrossRelaunchAndCanBeRestored() {
        let temporaryNickname = "Live User \(Int(Date().timeIntervalSince1970) % 100_000)"
        var app = launchAndLogin(username: "test_001")
        openProfileEditor(in: app)
        replaceText(in: app.textFields["profile-edit-nickname"], with: temporaryNickname)
        saveProfile(in: app)
        XCTAssertTrue(app.staticTexts[temporaryNickname].waitForExistence(timeout: 8))
        app.terminate()

        app = launchAndLogin(username: "test_001")
        tabButton(in: app, labels: ["Me", "我"]).tap()
        XCTAssertTrue(app.staticTexts[temporaryNickname].waitForExistence(timeout: 10))
        openProfileEditor(in: app, selectMeTab: false)
        replaceText(in: app.textFields["profile-edit-nickname"], with: "Test 001")
        saveProfile(in: app)
        XCTAssertTrue(app.staticTexts["Test 001"].waitForExistence(timeout: 8))
    }

    func testLogoutSwitchesAccountsAndRestoresOnlyTheNewIdentity() {
        var app = launchAndLogin(username: "test_001", ephemeralCredentials: false)
        assertSignedInProfile(username: "test_001", in: app)

        app.buttons["me-settings"].tap()
        XCTAssertTrue(app.descendants(matching: .any)["settings-root"].waitForExistence(timeout: 8))
        let logout = app.buttons["settings-logout"]
        for _ in 0..<4 where !logout.exists {
            app.swipeUp()
        }
        XCTAssertTrue(logout.waitForExistence(timeout: 5))
        logout.tap()

        let identifier = app.textFields["login-identifier"]
        XCTAssertTrue(identifier.waitForExistence(timeout: 8))
        identifier.tap()
        identifier.typeText("test_002")
        let passwordField = app.secureTextFields["login-password"]
        passwordField.tap()
        passwordField.typeText(password)
        let submit = app.buttons["login-submit"]
        XCTAssertTrue(waitUntilEnabled(submit, timeout: 8))
        submit.tap()
        XCTAssertTrue(tabButton(in: app, labels: ["Calendar", "日历"]).waitForExistence(timeout: 15))
        assertSignedInProfile(username: "test_002", in: app)
        XCTAssertFalse(app.staticTexts["@test_001"].exists)

        app.terminate()
        app = XCUIApplication()
        app.launchArguments = ["--ui-testing-skip-tutorial"]
        app.configureForSideSeatLiveAPI()
        app.launch()

        XCTAssertTrue(tabButton(in: app, labels: ["Calendar", "日历"]).waitForExistence(timeout: 15))
        assertSignedInProfile(username: "test_002", in: app)
        XCTAssertFalse(app.staticTexts["@test_001"].exists)
    }

    func testGroupCreationMessageAndMemberVisibility() {
        let timestamp = Int(Date().timeIntervalSince1970)
        let groupTitle = "[live-ui] Study group \(timestamp)"
        let message = "[live-ui] Group hello \(timestamp)"
        let creator = launchAndLogin(username: "test_001")

        tabButton(in: creator, labels: ["Chats", "聊天", "消息"]).tap()
        XCTAssertTrue(creator.descendants(matching: .any)["inbox-list"].waitForExistence(timeout: 10))
        creator.buttons["inbox-toolbar-more"].tap()
        let newGroup = creator.descendants(matching: .any)["inbox-toolbar-new-group"].firstMatch
        XCTAssertTrue(newGroup.waitForExistence(timeout: 5))
        newGroup.tap()
        XCTAssertTrue(creator.descendants(matching: .any)["group-create-sheet"].waitForExistence(timeout: 8))

        let peerTwo = creator.staticTexts["Test 002"].firstMatch
        let peerThree = creator.staticTexts["Test 003"].firstMatch
        XCTAssertTrue(peerTwo.waitForExistence(timeout: 8))
        XCTAssertTrue(peerThree.waitForExistence(timeout: 8))
        peerTwo.tap()
        peerThree.tap()
        let title = creator.textFields["group-create-title"]
        title.tap()
        title.typeText(groupTitle)
        let submit = creator.buttons["group-create-submit"]
        XCTAssertTrue(waitUntilEnabled(submit, timeout: 5))
        submit.tap()

        XCTAssertTrue(creator.descendants(matching: .any)["group-chat"].waitForExistence(timeout: 12))
        XCTAssertTrue(creator.staticTexts[groupTitle].waitForExistence(timeout: 8))
        sendMessage(message, in: creator)
        creator.terminate()

        let member = launchAndLogin(username: "test_002")
        tabButton(in: member, labels: ["Chats", "聊天", "消息"]).tap()
        XCTAssertTrue(member.descendants(matching: .any)["inbox-list"].waitForExistence(timeout: 10))
        let group = member.staticTexts[groupTitle].firstMatch
        XCTAssertTrue(group.waitForExistence(timeout: 12))
        group.tap()
        XCTAssertTrue(member.descendants(matching: .any)["group-chat"].waitForExistence(timeout: 10))
        XCTAssertTrue(member.staticTexts[message].waitForExistence(timeout: 10))
    }

    func testFeedbackPostVoteCommentAndCrossAccountVisibility() {
        let timestamp = Int(Date().timeIntervalSince1970)
        let title = "[live-ui] Feedback \(timestamp)"
        let message = "Please make this real feedback journey reliable across accounts."
        let comment = "[live-ui] Reproduced and confirmed \(timestamp)"
        let author = launchAndLogin(username: "test_001")

        openFeedback(in: author)
        author.buttons["feedback-compose"].tap()
        XCTAssertTrue(author.descendants(matching: .any)["feedback-compose-sheet"].waitForExistence(timeout: 5))
        author.textFields["feedback-title"].tap()
        author.textFields["feedback-title"].typeText(title)
        author.textFields["feedback-message"].tap()
        author.textFields["feedback-message"].typeText(message)
        let send = author.buttons["feedback-submit"]
        XCTAssertTrue(waitUntilEnabled(send, timeout: 5))
        send.tap()
        XCTAssertTrue(
            author.descendants(matching: .any)["feedback-compose-sheet"]
                .waitForNonExistence(timeout: 12)
        )
        let createdTitle = author.staticTexts[title].firstMatch
        XCTAssertTrue(createdTitle.waitForExistence(timeout: 10))
        createdTitle.tap()
        XCTAssertTrue(author.descendants(matching: .any)["feedback-detail"].waitForExistence(timeout: 8))

        let upvote = author.buttons["feedback-upvote"]
        XCTAssertTrue(upvote.waitForExistence(timeout: 5))
        upvote.tap()
        XCTAssertTrue(waitForValue(upvote, values: ["Selected", "已选择", "Ausgewählt"], timeout: 6))
        let commentField = author.textFields["feedback-comment-field"]
        commentField.tap()
        commentField.typeText(comment)
        let submitComment = author.buttons["feedback-comment-submit"]
        XCTAssertTrue(waitUntilEnabled(submitComment, timeout: 5))
        submitComment.tap()
        XCTAssertTrue(author.staticTexts[comment].waitForExistence(timeout: 10))
        author.terminate()

        let reader = launchAndLogin(username: "test_002")
        openFeedback(in: reader)
        let sharedTitle = reader.staticTexts[title].firstMatch
        XCTAssertTrue(sharedTitle.waitForExistence(timeout: 12))
        sharedTitle.tap()
        XCTAssertTrue(reader.descendants(matching: .any)["feedback-detail"].waitForExistence(timeout: 8))
        XCTAssertTrue(reader.staticTexts[comment].waitForExistence(timeout: 10))
    }

    private func launchAndLogin(
        username: String,
        ephemeralCredentials: Bool = true
    ) -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments = [
            "--ui-testing-signed-out",
            "--ui-testing-skip-tutorial",
        ]
        if ephemeralCredentials {
            app.launchArguments.append("--ui-testing-ephemeral-credentials")
        }
        app.configureForSideSeatLiveAPI()
        app.launch()

        let identifier = app.textFields["login-identifier"]
        XCTAssertTrue(identifier.waitForExistence(timeout: 8))
        identifier.tap()
        identifier.typeText(username)
        let passwordField = app.secureTextFields["login-password"]
        passwordField.tap()
        passwordField.typeText(password)
        app.buttons["login-submit"].tap()
        XCTAssertTrue(tabButton(in: app, labels: ["Calendar", "日历"]).waitForExistence(timeout: 15))
        return app
    }

    private func assertSignedInProfile(username: String, in app: XCUIApplication) {
        tabButton(in: app, labels: ["Me", "我"]).tap()
        XCTAssertTrue(app.descendants(matching: .any)["me-profile"].waitForExistence(timeout: 12))
        XCTAssertTrue(app.staticTexts["@\(username)"].firstMatch.waitForExistence(timeout: 8))
    }

    private func openFeedback(in app: XCUIApplication) {
        tabButton(in: app, labels: ["Me", "我"]).tap()
        let settings = app.buttons["me-settings"]
        XCTAssertTrue(settings.waitForExistence(timeout: 10))
        settings.tap()
        XCTAssertTrue(app.descendants(matching: .any)["settings-root"].waitForExistence(timeout: 8))
        let feedback = app.buttons["settings-feedback"]
        for _ in 0..<5 where !feedback.isHittable {
            app.swipeUp()
        }
        XCTAssertTrue(feedback.waitForExistence(timeout: 5))
        feedback.tap()
        XCTAssertTrue(app.descendants(matching: .any)["feedback-root"].waitForExistence(timeout: 10))
    }

    private func openDirectChat(in app: XCUIApplication, peerName: String) {
        let chats = tabButton(in: app, labels: ["Chats", "聊天", "消息"])
        chats.tap()
        XCTAssertTrue(app.descendants(matching: .any)["inbox-list"].waitForExistence(timeout: 10))
        let peer = app.staticTexts[peerName].firstMatch
        XCTAssertTrue(peer.waitForExistence(timeout: 8))
        peer.tap()
        XCTAssertTrue(app.descendants(matching: .any)["direct-chat"].waitForExistence(timeout: 10))
    }

    private func sendMessage(_ message: String, in app: XCUIApplication) {
        let field = app.descendants(matching: .any)["chat-composer-field"].firstMatch
        XCTAssertTrue(field.waitForExistence(timeout: 8))
        field.tap()
        field.typeText(message)
        app.buttons["chat-composer-send"].tap()
        XCTAssertTrue(app.staticTexts[message].waitForExistence(timeout: 10))
        XCTAssertTrue(app.keyboards.firstMatch.exists, "Sending must keep the keyboard open for consecutive messages.")
    }

    private func createPlan(_ title: String, in app: XCUIApplication) {
        app.buttons["chat-composer-attach"].tap()
        let plan = app.buttons["chat-composer-plan"]
        XCTAssertTrue(plan.waitForExistence(timeout: 5))
        plan.tap()
        XCTAssertTrue(app.descendants(matching: .any)["plan-create-sheet"].waitForExistence(timeout: 5))
        let titleField = app.textFields["plan-create-title"]
        titleField.tap()
        titleField.typeText(title)
        let submit = app.buttons["plan-create-submit"]
        XCTAssertTrue(submit.waitForExistence(timeout: 3))
        XCTAssertTrue(submit.isEnabled)
        submit.tap()
        XCTAssertTrue(app.descendants(matching: .any)["plan-create-sheet"].waitForNonExistence(timeout: 12))
        XCTAssertTrue(app.staticTexts[title].waitForExistence(timeout: 12))
    }

    private func openProfileEditor(in app: XCUIApplication, selectMeTab: Bool = true) {
        if selectMeTab {
            tabButton(in: app, labels: ["Me", "我"]).tap()
        }
        let edit = app.buttons["me-hero-edit"]
        XCTAssertTrue(edit.waitForExistence(timeout: 10))
        edit.tap()
        XCTAssertTrue(app.descendants(matching: .any)["profile-edit"].waitForExistence(timeout: 5))
    }

    private func saveProfile(in app: XCUIApplication) {
        let save = app.buttons["profile-edit-save"]
        XCTAssertTrue(save.waitForExistence(timeout: 3))
        XCTAssertTrue(save.isEnabled)
        save.tap()
        XCTAssertTrue(app.descendants(matching: .any)["profile-edit"].waitForNonExistence(timeout: 12))
    }

    private func replaceText(in field: XCUIElement, with text: String) {
        XCTAssertTrue(field.waitForExistence(timeout: 5))
        field.tap()
        let current = field.value as? String ?? ""
        field.typeText(String(repeating: XCUIKeyboardKey.delete.rawValue, count: current.count))
        field.typeText(text)
    }

    private func tabButton(in app: XCUIApplication, labels: [String]) -> XCUIElement {
        app.tabBars.buttons.matching(NSPredicate(format: "label IN %@", labels)).firstMatch
    }

    private func waitUntilEnabled(_ element: XCUIElement, timeout: TimeInterval) -> Bool {
        let expectation = XCTNSPredicateExpectation(
            predicate: NSPredicate(format: "exists == true AND enabled == true"),
            object: element
        )
        return XCTWaiter.wait(for: [expectation], timeout: timeout) == .completed
    }

    private func waitForValue(
        _ element: XCUIElement,
        values: [String],
        timeout: TimeInterval
    ) -> Bool {
        let expectation = XCTNSPredicateExpectation(
            predicate: NSPredicate(format: "value IN %@", values),
            object: element
        )
        return XCTWaiter.wait(for: [expectation], timeout: timeout) == .completed
    }
}
