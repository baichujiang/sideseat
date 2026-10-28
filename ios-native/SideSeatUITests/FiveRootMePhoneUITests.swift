import XCTest
import Darwin

/// Owned disposable accounts only. All profile and account writes use the real App UI.
/// The companion observer performs GET requests only; providers stop at their cancel boundary.
@MainActor final class FiveRootMePhoneUITests: XCTestCase {
    private struct Account: Decodable {
        let role: String; let id: String; let identifier: String; let password: String
    }
    private struct Preparation: Decodable { let schemaVersion: Int; let runID: String; let preparedAt: String }
    private struct Fixture: Decodable {
        let kind: String; let schemaVersion: Int; let runID: String; let baseURL: String
        let bundle: String; let accounts: [Account]; let me: Preparation
    }
    private var fixture: Fixture!
    private var app: XCUIApplication!
    private let languageTags = ["CHINESE", "ENGLISH", "GERMAN", "FRENCH", "HINDI", "SPANISH", "OTHER"]
    private var editedName: String { "Me QA " + fixture.runID.prefix(6) }
    private var editedBio: String { "我的资料保存验收 " + fixture.runID }

    override func setUpWithError() throws {
        continueAfterFailure = false
        try XCTSkipUnless(ProcessInfo.processInfo.environment["SIDESEAT_ME_EXECUTE"] == "1", "Require explicit fresh owned Me execution.")
    }
    override func tearDown() async throws { await MainActor.run { app?.terminate() } }

    private func loadFixture() throws {
        try require(ProcessInfo.processInfo.environment["SIDESEAT_ME_EXECUTE"] == "1",
            "Me execution remains gated until Messages acceptance is complete.")
        let raw = ProcessInfo.processInfo.environment["SIDESEAT_FIVE_ROOT_FIXTURE_JSON"] ?? ""
        try require(raw.hasPrefix("{"), "Embed this stage's owned Me fixture before running; no placeholder or login fallback is allowed.")
        fixture = try JSONDecoder().decode(Fixture.self, from: Data(raw.utf8))
        try require(fixture.kind == "five-roots-live" && fixture.schemaVersion == 1,
            "Only the disposable five-root fixture is permitted.")
        try require(fixture.baseURL == "https://api.sideseat.de" && fixture.bundle == "app.sideseat.mobile.preview",
            "Use the explicitly selected Preview App and production API.")
        try require(fixture.runID.range(of: "^[a-f0-9]{12}$", options: .regularExpression) != nil,
            "The owned run identity must be valid.")
        try require(fixture.accounts.count == 2 && Set(fixture.accounts.map(\.role)) == ["owner", "peer"]
            && Set(fixture.accounts.map(\.id)).count == 2, "Use the two distinct owned accounts.")
        try require(fixture.accounts.allSatisfy {
            $0.identifier == "e2e_roots_\($0.role)_\(fixture.runID)" && !$0.id.isEmpty && $0.password.count >= 24
        }, "Never use ordinary identities in these destructive account tests.")
        let prepared = try XCTUnwrap(Self.preparedDate(fixture.me.preparedAt), "Parse the actual JavaScript millisecond ISO preparation timestamp.")
        try require(fixture.me.schemaVersion == 1 && fixture.me.runID == fixture.runID
            && Date().timeIntervalSince(prepared) >= -300 && Date().timeIntervalSince(prepared) < 14_400, "Use only this fresh prepared Me cohort.")
        try require(ProcessInfo.processInfo.environment["SIMULATOR_UDID"] == nil,
            "This runner is prepared for the default physical iPhone 14 Plus.")
    }

