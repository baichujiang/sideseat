import XCTest

@MainActor final class PlanCreationPresentationUITests: XCTestCase {
    private var app: XCUIApplication!

    override func setUpWithError() throws {
        continueAfterFailure = false
        if let bundle = ProcessInfo.processInfo.environment["SIDESEAT_PLAN_PRESENTATION_QA_BUNDLE"] {
            app = XCUIApplication(bundleIdentifier: bundle)
        } else {
            app = XCUIApplication()
        }
        app.launchArguments = ["--ui-testing-authenticated", "--ui-testing-ephemeral-credentials",
            "--ui-testing-skip-tutorial", "--ui-testing-language=zh-Hans", "--ui-testing-local-api"]
        // Presentation needs no server or changes to the owner's account.
        app.launchEnvironment["SIDESEAT_API_BASE_URL_OVERRIDE"] = "http://127.0.0.1:9"
        app.launch()
        XCTAssertTrue(app.tabBars.firstMatch.waitForExistence(timeout: 20))
    }

    override func tearDownWithError() throws { app?.terminate() }

    func testPlansCreateCancelReturnsToPlansInOneStep() {
        app.tabBars.buttons["计划"].tap()
        for attempt in 1...3 {
            openCreation()
            capture("creation-\(attempt)")
            cancel().tap()
            assertHittable(app.buttons["plans-create-unified"], "One Cancel must return directly to Plans")
            XCTAssertFalse(app.buttons["time-poll-create"].exists, "No intermediate plan-list sheet should remain")
        }
        capture("returned-to-plans")
    }

    func testTimingModesAndSwipeDismissReturnToPlans() {
        app.tabBars.buttons["计划"].tap()
        openCreation()
        app.buttons["一起吃饭"].tap()
        app.buttons["plan-mode-fixed"].tap()
        app.buttons["plan-create-next"].tap()
        let fixed = app.datePickers["unified-plan-fixed-start"]
        for _ in 0..<3 where !fixed.exists { app.swipeUp() }
        XCTAssertTrue(fixed.waitForExistence(timeout: 5))
        for _ in 0..<4 where !app.buttons["plan-change-method"].isHittable { app.swipeDown() }
        app.buttons["plan-change-method"].tap()
        app.buttons["plan-mode-collect"].tap()
        app.buttons["plan-create-next"].tap()
        let dates = app.descendants(matching: .any)["time-poll-dates"].firstMatch
        for _ in 0..<3 where !dates.exists { app.swipeUp() }
        XCTAssertTrue(dates.waitForExistence(timeout: 5))
        let bar = app.navigationBars.firstMatch
        bar.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.1))
            .press(forDuration: 0.1, thenDragTo: app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.9)))
        assertHittable(app.buttons["plans-create-unified"], "One swipe must dismiss the creation sheet")
        openCreation()
        cancel().tap()
        assertHittable(app.buttons["plans-create-unified"], "Creation should reopen and close normally after a swipe")
    }

    func testFirstStepHasOneNextActionAndKeepsActivityWhenGoingBack() {
        app.tabBars.buttons["计划"].tap()
        XCTAssertTrue(app.buttons["plans-create-primary"].waitForExistence(timeout: 10))
        XCTAssertTrue(app.buttons["plans-create-primary"].isHittable)
        capture("clear-start")
        app.buttons["plans-create-primary"].tap()
        let next = app.buttons["plan-create-next"]
        XCTAssertTrue(next.waitForExistence(timeout: 10)); XCTAssertFalse(next.isEnabled)
        XCTAssertFalse(app.buttons["time-poll-create-confirm"].exists)
        app.buttons["一起学习"].tap()
        XCTAssertTrue(next.isEnabled); capture("activity-first"); next.tap()
        XCTAssertTrue(app.buttons["time-poll-create-confirm"].waitForExistence(timeout: 10))
        capture("dates-second")
        app.buttons["plan-change-method"].tap()
        XCTAssertEqual(app.textFields["time-poll-title"].value as? String, "一起学习")
        XCTAssertTrue(next.isHittable)
        cancel().tap()
        assertHittable(app.buttons["plans-create-primary"], "Cancel returns to the clear starting point")
    }

    func testChineseDarkLargeTextCanAdvanceAndReturn() {
        app.terminate()
        app.launchArguments.append(contentsOf: ["--ui-testing-appearance=dark", "--ui-testing-dynamic-type-accessibility"])
        app.launch()
        app.tabBars.buttons["计划"].tap()
        openCreation()
        let title = app.textFields["time-poll-title"]
        for _ in 0..<4 where !title.isHittable { app.swipeDown() }
        title.tap(); title.typeText("Accessible activity\n")
        let next = app.buttons["plan-create-next"]
        XCTAssertTrue(next.isHittable); XCTAssertTrue(next.isEnabled)
        XCTAssertLessThanOrEqual(next.frame.maxX, app.frame.maxX + 1)
        capture("dark-large-activity"); next.tap()
        let create = app.buttons["time-poll-create-confirm"]
        XCTAssertTrue(create.waitForExistence(timeout: 10)); XCTAssertTrue(create.isHittable)
        XCTAssertLessThanOrEqual(create.frame.maxX, app.frame.maxX + 1)
        let dates = app.descendants(matching: .any)["time-poll-dates"].firstMatch
        for _ in 0..<5 where !dates.isHittable { app.swipeUp() }
        XCTAssertTrue(dates.isHittable, "Date selection must remain reachable at maximum text size")
        capture("dark-large-dates")
        cancel().tap()
        assertHittable(app.buttons["plans-create-unified"], "Large text creation returns directly to Plans")
    }

    func testMessagesEntryUsesFirstLevelPlans() {
        app.tabBars.buttons["消息"].tap()
        let entry = app.buttons["inbox-time-poll"]
        XCTAssertTrue(entry.waitForExistence(timeout: 10)); entry.tap()
        assertHittable(app.buttons["plans-create-unified"], "Messages must hand off to first-level Plans")
        XCTAssertTrue(app.tabBars.buttons["计划"].isSelected)
        XCTAssertFalse(app.buttons["time-poll-create"].exists)
        openCreation(); cancel().tap()
        assertHittable(app.buttons["plans-create-unified"], "Creation Cancel returns directly to Plans")
    }

    private func openCreation() {
        let create = app.buttons["plans-create-unified"]
        assertHittable(create, "Plans creation entry must be available")
        create.tap()
        XCTAssertTrue(app.buttons["plan-mode-collect"].waitForExistence(timeout: 10))
    }

    private func cancel() -> XCUIElement {
        app.navigationBars.buttons.matching(NSPredicate(format: "label IN %@", ["取消", "Cancel"])).firstMatch
    }

    private func assertHittable(_ element: XCUIElement, _ message: String) {
        XCTAssertTrue(XCTWaiter.wait(for: [XCTNSPredicateExpectation(predicate: NSPredicate(format: "hittable == true"), object: element)], timeout: 8) == .completed, message)
    }

    private func capture(_ name: String) {
        let attachment = XCTAttachment(screenshot: app.screenshot())
        attachment.name = "plan-presentation-" + name
        attachment.lifetime = .keepAlways
        add(attachment)
    }
}
