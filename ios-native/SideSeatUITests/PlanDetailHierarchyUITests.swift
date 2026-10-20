import XCTest

/// Product actions are performed on the phone; the Mac observes the real API between stages.
@MainActor final class PlanDetailHierarchyUITests: XCTestCase {
    private struct Account: Decodable { let role: String; let accessToken: String; let identifier: String; let password: String }
    private struct Fixture: Decodable {
        let title: String; let editedTitle: String; let topic: String; let bundle: String
        let pollToken: String; let activityToken: String; let peerID: String
        let accounts: [Account]
    }
    private var app: XCUIApplication!
    private var fixture: Fixture!

    override func setUpWithError() throws {
        continueAfterFailure = false
        let raw = ProcessInfo.processInfo.environment["SIDESEAT_PLAN_HIERARCHY_JSON"]
        try XCTSkipIf(raw == nil, "Requires fresh disposable plan hierarchy accounts.")
        fixture = try JSONDecoder().decode(Fixture.self, from: Data(raw!.utf8))
    }
    override func tearDown() { app?.terminate() }

    private func launch(_ role: String, token: String? = nil, large: Bool = false, actualAccount: Bool = false) {
        app?.terminate(); app = XCUIApplication(bundleIdentifier: fixture.bundle)
        app.launchArguments = [actualAccount ? "--ui-testing-signed-out" : "--ui-testing-authenticated", "--ui-testing-ephemeral-credentials", "--ui-testing-skip-tutorial",
            "--ui-testing-time-poll-live", "--ui-testing-language=zh-Hans", "--ui-testing-appearance=\(large ? "dark" : "light")"]
        if large { app.launchArguments += ["--ui-testing-dynamic-type-accessibility"] }
        if let token, !actualAccount { app.launchArguments += ["--ui-testing-deep-link=/time-polls/\(token)"] }
        let account = fixture.accounts.first { $0.role == role }!
        app.launchEnvironment = actualAccount ? [:] : ["SIDESEAT_QA_ACCESS_TOKEN": account.accessToken]
        app.launch()
        if actualAccount {
            let identifier = app.textFields["login-identifier"]
            XCTAssertTrue(identifier.waitForExistence(timeout: 20)); identifier.tap(); identifier.typeText(account.identifier)
            app.secureTextFields["login-password"].tap(); app.secureTextFields["login-password"].typeText(account.password)
            app.buttons["login-submit"].tap()
            XCTAssertTrue(app.tabBars.firstMatch.waitForExistence(timeout: 30))
            app.tabBars.buttons["计划"].tap()
            let card = app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH 'plans-coordinated-' AND (label CONTAINS %@ OR label CONTAINS %@)", fixture.title, fixture.editedTitle)).firstMatch
            XCTAssertTrue(card.waitForExistence(timeout: 20)); reveal(card); card.tap()
        }
        if token != nil { XCTAssertTrue(app.staticTexts["time-poll-detail-title"].waitForExistence(timeout: 25)) }
        else { XCTAssertTrue(app.tabBars.firstMatch.waitForExistence(timeout: 25)) }
    }

