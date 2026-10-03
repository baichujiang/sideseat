import XCTest

@MainActor
final class ProfileAppearanceUITests: XCTestCase {
    override func setUpWithError() throws { continueAfterFailure = false }

    private func launch(plus: Bool, large: Bool = false) -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments = ["--ui-testing-authenticated", "--ui-testing-skip-tutorial", large ? "--ui-testing-language=de" : "--ui-testing-language=zh-Hans"]
        if plus { app.launchArguments.append("--ui-testing-plus-member") }
        if large { app.launchArguments += ["--ui-testing-appearance=dark", "--ui-testing-dynamic-type-accessibility"] }
        app.launch()
        let me = app.tabBars.buttons.element(boundBy: 4)
        XCTAssertTrue(me.waitForExistence(timeout: 8)); me.tap()
        let entry = app.buttons["me-personalization"]
        for _ in 0..<8 where !entry.isHittable { app.swipeUp() }
        XCTAssertTrue(entry.waitForExistence(timeout: 5)); entry.tap()
        XCTAssertTrue(app.otherElements["appearance-preview"].waitForExistence(timeout: 5))
        return app
    }

    private func tap(_ id: String, in app: XCUIApplication) {
        let item = app.buttons[id]
        for _ in 0..<8 where !item.isHittable { app.swipeUp() }
        XCTAssertTrue(item.isHittable); item.tap()
    }

    func testPlusSavesAndReopensStyle() throws {
        let app = launch(plus: true)
        tap("appearance-theme-ocean", in: app)
        tap("appearance-icon-moon", in: app)
        tap("appearance-style-outline", in: app)
        XCTAssertTrue(app.buttons["appearance-save"].isEnabled)
        app.buttons["appearance-save"].tap()
        XCTAssertTrue(app.buttons["me-personalization"].waitForExistence(timeout: 5))
        for _ in 0..<6 { app.swipeDown() }
        try app.screenshot().pngRepresentation.write(to: URL(fileURLWithPath: "/tmp/sideseat-personalization-profile.png"))
        tap("me-personalization", in: app)
        let ocean = app.buttons["appearance-theme-ocean"]
        XCTAssertTrue(ocean.waitForExistence(timeout: 5))
        XCTAssertTrue(ocean.isSelected)
        XCTAssertFalse(app.buttons["appearance-save"].isEnabled)
        try app.screenshot().pngRepresentation.write(to: URL(fileURLWithPath: "/tmp/sideseat-personalization-editor.png"))
    }

    func testFreeCanPreviewPlusButCanSaveOnlyFreeStyles() {
        let app = launch(plus: false)
        tap("appearance-theme-ocean", in: app)
        XCTAssertFalse(app.buttons["appearance-save"].isEnabled)
        tap("appearance-theme-rose", in: app)
        XCTAssertTrue(app.buttons["appearance-save"].isEnabled)
        app.buttons["appearance-save"].tap()
        XCTAssertTrue(app.buttons["me-personalization"].waitForExistence(timeout: 5))
    }

    func testLargeTextDarkPreview() throws {
        let app = launch(plus: true, large: true)
        tap("appearance-theme-forest", in: app)
        XCTAssertTrue(app.buttons["appearance-save"].isHittable)
        for _ in 0..<8 { app.swipeDown() }
        try app.screenshot().pngRepresentation.write(to: URL(fileURLWithPath: "/tmp/sideseat-personalization-large-dark.png"))
    }
}
