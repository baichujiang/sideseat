import XCTest

@MainActor final class PlanStatePresentationUITests: XCTestCase {
    private var app: XCUIApplication!

    private func launch(accessibility: Bool = false, layout: Bool = false, reference: Bool = false, loading: Bool = false, longList: Bool = false) {
        if let bundle = ProcessInfo.processInfo.environment["SIDESEAT_PLAN_PRESENTATION_QA_BUNDLE"] {
            app = XCUIApplication(bundleIdentifier: bundle)
        } else { app = XCUIApplication() }
        app.launchArguments = ["--ui-testing-authenticated", "--ui-testing-ephemeral-credentials",
            "--ui-testing-skip-tutorial", "--ui-testing-chats", "--ui-testing-language=zh-Hans", "--ui-testing-local-api"]
        if accessibility { app.launchArguments += ["--ui-testing-appearance=dark", "--ui-testing-dynamic-type-accessibility"] }
        if layout { app.launchArguments += ["--ui-testing-plans-mixed-waiting", "--ui-testing-plans-waiting-rail"] }
        if reference { app.launchArguments += ["--ui-testing-mutual-opportunity"] }
        if loading { app.launchArguments += ["--ui-testing-plans-loading"] }
        if longList { app.launchArguments += ["--ui-testing-plans-long-list"] }
        app.launchEnvironment["SIDESEAT_API_BASE_URL_OVERRIDE"] = "http://127.0.0.1:9"
        app.launch()
        XCTAssertTrue(app.tabBars.firstMatch.waitForExistence(timeout: 20))
        app.tabBars.buttons["计划"].tap()
    }

    override func tearDown() { app?.terminate() }

    func testRealSharedHistoryReturnsToTheHistoryList() throws {
        struct Account: Decodable { let role: String; let accessToken: String }
        struct Fixture: Decodable { let title: String; let bundle: String; let pollToken: String; let accounts: [Account] }
        let raw = ProcessInfo.processInfo.environment["SIDESEAT_NATIVE_PARTICIPANT_JSON"]
        try XCTSkipIf(raw == nil, "Requires the cancelled disposable plan from the native flow.")
        let fixture = try JSONDecoder().decode(Fixture.self, from: Data(raw!.utf8))
        let owner = try XCTUnwrap(fixture.accounts.first { $0.role == "owner" })
        continueAfterFailure = false
        app = XCUIApplication(bundleIdentifier: fixture.bundle)
        app.launchArguments = ["--ui-testing-authenticated", "--ui-testing-ephemeral-credentials", "--ui-testing-skip-tutorial",
            "--ui-testing-time-poll-live", "--ui-testing-language=zh-Hans", "--ui-testing-appearance=light"]
        app.launchEnvironment = ["SIDESEAT_QA_ACCESS_TOKEN": owner.accessToken]
        app.launch(); XCTAssertTrue(app.tabBars.firstMatch.waitForExistence(timeout: 20))
        app.tabBars.buttons["计划"].tap()
        XCTAssertTrue(app.buttons["plans-history"].waitForExistence(timeout: 10)); app.buttons["plans-history"].tap()
        let history = app.descendants(matching: .any)["plans-history-root"].firstMatch
        XCTAssertTrue(history.waitForExistence(timeout: 10))
        let row = app.buttons["plans-coordinated-\(fixture.pollToken)"]
        XCTAssertTrue(row.waitForExistence(timeout: 20)); capture("real-shared-history")
        row.tap()
        XCTAssertTrue(app.staticTexts["time-poll-detail-title"].waitForExistence(timeout: 15))
        XCTAssertEqual(app.staticTexts["time-poll-detail-title"].label, fixture.title)
        XCTAssertTrue(app.navigationBars.firstMatch.exists)
        app.navigationBars.buttons.firstMatch.tap()
        XCTAssertTrue(history.waitForExistence(timeout: 10)); XCTAssertTrue(row.exists)
        capture("real-shared-history-return")
        app.navigationBars.buttons.firstMatch.tap()
        XCTAssertTrue(app.descendants(matching: .any)["plans-segmented-control"].firstMatch.waitForExistence(timeout: 10))
        XCTAssertEqual(app.descendants(matching: .any)["plans-segmented-control"].firstMatch.buttons.count, 2)
        XCTAssertTrue(app.navigationBars["计划"].exists)
    }

