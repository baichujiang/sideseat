import XCTest

@MainActor final class PlanStatePresentationUITests: XCTestCase {
    private var app: XCUIApplication!

    private func launch(accessibility: Bool = false, layout: Bool = false, reference: Bool = false, loading: Bool = false, longList: Bool = false, language: String = "zh-Hans", empty: Bool = false, contentSizeCategory: String? = nil) {
        app?.terminate()
        if let bundle = ProcessInfo.processInfo.environment["SIDESEAT_PLAN_PRESENTATION_QA_BUNDLE"] {
            app = XCUIApplication(bundleIdentifier: bundle)
        } else { app = XCUIApplication() }
        app.launchArguments = ["--ui-testing-authenticated", "--ui-testing-ephemeral-credentials",
            "--ui-testing-skip-tutorial", "--ui-testing-chats", "--ui-testing-language=\(language)", "--ui-testing-local-api"]
        if accessibility { app.launchArguments += ["--ui-testing-appearance=dark", "--ui-testing-dynamic-type-accessibility"] }
        if layout { app.launchArguments += ["--ui-testing-plans-mixed-waiting", "--ui-testing-plans-waiting-rail"] }
        if reference { app.launchArguments += ["--ui-testing-mutual-opportunity"] }
        if loading { app.launchArguments += ["--ui-testing-plans-loading"] }
        if longList { app.launchArguments += ["--ui-testing-plans-long-list"] }
        if empty { app.launchArguments += ["--ui-testing-plans-empty"] }
        if let contentSizeCategory { app.launchArguments += ["-UIPreferredContentSizeCategoryName", contentSizeCategory] }
        app.launchEnvironment["SIDESEAT_API_BASE_URL_OVERRIDE"] = "http://127.0.0.1:9"
        app.launch()
        XCTAssertTrue(app.tabBars.firstMatch.waitForExistence(timeout: 20))
        app.tabBars.buttons[language == "de" ? "Pläne" : language == "en" ? "Plans" : "计划"].tap()
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
        let createY = homeCreate.frame.minY
        let scroll = app.scrollViews["plans-scroll-waitingResponse"]
        let cards = scroll.buttons.matching(NSPredicate(format: "identifier BEGINSWITH 'plans-row-'"))
        guard let first = cards.allElementsBoundByIndex.first(where: { $0.isHittable }) else {
            XCTFail("A plan card must be visible before scrolling"); return
        }
        let firstID = first.identifier, firstY = first.frame.minY
        scroll.swipeUp(velocity: .slow)
        guard let after = cards.allElementsBoundByIndex.first(where: { $0.isHittable }) else {
            XCTFail("A plan card must be visible after scrolling"); return
        }
        XCTAssertTrue(after.identifier != firstID || abs(after.frame.minY - firstY) > 20,
                      "A visible card must move or change before checking the fixed toolbar")
        XCTAssertTrue(app.buttons["plans-create-unified"].isHittable,
                      "Creation remains in its independent bottom action area while the list scrolls")
        XCTAssertEqual(homeCreate.frame.minY, createY, accuracy: 2)
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
        let historyBar = app.navigationBars["历史计划"]
        XCTAssertTrue(historyBar.waitForExistence(timeout: 10))
        historyBar.buttons.firstMatch.tap()
        XCTAssertTrue(picker.waitForExistence(timeout: 10))
        XCTAssertTrue(picker.buttons.element(boundBy: 1).isSelected)
        XCTAssertTrue(app.navigationBars["计划"].exists)
        assertRootToolbar(language: "zh-Hans")
        capture("confirmed-tab-after-history")
        homeCreate.tap()
        XCTAssertTrue(app.descendants(matching: .any)["time-poll-title"].firstMatch.waitForExistence(timeout: 10))
        let cancel = app.navigationBars.buttons["取消"]
        XCTAssertTrue(cancel.isHittable); cancel.tap()
        XCTAssertTrue(picker.waitForExistence(timeout: 10))
        XCTAssertTrue(picker.buttons.element(boundBy: 1).isSelected)
        assertRootToolbar(language: "zh-Hans")
        capture("confirmed-tab-after-create-cancel")
    }

