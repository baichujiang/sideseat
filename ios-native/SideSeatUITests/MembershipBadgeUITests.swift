import XCTest

@MainActor
final class MembershipBadgeUITests: XCTestCase {
    override func setUpWithError() throws { continueAfterFailure = false }

    func testPersonalBadgeOnlyForActivePlus() throws {
        for state in ["free", "plus-member", "plus-expired"] {
            let app = XCUIApplication()
            app.launchArguments = ["--ui-testing-authenticated", "--ui-testing-skip-tutorial",
                "--ui-testing-language=zh-Hans", "--ui-testing-\(state)"]
            app.launch()
            let me = app.tabBars.buttons["我"]
            XCTAssertTrue(me.waitForExistence(timeout: 5)); me.tap()
            let hero = app.buttons["me-hero-edit"]
            XCTAssertTrue(hero.waitForExistence(timeout: 5))
            if state == "plus-member" {
                XCTAssertTrue(app.descendants(matching: .any)["plus-member-badge"].firstMatch.waitForExistence(timeout: 5))
                XCTAssertTrue((hero.value as? String ?? "").contains("Plus 会员"))
                try app.screenshot().pngRepresentation.write(to: URL(fileURLWithPath: "/tmp/sideseat-plus-profile-zh.png"))
            } else {
                XCTAssertTrue(app.buttons["me-membership"].waitForExistence(timeout: 5))
                XCTAssertFalse(app.descendants(matching: .any)["plus-member-badge"].exists)
            }
            app.terminate()
        }
    }

    func testRecommendationBadgeInDarkModeAndLargeText() throws {
        let app = XCUIApplication()
        app.launchArguments = ["--ui-testing-authenticated", "--ui-testing-skip-tutorial",
            "--ui-testing-discover", "--ui-testing-weekly-intent", "--ui-testing-mutual-opportunity",
            "--ui-testing-automatic-matching", "--ui-testing-together-matching", "--ui-testing-flexible-timing",
            "--ui-testing-discovery-matching", "--ui-testing-plus-member", "--ui-testing-language=de",
            "--ui-testing-appearance=dark", "--ui-testing-dynamic-type-accessibility",
            "-UIPreferredContentSizeCategoryName", "UICTContentSizeCategoryAccessibilityXXXL"]
        app.launch()
        let recommendations = app.buttons["together-tab-recommendations"]
        XCTAssertTrue(recommendations.waitForExistence(timeout: 8)); recommendations.tap()
        let badge = app.descendants(matching: .any)["plus-member-badge"].firstMatch
        for _ in 0..<4 where !badge.isHittable { app.swipeUp() }
        XCTAssertTrue(badge.waitForExistence(timeout: 5))
        XCTAssertTrue(badge.isHittable)
        XCTAssertGreaterThan(badge.frame.width, 35)
        XCTAssertLessThan(badge.frame.maxX, app.frame.maxX)
        try app.screenshot().pngRepresentation.write(to: URL(fileURLWithPath: "/tmp/sideseat-plus-recommendation-de-dark.png"))
    }
}
