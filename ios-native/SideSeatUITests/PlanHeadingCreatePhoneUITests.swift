import XCTest

/// Local legacy-plan fixtures only; creation is opened and cancelled without submission.
/// The coordinated-plan endpoint is intentionally unavailable, so no clean live empty state is claimed.
@MainActor final class PlanHeadingCreatePhoneUITests: XCTestCase {
    private var app: XCUIApplication!
    private var bundleID: String {
        ProcessInfo.processInfo.environment["SIDESEAT_PLAN_PRESENTATION_QA_BUNDLE"] ?? "app.sideseat.mobile.preview"
    }
    override func setUpWithError() throws { continueAfterFailure = false }
    override func tearDown() { app?.terminate() }

    func testContentHeadingCreationAcrossAppearanceAndTextSizes() {
        for (language, appearance, large) in [("zh-Hans", "light", false), ("zh-Hans", "dark", false),
                                               ("de", "light", true), ("de", "dark", true)] {
            let tag = "\(language)-\(appearance)-\(large ? "system-max" : "normal")"
            launch(language: language, appearance: appearance, large: large,
                   flags: ["--ui-testing-plans-mixed-waiting", "--ui-testing-plans-waiting-rail"])
            let waiting = page("waitingResponse")
            XCTAssertTrue(waiting.buttons["plans-row-ui-plan-1"].waitForExistence(timeout: 8))
            let heading = waiting.descendants(matching: .any)["plans-waiting-incoming-heading"].firstMatch
            let create = createButton(in: waiting)
            verifyHeading(heading, create: create, title: language == "de" ? "Planübersicht" : "计划安排", large: large)
            XCTAssertEqual(heading.value as? String, "2", "Only the two incoming fixture plans need action")
            XCTAssertEqual(create.label, language == "de" ? "Plan starten" : "发起计划")
            XCTAssertTrue(element(large ? "plans-waiting-expanded" : "plans-waiting-rail").exists)
            capture("plan-heading-planning-\(tag)")

            if language == "zh-Hans" && appearance == "light" {
                let before = create.frame.minY, pickerY = element("plans-segmented-control").frame.minY
                waiting.swipeUp(velocity: .slow)
                XCTAssertTrue(!create.isHittable || create.frame.minY < before - 20,
                              "The content heading and creation action scroll with the plan list")
                XCTAssertEqual(element("plans-segmented-control").frame.minY, pickerY, accuracy: 2)
                revealHeading(create, in: waiting)
                openAndCancelCreation(create, captureName: "plan-heading-create-without-submission-\(tag)")
            } else if language == "de" && appearance == "light" {
                openAndCancelCreation(create)
            }

            let confirmedTab = app.buttons["plans-tab-upcoming"]
            assertTarget(confirmedTab); tap(confirmedTab); XCTAssertTrue(confirmedTab.isSelected)
            let confirmed = page("upcoming")
            let confirmedTitle = language == "de" ? "Bestätigt" : "已确定"
            let confirmedHeading = confirmed.staticTexts[confirmedTitle].firstMatch
            let confirmedCreate = createButton(in: confirmed)
            verifyHeading(confirmedHeading, create: confirmedCreate, title: confirmedTitle, large: large)
            capture("plan-heading-confirmed-\(tag)")
            if appearance == "dark" { openAndCancelCreation(confirmedCreate) }

            if language == "zh-Hans" && appearance == "light" {
                let history = app.buttons["plans-history"]
                assertTarget(history); tap(history)
                XCTAssertTrue(element("plans-history-root").waitForExistence(timeout: 8))
                XCTAssertFalse(createButton(in: page("ended")).exists)
                let back = app.navigationBars.firstMatch.buttons.firstMatch
                XCTAssertTrue(back.isHittable); tap(back)
                XCTAssertTrue(confirmedTab.waitForExistence(timeout: 8)); XCTAssertTrue(confirmedTab.isSelected)
                revealHeading(confirmedCreate, in: confirmed); assertTarget(confirmedCreate)
            }
            app.terminate()
        }
    }

    func testEmptyAndFailedStoresRetainContentCreationEntry() {
        for failed in [false, true] {
            launch(language: "zh-Hans", appearance: "light", large: false,
                   flags: [failed ? "--ui-testing-plans-error" : "--ui-testing-plans-empty"])
            XCTAssertTrue(element("plans-loading").waitForNonExistence(timeout: 10))
            let waiting = page("waitingResponse")
            XCTAssertEqual(waiting.buttons.matching(NSPredicate(format: "identifier BEGINSWITH 'plans-row-'" )).count, 0)
            let heading = waiting.descendants(matching: .any)["plans-waiting-incoming-heading"].firstMatch
            let create = createButton(in: waiting)
            verifyHeading(heading, create: create, title: "计划安排", large: false)
            XCTAssertEqual(heading.value as? String, "0")
            XCTAssertFalse(heading.label.contains("0"), "A zero badge is not shown")
            XCTAssertEqual(create.identifier, "plans-create-primary")
            if failed { XCTAssertTrue(element("plans-load-error").waitForExistence(timeout: 8)) }
            capture("plan-heading-\(failed ? "store-error" : "empty-store")-coordination-unavailable-zh-light")
            openAndCancelCreation(create)
            app.terminate()
        }
    }

