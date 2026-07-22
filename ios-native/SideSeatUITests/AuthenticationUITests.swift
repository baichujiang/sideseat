import XCTest

@MainActor
final class AuthenticationUITests: XCTestCase {
    override func setUpWithError() throws {
        continueAfterFailure = false
    }

    func testSignedOutLaunchShowsLoginControls() {
        let app = XCUIApplication()
        app.launchArguments = ["--ui-testing-signed-out"]
        app.launch()

        XCTAssertTrue(app.textFields["login-identifier"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.secureTextFields["login-password"].exists)
        XCTAssertTrue(app.buttons["login-submit"].exists)
    }

    func testCreateActionPresentsBothDestinationsWithoutChangingTabs() {
        let app = XCUIApplication()
        app.launchArguments = ["--ui-testing-authenticated"]
        app.launch()

        let homeTab = app.tabBars.buttons["首页"]
        XCTAssertTrue(homeTab.waitForExistence(timeout: 5))
        XCTAssertTrue(homeTab.isSelected)

        app.tabBars.buttons["发布"].tap()

        let buddy = app.buttons["create-buddy-post"].firstMatch
        let activity = app.buttons["create-activity"].firstMatch
        XCTAssertTrue(buddy.waitForExistence(timeout: 3))
        XCTAssertTrue(activity.exists)
        XCTAssertTrue(homeTab.isSelected)
    }

    func testDiscoverShowsBothFeedsAndCenterCreateOpensBuddyForm() {
        let app = XCUIApplication()
        app.launchArguments = ["--ui-testing-authenticated"]
        app.launch()

        let discoverTab = app.tabBars.buttons["发现"]
        XCTAssertTrue(discoverTab.waitForExistence(timeout: 5))
        discoverTab.tap()
        XCTAssertTrue(app.staticTexts["Library study buddy"].waitForExistence(timeout: 3))

        let activities = app.buttons.matching(
            NSPredicate(format: "label IN %@", ["Activities", "活动"])
        ).firstMatch
        XCTAssertTrue(activities.waitForExistence(timeout: 3))
        activities.tap()
        XCTAssertTrue(app.staticTexts["English conversation meetup"].waitForExistence(timeout: 3))

        app.tabBars.buttons["发布"].tap()
        let buddy = app.buttons["create-buddy-post"].firstMatch
        XCTAssertTrue(buddy.waitForExistence(timeout: 3))
        buddy.tap()
        let title = app.textFields["buddy-title"]
        XCTAssertTrue(title.waitForExistence(timeout: 3))
        title.tap()
        title.typeText("Museum buddy")
        let submit = app.buttons["buddy-submit"]
        XCTAssertTrue(submit.isEnabled)
        submit.tap()
        XCTAssertTrue(app.descendants(matching: .any)["buddy-create-view"].waitForNonExistence(timeout: 3))
        XCTAssertTrue(discoverTab.isSelected)
    }

    func testDiscoverDetailActionsAreReachable() {
        let app = XCUIApplication()
        app.launchArguments = ["--ui-testing-authenticated"]
        app.launch()

        let discoverTab = app.tabBars.buttons["发现"]
        XCTAssertTrue(discoverTab.waitForExistence(timeout: 5))
        discoverTab.tap()

        let buddy = app.descendants(matching: .any)["discover-buddy-ui-buddy"]
        XCTAssertTrue(buddy.waitForExistence(timeout: 3))
        buddy.tap()
        XCTAssertTrue(app.descendants(matching: .any)["discover-post-detail"].waitForExistence(timeout: 3))
        let save = app.buttons["discover-post-save"]
        XCTAssertTrue(save.exists)
        save.tap()
        XCTAssertTrue(app.staticTexts["3 interested"].waitForExistence(timeout: 3))

        app.navigationBars.buttons.element(boundBy: 0).tap()
        let activities = app.buttons.matching(
            NSPredicate(format: "label IN %@", ["Activities", "活动"])
        ).firstMatch
        XCTAssertTrue(activities.waitForExistence(timeout: 3))
        activities.tap()

        let activity = app.descendants(matching: .any)["discover-activity-ui-activity"]
        XCTAssertTrue(activity.waitForExistence(timeout: 3))
        activity.tap()
        XCTAssertTrue(app.descendants(matching: .any)["discover-activity-detail"].waitForExistence(timeout: 3))
        XCTAssertTrue(app.buttons["discover-activity-message"].waitForExistence(timeout: 3))
        let join = app.buttons["discover-activity-join"]
        XCTAssertTrue(join.exists)
        join.tap()
        XCTAssertTrue(app.buttons["discover-activity-cancel-signup"].waitForExistence(timeout: 3))
        let addCalendar = app.buttons["discover-activity-add-calendar"]
        XCTAssertTrue(addCalendar.waitForExistence(timeout: 3))
        addCalendar.tap()
        XCTAssertTrue(app.staticTexts["On SideSeat calendar"].waitForExistence(timeout: 3))
    }

    func testMeTabShowsNativeProfileSummary() {
        let app = XCUIApplication()
        app.launchArguments = ["--ui-testing-authenticated"]
        app.launch()

        let meTab = app.tabBars.buttons["我"]
        XCTAssertTrue(meTab.waitForExistence(timeout: 5))
        meTab.tap()

        XCTAssertTrue(app.descendants(matching: .any)["me-profile"].waitForExistence(timeout: 3))
        XCTAssertTrue(app.staticTexts["Test User"].exists)
        XCTAssertTrue(app.staticTexts["@test_001"].exists)
        XCTAssertTrue(app.staticTexts["TUM · Informatics · Semester 3"].exists)
        XCTAssertTrue(app.staticTexts["Languages"].exists)
        XCTAssertTrue(app.descendants(matching: .any)["profile-discover-city"].waitForExistence(timeout: 3))
        app.swipeUp()
        XCTAssertTrue(app.staticTexts["No contact handles yet"].waitForExistence(timeout: 3))
        XCTAssertTrue(app.buttons["profile-change-username"].waitForExistence(timeout: 3))
        app.swipeUp()
        XCTAssertTrue(app.staticTexts["Discoverable"].waitForExistence(timeout: 3))
    }

    func testMeProfileEditSheetSavesInlineChanges() {
        let app = XCUIApplication()
        app.launchArguments = ["--ui-testing-authenticated"]
        app.launch()

        let meTab = app.tabBars.buttons["我"]
        XCTAssertTrue(meTab.waitForExistence(timeout: 5))
        meTab.tap()

        let edit = app.buttons["profile-edit-button"]
        XCTAssertTrue(edit.waitForExistence(timeout: 3))
        edit.tap()

        let nickname = app.textFields["profile-edit-nickname"]
        XCTAssertTrue(nickname.waitForExistence(timeout: 3))
        nickname.tap()
        nickname.typeText(" Native")

        app.swipeUp()
        let wechat = app.textFields["profile-edit-wechat"]
        XCTAssertTrue(wechat.waitForExistence(timeout: 3))
        wechat.tap()
        wechat.typeText("wx_ui_test")

        let save = app.buttons["profile-edit-save"]
        XCTAssertTrue(save.isEnabled)
        save.tap()

        XCTAssertTrue(app.descendants(matching: .any)["profile-edit"].waitForNonExistence(timeout: 3))
        XCTAssertTrue(app.staticTexts["Test User Native"].waitForExistence(timeout: 3))
        app.swipeUp()
        XCTAssertTrue(
            app.staticTexts["wx_ui_test"].waitForExistence(timeout: 3) ||
                app.descendants(matching: .any)["profile-contact-wechat"].waitForExistence(timeout: 3)
        )
    }

    func testMeUsernameSheetSavesAndShowsCooldown() {
        let app = XCUIApplication()
        app.launchArguments = ["--ui-testing-authenticated"]
        app.launch()

        let meTab = app.tabBars.buttons["我"]
        XCTAssertTrue(meTab.waitForExistence(timeout: 5))
        meTab.tap()

        let changeUsername = app.buttons["profile-change-username"]
        XCTAssertTrue(changeUsername.waitForExistence(timeout: 3))
        changeUsername.tap()

        let username = app.textFields["profile-username-field"]
        XCTAssertTrue(username.waitForExistence(timeout: 3))
        username.tap()
        username.typeText("a")

        let save = app.buttons["profile-username-save"]
        XCTAssertTrue(save.isEnabled)
        save.tap()

        XCTAssertTrue(app.staticTexts["@test_001a"].waitForExistence(timeout: 3))
        XCTAssertFalse(app.buttons["profile-change-username"].isEnabled)
    }

    func testHomeWeekTimetableIsDefault() {
        let app = XCUIApplication()
        app.launchArguments = ["--ui-testing-authenticated"]
        app.launch()

        XCTAssertTrue(app.descendants(matching: .any)["home-date-strip"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.descendants(matching: .any)["home-week-timetable"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.buttons.matching(
            NSPredicate(format: "label IN %@", ["Week", "周"])
        ).firstMatch.exists)
        XCTAssertTrue(app.buttons["home-week-event-ui-recurring-event"].waitForExistence(timeout: 3))
    }

    func testHomeWeekTimetableAnchorsNearCurrentTimeOnToday() {
        let app = XCUIApplication()
        app.launchArguments = ["--ui-testing-authenticated"]
        app.launch()

        let timetable = app.descendants(matching: .any)["home-week-timetable"]
        XCTAssertTrue(timetable.waitForExistence(timeout: 5))

        // Give ScrollViewReader time to settle after layout.
        RunLoop.current.run(until: Date().addingTimeInterval(0.4))

        let expectedTop = timelineScrollTopMinuteNearNow()
        let anchored = app.descendants(matching: .any)["week-scroll-\(expectedTop)"]
        let midnight = app.descendants(matching: .any)["week-scroll-0"]
        XCTAssertTrue(anchored.waitForExistence(timeout: 3))
        XCTAssertTrue(midnight.exists)

        // Anchored slot should sit near the top of the timetable; midnight should be above it.
        XCTAssertLessThan(anchored.frame.minY, timetable.frame.minY + 160)
        if expectedTop >= 120 {
            XCTAssertLessThan(midnight.frame.maxY, timetable.frame.minY + 8)
        }
    }

    func testDayTimelineAnchorsNearCurrentTimeOnToday() {
        let app = XCUIApplication()
        app.launchArguments = ["--ui-testing-authenticated"]
        app.launch()

        let dayMode = app.buttons.matching(
            NSPredicate(format: "label IN %@", ["Day", "日视图"])
        ).firstMatch
        XCTAssertTrue(dayMode.waitForExistence(timeout: 5))
        dayMode.tap()

        let timeline = app.descendants(matching: .any)["calendar-day-timeline"]
        XCTAssertTrue(timeline.waitForExistence(timeout: 3))
        RunLoop.current.run(until: Date().addingTimeInterval(0.4))

        let expectedTop = timelineScrollTopMinuteNearNow()
        let anchored = app.descendants(matching: .any)["calendar-slot-\(expectedTop)"]
        let midnight = app.descendants(matching: .any)["calendar-slot-0"]
        XCTAssertTrue(anchored.waitForExistence(timeout: 3))
        XCTAssertTrue(midnight.exists)

        XCTAssertLessThan(anchored.frame.minY, timeline.frame.minY + 160)
        if expectedTop >= 120 {
            XCTAssertLessThan(midnight.frame.maxY, timeline.frame.minY + 8)
        }
    }

    func testHomeNewEventOpensEditableCalendarForm() {
        let app = XCUIApplication()
        app.launchArguments = ["--ui-testing-authenticated"]
        app.launch()

        let addEvent = app.buttons["new-event"]
        XCTAssertTrue(addEvent.waitForExistence(timeout: 5))
        addEvent.tap()

        let title = app.textFields["event-title"]
        XCTAssertTrue(title.waitForExistence(timeout: 3))
        title.tap()
        title.typeText("Library study")
        XCTAssertEqual(title.value as? String, "Library study")
        XCTAssertTrue(app.buttons["event-save"].isEnabled)
        XCTAssertTrue(app.descendants(matching: .any)["event-start"].exists)
        XCTAssertTrue(app.descendants(matching: .any)["event-end"].exists)
    }

    func testSmartSchedulePreviewsAndSavesAParsedDraft() {
        let app = XCUIApplication()
        app.launchArguments = ["--ui-testing-authenticated", "--ui-testing-smart-schedule"]
        app.launch()

        let addMenu = app.buttons["calendar-add-menu"]
        XCTAssertTrue(addMenu.waitForExistence(timeout: 5))
        addMenu.tap()
        let smartAdd = app.buttons.matching(
            NSPredicate(format: "label IN %@", ["Smart add", "智能添加"])
        ).firstMatch
        XCTAssertTrue(smartAdd.waitForExistence(timeout: 3))
        smartAdd.tap()

        let input = app.textViews["smart-schedule-input"]
        XCTAssertTrue(input.waitForExistence(timeout: 3))
        input.tap()
        input.typeText("Tomorrow at 3 in the library")
        app.buttons["smart-schedule-parse"].tap()

        XCTAssertTrue(app.staticTexts["Library study"].waitForExistence(timeout: 3))
        let save = app.buttons["smart-schedule-save"]
        XCTAssertTrue(save.exists)
        save.tap()
        XCTAssertTrue(app.descendants(matching: .any)["smart-schedule-view"].waitForNonExistence(timeout: 3))
    }

    func testRecurringEventSaveOffersThreeUpdateScopes() {
        let app = XCUIApplication()
        app.launchArguments = ["--ui-testing-authenticated"]
        app.launch()

        let listMode = app.buttons.matching(
            NSPredicate(format: "label IN %@", ["List", "列表"])
        ).firstMatch
        XCTAssertTrue(listMode.waitForExistence(timeout: 5))
        listMode.tap()

        let event = app.buttons["agenda-event-ui-recurring-event"]
        XCTAssertTrue(event.waitForExistence(timeout: 5))
        event.tap()

        let save = app.buttons["event-save"]
        XCTAssertTrue(save.waitForExistence(timeout: 3))
        save.tap()

        let thisEvent = app.buttons.matching(
            NSPredicate(format: "label IN %@", ["Only this event", "仅此日程"])
        ).firstMatch
        let futureEvents = app.buttons.matching(
            NSPredicate(format: "label IN %@", ["This and future events", "本次及以后"])
        ).firstMatch
        let allEvents = app.buttons.matching(
            NSPredicate(format: "label IN %@", ["All events", "整个系列"])
        ).firstMatch
        XCTAssertTrue(thisEvent.waitForExistence(timeout: 3))
        XCTAssertTrue(futureEvents.exists)
        XCTAssertTrue(allEvents.exists)
    }

    func testDayTimelineTapOpensNewEventEditorDirectly() {
        let app = XCUIApplication()
        app.launchArguments = ["--ui-testing-authenticated"]
        app.launch()

        let dayMode = app.buttons.matching(
            NSPredicate(format: "label IN %@", ["Day", "日视图"])
        ).firstMatch
        XCTAssertTrue(dayMode.waitForExistence(timeout: 5))
        dayMode.tap()

        XCTAssertTrue(app.descendants(matching: .any)["calendar-day-timeline"].waitForExistence(timeout: 3))
        let targetMinute = dayTimelineCreateTargetMinute()
        let slot = app.descendants(matching: .any)["calendar-slot-\(targetMinute)"]
        XCTAssertTrue(slot.waitForExistence(timeout: 3))
        slot.tap()

        XCTAssertTrue(app.textFields["event-title"].waitForExistence(timeout: 3))
        XCTAssertFalse(app.buttons["calendar-slot-new-event"].exists)
    }

    func testDayTimelineLongPressShowsPreciseNewEventAction() {
        let app = XCUIApplication()
        app.launchArguments = ["--ui-testing-authenticated"]
        app.launch()

        let dayMode = app.buttons.matching(
            NSPredicate(format: "label IN %@", ["Day", "日视图"])
        ).firstMatch
        XCTAssertTrue(dayMode.waitForExistence(timeout: 5))
        dayMode.tap()

        XCTAssertTrue(app.descendants(matching: .any)["calendar-day-timeline"].waitForExistence(timeout: 3))
        let targetMinute = dayTimelineCreateTargetMinute()
        let slot = app.descendants(matching: .any)["calendar-slot-\(targetMinute)"]
        XCTAssertTrue(slot.waitForExistence(timeout: 3))
        slot.press(forDuration: 1.2)

        let newEvent = app.buttons.matching(
            NSPredicate(format: "label BEGINSWITH %@ OR label CONTAINS %@", "New event at", "新建日程")
        ).firstMatch
        XCTAssertTrue(newEvent.waitForExistence(timeout: 3))
        newEvent.tap()
        XCTAssertTrue(app.textFields["event-title"].waitForExistence(timeout: 3))
    }

    func testDayTimelineMovesRecurringEventWithExplicitScope() {
        let app = XCUIApplication()
        app.launchArguments = ["--ui-testing-authenticated"]
        app.launch()

        let dayMode = app.buttons.matching(
            NSPredicate(format: "label IN %@", ["Day", "日视图"])
        ).firstMatch
        XCTAssertTrue(dayMode.waitForExistence(timeout: 5))
        dayMode.tap()

        let event = app.buttons["Weekly planning"]
        XCTAssertTrue(event.waitForExistence(timeout: 3))
        event.press(forDuration: 1.2)
        let move = app.buttons.matching(
            NSPredicate(format: "label IN %@", ["Move event", "移动日程"])
        ).firstMatch
        XCTAssertTrue(move.waitForExistence(timeout: 3))
        move.tap()

        XCTAssertTrue(app.descendants(matching: .any)["calendar-move-banner"].waitForExistence(timeout: 3))
        let target = app.buttons["calendar-move-target-180"]
        XCTAssertTrue(target.waitForExistence(timeout: 3))
        target.tap()

        XCTAssertTrue(app.buttons["calendar-move-this"].waitForExistence(timeout: 3))
        XCTAssertTrue(app.buttons["calendar-move-future"].exists)
        XCTAssertTrue(app.buttons["calendar-move-all"].exists)
    }

    func testCoursesOpenFromHomeAndShowCourseDetail() {
        let app = XCUIApplication()
        app.launchArguments = ["--ui-testing-authenticated"]
        app.launch()

        let courses = app.buttons["open-courses"]
        XCTAssertTrue(courses.waitForExistence(timeout: 5))
        courses.tap()

        XCTAssertTrue(app.descendants(matching: .any)["courses-list"].waitForExistence(timeout: 3))
        let course = app.descendants(matching: .any)["course-row-ui-course"]
        XCTAssertTrue(course.waitForExistence(timeout: 3))
        course.tap()

        XCTAssertTrue(app.descendants(matching: .any)["course-detail"].waitForExistence(timeout: 3))
        XCTAssertTrue(app.buttons["course-join"].exists)
        XCTAssertTrue(app.buttons["course-save"].exists)
        XCTAssertFalse(app.buttons["course-open-chat"].exists)
        XCTAssertTrue(app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH 'course-use-schedule-'")).firstMatch.exists)

        app.buttons["course-join"].tap()
        let openChat = app.buttons["course-open-chat"]
        XCTAssertTrue(openChat.waitForExistence(timeout: 3))
        XCTAssertTrue(app.buttons["course-leave"].exists)
        XCTAssertTrue(app.staticTexts["2 条未读"].waitForExistence(timeout: 3))
        openChat.tap()
        XCTAssertTrue(app.descendants(matching: .any)["course-chat"].waitForExistence(timeout: 3))
    }

    func testCalendarListCreatesCustomCalendar() {
        let app = XCUIApplication()
        app.launchArguments = ["--ui-testing-authenticated"]
        app.launch()

        let calendars = app.buttons["manage-calendars"]
        XCTAssertTrue(calendars.waitForExistence(timeout: 5))
        calendars.tap()
        XCTAssertTrue(app.descendants(matching: .any)["calendar-list"].waitForExistence(timeout: 3))

        app.buttons["calendar-add"].tap()
        let name = app.textFields["calendar-name"]
        XCTAssertTrue(name.waitForExistence(timeout: 3))
        name.tap()
        name.typeText("Road trip")
        app.buttons["calendar-save"].tap()

        XCTAssertTrue(app.staticTexts["Road trip"].waitForExistence(timeout: 3))
    }

    func testCalendarListExposesImportAndExportActions() {
        let app = XCUIApplication()
        app.launchArguments = ["--ui-testing-authenticated"]
        app.launch()

        let calendars = app.buttons["manage-calendars"]
        XCTAssertTrue(calendars.waitForExistence(timeout: 5))
        calendars.tap()
        XCTAssertTrue(app.descendants(matching: .any)["calendar-list"].waitForExistence(timeout: 3))

        let actions = app.buttons["calendar-actions"]
        XCTAssertTrue(actions.waitForExistence(timeout: 3))
        actions.tap()
        let importAction = app.buttons.matching(
            NSPredicate(format: "label IN %@", ["Import iCalendar", "导入 iCalendar"])
        ).firstMatch
        let exportAction = app.buttons.matching(
            NSPredicate(format: "label IN %@", ["Export iCalendar", "导出 iCalendar"])
        ).firstMatch
        XCTAssertTrue(importAction.waitForExistence(timeout: 3))
        XCTAssertTrue(exportAction.exists)
    }

    func testPublicProfileMessageOpensDirectChatRoute() {
        let app = XCUIApplication()
        app.launchArguments = ["--ui-testing-authenticated", "--ui-testing-public-profile"]
        app.launch()

        XCTAssertTrue(app.descendants(matching: .any)["public-profile"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["米娜"].exists)

        let message = app.buttons["public-profile-message"]
        XCTAssertTrue(message.waitForExistence(timeout: 3))
        message.tap()

        XCTAssertTrue(app.descendants(matching: .any)["direct-chat"].waitForExistence(timeout: 3))
        XCTAssertTrue(app.staticTexts["图书馆见？"].waitForExistence(timeout: 3))
        XCTAssertTrue(app.textFields["chat-composer-field"].waitForExistence(timeout: 3))
    }

    func testInboxOpensDirectChatAndSendsMessage() {
        let app = XCUIApplication()
        app.launchArguments = ["--ui-testing-authenticated", "--ui-testing-chats"]
        app.launch()

        XCTAssertTrue(app.descendants(matching: .any)["inbox-list"].waitForExistence(timeout: 5))
        let row = app.descendants(matching: .any)["inbox-row-ui-connection"]
        XCTAssertTrue(row.waitForExistence(timeout: 3))
        row.tap()

        XCTAssertTrue(app.descendants(matching: .any)["direct-chat"].waitForExistence(timeout: 3))
        let field = app.textFields["chat-composer-field"]
        XCTAssertTrue(field.waitForExistence(timeout: 3))
        field.tap()
        field.typeText("我在路上了")
        app.buttons["chat-composer-send"].tap()
        XCTAssertTrue(app.staticTexts["我在路上了"].waitForExistence(timeout: 3))
    }

    func testDirectChatReplyAndDelete() {
        let app = XCUIApplication()
        app.launchArguments = ["--ui-testing-authenticated", "--ui-testing-chats"]
        app.launch()

        XCTAssertTrue(app.descendants(matching: .any)["inbox-list"].waitForExistence(timeout: 5))
        app.descendants(matching: .any)["inbox-row-ui-connection"].tap()
        XCTAssertTrue(app.descendants(matching: .any)["direct-chat"].waitForExistence(timeout: 3))
        XCTAssertTrue(app.staticTexts["图书馆见？"].waitForExistence(timeout: 3))
        app.buttons["chat-composer-attach"].tap()
        XCTAssertTrue(app.buttons["chat-composer-photo"].waitForExistence(timeout: 2))

        openChatContextAction(
            in: app,
            bubbleID: "chat-bubble-ui-msg-1",
            actionID: "chat-reply-ui-msg-1",
            actionLabels: ["Reply", "回复"]
        )
        XCTAssertTrue(
            app.staticTexts.matching(NSPredicate(format: "label BEGINSWITH %@", "Replying to"))
                .firstMatch
                .waitForExistence(timeout: 3)
        )

        let field = app.textFields["chat-composer-field"]
        field.tap()
        field.typeText("到时候见")
        app.buttons["chat-composer-send"].tap()
        XCTAssertTrue(app.staticTexts["到时候见"].waitForExistence(timeout: 3))
        let quote = app.descendants(matching: .any).matching(
            NSPredicate(format: "identifier BEGINSWITH %@", "chat-quote-")
        ).firstMatch
        XCTAssertTrue(quote.waitForExistence(timeout: 3))

        // LazyVStack may unload older rows after auto-scroll-to-bottom; reveal them first.
        let chatScroll = app.scrollViews["direct-chat"].firstMatch
        if chatScroll.exists {
            chatScroll.swipeDown()
            chatScroll.swipeDown()
        }
        openChatContextAction(
            in: app,
            bubbleID: "chat-bubble-ui-msg-2",
            actionID: "chat-delete-ui-msg-2",
            actionLabels: ["Delete", "删除"]
        )
        let confirm = app.buttons.matching(NSPredicate(format: "label IN %@", ["Delete", "删除"])).firstMatch
        XCTAssertTrue(confirm.waitForExistence(timeout: 3))
        confirm.tap()
        XCTAssertTrue(app.descendants(matching: .any)["chat-tombstone-ui-msg-2"].waitForExistence(timeout: 3))
        XCTAssertTrue(app.staticTexts["Message deleted"].exists)
    }

    func testDirectChatLocationSendAndReport() {
        let app = XCUIApplication()
        app.launchArguments = ["--ui-testing-authenticated", "--ui-testing-chats"]
        app.launch()

        XCTAssertTrue(app.descendants(matching: .any)["inbox-list"].waitForExistence(timeout: 5))
        app.descendants(matching: .any)["inbox-row-ui-connection"].tap()
        XCTAssertTrue(app.descendants(matching: .any)["direct-chat"].waitForExistence(timeout: 3))

        let locationBubbles = app.descendants(matching: .any).matching(
            NSPredicate(format: "identifier == %@", "chat-location")
        )
        let locationsBefore = locationBubbles.count
        app.buttons["chat-composer-attach"].tap()
        let location = app.buttons["chat-composer-location"]
        XCTAssertTrue(location.waitForExistence(timeout: 3))
        location.tap()
        let expectation = XCTNSPredicateExpectation(
            predicate: NSPredicate(format: "count > %d", locationsBefore),
            object: locationBubbles
        )
        XCTAssertEqual(XCTWaiter.wait(for: [expectation], timeout: 3), .completed)

        openChatContextAction(
            in: app,
            bubbleID: "chat-bubble-ui-msg-1",
            actionID: "chat-report-ui-msg-1",
            actionLabels: ["Report", "举报"]
        )
        let sheet = app.descendants(matching: .any)["chat-report-sheet"]
        XCTAssertTrue(sheet.waitForExistence(timeout: 3))
        app.buttons["chat-report-send"].tap()
        let dismissed = XCTNSPredicateExpectation(
            predicate: NSPredicate(format: "exists == false"),
            object: sheet
        )
        XCTAssertEqual(XCTWaiter.wait(for: [dismissed], timeout: 3), .completed)
    }

    func testInboxOpensCourseChatAndSendsMessage() {
        let app = XCUIApplication()
        app.launchArguments = ["--ui-testing-authenticated", "--ui-testing-chats"]
        app.launch()

        XCTAssertTrue(app.descendants(matching: .any)["inbox-list"].waitForExistence(timeout: 5))
        let row = app.descendants(matching: .any)["inbox-row-ui-course"]
        XCTAssertTrue(row.waitForExistence(timeout: 3))
        row.tap()

        XCTAssertTrue(app.descendants(matching: .any)["course-chat"].waitForExistence(timeout: 3))
        XCTAssertTrue(app.staticTexts["Anyone free for the tutorial?"].waitForExistence(timeout: 3))
        let field = app.textFields["chat-composer-field"]
        XCTAssertTrue(field.waitForExistence(timeout: 3))
        field.tap()
        field.typeText("I am free")
        app.buttons["chat-composer-send"].tap()
        XCTAssertTrue(app.staticTexts["I am free"].waitForExistence(timeout: 3))
    }

    func testInboxOpensGroupChatAndSendsMessage() {
        let app = XCUIApplication()
        app.launchArguments = ["--ui-testing-authenticated", "--ui-testing-chats"]
        app.launch()

        XCTAssertTrue(app.descendants(matching: .any)["inbox-list"].waitForExistence(timeout: 5))
        let row = app.descendants(matching: .any)["inbox-row-ui-group"]
        XCTAssertTrue(row.waitForExistence(timeout: 3))
        row.tap()

        XCTAssertTrue(app.descendants(matching: .any)["group-chat"].waitForExistence(timeout: 3))
        XCTAssertTrue(app.staticTexts["四点图书馆？"].waitForExistence(timeout: 3))
        let field = app.textFields["chat-composer-field"]
        XCTAssertTrue(field.waitForExistence(timeout: 3))
        field.tap()
        field.typeText("我在路上了")
        app.buttons["chat-composer-send"].tap()
        XCTAssertTrue(app.staticTexts["我在路上了"].waitForExistence(timeout: 3))
    }

    func testInboxSearchFiltersConversations() {
        let app = XCUIApplication()
        app.launchArguments = ["--ui-testing-authenticated", "--ui-testing-chats"]
        app.launch()

        XCTAssertTrue(app.descendants(matching: .any)["inbox-list"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.descendants(matching: .any)["inbox-row-ui-course"].waitForExistence(timeout: 3))

        let search = app.searchFields.firstMatch
        XCTAssertTrue(search.waitForExistence(timeout: 3))
        search.tap()
        search.typeText("算法")
        XCTAssertTrue(app.descendants(matching: .any)["inbox-row-ui-course"].waitForExistence(timeout: 3))
        XCTAssertFalse(app.descendants(matching: .any)["inbox-row-ui-connection"].exists)

        search.typeText("zzzz-no-match")
        XCTAssertTrue(app.descendants(matching: .any)["inbox-empty-no-matches"].waitForExistence(timeout: 3))
    }

    func testInboxPinAndHideCourseRow() {
        let app = XCUIApplication()
        app.launchArguments = ["--ui-testing-authenticated", "--ui-testing-chats"]
        app.launch()

        XCTAssertTrue(app.descendants(matching: .any)["inbox-list"].waitForExistence(timeout: 5))
        let course = app.descendants(matching: .any)["inbox-row-ui-course"]
        XCTAssertTrue(course.waitForExistence(timeout: 3))
        course.swipeLeft()
        let pin = app.buttons.matching(NSPredicate(format: "label IN %@", ["Pin", "置顶"])).firstMatch
        XCTAssertTrue(pin.waitForExistence(timeout: 3))
        pin.tap()
        XCTAssertTrue(app.staticTexts["置顶"].waitForExistence(timeout: 3))

        let pinnedCourse = app.descendants(matching: .any)["inbox-row-ui-course"]
        XCTAssertTrue(pinnedCourse.waitForExistence(timeout: 3))
        pinnedCourse.swipeLeft()
        let hide = app.buttons.matching(NSPredicate(format: "label IN %@", ["Hide", "隐藏"])).firstMatch
        XCTAssertTrue(hide.waitForExistence(timeout: 3))
        hide.tap()
        let gone = XCTNSPredicateExpectation(
            predicate: NSPredicate(format: "exists == false"),
            object: pinnedCourse
        )
        XCTAssertEqual(XCTWaiter.wait(for: [gone], timeout: 3), .completed)
    }

    func testInboxToolbarOpensContactsAndGroupCreate() {
        let app = XCUIApplication()
        app.launchArguments = ["--ui-testing-authenticated", "--ui-testing-chats"]
        app.launch()

        XCTAssertTrue(app.descendants(matching: .any)["inbox-list"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.descendants(matching: .any)["inbox-chip-plans"].waitForExistence(timeout: 3))

        app.buttons["inbox-toolbar-more"].tap()
        let contactsItem = app.descendants(matching: .any)["inbox-toolbar-contacts"].firstMatch
        if contactsItem.waitForExistence(timeout: 2) {
            contactsItem.tap()
        } else if app.buttons["Add friend"].waitForExistence(timeout: 1) {
            app.buttons["Add friend"].tap()
        } else {
            app.buttons["添加好友"].tap()
        }
        XCTAssertTrue(app.descendants(matching: .any)["contacts-root"].waitForExistence(timeout: 3))
        XCTAssertTrue(app.descendants(matching: .any)["contact-row-ui-connection"].waitForExistence(timeout: 3))
    }

    func testInboxPlansChipOpensPlansAndDirectPlanCard() {
        let app = XCUIApplication()
        app.launchArguments = ["--ui-testing-authenticated", "--ui-testing-chats"]
        app.launch()

        XCTAssertTrue(app.descendants(matching: .any)["inbox-list"].waitForExistence(timeout: 5))
        app.buttons["inbox-chip-plans"].tap()
        XCTAssertTrue(app.descendants(matching: .any)["plans-root"].waitForExistence(timeout: 3))
        XCTAssertTrue(app.descendants(matching: .any)["plans-row-ui-plan-1"].waitForExistence(timeout: 3))
        app.descendants(matching: .any)["plans-row-ui-plan-1"].tap()
        XCTAssertTrue(app.descendants(matching: .any)["direct-chat"].waitForExistence(timeout: 3))
        XCTAssertTrue(app.descendants(matching: .any)["plan-card-ui-plan-1"].waitForExistence(timeout: 3))
        app.swipeUp()
        XCTAssertTrue(app.descendants(matching: .any)["schedule-share-card"].waitForExistence(timeout: 3))
        app.descendants(matching: .any)["schedule-share-card"].tap()
        XCTAssertTrue(app.descendants(matching: .any)["schedule-share-recipient"].waitForExistence(timeout: 3))
        XCTAssertTrue(app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH %@", "schedule-share-slot-")).firstMatch.waitForExistence(timeout: 3))
    }

    func testMeSettingsAndFeedbackScaffold() {
        let app = XCUIApplication()
        app.launchArguments = ["--ui-testing-authenticated"]
        app.launch()

        app.tabBars.buttons["我"].tap()
        XCTAssertTrue(app.descendants(matching: .any)["me-profile"].waitForExistence(timeout: 5))
        let settings = app.descendants(matching: .any)["me-settings"]
        XCTAssertTrue(settings.waitForExistence(timeout: 3))
        settings.tap()
        XCTAssertTrue(app.descendants(matching: .any)["settings-root"].waitForExistence(timeout: 3))
        XCTAssertTrue(app.descendants(matching: .any)["settings-support-store"].waitForExistence(timeout: 3))
        app.descendants(matching: .any)["settings-support-store"].tap()
        XCTAssertTrue(app.descendants(matching: .any)["support-store"].waitForExistence(timeout: 3))
        XCTAssertTrue(
            app.descendants(matching: .any)["support-tier-app.sideseat.support.tier1"].waitForExistence(timeout: 3)
        )
        app.navigationBars.buttons.firstMatch.tap()

        XCTAssertTrue(app.descendants(matching: .any)["settings-delete-account"].waitForExistence(timeout: 3))
        app.descendants(matching: .any)["settings-delete-account"].tap()
        XCTAssertTrue(app.descendants(matching: .any)["delete-account-sheet"].waitForExistence(timeout: 3))
        app.buttons["delete-account-cancel"].tap()

        let feedback = app.descendants(matching: .any)["settings-feedback"]
        XCTAssertTrue(feedback.waitForExistence(timeout: 3))
        feedback.tap()
        XCTAssertTrue(app.descendants(matching: .any)["feedback-root"].waitForExistence(timeout: 3))
        XCTAssertTrue(app.descendants(matching: .any)["feedback-row-ui-feedback-1"].waitForExistence(timeout: 3))
        app.descendants(matching: .any)["feedback-row-ui-feedback-1"].tap()
        XCTAssertTrue(app.descendants(matching: .any)["feedback-detail"].waitForExistence(timeout: 3))
        XCTAssertTrue(app.buttons["feedback-upvote"].waitForExistence(timeout: 3))
    }

    func testDirectChatSearchAndActionsMenu() {
        let app = XCUIApplication()
        app.launchArguments = ["--ui-testing-authenticated", "--ui-testing-chats"]
        app.launch()

        XCTAssertTrue(app.descendants(matching: .any)["inbox-list"].waitForExistence(timeout: 5))
        app.descendants(matching: .any)["inbox-row-ui-connection"].tap()
        XCTAssertTrue(app.descendants(matching: .any)["direct-chat"].waitForExistence(timeout: 3))

        app.buttons["direct-chat-actions"].tap()
        let searchItem = app.descendants(matching: .any)["direct-chat-search"].firstMatch
        if searchItem.waitForExistence(timeout: 2) {
            searchItem.tap()
        } else if app.buttons["Search chat"].waitForExistence(timeout: 1) {
            app.buttons["Search chat"].tap()
        } else {
            app.buttons["搜索聊天"].tap()
        }
        XCTAssertTrue(app.descendants(matching: .any)["thread-search-sheet"].waitForExistence(timeout: 3))
        let done = app.buttons["thread-search-done"]
        XCTAssertTrue(done.waitForExistence(timeout: 3))
        done.tap()

        app.buttons["direct-chat-actions"].tap()
        XCTAssertTrue(
            app.buttons["Edit remark"].waitForExistence(timeout: 3)
                || app.buttons["编辑备注"].waitForExistence(timeout: 1)
        )
    }

    func testGroupChatInfoFromToolbar() {
        let app = XCUIApplication()
        app.launchArguments = ["--ui-testing-authenticated", "--ui-testing-chats"]
        app.launch()

        XCTAssertTrue(app.descendants(matching: .any)["inbox-list"].waitForExistence(timeout: 5))
        app.descendants(matching: .any)["inbox-row-ui-group"].tap()
        XCTAssertTrue(app.descendants(matching: .any)["group-chat"].waitForExistence(timeout: 3))
        app.buttons["group-chat-actions"].tap()
        let infoItem = app.descendants(matching: .any)["group-chat-info"].firstMatch
        if infoItem.waitForExistence(timeout: 2) {
            infoItem.tap()
        } else if app.buttons["Group info"].waitForExistence(timeout: 1) {
            app.buttons["Group info"].tap()
        } else {
            app.buttons["群聊信息"].tap()
        }
        XCTAssertTrue(app.descendants(matching: .any)["group-info-root"].waitForExistence(timeout: 3))
    }

    func testCourseChatRestoreHiddenInboxBanner() {
        let app = XCUIApplication()
        app.launchArguments = [
            "--ui-testing-authenticated",
            "--ui-testing-chats",
            "--ui-testing-inbox-hidden",
        ]
        app.launch()

        XCTAssertTrue(app.descendants(matching: .any)["inbox-list"].waitForExistence(timeout: 5))
        app.descendants(matching: .any)["inbox-row-ui-course"].tap()
        XCTAssertTrue(app.descendants(matching: .any)["course-chat"].waitForExistence(timeout: 3))
        let banner = app.descendants(matching: .any)["inbox-restore-banner"]
        XCTAssertTrue(banner.waitForExistence(timeout: 3))
        let restore = app.buttons["inbox-restore-button"].exists
            ? app.buttons["inbox-restore-button"]
            : app.buttons["Show in Chats"]
        XCTAssertTrue(restore.waitForExistence(timeout: 3))
        restore.tap()
        let dismissed = XCTNSPredicateExpectation(
            predicate: NSPredicate(format: "exists == false"),
            object: banner
        )
        XCTAssertEqual(XCTWaiter.wait(for: [dismissed], timeout: 3), .completed)
    }

    /// Opens a bubble context menu and taps an action (by accessibility id or localized label).
    private func openChatContextAction(
        in app: XCUIApplication,
        bubbleID: String,
        actionID: String,
        actionLabels: [String]
    ) {
        let bubble = app.descendants(matching: .any)[bubbleID]
        XCTAssertTrue(bubble.waitForExistence(timeout: 3))
        bubble.press(forDuration: 1.0)

        let byID = app.buttons[actionID]
        if byID.waitForExistence(timeout: 2) {
            byID.tap()
            return
        }
        let byLabel = app.buttons.matching(
            NSPredicate(format: "label IN %@", actionLabels)
        ).firstMatch
        XCTAssertTrue(byLabel.waitForExistence(timeout: 2), "Missing context action \(actionID)/\(actionLabels)")
        byLabel.tap()
    }

    /// Prefer a nearby empty 30-minute slot so create UI tests avoid crowding near "now".
    private func dayTimelineCreateTargetMinute() -> Int {
        var berlin = Calendar(identifier: .gregorian)
        berlin.timeZone = TimeZone(identifier: "Europe/Berlin")!
        let now = Date()
        let currentMinute = berlin.component(.hour, from: now) * 60 + berlin.component(.minute, from: now)
        return currentMinute <= 21 * 60
            ? min(23 * 60 + 30, ((currentMinute + 120) / 30) * 30)
            : max(0, ((currentMinute - 120) / 30) * 30)
    }

    /// Matches `CalendarTimelineScrollAnchor` today policy (now − 60m, snapped to 30m).
    private func timelineScrollTopMinuteNearNow() -> Int {
        var berlin = Calendar(identifier: .gregorian)
        berlin.timeZone = TimeZone(identifier: "Europe/Berlin")!
        let now = Date()
        let currentMinute = berlin.component(.hour, from: now) * 60 + berlin.component(.minute, from: now)
        let floored = max(0, currentMinute - 60)
        return min(23 * 60 + 30, (floored / 30) * 30)
    }
}
