import XCTest

/// Independent owned COLLECT fixture: two submitted identities and one unfilled shared friend.
/// Only the final German iteration sends; it never submits the organizer's private edits.
@MainActor final class PlanDirectInvitationPhoneUITests: XCTestCase {
    private struct Fixture: Decodable {
        let bundle: String; let token: String; let title: String; let ownerAccessToken: String
        let ownerDisplayName: String; let respondentName: String; let extraName: String; let extraParticipantID: String
        let zeroToken: String?; let zeroTitle: String?
        let activityToken: String?; let activityTitle: String?; let activityID: String?
    }
    private var app: XCUIApplication!
    override func setUpWithError() throws { continueAfterFailure = false }
    override func tearDown() { app?.terminate() }

    func testDirectInvitationDraftEditorAndLargestText() throws {
        let fixture = try loadFixture()
        for (language, large) in [("zh-Hans", false), ("de", true)] {
            let tag = "\(language)-\(large ? "largest-dark" : "normal-light")"
            launch(fixture, language: language, large: large)
            if !app.buttons["unified-plan-send-invitations"].exists {
                let privateCell = app.buttons["time-poll-cell-4"]
                reveal(privateCell, in: detailScroll)
                if !privateCell.isSelected { tap(privateCell) }
                XCTAssertTrue(privateCell.isSelected)
                XCTAssertTrue(app.buttons["time-poll-submit"].isEnabled)
                tap(app.buttons["unified-plan-invite-window"])
            }
            selectFinalHourIfNeeded()
            assertDirectDock(expectedFriends: large ? 2 : 1)
            capture("direct-invitation-dock-\(tag)")

            openEditor()
            let editor = app.descendants(matching: .any)["unified-plan-invitation-editor"].firstMatch
            for name in [fixture.ownerDisplayName, fixture.respondentName] {
                let respondent = editor.staticTexts[name].firstMatch
                reveal(respondent, in: formScroll); assertReachable(respondent)
            }
            let extra = app.buttons["unified-plan-extra-person-\(fixture.extraParticipantID)"]
            reveal(extra, in: formScroll); assertTarget(extra)
            assertSelection(extra, selected: large, language: language)
            if large {
                // Automatic respondents stay in the list while only the optional friend toggles.
                tap(extra); assertSelection(extra, selected: false, language: language)
                closeEditor(); assertDirectDock(expectedFriends: 1); openEditor()
                reveal(extra, in: formScroll)
            }
            tap(extra); assertSelection(extra, selected: true, language: language)
            capture("direct-invitation-extra-selected-\(tag)")
            closeEditor(); assertDirectDock(expectedFriends: 2)
            XCTAssertFalse(app.buttons["unified-plan-review-roster"].exists)

            // Final time and extra-person edits persist without sending or opening a review page.
            launch(fixture, language: language, large: large)
            assertDirectDock(expectedFriends: 2)
            for id in [0, 2] { XCTAssertTrue(app.buttons["time-poll-cell-\(id)"].isSelected) }
            XCTAssertFalse(app.descendants(matching: .any)["unified-plan-invitation-editor"].firstMatch.exists)
            openEditor()
            let restoredExtra = app.buttons["unified-plan-extra-person-\(fixture.extraParticipantID)"]
            reveal(restoredExtra, in: formScroll)
            assertSelection(restoredExtra, selected: true, language: language)
            capture("direct-invitation-editor-restored-\(tag)")
            closeEditor()

            let back = app.buttons["time-poll-cancel-final"]
            assertReachable(back); tap(back)
            let privateCell = app.buttons["time-poll-cell-4"]
            reveal(privateCell, in: detailScroll); XCTAssertTrue(privateCell.isSelected)
            XCTAssertTrue(app.buttons["time-poll-submit"].isEnabled)
            let draftState = app.staticTexts["time-poll-save-state"]
            XCTAssertTrue(draftState.exists)
            XCTAssertTrue(["未提交", "已恢复草稿 · 未提交", "Nicht gesendet", "Entwurf wiederhergestellt · nicht gesendet"].contains(draftState.label))
            capture("direct-invitation-keeps-private-availability-\(tag)")
            tap(app.buttons["unified-plan-invite-window"])
            assertDirectDock(expectedFriends: 2)
            if large {
                tap(app.buttons["unified-plan-send-invitations"])
                XCTAssertTrue(app.buttons["unified-plan-publish"].waitForExistence(timeout: 30))
                XCTAssertFalse(app.buttons["unified-plan-send-invitations"].exists)
                let rows = app.descendants(matching: .any).matching(NSPredicate(format: "identifier BEGINSWITH 'unified-plan-person-'"))
                XCTAssertEqual(rows.count, 3, "Owner, empty-response friend, and explicit extra are invited.")
                for name in [fixture.ownerDisplayName, fixture.respondentName, fixture.extraName] {
                    XCTAssertEqual(rows.matching(NSPredicate(format: "label CONTAINS %@", name)).count, 1)
                }
                capture("direct-invitation-three-people-sent-\(tag)")
            }
            app.terminate()
        }
    }

