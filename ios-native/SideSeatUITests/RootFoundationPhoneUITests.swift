import XCTest

/// Controlled in-memory records only. These checks never submit forms or verify live API flows.
@MainActor final class RootFoundationPhoneUITests: XCTestCase {
    private var app: XCUIApplication!
    private var tabBarY: CGFloat = 0
    private var titleY: CGFloat = 0
    private var bundleID: String {
        ProcessInfo.processInfo.environment["SIDESEAT_PLAN_PRESENTATION_QA_BUNDLE"] ?? "app.sideseat.mobile.preview"
    }
    private var heading: XCUIElement { element("root-navigation-title") }
    private var planCreate: XCUIElement {
        app.buttons.matching(NSPredicate(format: "identifier IN %@", ["plans-create-primary", "plans-create-unified"])).firstMatch
    }

    override func setUpWithError() throws { continueAfterFailure = false }
    override func tearDown() { app?.terminate() }

    func testMonthWeekdayHeadersAcrossAppearanceAndTextSizes() {
        for (language, appearance, large) in [("de", "light", true), ("zh-Hans", "light", false),
                                               ("zh-Hans", "dark", false), ("de", "dark", true)] {
            let tag = "\(language)-\(appearance)-\(large ? "system-max" : "normal")"
            launch(language: language, appearance: appearance, large: large)
            tabBarY = app.tabBars.firstMatch.frame.minY
            titleY = heading.frame.minY
            selectRoot(2)
            for (index, mode) in ["month", "day", "month"].enumerated() {
                let option = app.buttons["calendar-view-\(mode)"]
                assertTarget(option); tap(option); XCTAssertTrue(option.isSelected)
                if mode == "month" {
                    XCTAssertTrue(element("calendar-month-view").waitForExistence(timeout: 8))
                    capture("month-headers-\(index == 0 ? "initial" : "returned")-\(tag)")
                }
            }
            app.terminate()
        }
    }

    func testFiveRootPagesAndReadOnlySubpagesAcrossAppearanceAndTextSizes() {
        for (language, appearance, large) in [("de", "light", true), ("zh-Hans", "light", false),
                                               ("zh-Hans", "dark", false), ("de", "dark", true)] {
            let tag = "\(language)-\(appearance)-\(large ? "system-max" : "normal")"
            launch(language: language, appearance: appearance, large: large)
            tabBarY = app.tabBars.firstMatch.frame.minY
            titleY = heading.frame.minY
            let titles = language == "de" ? ["Zusammen", "Pläne", "Kalender", "Nachrichten", "Ich"]
                : ["同行", "计划", "日历", "消息", "我"]
            for index in 0..<5 {
                selectRoot(index)
                XCTAssertTrue(heading.label.contains(titles[index]))
                switch index {
                case 0: XCTAssertTrue(element("together-segmented-control").waitForExistence(timeout: 10))
                case 1: assertTarget(planCreate); assertTarget(app.buttons["plans-history"])
                case 2:
                    for id in ["calendar-search", "calendar-connections", "manage-calendars", "new-event"] {
                        assertTarget(app.buttons[id])
                    }
                case 3:
                    for id in ["inbox-time-poll", "inbox-message-requests", "inbox-notifications"] {
                        assertTarget(app.buttons[id])
                    }
                    assertShortcutAlignment()
                default: XCTAssertTrue(element("me-profile").waitForExistence(timeout: 10))
                }
                capture("root-\(index)-\(tag)")
            }
            verifyTogetherSelection(tag: tag)
            verifyPlans(tag: tag, large: large, opensCreation: appearance == "light")
            if appearance == "light" {
                verifyMessages(tag: tag)
                verifyCalendar(tag: tag)
                verifyMe(tag: tag, large: large)
            }
            selectRoot(1)
            XCTAssertTrue(app.buttons["plans-tab-waitingResponse"].isSelected)
            selectRoot(0)
            XCTAssertTrue(app.scrollViews["together-section-recommendations"].waitForExistence(timeout: 5))
            capture("roots-returned-\(tag)")
            app.terminate()
        }
    }

