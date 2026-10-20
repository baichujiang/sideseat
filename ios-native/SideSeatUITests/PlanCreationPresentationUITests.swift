import XCTest

@MainActor final class PlanCreationPresentationUITests: XCTestCase {
    private var app: XCUIApplication!

    override func setUpWithError() throws {
        continueAfterFailure = false
        if let bundle = ProcessInfo.processInfo.environment["SIDESEAT_PLAN_PRESENTATION_QA_BUNDLE"] {
            app = XCUIApplication(bundleIdentifier: bundle)
        } else { app = XCUIApplication() }
        app.launchArguments = ["--ui-testing-authenticated", "--ui-testing-ephemeral-credentials",
            "--ui-testing-skip-tutorial", "--ui-testing-language=zh-Hans", "--ui-testing-local-api", "--ui-testing-plans-empty"]
        app.launchEnvironment["SIDESEAT_API_BASE_URL_OVERRIDE"] = "http://127.0.0.1:9"
        app.launch()
        XCTAssertTrue(app.tabBars.firstMatch.waitForExistence(timeout: 20))
    }

    override func tearDownWithError() throws { app?.terminate() }

    func testFirstHomeOpensCreateDirectlyWithoutLinkEntry() {
        app.tabBars.buttons["计划"].tap()
        assertHittable(app.buttons["plans-create-primary"])
        XCTAssertEqual(app.buttons["plans-create-primary"].label, "发起计划")
        XCTAssertFalse(app.buttons["plans-create-unified"].exists)
        XCTAssertFalse(app.buttons["plans-open-link"].exists)
        XCTAssertFalse(app.staticTexts["把「改天约」\n变成「周末见」"].exists)
        XCTAssertFalse(app.buttons["plans-purpose-example"].exists)
        capture("home-first-use")
        openCreation()
        cancel().tap()
        XCTAssertTrue(homeCreate.isHittable)
    }

    func testDefaultFormNeedsOnlyActivityAndOneCreateAction() {
        app.tabBars.buttons["计划"].tap(); openCreation()
        XCTAssertFalse(app.buttons["plan-start-known-activity"].exists)
        XCTAssertFalse(app.buttons["plan-mode-collect"].exists)
        XCTAssertFalse(app.buttons["plan-create-next"].exists)
        XCTAssertFalse(app.buttons["plan-change-method"].exists)
        let create = app.buttons["time-poll-create-confirm"]
        XCTAssertEqual(create.label, "发起计划"); XCTAssertFalse(create.isEnabled)
        let title = app.textFields["time-poll-title"]
        title.tap(); title.typeText("周末聚餐\n")
        XCTAssertTrue(create.isEnabled); XCTAssertTrue(create.isHittable)
        XCTAssertTrue(app.buttons["plan-date-options"].exists)
        capture("single-form-default")
    }

    func testEmptyHomeWaitsForInitialLoadBeforeShowingItsActions() {
        app.terminate()
        app.launchArguments.append("--ui-testing-plans-loading")
        app.launch(); app.tabBars.buttons["计划"].tap()
        let loading = app.descendants(matching: .any)["plans-loading"].firstMatch
        XCTAssertTrue(loading.waitForExistence(timeout: 2))
        XCTAssertFalse(app.buttons["plans-create-primary"].exists)
        XCTAssertTrue(app.buttons["plans-create-unified"].isHittable)
        capture("empty-home-initial-loading")
        XCTAssertTrue(app.buttons["plans-create-primary"].waitForExistence(timeout: 10))
        XCTAssertFalse(loading.exists)
        XCTAssertFalse(app.buttons["plans-create-unified"].exists)
        XCTAssertFalse(app.buttons["plans-purpose-example"].exists)
        XCTAssertFalse(app.buttons["plans-open-link"].exists)
        capture("empty-home-after-loading")
        openCreation(); cancel().tap(); assertHittable(homeCreate)
    }

