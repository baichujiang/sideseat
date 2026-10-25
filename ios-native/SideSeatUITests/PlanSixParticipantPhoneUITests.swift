import XCTest

/// Six disposable real accounts; every business mutation below is performed by the App UI.
/// The Mac prepares the accounts/contacts and observes the API without writing plan state.
@MainActor final class PlanSixParticipantPhoneUITests: XCTestCase {
    private struct Account: Decodable {
        let role: String
        let id: String
        let identifier: String
        let password: String
        let accessToken: String
        let displayName: String
    }
    private struct Connection: Decodable { let peerRole: String; let connectionID: String }
    private struct Fixture: Decodable {
        let title: String
        let bundle: String
        let accounts: [Account]
        let connections: [Connection]
    }
    private var app: XCUIApplication!
    private var fixture: Fixture!
    private var language = "zh-Hans"

    override func setUpWithError() throws { continueAfterFailure = false }

    func testOwnerFiveParticipantsAvailabilityInvitationAndCalendar() throws {
        try loadFixture()
        let owner = account("owner")

        launch(owner)
        plansTab().tap()
        let create = app.buttons.matching(NSPredicate(format: "identifier IN %@", ["plans-create-primary", "plans-create-unified"])).firstMatch
        XCTAssertTrue(create.waitForExistence(timeout: 25)); assertTarget(create); create.tap()
        let title = app.descendants(matching: .any)["time-poll-title"].firstMatch
        XCTAssertTrue(title.waitForExistence(timeout: 10)); title.tap(); title.typeText(fixture.title + "\n")
        XCTAssertFalse(app.descendants(matching: .any)["time-poll-grid"].exists)
        XCTAssertTrue(app.buttons["plan-date-options"].exists)
        XCTAssertTrue(app.buttons["time-poll-from"].exists && app.buttons["time-poll-until"].exists)
        capture("01-owner-create-candidate-dates")
        let next = app.buttons["time-poll-create-confirm"]
        XCTAssertEqual(next.label, "下一步：填写空闲"); next.tap()
        XCTAssertTrue(app.buttons["time-poll-cell-0"].waitForExistence(timeout: 25))
        XCTAssertFalse(app.buttons["plan-invite-contacts"].exists)
        XCTAssertFalse(app.buttons["plan-copy-link"].exists)
        XCTAssertTrue(app.buttons["plan-people-open"].label.contains("0 人已填写"))
        capture("02-owner-first-editable-timetable"); phase("created")

        let first = app.buttons["time-poll-cell-0"], second = app.buttons["time-poll-cell-2"]
        XCTAssertFalse(app.buttons["time-poll-undo"].exists)
        first.press(forDuration: 0.6, thenDragTo: second)
        XCTAssertTrue(first.isSelected && second.isSelected)
        second.tap(); XCTAssertTrue(first.isSelected); XCTAssertFalse(second.isSelected)
        second.tap(); XCTAssertTrue(second.isSelected)
        first.press(forDuration: 0.6, thenDragTo: second)
        XCTAssertFalse(first.isSelected || second.isSelected)
        first.press(forDuration: 0.6, thenDragTo: second)
        XCTAssertTrue(first.isSelected && second.isSelected)
        XCTAssertEqual(app.staticTexts["time-poll-save-state"].label, "未提交")
        capture("03-owner-unsubmitted-tap-cancel-drag-erase"); phase("owner-draft")
        let submit = app.buttons["time-poll-submit"]
        XCTAssertEqual(submit.label, "提交并分享"); assertTarget(submit); submit.tap()
        XCTAssertTrue(app.buttons["plan-invite-contacts"].waitForExistence(timeout: 20))
        capture("04-owner-submitted-share-panel"); phase("owner-submitted")
        app.buttons["plan-invite-contacts"].tap()
        for peer in fixture.accounts.filter({ $0.role != "owner" }).sorted(by: { $0.role < $1.role }) {
            let contact = app.buttons["plan-contact-\(peer.id)"]
            reveal(contact, in: app.scrollViews.firstMatch)
            XCTAssertTrue(contact.isEnabled); contact.tap()
        }
        let sendContacts = app.buttons["plan-contact-send"]
        assertTarget(sendContacts); XCTAssertTrue(sendContacts.isEnabled)
        capture("05-all-five-App-friends-selected"); sendContacts.tap()
        XCTAssertTrue(sendContacts.waitForNonExistence(timeout: 25))
        XCTAssertTrue(app.buttons["plan-invite-contacts"].label.contains("已发送"))
        app.navigationBars.buttons["完成"].tap()
        XCTAssertTrue(app.staticTexts["time-poll-saved"].waitForExistence(timeout: 10))
        XCTAssertTrue(first.isSelected && second.isSelected)
        phase("shared")

        for index in 1...5 {
            let role = "peer\(index)"
            launch(account(role)); openChatCard(role: role, action: "填写我的空闲")
            XCTAssertFalse(app.buttons["time-poll-cell-0"].isSelected)
            XCTAssertFalse(app.buttons["time-poll-cell-2"].isSelected)
            app.buttons["time-poll-cell-0"].tap(); app.buttons["time-poll-cell-2"].tap()
            XCTAssertEqual(app.buttons["time-poll-submit"].label, "提交我的空闲")
            submitAvailability()
            XCTAssertFalse(app.buttons["plan-invite-contacts"].exists)
            capture("06-\(role)-submitted-own-availability")
            app.navigationBars.buttons.element(boundBy: 0).tap()
            openListCard()
            XCTAssertTrue(app.buttons["time-poll-cell-0"].isSelected && app.buttons["time-poll-cell-2"].isSelected)
            XCTAssertTrue(app.staticTexts["time-poll-saved"].exists)
            phase("\(role)-submitted")
        }

        launch(account("peer3")); openListCard()
        app.buttons["time-poll-cell-2"].tap()
        XCTAssertTrue(app.buttons["time-poll-cell-0"].isSelected)
        XCTAssertFalse(app.buttons["time-poll-cell-2"].isSelected)
        submitAvailability(); capture("07-peer3-edited-only-own-response"); phase("peer3-edited")
        app.buttons["time-poll-cell-2"].tap(); submitAvailability(); phase("peer3-restored")

        completeInvitationAndCalendar()
    }

