import XCTest

/// Local creation drafts only: no accounts, plans, invitations or calendar writes.
@MainActor final class PlanHourMenuRegressionPhoneUITests: XCTestCase {
    private var app: XCUIApplication!
    private var bundleID: String {
        ProcessInfo.processInfo.environment["SIDESEAT_PLAN_PRESENTATION_QA_BUNDLE"] ?? "app.sideseat.mobile.preview"
    }

    override func setUpWithError() throws { continueAfterFailure = false }
    override func tearDown() { app?.terminate() }

    func testRegularMenuScrollStationarity() {
        openCreation(language: "zh-Hans", large: false)
        chooseClock("07:00", controlID: "time-poll-from", tag: "baseline-zh-normal", requiresScroll: true)
    }

    func testLongMenuScrollSelectionAndRetention() {
        for (language, large) in [("zh-Hans", false), ("de", true)] {
            let tag = "\(language)-\(large ? "largest-dark" : "normal-light")"
            openCreation(language: language, large: large)
            chooseClock("07:00", controlID: "time-poll-from", tag: tag, requiresScroll: true)
            chooseClock("24:00", controlID: "time-poll-until", tag: tag, requiresScroll: true)
            XCTAssertTrue(app.buttons["time-poll-create-confirm"].isEnabled)
            capture("hour-menu-far-end-selected-\(tag)")

            chooseClock("03:00", controlID: "time-poll-from", tag: tag)
            chooseClock("02:00", controlID: "time-poll-until", tag: tag)
            XCTAssertFalse(app.buttons["time-poll-create-confirm"].isEnabled,
                           "An end before the start cannot publish the draft")
            chooseClock("04:00", controlID: "time-poll-until", tag: tag)
            XCTAssertTrue(app.buttons["time-poll-create-confirm"].isEnabled)

            // Reopening and dismissing a menu must not change the chosen range.
            let until = app.buttons["time-poll-until"]
            reveal(until); assertTarget(until); tap(until)
            let menu = clockMenu()
            XCTAssertTrue(menu.waitForExistence(timeout: 5))
            dismissClockMenu(menu)
            XCTAssertTrue(menu.waitForNonExistence(timeout: 5))
            XCTAssertEqual(until.value as? String, "04:00")

            toggleDates(); toggleDates()
            let title = app.descendants(matching: .any)["time-poll-title"].firstMatch
            let location = app.textFields["unified-plan-location"]
            reveal(title)
            XCTAssertEqual(title.value as? String, draftTitle(language))
            reveal(location)
            XCTAssertEqual(location.value as? String, "Library")
            reveal(until)
            XCTAssertEqual(app.buttons["time-poll-from"].value as? String, "03:00")
            XCTAssertEqual(until.value as? String, "04:00")
            XCTAssertTrue(app.buttons["time-poll-create-confirm"].isEnabled)
            reveal(until); assertTarget(until)
            XCTAssertEqual(app.state, .runningForeground)
            capture("hour-menu-retained-draft-\(tag)")
            app.terminate()
        }
    }

