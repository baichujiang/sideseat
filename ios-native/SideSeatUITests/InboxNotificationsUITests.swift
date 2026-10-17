import XCTest

@MainActor final class InboxNotificationsUITests: XCTestCase {
    private func launch(_ extra: [String] = []) -> XCUIApplication {
        continueAfterFailure = false
        let bundle = ProcessInfo.processInfo.environment["SIDESEAT_NOTIFICATIONS_QA_BUNDLE"]
        let app = bundle.map { XCUIApplication(bundleIdentifier: $0) } ?? XCUIApplication()
        app.launchArguments = ["--ui-testing-authenticated", "--ui-testing-ephemeral-credentials",
            "--ui-testing-skip-tutorial", "--ui-testing-chats", "--ui-testing-local-api",
            "--ui-testing-language=zh-Hans", "--ui-testing-notifications", "--ui-testing-notifications-reset"] + extra
        app.launchEnvironment["SIDESEAT_API_BASE_URL_OVERRIDE"] = "http://127.0.0.1:9"
        app.launch()
        XCTAssertTrue(app.buttons["inbox-notifications"].waitForExistence(timeout: 15))
        return app
    }

    func testParallelShortcutsReadAllAndExistingGreetings() {
        let app = launch(["--ui-testing-appearance=light"])
        let greetings = app.buttons["inbox-message-requests"]
        let notifications = app.buttons["inbox-notifications"]
        XCTAssertTrue(greetings.isHittable && notifications.isHittable)
        XCTAssertEqual(greetings.frame.minY, notifications.frame.minY, accuracy: 2)
        XCTAssertLessThan(greetings.frame.maxX, notifications.frame.minX)
        XCTAssertEqual(notifications.value as? String, "3")
        capture(app, "shortcuts-light")
        notifications.tap()
        XCTAssertTrue(app.buttons["notification-fixture-invitation"].waitForExistence(timeout: 5))
        capture(app, "list-light")
        app.buttons["notifications-read-all"].tap()
        XCTAssertEqual(app.buttons["notification-fixture-invitation"].value as? String, "已读")
        app.navigationBars.buttons.element(boundBy: 0).tap()
        XCTAssertTrue(notifications.waitForExistence(timeout: 5))
        XCTAssertEqual(notifications.value as? String, "0")
        greetings.tap()
        XCTAssertTrue(app.navigationBars["新招呼"].waitForExistence(timeout: 5))
        app.terminate()
    }

    func testSingleReadAndProfileDestinationInDarkMode() {
        let app = launch(["--ui-testing-appearance=dark"])
        capture(app, "shortcuts-dark")
        app.buttons["inbox-notifications"].tap()
        let result = app.buttons["notification-fixture-verification"]
        XCTAssertTrue(result.waitForExistence(timeout: 5))
        capture(app, "list-dark")
        result.tap()
        XCTAssertTrue(app.tabBars.buttons["我"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.tabBars.buttons["我"].isSelected)
        app.tabBars.buttons["消息"].tap()
        // The notification list stays in the Messages stack; return to the two shortcuts.
        if !app.buttons["inbox-notifications"].isHittable {
            app.navigationBars.buttons.element(boundBy: 0).tap()
        }
        XCTAssertEqual(app.buttons["inbox-notifications"].value as? String, "2")
        app.terminate()
    }

    func testLargestTypeKeepsTwoSeparateAccessibleTargets() {
        let app = launch(["--ui-testing-appearance=dark", "--ui-testing-dynamic-type-accessibility"])
        let a = app.buttons["inbox-message-requests"], b = app.buttons["inbox-notifications"]
        XCTAssertTrue(a.isHittable && b.isHittable)
        XCTAssertGreaterThanOrEqual(a.frame.height, 44)
        XCTAssertGreaterThanOrEqual(b.frame.height, 44)
        XCTAssertLessThan(a.frame.maxX, b.frame.minX)
        XCTAssertLessThanOrEqual(b.frame.maxX, app.frame.maxX)
        capture(app, "shortcuts-accessibility5")
        b.tap()
        XCTAssertTrue(app.buttons["notification-fixture-invitation"].waitForExistence(timeout: 5))
        capture(app, "list-accessibility5")
        app.terminate()
    }

    func testEmptyAndRefreshFailureAreDistinct() {
        for error in [false, true] {
            let app = launch(["--ui-testing-notifications-empty"] + (error ? ["--ui-testing-notifications-error"] : []))
            app.buttons["inbox-notifications"].tap()
            let id = error ? "notifications-error" : "notifications-empty"
            XCTAssertTrue(app.descendants(matching: .any)[id].firstMatch.waitForExistence(timeout: 5))
            capture(app, error ? "refresh-error" : "empty")
            app.terminate()
        }
    }

    private func capture(_ app: XCUIApplication, _ name: String) {
        let attachment = XCTAttachment(screenshot: app.screenshot())
        attachment.name = "notifications112-" + name
        attachment.lifetime = .keepAlways
        add(attachment)
    }
}
