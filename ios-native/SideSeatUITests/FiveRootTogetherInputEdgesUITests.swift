import XCTest
import Darwin

/// Opt-in local real-service edges. The UI owns every intention create/delete.
/// HTTP is limited to owned-account GETs and the explicit loopback fault switch.
@MainActor final class FiveRootTogetherInputEdgesUITests: XCTestCase {
    private struct Account: Decodable {
        let role: String
        let identifier: String
        let password: String
        let id: String
        let accessToken: String
    }
    private struct Fixture: Decodable {
        let baseURL: String
        let bundle: String?
        let accounts: [Account]
        let inputTimingTitle: String?
        let inputRetryTitle: String?
        let customClockTitle: String?
    }
    private struct FaultState: Decodable {
        let pending: Bool
        let injected: Int
    }
    private var fixture: Fixture!
    private var app: XCUIApplication!
    private let environment = ProcessInfo.processInfo.environment

    override func setUpWithError() throws {
        continueAfterFailure = false
        let file = environment["SIDESEAT_FIVE_ROOT_FIXTURE"] ?? ""
        try XCTSkipUnless(!file.isEmpty, "Set the private five-root fixture path.")
        fixture = try JSONDecoder().decode(Fixture.self, from: Data(contentsOf: URL(fileURLWithPath: file)))
        XCTAssertEqual(fixture.baseURL, "http://127.0.0.1:3344", "These cases use only the owned local API.")
        XCTAssertEqual(Set(fixture.accounts.map(\.role)), Set(["owner", "peer"]))
        XCTAssertEqual(Set(fixture.accounts.map(\.id)).count, 2)
        XCTAssertTrue(fixture.accounts.allSatisfy { $0.identifier.hasPrefix("e2e_roots_\($0.role)_") })
    }

    override func tearDown() async throws {
        await MainActor.run { app?.terminate() }
    }

