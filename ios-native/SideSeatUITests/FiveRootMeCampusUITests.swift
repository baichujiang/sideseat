import XCTest
import Darwin

/// Supplemental Me flows. Only fresh owned local actors; business writes use actual App controls.
/// The two methods require independent cohorts and ordered GET/read-only database acknowledgements.
@MainActor final class FiveRootMeCampusUITests: XCTestCase {
    private struct Account: Decodable { let role: String; let id: String; let identifier: String; let password: String }
    private struct Preparation: Decodable {
        let schemaVersion: Int; let runID: String; let preparedAt: String; let selectedCase: String
        let seedCourseID: String?; let archiveCourseID: String?; let variantFingerprint: String?
    }
    private struct Fixture: Decodable {
        let kind: String; let schemaVersion: Int; let runID: String; let baseURL: String
        let bundle: String; let accounts: [Account]; let meCampus: Preparation
    }
    private var fixture: Fixture!
    private var app: XCUIApplication!
    private var run: String { fixture.runID }
    private var major: String { "QA Major " + run }
    private var manualName: String { "Campus manual " + run }
    private var manualCode: String { "QAMC" + run.uppercased() }
    private let handles = ["wechat", "whatsapp", "telegram", "instagram"]

    override func setUpWithError() throws {
        continueAfterFailure = false
        try XCTSkipUnless(ProcessInfo.processInfo.environment["SIDESEAT_ME_CAMPUS_EXECUTE"] == "1", "Explicit fresh local supplemental Me execution only.")
    }
    override func tearDown() async throws { await MainActor.run { app?.terminate() } }

    private func loadFixture(_ selectedCase: String) throws {
        let environment = ProcessInfo.processInfo.environment
        try require(environment["SIDESEAT_ME_CAMPUS_EXECUTE"] == "1" && environment["SIDESEAT_ME_CAMPUS_CASE"] == selectedCase,
            "The selected method requires its explicit one-case gate.")
        let raw = environment["SIDESEAT_FIVE_ROOT_FIXTURE_JSON"] ?? ""
        try require(raw.hasPrefix("{"), "No placeholder fixture or ordinary login fallback is permitted.")
        fixture = try JSONDecoder().decode(Fixture.self, from: Data(raw.utf8))
        try require(fixture.kind == "five-roots-live" && fixture.schemaVersion == 1
            && fixture.baseURL == "http://127.0.0.1:3344" && fixture.bundle == "app.sideseat.mobile.preview",
            "Supplemental campus tests require the isolated local API and selected Preview App.")
        try require(run.range(of: "^[a-f0-9]{12}$", options: .regularExpression) != nil
            && fixture.accounts.count == 2 && Set(fixture.accounts.map(\.role)) == ["owner", "peer"]
            && Set(fixture.accounts.map(\.id)).count == 2 && fixture.accounts.allSatisfy {
                $0.identifier == "e2e_roots_\($0.role)_\(run)" && !$0.id.isEmpty && $0.password.count >= 24
            }, "Only these two fresh owned local identities may be used.")
        let formatter = ISO8601DateFormatter(); formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let prepared = try XCTUnwrap(formatter.date(from: fixture.meCampus.preparedAt) ?? ISO8601DateFormatter().date(from: fixture.meCampus.preparedAt))
        try require(fixture.meCampus.schemaVersion == 1 && fixture.meCampus.runID == run
            && fixture.meCampus.selectedCase == selectedCase && (-300..<14_400).contains(Date().timeIntervalSince(prepared)),
            "Only the complete fresh preparation matching this one method may run.")
        try require(environment["SIMULATOR_UDID"] == "AEBD816E-53A7-4012-B76A-FEF82CF02A6B",
            "This supplemental runner uses only the explicitly owned iPhone17Pro Simulator.")
    }