    func testActivityIdeasCheckboxKeepsTheSameFormAndDraft() {
        app.tabBars.buttons["计划"].tap(); openCreation()
        let title = app.textFields["time-poll-title"]
        title.tap(); title.typeText("周末一起出去\n")
        let location = app.textFields["unified-plan-location"]
        location.tap(); location.typeText("校园\n")
        app.swipeDown()
        let dates = app.buttons["plan-date-options"]
        reveal(dates); let dateSummary = dates.label
        let shortcut = app.buttons["plan-start-together"]
        reveal(shortcut); XCTAssertGreaterThanOrEqual(shortcut.frame.height, 44)
        XCTAssertFalse(shortcut.isSelected); shortcut.tap(); XCTAssertTrue(shortcut.isSelected)
        XCTAssertFalse(app.buttons["plan-create-next"].exists)
        XCTAssertTrue(app.buttons["plan-mode-fixed"].exists)
        XCTAssertEqual(app.buttons["time-poll-create-confirm"].label, "发起计划")
        XCTAssertTrue(app.navigationBars["发起计划"].exists)
        XCTAssertFalse(app.buttons["plan-start-known-activity"].exists)
        capture("activity-ideas-checkbox-checked")
        reveal(shortcut); shortcut.tap(); XCTAssertFalse(shortcut.isSelected)
        XCTAssertEqual(title.value as? String, "周末一起出去")
        XCTAssertEqual(location.value as? String, "校园")
        XCTAssertEqual(dates.label, dateSummary)
        XCTAssertEqual(app.buttons["time-poll-create-confirm"].label, "发起计划")
        capture("activity-ideas-checkbox-unchecked")
        cancel().tap(); assertHittable(app.buttons["plans-create-primary"])
    }

    func testSuggestionsAndFixedTimeKeepBothOptionsAndInputs() {
        app.tabBars.buttons["计划"].tap(); openCreation()
        let title = app.textFields["time-poll-title"]
        title.tap(); title.typeText("周六做点什么\n")
        let location = app.textFields["unified-plan-location"]
        location.tap(); location.typeText("校园\n")
        let option = app.buttons["plan-start-together"]
        reveal(option); option.tap(); XCTAssertTrue(option.isSelected)
        let fixed = app.buttons["plan-mode-fixed"]
        reveal(fixed); fixed.tap()
        let time = app.datePickers["unified-plan-fixed-start"]
        XCTAssertTrue(time.waitForExistence(timeout: 10))
        let timeValue = time.value as? String
        reveal(option); XCTAssertTrue(option.isSelected)
        XCTAssertEqual(app.buttons["time-poll-create-confirm"].label, "发起计划")
        option.tap(); XCTAssertFalse(option.isSelected)
        XCTAssertEqual(app.buttons["time-poll-create-confirm"].label, "生成邀请链接")
        option.tap(); XCTAssertTrue(option.isSelected)
        XCTAssertEqual(time.value as? String, timeValue)
        XCTAssertEqual(title.value as? String, "周六做点什么")
        XCTAssertEqual(location.value as? String, "校园")
        capture("fixed-time-with-activity-ideas")
        let collect = app.buttons["plan-mode-collect"]
        reveal(collect); collect.tap()
        reveal(option); XCTAssertTrue(option.isSelected)
        reveal(fixed); fixed.tap()
        XCTAssertEqual(time.value as? String, timeValue)
        XCTAssertEqual(title.value as? String, "周六做点什么")
        capture("fixed-time-options-restored")
    }