    func testCustomExactClockPersists() async throws {
        let title = fixture.customClockTitle ?? "同行自选钟点 " + fixture.accounts.first { $0.role == "owner" }!.id.suffix(8)
        let baseline = try await ownIntentions("owner")
        login("owner")
        openTogetherAndNew()
        chooseTopic("coffee")
        replaceActivity(title)
        openTimePicker()
        normalizeToSingleWindow()
        try requireClock(starts.count == 1, "Custom-clock setup requires exactly one real window.")
        let start = starts.firstMatch
        let end = app.datePickers.matching(NSPredicate(format: "identifier BEGINSWITH %@", "intent-time-end-")).firstMatch
        reveal(end)
        let originalStart = try compactDate(start)
        let originalEnd = try compactDate(end)
        let clock = try clockButton(end)
        let previousClock = clock.label
        let parts = previousClock.split(separator: ":").compactMap { Int($0) }
        try requireClock(parts.count == 2, "The compact clock must expose hours and minutes.")
        let hour = try XCTUnwrap(parts.first)
        let minute = try XCTUnwrap(parts.last)
        try requireClock([0, 15, 30, 45].contains(minute), "The current clock must use the real 15-minute interval.")
        // This native-clock case does not claim the unobserved calendar/midnight UI.
        // Fail before mutation if a different day would be required; never silently skip/pass.
        try requireClock(hour != 23 || minute != 45,
            "23:45 requires the separate, unobserved native date-picker boundary. No custom-time acceptance is recorded.")
        let targetHour = minute == 45 ? hour + 1 : hour
        let targetMinute = (minute + 15) % 60
        let targetClock = String(format: "%02d:%02d", targetHour, targetMinute)
        try requireClock(targetClock != previousClock, "The requested custom clock must actually differ.")
        try requireClock(clock.isHittable, "The real compact clock must be reachable.")
        clock.tap()
        try requireClock(app.buttons["PopoverDismissRegion"].waitForExistence(timeout: 5), "The observed UIKit popover must open.")
        try requireClock(app.pickerWheels.count == 2, "The observed UIKit popover must expose exactly two wheels.")
        let hourWheel = app.pickerWheels.matching(NSPredicate(format: "value MATCHES %@", "[0-9]{1,2}点")).firstMatch
        let minuteWheel = app.pickerWheels.matching(NSPredicate(format: "value MATCHES %@", "[0-9]{2}分钟")).firstMatch
        try requireClock(hourWheel.exists && minuteWheel.exists, "Both actual native clock wheels must exist.")
        try requireClock(hourWheel.value as? String == "\(hour)点", "The initial native hour must match the compact control.")
        try requireClock(minuteWheel.value as? String == String(format: "%02d分钟", minute), "The initial native minute must match the compact control.")
        // UIKit's selectable values are numeric; its accessibility readback adds Chinese units.
        if targetHour != hour { hourWheel.adjust(toPickerWheelValue: String(targetHour)) }
        minuteWheel.adjust(toPickerWheelValue: String(format: "%02d", targetMinute))
        try requireClock(waitUntil {
            hourWheel.value as? String == "\(targetHour)点" &&
            minuteWheel.value as? String == String(format: "%02d分钟", targetMinute)
        }, "The real UIKit wheels must reach the requested later clock value.")
        capture("custom-clock-native-value-changed")
        // The actual inspected dismiss region fills the screen and overlaps the wheels.
        // Its left blank edge is outside the observed UIKit popover; never tap its center.
        let window = app.windows.firstMatch
        window.coordinate(withNormalizedOffset: CGVector(dx: 0, dy: 0))
            .withOffset(CGVector(dx: 8, dy: window.frame.height / 2)).tap()
        try requireClock(app.buttons["PopoverDismissRegion"].waitForNonExistence(timeout: 5), "The native clock popover must close before outer Done.")
        try requireClock(try clockButton(end).label == targetClock, "The value must not be clamped back by minimumDate.")
        try requireClock(try compactDate(start) == originalStart, "Changing the end clock must preserve the exact start.")
        try requireClock(try compactDate(end) == originalEnd.addingTimeInterval(15 * 60), "The compact end must advance exactly 15 minutes.")
        let done = app.buttons["intent-time-picker-done"]
        try requireClock(done.waitForExistence(timeout: 5) && done.isEnabled, "The outer time-picker Done must be available.")
        done.tap()
        try requireClock(element("intent-time-picker-fields").waitForNonExistence(timeout: 8), "Outer Done must return to the intention editor.")
        let windows = selectedTimeLabels
        try requireClock(windows.count == 1, "The editor must show exactly the custom selected window.")
        capture("custom-clock-confirmed-summary")
        phase("custom-clock-adjusted")
        reveal(save)
        try requireClock(save.isEnabled, "The valid custom window must be publishable.")
        save.tap()
        try requireClock(element("intent-editor").waitForNonExistence(timeout: 20), "The real custom-clock save must finish successfully.")
        let persisted = try await ownIntentions("owner")
        let created = try XCTUnwrap(matching(persisted, title: title).only)
        try requireClock(created["topic"] as? String == "COFFEE", "The saved custom intention must retain its selected category.")
        try requireClock((created["timePreference"] as? [String: Any])?["kind"] as? String == "EXACT", "The saved custom intention must retain exact timing.")
        let stored = try XCTUnwrap((created["timeWindows"] as? [[String: Any]])?.only)
        try requireClock(try parseISO(try XCTUnwrap(stored["startAt"] as? String)) == originalStart, "The real API must retain the exact UI-selected start.")
        try requireClock(try parseISO(try XCTUnwrap(stored["endAt"] as? String)) == originalEnd.addingTimeInterval(15 * 60), "The real API must retain the exact custom end.")
        let previousIDs = Set(baseline.compactMap { $0["id"] as? String })
        try requireClock(previousIDs.isSubset(of: Set(persisted.compactMap { $0["id"] as? String })), "The custom-clock case must preserve existing intentions.")
        let id = try XCTUnwrap(created["id"] as? String)
        showOwn(id)
        app.buttons["weekly-intent-edit-\(id)"].tap()
        try requireClock(element("intent-editor").waitForExistence(timeout: 8), "The saved intention must reopen for readback.")
        try requireClock(activityText == title && selectedTimeLabels == windows, "Reopening must retain the exact title and custom summary.")
        openTimePicker()
        try requireClock(starts.count == 1, "Reopening must retain one custom window.")
        let reopenedEnd = app.datePickers.matching(NSPredicate(format: "identifier BEGINSWITH %@", "intent-time-end-")).firstMatch
        try requireClock(try clockButton(reopenedEnd).label == targetClock, "The reopened native clock must retain the custom value.")
        try requireClock(try compactDate(starts.firstMatch) == originalStart, "The reopened native start must match the saved start.")
        try requireClock(try compactDate(reopenedEnd) == originalEnd.addingTimeInterval(15 * 60), "The reopened native end must match the saved custom end.")
        capture("custom-clock-reopened-exact-readback")
        app.buttons["intent-time-picker-cancel"].tap()
        try requireClock(element("intent-time-picker-fields").waitForNonExistence(timeout: 8), "The readback picker must cancel.")
        cancelEditor()
        try requireClock(!element("intent-editor").exists, "The readback editor must cancel before cleanup.")
        phase("custom-clock-saved")
        deleteOwn(id)
        let cleaned = try await ownIntentions("owner")
        try requireClock(matching(cleaned, title: title).isEmpty, "UI cleanup must remove only this custom-clock intention.")
        try requireClock(previousIDs.isSubset(of: Set(cleaned.compactMap { $0["id"] as? String })), "UI cleanup must preserve existing intentions.")
        phase("custom-clock-ui-deleted")
    }