    func test01CampusProfilePrivacyAvatarAndAppearance() throws {
        try loadFixture("profile"); try login(); try openMe(); try phase("baseline")
        try openEditor(); try menu("profile-edit-school", labels: ["LMU"])
        try replaceText(input("profile-edit-major"), with: major); try finishInput()
        try tap(app.buttons["profile-edit-save"], minimumHeight: 35.99)
        try require(element("profile-edit-school-change-prompt").waitForExistence(timeout: 10), "A changed school needs its existing warning.")
        try prompt("profile-edit-cancel-school-change")
        try require(element("profile-edit").exists, "Cancelling the school warning must keep the draft editor open.")
        try discardEditor(); try phase("profile-cancelled")

        try openEditor()
        try menu("profile-edit-gender", labels: ["Female", "女", "Weiblich"])
        try menu("profile-edit-school", labels: ["LMU"])
        try menu("profile-edit-student-status", labels: ["Exchange student", "交换学生", "Austauschstudent/in"])
        try menu("profile-edit-degree-level", labels: ["Master", "硕士"])
        try replaceText(input("profile-edit-major"), with: major); try finishInput(); try semester(3)
        for handle in handles { try replaceText(input("profile-edit-" + handle), with: "qa_" + handle + "_" + run); try finishInput() }
        try saveEditor(schoolChanged: true); try phase("student-saved")
        try login(); try openMe(); try openEditor(); try assertStudentFields(); try cancelSheet(); try phase("student-relogged")

        try openEditor(); try menu("profile-edit-student-status", labels: ["Alumni", "校友"])
        let year = element("profile-edit-graduation-year"); try reveal(year)
        try require(year.exists && !element("profile-edit-semester").exists, "Alumni must expose graduation year instead of semester.")
        let decrement = year.buttons["profile-edit-graduation-year-Decrement"]
        try tap(decrement, minimumHeight: nil)
        try saveEditor(); try phase("alumni-saved")
        try login(); try openMe(); try openEditor()
        try require(element("profile-edit-graduation-year").exists && !element("profile-edit-semester").exists,
            "The alumni form branch must survive a real relogin.")
        try assertHandles(populated: true); try cancelSheet(); try phase("alumni-relogged")

        try openEditor(); try menu("profile-edit-gender", labels: ["Prefer not to say", "不愿透露", "Keine Angabe"])
        try menu("profile-edit-school", labels: ["TUM"])
        try menu("profile-edit-student-status", labels: ["Current student", "在读学生", "Student/in"])
        try menu("profile-edit-degree-level", labels: ["Other", "其他", "Sonstiges"])
        try replaceText(input("profile-edit-major"), with: ""); try finishInput(); try semester(1)
        for handle in handles { try replaceText(input("profile-edit-" + handle), with: ""); try finishInput() }
        try saveEditor(schoolChanged: true); try phase("fields-cleared")
        try login(); try openMe(); try openEditor()
        try require(textValue(input("profile-edit-major")).isEmpty, "Cleared major must remain empty after login.")
        try assertHandles(populated: false); try require(!element("profile-edit-graduation-year").exists, "Current student must remove the alumni branch.")
        try cancelSheet(); try phase("cleared-relogged")

        try openAvatar(); try tapPreset("p02"); try cancelSheet()
        try phase("avatar-cancelled")
        try openAvatar(); try tapPreset("p02"); try tap(app.buttons["system-avatar-save"])
        try require(element("system-avatar-preview-name").waitForNonExistence(timeout: 20), "Preset save must finish.")
        try phase("avatar-saved"); try login(); try openMe(); try openAvatar()
        try require(!app.buttons["system-avatar-save"].isEnabled, "Reopened saved preset must start unchanged.")
        try phase("avatar-relogged"); try tapPreset("p01"); try tap(app.buttons["system-avatar-save"])
        try require(element("system-avatar-preview-name").waitForNonExistence(timeout: 20), "Original owned preset must be restored.")
        try phase("avatar-restored")

        try openPrivacy(); try privacy(false); try tap(app.buttons["profile-sheet-close"], minimumHeight: 35.99)
        try openPrivacy(); try assertPrivacy(true); try tap(app.buttons["profile-sheet-close"], minimumHeight: 35.99); try phase("privacy-cancelled")
        try openPrivacy(); try privacy(false); try savePrivacy(); try phase("privacy-saved")
        try login(); try openMe(); try openPrivacy(); try assertPrivacy(false); try phase("privacy-relogged")
        try privacy(true); try savePrivacy(); try phase("privacy-restored")

        try openAppearance(); try appearance("ocean", "none")
        try require(app.buttons["appearance-theme-ocean"].isSelected && app.buttons["appearance-icon-none"].isSelected,
            "Ocean and None must remain the actual selected options before reading their lock explanation.")
        try revealReadOnlyPlusExplanation()
        try require(element("appearance-plus-required").exists && !app.buttons["appearance-save"].isEnabled,
            "The real free-member Plus gate must remain closed.")
        try capture("appearance-plus-required-visible")
        try discardAppearance(); try phase("appearance-plus-cancelled")
        try openAppearance(); try appearance("rose", "sun"); try discardAppearance(); try phase("appearance-cancelled")
        try openAppearance(); try appearance("rose", "sun"); try saveAppearance(); try phase("appearance-saved")
        try login(); try openMe(); try openAppearance()
        try require(!app.buttons["appearance-save"].isEnabled, "Saved appearance must reopen unchanged after real login.")
        try phase("appearance-relogged"); try appearance("classic", "none"); try saveAppearance(); try phase("appearance-restored")

        try openAvatar(); try cancelSystemPhotoPicker()
        try cancelSheet(); try phase("photo-picker-cancelled")
        try login(role: "peer"); try openMe(); try openEditor(); try assertHandles(populated: false)
        try cancelSheet(); try openPrivacy(); try assertPrivacy(true); try tap(app.buttons["profile-sheet-close"], minimumHeight: 35.99)
        try capture("profile-peer-isolated"); try phase("peer-isolated")
    }

