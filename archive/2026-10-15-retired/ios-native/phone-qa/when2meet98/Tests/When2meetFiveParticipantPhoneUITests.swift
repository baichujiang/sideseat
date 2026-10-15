import XCTest

/// Operates the already installed Preview 98, using its unchanged provider page.
@MainActor
final class When2meetFiveParticipantPhoneUITests: XCTestCase {
    private let app = XCUIApplication(bundleIdentifier: "app.sideseat.mobile.preview")
    private var firstDate = ""

    override func setUpWithError() throws {
        continueAfterFailure = false
        executionTimeAllowance = 900
        try XCTSkipUnless(ProcessInfo.processInfo.environment["SIDESEAT_WHEN2MEET_PHONE_QA"] == "1", "Explicitly enable the physical-device live provider test.")
    }

    func testFiveParticipantsCommonMaximumAndServerReload() throws {
        app.launchArguments = ["--ui-testing-authenticated", "--ui-testing-chats", "--ui-testing-skip-tutorial", "--ui-testing-ephemeral-credentials", "--ui-testing-when2meet-live", "--ui-testing-language=en"]
        app.launch()
        openPollSheet()
        dismissConsent()
        let stamp = Int(Date().timeIntervalSince1970)
        let title = "SS98 QA \(stamp)"
        let names = ["A", "B", "C", "D", "E"].map { "SS98-\(stamp)-\($0)" }
        let name = web.textFields["New Event Name"]
        XCTAssertTrue(name.waitForExistence(timeout: 25)); name.tap(); name.typeText(title)
        dismissKeyboard()
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "Europe/Berlin")!
        let formatter = DateFormatter(); formatter.timeZone = calendar.timeZone; formatter.dateFormat = "yyyy-MM-dd"
        firstDate = formatter.string(from: calendar.date(byAdding: .day, value: 2, to: Date())!)
        let date = web.switches[firstDate]
        XCTAssertTrue(date.waitForExistence(timeout: 8)); date.tap()
        let create = web.buttons["Create Event"]
        scrollTo(create); XCTAssertTrue(create.isHittable); create.tap()
        XCTAssertTrue(web.textFields["Your name"].waitForExistence(timeout: 25))

        // All five share 09:00–10:00. Each also has a different one-hour alternative.
        // A 11–12, B 12–13, C 13–14, D 14–15, E 10–11, Europe/Berlin.
        let alternateStarts = [8, 12, 16, 20, 4]
        for index in names.indices {
            if index > 0 { reopenRecent() }
            signIn(names[index])
            paint(0...3)
            waitFacts { ($0["own"] as? Int) == 4 && ($0["saveRequests"] as? Int) == 1 }
            paint(alternateStarts[index]...(alternateStarts[index] + 3))
            waitFacts { ($0["own"] as? Int) == 8 && ($0["participants"] as? Int) == index + 1 && ($0["saveRequests"] as? Int) == 2 }
            saveEvidence("participant-\(index + 1)-saved", participant: names[index])
        }
        waitFacts { ($0["maximum"] as? Int) == 5 && ($0["participants"] as? Int) == 5 }
        assertGroup(commonCount: 5)
        showGroupAndAttach("five-common-0900-1000")

        // E erases its shared hour but retains 10–11, so all five remain respondents.
        paint(0...3)
        waitFacts { ($0["own"] as? Int) == 4 && ($0["maximum"] as? Int) == 4 && ($0["participants"] as? Int) == 5 && ($0["saveRequests"] as? Int) == 3 }
        assertGroup(commonCount: 4)
        saveEvidence("no-common-best-four", participant: names[4])
        showGroupAndAttach("five-no-common-best-four-0900-1000")

