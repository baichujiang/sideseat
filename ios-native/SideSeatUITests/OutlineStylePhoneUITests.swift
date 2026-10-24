import XCTest

/// Screenshot and target checks for button chrome. Offline fixtures do not verify API journeys.
@MainActor final class OutlineStylePhoneUITests: XCTestCase {
    private var app: XCUIApplication!
    private let variants = [("zh-Hans", "light", false), ("zh-Hans", "dark", false),
                            ("de", "light", true), ("de", "dark", true)]
    private var bundleID: String {
        ProcessInfo.processInfo.environment["SIDESEAT_PLAN_PRESENTATION_QA_BUNDLE"] ?? "app.sideseat.mobile.preview"
    }

    override func setUpWithError() throws { continueAfterFailure = false }
    override func tearDown() { app?.terminate() }

    func testFixtureFiveTabsMessagesAndCreation() {
        for (language, appearance, large) in variants {
            let tag = "\(language)-\(appearance)-\(large ? "largest" : "normal")"
            launchFixture(language: language, appearance: appearance, large: large)
            for index in 0..<5 {
                let tab = app.tabBars.buttons.element(boundBy: index)
                XCTAssertTrue(tab.isHittable); tab.tap(); XCTAssertTrue(tab.isSelected)
                let heading = app.descendants(matching: .any)["root-navigation-title"].firstMatch
                XCTAssertTrue(heading.waitForExistence(timeout: 8))
                assertInWindow(heading)
                switch index {
                case 0:
                    XCTAssertTrue(app.descendants(matching: .any)["together-segmented-control"].firstMatch.waitForExistence(timeout: 10))
                case 1:
                    assertTarget(planCreate)
                    assertTarget(app.buttons["plans-history"])
                case 2:
                    assertTarget(app.buttons["calendar-search"])
                case 3:
                    assertTarget(app.buttons["inbox-time-poll"])
                    assertTarget(app.buttons["inbox-message-requests"])
                    assertTarget(app.buttons["inbox-notifications"])
                default:
                    XCTAssertTrue(app.descendants(matching: .any)["me-profile"].firstMatch.waitForExistence(timeout: 10))
                }
                capture("fixture-outline-tab-\(index)-\(tag)")
            }
            app.tabBars.buttons.element(boundBy: 3).tap()
            let greetings = app.buttons["inbox-message-requests"], notifications = app.buttons["inbox-notifications"]
            XCTAssertLessThanOrEqual(greetings.frame.maxX + 4, notifications.frame.minX)
            XCTAssertEqual(greetings.frame.minY, notifications.frame.minY, accuracy: 1)
            let unread = notifications.value as? String
            tap(notifications)
            XCTAssertTrue(app.descendants(matching: .any)["notifications-list"].firstMatch.waitForExistence(timeout: 8))
            let readAll = app.buttons["notifications-read-all"]
            assertTarget(readAll)
            XCTAssertEqual(readAll.label, language == "de" ? "Alle als gelesen markieren" : "全部已读")
            let navigation = app.navigationBars.firstMatch
            XCTAssertGreaterThanOrEqual(readAll.frame.minY, navigation.frame.minY - 0.5)
            XCTAssertLessThanOrEqual(readAll.frame.maxY, navigation.frame.maxY + 0.5)
            capture("fixture-outline-notifications-\(tag)")
            goBack()
            XCTAssertTrue(notifications.waitForExistence(timeout: 8))
            XCTAssertEqual(notifications.value as? String, unread, "Reading the list alone must not mark notifications read")
            tap(greetings)
            XCTAssertTrue(app.descendants(matching: .any)["message-requests-list"].firstMatch.waitForExistence(timeout: 8))
            capture("fixture-outline-greetings-\(tag)")
            goBack()
            assertTarget(greetings)
            let search = app.searchFields["inbox-search-field"]
            XCTAssertTrue(search.waitForExistence(timeout: 5)); tap(search)
            search.typeText("sideseat-outline")
            let clear = search.buttons.firstMatch
            XCTAssertTrue(clear.waitForExistence(timeout: 5)); XCTAssertTrue(clear.isHittable)
            assertInWindow(clear)
            capture("fixture-outline-search-clear-\(tag)")
            tap(clear)
            XCTAssertEqual(search.value as? String, language == "de" ? "Nachrichten durchsuchen" : "搜索消息")
            let searchCancel = app.buttons["inbox-search-cancel"]
            assertTarget(searchCancel); tap(searchCancel)

            app.tabBars.buttons.element(boundBy: 1).tap()
            tap(planCreate)
            let title = app.descendants(matching: .any)["time-poll-title"].firstMatch
            XCTAssertTrue(title.waitForExistence(timeout: 8))
            let create = app.buttons["time-poll-create-confirm"]
            XCTAssertFalse(create.isEnabled)
            let dates = app.buttons["plan-date-options"]
            reveal(dates, above: create)
            assertTarget(dates)
            capture("fixture-outline-creation-top-\(tag)")
            let ideas = app.buttons["plan-start-together"]
            reveal(ideas, above: create)
            assertTarget(ideas)
            tap(ideas); XCTAssertTrue(ideas.isSelected)
            tap(ideas); XCTAssertFalse(ideas.isSelected)
            capture("fixture-outline-creation-options-\(tag)")
            let cancel = toolbarButton(["取消", "Abbrechen", "Cancel"])
            assertTarget(cancel); tap(cancel)
            assertTarget(planCreate)
            app.terminate()
        }
    }

