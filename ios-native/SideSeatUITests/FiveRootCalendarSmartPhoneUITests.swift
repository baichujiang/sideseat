import XCTest
import Darwin

/// Preparation-only real text flow. No mock authentication or Smart fill response.
/// Parse once, inspect the draft, use the current batch-save UI, and delete in UI.
@MainActor final class FiveRootCalendarSmartPhoneUITests: XCTestCase {
    private struct Account: Decodable { let role, id, identifier, password: String }
    private struct Fixture: Decodable {
        let kind, runID, baseURL, bundle: String
        let schemaVersion: Int
        let accounts: [Account]
    }
    private var fixture: Fixture!
    private var app: XCUIApplication!
    private var day: Date!
    private var eventID = ""
    private var title: String { "Smart \(fixture.runID)" }
    private let location = "QA图书馆", note = "自动填写验证"
    private var window: CGRect { app.windows.firstMatch.frame }
    private var editor: XCUIElement { app.collectionViews["event-editor-form"].firstMatch }
    private var draftEditor: XCUIElement { element("smart-schedule-draft-editor") }
    private var detail: XCUIElement { element("calendar-readonly-detail") }
    private var berlin: Calendar {
        var value = Calendar(identifier: .gregorian)
        value.timeZone = TimeZone(identifier: "Europe/Berlin")!
        return value
    }
    private func element(_ id: String) -> XCUIElement { app.descendants(matching: .any).matching(identifier: id).firstMatch }
    private func child(_ id: String, in container: XCUIElement) -> XCUIElement {
        container.descendants(matching: .any).matching(identifier: id).firstMatch
    }
    private var dateKey: String {
        let c = berlin.dateComponents([.year, .month, .day], from: day)
        return String(format: "%04d-%02d-%02d", c.year!, c.month!, c.day!)
    }
    private var text: String {
        "请安排一次活动，活动名为“\(title)”，日期为\(dateKey)，使用柏林时间10:00至11:00，地点为“\(location)”，备注为“\(note)”，仅此一次，不重复。"
    }

    override func setUpWithError() throws {
        continueAfterFailure = false
        try XCTSkipUnless(ProcessInfo.processInfo.environment["SIDESEAT_CALENDAR_SMART_EXECUTE"] == "1",
                          "Preparation only; root must authorize this isolated Smart fill text flow.")
    }
    override func tearDown() async throws { await MainActor.run { app?.terminate() } }

