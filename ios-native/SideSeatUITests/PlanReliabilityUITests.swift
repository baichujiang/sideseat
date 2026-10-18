import XCTest

/// Opt-in real API journeys using disposable accounts supplied by the Mac runner.
@MainActor final class PlanReliabilityUITests: XCTestCase {
    private struct Fixture: Decodable { let api: String; let owner: String; let peer: String; let bundle: String?; let peerIdentifier: String; let peerPassword: String }
    private var fixture: Fixture!
    private var app: XCUIApplication!
    private var tokens: [String] = []

    override func setUpWithError() throws {
        continueAfterFailure = false
        let raw = ProcessInfo.processInfo.environment["SIDESEAT_PLAN_RELIABILITY_QA_JSON"]
        try XCTSkipIf(raw == nil || raw!.isEmpty, "Requires explicitly supplied disposable QA credentials.")
        fixture = try JSONDecoder().decode(Fixture.self, from: Data(raw!.utf8))
        app = XCUIApplication(bundleIdentifier: fixture.bundle ?? "app.sideseat.mobile")
    }

    override func tearDown() async throws {
        await MainActor.run { cleanup() }
    }

    private func cleanup() {
        for token in tokens {
            if let poll = try? get(token), let phase = poll["phase"] as? String,
               ["CONFIRMED", "INVITING"].contains(phase), let version = poll["invitationVersion"] {
                _ = try? call("/api/v1/time-polls/\(token)/cancel", auth: fixture.owner, method: "POST", body: ["version": version])
            }
            _ = try? call("/api/v1/time-polls/\(token)", auth: fixture.owner, method: "DELETE")
        }
        app?.terminate()
    }

    func testRealInvitationNotificationConfirmCalendarAndCancellation() throws {
        let title = "Plan reliability \(UUID().uuidString.prefix(8))"
        var poll = try create(title: title)
        let token = try XCTUnwrap(poll["token"] as? String)
        for (auth, name) in [(fixture.owner, "Host"), (fixture.peer, "Friend")] {
            poll = try call("/api/v1/time-polls/\(token)/response", auth: auth, method: "PUT", body: ["displayName": name, "slotIds": [0, 1, 2, 3]])
        }
        let slots = try XCTUnwrap(poll["slots"] as? [[String: Any]])
        let people = try XCTUnwrap(poll["participants"] as? [[String: Any]])
        _ = try call("/api/v1/time-polls/\(token)/invitations", auth: fixture.owner, method: "POST", body: ["version": 0, "start": slots[0]["start"]!, "end": slots[3]["end"]!, "attendeeIds": people.compactMap { $0["id"] as? String }])
        launch(auth: fixture.peer, path: "/inbox/notifications")
        let notice = app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH 'notification-' AND label CONTAINS %@", title)).firstMatch
        XCTAssertTrue(notice.waitForExistence(timeout: 20)); capture("real-invitation-notification"); notice.tap()
        let accept = app.buttons["unified-plan-accept"]
        XCTAssertTrue(accept.waitForExistence(timeout: 15)); accept.tap()
        XCTAssertTrue(app.staticTexts["unified-plan-phase"].waitForExistence(timeout: 15))
        XCTAssertTrue(XCTWaiter.wait(for: [XCTNSPredicateExpectation(predicate: NSPredicate(format: "label == 'Confirmed'"), object: app.staticTexts["unified-plan-phase"])], timeout: 15) == .completed)
        capture("confirmed-from-notification")
        let peerRows = try calendarRows(token, auth: fixture.peer)
        XCTAssertEqual(peerRows.count, 1); XCTAssertEqual(try calendarRows(token, auth: fixture.owner).count, 1)
        launch(auth: fixture.peer, path: "/calendar", realPeerLogin: true)
        let searchButton = app.buttons["calendar-search"]
        XCTAssertTrue(searchButton.waitForExistence(timeout: 15)); searchButton.tap()
        let search = app.searchFields.firstMatch
        XCTAssertTrue(search.waitForExistence(timeout: 10)); search.tap(); search.typeText(title)
        let eventID = try XCTUnwrap(peerRows.first?["id"] as? String)
        let result = app.buttons["calendar-search-result-\(eventID)"]
        XCTAssertTrue(result.waitForExistence(timeout: 20)); result.tap()
        let manage = app.buttons["calendar-manage-plan"]
        for _ in 0..<4 where !manage.isHittable { app.swipeUp() }
        XCTAssertTrue(manage.waitForExistence(timeout: 10)); capture("readonly-calendar"); manage.tap()
        XCTAssertTrue(app.staticTexts["unified-plan-phase"].waitForExistence(timeout: 15))
        launch(auth: fixture.owner, path: "/time-polls/\(token)")
        app.buttons["time-poll-menu"].tap()
        let cancel = app.buttons["unified-plan-cancel"]
        XCTAssertTrue(cancel.waitForExistence(timeout: 15)); cancel.tap()
        let confirm = app.buttons.matching(NSPredicate(format: "label == 'Cancel plan' AND identifier != 'unified-plan-cancel'")).firstMatch
        XCTAssertTrue(confirm.waitForExistence(timeout: 5)); confirm.tap()
        XCTAssertTrue(XCTWaiter.wait(for: [XCTNSPredicateExpectation(predicate: NSPredicate(format: "label == 'Cancelled'"), object: app.staticTexts["unified-plan-phase"])], timeout: 15) == .completed)
        XCTAssertEqual(try calendarRows(token, auth: fixture.peer).count, 0)
        XCTAssertEqual(try calendarRows(token, auth: fixture.owner).count, 0)
        capture("cancelled-calendars-cleared")
    }

