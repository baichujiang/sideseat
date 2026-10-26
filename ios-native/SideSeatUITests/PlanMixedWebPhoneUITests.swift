import XCTest

/// The App performs every registered participant's business action. The Mac browser performs
/// the three independent guests' actions and observes state; neither side substitutes API writes.
@MainActor final class PlanMixedWebPhoneUITests: XCTestCase {
    private struct Account: Decodable {
        let role: String; let id: String; let identifier: String; let password: String; let displayName: String
    }
    private struct Guest: Decodable { let role: String; let displayName: String }
    private struct Connection: Decodable { let peerRole: String; let connectionID: String }
    private struct Fixture: Decodable {
        let title: String; let location: String; let bundle: String
        let accounts: [Account]; let connections: [Connection]; let mixedGuests: [Guest]
    }
    private var fixture: Fixture!
    private var app: XCUIApplication!
    private var people: [(role: String, name: String)] {
        fixture.accounts.filter { ["owner", "peer1", "peer2"].contains($0.role) }.map { ($0.role, $0.displayName) }
            + fixture.mixedGuests.map { ($0.role, $0.displayName) }
    }

    override func setUpWithError() throws { continueAfterFailure = false }

    func testAppAndWebGuestsAvailabilityInvitationCancellationAndCalendar() throws {
        try loadFixture()
        XCTAssertEqual(Set(people.map(\.name)).count, 6, "This case needs distinct names for visible Calendar identity assertions.")

        launch("owner"); app.tabBars.buttons["计划"].tap()
        let create = app.buttons.matching(NSPredicate(format: "identifier IN %@", ["plans-create-primary", "plans-create-unified"])).firstMatch
        tap(create)
        let title = app.descendants(matching: .any)["time-poll-title"].firstMatch
        XCTAssertTrue(title.waitForExistence(timeout: 10)); title.tap(); title.typeText(fixture.title + "\n")
        let location = app.textFields["unified-plan-location"]
        XCTAssertTrue(location.exists); location.tap(); location.typeText(fixture.location + "\n")
        XCTAssertFalse(app.descendants(matching: .any)["time-poll-grid"].exists)
        XCTAssertTrue(app.buttons["plan-date-options"].exists)
        XCTAssertTrue(app.buttons["time-poll-from"].exists && app.buttons["time-poll-until"].exists)
        capture("01-create-dates-without-grid")
        let next = app.buttons["time-poll-create-confirm"]
        XCTAssertEqual(next.label, "下一步：填写空闲"); tap(next)
        XCTAssertTrue(app.buttons["time-poll-cell-0"].waitForExistence(timeout: 25))
        XCTAssertTrue(app.buttons["plan-people-open"].label.contains("0 人已填写"))
        XCTAssertFalse(app.buttons["plan-invite-contacts"].exists)
        capture("02-owner-first-timetable"); phase("created")

        selectCommonAvailability()
        XCTAssertEqual(app.staticTexts["time-poll-save-state"].label, "未提交")
        capture("03-owner-unsubmitted-availability"); phase("owner-draft")
        XCTAssertEqual(app.buttons["time-poll-submit"].label, "提交并分享")
        tap(app.buttons["time-poll-submit"])
        XCTAssertTrue(app.buttons["plan-invite-contacts"].waitForExistence(timeout: 25))
        capture("04-owner-submitted-share-sheet"); phase("owner-submitted")
        tap(app.buttons["plan-invite-contacts"])
        for role in ["peer1", "peer2"] {
            let contact = app.buttons["plan-contact-\(account(role).id)"]
            reveal(contact, in: app.scrollViews.firstMatch); tap(contact)
        }
        let send = app.buttons["plan-contact-send"]
        XCTAssertTrue(send.isEnabled); capture("05-two-App-contacts-selected"); tap(send)
        XCTAssertTrue(send.waitForNonExistence(timeout: 25))
        XCTAssertTrue(app.buttons["plan-invite-contacts"].label.contains("已发送"))
        app.navigationBars.buttons["完成"].tap()
        XCTAssertTrue(app.staticTexts["time-poll-saved"].waitForExistence(timeout: 15)); phase("app-shared")

        for index in 1...2 {
            let role = "peer\(index)"
            launch(role); openChatCard(role: role)
            XCTAssertFalse(app.buttons["time-poll-cell-0"].isSelected || app.buttons["time-poll-cell-2"].isSelected)
            selectCommonAvailability()
            XCTAssertEqual(app.buttons["time-poll-submit"].label, "提交我的空闲")
            tap(app.buttons["time-poll-submit"])
            XCTAssertTrue(app.staticTexts["time-poll-saved"].waitForExistence(timeout: 25))
            app.navigationBars.buttons.element(boundBy: 0).tap(); openListCard()
            XCTAssertTrue(app.buttons["time-poll-cell-0"].isSelected && app.buttons["time-poll-cell-2"].isSelected)
            capture("06-app\(index)-submitted-and-reopened"); phase("app\(index)-submitted")
        }

        launch("owner"); openListCard()
        let peopleButton = app.buttons["plan-people-open"]
        wait(peopleButton, matching: "exists == true AND label CONTAINS '6 人已填写'", timeout: 90)
        XCTAssertTrue(peopleButton.label.contains("+3")); tap(peopleButton)
        let responseRows = app.descendants(matching: .any).matching(NSPredicate(format: "identifier BEGINSWITH 'plan-response-person-'"))
        XCTAssertEqual(responseRows.count, 6)
        for person in people {
            let row = responseRows.matching(NSPredicate(format: "label CONTAINS %@", person.name)).firstMatch
            XCTAssertTrue(row.exists, person.name); XCTAssertTrue(row.label.contains("已提交空闲"), row.label)
        }
        capture("07-six-App-and-web-responses"); tap(app.buttons["plan-people-done"]); phase("six-responses-ready")

        tap(app.buttons["unified-plan-invite-window"])
        reveal(app.buttons["time-poll-cell-0"], in: app.scrollViews["time-poll-final-scroll"])
        selectCommonAvailability()
        let summary = app.staticTexts["time-poll-final-summary"]
        XCTAssertTrue(summary.label.contains("09:00") && summary.label.contains("10:00"), summary.label)
        tap(app.buttons["unified-plan-review-roster"])
        let inviteRows = app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH 'unified-plan-invite-person-'"))
        XCTAssertEqual(inviteRows.count, 6)
        for person in people {
            let row = inviteRows.matching(NSPredicate(format: "label CONTAINS %@", person.name)).firstMatch
            XCTAssertTrue(row.exists, person.name)
            XCTAssertTrue(["Selected", "已选择"].contains(row.value as? String ?? ""), person.name)
        }
        capture("08-review-six-invitees"); tap(app.buttons["unified-plan-send-invitations"])
        XCTAssertTrue(app.buttons["unified-plan-publish"].waitForExistence(timeout: 25))
        verifyRoster(accepted: ["owner"], declined: [], stage: "initial-invitations")
        verifyInvitedTimetable(); capture("09-owner-invited-five"); phase("invited")

        launch("peer1"); openListCard(); verifyInvitedTimetable()
        tap(app.buttons["unified-plan-accept"])
        XCTAssertTrue(app.staticTexts["unified-plan-accepted-status"].waitForExistence(timeout: 25))
        XCTAssertFalse(app.buttons["plan-view-calendar"].exists)
        capture("10-app1-accepted-before-publication"); phase("app1-accepted")

        launch("owner"); openListCard()
        waitForRoster(role: "guestA", status: "已接受")
        waitForRoster(role: "guestC", status: "已拒绝")
        verifyRoster(accepted: ["owner", "peer1", "guestA"], declined: ["guestC"], stage: "mixed-replies")
        XCTAssertTrue(app.staticTexts["unified-plan-confirmation-count"].label.contains("3"))
        phase("mixed-replies-ready")
        tap(app.buttons["unified-plan-publish"])
        let prompt = app.descendants(matching: .any)["unified-plan-publish-prompt"].firstMatch
        XCTAssertTrue(prompt.waitForExistence(timeout: 10))
        XCTAssertTrue(prompt.staticTexts.matching(NSPredicate(format: "label CONTAINS '3'")).firstMatch.exists)
        capture("11-publish-only-three-accepted"); tap(app.buttons["unified-plan-publish-confirm"])
        XCTAssertTrue(app.buttons["plan-view-calendar"].waitForExistence(timeout: 25))
        capture("12-published-with-pending-and-declined"); phase("published")
        // Guest B may accept while this real Calendar opens. A and App 1 must already be
        // present; App 2 and declined C must still be absent. B is checked strictly below.
        verifyCalendar(role: "owner", required: ["peer1", "guestA"], absent: ["peer2", "guestC"])

        launch("peer2"); openListCard()
        XCTAssertFalse(app.buttons["plan-view-calendar"].exists)
        tap(app.buttons["unified-plan-accept"])
        XCTAssertTrue(app.buttons["plan-view-calendar"].waitForExistence(timeout: 25))
        capture("13-app2-late-accepted"); phase("app2-late-accepted")
        waitForRoster(role: "guestB", status: "已接受")
        waitForRoster(role: "guestA", status: "已拒绝")
        verifyRoster(accepted: ["owner", "peer1", "peer2", "guestB"], declined: ["guestA", "guestC"], stage: "guest-withdrawn")
        verifyCalendar(role: "peer2-late", required: ["owner", "peer1", "guestB"], absent: ["guestA", "guestC"])

        launch("peer1"); openListCard(confirmed: true)
        tap(app.buttons["unified-plan-decline"])
        wait(app.buttons["unified-plan-decline"], matching: "enabled == false")
        XCTAssertFalse(app.buttons["plan-view-calendar"].exists)
        capture("14-app1-withdrawn"); phase("app1-withdrawn")
        launch("peer1"); verifyCalendarAbsent(role: "app1-withdrawn")

        launch("owner"); openListCard(confirmed: true)
        waitForRoster(role: "guestA", status: "已拒绝"); waitForRoster(role: "guestB", status: "已接受")
        verifyRoster(accepted: ["owner", "peer2", "guestB"], declined: ["peer1", "guestA", "guestC"], stage: "before-cancel")
        tap(app.buttons["time-poll-menu"]); tap(app.buttons["unified-plan-cancel"])
        XCTAssertTrue(app.descendants(matching: .any)["time-poll-cancel-prompt"].firstMatch.waitForExistence(timeout: 10))
        capture("15-cancel-for-everyone-prompt"); tap(app.buttons["time-poll-cancel-confirm"])
        let status = app.descendants(matching: .any)["unified-plan-phase"].firstMatch
        wait(status, matching: "exists == true AND label CONTAINS '取消'")
        XCTAssertFalse(app.buttons["unified-plan-accept"].exists || app.buttons["plan-view-calendar"].exists)
        capture("16-cancelled-plan"); phase("cancelled")
        launch("peer2"); verifyCalendarAbsent(role: "app2-cancelled")
        launch("owner"); verifyCalendarAbsent(role: "owner-cancelled"); phase("final-calendar-verified")
    }

