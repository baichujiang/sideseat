import XCTest

/// A plan created through COLLECT and shared with an open invitation count.
/// The Mac owns only disposable setup/checks; all actions below use the real App.
@MainActor final class PlanOpenLinkCapacityPhoneUITests: XCTestCase {
    private struct Account: Decodable { let role: String; let accessToken: String }
    private struct CapacityCase: Decodable { let kind: String; let token: String; let viewerRole: String }
    private struct Fixture: Decodable {
        let bundle: String
        let accounts: [Account]
        let capacityCases: [CapacityCase]
    }
    private var app: XCUIApplication!

    override func setUpWithError() throws { continueAfterFailure = false }
    override func tearDownWithError() throws { app?.terminate() }

    func testReservedSeatsBlockNewJoinButReleasedSeatCanBeAccepted() throws {
        let raw = try XCTUnwrap(ProcessInfo.processInfo.environment["SIDESEAT_PLAN_SIX_JSON"])
        let data = raw.hasPrefix("/") ? try Data(contentsOf: URL(fileURLWithPath: raw)) : Data(raw.utf8)
        let fixture = try JSONDecoder().decode(Fixture.self, from: data)
        let full = try XCTUnwrap(fixture.capacityCases.first { $0.kind == "full" })
        open(full, fixture: fixture)
        capture("full-reserved-new-viewer")
        XCTAssertFalse(app.buttons["unified-plan-accept"].exists,
                       "Pending selected invitees reserve seats; a new viewer must not be promised a full seat")
        let status = app.staticTexts["unified-plan-calendar-status"]
        XCTAssertTrue(status.waitForExistence(timeout: 10))

        let freed = try XCTUnwrap(fixture.capacityCases.first { $0.kind == "freed" })
        open(freed, fixture: fixture)
        let accept = app.buttons["unified-plan-accept"]
        XCTAssertTrue(accept.waitForExistence(timeout: 20))
        XCTAssertTrue(accept.isEnabled && accept.isHittable)
        capture("declined-seat-released-new-viewer")
        accept.tap()
        XCTAssertTrue(app.staticTexts["unified-plan-accepted-status"].waitForExistence(timeout: 20))
        capture("released-seat-accepted")
    }

    private func open(_ item: CapacityCase, fixture: Fixture) {
        app?.terminate()
        app = XCUIApplication(bundleIdentifier: fixture.bundle)
        let account = fixture.accounts.first { $0.role == item.viewerRole }!
        app.launchArguments = ["--ui-testing-authenticated", "--ui-testing-ephemeral-credentials",
            "--ui-testing-skip-tutorial", "--ui-testing-time-poll-live", "--ui-testing-language=zh-Hans",
            "--ui-testing-appearance=light", "--ui-testing-deep-link=/time-polls/\(item.token)"]
        app.launchEnvironment = ["SIDESEAT_QA_ACCESS_TOKEN": account.accessToken]
        app.launch()
        XCTAssertTrue(app.staticTexts["unified-plan-confirmation-count"].waitForExistence(timeout: 30))
    }

    private func capture(_ name: String) {
        let attachment = XCTAttachment(screenshot: app.screenshot())
        attachment.name = "plan-six-capacity-" + name
        attachment.lifetime = .keepAlways
        add(attachment)
    }
}