    func testOpenInvitationExpiresAndReturnsToEndedPlans() throws {
        let poll = try create(title: "Expiry boundary \(UUID().uuidString.prefix(6))", fixedStart: Date().addingTimeInterval(35), count: 3)
        let token = try XCTUnwrap(poll["token"] as? String)
        _ = try call("/api/v1/time-polls/\(token)/invitation-response", auth: fixture.peer, method: "PUT", body: ["version": 1, "status": "ACCEPTED"])
        launch(auth: fixture.peer, path: "/time-polls/\(token)")
        XCTAssertTrue(app.buttons["plan-done-back"].waitForExistence(timeout: 15))
        XCTAssertEqual(try get(token)["phase"] as? String, "INVITING")
        XCTAssertTrue(app.buttons["unified-plan-expired-back"].waitForExistence(timeout: 45))
        XCTAssertFalse(app.buttons["unified-plan-accept"].exists)
        XCTAssertFalse(app.buttons["time-poll-finish"].exists)
        capture("deadline-closes-open-invitation")
        app.buttons["unified-plan-expired-back"].tap()
        XCTAssertTrue(app.buttons["plans-create-primary"].waitForExistence(timeout: 10))
        app.segmentedControls["plans-segmented-control"].buttons["Past"].tap()
        XCTAssertTrue(app.buttons["plans-coordinated-\(token)"].waitForExistence(timeout: 10))
        XCTAssertEqual(try get(token)["phase"] as? String, "EXPIRED")
        XCTAssertEqual(try calendarRows(token, auth: fixture.peer).count, 0)
        capture("expired-in-ended-list")
    }

    func testExpiredCollectionIsReadonlyInChineseDarkMode() throws {
        let poll = try create(title: "已过期的时间征集", past: true)
        let token = try XCTUnwrap(poll["token"] as? String)
        launch(auth: fixture.owner, path: "/time-polls/\(token)", chinese: true)
        XCTAssertTrue(app.buttons["unified-plan-expired-back"].waitForExistence(timeout: 15))
        XCTAssertFalse(app.textFields["time-poll-name"].exists)
        XCTAssertFalse(app.buttons["time-poll-cell-0"].exists)
        XCTAssertFalse(app.buttons["unified-plan-invite-window"].exists)
        capture("expired-collection-chinese-dark")
    }

