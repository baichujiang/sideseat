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

    func testIncorrectPasswordIsPreservedWhenFieldIsRefocused() {
        let app = XCUIApplication()
        app.launchArguments = [
            "--ui-testing-signed-out",
            "--ui-testing-login-failure",
        ]
        app.launch()

        let identifier = app.textFields["login-identifier"]
        XCTAssertTrue(identifier.waitForExistence(timeout: 5))
        identifier.typeText("test_001")

        let password = app.secureTextFields["login-password"]
        XCTAssertTrue(password.waitForExistence(timeout: 3))
        password.tap()
        password.typeText("almost-right")
        let enteredValue = password.value as? String

        app.buttons["login-submit"].tap()
        XCTAssertTrue(app.descendants(matching: .any)["login-error"].waitForExistence(timeout: 3))

        identifier.tap()
        password.tap()

        XCTAssertEqual(password.value as? String, enteredValue)
        XCTAssertTrue(app.buttons["login-submit"].isEnabled)
    }

    func testAuthenticatedProcessColdLaunchReachesFirstFrameWithinBudget() {
        let app = XCUIApplication()
        app.launchArguments = [
            "--ui-testing-authenticated",
            "--ui-testing-skip-tutorial",
        ]
        app.terminate()
        RunLoop.current.run(until: Date().addingTimeInterval(0.5))

        let duration = assertInteractionDuration(
            "Authenticated process-cold launch",
            atMost: PerformanceBudget.authenticatedProcessColdLaunch
        ) {
            app.launch()
        }
        XCTAssertTrue(
            app.descendants(matching: .any)["home-week-timetable"].waitForExistence(timeout: 6)
        )

        let result = XCTAttachment(string: "process-cold-first-frame-seconds=\(duration)")
        result.name = "Authenticated process-cold launch"
        result.lifetime = .keepAlways
        add(result)
    }

    func testPrimaryNavigationStaysOnNewInformationArchitectureWithoutExperimentAccess() {
        let app = XCUIApplication()
        app.launchArguments = [
            "--ui-testing-authenticated",
            "--ui-testing-skip-tutorial",
        ]
        app.launch()

        let buttons = app.tabBars.buttons
        XCTAssertTrue(buttons.element(boundBy: 3).waitForExistence(timeout: 6))
        XCTAssertEqual(buttons.count, 4)

        XCTAssertTrue(["Together", "同行", "Zusammen"].contains(buttons.element(boundBy: 0).label))
        XCTAssertTrue(["Calendar", "日历", "Kalender"].contains(buttons.element(boundBy: 1).label))
        XCTAssertTrue(["Messages", "消息", "Nachrichten"].contains(buttons.element(boundBy: 2).label))
        XCTAssertTrue(["Me", "我", "Ich"].contains(buttons.element(boundBy: 3).label))
        XCTAssertFalse(app.tabBars.buttons["Discover"].exists)
        XCTAssertFalse(app.tabBars.buttons["Chats"].exists)

        buttons.element(boundBy: 0).tap()
        XCTAssertTrue(
            app.descendants(matching: .any)["together-not-enabled"]
                .waitForExistence(timeout: 5)
        )
    }

    func testSlowSessionRestoreShowsCachedHomeBeforeNetworkCompletes() {
        let app = XCUIApplication()
        app.launchArguments = [
            "--ui-testing-authenticated",
            "--ui-testing-slow-cached-launch",
            "--ui-testing-skip-tutorial",
        ]
        app.launch()

        XCTAssertTrue(
            app.descendants(matching: .any)["home-week-timetable"]
                .waitForExistence(timeout: 2)
        )
        XCTAssertFalse(app.descendants(matching: .any)["startup-transition"].exists)

        let connectionStatus = app.descendants(matching: .any)["home-sync-status"]
        XCTAssertTrue(connectionStatus.waitForExistence(timeout: 1))
        XCTAssertTrue(connectionStatus.waitForNonExistence(timeout: 12))
    }

    func testTogetherWaitsForSlowCachedSessionThenLoads() {
        let app = XCUIApplication()
        app.launchArguments = [
            "--ui-testing-authenticated",
            "--ui-testing-slow-cached-launch",
            "--ui-testing-weekly-intent",
            "--ui-testing-mutual-opportunity",
            "--ui-testing-skip-tutorial",
        ]
        app.launch()

        let togetherTab = app.tabBars.buttons.element(boundBy: 0)
        XCTAssertTrue(togetherTab.waitForExistence(timeout: 2))
        togetherTab.tap()

        XCTAssertTrue(
            app.descendants(matching: .any)["together-assignment-loading"]
                .waitForExistence(timeout: 2)
        )
        XCTAssertFalse(app.descendants(matching: .any)["together-assignment-failure"].exists)
        XCTAssertTrue(
            app.descendants(matching: .any)["together-home"]
                .waitForExistence(timeout: 12)
        )
        XCTAssertFalse(app.descendants(matching: .any)["together-assignment-failure"].exists)
    }

    func testOfflineColdLaunchShowsSavedHomeInsteadOfLogin() {
        let app = XCUIApplication()
        app.launchArguments = [
            "--ui-testing-authenticated",
            "--ui-testing-offline-cached-launch",
            "--ui-testing-skip-tutorial",
        ]
        app.launch()

        XCTAssertTrue(
            app.descendants(matching: .any)["home-week-timetable"]
                .waitForExistence(timeout: 2)
        )
        XCTAssertFalse(app.textFields["login-identifier"].exists)

        let status = app.descendants(matching: .any)["home-sync-status"]
        XCTAssertTrue(status.waitForExistence(timeout: 2))
        XCTAssertTrue(
            status.label.localizedCaseInsensitiveContains("offline")
                || status.label.localizedCaseInsensitiveContains("connecting")
        )
    }

    func testTogetherOfflineCachedLaunchShowsExplicitOfflineState() {
        let app = XCUIApplication()
        app.launchArguments = [
            "--ui-testing-authenticated",
            "--ui-testing-offline-cached-launch",
            "--ui-testing-skip-tutorial",
        ]
        app.launch()

        let togetherTab = app.tabBars.buttons.element(boundBy: 0)
        XCTAssertTrue(togetherTab.waitForExistence(timeout: 2))
        togetherTab.tap()

        XCTAssertTrue(
            app.descendants(matching: .any)["together-assignment-offline"]
                .waitForExistence(timeout: 3)
        )
        XCTAssertFalse(app.descendants(matching: .any)["together-assignment-loading"].exists)
        XCTAssertFalse(app.descendants(matching: .any)["together-assignment-failure"].exists)
    }

    func testAuthenticatedWarmResumePerformance() {
        let app = XCUIApplication()
        app.launchArguments = [
            "--ui-testing-authenticated",
            "--ui-testing-skip-tutorial",
        ]
        app.launch()
        XCTAssertTrue(
            app.descendants(matching: .any)["home-week-timetable"].waitForExistence(timeout: 6)
        )

        var durations: [TimeInterval] = []
        for _ in 0..<3 {
            XCUIDevice.shared.press(.home)
            let backgroundDeadline = Date().addingTimeInterval(3)
            while app.state == .runningForeground && Date() < backgroundDeadline {
                RunLoop.current.run(until: Date().addingTimeInterval(0.05))
            }
            XCTAssertNotEqual(app.state, .runningForeground)

            durations.append(
                assertInteractionDuration(
                    "Authenticated warm resume",
                    atMost: PerformanceBudget.authenticatedWarmResume
                ) {
                    app.activate()
                    XCTAssertTrue(
                        app.wait(
                            for: .runningForeground,
                            timeout: PerformanceBudget.authenticatedWarmResume
                        )
                    )
                }
            )
        }
        XCTAssertTrue(
            app.descendants(matching: .any)["home-week-timetable"].waitForExistence(timeout: 6)
        )

        let formattedDurations = durations
            .map { String(format: "%.3f", $0) }
            .joined(separator: ",")
        let result = XCTAttachment(string: "warm-resume-seconds=\(formattedDurations)")
        result.name = "Authenticated warm resume"
        result.lifetime = .keepAlways
        add(result)
    }

    func testDiscoverPublishChooserIsStableAndBottomCreateIsRemoved() {
        let app = XCUIApplication()
        app.launchArguments = ["--ui-testing-authenticated", "--ui-testing-skip-tutorial"]
        app.launch()

        XCTAssertEqual(app.tabBars.buttons.count, 4)
        XCTAssertFalse(
            app.tabBars.buttons.matching(
                NSPredicate(format: "label IN %@", ["Create", "Publish", "发布"])
            ).firstMatch.exists
        )

        let discoverTab = app.tabBars.buttons.matching(
            NSPredicate(format: "label IN %@", ["Discover", "发现"])
        ).firstMatch
        XCTAssertTrue(discoverTab.waitForExistence(timeout: 5))
        discoverTab.tap()
        let publish = app.buttons["discover-publish"]
        XCTAssertTrue(publish.waitForExistence(timeout: 5))
        publish.tap()

        let chooser = app.descendants(matching: .any)["create-chooser-sheet"]
        XCTAssertTrue(chooser.waitForExistence(timeout: 5))
        let courseAction = app.buttons["create-course-action"]
        let buddyPost = app.buttons["create-buddy-post"]
        let activity = app.buttons["create-activity"]
        XCTAssertTrue(courseAction.exists)
        XCTAssertTrue(buddyPost.exists)
        XCTAssertTrue(activity.exists)
        XCTAssertLessThan(courseAction.frame.midY, buddyPost.frame.midY)
        XCTAssertLessThan(buddyPost.frame.midY, activity.frame.midY)
        let chooserScreenshot = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
        chooserScreenshot.name = "Discover publish chooser"
        chooserScreenshot.lifetime = .keepAlways
        add(chooserScreenshot)
        app.buttons["create-chooser-cancel"].tap()

        let scope = app.segmentedControls["discover-feed-scope"]
        XCTAssertTrue(scope.waitForExistence(timeout: 3))
        scope.buttons.element(boundBy: 3).tap()
        publish.tap()
        XCTAssertTrue(chooser.waitForExistence(timeout: 3))
        XCTAssertTrue(courseAction.exists)
        XCTAssertTrue(buddyPost.exists)
        XCTAssertTrue(activity.exists)

        courseAction.tap()
        XCTAssertTrue(
            app.descendants(matching: .any)["buddy-create-view"].waitForExistence(timeout: 5)
        )
        XCTAssertTrue(app.buttons["buddy-cancel"].waitForExistence(timeout: 3))
        app.buttons["buddy-cancel"].tap()

        XCTAssertTrue(publish.waitForExistence(timeout: 5))
        publish.tap()
        XCTAssertTrue(chooser.waitForExistence(timeout: 3))
        app.buttons["create-activity"].tap()
        XCTAssertTrue(
            app.descendants(matching: .any)["activity-create-view"].waitForExistence(timeout: 5)
        )
        XCTAssertTrue(app.buttons["activity-cancel"].waitForExistence(timeout: 3))
    }

    func testDiscoverSearchStaysWithinTheSelectedCategory() {
        let app = XCUIApplication()
        app.launchArguments = ["--ui-testing-authenticated", "--ui-testing-skip-tutorial"]
        app.launch()

        let discoverTab = app.tabBars.buttons.matching(
            NSPredicate(format: "label IN %@", ["Discover", "发现"])
        ).firstMatch
        XCTAssertTrue(discoverTab.waitForExistence(timeout: 5))
        discoverTab.tap()

        let scope = app.segmentedControls["discover-feed-scope"]
        let city = app.buttons["discover-feed-location"]
        let search = app.textFields["discover-search"]
        XCTAssertTrue(scope.waitForExistence(timeout: 5))
        XCTAssertTrue(search.exists)
        XCTAssertFalse(city.exists)
        XCTAssertLessThanOrEqual(scope.frame.maxY, search.frame.minY)
        XCTAssertGreaterThan(search.frame.width, app.frame.width * 0.75)
        XCTAssertTrue(search.isHittable)

        let headerAttachment = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
        headerAttachment.name = "Discover category and scoped search"
        headerAttachment.lifetime = .keepAlways
        add(headerAttachment)

        // Search is intentionally scoped to the selected post type.
        scope.buttons.element(boundBy: 2).tap()
        search.tap()
        search.typeText("Library")
        XCTAssertTrue(app.staticTexts["Library study buddy"].waitForExistence(timeout: 3))
        XCTAssertFalse(app.staticTexts["English conversation meetup"].exists)

        scope.buttons.element(boundBy: 3).tap()
        XCTAssertFalse(app.staticTexts["Library study buddy"].exists)
        XCTAssertFalse(app.staticTexts["English conversation meetup"].exists)
        XCTAssertTrue(app.staticTexts.matching(
            NSPredicate(
                format: "label IN %@",
                ["No results in this category", "当前分类没有搜索结果", "Keine Ergebnisse in dieser Kategorie"]
            )
        ).firstMatch.waitForExistence(timeout: 3))

        app.buttons["discover-search-clear"].tap()
        XCTAssertTrue(app.staticTexts["English conversation meetup"].waitForExistence(timeout: 3))

        scope.buttons.element(boundBy: 1).tap()
        let startCourseAction = app.buttons["discover-start-course-action"]
        let list = app.descendants(matching: .any)["discover-list"]
        for _ in 0..<4 where !startCourseAction.exists || !startCourseAction.isHittable {
            list.swipeUp()
        }
        XCTAssertTrue(startCourseAction.waitForExistence(timeout: 3))
        XCTAssertTrue(startCourseAction.isHittable)
        XCTAssertFalse(app.buttons["discover-manage-courses"].exists)
        startCourseAction.tap()
        XCTAssertTrue(
            app.descendants(matching: .any)["buddy-create-view"].waitForExistence(timeout: 5)
        )
        XCTAssertTrue(
            app.navigationBars.staticTexts.matching(
                NSPredicate(
                    format: "label IN %@",
                    ["Start course action", "Kursaktion starten", "发起同课行动"]
                )
            ).firstMatch.waitForExistence(timeout: 3)
        )
    }

    func testDiscoverUsesOneCompactNavigationTitle() {
        let app = XCUIApplication()
        app.launchArguments = [
            "--ui-testing-authenticated",
            "--ui-testing-skip-tutorial",
            "--ui-testing-discover",
        ]
        app.launch()

        let title = app.navigationBars.staticTexts.matching(
            NSPredicate(format: "label IN %@", ["Discover", "发现"])
        ).firstMatch
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

    func testDiscoverHidesCityControlWhenOnlyOneCityIsAvailable() {
        let app = XCUIApplication()
        app.launchArguments = [
            "--ui-testing-authenticated",
            "--ui-testing-skip-tutorial",
            "--ui-testing-discover",
            "--ui-testing-language=en",
            // Argument-domain values override any city configuration left by an earlier run.
            "-sideseat.discover.selectedCity", "Munich",
            "-sideseat.discover.city-configuration-v1", "invalid-ui-test-cache",
        ]
        app.launch()

        let search = app.textFields["discover-search"]
        XCTAssertTrue(search.waitForExistence(timeout: 5))
        XCTAssertFalse(app.buttons["discover-feed-location"].exists)
        XCTAssertGreaterThan(search.frame.width, app.frame.width * 0.75)
    }

    func testProductTutorialShowsCustomerFacingCopy() {
        let app = XCUIApplication()
        app.launchArguments = ["--ui-testing-authenticated", "--ui-testing-product-tutorial"]
        app.launch()

        XCTAssertTrue(app.descendants(matching: .any)["product-tutorial"].waitForExistence(timeout: 5))
        let outcomeTitle = app.staticTexts["product-tutorial-title"]
        XCTAssertTrue(outcomeTitle.waitForExistence(timeout: 3))
        XCTAssertTrue(
            [
                "Say what you want to do",
                "Sag, was du machen möchtest",
                "说说这周想做什么",
            ].contains(outcomeTitle.label)
        )

        let togetherValueCopy = app.staticTexts.matching(
            NSPredicate(
                format: "label IN %@",
                [
                    "Set one private intention and receive a small number of concrete opportunities.",
                    "Lege einen privaten Wunsch fest und erhalte wenige konkrete Möglichkeiten.",
                    "设置一个私密意愿，SideSeat 会给出少量具体的同行机会。",
                ]
            )
        ).firstMatch
        XCTAssertTrue(togetherValueCopy.waitForExistence(timeout: 3))

        let internalCopy = app.staticTexts.matching(
            NSPredicate(
                format: "label CONTAINS[c] 'the guide' OR label CONTAINS[c] 'switches tabs' OR label CONTAINS '应用会按步骤切换标签' OR label CONTAINS '引导保持精简'"
            )
        )
        XCTAssertEqual(internalCopy.count, 0)
    }

    func testDiscoverShowsUnifiedPlansAndPublishOpensBuddyForm() {
        let app = XCUIApplication()
        app.launchArguments = ["--ui-testing-authenticated"]
        app.launch()

        let discoverTab = app.tabBars.buttons["发现"]
        XCTAssertTrue(discoverTab.waitForExistence(timeout: 5))
        discoverTab.tap()
        XCTAssertTrue(app.staticTexts["Library study buddy"].waitForExistence(timeout: 3))
        XCTAssertTrue(app.staticTexts["English conversation meetup"].waitForExistence(timeout: 3))
        XCTAssertTrue(app.descendants(matching: .any)["discover-school-verification-ui-buddy"].exists)
        XCTAssertTrue(app.descendants(matching: .any)["discover-activity-verification-ui-activity"].exists)
        XCTAssertFalse(app.descendants(matching: .any)["discover-status-ui-buddy"].exists)
        XCTAssertFalse(app.descendants(matching: .any)["discover-status-activity-ui-activity"].exists)
        XCTAssertTrue(app.descendants(matching: .any)["discover-comment-count-ui-buddy-1"].exists)
        XCTAssertTrue(app.descendants(matching: .any)["discover-activity-comment-count-ui-activity-1"].exists)
        let media = app.descendants(matching: .any)["discover-plan-media-ui-buddy"]
        XCTAssertTrue(media.waitForExistence(timeout: 3))
        XCTAssertTrue(media.label.contains("4"))
        XCTAssertGreaterThanOrEqual(media.frame.height, 140)
        XCTAssertLessThanOrEqual(media.frame.height, 250)
        let mixedFeedScreenshot = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
        mixedFeedScreenshot.name = "Discover mixed media feed"
        mixedFeedScreenshot.lifetime = .keepAlways
        add(mixedFeedScreenshot)

        let publish = app.buttons["discover-publish"]
        XCTAssertTrue(publish.waitForExistence(timeout: 3))
        publish.tap()
        XCTAssertTrue(app.descendants(matching: .any)["create-chooser-sheet"].waitForExistence(timeout: 3))
        app.buttons["create-buddy-post"].tap()
        let title = app.textViews["buddy-title"]
        XCTAssertTrue(title.waitForExistence(timeout: 5))
        title.tap()
        title.typeText("Museum buddy")
        let body = app.textViews["buddy-body"]
        XCTAssertTrue(body.waitForExistence(timeout: 3))
        body.tap()
        body.typeText("Looking for someone to visit the museum this weekend. #museum")
        XCTAssertTrue(app.staticTexts["#museum"].waitForExistence(timeout: 2))
        let keyboardDone = app.buttons["buddy-keyboard-done"].firstMatch
        XCTAssertTrue(keyboardDone.waitForExistence(timeout: 2))
        keyboardDone.tap()
        let everyone = app.staticTexts.matching(
            NSPredicate(format: "label IN %@", ["Everyone", "所有人", "Alle"])
        ).firstMatch
        for _ in 0..<5 where !everyone.exists {
            app.swipeUp()
        }
        XCTAssertTrue(everyone.waitForExistence(timeout: 2))
        let submit = app.buttons.matching(
            NSPredicate(format: "label == 'Post' OR label == '发布'")
        ).firstMatch
        XCTAssertTrue(submit.waitForExistence(timeout: 3))
        XCTAssertTrue(submit.isEnabled)
        submit.tap()
        XCTAssertTrue(app.descendants(matching: .any)["buddy-create-view"].waitForNonExistence(timeout: 5))
        XCTAssertTrue(app.descendants(matching: .any)["discover-post-detail"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["Museum buddy"].exists)
    }

    func testDenseDiscoverFeedScrollPerformance() {
        let app = XCUIApplication()
        app.launchArguments = [
            "--ui-testing-authenticated",
            "--ui-testing-discover",
            "--ui-testing-dense-discover",
        ]
        app.launch()

        let list = app.descendants(matching: .any)["discover-list"]
        XCTAssertTrue(list.waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["Study plan 79"].waitForExistence(timeout: 3))

        let options = XCTMeasureOptions()
        options.iterationCount = 3
        var metrics: [any XCTMetric] = [
            XCTClockMetric(),
            XCTCPUMetric(application: app),
            XCTMemoryMetric(application: app),
        ]
        if #available(iOS 26.0, *) {
            metrics.append(XCTHitchMetric(application: app))
        }
        measure(metrics: metrics, options: options) {
            assertInteractionDuration(
                "Dense Discover feed round trip",
                atMost: PerformanceBudget.denseDiscoverFeedRoundTrip
            ) {
                for _ in 0..<3 { list.swipeUp(velocity: .fast) }
                for _ in 0..<3 { list.swipeDown(velocity: .fast) }
            }
        }
    }

    func testDenseDiscoverSearchRemainsResponsive() {
        let app = XCUIApplication()
        app.launchArguments = [
            "--ui-testing-authenticated",
            "--ui-testing-discover",
            "--ui-testing-dense-discover",
        ]
        app.launch()

        XCTAssertTrue(app.descendants(matching: .any)["discover-list"].waitForExistence(timeout: 5))
        let search = app.textFields["discover-search"]
        XCTAssertTrue(search.waitForExistence(timeout: 3))
        search.tap()

        let options = XCTMeasureOptions()
        options.iterationCount = 3
        measure(metrics: [XCTClockMetric()], options: options) {
            assertInteractionDuration(
                "Dense Discover search round trip",
                atMost: PerformanceBudget.denseDiscoverSearchRoundTrip
            ) {
                search.typeText("plan 79")
                XCTAssertTrue(app.staticTexts["Study plan 79"].waitForExistence(timeout: 2))
                search.typeText(String(repeating: XCUIKeyboardKey.delete.rawValue, count: 7))
                XCTAssertTrue(
                    app.descendants(matching: .any)["discover-plan-ui-dense-buddy-0"]
                        .waitForExistence(timeout: 2)
                )
            }
        }
    }

    func testDenseDiscoverBrowseInteractionStress() {
        let app = XCUIApplication()
        app.launchArguments = [
            "--ui-testing-authenticated",
            "--ui-testing-discover",
            "--ui-testing-dense-discover",
        ]
        app.launch()

        let list = app.descendants(matching: .any)["discover-list"]
        XCTAssertTrue(list.waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["Study plan 79"].waitForExistence(timeout: 3))

        let options = XCTMeasureOptions()
        options.iterationCount = 3
        measure(metrics: appPerformanceMetrics(for: app), options: options) {
            assertInteractionDuration(
                "Dense Discover browse interaction",
                atMost: PerformanceBudget.denseDiscoverBrowseInteraction
            ) {
                list.swipeUp(velocity: .fast)
                list.swipeDown(velocity: .fast)

                let search = app.textFields["discover-search"]
                for _ in 0..<2 where !search.exists {
                    list.swipeDown(velocity: .fast)
                }
                XCTAssertTrue(search.waitForExistence(timeout: 2))
                search.tap()
                search.typeText("plan 79")

                let result = app.descendants(matching: .any)["discover-plan-ui-dense-buddy-79"]
                XCTAssertTrue(result.waitForExistence(timeout: 2))
                result.tap()
                XCTAssertTrue(
                    app.descendants(matching: .any)["discover-post-detail"]
                        .waitForExistence(timeout: 3)
                )

                app.navigationBars.buttons.element(boundBy: 0).tap()
                XCTAssertTrue(list.waitForExistence(timeout: 3))

                let restoredSearch = app.textFields["discover-search"]
                XCTAssertTrue(restoredSearch.waitForExistence(timeout: 2))
                restoredSearch.tap()
                restoredSearch.typeText(
                    String(repeating: XCUIKeyboardKey.delete.rawValue, count: 7)
                )
                XCTAssertTrue(
                    app.descendants(matching: .any)["discover-plan-ui-dense-buddy-0"]
                        .waitForExistence(timeout: 2)
                )
            }
        }
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
        XCTAssertTrue(app.buttons["discover-plan-host"].waitForExistence(timeout: 3))
        XCTAssertFalse(app.buttons["discover-plan-actions"].exists)
        XCTAssertTrue(app.buttons["discover-post-comments"].waitForExistence(timeout: 3))
        XCTAssertTrue(app.descendants(matching: .any)["discover-comments-section"].exists)
        XCTAssertTrue(app.buttons["discover-plan-report"].exists)
        XCTAssertFalse(app.textFields["discover-comment-input"].exists)
        XCTAssertFalse(app.descendants(matching: .any)["discover-comments-sheet"].exists)
        XCTAssertTrue(app.staticTexts["Main Library, Munich"].waitForExistence(timeout: 3))
        let group = app.staticTexts["discover-plan-group"]
        XCTAssertTrue(group.waitForExistence(timeout: 3))
        XCTAssertTrue(group.label.contains("2"))
        XCTAssertTrue(app.descendants(matching: .any)["discover-plan-verified-host"].exists)
        let messageAuthor = app.buttons["discover-post-message"]
        XCTAssertTrue(messageAuthor.waitForExistence(timeout: 3))
        XCTAssertGreaterThan(messageAuthor.frame.width, 70)
        let media = app.descendants(matching: .any)["discover-plan-media"]
        XCTAssertTrue(media.waitForExistence(timeout: 3))
        media.tap()
        let mediaPreview = app.descendants(matching: .any)["discover-media-preview"]
        XCTAssertTrue(mediaPreview.waitForExistence(timeout: 3))
        let mediaPage = app.staticTexts["discover-media-preview-page"]
        XCTAssertTrue(mediaPage.waitForExistence(timeout: 2))
        XCTAssertEqual(mediaPage.value as? String, "1 / 4")
        mediaPreview.swipeLeft()
        let secondPage = NSPredicate(format: "value == %@", "2 / 4")
        expectation(for: secondPage, evaluatedWith: mediaPage)
        waitForExpectations(timeout: 3)
        mediaPreview.tap()
        XCTAssertTrue(app.descendants(matching: .any)["discover-media-preview"].waitForNonExistence(timeout: 3))
        let detailHeaderScreenshot = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
        detailHeaderScreenshot.name = "Discover compact author header"
        detailHeaderScreenshot.lifetime = .keepAlways
        add(detailHeaderScreenshot)

        let buddyCommentsShortcut = app.buttons["discover-post-comments"]
        buddyCommentsShortcut.tap()
        let buddyCommentInput = app.textFields["discover-comment-input"]
        XCTAssertTrue(buddyCommentInput.waitForExistence(timeout: 3))
        let buddyKeyboard = app.keyboards.firstMatch
        XCTAssertTrue(buddyKeyboard.waitForExistence(timeout: 3))
        let buddyCommentsHeading = app.descendants(matching: .any)["discover-comments-section"]
        XCTAssertGreaterThan(buddyCommentsHeading.frame.maxY, 0)
        XCTAssertLessThan(buddyCommentsHeading.frame.minY, buddyKeyboard.frame.minY)
        XCTAssertFalse(app.descendants(matching: .any)["discover-comments-sheet"].exists)
        let buddyComposerScreenshot = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
        buddyComposerScreenshot.name = "Discover buddy inline comment composer"
        buddyComposerScreenshot.lifetime = .keepAlways
        add(buddyComposerScreenshot)
        buddyCommentsHeading.tap()
        XCTAssertTrue(buddyCommentInput.waitForNonExistence(timeout: 3))
        XCTAssertTrue(buddyKeyboard.waitForNonExistence(timeout: 3))
        XCTAssertTrue(buddyCommentsShortcut.waitForExistence(timeout: 3))

        let share = app.buttons["discover-plan-share"]
        XCTAssertTrue(share.waitForExistence(timeout: 3))
        share.tap()
        XCTAssertTrue(app.descendants(matching: .any)["discover-plan-share-preview"].waitForExistence(timeout: 3))
        XCTAssertTrue(app.buttons["discover-plan-share-post"].exists)
        XCTAssertTrue(app.buttons["discover-plan-share-image"].exists)
        XCTAssertTrue(app.buttons["discover-plan-share-copy"].exists)
        XCTAssertTrue(app.buttons["discover-plan-share-save"].exists)
        XCTAssertFalse(app.descendants(matching: .any)["discover-plan-share-card"].exists)
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
        XCTAssertTrue(app.buttons["discover-activity-organizer"].waitForExistence(timeout: 3))
        XCTAssertTrue(app.descendants(matching: .any)["discover-activity-organizer-verified"].exists)
        XCTAssertTrue(
            app.descendants(matching: .any)["discover-activity-participants-summary"]
                .waitForExistence(timeout: 3)
        )
        XCTAssertEqual(
            app.staticTexts.matching(NSPredicate(format: "label CONTAINS '4/10'")).count,
            1
        )
        let activityDetailScreenshot = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
        activityDetailScreenshot.name = "Discover compact participant summary"
        activityDetailScreenshot.lifetime = .keepAlways
        add(activityDetailScreenshot)
        let commentsShortcut = app.buttons["discover-activity-comments"]
        XCTAssertTrue(commentsShortcut.waitForExistence(timeout: 3))
        XCTAssertTrue(app.buttons["discover-activity-message"].exists)
        XCTAssertFalse(app.textFields["discover-comment-input"].exists)
        commentsShortcut.tap()
        let commentsSection = app.descendants(matching: .any)["discover-activity-comments-section"]
        let commentInput = app.textFields["discover-comment-input"]
        XCTAssertTrue(commentsSection.waitForExistence(timeout: 3))
        XCTAssertTrue(commentInput.waitForExistence(timeout: 3))
        let activityKeyboard = app.keyboards.firstMatch
        XCTAssertTrue(activityKeyboard.waitForExistence(timeout: 3))
        XCTAssertGreaterThan(commentsSection.frame.maxY, 0)
        XCTAssertLessThan(commentsSection.frame.minY, activityKeyboard.frame.minY)
        XCTAssertTrue(app.descendants(matching: .any)["discover-activity-detail"].exists)
        XCTAssertFalse(app.descendants(matching: .any)["discover-comments-sheet"].exists)
        XCTAssertTrue(
            app.descendants(matching: .any)["discover-comment-organizer-reply"]
                .waitForExistence(timeout: 3)
        )
        let composerScreenshot = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
        composerScreenshot.name = "Discover inline comment composer"
        composerScreenshot.lifetime = .keepAlways
        add(composerScreenshot)
        commentsSection.tap()
        XCTAssertTrue(commentInput.waitForNonExistence(timeout: 3))
        XCTAssertTrue(activityKeyboard.waitForNonExistence(timeout: 3))
        XCTAssertTrue(commentsShortcut.waitForExistence(timeout: 3))
        commentsShortcut.tap()
        XCTAssertTrue(commentInput.waitForExistence(timeout: 3))
        commentInput.typeText("Can I bring a friend?")
        app.buttons["discover-comment-send"].tap()
        XCTAssertTrue(app.staticTexts["Can I bring a friend?"].waitForExistence(timeout: 3))
        XCTAssertTrue(commentInput.waitForNonExistence(timeout: 3))
        XCTAssertTrue(commentsShortcut.waitForExistence(timeout: 3))
        let commentsScreenshot = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
        commentsScreenshot.name = "Discover comments after posting"
        commentsScreenshot.lifetime = .keepAlways
        add(commentsScreenshot)

        XCTAssertTrue(app.descendants(matching: .any)["discover-activity-detail"].exists)

        let join = app.buttons["discover-activity-join"]
        XCTAssertTrue(join.exists)
        join.tap()
        XCTAssertTrue(app.buttons["discover-activity-cancel-signup"].waitForExistence(timeout: 3))
        let addCalendar = app.buttons["discover-activity-add-calendar"]
        XCTAssertTrue(addCalendar.waitForExistence(timeout: 3))
        addCalendar.tap()
        XCTAssertTrue(
            app.descendants(matching: .any)["discover-activity-calendar-status"]
                .waitForExistence(timeout: 3)
        )

        app.navigationBars.buttons.element(boundBy: 0).tap()
        let updatedActivityCommentCount = app.descendants(matching: .any)[
            "discover-activity-comment-count-ui-activity-2"
        ]
        XCTAssertTrue(updatedActivityCommentCount.waitForExistence(timeout: 3))
        let refreshedFeedScreenshot = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
        refreshedFeedScreenshot.name = "Discover feed after comment count refresh"
        refreshedFeedScreenshot.lifetime = .keepAlways
        add(refreshedFeedScreenshot)
    }

    func testActionInterestOpensContextAndPrefillsPlan() {
        let app = XCUIApplication()
        app.launchArguments = [
            "--ui-testing-authenticated",
            "--ui-testing-discover",
            "--ui-testing-v2-action-to-plan",
            "--ui-testing-skip-tutorial",
        ]
        app.launch()

        let post = app.descendants(matching: .any)["discover-plan-ui-buddy"]
        XCTAssertTrue(post.waitForExistence(timeout: 5))
        post.tap()
        XCTAssertTrue(app.descendants(matching: .any)["discover-post-detail"].waitForExistence(timeout: 4))

        let interest = app.buttons["discover-post-interest"]
        XCTAssertTrue(interest.waitForExistence(timeout: 3))
        interest.tap()

        let propose = app.buttons["action-interest-propose-plan-ui-interest-ui-buddy"]
        XCTAssertTrue(propose.waitForExistence(timeout: 5))
        XCTAssertTrue(propose.isHittable)
        XCTAssertTrue(app.staticTexts["Library study buddy"].exists)
        XCTAssertTrue(app.staticTexts["Main Library"].exists)
        propose.tap()

        XCTAssertTrue(app.descendants(matching: .any)["plan-create-sheet"].waitForExistence(timeout: 4))
        let title = app.textFields["plan-create-title"]
        let location = app.textFields["plan-create-location"]
        XCTAssertEqual(title.value as? String, "Library study buddy")
        XCTAssertEqual(location.value as? String, "Main Library")
        let submit = app.buttons["plan-create-submit"]
        XCTAssertTrue(submit.isEnabled)
        submit.tap()
        XCTAssertTrue(app.descendants(matching: .any)["plan-create-sheet"].waitForNonExistence(timeout: 4))
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
            "--ui-testing-reset-language",
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
        XCTAssertTrue((language.value as? String)?.contains("Deutsch") == true)
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

    func testSettingsLanguageChangesInsideSideSeat() {
        let app = XCUIApplication()
        app.launchArguments = [
            "--ui-testing-authenticated",
            "--ui-testing-reset-language",
            "-AppleLanguages", "(en)",
            "-AppleLocale", "en_US",
        ]
        app.launch()

        let meTab = app.tabBars.buttons.element(boundBy: 3)
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

        XCTAssertTrue(app.descendants(matching: .any)["app-language-settings"].waitForExistence(timeout: 3))
        let german = app.buttons["app-language-de"]
        XCTAssertTrue(german.waitForExistence(timeout: 3))
        german.tap()

        XCTAssertTrue(app.navigationBars["App-Sprache"].waitForExistence(timeout: 3))
        XCTAssertTrue(app.staticTexts["Verwendet die für dein iPhone ausgewählte Sprache."].exists)
        XCTAssertTrue(german.isSelected)

        let simplifiedChinese = app.buttons["app-language-zh-Hans"]
        simplifiedChinese.tap()
        XCTAssertTrue(app.navigationBars["App 语言"].waitForExistence(timeout: 3))
        XCTAssertTrue(app.staticTexts["使用 iPhone 当前选择的语言。"].exists)
        XCTAssertTrue(simplifiedChinese.isSelected)

        app.buttons["app-language-system"].tap()
        XCTAssertTrue(app.navigationBars["App language"].waitForExistence(timeout: 3))
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

        let publishedPost = app.descendants(matching: .any)["my-post-post-ui-school-changed-post"]
        if !publishedPost.waitForExistence(timeout: 2) {
            app.swipeUp()
        }
        XCTAssertTrue(publishedPost.waitForExistence(timeout: 3))
        publishedPost.press(forDuration: 0.8)
        XCTAssertTrue(app.descendants(matching: .any)["long-press-action-menu"].waitForExistence(timeout: 3))
        XCTAssertTrue(app.buttons["my-post-context-repost-ui-school-changed-post"].waitForExistence(timeout: 3))
    }

    func testMeManagesSavedPosts() {
        let app = XCUIApplication()
        app.launchArguments = ["--ui-testing-authenticated"]
        app.launch()

        let meTab = app.tabBars.buttons["我"]
        XCTAssertTrue(meTab.waitForExistence(timeout: 5))
        meTab.tap()

        let savedPosts = app.buttons["me-saved-posts"]
        if !savedPosts.waitForExistence(timeout: 2) {
            app.swipeUp()
        }
        XCTAssertTrue(savedPosts.waitForExistence(timeout: 3))
        savedPosts.tap()

        XCTAssertTrue(app.descendants(matching: .any)["saved-posts-list"].waitForExistence(timeout: 3))
        XCTAssertTrue(app.staticTexts["Library study buddy"].waitForExistence(timeout: 3))

        let remove = app.buttons["saved-post-remove-ui-buddy"]
        XCTAssertTrue(remove.waitForExistence(timeout: 3))
        remove.tap()
        XCTAssertTrue(app.descendants(matching: .any)["saved-posts-empty"].waitForExistence(timeout: 3))
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

        let title = app.textViews["buddy-title"]
        XCTAssertTrue(title.waitForExistence(timeout: 3))
        title.coordinate(withNormalizedOffset: CGVector(dx: 0.95, dy: 0.5)).tap()
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

        let coursesTool = app.buttons["buddy-tool-courses"]
        XCTAssertTrue(coursesTool.waitForExistence(timeout: 3))
        coursesTool.tap()
        let currentCourse = app.buttons["buddy-course-ui-course"]
        XCTAssertTrue(currentCourse.waitForExistence(timeout: 3))
        currentCourse.tap()
        app.buttons["Done"].firstMatch.tap()
        XCTAssertTrue(submit.isEnabled)
        submit.tap()

        XCTAssertTrue(app.descendants(matching: .any)["buddy-repost-view"].waitForNonExistence(timeout: 5))
        XCTAssertTrue(app.descendants(matching: .any)["discover-post-detail"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["Find classmates for algorithms"].exists)
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
        XCTAssertFalse(confirm.waitForExistence(timeout: 1))

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
        XCTAssertTrue(app.staticTexts["me-school-identity"].label.contains("LMU"))
        XCTAssertTrue(app.staticTexts["me-school-status-visual"].exists)
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
        XCTAssertTrue(pendingApp.staticTexts["me-school-identity"].exists)
        XCTAssertTrue(pendingApp.staticTexts["me-school-status-visual"].exists)
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

    func testWeekEventBottomEdgeDragOffersTimeAdjustment() {
        let app = XCUIApplication()
        app.launchArguments = ["--ui-testing-authenticated"]
        app.launch()

        let event = app.buttons["home-week-event-ui-recurring-event"]
        XCTAssertTrue(event.waitForExistence(timeout: 5))
        let originalValue = String(describing: event.value ?? "")
        let start = event.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.96))
        let destination = start.withOffset(CGVector(dx: 0, dy: 44))
        start.press(forDuration: 0.34, thenDragTo: destination)

        let confirmation = app.descendants(matching: .any)["calendar-resize-confirmation"]
        XCTAssertTrue(confirmation.waitForExistence(timeout: 3))
        XCTAssertTrue(app.buttons["calendar-resize-this"].exists)
        XCTAssertTrue(app.buttons["calendar-resize-future"].exists)
        XCTAssertTrue(app.buttons["calendar-resize-all"].exists)
        XCTAssertFalse(app.buttons["calendar-move-this"].exists)

        let screenshot = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
        screenshot.name = "Calendar event edge resize confirmation"
        screenshot.lifetime = .keepAlways
        add(screenshot)

        app.buttons["calendar-resize-this"].tap()
        XCTAssertTrue(
            app.descendants(matching: .any)["calendar-notice"].waitForExistence(timeout: 3)
        )

        let updatedEvent = app.buttons["home-week-event-ui-recurring-event"]
        XCTAssertTrue(updatedEvent.waitForExistence(timeout: 3))
        XCTAssertNotEqual(String(describing: updatedEvent.value ?? ""), originalValue)
    }

    func testWeekEventLongPressShowsOnlyTransferAndDeleteActions() {
        let app = XCUIApplication()
        app.launchArguments = ["--ui-testing-authenticated"]
        app.launch()

        let event = app.buttons["home-week-event-ui-recurring-event"]
        XCTAssertTrue(event.waitForExistence(timeout: 5))
        event.press(forDuration: 0.8)

        let actionMenu = app.descendants(matching: .any)["calendar-event-context-menu"]
        XCTAssertTrue(actionMenu.waitForExistence(timeout: 3))
        XCTAssertTrue(app.buttons["calendar-event-context-copy"].waitForExistence(timeout: 3))
        XCTAssertTrue(app.buttons["calendar-event-context-duplicate"].exists)
        XCTAssertTrue(app.buttons["calendar-event-context-delete"].exists)
        let menuScreenshot = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
        menuScreenshot.name = "Unified calendar long-press action panel"
        menuScreenshot.lifetime = .keepAlways
        add(menuScreenshot)
        XCTAssertFalse(app.buttons.matching(
            NSPredicate(
                format: "label IN %@",
                ["View details", "查看详情", "Edit event", "编辑日程", "Move event", "移动日程"]
            )
        ).firstMatch.exists)
        XCTAssertFalse(app.buttons["calendar-move-this"].exists)
        XCTAssertFalse(app.descendants(matching: .any)["calendar-readonly-detail"].exists)

        let menuFrame = actionMenu.frame
        let eventFrame = event.frame
        let isVerticallyAnchored = menuFrame.maxY <= eventFrame.minY + 24
            || menuFrame.minY >= eventFrame.maxY - 24
        XCTAssertTrue(isVerticallyAnchored, "The action menu should remain anchored beside its event")

        app.coordinate(withNormalizedOffset: CGVector(dx: 0.06, dy: 0.12)).tap()
        XCTAssertTrue(actionMenu.waitForNonExistence(timeout: 3))
    }

    func testRecurringEventContextDeleteOffersEveryScope() {
        let app = XCUIApplication()
        app.launchArguments = ["--ui-testing-authenticated"]
        app.launch()

        let event = app.buttons["home-week-event-ui-recurring-event"]
        XCTAssertTrue(event.waitForExistence(timeout: 5))
        event.press(forDuration: 0.8)

        let delete = app.buttons.matching(identifier: "calendar-event-context-delete").firstMatch
        XCTAssertTrue(delete.waitForExistence(timeout: 3))
        delete.tap()

        let deleteThisOccurrence = app.buttons.matching(
            identifier: "calendar-event-delete-this"
        ).firstMatch
        XCTAssertTrue(deleteThisOccurrence.waitForExistence(timeout: 3))
        XCTAssertTrue(
            ["Delete this event", "仅删除本次", "Nur diesen Termin"].contains(
                deleteThisOccurrence.label
            )
        )
        XCTAssertTrue(app.buttons.matching(identifier: "calendar-event-delete-future").firstMatch.exists)
        XCTAssertTrue(app.buttons.matching(identifier: "calendar-event-delete-all").firstMatch.exists)
    }

    func testCalendarViewModeControlKeepsItsPosition() {
        let app = XCUIApplication()
        app.launchArguments = ["--ui-testing-authenticated", "--ui-testing-calendar-dot-overflow"]
        app.launch()

        let modeControl = app.descendants(matching: .any)["calendar-view-mode"]
        XCTAssertTrue(modeControl.waitForExistence(timeout: 5))
        let weekY = modeControl.frame.minY
        let weekMode = app.buttons.matching(
            NSPredicate(format: "label IN %@", ["Week", "周"])
        ).firstMatch
        XCTAssertTrue(weekMode.isSelected, "Week should remain the default calendar view")

        let dayMode = app.buttons.matching(
            NSPredicate(format: "label IN %@", ["Day", "日", "日视图"])
        ).firstMatch
        dayMode.tap()
        XCTAssertTrue(app.descendants(matching: .any)["home-date-strip"].waitForExistence(timeout: 3))
        let todayChip = app.buttons[todayDateChipIdentifier()]
        XCTAssertTrue(todayChip.waitForExistence(timeout: 3))
        XCTAssertTrue(todayChip.isHittable, "Day view should center today's date chip")
        XCTAssertTrue(
            ["5 events", "5 Termine", "5 个日程"].contains(String(describing: todayChip.value ?? "")),
            "Day navigation should expose the exact event count while showing compact color dots"
        )
        var berlinCalendar = Calendar(identifier: .gregorian)
        berlinCalendar.timeZone = TimeZone(identifier: "Europe/Berlin") ?? .current
        let tomorrow = berlinCalendar.date(byAdding: .day, value: 1, to: Date()) ?? Date()
        let tomorrowChip = app.buttons[dateChipIdentifier(tomorrow)]
        XCTAssertTrue(tomorrowChip.waitForExistence(timeout: 3))
        XCTAssertTrue(
            ["1 events", "1 Termine", "1 个日程"].contains(String(describing: tomorrowChip.value ?? "")),
            "Each day chip should describe its own event count"
        )
        let dayStripScreenshot = XCTAttachment(screenshot: app.screenshot())
        dayStripScreenshot.name = "Calendar day strip event dots"
        dayStripScreenshot.lifetime = .keepAlways
        add(dayStripScreenshot)
        XCTAssertEqual(modeControl.frame.minY, weekY, accuracy: 1)

        let monthMode = app.buttons.matching(
            NSPredicate(format: "label IN %@", ["Month", "月", "Monat"])
        ).firstMatch
        monthMode.tap()
        XCTAssertTrue(app.descendants(matching: .any)["calendar-month-view"].waitForExistence(timeout: 3))
        XCTAssertFalse(app.descendants(matching: .any)["home-date-strip"].exists)
        XCTAssertEqual(modeControl.frame.minY, weekY, accuracy: 1)
        let monthScreenshot = XCTAttachment(screenshot: app.screenshot())
        monthScreenshot.name = "Calendar month view"
        monthScreenshot.lifetime = .keepAlways
        add(monthScreenshot)

        XCTAssertFalse(app.buttons["open-calendar-agenda"].exists)
        XCTAssertFalse(app.buttons["calendar-month-open-day"].exists)
        XCTAssertEqual(modeControl.frame.minY, weekY, accuracy: 1)
    }

    private func openCoursesFromMe(in app: XCUIApplication) {
        let meTab = app.tabBars.buttons.matching(
            NSPredicate(format: "label IN %@", ["Me", "我", "Ich"])
        ).firstMatch
        XCTAssertTrue(meTab.waitForExistence(timeout: 5))
        meTab.tap()

        let profile = app.descendants(matching: .any)["me-profile"]
        XCTAssertTrue(profile.waitForExistence(timeout: 5))
        let courses = app.buttons["me-courses"]
        for _ in 0..<5 where !courses.exists || !courses.isHittable {
            profile.swipeUp()
        }
        XCTAssertTrue(courses.waitForExistence(timeout: 3))
        XCTAssertTrue(courses.isHittable)
        courses.tap()
        XCTAssertTrue(app.descendants(matching: .any)["courses-list"].waitForExistence(timeout: 5))
    }

    private func todayDateChipIdentifier() -> String {
        dateChipIdentifier(Date())
    }

    private func dateChipIdentifier(_ date: Date) -> String {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "Europe/Berlin") ?? .current
        let components = calendar.dateComponents([.year, .month, .day], from: date)
        return String(
            format: "home-date-%04d-%02d-%02d",
            components.year ?? 0,
            components.month ?? 0,
            components.day ?? 0
        )
    }

    private func monthDayIdentifier(_ date: Date) -> String {
        dateChipIdentifier(date).replacingOccurrences(
            of: "home-date-",
            with: "calendar-month-day-"
        )
    }

    private func todayWeekHeaderIdentifier() -> String {
        todayDateChipIdentifier().replacingOccurrences(
            of: "home-date-",
            with: "home-week-day-"
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

    func testWeekScrollDirectionIndicatorTracksLockedAxis() {
        let app = XCUIApplication()
        app.launchArguments = [
            "--ui-testing-authenticated",
            "--ui-testing-expose-scroll-direction-indicator",
        ]
        app.launch()

        let timetable = app.descendants(matching: .any)["home-week-timetable"]
        XCTAssertTrue(timetable.waitForExistence(timeout: 5))

        let verticalStart = timetable.coordinate(withNormalizedOffset: CGVector(dx: 0.58, dy: 0.7))
        let verticalEnd = timetable.coordinate(withNormalizedOffset: CGVector(dx: 0.58, dy: 0.42))
        verticalStart.press(forDuration: 0.08, thenDragTo: verticalEnd)

        XCTAssertEqual(timetable.value as? String, "bottom")
        let bottomIndicator = app.descendants(matching: .any)["week-scroll-direction-bottom"]
        XCTAssertTrue(bottomIndicator.waitForExistence(timeout: 2))
        XCTAssertGreaterThan(bottomIndicator.frame.width, bottomIndicator.frame.height)
        XCTAssertGreaterThan(bottomIndicator.frame.midY, timetable.frame.midY)

        let verticalScreenshot = XCTAttachment(screenshot: app.screenshot())
        verticalScreenshot.name = "Week later-time bottom edge indicator"
        verticalScreenshot.lifetime = .keepAlways
        add(verticalScreenshot)

        // Relaunch between axes so native vertical deceleration cannot swallow the
        // synthesized horizontal gesture on slower simulator configurations.
        app.terminate()
        app.launch()
        XCTAssertTrue(timetable.waitForExistence(timeout: 5))

        let horizontalStart = timetable.coordinate(withNormalizedOffset: CGVector(dx: 0.82, dy: 0.58))
        let horizontalEnd = timetable.coordinate(withNormalizedOffset: CGVector(dx: 0.18, dy: 0.58))
        horizontalStart.press(forDuration: 0.08, thenDragTo: horizontalEnd)

        XCTAssertEqual(timetable.value as? String, "trailing")
        let trailingIndicator = app.descendants(matching: .any)["week-scroll-direction-trailing"]
        XCTAssertTrue(trailingIndicator.waitForExistence(timeout: 2))
        XCTAssertGreaterThan(trailingIndicator.frame.height, trailingIndicator.frame.width)
        XCTAssertGreaterThan(trailingIndicator.frame.midX, timetable.frame.midX)

        let horizontalScreenshot = XCTAttachment(screenshot: app.screenshot())
        horizontalScreenshot.name = "Week next-days trailing edge indicator"
        horizontalScreenshot.lifetime = .keepAlways
        add(horizontalScreenshot)
    }

    func testTodayReturnsSwipedWeekToCurrentDate() {
        let app = XCUIApplication()
        app.launchArguments = ["--ui-testing-authenticated"]
        app.launch()

        let timetable = app.descendants(matching: .any)["home-week-timetable"]
        XCTAssertTrue(timetable.waitForExistence(timeout: 5))
        let todayHeader = app.buttons[todayWeekHeaderIdentifier()]
        XCTAssertTrue(todayHeader.waitForExistence(timeout: 3))

        for _ in 0..<2 where todayHeader.exists {
            let dragStart = timetable.coordinate(withNormalizedOffset: CGVector(dx: 0.82, dy: 0.62))
            let dragEnd = timetable.coordinate(withNormalizedOffset: CGVector(dx: 0.18, dy: 0.62))
            dragStart.press(forDuration: 0.08, thenDragTo: dragEnd)
            RunLoop.current.run(until: Date().addingTimeInterval(0.8))
        }
        XCTAssertFalse(todayHeader.exists)

        let today = app.buttons["home-jump-today"]
        XCTAssertTrue(today.isHittable)
        today.tap()

        XCTAssertTrue(todayHeader.waitForExistence(timeout: 3))
        XCTAssertTrue(todayHeader.frame.intersects(timetable.frame))
    }

    func testWeekHorizontalSwipePreservesVerticalTimePosition() {
        let app = XCUIApplication()
        app.launchArguments = [
            "--ui-testing-authenticated",
            "--ui-testing-expose-scroll-anchors",
        ]
        app.launch()

        let timetable = app.descendants(matching: .any)["home-week-timetable"]
        XCTAssertTrue(timetable.waitForExistence(timeout: 5))

        let midnight = app.otherElements.matching(identifier: "week-scroll-0").firstMatch
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

        var metrics: [any XCTMetric] = [
            XCTClockMetric(),
            XCTCPUMetric(application: app),
            XCTMemoryMetric(application: app),
        ]
        if #available(iOS 26.0, *) {
            metrics.append(XCTHitchMetric(application: app))
        }

        measure(
            metrics: metrics,
            options: options
        ) {
            assertInteractionDuration(
                "Dense calendar paging round trip",
                atMost: PerformanceBudget.denseCalendarPagingRoundTrip
            ) {
                for _ in 0..<2 {
                    leftStart.press(forDuration: 0.04, thenDragTo: leftEnd)
                    rightStart.press(forDuration: 0.04, thenDragTo: rightEnd)
                }
            }
        }
    }

    func testCalendarRendersImportedAllDayEventInWeekBand() {
        let app = XCUIApplication()
        app.launchArguments = [
            "--ui-testing-authenticated",
            "--ui-testing-all-day-calendar",
        ]
        app.launch()

        let row = app.descendants(matching: .any)["home-week-all-day-row"]
        XCTAssertTrue(row.waitForExistence(timeout: 5))
        let event = app.buttons["Reading week"].firstMatch
        XCTAssertTrue(event.waitForExistence(timeout: 3))
        XCTAssertGreaterThan(event.frame.width, 1)
        event.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)).tap()
        XCTAssertTrue(
            app.descendants(matching: .any)["calendar-readonly-detail"]
                .waitForExistence(timeout: 3)
        )
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

        XCTAssertFalse(app.buttons["home-week-time-density-decrease"].exists)
        XCTAssertFalse(app.buttons["home-week-time-density-increase"].exists)
    }

    func testWeekTimelinePinchAdjustsDensityContinuously() {
        let app = XCUIApplication()
        app.launchArguments = [
            "--ui-testing-authenticated",
            "--ui-testing-skip-tutorial",
            "--ui-testing-expose-timeline-scale",
            "-sideseat.home.weekTimelineScale.v2", "1.0",
        ]
        app.launch()

        let calendarTab = app.tabBars.buttons.element(boundBy: 0)
        XCTAssertTrue(calendarTab.waitForExistence(timeout: 5))
        calendarTab.tap()

        let timetable = app.descendants(matching: .any)["home-week-timetable"]
        XCTAssertTrue(timetable.waitForExistence(timeout: 5))
        let scrollView = timetable.descendants(matching: .scrollView).firstMatch
        XCTAssertTrue(scrollView.waitForExistence(timeout: 3))
        func currentScale() -> Double? {
            guard let rawValue = timetable.value as? String,
                  let value = Double(rawValue)
            else {
                XCTFail("Week timetable did not expose its continuous scale")
                return nil
            }
            return value
        }

        guard let initialScale = currentScale() else { return }
        XCTAssertEqual(initialScale, 1, accuracy: 0.01)

        scrollView.pinch(withScale: 1.18, velocity: 1)
        RunLoop.current.run(until: Date().addingTimeInterval(0.35))
        guard let firstZoomScale = currentScale() else { return }
        XCTAssertGreaterThan(firstZoomScale, initialScale + 0.08)
        XCTAssertLessThanOrEqual(firstZoomScale, 1.35)
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
        app.launchArguments = [
            "--ui-testing-authenticated",
            "-UIPreferredContentSizeCategoryName",
            "UICTContentSizeCategoryL",
        ]
        app.launch()

        let event = app.buttons["home-week-event-ui-recurring-event"]
        XCTAssertTrue(event.waitForExistence(timeout: 5))
        event.tap()

        XCTAssertTrue(app.descendants(matching: .any)["calendar-readonly-detail"].waitForExistence(timeout: 3))
        XCTAssertTrue(app.staticTexts["Weekly planning"].exists)
        let detail = app.descendants(matching: .any)["calendar-readonly-detail"]
        let repeatRow = app.descendants(matching: .any)["calendar-detail-repeat"]
        for _ in 0..<3 where !repeatRow.exists {
            detail.swipeUp()
        }
        XCTAssertTrue(repeatRow.exists)

        let repeatUntilRow = app.descendants(matching: .any)["calendar-detail-repeat-until"]
        for _ in 0..<3 where !repeatUntilRow.exists {
            detail.swipeUp()
        }
        XCTAssertTrue(repeatUntilRow.exists)

        let categoryRow = app.descendants(matching: .any)["calendar-detail-category"]
        for _ in 0..<3 where !categoryRow.exists {
            detail.swipeUp()
        }
        XCTAssertTrue(categoryRow.exists)
        XCTAssertFalse(app.buttons["event-save"].exists)

        let edit = app.buttons["calendar-detail-edit"]
        XCTAssertTrue(edit.exists)
        edit.tap()
        XCTAssertTrue(app.buttons["event-save"].waitForExistence(timeout: 3))
        let title = app.textFields["event-title"]
        XCTAssertTrue(title.waitForExistence(timeout: 3))
        let windowFrame = app.windows.firstMatch.frame
        XCTAssertLessThan(
            title.frame.minY,
            windowFrame.minY + windowFrame.height * 0.30,
            "Editing an existing event should continue to open at the large detent."
        )
    }

    func testExistingEventSharesFilteredCopyThroughStableDestinations() {
        let app = XCUIApplication()
        app.launchArguments = ["--ui-testing-authenticated"]
        app.launch()

        let event = app.buttons["home-week-event-ui-recurring-event"]
        XCTAssertTrue(event.waitForExistence(timeout: 5))
        event.tap()

        let share = app.buttons["calendar-detail-share-event"]
        XCTAssertTrue(share.waitForExistence(timeout: 3))
        XCTAssertTrue(share.isHittable)
        share.tap()

        let compose = app.descendants(matching: .any)["event-share-compose"]
        XCTAssertTrue(compose.waitForExistence(timeout: 3))
        XCTAssertTrue(
            app.descendants(matching: .any)["event-share-preview-title"]
                .waitForExistence(timeout: 3)
        )
        XCTAssertTrue(app.descendants(matching: .any)["event-share-include-location"].exists)
        XCTAssertTrue(
            app.descendants(matching: .any)["event-share-copy-disclosure"].exists
        )

        let continueButton = app.buttons["event-share-continue"]
        XCTAssertTrue(continueButton.waitForExistence(timeout: 3))
        XCTAssertTrue(continueButton.isHittable)
        continueButton.tap()

        XCTAssertTrue(
            app.descendants(matching: .any)["event-share-destinations"]
                .waitForExistence(timeout: 3)
        )
        XCTAssertTrue(app.buttons["event-share-copy-link"].exists)
        XCTAssertTrue(app.buttons["event-share-system-share"].exists)
        XCTAssertTrue(app.buttons["event-share-contact-ui-connection"].exists)

        let attachment = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
        attachment.name = "Event share destinations"
        attachment.lifetime = .keepAlways
        add(attachment)
    }

    func testCalendarSearchAutoFocusesAndOpensExistingEventDetail() {
        let app = XCUIApplication()
        app.launchArguments = ["--ui-testing-authenticated"]
        app.launch()

        let search = app.buttons["calendar-search"]
        XCTAssertTrue(search.waitForExistence(timeout: 5))
        XCTAssertTrue(search.isHittable)
        search.tap()

        XCTAssertTrue(
            app.descendants(matching: .any)["calendar-search-sheet"]
                .waitForExistence(timeout: 3)
        )
        let searchField = app.searchFields.firstMatch
        XCTAssertTrue(searchField.waitForExistence(timeout: 3))
        XCTAssertTrue(
            app.keyboards.firstMatch.waitForExistence(timeout: 3),
            "Opening calendar search should focus the search field immediately."
        )
        searchField.typeText("Weekly planning")

        let result = app.buttons["calendar-search-result-ui-recurring-event"]
        XCTAssertTrue(result.waitForExistence(timeout: 5))
        XCTAssertTrue(result.isHittable)
        XCTAssertEqual(
            app.buttons.matching(
                NSPredicate(format: "identifier BEGINSWITH %@", "calendar-search-result-")
            ).count,
            1,
            "A recurring series should appear as one search result."
        )
        let searchResults = XCTAttachment(screenshot: app.screenshot())
        searchResults.name = "Calendar search results"
        searchResults.lifetime = .keepAlways
        add(searchResults)
        result.tap()

        let detail = app.descendants(matching: .any)["calendar-readonly-detail"]
        XCTAssertTrue(detail.waitForExistence(timeout: 3))
        XCTAssertTrue(app.staticTexts["Weekly planning"].exists)
        let repeatRow = app.descendants(matching: .any)["calendar-detail-repeat"]
        for _ in 0..<3 where !repeatRow.exists {
            detail.swipeUp()
        }
        XCTAssertTrue(repeatRow.exists)
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

    func testDayEventLongPressUsesAnchoredActions() {
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
        event.press(forDuration: 0.8)

        let actionMenu = app.descendants(matching: .any)["calendar-event-context-menu"]
        XCTAssertTrue(actionMenu.waitForExistence(timeout: 3))
        XCTAssertTrue(app.buttons["calendar-event-context-copy"].exists)
        XCTAssertTrue(app.buttons["calendar-event-context-duplicate"].exists)
        XCTAssertTrue(app.buttons["calendar-event-context-delete"].exists)

        let menuFrame = actionMenu.frame
        let eventFrame = event.frame
        XCTAssertTrue(
            menuFrame.maxY <= eventFrame.minY + 24
                || menuFrame.minY >= eventFrame.maxY - 24
        )
    }

    func testHomeWeekTimetableAnchorsNearCurrentTimeOnToday() {
        let app = XCUIApplication()
        app.launchArguments = [
            "--ui-testing-authenticated",
            "--ui-testing-expose-scroll-anchors",
        ]
        app.launch()

        let timetable = app.descendants(matching: .any)["home-week-timetable"]
        XCTAssertTrue(timetable.waitForExistence(timeout: 5))

        // Give ScrollViewReader time to settle after layout.
        RunLoop.current.run(until: Date().addingTimeInterval(0.4))

        let expectedTop = timelineScrollTopMinuteNearNow()
        let anchored = app.otherElements.matching(identifier: "week-scroll-\(expectedTop)").firstMatch
        let midnight = app.otherElements.matching(identifier: "week-scroll-0").firstMatch
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

    func testOffscreenEventCuesShowAtBothTimelineEdgesAndJump() {
        let app = XCUIApplication()
        app.launchArguments = [
            "--ui-testing-authenticated",
            "--ui-testing-dense-calendar",
            "--ui-testing-expose-scroll-anchors",
            "--ui-testing-offscreen-event-cues",
        ]
        app.launch()

        let timetable = app.descendants(matching: .any)["home-week-timetable"]
        XCTAssertTrue(timetable.waitForExistence(timeout: 8))
        RunLoop.current.run(until: Date().addingTimeInterval(0.5))

        let todayID = todayWeekHeaderIdentifier().replacingOccurrences(
            of: "home-week-day-",
            with: ""
        )
        let weekTop = app.buttons["calendar-week-offscreen-event-top-\(todayID)"]
        let weekBottom = app.buttons["calendar-week-offscreen-event-bottom-\(todayID)"]
        XCTAssertTrue(weekTop.waitForExistence(timeout: 5))
        XCTAssertTrue(weekBottom.waitForExistence(timeout: 5))
        XCTAssertTrue(weekTop.isHittable)
        XCTAssertTrue(weekBottom.isHittable)
        XCTAssertGreaterThanOrEqual(weekTop.frame.height, 44)
        XCTAssertGreaterThanOrEqual(weekBottom.frame.height, 44)

        let weekScreenshot = XCTAttachment(screenshot: app.screenshot())
        weekScreenshot.name = "Week offscreen event edge cues"
        weekScreenshot.lifetime = .keepAlways
        add(weekScreenshot)

        let weekMidnight = app.otherElements.matching(identifier: "week-scroll-0").firstMatch
        XCTAssertTrue(weekMidnight.waitForExistence(timeout: 3))
        let weekMidnightBeforeJump = weekMidnight.frame.minY
        weekBottom.tap()
        RunLoop.current.run(until: Date().addingTimeInterval(0.5))
        XCTAssertLessThan(weekMidnight.frame.minY, weekMidnightBeforeJump - 10)

        app.terminate()
        app.launch()

        let dayMode = app.buttons.matching(
            NSPredicate(format: "label IN %@", ["Day", "日", "日视图"])
        ).firstMatch
        XCTAssertTrue(dayMode.waitForExistence(timeout: 5))
        dayMode.tap()

        let timeline = app.descendants(matching: .any)["calendar-day-timeline"]
        XCTAssertTrue(timeline.waitForExistence(timeout: 5))
        RunLoop.current.run(until: Date().addingTimeInterval(0.5))

        let dayTop = app.buttons["calendar-day-offscreen-event-top"]
        let dayBottom = app.buttons["calendar-day-offscreen-event-bottom"]
        XCTAssertTrue(
            dayTop.waitForExistence(timeout: 5),
            "Day timeline state: \(String(describing: timeline.value))"
        )
        XCTAssertTrue(dayBottom.waitForExistence(timeout: 5))
        XCTAssertTrue(dayTop.isHittable)
        XCTAssertTrue(dayBottom.isHittable)
        XCTAssertGreaterThanOrEqual(dayTop.frame.height, 44)
        XCTAssertGreaterThanOrEqual(dayBottom.frame.height, 44)

        let dayScreenshot = XCTAttachment(screenshot: app.screenshot())
        dayScreenshot.name = "Day offscreen event edge cues"
        dayScreenshot.lifetime = .keepAlways
        add(dayScreenshot)

        let dayMidnight = app.descendants(matching: .any)["calendar-slot-0"]
        XCTAssertTrue(dayMidnight.waitForExistence(timeout: 3))
        let dayMidnightBeforeJump = dayMidnight.frame.minY
        dayBottom.tap()
        RunLoop.current.run(until: Date().addingTimeInterval(0.5))
        XCTAssertLessThan(dayMidnight.frame.minY, dayMidnightBeforeJump - 10)
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
        app.launchArguments = [
            "--ui-testing-authenticated",
            "-UIPreferredContentSizeCategoryName",
            "UICTContentSizeCategoryL",
        ]
        app.launch()

        let addEvent = app.buttons["new-event"]
        XCTAssertTrue(addEvent.waitForExistence(timeout: 5))
        XCTAssertFalse(app.buttons["calendar-add-menu"].exists)
        addEvent.tap()

        let title = app.textFields["event-title"]
        XCTAssertTrue(title.waitForExistence(timeout: 3))
        let windowFrame = app.windows.firstMatch.frame
        XCTAssertGreaterThan(
            title.frame.minY,
            windowFrame.minY + windowFrame.height * 0.40,
            "The new-event sheet should open below the top chrome instead of at the large detent."
        )
        XCTAssertLessThan(
            title.frame.minY,
            windowFrame.minY + windowFrame.height * 0.72,
            "The new-event title must remain immediately reachable in the initial sheet position."
        )
        let initialSheet = XCTAttachment(screenshot: app.screenshot())
        initialSheet.name = "New event initial sheet position"
        initialSheet.lifetime = .keepAlways
        add(initialSheet)

        let location = app.textFields["event-location"]
        let startPicker = app.descendants(matching: .any)["event-start"]
        let endPicker = app.descendants(matching: .any)["event-end"]
        let repeatPicker = app.descendants(matching: .any)["event-repeat"]
        let notes = app.descendants(matching: .any)["event-notes"]
        XCTAssertTrue(location.waitForExistence(timeout: 3))
        XCTAssertTrue(startPicker.waitForExistence(timeout: 3))
        XCTAssertTrue(endPicker.waitForExistence(timeout: 3))
        XCTAssertTrue(repeatPicker.waitForExistence(timeout: 3))
        XCTAssertTrue(notes.waitForExistence(timeout: 3))
        XCTAssertLessThan(title.frame.midY, location.frame.midY)
        XCTAssertLessThan(location.frame.midY, startPicker.frame.midY)
        XCTAssertLessThan(startPicker.frame.midY, endPicker.frame.midY)
        XCTAssertLessThan(endPicker.frame.midY, repeatPicker.frame.midY)
        let primaryRowSteps = [
            location.frame.midY - title.frame.midY,
            startPicker.frame.midY - location.frame.midY,
            endPicker.frame.midY - startPicker.frame.midY,
            repeatPicker.frame.midY - endPicker.frame.midY,
        ]
        let primaryRowStep = primaryRowSteps.reduce(0, +) / CGFloat(primaryRowSteps.count)
        for step in primaryRowSteps {
            XCTAssertEqual(
                step,
                primaryRowStep,
                accuracy: 1.5,
                "Title, location, start, end and repeat must use equal row spacing."
            )
        }
        XCTAssertGreaterThan(
            notes.frame.midY - repeatPicker.frame.midY,
            (primaryRowSteps.max() ?? 0) + 4,
            "Title, location, start, end and repeat must remain in one visual module."
        )
        XCTAssertTrue(startPicker.isHittable || startPicker.buttons.firstMatch.isHittable)
        XCTAssertTrue(endPicker.isHittable || endPicker.buttons.firstMatch.isHittable)
        XCTAssertGreaterThanOrEqual(startPicker.frame.height, 40)
        XCTAssertGreaterThanOrEqual(endPicker.frame.height, 40)
        XCTAssertEqual(startPicker.elementType, endPicker.elementType)
        XCTAssertEqual(startPicker.frame.width, endPicker.frame.width, accuracy: 1)
        XCTAssertFalse(app.buttons["event-end-option-60"].exists)
        XCTAssertFalse(app.buttons["event-end-option-90"].exists)
        XCTAssertFalse(app.buttons["event-end-custom"].exists)
        XCTAssertFalse(app.descendants(matching: .any)["event-end-custom-sheet"].exists)

        let calendarPicker = app.buttons["event-calendar-picker"]
        for _ in 0..<4 where !calendarPicker.isHittable {
            app.swipeUp()
        }
        XCTAssertTrue(calendarPicker.waitForExistence(timeout: 3))
        XCTAssertTrue(calendarPicker.isHittable)
        XCTAssertGreaterThanOrEqual(calendarPicker.frame.height, 44)
        XCTAssertTrue(
            ["Calendar", "日历", "Kalender"].contains {
                calendarPicker.label.localizedCaseInsensitiveContains($0)
            },
            calendarPicker.debugDescription
        )

        calendarPicker.tap()
        let studyCategory = app.buttons["event-calendar-option-ui-test-category"]
        XCTAssertTrue(studyCategory.waitForExistence(timeout: 3))

        let calendarMenu = XCTAttachment(screenshot: app.screenshot())
        calendarMenu.name = "New event calendar color menu"
        calendarMenu.lifetime = .keepAlways
        add(calendarMenu)

        studyCategory.tap()
        XCTAssertEqual(calendarPicker.value as? String, "Study")

        let selectedCalendar = XCTAttachment(screenshot: app.screenshot())
        selectedCalendar.name = "New event selected calendar color"
        selectedCalendar.lifetime = .keepAlways
        add(selectedCalendar)

        for _ in 0..<4 where !title.isHittable {
            app.swipeDown()
        }

        title.tap()
        title.typeText("Library study")
        XCTAssertEqual(title.value as? String, "Library study")
        XCTAssertTrue(app.buttons["event-save"].isEnabled)
        XCTAssertTrue(location.exists)
        XCTAssertTrue(startPicker.exists)
        XCTAssertTrue(endPicker.exists)
        XCTAssertTrue(repeatPicker.exists)
        XCTAssertTrue(app.buttons["event-smart-fill"].exists)
    }

    func testNewEventKeyboardDismissesOnBackgroundTapAndScroll() {
        let app = XCUIApplication()
        app.launchArguments = ["--ui-testing-authenticated"]
        app.launch()

        let addEvent = app.buttons["new-event"]
        XCTAssertTrue(addEvent.waitForExistence(timeout: 5))
        addEvent.tap()

        let form = app.collectionViews["event-editor-form"]
        let title = app.textFields["event-title"]
        let location = app.textFields["event-location"]
        XCTAssertTrue(form.waitForExistence(timeout: 3))
        XCTAssertTrue(title.waitForExistence(timeout: 3))
        XCTAssertTrue(location.waitForExistence(timeout: 3))

        title.tap()
        title.typeText("Keyboard draft")
        XCTAssertTrue(app.keyboards.firstMatch.waitForExistence(timeout: 3))

        location.tap()
        XCTAssertTrue(
            app.keyboards.firstMatch.exists,
            "Switching between text fields should keep text entry active."
        )
        location.typeText("Munich")

        let navigationBar = app.navigationBars.firstMatch
        XCTAssertTrue(navigationBar.exists)
        navigationBar.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)).tap()

        XCTAssertTrue(
            app.keyboards.firstMatch.waitForNonExistence(timeout: 3),
            "Tapping the form background should dismiss the keyboard."
        )
        XCTAssertEqual(title.value as? String, "Keyboard draft")
        XCTAssertEqual(location.value as? String, "Munich")

        title.tap()
        XCTAssertTrue(app.keyboards.firstMatch.waitForExistence(timeout: 3))
        form.swipeUp()
        XCTAssertTrue(
            app.keyboards.firstMatch.waitForNonExistence(timeout: 3),
            "Dragging the form should interactively dismiss the keyboard and continue scrolling."
        )
    }

    func testCalendarHeaderUsesConnectionsAndAvailabilityLivesInChat() {
        let app = XCUIApplication()
        app.launchArguments = ["--ui-testing-authenticated"]
        app.launch()

        XCTAssertTrue(app.buttons["calendar-connections"].waitForExistence(timeout: 5))
        XCTAssertFalse(app.buttons["calendar-share-schedule"].exists)

        let chatsTab = app.tabBars.buttons.matching(
            NSPredicate(format: "label IN %@", ["Chats", "聊天", "Chats"])
        ).firstMatch
        XCTAssertTrue(chatsTab.waitForExistence(timeout: 3))
        chatsTab.tap()
        XCTAssertTrue(app.descendants(matching: .any)["inbox-list"].waitForExistence(timeout: 3))
        app.descendants(matching: .any)["inbox-row-ui-connection"].tap()
        XCTAssertTrue(app.descendants(matching: .any)["direct-chat"].waitForExistence(timeout: 3))

        app.buttons["chat-composer-attach"].tap()
        let availability = app.descendants(matching: .any)["chat-composer-schedule-share"]
        XCTAssertTrue(availability.waitForExistence(timeout: 3))
        availability.tap()
        XCTAssertTrue(
            app.descendants(matching: .any)["schedule-share-settings"]
                .waitForExistence(timeout: 3)
        )
    }

    func testCalendarPrimaryActionsAreClearAndReachable() {
        let app = XCUIApplication()
        app.launchArguments = [
            "--ui-testing-authenticated",
            "-UIPreferredContentSizeCategoryName",
            "UICTContentSizeCategoryL",
        ]
        app.launch()

        let connections = app.buttons["calendar-connections"]
        let search = app.buttons["calendar-search"]
        XCTAssertTrue(connections.waitForExistence(timeout: 5))
        XCTAssertTrue(search.waitForExistence(timeout: 5))
        XCTAssertTrue(search.isHittable)
        XCTAssertGreaterThanOrEqual(search.frame.width, 44)
        XCTAssertGreaterThanOrEqual(search.frame.height, 44)
        XCTAssertGreaterThanOrEqual(connections.frame.width, 44)
        XCTAssertGreaterThanOrEqual(connections.frame.height, 44)
        let month = app.staticTexts["calendar-month-title"]
        let today = app.buttons["home-jump-today"]
        XCTAssertTrue(month.exists)
        XCTAssertTrue(today.exists)
        XCTAssertFalse(app.buttons["open-courses"].exists)
        XCTAssertGreaterThanOrEqual(today.frame.height, 44)
        let add = app.buttons["new-event"]
        XCTAssertTrue(add.waitForExistence(timeout: 3))
        XCTAssertTrue(add.isHittable)
        XCTAssertGreaterThanOrEqual(add.frame.width, 44)
        XCTAssertGreaterThanOrEqual(add.frame.height, 44)
        XCTAssertFalse(app.buttons["calendar-add-menu"].exists)

        let calendars = app.buttons["manage-calendars"]
        XCTAssertTrue(calendars.waitForExistence(timeout: 3))
        XCTAssertFalse(app.buttons["open-calendar-agenda"].exists)
        XCTAssertTrue(calendars.isHittable)
        XCTAssertTrue(["Calendar categories", "日历分类", "Kalenderkategorien"].contains(calendars.label))
        XCTAssertGreaterThanOrEqual(calendars.frame.width, 44)
        XCTAssertGreaterThanOrEqual(calendars.frame.height, 44)
        let viewMode = app.descendants(matching: .any)["calendar-view-mode"]
        XCTAssertTrue(viewMode.exists)
        XCTAssertLessThanOrEqual(search.frame.maxX, connections.frame.minX)
        XCTAssertLessThanOrEqual(connections.frame.maxX, calendars.frame.minX)
        XCTAssertLessThan(abs(calendars.frame.midY - connections.frame.midY), 4)
        XCTAssertLessThanOrEqual(viewMode.frame.maxX, today.frame.minX)
        XCTAssertLessThan(abs(viewMode.frame.midY - today.frame.midY), 4)
        XCTAssertLessThanOrEqual(calendars.frame.maxY, viewMode.frame.minY)
        let windowFrame = app.windows.firstMatch.frame
        let tabBar = app.tabBars.firstMatch
        XCTAssertTrue(tabBar.exists)
        XCTAssertGreaterThan(add.frame.midX, windowFrame.midX)
        XCTAssertGreaterThan(add.frame.minY, viewMode.frame.maxY)
        XCTAssertEqual(
            windowFrame.maxX - add.frame.maxX,
            16,
            accuracy: 2
        )
        let widthControlBar = app.descendants(matching: .any)["home-week-visible-day-count"]
        XCTAssertTrue(widthControlBar.exists)
        XCTAssertEqual(
            widthControlBar.frame.minY - add.frame.maxY,
            12,
            accuracy: 3,
            "The create action belongs to the calendar canvas and must sit above, not overlap, the width controls."
        )
        XCTAssertLessThan(add.frame.maxY, tabBar.frame.minY)
        for element in [month, today, search, connections, calendars, viewMode, add] {
            XCTAssertTrue(windowFrame.contains(element.frame))
        }

        let dayMode = app.buttons.matching(
            NSPredicate(format: "label IN %@", ["Day", "日", "日视图"])
        ).firstMatch
        dayMode.tap()
        XCTAssertTrue(
            app.descendants(matching: .any)["calendar-day-timeline"]
                .waitForExistence(timeout: 3)
        )
        let dayButtonLayout = XCTAttachment(screenshot: app.screenshot())
        dayButtonLayout.name = "Calendar new-event button in day view"
        dayButtonLayout.lifetime = .keepAlways
        self.add(dayButtonLayout)
        XCTAssertEqual(windowFrame.maxX - add.frame.maxX, 16, accuracy: 2)
        XCTAssertEqual(tabBar.frame.minY - add.frame.maxY, 12, accuracy: 3)

        let monthMode = app.buttons.matching(
            NSPredicate(format: "label IN %@", ["Month", "月", "Monat"])
        ).firstMatch
        monthMode.tap()
        XCTAssertTrue(
            app.descendants(matching: .any)["calendar-month-view"]
                .waitForExistence(timeout: 3)
        )
        XCTAssertEqual(windowFrame.maxX - add.frame.maxX, 16, accuracy: 2)
        XCTAssertEqual(tabBar.frame.minY - add.frame.maxY, 12, accuracy: 3)
    }

    func retiredCalendarOffersLinkAndImageScheduleSharing() {
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
        let image = app.buttons["schedule-share-destination-image-preview"]
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

    func retiredScheduleShareShowsFixedWeekAndExpandableCalendarPreview() {
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

    func retiredCalendarSavesScheduleImageToPhotos() {
        let app = XCUIApplication()
        app.launchArguments = ["--ui-testing-authenticated"]
        app.launch()

        let share = app.buttons["calendar-share-schedule"]
        XCTAssertTrue(share.waitForExistence(timeout: 5))
        share.tap()

        let openDestinations = app.buttons["schedule-share-open-destinations"]
        XCTAssertTrue(openDestinations.waitForExistence(timeout: 3))
        openDestinations.tap()

        let saveImage = openPreparedScheduleImagePreview(in: app)
        saveImage.tap()

        assertScheduleImageSaved(in: app, timeout: 5)
        XCTAssertTrue(app.descendants(matching: .any)["schedule-share-image-preview"].exists)
    }

    func retiredCalendarSharesPreparedScheduleImage() {
        let app = XCUIApplication()
        app.launchArguments = ["--ui-testing-authenticated"]
        app.launch()

        let share = app.buttons["calendar-share-schedule"]
        XCTAssertTrue(share.waitForExistence(timeout: 5))
        share.tap()

        let openDestinations = app.buttons["schedule-share-open-destinations"]
        XCTAssertTrue(openDestinations.waitForExistence(timeout: 3))
        openDestinations.tap()

        _ = openPreparedScheduleImagePreview(in: app)
        let preview = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
        preview.name = "Schedule image full-screen preview"
        preview.lifetime = .keepAlways
        add(preview)

        let shareImage = app.buttons["schedule-share-image-preview-share"]
        shareImage.tap()

        XCTAssertTrue(app.otherElements["ActivityListView"].waitForExistence(timeout: 5))
        let closeShareSheet = app.buttons["header.closeButton"]
        XCTAssertTrue(closeShareSheet.waitForExistence(timeout: 3))
        closeShareSheet.tap()
        XCTAssertTrue(app.descendants(matching: .any)["schedule-share-image-preview"].exists)
    }

    func retiredCalendarSavesScheduleImageUsingRealPhotoLibrary() throws {
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

        let saveImage = openPreparedScheduleImagePreview(in: app)
        saveImage.tap()

        assertScheduleImageSaved(in: app, timeout: 20)
    }

    private func openPreparedScheduleImagePreview(in app: XCUIApplication) -> XCUIElement {
        let imagePreview = app.buttons["schedule-share-destination-image-preview"]
        XCTAssertTrue(imagePreview.waitForExistence(timeout: 3))
        imagePreview.tap()

        XCTAssertTrue(
            app.descendants(matching: .any)["schedule-share-image-preview"]
                .waitForExistence(timeout: 3)
        )
        XCTAssertTrue(
            app.descendants(matching: .any)["schedule-share-image-preview-pages"]
                .waitForExistence(timeout: 5)
        )
        let saveImage = app.buttons["schedule-share-image-preview-save"]
        XCTAssertTrue(saveImage.waitForExistence(timeout: 3))
        XCTAssertTrue(app.buttons["schedule-share-image-preview-share"].exists)
        return saveImage
    }

    private func assertScheduleImageSaved(in app: XCUIApplication, timeout: TimeInterval) {
        let savedNotice = app.staticTexts.matching(
            NSPredicate(
                format: "label IN %@",
                ["Saved to Photos", "已保存到相册", "In Fotos gespeichert"]
            )
        ).firstMatch
        XCTAssertTrue(savedNotice.waitForExistence(timeout: timeout))
    }

    func retiredCalendarCanCancelScheduleImageSave() {
        let app = XCUIApplication()
        app.launchArguments = ["--ui-testing-authenticated", "--ui-testing-slow-photo-save"]
        app.launch()

        let share = app.buttons["calendar-share-schedule"]
        XCTAssertTrue(share.waitForExistence(timeout: 5))
        share.tap()

        let openDestinations = app.buttons["schedule-share-open-destinations"]
        XCTAssertTrue(openDestinations.waitForExistence(timeout: 3))
        openDestinations.tap()

        let saveImage = openPreparedScheduleImagePreview(in: app)
        saveImage.tap()

        let saving = app.descendants(matching: .any)["schedule-share-image-saving"]
        XCTAssertTrue(saving.waitForExistence(timeout: 2))
        let cancel = app.buttons["schedule-share-image-save-cancel"]
        XCTAssertTrue(cancel.waitForExistence(timeout: 2))
        cancel.tap()

        XCTAssertFalse(saving.waitForExistence(timeout: 1))
        XCTAssertTrue(app.descendants(matching: .any)["schedule-share-image-preview"].exists)
        XCTAssertTrue(app.buttons["schedule-share-image-preview-save"].isEnabled)
    }

    func retiredDenseScheduleImageGenerationRemainsCancelable() {
        let app = XCUIApplication()
        app.launchArguments = [
            "--ui-testing-authenticated",
            "--ui-testing-dense-schedule-share",
            "--ui-testing-slow-image-preview",
        ]
        app.launch()

        let share = app.buttons["calendar-share-schedule"]
        XCTAssertTrue(share.waitForExistence(timeout: 5))
        share.tap()
        let openDestinations = app.buttons["schedule-share-open-destinations"]
        XCTAssertTrue(openDestinations.waitForExistence(timeout: 3))
        openDestinations.tap()

        let imagePreview = app.buttons["schedule-share-destination-image-preview"]
        let preview = app.descendants(matching: .any)["schedule-share-image-preview"]
        let loading = app.descendants(matching: .any)["schedule-share-image-preview-loading"]
        let close = app.buttons["schedule-share-image-preview-close"]
        XCTAssertTrue(imagePreview.waitForExistence(timeout: 3))

        let options = XCTMeasureOptions()
        options.iterationCount = 3
        measure(metrics: appPerformanceMetrics(for: app), options: options) {
            assertInteractionDuration(
                "Dense schedule image preview cancellation",
                atMost: PerformanceBudget.denseScheduleImageCancellation
            ) {
                imagePreview.tap()
                XCTAssertTrue(preview.waitForExistence(timeout: 2))
                XCTAssertTrue(loading.waitForExistence(timeout: 2))
                RunLoop.current.run(until: Date().addingTimeInterval(0.35))
                XCTAssertTrue(close.waitForExistence(timeout: 2))
                close.tap()
                XCTAssertTrue(preview.waitForNonExistence(timeout: 2))
                XCTAssertTrue(imagePreview.isEnabled)
            }
        }
    }

    func testSmartSchedulePreviewsAndSavesAParsedDraft() {
        let app = XCUIApplication()
        app.launchArguments = [
            "--ui-testing-authenticated",
            "--ui-testing-smart-schedule",
            "--ui-testing-expose-smart-detent",
        ]
        app.launch()

        let addEvent = app.buttons["new-event"]
        XCTAssertTrue(addEvent.waitForExistence(timeout: 5))
        addEvent.tap()
        let smartFill = app.buttons["event-smart-fill"]
        XCTAssertTrue(smartFill.waitForExistence(timeout: 3))
        smartFill.tap()

        let smartSchedule = app.descendants(matching: .any)["smart-schedule-view"]
        XCTAssertTrue(smartSchedule.waitForExistence(timeout: 3))
        XCTAssertEqual(smartSchedule.value as? String, "compact")

        let input = app.textViews["smart-schedule-input"]
        XCTAssertTrue(input.waitForExistence(timeout: 3))
        input.tap()
        let largeDetent = NSPredicate(format: "value == %@", "large")
        expectation(for: largeDetent, evaluatedWith: smartSchedule)
        waitForExpectations(timeout: 3)
        input.typeText("Tomorrow at 3 in the library")
        app.buttons["smart-schedule-parse"].tap()

        let draft = app.buttons.matching(
            NSPredicate(format: "identifier BEGINSWITH %@", "smart-schedule-draft-")
        ).firstMatch
        XCTAssertTrue(draft.waitForExistence(timeout: 3))
        draft.tap()
        XCTAssertTrue(
            app.descendants(matching: .any)["smart-schedule-draft-editor"]
                .waitForExistence(timeout: 3)
        )
        let sharedTitle = app.textFields["event-title"]
        let sharedLocation = app.textFields["event-location"]
        let sharedStart = app.descendants(matching: .any)["event-start"]
        let sharedEnd = app.descendants(matching: .any)["event-end"]
        let sharedRepeat = app.descendants(matching: .any)["event-repeat"]
        XCTAssertTrue(sharedTitle.waitForExistence(timeout: 3))
        XCTAssertTrue(sharedLocation.exists)
        XCTAssertTrue(sharedStart.exists)
        XCTAssertTrue(sharedEnd.exists)
        XCTAssertTrue(sharedRepeat.exists)
        XCTAssertEqual(sharedStart.elementType, sharedEnd.elementType)
        XCTAssertLessThan(sharedTitle.frame.midY, sharedLocation.frame.midY)
        XCTAssertLessThan(sharedLocation.frame.midY, sharedStart.frame.midY)
        XCTAssertLessThan(sharedStart.frame.midY, sharedEnd.frame.midY)
        XCTAssertLessThan(sharedEnd.frame.midY, sharedRepeat.frame.midY)
        XCTAssertTrue(app.descendants(matching: .any)["event-notes"].exists)
        XCTAssertTrue(app.buttons["event-calendar-picker"].exists)
        XCTAssertTrue(app.buttons["smart-draft-apply"].exists)
        app.buttons["smart-draft-apply"].tap()
        XCTAssertTrue(
            app.descendants(matching: .any)["smart-schedule-draft-editor"]
                .waitForNonExistence(timeout: 3)
        )
        let save = app.buttons["smart-schedule-save"]
        XCTAssertTrue(save.exists)
        save.tap()
        XCTAssertTrue(app.descendants(matching: .any)["smart-schedule-view"].waitForNonExistence(timeout: 3))
        XCTAssertTrue(app.textFields["event-title"].waitForNonExistence(timeout: 3))
    }

    func testSmartScheduleVoiceStartsWithoutBlockingAndCanBeStopped() {
        let app = XCUIApplication()
        app.launchArguments = [
            "--ui-testing-authenticated",
            "--ui-testing-smart-schedule",
            "--ui-testing-smart-voice",
            "--ui-testing-expose-smart-detent",
        ]
        app.launch()

        let addEvent = app.buttons["new-event"]
        XCTAssertTrue(addEvent.waitForExistence(timeout: 5))
        addEvent.tap()
        let smartFill = app.buttons["event-smart-fill"]
        XCTAssertTrue(smartFill.waitForExistence(timeout: 3))
        smartFill.tap()

        let voice = app.buttons["smart-schedule-voice"]
        XCTAssertTrue(voice.waitForExistence(timeout: 3))
        XCTAssertEqual(
            app.descendants(matching: .any)["smart-schedule-view"].value as? String,
            "compact"
        )
        // Nested sheets are reported through iOS 26's transformed accessibility
        // coordinates (a declared 56pt row resolves to ~53.6pt on 13 mini).
        XCTAssertGreaterThanOrEqual(voice.frame.height, 52)
        XCTAssertGreaterThan(voice.frame.width, 240)

        let inputScreenshot = XCTAttachment(screenshot: app.screenshot())
        inputScreenshot.name = "Smart fill input"
        inputScreenshot.lifetime = .keepAlways
        add(inputScreenshot)

        voice.coordinate(withNormalizedOffset: CGVector(dx: 0.15, dy: 0.5)).tap()

        let cancel = app.buttons["smart-schedule-cancel"]
        XCTAssertTrue(cancel.waitForExistence(timeout: 1))
        XCTAssertTrue(cancel.isHittable)

        let listening = app.staticTexts.matching(
            NSPredicate(format: "label IN %@", ["Listening", "正在聆听"])
        ).firstMatch
        XCTAssertTrue(listening.waitForExistence(timeout: 3))
        voice.coordinate(withNormalizedOffset: CGVector(dx: 0.85, dy: 0.5)).tap()
        XCTAssertTrue(listening.waitForNonExistence(timeout: 3))
        XCTAssertTrue(app.descendants(matching: .any)["smart-schedule-view"].exists)
    }

    func testSmartScheduleDensePreviewIsGroupedAndKeepsWarningsCollapsed() {
        let app = XCUIApplication()
        app.launchArguments = [
            "--ui-testing-authenticated",
            "--ui-testing-smart-schedule-dense",
        ]
        app.launch()

        let addEvent = app.buttons["new-event"]
        XCTAssertTrue(addEvent.waitForExistence(timeout: 5))
        addEvent.tap()
        let smartFill = app.buttons["event-smart-fill"]
        XCTAssertTrue(smartFill.waitForExistence(timeout: 3))
        smartFill.tap()

        let input = app.textViews["smart-schedule-input"]
        XCTAssertTrue(input.waitForExistence(timeout: 3))
        input.tap()
        input.typeText("Study for three days")
        app.buttons["smart-schedule-parse"].tap()

        let summary = app.descendants(matching: .any)["smart-schedule-result-summary"]
        XCTAssertTrue(summary.waitForExistence(timeout: 3))
        let warning = app.descendants(matching: .any)["smart-schedule-warning-summary"]
        XCTAssertTrue(warning.waitForExistence(timeout: 3))
        XCTAssertLessThan(warning.frame.height, 90)
        XCTAssertFalse(app.staticTexts["The title may need review."].exists)

        let save = app.buttons["smart-schedule-save"]
        XCTAssertTrue(save.waitForExistence(timeout: 3))
        XCTAssertTrue(save.isHittable)

        let screenshot = XCTAttachment(screenshot: app.screenshot())
        screenshot.name = "Smart schedule grouped preview"
        screenshot.lifetime = .keepAlways
        add(screenshot)
    }

    func testRecurringEventSaveOffersThreeUpdateScopes() {
        let app = XCUIApplication()
        app.launchArguments = ["--ui-testing-authenticated"]
        app.launch()

        let month = app.buttons.matching(
            NSPredicate(format: "label IN %@", ["Month", "月", "Monat"])
        ).firstMatch
        XCTAssertTrue(month.waitForExistence(timeout: 5))
        month.tap()

        let event = app.buttons["month-event-ui-recurring-event"]
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

    func testMonthViewShowsSelectedDayEventsAndOpensPlanDetails() {
        let app = XCUIApplication()
        app.launchArguments = ["--ui-testing-authenticated"]
        app.launch()

        let month = app.buttons.matching(
            NSPredicate(format: "label IN %@", ["Month", "月", "Monat"])
        ).firstMatch
        XCTAssertTrue(month.waitForExistence(timeout: 5))
        month.tap()

        let plan = app.buttons["month-event-ui-social-plan"]
        XCTAssertTrue(plan.waitForExistence(timeout: 3))
        plan.tap()
        XCTAssertTrue(app.buttons["calendar-open-plan"].waitForExistence(timeout: 3))
    }

    func testMonthViewLongPressUsesSharedEventActions() {
        let app = XCUIApplication()
        app.launchArguments = ["--ui-testing-authenticated"]
        app.launch()

        let month = app.buttons.matching(
            NSPredicate(format: "label IN %@", ["Month", "月", "Monat"])
        ).firstMatch
        XCTAssertTrue(month.waitForExistence(timeout: 5))
        month.tap()

        let event = app.buttons["month-event-ui-recurring-event"]
        XCTAssertTrue(event.waitForExistence(timeout: 3))
        event.press(forDuration: 1.0)

        XCTAssertTrue(app.descendants(matching: .any)["calendar-event-context-menu"].waitForExistence(timeout: 3))
        XCTAssertTrue(app.buttons["calendar-event-context-copy"].waitForExistence(timeout: 3))
        XCTAssertTrue(app.buttons["calendar-event-context-duplicate"].exists)
        XCTAssertTrue(app.buttons["calendar-event-context-delete"].exists)
        XCTAssertFalse(app.buttons.matching(
            NSPredicate(
                format: "label IN %@",
                ["View details", "查看详情", "Edit event", "编辑日程", "Move event", "移动日程"]
            )
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

        XCTAssertTrue(app.descendants(matching: .any)["long-press-action-menu"].waitForExistence(timeout: 3))
        let newEvent = app.buttons["calendar-slot-context-new-event"].firstMatch
        XCTAssertTrue(newEvent.waitForExistence(timeout: 3))
        newEvent.tap()
        XCTAssertTrue(app.textFields["event-title"].waitForExistence(timeout: 3))
    }

    func testEventContextDeletesOneOffEvent() {
        let app = XCUIApplication()
        app.launchArguments = ["--ui-testing-authenticated"]
        app.launch()

        let event = app.buttons["home-week-event-ui-social-plan"]
        XCTAssertTrue(event.waitForExistence(timeout: 3))
        event.press(forDuration: 1.0)
        let delete = app.buttons.matching(identifier: "calendar-event-context-delete").firstMatch
        XCTAssertTrue(delete.waitForExistence(timeout: 3))
        delete.tap()

        let confirm = app.buttons.matching(identifier: "calendar-event-delete-this").firstMatch
        XCTAssertTrue(confirm.waitForExistence(timeout: 3))
        XCTAssertTrue(
            ["Delete event", "删除日程", "Termin löschen"].contains(confirm.label),
            "A one-off event should use a normal delete confirmation, not occurrence wording"
        )
        XCTAssertFalse(app.buttons.matching(identifier: "calendar-event-delete-future").firstMatch.exists)
        XCTAssertFalse(app.buttons.matching(identifier: "calendar-event-delete-all").firstMatch.exists)
        confirm.tap()

        XCTAssertTrue(event.waitForNonExistence(timeout: 3))
        XCTAssertTrue(app.descendants(matching: .any)["calendar-notice"].waitForExistence(timeout: 3))
    }

    func testCoursesOpenFromMeAndShowCourseDetail() {
        let app = XCUIApplication()
        app.launchArguments = ["--ui-testing-authenticated"]
        app.launch()

        openCoursesFromMe(in: app)
        let myCourses = app.buttons.matching(
            NSPredicate(format: "label IN %@", ["My courses", "我的课程", "Meine Kurse"])
        ).firstMatch
        XCTAssertTrue(myCourses.waitForExistence(timeout: 3))
        XCTAssertTrue(myCourses.isSelected)
        let course = app.descendants(matching: .any)["course-row-ui-course"]
        XCTAssertTrue(course.waitForExistence(timeout: 3))
        course.tap()

        XCTAssertTrue(app.descendants(matching: .any)["course-detail"].waitForExistence(timeout: 3))
        XCTAssertTrue(app.buttons["course-join"].exists)
        XCTAssertTrue(app.buttons["course-save"].exists)
        XCTAssertFalse(app.buttons["course-open-chat"].exists)
        XCTAssertTrue(app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH 'course-use-schedule-'")).firstMatch.exists)

        app.buttons["course-join"].tap()
        let leave = app.buttons["course-leave"]
        XCTAssertTrue(leave.waitForExistence(timeout: 3))
        XCTAssertFalse(app.buttons["course-open-chat"].exists)
        leave.tap()
        XCTAssertTrue(app.descendants(matching: .any)["course-leave-prompt"].waitForExistence(timeout: 3))
        XCTAssertTrue(app.buttons["course-leave-confirm"].exists)
        let cancelLeave = app.buttons["course-leave-cancel"]
        XCTAssertTrue(cancelLeave.exists)
        cancelLeave.tap()
        XCTAssertTrue(app.descendants(matching: .any)["course-leave-prompt"].waitForNonExistence(timeout: 3))
    }

    func testEmptyMyCoursesOffersCatalogWithoutDeadEnd() {
        let app = XCUIApplication()
        app.launchArguments = [
            "--ui-testing-authenticated",
            "--ui-testing-empty-courses",
        ]
        app.launch()

        openCoursesFromMe(in: app)

        let browse = app.buttons["course-empty-browse"]
        XCTAssertTrue(browse.waitForExistence(timeout: 3))
        browse.tap()

        let popular = app.buttons.matching(
            NSPredicate(format: "label IN %@", ["Popular", "热门", "Beliebt"])
        ).firstMatch
        XCTAssertTrue(popular.waitForExistence(timeout: 3))
        XCTAssertTrue(popular.isSelected)
    }

    func testCourseReviewAndImportEntryPoints() {
        let app = XCUIApplication()
        app.launchArguments = ["--ui-testing-authenticated"]
        app.launch()

        openCoursesFromMe(in: app)

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

        openCoursesFromMe(in: app)

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

        let calendars = app.buttons["manage-calendars"]
        XCTAssertTrue(calendars.waitForExistence(timeout: 5))
        calendars.tap()
        XCTAssertTrue(app.descendants(matching: .any)["calendar-list"].waitForExistence(timeout: 3))

        app.buttons["calendar-add"].tap()
        let name = app.textFields["calendar-name"]
        XCTAssertTrue(name.waitForExistence(timeout: 3))
        XCTAssertTrue(
            app.descendants(matching: .any)["calendar-color-custom"]
                .waitForExistence(timeout: 3)
        )
        name.tap()
        name.typeText("Road trip")
        app.buttons["calendar-save"].tap()

        XCTAssertTrue(app.staticTexts["Road trip"].waitForExistence(timeout: 3))
    }

    func testCalendarConnectionsExposeAppleSubscriptionAndFileTransfer() {
        let app = XCUIApplication()
        app.launchArguments = ["--ui-testing-authenticated"]
        app.launch()

        let connections = app.buttons["calendar-connections"]
        XCTAssertTrue(connections.waitForExistence(timeout: 5))
        connections.tap()
        XCTAssertTrue(
            app.descendants(matching: .any)["calendar-connections"]
                .waitForExistence(timeout: 3)
        )

        let addAppleCalendar = app.buttons["calendar-connection-add-apple"]
        let importAction = app.buttons["calendar-import"]
        let exportAction = app.buttons["calendar-export"]
        XCTAssertTrue(addAppleCalendar.waitForExistence(timeout: 3))
        XCTAssertTrue(importAction.exists)
        XCTAssertTrue(exportAction.exists)
        XCTAssertGreaterThanOrEqual(addAppleCalendar.frame.height, 44)

        addAppleCalendar.tap()
        XCTAssertTrue(
            app.descendants(matching: .any)["calendar-connection-ui-calendar-connection"]
                .waitForExistence(timeout: 3)
        )
        XCTAssertTrue(
            app.descendants(matching: .any)["calendar-connection-notice"]
                .waitForExistence(timeout: 3)
        )
        let confirmation = app.staticTexts.matching(
            NSPredicate(
                format: "label IN %@",
                [
                    "Continue in Apple Calendar and confirm the subscription.",
                    "请在 Apple 日历中继续并确认订阅。",
                    "Fahre in Apple-Kalender fort und bestätige das Abonnement.",
                ]
            )
        ).firstMatch
        XCTAssertTrue(confirmation.waitForExistence(timeout: 3))
        app.buttons["calendar-connection-notice-ok"].tap()

        let revoke = app.buttons["calendar-connection-revoke-ui-calendar-connection"]
        XCTAssertTrue(revoke.waitForExistence(timeout: 3))
        revoke.tap()
        XCTAssertTrue(
            app.descendants(matching: .any)["calendar-connection-revoke-prompt"]
                .waitForExistence(timeout: 3)
        )
    }

    func testCalendarExportYearPickerDefaultsToCurrentYearAtAccessibilityTextSize() {
        let app = XCUIApplication()
        app.launchArguments = [
            "--ui-testing-authenticated",
            "--ui-testing-dynamic-type-accessibility",
        ]
        app.launch()

        let connections = app.buttons["calendar-connections"]
        XCTAssertTrue(connections.waitForExistence(timeout: 5))
        connections.tap()

        let page = app.scrollViews["calendar-connections"]
        XCTAssertTrue(page.waitForExistence(timeout: 3))
        let exportAction = app.buttons["calendar-export"]
        for _ in 0 ..< 6 where !exportAction.isHittable {
            page.swipeUp()
        }
        XCTAssertTrue(exportAction.isHittable)
        exportAction.tap()

        let sheet = app.descendants(matching: .any)["calendar-export-year-sheet"]
        let picker = app.descendants(matching: .any)["calendar-export-year-picker"]
        let confirm = app.buttons["calendar-export-confirm"]
        let cancel = app.buttons["calendar-export-cancel"]
        XCTAssertTrue(sheet.waitForExistence(timeout: 3))
        XCTAssertTrue(picker.waitForExistence(timeout: 3))
        XCTAssertTrue(confirm.exists)
        XCTAssertTrue(confirm.isHittable)
        XCTAssertGreaterThanOrEqual(confirm.frame.height, 44)
        XCTAssertTrue(cancel.exists)
        XCTAssertGreaterThanOrEqual(cancel.frame.height, 44)

        var berlinCalendar = Calendar(identifier: .gregorian)
        berlinCalendar.timeZone = TimeZone(identifier: "Europe/Berlin") ?? .autoupdatingCurrent
        let currentYear = berlinCalendar.component(.year, from: .now)
        let pickerValue = picker.value as? String ?? ""
        let exposedValue = "\(picker.label) \(pickerValue)"
        XCTAssertTrue(exposedValue.contains(String(currentYear)))

        cancel.tap()
        XCTAssertFalse(sheet.waitForExistence(timeout: 2))
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

    func testProfileAccountUniversalLinkRoutesThroughShellToSettings() {
        let app = XCUIApplication()
        app.launchArguments = [
            "--ui-testing-authenticated",
            "--ui-testing-skip-tutorial",
            "--ui-testing-deep-link=/profile/account",
        ]
        app.launch()

        XCTAssertTrue(app.descendants(matching: .any)["settings-root"].waitForExistence(timeout: 5))
        let meTab = app.tabBars.buttons.matching(
            NSPredicate(format: "label IN %@", ["Me", "我", "Ich"])
        ).firstMatch
        XCTAssertTrue(meTab.waitForExistence(timeout: 3))
        XCTAssertTrue(meTab.isSelected)
        XCTAssertTrue(app.buttons["settings-language"].waitForExistence(timeout: 3))
    }

    func testUniversalLinkRouteMatrixReachesNativeDestinations() {
        let destinations: [(path: String, rootID: String)] = [
            ("/connections/ui-connection", "direct-chat"),
            ("/courses/ui-course", "course-detail"),
            ("/courses/ui-course/chat", "course-chat"),
            ("/groups/ui-group", "group-chat"),
            ("/discover/posts/ui-buddy", "discover-post-detail"),
            ("/discover/activities/ui-activity", "discover-activity-detail"),
            ("/users/ui-peer", "public-profile"),
        ]

        for destination in destinations {
            XCTContext.runActivity(named: destination.path) { _ in
                let app = XCUIApplication()
                app.launchArguments = [
                    "--ui-testing-authenticated",
                    "--ui-testing-skip-tutorial",
                    "--ui-testing-deep-link=\(destination.path)",
                ]
                app.launch()

                XCTAssertTrue(
                    app.descendants(matching: .any)[destination.rootID]
                        .waitForExistence(timeout: 5),
                    "Universal link \(destination.path) did not reach \(destination.rootID)."
                )
                app.terminate()
            }
        }
    }

    func testScheduleShareUniversalLinkColdLaunchShowsRecipientSchedule() {
        let app = XCUIApplication()
        app.launchArguments = [
            "--ui-testing-authenticated",
            "--ui-testing-skip-tutorial",
            "--ui-testing-deep-link=/share/view/ui-token",
        ]
        app.launch()

        XCTAssertTrue(
            app.descendants(matching: .any)["schedule-share-recipient"]
                .waitForExistence(timeout: 5)
        )
        XCTAssertTrue(app.staticTexts["Mina"].waitForExistence(timeout: 3))
    }

    func testEventShareUniversalLinkShowsFilteredViewAndAddsIndependentCopy() {
        let app = XCUIApplication()
        app.launchArguments = [
            "--ui-testing-authenticated",
            "--ui-testing-skip-tutorial",
            "--ui-testing-deep-link=/share/event/ui-event-share-token",
        ]
        app.launch()

        let recipient = app.descendants(matching: .any)["event-share-recipient"]
        XCTAssertTrue(recipient.waitForExistence(timeout: 5))
        XCTAssertTrue(
            app.descendants(matching: .any)["event-share-title"]
                .waitForExistence(timeout: 3)
        )
        XCTAssertTrue(app.descendants(matching: .any)["event-share-location"].exists)
        XCTAssertTrue(app.descendants(matching: .any)["event-share-copy-disclosure"].exists)

        let add = app.buttons["event-share-add"]
        XCTAssertTrue(add.waitForExistence(timeout: 3))
        XCTAssertTrue(add.isHittable)
        add.tap()
        XCTAssertTrue(
            app.descendants(matching: .any)["event-share-added"]
                .waitForExistence(timeout: 3)
        )
    }

    func testScheduleShareOwnerEditsTheExistingLinkFromOwnerMode() {
        let app = XCUIApplication()
        app.launchArguments = [
            "--ui-testing-authenticated",
            "--ui-testing-skip-tutorial",
            "--ui-testing-deep-link=/share/view/ui-token",
            "--ui-testing-schedule-share-owner",
            "--ui-testing-schedule-share-pending",
        ]
        app.launch()

        XCTAssertTrue(
            app.descendants(matching: .any)["schedule-share-owner"]
                .waitForExistence(timeout: 5)
        )
        XCTAssertFalse(app.buttons["schedule-share-proposal-submit"].exists)

        let edit = app.buttons["schedule-share-owner-edit"]
        XCTAssertTrue(edit.waitForExistence(timeout: 3))
        edit.tap()

        XCTAssertTrue(
            app.descendants(matching: .any)["schedule-share-settings"]
                .waitForExistence(timeout: 3)
        )
        let allowProposals = app.descendants(matching: .any)["schedule-share-allow-proposals"]
        for _ in 0..<6 where !allowProposals.exists {
            app.swipeUp()
        }
        XCTAssertTrue(allowProposals.waitForExistence(timeout: 3))
        allowProposals.tap()

        let save = app.buttons["schedule-share-owner-save"]
        XCTAssertTrue(save.waitForExistence(timeout: 3))
        XCTAssertTrue(save.isEnabled)
        save.tap()

        let confirm = app.buttons["schedule-share-owner-confirm-save"].firstMatch
        XCTAssertTrue(confirm.waitForExistence(timeout: 3))
        confirm.tap()

        XCTAssertTrue(
            app.descendants(matching: .any)["schedule-share-settings"]
                .waitForNonExistence(timeout: 3)
        )
        XCTAssertTrue(edit.waitForExistence(timeout: 3))

        let more = app.buttons["schedule-share-owner-more"]
        XCTAssertTrue(more.waitForExistence(timeout: 3))
        more.tap()
        XCTAssertTrue(app.buttons["schedule-share-owner-stop"].waitForExistence(timeout: 3))
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

    func testDirectChatUsesSystemNavigationAndEdgeSwipeBack() {
        let app = XCUIApplication()
        app.launchArguments = ["--ui-testing-authenticated", "--ui-testing-chats"]
        app.launch()

        XCTAssertTrue(app.descendants(matching: .any)["inbox-list"].waitForExistence(timeout: 5))
        app.descendants(matching: .any)["inbox-row-ui-connection"].tap()
        XCTAssertTrue(app.descendants(matching: .any)["direct-chat"].waitForExistence(timeout: 3))
        XCTAssertFalse(app.tabBars.firstMatch.isHittable)

        let start = app.coordinate(withNormalizedOffset: CGVector(dx: 0.001, dy: 0.5))
        let end = app.coordinate(withNormalizedOffset: CGVector(dx: 0.95, dy: 0.5))
        start.press(forDuration: 0.12, thenDragTo: end)

        XCTAssertTrue(app.descendants(matching: .any)["inbox-list"].waitForExistence(timeout: 3))
        XCTAssertTrue(app.tabBars.firstMatch.isHittable)
    }

    func testDenseDirectChatKeepsKeyboardForRapidConsecutiveSends() {
        let app = launchDenseDirectChat()
        let field = app.descendants(matching: .any)["chat-composer-field"].firstMatch
        XCTAssertTrue(field.waitForExistence(timeout: 8))

        field.tap()
        XCTAssertTrue(app.keyboards.firstMatch.waitForExistence(timeout: 3))
        field.typeText("连续发送第一条")
        app.buttons["chat-composer-send"].tap()

        XCTAssertTrue(app.staticTexts["连续发送第一条"].waitForExistence(timeout: 3))
        XCTAssertTrue(app.keyboards.firstMatch.exists)
        XCTAssertTrue((field.value as? String ?? "").isEmpty)

        field.typeText("连续发送第二条")
        field.typeText("\n")

        XCTAssertTrue(app.staticTexts["连续发送第二条"].waitForExistence(timeout: 3))
        XCTAssertTrue(app.keyboards.firstMatch.exists)
        XCTAssertTrue((field.value as? String ?? "").isEmpty)
    }

    func testDenseDirectChatFirstFrameStartsAtLatestMessage() {
        let app = launchDenseDirectChat()
        let oldest = app.descendants(matching: .any)["chat-bubble-ui-dense-0000"].firstMatch
        XCTAssertFalse(
            oldest.waitForExistence(timeout: 0.5),
            "Opening a conversation must not expose the oldest message before bottom anchoring finishes."
        )

        let latest = app.descendants(matching: .any)["chat-bubble-ui-dense-0959"].firstMatch
        XCTAssertTrue(latest.waitForExistence(timeout: 8))
        XCTAssertTrue(latest.isHittable)

        XCTAssertFalse(oldest.isHittable)
    }

    func testDirectChatShowsCachedLatestMessageBeforeHistoryRefresh() {
        let app = XCUIApplication()
        app.launchArguments = [
            "--ui-testing-authenticated",
            "--ui-testing-chats",
            "--ui-testing-cached-chat-refresh",
        ]
        app.launch()

        XCTAssertTrue(app.descendants(matching: .any)["inbox-list"].waitForExistence(timeout: 5))
        app.descendants(matching: .any)["inbox-row-ui-connection"].tap()

        let latest = app.descendants(matching: .any)["chat-bubble-ui-unread-12"].firstMatch
        XCTAssertTrue(
            latest.waitForExistence(timeout: 0.7),
            "The cached latest message should render before the delayed network refresh finishes."
        )
        XCTAssertTrue(latest.isHittable)
        XCTAssertFalse(app.descendants(matching: .any)["chat-initial-loading"].exists)
        let cachedLatestY = latest.frame.maxY

        RunLoop.current.run(until: Date().addingTimeInterval(1.6))

        XCTAssertTrue(latest.isHittable)
        XCTAssertLessThanOrEqual(
            abs(latest.frame.maxY - cachedLatestY),
            12,
            "Prepending refreshed history must keep the cached latest message anchored in place."
        )
    }

    func testDenseDirectChatComposerHandlesRapidTypingAndDeletion() {
        let app = launchDenseDirectChat()
        let field = app.descendants(matching: .any)["chat-composer-field"].firstMatch
        XCTAssertTrue(field.waitForExistence(timeout: 8))

        field.tap()
        XCTAssertTrue(app.keyboards.firstMatch.waitForExistence(timeout: 3))

        let message = "Rapid typing and delete 1234567890"
        field.typeText(message)
        XCTAssertEqual(field.value as? String, message)

        field.typeText(String(repeating: XCUIKeyboardKey.delete.rawValue, count: 10))

        XCTAssertEqual(field.value as? String, "Rapid typing and delete ")
        XCTAssertTrue(app.keyboards.firstMatch.exists)
    }

    func testDenseDirectChatFirstCharacterLatency() {
        let app = launchDenseDirectChat(
            extraArguments: ["--ui-testing-chat-input-diagnostics"]
        )
        let field = app.descendants(matching: .any)["chat-composer-field"].firstMatch
        XCTAssertTrue(field.waitForExistence(timeout: 8))

        field.tap()
        XCTAssertTrue(app.keyboards.firstMatch.waitForExistence(timeout: 3))

        let firstStart = CACurrentMediaTime()
        field.typeText("A")
        let firstCharacterDuration = CACurrentMediaTime() - firstStart
        let firstAppLatency = requireChatInputLatency(field, sequence: 1)

        let secondStart = CACurrentMediaTime()
        field.typeText("B")
        let secondCharacterDuration = CACurrentMediaTime() - secondStart
        let secondAppLatency = requireChatInputLatency(field, sequence: 2)

        let chat = app.descendants(matching: .any)["direct-chat"].firstMatch
        chat.coordinate(withNormalizedOffset: CGVector(dx: 0.9, dy: 0.35)).tap()
        XCTAssertTrue(app.keyboards.firstMatch.waitForNonExistence(timeout: 3))

        field.tap()
        XCTAssertTrue(app.keyboards.firstMatch.waitForExistence(timeout: 3))
        let refocusStart = CACurrentMediaTime()
        field.typeText("C")
        let refocusCharacterDuration = CACurrentMediaTime() - refocusStart
        let refocusAppLatency = requireChatInputLatency(field, sequence: 3)

        XCTAssertEqual(field.value as? String, "ABC")
        let result = XCTAttachment(
            string: "automation(first=\(firstCharacterDuration), second=\(secondCharacterDuration), refocus=\(refocusCharacterDuration)); app-ms(first=\(firstAppLatency), second=\(secondAppLatency), refocus=\(refocusAppLatency))"
        )
        result.name = "Chat first-character latency"
        result.lifetime = .keepAlways
        add(result)

        XCTAssertLessThanOrEqual(
            firstCharacterDuration,
            PerformanceBudget.chatCharacterAutomationRoundTrip,
            "The first character after the initial focus was delayed."
        )
        XCTAssertLessThanOrEqual(
            secondCharacterDuration,
            PerformanceBudget.chatCharacterAutomationRoundTrip,
            "A warm composer character was delayed."
        )
        XCTAssertLessThanOrEqual(
            refocusCharacterDuration,
            PerformanceBudget.chatCharacterAutomationRoundTrip,
            "The first character after refocusing the composer was delayed."
        )
        XCTAssertLessThanOrEqual(
            firstAppLatency,
            PerformanceBudget.chatInputMainLoopMilliseconds,
            "The app delayed processing the first character after initial focus."
        )
        XCTAssertLessThanOrEqual(
            secondAppLatency,
            PerformanceBudget.chatInputMainLoopMilliseconds,
            "The app delayed processing a continuous character."
        )
        XCTAssertLessThanOrEqual(
            refocusAppLatency,
            PerformanceBudget.chatInputMainLoopMilliseconds,
            "The app delayed processing the first character after refocus."
        )
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
        let keyboard = app.keyboards.firstMatch
        XCTAssertTrue(keyboard.waitForExistence(timeout: 3))
        let composerKeyboardGap = keyboard.frame.minY - field.frame.maxY
        XCTAssertGreaterThanOrEqual(composerKeyboardGap, -2)
        // XCUI's keyboard frame starts below the system prediction row on iPhone.
        XCTAssertLessThanOrEqual(composerKeyboardGap, 70)

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
        retainedField.typeText("继续")
        XCTAssertEqual(retainedField.value as? String, "保留的草稿继续")
        let visible = XCTNSPredicateExpectation(
            predicate: NSPredicate(format: "hittable == true"),
            object: latest
        )
        XCTAssertEqual(XCTWaiter.wait(for: [visible], timeout: 3), .completed)

        chat.coordinate(withNormalizedOffset: CGVector(dx: 0.92, dy: 0.45)).tap()
        XCTAssertTrue(app.keyboards.firstMatch.waitForNonExistence(timeout: 3))
        XCTAssertEqual(retainedField.value as? String, "保留的草稿继续")
        XCTAssertTrue(latest.isHittable)
    }

    func testDirectChatAttachmentMenuPreservesComposerAndDraft() {
        let app = XCUIApplication()
        app.launchArguments = ["--ui-testing-authenticated", "--ui-testing-chats"]
        app.launch()

        XCTAssertTrue(app.descendants(matching: .any)["inbox-list"].waitForExistence(timeout: 5))
        app.descendants(matching: .any)["inbox-row-ui-connection"].tap()
        XCTAssertTrue(app.descendants(matching: .any)["direct-chat"].waitForExistence(timeout: 3))

        let field = app.descendants(matching: .any)["chat-composer-field"].firstMatch
        XCTAssertTrue(field.waitForExistence(timeout: 3))
        field.tap()
        field.typeText("保留附件草稿")
        XCTAssertTrue(app.keyboards.firstMatch.waitForExistence(timeout: 3))
        let composerY = field.frame.midY

        app.buttons["chat-composer-attach"].tap()
        let location = app.descendants(matching: .any)["chat-composer-location"].firstMatch
        XCTAssertTrue(location.waitForExistence(timeout: 3))
        XCTAssertTrue(app.keyboards.firstMatch.exists)
        XCTAssertLessThan(abs(field.frame.midY - composerY), 40)
        XCTAssertEqual(field.value as? String, "保留附件草稿")

        app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.25)).tap()
        XCTAssertTrue(location.waitForNonExistence(timeout: 3))
        field.typeText("继续")
        XCTAssertTrue(app.keyboards.firstMatch.exists)
        XCTAssertEqual(field.value as? String, "保留附件草稿继续")
    }

    func testDirectChatComposerPreservesHistoryPosition() {
        let app = launchDenseDirectChat()
        let chat = app.descendants(matching: .any)["direct-chat"].firstMatch
        XCTAssertTrue(chat.waitForExistence(timeout: 8))
        let latest = app.descendants(matching: .any)["chat-bubble-ui-dense-0959"].firstMatch
        XCTAssertTrue(latest.waitForExistence(timeout: 8))

        chat.swipeDown()
        chat.swipeDown()
        XCTAssertFalse(latest.isHittable)

        let field = app.descendants(matching: .any)["chat-composer-field"].firstMatch
        field.tap()
        XCTAssertTrue(app.keyboards.firstMatch.waitForExistence(timeout: 3))
        XCTAssertFalse(latest.isHittable)

        chat.coordinate(withNormalizedOffset: CGVector(dx: 0.9, dy: 0.35)).tap()
        XCTAssertTrue(app.keyboards.firstMatch.waitForNonExistence(timeout: 3))
        XCTAssertFalse(latest.isHittable)
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
            metrics: appPerformanceMetrics(for: app),
            options: options
        ) {
            assertInteractionDuration(
                "Dense direct-chat scrolling round trip",
                atMost: PerformanceBudget.denseChatScrollingRoundTrip
            ) {
                for _ in 0..<3 {
                    upwardStart.press(forDuration: 0.04, thenDragTo: upwardEnd)
                    downwardStart.press(forDuration: 0.04, thenDragTo: downwardEnd)
                }
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
            metrics: appPerformanceMetrics(for: app),
            options: options
        ) {
            assertInteractionDuration(
                "Dense direct-chat composer round trip",
                atMost: PerformanceBudget.denseChatComposerRoundTrip
            ) {
                field.tap()
                field.typeText("Typing stress message with multiple words")
                app.buttons["chat-composer-send"].tap()
                XCTAssertTrue(app.keyboards.firstMatch.exists)
                chat.coordinate(withNormalizedOffset: CGVector(dx: 0.9, dy: 0.35)).tap()
                XCTAssertTrue(app.keyboards.firstMatch.waitForNonExistence(timeout: 3))
            }
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
            metrics: appPerformanceMetrics(for: app),
            options: options
        ) {
            assertInteractionDuration(
                "Dense direct-chat enter and exit",
                atMost: PerformanceBudget.denseChatEnterExit
            ) {
                let row = app.descendants(matching: .any)["inbox-row-ui-connection"]
                XCTAssertTrue(row.waitForExistence(timeout: 3))
                row.tap()
                XCTAssertTrue(app.descendants(matching: .any)["direct-chat"].waitForExistence(timeout: 5))
                app.navigationBars.buttons.firstMatch.tap()
                XCTAssertTrue(inbox.waitForExistence(timeout: 5))
            }
        }
    }

    func testDirectChatReplyPreviewStaysCompact() {
        let app = XCUIApplication()
        app.launchArguments = ["--ui-testing-authenticated", "--ui-testing-chats"]
        app.launch()

        XCTAssertTrue(app.descendants(matching: .any)["inbox-list"].waitForExistence(timeout: 5))
        app.descendants(matching: .any)["inbox-row-ui-connection"].tap()
        let directChat = app.descendants(matching: .any)["direct-chat"].firstMatch
        XCTAssertTrue(directChat.waitForExistence(timeout: 3))

        let dismissTarget = app.descendants(matching: .any)["chat-bubble-ui-msg-1"]
        XCTAssertTrue(dismissTarget.waitForExistence(timeout: 3))
        dismissTarget.press(forDuration: 1.0)
        let contextMenu = app.descendants(matching: .any)["chat-context-action-menu"].firstMatch
        XCTAssertTrue(contextMenu.waitForExistence(timeout: 2))
        directChat.coordinate(withNormalizedOffset: CGVector(dx: 0.94, dy: 0.32)).tap()
        XCTAssertTrue(
            contextMenu.waitForNonExistence(timeout: 2),
            "Tapping the dimmed chat background should dismiss the message action menu."
        )
        XCTAssertTrue(directChat.exists)

        openChatContextAction(
            in: app,
            bubbleID: "chat-bubble-ui-msg-1",
            actionID: "chat-copy-ui-msg-1",
            actionLabels: ["Copy", "复制"]
        )

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
        let alert = app.descendants(matching: .any)["chat-delete-prompt"].firstMatch
        XCTAssertTrue(alert.waitForExistence(timeout: 3))
        let viewport = app.windows.firstMatch.frame
        XCTAssertFalse(alert.frame.isEmpty)
        XCTAssertEqual(alert.frame.midX, viewport.midX, accuracy: 12)
        XCTAssertEqual(
            alert.frame.midY,
            viewport.midY,
            accuracy: max(36, viewport.height * 0.1)
        )

        let confirm = app.buttons["chat-delete-confirm"].firstMatch
        XCTAssertTrue(confirm.waitForExistence(timeout: 3))
        let cancel = app.buttons["chat-delete-cancel"].firstMatch
        XCTAssertTrue(cancel.exists)
        XCTAssertGreaterThanOrEqual(confirm.frame.height, 44)
        XCTAssertGreaterThanOrEqual(cancel.frame.height, 44)
        XCTAssertFalse(confirm.frame.intersects(cancel.frame))
        let promptScreenshot = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
        promptScreenshot.name = "Centered SideSeat action prompt"
        promptScreenshot.lifetime = .keepAlways
        add(promptScreenshot)
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

    func testInboxDoesNotExposeCourseChat() {
        let app = XCUIApplication()
        app.launchArguments = ["--ui-testing-authenticated", "--ui-testing-chats"]
        app.launch()

        XCTAssertTrue(app.descendants(matching: .any)["inbox-list"].waitForExistence(timeout: 5))
        XCTAssertFalse(app.descendants(matching: .any)["inbox-row-ui-course"].exists)
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

    func testInboxPinAndHideCourseRow() {
        let app = XCUIApplication()
        app.launchArguments = ["--ui-testing-authenticated", "--ui-testing-chats"]
        app.launch()

        XCTAssertTrue(app.descendants(matching: .any)["inbox-list"].waitForExistence(timeout: 5))
        let course = app.descendants(matching: .any)["inbox-row-ui-course"]
        XCTAssertTrue(course.waitForExistence(timeout: 3))
        course.press(forDuration: 0.8)
        XCTAssertTrue(app.descendants(matching: .any)["long-press-action-menu"].waitForExistence(timeout: 3))
        let pin = app.buttons.matching(
            NSPredicate(format: "label IN %@", ["Pin", "置顶", "Anheften"])
        ).firstMatch
        XCTAssertTrue(pin.waitForExistence(timeout: 3))
        pin.tap()

        let pinnedCourse = app.descendants(matching: .any)["inbox-row-ui-course"]
        XCTAssertTrue(pinnedCourse.waitForExistence(timeout: 3))
        pinnedCourse.press(forDuration: 0.8)
        let unpin = app.buttons.matching(
            NSPredicate(format: "label IN %@", ["Unpin", "取消置顶", "Lösen"])
        ).firstMatch
        XCTAssertTrue(unpin.waitForExistence(timeout: 3))
        let hide = app.buttons.matching(
            NSPredicate(format: "label IN %@", ["Hide", "隐藏", "Ausblenden"])
        ).firstMatch
        XCTAssertTrue(hide.waitForExistence(timeout: 3))
        hide.tap()
        let gone = XCTNSPredicateExpectation(
            predicate: NSPredicate(format: "exists == false"),
            object: pinnedCourse
        )
        XCTAssertEqual(XCTWaiter.wait(for: [gone], timeout: 3), .completed)
    }

    func testInboxDoesNotExposePeopleSearchOrGroupCreation() {
        let app = XCUIApplication()
        app.launchArguments = ["--ui-testing-authenticated", "--ui-testing-chats"]
        app.launch()

        XCTAssertTrue(app.descendants(matching: .any)["inbox-list"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.descendants(matching: .any)["inbox-pending-plans"].waitForExistence(timeout: 3))
        XCTAssertFalse(app.buttons["inbox-toolbar-more"].exists)
        XCTAssertFalse(app.descendants(matching: .any)["inbox-toolbar-contacts"].exists)
        XCTAssertFalse(app.descendants(matching: .any)["inbox-toolbar-new-group"].exists)
    }

    func testInboxShowsEveryConversationKindInOneList() {
        let app = XCUIApplication()
        app.launchArguments = ["--ui-testing-authenticated", "--ui-testing-chats"]
        app.launch()

        XCTAssertTrue(app.descendants(matching: .any)["inbox-list"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.descendants(matching: .any)["inbox-row-ui-connection"].waitForExistence(timeout: 3))
        XCTAssertTrue(app.descendants(matching: .any)["inbox-row-ui-course"].waitForExistence(timeout: 3))
        XCTAssertTrue(app.descendants(matching: .any)["inbox-row-ui-group"].waitForExistence(timeout: 3))
        XCTAssertFalse(app.descendants(matching: .any)["inbox-quick-chips"].exists)
    }

    func testInboxPlansBannerOpensPlanCenterAndChatDetails() {
        let app = XCUIApplication()
        app.launchArguments = [
            "--ui-testing-authenticated",
            "--ui-testing-chats",
            "--ui-testing-cached-chat-refresh",
            "--ui-testing-language=de",
        ]
        app.launch()

        XCTAssertTrue(app.descendants(matching: .any)["inbox-list"].waitForExistence(timeout: 5))
        let pendingPlans = app.buttons["inbox-pending-plans"]
        XCTAssertTrue(pendingPlans.waitForExistence(timeout: 3))
        XCTAssertGreaterThanOrEqual(pendingPlans.frame.height, 80)
        XCTAssertEqual(pendingPlans.value as? String, "1")
        pendingPlans.tap()

        XCTAssertTrue(app.descendants(matching: .any)["plans-root"].waitForExistence(timeout: 3))
        XCTAssertTrue(app.descendants(matching: .any)["plans-overview"].waitForExistence(timeout: 3))

        let responseCount = app.descendants(matching: .any)["plans-needs-response-count"]
        XCTAssertTrue(responseCount.waitForExistence(timeout: 3))
        XCTAssertEqual(responseCount.label, "1")

        XCTAssertTrue(
            app.descendants(matching: .any)["plans-section-needs-response"]
                .waitForExistence(timeout: 3)
        )
        XCTAssertFalse(app.descendants(matching: .any)["plans-section-waiting"].exists)

        let pendingRow = app.descendants(matching: .any)["plans-row-ui-plan-1"]
        let acceptedRow = app.descendants(matching: .any)["plans-row-ui-plan-accepted"]
        XCTAssertTrue(pendingRow.waitForExistence(timeout: 3))
        XCTAssertFalse(app.descendants(matching: .any)["plans-row-status-ui-plan-1"].exists)

        for _ in 0..<4 {
            if acceptedRow.exists, acceptedRow.isHittable {
                break
            }
            app.swipeUp()
        }
        XCTAssertTrue(acceptedRow.waitForExistence(timeout: 3))
        XCTAssertTrue(acceptedRow.isHittable)
        XCTAssertTrue(
            app.descendants(matching: .any)["plans-section-upcoming"]
                .waitForExistence(timeout: 3)
        )
        XCTAssertFalse(app.descendants(matching: .any)["plans-row-status-ui-plan-accepted"].exists)

        for _ in 0..<4 {
            if pendingRow.exists, pendingRow.isHittable {
                break
            }
            app.swipeDown()
        }
        XCTAssertTrue(pendingRow.isHittable)
        pendingRow.tap()
        XCTAssertTrue(app.descendants(matching: .any)["direct-chat"].waitForExistence(timeout: 3))
        let messageList = app.scrollViews["direct-chat"]
        let planMessage = app.descendants(matching: .any)["chat-bubble-ui-msg-plan"]
        XCTAssertTrue(planMessage.waitForExistence(timeout: 4))
        XCTAssertTrue(messageList.waitForExistence(timeout: 3))
        XCTAssertTrue(messageList.frame.intersects(planMessage.frame))

        let responseActions = app.descendants(matching: .any)["plan-card-actions-ui-plan-1"]
        XCTAssertTrue(responseActions.waitForExistence(timeout: 3))
        XCTAssertLessThanOrEqual(
            responseActions.frame.height,
            48,
            "The normal-size plan actions should stay in one compact row."
        )

        let responseButtons = [
            app.buttons["plan-card-accept-ui-plan-1"],
            app.buttons["plan-card-counter-ui-plan-1"],
            app.buttons["plan-card-decline-ui-plan-1"],
        ]
        for button in responseButtons {
            XCTAssertTrue(button.waitForExistence(timeout: 3))
            XCTAssertTrue(button.isHittable)
            XCTAssertGreaterThanOrEqual(button.frame.height, 44)
        }
        let actionMidpoints = responseButtons.map { $0.frame.midY }
        XCTAssertLessThanOrEqual(
            (actionMidpoints.max() ?? 0) - (actionMidpoints.min() ?? 0),
            1,
            "The three actions should share one visual baseline."
        )
        XCTAssertGreaterThan(
            responseButtons[1].frame.width,
            responseButtons[0].frame.width,
            "The longer counter-proposal label should receive the widest segment."
        )

        let attachment = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
        attachment.name = "Compact plan response actions"
        attachment.lifetime = .keepAlways
        add(attachment)
    }

    func testScheduleShareRecipientSelectsAndSubmitsAConcreteTime() {
        let app = XCUIApplication()
        app.launchArguments = ["--ui-testing-authenticated", "--ui-testing-chats"]
        app.launch()

        XCTAssertTrue(app.descendants(matching: .any)["inbox-list"].waitForExistence(timeout: 5))
        app.descendants(matching: .any)["inbox-row-ui-connection"].tap()
        XCTAssertTrue(app.descendants(matching: .any)["direct-chat"].waitForExistence(timeout: 3))

        let scheduleCard = app.descendants(matching: .any)["schedule-share-card"]
        XCTAssertTrue(scheduleCard.waitForExistence(timeout: 3))
        for _ in 0..<8 where !scheduleCard.isHittable {
            app.swipeDown()
        }
        XCTAssertTrue(scheduleCard.isHittable)
        scheduleCard.tap()

        let recipient = app.descendants(matching: .any)["schedule-share-recipient"]
        XCTAssertTrue(recipient.waitForExistence(timeout: 3))
        XCTAssertTrue(app.buttons["schedule-share-full-availability"].exists)

        let candidate = app.buttons.matching(
            NSPredicate(format: "identifier BEGINSWITH %@", "schedule-share-candidate-")
        ).firstMatch
        XCTAssertTrue(candidate.waitForExistence(timeout: 3))
        XCTAssertTrue(candidate.isHittable)
        candidate.tap()

        let submit = app.buttons["schedule-share-proposal-submit"]
        for _ in 0..<5 where !submit.isHittable {
            app.swipeUp()
        }
        XCTAssertTrue(submit.waitForExistence(timeout: 3))
        XCTAssertTrue(submit.isEnabled)
        XCTAssertTrue(app.descendants(matching: .any)["schedule-share-proposal-start"].exists)
        XCTAssertTrue(app.descendants(matching: .any)["schedule-share-proposal-end"].exists)
        submit.tap()

        let proposal = app.descendants(matching: .any)["schedule-share-my-proposal"]
        XCTAssertTrue(proposal.waitForExistence(timeout: 3))
        let proposalText = "\(proposal.label) \(String(describing: proposal.value))"
        XCTAssertTrue(
            ["Meet up", "见面", "Treffen"].contains { proposalText.contains($0) },
            "Unexpected proposal accessibility text: \(proposalText)"
        )
    }

    func testAcceptingPlanUpdatesTheCardAndOpensCalendar() {
        let app = XCUIApplication()
        app.launchArguments = ["--ui-testing-authenticated", "--ui-testing-chats"]
        app.launch()

        XCTAssertTrue(app.descendants(matching: .any)["inbox-list"].waitForExistence(timeout: 5))
        app.buttons["inbox-pending-plans"].tap()
        XCTAssertTrue(app.descendants(matching: .any)["plans-root"].waitForExistence(timeout: 3))
        app.descendants(matching: .any)["plans-row-ui-plan-1"].tap()

        let planCard = app.descendants(matching: .any)["plan-card-ui-plan-1"]
        XCTAssertTrue(planCard.waitForExistence(timeout: 3))
        let accept = app.buttons["plan-card-accept-ui-plan-1"]
        XCTAssertTrue(accept.waitForExistence(timeout: 3))
        XCTAssertTrue(accept.isHittable)
        accept.tap()

        XCTAssertTrue(
            app.descendants(matching: .any)["plan-card-actions-ui-plan-1"]
                .waitForNonExistence(timeout: 3)
        )
        let viewCalendar = app.buttons["plan-card-calendar-ui-plan-1"]
        XCTAssertTrue(viewCalendar.waitForExistence(timeout: 3))
        viewCalendar.tap()

        XCTAssertTrue(app.buttons["calendar-connections"].waitForExistence(timeout: 3))
        XCTAssertTrue(app.descendants(matching: .any)["home-week-timetable"].exists)
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

    func testFeedbackForumCreatesVotesAndCommentsWithoutStaleState() {
        let app = XCUIApplication()
        app.launchArguments = ["--ui-testing-authenticated"]
        app.launch()

        func reveal(_ element: XCUIElement) {
            for _ in 0..<5 where !element.isHittable {
                app.swipeUp()
            }
        }

        app.tabBars.buttons["我"].tap()
        let settings = app.descendants(matching: .any)["me-settings"]
        XCTAssertTrue(settings.waitForExistence(timeout: 5))
        settings.tap()
        let feedback = app.descendants(matching: .any)["settings-feedback"]
        reveal(feedback)
        feedback.tap()
        XCTAssertTrue(app.descendants(matching: .any)["feedback-root"].waitForExistence(timeout: 3))

        app.buttons["feedback-compose"].tap()
        XCTAssertTrue(app.descendants(matching: .any)["feedback-compose-sheet"].waitForExistence(timeout: 3))
        let title = app.textFields["feedback-title"]
        let message = app.textFields["feedback-message"]
        title.tap()
        title.typeText("Keyboard responsiveness")
        message.tap()
        message.typeText("Typing and deleting should remain smooth in every form.")
        let send = app.buttons["feedback-submit"]
        XCTAssertTrue(send.isEnabled)
        send.tap()
        XCTAssertTrue(
            app.descendants(matching: .any)["feedback-compose-sheet"]
                .waitForNonExistence(timeout: 3)
        )
        XCTAssertTrue(app.staticTexts["Keyboard responsiveness"].waitForExistence(timeout: 3))

        let existing = app.descendants(matching: .any)["feedback-row-ui-feedback-1"]
        XCTAssertTrue(existing.waitForExistence(timeout: 3))
        existing.tap()
        XCTAssertTrue(app.descendants(matching: .any)["feedback-detail"].waitForExistence(timeout: 3))

        let upvote = app.buttons["feedback-upvote"]
        let downvote = app.buttons["feedback-downvote"]
        XCTAssertTrue(upvote.waitForExistence(timeout: 3))
        upvote.tap()
        XCTAssertTrue(waitForValue(upvote, in: ["Selected", "已选择", "Ausgewählt"], timeout: 3))
        upvote.tap()
        XCTAssertTrue(waitForValue(upvote, in: ["Not selected", "未选择", "Nicht ausgewählt"], timeout: 3))
        downvote.tap()
        XCTAssertTrue(waitForValue(downvote, in: ["Selected", "已选择", "Ausgewählt"], timeout: 3))

        let comment = app.textFields["feedback-comment-field"]
        comment.tap()
        comment.typeText("I can reproduce this issue consistently.")
        let submitComment = app.buttons["feedback-comment-submit"]
        XCTAssertTrue(submitComment.isEnabled)
        submitComment.tap()
        XCTAssertTrue(
            app.staticTexts["I can reproduce this issue consistently."]
                .waitForExistence(timeout: 3)
        )
        XCTAssertTrue(waitForEnabled(submitComment, equals: false, timeout: 3))

        app.navigationBars.buttons.firstMatch.tap()
        XCTAssertTrue(app.staticTexts["Keyboard responsiveness"].waitForExistence(timeout: 3))
    }

    func testSettingsUnblocksUserAndShowsEmptyState() {
        let app = XCUIApplication()
        app.launchArguments = ["--ui-testing-authenticated"]
        app.launch()

        app.tabBars.buttons["我"].tap()
        let settings = app.descendants(matching: .any)["me-settings"]
        XCTAssertTrue(settings.waitForExistence(timeout: 5))
        settings.tap()
        let blocked = app.descendants(matching: .any)["settings-blocked-users"]
        for _ in 0..<5 where !blocked.isHittable { app.swipeUp() }
        blocked.tap()

        let row = app.descendants(matching: .any)["blocked-users-row-ui-blocked-user"]
        XCTAssertTrue(row.waitForExistence(timeout: 3))
        app.buttons["blocked-users-unblock-ui-blocked-user"].tap()
        let confirm = app.buttons["blocked-users-confirm-unblock"].firstMatch
        XCTAssertTrue(confirm.waitForExistence(timeout: 3))
        confirm.tap()
        XCTAssertTrue(row.waitForNonExistence(timeout: 3))
        XCTAssertTrue(app.descendants(matching: .any)["blocked-users-empty"].waitForExistence(timeout: 3))
    }

    func testDeleteAccountRequiresConfirmationAndSignsOut() {
        let app = XCUIApplication()
        app.launchArguments = ["--ui-testing-authenticated"]
        app.launch()

        app.tabBars.buttons["我"].tap()
        let settings = app.descendants(matching: .any)["me-settings"]
        XCTAssertTrue(settings.waitForExistence(timeout: 5))
        settings.tap()
        let deleteAccount = app.descendants(matching: .any)["settings-delete-account"]
        for _ in 0..<5 where !deleteAccount.isHittable { app.swipeUp() }
        deleteAccount.tap()

        XCTAssertTrue(app.descendants(matching: .any)["delete-account-sheet"].waitForExistence(timeout: 3))
        let submit = app.buttons["delete-account-submit"]
        XCTAssertFalse(submit.isEnabled)
        let understood = app.switches["delete-account-understood"]
        understood.coordinate(withNormalizedOffset: CGVector(dx: 0.9, dy: 0.5)).tap()
        let confirmation = app.textFields["delete-account-confirm"]
        confirmation.tap()
        confirmation.typeText("test_001")
        XCTAssertTrue(
            waitForEnabled(submit, equals: true, timeout: 3),
            "Delete remained disabled; toggle=\(String(describing: understood.value)), confirmation=\(String(describing: confirmation.value))"
        )
        submit.tap()
        XCTAssertTrue(app.textFields["login-identifier"].waitForExistence(timeout: 5))
    }

    func testSettingsLogoutImmediatelyReturnsToLogin() {
        let app = XCUIApplication()
        app.launchArguments = ["--ui-testing-authenticated"]
        app.launch()

        app.tabBars.buttons["我"].tap()
        let settings = app.descendants(matching: .any)["me-settings"]
        XCTAssertTrue(settings.waitForExistence(timeout: 5))
        settings.tap()
        let logout = app.descendants(matching: .any)["settings-logout"]
        for _ in 0..<5 where !logout.isHittable { app.swipeUp() }
        logout.tap()
        XCTAssertTrue(app.textFields["login-identifier"].waitForExistence(timeout: 5))
    }

    func testDirectChatInfoAndContactExchangeFeedback() {
        let app = XCUIApplication()
        app.launchArguments = ["--ui-testing-authenticated", "--ui-testing-chats"]
        app.launch()

        func reveal(_ element: XCUIElement) {
            for _ in 0..<5 {
                if element.exists, element.isHittable {
                    return
                }
                app.swipeUp()
            }
        }

        XCTAssertTrue(app.descendants(matching: .any)["inbox-list"].waitForExistence(timeout: 5))
        app.descendants(matching: .any)["inbox-row-ui-connection"].tap()
        XCTAssertTrue(app.descendants(matching: .any)["direct-chat"].waitForExistence(timeout: 3))

        app.buttons["direct-chat-actions"].tap()
        XCTAssertTrue(app.descendants(matching: .any)["direct-chat-info"].waitForExistence(timeout: 3))
        XCTAssertTrue(app.descendants(matching: .any)["direct-info-profile"].waitForExistence(timeout: 3))
        XCTAssertTrue(app.descendants(matching: .any)["direct-info-remark"].waitForExistence(timeout: 3))

        let searchItem = app.descendants(matching: .any)["direct-info-search"].firstMatch
        XCTAssertTrue(searchItem.waitForExistence(timeout: 3))
        searchItem.tap()
        XCTAssertTrue(app.descendants(matching: .any)["thread-search-sheet"].waitForExistence(timeout: 3))
        let done = app.buttons["thread-search-done"]
        XCTAssertTrue(done.waitForExistence(timeout: 3))
        done.tap()

        let request = app.descendants(matching: .any)["direct-contact-request"].firstMatch
        reveal(request)
        XCTAssertTrue(request.waitForExistence(timeout: 3))
        request.tap()

        let pending = app.descendants(matching: .any)["direct-contact-status-pending"].firstMatch
        XCTAssertTrue(pending.waitForExistence(timeout: 3))
        XCTAssertTrue(app.descendants(matching: .any)["chat-action-notice"].waitForExistence(timeout: 3))

        let cancel = app.descendants(matching: .any)["direct-contact-cancel"].firstMatch
        reveal(cancel)
        XCTAssertTrue(cancel.waitForExistence(timeout: 3))
        cancel.tap()

        reveal(request)
        XCTAssertTrue(request.waitForExistence(timeout: 3))
        request.tap()
        XCTAssertTrue(pending.waitForExistence(timeout: 3))
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
            "--ui-testing-inbox-hidden",
            "--ui-testing-deep-link=/courses/ui-course/chat",
        ]
        app.launch()

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

        let menu = app.descendants(matching: .any)["chat-context-action-menu"].firstMatch
        XCTAssertTrue(menu.waitForExistence(timeout: 2), "The anchored chat action menu did not appear.")
        XCTAssertFalse(menu.frame.isEmpty)
        XCTAssertLessThanOrEqual(
            menu.frame.width,
            app.frame.width * 0.55,
            "The chat action menu should size to its labels instead of leaving a wide empty trailing area."
        )
        XCTAssertTrue(
            menu.frame.maxY <= bubble.frame.minY + 20
                || menu.frame.minY >= bubble.frame.maxY - 20,
            "The chat action menu must stay anchored above or below its message bubble."
        )
        if bubble.frame.minY >= menu.frame.height + 36 {
            XCTAssertLessThanOrEqual(
                menu.frame.maxY,
                bubble.frame.minY + 20,
                "When there is room, the chat action menu should open above its bubble."
            )
        }

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

    private func launchDenseDirectChat(extraArguments: [String] = []) -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments = [
            "--ui-testing-authenticated",
            "--ui-testing-chats",
            "--ui-testing-dense-chat",
        ] + extraArguments
        app.launch()

        XCTAssertTrue(app.descendants(matching: .any)["inbox-list"].waitForExistence(timeout: 8))
        let row = app.descendants(matching: .any)["inbox-row-ui-connection"]
        XCTAssertTrue(row.waitForExistence(timeout: 3))
        row.tap()
        XCTAssertTrue(app.descendants(matching: .any)["direct-chat"].waitForExistence(timeout: 8))
        return app
    }

    private func appPerformanceMetrics(for app: XCUIApplication) -> [any XCTMetric] {
        var metrics: [any XCTMetric] = [
            XCTClockMetric(),
            XCTCPUMetric(application: app),
            XCTMemoryMetric(application: app),
        ]
        if #available(iOS 26.0, *) {
            metrics.append(XCTHitchMetric(application: app))
        }
        return metrics
    }

    private enum PerformanceBudget {
        static var authenticatedProcessColdLaunch: TimeInterval {
            ProcessInfo.processInfo.environment["SIMULATOR_UDID"] == nil ? 7 : 5
        }
        static let authenticatedWarmResume: TimeInterval = 2
        static let denseDiscoverFeedRoundTrip: TimeInterval = 26
        static let denseDiscoverSearchRoundTrip: TimeInterval = 6
        static let denseDiscoverBrowseInteraction: TimeInterval = 20
        static let denseCalendarPagingRoundTrip: TimeInterval = 12
        static let denseScheduleImageCancellation: TimeInterval = 10
        #if targetEnvironment(simulator)
        static let denseChatScrollingRoundTrip: TimeInterval = 20
        #else
        // Physical-device XCUI gesture synthesis adds a repeatable idle wait to
        // every drag. Keep all six stress gestures while allowing that overhead.
        static let denseChatScrollingRoundTrip: TimeInterval = 22
        #endif
        static let denseChatComposerRoundTrip: TimeInterval = 10
        static let denseChatEnterExit: TimeInterval = 10
        static let chatCharacterAutomationRoundTrip: TimeInterval = 2.5
        static let chatInputMainLoopMilliseconds = 50.0
    }

    @discardableResult
    private func assertInteractionDuration(
        _ name: String,
        atMost budget: TimeInterval,
        file: StaticString = #filePath,
        line: UInt = #line,
        action: () -> Void
    ) -> TimeInterval {
        let startedAt = CACurrentMediaTime()
        action()
        let duration = CACurrentMediaTime() - startedAt
        XCTAssertLessThanOrEqual(
            duration,
            budget,
            "\(name) took \(String(format: "%.3f", duration))s; budget is \(String(format: "%.3f", budget))s.",
            file: file,
            line: line
        )
        return duration
    }

    private func requireChatInputLatency(
        _ field: XCUIElement,
        sequence: Int,
        timeout: TimeInterval = 2
    ) -> Double {
        let marker = "input-sequence=\(sequence);input-latency-ms="
        let expectation = XCTNSPredicateExpectation(
            predicate: NSPredicate(format: "label CONTAINS %@", marker),
            object: field
        )
        XCTAssertEqual(
            XCTWaiter.wait(for: [expectation], timeout: timeout),
            .completed,
            "Missing chat input latency diagnostic for sequence \(sequence)."
        )

        let label = field.label
        guard let markerRange = label.range(of: marker) else {
            XCTFail("Malformed chat input latency diagnostic: \(label)")
            return .infinity
        }
        let suffix = label[markerRange.upperBound...]
        let value = suffix.prefix { $0.isNumber || $0 == "." }
        guard let latency = Double(value) else {
            XCTFail("Malformed chat input latency value: \(label)")
            return .infinity
        }
        return latency
    }

    private func waitForValue(
        _ element: XCUIElement,
        in values: [String],
        timeout: TimeInterval
    ) -> Bool {
        let expectation = XCTNSPredicateExpectation(
            predicate: NSPredicate(format: "value IN %@", values),
            object: element
        )
        return XCTWaiter.wait(for: [expectation], timeout: timeout) == .completed
    }

    private func waitForEnabled(
        _ element: XCUIElement,
        equals value: Bool,
        timeout: TimeInterval
    ) -> Bool {
        let expectation = XCTNSPredicateExpectation(
            predicate: NSPredicate(format: "enabled == %@", NSNumber(value: value)),
            object: element
        )
        return XCTWaiter.wait(for: [expectation], timeout: timeout) == .completed
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