    private func launch(language: String, appearance: String, large: Bool) {
        app?.terminate(); app = XCUIApplication(bundleIdentifier: bundleID)
        app.launchArguments = ["--ui-testing-authenticated", "--ui-testing-ephemeral-credentials", "--ui-testing-skip-tutorial",
            "--ui-testing-local-api", "--ui-testing-discover", "--ui-testing-weekly-intent", "--ui-testing-mutual-opportunity",
            "--ui-testing-opportunity-list", "--ui-testing-automatic-matching", "--ui-testing-together-matching",
            "--ui-testing-flexible-timing", "--ui-testing-discovery-matching", "--ui-testing-message-request",
            "--ui-testing-notifications", "--ui-testing-notifications-reset", "--ui-testing-plans-mixed-waiting",
            "--ui-testing-plans-waiting-rail", "--ui-testing-language=\(language)", "--ui-testing-appearance=\(appearance)",
            "-UIPreferredContentSizeCategoryName", large ? "UICTContentSizeCategoryAccessibilityXXXL" : "UICTContentSizeCategoryL"]
        if large { app.launchArguments.append("--ui-testing-dynamic-type-accessibility") }
        app.launchEnvironment = ["SIDESEAT_API_BASE_URL_OVERRIDE": "http://127.0.0.1:9"]
        app.launch()
        XCTAssertTrue(app.tabBars.firstMatch.waitForExistence(timeout: 20))
        XCTAssertTrue(heading.waitForExistence(timeout: 10))
    }

    private func selectRoot(_ index: Int) {
        let tab = app.tabBars.buttons.element(boundBy: index)
        XCTAssertTrue(tab.isHittable); tab.tap(); XCTAssertTrue(tab.isSelected)
        XCTAssertTrue(heading.waitForExistence(timeout: 10))
        assertInWindow(heading)
        let navigation = app.navigationBars.firstMatch.frame
        XCTAssertTrue(navigation.insetBy(dx: -1, dy: -1).contains(heading.frame))
        XCTAssertEqual(heading.frame.midX, app.windows.firstMatch.frame.midX, accuracy: 6,
                       "The shared brand/title group stays centered even with a one-sided tool")
        XCTAssertEqual(heading.frame.minY, titleY, accuracy: 2)
        XCTAssertEqual(app.tabBars.firstMatch.frame.minY, tabBarY, accuracy: 2)
        XCTAssertEqual(app.tabBars.buttons.count, 5)
    }

    private func verifyTogetherSelection(tag: String) {
        selectRoot(0)
        for section in ["intentions", "bookmarks", "recommendations"] {
            let menu = app.buttons["together-section-menu"]
            if menu.exists {
                assertTarget(menu); tap(menu)
                let sheet = element("together-section-picker")
                XCTAssertTrue(sheet.waitForExistence(timeout: 5))
                let option = sheet.buttons["together-tab-\(section)"]
                reveal(option, in: app.scrollViews.firstMatch, bottom: app.windows.firstMatch.frame.maxY - 12)
                assertTarget(option); tap(option)
                XCTAssertTrue(sheet.waitForNonExistence(timeout: 5))
            } else {
                let option = app.buttons["together-tab-\(section)"]
                assertTarget(option); tap(option); XCTAssertTrue(option.isSelected)
            }
            XCTAssertTrue(app.scrollViews["together-section-\(section)"].waitForExistence(timeout: 5))
        }
        selectRoot(1); selectRoot(0)
        XCTAssertTrue(app.scrollViews["together-section-recommendations"].waitForExistence(timeout: 5))
        capture("together-selection-retained-\(tag)")
    }

