import XCTest

/// Explicitly gated: creates only a new anonymous QA poll on the real provider.
@MainActor
final class When2meetLiveUITests: XCTestCase {
    private var firstDate = ""
    override func setUpWithError() throws {
        continueAfterFailure = false
        try XCTSkipUnless(ProcessInfo.processInfo.environment["SIDESEAT_WHEN2MEET_LIVE_UI_TESTS"] == "1", "Enable the live When2meet provider check explicitly.")
    }

    private func launch(appearance: String = "light", language: String = "en", large: Bool = false) -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments = ["--ui-testing-authenticated", "--ui-testing-chats", "--ui-testing-skip-tutorial", "--ui-testing-ephemeral-credentials", "--ui-testing-when2meet-live", "--ui-testing-language=\(language)", "--ui-testing-appearance=\(appearance)"]
        if large { app.launchArguments.append("--ui-testing-dynamic-type-accessibility") }
        app.launch()
        let entry = app.buttons["inbox-when2meet"]
        XCTAssertTrue(entry.waitForExistence(timeout: 12)); entry.tap()
        XCTAssertTrue(app.webViews.firstMatch.waitForExistence(timeout: 15))
        return app
    }

    func testCreateDragAutosaveAndReloadTwoParticipantsOnOriginalService() throws {
        let app = launch()
        dismissProviderConsent(in: app)
        let web = app.webViews.firstMatch
        let title = "SideSeat QA \(Int(Date().timeIntervalSince1970))"
        let nameA = title.replacingOccurrences(of: " ", with: "-") + "-A"
        let nameB = title.replacingOccurrences(of: " ", with: "-") + "-B"
        let field = web.textFields["New Event Name"]
        XCTAssertTrue(field.waitForExistence(timeout: 20)); field.tap(); field.typeText(title)
        dismissKeyboard(in: app)
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "Europe/Berlin")!
        let formatter = DateFormatter(); formatter.calendar = calendar; formatter.timeZone = calendar.timeZone; formatter.dateFormat = "yyyy-MM-dd"
        for offset in 2...4 {
            let value = formatter.string(from: calendar.date(byAdding: .day, value: offset, to: Date())!)
            if offset == 2 { firstDate = value }
            let cell = web.switches[value]
            XCTAssertTrue(cell.waitForExistence(timeout: 8), web.debugDescription)
            cell.tap()
        }
        let create = web.buttons["Create Event"]
        scrollTo(create, in: web)
        XCTAssertTrue(create.isHittable); create.tap()
        dismissProviderConsent(in: app)
        XCTAssertTrue(web.textFields["Your name"].waitForExistence(timeout: 25), app.debugDescription)
        signIn(nameA, in: app)
        let cells = ownCells(in: app)
        XCTAssertGreaterThan(cells.count, 12)
        let first = cells.element(boundBy: 0), fourth = cells.element(boundBy: 3)
        scrollTo(first, in: web)
        first.press(forDuration: 0.15, thenDragTo: fourth)
        waitForSave(in: app)
        XCTAssertTrue(waitFacts(in: app) { ($0["own"] as? Int) == 4 && ($0["saveRequests"] as? Int) == 1 }, app.staticTexts["when2meet-live-facts"].label)
        XCTAssertTrue(waitFacts(in: app) { ($0["previewObserved"] as? Bool) == true && ($0["previewVisible"] as? Bool) == true }, "Original provisional drag selection must remain visible before saving.")
        attach(app, "when2meet-original-drag-and-save")

        reopenRecent(in: app)
        signIn(nameB, in: app)
        ownCells(in: app).element(boundBy: 8).tap()
        waitForSave(in: app)
        XCTAssertTrue(waitFacts(in: app) { ($0["maximum"] as? Int) == 1 && ($0["participants"] as? Int) == 2 && ($0["saveRequests"] as? Int) == 1 }, app.staticTexts["when2meet-live-facts"].label)
        attach(app, "when2meet-no-common-time-original-heatmap")
        ownCells(in: app).element(boundBy: 0).tap()
        waitForSave(in: app)
        XCTAssertTrue(waitFacts(in: app) { ($0["maximum"] as? Int) == 2 && ($0["saveRequests"] as? Int) == 2 }, app.staticTexts["when2meet-live-facts"].label)
        attach(app, "when2meet-shared-time-original-heatmap")
        ownCells(in: app).element(boundBy: 0).tap()
        waitForSave(in: app)
        XCTAssertTrue(waitFacts(in: app) { ($0["maximum"] as? Int) == 1 && ($0["own"] as? Int) == 1 && ($0["saveRequests"] as? Int) == 3 })
        ownCells(in: app).element(boundBy: 0).tap()
        waitForSave(in: app)
        XCTAssertTrue(waitFacts(in: app) { ($0["maximum"] as? Int) == 2 && ($0["saveRequests"] as? Int) == 4 })

        // A new WebView and a fresh provider sign-in prove server persistence, not optimistic DOM state.
        app.buttons["when2meet-close"].tap()
        app.buttons["inbox-when2meet"].tap()
        reopenRecent(in: app)
        signIn(nameA, in: app)
        XCTAssertTrue(waitFacts(in: app) { ($0["own"] as? Int) == 4 && ($0["maximum"] as? Int) == 2 && ($0["participants"] as? Int) == 2 })
        attach(app, "when2meet-real-server-reload")
        app.buttons["when2meet-actions"].tap()
        let copy = app.buttons["when2meet-copy"]
        XCTAssertTrue(copy.isEnabled); copy.tap()
        app.buttons["when2meet-actions"].tap()
        let share = app.buttons["when2meet-share"]
        XCTAssertTrue(share.isEnabled); share.tap()
        let systemCopy = app.buttons.matching(NSPredicate(format: "label IN %@", ["Copy", "拷贝", "复制", "Kopieren"])).firstMatch
        XCTAssertTrue(systemCopy.waitForExistence(timeout: 10) || app.otherElements["ActivityListView"].exists)
    }

    func testOriginalCreationPageUsesAppLightDarkAndLargeText() {
        for (appearance, language, large) in [("light", "zh-Hans", false), ("dark", "de", true)] {
            let app = launch(appearance: appearance, language: language, large: large)
            dismissProviderConsent(in: app)
            let label = language == "de" ? "Name der Veranstaltung" : "活动名称"
            XCTAssertTrue(app.webViews.firstMatch.textFields[label].waitForExistence(timeout: 20), app.debugDescription)
            XCTAssertTrue(app.buttons["when2meet-close"].isHittable)
            XCTAssertTrue(waitFacts(in: app) { $0["styled"] as? Bool == true })
            attach(app, "when2meet-\(appearance)-\(language)-\(large ? "large" : "normal")")
            app.buttons["when2meet-close"].tap()
            XCTAssertTrue(app.buttons["inbox-when2meet"].waitForExistence(timeout: 5))
            app.terminate()
        }
    }

    private func ownCells(in app: XCUIApplication) -> XCUIElementQuery {
        app.webViews.firstMatch.switches.matching(NSPredicate(format: "label BEGINSWITH %@", "My availability: " + firstDate))
    }

    private func signIn(_ name: String, in app: XCUIApplication) {
        dismissProviderConsent(in: app)
        let field = app.webViews.firstMatch.textFields["Your name"]
        XCTAssertTrue(field.waitForExistence(timeout: 20)); field.tap(); field.typeText(name)
        dismissKeyboard(in: app)
        let signIn = app.webViews.firstMatch.buttons["Sign In"]
        scrollTo(signIn, in: app.webViews.firstMatch); signIn.tap()
        XCTAssertTrue(ownCells(in: app).firstMatch.waitForExistence(timeout: 15), app.debugDescription)
    }

    private func reopenRecent(in app: XCUIApplication) {
        app.buttons["when2meet-actions"].tap()
        let recent = app.buttons["when2meet-recent"]
        XCTAssertTrue(recent.waitForExistence(timeout: 5)); recent.tap()
        XCTAssertTrue(app.webViews.firstMatch.textFields["Your name"].waitForExistence(timeout: 20))
    }

    private func waitForSave(in app: XCUIApplication) {
        let condition = NSPredicate { _, _ in app.staticTexts["when2meet-live-save"].label == "200" }
        XCTAssertEqual(XCTWaiter.wait(for: [XCTNSPredicateExpectation(predicate: condition, object: app)], timeout: 15), .completed, app.debugDescription)
    }

    private func waitFacts(in app: XCUIApplication, _ check: @escaping ([String: Any]) -> Bool) -> Bool {
        let predicate = NSPredicate { _, _ in
            guard let data = app.staticTexts["when2meet-live-facts"].label.data(using: .utf8), let value = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return false }
            return check(value)
        }
        return XCTWaiter.wait(for: [XCTNSPredicateExpectation(predicate: predicate, object: app)], timeout: 15) == .completed
    }

    private func scrollTo(_ element: XCUIElement, in web: XCUIElement) {
        for _ in 0..<6 where !element.isHittable { web.swipeUp() }
    }

    private func dismissKeyboard(in app: XCUIApplication) {
        let done = app.toolbars.buttons.matching(NSPredicate(format: "label IN %@", ["Done", "完成", "Fertig"])).firstMatch
        if done.exists { done.tap() }
    }

    private func dismissProviderConsent(in app: XCUIApplication) {
        let reject = app.buttons.matching(NSPredicate(format: "label IN %@", ["Reject all", "全部拒绝", "Alle ablehnen"])).firstMatch
        if reject.waitForExistence(timeout: 2) { reject.tap(); return }
        let manage = app.buttons.matching(NSPredicate(format: "label IN %@", ["Manage options", "管理选项", "Optionen verwalten"])).firstMatch
        if manage.waitForExistence(timeout: 3) {
            manage.tap()
            if reject.waitForExistence(timeout: 3) { reject.tap(); return }
        }
        // The provider's EU panel defaults consent switches off; confirm that existing test-profile choice.
        let confirm = app.buttons.matching(NSPredicate(format: "label IN %@", ["Confirm choices", "Confirm my choices", "确认已选择完毕", "Auswahl bestätigen"])).firstMatch
        if confirm.waitForExistence(timeout: 3) { confirm.tap() }
    }

    private func attach(_ app: XCUIApplication, _ name: String) {
        let value = XCTAttachment(screenshot: app.screenshot()); value.name = name; value.lifetime = .keepAlways; add(value)
    }
}