    /// The normal session is used only for a cropped Messages-shortcuts screenshot.
    func testExistingSessionMessagesShortcutStripReadOnly() throws {
        app = XCUIApplication(bundleIdentifier: bundleID)
        app.launchArguments = []; app.launchEnvironment = [:]; app.launch()
        guard app.tabBars.firstMatch.waitForExistence(timeout: 20) else {
            if app.textFields["login-identifier"].exists {
                throw XCTSkip("Preview is signed out; no login or account changes were attempted.")
            }
            XCTFail("The ordinary launch did not expose the tab bar.")
            return
        }
        app.tabBars.buttons.element(boundBy: 3).tap()
        let greetings = app.buttons["inbox-message-requests"], notifications = app.buttons["inbox-notifications"]
        assertTarget(greetings); assertTarget(notifications)
        assertTarget(app.buttons["inbox-time-poll"])
        XCTAssertLessThanOrEqual(greetings.frame.maxX + 4, notifications.frame.minX)
        let strip = app.descendants(matching: .any)["inbox-shortcuts"].firstMatch
        XCTAssertTrue(strip.exists); assertInWindow(strip)
        let attachment = XCTAttachment(screenshot: strip.screenshot())
        attachment.name = "normal-session-outline-message-shortcuts-strip"
        attachment.lifetime = .keepAlways; add(attachment)
    }

    func testSignedOutPrimarySecondaryAndPasswordIcon() {
        for (language, appearance, large) in [("zh-Hans", "light", false), ("de", "dark", true)] {
            let tag = "\(language)-\(appearance)-\(large ? "largest" : "normal")"
            app?.terminate(); app = XCUIApplication(bundleIdentifier: bundleID)
            app.launchArguments = ["--ui-testing-signed-out", "--ui-testing-ephemeral-credentials", "--ui-testing-skip-tutorial",
                "--ui-testing-language=\(language)", "--ui-testing-appearance=\(appearance)",
                "-UIPreferredContentSizeCategoryName", "UICTContentSizeCategoryL"]
            if large { app.launchArguments.append("--ui-testing-dynamic-type-accessibility") }
            app.launchEnvironment = [:]; app.launch()
            let identifier = app.textFields["login-identifier"]
            XCTAssertTrue(identifier.waitForExistence(timeout: 15)); reveal(identifier)
            tap(identifier); identifier.typeText("visual-only")
            let password = app.secureTextFields["login-password"]
            reveal(password); tap(password); password.typeText("visual-only")
            let visibility = app.buttons["login-password-visibility"]
            reveal(visibility); assertTarget(visibility); tap(visibility)
            XCTAssertTrue(app.textFields["login-password"].waitForExistence(timeout: 5))
            capture("fixture-outline-auth-password-icon-\(tag)")
            tap(visibility)
            let submit = app.buttons["login-submit"]
            reveal(submit); assertTarget(submit); XCTAssertTrue(submit.isEnabled)
            capture("fixture-outline-auth-primary-\(tag)")
            for id in ["login-forgot-password", "login-create-account"] {
                let secondary = app.buttons[id]
                reveal(secondary); assertTarget(secondary)
            }
            capture("fixture-outline-auth-secondary-\(tag)")
            // Intentionally never tap Log in, password recovery, or account creation.
            app.terminate()
        }
    }

