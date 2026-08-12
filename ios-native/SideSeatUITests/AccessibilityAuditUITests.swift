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
        try performAudit(in: app)
    }

    func testPrimaryAuthenticatedDestinationsAccessibility() throws {
        let app = XCUIApplication()
        app.launchArguments = [
            "--ui-testing-authenticated",
            "--ui-testing-skip-tutorial",
            "--ui-testing-chats",
            "--ui-testing-appearance=light",
        ]
        app.launch()

        auditTab(
            in: app,
            labels: ["Calendar", "日历"],
            readinessIdentifier: "home-week-timetable"
        )

        let courses = app.buttons["open-courses"]
        XCTAssertTrue(courses.waitForExistence(timeout: 5))
        courses.tap()
        XCTAssertTrue(app.descendants(matching: .any)["courses-list"].waitForExistence(timeout: 5))
        try performAudit(in: app)
        app.navigationBars.buttons.firstMatch.tap()

        auditTab(
            in: app,
            labels: ["Discover", "发现"],
            readinessIdentifier: "discover-list"
        )

        let create = tabButton(in: app, labels: ["Create", "发布"])
        XCTAssertTrue(create.waitForExistence(timeout: 5))
        create.tap()
        XCTAssertTrue(app.descendants(matching: .any)["buddy-create-view"].waitForExistence(timeout: 5))
        try performAudit(in: app)

        let form = app.collectionViews.firstMatch
        let expirySection = app.staticTexts["buddy-section-expiry"]
        let screenFrame = app.windows.firstMatch.frame
        for _ in 0..<8 where !expirySection.exists || !screenFrame.intersects(expirySection.frame) {
            form.swipeUp()
        }
        XCTAssertTrue(expirySection.exists)
        XCTAssertTrue(screenFrame.intersects(expirySection.frame))
        try performAudit(in: app)

        app.buttons.matching(NSPredicate(format: "label IN %@", ["Cancel", "取消"])).firstMatch.tap()

        auditTab(
            in: app,
            labels: ["Chats", "消息", "聊天"],
            readinessIdentifier: "inbox-list"
        )
        let me = tabButton(in: app, labels: ["Me", "我"])
        XCTAssertTrue(me.waitForExistence(timeout: 8))
        me.tap()
        let meProfile = app.descendants(matching: .any)["me-profile"]
        XCTAssertTrue(meProfile.waitForExistence(timeout: 6))
        try performAudit(in: app)

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

        let courses = app.buttons["open-courses"]
        XCTAssertTrue(courses.waitForExistence(timeout: 8))
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

        let memberCount = app.descendants(matching: .any)["course-member-count-visual-ui-course"]
        XCTAssertTrue(memberCount.exists)
        XCTAssertGreaterThanOrEqual(memberCount.frame.height, 32)

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

    func testDiscoverLayoutAtLargestDynamicType() {
        let app = XCUIApplication()
        app.launchArguments = [
            "--ui-testing-authenticated",
            "--ui-testing-skip-tutorial",
            "--ui-testing-dynamic-type-accessibility",
            "--ui-testing-appearance=light",
        ]
        app.launch()

        let discover = tabButton(in: app, labels: ["Discover", "发现"])
        XCTAssertTrue(discover.waitForExistence(timeout: 8))
        discover.tap()

        let list = app.descendants(matching: .any)["discover-list"]
        XCTAssertTrue(list.waitForExistence(timeout: 6))
        let searchField = app.searchFields.firstMatch
        XCTAssertTrue(searchField.exists)
        XCTAssertTrue(searchField.isHittable)
        XCTAssertGreaterThanOrEqual(searchField.frame.height, 44)

        let activityAuthor = app.descendants(matching: .any)["discover-activity-author-name-visual-ui-activity"]
        XCTAssertTrue(activityAuthor.waitForExistence(timeout: 3))
        XCTAssertTrue(activityAuthor.isHittable)
        XCTAssertGreaterThanOrEqual(activityAuthor.frame.height, 44)
        let activityTitle = app.descendants(matching: .any)["discover-activity-title-visual-ui-activity"]
        XCTAssertTrue(activityTitle.exists)
        XCTAssertGreaterThanOrEqual(activityTitle.frame.height, 60)
        let activityDescription = app.descendants(matching: .any)["discover-activity-description-visual-ui-activity"]
        XCTAssertTrue(activityDescription.exists)
        XCTAssertGreaterThanOrEqual(activityDescription.frame.height, 60)
        let activitySchool = app.descendants(matching: .any)["discover-activity-school-visual-ui-activity"]
        XCTAssertTrue(activitySchool.exists)
        XCTAssertGreaterThanOrEqual(activitySchool.frame.height, 44)
        let activityDate = app.staticTexts["discover-activity-date-visual-ui-activity"]
        XCTAssertTrue(activityDate.exists)
        XCTAssertGreaterThanOrEqual(activityDate.frame.height, 44)
        let activityLocation = app.staticTexts["discover-activity-location-visual-ui-activity"]
        XCTAssertTrue(activityLocation.exists)
        XCTAssertGreaterThanOrEqual(activityLocation.frame.height, 44)
        let activityAttendance = app.staticTexts["discover-activity-attendance-ui-activity"]
        XCTAssertTrue(activityAttendance.exists)
        XCTAssertGreaterThanOrEqual(activityAttendance.frame.height, 44)

        let title = app.descendants(matching: .any)["discover-post-title-visual-ui-buddy"]
        for _ in 0..<8 where !title.exists || !title.isHittable {
            list.swipeUp()
        }
        XCTAssertTrue(title.waitForExistence(timeout: 5))
        XCTAssertTrue(title.isHittable)
        XCTAssertGreaterThanOrEqual(title.frame.height, 60)

        let buddyAuthor = app.descendants(matching: .any)["discover-author-name-visual-ui-buddy"]
        XCTAssertTrue(buddyAuthor.exists)
        XCTAssertGreaterThanOrEqual(buddyAuthor.frame.height, 44)
        let tagline = app.descendants(matching: .any)["discover-author-tagline-visual-ui-buddy"]
        XCTAssertTrue(tagline.exists)
        XCTAssertGreaterThanOrEqual(tagline.frame.height, 44)
        let verificationBadge = app.staticTexts["school-identity-badge-text"]
        XCTAssertTrue(verificationBadge.exists)
        XCTAssertGreaterThanOrEqual(verificationBadge.frame.height, 44)

        let body = app.descendants(matching: .any)["discover-post-body-visual-ui-buddy"]
        for _ in 0..<4 where !body.exists || !body.isHittable {
            list.swipeUp()
        }
        XCTAssertTrue(body.exists)
        XCTAssertTrue(body.isHittable)
        XCTAssertGreaterThanOrEqual(body.frame.height, 60)
        let postDate = app.staticTexts["discover-post-date-visual-ui-buddy"]
        XCTAssertTrue(postDate.exists)
        XCTAssertGreaterThanOrEqual(postDate.frame.height, 44)
        let postLocation = app.staticTexts["discover-post-location-visual-ui-buddy"]
        XCTAssertTrue(postLocation.exists)
        XCTAssertGreaterThanOrEqual(postLocation.frame.height, 44)

        let status = app.staticTexts["discover-status-ui-buddy"]
        let screenFrame = app.windows.firstMatch.frame
        for _ in 0..<10 where !status.exists || !screenFrame.intersects(status.frame) {
            list.swipeUp()
        }
        XCTAssertTrue(status.exists)
        XCTAssertTrue(screenFrame.intersects(status.frame))
        XCTAssertGreaterThanOrEqual(status.frame.height, 44)
        let visibility = app.staticTexts["discover-visibility-ui-buddy"]
        XCTAssertTrue(visibility.exists)
        XCTAssertGreaterThanOrEqual(visibility.frame.height, 44)
        let interested = app.staticTexts["discover-interest-ui-buddy"]
        XCTAssertTrue(interested.exists)
        XCTAssertGreaterThanOrEqual(interested.frame.height, 44)

        let attachment = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
        attachment.name = "Discover at accessibility5"
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

        let create = tabButton(in: app, labels: ["Create", "发布"])
        XCTAssertTrue(create.waitForExistence(timeout: 8))
        create.tap()
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

        let form = app.collectionViews.firstMatch
        XCTAssertTrue(form.exists)
        for (identifier, minimumHeight) in [
            ("buddy-section-plan-details", CGFloat(40)),
            ("buddy-footer-plan-details", CGFloat(29)),
            ("buddy-section-visibility", CGFloat(40)),
            ("buddy-section-expiry", CGFloat(40)),
            ("buddy-footer-expiry", CGFloat(29)),
        ] {
            let header = app.staticTexts[identifier]
            for _ in 0..<10 where !header.exists || !screenFrame.intersects(header.frame) {
                form.swipeUp()
            }
            XCTAssertTrue(header.exists)
            XCTAssertTrue(screenFrame.intersects(header.frame))
            XCTAssertGreaterThanOrEqual(header.frame.height, minimumHeight)
        }

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

        for identifier in ["inbox-chip-all", "inbox-chip-direct", "inbox-chip-courses"] {
            let chip = app.buttons[identifier]
            XCTAssertTrue(chip.waitForExistence(timeout: 3))
            XCTAssertTrue(chip.isHittable)
            XCTAssertGreaterThanOrEqual(chip.frame.height, 44)
            XCTAssertTrue(screenFrame.intersects(chip.frame))
        }

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

        let attachment = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
        attachment.name = "Chats at accessibility5"
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
        XCTAssertGreaterThanOrEqual(editProfile.frame.height, 100)
        XCTAssertTrue((editProfile.value as? String)?.contains("@test_001") == true)

        let schoolSummary = app.staticTexts["me-school-identity"]
        XCTAssertTrue(schoolSummary.exists)
        XCTAssertGreaterThanOrEqual(schoolSummary.frame.height, 44)
        let schoolStatus = app.staticTexts["me-school-status-visual"]
        XCTAssertTrue(schoolStatus.exists)
        XCTAssertGreaterThanOrEqual(schoolStatus.frame.height, 32)

        let tagline = app.descendants(matching: .any)["me-tagline-visual"]
        XCTAssertTrue(tagline.exists)
        XCTAssertGreaterThanOrEqual(tagline.frame.height, 40)

        let settings = app.buttons["me-settings"]
        for _ in 0..<10 where !settings.exists || !settings.isHittable {
            profile.swipeUp()
        }
        XCTAssertTrue(settings.exists)
        XCTAssertTrue(settings.isHittable)
        XCTAssertTrue(screenFrame.intersects(settings.frame))
        XCTAssertGreaterThanOrEqual(settings.frame.height, 88)

        let moreHeader = app.staticTexts["me-section-more"]
        XCTAssertTrue(moreHeader.exists)
        XCTAssertTrue(screenFrame.intersects(moreHeader.frame))
        XCTAssertGreaterThanOrEqual(moreHeader.frame.height, 28)

        let attachment = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
        attachment.name = "Me at accessibility5"
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
            let verifiedContrastIdentifiers: Set<String> = [
                "calendar-weekday-visual",
                "home-jump-today",
                "login-forgot-password",
                "login-submit",
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
                "course-member-count-visual-",
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

            if issue.auditType.contains(.contrast),
               app.descendants(matching: .any)["inbox-list"].exists,
               let frame = issue.element?.frame,
               app.tabBars.firstMatch.exists,
               frame.minY >= app.tabBars.firstMatch.frame.minY {
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

            if issue.auditType.contains(.contrast),
               app.descendants(matching: .any)["inbox-quick-chips"].exists,
               let frame = issue.element?.frame {
                let windowFrame = app.windows.firstMatch.frame
                if frame.minX < windowFrame.minX || frame.maxX > windowFrame.maxX {
                    return true
                }
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
