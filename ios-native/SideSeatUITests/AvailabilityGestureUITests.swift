import XCTest

/// Run only with a fresh, disposable QA102 poll and account supplied by the runner.
@MainActor final class AvailabilityGestureUITests: XCTestCase {
    private var app: XCUIApplication!
    private var token = ""
    private var pollToken = ""
    private var scrollPollToken = ""

    override func setUp() async throws {
        try await MainActor.run { try prepare() }
    }

    private func prepare() throws {
        continueAfterFailure = false
        let env = ProcessInfo.processInfo.environment
        try XCTSkipUnless(env["SIDESEAT_AVAILABILITY_GESTURE_QA"] == "1", "Requires an isolated availability gesture fixture.")
        token = try XCTUnwrap(env["SIDESEAT_AVAILABILITY_GESTURE_QA_TOKEN"])
        pollToken = try XCTUnwrap(env["SIDESEAT_AVAILABILITY_GESTURE_QA_POLL"])
        scrollPollToken = try XCTUnwrap(env["SIDESEAT_AVAILABILITY_GESTURE_QA_SCROLL_POLL"])
        if let bundle = env["SIDESEAT_AVAILABILITY_GESTURE_QA_BUNDLE"] { app = XCUIApplication(bundleIdentifier: bundle) }
        else { app = XCUIApplication() }
    }

    override func tearDown() async throws { await MainActor.run { app?.terminate() } }

    func testOrdinarySwipesScrollWithoutEditing() {
        pollToken = scrollPollToken
        openEmptyPoll()
        let grid = app.scrollViews["time-poll-grid"].firstMatch
        XCTAssertTrue(app.buttons["time-poll-cell-0"].isHittable)
        grid.coordinate(withNormalizedOffset: CGVector(dx: 0.35, dy: 0.8))
            .press(forDuration: 0.05, thenDragTo: grid.coordinate(withNormalizedOffset: CGVector(dx: 0.35, dy: 0.2)))
        XCTAssertFalse(app.buttons["time-poll-cell-0"].isHittable, "A normal swipe over time cells must scroll the grid")
        XCTAssertTrue(grid.exists)
        assertSaved([])
        capture("vertical-scroll-no-edit")
        grid.coordinate(withNormalizedOffset: CGVector(dx: 0.8, dy: 0.5))
            .press(forDuration: 0.05, thenDragTo: grid.coordinate(withNormalizedOffset: CGVector(dx: 0.2, dy: 0.5)))
        assertSaved([])
        capture("horizontal-scroll-no-edit")
    }

    func testDeliberateRangeTapEraseAndUndoPersist() {
        openEmptyPoll()
        let first = app.buttons["time-poll-cell-0"], last = app.buttons["time-poll-cell-3"]
        first.press(forDuration: 0.6, thenDragTo: last)
        assertSaved([0, 1, 2, 3])
        capture("one-hour-selected")
        last.tap()
        assertSaved([0, 1, 2])
        app.buttons["time-poll-undo"].tap()
        assertSaved([0, 1, 2, 3])
        first.press(forDuration: 0.6, thenDragTo: last)
        assertSaved([])
        app.buttons["time-poll-undo"].tap()
        assertSaved([0, 1, 2, 3])
        app.terminate()
        launch()
        openPlan()
        for id in 0...3 { XCTAssertTrue(app.buttons["time-poll-cell-\(id)"].isSelected) }
        capture("reopened-saved-selection")
    }

    private func openEmptyPoll() {
        launch()
        openPlan()
        XCTAssertEqual(app.staticTexts["time-poll-detail-title"].label, "QA102 Gesture regression")
        for id in 0...3 { XCTAssertFalse(app.buttons["time-poll-cell-\(id)"].isSelected, "Supply a fresh empty QA poll") }
    }

    private func launch() {
        app.launchArguments = ["--ui-testing-authenticated", "--ui-testing-ephemeral-credentials",
            "--ui-testing-skip-tutorial", "--ui-testing-time-poll-live", "--ui-testing-language=en"]
        app.launchEnvironment["SIDESEAT_QA_ACCESS_TOKEN"] = token
        app.launch()
        XCTAssertTrue(app.tabBars.firstMatch.waitForExistence(timeout: 20))
    }

    private func openPlan() {
        app.tabBars.buttons["Plans"].tap()
        let card = app.buttons["plans-coordinated-\(pollToken)"]
        XCTAssertTrue(card.waitForExistence(timeout: 20)); card.tap()
        XCTAssertTrue(app.buttons["time-poll-cell-0"].waitForExistence(timeout: 20))
    }

    private func assertSaved(_ slots: [Int]) {
        XCTAssertTrue(app.descendants(matching: .any)["time-poll-saved"].waitForExistence(timeout: 15))
        for id in 0...3 where app.buttons["time-poll-cell-\(id)"].isHittable {
            XCTAssertEqual(app.buttons["time-poll-cell-\(id)"].isSelected, slots.contains(id))
        }
    }

    private func capture(_ name: String) {
        let attachment = XCTAttachment(screenshot: app.screenshot())
        attachment.name = "availability-" + name; attachment.lifetime = .keepAlways; add(attachment)
    }
}