    private func launchFixture(language: String, appearance: String, large: Bool) {
        app?.terminate()
        app = XCUIApplication(bundleIdentifier: bundleID)
        app.launchArguments = ["--ui-testing-authenticated", "--ui-testing-ephemeral-credentials", "--ui-testing-skip-tutorial",
            "--ui-testing-language=\(language)", "--ui-testing-appearance=\(appearance)",
            "-UIPreferredContentSizeCategoryName", "UICTContentSizeCategoryL"]
        if large { app.launchArguments.append("--ui-testing-dynamic-type-accessibility") }
        app.launchArguments += ["--ui-testing-local-api", "--ui-testing-chats", "--ui-testing-message-request",
                "--ui-testing-notifications", "--ui-testing-notifications-reset", "--ui-testing-discover",
                "--ui-testing-weekly-intent", "--ui-testing-mutual-opportunity", "--ui-testing-opportunity-list",
                "--ui-testing-automatic-matching", "--ui-testing-together-matching", "--ui-testing-flexible-timing",
                "--ui-testing-discovery-matching", "--ui-testing-plans-mixed-waiting", "--ui-testing-plans-waiting-rail"]
        app.launchEnvironment = ["SIDESEAT_API_BASE_URL_OVERRIDE": "http://127.0.0.1:9"]
        app.launch()
        XCTAssertTrue(app.tabBars.firstMatch.waitForExistence(timeout: 20))
    }

    private var planCreate: XCUIElement {
        app.buttons.matching(NSPredicate(format: "identifier IN %@", ["plans-create-primary", "plans-create-unified"])).firstMatch
    }

    private func toolbarButton(_ labels: [String]) -> XCUIElement {
        app.navigationBars.buttons.matching(NSPredicate(format: "label IN %@", labels)).firstMatch
    }

    private func goBack() {
        let back = app.navigationBars.buttons.element(boundBy: 0)
        assertTarget(back); tap(back)
    }

    private func reveal(_ element: XCUIElement, above footer: XCUIElement? = nil) {
        for _ in 0..<10 {
            let bounds = app.windows.firstMatch.frame
            let navigation = app.navigationBars.firstMatch
            let top = (navigation.exists ? navigation.frame.maxY : bounds.minY) + 4
            let bottom = footer?.frame.minY ?? bounds.maxY - 16
            if element.exists && element.isHittable && element.frame.minY >= top && element.frame.maxY <= bottom { return }
            if element.exists && element.frame.minY < top { app.swipeDown(velocity: .slow) }
            else { app.swipeUp(velocity: .slow) }
        }
        XCTFail("The entire control must be reachable: \(element.identifier)")
    }

    private func assertTarget(_ element: XCUIElement) {
        XCTAssertTrue(element.waitForExistence(timeout: 8))
        XCTAssertTrue(element.isHittable)
        assertInWindow(element)
        XCTAssertGreaterThanOrEqual(element.frame.width + 0.001, 44)
        XCTAssertGreaterThanOrEqual(element.frame.height + 0.001, 44)
    }

    private func assertInWindow(_ element: XCUIElement) {
        let frame = element.frame, bounds = app.windows.firstMatch.frame
        XCTAssertFalse(frame.isEmpty)
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
        attachment.name = name; attachment.lifetime = .keepAlways
        add(attachment)
    }
}