    func testContinueInvitationAndCalendarAfterSixRealSubmissions() throws {
        try XCTSkipIf(ProcessInfo.processInfo.environment["SIDESEAT_PLAN_SIX_CONTINUE"] != "1",
            "Requires an explicitly verified six-response plan after a test-only interruption.")
        try loadFixture()
        completeInvitationAndCalendar()
    }

    func testContinueRepliesAndCalendarAfterFormalInvitations() throws {
        try XCTSkipIf(ProcessInfo.processInfo.environment["SIDESEAT_PLAN_SIX_CONTINUE"] != "1",
            "Requires an explicitly verified invited six-person plan after a test-only interruption.")
        try loadFixture()
        completeRepliesAndCalendar()
    }

    func testContinuePublicationAndCalendarAfterMixedReplies() throws {
        try XCTSkipIf(ProcessInfo.processInfo.environment["SIDESEAT_PLAN_SIX_CONTINUE"] != "1",
            "Requires an explicitly verified six-person mixed-reply plan after a test-only interruption.")
        try loadFixture()
        completePublicationAndCalendar()
    }

    func testContinueCalendarsAfterOrganizerPublished() throws {
        try XCTSkipIf(ProcessInfo.processInfo.environment["SIDESEAT_PLAN_SIX_CONTINUE"] != "1",
            "Requires an explicitly verified published six-person plan after a test-only interruption.")
        try loadFixture()
        completeCalendarAfterPublication()
    }

    func testVerifyCalendarsAfterParticipantWithdrawal() throws {
        try XCTSkipIf(ProcessInfo.processInfo.environment["SIDESEAT_PLAN_SIX_CONTINUE"] != "1",
            "Requires an explicitly verified participant withdrawal after a test-only interruption.")
        try loadFixture()
        completeFinalCalendarVerification()
    }