    func test02OwnedCoursesCreateRestoreTimetableRelaunchAndRemove() throws {
        try loadFixture("courses")
        let seeded = try XCTUnwrap(fixture.meCampus.seedCourseID), archived = try XCTUnwrap(fixture.meCampus.archiveCourseID)
        let fingerprint = try XCTUnwrap(fixture.meCampus.variantFingerprint)
        try login(); try openMe(); try openCourses(); try phase("baseline")
        try openManual(); try replaceText(input("course-manual-name"), with: manualName)
        try replaceText(input("course-manual-code"), with: manualCode)
        try tap(app.buttons["course-manual-cancel"], minimumHeight: 35.99); try phase("manual-cancelled")
        try openManual(); try replaceText(input("course-manual-name"), with: manualName)
        try replaceText(input("course-manual-code"), with: manualCode)
        try tap(app.buttons["course-manual-confirm"], minimumHeight: 35.99)
        try require(element("course-detail").waitForExistence(timeout: 25) && app.staticTexts[manualName].exists,
            "Actual manual creation must open exactly this owned course detail.")
        try require(app.buttons["course-leave"].exists, "Manual creation must enroll the creator.")
        try capture("manual-created"); try phase("manual-created")
        try login(); try openMe(); try openCourses(); try openCourseNamed(manualName)
        try require(app.buttons["course-leave"].exists, "Manual enrollment must survive a fresh login.")
        try phase("manual-relogged"); try tap(app.buttons["course-leave"]); try prompt("course-leave-cancel")
        try require(app.buttons["course-leave"].exists, "Cancel remove must retain manual enrollment.")
        try phase("leave-cancelled"); try leaveCourse(); try phase("manual-left")
        try tap(app.buttons["course-save"]); try waitForBookmark(saved: true); try phase("bookmark-saved")
        try login(); try openMe(); try openCourses(); try courseScope(["Saved", "已收藏", "Gespeichert"]); try openCourseNamed(manualName)
        try require(app.buttons["course-save"].label == "Remove bookmark" || app.buttons["course-save"].label == "取消收藏" || app.buttons["course-save"].label == "Lesezeichen entfernen",
            "The actual owned saved-course row must survive login.")
        try phase("bookmark-relogged"); try tap(app.buttons["course-save"]); try waitForBookmark(saved: false); try phase("bookmark-removed")
        try back(to: "courses-list"); try courseScope(["My courses", "我的课程", "Meine Kurse"])
        try openArchived(); try swipeArchivedRemoval(archived); try prompt("course-archived-cancel-remove")
        try require(app.buttons["course-archived-restore-" + archived].exists, "Cancel archive removal must retain the exact owned row.")
        try phase("archive-remove-cancelled")
        try swipeArchivedRemoval(archived); try prompt("course-archived-confirm-remove")
        try require(app.buttons["course-archived-restore-" + archived].waitForNonExistence(timeout: 20), "Confirm archive removal must remove its exact membership.")
        try phase("archive-removed")
        try tap(app.buttons["course-archived-restore-" + seeded], minimumHeight: nil)
        try require(app.buttons["course-archived-restore-" + seeded].waitForNonExistence(timeout: 20), "Restore must remove this expired membership from archive.")
        try tap(app.buttons["course-archived-done"], minimumHeight: 35.99)
        try reveal(app.buttons["course-row-" + seeded]); try tap(app.buttons["course-row-" + seeded])
        try require(app.buttons["course-leave"].waitForExistence(timeout: 20), "The restored owned course must be active.")
        try phase("seed-restored")
        let use = app.buttons["course-use-schedule-" + fingerprint]; try reveal(use); try tap(use, minimumHeight: nil)
        try require(waitUntil { self.textExists(["My timetable", "我的课表", "Mein Stundenplan"]) }, "Applying the actual official variant must add My timetable.")
        try capture("timetable-applied"); try phase("timetable-applied")
        try login(); try openMe(); try openCourses(); try reveal(app.buttons["course-row-" + seeded]); try tap(app.buttons["course-row-" + seeded])
        try require(waitUntil { self.textExists(["My timetable", "我的课表", "Mein Stundenplan"]) }, "Applied timetable must survive a fresh login.")
        try phase("timetable-relogged"); try leaveCourse(); try phase("seed-left")
        try back(to: "courses-list"); try back(to: "me-profile")
        try login(role: "peer"); try openMe(); try openCourses()
        try require(!app.buttons["course-row-" + seeded].exists && !app.staticTexts[manualName].exists,
            "The second owned actor must not inherit another person's enrollments.")
        try capture("courses-peer-isolated"); try phase("peer-isolated")
    }

