import XCTest

@MainActor final class PlanStatePresentationUITests: XCTestCase {
    private var app: XCUIApplication!

    private func launch(accessibility: Bool = false) {
        if let bundle = ProcessInfo.processInfo.environment["SIDESEAT_PLAN_PRESENTATION_QA_BUNDLE"] {
            app = XCUIApplication(bundleIdentifier: bundle)
        } else { app = XCUIApplication() }
        app.launchArguments = ["--ui-testing-authenticated", "--ui-testing-ephemeral-credentials",
            "--ui-testing-skip-tutorial", "--ui-testing-chats", "--ui-testing-language=zh-Hans", "--ui-testing-local-api"]
        if accessibility { app.launchArguments += ["--ui-testing-appearance=dark", "--ui-testing-dynamic-type-accessibility"] }
        app.launchEnvironment["SIDESEAT_API_BASE_URL_OVERRIDE"] = "http://127.0.0.1:9"
        app.launch()
        XCTAssertTrue(app.tabBars.firstMatch.waitForExistence(timeout: 20))
        app.tabBars.buttons["计划"].tap()
    }

    override func tearDown() { app?.terminate() }

    func testListAndChatUseTheSameStatusAndConfirmationAction() {
        continueAfterFailure = false
        launch()
        let row = app.buttons["plans-row-ui-plan-1"]
        reveal(row)
        XCTAssertEqual(row.value as? String, "等待大家确认")
        XCTAssertTrue(row.label.contains("这个时间，你方便吗？"))
        capture("list-awaiting-confirmation")
        row.tap()
        let accept = app.buttons["plan-card-accept-ui-plan-1"]
        XCTAssertTrue(accept.waitForExistence(timeout: 10))
        XCTAssertEqual(accept.label, "确认参加")
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
        XCTAssertEqual(row.value as? String, "等待大家确认")
        capture("large-text-list")
        row.tap()
        let accept = app.buttons["plan-card-accept-ui-plan-1"]
        XCTAssertTrue(accept.waitForExistence(timeout: 10))
        // Chat owns its scrolling; XCTest reveals this existing response action.
        accept.tap()
        XCTAssertTrue(app.buttons["plan-card-calendar-ui-plan-1"].waitForExistence(timeout: 10))
        capture("large-text-confirmed")
    }

    private func reveal(_ element: XCUIElement) {
        XCTAssertTrue(element.waitForExistence(timeout: 10))
        for _ in 0..<8 where !element.isHittable { app.swipeUp() }
        XCTAssertTrue(element.isHittable)
    }

    private func capture(_ name: String) {
        let image = XCTAttachment(screenshot: app.screenshot())
        image.name = "shared-plan-117-" + name; image.lifetime = .keepAlways; add(image)
    }
}