    private func verifyPlans(tag: String, large: Bool, opensCreation: Bool) {
        selectRoot(1)
        let picker = element("plans-segmented-control")
        for section in ["upcoming", "waitingResponse"] {
            let option = app.buttons["plans-tab-\(section)"]
            assertTarget(option); tap(option); XCTAssertTrue(option.isSelected)
            XCTAssertTrue(app.scrollViews["plans-scroll-\(section)"].waitForExistence(timeout: 5))
            selectRoot(4); selectRoot(1)
            XCTAssertTrue(option.isSelected)
        }
        let scroll = app.scrollViews["plans-scroll-waitingResponse"]
        if !large {
            let expand = app.buttons["plans-toggle-outgoing"]
            reveal(expand, in: scroll, top: picker.frame.maxY + 4, bottom: app.tabBars.firstMatch.frame.minY - 8)
            assertTarget(expand); tap(expand)
        }
        let pickerY = picker.frame.minY, headingY = heading.frame.minY
        let cards = scroll.buttons.matching(NSPredicate(format: "identifier BEGINSWITH 'plans-row-'"))
        let before = cards.allElementsBoundByIndex.first { $0.isHittable }
        XCTAssertNotNil(before)
        let beforeID = before?.identifier, beforeY = before?.frame.minY
        let last = scroll.buttons["plans-row-ui-plan-outgoing-3"]
        for _ in 0..<20 {
            let viewport = CGRect(x: 0, y: picker.frame.maxY + 4, width: app.windows.firstMatch.frame.width,
                                  height: max(0, app.tabBars.firstMatch.frame.minY - picker.frame.maxY - 12))
            if last.exists, last.isHittable, last.frame.maxY <= viewport.maxY,
               last.frame.intersection(viewport).height >= 44 { break }
            scroll.swipeUp(velocity: .slow)
        }
        XCTAssertTrue(last.exists && last.isHittable)
        XCTAssertLessThanOrEqual(last.frame.maxY, app.tabBars.firstMatch.frame.minY - 8)
        let visibleBottom = last.frame.intersection(CGRect(x: 0, y: picker.frame.maxY + 4,
            width: app.windows.firstMatch.frame.width, height: max(0, app.tabBars.firstMatch.frame.minY - picker.frame.maxY - 12)))
        XCTAssertGreaterThanOrEqual(visibleBottom.height, 44,
            "An oversized maximum-text card may span screens; its final segment must remain reachable above the floating tab bar")
        let after = cards.allElementsBoundByIndex.first { $0.isHittable }
        XCTAssertTrue(after?.identifier != beforeID || abs((after?.frame.minY ?? 0) - (beforeY ?? 0)) > 20,
                      "Content must actually move before checking fixed chrome")
        XCTAssertEqual(heading.frame.minY, headingY, accuracy: 2)
        XCTAssertEqual(picker.frame.minY, pickerY, accuracy: 2)
        XCTAssertEqual(app.navigationBars.firstMatch.buttons.matching(NSPredicate(format: "identifier IN %@",
            ["plans-create-primary", "plans-create-unified"])).count, 0)
        capture("plans-last-visible-segment-and-fixed-navigation-\(tag)")
        guard opensCreation else { return }
        for _ in 0..<20 {
            if planCreate.exists, planCreate.isHittable, planCreate.frame.minY >= picker.frame.maxY + 4,
               planCreate.frame.maxY <= app.tabBars.firstMatch.frame.minY - 8 { break }
            scroll.swipeDown(velocity: .slow)
        }
        assertTarget(planCreate)
        tap(planCreate)
        XCTAssertTrue(element("time-poll-title").waitForExistence(timeout: 10))
        XCTAssertFalse(element("time-poll-grid").exists)
        XCTAssertFalse(app.buttons["time-poll-create-confirm"].isEnabled)
        capture("plan-creation-read-only-\(tag)")
        let cancel = toolbarButton(["取消", "Abbrechen", "Cancel"])
        assertTarget(cancel); tap(cancel)
        XCTAssertTrue(picker.waitForExistence(timeout: 8))
        XCTAssertTrue(app.buttons["plans-tab-waitingResponse"].isSelected)
        assertTarget(planCreate)
    }