    func testHomeToolbarAcrossLanguagesSizesAndPlanStates() {
        // Both store states use an intentionally offline coordinated-plan endpoint;
        // these checks accept root navigation and the bottom action area, not a clean empty/error page.
        continueAfterFailure = false
        for language in ["zh-Hans", "de"] {
            for large in [false, true] {
                for empty in [true, false] {
                    let tag = "\(language)-\(large ? "largest" : "normal")-\(empty ? "empty-store" : "populated-store")"
                    launch(accessibility: large, layout: !empty, longList: !empty,
                           language: language, empty: empty, contentSizeCategory: "UICTContentSizeCategoryL")
                    let expectedCreateID = empty ? "plans-create-primary" : "plans-create-unified"
                    XCTAssertTrue(app.buttons[expectedCreateID].waitForExistence(timeout: 10))
                    if empty {
                        // This empties PlansStore only; the coordinated-plan endpoint is intentionally offline.
                        // Verify the stable toolbar, not a clean whole-page empty state.
                        XCTAssertTrue(app.descendants(matching: .any)["plans-loading"].firstMatch.waitForNonExistence(timeout: 10))
                    } else {
                        XCTAssertTrue(app.buttons["plans-row-ui-plan-1"].waitForExistence(timeout: 10))
                    }
                    let picker = app.descendants(matching: .any)["plans-segmented-control"].firstMatch
                    XCTAssertEqual(picker.buttons.count, 2)
                    XCTAssertTrue(picker.buttons.element(boundBy: 0).isSelected)
                    assertRootToolbar(language: language)
                    capture("home-toolbar-\(tag)")
                }
            }
        }
    }

    func testGermanToolbarKeepsTheFullActionBeforeTheIconOnlyThreshold() {
        continueAfterFailure = false
        launch(layout: true, language: "de", contentSizeCategory: "UICTContentSizeCategoryL")
        XCTAssertTrue(app.buttons["plans-row-ui-plan-1"].waitForExistence(timeout: 10))
        assertRootToolbar(language: "de")
        let regularWidth = homeCreate.frame.width
        launch(layout: true, language: "de", contentSizeCategory: "UICTContentSizeCategoryXXL")
        XCTAssertTrue(app.buttons["plans-row-ui-plan-1"].waitForExistence(timeout: 10))
        assertRootToolbar(language: "de")
        XCTAssertGreaterThan(homeCreate.frame.width, regularWidth + 1,
                             "The system xxLarge argument must visibly enlarge the full action, rather than leave the default size or show only a plus")
        capture("home-toolbar-de-xxLarge-populated")
    }

    private var homeCreate: XCUIElement {
        app.buttons.matching(NSPredicate(format: "identifier IN %@", ["plans-create-primary", "plans-create-unified"])).firstMatch
    }

    private func assertRootToolbar(language: String) {
        let nav = app.navigationBars.firstMatch
        let heading = app.descendants(matching: .any)["root-navigation-title"].firstMatch
        let create = homeCreate
        let history = app.buttons["plans-history"]
        XCTAssertTrue(heading.waitForExistence(timeout: 10))
        XCTAssertTrue(create.isHittable && history.isHittable)
        XCTAssertTrue(heading.label.contains(language == "de" ? "Pläne" : language == "en" ? "Plans" : "计划"))
        XCTAssertEqual(create.label, language == "de" ? "Plan starten" : language == "en" ? "Start a plan" : "发起计划")
        let createPredicate = NSPredicate(format: "identifier IN %@", ["plans-create-primary", "plans-create-unified"])
        XCTAssertEqual(nav.buttons.matching(createPredicate).count, 0,
                       "Creation belongs to the independent bottom action area")
        XCTAssertEqual(app.buttons.matching(createPredicate).count, 1)
        for element in [heading, history] {
            let frame = element.frame
            XCTAssertFalse(frame.isEmpty)
            XCTAssertGreaterThanOrEqual(frame.minX, nav.frame.minX - 1)
            XCTAssertLessThanOrEqual(frame.maxX, nav.frame.maxX + 1)
            XCTAssertGreaterThanOrEqual(frame.minY, nav.frame.minY - 1)
            XCTAssertLessThanOrEqual(frame.maxY, nav.frame.maxY + 1)
        }
        for control in [create, history] {
            // CGRect arithmetic can represent an exact 44pt span as 43.99999999999999.
            XCTAssertGreaterThanOrEqual(control.frame.width, 44 - 0.001)
            XCTAssertGreaterThanOrEqual(control.frame.height, 44 - 0.001)
        }
        XCTAssertLessThanOrEqual(history.frame.maxX, heading.frame.minX + 1)
        let window = app.windows.firstMatch.frame
        let picker = app.descendants(matching: .any)["plans-segmented-control"].firstMatch
        let tabBar = app.tabBars.firstMatch
        XCTAssertTrue(window.insetBy(dx: -0.501, dy: -0.501).contains(create.frame))
        XCTAssertEqual(create.frame.maxX, picker.frame.maxX, accuracy: 1,
                       "The action shares the page's trailing alignment")
        XCTAssertGreaterThan(create.frame.midX, window.midX)
        XCTAssertLessThanOrEqual(create.frame.maxY, tabBar.frame.minY - 1,
                                 "The full action must remain above the tab bar")
        for section in ["waitingResponse", "upcoming"] {
            let page = app.scrollViews["plans-scroll-\(section)"]
            XCTAssertEqual(page.buttons.matching(createPredicate).count, 0)
            if app.buttons["plans-tab-\(section)"].isSelected {
                XCTAssertTrue(page.exists && page.isHittable)
                XCTAssertLessThanOrEqual(page.frame.maxY, create.frame.minY + 0.501,
                                         "The list viewport must end before the fixed creation action")
            }
        }
        print("PLAN_HOME_CHROME \(language) heading=\(heading.frame) create=\(create.frame) history=\(history.frame) tabBar=\(tabBar.frame)")
    }

