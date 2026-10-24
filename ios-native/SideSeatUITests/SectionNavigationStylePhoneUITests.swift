import XCTest

/// Offline fixtures verify navigation layout and gestures, not production API behavior.
@MainActor final class SectionNavigationStylePhoneUITests: XCTestCase {
    private var app: XCUIApplication!
    private var bundleID: String {
        ProcessInfo.processInfo.environment["SIDESEAT_PLAN_PRESENTATION_QA_BUNDLE"] ?? "app.sideseat.mobile.preview"
    }

    override func setUpWithError() throws { continueAfterFailure = false }
    override func tearDown() { app?.terminate() }

    func testFixtureSectionNavigationLanguageAppearanceAndSizeMatrix() {
        for language in ["zh-Hans", "de"] {
            for appearance in ["light", "dark"] {
                for large in [false, true] {
                    let tag = "\(language)-\(appearance)-\(large ? "largest" : "normal")"
                    launchFixture(language: language, appearance: appearance, large: large)
                    let together = selector("together")
                    assertChrome(together)
                    let togetherFrame = together.frame
                    for section in ["intentions", "recommendations", "bookmarks", "recommendations"] {
                        selectTogether(section)
                    }
                    checkTogetherMenuWithoutChangingSelection(tag: tag)
                    capture(app, "fixture-section-together-\(tag)")

                    app.tabBars.buttons.element(boundBy: 1).tap()
                    let plans = selector("plans")
                    XCTAssertTrue(plans.waitForExistence(timeout: 10))
                    XCTAssertTrue(app.buttons["plans-row-ui-plan-1"].waitForExistence(timeout: 10))
                    assertChrome(plans)
                    XCTAssertEqual(plans.frame.minX, togetherFrame.minX, accuracy: 1)
                    XCTAssertEqual(plans.frame.width, togetherFrame.width, accuracy: 1)
                    for section in ["upcoming", "waitingResponse"] {
                        let control = app.buttons["plans-tab-\(section)"]
                        assertTarget(control); tap(control)
                        XCTAssertTrue(control.isSelected)
                        XCTAssertEqual(plans.buttons.allElementsBoundByIndex.filter { $0.isSelected }.count, 1)
                        XCTAssertTrue(app.scrollViews["plans-scroll-\(section)"].waitForExistence(timeout: 5))
                        assertTarget(planCreate)
                    }
                    capture(app, "fixture-section-plans-\(tag)")
                }
            }
        }
    }

    func testFixturePageSwipesAndPinnedSelectors() {
        launchFixture(language: "zh-Hans", appearance: "light", large: false)
        selectTogether("recommendations")
        let together = selector("together")
        var currentTogether = "recommendations"
        for (left, section) in [(false, "intentions"), (true, "recommendations"), (true, "bookmarks"), (false, "recommendations")] {
            XCTAssertTrue(app.buttons["together-tab-\(currentTogether)"].isSelected)
            swipePage(app.scrollViews["together-section-\(currentTogether)"], left: left)
            XCTAssertTrue(app.scrollViews["together-section-\(section)"].waitForExistence(timeout: 5))
            XCTAssertTrue(app.buttons["together-tab-\(section)"].isSelected)
            currentTogether = section
        }
        verifyPinnedAfterScroll(app.scrollViews["together-section-recommendations"], selector: together,
                                contentPrefix: "mutual-opportunity-profile-")
        capture(app, "fixture-section-together-pinned-after-scroll")

        app.tabBars.buttons.element(boundBy: 1).tap()
        let plans = selector("plans")
        XCTAssertTrue(plans.waitForExistence(timeout: 10))
        XCTAssertTrue(app.buttons["plans-row-ui-plan-1"].waitForExistence(timeout: 10))
        var currentPlan = "waitingResponse"
        for (left, section) in [(true, "upcoming"), (false, "waitingResponse")] {
            XCTAssertTrue(app.buttons["plans-tab-\(currentPlan)"].isSelected)
            swipePage(app.scrollViews["plans-scroll-\(currentPlan)"], left: left)
            XCTAssertTrue(app.scrollViews["plans-scroll-\(section)"].waitForExistence(timeout: 5))
            XCTAssertTrue(app.buttons["plans-tab-\(section)"].isSelected)
            currentPlan = section
        }
        verifyPinnedAfterScroll(app.scrollViews["plans-scroll-waitingResponse"], selector: plans,
                                contentPrefix: "plans-row-")
        assertTarget(planCreate)
        tap(planCreate)
        XCTAssertTrue(app.descendants(matching: .any)["time-poll-title"].firstMatch.waitForExistence(timeout: 10))
        let cancel = app.navigationBars.buttons["取消"]
        assertTarget(cancel); tap(cancel)
        XCTAssertTrue(plans.waitForExistence(timeout: 10))
        XCTAssertTrue(app.buttons["plans-tab-waitingResponse"].isSelected)
        assertTarget(planCreate)
        capture(app, "fixture-section-plans-pinned-after-create-cancel")
    }

