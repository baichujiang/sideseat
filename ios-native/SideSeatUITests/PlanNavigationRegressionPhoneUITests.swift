import XCTest

/// Offline history/chat navigation only; no account, plan or message writes.
@MainActor final class PlanNavigationRegressionPhoneUITests: XCTestCase {
    private var app: XCUIApplication!
    private var bundleID: String {
        ProcessInfo.processInfo.environment["SIDESEAT_PLAN_PRESENTATION_QA_BUNDLE"] ?? "app.sideseat.mobile.preview"
    }

    override func setUpWithError() throws { continueAfterFailure = false }
    override func tearDown() { app?.terminate() }

    func testRegularHistoryReturnAndExtraFinalPageSwipe() {
        verifyHistoryBoundary(language: "zh-Hans", large: false)
    }

    func testLargestHistoryReturnAndExtraFinalPageSwipe() {
        verifyHistoryBoundary(language: "de", large: true)
    }

    func testHistoryReturnAndFinalPageBoundaryAcrossTextSizes() {
        for (language, large) in [("zh-Hans", false), ("de", true)] {
            verifyHistoryBoundary(language: language, large: large)
        }
    }

    func testSharedPagerBoundariesAndWaitingRailExclusion() {
        launch(language: "zh-Hans", large: false, sharedPager: true)
        select("waitingResponse")
        app.scrollViews["plans-scroll-waitingResponse"].swipeRight(velocity: .slow)
        assertRoot(section: "waitingResponse", language: "zh-Hans", phase: "first-page-right-boundary")
        verifyWaitingRail()
        assertCreateCancel(section: "waitingResponse", language: "zh-Hans", tag: "waiting-rail")

        tap(app.tabBars.buttons["同行"])
        let intentions = app.buttons["together-tab-intentions"]
        assertTarget(intentions); tap(intentions)
        assertTogether(section: "intentions", phase: "first-page")
        swipeTogether(section: "intentions", left: false)
        assertTogether(section: "intentions", phase: "first-page-right-boundary")
        for (current, next, left) in [("intentions", "recommendations", true),
                                      ("recommendations", "bookmarks", true)] {
            swipeTogether(section: current, left: left)
            assertTogether(section: next, phase: "forward-\(next)")
        }
        swipeTogether(section: "bookmarks", left: true)
        assertTogether(section: "bookmarks", phase: "last-page-left-boundary")
        capture("navigation-together-last-page-boundary")
        for (current, next) in [("bookmarks", "recommendations"), ("recommendations", "intentions")] {
            swipeTogether(section: current, left: false)
            assertTogether(section: next, phase: "back-\(next)")
        }
        capture("navigation-together-first-page-returned")
        tap(app.tabBars.buttons["计划"])
        assertRoot(section: "waitingResponse", language: "zh-Hans", phase: "returned-from-together")
    }

