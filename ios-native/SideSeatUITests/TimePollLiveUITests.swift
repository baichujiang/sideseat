import XCTest

/// Uses five isolated QA accounts and real Sideseat API/storage. No chat is sent.
@MainActor final class TimePollLiveUITests: XCTestCase {
    private var app = XCUIApplication(bundleIdentifier: "app.sideseat.mobile")
    private var api = ""
    private var accounts: [[String: String]] = []
    private var token = ""
    private var ownerAuth = ""

    override func setUpWithError() throws {
        continueAfterFailure = false
        let env = ProcessInfo.processInfo.environment
        try XCTSkipUnless(env["SIDESEAT_TIME_POLL_QA"] == "1", "Enable real time poll integration explicitly.")
        api = env["SIDESEAT_TIME_POLL_QA_API"] ?? "http://127.0.0.1:3099"
        if let json = env["SIDESEAT_TIME_POLL_QA_ACCOUNTS_JSON"], let data = json.data(using: .utf8), !json.isEmpty {
            accounts = try JSONDecoder().decode([[String: String]].self, from: data)
        } else if let path = env["SIDESEAT_TIME_POLL_QA_ACCOUNTS"], !path.isEmpty {
            accounts = try JSONDecoder().decode([[String: String]].self, from: Data(contentsOf: URL(fileURLWithPath: path)))
        } else { accounts = (1...5).map { ["identifier": "test_00\($0)", "password": "Password123"] } }
        if let bundle = env["SIDESEAT_TIME_POLL_QA_BUNDLE"], !bundle.isEmpty { app = XCUIApplication(bundleIdentifier: bundle) }
    }

    @MainActor
    func testFivePeopleCreatePaintEraseAndReopen() throws {
        let title = "Native five-person QA \(Int(Date().timeIntervalSince1970))"
        let owner = try login(0); ownerAuth = owner.token
        addTeardownBlock { [self] in
            MainActor.assumeIsolated {
                app.terminate()
                if !token.isEmpty { _ = try? call("/api/v1/time-polls/\(token)", method: "DELETE", auth: ownerAuth) }
            }
        }
        launch(owner)
        app.buttons["inbox-time-poll"].tap()
        app.buttons["time-poll-create"].tap()
        let titleField = app.textFields["time-poll-title"]
        XCTAssertTrue(titleField.waitForExistence(timeout: 10)); titleField.tap(); titleField.typeText(title)
        app.buttons["time-poll-create-confirm"].tap()
        XCTAssertTrue(app.staticTexts["time-poll-detail-title"].waitForExistence(timeout: 20))
        XCTAssertEqual(app.staticTexts["time-poll-detail-title"].label, title)
        let list = try call("/api/v1/time-polls", auth: owner.token)
        let polls = try XCTUnwrap((list["data"] as? [String: Any])?["polls"] as? [[String: Any]])
        token = try XCTUnwrap(polls.first { $0["title"] as? String == title }?["token"] as? String)

        for index in 0..<5 {
            if index > 0 {
                launch(try login(index))
                openInvite()
            }
            setName("Person \(index + 1)")
            let first = app.buttons["time-poll-cell-0"], last = app.buttons["time-poll-cell-2"]
            XCTAssertTrue(first.waitForExistence(timeout: 10))
            first.press(forDuration: 0.6, thenDragTo: last)
            waitSaved()
            app.buttons["time-poll-cell-\(4 + index * 2)"].tap()
            waitSaved()
            let own = try poll(auth: (try login(index)).token)
            XCTAssertEqual(own["mySlotIds"] as? [Int], [0, 1, 2, 3, 4 + index * 2, 5 + index * 2])
        }
        showResults()
        XCTAssertEqual(app.staticTexts["time-poll-result-heading"].label, "Group timetable")
        XCTAssertTrue(app.descendants(matching: .any)["time-poll-cell-0"].label.hasSuffix(", 5"))
        attach("five-common")
        let shared = try poll(auth: ownerAuth)
        let summary = try XCTUnwrap(shared["summary"] as? [String: Any])
        XCTAssertEqual(summary["maximum"] as? Int, 5); XCTAssertEqual(summary["common"] as? Bool, true)

        app.buttons["My availability"].tap()
        app.buttons["time-poll-cell-0"].press(forDuration: 0.6, thenDragTo: app.buttons["time-poll-cell-2"])
        waitSaved()
        showResults()
        XCTAssertEqual(app.staticTexts["time-poll-result-heading"].label, "Group timetable")
        XCTAssertTrue(app.descendants(matching: .any)["time-poll-cell-0"].label.hasSuffix(", 4"))
        attach("four-best")

        for index in 0..<5 {
            let auth = try login(index)
            launch(auth)
            app.buttons["inbox-time-poll"].tap()
            let recent = app.buttons["time-poll-recent-\(token)"]
            XCTAssertTrue(recent.waitForExistence(timeout: 15)); recent.tap()
            XCTAssertTrue(app.textFields["time-poll-name"].waitForExistence(timeout: 15))
            XCTAssertEqual(app.textFields["time-poll-name"].value as? String, "Person \(index + 1)")
            let expected = index == 4 ? [12, 13] : [0, 1, 2, 3, 4 + index * 2, 5 + index * 2]
            for id in stride(from: 0, through: 12, by: 2) {
                XCTAssertEqual(app.buttons["time-poll-cell-\(id)"].isSelected, expected.contains(id))
            }
            let reopened = try poll(auth: auth.token)
            XCTAssertEqual(reopened["mySlotIds"] as? [Int], expected)
            showResults()
            XCTAssertEqual(app.staticTexts["time-poll-result-heading"].label, "Group timetable")
            XCTAssertTrue(app.descendants(matching: .any)["time-poll-cell-0"].label.hasSuffix(", 4"))
        }
        let banner = XCUIApplication(bundleIdentifier: "com.apple.springboard").descendants(matching: .any)["NotificationShortLookView"].firstMatch
        if banner.exists { banner.swipeUp() }
        app.buttons["time-poll-menu"].tap()
        XCTAssertTrue(app.buttons["Copy link"].waitForExistence(timeout: 10)); XCTAssertTrue(app.buttons["Share poll"].exists)
        attach("reopened")
    }

