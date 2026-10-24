import XCTest

/// Read-only collecting plans, including long metadata and eight existing guest responses.
@MainActor final class StatusMetadataPhoneUITests: XCTestCase {
    private struct Account: Decodable { let role: String; let accessToken: String }
    private struct Fixture: Decodable {
        let bundle: String
        let statusMetadataToken: String
        let statusMetadataCrowdedToken: String
        let accounts: [Account]
    }
    private var app: XCUIApplication!
    override func setUpWithError() throws { continueAfterFailure = false }
    override func tearDown() { app?.terminate() }

    func testCollectingStatusUsesDateMetadataAcrossRolesAndTextSizes() throws {
        let raw = try XCTUnwrap(ProcessInfo.processInfo.environment["SIDESEAT_PLAN_CONTACTS_JSON"])
        let fixture = try JSONDecoder().decode(Fixture.self, from: Data(raw.utf8))
        for (language, large, role, crowded) in [("zh-Hans", false, "owner", false),
            ("zh-Hans", false, "owner", true), ("de", true, "owner", true), ("de", true, "participant", true)] {
            let account = try XCTUnwrap(fixture.accounts.first { $0.role == role })
            let tag = "\(language)-\(large ? "largest" : "normal")-\(role)-\(crowded ? "eight" : "zero")"
            let token = crowded ? fixture.statusMetadataCrowdedToken : fixture.statusMetadataToken
            launch(fixture: fixture, account: account, token: token, language: language, large: large)
            let title = app.staticTexts["time-poll-detail-title"], share = app.buttons["plan-share-open"]
            let place = app.descendants(matching: .any)["plan-detail-location"].firstMatch
            let metadata = app.descendants(matching: .any)["plan-collection-metadata"].firstMatch
            let dates = app.staticTexts["time-poll-date-range"]
            let status = app.staticTexts["plan-display-status"]
            let count = app.staticTexts["time-poll-response-count"], people = app.buttons["plan-people-open"]
            XCTAssertEqual(app.buttons.matching(identifier: "plan-share-open").count, 1)
            XCTAssertFalse(app.navigationBars.buttons["plan-share-open"].exists)
            reveal(title); reveal(share); assertTarget(share)
            XCTAssertGreaterThanOrEqual(share.frame.minX, title.frame.maxX + 3.5)
            XCTAssertFalse(title.frame.intersects(share.frame))
            capture("status-metadata-heading-\(tag)")
            reveal(place)
            XCTAssertGreaterThanOrEqual(place.frame.minY, max(title.frame.maxY, share.frame.maxY) - 0.5)
            capture("status-metadata-location-\(tag)")

            reveal(dates); reveal(status)
            XCTAssertTrue(dates.exists && status.exists)
            print("STATUS_METADATA_TEXT \(tag) \(status.debugDescription)")
            XCTAssertFalse(app.buttons["plan-display-status"].exists, "Collecting status is passive metadata, not an action")
            XCTAssertFalse(app.buttons["plan-collection-metadata"].exists)
            XCTAssertTrue(status.label.contains(language == "de" ? "Freie Zeiten sammeln" : "收集空闲"))
            XCTAssertTrue(status.label.contains("Europe/Berlin"), "The status line includes the complete time zone")
            XCTAssertFalse(dates.label.contains("Europe/Berlin"), "Dates and status/time zone have separate hierarchy")
            XCTAssertGreaterThanOrEqual(dates.frame.minY, place.frame.maxY - 0.5)
            XCTAssertGreaterThanOrEqual(status.frame.minY, dates.frame.maxY - 0.5)
            XCTAssertFalse(dates.frame.intersects(status.frame))
            for item in [dates, status] {
                XCTAssertTrue(metadata.frame.insetBy(dx: -0.501, dy: -0.501).contains(item.frame))
            }
            XCTAssertGreaterThan(metadata.frame.minY, title.frame.maxY)
            capture("status-metadata-date-status-\(tag)")

            reveal(count); reveal(people); assertTarget(people)
            XCTAssertTrue(count.label.hasPrefix(crowded ? "8 " : "0 "), count.label)
            XCTAssertGreaterThanOrEqual(people.frame.minX - count.frame.maxX, 8)
            XCTAssertFalse(count.frame.intersects(people.frame))
            XCTAssertFalse(metadata.frame.intersects(count.frame))
            XCTAssertFalse(metadata.frame.intersects(people.frame))
            print("STATUS_METADATA \(tag) title=\(title.frame) share=\(share.frame) place=\(place.frame) dates=\(dates.frame) status=\(status.frame) group=\(metadata.frame) count=\(count.frame) people=\(people.frame)")
            capture("status-metadata-people-\(tag)")
            let submit = app.buttons["time-poll-submit"]
            XCTAssertTrue(submit.exists); assertTarget(submit)
            XCTAssertFalse(submit.isEnabled, "Neither viewer has submitted or changed their own availability")
            XCTAssertFalse(app.buttons["plan-copy-link"].exists)
            if role == "owner" {
                let final = app.buttons["unified-plan-invite-window"]
                assertTarget(final); final.tap()
                XCTAssertTrue(app.buttons["time-poll-cancel-final"].waitForExistence(timeout: 8))
                reveal(dates); reveal(status)
                XCTAssertTrue(status.label.contains("Europe/Berlin"))
                capture("status-metadata-final-selection-\(tag)")
                let back = app.buttons["time-poll-cancel-final"]
                assertTarget(back); back.tap()
                XCTAssertTrue(submit.waitForExistence(timeout: 8)); XCTAssertFalse(submit.isEnabled)
            } else { XCTAssertFalse(app.buttons["unified-plan-invite-window"].exists) }
            app.terminate()
        }
    }