    private func login(role: String = "owner") throws {
        app?.terminate(); app = XCUIApplication(bundleIdentifier: fixture.bundle)
        app.launchArguments = ["--ui-testing-signed-out", "--ui-testing-ephemeral-credentials", "--ui-testing-skip-tutorial", "--ui-testing-local-api"]
        app.launchEnvironment = ["SIDESEAT_API_BASE_URL_OVERRIDE": fixture.baseURL]; app.launch()
        let account = try XCTUnwrap(fixture.accounts.first { $0.role == role }), identifier = app.textFields["login-identifier"]
        try require(identifier.waitForExistence(timeout: 25), "Use the actual sign-in form, never an injected authenticated session.")
        try replaceText(identifier, with: account.identifier)
        let password = app.secureTextFields["login-password"]; try tap(password, minimumHeight: nil); password.typeText(account.password)
        // The real Return key invokes SSSecureField's onSubmit: LoginView.login.
        try require(app.keyboards.firstMatch.waitForExistence(timeout: 5), "Submit through the actual focused password keyboard.")
        password.typeText("\n")
        try require(waitUntil(timeout: 40) { self.app.state == .runningForeground && !identifier.exists && !password.exists && self.app.tabBars.buttons.count == 5 },
            "The exact fresh owned actor must reach the ready five-tab shell.")
    }
    private func openMe() throws { try tap(app.tabBars.buttons.element(boundBy: 4)); try require(app.buttons["me-hero-edit"].waitForExistence(timeout: 25), "Load current Me.") }
    private func openEditor() throws { try tapMe("me-hero-edit"); try require(element("profile-edit").waitForExistence(timeout: 10), "Open current profile editor.") }
    private func openPrivacy() throws { try tapMe("profile-privacy-settings"); try require(element("profile-privacy").waitForExistence(timeout: 10), "Open current privacy sheet.") }
    private func openAppearance() throws { try tapMe("me-personalization"); try require(element("appearance-preview").waitForExistence(timeout: 15), "Open current appearance.") }
    private func openAvatar() throws { try tapMe("profile-change-photo"); try require(element("system-avatar-preview-name").waitForExistence(timeout: 15), "Open current avatar picker.") }
    private func openCourses() throws { try tapMe("me-courses"); try require(element("courses-list").waitForExistence(timeout: 20), "Open real course management.") }
    private func tapMe(_ id: String) throws { try reveal(app.buttons[id]); try tap(app.buttons[id]) }
    private func menu(_ id: String, labels: [String]) throws {
        try finishInput(); try reveal(element(id)); try tap(element(id))
        try tap(app.buttons.matching(NSPredicate(format: "label IN %@", labels)).firstMatch, minimumHeight: nil)
    }
    private func semester(_ value: Int) throws {
        let control = element("profile-edit-semester"); try reveal(control)
        for _ in 0..<14 {
            let current = Int(control.label) ?? Int(control.value as? String ?? "")
            try require(current != nil, "Read the actual semester before stepping.")
            if current == value { return }
            let labels = current! < value ? ["Increase semester", "增加学期", "Semester erhöhen"] : ["Decrease semester", "减少学期", "Semester verringern"]
            try tap(app.buttons.matching(NSPredicate(format: "label IN %@", labels)).firstMatch)
        }
        try require(false, "Semester must reach the requested legal value through actual controls.")
    }
    private func assertStudentFields() throws {
        try require(element("profile-edit-school").value as? String == "LMU", "School persists.")
        try reveal(input("profile-edit-major")); try require(textValue(input("profile-edit-major")) == major, "Major persists.")
        try assertHandles(populated: true)
    }
    private func assertHandles(populated: Bool) throws {
        for handle in handles {
            let field = input("profile-edit-" + handle); try reveal(field)
            try require(textValue(field) == (populated ? "qa_" + handle + "_" + run : ""), "The exact synthetic handle value must persist or remain cleared.")
        }
    }
    private func saveEditor(schoolChanged: Bool = false) throws {
        try finishInput(); try tap(app.buttons["profile-edit-save"], minimumHeight: 35.99)
        if schoolChanged { try require(element("profile-edit-school-change-prompt").waitForExistence(timeout: 10), "School changes need the existing confirmation."); try prompt("profile-edit-confirm-school-change") }
        try require(element("profile-edit").waitForNonExistence(timeout: 25), "The real profile save must complete.")
    }
    private func discardEditor() throws { try finishInput(); try tap(app.buttons["profile-edit-close"], minimumHeight: 35.99); try prompt("profile-edit-discard"); try require(element("profile-edit").waitForNonExistence(timeout: 10), "Discard editor.") }
    private func finishInput() throws { let done = app.buttons["profile-edit-input-done"]; if done.exists && done.isHittable { try tap(done, minimumHeight: nil) } }
    private func tapPreset(_ id: String) throws { try reveal(app.buttons["system-avatar-" + id]); try tap(app.buttons["system-avatar-" + id]) }
    private func privacy(_ on: Bool) throws { for id in ["profile-privacy-discover", "profile-privacy-course-members"] { let control = app.switches[id]; try reveal(control); if control.value as? String != (on ? "1" : "0") { try tap(control) } }; try assertPrivacy(on) }
    private func assertPrivacy(_ on: Bool) throws { for id in ["profile-privacy-discover", "profile-privacy-course-members"] { let control = app.switches[id]; try reveal(control); try require(control.value as? String == (on ? "1" : "0"), "The current privacy switch must expose the intended real state.") } }
    private func savePrivacy() throws { try tap(app.buttons["profile-privacy-save"], minimumHeight: 35.99); try require(element("profile-privacy").waitForNonExistence(timeout: 20), "Privacy save completes.") }
    private func appearance(_ theme: String, _ icon: String) throws { for id in ["appearance-theme-" + theme, "appearance-icon-" + icon] { try reveal(app.buttons[id]); try tap(app.buttons[id], minimumHeight: nil) } }
    private func discardAppearance() throws { try cancelSheet(); try prompt("appearance-discard"); try require(element("appearance-preview").waitForNonExistence(timeout: 10), "Discard the appearance draft.") }
    private func saveAppearance() throws { try tap(app.buttons["appearance-save"], minimumHeight: nil); try require(element("appearance-preview").waitForNonExistence(timeout: 20), "Appearance save completes.") }
    private func openManual() throws { try tap(app.buttons["course-add-menu"], minimumHeight: 35.99); try tap(app.buttons["course-add-manual"], minimumHeight: nil); try require(element("course-manual-add").waitForExistence(timeout: 10), "Open actual manual course form.") }
    private func openCourseNamed(_ name: String) throws { let title = app.staticTexts[name].firstMatch; try reveal(title); try tap(title, minimumHeight: nil); try require(element("course-detail").waitForExistence(timeout: 20), "Open intended exact owned course.") }
    private func leaveCourse() throws { try reveal(app.buttons["course-leave"]); try tap(app.buttons["course-leave"]); try prompt("course-leave-confirm"); try require(app.buttons["course-join"].waitForExistence(timeout: 20), "Confirmed leave removes actual enrollment.") }
    private func courseScope(_ labels: [String]) throws { let scope = element("course-scope"); try reveal(scope); let segment = scope.buttons.matching(NSPredicate(format: "label IN %@", labels)).firstMatch; try tap(segment, minimumHeight: nil) }
    private func openArchived() throws { try reveal(app.buttons["course-archived-entry"]); try tap(app.buttons["course-archived-entry"]); try require(element("course-archived-list").waitForExistence(timeout: 15), "Open actual archived memberships.") }
    private func textExists(_ labels: [String]) -> Bool { app.staticTexts.matching(NSPredicate(format: "label IN %@", labels)).firstMatch.exists }
    private func cancelSheet() throws { try tap(app.navigationBars.buttons.matching(NSPredicate(format: "label IN %@", ["Cancel", "取消", "Abbrechen"])).firstMatch, minimumHeight: 35.99) }
    private func back(to id: String) throws { try tap(app.navigationBars.buttons.element(boundBy: 0), minimumHeight: 35.99); try require(element(id).waitForExistence(timeout: 15), "Return to current intended page.") }
    private func prompt(_ id: String) throws {
        let candidates = app.buttons.matching(identifier: id).allElementsBoundByIndex.filter(\.isHittable)
        let action = try XCTUnwrap(candidates.min { $0.frame.width * $0.frame.height < $1.frame.width * $1.frame.height }, "Use the visible existing prompt action.")
        try tap(action)
    }
    private func element(_ id: String) -> XCUIElement { app.descendants(matching: .any).matching(identifier: id).firstMatch }
    private func input(_ id: String) -> XCUIElement { let field = app.textFields[id]; return field.exists ? field : app.textViews[id] }
    private func textValue(_ field: XCUIElement) -> String { let value = field.value as? String ?? ""; return value == field.placeholderValue ? "" : value }
    private func replaceText(_ field: XCUIElement, with value: String) throws {
        try reveal(field); try tap(field, minimumHeight: nil)
        if !textValue(field).isEmpty {
            let old = textValue(field)
            if field.elementType == .secureTextField {
                field.coordinate(withNormalizedOffset: CGVector(dx: 1, dy: 0.5)).withOffset(CGVector(dx: -8, dy: 0)).tap()
                field.typeText(String(repeating: XCUIKeyboardKey.delete.rawValue, count: old.count))
            } else if ["profile-edit-major", "profile-edit-wechat", "profile-edit-whatsapp", "profile-edit-telegram", "profile-edit-instagram"].contains(field.identifier) {
                try require(field.elementType == .textField && element("profile-edit").exists,
                    "Only the exact current ordinary profile fields use the independently verified native endpoint helper.")
                try clearAtStableNativeEnd(identifier: field.identifier)
            } else {
                try require(field.elementType == .textField || field.elementType == .textView, "Replace only the intended native text input.")
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
    private struct EditGeometry {
        let field: XCUIElement
        let window: XCUIElement
        let fieldFrame: CGRect
        let windowFrame: CGRect
        let viewport: CGRect
        let blockers: [CGRect]
    }
    private func focused(_ field: XCUIElement) -> Bool {
        // This is the actual field's AX Attributes line, not an ancestor or another field.
        field.debugDescription.components(separatedBy: "\n").first?.contains("Keyboard Focused") == true
    }
    private func editGeometry(identifier: String) throws -> EditGeometry {
        let fields = app.textFields.matching(identifier: identifier).allElementsBoundByIndex.filter(\.exists)
        let scrolls = app.scrollViews.matching(identifier: "profile-edit").allElementsBoundByIndex.filter(\.exists)
        let keyboards = app.keyboards.allElementsBoundByIndex.filter { $0.exists && !$0.frame.isEmpty }
        try require(fields.count == 1 && scrolls.count == 1 && keyboards.count == 1,
            "Use one exact ordinary profile field, one current profile editor and the actual software keyboard.")
        let field = try XCTUnwrap(fields.first), window = app.windows.firstMatch
        try require(field.isEnabled && focused(field), "The exact profile field must have native Keyboard Focused state.")
        let windowFrame = window.frame
        var viewport = scrolls[0].frame.intersection(windowFrame)
        let controls = ["profile-edit-input-done", "profile-edit-input-previous", "profile-edit-input-next"].map {
            app.buttons.matching(identifier: $0).allElementsBoundByIndex.filter(\.exists)
        }
        try require(controls.allSatisfy { $0.count == 1 }, "Resolve the real Done, Previous and Next keyboard accessory frames uniquely.")
        let controlFrames = controls.map { $0[0].frame }
        let toolbars = app.toolbars.allElementsBoundByIndex.filter { bar in
            bar.exists && !bar.frame.isEmpty && controlFrames.contains { bar.frame.contains($0) }
        }
        let blockers = keyboards.map(\.frame) + controlFrames + toolbars.map(\.frame)
        let top = max(viewport.minY, app.navigationBars.allElementsBoundByIndex.filter {
            $0.exists && !$0.frame.isEmpty && windowFrame.intersects($0.frame)
        }.map { $0.frame.maxY }.max() ?? viewport.minY)
        let bottom = min(viewport.maxY, blockers.map(\.minY).min() ?? viewport.maxY)
        viewport = CGRect(x: viewport.minX + 2, y: top + 4, width: viewport.width - 4, height: bottom - top - 8)
        try require(!viewport.isNull && !viewport.isEmpty && viewport.height > 100,
            "Use the complete profile viewport above the keyboard and its accessory toolbar.")
        return EditGeometry(field: field, window: window, fieldFrame: field.frame,
            windowFrame: windowFrame, viewport: viewport, blockers: blockers)
    }
    private func sameRect(_ a: CGRect, _ b: CGRect) -> Bool {
        abs(a.minX-b.minX) <= 0.5 && abs(a.minY-b.minY) <= 0.5
            && abs(a.width-b.width) <= 0.5 && abs(a.height-b.height) <= 0.5
    }
    private func safeEndpoint(_ g: EditGeometry) -> CGPoint? {
        let frame = g.fieldFrame, point = CGPoint(x: frame.maxX - 8, y: frame.midY)
        guard frame.width > 16, frame.height > 0, g.windowFrame.contains(frame),
            g.viewport.contains(frame), frame.contains(point), g.viewport.contains(point),
            !g.blockers.contains(where: { $0.insetBy(dx: -2, dy: -2).contains(point) }) else { return nil }
        return point
    }
    private func clearAtStableNativeEnd(identifier: String) throws {
        let original = textValue(app.textFields[identifier])
        try require(!original.isEmpty, "Clear the actual complete nonempty draft; do not manufacture a replacement baseline.")
        do {
            let field = app.textFields[identifier]
            try require(app.textFields.matching(identifier: identifier).count == 1 && field.exists && field.isEnabled && field.isHittable,
                "The exact profile field must be uniquely reachable before focusing it.")
            field.tap()
            try require(app.keyboards.firstMatch.waitForExistence(timeout: 5)
                && waitUntil(timeout: 3) { self.focused(app.textFields[identifier]) }, "Focus the exact field with the real keyboard shown.")
            var first = try editGeometry(identifier: identifier)
            var stable: EditGeometry?
            for _ in 0..<6 {
                RunLoop.current.run(until: Date().addingTimeInterval(0.2))
                let next = try editGeometry(identifier: identifier)
                if sameRect(first.fieldFrame, next.fieldFrame) && sameRect(first.windowFrame, next.windowFrame)
                    && sameRect(first.viewport, next.viewport) { stable = next; break }
                first = next
            }
            diagnostic("stable-end-natural-geometry")
            let sampled = try XCTUnwrap(stable, "Wait for two consecutive fresh field/viewport frames to agree before any coordinate action.")
            try require(safeEndpoint(sampled) != nil && sampled.blockers.allSatisfy {
                !sampled.fieldFrame.intersects($0)
            }, "The focused field must naturally be completely visible above keyboard/accessories with the viewport margin; do not scroll to conceal an overlap.")
                // Re-fetch once more after diagnostics, which can outlast a keyboard/scroll animation.
                let fresh = try editGeometry(identifier: identifier)
                try require(sameRect(sampled.fieldFrame, fresh.fieldFrame) && sameRect(sampled.windowFrame, fresh.windowFrame)
                    && sameRect(sampled.viewport, fresh.viewport), "The endpoint must still match the two stable geometry samples.")
                let point = try XCTUnwrap(safeEndpoint(fresh), "The fixed endpoint must remain fully inside the field, outside keyboard/accessories.")
                try require(textValue(fresh.field) == original && fresh.field.isHittable,
                    "The complete original draft must remain intact before the single endpoint tap.")
                let coordinates = XCTAttachment(string: "field=\(fresh.fieldFrame)\nwindow=\(fresh.windowFrame)\nviewport=\(fresh.viewport)\nblockers=\(fresh.blockers)\nfixedWindowEndpoint=\(point)")
                coordinates.name = "private-probe-stable-end-coordinate-proof"; coordinates.lifetime = .keepAlways; add(coordinates)
                fresh.window.coordinate(withNormalizedOffset: .zero).withOffset(
                    CGVector(dx: point.x-fresh.windowFrame.minX, dy: point.y-fresh.windowFrame.minY)).tap()
                diagnostic("after-single-fixed-window-end-tap")
                try require(waitUntil(timeout: 3) { self.focused(self.app.textFields[identifier]) }
                    && textValue(app.textFields[identifier]) == original && app.keyboards.firstMatch.exists,
                    "The single real endpoint tap must keep this exact field Keyboard Focused and its original value intact.")
                app.textFields[identifier].typeText(String(repeating: XCUIKeyboardKey.delete.rawValue, count: original.count + 1))
                diagnostic("after-native-backspace")
                try require(waitUntil(timeout: 3) { self.textValue(self.app.textFields[identifier]).isEmpty },
                    "Native endpoint Backspace must genuinely clear the entire prior value; no partial-clear fallback is allowed.")
                return
        }
    }
    private func diagnostic(_ name: String) {
        guard let app, app.state == .runningForeground, element("profile-edit").exists,
            !app.textFields["login-identifier"].exists, !app.secureTextFields.firstMatch.exists else { return }
        let ids = ["profile-edit-major", "profile-edit-wechat", "profile-edit-whatsapp", "profile-edit-telegram", "profile-edit-instagram"]
        let details = ids.map { app.textFields[$0].debugDescription }.joined(separator: "\n")
        let text = XCTAttachment(string: "PROFILE FIELDS\n" + details + "\nKEYBOARD\n" + app.keyboards.debugDescription + "\nTOOLBARS\n" + app.toolbars.debugDescription)
        text.name = "private-campus-" + name + "-field-geometry-AX"; text.lifetime = .keepAlways; add(text)
        let shot = XCTAttachment(screenshot: app.screenshot()); shot.name = "private-campus-" + name; shot.lifetime = .keepAlways; add(shot)
    }
    private var avatarBars: XCUIElementQuery {
        let titles = ["Choose an avatar", "选择头像", "Avatar auswählen"]
        return app.navigationBars.matching(NSPredicate(format: "identifier IN %@ OR label IN %@", titles, titles))
    }
    private var systemPhotoBars: XCUIElementQuery {
        app.navigationBars.containing(.button, identifier: "Cancel")
    }
    private var systemPhotoCancels: XCUIElementQuery {
        systemPhotoBars.buttons.matching(identifier: "Cancel").matching(NSPredicate(format: "label IN %@", ["Cancel", "取消", "Abbrechen"]))
    }
    private func cancelSystemPhotoPicker() throws {
        let photos = app.buttons["profile-choose-photo"], preview = element("system-avatar-preview-name")
        try require(avatarBars.count == 1 && photos.exists && photos.isHittable && preview.exists && preview.isHittable,
            "Avatar must be genuinely interactive before presenting the system Photos boundary.")
        try tap(photos)
        photoBoundaryDiagnostic("opening-system-transition")
        let cancel = systemPhotoCancels.firstMatch
        try require(cancel.waitForExistence(timeout: 20), "Wait for the actual system Cancel identifier, not an indexed or transient navigation bar.")
        try require(waitUntil(timeout: 20) {
            guard self.systemPhotoBars.count == 1 && self.systemPhotoCancels.count == 1 else { return false }
            let current = self.systemPhotoCancels.firstMatch
            let covered = (!photos.exists || !photos.isHittable) && (!preview.exists || !preview.isHittable)
            return covered && current.exists && current.isEnabled && current.isHittable
                && !current.frame.isEmpty && self.app.windows.firstMatch.frame.contains(current.frame)
                && self.systemPhotoBars.firstMatch.identifier != "PUPickerUnavailableView"
        }, "The real system layer must replace its transient unavailable navigation, cover Avatar and expose one actionable Cancel.")
        photoBoundaryDiagnostic("system-cancel-ready-fresh-query")
        // This semantic query is resolved again at the actual tap; no bar index/title/element snapshot is retained.
        try tap(systemPhotoCancels.firstMatch, minimumHeight: nil)
        try require(systemPhotoCancels.firstMatch.waitForNonExistence(timeout: 15) && waitUntil(timeout: 10) {
            self.systemPhotoBars.count == 0 && self.avatarBars.count == 1
                && photos.exists && photos.isHittable && preview.exists && preview.isHittable
                && !self.app.buttons["system-avatar-save"].isEnabled
        }, "The actual system layer must close and restore interactive Avatar with no saved/selected photo.")
        photoBoundaryDiagnostic("system-dismissed-avatar-restored")
    }
    private func photoBoundaryDiagnostic(_ name: String) {
        guard let app, app.state == .runningForeground, !app.textFields["login-identifier"].exists,
            !app.secureTextFields.firstMatch.exists else { return }
        // These queries are scoped to navigation and its exact Cancel button; no app tree, assets or screenshots.
        let text = XCTAttachment(string: "SYSTEM NAVIGATION CONTAINING EXACT CANCEL\n" + systemPhotoBars.debugDescription
            + "\nSYSTEM CANCEL QUERY\n" + systemPhotoCancels.debugDescription)
        text.name = "private-photos-probe-" + name + "-nav-cancel-only-AX"; text.lifetime = .keepAlways; add(text)
    }
    private func exactRow(_ id: String) throws -> XCUIElement {
        let rows = app.cells.containing(.staticText, identifier: "course-title-visual-" + id)
            .containing(.button, identifier: "course-archived-restore-" + id)
        try require(rows.count == 1, "Locate exactly one owned row by title ID and Restore ID.")
        let row = rows.firstMatch; try reveal(row)
        try require(row.isHittable && !row.frame.isEmpty && app.windows.firstMatch.frame.contains(row.frame), "Only a complete visible exact owned cell may receive a drag.")
        return row
    }
    private func exposeRemoval(_ id: String, name: String) throws {
        let row = try exactRow(id), title = row.staticTexts["course-title-visual-" + id]
        let restore = row.buttons["course-archived-restore-" + id]
        try require(title.exists && !title.frame.isEmpty && row.frame.contains(title.frame)
            && title.frame.maxY < restore.frame.minY, "Anchor the gesture in the actual title area above Restore.")
        try capture(name + "-before")
        let y = title.frame.midY - row.frame.minY
        let start = row.coordinate(withNormalizedOffset: CGVector(dx: 0.92, dy: 0)).withOffset(CGVector(dx: 0, dy: y))
        let end = row.coordinate(withNormalizedOffset: CGVector(dx: 0.08, dy: 0)).withOffset(CGVector(dx: 0, dy: y))
        print("ARCHIVE_PROBE_DRAG exact-title-row \(id) row=\(row.frame) title=\(title.frame) normalizedX=0.92-to-0.08 velocity=250"); fflush(stdout)
        start.press(forDuration: 0.05, thenDragTo: end, withVelocity: XCUIGestureVelocity(rawValue: 250), thenHoldForDuration: 0.05)
        _ = waitUntil(timeout: 5) { self.visibleRemoval(id).count == 1 }
        try capture(name + "-after")
        try require(visibleRemoval(id).count == 1, "One explicit title-area drag must expose one visible exact-ID native removal action; record AX and fail without label/coordinate fallback.")
    }
    private func visibleRemoval(_ id: String) -> [XCUIElement] {
        app.buttons.matching(identifier: "course-archived-remove-" + id).allElementsBoundByIndex.filter {
            $0.exists && $0.isHittable && $0.isEnabled && !$0.frame.isEmpty && app.windows.firstMatch.frame.contains($0.frame)
        }
    }
    private func tapRemoval(_ id: String) throws {
        let visible = visibleRemoval(id); try require(visible.count == 1, "Only the exact owned removal ID may be tapped.")
        try tap(try XCTUnwrap(visible.first))
    }
    private func swipeArchivedRemoval(_ id: String) throws {
        try require(element("course-archived-list").exists, "Only the current owned archive layer may expose this action.")
        try exposeRemoval(id, name: "archive-" + id + "-remove")
        try tapRemoval(id)
    }
    private func revealReadOnlyPlusExplanation() throws {
        let marks = app.images.matching(identifier: "appearance-plus-required")
        let forms = app.collectionViews.allElementsBoundByIndex.filter { $0.exists && !$0.frame.isEmpty }
        try require(forms.count == 1, "Bind the one actual native appearance Form for read-only visibility and real scrolling.")
        let form = try XCTUnwrap(forms.first)
        let rows = form.cells.containing(.image, identifier: "appearance-plus-required")
        for up in [true, false] { for _ in 0..<8 {
            let window = app.windows.firstMatch.frame
            let bounds = form.frame.intersection(window)
            let top = max(bounds.minY, app.navigationBars.allElementsBoundByIndex.filter {
                $0.exists && !$0.frame.isEmpty && window.intersects($0.frame)
            }.map { $0.frame.maxY }.max() ?? bounds.minY)
            let viewport = CGRect(x: bounds.minX + 2, y: top + 2, width: bounds.width - 4, height: bounds.maxY - top - 4)
            let visibleRows = rows.allElementsBoundByIndex.filter { $0.exists && !$0.frame.isEmpty && viewport.contains($0.frame) }
            let visibleMarks = marks.allElementsBoundByIndex.filter { $0.exists && !$0.frame.isEmpty && viewport.contains($0.frame) }
            if rows.count == 1 && marks.count == 1 && visibleRows.count == 1 && visibleMarks.count == 1 && !viewport.isEmpty {
                let geometry = XCTAttachment(string: "readOnlyWarningRow=\(visibleRows[0].frame)\nlockMark=\(visibleMarks[0].frame)\nform=\(form.frame)\nwindow=\(window)\nvisibleViewport=\(viewport)")
                geometry.name = "private-appearance-probe-readonly-banner-viewport"; geometry.lifetime = .keepAlways; add(geometry)
                return
            }
            if marks.count > 0 { diagnostic("readonly-banner-not-yet-completely-visible") }
            try require(form.exists && !form.frame.isEmpty && !viewport.isEmpty && viewport.height > 120
                && app.navigationBars.containing(.button, identifier: "appearance-save").count == 1,
                "Scroll only the unique current appearance Form with a valid visible viewport; its container need not be hittable.")
            let x = viewport.minX + 6
            let upper = CGPoint(x: x, y: viewport.minY + viewport.height * 0.25)
            let lower = CGPoint(x: x, y: viewport.minY + viewport.height * 0.75)
            let from = up ? lower : upper, to = up ? upper : lower
            let route = CGRect(x: x - 1, y: upper.y, width: 2, height: lower.y - upper.y)
            let buttons = form.buttons.allElementsBoundByIndex.filter { $0.exists && !$0.frame.isEmpty }
            try require(viewport.contains(route) && buttons.allSatisfy { !route.intersects($0.frame.insetBy(dx: -1, dy: -1)) },
                "The fixed-window scroll route must stay inside the Form gutter, clear of navigation and actual buttons.")
            let mainWindow = app.windows.firstMatch
            try require(mainWindow.frame == window, "Keep the measured window geometry before the single genuine scroll.")
            mainWindow.coordinate(withNormalizedOffset: .zero).withOffset(CGVector(dx: from.x-window.minX, dy: from.y-window.minY))
                .press(forDuration: 0.05, thenDragTo: mainWindow.coordinate(withNormalizedOffset: .zero)
                    .withOffset(CGVector(dx: to.x-window.minX, dy: to.y-window.minY)))
        } }
        try require(false, "The unique exact Plus explanation row and lock mark must both be fully visible in the actual Form viewport.")
    }
    private func waitForBookmark(saved: Bool) throws {
        let labels = saved ? ["Remove bookmark", "取消收藏", "Lesezeichen entfernen"] : ["Save course", "收藏课程", "Kurs speichern"]
        let query = app.buttons.matching(identifier: "course-save")
        try require(waitUntil(timeout: 30) {
            let controls = query.allElementsBoundByIndex.filter(\.exists)
            return controls.count == 1 && controls[0].isEnabled && controls[0].isHittable && labels.contains(controls[0].label)
        }, "The real bookmark request and detail reload must finish with the exact new action label before its independent data phase.")
    }
    private var scroll: XCUIElement { if app.collectionViews.firstMatch.exists { return app.collectionViews.firstMatch }; if app.tables.firstMatch.exists { return app.tables.firstMatch }; return app.scrollViews.firstMatch }
    private func reveal(_ target: XCUIElement) throws {
        for direction in [true, false] { for _ in 0..<12 {
            if target.exists && target.isHittable && app.windows.firstMatch.frame.contains(target.frame) { return }
            if !scroll.exists { break }; if direction { scroll.swipeUp(velocity: .slow) } else { scroll.swipeDown(velocity: .slow) }
        } }
        try require(target.exists && target.isHittable, "The intended exact campus control must be reachable.")
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
    private func require(_ condition: Bool, _ message: String) throws { guard condition else { XCTFail(message); throw NSError(domain: "FiveRootMeCampusUI", code: 1) } }
    private func phase(_ value: String) throws { print("ME_CAMPUS_PHASE \(fixture.meCampus.selectedCase) \(value)"); fflush(stdout); try FiveRootQAReadBarrier.wait(for: value) }
    private func capture(_ name: String) throws {
        try require(app.state == .runningForeground && !app.textFields["login-identifier"].exists && !app.secureTextFields.firstMatch.exists,
            "Capture only owned business UI, never credentials or ordinary Photos.")
        let attachment = XCTAttachment(screenshot: app.screenshot()); attachment.name = "me-campus-" + name; attachment.lifetime = .keepAlways; add(attachment)
    }
}
