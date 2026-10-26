import XCTest

/// Real production signup/readiness only, with this run's private QA accounts.
@MainActor final class FiveRootTogetherPublicPhoneUITests: XCTestCase {
    private struct Account: Decodable {
        let role: String
        let id: String
        let identifier: String
        let password: String
    }
    private struct ProfileFacts: Decodable {
        let id: String
        let verifiedStudent: Bool
        let ready: Bool
        let canUseApp: Bool
    }
    private struct Fixture: Decodable {
        let baseURL: String
        let runID: String
        let accounts: [Account]
        let phoneProfileFacts: [String: ProfileFacts]
    }
    private var app: XCUIApplication!
    override func setUpWithError() throws { continueAfterFailure = false }
    override func tearDown() { app?.terminate() }

    func testUnverifiedSetupEntriesCancelAndReturnFromMessages() async throws {
        let raw = try XCTUnwrap(ProcessInfo.processInfo.environment["SIDESEAT_FIVE_ROOT_FIXTURE_JSON"])
        let fixture = try JSONDecoder().decode(Fixture.self, from: Data(raw.utf8))
        XCTAssertEqual(fixture.baseURL, "https://api.sideseat.de")
        let owner = try XCTUnwrap(fixture.accounts.first { $0.role == "owner" })
        XCTAssertEqual(owner.identifier, "e2e_roots_owner_\(fixture.runID)")
        // The independent Mac oracle supplies these facts. The UI Runner does not
        // need its own device network permission; the actual App uses its real API.
        let facts = try XCTUnwrap(fixture.phoneProfileFacts["owner"])
        XCTAssertEqual(facts.id, owner.id)
        XCTAssertFalse(facts.verifiedStudent)
        XCTAssertFalse(facts.ready)
        XCTAssertTrue(facts.canUseApp)

        app = XCUIApplication(bundleIdentifier: "app.sideseat.mobile.preview")
        app.launchArguments = ["--ui-testing-signed-out", "--ui-testing-ephemeral-credentials",
            "--ui-testing-skip-tutorial", "--ui-testing-language=zh-Hans", "--ui-testing-appearance=light"]
        app.launch()
        let user = app.textFields["login-identifier"]
        XCTAssertTrue(user.waitForExistence(timeout: 12)); user.tap(); user.typeText(owner.identifier)
        let password = app.secureTextFields["login-password"]
        XCTAssertTrue(password.exists); password.tap(); password.typeText(owner.password)
        app.buttons["login-submit"].tap()
        XCTAssertTrue(app.tabBars.firstMatch.waitForExistence(timeout: 25))
        app.tabBars.buttons.element(boundBy: 0).tap()
        assertGate()
        capture("unverified-real-production-setup")
        for (label, id, close) in [("学校", "required-setup-campus", "取消"),
                                   ("用于匹配的语言", "required-setup-languages", "取消"),
                                   ("学校认证", "student-verification-sheet", "完成")] {
            let row = app.buttons.matching(NSPredicate(format: "label CONTAINS %@", label))
                .allElementsBoundByIndex.first { label != "学校" || !$0.label.contains("认证") }
            let target = try XCTUnwrap(row, "The explicit setup row must remain available.")
            reveal(target); target.tap()
            XCTAssertTrue(element(id).waitForExistence(timeout: 12))
            if id == "student-verification-sheet" {
                XCTAssertTrue(app.staticTexts["完成学校和语言资料，并通过学校认证后，就能使用「同行」推荐。"].exists)
            }
            capture("unverified-setup-entry-\(id)")
            let dismiss = app.navigationBars.buttons.matching(NSPredicate(format: "label == %@", close)).firstMatch
            XCTAssertTrue(dismiss.waitForExistence(timeout: 8)); dismiss.tap()
            XCTAssertTrue(element(id).waitForNonExistence(timeout: 8))
            assertGate()
        }
        let messages = app.buttons["campus-setup-messages"]
        reveal(messages); messages.tap()
        XCTAssertTrue(app.tabBars.buttons.element(boundBy: 3).isSelected)
        app.tabBars.buttons.element(boundBy: 0).tap()
        assertGate(); capture("unverified-return-from-messages-keeps-setup")
        print("FIVE_ROOT_TOGETHER_PUBLIC unverified explicit-setup three-entries-cancel messages-return profile-unchanged")
    }

    private func element(_ id: String) -> XCUIElement { app.descendants(matching: .any)[id].firstMatch }
    private func assertGate() {
        XCTAssertTrue(element("required-setup").waitForExistence(timeout: 12))
        XCTAssertFalse(element("together-home").exists)
        XCTAssertFalse(app.buttons["required-setup-enter"].exists,
                       "Start is shown only after all campus requirements are met.")
        XCTAssertTrue(app.buttons["campus-setup-messages"].exists)
        XCTAssertFalse(element("required-setup-unavailable").exists,
                       "A network failure is not evidence of a readiness gate.")
    }
    private func reveal(_ target: XCUIElement) {
        for _ in 0..<8 where !target.isHittable { app.scrollViews.firstMatch.swipeUp() }
        XCTAssertTrue(target.isHittable)
    }
    private func capture(_ name: String) {
        // Let transient system notification banners expire before recording the App.
        Thread.sleep(forTimeInterval: 6)
        let screenshot = XCTAttachment(screenshot: app.screenshot())
        screenshot.name = name; screenshot.lifetime = .keepAlways; add(screenshot)
    }
}
