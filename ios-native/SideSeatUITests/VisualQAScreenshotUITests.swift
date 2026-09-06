import XCTest

/// Captures Auth + 4-tab screenshots for design-freeze visual QA (README §8).
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
    func testCaptureCurrentAppearanceMatrix() throws {
        let appearance = Self.resolvedAppearance()
        XCTAssertTrue(["light", "dark"].contains(appearance), "appearance must be light|dark")

        captureAuth(appearance: appearance)
        captureAuthenticatedTabs(appearance: appearance)
    }

    @MainActor
    func testCaptureDiscoverPlanShare() throws {
        let appearance = Self.resolvedAppearance()
        let app = XCUIApplication()
        app.launchArguments = [
            "--ui-testing-authenticated",
            "--ui-testing-skip-tutorial",
            "--ui-testing-appearance=\(appearance)",
        ]
        app.launch()

        let discover = tabButton(in: app, labels: ["Discover", "发现"])
        XCTAssertTrue(discover.waitForExistence(timeout: 8))
        discover.tap()
        XCTAssertTrue(app.staticTexts["Library study buddy"].waitForExistence(timeout: 5))
        app.staticTexts["Library study buddy"].tap()
        XCTAssertTrue(app.descendants(matching: .any)["discover-post-detail"].waitForExistence(timeout: 5))
        RunLoop.current.run(until: Date().addingTimeInterval(0.35))
        saveScreenshot(app: app, name: "discover-plan-\(appearance)")

        let share = app.buttons["discover-plan-share"]
        XCTAssertTrue(share.waitForExistence(timeout: 3))
        share.tap()
        XCTAssertTrue(app.descendants(matching: .any)["discover-plan-share-preview"].waitForExistence(timeout: 5))
        RunLoop.current.run(until: Date().addingTimeInterval(0.35))
        saveScreenshot(app: app, name: "discover-plan-share-\(appearance)")
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

        let planRow = app.buttons["plans-row-ui-plan-1"]
        XCTAssertTrue(planRow.waitForExistence(timeout: 5))
        planRow.tap()

        let actions = app.descendants(matching: .any)["plan-card-actions-ui-plan-1"]
        XCTAssertTrue(actions.waitForExistence(timeout: 5))
        XCTAssertLessThanOrEqual(actions.frame.height, 48)
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
        // Stay on Calendar first — do not pass --ui-testing-chats (that forces Chats as initial tab).
        app.launchArguments = [
            "--ui-testing-authenticated",
            "--ui-testing-skip-tutorial",
            "--ui-testing-appearance=\(appearance)",
        ]
        app.launch()

        XCTAssertTrue(tabButton(in: app, labels: ["Calendar", "日历"]).waitForExistence(timeout: 8))
        XCTAssertTrue(app.descendants(matching: .any)["home-week-timetable"].waitForExistence(timeout: 6)
            || app.descendants(matching: .any)["home-date-strip"].waitForExistence(timeout: 6))
        RunLoop.current.run(until: Date().addingTimeInterval(0.45))
        saveScreenshot(app: app, name: "home-\(appearance)")

        tabButton(in: app, labels: ["Discover", "发现"]).tap()
        XCTAssertTrue(
            app.descendants(matching: .any)["discover-list"].waitForExistence(timeout: 5)
                || app.staticTexts["Library study buddy"].waitForExistence(timeout: 5)
        )
        RunLoop.current.run(until: Date().addingTimeInterval(0.35))
        saveScreenshot(app: app, name: "discover-\(appearance)")

        let publish = app.buttons["discover-publish"]
        XCTAssertTrue(publish.waitForExistence(timeout: 5))
        publish.tap()
        XCTAssertTrue(app.descendants(matching: .any)["create-chooser-sheet"].waitForExistence(timeout: 5))
        RunLoop.current.run(until: Date().addingTimeInterval(0.3))
        saveScreenshot(app: app, name: "create-\(appearance)")
        app.buttons["create-chooser-cancel"].tap()
        RunLoop.current.run(until: Date().addingTimeInterval(0.25))

        tabButton(in: app, labels: ["Chats", "消息", "聊天"]).tap()
        // Inbox may be empty without --ui-testing-chats; either list or empty state is fine.
        XCTAssertTrue(
            app.descendants(matching: .any)["inbox-list"].waitForExistence(timeout: 5)
                || app.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", "conversation")).firstMatch
                    .waitForExistence(timeout: 3)
                || app.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", "对话")).firstMatch
                    .waitForExistence(timeout: 3)
                || app.navigationBars.matching(NSPredicate(format: "identifier CONTAINS %@ OR label IN %@", "Chat", ["Chats", "聊天", "消息"])).firstMatch
                    .waitForExistence(timeout: 3)
        )
        RunLoop.current.run(until: Date().addingTimeInterval(0.35))
        saveScreenshot(app: app, name: "chats-\(appearance)")

        tabButton(in: app, labels: ["Me", "我"]).tap()
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