    /// A separately prepared real mixed plan has two accepted guests with the same display
    /// name. The API preserves both identities; the visible Calendar must preserve both rows.
    func testSameNameWebGuestsRemainDistinctInCalendar() throws {
        try loadFixture()
        launch("owner"); app.tabBars.buttons["日历"].tap()
        let result = searchCalendar()
        XCTAssertTrue(result.waitForExistence(timeout: 25))
        XCTAssertEqual(app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH 'calendar-search-result-' AND label CONTAINS %@", fixture.title)).count, 1)
        result.tap()
        XCTAssertTrue(app.descendants(matching: .any)["calendar-readonly-detail"].firstMatch.waitForExistence(timeout: 15))
        let list = app.collectionViews.firstMatch.exists ? app.collectionViews.firstMatch : app.tables.firstMatch
        XCTAssertTrue(list.waitForExistence(timeout: 10))
        let names = app.staticTexts.matching(identifier: fixture.mixedGuests[0].displayName)
        for _ in 0..<10 where names.count < 2 { list.swipeUp(velocity: .slow) }
        capture("same-name-web-guests-calendar-rows-\(names.count)")
        XCTAssertEqual(names.count, 2, "Two different accepted guest identities must remain two Calendar people rows, even when their display names match.")
    }

    private func loadFixture() throws {
        XCTAssertNil(ProcessInfo.processInfo.environment["SIMULATOR_UDID"], "This acceptance case requires the physical iPhone.")
        let raw = ProcessInfo.processInfo.environment["SIDESEAT_PLAN_SIX_JSON"]
        try XCTSkipIf(raw == nil || raw!.isEmpty, "Requires disposable accounts and independent browser guest sessions.")
        let data = raw!.hasPrefix("{") ? Data(raw!.utf8) : try Data(contentsOf: URL(fileURLWithPath: raw!))
        fixture = try JSONDecoder().decode(Fixture.self, from: data)
        XCTAssertEqual(Set(fixture.accounts.map(\.role)), Set(["owner", "peer1", "peer2", "peer3", "peer4", "peer5"]))
        XCTAssertEqual(Set(fixture.mixedGuests.map(\.role)), Set(["guestA", "guestB", "guestC"]))
        addTeardownBlock { [self] in MainActor.assumeIsolated { app?.terminate() } }
    }

    private func account(_ role: String) -> Account { fixture.accounts.first { $0.role == role }! }
    private func name(_ role: String) -> String { people.first { $0.role == role }!.name }
    private func launch(_ role: String) {
        app?.terminate(); app = XCUIApplication(bundleIdentifier: fixture.bundle)
        app.launchArguments = ["--ui-testing-signed-out", "--ui-testing-ephemeral-credentials", "--ui-testing-skip-tutorial",
            "--ui-testing-language=zh-Hans", "--ui-testing-appearance=light", "-UIPreferredContentSizeCategoryName", "UICTContentSizeCategoryL"]
        app.launchEnvironment = [:]; app.launch()
        let user = account(role), identifier = app.textFields["login-identifier"]
        XCTAssertTrue(identifier.waitForExistence(timeout: 25)); identifier.tap(); identifier.typeText(user.identifier)
        let password = app.secureTextFields["login-password"]
        password.tap(); password.typeText(user.password); app.buttons["login-submit"].tap()
        XCTAssertTrue(app.tabBars.firstMatch.waitForExistence(timeout: 35))
    }
    private func openListCard(confirmed: Bool = false) {
        app.tabBars.buttons["计划"].tap()
        if confirmed { app.buttons["plans-tab-upcoming"].tap() }
        let card = app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH 'plans-coordinated-' AND label CONTAINS %@", fixture.title)).firstMatch
        XCTAssertTrue(card.waitForExistence(timeout: 25)); card.tap(); verifyTitle()
    }
    private func openChatCard(role: String) {
        app.tabBars.buttons["消息"].tap()
        let connection = fixture.connections.first { $0.peerRole == role }!
        let row = app.buttons["inbox-row-\(connection.connectionID)"]
        XCTAssertTrue(row.waitForExistence(timeout: 25)); row.tap()
        let card = app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH 'shared-plan-card-'"))
            .containing(.staticText, identifier: fixture.title).firstMatch
        XCTAssertTrue(card.waitForExistence(timeout: 25)); XCTAssertTrue(card.staticTexts["填写我的空闲"].exists)
        card.tap(); verifyTitle()
    }
    private func verifyTitle() {
        let title = app.staticTexts["time-poll-detail-title"]
        XCTAssertTrue(title.waitForExistence(timeout: 25)); XCTAssertEqual(title.label, fixture.title)
    }
    private func selectCommonAvailability() {
        let first = app.buttons["time-poll-cell-0"], second = app.buttons["time-poll-cell-2"]
        XCTAssertTrue(first.waitForExistence(timeout: 20)); first.tap(); second.tap()
        XCTAssertTrue(first.isSelected && second.isSelected)
    }
    private func rosterRow(_ role: String) -> XCUIElement {
        app.descendants(matching: .any).matching(NSPredicate(format: "identifier BEGINSWITH 'unified-plan-person-' AND label CONTAINS %@", name(role))).firstMatch
    }
    private func waitForRoster(role: String, status: String) {
        wait(rosterRow(role), matching: "exists == true AND label CONTAINS %@", arguments: [status], timeout: 90)
    }
    private func verifyRoster(accepted: Set<String>, declined: Set<String>, stage: String) {
        let roster = app.descendants(matching: .any)["unified-plan-inline-people"].firstMatch
        XCTAssertTrue(roster.waitForExistence(timeout: 20))
        XCTAssertEqual(roster.descendants(matching: .any).matching(NSPredicate(format: "identifier BEGINSWITH 'unified-plan-person-'" )).count, 6)
        let scroll = app.scrollViews["unified-plan-confirmation-scroll"]
        let footer = app.buttons["unified-plan-publish"].exists ? app.buttons["unified-plan-publish"]
            : app.buttons["plan-view-calendar"].exists ? app.buttons["plan-view-calendar"] : app.buttons["unified-plan-accept"]
        for person in people {
            let row = rosterRow(person.role)
            let expected = accepted.contains(person.role) ? "已接受" : declined.contains(person.role) ? "已拒绝" : "待确认"
            XCTAssertTrue(row.label.contains(expected), row.label)
            reveal(row, in: scroll, above: footer.frame.minY - 8); capture("roster-\(stage)-\(person.role)")
        }
        reveal(app.staticTexts["time-poll-detail-title"], in: scroll, above: footer.frame.minY - 8)
    }
    private func verifyInvitedTimetable() {
        let cells = app.descendants(matching: .any).matching(NSPredicate(format: "identifier BEGINSWITH 'plan-invitation-cell-'"))
        XCTAssertGreaterThanOrEqual(cells.count, 4)
        XCTAssertGreaterThanOrEqual(cells.allElementsBoundByIndex.filter(\.isSelected).count, 2)
        XCTAssertEqual(app.descendants(matching: .any).matching(identifier: "plan-invitation-legend").count, 1)
    }
    private func verifyCalendar(role: String, required: Set<String>, absent: Set<String>) {
        tap(app.buttons["plan-view-calendar"])
        XCTAssertTrue(app.tabBars.buttons["日历"].isSelected)
        let result = searchCalendar(); XCTAssertTrue(result.waitForExistence(timeout: 25))
        XCTAssertEqual(app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH 'calendar-search-result-' AND label CONTAINS %@", fixture.title)).count, 1)
        capture("calendar-\(role)-unique-result"); result.tap()
        XCTAssertTrue(app.descendants(matching: .any)["calendar-readonly-detail"].firstMatch.waitForExistence(timeout: 15))
        let list = app.collectionViews.firstMatch.exists ? app.collectionViews.firstMatch : app.tables.firstMatch
        XCTAssertTrue(list.waitForExistence(timeout: 10))
        let start = app.descendants(matching: .any)["calendar-detail-start"].firstMatch
        let end = app.descendants(matching: .any)["calendar-detail-end"].firstMatch
        XCTAssertTrue(start.label.contains("09:00"), start.label); XCTAssertTrue(end.label.contains("10:00"), end.label)
        let location = app.descendants(matching: .any)["calendar-detail-location"].firstMatch
        reveal(location, in: list); XCTAssertTrue(location.label.contains(fixture.location), location.label)
        for member in required.sorted() {
            let text = app.staticTexts[name(member)]
            reveal(text, in: list); capture("calendar-\(role)-accepted-\(member)")
        }
        for member in absent { XCTAssertFalse(app.staticTexts[name(member)].exists, "Unaccepted or withdrawn person must not be a Calendar companion: \(member)") }
        let manage = app.buttons["calendar-manage-plan"]
        reveal(manage, in: list); tap(manage)
        XCTAssertTrue(app.staticTexts["unified-plan-confirmation-count"].waitForExistence(timeout: 20))
        XCTAssertTrue(app.buttons["plan-view-calendar"].exists)
    }
    private func verifyCalendarAbsent(role: String) {
        app.tabBars.buttons["日历"].tap()
        let result = searchCalendar()
        XCTAssertTrue(app.descendants(matching: .any)["calendar-search-empty"].firstMatch.waitForExistence(timeout: 25))
        XCTAssertTrue(result.waitForNonExistence(timeout: 15)); capture("calendar-\(role)-absent")
    }
    private func searchCalendar() -> XCUIElement {
        tap(app.buttons["calendar-search"])
        let field = app.searchFields.firstMatch
        XCTAssertTrue(field.waitForExistence(timeout: 10)); field.tap(); field.typeText(fixture.title)
        return app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH 'calendar-search-result-' AND label CONTAINS %@", fixture.title)).firstMatch
    }
    private func reveal(_ element: XCUIElement, in scroll: XCUIElement, above bottom: CGFloat? = nil) {
        // SwiftUI List materializes its later Calendar details only after scrolling.
        for _ in 0..<10 where !element.exists { scroll.swipeUp(velocity: .slow) }
        XCTAssertTrue(element.waitForExistence(timeout: 15))
        let lower = max(scroll.frame.minY, app.navigationBars.firstMatch.frame.maxY + 2)
        // Calendar details cover the root TabBar; its retained AX frame does not clip
        // the sheet's visible List. Other surfaces retain their existing footer boundary.
        let calendarDetail = app.descendants(matching: .any)["calendar-readonly-detail"].firstMatch
        let viewportBottom = calendarDetail.exists ? app.frame.maxY
            : app.tabBars.firstMatch.exists ? app.tabBars.firstMatch.frame.minY : app.frame.maxY
        let upper = bottom ?? min(scroll.frame.maxY, viewportBottom)
        for _ in 0..<28 {
            if element.isHittable && element.frame.minY >= lower && element.frame.maxY <= upper { break }
            let distance = min(CGFloat(180), max(CGFloat(48), element.frame.minY < lower ? lower - element.frame.minY : element.frame.maxY - upper))
            let startY = min(upper - 30, max(lower + 30, (lower + upper) / 2)), origin = app.coordinate(withNormalizedOffset: .zero)
            origin.withOffset(CGVector(dx: 24, dy: startY)).press(forDuration: 0.05,
                thenDragTo: origin.withOffset(CGVector(dx: 24, dy: startY + (element.frame.minY < lower ? distance : -distance))))
        }
        XCTAssertTrue(element.isHittable, element.identifier)
        XCTAssertGreaterThanOrEqual(element.frame.minY, lower, element.identifier)
        XCTAssertLessThanOrEqual(element.frame.maxY, upper, element.identifier)
    }
    private func tap(_ button: XCUIElement) {
        XCTAssertTrue(button.waitForExistence(timeout: 20)); XCTAssertTrue(button.isHittable, button.identifier)
        XCTAssertGreaterThanOrEqual(button.frame.height, 43.99, button.identifier); XCTAssertTrue(button.isEnabled); button.tap()
    }
    private func wait(_ element: XCUIElement, matching format: String, arguments: [Any] = [], timeout: TimeInterval = 25) {
        let predicate = NSPredicate(format: format, argumentArray: arguments)
        XCTAssertEqual(XCTWaiter.wait(for: [XCTNSPredicateExpectation(predicate: predicate, object: element)], timeout: timeout), .completed)
    }
    private func phase(_ value: String) { print("PLAN_MIXED_PHASE \(value)"); fflush(stdout); Thread.sleep(forTimeInterval: 3) }
    private func capture(_ name: String) {
        let image = XCTAttachment(screenshot: app.screenshot())
        image.name = "plan-mixed-" + name; image.lifetime = .keepAlways; add(image)
    }
}
