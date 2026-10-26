import XCTest
import Darwin

/// Dedicated real APNs acceptance. The Mac triggers only the independent push plan, not the native main flow.
@MainActor final class FiveRootPlanLocalizedPushPhoneUITests: XCTestCase {
    private struct Account: Decodable {
        let role: String; let id: String; let identifier: String; let password: String; let displayName: String
    }
    private struct PushPlan: Decodable { let preparedAt: String; let token: String; let title: String; let location: String }
    private struct Fixture: Decodable {
        let kind: String; let schemaVersion: Int; let runID: String; let baseURL: String
        let bundle: String; let edgePrefix: String; let pollToken: String; let tokens: [String]
        let accounts: [Account]; let localizedPush: PushPlan
    }
    private var fixture: Fixture!
    private var app: XCUIApplication!
    private let springboard = XCUIApplication(bundleIdentifier: "com.apple.springboard")
    override func setUpWithError() throws { continueAfterFailure = false }
    override func tearDown() async throws { await MainActor.run { app?.terminate() } }

    func testChineseForegroundInvitationConfirmationCancellationAndCalendar() throws {
        try loadAndLogin()
        phase("invitation-ready")
        try tapNotice(heading: "有计划待你确认", captureName: "01-real-Chinese-invitation-banner")
        try verifyTitle()
        let accept = app.buttons["unified-plan-accept"]
        try require(accept.waitForExistence(timeout: 25) && accept.isEnabled, "The real invitation banner must route to the owned invitation.")
        let cells = app.descendants(matching: .any).matching(NSPredicate(format: "identifier BEGINSWITH 'plan-invitation-cell-'"))
        try require(cells.allElementsBoundByIndex.filter(\.isSelected).count >= 2, "The routed invitation must show the selected final hour.")
        try capture("02-invitation-tap-correct-plan")
        phase("invitation-opened")
        try tap(accept)
        try require(element("unified-plan-accepted-status").waitForExistence(timeout: 25), "Acceptance must come from the actual App UI.")
        try require(!app.buttons["plan-view-calendar"].exists, "A response must not publish a Calendar event.")
        phase("peer-accepted")
        try returnToRoot()

        phase("publication-ready")
        try tapNotice(heading: "计划已确认", captureName: "03-real-Chinese-confirmation-banner")
        try verifyTitle()
        try require(app.buttons["plan-view-calendar"].waitForExistence(timeout: 25), "The confirmation banner must route to the published plan.")
        try capture("04-confirmation-tap-Calendar-action")
        phase("publication-opened")
        try verifyCalendar()
        phase("calendar-verified")
        try returnToRoot()

        phase("cancellation-ready")
        try tapNotice(heading: "计划已取消", captureName: "06-real-Chinese-cancellation-banner")
        try verifyTitle()
        try require(waitUntil { self.element("unified-plan-phase").label.contains("取消") }, "The cancellation banner must route to this cancelled plan.")
        try require(!app.buttons["unified-plan-accept"].exists && !app.buttons["plan-view-calendar"].exists,
            "The cancelled plan must have neither acceptance nor Calendar actions.")
        try capture("07-cancellation-tap-correct-plan")
        phase("cancellation-opened")
        try returnToRoot()
        let result = try searchCalendar()
        try require(element("calendar-search-empty").waitForExistence(timeout: 25) && result.waitForNonExistence(timeout: 10),
            "Cancellation must remove the exact push-plan event from Calendar.")
        try capture("08-cancelled-Calendar-empty")
        phase("calendar-cleared")
        phase("complete")
    }

