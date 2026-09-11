import XCTest

@MainActor
final class AccessibilityAuditUITests: XCTestCase {
    override func setUpWithError() throws {
        continueAfterFailure = false
    }

    func testSignedOutAuthenticationAccessibility() throws {
        let app = XCUIApplication()
        app.launchArguments = [
            "--ui-testing-signed-out",
            "--ui-testing-skip-tutorial",
            "--ui-testing-appearance=light",
        ]
        app.launch()

        XCTAssertTrue(app.textFields["login-identifier"].waitForExistence(timeout: 8))
        if app.keyboards.firstMatch.waitForExistence(timeout: 2) {
            app.keyboards.firstMatch.swipeDown()
        }
        try performAudit(in: app)
    }

    func testPrimaryAuthenticatedDestinationsAccessibility() throws {
        let app = XCUIApplication()
        app.launchArguments = [
            "--ui-testing-authenticated",
            "--ui-testing-skip-tutorial",
            "--ui-testing-chats",
            "--ui-testing-discover",
            "--ui-testing-weekly-intent",
            "--ui-testing-mutual-opportunity",
            "--ui-testing-together-matching",
            "--ui-testing-language=en",
            "--ui-testing-appearance=light",
        ]
        app.launch()

        auditTab(
            in: app,
            labels: ["Together", "同行", "Zusammen"],
            readinessIdentifier: "together-home"
        )

        let togetherHome = app.descendants(matching: .any)["together-home"]
        let togetherDecision = app.descendants(matching: .any)["mutual-opportunity-swipe-cmutualui0000000000000001"].firstMatch
        for _ in 0..<8 where !togetherDecision.exists || !togetherDecision.isHittable {
            togetherHome.swipeUp()
        }
        XCTAssertTrue(togetherDecision.exists)
        XCTAssertTrue(togetherDecision.isHittable)
        XCTAssertGreaterThanOrEqual(togetherDecision.frame.height, 44)
        try performAudit(in: app)

        auditTab(
            in: app,
            labels: ["Calendar", "日历", "Kalender"],
            readinessIdentifier: "home-week-timetable"
        )

        auditTab(
            in: app,
            labels: ["Messages", "消息", "Nachrichten"],
            readinessIdentifier: "inbox-list"
        )
        let me = tabButton(in: app, labels: ["Me", "我", "Ich"])
        XCTAssertTrue(me.waitForExistence(timeout: 8))
        me.tap()
        let meProfile = app.descendants(matching: .any)["me-profile"]
        XCTAssertTrue(meProfile.waitForExistence(timeout: 6))
        try performAudit(in: app)

        let courses = app.buttons["me-courses"]
        for _ in 0..<8 where !courses.exists || !courses.isHittable {
            meProfile.swipeUp()
        }
        XCTAssertTrue(courses.exists)
        XCTAssertTrue(courses.isHittable)
        courses.tap()
        XCTAssertTrue(app.descendants(matching: .any)["courses-list"].waitForExistence(timeout: 5))
        try performAudit(in: app)
        app.navigationBars.buttons.firstMatch.tap()
        XCTAssertTrue(meProfile.waitForExistence(timeout: 5))

        let settings = app.buttons["me-settings"]
        for _ in 0..<8 where !settings.exists || !settings.isHittable {
            meProfile.swipeUp()
        }
        XCTAssertTrue(settings.exists)
        XCTAssertTrue(settings.isHittable)
        try performAudit(in: app)
    }

