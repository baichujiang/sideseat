import XCTest
import Darwin

/// Physical Preview acceptance on the six-account disposable fixture. All writes use App UI.
/// Runner destination: default iPhone 14 Plus, 00008110-001A69110CC1401E.
@MainActor final class FiveRootPlanInputPhoneUITests: XCTestCase {
    private struct Account: Decodable {
        let role: String
        let id: String
        let identifier: String
        let password: String
    }
    private struct Fixture: Decodable {
        let kind: String
        let schemaVersion: Int
        let baseURL: String
        let runID: String
        let edgePrefix: String
        let bundle: String
        let accounts: [Account]
    }
    private var fixture: Fixture!
    private var app: XCUIApplication!
    private var berlin: Calendar {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "Europe/Berlin")!
        return calendar
    }
    private var planTitle: String { fixture.edgePrefix + " 日期跨月" }
    private let location = "日期跨月验证"

    override func setUpWithError() throws {
        continueAfterFailure = false
    }

    @MainActor private func loadFixture() throws {
        try require(ProcessInfo.processInfo.environment["SIMULATOR_UDID"] == nil, "Use the default physical iPhone, not a Simulator.")
        let raw = ProcessInfo.processInfo.environment["SIDESEAT_PLAN_SIX_JSON"] ?? ""
        try XCTSkipUnless(!raw.isEmpty, "Provide the private six-account fixture path.")
        let data = raw.hasPrefix("{") ? Data(raw.utf8) : try Data(contentsOf: URL(fileURLWithPath: raw))
        fixture = try JSONDecoder().decode(Fixture.self, from: data)
        try require(fixture.kind == "five-roots-plans-live" && fixture.schemaVersion == 1, "Use this stage's owned plan fixture.")
        try require(fixture.baseURL == "https://api.sideseat.de", "This physical case uses the real production API.")
        try require(fixture.bundle == "app.sideseat.mobile.preview", "Use the explicit SideSeat Preview bundle.")
        try require(fixture.runID.range(of: "^[a-f0-9]{8}$", options: .regularExpression) != nil, "A valid owned run identity is required.")
        try require(Set(fixture.accounts.map(\.role)) == Set(["owner", "peer1", "peer2", "peer3", "peer4", "peer5"]), "Use all six distinct registered roles.")
        try require(Set(fixture.accounts.map(\.id)).count == 6, "The registered roles must be distinct people.")
        try require(!fixture.edgePrefix.isEmpty, "The title must remain within the factory cleanup prefix.")
    }

    override func tearDown() async throws {
        await MainActor.run { app?.terminate() }
    }

    func testCandidateDatesAndCrossDayDirectInvitationToCalendar() throws {
        try loadFixture()
        let currentMonth = try XCTUnwrap(berlin.dateInterval(of: .month, for: Date())?.start)
        let nextMonth = try XCTUnwrap(berlin.date(byAdding: .month, value: 1, to: currentMonth))
        let followingMonth = try XCTUnwrap(berlin.date(byAdding: .month, value: 1, to: nextMonth))
        let lastDay = try XCTUnwrap(berlin.date(byAdding: .day, value: -1, to: followingMonth))
        let dates = [dateKey(lastDay), dateKey(followingMonth)]
        print("PLAN_INPUT_EXPECTED_RANGE \(dates[0])T23:00 \(dates[1])T01:00 Europe/Berlin")
        fflush(stdout)

        try loginOwner()
        try openCreation()
        let title = element("time-poll-title"), place = app.textFields["unified-plan-location"]
        try reveal(title, in: form)
        try tap(title, minimumHeight: nil); title.typeText(planTitle + "\n")
        try reveal(place, in: form)
        try tap(place, minimumHeight: nil); place.typeText(location + "\n")
        try require(app.keyboards.firstMatch.waitForNonExistence(timeout: 5), "Finish entering the creation fields before choosing dates.")
        try require(!element("time-poll-grid").exists, "Creation configures candidate dates without a timetable preview.")
        try toggleDates()
        let picker = element("time-poll-dates")
        let original = try XCTUnwrap(picker.buttons.allElementsBoundByIndex.first { $0.isSelected }, "The seven default dates must contain a selected day.")
        let originalLabel = original.label
        let clear = app.buttons["time-poll-dates-clear"]
        try clearDates()
        capture("01-dates-cleared")
        phase("dates-cleared")

        let sameDay = picker.buttons[originalLabel]
        try reveal(sameDay, in: form)
        try tap(sameDay, minimumHeight: nil)
        try require(sameDay.isSelected, "A cleared date must be selectable again.")
        for _ in 0..<4 {
            sameDay.tap(withNumberOfTaps: 6, numberOfTouches: 1)
            try require(app.state == .runningForeground, "Repeated calendar taps must keep the App running.")
        }
        if !sameDay.isSelected { try tap(sameDay, minimumHeight: nil) }
        try tap(sameDay, minimumHeight: nil)
        try require(!sameDay.isSelected, "A selected date must cancel with one tap.")
        try tap(sameDay, minimumHeight: nil)
        try require(sameDay.isSelected, "The same date must reselect after cancellation.")
        try toggleDates(); try toggleDates()
        try require(picker.buttons[originalLabel].isSelected, "Collapsing and reopening must preserve the date selection.")
        capture("02-date-repeat-cancel-and-reselect")
        phase("dates-repeated")

        try clearDates()
        try nextCalendarMonth()
        let last = try calendarDay(lastDay)
        try tap(last, minimumHeight: nil)
        try require(last.isSelected, "The last day of next month must be selected.")
        try nextCalendarMonth()
        let first = try calendarDay(followingMonth)
        try tap(first, minimumHeight: nil)
        try require(first.isSelected, "The first day of the following month must be selected.")
        let previous = picker.buttons["上个月"]
        try reveal(previous, in: form); try tap(previous, minimumHeight: nil)
        try require((try calendarDay(lastDay)).isSelected, "The prior month's selected date must survive navigation.")
        try nextCalendarMonth()
        try require((try calendarDay(followingMonth)).isSelected, "The following month's selected date must survive navigation.")
        try require(clear.isEnabled && app.buttons["time-poll-create-confirm"].isEnabled, "Two valid future cross-month dates must allow creation.")
        capture("03-two-cross-month-candidate-dates")
        phase("dates-cross-month")
        try toggleDates()
        try chooseClock("00:00", controlID: "time-poll-from")
        try chooseClock("24:00", controlID: "time-poll-until")
        try require(app.buttons["time-poll-from"].value as? String == "00:00", "The candidate day must start at midnight.")
        try require(app.buttons["time-poll-until"].value as? String == "24:00", "The candidate day must cover its final half-hour.")
        try reveal(element("plan-create-timezone"), in: form)
        try require(element("plan-create-timezone").label.contains("Europe/Berlin"), "The visible App timezone must match the independent oracle.")
        try reveal(title, in: form); try reveal(place, in: form)
        try require(title.value as? String == planTitle && place.value as? String == location, "Date and hour edits must preserve the entered information.")
        try tap(app.buttons["time-poll-create-confirm"])
        try require(element("time-poll-detail-title").waitForExistence(timeout: 30), "The real creation must open the plan timetable.")
        try require(element("time-poll-detail-title").label == planTitle, "Open only this case's newly created plan.")
        try require(app.buttons["plan-people-open"].label.contains("0 人已填写"), "Creating candidate dates must not submit private availability.")
        try require(Set(app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH 'time-poll-day-'"))
            .allElementsBoundByIndex.map { String($0.identifier.dropFirst("time-poll-day-".count)) }) == Set(dates), "The created timetable must contain exactly the two selected dates.")
        capture("04-created-without-availability")
        phase("created")

        try tap(app.buttons["unified-plan-invite-window"])
        let send = app.buttons["unified-plan-send-invitations"]
        try require(send.waitForExistence(timeout: 10) && !send.isEnabled, "A final time is required before generating an invitation.")
        try require(!app.buttons["unified-plan-review-roster"].exists && !element("unified-plan-invitation-editor").exists,
            "Choosing a final time must remain on the timetable without a mandatory roster page.")
        let night = try finalCell(date: dates[0], time: "23:00–23:30")
        let midnight = try finalCell(date: dates[0], time: "23:30–00:00")
        try revealFinal(night); try revealFinal(midnight)
        try require(finalClip.contains(night.frame) && finalClip.contains(midnight.frame), "Both evening cells must be fully visible for a real drag.")
        night.press(forDuration: 0.5, thenDragTo: midnight)
        try require(night.isSelected && midnight.isSelected, "Dragging must select both evening half-hours.")
        capture("05-final-evening-drag")
        let morning = try finalCell(date: dates[1], time: "00:00–00:30")
        let end = try finalCell(date: dates[1], time: "00:30–01:00")
        try revealFinal(morning); try revealFinal(end)
        try require(finalClip.contains(morning.frame) && finalClip.contains(end.frame), "Both morning cells must be fully visible for a real drag.")
        morning.press(forDuration: 0.5, thenDragTo: end)
        try require(morning.isSelected && end.isSelected && night.isSelected && midnight.isSelected,
            "Selecting the next day must retain the previous day's final cells.")
        try assertFinalRange("23:00", "01:00")
        try tap(end)
        try require(!end.isSelected && morning.isSelected && night.isSelected, "Cancelling one cell must preserve the other final selections.")
        try assertFinalRange("23:00", "00:30")
        try tap(end)
        try assertFinalRange("23:00", "01:00")
        try tap(morning)
        try require(!morning.isSelected && end.isSelected && !send.isEnabled, "A gap across midnight must prevent an invalid invitation.")
        try require(element("time-poll-final-gap").exists, "The timetable must explain the discontinuous final selection.")
        try tap(morning)
        try assertFinalRange("23:00", "01:00")
        try require(send.isEnabled && end.isSelected && morning.isSelected && night.isSelected && midnight.isSelected,
            "Restoring the missing half-hour must restore the continuous cross-day invitation.")
        try require(send.label == "生成邀请链接", "Zero responses use the existing invitation-link branch.")
        capture("06-final-cross-day-cancel-and-reselect")
        phase("final-cross-day-selected")
        try tap(send)
        let publish = app.buttons["unified-plan-publish"]
        try require(publish.waitForExistence(timeout: 30) && publish.isEnabled, "The owner can publish without waiting for the open link's response.")
        let people = app.descendants(matching: .any).matching(NSPredicate(format: "identifier BEGINSWITH 'unified-plan-person-'"))
        try require(people.count == 1, "Only the owner is accepted; other accounts must not be invited implicitly.")
        try require(element("unified-plan-confirmation-count").label.range(of: "1\\s*/\\s*2", options: .regularExpression) != nil,
            "The existing open invitation reserves two places with only the owner confirmed.")
        capture("07-invited-owner-only-before-replies")
        phase("invited")
        try tap(publish)
        try require(element("unified-plan-publish-prompt").waitForExistence(timeout: 10), "Publish must retain the existing final confirmation.")
        try tap(app.buttons["unified-plan-publish-confirm"])
        try require(app.buttons["plan-view-calendar"].waitForExistence(timeout: 30), "Publishing must expose the owner's Calendar route.")
        capture("08-published-without-waiting")
        phase("published")
        try tap(app.buttons["plan-view-calendar"])
        try require(app.tabBars.buttons["日历"].isSelected, "The plan must open the Calendar tab.")
        try tap(app.buttons["calendar-search"], minimumHeight: 35.99)
        let query = app.searchFields.firstMatch
        try require(query.waitForExistence(timeout: 10), "Calendar search must open.")
        query.tap(); query.typeText(planTitle)
        let results = app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH 'calendar-search-result-' AND label CONTAINS %@", planTitle))
        try require(results.firstMatch.waitForExistence(timeout: 25) && results.count == 1, "Exactly one Calendar event must represent this plan.")
        try tap(results.firstMatch)
        try require(element("calendar-readonly-detail").waitForExistence(timeout: 15), "The Calendar result must open the existing event detail.")
        let calendarList = app.collectionViews.firstMatch.exists ? app.collectionViews.firstMatch : app.tables.firstMatch
        let startsAt = element("calendar-detail-start"), endsAt = element("calendar-detail-end")
        try reveal(startsAt, in: calendarList)
        try require(startsAt.label.contains("23:00"), "Calendar must retain the chosen late-night start.")
        try reveal(endsAt, in: calendarList)
        try require(endsAt.label.contains("01:00"), "Calendar must retain the chosen next-day end.")
        capture("09-cross-day-calendar-readback")
        phase("calendar-verified")
    }

    private var form: XCUIElement { app.collectionViews["plan-create-information"].firstMatch }
    private var detail: XCUIElement { app.scrollViews["time-poll-detail-scroll"] }
    private var finalScroll: XCUIElement { app.scrollViews["time-poll-final-scroll"] }
    private func element(_ id: String) -> XCUIElement { app.descendants(matching: .any).matching(identifier: id).firstMatch }
    private func loginOwner() throws {
        let owner = try XCTUnwrap(fixture.accounts.first { $0.role == "owner" })
        app = XCUIApplication(bundleIdentifier: fixture.bundle)
        app.launchArguments = ["--ui-testing-signed-out", "--ui-testing-ephemeral-credentials", "--ui-testing-skip-tutorial",
            "--ui-testing-language=zh-Hans", "--ui-testing-appearance=light", "-UIPreferredContentSizeCategoryName", "UICTContentSizeCategoryL"]
        app.launchEnvironment = [:]
        app.launch()
        let identifier = app.textFields["login-identifier"]
        try require(identifier.waitForExistence(timeout: 25), "Real authentication must show its form.")
        identifier.tap(); identifier.typeText(owner.identifier)
        let password = app.secureTextFields["login-password"]
        try require(password.exists, "The real password field must exist.")
        password.tap(); password.typeText(owner.password)
        app.buttons["login-submit"].tap()
        try require(app.tabBars.firstMatch.waitForExistence(timeout: 35), "The owned account must reach the actual App shell.")
        let springboard = XCUIApplication(bundleIdentifier: "com.apple.springboard")
        let deny = springboard.buttons.matching(NSPredicate(format: "label IN %@", ["不允许", "Don’t Allow", "Don't Allow"])).firstMatch
        if deny.waitForExistence(timeout: 1) { deny.tap() }
    }
    private func openCreation() throws {
        try tap(app.tabBars.buttons["计划"])
        let waiting = app.buttons["plans-tab-waitingResponse"]
        try tap(waiting)
        let create = app.buttons.matching(NSPredicate(format: "identifier IN %@", ["plans-create-primary", "plans-create-unified"])).firstMatch
        let root = app.scrollViews["plans-scroll-waitingResponse"].firstMatch
        if root.exists { try reveal(create, in: root) }
        try tap(create)
        try require(form.waitForExistence(timeout: 10), "Open the current plan creation form.")
    }
    private func toggleDates() throws {
        let expanded = element("time-poll-dates").exists
        let option = app.buttons["plan-date-options"]
        try reveal(option, in: form); try tap(option)
        try require(expanded ? element("time-poll-dates").waitForNonExistence(timeout: 5)
                    : element("time-poll-dates").waitForExistence(timeout: 5), "Candidate dates must toggle in place.")
    }
    private func clearDates() throws {
        let clear = app.buttons["time-poll-dates-clear"]
        try reveal(clear, in: form)
        try require(abs(clear.frame.midX - app.windows.firstMatch.frame.midX) <= 1, "Clear dates belongs below the calendar center.")
        try tap(clear)
        try require(!clear.isEnabled && !app.buttons["time-poll-create-confirm"].isEnabled, "Clearing all candidates must disable creation.")
        try require(element("time-poll-dates").buttons.matching(NSPredicate(format: "isSelected == true")).count == 0, "The calendar must show no selected date after clearing.")
    }
    private func nextCalendarMonth() throws {
        let next = element("time-poll-dates").buttons["下个月"]
        try reveal(next, in: form); try tap(next, minimumHeight: nil)
    }
    private func calendarDay(_ date: Date) throws -> XCUIElement {
        let month = berlin.component(.month, from: date), day = berlin.component(.day, from: date)
        let result = element("time-poll-dates").buttons.matching(NSPredicate(format: "label BEGINSWITH %@", "\(month)月\(day)日")).firstMatch
        try require(result.waitForExistence(timeout: 5), "The requested future calendar day must be visible in its actual month.")
        try reveal(result, in: form)
        return result
    }
    private func chooseClock(_ value: String, controlID: String) throws {
        let control = app.buttons[controlID]
        try reveal(control, in: form); try tap(control)
        let menu = app.collectionViews.matching(NSPredicate(format: "identifier != %@", "plan-create-information")).firstMatch
        try require(menu.waitForExistence(timeout: 5), "The actual native hour menu must open.")
        let option = menu.buttons[value].firstMatch
        for _ in 0..<18 {
            let bounds = menu.frame.intersection(app.windows.firstMatch.frame).insetBy(dx: 0, dy: 8)
            if option.exists && option.isHittable && bounds.contains(option.frame) { break }
            let target = option.exists ? option.frame : .zero
            let firstVisible = menu.buttons.allElementsBoundByIndex.first { $0.isHittable && bounds.contains($0.frame) }
            let earlier = !target.isEmpty ? target.midY < bounds.midY : minute(value) < minute(firstVisible?.label ?? "00:00")
            if earlier { menu.swipeDown(velocity: .slow) } else { menu.swipeUp(velocity: .slow) }
        }
        let bounds = menu.frame.intersection(app.windows.firstMatch.frame).insetBy(dx: 0, dy: 8)
        try require(option.exists && option.isHittable && bounds.contains(option.frame), "The exact hour row must be completely visible before selecting it.")
        option.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)).tap()
        try require(menu.waitForNonExistence(timeout: 5) && control.value as? String == value, "The selected daily hour must match the actual row.")
    }
    private func minute(_ value: String) -> Int {
        let parts = value.split(separator: ":").compactMap { Int($0) }
        return parts.count == 2 ? parts[0] * 60 + parts[1] : 0
    }
    private func finalCell(date: String, time: String) throws -> XCUIElement {
        let cell = app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH 'time-poll-cell-' AND label BEGINSWITH %@ AND label CONTAINS %@", date, time)).firstMatch
        try require(cell.waitForExistence(timeout: 10), "The full-day timetable must contain the requested date and half-hour.")
        return cell
    }
    private var finalDockTop: CGFloat {
        ["time-poll-final-summary", "time-poll-final-gap", "time-poll-final-heading", "unified-plan-invitation-summary", "unified-plan-send-invitations"]
            .compactMap { id -> CGFloat? in let value = element(id); return value.exists && !value.frame.isEmpty ? value.frame.minY : nil }.min()
            ?? app.windows.firstMatch.frame.maxY
    }
    private var finalClip: CGRect {
        let window = app.windows.firstMatch.frame
        let top = max(finalScroll.frame.minY, app.navigationBars.firstMatch.frame.maxY + 2)
        return finalScroll.frame.intersection(detail.frame).intersection(window)
            .intersection(CGRect(x: window.minX, y: top, width: window.width, height: max(0, finalDockTop - 12 - top)))
    }
    private func revealFinal(_ cell: XCUIElement) throws {
        try require(finalScroll.waitForExistence(timeout: 10) && detail.exists, "Both timetable scroll surfaces must exist.")
        for _ in 0..<30 {
            let clip = finalClip
            if !clip.isNull && cell.isHittable && clip.contains(cell.frame) { return }
            if clip.isNull || clip.height < cell.frame.height * 2 {
                let origin = app.coordinate(withNormalizedOffset: .zero)
                let top = app.navigationBars.firstMatch.frame.maxY + 20
                let y = min(finalDockTop - 24, top + 150)
                let down = finalScroll.frame.minY < top
                origin.withOffset(CGVector(dx: 8, dy: down ? top : y)).press(forDuration: 0.05,
                    thenDragTo: origin.withOffset(CGVector(dx: 8, dy: down ? y : top)), withVelocity: .slow, thenHoldForDuration: 0.1)
            } else if cell.frame.minY < clip.minY { finalScroll.swipeDown(velocity: .slow) }
            else { finalScroll.swipeUp(velocity: .slow) }
        }
        try require(cell.isHittable && !finalClip.isNull && finalClip.contains(cell.frame), "The entire final cell must be visible above the fixed footer.")
    }
    private func assertFinalRange(_ start: String, _ end: String) throws {
        let summary = element("time-poll-final-summary")
        try require(summary.exists && summary.label.contains(start) && summary.label.contains(end), "The final summary must show the exact continuous cross-day range.")
    }
    private func reveal(_ target: XCUIElement, in scroll: XCUIElement) throws {
        try require(scroll.waitForExistence(timeout: 10), "The intended scrolling surface must exist.")
        for _ in 0..<10 where !target.exists { scroll.swipeUp(velocity: .slow) }
        try require(target.exists, "The intended control must exist before scrolling to it.")
        for _ in 0..<24 {
            let window = app.windows.firstMatch.frame
            let calendarDetail = element("calendar-readonly-detail").exists
            let footer = app.buttons["time-poll-create-confirm"]
            let bottom = footer.exists ? footer.frame.minY - 8
                : calendarDetail ? window.maxY : min(window.maxY, app.tabBars.firstMatch.exists ? app.tabBars.firstMatch.frame.minY : window.maxY)
            let top = max(scroll.frame.minY, app.navigationBars.firstMatch.frame.maxY + 2)
            let clip = scroll.frame.intersection(CGRect(x: window.minX, y: top, width: window.width, height: max(0, bottom - top)))
            if target.isHittable && clip.insetBy(dx: -0.5, dy: -0.5).contains(target.frame) { return }
            if target.frame.minY < top { scroll.swipeDown(velocity: .slow) }
            else { scroll.swipeUp(velocity: .slow) }
        }
        try require(false, "The complete control must be reachable in its current page.")
    }
    private func tap(_ control: XCUIElement, minimumHeight: CGFloat? = 43.99) throws {
        try require(control.waitForExistence(timeout: 15) && control.isHittable && control.isEnabled, "The intended UI action must be enabled and reachable.")
        try require(app.windows.firstMatch.frame.insetBy(dx: -0.5, dy: -0.5).contains(control.frame), "The full action must be inside the actual window.")
        if let minimumHeight { try require(control.frame.height >= minimumHeight, "The action must retain its minimum touch height.") }
        control.coordinate(withNormalizedOffset: CGVector(dx: 0.2, dy: 0.5)).tap()
    }
    private func dateKey(_ date: Date) -> String {
        let value = berlin.dateComponents([.year, .month, .day], from: date)
        return String(format: "%04d-%02d-%02d", value.year!, value.month!, value.day!)
    }
    private func require(_ condition: Bool, _ message: String) throws {
        guard condition else {
            XCTFail(message)
            throw NSError(domain: "FiveRootPlanInputPhone", code: 1, userInfo: [NSLocalizedDescriptionKey: message])
        }
    }
    private func phase(_ value: String) {
        print("PLAN_INPUT_PHASE \(value)")
        fflush(stdout)
        RunLoop.current.run(until: Date().addingTimeInterval(3))
    }
    private func capture(_ name: String) {
        XCTAssertFalse(app.secureTextFields["login-password"].exists, "Screenshots must not include authentication.")
        let attachment = XCTAttachment(screenshot: app.screenshot())
        attachment.name = "five-root-plan-input-" + name
        attachment.lifetime = .keepAlways
        add(attachment)
    }
}
