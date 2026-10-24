import XCTest

/// Fresh disposable polls keep each first submission independent. No invitations are sent.
@MainActor final class SubmitSharePhoneUITests: XCTestCase {
    private struct Account: Decodable { let role: String; let accessToken: String }
    private struct Fixture: Decodable {
        let bundle: String
        let submitShareTokens: [String]
        let submitShareFailureToken: String
        let accounts: [Account]
    }
    private var app: XCUIApplication!
    override func setUpWithError() throws { continueAfterFailure = false }
    override func tearDown() { app?.terminate() }

    func testFirstOwnerSubmissionSharesButEditsAndParticipantSubmissionsDoNot() throws {
        let raw = try XCTUnwrap(ProcessInfo.processInfo.environment["SIDESEAT_PLAN_CONTACTS_JSON"])
        let fixture = try JSONDecoder().decode(Fixture.self, from: Data(raw.utf8))
        XCTAssertEqual(fixture.submitShareTokens.count, 2, "Supply independent normal and maximum-font polls")
        let owner = try XCTUnwrap(fixture.accounts.first { $0.role == "owner" })
        let participant = try XCTUnwrap(fixture.accounts.first { $0.role == "participant" })
        for (index, variant) in [("zh-Hans", false), ("de", true)].enumerated() {
            let (language, large) = variant
            let tag = "\(language)-\(large ? "largest" : "normal")"
            let token = fixture.submitShareTokens[index]
            launch(fixture: fixture, account: owner, token: token, language: language, large: large)
            let first = app.buttons["time-poll-cell-0"], second = app.buttons["time-poll-cell-2"]
            let submit = app.buttons["time-poll-submit"]
            XCTAssertTrue(submit.waitForExistence(timeout: 10)); assertTarget(submit)
            XCTAssertEqual(submit.label, large ? "Senden & teilen" : "提交并分享")
            XCTAssertFalse(submit.isEnabled, "An unchanged empty draft cannot submit or open sharing")
            assertNoShare()
            capture("submit-share-empty-\(tag)")

            // The title's independent share action remains available before filling anything.
            let share = app.buttons["plan-share-open"]
            revealDetail(share); assertTarget(share); share.tap()
            verifyShareAndClose(language: language, tag: "early-\(tag)")
            XCTAssertFalse(submit.isEnabled)
            revealDetail(first); assertTarget(first); XCTAssertFalse(first.isSelected); first.tap()
            XCTAssertTrue(first.isSelected); XCTAssertTrue(submit.isEnabled); assertNoShare()
            capture("submit-share-private-draft-\(tag)")
            assertTarget(submit); submit.tap()
            XCTAssertTrue(app.buttons["plan-copy-link"].waitForExistence(timeout: 20),
                          "Only a successful first owner submission opens the share sheet")
            verifyShareAndClose(language: language, tag: "submitted-\(tag)")
            XCTAssertTrue(app.staticTexts["time-poll-saved"].waitForExistence(timeout: 10))
            revealDetail(first); XCTAssertTrue(first.isSelected)
            XCTAssertFalse(submit.exists, "The saved unchanged selection needs no second submission")

            revealDetail(second); assertTarget(second); second.tap()
            XCTAssertTrue(first.isSelected && second.isSelected)
            XCTAssertTrue(submit.waitForExistence(timeout: 10)); assertTarget(submit)
            XCTAssertEqual(submit.label, large ? "Änderungen speichern" : "保存修改")
            XCTAssertTrue(submit.isEnabled); submit.tap()
            XCTAssertTrue(app.staticTexts["time-poll-saved"].waitForExistence(timeout: 20))
            assertNoShare(); capture("submit-share-owner-edit-saved-\(tag)")

            launch(fixture: fixture, account: participant, token: token, language: language, large: large)
            XCTAssertTrue(submit.waitForExistence(timeout: 10)); assertTarget(submit)
            XCTAssertEqual(submit.label, large ? "Verfügbarkeit senden" : "提交我的空闲")
            XCTAssertFalse(submit.isEnabled); assertNoShare()
            revealDetail(first); assertTarget(first); XCTAssertFalse(first.isSelected); first.tap()
            XCTAssertTrue(first.isSelected); XCTAssertTrue(submit.isEnabled)
            assertTarget(submit); submit.tap()
            XCTAssertTrue(app.staticTexts["time-poll-saved"].waitForExistence(timeout: 20))
            assertNoShare(); capture("submit-share-participant-saved-\(tag)")
            XCTAssertTrue(app.staticTexts["plan-participant-next-step"].exists)
            app.terminate()
        }
    }