    func testTimingCategoriesAndDraftIsolation() async throws {
        let title = fixture.inputTimingTitle ?? "同行时间边界 " + fixture.accounts.first { $0.role == "owner" }!.id.suffix(8)
        let baseline = try await ownIntentions("owner")
        let peerBaseline = try await ownIntentions("peer")
        login("owner")
        openTogetherAndNew()

        // All three categories accept an empty optional description; limits use UTF-16 units.
        for (topic, limit) in [("coffee", 80), ("study", 80), ("sports", 60)] {
            chooseTopic(topic)
            replaceActivity("")
            XCTAssertTrue(save.isEnabled, "The activity description is optional for this category.")
            replaceActivity(String(repeating: "x", count: limit + 1))
            XCTAssertEqual(activityText.utf16.count, limit + 1)
            XCTAssertFalse(save.isEnabled)
            XCTAssertTrue(element("intent-editor-issue").waitForExistence(timeout: 5))
            replaceActivity(String(repeating: "x", count: limit))
            XCTAssertTrue(waitUntil { self.save.isEnabled })
        }
        chooseTopic("coffee")
        replaceActivity(title)
        chooseTopic("study")
        XCTAssertEqual(activityText, title, "Changing category retains the entered description.")
        chooseTopic("coffee")
        XCTAssertTrue(app.buttons["intent-topic-coffee"].isSelected)
        setUndecided()
        // A rerun may restore an earlier private draft with several exact windows.
        openTimePicker()
        normalizeToSingleWindow()
        finishTimePicker()
        setUndecided()
        let undecided = timing.label
        XCTAssertEqual(selectedTimeLabels.count, 0)
        capture("categories-and-undecided")
        phase("categories-validated")

        openTimePicker()
        normalizeToSingleWindow()
        let originalPicker = pickerValues()
        addTime()
        XCTAssertEqual(starts.count, 2)
        app.buttons["intent-time-picker-cancel"].tap()
        XCTAssertTrue(element("intent-time-picker-fields").waitForNonExistence(timeout: 8))
        XCTAssertEqual(timing.label, undecided)
        XCTAssertEqual(selectedTimeLabels.count, 0, "Cancelling the picker must keep time undecided.")

        openTimePicker()
        XCTAssertEqual(starts.count, 1)
        XCTAssertEqual(pickerValues(), originalPicker)
        addTime()
        XCTAssertEqual(starts.count, 2)
        finishTimePicker()
        let windows = selectedTimeLabels
        XCTAssertEqual(windows.count, 2)
        XCTAssertEqual(Set(windows).count, 2, "The two real future windows must be distinct.")
        capture("two-exact-windows")
        phase("exact-windows-selected")

        openTimePicker()
        addTime()
        XCTAssertEqual(starts.count, 3)
        app.buttons["intent-time-picker-cancel"].tap()
        XCTAssertTrue(element("intent-time-picker-fields").waitForNonExistence(timeout: 8))
        XCTAssertEqual(selectedTimeLabels, windows, "Cancelling a later edit keeps both confirmed windows.")
        setUndecided()
        XCTAssertEqual(timing.label, undecided)
        XCTAssertEqual(selectedTimeLabels.count, 0)
        // Clearing chooses UNDECIDED; the existing implementation retains its private exact draft.
        openTimePicker()
        XCTAssertEqual(starts.count, 2)
        finishTimePicker()
        XCTAssertEqual(selectedTimeLabels, windows)
        cancelEditor()
        openNew()
        assertDraft(title: title, windows: windows)
        cancelEditor()
        phase("cancel-reopen-preserved")

        login("owner")
        openTogetherAndNew()
        assertDraft(title: title, windows: windows)
        capture("draft-restored-after-relaunch")
        cancelEditor()
        login("peer")
        openTogetherAndNew()
        XCTAssertNotEqual(activityText, title, "A second account must not inherit the owner's private draft.")
        capture("peer-draft-isolated")
        cancelEditor()
        let beforeSave = try await ownIntentions("owner")
        let peerAfterDraft = try await ownIntentions("peer")
        assertExistingPreserved(baseline, in: beforeSave)
        assertExistingPreserved(peerBaseline, in: peerAfterDraft)
        XCTAssertEqual(matching(beforeSave, title: title).count, 0)
        XCTAssertEqual(matching(peerAfterDraft, title: title).count, 0)
        phase("account-drafts-isolated")

        login("owner")
        openTogetherAndNew()
        assertDraft(title: title, windows: windows)
        saveEditor()
        let after = try await ownIntentions("owner")
        let created = try XCTUnwrap(matching(after, title: title).only, "Exactly one UI-created edge intention must exist.")
        XCTAssertEqual(created["topic"] as? String, "COFFEE")
        XCTAssertEqual((created["timePreference"] as? [String: Any])?["kind"] as? String, "EXACT")
        try assertWindows(created, match: windows)
        assertExistingPreserved(baseline, in: after)
        let id = try XCTUnwrap(created["id"] as? String)
        showOwn(id)
        app.buttons["weekly-intent-edit-\(id)"].tap()
        XCTAssertTrue(element("intent-editor").waitForExistence(timeout: 8))
        XCTAssertEqual(activityText, title)
        XCTAssertEqual(selectedTimeLabels, windows)
        capture("saved-exact-windows-readback")
        cancelEditor()
        phase("exact-save-readback")
        deleteOwn(id)
        let cleaned = try await ownIntentions("owner")
        XCTAssertEqual(matching(cleaned, title: title).count, 0)
        assertExistingPreserved(baseline, in: cleaned)
        phase("timing-edge-ui-deleted")
    }