    func testInformationDraftShareInvitationAndCalendar() {
        launch("owner", token: fixture.pollToken, actualAccount: true)
        XCTAssertFalse(app.buttons["plan-activity-open-ideas"].exists)
        XCTAssertTrue(app.buttons["plan-share-open"].isHittable)
        var first = app.buttons["time-poll-cell-0"], second = app.buttons["time-poll-cell-2"]
        reveal(second); first.tap(); second.tap()
        reveal(app.buttons["plan-edit-information"], down: true); app.buttons["plan-edit-information"].tap()
        let title = app.textFields["plan-edit-title"]
        XCTAssertTrue(title.waitForExistence(timeout: 10)); replace(title, fixture.editedTitle)
        replace(app.textFields["plan-edit-location"], "图书馆二楼\n")
        capture("information-editor")
        app.buttons["plan-edit-save"].tap()
        XCTAssertTrue(title.waitForNonExistence(timeout: 20))
        XCTAssertEqual(app.staticTexts["time-poll-detail-title"].label, fixture.editedTitle)
        reveal(app.buttons["time-poll-edit-name"]); app.buttons["time-poll-edit-name"].tap()
        let name = app.textFields["time-poll-edit-name-field"]
        XCTAssertTrue(name.waitForExistence(timeout: 10)); replace(name, "Host Ming\n")
        capture("nickname-editor"); app.buttons["plan-nickname-save"].tap()
        XCTAssertTrue(name.waitForNonExistence(timeout: 10))
        XCTAssertEqual(app.staticTexts["plan-my-nickname"].label, "Host Ming")
        reveal(second); XCTAssertTrue(first.isSelected && second.isSelected)
        XCTAssertEqual(app.staticTexts["time-poll-save-state"].label, "未提交")
        phase("details-draft"); capture("detail-draft-kept")

        app.buttons["plan-share-open"].tap()
        XCTAssertTrue(app.buttons["plan-invite-contacts"].waitForExistence(timeout: 10))
        XCTAssertTrue(app.buttons["plan-copy-link"].exists); capture("share-actions")
        app.buttons["plan-invite-contacts"].tap()
        let contact = app.buttons["plan-contact-\(fixture.peerID)"]
        XCTAssertTrue(contact.waitForExistence(timeout: 15)); contact.tap()
        app.buttons["plan-contact-send"].tap()
        XCTAssertTrue(app.buttons["plan-invite-contacts"].waitForExistence(timeout: 20))
        app.navigationBars.buttons["完成"].tap()
        reveal(second); XCTAssertTrue(first.isSelected && second.isSelected)
        phase("contacts-delivered")
        app.buttons["time-poll-submit"].tap()
        XCTAssertTrue(app.staticTexts["time-poll-saved"].waitForExistence(timeout: 20)); phase("owner-submitted")
        reveal(app.buttons["plan-people-open"], down: true); app.buttons["plan-people-open"].tap()
        XCTAssertTrue(app.descendants(matching: .any)["plan-people-list"].waitForExistence(timeout: 10))
        XCTAssertTrue(app.staticTexts["Host Ming"].exists); capture("availability-people")
        app.buttons["plan-people-done"].tap()

        launch("participant", token: fixture.pollToken, actualAccount: true)
        first = app.buttons["time-poll-cell-0"]; second = app.buttons["time-poll-cell-2"]
        reveal(second); first.tap(); second.tap(); app.buttons["time-poll-submit"].tap()
        XCTAssertTrue(app.staticTexts["time-poll-saved"].waitForExistence(timeout: 20)); phase("peer-submitted")
        XCTAssertFalse(app.buttons["plan-edit-information"].exists)
        XCTAssertFalse(app.buttons["unified-plan-invite-window"].exists)

        launch("owner", token: fixture.pollToken, actualAccount: true)
        first = app.buttons["time-poll-cell-0"]; second = app.buttons["time-poll-cell-2"]
        reveal(app.buttons["unified-plan-invite-window"]); app.buttons["unified-plan-invite-window"].tap()
        XCTAssertTrue(app.navigationBars["选择最终时间"].waitForExistence(timeout: 10))
        reveal(second); first.tap(); second.tap(); capture("final-time-selection")
        let chosen = app.staticTexts["time-poll-final-range"].label
        app.buttons["unified-plan-review-roster"].tap()
        XCTAssertTrue(app.navigationBars["核对邀请"].waitForExistence(timeout: 10)); capture("review-invitation")
        app.buttons["unified-plan-adjust-time"].tap()
        XCTAssertTrue(app.staticTexts["time-poll-final-range"].waitForExistence(timeout: 10))
        XCTAssertEqual(app.staticTexts["time-poll-final-range"].label, chosen)
        app.buttons["unified-plan-review-roster"].tap(); app.buttons["unified-plan-send-invitations"].tap()
        XCTAssertTrue(app.buttons["unified-plan-publish"].waitForExistence(timeout: 20)); phase("invited")
        capture("organizer-awaiting-replies")

        launch("participant", token: fixture.pollToken, actualAccount: true)
        XCTAssertTrue(app.buttons["unified-plan-accept"].waitForExistence(timeout: 20)); capture("participant-invitation")
        app.buttons["unified-plan-accept"].tap()
        XCTAssertTrue(app.staticTexts["unified-plan-accepted-status"].waitForExistence(timeout: 20)); phase("accepted")
        launch("owner", token: fixture.pollToken, actualAccount: true)
        app.buttons["unified-plan-publish"].tap()
        let publish = app.buttons.matching(NSPredicate(format: "label == %@ AND identifier != %@", "正式发出", "unified-plan-publish")).firstMatch
        XCTAssertTrue(publish.waitForExistence(timeout: 10)); publish.tap()
        XCTAssertTrue(app.buttons["plan-view-calendar"].waitForExistence(timeout: 20)); phase("published")
        capture("confirmed-arrangement")
        app.buttons["time-poll-menu"].tap(); app.buttons["取消计划"].tap()
        XCTAssertTrue(app.buttons["保留计划"].waitForExistence(timeout: 10)); capture("cancel-confirmation")
        app.buttons["保留计划"].tap()
        app.buttons["plan-view-calendar"].tap()
        XCTAssertTrue(app.tabBars.buttons["日历"].isSelected); phase("calendar")
    }