    func testTwoTabsKeepTheRootHeadingFixedAndHistoryReachable() {
        continueAfterFailure = false
        launch(layout: true, longList: true)
        let picker = app.descendants(matching: .any)["plans-segmented-control"].firstMatch
        XCTAssertTrue(picker.waitForExistence(timeout: 10))
        XCTAssertEqual(picker.buttons.count, 2)
        XCTAssertEqual(picker.buttons.element(boundBy: 0).label, "筹划中")
        XCTAssertEqual(picker.buttons.element(boundBy: 1).label, "已确定")
        XCTAssertTrue(app.navigationBars["计划"].exists)
        XCTAssertFalse(app.buttons["plans-tab-ended"].exists)
        XCTAssertFalse(app.descendants(matching: .any)["plans-next-meetup"].exists)
        XCTAssertTrue(app.buttons["plans-create-unified"].isHittable)
        XCTAssertFalse(app.buttons["plans-open-link"].exists)
        let heading = app.descendants(matching: .any)["root-navigation-title"].firstMatch
        XCTAssertTrue(heading.isHittable)
        XCTAssertTrue(heading.label.contains("计划"))
        let headingY = heading.frame.minY
        let pickerY = picker.frame.minY
        app.scrollViews["plans-scroll-waitingResponse"].swipeUp(velocity: .slow)
        XCTAssertFalse(app.buttons["plans-create-unified"].isHittable,
                       "The long list must actually scroll before checking the fixed heading")
        XCTAssertEqual(heading.frame.minY, headingY, accuracy: 2)
        XCTAssertEqual(picker.frame.minY, pickerY, accuracy: 2)
        XCTAssertTrue(app.buttons["plans-history"].isHittable)
        capture("two-tabs-fixed-heading")
        picker.buttons.element(boundBy: 1).tap()
        app.buttons["plans-history"].tap()
        let history = app.descendants(matching: .any)["plans-history-root"].firstMatch
        XCTAssertTrue(history.waitForExistence(timeout: 10))
        XCTAssertTrue(app.navigationBars["历史计划"].exists)
        let completed = app.buttons["plans-row-ui-plan-completed"]
        XCTAssertTrue(completed.waitForExistence(timeout: 10))
        capture("history-secondary-entry")
        completed.tap()
        XCTAssertTrue(app.descendants(matching: .any)["direct-chat"].waitForExistence(timeout: 10))
        XCTAssertTrue(app.navigationBars.firstMatch.exists)
        app.navigationBars.buttons.firstMatch.tap()
        XCTAssertTrue(history.waitForExistence(timeout: 10))
        app.navigationBars.buttons.firstMatch.tap()
        XCTAssertTrue(picker.waitForExistence(timeout: 10))
        XCTAssertTrue(picker.buttons.element(boundBy: 1).isSelected)
        XCTAssertTrue(app.navigationBars["计划"].exists)
        app.scrollViews["plans-scroll-upcoming"].swipeLeft()
        XCTAssertTrue(picker.buttons.element(boundBy: 1).isSelected)
        capture("confirmed-tab-after-history")
    }

    func testInitialLoadingDoesNotShowTheEmptyPlanLayout() {
        continueAfterFailure = false
        launch(loading: true)
        let loading = app.descendants(matching: .any)["plans-loading"].firstMatch
        XCTAssertTrue(loading.waitForExistence(timeout: 2))
        XCTAssertFalse(app.buttons["plans-create-primary"].exists,
                       "Do not display the empty plan layout before the first response")
        XCTAssertTrue(app.buttons["plans-create-unified"].isHittable)
        capture("initial-loading")
        let row = app.buttons["plans-row-ui-plan-1"]
        XCTAssertTrue(row.waitForExistence(timeout: 10))
        XCTAssertFalse(app.buttons["plans-create-primary"].exists)
        XCTAssertFalse(loading.exists)
        capture("initial-loading-to-plans")
    }