        // Destroy the app/WebView and reload each identity from the provider server.
        app.buttons["when2meet-close"].tap()
        app.terminate(); app.launch(); openPollSheet()
        for index in names.indices {
            reopenRecent(); signIn(names[index])
            let expectedOwn = index == 4 ? 4 : 8
            waitFacts { ($0["own"] as? Int) == expectedOwn && ($0["maximum"] as? Int) == 4 && ($0["participants"] as? Int) == 5 && ($0["saveRequests"] as? Int) == 0 }
            assertGroup(commonCount: 4)
            assertOwn(alternateStart: alternateStarts[index], hasCommon: index != 4)
            saveEvidence("server-reload-\(index + 1)", participant: names[index])
        }
        showGroupAndAttach("five-server-reload-confirmed")
        app.buttons["when2meet-close"].tap()
        app.terminate()
    }

    private var web: XCUIElement { app.webViews.firstMatch }
    private var own: XCUIElementQuery {
        web.switches.matching(NSPredicate(format: "label BEGINSWITH %@", "My availability: " + firstDate))
    }
    private var group: XCUIElementQuery {
        web.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", "Group availability: "))
    }

    private func openPollSheet() {
        let entry = app.buttons["inbox-when2meet"]
        XCTAssertTrue(entry.waitForExistence(timeout: 15)); entry.tap()
        XCTAssertTrue(web.waitForExistence(timeout: 15))
    }

    private func signIn(_ name: String) {
        dismissConsent()
        let input = web.textFields["Your name"]
        XCTAssertTrue(input.waitForExistence(timeout: 25)); input.tap(); input.typeText(name)
        dismissKeyboard()
        let button = web.buttons["Sign In"]; scrollTo(button); button.tap()
        XCTAssertTrue(own.firstMatch.waitForExistence(timeout: 20))
        XCTAssertEqual(own.count, 32)
    }

    private func paint(_ range: ClosedRange<Int>) {
        let start = own.element(boundBy: range.lowerBound), end = own.element(boundBy: range.upperBound)
        scrollTo(end); XCTAssertTrue(start.isHittable); XCTAssertTrue(end.isHittable)
        start.press(forDuration: 0.2, thenDragTo: end)
        let saved = NSPredicate { _, _ in self.app.staticTexts["when2meet-live-save"].label == "200" }
        XCTAssertEqual(XCTWaiter.wait(for: [XCTNSPredicateExpectation(predicate: saved, object: app)], timeout: 20), .completed)
    }

    private func reopenRecent() {
        app.buttons["when2meet-actions"].tap()
        let recent = app.buttons["when2meet-recent"]
        XCTAssertTrue(recent.waitForExistence(timeout: 8)); recent.tap()
        XCTAssertTrue(web.textFields["Your name"].waitForExistence(timeout: 25))
    }

    private func facts() -> [String: Any] {
        let value = app.staticTexts["when2meet-live-facts"].label
        guard let data = value.data(using: .utf8), let parsed = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return [:] }
        return parsed
    }

    private func waitFacts(_ check: @escaping ([String: Any]) -> Bool) {
        let predicate = NSPredicate { _, _ in check(self.facts()) }
        XCTAssertEqual(XCTWaiter.wait(for: [XCTNSPredicateExpectation(predicate: predicate, object: app)], timeout: 20), .completed, app.staticTexts["when2meet-live-facts"].label)
    }

    private func groupCounts() -> [(time: Int, count: Int)] {
        group.allElementsBoundByIndex.compactMap { element in
            let parts = element.label.replacingOccurrences(of: "Group availability: ", with: "").split(separator: ",")
            guard parts.count == 2, let time = Int(parts[0]), let count = Int(parts[1].trimmingCharacters(in: .whitespaces)) else { return nil }
            return (time, count)
        }.sorted { $0.time < $1.time }
    }

    private func assertGroup(commonCount: Int) {
        let counts = groupCounts()
        XCTAssertEqual(counts.count, 32)
        let formatter = DateFormatter(); formatter.timeZone = TimeZone(identifier: "Europe/Berlin"); formatter.dateFormat = "yyyy-MM-dd HH:mm"
        XCTAssertEqual(counts.first.map { formatter.string(from: Date(timeIntervalSince1970: TimeInterval($0.time))) }, firstDate + " 09:00")
        for (index, slot) in counts.enumerated() {
            XCTAssertEqual(slot.count, index < 4 ? commonCount : (index < 24 ? 1 : 0), "Unexpected attendance in quarter-hour \(index).")
        }
        XCTAssertEqual(counts.filter { $0.count == 5 }.count, commonCount == 5 ? 4 : 0)
        XCTAssertEqual(counts.map(\.count).max(), commonCount)
    }

    private func assertOwn(alternateStart: Int, hasCommon: Bool) {
        for (index, cell) in own.allElementsBoundByIndex.enumerated() {
            let selected = (index < 4 && hasCommon) || (alternateStart..<(alternateStart + 4)).contains(index)
            XCTAssertEqual(cell.value as? String, selected ? "1" : "0", "Stored selection differs in quarter-hour \(index).")
        }
    }

    private func saveEvidence(_ phase: String, participant: String) {
        let counts = groupCounts().map { ["time": $0.time, "count": $0.count] }
        let report: [String: Any] = ["phase": phase, "participant": participant, "date": firstDate, "timezone": "Europe/Berlin", "facts": facts(), "slots": counts]
        let data = try! JSONSerialization.data(withJSONObject: report, options: [.sortedKeys, .prettyPrinted])
        let attachment = XCTAttachment(data: data, uniformTypeIdentifier: "public.json")
        attachment.name = "phone98-" + phase; attachment.lifetime = .keepAlways; add(attachment)
        print("PHONE98_CHECK \(phase) \(String(data: try! JSONSerialization.data(withJSONObject: facts(), options: .sortedKeys), encoding: .utf8)!)")
    }

    private func showGroupAndAttach(_ name: String) {
        scrollTo(group.firstMatch)
        let attachment = XCTAttachment(screenshot: app.screenshot()); attachment.name = "phone98-" + name; attachment.lifetime = .keepAlways; add(attachment)
    }

    private func scrollTo(_ element: XCUIElement) {
        for _ in 0..<8 where !element.isHittable {
            // Scroll in the page margin, outside the original paintable time grid.
            let upper = web.coordinate(withNormalizedOffset: CGVector(dx: 0.94, dy: 0.25))
            let lower = web.coordinate(withNormalizedOffset: CGVector(dx: 0.94, dy: 0.78))
            let above = element.frame.midY < web.frame.midY
            (above ? upper : lower).press(forDuration: 0.05, thenDragTo: above ? lower : upper)
        }
        XCTAssertTrue(element.isHittable)
    }

    private func dismissKeyboard() {
        let done = app.buttons.matching(NSPredicate(format: "label IN %@", ["Done", "完成", "Fertig"])).firstMatch
        if done.exists { done.tap() }
    }

    private func dismissConsent() {
        let reject = app.buttons.matching(NSPredicate(format: "label IN %@", ["Reject all", "全部拒绝", "Alle ablehnen"])).firstMatch
        if reject.waitForExistence(timeout: 2) { reject.tap(); return }
        let manage = app.buttons.matching(NSPredicate(format: "label IN %@", ["Manage options", "管理选项", "Optionen verwalten"])).firstMatch
        if manage.waitForExistence(timeout: 3) {
            manage.tap()
            if reject.waitForExistence(timeout: 3) { reject.tap(); return }
        }
        let confirm = app.buttons.matching(NSPredicate(format: "label IN %@", ["Confirm choices", "Confirm my choices", "确认已选择完毕", "Auswahl bestätigen"])).firstMatch
        if confirm.waitForExistence(timeout: 3) { confirm.tap() }
    }
}