    func testSaveFailurePreservesDraftAndRetry() async throws {
        let title = fixture.inputRetryTitle ?? "同行重试边界 " + fixture.accounts.first { $0.role == "owner" }!.id.suffix(8)
        let baseline = try await ownIntentions("owner")
        login("owner", appBaseURL: "http://127.0.0.1:3345")
        openTogetherAndNew()
        chooseTopic("coffee")
        replaceActivity(title)
        setUndecided()
        openTimePicker()
        normalizeToSingleWindow()
        addTime()
        finishTimePicker()
        let windows = selectedTimeLabels
        XCTAssertEqual(windows.count, 2)
        let priorFaults = try await injectNextSaveFailure()
        reveal(save)
        XCTAssertTrue(save.isEnabled)
        save.tap()
        XCTAssertTrue(element("intent-editor-issue").waitForExistence(timeout: 15))
        XCTAssertTrue(element("intent-editor").exists)
        XCTAssertEqual(activityText, title)
        XCTAssertEqual(selectedTimeLabels, windows)
        XCTAssertTrue(waitUntil { self.save.isEnabled })
        XCTAssertTrue(app.staticTexts["服务暂时不可用，请稍后再试。"].exists, "503 must explain the retry in the selected Chinese locale.")
        capture("save-503-retains-input-and-times")
        let failed = try await ownIntentions("owner")
        let consumed = try await faultState()
        XCTAssertFalse(consumed.pending)
        XCTAssertEqual(consumed.injected, priorFaults + 1, "The proxy must intercept exactly this save without forwarding it.")
        XCTAssertEqual(matching(failed, title: title).count, 0, "The fault must not reach the real service.")
        assertExistingPreserved(baseline, in: failed)
        phase("save-failed-no-server-write")

        saveEditor()
        let retried = try await ownIntentions("owner")
        let afterRetry = try await faultState()
        XCTAssertFalse(afterRetry.pending)
        XCTAssertEqual(afterRetry.injected, priorFaults + 1, "Retry must use the real upstream without another injected failure.")
        let created = try XCTUnwrap(matching(retried, title: title).only, "Retry must create exactly one intention.")
        XCTAssertEqual(created["topic"] as? String, "COFFEE")
        try assertWindows(created, match: windows)
        assertExistingPreserved(baseline, in: retried)
        let id = try XCTUnwrap(created["id"] as? String)
        showOwn(id)
        capture("retry-created-once")
        phase("save-retry-created-once")
        deleteOwn(id)
        let cleaned = try await ownIntentions("owner")
        XCTAssertEqual(matching(cleaned, title: title).count, 0)
        assertExistingPreserved(baseline, in: cleaned)
        phase("retry-edge-ui-deleted")
    }