    func testTogetherAndPlansCardStyleReference() {
        continueAfterFailure = false
        launch(layout: true, reference: true)
        app.tabBars.buttons["同行"].tap()
        app.buttons["together-tab-recommendations"].tap()
        XCTAssertTrue(app.descendants(matching: .any)["mutual-opportunity-cmutualui0000000000000001"].waitForExistence(timeout: 10))
        let togetherHeading = app.descendants(matching: .any)["root-navigation-title"].firstMatch
        XCTAssertTrue(togetherHeading.isHittable)
        XCTAssertTrue(togetherHeading.label.contains("同行"))
        let headingY = togetherHeading.frame.minY
        let picker = app.descendants(matching: .any)["together-segmented-control"].firstMatch
        let pickerY = picker.frame.minY
        let pickerHeight = picker.frame.height
        capture("together-card-reference")
        app.tabBars.buttons["计划"].tap()
        let planHeading = app.descendants(matching: .any)["root-navigation-title"].firstMatch
        XCTAssertTrue(planHeading.isHittable)
        XCTAssertTrue(planHeading.label.contains("计划"))
        XCTAssertEqual(planHeading.frame.minY, headingY, accuracy: 2)
        let planPicker = app.descendants(matching: .any)["plans-segmented-control"].firstMatch
        XCTAssertEqual(planPicker.frame.minY, pickerY, accuracy: 2)
        XCTAssertEqual(planPicker.frame.height, pickerHeight, accuracy: 2)
        let row = app.buttons["plans-row-ui-plan-1"]
        reveal(row)
        XCTAssertTrue(row.label.contains("Library study"))
        capture("plans-card-style-overview")
    }

    func testRealPlanCardsKeepSectionsAndOpenDetails() throws {
        struct Account: Decodable { let role: String; let accessToken: String }
        struct Card: Decodable { let role: String; let title: String; let token: String }
        struct Fixture: Decodable { let bundle: String; let accounts: [Account]; let cards: [Card] }
        let raw = ProcessInfo.processInfo.environment["SIDESEAT_PLAN_CARD_STYLE_JSON"]
        try XCTSkipIf(raw == nil, "Requires disposable real card states.")
        let f = try JSONDecoder().decode(Fixture.self, from: Data(raw!.utf8))
        let owner = try XCTUnwrap(f.accounts.first { $0.role == "owner" })
        app = XCUIApplication(bundleIdentifier: f.bundle)
        app.launchArguments = ["--ui-testing-authenticated", "--ui-testing-ephemeral-credentials", "--ui-testing-skip-tutorial",
            "--ui-testing-time-poll-live", "--ui-testing-language=zh-Hans", "--ui-testing-appearance=light"]
        app.launchEnvironment = ["SIDESEAT_QA_ACCESS_TOKEN": owner.accessToken]
        app.launch(); XCTAssertTrue(app.tabBars.firstMatch.waitForExistence(timeout: 20)); app.tabBars.buttons["计划"].tap()
        let task = try XCTUnwrap(f.cards.first { $0.role == "task" })
        let row = app.buttons["plans-coordinated-\(task.token)"]
        XCTAssertTrue(row.waitForExistence(timeout: 20)); XCTAssertTrue(row.label.contains(task.title))
        capture("real-cards-needs-you")
        row.tap(); XCTAssertTrue(app.staticTexts["time-poll-detail-title"].waitForExistence(timeout: 15))
        XCTAssertEqual(app.staticTexts["time-poll-detail-title"].label, task.title)
        app.navigationBars.buttons.firstMatch.tap()
        let rail = app.scrollViews["plans-waiting-rail"]
        reveal(rail)
        for _ in 0..<3 where rail.frame.maxY >= app.tabBars.firstMatch.frame.minY - 8 { app.swipeUp(velocity: .slow) }
        rail.swipeLeft(velocity: .slow)
        XCTAssertTrue(app.descendants(matching: .any)["plans-segmented-control"].firstMatch.buttons.element(boundBy: 0).isSelected)
        capture("real-cards-waiting")
        let meetup = try XCTUnwrap(f.cards.first { $0.role == "meetup" })
        let upcoming = app.buttons["plans-coordinated-\(meetup.token)"]
        reveal(upcoming)
        for _ in 0..<3 where upcoming.frame.maxY >= app.tabBars.firstMatch.frame.minY - 8 { app.swipeUp(velocity: .slow) }
        capture("real-cards-next-meetup")
        upcoming.tap(); XCTAssertTrue(app.staticTexts["time-poll-detail-title"].waitForExistence(timeout: 15))
        XCTAssertEqual(app.staticTexts["time-poll-detail-title"].label, meetup.title)
    }