    func testAvailabilityAutosaveUndoDoneAndReopen() throws {
        let poll = try create(title: "Availability round trip \(UUID().uuidString.prefix(6))")
        let token = try XCTUnwrap(poll["token"] as? String)
        let date = try XCTUnwrap((poll["dates"] as? [String])?.first)
        launch(auth: fixture.owner, path: "/time-polls/\(token)")
        let cell = app.buttons["time-poll-cell-0"]
        XCTAssertTrue(cell.waitForExistence(timeout: 15)); cell.tap()
        XCTAssertTrue(app.staticTexts["time-poll-saved"].waitForExistence(timeout: 15))
        XCTAssertEqual(try get(token)["mySlotIds"] as? [Int], [0, 1])
        app.buttons["time-poll-day-\(date)"].tap()
        let undo = app.buttons["time-poll-undo"]
        XCTAssertTrue(undo.waitForExistence(timeout: 10)); undo.tap()
        XCTAssertTrue(app.staticTexts["time-poll-saved"].waitForExistence(timeout: 15))
        app.buttons["time-poll-finish"].tap()
        XCTAssertTrue(app.buttons["plan-edit-availability"].waitForExistence(timeout: 10))
        XCTAssertEqual(try get(token)["phase"] as? String, "COLLECTING")
        XCTAssertEqual(try get(token)["mySlotIds"] as? [Int], [0, 1])
        capture("availability-done-after-undo")
        app.navigationBars.buttons.element(boundBy: 0).tap()
        let card = app.buttons["plans-coordinated-\(token)"]
        XCTAssertTrue(card.waitForExistence(timeout: 10)); card.tap()
        XCTAssertTrue(app.staticTexts["time-poll-result-heading"].waitForExistence(timeout: 15))
        app.buttons["plan-edit-availability"].tap()
        XCTAssertTrue(app.staticTexts["time-poll-saved"].waitForExistence(timeout: 10))
        XCTAssertEqual(try get(token)["mySlotIds"] as? [Int], [0, 1])
        capture("saved-availability-reopened")
    }

    func testGuidedCreationExplainsSharingAndPersistsMyTime() throws {
        let title = "Guided plan \(UUID().uuidString.prefix(6))"
        launch(auth: fixture.owner, path: "/plans")
        let newPlan = app.buttons["plans-create-primary"]
        XCTAssertTrue(newPlan.waitForExistence(timeout: 20)); capture("hub-first-use"); newPlan.tap()
        XCTAssertTrue(app.buttons["plan-mode-collect"].waitForExistence(timeout: 10))
        XCTAssertTrue(app.buttons["plan-mode-fixed"].exists); capture("creation-choice"); app.buttons["plan-mode-collect"].tap()
        let titleField = app.textFields["time-poll-title"]
        XCTAssertTrue(titleField.waitForExistence(timeout: 10)); titleField.tap(); titleField.typeText(title + "\n")
        app.buttons["plan-create-next"].tap()
        let createButton = app.buttons["time-poll-create-confirm"]
        XCTAssertTrue(createButton.isEnabled); capture("creation-details"); createButton.tap()
        XCTAssertTrue(app.buttons["time-poll-cell-0"].waitForExistence(timeout: 20))
        let list = try call("/api/v1/time-polls", auth: fixture.owner)
        let record = try XCTUnwrap((list["polls"] as? [[String: Any]])?.first { $0["title"] as? String == title })
        let token = try XCTUnwrap(record["token"] as? String); tokens.append(token)
        XCTAssertFalse(app.buttons["plan-share-primary"].exists)
        app.buttons["time-poll-cell-0"].tap()
        XCTAssertTrue(app.staticTexts["time-poll-saved"].waitForExistence(timeout: 15))
        capture("choose-my-time")
        app.buttons["time-poll-finish"].tap()
        XCTAssertTrue(app.staticTexts["time-poll-result-heading"].waitForExistence(timeout: 10))
        XCTAssertTrue(app.buttons["plan-share-primary"].isHittable)
        app.buttons["plan-copy-link"].tap()
        XCTAssertEqual(app.buttons["plan-copy-link"].label, "Link copied")
        XCTAssertEqual(try get(token)["phase"] as? String, "COLLECTING")
        capture("saved-next-share")
        app.navigationBars.buttons.element(boundBy: 0).tap()
        let card = app.buttons["plans-coordinated-\(token)"]
        for _ in 0..<3 where !card.isHittable { app.swipeUp() }
        XCTAssertTrue(card.waitForExistence(timeout: 10))
        XCTAssertTrue(card.label.contains("Share with friends"))
        capture("hub-next-action-share")
    }

