import XCTest

/// Captures Auth, Together states, and the current 5-tab shell for visual QA.
/// Appearance: host writes `.appearance` (and optionally `simctl ui`); tests also pass
/// `--ui-testing-appearance=` so physical devices force light/dark without simctl.
final class VisualQAScreenshotUITests: XCTestCase {
    override func setUpWithError() throws {
        continueAfterFailure = false
        try FileManager.default.createDirectory(
            at: Self.visualQADirectory(),
            withIntermediateDirectories: true
        )
    }

    @MainActor
    func testExpiredIntentionRepublishesWithNewTime() {
        let app = togetherApp(["--ui-testing-expired-intention", "--ui-testing-language=zh-Hans"])
        selectTogetherSection(1, in: app)
        let repeatButton = app.buttons["weekly-intent-repeat-ui-intent-expired"].firstMatch
        XCTAssertFalse(repeatButton.exists)
        let history = app.descendants(matching: .any)["weekly-intent-expired-history"].firstMatch
        XCTAssertTrue(history.waitForExistence(timeout: 5))
        history.tap()
        XCTAssertTrue(repeatButton.waitForExistence(timeout: 3))
        saveScreenshot(app: app, name: "repeat-intention-inline-button-zh")
        repeatButton.tap()
        let save = app.buttons["intent-editor-save"].firstMatch
        XCTAssertTrue(save.waitForExistence(timeout: 5))
        XCTAssertEqual(app.textFields["intent-editor-activity"].value as? String, "Coffee after class")
        XCTAssertTrue(save.isEnabled, "Repeating prefills a valid future time, ready to publish")
        let choose = app.buttons["intent-timing-choose"].firstMatch
        XCTAssertTrue(choose.exists)
        XCTAssertFalse(app.datePickers.firstMatch.exists, "The form shows a summary, not date controls")
        let originalSummary = choose.label
        choose.tap()
        let start = app.datePickers.matching(NSPredicate(format: "identifier BEGINSWITH %@", "intent-time-start-")).firstMatch
        XCTAssertTrue(start.waitForExistence(timeout: 3))
        let prefilledTime = exactTimeValue(start)
        app.buttons["intent-time-add"].tap()
        app.buttons["intent-time-picker-cancel"].tap()
        XCTAssertEqual(choose.label, originalSummary, "Cancel must discard draft changes")
        choose.tap()
        app.buttons["intent-time-add"].tap()
        let sheetBar = app.navigationBars["选择时间"]
        sheetBar.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.4))
            .press(forDuration: 0.05, thenDragTo: app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.92)),
                   withVelocity: .slow, thenHoldForDuration: 0.1)
        XCTAssertTrue(app.buttons["intent-time-picker-done"].waitForNonExistence(timeout: 3))
        XCTAssertEqual(choose.label, originalSummary, "Swipe dismissal must also discard draft changes")
        choose.tap()
        XCTAssertEqual(app.datePickers.matching(NSPredicate(format: "identifier BEGINSWITH %@", "intent-time-start-")).count, 1)
        XCTAssertEqual(exactTimeValue(start), prefilledTime)
        app.buttons["intent-time-picker-done"].tap()
        XCTAssertEqual(choose.label, originalSummary)
        saveScreenshot(app: app, name: "repeat-intention-new-time-zh")
        save.tap()
        XCTAssertTrue(app.buttons["weekly-intent-edit-ui-intent-created"].waitForExistence(timeout: 5))
        XCTAssertTrue(history.exists, "The original stays in history")
        saveScreenshot(app: app, name: "repeat-intention-history-zh")
        app.terminate()
    }

    @MainActor
    func testRepeatedIntentionCanPublishWithUndecidedTime() {
        let app = togetherApp(["--ui-testing-expired-intention", "--ui-testing-language=zh-Hans"])
        selectTogetherSection(1, in: app)
        let history = app.buttons["weekly-intent-expired-history"].firstMatch
        XCTAssertTrue(history.waitForExistence(timeout: 5))
        history.tap()
        app.buttons["weekly-intent-repeat-ui-intent-expired"].tap()
        let choose = app.buttons["intent-timing-choose"].firstMatch
        XCTAssertTrue(choose.waitForExistence(timeout: 5))
        choose.tap()
        let clear = app.buttons["intent-time-clear"].firstMatch
        XCTAssertTrue(clear.waitForExistence(timeout: 3))
        clear.tap()
        XCTAssertTrue(choose.waitForExistence(timeout: 3))
        XCTAssertTrue(choose.label.contains("待定"))
        XCTAssertTrue(app.buttons["intent-editor-save"].isEnabled)
        saveScreenshot(app: app, name: "repeat-intention-time-undecided-zh")
        app.buttons["intent-editor-save"].tap()
        let edit = app.buttons["weekly-intent-edit-ui-intent-created"].firstMatch
        XCTAssertTrue(edit.waitForExistence(timeout: 5))
        XCTAssertTrue(history.exists)
        edit.tap()
        XCTAssertTrue(choose.waitForExistence(timeout: 5))
        XCTAssertTrue(choose.label.contains("待定"), "Publishing must omit the cleared exact-time draft")
        XCTAssertFalse(app.datePickers.matching(NSPredicate(format: "identifier BEGINSWITH %@", "intent-time-start-")).firstMatch.exists)
        app.terminate()
    }

    @MainActor
    private func swipeTaskPage(_ surface: XCUIElement, left: Bool, y: CGFloat = 0.12) {
        XCTAssertTrue(surface.waitForExistence(timeout: 5))
        let start = surface.coordinate(withNormalizedOffset: CGVector(dx: left ? 0.82 : 0.18, dy: y))
        let end = surface.coordinate(withNormalizedOffset: CGVector(dx: left ? 0.18 : 0.82, dy: y))
        start.press(forDuration: 0.08, thenDragTo: end, withVelocity: .slow, thenHoldForDuration: 0.1)
    }

    @MainActor
    private func selectPlanSection(_ index: Int, in app: XCUIApplication) {
        let names = ["waitingResponse", "upcoming", "ended"]
        let button = app.buttons["plans-tab-\(names[index])"].firstMatch
        if button.waitForExistence(timeout: 1) { button.tap() }
        else { app.segmentedControls["plans-segmented-control"].buttons.element(boundBy: index).tap() }
    }

    @MainActor
    func testTaskPagerSwipesAndRetainsTogetherPosition() {
        let app = togetherApp(["--ui-testing-opportunity-list", "--ui-testing-intent-card-states",
            "--ui-testing-explore-intents", "--ui-testing-language=zh-Hans"])
        let recommendation = app.scrollViews["together-section-recommendations"].firstMatch
        let picker = app.descendants(matching: .any)["together-segmented-control"].firstMatch
        let pinnedY = picker.frame.minY
        XCTAssertLessThan(app.buttons["together-tab-intentions"].frame.midX, app.buttons["together-tab-recommendations"].frame.midX)
        XCTAssertLessThan(app.buttons["together-tab-recommendations"].frame.midX, app.buttons["together-tab-bookmarks"].frame.midX)
        // Swiping from activity content navigates; it must not choose interest.
        swipeTaskPage(recommendation, left: false)
        let intentions = app.scrollViews["together-section-intentions"].firstMatch
        XCTAssertTrue(intentions.waitForExistence(timeout: 5), app.debugDescription)
        XCTAssertTrue(picker.buttons.element(boundBy: 0).isSelected)
        intentions.swipeUp(velocity: .slow)
        let study = app.descendants(matching: .any)["weekly-intent-ui-intent-study"].firstMatch
        XCTAssertTrue(study.waitForExistence(timeout: 3))
        let savedY = study.frame.minY
        XCTAssertEqual(picker.frame.minY, pinnedY, accuracy: 2)
        selectTogetherSection(0, in: app)
        XCTAssertTrue(app.descendants(matching: .any)["mutual-opportunity-cmutualui0000000000000001"].waitForExistence(timeout: 5))
        selectTogetherSection(1, in: app)
        XCTAssertTrue(study.waitForExistence(timeout: 5))
        XCTAssertEqual(study.frame.minY, savedY, accuracy: 5, "Each task retains its independent scroll offset")
        selectTogetherSection(2, in: app)
        let explore = app.scrollViews["together-section-bookmarks"].firstMatch
        XCTAssertTrue(explore.waitForExistence(timeout: 5))
        // The last page does not wrap around to Recommendations.
        swipeTaskPage(explore, left: true)
        XCTAssertTrue(picker.buttons.element(boundBy: 2).isSelected)
        swipeTaskPage(explore, left: false)
        XCTAssertTrue(app.buttons["together-tab-recommendations"].isSelected)
        swipeTaskPage(recommendation, left: false)
        XCTAssertTrue(intentions.waitForExistence(timeout: 5))
        XCTAssertTrue(picker.buttons.element(boundBy: 0).isSelected)
        XCTAssertEqual(study.frame.minY, savedY, accuracy: 5)
        saveScreenshot(app: app, name: "pager-together-restored-zh")
        app.terminate()
    }

    @MainActor
    func testTaskPagerBookmarksKeepSelectedPage() {
        let app = togetherApp(["--ui-testing-opportunity-list", "--ui-testing-language=en"])
        let id = "cmutualui0000000000000001"
        let bookmark = app.buttons["mutual-opportunity-bookmark-\(id)"]
        revealFlowElement(bookmark, in: app)
        let originalY = bookmark.frame.minY
        bookmark.tap()
        XCTAssertTrue(bookmark.waitForExistence(timeout: 5))
        XCTAssertEqual(bookmark.label, "Remove bookmark")
        XCTAssertEqual(bookmark.frame.minY, originalY, accuracy: 5)
        XCTAssertTrue(app.buttons["together-tab-recommendations"].isSelected)
        XCTAssertTrue(app.descendants(matching: .any)["mutual-opportunity-cmutualui0000000000000002"].exists)
        saveScreenshot(app: app, name: "interest-stays-in-recommendations-en")
        app.terminate()
    }


    @MainActor
    func testSavedIntentionsHaveTheirOwnPage() {
        let app = togetherApp(["--ui-testing-explore-intents", "--ui-testing-language=zh-Hans"])
        let id = "cmutualui0000000000000001"
        let heart = app.buttons["mutual-opportunity-bookmark-\(id)"]
        revealFlowElement(heart, in: app)
        heart.tap()
        selectTogetherSection(2, in: app)
        XCTAssertEqual(app.buttons["together-tab-bookmarks"].label, "我的收藏")
        XCTAssertTrue(heart.waitForExistence(timeout: 5))
        XCTAssertFalse(app.buttons["explore-bookmark-ui-explore-0"].exists)
        saveScreenshot(app: app, name: "together-saved-intentions-zh")
        heart.tap()
        XCTAssertTrue(heart.waitForNonExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["还没有收藏"].exists)
        selectTogetherSection(0, in: app)
        revealFlowElement(heart, in: app)
        XCTAssertEqual(heart.label, "收藏意愿")
        app.terminate()
    }


    @MainActor
    func testTaskPagerPlansPinnedAndIndependentPositions() {
        let app = togetherApp(["--ui-testing-chats", "--ui-testing-plans-long-list", "--ui-testing-language=en", "--ui-testing-appearance=dark"])
        tabButton(in: app, labels: ["Plans"]).tap()
        let picker = app.segmentedControls["plans-segmented-control"]
        XCTAssertTrue(picker.waitForExistence(timeout: 5))
        let fixedY = picker.frame.minY
        swipeTaskPage(app.scrollViews["plans-scroll-waitingResponse"].firstMatch, left: true)
        let upcoming = app.scrollViews["plans-scroll-upcoming"].firstMatch
        XCTAssertTrue(upcoming.waitForExistence(timeout: 5), app.debugDescription)
        XCTAssertTrue(picker.buttons.element(boundBy: 1).isSelected)
        upcoming.swipeUp(velocity: .slow)
        // A partially clipped card is auto-scrolled into view by XCTest before tapping.
        // Use a fully visible card so the saved position describes the actual tap viewport.
        let card = app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH %@", "plans-row-ui-plan-accepted")).allElementsBoundByIndex.first {
            $0.isHittable && $0.frame.minY >= upcoming.frame.minY && $0.frame.maxY <= upcoming.frame.maxY
        }
        XCTAssertNotNil(card)
        let identifier = card!.identifier
        let savedY = card!.frame.minY
        XCTAssertEqual(picker.frame.minY, fixedY, accuracy: 2)
        selectPlanSection(2, in: app)
        XCTAssertTrue(app.scrollViews["plans-scroll-ended"].waitForExistence(timeout: 5))
        selectPlanSection(1, in: app)
        XCTAssertEqual(app.buttons[identifier].frame.minY, savedY, accuracy: 5)
        tabButton(in: app, labels: ["Together"]).tap()
        tabButton(in: app, labels: ["Plans"]).tap()
        XCTAssertTrue(picker.buttons.element(boundBy: 1).isSelected)
        XCTAssertEqual(app.buttons[identifier].frame.minY, savedY, accuracy: 5)
        saveScreenshot(app: app, name: "pager-plans-restored-dark")
        app.buttons[identifier].tap()
        XCTAssertTrue(app.descendants(matching: .any)["direct-chat"].waitForExistence(timeout: 8))
        app.navigationBars.buttons.firstMatch.tap()
        XCTAssertTrue(picker.waitForExistence(timeout: 5))
        XCTAssertTrue(picker.buttons.element(boundBy: 1).isSelected)
        let restoredPosition = NSPredicate { _, _ in abs(app.buttons[identifier].frame.minY - savedY) <= 5 }
        expectation(for: restoredPosition, evaluatedWith: app)
        waitForExpectations(timeout: 4)
        saveScreenshot(app: app, name: "pager-plans-after-chat-dark")
        XCTAssertEqual(app.buttons[identifier].frame.minY, savedY, accuracy: 5, "Returning from chat preserves the plan viewport")
        app.terminate()
    }

    @MainActor
    func testPlansHierarchyWithAccessibleText() {
        let app = togetherApp(["--ui-testing-chats", "--ui-testing-plans-mixed-waiting",
            "--ui-testing-plans-date-groups", "--ui-testing-dynamic-type-accessibility",
            "--ui-testing-reduce-motion", "--ui-testing-language=de", "--ui-testing-appearance=dark",
            "-UIPreferredContentSizeCategoryName", "UICTContentSizeCategoryAccessibilityXXXL"])
        tabButton(in: app, labels: ["Pläne"]).tap()
        for raw in ["waitingResponse", "upcoming", "ended"] {
            let selector = app.buttons["plans-tab-\(raw)"].firstMatch
            XCTAssertTrue(selector.waitForExistence(timeout: 5))
            XCTAssertTrue(selector.isHittable)
            selector.tap()
            XCTAssertTrue(selector.isSelected)
            XCTAssertGreaterThanOrEqual(selector.frame.height, 44)
            let scroll = app.scrollViews["plans-scroll-\(raw)"].firstMatch
            XCTAssertTrue(scroll.waitForExistence(timeout: 5))
            let card = scroll.buttons.matching(NSPredicate(format: "identifier BEGINSWITH %@", "plans-row-")).firstMatch
            XCTAssertTrue(card.waitForExistence(timeout: 5))
            XCTAssertGreaterThanOrEqual(card.frame.minX, scroll.frame.minX)
            XCTAssertLessThanOrEqual(card.frame.maxX, scroll.frame.maxX)
            saveScreenshot(app: app, name: "plans-hierarchy-accessible-\(raw)")
        }
        app.terminate()
    }

    @MainActor
    func testTaskPagerAccessibleSelectorsAndReducedMotion() {
        let app = togetherApp(["--ui-testing-intent-card-states", "--ui-testing-explore-intents",
            "--ui-testing-dynamic-type-accessibility", "--ui-testing-reduce-motion",
            "--ui-testing-language=de", "--ui-testing-appearance=dark"])
        for (index, raw) in ["recommendations", "intentions", "explore"].enumerated() {
            let button = app.buttons["together-tab-\(raw)"].firstMatch
            XCTAssertTrue(button.waitForExistence(timeout: 5))
            XCTAssertTrue(button.isHittable)
            XCTAssertGreaterThanOrEqual(button.frame.height, 44)
            selectTogetherSection(index, in: app)
            XCTAssertTrue(button.isSelected)
        }
        tabButton(in: app, labels: ["Pläne"]).tap()
        for (index, raw) in ["waitingResponse", "upcoming", "ended"].enumerated() {
            selectPlanSection(index, in: app)
            let button = app.buttons["plans-tab-\(raw)"].firstMatch
            XCTAssertTrue(button.isHittable)
            XCTAssertTrue(button.isSelected)
            XCTAssertGreaterThanOrEqual(button.frame.height, 44)
        }
        saveScreenshot(app: app, name: "pager-plans-accessibility-de-dark")
        app.terminate()
    }

    @MainActor
    func testTaskPagerPlansNavigationInEmptyLoadingAndErrorStates() {
        for state in ["empty", "error", "loading"] {
            let app = togetherApp(["--ui-testing-plans-\(state)", "--ui-testing-language=en"])
            tabButton(in: app, labels: ["Plans"]).tap()
            let picker = app.segmentedControls["plans-segmented-control"]
            XCTAssertTrue(picker.waitForExistence(timeout: 5))
            selectPlanSection(1, in: app)
            XCTAssertTrue(picker.buttons.element(boundBy: 1).isSelected)
            if state == "empty" { XCTAssertTrue(app.descendants(matching: .any)["plans-empty-upcoming"].waitForExistence(timeout: 5)) }
            if state == "error" { XCTAssertTrue(app.descendants(matching: .any)["plans-load-error"].waitForExistence(timeout: 5)) }
            if state == "loading" { XCTAssertTrue(app.buttons["plans-row-ui-plan-accepted"].waitForExistence(timeout: 8)) }
            saveScreenshot(app: app, name: "pager-plans-\(state)")
            if state == "empty" {
                let openTogether = app.buttons["plans-open-together"]
                XCTAssertTrue(openTogether.isHittable)
                openTogether.tap()
                XCTAssertTrue(app.descendants(matching: .any)["together-home"].waitForExistence(timeout: 5),
                    "Empty Plans should offer a direct route to finding an activity.")
            }
            app.terminate()
        }
    }

    @MainActor
    func testDiscoveryDifferencesAcrossLanguages() {
        let id = "cmutualui0000000000000001"
        for (language, coffee, sport) in [
            ("zh-Hans", "咖啡", "篮球"),
            ("en", "Coffee", "Basketball"),
            ("de", "Kaffee", "Basketball"),
        ] {
            let app = XCUIApplication()
            app.launchArguments = ["--ui-testing-authenticated", "--ui-testing-skip-tutorial",
                "--ui-testing-ephemeral-credentials", "--ui-testing-local-api",
                "--ui-testing-discover", "--ui-testing-weekly-intent", "--ui-testing-mutual-opportunity", "--ui-testing-together-matching",
                "--ui-testing-discovery-matching", "--ui-testing-automatic-matching", "--ui-testing-discovery-published",
                "--ui-testing-language=\(language)", "--ui-testing-appearance=\(language == "en" ? "dark" : "light")"]
            if language == "de" { app.launchArguments.append("--ui-testing-dynamic-type-accessibility") }
            app.launchEnvironment["SIDESEAT_API_BASE_URL_OVERRIDE"] = "http://127.0.0.1:9"
            app.launch()
            let activity = app.descendants(matching: .any)["mutual-opportunity-activity-\(id)"].firstMatch
            XCTAssertTrue(activity.waitForExistence(timeout: 8))
            XCTAssertFalse(activity.label.contains(coffee))
            XCTAssertTrue(activity.label.contains(sport))
            XCTAssertFalse(app.descendants(matching: .any)["mutual-opportunity-fit-details-\(id)"].exists)
            XCTAssertFalse(app.descendants(matching: .any)["mutual-opportunity-differences-\(id)"].exists)
            XCTAssertFalse(app.descendants(matching: .any)["together-finding-summary"].exists)
            XCTAssertFalse(app.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", "/100")).firstMatch.exists)
            saveScreenshot(app: app, name: "compact-opportunity-different-\(language)")
            let time = app.descendants(matching: .any)["mutual-opportunity-time-\(id)"].firstMatch
            revealCompactCue(time, in: app)
            XCTAssertTrue(time.label.contains("–"), "Show the peer's exact time even when it differs from mine")
            XCTAssertFalse(app.staticTexts["Computer Science"].exists)
            XCTAssertFalse(app.staticTexts["Check language"].exists)
            saveScreenshot(app: app, name: "compact-opportunity-time-\(language)")
            app.terminate()
        }
    }

    @MainActor
    private func revealCompactCue(_ element: XCUIElement, in app: XCUIApplication) {
        let surface = app.scrollViews["together-section-recommendations"].firstMatch
        XCTAssertTrue(surface.waitForExistence(timeout: 8))
        for _ in 0..<20 {
            if element.exists, element.frame.intersects(surface.frame),
               element.frame.minY >= surface.frame.minY + 8 { break }
            if element.exists, element.frame.minY < surface.frame.minY {
                surface.swipeDown(velocity: .slow)
            } else {
                surface.swipeUp(velocity: .slow)
            }
        }
        XCTAssertTrue(element.exists)
        XCTAssertTrue(element.frame.intersects(surface.frame), "The short cue must remain reachable at large text sizes")
    }

    @MainActor
    func testCompactOpportunitySharedAndUndecidedTiming() {
        let id = "cmutualui0000000000000001"
        let scenarios: [([String], String, String)] = [
            ([], "–", "exact"),
            (["--ui-testing-flexible-timing"], "时间待商议", "undecided"),
            (["--ui-testing-flexible-timing", "--ui-testing-opportunity-flexible-window"], "下午", "flexible"),
        ]
        for (extra, expected, name) in scenarios {
            let app = XCUIApplication()
            app.launchArguments = ["--ui-testing-authenticated", "--ui-testing-skip-tutorial",
                "--ui-testing-ephemeral-credentials", "--ui-testing-local-api",
                "--ui-testing-discover", "--ui-testing-weekly-intent", "--ui-testing-mutual-opportunity", "--ui-testing-together-matching",
                "--ui-testing-automatic-matching", "--ui-testing-discovery-published", "--ui-testing-opportunity-topic=COFFEE",
                "--ui-testing-language=zh-Hans", "--ui-testing-appearance=light"] + extra
            app.launchEnvironment["SIDESEAT_API_BASE_URL_OVERRIDE"] = "http://127.0.0.1:9"
            app.launch()
            let activity = app.descendants(matching: .any)["mutual-opportunity-activity-\(id)"].firstMatch
            XCTAssertTrue(activity.waitForExistence(timeout: 8))
            XCTAssertFalse(activity.label.hasPrefix("都想："))
            let time = app.descendants(matching: .any)["mutual-opportunity-time-\(id)"].firstMatch
            XCTAssertTrue(time.label.contains(expected))
            XCTAssertFalse(app.descendants(matching: .any)["together-finding-summary"].exists)
            XCTAssertFalse(app.buttons["mutual-opportunity-open-\(id)"].exists)
            XCTAssertFalse(app.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", "/100")).firstMatch.exists)
            saveScreenshot(app: app, name: "compact-opportunity-\(name)-zh")
            app.terminate()
        }
    }

    @MainActor
    func testDiscoveryEmptyStates() {
        for published in [false, true] {
            let app = XCUIApplication()
            app.launchArguments = ["--ui-testing-authenticated", "--ui-testing-skip-tutorial",
                "--ui-testing-discover", "--ui-testing-weekly-intent", "--ui-testing-mutual-opportunity", "--ui-testing-mutual-opportunity-empty",
                "--ui-testing-discovery-matching", "--ui-testing-automatic-matching", "--ui-testing-together-matching",
                "--ui-testing-language=zh-Hans"]
            if published { app.launchArguments.append("--ui-testing-discovery-published") }
            app.launch()
            selectTogetherSection(0, in: app)
            let action = app.buttons["together-discovery-empty-action"]
            XCTAssertTrue(action.waitForExistence(timeout: 8))
            XCTAssertEqual(action.label, "查看我的意愿")
            XCTAssertFalse(app.buttons["together-start-matching"].exists)
            saveScreenshot(app: app, name: "discovery-empty-\(published ? "published" : "unpublished")")
            action.tap()
            XCTAssertTrue(addIntentionButton(in: app).waitForExistence(timeout: 5))
            app.terminate()
        }
    }

    @MainActor
    func testSimpleTimingChoicesAcrossLanguages() {
        verifySimpleTimingConfigurations([("zh-Hans", "light", false), ("en", "dark", false)])
    }

    @MainActor
    func testSimpleTimingGermanLargestText() {
        verifySimpleTimingConfigurations([("de", "light", true)])
    }

    @MainActor
    private func verifySimpleTimingConfigurations(_ configurations: [(String, String, Bool)]) {
        for (language, appearance, large) in configurations {
            let app = XCUIApplication()
            app.launchArguments = [
                "--ui-testing-authenticated", "--ui-testing-skip-tutorial",
                "--ui-testing-discover", "--ui-testing-weekly-intent",
                "--ui-testing-mutual-opportunity", "--ui-testing-flexible-timing",
                "--ui-testing-automatic-matching",
                "--ui-testing-together-matching",
                "--ui-testing-ephemeral-credentials", "--ui-testing-local-api",
                "--ui-testing-language=\(language)", "--ui-testing-appearance=\(appearance)",
            ]
            if large { app.launchArguments.append("--ui-testing-dynamic-type-accessibility") }
            app.launchEnvironment["SIDESEAT_API_BASE_URL_OVERRIDE"] = "http://127.0.0.1:9"
            app.launch()
            selectTogetherSection(1, in: app)
            let add = addIntentionButton(in: app)
            XCTAssertTrue(app.descendants(matching: .any)["together-home"].waitForExistence(timeout: 8))
            XCTAssertFalse(app.buttons["together-start-matching"].exists)
            XCTAssertFalse(app.buttons["together-restart-matching"].exists)
            XCTAssertFalse(app.descendants(matching: .any)["together-matching-section-title"].exists)
            saveScreenshot(app: app, name: "flexible-opportunity-\(language)-\(appearance)")
            if large {
                for _ in 0..<8 where !add.exists || !add.isHittable {
                    app.scrollViews["together-section-intentions"].swipeUp(velocity: .slow)
                }
            }
            if !add.isHittable { revealFlowElement(add, in: app) }
            XCTAssertTrue(add.exists)
            add.tap()
            XCTAssertTrue(app.descendants(matching: .any)["intent-editor"].waitForExistence(timeout: 5))
            XCTAssertTrue(app.buttons["intent-editor-save"].isEnabled)
            let choose = app.buttons["intent-timing-choose"].firstMatch
            revealFlowElement(choose, in: app)
            let undecidedSummary = choose.label
            XCTAssertTrue(undecidedSummary.contains(language == "zh-Hans" ? "待定"
                : language == "de" ? "Noch offen" : "Time undecided"))
            XCTAssertFalse(app.datePickers.firstMatch.exists)
            XCTAssertFalse(app.buttons["intent-time-clear"].exists)
            saveScreenshot(app: app, name: "time-summary-undecided-\(language)-\(appearance)")
            choose.tap()
            let done = app.buttons["intent-time-picker-done"]
            XCTAssertTrue(done.waitForExistence(timeout: 3))
            let starts = app.datePickers.matching(NSPredicate(format: "identifier BEGINSWITH %@", "intent-time-start-"))
            let ends = app.datePickers.matching(NSPredicate(format: "identifier BEGINSWITH %@", "intent-time-end-"))
            let startPicker = starts.firstMatch
            XCTAssertEqual(starts.count, 1)
            XCTAssertEqual(ends.count, 1)
            XCTAssertTrue(done.isEnabled)
            if large {
                XCTAssertTrue(app.navigationBars["Zeit"].exists)
                XCTAssertGreaterThan(app.staticTexts["Beginn"].firstMatch.frame.height, 40,
                    "The time sheet must inherit the form's accessibility text size")
            }
            let selectedStart = exactTimeValue(startPicker)
            saveScreenshot(app: app, name: "time-picker-\(language)-\(appearance)")

            // Unsaved picker changes never turn an undecided intention into a timed one.
            let addTime = app.buttons["intent-time-add"]
            revealFlowElement(addTime, in: app)
            addTime.tap()
            XCTAssertEqual(starts.count, 2)
            app.buttons["intent-time-picker-cancel"].tap()
            XCTAssertTrue(choose.waitForExistence(timeout: 3))
            XCTAssertEqual(choose.label, undecidedSummary)
            XCTAssertFalse(startPicker.exists)
            choose.tap()
            XCTAssertEqual(starts.count, 1)
            XCTAssertEqual(exactTimeValue(startPicker), selectedStart)
            done.tap()
            XCTAssertTrue(choose.waitForExistence(timeout: 3))
            let exactSummary = choose.label
            XCTAssertNotEqual(exactSummary, undecidedSummary)
            XCTAssertFalse(startPicker.exists)
            saveScreenshot(app: app, name: "time-summary-exact-\(language)-\(appearance)")

            // All selected slots are visible in the form; published cards expand in place.
            let selectedTimes = app.descendants(matching: .any).matching(
                NSPredicate(format: "identifier BEGINSWITH %@", "intent-selected-time-"))
            XCTAssertEqual(selectedTimes.count, 1)
            let originalTimeLabel = selectedTimes.firstMatch.label
            choose.tap()
            for _ in 0..<2 {
                revealFlowElement(addTime, in: app)
                addTime.tap()
            }
            if !large {
                XCTAssertEqual(starts.count, 3)
                XCTAssertEqual(ends.count, 3)
            }
            XCTAssertTrue(done.isEnabled)
            done.tap()
            XCTAssertNotEqual(choose.label, exactSummary)
            XCTAssertEqual(selectedTimes.count, 3)
            let savedTimeLabels = selectedTimes.allElementsBoundByIndex.map(\.label)
            XCTAssertEqual(savedTimeLabels.first, originalTimeLabel)
            for row in selectedTimes.allElementsBoundByIndex {
                revealFlowElement(row, in: app)
                XCTAssertLessThanOrEqual(row.frame.maxX, app.frame.maxX)
                XCTAssertTrue(row.isHittable)
            }
            saveScreenshot(app: app, name: "time-overview-three-\(language)-\(appearance)")
            app.buttons["intent-editor-save"].tap()
            XCTAssertTrue(app.descendants(matching: .any)["intent-editor"].waitForNonExistence(timeout: 5))
            let expand = app.buttons["weekly-intent-times-toggle-ui-intent-created"]
            revealFlowElement(expand, in: app)
            XCTAssertTrue(expand.isHittable)
            let thirdTime = app.descendants(matching: .any)["weekly-intent-time-ui-intent-created-2"].firstMatch
            XCTAssertFalse(thirdTime.exists)
            saveScreenshot(app: app, name: "time-card-collapsed-\(language)-\(appearance)")
            expand.tap()
            XCTAssertTrue(thirdTime.waitForExistence(timeout: 3))
            XCTAssertFalse(choose.exists, "Expanding times must not open the editor")
            revealFlowElement(expand, in: app)
            saveScreenshot(app: app, name: "time-card-expanded-\(language)-\(appearance)")
            expand.tap()
            XCTAssertFalse(thirdTime.exists)
            let publishedEdit = app.buttons["weekly-intent-edit-ui-intent-created"]
            revealFlowElement(publishedEdit, in: app, towardTop: true)
            publishedEdit.tap()
            XCTAssertTrue(app.descendants(matching: .any)["intent-editor"].waitForExistence(timeout: 5))
            revealFlowElement(choose, in: app)
            XCTAssertEqual(selectedTimes.allElementsBoundByIndex.map(\.label), savedTimeLabels)
            choose.tap()
            if !large { XCTAssertEqual(starts.count, 3) }
            for _ in 0..<2 {
                let removeID = app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH %@", "intent-time-remove-")).allElementsBoundByIndex.last!.identifier
                let remove = app.buttons[removeID]
                revealFlowElement(remove, in: app)
                remove.tap()
            }
            XCTAssertEqual(starts.count, 1)
            done.tap()
            XCTAssertEqual(choose.label, exactSummary)
            XCTAssertEqual(selectedTimes.count, 1)
            XCTAssertEqual(selectedTimes.firstMatch.label, originalTimeLabel)

            // Explicit clearing commits TBD; reopening can still reuse the last saved slot.
            choose.tap()
            let clear = app.buttons["intent-time-clear"]
            revealFlowElement(clear, in: app)
            clear.tap()
            XCTAssertTrue(choose.waitForExistence(timeout: 3))
            XCTAssertEqual(choose.label, undecidedSummary)
            XCTAssertTrue(app.buttons["intent-editor-save"].isEnabled)
            choose.tap()
            XCTAssertEqual(exactTimeValue(startPicker), selectedStart)
            done.tap()
            app.buttons["intent-editor-save"].tap()
            XCTAssertTrue(app.descendants(matching: .any)["intent-editor"].waitForNonExistence(timeout: 5))
            let edit = app.buttons["weekly-intent-edit-ui-intent-created"]
            if large {
                for _ in 0..<8 where !edit.exists || !edit.isHittable {
                    app.scrollViews["together-section-intentions"].swipeUp(velocity: .slow)
                }
            }
            revealFlowElement(edit, in: app)
            edit.tap()
            revealFlowElement(choose, in: app)
            XCTAssertEqual(choose.label, exactSummary, "Publishing and reopening retains the summary")
            XCTAssertFalse(startPicker.exists)
            choose.tap()
            XCTAssertEqual(starts.count, 1)
            XCTAssertEqual(exactTimeValue(startPicker), selectedStart, "Publishing retains the exact time")
            app.buttons["intent-time-picker-cancel"].tap()
            app.terminate()
        }
    }

    @MainActor
    private func exactTimeValue(_ picker: XCUIElement) -> [String] {
        let values = picker.buttons.allElementsBoundByIndex.map(\.label)
        XCTAssertFalse(values.isEmpty, picker.debugDescription)
        return values
    }

    @MainActor
    func testUndatedOpportunityRequiresTimeBeforePlan() {
        let app = XCUIApplication()
        app.launchArguments = ["--ui-testing-authenticated", "--ui-testing-skip-tutorial", "--ui-testing-chats",
            "--ui-testing-flexible-timing", "--ui-testing-language=zh-Hans"]
        app.launch()
        let row = app.descendants(matching: .any)["inbox-row-ui-connection-leo"]
        XCTAssertTrue(row.waitForExistence(timeout: 8))
        row.tap()
        let propose = app.buttons["mutual-opportunity-propose-plan-ui-flexible-opportunity"]
        XCTAssertTrue(propose.waitForExistence(timeout: 8))
        propose.tap()
        let send = app.buttons["plan-create-submit"]
        XCTAssertTrue(send.waitForExistence(timeout: 5))
        XCTAssertFalse(send.isEnabled)
        let confirm = app.switches["plan-confirm-timing"]
        revealFlowElement(confirm, in: app)
        XCTAssertTrue(confirm.exists)
        saveScreenshot(app: app, name: "flexible-plan-before-confirmation")
        confirm.tap()
        XCTAssertTrue(send.isEnabled)
        send.tap()
        XCTAssertTrue(send.waitForNonExistence(timeout: 5))
        app.terminate()
    }

    @MainActor
    func testSystemAvatarSelectionLightDarkAndLargeType() {
        for (language, appearance, largeType) in [("zh-Hans", "light", false), ("de", "dark", true)] {
            let app = XCUIApplication()
            app.launchArguments = [
                "--ui-testing-authenticated", "--ui-testing-skip-tutorial",
                "--ui-testing-language=\(language)", "--ui-testing-appearance=\(appearance)",
            ]
            if largeType { app.launchArguments.append("--ui-testing-dynamic-type-accessibility") }
            app.launch()
            let me = tabButton(in: app, labels: ["Me", "我", "Ich"])
            XCTAssertTrue(me.waitForExistence(timeout: 8))
            me.tap()
            let edit = app.buttons["profile-change-photo"]
            XCTAssertTrue(edit.waitForExistence(timeout: 8))
            edit.tap()
            let first = app.buttons["system-avatar-p01"]
            XCTAssertTrue(first.waitForExistence(timeout: 5))
            revealSystemAvatar(first, in: app)
            first.tap()
            XCTAssertGreaterThanOrEqual(first.frame.height, 44)
            if largeType { XCTAssertGreaterThan(first.frame.height, 100) }
            XCTAssertTrue(first.isSelected)
            XCTAssertTrue(app.buttons["profile-choose-photo"].exists)
            saveScreenshot(app: app, name: "system-avatars-\(language)-\(appearance)")
            let save = app.buttons["system-avatar-save"]
            XCTAssertTrue(save.isEnabled)
            XCTAssertTrue(save.isHittable)
            save.tap()
            XCTAssertTrue(save.waitForNonExistence(timeout: 5))
            saveScreenshot(app: app, name: "system-avatar-profile-\(language)-\(appearance)")
            edit.tap()
            XCTAssertTrue(first.waitForExistence(timeout: 5))
            XCTAssertTrue(first.isSelected)
            XCTAssertFalse(app.buttons["system-avatar-save"].isEnabled)
            let last = app.buttons["system-avatar-p20"]
            revealSystemAvatar(last, in: app)
            last.tap()
            XCTAssertTrue(last.isSelected)
            saveScreenshot(app: app, name: "system-avatars-last-\(language)-\(appearance)")
            app.buttons[language == "zh-Hans" ? "取消" : "Abbrechen"].tap()
            edit.tap()
            XCTAssertTrue(first.waitForExistence(timeout: 5))
            XCTAssertTrue(first.isSelected, "Cancel must leave the saved avatar unchanged")
            app.terminate()
        }
    }

    @MainActor
    private func revealSystemAvatar(_ avatar: XCUIElement, in app: XCUIApplication) {
        // XCTest can report offscreen grid cells behind the pinned dock as hittable.
        let dock = app.buttons["system-avatar-save"]
        for _ in 0..<20 {
            if avatar.exists && avatar.frame.maxY < dock.frame.minY - 16 { break }
            let startY = min(0.7, (dock.frame.minY - 36) / app.frame.height)
            app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: startY))
                .press(forDuration: 0.05, thenDragTo:
                    app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.3)))
        }
        XCTAssertTrue(avatar.isHittable)
        XCTAssertLessThan(avatar.frame.maxY, dock.frame.minY - 16)
    }

    @MainActor
    func testRelatedActivityFitInThreeLanguages() {
        let id = "cmutualui0000000000000001"
        for (language, largeType) in [("zh-Hans", false), ("en", false), ("de", false), ("zh-Hans", true)] {
            let app = XCUIApplication()
            app.launchArguments = ["--ui-testing-authenticated", "--ui-testing-skip-tutorial",
                "--ui-testing-ephemeral-credentials", "--ui-testing-local-api",
                "--ui-testing-discover", "--ui-testing-weekly-intent", "--ui-testing-mutual-opportunity",
                "--ui-testing-related-activity", "--ui-testing-together-matching",
                "--ui-testing-language=\(language)", "--ui-testing-appearance=\(language == "de" ? "dark" : "light")"]
            if largeType { app.launchArguments.append("--ui-testing-dynamic-type-accessibility") }
            app.launchEnvironment["SIDESEAT_API_BASE_URL_OVERRIDE"] = "http://127.0.0.1:9"
            app.launch()
            let activity = app.descendants(matching: .any)["mutual-opportunity-activity-\(id)"].firstMatch
            XCTAssertTrue(activity.waitForExistence(timeout: 8))
            XCTAssertFalse(activity.label.contains("喝咖啡"))
            XCTAssertTrue(activity.label.contains("咖啡聊聊"))
            let time = app.descendants(matching: .any)["mutual-opportunity-time-\(id)"].firstMatch
            revealCompactCue(time, in: app)
            XCTAssertTrue(time.label.contains("–"))
            XCTAssertFalse(app.buttons["mutual-opportunity-fit-details-\(id)"].exists)
            XCTAssertFalse(app.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", "60/100")).firstMatch.exists)
            saveScreenshot(app: app, name: "compact-related-\(language)\(largeType ? "-large" : "")")
            app.terminate()
        }
    }

    @MainActor
    func testOpportunityBookmarkAndSendMessage() {
        let id = "cmutualui0000000000000001"
        let app = togetherApp(["--ui-testing-opportunity-list", "--ui-testing-language=zh-Hans", "--ui-testing-appearance=light"])
        let bookmark = app.buttons["mutual-opportunity-bookmark-\(id)"]
        revealFlowElement(bookmark, in: app)
        XCTAssertEqual(bookmark.label, "收藏意愿")
        XCTAssertTrue(app.descendants(matching: .any)["mutual-opportunity-campus-\(id)"].firstMatch.exists)
        XCTAssertTrue(app.descendants(matching: .any)["mutual-opportunity-language-\(id)"].firstMatch.exists)
        XCTAssertTrue(app.staticTexts["mutual-opportunity-description-\(id)"].exists)
        bookmark.tap()
        XCTAssertTrue(bookmark.waitForExistence(timeout: 5))
        XCTAssertEqual(bookmark.label, "取消收藏")
        XCTAssertTrue(app.buttons["together-tab-recommendations"].isSelected)
        let savedToggle = app.buttons["together-tab-bookmarks"]
        XCTAssertTrue(savedToggle.isHittable)
        savedToggle.tap()
        XCTAssertFalse(app.descendants(matching: .any)["mutual-opportunity-cmutualui0000000000000002"].exists)
        let message = app.buttons["mutual-opportunity-message-\(id)"]
        revealFlowElement(message, in: app)
        saveScreenshot(app: app, name: "opportunity-bookmark-message-zh")
        message.tap()
        let submit = app.buttons["opportunity-message-submit"]
        XCTAssertTrue(submit.waitForExistence(timeout: 5))
        XCTAssertFalse(submit.isEnabled)
        let input = app.textFields["opportunity-message-body"]
        XCTAssertTrue(input.waitForExistence(timeout: 3))
        input.tap(); input.typeText("Hi, tomorrow afternoon works for me!")
        saveScreenshot(app: app, name: "opportunity-message-composer-zh")
        submit.tap()
        XCTAssertTrue(app.descendants(matching: .any)["intention-chat"].waitForExistence(timeout: 5))
        XCTAssertEqual(app.staticTexts["intention-chat-first-message"].label, "Hi, tomorrow afternoon works for me!")
        XCTAssertTrue(app.descendants(matching: .any)["intention-chat-waiting"].exists, app.debugDescription)
        XCTAssertFalse(app.buttons["chat-composer-send"].exists)
        saveScreenshot(app: app, name: "intention-chat-waiting-zh")
        app.buttons["intention-chat-context"].tap()
        XCTAssertTrue(app.descendants(matching: .any)["intention-details-sheet"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["mutual-opportunity-description-\(id)"].exists)
        XCTAssertFalse(app.buttons["mutual-opportunity-open-\(id)"].exists)
        saveScreenshot(app: app, name: "intention-chat-details-zh")
        app.buttons["intention-details-done"].tap()
        XCTAssertEqual(app.staticTexts["intention-chat-first-message"].label, "Hi, tomorrow afternoon works for me!")
        app.navigationBars.buttons.firstMatch.tap()
        let viewChat = app.buttons["mutual-opportunity-open-\(id)"]
        revealFlowElement(viewChat, in: app)
        XCTAssertEqual(viewChat.label, "查看聊天")
        XCTAssertFalse(message.exists)
        saveScreenshot(app: app, name: "opportunity-view-chat-zh")
        selectTogetherSection(0, in: app)
        XCTAssertFalse(app.descendants(matching: .any)["mutual-opportunity-\(id)"].exists)
        XCTAssertTrue(app.buttons["mutual-opportunity-message-cmutualui0000000000000002"].exists)
        selectTogetherSection(2, in: app)
        XCTAssertTrue(viewChat.waitForExistence(timeout: 5))
        viewChat.tap()
        XCTAssertTrue(app.staticTexts["intention-chat-first-message"].waitForExistence(timeout: 5))
        app.navigationBars.buttons.firstMatch.tap()
        tabButton(in: app, labels: ["消息"]).tap()
        app.buttons["inbox-message-requests"].tap()
        XCTAssertTrue(app.descendants(matching: .any)["message-requests-list"].waitForExistence(timeout: 5))
        saveScreenshot(app: app, name: "message-requests-outgoing-zh")
        let conversation = app.buttons["message-request-\(id)"]
        XCTAssertTrue(conversation.waitForExistence(timeout: 5))
        conversation.tap()
        XCTAssertTrue(app.staticTexts["intention-chat-first-message"].waitForExistence(timeout: 5))
        app.terminate()
    }


    @MainActor
    func testOpportunityBookmarkAtLargeText() {
        let app = togetherApp(["--ui-testing-language=de", "--ui-testing-appearance=dark", "--ui-testing-dynamic-type-accessibility"])
        let id = "cmutualui0000000000000001"
        let message = app.buttons["mutual-opportunity-message-\(id)"]
        let scroll = app.scrollViews["together-section-recommendations"]
        // Target the active page explicitly: the expanded card can span several screens.
        for _ in 0..<10 {
            if message.isHittable { break }
            scroll.swipeUp(velocity: .slow)
        }
        XCTAssertTrue(message.isHittable)
        XCTAssertGreaterThanOrEqual(message.frame.height, 44)
        let bookmark = app.buttons["mutual-opportunity-bookmark-\(id)"]
        for _ in 0..<10 {
            if bookmark.isHittable { break }
            scroll.swipeDown(velocity: .slow)
        }
        XCTAssertTrue(bookmark.isHittable)
        XCTAssertGreaterThanOrEqual(bookmark.frame.height, 44)
        saveScreenshot(app: app, name: "opportunity-bookmark-message-large-de")
        app.terminate()
    }

    @MainActor
    func testIncomingOpportunityMessageReplyAndIgnore() {
        let id = "cmutualui0000000000000001"
        for reply in [false, true] {
            let app = togetherApp(["--ui-testing-message-request", "--ui-testing-language=zh-Hans"])
            tabButton(in: app, labels: ["Messages", "消息", "Nachrichten"]).tap()
            let entry = app.buttons["inbox-message-requests"]
            XCTAssertTrue(entry.waitForExistence(timeout: 5))
            XCTAssertEqual(entry.value as? String, "1")
            XCTAssertFalse(app.buttons["message-request-\(id)"].exists)
            entry.tap()
            XCTAssertTrue(app.descendants(matching: .any)["message-requests-list"].waitForExistence(timeout: 5))
            saveScreenshot(app: app, name: "message-requests-incoming-zh")
            let conversation = app.buttons["message-request-\(id)"]
            XCTAssertTrue(conversation.waitForExistence(timeout: 8))
            conversation.tap()
            XCTAssertTrue(app.staticTexts["intention-chat-first-message"].waitForExistence(timeout: 5))
            saveScreenshot(app: app, name: "opportunity-message-incoming-zh")
            if reply {
                let input = app.textViews["chat-composer-field"]
                XCTAssertTrue(input.waitForExistence(timeout: 5), app.debugDescription)
                input.tap(); input.typeText("Yes, see you at 3 pm!")
                app.buttons["chat-composer-send"].tap()
                XCTAssertTrue(app.descendants(matching: .any)["direct-chat"].waitForExistence(timeout: 8))
                XCTAssertTrue(app.staticTexts["Yes, see you at 3 pm!"].exists)
                let context = app.buttons["conversation-context-bar"]
                XCTAssertTrue(context.waitForExistence(timeout: 5))
                context.tap()
                XCTAssertTrue(app.descendants(matching: .any)["mutual-opportunity-\(id)"].waitForExistence(timeout: 5))
                saveScreenshot(app: app, name: "intention-chat-accepted-details-zh")
            } else {
                app.buttons["message-request-ignore-\(id)"].tap()
                XCTAssertTrue(conversation.waitForNonExistence(timeout: 5))
                XCTAssertTrue(app.descendants(matching: .any)["message-requests-empty"].waitForExistence(timeout: 5))
                app.navigationBars.buttons.firstMatch.tap()
                XCTAssertEqual(app.buttons["inbox-message-requests"].value as? String, "0")
            }
            app.terminate()
        }
    }


    @MainActor
    private func addIntentionButton(in app: XCUIApplication) -> XCUIElement {
        app.buttons.matching(NSPredicate(format: "identifier IN %@",
            ["together-add-intent", "together-add-first-intent"])).firstMatch
    }

    @MainActor
    private func togetherApp(_ extra: [String] = [], findMore: Bool = true) -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments = ["--ui-testing-authenticated", "--ui-testing-skip-tutorial",
            "--ui-testing-discover", "--ui-testing-weekly-intent", "--ui-testing-mutual-opportunity",
            "--ui-testing-automatic-matching", "--ui-testing-together-matching",
            "--ui-testing-flexible-timing", "--ui-testing-discovery-matching",
            "--ui-testing-ephemeral-credentials", "--ui-testing-local-api"] + extra
        app.launchEnvironment["SIDESEAT_API_BASE_URL_OVERRIDE"] = "http://127.0.0.1:9"
        app.launch()
        if extra.contains("--ui-testing-chats") {
            tabButton(in: app, labels: ["Together", "同行", "Zusammen"]).tap()
        }
        XCTAssertTrue(app.descendants(matching: .any)["together-home"].waitForExistence(timeout: 8))
        // Most flow fixtures exercise already requested recommendations.
        if findMore && extra.contains("--ui-testing-explore-intents") {
            let more = app.buttons["together-find-more"]
            revealFlowElement(more, in: app)
            more.tap()
            let result = extra.contains("--ui-testing-explore-empty")
                ? app.descendants(matching: .any)["explore-intents-empty"]
                : app.buttons["explore-bookmark-ui-explore-0"]
            XCTAssertTrue(result.waitForExistence(timeout: 5))
        }
        return app
    }

    @MainActor
    private func selectTogetherSection(_ index: Int, in app: XCUIApplication) {
        let raw = ["recommendations", "intentions", "bookmarks"][index]
        let button = app.buttons["together-tab-\(raw)"].firstMatch
        if button.waitForExistence(timeout: 2) { button.tap() }
        else {
            let picker = app.descendants(matching: .any)["together-segmented-control"].firstMatch
            XCTAssertTrue(picker.waitForExistence(timeout: 5), app.debugDescription)
            picker.buttons.element(boundBy: [1, 0, 2][index]).tap()
        }
    }

    @MainActor
    func testTogetherCategoryHeaderBandsLightAndDark() {
        let cards = [
            ("recommendations", "mutual-opportunity-cmutualui0000000000000001", "mutual-opportunity-peer-cmutualui0000000000000001"),
            ("intentions", "weekly-intent-ui-intent-coffee", "weekly-intent-edit-ui-intent-coffee"),
            ("explore", "explore-intent-ui-explore-0", "explore-intent-header-ui-explore-0"),
        ]
        for appearance in ["light", "dark"] {
            let app = togetherApp(["--ui-testing-intent-card-states", "--ui-testing-explore-intents",
                "--ui-testing-language=zh-Hans", "--ui-testing-appearance=\(appearance)"])
            for (index, (section, cardID, headerID)) in cards.enumerated() {
                selectTogetherSection(index == 2 ? 0 : index, in: app)
                let card = app.descendants(matching: .any)[cardID].firstMatch
                let header = app.descendants(matching: .any)[headerID].firstMatch
                revealFlowElement(header, in: app)
                XCTAssertTrue(header.waitForExistence(timeout: 5))
                XCTAssertEqual(header.frame.minX, card.frame.minX, accuracy: 1)
                XCTAssertEqual(header.frame.minY, card.frame.minY, accuracy: 1)
                XCTAssertEqual(header.frame.width, card.frame.width, accuracy: 1)
                XCTAssertLessThan(header.frame.height, card.frame.height / 2, "Category color belongs to the top row, not the entire card")
                saveScreenshot(app: app, name: "category-header-\(section)-\(appearance)")
            }
            app.terminate()
        }
    }

    @MainActor
    func testRecommendationLoadingWaitsForCardsAndKeepsExistingContent() {
        let app = togetherApp(["--ui-testing-explore-intents", "--ui-testing-recommendation-slow",
            "--ui-testing-language=zh-Hans"], findMore: false)
        let skeleton = app.descendants(matching: .any)["recommendation-loading"].firstMatch
        let more = app.buttons["together-find-more"]
        XCTAssertTrue(skeleton.exists)
        XCTAssertFalse(more.exists, "More must not appear before the first batch finishes")
        saveScreenshot(app: app, name: "recommendation-first-loading-zh")
        XCTAssertTrue(more.waitForExistence(timeout: 10))
        XCTAssertFalse(skeleton.exists)
        let card = app.descendants(matching: .any)["mutual-opportunity-cmutualui0000000000000001"].firstMatch
        XCTAssertTrue(card.exists)
        revealFlowElement(more, in: app)
        more.tap()
        XCTAssertFalse(more.isEnabled)
        XCTAssertEqual(more.label, "正在加载推荐…")
        XCTAssertTrue(card.exists, "Loading more must retain the existing recommendation")
        saveScreenshot(app: app, name: "recommendation-more-loading-zh")
        XCTAssertTrue(app.buttons["explore-bookmark-ui-explore-0"].waitForExistence(timeout: 10))
        XCTAssertTrue(card.exists)
        app.terminate()
    }

    @MainActor
    func testRecommendationInitialFailureCanRetryWithoutShowingMore() {
        let app = togetherApp(["--ui-testing-explore-intents", "--ui-testing-recommendation-load-error",
            "--ui-testing-language=zh-Hans"], findMore: false)
        let retry = app.buttons["recommendation-retry"].firstMatch
        XCTAssertTrue(retry.waitForExistence(timeout: 5))
        XCTAssertFalse(app.buttons["together-find-more"].exists)
        saveScreenshot(app: app, name: "recommendation-load-error-zh")
        retry.tap()
        XCTAssertTrue(app.buttons["together-find-more"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.descendants(matching: .any)["mutual-opportunity-cmutualui0000000000000001"].exists)
        XCTAssertFalse(retry.exists)
        app.terminate()
    }

    @MainActor
    func testRecommendationRefreshFailureKeepsCardsOnReturn() {
        let app = togetherApp(["--ui-testing-explore-intents", "--ui-testing-recommendation-refresh-error",
            "--ui-testing-language=zh-Hans"], findMore: false)
        let card = app.descendants(matching: .any)["mutual-opportunity-cmutualui0000000000000001"].firstMatch
        XCTAssertTrue(card.waitForExistence(timeout: 5))
        tabButton(in: app, labels: ["Calendar", "日历", "Kalender"]).tap()
        tabButton(in: app, labels: ["Together", "同行", "Zusammen"]).tap()
        XCTAssertTrue(card.exists)
        XCTAssertFalse(app.descendants(matching: .any)["recommendation-loading"].exists)
        let retry = app.buttons["recommendation-retry"].firstMatch
        XCTAssertTrue(retry.waitForExistence(timeout: 5))
        revealFlowElement(retry, in: app)
        saveScreenshot(app: app, name: "recommendation-refresh-error-zh")
        XCTAssertTrue(card.exists)
        app.terminate()
    }

    @MainActor
    func testRecommendationsSearchOnDemandWithTierLimits() {
        for plus in [false, true] {
            let extra = ["--ui-testing-explore-intents", "--ui-testing-language=zh-Hans"]
                + (plus ? ["--ui-testing-explore-plus"] : [])
            let app = togetherApp(extra, findMore: false)
            XCTAssertFalse(app.descendants(matching: .any)["together-finding-summary"].exists)
            XCTAssertFalse(app.buttons["explore-bookmark-ui-explore-0"].exists)
            XCTAssertFalse(app.staticTexts["更多意愿"].exists)
            let more = app.buttons["together-find-more"]
            revealFlowElement(more, in: app)
            XCTAssertEqual(more.label, "寻找更多推荐")
            saveScreenshot(app: app, name: "recommendations-find-more-zh")
            more.tap()
            XCTAssertTrue(app.buttons["explore-bookmark-ui-explore-0"].waitForExistence(timeout: 5))
            XCTAssertFalse(app.staticTexts["更多意愿"].exists)
            let limit = plus ? 10 : 5
            for index in 0..<limit {
                let cardAction = app.buttons["explore-bookmark-ui-explore-\(index)"]
                revealFlowElement(cardAction, in: app)
                XCTAssertTrue(cardAction.exists, "Each allowed search result should be available")
            }
            XCTAssertFalse(app.buttons["explore-bookmark-ui-explore-\(limit)"].exists)
            XCTAssertFalse(app.textFields["explore-search"].exists)
            revealFlowElement(more, in: app)
            XCTAssertEqual(more.label, "重新寻找")
            saveScreenshot(app: app, name: plus ? "recommendations-plus-results-zh" : "recommendations-free-results-zh")
            app.terminate()
        }
    }


    @MainActor
    func testExploreBookmarkStaysInFeedForContinuedBrowsing() {
        let app = togetherApp(["--ui-testing-explore-intents", "--ui-testing-language=en"])
        let interest = app.buttons["explore-bookmark-ui-explore-0"]
        revealFlowElement(interest, in: app)
        interest.tap()
        let id = "ui-explore-opportunity-ui-explore-0"
        let heart = app.buttons["mutual-opportunity-bookmark-\(id)"]
        XCTAssertTrue(app.buttons["together-tab-recommendations"].isSelected)
        XCTAssertTrue(interest.waitForNonExistence(timeout: 5))
        XCTAssertTrue(heart.waitForExistence(timeout: 5))
        XCTAssertEqual(heart.label, "Remove bookmark")
        XCTAssertTrue(heart.isHittable)
        saveScreenshot(app: app, name: "interest-stays-in-exploration-en")
        let next = app.buttons["explore-bookmark-ui-explore-1"]
        revealFlowElement(next, in: app)
        XCTAssertTrue(next.isHittable)
        selectTogetherSection(2, in: app)
        XCTAssertTrue(heart.waitForExistence(timeout: 5))
        XCTAssertEqual(heart.label, "Remove bookmark")
        saveScreenshot(app: app, name: "interest-saved-manual-entry-en")
        heart.tap()
        XCTAssertTrue(heart.waitForNonExistence(timeout: 5))
        selectTogetherSection(0, in: app)
        revealFlowElement(heart, in: app)
        XCTAssertEqual(heart.label, "Bookmark intention")
        app.terminate()
    }


    @MainActor
    func testExploreGreetingOpensComposerWithoutSavingOrSendingOnCancel() {
        let app = togetherApp(["--ui-testing-explore-intents", "--ui-testing-language=zh-Hans"])
        let greeting = app.buttons["explore-message-ui-explore-0"]
        revealFlowElement(greeting, in: app)
        XCTAssertTrue(app.buttons["explore-bookmark-ui-explore-0"].isHittable)
        saveScreenshot(app: app, name: "explore-unified-actions-zh")
        greeting.tap()
        let submit = app.buttons["opportunity-message-submit"]
        XCTAssertTrue(submit.waitForExistence(timeout: 5))
        XCTAssertFalse(submit.isEnabled)
        app.navigationBars.buttons["取消"].tap()
        let id = "ui-explore-opportunity-ui-explore-0"
        let heart = app.buttons["mutual-opportunity-bookmark-\(id)"]
        revealFlowElement(heart, in: app)
        XCTAssertEqual(heart.label, "收藏意愿")
        XCTAssertFalse(app.descendants(matching: .any)["mutual-opportunity-message-sent-\(id)"].firstMatch.exists)
        let message = app.buttons["mutual-opportunity-message-\(id)"]
        message.tap()
        let input = app.textFields["opportunity-message-body"]
        XCTAssertTrue(input.waitForExistence(timeout: 5), app.debugDescription)
        input.tap(); input.typeText("Hi, can I join you tomorrow?")
        submit.tap()
        XCTAssertTrue(app.descendants(matching: .any)["intention-chat"].waitForExistence(timeout: 5))
        XCTAssertEqual(app.staticTexts["intention-chat-first-message"].label, "Hi, can I join you tomorrow?")
        app.navigationBars.buttons.firstMatch.tap()
        XCTAssertFalse(heart.exists)
        XCTAssertFalse(app.buttons["mutual-opportunity-open-\(id)"].exists)
        let replacement = app.buttons["explore-message-ui-explore-5"]
        revealFlowElement(replacement, in: app)
        XCTAssertTrue(replacement.waitForExistence(timeout: 5))
        XCTAssertEqual(app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH %@", "explore-message-ui-explore-")).count, 5)
        saveScreenshot(app: app, name: "recommendations-after-greeting-zh")
        selectTogetherSection(2, in: app)
        XCTAssertTrue(app.staticTexts["还没有收藏"].waitForExistence(timeout: 5))
        tabButton(in: app, labels: ["消息"]).tap()
        app.buttons["inbox-message-requests"].tap()
        XCTAssertTrue(app.descendants(matching: .any)["message-requests-list"].waitForExistence(timeout: 5))
        saveScreenshot(app: app, name: "message-requests-outgoing-zh")
        let conversation = app.buttons["message-request-\(id)"]
        XCTAssertTrue(conversation.waitForExistence(timeout: 5))
        conversation.tap()
        XCTAssertEqual(app.staticTexts["intention-chat-first-message"].label, "Hi, can I join you tomorrow?")
        app.terminate()
    }

    @MainActor
    func testStudyIntentionInLocalPreviewSurvivesRefreshAndSecondCreation() {
        let app = XCUIApplication()
        app.launchArguments = [
            "--ui-testing-authenticated", "--ui-testing-skip-tutorial",
            "--ui-testing-discover", "--ui-testing-weekly-intent",
            "--ui-testing-mutual-opportunity", "--ui-testing-together-matching",
            "--ui-testing-ephemeral-credentials", "--ui-testing-local-api",
            "--ui-testing-language=en", "--ui-testing-appearance=light",
            "-UIPreferredContentSizeCategoryName", "UICTContentSizeCategoryL",
        ]
        // A preview mutation must succeed locally without a backend or saved login.
        app.launchEnvironment["SIDESEAT_API_BASE_URL_OVERRIDE"] = "http://127.0.0.1:9"
        app.launch()
        selectTogetherSection(1, in: app)

        for (index, goal) in ["Review calculus", "Prepare physics exam"].enumerated() {
            addIntentionButton(in: app).tap()
            XCTAssertFalse(app.buttons["intent-editor-next"].exists)
            XCTAssertFalse(app.buttons["intent-editor-back"].exists)
            XCTAssertTrue(app.buttons["intent-editor-save"].isEnabled)
            selectIntentionTopic("Study", in: app)
            let input = app.descendants(matching: .any)["intent-editor-activity"].firstMatch
            revealFlowElement(input, in: app)
            input.tap()
            input.typeText(goal)
            XCTAssertTrue(app.buttons["intent-editor-save"].isEnabled)
            app.buttons["intent-editor-save"].tap()
            XCTAssertTrue(app.descendants(matching: .any)["intent-editor"].waitForNonExistence(timeout: 5))
            let suffix = index == 0 ? "" : "-2"
            let edit = app.buttons["weekly-intent-edit-ui-intent-created\(suffix)"]
            XCTAssertTrue(edit.waitForExistence(timeout: 5), "Saving must add the new study intention to the list")
            let list = app.scrollViews["together-section-intentions"]
            list.swipeDown()
            XCTAssertTrue(edit.waitForExistence(timeout: 5), "Refreshing must not reset the preview to its empty seed")
            edit.tap()
            XCTAssertTrue(app.buttons["intent-editor-save"].waitForExistence(timeout: 5))
            revealFlowElement(input, in: app)
            XCTAssertEqual(input.value as? String, goal)
            app.buttons["intent-editor-save"].tap()
            XCTAssertTrue(app.descendants(matching: .any)["intent-editor"].waitForNonExistence(timeout: 5))
        }

        for id in ["ui-intent-created", "ui-intent-created-2"] {
            let card = app.descendants(matching: .any)["weekly-intent-\(id)"].firstMatch
            revealFlowElement(card, in: app)
            XCTAssertTrue(card.exists, "Adding another intention must preserve the first")
        }
        saveScreenshot(app: app, name: "study-intentions-retained-after-refresh")
        app.terminate()
    }

    @MainActor
    func testAllActivitiesPublishWithoutDetails() {
        for topic in ["Coffee", "Study", "Sports", "Explore", "Food", "Events"] {
            let app = togetherApp(["--ui-testing-language=en", "--ui-testing-appearance=light",
                "-UIPreferredContentSizeCategoryName", "UICTContentSizeCategoryL"])
            selectTogetherSection(1, in: app)
            addIntentionButton(in: app).tap()
            selectIntentionTopic(topic, in: app)
            let input = app.descendants(matching: .any)["intent-editor-activity"].firstMatch
            let save = app.buttons["intent-editor-save"]
            let editor = app.descendants(matching: .any)["intent-editor"].firstMatch
            let edit = app.buttons["weekly-intent-edit-ui-intent-created"]
            XCTAssertEqual(input.value as? String, "")
            XCTAssertTrue(save.isEnabled, "Selecting \(topic) is sufficient to publish")
            XCTAssertFalse(app.keyboards.firstMatch.exists)
            XCTAssertTrue(app.buttons["intent-timing-choose"].exists)
            saveScreenshot(app: app, name: "minimal-intention-\(topic.lowercased())")
            save.tap()
            XCTAssertTrue(editor.waitForNonExistence(timeout: 5))
            XCTAssertTrue(edit.waitForExistence(timeout: 5))
            app.scrollViews["together-section-intentions"].swipeDown()
            edit.tap()
            XCTAssertTrue(app.descendants(matching: .any)["intent-editor-topic"].firstMatch.buttons[topic].isSelected)
            XCTAssertEqual(input.value as? String, "")
            if ["Coffee", "Study", "Sports"].contains(topic) {
                input.tap()
                input.typeText("Some details")
                save.tap()
                XCTAssertTrue(editor.waitForNonExistence(timeout: 5))
                edit.tap()
                XCTAssertEqual(input.value as? String, "Some details")
                replaceIntentionText(input, with: "\n", in: app)
                XCTAssertTrue(save.isEnabled, "Existing details can be cleared")
                save.tap()
                XCTAssertTrue(editor.waitForNonExistence(timeout: 5))
                edit.tap()
                XCTAssertEqual(input.value as? String, "")
            }
            app.navigationBars.buttons["Cancel"].tap()
            XCTAssertTrue(editor.waitForNonExistence(timeout: 5))
            app.terminate()
        }
    }

    @MainActor
    func testCoffeeIntentionSinglePageLifecycle() {
        verifySinglePageIntention(topic: "coffee", initial: "Coffee after class", edited: "Coffee on campus")
    }

    @MainActor
    func testStudyIntentionSinglePageLifecycle() {
        verifySinglePageIntention(topic: "study", initial: "Review calculus", edited: "Prepare algebra exam")
    }

    @MainActor
    func testSportsIntentionSinglePageLifecycle() {
        verifySinglePageIntention(topic: "sports", initial: "Cycling", edited: "Pickleball")
    }

    @MainActor
    func testExploreIntentionSinglePageLifecycle() {
        verifySinglePageIntention(topic: "explore", initial: "Visit a museum", edited: "Walk around the old town")
    }

    @MainActor
    func testFoodIntentionSinglePageLifecycle() {
        verifySinglePageIntention(topic: "food", initial: "Lunch at the canteen", edited: "Dinner near campus")
    }

    @MainActor
    func testEventsIntentionSinglePageLifecycle() {
        verifySinglePageIntention(topic: "events", initial: "Go to a concert", edited: "Visit a campus festival")
    }

    @MainActor
    private func selectIntentionTopic(_ title: String, in app: XCUIApplication) {
        let option = app.buttons.matching(NSPredicate(
            format: "identifier BEGINSWITH %@ AND label == %@", "intent-topic-", title
        )).firstMatch
        revealFlowElement(option, in: app, towardTop: true)
        XCTAssertTrue(option.waitForExistence(timeout: 3))
        option.tap()
        XCTAssertTrue(option.isSelected)
    }

    @MainActor
    private func verifySinglePageIntention(topic: String, initial: String, edited: String) {
        let app = togetherApp(["--ui-testing-language=en", "--ui-testing-appearance=light",
            "-UIPreferredContentSizeCategoryName", "UICTContentSizeCategoryL"])
        defer { app.terminate() }
        selectTogetherSection(1, in: app)
        let topicTitle = ["coffee": "Coffee", "study": "Study", "sports": "Sports",
                          "explore": "Explore", "food": "Food", "events": "Events"][topic]!
        let editor = app.descendants(matching: .any)["intent-editor"].firstMatch
        let save = app.buttons["intent-editor-save"]
        let input = app.descendants(matching: .any)["intent-editor-activity"].firstMatch
        let edit = app.buttons["weekly-intent-edit-ui-intent-created"]
        let status = app.staticTexts["weekly-intent-status-ui-intent-created"]

        addIntentionButton(in: app).tap()
        selectIntentionTopic(topicTitle, in: app)
        XCTAssertFalse(app.buttons["intent-editor-next"].exists)
        XCTAssertFalse(app.buttons["intent-editor-back"].exists)
        XCTAssertFalse(app.descendants(matching: .any)["intent-editor-note"].exists)
        XCTAssertFalse(app.buttons["intent-editor-course"].exists)
        XCTAssertFalse(app.buttons["intent-study-mode-parallel"].exists)
        XCTAssertFalse(app.descendants(matching: .any)["intent-editor-sport"].exists)
        XCTAssertFalse(app.descendants(matching: .any)["intent-editor-study-goal"].exists)
        XCTAssertTrue(save.isEnabled, "Every category can be published without details")
        revealFlowElement(input, in: app)
        input.tap()
        input.typeText(initial)
        XCTAssertTrue(save.isEnabled, "An undecided time allows direct saving")
        save.tap()
        XCTAssertTrue(editor.waitForNonExistence(timeout: 5))
        XCTAssertTrue(edit.waitForExistence(timeout: 5))
        XCTAssertEqual(status.label, "Finding company")

        edit.tap()
        XCTAssertTrue(save.waitForExistence(timeout: 5))
        XCTAssertTrue(app.descendants(matching: .any)["intent-editor-topic"].firstMatch.buttons[topicTitle].isSelected)
        revealFlowElement(input, in: app)
        XCTAssertEqual(input.value as? String, initial)
        replaceIntentionText(input, with: edited, in: app)
        XCTAssertEqual(input.value as? String, edited)
        save.tap()
        XCTAssertTrue(editor.waitForNonExistence(timeout: 5))
        app.scrollViews["together-section-intentions"].swipeDown()
        XCTAssertTrue(edit.waitForExistence(timeout: 5))
        edit.tap()
        XCTAssertTrue(save.waitForExistence(timeout: 5))
        revealFlowElement(input, in: app)
        XCTAssertEqual(input.value as? String, edited, "The shared description must survive save and refresh for every category")
        let undecided = app.buttons["intent-timing-choose"].firstMatch
        revealFlowElement(undecided, in: app)
        XCTAssertTrue(undecided.exists)
        app.navigationBars.buttons["Cancel"].tap()
        XCTAssertTrue(editor.waitForNonExistence(timeout: 5))

        saveScreenshot(app: app, name: "one-page-\(topic)-edited")
        app.buttons["weekly-intent-delete-ui-intent-created"].tap()
        XCTAssertFalse(editor.exists, "Delete must not open the editor")
        let confirm = app.buttons["Delete"].firstMatch
        XCTAssertTrue(confirm.waitForExistence(timeout: 3))
        confirm.tap()
        XCTAssertTrue(edit.waitForNonExistence(timeout: 5), "Deleting must remove the intention")
    }

    @MainActor
    private func replaceIntentionText(_ input: XCUIElement, with text: String, in app: XCUIApplication) {
        input.tap()
        input.press(forDuration: 1)
        // System edit menus follow the simulator language, independently of the app language.
        let selectAll = app.descendants(matching: .any).matching(
            NSPredicate(format: "label IN %@", ["Select All", "全选", "Alles auswählen"])
        ).firstMatch
        XCTAssertTrue(selectAll.waitForExistence(timeout: 3), app.debugDescription)
        selectAll.tap()
        input.typeText(text)
    }

    @MainActor
    func testIntentionEmojiTitleMatchesAPILimit() {
        let app = togetherApp(["--ui-testing-language=en", "--ui-testing-appearance=light",
            "-UIPreferredContentSizeCategoryName", "UICTContentSizeCategoryL"])
        defer { app.terminate() }
        selectTogetherSection(1, in: app)
        addIntentionButton(in: app).tap()
        let input = app.descendants(matching: .any)["intent-editor-activity"].firstMatch
        let save = app.buttons["intent-editor-save"]
        revealFlowElement(input, in: app)
        input.tap()
        input.typeText(String(repeating: "📚", count: 41))
        XCTAssertFalse(save.isEnabled, "41 emoji exceed the API's 80 UTF-16-unit limit")
        XCTAssertTrue(app.staticTexts["Use up to 80 characters."].isHittable)
        input.typeText(XCUIKeyboardKey.delete.rawValue)
        XCTAssertTrue(save.isEnabled)
        save.tap()
        XCTAssertTrue(app.descendants(matching: .any)["intent-editor"].waitForNonExistence(timeout: 5))
        app.buttons["weekly-intent-edit-ui-intent-created"].tap()
        revealFlowElement(input, in: app)
        XCTAssertEqual(input.value as? String, String(repeating: "📚", count: 40))
    }

    @MainActor
    func testIntentionExplainsTextLimitsAndPreservesInputWhileScrolling() {
        let app = togetherApp(["--ui-testing-intent-card-states", "--ui-testing-language=en",
            "--ui-testing-appearance=light", "-UIPreferredContentSizeCategoryName", "UICTContentSizeCategoryL"])
        selectTogetherSection(1, in: app)
        let add = addIntentionButton(in: app)
        XCTAssertTrue(add.waitForExistence(timeout: 3))
        add.tap()
        let save = app.buttons["intent-editor-save"]
        let activity = app.descendants(matching: .any)["intent-editor-activity"].firstMatch
        revealFlowElement(activity, in: app)
        activity.tap()
        activity.typeText(String(repeating: "a", count: 81))
        XCTAssertFalse(save.isEnabled)
        let activityGuidance = app.staticTexts["Use up to 80 characters."]
        XCTAssertTrue(activityGuidance.isHittable)
        XCTAssertLessThanOrEqual(activityGuidance.frame.maxY, app.keyboards.firstMatch.frame.minY + 1)
        XCTAssertLessThanOrEqual(activity.frame.maxY, activityGuidance.frame.minY - 8)
        XCTAssertTrue(app.navigationBars.buttons["intent-editor-save"].exists)
        saveScreenshot(app: app, name: "intention-activity-limit")
        activity.typeText(XCUIKeyboardKey.delete.rawValue)
        XCTAssertTrue(save.isEnabled)

        selectIntentionTopic("Sports", in: app)
        revealFlowElement(activity, in: app)
        XCTAssertEqual(activity.value as? String, String(repeating: "a", count: 80), "Switching category must retain the draft")
        XCTAssertFalse(save.isEnabled)
        replaceIntentionText(activity, with: String(repeating: "b", count: 61), in: app)
        XCTAssertFalse(save.isEnabled)
        XCTAssertTrue(app.staticTexts["Use up to 60 characters."].isHittable)
        activity.typeText(XCUIKeyboardKey.delete.rawValue)
        XCTAssertTrue(save.isEnabled)

        selectIntentionTopic("Study", in: app)
        revealFlowElement(activity, in: app)
        XCTAssertEqual(activity.value as? String, String(repeating: "b", count: 60))
        replaceIntentionText(activity, with: String(repeating: "c", count: 81), in: app)
        XCTAssertFalse(save.isEnabled)
        XCTAssertTrue(app.staticTexts["Use up to 80 characters."].isHittable)
        XCTAssertLessThanOrEqual(activity.frame.maxY, app.staticTexts["Use up to 80 characters."].frame.minY - 8)
        activity.typeText(XCUIKeyboardKey.delete.rawValue + "\n\n")
        XCTAssertTrue(save.isEnabled, "Submission trims trailing whitespace")
        let choose = app.buttons["intent-timing-choose"].firstMatch
        revealFlowElement(choose, in: app)
        choose.tap()
        let startPicker = app.datePickers.matching(NSPredicate(format: "identifier BEGINSWITH %@", "intent-time-start-")).firstMatch
        revealFlowElement(startPicker, in: app)
        let timing = exactTimeValue(startPicker)
        app.buttons["intent-time-picker-done"].tap()
        selectIntentionTopic("Food", in: app)
        revealFlowElement(activity, in: app)
        XCTAssertEqual(activity.value as? String, String(repeating: "c", count: 80) + "\n\n")
        revealFlowElement(choose, in: app)
        choose.tap()
        XCTAssertEqual(exactTimeValue(startPicker), timing, "Category changes must retain the selected time")
        app.buttons["intent-time-picker-cancel"].tap()
        save.tap()
        XCTAssertTrue(app.descendants(matching: .any)["intent-editor"].waitForNonExistence(timeout: 5))
    }

    @MainActor
    func testIntentionsSaveOnceWithoutSeparateFindingConfirmation() {
        let app = togetherApp(["--ui-testing-intent-card-states", "--ui-testing-explore-intents",
            "--ui-testing-language=en", "--ui-testing-appearance=light"])
        selectTogetherSection(1, in: app)
        XCTAssertTrue(app.buttons["weekly-intent-edit-ui-intent-coffee"].waitForExistence(timeout: 5))
        XCTAssertFalse(app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH %@", "weekly-intent-publish-")).firstMatch.exists)
        XCTAssertFalse(app.buttons["Review and start"].exists)
        let legacyStatus = app.staticTexts["weekly-intent-status-ui-intent-study"].firstMatch
        revealFlowElement(legacyStatus, in: app)
        XCTAssertEqual(legacyStatus.label, "Not finding yet", "Do not silently publish an old saved intention")
        saveScreenshot(app: app, name: "intentions-no-extra-confirmation")
        let edit = app.buttons["weekly-intent-edit-ui-intent-study"]
        revealFlowElement(edit, in: app)
        edit.tap()
        let save = app.buttons["intent-editor-save"]
        XCTAssertTrue(save.waitForExistence(timeout: 5))
        save.tap()
        XCTAssertTrue(app.descendants(matching: .any)["intent-editor"].waitForNonExistence(timeout: 5))
        revealFlowElement(legacyStatus, in: app)
        XCTAssertEqual(legacyStatus.label, "Finding company", "The single save must already enable finding")
        XCTAssertFalse(app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH %@", "weekly-intent-publish-")).firstMatch.exists)
        let pausedEdit = app.buttons["weekly-intent-edit-ui-intent-sports"]
        revealFlowElement(pausedEdit, in: app)
        pausedEdit.tap()
        XCTAssertTrue(app.buttons["intent-editor-save"].waitForExistence(timeout: 5))
        app.buttons["intent-editor-save"].tap()
        XCTAssertTrue(app.descendants(matching: .any)["intent-editor"].waitForNonExistence(timeout: 5))
        let pausedStatus = app.staticTexts["weekly-intent-status-ui-intent-sports"].firstMatch
        revealFlowElement(pausedStatus, in: app)
        XCTAssertEqual(pausedStatus.label, "Paused", "Saving edits must not undo a deliberate pause")
        XCTAssertFalse(app.buttons["weekly-intent-pause-ui-intent-sports"].exists)
        XCTAssertTrue(app.buttons["weekly-intent-delete-ui-intent-sports"].exists)
        XCTAssertFalse(app.staticTexts.matching(NSPredicate(format: "label BEGINSWITH %@", "Active until")).firstMatch.exists)
        app.terminate()
    }

    @MainActor
    func testTogetherCreatesPublicIntentionFromSectionHeading() {
        let app = togetherApp(["--ui-testing-intent-card-states", "--ui-testing-explore-intents",
            "--ui-testing-language=zh-Hans", "--ui-testing-appearance=light",
            "-UIPreferredContentSizeCategoryName", "UICTContentSizeCategoryL"])
        let add = addIntentionButton(in: app)
        selectTogetherSection(0, in: app)
        XCTAssertFalse(add.exists, "Recommendations have no intention-creation action")
        selectTogetherSection(2, in: app)
        XCTAssertFalse(add.exists, "Saved intentions have no creation action")
        selectTogetherSection(1, in: app)
        XCTAssertTrue(add.waitForExistence(timeout: 5))
        XCTAssertEqual(app.buttons.matching(identifier: "together-add-intent").count, 1)
        XCTAssertEqual(add.label, "添加意愿")
        XCTAssertFalse(app.navigationBars.buttons["together-add-intent"].exists)
        XCTAssertTrue(app.scrollViews["together-section-intentions"].buttons["together-add-intent"].exists)
        let heading = app.staticTexts["together-intentions-heading"]
        XCTAssertGreaterThan(add.frame.minX, heading.frame.maxX)
        XCTAssertEqual(add.frame.midY, heading.frame.midY, accuracy: 2)
        XCTAssertGreaterThan(add.frame.minY, app.descendants(matching: .any)["together-segmented-control"].firstMatch.frame.maxY)
        XCTAssertTrue(add.isHittable)
        saveScreenshot(app: app, name: "together-add-heading-zh")
        add.tap()
        selectIntentionTopic("咖啡", in: app)
        XCTAssertTrue(app.textFields["intent-editor-activity"].waitForExistence(timeout: 5))
        app.textFields["intent-editor-activity"].tap()
        app.textFields["intent-editor-activity"].typeText("Coffee after class")
        XCTAssertTrue(app.buttons["intent-editor-save"].waitForExistence(timeout: 5))
        XCTAssertFalse(app.switches["intent-explore-visible"].exists, "The form no longer exposes a visibility option")
        app.buttons["intent-editor-save"].tap()
        let created = app.descendants(matching: .any)["weekly-intent-ui-intent-created"].firstMatch
        XCTAssertTrue(created.waitForExistence(timeout: 5))
        XCTAssertGreaterThan(created.frame.minY, app.descendants(matching: .any)["together-segmented-control"].firstMatch.frame.maxY)
        XCTAssertLessThan(created.frame.minY, app.frame.height * 0.55, "A new intention is intentionally revealed at the top")
        revealFlowElement(created, in: app)
        let exploreViewport = app.descendants(matching: .any)["explore-intents-list"].firstMatch
        XCTAssertFalse(exploreViewport.exists && exploreViewport.frame.intersects(app.frame), "Explore must not be presented over My intentions")
        let status = app.staticTexts["weekly-intent-status-ui-intent-created"].firstMatch
        XCTAssertTrue(status.waitForExistence(timeout: 5))
        XCTAssertEqual(status.label, "正在寻找")
        XCTAssertFalse(app.buttons["weekly-intent-publish-ui-intent-created"].exists)
        XCTAssertFalse(app.buttons["together-start-matching"].exists)
        saveScreenshot(app: app, name: "together-created-intention-zh")
        app.terminate()
    }

    @MainActor
    func testTogetherFirstUseStartsWithIntentionsAndExploreEmptyIsIndependent() {
        let app = togetherApp(["--ui-testing-mutual-opportunity-empty", "--ui-testing-explore-empty",
            "--ui-testing-language=zh-Hans"])
        XCTAssertTrue(app.descendants(matching: .any)["together-set-intent"].waitForExistence(timeout: 5))
        XCTAssertFalse(app.descendants(matching: .any)["together-opportunities-empty"].exists)
        let add = app.buttons["together-add-first-intent"]
        XCTAssertFalse(app.buttons["together-add-intent"].exists, "The empty state has only one creation entry")
        XCTAssertFalse(app.navigationBars.buttons["together-add-intent"].exists)
        XCTAssertEqual(app.buttons.matching(identifier: "together-add-first-intent").count, 1)
        XCTAssertEqual(add.label, "添加第一个意愿")
        XCTAssertTrue(add.isHittable)
        saveScreenshot(app: app, name: "together-add-empty-zh")
        add.tap()
        XCTAssertTrue(app.descendants(matching: .any)["intent-editor"].waitForExistence(timeout: 5))
        app.buttons["取消"].tap()
        XCTAssertTrue(app.descendants(matching: .any)["intent-editor"].waitForNonExistence(timeout: 5))
        selectTogetherSection(2, in: app)
        XCTAssertFalse(add.exists)
        XCTAssertTrue(app.staticTexts["还没有收藏"].waitForExistence(timeout: 5))
        XCTAssertFalse(app.descendants(matching: .any)["together-set-intent"].exists)
        selectTogetherSection(0, in: app)
        XCTAssertFalse(add.exists)
        selectTogetherSection(1, in: app)
        XCTAssertTrue(app.descendants(matching: .any)["together-set-intent"].waitForExistence(timeout: 5))
        saveScreenshot(app: app, name: "together-tabs-first-use-zh")
        app.terminate()
    }

    @MainActor
    func testTogetherExploreUnavailableKeepsNavigation() {
        let app = togetherApp(["--ui-testing-discovery-published", "--ui-testing-language=en"])
        XCTAssertFalse(app.descendants(matching: .any)["explore-intents-list"].exists)
        selectTogetherSection(2, in: app)
        XCTAssertTrue(app.staticTexts["No saved intentions"].waitForExistence(timeout: 5))
        selectTogetherSection(1, in: app)
        XCTAssertTrue(app.descendants(matching: .any)["weekly-intent-ui-published-intent"].waitForExistence(timeout: 5))
        app.terminate()
    }


    @MainActor
    func testTogetherTabsEnglishDarkAndGermanLargestText() {
        for language in ["en", "de"] {
            var args = ["--ui-testing-intent-card-states", "--ui-testing-explore-intents",
                "--ui-testing-language=\(language)", "--ui-testing-appearance=dark"]
            if language == "de" { args.append("--ui-testing-dynamic-type-accessibility") }
            let app = togetherApp(args, findMore: false)
            selectTogetherSection(1, in: app)
            let add = addIntentionButton(in: app)
            XCTAssertTrue(add.waitForExistence(timeout: 5))
            revealFlowElement(add, in: app)
            XCTAssertTrue(add.isHittable)
            XCTAssertFalse(app.navigationBars.buttons["together-add-intent"].exists)
            XCTAssertGreaterThanOrEqual(add.frame.height, 44)
            XCTAssertGreaterThanOrEqual(add.frame.minX, app.frame.minX)
            XCTAssertLessThanOrEqual(add.frame.maxX, app.frame.maxX)
            saveScreenshot(app: app, name: "together-add-heading-\(language)-dark")
            add.tap()
            XCTAssertTrue(app.descendants(matching: .any)["intent-editor"].waitForExistence(timeout: 5))
            app.buttons[language == "de" ? "Abbrechen" : "Cancel"].tap()
            XCTAssertTrue(app.descendants(matching: .any)["intent-editor"].waitForNonExistence(timeout: 5))
            let edit = app.buttons["weekly-intent-edit-ui-intent-coffee"]
            revealFlowElement(edit, in: app)
            XCTAssertTrue(edit.isHittable)
            XCTAssertGreaterThanOrEqual(edit.frame.height, 44)
            XCTAssertLessThanOrEqual(edit.frame.maxX, app.frame.maxX)
            saveScreenshot(app: app, name: "together-tabs-intentions-\(language)-dark")
            selectTogetherSection(0, in: app)
            XCTAssertFalse(add.exists, "The add action belongs only to My intentions")
            selectTogetherSection(2, in: app)
            XCTAssertFalse(add.exists)
            saveScreenshot(app: app, name: "together-tabs-bookmarks-\(language)-dark")
            app.terminate()
        }
    }

    @MainActor
    func testMergedExplorationFreeTierAlsoStopsAtThree() {
        let app = togetherApp(["--ui-testing-explore-intents", "--ui-testing-language=en"])
        let third = app.buttons["explore-bookmark-ui-explore-2"]
        revealFlowElement(third, in: app)
        XCTAssertTrue(third.exists)
        XCTAssertFalse(app.buttons["explore-bookmark-ui-explore-3"].exists)
        app.terminate()
    }


    @MainActor
    func testEmptyExplorationDoesNotHideRecommendationsOrBookmarks() {
        let app = togetherApp(["--ui-testing-explore-intents", "--ui-testing-explore-empty", "--ui-testing-language=en"])
        let id = "cmutualui0000000000000001"
        let heart = app.buttons["mutual-opportunity-bookmark-\(id)"]
        revealFlowElement(heart, in: app)
        heart.tap()
        selectTogetherSection(2, in: app)
        XCTAssertTrue(heart.waitForExistence(timeout: 5))
        XCTAssertFalse(app.descendants(matching: .any)["explore-intents-empty"].exists)
        selectTogetherSection(0, in: app)
        revealFlowElement(heart, in: app)
        XCTAssertTrue(heart.exists)
        app.terminate()
    }


    @MainActor
    func testOpportunityMessageRetryPreservesText() {
        let app = togetherApp(["--ui-testing-opportunity-decision-failure", "--ui-testing-language=en"])
        let id = "cmutualui0000000000000001"
        let message = app.buttons["mutual-opportunity-message-\(id)"]
        revealFlowElement(message, in: app)
        message.tap()
        let input = app.textFields["opportunity-message-body"]
        XCTAssertTrue(input.waitForExistence(timeout: 5), app.debugDescription)
        input.tap(); input.typeText("Hello, I can join tomorrow.")
        app.buttons["opportunity-message-submit"].tap()
        XCTAssertTrue(app.staticTexts["opportunity-message-error"].waitForExistence(timeout: 5))
        XCTAssertEqual(input.value as? String, "Hello, I can join tomorrow.")
        app.buttons["opportunity-message-submit"].tap()
        XCTAssertTrue(app.descendants(matching: .any)["intention-chat"].waitForExistence(timeout: 5))
        app.terminate()
    }


    @MainActor
    func testOpportunityCardTopicsAndConsentStates() {
        let id = "cmutualui0000000000000001"
        let scenarios = [
            ("COFFEE", "NEEDS_DECISION", "light"),
            ("STUDY", "NEEDS_DECISION", "light"),
            ("SPORTS", "NEEDS_DECISION", "dark"),
            ("EXPLORE", "NEEDS_DECISION", "light"),
            ("FOOD", "NEEDS_DECISION", "dark"),
            ("EVENTS", "NEEDS_DECISION", "light"),
            ("COFFEE", "DECIDED", "light"),
            ("COFFEE", "READY_TO_COORDINATE", "dark"),
        ]
        for (topic, state, appearance) in scenarios {
            let app = XCUIApplication()
            app.launchArguments = [
                "--ui-testing-authenticated", "--ui-testing-skip-tutorial",
                "--ui-testing-discover", "--ui-testing-weekly-intent",
                "--ui-testing-mutual-opportunity", "--ui-testing-together-matching",
                "--ui-testing-opportunity-topic=\(topic)", "--ui-testing-opportunity-state=\(state)",
                "--ui-testing-language=zh-Hans", "--ui-testing-appearance=\(appearance)",
            ]
            app.launch()
            let activity = app.descendants(matching: .any)["mutual-opportunity-activity-\(id)"]
            XCTAssertTrue(activity.waitForExistence(timeout: 8))
            let peer = app.descendants(matching: .any)["mutual-opportunity-peer-\(id)"]
            let time = app.descendants(matching: .any)["mutual-opportunity-time-\(id)"]
            let card = app.descendants(matching: .any)["mutual-opportunity-\(id)"].firstMatch
            XCTAssertTrue(peer.exists)
            XCTAssertEqual(peer.frame.minX, card.frame.minX, accuracy: 1)
            XCTAssertEqual(peer.frame.width, card.frame.width, accuracy: 1, "The stronger category header spans the card width")
            XCTAssertLessThanOrEqual(peer.frame.maxY, activity.frame.minY)
            XCTAssertLessThanOrEqual(activity.frame.maxY, time.frame.minY)
            XCTAssertFalse(app.descendants(matching: .any)["mutual-opportunity-fit-details-\(id)"].exists)
            XCTAssertFalse(app.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", "/100")).firstMatch.exists)
            let decision = app.descendants(matching: .any)["mutual-opportunity-actions-\(id)"]
            let open = app.buttons["mutual-opportunity-open-\(id)"]
            if state == "READY_TO_COORDINATE" {
                revealFlowElement(open, in: app)
                XCTAssertTrue(open.isEnabled)
            } else {
                let message = app.buttons["mutual-opportunity-message-\(id)"]
                revealFlowElement(message, in: app)
                XCTAssertTrue(message.isEnabled)
                XCTAssertFalse(open.exists)
            }
            XCTAssertTrue(decision.exists)
            saveScreenshot(app: app, name: "opportunity-\(topic.lowercased())-\(state.lowercased())-\(appearance)")
            app.terminate()
        }
    }

    @MainActor
    func testTogetherFlowEditorLightAndDark() {
        for appearance in ["light", "dark"] {
            let app = togetherApp(["--ui-testing-language=zh-Hans", "--ui-testing-appearance=\(appearance)",
                "-UIPreferredContentSizeCategoryName", "UICTContentSizeCategoryL"])
            selectTogetherSection(1, in: app)
            addIntentionButton(in: app).tap()
            let picker = app.descendants(matching: .any)["intent-editor-topic"].firstMatch
            XCTAssertTrue(picker.waitForExistence(timeout: 5))
            XCTAssertTrue(app.buttons["intent-topic-coffee"].isSelected)
            let topics = ["coffee", "study", "sports", "explore", "food", "events"]
            XCTAssertEqual(app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH %@", "intent-topic-")).count, 6)
            for (index, topic) in topics.enumerated() {
                let tile = app.buttons["intent-topic-\(topic)"]
                XCTAssertTrue(tile.isHittable)
                XCTAssertLessThanOrEqual(tile.frame.height, 90)
                XCTAssertEqual(tile.frame.minY, app.buttons["intent-topic-\(topics[index / 3 * 3])"].frame.minY, accuracy: 1)
                if index % 3 != 0 {
                    XCTAssertGreaterThan(tile.frame.minX, app.buttons["intent-topic-\(topics[index - 1])"].frame.maxX)
                }
            }
            XCTAssertGreaterThan(app.buttons["intent-topic-explore"].frame.minY, app.buttons["intent-topic-coffee"].frame.maxY)
            XCTAssertLessThan(picker.frame.height, 180, "The six activity tiles should occupy two compact rows")
            XCTAssertFalse(app.navigationBars.buttons["intent-editor-save"].exists)
            let details = app.descendants(matching: .any)["intent-editor-activity"].firstMatch
            XCTAssertGreaterThanOrEqual(details.frame.minY, picker.frame.maxY)
            saveScreenshot(app: app, name: "tiled-intention-empty-\(appearance)")
            selectIntentionTopic("探索", in: app)
            let activity = app.descendants(matching: .any)["intent-editor-activity"].firstMatch
            revealFlowElement(activity, in: app)
            activity.tap()
            let toolbarSave = app.navigationBars.buttons["intent-editor-save"]
            XCTAssertTrue(toolbarSave.waitForExistence(timeout: 3))
            XCTAssertTrue(toolbarSave.isEnabled, "Details are optional even while the field has focus")
            activity.typeText("课后喝咖啡")
            let save = app.buttons["intent-editor-save"]
            XCTAssertTrue(save.isEnabled)
            XCTAssertEqual(save.label, "发布")
            XCTAssertEqual(app.buttons.matching(identifier: "intent-editor-save").count, 1)
            XCTAssertGreaterThan(save.frame.midX, app.frame.midX)
            XCTAssertLessThanOrEqual(save.frame.maxY, app.navigationBars.firstMatch.frame.maxY)
            XCTAssertLessThanOrEqual(activity.frame.maxY, app.keyboards.firstMatch.frame.minY)
            saveScreenshot(app: app, name: "intention-toolbar-publish-keyboard-\(appearance)")
            selectIntentionTopic("咖啡", in: app)
            XCTAssertFalse(toolbarSave.exists)
            XCTAssertEqual(save.label, "发布意愿")
            XCTAssertEqual(activity.value as? String, "课后喝咖啡")
            XCTAssertFalse(app.descendants(matching: .any)["intent-editor-note"].exists)
            let undecided = app.buttons["intent-timing-choose"].firstMatch
            revealFlowElement(undecided, in: app)
            XCTAssertTrue(undecided.exists)
            saveScreenshot(app: app, name: "tiled-intention-filled-\(appearance)")
            activity.tap()
            XCTAssertTrue(toolbarSave.waitForExistence(timeout: 3))
            toolbarSave.tap()
            XCTAssertTrue(app.descendants(matching: .any)["intent-editor"].waitForNonExistence(timeout: 5))
            app.terminate()
        }
    }

    @MainActor
    func testActivityPickerAtLargestDynamicType() {
        let app = XCUIApplication()
        app.launchArguments = [
            "--ui-testing-authenticated", "--ui-testing-skip-tutorial",
            "--ui-testing-discover", "--ui-testing-weekly-intent",
            "--ui-testing-mutual-opportunity", "--ui-testing-together-matching",
            "--ui-testing-flexible-timing", "--ui-testing-automatic-matching",
            "--ui-testing-ephemeral-credentials", "--ui-testing-local-api",
            "--ui-testing-language=de", "--ui-testing-appearance=dark",
            "--ui-testing-dynamic-type-accessibility",
            "-UIPreferredContentSizeCategoryName", "UICTContentSizeCategoryAccessibilityXXXL",
        ]
        app.launchEnvironment["SIDESEAT_API_BASE_URL_OVERRIDE"] = "http://127.0.0.1:9"
        app.launch()
        selectTogetherSection(1, in: app)
        let addIntent = addIntentionButton(in: app)
        for _ in 0..<8 where !addIntent.exists || !addIntent.isHittable {
            app.scrollViews["together-section-intentions"].swipeUp(velocity: .slow)
        }
        XCTAssertTrue(addIntent.waitForExistence(timeout: 3))
        XCTAssertTrue(addIntent.isHittable)
        saveScreenshot(app: app, name: "together-add-empty-de-large-type")
        addIntent.tap()
        let picker = app.descendants(matching: .any)["intent-editor-topic"].firstMatch
        XCTAssertTrue(picker.waitForExistence(timeout: 5))
        XCTAssertTrue(app.buttons["intent-topic-coffee"].isSelected)
        XCTAssertLessThanOrEqual(picker.frame.maxX, app.frame.maxX)
        selectIntentionTopic("Entdecken", in: app)
        saveScreenshot(app: app, name: "tiled-intention-de-large-type")
        let activity = app.descendants(matching: .any)["intent-editor-activity"].firstMatch
        revealFlowElement(activity, in: app)
        activity.tap()
        activity.typeText(String(repeating: "a", count: 81))
        let guidance = app.staticTexts["Max. 80 Zeichen."]
        XCTAssertTrue(guidance.isHittable)
        XCTAssertLessThanOrEqual(guidance.frame.maxY, app.keyboards.firstMatch.frame.minY + 1)
        XCTAssertLessThanOrEqual(activity.frame.maxY, guidance.frame.minY - 8)
        XCTAssertGreaterThanOrEqual(activity.frame.minY, app.navigationBars.firstMatch.frame.maxY)
        let toolbarSave = app.navigationBars.buttons["intent-editor-save"]
        XCTAssertTrue(toolbarSave.exists)
        XCTAssertFalse(toolbarSave.isEnabled)
        XCTAssertGreaterThan(toolbarSave.frame.midX, app.frame.midX)
        XCTAssertLessThanOrEqual(toolbarSave.frame.maxX, app.frame.maxX)
        saveScreenshot(app: app, name: "flow-intent-limit-de-large-type-keyboard")
        activity.typeText(String(repeating: XCUIKeyboardKey.delete.rawValue, count: 76))
        XCTAssertTrue(app.buttons["intent-editor-save"].isEnabled)
        let undecided = app.buttons["intent-timing-choose"].firstMatch
        revealFlowElement(undecided, in: app)
        XCTAssertTrue(undecided.exists)
        revealFlowElement(activity, in: app, towardTop: true)
        XCTAssertEqual(activity.value as? String, "aaaaa")
        app.buttons["intent-editor-save"].tap()
        XCTAssertTrue(app.descendants(matching: .any)["intent-editor"].waitForNonExistence(timeout: 5))
        XCTAssertTrue(app.buttons["weekly-intent-edit-ui-intent-created"].waitForExistence(timeout: 5))
        app.terminate()
    }

    @MainActor
    func testPlanFlowComposerAndOutcomeLightAndDark() {
        for appearance in ["light", "dark"] {
            let app = XCUIApplication()
            app.launchArguments = [
                "--ui-testing-authenticated", "--ui-testing-skip-tutorial",
                "--ui-testing-chats", "--ui-testing-cached-chat-refresh",
                "--ui-testing-language=zh-Hans", "--ui-testing-appearance=\(appearance)",
            ]
            app.launch()
            XCTAssertFalse(app.buttons["inbox-pending-plans"].exists)
            let plansTab = tabButton(in: app, labels: ["Plans", "计划", "Pläne"])
            XCTAssertTrue(plansTab.waitForExistence(timeout: 8))
            plansTab.tap()
            let plan = app.buttons["plans-row-ui-plan-1"]
            XCTAssertTrue(plan.waitForExistence(timeout: 5))
            saveScreenshot(app: app, name: "flow-plans-\(appearance)")
            plan.tap()
            let counter = app.buttons["plan-card-counter-ui-plan-1"]
            XCTAssertTrue(counter.waitForExistence(timeout: 5))
            revealFlowElement(counter, in: app)
            saveScreenshot(app: app, name: "flow-plan-response-\(appearance)")
            counter.tap()
            let submit = app.buttons["plan-create-submit"]
            let sheetAppeared = submit.waitForExistence(timeout: 5)
            saveScreenshot(app: app, name: "flow-plan-editor-\(appearance)")
            if !sheetAppeared {
                let tree = XCTAttachment(string: app.debugDescription)
                tree.lifetime = .keepAlways
                add(tree)
            }
            XCTAssertTrue(sheetAppeared)
            XCTAssertTrue(submit.isEnabled)
            XCTAssertTrue(submit.isHittable)
            XCTAssertEqual(app.textFields["plan-create-title"].value as? String, "图书馆自习")
            submit.tap()
            XCTAssertTrue(submit.waitForNonExistence(timeout: 5))
            app.terminate()

            app.launch()
            XCTAssertFalse(app.buttons["inbox-pending-plans"].exists)
            let outcomePlansTab = tabButton(in: app, labels: ["Plans", "计划", "Pläne"])
            XCTAssertTrue(outcomePlansTab.waitForExistence(timeout: 8))
            outcomePlansTab.tap()
            let endedTab = app.buttons.matching(
                NSPredicate(format: "label IN %@", ["Ended", "已结束", "Beendet"])
            ).firstMatch
            XCTAssertTrue(endedTab.waitForExistence(timeout: 5))
            endedTab.tap()
            let happened = app.buttons["plan-outcome-occurred-ui-plan-completed"]
            revealFlowElement(happened, in: app)
            let didNotHappenInitial = app.buttons["plan-outcome-did_not_occur-ui-plan-completed"]
            XCTAssertTrue(didNotHappenInitial.waitForExistence(timeout: 3))
            XCTAssertFalse(app.buttons["plan-outcome-prefer_not_to_say-ui-plan-completed"].exists)
            XCTAssertEqual(happened.frame.midY, didNotHappenInitial.frame.midY, accuracy: 3)
            XCTAssertGreaterThanOrEqual(happened.frame.height, 44)
            XCTAssertGreaterThanOrEqual(didNotHappenInitial.frame.height, 44)
            saveScreenshot(app: app, name: "flow-outcome-\(appearance)")
            happened.tap()
            let edit = app.buttons["plan-outcome-edit-ui-plan-completed"]
            XCTAssertTrue(edit.waitForExistence(timeout: 4))
            XCTAssertTrue(app.descendants(matching: .any)["plan-outcome-saved-ui-plan-completed"].exists)
            edit.tap()
            let didNotHappen = app.buttons["plan-outcome-did_not_occur-ui-plan-completed"]
            revealFlowElement(didNotHappen, in: app)
            didNotHappen.tap()
            XCTAssertTrue(edit.waitForExistence(timeout: 4))
            app.terminate()
        }
    }

    @MainActor
    func testRepeatPlanEntryAndDraftLocalizedAppearance() {
        func reveal(_ element: XCUIElement, scroll: XCUIElement, in app: XCUIApplication) {
            for _ in 0..<24 {
                let visible = scroll.frame.intersection(app.frame)
                let top = max(visible.minY, app.navigationBars.firstMatch.frame.maxY)
                let submit = app.buttons["plan-create-submit"]
                let bottom = submit.exists ? min(visible.maxY, submit.frame.minY - 20)
                    : min(visible.maxY, app.tabBars.firstMatch.frame.minY)
                if element.isHittable && element.frame.midY > top + 24 && element.frame.midY < bottom - 24 { return }
                if element.exists && element.frame.midY < top + 24 { scroll.swipeDown(velocity: .slow) }
                else { scroll.swipeUp(velocity: .slow) }
            }
            XCTFail("The control must be visible above the pinned actions")
        }
        for (language, appearance, large) in [("zh-Hans", "light", false), ("de", "dark", true)] {
            var arguments = ["--ui-testing-chats", "--ui-testing-language=\(language)", "--ui-testing-appearance=\(appearance)"]
            if large { arguments += ["--ui-testing-dynamic-type-accessibility", "-UIPreferredContentSizeCategoryName", "UICTContentSizeCategoryAccessibilityXXXL"] }
            let app = togetherApp(arguments)
            tabButton(in: app, labels: ["Plans", "计划", "Pläne"]).tap()
            selectPlanSection(2, in: app)
            let repeatButton = app.buttons["plan-repeat-ui-plan-completed"]
            reveal(repeatButton, scroll: app.scrollViews["plans-scroll-ended"], in: app)
            XCTAssertTrue(repeatButton.isHittable)
            XCTAssertGreaterThanOrEqual(repeatButton.frame.height, 44)
            saveScreenshot(app: app, name: "repeat-plan-entry-\(language)-\(appearance)")
            repeatButton.tap()
            let submit = app.buttons["plan-create-submit"]
            XCTAssertTrue(submit.waitForExistence(timeout: 6))
            XCTAssertFalse(submit.isEnabled)
            XCTAssertEqual(app.textFields["plan-create-title"].value as? String, "Coffee after class")
            let choose = app.buttons["plan-repeat-choose-time"]
            reveal(choose, scroll: app.scrollViews["plan-create-sheet"], in: app)
            XCTAssertTrue(choose.isHittable)
            XCTAssertGreaterThanOrEqual(choose.frame.height, 44)
            XCTAssertFalse(app.switches["plan-confirm-timing"].exists)
            saveScreenshot(app: app, name: "repeat-plan-draft-\(language)-\(appearance)")
            choose.tap()
            let done = app.buttons["plan-repeat-time-done"]
            XCTAssertTrue(done.waitForExistence(timeout: 5))
            XCTAssertTrue(done.isEnabled)
            saveScreenshot(app: app, name: "repeat-plan-time-\(language)-\(appearance)")
            done.tap()
            XCTAssertTrue(submit.waitForExistence(timeout: 5))
            XCTAssertTrue(submit.isEnabled)
            app.navigationBars.buttons.firstMatch.tap()
            selectPlanSection(0, in: app)
            let invitation = app.buttons["plans-row-ui-plan-1"]
            XCTAssertTrue(invitation.waitForExistence(timeout: 5))
            invitation.tap()
            XCTAssertTrue(app.buttons["conversation-current-plan"].waitForExistence(timeout: 6))
            saveScreenshot(app: app, name: "repeat-plan-header-\(language)-\(appearance)")
            app.terminate()
        }
    }

    @MainActor
    func testOutcomeDoesNotPromptMeetAgainLightAndDark() {
        for appearance in ["light", "dark"] {
            let app = XCUIApplication()
            app.launchArguments = [
                "--ui-testing-authenticated", "--ui-testing-skip-tutorial",
                "--ui-testing-chats", "--ui-testing-cached-chat-refresh",
                "--ui-testing-language=zh-Hans", "--ui-testing-appearance=\(appearance)",
            ]
            app.launch()
            let plansTab = tabButton(in: app, labels: ["Plans", "计划", "Pläne"])
            XCTAssertTrue(plansTab.waitForExistence(timeout: 8))
            plansTab.tap()
            let endedTab = app.buttons.matching(
                NSPredicate(format: "label IN %@", ["Ended", "已结束", "Beendet"])
            ).firstMatch
            XCTAssertTrue(endedTab.waitForExistence(timeout: 5))
            endedTab.tap()
            let happened = app.buttons["plan-outcome-occurred-ui-plan-completed"]
            revealFlowElement(happened, in: app)
            happened.tap()
            XCTAssertTrue(app.descendants(matching: .any)["plan-outcome-saved-ui-plan-completed"].waitForExistence(timeout: 4))
            XCTAssertFalse(app.descendants(matching: .any).matching(
                NSPredicate(format: "identifier BEGINSWITH %@", "plan-meet-again-")
            ).firstMatch.exists)
            app.terminate()
        }
    }

    @MainActor
    private func revealFlowElement(_ element: XCUIElement, in app: XCUIApplication, towardTop: Bool = false) {
        let pickerFields = app.descendants(matching: .any)["intent-time-picker-fields"].firstMatch
        let fields = pickerFields.exists ? pickerFields : app.descendants(matching: .any)["intent-editor-fields"].firstMatch
        // Retained pages leave offscreen UIKit scroll containers in the hierarchy.
        // Drive the visible viewport, never whichever container was created first.
        let surface: XCUIElement
        if fields.exists {
            surface = fields
        } else {
            let scroll = app.scrollViews.allElementsBoundByIndex.filter {
                let visible = $0.frame.intersection(app.frame)
                return !visible.isNull && visible.width > app.frame.width * 0.8 && visible.height > 80
            }.max { $0.frame.intersection(app.frame).height < $1.frame.intersection(app.frame).height }
            surface = scroll ?? app
        }
        for _ in 0..<12 {
            var visible = surface.frame.intersection(app.frame)
            if fields.exists {
                // A Form's UIKit frame includes content behind its safe-area insets.
                // The save action moves into the navigation bar while editing.
                let navigation = pickerFields.exists ? app.navigationBars.allElementsBoundByIndex.last! : app.navigationBars.firstMatch
                let top = max(visible.minY, navigation.frame.maxY)
                var bottom = visible.maxY
                let save = app.buttons["intent-editor-save"]
                if !pickerFields.exists, save.frame.minY > top { bottom = min(bottom, save.frame.minY - 12) }
                if app.keyboards.firstMatch.exists { bottom = min(bottom, app.keyboards.firstMatch.frame.minY) }
                visible = CGRect(x: visible.minX, y: top, width: visible.width, height: bottom - top)
            }
            if element.exists, element.isHittable,
               element.frame.midY > visible.minY + 24,
               element.frame.midY < visible.maxY - 24 { break }
            let scrollDown = element.exists ? element.frame.midY < visible.minY + 24 : towardTop
            if fields.exists, app.keyboards.firstMatch.exists {
                // Use a scroll gesture to end text input before precise positioning.
                // A press-and-drag can remain in the text field's editing interaction.
                if scrollDown { fields.swipeDown(velocity: .slow) }
                else { fields.swipeUp(velocity: .slow) }
            } else if fields.exists || element.exists {
                // Short drags keep known controls in view instead of swiping past them at large text sizes.
                let distance = element.exists
                    ? min(visible.height * 0.6, max(40, abs(element.frame.midY - visible.midY)))
                    : visible.height * 0.6
                let origin = app.coordinate(withNormalizedOffset: .zero)
                let upper = origin.withOffset(CGVector(dx: visible.maxX - 8, dy: visible.midY - distance / 2))
                let lower = origin.withOffset(CGVector(dx: visible.maxX - 8, dy: visible.midY + distance / 2))
                (scrollDown ? upper : lower).press(forDuration: 0.05, thenDragTo: scrollDown ? lower : upper,
                    withVelocity: .slow, thenHoldForDuration: 0.2)
            } else if scrollDown {
                surface.swipeDown(velocity: .slow)
            } else {
                surface.swipeUp(velocity: .slow)
            }
        }
        if !element.exists || !element.isHittable {
            saveScreenshot(app: app, name: "flow-unhittable-diagnostic")
            print("FLOW_DIAGNOSTIC: element exists=\(element.exists) surface=\(surface.frame)")
            let hierarchy = XCTAttachment(string: app.debugDescription)
            hierarchy.name = "Flow accessibility hierarchy"
            hierarchy.lifetime = .keepAlways
            add(hierarchy)
        }
        XCTAssertTrue(element.exists)
        XCTAssertTrue(element.exists && element.isHittable)
    }

    @MainActor
    func testInboxManualUnreadPersistsAndClearsOnOpen() {
        let app = XCUIApplication()
        app.launchArguments = ["--ui-testing-authenticated", "--ui-testing-skip-tutorial",
            "--ui-testing-chats", "--ui-testing-language=zh-Hans", "--ui-testing-appearance=light",
            "--ui-testing-ephemeral-credentials", "--ui-testing-local-api", "--ui-testing-reset-inbox-unread"]
        app.launchEnvironment["SIDESEAT_API_BASE_URL_OVERRIDE"] = "http://127.0.0.1:9"
        app.launch()
        let row = app.buttons["inbox-row-ui-connection-sara"]
        let action = app.buttons["inbox-row-ui-connection-sara-read"]
        XCTAssertTrue(row.waitForExistence(timeout: 8))
        row.swipeLeft()
        XCTAssertTrue(action.waitForExistence(timeout: 3))
        XCTAssertTrue(action.label.contains("标为未读"))
        saveScreenshot(app: app, name: "inbox-mark-unread-action-light")
        action.tap()
        XCTAssertEqual(row.value as? String, "已标为未读")
        saveScreenshot(app: app, name: "inbox-manual-unread-light")

        app.terminate()
        app.launchArguments.removeAll { $0 == "--ui-testing-reset-inbox-unread" || $0 == "--ui-testing-appearance=light" }
        app.launchArguments.append("--ui-testing-appearance=dark")
        app.launch()
        XCTAssertTrue(row.waitForExistence(timeout: 8))
        XCTAssertEqual(row.value as? String, "已标为未读")
        saveScreenshot(app: app, name: "inbox-manual-unread-dark")
        row.swipeLeft()
        XCTAssertTrue(action.waitForExistence(timeout: 3))
        XCTAssertTrue(action.label.contains("标为已读"))
        action.tap()
        XCTAssertEqual(row.value as? String ?? "", "")

        row.swipeLeft()
        XCTAssertTrue(action.waitForExistence(timeout: 3))
        action.tap()
        XCTAssertEqual(row.value as? String, "已标为未读")
        row.tap()
        XCTAssertTrue(app.descendants(matching: .any)["direct-chat"].waitForExistence(timeout: 5))
        app.terminate()
        app.launch()
        XCTAssertTrue(row.waitForExistence(timeout: 8))
        XCTAssertEqual(row.value as? String ?? "", "")
        app.terminate()
    }

    @MainActor
    func testMessageSearchSurfacesFilterClearAndCancel() {
        let app = XCUIApplication()
        app.launchArguments = ["--ui-testing-authenticated", "--ui-testing-skip-tutorial",
            "--ui-testing-message-request", "--ui-testing-language=zh-Hans",
            "--ui-testing-appearance=light", "--ui-testing-ephemeral-credentials", "--ui-testing-local-api"]
        app.launchEnvironment["SIDESEAT_API_BASE_URL_OVERRIDE"] = "http://127.0.0.1:9"
        app.launch()
        tabButton(in: app, labels: ["消息"]).tap()

        let search = app.searchFields["inbox-search-field"]
        let sara = app.buttons["inbox-row-ui-connection-sara"]
        let mia = app.buttons["message-request-cmutualui0000000000000001"]
        XCTAssertTrue(search.waitForExistence(timeout: 8))
        search.tap()
        search.typeText("萨拉")
        XCTAssertTrue(sara.waitForExistence(timeout: 3))
        XCTAssertFalse(app.buttons["inbox-row-ui-connection-leo"].exists)
        search.buttons.firstMatch.tap()
        XCTAssertTrue(app.buttons["inbox-row-ui-connection-leo"].waitForExistence(timeout: 3))
        app.buttons["inbox-search-cancel"].tap()
        XCTAssertTrue(app.keyboards.firstMatch.waitForNonExistence(timeout: 3))

        app.buttons["inbox-message-requests"].tap()
        XCTAssertTrue(mia.waitForExistence(timeout: 5))
        search.tap()
        search.typeText("zzzz-no-match")
        XCTAssertFalse(mia.exists)
        search.buttons.firstMatch.tap()
        XCTAssertTrue(mia.waitForExistence(timeout: 3))
        search.typeText("Mia")
        XCTAssertTrue(mia.exists)
        app.buttons["inbox-search-cancel"].tap()
        XCTAssertTrue(app.keyboards.firstMatch.waitForNonExistence(timeout: 3))
        XCTAssertTrue(mia.exists)
        app.navigationBars.buttons.firstMatch.tap()
        XCTAssertTrue(sara.waitForExistence(timeout: 5))
        app.terminate()
    }

    @MainActor
    func testMessagesPinnedSurfaceAndRequestEntry() {
        for appearance in ["light", "dark"] {
            let app = XCUIApplication()
            app.launchArguments = ["--ui-testing-authenticated", "--ui-testing-skip-tutorial",
                "--ui-testing-chats", "--ui-testing-message-request", "--ui-testing-language=zh-Hans",
                "--ui-testing-appearance=\(appearance)", "--ui-testing-ephemeral-credentials",
                "--ui-testing-local-api", "-UIPreferredContentSizeCategoryName", "UICTContentSizeCategoryL"]
            app.launchEnvironment["SIDESEAT_API_BASE_URL_OVERRIDE"] = "http://127.0.0.1:9"
            app.launch()
            let entry = app.buttons["inbox-message-requests"]
            XCTAssertTrue(entry.waitForExistence(timeout: 8))
            XCTAssertEqual(entry.value as? String, "1")
            XCTAssertFalse(app.buttons["message-request-cmutualui0000000000000001"].exists)
            let pinned = app.buttons["inbox-row-ui-connection"]
            XCTAssertEqual(pinned.value as? String, "置顶")
            XCTAssertEqual(app.buttons["inbox-row-ui-connection-leo"].value as? String ?? "", "")
            saveScreenshot(app: app, name: "messages-pinned-\(appearance)-zh")
            pinned.swipeLeft()
            app.buttons["inbox-row-ui-connection-pin"].tap()
            XCTAssertTrue(pinned.waitForExistence(timeout: 5))
            XCTAssertEqual(pinned.value as? String ?? "", "")
            pinned.swipeLeft()
            app.buttons["inbox-row-ui-connection-pin"].tap()
            XCTAssertEqual(pinned.value as? String, "置顶")
            entry.tap()
            XCTAssertTrue(app.buttons["message-request-cmutualui0000000000000001"].waitForExistence(timeout: 5))
            saveScreenshot(app: app, name: "greetings-list-\(appearance)-zh")
            app.terminate()
        }
    }

    @MainActor
    func testMessageDatesFollowSelectedAppLanguage() {
        for (language, month) in [("en", "Jul"), ("de", "Juli"), ("zh-Hans", "月")] {
            let app = XCUIApplication()
            app.launchArguments = ["--ui-testing-authenticated", "--ui-testing-skip-tutorial",
                "--ui-testing-chats", "--ui-testing-language=\(language)",
                "--ui-testing-appearance=light", "-UIPreferredContentSizeCategoryName", "UICTContentSizeCategoryL"]
            app.launch()
            let date = app.staticTexts["inbox-date-visual-ui-connection"]
            XCTAssertTrue(date.waitForExistence(timeout: 5))
            XCTAssertTrue(date.label.contains(month), date.label)
            saveScreenshot(app: app, name: "message-dates-\(language)")
            app.buttons["inbox-row-ui-connection"].tap()
            let timestamp = app.staticTexts.matching(NSPredicate(format: "identifier BEGINSWITH %@", "chat-timestamp-")).firstMatch
            XCTAssertTrue(timestamp.waitForExistence(timeout: 5))
            XCTAssertTrue(timestamp.label.contains(month), timestamp.label)
            app.terminate()
        }
    }

    @MainActor
    func testCaptureCurrentAppearanceMatrix() throws {
        let appearance = Self.resolvedAppearance()
        XCTAssertTrue(["light", "dark"].contains(appearance), "appearance must be light|dark")

        captureAuth(appearance: appearance)
        captureAuthenticatedTabs(appearance: appearance)
    }

    @MainActor
    func testCaptureTogetherOpportunity() throws {
        let appearance = Self.resolvedAppearance()
        let app = XCUIApplication()
        app.launchArguments = [
            "--ui-testing-authenticated",
            "--ui-testing-skip-tutorial",
            "--ui-testing-discover",
            "--ui-testing-weekly-intent",
            "--ui-testing-mutual-opportunity",
            "--ui-testing-together-matching",
            "--ui-testing-appearance=\(appearance)",
        ]
        app.launch()

        XCTAssertTrue(app.descendants(matching: .any)["together-home"].waitForExistence(timeout: 8))
        XCTAssertTrue(app.descendants(matching: .any)["mutual-opportunity-cmutualui0000000000000001"].waitForExistence(timeout: 5))
        RunLoop.current.run(until: Date().addingTimeInterval(0.35))
        saveScreenshot(app: app, name: "together-opportunity-\(appearance)")
        app.terminate()
    }

    @MainActor
    func testCaptureTogetherActiveMatching() throws {
        let appearance = Self.resolvedAppearance()
        let app = XCUIApplication()
        app.launchArguments = [
            "--ui-testing-authenticated",
            "--ui-testing-skip-tutorial",
            "--ui-testing-discover",
            "--ui-testing-weekly-intent",
            "--ui-testing-mutual-opportunity-empty",
            "--ui-testing-together-matching-active",
            "--ui-testing-appearance=\(appearance)",
        ]
        app.launch()

        XCTAssertTrue(app.descendants(matching: .any)["together-home"].waitForExistence(timeout: 8))
        let stopMatching = app.buttons.matching(
            NSPredicate(format: "label IN %@", ["Stop matching", "停止匹配", "Matching stoppen"])
        ).firstMatch
        XCTAssertTrue(stopMatching.waitForExistence(timeout: 5))
        RunLoop.current.run(until: Date().addingTimeInterval(0.35))
        saveScreenshot(app: app, name: "together-matching-active-\(appearance)")
        app.terminate()
    }

    @MainActor
    func testPlansOverviewShowsNextMeetupWithoutIncomingInvitations() {
        let app = togetherApp(["--ui-testing-chats", "--ui-testing-plans-no-incoming",
            "--ui-testing-plans-mixed-waiting", "--ui-testing-language=zh-Hans", "--ui-testing-appearance=dark"])
        tabButton(in: app, labels: ["计划"]).tap()
        let next = app.buttons["plans-row-ui-plan-accepted"]
        XCTAssertTrue(next.waitForExistence(timeout: 5), app.debugDescription)
        XCTAssertTrue(next.isHittable)
        XCTAssertTrue(next.label.contains("已确认"))
        XCTAssertFalse(app.descendants(matching: .any)["plans-empty-waitingResponse"].exists)
        XCTAssertFalse(app.descendants(matching: .any)["plans-waiting-incoming-heading"].exists)
        XCTAssertTrue(app.buttons["plans-toggle-outgoing"].exists)
        saveScreenshot(app: app, name: "plans-overview-no-incoming-dark")
        next.tap()
        XCTAssertTrue(app.descendants(matching: .any)["direct-chat"].waitForExistence(timeout: 5))
        app.navigationBars.buttons.firstMatch.tap()
        XCTAssertTrue(next.waitForExistence(timeout: 5))
        app.terminate()
    }

    @MainActor
    func testCapturePlanInviteCard() throws {
        let appearance = Self.resolvedAppearance()
        XCTAssertTrue(["light", "dark"].contains(appearance), "appearance must be light|dark")

        let app = XCUIApplication()
        app.launchArguments = [
            "--ui-testing-authenticated",
            "--ui-testing-skip-tutorial",
            "--ui-testing-plans-mixed-waiting",
            "--ui-testing-plans-date-groups",
            "--ui-testing-chats",
            "--ui-testing-cached-chat-refresh",
            "--ui-testing-language=zh-Hans",
            "--ui-testing-appearance=\(appearance)",
        ]
        app.launch()

        XCTAssertFalse(app.buttons["inbox-pending-plans"].exists)
        let plansTab = tabButton(in: app, labels: ["Plans", "计划", "Pläne"])
        XCTAssertTrue(plansTab.waitForExistence(timeout: 8))
        plansTab.tap()

        XCTAssertTrue(app.descendants(matching: .any)["plans-root"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.descendants(matching: .any)["plans-segmented-control"].exists)
        XCTAssertTrue(app.buttons["总览"].exists)
        XCTAssertTrue(app.buttons["即将开始"].exists)
        XCTAssertTrue(app.buttons["已结束"].exists)

        let planRow = app.buttons["plans-row-ui-plan-1"]
        XCTAssertTrue(planRow.waitForExistence(timeout: 5), app.debugDescription)
        XCTAssertTrue(planRow.label.contains("明天"))
        XCTAssertTrue(planRow.label.contains("查看并回应"))
        XCTAssertTrue(planRow.label.contains("Mina 邀请你"))
        let incoming = app.descendants(matching: .any)["plans-waiting-incoming-heading"].firstMatch
        XCTAssertTrue(incoming.waitForExistence(timeout: 5))
        XCTAssertEqual(incoming.value as? String, "1")
        let nextPlan = app.buttons["plans-row-ui-plan-tomorrow-10"]
        XCTAssertTrue(nextPlan.waitForExistence(timeout: 5))
        XCTAssertTrue(nextPlan.label.contains("明天"))
        XCTAssertLessThan(planRow.frame.minY, nextPlan.frame.minY)
        XCTAssertFalse(app.buttons["plans-row-ui-plan-outgoing"].exists)
        saveScreenshot(app: app, name: "plans-overview-\(appearance)")

        let overviewScroll = app.scrollViews["plans-scroll-waitingResponse"].firstMatch
        let outgoingToggle = app.buttons["plans-toggle-outgoing"]
        if !outgoingToggle.isHittable { overviewScroll.swipeUp() }
        XCTAssertTrue(outgoingToggle.isHittable)
        outgoingToggle.tap()
        XCTAssertTrue(app.buttons["plans-row-ui-plan-outgoing"].waitForExistence(timeout: 5))
        outgoingToggle.tap()
        XCTAssertFalse(app.buttons["plans-row-ui-plan-outgoing"].exists)
        overviewScroll.swipeDown()
        app.buttons["plans-view-upcoming"].tap()
        let picker = app.segmentedControls["plans-segmented-control"]
        picker.buttons.element(boundBy: 1).tap()
        let nextMorning = app.buttons["plans-row-ui-plan-tomorrow-10"]
        let nextAfternoon = app.buttons["plans-row-ui-plan-tomorrow-14"]
        XCTAssertTrue(nextMorning.waitForExistence(timeout: 5))
        XCTAssertLessThan(nextMorning.frame.minY, nextAfternoon.frame.minY)
        let dates = app.staticTexts.matching(NSPredicate(format: "identifier BEGINSWITH %@", "plans-date-heading-"))
        XCTAssertEqual(dates.count, 2)
        let tomorrow = Calendar.current.date(byAdding: .day, value: 1, to: Date())!
        let expectedDate = tomorrow.formatted(.dateTime.month(.abbreviated).day().weekday(.abbreviated).locale(Locale(identifier: "zh-Hans")))
        XCTAssertEqual(dates.element(boundBy: 0).label, expectedDate)
        XCTAssertTrue(nextMorning.label.contains("明天"))
        XCTAssertTrue(app.buttons["plans-row-ui-plan-accepted"].label.contains("2 天后"))
        XCTAssertTrue(nextMorning.label.contains("已确认"))
        saveScreenshot(app: app, name: "plans-date-groups-\(appearance)")
        picker.buttons.element(boundBy: 2).tap()
        XCTAssertTrue(app.buttons["plan-outcome-occurred-ui-plan-completed"].waitForExistence(timeout: 5))
        saveScreenshot(app: app, name: "plans-ended-hierarchy-\(appearance)")
        picker.buttons.element(boundBy: 0).tap()
        planRow.tap()

        let actions = app.descendants(matching: .any)["plan-card-actions-ui-plan-1"]
        XCTAssertTrue(actions.waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["plan-card-time-ui-plan-1"].label.contains("明天"))
        XCTAssertTrue(app.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", "已提议")).firstMatch.exists)
        XCTAssertTrue(app.staticTexts["接受后会确认此计划，并添加到双方日历。"].exists)
        XCTAssertFalse(app.staticTexts["Proposed"].exists)
        XCTAssertGreaterThan(actions.frame.height, 48)
        RunLoop.current.run(until: Date().addingTimeInterval(0.35))
        saveScreenshot(app: app, name: "chat-plan-invite-\(appearance)")
        app.terminate()
    }

    @MainActor
    func testCaptureChatBubbles() throws {
        let appearance = Self.resolvedAppearance()
        XCTAssertTrue(["light", "dark"].contains(appearance), "appearance must be light|dark")

        let app = XCUIApplication()
        app.launchArguments = [
            "--ui-testing-authenticated",
            "--ui-testing-chats",
            "--ui-testing-language=zh-Hans",
            "--ui-testing-appearance=\(appearance)",
        ]
        app.launch()

        let row = app.descendants(matching: .any)["inbox-row-ui-connection-leo"]
        XCTAssertTrue(row.waitForExistence(timeout: 8))
        row.tap()
        XCTAssertTrue(app.descendants(matching: .any)["direct-chat"].waitForExistence(timeout: 5))
        let ownBubble = app.descendants(matching: .any)["chat-bubble-ui-leo-msg-2"]
        XCTAssertTrue(ownBubble.waitForExistence(timeout: 5))
        RunLoop.current.run(until: Date().addingTimeInterval(0.35))
        saveScreenshot(app: app, name: "chat-bubbles-\(appearance)")

        ownBubble.press(forDuration: 0.8)
        let menu = app.descendants(matching: .any)["chat-context-action-menu"].firstMatch
        XCTAssertTrue(menu.waitForExistence(timeout: 3))
        XCTAssertTrue(app.buttons["chat-reply-ui-leo-msg-2"].isHittable)
        XCTAssertTrue(app.buttons["chat-copy-ui-leo-msg-2"].isHittable)
        XCTAssertTrue(app.buttons["chat-delete-ui-leo-msg-2"].isHittable)
        XCTAssertLessThanOrEqual(menu.frame.width, app.frame.width * 0.55)
        XCTAssertTrue(
            menu.frame.maxY <= ownBubble.frame.minY + 20
                || menu.frame.minY >= ownBubble.frame.maxY - 20
        )
        RunLoop.current.run(until: Date().addingTimeInterval(0.25))
        saveScreenshot(app: app, name: "chat-context-menu-\(appearance)")
        app.coordinate(withNormalizedOffset: CGVector(dx: 0.08, dy: 0.35)).tap()
        XCTAssertTrue(menu.waitForNonExistence(timeout: 2))
        app.terminate()
    }

    @MainActor
    func testCaptureCalendarConnections() throws {
        let appearance = Self.resolvedAppearance()
        XCTAssertTrue(["light", "dark"].contains(appearance), "appearance must be light|dark")

        let app = XCUIApplication()
        app.launchArguments = [
            "--ui-testing-authenticated",
            "--ui-testing-skip-tutorial",
            "--ui-testing-language=zh-Hans",
            "--ui-testing-appearance=\(appearance)",
        ]
        app.launch()

        let connections = app.buttons["calendar-connections"]
        XCTAssertTrue(connections.waitForExistence(timeout: 8))
        RunLoop.current.run(until: Date().addingTimeInterval(0.25))
        saveScreenshot(app: app, name: "calendar-home-actions-\(appearance)")
        connections.tap()
        XCTAssertTrue(
            app.descendants(matching: .any)["calendar-connection-add-apple"]
                .waitForExistence(timeout: 5)
        )
        XCTAssertTrue(app.buttons["calendar-import"].exists)
        XCTAssertTrue(app.buttons["calendar-export"].exists)
        RunLoop.current.run(until: Date().addingTimeInterval(0.35))
        saveScreenshot(app: app, name: "calendar-connections-\(appearance)")
        app.terminate()
    }

    @MainActor
    func testCaptureSideSeatAppShare() throws {
        let appearance = Self.resolvedAppearance()
        let app = XCUIApplication()
        app.launchArguments = [
            "--ui-testing-authenticated",
            "--ui-testing-skip-tutorial",
            "--ui-testing-appearance=\(appearance)",
        ]
        app.launch()

        let me = tabButton(in: app, labels: ["Me", "我"])
        XCTAssertTrue(me.waitForExistence(timeout: 8))
        me.tap()

        let settings = app.buttons["me-settings"]
        if !settings.waitForExistence(timeout: 2) {
            app.swipeUp()
        }
        XCTAssertTrue(settings.waitForExistence(timeout: 5))
        settings.tap()

        let share = app.buttons["settings-share-sideseat"]
        if !share.waitForExistence(timeout: 2) || !share.isHittable {
            app.swipeUp()
        }
        XCTAssertTrue(share.waitForExistence(timeout: 5))
        share.tap()
        XCTAssertTrue(app.descendants(matching: .any)["sideseat-app-share-preview"].waitForExistence(timeout: 5))
        RunLoop.current.run(until: Date().addingTimeInterval(0.35))
        saveScreenshot(app: app, name: "sideseat-app-share-\(appearance)")
        app.terminate()
    }

    @MainActor
    func testCaptureCourses() throws {
        let appearance = Self.resolvedAppearance()
        let app = XCUIApplication()
        app.launchArguments = [
            "--ui-testing-authenticated",
            "--ui-testing-skip-tutorial",
            "--ui-testing-appearance=\(appearance)",
        ]
        app.launch()

        let me = tabButton(in: app, labels: ["Me", "我", "Ich"])
        XCTAssertTrue(me.waitForExistence(timeout: 8))
        me.tap()
        let profile = app.descendants(matching: .any)["me-profile"]
        XCTAssertTrue(profile.waitForExistence(timeout: 5))
        let courses = app.buttons["me-courses"]
        for _ in 0..<8 where !courses.exists || !courses.isHittable {
            profile.swipeUp()
        }
        XCTAssertTrue(courses.exists)
        XCTAssertTrue(courses.isHittable)
        courses.tap()
        XCTAssertTrue(app.descendants(matching: .any)["courses-list"].waitForExistence(timeout: 5))
        RunLoop.current.run(until: Date().addingTimeInterval(0.35))
        saveScreenshot(app: app, name: "courses-\(appearance)")
        app.terminate()
    }

    @MainActor
    private func captureAuth(appearance: String) {
        let app = XCUIApplication()
        app.launchArguments = [
            "--ui-testing-language=en",
            "-UIPreferredContentSizeCategoryName", "UICTContentSizeCategoryL",
            "--ui-testing-signed-out",
            "--ui-testing-skip-tutorial",
            "--ui-testing-appearance=\(appearance)",
        ]
        app.launch()
        XCTAssertTrue(app.textFields["login-identifier"].waitForExistence(timeout: 8))
        RunLoop.current.run(until: Date().addingTimeInterval(0.4))
        saveScreenshot(app: app, name: "auth-\(appearance)")
        app.terminate()
    }

    @MainActor
    private func captureAuthenticatedTabs(appearance: String) {
        let app = XCUIApplication()
        app.launchArguments = [
            "--ui-testing-language=en",
            "-UIPreferredContentSizeCategoryName", "UICTContentSizeCategoryL",
            "--ui-testing-authenticated",
            "--ui-testing-skip-tutorial",
            "--ui-testing-chats",
            "--ui-testing-weekly-intent",
            "--ui-testing-mutual-opportunity-empty",
            "--ui-testing-together-matching",
            "--ui-testing-appearance=\(appearance)",
        ]
        app.launch()

        let together = tabButton(in: app, labels: ["Together", "同行", "Zusammen"])
        XCTAssertTrue(together.waitForExistence(timeout: 8))
        together.tap()
        XCTAssertTrue(app.descendants(matching: .any)["together-home"].waitForExistence(timeout: 6))
        selectTogetherSection(0, in: app)
        XCTAssertTrue(app.descendants(matching: .any)["together-opportunities-empty"].waitForExistence(timeout: 5))
        RunLoop.current.run(until: Date().addingTimeInterval(0.35))
        saveScreenshot(app: app, name: "together-idle-\(appearance)")

        tabButton(in: app, labels: ["Plans", "计划", "Pläne"]).tap()
        XCTAssertTrue(app.descendants(matching: .any)["plans-root"].waitForExistence(timeout: 6))
        XCTAssertTrue(app.buttons["plans-row-ui-plan-1"].waitForExistence(timeout: 5))
        saveScreenshot(app: app, name: "plans-\(appearance)")

        tabButton(in: app, labels: ["Calendar", "日历", "Kalender"]).tap()
        XCTAssertTrue(tabButton(in: app, labels: ["Calendar", "日历"]).waitForExistence(timeout: 8))
        XCTAssertTrue(app.descendants(matching: .any)["home-week-timetable"].waitForExistence(timeout: 6)
            || app.descendants(matching: .any)["home-date-strip"].waitForExistence(timeout: 6))
        RunLoop.current.run(until: Date().addingTimeInterval(0.45))
        saveScreenshot(app: app, name: "calendar-\(appearance)")

        tabButton(in: app, labels: ["Messages", "消息", "Nachrichten"]).tap()
        XCTAssertTrue(app.descendants(matching: .any)["inbox-list"].waitForExistence(timeout: 5))
        RunLoop.current.run(until: Date().addingTimeInterval(0.35))
        saveScreenshot(app: app, name: "messages-\(appearance)")

        tabButton(in: app, labels: ["Me", "我", "Ich"]).tap()
        XCTAssertTrue(app.descendants(matching: .any)["me-profile"].waitForExistence(timeout: 5))
        RunLoop.current.run(until: Date().addingTimeInterval(0.35))
        saveScreenshot(app: app, name: "me-\(appearance)")

        app.terminate()
    }

    @MainActor
    private func tabButton(in app: XCUIApplication, labels: [String]) -> XCUIElement {
        app.tabBars.buttons.matching(NSPredicate(format: "label IN %@", labels)).firstMatch
    }

    @MainActor
    private func saveScreenshot(app: XCUIApplication, name: String) {
        let shot = app.screenshot()
        let url = Self.visualQADirectory().appendingPathComponent("\(name).png")
        do {
            try shot.pngRepresentation.write(to: url, options: .atomic)
            let attachment = XCTAttachment(screenshot: shot)
            attachment.name = name
            attachment.lifetime = .keepAlways
            add(attachment)
        } catch {
            XCTFail("Failed writing \(url.path): \(error)")
        }
    }

    private static func visualQADirectory() -> URL {
        if let raw = ProcessInfo.processInfo.environment["VISUAL_QA_DIR"], !raw.isEmpty {
            return URL(fileURLWithPath: raw, isDirectory: true)
        }
        let thisFile = URL(fileURLWithPath: #filePath)
        let repoRoot = thisFile
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
        return repoRoot.appendingPathComponent("docs/visual-qa", isDirectory: true)
    }

    /// Host script writes `docs/visual-qa/.appearance` (light|dark) before each run.
    private static func resolvedAppearance() -> String {
        if let raw = ProcessInfo.processInfo.environment["VISUAL_QA_APPEARANCE"], !raw.isEmpty {
            return raw.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        }
        let marker = visualQADirectory().appendingPathComponent(".appearance")
        if let data = try? String(contentsOf: marker, encoding: .utf8) {
            return data.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        }
        return "light"
    }
}
