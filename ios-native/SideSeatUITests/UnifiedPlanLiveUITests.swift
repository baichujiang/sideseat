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
        XCTAssertFalse(accounts.isEmpty)

    }

    private func authenticateAccounts() throws {
        for account in accounts {
            let result = try call("/api/v1/auth/login", method: "POST", body: ["identifier": account["identifier"]!, "password": account["password"]!, "device": ["id": UUID().uuidString, "name": "Unified plan verification", "appVersion": "1.0.0", "platformVersion": "26.0"]])
            let data = try XCTUnwrap(result["data"] as? [String: Any]); let tokens = try XCTUnwrap(data["tokens"] as? [String: Any])
            auth.append(try XCTUnwrap(tokens["accessToken"] as? String))
        }
    }

    /// The Mac prepares/checks the isolated fixture. This runner only drives the
    /// real App/Safari UI and does not need its own iOS network permission.
    func testSafariGuestShareNicknameAndConfirmation() throws {
        struct Fixture: Decodable { let token: String; let title: String; let shareUrl: URL }
        let fixtureJSON = ProcessInfo.processInfo.environment["SIDESEAT_GUEST_PHONE_FIXTURE_JSON"]
        try XCTSkipIf(fixtureJSON == nil, "Requires a fresh Mac-prepared guest phone fixture.")
        let raw = try XCTUnwrap(fixtureJSON)
        let fixture = try JSONDecoder().decode(Fixture.self, from: Data(raw.utf8))
        token = fixture.token; title = fixture.title
        let shareURL = fixture.shareUrl
        let safari = XCUIApplication(bundleIdentifier: "com.apple.mobilesafari")
        addTeardownBlock { [self] in MainActor.assumeIsolated { app.terminate() } }
        loginUI(0); tab("Plans"); openPlanCard()
        app.buttons["time-poll-edit-name"].tap()
        replace(app.textFields["time-poll-name"], with: "Host Ming\n")
        paintHour()
        app.buttons["time-poll-menu"].tap()
        XCTAssertTrue(app.buttons["Copy link"].waitForExistence(timeout: 10))
        app.buttons["Copy link"].tap()
        safari.activate()
        // The host phone also has SideSeat installed. Enter the web destination
        // explicitly so universal-link routing does not switch the guest to it.
        if safari.buttons["取消"].exists && safari.buttons["打开"].exists { safari.buttons["取消"].tap() }
        let done = safari.buttons.matching(NSPredicate(format: "label IN %@", ["Done", "完成"])).firstMatch
        if done.exists { done.tap() }
        let address = safari.textFields["TabBarItemTitle"]
        if !address.exists { safari.swipeDown() }
        XCTAssertTrue(address.waitForExistence(timeout: 10)); address.tap()
        let webURL = shareURL.absoluteString.replacingOccurrences(of: "https://sideseat.de/", with: "https://www.sideseat.de/")
        replace(safari.textFields.firstMatch, with: webURL + "\n")

        func webButton(_ en: String, _ zh: String) -> XCUIElement {
            safari.buttons.matching(NSPredicate(format: "label IN %@", [en, zh])).firstMatch
        }
        func webName() -> XCUIElement { safari.webViews.textFields.firstMatch }
        func replaceWebName(_ value: String) {
            let field = webName()
            field.tap()
            if !(field.value as? String ?? "").isEmpty {
                field.press(forDuration: 1.2)
                let selectAll = safari.menuItems.matching(NSPredicate(format: "label IN %@", ["Select All", "全选"])).firstMatch
                XCTAssertTrue(selectAll.waitForExistence(timeout: 5), "Use Safari's text selection menu to replace the nickname")
                selectAll.tap()
            }
            field.typeText(value)
            XCTAssertEqual(field.value as? String, value)
        }
        func webCapture(_ name: String) {
            let attachment = XCTAttachment(screenshot: safari.screenshot()); attachment.name = "phone-guest-web-" + name; attachment.lifetime = .keepAlways; add(attachment)
        }
        XCTAssertTrue(webName().waitForExistence(timeout: 30), "The share link must open a guest form in Safari")
        webName().tap(); webName().typeText("Guest Lin")
        webButton("Join this plan", "开始参与").tap()
        // The share page uses the same 30-minute grid as Preview 106.
        let firstCell = safari.switches.matching(NSPredicate(format: "label CONTAINS %@", ", 09:00")).firstMatch
        let lastCell = safari.switches.matching(NSPredicate(format: "label CONTAINS %@", ", 09:30")).firstMatch
        XCTAssertTrue(firstCell.waitForExistence(timeout: 20))
        for _ in 0..<3 where !lastCell.isHittable { safari.swipeUp() }
        firstCell.press(forDuration: 0.6, thenDragTo: lastCell)
        webCapture("grid-hour-selected")
        webButton("Undo last change", "撤销上次修改").tap()
        firstCell.press(forDuration: 0.6, thenDragTo: lastCell)
        XCTAssertTrue(safari.staticTexts.matching(NSPredicate(format: "label IN %@", ["Saved", "已保存"])).firstMatch.waitForExistence(timeout: 20))
        webCapture("availability-saved")
        let editName = webButton("Edit nickname", "编辑昵称")
        for _ in 0..<3 where !editName.isHittable { safari.swipeDown() }
        editName.tap(); XCTAssertTrue(webName().waitForExistence(timeout: 10))
        replaceWebName("Lin Xia")
        webButton("Save name", "保存昵称").tap()
        XCTAssertTrue(editName.waitForExistence(timeout: 15))
        webCapture("nickname-edited")

        app.activate()
        XCTAssertTrue(app.wait(for: .runningForeground, timeout: 10))
        let groupResults = app.buttons["Group results"]
        XCTAssertTrue(groupResults.waitForExistence(timeout: 10)); groupResults.tap()
        attach("safari-returned-to-results")
        let names = app.staticTexts["time-poll-participants"]
        expectation(for: NSPredicate(format: "label CONTAINS %@", "Lin Xia (Guest)"), evaluatedWith: names)
        waitForExpectations(timeout: 20)
        XCTAssertEqual(app.staticTexts["time-poll-result-heading"].label, "Everyone can attend")
        attach("safari-guest-results")
        app.buttons["unified-plan-invite-window"].firstMatch.tap()
        let send = app.buttons["unified-plan-send-invitations"]
        for _ in 0..<3 where !send.isHittable { app.swipeUp() }
        send.tap()
        XCTAssertTrue(app.staticTexts["unified-plan-confirmation-count"].waitForExistence(timeout: 20))
        XCTAssertEqual(app.staticTexts["unified-plan-confirmation-count"].label, "1 of 2 confirmed")
        print("GUEST_PHONE_PHASE awaiting-confirmation")
        app.buttons["time-poll-edit-name"].tap()
        let nativeName = app.textFields["time-poll-edit-name-field"]
        XCTAssertTrue(nativeName.waitForExistence(timeout: 10)); replace(nativeName, with: "Host Li")
        app.buttons["Save"].tap()
        XCTAssertTrue(app.staticTexts["Host Li"].waitForExistence(timeout: 20))

        safari.activate()
        let accept = webButton("Confirm participation", "确认参加")
        XCTAssertTrue(accept.waitForExistence(timeout: 35), "The same guest page must receive the invitation")
        editName.tap(); XCTAssertTrue(webName().waitForExistence(timeout: 10))
        replaceWebName("Lin Final")
        webButton("Save name", "保存昵称").tap()
        XCTAssertTrue(accept.waitForExistence(timeout: 20)); accept.tap()
        XCTAssertTrue(safari.staticTexts.matching(NSPredicate(format: "label IN %@", ["Plan confirmed", "计划已确定"])).firstMatch.waitForExistence(timeout: 25))
        webCapture("participation-confirmed")
        XCTAssertFalse(editName.exists)
        app.activate()
        XCTAssertTrue(app.wait(for: .runningForeground, timeout: 10))
        let count = app.staticTexts["unified-plan-confirmation-count"]
        expectation(for: NSPredicate(format: "label == %@", "2 of 2 confirmed"), evaluatedWith: count)
        waitForExpectations(timeout: 20)
        XCTAssertTrue(app.staticTexts["Lin Final"].exists)
        attach("safari-guest-confirmed")
        print("GUEST_PHONE_PHASE confirmed")
        loginUI(0); tab("Calendar"); app.buttons["calendar-search"].tap()
        let search = app.searchFields.firstMatch
        XCTAssertTrue(search.waitForExistence(timeout: 10)); search.tap(); search.typeText(title)
        let result = app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH %@", "calendar-search-result-")).firstMatch
        XCTAssertTrue(result.waitForExistence(timeout: 20)); result.tap()
        let manage = app.buttons["calendar-manage-plan"]
        for _ in 0..<4 where !manage.isHittable { app.swipeUp() }
        XCTAssertTrue(manage.waitForExistence(timeout: 10)); attach("safari-guest-calendar")
        manage.tap()
        XCTAssertTrue(app.staticTexts["Lin Final"].waitForExistence(timeout: 20))
    }

    private func replace(_ field: XCUIElement, with value: String) {
        field.tap()
        // Native fields and Safari's address bar support the Select All shortcut.
        field.typeKey("a", modifierFlags: .command)
        field.typeText(value)
        if !value.hasSuffix("\n") { XCTAssertEqual(field.value as? String, value) }
    }

    func testGuestNamesInvitationsAndCalendar() throws {
        try authenticateAccounts()
        title = "Guest plan QA \(Int(Date().timeIntervalSince1970))"
        let date = String(ISO8601DateFormatter().string(from: Date().addingTimeInterval(3 * 86400)).prefix(10))
        let created = try call("/api/v1/time-polls", method: "POST", auth: auth[0], body: ["title": title, "timeZone": "Europe/Berlin", "dates": [date], "startMinute": 540, "endMinute": 720, "durationMinutes": 60, "expectedCount": 2], expectedStatus: 201)
        token = try XCTUnwrap((created["data"] as? [String: Any])?["token"] as? String)
        addTeardownBlock { [self] in MainActor.assumeIsolated {
            if let value = try? poll(0), let version = value["invitationVersion"] as? Int, version > 0 {
                _ = try? call("/api/v1/time-polls/\(token)/cancel", method: "POST", auth: auth[0], body: ["version": version])
            }
            _ = try? call("/api/v1/time-polls/\(token)", method: "DELETE", auth: auth[0]); app.terminate()
        } }
        let publicPath = "/api/public/time-polls/\(token)"
        let joined = try call(publicPath + "/participant", method: "POST", body: ["displayName": "Guest Lin"])
        let guest = try XCTUnwrap((joined["data"] as? [String: Any])?["viewerId"] as? String)
        _ = try call(publicPath + "/response", method: "PUT", body: ["participantId": guest, "displayName": "Guest Lin", "slotIds": [0, 1, 2, 3]])
        loginUI(0); tab("Plans"); openPlanCard()
        app.buttons["time-poll-edit-name"].tap()
        let name = app.textFields["time-poll-name"]
        name.typeText(String(repeating: XCUIKeyboardKey.delete.rawValue, count: (name.value as? String ?? "").count))
        name.typeText("Host Ming\n")
        XCTAssertTrue(app.descendants(matching: .any)["time-poll-saved"].waitForExistence(timeout: 15))
        paintHour(); app.buttons["Group results"].tap()
        XCTAssertTrue(app.staticTexts["time-poll-participants"].label.contains("Guest Lin (Guest)"))
        attach("guest-availability-results")
        app.buttons["unified-plan-invite-window"].firstMatch.tap()
        XCTAssertTrue(app.staticTexts["Guest"].firstMatch.waitForExistence(timeout: 10))
        app.buttons["unified-plan-send-invitations"].tap()
        XCTAssertTrue(app.staticTexts["unified-plan-confirmation-count"].waitForExistence(timeout: 15))
        app.buttons["time-poll-edit-name"].tap()
        let edit = app.textFields["time-poll-edit-name-field"]
        XCTAssertTrue(edit.waitForExistence(timeout: 10)); edit.tap()
        edit.typeText(String(repeating: XCUIKeyboardKey.delete.rawValue, count: (edit.value as? String ?? "").count))
        edit.typeText("Host Li"); app.buttons["Save"].tap()
        XCTAssertTrue(app.staticTexts["Host Li"].waitForExistence(timeout: 15))
        XCTAssertEqual(try calendarRows(0).count, 0)
        _ = try call(publicPath + "/participant", method: "PATCH", body: ["participantId": guest, "displayName": "Lin Xia"])
        _ = try call(publicPath + "/invitation-response", method: "PUT", body: ["participantId": guest, "status": "ACCEPTED", "version": 1])
        loginUI(0); tab("Plans"); app.segmentedControls.buttons["Upcoming"].tap(); openPlanCard()
        XCTAssertEqual(app.staticTexts["unified-plan-confirmation-count"].label, "2 of 2 confirmed")
        XCTAssertTrue(app.staticTexts["Lin Xia"].exists)
        XCTAssertEqual(try calendarRows(0).count, 1)
        attach("guest-confirmed-native")
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
        let first = app.buttons["time-poll-cell-0"], last = app.buttons["time-poll-cell-2"]
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