    private func loadFixture() throws {
        let raw = ProcessInfo.processInfo.environment["SIDESEAT_PLAN_SIX_JSON"]
        try XCTSkipIf(raw == nil || raw!.isEmpty, "Requires six disposable real accounts from the Mac.")
        let data = raw!.hasPrefix("{") ? Data(raw!.utf8) : try Data(contentsOf: URL(fileURLWithPath: raw!))
        fixture = try JSONDecoder().decode(Fixture.self, from: data)
        XCTAssertEqual(Set(fixture.accounts.map(\.role)), Set(["owner", "peer1", "peer2", "peer3", "peer4", "peer5"]))
        XCTAssertEqual(fixture.connections.count, 5)
        addTeardownBlock { [self] in MainActor.assumeIsolated { app?.terminate() } }

    }

    private func completeInvitationAndCalendar() {
        let owner = account("owner")
        launch(owner); openListCard()
        // A test interruption may leave the per-plan final-time draft open.
        if app.buttons["time-poll-cancel-final"].exists { app.buttons["time-poll-cancel-final"].tap() }
        XCTAssertTrue(app.buttons["plan-people-open"].label.contains("6 人已填写"))
        XCTAssertTrue(app.buttons["plan-people-open"].label.contains("+3"))
        capture("08-six-responses-compact-avatar-summary")
        app.buttons["unified-plan-invite-window"].tap()
        if app.buttons["time-poll-reset-final"].exists { app.buttons["time-poll-reset-final"].tap() }
        reveal(app.buttons["time-poll-cell-0"], in: app.scrollViews["time-poll-final-scroll"])
        verifyFinalSelectionRules()
        selectCrossDayFinalTime()
        let review = app.buttons["unified-plan-review-roster"]
        assertTarget(review); review.tap()
        verifyReviewRoster()
        capture("09-review-six-invitees-cross-midnight")
        app.buttons["unified-plan-adjust-time"].tap()
        assertFinalClock("23:00", "01:00")
        phase("final-review-cancelled")
        // The actual invitation uses the common availability, after testing a cross-day draft.
        app.buttons["time-poll-reset-final"].tap()
        reveal(app.buttons["time-poll-cell-0"], in: app.scrollViews["time-poll-final-scroll"])
        app.buttons["time-poll-cell-0"].tap(); app.buttons["time-poll-cell-2"].tap()
        assertFinalClock("09:00", "10:00")
        XCTAssertTrue(review.isEnabled); review.tap()
        verifyReviewRoster()
        app.buttons["unified-plan-send-invitations"].tap()
        XCTAssertTrue(app.buttons["unified-plan-publish"].waitForExistence(timeout: 25))
        XCTAssertTrue(app.descendants(matching: .any)["unified-plan-phase"].firstMatch.label.contains("待你正式发出"))
        verifyInlineRoster(stage: "owner-invited", acceptedRoles: ["owner"], declinedRoles: [])
        capture("10-owner-can-publish-with-five-pending"); phase("invited")

        // The same real six-person record remains readable at actual maximum type size.
        launch(owner, maximum: true); openListCard()
        verifyInvitedTimetable(stage: "owner-zh-maximum")
        verifyInlineRoster(stage: "owner-zh-maximum", acceptedRoles: ["owner"], declinedRoles: [])

        completeRepliesAndCalendar()
    }