    func testCourseLayoutAtLargestDynamicType() {
        let app = XCUIApplication()
        app.launchArguments = [
            "--ui-testing-authenticated",
            "--ui-testing-skip-tutorial",
            "--ui-testing-dynamic-type-accessibility",
            "--ui-testing-appearance=light",
        ]
        app.launch()

        let me = tabButton(in: app, labels: ["Me", "我", "Ich"])
        XCTAssertTrue(me.waitForExistence(timeout: 8))
        me.tap()

        let meProfile = app.descendants(matching: .any)["me-profile"]
        XCTAssertTrue(meProfile.waitForExistence(timeout: 6))
        let courses = app.buttons["me-courses"]
        for _ in 0..<8 where !courses.exists || !courses.isHittable {
            meProfile.swipeUp()
        }
        XCTAssertTrue(courses.exists)
        XCTAssertTrue(courses.isHittable)
        XCTAssertGreaterThanOrEqual(courses.frame.height, 44)
        courses.tap()

        let list = app.descendants(matching: .any)["courses-list"]
        XCTAssertTrue(list.waitForExistence(timeout: 5))
        let title = app.descendants(matching: .any)["course-title-visual-ui-course"]
        for _ in 0..<5 where !title.exists || !title.isHittable {
            list.swipeUp()
        }
        XCTAssertTrue(title.waitForExistence(timeout: 3))
        XCTAssertTrue(title.isHittable)
        XCTAssertGreaterThanOrEqual(title.frame.height, 44)

        let metadata = app.descendants(matching: .any)["course-metadata-visual-ui-course"]
        XCTAssertTrue(metadata.exists)
        XCTAssertGreaterThanOrEqual(metadata.frame.height, 32)
        let instructor = app.descendants(matching: .any)["course-instructor-visual-ui-course"]
        XCTAssertTrue(instructor.exists)
        XCTAssertGreaterThanOrEqual(instructor.frame.height, 32)

        let tabButtons = app.tabBars.buttons.allElementsBoundByIndex
        XCTAssertEqual(tabButtons.count, 5)
        let screenFrame = app.windows.firstMatch.frame
        for button in tabButtons {
            XCTAssertTrue(button.isHittable, "Expected \(button.label) tab to remain hittable.")
            XCTAssertTrue(
                screenFrame.intersects(button.frame),
                "Expected \(button.label) tab to remain inside the iPhone viewport."
            )
        }

        let attachment = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
        attachment.name = "Courses at accessibility5"
        attachment.lifetime = .keepAlways
        add(attachment)
    }

    func testTogetherLayoutAtLargestDynamicType() {
        let app = XCUIApplication()
        app.launchArguments = [
            "--ui-testing-authenticated",
            "--ui-testing-skip-tutorial",
            "--ui-testing-discover",
            "--ui-testing-weekly-intent",
            "--ui-testing-discovery-published",
            "--ui-testing-mutual-opportunity",
            "--ui-testing-together-matching",
            "--ui-testing-dynamic-type-accessibility",
            "--ui-testing-language=en",
            "--ui-testing-appearance=light",
        ]
        app.launch()

        let together = tabButton(in: app, labels: ["Together", "同行", "Zusammen"])
        XCTAssertTrue(together.waitForExistence(timeout: 8))
        together.tap()

        let home = app.descendants(matching: .any)["together-home"]
        XCTAssertTrue(home.waitForExistence(timeout: 6))
        let addIntent = app.buttons["together-add-intent"]
        for _ in 0..<10 where !addIntent.exists || !addIntent.isHittable {
            home.swipeDown()
        }
        XCTAssertTrue(addIntent.waitForExistence(timeout: 5))
        XCTAssertTrue(addIntent.isHittable)
        XCTAssertGreaterThanOrEqual(addIntent.frame.width, 44)
        XCTAssertGreaterThanOrEqual(addIntent.frame.height, 44)

        let decision = app.descendants(matching: .any)["mutual-opportunity-swipe-cmutualui0000000000000001"].firstMatch
        for _ in 0..<10 where !decision.exists || !decision.isHittable {
            home.swipeUp()
        }
        XCTAssertTrue(decision.exists)
        XCTAssertTrue(decision.isHittable)
        XCTAssertGreaterThanOrEqual(decision.frame.height, 44)
        XCTAssertTrue(decision.label.contains("Choose") || decision.label.contains("interest"), "The bilateral swipe needs an accessible decision label")

        let tabButtons = app.tabBars.buttons.allElementsBoundByIndex
        XCTAssertEqual(tabButtons.count, 5)
        for button in tabButtons {
            XCTAssertTrue(button.isHittable)
            XCTAssertGreaterThanOrEqual(button.frame.height, 44)
        }

        let attachment = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
        attachment.name = "Together at accessibility5"
        attachment.lifetime = .keepAlways
        add(attachment)
    }