    private func launch(fixture: Fixture, account: Account, token: String, language: String, large: Bool) {
        app?.terminate(); app = XCUIApplication(bundleIdentifier: fixture.bundle)
        app.launchArguments = ["--ui-testing-authenticated", "--ui-testing-ephemeral-credentials",
            "--ui-testing-skip-tutorial", "--ui-testing-time-poll-live", "--ui-testing-language=\(language)",
            "--ui-testing-appearance=\(large ? "dark" : "light")", "--ui-testing-deep-link=/time-polls/\(token)",
            "-UIPreferredContentSizeCategoryName", large ? "UICTContentSizeCategoryAccessibilityXXXL" : "UICTContentSizeCategoryL"]
        if large { app.launchArguments.append("--ui-testing-dynamic-type-accessibility") }
        app.launchEnvironment = ["SIDESEAT_QA_ACCESS_TOKEN": account.accessToken]
        app.launch()
        XCTAssertTrue(app.staticTexts["time-poll-detail-title"].waitForExistence(timeout: 25))
    }

    private func viewport() -> CGRect {
        let bounds = app.scrollViews["time-poll-detail-scroll"].frame.intersection(app.windows.firstMatch.frame)
        let top = max(bounds.minY, app.navigationBars.firstMatch.frame.maxY + 4)
        var bottom = bounds.maxY - 8
        for id in ["time-poll-save-state", "time-poll-saved", "time-poll-submit", "unified-plan-invite-window",
                   "time-poll-final-summary", "unified-plan-review-roster", "plan-participant-next-step"] {
            let item = app.descendants(matching: .any)[id].firstMatch
            if item.exists && item.isHittable { bottom = min(bottom, item.frame.minY - 8) }
        }
        return CGRect(x: bounds.minX, y: top, width: bounds.width, height: max(0, bottom - top))
    }

    private func reveal(_ target: XCUIElement) {
        XCTAssertTrue(target.waitForExistence(timeout: 10))
        for _ in 0..<12 {
            let visible = viewport()
            if target.isHittable && visible.insetBy(dx: -0.501, dy: -0.501).contains(target.frame) { return }
            let above = target.frame.minY < visible.minY
            let overflow = above ? visible.minY - target.frame.minY : max(0, target.frame.maxY - visible.maxY)
            let distance = min(max(overflow + 12, 24), visible.height * 0.4)
            let start = CGPoint(x: visible.minX + 12, y: visible.midY)
            let end = CGPoint(x: start.x, y: start.y + (above ? distance : -distance))
            XCTAssertTrue(visible.contains(start) && visible.contains(end))
            let origin = app.coordinate(withNormalizedOffset: .zero)
            origin.withOffset(CGVector(dx: start.x, dy: start.y)).press(forDuration: 0.05,
                thenDragTo: origin.withOffset(CGVector(dx: end.x, dy: end.y)),
                withVelocity: .slow, thenHoldForDuration: 0.2)
        }
        print("STATUS_METADATA_REVEAL_FAILED id=\(target.identifier) frame=\(target.frame) viewport=\(viewport())")
        capture("status-metadata-reveal-failed")
        XCTFail("The complete metadata or control must be visible above the fixed footer")
    }

    private func assertTarget(_ target: XCUIElement) {
        XCTAssertTrue(target.exists && target.isHittable)
        XCTAssertGreaterThanOrEqual(target.frame.width + 0.001, 44)
        XCTAssertGreaterThanOrEqual(target.frame.height + 0.001, 44)
        XCTAssertTrue(app.windows.firstMatch.frame.insetBy(dx: -0.501, dy: -0.501).contains(target.frame))
    }

    private func capture(_ name: String) {
        let attachment = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
        attachment.name = name; attachment.lifetime = .keepAlways; add(attachment)
    }
}
