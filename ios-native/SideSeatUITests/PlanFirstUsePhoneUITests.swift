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
        let collect = app.buttons["plan-mode-collect"]
        XCTAssertTrue(collect.waitForExistence(timeout: 10))
        XCTAssertTrue(app.buttons["plan-mode-fixed"].exists)
        capture(app, "02-choice"); collect.tap()
        let title = app.textFields["time-poll-title"]
        XCTAssertTrue(title.waitForExistence(timeout: 10)); title.tap(); title.typeText(fixture.title + "\n")
        let next = app.buttons["plan-create-next"]
        XCTAssertTrue(next.isHittable); next.tap()
        XCTAssertTrue(app.descendants(matching: .any)["time-poll-dates"].firstMatch.waitForExistence(timeout: 10))
        let submit = app.buttons["time-poll-create-confirm"]
        XCTAssertTrue(submit.isHittable); XCTAssertTrue(submit.isEnabled)
        capture(app, "03-create"); submit.tap()
        XCTAssertTrue(app.staticTexts["time-poll-result-heading"].waitForExistence(timeout: 25))
        let emptyCell = app.descendants(matching: .any)["time-poll-cell-0"].firstMatch
        XCTAssertTrue(emptyCell.exists, "An empty timetable must be visible immediately after creation")
        XCTAssertTrue(emptyCell.label.hasSuffix(", 0"))
        XCTAssertTrue(app.buttons["plan-share-primary"].isHittable, "Sharing must not require anyone to fill in first")
        XCTAssertTrue(app.textFields["time-poll-name"].exists)
        XCTAssertFalse(app.buttons["plan-edit-availability"].exists)
        XCTAssertFalse(app.buttons["time-poll-switch-view"].exists)
        capture(app, "03a-empty-timetable"); phase("created-empty")
        // Reopening a plan with no responses must still show the timetable.
        app.navigationBars.buttons.element(boundBy: 0).tap()
        let card = app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH 'plans-coordinated-'")).firstMatch
        XCTAssertTrue(card.waitForExistence(timeout: 15)); card.tap()
        XCTAssertTrue(app.staticTexts["time-poll-result-heading"].waitForExistence(timeout: 15))
        XCTAssertTrue(app.descendants(matching: .any)["time-poll-cell-0"].firstMatch.label.hasSuffix(", 0"))
        XCTAssertEqual(app.textFields["time-poll-name"].value as? String, "Host Ming")
        let firstOwn = app.buttons["time-poll-cell-0"], secondOwn = app.buttons["time-poll-cell-2"]
        XCTAssertTrue(firstOwn.isHittable); XCTAssertTrue(secondOwn.isHittable)
        firstOwn.press(forDuration: 0.6, thenDragTo: secondOwn)
        XCTAssertTrue(firstOwn.isSelected); XCTAssertTrue(secondOwn.isSelected)
        XCTAssertTrue(app.staticTexts["time-poll-saved"].waitForExistence(timeout: 20))
        firstOwn.tap()
        XCTAssertFalse(firstOwn.isSelected); wait(firstOwn, labelContains: ", 0")
        app.buttons["time-poll-undo"].tap()
        XCTAssertTrue(firstOwn.isSelected)
        let day = app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH 'time-poll-day-'")).firstMatch
        day.tap()
        XCTAssertTrue(app.buttons["time-poll-cell-4"].isSelected)
        app.buttons["time-poll-undo"].tap()
        XCTAssertFalse(app.buttons["time-poll-cell-4"].isSelected)
        XCTAssertTrue(firstOwn.isSelected); XCTAssertTrue(secondOwn.isSelected)
        XCTAssertTrue(app.staticTexts["time-poll-saved"].waitForExistence(timeout: 20))
        capture(app, "04-owner-saved"); phase("created-and-saved")
        XCTAssertFalse(app.buttons["time-poll-finish"].exists, "Inline edits must not require a second completion step")
        app.navigationBars.buttons.element(boundBy: 0).tap()
        XCTAssertTrue(card.waitForExistence(timeout: 15)); card.tap()
        XCTAssertTrue(app.staticTexts["time-poll-result-heading"].waitForExistence(timeout: 15))
        XCTAssertTrue(app.buttons["time-poll-cell-0"].isSelected)
        XCTAssertTrue(app.buttons["time-poll-cell-2"].isSelected)
        let share = app.buttons["plan-share-primary"]
        XCTAssertTrue(share.isHittable)
        XCTAssertEqual(share.label, "发给朋友填写")
        let copyLink = app.buttons["plan-copy-link"]
        XCTAssertEqual(copyLink.label, "复制链接")
        XCTAssertTrue(copyLink.isHittable)
        XCTAssertGreaterThanOrEqual(copyLink.frame.height, 44)
        copyLink.tap()
        XCTAssertEqual(copyLink.label, "链接已复制")
        XCTAssertFalse(app.buttons["plan-edit-availability"].exists)
        let ownCell = app.descendants(matching: .any)["time-poll-cell-0"].firstMatch
        XCTAssertTrue(ownCell.exists, "Saving must keep the timetable visible even with no friend responses")
        XCTAssertTrue(ownCell.label.hasSuffix(", 1"))
        XCTAssertLessThan(ownCell.frame.maxY, share.frame.minY)
        capture(app, "05-next-share"); share.tap()
        // iOS 26 exposes share actions as cells; earlier releases use buttons.
        let copyLabels = NSPredicate(format: "label IN %@", ["Copy", "拷贝", "复制"])
        let copyCell = app.cells.matching(copyLabels).firstMatch
        let copy = copyCell.waitForExistence(timeout: 3) ? copyCell : app.buttons.matching(copyLabels).firstMatch
        XCTAssertTrue(copy.waitForExistence(timeout: 10), "The system share sheet must offer copying the plan link")
        capture(app, "05-system-share"); copy.tap()
        XCTAssertEqual(XCTWaiter.wait(for: [XCTNSPredicateExpectation(predicate: NSPredicate(format: "hittable == true"), object: app.buttons["plan-copy-link"])], timeout: 10), .completed)
        app.buttons["plan-copy-link"].tap()
        XCTAssertEqual(app.buttons["plan-copy-link"].label, "链接已复制")

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
        XCTAssertTrue(safari.staticTexts.matching(NSPredicate(format: "label IN %@", ["Saved automatically", "已自动保存"])).firstMatch.waitForExistence(timeout: 20))
        capture(safari, "06-guest-saved"); phase("guest-saved")
        XCTAssertTrue(first.exists, "Autosave must keep the same editable timetable visible")
        XCTAssertTrue(nextStep.exists)
        XCTAssertFalse(webButton("View responses", "看大家填写").exists)
        capture(safari, "07-guest-results")

        app.activate()
        let responses = app.buttons["plan-people-open"]
        XCTAssertTrue(responses.waitForExistence(timeout: 15)); responses.tap()
        let people = app.staticTexts["time-poll-participants"]
        wait(people, labelContains: "Guest Lin")
        capture(app, "detail-guest-responses")
        app.buttons["plan-people-done"].tap()
        let sharedCell = app.buttons["time-poll-cell-0"]
        wait(sharedCell, labelContains: ", 2")
        sharedCell.tap()
        wait(sharedCell, labelContains: ", 1")
        XCTAssertFalse(sharedCell.isSelected)
        XCTAssertTrue(app.staticTexts["time-poll-saved"].waitForExistence(timeout: 20))
        capture(app, "08a-own-time-removed-friend-kept"); phase("owner-edited")
        app.navigationBars.buttons.element(boundBy: 0).tap()
        XCTAssertTrue(card.waitForExistence(timeout: 15)); card.tap()
        XCTAssertTrue(sharedCell.waitForExistence(timeout: 15))
        XCTAssertFalse(sharedCell.isSelected); wait(sharedCell, labelContains: ", 1")
        sharedCell.tap()
        wait(sharedCell, labelContains: ", 2")
        XCTAssertTrue(sharedCell.isSelected)
        XCTAssertTrue(app.staticTexts["time-poll-saved"].waitForExistence(timeout: 20))
        phase("owner-restored")
        reviewFinalHour()
        let send = app.buttons["unified-plan-send-invitations"]
        capture(app, "09-review-invitation"); send.tap()
        let count = app.staticTexts["unified-plan-confirmation-count"]
        wait(count, labelContains: "1/2 人已确认")
        XCTAssertEqual(app.buttons["unified-plan-choose-again"].label, "另选时间")
        capture(app, "10-awaiting-confirmation"); phase("awaiting-confirmation")

        safari.activate()
        let accept = webButton("Confirm participation", "确认参加")
        XCTAssertTrue(accept.waitForExistence(timeout: 35))
        XCTAssertTrue(safari.staticTexts["受邀时间表"].waitForExistence(timeout: 15))
        let invited = safari.staticTexts.matching(NSPredicate(format: "label == %@", "受邀时段")).firstMatch
        XCTAssertTrue(invited.isHittable); invited.tap()
        XCTAssertTrue(accept.isEnabled)
        capture(safari, "11-guest-invitation"); accept.tap()
        XCTAssertTrue(safari.staticTexts.matching(NSPredicate(format: "label IN %@", ["Plan confirmed", "计划已确定"])).firstMatch.waitForExistence(timeout: 25))
        capture(safari, "12-guest-confirmed")
        app.activate(); wait(count, labelContains: "2/2 人已确认")
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

    private struct NativeAccount: Decodable {
        let role: String
        let identifier: String
        let password: String
        let accessToken: String
    }
    private struct NativeFixture: Decodable {
        let title: String
        let bundle: String
        let accounts: [NativeAccount]
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
        XCTAssertTrue(create.waitForExistence(timeout: 20)); create.tap()
        app.buttons["plan-mode-collect"].tap()
        let title = app.textFields["time-poll-title"]
        XCTAssertTrue(title.waitForExistence(timeout: 10)); title.tap(); title.typeText(fixture.title + "\n")
        app.buttons["plan-create-next"].tap()
        app.buttons["time-poll-create-confirm"].tap()
        XCTAssertTrue(app.staticTexts["time-poll-result-heading"].waitForExistence(timeout: 20))
        XCTAssertGreaterThan(app.scrollViews["time-poll-grid"].frame.height, app.frame.height * 0.35,
                             "The timetable should be the main working area on first entry")
        XCTAssertLessThan(app.staticTexts["time-poll-detail-title"].frame.minY, app.scrollViews["time-poll-grid"].frame.minY)
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
        let heading = app.staticTexts["time-poll-result-heading"]
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
        let grid = app.scrollViews["time-poll-grid"].firstMatch
        let swipeOrigin = app.coordinate(withNormalizedOffset: .zero)
        let swipeX = first.frame.midX
        let swipeStartY = app.staticTexts["time-poll-saved"].frame.minY - 24
        let swipeEndY = max(grid.frame.minY + 24, first.frame.minY + 24)
        swipeOrigin.withOffset(CGVector(dx: swipeX, dy: swipeStartY)).press(forDuration: 0.05,
            thenDragTo: swipeOrigin.withOffset(CGVector(dx: swipeX, dy: swipeEndY)))
        XCTAssertFalse(first.isHittable, "An ordinary swipe must scroll rather than change free time")
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
        XCTAssertTrue(app.staticTexts["time-poll-result-heading"].waitForExistence(timeout: 20))
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
        nativePhase("confirmed"); capture(app, "native-09-participant-confirmed")
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

    func testNativeConfirmedPlanUsesUpcomingSummary() throws {
        let raw = ProcessInfo.processInfo.environment["SIDESEAT_NATIVE_PARTICIPANT_JSON"]
        try XCTSkipIf(raw == nil || raw!.isEmpty, "Requires the confirmed disposable native plan.")
        let fixture = try JSONDecoder().decode(NativeFixture.self, from: Data(raw!.utf8))
        let participant = try XCTUnwrap(fixture.accounts.first { $0.role == "participant" })
        addTeardownBlock { [self] in MainActor.assumeIsolated { app?.terminate() } }
        nativeSignIn(participant, bundle: fixture.bundle)
        app.tabBars.buttons["计划"].tap()
        app.segmentedControls["plans-segmented-control"].buttons.element(boundBy: 1).tap()
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

    private func reviewFinalHour(mark: (String) -> Void = { _ in }) {
        let choose = app.buttons["unified-plan-invite-window"]
        XCTAssertTrue(choose.waitForExistence(timeout: 15))
        XCTAssertEqual(choose.label, "选择最终时间")
        XCTAssertTrue(app.buttons["plan-share-primary"].isHittable)
        XCTAssertTrue(app.buttons["plan-copy-link"].isHittable)
        capture(app, "action-choose-share-copy")
        choose.tap()
        let review = app.buttons["unified-plan-review-roster"]
        XCTAssertTrue(review.waitForExistence(timeout: 10)); XCTAssertFalse(review.isEnabled)
        let first = app.buttons["time-poll-cell-0"], second = app.buttons["time-poll-cell-2"]
        XCTAssertFalse(first.isSelected, "Final time starts empty even if my availability is selected")
        first.tap(); XCTAssertTrue(first.isSelected); XCTAssertFalse(second.isSelected)
        second.tap(); XCTAssertTrue(first.isSelected); XCTAssertTrue(second.isSelected)
        XCTAssertTrue(app.staticTexts["time-poll-final-range"].label.contains("10:00"))
        mark("owner-final-picked"); capture(app, "final-01-tap-range")
        app.buttons["time-poll-cancel-final"].tap()
        XCTAssertTrue(first.isSelected); XCTAssertTrue(second.isSelected)
        wait(first, labelContains: ", 2")
        choose.tap(); XCTAssertFalse(review.isEnabled)
        let day = app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH 'time-poll-day-'")).firstMatch
        day.tap()
        XCTAssertTrue(app.buttons["time-poll-cell-4"].isSelected)
        first.press(forDuration: 0.6, thenDragTo: second)
        XCTAssertTrue(first.isSelected); XCTAssertTrue(second.isSelected)
        XCTAssertFalse(app.buttons["time-poll-cell-4"].isSelected)
        review.tap()
        let send = app.buttons["unified-plan-send-invitations"]
        XCTAssertTrue(send.waitForExistence(timeout: 10)); XCTAssertTrue(send.isEnabled)
        XCTAssertTrue(app.staticTexts["unified-plan-chosen-range"].label.contains("10:00"))
        XCTAssertFalse(app.buttons["unified-plan-invite-from"].exists)
        XCTAssertFalse(app.buttons["unified-plan-invite-until"].exists)
        let peers = app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH 'unified-plan-invite-person-'")).allElementsBoundByIndex
        let peer = peers.first { $0.isEnabled }
        XCTAssertNotNil(peer); peer?.tap(); XCTAssertFalse(send.isEnabled)
        app.buttons["unified-plan-adjust-time"].tap()
        XCTAssertTrue(first.waitForExistence(timeout: 10)); XCTAssertTrue(first.isSelected); XCTAssertTrue(second.isSelected)
        capture(app, "final-02-drag-range")
        review.tap(); XCTAssertTrue(send.waitForExistence(timeout: 10)); XCTAssertFalse(send.isEnabled, "Adjusting time must preserve the invitation roster")
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
        let footer = app.staticTexts["time-poll-final-heading"]
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

    private func nativeSignIn(_ account: NativeAccount, bundle: String) {
        app?.terminate()
        app = XCUIApplication(bundleIdentifier: bundle)
        app.launchArguments = ["--ui-testing-signed-out", "--ui-testing-ephemeral-credentials", "--ui-testing-skip-tutorial",
            "--ui-testing-language=zh-Hans", "--ui-testing-appearance=light"]
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
    private func nativeWaitSaved() { XCTAssertTrue(app.staticTexts["time-poll-saved"].waitForExistence(timeout: 20)) }
    private func nativePhase(_ value: String) {
        print("NATIVE_PARTICIPANT_PHASE \(value)")
        // Keep each UI state stable while the Mac checks its real API boundary.
        Thread.sleep(forTimeInterval: 3)
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