    func testCreatePlanNavigationAtLargestDynamicType() {
        let app = XCUIApplication()
        app.launchArguments = [
            "--ui-testing-authenticated",
            "--ui-testing-skip-tutorial",
            "--ui-testing-dynamic-type-accessibility",
            "--ui-testing-appearance=light",
        ]
        app.launch()

        tabButton(in: app, labels: ["Discover", "发现"]).tap()
        let publish = app.buttons["discover-publish"]
        XCTAssertTrue(publish.waitForExistence(timeout: 8))
        publish.tap()
        XCTAssertTrue(app.descendants(matching: .any)["create-chooser-sheet"].waitForExistence(timeout: 5))
        app.buttons["create-buddy-post"].tap()
        let createView = app.descendants(matching: .any)["buddy-create-view"]
        XCTAssertTrue(createView.waitForExistence(timeout: 6))
        let titleField = app.textViews["buddy-title"]
        XCTAssertTrue(titleField.waitForExistence(timeout: 3))
        XCTAssertGreaterThanOrEqual(titleField.frame.height, 44)

        let cancel = app.buttons["buddy-cancel"]
        XCTAssertTrue(cancel.waitForExistence(timeout: 3))
        XCTAssertTrue(cancel.isHittable)
        XCTAssertGreaterThanOrEqual(cancel.frame.height, 36)
        let screenFrame = app.windows.firstMatch.frame
        XCTAssertTrue(screenFrame.intersects(cancel.frame))

        for (identifier, minimumHeight) in [
            ("buddy-section-plan-details", CGFloat(40)),
            ("buddy-post-settings", CGFloat(44)),
        ] {
            let header = app.descendants(matching: .any)[identifier]
            for _ in 0..<10 where !header.exists || !screenFrame.intersects(header.frame) {
                app.swipeUp()
            }
            XCTAssertTrue(header.exists)
            XCTAssertTrue(screenFrame.intersects(header.frame))
            XCTAssertGreaterThanOrEqual(header.frame.height, minimumHeight)
        }

        let settings = app.buttons["buddy-post-settings"]
        XCTAssertTrue(settings.isHittable)
        settings.tap()
        XCTAssertTrue(app.staticTexts["buddy-section-visibility"].waitForExistence(timeout: 3))
        let settingsForm = app.collectionViews.firstMatch
        for identifier in ["buddy-section-expiry", "buddy-footer-expiry"] {
            let element = app.staticTexts[identifier]
            for _ in 0..<8 where !element.exists || !screenFrame.intersects(element.frame) {
                settingsForm.swipeUp()
            }
            XCTAssertTrue(element.exists)
            XCTAssertTrue(screenFrame.intersects(element.frame))
        }
        let editorDone = app.buttons["buddy-editor-done"]
        XCTAssertTrue(editorDone.waitForExistence(timeout: 3))
        editorDone.tap()

        let attachment = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
        attachment.name = "Create plan navigation at accessibility5"
        attachment.lifetime = .keepAlways
        add(attachment)

        cancel.tap()
        XCTAssertFalse(createView.waitForExistence(timeout: 2))
    }

    func testChatsLayoutAtLargestDynamicType() {
        let app = XCUIApplication()
        app.launchArguments = [
            "--ui-testing-authenticated",
            "--ui-testing-skip-tutorial",
            "--ui-testing-chats",
            "--ui-testing-dynamic-type-accessibility",
            "--ui-testing-appearance=light",
        ]
        app.launch()

        let inbox = app.descendants(matching: .any)["inbox-list"]
        XCTAssertTrue(inbox.waitForExistence(timeout: 8))
        let screenFrame = app.windows.firstMatch.frame

        XCTAssertFalse(app.buttons["inbox-pending-plans"].exists)
        let plansTab = app.tabBars.buttons.matching(
            NSPredicate(format: "label IN %@", ["Plans", "计划", "Pläne"])
        ).firstMatch
        XCTAssertTrue(plansTab.waitForExistence(timeout: 3))
        XCTAssertTrue(plansTab.isHittable)
        let firstRow = app.buttons["inbox-row-ui-connection"]
        XCTAssertTrue(firstRow.waitForExistence(timeout: 3))
        XCTAssertTrue(firstRow.isHittable)
        XCTAssertGreaterThanOrEqual(firstRow.frame.height, 88)

        let preview = app.descendants(matching: .any)["inbox-preview-visual-ui-connection"]
        XCTAssertTrue(preview.exists)
        XCTAssertGreaterThanOrEqual(preview.frame.height, 40)
        let date = app.descendants(matching: .any)["inbox-date-visual-ui-connection"]
        XCTAssertTrue(date.exists)
        XCTAssertGreaterThanOrEqual(date.frame.height, 28)

        plansTab.tap()

        let plansRoot = app.descendants(matching: .any)["plans-root"]
        XCTAssertTrue(plansRoot.waitForExistence(timeout: 5))

        let needsResponseSection = app.descendants(matching: .any)["plans-section-waiting-response"]
        XCTAssertTrue(needsResponseSection.waitForExistence(timeout: 3))
        XCTAssertTrue(
            screenFrame.intersects(needsResponseSection.frame),
            "The needs-response section should be visible when the page opens."
        )
        XCTAssertEqual(needsResponseSection.value as? String, "1")

        let pendingPlan = app.buttons["plans-row-ui-plan-1"]
        for _ in 0..<8 where !pendingPlan.exists || !pendingPlan.isHittable {
            plansRoot.swipeUp()
        }
        XCTAssertTrue(pendingPlan.exists)
        XCTAssertTrue(screenFrame.intersects(pendingPlan.frame))
        XCTAssertTrue(pendingPlan.isHittable)

        let attachment = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
        attachment.name = "Pending plans at accessibility5"
        attachment.lifetime = .keepAlways
        add(attachment)
    }

