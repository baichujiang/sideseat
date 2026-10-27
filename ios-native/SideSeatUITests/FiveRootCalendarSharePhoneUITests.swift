import XCTest
import UIKit
import Darwin

/// Fresh owned accounts only. Copy link is real UI; app.open(copiedHTTPSURL) uses
/// the standard targeted-App URL entry. This is not a Safari/association test.
/// All event/share/import/edit/delete writes happen in the actual Preview UI.
@MainActor final class FiveRootCalendarSharePhoneUITests: XCTestCase {
    private struct Account: Decodable { let role, id, identifier, password: String }
    private struct Fixture: Decodable {
        let kind, runID, baseURL, bundle: String
        let schemaVersion: Int
        let accounts: [Account]
    }
    private var fixture: Fixture!
    private var app: XCUIApplication!
    private var sourceID: String!
    private var copyID: String!
    private var shareURL: URL!
    private var day: Date!
    private var berlin: Calendar {
        var c = Calendar(identifier: .gregorian)
        c.timeZone = TimeZone(identifier: "Europe/Berlin")!
        return c
    }
    private var title: String { "Calendar share \(fixture.runID)" }
    private var location: String { "共享地点 \(fixture.runID)" }
    private var privateNote: String { "仅本人备注 \(fixture.runID)" }
    private var copyLocation: String { "收件人地点 \(fixture.runID)" }
    private func element(_ id: String) -> XCUIElement {
        app.descendants(matching: .any).matching(identifier: id).firstMatch
    }
    private var window: CGRect { app.windows.firstMatch.frame }
    private var editor: XCUIElement { app.collectionViews["event-editor-form"].firstMatch }
    private var detail: XCUIElement { element("calendar-readonly-detail") }
    private var compose: XCUIElement { element("event-share-compose") }
    private var recipient: XCUIElement { element("event-share-recipient") }
    private func child(_ id: String, in container: XCUIElement) -> XCUIElement {
        container.descendants(matching: .any).matching(identifier: id).firstMatch
    }
    private var detailList: XCUIElement {
        if detail.elementType == .collectionView || detail.elementType == .table { return detail }
        return detail.collectionViews.firstMatch.exists ? detail.collectionViews.firstMatch : detail.tables.firstMatch
    }
    override func setUpWithError() throws {
        continueAfterFailure = false
        try XCTSkipUnless(ProcessInfo.processInfo.environment["SIDESEAT_CALENDAR_SHARE_EXECUTE"] == "1",
                          "Prepare only until the root authorizes this separate Calendar share case.")
    }
    override func tearDown() async throws { await MainActor.run { app?.terminate() } }
    private func loadFixture() throws {
        try require(ProcessInfo.processInfo.environment["SIMULATOR_UDID"] == nil, "Use the default physical iPhone14Plus.")
        let raw = ProcessInfo.processInfo.environment["SIDESEAT_CALENDAR_SHARE_FIXTURE_JSON"] ?? ""
        try require(raw.hasPrefix("{"), "Embed the dedicated fresh Calendar share fixture privately.")
        fixture = try JSONDecoder().decode(Fixture.self, from: Data(raw.utf8))
        try require(fixture.kind == "five-roots-live" && fixture.schemaVersion == 1
                    && fixture.baseURL == "https://api.sideseat.de" && fixture.bundle == "app.sideseat.mobile.preview",
                    "Use the owned factory production Preview contract.")
        try require(fixture.runID.range(of: "^[a-f0-9]{12}$", options: .regularExpression) != nil
                    && fixture.accounts.count == 2 && Set(fixture.accounts.map(\.role)) == ["owner", "peer"]
                    && Set(fixture.accounts.map(\.id)).count == 2
                    && fixture.accounts.allSatisfy { $0.identifier == "e2e_roots_\($0.role)_\(fixture.runID)" && $0.password.count >= 24 },
                    "Only this run's two distinct disposable identities are permitted.")
    }

