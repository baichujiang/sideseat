import XCTest
import Darwin

/// Preparation only until the root task authorizes Calendar execution.
/// All business writes use the physical Preview UI; the companion oracle is GET-only.
@MainActor final class FiveRootCalendarPhoneUITests: XCTestCase {
    private struct Account: Decodable {
        let role: String
        let id: String
        let identifier: String
        let password: String
    }
    private struct Fixture: Decodable {
        let kind: String
        let schemaVersion: Int
        let runID: String
        let baseURL: String
        let bundle: String
        let accounts: [Account]
    }
    private var fixture: Fixture!
    private var app: XCUIApplication!
    private var eventID: String!
    private var categoryID: String!
    private var day: Date!
    private var berlin: Calendar {
        var value = Calendar(identifier: .gregorian)
        value.timeZone = TimeZone(identifier: "Europe/Berlin")!
        return value
    }
    private var prefix: String { "Calendar \(fixture.runID)" }
    private var initialTitle: String { prefix + " 新建" }
    private var editedTitle: String { prefix + " 已更新" }
    private var initialCategory: String { prefix + " 分类" }
    private var editedCategory: String { prefix + " 绿色" }
    private func element(_ id: String) -> XCUIElement {
        app.descendants(matching: .any).matching(identifier: id).firstMatch
    }
    private var window: CGRect { app.windows.firstMatch.frame }
    private var editor: XCUIElement { app.collectionViews["event-editor-form"].firstMatch }
    private var categoryList: XCUIElement { element("calendar-list") }
    private var detail: XCUIElement { element("calendar-readonly-detail") }
    private var detailList: XCUIElement {
        detail.collectionViews.firstMatch.exists ? detail.collectionViews.firstMatch : detail.tables.firstMatch
    }

    override func setUpWithError() throws {
        continueAfterFailure = false
        try XCTSkipUnless(ProcessInfo.processInfo.environment["SIDESEAT_CALENDAR_EXECUTE"] == "1",
                          "Calendar execution is gated until Plans acceptance finishes.")
    }

    private func loadFixture() throws {
        try require(ProcessInfo.processInfo.environment["SIMULATOR_UDID"] == nil, "Use the default physical iPhone14Plus.")
        let raw = ProcessInfo.processInfo.environment["SIDESEAT_CALENDAR_FIXTURE_JSON"] ?? ""
        try XCTSkipUnless(!raw.isEmpty, "Provide the dedicated fresh five-roots Calendar fixture.")
        let data = raw.hasPrefix("{") ? Data(raw.utf8) : try Data(contentsOf: URL(fileURLWithPath: raw))
        fixture = try JSONDecoder().decode(Fixture.self, from: data)
        try require(fixture.kind == "five-roots-live" && fixture.schemaVersion == 1, "Use the existing owned factory contract.")
        try require(fixture.baseURL == "https://api.sideseat.de" && fixture.bundle == "app.sideseat.mobile.preview", "Use the explicit production Preview.")
        try require(fixture.runID.range(of: "^[a-f0-9]{12}$", options: .regularExpression) != nil, "Use a fresh factory run identity.")
        try require(Set(fixture.accounts.map(\.role)) == ["owner", "peer"] && Set(fixture.accounts.map(\.id)).count == 2,
                    "Use two distinct owned factory accounts.")
        try require(fixture.accounts.allSatisfy { $0.identifier == "e2e_roots_\($0.role)_\(fixture.runID)" }, "Never use an ordinary or fixed QA identity.")
    }

    override func tearDown() async throws { await MainActor.run { app?.terminate() } }