    private func openCreation(language: String, large: Bool) {
        app?.terminate(); app = XCUIApplication(bundleIdentifier: bundleID)
        app.launchArguments = ["--ui-testing-authenticated", "--ui-testing-ephemeral-credentials",
            "--ui-testing-skip-tutorial", "--ui-testing-local-api", "--ui-testing-plans-empty",
            "--ui-testing-language=\(language)", "--ui-testing-appearance=\(large ? "dark" : "light")",
            "-UIPreferredContentSizeCategoryName", "UICTContentSizeCategoryL"]
        if large { app.launchArguments.append("--ui-testing-dynamic-type-accessibility") }
        app.launchEnvironment = ["SIDESEAT_API_BASE_URL_OVERRIDE": "http://127.0.0.1:9"]
        app.launch()
        let plans = app.tabBars.buttons[language == "de" ? "Pläne" : "计划"]
        XCTAssertTrue(plans.waitForExistence(timeout: 20)); tap(plans)
        let create = app.buttons["plans-create-primary"]
        XCTAssertTrue(create.waitForExistence(timeout: 10)); tap(create)
        let title = app.descendants(matching: .any)["time-poll-title"].firstMatch
        XCTAssertTrue(title.waitForExistence(timeout: 8)); reveal(title)
        tap(title); title.typeText(draftTitle(language) + "\n")
        XCTAssertTrue(app.keyboards.firstMatch.waitForNonExistence(timeout: 5))
        let location = app.textFields["unified-plan-location"]
        reveal(location); tap(location); location.typeText("Library\n")
        XCTAssertTrue(app.keyboards.firstMatch.waitForNonExistence(timeout: 5))
        XCTAssertTrue(app.buttons["time-poll-create-confirm"].isEnabled)
    }

    private func draftTitle(_ language: String) -> String {
        language == "de" ? "Gemeinsam lernen" : "一起复习"
    }

