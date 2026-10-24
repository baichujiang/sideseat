import XCTest

/// Current MVP chat entry points on local fixtures only. Never sends or changes a relationship.
@MainActor final class ChatEntryButtonPhoneUITests: XCTestCase {
    private var app: XCUIApplication!
    private var bundleID: String {
        ProcessInfo.processInfo.environment["SIDESEAT_PLAN_PRESENTATION_QA_BUNDLE"] ?? "app.sideseat.mobile.preview"
    }

    override func setUpWithError() throws { continueAfterFailure = false }
    override func tearDown() { app?.terminate() }

    func testLocalChatEntriesAcrossAppearanceAndTextSizes() {
        for (language, appearance, large) in [("zh-Hans", "light", false), ("zh-Hans", "dark", false),
                                               ("de", "light", true), ("de", "dark", true)] {
            let tag = "\(language)-\(appearance)-\(large ? "largest" : "normal")"
            launch(language: language, appearance: appearance, large: large, context: true)
            openChat("ui-connection-leo")
            let title = app.buttons["direct-chat-title"], actions = app.buttons["direct-chat-actions"]
            let plan = app.buttons["chat-composer-plan"], send = app.buttons["chat-composer-send"]
            for action in [title, actions, plan, send] { assertTarget(action) }
            XCTAssertFalse(send.isEnabled)
            XCTAssertLessThanOrEqual(title.frame.maxX + 4, actions.frame.minX)
            let context = app.buttons["conversation-context-bar"]
            assertTarget(context)
            XCTAssertFalse(app.buttons["chat-composer-attach"].exists)
            XCTAssertFalse(app.descendants(matching: .any)["chat-attachment-tray"].firstMatch.exists)
            capture("fixture-chat-entries-\(tag)")

            // This merged accessibility frame includes the navigation bar; tap its visible part.
            let contextBounds = context.frame.intersection(app.windows.firstMatch.frame)
            let visibleTop = max(contextBounds.minY, app.navigationBars.firstMatch.frame.maxY)
            let visibleContext = CGRect(x: contextBounds.minX, y: visibleTop,
                                        width: contextBounds.width, height: contextBounds.maxY - visibleTop)
            XCTAssertGreaterThan(visibleContext.height, 0)
            context.coordinate(withNormalizedOffset: .zero).withOffset(CGVector(
                dx: visibleContext.midX - context.frame.minX,
                dy: visibleContext.midY - context.frame.minY)).tap()
            let contextSheet = app.descendants(matching: .any)["conversation-context-sheet"].firstMatch
            XCTAssertTrue(contextSheet.waitForExistence(timeout: 8))
            capture("fixture-chat-context-\(tag)")
            closeSheet(contextSheet)
            assertTarget(plan); tap(plan)
            let form = app.descendants(matching: .any)["plan-create-sheet"].firstMatch
            XCTAssertTrue(form.waitForExistence(timeout: 8))
            XCTAssertTrue(app.descendants(matching: .any)["plan-create-title"].firstMatch.exists)
            let cancel = toolbarButton(["取消", "Cancel", "Abbrechen"])
            assertTarget(cancel); tap(cancel)
            XCTAssertTrue(form.waitForNonExistence(timeout: 8))
            assertTarget(plan)

            let field = app.textViews["chat-composer-field"]
            XCTAssertTrue(field.waitForExistence(timeout: 8)); tap(field)
            let draft = "UI draft - never send"
            field.typeText(draft)
            XCTAssertEqual(field.value as? String, draft)
            assertTarget(send); XCTAssertTrue(send.isEnabled)
            capture("fixture-chat-draft-not-sent-\(tag)")

            tap(actions)
            let info = app.descendants(matching: .any)["direct-chat-info"].firstMatch
            XCTAssertTrue(info.waitForExistence(timeout: 8))
            let participant = app.buttons["direct-info-participant-context"]
            reveal(participant); assertTarget(participant)
            capture("fixture-chat-info-\(tag)")
            let search = app.buttons["direct-info-search"]
            reveal(search); assertTarget(search); tap(search)
            let searchSheet = app.descendants(matching: .any)["thread-search-sheet"].firstMatch
            XCTAssertTrue(searchSheet.waitForExistence(timeout: 8))
            // iOS search first exposes its own Close action, then the sheet's Done.
            let searchClose = toolbarButton(["关闭", "Close", "Schließen"])
            assertTarget(searchClose); tap(searchClose)
            let searchDone = app.buttons["thread-search-done"]
            assertTarget(searchDone); tap(searchDone)
            XCTAssertTrue(searchSheet.waitForNonExistence(timeout: 8))
            reveal(participant); tap(participant)
            let participantSheet = app.descendants(matching: .any)["participant-context-sheet"].firstMatch
            XCTAssertTrue(participantSheet.waitForExistence(timeout: 8))
            closeSheet(participantSheet)
            goBack()
            XCTAssertTrue(app.buttons["direct-chat-actions"].waitForExistence(timeout: 8))
            XCTAssertEqual(field.value as? String, draft, "Opening and cancelling destinations must keep the unsent draft")
            XCTAssertFalse(app.descendants(matching: .any).matching(NSPredicate(format: "identifier BEGINSWITH 'chat-bubble-ui-local-' AND label CONTAINS %@", draft)).firstMatch.exists)
            goBack()
            XCTAssertTrue(app.buttons["inbox-row-ui-connection-leo"].waitForExistence(timeout: 8))
            app.terminate()
        }
    }

