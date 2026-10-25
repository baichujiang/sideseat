import XCTest

/// A Mac companion triggers real owner API mutations on two independent disposable plans.
/// This class never fabricates a notification, injects a session, or opens a URL for a notification tap.
@MainActor final class PlanPhysicalPushPhoneUITests: XCTestCase {
    private struct Account: Decodable { let role: String; let identifier: String; let password: String }
    private struct PushPlan: Decodable { let key: String; let title: String }
    private struct PushFixture: Decodable { let cases: [PushPlan] }
    private struct Fixture: Decodable { let bundle: String; let accounts: [Account]; let physicalPush: PushFixture }
    private var fixture: Fixture!
    private var app: XCUIApplication!
    private var didReturnToNormalDomain = false
    private let springboard = XCUIApplication(bundleIdentifier: "com.apple.springboard")

    override func setUpWithError() throws { continueAfterFailure = false }

    func test01ForegroundBackgroundAndCancellation() throws {
        try loadAndLogin()
        let title = plan("warm").title
        phase("foreground-ready")
        tapForegroundNotice(containing: title, captureName: "01-foreground-real-share-notice")
        let card = app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH 'shared-plan-card-'"))
            .containing(.staticText, identifier: title).firstMatch
        XCTAssertTrue(card.waitForExistence(timeout: 25)); capture("02-foreground-notification-correct-chat-card")
        phase("foreground-share-opened")

        background(); phase("background-invitation-ready")
        tapSystemNotification(containing: title, heading: "A plan is waiting for you", captureName: "03-background-final-invitation-system-notification")
        verifyInvitation(title: title); capture("04-background-tap-correct-plan-highlight")
        phase("background-invitation-opened")
        app.buttons["unified-plan-accept"].tap()
        XCTAssertTrue(app.staticTexts["unified-plan-accepted-status"].waitForExistence(timeout: 25))
        XCTAssertFalse(app.buttons["plan-view-calendar"].exists)
        capture("05-real-peer-accepted-not-yet-calendar"); phase("peer-accepted")

        background(); phase("background-publication-ready")
        tapSystemNotification(containing: title, heading: "Your plan is confirmed", captureName: "06-background-published-system-notification")
        verifyTitle(title)
        XCTAssertTrue(app.buttons["plan-view-calendar"].waitForExistence(timeout: 25))
        capture("07-published-tap-correct-plan-calendar-action"); phase("background-publication-opened")
        verifyCalendar(title: title)
        phase("published-calendar-verified")

        // Leave the plan so its foreground update is observable as an actual notice.
        returnToRoot()
        phase("foreground-cancellation-ready")
        tapForegroundNotice(containing: title, captureName: "09-foreground-real-cancellation-notice")
        verifyCancelled(title: title)
        capture("10-cancellation-tap-correct-plan-no-calendar"); phase("foreground-cancellation-opened")
        returnToRoot()
        searchCalendar(title: title)
        XCTAssertTrue(app.descendants(matching: .any)["calendar-search-empty"].firstMatch.waitForExistence(timeout: 25))
        XCTAssertFalse(calendarResult(title: title).exists)
        capture("11-cancelled-plan-absent-from-calendar"); phase("cancelled-calendar-verified")
        phase("warm-case-complete")
    }

    func test02ColdNotificationRestoresSession() throws {
        try loadAndLogin()
        let title = plan("cold").title
        // OS delivery must launch the terminated app. These arguments are deliberately cleared;
        // no app.launch(), activate(), deep link, or token injection may replace this notification tap.
        app.launchArguments = []; app.launchEnvironment = [:]
        app.terminate()
        XCTAssertTrue(app.wait(for: .notRunning, timeout: 15))
        XCUIDevice.shared.press(.home)
        phase("cold-invitation-ready")
        tapSystemNotification(containing: title, heading: "A plan is waiting for you", captureName: "12-cold-real-invitation-system-notification")
        XCTAssertFalse(app.textFields["login-identifier"].exists)
        verifyInvitation(title: title)
        capture("13-cold-tap-session-restored-correct-plan-highlight"); phase("cold-invitation-opened")

        background(); phase("cold-cancellation-ready")
        tapSystemNotification(containing: title, heading: "A plan was cancelled", captureName: "14-background-real-cancellation-system-notification")
        verifyCancelled(title: title)
        capture("15-background-cancellation-tap-correct-plan"); phase("cold-cancellation-opened")
        phase("cold-case-complete")
    }

