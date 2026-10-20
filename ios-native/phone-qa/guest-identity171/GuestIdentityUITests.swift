import XCTest

final class GuestIdentityUITests: XCTestCase {
    override func setUpWithError() throws { continueAfterFailure = false }
    @MainActor
    func testOrganizerIssuesPersonalRecoveryLinkForOldGuest() throws {
        struct Fixture: Decodable { let accessToken: String; let token: String; let responseId: String; let apiBaseURL: String?; let bundleIdentifier: String? }
        let raw = try XCTUnwrap(ProcessInfo.processInfo.environment["SIDESEAT_GUEST_IDENTITY_QA"])
        let fixture = try JSONDecoder().decode(Fixture.self, from: Data(raw.utf8))
        for language in ["zh-Hans", "de"] {
            let app = XCUIApplication(bundleIdentifier: fixture.bundleIdentifier ?? "app.sideseat.mobile.preview")
            app.launchArguments = ["--ui-testing-authenticated", "--ui-testing-ephemeral-credentials", "--ui-testing-skip-tutorial",
                "--ui-testing-time-poll-live", "--ui-testing-deep-link=/time-polls/\(fixture.token)", "--ui-testing-language=\(language)"]
                + (language == "de" ? ["--ui-testing-appearance=dark", "--ui-testing-dynamic-type-accessibility"] : [])
            app.launchEnvironment = ["SIDESEAT_QA_ACCESS_TOKEN": fixture.accessToken]
            if let base = fixture.apiBaseURL { app.launchArguments.append("--ui-testing-local-api"); app.launchEnvironment["SIDESEAT_API_BASE_URL_OVERRIDE"] = base }
            app.launch()
            let people = app.buttons["plan-people-open"]
            XCTAssertTrue(people.waitForExistence(timeout: 25)); reveal(people, in: app); people.tap()
            let recover = app.buttons["guest-recovery-\(fixture.responseId)"]
            XCTAssertTrue(recover.waitForExistence(timeout: 10)); reveal(recover, in: app); recover.tap()
            let generate = app.buttons["guest-recovery-generate"].firstMatch
            XCTAssertTrue(generate.waitForExistence(timeout: 5)); generate.tap()
            let copy = app.buttons["guest-recovery-copy"]
            XCTAssertTrue(copy.waitForExistence(timeout: 20)); reveal(copy, in: app); copy.tap()
            XCTAssertTrue(copy.label == (language == "zh-Hans" ? "已复制" : "Kopiert") || copy.label == "Copied")
            let shot = XCTAttachment(screenshot: app.screenshot()); shot.name = "guest-recovery-organizer-\(language)"; shot.lifetime = .keepAlways; add(shot)
            app.terminate()
        }
    }
    @MainActor
    private func reveal(_ element: XCUIElement, in app: XCUIApplication) {
        for _ in 0..<10 {
            if element.exists && element.isHittable && element.frame.midY > 120 && element.frame.midY < app.frame.maxY - 100 { return }
            app.swipeUp(velocity: .slow)
        }
        XCTAssertTrue(element.isHittable)
    }
}