    func testSingleTextParseReviewApplySaveRelaunchDeleteAndPeerIsolation() throws {
        try begin()
        try tap(app.buttons["new-event"])
        try require(editor.waitForExistence(timeout: 15), "Open the genuine empty new-event form.")
        let smart = app.buttons["event-smart-fill"]
        try reveal(smart, in: editor); try tap(smart)
        let input = app.textViews["smart-schedule-input"], parse = app.buttons["smart-schedule-parse"]
        try require(input.waitForExistence(timeout: 15) && (input.value as? String ?? "").isEmpty
            && parse.exists && !parse.isEnabled, "Empty Smart fill must disable Preview events without opening media or permissions.")
        try tap(input); input.typeText(text)
        try require(input.value as? String == text && parse.isEnabled, "Type the complete safe owned sentence once into an empty field.")
        try phase("input-ready")
        // Exactly one UI parse tap. Never retry AI, replace its fields, or patch an API result to pass.
        try tap(parse)
        let rows = app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH 'smart-schedule-draft-'"))
        try require(element("smart-schedule-result-summary").waitForExistence(timeout: 90)
            && rows.count == 1 && rows.firstMatch.label == title, "The one real parse must produce exactly the explicitly named event.")
        capture("01-one-real-review-result")
        try tap(rows.firstMatch)
        try assertDraftFields()
        try phase("preview-ready")
        try tap(app.buttons["smart-draft-apply"])
        try require(draftEditor.waitForNonExistence(timeout: 15) && app.buttons["smart-schedule-save"].exists
            && rows.count == 1 && rows.firstMatch.label == title, "Apply returns to Smart review without saving or duplicating the draft.")
        capture("04-applied-still-unsaved")
        try phase("draft-applied")
        try tap(app.buttons["smart-schedule-save"])
        try require(element("smart-schedule-view").waitForNonExistence(timeout: 35)
            && editor.waitForNonExistence(timeout: 15) && app.buttons["calendar-search"].exists,
                    "Add 1 events must persist the batch and dismiss Smart fill and its outer new-event form by the current rules.")
        try search()
        let results = app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH 'calendar-search-result-'"))
        try require(results.firstMatch.waitForExistence(timeout: 25) && results.count == 1 && results.firstMatch.label.contains(title),
                    "The real saved event must appear exactly once in native search.")
        eventID = String(results.firstMatch.identifier.dropFirst("calendar-search-result-".count))
        try require(eventID.range(of: "^[A-Za-z0-9_-]{8,120}$", options: .regularExpression) != nil, "Retain the actual UI-created event identity.")
        print("CALENDAR_SMART_ID \(eventID)"); fflush(stdout)
        try tap(results.firstMatch); try assertDetailFields()
        try closeDetail()
        try tap(app.buttons["calendar-view-day"])
        let selectedDay = app.buttons["home-date-\(dateKey)"]
        try tap(selectedDay)
        try require(selectedDay.isSelected, "Select the explicit future Berlin day in the real date strip.")
        let timeline = app.buttons["calendar-timeline-event-\(eventID)"]
        try reveal(timeline, in: app.scrollViews["calendar-day-timeline"].firstMatch, gutter: true)
        try require(timeline.label == title, "The original saved identity must appear in the actual Calendar timeline.")
        capture("06-saved-calendar-timeline")
        try phase("event-created")

        try login("owner"); try openSavedDetail(); try assertDetailFields()
        capture("09-relogin-retains-original")
        try phase("owner-relaunched")
        try login("peer"); try assertSearchEmpty(); try assertNoNotifications()
        capture("10-peer-remains-empty")
        try phase("peer-isolated")

        try login("owner"); try openSavedDetail(); try assertDetailFields()
        try tap(app.buttons["calendar-detail-edit"])
        try require(editor.waitForExistence(timeout: 15), "Delete through the standard editor for the original event.")
        let remove = app.buttons.matching(NSPredicate(format: "label IN %@", ["删除日程", "删除活动", "Delete event"])).firstMatch
        try reveal(remove, in: editor); try tap(remove)
        try tap(app.buttons["event-delete-this"])
        try require(editor.waitForNonExistence(timeout: 25), "The actual single-event deletion must succeed.")
        if detail.exists { try closeDetail() }
        if element("calendar-search-sheet").exists { try closeSearch() }
        try assertSearchEmpty()
        capture("13-owner-deleted")
        try phase("event-deleted")
        try login("peer"); try assertSearchEmpty(); try assertNoNotifications()
        try login("owner"); try assertSearchEmpty(); try assertNoNotifications()
        capture("14-both-relogin-empty")
        try phase("cleaned")
        print("CALENDAR_SMART_END"); fflush(stdout)
    }