    func test01ProfileAndLanguagesSaveCancelRelaunchAndRestore() throws {
        try loadFixture(); try login(); try openMe()
        try phase("signed-in")
        try openEditor()
        let originalName = textValue(input("profile-edit-nickname"))
        let originalBio = textValue(input("profile-edit-tagline"))
        try require((2...32).contains(originalName.count), "The fresh baseline needs a restorable nonempty nickname.")
        try replaceText(input("profile-edit-nickname"), with: editedName)
        try replaceText(input("profile-edit-tagline"), with: editedBio)
        try finishProfileInput(); try saveEditor()
        try require(app.staticTexts["me-display-name-visual"].firstMatch.label == editedName, "The hero must show the saved QA nickname.")
        try capture("01-profile-saved"); try phase("profile-saved")

        try login(); try openMe(); try openEditor()
        try require(textValue(input("profile-edit-nickname")) == editedName && textValue(input("profile-edit-tagline")) == editedBio,
            "Both saved fields must survive a fresh real form login.")
        try replaceText(input("profile-edit-nickname"), with: "Unsaved " + fixture.runID.prefix(6))
        try finishProfileInput(); try tap(app.buttons["profile-edit-close"], minimumHeight: 35.99)
        try require(element("profile-edit-discard-prompt").waitForExistence(timeout: 8), "Unsaved changes need the existing discard prompt.")
        try tapPrompt("profile-edit-keep-editing")
        try require(textValue(input("profile-edit-nickname")).hasPrefix("Unsaved "), "Keep editing must preserve the local draft.")
        try tap(app.buttons["profile-edit-close"], minimumHeight: 35.99); try tapPrompt("profile-edit-discard")
        try require(element("profile-edit").waitForNonExistence(timeout: 10), "Discard must close without saving.")
        try openEditor()
        try require(textValue(input("profile-edit-nickname")) == editedName && textValue(input("profile-edit-tagline")) == editedBio,
            "Discarding must keep the previously saved values.")
        try phase("profile-cancelled")
        try replaceText(input("profile-edit-nickname"), with: originalName)
        try replaceText(input("profile-edit-tagline"), with: originalBio)
        try finishProfileInput(); try saveEditor(); try phase("profile-restored")

        try openLanguages()
        let originalTags = selectedLanguages()
        try require(!originalTags.isEmpty, "Prepare at least one baseline language so it can be restored without changing profile rules.")
        let addedTag = try XCTUnwrap(languageTags.first { !originalTags.contains($0) },
            "The fresh baseline must leave one language unselected for the reversible addition.")
        try tapLanguage(addedTag)
        try require(selectedLanguages() == originalTags.union([addedTag]), "The additional language must be selected locally.")
        try tap(app.buttons["coordination-languages-save"], minimumHeight: 35.99)
        try require(element("me-coordination-languages").waitForNonExistence(timeout: 20), "The language save must finish.")
        try phase("languages-saved")
        try login(); try openMe(); try openLanguages()
        try require(selectedLanguages() == originalTags.union([addedTag]), "The saved language set must survive real relogin.")
        try tapLanguage(addedTag)
        try tap(app.buttons["coordination-languages-cancel"], minimumHeight: 35.99)
        try openLanguages()
        try require(selectedLanguages() == originalTags.union([addedTag]), "Cancel must not remove a saved language.")
        try phase("languages-cancelled")
        try tapLanguage(addedTag); try tap(app.buttons["coordination-languages-save"], minimumHeight: 35.99)
        try require(element("me-coordination-languages").waitForNonExistence(timeout: 20), "Restore must save successfully.")
        try openLanguages(); try require(selectedLanguages() == originalTags, "The exact original language tags must be restored.")
        try tap(app.buttons["coordination-languages-cancel"], minimumHeight: 35.99)
        try capture("02-profile-and-languages-restored"); try phase("languages-restored")
    }

