import XCTest
import Darwin

/// Real, isolated Calendar UI writes. Preparation/cleanup and the GET-only oracle
/// run outside the App. This suite must never receive an ordinary account.
@MainActor final class FiveRootCalendarAdvancedPhoneUITests: XCTestCase {
    private struct Account: Decodable { let role, id, identifier, password: String }
    private struct Fixture: Decodable {
        let kind, runID, baseURL, bundle: String
        let schemaVersion: Int
        let accounts: [Account]
    }
    private var fixture: Fixture!
    private var app: XCUIApplication!
    private var selectedDay = Date()
    private var anchor: Date!
    private var caseName = ""
    private var title: String { "Advanced \(fixture.runID) \(caseName)" }
    private var berlin: Calendar {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "Europe/Berlin")!
        return calendar
    }
    private var window: CGRect { app.windows.firstMatch.frame }
    private var editor: XCUIElement { app.collectionViews["event-editor-form"].firstMatch }
    private func element(_ id: String) -> XCUIElement {
        app.descendants(matching: .any).matching(identifier: id).firstMatch
    }

    override func setUpWithError() throws {
        continueAfterFailure = false
        try XCTSkipUnless(ProcessInfo.processInfo.environment["SIDESEAT_CALENDAR_ADVANCED_EXECUTE"] == "1",
                          "Prepare only until the root task authorizes the fresh Calendar cohort.")
    }
    override func tearDown() async throws { await MainActor.run { app?.terminate() } }

    func testNavigationValidationAndRealDateTimeEdit() throws {
        try begin("timing")
        try selectDate(anchor)
        for mode in ["week", "day", "month"] {
            try tap(app.buttons["calendar-view-\(mode)"])
            try require(app.buttons["calendar-view-\(mode)"].isSelected, "The selected view must actually change.")
        }
        try require(app.buttons["calendar-month-day-\(key(anchor))"].isSelected,
                    "Non-Today selection must survive month/week/day switches.")
        try tap(app.buttons["new-event"])
        try assertNativeDate("event-start", anchor)
        capture("01-selected-month-day-create-cancel")
        try cancelEditor()
        try phase("navigation-cancelled")

        try createAtNine()
        try tap(app.buttons["event-save"])
        try require(element("event-editor-issue").waitForExistence(timeout: 10) && editor.exists,
                    "An empty title must show validation and retain the form.")
        capture("02-empty-title-retains-editor")
        try replace(app.textFields["event-title"], with: title)
        try require(element("event-editor-issue").waitForNonExistence(timeout: 10),
                    "Correcting the title must clear the current validation issue.")
        try phase("validation-recovered")
        try saveEditor()
        let created = try dayEvent(named: title, clock: "09:00 - 10:00")
        let id = eventID(created)
        identity("original", id)
        try phase("event-created")

        try tap(created)
        try tap(app.buttons["calendar-detail-edit"])
        let nextDay = addingDays(1, to: anchor)
        try setNativeDate("event-start", to: nextDay)
        try setNativeClock("event-start", hour: 11, minute: 15)
        try setNativeClock("event-end", hour: 12, minute: 45)
        capture("03-real-date-and-time-edited")
        try saveEditor()
        selectedDay = nextDay
        try phase("event-retimed")

        try selectDate(anchor)
        try search("Advanced \(fixture.runID) no-such-event")
        try require(element("calendar-search-empty").waitForExistence(timeout: 20), "The genuine empty search state must appear.")
        try replace(app.searchFields.firstMatch, with: title)
        let result = app.buttons["calendar-search-result-\(id)"]
        try require(result.waitForExistence(timeout: 20) && result.label.contains(title),
                    "Changing the query must recover the same event, not a replacement.")
        capture("04-search-empty-query-recovered")
        try closeSearch()
        try require(app.buttons["calendar-month-day-\(key(anchor))"].isSelected,
                    "Canceling search must preserve the previously selected non-Today date.")
        try phase("search-recovered")
        app.terminate()
        try loginOwner()
        try search(title)
        try tap(app.buttons["calendar-search-result-\(id)"])
        selectedDay = nextDay
        try require(element("calendar-readonly-detail").waitForExistence(timeout: 15), "The same event must reopen after login.")
        try require(element("calendar-detail-start").label.contains("11:15")
                    && element("calendar-detail-end").label.contains("12:45"),
                    "The native detail must read back the changed clock after relaunch.")
        capture("05-retimed-detail-after-relaunch")
        try phase("retimed-relaunched")
        try closeDetail()
        try selectDate(nextDay)
        try tap(app.buttons["calendar-view-day"])
        try require(app.buttons["calendar-view-day"].isSelected, "Deletion must use the actual selected day timeline after month date selection.")
        try deleteFromContext(try dayEvent(id: id), scope: "this")
        try phase("cleaned")
        try search(title)
        try require(element("calendar-search-empty").waitForExistence(timeout: 20), "The deleted retimed event must no longer be searchable.")
        try closeSearch()
        finish()
    }

    func testWeekMoveResizeCopyPasteAndDuplicate() throws {
        try begin("weekly")
        try selectDate(anchor)
        try createAtNine()
        try replace(app.textFields["event-title"], with: title)
        try saveEditor()
        let id = eventID(try dayEvent(named: title, clock: "09:00 - 10:00"))
        identity("original", id)
        try phase("event-created")
        try tap(app.buttons["calendar-view-week"])
        try dragWeek(id: id, resizing: false, durationMinutes: 60)
        capture("01-move-cancel")
        try tap(app.buttons["calendar-move-cancel-confirmation"])
        try require(element("calendar-move-confirmation").waitForNonExistence(timeout: 10), "Cancel must close the pending move.")
        try assertWeekClock(id, "09:00 - 10:00")
        try phase("move-cancelled")
        try dragWeek(id: id, resizing: false, durationMinutes: 60)
        try tap(app.buttons["calendar-move-confirm"])
        try require(element("calendar-notice").waitForExistence(timeout: 20), "The real move must finish successfully.")
        try assertWeekClock(id, "09:30 - 10:30")
        try phase("moved")

        try dragWeek(id: id, resizing: true, durationMinutes: 60)
        capture("02-resize-cancel")
        try tap(app.buttons["calendar-resize-cancel-confirmation"])
        try require(element("calendar-resize-confirmation").waitForNonExistence(timeout: 10), "Cancel must close the pending resize.")
        try assertWeekClock(id, "09:30 - 10:30")
        try phase("resize-cancelled")
        try dragWeek(id: id, resizing: true, durationMinutes: 60)
        try tap(app.buttons["calendar-resize-confirm"])
        try require(element("calendar-notice").waitForExistence(timeout: 20), "The real duration change must finish.")
        try assertWeekClock(id, "09:30 - 11:00")
        capture("03-week-move-and-resize-saved")
        try phase("resized")

        try tap(app.buttons["calendar-view-day"])
        let source = try dayEvent(id: id)
        source.press(forDuration: 0.9)
        try tap(app.buttons["calendar-event-context-copy"])
        try require(element("calendar-notice").waitForExistence(timeout: 10), "Copy must confirm through the current UI.")
        try phase("copied")
        let slot = element("calendar-slot-840")
        try revealTimeline(slot)
        slot.press(forDuration: 0.9)
        try tap(app.buttons["calendar-slot-context-paste-event"])
        let pasted = try dayEvent(named: title, clock: "14:00 - 15:30")
        let pastedID = eventID(pasted)
        try require(pastedID != id, "Paste must create an independent event identity.")
        identity("paste", pastedID)
        capture("04-pasted-independent-copy")
        try phase("pasted")
        let original = try dayEvent(id: id)
        original.press(forDuration: 0.9)
        try tap(app.buttons["calendar-event-context-duplicate"])
        let duplicate = try dayEvent(named: title, clock: "11:00 - 12:30")
        let duplicateID = eventID(duplicate)
        try require(Set([id, pastedID, duplicateID]).count == 3, "Duplicate must be a third independent event.")
        identity("duplicate", duplicateID)
        capture("05-immediate-duplicate-at-source-end")
        try phase("duplicated")
        app.terminate()
        try loginOwner()
        try selectDate(anchor)
        try tap(app.buttons["calendar-view-day"])
        for (eventID, clock) in [(id, "09:30 - 11:00"), (pastedID, "14:00 - 15:30"), (duplicateID, "11:00 - 12:30")] {
            let event = try dayEvent(id: eventID)
            try require(normalizedClock(event) == clock, "Every independent copy must retain its exact time after relaunch.")
        }
        try phase("copies-relaunched")
        try deleteFromContext(try dayEvent(id: duplicateID), scope: "this")
        try phase("deleted-duplicate")
        try deleteFromContext(try dayEvent(id: pastedID), scope: "this")
        try phase("deleted-paste")
        try deleteFromContext(try dayEvent(id: id), scope: "this")
        try phase("cleaned")
        finish()
    }

    func testRecurringScopeCancelThisFutureAllAndDelete() throws {
        try begin("recurrence")
        try selectDate(anchor)
        try createAtNine()
        try replace(app.textFields["event-title"], with: title)
        try reveal(element("event-repeat"), in: editor)
        try tap(element("event-repeat"))
        try tap(app.buttons.matching(NSPredicate(format: "label IN %@", ["每天", "Every day"])).firstMatch)
        try saveEditor()
        let firstID = eventID(try dayEvent(named: title, clock: "09:00 - 10:00"))
        try require(firstID.contains("_occ_"), "A real recurring event must expose an occurrence identity.")
        identity("first", firstID)
        try phase("series-created")

        let secondDay = addingDays(1, to: anchor)
        try selectDate(secondDay)
        try tap(app.buttons["calendar-view-day"])
        let secondID = eventID(try dayEvent(named: title, clock: "09:00 - 10:00"))
        identity("second", secondID)
        try tap(try dayEvent(id: secondID))
        try tap(app.buttons["calendar-detail-edit"])
        try replace(app.textFields["event-title"], with: title + " this")
        try tap(app.buttons["event-save"])
        try require(element("event-action-prompt").waitForExistence(timeout: 10)
                    && app.buttons["event-update-this"].exists && app.buttons["event-update-future"].exists
                    && app.buttons["event-update-all"].exists, "A recurring edit must offer every existing scope.")
        capture("01-recurring-update-scope-cancel")
        try tap(app.buttons["event-action-cancel"])
        try require(editor.exists && app.textFields["event-title"].value as? String == title + " this",
                    "Canceling scope selection must keep the unsaved form and its text.")
        try phase("scope-cancelled")
        try tap(app.buttons["event-save"])
        try tap(app.buttons["event-update-this"])
        try require(editor.waitForNonExistence(timeout: 25), "Only-this update must finish.")
        try require(try dayEvent(id: secondID).label == title + " this", "The same occurrence must retain its identity and read back its own edit.")
        try phase("single-edited")
        app.terminate()
        try loginOwner()
        try selectDate(secondDay)
        try tap(app.buttons["calendar-view-day"])
        try require(try dayEvent(id: secondID).label == title + " this", "Only-this override must survive relaunch.")
        try phase("single-relaunched")

        let thirdDay = addingDays(2, to: anchor)
        try selectDate(thirdDay)
        try tap(app.buttons["calendar-view-day"])
        let thirdID = eventID(try dayEvent(named: title, clock: "09:00 - 10:00"))
        identity("old-third", thirdID)
        try editTitle(id: thirdID, to: title + " future", scope: "future")
        let futureID = eventID(try dayEvent(named: title + " future", clock: "09:00 - 10:00"))
        try require(futureID != thirdID, "A future split must expose the new series identity.")
        identity("future-first", futureID)
        capture("02-future-series-created")
        try phase("future-edited")
        try editTitle(id: futureID, to: title + " all", scope: "all")
        try require(try dayEvent(id: futureID).label == title + " all", "All must update the current split series while retaining its identity.")
        try phase("all-edited")
        try deleteFromContext(try dayEvent(id: futureID), scope: "all")
        try phase("new-series-deleted")
        try selectDate(secondDay)
        try tap(app.buttons["calendar-view-day"])
        try deleteFromContext(try dayEvent(id: secondID), scope: "this")
        try phase("single-deleted")
        try selectDate(anchor)
        try tap(app.buttons["calendar-view-day"])
        try deleteFromContext(try dayEvent(id: firstID), scope: "all")
        try phase("cleaned")
        try search(title)
        try require(element("calendar-search-empty").waitForExistence(timeout: 20), "Both owned series and the override must be absent from search after cleanup.")
        try closeSearch()
        finish()
    }

    private func begin(_ name: String) throws {
        try require(ProcessInfo.processInfo.environment["SIMULATOR_UDID"] == nil, "This acceptance requires the default physical iPhone14Plus.")
        try require(ProcessInfo.processInfo.environment["SIDESEAT_CALENDAR_ADVANCED_CASE"] == name,
                    "Run exactly the explicitly selected case with its own fresh two-account cohort.")
        let raw = ProcessInfo.processInfo.environment["SIDESEAT_CALENDAR_ADVANCED_FIXTURE_JSON"] ?? ""
        try XCTSkipUnless(!raw.isEmpty, "Inject only the dedicated fresh Calendar-advanced factory fixture.")
        fixture = try JSONDecoder().decode(Fixture.self, from: Data(raw.utf8))
        try require(fixture.kind == "five-roots-live" && fixture.schemaVersion == 1
                    && fixture.baseURL == "https://api.sideseat.de" && fixture.bundle == "app.sideseat.mobile.preview"
                    && fixture.runID.range(of: "^[a-f0-9]{12}$", options: .regularExpression) != nil,
                    "Use the existing isolated production Preview factory contract.")
        try require(Set(fixture.accounts.map(\.role)) == ["owner", "peer"] && Set(fixture.accounts.map(\.id)).count == 2
                    && fixture.accounts.allSatisfy { $0.identifier == "e2e_roots_\($0.role)_\(fixture.runID)" },
                    "Use exactly two distinct owned accounts, never an ordinary identity.")
        caseName = name
        let nextMonth = try XCTUnwrap(berlin.date(byAdding: .month, value: 1, to: berlin.dateInterval(of: .month, for: Date())!.start))
        anchor = try XCTUnwrap(berlin.date(byAdding: .day, value: 14, to: nextMonth))
        print("CALENDAR_ADVANCED_BEGIN \(name) \(anchor.ISO8601Format())"); fflush(stdout)
        try loginOwner()
        try phase("signed-in")
    }
    private func loginOwner() throws {
        let owner = try XCTUnwrap(fixture.accounts.first { $0.role == "owner" })
        app?.terminate()
        app = XCUIApplication(bundleIdentifier: fixture.bundle)
        app.launchArguments = ["--ui-testing-signed-out", "--ui-testing-ephemeral-credentials", "--ui-testing-skip-tutorial",
                               "--ui-testing-language=zh-Hans", "--ui-testing-appearance=light",
                               "-UIPreferredContentSizeCategoryName", "UICTContentSizeCategoryL"]
        app.launchEnvironment = [:]
        app.launch()
        let identifier = app.textFields["login-identifier"]
        try require(identifier.waitForExistence(timeout: 25), "The genuine signed-out form must appear.")
        identifier.tap(); identifier.typeText(owner.identifier)
        app.secureTextFields["login-password"].tap(); app.secureTextFields["login-password"].typeText(owner.password)
        app.buttons["login-submit"].tap()
        try require(app.tabBars.firstMatch.waitForExistence(timeout: 35) && app.tabBars.buttons.count == 5,
                    "Real authentication must reach the current five-tab shell.")
        let deny = XCUIApplication(bundleIdentifier: "com.apple.springboard").buttons.matching(
            NSPredicate(format: "label IN %@", ["不允许", "Don’t Allow", "Don't Allow"])).firstMatch
        if deny.waitForExistence(timeout: 1) { deny.tap() }
        try tap(app.tabBars.buttons.element(boundBy: 2))
        try require(app.buttons["calendar-search"].waitForExistence(timeout: 25), "The actual Calendar root must open.")
        selectedDay = berlin.startOfDay(for: Date())
    }
    private func selectDate(_ date: Date) throws {
        try tap(app.buttons["calendar-view-month"])
        let old = berlin.dateComponents([.year, .month], from: selectedDay)
        let next = berlin.dateComponents([.year, .month], from: date)
        let delta = (next.year! - old.year!) * 12 + next.month! - old.month!
        try require(abs(delta) <= 2, "Stay within this bounded owned Calendar window.")
        let month = app.scrollViews["calendar-month-view"].firstMatch
        for _ in 0..<abs(delta) {
            let frame = month.frame.intersection(window)
            try require(!frame.isNull && frame.height > 160, "The real month grid must be visible.")
            let origin = app.coordinate(withNormalizedOffset: .zero), y = frame.minY + 100
            let left = origin.withOffset(CGVector(dx: frame.minX + 28, dy: y))
            let right = origin.withOffset(CGVector(dx: frame.maxX - 28, dy: y))
            (delta > 0 ? right : left).press(forDuration: 0.05, thenDragTo: delta > 0 ? left : right,
                                            withVelocity: .slow, thenHoldForDuration: 0.1)
            RunLoop.current.run(until: Date().addingTimeInterval(0.35))
        }
        let day = app.buttons["calendar-month-day-\(key(date))"]
        try reveal(day, in: month)
        try tap(day)
        try require(day.isSelected, "The exact non-Today date must really become selected.")
        selectedDay = date
    }
    private func createAtNine() throws {
        try tap(app.buttons["calendar-view-day"])
        let slot = element("calendar-slot-540")
        try revealTimeline(slot); try tap(slot)
        try require(editor.waitForExistence(timeout: 15), "Tapping the real09:00 slot must open the native form.")
    }
    private func dayEvent(named name: String, clock: String) throws -> XCUIElement {
        let candidates = app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH 'calendar-timeline-event-' AND label == %@", name))
        try require(candidates.firstMatch.waitForExistence(timeout: 20), "The owned event title must exist.")
        for _ in 0..<50 {
            let matches = candidates.allElementsBoundByIndex.filter { normalizedClock($0) == clock }
            if matches.count == 1 { try revealTimeline(matches[0]); return matches[0] }
            RunLoop.current.run(until: Date().addingTimeInterval(0.2))
        }
        try require(false, "Find exactly one owned title and normalized clock, never an arbitrary overlapping row.")
        throw NSError(domain: "FiveRootCalendarAdvancedPhone", code: 2)
    }
    private func dayEvent(id: String) throws -> XCUIElement {
        let event = app.buttons["calendar-timeline-event-\(id)"]
        try revealTimeline(event); return event
    }
    private func eventID(_ event: XCUIElement) -> String {
        String(event.identifier.dropFirst("calendar-timeline-event-".count))
    }
    private func editTitle(id: String, to value: String, scope: String) throws {
        try tap(try dayEvent(id: id)); try tap(app.buttons["calendar-detail-edit"])
        try replace(app.textFields["event-title"], with: value)
        try tap(app.buttons["event-save"]); try tap(app.buttons["event-update-\(scope)"])
        try require(editor.waitForNonExistence(timeout: 25), "The explicit recurring scope update must finish.")
    }
    private func deleteFromContext(_ event: XCUIElement, scope: String) throws {
        let id = event.identifier
        event.press(forDuration: 0.9)
        try tap(app.buttons["calendar-event-context-delete"])
        try tap(app.buttons["calendar-event-delete-\(scope)"])
        try require(app.buttons[id].waitForNonExistence(timeout: 25), "The exact owned event must disappear after confirmation.")
    }
    private func dragWeek(id: String, resizing: Bool, durationMinutes: Int) throws {
        let event = app.buttons["home-week-event-\(id)"]
        let frame = try revealWeekEvent(event)
        try require(frame.height >= 44 && frame.width > 22, "The complete genuine week event must be a usable gesture target.")
        let minuteHeight = (frame.height + 1.5) / CGFloat(durationMinutes)
        let start = app.coordinate(withNormalizedOffset: .zero).withOffset(
            CGVector(dx: frame.midX, dy: frame.minY + frame.height * (resizing ? 0.97 : 0.5)))
        let end = start.withOffset(CGVector(dx: 0, dy: minuteHeight * 30))
        print("CALENDAR_ADVANCED_GESTURE \(caseName) \(resizing ? "resize" : "move") frame=\(frame) delta=\(minuteHeight * 30)"); fflush(stdout)
        start.press(forDuration: 0.34, thenDragTo: end, withVelocity: XCUIGestureVelocity(rawValue: 40), thenHoldForDuration: 0.1)
        try require(element(resizing ? "calendar-resize-confirmation" : "calendar-move-confirmation").waitForExistence(timeout: 10),
                    "The actual gesture must open the matching pending confirmation before any write.")
    }
    private func revealWeekEvent(_ target: XCUIElement) throws -> CGRect {
        let week = element("home-week-timetable"), scroll = element("home-week-timetable").scrollViews.firstMatch
        try require(scroll.waitForExistence(timeout: 10) && target.waitForExistence(timeout: 20), "The original Week timeline and event must exist before revealing a drag target.")
        let headers = week.buttons.matching(NSPredicate(format: "identifier MATCHES %@", "home-week-day-[0-9]{4}-[0-9]{2}-[0-9]{2}")).allElementsBoundByIndex
            .filter { $0.frame.width > 0 && $0.frame.height > 0 && window.contains($0.frame) }
            .sorted { $0.frame.midX < $1.frame.midX }
        let nativeViewport = scroll.frame.intersection(window)
        let columnWidth = floor(max(0, nativeViewport.width - 52) / CGFloat(max(1, headers.count)))
        let pitches = (1..<max(1, headers.count)).map { headers[$0].frame.midX - headers[$0-1].frame.midX }
        try require([3, 5, 7].contains(headers.count) && Set(headers.map(\.identifier)).count == headers.count
                    && pitches.count == headers.count - 1 && pitches.allSatisfy { abs($0 - columnWidth) <= 1 },
                    "Use genuine visible date-header pitches and the native viewport, never the aggregate buffered Week AX width.")
        let maximumCardWidth = max(1, columnWidth - 3)
        let selectedHeaders = headers.filter { $0.identifier == "home-week-day-\(key(selectedDay))" }
        try require(selectedHeaders.count == 1, "The actual selected date must have exactly one visible Week column.")
        let selectedColumn = selectedHeaders[0].frame
        let identifier = target.identifier
        var nativeSwipes = 0
        for iteration in 0..<18 {
            let actions = element("calendar-bottom-actions"), nav = app.navigationBars.firstMatch.frame
            let bottom = min(actions.exists ? actions.frame.minY : window.maxY - 36,
                             app.tabBars.firstMatch.exists ? app.tabBars.firstMatch.frame.minY : window.maxY - 36) - 8
            let top = max(scroll.frame.minY, nav.maxY + 2)
            let clip = scroll.frame.intersection(window).intersection(CGRect(x: window.minX, y: top, width: window.width, height: max(0, bottom - top)))
            let exact = app.descendants(matching: .any).matching(identifier: identifier).allElementsBoundByIndex
            let parents = app.buttons.matching(identifier: identifier).allElementsBoundByIndex
            try require(exact.count == 1 && parents.count == 1,
                        "Keep exactly one semantic event identity; never choose an arbitrary same-ID match.")
            let parent = parents[0]
            try require(parent.identifier == identifier && parent.label == title
                        && normalizedClock(parent).range(of: "^(?:[01][0-9]|2[0-3]):[0-5][0-9] - (?:[01][0-9]|2[0-3]):[0-5][0-9]$", options: .regularExpression) != nil,
                        "The semantic Button must retain this owned title and both complete clocks.")
            let drawings = parent.children(matching: .other).allElementsBoundByIndex
            try require(drawings.count == 1, "Use exactly the event Button's one direct drawn Other child.")
            let drawing = drawings[0]
            let frame = drawing.frame
            let inSelectedColumn = frame.minX >= selectedColumn.minX - 0.5
                && frame.maxX <= selectedColumn.maxX + 0.5
            let childInWindow = !frame.isNull && !frame.isInfinite && frame.width > 0 && frame.height > 0
                && [frame.minX, frame.minY, frame.width, frame.height].allSatisfy { $0.isFinite }
                && window.contains(frame)
            let childHittable = childInWindow ? String(drawing.isHittable) : "not-evaluated-offscreen"
            let parentHittable = parent.isHittable
            let narrow = frame.width > 0 && frame.width <= maximumCardWidth + 1 && frame.height > 0 && frame.height <= clip.height
            let hints = ["calendar-week-offscreen-event-top", "calendar-week-offscreen-event-bottom"]
                .map { app.buttons[$0] }.filter { $0.exists && $0.isEnabled && $0.isHittable && window.contains($0.frame) }
            print("CALENDAR_ADVANCED_WEEK_TOUCH iteration=\(iteration) target=\(parent.identifier) identityCount=\(exact.count) buttonCount=\(parents.count) directOtherCount=\(drawings.count) label=\(parent.label) fullClock=\(normalizedClock(parent)) semanticFrame=\(parent.frame) drawnFrame=\(frame) clip=\(clip) nativeViewport=\(nativeViewport) maximumCardWidth=\(maximumCardWidth) selectedDate=\(key(selectedDay)) selectedColumn=\(selectedColumn) parentHittable=\(parentHittable) childHittable=\(childHittable) hints=\(hints.map(\.identifier)) nativeSwipes=\(nativeSwipes)"); fflush(stdout)
            if narrow && inSelectedColumn && parentHittable
                && clip.insetBy(dx: -0.5, dy: -0.5).contains(frame) { return frame }
            try require(!clip.isNull && clip.height > 96, "The real Week scroll viewport must be usable above its actual footer.")
            try require(hints.count <= 1, "This phase has one owned event; do not choose an ambiguous hidden-event hint.")
            if let hint = hints.first { try tap(hint); continue }
            // Re-query the exact semantic identity and its fresh drawn child on every reveal round.
            RunLoop.current.run(until: Date().addingTimeInterval(0.2))
            if iteration % 3 == 2 && nativeSwipes < 5 {
                if narrow && frame.maxY > clip.maxY { scroll.swipeUp(velocity: .slow) }
                else { scroll.swipeDown(velocity: .slow) }
                nativeSwipes += 1
            }
        }
        try require(false, "A real hint/native scroll must resolve the same narrow full-viewport hittable Week card before the original edit gesture.")
        throw NSError(domain: "FiveRootCalendarAdvancedPhone", code: 3)
    }
    private func assertWeekClock(_ id: String, _ clock: String) throws {
        let event = app.buttons["home-week-event-\(id)"]
        for _ in 0..<100 {
            if event.exists && normalizedClock(event) == clock { return }
            RunLoop.current.run(until: Date().addingTimeInterval(0.2))
        }
        try require(false, "The same week event must read back its exact expected clock.")
    }
    private func normalizedClock(_ event: XCUIElement) -> String {
        let raw = event.value as? String ?? ""
        let pattern = try! NSRegularExpression(pattern: "([0-9]{1,2}):([0-9]{2})")
        // The day surface uses Date.formatted(.shortened), which follows the
        // device's 12/24-hour preference. Preserve each clock's meridiem.
        let clocks = raw.components(separatedBy: " - ").compactMap { value -> String? in
            let ns = value as NSString
            guard let match = pattern.firstMatch(in: value, range: NSRange(location: 0, length: ns.length)),
                  var hour = Int(ns.substring(with: match.range(at: 1))),
                  let minute = Int(ns.substring(with: match.range(at: 2))) else { return nil }
            let afternoon = value.range(of: "下午|晚上|中午|午後|\\bp\\.?\\s?m\\.?\\b", options: [.regularExpression, .caseInsensitive]) != nil
            let morning = value.range(of: "上午|凌晨|早上|午前|\\ba\\.?\\s?m\\.?\\b", options: [.regularExpression, .caseInsensitive]) != nil
            if afternoon && hour < 12 { hour += 12 }
            if morning && hour == 12 { hour = 0 }
            return String(format: "%02d:%02d", hour, minute)
        }
        return clocks.joined(separator: " - ")
    }
    private func picker(_ id: String) -> XCUIElement {
        let native = app.datePickers.matching(identifier: id).firstMatch
        return native.exists ? native : element(id)
    }
    private func setNativeDate(_ id: String, to date: Date) throws {
        let control = picker(id)
        try reveal(control, in: editor)
        let dateButton = control.buttons.allElementsBoundByIndex.first { !$0.label.contains(":") && $0.isHittable }
        if let dateButton { try tap(dateButton) }
        else { control.coordinate(withNormalizedOffset: CGVector(dx: 0.22, dy: 0.5)).tap() }
        let day = berlin.component(.day, from: date), month = berlin.component(.month, from: date)
        let alternatives = [String(day), "\(day)日", "\(month)月\(day)日", "\(month)月\(String(format: "%02d", day))日"]
        let choices = app.buttons.matching(NSPredicate(format: "label IN %@ OR label CONTAINS %@", alternatives, "\(month)月\(day)日"))
        let found = choices.allElementsBoundByIndex.first { $0.isHittable && !control.frame.contains($0.frame) }
        try require(found != nil, "Use an actual visible native calendar-day button; never set a picker value programmatically.")
        try tap(found!)
        dismissNativePopover()
        try assertNativeDate(id, date)
    }
    private func assertNativeDate(_ id: String, _ date: Date) throws {
        let control = picker(id)
        try require(control.waitForExistence(timeout: 10), "The genuine date picker must be present.")
        let c = berlin.dateComponents([.year, .month, .day], from: date)
        let representations = ["\(c.year!)年\(c.month!)月\(c.day!)日", "\(c.year!)/\(c.month!)/\(c.day!)",
            String(format: "%04d/%02d/%02d", c.year!, c.month!, c.day!),
            String(format: "%02d.%02d.%04d", c.day!, c.month!, c.year!)]
        let actual = ([control.label, control.value as? String ?? ""] + control.descendants(matching: .any).allElementsBoundByIndex.map(\.label)).joined(separator: " ")
        try require(representations.contains { actual.contains($0) }, "The actual native picker must display the selected Berlin calendar date.")
    }
    private func setNativeClock(_ id: String, hour: Int, minute: Int) throws {
        let control = picker(id)
        try reveal(control, in: editor)
        let clock = control.buttons.matching(NSPredicate(format: "label MATCHES %@", ".*[0-9]{1,2}:[0-9]{2}.*")).firstMatch
        if clock.exists { try tap(clock) }
        else { control.coordinate(withNormalizedOffset: CGVector(dx: 0.84, dy: 0.5)).tap() }
        let hourWheel = app.pickerWheels.matching(NSPredicate(format: "value MATCHES %@", "[0-9]{1,2}点")).firstMatch
        let minuteWheel = app.pickerWheels.matching(NSPredicate(format: "value MATCHES %@", "[0-9]{2}分钟")).firstMatch
        try require(hourWheel.waitForExistence(timeout: 5) && minuteWheel.exists,
                    "The real compact native clock must expose its Chinese hour/minute wheels.")
        hourWheel.adjust(toPickerWheelValue: String(hour))
        minuteWheel.adjust(toPickerWheelValue: String(format: "%02d", minute))
        try require((hourWheel.value as? String)?.hasPrefix(String(hour)) == true
                    && (minuteWheel.value as? String)?.hasPrefix(String(format: "%02d", minute)) == true,
                    "Actual wheel UI values must match the selected five-minute clock.")
        dismissNativePopover()
    }
    private func dismissNativePopover() {
        app.navigationBars.firstMatch.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)).tap()
    }
    private func replace(_ target: XCUIElement, with value: String) throws {
        let field: XCUIElement
        let isSearch = target.elementType == .searchField
        if isSearch { field = target }
        else {
            let nativeField = app.textFields.matching(identifier: target.identifier).firstMatch
            let nativeView = app.textViews.matching(identifier: target.identifier).firstMatch
            field = nativeField.exists ? nativeField : nativeView.exists ? nativeView : target
        }
        try require(field.waitForExistence(timeout: 15) && field.isEnabled,
                    "The actual native input must exist and be enabled.")
        try require(isSearch || ["event-title", "event-location", "event-notes"].contains(field.identifier), "Replace only this test's owned event inputs or actual SearchField.")
        if isSearch {
            try require(field.isHittable && window.insetBy(dx: -0.5, dy: -0.5).contains(field.frame), "The real navigation SearchField must be fully visible before focus.")
            field.tap()
            let deadline = Date().addingTimeInterval(3)
            while !inputIsAboveKeyboard(field) && Date() < deadline { RunLoop.current.run(until: Date().addingTimeInterval(0.1)) }
            try require(inputIsAboveKeyboard(field), "The actual SearchField must remain above the visible keyboard before input.")
        } else { try prepareVisibleInput(field, in: editor) }
        let current = try XCTUnwrap(field.value as? String)
        if !current.isEmpty && current != field.placeholderValue {
            let labels = ["Clear text", "Clear Text", "Clear", "清除文本", "清除文字", "清除", "Text löschen", "Löschen"]
            let clear = field.buttons.matching(NSPredicate(format: "identifier IN %@ OR label IN %@", labels, labels)).firstMatch
            let keyboard = visibleKeyboardFrame()
            if isSearch && clear.exists && clear.isEnabled && clear.isHittable
                && field.frame.insetBy(dx: -0.5, dy: -0.5).contains(clear.frame)
                && !keyboard.intersects(clear.frame) {
                clear.tap()
                let deadline = Date().addingTimeInterval(2)
                while Date() < deadline {
                    let remaining = try XCTUnwrap(field.value as? String)
                    if remaining.isEmpty || remaining == field.placeholderValue { break }
                    RunLoop.current.run(until: Date().addingTimeInterval(0.1))
                }
            } else if !isSearch && field.identifier == "event-title" {
                try clearTitleUsingNativeParagraphSelection(field)
            } else { try clearMeasuredInputAtEnd(field) }
        }
        let cleared = try XCTUnwrap(field.value as? String)
        try require(cleared.isEmpty || cleared == field.placeholderValue, "Previous text must genuinely be cleared.")
        try require(inputIsAboveKeyboard(field), "The complete cleared input must remain visible above the keyboard.")
        field.typeText(value)
        try require(field.value as? String == value, "The input must exactly match the intended new value.")
        try require(inputIsAboveKeyboard(field), "The complete replacement input must remain visible above the keyboard.")
        if isSearch {
            if app.keyboards.buttons["return"].exists { app.keyboards.buttons["return"].tap() }
        } else { try dismissEventEditorKeyboard() }
    }
    private func visibleKeyboardFrame() -> CGRect {
        let keyboard = app.keyboards.firstMatch
        return keyboard.exists ? keyboard.frame.intersection(window) : CGRect.null
    }
    private func inputIsAboveKeyboard(_ field: XCUIElement) -> Bool {
        let keyboard = visibleKeyboardFrame()
        guard !keyboard.isNull && keyboard.height > 120 else { return false }
        let navBottom = field.elementType == .searchField ? window.minY : app.navigationBars.firstMatch.frame.maxY + 4
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
    private func clearTitleUsingNativeParagraphSelection(_ field: XCUIElement) throws {
        let old = try XCTUnwrap(field.value as? String)
        try require(field.identifier == "event-title" && !old.isEmpty && old != field.placeholderValue
                    && !old.contains("\n") && !old.contains("\r") && inputIsAboveKeyboard(field),
                    "Select only the visible owned single-paragraph Title.")
        field.tap(withNumberOfTaps: 3, numberOfTouches: 1)
        try require(field.value as? String == old && inputIsAboveKeyboard(field),
                    "One native paragraph triple-tap must preserve the complete old Title and visible keyboard.")
        let labels = ["delete", "Delete", "删除"]
        let keyboard = visibleKeyboardFrame()
        let deletes = app.keyboards.firstMatch.keys.matching(NSPredicate(format: "label IN %@ OR identifier IN %@", labels, labels))
            .allElementsBoundByIndex.filter {
                $0.exists && $0.isEnabled && $0.isHittable && !keyboard.isNull
                    && keyboard.insetBy(dx: -0.5, dy: -0.5).contains($0.frame)
            }
        try require(!keyboard.isNull && keyboard.height > 120 && deletes.count == 1,
                    "Use exactly one real visible software keyboard Delete key.")
        deletes[0].tap()
        let deadline = Date().addingTimeInterval(2)
        while Date() < deadline {
            let value = try XCTUnwrap(field.value as? String)
            if value.isEmpty || value == field.placeholderValue { break }
            RunLoop.current.run(until: Date().addingTimeInterval(0.1))
        }
        let value = try XCTUnwrap(field.value as? String)
        print("CALENDAR_ADVANCED_TITLE_TRIPLE_CLEAR oldCharacters=\(old.count) emptyOrPlaceholder=\(value.isEmpty || value == field.placeholderValue) deleteTaps=1 tripleTapCalls=1"); fflush(stdout)
        try require((value.isEmpty || value == field.placeholderValue) && inputIsAboveKeyboard(field),
                    "One software Delete must genuinely clear the entire Title before replacement; never retry a partial clear.")
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
        if field.elementType == .searchField {
            for button in field.buttons.allElementsBoundByIndex where button.isHittable {
                if button.frame.contains(CGPoint(x: tailX, y: tailY)) { tailX = button.frame.minX - 8 }
            }
        }
        let caret = field.coordinate(withNormalizedOffset: CGVector(dx: (tailX-frame.minX)/frame.width, dy: (tailY-frame.minY)/frame.height))
        let point = caret.screenPoint
        try require(frame.contains(point) && window.contains(point) && !keyboard.isNull && !keyboard.contains(point), "The actual field-referenced tail tap must be inside the visible field and outside the keyboard.")
        if done.exists { try require(!done.frame.contains(point), "The tail tap must not hit the floating keyboard Done button.") }
        if field.elementType == .searchField {
            for button in field.buttons.allElementsBoundByIndex where button.isHittable {
                try require(!button.frame.contains(point), "The actual SearchField tail tap must avoid its visible buttons.")
            }
        }
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
    private func search(_ query: String) throws {
        try tap(app.buttons["calendar-search"])
        let field = app.searchFields.firstMatch
        try require(field.waitForExistence(timeout: 10), "The real Calendar search must open.")
        field.tap(); field.typeText(query)
    }
    private func closeSearch() throws {
        let sheet = element("calendar-search-sheet"), done = app.buttons["calendar-search-done"]
        if !done.exists {
            try tap(app.navigationBars.buttons.matching(NSPredicate(format: "label IN %@", ["关闭", "Close", "取消", "Cancel"])).firstMatch)
            _ = sheet.waitForNonExistence(timeout: 3)
        }
        if sheet.exists { try tap(done) }
        try require(sheet.waitForNonExistence(timeout: 10) && !app.keyboards.firstMatch.exists,
                    "Canceling search must leave no search or keyboard over Calendar.")
    }
    private func cancelEditor() throws { try tap(app.navigationBars.buttons.matching(NSPredicate(format: "label IN %@", ["取消", "Cancel"])).firstMatch) }
    private func closeDetail() throws { try tap(app.navigationBars.buttons.matching(NSPredicate(format: "label IN %@", ["完成", "Done"])).firstMatch) }
    private func saveEditor() throws {
        try tap(app.buttons["event-save"])
        try require(editor.waitForNonExistence(timeout: 25), "The genuine editor save must finish, not merely show a tapped button.")
    }
    private func revealTimeline(_ target: XCUIElement) throws {
        try reveal(target, in: app.scrollViews["calendar-day-timeline"].firstMatch, inGutter: true)
    }
    private func reveal(_ target: XCUIElement, in scroll: XCUIElement, inGutter: Bool = false) throws {
        try require(scroll.waitForExistence(timeout: 10) && target.waitForExistence(timeout: 20), "The actual scroll surface and intended target must exist.")
        for iteration in 0..<18 {
            let nav = app.navigationBars.firstMatch.frame
            let actions = element("calendar-bottom-actions")
            let bottom = min(actions.exists ? actions.frame.minY : window.maxY - 36,
                             app.tabBars.firstMatch.exists ? app.tabBars.firstMatch.frame.minY : window.maxY - 36) - 8
            let top = max(scroll.frame.minY, nav.maxY + 2)
            let clip = scroll.frame.intersection(CGRect(x: window.minX, y: top, width: window.width, height: max(0, bottom - top)))
            if caseName == "weekly" {
                let hintCount = ["calendar-week-offscreen-event-top", "calendar-week-offscreen-event-bottom"]
                    .map { app.buttons[$0] }.filter { $0.exists && $0.isEnabled && $0.isHittable }.count
                print("CALENDAR_ADVANCED_REVEAL iteration=\(iteration) target=\(target.identifier) targetFrame=\(target.frame) clip=\(clip) scrollFrame=\(scroll.frame) hittable=\(target.isHittable) hintsCount=\(hintCount)"); fflush(stdout)
            }
            if target.isHittable && clip.insetBy(dx: -0.5, dy: -0.5).contains(target.frame) { return }
            try require(!clip.isNull && clip.height > 96, "The current surface must have a usable visible clip.")
            let down = target.frame.minY < clip.minY
            let gap = down ? clip.minY - target.frame.minY : target.frame.maxY - clip.maxY
            let distance = min(CGFloat(180), max(CGFloat(48), gap + 8))
            let origin = app.coordinate(withNormalizedOffset: .zero)
            let x = inGutter ? clip.minX + 24 : clip.midX
            let endY = min(clip.maxY - 24, max(clip.minY + 24, clip.midY + (down ? distance : -distance)))
            origin.withOffset(CGVector(dx: x, dy: clip.midY)).press(forDuration: 0.05,
                thenDragTo: origin.withOffset(CGVector(dx: x, dy: endY)), withVelocity: .slow, thenHoldForDuration: 0.1)
        }
        try require(false, "The complete intended control must be reachable above the actual footer.")
    }
    private func tap(_ target: XCUIElement) throws {
        try require(target.waitForExistence(timeout: 15) && target.isEnabled && target.isHittable
                    && window.insetBy(dx: -0.5, dy: -0.5).contains(target.frame), "The complete actual control must be reachable in this window.")
        target.tap()
    }
    private func addingDays(_ count: Int, to date: Date) -> Date { berlin.date(byAdding: .day, value: count, to: date)! }
    private func key(_ date: Date) -> String {
        let c = berlin.dateComponents([.year, .month, .day], from: date)
        return String(format: "%04d-%02d-%02d", c.year!, c.month!, c.day!)
    }
    private func identity(_ name: String, _ id: String) { print("CALENDAR_ADVANCED_ID \(caseName) \(name) \(id)"); fflush(stdout) }
    private func phase(_ name: String) throws {
        print("CALENDAR_ADVANCED_PHASE \(caseName) \(name)"); fflush(stdout)
        try FiveRootQAReadBarrier.wait(for: name)
    }
    private func finish() { print("CALENDAR_ADVANCED_END \(caseName)"); fflush(stdout) }
    private func require(_ condition: Bool, _ message: String) throws {
        guard condition else {
            if let app, app.state == .runningForeground && app.secureTextFields.count == 0 { capture("failure-private") }
            XCTFail(message)
            throw NSError(domain: "FiveRootCalendarAdvancedPhone", code: 1, userInfo: [NSLocalizedDescriptionKey: message])
        }
    }
    private func capture(_ name: String) {
        XCTAssertEqual(app.secureTextFields.count, 0, "Never capture authentication or credentials.")
        let image = XCTAttachment(screenshot: app.screenshot()); image.name = "five-root-calendar-advanced-\(caseName)-\(name)"
        image.lifetime = .keepAlways; add(image)
    }
}