    func testOwnedEventAndCustomCalendarLifecycle() throws {
        try loadFixture()
        day = berlin.startOfDay(for: Date())
        let start = try XCTUnwrap(berlin.date(byAdding: .minute, value: 600, to: day))
        let end = start.addingTimeInterval(3_600)
        print("CALENDAR_EXPECTED_RANGE \(start.ISO8601Format()) \(end.ISO8601Format())")
        fflush(stdout)
        try loginOwner()
        try phase("signed-in")

        for (mode, container) in [("month", "calendar-month-view"), ("week", "home-week-timetable"), ("day", "calendar-day-timeline")] {
            try tap(app.buttons["calendar-view-\(mode)"])
            try require(element(container).waitForExistence(timeout: 10), "The selected live calendar surface must appear.")
            try require(app.buttons["calendar-view-\(mode)"].isSelected, "The actual calendar mode must be selected.")
        }
        try tap(app.buttons["home-jump-today"])
        try require(app.buttons["home-date-\(dateKey(day))"].isSelected, "Today must select the real Berlin day.")
        let tomorrow = try XCTUnwrap(berlin.date(byAdding: .day, value: 1, to: day))
        try tap(app.buttons["home-date-\(dateKey(tomorrow))"])
        try require(app.buttons["home-date-\(dateKey(tomorrow))"].isSelected, "The next date must be navigable.")
        try tap(app.buttons["home-jump-today"])
        try require(app.buttons["home-date-\(dateKey(day))"].isSelected, "Today must return from another selected date.")
        try tap(app.buttons["calendar-search"])
        try require(element("calendar-search-sheet").waitForExistence(timeout: 10), "Search must open for cancellation.")
        try closeSearch()
        try require(element("calendar-search-sheet").waitForNonExistence(timeout: 10), "Cancel search must return to the Calendar root.")
        try tap(app.buttons["new-event"])
        try replace(app.textFields["event-title"], with: prefix + " 取消草稿")
        try cancelEditor()
        capture("01-navigation-and-create-cancel")
        try phase("navigation-cancelled")

        try openCategories()
        try tap(app.buttons["calendar-add"])
        try require(app.textFields["calendar-name"].waitForExistence(timeout: 10), "New-calendar editor must open.")
        try require(!app.buttons["calendar-save"].isEnabled, "An empty custom calendar cannot save.")
        try backCategoryEditor()
        try tap(app.buttons["calendar-add"])
        try replace(app.textFields["calendar-name"], with: initialCategory)
        try tap(app.buttons["calendar-color-swatch-dc2626"])
        try tap(app.buttons["calendar-save"])
        try waitForCategoryList()
        let category = categoryRow(initialCategory)
        try require(category.waitForExistence(timeout: 20), "The created custom category must return in the real list.")
        categoryID = String(category.identifier.dropFirst("calendar-row-".count))
        capture("02-custom-calendar-created")
        try phase("category-created")
        try closeCategories()

        try tap(app.buttons["home-jump-today"])
        let timeline = app.scrollViews["calendar-day-timeline"].firstMatch
        let slot = element("calendar-slot-600")
        try reveal(slot, in: timeline)
        try tap(slot)
        try replace(app.textFields["event-title"], with: initialTitle)
        try fillEvent(location: "日历自有测试地点", note: "首次备注")
        try reveal(app.buttons["event-calendar-picker"], in: editor)
        try tap(app.buttons["event-calendar-picker"])
        try tap(app.buttons["event-calendar-option-\(categoryID!)"])
        capture("03-new-event-form")
        try saveEvent()
        try phase("event-created")
        let tile = try timelineEvent(initialTitle)
        eventID = String(tile.identifier.dropFirst("calendar-timeline-event-".count))
        capture("04-created-in-day-timeline")
        try tap(tile)
        try assertDetail(title: initialTitle, location: "日历自有测试地点", note: "首次备注", category: initialCategory)
        capture("05-created-detail-from-timeline")
        try closeDetail()
        try search(initialTitle, expecting: 1)
        try openSearchResult(initialTitle)
        try tap(app.buttons["calendar-detail-edit"])
        try replace(app.textFields["event-title"], with: editedTitle)
        try fillEvent(location: "日历更新地点", note: "重启后保留的备注")
        try saveEvent()
        try phase("event-edited")
        app.terminate()
        try loginOwner()
        try search(editedTitle, expecting: 1)
        try openSearchResult(editedTitle)
        try assertDetail(title: editedTitle, location: "日历更新地点", note: "重启后保留的备注", category: initialCategory)
        capture("06-edited-relaunched-search-detail")
        try closeDetail()
        try tap(app.buttons["calendar-view-day"])
        let editedTile = try timelineEvent(editedTitle)
        try require(editedTile.identifier == "calendar-timeline-event-\(eventID!)", "Editing and relaunch must preserve event identity.")
        try phase("event-relaunched")

        try openCategories()
        try tap(categoryRow(initialCategory))
        try replace(app.textFields["calendar-name"], with: editedCategory)
        try tap(app.buttons["calendar-color-swatch-16a34a"])
        try tap(app.buttons["calendar-save"])
        try waitForCategoryList()
        try require(categoryRow(editedCategory).waitForExistence(timeout: 20), "Renamed category must be visible.")
        try tap(categoryRow(editedCategory))
        try require(app.buttons["calendar-color-swatch-16a34a"].isSelected, "The selected green swatch must read back.")
        capture("07-renamed-color-readback")
        try backCategoryEditor()
        try closeCategories()
        try phase("category-edited")
        try search(editedTitle, expecting: 1)
        try openSearchResult(editedTitle)
        try assertDetail(title: editedTitle, location: "日历更新地点", note: "重启后保留的备注", category: editedCategory)
        capture("08-category-name-in-event-detail")
        try closeDetail()
        try phase("category-visible")

        try openCategories()
        try tap(categoryRow(editedCategory))
        let categoryForm = try currentCategoryForm()
        try reveal(app.buttons["calendar-delete"], in: categoryForm)
        try tap(app.buttons["calendar-delete"])
        try tap(app.buttons["calendar-delete-cancel"])
        try require(app.textFields["calendar-name"].exists, "Cancel deletion must keep the category editor.")
        try tap(app.buttons["calendar-delete"])
        capture("09-category-delete-confirmation")
        try tap(app.buttons["calendar-delete-confirm"])
        try waitForCategoryList()
        try require(categoryRow(editedCategory).waitForNonExistence(timeout: 20), "Only the owned custom calendar must disappear.")
        try closeCategories()
        try phase("category-deleted")
        try search(editedTitle, expecting: 1)
        try openSearchResult(editedTitle)
        try assertDetail(title: editedTitle, location: "日历更新地点", note: "重启后保留的备注", category: "无")
        capture("10-event-preserved-uncategorized")
        try phase("event-uncategorized")
        try tap(app.buttons["calendar-detail-edit"])
        let delete = app.buttons.matching(NSPredicate(format: "label IN %@", ["删除日程", "删除活动", "删除事件", "Delete event"])).firstMatch
        try reveal(delete, in: editor)
        try tap(delete)
        try tap(app.buttons["event-action-cancel"])
        try require(app.textFields["event-title"].exists, "Cancel deletion must keep the existing event.")
        try tap(delete)
        capture("11-event-delete-confirmation")
        try tap(app.buttons["event-delete-this"])
        try require(element("event-editor-form").waitForNonExistence(timeout: 20), "Deleting the owned event must close its editor.")
        try phase("event-deleted")
        app.terminate()
        try loginOwner()
        try search(editedTitle, expecting: 0)
        capture("12-deleted-search-after-relaunch")
        try closeSearch()
        try tap(app.buttons["calendar-view-day"])
        try require(!element("calendar-timeline-event-\(eventID!)").exists, "Deleted event must also be absent from the live day timeline.")
        try phase("deleted-relaunched")
    }