    /// Uses the user's existing session and captures only the selector strip.
    /// It never creates accounts, signs out, publishes, bookmarks, or sends anything.
    func testExistingSessionSelectorStripsReadOnly() throws {
        app = XCUIApplication(bundleIdentifier: bundleID)
        app.launchArguments = []
        app.launchEnvironment = [:]
        app.launch()
        let tabs = app.tabBars.firstMatch
        guard tabs.waitForExistence(timeout: 20) else {
            if app.textFields["login-identifier"].exists {
                throw XCTSkip("The normal Preview session is signed out; no sign-in or account changes were attempted.")
            }
            XCTFail("The normal launch did not expose the tab bar.")
            return
        }
        tabs.buttons.element(boundBy: 0).tap()
        let together = selector("together")
        guard together.waitForExistence(timeout: 12) else {
            throw XCTSkip("The current server assignment does not expose this Together selector; fixture coverage remains separate.")
        }
        assertChrome(together)
        let menu = app.buttons["together-section-menu"]
        if menu.exists { assertTarget(menu) }
        else {
            for section in ["intentions", "recommendations", "bookmarks"] {
                assertTarget(app.buttons["together-tab-\(section)"])
            }
        }
        capture(together, "normal-session-together-selector-strip")
        tabs.buttons.element(boundBy: 1).tap()
        let plans = selector("plans")
        XCTAssertTrue(plans.waitForExistence(timeout: 12))
        assertChrome(plans)
        for section in ["waitingResponse", "upcoming"] { assertTarget(app.buttons["plans-tab-\(section)"]) }
        capture(plans, "normal-session-plans-selector-strip")
    }

    private func launchFixture(language: String, appearance: String, large: Bool) {
        app?.terminate()
        app = XCUIApplication(bundleIdentifier: bundleID)
        app.launchArguments = ["--ui-testing-authenticated", "--ui-testing-ephemeral-credentials", "--ui-testing-skip-tutorial",
            "--ui-testing-discover", "--ui-testing-weekly-intent", "--ui-testing-mutual-opportunity",
            "--ui-testing-automatic-matching", "--ui-testing-together-matching", "--ui-testing-flexible-timing",
            "--ui-testing-discovery-matching", "--ui-testing-intent-card-states", "--ui-testing-opportunity-list",
            "--ui-testing-chats", "--ui-testing-plans-mixed-waiting", "--ui-testing-plans-waiting-rail",
            "--ui-testing-plans-long-list", "--ui-testing-local-api", "--ui-testing-language=\(language)",
            "--ui-testing-appearance=\(appearance)", "-UIPreferredContentSizeCategoryName", "UICTContentSizeCategoryL"]
        if large { app.launchArguments.append("--ui-testing-dynamic-type-accessibility") }
        app.launchEnvironment = ["SIDESEAT_API_BASE_URL_OVERRIDE": "http://127.0.0.1:9"]
        app.launch()
        XCTAssertTrue(app.tabBars.firstMatch.waitForExistence(timeout: 20))
        app.tabBars.buttons.element(boundBy: 0).tap()
        XCTAssertTrue(app.descendants(matching: .any)["together-home"].firstMatch.waitForExistence(timeout: 12))
        XCTAssertTrue(selector("together").waitForExistence(timeout: 10))
    }

    private func selector(_ page: String) -> XCUIElement {
        app.descendants(matching: .any)["\(page)-segmented-control"].firstMatch
    }

    private var planCreate: XCUIElement {
        app.buttons.matching(NSPredicate(format: "identifier IN %@", ["plans-create-primary", "plans-create-unified"])).firstMatch
    }

    private func selectTogether(_ section: String) {
        let menu = app.buttons["together-section-menu"]
        if menu.exists {
            assertTarget(menu); tap(menu)
            let sheet = app.descendants(matching: .any)["together-section-picker"].firstMatch
            XCTAssertTrue(sheet.waitForExistence(timeout: 5))
            let option = sheet.buttons["together-tab-\(section)"]
            revealSheetOption(option)
            let label = option.label
            assertTarget(option); tap(option)
            XCTAssertTrue(sheet.waitForNonExistence(timeout: 5))
            XCTAssertEqual(menu.value as? String, label)
        } else {
            let option = app.buttons["together-tab-\(section)"]
            assertTarget(option); tap(option)
            XCTAssertTrue(option.isSelected)
            XCTAssertEqual(selector("together").buttons.allElementsBoundByIndex.filter { $0.isSelected }.count, 1)
        }
        XCTAssertTrue(app.scrollViews["together-section-\(section)"].waitForExistence(timeout: 5))
    }

