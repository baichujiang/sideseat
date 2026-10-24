import XCTest

/// Independent profiler windows; no availability submission or invitation.
@MainActor final class PlanPerformancePhoneUITests: XCTestCase {
    private struct Account: Decodable { let role: String; let accessToken: String }
    private struct Fixture: Decodable {
        let bundle: String
        let performanceToken: String
        let accounts: [Account]
    }
    private var app: XCUIApplication!
    override func setUpWithError() throws { continueAfterFailure = false }
    override func tearDown() { app?.terminate() }

    func testIdleCoordinateAndAccessibilityProfilerWindows() throws {
        let raw = try XCTUnwrap(ProcessInfo.processInfo.environment["SIDESEAT_PLAN_CONTACTS_JSON"])
        let fixture = try JSONDecoder().decode(Fixture.self, from: Data(raw.utf8))
        let owner = try XCTUnwrap(fixture.accounts.first { $0.role == "owner" })
        app = XCUIApplication(bundleIdentifier: fixture.bundle)
        app.launchArguments = ["--ui-testing-authenticated", "--ui-testing-ephemeral-credentials",
            "--ui-testing-skip-tutorial", "--ui-testing-time-poll-live", "--ui-testing-language=zh-Hans",
            "--ui-testing-appearance=light", "--ui-testing-deep-link=/time-polls/\(fixture.performanceToken)",
            "-UIPreferredContentSizeCategoryName", "UICTContentSizeCategoryL"]
        app.launchEnvironment = ["SIDESEAT_QA_ACCESS_TOKEN": owner.accessToken]
        app.launch()
        let first = app.buttons["time-poll-cell-0"], second = app.buttons["time-poll-cell-2"]
        XCTAssertTrue(first.waitForExistence(timeout: 25))
        if app.buttons["time-poll-cancel-final"].exists { app.buttons["time-poll-cancel-final"].tap() }
        capture("performance-availability-ready")
        phase("availability-idle") { _ in Thread.sleep(forTimeInterval: 65) }

        let choose = app.buttons["unified-plan-invite-window"]
        XCTAssertTrue(choose.waitForExistence(timeout: 8)); choose.tap()
        XCTAssertTrue(first.waitForExistence(timeout: 8))
        if app.buttons["time-poll-reset-final"].exists { app.buttons["time-poll-reset-final"].tap() }
        // Resolve and reveal before sampling, then keep all per-cell AX queries outside idle windows.
        first.tap(); first.tap()
        XCTAssertTrue(first.isHittable && second.isHittable)
        let a = first.frame, b = second.frame
        XCTAssertTrue(app.windows.firstMatch.frame.insetBy(dx: -0.501, dy: -0.501).contains(a)
            && app.windows.firstMatch.frame.insetBy(dx: -0.501, dy: -0.501).contains(b))
        let origin = app.coordinate(withNormalizedOffset: .zero)
        let p = origin.withOffset(CGVector(dx: a.midX, dy: a.midY))
        let q = origin.withOffset(CGVector(dx: b.midX, dy: b.midY))
        p.press(forDuration: 0.5, thenDragTo: q)
        XCTAssertTrue(first.isSelected && second.isSelected, "Calibrate actual paint before profiling")
        p.press(forDuration: 0.5, thenDragTo: q)
        XCTAssertFalse(first.isSelected || second.isSelected, "Calibrate actual erase before profiling")
        capture("performance-final-ready")
        phase("final-idle") { _ in Thread.sleep(forTimeInterval: 65) }

        var cycles = 0
        phase("coordinate-interaction") { end in
            while Date() < end {
                p.tap(); p.tap()
                p.press(forDuration: 0.5, thenDragTo: q)
                p.press(forDuration: 0.5, thenDragTo: q)
                cycles += 1
            }
        }
        print("PLAN_PERF_COORDINATE_CYCLES \(cycles)")
        XCTAssertGreaterThan(cycles, 0)
        XCTAssertFalse(first.isSelected || second.isSelected, "Coordinate window ends with a real empty selection")
        for (actual, initial) in [(first.frame, a), (second.frame, b)] {
            for delta in [actual.midX - initial.midX, actual.midY - initial.midY,
                          actual.width - initial.width, actual.height - initial.height] {
                XCTAssertLessThan(abs(delta), 1, "Cached coordinates must stay on the actual cells")
            }
        }
        capture("performance-coordinate-result")

        var reads = 0
        phase("accessibility-query") { end in
            while Date() < end {
                for cell in [first, second] {
                    _ = cell.exists; _ = cell.frame; _ = cell.isSelected; _ = cell.label
                    reads += 4
                }
            }
        }
        print("PLAN_PERF_AX_READS \(reads)")
        XCTAssertGreaterThan(reads, 0)
        XCTAssertFalse(app.buttons["unified-plan-review-roster"].isEnabled,
                       "Paired paint/erase operations end with an empty local selection")
        capture("performance-final-empty-draft")
    }

    private func phase(_ name: String, work: (Date) -> Void) {
        print("PLAN_PERF_PHASE_BEGIN \(name) \(Date().timeIntervalSince1970)")
        work(Date().addingTimeInterval(65))
        print("PLAN_PERF_PHASE_END \(name) \(Date().timeIntervalSince1970)")
    }
    private func capture(_ name: String) {
        let attachment = XCTAttachment(screenshot: app.screenshot())
        attachment.name = name; attachment.lifetime = .keepAlways; add(attachment)
    }
}