    func testListAndChatUseTheSameStatusAndConfirmationAction() {
        continueAfterFailure = false
        launch()
        let row = app.buttons["plans-row-ui-plan-1"]
        reveal(row)
        XCTAssertEqual(row.value as? String, "待你确认")
        XCTAssertTrue(row.label.contains("查看邀请"))
        XCTAssertFalse(row.label.contains("Europe/Berlin"), "The local technical timezone should not occupy its own card row")
        capture("list-awaiting-confirmation")
        row.tap()
        let accept = app.buttons["plan-card-accept-ui-plan-1"]
        XCTAssertTrue(accept.waitForExistence(timeout: 10))
        XCTAssertEqual(accept.label, "确认参加")
        XCTAssertEqual(app.buttons["plan-card-counter-ui-plan-1"].label, "提议新时间")
        XCTAssertEqual(app.buttons["plan-card-decline-ui-plan-1"].label, "我无法参加")
        capture("chat-explicit-confirmation")
        accept.tap()
        let calendar = app.buttons["plan-card-calendar-ui-plan-1"]
        XCTAssertTrue(calendar.waitForExistence(timeout: 10))
        XCTAssertFalse(app.buttons["plan-card-accept-ui-plan-1"].exists)
        capture("chat-confirmed")
        calendar.tap()
        XCTAssertTrue(app.buttons["calendar-connections"].waitForExistence(timeout: 10))
    }

    func testLargeTextDarkModeKeepsInvitationAndReplyReachable() {
        continueAfterFailure = false
        launch(accessibility: true)
        let row = app.buttons["plans-row-ui-plan-1"]
        reveal(row)
        XCTAssertEqual(row.value as? String, "待你确认")
        capture("large-text-list")
        row.tap()
        let accept = app.buttons["plan-card-accept-ui-plan-1"]
        XCTAssertTrue(accept.waitForExistence(timeout: 10))
        // Chat owns its scrolling; XCTest reveals this existing response action.
        accept.tap()
        XCTAssertTrue(app.buttons["plan-card-calendar-ui-plan-1"].waitForExistence(timeout: 10))
        capture("large-text-confirmed")
    }

    func testWaitingRailScrollsWithoutChangingSectionAndViewAllKeepsEveryPlan() {
        continueAfterFailure = false
        launch(layout: true)
        let firstTask = app.buttons["plans-row-ui-plan-1"]
        let secondTask = app.buttons["plans-row-ui-plan-incoming-extra"]
        reveal(firstTask); reveal(secondTask)
        XCTAssertEqual(firstTask.frame.minX, secondTask.frame.minX, accuracy: 2)
        XCTAssertGreaterThanOrEqual(secondTask.frame.minY - firstTask.frame.maxY, 8,
                                   "Actionable plans need independent boundaries and space")
        XCTAssertEqual(firstTask.value as? String, "待你确认")
        XCTAssertTrue(firstTask.label.contains("查看邀请"))
        XCTAssertLessThanOrEqual(firstTask.frame.height, 148, "Keep the standard task card compact")
        XCTAssertLessThanOrEqual(secondTask.frame.height, 170, "Allow one extra title line without a large card")
        print("PLAN_CARD_METRIC task \(firstTask.frame.height)")
        print("PLAN_CARD_METRIC taskLongTitle \(secondTask.frame.height)")
        capture("horizontal-needs-you")
        let rail = app.scrollViews["plans-waiting-rail"]
        reveal(rail)
        for _ in 0..<3 where rail.frame.maxY > app.tabBars.firstMatch.frame.minY - 8 {
            app.swipeUp(velocity: .slow)
        }
        XCTAssertLessThan(rail.frame.maxY, app.tabBars.firstMatch.frame.minY,
                          "The complete waiting card should be visible for the visual review")
        let last = app.buttons["plans-row-ui-plan-outgoing-3"]
        let first = app.buttons["plans-row-ui-plan-outgoing"]
        XCTAssertGreaterThan(last.frame.minX, first.frame.minX)
        for _ in 0..<4 where !last.isHittable || last.frame.maxX > rail.frame.maxX + 2 {
            rail.swipeLeft(velocity: .slow)
        }
        XCTAssertTrue(last.isHittable)
        XCTAssertLessThanOrEqual(last.frame.maxX, rail.frame.maxX + 2)
        XCTAssertTrue(app.descendants(matching: .any)["plans-segmented-control"].firstMatch.buttons.element(boundBy: 0).isSelected,
                      "Horizontal plan browsing must not switch the main section")
        XCTAssertLessThanOrEqual(last.frame.height, 140, "Waiting cards should remain compact summaries")
        print("PLAN_CARD_METRIC waiting \(last.frame.height)")
        XCTAssertTrue(last.label.contains("等 Mina 确认"))
        capture("horizontal-waiting-last")
        app.swipeUp(velocity: .slow)
        capture("compact-overview")
        let toggle = app.buttons["plans-toggle-outgoing"]
        reveal(toggle); toggle.tap()
        XCTAssertFalse(rail.exists)
        reveal(last)
        XCTAssertEqual(last.frame.minX, first.frame.minX, accuracy: 2)
        XCTAssertGreaterThan(last.frame.minY, first.frame.minY)
        capture("horizontal-view-all")
        reveal(toggle); toggle.tap()
        XCTAssertTrue(rail.waitForExistence(timeout: 5))
        reveal(rail)
        for _ in 0..<4 where !first.isHittable { rail.swipeRight(velocity: .slow) }
        XCTAssertTrue(first.isHittable); first.tap()
        XCTAssertTrue(app.descendants(matching: .any)["direct-chat"].waitForExistence(timeout: 10))
        app.navigationBars.buttons.firstMatch.tap()
        XCTAssertTrue(rail.waitForExistence(timeout: 10))
    }

