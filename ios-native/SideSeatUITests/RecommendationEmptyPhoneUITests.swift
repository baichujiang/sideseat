import XCTest

/// Local fixtures exercise empty-state layout and existing routes, never publication or real data.
@MainActor final class RecommendationEmptyPhoneUITests: XCTestCase {
    private var app: XCUIApplication!
    private var bundleID: String {
        ProcessInfo.processInfo.environment["SIDESEAT_PLAN_PRESENTATION_QA_BUNDLE"] ?? "app.sideseat.mobile.preview"
    }
    private var empty: XCUIElement { app.descendants(matching: .any)["together-opportunities-empty"].firstMatch }
    private var intentions: XCUIElement { app.buttons["together-discovery-empty-action"] }
    private var more: XCUIElement { app.buttons["together-find-more"] }
    private var explorationEmpty: XCUIElement { app.descendants(matching: .any)["explore-intents-empty"].firstMatch }

    override func setUpWithError() throws { continueAfterFailure = false }
    override func tearDown() { app?.terminate() }

    func testCaptureCurrentEmptyStates() {
        for published in [false, true] {
            launch(published: published)
            XCTAssertTrue(empty.waitForExistence(timeout: 8))
            capture("before-recommendation-empty-\(published ? "active" : "none")-zh-normal-light")
        }
    }

    func testEmptyStateLayoutsAndRoutes() {
        for (language, appearance, large) in [("zh-Hans", "light", false), ("zh-Hans", "dark", false),
                                               ("de", "light", true), ("de", "dark", true)] {
            for published in [false, true] {
                let tag = "\(published ? "active" : "none")-\(language)-\(large ? "largest" : "normal")-\(appearance)"
                launch(published: published, language: language, appearance: appearance, large: large)
                XCTAssertTrue(empty.waitForExistence(timeout: 8))
                capture("fixture-recommendation-empty-top-\(tag)")
                for action in [intentions, more] { reveal(action, section: "recommendations"); assertTarget(action) }
                capture("fixture-recommendation-empty-\(tag)")

                reveal(intentions, section: "recommendations"); tap(intentions)
                XCTAssertTrue(page("intentions").waitForExistence(timeout: 5))
                let add = app.buttons.matching(NSPredicate(format: "identifier IN %@",
                    ["together-add-intent", "together-add-first-intent"])).firstMatch
                reveal(add, section: "intentions"); assertTarget(add); tap(add)
                let editor = app.descendants(matching: .any)["intent-editor"].firstMatch
                XCTAssertTrue(editor.waitForExistence(timeout: 5))
                let cancel = app.navigationBars.buttons.matching(NSPredicate(format: "label IN %@",
                    ["取消", "Cancel", "Abbrechen"])).firstMatch
                XCTAssertTrue(cancel.waitForExistence(timeout: 5)); XCTAssertTrue(cancel.isHittable); tap(cancel)
                XCTAssertTrue(editor.waitForNonExistence(timeout: 5))
                select("recommendations")
                XCTAssertTrue(empty.waitForExistence(timeout: 5))
                reveal(more, section: "recommendations"); assertTarget(more); tap(more)
                XCTAssertTrue(explorationEmpty.waitForExistence(timeout: 8))
                XCTAssertFalse(more.exists, "A completed empty search must not leave another search action")
                XCTAssertFalse(app.buttons["recommendation-retry"].exists)
                capture("fixture-recommendation-search-empty-\(tag)")
                if large {
                    page("recommendations").swipeUp(velocity: .slow)
                    capture("fixture-recommendation-search-empty-bottom-\(tag)")
                }
            }
        }
    }

    func testLoadingAndFailureRecovery() {
        launch(published: true, extra: ["--ui-testing-recommendation-slow"], selectRecommendations: false)
        let loading = app.descendants(matching: .any)["recommendation-loading"].firstMatch
        XCTAssertTrue(loading.exists)
        XCTAssertFalse(empty.exists); XCTAssertFalse(more.exists)
        capture("fixture-recommendation-loading")
        XCTAssertTrue(more.waitForExistence(timeout: 10))
        reveal(more, section: "recommendations"); assertTarget(more); tap(more)
        XCTAssertFalse(more.isEnabled, "Loading must prevent duplicate searches")
        capture("fixture-recommendation-search-loading")
        XCTAssertTrue(explorationEmpty.waitForExistence(timeout: 10))
        XCTAssertFalse(more.exists)

        launch(published: true, extra: ["--ui-testing-recommendation-load-error"], selectRecommendations: false)
        let retry = app.buttons["recommendation-retry"]
        XCTAssertTrue(retry.waitForExistence(timeout: 5))
        XCTAssertFalse(empty.exists); XCTAssertFalse(more.exists)
        // Unchanged native retry uses its own system geometry; verify reachability and route.
        reveal(retry, section: "recommendations")
        capture("fixture-recommendation-load-error"); tap(retry)
        XCTAssertTrue(empty.waitForExistence(timeout: 8))
        XCTAssertFalse(retry.exists)
        for action in [intentions, more] { reveal(action, section: "recommendations"); assertTarget(action) }
        capture("fixture-recommendation-error-recovered")
    }

