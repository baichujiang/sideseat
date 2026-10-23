import XCTest

@MainActor
final class ButtonOutlinePhoneUITests: XCTestCase {
    override func setUpWithError() throws { continueAfterFailure = false }

    func testActionButtonsAcrossMainPagesAndForms() {
        for (language, appearance, large) in [("zh-Hans", "light", false), ("en", "dark", false), ("de", "dark", true)] {
            let app = XCUIApplication(bundleIdentifier: "app.sideseat.mobile.preview")
            app.launchArguments = ["--ui-testing-authenticated", "--ui-testing-ephemeral-credentials", "--ui-testing-skip-tutorial",
                "--ui-testing-weekly-intent", "--ui-testing-mutual-opportunity", "--ui-testing-intent-card-states", "--ui-testing-explore-intents",
                "--ui-testing-automatic-matching", "--ui-testing-together-matching", "--ui-testing-discovery-matching", "--ui-testing-flexible-timing",
                "--ui-testing-local-api", "--ui-testing-language=\(language)", "--ui-testing-appearance=\(appearance)"]
            if large { app.launchArguments.append("--ui-testing-dynamic-type-accessibility") }
            app.launchEnvironment = ["SIDESEAT_API_BASE_URL_OVERRIDE": "http://127.0.0.1:9"]
            app.launch()
            XCTAssertTrue(app.tabBars.firstMatch.waitForExistence(timeout: 15))
            for index in [0, 1, 2, 3, 4] {
                let tab = app.tabBars.buttons.element(boundBy: index)
                XCTAssertTrue(tab.exists); tab.tap()
                if index == 0 || index == 1 {
                    let identifier = index == 0 ? "together-segmented-control" : "plans-segmented-control"
                    let picker = app.descendants(matching: .any)[identifier].firstMatch
                    XCTAssertTrue(picker.exists)
                    XCTAssertLessThanOrEqual(picker.frame.height, 80,
                        "Section picker stays compact at the largest accessibility text size.")
                }
                capture(app, "outline184-\(language)-tab-\(index)")
            }
            app.tabBars.buttons.element(boundBy: 1).tap()
            let create = app.buttons.matching(NSPredicate(format: "identifier IN %@", ["plans-create-primary", "plans-create-unified"])).firstMatch
            reveal(create, in: app); checkTarget(create, in: app); create.tap()
            XCTAssertTrue(app.textFields["time-poll-title"].waitForExistence(timeout: 8))
            capture(app, "outline184-\(language)-plan-form")
            cancel(in: app)
            app.tabBars.buttons.element(boundBy: 0).tap()
            let intents = app.buttons["together-tab-intentions"]
            if !intents.exists {
                let menu = app.buttons["together-section-menu"]
                XCTAssertTrue(menu.waitForExistence(timeout: 8)); menu.tap()
            }
            XCTAssertTrue(intents.waitForExistence(timeout: 5)); intents.tap()
            let add = app.buttons.matching(NSPredicate(format: "identifier IN %@", ["together-add-intent", "together-add-first-intent"])).firstMatch
            reveal(add, in: app); checkTarget(add, in: app); add.tap()
            XCTAssertTrue(app.descendants(matching: .any)["intent-editor"].waitForExistence(timeout: 8))
            capture(app, "outline184-\(language)-intention-form")
            cancel(in: app)
            app.terminate()
        }
    }

    func testOutlinedAuthActions() {
        let app = XCUIApplication(bundleIdentifier: "app.sideseat.mobile.preview")
        app.launchArguments = ["--ui-testing-signed-out", "--ui-testing-ephemeral-credentials", "--ui-testing-skip-tutorial", "--ui-testing-language=zh-Hans", "--ui-testing-appearance=light"]
        app.launch()
        XCTAssertTrue(app.textFields["login-identifier"].waitForExistence(timeout: 15))
        capture(app, "outline184-auth")
        app.terminate()
    }

