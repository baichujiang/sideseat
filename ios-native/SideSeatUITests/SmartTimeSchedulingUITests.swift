import XCTest

final class SmartTimeSchedulingUITests: XCTestCase {
    @MainActor
    private func openPlan(extra: [String] = [], recommend: Bool = true) -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments = ["--ui-testing-authenticated", "--ui-testing-chats", "--ui-testing-smart-time-windows", "--ui-testing-skip-tutorial"] + extra
        if !extra.contains(where: { $0.hasPrefix("--ui-testing-language=") }) {
            app.launchArguments.append("--ui-testing-language=zh-Hans")
        }
        app.launch()
        let row = app.descendants(matching: .any)["inbox-row-ui-connection"]
        XCTAssertTrue(row.waitForExistence(timeout: 8)); row.tap()
        let plan = app.buttons["chat-composer-plan"]
        XCTAssertTrue(plan.waitForExistence(timeout: 6))
        XCTAssertFalse(app.buttons["chat-smart-time"].exists)
        plan.tap()
        let smart = app.buttons["plan-smart-time"]
        XCTAssertTrue(smart.waitForExistence(timeout: 6))
        if recommend { smart.tap() }
        return app
    }

    @MainActor
    func testOneTapShowsWholeWindowsAndSelectionFillsPlan() {
        let app = openPlan()
        let candidates = app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH %@", "smart-time-window-"))
        XCTAssertTrue(candidates.firstMatch.waitForExistence(timeout: 6))
        XCTAssertEqual(candidates.count, 3)
        XCTAssertTrue(candidates.element(boundBy: 0).label.contains("09:00 – 12:00"))
        XCTAssertTrue(candidates.element(boundBy: 1).label.contains("13:00 – 17:00"))
        XCTAssertFalse(app.buttons["smart-time-send"].exists)
        XCTAssertFalse(app.buttons["smart-time-open-peer"].exists)
        attach(app, "direct-free-windows")
        let first = candidates.firstMatch.identifier
        app.buttons["smart-time-more"].tap()
        XCTAssertNotEqual(first, candidates.firstMatch.identifier)
        app.buttons["smart-time-more"].tap()
        app.buttons["smart-time-more"].tap()
        XCTAssertEqual(first, candidates.firstMatch.identifier)
        candidates.firstMatch.tap()
        let title = app.textFields["plan-create-title"]
        XCTAssertTrue(title.waitForExistence(timeout: 6))
        let start = app.datePickers["plan-create-start"]
        let end = app.datePickers["plan-create-end"]
        XCTAssertTrue(start.waitForExistence(timeout: 3))
        XCTAssertTrue(start.buttons["09:00"].exists, start.debugDescription)
        XCTAssertTrue(end.buttons["12:00"].exists, end.debugDescription)
        XCTAssertFalse(app.switches["plan-confirm-timing"].exists)
        attach(app, "free-window-filled-in-plan")
        if (title.value as? String)?.isEmpty != false || (title.value as? String) == title.placeholderValue {
            title.tap(); title.typeText("一起自习")
        }
        let submit = app.buttons["plan-create-submit"]
        XCTAssertTrue(submit.isEnabled)
        submit.tap()
        XCTAssertTrue(app.buttons["chat-composer-plan"].waitForExistence(timeout: 6))
        XCTAssertTrue(app.descendants(matching: .any).matching(NSPredicate(format: "identifier BEGINSWITH %@", "plan-card-ui-local-plan-")).firstMatch.waitForExistence(timeout: 5))
    }

    @MainActor
    func testCancelRecommendationsPreservesManualDraft() {
        let app = openPlan(recommend: false)
        let title = app.textFields["plan-create-title"]
        title.tap(); title.typeText("自习讨论")
        let location = app.textFields["plan-create-location"]
        location.tap(); location.typeText("图书馆")
        let start = app.datePickers["plan-create-start"]
        let originalTime = start.buttons.allElementsBoundByIndex.map(\.label)
        let smart = app.buttons["plan-smart-time"]
        for _ in 0..<4 where smart.frame.minY < 120 {
            scrollForm(app, down: true)
        }
        smart.tap()
        XCTAssertTrue(app.buttons["smart-time-more"].waitForExistence(timeout: 6))
        XCTAssertEqual(app.staticTexts["smart-time-activity"].label, "自习讨论")
        attach(app, "chooser-with-activity")
        app.buttons["smart-time-close"].tap()
        XCTAssertTrue(smart.waitForExistence(timeout: 5))
        XCTAssertEqual(title.value as? String, "自习讨论")
        XCTAssertEqual(location.value as? String, "图书馆")
        XCTAssertEqual(start.buttons.allElementsBoundByIndex.map(\.label), originalTime)
        XCTAssertTrue(app.buttons["plan-create-submit"].exists)
        smart.tap()
        XCTAssertTrue(app.buttons["smart-time-more"].waitForExistence(timeout: 5))
        let candidate = app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH %@", "smart-time-window-")).firstMatch
        candidate.tap()
        XCTAssertTrue(title.waitForExistence(timeout: 5))
        XCTAssertEqual(title.value as? String, "自习讨论")
        XCTAssertEqual(location.value as? String, "图书馆")
        XCTAssertTrue(start.buttons["09:00"].exists)
        XCTAssertTrue(app.datePickers["plan-create-end"].buttons["12:00"].exists)
        attach(app, "recommendation-preserves-plan-details")
    }

    @MainActor
    func testManualPlanCanBeSentWithoutOpeningRecommendations() {
        let app = openPlan(recommend: false)
        attach(app, "plan-editor-smart-entry")
        let title = app.textFields["plan-create-title"]
        title.tap(); title.typeText("手动约时间")
        let start = app.datePickers["plan-create-start"]
        let end = app.datePickers["plan-create-end"]
        for _ in 0..<5 where !end.buttons.firstMatch.isHittable { scrollForm(app, down: false) }
        XCTAssertTrue(start.buttons.firstMatch.isHittable)
        XCTAssertTrue(end.buttons.firstMatch.isHittable)
        XCTAssertFalse(app.buttons["smart-time-more"].exists)
        attach(app, "manual-time-fields-remain-direct")
        XCTAssertTrue(app.buttons["plan-create-submit"].isEnabled)
        app.buttons["plan-create-submit"].tap()
        XCTAssertTrue(app.buttons["chat-composer-plan"].waitForExistence(timeout: 6))
        XCTAssertFalse(app.buttons["chat-smart-time"].exists)
    }

    @MainActor
    func testNoAvailabilityIsExplained() {
        let app = openPlan(extra: ["--ui-testing-smart-time-busy"])
        XCTAssertTrue(app.staticTexts["smart-time-empty"].waitForExistence(timeout: 6))
        XCTAssertFalse(app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH %@", "smart-time-window-")).firstMatch.exists)
        attach(app, "no-free-windows")
        app.buttons["smart-time-manual"].tap()
        XCTAssertTrue(app.buttons["plan-smart-time"].waitForExistence(timeout: 5))
    }

    @MainActor
    func testFailedCalendarLoadNeverPretendsToBeFree() {
        let app = openPlan(extra: ["--ui-testing-smart-time-error"])
        XCTAssertTrue(app.buttons["smart-time-retry"].waitForExistence(timeout: 6))
        XCTAssertFalse(app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH %@", "smart-time-window-")).firstMatch.exists)
        attach(app, "calendar-load-error")
        app.buttons["smart-time-retry"].tap()
        XCTAssertTrue(app.buttons["smart-time-retry"].waitForExistence(timeout: 5))
    }

    @MainActor
    func testChooserInDarkModeAndLargeText() {
        for (name, arguments) in [
            ("chooser-dark-german", ["--ui-testing-appearance=dark", "--ui-testing-language=de"]),
            ("chooser-accessibility", ["--ui-testing-appearance=light", "--ui-testing-dynamic-type-accessibility",
                                       "-UIPreferredContentSizeCategoryName", "UICTContentSizeCategoryAccessibilityXXXL"])
        ] {
            let app = openPlan(extra: arguments)
            let candidates = app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH %@", "smart-time-window-"))
            XCTAssertTrue(candidates.firstMatch.waitForExistence(timeout: 6))
            XCTAssertEqual(candidates.count, 3)
            XCTAssertTrue(candidates.firstMatch.isHittable)
            XCTAssertTrue(app.buttons["smart-time-close"].isHittable)
            if name == "chooser-accessibility" {
                XCTAssertGreaterThan(candidates.firstMatch.frame.height, 130,
                                     "Verify that the presented chooser actually uses large text.")
            }
            attach(app, name)
            candidates.firstMatch.tap()
            XCTAssertTrue(app.buttons["plan-create-submit"].waitForExistence(timeout: 5))
        }
    }

    @MainActor private func scrollForm(_ app: XCUIApplication, down: Bool) {
        // Keep the gesture inside visible form content, above the keyboard and send dock.
        let form = app.scrollViews["plan-create-sheet"]
        let upper = form.coordinate(withNormalizedOffset: CGVector(dx: 0.85, dy: 0.18))
        let lower = form.coordinate(withNormalizedOffset: CGVector(dx: 0.85, dy: 0.42))
        (down ? upper : lower).press(forDuration: 0.05, thenDragTo: down ? lower : upper)
    }

    @MainActor private func attach(_ app: XCUIApplication, _ name: String) {
        let attachment = XCTAttachment(screenshot: app.screenshot())
        attachment.name = name; attachment.lifetime = .keepAlways; add(attachment)
    }
}