    private func begin() throws {
        try require(ProcessInfo.processInfo.environment["SIMULATOR_UDID"] == nil, "Use the default physical iPhone14Plus.")
        let raw = ProcessInfo.processInfo.environment["SIDESEAT_CALENDAR_SMART_FIXTURE_JSON"] ?? ""
        try require(!raw.isEmpty, "Inject only a fresh two-account auth-only factory fixture.")
        fixture = try JSONDecoder().decode(Fixture.self, from: Data(raw.utf8))
        try require(fixture.kind == "five-roots-live" && fixture.schemaVersion == 1 && fixture.baseURL == "https://api.sideseat.de"
            && fixture.bundle == "app.sideseat.mobile.preview" && fixture.runID.range(of: "^[a-f0-9]{12}$", options: .regularExpression) != nil,
                    "Use the owned production Preview factory contract.")
        try require(fixture.accounts.count == 2 && Set(fixture.accounts.map(\.role)) == ["owner", "peer"]
            && Set(fixture.accounts.map(\.id)).count == 2 && fixture.accounts.allSatisfy {
                $0.identifier == "e2e_roots_\($0.role)_\(fixture.runID)" && $0.password.count >= 24
            }, "Use exactly two distinct disposable factory identities.")
        day = try XCTUnwrap(berlin.date(byAdding: .day, value: 1, to: berlin.startOfDay(for: Date())))
        let start = try XCTUnwrap(berlin.date(bySettingHour: 10, minute: 0, second: 0, of: day))
        let end = try XCTUnwrap(berlin.date(bySettingHour: 11, minute: 0, second: 0, of: day))
        print("CALENDAR_SMART_BEGIN \(dateKey) \(start.ISO8601Format()) \(end.ISO8601Format())"); fflush(stdout)
        try login("owner"); try assertNoNotifications(); try calendarRoot()
        capture("00-fresh-calendar")
        try phase("signed-in")
    }
    private func login(_ role: String) throws {
        let account = try XCTUnwrap(fixture.accounts.first { $0.role == role })
        app?.terminate(); app = XCUIApplication(bundleIdentifier: fixture.bundle)
        app.launchArguments = ["--ui-testing-signed-out", "--ui-testing-ephemeral-credentials", "--ui-testing-skip-tutorial",
            "--ui-testing-language=zh-Hans", "--ui-testing-appearance=light", "-UIPreferredContentSizeCategoryName", "UICTContentSizeCategoryL"]
        app.launchEnvironment = [:]; app.launch()
        let name = app.textFields["login-identifier"]
        try require(name.waitForExistence(timeout: 25), "Use the real signed-out authentication flow.")
        name.tap(); name.typeText(account.identifier)
        let password = app.secureTextFields["login-password"]
        password.tap(); password.typeText(account.password); app.buttons["login-submit"].tap()
        try require(app.tabBars.firstMatch.waitForExistence(timeout: 35) && app.tabBars.buttons.count == 5, "Real authentication must reach the five-tab shell.")
        let deny = XCUIApplication(bundleIdentifier: "com.apple.springboard").buttons.matching(NSPredicate(format: "label IN %@", ["不允许", "Don’t Allow", "Don't Allow"])).firstMatch
        if deny.waitForExistence(timeout: 1) { deny.tap() }
        try calendarRoot()
    }
    private func calendarRoot() throws {
        try tap(app.tabBars.buttons.element(boundBy: 2))
        try require(app.buttons["calendar-search"].waitForExistence(timeout: 25), "The current Calendar root must load.")
    }
    private func assertDraftFields() throws {
        try require(draftEditor.waitForExistence(timeout: 15), "Open the actual parsed draft's details.")
        let form = app.collectionViews["smart-schedule-draft-editor"].firstMatch
        for (id, expected) in [("event-title", title), ("event-location", location), ("event-notes", note)] {
            let field = child(id, in: form)
            try reveal(field, in: form)
            try require((field.elementType == .textField || field.elementType == .textView) && field.value as? String == expected,
                        "Real parsing must preserve the exact supplied \(id) in this draft's text control, without test edits.")
            if id == "event-title" { try focusDraftTitleAndDismissWithoutEditing(field, expected: expected) }
            capture("02-draft-\(id)")
        }
        for (id, clock) in [("event-start", "10:00"), ("event-end", "11:00")] {
            let picker = child(id, in: form)
            try reveal(picker, in: form)
            let actual = ([picker.label, picker.value as? String ?? ""] + picker.descendants(matching: .any).allElementsBoundByIndex.map(\.label)).joined(separator: " ")
            let c = berlin.dateComponents([.year, .month, .day], from: day)
            let dates = ["\(c.year!)年\(c.month!)月\(c.day!)日", "\(c.year!)/\(c.month!)/\(c.day!)",
                         String(format: "%04d/%02d/%02d", c.year!, c.month!, c.day!),
                         String(format: "%02d.%02d.%04d", c.day!, c.month!, c.year!)]
            try require(dates.contains { actual.contains($0) } && actual.contains(clock), "The parsed native date/time must be exactly the explicit future Berlin day and clock.")
            capture("03-draft-\(id)")
        }
        let repeatRow = child("event-repeat", in: form)
        try reveal(repeatRow, in: form)
        try require(([repeatRow.label, repeatRow.value as? String ?? ""]).joined(separator: " ").contains("不重复")
            && !child("event-repeat-end-mode", in: form).exists, "The one-off request must not acquire a recurrence or recurrence end.")
    }
    private func focusDraftTitleAndDismissWithoutEditing(_ field: XCUIElement, expected: String) throws {
        try tap(field)
        let keyboard = app.keyboards.firstMatch
        let matches = app.buttons.matching(identifier: "smart-draft-keyboard-done")
        let done = matches.firstMatch
        try require(keyboard.waitForExistence(timeout: 10) && done.waitForExistence(timeout: 10),
                    "The visible parsed title must focus the real keyboard and SmartDraft utility Done.")
        let key = keyboard.frame.intersection(window)
        try require(!key.isNull && key.height > 120 && matches.count == 1
            && done.isEnabled && done.isHittable && done.frame.width > 0 && done.frame.height > 0
            && window.insetBy(dx: -0.5, dy: -0.5).contains(done.frame) && done.frame.maxY <= key.minY + 0.5,
                    "The unique enabled SmartDraft Done must be completely reachable above the actual keyboard.")
        try require(field.isHittable && window.insetBy(dx: -0.5, dy: -0.5).contains(field.frame)
            && field.frame.minY >= app.navigationBars.firstMatch.frame.maxY
            && field.frame.maxY <= done.frame.minY && field.value as? String == expected,
                    "The exact untouched AI title must stay fully visible above its utility after real focus.")
        capture("02-draft-title-focused-keyboard-done")
        done.tap()
        let deadline = Date().addingTimeInterval(5)
        var dismissed = false
        while Date() < deadline {
            let visible = keyboard.exists ? keyboard.frame.intersection(window) : CGRect.null
            dismissed = (visible.isNull || visible.height <= 1) && !done.exists
            if dismissed { break }
            RunLoop.current.run(until: Date().addingTimeInterval(0.1))
        }
        try require(dismissed && field.value as? String == expected,
                    "A real SmartDraft Done tap must remove keyboard and utility while preserving the AI title exactly.")
        capture("02-draft-title-done-dismissed-unchanged")
    }
    private func search() throws {
        try tap(app.buttons["calendar-search"])
        let field = app.searchFields.firstMatch
        try require(field.waitForExistence(timeout: 10) && ((field.value as? String ?? "").isEmpty || field.value as? String == field.placeholderValue),
                    "A fresh real search starts empty.")
        try tap(field); field.typeText(title)
    }
    private func openSavedDetail() throws {
        try search()
        let results = app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH 'calendar-search-result-'"))
        let target = app.buttons["calendar-search-result-\(eventID)"]
        try require(target.waitForExistence(timeout: 25) && results.count == 1 && target.label.contains(title), "Relogin must find exactly the original saved identity.")
        try tap(target)
    }
    private func assertDetailFields() throws {
        try require(detail.waitForExistence(timeout: 15) && detail.staticTexts[title].exists, "The actual detail must show the unique supplied title.")
        let form = detail.collectionViews.firstMatch
        let formatter = DateFormatter(); formatter.locale = Locale(identifier: "zh_Hans"); formatter.calendar = berlin
        formatter.timeZone = berlin.timeZone; formatter.dateStyle = .long; formatter.timeStyle = .short
        for (id, expected) in [("calendar-detail-start", formatter.string(from: berlin.date(bySettingHour: 10, minute: 0, second: 0, of: day)!)),
            ("calendar-detail-end", formatter.string(from: berlin.date(bySettingHour: 11, minute: 0, second: 0, of: day)!)),
            ("calendar-detail-location", location), ("calendar-detail-notes", note), ("calendar-detail-repeat", "不重复")] {
            let row = child(id, in: detail); try reveal(row, in: form)
            try require(row.label.contains(expected), "The saved detail must retain the exact original \(id).")
            capture("08-detail-\(id)")
        }
        try require(!detail.buttons["calendar-manage-plan"].exists && !child("calendar-detail-repeat-until", in: detail).exists,
                    "Smart fill remains a personal one-off event without a shared-plan or recurrence flow.")
    }
    private func assertSearchEmpty() throws {
        try search()
        try require(element("calendar-search-empty").waitForExistence(timeout: 25)
            && app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH 'calendar-search-result-'")).count == 0,
                    "This identity must have zero results for the unique owned event.")
        try closeSearch()
    }
    private func closeSearch() throws {
        let sheet = element("calendar-search-sheet"), done = app.buttons["calendar-search-done"]
        if !done.exists {
            try tap(app.navigationBars.buttons.matching(NSPredicate(format: "label IN %@", ["关闭", "Close", "取消", "Cancel"])).firstMatch)
            _ = sheet.waitForNonExistence(timeout: 3)
        }
        if sheet.exists { try tap(done) }
        try require(sheet.waitForNonExistence(timeout: 10) && app.buttons["calendar-search"].exists, "Close search back to Calendar.")
    }
    private func closeDetail() throws {
        try tap(app.navigationBars.buttons.matching(NSPredicate(format: "label IN %@", ["完成", "Done"])).firstMatch)
        try require(detail.waitForNonExistence(timeout: 10), "Close only the current event detail.")
    }
    private func assertNoNotifications() throws {
        try tap(app.tabBars.buttons.element(boundBy: 3)); try tap(app.buttons["inbox-notifications"])
        try require(element("notifications-empty").waitForExistence(timeout: 25) && !element("notifications-error").exists
            && app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH 'notification-'")).count == 0,
                    "Personal Smart fill must not create invitation notifications or hide notification errors.")
        try tap(app.navigationBars.buttons.element(boundBy: 0))
        try calendarRoot()
    }
    private func reveal(_ target: XCUIElement, in scroll: XCUIElement, gutter: Bool = false) throws {
        try require(scroll.waitForExistence(timeout: 10), "The actual scroll surface must exist before revealing its intended native target.")
        for _ in 0..<18 {
            let top = max(scroll.frame.minY, app.navigationBars.firstMatch.frame.maxY + 2)
            let actions = element("calendar-bottom-actions")
            let bottom = gutter
                ? min(actions.exists ? actions.frame.minY : window.maxY - 36,
                      app.tabBars.firstMatch.exists ? app.tabBars.firstMatch.frame.minY : window.maxY - 36) - 8
                : window.maxY - 36
            let clip = scroll.frame.intersection(CGRect(x: window.minX, y: top, width: window.width, height: max(0, bottom - top)))
            if target.exists && target.isHittable && clip.insetBy(dx: -0.5, dy: -0.5).contains(target.frame) { return }
            try require(!clip.isNull && clip.height > 96, "The actual scroll viewport must be usable.")
            let down = target.exists && target.frame.minY < clip.minY, origin = app.coordinate(withNormalizedOffset: .zero)
            if !gutter {
                if down { scroll.swipeDown(velocity: .slow) }
                else { scroll.swipeUp(velocity: .slow) }
                continue
            }
            let distance = target.exists ? min(CGFloat(180), max(CGFloat(48), down ? clip.minY - target.frame.minY + 8 : target.frame.maxY - clip.maxY + 8)) : 160
            let x = gutter ? clip.minX + 24 : clip.midX
            let endY = min(clip.maxY - 24, max(clip.minY + 24, clip.midY + (down ? distance : -distance)))
            origin.withOffset(CGVector(dx: x, dy: clip.midY)).press(forDuration: 0.05,
                thenDragTo: origin.withOffset(CGVector(dx: x, dy: endY)), withVelocity: .slow, thenHoldForDuration: 0.1)
        }
        try require(false, "The entire intended control must be reachable above the current footer.")
    }
    private func tap(_ target: XCUIElement) throws {
        try require(target.waitForExistence(timeout: 15) && target.isEnabled && target.isHittable
            && window.insetBy(dx: -0.5, dy: -0.5).contains(target.frame), "The complete real control must be reachable.")
        target.tap()
    }
    private func phase(_ name: String) throws {
        print("CALENDAR_SMART_PHASE \(name)"); fflush(stdout)
        try FiveRootQAReadBarrier.wait(for: name)
    }
    private func require(_ condition: Bool, _ message: String) throws {
        guard condition else {
            if let app, app.state == .runningForeground && app.secureTextFields.count == 0 { capture("failure-private") }
            XCTFail(message); throw NSError(domain: "FiveRootCalendarSmartPhone", code: 1, userInfo: [NSLocalizedDescriptionKey: message])
        }
    }
    private func capture(_ name: String) {
        XCTAssertEqual(app.secureTextFields.count, 0, "Never capture authentication or credentials.")
        let attachment = XCTAttachment(screenshot: app.screenshot())
        attachment.name = "calendar-smart-\(name)"; attachment.lifetime = .keepAlways; add(attachment)
    }
}
