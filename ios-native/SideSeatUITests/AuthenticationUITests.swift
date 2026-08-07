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

    func testCreateActionOpensPlanWithoutChangingTabs() {
        let app = XCUIApplication()
        app.launchArguments = ["--ui-testing-authenticated"]
        app.launch()

        let calendarTab = app.tabBars.buttons.matching(
            NSPredicate(format: "label IN %@", ["Calendar", "日历"])
        ).firstMatch
        XCTAssertTrue(calendarTab.waitForExistence(timeout: 5))
        XCTAssertTrue(calendarTab.isSelected)

        app.tabBars.buttons["发布"].tap()

        XCTAssertTrue(app.descendants(matching: .any)["buddy-create-view"].waitForExistence(timeout: 5))
        XCTAssertTrue(calendarTab.isSelected)
    }

    func testDiscoverUsesOneCompactNavigationTitle() {
        let app = XCUIApplication()
        app.launchArguments = [
            "--ui-testing-authenticated",
            "--ui-testing-skip-tutorial",
            "--ui-testing-discover",
        ]
        app.launch()

        let title = app.descendants(matching: .any)["root-navigation-title"]
        XCTAssertTrue(title.waitForExistence(timeout: 5))
        XCTAssertTrue(title.label.contains("Discover") || title.label.contains("发现"))
        XCTAssertLessThanOrEqual(title.frame.height, 44)
        XCTAssertEqual(
            app.staticTexts.matching(
                NSPredicate(format: "label == 'Discover' OR label == '发现'")
            ).count,
            1
        )

        let discoverList = app.descendants(matching: .any)["discover-list"]
        XCTAssertTrue(discoverList.waitForExistence(timeout: 3))
        XCTAssertLessThan(title.frame.maxY, discoverList.frame.midY)

        let screenshot = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
        screenshot.name = "Unified Discover title"
        screenshot.lifetime = .keepAlways
        add(screenshot)
    }

    func testProductTutorialShowsCustomerFacingCopy() {
        let app = XCUIApplication()
        app.launchArguments = ["--ui-testing-authenticated", "--ui-testing-product-tutorial"]
        app.launch()

        XCTAssertTrue(app.descendants(matching: .any)["product-tutorial"].waitForExistence(timeout: 5))
        let calendarValueCopy = app.staticTexts.matching(
            NSPredicate(
                format: "label IN %@",
                [
                    "Know what your week looks like before you commit to another plan.",
                    "先看清这一周的安排，再决定是否加入新计划。",
                ]
            )
        ).firstMatch
        XCTAssertTrue(calendarValueCopy.waitForExistence(timeout: 3))

        let internalCopy = app.staticTexts.matching(
            NSPredicate(
                format: "label CONTAINS[c] 'the guide' OR label CONTAINS[c] 'switches tabs' OR label CONTAINS '应用会按步骤切换标签' OR label CONTAINS '引导保持精简'"
            )
        )
        XCTAssertEqual(internalCopy.count, 0)
    }

    func testDiscoverShowsUnifiedPlansAndCenterCreateOpensPlanForm() {
        let app = XCUIApplication()
        app.launchArguments = ["--ui-testing-authenticated"]
        app.launch()

        let discoverTab = app.tabBars.buttons["发现"]
        XCTAssertTrue(discoverTab.waitForExistence(timeout: 5))
        discoverTab.tap()
        XCTAssertTrue(app.staticTexts["Library study buddy"].waitForExistence(timeout: 3))
        XCTAssertTrue(app.staticTexts["English conversation meetup"].waitForExistence(timeout: 3))
        XCTAssertTrue(app.descendants(matching: .any)["discover-school-verification-ui-buddy"].exists)
        XCTAssertTrue(app.descendants(matching: .any)["discover-status-ui-buddy"].exists)
        XCTAssertTrue(app.descendants(matching: .any)["discover-status-activity-ui-activity"].exists)

        app.tabBars.buttons["发布"].tap()
        let title = app.textFields["buddy-title"]
        XCTAssertTrue(title.waitForExistence(timeout: 5))
        title.tap()
        title.typeText("Museum buddy")
        let body = app.textViews["buddy-body"]
        XCTAssertTrue(body.waitForExistence(timeout: 3))
        body.tap()
        body.typeText("Looking for someone to visit the museum this weekend. #museum")
        XCTAssertTrue(app.staticTexts["#museum"].waitForExistence(timeout: 2))
        XCTAssertTrue(app.staticTexts["所有人"].waitForExistence(timeout: 2))
        let keyboardDone = app.buttons["buddy-keyboard-done"].firstMatch
        XCTAssertTrue(keyboardDone.waitForExistence(timeout: 2))
        keyboardDone.tap()
        let submit = app.buttons.matching(
            NSPredicate(format: "label == 'Post' OR label == '发布'")
        ).firstMatch
        XCTAssertTrue(submit.waitForExistence(timeout: 3))
        XCTAssertTrue(submit.isEnabled)
        submit.tap()
        XCTAssertTrue(app.descendants(matching: .any)["buddy-create-view"].waitForNonExistence(timeout: 5))
        XCTAssertTrue(discoverTab.isSelected)
    }

    func testDiscoverDetailActionsAreReachable() {
        let app = XCUIApplication()
        app.launchArguments = ["--ui-testing-authenticated"]
        app.launch()

        let discoverTab = app.tabBars.buttons["发现"]
        XCTAssertTrue(discoverTab.waitForExistence(timeout: 5))
        discoverTab.tap()

        let plan = app.descendants(matching: .any)["discover-plan-ui-buddy"]
        XCTAssertTrue(plan.waitForExistence(timeout: 3))
        app.staticTexts["Library study buddy"].tap()
        XCTAssertTrue(app.descendants(matching: .any)["discover-post-detail"].waitForExistence(timeout: 3))
        XCTAssertTrue(app.staticTexts["Main Library, Munich"].waitForExistence(timeout: 3))
        let group = app.staticTexts["discover-plan-group"]
        XCTAssertTrue(group.waitForExistence(timeout: 3))
        XCTAssertTrue(group.label.contains("2"))
        XCTAssertTrue(app.descendants(matching: .any)["discover-plan-verified-host"].exists)

        let share = app.buttons["discover-plan-share"]
        XCTAssertTrue(share.waitForExistence(timeout: 3))
        share.tap()
        XCTAssertTrue(app.descendants(matching: .any)["discover-plan-share-preview"].waitForExistence(timeout: 3))
        XCTAssertTrue(app.descendants(matching: .any)["discover-plan-share-card"].exists)
        app.buttons["discover-plan-share-done"].tap()
        XCTAssertTrue(app.descendants(matching: .any)["discover-plan-share-preview"].waitForNonExistence(timeout: 3))

        let save = app.buttons["discover-post-save"]
        XCTAssertTrue(save.exists)
        save.tap()
        let updatedGroup = NSPredicate(format: "label CONTAINS '3'")
        expectation(for: updatedGroup, evaluatedWith: group)
        waitForExpectations(timeout: 3)

        app.navigationBars.buttons.element(boundBy: 0).tap()
        let activity = app.descendants(matching: .any)["discover-plan-legacy-ui-activity"]
        XCTAssertTrue(activity.waitForExistence(timeout: 3))
        app.staticTexts["English conversation meetup"].tap()
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
        XCTAssertTrue(app.descendants(matching: .any)["me-school-identity"].exists)
        XCTAssertFalse(app.buttons["me-school-verification"].exists)
        XCTAssertFalse(app.staticTexts["English · Fluent"].exists)
        XCTAssertFalse(app.staticTexts["German · Conversational"].exists)
        XCTAssertFalse(app.descendants(matching: .any)["profile-discover-city"].exists)
        app.swipeUp()
        XCTAssertTrue(app.descendants(matching: .any)["me-contacts"].waitForExistence(timeout: 3))
        XCTAssertTrue(app.buttons["profile-change-username"].waitForExistence(timeout: 3))
        app.swipeUp()
        XCTAssertTrue(app.buttons["profile-privacy-settings"].waitForExistence(timeout: 3))
    }

    func testMeProfileDoesNotDependOnCityConfiguration() {
        let app = XCUIApplication()
        app.launchArguments = ["--ui-testing-authenticated", "--ui-testing-slow-city-config"]
        app.launch()

        let meTab = app.tabBars.buttons["我"]
        XCTAssertTrue(meTab.waitForExistence(timeout: 5))
        meTab.tap()

        XCTAssertTrue(app.descendants(matching: .any)["me-profile"].waitForExistence(timeout: 2))
        XCTAssertTrue(app.staticTexts["Test User"].exists)
        XCTAssertFalse(app.staticTexts["Profile unavailable"].exists)
    }

    func testMeAndSettingsUseGermanLocalization() {
        let app = XCUIApplication()
        app.launchArguments = [
            "--ui-testing-authenticated",
            "-AppleLanguages", "(de)",
            "-AppleLocale", "de_DE",
        ]
        app.launch()

        let meTab = app.tabBars.buttons["Ich"]
        XCTAssertTrue(meTab.waitForExistence(timeout: 5))
        meTab.tap()

        XCTAssertTrue(app.staticTexts["Mein Bereich"].waitForExistence(timeout: 3))
        XCTAssertTrue(app.staticTexts["Meine Pläne"].exists)
        XCTAssertTrue(app.staticTexts["Kurse, Kommilitonen und Kurschats"].exists)
        XCTAssertTrue(app.staticTexts["Einladungen und bevorstehende Treffen"].exists)

        let settings = app.descendants(matching: .any)["me-settings"]
        if !settings.waitForExistence(timeout: 2) || !settings.isHittable {
            app.swipeUp()
        }
        XCTAssertTrue(settings.waitForExistence(timeout: 3))
        settings.tap()

        XCTAssertTrue(app.staticTexts["Stadt"].waitForExistence(timeout: 3))
        let language = app.descendants(matching: .any)["settings-language"]
        XCTAssertTrue(language.exists)
        XCTAssertEqual(language.value as? String, "Deutsch")
        XCTAssertTrue(app.buttons["App-Einführung erneut anzeigen"].exists)

        let feedback = app.descendants(matching: .any)["settings-feedback"]
        if !feedback.waitForExistence(timeout: 2) || !feedback.isHittable {
            app.swipeUp()
        }
        XCTAssertTrue(feedback.waitForExistence(timeout: 3))
        feedback.tap()

        let compose = app.buttons["feedback-compose"]
        XCTAssertTrue(compose.waitForExistence(timeout: 3))
        compose.tap()
        XCTAssertTrue(app.navigationBars["Neues Feedback"].waitForExistence(timeout: 3))
        XCTAssertTrue(app.staticTexts["Thema"].exists)
        XCTAssertTrue(app.staticTexts["Idee"].exists)
        XCTAssertTrue(app.textFields["Titel (optional)"].exists)
    }

    func testSettingsLanguageOpensIPhoneSettings() {
        let app = XCUIApplication()
        let iphoneSettings = XCUIApplication(bundleIdentifier: "com.apple.Preferences")
        app.launchArguments = ["--ui-testing-authenticated"]
        app.launch()

        let meTab = app.tabBars.buttons.element(boundBy: 4)
        XCTAssertTrue(meTab.waitForExistence(timeout: 5))
        meTab.tap()

        let settings = app.descendants(matching: .any)["me-settings"]
        if !settings.waitForExistence(timeout: 2) || !settings.isHittable {
            app.swipeUp()
        }
        XCTAssertTrue(settings.waitForExistence(timeout: 3))
        settings.tap()

        let language = app.descendants(matching: .any)["settings-language"]
        XCTAssertTrue(language.waitForExistence(timeout: 3))
        language.tap()
        XCTAssertTrue(app.wait(for: .runningBackground, timeout: 3))
        XCTAssertTrue(iphoneSettings.wait(for: .runningForeground, timeout: 3))
        app.activate()
        XCTAssertTrue(app.wait(for: .runningForeground, timeout: 3))
    }

    func testMePrivacySettingsSaveAsOneFocusedFlow() {
        let app = XCUIApplication()
        app.launchArguments = ["--ui-testing-authenticated"]
        app.launch()

        let meTab = app.tabBars.buttons["我"]
        XCTAssertTrue(meTab.waitForExistence(timeout: 5))
        meTab.tap()

        let privacyEntry = app.buttons["profile-privacy-settings"]
        if !privacyEntry.waitForExistence(timeout: 2) {
            app.swipeUp()
        }
        XCTAssertTrue(privacyEntry.waitForExistence(timeout: 3))
        privacyEntry.tap()

        XCTAssertTrue(app.descendants(matching: .any)["profile-privacy"].waitForExistence(timeout: 3))
        let discover = app.switches["profile-privacy-discover"]
        let courseMembers = app.switches["profile-privacy-course-members"]
        let contactExchange = app.switches["profile-privacy-contact-exchange"]
        XCTAssertTrue(discover.waitForExistence(timeout: 3))
        XCTAssertTrue(courseMembers.exists)
        XCTAssertTrue(contactExchange.exists)
        XCTAssertEqual(discover.value as? String, "1")
        XCTAssertEqual(contactExchange.value as? String, "0")

        discover.tap()
        contactExchange.tap()
        let save = app.buttons["profile-privacy-save"]
        XCTAssertTrue(save.isEnabled)
        save.tap()
        XCTAssertTrue(app.descendants(matching: .any)["profile-privacy"].waitForNonExistence(timeout: 3))

        privacyEntry.tap()
        XCTAssertTrue(app.descendants(matching: .any)["profile-privacy"].waitForExistence(timeout: 3))
        XCTAssertEqual(app.switches["profile-privacy-discover"].value as? String, "0")
        XCTAssertEqual(app.switches["profile-privacy-contact-exchange"].value as? String, "1")
    }

    func testMeOpensPublishedPlanManager() {
        let app = XCUIApplication()
        app.launchArguments = ["--ui-testing-authenticated"]
        app.launch()

        let meTab = app.tabBars.buttons["我"]
        XCTAssertTrue(meTab.waitForExistence(timeout: 5))
        meTab.tap()

        let posts = app.buttons["me-posts"]
        if !posts.waitForExistence(timeout: 2) {
            app.swipeUp()
        }
        XCTAssertTrue(posts.waitForExistence(timeout: 3))
        posts.tap()

        XCTAssertTrue(app.descendants(matching: .any)["my-posts-list"].waitForExistence(timeout: 3))
        XCTAssertTrue(app.navigationBars.firstMatch.waitForExistence(timeout: 3))
        XCTAssertTrue(app.navigationBars.buttons.firstMatch.exists)
        XCTAssertTrue(app.staticTexts["Library study buddy"].waitForExistence(timeout: 3))
        XCTAssertTrue(app.staticTexts["English conversation meetup"].waitForExistence(timeout: 3))
    }

    func testMeEditsAnActivePublishedPlan() {
        let app = XCUIApplication()
        app.launchArguments = ["--ui-testing-authenticated"]
        app.launch()

        let meTab = app.tabBars.buttons["我"]
        XCTAssertTrue(meTab.waitForExistence(timeout: 5))
        meTab.tap()

        let posts = app.buttons["me-posts"]
        if !posts.waitForExistence(timeout: 2) {
            app.swipeUp()
        }
        XCTAssertTrue(posts.waitForExistence(timeout: 3))
        posts.tap()

        let edit = app.buttons["my-post-edit-ui-buddy"]
        XCTAssertTrue(edit.waitForExistence(timeout: 3))
        edit.tap()
        XCTAssertTrue(app.descendants(matching: .any)["buddy-edit-view"].waitForExistence(timeout: 3))

        let title = app.textFields["buddy-title"]
        XCTAssertTrue(title.waitForExistence(timeout: 3))
        title.tap()
        title.typeText(" Updated")
        let keyboardDone = app.buttons["buddy-keyboard-done"]
        XCTAssertTrue(keyboardDone.waitForExistence(timeout: 2))
        keyboardDone.tap()

        let editScreenshot = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
        editScreenshot.name = "Edit published plan"
        editScreenshot.lifetime = .keepAlways
        add(editScreenshot)

        let save = app.buttons["buddy-submit"]
        XCTAssertTrue(save.waitForExistence(timeout: 3))
        XCTAssertTrue(save.isEnabled)
        save.tap()

        XCTAssertTrue(app.descendants(matching: .any)["buddy-edit-view"].waitForNonExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["Library study buddy Updated"].waitForExistence(timeout: 3))
    }

    func testMeRepostsPlanClosedAfterSchoolChange() {
        let app = XCUIApplication()
        app.launchArguments = ["--ui-testing-authenticated"]
        app.launch()

        let meTab = app.tabBars.buttons["我"]
        XCTAssertTrue(meTab.waitForExistence(timeout: 5))
        meTab.tap()

        let posts = app.buttons["me-posts"]
        if !posts.waitForExistence(timeout: 2) {
            app.swipeUp()
        }
        XCTAssertTrue(posts.waitForExistence(timeout: 3))
        posts.tap()

        let repost = app.buttons["my-post-repost-ui-school-changed-post"]
        if !repost.waitForExistence(timeout: 2) {
            app.swipeUp()
        }
        XCTAssertTrue(repost.waitForExistence(timeout: 3))
        repost.tap()

        XCTAssertTrue(app.descendants(matching: .any)["buddy-repost-view"].waitForExistence(timeout: 3))
        XCTAssertTrue(app.descendants(matching: .any)["buddy-repost-notice"].exists)

        let submit = app.buttons["buddy-submit"]
        XCTAssertTrue(submit.waitForExistence(timeout: 3))
        XCTAssertFalse(submit.isEnabled)

        let currentCourse = app.buttons["buddy-course-ui-course"]
        for _ in 0..<4 where !currentCourse.isHittable {
            app.swipeUp()
        }
        XCTAssertTrue(currentCourse.isHittable)
        currentCourse.tap()
        XCTAssertTrue(submit.isEnabled)
        submit.tap()

        XCTAssertTrue(app.descendants(matching: .any)["buddy-repost-view"].waitForNonExistence(timeout: 5))
        XCTAssertGreaterThanOrEqual(
            app.staticTexts.matching(identifier: "Find classmates for algorithms").count,
            2
        )
    }

    func testSettingsCanPrepareSideSeatInviteForXiaohongshu() {
        let app = XCUIApplication()
        app.launchArguments = ["--ui-testing-authenticated"]
        app.launch()

        let meTab = app.tabBars.buttons["我"]
        XCTAssertTrue(meTab.waitForExistence(timeout: 5))
        meTab.tap()

        let settings = app.buttons["me-settings"]
        if !settings.waitForExistence(timeout: 2) {
            app.swipeUp()
        }
        XCTAssertTrue(settings.waitForExistence(timeout: 3))
        settings.tap()

        let share = app.buttons["settings-share-sideseat"]
        if !share.waitForExistence(timeout: 2) || !share.isHittable {
            app.swipeUp()
        }
        XCTAssertTrue(share.waitForExistence(timeout: 3))
        share.tap()

        XCTAssertTrue(app.descendants(matching: .any)["sideseat-app-share-preview"].waitForExistence(timeout: 3))
        XCTAssertTrue(app.descendants(matching: .any)["sideseat-app-share-card"].exists)
        XCTAssertTrue(app.buttons["sideseat-app-share-copy"].exists)
        XCTAssertTrue(app.buttons["sideseat-app-share-system"].exists)
        app.buttons["sideseat-app-share-done"].tap()
        XCTAssertTrue(app.descendants(matching: .any)["sideseat-app-share-preview"].waitForNonExistence(timeout: 3))
    }

    func testMeProfileEditSheetSavesInlineChanges() {
        let app = XCUIApplication()
        app.launchArguments = ["--ui-testing-authenticated"]
        app.launch()

        let meTab = app.tabBars.buttons["我"]
        XCTAssertTrue(meTab.waitForExistence(timeout: 5))
        meTab.tap()

        let edit = app.buttons["me-hero-edit"]
        XCTAssertTrue(edit.waitForExistence(timeout: 3))
        edit.tap()

        let nickname = app.textFields["profile-edit-nickname"]
        XCTAssertTrue(nickname.waitForExistence(timeout: 3))
        nickname.tap()
        nickname.typeText(" Native")

        let scrollStart = app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.72))
        let scrollEnd = app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.46))
        scrollStart.press(forDuration: 0.1, thenDragTo: scrollEnd)
        let wechat = app.textFields["profile-edit-wechat"]
        XCTAssertTrue(wechat.waitForExistence(timeout: 3))
        wechat.tap()
        wechat.typeText("wx_ui_test")

        let save = app.buttons["profile-edit-save"]
        XCTAssertTrue(save.isEnabled)
        save.tap()
        let confirm = app.buttons["profile-edit-confirm-school-change"].firstMatch
        XCTAssertTrue(confirm.waitForExistence(timeout: 3))
        confirm.tap()

        XCTAssertTrue(app.descendants(matching: .any)["profile-edit"].waitForNonExistence(timeout: 3))
        XCTAssertTrue(app.staticTexts["Test User Native"].waitForExistence(timeout: 3))
    }

    func testMeProfileEditSheetProtectsUnsavedChanges() {
        let app = XCUIApplication()
        app.launchArguments = ["--ui-testing-authenticated"]
        app.launch()

        let meTab = app.tabBars.buttons["我"]
        XCTAssertTrue(meTab.waitForExistence(timeout: 5))
        meTab.tap()

        let edit = app.buttons["me-hero-edit"]
        XCTAssertTrue(edit.waitForExistence(timeout: 3))
        edit.tap()

        let nickname = app.textFields["profile-edit-nickname"]
        XCTAssertTrue(nickname.waitForExistence(timeout: 3))
        nickname.tap()
        nickname.typeText(" Draft")

        let close = app.buttons["profile-edit-close"]
        XCTAssertTrue(close.waitForExistence(timeout: 3))
        let dragStart = app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.09))
        let dragEnd = app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.78))
        dragStart.press(forDuration: 0.1, thenDragTo: dragEnd)

        let keepEditing = app.buttons["profile-edit-keep-editing"].firstMatch
        XCTAssertTrue(keepEditing.waitForExistence(timeout: 3))
        keepEditing.tap()
        XCTAssertTrue(app.descendants(matching: .any)["profile-edit"].exists)
        XCTAssertEqual(nickname.value as? String, "Test User Draft")

        close.tap()
        let discard = app.buttons["profile-edit-discard"].firstMatch
        XCTAssertTrue(discard.waitForExistence(timeout: 3))
        discard.tap()
        XCTAssertTrue(app.descendants(matching: .any)["profile-edit"].waitForNonExistence(timeout: 3))

        edit.tap()
        XCTAssertTrue(app.descendants(matching: .any)["profile-edit"].waitForExistence(timeout: 3))
        app.buttons["profile-edit-close"].tap()
        XCTAssertTrue(app.descendants(matching: .any)["profile-edit"].waitForNonExistence(timeout: 3))
        XCTAssertFalse(app.buttons["profile-edit-discard"].exists)
    }

    func testMeProfileSchoolChangeRequiresNewVerification() {
        let app = XCUIApplication()
        app.launchArguments = ["--ui-testing-authenticated"]
        app.launch()

        let meTab = app.tabBars.buttons["我"]
        XCTAssertTrue(meTab.waitForExistence(timeout: 5))
        meTab.tap()

        let edit = app.buttons["me-hero-edit"]
        XCTAssertTrue(edit.waitForExistence(timeout: 3))
        edit.tap()

        let school = app.buttons["profile-edit-school"]
        XCTAssertTrue(school.waitForExistence(timeout: 3))
        school.tap()
        let lmu = app.buttons["LMU"].firstMatch
        XCTAssertTrue(lmu.waitForExistence(timeout: 3))
        lmu.tap()

        XCTAssertTrue(
            app.descendants(matching: .any)["profile-edit-school-verification-warning"]
                .waitForExistence(timeout: 3)
        )

        let save = app.buttons["profile-edit-save"]
        XCTAssertTrue(save.isEnabled)
        save.tap()

        let confirmSchoolChange = app.buttons["profile-edit-confirm-school-change"].firstMatch
        XCTAssertTrue(confirmSchoolChange.waitForExistence(timeout: 3))
        confirmSchoolChange.tap()

        XCTAssertTrue(app.descendants(matching: .any)["profile-edit"].waitForNonExistence(timeout: 3))
        XCTAssertTrue(app.buttons["me-school-verification"].waitForExistence(timeout: 3))
        XCTAssertFalse(app.descendants(matching: .any)["me-school-identity"].exists)
        XCTAssertTrue(app.descendants(matching: .any)["me-school-change-result"].waitForExistence(timeout: 3))

        let viewArchive = app.buttons["me-school-change-view-archive"]
        XCTAssertTrue(viewArchive.exists)
        viewArchive.tap()
        XCTAssertTrue(app.descendants(matching: .any)["course-archived-list"].waitForExistence(timeout: 3))
    }

    func testMeSchoolIdentityOpensVerificationFromProfileCard() {
        let app = XCUIApplication()
        app.launchArguments = ["--ui-testing-authenticated", "--ui-testing-unverified-profile"]
        app.launch()

        let meTab = app.tabBars.buttons["我"]
        XCTAssertTrue(meTab.waitForExistence(timeout: 5))
        meTab.tap()

        let schoolIdentity = app.buttons["me-school-verification"]
        XCTAssertTrue(schoolIdentity.waitForExistence(timeout: 3))
        schoolIdentity.tap()

        XCTAssertTrue(app.textFields["student-verification-email"].waitForExistence(timeout: 3))
        let submit = app.buttons["student-verification-submit"]
        XCTAssertTrue(submit.exists)
        XCTAssertTrue(submit.isEnabled)
        submit.tap()

        XCTAssertTrue(app.descendants(matching: .any)["student-verification-delivery-status"].waitForExistence(timeout: 3))
        XCTAssertTrue(app.buttons["student-verification-open-link"].exists)
        XCTAssertFalse(app.buttons["student-verification-submit"].exists)
        let requested = app.descendants(matching: .any)["student-verification-requested"]
        XCTAssertTrue(requested.exists)

        let resultScreenshot = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
        resultScreenshot.name = "School verification result"
        resultScreenshot.lifetime = .keepAlways
        add(resultScreenshot)
    }

    func testMePendingAndRejectedSchoolIdentityRemainActionable() {
        let pendingApp = XCUIApplication()
        pendingApp.launchArguments = ["--ui-testing-authenticated", "--ui-testing-pending-profile"]
        pendingApp.launch()

        let pendingMeTab = pendingApp.tabBars.buttons["我"]
        XCTAssertTrue(pendingMeTab.waitForExistence(timeout: 5))
        pendingMeTab.tap()
        XCTAssertTrue(pendingApp.buttons["me-school-verification"].waitForExistence(timeout: 3))
        XCTAssertFalse(pendingApp.descendants(matching: .any)["me-school-identity"].exists)
        pendingApp.terminate()

        let rejectedApp = XCUIApplication()
        rejectedApp.launchArguments = ["--ui-testing-authenticated", "--ui-testing-rejected-profile"]
        rejectedApp.launch()

        let rejectedMeTab = rejectedApp.tabBars.buttons["我"]
        XCTAssertTrue(rejectedMeTab.waitForExistence(timeout: 5))
        rejectedMeTab.tap()
        let rejectedIdentity = rejectedApp.buttons["me-school-verification"]
        XCTAssertTrue(rejectedIdentity.waitForExistence(timeout: 3))
        rejectedIdentity.tap()
        XCTAssertTrue(rejectedApp.descendants(matching: .any)["student-verification-manual-review"].waitForExistence(timeout: 3))
    }

    func testMeUsernameSheetSavesAndShowsRemainingAllowance() {
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
        let updatedUsername = app.buttons["profile-change-username"]
        XCTAssertTrue(updatedUsername.isEnabled)
        updatedUsername.tap()
        XCTAssertTrue(
            app.descendants(matching: .any)["profile-username-allowance"]
                .waitForExistence(timeout: 3)
        )
        XCTAssertTrue(app.buttons["profile-username-save"].waitForExistence(timeout: 3))
    }

    func testHomeWeekTimetableIsDefault() {
        let app = XCUIApplication()
        app.launchArguments = ["--ui-testing-authenticated"]
        app.launch()

        XCTAssertTrue(app.descendants(matching: .any)["home-week-timetable"].waitForExistence(timeout: 5))
        XCTAssertFalse(app.descendants(matching: .any)["home-date-strip"].exists)
        XCTAssertTrue(app.buttons.matching(
            NSPredicate(format: "label IN %@", ["Week", "周"])
        ).firstMatch.exists)
        XCTAssertTrue(app.buttons["home-week-event-ui-recurring-event"].waitForExistence(timeout: 3))
    }

    func testWeekEventDragOffersMoveConfirmation() {
        let app = XCUIApplication()
        app.launchArguments = [
            "--ui-testing-authenticated",
            "--ui-testing-calendar-move-delay",
        ]
        app.launch()

        let timetable = app.descendants(matching: .any)["home-week-timetable"]
        XCTAssertTrue(timetable.waitForExistence(timeout: 5))
        let initialTimetableFrame = timetable.frame
        let event = app.buttons["home-week-event-ui-recurring-event"]
        XCTAssertTrue(event.waitForExistence(timeout: 5))
        let start = event.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5))
        let destination = start.withOffset(CGVector(dx: 0, dy: 72))
        start.press(forDuration: 0.34, thenDragTo: destination)

        let confirmation = app.descendants(matching: .any)["calendar-move-confirmation"]
        XCTAssertTrue(confirmation.waitForExistence(timeout: 3))
        XCTAssertGreaterThan(confirmation.frame.midY, initialTimetableFrame.midY)
        XCTAssertEqual(timetable.frame.minY, initialTimetableFrame.minY, accuracy: 1)
        XCTAssertEqual(timetable.frame.height, initialTimetableFrame.height, accuracy: 1)

        let moveThis = app.buttons.matching(identifier: "calendar-move-this").firstMatch
        XCTAssertTrue(moveThis.waitForExistence(timeout: 3))
        XCTAssertFalse(app.buttons.matching(
            NSPredicate(format: "label IN %@", ["View details", "查看详情"])
        ).firstMatch.exists)
        XCTAssertTrue(app.buttons["calendar-move-future"].exists)
        XCTAssertTrue(app.buttons["calendar-move-all"].exists)

        let confirmationScreenshot = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
        confirmationScreenshot.name = "Calendar move confirmation overlay"
        confirmationScreenshot.lifetime = .keepAlways
        add(confirmationScreenshot)

        moveThis.tap()

        let progress = app.staticTexts.matching(
            NSPredicate(
                format: "identifier == %@ OR label BEGINSWITH %@ OR label BEGINSWITH %@",
                "calendar-move-progress",
                "Moving",
                "正在移动"
            )
        ).firstMatch
        XCTAssertTrue(progress.waitForExistence(timeout: 2))

        let progressScreenshot = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
        progressScreenshot.name = "Calendar move progress overlay"
        progressScreenshot.lifetime = .keepAlways
        add(progressScreenshot)

        let progressTimetableFrame = timetable.frame
        XCTAssertEqual(progressTimetableFrame.minY, initialTimetableFrame.minY, accuracy: 1)
        XCTAssertEqual(progressTimetableFrame.height, initialTimetableFrame.height, accuracy: 1)

        let notice = app.descendants(matching: .any)["calendar-notice"]
        XCTAssertTrue(notice.waitForExistence(timeout: 3))
        XCTAssertEqual(timetable.frame.minY, initialTimetableFrame.minY, accuracy: 1)
        XCTAssertEqual(timetable.frame.height, initialTimetableFrame.height, accuracy: 1)

        let successScreenshot = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
        successScreenshot.name = "Calendar move success feedback"
        successScreenshot.lifetime = .keepAlways
        add(successScreenshot)
        XCTAssertTrue(
            app.descendants(matching: .any)["calendar-move-banner"].waitForNonExistence(timeout: 3)
        )
    }

    func testWeekEventLongPressShowsActionsWithoutStartingMove() {
        let app = XCUIApplication()
        app.launchArguments = ["--ui-testing-authenticated"]
        app.launch()

        let event = app.buttons["home-week-event-ui-recurring-event"]
        XCTAssertTrue(event.waitForExistence(timeout: 5))
        event.press(forDuration: 0.8)

        let viewDetails = app.buttons.matching(
            NSPredicate(format: "label IN %@", ["View details", "查看详情"])
        ).firstMatch
        XCTAssertTrue(viewDetails.waitForExistence(timeout: 3))
        XCTAssertTrue(app.buttons.matching(
            NSPredicate(format: "label IN %@", ["Move event", "移动日程"])
        ).firstMatch.exists)
        XCTAssertFalse(app.buttons["calendar-move-this"].exists)
        XCTAssertFalse(app.descendants(matching: .any)["calendar-readonly-detail"].exists)
    }

    func testWeekMoveModeUsesFloatingInstructionWithoutResizingCalendar() {
        let app = XCUIApplication()
        app.launchArguments = ["--ui-testing-authenticated"]
        app.launch()

        let timetable = app.descendants(matching: .any)["home-week-timetable"]
        XCTAssertTrue(timetable.waitForExistence(timeout: 5))
        let initialTimetableFrame = timetable.frame

        let event = app.buttons["home-week-event-ui-recurring-event"]
        XCTAssertTrue(event.waitForExistence(timeout: 3))
        event.press(forDuration: 0.8)

        let move = app.buttons.matching(
            NSPredicate(format: "label IN %@", ["Move event", "移动日程"])
        ).firstMatch
        XCTAssertTrue(move.waitForExistence(timeout: 3))
        move.tap()

        let banner = app.descendants(matching: .any)["calendar-move-banner"]
        XCTAssertTrue(banner.waitForExistence(timeout: 3))
        XCTAssertGreaterThan(banner.frame.midY, initialTimetableFrame.midY)
        XCTAssertEqual(timetable.frame.minY, initialTimetableFrame.minY, accuracy: 1)
        XCTAssertEqual(timetable.frame.height, initialTimetableFrame.height, accuracy: 1)

        let cancel = app.buttons["calendar-move-cancel"]
        XCTAssertTrue(cancel.waitForExistence(timeout: 3))
        cancel.tap()
        XCTAssertTrue(banner.waitForNonExistence(timeout: 3))
        XCTAssertEqual(timetable.frame.minY, initialTimetableFrame.minY, accuracy: 1)
        XCTAssertEqual(timetable.frame.height, initialTimetableFrame.height, accuracy: 1)
    }

    func testCalendarViewModeControlKeepsItsPosition() {
        let app = XCUIApplication()
        app.launchArguments = ["--ui-testing-authenticated"]
        app.launch()

        let modeControl = app.descendants(matching: .any)["calendar-view-mode"]
        XCTAssertTrue(modeControl.waitForExistence(timeout: 5))
        let weekY = modeControl.frame.minY

        let dayMode = app.buttons.matching(
            NSPredicate(format: "label IN %@", ["Day", "日", "日视图"])
        ).firstMatch
        dayMode.tap()
        XCTAssertTrue(app.descendants(matching: .any)["home-date-strip"].waitForExistence(timeout: 3))
        let todayChip = app.buttons[todayDateChipIdentifier()]
        XCTAssertTrue(todayChip.waitForExistence(timeout: 3))
        XCTAssertTrue(todayChip.isHittable, "Day view should center today's date chip")
        XCTAssertEqual(modeControl.frame.minY, weekY, accuracy: 1)

        let listMode = app.buttons.matching(
            NSPredicate(format: "label IN %@", ["List", "列表"])
        ).firstMatch
        listMode.tap()
        XCTAssertTrue(app.descendants(matching: .any)["calendar-agenda-list"].waitForExistence(timeout: 3))
        XCTAssertTrue(todayChip.isHittable, "List view should keep today's date chip visible")
        XCTAssertEqual(modeControl.frame.minY, weekY, accuracy: 1)
    }

    private func todayDateChipIdentifier() -> String {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "Europe/Berlin") ?? .current
        let components = calendar.dateComponents([.year, .month, .day], from: Date())
        return String(
            format: "home-date-%04d-%02d-%02d",
            components.year ?? 0,
            components.month ?? 0,
            components.day ?? 0
        )
    }

    func testWeekHeaderOpensDayWithDateNavigator() {
        let app = XCUIApplication()
        app.launchArguments = ["--ui-testing-authenticated"]
        app.launch()

        let headerPredicate = NSPredicate(format: "identifier BEGINSWITH %@", "home-week-day-")
        let dayHeader = app.buttons.matching(headerPredicate).firstMatch
        XCTAssertTrue(dayHeader.waitForExistence(timeout: 5))
        dayHeader.tap()

        XCTAssertTrue(app.descendants(matching: .any)["calendar-day-timeline"].waitForExistence(timeout: 3))
        XCTAssertTrue(app.descendants(matching: .any)["home-date-strip"].waitForExistence(timeout: 3))
    }

    func testWeekSwipeMovesViewportWithoutSelectingACenteredDate() {
        let app = XCUIApplication()
        app.launchArguments = ["--ui-testing-authenticated"]
        app.launch()

        let timetable = app.descendants(matching: .any)["home-week-timetable"]
        XCTAssertTrue(timetable.waitForExistence(timeout: 5))

        let headerPredicate = NSPredicate(format: "identifier BEGINSWITH %@", "home-week-day-")
        let initialHeaders = app.buttons.matching(headerPredicate).allElementsBoundByIndex
        let initialIdentifiers = Set(initialHeaders.map(\.identifier))
        XCTAssertFalse(initialIdentifiers.isEmpty)
        XCTAssertTrue(initialHeaders.allSatisfy { !$0.isSelected })

        let dragStart = timetable.coordinate(withNormalizedOffset: CGVector(dx: 0.82, dy: 0.62))
        let dragEnd = timetable.coordinate(withNormalizedOffset: CGVector(dx: 0.18, dy: 0.62))
        dragStart.press(forDuration: 0.08, thenDragTo: dragEnd)

        RunLoop.current.run(until: Date().addingTimeInterval(0.8))

        let shiftedHeaders = app.buttons.matching(headerPredicate).allElementsBoundByIndex
        let shiftedIdentifiers = Set(shiftedHeaders.map(\.identifier))
        XCTAssertNotEqual(shiftedIdentifiers, initialIdentifiers)
        XCTAssertTrue(shiftedHeaders.allSatisfy { !$0.isSelected })
    }

    func testWeekHorizontalSwipePreservesVerticalTimePosition() {
        let app = XCUIApplication()
        app.launchArguments = ["--ui-testing-authenticated"]
        app.launch()

        let timetable = app.descendants(matching: .any)["home-week-timetable"]
        XCTAssertTrue(timetable.waitForExistence(timeout: 5))

        let midnight = app.descendants(matching: .any)["week-scroll-0"]
        XCTAssertTrue(midnight.waitForExistence(timeout: 3))

        let verticalStart = timetable.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.72))
        let verticalEnd = timetable.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.38))
        verticalStart.press(forDuration: 0.08, thenDragTo: verticalEnd)
        RunLoop.current.run(until: Date().addingTimeInterval(0.4))
        let verticalPositionBeforePaging = midnight.frame.minY

        let horizontalStart = timetable.coordinate(withNormalizedOffset: CGVector(dx: 0.82, dy: 0.58))
        let horizontalEnd = timetable.coordinate(withNormalizedOffset: CGVector(dx: 0.18, dy: 0.58))
        horizontalStart.press(forDuration: 0.08, thenDragTo: horizontalEnd)
        RunLoop.current.run(until: Date().addingTimeInterval(0.7))

        XCTAssertEqual(midnight.frame.minY, verticalPositionBeforePaging, accuracy: 3)
    }

    func testDenseCalendarHorizontalPagingPerformance() {
        let app = XCUIApplication()
        app.launchArguments = [
            "--ui-testing-authenticated",
            "--ui-testing-dense-calendar",
        ]
        app.launch()

        let timetable = app.descendants(matching: .any)["home-week-timetable"]
        XCTAssertTrue(timetable.waitForExistence(timeout: 8))
        RunLoop.current.run(until: Date().addingTimeInterval(0.5))

        // Inject from the application root. Resolving a coordinate through the
        // timetable would make XCTest traverse hundreds of event accessibility nodes
        // before every swipe and measure the test harness instead of the calendar.
        let normalizedY = timetable.frame.midY / max(app.frame.height, 1)
        let leftStart = app.coordinate(withNormalizedOffset: CGVector(dx: 0.82, dy: normalizedY))
        let leftEnd = app.coordinate(withNormalizedOffset: CGVector(dx: 0.18, dy: normalizedY))
        let rightStart = app.coordinate(withNormalizedOffset: CGVector(dx: 0.18, dy: normalizedY))
        let rightEnd = app.coordinate(withNormalizedOffset: CGVector(dx: 0.82, dy: normalizedY))
        let options = XCTMeasureOptions()
        options.iterationCount = 3

        measure(
            metrics: [XCTClockMetric(), XCTCPUMetric(), XCTMemoryMetric()],
            options: options
        ) {
            for _ in 0..<2 {
                leftStart.press(forDuration: 0.04, thenDragTo: leftEnd)
                rightStart.press(forDuration: 0.04, thenDragTo: rightEnd)
            }
        }
    }

    func testWeekVisibleDaysUseExplicitBottomControl() {
        let app = XCUIApplication()
        app.launchArguments = ["--ui-testing-authenticated"]
        app.launch()

        XCTAssertTrue(
            app.descendants(matching: .any)["home-week-visible-day-count"]
                .waitForExistence(timeout: 5)
        )
        let threeDays = app.buttons.matching(
            NSPredicate(format: "label IN %@", ["3 days", "3 天"])
        ).firstMatch
        XCTAssertTrue(threeDays.waitForExistence(timeout: 3))
        threeDays.tap()
        XCTAssertTrue(threeDays.isSelected)

        let decreaseSpacing = app.buttons["home-week-time-density-decrease"]
        let increaseSpacing = app.buttons["home-week-time-density-increase"]
        XCTAssertTrue(decreaseSpacing.exists)
        XCTAssertTrue(increaseSpacing.exists)
        if increaseSpacing.isEnabled { increaseSpacing.tap() }
        if increaseSpacing.isEnabled { increaseSpacing.tap() }
        XCTAssertFalse(increaseSpacing.isEnabled)
        decreaseSpacing.tap()
        XCTAssertTrue(increaseSpacing.isEnabled)
    }

    func testSevenDayWeekFitsAllHeadersInsideViewport() {
        let app = XCUIApplication()
        app.launchArguments = ["--ui-testing-authenticated"]
        app.launch()

        let timetable = app.descendants(matching: .any)["home-week-timetable"]
        XCTAssertTrue(timetable.waitForExistence(timeout: 5))

        let sevenDays = app.buttons.matching(
            NSPredicate(format: "label IN %@", ["7 days", "7 天"])
        ).firstMatch
        XCTAssertTrue(sevenDays.waitForExistence(timeout: 3))
        sevenDays.tap()
        XCTAssertTrue(sevenDays.isSelected)

        let headerPredicate = NSPredicate(format: "identifier BEGINSWITH %@", "home-week-day-")
        let timetableFrame = timetable.frame
        let visibleHeaders = app.buttons.matching(headerPredicate).allElementsBoundByIndex.filter {
            let frame = $0.frame
            return !frame.isNull
                && frame.width > 1
                && frame.intersects(timetableFrame)
                && frame.minX >= timetableFrame.minX - 1
                && frame.maxX <= timetableFrame.maxX + 1
        }
        XCTAssertEqual(visibleHeaders.count, 7)
    }

    func testCalendarPlanOpensSocialDetail() {
        let app = XCUIApplication()
        app.launchArguments = ["--ui-testing-authenticated"]
        app.launch()

        let plan = app.buttons["home-week-event-ui-social-plan"]
        XCTAssertTrue(plan.waitForExistence(timeout: 5))
        plan.tap()

        let detail = app.descendants(matching: .any)["calendar-readonly-detail"]
        XCTAssertTrue(detail.waitForExistence(timeout: 3))
        XCTAssertTrue(app.staticTexts["Coffee meetup"].exists)
        XCTAssertTrue(app.buttons["calendar-open-plan"].exists)
        detail.swipeUp()
        XCTAssertTrue(app.staticTexts["Test Peer"].waitForExistence(timeout: 3))
        XCTAssertTrue(app.staticTexts["Mina"].exists)
    }

    func testExistingWeekEventOpensDetailBeforeEditing() {
        let app = XCUIApplication()
        app.launchArguments = ["--ui-testing-authenticated"]
        app.launch()

        let event = app.buttons["home-week-event-ui-recurring-event"]
        XCTAssertTrue(event.waitForExistence(timeout: 5))
        event.tap()

        XCTAssertTrue(app.descendants(matching: .any)["calendar-readonly-detail"].waitForExistence(timeout: 3))
        XCTAssertTrue(app.staticTexts["Weekly planning"].exists)
        XCTAssertFalse(app.buttons["event-save"].exists)

        let edit = app.buttons["calendar-detail-edit"]
        XCTAssertTrue(edit.exists)
        edit.tap()
        XCTAssertTrue(app.buttons["event-save"].waitForExistence(timeout: 3))
    }

    func testExistingDayEventOpensDetailBeforeEditing() {
        let app = XCUIApplication()
        app.launchArguments = ["--ui-testing-authenticated"]
        app.launch()

        let dayMode = app.buttons.matching(
            NSPredicate(format: "label IN %@", ["Day", "日", "日视图"])
        ).firstMatch
        XCTAssertTrue(dayMode.waitForExistence(timeout: 5))
        dayMode.tap()

        let event = app.buttons["calendar-timeline-event-ui-recurring-event"]
        XCTAssertTrue(event.waitForExistence(timeout: 3))
        event.tap()

        XCTAssertTrue(app.descendants(matching: .any)["calendar-readonly-detail"].waitForExistence(timeout: 3))
        XCTAssertTrue(app.buttons["calendar-detail-edit"].exists)
        XCTAssertFalse(app.buttons["event-save"].exists)
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

        assertTimelineAnchor(anchored, inside: timetable, expectedTopMinute: expectedTop)
        if expectedTop >= 120 {
            XCTAssertLessThan(midnight.frame.maxY, timetable.frame.minY + 8)
        }
    }

    func testDayTimelineAnchorsNearCurrentTimeOnToday() {
        let app = XCUIApplication()
        app.launchArguments = ["--ui-testing-authenticated"]
        app.launch()

        let dayMode = app.buttons.matching(
            NSPredicate(format: "label IN %@", ["Day", "日", "日视图"])
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

        assertTimelineAnchor(anchored, inside: timeline, expectedTopMinute: expectedTop)
        if expectedTop >= 120 {
            XCTAssertLessThan(midnight.frame.maxY, timeline.frame.minY + 8)
        }
    }

    func testDayTimelineEndsAt24WithoutTrailingBlankSpace() {
        let app = XCUIApplication()
        app.launchArguments = ["--ui-testing-authenticated"]
        app.launch()

        let dayMode = app.buttons.matching(
            NSPredicate(format: "label IN %@", ["Day", "日", "日视图"])
        ).firstMatch
        XCTAssertTrue(dayMode.waitForExistence(timeout: 5))
        dayMode.tap()

        let timeline = app.descendants(matching: .any)["calendar-day-timeline"]
        let finalSlot = app.descendants(matching: .any)["calendar-slot-1410"]
        XCTAssertTrue(timeline.waitForExistence(timeout: 3))
        XCTAssertTrue(finalSlot.waitForExistence(timeout: 3))

        for _ in 0..<6 {
            timeline.swipeUp()
        }

        let tabBar = app.tabBars.firstMatch
        XCTAssertTrue(tabBar.exists)
        let trailingGap = tabBar.frame.minY - finalSlot.frame.maxY
        XCTAssertGreaterThanOrEqual(trailingGap, -2)
        XCTAssertLessThanOrEqual(trailingGap, 48)
    }

    func testHomeNewEventOpensEditableCalendarForm() {
        let app = XCUIApplication()
        app.launchArguments = ["--ui-testing-authenticated"]
        app.launch()

        let addEvent = app.buttons["new-event"]
        let addMenu = app.buttons["calendar-add-menu"]
        if addMenu.waitForExistence(timeout: 2) {
            addMenu.tap()
        }

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

    func testCalendarSharesScheduleToAContact() {
        let app = XCUIApplication()
        app.launchArguments = ["--ui-testing-authenticated"]
        app.launch()

        let share = app.buttons["calendar-share-schedule"]
        XCTAssertTrue(share.waitForExistence(timeout: 5))
        share.tap()

        XCTAssertTrue(app.descendants(matching: .any)["schedule-share-settings"].waitForExistence(timeout: 3))

        let hideAll = app.buttons["schedule-share-toggle-all-details"]
        XCTAssertTrue(hideAll.waitForExistence(timeout: 3))
        hideAll.tap()

        let privacyPreview = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
        privacyPreview.name = "Calendar schedule share privacy preview"
        privacyPreview.lifetime = .keepAlways
        add(privacyPreview)

        let openDestinations = app.buttons["schedule-share-open-destinations"]
        XCTAssertTrue(openDestinations.waitForExistence(timeout: 3))
        XCTAssertTrue(openDestinations.isEnabled)
        openDestinations.tap()

        XCTAssertTrue(app.descendants(matching: .any)["schedule-share-destination-picker"].waitForExistence(timeout: 3))
        let sendInSideSeat = app.buttons["schedule-share-destination-contacts"]
        XCTAssertTrue(sendInSideSeat.waitForExistence(timeout: 3))
        sendInSideSeat.tap()

        XCTAssertTrue(app.descendants(matching: .any)["schedule-share-recipient-picker"].waitForExistence(timeout: 3))
        let contact = app.descendants(matching: .any)["schedule-share-contact-ui-connection"]
        XCTAssertTrue(contact.waitForExistence(timeout: 3))
        contact.tap()

        XCTAssertTrue(app.descendants(matching: .any)["schedule-share-compose"].waitForNonExistence(timeout: 3))
        XCTAssertTrue(app.descendants(matching: .any)["calendar-notice"].waitForExistence(timeout: 3))
    }

    func testCalendarPrimaryActionsAreClearAndReachable() {
        let app = XCUIApplication()
        app.launchArguments = ["--ui-testing-authenticated"]
        app.launch()

        let share = app.buttons["calendar-share-schedule"]
        XCTAssertTrue(share.waitForExistence(timeout: 5))
        XCTAssertGreaterThanOrEqual(share.frame.width, 76)
        XCTAssertGreaterThanOrEqual(share.frame.height, 40)
        let month = app.staticTexts["calendar-month-title"]
        let today = app.buttons["home-jump-today"]
        XCTAssertTrue(month.exists)
        XCTAssertTrue(today.exists)
        XCTAssertLessThanOrEqual(month.frame.maxX, share.frame.minX)
        XCTAssertLessThanOrEqual(share.frame.maxX, today.frame.minX)
        XCTAssertTrue(app.buttons["calendar-add-menu"].exists || app.buttons["new-event"].exists)

        let more = app.buttons["calendar-more-menu"]
        XCTAssertTrue(more.waitForExistence(timeout: 3))
        more.tap()
        XCTAssertTrue(app.buttons["manage-calendars"].waitForExistence(timeout: 3))
        XCTAssertTrue(app.buttons["open-courses"].exists)
    }

    func testCalendarOffersLinkAndImageScheduleSharing() {
        let app = XCUIApplication()
        app.launchArguments = ["--ui-testing-authenticated"]
        app.launch()

        let share = app.buttons["calendar-share-schedule"]
        XCTAssertTrue(share.waitForExistence(timeout: 5))
        share.tap()

        XCTAssertTrue(app.descendants(matching: .any)["schedule-share-settings"].waitForExistence(timeout: 3))
        XCTAssertTrue(app.descendants(matching: .any)["schedule-share-link-settings"].exists)

        let openDestinations = app.buttons["schedule-share-open-destinations"]
        XCTAssertTrue(openDestinations.waitForExistence(timeout: 3))
        openDestinations.tap()

        let destinationPicker = app.descendants(matching: .any)["schedule-share-destination-picker"]
        XCTAssertTrue(destinationPicker.waitForExistence(timeout: 3))
        let link = app.buttons["schedule-share-destination-link"]
        let image = app.buttons["schedule-share-destination-save-image"]
        let copy = app.buttons["schedule-share-destination-copy-link"]
        XCTAssertTrue(link.waitForExistence(timeout: 3))
        XCTAssertTrue(image.exists)
        XCTAssertTrue(copy.exists)

        let destinations = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
        destinations.name = "Calendar share destinations"
        destinations.lifetime = .keepAlways
        add(destinations)

        link.tap()
        XCTAssertTrue(app.otherElements["ActivityListView"].waitForExistence(timeout: 5))
        let closeShareSheet = app.buttons["header.closeButton"]
        XCTAssertTrue(closeShareSheet.waitForExistence(timeout: 3))
        closeShareSheet.tap()
        XCTAssertTrue(app.descendants(matching: .any)["schedule-share-created-link"].waitForExistence(timeout: 3))

        XCTAssertTrue(openDestinations.waitForExistence(timeout: 3))
        openDestinations.tap()
        let copyCreatedLink = app.buttons["schedule-share-destination-copy-link"]
        XCTAssertTrue(copyCreatedLink.waitForExistence(timeout: 3))
        copyCreatedLink.tap()
        XCTAssertTrue(app.descendants(matching: .any)["schedule-share-notice"].waitForExistence(timeout: 3))
    }

    func testScheduleShareShowsFixedWeekAndExpandableCalendarPreview() {
        let app = XCUIApplication()
        app.launchArguments = ["--ui-testing-authenticated"]
        app.launch()

        let share = app.buttons["calendar-share-schedule"]
        XCTAssertTrue(share.waitForExistence(timeout: 5))
        share.tap()

        XCTAssertTrue(app.descendants(matching: .any)["schedule-share-settings"].waitForExistence(timeout: 3))

        let weekDayPredicate = NSPredicate(
            format: "identifier BEGINSWITH %@",
            "schedule-share-week-day-"
        )
        let weekDays = app.buttons.matching(weekDayPredicate)
        XCTAssertTrue(weekDays.firstMatch.waitForExistence(timeout: 3))
        XCTAssertEqual(weekDays.count, 7)

        let previewToggle = app.buttons["schedule-share-week-preview-toggle"]
        XCTAssertTrue(previewToggle.waitForExistence(timeout: 3))
        previewToggle.tap()

        XCTAssertTrue(
            app.descendants(matching: .any)["schedule-share-selection-week-preview"]
                .waitForExistence(timeout: 3)
        )
        XCTAssertTrue(
            app.descendants(matching: .any)["schedule-share-focused-day-events"]
                .waitForExistence(timeout: 3)
        )

        let preview = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
        preview.name = "Schedule share fixed week preview"
        preview.lifetime = .keepAlways
        add(preview)
    }

    func testCalendarSavesScheduleImageToPhotos() {
        let app = XCUIApplication()
        app.launchArguments = ["--ui-testing-authenticated"]
        app.launch()

        let share = app.buttons["calendar-share-schedule"]
        XCTAssertTrue(share.waitForExistence(timeout: 5))
        share.tap()

        let openDestinations = app.buttons["schedule-share-open-destinations"]
        XCTAssertTrue(openDestinations.waitForExistence(timeout: 3))
        openDestinations.tap()

        let saveImage = app.buttons["schedule-share-destination-save-image"]
        XCTAssertTrue(saveImage.waitForExistence(timeout: 3))
        saveImage.tap()

        XCTAssertTrue(app.descendants(matching: .any)["schedule-share-notice"].waitForExistence(timeout: 5))
    }

    func testCalendarSavesScheduleImageUsingRealPhotoLibrary() throws {
        guard ProcessInfo.processInfo.environment["SIDESEAT_RUN_REAL_PHOTO_TEST"] == "1" else {
            throw XCTSkip("Set SIDESEAT_RUN_REAL_PHOTO_TEST=1 to write a real image to the simulator photo library.")
        }

        let app = XCUIApplication()
        app.launchArguments = ["--ui-testing-authenticated", "--ui-testing-real-photo-save"]
        app.launch()

        let share = app.buttons["calendar-share-schedule"]
        XCTAssertTrue(share.waitForExistence(timeout: 5))
        share.tap()

        let openDestinations = app.buttons["schedule-share-open-destinations"]
        XCTAssertTrue(openDestinations.waitForExistence(timeout: 3))
        openDestinations.tap()

        let saveImage = app.buttons["schedule-share-destination-save-image"]
        XCTAssertTrue(saveImage.waitForExistence(timeout: 3))
        saveImage.tap()

        XCTAssertTrue(app.descendants(matching: .any)["schedule-share-notice"].waitForExistence(timeout: 20))
    }

    func testCalendarCanCancelScheduleImageSave() {
        let app = XCUIApplication()
        app.launchArguments = ["--ui-testing-authenticated", "--ui-testing-slow-photo-save"]
        app.launch()

        let share = app.buttons["calendar-share-schedule"]
        XCTAssertTrue(share.waitForExistence(timeout: 5))
        share.tap()

        let openDestinations = app.buttons["schedule-share-open-destinations"]
        XCTAssertTrue(openDestinations.waitForExistence(timeout: 3))
        openDestinations.tap()

        let saveImage = app.buttons["schedule-share-destination-save-image"]
        XCTAssertTrue(saveImage.waitForExistence(timeout: 3))
        saveImage.tap()

        let saving = app.descendants(matching: .any)["schedule-share-image-saving"]
        XCTAssertTrue(saving.waitForExistence(timeout: 2))
        let cancel = app.buttons["schedule-share-image-save-cancel"]
        XCTAssertTrue(cancel.waitForExistence(timeout: 2))
        cancel.tap()

        XCTAssertFalse(saving.waitForExistence(timeout: 1))
        XCTAssertTrue(app.descendants(matching: .any)["schedule-share-destination-picker"].exists)
        XCTAssertTrue(saveImage.isEnabled)
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

        let edit = app.buttons["calendar-detail-edit"]
        XCTAssertTrue(edit.waitForExistence(timeout: 3))
        edit.tap()

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

    func testCalendarListGroupsUpcomingDaysAndOpensPlanDetails() {
        let app = XCUIApplication()
        app.launchArguments = ["--ui-testing-authenticated"]
        app.launch()

        let listMode = app.buttons.matching(
            NSPredicate(format: "label IN %@", ["List", "列表"])
        ).firstMatch
        XCTAssertTrue(listMode.waitForExistence(timeout: 5))
        listMode.tap()

        XCTAssertTrue(app.descendants(matching: .any)["calendar-agenda-list"].waitForExistence(timeout: 3))
        let dayHeaders = app.buttons.matching(
            NSPredicate(format: "identifier BEGINSWITH %@", "agenda-day-")
        )
        XCTAssertGreaterThanOrEqual(dayHeaders.count, 2)
        XCTAssertTrue(app.buttons["agenda-event-ui-tomorrow-event"].waitForExistence(timeout: 3))

        let plan = app.buttons["agenda-event-ui-social-plan"]
        XCTAssertTrue(plan.waitForExistence(timeout: 3))
        plan.tap()
        XCTAssertTrue(app.buttons["calendar-open-plan"].waitForExistence(timeout: 3))
    }

    func testCalendarListLongPressUsesSharedEventActions() {
        let app = XCUIApplication()
        app.launchArguments = ["--ui-testing-authenticated"]
        app.launch()

        let listMode = app.buttons.matching(
            NSPredicate(format: "label IN %@", ["List", "列表"])
        ).firstMatch
        XCTAssertTrue(listMode.waitForExistence(timeout: 5))
        listMode.tap()

        let event = app.buttons["agenda-event-ui-recurring-event"]
        XCTAssertTrue(event.waitForExistence(timeout: 3))
        event.press(forDuration: 1.0)

        XCTAssertTrue(app.buttons.matching(
            NSPredicate(format: "label IN %@", ["View details", "查看详情"])
        ).firstMatch.waitForExistence(timeout: 3))
        XCTAssertTrue(app.buttons.matching(
            NSPredicate(format: "label IN %@", ["Edit event", "编辑日程"])
        ).firstMatch.exists)
        XCTAssertTrue(app.buttons.matching(
            NSPredicate(format: "label IN %@", ["Move event", "移动日程"])
        ).firstMatch.exists)
    }

    func testDayTimelineTapOpensNewEventEditorDirectly() {
        let app = XCUIApplication()
        app.launchArguments = ["--ui-testing-authenticated"]
        app.launch()

        let dayMode = app.buttons.matching(
            NSPredicate(format: "label IN %@", ["Day", "日", "日视图"])
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
            NSPredicate(format: "label IN %@", ["Day", "日", "日视图"])
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
            NSPredicate(format: "label IN %@", ["Day", "日", "日视图"])
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

        app.buttons["calendar-more-menu"].tap()
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
        XCTAssertTrue(app.descendants(matching: .any)["course-chat"].waitForExistence(timeout: 6))
    }

    func testCourseReviewAndImportEntryPoints() {
        let app = XCUIApplication()
        app.launchArguments = ["--ui-testing-authenticated"]
        app.launch()

        app.buttons["calendar-more-menu"].tap()
        let courses = app.buttons["open-courses"]
        XCTAssertTrue(courses.waitForExistence(timeout: 5))
        courses.tap()
        XCTAssertTrue(app.descendants(matching: .any)["courses-list"].waitForExistence(timeout: 3))

        app.buttons["course-semester-review"].tap()
        XCTAssertTrue(app.descendants(matching: .any)["course-review-row-ui-course"].waitForExistence(timeout: 3))
        app.buttons["course-review-cancel"].tap()

        app.buttons["course-add-menu"].tap()
        XCTAssertTrue(app.buttons["course-add-screenshot"].waitForExistence(timeout: 3))
        app.buttons["course-add-screenshot"].tap()
        XCTAssertTrue(app.descendants(matching: .any)["course-screenshot-import"].waitForExistence(timeout: 3))
        XCTAssertTrue(app.buttons["course-screenshot-picker"].exists)
        app.buttons["course-screenshot-import-cancel"].tap()

        app.buttons["course-add-menu"].tap()
        XCTAssertTrue(app.buttons["course-add-manual"].waitForExistence(timeout: 3))
        app.buttons["course-add-manual"].tap()
        XCTAssertTrue(app.descendants(matching: .any)["course-manual-add"].waitForExistence(timeout: 3))
        XCTAssertTrue(app.textFields["course-manual-name"].exists)
        XCTAssertTrue(app.textFields["course-manual-code"].exists)
    }

    func testArchivedCourseCanBeRestoredFromCourseManagement() {
        let app = XCUIApplication()
        app.launchArguments = ["--ui-testing-authenticated"]
        app.launch()

        app.buttons["calendar-more-menu"].tap()
        let courses = app.buttons["open-courses"]
        XCTAssertTrue(courses.waitForExistence(timeout: 5))
        courses.tap()
        XCTAssertTrue(app.descendants(matching: .any)["courses-list"].waitForExistence(timeout: 3))

        let archivedEntry = app.buttons["course-archived-entry"]
        XCTAssertTrue(archivedEntry.waitForExistence(timeout: 3))
        archivedEntry.tap()

        XCTAssertTrue(app.descendants(matching: .any)["course-archived-list"].waitForExistence(timeout: 3))
        let restore = app.buttons["course-archived-restore-ui-course"]
        XCTAssertTrue(restore.waitForExistence(timeout: 3))
        restore.tap()
        XCTAssertTrue(restore.waitForNonExistence(timeout: 3))
        let emptyState = app.staticTexts.matching(
            NSPredicate(format: "label IN %@", ["No archived courses", "Keine archivierten Kurse", "暂无已归档课程"])
        ).firstMatch
        XCTAssertTrue(emptyState.waitForExistence(timeout: 3))
    }

    func testCalendarListCreatesCustomCalendar() {
        let app = XCUIApplication()
        app.launchArguments = ["--ui-testing-authenticated"]
        app.launch()

        app.buttons["calendar-more-menu"].tap()
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

        app.buttons["calendar-more-menu"].tap()
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
        XCTAssertTrue(app.staticTexts["Mina"].exists)

        let message = app.buttons["public-profile-message"]
        XCTAssertTrue(message.waitForExistence(timeout: 3))
        message.tap()

        XCTAssertTrue(app.descendants(matching: .any)["direct-chat"].waitForExistence(timeout: 3))
        XCTAssertTrue(app.descendants(matching: .any)["chat-composer-field"].firstMatch.waitForExistence(timeout: 3))
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
        let field = app.descendants(matching: .any)["chat-composer-field"].firstMatch
        XCTAssertTrue(field.waitForExistence(timeout: 3))
        field.tap()
        field.typeText("我在路上了")
        field.typeText("\n")
        XCTAssertTrue(app.staticTexts["我在路上了"].waitForExistence(timeout: 3))
    }

    func testDirectChatBackgroundDismissesKeyboardAndKeepsLatestMessageVisible() {
        let app = XCUIApplication()
        app.launchArguments = [
            "--ui-testing-authenticated",
            "--ui-testing-chats",
            "--ui-testing-delayed-chat-card",
        ]
        app.launch()

        XCTAssertTrue(app.descendants(matching: .any)["inbox-list"].waitForExistence(timeout: 5))
        app.descendants(matching: .any)["inbox-row-ui-connection"].tap()
        XCTAssertTrue(app.descendants(matching: .any)["direct-chat"].waitForExistence(timeout: 3))

        let field = app.descendants(matching: .any)["chat-composer-field"].firstMatch
        XCTAssertTrue(field.waitForExistence(timeout: 3))
        let latest = app.descendants(matching: .any)["chat-bubble-ui-unread-12"].firstMatch
        XCTAssertTrue(latest.waitForExistence(timeout: 3))
        Thread.sleep(forTimeInterval: 0.8)
        XCTAssertTrue(latest.isHittable)

        field.tap()
        field.typeText("保留的草稿")
        XCTAssertTrue(app.keyboards.firstMatch.waitForExistence(timeout: 3))

        let chat = app.descendants(matching: .any)["direct-chat"].firstMatch
        XCTAssertTrue(chat.waitForExistence(timeout: 3))
        chat.coordinate(withNormalizedOffset: CGVector(dx: 0.92, dy: 0.45)).tap()
        XCTAssertTrue(app.keyboards.firstMatch.waitForNonExistence(timeout: 3))
        XCTAssertTrue(app.descendants(matching: .any)["direct-chat"].exists)

        let retainedField = app.descendants(matching: .any)["chat-composer-field"].firstMatch
        XCTAssertTrue(retainedField.waitForExistence(timeout: 3))
        XCTAssertEqual(retainedField.value as? String, "保留的草稿")

        retainedField.tap()
        XCTAssertTrue(app.keyboards.firstMatch.waitForExistence(timeout: 3))
        let visible = XCTNSPredicateExpectation(
            predicate: NSPredicate(format: "hittable == true"),
            object: latest
        )
        XCTAssertEqual(XCTWaiter.wait(for: [visible], timeout: 3), .completed)
    }

    func testDenseDirectChatScrollingPerformance() {
        let app = launchDenseDirectChat()
        let latest = app.descendants(matching: .any)["chat-bubble-ui-dense-0959"]
        XCTAssertTrue(latest.waitForExistence(timeout: 8))
        RunLoop.current.run(until: Date().addingTimeInterval(0.5))

        let normalizedY = 0.52
        let upwardStart = app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: min(normalizedY + 0.22, 0.78)))
        let upwardEnd = app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: max(normalizedY - 0.22, 0.22)))
        let downwardStart = upwardEnd
        let downwardEnd = upwardStart
        let options = XCTMeasureOptions()
        options.iterationCount = 3

        measure(
            metrics: [XCTClockMetric(), XCTCPUMetric(), XCTMemoryMetric()],
            options: options
        ) {
            for _ in 0..<3 {
                upwardStart.press(forDuration: 0.04, thenDragTo: upwardEnd)
                downwardStart.press(forDuration: 0.04, thenDragTo: downwardEnd)
            }
        }

        XCTAssertTrue(app.descendants(matching: .any)["direct-chat"].exists)
    }

    func testDenseDirectChatComposerPerformance() {
        let app = launchDenseDirectChat()
        let field = app.descendants(matching: .any)["chat-composer-field"].firstMatch
        XCTAssertTrue(field.waitForExistence(timeout: 8))
        let chat = app.descendants(matching: .any)["direct-chat"].firstMatch
        XCTAssertTrue(chat.exists)
        let options = XCTMeasureOptions()
        options.iterationCount = 3

        measure(
            metrics: [XCTClockMetric(), XCTCPUMetric(), XCTMemoryMetric()],
            options: options
        ) {
            field.tap()
            field.typeText("Typing stress message with multiple words")
            app.buttons["chat-composer-send"].tap()
            XCTAssertTrue(app.keyboards.firstMatch.exists)
            chat.coordinate(withNormalizedOffset: CGVector(dx: 0.9, dy: 0.35)).tap()
            XCTAssertTrue(app.keyboards.firstMatch.waitForNonExistence(timeout: 3))
        }

        XCTAssertFalse((field.value as? String ?? "").contains("Typing stress"))
    }

    func testDenseDirectChatEnterExitPerformance() {
        let app = XCUIApplication()
        app.launchArguments = [
            "--ui-testing-authenticated",
            "--ui-testing-chats",
            "--ui-testing-dense-chat",
        ]
        app.launch()

        let inbox = app.descendants(matching: .any)["inbox-list"]
        XCTAssertTrue(inbox.waitForExistence(timeout: 8))
        let options = XCTMeasureOptions()
        options.iterationCount = 3

        measure(
            metrics: [XCTClockMetric(), XCTCPUMetric(), XCTMemoryMetric()],
            options: options
        ) {
            let row = app.descendants(matching: .any)["inbox-row-ui-connection"]
            XCTAssertTrue(row.waitForExistence(timeout: 3))
            row.tap()
            XCTAssertTrue(app.descendants(matching: .any)["direct-chat"].waitForExistence(timeout: 5))
            app.navigationBars.buttons.firstMatch.tap()
            XCTAssertTrue(inbox.waitForExistence(timeout: 5))
        }
    }

    func testDirectChatReplyPreviewStaysCompact() {
        let app = XCUIApplication()
        app.launchArguments = ["--ui-testing-authenticated", "--ui-testing-chats"]
        app.launch()

        XCTAssertTrue(app.descendants(matching: .any)["inbox-list"].waitForExistence(timeout: 5))
        app.descendants(matching: .any)["inbox-row-ui-connection"].tap()
        XCTAssertTrue(app.descendants(matching: .any)["direct-chat"].waitForExistence(timeout: 3))

        openChatContextAction(
            in: app,
            bubbleID: "chat-bubble-ui-msg-1",
            actionID: "chat-reply-ui-msg-1",
            actionLabels: ["Reply", "回复"]
        )
        let replyPreview = app.staticTexts.matching(
            NSPredicate(format: "label BEGINSWITH %@ OR label BEGINSWITH %@", "Replying to", "回复")
        ).firstMatch
        XCTAssertTrue(
            replyPreview.waitForExistence(timeout: 3)
        )
        XCTAssertLessThan(replyPreview.frame.height, 44)
        let composerField = app.descendants(matching: .any)["chat-composer-field"].firstMatch
        XCTAssertTrue(composerField.waitForExistence(timeout: 3))
        XCTAssertTrue(app.keyboards.firstMatch.waitForExistence(timeout: 3))
        XCTAssertLessThan(composerField.frame.minY - replyPreview.frame.maxY, 80)
    }

    func testDirectChatReplyAndDelete() {
        let app = XCUIApplication()
        app.launchArguments = ["--ui-testing-authenticated", "--ui-testing-chats"]
        app.launch()

        XCTAssertTrue(app.descendants(matching: .any)["inbox-list"].waitForExistence(timeout: 5))
        app.descendants(matching: .any)["inbox-row-ui-connection"].tap()
        XCTAssertTrue(app.descendants(matching: .any)["direct-chat"].waitForExistence(timeout: 3))

        openChatContextAction(
            in: app,
            bubbleID: "chat-bubble-ui-msg-1",
            actionID: "chat-reply-ui-msg-1",
            actionLabels: ["Reply", "回复"]
        )
        let replyPreview = app.staticTexts.matching(
            NSPredicate(format: "label BEGINSWITH %@ OR label BEGINSWITH %@", "Replying to", "回复")
        ).firstMatch
        XCTAssertTrue(
            replyPreview.waitForExistence(timeout: 3)
        )
        let chat = app.descendants(matching: .any)["direct-chat"].firstMatch
        chat.coordinate(withNormalizedOffset: CGVector(dx: 0.92, dy: 0.45)).tap()
        XCTAssertTrue(app.keyboards.firstMatch.waitForNonExistence(timeout: 3))

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
        let deletedText = app.staticTexts.matching(
            NSPredicate(format: "label IN %@", ["Message deleted", "消息已删除", "Nachricht gelöscht"])
        ).firstMatch
        XCTAssertTrue(deletedText.exists)

        let field = app.descendants(matching: .any)["chat-composer-field"].firstMatch
        field.tap()
        field.typeText("到时候见")
        app.buttons["chat-composer-send"].tap()
        XCTAssertTrue(app.staticTexts["到时候见"].waitForExistence(timeout: 3))
        let quote = app.descendants(matching: .any).matching(
            NSPredicate(format: "identifier BEGINSWITH %@", "chat-quote-")
        ).firstMatch
        XCTAssertTrue(quote.waitForExistence(timeout: 3))
    }

    func testDirectChatLocationSendAndReport() {
        let app = XCUIApplication()
        app.launchArguments = ["--ui-testing-authenticated", "--ui-testing-chats"]
        app.launch()

        XCTAssertTrue(app.descendants(matching: .any)["inbox-list"].waitForExistence(timeout: 5))
        app.descendants(matching: .any)["inbox-row-ui-connection"].tap()
        XCTAssertTrue(app.descendants(matching: .any)["direct-chat"].waitForExistence(timeout: 3))

        openChatContextAction(
            in: app,
            bubbleID: "chat-bubble-ui-unread-12",
            actionID: "chat-report-ui-unread-12",
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

        app.buttons["chat-composer-attach"].tap()
        let location = app.descendants(matching: .any)["chat-composer-location"]
        XCTAssertTrue(location.waitForExistence(timeout: 3))
        location.tap()
        XCTAssertTrue(app.descendants(matching: .any)["chat-location-picker"].waitForExistence(timeout: 3))
        let sendLocation = app.buttons["chat-location-send"]
        XCTAssertTrue(sendLocation.waitForExistence(timeout: 3))
        XCTAssertTrue(sendLocation.isEnabled)
        sendLocation.tap()
        XCTAssertTrue(app.descendants(matching: .any)["chat-location-picker"].waitForNonExistence(timeout: 3))
        XCTAssertTrue(app.descendants(matching: .any)["chat-location-ui-local-location"].waitForExistence(timeout: 3))
    }

    func testDirectChatComposesAndSendsScheduleShare() {
        let app = XCUIApplication()
        app.launchArguments = ["--ui-testing-authenticated", "--ui-testing-chats"]
        app.launch()

        XCTAssertTrue(app.descendants(matching: .any)["inbox-list"].waitForExistence(timeout: 5))
        app.descendants(matching: .any)["inbox-row-ui-connection"].tap()
        XCTAssertTrue(app.descendants(matching: .any)["direct-chat"].waitForExistence(timeout: 3))

        app.buttons["chat-composer-attach"].tap()
        let schedule = app.descendants(matching: .any)["chat-composer-schedule-share"]
        XCTAssertTrue(schedule.waitForExistence(timeout: 3))
        schedule.tap()

        XCTAssertTrue(app.descendants(matching: .any)["schedule-share-settings"].waitForExistence(timeout: 3))
        let send = app.buttons["schedule-share-send"]
        XCTAssertTrue(send.waitForExistence(timeout: 3))
        XCTAssertTrue(send.isEnabled)
        send.tap()

        XCTAssertTrue(app.descendants(matching: .any)["schedule-share-compose"].waitForNonExistence(timeout: 3))
        XCTAssertTrue(app.descendants(matching: .any)["chat-bubble-ui-local-schedule-shared"].waitForExistence(timeout: 3))
    }

    func testInboxOpensCourseChatAndSendsMessage() {
        let app = XCUIApplication()
        app.launchArguments = ["--ui-testing-authenticated", "--ui-testing-chats"]
        app.launch()

        XCTAssertTrue(app.descendants(matching: .any)["inbox-list"].waitForExistence(timeout: 5))
        let row = app.descendants(matching: .any)["inbox-row-ui-course"]
        XCTAssertTrue(row.waitForExistence(timeout: 3))
        row.tap()

        XCTAssertTrue(app.descendants(matching: .any)["course-chat"].waitForExistence(timeout: 6))
        XCTAssertTrue(app.staticTexts["有人一起上习题课吗？"].waitForExistence(timeout: 3))
        let field = app.descendants(matching: .any)["chat-composer-field"].firstMatch
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
        let field = app.descendants(matching: .any)["chat-composer-field"].firstMatch
        XCTAssertTrue(field.waitForExistence(timeout: 3))
        field.tap()
        field.typeText("我在路上了")
        app.buttons["chat-composer-send"].tap()
        XCTAssertTrue(app.staticTexts["我在路上了"].waitForExistence(timeout: 3))
    }

    func testGroupChatReplyDeleteAndReport() {
        let app = XCUIApplication()
        app.launchArguments = ["--ui-testing-authenticated", "--ui-testing-chats"]
        app.launch()

        XCTAssertTrue(app.descendants(matching: .any)["inbox-list"].waitForExistence(timeout: 5))
        app.descendants(matching: .any)["inbox-row-ui-group"].tap()
        XCTAssertTrue(app.descendants(matching: .any)["group-chat"].waitForExistence(timeout: 3))

        openChatContextAction(
            in: app,
            bubbleID: "chat-bubble-ui-group-msg-1",
            actionID: "chat-reply-ui-group-msg-1",
            actionLabels: ["Reply", "回复"]
        )
        let replyPreview = app.staticTexts.matching(
            NSPredicate(format: "label BEGINSWITH %@ OR label BEGINSWITH %@", "Replying to", "回复")
        ).firstMatch
        XCTAssertTrue(replyPreview.waitForExistence(timeout: 3))

        openChatContextAction(
            in: app,
            bubbleID: "chat-bubble-ui-group-msg-4",
            actionID: "chat-delete-ui-group-msg-4",
            actionLabels: ["Delete", "删除"]
        )
        let confirm = app.buttons.matching(NSPredicate(format: "label IN %@", ["Delete", "删除"])).firstMatch
        XCTAssertTrue(confirm.waitForExistence(timeout: 3))
        confirm.tap()
        XCTAssertTrue(app.descendants(matching: .any)["chat-tombstone-ui-group-msg-4"].waitForExistence(timeout: 3))

        openChatContextAction(
            in: app,
            bubbleID: "chat-bubble-ui-group-msg-2",
            actionID: "chat-report-ui-group-msg-2",
            actionLabels: ["Report", "举报"]
        )
        let sheet = app.descendants(matching: .any)["chat-report-sheet"]
        XCTAssertTrue(sheet.waitForExistence(timeout: 3))
        app.buttons["chat-report-send"].tap()
        XCTAssertTrue(sheet.waitForNonExistence(timeout: 3))
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

    func testInboxPinAndHideCourseRow() throws {
        let app = XCUIApplication()
        app.launchArguments = ["--ui-testing-authenticated", "--ui-testing-chats"]
        app.launch()

        XCTAssertTrue(app.descendants(matching: .any)["inbox-list"].waitForExistence(timeout: 5))
        let course = app.descendants(matching: .any)["inbox-row-ui-course"]
        XCTAssertTrue(course.waitForExistence(timeout: 3))
        course.swipeLeft()
        let pin = app.buttons.matching(NSPredicate(format: "label IN %@", ["Pin", "置顶"])).firstMatch
        if !pin.waitForExistence(timeout: 2) {
            throw XCTSkip("SwiftUI swipe actions are not consistently exposed to XCTest on this simulator runtime.")
        }
        XCTAssertTrue(pin.waitForExistence(timeout: 3))
        pin.tap()
        XCTAssertTrue(app.staticTexts["置顶"].waitForExistence(timeout: 3))

        let pinnedCourse = app.descendants(matching: .any)["inbox-row-ui-course"]
        XCTAssertTrue(pinnedCourse.waitForExistence(timeout: 3))
        pinnedCourse.swipeLeft()
        let hide = app.buttons.matching(NSPredicate(format: "label IN %@", ["Hide", "隐藏"])).firstMatch
        if !hide.waitForExistence(timeout: 2) {
            throw XCTSkip("SwiftUI swipe actions are not consistently exposed to XCTest on this simulator runtime.")
        }
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

        let back = app.navigationBars.buttons.element(boundBy: 0)
        XCTAssertTrue(back.waitForExistence(timeout: 2))
        back.tap()

        XCTAssertTrue(app.buttons["inbox-toolbar-more"].waitForExistence(timeout: 3))
        app.buttons["inbox-toolbar-more"].tap()
        let groupItem = app.descendants(matching: .any)["inbox-toolbar-new-group"].firstMatch
        XCTAssertTrue(groupItem.waitForExistence(timeout: 2))
        groupItem.tap()
        XCTAssertTrue(app.descendants(matching: .any)["group-create-sheet"].waitForExistence(timeout: 3))
    }

    func testInboxConversationChipsFilterAndReset() {
        let app = XCUIApplication()
        app.launchArguments = ["--ui-testing-authenticated", "--ui-testing-chats"]
        app.launch()

        XCTAssertTrue(app.descendants(matching: .any)["inbox-list"].waitForExistence(timeout: 5))
        let direct = app.buttons["inbox-chip-direct"]
        XCTAssertTrue(direct.waitForExistence(timeout: 3))
        direct.tap()

        XCTAssertTrue(app.descendants(matching: .any)["inbox-row-ui-connection"].waitForExistence(timeout: 3))
        XCTAssertFalse(app.descendants(matching: .any)["inbox-row-ui-course"].exists)
        XCTAssertFalse(app.descendants(matching: .any)["inbox-row-ui-group"].exists)

        let all = app.buttons["inbox-chip-all"]
        XCTAssertTrue(all.waitForExistence(timeout: 3))
        all.tap()
        XCTAssertTrue(app.descendants(matching: .any)["inbox-row-ui-course"].waitForExistence(timeout: 3))
        XCTAssertTrue(app.descendants(matching: .any)["inbox-row-ui-group"].waitForExistence(timeout: 3))
    }

    func testInboxPlansChipOpensPlansAndDirectPlanCard() {
        let app = XCUIApplication()
        app.launchArguments = ["--ui-testing-authenticated", "--ui-testing-chats"]
        app.launch()

        XCTAssertTrue(app.descendants(matching: .any)["inbox-list"].waitForExistence(timeout: 5))
        app.buttons["inbox-chip-plans"].tap()
        XCTAssertTrue(app.descendants(matching: .any)["plans-root"].waitForExistence(timeout: 3))
        XCTAssertTrue(app.descendants(matching: .any)["plans-row-ui-plan-1"].waitForExistence(timeout: 3))
        XCTAssertTrue(app.descendants(matching: .any)["plans-row-ui-plan-accepted"].waitForExistence(timeout: 3))
        app.descendants(matching: .any)["plans-row-ui-plan-1"].tap()
        XCTAssertTrue(app.descendants(matching: .any)["direct-chat"].waitForExistence(timeout: 3))
        XCTAssertTrue(app.descendants(matching: .any)["plan-card-ui-plan-1"].waitForExistence(timeout: 3))
        app.swipeUp()
        XCTAssertTrue(app.descendants(matching: .any)["schedule-share-card"].waitForExistence(timeout: 3))
        app.descendants(matching: .any)["schedule-share-card"].tap()
        XCTAssertTrue(app.descendants(matching: .any)["schedule-share-recipient"].waitForExistence(timeout: 3))
        let omittedDate = app.otherElements["schedule-share-timeline-day-2026-07-21"]
        XCTAssertTrue(omittedDate.waitForExistence(timeout: 3))
        XCTAssertTrue(["Not shared", "未分享", "Nicht geteilt"].contains(omittedDate.value as? String ?? ""))
        let fullDayToggle = app.buttons["schedule-share-full-day-toggle"]
        XCTAssertTrue(fullDayToggle.waitForExistence(timeout: 3))
        fullDayToggle.tap()
        let freeWindow = app.buttons.matching(
            NSPredicate(format: "identifier BEGINSWITH %@", "schedule-share-slot-")
        ).firstMatch
        XCTAssertTrue(freeWindow.waitForExistence(timeout: 3))
        freeWindow.tap()
        app.swipeUp()
        XCTAssertTrue(app.descendants(matching: .any)["schedule-share-proposal-start"].waitForExistence(timeout: 3))
        XCTAssertTrue(app.descendants(matching: .any)["schedule-share-proposal-end"].waitForExistence(timeout: 3))
        XCTAssertTrue(app.buttons["schedule-share-duration-90"].exists)
    }

    func testMeSettingsAndFeedbackScaffold() {
        let app = XCUIApplication()
        app.launchArguments = ["--ui-testing-authenticated"]
        app.launch()

        func reveal(_ element: XCUIElement) {
            for _ in 0..<4 {
                if element.exists, element.isHittable {
                    return
                }

                let start = app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.72))
                let end = app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.48))
                start.press(forDuration: 0.05, thenDragTo: end)
            }
        }

        app.tabBars.buttons["我"].tap()
        XCTAssertTrue(app.descendants(matching: .any)["me-profile"].waitForExistence(timeout: 5))
        let settings = app.descendants(matching: .any)["me-settings"]
        XCTAssertTrue(settings.waitForExistence(timeout: 3))
        settings.tap()
        XCTAssertTrue(app.descendants(matching: .any)["settings-root"].waitForExistence(timeout: 3))
        XCTAssertTrue(app.descendants(matching: .any)["settings-discover-city"].waitForExistence(timeout: 3))

        let feedback = app.descendants(matching: .any)["settings-feedback"]
        reveal(feedback)
        XCTAssertTrue(feedback.waitForExistence(timeout: 3))
        feedback.tap()
        XCTAssertTrue(app.descendants(matching: .any)["feedback-root"].waitForExistence(timeout: 3))
        XCTAssertTrue(app.descendants(matching: .any)["feedback-row-ui-feedback-1"].waitForExistence(timeout: 3))
        app.descendants(matching: .any)["feedback-row-ui-feedback-1"].tap()
        XCTAssertTrue(app.descendants(matching: .any)["feedback-detail"].waitForExistence(timeout: 3))
        XCTAssertTrue(app.buttons["feedback-upvote"].waitForExistence(timeout: 3))
        app.navigationBars.buttons.firstMatch.tap()
        app.navigationBars.buttons.firstMatch.tap()

        let deleteAccount = app.descendants(matching: .any)["settings-delete-account"]
        reveal(deleteAccount)
        XCTAssertTrue(deleteAccount.waitForExistence(timeout: 3))
        deleteAccount.tap()
        XCTAssertTrue(app.descendants(matching: .any)["delete-account-sheet"].waitForExistence(timeout: 3))
        app.buttons["delete-account-cancel"].tap()
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
        if !bubble.waitForExistence(timeout: 1) {
            let scroll = app.scrollViews["direct-chat"].firstMatch
            if scroll.exists {
                for _ in 0..<4 where !bubble.exists {
                    scroll.swipeDown()
                }
            }
        }
        XCTAssertTrue(bubble.waitForExistence(timeout: 3))
        XCTAssertLessThanOrEqual(
            bubble.frame.width,
            app.frame.width * 0.82,
            "The context-menu target must stay scoped to the message bubble."
        )
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

    private func launchDenseDirectChat() -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments = [
            "--ui-testing-authenticated",
            "--ui-testing-chats",
            "--ui-testing-dense-chat",
        ]
        app.launch()

        XCTAssertTrue(app.descendants(matching: .any)["inbox-list"].waitForExistence(timeout: 8))
        let row = app.descendants(matching: .any)["inbox-row-ui-connection"]
        XCTAssertTrue(row.waitForExistence(timeout: 3))
        row.tap()
        XCTAssertTrue(app.descendants(matching: .any)["direct-chat"].waitForExistence(timeout: 8))
        return app
    }

    /// The fixture occupies now through +1h and +2h through +3h15m. Choose
    /// farther away so the slot remains tappable as the wall clock changes.
    private func dayTimelineCreateTargetMinute() -> Int {
        var berlin = Calendar(identifier: .gregorian)
        berlin.timeZone = TimeZone(identifier: "Europe/Berlin")!
        let now = Date()
        let currentMinute = berlin.component(.hour, from: now) * 60 + berlin.component(.minute, from: now)
        return currentMinute <= 19 * 60
            ? min(23 * 60 + 30, ((currentMinute + 240) / 30) * 30)
            : max(0, ((currentMinute - 240) / 30) * 30)
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

    private func assertTimelineAnchor(
        _ anchor: XCUIElement,
        inside timeline: XCUIElement,
        expectedTopMinute: Int
    ) {
        if expectedTopMinute >= 18 * 60 {
            // Near midnight the scroll view clamps to its content end so 24:00
            // stays flush with the bottom instead of creating trailing blank space.
            XCTAssertGreaterThanOrEqual(anchor.frame.minY, timeline.frame.minY - 8)
            XCTAssertLessThanOrEqual(anchor.frame.maxY, timeline.frame.maxY + 8)
        } else {
            XCTAssertLessThan(anchor.frame.minY, timeline.frame.minY + 160)
        }
    }
}