    func testActivityIdeasStayInlineAndInvitationChoiceSurvivesBack() {
        launch("owner", token: fixture.activityToken)
        let toggle = app.buttons["plan-activity-open-ideas"]
        XCTAssertTrue(toggle.isHittable); XCTAssertTrue(toggle.label.contains("活动待定"))
        toggle.tap(); app.buttons["plan-activity-suggest"].tap()
        XCTAssertTrue(app.navigationBars["共同计划"].exists)
        let idea = app.textFields["plan-activity-title"]
        XCTAssertTrue(idea.waitForExistence(timeout: 10)); idea.tap(); idea.typeText("一起散步\n")
        reveal(app.buttons["plan-activity-add"]); capture("inline-idea-input")
        app.buttons["plan-activity-add"].tap(); XCTAssertTrue(idea.waitForNonExistence(timeout: 20))
        let interests = app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH 'plan-activity-interest-'"))
        XCTAssertEqual(interests.count, 3); reveal(interests.firstMatch); interests.firstMatch.tap()
        phase("inline-idea"); capture("inline-ideas-in-title")
        reveal(toggle, down: true); toggle.tap()
        XCTAssertFalse(app.buttons["plan-activity-choose"].exists)
        reveal(app.buttons["unified-plan-invite-window"]); app.buttons["unified-plan-invite-window"].tap()
        let cell = app.buttons["time-poll-cell-0"]
        reveal(cell); cell.tap(); app.buttons["unified-plan-review-roster"].tap()
        let choice = app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH 'unified-plan-activity-' ")).firstMatch
        XCTAssertTrue(choice.waitForExistence(timeout: 10)); choice.tap()
        let choiceID = choice.identifier
        app.buttons["unified-plan-adjust-time"].tap(); app.buttons["unified-plan-review-roster"].tap()
        XCTAssertEqual(app.buttons[choiceID].value as? String, "已选择")
        capture("activity-choice-on-existing-review")
    }

    func testDarkLargestTextKeepsEditorsAndShareReachable() {
        launch("owner", token: fixture.activityToken, large: true)
        let toggle = app.buttons["plan-activity-open-ideas"]
        reveal(toggle); toggle.tap()
        let suggest = app.buttons["plan-activity-suggest"]
        reveal(suggest); suggest.tap()
        let field = app.textFields["plan-activity-title"]
        reveal(field); field.tap(); field.typeText("一起运动\n")
        reveal(app.buttons["plan-activity-add"]); XCTAssertTrue(app.buttons["plan-activity-add"].isHittable)
        capture("inline-ideas-dark-largest-text")
        app.buttons["取消"].tap()
        reveal(app.buttons["plan-edit-information"], down: true); app.buttons["plan-edit-information"].tap()
        XCTAssertTrue(app.buttons["plan-edit-save"].isHittable)
        XCTAssertLessThanOrEqual(app.buttons["plan-edit-save"].frame.maxY, app.frame.maxY)
        capture("information-dark-largest-text"); app.navigationBars.buttons["取消"].tap()
        app.buttons["plan-share-open"].tap()
        let copy = app.buttons["plan-copy-link"]
        reveal(copy); XCTAssertTrue(copy.isHittable); capture("share-dark-largest-text")
    }

    private func replace(_ field: XCUIElement, _ value: String) {
        field.tap(); field.typeKey("a", modifierFlags: .command); field.typeText(value)
    }
    private func reveal(_ element: XCUIElement, down: Bool = false) {
        XCTAssertTrue(element.waitForExistence(timeout: 15))
        for _ in 0..<14 where !element.isHittable { if down { app.swipeDown() } else { app.swipeUp() } }
        XCTAssertTrue(element.isHittable)
    }
    private func phase(_ label: String) { print("PLAN_HIERARCHY_PHASE \(label)"); Thread.sleep(forTimeInterval: 3) }
    private func capture(_ name: String) {
        let attachment = XCTAttachment(screenshot: app.screenshot()); attachment.name = "plans153-" + name
        attachment.lifetime = .keepAlways; add(attachment)
    }
}