    func test02PrivacyPreferencesAndSettingsCancelBoundaries() throws {
        try loadFixture(); try login(); try openMe(); try openPrivacy()
        let contact = app.switches["profile-privacy-contact-exchange"]
        let originalContact = contact.value as? String
        try require(originalContact == "0" || originalContact == "1", "The native contact privacy toggle must expose its actual state.")
        try tap(contact); try require(contact.value as? String != originalContact, "The draft privacy state must change.")
        try tap(app.buttons["profile-sheet-close"], minimumHeight: 35.99)
        try openPrivacy(); try require(contact.value as? String == originalContact, "Cancel must not save privacy changes.")
        try phase("privacy-cancelled")
        try tap(contact); try tap(app.buttons["profile-privacy-save"], minimumHeight: 35.99)
        try require(element("profile-privacy").waitForNonExistence(timeout: 20), "The real privacy save must finish.")
        try phase("privacy-saved")
        try login(); try openMe(); try openPrivacy()
        try require(contact.value as? String != originalContact, "The saved toggle must survive real form login.")
        try tap(contact); try tap(app.buttons["profile-privacy-save"], minimumHeight: 35.99)
        try require(element("profile-privacy").waitForNonExistence(timeout: 20), "The original privacy value must save.")
        try phase("privacy-restored")

        // These preferences apply immediately. Do not mask them with UI-testing appearance/language overrides.
        try openSettings()
        let theme = element("settings-app-theme")
        try reveal(theme)
        let originalTheme = try themeID(for: theme.value as? String ?? "")
        let changedTheme = originalTheme == "dark" ? "light" : "dark"
        try selectTheme(changedTheme)
        try require(try themeID(for: theme.value as? String ?? "") == changedTheme, "The chosen theme must apply immediately.")
        try login(); try openMe(); try openSettings(); try reveal(theme)
        try require(try themeID(for: theme.value as? String ?? "") == changedTheme, "The device theme preference must survive relaunch.")
        try capture("03-local-theme-changed")
        try selectTheme(originalTheme)
        try tapSettings("settings-language")
        let originalAppLanguage = try selectedAppLanguage()
        let alternative = originalAppLanguage == "en" ? "de" : "en"
        try tap(app.buttons["app-language-\(alternative)"])
        try require(try selectedAppLanguage() == alternative, "App language must change immediately.")
        try login(); try openMe(); try openSettings(); try tapSettings("settings-language")
        try require(try selectedAppLanguage() == alternative, "The actual language preference must survive relaunch.")
        try tap(app.buttons["app-language-\(originalAppLanguage)"])
        try require(try selectedAppLanguage() == originalAppLanguage, "Restore the user's exact original language preference.")
        try back(to: "settings-root")
        try reveal(theme); try require(try themeID(for: theme.value as? String ?? "") == originalTheme,
            "Changing language must not lose the restored theme preference.")
        try phase("preferences-restored")

        try tapSettings("settings-blocked-users")
        try require(element("blocked-users-empty").waitForExistence(timeout: 20), "The fresh owned account must have an empty blocked list.")
        try back(to: "settings-root")
        try tapSettings("settings-feedback")
        try require(element("feedback-root").waitForExistence(timeout: 20), "The existing feedback entrance must open.")
        try tap(app.buttons["feedback-compose"], minimumHeight: 35.99)
        try require(element("feedback-compose-sheet").waitForExistence(timeout: 10), "Open only a new synthetic feedback draft.")
        try replaceText(input("feedback-title"), with: "QA cancelled " + fixture.runID.prefix(6))
        try replaceText(input("feedback-message"), with: "This disposable QA draft is cancelled without sending.")
        try cancelNavigationSheet()
        try require(element("feedback-compose-sheet").waitForNonExistence(timeout: 10), "Cancel must dismiss the feedback draft without sending it.")
        // Do not screenshot or inspect other people's feedback rows.
        try back(to: "settings-root"); try phase("feedback-cancelled")

        try tapSettings("settings-support-web")
        try require(waitUntil { self.app.state != .runningForeground }, "Help must hand off to the external browser.")
        app.activate(); try require(element("settings-root").waitForExistence(timeout: 15), "Return from the help boundary without provider actions.")
        try back(to: "me-profile")
        try tapMe("me-personalization")
        try require(element("appearance-preview").waitForExistence(timeout: 20), "The current personalization preview must open.")
        try require(!app.buttons["appearance-save"].isEnabled, "Opening the preview must not change the saved style.")
        try cancelNavigationSheet()
        try require(element("appearance-preview").waitForNonExistence(timeout: 10), "Cancel personalization without changing the style.")
        try tapMe("me-membership")
        try require(app.navigationBars.buttons.matching(NSPredicate(format: "label IN %@", ["完成", "Done", "Fertig"])).firstMatch.waitForExistence(timeout: 20),
            "Membership must have a non-purchasing return boundary.")
        try tap(app.navigationBars.buttons.matching(NSPredicate(format: "label IN %@", ["完成", "Done", "Fertig"])).firstMatch, minimumHeight: 35.99)
        try require(element("me-profile").waitForExistence(timeout: 10), "Return to Me without starting a purchase.")
        try capture("04-settings-boundaries-returned"); try phase("settings-boundaries-returned")
    }