    private func verifyHistoryBoundary(language: String, large: Bool) {
        let tag = "\(language)-\(large ? "largest-dark" : "normal-light")"
        launch(language: language, large: large)
        select("upcoming")
        assertRoot(section: "upcoming", language: language, phase: "initial-\(tag)")

        for round in 1...2 {
            let history = app.buttons["plans-history"]
            assertTarget(history); tap(history)
            let historyRoot = app.descendants(matching: .any)["plans-history-root"].firstMatch
            XCTAssertTrue(historyRoot.waitForExistence(timeout: 10))
            let historyBar = app.navigationBars[language == "de" ? "Planverlauf" : "历史计划"]
            XCTAssertTrue(historyBar.exists)
            let record = app.buttons["plans-row-ui-plan-completed"]
            let visibleRecord = revealHistoryRecord(record)
            capture("navigation-history-\(round)-\(tag)")
            tapVisibleCard(record, visible: visibleRecord)
            let chat = app.descendants(matching: .any)["direct-chat"].firstMatch
            XCTAssertTrue(chat.waitForExistence(timeout: 10)); XCTAssertTrue(chat.isHittable)
            capture("navigation-history-chat-\(round)-\(tag)")
            let chatBack = app.navigationBars.firstMatch.buttons.firstMatch
            XCTAssertTrue(chatBack.isHittable); tap(chatBack)
            XCTAssertTrue(historyRoot.waitForExistence(timeout: 10))
            XCTAssertTrue(chat.waitForNonExistence(timeout: 5))
            XCTAssertTrue(historyBar.waitForExistence(timeout: 5))
            let historyBack = historyBar.buttons.firstMatch
            XCTAssertTrue(historyBack.isHittable); tap(historyBack)
            XCTAssertTrue(historyRoot.waitForNonExistence(timeout: 5))
            assertRoot(section: "upcoming", language: language, phase: "returned-\(round)-\(tag)")
        }

        // The last section has no page to its leftward gesture; a popped chat must not return.
        app.scrollViews["plans-scroll-upcoming"].swipeLeft(velocity: .slow)
        capture("navigation-extra-left-after-history-\(tag)")
        assertRoot(section: "upcoming", language: language, phase: "extra-left-\(tag)")
        swipeVisibleUpcomingCardLeft()
        capture("navigation-card-middle-extra-left-\(tag)")
        assertRoot(section: "upcoming", language: language, phase: "card-extra-left-\(tag)")
        assertCreateCancel(section: "upcoming", language: language, tag: tag)

        // Verify ordinary page changes still work in both directions after the boundary gesture.
        swipePage(section: "upcoming", left: false)
        assertRoot(section: "waitingResponse", language: language, phase: "swipe-back-\(tag)")
        swipePage(section: "waitingResponse", left: true)
        assertRoot(section: "upcoming", language: language, phase: "swipe-forward-\(tag)")
        select("waitingResponse"); select("upcoming")
        app.scrollViews["plans-scroll-upcoming"].swipeLeft(velocity: .slow)
        capture("navigation-final-boundary-\(tag)")
        assertRoot(section: "upcoming", language: language, phase: "final-boundary-\(tag)")
        app.terminate()
    }

    private func launch(language: String, large: Bool, sharedPager: Bool = false) {
        app?.terminate(); app = XCUIApplication(bundleIdentifier: bundleID)
        app.launchArguments = ["--ui-testing-authenticated", "--ui-testing-ephemeral-credentials",
            "--ui-testing-skip-tutorial", "--ui-testing-chats", "--ui-testing-plans-mixed-waiting",
            "--ui-testing-plans-waiting-rail", "--ui-testing-plans-long-list", "--ui-testing-local-api",
            "--ui-testing-language=\(language)", "--ui-testing-appearance=\(large ? "dark" : "light")",
            "-UIPreferredContentSizeCategoryName", "UICTContentSizeCategoryL"]
        if sharedPager {
            app.launchArguments.removeAll { $0 == "--ui-testing-plans-long-list" }
            app.launchArguments += ["--ui-testing-discover", "--ui-testing-weekly-intent", "--ui-testing-mutual-opportunity",
                "--ui-testing-automatic-matching", "--ui-testing-together-matching", "--ui-testing-flexible-timing",
                "--ui-testing-discovery-matching", "--ui-testing-intent-card-states", "--ui-testing-opportunity-list"]
        }
        if large { app.launchArguments.append("--ui-testing-dynamic-type-accessibility") }
        app.launchEnvironment = ["SIDESEAT_API_BASE_URL_OVERRIDE": "http://127.0.0.1:9"]
        app.launch()
        let plans = app.tabBars.buttons[language == "de" ? "Pläne" : "计划"]
        XCTAssertTrue(plans.waitForExistence(timeout: 20)); tap(plans)
        XCTAssertTrue(app.buttons["plans-row-ui-plan-1"].waitForExistence(timeout: 10))
    }

    private var create: XCUIElement {
        app.buttons.matching(NSPredicate(format: "identifier IN %@", ["plans-create-primary", "plans-create-unified"])).firstMatch
    }

    private func select(_ section: String) {
        let control = app.buttons["plans-tab-\(section)"]
        assertTarget(control); tap(control)
        XCTAssertTrue(control.isSelected)
        XCTAssertTrue(app.scrollViews["plans-scroll-\(section)"].waitForExistence(timeout: 5))
    }

