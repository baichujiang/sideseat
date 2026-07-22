import XCTest

/// Manual/local smoke: real login against the Development API (port 3000).
@MainActor
final class LiveLoginSmokeUITests: XCTestCase {
    override func setUpWithError() throws {
        continueAfterFailure = false
        try XCTSkipUnless(
            ProcessInfo.processInfo.environment["SIDESEAT_LIVE_UI_TESTS"] == "1",
            "Set SIDESEAT_LIVE_UI_TESTS=1 against the local Development API."
        )
    }

    func testRealLoginReachesHomeShell() {
        let username = ProcessInfo.processInfo.environment["E2E_USER"] ?? "test_001"
        let password = ProcessInfo.processInfo.environment["E2E_PASSWORD"] ?? "Password123"
        let app = XCUIApplication()
        // Exercise the resilient Keychain path (no ephemeral override).
        app.launchArguments = ["--ui-testing-signed-out"]
        app.launch()

        let identifier = app.textFields["login-identifier"]
        XCTAssertTrue(identifier.waitForExistence(timeout: 5))
        identifier.tap()
        identifier.typeText(username)

        let passwordField = app.secureTextFields["login-password"]
        passwordField.tap()
        passwordField.typeText(password)
        app.buttons["login-submit"].tap()

        // Home shell exposes the calendar add control; also accept other tabs.
        let signedInSignals: [XCUIElement] = [
            app.buttons["calendar-add-menu"],
            app.buttons["new-event"],
            app.descendants(matching: .any)["inbox-list"],
            app.descendants(matching: .any)["me-profile"],
            app.tabBars.buttons["Home"],
            app.tabBars.buttons["首页"],
        ]
        let deadline = Date().addingTimeInterval(20)
        while Date() < deadline {
            if signedInSignals.contains(where: \.exists) {
                return
            }
            if app.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", "Keychain")).firstMatch.exists {
                XCTFail("Keychain error still shown after resilient credential store.")
                return
            }
            RunLoop.current.run(until: Date().addingTimeInterval(0.2))
        }
        XCTFail("Signed-in shell did not appear after login.")
    }
}