    func testZeroResponsesCreateInvitationLinkDirectly() throws {
        let fixture = try loadFixture()
        launch(fixture, language: "zh-Hans", large: false,
               token: try XCTUnwrap(fixture.zeroToken), title: try XCTUnwrap(fixture.zeroTitle))
        XCTAssertTrue(app.buttons["plan-people-open"].label.contains("0 人已填写"))
        let send = app.buttons["unified-plan-send-invitations"]
        if !send.exists { tap(app.buttons["unified-plan-invite-window"]) }
        // A failed earlier attempt may have restored this case's selected hour.
        for id in [0, 2] {
            let cell = app.buttons["time-poll-cell-\(id)"]
            reveal(cell, in: app.scrollViews["time-poll-final-scroll"])
            if cell.isSelected { tap(cell) }
        }
        XCTAssertTrue(send.waitForExistence(timeout: 10)); XCTAssertFalse(send.isEnabled)
        selectFinalHourIfNeeded()
        XCTAssertEqual(send.label, "生成邀请链接"); assertTarget(send); XCTAssertTrue(send.isEnabled)
        XCTAssertFalse(app.buttons["unified-plan-review-roster"].exists)
        XCTAssertFalse(app.descendants(matching: .any)["unified-plan-invitation-editor"].firstMatch.exists)
        capture("direct-invitation-zero-response-link-before-sending")
        tap(send)
        XCTAssertTrue(app.buttons["unified-plan-publish"].waitForExistence(timeout: 30))
        XCTAssertEqual(app.descendants(matching: .any).matching(NSPredicate(format: "identifier BEGINSWITH 'unified-plan-person-'" )).count, 1)
        capture("direct-invitation-zero-response-link-sent")
    }

    func testActivityChoiceStaysInlineBeforeDirectSending() throws {
        let fixture = try loadFixture()
        launch(fixture, language: "zh-Hans", large: false,
               token: try XCTUnwrap(fixture.activityToken), title: try XCTUnwrap(fixture.activityTitle))
        let send = app.buttons["unified-plan-send-invitations"]
        if !send.exists { tap(app.buttons["unified-plan-invite-window"]) }
        // Start pans in the noninteractive legend so the outer page, not the inner grid, moves.
        let legend = app.descendants(matching: .any)["time-poll-final-legend"].firstMatch
        XCTAssertTrue(legend.waitForExistence(timeout: 10))
        for _ in 0..<10 {
            let top = app.navigationBars.firstMatch.frame.maxY
            let distance = legend.frame.minY - top - 16
            if distance <= 20 { break }
            let startY = min(legend.frame.midY, finalDockTop - 24)
            let origin = app.coordinate(withNormalizedOffset: .zero)
            origin.withOffset(CGVector(dx: app.frame.minX + 8, dy: startY)).press(forDuration: 0.05,
                thenDragTo: origin.withOffset(CGVector(dx: app.frame.minX + 8, dy: max(top + 8, startY - min(160, distance)))),
                withVelocity: .slow, thenHoldForDuration: 0.1)
        }
        let inner = app.scrollViews["time-poll-final-scroll"]
        XCTAssertGreaterThanOrEqual(inner.frame.minY, app.navigationBars.firstMatch.frame.maxY)
        XCTAssertLessThanOrEqual(inner.frame.maxY, finalDockTop - 8)
        selectFinalHourIfNeeded()
        XCTAssertFalse(send.isEnabled)
        XCTAssertTrue(app.descendants(matching: .any)["unified-plan-activity-required"].firstMatch.exists)
        let activity = app.buttons["unified-plan-activity-\(try XCTUnwrap(fixture.activityID))"]
        for _ in 0..<10 where activity.frame.minY < app.navigationBars.firstMatch.frame.maxY || !activity.isHittable {
            let top = app.navigationBars.firstMatch.frame.maxY
            let origin = app.coordinate(withNormalizedOffset: .zero)
            origin.withOffset(CGVector(dx: app.frame.minX + 8, dy: top + 24)).press(forDuration: 0.05,
                thenDragTo: origin.withOffset(CGVector(dx: app.frame.minX + 8, dy: min(finalDockTop - 24, top + 184))),
                withVelocity: .slow, thenHoldForDuration: 0.1)
        }
        reveal(activity, in: detailScroll); assertTarget(activity); tap(activity)
        assertSelection(activity, selected: true, language: "zh-Hans")
        XCTAssertTrue(send.isEnabled)
        XCTAssertFalse(app.buttons["unified-plan-review-roster"].exists)
        XCTAssertFalse(app.descendants(matching: .any)["unified-plan-invitation-editor"].firstMatch.exists)
        capture("direct-invitation-activity-chosen-on-timetable")
        tap(send)
        XCTAssertTrue(app.buttons["unified-plan-publish"].waitForExistence(timeout: 30))
        capture("direct-invitation-activity-sent-without-review-page")
    }