    private func checkTogetherMenuWithoutChangingSelection(tag: String) {
        let menu = app.buttons["together-section-menu"]
        guard menu.exists else { return }
        let value = menu.value as? String
        tap(menu)
        let sheet = app.descendants(matching: .any)["together-section-picker"].firstMatch
        XCTAssertTrue(sheet.waitForExistence(timeout: 5))
        let selected = sheet.buttons["together-tab-recommendations"]
        revealSheetOption(selected)
        assertTarget(selected)
        XCTAssertTrue(selected.isSelected)
        capture(app, "fixture-section-together-options-\(tag)")
        let done = app.navigationBars.buttons.matching(NSPredicate(format: "label IN %@", ["完成", "Fertig", "Done"])).firstMatch
        assertTarget(done); tap(done)
        XCTAssertTrue(sheet.waitForNonExistence(timeout: 5))
        XCTAssertEqual(menu.value as? String, value)
    }

    private func revealSheetOption(_ option: XCUIElement) {
        for _ in 0..<6 {
            let top = app.navigationBars.firstMatch.frame.maxY
            if option.exists && option.isHittable && option.frame.minY >= top - 0.5
                && option.frame.maxY <= app.windows.firstMatch.frame.maxY - 8 { return }
            if option.exists && option.frame.midY < top { app.swipeDown() }
            else { app.swipeUp() }
        }
        XCTAssertTrue(option.exists && option.isHittable, "The section option must be reachable in the native sheet")
    }

    private func assertChrome(_ control: XCUIElement) {
        XCTAssertTrue(control.waitForExistence(timeout: 10))
        assertInWindow(control)
        let heading = app.descendants(matching: .any)["root-navigation-title"].firstMatch
        XCTAssertTrue(heading.waitForExistence(timeout: 5))
        assertInWindow(heading)
        XCTAssertGreaterThanOrEqual(control.frame.minY, app.navigationBars.firstMatch.frame.maxY - 0.5)
    }

    private func assertTarget(_ element: XCUIElement) {
        XCTAssertTrue(element.waitForExistence(timeout: 8))
        XCTAssertTrue(element.isHittable)
        assertInWindow(element)
        XCTAssertGreaterThanOrEqual(element.frame.width + 0.001, 44)
        XCTAssertGreaterThanOrEqual(element.frame.height + 0.001, 44)
    }

    private func assertInWindow(_ element: XCUIElement) {
        let frame = element.frame, window = app.windows.firstMatch.frame
        XCTAssertFalse(frame.isEmpty)
        XCTAssertGreaterThanOrEqual(frame.minX, window.minX - 0.5)
        XCTAssertLessThanOrEqual(frame.maxX, window.maxX + 0.5)
        XCTAssertGreaterThanOrEqual(frame.minY, window.minY - 0.5)
        XCTAssertLessThanOrEqual(frame.maxY, window.maxY + 0.5)
    }

    private func tap(_ element: XCUIElement) {
        // The system AssistiveTouch bubble on this phone sits near the right edge.
        element.coordinate(withNormalizedOffset: CGVector(dx: 0.2, dy: 0.5)).tap()
    }

    private func swipePage(_ surface: XCUIElement, left: Bool) {
        XCTAssertTrue(surface.waitForExistence(timeout: 5))
        XCTAssertTrue(surface.isHittable)
        let start = surface.coordinate(withNormalizedOffset: CGVector(dx: left ? 0.82 : 0.18, dy: 0.08))
        let end = surface.coordinate(withNormalizedOffset: CGVector(dx: left ? 0.18 : 0.82, dy: 0.08))
        start.press(forDuration: 0.08, thenDragTo: end, withVelocity: .slow, thenHoldForDuration: 0.1)
    }

    private func verifyPinnedAfterScroll(_ scroll: XCUIElement, selector: XCUIElement, contentPrefix: String) {
        let elements = scroll.buttons.matching(NSPredicate(format: "identifier BEGINSWITH %@", contentPrefix))
        let before = elements.allElementsBoundByIndex.first { $0.isHittable }
        XCTAssertNotNil(before, "A real visible content control is required to verify scrolling")
        guard let before else { return }
        let identifier = before.identifier, y = before.frame.minY
        let pickerY = selector.frame.minY
        let heading = app.descendants(matching: .any)["root-navigation-title"].firstMatch
        let headingY = heading.frame.minY
        scroll.swipeUp(velocity: .slow)
        let after = elements.allElementsBoundByIndex.first { $0.isHittable }
        XCTAssertNotNil(after)
        guard let after else { return }
        XCTAssertTrue(after.identifier != identifier || abs(after.frame.minY - y) > 20,
                      "Content must actually move before treating the selector as pinned")
        XCTAssertEqual(selector.frame.minY, pickerY, accuracy: 1)
        XCTAssertEqual(heading.frame.minY, headingY, accuracy: 1)
        assertChrome(selector)
    }

    private func capture(_ surface: XCUIElement, _ name: String) {
        let attachment = XCTAttachment(screenshot: surface.screenshot())
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
    }
}