    private func completeRepliesAndCalendar() {
        for index in 1...3 {
            let role = "peer\(index)"
            launch(account(role)); openChatCard(role: role, action: "查看邀请")
            if index == 1 { verifyInvitedTimetable(stage: "peer1-invited") }
            let accept = app.buttons["unified-plan-accept"]
            XCTAssertTrue(app.descendants(matching: .any)["unified-plan-phase"].firstMatch.label.contains("待你确认"))
            assertTarget(accept); accept.tap()
            XCTAssertTrue(app.staticTexts["unified-plan-accepted-status"].waitForExistence(timeout: 20))
            XCTAssertFalse(app.buttons["plan-view-calendar"].exists)
            XCTAssertTrue(app.descendants(matching: .any)["unified-plan-phase"].firstMatch.label.contains("待发起人正式发出"))
            capture("11-\(role)-accepted-waiting-for-publish"); phase("\(role)-accepted")
        }
        launch(account("peer4")); openListCard()
        XCTAssertTrue(app.buttons["unified-plan-accept"].waitForExistence(timeout: 20))
        XCTAssertTrue(app.buttons["unified-plan-decline"].isEnabled)
        XCTAssertFalse(app.buttons["plan-view-calendar"].exists)
        capture("12-peer4-ignored-no-response"); phase("peer4-ignored")
        launch(account("peer5")); openListCard()
        app.buttons["unified-plan-decline"].tap()
        waitEnabled(app.buttons["unified-plan-decline"], false)
        XCTAssertTrue(app.buttons["unified-plan-accept"].isEnabled)
        XCTAssertTrue(app.descendants(matching: .any)["unified-plan-phase"].firstMatch.label.contains("你已回复无法参加"))
        capture("13-peer5-declined"); phase("peer5-declined")

        completePublicationAndCalendar()
    }

    private func completePublicationAndCalendar() {
        let owner = account("owner")
        launch(owner, language: "de", maximum: true); openListCard()
        verifyInlineRoster(stage: "owner-de-maximum-mixed-replies", acceptedRoles: ["owner", "peer1", "peer2", "peer3"], declinedRoles: ["peer5"])
        let publish = app.buttons["unified-plan-publish"]
        assertTarget(publish); XCTAssertTrue(publish.isEnabled); publish.tap()
        verifyPublishPrompt(captureName: "14-maximum-publish-prompt-four-accepted")
        app.buttons["unified-plan-publish-cancel"].tap()
        XCTAssertTrue(app.buttons["unified-plan-publish-prompt"].waitForNonExistence(timeout: 5))
        XCTAssertTrue(publish.isEnabled)
        publish.tap(); verifyPublishPrompt(captureName: "15-maximum-publish-confirm-after-cancel")
        app.buttons["unified-plan-publish-confirm"].tap()
        XCTAssertTrue(app.buttons["plan-view-calendar"].waitForExistence(timeout: 25))
        capture("16-owner-published-before-all-replies"); phase("published")

        completeCalendarAfterPublication()
    }

    private func completeCalendarAfterPublication() {
        let owner = account("owner")
        launch(owner); openListCard(confirmed: true); verifyCalendar(role: "owner")
        launch(account("peer1")); openListCard(confirmed: true); verifyCalendar(role: "peer1")
        phase("calendar-verified")

        launch(account("peer4")); openListCard()
        XCTAssertTrue(app.buttons["unified-plan-accept"].waitForExistence(timeout: 20))
        XCTAssertFalse(app.buttons["plan-view-calendar"].exists)
        app.buttons["unified-plan-accept"].tap()
        XCTAssertTrue(app.buttons["plan-view-calendar"].waitForExistence(timeout: 20))
        capture("17-peer4-late-acceptance-after-publish"); phase("peer4-late-accepted")
        verifyCalendar(role: "peer4-late")

        launch(account("peer2")); openListCard(confirmed: true)
        XCTAssertTrue(app.buttons["plan-view-calendar"].waitForExistence(timeout: 20))
        app.buttons["unified-plan-decline"].tap()
        waitEnabled(app.buttons["unified-plan-decline"], false)
        XCTAssertFalse(app.buttons["plan-view-calendar"].exists)
        XCTAssertTrue(app.buttons["unified-plan-accept"].isEnabled)
        capture("18-peer2-withdrawn-calendar-action-removed"); phase("peer2-withdrawn")
        completeFinalCalendarVerification()
    }

    private func completeFinalCalendarVerification() {
        // Start from a fresh authenticated root instead of a plan detail sheet.
        launch(account("peer2"))
        verifyCalendarSearchHasNoResult(role: "peer2-withdrawn")
        launch(account("peer5"))
        verifyCalendarSearchHasNoResult(role: "peer5-declined")
        launch(account("owner")); openListCard(confirmed: true)
        verifyInlineRoster(stage: "owner-final-mixed-replies", acceptedRoles: ["owner", "peer1", "peer3", "peer4"], declinedRoles: ["peer2", "peer5"])
        phase("final-calendar-verified")
    }