    private func launch(language: String, appearance: String, large: Bool, flags: [String]) {
        app?.terminate(); app = XCUIApplication(bundleIdentifier: bundleID)
        app.launchArguments = ["--ui-testing-authenticated", "--ui-testing-ephemeral-credentials", "--ui-testing-skip-tutorial",
            "--ui-testing-local-api", "--ui-testing-chats", "--ui-testing-language=\(language)", "--ui-testing-appearance=\(appearance)",
            "-UIPreferredContentSizeCategoryName", large ? "UICTContentSizeCategoryAccessibilityXXXL" : "UICTContentSizeCategoryL"] + flags
        if large { app.launchArguments.append("--ui-testing-dynamic-type-accessibility") }
        app.launchEnvironment = ["SIDESEAT_API_BASE_URL_OVERRIDE": "http://127.0.0.1:9"]
        app.launch()
        XCTAssertTrue(app.tabBars.firstMatch.waitForExistence(timeout: 20))
        app.tabBars.buttons.element(boundBy: 1).tap()
        XCTAssertTrue(page("waitingResponse").waitForExistence(timeout: 8))
    }
    private func page(_ section: String) -> XCUIElement { app.scrollViews["plans-scroll-\(section)"].firstMatch }
    private func element(_ identifier: String) -> XCUIElement { app.descendants(matching: .any)[identifier].firstMatch }
    private func createButton(in page: XCUIElement) -> XCUIElement {
        page.buttons.matching(NSPredicate(format: "identifier IN %@", ["plans-create-primary", "plans-create-unified"])).firstMatch
    }
    private func verifyHeading(_ heading: XCUIElement, create: XCUIElement, title: String, large: Bool) {
        XCTAssertTrue(heading.waitForExistence(timeout: 8)); XCTAssertTrue(heading.label.contains(title))
        assertTarget(create); assertInWindow(heading)
        let bounds = app.windows.firstMatch.frame
        XCTAssertEqual(create.frame.maxX, bounds.maxX - 20, accuracy: 1)
        if large {
            XCTAssertGreaterThan(heading.frame.height, 35, "The content heading uses the actual system maximum")
            XCTAssertGreaterThanOrEqual(create.frame.minY, heading.frame.maxY + 8)
            XCTAssertEqual(create.frame.minX, bounds.minX + 20, accuracy: 1)
        } else {
            XCTAssertEqual(create.frame.midY, heading.frame.midY, accuracy: 2)
            XCTAssertGreaterThanOrEqual(create.frame.minX, heading.frame.maxX + 8)
        }
        XCTAssertGreaterThanOrEqual(heading.frame.minY, element("plans-segmented-control").frame.maxY)
        XCTAssertLessThanOrEqual(create.frame.maxY, app.tabBars.firstMatch.frame.minY - 8)
    }
    private func revealHeading(_ create: XCUIElement, in scroll: XCUIElement) {
        for _ in 0..<12 {
            if create.exists, create.isHittable, create.frame.minY >= element("plans-segmented-control").frame.maxY,
               create.frame.maxY <= app.tabBars.firstMatch.frame.minY - 8 { return }
            scroll.swipeDown(velocity: .slow)
        }
        XCTFail("The creation action must return with its content heading")
    }
    private func openAndCancelCreation(_ create: XCUIElement, captureName: String? = nil) {
        assertTarget(create); tap(create)
        XCTAssertTrue(element("time-poll-title").waitForExistence(timeout: 10))
        XCTAssertFalse(element("time-poll-grid").exists)
        XCTAssertFalse(app.buttons["time-poll-create-confirm"].isEnabled)
        if let captureName { capture(captureName) }
        let cancel = app.navigationBars.buttons.matching(NSPredicate(format: "label IN %@", ["取消", "Abbrechen", "Cancel"])).firstMatch
        XCTAssertTrue(cancel.waitForExistence(timeout: 5)); XCTAssertTrue(cancel.isHittable); tap(cancel)
        XCTAssertTrue(element("time-poll-title").waitForNonExistence(timeout: 8))
        assertTarget(create)
    }
    private func assertTarget(_ target: XCUIElement) {
        XCTAssertTrue(target.waitForExistence(timeout: 8)); XCTAssertTrue(target.isHittable); assertInWindow(target)
        XCTAssertGreaterThanOrEqual(target.frame.width, 43.999)
        XCTAssertGreaterThanOrEqual(target.frame.height, 43.999)
    }
    private func assertInWindow(_ target: XCUIElement) {
        XCTAssertFalse(target.frame.isEmpty)
        XCTAssertTrue(app.windows.firstMatch.frame.insetBy(dx: -0.5, dy: -0.5).contains(target.frame))
    }
    private func tap(_ target: XCUIElement) { target.coordinate(withNormalizedOffset: CGVector(dx: 0.2, dy: 0.5)).tap() }
    private func capture(_ name: String) {
        let shot = XCTAttachment(screenshot: app.screenshot()); shot.name = name; shot.lifetime = .keepAlways; add(shot)
    }
}