    private func loginOwner() throws {
        let owner = try XCTUnwrap(fixture.accounts.first { $0.role == "owner" })
        app = XCUIApplication(bundleIdentifier: fixture.bundle)
        app.launchArguments = ["--ui-testing-signed-out", "--ui-testing-ephemeral-credentials", "--ui-testing-skip-tutorial",
                               "--ui-testing-language=zh-Hans", "--ui-testing-appearance=light",
                               "-UIPreferredContentSizeCategoryName", "UICTContentSizeCategoryL"]
        app.launchEnvironment = [:]
        app.launch()
        let identifier = app.textFields["login-identifier"]
        try require(identifier.waitForExistence(timeout: 25), "Real signed-out authentication form must appear.")
        identifier.tap(); identifier.typeText(owner.identifier)
        app.secureTextFields["login-password"].tap(); app.secureTextFields["login-password"].typeText(owner.password)
        app.buttons["login-submit"].tap()
        try require(app.tabBars.firstMatch.waitForExistence(timeout: 35), "Fresh owned account must reach the real shell.")
        let deny = XCUIApplication(bundleIdentifier: "com.apple.springboard").buttons.matching(
            NSPredicate(format: "label IN %@", ["不允许", "Don’t Allow", "Don't Allow"])).firstMatch
        if deny.waitForExistence(timeout: 1) { deny.tap() }
        try require(app.tabBars.buttons.count == 5, "Current product must expose five root destinations.")
        try tap(app.tabBars.buttons.element(boundBy: 2))
        try require(app.buttons["calendar-search"].waitForExistence(timeout: 25), "Tab index2 must be the actual Calendar root.")
    }
    private func openCategories() throws {
        try tap(app.buttons["manage-calendars"])
        try require(element("calendar-list").waitForExistence(timeout: 15), "Real category list must appear.")
    }
    private func categoryRow(_ name: String) -> XCUIElement {
        categoryList.buttons.matching(NSPredicate(format: "identifier BEGINSWITH 'calendar-row-' AND label CONTAINS %@", name)).firstMatch
    }
    private func currentCategoryForm() throws -> XCUIElement {
        // A scroll container need not itself be hittable when its native input is.
        // Preserve the bound index so scrolling the name away cannot lose the Form.
        for collection in [app.collectionViews, app.tables, app.scrollViews] {
            let candidates = collection.allElementsBoundByIndex.filter {
                $0.textFields["calendar-name"].exists
            }
            if candidates.count == 1 { return candidates[0] }
        }
        let attachment = XCTAttachment(string: app.debugDescription)
        attachment.name = "private-category-form-hierarchy"
        attachment.lifetime = .keepAlways
        add(attachment)
        capture("private-category-form-lookup-failure")
        try require(false, "The current custom-calendar input must belong to exactly one native scrolling Form.")
        throw NSError(domain: "FiveRootCalendarPhone", code: 1)
    }
    private func waitForCategoryList() throws {
        try require(app.buttons["calendar-save"].waitForNonExistence(timeout: 35),
                    "The actual custom-calendar editor must finish saving and dismiss before continuing.")
        try require(categoryList.exists && app.buttons["calendar-add"].isHittable,
                    "The real custom-calendar list must be interactive after returning.")
    }
    private func backCategoryEditor() throws {
        try tap(app.navigationBars.buttons.element(boundBy: 0))
        try waitForCategoryList()
    }
    private func closeCategories() throws { try tap(app.navigationBars.buttons.matching(NSPredicate(format: "label IN %@", ["完成", "Done"])).firstMatch) }
    private func cancelEditor() throws { try tap(app.navigationBars.buttons.matching(NSPredicate(format: "label IN %@", ["取消", "Cancel"])).firstMatch) }
    private func saveEvent() throws {
        try tap(app.buttons["event-save"])
        try require(element("event-editor-form").waitForNonExistence(timeout: 25), "Real save must finish and close the event editor.")
    }
    private func fillEvent(location: String, note: String) throws {
        try reveal(app.textFields["event-location"], in: editor)
        try replace(app.textFields["event-location"], with: location)
        let field = element("event-notes")
        try reveal(field, in: editor); try replace(field, with: note)
    }
    private func replace(_ target: XCUIElement, with text: String) throws {
        let nativeField = app.textFields.matching(identifier: target.identifier).firstMatch
        let nativeView = app.textViews.matching(identifier: target.identifier).firstMatch
        let field = nativeField.exists ? nativeField : nativeView.exists ? nativeView : target
        try require(field.waitForExistence(timeout: 15) && field.isEnabled,
                    "The actual native input must exist and be enabled.")
        let isEvent = ["event-title", "event-location", "event-notes"].contains(field.identifier)
        try require(isEvent || field.identifier == "calendar-name", "Replace only the owned Core event and calendar-name inputs.")
        let form = isEvent ? editor : try currentCategoryForm()
        try prepareVisibleInput(field, in: form)
        let current = try XCTUnwrap(field.value as? String)
        if !current.isEmpty && current != field.placeholderValue { try clearMeasuredInputAtEnd(field) }
        let cleared = try XCTUnwrap(field.value as? String)
        try require(cleared.isEmpty || cleared == field.placeholderValue,
                    "The previous input must be genuinely cleared before replacement.")
        field.typeText(text)
        try require(field.value as? String == text, "The actual input must exactly match the replacement before continuing.")
        try require(inputIsAboveKeyboard(field), "The complete replacement input must remain visible above the keyboard.")
        if isEvent { try dismissEventEditorKeyboard() }
        else if app.keyboards.buttons["return"].exists { app.keyboards.buttons["return"].tap() }
    }
    private func visibleKeyboardFrame() -> CGRect {
        let keyboard = app.keyboards.firstMatch
        return keyboard.exists ? keyboard.frame.intersection(window) : CGRect.null
    }
    private func inputIsAboveKeyboard(_ field: XCUIElement) -> Bool {
        let keyboard = visibleKeyboardFrame()
        guard !keyboard.isNull && keyboard.height > 120 else { return false }
        let navBottom = app.navigationBars.firstMatch.frame.maxY + 4
        let clip = window.intersection(CGRect(x: window.minX, y: navBottom, width: window.width, height: max(0, keyboard.minY - navBottom - 8)))
        return field.isEnabled && field.isHittable && !clip.isNull && clip.insetBy(dx: -0.5, dy: -0.5).contains(field.frame)
    }
    private func prepareVisibleInput(_ field: XCUIElement, in form: XCUIElement) throws {
        let oldKeyboard = visibleKeyboardFrame()
        if !oldKeyboard.isNull && oldKeyboard.height > 120 && field.frame.maxY > oldKeyboard.minY - 8 {
            try require(form.identifier == "event-editor-form", "Only the event editor uses its keyboard Done control.")
            try dismissEventEditorKeyboard()
        }
        try revealInput(field, in: form)
        let keyboard = visibleKeyboardFrame()
        let navBottom = app.navigationBars.firstMatch.frame.maxY + 4
        let bottom = !keyboard.isNull && keyboard.height > 120 ? keyboard.minY - 8 : window.maxY - 24
        let clip = form.frame.intersection(window).intersection(CGRect(x: window.minX, y: navBottom, width: window.width, height: max(0, bottom - navBottom)))
        print("INPUT_PRE_TAP_VISIBILITY id=\(field.identifier) field=\(field.frame) actualKeyboard=\(keyboard) clip=\(clip) hittable=\(field.isHittable)"); fflush(stdout)
        try require(field.isEnabled && field.isHittable && app.state == .runningForeground && !clip.isNull && clip.insetBy(dx: -0.5, dy: -0.5).contains(field.frame), "The complete native input field must be visible above the current keyboard and navigation bar before tapping.")
        field.tap()
        let focusDeadline = Date().addingTimeInterval(3)
        var visible = false
        while Date() < focusDeadline {
            visible = inputIsAboveKeyboard(field)
            if visible { break }
            RunLoop.current.run(until: Date().addingTimeInterval(0.1))
        }
        print("INPUT_POST_TAP_FULLY_VISIBLE id=\(field.identifier) value=\(visible)"); fflush(stdout)
        try require(visible, "After an ordinary visible input tap, the complete input field must remain above the real keyboard before any input; do not edit a hidden field.")
    }
    private func dismissEventEditorKeyboard() throws {
        let done = app.buttons["event-keyboard-done"]
        try require(done.exists && done.isEnabled && done.isHittable && window.insetBy(dx: -0.5, dy: -0.5).contains(done.frame), "Only the real reachable event keyboard Done may dismiss this keyboard; Return may advance focus.")
        done.tap()
        let deadline = Date().addingTimeInterval(3)
        while Date() < deadline {
            let frame = visibleKeyboardFrame()
            if frame.isNull || frame.height <= 1 { break }
            RunLoop.current.run(until: Date().addingTimeInterval(0.1))
        }
        let frame = visibleKeyboardFrame()
        print("EXACT_BACKSPACE_EVENT_KEYBOARD_DISMISSED actualIntersection=\(frame)"); fflush(stdout)
        try require(frame.isNull || frame.height <= 1, "The actual event keyboard must leave the viewport before revealing another field.")
    }
    private func clearMeasuredInputAtEnd(_ field: XCUIElement) throws {
        try require(inputIsAboveKeyboard(field), "The complete real input must remain above the keyboard before editing.")
        let old = try XCTUnwrap(field.value as? String)
        try require(!old.isEmpty && old != field.placeholderValue && !old.contains("\n") && !old.contains("\r"), "Use only the owned short single-paragraph Core field values.")
        let frame = field.frame
        let keyboard = visibleKeyboardFrame()
        var tailX = frame.maxX - min(8, frame.width / 2)
        let tailY = frame.minY + min(14, frame.height / 2)
        let done = app.buttons["event-keyboard-done"]
        if done.exists {
            let doneFrame = done.frame
            if doneFrame.contains(CGPoint(x: tailX, y: tailY)) { tailX = doneFrame.minX - 8 }
        }
        let caret = field.coordinate(withNormalizedOffset: CGVector(dx: (tailX-frame.minX)/frame.width, dy: (tailY-frame.minY)/frame.height))
        let point = caret.screenPoint
        try require(frame.contains(point) && window.contains(point) && !keyboard.isNull && !keyboard.contains(point), "The actual field-referenced tail tap must be inside the visible field and outside the keyboard.")
        if done.exists { try require(!done.frame.contains(point), "The tail tap must not hit the floating keyboard Done button.") }
        print("EXACT_BACKSPACE_TAIL_TAP id=\(field.identifier) field=\(frame) actualScreenPoint=\(point) oldCharacterCount=\(old.count)"); fflush(stdout)
        caret.tap()
        try require(inputIsAboveKeyboard(field), "The input must remain visibly above the keyboard after its ordinary tail tap.")
        field.typeText("z")
        let probed = try XCTUnwrap(field.value as? String)
        let expected = old + "z"
        print("EXACT_BACKSPACE_END_PROBE id=\(field.identifier) exactAppend=\(probed == expected) measuredDeleteCharacters=\(probed.count)"); fflush(stdout)
        try require(probed == expected, "The ordinary z probe must actually append at the complete old value's end before any deletion.")
        try require(inputIsAboveKeyboard(field), "The complete probed value must remain visible before ordinary backspaces.")
        field.typeText(String(repeating: XCUIKeyboardKey.delete.rawValue, count: probed.count))
        let deadline = Date().addingTimeInterval(2)
        while Date() < deadline {
            let value = try XCTUnwrap(field.value as? String)
            if value.isEmpty || value == field.placeholderValue { break }
            RunLoop.current.run(until: Date().addingTimeInterval(0.1))
        }
        let value = try XCTUnwrap(field.value as? String)
        print("EXACT_BACKSPACE_CLEAR_RESULT id=\(field.identifier) sentCharacters=\(probed.count) resultingUTF16=\(value.utf16.count) emptyOrPlaceholder=\(value.isEmpty || value == field.placeholderValue)"); fflush(stdout)
        try require(value.isEmpty || value == field.placeholderValue, "The exact measured ordinary backspaces must genuinely clear the input before replacement.")
        try require(inputIsAboveKeyboard(field), "The empty field must still be visible before any replacement text.")
    }
    private func revealInput(_ target: XCUIElement, in scroll: XCUIElement) throws {
        for _ in 0..<20 {
            let keyboard = app.keyboards.firstMatch
            let k = keyboard.exists ? keyboard.frame : CGRect.null
            let keyboardTop = !k.isNull && k.height > 100 && k.minY < window.maxY ? k.minY : window.maxY - 24
            let top = app.navigationBars.firstMatch.frame.maxY + 4
            let clip = scroll.frame.intersection(window).intersection(CGRect(x: window.minX, y: top, width: window.width, height: max(0, keyboardTop - top - 8)))
            if target.exists && target.isHittable && clip.insetBy(dx: -0.5, dy: -0.5).contains(target.frame) { return }
            try require(!clip.isNull && clip.height > 96, "The real editor must have a usable visible area.")
            let down = target.exists && target.frame.minY < clip.minY
            let gap = target.exists ? (down ? clip.minY - target.frame.minY : target.frame.maxY - clip.maxY) : CGFloat(120)
            let distance = min(CGFloat(180), max(CGFloat(48), gap + 8))
            let endY = min(clip.maxY - 24, max(clip.minY + 24, clip.midY + (down ? distance : -distance)))
            let origin = app.coordinate(withNormalizedOffset: .zero), x = clip.minX + 24
            origin.withOffset(CGVector(dx: x, dy: clip.midY)).press(forDuration: 0.05, thenDragTo: origin.withOffset(CGVector(dx: x, dy: endY)), withVelocity: .slow, thenHoldForDuration: 0.1)
        }
        try require(false, "The complete intended input must be reachable.")
    }
    private func timelineEvent(_ title: String) throws -> XCUIElement {
        try tap(app.buttons["calendar-view-day"])
        try tap(app.buttons["home-jump-today"])
        let event = app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH 'calendar-timeline-event-' AND label CONTAINS %@", title)).firstMatch
        try reveal(event, in: app.scrollViews["calendar-day-timeline"].firstMatch)
        return event
    }
    private func search(_ title: String, expecting count: Int) throws {
        try tap(app.buttons["calendar-search"])
        let field = app.searchFields.firstMatch
        try require(field.waitForExistence(timeout: 10), "Real calendar search input must appear.")
        field.tap(); field.typeText(title)
        let rows = app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH 'calendar-search-result-' AND label CONTAINS %@", title))
        if count == 1 {
            try require(rows.firstMatch.waitForExistence(timeout: 20) && rows.count == 1, "Search must show exactly one owned event.")
        } else {
            try require(element("calendar-search-empty").waitForExistence(timeout: 20) && rows.count == 0, "Deleted owned event must have no search result.")
        }
    }
    private func openSearchResult(_ title: String) throws {
        let row = app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH 'calendar-search-result-' AND label CONTAINS %@", title)).firstMatch
        try tap(row)
        try require(element("calendar-readonly-detail").waitForExistence(timeout: 15), "Search must open the event's actual detail.")
    }
    private func closeSearch() throws {
        let sheet = element("calendar-search-sheet")
        let done = app.buttons["calendar-search-done"]
        if !done.exists {
            let closeFocus = app.navigationBars.buttons.matching(NSPredicate(format: "label IN %@", ["关闭", "Close", "取消", "Cancel"])).firstMatch
            try tap(closeFocus)
            _ = sheet.waitForNonExistence(timeout: 3)
        }
        if sheet.exists { try tap(done) }
        try require(sheet.waitForNonExistence(timeout: 10), "The actual search dismissal must return to Calendar.")
        try require(!app.keyboards.firstMatch.exists && app.buttons["calendar-search"].isHittable,
                    "Search cancellation must leave the Calendar root visible with no keyboard.")
    }
    private func closeDetail() throws { try tap(app.navigationBars.buttons.matching(NSPredicate(format: "label IN %@", ["完成", "Done"])).firstMatch) }
    private func assertDetail(title: String, location: String, note: String, category: String) throws {
        try require(detail.waitForExistence(timeout: 15) && detail.staticTexts[title].waitForExistence(timeout: 15),
                    "The actual detail must contain this owned title.")
        for (id, expected) in [("calendar-detail-start", "10:00"), ("calendar-detail-end", "11:00"),
                               ("calendar-detail-location", location), ("calendar-detail-notes", note),
                               ("calendar-detail-category", category)] {
            let row = detail.descendants(matching: .any).matching(identifier: id).firstMatch
            try reveal(row, in: detailList)
            try require(row.label.contains(expected), "Detail must read back \(id) from the real event.")
        }
    }
    private func revealTimeline(_ target: XCUIElement, in scroll: XCUIElement) throws {
        try require(scroll.waitForExistence(timeout: 10) && target.waitForExistence(timeout: 15),
                    "The actual timeline and intended control must exist.")
        for _ in 0..<16 {
            let window = app.windows.firstMatch.frame
            let actions = element("calendar-bottom-actions")
            let bottom = min(actions.exists ? actions.frame.minY : window.maxY,
                             app.tabBars.firstMatch.frame.minY) - 8
            let top = max(scroll.frame.minY, app.navigationBars.firstMatch.frame.maxY + 2)
            let clip = scroll.frame.intersection(window).intersection(
                CGRect(x: window.minX, y: top, width: window.width, height: max(0, bottom - top)))
            let frame = target.frame
            if !clip.isNull && target.isHittable && clip.insetBy(dx: -0.5, dy: -0.5).contains(frame) { return }
            try require(!clip.isNull && clip.height > 96, "The live timeline must have a usable viewport above its footer.")
            let down = frame.minY < clip.minY
            let gap = down ? clip.minY - frame.minY : frame.maxY - clip.maxY
            let distance = min(CGFloat(180), max(CGFloat(48), gap + 8))
            let startY = clip.midY
            let endY = min(clip.maxY - 24, max(clip.minY + 24, startY + (down ? distance : -distance)))
            let origin = app.coordinate(withNormalizedOffset: .zero), x = clip.minX + 24
            print("CALENDAR_TIMELINE_GEOMETRY target=\(frame) clip=\(clip)"); fflush(stdout)
            origin.withOffset(CGVector(dx: x, dy: startY)).press(forDuration: 0.05,
                thenDragTo: origin.withOffset(CGVector(dx: x, dy: endY)), withVelocity: .slow, thenHoldForDuration: 0.1)
        }
        try require(false, "The complete timeline control must be reachable above the actual fixed footer.")
    }
    private func reveal(_ target: XCUIElement, in scroll: XCUIElement) throws {
        if scroll.identifier == "calendar-day-timeline" {
            try revealTimeline(target, in: scroll)
            return
        }
        try require(scroll.waitForExistence(timeout: 10), "Expected scrolling surface must exist.")
        for _ in 0..<30 {
            let window = app.windows.firstMatch.frame
            let clip = scroll.frame.intersection(window.insetBy(dx: 0, dy: 50))
            if target.exists && target.isHittable && clip.contains(target.frame) { return }
            if target.exists && target.frame.minY < clip.minY { scroll.swipeDown(velocity: .slow) }
            else { scroll.swipeUp(velocity: .slow) }
        }
        try require(false, "The complete intended control must be reachable.")
    }
    private func tap(_ target: XCUIElement) throws {
        try require(target.waitForExistence(timeout: 15) && target.isEnabled && target.isHittable, "Intended UI control must be enabled and reachable.")
        target.coordinate(withNormalizedOffset: CGVector(dx: 0.2, dy: 0.5)).tap()
    }
    private func dateKey(_ date: Date) -> String {
        let c = berlin.dateComponents([.year, .month, .day], from: date)
        return String(format: "%04d-%02d-%02d", c.year!, c.month!, c.day!)
    }
    private func require(_ condition: Bool, _ message: String) throws {
        guard condition else { XCTFail(message); throw NSError(domain: "FiveRootCalendarPhone", code: 1, userInfo: [NSLocalizedDescriptionKey: message]) }
    }
    private func phase(_ name: String) throws {
        print("CALENDAR_PHASE \(name)"); fflush(stdout)
        try FiveRootQAReadBarrier.wait(for: name)
    }
    private func capture(_ name: String) {
        XCTAssertFalse(app.secureTextFields["login-password"].exists, "Never capture authentication.")
        let attachment = XCTAttachment(screenshot: app.screenshot())
        attachment.name = "five-root-calendar-" + name
        attachment.lifetime = .keepAlways
        add(attachment)
    }
}