    private func account(_ role: String) -> Account { fixture.accounts.first { $0.role == role }! }

    private func launch(_ account: Account, language: String = "zh-Hans", maximum: Bool = false) {
        app?.terminate(); self.language = language
        app = XCUIApplication(bundleIdentifier: fixture.bundle)
        app.launchArguments = ["--ui-testing-signed-out", "--ui-testing-ephemeral-credentials", "--ui-testing-skip-tutorial",
            "--ui-testing-language=\(language)", "--ui-testing-appearance=light",
            "-UIPreferredContentSizeCategoryName", maximum ? "UICTContentSizeCategoryAccessibilityXXXL" : "UICTContentSizeCategoryL"]
        if maximum { app.launchArguments.append("--ui-testing-dynamic-type-accessibility") }
        app.launchEnvironment = [:]
        app.launch()
        let identifier = app.textFields["login-identifier"]
        XCTAssertTrue(identifier.waitForExistence(timeout: 20)); identifier.tap(); identifier.typeText(account.identifier)
        let password = app.secureTextFields["login-password"]
        password.tap(); password.typeText(account.password)
        app.buttons["login-submit"].tap()
        XCTAssertTrue(app.tabBars.firstMatch.waitForExistence(timeout: 30))
    }

    private func plansTab() -> XCUIElement { app.tabBars.buttons[language == "de" ? "Pläne" : "计划"] }

    private func openListCard(confirmed: Bool = false) {
        plansTab().tap()
        if confirmed { app.buttons["plans-tab-upcoming"].tap() }
        let card = app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH 'plans-coordinated-' AND label CONTAINS %@", fixture.title)).firstMatch
        XCTAssertTrue(card.waitForExistence(timeout: 25)); card.tap()
        XCTAssertTrue(app.staticTexts["time-poll-detail-title"].waitForExistence(timeout: 25))
        XCTAssertEqual(app.staticTexts["time-poll-detail-title"].label, fixture.title)
    }

    private func openChatCard(role: String, action: String) {
        app.tabBars.buttons["消息"].tap()
        let connection = fixture.connections.first { $0.peerRole == role }!
        let row = app.buttons["inbox-row-\(connection.connectionID)"]
        XCTAssertTrue(row.waitForExistence(timeout: 25)); row.tap()
        let card = app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH 'shared-plan-card-'"))
            .containing(.staticText, identifier: fixture.title).firstMatch
        XCTAssertTrue(card.waitForExistence(timeout: 25))
        XCTAssertTrue(card.staticTexts[action].waitForExistence(timeout: 10))
        card.tap()
        XCTAssertTrue(app.staticTexts["time-poll-detail-title"].waitForExistence(timeout: 25))
        XCTAssertEqual(app.staticTexts["time-poll-detail-title"].label, fixture.title)
        capture("chat-entry-\(role)-\(action == "查看邀请" ? "invitation" : "availability")-detail")
    }

    private func submitAvailability() {
        let submit = app.buttons["time-poll-submit"]
        assertTarget(submit); XCTAssertTrue(submit.isEnabled); submit.tap()
        XCTAssertTrue(app.staticTexts["time-poll-saved"].waitForExistence(timeout: 25))
    }