    func testFilteredPersonalShareAddsOneIndependentRecipientCopy() throws {
        try loadFixture()
        day = berlin.startOfDay(for: Date())
        let start = try XCTUnwrap(berlin.date(byAdding: .minute, value: 600, to: day))
        print("CALENDAR_SHARE_EXPECTED_RANGE \(start.ISO8601Format()) \(start.addingTimeInterval(3600).ISO8601Format())")
        fflush(stdout)
        try login("owner")
        try phase("signed-in")
        try tap(app.buttons["calendar-view-day"])
        try tap(app.buttons["home-jump-today"])
        let slot = element("calendar-slot-600")
        try reveal(slot, in: app.scrollViews["calendar-day-timeline"].firstMatch)
        try tap(slot)
        try replace(app.textFields["event-title"], with: title)
        try fillEvent(location: location, note: privateNote)
        try tap(app.buttons["event-save"])
        try require(element("event-editor-form").waitForNonExistence(timeout: 25), "The source event must really save.")
        let source = app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH 'calendar-timeline-event-' AND label CONTAINS %@", title)).firstMatch
        try reveal(source, in: app.scrollViews["calendar-day-timeline"].firstMatch)
        sourceID = String(source.identifier.dropFirst("calendar-timeline-event-".count))
        try require(!sourceID.isEmpty, "Capture the actual saved source identity.")
        print("CALENDAR_SHARE_SOURCE_ID \(sourceID!)"); fflush(stdout)
        try tap(source)
        try assertDetail(location: location, note: privateNote)
        capture("01-owned-source-detail")
        try phase("source-created")

        try tap(app.buttons["calendar-detail-share-event"])
        try require(element("event-share-compose").waitForExistence(timeout: 15), "Open the actual source share preview.")
        try require(child("event-share-preview-title", in: compose).label == title, "Share title must be the source event.")
        let locationSwitch = compose.switches["event-share-include-location"]
        let notesSwitch = compose.switches["event-share-include-notes"]
        try require(locationSwitch.waitForExistence(timeout: 10) && locationSwitch.value as? String == "1"
                    && notesSwitch.exists && notesSwitch.value as? String == "0", "Real preview defaults must include location and exclude notes.")
        notesSwitch.coordinate(withNormalizedOffset: CGVector(dx: 0.94, dy: 0.5)).tap()
        let previewNote = compose.descendants(matching: .any).matching(NSPredicate(format: "label == %@", privateNote)).firstMatch
        try require(previewNote.waitForExistence(timeout: 10) && notesSwitch.value as? String == "1",
                    "Preview must show notes when explicitly included through the real switch.")
        capture("02-share-preview-notes-included")
        notesSwitch.coordinate(withNormalizedOffset: CGVector(dx: 0.94, dy: 0.5)).tap()
        try require(previewNote.waitForNonExistence(timeout: 10) && notesSwitch.value as? String == "0",
                    "Exclude notes again before publishing the filtered snapshot.")
        capture("02-share-preview-notes-excluded")
        try tap(app.buttons["event-share-continue"])
        try require(element("event-share-destinations").waitForExistence(timeout: 25), "Continue must really create the share and open destinations.")
        // A failed Copy must paste only this harmless marker, never an older ordinary link.
        UIPasteboard.general.string = "SideSeat QA Share \(fixture.runID)"
        try tap(app.buttons["event-share-copy-link"])
        capture("03-created-share-copied-link")
        try tap(toolbar(["取消", "Cancel"]))
        try require(element("event-share-compose").waitForNonExistence(timeout: 10), "Close the created share destinations without sending a message.")
        try closeDetail()
        try require(detail.waitForNonExistence(timeout: 10) && app.buttons["calendar-search"].isHittable,
                    "Close the underlying source detail before opening the temporary local draft.")
        let copied = try copiedTextThroughCancelledDraft()
        let url = try XCTUnwrap(URL(string: copied))
        try require(url.scheme == "https" && ["www.sideseat.de", "sideseat.de"].contains(url.host ?? "")
                    && url.path.range(of: "^/share/event/[A-Za-z0-9_-]{43}$", options: .regularExpression) != nil
                    && url.query == nil && url.fragment == nil,
                    "The actual Copy link action must supply a fresh public event URL from the production share origin.")
        shareURL = url
        // Own disposable link only, in the private xcode log for the GET-only observer.
        print("CALENDAR_SHARE_OWNED_URL \(copied)"); fflush(stdout)
        try phase("share-created")

        app.terminate()
        try login("peer")
        try openOwnedShare()
        try assertRecipient(added: false)
        capture("04-peer-filtered-preview")
        try phase("peer-preview")
        try tap(app.buttons["event-share-add"])
        try require(element("event-share-added").waitForExistence(timeout: 25)
                    && !app.buttons["event-share-add"].exists, "Add must create the independent copy and replace the action.")
        capture("05-peer-copy-added")
        try phase("copy-added")
        app.terminate()
        try login("peer")
        try search(title, expecting: 1)
        let copy = resultRow()
        copyID = String(copy.identifier.dropFirst("calendar-search-result-".count))
        try require(!copyID.isEmpty && copyID != sourceID, "The recipient must have one distinct independent event identity.")
        print("CALENDAR_SHARE_COPY_ID \(copyID!)"); fflush(stdout)
        try tap(copy)
        try require(element("calendar-readonly-detail").waitForExistence(timeout: 15), "The copy must open from real Calendar search.")
        try assertDetail(location: location, note: nil)
        capture("06-peer-copy-relaunched-detail")
        try closeDetail()
        try phase("copy-relaunched")
        try openOwnedShare()
        try assertRecipient(added: true)
        capture("07-same-link-already-added")
        try phase("same-link-reopened")
        try closeRecipient()

        try search(title, expecting: 1)
        try openSearchResult(title)
        try tap(app.buttons["calendar-detail-edit"])
        try reveal(app.textFields["event-location"], in: editor)
        try replace(app.textFields["event-location"], with: copyLocation)
        try tap(app.buttons["event-save"])
        try require(element("event-editor-form").waitForNonExistence(timeout: 25), "The recipient may save its own independent copy.")
        try phase("copy-edited")
        app.terminate()
        try login("owner")
        try search(title, expecting: 1)
        try require(resultRow().identifier == "calendar-search-result-\(sourceID!)", "Owner search must retain the original source identity.")
        try openSearchResult(title)
        try assertDetail(location: location, note: privateNote)
        capture("08-owner-source-unchanged")
        try phase("source-unchanged")
        try deleteOpenEvent()
        try phase("owner-source-deleted")
        app.terminate()
        try login("peer")
        try search(title, expecting: 1)
        try require(resultRow().identifier == "calendar-search-result-\(copyID!)", "Deleting the source must leave the recipient's same independent copy.")
        try openSearchResult(title)
        try assertDetail(location: copyLocation, note: nil)
        capture("09-peer-copy-survives-source-delete")
        try phase("peer-copy-survives-source-delete")
        try deleteOpenEvent()
        try phase("peer-copy-deleted")
        app.terminate()
        try login("peer")
        try search(title, expecting: 0)
        capture("10-recipient-copy-deleted-after-relaunch")
        try closeSearch()
        try phase("deleted-relaunched")
    }