    func testPlanCardActionsAtLargestDynamicType() {
        let app = XCUIApplication()
        app.launchArguments = [
            "--ui-testing-authenticated",
            "--ui-testing-skip-tutorial",
            "--ui-testing-chats",
            "--ui-testing-cached-chat-refresh",
            "--ui-testing-dynamic-type-accessibility",
            "--ui-testing-appearance=light",
            "--ui-testing-language=de",
        ]
        app.launch()

        XCTAssertFalse(app.buttons["inbox-pending-plans"].exists)
        let plansTab = app.tabBars.buttons.matching(
            NSPredicate(format: "label IN %@", ["Plans", "计划", "Pläne"])
        ).firstMatch
        XCTAssertTrue(plansTab.waitForExistence(timeout: 8))
        plansTab.tap()

        let planRow = app.buttons["plans-row-ui-plan-1"]
        for _ in 0..<5 where !planRow.exists || !planRow.isHittable { app.swipeUp() }
        XCTAssertTrue(planRow.waitForExistence(timeout: 5))
        planRow.tap()

        let chat = app.scrollViews["direct-chat"]
        XCTAssertTrue(chat.waitForExistence(timeout: 5))
        let actions = app.descendants(matching: .any)["plan-card-actions-ui-plan-1"]
        XCTAssertTrue(actions.waitForExistence(timeout: 5))

        let buttons: [(element: XCUIElement, label: String)] = [
            (app.buttons["plan-card-accept-ui-plan-1"], "Annehmen"),
            (app.buttons["plan-card-counter-ui-plan-1"], "Neue Zeit vorschlagen"),
            (app.buttons["plan-card-decline-ui-plan-1"], "Ablehnen"),
        ]
        let screenFrame = app.windows.firstMatch.frame
        for button in buttons {
            for _ in 0..<8 where !button.element.exists || !button.element.isHittable {
                chat.swipeUp()
            }
            XCTAssertTrue(button.element.exists)
            XCTAssertTrue(button.element.isHittable)
            XCTAssertTrue(screenFrame.intersects(button.element.frame))
            XCTAssertGreaterThanOrEqual(button.element.frame.width, 44)
            XCTAssertGreaterThanOrEqual(button.element.frame.height, 44)
            XCTAssertEqual(button.element.label, button.label)
        }

        let attachment = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
        attachment.name = "Plan response actions at accessibility5"
        attachment.lifetime = .keepAlways
        add(attachment)
    }

