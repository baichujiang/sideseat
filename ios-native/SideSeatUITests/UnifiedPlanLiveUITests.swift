import XCTest

/// Real native login, five isolated accounts and the real API/Calendar store.
@MainActor final class UnifiedPlanLiveUITests: XCTestCase {
    private var app = XCUIApplication(bundleIdentifier: "app.sideseat.mobile")
    private var api = ""
    private var accounts: [[String: String]] = []
    private var auth: [String] = []
    private var token = ""
    private var title = ""

    override func setUpWithError() throws {
        continueAfterFailure = false
        let env = ProcessInfo.processInfo.environment
        try XCTSkipUnless(env["SIDESEAT_UNIFIED_PLAN_QA"] == "1", "Enable isolated unified-plan QA explicitly.")
        api = env["SIDESEAT_UNIFIED_PLAN_QA_API"] ?? "http://127.0.0.1:3099"
        if let bundle = env["SIDESEAT_UNIFIED_PLAN_QA_BUNDLE"], !bundle.isEmpty { app = XCUIApplication(bundleIdentifier: bundle) }
        if let raw = env["SIDESEAT_UNIFIED_PLAN_QA_ACCOUNTS_JSON"], !raw.isEmpty {
            accounts = try JSONDecoder().decode([[String: String]].self, from: Data(raw.utf8))
        } else {
            try XCTSkipUnless(api.hasPrefix("http://127.0.0.1"), "Production QA requires private temporary account credentials.")
            accounts = (1...5).map { ["identifier": "test_00\($0)", "password": "Password123"] }
        }
        XCTAssertEqual(accounts.count, 5)

    }

    private func authenticateAccounts() throws {
        for account in accounts {
            let result = try call("/api/v1/auth/login", method: "POST", body: ["identifier": account["identifier"]!, "password": account["password"]!, "device": ["id": UUID().uuidString, "name": "Unified plan verification", "appVersion": "1.0.0", "platformVersion": "26.0"]])
            let data = try XCTUnwrap(result["data"] as? [String: Any]); let tokens = try XCTUnwrap(data["tokens"] as? [String: Any])
            auth.append(try XCTUnwrap(tokens["accessToken"] as? String))
        }
    }