    /// Run last: deleting the owned owner is intentional, and the observer requires its old bearer to return 401.
    func test03LogoutReloginCancelDeletionAndDeleteOwnedAccount() throws {
        try loadFixture(); try login(); try openMe(); try openSettings()
        try tapSettings("settings-logout")
        try require(app.textFields["login-identifier"].waitForExistence(timeout: 20), "A real logout must return to the real login form.")
        try phase("logged-out")
        try enterCredentials(); try openMe()
        try require(app.staticTexts["me-username-visual"].firstMatch.label.contains(try owner().identifier), "Relogin must restore this exact owned identity.")
        try phase("relogged-in")
        try openSettings(); try tapSettings("settings-delete-account")
        try require(element("delete-account-sheet").waitForExistence(timeout: 10), "Open the existing account deletion confirmation.")
        try require(!app.buttons["delete-account-submit"].isEnabled, "Deletion must start disabled before explicit understanding and exact username.")
        try tap(app.buttons["delete-account-cancel"], minimumHeight: 35.99)
        try require(element("delete-account-sheet").waitForNonExistence(timeout: 10), "Cancel must keep the owned account.")
        try phase("delete-cancelled")
        try tapSettings("settings-delete-account")
        let understood = app.switches["delete-account-understood"]
        try reveal(understood); try tap(understood)
        let confirm = app.textFields["delete-account-confirm"]
        try reveal(confirm); try replaceText(confirm, with: try owner().identifier)
        try require(app.buttons["delete-account-submit"].isEnabled, "Only the explicit owned username may enable permanent deletion.")
        try tap(app.buttons["delete-account-submit"], minimumHeight: 35.99)
        try require(app.textFields["login-identifier"].waitForExistence(timeout: 30), "Deleting only this owned QA account must return to signed out.")
        try phase("account-deleted")
    }

