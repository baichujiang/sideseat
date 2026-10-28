import XCTest
import Darwin

/// Fresh owned accounts only. Providers stop at their existing return/cancel boundary.
@MainActor final class FiveRootMeSettingsUITests: XCTestCase {
    private struct Account: Decodable { let role: String; let id: String; let identifier: String; let password: String }
    private struct SettingsSeed: Decodable { let appVersion: String; let servedCities: [String]; let cityLabels: [String: [String]] }
    private struct Preparation: Decodable { let schemaVersion: Int; let runID: String; let preparedAt: String; let build: Int; let settings: SettingsSeed }
    private struct Fixture: Decodable { let kind: String; let schemaVersion: Int; let runID: String; let baseURL: String; let bundle: String; let accounts: [Account]; let me: Preparation }
    private var fixture: Fixture!, app: XCUIApplication!
    override func setUpWithError() throws {
        continueAfterFailure = false
        try XCTSkipUnless(ProcessInfo.processInfo.environment["SIDESEAT_ME_EXECUTE"] == "1", "Require explicit fresh Me Settings execution.")
    }
    override func tearDown() async throws { await MainActor.run { app?.terminate() } }

    func testSettingsProviderBoundariesAndTutorialPersistence() throws {
        try loadFixture(); try login(); try openMe(); try openSettings(); try phase("baseline")
        try verifyAbout()
        try settingsTap("settings-share-sideseat")
        try require(element("sideseat-app-share-preview").waitForExistence(timeout: 15), "Open the actual SideSeat invite preview.")
        try require(element("sideseat-app-share-card").exists, "The preview contains the actual rendered card.")
        try capture("01-share-preview"); try tap(app.buttons["sideseat-app-share-done"])
        try require(element("sideseat-app-share-preview").waitForNonExistence(timeout: 15), "Done returns without sharing.")
        try phase("about-and-preview")
        try settingsTap("settings-share-sideseat"); try tap(app.buttons["sideseat-app-share-system"])
        try cancelSystemShare()
        try require(app.buttons["sideseat-app-share-system"].isHittable, "Cancel the system panel back to the same preview.")
        try tap(app.buttons["sideseat-app-share-done"])
        try require(element("sideseat-app-share-preview").waitForNonExistence(timeout: 15), "The actual preview must close.")
        try capture("02-system-share-cancelled"); try phase("system-share-cancelled")

        try settingsTap("settings-privacy")
        try require(waitUntil(timeout: 15) { self.app.state != .runningForeground }, "Privacy hands off to the browser.")
        app.activate(); try require(waitUntil(timeout: 15) { self.app.state == .runningForeground && self.element("settings-root").exists }, "Return from Privacy to the original Settings route.")
        try phase("privacy-returned")
        try checkCity(); try phase("city-restored")
        try checkNotifications(); try phase("notifications-checked")

        try settingsTap("settings-replay-tutorial")
        try require(app.buttons["product-tutorial-skip"].waitForExistence(timeout: 15), "The real replay tutorial must open.")
        try require(element("product-tutorial-progress").label.contains("1"), "Replay begins at its first step.")
        try capture("03-tutorial-opened"); try tap(app.buttons["product-tutorial-skip"])
        try require(element("product-tutorial").waitForNonExistence(timeout: 15), "Close dismisses the real tutorial.")
        try phase("tutorial-closed")
        try login(skipTutorial: false); try require(!element("product-tutorial").exists, "The dismissed tutorial stays dismissed after real relogin.")
        try openMe(); try openSettings(); try settingsTap("settings-replay-tutorial")
        try require(app.buttons["product-tutorial-next"].waitForExistence(timeout: 15), "Replay can be opened again after dismissal.")
        try tap(app.buttons["product-tutorial-next"]); try tap(app.buttons["product-tutorial-back"])
        try require(element("product-tutorial-progress").label.contains("1"), "Back returns to the first tutorial step.")
        for _ in 0..<4 { try tap(app.buttons["product-tutorial-next"]) }
        try require(app.buttons["product-tutorial-done"].waitForExistence(timeout: 10), "All five actual tutorial steps reach Done.")
        try capture("04-tutorial-last-step"); try tap(app.buttons["product-tutorial-done"])
        try require(element("product-tutorial").waitForNonExistence(timeout: 15), "Done exits the complete tutorial.")
        try phase("tutorial-completed")

        try login(skipTutorial: false); try require(!element("product-tutorial").exists, "The completed tutorial must remain dismissed.")
        try openMe(); try meTap("me-membership")
        try require(element("membership-free").waitForExistence(timeout: 20), "The fresh owned account remains Free.")
        let code = input("membership-code")
        try require(code.exists && textValue(code).isEmpty && !app.buttons["membership-redeem"].isEnabled, "An empty invitation code cannot redeem Plus.")
        try capture("05-membership-empty-disabled"); try doneSheet()
        try require(element("me-profile").waitForExistence(timeout: 15) && !element("membership-code").exists, "Return without redeeming any code.")
        try phase("membership-cancelled")

        try meTap("me-verification")
        try require(element("student-verification-sheet").waitForExistence(timeout: 15), "Open actual school verification.")
        let email = input("student-verification-email")
        try require(email.exists && textValue(email).isEmpty, "The owned unverified account starts with no verification email draft.")
        try tap(email); email.typeText("not-an-email")
        try require(textValue(email) == "not-an-email" && !app.buttons["student-verification-submit"].isEnabled, "Invalid text cannot send a verification request.")
        try capture("06-verification-invalid-disabled"); try doneSheet()
        try require(element("student-verification-sheet").waitForNonExistence(timeout: 15), "Leave without requesting email or choosing proof.")
        try phase("verification-cancelled")

        try meTap("me-intention-history")
        try require(element("intention-history-empty").waitForExistence(timeout: 20), "This fresh account has no past intentions.")
        try capture("07-empty-history"); try back(to: "me-profile")
        try meTap("me-courses"); try require(element("courses-list").waitForExistence(timeout: 20), "The existing course-management entrance must open.")
        try back(to: "me-profile"); try phase("entries-returned")
        try login(skipTutorial: false); try require(!element("product-tutorial").exists, "Final relogin preserves tutorial completion.")
        try openMe(); try capture("08-final-me"); try phase("complete")
    }