    func testFivePeopleFindTimeInviteConfirmAndReopenCalendars() throws {
        try authenticateAccounts()
        title = "Unified five-person QA \(Int(Date().timeIntervalSince1970))"
        addTeardownBlock { [self] in MainActor.assumeIsolated {
            if !token.isEmpty, let value = try? poll(0), let version = value["invitationVersion"] as? Int, version > 0 {
                _ = try? call("/api/v1/time-polls/\(token)/cancel", method: "POST", auth: auth[0], body: ["version": version])
            }
            if !token.isEmpty { _ = try? call("/api/v1/time-polls/\(token)", method: "DELETE", auth: auth[0]) }
            app.terminate()
        } }
        loginUI(0)
        tab("Plans")
        XCTAssertTrue(app.buttons["plans-create-unified"].waitForExistence(timeout: 20)); app.buttons["plans-create-unified"].tap()
        let titleField = app.textFields["time-poll-title"]
        XCTAssertTrue(titleField.waitForExistence(timeout: 15)); titleField.tap(); titleField.typeText(title)
        app.buttons["time-poll-create-confirm"].tap()
        XCTAssertTrue(app.textFields["time-poll-name"].waitForExistence(timeout: 20))
        let list = try call("/api/v1/time-polls", auth: auth[0])
        let rows = try XCTUnwrap((list["data"] as? [String: Any])?["polls"] as? [[String: Any]])
        token = try XCTUnwrap(rows.first { $0["title"] as? String == title }?["token"] as? String)
        paintHour()
        for n in 1..<5 { loginUI(n); openLink(); paintHour() }
        app.buttons["Group results"].tap()
        XCTAssertEqual(app.staticTexts["time-poll-result-heading"].label, "Everyone can attend")
        attach("five-common")
        app.buttons["My availability"].tap(); paintHour()
        app.buttons["Group results"].tap()
        XCTAssertEqual(app.staticTexts["time-poll-result-heading"].label, "Best available times")
        XCTAssertTrue(app.staticTexts["4 of 5 available"].exists)
        attach("four-person-recommendation")
        app.buttons["My availability"].tap(); paintHour()
        loginUI(0); tab("Plans"); openPlanCard()
        app.buttons["Group results"].tap()
        let invite = app.buttons.matching(NSPredicate(format: "identifier == %@ OR label == %@", "unified-plan-invite-window", "Use this time to invite")).firstMatch
        XCTAssertTrue(invite.waitForExistence(timeout: 15)); invite.tap()
        let send = app.buttons["unified-plan-send-invitations"]
        for _ in 0..<3 where !send.isHittable { app.swipeUp() }
        XCTAssertTrue(send.isHittable); send.tap()
        XCTAssertTrue(app.staticTexts["unified-plan-confirmation-count"].waitForExistence(timeout: 20))
        XCTAssertEqual(app.staticTexts["unified-plan-confirmation-count"].label, "1 of 5 confirmed")
        attach("invitation-one-confirmed")
        for n in 1..<5 {
            loginUI(n); tab("Plans"); openPlanCard()
            XCTAssertTrue(app.buttons["unified-plan-accept"].waitForExistence(timeout: 15)); app.buttons["unified-plan-accept"].tap()
            let count = app.staticTexts["unified-plan-confirmation-count"]
            expectation(for: NSPredicate(format: "label == %@", "\(n + 1) of 5 confirmed"), evaluatedWith: count)
            waitForExpectations(timeout: 20)
            XCTAssertEqual(try poll(n)["phase"] as? String, n == 4 ? "CONFIRMED" : "INVITING")
            if n < 4 { XCTAssertEqual(try calendarRows(n).count, 0) }
        }
        XCTAssertEqual(app.staticTexts["unified-plan-phase"].label, "Confirmed")
        attach("five-confirmed")
        for n in 0..<5 {
            let rows = try calendarRows(n)
            XCTAssertEqual(rows.count, 1)
            XCTAssertEqual((rows[0]["eventParticipants"] as? [Any])?.count, 4)
            loginUI(n); tab("Plans")
            let upcoming = app.segmentedControls.buttons["Upcoming"]
            XCTAssertTrue(upcoming.waitForExistence(timeout: 10)); upcoming.tap()
            openPlanCard()
            XCTAssertEqual(app.staticTexts["unified-plan-confirmation-count"].label, "5 of 5 confirmed")
        }
        loginUI(4); tab("Calendar")
        XCTAssertTrue(app.buttons["calendar-search"].waitForExistence(timeout: 15)); app.buttons["calendar-search"].tap()
        let search = app.searchFields.firstMatch
        XCTAssertTrue(search.waitForExistence(timeout: 10)); search.tap(); search.typeText(title)
        let calendar = try calendarRows(4)
        let eventID = try XCTUnwrap(calendar.first?["id"] as? String)
        let result = app.buttons["calendar-search-result-\(eventID)"]
        XCTAssertTrue(result.waitForExistence(timeout: 20)); result.tap()
        let manage = app.buttons["calendar-manage-plan"]
        for _ in 0..<4 where !manage.exists || !manage.isHittable { app.swipeUp() }
        XCTAssertTrue(manage.waitForExistence(timeout: 10))
        attach("calendar-readonly-plan")
        app.buttons["calendar-manage-plan"].tap()
        XCTAssertTrue(app.staticTexts["unified-plan-confirmation-count"].waitForExistence(timeout: 15))
        XCTAssertEqual(app.staticTexts["unified-plan-confirmation-count"].label, "5 of 5 confirmed")
    }