    private func login() throws {
        app?.terminate(); app = XCUIApplication(bundleIdentifier: fixture.bundle)
        app.launchArguments = ["--ui-testing-signed-out", "--ui-testing-ephemeral-credentials", "--ui-testing-skip-tutorial"]
        app.launchEnvironment = [:]; app.launch(); try enterCredentials()
    }
    private func enterCredentials() throws {
        let user = try owner(), identifier = app.textFields["login-identifier"]
        try require(identifier.waitForExistence(timeout: 25), "Use the actual sign-in form; no injected authenticated session.")
        try replaceText(identifier, with: user.identifier)
        let password = app.secureTextFields["login-password"]
        try require(password.exists, "The actual password field must exist.")
        password.tap(); password.typeText(user.password); app.buttons["login-submit"].tap()
        try require(waitUntil(timeout: 35) { self.app.state == .runningForeground && !identifier.exists && !password.exists
            && self.app.tabBars.firstMatch.exists && self.app.tabBars.firstMatch.buttons.count == 5 }, "The owned account must reach the actual ready five-tab shell without either login input.")
    }
    private func openMe() throws {
        try require(app.tabBars.buttons.count == 5, "Use the actual five-tab shell.")
        try tap(app.tabBars.buttons.element(boundBy: 4))
        try require(app.buttons["me-hero-edit"].waitForExistence(timeout: 25), "The loaded Me profile must appear.")
    }
    private func openEditor() throws { try tapMe("me-hero-edit"); try require(element("profile-edit").waitForExistence(timeout: 10), "The profile editor must open.") }
    private func openPrivacy() throws { try tapMe("profile-privacy-settings"); try require(element("profile-privacy").waitForExistence(timeout: 10), "Privacy settings must open.") }
    private func openLanguages() throws { try tapMe("me-languages"); try require(element("me-coordination-languages").waitForExistence(timeout: 10), "The current language selector must open.") }
    private func openSettings() throws { try tapMe("me-settings"); try require(element("settings-root").waitForExistence(timeout: 10), "Settings must open.") }
    private func tapMe(_ id: String) throws { try reveal(app.buttons[id]); try tap(app.buttons[id]) }
    private func tapSettings(_ id: String) throws { try reveal(app.buttons[id]); try tap(app.buttons[id]) }
    private func saveEditor() throws {
        try tap(app.buttons["profile-edit-save"], minimumHeight: 35.99)
        try require(element("profile-edit").waitForNonExistence(timeout: 25), "The real profile save must complete before continuing.")
    }
    private func finishProfileInput() throws {
        let done = app.buttons["profile-edit-input-done"]
        if done.exists && done.isHittable { try tap(done, minimumHeight: nil) }
    }
    private func selectedLanguages() -> Set<String> {
        Set(languageTags.filter { app.buttons["coordination-language-\($0.lowercased())"].isSelected })
    }
    private func tapLanguage(_ tag: String) throws {
        let row = app.buttons["coordination-language-\(tag.lowercased())"]
        try reveal(row); try tap(row)
    }
    private func selectedAppLanguage() throws -> String {
        let selected = ["system", "zh-Hans", "en", "de"].filter { app.buttons["app-language-\($0)"].isSelected }
        try require(selected.count == 1, "The actual app preference must select exactly one language.")
        return try XCTUnwrap(selected.first)
    }
    private func themeID(for value: String) throws -> String {
        let query = app.buttons.matching(identifier: "settings-app-theme")
        try require(query.firstMatch.waitForExistence(timeout: 10) && query.count == 1,
            "Read exactly the current Settings theme Picker Button.")
        let picker = query.element(boundBy: 0)
        try require(picker.isEnabled && picker.isHittable, "Read the actual visible theme Picker.")
        if let id = Self.decodedThemeID(values: [value, picker.value as? String ?? ""], label: picker.label) { return id }
        let diagnostic = ["elementType": String(describing: picker.elementType), "identifier": picker.identifier,
            "label": picker.label, "value": picker.value.map { String(describing: $0) } ?? "<nil>", "frame": String(describing: picker.frame)]
        let data = try JSONSerialization.data(withJSONObject: diagnostic, options: [.prettyPrinted, .sortedKeys])
        let attachment = XCTAttachment(data: data, uniformTypeIdentifier: "public.json")
        attachment.name = "me-theme-picker-private-AX"; attachment.lifetime = .keepAlways; add(attachment)
        try require(false, "The actual theme picker value must identify the current local preference.")
        return ""
    }
    private static func decodedThemeID(values: [String], label: String) -> String? {
        let labels = ["system": ["跟随 iPhone", "Follow iPhone", "iPhone-Sprache verwenden"],
                      "light": ["浅色", "Light", "Hell"], "dark": ["深色", "Dark", "Dunkel"]]
        let titles = ["应用主题", "App theme", "App-Design"]
        let separators = CharacterSet.whitespacesAndNewlines.union(CharacterSet(charactersIn: ",:，：、"))
        var matches = Set<String>()
        for (id, options) in labels {
            if values.contains(where: options.contains) || options.contains(label) { matches.insert(id) }
            for title in titles where label.hasPrefix(title) {
                for option in options where label.hasSuffix(option) {
                    let middle = label.dropFirst(title.count).dropLast(option.count)
                    if !middle.isEmpty && middle.unicodeScalars.allSatisfy({ separators.contains($0) }) { matches.insert(id) }
                }
            }
        }
        return matches.count == 1 ? matches.first : nil
    }
    private func selectTheme(_ id: String) throws {
        let labels = ["system": ["跟随 iPhone", "Follow iPhone", "iPhone-Sprache verwenden"],
                      "light": ["浅色", "Light", "Hell"], "dark": ["深色", "Dark", "Dunkel"]]
        try reveal(element("settings-app-theme")); try tap(element("settings-app-theme"), minimumHeight: nil)
        let option = app.buttons.matching(NSPredicate(format: "label IN %@", labels[id] ?? [])).firstMatch
        try tap(option, minimumHeight: nil)
    }
    private func cancelNavigationSheet() throws {
        let cancel = app.navigationBars.buttons.matching(NSPredicate(format: "label IN %@", ["取消", "Cancel", "Abbrechen"])).firstMatch
        try tap(cancel, minimumHeight: 35.99)
    }
    private func back(to id: String) throws {
        try tap(app.navigationBars.buttons.element(boundBy: 0), minimumHeight: 35.99)
        try require(element(id).waitForExistence(timeout: 12), "Return to the intended current page.")
    }
    private func tapPrompt(_ id: String) throws {
        let candidates = app.buttons.matching(identifier: id).allElementsBoundByIndex.filter(\.isHittable)
        try require(!candidates.isEmpty, "The visible existing discard prompt action must be available.")
        let button = try XCTUnwrap(candidates.min { $0.frame.width * $0.frame.height < $1.frame.width * $1.frame.height })
        try tap(button)
    }
    private func owner() throws -> Account { try XCTUnwrap(fixture.accounts.first { $0.role == "owner" }) }
    private func element(_ id: String) -> XCUIElement { app.descendants(matching: .any).matching(identifier: id).firstMatch }
    private func input(_ id: String) -> XCUIElement {
        let field = app.textFields.matching(identifier: id).firstMatch
        return field.exists ? field : app.textViews.matching(identifier: id).firstMatch
    }
    private func textValue(_ field: XCUIElement) -> String {
        let value = field.value as? String ?? ""
        return value == field.placeholderValue ? "" : value
    }
    private func replaceText(_ field: XCUIElement, with value: String) throws {
        try reveal(field); try tap(field, minimumHeight: nil)
        if !textValue(field).isEmpty {
            let old = textValue(field)
            if field.elementType == .textField || field.elementType == .secureTextField {
                field.coordinate(withNormalizedOffset: CGVector(dx: 1, dy: 0.5)).withOffset(CGVector(dx: -8, dy: 0)).tap()
                field.typeText(String(repeating: XCUIKeyboardKey.delete.rawValue, count: old.count))
            } else {
                try require(field.elementType == .textView, "Replace only the intended native text input.")
                field.typeKey("a", modifierFlags: .command)
                field.typeText(XCUIKeyboardKey.delete.rawValue)
            }
            try require(waitUntil(timeout: 2) { field.exists && self.textValue(field).isEmpty }, "Ordinary native deletion must genuinely clear the complete prior value.")
        }
        try require(textValue(field).isEmpty, "The previous field value must be genuinely cleared before replacement.")
        if !value.isEmpty { field.typeText(value) }
        // Never print either login field value on failure.
        try require(textValue(field) == value, "The intended input must exactly match its private replacement before continuing.")
    }
    private var scroll: XCUIElement {
        if app.collectionViews.firstMatch.exists { return app.collectionViews.firstMatch }
        if app.tables.firstMatch.exists { return app.tables.firstMatch }
        return app.scrollViews.firstMatch
    }
    private func reveal(_ target: XCUIElement) throws {
        for _ in 0..<12 {
            if target.exists && target.isHittable && app.windows.firstMatch.frame.contains(target.frame) { return }
            if scroll.exists { scroll.swipeUp(velocity: .slow) } else { break }
        }
        for _ in 0..<12 {
            if target.exists && target.isHittable && app.windows.firstMatch.frame.contains(target.frame) { return }
            if scroll.exists { scroll.swipeDown(velocity: .slow) } else { break }
        }
        try require(target.exists && target.isHittable, "The exact requested Me control must be reachable.")
    }
    private func tap(_ target: XCUIElement, minimumHeight: CGFloat? = 43.99) throws {
        try require(target.waitForExistence(timeout: 20) && target.isHittable && target.isEnabled,
            "The intended current control must be visible and enabled.")
        if target.elementType == .switch {
            let id = target.identifier
            try require(!id.isEmpty, "Use only the exact identified native Switch.")
            let query = app.switches.matching(identifier: id)
            let visible = query.allElementsBoundByIndex.filter {
                $0.exists && $0.isEnabled && $0.frame.width > 0 && $0.frame.height > 0
                    && app.windows.firstMatch.frame.contains($0.frame) && $0.isHittable
            }
            try require(visible.count == 1, "Reach exactly one fully visible enabled Switch.")
            let control = try XCTUnwrap(visible.first)
            let original = control.value as? String
            try require(original == "0" || original == "1", "Read the actual native Switch value before its single tap.")
            let expected = original == "0" ? "1" : "0"
            control.coordinate(withNormalizedOffset: CGVector(dx: 0.94, dy: 0.5)).tap()
            try require(waitUntil(timeout: 3) {
                let current = query.allElementsBoundByIndex.filter { $0.exists }
                return current.count == 1 && current[0].value as? String == expected
            }, "The single real Switch track tap must reach the exact opposite 0/1 state.")
            return
        }
        if let minimumHeight { try require(target.frame.height >= minimumHeight, "The actual action must keep its required touch height.") }
        target.tap()
    }
    private func waitUntil(timeout: TimeInterval = 20, _ condition: () -> Bool) -> Bool {
        let deadline = Date().addingTimeInterval(timeout)
        repeat { if condition() { return true }; RunLoop.current.run(until: Date().addingTimeInterval(0.2)) } while Date() < deadline
        return condition()
    }
    private func require(_ condition: Bool, _ message: String) throws {
        guard condition else { XCTFail(message); throw NSError(domain: "FiveRootMeUI", code: 1) }
    }
    private static func preparedDate(_ value: String) -> Date? {
        let fractional = ISO8601DateFormatter()
        fractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return fractional.date(from: value) ?? ISO8601DateFormatter().date(from: value)
    }
    private func phase(_ value: String) throws { print("FIVE_ROOT_ME_PHASE \(value)"); fflush(stdout); try FiveRootQAReadBarrier.wait(for: value) }
    private func capture(_ name: String) throws {
        try require(app.state == .runningForeground && !app.textFields["login-identifier"].exists
            && !app.secureTextFields.firstMatch.exists && !element("feedback-root").exists,
            "Only safe owned business UI may be captured, never credentials or other people's feedback.")
        let attachment = XCTAttachment(screenshot: app.screenshot())
        attachment.name = "me-" + name; attachment.lifetime = .keepAlways; add(attachment)
    }
}