    private func loadFixture() throws {
        try require(ProcessInfo.processInfo.environment["SIMULATOR_UDID"] == nil, "Use only the default physical iPhone14Plus.")
        fixture = try JSONDecoder().decode(Fixture.self, from: Data((ProcessInfo.processInfo.environment["SIDESEAT_FIVE_ROOT_FIXTURE_JSON"] ?? "").utf8))
        try require(fixture.kind == "five-roots-live" && fixture.schemaVersion == 1 && fixture.baseURL == "https://api.sideseat.de" && fixture.bundle == "app.sideseat.mobile.preview", "Use only the current production origin and Preview.")
        try require(fixture.runID.range(of: "^[a-f0-9]{12}$", options: .regularExpression) != nil && fixture.accounts.count == 2 && Set(fixture.accounts.map(\.role)) == ["owner", "peer"] && Set(fixture.accounts.map(\.id)).count == 2, "Use exactly the fresh owned pair.")
        try require(fixture.accounts.allSatisfy { $0.identifier == "e2e_roots_\($0.role)_\(fixture.runID)" && $0.password.count >= 24 }, "Only this cohort's credentials are permitted.")
        let date = try XCTUnwrap(preparedDate(fixture.me.preparedAt))
        let expectedBuild = try XCTUnwrap(Int(ProcessInfo.processInfo.environment["SIDESEAT_QA_UI_BUILD"] ?? ""), "Provide the exact expected Preview build explicitly.")
        try require(expectedBuild > 0 && fixture.me.schemaVersion == 1 && fixture.me.runID == fixture.runID && fixture.me.build == expectedBuild && Date().timeIntervalSince(date) >= -300 && Date().timeIntervalSince(date) < 14_400, "Require the exact fresh preparation matching the expected Preview build.")
        try require(fixture.me.settings.appVersion == "1.0.0" && !fixture.me.settings.servedCities.isEmpty && fixture.me.settings.servedCities.allSatisfy { !(fixture.me.settings.cityLabels[$0] ?? []).isEmpty }, "Use the real served-city configuration and product version.")
    }
    private func login(skipTutorial: Bool = true) throws {
        let owner = try XCTUnwrap(fixture.accounts.first { $0.role == "owner" })
        app?.terminate(); app = XCUIApplication(bundleIdentifier: fixture.bundle)
        app.launchArguments = ["--ui-testing-signed-out", "--ui-testing-ephemeral-credentials", "-UIPreferredContentSizeCategoryName", "UICTContentSizeCategoryL"] + (skipTutorial ? ["--ui-testing-skip-tutorial"] : [])
        app.launchEnvironment = [:]; app.launch()
        let name = app.textFields["login-identifier"], password = app.secureTextFields["login-password"]
        try require(name.waitForExistence(timeout: 25), "Use the actual login form.")
        name.tap(); name.typeText(owner.identifier); password.tap(); password.typeText(owner.password); app.buttons["login-submit"].tap()
        try require(waitUntil(timeout: 35) { self.app.state == .runningForeground && !name.exists && !password.exists && self.app.tabBars.firstMatch.exists && self.app.tabBars.firstMatch.buttons.count == 5 }, "Wait for the complete real five-tab shell.")
    }
    private func openMe() throws { try tap(app.tabBars.buttons.element(boundBy: 4)); try require(app.buttons["me-hero-edit"].waitForExistence(timeout: 25), "Load this owned profile.") }
    private func openSettings() throws { try meTap("me-settings"); try require(element("settings-root").waitForExistence(timeout: 15), "Open the current Settings route.") }
    private func verifyAbout() throws {
        let fields = [(["Version", "版本"], fixture.me.settings.appVersion), (["Build", "构建号", "Build-Nummer"], String(fixture.me.build))]
        let allTitles = fields.flatMap { $0.0 }
        for (labels, expected) in fields {
            try revealAboutText(elementMatchingLabels(labels))
            let root = element("settings-root"), clip = aboutViewport()
            let rows = root.cells.containing(NSPredicate(format: "label IN %@", labels)).allElementsBoundByIndex.filter {
                $0.exists && $0.frame.width > 0 && $0.frame.height > 0 && clip.contains($0.frame)
            }
            try require(app.state == .runningForeground && root.exists && !app.textFields["login-identifier"].exists && !app.secureTextFields["login-password"].exists,
                "Record only the owned Settings route, never credentials.")
            let evidence = XCTAttachment(string: rows.count == 1 ? rows[0].debugDescription : root.debugDescription)
            evidence.name = "me-settings-about-row-private-AX-" + expected; evidence.lifetime = .keepAlways; add(evidence)
            let image = XCTAttachment(screenshot: app.screenshot())
            image.name = "me-settings-about-row-" + expected; image.lifetime = .keepAlways; add(image)
            try require(rows.count == 1, "Read the unique fully visible Settings Cell containing the exact About title.")
            let row = try XCTUnwrap(rows.first), rowFrame = row.frame
            let titles = row.descendants(matching: .any).matching(NSPredicate(format: "label IN %@", labels)).allElementsBoundByIndex
            let otherTitles = row.descendants(matching: .any).matching(NSPredicate(format: "label IN %@", allTitles.filter { !labels.contains($0) })).allElementsBoundByIndex
            try require(titles.count == 1 && otherTitles.isEmpty, "The actual Cell must represent only this About field, not the whole section.")
            let nodes = ([row] + row.descendants(matching: .any).allElementsBoundByIndex).filter {
                $0.exists && $0.frame.width > 0 && $0.frame.height > 0 && rowFrame.contains($0.frame) && clip.contains($0.frame)
            }
            try require(nodes.contains { $0.value as? String == expected || aboutLabel($0.label, titles: labels, equals: expected) },
                "This exact About Cell must expose the installed product version or build without any global value match.")
        }
    }
    private func aboutLabel(_ label: String, titles: [String], equals expected: String) -> Bool {
        let text = label.trimmingCharacters(in: .whitespacesAndNewlines)
        if text == expected { return true }
        let separators = CharacterSet.whitespacesAndNewlines.union(CharacterSet(charactersIn: ",:，：、"))
        return titles.contains { title in
            guard text.hasPrefix(title), text.hasSuffix(expected) else { return false }
            let between = String(text.dropFirst(title.count).dropLast(expected.count))
            return !between.isEmpty && between.unicodeScalars.allSatisfy { separators.contains($0) }
        }
    }
    private func aboutViewport() -> CGRect {
        var clip = element("settings-root").frame.intersection(app.windows.firstMatch.frame)
        if app.navigationBars.firstMatch.exists {
            let top = max(clip.minY, app.navigationBars.firstMatch.frame.maxY)
            clip = CGRect(x: clip.minX, y: top, width: clip.width, height: max(0, clip.maxY - top))
        }
        if app.tabBars.firstMatch.exists {
            let bottom = min(clip.maxY, app.tabBars.firstMatch.frame.minY)
            clip = CGRect(x: clip.minX, y: clip.minY, width: clip.width, height: max(0, bottom - clip.minY))
        }
        return clip
    }
    private func revealAboutText(_ target: XCUIElement) throws {
        let root = element("settings-root")
        try require(root.elementType == .collectionView, "Read About on its actual Settings collection surface.")
        for upward in [true, false] {
            for _ in 0..<16 {
                if target.exists && target.frame.width > 0 && target.frame.height > 0 && aboutViewport().contains(target.frame) { return }
                if upward { root.swipeUp(velocity: .slow) } else { root.swipeDown(velocity: .slow) }
            }
        }
        try require(false, "The read-only About text must be fully visible; no clickable state is required.")
    }
    private func checkCity() throws {
        let picker = element("settings-discover-city-picker")
        if fixture.me.settings.servedCities.count == 1 {
            let city = element("settings-discover-city"); try reveal(city, root: "settings-root")
            try require(city.exists && !picker.exists, "A single configured city is read-only.")
            print("ME_SETTINGS_SCOPE city-single-configured-read-only"); return
        }
        try reveal(picker, root: "settings-root")
        let original = try XCTUnwrap(picker.value as? String)
        let labels = Set(fixture.me.settings.cityLabels.values.flatMap { $0 })
        try require(labels.contains(original), "Read the current actual configured city before changing it.")
        let alternatives = labels.filter { $0 != original }
        try tap(picker)
        let options = app.buttons.matching(NSPredicate(format: "label IN %@", Array(alternatives))).allElementsBoundByIndex.filter { $0.isEnabled && $0.isHittable }
        try require(!options.isEmpty, "At least one configured alternative must be visible in the real Picker menu.")
        let choice = options[0], selected = choice.label; try tap(choice)
        try require(waitUntil { picker.value as? String == selected }, "The selected city applies immediately.")
        try login(); try openMe(); try openSettings()
        let restoredPicker = element("settings-discover-city-picker")
        try reveal(restoredPicker, root: "settings-root")
        try require(restoredPicker.value as? String == selected, "The device-local city survives relogin.")
        try tap(restoredPicker); try tap(app.buttons.matching(NSPredicate(format: "label == %@", original)).firstMatch)
        try require(waitUntil { restoredPicker.value as? String == original }, "Restore the exact original city.")
        print("ME_SETTINGS_SCOPE city-multiple-switched-relogin-restored")
    }
    private func checkNotifications() throws {
        let button = app.buttons["settings-notifications"]; try reveal(button, root: "settings-root")
        let original = try XCTUnwrap(button.value as? String)
        if ["Set up", "设置", "Einrichten"].contains(original) {
            print("ME_SETTINGS_SCOPE notifications-setup-shown-no-permission-change"); return
        }
        try require(["On", "Off", "开", "关", "An", "Aus"].contains(original), "Use only a known existing notification status.")
        let preferences = XCUIApplication(bundleIdentifier: "com.apple.Preferences")
        try tap(button); try require(waitUntil(timeout: 15) { self.app.state != .runningForeground && preferences.state == .runningForeground }, "An existing permission opens system Settings.")
        app.activate(); try require(waitUntil(timeout: 15) { self.app.state == .runningForeground && preferences.state != .runningForeground }, "Return without changing system authorization.")
        try require(element("settings-root").exists && button.value as? String == original, "The displayed notification authorization stays unchanged.")
        print("ME_SETTINGS_SCOPE notifications-existing-settings-open-return-no-change")
    }
    private func cancelSystemShare() throws {
        let query = app.buttons.matching(NSPredicate(format: "identifier == 'Close' OR label IN %@", ["关闭", "Close", "Schließen", "取消", "Cancel", "Abbrechen"]))
        try require(waitUntil(timeout: 15) { query.allElementsBoundByIndex.filter { $0.isEnabled && $0.frame.width > 0 && $0.frame.height > 0 && self.app.windows.firstMatch.frame.contains($0.frame) && $0.isHittable }.count == 1 }, "The actual system share panel must expose exactly one visible cancel/close action.")
        let close = try XCTUnwrap(query.allElementsBoundByIndex.first { $0.isEnabled && $0.frame.width > 0 && self.app.windows.firstMatch.frame.contains($0.frame) && $0.isHittable })
        try tap(close)
    }
    private func doneSheet() throws { try tap(app.navigationBars.buttons.matching(NSPredicate(format: "label IN %@", ["完成", "Done", "Fertig"])).firstMatch) }
    private func back(to id: String) throws { try tap(app.navigationBars.buttons.element(boundBy: 0)); try require(element(id).waitForExistence(timeout: 15), "Return to the exact original route.") }
    private func meTap(_ id: String) throws { let e = app.buttons[id]; try reveal(e, root: "me-profile"); try tap(e) }
    private func settingsTap(_ id: String) throws { let e = app.buttons[id]; try reveal(e, root: "settings-root"); try tap(e) }
    private func element(_ id: String) -> XCUIElement { app.descendants(matching: .any).matching(identifier: id).firstMatch }
    private func elementMatchingLabels(_ labels: [String]) -> XCUIElement { element("settings-root").descendants(matching: .any).matching(NSPredicate(format: "label IN %@", labels)).firstMatch }
    private func input(_ id: String) -> XCUIElement { let f = app.textFields[id]; return f.exists ? f : app.textViews[id] }
    private func textValue(_ field: XCUIElement) -> String { let v = field.value as? String ?? ""; return v == field.placeholderValue ? "" : v }
    private func reveal(_ target: XCUIElement, root id: String) throws {
        let root = element(id)
        let scroll: XCUIElement
        if [.collectionView, .table, .scrollView].contains(root.elementType) { scroll = root }
        else if root.collectionViews.firstMatch.exists { scroll = root.collectionViews.firstMatch }
        else if root.tables.firstMatch.exists { scroll = root.tables.firstMatch }
        else { scroll = root.scrollViews.firstMatch }
        for direction in [true, false] {
            for _ in 0..<16 {
                if target.exists && target.frame.width > 0 && app.windows.firstMatch.frame.contains(target.frame) && target.isHittable { return }
                try require(scroll.exists, "Use the actual current route's scroll surface.")
                if direction { scroll.swipeUp(velocity: .slow) } else { scroll.swipeDown(velocity: .slow) }
            }
        }
        try require(false, "The requested visible Settings control could not be reached.")
    }
    private func tap(_ target: XCUIElement) throws {
        try require(target.waitForExistence(timeout: 15) && target.isEnabled && target.isHittable, "Use the real visible enabled control."); target.tap()
    }
    private func waitUntil(timeout: TimeInterval = 25, _ condition: () -> Bool) -> Bool {
        let deadline = Date().addingTimeInterval(timeout)
        repeat { if condition() { return true }; RunLoop.current.run(until: Date().addingTimeInterval(0.2)) } while Date() < deadline
        return condition()
    }
    private func preparedDate(_ value: String) -> Date? { let f = ISO8601DateFormatter(); f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]; return f.date(from: value) ?? ISO8601DateFormatter().date(from: value) }
    private func phase(_ name: String) throws { print("ME_SETTINGS_PHASE \(name)"); fflush(stdout); try FiveRootQAReadBarrier.wait(for: name) }
    private func capture(_ name: String) throws {
        try require(app.state == .runningForeground && !app.textFields["login-identifier"].exists && !app.secureTextFields.firstMatch.exists, "Capture only this owned App UI, never credentials or external provider content.")
        let a = XCTAttachment(screenshot: app.screenshot()); a.name = "me-settings-" + name; a.lifetime = .keepAlways; add(a)
    }
    private func require(_ value: Bool, _ message: String) throws { guard value else { XCTFail(message); throw NSError(domain: "MeSettingsQA", code: 1) } }
}