    func test99ClearQaCredentialsAndReturnToNormalDomain() throws {
        // Always establish the controlled QA identity first. Never sign out an unknown normal user.
        try loadAndLogin()
        let me = app.tabBars.buttons.matching(NSPredicate(format: "label IN %@", ["Me", "我", "Ich"])).firstMatch
        XCTAssertTrue(me.isHittable); me.tap()
        let settings = app.buttons["me-settings"]
        XCTAssertTrue(settings.waitForExistence(timeout: 15)); settings.tap()
        XCTAssertTrue(app.descendants(matching: .any)["settings-root"].firstMatch.waitForExistence(timeout: 15))
        let logout = app.buttons["settings-logout"]
        for _ in 0..<10 where !logout.exists || !logout.isHittable { app.swipeUp(velocity: .slow) }
        XCTAssertTrue(logout.isHittable); logout.tap()
        XCTAssertTrue(app.textFields["login-identifier"].waitForExistence(timeout: 25))
        // SessionStore.logout clears refresh/cached user locally before its real logout request,
        // which also submits the actual APNs token. The Mac separately verifies device-row removal.
        RunLoop.current.run(until: Date().addingTimeInterval(4))
        print("PLAN_PUSH_CLEANUP qa-settings-logout-completed"); fflush(stdout)

        // Restore the same QA Keychain domain without a signed-out override. A clean login screen
        // proves that a cached QA identity or refresh session did not survive the UI logout.
        app.terminate()
        app.launchArguments = ["--ui-testing-persistent-qa-credentials", "--ui-testing-skip-tutorial", "--ui-testing-language=en"]
        app.launchEnvironment = [:]
        app.launch()
        XCTAssertTrue(app.textFields["login-identifier"].waitForExistence(timeout: 30))
        XCTAssertFalse(app.tabBars.firstMatch.exists)
        print("PLAN_PUSH_CLEANUP qa-domain-cold-relaunch-signed-out"); fflush(stdout)

        returnToNormalDomain()
        let normalReady = XCTNSPredicateExpectation(
            predicate: NSPredicate { [self] _, _ in app.tabBars.firstMatch.exists || app.textFields["login-identifier"].exists }, object: nil)
        XCTAssertEqual(XCTWaiter.wait(for: [normalReady], timeout: 35), .completed)
        // No screenshot, profile read, or claim about who owns the normal domain.
        print("PLAN_PUSH_CLEANUP normal-domain-ordinary-launch-ready"); fflush(stdout)
    }

    private func loadAndLogin() throws {
        XCTAssertNil(ProcessInfo.processInfo.environment["SIMULATOR_UDID"], "Real physical-device APNs delivery is required; Simulator results cannot satisfy this test.")
        let raw = ProcessInfo.processInfo.environment["SIDESEAT_PLAN_SIX_JSON"]
        try XCTSkipIf(raw == nil || raw!.isEmpty, "Requires the Mac's six-account private fixture and independently prepared push plans.")
        let data = raw!.hasPrefix("{") ? Data(raw!.utf8) : try Data(contentsOf: URL(fileURLWithPath: raw!))
        fixture = try JSONDecoder().decode(Fixture.self, from: data)
        XCTAssertEqual(Set(fixture.physicalPush.cases.map(\.key)), Set(["warm", "cold"]))
        let peer = fixture.accounts.first { $0.role == "peer1" }!
        XCTAssertTrue(peer.identifier.hasPrefix("pqa_six_peer1_"))
        app = XCUIApplication(bundleIdentifier: fixture.bundle)
        addTeardownBlock { [self] in
            MainActor.assumeIsolated {
                if app != nil, !didReturnToNormalDomain { returnToNormalDomain() }
            }
        }
        app.terminate()
        app.launchArguments = ["--ui-testing-signed-out", "--ui-testing-persistent-qa-credentials",
            "--ui-testing-skip-tutorial", "--ui-testing-language=en", "--ui-testing-appearance=light"]
        app.launchEnvironment = [:]
        app.launch()
        let identifier = app.textFields["login-identifier"]
        XCTAssertTrue(identifier.waitForExistence(timeout: 25)); identifier.tap(); identifier.typeText(peer.identifier)
        let password = app.secureTextFields["login-password"]
        XCTAssertTrue(password.exists); password.tap(); password.typeText(peer.password)
        app.buttons["login-submit"].tap()
        XCTAssertTrue(app.tabBars.firstMatch.waitForExistence(timeout: 35))
        allowOnlyNotificationPermissionIfPresent()
        // Allow the real APNs registration request to finish before the first owner trigger.
        RunLoop.current.run(until: Date().addingTimeInterval(4))
    }