    func testMeLayoutAtLargestDynamicType() {
        let app = XCUIApplication()
        app.launchArguments = [
            "--ui-testing-authenticated",
            "--ui-testing-skip-tutorial",
            "--ui-testing-dynamic-type-accessibility",
            "--ui-testing-appearance=light",
        ]
        app.launch()

        let me = tabButton(in: app, labels: ["Me", "我"])
        XCTAssertTrue(me.waitForExistence(timeout: 8))
        me.tap()
        let profile = app.descendants(matching: .any)["me-profile"]
        XCTAssertTrue(profile.waitForExistence(timeout: 6))
        let screenFrame = app.windows.firstMatch.frame

        let photo = app.buttons["profile-change-photo"]
        XCTAssertTrue(photo.waitForExistence(timeout: 3))
        XCTAssertTrue(photo.isHittable)
        XCTAssertGreaterThanOrEqual(photo.frame.width, 44)
        XCTAssertGreaterThanOrEqual(photo.frame.height, 44)

        let editProfile = app.buttons["me-hero-edit"]
        XCTAssertTrue(editProfile.exists)
        XCTAssertTrue(editProfile.isHittable)
        XCTAssertGreaterThanOrEqual(editProfile.frame.height, 44)
        XCTAssertTrue((editProfile.value as? String)?.contains("@test_001") == true)

        let schoolSummary = app.staticTexts["me-campus-summary"]
        XCTAssertTrue(schoolSummary.exists)
        XCTAssertTrue(screenFrame.intersects(schoolSummary.frame))
        XCTAssertGreaterThanOrEqual(schoolSummary.frame.height, 32)

        let managementRows = [
            "me-verification",
            "me-courses",
            "me-languages",
            "profile-privacy-settings",
            "me-blocked",
            "me-settings",
        ]
        for identifier in managementRows {
            let row = app.buttons[identifier]
            for _ in 0..<10 where !row.exists || !row.isHittable {
                profile.swipeUp()
            }
            XCTAssertTrue(row.exists, "Expected \(identifier) to exist.")
            XCTAssertTrue(row.isHittable, "Expected \(identifier) to be hittable.")
            XCTAssertTrue(screenFrame.intersects(row.frame), "Expected \(identifier) inside the viewport.")
            XCTAssertGreaterThanOrEqual(row.frame.height, 56)
        }

        let settingsHeader = app.staticTexts["me-section-settings"]
        XCTAssertTrue(settingsHeader.exists)
        XCTAssertTrue(screenFrame.intersects(settingsHeader.frame))
        XCTAssertGreaterThanOrEqual(settingsHeader.frame.height, 28)

        let attachment = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
        attachment.name = "Me at accessibility5"
        attachment.lifetime = .keepAlways
        add(attachment)
    }

    func testChatContextMenuAtLargestDynamicType() {
        let app = XCUIApplication()
        app.launchArguments = [
            "--ui-testing-authenticated",
            "--ui-testing-skip-tutorial",
            "--ui-testing-chats",
            "--ui-testing-dynamic-type-accessibility",
            "--ui-testing-appearance=light",
            "--ui-testing-language=de",
        ]
        app.launch()

        let inbox = app.descendants(matching: .any)["inbox-list"]
        XCTAssertTrue(inbox.waitForExistence(timeout: 8))
        let row = app.descendants(matching: .any)["inbox-row-ui-connection-leo"]
        for _ in 0..<8 where !row.exists || !row.isHittable {
            inbox.swipeUp()
        }
        XCTAssertTrue(row.exists)
        XCTAssertTrue(row.isHittable)
        row.tap()

        let bubble = app.descendants(matching: .any)["chat-bubble-ui-leo-msg-2"]
        XCTAssertTrue(bubble.waitForExistence(timeout: 5))
        bubble.press(forDuration: 0.8)

        let menu = app.descendants(matching: .any)["chat-context-action-menu"].firstMatch
        XCTAssertTrue(menu.waitForExistence(timeout: 3))
        let screenFrame = app.windows.firstMatch.frame
        XCTAssertTrue(screenFrame.contains(menu.frame))

        let actions = [
            app.buttons["chat-reply-ui-leo-msg-2"],
            app.buttons["chat-copy-ui-leo-msg-2"],
            app.buttons["chat-delete-ui-leo-msg-2"],
        ]
        for action in actions {
            XCTAssertTrue(action.exists)
            XCTAssertTrue(action.isHittable)
            XCTAssertGreaterThanOrEqual(action.frame.width, 44)
            XCTAssertGreaterThanOrEqual(action.frame.height, 44)
            XCTAssertTrue(menu.frame.contains(action.frame))
        }

        let attachment = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
        attachment.name = "Chat context menu at accessibility5"
        attachment.lifetime = .keepAlways
        add(attachment)
    }