    private func verifyFinalSelectionRules() {
        let first = app.buttons["time-poll-cell-0"], second = app.buttons["time-poll-cell-2"], third = app.buttons["time-poll-cell-4"]
        let review = app.buttons["unified-plan-review-roster"]
        XCTAssertTrue(review.waitForExistence(timeout: 10)); XCTAssertFalse(review.isEnabled)
        XCTAssertFalse(app.buttons["time-poll-undo"].exists)
        first.tap(); second.tap(); assertFinalClock("09:00", "10:00")
        second.tap(); XCTAssertTrue(first.isSelected); assertFinalClock("09:00", "09:30")
        third.tap(); XCTAssertTrue(first.isSelected && third.isSelected)
        XCTAssertFalse(review.isEnabled); XCTAssertTrue(app.staticTexts["time-poll-final-gap"].exists)
        third.tap(); first.tap(); XCTAssertFalse(review.isEnabled)
        first.press(forDuration: 0.5, thenDragTo: second)
        XCTAssertTrue(first.isSelected && second.isSelected)
        first.press(forDuration: 0.5, thenDragTo: second)
        XCTAssertFalse(first.isSelected || second.isSelected)
        first.tap(); second.tap(); app.buttons["time-poll-cancel-final"].tap()
        XCTAssertTrue(first.isSelected && second.isSelected, "Final draft must not overwrite submitted availability")
        app.buttons["unified-plan-invite-window"].tap()
        XCTAssertTrue(review.isEnabled); assertFinalClock("09:00", "10:00")
    }

    private func selectCrossDayFinalTime() {
        app.buttons["time-poll-reset-final"].tap()
        let dates = app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH 'time-poll-day-'"))
            .allElementsBoundByIndex.map { $0.identifier.replacingOccurrences(of: "time-poll-day-", with: "") }.sorted()
        XCTAssertGreaterThanOrEqual(dates.count, 2)
        let viewport = app.scrollViews["time-poll-final-scroll"]
        func cell(_ date: String, _ clock: String) -> XCUIElement {
            app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@ AND label CONTAINS %@", date, clock)).firstMatch
        }
        let night = cell(dates[0], "23:00–23:30"), midnight = cell(dates[0], "23:30–00:00")
        for _ in 0..<3 { viewport.swipeUp(velocity: .fast) }
        reveal(night, in: viewport); reveal(midnight, in: viewport)
        night.press(forDuration: 0.5, thenDragTo: midnight)
        XCTAssertTrue(night.isSelected && midnight.isSelected); capture("final-cross-midnight-evening")
        let morning = cell(dates[1], "00:00–00:30"), end = cell(dates[1], "00:30–01:00")
        for _ in 0..<3 { viewport.swipeDown(velocity: .fast) }
        reveal(morning, in: viewport); reveal(end, in: viewport)
        morning.press(forDuration: 0.5, thenDragTo: end)
        XCTAssertTrue(morning.isSelected && end.isSelected); assertFinalClock("23:00", "01:00")
        end.tap(); assertFinalClock("23:00", "00:30")
        end.tap(); assertFinalClock("23:00", "01:00")
        XCTAssertTrue(app.buttons["unified-plan-review-roster"].isEnabled)
        capture("final-cross-midnight-morning-summary")
    }

    private func verifyReviewRoster() {
        let send = app.buttons["unified-plan-send-invitations"]
        XCTAssertTrue(send.waitForExistence(timeout: 10)); assertTarget(send); XCTAssertTrue(send.isEnabled)
        let rows = app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH 'unified-plan-invite-person-'"))
        XCTAssertEqual(rows.count, 6)
        for person in fixture.accounts {
            let row = rows.matching(NSPredicate(format: "label CONTAINS %@", person.displayName)).firstMatch
            XCTAssertTrue(row.exists)
            XCTAssertTrue(["已选择", "Selected"].contains(row.value as? String ?? ""), row.label)
        }
    }