    func testFailedFirstSubmissionKeepsDraftAndNeverOpensShare() throws {
        let raw = try XCTUnwrap(ProcessInfo.processInfo.environment["SIDESEAT_PLAN_CONTACTS_JSON"])
        let fixture = try JSONDecoder().decode(Fixture.self, from: Data(raw.utf8))
        let owner = try XCTUnwrap(fixture.accounts.first { $0.role == "owner" })
        launch(fixture: fixture, account: owner, token: fixture.submitShareFailureToken, language: "en", large: false)
        let first = app.buttons["time-poll-cell-0"], submit = app.buttons["time-poll-submit"]
        revealDetail(first); assertTarget(first); first.tap()
        XCTAssertTrue(first.isSelected); XCTAssertTrue(submit.isEnabled)
        XCTAssertEqual(submit.label, "Submit & share"); assertNoShare()
        print("SUBMIT_SHARE_FAILURE ready-delete")
        // The Mac deletes only this disposable poll. The normal refresh exposes its real 404.
        let retry = app.buttons["Retry"]
        XCTAssertTrue(retry.waitForExistence(timeout: 25)); XCTAssertTrue(retry.isHittable)
        capture("submit-share-real-delete-observed")
        assertTarget(submit); submit.tap()
        let state = app.staticTexts["time-poll-save-state"]
        let failed = NSPredicate(format: "label == %@", "Couldn't submit")
        XCTAssertEqual(XCTWaiter.wait(for: [XCTNSPredicateExpectation(predicate: failed, object: state)], timeout: 20), .completed)
        XCTAssertTrue(first.isSelected)
        XCTAssertTrue(submit.isEnabled && submit.isHittable)
        XCTAssertEqual(app.staticTexts["time-poll-selection-summary"].label, "Your choices are kept. Please retry.")
        XCTAssertFalse(app.staticTexts["time-poll-saved"].exists); assertNoShare()
        capture("submit-share-real-failure-draft-kept")
        XCTAssertTrue(retry.isHittable); retry.tap()
        XCTAssertEqual(XCTWaiter.wait(for: [XCTNSPredicateExpectation(predicate: failed, object: state)], timeout: 20), .completed)
        XCTAssertTrue(first.isSelected && submit.isEnabled)
        XCTAssertFalse(app.staticTexts["time-poll-saved"].exists); assertNoShare()
        capture("submit-share-real-failure-retry-keeps-draft")
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
        XCTAssertTrue(app.buttons["time-poll-cell-0"].waitForExistence(timeout: 25))
    }

    private func assertNoShare() {
        XCTAssertFalse(app.buttons["plan-copy-link"].exists)
        XCTAssertFalse(app.buttons["plan-invite-contacts"].exists)
        XCTAssertFalse(app.descendants(matching: .any)["plan-share-summary"].firstMatch.exists)
    }

    private func verifyShareAndClose(language: String, tag: String) {
        let copy = app.buttons["plan-copy-link"]
        XCTAssertTrue(copy.waitForExistence(timeout: 10))
        let summary = app.descendants(matching: .any)["plan-share-summary"].firstMatch
        XCTAssertTrue(summary.exists)
        let navigation = app.navigationBars[language == "de" ? "Plan teilen" : "分享计划"]
        let scroll = app.scrollViews.containing(.any, identifier: "plan-share-summary").firstMatch
        XCTAssertTrue(navigation.exists && scroll.exists)
        capture("submit-share-sheet-top-\(tag)")
        for action in [app.buttons["plan-invite-contacts"], app.buttons["plan-share-primary"], copy] {
            XCTAssertTrue(action.exists)
            for _ in 0..<8 {
                let bounds = scroll.frame.intersection(app.windows.firstMatch.frame)
                let visible = CGRect(x: bounds.minX, y: max(bounds.minY, navigation.frame.maxY + 4),
                    width: bounds.width, height: max(0, bounds.maxY - 12 - max(bounds.minY, navigation.frame.maxY + 4)))
                if action.isHittable && visible.insetBy(dx: -0.501, dy: -0.501).contains(action.frame) { break }
                if action.frame.minY < visible.minY { scroll.swipeDown(velocity: .slow) }
                else { scroll.swipeUp(velocity: .slow) }
            }
            assertTarget(action)
        }
        capture("submit-share-sheet-actions-\(tag)")
        let done = navigation.buttons[language == "de" ? "Fertig" : "完成"]
        XCTAssertTrue(done.isHittable); done.tap()
        XCTAssertTrue(copy.waitForNonExistence(timeout: 8)); assertNoShare()
    }

    private func revealDetail(_ target: XCUIElement) {
        XCTAssertTrue(target.waitForExistence(timeout: 10))
        let scroll = app.scrollViews["time-poll-detail-scroll"]
        for _ in 0..<12 {
            let visible = detailViewport()
            if target.isHittable && visible.insetBy(dx: -0.501, dy: -0.501).contains(target.frame) { return }
            let above = target.frame.minY < visible.minY
            let overflow = above ? visible.minY - target.frame.minY : max(0, target.frame.maxY - visible.maxY)
            let distance = min(max(overflow + 12, 24), visible.height * 0.4)
            let start = CGPoint(x: visible.minX + 20, y: visible.midY)
            let end = CGPoint(x: start.x, y: start.y + (above ? distance : -distance))
            XCTAssertTrue(visible.contains(start) && visible.contains(end))
            let origin = app.coordinate(withNormalizedOffset: .zero)
            origin.withOffset(CGVector(dx: start.x, dy: start.y)).press(forDuration: 0.05,
                thenDragTo: origin.withOffset(CGVector(dx: end.x, dy: end.y)),
                withVelocity: .slow, thenHoldForDuration: 0.2)
        }
        print("SUBMIT_SHARE_REVEAL_FAILED target=\(target.frame) viewport=\(detailViewport()) scroll=\(scroll.frame)")
        capture("submit-share-reveal-failed")
        XCTFail("The entire timetable or header target must be visible above the fixed controls")
    }

    private func detailViewport() -> CGRect {
        let bounds = app.scrollViews["time-poll-detail-scroll"].frame.intersection(app.windows.firstMatch.frame)
        let top = max(bounds.minY, app.navigationBars.firstMatch.frame.maxY + 4)
        var bottom = bounds.maxY - 8
        for id in ["time-poll-save-state", "time-poll-saved", "time-poll-submit", "unified-plan-invite-window", "plan-participant-next-step"] {
            let item = app.descendants(matching: .any)[id].firstMatch
            if item.exists && item.isHittable { bottom = min(bottom, item.frame.minY - 8) }
        }
        return CGRect(x: bounds.minX, y: top, width: bounds.width, height: max(0, bottom - top))
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
