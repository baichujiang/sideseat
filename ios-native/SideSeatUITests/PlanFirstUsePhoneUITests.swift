import XCTest

/// One continuous real App → Safari → App → Safari → Calendar journey.
/// The Mac creates/checks the disposable account; the runner performs no HTTP calls.
@MainActor final class PlanFirstUsePhoneUITests: XCTestCase {
    private struct Fixture: Decodable {
        let identifier: String
        let password: String
        let title: String
        let bundle: String
    }
    private var app: XCUIApplication!
    private let safari = XCUIApplication(bundleIdentifier: "com.apple.mobilesafari")

    override func setUpWithError() throws { continueAfterFailure = false }

    func testFirstVisitCreateShareFillInviteConfirmAndCalendar() throws {
        let raw = ProcessInfo.processInfo.environment["SIDESEAT_FIRST_PLAN_PHONE_JSON"]
        try XCTSkipIf(raw == nil || raw!.isEmpty, "Requires a fresh disposable phone account from the Mac.")
        let fixture = try JSONDecoder().decode(Fixture.self, from: Data(raw!.utf8))
        app = XCUIApplication(bundleIdentifier: fixture.bundle)
        addTeardownBlock { [self] in MainActor.assumeIsolated { app.terminate() } }
        app.launchArguments = ["--ui-testing-signed-out", "--ui-testing-ephemeral-credentials",
            "--ui-testing-skip-tutorial", "--ui-testing-language=zh-Hans", "--ui-testing-appearance=light"]
        app.launch()
        let identifier = app.textFields["login-identifier"]
        XCTAssertTrue(identifier.waitForExistence(timeout: 20))
        identifier.tap(); identifier.typeText(fixture.identifier)
        let password = app.secureTextFields["login-password"]
        password.tap(); password.typeText(fixture.password)
        app.buttons["login-submit"].tap()
        XCTAssertTrue(app.tabBars.firstMatch.waitForExistence(timeout: 30))
        app.tabBars.buttons["计划"].tap()
        let create = app.buttons["plans-create-primary"]
        XCTAssertTrue(create.waitForExistence(timeout: 25)); XCTAssertTrue(create.isHittable)
        capture(app, "01-first-visit")
        create.tap()
        let title = app.textFields["time-poll-title"]
        XCTAssertTrue(title.waitForExistence(timeout: 10))
        XCTAssertFalse(app.buttons["plan-start-known-activity"].exists)
        XCTAssertFalse(app.buttons["plan-create-next"].exists)
        capture(app, "02-single-form")
        title.tap(); title.typeText(fixture.title + "\n")
        let submit = app.buttons["time-poll-create-confirm"]
        XCTAssertTrue(submit.isHittable); XCTAssertTrue(submit.isEnabled)
        capture(app, "03-create"); submit.tap()
        XCTAssertTrue(app.buttons["time-poll-cell-0"].waitForExistence(timeout: 25))
        phase("created-empty")
        app.buttons["time-poll-cell-0"].tap(); app.buttons["time-poll-cell-2"].tap()
        nativeWaitSaved(); phase("created-and-saved")
        app.buttons["plan-share-open"].tap()
        let share = app.buttons["plan-share-primary"]
        XCTAssertTrue(share.waitForExistence(timeout: 10)); share.tap()
        let copyLabels = NSPredicate(format: "label IN %@", ["Copy", "拷贝", "复制"])
        let copyCell = app.cells.matching(copyLabels).firstMatch
        let copy = copyCell.waitForExistence(timeout: 3) ? copyCell : app.buttons.matching(copyLabels).firstMatch
        XCTAssertTrue(copy.waitForExistence(timeout: 10)); capture(app, "05-system-share"); copy.tap()
        let copyLink = app.buttons["plan-copy-link"]
        XCTAssertTrue(copyLink.waitForExistence(timeout: 10)); copyLink.tap()
        XCTAssertEqual(copyLink.label, "链接已复制")
        app.navigationBars.buttons["完成"].tap()

        // Start a fresh Safari automation session while retaining its tabs and website data.
        safari.terminate()
        safari.launch()
        let done = safari.buttons.matching(NSPredicate(format: "label IN %@", ["Done", "完成"])).firstMatch
        if done.exists { done.tap() }
        let address = safari.textFields["TabBarItemTitle"]
        if !address.exists { safari.swipeDown() }
        XCTAssertTrue(address.waitForExistence(timeout: 10)); address.tap()
        let input = safari.textFields.firstMatch
        input.typeKey("a", modifierFlags: .command)
        input.typeKey("v", modifierFlags: .command)
        // Cross-app paste consent belongs to SpringBoard, not Safari's hierarchy.
        let allowPaste = XCUIApplication(bundleIdentifier: "com.apple.springboard").buttons.matching(NSPredicate(format: "label IN %@", ["Allow Paste", "允许粘贴"])).firstMatch
        if allowPaste.waitForExistence(timeout: 3) { allowPaste.tap() }
        let copiedURL = try XCTUnwrap(input.value as? String)
        XCTAssertTrue(copiedURL.contains("sideseat.de/"), "Use the actual link copied from the newly created plan")
        let webURL = copiedURL.replacingOccurrences(of: "https://sideseat.de/", with: "https://www.sideseat.de/")
        replace(input, with: webURL + "\n")
        let name = safari.webViews.textFields.firstMatch
        XCTAssertTrue(name.waitForExistence(timeout: 30))
        XCTAssertTrue(safari.staticTexts[fixture.title].exists, "The copied link must open the newly created plan")
        name.tap(); name.typeText("Guest Lin")
        webButton("Next: choose my free time", "下一步：选择我的空闲").tap()
        let first = safari.switches.matching(NSPredicate(format: "label CONTAINS %@", ", 09:00")).firstMatch
        let second = safari.switches.matching(NSPredicate(format: "label CONTAINS %@", ", 09:30")).firstMatch
        XCTAssertTrue(first.waitForExistence(timeout: 20))
        for _ in 0..<3 where !second.isHittable { safari.swipeUp() }
        let nextStep = safari.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", "填写空闲不代表确认参加")).firstMatch
        XCTAssertTrue(nextStep.waitForExistence(timeout: 10))
        XCTAssertFalse(webButton("Save and continue", "保存并继续").exists)
        XCTAssertLessThan(second.frame.maxY, nextStep.frame.minY, "Name submission must reveal the time cells above the fixed save bar")
        capture(safari, "06a-guest-editor")
        first.tap(); second.tap()
        let third = safari.switches.matching(NSPredicate(format: "label CONTAINS %@", ", 10:00")).firstMatch
        let fourth = safari.switches.matching(NSPredicate(format: "label CONTAINS %@", ", 10:30")).firstMatch
        for cell in [third, fourth] { revealWebTimeCell(cell, above: nextStep); cell.tap(); waitWebSelection(cell, selected: true) }
        for cell in [first, second, third, fourth] { waitWebSelection(cell, selected: true) }
        third.tap(); waitWebSelection(third, selected: false)
        fourth.tap(); waitWebSelection(fourth, selected: false)
        waitWebSelection(first, selected: true); waitWebSelection(second, selected: true)
        webWaitSaved()
        capture(safari, "06-guest-saved"); phase("guest-saved")
        XCTAssertTrue(first.exists, "Autosave must keep the same editable timetable visible")
        XCTAssertTrue(nextStep.exists)
        XCTAssertFalse(webButton("View responses", "看大家填写").exists)
        capture(safari, "07-guest-results")

        app.activate()
        let responses = app.buttons["plan-people-open"]
        wait(responses, labelContains: "2 人已填写")
        wait(app.buttons["time-poll-cell-0"], labelContains: ", 2")
        reviewFinalHour()
        let send = app.buttons["unified-plan-send-invitations"]
        capture(app, "09-review-invitation"); send.tap()
        let count = app.staticTexts["unified-plan-confirmation-count"]
        wait(count, labelContains: "1/2 人已确认")
        let finalStatus = app.descendants(matching: .any)["unified-plan-phase"].firstMatch
        XCTAssertTrue(finalStatus.label.contains("待你正式发出"))
        capture(app, "10-awaiting-confirmation"); phase("awaiting-confirmation")

        safari.activate()
        let accept = webButton("Confirm participation", "确认参加")
        XCTAssertTrue(accept.waitForExistence(timeout: 35))
        XCTAssertFalse(safari.staticTexts["受邀时间表"].exists)
        let invited = safari.staticTexts.matching(NSPredicate(format: "label == %@", "受邀时段")).firstMatch
        XCTAssertTrue(invited.waitForExistence(timeout: 15)); activityRevealWeb(invited); invited.tap()
        XCTAssertTrue(accept.isEnabled)
        capture(safari, "11-guest-invitation"); accept.tap()
        XCTAssertTrue(safari.staticTexts.matching(NSPredicate(format: "label IN %@", ["You accepted. Waiting for the organizer.", "你已接受，等待发起人正式发出"])).firstMatch.waitForExistence(timeout: 25))
        capture(safari, "12-guest-accepted")
        app.activate(); wait(count, labelContains: "2/2 人已确认"); phase("accepted-awaiting-publish")
        XCTAssertFalse(app.buttons["plan-view-calendar"].exists)
        let publish = app.buttons["unified-plan-publish"]
        XCTAssertTrue(publish.waitForExistence(timeout: 15)); publish.tap()
        let finalSend = app.buttons.matching(NSPredicate(format: "label == %@ AND identifier != %@", "正式发出", "unified-plan-publish")).firstMatch
        XCTAssertTrue(finalSend.waitForExistence(timeout: 10)); finalSend.tap()
        let calendar = app.buttons["plan-view-calendar"]
        XCTAssertTrue(calendar.waitForExistence(timeout: 15)); capture(app, "13-native-confirmed"); phase("confirmed")
        calendar.tap()
        XCTAssertTrue(app.tabBars.buttons["日历"].isSelected)
        app.buttons["calendar-search"].tap()
        let search = app.searchFields.firstMatch
        XCTAssertTrue(search.waitForExistence(timeout: 10)); search.tap(); search.typeText(fixture.title)
        let result = app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH 'calendar-search-result-' AND label CONTAINS %@", fixture.title)).firstMatch
        XCTAssertTrue(result.waitForExistence(timeout: 20)); capture(app, "14-calendar-search"); result.tap()
        let manage = app.buttons["calendar-manage-plan"]
        for _ in 0..<4 where !manage.isHittable { app.swipeUp() }
        XCTAssertTrue(manage.waitForExistence(timeout: 10)); capture(app, "15-calendar-entry")
        manage.tap(); wait(count, labelContains: "2/2 人已确认")
        capture(app, "16-calendar-to-plan"); phase("calendar-verified")
    }

    func testActivityIdeasNativeAndWebContinueIntoPlan() throws {
        let raw = ProcessInfo.processInfo.environment["SIDESEAT_ACTIVITY_PLAN_JSON"]
        try XCTSkipIf(raw == nil || raw!.isEmpty, "Requires fresh activity-plan accounts.")
        let fixture = try JSONDecoder().decode(NativeFixture.self, from: Data(raw!.utf8))
        let owner = try XCTUnwrap(fixture.accounts.first { $0.role == "owner" })
        let peer = try XCTUnwrap(fixture.accounts.first { $0.role == "participant" })
        addTeardownBlock { [self] in MainActor.assumeIsolated { app?.terminate() } }
        nativeSignIn(owner, bundle: fixture.bundle)
        app.tabBars.buttons["计划"].tap(); app.buttons["plans-create-primary"].tap()
        XCTAssertTrue(app.buttons["plan-start-together"].waitForExistence(timeout: 10))
        app.buttons["plan-start-together"].tap()
        XCTAssertFalse(app.buttons["plan-mode-fixed"].exists)
        let title = app.textFields["time-poll-title"]
        title.tap(); title.typeText(fixture.title + "\n")
        XCTAssertFalse(app.buttons["plan-create-next"].exists)
        XCTAssertEqual(app.buttons["time-poll-create-confirm"].label, "发起计划")
        capture(app, "activity-01-create"); app.buttons["time-poll-create-confirm"].tap()
        XCTAssertTrue(app.staticTexts["time-poll-response-count"].waitForExistence(timeout: 25))
        XCTAssertTrue(app.buttons["time-poll-cell-0"].exists)
        XCTAssertFalse(app.buttons["plan-activity-show-timetable"].exists)
        XCTAssertFalse(app.buttons["unified-plan-invite-window"].exists)
        XCTAssertFalse(app.buttons["unified-plan-accept"].exists)
        activityPhase("created")
        activitySuggest("Badminton", location: "Campus court")
        activityPhase("owner-suggested"); capture(app, "activity-02-owner-idea")
        app.buttons["plan-copy-link"].tap()

        nativeSignIn(peer, bundle: fixture.bundle)
        app.tabBars.buttons["计划"].tap(); app.buttons["plans-open-link"].tap()
        let link = app.alerts.textFields.firstMatch
        XCTAssertTrue(link.waitForExistence(timeout: 10)); link.tap(); link.typeKey("v", modifierFlags: .command)
        let allow = XCUIApplication(bundleIdentifier: "com.apple.springboard").buttons.matching(NSPredicate(format: "label IN %@", ["Allow Paste", "允许粘贴"])).firstMatch
        if allow.waitForExistence(timeout: 2) { allow.tap() }
        let copiedLink = try XCTUnwrap(link.value as? String)
        app.alerts.buttons["打开"].tap()
        XCTAssertTrue(app.staticTexts["time-poll-response-count"].waitForExistence(timeout: 20))
        activitySuggest("Hotpot", location: "Town centre")
        let interests = app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH 'plan-activity-interest-'"))
        XCTAssertEqual(interests.count, 2)
        activityRevealNative(interests.element(boundBy: 0)); interests.element(boundBy: 0).tap()
        activityWaitEnabled(interests.element(boundBy: 1)); activityRevealNative(interests.element(boundBy: 1)); interests.element(boundBy: 1).tap()
        activityPhase("peer-interested"); capture(app, "activity-03-peer-interests")
        activityRevealNative(app.buttons["plan-activity-collapse"]); app.buttons["plan-activity-collapse"].tap()
        let first = app.buttons["time-poll-cell-0"], second = app.buttons["time-poll-cell-2"]
        XCTAssertTrue(first.waitForExistence(timeout: 15)); activityRevealNative(second); first.tap(); second.tap(); nativeWaitSaved()
        activityPhase("peer-filled")
        // The same live record must stay usable at maximum text size.
        app.terminate()
        app.launchArguments = ["--ui-testing-authenticated", "--ui-testing-ephemeral-credentials", "--ui-testing-skip-tutorial", "--ui-testing-time-poll-live", "--ui-testing-deep-link=\(try XCTUnwrap(URL(string: copiedLink)?.path))", "--ui-testing-language=zh-Hans", "--ui-testing-appearance=dark", "--ui-testing-dynamic-type-accessibility"]
        app.launchEnvironment = ["SIDESEAT_QA_ACCESS_TOKEN": peer.accessToken]
        app.launch()
        XCTAssertTrue(app.staticTexts["time-poll-response-count"].waitForExistence(timeout: 20))
        app.buttons["plan-activity-open-ideas"].tap()
        let largeInterest = app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH 'plan-activity-interest-' ")).firstMatch
        activityRevealNative(largeInterest)
        XCTAssertTrue(largeInterest.isHittable); capture(app, "activity-04-dark-large-ideas")
        let collapse = app.buttons["plan-activity-collapse"]
        activityRevealNative(collapse); collapse.tap()
        let largeFirst = app.buttons["time-poll-cell-0"]
        activityRevealNative(largeFirst)
        XCTAssertTrue(largeFirst.isHittable)
        app.buttons["time-poll-menu"].tap()
        let copy = app.buttons["复制链接"]
        XCTAssertTrue(copy.waitForExistence(timeout: 10)); copy.tap()
        capture(app, "activity-04b-dark-large-timetable")

        activityOpenSafari(copiedLink)
        let guestName = safari.webViews.textFields.firstMatch
        XCTAssertTrue(guestName.waitForExistence(timeout: 25)); guestName.tap(); guestName.typeText("Guest Lin")
        webButton("Join the activity ideas", "加入一起选活动").tap()
        XCTAssertTrue(safari.switches.matching(NSPredicate(format: "label CONTAINS %@", ", 09:00")).firstMatch.waitForExistence(timeout: 20))
        let ideasPanel = safari.buttons.matching(NSPredicate(format: "label BEGINSWITH %@ OR label BEGINSWITH %@", "活动建议", "Activity ideas")).firstMatch
        activityRevealWeb(ideasPanel); ideasPanel.tap()
        let guestTitle = safari.webViews.textFields.firstMatch
        XCTAssertTrue(guestTitle.waitForExistence(timeout: 20))
        activityRevealWeb(guestTitle); guestTitle.tap(); guestTitle.typeText("Exhibition")
        let add = webButton("Add suggestion", "添加提议"); activityRevealWeb(add); add.tap()
        XCTAssertTrue(safari.staticTexts["Exhibition"].waitForExistence(timeout: 15))
        let webLikes = safari.switches.matching(NSPredicate(format: "label CONTAINS %@", "感兴趣"))
        XCTAssertEqual(webLikes.count, 3)
        let likeFirst = webLikes.element(boundBy: 0), likeSecond = webLikes.element(boundBy: 1)
        activityRevealWeb(likeFirst); likeFirst.tap(); activityWaitEnabled(likeSecond); activityRevealWeb(likeSecond); likeSecond.tap()
        activityPhase("guest-interested"); capture(safari, "activity-05-guest-ideas")
        activityRevealWeb(ideasPanel); ideasPanel.tap()
        let webFirst = safari.switches.matching(NSPredicate(format: "label CONTAINS %@", ", 09:00")).firstMatch
        let webSecond = safari.switches.matching(NSPredicate(format: "label CONTAINS %@", ", 09:30")).firstMatch
        XCTAssertTrue(webFirst.waitForExistence(timeout: 20)); activityRevealWeb(webSecond)
        webFirst.tap(); webSecond.tap()
        webWaitSaved()
        activityPhase("guest-filled"); capture(safari, "activity-06-guest-free-time")

        nativeSignIn(owner, bundle: fixture.bundle)
        app.tabBars.buttons["计划"].tap(); nativeOpenCard(expectedStatus: "待你定时间")
        activityRevealNative(second); first.tap(); second.tap(); nativeWaitSaved(); activityPhase("owner-ready")
        app.buttons["unified-plan-invite-window"].tap(); first.tap(); second.tap()
        app.buttons["unified-plan-review-roster"].tap()
        XCTAssertFalse(app.buttons["unified-plan-send-invitations"].isEnabled)
        let hotpot = app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH 'unified-plan-activity-' AND label CONTAINS 'Hotpot'")).firstMatch
        XCTAssertTrue(hotpot.waitForExistence(timeout: 15)); hotpot.tap()
        capture(app, "activity-07-choice-draft"); activityPhase("choice-draft")
        app.buttons["unified-plan-adjust-time"].tap()
        XCTAssertEqual(app.staticTexts["time-poll-detail-title"].label, fixture.title)
        app.buttons["unified-plan-review-roster"].tap()
        XCTAssertEqual(hotpot.value as? String, "已选择", "Activity draft survives returning to the timetable")
        capture(app, "activity-08-review-arrangement"); app.buttons["unified-plan-send-invitations"].tap()
        let count = app.staticTexts["unified-plan-confirmation-count"]
        wait(count, labelContains: "1/3 人已确认"); activityPhase("inviting")
        nativeSignIn(peer, bundle: fixture.bundle)
        app.tabBars.buttons["计划"].tap(); nativeOpenCard(expectedStatus: "待你确认")
        XCTAssertTrue(app.buttons["unified-plan-accept"].waitForExistence(timeout: 20))
        capture(app, "activity-09-explicit-invitation"); activityPhase("peer-review")
        app.buttons["unified-plan-accept"].tap(); wait(count, labelContains: "2/3 人已确认"); activityPhase("peer-confirmed")
        safari.activate()
        let confirm = webButton("Confirm participation", "确认参加")
        XCTAssertTrue(confirm.waitForExistence(timeout: 35))
        XCTAssertTrue(safari.staticTexts["受邀时段"].firstMatch.waitForExistence(timeout: 15))
        XCTAssertFalse(safari.staticTexts["受邀时间表"].exists)
        capture(safari, "activity-09b-guest-invitation"); confirm.tap()
        XCTAssertTrue(safari.staticTexts["计划已确定"].waitForExistence(timeout: 25))
        activityPhase("all-confirmed"); capture(safari, "activity-10-guest-confirmed")
        app.activate(); wait(count, labelContains: "3/3 人已确认")
        app.buttons["plan-view-calendar"].tap(); app.buttons["calendar-search"].tap()
        let search = app.searchFields.firstMatch
        XCTAssertTrue(search.waitForExistence(timeout: 10)); search.tap(); search.typeText("Hotpot")
        let result = app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH 'calendar-search-result-' AND label CONTAINS 'Hotpot'")).firstMatch
        XCTAssertTrue(result.waitForExistence(timeout: 20)); result.tap()
        let manage = app.buttons["calendar-manage-plan"]
        for _ in 0..<4 where !manage.isHittable { app.swipeUp() }
        XCTAssertTrue(manage.waitForExistence(timeout: 10)); manage.tap(); wait(count, labelContains: "3/3 人已确认")
        activityPhase("calendar-verified"); capture(app, "activity-11-calendar-return")
    }