    func testFixedTimeShortcutEditsInPlaceAndKeepsInputs() {
        app.tabBars.buttons["计划"].tap(); openCreation()
        let title = app.textFields["time-poll-title"]
        title.tap(); title.typeText("已定时间的聚餐\n")
        let fixed = app.buttons["plan-mode-fixed"]
        reveal(fixed); fixed.tap()
        XCTAssertTrue(app.datePickers["unified-plan-fixed-start"].waitForExistence(timeout: 10))
        XCTAssertTrue(app.steppers["unified-plan-participant-count"].exists)
        XCTAssertEqual(app.buttons["time-poll-create-confirm"].label, "生成邀请链接")
        XCTAssertFalse(app.buttons["plan-create-next"].exists)
        capture("secondary-fixed-time")
        let collect = app.buttons["plan-mode-collect"]
        reveal(collect); collect.tap()
        XCTAssertEqual(title.value as? String, "已定时间的聚餐")
        XCTAssertTrue(app.buttons["plan-date-options"].exists)
        capture("return-to-default-form")
        let bar = app.navigationBars.firstMatch
        bar.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.1))
            .press(forDuration: 0.1, thenDragTo: app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.9)))
        assertHittable(homeCreate)
    }

    func testChineseDarkLargeTextKeepsInputsDatesAndCreateReachable() {
        app.terminate()
        app.launchArguments.append(contentsOf: ["--ui-testing-appearance=dark", "--ui-testing-dynamic-type-accessibility"])
        app.launch(); app.tabBars.buttons["计划"].tap()
        assertHittable(homeCreate)
        XCTAssertFalse(app.buttons["plans-open-link"].exists)
        capture("home-first-use-dark-large")
        openCreation()
        let title = app.textFields["time-poll-title"]
        reveal(title); title.tap(); title.typeText("Accessible activity\n")
        let create = app.buttons["time-poll-create-confirm"]
        XCTAssertTrue(create.isEnabled); XCTAssertTrue(create.isHittable)
        XCTAssertLessThanOrEqual(create.frame.maxX, app.frame.maxX + 1)
        let suggestionOption = app.buttons["plan-start-together"]
        reveal(suggestionOption); suggestionOption.tap(); XCTAssertTrue(suggestionOption.isSelected)
        XCTAssertEqual(create.label, "发起计划")
        capture("single-form-dark-large")
        let fixed = app.buttons["plan-mode-fixed"]
        reveal(fixed); fixed.tap()
        reveal(suggestionOption); XCTAssertTrue(suggestionOption.isSelected)
        XCTAssertEqual(create.label, "发起计划"); XCTAssertTrue(create.isHittable)
        capture("fixed-ideas-dark-large")
        let collect = app.buttons["plan-mode-collect"]
        reveal(collect); collect.tap()
        let options = app.buttons["plan-date-options"]
        reveal(options); options.tap()
        let dates = app.descendants(matching: .any)["time-poll-dates"].firstMatch
        reveal(dates); capture("inline-dates-dark-large")
        XCTAssertTrue(create.isHittable)
        cancel().tap(); assertHittable(homeCreate)
    }

    func testSuggestionCheckboxCreatesTheChosenPlanKindOnTheRealAPI() throws {
        struct Fixture: Decodable { let bundle: String; let accessToken: String; let knownTitle: String; let ideaTitle: String }
        let raw = ProcessInfo.processInfo.environment["SIDESEAT_PLAN_OPTION_JSON"]
        try XCTSkipIf(raw == nil, "Requires a disposable real API account.")
        let fixture = try JSONDecoder().decode(Fixture.self, from: Data(raw!.utf8))
        for suggestions in [false, true] {
            app.terminate(); app = XCUIApplication(bundleIdentifier: fixture.bundle)
            app.launchArguments = ["--ui-testing-authenticated", "--ui-testing-ephemeral-credentials", "--ui-testing-time-poll-live",
                "--ui-testing-skip-tutorial", "--ui-testing-language=zh-Hans", "--ui-testing-appearance=light"]
            app.launchEnvironment = ["SIDESEAT_QA_ACCESS_TOKEN": fixture.accessToken]
            app.launch(); XCTAssertTrue(app.tabBars.firstMatch.waitForExistence(timeout: 20))
            app.tabBars.buttons["计划"].tap(); openCreation()
            let title = suggestions ? fixture.ideaTitle : fixture.knownTitle
            let titleField = app.textFields["time-poll-title"]
            titleField.tap(); titleField.typeText(title + "\n")
            app.textFields["unified-plan-location"].tap(); app.textFields["unified-plan-location"].typeText("校园\n")
            let option = app.buttons["plan-start-together"]
            reveal(option); XCTAssertFalse(option.isSelected)
            if suggestions { option.tap(); XCTAssertTrue(option.isSelected) }
            XCTAssertEqual(titleField.value as? String, title)
            let create = app.buttons["time-poll-create-confirm"]
            XCTAssertEqual(create.label, "发起计划"); capture(suggestions ? "live-checkbox-checked" : "live-checkbox-unchecked")
            create.tap()
            XCTAssertTrue(app.staticTexts["time-poll-detail-title"].waitForExistence(timeout: 25))
            XCTAssertEqual(app.staticTexts["time-poll-detail-title"].label, title)
            XCTAssertEqual(app.buttons["plan-activity-open-ideas"].exists, suggestions)
            capture(suggestions ? "live-idea-plan-created" : "live-known-plan-created")
            print("PLAN_OPTION155_PHASE \(suggestions ? "idea-created" : "known-created")")
            Thread.sleep(forTimeInterval: 3)
        }
    }

    func testPlansCreateCancelReturnsToPlansInOneStep() {
        app.tabBars.buttons["计划"].tap()
        for attempt in 1...3 {
            openCreation(); capture("creation-\(attempt)"); cancel().tap()
            assertHittable(homeCreate)
            XCTAssertFalse(app.buttons["time-poll-create"].exists)
        }
        capture("returned-to-plans")
    }

    func testMessagesEntryUsesFirstLevelPlans() {
        app.tabBars.buttons["消息"].tap()
        let entry = app.buttons["inbox-time-poll"]
        XCTAssertTrue(entry.waitForExistence(timeout: 10)); entry.tap()
        assertHittable(homeCreate)
        XCTAssertTrue(app.tabBars.buttons["计划"].isSelected)
        openCreation(); cancel().tap(); assertHittable(homeCreate)
    }

    private var homeCreate: XCUIElement {
        let primary = app.buttons["plans-create-primary"]
        return primary.exists ? primary : app.buttons["plans-create-unified"]
    }
    private func openCreation() {
        let create = homeCreate
        for _ in 0..<5 where !create.isHittable { app.swipeUp() }
        assertHittable(create); create.tap()
        XCTAssertTrue(app.textFields["time-poll-title"].waitForExistence(timeout: 10))
        XCTAssertTrue(app.buttons["time-poll-create-confirm"].exists)
    }
    private func reveal(_ element: XCUIElement) {
        for _ in 0..<8 {
            let top = app.navigationBars.firstMatch.frame.maxY + 8
            let bottom = app.buttons["time-poll-create-confirm"].frame.minY - 8
            if element.exists && element.isHittable && element.frame.midY > top && element.frame.midY < bottom { break }
            if element.exists && element.frame.midY < top { app.swipeDown() } else { app.swipeUp() }
        }
        XCTAssertTrue(element.waitForExistence(timeout: 10))
        XCTAssertTrue(element.isHittable)
    }
    private func cancel() -> XCUIElement {
        app.navigationBars.buttons.matching(NSPredicate(format: "label IN %@", ["取消", "Cancel"])).firstMatch
    }
    private func assertHittable(_ element: XCUIElement) {
        XCTAssertEqual(XCTWaiter.wait(for: [XCTNSPredicateExpectation(predicate: NSPredicate(format: "hittable == true"), object: element)], timeout: 8), .completed)
    }
    private func capture(_ name: String) {
        let attachment = XCTAttachment(screenshot: app.screenshot())
        attachment.name = "plan-creation-132-" + name
        attachment.lifetime = .keepAlways
        add(attachment)
    }
}
