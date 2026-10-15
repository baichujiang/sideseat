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
        let first = app.buttons["time-poll-cell-0"], last = app.buttons["time-poll-cell-2"]
        XCTAssertFalse(app.buttons["time-poll-cell-1"].exists)
        XCTAssertTrue(app.staticTexts["09:30"].exists)
        XCTAssertFalse(app.staticTexts["09:15"].exists)
        first.press(forDuration: 0.6, thenDragTo: last)
        assertSaved([0, 1, 2, 3])
        capture("one-hour-selected")
        last.tap()
        assertSaved([0, 1])
        app.buttons["time-poll-undo"].tap()
        assertSaved([0, 1, 2, 3])
        first.press(forDuration: 0.6, thenDragTo: last)
        assertSaved([])
        app.buttons["time-poll-undo"].tap()
        assertSaved([0, 1, 2, 3])
        app.terminate()
        launch()
        openPlan()
        for id in [0, 2] { XCTAssertTrue(app.buttons["time-poll-cell-\(id)"].isSelected) }
        capture("reopened-saved-selection")
    }

    func testDayHeaderSelectsClearsUndoesAndPersists() throws {
        struct Fixture: Decodable { let token: String; let firstDate: String; let secondSlotId: Int }
        let raw = ProcessInfo.processInfo.environment["SIDESEAT_AVAILABILITY_DAY_QA_FIXTURE_JSON"]
        try XCTSkipIf(raw == nil, "Requires a fresh day-selection poll.")
        let fixture = try JSONDecoder().decode(Fixture.self, from: Data(try XCTUnwrap(raw).utf8))
        pollToken = fixture.token
        openEmptyPoll()
        let day = app.buttons["time-poll-day-" + fixture.firstDate]
        let other = app.buttons["time-poll-cell-\(fixture.secondSlotId)"]
        XCTAssertTrue(day.waitForExistence(timeout: 10))
        other.tap(); assertSaved([])
        day.tap(); assertSaved([0, 1, 2, 3])
        XCTAssertTrue(day.isSelected); XCTAssertTrue(other.isSelected)
        capture("day-selected")
        app.buttons["time-poll-cell-0"].tap(); assertSaved([2, 3])
        XCTAssertFalse(day.isSelected)
        XCTAssertEqual(day.value as? String, "Some times selected")
        day.tap(); assertSaved([0, 1, 2, 3]); XCTAssertTrue(day.isSelected)
        day.tap(); assertSaved([])
        XCTAssertFalse(day.isSelected); XCTAssertTrue(other.isSelected)
        app.buttons["time-poll-undo"].tap(); assertSaved([0, 1, 2, 3])
        XCTAssertTrue(day.isSelected); XCTAssertTrue(other.isSelected)
        app.buttons["Group results"].tap()
        XCTAssertFalse(day.exists, "Results must not offer availability edits")
        app.buttons["My availability"].tap()
        XCTAssertTrue(day.isSelected)
        app.terminate()
        launch(language: "zh-Hans"); openPlan(tab: "计划")
        XCTAssertTrue(day.isSelected); XCTAssertTrue(other.isSelected)
        XCTAssertEqual(day.value as? String, "已选中当天全部时段")
        XCTAssertTrue(app.descendants(matching: .any)["time-poll-saved"].label.contains("已保存"))
        capture("day-reopened-chinese")
        app.terminate()
        launch(language: "zh-Hans", appearance: "dark"); openPlan(tab: "计划")
        XCTAssertTrue(day.isSelected); XCTAssertTrue(other.isSelected)
        XCTAssertEqual(day.value as? String, "已选中当天全部时段")
        XCTAssertTrue(app.descendants(matching: .any)["time-poll-saved"].label.contains("已保存"))
        capture("day-dark-chinese")
    }

    func testLegacyPartialHalfHourFillsAndUndoesWithoutRounding() throws {
        let raw = ProcessInfo.processInfo.environment["SIDESEAT_AVAILABILITY_HALF_HOUR_QA_POLL"]
        pollToken = try XCTUnwrap(raw)
        launch(); openPlan()
        let first = app.buttons["time-poll-cell-0"]
        XCTAssertTrue(first.label.contains("09:00–09:30"))
        XCTAssertTrue(first.label.contains("Some times selected"))
        XCTAssertFalse(first.isSelected)
        XCTAssertFalse(app.buttons["time-poll-cell-1"].exists)
        capture("legacy-partial-half-hour")
        first.tap(); assertSaved([0, 1])
        app.buttons["time-poll-undo"].tap(); assertSaved([0])
        XCTAssertTrue(first.label.contains("Some times selected"))
        app.terminate(); launch(); openPlan()
        XCTAssertTrue(first.label.contains("Some times selected"))
        XCTAssertFalse(first.isSelected)
        capture("legacy-partial-reopened")
    }

    private func openEmptyPoll() {
        launch()
        openPlan()
        XCTAssertEqual(app.staticTexts["time-poll-detail-title"].label, "QA102 Gesture regression")
        for id in [0, 2] { XCTAssertFalse(app.buttons["time-poll-cell-\(id)"].isSelected, "Supply a fresh empty QA poll") }
    }

    private func launch(language: String = "en", appearance: String = "light") {
        app.launchArguments = ["--ui-testing-authenticated", "--ui-testing-ephemeral-credentials",
            "--ui-testing-skip-tutorial", "--ui-testing-time-poll-live", "--ui-testing-language=\(language)",
            "--ui-testing-appearance=\(appearance)"]
        app.launchEnvironment["SIDESEAT_QA_ACCESS_TOKEN"] = token
        app.launch()
        XCTAssertTrue(app.tabBars.firstMatch.waitForExistence(timeout: 20))
    }

    private func openPlan(tab: String = "Plans") {
        app.tabBars.buttons[tab].tap()
        let card = app.buttons["plans-coordinated-\(pollToken)"]
        XCTAssertTrue(card.waitForExistence(timeout: 20)); card.tap()
        XCTAssertTrue(app.buttons["time-poll-cell-0"].waitForExistence(timeout: 20))
    }

    private func assertSaved(_ slots: [Int]) {
        XCTAssertTrue(app.descendants(matching: .any)["time-poll-saved"].waitForExistence(timeout: 15))
        for id in [0, 2] where app.buttons["time-poll-cell-\(id)"].isHittable {
            XCTAssertEqual(app.buttons["time-poll-cell-\(id)"].isSelected, slots.contains(id) && slots.contains(id + 1))
        }
    }

    private func capture(_ name: String) {
        let attachment = XCTAttachment(screenshot: app.screenshot())
        attachment.name = "availability-" + name; attachment.lifetime = .keepAlways; add(attachment)
    }
}
