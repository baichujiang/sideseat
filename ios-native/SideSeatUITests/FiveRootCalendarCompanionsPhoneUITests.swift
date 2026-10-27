import XCTest
import Darwin

/// A single real Calendar case. Relationship preparation is explicit and separate;
/// this test performs every event write through the current App UI.
@MainActor final class FiveRootCalendarCompanionsPhoneUITests: XCTestCase {
    private struct Account: Decodable { let role, id, identifier, password, displayName: String }
    private struct Preparation: Decodable { let schemaVersion: Int; let runID, connectionID, preparedAt, title: String }
    private struct Fixture: Decodable {
        let kind, runID, baseURL, bundle: String
        let schemaVersion: Int
        let accounts: [Account]
        let calendarCompanions: Preparation
    }
    private var fixture: Fixture!
    private var app: XCUIApplication!
    private var anchor: Date!
    private var eventID = ""
    private var title: String { fixture.calendarCompanions.title }
    private var peer: Account { fixture.accounts.first { $0.role == "peer" }! }
    private var window: CGRect { app.windows.firstMatch.frame }
    private var editor: XCUIElement { app.collectionViews["event-editor-form"].firstMatch }
    private var detail: XCUIElement { element("calendar-readonly-detail") }
    private var berlin: Calendar {
        var value = Calendar(identifier: .gregorian)
        value.timeZone = TimeZone(identifier: "Europe/Berlin")!
        return value
    }
    private func element(_ id: String) -> XCUIElement { app.descendants(matching: .any).matching(identifier: id).firstMatch }

    override func setUpWithError() throws {
        continueAfterFailure = false
        try XCTSkipUnless(ProcessInfo.processInfo.environment["SIDESEAT_CALENDAR_COMPANIONS_EXECUTE"] == "1",
                          "Preparation only until the root explicitly authorizes this isolated Calendar case.")
    }
    override func tearDown() async throws { await MainActor.run { app?.terminate() } }

