import XCTest

/// Captures Auth + 5-tab screenshots for design-freeze visual QA (README §8).
/// Appearance is controlled by the host via `simctl ui appearance` + `VISUAL_QA_APPEARANCE`.
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
    private func captureAuth(appearance: String) {
        let app = XCUIApplication()
        app.launchArguments = [
            "--ui-testing-signed-out",
            "--ui-testing-skip-tutorial",
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
        // Stay on Home first — do not pass --ui-testing-chats (that forces Chats as initial tab).
        app.launchArguments = [
            "--ui-testing-authenticated",
            "--ui-testing-skip-tutorial",
        ]
        app.launch()

        XCTAssertTrue(tabButton(in: app, labels: ["Home", "首页"]).waitForExistence(timeout: 8))
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

        tabButton(in: app, labels: ["Create", "发布"]).tap()
        XCTAssertTrue(
            app.buttons["create-buddy-post"].waitForExistence(timeout: 4)
                || app.buttons.matching(NSPredicate(format: "label IN %@", ["Find buddies", "找搭子"])).firstMatch
                    .waitForExistence(timeout: 4)
        )
        RunLoop.current.run(until: Date().addingTimeInterval(0.3))
        saveScreenshot(app: app, name: "create-\(appearance)")
        if app.buttons.matching(NSPredicate(format: "label IN %@", ["Cancel", "取消"])).firstMatch.exists {
            app.buttons.matching(NSPredicate(format: "label IN %@", ["Cancel", "取消"])).firstMatch.tap()
        } else {
            app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.12)).tap()
        }
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
        return repoRoot.appendingPathComponent("docs/ios-native/visual-qa", isDirectory: true)
    }

    /// Host script writes `docs/ios-native/visual-qa/.appearance` (light|dark) before each run.
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