    /// Run before the independent activity case sends its invitation.
    func testInvitationEditorLargestContactAction() throws {
        let fixture = try loadFixture()
        launch(fixture, language: "de", large: true,
               token: try XCTUnwrap(fixture.activityToken), title: try XCTUnwrap(fixture.activityTitle))
        openEditor()
        let contact = app.buttons["unified-plan-add-contacts"]
        reveal(contact, in: formScroll); assertTarget(contact)
        XCTAssertEqual(contact.label, "Plankarte senden")
        capture("direct-invitation-largest-contact-action-de-dark")
        closeEditor()
        XCTAssertFalse(app.buttons["unified-plan-review-roster"].exists)
    }

    private func loadFixture() throws -> Fixture {
        XCTAssertNil(ProcessInfo.processInfo.environment["SIMULATOR_UDID"], "Use the selected physical iPhone.")
        let raw = try XCTUnwrap(ProcessInfo.processInfo.environment["SIDESEAT_PLAN_DIRECT_INVITE_LAYOUT_JSON"])
        let data = raw.hasPrefix("{") ? Data(raw.utf8) : try Data(contentsOf: URL(fileURLWithPath: raw))
        return try JSONDecoder().decode(Fixture.self, from: data)
    }

    private func launch(_ fixture: Fixture, language: String, large: Bool, token: String? = nil, title: String? = nil) {
        app?.terminate(); app = XCUIApplication(bundleIdentifier: fixture.bundle)
        app.launchArguments = ["--ui-testing-authenticated", "--ui-testing-ephemeral-credentials", "--ui-testing-skip-tutorial",
            "--ui-testing-time-poll-live", "--ui-testing-language=\(language)", "--ui-testing-appearance=\(large ? "dark" : "light")",
            "--ui-testing-deep-link=/time-polls/\(token ?? fixture.token)", "-UIPreferredContentSizeCategoryName",
            large ? "UICTContentSizeCategoryAccessibilityXXXL" : "UICTContentSizeCategoryL"]
        if large { app.launchArguments.append("--ui-testing-dynamic-type-accessibility") }
        app.launchEnvironment = ["SIDESEAT_QA_ACCESS_TOKEN": fixture.ownerAccessToken]
        app.launch()
        let heading = app.staticTexts["time-poll-detail-title"]
        XCTAssertTrue(heading.waitForExistence(timeout: 30)); XCTAssertEqual(heading.label, title ?? fixture.title)
    }