    private func assertRoot(section: String, language: String, phase: String) {
        let heading = app.descendants(matching: .any)["root-navigation-title"].firstMatch
        let chat = app.descendants(matching: .any)["direct-chat"].firstMatch
        let history = app.descendants(matching: .any)["plans-history-root"].firstMatch
        let page = app.scrollViews["plans-scroll-\(section)"]
        let control = app.buttons["plans-tab-\(section)"]
        let title = language == "de" ? "Pläne" : "计划"
        print("PLAN_NAVIGATION \(phase) chat=\(chat.exists) history=\(history.exists) heading=\(heading.exists ? heading.frame : .zero) page=\(page.exists ? page.frame : .zero) selected=\(control.exists && control.isSelected)")
        if chat.exists || history.exists || !heading.isHittable || !create.isHittable || !control.isSelected {
            capture("navigation-root-failed-\(phase)")
        }
        XCTAssertFalse(chat.exists, "A previously popped chat must not overlay the Plans root")
        XCTAssertFalse(history.exists)
        XCTAssertTrue(app.tabBars.buttons[title].isSelected)
        XCTAssertTrue(app.navigationBars[title].exists)
        XCTAssertTrue(heading.isHittable); XCTAssertTrue(heading.label.contains(title))
        assertInWindow(heading)
        assertTarget(create); assertTarget(app.buttons["plans-history"]); assertTarget(control)
        XCTAssertTrue(control.isSelected)
        let picker = app.descendants(matching: .any)["plans-segmented-control"].firstMatch
        XCTAssertEqual(picker.buttons.allElementsBoundByIndex.filter(\.isSelected).count, 1)
        XCTAssertTrue(page.exists && page.isHittable)
        XCTAssertGreaterThanOrEqual(page.frame.intersection(app.windows.firstMatch.frame).width,
                                    app.windows.firstMatch.frame.width - 1,
                                    "The active page must occupy the visible window, rather than exist offscreen")
    }

    private func assertCreateCancel(section: String, language: String, tag: String) {
        assertTarget(create); tap(create)
        let title = app.descendants(matching: .any)["time-poll-title"].firstMatch
        XCTAssertTrue(title.waitForExistence(timeout: 10))
        capture("navigation-create-after-boundary-\(tag)")
        let cancel = app.navigationBars.buttons[language == "de" ? "Abbrechen" : "取消"]
        assertTarget(cancel); tap(cancel)
        XCTAssertTrue(title.waitForNonExistence(timeout: 5))
        assertRoot(section: section, language: language, phase: "create-cancel-\(tag)")
        capture("navigation-create-cancel-retained-section-\(tag)")
    }

    private func revealHistoryRecord(_ record: XCUIElement) -> CGRect {
        XCTAssertTrue(record.waitForExistence(timeout: 10))
        let scroll = app.scrollViews["plans-scroll-ended"]
        for attempt in 0..<8 {
            let visible = visibleCardBounds(top: app.navigationBars.firstMatch.frame.maxY)
            let frame = record.exists ? record.frame : .zero
            let intersection = frame.intersection(visible)
            print("PLAN_HISTORY_RECORD attempt=\(attempt) card=\(frame) visible=\(visible) intersection=\(intersection)")
            if attempt == 0 { capture("navigation-history-record-initial-visible-region") }
            if record.exists && record.isHittable && intersection.width >= 44 && intersection.height >= 44 {
                XCTAssertGreaterThanOrEqual(frame.width + 0.001, 44)
                XCTAssertGreaterThanOrEqual(frame.height + 0.001, 44)
                return intersection
            }
            if !frame.isEmpty && frame.minY < visible.minY { scroll.swipeDown(velocity: .slow) }
            else { scroll.swipeUp(velocity: .slow) }
        }
        capture("navigation-history-record-not-reachable")
        XCTFail("A real 44pt visible part of the scrollable history card must be reachable")
        return .zero
    }

    private func visibleCardBounds(top: CGFloat) -> CGRect {
        let window = app.windows.firstMatch.frame
        var bottom = app.tabBars.firstMatch.exists ? app.tabBars.firstMatch.frame.minY : window.maxY
        let create = app.buttons.matching(NSPredicate(format: "identifier IN %@", ["plans-create-primary", "plans-create-unified"])).firstMatch
        if create.exists { bottom = min(bottom, create.frame.minY) }
        return CGRect(x: window.minX, y: top, width: window.width, height: max(0, bottom - top))
    }

    private func tapVisibleCard(_ card: XCUIElement, visible: CGRect) {
        XCTAssertTrue(card.isHittable)
        XCTAssertGreaterThanOrEqual(visible.width, 44); XCTAssertGreaterThanOrEqual(visible.height, 44)
        if visible.insetBy(dx: -0.501, dy: -0.501).contains(card.frame) { tap(card); return }
        let point = CGPoint(x: visible.minX + visible.width * 0.2, y: visible.midY)
        XCTAssertTrue(visible.contains(point) && card.frame.contains(point))
        app.coordinate(withNormalizedOffset: .zero)
            .withOffset(CGVector(dx: point.x - app.frame.minX, dy: point.y - app.frame.minY)).tap()
    }