    /// Existing legacy fixtures deliberately use an offline coordinated endpoint.
    /// These captures cover layout/navigation, and are not clean API/empty-state evidence.
    func testHomeRedesignPopulatedNavigationAndWaitingAcrossTextSizes() {
        continueAfterFailure = false
        for (language, large) in [("zh-Hans", false), ("de", true)] {
            let tag = "\(language)-\(large ? "system-largest-dark" : "normal-light")"
            launch(accessibility: large, layout: true, language: language,
                   contentSizeCategory: large ? "UICTContentSizeCategoryAccessibilityXXXL" : "UICTContentSizeCategoryL")
            let first = app.buttons["plans-row-ui-plan-1"]
            XCTAssertTrue(first.waitForExistence(timeout: 10))
            assertHomeSection("waitingResponse", language: language)
            capture("home-redesign-offline-filled-\(tag)")
            let firstPart = revealHomeItem(first, section: "waitingResponse")
            assertKnownCardTime(first, dayOffset: 1, hourOffset: 14, durationMinutes: 60, language: language)
            tapHomeItem(first, visible: firstPart)
            XCTAssertTrue(app.descendants(matching: .any)["direct-chat"].firstMatch.waitForExistence(timeout: 10))
            XCTAssertTrue(app.buttons["plan-card-accept-ui-plan-1"].waitForExistence(timeout: 10))
            capture("home-redesign-original-invitation-\(tag)")
            app.navigationBars.firstMatch.buttons.firstMatch.tap()
            assertHomeSection("waitingResponse", language: language)

            if large {
                XCTAssertFalse(app.scrollViews["plans-waiting-rail"].exists)
                XCTAssertFalse(app.buttons["plans-toggle-outgoing"].exists)
                let outgoing = app.buttons["plans-row-ui-plan-outgoing"]
                let last = app.buttons["plans-row-ui-plan-outgoing-3"]
                _ = revealHomeItem(outgoing, section: "waitingResponse")
                assertKnownCardTime(outgoing, dayOffset: 1, hourOffset: 13, durationMinutes: 60, language: language)
                capture("home-redesign-vertical-waiting-first-\(tag)")
                _ = revealHomeItem(last, section: "waitingResponse")
                XCTAssertEqual(outgoing.frame.minX, last.frame.minX, accuracy: 1)
                XCTAssertGreaterThan(last.frame.minY, outgoing.frame.minY)
                capture("home-redesign-vertical-waiting-last-\(tag)")
            } else {
                let rail = app.scrollViews["plans-waiting-rail"]
                _ = revealHomeItem(rail, section: "waitingResponse", complete: true)
                let cards = rail.buttons.matching(NSPredicate(format: "identifier BEGINSWITH 'plans-row-'"))
                guard let before = cards.allElementsBoundByIndex.first(where: { $0.isHittable }) else {
                    XCTFail("A real waiting card must be visible before swiping its rail"); return
                }
                assertKnownCardTime(before, dayOffset: 1, hourOffset: 13, durationMinutes: 60, language: language)
                let beforeID = before.identifier, beforeX = before.frame.minX
                rail.coordinate(withNormalizedOffset: CGVector(dx: 0.82, dy: 0.5))
                    .press(forDuration: 0.08,
                           thenDragTo: rail.coordinate(withNormalizedOffset: CGVector(dx: 0.18, dy: 0.5)),
                           withVelocity: .slow, thenHoldForDuration: 0.2)
                guard let after = cards.allElementsBoundByIndex.first(where: { $0.isHittable }) else {
                    XCTFail("A real waiting card must remain visible after the rail moves"); return
                }
                XCTAssertTrue(after.identifier != beforeID || abs(after.frame.minX - beforeX) > 20)
                assertHomeSection("waitingResponse", language: language)
                capture("home-redesign-horizontal-waiting-\(tag)")
            }

            app.buttons["plans-tab-upcoming"].tap()
            assertHomeSection("upcoming", language: language)
            let confirmed = app.buttons["plans-row-ui-plan-accepted"]
            _ = revealHomeItem(confirmed, section: "upcoming")
            assertKnownCardTime(confirmed, dayOffset: 2, hourOffset: 18, durationMinutes: 90, language: language)
            capture("home-redesign-confirmed-\(tag)")
            homeCreate.tap()
            XCTAssertTrue(app.descendants(matching: .any)["time-poll-title"].firstMatch.waitForExistence(timeout: 10))
            capture("home-redesign-creation-\(tag)")
            let cancel = app.navigationBars.buttons[language == "de" ? "Abbrechen" : "取消"]
            assertHomeTarget(cancel); cancel.tap()
            assertHomeSection("upcoming", language: language)

            app.buttons["plans-history"].tap()
            let history = app.descendants(matching: .any)["plans-history-root"].firstMatch
            XCTAssertTrue(history.waitForExistence(timeout: 10))
            let record = app.buttons["plans-row-ui-plan-completed"]
            let recordPart = revealHomeItem(record, section: "ended")
            capture("home-redesign-history-\(tag)")
            tapHomeItem(record, visible: recordPart)
            XCTAssertTrue(app.descendants(matching: .any)["direct-chat"].firstMatch.waitForExistence(timeout: 10))
            app.navigationBars.firstMatch.buttons.firstMatch.tap()
            XCTAssertTrue(history.waitForExistence(timeout: 10))
            app.navigationBars.firstMatch.buttons.firstMatch.tap()
            assertHomeSection("upcoming", language: language)
            capture("home-redesign-history-return-\(tag)")
        }
    }

