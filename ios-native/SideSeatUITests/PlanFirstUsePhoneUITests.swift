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
            "--ui-testing-skip-tutorial", "--ui-testing-language=zh-Hans", "--ui-testing-appearance=light"]
        app.launch()
        let identifier = app.textFields["login-identifier"]
        XCTAssertTrue(identifier.waitForExistence(timeout: 20))
        identifier.tap(); identifier.typeText(fixture.identifier)
        let password = app.secureTextFields["login-password"]
        password.tap(); password.typeText(fixture.password)
        app.buttons["login-submit"].tap()
        XCTAssertTrue(app.tabBars.firstMatch.waitForExistence(timeout: 30))
        app.tabBars.buttons["计划"].tap()
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
        let next = app.buttons["plan-create-next"]
        XCTAssertTrue(next.isHittable); next.tap()
        XCTAssertTrue(app.descendants(matching: .any)["time-poll-dates"].firstMatch.waitForExistence(timeout: 10))
        let submit = app.buttons["time-poll-create-confirm"]
        XCTAssertTrue(submit.isHittable); XCTAssertTrue(submit.isEnabled)
        capture(app, "03-create"); submit.tap()
        XCTAssertTrue(app.staticTexts["time-poll-result-heading"].waitForExistence(timeout: 25))
        let emptyCell = app.descendants(matching: .any)["time-poll-cell-0"].firstMatch
        XCTAssertTrue(emptyCell.exists, "An empty timetable must be visible immediately after creation")
        XCTAssertTrue(emptyCell.label.hasSuffix(", 0"))
        XCTAssertTrue(app.buttons["plan-share-primary"].isHittable, "Sharing must not require anyone to fill in first")
        XCTAssertTrue(app.textFields["time-poll-name"].exists)
        XCTAssertFalse(app.buttons["plan-edit-availability"].exists)
        XCTAssertFalse(app.buttons["time-poll-switch-view"].exists)
        capture(app, "03a-empty-timetable"); phase("created-empty")
        // Reopening a plan with no responses must still show the timetable.
        app.navigationBars.buttons.element(boundBy: 0).tap()
        let card = app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH 'plans-coordinated-'")).firstMatch
        XCTAssertTrue(card.waitForExistence(timeout: 15)); card.tap()
        XCTAssertTrue(app.staticTexts["time-poll-result-heading"].waitForExistence(timeout: 15))
        XCTAssertTrue(app.descendants(matching: .any)["time-poll-cell-0"].firstMatch.label.hasSuffix(", 0"))
        XCTAssertEqual(app.textFields["time-poll-name"].value as? String, "Host Ming")
        let firstOwn = app.buttons["time-poll-cell-0"], secondOwn = app.buttons["time-poll-cell-2"]
        XCTAssertTrue(firstOwn.isHittable); XCTAssertTrue(secondOwn.isHittable)
        firstOwn.press(forDuration: 0.6, thenDragTo: secondOwn)
        XCTAssertTrue(firstOwn.isSelected); XCTAssertTrue(secondOwn.isSelected)
        XCTAssertTrue(app.staticTexts["time-poll-saved"].waitForExistence(timeout: 20))
        firstOwn.tap()
        XCTAssertFalse(firstOwn.isSelected); wait(firstOwn, labelContains: ", 0")
        app.buttons["time-poll-undo"].tap()
        XCTAssertTrue(firstOwn.isSelected)
        let day = app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH 'time-poll-day-'")).firstMatch
        day.tap()
        XCTAssertTrue(app.buttons["time-poll-cell-4"].isSelected)
        app.buttons["time-poll-undo"].tap()
        XCTAssertFalse(app.buttons["time-poll-cell-4"].isSelected)
        XCTAssertTrue(firstOwn.isSelected); XCTAssertTrue(secondOwn.isSelected)
        XCTAssertTrue(app.staticTexts["time-poll-saved"].waitForExistence(timeout: 20))
        capture(app, "04-owner-saved"); phase("created-and-saved")
        XCTAssertFalse(app.buttons["time-poll-finish"].exists, "Inline edits must not require a second completion step")
        app.navigationBars.buttons.element(boundBy: 0).tap()
        XCTAssertTrue(card.waitForExistence(timeout: 15)); card.tap()
        XCTAssertTrue(app.staticTexts["time-poll-result-heading"].waitForExistence(timeout: 15))
        XCTAssertTrue(app.buttons["time-poll-cell-0"].isSelected)
        XCTAssertTrue(app.buttons["time-poll-cell-2"].isSelected)
        let share = app.buttons["plan-share-primary"]
        XCTAssertTrue(share.isHittable)
        XCTAssertFalse(app.buttons["plan-edit-availability"].exists)
        let ownCell = app.descendants(matching: .any)["time-poll-cell-0"].firstMatch
        XCTAssertTrue(ownCell.exists, "Saving must keep the timetable visible even with no friend responses")
        XCTAssertTrue(ownCell.label.hasSuffix(", 1"))
        XCTAssertLessThan(ownCell.frame.maxY, share.frame.minY)
        capture(app, "05-next-share"); share.tap()
        // iOS 26 exposes share actions as cells; earlier releases use buttons.
        let copyLabels = NSPredicate(format: "label IN %@", ["Copy", "拷贝", "复制"])
        let copyCell = app.cells.matching(copyLabels).firstMatch
        let copy = copyCell.waitForExistence(timeout: 3) ? copyCell : app.buttons.matching(copyLabels).firstMatch
        XCTAssertTrue(copy.waitForExistence(timeout: 10), "The system share sheet must offer copying the plan link")
        capture(app, "05-system-share"); copy.tap()
        XCTAssertEqual(XCTWaiter.wait(for: [XCTNSPredicateExpectation(predicate: NSPredicate(format: "hittable == true"), object: app.buttons["plan-copy-link"])], timeout: 10), .completed)
        app.buttons["plan-copy-link"].tap()
        XCTAssertEqual(app.buttons["plan-copy-link"].label, "链接已复制")

        safari.activate()
        let done = safari.buttons.matching(NSPredicate(format: "label IN %@", ["Done", "完成"])).firstMatch
        if done.exists { done.tap() }
        let address = safari.textFields["TabBarItemTitle"]
        if !address.exists { safari.swipeDown() }
        XCTAssertTrue(address.waitForExistence(timeout: 10)); address.tap()
        let input = safari.textFields.firstMatch
        input.typeKey("a", modifierFlags: .command)
        input.typeKey("v", modifierFlags: .command)
        // Cross-app paste consent belongs to SpringBoard, not Safari's hierarchy.
        let allowPaste = XCUIApplication(bundleIdentifier: "com.apple.springboard").buttons.matching(NSPredicate(format: "label IN %@", ["Allow Paste", "允许粘贴"])).firstMatch
        if allowPaste.waitForExistence(timeout: 3) { allowPaste.tap() }
        let copiedURL = try XCTUnwrap(input.value as? String)
        XCTAssertTrue(copiedURL.contains("sideseat.de/"), "Use the actual link copied from the newly created plan")
        let webURL = copiedURL.replacingOccurrences(of: "https://sideseat.de/", with: "https://www.sideseat.de/")
        replace(input, with: webURL + "\n")
        let name = safari.webViews.textFields.firstMatch
        XCTAssertTrue(name.waitForExistence(timeout: 30))
        XCTAssertTrue(safari.staticTexts[fixture.title].exists, "The copied link must open the newly created plan")
        name.tap(); name.typeText("Guest Lin")
        webButton("Next: choose my free time", "下一步：选择我的空闲").tap()
        let first = safari.switches.matching(NSPredicate(format: "label CONTAINS %@", ", 09:00")).firstMatch
        let second = safari.switches.matching(NSPredicate(format: "label CONTAINS %@", ", 09:30")).firstMatch
        XCTAssertTrue(first.waitForExistence(timeout: 20))
        for _ in 0..<3 where !second.isHittable { safari.swipeUp() }
        let finish = webButton("Save and continue", "保存并继续")
        XCTAssertLessThan(second.frame.maxY, finish.frame.minY, "Name submission must reveal the time cells above the fixed save bar")
        capture(safari, "06a-guest-editor")
        first.tap(); second.tap()
        XCTAssertTrue(safari.staticTexts.matching(NSPredicate(format: "label IN %@", ["Saved automatically", "已自动保存"])).firstMatch.waitForExistence(timeout: 20))
        capture(safari, "06-guest-saved"); phase("guest-saved")
        for _ in 0..<3 where !finish.isHittable { safari.swipeUp() }
        XCTAssertTrue(finish.isHittable); finish.tap()
        capture(safari, "07-guest-results")

        app.activate()
        let people = app.staticTexts["time-poll-participants"]
        wait(people, labelContains: "Guest Lin")
        let sharedCell = app.buttons["time-poll-cell-0"]
        wait(sharedCell, labelContains: ", 2")
        sharedCell.tap()
        wait(sharedCell, labelContains: ", 1")
        XCTAssertFalse(sharedCell.isSelected)
        XCTAssertTrue(app.staticTexts["time-poll-saved"].waitForExistence(timeout: 20))
        capture(app, "08a-own-time-removed-friend-kept"); phase("owner-edited")
        app.navigationBars.buttons.element(boundBy: 0).tap()
        XCTAssertTrue(card.waitForExistence(timeout: 15)); card.tap()
        XCTAssertTrue(sharedCell.waitForExistence(timeout: 15))
        XCTAssertFalse(sharedCell.isSelected); wait(sharedCell, labelContains: ", 1")
        sharedCell.tap()
        wait(sharedCell, labelContains: ", 2")
        XCTAssertTrue(sharedCell.isSelected)
        XCTAssertTrue(app.staticTexts["time-poll-saved"].waitForExistence(timeout: 20))
        phase("owner-restored")
        let invite = app.buttons["unified-plan-invite-window"]
        XCTAssertTrue(invite.isHittable); capture(app, "08-owner-results"); invite.tap()
        let send = app.buttons["unified-plan-send-invitations"]
        XCTAssertTrue(send.waitForExistence(timeout: 10)); XCTAssertTrue(send.isHittable)
        app.buttons["unified-plan-invite-until"].tap()
        let ten = app.buttons.matching(NSPredicate(format: "label IN %@", ["10:00", "10:00 AM", "10:00\u{202f}AM"])).firstMatch
        XCTAssertTrue(ten.waitForExistence(timeout: 5)); ten.tap()
        capture(app, "09-review-invitation"); send.tap()
        let count = app.staticTexts["unified-plan-confirmation-count"]
        wait(count, labelContains: "1/2 人已确认")
        XCTAssertEqual(app.buttons["unified-plan-choose-again"].label, "另选时间")
        capture(app, "10-awaiting-confirmation"); phase("awaiting-confirmation")

        safari.activate()
        let accept = webButton("Confirm participation", "确认参加")
        XCTAssertTrue(accept.waitForExistence(timeout: 35)); capture(safari, "11-guest-invitation"); accept.tap()
        XCTAssertTrue(safari.staticTexts.matching(NSPredicate(format: "label IN %@", ["Plan confirmed", "计划已确定"])).firstMatch.waitForExistence(timeout: 25))
        capture(safari, "12-guest-confirmed")
        app.activate(); wait(count, labelContains: "2/2 人已确认")
        let calendar = app.buttons["plan-view-calendar"]
        XCTAssertTrue(calendar.waitForExistence(timeout: 15)); capture(app, "13-native-confirmed"); phase("confirmed")
        calendar.tap()
        XCTAssertTrue(app.tabBars.buttons["日历"].isSelected)
        app.buttons["calendar-search"].tap()
        let search = app.searchFields.firstMatch
        XCTAssertTrue(search.waitForExistence(timeout: 10)); search.tap(); search.typeText(fixture.title)
        let result = app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH 'calendar-search-result-' AND label CONTAINS %@", fixture.title)).firstMatch
        XCTAssertTrue(result.waitForExistence(timeout: 20)); capture(app, "14-calendar-search"); result.tap()
        let manage = app.buttons["calendar-manage-plan"]
        for _ in 0..<4 where !manage.isHittable { app.swipeUp() }
        XCTAssertTrue(manage.waitForExistence(timeout: 10)); capture(app, "15-calendar-entry")
        manage.tap(); wait(count, labelContains: "2/2 人已确认")
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