    private func swipePage(section: String, left: Bool) {
        XCTAssertTrue(app.buttons["plans-tab-\(section)"].isSelected)
        let surface = app.scrollViews["plans-scroll-\(section)"]
        XCTAssertTrue(surface.exists && surface.isHittable)
        let start = surface.coordinate(withNormalizedOffset: CGVector(dx: left ? 0.82 : 0.18, dy: 0.08))
        let end = surface.coordinate(withNormalizedOffset: CGVector(dx: left ? 0.18 : 0.82, dy: 0.08))
        start.press(forDuration: 0.08, thenDragTo: end, withVelocity: .slow, thenHoldForDuration: 0.1)
    }

    private func swipeVisibleUpcomingCardLeft() {
        let page = app.scrollViews["plans-scroll-upcoming"]
        let bounds = visibleCardBounds(top: app.descendants(matching: .any)["plans-segmented-control"].firstMatch.frame.maxY)
        let cards = page.buttons.matching(NSPredicate(format: "identifier BEGINSWITH %@", "plans-row-"))
        guard let card = cards.allElementsBoundByIndex.first(where: {
            let visible = $0.frame.intersection(bounds)
            return $0.isHittable && visible.width >= 44 && visible.height >= 44
        }) else {
            capture("navigation-no-visible-boundary-card")
            XCTFail("A real 44pt visible part of an upcoming card is required for the boundary gesture")
            return
        }
        XCTAssertGreaterThanOrEqual(card.frame.width + 0.001, 44)
        XCTAssertGreaterThanOrEqual(card.frame.height + 0.001, 44)
        let visible = card.frame.intersection(bounds)
        print("PLAN_NAVIGATION_BOUNDARY_CARD id=\(card.identifier) frame=\(card.frame) visible=\(visible)")
        if visible.insetBy(dx: -0.501, dy: -0.501).contains(card.frame) {
            card.coordinate(withNormalizedOffset: CGVector(dx: 0.82, dy: 0.5))
                .press(forDuration: 0.08,
                    thenDragTo: card.coordinate(withNormalizedOffset: CGVector(dx: 0.18, dy: 0.5)),
                    withVelocity: .slow, thenHoldForDuration: 0.1)
        } else {
            let start = CGPoint(x: visible.minX + visible.width * 0.82, y: visible.midY)
            let end = CGPoint(x: visible.minX + visible.width * 0.18, y: visible.midY)
            XCTAssertTrue(visible.contains(start) && visible.contains(end))
            let origin = app.coordinate(withNormalizedOffset: .zero)
            origin.withOffset(CGVector(dx: start.x - app.frame.minX, dy: start.y - app.frame.minY))
                .press(forDuration: 0.08,
                    thenDragTo: origin.withOffset(CGVector(dx: end.x - app.frame.minX, dy: end.y - app.frame.minY)),
                    withVelocity: .slow, thenHoldForDuration: 0.1)
        }
    }