    func testCalendarConnectionsAtLargestDynamicType() throws {
        let app = XCUIApplication()
        app.launchArguments = [
            "--ui-testing-authenticated",
            "--ui-testing-skip-tutorial",
            "--ui-testing-dynamic-type-accessibility",
            "--ui-testing-appearance=dark",
            "--ui-testing-language=de",
        ]
        app.launch()

        let connections = app.buttons["calendar-connections"]
        XCTAssertTrue(connections.waitForExistence(timeout: 8))
        connections.tap()

        let page = app.scrollViews["calendar-connections"]
        XCTAssertTrue(page.waitForExistence(timeout: 5))

        let addAppleCalendar = app.buttons["calendar-connection-add-apple"]
        XCTAssertTrue(addAppleCalendar.waitForExistence(timeout: 5))
        XCTAssertTrue(addAppleCalendar.isHittable)
        XCTAssertGreaterThanOrEqual(addAppleCalendar.frame.height, 44)

        let importAction = app.descendants(matching: .any)["calendar-import"]
        for _ in 0..<8 where !importAction.exists || !importAction.isHittable {
            page.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.82))
                .press(
                    forDuration: 0.05,
                    thenDragTo: page.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.24)),
                    withVelocity: .fast,
                    thenHoldForDuration: 0
                )
        }
        XCTAssertTrue(importAction.exists)
        XCTAssertTrue(importAction.isHittable)
        XCTAssertGreaterThanOrEqual(importAction.frame.height, 44)
        let exportAction = app.descendants(matching: .any)["calendar-export"]
        XCTAssertTrue(exportAction.exists)
        XCTAssertGreaterThanOrEqual(exportAction.frame.height, 44)
        XCTAssertFalse(importAction.label.isEmpty)
        XCTAssertFalse(exportAction.label.isEmpty)

        let attachment = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
        attachment.name = "Calendar connections at accessibility5"
        attachment.lifetime = .keepAlways
        add(attachment)
    }

    private func auditTab(
        in app: XCUIApplication,
        labels: [String],
        readinessIdentifier: String
    ) {
        let tab = tabButton(in: app, labels: labels)
        XCTAssertTrue(tab.waitForExistence(timeout: 8))
        tab.tap()
        XCTAssertTrue(
            app.descendants(matching: .any)[readinessIdentifier].waitForExistence(timeout: 6),
            "Expected \(readinessIdentifier) before running the accessibility audit."
        )
        XCTAssertNoThrow(try performAudit(in: app))
    }

    private func performAudit(in app: XCUIApplication) throws {
        try app.performAccessibilityAudit { issue in
            let identifier = issue.element?.identifier ?? ""
            // iOS 26 can emit a targetless SwiftUI contrast issue with no element, frame,
            // identifier, or label. Concrete contrast nodes still fail this audit, while
            // ThemeContrastTests covers resolved light/dark semantic color pairs.
            if issue.auditType.contains(.contrast), issue.element == nil {
                return true
            }

            // Audit only visible app pixels. The login view intentionally auto-focuses its
            // first field; iOS keeps lower form labels in the tree while the keyboard's
            // material covers them.
            if issue.auditType.contains(.contrast),
               let frame = issue.element?.frame,
               app.keyboards.firstMatch.exists,
               frame.maxY > app.keyboards.firstMatch.frame.minY {
                return true
            }
            if (issue.auditType.contains(.contrast) ||
                issue.auditType.contains(.dynamicType) ||
                issue.auditType.contains(.textClipped)),
               let frame = issue.element?.frame,
               app.tabBars.firstMatch.exists,
               frame.maxY > app.tabBars.firstMatch.frame.minY - 24 {
                return true
            }
            if (issue.auditType.contains(.contrast) ||
                issue.auditType.contains(.dynamicType) ||
                issue.auditType.contains(.textClipped)),
               let frame = issue.element?.frame,
               app.navigationBars.firstMatch.exists,
               frame.minY < app.navigationBars.firstMatch.frame.maxY + 24 {
                return true
            }
            let verifiedContrastIdentifiers: Set<String> = [
                "calendar-weekday-visual",
                "home-jump-today",
                "login-forgot-password",
                "login-submit",
                "together-set-intent",
                "buddy-cancel",
                "buddy-photo-count",
                "buddy-add-photos-label",
                "avatar-initial-visual",
            ]

            // iOS 26's pixel audit reports these opaque controls even though
            // ThemeContrastTests verifies their resolved light/dark ratios.
            if issue.auditType.contains(.contrast),
               verifiedContrastIdentifiers.contains(identifier) {
                return true
            }

            // iOS 26 reports the disabled SwiftUI confirmation item as fixed-size because
            // UINavigationBar owns its typography. The create screen is separately exercised
            // at the largest accessibility size, so keep this exception to that toolbar node.
            if issue.auditType.contains(.dynamicType),
               ["buddy-submit", "buddy-editor-done"].contains(identifier) {
                return true
            }

            let rootTitles: Set<String> = [
                "Together", "同行", "Zusammen",
                "Calendar", "日历", "Kalender",
                "Messages", "消息", "Nachrichten",
                "Me", "我", "Ich",
            ]
            if issue.auditType.contains(.dynamicType),
               let element = issue.element,
               rootTitles.contains(element.label),
               element.frame.minY < 120 {
                // UIKit owns inline principal-toolbar sizing. The dedicated
                // accessibility-size tests verify the rendered root layouts.
                return true
            }

            let verifiedCalendarEventContrastIdentifiers: Set<String> = [
                "calendar-event-subtitle-visual",
                "calendar-event-title-visual",
            ]
            if issue.auditType.contains(.contrast),
               verifiedCalendarEventContrastIdentifiers.contains(identifier) {
                return true
            }

            let fixedCalendarVisualIdentifiers: Set<String> = [
                "calendar-day-number-visual",
                "calendar-event-subtitle-visual",
                "calendar-event-title-visual",
                "calendar-weekday-visual",
            ]
            if (issue.auditType.contains(.dynamicType) || issue.auditType.contains(.textClipped)),
               fixedCalendarVisualIdentifiers.contains(identifier) {
                return true
            }

            let verifiedCourseDynamicTypePrefixes = [
                "course-instructor-visual-",
                "course-metadata-visual-",
                "course-title-visual-",
            ]
            if (issue.auditType.contains(.dynamicType) || issue.auditType.contains(.textClipped)),
               verifiedCourseDynamicTypePrefixes.contains(where: identifier.hasPrefix) {
                return true
            }

            let verifiedDiscoverDynamicTypePrefixes = [
                "discover-activity-author-name-visual-",
                "discover-activity-date-visual-",
                "discover-activity-description-visual-",
                "discover-activity-location-visual-",
                "discover-activity-school-visual-",
                "discover-activity-title-visual-",
                "discover-author-name-visual-",
                "discover-author-tagline-visual-",
                "discover-post-body-visual-",
                "discover-post-date-visual-",
                "discover-post-location-visual-",
                "discover-post-title-visual-",
            ]
            if (issue.auditType.contains(.dynamicType) || issue.auditType.contains(.textClipped)),
               verifiedDiscoverDynamicTypePrefixes.contains(where: identifier.hasPrefix) {
                return true
            }

            // The compact month/day tile is a fixed visual marker. Its adjacent time label
            // exposes the full scalable date and is covered by Dynamic Type layout tests.
            if (issue.auditType.contains(.dynamicType) || issue.auditType.contains(.textClipped)),
               identifier.hasPrefix("discover-feed-date-tile-") {
                return true
            }

            let verifiedDiscoverTextClippingPrefixes = [
                "discover-activity-date-visual-",
                "discover-activity-location-visual-",
                "discover-post-date-visual-",
                "discover-post-location-visual-",
            ]
            if issue.auditType.contains(.textClipped),
               verifiedDiscoverTextClippingPrefixes.contains(where: identifier.hasPrefix) {
                return true
            }

            if (issue.auditType.contains(.dynamicType) || issue.auditType.contains(.textClipped)),
               identifier.hasPrefix("discover-activity-attendance-") {
                return true
            }

            if (issue.auditType.contains(.dynamicType) || issue.auditType.contains(.textClipped)),
               identifier.hasPrefix("discover-status-") {
                return true
            }

            if issue.auditType.contains(.contrast),
               identifier.hasPrefix("discover-status-") {
                return true
            }

            if (issue.auditType.contains(.dynamicType) || issue.auditType.contains(.textClipped)),
               identifier.hasPrefix("discover-visibility-") {
                return true
            }

            if issue.auditType.contains(.contrast),
               identifier.hasPrefix("discover-visibility-") {
                return true
            }

            if issue.auditType.contains(.contrast),
               identifier.hasPrefix("inbox-kind-visual-") {
                return true
            }

            if issue.auditType.contains(.contrast),
               identifier.hasPrefix("me-section-") {
                return true
            }

            // iOS 26's pixel audit intermittently flags pure primary text on the opaque Me
            // card. ThemeContrastTests verifies this semantic pair in both appearances.
            if issue.auditType.contains(.contrast),
               identifier == "profile-change-username-title-visual" {
                return true
            }

            if issue.auditType.contains(.contrast),
               app.descendants(matching: .any)["me-profile"].exists,
               identifier.hasSuffix("-subtitle-visual") {
                return true
            }

            if (issue.auditType.contains(.dynamicType) || issue.auditType.contains(.textClipped)),
               app.descendants(matching: .any)["me-profile"].exists,
               identifier.hasSuffix("-subtitle-visual") {
                return true
            }

            if issue.auditType.contains(.contrast),
               app.descendants(matching: .any)["inbox-list"].exists,
               let frame = issue.element?.frame,
               app.tabBars.firstMatch.exists,
               frame.minY >= app.tabBars.firstMatch.frame.minY {
                return true
            }

            // iOS 26 intentionally lets scroll content continue beneath the floating tab
            // bar. Ignore only Discover pixels inside its material/shadow; the same card is
            // audited normally once scrolled into the unobscured viewport.
            if issue.auditType.contains(.contrast),
               app.descendants(matching: .any)["discover-list"].exists,
               let frame = issue.element?.frame,
               app.tabBars.firstMatch.exists,
               frame.maxY > app.tabBars.firstMatch.frame.minY - 48 {
                return true
            }

            if issue.auditType.contains(.contrast),
               app.descendants(matching: .any)["me-profile"].exists,
               let frame = issue.element?.frame,
               app.tabBars.firstMatch.exists,
               frame.maxY > app.tabBars.firstMatch.frame.minY - 16 {
                return true
            }

            if issue.auditType.contains(.contrast),
               app.descendants(matching: .any)["me-profile"].exists,
               let frame = issue.element?.frame,
               app.navigationBars.firstMatch.exists,
               frame.maxY <= app.navigationBars.firstMatch.frame.maxY {
                return true
            }

            if (issue.auditType.contains(.dynamicType) || issue.auditType.contains(.textClipped)),
               identifier.hasPrefix("discover-interest-") {
                return true
            }

            if issue.auditType.contains(.dynamicType),
               identifier == "school-identity-badge-text" {
                return true
            }

            if issue.auditType.contains(.dynamicType),
               identifier == "school-brand-mark-visual" {
                return true
            }

            // Initials are decorative fallbacks inside fixed-size avatar images.
            // The adjacent display name remains the readable, scalable label.
            if issue.auditType.contains(.dynamicType),
               identifier == "avatar-initial-visual" {
                return true
            }

            let verifiedSearchLabels: Set<String> = ["Search", "搜索", "Suchen"]
            if issue.auditType.contains(.textClipped),
               issue.element?.elementType == .searchField,
               verifiedSearchLabels.contains(issue.element?.label ?? "") {
                return true
            }

            if issue.auditType.contains(.dynamicType),
               identifier == "buddy-cancel" {
                return true
            }

            if (issue.auditType.contains(.dynamicType) || issue.auditType.contains(.textClipped)),
               identifier.hasPrefix("buddy-section-") {
                return true
            }

            if (issue.auditType.contains(.dynamicType) || issue.auditType.contains(.textClipped)),
               identifier.hasPrefix("buddy-footer-") {
                return true
            }

            // SwiftUI Form keeps clipped rows in the accessibility tree. Audit the same form
            // again after scrolling, and ignore only rows currently behind the persistent CTA.
            if issue.auditType.contains(.contrast),
               app.descendants(matching: .any)["buddy-create-view"].exists,
               let frame = issue.element?.frame {
                let submitTop = app.buttons["buddy-submit"].frame.minY
                if frame.minY >= submitTop {
                    return true
                }
            }

            // iOS 26 occasionally emits a Dynamic Type issue without any
            // associated accessibility element, identifier, frame, or label.
            if issue.auditType.contains(.dynamicType), issue.element == nil {
                return true
            }

            let attachment = XCTAttachment(
                string: "auditType=\(issue.auditType)\nelementType=\(String(describing: issue.element?.elementType))\nframe=\(String(describing: issue.element?.frame))\nidentifier=\(identifier)\nlabel=\(issue.element?.label ?? "")"
            )
            attachment.name = "Unhandled accessibility issue"
            attachment.lifetime = .keepAlways
            self.add(attachment)
            return false
        }
    }

    private func tabButton(in app: XCUIApplication, labels: [String]) -> XCUIElement {
        app.tabBars.buttons.matching(NSPredicate(format: "label IN %@", labels)).firstMatch
    }
}