    func testDirectTimeCreationAndChineseDarkAccessibility() throws {
        try authenticateAccounts()
        title = "Direct plan QA \(Int(Date().timeIntervalSince1970))"
        addTeardownBlock { [self] in MainActor.assumeIsolated {
            if !token.isEmpty {
                _ = try? call("/api/v1/time-polls/\(token)/cancel", method: "POST", auth: auth[0], body: ["version": 1])
                _ = try? call("/api/v1/time-polls/\(token)", method: "DELETE", auth: auth[0])
            }
            app.terminate()
        } }
        loginUI(0); tab("Plans"); app.buttons["plans-create-unified"].tap()
        let field = app.textFields["time-poll-title"]
        XCTAssertTrue(field.waitForExistence(timeout: 10)); field.tap(); field.typeText(title)
        attach("creation-light")
        app.segmentedControls.buttons["Set a time"].tap()
        app.buttons["Create invitation"].tap()
        XCTAssertTrue(app.staticTexts["unified-plan-confirmation-count"].waitForExistence(timeout: 20))
        XCTAssertEqual(app.staticTexts["unified-plan-confirmation-count"].label, "1 of 5 confirmed")
        let list = try XCTUnwrap(call("/api/v1/time-polls", auth: auth[0])["data"] as? [String: Any])
        let plans = try XCTUnwrap(list["polls"] as? [[String: Any]])
        token = try XCTUnwrap(plans.first { $0["title"] as? String == title }?["token"] as? String)
        XCTAssertEqual(try poll(0)["planningMode"] as? String, "FIXED")
        for n in 1..<5 { _ = try call("/api/v1/time-polls/\(token)/invitation-response", method: "PUT", auth: auth[n], body: ["version": 1, "status": "ACCEPTED"]) }
        loginUI(4); tab("Plans"); app.segmentedControls.buttons["Upcoming"].tap(); openPlanCard()
        XCTAssertEqual(app.staticTexts["unified-plan-confirmation-count"].label, "5 of 5 confirmed")
        attach("direct-time-confirmed")
        loginUI(0, language: "zh-Hans", appearance: "dark", accessibility: true)
        tab("计划"); app.buttons["plans-create-unified"].tap()
        XCTAssertTrue(app.textFields["time-poll-title"].waitForExistence(timeout: 15))
        attach("chinese-dark-accessibility-creation")
        app.swipeUp(); attach("chinese-dark-accessibility-timing")
    }

    func testCalendarSharedPlanCaptionAndCanonicalRoute() throws {
        try authenticateAccounts()
        title = "Calendar plan QA \(Int(Date().timeIntervalSince1970))"
        let date = String(ISO8601DateFormatter().string(from: Date().addingTimeInterval(2 * 86400)).prefix(10))
        let created = try call("/api/v1/time-polls", method: "POST", auth: auth[0], body: ["title": title, "timeZone": "Europe/Berlin", "dates": [date], "startMinute": 540, "endMinute": 1020, "durationMinutes": 60, "expectedCount": 2, "planningMode": "FIXED", "fixedStart": date + "T12:00:00Z"], expectedStatus: 201)
        token = try XCTUnwrap((created["data"] as? [String: Any])?["token"] as? String)
        addTeardownBlock { [self] in MainActor.assumeIsolated {
            _ = try? call("/api/v1/time-polls/\(token)/cancel", method: "POST", auth: auth[0], body: ["version": 1])
            _ = try? call("/api/v1/time-polls/\(token)", method: "DELETE", auth: auth[0]); app.terminate()
        } }
        _ = try call("/api/v1/time-polls/\(token)/invitation-response", method: "PUT", auth: auth[4], body: ["version": 1, "status": "ACCEPTED"])
        loginUI(4); tab("Calendar"); app.buttons["calendar-search"].tap()
        let search = app.searchFields.firstMatch
        XCTAssertTrue(search.waitForExistence(timeout: 10)); search.tap(); search.typeText(title)
        let eventID = try XCTUnwrap(try calendarRows(4).first?["id"] as? String)
        let result = app.buttons["calendar-search-result-\(eventID)"]
        XCTAssertTrue(result.waitForExistence(timeout: 20)); result.tap()
        let manage = app.buttons["calendar-manage-plan"]
        for _ in 0..<4 where !manage.exists || !manage.isHittable { app.swipeUp() }
        XCTAssertTrue(manage.waitForExistence(timeout: 10))
        XCTAssertFalse(app.staticTexts["Shared Plan details are managed in Messages."].exists)
        XCTAssertTrue(app.staticTexts["Shared plan details are managed in Plans."].firstMatch.exists)
        attach("calendar-caption-verified")
        manage.tap()
        XCTAssertTrue(app.staticTexts["unified-plan-confirmation-count"].waitForExistence(timeout: 15))
        XCTAssertEqual(app.staticTexts["unified-plan-confirmation-count"].label, "2 of 2 confirmed")
    }