    func testMultipleDatesKeepTimeLabelsAndChineseDarkAppearance() throws {
        let auth = try login(0); ownerAuth = auth.token
        let created = try call("/api/v1/time-polls", method: "POST", auth: ownerAuth, body: [
            "title": "多日聚餐时间", "timeZone": "Europe/Berlin", "dates": ["2026-10-16", "2026-10-17", "2026-10-18", "2026-10-19", "2026-10-20"], "startMinute": 540, "endMinute": 1020,
        ], expectedStatus: 201)
        token = try XCTUnwrap((created["data"] as? [String: Any])?["token"] as? String)
        addTeardownBlock { [self] in MainActor.assumeIsolated {
            app.terminate(); _ = try? call("/api/v1/time-polls/\(token)", method: "DELETE", auth: ownerAuth)
        } }
        launch(auth); openInvite()
        app.buttons["time-poll-cell-0"].press(forDuration: 0.6, thenDragTo: app.buttons["time-poll-cell-25"])
        waitSaved()
        XCTAssertEqual(try poll(auth: ownerAuth)["mySlotIds"] as? [Int], [0, 1, 2, 3, 32, 33, 34, 35])
        let header = app.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", "Oct 16")).firstMatch
        app.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", "Oct 18")).firstMatch.press(forDuration: 0.15, thenDragTo: header)
        XCTAssertTrue(app.staticTexts["Time"].isHittable)
        XCTAssertTrue(app.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", "Oct 20")).firstMatch.isHittable)
        let grid = app.scrollViews["time-poll-grid"]
        grid.coordinate(withNormalizedOffset: CGVector(dx: 0.04, dy: 0.85)).press(forDuration: 0.1, thenDragTo: grid.coordinate(withNormalizedOffset: CGVector(dx: 0.04, dy: 0.15)))
        XCTAssertFalse(app.staticTexts["09:00"].isHittable)
        XCTAssertEqual(try poll(auth: ownerAuth)["mySlotIds"] as? [Int], [0, 1, 2, 3, 32, 33, 34, 35])
        launch(auth, language: "zh-Hans", appearance: "dark")
        app.buttons["inbox-time-poll"].tap()
        let recent = app.buttons["time-poll-recent-\(token)"]
        XCTAssertTrue(recent.waitForExistence(timeout: 15)); recent.tap()
        XCTAssertTrue(app.textFields["time-poll-name"].waitForExistence(timeout: 15))
        app.buttons["大家的结果"].tap()
        XCTAssertEqual(app.staticTexts["time-poll-result-heading"].label, "所有人都能参加")
        attach("chinese-dark-multiple-dates")
    }

    @MainActor private func launch(_ auth: (token: String, user: String), language: String = "en", appearance: String = "light") {
        app.terminate()
        app.launchArguments = ["--ui-testing-authenticated", "--ui-testing-chats", "--ui-testing-skip-tutorial", "--ui-testing-ephemeral-credentials", "--ui-testing-time-poll-live", "--ui-testing-language=\(language)", "--ui-testing-appearance=\(appearance)", "--ui-testing-local-api"]
        app.launchEnvironment["SIDESEAT_QA_ACCESS_TOKEN"] = auth.token
        if api.hasPrefix("http://127.0.0.1") { app.launchEnvironment["SIDESEAT_API_BASE_URL_OVERRIDE"] = api }
        app.launch()
        XCTAssertTrue(app.buttons["inbox-time-poll"].waitForExistence(timeout: 20))
    }
    @MainActor private func openInvite() {
        app.buttons["inbox-time-poll"].tap(); app.buttons["Open a poll link"].tap()
        let field = app.alerts.textFields.firstMatch
        field.tap(); field.typeText("https://www.sideseat.de/time-polls/\(token)")
        app.alerts.buttons["Open"].tap()
        XCTAssertTrue(app.textFields["time-poll-name"].waitForExistence(timeout: 20))
    }
    @MainActor private func setName(_ name: String) {
        let field = app.textFields["time-poll-name"]
        XCTAssertTrue(field.waitForExistence(timeout: 10)); field.tap()
        field.typeText(String(repeating: XCUIKeyboardKey.delete.rawValue, count: (field.value as? String ?? "").count))
        field.typeText(name + "\n"); waitSaved()
    }
    @MainActor private func waitSaved() { XCTAssertTrue(app.descendants(matching: .any)["time-poll-saved"].waitForExistence(timeout: 20)) }
    @MainActor private func showResults() { app.buttons["Group results"].tap() }
    @MainActor private func attach(_ name: String) {
        let attachment = XCTAttachment(screenshot: app.screenshot()); attachment.name = "native-poll-" + name; attachment.lifetime = .keepAlways; add(attachment)
    }
    private func poll(auth: String) throws -> [String: Any] { try XCTUnwrap(call("/api/v1/time-polls/\(token)", auth: auth)["data"] as? [String: Any]) }
    private func login(_ index: Int) throws -> (token: String, user: String) {
        let payload = try call("/api/v1/auth/login", method: "POST", body: ["identifier": accounts[index]["identifier"]!, "password": accounts[index]["password"]!, "device": ["id": "native-poll-qa-\(index)", "name": "Time poll QA iPhone", "appVersion": "1.0.0", "platformVersion": "26.0"]])
        let data = try XCTUnwrap(payload["data"] as? [String: Any])
        let tokens = try XCTUnwrap(data["tokens"] as? [String: Any])
        let user = try JSONSerialization.data(withJSONObject: XCTUnwrap(data["user"]))
        return (try XCTUnwrap(tokens["accessToken"] as? String), String(decoding: user, as: UTF8.self))
    }
    private func call(_ path: String, method: String = "GET", auth: String? = nil, body: [String: Any]? = nil, expectedStatus: Int = 200) throws -> [String: Any] {
        var request = URLRequest(url: URL(string: api + path)!); request.httpMethod = method
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue(UUID().uuidString, forHTTPHeaderField: "Idempotency-Key")
        if let auth { request.setValue("Bearer \(auth)", forHTTPHeaderField: "Authorization") }
        if let body { request.httpBody = try JSONSerialization.data(withJSONObject: body) }
        let waiter = expectation(description: method + " " + path)
        let box = PollHTTPResult()
        URLSession.shared.dataTask(with: request) { data, response, error in
            box.data = data; box.status = (response as? HTTPURLResponse)?.statusCode; box.error = error; waiter.fulfill()
        }.resume()
        wait(for: [waiter], timeout: 30)
        if let error = box.error { throw error }
        XCTAssertEqual(box.status, expectedStatus)
        return try JSONSerialization.jsonObject(with: XCTUnwrap(box.data)) as? [String: Any] ?? [:]
    }
}

// URLSession completion finishes before the expectation is consumed.
private final class PollHTTPResult: @unchecked Sendable { var data: Data?; var status: Int?; var error: Error? }