    func testRoleGuidanceFromTimetableToInvitationAndCalendar() throws {
        var poll = try create(title: "Clear next step \(UUID().uuidString.prefix(6))")
        let token = try XCTUnwrap(poll["token"] as? String)
        for (auth, name) in [(fixture.owner, "Ming"), (fixture.peer, "Lin")] {
            poll = try call("/api/v1/time-polls/\(token)/response", auth: auth, method: "PUT", body: ["displayName": name, "slotIds": [0, 1, 2, 3]])
        }
        launch(auth: fixture.owner, path: "/plans")
        let card = app.buttons["plans-coordinated-\(token)"]
        XCTAssertTrue(card.waitForExistence(timeout: 20)); XCTAssertTrue(card.label.contains("View timetable and choose")); capture("hub-owner-choose")
        card.tap()
        XCTAssertTrue(app.staticTexts["time-poll-result-heading"].waitForExistence(timeout: 10))
        let invite = app.buttons["unified-plan-invite-window"]
        XCTAssertTrue(invite.isHittable); capture("owner-next-invite"); invite.tap()
        let send = app.buttons["unified-plan-send-invitations"]
        XCTAssertTrue(send.waitForExistence(timeout: 10)); XCTAssertTrue(send.isHittable); capture("review-invitation"); send.tap()
        XCTAssertTrue(app.buttons["plan-share-primary"].waitForExistence(timeout: 15)); capture("owner-share-invitation")
        launch(auth: fixture.peer, path: "/plans")
        let invited = app.buttons["plans-coordinated-\(token)"]
        XCTAssertTrue(invited.waitForExistence(timeout: 15)); XCTAssertTrue(invited.label.contains("View and confirm")); capture("hub-invitee-confirm"); invited.tap()
        let accept = app.buttons["unified-plan-accept"]
        XCTAssertTrue(accept.waitForExistence(timeout: 10)); XCTAssertTrue(accept.isHittable); capture("invitee-confirm"); accept.tap()
        let calendar = app.buttons["plan-view-calendar"]
        XCTAssertTrue(calendar.waitForExistence(timeout: 15)); capture("confirmed-calendar-next")
        XCTAssertEqual(try calendarRows(token, auth: fixture.owner).count, 1)
        XCTAssertEqual(try calendarRows(token, auth: fixture.peer).count, 1)
        calendar.tap()
        XCTAssertTrue(app.tabBars.buttons["Calendar"].isSelected)
    }

    func testChineseDarkGuidanceAndAccessibleCreation() throws {
        launch(auth: fixture.owner, path: "/plans", chinese: true)
        XCTAssertTrue(app.buttons["plans-create-primary"].waitForExistence(timeout: 15)); capture("hub-chinese-dark")
        app.buttons["plans-create-primary"].tap()
        XCTAssertTrue(app.buttons["plan-mode-collect"].waitForExistence(timeout: 10)); capture("choice-chinese-dark")
        app.terminate()
        app.launchArguments.append("--ui-testing-dynamic-type-accessibility")
        app.launch()
        app.buttons["plans-create-unified"].tap()
        let choice = app.buttons["plan-mode-collect"]
        XCTAssertTrue(choice.waitForExistence(timeout: 10)); XCTAssertGreaterThanOrEqual(choice.frame.height, 44); capture("choice-accessibility5"); choice.tap()
        let titleField = app.textFields["time-poll-title"]
        for _ in 0..<4 where !titleField.isHittable { app.swipeDown() }
        XCTAssertTrue(titleField.waitForExistence(timeout: 10)); titleField.tap(); titleField.typeText("Large text plan\n")
        app.buttons["plan-create-next"].tap()
        let createButton = app.buttons["time-poll-create-confirm"]
        XCTAssertTrue(createButton.isHittable)
        XCTAssertLessThanOrEqual(createButton.frame.maxX, app.frame.maxX + 1)
        XCTAssertGreaterThan(createButton.frame.height, 43)
        capture("creation-accessibility5")
    }

