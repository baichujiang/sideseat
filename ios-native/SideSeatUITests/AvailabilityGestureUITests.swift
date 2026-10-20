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

    func testPlansCompletionAndBackReturnToFirstLevel() throws {
        pollToken = try XCTUnwrap(ProcessInfo.processInfo.environment["SIDESEAT_PLANS_NAVIGATION_QA_POLL"])
        launch(language: "zh-Hans")
        app.tabBars.buttons["计划"].tap()
        for complete in [true, false] {
            let card = app.buttons["plans-coordinated-\(pollToken)"]
            revealPlan(card)
            card.tap()
            XCTAssertTrue(app.buttons["time-poll-finish"].waitForExistence(timeout: 15))
            if complete {
                app.buttons["time-poll-finish"].tap()
                XCTAssertTrue(app.staticTexts["time-poll-completed"].waitForExistence(timeout: 10))
            }
            app.navigationBars.buttons.element(boundBy: 0).tap()
            capture(complete ? "plans-after-complete-back" : "plans-after-ordinary-back")
            let root = app.buttons["plans-create-unified"]
            XCTAssertTrue(XCTWaiter.wait(for: [XCTNSPredicateExpectation(predicate: NSPredicate(format: "hittable == true"), object: root)], timeout: 8) == .completed, "Back must return to the first-level Plans page")
            XCTAssertFalse(app.buttons["time-poll-create"].exists, "The secondary poll-list sheet must not appear")
        }
    }

    func testPlansDashboardLinkAndMessageEntry() throws {
        let env = ProcessInfo.processInfo.environment
        pollToken = try XCTUnwrap(env["SIDESEAT_PLANS_NAVIGATION_QA_POLL"])
        let confirmed = try XCTUnwrap(env["SIDESEAT_PLANS_CONFIRMED_QA_POLL"])
        let cancelled = try XCTUnwrap(env["SIDESEAT_PLANS_CANCELLED_QA_POLL"])
        launch(language: "zh-Hans"); app.tabBars.buttons["计划"].tap()
        XCTAssertTrue(app.buttons["plans-create-primary"].waitForExistence(timeout: 15))
        XCTAssertTrue(app.buttons["plans-open-link"].isHittable)
        let inviting = try XCTUnwrap(env["SIDESEAT_PLANS_INVITING_QA_POLL"])
        XCTAssertTrue(app.buttons["plans-coordinated-" + inviting].waitForExistence(timeout: 15))
        capture("plans-dashboard")
        app.buttons["plans-open-link"].tap()
        let alert = app.alerts.firstMatch
        XCTAssertTrue(alert.waitForExistence(timeout: 5))
        alert.textFields.firstMatch.tap(); alert.textFields.firstMatch.typeText("https://www.sideseat.de/time-polls/" + pollToken)
        alert.buttons["打开"].tap()
        XCTAssertTrue(app.buttons["time-poll-finish"].waitForExistence(timeout: 15))
        app.navigationBars.buttons.element(boundBy: 0).tap()
        XCTAssertTrue(app.buttons["plans-create-unified"].isHittable)
        let picker = app.descendants(matching: .any)["plans-segmented-control"].firstMatch
        picker.buttons.element(boundBy: 1).tap()
        XCTAssertTrue(app.buttons["plans-coordinated-" + confirmed].waitForExistence(timeout: 10))
        capture("plans-upcoming")
        picker.buttons.element(boundBy: 2).tap()
        XCTAssertTrue(app.buttons["plans-coordinated-" + cancelled].waitForExistence(timeout: 10))
        capture("plans-ended")
        picker.buttons.element(boundBy: 0).tap()
        app.tabBars.buttons["消息"].tap()
        let entry = app.buttons["inbox-time-poll"]
        XCTAssertTrue(entry.waitForExistence(timeout: 10)); entry.tap()
        XCTAssertTrue(app.tabBars.buttons["计划"].isSelected)
        XCTAssertTrue(app.buttons["plans-create-unified"].isHittable)
        XCTAssertFalse(app.buttons["time-poll-create"].exists)
    }

    func testCreatePlanDetailBackHasNoIntermediateList() {
        launch(language: "zh-Hans"); app.tabBars.buttons["计划"].tap()
        app.buttons["plans-create-unified"].tap()
        let field = app.textFields["time-poll-title"]
        XCTAssertTrue(field.waitForExistence(timeout: 10)); field.tap(); field.typeText("QA110 新计划返回\n")
        app.buttons["time-poll-create-confirm"].tap()
        XCTAssertTrue(app.buttons["time-poll-cell-0"].waitForExistence(timeout: 20))
        app.buttons["time-poll-cell-0"].tap()
        XCTAssertTrue(app.staticTexts["time-poll-saved"].waitForExistence(timeout: 15))
        app.buttons["time-poll-finish"].tap()
        XCTAssertTrue(app.staticTexts["time-poll-completed"].waitForExistence(timeout: 10))
        app.navigationBars.buttons.element(boundBy: 0).tap()
        XCTAssertTrue(app.buttons["plans-create-unified"].isHittable)
        XCTAssertFalse(app.buttons["time-poll-create"].exists)
        capture("plans-created-return")
    }

    func testSharedPlanDeepLinkBackAndDarkDashboard() throws {
        pollToken = try XCTUnwrap(ProcessInfo.processInfo.environment["SIDESEAT_PLANS_NAVIGATION_QA_POLL"])
        launch(language: "zh-Hans", appearance: "dark", deepLink: "/time-polls/" + pollToken)
        XCTAssertTrue(app.buttons["time-poll-cell-0"].waitForExistence(timeout: 20))
        app.navigationBars.buttons.element(boundBy: 0).tap()
        XCTAssertTrue(app.tabBars.buttons["计划"].isSelected)
        XCTAssertTrue(app.buttons["plans-create-unified"].isHittable)
        XCTAssertFalse(app.buttons["time-poll-create"].exists)
        let inviting = try XCTUnwrap(ProcessInfo.processInfo.environment["SIDESEAT_PLANS_INVITING_QA_POLL"])
        XCTAssertTrue(app.buttons["plans-coordinated-" + inviting].waitForExistence(timeout: 15))
        capture("plans-dashboard-dark")
    }

    func testClearAvailabilityFeedbackAndCompletion() throws {
        pollToken = try XCTUnwrap(ProcessInfo.processInfo.environment["SIDESEAT_AVAILABILITY_FEEDBACK_QA_POLL"])
        launch(language: "zh-Hans"); openPlan(tab: "计划")
        XCTAssertTrue(app.staticTexts["time-poll-date-range"].exists)
        let finish = app.buttons["time-poll-finish"]
        XCTAssertTrue(finish.isHittable)
        XCTAssertFalse(finish.isEnabled)
        XCTAssertTrue(app.staticTexts["time-poll-save-state"].label.contains("选择你有空的时间"))
        capture("feedback-before-selection")
        app.buttons["time-poll-cell-0"].tap()
        assertSaved([0, 1])
        XCTAssertEqual(app.staticTexts["time-poll-saved"].label, "已自动保存")
        XCTAssertTrue(finish.isEnabled)
        capture("feedback-saved")
        finish.tap()
        XCTAssertTrue(app.staticTexts["time-poll-completed"].waitForExistence(timeout: 10))
        XCTAssertEqual(app.staticTexts["time-poll-result-heading"].label, "大家的时间表")
        XCTAssertFalse(finish.exists)
        app.buttons["我的时间"].tap()
        XCTAssertTrue(app.buttons["time-poll-cell-0"].isSelected)
        app.terminate(); launch(language: "zh-Hans", appearance: "dark"); openPlan(tab: "计划")
        XCTAssertTrue(app.buttons["time-poll-cell-0"].isSelected)
        XCTAssertEqual(app.staticTexts["time-poll-saved"].label, "已自动保存")
        capture("feedback-reopened-dark")
    }

    func testTimetableResultsAndManualHalfDayInvitation() throws {
        let raw = try XCTUnwrap(ProcessInfo.processInfo.environment["SIDESEAT_TIMETABLE_HALF_DAY_POLL"])
        pollToken = raw
        launch(language: "zh-Hans"); openPlan(tab: "计划")
        app.buttons["大家的结果"].tap()
        XCTAssertEqual(app.staticTexts["time-poll-result-heading"].label, "大家的时间表")
        XCTAssertFalse(app.staticTexts["人数最多的时间"].exists)
        XCTAssertFalse(app.staticTexts["所有人都方便的时间"].exists)
        XCTAssertTrue(app.descendants(matching: .any)["time-poll-cell-0"].label.hasSuffix(", 2"))
        capture("timetable-results")
        app.buttons["unified-plan-invite-window"].tap()
        XCTAssertTrue(app.buttons["unified-plan-invite-from"].waitForExistence(timeout: 10))
        XCTAssertTrue(app.buttons["unified-plan-invite-until"].label.contains("21:00"))
        app.buttons["unified-plan-invite-until"].tap()
        app.buttons["13:00"].tap()
        XCTAssertTrue(app.buttons["unified-plan-invite-until"].label.contains("13:00"))
        capture("manual-half-day")
        sendManualInvitation()
    }

    func testManualFullDayInvitationInDarkMode() throws {
        pollToken = try XCTUnwrap(ProcessInfo.processInfo.environment["SIDESEAT_TIMETABLE_FULL_DAY_POLL"])
        launch(language: "zh-Hans", appearance: "dark"); openPlan(tab: "计划")
        app.buttons["大家的结果"].tap()
        XCTAssertEqual(app.staticTexts["time-poll-result-heading"].label, "大家的时间表")
        app.buttons["unified-plan-invite-window"].tap()
        XCTAssertTrue(app.staticTexts["unified-plan-chosen-range"].waitForExistence(timeout: 10))
        XCTAssertTrue(app.buttons["unified-plan-invite-date"].label.contains("日期"))
        XCTAssertTrue(app.buttons["unified-plan-invite-from"].label.contains("09:00"))
        XCTAssertTrue(app.buttons["unified-plan-invite-until"].label.contains("21:00"))
        capture("manual-full-day-dark")
        sendManualInvitation()
    }

    func testCollectCreationDoesNotRequireActivityDuration() {
        launch(language: "zh-Hans")
        app.tabBars.buttons["计划"].tap(); app.buttons["plans-create-unified"].tap()
        let title = app.textFields["time-poll-title"]
        XCTAssertTrue(title.waitForExistence(timeout: 10))
        XCTAssertFalse(app.descendants(matching: .any)["unified-plan-duration"].exists)
        title.tap(); title.typeText("QA108 Timetable creation\n")
        capture("collect-without-duration")
        app.buttons["time-poll-create-confirm"].tap()
        XCTAssertTrue(app.staticTexts["time-poll-detail-title"].waitForExistence(timeout: 20))
        XCTAssertEqual(app.staticTexts["time-poll-detail-title"].label, "QA108 Timetable creation")
    }

    private func sendManualInvitation() {
        let send = app.buttons["unified-plan-send-invitations"]
        for _ in 0..<4 where !send.isHittable { app.swipeUp() }
        XCTAssertTrue(send.isHittable); send.tap()
        XCTAssertTrue(app.staticTexts["unified-plan-confirmation-count"].waitForExistence(timeout: 20))
        capture("manual-invitation-sent")
    }

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
        XCTAssertEqual(app.staticTexts["time-poll-saved"].label, "已自动保存")
        capture("day-reopened-chinese")
        app.terminate()
        launch(language: "zh-Hans", appearance: "dark"); openPlan(tab: "计划")
        XCTAssertTrue(day.isSelected); XCTAssertTrue(other.isSelected)
        XCTAssertEqual(day.value as? String, "已选中当天全部时段")
        XCTAssertEqual(app.staticTexts["time-poll-saved"].label, "已自动保存")
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

    private func revealPlan(_ card: XCUIElement) {
        for _ in 0..<5 {
            if card.waitForExistence(timeout: 2) && card.isHittable { return }
            app.scrollViews["plans-scroll-waitingResponse"].firstMatch.swipeUp(velocity: .slow)
        }
        XCTAssertTrue(card.isHittable, "The plan must be reachable in the first-level list")
    }

    private func openEmptyPoll() {
        launch()
        openPlan()
        XCTAssertEqual(app.staticTexts["time-poll-detail-title"].label, "QA102 Gesture regression")
        for id in [0, 2] { XCTAssertFalse(app.buttons["time-poll-cell-\(id)"].isSelected, "Supply a fresh empty QA poll") }
    }

    private func launch(language: String = "en", appearance: String = "light", deepLink: String? = nil) {
        app.launchArguments = ["--ui-testing-authenticated", "--ui-testing-ephemeral-credentials",
            "--ui-testing-skip-tutorial", "--ui-testing-time-poll-live", "--ui-testing-language=\(language)",
            "--ui-testing-appearance=\(appearance)"]
        if let deepLink { app.launchArguments.append("--ui-testing-deep-link=" + deepLink) }
        app.launchEnvironment["SIDESEAT_QA_ACCESS_TOKEN"] = token
        if let localAPI = ProcessInfo.processInfo.environment["SIDESEAT_AVAILABILITY_GESTURE_QA_API"] {
            app.launchArguments.append("--ui-testing-local-api")
            app.launchEnvironment["SIDESEAT_API_BASE_URL_OVERRIDE"] = localAPI
        }
        app.launch()
        if deepLink == nil { XCTAssertTrue(app.tabBars.firstMatch.waitForExistence(timeout: 20)) }
        else { XCTAssertTrue(app.buttons["time-poll-cell-0"].waitForExistence(timeout: 20)) }
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