    private func allowOnlyNotificationPermissionIfPresent() {
        let alert = springboard.alerts.firstMatch
        guard alert.waitForExistence(timeout: 3) else { return }
        let text = alert.staticTexts.allElementsBoundByIndex.map(\.label).joined(separator: " ")
        let saysNotifications = ["notification", "通知", "Mitteilungen", "Benachrichtigung"].contains { text.localizedCaseInsensitiveContains($0) }
        guard text.localizedCaseInsensitiveContains("SideSeat"), saysNotifications else { return }
        let allow = alert.buttons.matching(NSPredicate(format: "label IN %@", ["Allow", "允许", "Erlauben"])).firstMatch
        XCTAssertTrue(allow.exists, "Only the explicit notification authorization is allowed.")
        allow.tap()
    }

    private func plan(_ key: String) -> PushPlan { fixture.physicalPush.cases.first { $0.key == key }! }
    private func phase(_ value: String) { print("PLAN_PUSH_PHASE \(value)"); fflush(stdout) }

    private func returnToNormalDomain() {
        app.terminate()
        app.launchArguments = ["--ui-testing-end-persistent-qa-credentials"]
        app.launchEnvironment = [:]
        app.launch()
        app.terminate()
        app.launchArguments = []; app.launchEnvironment = [:]
        app.launch()
        didReturnToNormalDomain = true
    }

    private func background() {
        XCUIDevice.shared.press(.home)
        XCTAssertTrue(app.wait(for: .runningBackground, timeout: 15) || app.state == .runningBackgroundSuspended)
    }

    private func tapForegroundNotice(containing title: String, captureName: String) {
        let notice = app.buttons["foreground-push-notice"]
        let arrived = XCTNSPredicateExpectation(predicate: NSPredicate(format: "exists == true AND label CONTAINS %@", title), object: notice)
        XCTAssertEqual(XCTWaiter.wait(for: [arrived], timeout: 90), .completed, "A real matching foreground push notice must arrive.")
        capture(captureName); notice.tap()
    }