    func testLocalUnreadAndLatestMessageButtons() {
        launch(language: "zh-Hans", appearance: "light", large: false, context: false)
        openChat("ui-connection")
        let unread = app.buttons["chat-unread-jump"]
        assertTarget(unread)
        capture("fixture-chat-unread-jump")
        tap(unread)
        XCTAssertTrue(unread.waitForNonExistence(timeout: 8))
        let firstUnread = app.descendants(matching: .any)["chat-bubble-ui-unread-01"].firstMatch
        XCTAssertTrue(firstUnread.waitForExistence(timeout: 8))
        XCTAssertTrue(firstUnread.isHittable)
        let latest = app.buttons["chat-new-messages"]
        let messages = app.scrollViews["chat-message-list"]
        XCTAssertTrue(messages.waitForExistence(timeout: 8))
        for _ in 0..<6 where !latest.exists || !latest.isHittable { messages.swipeDown(velocity: .slow) }
        assertTarget(latest)
        capture("fixture-chat-latest-after-history-scroll")
        tap(latest)
        XCTAssertTrue(latest.waitForNonExistence(timeout: 8))
        XCTAssertFalse(app.buttons["chat-composer-send"].isEnabled)
        capture("fixture-chat-returned-to-latest")
    }

    private func launch(language: String, appearance: String, large: Bool, context: Bool) {
        app?.terminate(); app = XCUIApplication(bundleIdentifier: bundleID)
        app.launchArguments = ["--ui-testing-authenticated", "--ui-testing-ephemeral-credentials", "--ui-testing-skip-tutorial",
            "--ui-testing-chats", "--ui-testing-reset-inbox-unread", "--ui-testing-local-api",
            "--ui-testing-language=\(language)", "--ui-testing-appearance=\(appearance)",
            "-UIPreferredContentSizeCategoryName", "UICTContentSizeCategoryL"]
        if large { app.launchArguments.append("--ui-testing-dynamic-type-accessibility") }
        if context { app.launchArguments.append("--ui-testing-flexible-timing") }
        app.launchEnvironment = ["SIDESEAT_API_BASE_URL_OVERRIDE": "http://127.0.0.1:9"]
        app.launch()
        XCTAssertTrue(app.tabBars.firstMatch.waitForExistence(timeout: 20))
        app.tabBars.buttons.element(boundBy: 3).tap()
    }

    private func openChat(_ connectionID: String) {
        let row = app.buttons["inbox-row-\(connectionID)"]
        XCTAssertTrue(row.waitForExistence(timeout: 8)); tap(row)
        XCTAssertTrue(app.descendants(matching: .any)["direct-chat"].firstMatch.waitForExistence(timeout: 8))
        XCTAssertTrue(app.buttons["direct-chat-actions"].waitForExistence(timeout: 8))
    }

    private func closeSheet(_ sheet: XCUIElement) {
        let done = toolbarButton(["完成", "Done", "Fertig"])
        // Native floating sheets project their logical controls into a narrower card.
        let window = app.windows.firstMatch.frame
        let frames = "sheet=\(sheet.frame), done=\(done.frame), window=\(window)"
        let geometry = XCTAttachment(string: frames)
        geometry.name = "native-sheet-control-geometry"; geometry.lifetime = .keepAlways; add(geometry)
        let scale = min(1, sheet.frame.width / window.width)
        XCTAssertGreaterThanOrEqual(scale, 0.9)
        assertTarget(done, displayScale: scale); tap(done)
        XCTAssertTrue(sheet.waitForNonExistence(timeout: 8))
    }

    private func toolbarButton(_ labels: [String]) -> XCUIElement {
        app.navigationBars.buttons.matching(NSPredicate(format: "label IN %@", labels)).firstMatch
    }

    private func goBack() {
        let back = app.navigationBars.buttons.element(boundBy: 0)
        assertTarget(back); tap(back)
    }

    private func reveal(_ element: XCUIElement) {
        for _ in 0..<8 {
            let bounds = app.windows.firstMatch.frame
            let top = app.navigationBars.firstMatch.frame.maxY + 4
            if element.exists && element.isHittable && element.frame.minY >= top && element.frame.maxY <= bounds.maxY - 16 { return }
            if element.exists && element.frame.minY < top { app.swipeDown(velocity: .slow) }
            else { app.swipeUp(velocity: .slow) }
        }
        XCTFail("Control must be fully reachable: \(element.identifier)")
    }

    private func assertTarget(_ element: XCUIElement, displayScale: CGFloat = 1) {
        XCTAssertTrue(element.waitForExistence(timeout: 8))
        XCTAssertTrue(element.isHittable)
        let frame = element.frame, bounds = app.windows.firstMatch.frame
        XCTAssertGreaterThanOrEqual(frame.width + 0.001, 44 * displayScale)
        XCTAssertGreaterThanOrEqual(frame.height + 0.001, 44 * displayScale)
        XCTAssertGreaterThanOrEqual(frame.minX, bounds.minX - 0.5)
        XCTAssertLessThanOrEqual(frame.maxX, bounds.maxX + 0.5)
        XCTAssertGreaterThanOrEqual(frame.minY, bounds.minY - 0.5)
        XCTAssertLessThanOrEqual(frame.maxY, bounds.maxY + 0.5)
    }

    private func tap(_ element: XCUIElement) {
        element.coordinate(withNormalizedOffset: CGVector(dx: 0.2, dy: 0.5)).tap()
    }

    private func capture(_ name: String) {
        let attachment = XCTAttachment(screenshot: app.screenshot())
        attachment.name = name; attachment.lifetime = .keepAlways; add(attachment)
    }
}