    func testWaitingPlansReflowWithMaximumTextAndStayOpenable() {
        continueAfterFailure = false
        launch(accessibility: true, layout: true)
        XCTAssertFalse(app.scrollViews["plans-waiting-rail"].exists)
        let first = app.buttons["plans-row-ui-plan-outgoing"]
        let last = app.buttons["plans-row-ui-plan-outgoing-3"]
        reveal(first); reveal(last)
        XCTAssertEqual(first.frame.minX, last.frame.minX, accuracy: 2)
        XCTAssertGreaterThan(last.frame.minY, first.frame.minY)
        capture("horizontal-large-text-waiting")
        first.tap()
        XCTAssertTrue(app.descendants(matching: .any)["direct-chat"].waitForExistence(timeout: 10))
    }

    func testUpcomingDateSummaryOpensTheExistingConfirmedPlan() {
        continueAfterFailure = false
        launch(layout: true)
        app.descendants(matching: .any)["plans-segmented-control"].firstMatch.buttons.element(boundBy: 1).tap()
        let row = app.buttons["plans-row-ui-plan-accepted"]
        XCTAssertTrue(row.waitForExistence(timeout: 10))
        XCTAssertTrue(row.label.contains("Dinner in town"))
        XCTAssertFalse(row.label.contains("Europe/Berlin"))
        XCTAssertLessThanOrEqual(row.frame.height, 144, "The date summary and shared activity band should stay compact")
        print("PLAN_CARD_METRIC upcoming \(row.frame.height)")
        capture("upcoming-date-summary")
        row.tap()
        XCTAssertTrue(app.descendants(matching: .any)["direct-chat"].waitForExistence(timeout: 10))
        app.navigationBars.buttons.firstMatch.tap()
        XCTAssertTrue(app.descendants(matching: .any)["plans-segmented-control"].firstMatch.buttons.element(boundBy: 1).isSelected)
        XCTAssertTrue(row.waitForExistence(timeout: 10))
    }

    func testUpcomingSummaryReflowsWithMaximumText() {
        continueAfterFailure = false
        launch(accessibility: true, layout: true)
        let upcoming = app.buttons["plans-tab-upcoming"]
        XCTAssertTrue(upcoming.waitForExistence(timeout: 10)); upcoming.tap()
        XCTAssertTrue(app.buttons["plans-tab-waitingResponse"].isHittable)
        XCTAssertFalse(app.buttons["plans-section-menu"].exists)
        let row = app.buttons["plans-row-ui-plan-accepted"]
        XCTAssertTrue(row.waitForExistence(timeout: 10))
        let scroll = app.scrollViews["plans-scroll-upcoming"]
        for _ in 0..<10 where !row.isHittable { scroll.swipeUp() }
        XCTAssertTrue(row.isHittable)
        XCTAssertTrue(row.label.contains("Dinner in town"))
        XCTAssertEqual(row.value as? String, "已确认")
        capture("upcoming-large-text")
        row.tap()
        XCTAssertTrue(app.descendants(matching: .any)["direct-chat"].waitForExistence(timeout: 10))
    }

    private func reveal(_ element: XCUIElement) {
        XCTAssertTrue(element.waitForExistence(timeout: 10))
        let scroll = app.scrollViews["plans-scroll-waitingResponse"].firstMatch
        for _ in 0..<16 where !element.isHittable {
            if element.frame.midY < scroll.frame.minY { app.swipeDown() }
            else { app.swipeUp() }
        }
        XCTAssertTrue(element.isHittable)
    }

    private func capture(_ name: String) {
        let image = XCTAttachment(screenshot: app.screenshot())
        image.name = "shared-plan-117-" + name; image.lifetime = .keepAlways; add(image)
    }
}