    private func activitySuggest(_ title: String, location: String) {
        activityRevealNative(app.buttons["plan-activity-suggest"]); app.buttons["plan-activity-suggest"].tap()
        let field = app.textFields["plan-activity-title"]
        XCTAssertTrue(field.waitForExistence(timeout: 10)); activityRevealNative(field); field.tap(); field.typeText(title)
        let place = app.textFields["plan-activity-location"]; activityRevealNative(place); place.tap(); place.typeText(location + "\n")
        activityRevealNative(app.buttons["plan-activity-add"]); app.buttons["plan-activity-add"].tap()
        XCTAssertTrue(app.staticTexts[title].waitForExistence(timeout: 15))
    }
    private func activityRevealNative(_ element: XCUIElement) {
        XCTAssertTrue(element.waitForExistence(timeout: 15))
        let scroll = app.scrollViews["time-poll-detail-scroll"]
        for _ in 0..<14 where !element.isHittable {
            if element.frame.midY < app.frame.midY { scroll.swipeDown(velocity: .slow) }
            else { scroll.swipeUp(velocity: .slow) }
        }
        XCTAssertTrue(element.isHittable)
    }
    private func activityPhase(_ value: String) { print("ACTIVITY_PLAN_PHASE \(value)"); Thread.sleep(forTimeInterval: 3) }
    private func activityWaitEnabled(_ element: XCUIElement) {
        XCTAssertEqual(XCTWaiter.wait(for: [XCTNSPredicateExpectation(predicate: NSPredicate(format: "enabled == true"), object: element)], timeout: 20), .completed)
    }
    private func activityRevealWeb(_ element: XCUIElement) {
        XCTAssertTrue(element.waitForExistence(timeout: 15))
        for _ in 0..<14 where !element.isHittable {
            if element.frame.midY < safari.frame.midY { safari.swipeDown() } else { safari.swipeUp() }
        }
        XCTAssertTrue(element.isHittable)
    }
    private func revealWebTimeCell(_ cell: XCUIElement, above footer: XCUIElement) {
        XCTAssertTrue(cell.waitForExistence(timeout: 15))
        for _ in 0..<8 where !cell.isHittable || cell.frame.maxY >= footer.frame.minY - 12 {
            let origin = safari.coordinate(withNormalizedOffset: .zero)
            let start = CGPoint(x: cell.frame.midX, y: footer.frame.minY - 40)
            origin.withOffset(CGVector(dx: start.x, dy: start.y)).press(forDuration: 0.05,
                thenDragTo: origin.withOffset(CGVector(dx: start.x, dy: start.y - 100)))
        }
        XCTAssertTrue(cell.isHittable)
        XCTAssertLessThan(cell.frame.maxY, footer.frame.minY - 12, "The time cell must be above the fixed invitation guidance")
    }
    private func waitWebSelection(_ cell: XCUIElement, selected: Bool) {
        let expectation = XCTNSPredicateExpectation(predicate: NSPredicate(format: "value == %@", selected ? "1" : "0"), object: cell)
        XCTAssertEqual(XCTWaiter.wait(for: [expectation], timeout: 10), .completed, "Unexpected web selection: \(cell.label)")
    }
    private func activityOpenSafari(_ raw: String) {
        safari.terminate(); safari.launch()
        let done = safari.buttons.matching(NSPredicate(format: "label IN %@", ["Done", "完成"])).firstMatch
        if done.exists { done.tap() }
        let address = safari.textFields["TabBarItemTitle"]
        if !address.exists { safari.swipeDown() }
        XCTAssertTrue(address.waitForExistence(timeout: 10)); address.tap()
        let url = raw.replacingOccurrences(of: "https://sideseat.de/", with: "https://www.sideseat.de/")
        replace(safari.textFields.firstMatch, with: url + "\n")
    }

    private struct NativeAccount: Decodable {
        let role: String
        let identifier: String
        let password: String
        let accessToken: String
    }
    private struct NativeFixture: Decodable {
        let title: String
        let bundle: String
        let pollToken: String?
        let accounts: [NativeAccount]
    }

    func testActivityCompletionLargestText() throws {
        struct Fixture: Decodable { let bundle: String; let connectionID: String; let accounts: [NativeAccount] }
        let raw = ProcessInfo.processInfo.environment["SIDESEAT_FIXED_ACTIVITY156_JSON"]
        try XCTSkipIf(raw == nil, "Requires the disposable activity plan.")
        let fixture = try JSONDecoder().decode(Fixture.self, from: Data(raw!.utf8))
        let peer = try XCTUnwrap(fixture.accounts.first { $0.role == "participant" })
        addTeardownBlock { [self] in MainActor.assumeIsolated { app?.terminate() } }
        nativeSignIn(peer, bundle: fixture.bundle, accessibility: true)
        app.tabBars.buttons["消息"].tap()
        let row = app.buttons["inbox-row-\(fixture.connectionID)"]
        XCTAssertTrue(row.waitForExistence(timeout: 20)); row.tap()
        let card = app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH 'shared-plan-card-' ")).firstMatch
        XCTAssertTrue(card.waitForExistence(timeout: 20)); card.tap()
        XCTAssertTrue(app.buttons["plan-activity-suggest"].waitForExistence(timeout: 20)); app.buttons["plan-activity-suggest"].tap()
        let field = app.textFields["plan-activity-title"]
        XCTAssertTrue(field.waitForExistence(timeout: 10)); capture(app, "completion181-largest-before-tap")
        let completion = app.buttons["plan-activity-complete-逛展"]
        activityRevealNative(completion); completion.tap()
        XCTAssertEqual(XCTWaiter.wait(for: [XCTNSPredicateExpectation(predicate: NSPredicate(format: "value == %@", "逛展"), object: field)], timeout: 5), .completed)
        capture(app, "completion181-largest-filled")
        activityRevealNative(app.buttons["plan-activity-cancel"]); app.buttons["plan-activity-cancel"].tap()
    }