    private func verifyInlineRoster(stage: String, acceptedRoles: Set<String>, declinedRoles: Set<String>) {
        let roster = app.descendants(matching: .any)["unified-plan-inline-people"].firstMatch
        XCTAssertTrue(roster.waitForExistence(timeout: 15)); XCTAssertFalse(app.buttons["plan-people-open"].exists)
        let rows = roster.descendants(matching: .any).matching(NSPredicate(format: "identifier BEGINSWITH 'unified-plan-person-'"))
        XCTAssertEqual(rows.count, 6)
        let scroll = app.scrollViews["unified-plan-confirmation-scroll"]
        let footer = app.buttons["unified-plan-publish"].exists ? app.buttons["unified-plan-publish"] : app.buttons["plan-view-calendar"]
        assertTarget(footer)
        for person in fixture.accounts {
            let row = rows.matching(NSPredicate(format: "label CONTAINS %@", person.displayName)).firstMatch
            XCTAssertTrue(row.exists, person.displayName)
            let status: String
            if language == "de" { status = acceptedRoles.contains(person.role) ? "Angenommen" : declinedRoles.contains(person.role) ? "Abgelehnt" : "Zusage ausstehend" }
            else { status = acceptedRoles.contains(person.role) ? "已接受" : declinedRoles.contains(person.role) ? "已拒绝" : "待确认" }
            XCTAssertTrue(row.label.contains(status), row.label)
            reveal(row, in: scroll, below: app.navigationBars.firstMatch.frame.maxY + 4, above: footer.frame.minY - 8)
            capture("roster-\(stage)-\(person.role)")
        }
        let title = app.staticTexts["time-poll-detail-title"]
        reveal(title, in: scroll, below: app.navigationBars.firstMatch.frame.maxY + 4, above: footer.frame.minY - 8)
    }

    private func verifyInvitedTimetable(stage: String) {
        let scroll = app.scrollViews["unified-plan-confirmation-scroll"]
        let footer = app.buttons["unified-plan-publish"].exists ? app.buttons["unified-plan-publish"] : app.buttons["unified-plan-accept"]
        assertTarget(footer)
        let cells = app.descendants(matching: .any).matching(NSPredicate(format: "identifier BEGINSWITH 'plan-invitation-cell-'"))
        XCTAssertGreaterThanOrEqual(cells.count, 4)
        XCTAssertEqual(app.descendants(matching: .any).matching(identifier: "plan-invitation-legend").count, 1)
        XCTAssertFalse(app.descendants(matching: .any)["plan-invitation-window-label"].exists)
        var selected = 0
        for index in 0..<cells.count {
            let cell = cells.element(boundBy: index)
            if cell.isSelected {
                selected += 1
                reveal(cell, in: scroll, below: app.navigationBars.firstMatch.frame.maxY + 4, above: footer.frame.minY - 12)
                capture("invited-timetable-\(stage)-row-\(index)")
            }
        }
        XCTAssertGreaterThanOrEqual(selected, 2)
    }