    func testInvitationReviewBackControl() throws {
        struct Fixture: Decodable {
            struct Account: Decodable { let role: String; let accessToken: String }
            let bundle: String; let finalBlockToken: String; let accounts: [Account]
        }
        let raw = ProcessInfo.processInfo.environment["SIDESEAT_PLAN_CONTACTS_JSON"]
        try XCTSkipIf(raw == nil, "Requires the disposable final-time layout fixture.")
        let fixture = try JSONDecoder().decode(Fixture.self, from: Data(raw!.utf8))
        let owner = try XCTUnwrap(fixture.accounts.first { $0.role == "owner" })
        for (language, large) in [("zh-Hans", false), ("en", false), ("de", true)] {
            let app = XCUIApplication(bundleIdentifier: fixture.bundle)
            app.launchArguments = ["--ui-testing-authenticated", "--ui-testing-ephemeral-credentials", "--ui-testing-skip-tutorial",
                "--ui-testing-time-poll-live", "--ui-testing-language=\(language)", "--ui-testing-appearance=dark",
                "--ui-testing-deep-link=/time-polls/\(fixture.finalBlockToken)"]
            if large { app.launchArguments.append("--ui-testing-dynamic-type-accessibility") }
            app.launchEnvironment = ["SIDESEAT_QA_ACCESS_TOKEN": owner.accessToken]
            app.launch()
            let choose = app.buttons["unified-plan-invite-window"]
            XCTAssertTrue(choose.waitForExistence(timeout: 25)); choose.tap()
            let cell = app.buttons["time-poll-cell-0"]
            XCTAssertTrue(cell.waitForExistence(timeout: 10)); cell.tap()
            app.buttons["unified-plan-review-roster"].tap()
            let back = app.buttons["unified-plan-back-to-timetable"]
            XCTAssertTrue(back.waitForExistence(timeout: 10)); checkTarget(back, in: app)
            capture(app, "outline184-\(language)-review-back")
            back.tap()
            XCTAssertTrue(app.buttons["unified-plan-review-roster"].waitForExistence(timeout: 10))
            XCTAssertTrue(app.buttons["unified-plan-review-roster"].isEnabled)
            app.terminate()
        }
    }

    private func checkTarget(_ button: XCUIElement, in app: XCUIApplication) {
        XCTAssertTrue(button.isHittable)
        XCTAssertGreaterThanOrEqual(button.frame.width, 44)
        XCTAssertGreaterThanOrEqual(button.frame.height, 44)
        XCTAssertGreaterThanOrEqual(button.frame.minX, app.frame.minX)
        XCTAssertLessThanOrEqual(button.frame.maxX, app.frame.maxX)
        // SwiftUI's merged accessibility label repeats the button bounds, not glyph bounds.
        for label in button.staticTexts.allElementsBoundByIndex where label.exists && label.frame != button.frame {
            XCTAssertGreaterThanOrEqual(label.frame.minX, button.frame.minX + 4)
            XCTAssertLessThanOrEqual(label.frame.maxX, button.frame.maxX - 4)
            XCTAssertGreaterThanOrEqual(label.frame.minY, button.frame.minY + 3)
            XCTAssertLessThanOrEqual(label.frame.maxY, button.frame.maxY - 3)
        }
    }
    private func reveal(_ element: XCUIElement, in app: XCUIApplication) {
        XCTAssertTrue(element.waitForExistence(timeout: 10))
        for _ in 0..<8 where !element.isHittable { app.swipeUp() }
        XCTAssertTrue(element.isHittable)
    }
    private func cancel(in app: XCUIApplication) {
        let cancel = app.navigationBars.buttons.matching(NSPredicate(format: "label IN %@", ["取消", "Cancel", "Abbrechen"])).firstMatch
        XCTAssertTrue(cancel.waitForExistence(timeout: 8)); cancel.tap()
    }
    private func capture(_ app: XCUIApplication, _ name: String) {
        let attachment = XCTAttachment(screenshot: app.screenshot()); attachment.name = name; attachment.lifetime = .keepAlways
        add(attachment)
    }
}