    private func loadAndLogin() throws {
        try require(ProcessInfo.processInfo.environment["SIMULATOR_UDID"] == nil, "Real physical APNs on the default iPhone 14 Plus is required.")
        let raw = ProcessInfo.processInfo.environment["SIDESEAT_PLAN_SIX_JSON"] ?? ""
        try XCTSkipUnless(!raw.isEmpty, "Supply the dedicated six-account private push fixture.")
        let data = raw.hasPrefix("{") ? Data(raw.utf8) : try Data(contentsOf: URL(fileURLWithPath: raw))
        fixture = try JSONDecoder().decode(Fixture.self, from: data)
        try require(fixture.kind == "five-roots-plans-live" && fixture.schemaVersion == 1
            && fixture.baseURL == "https://api.sideseat.de" && fixture.bundle == "app.sideseat.mobile.preview", "Use only the owned production Preview cohort.")
        try require(fixture.runID.range(of: "^[a-f0-9]{8}$", options: .regularExpression) != nil, "A valid run identity is required.")
        try require(Set(fixture.accounts.map(\.role)) == Set(["owner", "peer1", "peer2", "peer3", "peer4", "peer5"])
            && fixture.accounts.count == 6 && Set(fixture.accounts.map(\.id)).count == 6, "Only the six disposable roles may participate.")
        try require(fixture.accounts.allSatisfy { $0.identifier == "pqa_six_\($0.role)_\(fixture.runID)" }, "Do not log in an unrelated account.")
        try require(fixture.localizedPush.title == fixture.edgePrefix + " push-中文 %@ 100%"
            && fixture.tokens.contains(fixture.localizedPush.token) && fixture.localizedPush.token != fixture.pollToken,
            "Use only the independent owned push plan; retain literal percent characters.")
        let peer = try XCTUnwrap(fixture.accounts.first { $0.role == "peer1" })
        app = XCUIApplication(bundleIdentifier: fixture.bundle)
        app.launchArguments = ["--ui-testing-signed-out", "--ui-testing-ephemeral-credentials", "--ui-testing-skip-tutorial",
            "--ui-testing-language=zh-Hans", "--ui-testing-appearance=light", "-UIPreferredContentSizeCategoryName", "UICTContentSizeCategoryL"]
        app.launchEnvironment = [:]; app.launch()
        let identifier = app.textFields["login-identifier"]
        try require(identifier.waitForExistence(timeout: 25), "Use the real login form.")
        identifier.tap(); identifier.typeText(peer.identifier)
        let password = app.secureTextFields["login-password"]
        try require(password.exists, "Use the real password field.")
        password.tap(); password.typeText(peer.password); app.buttons["login-submit"].tap()
        try require(app.tabBars.firstMatch.waitForExistence(timeout: 35), "The owned participant must reach the real App shell.")
        try allowNotificationPermissionIfPresent()
        RunLoop.current.run(until: Date().addingTimeInterval(4))
    }
    private func allowNotificationPermissionIfPresent() throws {
        let alert = springboard.alerts.firstMatch
        guard alert.waitForExistence(timeout: 3) else { return }
        let text = alert.staticTexts.allElementsBoundByIndex.map(\.label).joined(separator: " ")
        let notification = ["notification", "通知", "Mitteilungen", "Benachrichtigung"].contains { text.localizedCaseInsensitiveContains($0) }
        try require(text.localizedCaseInsensitiveContains("SideSeat") && notification, "Only the actual notification permission is expected.")
        let allow = alert.buttons.matching(NSPredicate(format: "label IN %@", ["Allow", "允许", "Erlauben"])).firstMatch
        try require(allow.exists, "The actual notification permission must offer Allow.")
        allow.tap()
    }
    private func element(_ id: String) -> XCUIElement { app.descendants(matching: .any).matching(identifier: id).firstMatch }
    private func tapNotice(heading: String, captureName: String) throws {
        let notice = app.buttons["foreground-push-notice"]
        let label = heading + ", " + fixture.localizedPush.title
        let arrived = XCTNSPredicateExpectation(predicate: NSPredicate(format: "exists == true AND label == %@", label), object: notice)
        try require(XCTWaiter.wait(for: [arrived], timeout: 90) == .completed,
            "A genuine Chinese foreground APNs banner with the unchanged literal activity title must arrive.")
        // The production notice dismisses after four seconds: inspect, capture and tap immediately.
        try require(notice.label == label && notice.isHittable, "The exact delivered banner must be visible and actionable.")
        try capture(captureName)
        notice.tap()
    }
    private func verifyTitle() throws {
        let title = element("time-poll-detail-title")
        try require(title.waitForExistence(timeout: 30) && title.label == fixture.localizedPush.title,
            "Only an actual notification tap may route to the exact owned push plan.")
    }
    private func returnToRoot() throws {
        for _ in 0..<6 {
            if app.tabBars.firstMatch.isHittable && !element("time-poll-detail-title").exists
                && !element("calendar-readonly-detail").exists && !app.searchFields.firstMatch.exists { return }
            let searchDone = app.buttons["calendar-search-done"]
            if searchDone.isHittable { try tap(searchDone, minimumHeight: 35.99); continue }
            let back = app.navigationBars.buttons.element(boundBy: 0)
            try tap(back, minimumHeight: 35.99)
        }
        try require(false, "Close only the actual plan, Calendar detail and search surfaces before the next foreground notice.")
    }
    private func searchCalendar() throws -> XCUIElement {
        try tap(app.tabBars.buttons["日历"])
        try tap(app.buttons["calendar-search"], minimumHeight: 35.99)
        let query = app.searchFields.firstMatch
        try require(query.waitForExistence(timeout: 10), "Calendar search must open.")
        query.tap(); query.typeText(fixture.localizedPush.title)
        return app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH 'calendar-search-result-' AND label CONTAINS %@", fixture.localizedPush.title)).firstMatch
    }
    private func verifyCalendar() throws {
        try tap(app.buttons["plan-view-calendar"])
        let result = try searchCalendar()
        try require(result.waitForExistence(timeout: 25), "The published push plan must appear in Calendar.")
        try require(app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH 'calendar-search-result-' AND label CONTAINS %@", fixture.localizedPush.title)).count == 1,
            "Only one Calendar event may represent this push plan.")
        try tap(result)
        try require(element("calendar-readonly-detail").waitForExistence(timeout: 15), "Open the actual Calendar event.")
        let list = app.collectionViews.firstMatch.exists ? app.collectionViews.firstMatch : app.tables.firstMatch
        let owner = try XCTUnwrap(fixture.accounts.first { $0.role == "owner" })
        for (id, value) in [("calendar-detail-start", "09:00"), ("calendar-detail-end", "10:00"), ("calendar-detail-location", fixture.localizedPush.location)] {
            let row = element(id)
            for _ in 0..<12 where !row.exists || !row.isHittable { list.swipeUp(velocity: .slow) }
            try require(row.exists && row.label.contains(value), "The Calendar must preserve the real invitation hour and location.")
        }
        let companion = app.staticTexts[owner.displayName]
        for _ in 0..<12 where !companion.exists || !companion.isHittable { list.swipeUp(velocity: .slow) }
        try require(companion.isHittable, "The accepted owner must be the actual Calendar companion.")
        try capture("05-published-Calendar-literal-title-time-and-companion")
    }
    private func tap(_ control: XCUIElement, minimumHeight: CGFloat = 43.99) throws {
        try require(control.waitForExistence(timeout: 20) && control.isHittable && control.isEnabled, "The real UI action must be reachable and enabled.")
        try require(control.frame.height >= minimumHeight && app.windows.firstMatch.frame.insetBy(dx: -0.5, dy: -0.5).contains(control.frame),
            "The complete action must fit its real touch target.")
        control.tap()
    }
    private func waitUntil(_ condition: () -> Bool) -> Bool {
        let until = Date().addingTimeInterval(25)
        repeat { if condition() { return true }; RunLoop.current.run(until: Date().addingTimeInterval(0.2)) } while Date() < until
        return condition()
    }
    private func require(_ condition: Bool, _ message: String) throws {
        guard condition else {
            if let app, app.state == .runningForeground, !app.textFields["login-identifier"].exists, !app.secureTextFields.firstMatch.exists {
                let tree = XCTAttachment(string: app.debugDescription); tree.name = "localized-push-private-failure-AX"; tree.lifetime = .keepAlways; add(tree)
                let screen = XCTAttachment(screenshot: app.screenshot()); screen.name = "localized-push-private-failure-screen"; screen.lifetime = .keepAlways; add(screen)
            }
            XCTFail(message); throw NSError(domain: "FiveRootPlanLocalizedPush", code: 1, userInfo: [NSLocalizedDescriptionKey: message])
        }
    }
    private func phase(_ value: String) { print("PLAN_LOCALIZED_PUSH_PHASE \(value)"); fflush(stdout) }
    private func capture(_ value: String) throws {
        try require(!app.secureTextFields.firstMatch.exists && !app.textFields["login-identifier"].exists, "Never capture login credentials.")
        let item = XCTAttachment(screenshot: app.screenshot()); item.name = "localized-plan-push-" + value; item.lifetime = .keepAlways; add(item)
    }
}
