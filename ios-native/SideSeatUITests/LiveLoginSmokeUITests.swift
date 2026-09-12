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

        tabButton(in: app, labels: ["Discover", "发现"]).tap()
        let publish = app.buttons["discover-publish"]
        XCTAssertTrue(publish.waitForExistence(timeout: 8))
        publish.tap()
        XCTAssertTrue(app.descendants(matching: .any)["create-chooser-sheet"].waitForExistence(timeout: 5))
        app.buttons["create-buddy-post"].tap()
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

        let edit = app.buttons["discover-post-edit-primary"].firstMatch
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

        let reopenEditor = app.buttons["discover-post-edit-primary"].firstMatch
        XCTAssertTrue(reopenEditor.waitForExistence(timeout: 3))
        reopenEditor.tap()
        XCTAssertTrue(app.descendants(matching: .any)["buddy-edit-view"].waitForExistence(timeout: 5))

        let close = app.buttons["buddy-close-post"]
        for _ in 0..<6 where !close.isHittable {
            app.swipeUp()
        }
        XCTAssertTrue(close.waitForExistence(timeout: 3))
        close.tap()
        let confirmClose = app.buttons["buddy-close-confirm"]
        XCTAssertTrue(confirmClose.waitForExistence(timeout: 3))
        confirmClose.tap()

        XCTAssertTrue(app.descendants(matching: .any)["buddy-edit-view"].waitForNonExistence(timeout: 12))

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

    func testLayer2FirstParticipantReachesOutcomeFromEveryHistorySurface() throws {
        let planID = try requiredLayer2Environment("E2E_LAYER2_PLAN_ID")
        let planTitle = try requiredLayer2Environment("E2E_LAYER2_PLAN_TITLE")
        let calendarEntryID = try requiredLayer2Environment("E2E_LAYER2_CALENDAR_ENTRY_ID")
        let username = sideSeatLiveEnvironmentValue("E2E_USER", fallback: "test_001")
        let app = launchAndLogin(
            username: username,
            additionalLaunchArguments: ["--ui-testing-language=en"]
        )

        let together = tabButton(in: app, labels: ["Together", "同行", "Zusammen"])
        XCTAssertTrue(together.waitForExistence(timeout: 8))
        together.tap()
        XCTAssertFalse(app.descendants(matching: .any)["together-outcome-\(planID)"].exists,
                       "Together should not duplicate Plan history or outcome prompts")
        XCTAssertFalse(app.buttons["together-open-plans"].exists)
        let plans = tabButton(in: app, labels: ["Plans", "计划", "Pläne"])
        XCTAssertTrue(plans.waitForExistence(timeout: 8))
        plans.tap()
        XCTAssertTrue(app.descendants(matching: .any)["plans-root"].waitForExistence(timeout: 10))
        XCTAssertTrue(app.staticTexts[planTitle].waitForExistence(timeout: 8))
        XCTAssertTrue(app.buttons["plan-outcome-occurred-\(planID)"].waitForExistence(timeout: 8))

        let messages = tabButton(
            in: app,
            labels: ["Messages", "Chats", "消息", "聊天", "Nachrichten"]
        )
        XCTAssertTrue(messages.waitForExistence(timeout: 8))
        messages.tap()
        XCTAssertTrue(app.descendants(matching: .any)["inbox-list"].waitForExistence(timeout: 10))
        XCTAssertFalse(app.buttons["inbox-pending-plans"].exists)

        let calendar = tabButton(in: app, labels: ["Calendar", "日历", "Kalender"])
        XCTAssertTrue(calendar.waitForExistence(timeout: 8))
        calendar.tap()
        let timetable = app.descendants(matching: .any)["home-week-timetable"]
        XCTAssertTrue(timetable.waitForExistence(timeout: 12))
        let planEvent = app.descendants(matching: .any)["home-week-event-\(calendarEntryID)"]
        XCTAssertTrue(planEvent.waitForExistence(timeout: 10))
        let earlierEventCue = app.buttons.matching(
            NSPredicate(format: "identifier BEGINSWITH %@", "calendar-week-offscreen-event-top-")
        ).firstMatch
        if earlierEventCue.waitForExistence(timeout: 2) {
            earlierEventCue.tap()
            RunLoop.current.run(until: Date().addingTimeInterval(0.6))
        }
        let planEventTitle = app.staticTexts.matching(identifier: "calendar-event-title-visual")
            .matching(NSPredicate(format: "label == %@", planTitle))
            .firstMatch
        XCTAssertTrue(planEventTitle.waitForExistence(timeout: 5))
        XCTAssertTrue(planEventTitle.isHittable)
        planEventTitle.tap()
        let calendarDetail = app.descendants(matching: .any)["calendar-readonly-detail"]
        XCTAssertTrue(calendarDetail.waitForExistence(timeout: 8))
        let managePlan = app.buttons["calendar-manage-plan"]
        for _ in 0..<6 where !managePlan.exists {
            calendarDetail.swipeUp()
        }
        XCTAssertTrue(managePlan.waitForExistence(timeout: 5))
        managePlan.tap()
        XCTAssertTrue(
            app.descendants(matching: .any)["direct-chat"]
                .waitForExistence(timeout: 12)
        )
        XCTAssertTrue(app.staticTexts[planTitle].waitForExistence(timeout: 8))
        let occurred = app.buttons["plan-outcome-occurred-\(planID)"]
        XCTAssertTrue(occurred.waitForExistence(timeout: 8))
        occurred.tap()
        XCTAssertTrue(
            app.descendants(matching: .any)["plan-outcome-saved-\(planID)"]
                .waitForExistence(timeout: 12)
        )
    }

    func testLayer2SecondParticipantCompletesBilateralOutcomeFromMessages() throws {
        let planID = try requiredLayer2Environment("E2E_LAYER2_PLAN_ID")
        let username = sideSeatLiveEnvironmentValue("E2E_USER", fallback: "test_002")
        let app = launchAndLogin(
            username: username,
            additionalLaunchArguments: ["--ui-testing-language=en"]
        )

        let plans = tabButton(in: app, labels: ["Plans", "计划", "Pläne"])
        XCTAssertTrue(plans.waitForExistence(timeout: 8))
        plans.tap()
        XCTAssertTrue(
            app.descendants(matching: .any)["plans-root"]
                .waitForExistence(timeout: 10)
        )
        let occurred = app.buttons["plan-outcome-occurred-\(planID)"]
        XCTAssertTrue(occurred.waitForExistence(timeout: 8))
        occurred.tap()
        XCTAssertTrue(
            app.descendants(matching: .any)["plan-outcome-saved-\(planID)"]
                .waitForExistence(timeout: 12)
        )

        let together = tabButton(in: app, labels: ["Together", "同行", "Zusammen"])
        XCTAssertTrue(together.waitForExistence(timeout: 8))
        together.tap()
        XCTAssertFalse(app.descendants(matching: .any)["plan-outcome-saved-\(planID)"].exists)
    }

    func testTogetherIntentToMutualPlanAddsBothCalendars() {
        runTogetherIntentToPlan(relatedActivities: false)
    }

    func testRelatedActivitiesShowFitAndReachBothCalendars() {
        runTogetherIntentToPlan(relatedActivities: true)
    }

    func testRelatedActivitiesLocalizeChinesePlanAndReachBothCalendars() {
        runTogetherIntentToPlan(relatedActivities: true, planLanguage: "zh-Hans")
    }

    private func runTogetherIntentToPlan(relatedActivities: Bool, planLanguage: String = "en") {
        let chinesePlan = planLanguage == "zh-Hans"
        let timestamp = Int(Date().timeIntervalSince1970)
        let activity = "[live-ui] Coffee and a short walk \(timestamp)"
        let peerActivity = relatedActivities ? "[live-ui] Coffee and conversation \(timestamp)" : activity
        let contextTitle = relatedActivities ? (chinesePlan ? "一起喝咖啡" : "Coffee together") : activity
        let togetherArguments = [
            "--ui-testing-discover",
            "--ui-testing-language=en",
        ]

        let firstParticipant = launchAndLogin(
            username: "test_001",
            additionalLaunchArguments: togetherArguments
        )
        createCoffeeIntentAndStartMatching(activity, in: firstParticipant)
        firstParticipant.terminate()

        let secondParticipant = launchAndLogin(
            username: "test_002",
            additionalLaunchArguments: togetherArguments
        )
        createCoffeeIntentAndStartMatching(peerActivity, in: secondParticipant)
        let secondDecision = togetherDecisionBar(in: secondParticipant)
        if relatedActivities {
            let summary = secondParticipant.descendants(matching: .any).matching(
                NSPredicate(format: "identifier BEGINSWITH %@", "mutual-opportunity-activity-")
            ).firstMatch
            XCTAssertTrue(summary.exists)
            XCTAssertTrue(summary.label.contains(activity))
            XCTAssertTrue(summary.label.contains(peerActivity))
            XCTAssertFalse(secondParticipant.descendants(matching: .any).matching(
                NSPredicate(format: "identifier BEGINSWITH %@", "mutual-opportunity-fit-details-")
            ).firstMatch.exists)
        }
        XCTAssertFalse(secondParticipant.buttons["Chat about the details"].exists)
        XCTAssertTrue(secondDecision.exists)
        swipeTogetherInterest(in: secondParticipant)
        XCTAssertTrue(
            secondParticipant.staticTexts["Your choice is saved privately"]
                .waitForExistence(timeout: 12)
        )
        XCTAssertFalse(secondParticipant.staticTexts["You both showed interest"].exists)
        secondParticipant.terminate()

        let firstReturn = launchAndLogin(
            username: "test_001",
            additionalLaunchArguments: ["--ui-testing-discover", "--ui-testing-language=\(planLanguage)"]
        )
        let recoveredCountdown = firstReturn.staticTexts.matching(
            NSPredicate(format: "label CONTAINS[c] %@", chinesePlan ? "剩余" : "remaining")
        ).firstMatch
        XCTAssertTrue(recoveredCountdown.waitForExistence(timeout: 12))
        let firstDecision = togetherDecisionBar(in: firstReturn)
        XCTAssertFalse(firstReturn.staticTexts[chinesePlan ? "你的选择已私密保存" : "Your choice is saved privately"].exists)
        XCTAssertTrue(firstDecision.exists)
        swipeTogetherInterest(in: firstReturn)
        let startPlanning = firstReturn.buttons[chinesePlan ? "聊聊细节" : "Chat about the details"]
        XCTAssertTrue(startPlanning.waitForExistence(timeout: 12))
        startPlanning.tap()

        XCTAssertTrue(firstReturn.descendants(matching: .any)["direct-chat"].waitForExistence(timeout: 12))
        XCTAssertTrue(
            firstReturn.staticTexts[chinesePlan ? "你们都有兴趣" : "You both showed interest"]
                .waitForExistence(timeout: 12)
        )
        XCTAssertTrue(firstReturn.staticTexts[contextTitle].waitForExistence(timeout: 8))
        let makePlan = firstReturn.buttons[chinesePlan ? "制定计划" : "Make a plan"]
        XCTAssertTrue(makePlan.waitForExistence(timeout: 8))
        makePlan.tap()

        XCTAssertTrue(firstReturn.descendants(matching: .any)["plan-create-sheet"].waitForExistence(timeout: 8))
        let titleField = firstReturn.textFields["plan-create-title"]
        XCTAssertTrue(titleField.waitForExistence(timeout: 5))
        let planTitle = titleField.value as? String ?? ""
        XCTAssertEqual(planTitle, contextTitle)
        let draftCapture = XCTAttachment(screenshot: firstReturn.screenshot())
        draftCapture.name = "Related Plan localized prefill - \(planLanguage)"
        draftCapture.lifetime = .keepAlways
        add(draftCapture)
        let submit = firstReturn.buttons["plan-create-submit"]
        XCTAssertTrue(waitUntilEnabled(submit, timeout: 5))
        submit.tap()
        XCTAssertTrue(
            firstReturn.descendants(matching: .any)["plan-create-sheet"]
                .waitForNonExistence(timeout: 12)
        )
        XCTAssertTrue(firstReturn.staticTexts[planTitle].waitForExistence(timeout: 12))
        firstReturn.terminate()

        let receiver = launchAndLogin(
            username: "test_002",
            additionalLaunchArguments: ["--ui-testing-language=en"]
        )
        openDirectChat(in: receiver, peerName: "Test 001")
        XCTAssertTrue(receiver.staticTexts[planTitle].waitForExistence(timeout: 12))
        let acceptButtons = receiver.buttons.matching(
            NSPredicate(format: "label IN %@", ["Accept", "接受", "Annehmen"])
        )
        let accept = acceptButtons.element(boundBy: max(acceptButtons.count - 1, 0))
        XCTAssertTrue(accept.waitForExistence(timeout: 8))
        accept.tap()
        let viewCalendar = receiver.buttons.matching(
            NSPredicate(format: "label IN %@", ["View calendar", "查看日历", "Kalender anzeigen"])
        ).firstMatch
        XCTAssertTrue(viewCalendar.waitForExistence(timeout: 12))
        viewCalendar.tap()
        XCTAssertTrue(receiver.descendants(matching: .any)["home-week-timetable"].waitForExistence(timeout: 8))
        XCTAssertTrue(receiver.staticTexts[planTitle].waitForExistence(timeout: 10))
        receiver.terminate()

        let proposer = launchAndLogin(
            username: "test_001",
            additionalLaunchArguments: ["--ui-testing-language=en"]
        )
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

    func testMessagesDoesNotExposeArbitraryGroupCreation() {
        let creator = launchAndLogin(username: "test_001")

        tabButton(in: creator, labels: ["Chats", "聊天", "消息"]).tap()
        XCTAssertTrue(creator.descendants(matching: .any)["inbox-list"].waitForExistence(timeout: 10))
        XCTAssertFalse(creator.buttons["inbox-toolbar-more"].exists)
        XCTAssertFalse(creator.descendants(matching: .any)["inbox-toolbar-new-group"].exists)
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
        ephemeralCredentials: Bool = true,
        additionalLaunchArguments: [String] = []
    ) -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments = [
            "--ui-testing-signed-out",
            "--ui-testing-skip-tutorial",
        ]
        app.launchArguments.append(contentsOf: additionalLaunchArguments)
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

    private func requiredLayer2Environment(_ key: String) throws -> String {
        let value = ProcessInfo.processInfo.environment[key]?
            .trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        return try XCTUnwrap(value.isEmpty ? nil : value, "\(key) is required for Layer2 live QA.")
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
        let chats = tabButton(in: app, labels: ["Messages", "Chats", "消息", "聊天", "Nachrichten"])
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
        let plan = app.buttons["chat-composer-plan"]
        if !plan.exists {
            let attach = app.buttons["chat-composer-attach"]
            XCTAssertTrue(attach.waitForExistence(timeout: 5))
            attach.tap()
        }
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

    private func createCoffeeIntentAndStartMatching(_ activity: String, in app: XCUIApplication) {
        let together = tabButton(in: app, labels: ["Together", "同行", "Zusammen"])
        XCTAssertTrue(together.waitForExistence(timeout: 8))
        together.tap()
        XCTAssertTrue(app.descendants(matching: .any)["together-home"].waitForExistence(timeout: 15))

        let sections = app.segmentedControls["together-segmented-control"]
        XCTAssertTrue(sections.waitForExistence(timeout: 8))
        sections.buttons.element(boundBy: 1).tap()
        let setIntent = app.buttons["together-add-intent"]
        XCTAssertTrue(setIntent.waitForExistence(timeout: 8))
        setIntent.tap()
        XCTAssertTrue(app.descendants(matching: .any)["intent-editor"].waitForExistence(timeout: 8))

        let activityField = app.textFields["intent-editor-activity"]
        XCTAssertTrue(activityField.waitForExistence(timeout: 5))
        activityField.tap()
        activityField.typeText(activity)
        let next = app.buttons["intent-editor-next"]
        XCTAssertTrue(waitUntilEnabled(next, timeout: 5))
        next.tap()
        let save = app.buttons["intent-editor-save"]
        XCTAssertTrue(waitUntilEnabled(save, timeout: 5))
        save.tap()

        let savedIntent = app.descendants(matching: .any).matching(
            NSPredicate(format: "identifier BEGINSWITH %@", "weekly-intent-")
        ).firstMatch
        XCTAssertTrue(savedIntent.waitForExistence(timeout: 12))
        sections.buttons.element(boundBy: 0).tap()
        let startMatching = app.buttons.matching(
            NSPredicate(format: "label IN %@", ["Start matching", "开始匹配", "Matching starten"])
        ).firstMatch
        for _ in 0..<6 where !startMatching.isHittable {
            app.swipeUp()
        }
        XCTAssertTrue(startMatching.waitForExistence(timeout: 5))
        startMatching.tap()
        let stopMatching = app.buttons.matching(
            NSPredicate(format: "label IN %@", ["Stop matching", "停止匹配", "Matching stoppen"])
        ).firstMatch
        XCTAssertTrue(stopMatching.waitForExistence(timeout: 12))
        XCTAssertFalse(app.staticTexts.matching(
            NSPredicate(format: "label CONTAINS %@", "Swift.CancellationError")
        ).firstMatch.exists)
    }

    private func togetherDecisionBar(in app: XCUIApplication) -> XCUIElement {
        let decision = app.descendants(matching: .any).matching(
            NSPredicate(
                format: "identifier BEGINSWITH %@ AND NOT identifier BEGINSWITH %@",
                "mutual-opportunity-swipe-",
                "mutual-opportunity-swipe-handle-"
            )
        ).firstMatch
        for _ in 0..<8 where !decision.isHittable {
            app.swipeUp()
        }
        XCTAssertTrue(decision.waitForExistence(timeout: 15))
        return decision
    }

    private func swipeTogetherInterest(in app: XCUIApplication) {
        let bar = togetherDecisionBar(in: app)
        let prefix = "mutual-opportunity-swipe-"
        let id = String(bar.identifier.dropFirst(prefix.count))
        let handle = app.descendants(matching: .any)["mutual-opportunity-swipe-handle-\(id)"].firstMatch
        XCTAssertTrue(handle.waitForExistence(timeout: 5))
        let start = handle.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5))
        let end = start.withOffset(CGVector(dx: max(120, bar.frame.width * 0.40), dy: 0))
        start.press(forDuration: 0.1, thenDragTo: end, withVelocity: .slow, thenHoldForDuration: 0.4)
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