    func testPersonalCompanionsPersistCancelRemoveAndRemainOwnerOnly() throws {
        try begin()
        try tap(app.buttons["calendar-view-day"])
        let slot = element("calendar-slot-600")
        try reveal(slot, in: app.scrollViews["calendar-day-timeline"].firstMatch, gutter: true)
        try tap(slot)
        try require(editor.waitForExistence(timeout: 15), "A genuine10:00 slot must open the native form.")
        let field = app.textFields["event-title"]
        try require(field.waitForExistence(timeout: 10) && ((field.value as? String ?? "").isEmpty || field.value as? String == field.placeholderValue),
                    "Only type once into the actual empty new-title field; never replace text with an unverified harness.")
        try tap(field); field.typeText(title)
        try require(field.value as? String == title, "The real title must exactly match the unique owned label.")
        try tap(app.buttons["event-keyboard-done"])
        let datesBefore = [try pickerSignature("event-start"), try pickerSignature("event-end")]
        let smartFill = app.buttons["event-smart-fill"]
        try reveal(smartFill, in: editor); try tap(smartFill)
        let smartInput = app.textViews["smart-schedule-input"], parse = app.buttons["smart-schedule-parse"]
        try require(smartInput.waitForExistence(timeout: 15) && (smartInput.value as? String ?? "").isEmpty
            && parse.exists && !parse.isEnabled, "The real Smart fill opens empty with Preview events disabled; do not parse or access media.")
        capture("00-smart-fill-empty-cancel")
        try tap(app.buttons["smart-schedule-cancel"])
        try require(smartInput.waitForNonExistence(timeout: 10) && editor.exists && field.value as? String == title,
                    "Cancel Smart fill must return to the same unsaved title draft.")
        try require([try pickerSignature("event-start"), try pickerSignature("event-end")] == datesBefore,
                    "Cancel Smart fill must preserve the actual10:00–11:00 date/time controls.")
        try openCompanions(selected: false)
        try tap(app.buttons["event-companion-\(peer.id)"])
        try require(app.buttons["event-companion-\(peer.id)"].isSelected, "The intended peer must become selected before saving.")
        capture("01-draft-peer-selected")
        try finishCompanions()
        try phase("draft-selected")
        try saveEditor()
        let event = try ownedEvent()
        eventID = String(event.identifier.dropFirst("calendar-timeline-event-".count))
        try require(eventID.range(of: "^[A-Za-z0-9_-]{8,120}$", options: .regularExpression) != nil, "Retain the genuine UI-created event identity.")
        print("CALENDAR_COMPANIONS_ID \(eventID)"); fflush(stdout)
        try tap(event); try assertPeople(present: true)
        capture("02-saved-detail-person")
        try phase("event-created")

        try login("owner")
        try openSearchResult()
        try assertPeople(present: true)
        try tap(app.buttons["calendar-detail-edit"])
        try openCompanions(selected: true)
        capture("03-relaunched-selected-peer")
        try finishCompanions(); try cancelEditor()
        try phase("owner-relaunched")

        try login("peer")
        try assertSearchEmpty()
        try assertNoNotifications()
        capture("04-peer-no-invitation")
        try phase("peer-isolated")

        try login("owner")
        try openSearchResult(); try assertPeople(present: true)
        try tap(app.buttons["calendar-detail-edit"])
        try openCompanions(selected: true)
        try tap(app.buttons["event-companion-\(peer.id)"])
        try require(!app.buttons["event-companion-\(peer.id)"].isSelected, "The draft must really remove this peer.")
        try finishCompanions(); try cancelEditor()
        try openCurrentEvent(); try assertPeople(present: true)
        capture("05-cancel-removal-preserves-person")
        try phase("remove-cancelled")

        try tap(app.buttons["calendar-detail-edit"])
        try openCompanions(selected: true)
        try tap(app.buttons["event-companion-\(peer.id)"])
        try require(!app.buttons["event-companion-\(peer.id)"].isSelected, "The saved removal must start from an unchecked real peer.")
        try finishCompanions(); try saveEditor()
        try openCurrentEvent(); try assertPeople(present: false)
        capture("06-saved-removal")
        try phase("companion-removed")

        try login("owner")
        try openSearchResult(); try assertPeople(present: false)
        try tap(app.buttons["calendar-detail-edit"])
        try openCompanions(selected: false)
        capture("07-relaunched-empty-selection")
        try finishCompanions(); try cancelEditor()
        try phase("removed-relaunched")
        let retained = try currentEvent()
        retained.press(forDuration: 0.9)
        try tap(app.buttons["calendar-event-context-delete"])
        try tap(app.buttons["calendar-event-delete-this"])
        try require(app.buttons["calendar-timeline-event-\(eventID)"].waitForNonExistence(timeout: 25), "Delete the exact original personal event through UI.")
        try assertSearchEmpty()
        capture("08-owner-deleted-search-empty")
        try phase("event-deleted")

        try login("peer")
        try assertSearchEmpty(); try assertNoNotifications()
        try login("owner")
        try assertSearchEmpty(); try assertNoNotifications()
        capture("09-both-accounts-cleaned")
        try phase("cleaned")
        print("CALENDAR_COMPANIONS_END"); fflush(stdout)
    }

