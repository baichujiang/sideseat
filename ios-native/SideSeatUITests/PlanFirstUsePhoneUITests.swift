import XCTest

/// One continuous real App → Safari → App → Safari → Calendar journey.
/// The Mac creates/checks the disposable account; the runner performs no HTTP calls.
@MainActor final class PlanFirstUsePhoneUITests: XCTestCase {
    private struct Fixture: Decodable {
        let identifier: String
        let password: String
        let title: String
        let bundle: String
    }
    private var app: XCUIApplication!
    private let safari = XCUIApplication(bundleIdentifier: "com.apple.mobilesafari")

    override func setUpWithError() throws { continueAfterFailure = false }

    func testFirstVisitCreateShareFillInviteConfirmAndCalendar() throws {
        let raw = ProcessInfo.processInfo.environment["SIDESEAT_FIRST_PLAN_PHONE_JSON"]
        try XCTSkipIf(raw == nil || raw!.isEmpty, "Requires a fresh disposable phone account from the Mac.")
        let fixture = try JSONDecoder().decode(Fixture.self, from: Data(raw!.utf8))
        app = XCUIApplication(bundleIdentifier: fixture.bundle)
        addTeardownBlock { [self] in MainActor.assumeIsolated { app.terminate() } }
        app.launchArguments = ["--ui-testing-signed-out", "--ui-testing-ephemeral-credentials",
            "--ui-testing-skip-tutorial", "--ui-testing-language=en", "--ui-testing-appearance=light"]
        app.launch()
        let identifier = app.textFields["login-identifier"]
        XCTAssertTrue(identifier.waitForExistence(timeout: 20))
        identifier.tap(); identifier.typeText(fixture.identifier)
        let password = app.secureTextFields["login-password"]
        password.tap(); password.typeText(fixture.password)
        app.buttons["login-submit"].tap()
        XCTAssertTrue(app.tabBars.firstMatch.waitForExistence(timeout: 30))
        app.tabBars.buttons["Plans"].tap()
        let create = app.buttons["plans-create-primary"]
        XCTAssertTrue(create.waitForExistence(timeout: 25)); XCTAssertTrue(create.isHittable)
        capture(app, "01-first-visit")
        create.tap()
        let collect = app.buttons["plan-mode-collect"]
        XCTAssertTrue(collect.waitForExistence(timeout: 10))
        XCTAssertTrue(app.buttons["plan-mode-fixed"].exists)
        capture(app, "02-choice"); collect.tap()
        let title = app.textFields["time-poll-title"]
        XCTAssertTrue(title.waitForExistence(timeout: 10)); title.tap(); title.typeText(fixture.title + "\n")
        let submit = app.buttons["time-poll-create-confirm"]
        XCTAssertTrue(submit.isHittable); XCTAssertTrue(submit.isEnabled)
        capture(app, "03-create"); submit.tap()
        XCTAssertTrue(app.buttons["time-poll-cell-0"].waitForExistence(timeout: 25))
        replace(app.textFields["time-poll-name"], with: "Host Ming\n")
        app.buttons["time-poll-cell-0"].tap(); app.buttons["time-poll-cell-2"].tap()
        XCTAssertTrue(app.staticTexts["time-poll-saved"].waitForExistence(timeout: 20))
        capture(app, "04-owner-saved"); phase("created-and-saved")
        app.buttons["time-poll-finish"].tap()
        XCTAssertTrue(app.staticTexts["time-poll-result-heading"].waitForExistence(timeout: 10))
        let share = app.buttons["plan-share-primary"]
        XCTAssertTrue(share.isHittable); share.tap()
        let copy = app.buttons.matching(NSPredicate(format: "label IN %@", ["Copy", "拷贝", "复制"])).firstMatch
        XCTAssertTrue(copy.waitForExistence(timeout: 10), "The system share sheet must offer copying the plan link")
        capture(app, "05-system-share"); copy.tap()
        XCTAssertTrue(app.buttons["plan-copy-link"].waitForExistence(timeout: 10))
        app.buttons["plan-copy-link"].tap()
        XCTAssertEqual(app.buttons["plan-copy-link"].label, "Link copied")

        safari.activate()
        let done = safari.buttons.matching(NSPredicate(format: "label IN %@", ["Done", "完成"])).firstMatch
        if done.exists { done.tap() }
        let address = safari.textFields["TabBarItemTitle"]
        if !address.exists { safari.swipeDown() }
        XCTAssertTrue(address.waitForExistence(timeout: 10)); address.tap()
        let input = safari.textFields.firstMatch
        input.typeKey("a", modifierFlags: .command)
        input.typeKey("v", modifierFlags: .command)
        let allowPaste = safari.buttons.matching(NSPredicate(format: "label IN %@", ["Allow Paste", "允许粘贴"])).firstMatch
        if allowPaste.waitForExistence(timeout: 2) { allowPaste.tap() }
        let copiedURL = try XCTUnwrap(input.value as? String)
        XCTAssertTrue(copiedURL.contains("sideseat.de/"), "Use the actual link copied from the newly created plan")
        let webURL = copiedURL.replacingOccurrences(of: "https://sideseat.de/", with: "https://www.sideseat.de/")
        replace(input, with: webURL + "\n")
        let name = safari.webViews.textFields.firstMatch
        XCTAssertTrue(name.waitForExistence(timeout: 30))
        name.tap(); name.typeText("Guest Lin")
        webButton("Start or continue", "开始 / 继续填写").tap()
        let first = safari.switches.matching(NSPredicate(format: "label CONTAINS %@", ", 09:00")).firstMatch
        let second = safari.switches.matching(NSPredicate(format: "label CONTAINS %@", ", 09:30")).firstMatch
        XCTAssertTrue(first.waitForExistence(timeout: 20))
        for _ in 0..<3 where !second.isHittable { safari.swipeUp() }
        first.tap(); second.tap()
        XCTAssertTrue(safari.staticTexts.matching(NSPredicate(format: "label IN %@", ["Saved", "已保存"])).firstMatch.waitForExistence(timeout: 20))
        capture(safari, "06-guest-saved"); phase("guest-saved")
        let finish = webButton("Done selecting", "完成填写")
        for _ in 0..<3 where !finish.isHittable { safari.swipeUp() }
        XCTAssertTrue(finish.isHittable); finish.tap()
        capture(safari, "07-guest-results")

        app.activate()
        let people = app.staticTexts["time-poll-participants"]
        wait(people, labelContains: "Guest Lin")
        let invite = app.buttons["unified-plan-invite-window"]
        XCTAssertTrue(invite.isHittable); capture(app, "08-owner-results"); invite.tap()
        let send = app.buttons["unified-plan-send-invitations"]
        XCTAssertTrue(send.waitForExistence(timeout: 10)); XCTAssertTrue(send.isHittable)
        app.buttons["unified-plan-invite-until"].tap()
        let ten = app.buttons.matching(NSPredicate(format: "label IN %@", ["10:00", "10:00 AM", "10:00\u{202f}AM"])).firstMatch
        XCTAssertTrue(ten.waitForExistence(timeout: 5)); ten.tap()
        capture(app, "09-review-invitation"); send.tap()
        let count = app.staticTexts["unified-plan-confirmation-count"]
        wait(count, labelContains: "1 of 2 confirmed")
        capture(app, "10-awaiting-confirmation"); phase("awaiting-confirmation")

        safari.activate()
        let accept = webButton("Confirm participation", "确认参加")
        XCTAssertTrue(accept.waitForExistence(timeout: 35)); capture(safari, "11-guest-invitation"); accept.tap()
        XCTAssertTrue(safari.staticTexts.matching(NSPredicate(format: "label IN %@", ["Plan confirmed", "计划已确定"])).firstMatch.waitForExistence(timeout: 25))
        capture(safari, "12-guest-confirmed")
        app.activate(); wait(count, labelContains: "2 of 2 confirmed")
        let calendar = app.buttons["plan-view-calendar"]
        XCTAssertTrue(calendar.waitForExistence(timeout: 15)); capture(app, "13-native-confirmed"); phase("confirmed")
        calendar.tap()
        XCTAssertTrue(app.tabBars.buttons["Calendar"].isSelected)
        app.buttons["calendar-search"].tap()
        let search = app.searchFields.firstMatch
        XCTAssertTrue(search.waitForExistence(timeout: 10)); search.tap(); search.typeText(fixture.title)
        let result = app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH 'calendar-search-result-' AND label CONTAINS %@", fixture.title)).firstMatch
        XCTAssertTrue(result.waitForExistence(timeout: 20)); capture(app, "14-calendar-search"); result.tap()
        let manage = app.buttons["calendar-manage-plan"]
        for _ in 0..<4 where !manage.isHittable { app.swipeUp() }
        XCTAssertTrue(manage.waitForExistence(timeout: 10)); capture(app, "15-calendar-entry")
        manage.tap(); wait(count, labelContains: "2 of 2 confirmed")
        capture(app, "16-calendar-to-plan"); phase("calendar-verified")
    }

    private func webButton(_ en: String, _ zh: String) -> XCUIElement {
        safari.buttons.matching(NSPredicate(format: "label IN %@", [en, zh])).firstMatch
    }
    private func replace(_ field: XCUIElement, with value: String) {
        field.tap(); field.typeKey("a", modifierFlags: .command); field.typeText(value)
    }
    private func wait(_ element: XCUIElement, labelContains value: String) {
        XCTAssertEqual(XCTWaiter.wait(for: [XCTNSPredicateExpectation(predicate: NSPredicate(format: "label CONTAINS %@", value), object: element)], timeout: 30), .completed)
    }
    private func phase(_ value: String) { print("FIRST_PLAN_PHONE_PHASE \(value)") }
    private func capture(_ surface: XCUIApplication, _ name: String) {
        let attachment = XCTAttachment(screenshot: surface.screenshot())
        attachment.name = "phone-first-plan-" + name; attachment.lifetime = .keepAlways; add(attachment)
    }
}