    private func verifyPublishPrompt(captureName: String) {
        let prompt = app.descendants(matching: .any)["unified-plan-publish-prompt"].firstMatch
        XCTAssertTrue(prompt.waitForExistence(timeout: 10))
        let window = app.windows.firstMatch.frame
        XCTAssertTrue(window.insetBy(dx: 8, dy: 8).contains(prompt.frame))
        XCTAssertEqual(prompt.frame.midX, window.midX, accuracy: 4)
        XCTAssertTrue(prompt.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", "4")).firstMatch.exists)
        capture(captureName + "-message")
        let confirm = app.buttons["unified-plan-publish-confirm"]
        let scroll = prompt.scrollViews.firstMatch
        for _ in 0..<8 where !confirm.isHittable {
            if scroll.exists { scroll.swipeUp(velocity: .slow) }
            else { prompt.swipeUp(velocity: .slow) }
        }
        assertTarget(app.buttons["unified-plan-publish-cancel"])
        assertTarget(confirm)
        capture(captureName + "-actions")
    }

    private func verifyCalendar(role: String) {
        let calendar = app.buttons["plan-view-calendar"]
        assertTarget(calendar); calendar.tap()
        XCTAssertTrue(app.tabBars.buttons["日历"].isSelected)
        let result = searchCalendar()
        XCTAssertTrue(result.waitForExistence(timeout: 25)); capture("calendar-\(role)-exact-plan-result"); result.tap()
        let detail = app.descendants(matching: .any)["calendar-readonly-detail"].firstMatch
        XCTAssertTrue(detail.waitForExistence(timeout: 15))
        let list = app.collectionViews.firstMatch.exists ? app.collectionViews.firstMatch : app.tables.firstMatch
        XCTAssertTrue(list.waitForExistence(timeout: 10))
        let manage = app.buttons["calendar-manage-plan"]
        // List does not materialize later rows until the medium detail is scrolled.
        for _ in 0..<10 where !manage.exists || !manage.isHittable { list.swipeUp(velocity: .slow) }
        assertTarget(manage)
        capture("calendar-\(role)-entry-manage-plan")
        manage.tap()
        XCTAssertTrue(app.staticTexts["unified-plan-confirmation-count"].waitForExistence(timeout: 20))
        XCTAssertTrue(app.buttons["plan-view-calendar"].exists)
    }

    private func verifyCalendarSearchHasNoResult(role: String) {
        app.tabBars.buttons["日历"].tap()
        let result = searchCalendar()
        XCTAssertTrue(app.descendants(matching: .any)["calendar-search-empty"].waitForExistence(timeout: 25))
        XCTAssertTrue(result.waitForNonExistence(timeout: 15))
        capture("calendar-\(role)-exact-plan-absent")
    }

    private func searchCalendar() -> XCUIElement {
        app.buttons["calendar-search"].tap()
        let search = app.searchFields.firstMatch
        XCTAssertTrue(search.waitForExistence(timeout: 10)); search.tap(); search.typeText(fixture.title)
        return app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH 'calendar-search-result-' AND label CONTAINS %@", fixture.title)).firstMatch
    }

    private func assertFinalClock(_ start: String, _ end: String) {
        let summary = app.staticTexts["time-poll-final-summary"]
        XCTAssertTrue(summary.label.contains(start), summary.label)
        XCTAssertTrue(summary.label.contains(end), summary.label)
    }

    private func reveal(_ element: XCUIElement, in proposedScroll: XCUIElement, below top: CGFloat? = nil, above bottom: CGFloat? = nil) {
        XCTAssertTrue(element.waitForExistence(timeout: 15))
        let scroll = proposedScroll.exists ? proposedScroll : app.scrollViews.firstMatch
        let lower = top ?? max(scroll.exists ? scroll.frame.minY : 0, app.navigationBars.firstMatch.frame.maxY + 2)
        let upper = bottom ?? min(scroll.exists ? scroll.frame.maxY : app.frame.maxY, app.tabBars.firstMatch.exists ? app.tabBars.firstMatch.frame.minY : app.frame.maxY) + 0.5
        for _ in 0..<28 {
            if element.isHittable && element.frame.minY >= lower && element.frame.maxY <= upper { break }
            let distance = min(CGFloat(180), max(CGFloat(48), element.frame.minY < lower ? lower - element.frame.minY : element.frame.maxY - upper))
            let startY = min(upper - 30, max(lower + 30, (lower + upper) / 2))
            let origin = app.coordinate(withNormalizedOffset: .zero)
            origin.withOffset(CGVector(dx: 24, dy: startY)).press(forDuration: 0.05,
                thenDragTo: origin.withOffset(CGVector(dx: 24, dy: startY + (element.frame.minY < lower ? distance : -distance))))
        }
        XCTAssertTrue(element.isHittable, element.identifier)
        XCTAssertGreaterThanOrEqual(element.frame.minY, lower, element.identifier)
        XCTAssertLessThanOrEqual(element.frame.maxY, upper, element.identifier)
    }

    private func assertTarget(_ button: XCUIElement) {
        XCTAssertTrue(button.waitForExistence(timeout: 15)); XCTAssertTrue(button.isHittable, button.identifier)
        XCTAssertGreaterThanOrEqual(button.frame.height, 43.99, button.identifier)
    }

    private func waitEnabled(_ element: XCUIElement, _ enabled: Bool) {
        XCTAssertEqual(XCTWaiter.wait(for: [XCTNSPredicateExpectation(predicate: NSPredicate(format: "enabled == %@", NSNumber(value: enabled)), object: element)], timeout: 20), .completed)
    }

    private func phase(_ value: String) { print("PLAN_SIX_PHASE \(value)"); Thread.sleep(forTimeInterval: 3) }
    private func capture(_ name: String) {
        let image = XCTAttachment(screenshot: app.screenshot())
        image.name = "plan-six-" + name; image.lifetime = .keepAlways; add(image)
    }
}