    private func begin() throws {
        try require(ProcessInfo.processInfo.environment["SIMULATOR_UDID"] == nil, "This acceptance requires the default physical iPhone14Plus.")
        let raw = ProcessInfo.processInfo.environment["SIDESEAT_CALENDAR_COMPANIONS_FIXTURE_JSON"] ?? ""
        try require(!raw.isEmpty, "Inject only the explicitly prepared two-account Companions fixture.")
        fixture = try JSONDecoder().decode(Fixture.self, from: Data(raw.utf8))
        try require(fixture.kind == "five-roots-live" && fixture.schemaVersion == 1 && fixture.baseURL == "https://api.sideseat.de"
            && fixture.bundle == "app.sideseat.mobile.preview" && fixture.runID.range(of: "^[a-f0-9]{12}$", options: .regularExpression) != nil,
                    "Use the isolated owned production Preview factory contract.")
        try require(fixture.accounts.count == 2 && Set(fixture.accounts.map(\.role)) == ["owner", "peer"]
            && Set(fixture.accounts.map(\.id)).count == 2 && fixture.accounts.allSatisfy { $0.identifier == "e2e_roots_\($0.role)_\(fixture.runID)" && $0.password.count >= 24 },
                    "Use two distinct factory accounts only.")
        try require(fixture.calendarCompanions.schemaVersion == 1 && fixture.calendarCompanions.runID == fixture.runID
            && fixture.calendarCompanions.title == "Companions \(fixture.runID)" && !fixture.calendarCompanions.preparedAt.isEmpty,
                    "The relationship precondition must already be recorded without seeding business progress.")
        anchor = berlin.startOfDay(for: Date())
        print("CALENDAR_COMPANIONS_BEGIN \(anchor.ISO8601Format())"); fflush(stdout)
        try login("owner"); try assertNoNotifications(); try calendarRoot()
        try phase("signed-in")
    }
    private func login(_ role: String) throws {
        let account = try XCTUnwrap(fixture.accounts.first { $0.role == role })
        app?.terminate(); app = XCUIApplication(bundleIdentifier: fixture.bundle)
        app.launchArguments = ["--ui-testing-signed-out", "--ui-testing-ephemeral-credentials", "--ui-testing-skip-tutorial",
            "--ui-testing-language=zh-Hans", "--ui-testing-appearance=light", "-UIPreferredContentSizeCategoryName", "UICTContentSizeCategoryL"]
        app.launchEnvironment = [:]; app.launch()
        let name = app.textFields["login-identifier"]
        try require(name.waitForExistence(timeout: 25), "Use genuine signed-out authentication.")
        name.tap(); name.typeText(account.identifier)
        let password = app.secureTextFields["login-password"]
        password.tap(); password.typeText(account.password); app.buttons["login-submit"].tap()
        try require(app.tabBars.firstMatch.waitForExistence(timeout: 35) && app.tabBars.buttons.count == 5, "Real login must reach the five-tab shell.")
        let deny = XCUIApplication(bundleIdentifier: "com.apple.springboard").buttons.matching(NSPredicate(format: "label IN %@", ["不允许", "Don’t Allow", "Don't Allow"])).firstMatch
        if deny.waitForExistence(timeout: 1) { deny.tap() }
        try calendarRoot()
    }
    private func calendarRoot() throws {
        try tap(app.tabBars.buttons.element(boundBy: 2))
        try require(app.buttons["calendar-search"].waitForExistence(timeout: 25), "The current Calendar root must load.")
    }
    private func openCompanions(selected: Bool) throws {
        let link = element("event-companions")
        try reveal(link, in: editor); try tap(link)
        let choice = app.buttons["event-companion-\(peer.id)"]
        try require(element("event-companion-picker").waitForExistence(timeout: 10) && choice.waitForExistence(timeout: 10), "The current form must expose exactly the owned ACTIVE peer.")
        let all = app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH 'event-companion-'"))
        try require(all.count == 1 && choice.label == peer.displayName && choice.isSelected == selected, "The exact peer identity/name and persisted check state must match.")
    }
    private func finishCompanions() throws {
        try tap(app.buttons["event-companions-done"])
        try require(element("event-companion-picker").waitForNonExistence(timeout: 10) && editor.exists, "Done must return to this draft editor.")
    }
    private func pickerSignature(_ id: String) throws -> String {
        let picker = element(id)
        try reveal(picker, in: editor)
        return ([picker.label, picker.value as? String ?? ""] + picker.descendants(matching: .any).allElementsBoundByIndex.map(\.label)).joined(separator: "|")
    }
    private func assertPeople(present: Bool) throws {
        try require(detail.waitForExistence(timeout: 15), "Read the actual current event detail.")
        let list = detail.collectionViews.firstMatch
        let name = list.staticTexts.matching(NSPredicate(format: "label == %@", peer.displayName))
        if present { try reveal(name.firstMatch, in: list) }
        else {
            // In this owned event People would follow the final category row.
            try reveal(element("calendar-detail-category"), in: list)
            list.swipeUp(velocity: .slow)
        }
        try require(name.count == (present ? 1 : 0), "People must show the exact peer once when retained, and omit it after removal.")
        try require(!app.buttons["calendar-manage-plan"].exists, "A personal companion annotation must not silently become a shared-plan invitation.")
    }
    private func ownedEvent() throws -> XCUIElement {
        let matches = app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH 'calendar-timeline-event-' AND label == %@", title))
        try require(matches.firstMatch.waitForExistence(timeout: 20) && matches.count == 1, "Find exactly one actual owned event.")
        try reveal(matches.firstMatch, in: app.scrollViews["calendar-day-timeline"].firstMatch, gutter: true)
        return matches.firstMatch
    }
    private func currentEvent() throws -> XCUIElement {
        try tap(app.buttons["calendar-view-day"])
        let event = app.buttons["calendar-timeline-event-\(eventID)"]
        try reveal(event, in: app.scrollViews["calendar-day-timeline"].firstMatch, gutter: true)
        try require(event.label == title, "Never substitute a replacement identity for the original event.")
        return event
    }
    private func openCurrentEvent() throws { try tap(try currentEvent()) }
    private func openSearchResult() throws {
        try search()
        let result = app.buttons["calendar-search-result-\(eventID)"]
        try require(result.waitForExistence(timeout: 20) && result.label.contains(title), "The same saved identity must remain searchable after login.")
        try tap(result); try require(detail.waitForExistence(timeout: 15), "Search must open the real event detail.")
    }
    private func search() throws {
        try tap(app.buttons["calendar-search"])
        let field = app.searchFields.firstMatch
        try require(field.waitForExistence(timeout: 10), "The current native Calendar search must open.")
        try tap(field); field.typeText(title)
    }
    private func assertSearchEmpty() throws {
        try search()
        try require(element("calendar-search-empty").waitForExistence(timeout: 20), "This account must have no event matching the unique owned title.")
        try require(app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH 'calendar-search-result-'")).count == 0, "Empty search may not hide a real result.")
        let sheet = element("calendar-search-sheet"), done = app.buttons["calendar-search-done"]
        if !done.exists {
            try tap(app.navigationBars.buttons.matching(NSPredicate(format: "label IN %@", ["关闭", "Close", "取消", "Cancel"])).firstMatch)
            _ = sheet.waitForNonExistence(timeout: 3)
        }
        if sheet.exists { try tap(done) }
        try require(sheet.waitForNonExistence(timeout: 10) && app.buttons["calendar-search"].exists, "Closing search must restore Calendar.")
    }
    private func assertNoNotifications() throws {
        try tap(app.tabBars.buttons.element(boundBy: 3))
        try tap(app.buttons["inbox-notifications"])
        try require(element("notifications-empty").waitForExistence(timeout: 25) && !element("notifications-error").exists,
                    "The account's genuine notification source must remain empty without a refresh error.")
        try require(app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH 'notification-'")).count == 0, "Adding a personal companion must not create any invitation notification.")
        try tap(app.navigationBars.buttons.element(boundBy: 0))
    }
    private func cancelEditor() throws {
        try tap(app.navigationBars.buttons.matching(NSPredicate(format: "label IN %@", ["取消", "Cancel"])).firstMatch)
        try require(editor.waitForNonExistence(timeout: 10), "Cancel must dismiss the unsaved companion change.")
    }
    private func saveEditor() throws {
        try tap(app.buttons["event-save"])
        try require(editor.waitForNonExistence(timeout: 25), "The real event write must finish successfully.")
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
            try require(!clip.isNull && clip.height > 96, "The scroll surface must have a usable visible clip.")
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
        try require(false, "The complete intended target must be reachable above the current footer.")
    }
    private func tap(_ target: XCUIElement) throws {
        try require(target.waitForExistence(timeout: 15) && target.isEnabled && target.isHittable
            && window.insetBy(dx: -0.5, dy: -0.5).contains(target.frame), "The complete actual control must be reachable.")
        target.tap()
    }
    private func phase(_ name: String) throws {
        print("CALENDAR_COMPANIONS_PHASE \(name)"); fflush(stdout)
        try FiveRootQAReadBarrier.wait(for: name)
    }
    private func require(_ condition: Bool, _ message: String) throws {
        guard condition else {
            if let app, app.state == .runningForeground && app.secureTextFields.count == 0 { capture("failure-private") }
            XCTFail(message); throw NSError(domain: "FiveRootCalendarCompanionsPhone", code: 1, userInfo: [NSLocalizedDescriptionKey: message])
        }
    }
    private func capture(_ name: String) {
        XCTAssertEqual(app.secureTextFields.count, 0, "Never capture authentication or credentials.")
        let attachment = XCTAttachment(screenshot: app.screenshot())
        attachment.name = "five-root-calendar-companions-\(name)"; attachment.lifetime = .keepAlways; add(attachment)
    }
}