    func testTimetableActivityIdeasInviteAndCalendar() throws {
        struct FixedFixture: Decodable {
            let title: String; let activityTitle: String; let bundle: String
            let connectionID: String; let peerID: String; let accounts: [NativeAccount]
        }
        let raw = ProcessInfo.processInfo.environment["SIDESEAT_FIXED_ACTIVITY156_JSON"]
        try XCTSkipIf(raw == nil, "Requires disposable accepted contacts.")
        let fixture = try JSONDecoder().decode(FixedFixture.self, from: Data(raw!.utf8))
        let owner = try XCTUnwrap(fixture.accounts.first { $0.role == "owner" })
        let peer = try XCTUnwrap(fixture.accounts.first { $0.role == "participant" })
        addTeardownBlock { [self] in MainActor.assumeIsolated { app?.terminate() } }
        func openPlan() {
            app.tabBars.buttons["计划"].tap()
            let card = app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH 'plans-coordinated-' AND (label CONTAINS %@ OR label CONTAINS %@)", fixture.title, fixture.activityTitle)).firstMatch
            XCTAssertTrue(card.waitForExistence(timeout: 20)); card.tap()
            XCTAssertTrue(app.staticTexts["time-poll-detail-title"].waitForExistence(timeout: 20))
        }
        func openChat() {
            app.tabBars.buttons["消息"].tap()
            let row = app.buttons["inbox-row-\(fixture.connectionID)"]
            XCTAssertTrue(row.waitForExistence(timeout: 20)); row.tap()
            let card = app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH 'shared-plan-card-'")).firstMatch
            XCTAssertTrue(card.waitForExistence(timeout: 20)); card.tap()
            XCTAssertTrue(app.staticTexts["time-poll-detail-title"].waitForExistence(timeout: 20))
        }
        nativeSignIn(owner, bundle: fixture.bundle)
        app.tabBars.buttons["计划"].tap()
        let create = app.buttons["plans-create-primary"]
        XCTAssertTrue(create.waitForExistence(timeout: 20)); create.tap()
        let title = app.textFields["time-poll-title"]
        XCTAssertTrue(title.waitForExistence(timeout: 10)); title.tap(); title.typeText(fixture.title + "\n")
        let location = app.textFields["unified-plan-location"]
        location.tap(); location.typeText("校园\n")
        app.buttons["plan-start-together"].tap()
        XCTAssertTrue(app.buttons["plan-start-together"].isSelected)
        XCTAssertEqual(title.value as? String, fixture.title)
        XCTAssertEqual(location.value as? String, "校园")
        capture(app, "fixed-ideas-create-both-options")
        app.buttons["time-poll-create-confirm"].tap()
        XCTAssertTrue(app.buttons["plan-invite-contacts"].waitForExistence(timeout: 20))
        app.navigationBars.buttons["完成"].tap()
        XCTAssertTrue(app.staticTexts["time-poll-detail-title"].waitForExistence(timeout: 20))
        XCTAssertFalse(app.buttons["time-poll-submit"].isEnabled)
        XCTAssertTrue(app.buttons["time-poll-cell-0"].exists)
        XCTAssertFalse(app.buttons["unified-plan-accept"].exists)
        XCTAssertTrue(app.buttons["plan-activity-suggest"].exists)
        XCTAssertFalse(app.buttons["unified-plan-review-roster"].exists)
        nativePhase("fixed-created"); capture(app, "fixed-ideas-awaiting-activity")
        app.buttons["plan-share-open"].tap()
        app.buttons["plan-invite-contacts"].tap()
        let contact = app.buttons["plan-contact-\(fixture.peerID)"]
        XCTAssertTrue(contact.waitForExistence(timeout: 20)); contact.tap()
        let send = app.buttons["plan-contact-send"]; send.tap()
        XCTAssertTrue(send.waitForNonExistence(timeout: 20))
        app.navigationBars.buttons["完成"].tap()
        nativePhase("fixed-delivered")
        nativeSignIn(peer, bundle: fixture.bundle); openChat()
        XCTAssertFalse(app.buttons["unified-plan-accept"].exists)
        app.buttons["plan-activity-suggest"].tap()
        let quickField = app.textFields["plan-activity-title"]
        XCTAssertTrue(quickField.waitForExistence(timeout: 10))
        XCTAssertFalse(app.buttons["time-poll-submit"].exists)
        let completeHotpot = app.buttons["plan-activity-complete-火锅"]
        XCTAssertTrue(completeHotpot.waitForExistence(timeout: 10)); capture(app, "completion181-options"); completeHotpot.tap()
        XCTAssertEqual(quickField.value as? String, "火锅")
        XCTAssertTrue(app.buttons["plan-activity-add"].isEnabled)
        XCTAssertEqual(app.otherElements.matching(NSPredicate(format: "identifier BEGINSWITH 'plan-activity-idea-' ")).count, 0, "Completion only fills the draft")
        capture(app, "completion181-tap-fill")
        app.buttons["plan-activity-cancel"].tap()
        app.buttons["plan-activity-suggest"].tap()
        XCTAssertTrue(quickField.waitForExistence(timeout: 10)); quickField.tap(); quickField.typeText("羽")
        XCTAssertTrue(app.buttons["plan-activity-complete-羽毛球"].exists)
        XCTAssertFalse(app.buttons["plan-activity-complete-火锅"].exists)
        quickField.typeKey(XCUIKeyboardKey.tab, modifierFlags: [])
        XCTAssertEqual(quickField.value as? String, "羽毛球", "Hardware Tab fills the matching suggestion")
        XCTAssertFalse(app.scrollViews["plan-activity-completions"].exists)
        capture(app, "completion181-tab-fill")
        app.buttons["plan-activity-cancel"].tap()
        for activityTitle in [fixture.activityTitle, "一起逛展", "校园羽毛球", "周末火锅与散步"] {
            app.buttons["plan-activity-suggest"].tap()
            let idea = app.textFields["plan-activity-title"]
            XCTAssertTrue(idea.waitForExistence(timeout: 10)); idea.tap(); idea.typeText(activityTitle)
            let confirm = app.buttons["plan-activity-add"]
            XCTAssertGreaterThan(confirm.frame.midX, app.frame.midX, "Confirm stays on the right of the header")
            capture(app, "ideas179-top-composer")
            confirm.tap()
            XCTAssertTrue(idea.waitForNonExistence(timeout: 20))
        }
        let cards = app.otherElements.matching(NSPredicate(format: "identifier BEGINSWITH 'plan-activity-idea-'"))
        XCTAssertEqual(cards.count, 4)
        let firstCard = cards.element(boundBy: 0), secondCard = cards.element(boundBy: 1)
        XCTAssertEqual(firstCard.frame.minY, secondCard.frame.minY, accuracy: 2)
        XCTAssertGreaterThan(secondCard.frame.minX, firstCard.frame.minX)
        capture(app, "ideas179-two-column-board")
        app.buttons["plan-activity-suggest"].tap()
        let draft = app.textFields["plan-activity-title"]
        XCTAssertTrue(draft.waitForExistence(timeout: 10)); draft.tap(); draft.typeText("取消这条草稿")
        XCTAssertLessThan(draft.frame.minY, firstCard.frame.minY)
        app.buttons["plan-activity-cancel"].tap()
        XCTAssertTrue(draft.waitForNonExistence(timeout: 10)); XCTAssertEqual(cards.count, 4)
        let interest = app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH 'plan-activity-interest-' ")).firstMatch
        interest.tap(); activityWaitEnabled(interest)
        capture(app, "ideas179-interest")
        nativePhase("fixed-suggested"); capture(app, "fixed-ideas-peer-suggestion")
        nativeSignIn(peer, bundle: fixture.bundle, accessibility: true); openChat()
        let largeCards = app.otherElements.matching(NSPredicate(format: "identifier BEGINSWITH 'plan-activity-idea-'"))
        if !largeCards.firstMatch.exists { app.buttons["plan-activity-open-ideas"].tap() }
        let largeFirst = largeCards.element(boundBy: 0), largeSecond = largeCards.element(boundBy: 1)
        XCTAssertTrue(largeSecond.waitForExistence(timeout: 15))
        XCTAssertEqual(largeFirst.frame.minX, largeSecond.frame.minX, accuracy: 2)
        XCTAssertGreaterThan(largeSecond.frame.minY, largeFirst.frame.minY)
        capture(app, "ideas179-largest-single-column")
        app.buttons["plan-activity-suggest"].tap()
        let largeDraft = app.textFields["plan-activity-title"]
        XCTAssertTrue(largeDraft.waitForExistence(timeout: 10))
        XCTAssertFalse(app.buttons["time-poll-submit"].exists)
        let largeCompletion = app.buttons["plan-activity-complete-逛展"]
        activityRevealNative(largeCompletion); largeCompletion.tap()
        XCTAssertEqual(largeDraft.value as? String, "逛展")
        largeDraft.typeText("大字号提议")
        XCTAssertTrue(app.buttons["plan-activity-add"].isHittable)
        XCTAssertTrue(app.buttons["plan-activity-cancel"].isHittable)
        if app.keyboards.firstMatch.exists { XCTAssertLessThanOrEqual(largeDraft.frame.maxY, app.keyboards.firstMatch.frame.minY) }
        capture(app, "ideas179-largest-top-composer")
        app.buttons["plan-activity-cancel"].tap()
        XCTAssertTrue(app.buttons["time-poll-submit"].waitForExistence(timeout: 10))

        nativeSignIn(owner, bundle: fixture.bundle); openPlan()
        app.buttons["unified-plan-invite-window"].tap()
        app.buttons["time-poll-cell-0"].tap(); app.buttons["time-poll-cell-2"].tap()
        assertFinalClock("09:00", "10:00")
        app.buttons["unified-plan-review-roster"].tap()
        let choice = app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH 'unified-plan-activity-' AND label CONTAINS %@", fixture.activityTitle)).firstMatch
        XCTAssertTrue(choice.waitForExistence(timeout: 10))
        XCTAssertFalse(app.buttons["unified-plan-send-invitations"].isEnabled)
        choice.tap()
        XCTAssertTrue(app.staticTexts["校园"].exists)
        XCTAssertTrue(app.buttons["unified-plan-adjust-time"].exists)
        capture(app, "fixed-ideas-review-before-inviting")
        app.buttons["unified-plan-send-invitations"].tap()
        XCTAssertTrue(app.buttons["unified-plan-publish"].waitForExistence(timeout: 20))
        nativePhase("fixed-invited")
        nativeSignIn(peer, bundle: fixture.bundle); openChat()
        XCTAssertTrue(app.buttons["unified-plan-accept"].waitForExistence(timeout: 10))
        app.buttons["unified-plan-accept"].tap()
        XCTAssertTrue(app.staticTexts["unified-plan-accepted-status"].waitForExistence(timeout: 20))
        nativePhase("fixed-accepted"); capture(app, "fixed-ideas-peer-accepted")
        nativeSignIn(owner, bundle: fixture.bundle); openPlan()
        app.buttons["unified-plan-publish"].tap()
        let publish = app.buttons.matching(NSPredicate(format: "label == %@ AND identifier != %@", "正式发出", "unified-plan-publish")).firstMatch
        XCTAssertTrue(publish.waitForExistence(timeout: 10)); publish.tap()
        XCTAssertTrue(app.buttons["plan-view-calendar"].waitForExistence(timeout: 20))
        nativePhase("fixed-published")
        nativeSignIn(peer, bundle: fixture.bundle)
        app.tabBars.buttons["计划"].tap(); app.buttons["plans-tab-upcoming"].tap()
        let confirmed = app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH 'plans-coordinated-' AND label CONTAINS %@", fixture.activityTitle)).firstMatch
        XCTAssertTrue(confirmed.waitForExistence(timeout: 20)); confirmed.tap()
        app.buttons["plan-view-calendar"].tap()
        XCTAssertTrue(app.tabBars.buttons["日历"].isSelected)
        app.buttons["calendar-search"].tap()
        let search = app.searchFields.firstMatch
        XCTAssertTrue(search.waitForExistence(timeout: 10)); search.tap(); search.typeText(fixture.activityTitle)
        XCTAssertTrue(app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH 'calendar-search-result-' AND label CONTAINS %@", fixture.activityTitle)).firstMatch.waitForExistence(timeout: 20))
        nativePhase("fixed-calendar"); capture(app, "fixed-ideas-calendar")
    }

    func testCompactResponseAvatarsOpenAllPeople() throws { try compactResponseAvatars(accessibility: false) }

    func testCompactResponseAvatarsDarkLargestText() throws { try compactResponseAvatars(accessibility: true) }

    func testContinuousInvitationWindows() throws { try invitationWindows(accessibility: false) }

    func testContinuousInvitationWindowsDarkLargestText() throws { try invitationWindows(accessibility: true) }

    private func invitationWindows(accessibility: Bool) throws {
        struct Window: Decodable { let name: String; let token: String; let days: Int }
        struct Fixture: Decodable { let bundle: String; let accounts: [NativeAccount]; let invitationCases: [Window] }
        let raw = ProcessInfo.processInfo.environment["SIDESEAT_PLAN_CONTACTS_JSON"]
        try XCTSkipIf(raw == nil, "Requires disposable invitation layout plans.")
        let fixture = try JSONDecoder().decode(Fixture.self, from: Data(raw!.utf8))
        let owner = try XCTUnwrap(fixture.accounts.first { $0.role == "owner" })
        addTeardownBlock { [self] in MainActor.assumeIsolated { app?.terminate() } }
        for item in fixture.invitationCases {
            app?.terminate(); app = XCUIApplication(bundleIdentifier: fixture.bundle)
            app.launchArguments = ["--ui-testing-authenticated", "--ui-testing-ephemeral-credentials", "--ui-testing-skip-tutorial",
                "--ui-testing-time-poll-live", "--ui-testing-language=zh-Hans", "--ui-testing-appearance=\(accessibility ? "dark" : "light")",
                "--ui-testing-deep-link=/time-polls/\(item.token)"]
            if accessibility { app.launchArguments += ["--ui-testing-dynamic-type-accessibility"] }
            app.launchEnvironment = ["SIDESEAT_QA_ACCESS_TOKEN": owner.accessToken]
            app.launch()
            XCTAssertTrue(app.descendants(matching: .any)["plan-invitation-cell-1"].waitForExistence(timeout: 25))
            XCTAssertFalse(app.staticTexts["受邀时间表"].exists)
            XCTAssertFalse(app.staticTexts["高亮部分表示最终活动时段。"].exists)
            XCTAssertFalse(app.staticTexts["高亮部分是受邀时段。看清时间后，再点击下方「确认参加」。"].exists)
            XCTAssertFalse(app.descendants(matching: .any)["plan-invitation-window-label"].exists)
            let legends = app.descendants(matching: .any).matching(identifier: "plan-invitation-legend")
            XCTAssertEqual(legends.count, item.days, "Each date header explains the highlight color")
            let first = legends.firstMatch
            let footer = app.staticTexts.matching(NSPredicate(format: "label BEGINSWITH %@", "准备好就能正式发出")).firstMatch
            XCTAssertTrue(footer.exists)
            for _ in 0..<12 {
                let top = app.navigationBars.firstMatch.frame.maxY + 12
                let bottom = footer.frame.minY - 12
                if first.frame.minY >= top && first.frame.maxY <= bottom { break }
                let origin = app.coordinate(withNormalizedOffset: .zero)
                let start = min(bottom - 24, app.frame.height * 0.55)
                let delta: CGFloat = first.frame.minY < top ? 140 : -140
                origin.withOffset(CGVector(dx: 35, dy: start)).press(forDuration: 0.05,
                    thenDragTo: origin.withOffset(CGVector(dx: 35, dy: start + delta)))
            }
            XCTAssertTrue(first.isHittable)
            XCTAssertGreaterThan(first.frame.minY, app.navigationBars.firstMatch.frame.maxY)
            XCTAssertLessThan(first.frame.maxY, footer.frame.minY)
            XCTAssertGreaterThan(first.frame.midX, app.frame.midX, "Legend remains on the right of the header")
            capture(app, "invitation-\(item.name)-\(accessibility ? "dark-largest" : "normal")")
            XCTAssertFalse(app.buttons["plan-invitation-cell-1"].exists, "The merged time block remains read-only")
        }
    }

    private func verifyResponseCountSeparatedFromAction(_ expected: String) {
        let count = app.staticTexts["time-poll-response-count"]
        let people = app.buttons["plan-people-open"]
        XCTAssertTrue(count.exists)
        XCTAssertEqual(count.label, expected)
        XCTAssertGreaterThanOrEqual(people.frame.minX - count.frame.maxX, 8,
            "Response count is information outside the avatar button, with visible separation.")
        XCTAssertGreaterThanOrEqual(people.frame.height, 44 - 0.01)
    }

    private func compactResponseAvatars(accessibility: Bool) throws {
        struct CompactFixture: Decodable {
            let compactToken: String
            let compactTitle: String
            let bundle: String
            let accounts: [NativeAccount]
        }
        let raw = ProcessInfo.processInfo.environment["SIDESEAT_PLAN_CONTACTS_JSON"]
        try XCTSkipIf(raw == nil, "Requires a disposable plan with eight submitted responses.")
        let fixture = try JSONDecoder().decode(CompactFixture.self, from: Data(raw!.utf8))
        let owner = try XCTUnwrap(fixture.accounts.first { $0.role == "owner" })
        addTeardownBlock { [self] in MainActor.assumeIsolated { app?.terminate() } }
        nativeSignIn(owner, bundle: fixture.bundle, accessibility: accessibility)
        app.tabBars.buttons["计划"].tap()
        let card = app.buttons["plans-coordinated-\(fixture.compactToken)"]
        XCTAssertTrue(card.waitForExistence(timeout: 20)); card.tap()
        let people = app.buttons["plan-people-open"]
        XCTAssertTrue(people.waitForExistence(timeout: 20)); XCTAssertTrue(people.isHittable)
        for _ in 0..<12 {
            let top = app.navigationBars.firstMatch.frame.maxY + 12
            let bottom = app.staticTexts["time-poll-save-state"].frame.minY - 16
            if people.frame.minY >= top && people.frame.maxY <= bottom { break }
            let origin = app.coordinate(withNormalizedOffset: .zero)
            let start = min(bottom - 24, app.frame.height * 0.55)
            let delta = people.frame.minY < top ? CGFloat(140) : -CGFloat(140)
            origin.withOffset(CGVector(dx: 35, dy: start)).press(forDuration: 0.05,
                thenDragTo: origin.withOffset(CGVector(dx: 35, dy: start + delta)))
        }
        XCTAssertLessThan(people.frame.maxY, app.staticTexts["time-poll-save-state"].frame.minY)
        XCTAssertTrue(people.label.contains("8 人已填写")); XCTAssertTrue(people.label.contains("+5"))
        verifyResponseCountSeparatedFromAction("8 人已填写")
        XCTAssertFalse(app.buttons["time-poll-edit-name"].exists)
        XCTAssertFalse(app.staticTexts["大家的时间表"].exists)
        XCTAssertFalse(app.staticTexts["点选我的空闲，提交后大家可见。"].exists)
        XCTAssertFalse(app.staticTexts["数字仅含已提交人数"].exists)
        let grid = app.descendants(matching: .any)["time-poll-grid"].firstMatch
        XCTAssertTrue(grid.exists)
        XCTAssertLessThanOrEqual(grid.frame.minY - people.frame.maxY, 24)
        XCTAssertGreaterThanOrEqual(app.buttons["unified-plan-invite-window"].frame.height, 44)
        capture(app, accessibility ? "compact-avatars-dark-largest" : "compact-avatars-eight")
        people.tap()
        XCTAssertTrue(app.descendants(matching: .any)["plan-people-list"].waitForExistence(timeout: 10))
        for name in ["林悦", "安然", "Jonas", "小杨", "小陈", "Nora", "Leo", "夏雨"] {
            let person = app.cells.containing(NSPredicate(format: "label CONTAINS %@", name)).firstMatch
            for _ in 0..<6 where !person.isHittable { app.swipeUp() }
            XCTAssertTrue(person.exists, "The complete response list includes \(name)")
        }
        capture(app, accessibility ? "compact-people-dark-largest" : "compact-people-eight")
        app.buttons["plan-people-done"].tap()
        XCTAssertTrue(people.waitForExistence(timeout: 10)); XCTAssertTrue(people.isHittable)
    }

    func testNativeContactCardCreateFillInviteConfirmAndCalendar() throws {
        struct ContactFixture: Decodable {
            let title: String
            let bundle: String
            let connectionID: String
            let peerID: String
            let accounts: [NativeAccount]
        }
        let raw = ProcessInfo.processInfo.environment["SIDESEAT_PLAN_CONTACTS_JSON"]
        try XCTSkipIf(raw == nil, "Requires disposable accepted App contacts.")
        let fixture = try JSONDecoder().decode(ContactFixture.self, from: Data(raw!.utf8))
        let owner = try XCTUnwrap(fixture.accounts.first { $0.role == "owner" })
        let peer = try XCTUnwrap(fixture.accounts.first { $0.role == "participant" })
        addTeardownBlock { [self] in MainActor.assumeIsolated { app?.terminate() } }

        func openListCard() {
            app.tabBars.buttons["计划"].tap()
            let card = app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH 'plans-coordinated-' AND label CONTAINS %@", fixture.title)).firstMatch
            XCTAssertTrue(card.waitForExistence(timeout: 20)); card.tap()
            XCTAssertTrue(app.staticTexts["time-poll-detail-title"].waitForExistence(timeout: 20))
        }
        func openChatCard(expectedAction: String = "填写我的空闲") {
            app.tabBars.buttons["消息"].tap()
            let row = app.buttons["inbox-row-\(fixture.connectionID)"]
            XCTAssertTrue(row.waitForExistence(timeout: 20)); row.tap()
            let card = app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH 'shared-plan-card-'")).firstMatch
            XCTAssertTrue(card.waitForExistence(timeout: 20))
            XCTAssertTrue(app.staticTexts[expectedAction].waitForExistence(timeout: 10))
            capture(app, "contacts-received-chat-card"); card.tap()
            XCTAssertTrue(app.staticTexts["time-poll-detail-title"].waitForExistence(timeout: 20))
            XCTAssertEqual(app.staticTexts["time-poll-detail-title"].label, fixture.title)
        }

        nativeSignIn(owner, bundle: fixture.bundle)
        app.tabBars.buttons["计划"].tap()
        let create = app.buttons["plans-create-primary"].exists ? app.buttons["plans-create-primary"] : app.buttons["plans-create-unified"]
        XCTAssertTrue(create.waitForExistence(timeout: 20)); create.tap()
        let title = app.textFields["time-poll-title"]
        XCTAssertTrue(title.waitForExistence(timeout: 10)); title.tap(); title.typeText(fixture.title + " draft\n")
        app.buttons["time-poll-create-confirm"].tap()
        XCTAssertTrue(app.buttons["plan-invite-contacts"].waitForExistence(timeout: 20))
        app.navigationBars.buttons["完成"].tap()
        XCTAssertTrue(app.buttons["time-poll-cell-0"].waitForExistence(timeout: 20))
        app.staticTexts["time-poll-detail-title"].tap()
        let initialNameEditor = app.textFields["plan-edit-title"].exists ? app.textFields["plan-edit-title"] : app.textViews["plan-edit-title"]
        XCTAssertTrue(initialNameEditor.waitForExistence(timeout: 10))
        replace(initialNameEditor, with: fixture.title)
        app.buttons["plan-edit-save"].tap()
        XCTAssertTrue(app.staticTexts["time-poll-detail-title"].waitForExistence(timeout: 20))
        XCTAssertEqual(app.staticTexts["time-poll-detail-title"].label, fixture.title)
        XCTAssertFalse(app.buttons["time-poll-edit-name"].exists)
        XCTAssertFalse(app.staticTexts["大家的时间表"].exists)
        XCTAssertFalse(app.staticTexts["点选我的空闲，提交后大家可见。"].exists)
        let people = app.buttons["plan-people-open"]
        XCTAssertTrue(people.isHittable)
        XCTAssertTrue(people.label.contains("0 人已填写"))
        verifyResponseCountSeparatedFromAction("0 人已填写")
        capture(app, "compact-empty-timetable")
        nativePhase("contacts-created")
        app.buttons["time-poll-cell-0"].tap(); app.buttons["time-poll-cell-2"].tap()
        XCTAssertEqual(app.staticTexts["time-poll-save-state"].label, "未提交")
        XCTAssertFalse(app.buttons["plan-edit-information"].exists)
        app.staticTexts["time-poll-detail-title"].tap()
        let nameEditor = app.textFields["plan-edit-title"].exists ? app.textFields["plan-edit-title"] : app.textViews["plan-edit-title"]
        XCTAssertTrue(nameEditor.waitForExistence(timeout: 10))
        replace(nameEditor, with: fixture.title + " changed")
        app.buttons["plan-edit-cancel"].tap()
        XCTAssertEqual(app.staticTexts["time-poll-detail-title"].label, fixture.title)
        app.descendants(matching: .any)["plan-detail-location"].tap()
        let locationEditor = app.textFields["plan-edit-location"]
        XCTAssertTrue(locationEditor.waitForExistence(timeout: 10))
        replace(locationEditor, with: "图书馆二楼")
        capture(app, "inline-information-editing")
        app.buttons["plan-edit-save"].tap()
        XCTAssertTrue(locationEditor.waitForNonExistence(timeout: 20))
        XCTAssertTrue(app.descendants(matching: .any)["plan-detail-location"].label.contains("图书馆二楼"))
        XCTAssertTrue(app.buttons["time-poll-cell-0"].isSelected && app.buttons["time-poll-cell-2"].isSelected)
        XCTAssertEqual(app.staticTexts["time-poll-save-state"].label, "未提交")
        capture(app, "inline-information-saved-draft-preserved")
        app.buttons["plan-share-open"].tap()
        app.buttons["plan-invite-contacts"].tap()
        let contact = app.buttons["plan-contact-\(fixture.peerID)"]
        XCTAssertTrue(contact.waitForExistence(timeout: 15)); contact.tap()
        let send = app.buttons["plan-contact-send"]
        XCTAssertTrue(send.isHittable && send.isEnabled)
        capture(app, "contacts-select-and-send"); send.tap()
        XCTAssertTrue(send.waitForNonExistence(timeout: 20))
        XCTAssertTrue(app.buttons["plan-invite-contacts"].waitForExistence(timeout: 20))
        XCTAssertTrue(app.buttons["plan-invite-contacts"].label.contains("已发送"))
        app.navigationBars.buttons["完成"].tap()
        XCTAssertTrue(app.buttons["time-poll-cell-0"].isSelected)
        XCTAssertTrue(app.buttons["time-poll-cell-2"].isSelected)
        XCTAssertEqual(app.staticTexts["time-poll-save-state"].label, "未提交")
        nativePhase("contacts-delivered"); capture(app, "contacts-draft-kept-after-send")
        // Already delivered contacts remain visible and cannot accidentally be sent twice.
        app.buttons["plan-share-open"].tap()
        app.buttons["plan-invite-contacts"].tap()
        XCTAssertTrue(contact.waitForExistence(timeout: 15)); XCTAssertFalse(contact.isEnabled)
        XCTAssertFalse(app.buttons["plan-contact-send"].isEnabled)
        app.navigationBars.buttons["取消"].tap()
        app.navigationBars.buttons["完成"].tap()
        nativeWaitSaved(); nativePhase("contacts-owner-submitted")

        nativeSignIn(peer, bundle: fixture.bundle)
        app.tabBars.buttons["计划"].tap()
        XCTAssertTrue(app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH 'plans-coordinated-' AND label CONTAINS %@", fixture.title)).firstMatch.waitForExistence(timeout: 20))
        openChatCard()
        XCTAssertFalse(app.buttons["time-poll-cell-0"].isSelected)
        XCTAssertFalse(app.buttons["plan-invite-contacts"].exists)
        app.buttons["time-poll-cell-0"].tap(); app.buttons["time-poll-cell-2"].tap()
        nativeWaitSaved(); nativePhase("contacts-peer-submitted")
        capture(app, "contacts-peer-inline-availability")
        XCTAssertTrue(people.isHittable); XCTAssertTrue(people.label.contains("2 人已填写"))
        verifyResponseCountSeparatedFromAction("2 人已填写")
        people.tap()
        XCTAssertTrue(app.descendants(matching: .any)["plan-people-list"].waitForExistence(timeout: 10))
        capture(app, "compact-responded-people")
        app.buttons["plan-people-done"].tap()


        nativeSignIn(owner, bundle: fixture.bundle); openListCard()
        app.buttons["unified-plan-invite-window"].tap()
        verifyFinalTimeCellInteractions()
        selectCrossDayFinalTime()
        let review = app.buttons["unified-plan-review-roster"]
        XCTAssertTrue(review.isEnabled); review.tap()
        let invitation = app.buttons["unified-plan-send-invitations"]
        XCTAssertTrue(invitation.waitForExistence(timeout: 10)); XCTAssertTrue(invitation.isEnabled)
        capture(app, "contacts-review-final-invitees"); invitation.tap()
        XCTAssertTrue(app.buttons["unified-plan-publish"].waitForExistence(timeout: 20))
        nativePhase("contacts-formal-invitation")

        nativeSignIn(peer, bundle: fixture.bundle); openChatCard(expectedAction: "查看邀请")
        XCTAssertTrue(app.descendants(matching: .any)["plan-invitation-cell-1"].waitForExistence(timeout: 10))
        XCTAssertEqual(app.descendants(matching: .any).matching(identifier: "plan-invitation-legend").count, 2)
        XCTAssertFalse(app.descendants(matching: .any)["plan-invitation-window-label"].exists)
        capture(app, "invitation-continuous-across-midnight")
        let accept = app.buttons["unified-plan-accept"]
        XCTAssertTrue(accept.waitForExistence(timeout: 10)); accept.tap()
        XCTAssertTrue(app.staticTexts["unified-plan-accepted-status"].waitForExistence(timeout: 20))
        nativePhase("contacts-peer-accepted"); capture(app, "contacts-explicit-acceptance")

        nativeSignIn(owner, bundle: fixture.bundle); openListCard()
        app.buttons["unified-plan-publish"].tap()
        let publish = app.buttons.matching(NSPredicate(format: "label == %@ AND identifier != %@", "正式发出", "unified-plan-publish")).firstMatch
        XCTAssertTrue(publish.waitForExistence(timeout: 10)); publish.tap()
        XCTAssertTrue(app.buttons["plan-view-calendar"].waitForExistence(timeout: 20))
        nativePhase("contacts-published")

        nativeSignIn(peer, bundle: fixture.bundle)
        app.tabBars.buttons["计划"].tap(); app.buttons["plans-tab-upcoming"].tap()
        let confirmed = app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH 'plans-coordinated-' AND label CONTAINS %@", fixture.title)).firstMatch
        XCTAssertTrue(confirmed.waitForExistence(timeout: 20)); confirmed.tap()
        XCTAssertTrue(app.buttons["plan-view-calendar"].waitForExistence(timeout: 20)); app.buttons["plan-view-calendar"].tap()
        XCTAssertTrue(app.tabBars.buttons["日历"].isSelected)
        app.buttons["calendar-search"].tap()
        let search = app.searchFields.firstMatch
        XCTAssertTrue(search.waitForExistence(timeout: 10)); search.tap(); search.typeText(fixture.title)
        let result = app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH 'calendar-search-result-' AND label CONTAINS %@", fixture.title)).firstMatch
        XCTAssertTrue(result.waitForExistence(timeout: 20))
        nativePhase("contacts-calendar-verified"); capture(app, "contacts-calendar-result")
    }


    func testDirectTimetableCreateInviteConfirmAndCalendar() throws {
        struct ContactFixture: Decodable {
            let title: String; let bundle: String; let connectionID: String; let peerID: String; let accounts: [NativeAccount]
        }
        let raw = ProcessInfo.processInfo.environment["SIDESEAT_PLAN_CONTACTS_JSON"]
        try XCTSkipIf(raw == nil, "Requires disposable accepted App contacts.")
        let f = try JSONDecoder().decode(ContactFixture.self, from: Data(raw!.utf8))
        let owner = try XCTUnwrap(f.accounts.first { $0.role == "owner" })
        let peer = try XCTUnwrap(f.accounts.first { $0.role == "participant" })
        addTeardownBlock { [self] in MainActor.assumeIsolated { app?.terminate() } }
        func openOwner() {
            app.tabBars.buttons["计划"].tap()
            let card = app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH 'plans-coordinated-' AND label CONTAINS %@", f.title)).firstMatch
            XCTAssertTrue(card.waitForExistence(timeout: 20)); card.tap()
        }
        nativeSignIn(owner, bundle: f.bundle)
        app.tabBars.buttons["计划"].tap()
        let create = app.buttons["plans-create-primary"].exists ? app.buttons["plans-create-primary"] : app.buttons["plans-create-unified"]
        XCTAssertTrue(create.waitForExistence(timeout: 20)); create.tap()
        let title = app.textFields["time-poll-title"]
        XCTAssertTrue(title.waitForExistence(timeout: 10)); title.tap(); title.typeText(f.title + "\n")
        toggleCandidateDates()
        let datePicker = app.descendants(matching: .any)["time-poll-dates"].firstMatch
        let defaultDay = try XCTUnwrap(datePicker.buttons.allElementsBoundByIndex.first { $0.isSelected })
        defaultDay.tap(); XCTAssertFalse(defaultDay.isSelected)
        defaultDay.tap(); XCTAssertTrue(defaultDay.isSelected)
        let defaultLabel = defaultDay.label
        let clear = app.buttons["time-poll-dates-clear"]
        for _ in 0..<5 where !clear.isHittable || clear.frame.maxY > app.buttons["time-poll-create-confirm"].frame.minY {
            app.scrollViews.firstMatch.swipeUp()
        }
        clear.tap(); XCTAssertFalse(clear.isEnabled)
        XCTAssertEqual(datePicker.buttons.matching(NSPredicate(format: "isSelected == true")).count, 0)
        datePicker.buttons[defaultLabel].tap()
        XCTAssertTrue(datePicker.buttons[defaultLabel].isSelected)
        toggleCandidateDates()
        XCTAssertFalse(app.buttons["plan-mode-fixed"].exists)
        XCTAssertFalse(app.buttons["plan-collect-availability"].exists)
        let next = app.buttons["time-poll-create-confirm"]
        XCTAssertTrue(next.isEnabled)
        XCTAssertFalse(app.staticTexts["time-poll-final-summary"].exists)
        XCTAssertFalse(app.buttons["time-poll-cell-0"].exists)
        capture(app, "candidate-create-before-any-votes"); next.tap()
        XCTAssertTrue(app.buttons["plan-invite-contacts"].waitForExistence(timeout: 20))
        app.navigationBars.buttons["完成"].tap()
        XCTAssertTrue(app.buttons["time-poll-cell-4"].waitForExistence(timeout: 20))
        app.buttons["time-poll-cell-4"].tap()
        app.buttons["unified-plan-invite-window"].tap()
        app.buttons["time-poll-cell-0"].tap(); app.buttons["time-poll-cell-2"].tap()
        assertFinalClock("09:00", "10:00")
        app.buttons["unified-plan-review-roster"].tap()
        let send = app.buttons["unified-plan-send-invitations"]
        XCTAssertTrue(send.waitForExistence(timeout: 20))
        app.buttons["unified-plan-adjust-time"].tap()
        assertFinalClock("09:00", "10:00")
        app.buttons["time-poll-cancel-final"].tap()
        XCTAssertTrue(app.buttons["time-poll-cell-4"].isSelected)
        XCTAssertFalse(app.buttons["time-poll-cell-0"].isSelected)
        app.buttons["unified-plan-invite-window"].tap()
        assertFinalClock("09:00", "10:00")
        // A saved local final draft survives leaving the page and opening the plan again.
        nativeSignIn(owner, bundle: f.bundle); openOwner()
        XCTAssertTrue(app.buttons["unified-plan-review-roster"].waitForExistence(timeout: 20))
        assertFinalClock("09:00", "10:00")
        nativePhase("direct-created")
        app.buttons["unified-plan-review-roster"].tap()
        let contacts = app.buttons["unified-plan-add-contacts"]
        XCTAssertTrue(contacts.waitForExistence(timeout: 10)); contacts.tap()
        let contact = app.buttons["plan-contact-\(f.peerID)"]
        XCTAssertTrue(contact.waitForExistence(timeout: 15)); contact.tap()
        app.buttons["plan-contact-send"].tap()
        XCTAssertTrue(contacts.waitForExistence(timeout: 20))
        let person = try XCTUnwrap(app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH 'unified-plan-invite-person-' ")).allElementsBoundByIndex.first { $0.isEnabled })
        XCTAssertEqual(person.value as? String, "已选择")
        let linkOff = app.buttons["unified-plan-link-off"]
        for _ in 0..<6 where !linkOff.isHittable || linkOff.frame.maxY > send.frame.minY - 12 {
            app.swipeUp()
        }
        XCTAssertTrue(linkOff.isHittable); XCTAssertLessThan(linkOff.frame.maxY, send.frame.minY)
        capture(app, "unified-direct-before-link-choice"); linkOff.tap()
        XCTAssertTrue(send.waitForExistence(timeout: 10))
        nativePhase("direct-delivered"); capture(app, "unified-direct-roster")
        XCTAssertTrue(send.isEnabled); send.tap()
        XCTAssertTrue(app.buttons["unified-plan-publish"].waitForExistence(timeout: 20))
        nativePhase("direct-formal-invitation")
        nativeSignIn(peer, bundle: f.bundle)
        app.tabBars.buttons["消息"].tap()
        let row = app.buttons["inbox-row-\(f.connectionID)"]
        XCTAssertTrue(row.waitForExistence(timeout: 20)); row.tap()
        let card = app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH 'shared-plan-card-'")).firstMatch
        XCTAssertTrue(card.waitForExistence(timeout: 20)); card.tap()
        let accept = app.buttons["unified-plan-accept"]
        XCTAssertTrue(accept.waitForExistence(timeout: 20))
        capture(app, "unified-direct-invitation"); accept.tap()
        XCTAssertTrue(app.staticTexts["unified-plan-accepted-status"].waitForExistence(timeout: 20))
        nativePhase("direct-peer-accepted")
        nativeSignIn(owner, bundle: f.bundle); openOwner()
        app.buttons["unified-plan-publish"].tap()
        let publish = app.buttons.matching(NSPredicate(format: "label == %@ AND identifier != %@", "正式发出", "unified-plan-publish")).firstMatch
        XCTAssertTrue(publish.waitForExistence(timeout: 10)); publish.tap()
        XCTAssertTrue(app.buttons["plan-view-calendar"].waitForExistence(timeout: 20))
        nativePhase("direct-published")
        nativeSignIn(peer, bundle: f.bundle)
        app.tabBars.buttons["计划"].tap(); app.buttons["plans-tab-upcoming"].tap()
        let confirmed = app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH 'plans-coordinated-' AND label CONTAINS %@", f.title)).firstMatch
        XCTAssertTrue(confirmed.waitForExistence(timeout: 20)); confirmed.tap()
        let calendar = app.buttons["plan-view-calendar"]
        XCTAssertTrue(calendar.waitForExistence(timeout: 20)); calendar.tap()
        XCTAssertTrue(app.tabBars.buttons["日历"].isSelected)
        app.buttons["calendar-search"].tap()
        let search = app.searchFields.firstMatch
        XCTAssertTrue(search.waitForExistence(timeout: 10)); search.tap(); search.typeText(f.title)
        XCTAssertTrue(app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH 'calendar-search-result-' AND label CONTAINS %@", f.title)).firstMatch.waitForExistence(timeout: 20))
        nativePhase("direct-calendar-verified"); capture(app, "unified-direct-calendar")
    }

    func testUnifiedCreationLargestText() throws {
        struct ContactFixture: Decodable { let bundle: String; let accounts: [NativeAccount] }
        let raw = ProcessInfo.processInfo.environment["SIDESEAT_PLAN_CONTACTS_JSON"]
        try XCTSkipIf(raw == nil, "Requires disposable owner.")
        let f = try JSONDecoder().decode(ContactFixture.self, from: Data(raw!.utf8))
        let owner = try XCTUnwrap(f.accounts.first { $0.role == "owner" })
        for (language, large, appearance) in [("zh-Hans", false, "light"), ("zh-Hans", true, "light"), ("de", false, "dark"), ("de", true, "dark")] {
            app?.terminate(); app = XCUIApplication(bundleIdentifier: f.bundle)
            app.launchArguments = ["--ui-testing-authenticated", "--ui-testing-ephemeral-credentials", "--ui-testing-skip-tutorial", "--ui-testing-time-poll-live", "--ui-testing-language=\(language)", "--ui-testing-appearance=\(appearance)"]
            if large { app.launchArguments.append("--ui-testing-dynamic-type-accessibility") }
            app.launchEnvironment = ["SIDESEAT_QA_ACCESS_TOKEN": owner.accessToken]; app.launch()
            let tab = language == "de" ? "Pläne" : "计划"
            XCTAssertTrue(app.tabBars.buttons[tab].waitForExistence(timeout: 20)); app.tabBars.buttons[tab].tap()
            let create = app.buttons["plans-create-primary"].exists ? app.buttons["plans-create-primary"] : app.buttons["plans-create-unified"]
            XCTAssertTrue(create.waitForExistence(timeout: 20)); create.tap()
            let title = app.textFields["time-poll-title"]
            XCTAssertTrue(title.waitForExistence(timeout: 10))
            let size = large ? "largest" : "regular"
            let information = app.otherElements["plan-create-information"]
            let location = app.textFields["unified-plan-location"]
            let dates = app.buttons["plan-date-options"]
            let ideas = app.buttons["plan-start-together"]
            XCTAssertGreaterThanOrEqual(dates.frame.height, 43.5); XCTAssertGreaterThanOrEqual(ideas.frame.height, 43.5)
            XCTAssertLessThan(title.frame.maxY, location.frame.minY + 1)
            XCTAssertLessThanOrEqual(location.frame.maxY, dates.frame.minY + 1)
            XCTAssertLessThanOrEqual(dates.frame.maxY, ideas.frame.minY + 1)
            XCTAssertGreaterThanOrEqual(title.frame.minX - information.frame.minX, 10)
            if !large {
                XCTAssertLessThanOrEqual(information.frame.height, 280)
                XCTAssertLessThanOrEqual(ideas.frame.maxY, app.otherElements["plan-create-timetable-heading"].frame.minY)
            } else { XCTAssertLessThanOrEqual(information.frame.height, 450) }
            capture(app, "compact-create-empty-\(size)-\(language)")
            title.tap()
            XCTAssertTrue(app.keyboards.firstMatch.waitForExistence(timeout: 5))
            XCTAssertFalse(app.buttons["time-poll-create-confirm"].exists)
            let name = language == "de" ? "Gemeinsam in der Bibliothek lernen und danach essen" : "周末一起在图书馆复习然后聚餐"
            title.typeText(name)
            XCTAssertLessThan(title.frame.maxY, app.keyboards.firstMatch.frame.minY)
            capture(app, "compact-create-title-keyboard-\(size)-\(language)")
            title.typeText("\n")
            location.tap(); location.typeText(language == "de" ? "Bibliothek im zweiten Stock\n" : "图书馆二楼靠窗的位置\n")
            XCTAssertEqual(title.value as? String, name)
            capture(app, "compact-create-filled-\(size)-\(language)")
            let next = app.buttons["time-poll-create-confirm"]
            XCTAssertTrue(next.isEnabled); XCTAssertGreaterThanOrEqual(next.frame.height, 44)
            XCTAssertFalse(app.buttons["plan-collect-availability"].exists)
            XCTAssertFalse(app.staticTexts["time-poll-final-summary"].exists)
            XCTAssertFalse(app.buttons["time-poll-cell-0"].exists)
            XCTAssertTrue(app.otherElements["plan-create-hours"].exists)
            for id in ["time-poll-from", "time-poll-until"] {
                let field = app.buttons[id]
                XCTAssertGreaterThanOrEqual(field.frame.height, 43.5)
                XCTAssertLessThanOrEqual(field.frame.height, 55, "Clock values must stay on one line")
            }
            capture(app, "candidate-ready-to-share-\(size)-\(language)")
            app.terminate()
        }
    }

    func testCandidateDateSelectionDoesNotCrash() throws {
        for (language, large) in [("zh-Hans", false), ("de", true)] {
            let picker = try openCandidateDateEditor(language: language, large: large)
            let first = try XCTUnwrap(picker.buttons.allElementsBoundByIndex.first { $0.isSelected })
            let label = first.label
            let tomorrow = Calendar.current.date(byAdding: .day, value: 1, to: Date())!
            let formatter = DateFormatter(); formatter.calendar = Calendar(identifier: .gregorian)
            formatter.locale = Locale(identifier: "en_US_POSIX"); formatter.dateFormat = "yyyy-MM-dd"
            let removedDay = "time-poll-day-" + formatter.string(from: tomorrow)
            first.tap(); XCTAssertFalse(first.isSelected)
            toggleCandidateDates()
            XCTAssertTrue(app.buttons[removedDay].waitForNonExistence(timeout: 5))
            toggleCandidateDates()
            let sameDay = picker.buttons[label]
            XCTAssertFalse(sameDay.isSelected); sameDay.tap(); XCTAssertTrue(sameDay.isSelected)
            // Batch taps reach UIKit rapidly instead of waiting for quiescence after every touch.
            for _ in 0..<4 {
                sameDay.tap(withNumberOfTaps: 6, numberOfTouches: 1)
                XCTAssertEqual(app.state, .runningForeground)
            }
            if !sameDay.isSelected { sameDay.tap() }
            XCTAssertTrue(sameDay.isSelected)
            capture(app, "candidate-date-rapid-\(language)")
            toggleCandidateDates()
            XCTAssertTrue(app.buttons[removedDay].exists)
            capture(app, "candidate-date-restored-preview-\(language)")
            toggleCandidateDates()
            let clear = app.buttons["time-poll-dates-clear"]
            let next = app.buttons["time-poll-create-confirm"]
            let summary = app.staticTexts["time-poll-final-summary"]
            for _ in 0..<5 {
                let dockTop = summary.exists ? summary.frame.minY : next.frame.minY
                if clear.isHittable && clear.frame.maxY < dockTop - 12 { break }
                app.scrollViews.firstMatch.swipeUp()
            }
            XCTAssertTrue(clear.isHittable); XCTAssertTrue(clear.isEnabled)
            XCTAssertEqual(clear.frame.midX, app.frame.midX, accuracy: 1)
            XCTAssertGreaterThanOrEqual(clear.frame.minY, picker.frame.maxY - 1)
            XCTAssertGreaterThanOrEqual(clear.frame.height, 44)
            XCTAssertLessThan(clear.frame.maxY, (summary.exists ? summary.frame.minY : next.frame.minY) - 12)
            capture(app, "candidate-date-clear-action-\(language)")
            clear.tap()
            XCTAssertFalse(clear.isEnabled)
            XCTAssertEqual(picker.buttons.matching(NSPredicate(format: "isSelected == true")).count, 0)
            XCTAssertEqual(app.textFields["time-poll-title"].value as? String, "Date selection regression")
            XCTAssertEqual(app.textFields["unified-plan-location"].value as? String, "Library")
            XCTAssertFalse(next.isEnabled)
            capture(app, "candidate-date-cleared-\(language)")
            toggleCandidateDates()
            XCTAssertEqual(app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH 'time-poll-day-'")).count, 0)
            XCTAssertFalse(next.isEnabled)
            capture(app, "candidate-date-empty-\(language)")
            toggleCandidateDates()
            picker.buttons[label].tap()
            XCTAssertTrue(clear.isEnabled)
            toggleCandidateDates()
            app.scrollViews.firstMatch.swipeUp()
            XCTAssertTrue(app.buttons[removedDay].waitForExistence(timeout: 5))
            XCTAssertEqual(app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH 'time-poll-day-'")).count, 1)
            XCTAssertTrue(next.isEnabled)
            capture(app, "candidate-date-reselected-\(language)")
            app.terminate()
        }
    }

    func testCandidateDateLimitAndLargeTimetable() throws {
        let picker = try openCandidateDateEditor()
        let nextMonth = Calendar.current.date(byAdding: .month, value: 1, to: Date())!
        let month = Calendar.current.component(.month, from: nextMonth)
        picker.buttons["下个月"].tap()
        func day(_ number: Int) -> XCUIElement {
            picker.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", "\(month)月\(number)日")).firstMatch
        }
        for number in 1...24 {
            let button = day(number)
            XCTAssertTrue(button.waitForExistence(timeout: 5), "Expected month \(month), day \(number)")
            // The test phone's floating AssistiveTouch control covers some right-column centers.
            button.coordinate(withNormalizedOffset: CGVector(dx: 0.08, dy: 0.08)).tap()
            XCTAssertTrue(button.isSelected)
        }
        let next = app.buttons["time-poll-create-confirm"]
        XCTAssertTrue(next.isEnabled)
        day(25).tap(); XCTAssertFalse(next.isEnabled)
        day(25).tap(); XCTAssertTrue(next.isEnabled)
        capture(app, "candidate-dates-limit-31")
        toggleCandidateDates()
        XCTAssertEqual(app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH 'time-poll-day-'")).count, 31)
        XCTAssertTrue(app.buttons["time-poll-create-confirm"].isEnabled)
        XCTAssertEqual(app.state, .runningForeground)
        capture(app, "candidate-dates-31-day-timetable")
        app.terminate()
    }

    private func toggleCandidateDates() {
        let button = app.buttons["plan-date-options"]
        let picker = app.descendants(matching: .any)["time-poll-dates"].firstMatch
        let expanded = picker.exists
        for _ in 0..<8 {
            if button.isHittable && button.frame.minY >= app.navigationBars.firstMatch.frame.maxY + 4 { break }
            app.scrollViews.firstMatch.swipeDown()
        }
        XCTAssertTrue(button.isHittable)
        XCTAssertGreaterThanOrEqual(button.frame.minY, app.navigationBars.firstMatch.frame.maxY + 4)
        button.tap()
        if expanded { XCTAssertTrue(picker.waitForNonExistence(timeout: 5)) }
        else { XCTAssertTrue(picker.waitForExistence(timeout: 5)) }
    }

    private func openCandidateDateEditor(language: String = "zh-Hans", large: Bool = false) throws -> XCUIElement {
        struct ContactFixture: Decodable { let bundle: String; let accounts: [NativeAccount] }
        let raw = ProcessInfo.processInfo.environment["SIDESEAT_PLAN_CONTACTS_JSON"]
        try XCTSkipIf(raw == nil, "Requires disposable owner.")
        let f = try JSONDecoder().decode(ContactFixture.self, from: Data(raw!.utf8))
        let owner = try XCTUnwrap(f.accounts.first { $0.role == "owner" })
        app?.terminate(); app = XCUIApplication(bundleIdentifier: f.bundle)
        app.launchArguments = ["--ui-testing-authenticated", "--ui-testing-ephemeral-credentials", "--ui-testing-skip-tutorial", "--ui-testing-time-poll-live", "--ui-testing-language=\(language)", "--ui-testing-appearance=\(large ? "dark" : "light")"]
        if large { app.launchArguments.append("--ui-testing-dynamic-type-accessibility") }
        app.launchEnvironment = ["SIDESEAT_QA_ACCESS_TOKEN": owner.accessToken]; app.launch()
        let tab = language == "de" ? "Pläne" : "计划"
        XCTAssertTrue(app.tabBars.buttons[tab].waitForExistence(timeout: 20)); app.tabBars.buttons[tab].tap()
        let create = app.buttons.matching(NSPredicate(format: "identifier IN %@", ["plans-create-primary", "plans-create-unified"])).firstMatch
        XCTAssertTrue(create.waitForExistence(timeout: 20)); create.tap()
        let title = app.textFields["time-poll-title"]
        XCTAssertTrue(title.waitForExistence(timeout: 10)); title.tap(); title.typeText("Date selection regression\n")
        let location = app.textFields["unified-plan-location"]
        location.tap(); location.typeText("Library\n")
        XCTAssertTrue(app.buttons["time-poll-create-confirm"].isEnabled)
        XCTAssertFalse(app.buttons["plan-collect-availability"].exists)
        XCTAssertFalse(app.staticTexts["time-poll-final-summary"].exists)
        toggleCandidateDates()
        let picker = app.descendants(matching: .any)["time-poll-dates"].firstMatch
        XCTAssertTrue(picker.waitForExistence(timeout: 10))
        capture(app, "candidate-dates-start-\(language)")
        return picker
    }

    func testCompactCreationDateOptionsRetainInputsAndTime() throws {
        struct ContactFixture: Decodable { let bundle: String; let accounts: [NativeAccount] }
        let raw = ProcessInfo.processInfo.environment["SIDESEAT_PLAN_CONTACTS_JSON"]
        try XCTSkipIf(raw == nil, "Requires disposable owner.")
        let f = try JSONDecoder().decode(ContactFixture.self, from: Data(raw!.utf8))
        let owner = try XCTUnwrap(f.accounts.first { $0.role == "owner" })
        nativeSignIn(owner, bundle: f.bundle)
        app.tabBars.buttons["计划"].tap()
        let create = app.buttons["plans-create-primary"].exists ? app.buttons["plans-create-primary"] : app.buttons["plans-create-unified"]
        XCTAssertTrue(create.waitForExistence(timeout: 20)); create.tap()
        let title = app.textFields["time-poll-title"], location = app.textFields["unified-plan-location"]
        XCTAssertTrue(title.waitForExistence(timeout: 10)); title.tap(); title.typeText("周末一起复习\n")
        location.tap(); location.typeText("图书馆二楼\n")
        let options = app.buttons["plan-date-options"]
        toggleCandidateDates()
        XCTAssertTrue(app.descendants(matching: .any)["time-poll-dates"].firstMatch.waitForExistence(timeout: 5))
        XCTAssertEqual(title.value as? String, "周末一起复习"); XCTAssertEqual(location.value as? String, "图书馆二楼")
        capture(app, "candidate-expanded-dates")
        toggleCandidateDates()
        let from = app.descendants(matching: .any)["time-poll-from"].firstMatch
        let until = app.descendants(matching: .any)["time-poll-until"].firstMatch
        XCTAssertTrue(from.exists); XCTAssertTrue(until.exists)
        from.tap(); app.buttons["08:00"].tap()
        until.tap()
        for _ in 0..<4 where !app.buttons["07:00"].exists { app.collectionViews.firstMatch.swipeDown() }
        XCTAssertTrue(app.buttons["07:00"].waitForExistence(timeout: 5)); app.buttons["07:00"].tap()
        XCTAssertFalse(app.buttons["time-poll-create-confirm"].isEnabled)
        until.tap()
        XCTAssertTrue(app.buttons["07:00"].waitForExistence(timeout: 5))
        for _ in 0..<4 where !app.buttons["18:00"].exists { app.collectionViews.firstMatch.swipeUp() }
        XCTAssertTrue(app.buttons["18:00"].waitForExistence(timeout: 5)); app.buttons["18:00"].tap()
        XCTAssertTrue(app.buttons["time-poll-create-confirm"].isEnabled)
        capture(app, "candidate-adjusted-daily-hours")
        toggleCandidateDates(); toggleCandidateDates()
        XCTAssertEqual(title.value as? String, "周末一起复习")
        XCTAssertEqual(location.value as? String, "图书馆二楼")
        XCTAssertEqual(from.value as? String, "08:00"); XCTAssertEqual(until.value as? String, "18:00")
        app.terminate()
    }

    func testNativeContactCardDarkAccessibilityAfterFullFlow() throws {
        struct ContactFixture: Decodable {
            let title: String
            let bundle: String
            let connectionID: String
            let peerID: String
            let accounts: [NativeAccount]
        }
        let raw = ProcessInfo.processInfo.environment["SIDESEAT_PLAN_CONTACTS_JSON"]
        try XCTSkipIf(raw == nil, "Requires the completed disposable contact flow.")
        let fixture = try JSONDecoder().decode(ContactFixture.self, from: Data(raw!.utf8))
        let owner = try XCTUnwrap(fixture.accounts.first { $0.role == "owner" })
        let peer = try XCTUnwrap(fixture.accounts.first { $0.role == "participant" })
        addTeardownBlock { [self] in MainActor.assumeIsolated { app?.terminate() } }
        nativeSignIn(peer, bundle: fixture.bundle, accessibility: true)
        app.tabBars.buttons["消息"].tap()
        let row = app.buttons["inbox-row-\(fixture.connectionID)"]
        XCTAssertTrue(row.waitForExistence(timeout: 20)); row.tap()
        let card = app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH 'shared-plan-card-'")).firstMatch
        XCTAssertTrue(card.waitForExistence(timeout: 20)); XCTAssertTrue(card.isHittable)
        XCTAssertGreaterThanOrEqual(card.frame.minX, 0)
        XCTAssertLessThanOrEqual(card.frame.maxX, app.frame.width)
        capture(app, "contacts-chat-dark-accessibility"); card.tap()
        XCTAssertTrue(app.buttons["plan-view-calendar"].waitForExistence(timeout: 20))
        capture(app, "contacts-detail-dark-accessibility")
        nativeSignIn(owner, bundle: fixture.bundle, accessibility: true)
        app.tabBars.buttons["计划"].tap(); app.buttons["plans-tab-upcoming"].tap()
        let plan = app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH 'plans-coordinated-' AND label CONTAINS %@", fixture.title)).firstMatch
        XCTAssertTrue(plan.waitForExistence(timeout: 20)); plan.tap()
        let invite = app.buttons["plan-invite-contacts"]
        XCTAssertTrue(invite.waitForExistence(timeout: 20)); invite.tap()
        let contact = app.buttons["plan-contact-\(fixture.peerID)"]
        XCTAssertTrue(contact.waitForExistence(timeout: 20)); XCTAssertFalse(contact.isEnabled)
        let send = app.buttons["plan-contact-send"]
        XCTAssertTrue(send.isHittable); XCTAssertFalse(send.isEnabled)
        XCTAssertLessThanOrEqual(send.frame.maxY, app.frame.maxY)
        capture(app, "contacts-picker-dark-accessibility")
    }

    func testAvailabilityDraftSurvivesReopenAndAccountSwitch() throws {
        let raw = ProcessInfo.processInfo.environment["SIDESEAT_NATIVE_PARTICIPANT_JSON"]
        try XCTSkipIf(raw == nil || raw!.isEmpty, "Requires disposable draft recovery accounts.")
        let fixture = try JSONDecoder().decode(NativeFixture.self, from: Data(raw!.utf8))
        let owner = try XCTUnwrap(fixture.accounts.first { $0.role == "owner" })
        let peer = try XCTUnwrap(fixture.accounts.first { $0.role == "participant" })
        addTeardownBlock { [self] in MainActor.assumeIsolated { app?.terminate() } }
        nativeSignIn(owner, bundle: fixture.bundle)
        app.tabBars.buttons["计划"].tap()
        let create = app.buttons["plans-create-primary"]
        XCTAssertTrue(create.waitForExistence(timeout: 20)); create.tap()
        let title = app.textFields["time-poll-title"]
        XCTAssertTrue(title.waitForExistence(timeout: 10)); title.tap(); title.typeText(fixture.title + "\n")
        app.buttons["time-poll-create-confirm"].tap()
        let first = app.buttons["time-poll-cell-0"], second = app.buttons["time-poll-cell-2"]
        XCTAssertTrue(first.waitForExistence(timeout: 20)); first.tap(); second.tap()
        app.buttons["plan-copy-link"].tap(); nativePhase("draft-local")
        XCUIDevice.shared.press(.home); app.activate()
        app.navigationBars.buttons.element(boundBy: 0).tap(); nativeOpenCard()
        XCTAssertTrue(first.waitForExistence(timeout: 20))
        XCTAssertTrue(first.isSelected && second.isSelected)
        XCTAssertEqual(app.staticTexts["time-poll-save-state"].label, "已恢复草稿 · 未提交")
        nativePhase("draft-reopened"); capture(app, "draft-recovered-on-device")
        nativeSignIn(peer, bundle: fixture.bundle)
        app.tabBars.buttons["计划"].tap(); app.buttons["plans-open-link"].tap()
        let field = app.alerts.textFields.firstMatch
        XCTAssertTrue(field.waitForExistence(timeout: 10)); field.tap(); field.typeKey("v", modifierFlags: .command)
        let allowPaste = XCUIApplication(bundleIdentifier: "com.apple.springboard").buttons.matching(NSPredicate(format: "label IN %@", ["Allow Paste", "允许粘贴"])).firstMatch
        if allowPaste.waitForExistence(timeout: 2) { allowPaste.tap() }
        app.alerts.buttons["打开"].tap()
        XCTAssertTrue(first.waitForExistence(timeout: 20)); XCTAssertFalse(first.isSelected || second.isSelected)
        nativePhase("draft-other-account"); capture(app, "draft-separated-by-account")
        nativeSignIn(owner, bundle: fixture.bundle)
        app.tabBars.buttons["计划"].tap(); nativeOpenCard()
        XCTAssertTrue(first.waitForExistence(timeout: 20))
        XCTAssertTrue(first.isSelected && second.isSelected)
        XCTAssertEqual(app.staticTexts["time-poll-save-state"].label, "已恢复草稿 · 未提交")
        nativeWaitSaved(); nativePhase("draft-submitted"); capture(app, "draft-explicitly-submitted")
    }

    func testOrganizerInvitesWithUnsubmittedAvailability() throws {
        let raw = ProcessInfo.processInfo.environment["SIDESEAT_NATIVE_PARTICIPANT_JSON"]
        try XCTSkipIf(raw == nil || raw!.isEmpty, "Requires disposable organizer fixture.")
        let fixture = try JSONDecoder().decode(NativeFixture.self, from: Data(raw!.utf8))
        let owner = try XCTUnwrap(fixture.accounts.first { $0.role == "owner" })
        addTeardownBlock { [self] in MainActor.assumeIsolated { app?.terminate() } }
        nativeSignIn(owner, bundle: fixture.bundle)
        app.tabBars.buttons["计划"].tap()
        let create = app.buttons["plans-create-primary"]
        XCTAssertTrue(create.waitForExistence(timeout: 20)); create.tap()
        let title = app.textFields["time-poll-title"]
        XCTAssertTrue(title.waitForExistence(timeout: 10)); title.tap(); title.typeText(fixture.title + "\n")
        app.buttons["time-poll-create-confirm"].tap()
        let first = app.buttons["time-poll-cell-0"], second = app.buttons["time-poll-cell-2"]
        XCTAssertTrue(first.waitForExistence(timeout: 20)); first.tap(); second.tap()
        let choose = app.buttons["unified-plan-invite-window"]
        XCTAssertTrue(choose.isEnabled); nativePhase("invite-draft")
        choose.tap(); app.buttons["time-poll-cell-4"].tap(); app.buttons["time-poll-cell-6"].tap()
        let review = app.buttons["unified-plan-review-roster"]
        XCTAssertTrue(review.isEnabled); review.tap()
        let send = app.buttons["unified-plan-send-invitations"]
        XCTAssertTrue(send.waitForExistence(timeout: 10)); XCTAssertTrue(send.isEnabled)
        app.buttons["返回时间表"].tap(); app.buttons["time-poll-cancel-final"].tap()
        XCTAssertTrue(first.isSelected && second.isSelected)
        XCTAssertEqual(app.staticTexts["time-poll-save-state"].label, "未提交")
        nativePhase("invite-cancelled-review"); capture(app, "invite-kept-unsubmitted-draft")
        choose.tap(); app.buttons["time-poll-cell-4"].tap(); app.buttons["time-poll-cell-6"].tap(); review.tap()
        XCTAssertTrue(send.waitForExistence(timeout: 10)); nativePhase("invite-reviewed")
        send.tap()
        wait(app.staticTexts["unified-plan-confirmation-count"], labelContains: "1/2 人已确认")
        nativePhase("invite-sent"); capture(app, "invite-sent-without-availability-submit")
    }

    func testDirtyDraftRefreshesPeersAndIncomingInvitation() throws {
        let raw = ProcessInfo.processInfo.environment["SIDESEAT_NATIVE_PARTICIPANT_JSON"]
        try XCTSkipIf(raw == nil || raw!.isEmpty, "Requires disposable participant fixture.")
        let fixture = try JSONDecoder().decode(NativeFixture.self, from: Data(raw!.utf8))
        let participant = try XCTUnwrap(fixture.accounts.first { $0.role == "participant" })
        let token = try XCTUnwrap(fixture.pollToken)
        addTeardownBlock { [self] in MainActor.assumeIsolated { app?.terminate() } }
        nativeSignIn(participant, bundle: fixture.bundle)
        app.tabBars.buttons["计划"].tap()
        let open = app.buttons["plans-open-link"]
        XCTAssertTrue(open.waitForExistence(timeout: 20)); open.tap()
        let field = app.alerts.textFields.firstMatch
        XCTAssertTrue(field.waitForExistence(timeout: 10)); field.tap(); field.typeText("https://www.sideseat.de/time-polls/" + token)
        app.alerts.buttons["打开"].tap()
        let first = app.buttons["time-poll-cell-0"], second = app.buttons["time-poll-cell-2"]
        XCTAssertTrue(first.waitForExistence(timeout: 20)); first.tap(); second.tap()
        nativePhase("refresh-draft")
        wait(first, labelContains: ", 1")
        XCTAssertTrue(first.isSelected && second.isSelected)
        XCTAssertEqual(app.staticTexts["time-poll-save-state"].label, "未提交")
        nativePhase("refresh-peers"); capture(app, "refresh-draft-with-peer-count")
        let accept = app.buttons["unified-plan-accept"]
        XCTAssertTrue(accept.waitForExistence(timeout: 25)); XCTAssertTrue(accept.isEnabled)
        XCTAssertTrue(app.descendants(matching: .any)["plan-invitation-cell-1"].exists)
        nativePhase("refresh-invitation"); capture(app, "refresh-incoming-final-time")
        accept.tap()
        XCTAssertTrue(app.buttons["plan-view-calendar"].waitForExistence(timeout: 20))
        nativePhase("refresh-confirmed"); capture(app, "refresh-confirmed-without-publishing-draft")
    }

    func testManualAvailabilityRequiresExplicitSubmission() throws {
        let raw = ProcessInfo.processInfo.environment["SIDESEAT_NATIVE_PARTICIPANT_JSON"]
        try XCTSkipIf(raw == nil || raw!.isEmpty, "Requires a fresh disposable native account.")
        let fixture = try JSONDecoder().decode(NativeFixture.self, from: Data(raw!.utf8))
        let owner = try XCTUnwrap(fixture.accounts.first { $0.role == "owner" })
        addTeardownBlock { [self] in MainActor.assumeIsolated { app?.terminate() } }
        nativeSignIn(owner, bundle: fixture.bundle)
        app.tabBars.buttons["计划"].tap()
        let create = app.buttons["plans-create-primary"]
        XCTAssertTrue(create.waitForExistence(timeout: 20)); create.tap()
        let title = app.textFields["time-poll-title"]
        XCTAssertTrue(title.waitForExistence(timeout: 10)); title.tap(); title.typeText(fixture.title + "\n")
        app.buttons["time-poll-create-confirm"].tap()
        let first = app.buttons["time-poll-cell-0"], second = app.buttons["time-poll-cell-2"]
        XCTAssertTrue(first.waitForExistence(timeout: 20)); first.tap(); second.tap()
        Thread.sleep(forTimeInterval: 2)
        XCTAssertFalse(app.staticTexts["time-poll-saved"].exists)
        XCTAssertEqual(app.staticTexts["time-poll-save-state"].label, "未提交")
        XCTAssertTrue(first.label.hasSuffix(", 0")); XCTAssertTrue(second.label.hasSuffix(", 0"))
        nativePhase("manual-draft"); capture(app, "manual-draft-not-published")
        nativeWaitSaved(); XCTAssertTrue(first.label.hasSuffix(", 1")); nativePhase("manual-submitted")
        first.tap(); Thread.sleep(forTimeInterval: 2)
        XCTAssertFalse(app.staticTexts["time-poll-saved"].exists)
        XCTAssertEqual(app.buttons["time-poll-submit"].label, "保存修改")
        XCTAssertTrue(first.label.hasSuffix(", 1"))
        nativePhase("manual-edited"); nativeWaitSaved()
        nativePhase("manual-resubmitted"); capture(app, "manual-submitted")
    }

    func testNativeParticipantDirectTimetableInviteConfirmAndCalendar() throws {
        let raw = ProcessInfo.processInfo.environment["SIDESEAT_NATIVE_PARTICIPANT_JSON"]
        try XCTSkipIf(raw == nil || raw!.isEmpty, "Requires two fresh disposable native accounts.")
        let fixture = try JSONDecoder().decode(NativeFixture.self, from: Data(raw!.utf8))
        let owner = try XCTUnwrap(fixture.accounts.first { $0.role == "owner" })
        let participant = try XCTUnwrap(fixture.accounts.first { $0.role == "participant" })
        addTeardownBlock { [self] in MainActor.assumeIsolated { app?.terminate() } }
        nativeSignIn(owner, bundle: fixture.bundle)
        app.tabBars.buttons["计划"].tap()
        let create = app.buttons["plans-create-primary"]
        XCTAssertTrue(create.waitForExistence(timeout: 20))
        capture(app, "native-home-first-use")
        create.tap()
        let title = app.textFields["time-poll-title"]
        XCTAssertTrue(title.waitForExistence(timeout: 10)); title.tap(); title.typeText(fixture.title + "\n")
        XCTAssertFalse(app.buttons["plan-create-next"].exists)
        XCTAssertFalse(app.buttons["plan-start-known-activity"].exists)
        capture(app, "native-00-single-form")
        app.buttons["time-poll-create-confirm"].tap()
        XCTAssertTrue(app.staticTexts["time-poll-response-count"].waitForExistence(timeout: 20))
        XCTAssertGreaterThan(app.descendants(matching: .any)["time-poll-grid"].frame.height, app.frame.height * 0.35,
                             "The timetable should be the main working area on first entry")
        XCTAssertLessThan(app.staticTexts["time-poll-detail-title"].frame.minY, app.descendants(matching: .any)["time-poll-grid"].frame.minY)
        app.buttons["time-poll-cell-0"].tap(); app.buttons["time-poll-cell-2"].tap()
        nativeWaitSaved(); nativePhase("owner-ready"); capture(app, "native-01-owner-table")
        app.buttons["plan-copy-link"].tap()
        XCTAssertEqual(app.buttons["plan-copy-link"].label, "链接已复制")

        nativeSignIn(participant, bundle: fixture.bundle)
        app.tabBars.buttons["计划"].tap()
        let open = app.buttons["plans-open-link"]
        XCTAssertTrue(open.waitForExistence(timeout: 20)); open.tap()
        let linkField = app.alerts.textFields.firstMatch
        XCTAssertTrue(linkField.waitForExistence(timeout: 10)); linkField.tap()
        linkField.typeKey("v", modifierFlags: .command)
        let allowPaste = XCUIApplication(bundleIdentifier: "com.apple.springboard").buttons.matching(NSPredicate(format: "label IN %@", ["Allow Paste", "允许粘贴"])).firstMatch
        if allowPaste.waitForExistence(timeout: 2) { allowPaste.tap() }
        let copiedLink = try XCTUnwrap(linkField.value as? String)
        XCTAssertTrue(copiedLink.contains("sideseat.de/time-polls/"))
        app.alerts.buttons["打开"].tap()
        let heading = app.staticTexts["time-poll-response-count"]
        XCTAssertTrue(heading.waitForExistence(timeout: 20))
        XCTAssertEqual(app.staticTexts["time-poll-detail-title"].label, fixture.title)
        XCTAssertEqual(app.textFields["time-poll-name"].value as? String, "Peer Lin")
        nativeAssertInline()
        XCTAssertTrue(app.staticTexts["plan-participant-next-step"].isHittable)
        XCTAssertFalse(app.buttons["unified-plan-invite-window"].exists)
        XCTAssertFalse(app.buttons["unified-plan-accept"].exists)
        nativePhase("participant-opened"); capture(app, "native-02-participant-first-open")
        let first = app.buttons["time-poll-cell-0"], second = app.buttons["time-poll-cell-2"]
        XCTAssertFalse(first.isSelected); wait(first, labelContains: ", 1")
        XCTAssertTrue(first.isHittable); XCTAssertTrue(second.isHittable)
        first.press(forDuration: 0.6, thenDragTo: second)
        nativeWaitSaved(); XCTAssertTrue(first.isSelected); XCTAssertTrue(second.isSelected)
        wait(first, labelContains: ", 2")
        nativePhase("participant-saved"); capture(app, "native-03-participant-saved")
        app.buttons["plan-people-open"].tap()
        XCTAssertTrue(app.staticTexts["time-poll-participants"].waitForExistence(timeout: 10))
        XCTAssertTrue(app.staticTexts["time-poll-participants"].label.contains("Host Ming"))
        XCTAssertTrue(app.staticTexts["time-poll-participants"].label.contains("Peer Lin"))
        capture(app, "detail-people-responses")
        app.buttons["plan-people-done"].tap()
        XCTAssertTrue(first.waitForExistence(timeout: 10)); XCTAssertTrue(first.isSelected)
        app.navigationBars.buttons.element(boundBy: 0).tap(); nativeOpenCard(expectedStatus: "等发起人定时间")
        XCTAssertTrue(first.waitForExistence(timeout: 15)); XCTAssertTrue(first.isSelected)
        wait(first, labelContains: ", 2")
        first.tap(); nativeWaitSaved(); XCTAssertFalse(first.isSelected); wait(first, labelContains: ", 1")
        nativePhase("participant-edited"); capture(app, "native-04-organizer-time-preserved")
        app.navigationBars.buttons.element(boundBy: 0).tap()
        nativeOpenCard(expectedStatus: "等发起人定时间")
        XCTAssertTrue(first.waitForExistence(timeout: 15)); XCTAssertFalse(first.isSelected)
        wait(first, labelContains: ", 1"); first.tap(); nativeWaitSaved()
        wait(first, labelContains: ", 2")
        let day = app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH 'time-poll-day-'")).firstMatch
        day.tap(); XCTAssertTrue(app.buttons["time-poll-cell-4"].isSelected)
        app.buttons["time-poll-undo"].tap(); nativeWaitSaved()
        XCTAssertFalse(app.buttons["time-poll-cell-4"].isSelected)
        XCTAssertTrue(first.isSelected); XCTAssertTrue(second.isSelected)
        let grid = app.descendants(matching: .any)["time-poll-grid"].firstMatch
        let swipeOrigin = app.coordinate(withNormalizedOffset: .zero)
        let swipeX = first.frame.midX
        let firstTopBeforeSwipe = first.frame.minY
        let swipeStartY = app.staticTexts["time-poll-saved"].frame.minY - 24
        let swipeEndY = max(grid.frame.minY + 24, first.frame.minY + 24)
        swipeOrigin.withOffset(CGVector(dx: swipeX, dy: swipeStartY)).press(forDuration: 0.05,
            thenDragTo: swipeOrigin.withOffset(CGVector(dx: swipeX, dy: swipeEndY)))
        XCTAssertLessThan(first.frame.minY, firstTopBeforeSwipe - 40, "An ordinary swipe must move the timetable in the full-page scroll")
        XCTAssertTrue(first.isSelected); XCTAssertTrue(second.isSelected)
        app.navigationBars.buttons.element(boundBy: 0).tap(); nativeOpenCard(expectedStatus: "等发起人定时间")
        XCTAssertTrue(first.waitForExistence(timeout: 15)); XCTAssertTrue(first.isSelected); XCTAssertTrue(second.isSelected)
        wait(first, labelContains: ", 2"); nativeAssertInline()
        nativePhase("participant-reopened"); capture(app, "native-05-participant-reopened")

        // Same real participant/token; the main journey above and below uses real UI logins.
        app.terminate()
        let route = try XCTUnwrap(URL(string: copiedLink)?.path)
        app.launchArguments = ["--ui-testing-authenticated", "--ui-testing-ephemeral-credentials", "--ui-testing-skip-tutorial",
            "--ui-testing-time-poll-live", "--ui-testing-deep-link=\(route)", "--ui-testing-language=zh-Hans",
            "--ui-testing-appearance=dark", "--ui-testing-dynamic-type-accessibility"]
        app.launchEnvironment = ["SIDESEAT_QA_ACCESS_TOKEN": participant.accessToken]
        app.launch()
        XCTAssertTrue(app.staticTexts["time-poll-response-count"].waitForExistence(timeout: 20))
        let detailScroll = app.scrollViews["time-poll-detail-scroll"]
        XCTAssertTrue(detailScroll.waitForExistence(timeout: 10))
        for _ in 0..<10 where !first.isHittable || first.frame.maxY >= app.staticTexts["time-poll-saved"].frame.minY - 20 {
            let origin = app.coordinate(withNormalizedOffset: .zero)
            let startY = min(app.frame.height * 0.6, app.staticTexts["time-poll-saved"].frame.minY - 24)
            let endY = app.navigationBars.firstMatch.frame.maxY + 100
            origin.withOffset(CGVector(dx: 80, dy: startY)).press(forDuration: 0.05,
                thenDragTo: origin.withOffset(CGVector(dx: 80, dy: endY)))
        }
        XCTAssertTrue(first.isHittable, "The timetable remains reachable with maximum accessibility text")
        XCTAssertLessThan(first.frame.maxY, app.staticTexts["time-poll-saved"].frame.minY - 20, "The full time cell must sit above the save bar")
        XCTAssertGreaterThan(first.frame.minY, app.navigationBars.firstMatch.frame.maxY)
        XCTAssertTrue(first.isSelected)
        XCTAssertTrue(app.staticTexts["plan-participant-next-step"].isHittable)
        nativeAssertInline(); capture(app, "native-06-participant-dark-large")

        nativeFinalTimeLargeText(owner: owner, route: route, bundle: fixture.bundle)
        nativeSignIn(owner, bundle: fixture.bundle)
        app.tabBars.buttons["计划"].tap(); nativeOpenCard(expectedStatus: "待你定时间")
        reviewFinalHour(mark: nativePhase)
        app.buttons["unified-plan-send-invitations"].tap()
        wait(app.staticTexts["unified-plan-confirmation-count"], labelContains: "1/2 人已确认")
        nativePhase("awaiting-confirmation"); capture(app, "native-07-organizer-invited")
        app.buttons["unified-plan-choose-again"].tap()
        XCTAssertTrue(app.buttons["time-poll-cell-0"].waitForExistence(timeout: 10))
        XCTAssertTrue(app.buttons["time-poll-cell-0"].isSelected)
        XCTAssertTrue(app.buttons["time-poll-cell-2"].isSelected)
        app.buttons["time-poll-cancel-final"].tap()
        wait(app.staticTexts["unified-plan-confirmation-count"], labelContains: "1/2 人已确认")
        nativePhase("reschedule-cancelled")

        nativeSignIn(participant, bundle: fixture.bundle)
        app.tabBars.buttons["计划"].tap(); nativeOpenCard(expectedStatus: "待你确认")
        let accept = app.buttons["unified-plan-accept"]
        XCTAssertTrue(accept.waitForExistence(timeout: 20))
        XCTAssertFalse(app.buttons["time-poll-cell-0"].exists, "An invitation is a separate explicit confirmation")
        let invited = app.descendants(matching: .any)["plan-invitation-cell-1"].firstMatch
        XCTAssertTrue(invited.waitForExistence(timeout: 10)); XCTAssertTrue(invited.isSelected)
        XCTAssertFalse(app.buttons["plan-invitation-cell-1"].exists)
        XCTAssertFalse(app.descendants(matching: .any)["plan-invitation-cell-0"].firstMatch.isSelected)
        XCTAssertTrue(app.staticTexts["time-poll-detail-title"].isHittable)
        XCTAssertLessThan(app.staticTexts["time-poll-detail-title"].frame.minY, invited.frame.minY)
        XCTAssertLessThan(invited.frame.maxY, accept.frame.minY,
                          "The highlighted final time must be visible above the confirmation action")
        let people = app.buttons["plan-people-open"]
        for _ in 0..<3 where !people.isHittable { app.swipeUp() }
        people.tap()
        XCTAssertTrue(app.staticTexts["Host Ming"].waitForExistence(timeout: 10))
        XCTAssertTrue(app.staticTexts["Peer Lin"].exists)
        capture(app, "detail-people-invitations")
        app.buttons["plan-people-done"].tap()
        invited.tap(); XCTAssertTrue(accept.isEnabled)
        nativePhase("invitation-reviewed"); capture(app, "native-08-participant-invitation")
        nativeInvitedTimetableLarge(participant: participant, route: route, bundle: fixture.bundle)
        nativeSignIn(participant, bundle: fixture.bundle)
        app.tabBars.buttons["计划"].tap(); nativeOpenCard(expectedStatus: "待你确认")
        let finalAccept = app.buttons["unified-plan-accept"]
        XCTAssertTrue(finalAccept.waitForExistence(timeout: 15)); finalAccept.tap()
        let count = app.staticTexts["unified-plan-confirmation-count"]
        wait(count, labelContains: "2/2 人已确认")
        nativePhase("accepted-awaiting-publish"); capture(app, "native-09-participant-accepted")
        XCTAssertFalse(app.buttons["plan-view-calendar"].exists)
        nativeSignIn(owner, bundle: fixture.bundle)
        app.tabBars.buttons["计划"].tap(); nativeOpenCard()
        let publish = app.buttons["unified-plan-publish"]
        XCTAssertTrue(publish.waitForExistence(timeout: 20)); publish.tap()
        let finalSend = app.buttons.matching(NSPredicate(format: "label == %@ AND identifier != %@", "正式发出", "unified-plan-publish")).firstMatch
        XCTAssertTrue(finalSend.waitForExistence(timeout: 10)); finalSend.tap()
        XCTAssertTrue(app.buttons["plan-view-calendar"].waitForExistence(timeout: 20))
        nativePhase("confirmed"); capture(app, "native-09b-owner-published")
        nativeSignIn(participant, bundle: fixture.bundle)
        app.tabBars.buttons["计划"].tap()
        let upcoming = app.buttons["plans-tab-upcoming"]
        XCTAssertTrue(upcoming.waitForExistence(timeout: 15)); upcoming.tap(); nativeOpenCard()
        XCTAssertTrue(app.buttons["plan-view-calendar"].waitForExistence(timeout: 20))
        app.buttons["plan-view-calendar"].tap()
        XCTAssertTrue(app.tabBars.buttons["日历"].isSelected)
        app.buttons["calendar-search"].tap()
        let search = app.searchFields.firstMatch
        XCTAssertTrue(search.waitForExistence(timeout: 10)); search.tap(); search.typeText(fixture.title)
        let result = app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH 'calendar-search-result-' AND label CONTAINS %@", fixture.title)).firstMatch
        XCTAssertTrue(result.waitForExistence(timeout: 20)); result.tap()
        let manage = app.buttons["calendar-manage-plan"]
        for _ in 0..<4 where !manage.isHittable { app.swipeUp() }
        XCTAssertTrue(manage.waitForExistence(timeout: 10)); capture(app, "native-10-participant-calendar")
        manage.tap(); wait(count, labelContains: "2/2 人已确认")
        nativePhase("calendar-verified"); capture(app, "native-11-calendar-to-plan")
    }

    func testOrganizerInvitesBeforeFriendsFillAvailability() throws {
        let raw = ProcessInfo.processInfo.environment["SIDESEAT_NATIVE_PARTICIPANT_JSON"]
        try XCTSkipIf(raw == nil || raw!.isEmpty, "Requires two fresh disposable native accounts.")
        let fixture = try JSONDecoder().decode(NativeFixture.self, from: Data(raw!.utf8))
        let owner = try XCTUnwrap(fixture.accounts.first { $0.role == "owner" })
        let peer = try XCTUnwrap(fixture.accounts.first { $0.role == "participant" })
        addTeardownBlock { [self] in MainActor.assumeIsolated { app?.terminate() } }
        nativeSignIn(owner, bundle: fixture.bundle)
        app.tabBars.buttons["计划"].tap()
        let create = app.buttons["plans-create-primary"]
        XCTAssertTrue(create.waitForExistence(timeout: 20)); create.tap()
        let title = app.textFields["time-poll-title"]
        XCTAssertTrue(title.waitForExistence(timeout: 10)); title.tap(); title.typeText(fixture.title + "\n")
        app.buttons["time-poll-create-confirm"].tap()
        let choose = app.buttons["unified-plan-invite-window"]
        XCTAssertTrue(choose.waitForExistence(timeout: 20)); XCTAssertTrue(choose.isEnabled)
        nativePhase("solo-zero-ready"); capture(app, "solo-zero-responses")
        choose.tap()
        let first = app.buttons["time-poll-cell-0"], second = app.buttons["time-poll-cell-2"]
        first.tap(); second.tap()
        let review = app.buttons["unified-plan-review-roster"]
        XCTAssertTrue(review.isEnabled); review.tap()
        let send = app.buttons["unified-plan-send-invitations"]
        XCTAssertTrue(send.waitForExistence(timeout: 10)); XCTAssertTrue(send.isEnabled)
        XCTAssertTrue(app.steppers["unified-plan-link-count"].exists)
        capture(app, "solo-zero-review")
        app.buttons["返回时间表"].tap(); app.buttons["time-poll-cancel-final"].tap()
        first.tap(); second.tap(); nativeWaitSaved(); nativePhase("solo-owner-ready")
        choose.tap(); first.tap(); second.tap(); review.tap()
        XCTAssertTrue(send.waitForExistence(timeout: 10)); XCTAssertTrue(send.isEnabled)
        let stepper = app.steppers["unified-plan-link-count"]
        XCTAssertTrue(stepper.exists)
        stepper.buttons.element(boundBy: 1).tap()
        XCTAssertTrue(app.staticTexts["共 3 人参加，包含你"].firstMatch.exists)
        app.buttons["unified-plan-adjust-time"].tap()
        XCTAssertTrue(review.waitForExistence(timeout: 10)); review.tap()
        XCTAssertTrue(app.staticTexts["共 3 人参加，包含你"].firstMatch.waitForExistence(timeout: 10))
        stepper.buttons.element(boundBy: 0).tap()
        XCTAssertTrue(app.staticTexts["共 2 人参加，包含你"].firstMatch.exists)
        nativePhase("solo-roster-reviewed"); capture(app, "solo-invitation-review")
        send.tap()
        let count = app.staticTexts["unified-plan-confirmation-count"]
        wait(count, labelContains: "1/2 人已确认")
        XCTAssertTrue(app.buttons["plan-share-primary"].isHittable)
        app.buttons["plan-copy-link"].tap(); nativePhase("solo-link-ready")
        capture(app, "solo-formal-invitation")
        let publish = app.buttons["unified-plan-publish"]
        XCTAssertTrue(publish.waitForExistence(timeout: 10)); publish.tap()
        let finalSend = app.buttons.matching(NSPredicate(format: "label == %@ AND identifier != %@", "正式发出", "unified-plan-publish")).firstMatch
        XCTAssertTrue(finalSend.waitForExistence(timeout: 10)); finalSend.tap()
        XCTAssertTrue(app.buttons["plan-view-calendar"].waitForExistence(timeout: 15))
        nativePhase("solo-published"); capture(app, "solo-published-before-replies")
        nativeSignIn(peer, bundle: fixture.bundle)
        app.tabBars.buttons["计划"].tap()
        app.buttons["plans-open-link"].tap()
        let link = app.alerts.textFields.firstMatch
        XCTAssertTrue(link.waitForExistence(timeout: 10)); link.tap(); link.typeKey("v", modifierFlags: .command)
        let allowPaste = XCUIApplication(bundleIdentifier: "com.apple.springboard").buttons.matching(NSPredicate(format: "label IN %@", ["Allow Paste", "允许粘贴"])).firstMatch
        if allowPaste.waitForExistence(timeout: 2) { allowPaste.tap() }
        app.alerts.buttons["打开"].tap()
        let accept = app.buttons["unified-plan-accept"]
        XCTAssertTrue(accept.waitForExistence(timeout: 20)); XCTAssertTrue(accept.isEnabled)
        XCTAssertFalse(app.buttons["time-poll-cell-0"].exists)
        let invited = app.descendants(matching: .any)["plan-invitation-cell-1"].firstMatch
        XCTAssertTrue(invited.waitForExistence(timeout: 10)); XCTAssertTrue(invited.isSelected)
        nativePhase("solo-participant-opened"); capture(app, "solo-peer-direct-confirmation")
        accept.tap(); wait(count, labelContains: "2/2 人已确认")
        nativePhase("solo-confirmed")
        app.buttons["plan-view-calendar"].tap()
        XCTAssertTrue(app.tabBars.buttons["日历"].isSelected)
        app.buttons["calendar-search"].tap()
        let search = app.searchFields.firstMatch
        XCTAssertTrue(search.waitForExistence(timeout: 10)); search.tap(); search.typeText(fixture.title)
        let result = app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH 'calendar-search-result-' AND label CONTAINS %@", fixture.title)).firstMatch
        XCTAssertTrue(result.waitForExistence(timeout: 20)); result.tap()
        let manage = app.buttons["calendar-manage-plan"]
        for _ in 0..<4 where !manage.isHittable { app.swipeUp() }
        XCTAssertTrue(manage.waitForExistence(timeout: 10)); manage.tap()
        wait(count, labelContains: "2/2 人已确认")
        nativePhase("solo-calendar-verified"); capture(app, "solo-calendar-to-same-plan")
    }

    func testNativeConfirmedPlanUsesUpcomingSummary() throws {
        let raw = ProcessInfo.processInfo.environment["SIDESEAT_NATIVE_PARTICIPANT_JSON"]
        try XCTSkipIf(raw == nil || raw!.isEmpty, "Requires the confirmed disposable native plan.")
        let fixture = try JSONDecoder().decode(NativeFixture.self, from: Data(raw!.utf8))
        let participant = try XCTUnwrap(fixture.accounts.first { $0.role == "participant" })
        addTeardownBlock { [self] in MainActor.assumeIsolated { app?.terminate() } }
        nativeSignIn(participant, bundle: fixture.bundle)
        app.tabBars.buttons["计划"].tap()
        app.descendants(matching: .any)["plans-segmented-control"].firstMatch.buttons.element(boundBy: 1).tap()
        let card = app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH 'plans-coordinated-'")).firstMatch
        XCTAssertTrue(card.waitForExistence(timeout: 20))
        XCTAssertEqual(card.value as? String, "已确认")
        XCTAssertTrue(card.label.contains(fixture.title))
        XCTAssertTrue(card.label.contains("09:00") && card.label.contains("10:00"))
        XCTAssertFalse(card.label.contains("Europe/Berlin"))
        capture(app, "native-upcoming-date-summary")
        card.tap()
        wait(app.staticTexts["unified-plan-confirmation-count"], labelContains: "2/2 人已确认")
        XCTAssertFalse(app.buttons["unified-plan-accept"].exists)
        XCTAssertTrue(app.buttons["plan-view-calendar"].isEnabled)
    }

    func testFinalTimeCellInteractions() throws {
        struct BlockFixture: Decodable { let bundle: String; let finalBlockToken: String; let accounts: [NativeAccount] }
        let raw = ProcessInfo.processInfo.environment["SIDESEAT_PLAN_CONTACTS_JSON"]
        try XCTSkipIf(raw == nil, "Requires the disposable picker fixture.")
        let fixture = try JSONDecoder().decode(BlockFixture.self, from: Data(raw!.utf8))
        let owner = try XCTUnwrap(fixture.accounts.first { $0.role == "owner" })
        addTeardownBlock { [self] in MainActor.assumeIsolated { app?.terminate() } }
        app = XCUIApplication(bundleIdentifier: fixture.bundle)
        app.launchArguments = ["--ui-testing-authenticated", "--ui-testing-ephemeral-credentials", "--ui-testing-skip-tutorial",
            "--ui-testing-time-poll-live", "--ui-testing-language=zh-Hans", "--ui-testing-appearance=light",
            "--ui-testing-deep-link=/time-polls/\(fixture.finalBlockToken)"]
        app.launchEnvironment = ["SIDESEAT_QA_ACCESS_TOKEN": owner.accessToken]
        app.launch()
        XCTAssertTrue(app.buttons["time-poll-cell-0"].waitForExistence(timeout: 25))
        for id in ["time-poll-cell-0", "time-poll-cell-2"] where !app.buttons[id].isSelected { app.buttons[id].tap() }
        app.buttons["unified-plan-invite-window"].tap()
        verifyFinalTimeCellInteractions()
    }

    func testInlineInformationLargestText() throws {
        struct Fixture: Decodable { let bundle: String; let finalBlockToken: String; let accounts: [NativeAccount] }
        let raw = ProcessInfo.processInfo.environment["SIDESEAT_PLAN_CONTACTS_JSON"]
        try XCTSkipIf(raw == nil, "Requires a disposable inline information fixture.")
        let f = try JSONDecoder().decode(Fixture.self, from: Data(raw!.utf8))
        let owner = try XCTUnwrap(f.accounts.first { $0.role == "owner" })
        addTeardownBlock { [self] in MainActor.assumeIsolated { app?.terminate() } }
        for language in ["zh-Hans", "de"] {
            app?.terminate(); app = XCUIApplication(bundleIdentifier: f.bundle)
            app.launchArguments = ["--ui-testing-authenticated", "--ui-testing-ephemeral-credentials", "--ui-testing-skip-tutorial",
                "--ui-testing-time-poll-live", "--ui-testing-language=\(language)", "--ui-testing-appearance=dark",
                "--ui-testing-dynamic-type-accessibility", "--ui-testing-deep-link=/time-polls/\(f.finalBlockToken)"]
            app.launchEnvironment = ["SIDESEAT_QA_ACCESS_TOKEN": owner.accessToken]; app.launch()
            let heading = app.staticTexts["time-poll-detail-title"]
            XCTAssertTrue(heading.waitForExistence(timeout: 25)); let original = heading.label
            XCTAssertFalse(app.buttons["plan-edit-information"].exists)
            XCTAssertFalse(app.textFields["plan-edit-location"].exists)
            capture(app, "inline-information-largest-display-\(language)")
            app.descendants(matching: .any)["plan-detail-location"].tap()
            let location = app.textFields["plan-edit-location"]
            XCTAssertTrue(location.waitForExistence(timeout: 10)); location.typeText("Library level 2")
            let save = app.buttons["plan-edit-save"]
            for _ in 0..<5 where !save.isHittable { app.scrollViews["time-poll-detail-scroll"].swipeUp() }
            XCTAssertTrue(save.isHittable); XCTAssertGreaterThanOrEqual(save.frame.height, 43.99)
            capture(app, "inline-information-largest-editing-\(language)")
            app.buttons["plan-edit-cancel"].tap()
            XCTAssertTrue(heading.waitForExistence(timeout: 10)); XCTAssertEqual(heading.label, original)
            XCTAssertFalse(app.buttons["plan-edit-save"].exists)
            app.terminate()
        }
    }

    func testFinalTimeCellLargestText() throws {
        struct BlockFixture: Decodable { let bundle: String; let finalBlockToken: String; let accounts: [NativeAccount] }
        let raw = ProcessInfo.processInfo.environment["SIDESEAT_PLAN_CONTACTS_JSON"]
        try XCTSkipIf(raw == nil, "Requires the disposable picker fixture.")
        let f = try JSONDecoder().decode(BlockFixture.self, from: Data(raw!.utf8))
        let owner = try XCTUnwrap(f.accounts.first { $0.role == "owner" })
        for language in ["zh-Hans", "de"] {
            app?.terminate(); app = XCUIApplication(bundleIdentifier: f.bundle)
            app.launchArguments = ["--ui-testing-authenticated", "--ui-testing-ephemeral-credentials", "--ui-testing-skip-tutorial",
                "--ui-testing-time-poll-live", "--ui-testing-language=\(language)", "--ui-testing-appearance=dark",
                "--ui-testing-dynamic-type-accessibility", "--ui-testing-deep-link=/time-polls/\(f.finalBlockToken)"]
            app.launchEnvironment = ["SIDESEAT_QA_ACCESS_TOKEN": owner.accessToken]; app.launch()
            let choose = app.buttons["unified-plan-invite-window"]
            if choose.waitForExistence(timeout: 2) { choose.tap() }
            XCTAssertTrue(app.buttons["unified-plan-review-roster"].waitForExistence(timeout: 20))
            if app.buttons["time-poll-reset-final"].exists { app.buttons["time-poll-reset-final"].tap() }
            let first = app.buttons["time-poll-cell-0"], second = app.buttons["time-poll-cell-2"]
            XCTAssertTrue(first.waitForExistence(timeout: 10)); first.tap(); second.tap()
            let review = app.buttons["unified-plan-review-roster"]
            XCTAssertTrue(review.isEnabled)
            XCTAssertTrue(app.staticTexts["time-poll-final-summary"].exists)
            XCTAssertLessThan(app.staticTexts["time-poll-final-summary"].frame.maxY, review.frame.minY)
            XCTAssertGreaterThanOrEqual(review.frame.height, 43.99)
            capture(app, "final-cells-largest-\(language)")
            app.terminate()
        }
    }

    private func verifyFinalTimeCellInteractions() {
        let first = app.buttons["time-poll-cell-0"], second = app.buttons["time-poll-cell-2"], third = app.buttons["time-poll-cell-4"]
        let review = app.buttons["unified-plan-review-roster"]
        XCTAssertFalse(review.isEnabled)
        first.tap(); assertFinalClock("09:00", "09:30")
        second.tap(); assertFinalClock("09:00", "10:00")
        second.tap(); assertFinalClock("09:00", "09:30"); XCTAssertTrue(first.isSelected)
        third.tap()
        XCTAssertTrue(first.isSelected && third.isSelected)
        XCTAssertFalse(review.isEnabled); XCTAssertTrue(app.staticTexts["time-poll-final-gap"].exists)
        second.tap(); assertFinalClock("09:00", "10:30")
        app.buttons["time-poll-undo"].tap(); XCTAssertFalse(review.isEnabled)
        third.tap(); assertFinalClock("09:00", "09:30")
        first.tap(); XCTAssertFalse(review.isEnabled)
        first.press(forDuration: 0.5, thenDragTo: second)
        XCTAssertTrue(first.isSelected && second.isSelected); assertFinalClock("09:00", "10:00")
        capture(app, "final-cells-tap-cancel-drag-undo")
        first.press(forDuration: 0.5, thenDragTo: second)
        XCTAssertFalse(first.isSelected || second.isSelected); XCTAssertFalse(review.isEnabled)
        first.tap(); second.tap()
        app.buttons["time-poll-cancel-final"].tap()
        XCTAssertTrue(first.isSelected && second.isSelected, "Final-time editing keeps submitted availability intact")
        app.buttons["unified-plan-invite-window"].tap()
        XCTAssertTrue(review.isEnabled, "The final-time draft survives leaving and returning")
        assertFinalClock("09:00", "10:00")
    }

    private func assertFinalClock(_ start: String, _ end: String, file: StaticString = #filePath, line: UInt = #line) {
        let summary = app.staticTexts["time-poll-final-summary"]
        XCTAssertTrue(summary.label.contains(start), summary.label, file: file, line: line)
        XCTAssertTrue(summary.label.contains(end), summary.label, file: file, line: line)
    }

    private func selectCrossDayFinalTime() {
        app.buttons["time-poll-reset-final"].tap()
        let dates = app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH 'time-poll-day-'")).allElementsBoundByIndex
            .map { $0.identifier.replacingOccurrences(of: "time-poll-day-", with: "") }.sorted()
        XCTAssertGreaterThanOrEqual(dates.count, 2)
        let viewport = app.scrollViews["time-poll-final-scroll"]
        XCTAssertTrue(viewport.exists)
        func cell(_ date: String, _ time: String) -> XCUIElement {
            app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@ AND label CONTAINS %@", date, time)).firstMatch
        }
        func reveal(_ element: XCUIElement) {
            XCTAssertTrue(element.exists)
            for _ in 0..<24 {
                if element.isHittable && viewport.frame.contains(CGPoint(x: element.frame.midX, y: element.frame.midY)) { break }
                if element.frame.minY < viewport.frame.minY { viewport.swipeDown() } else { viewport.swipeUp() }
            }
            XCTAssertTrue(element.isHittable)
        }
        let night = cell(dates[0], "23:00–23:30"), midnight = cell(dates[0], "23:30–00:00")
        reveal(night); night.press(forDuration: 0.5, thenDragTo: midnight)
        XCTAssertTrue(night.isSelected && midnight.isSelected)
        capture(app, "final-cross-day-evening")
        let morning = cell(dates[1], "00:00–00:30"), end = cell(dates[1], "00:30–01:00")
        reveal(morning); morning.press(forDuration: 0.5, thenDragTo: end)
        XCTAssertTrue(morning.isSelected && end.isSelected)
        assertFinalClock("23:00", "01:00")
        end.tap(); assertFinalClock("23:00", "00:30")
        end.tap(); assertFinalClock("23:00", "01:00")
        XCTAssertTrue(app.buttons["unified-plan-review-roster"].isEnabled)
        capture(app, "final-cross-day-morning-and-summary")
    }

    private func reviewFinalHour(mark: (String) -> Void = { _ in }) {
        let choose = app.buttons["unified-plan-invite-window"]
        XCTAssertTrue(choose.waitForExistence(timeout: 15)); choose.tap()
        let review = app.buttons["unified-plan-review-roster"]
        app.buttons["time-poll-cell-0"].tap(); app.buttons["time-poll-cell-2"].tap(); assertFinalClock("09:00", "10:00")
        mark("owner-final-picked"); capture(app, "final-01-time-block")
        review.tap()
        let send = app.buttons["unified-plan-send-invitations"]
        XCTAssertTrue(send.waitForExistence(timeout: 10)); XCTAssertTrue(send.isEnabled)
        XCTAssertTrue(app.staticTexts["unified-plan-chosen-range"].label.contains("10:00"))
        let peers = app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH 'unified-plan-invite-person-'")).allElementsBoundByIndex
        let peer = peers.first { $0.isEnabled }
        XCTAssertNotNil(peer); peer?.tap(); XCTAssertFalse(send.isEnabled)
        app.buttons["unified-plan-adjust-time"].tap()
        assertFinalClock("09:00", "10:00")
        review.tap(); XCTAssertTrue(send.waitForExistence(timeout: 10)); XCTAssertFalse(send.isEnabled, "Adjusting time preserves the invitation roster")
        peer?.tap(); XCTAssertTrue(send.isEnabled)
        mark("roster-reviewed"); capture(app, "final-03-roster-review")
    }

    private func nativeFinalTimeLargeText(owner: NativeAccount, route: String, bundle: String) {
        app.terminate()
        app = XCUIApplication(bundleIdentifier: bundle)
        app.launchArguments = ["--ui-testing-authenticated", "--ui-testing-ephemeral-credentials", "--ui-testing-skip-tutorial",
            "--ui-testing-time-poll-live", "--ui-testing-deep-link=\(route)", "--ui-testing-language=zh-Hans",
            "--ui-testing-appearance=dark", "--ui-testing-dynamic-type-accessibility"]
        app.launchEnvironment = ["SIDESEAT_QA_ACCESS_TOKEN": owner.accessToken]
        app.launch()
        let choose = app.buttons["unified-plan-invite-window"]
        XCTAssertTrue(choose.waitForExistence(timeout: 20)); XCTAssertTrue(choose.isHittable); choose.tap()
        let review = app.buttons["unified-plan-review-roster"]
        XCTAssertTrue(review.waitForExistence(timeout: 10)); XCTAssertFalse(review.isEnabled)
        let first = app.buttons["time-poll-cell-0"], second = app.buttons["time-poll-cell-2"]
        let footer = app.buttons["unified-plan-review-roster"]
        let top = app.navigationBars.firstMatch.frame.maxY + 20
        for _ in 0..<12 where !first.isHittable || !second.isHittable || first.frame.minY < top || second.frame.maxY >= footer.frame.minY - 20 {
            let origin = app.coordinate(withNormalizedOffset: .zero)
            let bottom = footer.frame.minY - 20
            let startY = (top + bottom) / 2
            let overflow = first.frame.minY < top ? first.frame.minY - top : second.frame.maxY - bottom
            let distance = min(120, max(24, abs(overflow)))
            let endY = startY + (overflow < 0 ? distance : -distance)
            origin.withOffset(CGVector(dx: 80, dy: startY)).press(forDuration: 0.05,
                thenDragTo: origin.withOffset(CGVector(dx: 80, dy: endY)))
        }
        XCTAssertTrue(first.isHittable); XCTAssertTrue(second.isHittable)
        XCTAssertLessThan(second.frame.maxY, footer.frame.minY - 20)
        first.tap(); second.tap(); XCTAssertTrue(review.isEnabled)
        XCTAssertTrue(first.isSelected); XCTAssertTrue(second.isSelected)
        capture(app, "final-04-dark-large-range")
        review.tap()
        let send = app.buttons["unified-plan-send-invitations"]
        XCTAssertTrue(send.waitForExistence(timeout: 10)); XCTAssertTrue(send.isHittable)
        capture(app, "final-05-dark-large-roster")
    }

    private func nativeInvitedTimetableLarge(participant: NativeAccount, route: String, bundle: String) {
        app.terminate(); app = XCUIApplication(bundleIdentifier: bundle)
        app.launchArguments = ["--ui-testing-authenticated", "--ui-testing-ephemeral-credentials", "--ui-testing-skip-tutorial",
            "--ui-testing-time-poll-live", "--ui-testing-deep-link=\(route)", "--ui-testing-language=zh-Hans",
            "--ui-testing-appearance=dark", "--ui-testing-dynamic-type-accessibility"]
        app.launchEnvironment = ["SIDESEAT_QA_ACCESS_TOKEN": participant.accessToken]; app.launch()
        let accept = app.buttons["unified-plan-accept"]
        XCTAssertTrue(accept.waitForExistence(timeout: 20))
        let invited = app.descendants(matching: .any)["plan-invitation-cell-1"].firstMatch
        XCTAssertTrue(invited.waitForExistence(timeout: 10))
        for _ in 0..<12 where !invited.isHittable || invited.frame.maxY >= accept.frame.minY - 20 || invited.frame.minY <= app.navigationBars.firstMatch.frame.maxY {
            let origin = app.coordinate(withNormalizedOffset: .zero)
            let nav = app.navigationBars.firstMatch.frame.maxY
            if invited.frame.minY <= nav {
                let amount = min(180, nav + 20 - invited.frame.minY)
                origin.withOffset(CGVector(dx: 40, dy: nav + 40)).press(forDuration: 0.05,
                    thenDragTo: origin.withOffset(CGVector(dx: 40, dy: nav + 40 + amount)))
            } else {
                let start = min(app.frame.height * 0.65, accept.frame.minY - 24)
                let amount = max(60, min(180, invited.frame.maxY - accept.frame.minY + 28))
                origin.withOffset(CGVector(dx: 40, dy: start)).press(forDuration: 0.05,
                    thenDragTo: origin.withOffset(CGVector(dx: 40, dy: start - amount)))
            }
        }
        XCTAssertTrue(invited.isHittable); XCTAssertTrue(invited.isSelected)
        XCTAssertLessThan(invited.frame.maxY, accept.frame.minY - 20)
        XCTAssertGreaterThan(invited.frame.minY, app.navigationBars.firstMatch.frame.maxY)
        XCTAssertTrue(accept.isHittable); invited.tap(); XCTAssertTrue(accept.isEnabled)
        capture(app, "invitation-01-dark-large")
    }

    private func nativeSignIn(_ account: NativeAccount, bundle: String, accessibility: Bool = false) {
        app?.terminate()
        app = XCUIApplication(bundleIdentifier: bundle)
        app.launchArguments = ["--ui-testing-signed-out", "--ui-testing-ephemeral-credentials", "--ui-testing-skip-tutorial",
            "--ui-testing-language=zh-Hans", "--ui-testing-appearance=light"]
        if accessibility {
            app.launchArguments.removeLast()
            app.launchArguments += ["--ui-testing-appearance=dark", "--ui-testing-dynamic-type-accessibility"]
        }
        app.launchEnvironment = [:]
        app.launch()
        let identifier = app.textFields["login-identifier"]
        XCTAssertTrue(identifier.waitForExistence(timeout: 20)); identifier.tap(); identifier.typeText(account.identifier)
        let password = app.secureTextFields["login-password"]
        password.tap(); password.typeText(account.password)
        app.buttons["login-submit"].tap()
        XCTAssertTrue(app.tabBars.firstMatch.waitForExistence(timeout: 30))
    }
    private func nativeOpenCard(expectedStatus: String? = nil) {
        let card = app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH 'plans-coordinated-'")).firstMatch
        XCTAssertTrue(card.waitForExistence(timeout: 20))
        for _ in 0..<8 where !card.isHittable { app.swipeUp() }
        XCTAssertTrue(card.isHittable)
        if let expectedStatus { XCTAssertEqual(card.value as? String, expectedStatus) }
        capture(app, "native-list-" + String(UUID().uuidString.prefix(8)))
        card.tap()
    }
    private func nativeAssertInline() {
        XCTAssertFalse(app.buttons["time-poll-switch-view"].exists)
        XCTAssertFalse(app.buttons["plan-edit-availability"].exists)
        XCTAssertFalse(app.buttons["time-poll-finish"].exists)
        XCTAssertFalse(app.staticTexts["plan-handoff-guidance"].exists)
    }
    private func nativeWaitSaved() {
        let submit = app.buttons["time-poll-submit"]
        if submit.exists && submit.isEnabled { submit.tap() }
        XCTAssertTrue(app.staticTexts["time-poll-saved"].waitForExistence(timeout: 20))
    }
    private func nativePhase(_ value: String) {
        print("NATIVE_PARTICIPANT_PHASE \(value)")
        // Keep each UI state stable while the Mac checks its real API boundary.
        Thread.sleep(forTimeInterval: 3)
    }

    private func webWaitSaved() {
        let submit = webButton("Submit my availability", "提交我的空闲")
        let update = webButton("Save changes", "保存修改")
        if submit.exists && submit.isEnabled { submit.tap() }
        else if update.exists && update.isEnabled { update.tap() }
        XCTAssertTrue(safari.staticTexts.matching(NSPredicate(format: "label IN %@", ["Availability submitted", "已提交空闲"])).firstMatch.waitForExistence(timeout: 20))
    }
    private func webButton(_ en: String, _ zh: String) -> XCUIElement {
        safari.buttons.matching(NSPredicate(format: "label IN %@", [en, zh])).firstMatch
    }
    private func replace(_ field: XCUIElement, with value: String) {
        field.tap(); field.typeKey("a", modifierFlags: .command); field.typeText(value)
    }
    private func wait(_ element: XCUIElement, labelContains value: String) {
        XCTAssertEqual(XCTWaiter.wait(for: [XCTNSPredicateExpectation(predicate: NSPredicate(format: "label CONTAINS %@", value), object: element)], timeout: 30), .completed)
    }
    private func phase(_ value: String) { print("FIRST_PLAN_PHONE_PHASE \(value)") }
    private func capture(_ surface: XCUIApplication, _ name: String) {
        let attachment = XCTAttachment(screenshot: surface.screenshot())
        attachment.name = "phone-first-plan-" + name; attachment.lifetime = .keepAlways; add(attachment)
    }
}
