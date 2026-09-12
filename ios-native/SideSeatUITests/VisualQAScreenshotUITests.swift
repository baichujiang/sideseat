import XCTest

/// Captures Auth, Together states, and the current 4-tab shell for visual QA.
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
        let picker = app.segmentedControls["together-segmented-control"]
        let pinnedY = picker.frame.minY
        // Swiping from activity content navigates; it must not choose interest.
        swipeTaskPage(recommendation, left: true)
        let intentions = app.scrollViews["together-section-intentions"].firstMatch
        XCTAssertTrue(intentions.waitForExistence(timeout: 5), app.debugDescription)
        XCTAssertTrue(picker.buttons.element(boundBy: 1).isSelected)
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
        let explore = app.descendants(matching: .any)["explore-intents-list"].firstMatch
        XCTAssertTrue(explore.waitForExistence(timeout: 5))
        // The last page does not wrap around to Recommendations.
        swipeTaskPage(explore, left: true)
        XCTAssertTrue(picker.buttons.element(boundBy: 2).isSelected)
        swipeTaskPage(explore, left: false)
        XCTAssertTrue(intentions.waitForExistence(timeout: 5))
        XCTAssertTrue(picker.buttons.element(boundBy: 1).isSelected)
        XCTAssertEqual(study.frame.minY, savedY, accuracy: 5)
        saveScreenshot(app: app, name: "pager-together-restored-zh")
        app.terminate()
    }

    @MainActor
    func testTaskPagerDecisionBarOwnsWholeTouch() {
        let app = togetherApp(["--ui-testing-opportunity-list", "--ui-testing-discovery-published",
            "--ui-testing-language=en"])
        let id = "cmutualui0000000000000001"
        let bar = app.descendants(matching: .any)["mutual-opportunity-swipe-\(id)"].firstMatch
        let handle = app.descendants(matching: .any)["mutual-opportunity-swipe-handle-\(id)"].firstMatch
        XCTAssertTrue(bar.waitForExistence(timeout: 5))
        let picker = app.segmentedControls["together-segmented-control"]
        // A drag beginning on an endpoint (not the knob) must not turn into paging.
        let endpoint = bar.coordinate(withNormalizedOffset: CGVector(dx: 0.85, dy: 0.5))
        endpoint.press(forDuration: 0.08, thenDragTo: endpoint.withOffset(CGVector(dx: -210, dy: -5)), withVelocity: .slow, thenHoldForDuration: 0.2)
        XCTAssertTrue(picker.buttons.element(boundBy: 0).isSelected)
        XCTAssertTrue(handle.exists)
        // A real choice from the knob may leave the control, but must never switch tasks.
        let start = handle.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5))
        start.press(forDuration: 0.08, thenDragTo: start.withOffset(CGVector(dx: -180, dy: 0)), withVelocity: .slow, thenHoldForDuration: 0.2)
        XCTAssertTrue(app.descendants(matching: .any)["mutual-opportunity-activity-\(id)"].waitForNonExistence(timeout: 5))
        XCTAssertTrue(picker.buttons.element(boundBy: 0).isSelected)
        XCTAssertTrue(app.descendants(matching: .any)["mutual-opportunity-cmutualui0000000000000002"].exists)
        app.terminate()
    }

    @MainActor
    func testTaskPagerExploreSearchPersists() {
        let app = togetherApp(["--ui-testing-explore-intents", "--ui-testing-explore-plus", "--ui-testing-language=en"])
        selectTogetherSection(2, in: app)
        let search = app.textFields["explore-search"]
        XCTAssertTrue(search.waitForExistence(timeout: 5))
        search.tap(); search.typeText("Badminton")
        selectTogetherSection(0, in: app)
        selectTogetherSection(2, in: app)
        XCTAssertTrue(search.waitForExistence(timeout: 5))
        XCTAssertEqual(search.value as? String, "Badminton")
        XCTAssertFalse(app.descendants(matching: .any)["explore-intent-ui-explore-1"].exists)
        saveScreenshot(app: app, name: "pager-explore-search-retained")
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
        let card = app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH %@", "plans-row-ui-plan-accepted")).allElementsBoundByIndex.first { $0.isHittable }
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
        XCTAssertEqual(app.buttons[identifier].frame.minY, savedY, accuracy: 5, "Returning from chat preserves the plan viewport")
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
            app.terminate()
        }
    }

    @MainActor
    func testDiscoveryDifferencesAcrossLanguages() {
        let id = "cmutualui0000000000000001"
        for (language, coffee, sport, timeText) in [
            ("zh-Hans", "咖啡", "篮球", "另约时间"),
            ("en", "Coffee", "Basketball", "Find another time"),
            ("de", "Kaffee", "Basketball", "Andere Zeit finden"),
        ] {
            let app = XCUIApplication()
            app.launchArguments = ["--ui-testing-authenticated", "--ui-testing-skip-tutorial",
                "--ui-testing-discover", "--ui-testing-weekly-intent", "--ui-testing-mutual-opportunity", "--ui-testing-together-matching",
                "--ui-testing-discovery-matching", "--ui-testing-automatic-matching", "--ui-testing-discovery-published",
                "--ui-testing-language=\(language)", "--ui-testing-appearance=\(language == "en" ? "dark" : "light")"]
            if language == "de" { app.launchArguments.append("--ui-testing-dynamic-type-accessibility") }
            app.launch()
            let activity = app.descendants(matching: .any)["mutual-opportunity-activity-\(id)"].firstMatch
            XCTAssertTrue(activity.waitForExistence(timeout: 8))
            XCTAssertTrue(activity.label.contains(coffee))
            XCTAssertTrue(activity.label.contains(sport))
            XCTAssertFalse(app.descendants(matching: .any)["mutual-opportunity-fit-details-\(id)"].exists)
            XCTAssertFalse(app.descendants(matching: .any)["mutual-opportunity-differences-\(id)"].exists)
            XCTAssertFalse(app.descendants(matching: .any)["together-finding-summary"].exists)
            XCTAssertFalse(app.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", "/100")).firstMatch.exists)
            saveScreenshot(app: app, name: "compact-opportunity-different-\(language)")
            let time = app.descendants(matching: .any)["mutual-opportunity-time-\(id)"].firstMatch
            revealCompactCue(time, in: app)
            XCTAssertEqual(time.label, timeText)
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
            ([], "共同空闲", "shared"),
            (["--ui-testing-flexible-timing"], "时间待定", "undecided"),
            (["--ui-testing-flexible-timing", "--ui-testing-opportunity-flexible-window"], "时段相近", "flexible"),
        ]
        for (extra, expected, name) in scenarios {
            let app = XCUIApplication()
            app.launchArguments = ["--ui-testing-authenticated", "--ui-testing-skip-tutorial",
                "--ui-testing-discover", "--ui-testing-weekly-intent", "--ui-testing-mutual-opportunity", "--ui-testing-together-matching",
                "--ui-testing-automatic-matching", "--ui-testing-discovery-published", "--ui-testing-opportunity-topic=COFFEE",
                "--ui-testing-language=zh-Hans", "--ui-testing-appearance=light"] + extra
            app.launch()
            let activity = app.descendants(matching: .any)["mutual-opportunity-activity-\(id)"].firstMatch
            XCTAssertTrue(activity.waitForExistence(timeout: 8))
            XCTAssertTrue(activity.label.hasPrefix("都想："))
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
            XCTAssertTrue(app.buttons["together-add-intent"].waitForExistence(timeout: 5))
            app.terminate()
        }
    }

    @MainActor
    func testFlexibleTimingChoicesAcrossLanguages() {
        verifyFlexibleTimingConfigurations([("zh-Hans", "light", false), ("en", "dark", false)])
    }

    @MainActor
    func testFlexibleTimingGermanLargestText() {
        verifyFlexibleTimingConfigurations([("de", "light", true)])
    }

    @MainActor
    private func verifyFlexibleTimingConfigurations(_ configurations: [(String, String, Bool)]) {
        for (language, appearance, large) in configurations {
            let app = XCUIApplication()
            app.launchArguments = [
                "--ui-testing-authenticated", "--ui-testing-skip-tutorial",
                "--ui-testing-discover", "--ui-testing-weekly-intent",
                "--ui-testing-mutual-opportunity", "--ui-testing-flexible-timing",
                "--ui-testing-automatic-matching",
                "--ui-testing-together-matching",
                "--ui-testing-language=\(language)", "--ui-testing-appearance=\(appearance)",
            ]
            if large { app.launchArguments.append("--ui-testing-dynamic-type-accessibility") }
            app.launch()
            selectTogetherSection(1, in: app)
            let add = app.buttons["together-add-intent"]
            XCTAssertTrue(app.descendants(matching: .any)["together-home"].waitForExistence(timeout: 8))
            XCTAssertFalse(app.buttons["together-start-matching"].exists)
            XCTAssertFalse(app.buttons["together-restart-matching"].exists)
            XCTAssertFalse(app.descendants(matching: .any)["together-matching-section-title"].exists)
            saveScreenshot(app: app, name: "flexible-opportunity-\(language)-\(appearance)")
            revealFlowElement(add, in: app)
            XCTAssertTrue(add.exists)
            add.tap()
            let activity = app.descendants(matching: .any)["intent-editor-activity"].firstMatch
            XCTAssertTrue(app.descendants(matching: .any)["intent-editor"].waitForExistence(timeout: 5))
            revealFlowElement(activity, in: app)
            XCTAssertTrue(activity.exists)
            activity.tap()
            activity.typeText("Coffee")
            XCTAssertTrue(app.buttons["intent-editor-next"].isEnabled)
            app.buttons["intent-editor-next"].tap()
            saveScreenshot(app: app, name: "flexible-step-entry-\(language)-\(appearance)")
            let undecided = app.buttons["intent-timing-undecided"]
            revealFlowElement(undecided, in: app)
            XCTAssertTrue(undecided.waitForExistence(timeout: 5))
            XCTAssertTrue(undecided.isSelected)
            XCTAssertTrue(app.buttons["intent-editor-save"].isEnabled)
            XCTAssertEqual(app.buttons["intent-editor-save"].label,
                language == "zh-Hans" ? "发布意向" : language == "de" ? (large ? "Aktivieren" : "Vorhaben veröffentlichen") : "Publish intention")
            saveScreenshot(app: app, name: "flexible-undecided-\(language)-\(appearance)")
            let flexible = app.buttons["intent-timing-flexible"]
            revealFlowElement(flexible, in: app)
            flexible.tap()
            XCTAssertTrue(flexible.isSelected)
            let nextWeek = app.buttons["intent-quick-Next week"]
            revealFlowElement(nextWeek, in: app)
            XCTAssertTrue(nextWeek.isEnabled)
            saveScreenshot(app: app, name: "automatic-quick-buttons-\(language)-\(appearance)")
            nextWeek.tap()
            XCTAssertTrue(app.buttons["intent-editor-save"].isEnabled)
            let summary = app.descendants(matching: .any)["intent-timing-summary"].firstMatch
            revealFlowElement(summary, in: app)
            XCTAssertTrue(summary.exists)
            XCTAssertTrue(summary.label.contains("–"), "Next week must select a range, not leave the default tomorrow: \(summary.label)")
            saveScreenshot(app: app, name: "flexible-next-week-\(language)-\(appearance)")
            let exact = app.buttons["intent-timing-exact"]
            for _ in 0..<8 { if exact.isHittable { break }; app.swipeDown() }
            exact.tap()
            XCTAssertTrue(app.buttons["intent-editor-save"].isEnabled)
            app.terminate()
        }
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
                "--ui-testing-discover", "--ui-testing-weekly-intent", "--ui-testing-mutual-opportunity",
                "--ui-testing-related-activity", "--ui-testing-together-matching",
                "--ui-testing-language=\(language)", "--ui-testing-appearance=\(language == "de" ? "dark" : "light")"]
            if largeType { app.launchArguments.append("--ui-testing-dynamic-type-accessibility") }
            app.launch()
            let activity = app.descendants(matching: .any)["mutual-opportunity-activity-\(id)"].firstMatch
            XCTAssertTrue(activity.waitForExistence(timeout: 8))
            XCTAssertTrue(activity.label.contains("喝咖啡"))
            XCTAssertTrue(activity.label.contains("咖啡聊聊"))
            let time = app.descendants(matching: .any)["mutual-opportunity-time-\(id)"].firstMatch
            revealCompactCue(time, in: app)
            XCTAssertTrue(time.label.contains(language == "zh-Hans" ? "共同空闲" : language == "de" ? "Gemeinsam frei" : "Shared time"))
            XCTAssertFalse(app.buttons["mutual-opportunity-fit-details-\(id)"].exists)
            XCTAssertFalse(app.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", "60/100")).firstMatch.exists)
            saveScreenshot(app: app, name: "compact-related-\(language)\(largeType ? "-large" : "")")
            app.terminate()
        }
    }

    @MainActor
    func testOpportunitySwipeDirectionsAndCancellation() {
        let id = "cmutualui0000000000000001"
        for (language, appearance) in [("zh-Hans", "light"), ("de", "dark"), ("en", "light")] {
            let app = XCUIApplication()
            app.launchArguments = [
                "--ui-testing-authenticated", "--ui-testing-skip-tutorial",
                "--ui-testing-discover", "--ui-testing-weekly-intent",
                "--ui-testing-mutual-opportunity", "--ui-testing-together-matching",
                "--ui-testing-opportunity-topic=COFFEE", "--ui-testing-opportunity-list",
                "--ui-testing-language=\(language)", "--ui-testing-appearance=\(appearance)",
            ]
            if language == "en" { app.launchArguments.append("--ui-testing-reduce-motion") }
            app.launch()
            let bar = app.descendants(matching: .any)["mutual-opportunity-swipe-\(id)"]
            let handle = app.descendants(matching: .any)["mutual-opportunity-swipe-handle-\(id)"]
            let activity = app.descendants(matching: .any)["mutual-opportunity-activity-\(id)"]
            XCTAssertTrue(bar.waitForExistence(timeout: 8))
            revealFlowElement(handle, in: app)
            XCTAssertGreaterThanOrEqual(handle.frame.height, 44)
            XCTAssertFalse(app.buttons["mutual-opportunity-no-\(id)"].exists)
            XCTAssertEqual(handle.frame.midX, bar.frame.midX, accuracy: 3, "Decision handle should rest in the center")
            saveScreenshot(app: app, name: "opportunity-swipe-bilateral-\(language)-\(appearance)")

            let restingX = handle.frame.midX
            for dx in [30.0, -30.0] {
                let start = handle.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5))
                start.press(forDuration: 0.1, thenDragTo: start.withOffset(CGVector(dx: dx, dy: 0)))
                XCTAssertTrue(activity.exists)
                XCTAssertEqual(handle.frame.midX, restingX, accuracy: 2)
            }

            let initialY = handle.frame.midY
            var start = handle.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5))
            start.press(forDuration: 0.1, thenDragTo: start.withOffset(CGVector(dx: 0, dy: -130)))
            XCTAssertTrue(activity.exists)
            XCTAssertLessThan(handle.frame.midY, initialY - 20)

            revealFlowElement(handle, in: app)
            start = handle.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5))
            start.press(forDuration: 0.1, thenDragTo: start.withOffset(CGVector(dx: bar.frame.width * 0.40, dy: 0)), withVelocity: .slow, thenHoldForDuration: 0.5)
            XCTAssertTrue(activity.waitForNonExistence(timeout: 5), "Rightward release must save private interest")
            app.terminate()
        }
    }

    @MainActor
    func testOpportunitySwipeLeftCommitsNotInterested() {
        let app = XCUIApplication()
        let id = "cmutualui0000000000000001"
        app.launchArguments = [
            "--ui-testing-authenticated", "--ui-testing-skip-tutorial",
            "--ui-testing-discover", "--ui-testing-weekly-intent",
            "--ui-testing-mutual-opportunity", "--ui-testing-together-matching",
            "--ui-testing-opportunity-topic=COFFEE", "--ui-testing-language=zh-Hans",
        ]
        app.launch()
        let bar = app.descendants(matching: .any)["mutual-opportunity-swipe-\(id)"]
        let handle = app.descendants(matching: .any)["mutual-opportunity-swipe-handle-\(id)"]
        let activity = app.descendants(matching: .any)["mutual-opportunity-activity-\(id)"]
        XCTAssertTrue(bar.waitForExistence(timeout: 8))
        revealFlowElement(handle, in: app)
        let start = handle.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5))
        start.press(forDuration: 0.1, thenDragTo: start.withOffset(CGVector(dx: -bar.frame.width * 0.40, dy: 0)), withVelocity: .slow, thenHoldForDuration: 0.5)
        XCTAssertTrue(activity.waitForNonExistence(timeout: 5), "Leftward release must submit not interested")
        app.terminate()
    }

    @MainActor
    private func togetherApp(_ extra: [String] = []) -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments = ["--ui-testing-authenticated", "--ui-testing-skip-tutorial",
            "--ui-testing-discover", "--ui-testing-weekly-intent", "--ui-testing-mutual-opportunity",
            "--ui-testing-automatic-matching", "--ui-testing-together-matching",
            "--ui-testing-flexible-timing", "--ui-testing-discovery-matching"] + extra
        app.launch()
        if extra.contains("--ui-testing-chats") {
            tabButton(in: app, labels: ["Together", "同行", "Zusammen"]).tap()
        }
        XCTAssertTrue(app.descendants(matching: .any)["together-home"].waitForExistence(timeout: 8))
        return app
    }

    @MainActor
    private func selectTogetherSection(_ index: Int, in app: XCUIApplication) {
        let raw = ["recommendations", "intentions", "explore"][index]
        let button = app.buttons["together-tab-\(raw)"].firstMatch
        if button.waitForExistence(timeout: 2) { button.tap() }
        else {
            let picker = app.segmentedControls["together-segmented-control"]
            XCTAssertTrue(picker.waitForExistence(timeout: 5), app.debugDescription)
            picker.buttons.element(boundBy: index).tap()
        }
    }

    @MainActor
    func testTogetherTabsSeparateRecommendationsIntentionsAndExplore() {
        let app = togetherApp(["--ui-testing-intent-card-states", "--ui-testing-explore-intents",
            "--ui-testing-language=zh-Hans", "--ui-testing-appearance=light"])
        let opportunity = app.descendants(matching: .any)["mutual-opportunity-cmutualui0000000000000001"].firstMatch
        XCTAssertTrue(opportunity.waitForExistence(timeout: 5), app.debugDescription)
        XCTAssertFalse(app.descendants(matching: .any)["weekly-intent-ui-intent-coffee"].exists)
        XCTAssertFalse(app.descendants(matching: .any)["explore-intent-ui-explore-0"].exists)
        saveScreenshot(app: app, name: "together-tabs-recommendations-zh")

        selectTogetherSection(1, in: app)
        let coffee = app.descendants(matching: .any)["weekly-intent-ui-intent-coffee"].firstMatch
        XCTAssertTrue(coffee.waitForExistence(timeout: 5))
        XCTAssertFalse(opportunity.exists)
        XCTAssertTrue(app.staticTexts["正在寻找"].exists)
        let pause = app.buttons["weekly-intent-pause-ui-intent-coffee"]
        revealFlowElement(pause, in: app)
        XCTAssertTrue(pause.isHittable)
        pause.tap()
        XCTAssertTrue(app.staticTexts["已暂停"].firstMatch.waitForExistence(timeout: 5))
        XCTAssertEqual(pause.label, "恢复寻找同行")
        pause.tap()
        XCTAssertTrue(app.staticTexts["正在寻找"].waitForExistence(timeout: 5))
        let edit = app.buttons["weekly-intent-edit-ui-intent-coffee"]
        revealFlowElement(edit, in: app)
        edit.tap()
        XCTAssertTrue(app.descendants(matching: .any)["intent-editor"].waitForExistence(timeout: 5))
        XCTAssertEqual(app.textFields["intent-editor-activity"].value as? String, "Coffee after class")
        app.buttons["取消"].tap()
        XCTAssertTrue(coffee.waitForExistence(timeout: 5))
        saveScreenshot(app: app, name: "together-tabs-intentions-zh")

        selectTogetherSection(2, in: app)
        XCTAssertTrue(app.descendants(matching: .any)["explore-intent-ui-explore-0"].waitForExistence(timeout: 5))
        XCTAssertFalse(coffee.exists)
        XCTAssertFalse(opportunity.exists)
        XCTAssertFalse(app.staticTexts["Mia"].exists)
        saveScreenshot(app: app, name: "together-tabs-explore-zh")
        let use = app.buttons["explore-use-ui-explore-0"]
        revealFlowElement(use, in: app)
        use.tap()
        XCTAssertTrue(app.buttons["intent-topic-sports"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.buttons["intent-topic-sports"].isSelected)
        app.buttons["取消"].tap()
        XCTAssertTrue(use.waitForExistence(timeout: 5), "Cancel must return to Explore, not recommendations")
        selectTogetherSection(0, in: app)
        XCTAssertTrue(opportunity.waitForExistence(timeout: 5), "Browsing Explore must not consume a recommendation")
        app.terminate()
    }

    @MainActor
    func testIntentionsSaveOnceWithoutSeparateFindingConfirmation() {
        let app = togetherApp(["--ui-testing-intent-card-states", "--ui-testing-explore-intents",
            "--ui-testing-language=en", "--ui-testing-appearance=light"])
        selectTogetherSection(1, in: app)
        XCTAssertTrue(app.buttons["weekly-intent-pause-ui-intent-coffee"].waitForExistence(timeout: 5))
        XCTAssertFalse(app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH %@", "weekly-intent-publish-")).firstMatch.exists)
        XCTAssertFalse(app.buttons["Review and start"].exists)
        let legacyStatus = app.staticTexts["weekly-intent-status-ui-intent-study"].firstMatch
        revealFlowElement(legacyStatus, in: app)
        XCTAssertEqual(legacyStatus.label, "Not finding yet", "Do not silently publish an old saved intention")
        saveScreenshot(app: app, name: "intentions-no-extra-confirmation")
        let edit = app.buttons["weekly-intent-edit-ui-intent-study"]
        revealFlowElement(edit, in: app)
        edit.tap()
        XCTAssertTrue(app.buttons["intent-editor-next"].waitForExistence(timeout: 5))
        app.buttons["intent-editor-next"].tap()
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
        XCTAssertTrue(app.buttons["intent-editor-next"].waitForExistence(timeout: 5))
        app.buttons["intent-editor-next"].tap()
        app.buttons["intent-editor-save"].tap()
        XCTAssertTrue(app.descendants(matching: .any)["intent-editor"].waitForNonExistence(timeout: 5))
        let pausedStatus = app.staticTexts["weekly-intent-status-ui-intent-sports"].firstMatch
        revealFlowElement(pausedStatus, in: app)
        XCTAssertEqual(pausedStatus.label, "Paused", "Saving edits must not undo a deliberate pause")
        let resume = app.buttons["weekly-intent-pause-ui-intent-sports"]
        revealFlowElement(resume, in: app)
        resume.tap()
        XCTAssertEqual(pausedStatus.label, "Finding company", "Resume is one action, without another confirmation")
        app.terminate()
    }

    @MainActor
    func testTogetherCreateReturnsToIntentionsWithoutPublishingExplore() {
        let app = togetherApp(["--ui-testing-intent-card-states", "--ui-testing-explore-intents",
            "--ui-testing-language=zh-Hans"])
        selectTogetherSection(1, in: app)
        app.scrollViews["together-section-intentions"].swipeUp(velocity: .slow)
        selectTogetherSection(2, in: app)
        let use = app.buttons["explore-use-ui-explore-1"]
        revealFlowElement(use, in: app)
        use.tap()
        XCTAssertTrue(app.textFields["intent-editor-activity"].waitForExistence(timeout: 5))
        XCTAssertEqual(app.textFields["intent-editor-activity"].value as? String, "Coffee after class")
        app.buttons["intent-editor-next"].tap()
        let visibility = app.switches["intent-explore-visible"].firstMatch
        revealFlowElement(visibility, in: app)
        XCTAssertEqual(visibility.value as? String, "0", "Explore sharing requires an explicit choice")
        app.buttons["intent-editor-save"].tap()
        let created = app.descendants(matching: .any)["weekly-intent-ui-intent-created"].firstMatch
        XCTAssertTrue(created.waitForExistence(timeout: 5))
        XCTAssertGreaterThan(created.frame.minY, app.segmentedControls["together-segmented-control"].frame.maxY)
        XCTAssertLessThan(created.frame.minY, app.frame.height * 0.55, "A new intention is intentionally revealed at the top")
        revealFlowElement(created, in: app)
        let exploreViewport = app.descendants(matching: .any)["explore-intents-list"].firstMatch
        XCTAssertFalse(exploreViewport.frame.intersects(app.frame), "Retained Explore must be offscreen, not presented over My intentions")
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
        selectTogetherSection(2, in: app)
        XCTAssertTrue(app.descendants(matching: .any)["explore-intents-empty"].waitForExistence(timeout: 5))
        XCTAssertFalse(app.descendants(matching: .any)["together-set-intent"].exists)
        selectTogetherSection(0, in: app)
        let viewMine = app.buttons["together-discovery-empty-action"]
        XCTAssertTrue(viewMine.waitForExistence(timeout: 5))
        viewMine.tap()
        XCTAssertTrue(app.descendants(matching: .any)["together-set-intent"].waitForExistence(timeout: 5))
        saveScreenshot(app: app, name: "together-tabs-first-use-zh")
        app.terminate()
    }

    @MainActor
    func testTogetherExploreUnavailableKeepsNavigation() {
        let app = togetherApp(["--ui-testing-discovery-published", "--ui-testing-language=en"])
        selectTogetherSection(2, in: app)
        XCTAssertTrue(app.descendants(matching: .any)["explore-unavailable"].waitForExistence(timeout: 5))
        XCTAssertFalse(app.descendants(matching: .any)["explore-intents-empty"].exists)
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
            let app = togetherApp(args)
            selectTogetherSection(1, in: app)
            let edit = app.buttons["weekly-intent-edit-ui-intent-coffee"]
            revealFlowElement(edit, in: app)
            XCTAssertTrue(edit.isHittable)
            XCTAssertGreaterThanOrEqual(edit.frame.height, 44)
            XCTAssertLessThanOrEqual(edit.frame.maxX, app.frame.maxX)
            saveScreenshot(app: app, name: "together-tabs-intentions-\(language)-dark")
            selectTogetherSection(2, in: app)
            let use = app.buttons["explore-use-ui-explore-0"]
            revealFlowElement(use, in: app)
            XCTAssertTrue(use.isHittable)
            XCTAssertLessThanOrEqual(use.frame.maxX, app.frame.maxX)
            saveScreenshot(app: app, name: "together-tabs-explore-\(language)-dark")
            app.terminate()
        }
    }

    @MainActor
    func testExplorePlusStateSupportsActivitySearch() {
        let app = togetherApp(["--ui-testing-explore-intents", "--ui-testing-explore-plus",
            "--ui-testing-language=en", "--ui-testing-appearance=light"])
        selectTogetherSection(2, in: app)
        let search = app.textFields["explore-search"]
        XCTAssertTrue(search.waitForExistence(timeout: 5))
        search.tap()
        search.typeText("Badminton")
        XCTAssertTrue(app.descendants(matching: .any)["explore-intent-ui-explore-0"].waitForExistence(timeout: 3))
        XCTAssertFalse(app.descendants(matching: .any)["explore-intent-ui-explore-1"].exists)
        app.terminate()
    }

    @MainActor
    func testOpportunitySwipeReturnsToIdleAfterFailedSave() {
        let app = XCUIApplication()
        app.launchArguments = [
            "--ui-testing-authenticated", "--ui-testing-skip-tutorial",
            "--ui-testing-discover", "--ui-testing-weekly-intent",
            "--ui-testing-mutual-opportunity", "--ui-testing-together-matching",
            "--ui-testing-opportunity-topic=COFFEE", "--ui-testing-opportunity-decision-failure",
            "--ui-testing-opportunity-retry-success",
            "--ui-testing-language=en", "--ui-testing-appearance=light",
        ]
        app.launch()
        let id = "cmutualui0000000000000001"
        let handle = app.descendants(matching: .any)["mutual-opportunity-swipe-handle-\(id)"]
        let bar = app.descendants(matching: .any)["mutual-opportunity-swipe-\(id)"]
        revealFlowElement(handle, in: app)
        let restingX = handle.frame.midX
        swipeOpportunityInterest(id: id, in: app)
        XCTAssertTrue(app.staticTexts["UI test: choice was not saved."].waitForExistence(timeout: 5))
        XCTAssertTrue(bar.waitForExistence(timeout: 5))
        XCTAssertEqual(handle.frame.midX, restingX, accuracy: 2)
        let activity = app.descendants(matching: .any)["mutual-opportunity-activity-\(id)"]
        XCTAssertTrue(activity.exists)
        // The handle is a SwiftUI accessibility wrapper over a UIKit pan surface.
        // Verify the actual second touch/release, not only the wrapper's hit-test report.
        let frame = handle.frame
        XCTAssertTrue(app.scrollViews.firstMatch.frame.contains(CGPoint(x: frame.midX, y: frame.midY)))
        let origin = app.coordinate(withNormalizedOffset: .zero)
        let start = origin.withOffset(CGVector(dx: frame.midX, dy: frame.midY))
        start.press(forDuration: 0.1,
            thenDragTo: start.withOffset(CGVector(dx: bar.frame.width * 0.40, dy: 0)),
            withVelocity: .slow, thenHoldForDuration: 0.4)
        XCTAssertTrue(activity.waitForNonExistence(timeout: 5), "The retry gesture must commit successfully after the first failed save")
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
            XCTAssertLessThanOrEqual(peer.frame.maxY, activity.frame.minY)
            XCTAssertLessThanOrEqual(activity.frame.maxY, time.frame.minY)
            XCTAssertFalse(app.descendants(matching: .any)["mutual-opportunity-fit-details-\(id)"].exists)
            XCTAssertFalse(app.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", "/100")).firstMatch.exists)
            let decision = app.descendants(matching: .any)["mutual-opportunity-swipe-\(id)"]
            let open = app.buttons["mutual-opportunity-open-\(id)"]
            if state == "NEEDS_DECISION" {
                revealFlowElement(decision, in: app)
                XCTAssertTrue(decision.exists)
                XCTAssertFalse(app.buttons["mutual-opportunity-no-\(id)"].exists)
                XCTAssertFalse(open.exists, "Planning is unavailable before mutual consent")
            } else if state == "DECIDED" {
                let withdraw = app.buttons["撤回"]
                revealFlowElement(withdraw, in: app)
                XCTAssertFalse(decision.exists)
                XCTAssertFalse(open.exists, "A private YES must not unlock planning")
            } else {
                revealFlowElement(open, in: app)
                XCTAssertTrue(open.isEnabled)
                XCTAssertFalse(decision.exists)
            }
            saveScreenshot(app: app, name: "opportunity-\(topic.lowercased())-\(state.lowercased())-\(appearance)")
            if state == "NEEDS_DECISION" {
                if topic == "FOOD" {
                    swipeOpportunityNotInterested(id: id, in: app)
                } else {
                    swipeOpportunityInterest(id: id, in: app)
                }
                XCTAssertTrue(activity.waitForNonExistence(timeout: 5))
            } else if state == "DECIDED" {
                app.buttons["撤回"].tap()
                XCTAssertTrue(activity.waitForNonExistence(timeout: 5))
            }
            app.terminate()
        }
    }

    @MainActor
    func testTogetherFlowEditorLightAndDark() {
        for appearance in ["light", "dark"] {
            let app = XCUIApplication()
            app.launchArguments = [
                "--ui-testing-authenticated", "--ui-testing-skip-tutorial",
                "--ui-testing-discover", "--ui-testing-weekly-intent",
                "--ui-testing-mutual-opportunity", "--ui-testing-together-matching",
                "--ui-testing-language=zh-Hans", "--ui-testing-appearance=\(appearance)",
            ]
            app.launch()
            XCTAssertTrue(app.descendants(matching: .any)["together-home"].waitForExistence(timeout: 8))
            saveScreenshot(app: app, name: "flow-together-\(appearance)")
            selectTogetherSection(1, in: app)
            let addIntent = app.buttons["together-add-intent"]
            revealFlowElement(addIntent, in: app)
            addIntent.tap()
            let coffee = app.buttons["intent-topic-coffee"]
            XCTAssertTrue(coffee.waitForExistence(timeout: 5))
            XCTAssertTrue(coffee.isSelected)
            saveScreenshot(app: app, name: "flow-activity-picker-\(appearance)")
            let explore = app.buttons["intent-topic-explore"]
            revealFlowElement(explore, in: app)
            explore.tap()
            XCTAssertTrue(explore.isSelected)
            revealFlowElement(coffee, in: app)
            coffee.tap()
            XCTAssertTrue(coffee.isSelected)
            let activity = app.descendants(matching: .any)["intent-editor-activity"].firstMatch
            XCTAssertTrue(activity.waitForExistence(timeout: 5))
            revealFlowElement(activity, in: app)
            activity.tap()
            activity.typeText("课后喝咖啡")
            let next = app.buttons["intent-editor-next"]
            XCTAssertTrue(next.isEnabled)
            saveScreenshot(app: app, name: "flow-intent-activity-\(appearance)")
            next.tap()
            let save = app.buttons["intent-editor-save"]
            XCTAssertTrue(save.waitForExistence(timeout: 3))
            XCTAssertTrue(save.isEnabled)
            XCTAssertTrue(save.isHittable)
            saveScreenshot(app: app, name: "flow-intent-times-\(appearance)")
            app.buttons["intent-editor-back"].tap()
            XCTAssertEqual(activity.value as? String, "课后喝咖啡")
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
            "--ui-testing-language=de", "--ui-testing-appearance=dark",
            "--ui-testing-dynamic-type-accessibility",
        ]
        app.launch()
        selectTogetherSection(1, in: app)
        let addIntent = app.buttons["together-add-intent"]
        revealFlowElement(addIntent, in: app)
        addIntent.tap()
        let coffee = app.buttons["intent-topic-coffee"]
        XCTAssertTrue(coffee.waitForExistence(timeout: 5))
        XCTAssertTrue(coffee.isSelected)
        XCTAssertGreaterThan(coffee.frame.width, app.frame.width * 0.7,
                             "Accessibility text should use a single-column category picker")
        let explore = app.buttons["intent-topic-explore"]
        let fields = app.descendants(matching: .any)["intent-editor-fields"].firstMatch
        saveScreenshot(app: app, name: "flow-activity-picker-de-large-type-initial")
        for _ in 0..<8 where !explore.exists || !explore.isHittable {
            fields.swipeUp()
        }
        saveScreenshot(app: app, name: "flow-activity-picker-de-large-type-scrolled")
        XCTAssertTrue(explore.isHittable)
        XCTAssertGreaterThanOrEqual(explore.frame.height, 44)
        explore.tap()
        XCTAssertTrue(explore.isSelected)
        XCTAssertFalse(coffee.isSelected)
        saveScreenshot(app: app, name: "flow-activity-picker-de-large-type")
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
    private func swipeOpportunityInterest(id: String, in app: XCUIApplication) {
        let handle = app.descendants(matching: .any)["mutual-opportunity-swipe-handle-\(id)"]
        let bar = app.descendants(matching: .any)["mutual-opportunity-swipe-\(id)"]
        revealFlowElement(handle, in: app)
        let start = handle.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5))
        let end = start.withOffset(CGVector(dx: bar.frame.width * 0.40, dy: 0))
        start.press(forDuration: 0.1, thenDragTo: end, withVelocity: .slow, thenHoldForDuration: 0.4)
    }

    @MainActor
    private func swipeOpportunityNotInterested(id: String, in app: XCUIApplication) {
        let handle = app.descendants(matching: .any)["mutual-opportunity-swipe-handle-\(id)"]
        let bar = app.descendants(matching: .any)["mutual-opportunity-swipe-\(id)"]
        revealFlowElement(handle, in: app)
        let start = handle.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5))
        let end = start.withOffset(CGVector(dx: -bar.frame.width * 0.40, dy: 0))
        start.press(forDuration: 0.1, thenDragTo: end, withVelocity: .slow, thenHoldForDuration: 0.4)
    }

    @MainActor
    private func revealFlowElement(_ element: XCUIElement, in app: XCUIApplication) {
        let fields = app.descendants(matching: .any)["intent-editor-fields"].firstMatch
        // Retained pages leave offscreen UIKit scroll containers in the hierarchy.
        // Drive the visible viewport, never whichever container was created first.
        let scroll = app.scrollViews.allElementsBoundByIndex.filter {
            let visible = $0.frame.intersection(app.frame)
            return !visible.isNull && visible.width > app.frame.width * 0.8 && visible.height > 80
        }.max { $0.frame.intersection(app.frame).height < $1.frame.intersection(app.frame).height }
        let surface = fields.exists ? fields : scroll ?? app
        for _ in 0..<12 {
            let visible = surface.frame.intersection(app.frame)
            if element.exists, element.isHittable,
               element.frame.midY > visible.minY + 24,
               element.frame.midY < visible.maxY - 24 { break }
            if element.exists, element.frame.midY < visible.minY + 24 {
                surface.swipeDown(velocity: .slow)
            } else {
                surface.swipeUp(velocity: .slow)
            }
        }
        if !element.isHittable {
            saveScreenshot(app: app, name: "flow-unhittable-diagnostic")
            print("FLOW_DIAGNOSTIC: \(element.identifier) element=\(element.frame) surface=\(surface.frame)")
        }
        XCTAssertTrue(element.exists)
        XCTAssertTrue(element.isHittable)
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
    func testCapturePlanInviteCard() throws {
        let appearance = Self.resolvedAppearance()
        XCTAssertTrue(["light", "dark"].contains(appearance), "appearance must be light|dark")

        let app = XCUIApplication()
        app.launchArguments = [
            "--ui-testing-authenticated",
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
        XCTAssertTrue(app.buttons["等待回应"].exists)
        XCTAssertTrue(app.buttons["即将开始"].exists)
        XCTAssertTrue(app.buttons["已结束"].exists)
        XCTAssertTrue(app.staticTexts["在对话中管理"].firstMatch.exists)
        XCTAssertFalse(app.staticTexts["Past & Ended"].exists)
        XCTAssertFalse(app.staticTexts["Manage in conversation"].exists)

        let planRow = app.buttons["plans-row-ui-plan-1"]
        XCTAssertTrue(planRow.waitForExistence(timeout: 5))
        planRow.tap()

        let actions = app.descendants(matching: .any)["plan-card-actions-ui-plan-1"]
        XCTAssertTrue(actions.waitForExistence(timeout: 5))
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