    private func verifyMessages(tag: String) {
        selectRoot(3)
        let greetings = app.buttons["inbox-message-requests"], notifications = app.buttons["inbox-notifications"]
        assertTarget(greetings); assertTarget(notifications)
        assertShortcutAlignment()
        let unread = notifications.value as? String
        tap(notifications)
        XCTAssertTrue(element("notifications-list").waitForExistence(timeout: 8))
        assertTarget(app.buttons["notifications-read-all"])
        capture("notifications-read-only-\(tag)")
        goBack()
        XCTAssertTrue(notifications.waitForExistence(timeout: 8))
        XCTAssertEqual(notifications.value as? String, unread)
        tap(greetings)
        XCTAssertTrue(element("message-requests-list").waitForExistence(timeout: 8))
        capture("greetings-read-only-\(tag)")
        goBack()
        let search = app.searchFields["inbox-search-field"]
        assertTarget(search); tap(search); search.typeText("foundation-layout-only")
        let clear = search.buttons.firstMatch
        XCTAssertTrue(clear.waitForExistence(timeout: 5)); XCTAssertTrue(clear.isHittable); assertInWindow(clear)
        capture("messages-search-clear-\(tag)")
        tap(clear)
        XCTAssertFalse((search.value as? String ?? "").contains("foundation-layout-only"))
        let cancel = app.buttons["inbox-search-cancel"]
        assertTarget(cancel); tap(cancel)
        XCTAssertTrue(cancel.waitForNonExistence(timeout: 5))
        assertTarget(greetings); assertTarget(notifications)
    }

    private func verifyCalendar(tag: String) {
        selectRoot(2)
        for (mode, surface) in [("month", "calendar-month-view"), ("day", "calendar-day-timeline"),
                                ("week", "home-week-timetable")] {
            let option = app.buttons["calendar-view-\(mode)"]
            assertTarget(option); tap(option); XCTAssertTrue(option.isSelected)
            XCTAssertTrue(element(surface).waitForExistence(timeout: 8))
            capture("calendar-\(mode)-\(tag)")
        }
        for id in ["calendar-search", "calendar-connections", "manage-calendars"] { assertTarget(app.buttons[id]) }
        tap(app.buttons["calendar-search"])
        XCTAssertTrue(element("calendar-search-sheet").waitForExistence(timeout: 8))
        capture("calendar-search-read-only-\(tag)")
        // iOS hides the sheet's own Done while the native searchable drawer is active.
        let endSearch = toolbarButton(["关闭", "Close", "Schließen"])
        assertTarget(endSearch); tap(endSearch)
        XCTAssertTrue(endSearch.waitForNonExistence(timeout: 5))
        XCTAssertTrue(app.keyboards.firstMatch.waitForNonExistence(timeout: 5))
        let searchDone = app.buttons["calendar-search-done"]
        assertTarget(searchDone)
        capture("calendar-search-inactive-before-dismiss-\(tag)")
        tap(searchDone)
        XCTAssertTrue(element("calendar-search-sheet").waitForNonExistence(timeout: 8))
        XCTAssertTrue(app.buttons["calendar-view-week"].waitForExistence(timeout: 8))
        tap(app.buttons["calendar-connections"])
        XCTAssertTrue(app.scrollViews["calendar-connections"].waitForExistence(timeout: 8))
        capture("calendar-connections-read-only-\(tag)")
        closeSheet()
        tap(app.buttons["manage-calendars"])
        XCTAssertTrue(element("calendar-list").waitForExistence(timeout: 8))
        capture("calendar-categories-read-only-\(tag)")
        closeSheet()
        XCTAssertTrue(app.buttons["calendar-view-week"].isSelected)
        selectRoot(4); selectRoot(2)
        XCTAssertTrue(app.buttons["calendar-view-week"].isSelected)
    }