    private func tapSystemNotification(containing title: String, heading: String, captureName: String) {
        let body = springboard.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", title)).firstMatch
        let kind = springboard.staticTexts[heading]
        if !body.waitForExistence(timeout: 25) || !kind.exists {
            // A delivered banner may already have folded into Notification Center. This still
            // requires a genuine matching OS notification; an API response is never a substitute.
            let top = springboard.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.01))
            top.press(forDuration: 0.05, thenDragTo: springboard.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.8)))
        }
        XCTAssertTrue(body.waitForExistence(timeout: 65), "The exact owned plan must appear in a real system notification.")
        XCTAssertTrue(kind.waitForExistence(timeout: 15), "The actual notification type must match this stage, not an older alert for the same plan.")
        XCTAssertTrue(body.isHittable)
        let headings = springboard.staticTexts.matching(identifier: heading).allElementsBoundByIndex
        XCTAssertTrue(headings.contains { $0.isHittable && abs($0.frame.midY - body.frame.midY) < 140 },
            "The expected notification heading must be visible beside the exact owned plan body.")
        capture(captureName); body.tap()
        XCTAssertTrue(app.wait(for: .runningForeground, timeout: 30), "Only tapping the delivered OS notification may foreground the App.")
    }

    private func verifyTitle(_ title: String) {
        let heading = app.staticTexts["time-poll-detail-title"]
        XCTAssertTrue(heading.waitForExistence(timeout: 30)); XCTAssertEqual(heading.label, title)
    }

    private func verifyInvitation(title: String) {
        verifyTitle(title)
        XCTAssertTrue(app.buttons["unified-plan-accept"].waitForExistence(timeout: 25))
        XCTAssertTrue(app.buttons["unified-plan-accept"].isEnabled)
        let cells = app.descendants(matching: .any).matching(NSPredicate(format: "identifier BEGINSWITH 'plan-invitation-cell-'"))
        XCTAssertGreaterThanOrEqual(cells.count, 4)
        XCTAssertGreaterThanOrEqual(cells.allElementsBoundByIndex.filter(\.isSelected).count, 2)
        XCTAssertEqual(app.descendants(matching: .any).matching(identifier: "plan-invitation-legend").count, 1)
        XCTAssertFalse(app.buttons["plan-view-calendar"].exists)
    }

    private func verifyCancelled(title: String) {
        verifyTitle(title)
        let status = app.descendants(matching: .any)["unified-plan-phase"].firstMatch
        let isCancelled = XCTNSPredicateExpectation(predicate: NSPredicate(format: "exists == true AND (label CONTAINS[c] 'cancel' OR label CONTAINS '取消' OR label CONTAINS[c] 'abgesagt')"), object: status)
        XCTAssertEqual(XCTWaiter.wait(for: [isCancelled], timeout: 25), .completed)
        XCTAssertFalse(app.buttons["unified-plan-accept"].exists)
        XCTAssertFalse(app.buttons["plan-view-calendar"].exists)
    }

    private func returnToRoot() {
        for _ in 0..<5 where !app.tabBars.firstMatch.isHittable {
            let done = app.buttons["calendar-search-done"]
            if done.isHittable { done.tap(); continue }
            let nav = app.navigationBars.buttons.element(boundBy: 0)
            if nav.isHittable { nav.tap() }
            else { app.swipeDown() }
        }
        XCTAssertTrue(app.tabBars.firstMatch.isHittable)
    }

    private func verifyCalendar(title: String) {
        app.buttons["plan-view-calendar"].tap()
        searchCalendar(title: title)
        let result = calendarResult(title: title)
        XCTAssertTrue(result.waitForExistence(timeout: 25)); capture("08-real-publication-exact-calendar-result"); result.tap()
        XCTAssertTrue(app.descendants(matching: .any)["calendar-readonly-detail"].firstMatch.waitForExistence(timeout: 15))
        let list = app.collectionViews.firstMatch.exists ? app.collectionViews.firstMatch : app.tables.firstMatch
        let manage = app.buttons["calendar-manage-plan"]
        for _ in 0..<10 where !manage.exists || !manage.isHittable { list.swipeUp(velocity: .slow) }
        XCTAssertTrue(manage.isHittable); manage.tap(); verifyTitle(title)
    }

    private func searchCalendar(title: String) {
        if !app.buttons["calendar-search"].isHittable {
            let calendar = app.tabBars.buttons.matching(NSPredicate(format: "label IN %@", ["Calendar", "日历", "Kalender"])).firstMatch
            XCTAssertTrue(calendar.isHittable); calendar.tap()
        }
        app.buttons["calendar-search"].tap()
        let search = app.searchFields.firstMatch
        XCTAssertTrue(search.waitForExistence(timeout: 10)); search.tap(); search.typeText(title)
    }

    private func calendarResult(title: String) -> XCUIElement {
        app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH 'calendar-search-result-' AND label CONTAINS %@", title)).firstMatch
    }

    private func capture(_ name: String) {
        let attachment = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
        attachment.name = "plan-physical-push-" + name
        attachment.lifetime = .keepAlways
        add(attachment)
    }
}
