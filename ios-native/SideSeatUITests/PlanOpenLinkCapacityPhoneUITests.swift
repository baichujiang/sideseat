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
        assertStatus("你未参加本次计划")
        capture("full-reserved-new-viewer")
        XCTAssertFalse(app.buttons["unified-plan-accept"].exists,
                       "Pending selected invitees reserve seats; a new viewer must not be promised a full seat")
        let status = app.staticTexts["unified-plan-calendar-status"]
        XCTAssertTrue(status.waitForExistence(timeout: 10))

        open(CapacityCase(kind: "reserved", token: full.token, viewerRole: "peer1"), fixture: fixture)
        XCTAssertTrue(app.buttons["unified-plan-accept"].waitForExistence(timeout: 20))
        assertStatus("待你确认"); capture("full-selected-invitee-keeps-confirmation")
        open(CapacityCase(kind: "owner", token: full.token, viewerRole: "owner"), fixture: fixture)
        XCTAssertTrue(app.buttons["unified-plan-publish"].waitForExistence(timeout: 20))
        assertStatus("待你正式发出"); capture("owner-can-publish-with-reserved-pending-place")

        let freed = try XCTUnwrap(fixture.capacityCases.first { $0.kind == "freed" })
        open(freed, fixture: fixture)
        // This same disposable fixture was accepted in the earlier227 case.
        // Release it by the actual UI before verifying the228 reply transition.
        if app.staticTexts["unified-plan-accepted-status"].exists {
            app.buttons["unified-plan-decline"].tap()
        }
        let accept = app.buttons["unified-plan-accept"]
        XCTAssertTrue(accept.waitForExistence(timeout: 20))
        XCTAssertTrue(accept.isEnabled && accept.isHittable)
        assertStatus("待你确认")
        capture("declined-seat-released-new-viewer")
        accept.tap()
        XCTAssertTrue(app.staticTexts["unified-plan-accepted-status"].waitForExistence(timeout: 20))
        assertStatus("待发起人正式发出")
        capture("released-seat-accepted")
        open(CapacityCase(kind: "refilled", token: freed.token, viewerRole: "peer1"), fixture: fixture, maximum: true)
        XCTAssertFalse(app.buttons["unified-plan-accept"].exists)
        assertStatus("你未参加本次计划")
        capture("declined-viewer-cannot-reclaim-refilled-seat-maximum")
    }

    private func assertStatus(_ expected: String) {
        let status = app.descendants(matching: .any)["unified-plan-phase"].firstMatch
        XCTAssertTrue(status.waitForExistence(timeout: 15))
        XCTAssertEqual(XCTWaiter.wait(for: [XCTNSPredicateExpectation(predicate: NSPredicate(format: "label CONTAINS %@", expected), object: status)], timeout: 20), .completed)
        XCTAssertTrue(status.isHittable)
    }

    private func open(_ item: CapacityCase, fixture: Fixture, maximum: Bool = false) {
        app?.terminate()
        app = XCUIApplication(bundleIdentifier: fixture.bundle)
        let account = fixture.accounts.first { $0.role == item.viewerRole }!
        app.launchArguments = ["--ui-testing-authenticated", "--ui-testing-ephemeral-credentials",
            "--ui-testing-skip-tutorial", "--ui-testing-time-poll-live", "--ui-testing-language=zh-Hans",
            "--ui-testing-appearance=light", "--ui-testing-deep-link=/time-polls/\(item.token)"]
        if maximum {
            app.launchArguments += ["--ui-testing-dynamic-type-accessibility", "-UIPreferredContentSizeCategoryName", "UICTContentSizeCategoryAccessibilityXXXL"]
        }
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