    private func verifyMe(tag: String, large: Bool) {
        selectRoot(4)
        let profile = app.scrollViews["me-profile"]
        let edit = app.buttons["me-hero-edit"]
        reveal(edit, in: profile); assertTarget(edit)
        if large {
            let name = app.staticTexts["me-display-name-visual"]
            XCTAssertTrue(name.exists); XCTAssertGreaterThan(name.frame.height, 40,
                "The profile body must use the actual system maximum, independently of compact chrome")
        }
        tap(edit)
        XCTAssertTrue(element("profile-edit").waitForExistence(timeout: 8))
        capture("profile-edit-without-submission-\(tag)")
        let close = app.buttons["profile-edit-close"]
        assertTarget(close); tap(close)
        XCTAssertTrue(element("me-profile").waitForExistence(timeout: 8))
        let settings = app.buttons["me-settings"]
        reveal(settings, in: profile); assertTarget(settings)
        capture("me-last-settings-row-\(tag)")
        tap(settings)
        XCTAssertTrue(element("settings-root").waitForExistence(timeout: 8))
        capture("settings-without-changes-\(tag)")
        goBack()
        XCTAssertTrue(element("me-profile").waitForExistence(timeout: 8))
        selectRoot(4)
    }

    private func element(_ id: String) -> XCUIElement { app.descendants(matching: .any)[id].firstMatch }

    private func assertShortcutAlignment() {
        let greetings = app.buttons["inbox-message-requests"], notifications = app.buttons["inbox-notifications"]
        XCTAssertLessThanOrEqual(greetings.frame.maxX, notifications.frame.minX + 0.5,
            "The two adjacent targets share one card and must not overlap")
        XCTAssertEqual(greetings.frame.minY, notifications.frame.minY, accuracy: 1)
    }

    private func toolbarButton(_ labels: [String]) -> XCUIElement {
        app.navigationBars.buttons.matching(NSPredicate(format: "label IN %@", labels)).firstMatch
    }

    private func closeSheet() {
        let done = toolbarButton(["完成", "Fertig", "Done"])
        assertTarget(done); tap(done)
        XCTAssertTrue(app.buttons["calendar-view-week"].waitForExistence(timeout: 8))
        XCTAssertTrue(app.buttons["calendar-view-week"].isHittable)
    }

    private func goBack() {
        let back = app.navigationBars.buttons.element(boundBy: 0)
        assertTarget(back); tap(back)
    }

    private func reveal(_ target: XCUIElement, in scroll: XCUIElement, top: CGFloat? = nil, bottom: CGFloat? = nil) {
        for _ in 0..<16 {
            let upper = top ?? app.navigationBars.firstMatch.frame.maxY + 4
            let lower = bottom ?? app.tabBars.firstMatch.frame.minY - 8
            if target.exists, target.isHittable, target.frame.minY >= upper, target.frame.maxY <= lower { return }
            let surface: XCUIElement = scroll.exists ? scroll : app
            if target.exists && target.frame.minY < upper { surface.swipeDown(velocity: .slow) }
            else { surface.swipeUp(velocity: .slow) }
        }
        XCTFail("The entire control must remain reachable: \(target.identifier)")
    }

    private func assertTarget(_ target: XCUIElement) {
        XCTAssertTrue(target.waitForExistence(timeout: 8)); XCTAssertTrue(target.isHittable)
        assertInWindow(target)
        XCTAssertGreaterThanOrEqual(target.frame.width, 44 - 0.001)
        XCTAssertGreaterThanOrEqual(target.frame.height, 44 - 0.001)
    }

    private func assertInWindow(_ target: XCUIElement) {
        XCTAssertFalse(target.frame.isEmpty)
        XCTAssertTrue(app.windows.firstMatch.frame.insetBy(dx: -0.5, dy: -0.5).contains(target.frame))
    }

    private func tap(_ target: XCUIElement) {
        target.coordinate(withNormalizedOffset: CGVector(dx: 0.2, dy: 0.5)).tap()
    }

    private func capture(_ name: String) {
        let attachment = XCTAttachment(screenshot: app.screenshot())
        attachment.name = "foundation219-\(name)"; attachment.lifetime = .keepAlways; add(attachment)
    }
}
