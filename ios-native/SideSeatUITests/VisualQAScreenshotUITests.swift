import XCTest

/// Captures Auth, Together states, and the current 4-tab shell for visual QA.
/// Appearance: host writes `.appearance` (and optionally `simctl ui`); tests also pass
/// `--ui-testing-appearance=` so physical devices force light/dark without simctl.
final class VisualQAScreenshotUITests: XCTestCase {
    override func setUpWithError() throws {
        continueAfterFailure = false
        try FileManager.default.createDirectory(
            at: Self.visualQADirectory(),
            withIntermediateDirectories: true
        )
    }

    @MainActor
    func testRelatedActivityFitInThreeLanguages() {
        for (language, title, largeType) in [
            ("zh-Hans", "活动匹配度", false),
            ("en", "Activity fit", false),
            ("de", "Aktivitätspassung", false),
            ("zh-Hans", "活动匹配度", true),
        ] {
            let app = XCUIApplication()
            app.launchArguments = [
                "--ui-testing-authenticated", "--ui-testing-skip-tutorial",
                "--ui-testing-discover", "--ui-testing-weekly-intent",
                "--ui-testing-mutual-opportunity", "--ui-testing-related-activity",
                "--ui-testing-together-matching", "--ui-testing-language=\(language)",
                "--ui-testing-appearance=\(language == "de" ? "dark" : "light")",
            ]
            if largeType { app.launchArguments.append("--ui-testing-dynamic-type-accessibility") }
            app.launch()
            let fit = app.descendants(matching: .any)["mutual-opportunity-fit-cmutualui0000000000000001"]
            revealFlowElement(fit, in: app)
            XCTAssertTrue(fit.label.contains(title))
            XCTAssertTrue(fit.label.contains("60/100"))
            let suffix = "\(language)\(largeType ? "-large-type" : "")"
            saveScreenshot(app: app, name: "activity-fit-\(suffix)")
            let explanation = app.buttons["mutual-opportunity-fit-details-cmutualui0000000000000001"]
            revealFlowElement(explanation, in: app)
            explanation.tap()
            let disclaimer = app.staticTexts["mutual-opportunity-fit-disclaimer-cmutualui0000000000000001"]
            XCTAssertTrue(disclaimer.waitForExistence(timeout: 5))
            revealFlowElement(disclaimer, in: app)
            let followingText = app.staticTexts["mutual-opportunity-match-explanation-cmutualui0000000000000001"]
            XCTAssertTrue(followingText.exists)
            XCTAssertLessThanOrEqual(disclaimer.frame.maxY, followingText.frame.minY,
                                     "Expanded text must reserve height before the next section")
            let verified = app.staticTexts["mutual-opportunity-verified-cmutualui0000000000000001"]
            XCTAssertLessThanOrEqual(disclaimer.frame.maxY, verified.frame.minY,
                                     "The following status row must not cover the disclaimer")
            XCTAssertTrue(app.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", "25/50")).firstMatch.exists)
            saveScreenshot(app: app, name: "activity-fit-details-\(suffix)")
            // Return to the disclosure header, including at accessibility text sizes.
            for _ in 0..<12 {
                // XCTest calls controls behind the navigation/status bar
                // hittable. Bring the whole header into the content viewport.
                if explanation.frame.minY < app.navigationBars.firstMatch.frame.maxY + 4 {
                    app.swipeDown()
                } else if !explanation.isHittable {
                    app.swipeUp()
                } else { break }
            }
            XCTAssertTrue(explanation.isHittable)
            explanation.tap()
            XCTAssertTrue(disclaimer.waitForNonExistence(timeout: 5))
            app.terminate()
        }
    }

    @MainActor
    func testTogetherFlowEditorLightAndDark() {
        for appearance in ["light", "dark"] {
            let app = XCUIApplication()
            app.launchArguments = [
                "--ui-testing-authenticated", "--ui-testing-skip-tutorial",
                "--ui-testing-discover", "--ui-testing-weekly-intent",
                "--ui-testing-mutual-opportunity", "--ui-testing-together-matching",
                "--ui-testing-language=zh-Hans", "--ui-testing-appearance=\(appearance)",
            ]
            app.launch()
            XCTAssertTrue(app.descendants(matching: .any)["together-home"].waitForExistence(timeout: 8))
            saveScreenshot(app: app, name: "flow-together-\(appearance)")
            let addIntent = app.buttons["together-add-intent"]
            revealFlowElement(addIntent, in: app)
            addIntent.tap()
            let activity = app.descendants(matching: .any)["intent-editor-activity"].firstMatch
            XCTAssertTrue(activity.waitForExistence(timeout: 5))
            activity.tap()
            activity.typeText("课后喝咖啡")
            let next = app.buttons["intent-editor-next"]
            XCTAssertTrue(next.isEnabled)
            saveScreenshot(app: app, name: "flow-intent-activity-\(appearance)")
            next.tap()
            let save = app.buttons["intent-editor-save"]
            XCTAssertTrue(save.waitForExistence(timeout: 3))
            XCTAssertTrue(save.isEnabled)
            XCTAssertTrue(save.isHittable)
            saveScreenshot(app: app, name: "flow-intent-times-\(appearance)")
            app.buttons["intent-editor-back"].tap()
            XCTAssertEqual(activity.value as? String, "课后喝咖啡")
            app.terminate()
        }
    }

    @MainActor
    func testPlanFlowComposerAndOutcomeLightAndDark() {
        for appearance in ["light", "dark"] {
            let app = XCUIApplication()
            app.launchArguments = [
                "--ui-testing-authenticated", "--ui-testing-skip-tutorial",
                "--ui-testing-chats", "--ui-testing-cached-chat-refresh",
                "--ui-testing-language=zh-Hans", "--ui-testing-appearance=\(appearance)",
            ]
            app.launch()
            XCTAssertTrue(app.buttons["inbox-pending-plans"].waitForExistence(timeout: 8))
            app.buttons["inbox-pending-plans"].tap()
            let plan = app.buttons["plans-row-ui-plan-1"]
            XCTAssertTrue(plan.waitForExistence(timeout: 5))
            saveScreenshot(app: app, name: "flow-plans-\(appearance)")
            plan.tap()
            let counter = app.buttons["plan-card-counter-ui-plan-1"]
            XCTAssertTrue(counter.waitForExistence(timeout: 5))
            revealFlowElement(counter, in: app)
            saveScreenshot(app: app, name: "flow-plan-response-\(appearance)")
            counter.tap()
            let submit = app.buttons["plan-create-submit"]
            let sheetAppeared = submit.waitForExistence(timeout: 5)
            saveScreenshot(app: app, name: "flow-plan-editor-\(appearance)")
            if !sheetAppeared {
                let tree = XCTAttachment(string: app.debugDescription)
                tree.lifetime = .keepAlways
                add(tree)
            }
            XCTAssertTrue(sheetAppeared)
            XCTAssertTrue(submit.isEnabled)
            XCTAssertTrue(submit.isHittable)
            XCTAssertEqual(app.textFields["plan-create-title"].value as? String, "图书馆自习")
            submit.tap()
            XCTAssertTrue(submit.waitForNonExistence(timeout: 5))
            app.terminate()

            app.launch()
            XCTAssertTrue(app.buttons["inbox-pending-plans"].waitForExistence(timeout: 8))
            app.buttons["inbox-pending-plans"].tap()
            let happened = app.buttons["plan-outcome-occurred-ui-plan-completed"]
            revealFlowElement(happened, in: app)
            saveScreenshot(app: app, name: "flow-outcome-\(appearance)")
            happened.tap()
            let edit = app.buttons["plan-outcome-edit-ui-plan-completed"]
            XCTAssertTrue(edit.waitForExistence(timeout: 4))
            XCTAssertTrue(app.descendants(matching: .any)["plan-outcome-saved-ui-plan-completed"].exists)
            edit.tap()
            let didNotHappen = app.buttons["plan-outcome-did_not_occur-ui-plan-completed"]
            revealFlowElement(didNotHappen, in: app)
            didNotHappen.tap()
            XCTAssertTrue(edit.waitForExistence(timeout: 4))
            app.terminate()
        }
    }

    @MainActor
    func testMeetAgainPrivatePermissionLightAndDark() {
        for appearance in ["light", "dark"] {
            let app = XCUIApplication()
            app.launchArguments = [
                "--ui-testing-authenticated", "--ui-testing-skip-tutorial",
                "--ui-testing-chats", "--ui-testing-cached-chat-refresh",
                "--ui-testing-language=zh-Hans", "--ui-testing-appearance=\(appearance)",
            ]
            app.launch()
            XCTAssertTrue(app.buttons["inbox-pending-plans"].waitForExistence(timeout: 8))
            app.buttons["inbox-pending-plans"].tap()
            let happened = app.buttons["plan-outcome-occurred-ui-plan-completed"]
            revealFlowElement(happened, in: app)
            XCTAssertFalse(app.buttons["plan-meet-again-yes-ui-plan-completed"].exists)
            happened.tap()
            let yes = app.buttons["plan-meet-again-yes-ui-plan-completed"]
            revealFlowElement(yes, in: app)
            XCTAssertTrue(app.staticTexts["愿意再次同行吗？"].exists)
            saveScreenshot(app: app, name: "layer3-permission-\(appearance)")
            yes.tap()
            let withdraw = app.buttons["plan-meet-again-withdraw-ui-plan-completed"]
            revealFlowElement(withdraw, in: app)
            XCTAssertTrue(app.staticTexts["你愿意再次同行"].exists)
            saveScreenshot(app: app, name: "layer3-permission-saved-\(appearance)")
            withdraw.tap()
            XCTAssertTrue(app.staticTexts["已撤回意愿"].waitForExistence(timeout: 4))
            app.buttons["plan-meet-again-edit-ui-plan-completed"].tap()
            let no = app.buttons["plan-meet-again-no-ui-plan-completed"]
            revealFlowElement(no, in: app)
            no.tap()
            XCTAssertTrue(app.buttons["plan-meet-again-edit-ui-plan-completed"].waitForExistence(timeout: 4))
            XCTAssertFalse(app.buttons["plan-meet-again-withdraw-ui-plan-completed"].exists)
            app.terminate()
        }
    }

    @MainActor
    private func revealFlowElement(_ element: XCUIElement, in app: XCUIApplication) {
        for _ in 0..<8 where !element.exists || !element.isHittable {
            app.swipeUp()
        }
        XCTAssertTrue(element.exists)
        XCTAssertTrue(element.isHittable)
    }

    @MainActor
    func testCaptureCurrentAppearanceMatrix() throws {
        let appearance = Self.resolvedAppearance()
        XCTAssertTrue(["light", "dark"].contains(appearance), "appearance must be light|dark")

        captureAuth(appearance: appearance)
        captureAuthenticatedTabs(appearance: appearance)
    }

    @MainActor
    func testCaptureTogetherOpportunity() throws {
        let appearance = Self.resolvedAppearance()
        let app = XCUIApplication()
        app.launchArguments = [
            "--ui-testing-authenticated",
            "--ui-testing-skip-tutorial",
            "--ui-testing-discover",
            "--ui-testing-weekly-intent",
            "--ui-testing-mutual-opportunity",
            "--ui-testing-together-matching",
            "--ui-testing-appearance=\(appearance)",
        ]
        app.launch()

        XCTAssertTrue(app.descendants(matching: .any)["together-home"].waitForExistence(timeout: 8))
        XCTAssertTrue(app.descendants(matching: .any)["mutual-opportunity-cmutualui0000000000000001"].waitForExistence(timeout: 5))
        RunLoop.current.run(until: Date().addingTimeInterval(0.35))
        saveScreenshot(app: app, name: "together-opportunity-\(appearance)")
        app.terminate()
    }

    @MainActor
    func testCaptureTogetherActiveMatching() throws {
        let appearance = Self.resolvedAppearance()
        let app = XCUIApplication()
        app.launchArguments = [
            "--ui-testing-authenticated",
            "--ui-testing-skip-tutorial",
            "--ui-testing-discover",
            "--ui-testing-weekly-intent",
            "--ui-testing-mutual-opportunity-empty",
            "--ui-testing-together-matching-active",
            "--ui-testing-appearance=\(appearance)",
        ]
        app.launch()

        XCTAssertTrue(app.descendants(matching: .any)["together-home"].waitForExistence(timeout: 8))
        let stopMatching = app.buttons.matching(
            NSPredicate(format: "label IN %@", ["Stop matching", "停止匹配", "Matching stoppen"])
        ).firstMatch
        XCTAssertTrue(stopMatching.waitForExistence(timeout: 5))
        RunLoop.current.run(until: Date().addingTimeInterval(0.35))
        saveScreenshot(app: app, name: "together-matching-active-\(appearance)")
        app.terminate()
    }

    @MainActor
    func testCapturePlanInviteCard() throws {
        let appearance = Self.resolvedAppearance()
        XCTAssertTrue(["light", "dark"].contains(appearance), "appearance must be light|dark")

        let app = XCUIApplication()
        app.launchArguments = [
            "--ui-testing-authenticated",
            "--ui-testing-chats",
            "--ui-testing-cached-chat-refresh",
            "--ui-testing-language=zh-Hans",
            "--ui-testing-appearance=\(appearance)",
        ]
        app.launch()

        let pendingPlans = app.buttons["inbox-pending-plans"]
        XCTAssertTrue(pendingPlans.waitForExistence(timeout: 8))
        pendingPlans.tap()

        XCTAssertTrue(app.navigationBars["计划"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["需要你回应"].exists)
        XCTAssertTrue(app.staticTexts["即将开始"].exists)
        XCTAssertTrue(app.staticTexts["历史与已结束"].exists)
        XCTAssertTrue(app.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", "已确认")).firstMatch.exists)
        XCTAssertTrue(app.staticTexts["在对话中管理"].firstMatch.exists)
        XCTAssertFalse(app.staticTexts["Past & Ended"].exists)
        XCTAssertFalse(app.staticTexts["Confirmed"].exists)
        XCTAssertFalse(app.staticTexts["Manage in conversation"].exists)

        let planRow = app.buttons["plans-row-ui-plan-1"]
        XCTAssertTrue(planRow.waitForExistence(timeout: 5))
        planRow.tap()

        let actions = app.descendants(matching: .any)["plan-card-actions-ui-plan-1"]
        XCTAssertTrue(actions.waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", "已提议")).firstMatch.exists)
        XCTAssertTrue(app.staticTexts["接受后会确认此计划，并添加到双方日历。"].exists)
        XCTAssertFalse(app.staticTexts["Proposed"].exists)
        XCTAssertGreaterThan(actions.frame.height, 48)
        RunLoop.current.run(until: Date().addingTimeInterval(0.35))
        saveScreenshot(app: app, name: "chat-plan-invite-\(appearance)")
        app.terminate()
    }

    @MainActor
    func testCaptureChatBubbles() throws {
        let appearance = Self.resolvedAppearance()
        XCTAssertTrue(["light", "dark"].contains(appearance), "appearance must be light|dark")

        let app = XCUIApplication()
        app.launchArguments = [
            "--ui-testing-authenticated",
            "--ui-testing-chats",
            "--ui-testing-language=zh-Hans",
            "--ui-testing-appearance=\(appearance)",
        ]
        app.launch()

        let row = app.descendants(matching: .any)["inbox-row-ui-connection-leo"]
        XCTAssertTrue(row.waitForExistence(timeout: 8))
        row.tap()
        XCTAssertTrue(app.descendants(matching: .any)["direct-chat"].waitForExistence(timeout: 5))
        let ownBubble = app.descendants(matching: .any)["chat-bubble-ui-leo-msg-2"]
        XCTAssertTrue(ownBubble.waitForExistence(timeout: 5))
        RunLoop.current.run(until: Date().addingTimeInterval(0.35))
        saveScreenshot(app: app, name: "chat-bubbles-\(appearance)")

        ownBubble.press(forDuration: 0.8)
        let menu = app.descendants(matching: .any)["chat-context-action-menu"].firstMatch
        XCTAssertTrue(menu.waitForExistence(timeout: 3))
        XCTAssertTrue(app.buttons["chat-reply-ui-leo-msg-2"].isHittable)
        XCTAssertTrue(app.buttons["chat-copy-ui-leo-msg-2"].isHittable)
        XCTAssertTrue(app.buttons["chat-delete-ui-leo-msg-2"].isHittable)
        XCTAssertLessThanOrEqual(menu.frame.width, app.frame.width * 0.55)
        XCTAssertTrue(
            menu.frame.maxY <= ownBubble.frame.minY + 20
                || menu.frame.minY >= ownBubble.frame.maxY - 20
        )
        RunLoop.current.run(until: Date().addingTimeInterval(0.25))
        saveScreenshot(app: app, name: "chat-context-menu-\(appearance)")
        app.coordinate(withNormalizedOffset: CGVector(dx: 0.08, dy: 0.35)).tap()
        XCTAssertTrue(menu.waitForNonExistence(timeout: 2))
        app.terminate()
    }

    @MainActor
    func testCaptureCalendarConnections() throws {
        let appearance = Self.resolvedAppearance()
        XCTAssertTrue(["light", "dark"].contains(appearance), "appearance must be light|dark")

        let app = XCUIApplication()
        app.launchArguments = [
            "--ui-testing-authenticated",
            "--ui-testing-skip-tutorial",
            "--ui-testing-language=zh-Hans",
            "--ui-testing-appearance=\(appearance)",
        ]
        app.launch()

        let connections = app.buttons["calendar-connections"]
        XCTAssertTrue(connections.waitForExistence(timeout: 8))
        RunLoop.current.run(until: Date().addingTimeInterval(0.25))
        saveScreenshot(app: app, name: "calendar-home-actions-\(appearance)")
        connections.tap()
        XCTAssertTrue(
            app.descendants(matching: .any)["calendar-connection-add-apple"]
                .waitForExistence(timeout: 5)
        )
        XCTAssertTrue(app.buttons["calendar-import"].exists)
        XCTAssertTrue(app.buttons["calendar-export"].exists)
        RunLoop.current.run(until: Date().addingTimeInterval(0.35))
        saveScreenshot(app: app, name: "calendar-connections-\(appearance)")
        app.terminate()
    }

    @MainActor
    func testCaptureSideSeatAppShare() throws {
        let appearance = Self.resolvedAppearance()
        let app = XCUIApplication()
        app.launchArguments = [
            "--ui-testing-authenticated",
            "--ui-testing-skip-tutorial",
            "--ui-testing-appearance=\(appearance)",
        ]
        app.launch()

        let me = tabButton(in: app, labels: ["Me", "我"])
        XCTAssertTrue(me.waitForExistence(timeout: 8))
        me.tap()

        let settings = app.buttons["me-settings"]
        if !settings.waitForExistence(timeout: 2) {
            app.swipeUp()
        }
        XCTAssertTrue(settings.waitForExistence(timeout: 5))
        settings.tap()

        let share = app.buttons["settings-share-sideseat"]
        if !share.waitForExistence(timeout: 2) || !share.isHittable {
            app.swipeUp()
        }
        XCTAssertTrue(share.waitForExistence(timeout: 5))
        share.tap()
        XCTAssertTrue(app.descendants(matching: .any)["sideseat-app-share-preview"].waitForExistence(timeout: 5))
        RunLoop.current.run(until: Date().addingTimeInterval(0.35))
        saveScreenshot(app: app, name: "sideseat-app-share-\(appearance)")
        app.terminate()
    }

    @MainActor
    func testCaptureCourses() throws {
        let appearance = Self.resolvedAppearance()
        let app = XCUIApplication()
        app.launchArguments = [
            "--ui-testing-authenticated",
            "--ui-testing-skip-tutorial",
            "--ui-testing-appearance=\(appearance)",
        ]
        app.launch()

        let me = tabButton(in: app, labels: ["Me", "我", "Ich"])
        XCTAssertTrue(me.waitForExistence(timeout: 8))
        me.tap()
        let profile = app.descendants(matching: .any)["me-profile"]
        XCTAssertTrue(profile.waitForExistence(timeout: 5))
        let courses = app.buttons["me-courses"]
        for _ in 0..<8 where !courses.exists || !courses.isHittable {
            profile.swipeUp()
        }
        XCTAssertTrue(courses.exists)
        XCTAssertTrue(courses.isHittable)
        courses.tap()
        XCTAssertTrue(app.descendants(matching: .any)["courses-list"].waitForExistence(timeout: 5))
        RunLoop.current.run(until: Date().addingTimeInterval(0.35))
        saveScreenshot(app: app, name: "courses-\(appearance)")
        app.terminate()
    }

    @MainActor
    private func captureAuth(appearance: String) {
        let app = XCUIApplication()
        app.launchArguments = [
            "--ui-testing-signed-out",
            "--ui-testing-skip-tutorial",
            "--ui-testing-appearance=\(appearance)",
        ]
        app.launch()
        XCTAssertTrue(app.textFields["login-identifier"].waitForExistence(timeout: 8))
        RunLoop.current.run(until: Date().addingTimeInterval(0.4))
        saveScreenshot(app: app, name: "auth-\(appearance)")
        app.terminate()
    }

    @MainActor
    private func captureAuthenticatedTabs(appearance: String) {
        let app = XCUIApplication()
        app.launchArguments = [
            "--ui-testing-authenticated",
            "--ui-testing-skip-tutorial",
            "--ui-testing-chats",
            "--ui-testing-weekly-intent",
            "--ui-testing-mutual-opportunity-empty",
            "--ui-testing-together-matching",
            "--ui-testing-appearance=\(appearance)",
        ]
        app.launch()

        let together = tabButton(in: app, labels: ["Together", "同行", "Zusammen"])
        XCTAssertTrue(together.waitForExistence(timeout: 8))
        together.tap()
        XCTAssertTrue(app.descendants(matching: .any)["together-home"].waitForExistence(timeout: 6))
        XCTAssertTrue(app.descendants(matching: .any)["together-opportunities-empty"].waitForExistence(timeout: 5))
        RunLoop.current.run(until: Date().addingTimeInterval(0.35))
        saveScreenshot(app: app, name: "together-idle-\(appearance)")

        tabButton(in: app, labels: ["Calendar", "日历", "Kalender"]).tap()
        XCTAssertTrue(tabButton(in: app, labels: ["Calendar", "日历"]).waitForExistence(timeout: 8))
        XCTAssertTrue(app.descendants(matching: .any)["home-week-timetable"].waitForExistence(timeout: 6)
            || app.descendants(matching: .any)["home-date-strip"].waitForExistence(timeout: 6))
        RunLoop.current.run(until: Date().addingTimeInterval(0.45))
        saveScreenshot(app: app, name: "calendar-\(appearance)")

        tabButton(in: app, labels: ["Messages", "消息", "Nachrichten"]).tap()
        XCTAssertTrue(app.descendants(matching: .any)["inbox-list"].waitForExistence(timeout: 5))
        RunLoop.current.run(until: Date().addingTimeInterval(0.35))
        saveScreenshot(app: app, name: "messages-\(appearance)")

        tabButton(in: app, labels: ["Me", "我", "Ich"]).tap()
        XCTAssertTrue(app.descendants(matching: .any)["me-profile"].waitForExistence(timeout: 5))
        RunLoop.current.run(until: Date().addingTimeInterval(0.35))
        saveScreenshot(app: app, name: "me-\(appearance)")

        app.terminate()
    }

    @MainActor
    private func tabButton(in app: XCUIApplication, labels: [String]) -> XCUIElement {
        app.tabBars.buttons.matching(NSPredicate(format: "label IN %@", labels)).firstMatch
    }

    @MainActor
    private func saveScreenshot(app: XCUIApplication, name: String) {
        let shot = app.screenshot()
        let url = Self.visualQADirectory().appendingPathComponent("\(name).png")
        do {
            try shot.pngRepresentation.write(to: url, options: .atomic)
            let attachment = XCTAttachment(screenshot: shot)
            attachment.name = name
            attachment.lifetime = .keepAlways
            add(attachment)
        } catch {
            XCTFail("Failed writing \(url.path): \(error)")
        }
    }

    private static func visualQADirectory() -> URL {
        if let raw = ProcessInfo.processInfo.environment["VISUAL_QA_DIR"], !raw.isEmpty {
            return URL(fileURLWithPath: raw, isDirectory: true)
        }
        let thisFile = URL(fileURLWithPath: #filePath)
        let repoRoot = thisFile
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
        return repoRoot.appendingPathComponent("docs/visual-qa", isDirectory: true)
    }

    /// Host script writes `docs/visual-qa/.appearance` (light|dark) before each run.
    private static func resolvedAppearance() -> String {
        if let raw = ProcessInfo.processInfo.environment["VISUAL_QA_APPEARANCE"], !raw.isEmpty {
            return raw.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        }
        let marker = visualQADirectory().appendingPathComponent(".appearance")
        if let data = try? String(contentsOf: marker, encoding: .utf8) {
            return data.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        }
        return "light"
    }
}