    private func loginUI(_ n: Int, language: String = "en", appearance: String = "light", accessibility: Bool = false) {
        app.terminate()
        app.launchArguments = ["--ui-testing-signed-out", "--ui-testing-ephemeral-credentials", "--ui-testing-skip-tutorial", "--ui-testing-language=\(language)", "--ui-testing-appearance=\(appearance)"]
        if accessibility { app.launchArguments.append("--ui-testing-dynamic-type-accessibility") }
        if api.hasPrefix("http://127.0.0.1") { app.launchArguments.append("--ui-testing-local-api"); app.launchEnvironment["SIDESEAT_API_BASE_URL_OVERRIDE"] = api }
        app.launch()
        let username = app.textFields["login-identifier"]
        XCTAssertTrue(username.waitForExistence(timeout: 15)); username.tap(); username.typeText(accounts[n]["identifier"]!)
        let password = app.secureTextFields["login-password"]; password.tap(); password.typeText(accounts[n]["password"]!)
        app.buttons["login-submit"].tap()
        XCTAssertTrue(app.tabBars.firstMatch.waitForExistence(timeout: 30))
    }
    private func tab(_ label: String) { app.tabBars.buttons[label].tap() }
    private func openPlanCard() {
        let card = app.buttons["plans-coordinated-\(token)"]
        XCTAssertTrue(card.waitForExistence(timeout: 20)); card.tap()
        XCTAssertTrue(app.staticTexts["time-poll-detail-title"].waitForExistence(timeout: 20))
    }
    private func openLink() {
        tab("Messages"); XCTAssertTrue(app.buttons["inbox-time-poll"].waitForExistence(timeout: 15)); app.buttons["inbox-time-poll"].tap()
        app.buttons["Open a poll link"].tap()
        let field = app.alerts.textFields.firstMatch; field.tap(); field.typeText("https://www.sideseat.de/time-polls/\(token)")
        app.alerts.buttons["Open"].tap()
        XCTAssertTrue(app.textFields["time-poll-name"].waitForExistence(timeout: 20))
    }
    private func paintHour() {
        let first = app.buttons["time-poll-cell-0"], last = app.buttons["time-poll-cell-3"]
        XCTAssertTrue(first.waitForExistence(timeout: 15)); first.press(forDuration: 0.6, thenDragTo: last)
        XCTAssertTrue(app.descendants(matching: .any)["time-poll-saved"].waitForExistence(timeout: 20))
    }
    private func poll(_ n: Int) throws -> [String: Any] { try XCTUnwrap(call("/api/v1/time-polls/\(token)", auth: auth[n])["data"] as? [String: Any]) }
    private func calendarRows(_ n: Int) throws -> [[String: Any]] {
        let poll = try poll(n)
        let start = try XCTUnwrap(poll["chosenStart"] as? String)
        let date = String(start.prefix(10))
        let result = try call("/api/v1/home/schedule?windowStart=\(date)T00:00:00Z&windowEnd=\(date)T23:59:59Z", auth: auth[n])
        let rows = try XCTUnwrap((result["data"] as? [String: Any])?["studyEntries"] as? [[String: Any]])
        return rows.filter { $0["timePollToken"] as? String == token }
    }
    private func attach(_ name: String) {
        let image = XCTAttachment(screenshot: app.screenshot()); image.name = "unified-plan-" + name; image.lifetime = .keepAlways; add(image)
    }
    private func call(_ path: String, method: String = "GET", auth: String? = nil, body: [String: Any]? = nil, expectedStatus: Int = 200) throws -> [String: Any] {
        var request = URLRequest(url: URL(string: api + path)!); request.httpMethod = method
        request.setValue("application/json", forHTTPHeaderField: "Content-Type"); request.setValue(UUID().uuidString, forHTTPHeaderField: "Idempotency-Key")
        if let auth { request.setValue("Bearer \(auth)", forHTTPHeaderField: "Authorization") }
        if let body { request.httpBody = try JSONSerialization.data(withJSONObject: body) }
        let done = expectation(description: method + " " + path); let box = UnifiedPlanHTTPResult()
        URLSession.shared.dataTask(with: request) { data, response, error in box.data = data; box.status = (response as? HTTPURLResponse)?.statusCode; box.error = error; done.fulfill() }.resume()
        wait(for: [done], timeout: 30)
        if let error = box.error { throw error }
        XCTAssertEqual(box.status, expectedStatus)
        return try JSONSerialization.jsonObject(with: XCTUnwrap(box.data)) as? [String: Any] ?? [:]
    }
}
private final class UnifiedPlanHTTPResult: @unchecked Sendable { var data: Data?; var status: Int?; var error: Error? }