    private var activity: XCUIElement { element("intent-editor-activity") }
    private var activityText: String {
        let value = activity.value as? String ?? ""
        return value == activity.placeholderValue ? "" : value
    }
    private var save: XCUIElement { app.buttons["intent-editor-save"].firstMatch }
    private var timing: XCUIElement { app.buttons["intent-timing-choose"] }
    private var starts: XCUIElementQuery {
        app.datePickers.matching(NSPredicate(format: "identifier BEGINSWITH %@", "intent-time-start-"))
    }
    private var selectedTimeLabels: [String] {
        app.descendants(matching: .any).matching(NSPredicate(format: "identifier BEGINSWITH %@", "intent-selected-time-"))
            .allElementsBoundByIndex.map(\.label)
    }
    private func element(_ id: String) -> XCUIElement {
        app.descendants(matching: .any).matching(identifier: id).firstMatch
    }

    private func login(_ role: String, appBaseURL: String? = nil) {
        let account = fixture.accounts.first { $0.role == role }!
        app?.terminate()
        let bundle = environment["SIDESEAT_FIVE_ROOT_QA_BUNDLE"]
            ?? environment["SIDESEAT_PLAN_PRESENTATION_QA_BUNDLE"] ?? fixture.bundle ?? "app.sideseat.mobile.preview"
        app = XCUIApplication(bundleIdentifier: bundle)
        app.launchArguments = ["--ui-testing-signed-out", "--ui-testing-ephemeral-credentials", "--ui-testing-skip-tutorial",
            "--ui-testing-language=zh-Hans", "--ui-testing-appearance=light", "--ui-testing-local-api",
            "-UIPreferredContentSizeCategoryName", "UICTContentSizeCategoryL"]
        app.launchEnvironment = ["SIDESEAT_API_BASE_URL_OVERRIDE": appBaseURL ?? fixture.baseURL]
        app.launch()
        let identifier = app.textFields["login-identifier"]
        XCTAssertTrue(identifier.waitForExistence(timeout: 15)); identifier.tap(); identifier.typeText(account.identifier)
        let password = app.secureTextFields["login-password"]
        XCTAssertTrue(password.exists); password.tap(); password.typeText(account.password)
        app.buttons["login-submit"].tap()
        XCTAssertTrue(app.tabBars.firstMatch.waitForExistence(timeout: 30), "The verified local account must sign in through the real form.")
        let springboard = XCUIApplication(bundleIdentifier: "com.apple.springboard")
        let deny = springboard.buttons.matching(NSPredicate(format: "label IN %@", ["不允许", "Don’t Allow", "Don't Allow"])).firstMatch
        if deny.waitForExistence(timeout: 1) { deny.tap() }
    }

    private func openTogetherAndNew() {
        let tab = app.tabBars.buttons.matching(NSPredicate(format: "label IN %@", ["同行", "Together"])).firstMatch
        XCTAssertTrue(tab.waitForExistence(timeout: 10)); tab.tap()
        XCTAssertTrue(element("together-home").waitForExistence(timeout: 15))
        let recommendations = app.buttons["together-tab-recommendations"]
        if !recommendations.exists {
            let menu = app.buttons["together-section-menu"]
            XCTAssertTrue(menu.waitForExistence(timeout: 8)); menu.tap()
        }
        XCTAssertTrue(recommendations.waitForExistence(timeout: 8)); recommendations.tap()
        XCTAssertTrue(element("together-section-picker").waitForNonExistence(timeout: 8))
        openNew()
    }