    func testHomeRedesignLoadingAndEmptyStoreKeepIndependentCreation() {
        continueAfterFailure = false
        for (language, large) in [("zh-Hans", false), ("de", true)] {
            let tag = "\(language)-\(large ? "system-largest-dark" : "normal-light")"
            launch(accessibility: large, loading: true, language: language, empty: true,
                   contentSizeCategory: large ? "UICTContentSizeCategoryAccessibilityXXXL" : "UICTContentSizeCategoryL")
            let loading = app.descendants(matching: .any)["plans-loading"].firstMatch
            XCTAssertTrue(loading.waitForExistence(timeout: 2))
            XCTAssertTrue(app.buttons["plans-create-unified"].exists)
            XCTAssertFalse(app.buttons["plans-create-primary"].exists)
            capture("home-redesign-offline-loading-\(tag)")
            assertHomeSection("waitingResponse", language: language)
            XCTAssertTrue(loading.waitForNonExistence(timeout: 12))
            XCTAssertTrue(app.buttons["plans-create-primary"].waitForExistence(timeout: 5))
            XCTAssertEqual(app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH 'plans-row-'")).count, 0)
            assertHomeSection("waitingResponse", language: language)
            capture("home-redesign-offline-empty-store-\(tag)")
            app.buttons["plans-tab-upcoming"].tap()
            assertHomeSection("upcoming", language: language)
            capture("home-redesign-offline-empty-confirmed-\(tag)")
        }
    }

    func testHomeRedesignMaximumCardsRemainFullyReachable() {
        continueAfterFailure = false
        launch(accessibility: true, layout: true, language: "de",
               contentSizeCategory: "UICTContentSizeCategoryAccessibilityXXXL")
        assertHomeSection("waitingResponse", language: "de")
        showCompleteHomeCard(app.buttons["plans-row-ui-plan-1"], section: "waitingResponse", name: "home-redesign-max-complete-task")
        showCompleteHomeCard(app.buttons["plans-row-ui-plan-outgoing"], section: "waitingResponse", name: "home-redesign-max-complete-waiting")
        app.buttons["plans-tab-upcoming"].tap()
        assertHomeSection("upcoming", language: "de")
        showCompleteHomeCard(app.buttons["plans-row-ui-plan-accepted"], section: "upcoming", name: "home-redesign-max-complete-confirmed")
    }

    func testHomeRedesignLiveCandidateDatesRemainExplicitlyUndecided() throws {
        struct Account: Decodable { let role: String; let accessToken: String }
        struct Fixture: Decodable { let bundle: String; let finalBlockToken: String; let accounts: [Account] }
        let raw = ProcessInfo.processInfo.environment["SIDESEAT_PLAN_CONTACTS_JSON"]
        try XCTSkipIf(raw == nil, "Requires the separate, untouched two-date heading-layout plan.")
        let fixture = try JSONDecoder().decode(Fixture.self, from: Data(raw!.utf8))
        let owner = try XCTUnwrap(fixture.accounts.first { $0.role == "owner" })
        continueAfterFailure = false
        for (language, large) in [("zh-Hans", false), ("de", true)] {
            let tag = "\(language)-\(large ? "system-largest-dark" : "normal-light")"
            app?.terminate(); app = XCUIApplication(bundleIdentifier: fixture.bundle)
            app.launchArguments = ["--ui-testing-authenticated", "--ui-testing-ephemeral-credentials",
                "--ui-testing-skip-tutorial", "--ui-testing-time-poll-live", "--ui-testing-language=\(language)",
                "--ui-testing-appearance=\(large ? "dark" : "light")", "-UIPreferredContentSizeCategoryName",
                large ? "UICTContentSizeCategoryAccessibilityXXXL" : "UICTContentSizeCategoryL"]
            if large { app.launchArguments.append("--ui-testing-dynamic-type-accessibility") }
            app.launchEnvironment = ["SIDESEAT_QA_ACCESS_TOKEN": owner.accessToken]
            app.launch()
            let tab = app.tabBars.buttons[language == "de" ? "Pläne" : language == "en" ? "Plans" : "计划"]
            XCTAssertTrue(tab.waitForExistence(timeout: 20)); tab.tap()
            let card = app.buttons["plans-coordinated-\(fixture.finalBlockToken)"]
            XCTAssertTrue(card.waitForExistence(timeout: 20))
            let visible = revealHomeItem(card, section: "waitingResponse")
            XCTAssertTrue(card.label.contains(language == "de" ? "Zeit noch offen" : "时间待定"))
            XCTAssertTrue(card.label.contains(language == "de" ? "2 Tage ·" : "2 天可选 ·"))
            XCTAssertNil(card.label.range(of: #"\b(?:[01]?\d|2[0-3]):[0-5]\d\b"#, options: .regularExpression),
                         "A candidate window must not masquerade as a chosen final interval")
            assertHomeSection("waitingResponse", language: language)
            capture("home-redesign-live-candidate-undecided-\(tag)")
            tapHomeItem(card, visible: visible)
            XCTAssertTrue(app.staticTexts["time-poll-detail-title"].waitForExistence(timeout: 20))
            XCTAssertTrue(app.descendants(matching: .any)["time-poll-date-range"].firstMatch.exists)
            capture("home-redesign-live-candidate-original-detail-\(tag)")
            app.navigationBars.firstMatch.buttons.firstMatch.tap()
            assertHomeSection("waitingResponse", language: language)
        }
    }

    /// Read-only real API cards; fixture preparation and server-state checks are separate.
    func testHomeScheduleEndpointsAcrossLanguagesAndTextSizes() throws {
        struct Account: Decodable { let role: String; let accessToken: String }
        struct Interval: Decodable { let name: String; let token: String; let start: String; let end: String }
        struct Fixture: Decodable {
            let bundle: String; let finalBlockToken: String; let accounts: [Account]; let invitationCases: [Interval]
        }
        let raw = ProcessInfo.processInfo.environment["SIDESEAT_PLAN_CONTACTS_JSON"]
        try XCTSkipIf(raw == nil, "Requires fresh same-day, cross-day, cross-year and candidate cards.")
        let fixture = try JSONDecoder().decode(Fixture.self, from: Data(raw!.utf8))
        let owner = try XCTUnwrap(fixture.accounts.first { $0.role == "owner" })
        XCTAssertEqual(Set(fixture.invitationCases.map(\.name)), ["same-day", "cross-day", "cross-year"])
        let parser = ISO8601DateFormatter()
        func instant(_ value: String) throws -> Date {
            parser.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
            if let value = parser.date(from: value) { return value }
            parser.formatOptions = [.withInternetDateTime]
            return try XCTUnwrap(parser.date(from: value))
        }
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = try XCTUnwrap(TimeZone(identifier: "Europe/Berlin"))
        continueAfterFailure = false
        for (language, category, tag) in [
            ("zh-Hans", "UICTContentSizeCategoryL", "zh-Hans-normal-light"),
            ("zh-Hans", "UICTContentSizeCategoryXL", "zh-Hans-xLarge-light"),
            ("en", "UICTContentSizeCategoryL", "en-normal-light"),
            ("de", "UICTContentSizeCategoryAccessibilityXXXL", "de-system-largest-dark")
        ] {
            let large = category == "UICTContentSizeCategoryAccessibilityXXXL"
            app?.terminate(); app = XCUIApplication(bundleIdentifier: fixture.bundle)
            app.launchArguments = ["--ui-testing-authenticated", "--ui-testing-ephemeral-credentials",
                "--ui-testing-skip-tutorial", "--ui-testing-time-poll-live", "--ui-testing-language=\(language)",
                "--ui-testing-appearance=\(large ? "dark" : "light")", "-UIPreferredContentSizeCategoryName",
                category]
            if large { app.launchArguments.append("--ui-testing-dynamic-type-accessibility") }
            app.launchEnvironment = ["SIDESEAT_QA_ACCESS_TOKEN": owner.accessToken]
            app.launch()
            let tab = app.tabBars.buttons[language == "de" ? "Pläne" : language == "en" ? "Plans" : "计划"]
            XCTAssertTrue(tab.waitForExistence(timeout: 20)); tab.tap()
            assertHomeSection("waitingResponse", language: language)
            let format = DateFormatter()
            format.locale = Locale(identifier: language); format.timeZone = calendar.timeZone
            func text(_ date: Date, template: String) -> String {
                format.setLocalizedDateFormatFromTemplate(template)
                return format.string(from: date)
            }
            for interval in fixture.invitationCases {
                let card = app.buttons["plans-coordinated-\(interval.token)"]
                XCTAssertTrue(card.waitForExistence(timeout: 20))
                let start = try instant(interval.start), end = try instant(interval.end)
                let prefix = calendar.component(.year, from: start) == calendar.component(.year, from: Date()) ? "" : "y"
                XCTAssertTrue(card.label.contains(text(start, template: prefix + "MMMdEEE")))
                for clock in [start, end] { XCTAssertTrue(card.label.contains(text(clock, template: "jmm")), card.label) }
                if !calendar.isDate(start, inSameDayAs: end) {
                    let endPrefix = calendar.component(.year, from: end) == calendar.component(.year, from: Date()) ? "" : "y"
                    XCTAssertTrue(card.label.contains(text(end, template: endPrefix + "MMMd")), card.label)
                }
                showCompleteHomeCard(card, section: "waitingResponse", name: "schedule-\(interval.name)-\(tag)")
            }
            let candidate = app.buttons["plans-coordinated-\(fixture.finalBlockToken)"]
            XCTAssertTrue(candidate.waitForExistence(timeout: 20))
            XCTAssertTrue(candidate.label.contains(language == "de" ? "Zeit noch offen" : language == "en" ? "Time to be decided" : "时间待定"))
            XCTAssertTrue(candidate.label.contains(language == "de" ? "2 Tage ·" : language == "en" ? "2 dates ·" : "2 天可选 ·"))
            XCTAssertNil(candidate.label.range(of: #"\b(?:[01]?\d|2[0-3]):[0-5]\d\b"#, options: .regularExpression))
            showCompleteHomeCard(candidate, section: "waitingResponse", name: "schedule-candidate-\(tag)")
        }
    }

    private func showCompleteHomeCard(_ card: XCUIElement, section: String, name: String) {
        XCTAssertTrue(card.waitForExistence(timeout: 10))
        var offset: CGFloat = 0, part = 1
        for _ in 0..<20 {
            let viewport = homeListViewport(section: section).insetBy(dx: 0, dy: 8)
            let frame = card.frame
            XCTAssertGreaterThanOrEqual(frame.width + 0.001, 44)
            XCTAssertGreaterThanOrEqual(frame.height + 0.001, 44)
            let segment = frame.height <= viewport.height * 0.6 ? frame
                : CGRect(x: frame.minX, y: frame.minY + offset, width: frame.width,
                         height: min(viewport.height * 0.6, frame.height - offset))
            print("PLAN_HOME_SEGMENT card=\(card.identifier) frame=\(frame) segment=\(segment) viewport=\(viewport) part=\(part)")
            if viewport.insetBy(dx: -0.501, dy: -0.501).contains(segment) {
                XCTAssertTrue(card.isHittable)
                assertHomeTarget(homeCreate)
                print("PLAN_HOME_READABLE card=\(card.identifier) frame=\(frame) segment=\(segment) viewport=\(viewport) part=\(part)")
                capture(part == 1 && segment == frame ? name : name + "-part-\(part)")
                if offset + segment.height >= frame.height - 0.501 { return }
                // Adjacent actual screenshots overlap by 24pt, so no content is skipped.
                offset += segment.height - 24
                part += 1
                continue
            }
            let delta = segment.minY < viewport.minY ? segment.minY - viewport.minY
                : segment.maxY - viewport.maxY
            let distance = min(max(abs(delta), 64), viewport.height * 0.6)
            let startY = delta > 0 ? viewport.maxY - 16 : viewport.minY + 16
            let endY = startY + (delta > 0 ? -distance : distance)
            let origin = app.coordinate(withNormalizedOffset: .zero)
            origin.withOffset(CGVector(dx: 12, dy: startY))
                .press(forDuration: 0.08,
                    thenDragTo: origin.withOffset(CGVector(dx: 12, dy: endY)),
                    withVelocity: .slow, thenHoldForDuration: 0.2)
        }
        capture(name + "-unreachable")
        XCTFail("Every part of the representative card must be readable above the creation action")
    }

    private func assertKnownCardTime(_ card: XCUIElement, dayOffset: Int, hourOffset: Int,
                                     durationMinutes: Int, language: String) {
        let calendar = Calendar.autoupdatingCurrent
        let day = calendar.date(byAdding: .day, value: dayOffset, to: calendar.startOfDay(for: Date()))!
        let start = calendar.date(byAdding: .hour, value: hourOffset, to: day)!
        let end = start.addingTimeInterval(TimeInterval(durationMinutes * 60))
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: language)
        formatter.timeZone = calendar.timeZone
        formatter.dateFormat = "HH:mm"
        let from = formatter.string(from: start), until = formatter.string(from: end)
        XCTAssertTrue(card.label.contains(from) && card.label.contains(until),
                      "The original known interval must remain in the card's date/time description: \(card.label)")
        XCTAssertFalse(card.label.contains(language == "de" ? "Zeit noch offen" : "时间待定"),
                       "An existing conversation proposal already has a concrete date and interval")
    }

    private func assertHomeSection(_ section: String, language: String) {
        XCTAssertTrue(app.descendants(matching: .any)["direct-chat"].firstMatch.waitForNonExistence(timeout: 5))
        XCTAssertFalse(app.descendants(matching: .any)["plans-history-root"].firstMatch.exists)
        XCTAssertTrue(app.tabBars.buttons[language == "de" ? "Pläne" : language == "en" ? "Plans" : "计划"].isSelected)
        let picker = app.descendants(matching: .any)["plans-segmented-control"].firstMatch
        XCTAssertEqual(picker.buttons.count, 2)
        XCTAssertEqual(picker.buttons.allElementsBoundByIndex.filter(\.isSelected).count, 1)
        XCTAssertTrue(app.buttons["plans-tab-\(section)"].isSelected)
        for control in picker.buttons.allElementsBoundByIndex { assertHomeTarget(control) }
        assertRootToolbar(language: language)
    }

    private func assertHomeTarget(_ control: XCUIElement) {
        XCTAssertTrue(control.waitForExistence(timeout: 5)); XCTAssertTrue(control.isHittable)
        XCTAssertTrue(app.windows.firstMatch.frame.insetBy(dx: -0.501, dy: -0.501).contains(control.frame))
        XCTAssertGreaterThanOrEqual(control.frame.width + 0.001, 44)
        XCTAssertGreaterThanOrEqual(control.frame.height + 0.001, 44)
    }

    private func homeListViewport(section: String) -> CGRect {
        let page = app.scrollViews["plans-scroll-\(section)"]
        let window = app.windows.firstMatch.frame
        let top = section == "ended" ? app.navigationBars.firstMatch.frame.maxY
            : app.descendants(matching: .any)["plans-segmented-control"].firstMatch.frame.maxY
        let bottom = section == "ended" ? app.tabBars.firstMatch.frame.minY : min(page.frame.maxY, homeCreate.frame.minY)
        return page.frame.intersection(CGRect(x: window.minX, y: top, width: window.width, height: max(0, bottom - top)))
    }

    /// Cards may be taller than the viewport at system maximum; controls and the rail still require full visibility.
    private func revealHomeItem(_ item: XCUIElement, section: String, complete: Bool = false) -> CGRect {
        XCTAssertTrue(item.waitForExistence(timeout: 10))
        for attempt in 0..<16 {
            let viewport = homeListViewport(section: section)
            let frame = item.exists ? item.frame : .zero
            let visible = frame.intersection(viewport)
            print("PLAN_HOME_REVEAL \(item.identifier) attempt=\(attempt) frame=\(frame) viewport=\(viewport) visible=\(visible)")
            if item.exists && item.isHittable && visible.width >= 44 && visible.height >= 44
                && (!complete || viewport.insetBy(dx: -0.501, dy: -0.501).contains(frame)) {
                XCTAssertGreaterThanOrEqual(frame.width + 0.001, 44)
                XCTAssertGreaterThanOrEqual(frame.height + 0.001, 44)
                return visible
            }
            let down = !frame.isEmpty && frame.minY < viewport.minY
            let start = CGPoint(x: viewport.minX + 12, y: viewport.minY + viewport.height * (down ? 0.25 : 0.75))
            let end = CGPoint(x: start.x, y: viewport.minY + viewport.height * (down ? 0.75 : 0.25))
            let origin = app.coordinate(withNormalizedOffset: .zero)
            origin.withOffset(CGVector(dx: start.x - app.frame.minX, dy: start.y - app.frame.minY))
                .press(forDuration: 0.08,
                       thenDragTo: origin.withOffset(CGVector(dx: end.x - app.frame.minX, dy: end.y - app.frame.minY)),
                       withVelocity: .slow, thenHoldForDuration: 0.2)
        }
        capture("home-redesign-item-unreachable-\(item.identifier)")
        XCTFail("The requested item needs a real visible 44pt region, with the entire rail above the action area")
        return .zero
    }

    private func tapHomeItem(_ item: XCUIElement, visible: CGRect) {
        XCTAssertTrue(item.isHittable)
        XCTAssertGreaterThanOrEqual(visible.width, 44); XCTAssertGreaterThanOrEqual(visible.height, 44)
        let point = CGPoint(x: visible.minX + visible.width * 0.2, y: visible.midY)
        XCTAssertTrue(visible.contains(point) && item.frame.contains(point))
        app.coordinate(withNormalizedOffset: .zero)
            .withOffset(CGVector(dx: point.x - app.frame.minX, dy: point.y - app.frame.minY)).tap()
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
        capture("together-card-reference")
        app.tabBars.buttons["计划"].tap()
        let planHeading = app.descendants(matching: .any)["root-navigation-title"].firstMatch
        XCTAssertTrue(planHeading.isHittable)
        XCTAssertTrue(planHeading.label.contains("计划"))
        XCTAssertEqual(planHeading.frame.minY, headingY, accuracy: 2)
        let planPicker = app.descendants(matching: .any)["plans-segmented-control"].firstMatch
        XCTAssertGreaterThanOrEqual(planPicker.frame.minY, planHeading.frame.maxY)
        XCTAssertTrue(app.windows.firstMatch.frame.contains(planPicker.frame))
        for control in planPicker.buttons.allElementsBoundByIndex { assertHomeTarget(control) }
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
        XCTAssertLessThanOrEqual(row.frame.height, 144, "The date summary and activity identity should stay compact")
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
        let image = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
        image.name = "shared-plan-117-" + name; image.lifetime = .keepAlways; add(image)
    }
}
