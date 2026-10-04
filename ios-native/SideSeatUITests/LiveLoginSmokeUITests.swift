import XCTest
import UIKit

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

        XCTAssertTrue(tabButton(in: app, labels: ["Calendar", "日历", "Kalender"]).waitForExistence(timeout: 20))
        assertSignedInProfile(username: username, in: app)
        XCTAssertTrue(app.staticTexts[displayName].firstMatch.waitForExistence(timeout: 8))
        app.terminate()

        app = XCUIApplication()
        app.launchArguments = ["--ui-testing-skip-tutorial"]
        app.configureForSideSeatLiveAPI()
        app.launch()
        XCTAssertTrue(tabButton(in: app, labels: ["Calendar", "日历", "Kalender"]).waitForExistence(timeout: 20))
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
            NSPredicate(format: "identifier BEGINSWITH %@", "calendar-week-offscreen-event-top")
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

    // Run 01, scripts/qa-closed-loop.ts advance, then 02 against the dedicated local DB.
    func testShareAcquisition01PublishAndShare() {
        let app = loopLogin("share93_owner")
        loopSelectTogetherSection("intentions", in: app)
        app.buttons["together-add-first-intent"].tap()
        app.buttons["intent-topic-coffee"].tap()
        let title = app.textFields["intent-editor-activity"]
        title.tap(); title.typeText("[share93] Coffee after class")
        let timing = app.buttons["intent-timing-choose"]
        loopReveal(timing, in: app); timing.tap()
        let done = app.buttons["intent-time-picker-done"]
        XCTAssertTrue(done.waitForExistence(timeout: 8)); XCTAssertTrue(done.isEnabled); done.tap()
        app.buttons["intent-editor-save"].tap()
        XCTAssertTrue(app.descendants(matching: .any)["intent-editor"].waitForNonExistence(timeout: 15))
        let share = app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH %@", "weekly-intent-share-")).firstMatch
        XCTAssertTrue(share.waitForExistence(timeout: 10)); loopReveal(share, in: app); share.tap()
        let copy = app.cells.matching(NSPredicate(format: "label IN %@", ["Copy", "Copy Link", "拷贝", "复制"])).firstMatch
        XCTAssertTrue(copy.waitForExistence(timeout: 15), "The native share sheet must offer a copy action")
        loopCapture(app, "share93-01-native-share-sheet")
        copy.tap()
        XCTAssertTrue(copy.waitForNonExistence(timeout: 8))
        let copied = UIPasteboard.general.url?.absoluteString ?? UIPasteboard.general.string ?? ""
        XCTAssertTrue(copied.contains("/share/intent/"), "Copy must produce the public intention URL")
        let attachment = XCTAttachment(string: copied)
        attachment.name = "share93-copied-share-url"
        attachment.lifetime = .keepAlways
        add(attachment)
        app.terminate()
    }

    func testShareAcquisition02ReplyAndInvite() {
        let app = loopLogin("share93_owner")
        tabButton(in: app, labels: ["Messages"]).tap()
        app.buttons["inbox-message-requests"].tap()
        let request = app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH %@", "message-request-")).firstMatch
        XCTAssertTrue(request.waitForExistence(timeout: 15)); request.tap()
        XCTAssertTrue(app.staticTexts["[share93] Hello from the shared link"].waitForExistence(timeout: 10))
        let reply = app.textViews["chat-composer-field"]
        XCTAssertTrue(reply.waitForExistence(timeout: 8))
        reply.tap(); reply.typeText("[share93] Yes, I will invite you")
        app.buttons["chat-composer-send"].tap()
        XCTAssertTrue(app.descendants(matching: .any)["direct-chat"].waitForExistence(timeout: 15))
        let context = app.buttons["conversation-context-bar"]
        XCTAssertTrue(context.waitForExistence(timeout: 20)); context.tap()
        let makePlan = app.buttons["conversation-context-make-plan"]
        XCTAssertTrue(makePlan.waitForExistence(timeout: 8)); makePlan.tap()
        XCTAssertTrue(app.descendants(matching: .any)["plan-create-sheet"].waitForExistence(timeout: 8))
        XCTAssertEqual(app.textFields["plan-create-title"].value as? String, "[share93] Coffee after class")
        let location = app.textFields["plan-create-location"]
        loopReveal(location, in: app); location.tap(); location.typeText("Library cafe")
        if app.buttons["plan-editor-keyboard-done"].exists { app.buttons["plan-editor-keyboard-done"].tap() }
        let submit = app.buttons["plan-create-submit"]
        let confirmTiming = app.switches["plan-confirm-timing"]
        if confirmTiming.exists {
            loopReveal(confirmTiming, in: app)
            loopCapture(app, "share93-02a-time-needs-reconfirmation")
            confirmTiming.tap()
        }
        XCTAssertTrue(waitUntilEnabled(submit, timeout: 5)); submit.tap()
        XCTAssertTrue(app.descendants(matching: .any)["plan-create-sheet"].waitForNonExistence(timeout: 15))
        loopCapture(app, "share93-02-native-invitation")
        app.terminate()
    }

    func testShareAcquisition03RegisteredGuestDeepLinkAndCalendar() throws {
        let url = try XCTUnwrap(ProcessInfo.processInfo.environment["SIDESEAT_SHARE_CHAT_URL"].flatMap(URL.init(string:)))
        let app = XCUIApplication()
        app.launchArguments = ["--ui-testing-signed-out", "--ui-testing-ephemeral-credentials", "--ui-testing-skip-tutorial", "--ui-testing-language=en", "--ui-testing-appearance=light"]
        app.configureForSideSeatLiveAPI()
        app.open(url)
        let login = app.textFields["login-identifier"]
        XCTAssertTrue(login.waitForExistence(timeout: 12)); login.tap(); login.typeText("share93_guest")
        let field = app.secureTextFields["login-password"]
        field.tap(); field.typeText(password); app.buttons["login-submit"].tap()
        let system = XCUIApplication(bundleIdentifier: "com.apple.springboard")
        let deny = system.buttons.matching(NSPredicate(format: "label IN %@", ["Don’t Allow", "Don't Allow", "不允许"])).firstMatch
        if deny.waitForExistence(timeout: 4) { deny.tap() }
        XCTAssertTrue(app.descendants(matching: .any)["direct-chat"].waitForExistence(timeout: 20), "Signing in must retain the shared conversation destination")
        XCTAssertTrue(app.buttons["conversation-current-plan"].waitForExistence(timeout: 12))
        loopCapture(app, "share93-03-deep-link-after-login")
        sendMessage("[share93] Continuing in the app", in: app)
        app.navigationBars.buttons.firstMatch.tap()
        tabButton(in: app, labels: ["Calendar"]).tap()
        XCTAssertTrue(app.staticTexts["[share93] Coffee after class"].waitForExistence(timeout: 15))
        loopCapture(app, "share93-04-guest-calendar")
        app.terminate()
    }

    func testShareAcquisition04OwnerSeesAcceptanceAndContinues() throws {
        let peer = try XCTUnwrap(ProcessInfo.processInfo.environment["SIDESEAT_SHARE_GUEST_NAME"])
        let app = loopLogin("share93_owner")
        tabButton(in: app, labels: ["Calendar"]).tap()
        XCTAssertTrue(app.staticTexts["[share93] Coffee after class"].waitForExistence(timeout: 15))
        loopCapture(app, "share93-05-owner-calendar")
        openDirectChat(in: app, peerName: peer)
        XCTAssertTrue(app.staticTexts["[share93] Continuing in the app"].waitForExistence(timeout: 12))
        XCTAssertTrue(app.staticTexts["Next meet-up · Confirmed"].waitForExistence(timeout: 12))
        sendMessage("[share93] We can keep chatting here", in: app)
        loopCapture(app, "share93-06-owner-continued-chat")
        app.terminate()
    }

    func testShareAcquisitionOwnerCalendarAndWebFallback() throws {
        let peer = try XCTUnwrap(ProcessInfo.processInfo.environment["SIDESEAT_SHARE_GUEST_NAME"])
        let app = loopLogin("share93_owner")
        tabButton(in: app, labels: ["Calendar"]).tap()
        XCTAssertTrue(app.staticTexts["[share93] Coffee after class"].waitForExistence(timeout: 15))
        loopCapture(app, "share93-05-owner-calendar")
        openDirectChat(in: app, peerName: peer)
        XCTAssertTrue(app.staticTexts["[share93] Continuing from the browser"].waitForExistence(timeout: 15))
        XCTAssertTrue(app.staticTexts["Next meet-up · Confirmed"].waitForExistence(timeout: 15))
        sendMessage("[share93] We can keep chatting here", in: app)
        loopCapture(app, "share93-06-owner-web-continuation")
        app.terminate()
    }

    func testShareAcquisition05GuestReloginKeepsConversation() {
        let app = loopLogin("share93_guest")
        openDirectChat(in: app, peerName: "Share Alex")
        XCTAssertTrue(app.staticTexts["[share93] We can keep chatting here"].waitForExistence(timeout: 12))
        XCTAssertTrue(app.staticTexts["[share93] Continuing in the app"].waitForExistence(timeout: 12))
        loopCapture(app, "share93-07-guest-persisted-chat")
        app.terminate()
    }

    func testClosedLoop01IntentBookmarkGreetingPlanAndCalendars() {
        let a = loopLogin("loopqa_a")
        loopCreateIntent("[loop-qa] Campus coffee", in: a)
        loopCapture(a, "01-intention")
        a.terminate()

        let b = loopLogin("loopqa_b")
        loopCreateIntent("[loop-qa] Campus coffee", in: b)
        loopSelectTogetherSection("recommendations", in: b)
        let bookmark = b.buttons.matching(NSPredicate(format: "identifier BEGINSWITH %@", "mutual-opportunity-bookmark-")).firstMatch
        XCTAssertTrue(bookmark.waitForExistence(timeout: 20))
        loopReveal(bookmark, in: b)
        let opportunityID = String(bookmark.identifier.dropFirst("mutual-opportunity-bookmark-".count))
        loopCapture(b, "02-recommendation")
        bookmark.tap()
        XCTAssertTrue(bookmark.exists, "Saving keeps the recommendation in place until refresh")
        let savedBookmark = XCTNSPredicateExpectation(predicate: NSPredicate(format: "label == %@", "Remove bookmark"), object: bookmark)
        XCTAssertEqual(XCTWaiter.wait(for: [savedBookmark], timeout: 8), .completed)
        loopSelectTogetherSection("bookmarks", in: b)
        XCTAssertTrue(bookmark.waitForExistence(timeout: 10))
        loopCapture(b, "03-saved")
        let greeting = b.buttons["mutual-opportunity-message-\(opportunityID)"]
        loopReveal(greeting, in: b)
        greeting.tap()
        let body = b.textFields["opportunity-message-body"]
        XCTAssertTrue(body.waitForExistence(timeout: 8))
        body.tap(); body.typeText("[loop-qa] Hello, may I join?")
        b.buttons["opportunity-message-submit"].tap()
        XCTAssertTrue(b.staticTexts["intention-chat-first-message"].waitForExistence(timeout: 15))
        XCTAssertFalse(b.buttons["chat-composer-send"].exists)
        loopCapture(b, "04-first-message")
        b.terminate()

        let receiver = loopLogin("loopqa_a")
        tabButton(in: receiver, labels: ["Messages"]).tap()
        receiver.buttons["inbox-message-requests"].tap()
        let request = receiver.buttons["message-request-\(opportunityID)"]
        XCTAssertTrue(request.waitForExistence(timeout: 15))
        request.tap()
        let reply = receiver.textViews["chat-composer-field"]
        XCTAssertTrue(reply.waitForExistence(timeout: 8))
        reply.tap(); reply.typeText("[loop-qa] Yes, let's meet!")
        receiver.buttons["chat-composer-send"].tap()
        XCTAssertTrue(receiver.descendants(matching: .any)["direct-chat"].waitForExistence(timeout: 15))
        XCTAssertTrue(receiver.staticTexts["[loop-qa] Hello, may I join?"].waitForExistence(timeout: 12))
        XCTAssertTrue(receiver.staticTexts["[loop-qa] Yes, let's meet!"].waitForExistence(timeout: 12))
        loopCapture(receiver, "05-replied-chat")
        receiver.buttons["conversation-context-bar"].tap()
        let makePlan = receiver.buttons["conversation-context-make-plan"]
        XCTAssertTrue(makePlan.waitForExistence(timeout: 8))
        loopCapture(receiver, "06-intention-in-chat")
        makePlan.tap()
        XCTAssertTrue(receiver.descendants(matching: .any)["plan-create-sheet"].waitForExistence(timeout: 8))
        XCTAssertEqual(receiver.textFields["plan-create-title"].value as? String, "[loop-qa] Campus coffee")
        let submit = receiver.buttons["plan-create-submit"]
        XCTAssertFalse(submit.isEnabled, "Undecided intention requires explicit plan timing")
        let timing = receiver.switches["plan-confirm-timing"]
        loopReveal(timing, in: receiver)
        timing.tap()
        XCTAssertTrue(waitUntilEnabled(submit, timeout: 5))
        loopCapture(receiver, "07-plan-proposal")
        submit.tap()
        XCTAssertTrue(receiver.descendants(matching: .any)["plan-create-sheet"].waitForNonExistence(timeout: 15))
        receiver.terminate()

        let accepter = loopLogin("loopqa_b")
        openDirectChat(in: accepter, peerName: "Loop Alex")
        let accept = accepter.buttons["Accept"].firstMatch
        XCTAssertTrue(accept.waitForExistence(timeout: 12))
        loopReveal(accept, in: accepter)
        accept.tap()
        let calendar = accepter.buttons["View calendar"].firstMatch
        XCTAssertTrue(calendar.waitForExistence(timeout: 15))
        loopCapture(accepter, "08-plan-confirmed")
        calendar.tap()
        XCTAssertTrue(accepter.staticTexts["[loop-qa] Campus coffee"].waitForExistence(timeout: 15))
        loopCapture(accepter, "09-calendar-mia")
        accepter.terminate()

        let proposer = loopLogin("loopqa_a")
        tabButton(in: proposer, labels: ["Calendar"]).tap()
        XCTAssertTrue(proposer.staticTexts["[loop-qa] Campus coffee"].waitForExistence(timeout: 15))
        loopCapture(proposer, "10-calendar-alex")
        proposer.terminate()
    }

    func testSamePeerLoop02OutcomesInOriginalChat() {
        for (username, peer, text) in [
            ("loopqa_a", "Loop Mia", "[same-peer] Thanks for today!"),
            ("loopqa_b", "Loop Alex", "[same-peer] Let's meet again!")
        ] {
            let app = loopLogin(username)
            tabButton(in: app, labels: ["Plans"]).tap()
            app.segmentedControls["plans-segmented-control"].buttons["Ended"].tap()
            let occurred = app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH %@", "plan-outcome-occurred-")).firstMatch
            XCTAssertTrue(occurred.waitForExistence(timeout: 12))
            let repeatBeforeFeedback = app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH %@", "plan-repeat-")).firstMatch
            loopReveal(repeatBeforeFeedback, in: app)
            repeatBeforeFeedback.tap()
            XCTAssertTrue(app.descendants(matching: .any)["plan-create-sheet"].waitForExistence(timeout: 8))
            XCTAssertEqual(app.textFields["plan-create-title"].value as? String, "[loop-qa] Campus coffee")
            XCTAssertFalse(app.buttons["plan-create-submit"].isEnabled)
            XCTAssertFalse(app.switches["plan-confirm-timing"].exists)
            loopCapture(app, "repeat-fix-before-feedback-\(username)")
            app.buttons["Cancel"].tap()
            XCTAssertTrue(app.descendants(matching: .any)["plan-create-sheet"].waitForNonExistence(timeout: 8))
            loopReveal(occurred, in: app)
            occurred.tap()
            let saved = app.descendants(matching: .any).matching(NSPredicate(format: "identifier BEGINSWITH %@", "plan-outcome-saved-")).firstMatch
            XCTAssertTrue(saved.waitForExistence(timeout: 12))
            loopCapture(app, "same-peer-11-outcome-\(username)")
            openDirectChat(in: app, peerName: peer)
            sendMessage(text, in: app)
            loopCapture(app, "same-peer-12-continued-chat-\(username)")
            app.terminate()
        }

    }

    func testSamePeerLoop02RepeatPlanInOriginalChat() {
        let proposer = loopLogin("loopqa_a")
        openDirectChat(in: proposer, peerName: "Loop Mia")
        XCTAssertTrue(proposer.staticTexts["[same-peer] Let's meet again!"].waitForExistence(timeout: 10))
        let repeatInChat = proposer.buttons.matching(NSPredicate(format: "identifier BEGINSWITH %@", "plan-repeat-")).firstMatch
        XCTAssertTrue(repeatInChat.waitForExistence(timeout: 8))
        loopReveal(repeatInChat, in: proposer)
        repeatInChat.tap()
        XCTAssertTrue(proposer.descendants(matching: .any)["plan-create-sheet"].waitForExistence(timeout: 8))
        XCTAssertEqual(proposer.textFields["plan-create-title"].value as? String, "[loop-qa] Campus coffee")
        let title = proposer.textFields["plan-create-title"]
        title.tap()
        title.typeKey("a", modifierFlags: .command)
        title.typeText("[same-peer] Coffee again")
        XCTAssertEqual(title.value as? String, "[same-peer] Coffee again")
        proposer.buttons["plan-editor-keyboard-done"].tap()
        let submit = proposer.buttons["plan-create-submit"]
        XCTAssertFalse(submit.isEnabled)
        let chooseTime = proposer.buttons["plan-repeat-choose-time"]
        loopReveal(chooseTime, in: proposer)
        chooseTime.tap()
        let done = proposer.buttons["plan-repeat-time-done"]
        XCTAssertTrue(done.waitForExistence(timeout: 8))
        done.tap()
        XCTAssertTrue(waitUntilEnabled(submit, timeout: 5))
        loopCapture(proposer, "same-peer-13-second-plan-draft")
        submit.tap()
        XCTAssertTrue(proposer.descendants(matching: .any)["plan-create-sheet"].waitForNonExistence(timeout: 15),
            "An ended first plan must not prevent another plan with the same person")
        XCTAssertTrue(proposer.staticTexts["[same-peer] Coffee again"].firstMatch.waitForExistence(timeout: 12))
        XCTAssertTrue(proposer.staticTexts["Waiting for Loop Mia"].waitForExistence(timeout: 12))
        loopCapture(proposer, "same-peer-14-second-plan-sent")
        proposer.terminate()
    }

    func testSamePeerLoop03AcceptSecondPlanAndCalendars() {
        let receiver = loopLogin("loopqa_b")
        tabButton(in: receiver, labels: ["Plans"]).tap()
        XCTAssertTrue(receiver.staticTexts["[same-peer] Coffee again"].firstMatch.waitForExistence(timeout: 15))
        loopCapture(receiver, "same-peer-15-second-invitation-overview")
        openDirectChat(in: receiver, peerName: "Loop Alex")
        XCTAssertTrue(receiver.buttons["conversation-current-plan"].waitForExistence(timeout: 12))
        XCTAssertTrue(receiver.staticTexts["Waiting for your reply"].waitForExistence(timeout: 12))
        let accept = receiver.buttons["Accept"].firstMatch
        XCTAssertTrue(accept.waitForExistence(timeout: 12))
        loopReveal(accept, in: receiver)
        accept.tap()
        XCTAssertTrue(accept.waitForNonExistence(timeout: 15))
        XCTAssertTrue(receiver.staticTexts["Next meet-up · Confirmed"].waitForExistence(timeout: 12))
        loopCapture(receiver, "same-peer-16-second-plan-accepted")
        receiver.navigationBars.buttons.firstMatch.tap()
        tabButton(in: receiver, labels: ["Calendar"]).tap()
        XCTAssertTrue(receiver.staticTexts["[same-peer] Coffee again"].waitForExistence(timeout: 15))
        loopCapture(receiver, "same-peer-17-calendar-mia")
        receiver.terminate()

        let reloaded = loopLogin("loopqa_a")
        tabButton(in: reloaded, labels: ["Calendar"]).tap()
        XCTAssertTrue(reloaded.staticTexts["[same-peer] Coffee again"].waitForExistence(timeout: 15))
        loopCapture(reloaded, "same-peer-18-calendar-alex")
        openDirectChat(in: reloaded, peerName: "Loop Mia")
        XCTAssertTrue(reloaded.staticTexts["Next meet-up · Confirmed"].waitForExistence(timeout: 12))
        XCTAssertTrue(reloaded.staticTexts["[same-peer] Coffee again"].firstMatch.waitForExistence(timeout: 10))
        loopCapture(reloaded, "same-peer-19-persisted-original-chat")
        reloaded.navigationBars.buttons.firstMatch.tap()
        tabButton(in: reloaded, labels: ["Plans"]).tap()
        reloaded.segmentedControls["plans-segmented-control"].buttons["Ended"].tap()
        let ended = reloaded.buttons.matching(NSPredicate(format: "identifier BEGINSWITH %@", "plans-row-")).firstMatch
        XCTAssertTrue(ended.waitForExistence(timeout: 10))
        ended.tap()
        XCTAssertTrue(reloaded.descendants(matching: .any)["direct-chat"].waitForExistence(timeout: 12))
        XCTAssertTrue(reloaded.staticTexts["Viewing · Ended"].waitForExistence(timeout: 12))
        loopCapture(reloaded, "repeat-fix-historical-header")
        let repeatInHistory = reloaded.buttons.matching(NSPredicate(format: "identifier BEGINSWITH %@", "plan-repeat-")).firstMatch
        loopReveal(repeatInHistory, in: reloaded)
        repeatInHistory.tap()
        XCTAssertTrue(reloaded.descendants(matching: .any)["plan-create-sheet"].waitForExistence(timeout: 8))
        loopCapture(reloaded, "same-peer-20-ended-plan-repeat-entry")
        reloaded.buttons["Cancel"].tap()
        XCTAssertTrue(reloaded.descendants(matching: .any)["plan-create-sheet"].waitForNonExistence(timeout: 8))
        reloaded.buttons["conversation-view-current"].tap()
        XCTAssertTrue(reloaded.staticTexts["Next meet-up · Confirmed"].waitForExistence(timeout: 12))
        reloaded.terminate()
    }

    func testSamePeerLoop04ReopenConversationShowsLatestPlan() {
        let app = loopLogin("loopqa_a")
        openDirectChat(in: app, peerName: "Loop Mia")
        let latestPlan = app.staticTexts["[same-peer] Coffee again"].firstMatch
        let visible = XCTNSPredicateExpectation(
            predicate: NSPredicate(format: "exists == true AND hittable == true"),
            object: latestPlan
        )
        let result = XCTWaiter.wait(for: [visible], timeout: 15)
        loopCapture(app, "same-peer-21-reopened-latest-plan")
        XCTAssertEqual(result, .completed, "Opening the original chat must reveal the latest accepted plan without manual scrolling.")
        app.buttons["conversation-current-plan"].tap()
        XCTAssertTrue(app.staticTexts["Selected plan"].waitForExistence(timeout: 8))
        app.navigationBars.buttons.firstMatch.tap()
        tabButton(in: app, labels: ["Plans"]).tap()
        app.segmentedControls["plans-segmented-control"].buttons["Ended"].tap()
        let ended = app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH %@", "plans-row-")).firstMatch
        XCTAssertTrue(ended.waitForExistence(timeout: 10))
        ended.tap()
        XCTAssertTrue(app.staticTexts["Viewing · Ended"].waitForExistence(timeout: 12))
        XCTAssertTrue(app.staticTexts["Selected plan"].waitForExistence(timeout: 8))
        XCTAssertFalse(app.staticTexts["Current Plan"].exists)
        XCTAssertGreaterThanOrEqual(app.buttons["conversation-view-current"].frame.height, 44)
        loopCapture(app, "repeat-fix-historical-header")
        app.buttons["conversation-view-current"].tap()
        XCTAssertTrue(app.staticTexts["Next meet-up · Confirmed"].waitForExistence(timeout: 12))
        loopCapture(app, "repeat-fix-return-current")
        app.terminate()
    }

    func testClosedLoop02OutcomesContinueChatAndFindNewCompany() {
        for (username, peer, text) in [
            ("loopqa_a", "Loop Mia", "[loop-qa] Thanks for today!"),
            ("loopqa_b", "Loop Alex", "[loop-qa] Great to meet you!")
        ] {
            let app = loopLogin(username)
            tabButton(in: app, labels: ["Plans"]).tap()
            app.segmentedControls["plans-segmented-control"].buttons["Ended"].tap()
            let occurred = app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH %@", "plan-outcome-occurred-")).firstMatch
            XCTAssertTrue(occurred.waitForExistence(timeout: 12))
            loopReveal(occurred, in: app)
            occurred.tap()
            let saved = app.descendants(matching: .any).matching(NSPredicate(format: "identifier BEGINSWITH %@", "plan-outcome-saved-")).firstMatch
            XCTAssertTrue(saved.waitForExistence(timeout: 12))
            loopCapture(app, "11-outcome-\(username)")
            openDirectChat(in: app, peerName: peer)
            sendMessage(text, in: app)
            loopCapture(app, "12-continued-chat-\(username)")
            app.terminate()
        }
        let c = loopLogin("loopqa_c")
        loopCreateIntent("[loop-qa] Meet someone new", in: c)
        c.terminate()
        let a = loopLogin("loopqa_a")
        openDirectChat(in: a, peerName: "Loop Mia")
        XCTAssertTrue(a.staticTexts["[loop-qa] Great to meet you!"].waitForExistence(timeout: 10))
        a.navigationBars.buttons.firstMatch.tap()
        loopCreateIntent("[loop-qa] Meet someone new", in: a)
        loopSelectTogetherSection("recommendations", in: a)
        XCTAssertTrue(a.staticTexts["Loop Lee"].waitForExistence(timeout: 20))
        XCTAssertFalse(a.staticTexts["Loop Mia"].exists)
        loopCapture(a, "13-new-company")
        loopSelectTogetherSection("bookmarks", in: a)
        let oldChat = a.buttons.matching(NSPredicate(format: "identifier BEGINSWITH %@", "mutual-opportunity-open-")).firstMatch
        // The bookmark belongs to Mia, not Alex: check privacy across accounts.
        XCTAssertFalse(oldChat.exists)
        a.terminate()
        let b = loopLogin("loopqa_b")
        loopSelectTogetherSection("bookmarks", in: b)
        let chat = b.buttons.matching(NSPredicate(format: "identifier BEGINSWITH %@", "mutual-opportunity-open-")).firstMatch
        XCTAssertTrue(chat.waitForExistence(timeout: 12))
        loopReveal(chat, in: b); chat.tap()
        XCTAssertTrue(b.descendants(matching: .any)["direct-chat"].waitForExistence(timeout: 12))
        XCTAssertTrue(b.staticTexts["[loop-qa] Thanks for today!"].waitForExistence(timeout: 8))
        loopCapture(b, "14-saved-history-chat")
        b.terminate()
    }

    // Second loop: run 01, compress the first plan time, then 02 → 03 → 04.
    func testNewIntentLoop02OutcomesAndOriginalChat() {
        for (username, peer, text) in [
            ("loopqa_a", "Loop Mia", "[loop-qa] Thanks for today!"),
            ("loopqa_b", "Loop Alex", "[loop-qa] Great to meet you!")
        ] {
            let app = loopLogin(username)
            tabButton(in: app, labels: ["Plans"]).tap()
            app.segmentedControls["plans-segmented-control"].buttons["Ended"].tap()
            let occurred = app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH %@", "plan-outcome-occurred-")).firstMatch
            XCTAssertTrue(occurred.waitForExistence(timeout: 12))
            loopReveal(occurred, in: app)
            occurred.tap()
            let saved = app.descendants(matching: .any).matching(NSPredicate(format: "identifier BEGINSWITH %@", "plan-outcome-saved-")).firstMatch
            XCTAssertTrue(saved.waitForExistence(timeout: 12))
            loopCapture(app, "new-intent-11-outcome-\(username)")
            openDirectChat(in: app, peerName: peer)
            sendMessage(text, in: app)
            loopCapture(app, "new-intent-12-old-chat-\(username)")
            app.terminate()
        }
    }

    func testNewIntentLoop03CancelNewDraftWithoutChangingHistory() {
        let app = loopLogin("loopqa_a")
        tabButton(in: app, labels: ["Together"]).tap()
        loopSelectTogetherSection("intentions", in: app)
        let add = app.buttons["together-add-first-intent"]
        XCTAssertTrue(add.waitForExistence(timeout: 12))
        loopCapture(app, "new-intent-13-return-to-intentions")
        add.tap()
        let activity = app.textFields["intent-editor-activity"]
        XCTAssertTrue(activity.waitForExistence(timeout: 8))
        XCTAssertEqual(activity.value as? String, activity.placeholderValue ?? "")
        XCTAssertTrue(app.buttons["intent-timing-choose"].label.contains("Time undecided"))
        loopCapture(app, "new-intent-14-blank-draft")
        activity.tap(); activity.typeText("[new-loop] Cancel this draft")
        app.buttons["Cancel"].tap()
        XCTAssertTrue(app.descendants(matching: .any)["intent-editor"].waitForNonExistence(timeout: 8))
        XCTAssertFalse(app.staticTexts["[new-loop] Cancel this draft"].exists)
        XCTAssertTrue(add.exists)
        add.tap()
        XCTAssertTrue(activity.waitForExistence(timeout: 8))
        XCTAssertEqual(activity.value as? String, activity.placeholderValue ?? "")
        app.buttons["Cancel"].tap()
        openDirectChat(in: app, peerName: "Loop Mia")
        XCTAssertTrue(app.staticTexts["[loop-qa] Great to meet you!"].waitForExistence(timeout: 12))
        loopCapture(app, "new-intent-15-history-after-cancel")
        app.terminate()
    }

    func testNewIntentLoop04PublishAndDiscoverNewCompany() {
        let title = "[new-loop] Library coffee"
        let c = loopLogin("loopqa_c")
        loopCreateIntent(title, in: c)
        c.terminate()

        let a = loopLogin("loopqa_a")
        loopCreateIntent(title, in: a)
        loopCapture(a, "new-intent-16-new-publication")
        loopSelectTogetherSection("recommendations", in: a)
        XCTAssertTrue(a.staticTexts["Loop Lee"].waitForExistence(timeout: 20))
        XCTAssertFalse(a.staticTexts["Loop Mia"].exists)
        let greeting = a.buttons.matching(NSPredicate(format: "identifier BEGINSWITH %@", "mutual-opportunity-message-")).firstMatch
        loopReveal(greeting, in: a)
        XCTAssertTrue(greeting.isEnabled)
        loopCapture(a, "new-intent-17-new-company")
        loopSelectTogetherSection("bookmarks", in: a)
        let privateBookmark = a.buttons.matching(NSPredicate(format: "identifier BEGINSWITH %@", "mutual-opportunity-open-")).firstMatch
        XCTAssertFalse(privateBookmark.exists)
        openDirectChat(in: a, peerName: "Loop Mia")
        XCTAssertTrue(a.staticTexts["[loop-qa] Great to meet you!"].waitForExistence(timeout: 12))
        loopCapture(a, "new-intent-18-original-chat-retained")
        a.terminate()

        let newPeer = loopLogin("loopqa_c")
        XCTAssertTrue(newPeer.descendants(matching: .any)["together-home"].waitForExistence(timeout: 12))
        loopSelectTogetherSection("recommendations", in: newPeer)
        XCTAssertTrue(newPeer.staticTexts["Loop Alex"].waitForExistence(timeout: 20))
        loopCapture(newPeer, "new-intent-19-new-peer-recommendation")
        newPeer.terminate()

        let returning = loopLogin("loopqa_a")
        loopSelectTogetherSection("intentions", in: returning)
        XCTAssertTrue(returning.staticTexts[title].firstMatch.waitForExistence(timeout: 12))
        loopCapture(returning, "new-intent-20-reloaded-publication")
        returning.terminate()

        let b = loopLogin("loopqa_b")
        loopSelectTogetherSection("bookmarks", in: b)
        let chat = b.buttons.matching(NSPredicate(format: "identifier BEGINSWITH %@", "mutual-opportunity-open-")).firstMatch
        XCTAssertTrue(chat.waitForExistence(timeout: 12))
        loopReveal(chat, in: b); chat.tap()
        XCTAssertTrue(b.descendants(matching: .any)["direct-chat"].waitForExistence(timeout: 12))
        XCTAssertTrue(b.staticTexts["[loop-qa] Thanks for today!"].waitForExistence(timeout: 12))
        loopCapture(b, "new-intent-21-saved-history-chat")
        b.terminate()
    }

    func testNewIntentLoop06CompletedPlanDraftCancelsBeforeFeedback() {
        let app = loopLogin("loopqa_a")
        tabButton(in: app, labels: ["Plans"]).tap()
        app.buttons["Ended"].tap()
        let create = app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH %@", "plan-new-intention-")).firstMatch
        XCTAssertTrue(create.waitForExistence(timeout: 12))
        let planID = String(create.identifier.dropFirst("plan-new-intention-".count))
        XCTAssertTrue(app.buttons["plan-outcome-occurred-\(planID)"].exists)
        loopReveal(create, in: app)
        loopCapture(app, "return-flow-01-both-paths-before-feedback")
        create.tap()
        let field = app.textFields["intent-editor-activity"]
        XCTAssertTrue(field.waitForExistence(timeout: 8))
        XCTAssertEqual(field.value as? String, "[loop-qa] Campus coffee")
        XCTAssertTrue(app.buttons["intent-timing-choose"].label.contains("Time undecided"))
        XCTAssertTrue(app.staticTexts["intent-topic-required"].exists)
        XCTAssertFalse(app.buttons["intent-editor-save"].isEnabled)
        loopCapture(app, "return-flow-02-independent-draft")
        app.buttons["intent-topic-coffee"].tap()
        field.tap(); field.typeText(" Canceled")
        app.buttons["Cancel"].tap()
        XCTAssertTrue(app.descendants(matching: .any)["intent-editor"].waitForNonExistence(timeout: 8))
        XCTAssertTrue(app.buttons["Ended"].isSelected)
        XCTAssertTrue(create.isHittable)
        let repeatButton = app.buttons["plan-repeat-\(planID)"]
        XCTAssertTrue(repeatButton.label.contains("Loop Mia"))
        repeatButton.tap()
        XCTAssertTrue(app.descendants(matching: .any)["plan-create-sheet"].waitForExistence(timeout: 8))
        XCTAssertTrue(app.navigationBars.staticTexts["Plan again with Loop Mia"].exists)
        app.buttons["Cancel"].tap()
        app.buttons["plans-row-\(planID)"].tap()
        XCTAssertTrue(app.descendants(matching: .any)["direct-chat"].waitForExistence(timeout: 12))
        let inChat = app.buttons["plan-new-intention-\(planID)"]
        loopReveal(inChat, in: app); inChat.tap()
        XCTAssertTrue(field.waitForExistence(timeout: 8))
        XCTAssertEqual(field.value as? String, "[loop-qa] Campus coffee")
        XCTAssertTrue(app.buttons["intent-timing-choose"].label.contains("Time undecided"))
        app.buttons["Cancel"].tap()
        XCTAssertTrue(app.descendants(matching: .any)["intent-editor"].waitForNonExistence(timeout: 8))
        XCTAssertTrue(app.descendants(matching: .any)["direct-chat"].exists)
        loopCapture(app, "return-flow-03-cancel-keeps-chat")
        app.terminate()
    }

    func testNewIntentLoop07PublishFromCompletedPlan() {
        let title = "[new-loop] Library coffee"
        let c = loopLogin("loopqa_c")
        loopCreateIntent(title, in: c)
        c.terminate()

        loopPublishFromCompletedPlan()
    }

    // Used only after check-peer-ready verifies that the failed attempt never published Alex's draft.
    func testNewIntentLoop07ResumeAfterPeerPublication() {
        loopPublishFromCompletedPlan()
    }

    private func loopPublishFromCompletedPlan() {
        let title = "[new-loop] Library coffee"
        let a = loopLogin("loopqa_a")
        tabButton(in: a, labels: ["Plans"]).tap()
        a.buttons["Ended"].tap()
        let create = a.buttons.matching(NSPredicate(format: "identifier BEGINSWITH %@", "plan-new-intention-")).firstMatch
        XCTAssertTrue(create.waitForExistence(timeout: 12))
        loopReveal(create, in: a); create.tap()
        let field = a.textFields["intent-editor-activity"]
        XCTAssertTrue(field.waitForExistence(timeout: 8))
        XCTAssertEqual(field.value as? String, "[loop-qa] Campus coffee")
        a.buttons["intent-topic-coffee"].tap()
        XCTAssertTrue(a.buttons["intent-timing-choose"].label.contains("Time undecided"))
        // The prefilled title is one line; tap after its trailing edge before deleting.
        field.coordinate(withNormalizedOffset: CGVector(dx: 0.98, dy: 0.8)).tap()
        field.typeText(String(repeating: XCUIKeyboardKey.delete.rawValue, count: "[loop-qa] Campus coffee".count))
        XCTAssertEqual(field.value as? String, field.placeholderValue ?? "", "Clear the prefilled title before typing")
        field.typeText(title)
        XCTAssertEqual(field.value as? String, title, "Replace the entire prefilled title before publishing")
        a.buttons["intent-editor-save"].tap()
        XCTAssertTrue(a.descendants(matching: .any)["intent-editor"].waitForNonExistence(timeout: 15))
        XCTAssertTrue(a.buttons["together-view-recommendations"].waitForExistence(timeout: 15))
        XCTAssertTrue(a.staticTexts[title].firstMatch.waitForExistence(timeout: 12))
        loopCapture(a, "return-flow-16-new-publication")
        a.buttons["together-view-recommendations"].tap()
        XCTAssertTrue(a.staticTexts["Loop Lee"].waitForExistence(timeout: 20))
        XCTAssertFalse(a.staticTexts["Loop Mia"].exists)
        let greeting = a.buttons.matching(NSPredicate(format: "identifier BEGINSWITH %@", "mutual-opportunity-message-")).firstMatch
        loopReveal(greeting, in: a)
        XCTAssertTrue(greeting.isEnabled)
        loopCapture(a, "return-flow-17-new-company")
        loopSelectTogetherSection("bookmarks", in: a)
        let privateBookmark = a.buttons.matching(NSPredicate(format: "identifier BEGINSWITH %@", "mutual-opportunity-open-")).firstMatch
        XCTAssertFalse(privateBookmark.exists)
        openDirectChat(in: a, peerName: "Loop Mia")
        XCTAssertTrue(a.staticTexts["[loop-qa] Great to meet you!"].waitForExistence(timeout: 12))
        loopCapture(a, "return-flow-18-original-chat-retained")
        a.terminate()

        let newPeer = loopLogin("loopqa_c")
        XCTAssertTrue(newPeer.descendants(matching: .any)["together-home"].waitForExistence(timeout: 12))
        loopSelectTogetherSection("recommendations", in: newPeer)
        XCTAssertTrue(newPeer.staticTexts["Loop Alex"].waitForExistence(timeout: 20))
        loopCapture(newPeer, "return-flow-19-new-peer-recommendation")
        newPeer.terminate()

        let returning = loopLogin("loopqa_a")
        loopSelectTogetherSection("intentions", in: returning)
        XCTAssertTrue(returning.staticTexts[title].firstMatch.waitForExistence(timeout: 12))
        loopCapture(returning, "return-flow-20-reloaded-publication")
        returning.terminate()

        let b = loopLogin("loopqa_b")
        loopSelectTogetherSection("bookmarks", in: b)
        let chat = b.buttons.matching(NSPredicate(format: "identifier BEGINSWITH %@", "mutual-opportunity-open-")).firstMatch
        XCTAssertTrue(chat.waitForExistence(timeout: 12))
        loopReveal(chat, in: b); chat.tap()
        XCTAssertTrue(b.descendants(matching: .any)["direct-chat"].waitForExistence(timeout: 12))
        XCTAssertTrue(b.staticTexts["[loop-qa] Thanks for today!"].waitForExistence(timeout: 12))
        loopCapture(b, "return-flow-21-saved-history-chat")
        b.terminate()
    }

    func testNewIntentLoop08AdaptiveNavigationAndEmptyState() {
        for (language, appearance, size, expectedTitle) in [
            ("en", "light", "UICTContentSizeCategoryL", "Add an intention"),
            ("zh-Hans", "light", "UICTContentSizeCategoryL", "添加意愿"),
            ("de", "light", "UICTContentSizeCategoryL", "Vorhaben hinzufügen"),
            ("en", "dark", "UICTContentSizeCategoryAccessibilityXXXL", "Add an intention"),
            ("zh-Hans", "dark", "UICTContentSizeCategoryAccessibilityXXXL", "添加意愿"),
            ("de", "dark", "UICTContentSizeCategoryAccessibilityXXXL", "Vorhaben hinzufügen")
        ] {
            let app = launchAndLogin(username: "loopqa_b", additionalLaunchArguments: [
                "--ui-testing-discover", "--ui-testing-language=\(language)",
                "--ui-testing-appearance=\(appearance)", "-UIPreferredContentSizeCategoryName", size
            ])
            XCTAssertTrue(app.descendants(matching: .any)["together-home"].waitForExistence(timeout: 12))
            let menu = app.buttons["together-section-menu"]
            if size.contains("Accessibility") {
                XCTAssertTrue(menu.waitForExistence(timeout: 8))
                XCTAssertLessThan(menu.frame.height, app.frame.height * 0.2, "Only the current section occupies fixed space")
                XCTAssertGreaterThanOrEqual(menu.frame.height, 44)
                menu.tap()
                loopCapture(app, "adaptive-picker-\(language)-\(appearance)")
                let selected = app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH %@ AND selected == true", "together-tab-")).firstMatch
                XCTAssertTrue(selected.exists)
                app.buttons["together-tab-intentions"].tap()
            } else {
                loopSelectTogetherSection("intentions", in: app)
            }
            let add = app.buttons["together-add-first-intent"]
            XCTAssertTrue(add.waitForExistence(timeout: 12))
            XCTAssertEqual(add.label, expectedTitle)
            XCTAssertGreaterThanOrEqual(add.frame.height, 44)
            XCTAssertTrue(add.isHittable, "Add is reachable immediately, without scrolling through duplicate headings")
            XCTAssertLessThan(add.frame.maxY, app.tabBars.firstMatch.frame.minY)
            loopCapture(app, "adaptive-empty-\(language)-\(appearance)")
            add.tap()
            XCTAssertTrue(app.descendants(matching: .any)["intent-editor"].waitForExistence(timeout: 8))
            let cancel = app.navigationBars.buttons.matching(NSPredicate(format: "label IN %@", ["Cancel", "取消", "Abbrechen"])).firstMatch
            cancel.tap()
            XCTAssertTrue(app.descendants(matching: .any)["intent-editor"].waitForNonExistence(timeout: 8))
            loopSelectTogetherSection("recommendations", in: app)
            loopSelectTogetherSection("bookmarks", in: app)
            let chat = app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH %@", "mutual-opportunity-open-")).firstMatch
            XCTAssertTrue(chat.waitForExistence(timeout: 12))
            loopReveal(chat, in: app)
            let savedY = chat.frame.minY
            loopSelectTogetherSection("intentions", in: app)
            XCTAssertTrue(add.waitForExistence(timeout: 8))
            loopSelectTogetherSection("bookmarks", in: app)
            XCTAssertEqual(chat.frame.minY, savedY, accuracy: 12, "Section selection retains the saved page's scroll position")
            loopCapture(app, "adaptive-saved-\(language)-\(appearance)")
            app.terminate()
        }
    }

    private func loopSelectTogetherSection(_ section: String, in app: XCUIApplication) {
        let menu = app.buttons["together-section-menu"]
        if menu.exists { menu.tap() }
        let item = app.buttons["together-tab-\(section)"]
        XCTAssertTrue(item.waitForExistence(timeout: 8))
        item.tap()
        XCTAssertTrue(app.descendants(matching: .any)["together-section-picker"].waitForNonExistence(timeout: 8))
    }

    private func loopSelectPlanSection(_ section: String, in app: XCUIApplication) {
        let menu = app.buttons["plans-section-menu"]
        if menu.exists {
            menu.tap()
            let item = app.buttons["plans-tab-\(section)"]
            XCTAssertTrue(item.waitForExistence(timeout: 8))
            item.tap()
            XCTAssertTrue(app.descendants(matching: .any)["plans-section-picker"].waitForNonExistence(timeout: 8))
        } else {
            let index = ["waitingResponse", "upcoming", "ended"].firstIndex(of: section)!
            let picker = app.segmentedControls["plans-segmented-control"]
            XCTAssertTrue(picker.waitForExistence(timeout: 8))
            picker.buttons.element(boundBy: index).tap()
        }
    }

    /// Drives the installed Preview on an iPhone. This checks native interactions,
    /// not VoiceOver speech or its focus-return behavior.
    func testPreviewDevicePlanNavigationAndFeedback() throws {
        try XCTSkipUnless(ProcessInfo.processInfo.environment["SIDESEAT_PHYSICAL_PREVIEW_UI_TESTS"] == "1")
        let app = XCUIApplication(bundleIdentifier: "app.sideseat.mobile.preview")
        let fixtureArguments = ["--ui-testing-authenticated", "--ui-testing-ephemeral-credentials", "--ui-testing-skip-tutorial"]
        app.launchArguments = fixtureArguments + ["--ui-testing-plan-navigation"]
        app.launch()
        defer { app.terminate() }

        tabButton(in: app, labels: ["Plans", "计划", "Pläne"]).tap()
        loopSelectPlanSection("ended", in: app)
        let old = app.buttons["plans-row-nav-old"]
        XCTAssertTrue(old.waitForExistence(timeout: 10)); old.tap()
        let header = app.buttons["conversation-current-plan"]
        XCTAssertTrue(header.waitForExistence(timeout: 10))
        XCTAssertTrue(header.label.contains("A long original plan"))
        header.tap()
        XCTAssertTrue(app.staticTexts["A long original plan for an afternoon of coffee and conversation at the campus library"].firstMatch.isHittable)
        loopCapture(app, "phone-preview-history-plan")

        let menu = app.buttons["conversation-plan-menu"]
        menu.tap(); app.buttons["conversation-all-plans"].tap()
        let done = app.navigationBars.buttons.matching(NSPredicate(format: "label IN %@", ["Done", "完成", "Fertig"])).firstMatch
        XCTAssertTrue(done.waitForExistence(timeout: 5)); done.tap()
        XCTAssertTrue(menu.waitForExistence(timeout: 5))
        XCTAssertTrue(header.label.contains("A long original plan"), "Closing the list keeps the selected historical plan")
        menu.tap(); app.buttons["conversation-all-plans"].tap()
        let later = app.buttons["conversation-select-plan-nav-later"]
        loopReveal(later, in: app); later.tap()
        XCTAssertTrue(header.label.contains("A later confirmed plan"))
        // A large phone may already show the last message below the later plan.
        // Explicitly return to the earlier current plan before testing Latest.
        let current = app.buttons["conversation-view-current"]
        XCTAssertTrue(current.waitForExistence(timeout: 5)); current.tap()
        XCTAssertTrue(header.label.contains("Reply to the next library plan"))
        let latest = app.buttons["chat-new-messages"]
        XCTAssertTrue(latest.waitForExistence(timeout: 5)); latest.tap()
        XCTAssertTrue(app.staticTexts["Navigation message 7"].isHittable)
        loopCapture(app, "phone-preview-latest-message")

        // A fresh in-memory fixture supplies an unanswered completed plan.
        app.terminate()
        app.launchArguments = fixtureArguments
        app.launch()
        tabButton(in: app, labels: ["Plans", "计划", "Pläne"]).tap()
        loopSelectPlanSection("ended", in: app)
        let id = "ui-plan-completed"
        let scroll = app.scrollViews["plans-scroll-ended"]
        let answer = app.buttons["plan-outcome-occurred-\(id)"]
        revealOutcome(answer, in: app, scroll: scroll); answer.tap()
        let edit = app.buttons["plan-outcome-edit-\(id)"]
        XCTAssertTrue(edit.waitForExistence(timeout: 5))
        revealOutcome(edit, in: app, scroll: scroll)
        let saved = app.descendants(matching: .any)["plan-outcome-saved-\(id)"].firstMatch
        XCTAssertTrue(saved.exists)
        let confirmedAnswer = try XCTUnwrap(saved.value as? String)
        XCTAssertFalse(confirmedAnswer.isEmpty)
        edit.tap()
        let cancel = app.buttons["plan-outcome-cancel-\(id)"]
        revealOutcome(cancel, in: app, scroll: scroll)
        XCTAssertTrue(answer.isSelected)
        cancel.tap()
        XCTAssertTrue(cancel.waitForNonExistence(timeout: 5))
        XCTAssertEqual(saved.value as? String, confirmedAnswer)
        XCTAssertTrue(edit.isHittable)
        loopCapture(app, "phone-preview-feedback-cancel")
    }

    func testNewIntentLoop11ChatHeaderBoundsAndDraft() {
        for (language, size) in [("de", "UICTContentSizeCategoryAccessibilityXXXL"),
                                 ("en", "UICTContentSizeCategoryAccessibilityXXXL"),
                                 ("zh-Hans", "UICTContentSizeCategoryAccessibilityXXXL"),
                                 ("de", "UICTContentSizeCategoryL"), ("en", "UICTContentSizeCategoryL"), ("zh-Hans", "UICTContentSizeCategoryL")] {
            let large = size.contains("Accessibility")
            let app = launchAndLogin(username: "loopqa_a", additionalLaunchArguments: [
                "--ui-testing-discover", "--ui-testing-language=\(language)", "--ui-testing-appearance=\(large ? "dark" : "light")",
                "-UIPreferredContentSizeCategoryName", size
            ])
            tabButton(in: app, labels: ["Plans", "计划", "Pläne"]).tap()
            loopSelectPlanSection("ended", in: app)
            let row = app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH %@", "plans-row-")).firstMatch
            XCTAssertTrue(row.waitForExistence(timeout: 12)); row.tap()
            XCTAssertTrue(app.descendants(matching: .any)["direct-chat"].waitForExistence(timeout: 12))
            let header = app.buttons["conversation-current-plan"]
            XCTAssertTrue(header.waitForExistence(timeout: 12))
            let list = app.scrollViews["chat-message-list"]
            loopCapture(app, "chat-header-\(language)-\(large)")
            XCTAssertGreaterThanOrEqual(header.frame.minY, app.navigationBars.firstMatch.frame.maxY - 1)
            XCTAssertLessThan(header.frame.height, app.frame.height * 0.22)
            XCTAssertLessThanOrEqual(header.frame.maxY, list.frame.minY + 1)
            if large {
                let field = app.textViews["chat-composer-field"]
                let draft = String(repeating: "Keep this draft safely. ", count: 4)
                field.tap(); field.typeText(draft)
                XCTAssertTrue(app.keyboards.firstMatch.waitForExistence(timeout: 5))
                XCTAssertEqual(field.value as? String, draft)
                XCTAssertTrue(app.staticTexts["[loop-qa] Campus coffee"].firstMatch.isHittable,
                              "Opening the keyboard while reading a historical plan retains that reading anchor")
                let composer = app.descendants(matching: .any)["chat-composer"].firstMatch
                let bounds = XCTAttachment(string: "header=\(header.frame), list=\(list.frame), composer=\(composer.frame), keyboard=\(app.keyboards.firstMatch.frame)")
                bounds.name = "keyboard-bounds-\(language)"; bounds.lifetime = .keepAlways; add(bounds)
                loopCapture(app, "chat-keyboard-\(language)")
                XCTAssertGreaterThanOrEqual(list.frame.height, 112, "At least two body lines remain scrollable at the largest text size")
                XCTAssertLessThanOrEqual(composer.frame.maxY, app.keyboards.firstMatch.frame.minY + 1)
                XCTAssertTrue(app.buttons["chat-composer-send"].isHittable)
                header.tap()
                XCTAssertTrue(app.keyboards.firstMatch.waitForNonExistence(timeout: 5))
                XCTAssertEqual(field.value as? String, draft)
                let latest = app.buttons["chat-new-messages"]
                let hasLatest = latest.waitForExistence(timeout: 5)
                if !hasLatest { loopCapture(app, "chat-missing-latest-\(language)"); let tree = XCTAttachment(string: app.debugDescription); tree.lifetime = .keepAlways; add(tree) }
                XCTAssertTrue(hasLatest); latest.tap()
                XCTAssertTrue(header.waitForNonExistence(timeout: 5), "No current plan exists; latest clears the historical plan selection")
                let incoming = app.staticTexts.matching(NSPredicate(format: "label BEGINSWITH %@", "[chat-repair-qa] Incoming")).allElementsBoundByIndex
                if let last = incoming.last { XCTAssertTrue(last.isHittable) }
                else { XCTAssertTrue(app.staticTexts["[loop-qa] Thanks for today!"].isHittable) }
                XCTAssertEqual(field.value as? String, draft)
                loopCapture(app, "chat-latest-\(language)")
            }
            app.terminate()
        }
    }

    func testNewIntentLoop12ExplicitPlanNavigation() {
        for canceled in [false, true] {
            let app = XCUIApplication()
            app.launchArguments = ["--ui-testing-authenticated", "--ui-testing-skip-tutorial", "--ui-testing-plan-navigation",
                "--ui-testing-language=de", "--ui-testing-appearance=dark", "-UIPreferredContentSizeCategoryName", "UICTContentSizeCategoryAccessibilityXXXL"]
            if canceled { app.launchArguments.append("--ui-testing-navigation-canceled") }
            app.launch()
            tabButton(in: app, labels: ["Plans", "计划", "Pläne"]).tap()
            loopSelectPlanSection("ended", in: app)
            let old = app.buttons["plans-row-nav-old"]
            XCTAssertTrue(old.waitForExistence(timeout: 8)); old.tap()
            let header = app.buttons["conversation-current-plan"]
            XCTAssertTrue(header.waitForExistence(timeout: 8))
            XCTAssertTrue(header.label.contains("A long original plan"))
            let current = app.buttons["conversation-view-current"]
            XCTAssertTrue(current.isHittable)
            app.buttons["conversation-plan-menu"].tap()
            app.buttons["conversation-all-plans"].tap()
            XCTAssertTrue(app.navigationBars.buttons["Fertig"].waitForExistence(timeout: 5))
            loopCapture(app, "chat-plan-picker-\(canceled)")
            app.navigationBars.buttons["Fertig"].tap()
            XCTAssertTrue(header.label.contains("A long original plan"), "Dismissing the list keeps the original history selection")
            current.tap()
            XCTAssertTrue(app.staticTexts["Reply to the next library plan"].firstMatch.waitForExistence(timeout: 5))
            XCTAssertTrue(header.label.contains("Reply to the next library plan"))
            loopCapture(app, "chat-current-plan-\(canceled)")
            app.buttons["conversation-plan-menu"].tap(); app.buttons["conversation-all-plans"].tap()
            let later = app.buttons["conversation-select-plan-nav-later"]
            for _ in 0..<8 where !later.isHittable { app.swipeUp(velocity: .slow) }
            XCTAssertTrue(later.isHittable); later.tap()
            XCTAssertTrue(header.label.contains("A later confirmed plan"))
            let latest = app.buttons["chat-new-messages"]
            XCTAssertTrue(latest.waitForExistence(timeout: 5)); latest.tap()
            XCTAssertTrue(app.staticTexts["Navigation message 7"].waitForExistence(timeout: 5))
            XCTAssertTrue(app.staticTexts["Navigation message 7"].isHittable)
            XCTAssertTrue(header.label.contains("Reply to the next library plan"), "Latest restores the default summary without scrolling back to its card")
            loopCapture(app, "chat-multiple-latest-\(canceled)")
            app.terminate()
        }
    }

    private func revealOutcome(_ element: XCUIElement, in app: XCUIApplication, scroll: XCUIElement) {
        for _ in 0..<32 {
            let area = scroll.frame.intersection(app.frame).insetBy(dx: 0, dy: 12)
            let target = element.exists ? element.frame : CGRect.null
            if element.exists && element.isHittable &&
                (area.contains(target) || (target.height > area.height && area.intersection(target).height > 100)) { return }
            let downward = !target.isNull && target.minY < area.minY
            let delta = target.isNull ? area.height : (downward ? area.minY - target.minY + 12 : target.maxY - area.maxY + 12)
            let distance = min(area.height * 0.55, max(35, delta))
            let origin = app.coordinate(withNormalizedOffset: .zero)
            let start = origin.withOffset(CGVector(dx: area.maxX - 20, dy: downward ? area.minY + 20 : area.maxY - 20))
            let end = start.withOffset(CGVector(dx: 0, dy: downward ? distance : -distance))
            start.press(forDuration: 0.1, thenDragTo: end, withVelocity: .slow, thenHoldForDuration: 0.15)
        }
        let diagnostic = XCTAttachment(string: "target=\(element.frame), scroll=\(scroll.frame)\n\(app.debugDescription)")
        diagnostic.name = "feedback-scroll-diagnostic"; diagnostic.lifetime = .keepAlways; add(diagnostic)
        XCTAssertTrue(element.isHittable, "Feedback control is reachable in its own scroll region")
    }

    func testNewIntentLoop13FeedbackWrappingAndCancel() {
        for language in ["de", "en", "zh-Hans"] {
            for large in [true, false] {
                let app = launchAndLogin(username: "loopqa_a", additionalLaunchArguments: [
                    "--ui-testing-discover", "--ui-testing-language=\(language)", "--ui-testing-appearance=\(large ? "dark" : "light")",
                    "-UIPreferredContentSizeCategoryName", large ? "UICTContentSizeCategoryAccessibilityXXXL" : "UICTContentSizeCategoryL"
                ])
                tabButton(in: app, labels: ["Plans", "计划", "Pläne"]).tap()
                loopSelectPlanSection("ended", in: app)
                let row = app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH %@", "plans-row-")).firstMatch
                XCTAssertTrue(row.waitForExistence(timeout: 12))
                let id = String(row.identifier.dropFirst("plans-row-".count))
                let saved = app.descendants(matching: .any)["plan-outcome-saved-\(id)"].firstMatch
                let edit = app.buttons["plan-outcome-edit-\(id)"]
                let cancel = app.buttons["plan-outcome-cancel-\(id)"]
                for surface in ["plans", "chat"] {
                    let scroll = app.scrollViews[surface == "plans" ? "plans-scroll-ended" : "chat-message-list"]
                    revealOutcome(edit, in: app, scroll: scroll)
                    XCTAssertGreaterThanOrEqual(edit.frame.height, 44)
                    XCTAssertTrue(saved.exists)
                    let originalValue = saved.value as? String
                    XCTAssertFalse((originalValue ?? "").isEmpty)
                    XCTAssertLessThanOrEqual(saved.frame.maxX, app.frame.maxX)
                    if large { XCTAssertGreaterThan(saved.frame.height, 50, "Saved feedback grows to fit large text") }
                    revealOutcome(saved, in: app, scroll: scroll)
                    XCTAssertTrue(scroll.frame.contains(saved.frame), "The complete saved result can be brought into view")
                    let bounds = XCTAttachment(string: "saved=\(saved.frame), edit=\(edit.frame), viewport=\(scroll.frame), value=\(originalValue ?? "")")
                    bounds.name = "feedback-bounds-\(surface)-\(language)-\(large)"; bounds.lifetime = .keepAlways; add(bounds)
                    loopCapture(app, "feedback-saved-\(surface)-\(language)-\(large)")
                    revealOutcome(edit, in: app, scroll: scroll); edit.tap()
                    revealOutcome(cancel, in: app, scroll: scroll)
                    XCTAssertGreaterThanOrEqual(cancel.frame.height, 44)
                    XCTAssertEqual(saved.value as? String, originalValue)
                    let yes = app.buttons["plan-outcome-occurred-\(id)"]
                    XCTAssertTrue(yes.isSelected)
                    loopCapture(app, "feedback-edit-\(surface)-\(language)-\(large)")
                    cancel.tap()
                    XCTAssertTrue(cancel.waitForNonExistence(timeout: 5))
                    XCTAssertEqual(saved.value as? String, originalValue)
                    if surface == "plans" {
                        revealOutcome(row, in: app, scroll: scroll); row.tap()
                        XCTAssertTrue(app.descendants(matching: .any)["direct-chat"].waitForExistence(timeout: 10))
                    }
                }
                app.terminate()
            }
        }
    }

    func testNewIntentLoop14FeedbackFailureRetryAndReadback() {
        let app = launchAndLogin(username: "loopqa_a", additionalLaunchArguments: ["--ui-testing-discover", "--ui-testing-language=en", "-UIPreferredContentSizeCategoryName", "UICTContentSizeCategoryAccessibilityXXXL"])
        tabButton(in: app, labels: ["Plans"]).tap(); loopSelectPlanSection("ended", in: app)
        let row = app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH %@", "plans-row-")).firstMatch
        XCTAssertTrue(row.waitForExistence(timeout: 12))
        let id = String(row.identifier.dropFirst("plans-row-".count))
        let saved = app.descendants(matching: .any)["plan-outcome-saved-\(id)"].firstMatch
        let edit = app.buttons["plan-outcome-edit-\(id)"]
        let scroll = app.scrollViews["plans-scroll-ended"]
        revealOutcome(edit, in: app, scroll: scroll)
        let original = saved.value as? String
        XCTAssertEqual(original, "Happened")
        edit.tap()
        let no = app.buttons["plan-outcome-did_not_occur-\(id)"]
        revealOutcome(no, in: app, scroll: scroll); no.tap()
        XCTAssertTrue(app.descendants(matching: .any)["plan-outcome-saving-\(id)"].firstMatch.waitForExistence(timeout: 2))
        XCTAssertFalse(no.isEnabled)
        let error = app.staticTexts["plan-outcome-error-\(id)"]
        XCTAssertTrue(error.waitForExistence(timeout: 15), "A failed or unconfirmed save stays explicit")
        XCTAssertEqual(saved.value as? String, original, "Failure keeps the last confirmed feedback")
        revealOutcome(error, in: app, scroll: scroll); loopCapture(app, "feedback-controlled-failure")
        revealOutcome(no, in: app, scroll: scroll); no.tap()
        XCTAssertTrue(waitForValue(saved, values: ["Didn't happen"], timeout: 15))
        XCTAssertFalse(error.exists)
        revealOutcome(edit, in: app, scroll: scroll); loopCapture(app, "feedback-retry-saved")
        revealOutcome(row, in: app, scroll: scroll); row.tap()
        XCTAssertTrue(app.descendants(matching: .any)["direct-chat"].waitForExistence(timeout: 12))
        let chatScroll = app.scrollViews["chat-message-list"]
        revealOutcome(edit, in: app, scroll: chatScroll)
        XCTAssertEqual(saved.value as? String, "Didn't happen")
        let repeatButton = app.buttons["plan-repeat-\(id)"]
        XCTAssertTrue(repeatButton.label.contains("another time"))
        edit.tap()
        let yes = app.buttons["plan-outcome-occurred-\(id)"]
        revealOutcome(yes, in: app, scroll: chatScroll); yes.tap()
        XCTAssertTrue(waitForValue(saved, values: ["Happened"], timeout: 15))
        revealOutcome(edit, in: app, scroll: chatScroll); loopCapture(app, "feedback-chat-restored")
        XCTAssertTrue(repeatButton.label.contains("again"))
        app.terminate()
        let reloaded = launchAndLogin(username: "loopqa_a", additionalLaunchArguments: ["--ui-testing-discover", "--ui-testing-language=en"])
        tabButton(in: reloaded, labels: ["Plans"]).tap(); loopSelectPlanSection("ended", in: reloaded)
        let persisted = reloaded.descendants(matching: .any)["plan-outcome-saved-\(id)"].firstMatch
        XCTAssertTrue(persisted.waitForExistence(timeout: 12)); XCTAssertEqual(persisted.value as? String, "Happened")
        reloaded.terminate()
    }

    func testNewIntentLoop15UnansweredFeedbackAndQuoteDraft() {
        for language in ["de", "en", "zh-Hans"] {
            let app = XCUIApplication()
            app.launchArguments = ["--ui-testing-authenticated", "--ui-testing-skip-tutorial", "--ui-testing-language=\(language)",
                "-UIPreferredContentSizeCategoryName", "UICTContentSizeCategoryAccessibilityXXXL"]
            app.launch()
            tabButton(in: app, labels: ["Plans", "计划", "Pläne"]).tap(); loopSelectPlanSection("ended", in: app)
            let id = "ui-plan-completed"
            let scroll = app.scrollViews["plans-scroll-ended"]
            let no = app.buttons["plan-outcome-did_not_occur-\(id)"]
            let yes = app.buttons["plan-outcome-occurred-\(id)"]
            let saved = app.descendants(matching: .any)["plan-outcome-saved-\(id)"].firstMatch
            revealOutcome(no, in: app, scroll: scroll)
            XCTAssertFalse(saved.exists); XCTAssertFalse(no.isSelected); XCTAssertFalse(yes.isSelected)
            XCTAssertGreaterThanOrEqual(no.frame.height, 44)
            loopCapture(app, "feedback-unanswered-\(language)"); no.tap()
            let edit = app.buttons["plan-outcome-edit-\(id)"]
            XCTAssertTrue(edit.waitForExistence(timeout: 5))
            revealOutcome(edit, in: app, scroll: scroll)
            XCTAssertTrue(saved.exists); loopCapture(app, "feedback-did-not-happen-\(language)")
            edit.tap()
            let cancel = app.buttons["plan-outcome-cancel-\(id)"]
            revealOutcome(cancel, in: app, scroll: scroll); XCTAssertTrue(no.isSelected)
            cancel.tap(); XCTAssertTrue(cancel.waitForNonExistence(timeout: 5)); app.terminate()
        }
        let app = XCUIApplication()
        app.launchArguments = ["--ui-testing-authenticated", "--ui-testing-skip-tutorial", "--ui-testing-plan-navigation",
            "--ui-testing-language=de", "-UIPreferredContentSizeCategoryName", "UICTContentSizeCategoryAccessibilityXXXL"]
        app.launch()
        tabButton(in: app, labels: ["Plans", "Pläne"]).tap(); loopSelectPlanSection("ended", in: app)
        app.buttons["plans-row-nav-old"].tap()
        let latest = app.buttons["chat-new-messages"]
        XCTAssertTrue(latest.waitForExistence(timeout: 8)); latest.tap()
        let bubble = app.descendants(matching: .any)["chat-bubble-nav-text-7"].firstMatch
        XCTAssertTrue(bubble.waitForExistence(timeout: 5)); bubble.press(forDuration: 0.8)
        let reply = app.buttons["chat-reply-nav-text-7"]
        XCTAssertTrue(reply.waitForExistence(timeout: 5)); reply.tap()
        let field = app.textViews["chat-composer-field"]
        XCTAssertTrue(app.keyboards.firstMatch.waitForExistence(timeout: 5))
        let draft = "Keep this quoted draft. Keep every word."
        field.typeText(draft)
        XCTAssertTrue(app.descendants(matching: .any)["chat-reply-preview"].firstMatch.exists)
        loopCapture(app, "chat-quote-keyboard-bounds")
        let quoteBounds = XCTAttachment(string: "header=\(app.buttons["conversation-current-plan"].frame), messages=\(app.scrollViews["chat-message-list"].frame), input=\(field.frame), keyboard=\(app.keyboards.firstMatch.frame)")
        quoteBounds.name = "chat-layout-bounds-quote"; quoteBounds.lifetime = .keepAlways; add(quoteBounds)
        XCTAssertGreaterThanOrEqual(app.scrollViews["chat-message-list"].frame.height, 112)
        XCTAssertTrue(app.buttons["chat-composer-send"].isHittable)
        app.buttons["conversation-current-plan"].tap()
        XCTAssertTrue(app.keyboards.firstMatch.waitForNonExistence(timeout: 5))
        XCTAssertEqual(field.value as? String, draft)
        XCTAssertTrue(app.descendants(matching: .any)["chat-reply-preview"].firstMatch.exists)
        loopCapture(app, "chat-quote-preserved-after-plan-navigation")
        app.buttons["chat-reply-cancel"].tap()
        XCTAssertEqual(field.value as? String, draft)
        app.terminate()
    }

    func testNewIntentLoop16RuntimeTextSizeKeepsDraftAndHistory() {
        let app = XCUIApplication()
        app.launchArguments = ["--ui-testing-authenticated", "--ui-testing-skip-tutorial", "--ui-testing-plan-navigation", "--ui-testing-language=de", "--ui-testing-chat-layout-diagnostics"]
        app.launch()
        tabButton(in: app, labels: ["Plans", "Pläne"]).tap(); loopSelectPlanSection("ended", in: app)
        let row = app.buttons["plans-row-nav-old"]
        XCTAssertTrue(row.waitForExistence(timeout: 5)); row.tap()
        let header = app.buttons["conversation-current-plan"]
        XCTAssertTrue(header.waitForExistence(timeout: 5))
        let field = app.textViews["chat-composer-field"]
        field.tap(); field.typeText("Keep this runtime size draft.")
        let chat = app.descendants(matching: .any)["direct-chat"].firstMatch
        XCTAssertEqual(chat.value as? String, "large")
        loopCapture(app, "chat-runtime-size-before")
        NSLog("SIDESEAT_RUNTIME_SIZE_READY")
        XCTAssertTrue(waitForValue(chat, values: ["accessibility5"], timeout: 25))
        loopCapture(app, "chat-runtime-size-after-change")
        XCTAssertEqual(field.value as? String, "Keep this runtime size draft.")
        XCTAssertTrue(header.label.contains("A long original plan"))
        let originalTitle = app.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", "A long original plan")).firstMatch
        XCTAssertGreaterThan(originalTitle.frame.intersection(app.scrollViews["chat-message-list"].frame).height, 20)
        XCTAssertGreaterThanOrEqual(app.scrollViews["chat-message-list"].frame.height, 112)
        XCTAssertTrue(app.buttons["chat-composer-send"].isHittable)
        loopCapture(app, "chat-runtime-size-large")
        NSLog("SIDESEAT_RUNTIME_SIZE_RESTORE")
        XCTAssertTrue(waitForValue(chat, values: ["large"], timeout: 25))
        XCTAssertEqual(field.value as? String, "Keep this runtime size draft.")
        loopCapture(app, "chat-runtime-size-restored")
        app.terminate()
    }

    func testNewIntentLoop17IncomingMessagePreservesHistoryAndDraft() async throws {
        let base = try XCTUnwrap(URL(string: ProcessInfo.processInfo.environment["SIDESEAT_LIVE_API_BASE_URL"] ?? ""))
        XCTAssertTrue(["127.0.0.1", "localhost"].contains(base.host ?? ""))
        guard ["127.0.0.1", "localhost"].contains(base.host ?? "") else { return }
        let app = launchAndLogin(username: "loopqa_a", additionalLaunchArguments: ["--ui-testing-discover", "--ui-testing-language=de", "-UIPreferredContentSizeCategoryName", "UICTContentSizeCategoryAccessibilityXXXL"])
        tabButton(in: app, labels: ["Plans", "Pläne"]).tap(); loopSelectPlanSection("ended", in: app)
        let row = app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH %@", "plans-row-")).firstMatch
        XCTAssertTrue(row.waitForExistence(timeout: 10))
        let planID = String(row.identifier.dropFirst("plans-row-".count)); row.tap()
        let field = app.textViews["chat-composer-field"]
        XCTAssertTrue(field.waitForExistence(timeout: 10)); field.tap(); field.typeText("Keep my draft during incoming messages.")
        let header = app.buttons["conversation-current-plan"]
        header.tap(); XCTAssertTrue(app.keyboards.firstMatch.waitForNonExistence(timeout: 5))
        let title = app.staticTexts["[loop-qa] Campus coffee"].firstMatch
        XCTAssertTrue(title.isHittable); let oldY = title.frame.minY
        var login = URLRequest(url: base.appendingPathComponent("api/v1/auth/login"))
        login.httpMethod = "POST"; login.setValue("application/json", forHTTPHeaderField: "Content-Type")
        login.httpBody = try JSONSerialization.data(withJSONObject: ["identifier": "loopqa_b", "password": password,
            "device": ["id": "chat-repair-peer-qa", "name": "Isolated peer QA", "appVersion": "93", "platformVersion": "UI test"]])
        let (authData, authResponse) = try await URLSession.shared.data(for: login)
        XCTAssertEqual((authResponse as? HTTPURLResponse)?.statusCode, 200)
        let auth = try XCTUnwrap((try JSONSerialization.jsonObject(with: authData) as? [String: Any])?["data"] as? [String: Any])
        let token = try XCTUnwrap((auth["tokens"] as? [String: Any])?["accessToken"] as? String)
        var plans = URLRequest(url: base.appendingPathComponent("api/v1/plans")); plans.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        let (plansData, _) = try await URLSession.shared.data(for: plans)
        let payload = try XCTUnwrap((try JSONSerialization.jsonObject(with: plansData) as? [String: Any])?["data"] as? [String: Any])
        let match = try XCTUnwrap((payload["plans"] as? [[String: Any]])?.first { $0["id"] as? String == planID })
        XCTAssertEqual(match["title"] as? String, "[loop-qa] Campus coffee")
        let connection = try XCTUnwrap(match["connectionId"] as? String)
        let text = "[chat-repair-qa] Incoming \(UUID().uuidString.prefix(8))"
        var send = URLRequest(url: base.appendingPathComponent("api/v1/connections/\(connection)/messages"))
        send.httpMethod = "POST"; send.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        send.setValue("application/json", forHTTPHeaderField: "Content-Type"); send.setValue(UUID().uuidString, forHTTPHeaderField: "Idempotency-Key")
        send.httpBody = try JSONSerialization.data(withJSONObject: ["body": text])
        let (_, response) = try await URLSession.shared.data(for: send)
        XCTAssertTrue([200, 201].contains((response as? HTTPURLResponse)?.statusCode ?? 0))
        let latest = app.buttons["chat-new-messages"]
        XCTAssertTrue(waitForValue(latest, values: ["1 neue Nachrichten"], timeout: 20))
        XCTAssertEqual(title.frame.minY, oldY, accuracy: 12)
        XCTAssertEqual(field.value as? String, "Keep my draft during incoming messages.")
        XCTAssertTrue(header.label.contains("[loop-qa] Campus coffee"))
        loopCapture(app, "chat-incoming-keeps-history")
        latest.tap(); XCTAssertTrue(app.staticTexts[text].waitForExistence(timeout: 5)); XCTAssertTrue(app.staticTexts[text].isHittable)
        XCTAssertEqual(field.value as? String, "Keep my draft during incoming messages.")
        loopCapture(app, "chat-incoming-return-to-latest")
        app.terminate()
    }

    func testNewIntentLoop18IntentionContextWhileTyping() {
        for language in ["de", "en", "zh-Hans"] {
            let app = launchAndLogin(username: "loopqa_a", additionalLaunchArguments: ["--ui-testing-discover", "--ui-testing-language=\(language)", "-UIPreferredContentSizeCategoryName", "UICTContentSizeCategoryAccessibilityXXXL"])
            tabButton(in: app, labels: ["Plans", "Pläne", "计划"]).tap(); loopSelectPlanSection("ended", in: app)
            let row = app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH %@", "plans-row-")).firstMatch
            XCTAssertTrue(row.waitForExistence(timeout: 10)); row.tap()
            let latest = app.buttons["chat-new-messages"]
            XCTAssertTrue(latest.waitForExistence(timeout: 10)); latest.tap()
            let context = app.buttons["conversation-context-bar"]
            XCTAssertTrue(context.waitForExistence(timeout: 5))
            XCTAssertTrue(context.label.contains("[loop-qa]"), "The compact entrance preserves the full source in its accessibility name")
            XCTAssertLessThan(context.frame.height, app.frame.height * 0.22)
            let field = app.textViews["chat-composer-field"]
            field.tap(); field.typeText("Keep this intention context draft.")
            XCTAssertGreaterThanOrEqual(app.scrollViews["chat-message-list"].frame.height, 112)
            XCTAssertTrue(app.buttons["chat-composer-send"].isHittable)
            loopCapture(app, "chat-intention-keyboard-\(language)")
            context.tap()
            let sheet = app.descendants(matching: .any)["conversation-context-sheet"].firstMatch
            XCTAssertTrue(sheet.waitForExistence(timeout: 5))
            loopCapture(app, "chat-intention-details-\(language)")
            app.buttons.matching(NSPredicate(format: "label IN %@", ["Done", "Fertig", "完成"])).firstMatch.tap()
            XCTAssertTrue(sheet.waitForNonExistence(timeout: 5))
            XCTAssertEqual(field.value as? String, "Keep this intention context draft.")
            app.terminate()
        }
    }

    func testNewIntentLoop10AccessiblePlanNavigationAndContinuation() {
        for (language, appearance, size) in [
            ("de", "dark", "UICTContentSizeCategoryAccessibilityXXXL"),
            ("en", "dark", "UICTContentSizeCategoryAccessibilityXXXL"),
            ("zh-Hans", "dark", "UICTContentSizeCategoryAccessibilityXXXL"),
            ("en", "light", "UICTContentSizeCategoryL"),
            ("de", "light", "UICTContentSizeCategoryL"),
            ("zh-Hans", "light", "UICTContentSizeCategoryL")
        ] {
            let app = launchAndLogin(username: "loopqa_a", additionalLaunchArguments: [
                "--ui-testing-discover", "--ui-testing-language=\(language)",
                "--ui-testing-appearance=\(appearance)", "-UIPreferredContentSizeCategoryName", size
            ])
            let large = size.contains("Accessibility")
            tabButton(in: app, labels: ["Plans", "计划", "Pläne"]).tap()
            XCTAssertTrue(app.descendants(matching: .any)["plans-root"].waitForExistence(timeout: 12))
            if large {
                let menu = app.buttons["plans-section-menu"]
                XCTAssertTrue(menu.waitForExistence(timeout: 8))
                XCTAssertLessThan(menu.frame.height, app.frame.height * 0.13)
                XCTAssertGreaterThanOrEqual(menu.frame.height, 44)
                menu.tap()
                let ended = app.buttons["plans-tab-ended"]
                XCTAssertTrue(ended.waitForExistence(timeout: 8))
                XCTAssertTrue(ended.isHittable)
                XCTAssertTrue(app.buttons["plans-tab-waitingResponse"].isSelected)
                XCTAssertTrue(app.buttons["plans-tab-upcoming"].isHittable)
                loopCapture(app, "plans-accessible-picker-\(language)")
                ended.tap()
                XCTAssertTrue(app.descendants(matching: .any)["plans-section-picker"].waitForNonExistence(timeout: 8))
            } else {
                XCTAssertTrue(app.segmentedControls["plans-segmented-control"].exists)
                loopSelectPlanSection("ended", in: app)
            }
            let create = app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH %@", "plan-new-intention-")).firstMatch
            XCTAssertTrue(create.waitForExistence(timeout: 12))
            let planID = String(create.identifier.dropFirst("plan-new-intention-".count))
            let repeatButton = app.buttons["plan-repeat-\(planID)"]
            loopReveal(create, in: app)
            XCTAssertTrue(repeatButton.label.contains("Loop Mia"), "The compact action retains the other person's name for accessibility")
            let expectedNewLabel = ["de": "Neuen Wunsch veröffentlichen", "en": "Publish new intention", "zh-Hans": "发布新意愿"][language]!
            XCTAssertEqual(create.label, expectedNewLabel)
            if large {
                XCTAssertLessThan(repeatButton.frame.height, app.frame.height * 0.18)
                XCTAssertLessThan(create.frame.height, app.frame.height * 0.20)
                XCTAssertGreaterThanOrEqual(repeatButton.frame.height, 44)
                XCTAssertGreaterThanOrEqual(create.frame.height, 44)
                XCTAssertTrue(repeatButton.isHittable)
            }
            loopCapture(app, "plans-compact-actions-\(language)-\(appearance)")
            let savedY = create.frame.minY
            loopSelectPlanSection("waitingResponse", in: app)
            loopSelectPlanSection("upcoming", in: app)
            XCTAssertTrue(app.descendants(matching: .any)["plans-empty-upcoming"].waitForExistence(timeout: 8))
            loopSelectPlanSection("ended", in: app)
            XCTAssertTrue(create.waitForExistence(timeout: 8))
            XCTAssertEqual(create.frame.minY, savedY, accuracy: 12, "Changing sections preserves the ended list's scroll position")
            create.tap()
            XCTAssertTrue(app.descendants(matching: .any)["intent-editor"].waitForExistence(timeout: 8))
            app.navigationBars.buttons.matching(NSPredicate(format: "label IN %@", ["Cancel", "取消", "Abbrechen"])).firstMatch.tap()
            XCTAssertTrue(app.descendants(matching: .any)["intent-editor"].waitForNonExistence(timeout: 8))
            XCTAssertTrue(create.isHittable)
            if large {
                repeatButton.tap()
                XCTAssertTrue(app.descendants(matching: .any)["plan-create-sheet"].waitForExistence(timeout: 8))
                XCTAssertTrue(app.navigationBars.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", "Loop Mia")).firstMatch.exists)
                app.navigationBars.buttons.matching(NSPredicate(format: "label IN %@", ["Cancel", "取消", "Abbrechen"])).firstMatch.tap()
                XCTAssertTrue(app.descendants(matching: .any)["plan-create-sheet"].waitForNonExistence(timeout: 8))
            }
            if language == "de" && large {
                let row = app.buttons["plans-row-\(planID)"]
                for _ in 0..<6 where !row.isHittable { app.scrollViews["plans-scroll-ended"].swipeDown(velocity: .slow) }
                XCTAssertTrue(row.isHittable); row.tap()
                XCTAssertTrue(app.descendants(matching: .any)["direct-chat"].waitForExistence(timeout: 12))
                let chatCreate = app.buttons.matching(identifier: "plan-new-intention-\(planID)").firstMatch
                loopReveal(chatCreate, in: app)
                let chatRepeat = app.buttons.matching(identifier: "plan-repeat-\(planID)").firstMatch
                XCTAssertTrue(chatRepeat.label.contains("Loop Mia"))
                XCTAssertLessThan(chatCreate.frame.height, app.frame.height * 0.2)
                loopCapture(app, "plans-compact-chat-de-dark")
                chatCreate.tap()
                XCTAssertTrue(app.descendants(matching: .any)["intent-editor"].waitForExistence(timeout: 8))
                app.navigationBars.buttons["Abbrechen"].tap()
                XCTAssertTrue(app.descendants(matching: .any)["intent-editor"].waitForNonExistence(timeout: 8))
                XCTAssertTrue(app.descendants(matching: .any)["direct-chat"].exists)
            }
            app.terminate()
        }
    }

    func testNewIntentLoop09RetainsPlanContinuationAndRecommendations() {
        for (language, appearance, size) in [
            ("zh-Hans", "light", "UICTContentSizeCategoryL"),
            ("de", "dark", "UICTContentSizeCategoryAccessibilityXXXL")
        ] {
            let app = launchAndLogin(username: "loopqa_a", additionalLaunchArguments: [
                "--ui-testing-discover", "--ui-testing-language=\(language)",
                "--ui-testing-appearance=\(appearance)", "-UIPreferredContentSizeCategoryName", size
            ])
            tabButton(in: app, labels: ["计划", "Pläne"]).tap()
            loopSelectPlanSection("ended", in: app)
            let create = app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH %@", "plan-new-intention-")).firstMatch
            XCTAssertTrue(create.waitForExistence(timeout: 12))
            loopReveal(create, in: app)
            loopCapture(app, "adaptive-plan-continuation-\(language)")
            create.tap()
            XCTAssertTrue(app.descendants(matching: .any)["intent-editor"].waitForExistence(timeout: 8))
            let field = app.textFields["intent-editor-activity"]
            let fields = app.collectionViews["intent-editor-fields"]
            for _ in 0..<8 {
                if field.exists { break }
                fields.coordinate(withNormalizedOffset: CGVector(dx: 0.03, dy: 0.85))
                    .press(forDuration: 0.1, thenDragTo: fields.coordinate(withNormalizedOffset: CGVector(dx: 0.03, dy: 0.25)))
            }
            XCTAssertTrue(field.exists)
            XCTAssertEqual(field.value as? String, "[loop-qa] Campus coffee")
            let timing = app.buttons["intent-timing-choose"]
            for _ in 0..<8 {
                if timing.isHittable { break }
                fields.coordinate(withNormalizedOffset: CGVector(dx: 0.03, dy: 0.85))
                    .press(forDuration: 0.1, thenDragTo: fields.coordinate(withNormalizedOffset: CGVector(dx: 0.03, dy: 0.25)))
            }
            loopCapture(app, "adaptive-new-draft-\(language)")
            if !timing.isHittable {
                let hierarchy = XCTAttachment(string: app.debugDescription)
                hierarchy.name = "draft-timing-diagnostic"; hierarchy.lifetime = .keepAlways; add(hierarchy)
            }
            XCTAssertTrue(timing.isHittable)
            let cancel = app.navigationBars.buttons.matching(NSPredicate(format: "label IN %@", ["取消", "Abbrechen"])).firstMatch
            cancel.tap()
            XCTAssertTrue(app.descendants(matching: .any)["intent-editor"].waitForNonExistence(timeout: 8))
            tabButton(in: app, labels: ["同行", "Zusammen"]).tap()
            loopSelectTogetherSection("intentions", in: app)
            XCTAssertTrue(app.staticTexts["[new-loop] Library coffee"].firstMatch.waitForExistence(timeout: 12))
            loopSelectTogetherSection("recommendations", in: app)
            XCTAssertTrue(app.staticTexts["Loop Lee"].waitForExistence(timeout: 12))
            loopCapture(app, "adaptive-new-company-\(language)")
            app.terminate()
        }
    }

    func testNewIntentLoop05ReturningEmptyStateLocalized() {
        for (language, appearance, size, expectedTitle) in [
            ("en", "light", "UICTContentSizeCategoryL", "Add an intention"),
            ("zh-Hans", "light", "UICTContentSizeCategoryL", "添加意愿"),
            ("de", "dark", "UICTContentSizeCategoryAccessibilityXXXL", "Vorhaben hinzufügen")
        ] {
            let app = launchAndLogin(username: "loopqa_b", additionalLaunchArguments: [
                "--ui-testing-discover", "--ui-testing-language=\(language)",
                "--ui-testing-appearance=\(appearance)", "-UIPreferredContentSizeCategoryName", size
            ])
            XCTAssertTrue(app.descendants(matching: .any)["together-home"].waitForExistence(timeout: 12))
            loopSelectTogetherSection("intentions", in: app)
            let add = app.buttons["together-add-first-intent"]
            XCTAssertTrue(add.waitForExistence(timeout: 12))
            loopReveal(add, in: app)
            XCTAssertEqual(add.label, expectedTitle)
            XCTAssertGreaterThanOrEqual(add.frame.height, 44)
            loopCapture(app, "new-intent-empty-fixed-\(language)-\(appearance)")
            add.tap()
            XCTAssertTrue(app.descendants(matching: .any)["intent-editor"].waitForExistence(timeout: 8))
            loopCapture(app, "new-intent-draft-fixed-\(language)-\(appearance)")
            let cancel = app.navigationBars.buttons.matching(NSPredicate(format: "label IN %@", ["Cancel", "取消", "Abbrechen"])).firstMatch
            XCTAssertTrue(cancel.exists)
            cancel.tap()
            XCTAssertTrue(app.descendants(matching: .any)["intent-editor"].waitForNonExistence(timeout: 8))
            app.terminate()
        }
    }

    func testMembershipInviteRedemption() throws {
        let env = ProcessInfo.processInfo.environment
        let username = try XCTUnwrap(env["SIDESEAT_MEMBERSHIP_USER"])
        let peer = try XCTUnwrap(env["SIDESEAT_MEMBERSHIP_PEER"])
        let code = try XCTUnwrap(env["SIDESEAT_MEMBERSHIP_CODE"])
        func openMembership(_ app: XCUIApplication) {
            tabButton(in: app, labels: ["Me"]).tap()
            let entry = app.buttons["me-membership"]
            XCTAssertTrue(entry.waitForExistence(timeout: 12))
            entry.tap()
            XCTAssertTrue(app.descendants(matching: .any)["membership-code"].waitForExistence(timeout: 10))
        }
        func redeem(_ code: String, in app: XCUIApplication) {
            let field = app.descendants(matching: .any)["membership-code"].firstMatch
            field.tap(); field.typeText(code)
            app.buttons["membership-redeem"].tap()
        }
        let a = loopLogin(username)
        openMembership(a)
        XCTAssertTrue(a.descendants(matching: .any)["membership-free"].waitForExistence(timeout: 10))
        redeem(code.lowercased(), in: a)
        XCTAssertTrue(a.descendants(matching: .any)["membership-plus"].waitForExistence(timeout: 12))
        XCTAssertTrue(a.descendants(matching: .any)["membership-expiry"].exists)
        XCTAssertTrue(a.descendants(matching: .any)["membership-confirmation"].exists)
        redeem(code, in: a)
        XCTAssertTrue(a.staticTexts["You have already redeemed this invitation code."].waitForExistence(timeout: 10))
        loopCapture(a, "membership-plus-redeemed")
        a.terminate()

        let b = loopLogin(peer)
        openMembership(b)
        XCTAssertTrue(b.descendants(matching: .any)["membership-free"].waitForExistence(timeout: 10))
        redeem(code, in: b)
        XCTAssertTrue(b.descendants(matching: .any)["membership-error"].waitForExistence(timeout: 10))
        XCTAssertTrue(b.descendants(matching: .any)["membership-free"].exists)
        XCTAssertFalse(b.descendants(matching: .any)["membership-plus"].exists)
        loopCapture(b, "membership-capacity-exhausted")
        b.terminate()

        let reloaded = loopLogin(username)
        openMembership(reloaded)
        XCTAssertTrue(reloaded.descendants(matching: .any)["membership-plus"].waitForExistence(timeout: 10))
        reloaded.terminate()
    }

    private func loopLogin(_ username: String) -> XCUIApplication {
        launchAndLogin(username: username, additionalLaunchArguments: [
            "--ui-testing-discover", "--ui-testing-language=en", "--ui-testing-appearance=light",
            "-UIPreferredContentSizeCategoryName", "UICTContentSizeCategoryL"
        ])
    }

    private func loopCreateIntent(_ text: String, in app: XCUIApplication) {
        tabButton(in: app, labels: ["Together"]).tap()
        XCTAssertTrue(app.descendants(matching: .any)["together-home"].waitForExistence(timeout: 12))
        loopSelectTogetherSection("intentions", in: app)
        app.buttons.matching(NSPredicate(format: "identifier IN %@", ["together-add-intent", "together-add-first-intent"])).firstMatch.tap()
        XCTAssertTrue(app.buttons["intent-topic-coffee"].waitForExistence(timeout: 8))
        app.buttons["intent-topic-coffee"].tap()
        let field = app.textFields["intent-editor-activity"]
        loopReveal(field, in: app)
        field.tap(); field.typeText(text)
        app.buttons["intent-editor-save"].tap()
        XCTAssertTrue(app.descendants(matching: .any)["intent-editor"].waitForNonExistence(timeout: 15))
        XCTAssertTrue(app.staticTexts[text].firstMatch.waitForExistence(timeout: 8))
        XCTAssertFalse(app.buttons["Start matching"].exists)
    }

    private func loopReveal(_ element: XCUIElement, in app: XCUIApplication) {
        for _ in 0..<8 {
            if element.isHittable && element.frame.midY < app.frame.maxY - 110 { return }
            app.swipeUp(velocity: .slow)
        }
        XCTAssertTrue(element.isHittable)
    }

    private func loopCapture(_ app: XCUIApplication, _ name: String) {
        let shot = app.screenshot()
        let attachment = XCTAttachment(screenshot: shot)
        attachment.name = "closed-loop-\(name)"; attachment.lifetime = .keepAlways; add(attachment)
        let root = URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
        try? shot.pngRepresentation.write(to: root.appendingPathComponent("docs/visual-qa/closed-loop-\(name).png"))
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
        let secondDecision = togetherContactActions(in: secondParticipant)
        if relatedActivities {
            let summary = secondParticipant.descendants(matching: .any).matching(
                NSPredicate(format: "identifier BEGINSWITH %@", "mutual-opportunity-activity-")
            ).firstMatch
            XCTAssertTrue(summary.exists)
            XCTAssertTrue(summary.label.contains(activity))
            XCTAssertFalse(summary.label.contains(peerActivity))
            XCTAssertFalse(secondParticipant.descendants(matching: .any).matching(
                NSPredicate(format: "identifier BEGINSWITH %@", "mutual-opportunity-fit-details-")
            ).firstMatch.exists)
        }
        XCTAssertFalse(secondParticipant.buttons["Chat about the details"].exists)
        XCTAssertTrue(secondDecision.exists)
        sendTogetherMessage("Hi, I'd like to join you.", in: secondParticipant)
        XCTAssertTrue(secondParticipant.descendants(matching: .any).matching(
            NSPredicate(format: "identifier BEGINSWITH %@", "mutual-opportunity-message-sent-")
        ).firstMatch.waitForExistence(timeout: 12))
        secondParticipant.terminate()

        let firstReturn = launchAndLogin(
            username: "test_001",
            additionalLaunchArguments: ["--ui-testing-discover", "--ui-testing-language=\(planLanguage)"]
        )
        let firstDecision = togetherContactActions(in: firstReturn)
        XCTAssertTrue(firstDecision.exists)
        sendTogetherMessage("Yes, let's arrange the details.", in: firstReturn)
        XCTAssertTrue(firstReturn.descendants(matching: .any)["direct-chat"].waitForExistence(timeout: 12))
        XCTAssertTrue(firstReturn.staticTexts[chinesePlan ? "关于这条意愿" : "About this intention"].waitForExistence(timeout: 12))
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
        let system = XCUIApplication(bundleIdentifier: "com.apple.springboard")
        let denyNotifications = system.buttons.matching(NSPredicate(format: "label IN %@",
            ["Don’t Allow", "Don't Allow", "不允许", "Nicht erlauben"])).firstMatch
        if denyNotifications.waitForExistence(timeout: 4) { denyNotifications.tap() }
        XCTAssertTrue(tabButton(in: app, labels: ["Calendar", "日历", "Kalender"]).waitForExistence(timeout: 20))
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

        let intentions = app.buttons["together-tab-intentions"].firstMatch
        XCTAssertTrue(intentions.waitForExistence(timeout: 8))
        intentions.tap()
        let setIntent = app.buttons.matching(NSPredicate(format: "identifier IN %@", ["together-add-intent", "together-add-first-intent"])).firstMatch
        XCTAssertTrue(setIntent.waitForExistence(timeout: 8))
        setIntent.tap()
        XCTAssertTrue(app.descendants(matching: .any)["intent-editor"].waitForExistence(timeout: 8))

        let activityField = app.textFields["intent-editor-activity"]
        XCTAssertTrue(activityField.waitForExistence(timeout: 5))
        activityField.tap()
        activityField.typeText(activity)
        let save = app.buttons["intent-editor-save"]
        XCTAssertTrue(waitUntilEnabled(save, timeout: 5))
        save.tap()

        let savedIntent = app.descendants(matching: .any).matching(
            NSPredicate(format: "identifier BEGINSWITH %@", "weekly-intent-")
        ).firstMatch
        XCTAssertTrue(savedIntent.waitForExistence(timeout: 12))
        app.buttons["together-tab-recommendations"].firstMatch.tap()
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

    private func togetherContactActions(in app: XCUIApplication) -> XCUIElement {
        let decision = app.descendants(matching: .any).matching(
            NSPredicate(format: "identifier BEGINSWITH %@", "mutual-opportunity-actions-")
        ).firstMatch
        for _ in 0..<8 where !decision.isHittable { app.swipeUp() }
        XCTAssertTrue(decision.waitForExistence(timeout: 15))
        return decision
    }

    private func sendTogetherMessage(_ text: String, in app: XCUIApplication) {
        let actions = togetherContactActions(in: app)
        let id = String(actions.identifier.dropFirst("mutual-opportunity-actions-".count))
        app.buttons["mutual-opportunity-message-\(id)"].tap()
        let input = app.textFields["opportunity-message-body"]
        XCTAssertTrue(input.waitForExistence(timeout: 8))
        input.tap(); input.typeText(text)
        app.buttons["opportunity-message-submit"].tap()
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