    private var detailScroll: XCUIElement { app.scrollViews["time-poll-detail-scroll"] }
    private var finalDockTop: CGFloat {
        ["time-poll-final-summary", "time-poll-final-heading", "time-poll-final-gap"].compactMap { identifier -> CGFloat? in
            let item = app.descendants(matching: .any)[identifier].firstMatch
            return item.exists && !item.frame.isEmpty ? item.frame.minY : nil
        }.min() ?? app.windows.firstMatch.frame.maxY
    }
    private var formScroll: XCUIElement {
        if app.collectionViews.firstMatch.exists { return app.collectionViews.firstMatch }
        if app.tables.firstMatch.exists { return app.tables.firstMatch }
        return app.scrollViews.firstMatch
    }
    private func selectFinalHourIfNeeded() {
        let scroll = app.scrollViews["time-poll-final-scroll"]
        for id in [0, 2] {
            let cell = app.buttons["time-poll-cell-\(id)"]
            reveal(cell, in: scroll)
            if !cell.isSelected { tap(cell) }
            XCTAssertTrue(cell.isSelected)
        }
        let range = app.staticTexts["time-poll-final-summary"]
        XCTAssertTrue(range.label.contains("09:00") && range.label.contains("10:00"), range.label)
    }
    private func assertDirectDock(expectedFriends: Int) {
        XCTAssertFalse(app.buttons["unified-plan-review-roster"].exists)
        let summary = app.descendants(matching: .any)["unified-plan-invitation-summary"].firstMatch
        XCTAssertTrue(summary.waitForExistence(timeout: 15)); assertReachable(summary)
        XCTAssertTrue(summary.label.contains(String(expectedFriends)), summary.label)
        let send = app.buttons["unified-plan-send-invitations"]
        assertTarget(send); XCTAssertTrue(send.isEnabled)
    }
    private func openEditor() {
        let menu = app.buttons["time-poll-menu"]
        assertReachable(menu); tap(menu)
        let edit = app.buttons["unified-plan-edit-invitation"]
        assertReachable(edit); tap(edit)
        XCTAssertTrue(app.descendants(matching: .any)["unified-plan-invitation-editor"].firstMatch.waitForExistence(timeout: 10))
    }
    private func closeEditor() {
        let done = app.buttons["unified-plan-invitation-editor-done"]
        assertReachable(done); tap(done)
        XCTAssertTrue(app.descendants(matching: .any)["unified-plan-invitation-editor"].firstMatch.waitForNonExistence(timeout: 10))
    }
    private func reveal(_ element: XCUIElement, in scroll: XCUIElement) {
        XCTAssertTrue(element.waitForExistence(timeout: 20)); XCTAssertTrue(scroll.exists)
        for _ in 0..<16 {
            // Inner-grid gestures can also move its outer detail page. Re-read both clips.
            let window = app.windows.firstMatch.frame
            var frame = scroll.frame.intersection(window)
            let finalGrid = scroll.identifier == "time-poll-final-scroll"
            if finalGrid {
                frame = frame.intersection(detailScroll.frame)
                    .intersection(CGRect(x: window.minX, y: window.minY, width: window.width,
                                         height: max(0, finalDockTop - 12 - window.minY)))
            }
            if frame.isNull {
                let parent = finalGrid ? detailScroll : scroll
                if scroll.frame.maxY <= app.navigationBars.firstMatch.frame.maxY { parent.swipeDown(velocity: .slow) }
                else { parent.swipeUp(velocity: .slow) }
                continue
            }
            let top = max(frame.minY, app.navigationBars.firstMatch.frame.maxY)
            let visible = CGRect(x: frame.minX, y: top, width: frame.width, height: max(0, frame.maxY - top))
            if element.isHittable && visible.insetBy(dx: -0.5, dy: -0.5).contains(element.frame) { return }
            if finalGrid && visible.height < element.frame.height {
                if scroll.frame.minY < top { detailScroll.swipeDown(velocity: .slow) }
                else { detailScroll.swipeUp(velocity: .slow) }
                continue
            }
            if element.frame.minY < top { scroll.swipeDown(velocity: .slow) }
            else { scroll.swipeUp(velocity: .slow) }
        }
        XCTFail("The complete control must be reachable: \(element.identifier)")
    }
    private func assertSelection(_ element: XCUIElement, selected: Bool, language: String) {
        let expected = language == "de" ? (selected ? "Ausgewählt" : "Nicht ausgewählt") : (selected ? "已选择" : "未选择")
        XCTAssertEqual(element.value as? String, expected)
    }
    private func assertTarget(_ element: XCUIElement) {
        assertReachable(element)
        XCTAssertGreaterThanOrEqual(element.frame.width, 43.99)
        XCTAssertGreaterThanOrEqual(element.frame.height, 43.99)
    }
    private func assertReachable(_ element: XCUIElement) {
        XCTAssertTrue(element.waitForExistence(timeout: 15)); XCTAssertTrue(element.isHittable)
        let bounds = app.windows.firstMatch.frame, frame = element.frame
        XCTAssertFalse(frame.isEmpty)
        XCTAssertGreaterThanOrEqual(frame.minX, bounds.minX - 0.5)
        XCTAssertLessThanOrEqual(frame.maxX, bounds.maxX + 0.5)
        XCTAssertGreaterThanOrEqual(frame.minY, bounds.minY - 0.5)
        XCTAssertLessThanOrEqual(frame.maxY, bounds.maxY + 0.5)
    }
    private func tap(_ element: XCUIElement) { element.coordinate(withNormalizedOffset: CGVector(dx: 0.2, dy: 0.5)).tap() }
    private func capture(_ name: String) {
        let shot = XCTAttachment(screenshot: app.screenshot()); shot.name = name; shot.lifetime = .keepAlways; add(shot)
    }
}
