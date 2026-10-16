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
        let methods = app.segmentedControls["unified-plan-timing-method"]
        methods.buttons["直接选时间"].tap()
        XCTAssertTrue(app.datePickers["unified-plan-fixed-start"].waitForExistence(timeout: 5))
        methods.buttons["一起定时间"].tap()
        XCTAssertTrue(app.descendants(matching: .any)["time-poll-dates"].firstMatch.waitForExistence(timeout: 5))
        let bar = app.navigationBars.firstMatch
        bar.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.1))
            .press(forDuration: 0.1, thenDragTo: app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.9)))
        assertHittable(app.buttons["plans-create-unified"], "One swipe must dismiss the creation sheet")
        openCreation()
        cancel().tap()
        assertHittable(app.buttons["plans-create-unified"], "Creation should reopen and close normally after a swipe")
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
        XCTAssertTrue(app.textFields["time-poll-title"].waitForExistence(timeout: 10))
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