    private func launch(auth: String, path: String, chinese: Bool = false, realPeerLogin: Bool = false) {
        app.terminate()
        app.launchArguments = ["--ui-testing-authenticated", "--ui-testing-ephemeral-credentials", "--ui-testing-skip-tutorial", "--ui-testing-time-poll-live", "--ui-testing-notifications-live", "--ui-testing-deep-link=\(path)", "--ui-testing-language=\(chinese ? "zh-Hans" : "en")", "--ui-testing-appearance=\(chinese ? "dark" : "light")"]
        app.launchEnvironment["SIDESEAT_QA_ACCESS_TOKEN"] = auth
        if fixture.api.hasPrefix("http://127.0.0.1") {
            app.launchArguments.append("--ui-testing-local-api")
            app.launchEnvironment["SIDESEAT_API_BASE_URL_OVERRIDE"] = fixture.api
        }
        if realPeerLogin {
            app.launchArguments.removeAll { $0 == "--ui-testing-authenticated" || $0.hasPrefix("--ui-testing-deep-link=") }
            app.launchArguments.append("--ui-testing-signed-out")
        }
        app.launch()
        if realPeerLogin {
            let identifier = app.textFields["login-identifier"]
            XCTAssertTrue(identifier.waitForExistence(timeout: 15)); identifier.tap(); identifier.typeText(fixture.peerIdentifier)
            let password = app.secureTextFields["login-password"]; password.tap(); password.typeText(fixture.peerPassword)
            app.buttons["login-submit"].tap()
            XCTAssertTrue(app.tabBars.firstMatch.waitForExistence(timeout: 25))
            app.tabBars.buttons["Calendar"].tap()
        }
    }
    private func create(title: String, fixedStart: Date? = nil, past: Bool = false, count: Int = 2) throws -> [String: Any] {
        let date = ISO8601DateFormatter().string(from: Date().addingTimeInterval(past ? -2 * 86400 : 2 * 86400)).prefix(10)
        var body: [String: Any] = ["title": title, "timeZone": "Europe/Berlin", "dates": [String(date)], "startMinute": 540, "endMinute": 600, "planningMode": fixedStart == nil ? "COLLECT" : "FIXED", "expectedCount": count]
        if let fixedStart { body["fixedStart"] = ISO8601DateFormatter().string(from: fixedStart); body["durationMinutes"] = 60 }
        let result = try call("/api/v1/time-polls", auth: fixture.owner, method: "POST", body: body, expected: 201)
        tokens.append(try XCTUnwrap(result["token"] as? String)); return result
    }
    private func get(_ token: String) throws -> [String: Any] { try call("/api/v1/time-polls/\(token)", auth: fixture.owner) }
    private func calendarRows(_ token: String, auth: String) throws -> [[String: Any]] {
        let poll = try get(token)
        let date = String((poll["chosenStart"] as? String ?? ISO8601DateFormatter().string(from: Date())).prefix(10))
        let data = try call("/api/v1/home/schedule?windowStart=\(date)T00:00:00Z&windowEnd=\(date)T23:59:59Z", auth: auth)
        return (data["studyEntries"] as? [[String: Any]] ?? []).filter { $0["timePollToken"] as? String == token }
    }
    private func call(_ path: String, auth: String, method: String = "GET", body: [String: Any]? = nil, expected: Int = 200) throws -> [String: Any] {
        var request = URLRequest(url: URL(string: fixture.api + path)!); request.httpMethod = method
        request.setValue("Bearer \(auth)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue(UUID().uuidString, forHTTPHeaderField: "Idempotency-Key")
        if let body { request.httpBody = try JSONSerialization.data(withJSONObject: body) }
        let done = expectation(description: method + " " + path); let box = PlanReliabilityHTTPResult()
        URLSession.shared.dataTask(with: request) { data, response, error in box.data = data; box.status = (response as? HTTPURLResponse)?.statusCode; box.error = error; done.fulfill() }.resume()
        wait(for: [done], timeout: 30)
        if let error = box.error { throw error }
        XCTAssertEqual(box.status, expected)
        return (try JSONSerialization.jsonObject(with: XCTUnwrap(box.data)) as? [String: Any])?["data"] as? [String: Any] ?? [:]
    }
    private func capture(_ name: String) {
        let attachment = XCTAttachment(screenshot: app.screenshot()); attachment.name = "plans114-" + name; attachment.lifetime = .keepAlways; add(attachment)
    }
}
private final class PlanReliabilityHTTPResult: @unchecked Sendable { var data: Data?; var status: Int?; var error: Error? }