    private func openNew() {
        let add = app.buttons["together-add-intent"]
        let first = app.buttons["together-add-first-intent"]
        XCTAssertTrue(waitUntil { add.exists || first.exists })
        let target = add.exists ? add : first
        reveal(target); target.tap()
        XCTAssertTrue(element("intent-editor").waitForExistence(timeout: 10))
    }
    private func chooseTopic(_ topic: String) {
        let option = app.buttons["intent-topic-\(topic)"]
        reveal(option); option.tap()
        XCTAssertTrue(option.isSelected)
    }
    private func replaceActivity(_ value: String) {
        reveal(activity); activity.tap()
        for _ in 0..<3 where !activityText.isEmpty {
            activity.press(forDuration: 1.1)
            let selectAll = app.descendants(matching: .any).matching(NSPredicate(format: "label IN %@", ["全选", "Select All"])).firstMatch
            if selectAll.waitForExistence(timeout: 2) {
                selectAll.tap()
                activity.typeText(XCUIKeyboardKey.delete.rawValue)
            } else {
                let cut = app.descendants(matching: .any).matching(NSPredicate(format: "label IN %@", ["剪切", "Cut"])).firstMatch
                XCTAssertTrue(cut.waitForExistence(timeout: 2), "The real system editing menu must allow clearing the selected text.")
                cut.tap()
            }
        }
        XCTAssertEqual(activityText, "", "Replace must clear the actual input before entering a new value.")
        if !value.isEmpty { activity.typeText(value) }
        XCTAssertEqual(activityText, value, "The field must contain exactly the replacement text.")
    }
    private func openTimePicker() {
        reveal(timing); timing.tap()
        XCTAssertTrue(element("intent-time-picker-fields").waitForExistence(timeout: 8))
    }
    private func setUndecided() {
        openTimePicker()
        let clear = app.buttons["intent-time-clear"]
        reveal(clear); clear.tap()
        XCTAssertTrue(element("intent-time-picker-fields").waitForNonExistence(timeout: 8))
        XCTAssertEqual(selectedTimeLabels.count, 0)
        XCTAssertTrue(timing.label.contains("待定"), "Clearing must return the form to undecided time.")
    }
    private func normalizeToSingleWindow() {
        for _ in 0..<6 where starts.count > 1 {
            let removes = app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH %@", "intent-time-remove-"))
            let remove = removes.element(boundBy: removes.count - 1)
            reveal(remove); remove.tap()
        }
        XCTAssertEqual(starts.count, 1)
    }
    private func addTime() {
        let add = app.buttons["intent-time-add"]
        reveal(add); XCTAssertTrue(add.isEnabled); add.tap()
    }
    private func pickerValues() -> [[String]] {
        starts.allElementsBoundByIndex.map { picker in
            let values = picker.buttons.allElementsBoundByIndex.map(\.label)
            XCTAssertFalse(values.isEmpty, "The real compact picker must expose date/time values.")
            return values
        }
    }
    private func requireClock(_ condition: Bool, _ message: String) throws {
        guard condition else {
            XCTFail(message)
            throw NSError(domain: "FiveRootTogetherCustomClock", code: 1, userInfo: [NSLocalizedDescriptionKey: message])
        }
    }
    private func clockButton(_ picker: XCUIElement) throws -> XCUIElement {
        let values = picker.buttons.matching(NSPredicate(format: "label MATCHES %@", "[0-9]{1,2}:[0-9]{2}"))
        try requireClock(values.count == 1, "The observed compact picker must expose one exact clock button.")
        return values.firstMatch
    }
    private func compactDate(_ picker: XCUIElement) throws -> Date {
        let dates = picker.buttons.matching(NSPredicate(format: "label MATCHES %@", "[0-9]{4}年[0-9]{1,2}月[0-9]{1,2}日"))
        try requireClock(dates.count == 1, "The observed compact picker must expose one exact date button.")
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "zh-Hans")
        formatter.calendar = Calendar.current
        formatter.timeZone = .current
        formatter.dateFormat = "yyyy年M月d日 HH:mm"
        return try XCTUnwrap(formatter.date(from: dates.firstMatch.label + " " + (try clockButton(picker)).label),
            "The visible compact date and clock must parse exactly.")
    }
    private func finishTimePicker() {
        let done = app.buttons["intent-time-picker-done"]
        XCTAssertTrue(done.waitForExistence(timeout: 5)); XCTAssertTrue(done.isEnabled); done.tap()
        XCTAssertTrue(element("intent-time-picker-fields").waitForNonExistence(timeout: 8))
    }
    private func assertDraft(title: String, windows: [String]) {
        XCTAssertTrue(element("intent-editor-draft-restored").waitForExistence(timeout: 8))
        XCTAssertEqual(activityText, title)
        XCTAssertEqual(selectedTimeLabels, windows)
        XCTAssertTrue(app.buttons["intent-topic-coffee"].isSelected)
    }
    private func cancelEditor() {
        let cancel = navigation(["取消", "Cancel"])
        XCTAssertTrue(cancel.waitForExistence(timeout: 5)); cancel.tap()
        XCTAssertTrue(element("intent-editor").waitForNonExistence(timeout: 8))
    }
    private func saveEditor() {
        reveal(save); XCTAssertTrue(save.isEnabled); save.tap()
        XCTAssertTrue(element("intent-editor").waitForNonExistence(timeout: 20), "The real save must finish successfully.")
    }
    private func showOwn(_ id: String) {
        let rail = app.scrollViews["together-intention-rail"]
        reveal(rail)
        let edit = app.buttons["weekly-intent-edit-\(id)"]
        for _ in 0..<8 where !edit.isHittable { rail.swipeLeft() }
        for _ in 0..<8 where !edit.isHittable { rail.swipeRight() }
        XCTAssertTrue(edit.waitForExistence(timeout: 8)); reveal(edit)
    }
    private func deleteOwn(_ id: String) {
        showOwn(id)
        let menu = app.buttons["weekly-intent-menu-\(id)"]
        reveal(menu); menu.tap()
        let remove = app.buttons["weekly-intent-delete-\(id)"]
        XCTAssertTrue(remove.waitForExistence(timeout: 8)); remove.tap()
        let confirm = app.buttons["weekly-intent-delete-confirm-\(id)"]
        XCTAssertTrue(confirm.waitForExistence(timeout: 5)); confirm.tap()
        XCTAssertTrue(app.buttons["weekly-intent-edit-\(id)"].waitForNonExistence(timeout: 15))
    }
    private func navigation(_ labels: [String]) -> XCUIElement {
        app.navigationBars.buttons.matching(NSPredicate(format: "label IN %@", labels)).firstMatch
    }
    private func reveal(_ target: XCUIElement) {
        XCTAssertTrue(target.waitForExistence(timeout: 10))
        let container: XCUIElement
        if element("intent-time-picker-fields").exists { container = element("intent-time-picker-fields") }
        else if element("intent-editor-fields").exists { container = element("intent-editor-fields") }
        else { container = app.scrollViews["together-section-recommendations"].firstMatch }
        for _ in 0..<8 where !target.isHittable { container.swipeUp() }
        for _ in 0..<8 where !target.isHittable { container.swipeDown() }
        XCTAssertTrue(target.isHittable, "The original UI control must be reachable.")
    }

    private func ownIntentions(_ role: String) async throws -> [[String: Any]] {
        let account = try XCTUnwrap(fixture.accounts.first { $0.role == role })
        var request = URLRequest(url: try XCTUnwrap(URL(string: fixture.baseURL + "/api/v1/me/weekly-intents")))
        request.httpMethod = "GET"
        request.timeoutInterval = 30
        request.httpShouldHandleCookies = false
        request.cachePolicy = .reloadIgnoringLocalCacheData
        request.setValue("Bearer \(account.accessToken)", forHTTPHeaderField: "Authorization")
        request.setValue("ios", forHTTPHeaderField: "X-SideSeat-Platform")
        request.setValue("1", forHTTPHeaderField: "X-SideSeat-Persistent-Intent")
        let (data, response) = try await URLSession.shared.data(for: request)
        XCTAssertEqual((response as? HTTPURLResponse)?.statusCode, 200, "Owned intention readback must succeed.")
        let envelope = try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])
        let payload = try XCTUnwrap(envelope["data"] as? [String: Any])
        return try XCTUnwrap(payload["intents"] as? [[String: Any]])
    }
    private func injectNextSaveFailure() async throws -> Int {
        let state = try await faultState()
        XCTAssertFalse(state.pending, "A previous controlled fault must not be pending.")
        var request = URLRequest(url: try XCTUnwrap(URL(string: "http://127.0.0.1:3345/__qa/fault")))
        request.httpMethod = "POST"
        request.timeoutInterval = 10
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONSerialization.data(withJSONObject: [
            "method": "POST", "path": "/api/v1/me/weekly-intents", "status": 503, "times": 1,
        ])
        let (_, response) = try await URLSession.shared.data(for: request)
        XCTAssertEqual((response as? HTTPURLResponse)?.statusCode, 200, "The owned loopback proxy must arm exactly one failed save.")
        return state.injected
    }
    private func faultState() async throws -> FaultState {
        var request = URLRequest(url: try XCTUnwrap(URL(string: "http://127.0.0.1:3345/__qa/state")))
        request.httpMethod = "GET"
        request.timeoutInterval = 10
        request.cachePolicy = .reloadIgnoringLocalCacheData
        let (data, response) = try await URLSession.shared.data(for: request)
        XCTAssertEqual((response as? HTTPURLResponse)?.statusCode, 200, "The local proxy state must be readable.")
        return try JSONDecoder().decode(FaultState.self, from: data)
    }
    private func matching(_ rows: [[String: Any]], title: String) -> [[String: Any]] {
        rows.filter { $0["activityText"] as? String == title }
    }
    private func assertExistingPreserved(_ baseline: [[String: Any]], in current: [[String: Any]]) {
        let previousIDs = Set(baseline.compactMap { $0["id"] as? String })
        let currentIDs = Set(current.compactMap { $0["id"] as? String })
        XCTAssertTrue(previousIDs.isSubset(of: currentIDs), "The edge case must preserve all pre-existing intentions.")
    }
    private func assertWindows(_ row: [String: Any], match labels: [String]) throws {
        let windows = try XCTUnwrap(row["timeWindows"] as? [[String: Any]])
        XCTAssertEqual(windows.count, labels.count)
        let locale = Locale(identifier: "zh-Hans")
        for (index, window) in windows.enumerated() {
            guard index < labels.count else { continue }
            let start = try parseISO(try XCTUnwrap(window["startAt"] as? String))
            let end = try parseISO(try XCTUnwrap(window["endAt"] as? String))
            XCTAssertGreaterThan(end.timeIntervalSince(start), 0)
            let day = start.formatted(.dateTime.month(.abbreviated).day().weekday(.abbreviated).locale(locale))
            let first = start.formatted(.dateTime.hour().minute().locale(locale))
            let last = Calendar.current.isDate(start, inSameDayAs: end)
                ? end.formatted(.dateTime.hour().minute().locale(locale))
                : end.formatted(.dateTime.month(.abbreviated).day().hour().minute().locale(locale))
            XCTAssertTrue(labels[index].contains(day), "Every persisted date must match the exact UI-selected window.")
            XCTAssertTrue(labels[index].contains("\(first)–\(last)"), "Every persisted start/end must match the exact UI-selected window.")
        }
    }
    private func parseISO(_ text: String) throws -> Date {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let value = formatter.date(from: text) { return value }
        formatter.formatOptions = [.withInternetDateTime]
        return try XCTUnwrap(formatter.date(from: text), "The owned API must return ISO dates.")
    }
    private func waitUntil(timeout: TimeInterval = 8, _ condition: () -> Bool) -> Bool {
        let deadline = Date().addingTimeInterval(timeout)
        repeat {
            if condition() { return true }
            RunLoop.current.run(until: Date().addingTimeInterval(0.2))
        } while Date() < deadline
        return condition()
    }
    private func capture(_ name: String) {
        XCTAssertFalse(app.secureTextFields["login-password"].exists, "Never capture credentials.")
        let attachment = XCTAttachment(screenshot: app.screenshot())
        attachment.name = "five-root-together-edge-\(name)"
        attachment.lifetime = .keepAlways
        add(attachment)
    }
    private func phase(_ name: String) {
        print("FIVE_ROOT_TOGETHER_EDGE_PHASE \(name)")
        fflush(stdout)
    }
}

private extension Array {
    var only: Element? { count == 1 ? first : nil }
}