    private func chooseClock(_ value: String, controlID: String, tag: String, requiresScroll: Bool = false) {
        let control = app.buttons[controlID]
        reveal(control); assertTarget(control); tap(control)
        let menu = clockMenu()
        XCTAssertTrue(menu.waitForExistence(timeout: 5))
        let option = menu.buttons[value].firstMatch
        var scrolled = false
        for _ in 0..<18 {
            let viewport = menu.frame.intersection(app.windows.firstMatch.frame).insetBy(dx: 0, dy: 8)
            if fullyVisible(option, within: viewport) { break }
            let targetFrame = option.exists ? option.frame : .zero
            let scrollEarlier: Bool
            if !targetFrame.isEmpty {
                scrollEarlier = targetFrame.midY < viewport.midY
            } else {
                let firstVisibleMinute = menu.buttons.allElementsBoundByIndex.lazy.compactMap { element -> Int? in
                    guard self.fullyVisible(element, within: viewport) else { return nil }
                    return self.minute(element.label)
                }.first
                scrollEarlier = (minute(value) ?? 0) < (firstVisibleMinute ?? 0)
            }
            if scrollEarlier {
                menu.swipeDown(velocity: .slow)
            } else {
                menu.swipeUp(velocity: .slow)
            }
            scrolled = true
        }
        if requiresScroll { XCTAssertTrue(scrolled, "The regression must exercise real menu scrolling for \(value)") }
        let viewport = menu.frame.intersection(app.windows.firstMatch.frame).insetBy(dx: 0, dy: 8)
        XCTAssertTrue(option.exists, "Scrolling must instantiate the target menu row")
        XCTAssertTrue(fullyVisible(option, within: viewport), "Target must be fully visible after scrolling")
        let stoppedFrame = option.frame
        capture("hour-menu-scrolled-\(controlID)-\(value.replacingOccurrences(of: ":", with: ""))-\(tag)")
        // No corrective gesture after stopping: this catches the reported delayed jump to the top.
        Thread.sleep(forTimeInterval: 3)
        XCTAssertTrue(fullyVisible(option, within: viewport), "The target must remain visible while the menu is idle")
        XCTAssertEqual(option.frame.midY, stoppedFrame.midY, accuracy: 2,
                       "The menu must retain its scroll offset before selection")
        XCTAssertEqual(option.frame.midX, stoppedFrame.midX, accuracy: 2)
        capture("hour-menu-stationary-\(controlID)-\(value.replacingOccurrences(of: ":", with: ""))-\(tag)")
        option.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)).tap()
        XCTAssertTrue(menu.waitForNonExistence(timeout: 5))
        XCTAssertEqual(control.value as? String, value, "Selection must match the row that was tapped")
    }

    private func clockMenu() -> XCUIElement {
        // The native popup virtualizes distant rows; its identity cannot depend on one of them.
        app.collectionViews.matching(NSPredicate(format: "identifier != %@", "plan-create-information")).firstMatch
    }

    private func dismissClockMenu(_ menu: XCUIElement) {
        let window = app.windows.firstMatch
        let bounds = window.frame, menuBounds = menu.frame
        let leftSpace = menuBounds.minX - bounds.minX
        let rightSpace = bounds.maxX - menuBounds.maxX
        XCTAssertGreaterThan(max(leftSpace, rightSpace), 16, "A blank side gutter must remain outside the native menu")
        let point = CGPoint(x: rightSpace >= leftSpace ? bounds.maxX - 8 : bounds.minX + 8, y: bounds.midY)
        XCTAssertTrue(bounds.insetBy(dx: 4, dy: 4).contains(point))
        XCTAssertFalse(menuBounds.contains(point), "Dismiss in the backdrop, never on a time row")
        let form = app.collectionViews["plan-create-information"]
        for target in form.buttons.allElementsBoundByIndex
            + form.textFields.allElementsBoundByIndex + form.textViews.allElementsBoundByIndex {
            XCTAssertFalse(target.frame.contains(point), "The dismissal gutter must not hit a form control")
        }
        window.coordinate(withNormalizedOffset: .zero)
            .withOffset(CGVector(dx: point.x - bounds.minX, dy: point.y - bounds.minY)).tap()
    }

    private func minute(_ value: String) -> Int? {
        let parts = value.split(separator: ":")
        guard parts.count == 2, let hour = Int(parts[0]), let minute = Int(parts[1]) else { return nil }
        return hour * 60 + minute
    }

    private func toggleDates() {
        let button = app.buttons["plan-date-options"]
        let picker = app.descendants(matching: .any)["time-poll-dates"].firstMatch
        let wasExpanded = picker.exists
        reveal(button); assertTarget(button); tap(button)
        if wasExpanded { XCTAssertTrue(picker.waitForNonExistence(timeout: 5)) }
        else { XCTAssertTrue(picker.waitForExistence(timeout: 5)) }
    }

    private func reveal(_ element: XCUIElement) {
        XCTAssertTrue(element.waitForExistence(timeout: 8))
        for _ in 0..<10 {
            let bounds = app.windows.firstMatch.frame
            let top = app.navigationBars.firstMatch.frame.maxY
            let dock = app.buttons["time-poll-create-confirm"]
            let bottom = dock.exists ? dock.frame.minY - 8 : bounds.maxY
            let viewport = CGRect(x: bounds.minX, y: top, width: bounds.width, height: max(0, bottom - top))
            if fullyVisible(element, within: viewport) { return }
            let form = app.collectionViews.firstMatch.exists ? app.collectionViews.firstMatch : app.scrollViews.firstMatch
            if element.frame.minY < top { form.swipeDown(velocity: .slow) }
            else { form.swipeUp(velocity: .slow) }
        }
        XCTFail("Draft control must be reachable: \(element.identifier)")
    }

    private func fullyVisible(_ element: XCUIElement, within bounds: CGRect) -> Bool {
        element.exists && element.isHittable && !element.frame.isEmpty
            && bounds.insetBy(dx: -0.5, dy: -0.5).contains(element.frame)
    }

    private func assertTarget(_ element: XCUIElement) {
        XCTAssertTrue(element.isHittable)
        XCTAssertGreaterThanOrEqual(element.frame.width + 0.001, 44)
        XCTAssertGreaterThanOrEqual(element.frame.height + 0.001, 44)
    }

    private func tap(_ element: XCUIElement) {
        element.coordinate(withNormalizedOffset: CGVector(dx: 0.2, dy: 0.5)).tap()
    }

    private func capture(_ name: String) {
        let attachment = XCTAttachment(screenshot: app.screenshot())
        attachment.name = name; attachment.lifetime = .keepAlways; add(attachment)
    }
}