    private func launch(published: Bool, language: String = "zh-Hans", appearance: String = "light",
                        large: Bool = false, extra: [String] = [], selectRecommendations: Bool = true) {
        app?.terminate(); app = XCUIApplication(bundleIdentifier: bundleID)
        app.launchArguments = ["--ui-testing-authenticated", "--ui-testing-ephemeral-credentials", "--ui-testing-skip-tutorial",
            "--ui-testing-local-api", "--ui-testing-discover", "--ui-testing-weekly-intent", "--ui-testing-mutual-opportunity",
            "--ui-testing-mutual-opportunity-empty", "--ui-testing-automatic-matching", "--ui-testing-together-matching",
            "--ui-testing-flexible-timing", "--ui-testing-discovery-matching", "--ui-testing-explore-intents",
            "--ui-testing-explore-empty", "--ui-testing-language=\(language)", "--ui-testing-appearance=\(appearance)",
            "-UIPreferredContentSizeCategoryName", "UICTContentSizeCategoryL"] + extra
        if published { app.launchArguments.append("--ui-testing-discovery-published") }
        if large { app.launchArguments.append("--ui-testing-dynamic-type-accessibility") }
        app.launchEnvironment = ["SIDESEAT_API_BASE_URL_OVERRIDE": "http://127.0.0.1:9"]
        app.launch()
        XCTAssertTrue(app.tabBars.firstMatch.waitForExistence(timeout: 20))
        // Observe transient loading before extra one-second existence waits consume it.
        guard selectRecommendations else { return }
        XCTAssertTrue(app.descendants(matching: .any)["together-home"].firstMatch.waitForExistence(timeout: 8))
        if !published {
            XCTAssertTrue(app.descendants(matching: .any)["together-set-intent"].firstMatch.waitForExistence(timeout: 8))
        }
        select("recommendations")
    }

    private func page(_ section: String) -> XCUIElement { app.scrollViews["together-section-\(section)"].firstMatch }

    private func select(_ section: String) {
        let menu = app.buttons["together-section-menu"]
        if menu.exists {
            assertTarget(menu); tap(menu)
            let sheet = app.descendants(matching: .any)["together-section-picker"].firstMatch
            XCTAssertTrue(sheet.waitForExistence(timeout: 5))
            let option = sheet.buttons["together-tab-\(section)"]
            for _ in 0..<5 where !fullyVisible(option, aboveTabBar: false) { app.swipeUp(velocity: .slow) }
            assertTarget(option); tap(option)
            XCTAssertTrue(sheet.waitForNonExistence(timeout: 5))
        } else {
            let option = app.buttons["together-tab-\(section)"]
            assertTarget(option); tap(option); XCTAssertTrue(option.isSelected)
        }
        XCTAssertTrue(page(section).waitForExistence(timeout: 5))
    }

    private func reveal(_ element: XCUIElement, section: String) {
        XCTAssertTrue(element.waitForExistence(timeout: 8))
        for _ in 0..<6 {
            if fullyVisible(element) { return }
            let top = max(app.navigationBars.firstMatch.frame.maxY,
                app.descendants(matching: .any)["together-segmented-control"].firstMatch.frame.maxY)
            if element.frame.minY < top { page(section).swipeDown(velocity: .slow) }
            else { page(section).swipeUp(velocity: .slow) }
        }
        XCTFail("The complete empty-state control must be reachable: \(element.identifier)")
    }

    private func fullyVisible(_ element: XCUIElement, aboveTabBar: Bool = true) -> Bool {
        guard element.exists, element.isHittable else { return false }
        let frame = element.frame, bounds = app.windows.firstMatch.frame
        let top = aboveTabBar ? max(app.navigationBars.firstMatch.frame.maxY,
            app.descendants(matching: .any)["together-segmented-control"].firstMatch.frame.maxY)
            : app.navigationBars.firstMatch.frame.maxY
        let bottom = aboveTabBar && app.tabBars.firstMatch.exists ? app.tabBars.firstMatch.frame.minY : bounds.maxY
        return !frame.isEmpty && frame.minX >= bounds.minX - 0.5 && frame.maxX <= bounds.maxX + 0.5
            && frame.minY >= top - 0.5 && frame.maxY <= bottom + 0.5
    }

    private func assertTarget(_ element: XCUIElement) {
        XCTAssertTrue(element.waitForExistence(timeout: 5)); XCTAssertTrue(element.isHittable)
        let frame = element.frame, bounds = app.windows.firstMatch.frame
        XCTAssertGreaterThanOrEqual(frame.width + 0.001, 44); XCTAssertGreaterThanOrEqual(frame.height + 0.001, 44)
        XCTAssertGreaterThanOrEqual(frame.minX, bounds.minX - 0.5); XCTAssertLessThanOrEqual(frame.maxX, bounds.maxX + 0.5)
        XCTAssertGreaterThanOrEqual(frame.minY, bounds.minY - 0.5); XCTAssertLessThanOrEqual(frame.maxY, bounds.maxY + 0.5)
    }

    private func tap(_ element: XCUIElement) {
        element.coordinate(withNormalizedOffset: CGVector(dx: 0.2, dy: 0.5)).tap()
    }

    private func capture(_ name: String) {
        let attachment = XCTAttachment(screenshot: app.screenshot())
        attachment.name = name; attachment.lifetime = .keepAlways; add(attachment)
    }
}