    private func verifyWaitingRail() {
        let page = app.scrollViews["plans-scroll-waitingResponse"]
        let rail = page.scrollViews["plans-waiting-rail"]
        XCTAssertTrue(rail.waitForExistence(timeout: 8), "The existing fixture must expose the real waiting rail")
        let window = app.windows.firstMatch.frame
        let top = app.descendants(matching: .any)["plans-segmented-control"].firstMatch.frame.maxY
        let visible = visibleCardBounds(top: top).intersection(page.frame)
        for _ in 0..<8 {
            if rail.isHittable && visible.insetBy(dx: -0.501, dy: -0.501).contains(rail.frame) { break }
            page.swipeUp(velocity: .slow)
        }
        XCTAssertTrue(rail.isHittable)
        XCTAssertTrue(visible.insetBy(dx: -0.501, dy: -0.501).contains(rail.frame))
        let cards = rail.buttons.matching(NSPredicate(format: "identifier BEGINSWITH %@", "plans-row-"))
        guard let before = cards.allElementsBoundByIndex.first(where: { $0.isHittable }) else {
            capture("navigation-waiting-rail-not-testable")
            XCTFail("The rail requires a real visible card before verifying gesture exclusion")
            return
        }
        let beforeID = before.identifier, beforeX = before.frame.minX
        rail.coordinate(withNormalizedOffset: CGVector(dx: 0.82, dy: 0.5))
            .press(forDuration: 0.08,
                thenDragTo: rail.coordinate(withNormalizedOffset: CGVector(dx: 0.18, dy: 0.5)),
                withVelocity: .slow, thenHoldForDuration: 0.1)
        assertRoot(section: "waitingResponse", language: "zh-Hans", phase: "inside-waiting-rail-left")
        guard let after = cards.allElementsBoundByIndex.first(where: { $0.isHittable }) else {
            XCTFail("The horizontal waiting rail must keep a visible card after scrolling")
            return
        }
        XCTAssertTrue(after.identifier != beforeID || abs(after.frame.minX - beforeX) > 20,
                      "The real horizontal rail must move while the root section remains selected")
        capture("navigation-waiting-rail-excluded-from-paging")
        rail.coordinate(withNormalizedOffset: CGVector(dx: 0.18, dy: 0.5))
            .press(forDuration: 0.08,
                thenDragTo: rail.coordinate(withNormalizedOffset: CGVector(dx: 0.82, dy: 0.5)),
                withVelocity: .slow, thenHoldForDuration: 0.1)
        assertRoot(section: "waitingResponse", language: "zh-Hans", phase: "inside-waiting-rail-right")
    }

    private func swipeTogether(section: String, left: Bool) {
        XCTAssertTrue(app.buttons["together-tab-\(section)"].isSelected)
        let page = app.scrollViews["together-section-\(section)"]
        XCTAssertTrue(page.exists && page.isHittable)
        page.coordinate(withNormalizedOffset: CGVector(dx: left ? 0.82 : 0.18, dy: 0.08))
            .press(forDuration: 0.08,
                thenDragTo: page.coordinate(withNormalizedOffset: CGVector(dx: left ? 0.18 : 0.82, dy: 0.08)),
                withVelocity: .slow, thenHoldForDuration: 0.1)
    }

    private func assertTogether(section: String, phase: String) {
        let page = app.scrollViews["together-section-\(section)"]
        let control = app.buttons["together-tab-\(section)"]
        let heading = app.descendants(matching: .any)["root-navigation-title"].firstMatch
        print("TOGETHER_NAVIGATION \(phase) page=\(page.exists ? page.frame : .zero) selected=\(control.exists && control.isSelected)")
        if !page.isHittable || !control.isSelected { capture("navigation-together-failed-\(phase)") }
        XCTAssertTrue(app.tabBars.buttons["同行"].isSelected)
        XCTAssertTrue(heading.isHittable); XCTAssertTrue(heading.label.contains("同行"))
        XCTAssertTrue(page.exists && page.isHittable); XCTAssertTrue(control.isSelected)
        assertTarget(control)
        let picker = app.descendants(matching: .any)["together-segmented-control"].firstMatch
        XCTAssertEqual(picker.buttons.allElementsBoundByIndex.filter(\.isSelected).count, 1)
        XCTAssertGreaterThanOrEqual(page.frame.intersection(app.windows.firstMatch.frame).width,
                                    app.windows.firstMatch.frame.width - 1)
        XCTAssertFalse(app.descendants(matching: .any)["direct-chat"].firstMatch.exists)
        XCTAssertFalse(app.descendants(matching: .any)["together-private-profile"].firstMatch.exists)
        XCTAssertFalse(app.descendants(matching: .any)["public-profile"].firstMatch.exists)
    }

    private func assertTarget(_ target: XCUIElement) {
        XCTAssertTrue(target.waitForExistence(timeout: 5)); XCTAssertTrue(target.isHittable)
        assertInWindow(target)
        XCTAssertGreaterThanOrEqual(target.frame.width + 0.001, 44)
        XCTAssertGreaterThanOrEqual(target.frame.height + 0.001, 44)
    }

    private func assertInWindow(_ target: XCUIElement) {
        XCTAssertFalse(target.frame.isEmpty)
        XCTAssertTrue(app.windows.firstMatch.frame.insetBy(dx: -0.501, dy: -0.501).contains(target.frame))
    }

    private func tap(_ target: XCUIElement) {
        target.coordinate(withNormalizedOffset: CGVector(dx: 0.2, dy: 0.5)).tap()
    }

    private func capture(_ name: String) {
        let attachment = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
        attachment.name = name; attachment.lifetime = .keepAlways; add(attachment)
    }
}