    private func login(_ role: String) throws {
        let account = try XCTUnwrap(fixture.accounts.first { $0.role == role })
        app = XCUIApplication(bundleIdentifier: fixture.bundle)
        app.launchArguments = ["--ui-testing-signed-out", "--ui-testing-ephemeral-credentials", "--ui-testing-skip-tutorial",
                               "--ui-testing-language=zh-Hans", "--ui-testing-appearance=light",
                               "-UIPreferredContentSizeCategoryName", "UICTContentSizeCategoryL"]
        app.launchEnvironment = [:]
        app.launch()
        let identifier = app.textFields["login-identifier"]
        try require(identifier.waitForExistence(timeout: 25), "Use the genuine signed-out form.")
        identifier.tap(); identifier.typeText(account.identifier)
        app.secureTextFields["login-password"].tap(); app.secureTextFields["login-password"].typeText(account.password)
        app.buttons["login-submit"].tap()
        try require(app.tabBars.firstMatch.waitForExistence(timeout: 35), "The selected owned role must actually sign in.")
        let deny = XCUIApplication(bundleIdentifier: "com.apple.springboard").buttons.matching(
            NSPredicate(format: "label IN %@", ["不允许", "Don’t Allow", "Don't Allow"])).firstMatch
        if deny.waitForExistence(timeout: 1) { deny.tap() }
        try require(app.tabBars.buttons.count == 5, "The real five-tab shell must load.")
        try tap(app.tabBars.buttons.element(boundBy: 2))
        try require(app.buttons["calendar-search"].waitForExistence(timeout: 25), "Use Calendar only; Messages/Me business remains unstarted.")
    }
    private func openOwnedShare() throws {
        try require(shareURL != nil, "Use only this case's genuinely copied link.")
        app.open(shareURL)
        try require(element("event-share-recipient").waitForExistence(timeout: 25)
                    && child("event-share-title", in: recipient).waitForExistence(timeout: 25), "The targeted App URL entry must load its actual network recipient view.")
        try require(app.tabBars.buttons.element(boundBy: 2).isSelected, "The event share must route to Calendar.")
    }
    private func assertRecipient(added: Bool) throws {
        try require(child("event-share-title", in: recipient).label == title, "The recipient must see this source title.")
        let when = child("event-share-when", in: recipient), place = child("event-share-location", in: recipient)
        let scroll = recipient.elementType == .scrollView ? recipient : recipient.scrollViews.firstMatch
        for row in [when, place, child("event-share-copy-disclosure", in: recipient)] { try reveal(row, in: scroll) }
        try require(when.label.contains("10:00") && when.label.contains("11:00")
                    && place.label.contains(location), "Filtered recipient time and included location must match.")
        try require(!child("event-share-notes", in: recipient).exists && !recipient.staticTexts[privateNote].exists,
                    "Excluded notes must never be shown to the recipient.")
        let action = added ? child("event-share-added", in: recipient) : recipient.buttons["event-share-add"]
        try reveal(action, in: scroll)
        try require(action.exists && (added || action.isHittable)
                    && (!added || !recipient.buttons["event-share-add"].exists), "The same link must reflect the actual unadded/added state.")
    }
    private func closeRecipient() throws {
        try tap(app.navigationBars.buttons.element(boundBy: 0))
        try require(element("event-share-recipient").waitForNonExistence(timeout: 10)
                    && app.buttons["calendar-search"].isHittable, "Back must return to the Calendar root.")
    }
    private func resultRow() -> XCUIElement {
        app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH 'calendar-search-result-' AND label CONTAINS %@", title)).firstMatch
    }
    private func assertDetail(location expected: String, note: String?) throws {
        try require(detail.staticTexts[title].waitForExistence(timeout: 15), "The detail must show this owned title.")
        for (id, value) in [("calendar-detail-start", "10:00"), ("calendar-detail-end", "11:00"), ("calendar-detail-location", expected)] {
            let row = child(id, in: detail); try reveal(row, in: detailList)
            try require(row.label.contains(value), "The real detail must read back \(id).")
        }
        if let note {
            let row = child("calendar-detail-notes", in: detail); try reveal(row, in: detailList)
            try require(row.label.contains(note), "The owner retains its original note.")
        } else {
            try require(!child("calendar-detail-notes", in: detail).exists && !detail.staticTexts[privateNote].exists,
                        "The independent filtered copy must contain no hidden original note.")
        }
    }
    private func deleteOpenEvent() throws {
        try tap(app.buttons["calendar-detail-edit"])
        let delete = app.buttons.matching(NSPredicate(format: "label IN %@", ["删除日程", "删除活动", "删除事件", "Delete event"])).firstMatch
        try reveal(delete, in: editor); try tap(delete)
        try tap(app.buttons["event-delete-this"])
        try require(element("event-editor-form").waitForNonExistence(timeout: 25), "Delete only the current role's own event through UI.")
    }
    private func toolbar(_ labels: [String]) -> XCUIElement {
        app.navigationBars.buttons.matching(NSPredicate(format: "label IN %@", labels)).firstMatch
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
        try require(["event-title", "event-location", "event-notes"].contains(field.identifier), "Replace only this test's owned event inputs.")
        try prepareVisibleInput(field, in: editor)
        let current = try XCTUnwrap(field.value as? String)
        if !current.isEmpty && current != field.placeholderValue { try clearMeasuredInputAtEnd(field) }
        let cleared = try XCTUnwrap(field.value as? String)
        try require(cleared.isEmpty || cleared == field.placeholderValue,
                    "The previous input must be genuinely cleared before replacement.")
        field.typeText(text)
        try require(field.value as? String == text, "The actual input must exactly match the replacement before continuing.")
        try require(inputIsAboveKeyboard(field), "The complete replacement input must remain visible above the keyboard.")
        try dismissEventEditorKeyboard()
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
        try require(!old.isEmpty && old != field.placeholderValue && !old.contains("\n") && !old.contains("\r"), "Use only the owned short single-paragraph test field values.")
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
    private func require(_ condition: Bool, _ message: String) throws {
        guard condition else {
            if let app, app.state == .runningForeground, !app.secureTextFields["login-password"].exists { capture("failure-private") }
            XCTFail(message)
            throw NSError(domain: "FiveRootCalendarSharePhone", code: 1, userInfo: [NSLocalizedDescriptionKey: message])
        }
    }
    private func copiedTextThroughCancelledDraft() throws -> String {
        try require(app.buttons["calendar-search"].isHittable && !element("event-editor-form").exists,
                    "Open the local paste draft only from the actual Calendar root.")
        try tap(app.buttons["new-event"])
        let draft = app.collectionViews["event-editor-form"].firstMatch
        let field = app.textFields["event-title"]
        var copied = ""
        var pasteFailure: Error?
        do {
            try require(draft.waitForExistence(timeout: 15) && field.waitForExistence(timeout: 10),
                        "The temporary new-event draft must expose its native title input.")
            let initial = try XCTUnwrap(field.value as? String)
            try require(initial.isEmpty || initial == field.placeholderValue,
                        "Paste only into a genuinely empty new draft, never an existing event.")
            try tap(field)
            let window = app.windows.firstMatch.frame
            let keyboard = app.keyboards.firstMatch
            let keyboardFrame = keyboard.exists ? keyboard.frame.intersection(window) : CGRect.null
            var bottom = !keyboardFrame.isNull && keyboardFrame.height > 100 ? keyboardFrame.minY : window.maxY
            let done = app.buttons["event-keyboard-done"]
            if done.exists && done.isHittable { bottom = min(bottom, done.frame.minY) }
            try require(field.isHittable && window.contains(field.frame)
                        && field.frame.minY > app.navigationBars.firstMatch.frame.maxY
                        && field.frame.maxY < bottom,
                        "The complete empty title must be visibly above the keyboard and Done bar.")
            field.press(forDuration: 0.9)
            let predicate = NSPredicate(format: "label IN %@", ["粘贴", "Paste", "Einsetzen"])
            let deadline = Date().addingTimeInterval(5)
            var candidates: [XCUIElement] = []
            repeat {
                candidates = [app.menuItems.matching(predicate), app.buttons.matching(predicate)]
                    .flatMap { $0.allElementsBoundByIndex }
                    .filter { $0.isHittable && window.contains($0.frame) }
                if !candidates.isEmpty { break }
                RunLoop.current.run(until: Date().addingTimeInterval(0.1))
            } while Date() < deadline
            try require(candidates.count == 1, "Use exactly one visible native Paste action; never type or recover a URL through another channel.")
            try tap(candidates[0])
            let pasteDeadline = Date().addingTimeInterval(5)
            repeat {
                copied = try XCTUnwrap(field.value as? String)
                if !copied.isEmpty && copied != field.placeholderValue { break }
                RunLoop.current.run(until: Date().addingTimeInterval(0.1))
            } while Date() < pasteDeadline
        } catch { pasteFailure = error }
        try tap(app.navigationBars.buttons.matching(NSPredicate(format: "label IN %@", ["取消", "Cancel", "Abbrechen"])).firstMatch)
        try require(draft.waitForNonExistence(timeout: 15) && !app.keyboards.firstMatch.exists
                    && app.buttons["calendar-search"].isHittable,
                    "Always cancel the temporary paste draft without saving and return to Calendar.")
        if let pasteFailure { throw pasteFailure }
        return copied
    }
    private func phase(_ name: String) throws {
        print("CALENDAR_SHARE_PHASE \(name)"); fflush(stdout)
        try FiveRootQAReadBarrier.wait(for: name)
    }
    private func capture(_ name: String) {
        XCTAssertFalse(app.secureTextFields["login-password"].exists, "Never capture authentication.")
        let a = XCTAttachment(screenshot: app.screenshot())
        a.name = "five-root-calendar-share-" + name; a.lifetime = .keepAlways; add(a)
    }
}
