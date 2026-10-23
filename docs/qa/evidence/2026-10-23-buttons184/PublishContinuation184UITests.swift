import XCTest

@MainActor
final class PublishContinuation184UITests: XCTestCase {
    func testPublishAcceptedPlanAndFindParticipantCalendar() throws {
        continueAfterFailure = false
        struct Fixture: Decodable {
            struct Account: Decodable { let role: String; let accessToken: String }
            let bundle: String; let title: String; let pollToken: String; let accounts: [Account]
        }
        let raw = try XCTUnwrap(ProcessInfo.processInfo.environment["SIDESEAT_PLAN_CONTACTS_JSON"])
        let f = try JSONDecoder().decode(Fixture.self, from: Data(raw.utf8))
        for role in ["owner", "participant"] {
            let account = try XCTUnwrap(f.accounts.first { $0.role == role })
            let app = XCUIApplication(bundleIdentifier: f.bundle)
            app.launchArguments = ["--ui-testing-authenticated", "--ui-testing-ephemeral-credentials", "--ui-testing-skip-tutorial",
                "--ui-testing-time-poll-live", "--ui-testing-language=zh-Hans", "--ui-testing-appearance=light",
                "--ui-testing-deep-link=/time-polls/\(f.pollToken)"]
            app.launchEnvironment = ["SIDESEAT_QA_ACCESS_TOKEN": account.accessToken]
            app.launch()
            defer { app.terminate() }
            if role == "owner" {
                let action = app.buttons["unified-plan-publish"]
                XCTAssertTrue(action.waitForExistence(timeout: 25)); action.tap()
                let confirm = app.buttons.matching(NSPredicate(format: "label == %@ AND identifier != %@", "正式发出", "unified-plan-publish")).firstMatch
                XCTAssertTrue(confirm.waitForExistence(timeout: 10)); confirm.tap()
                XCTAssertTrue(app.buttons["plan-view-calendar"].waitForExistence(timeout: 20))
                print("NATIVE_PARTICIPANT_PHASE contacts-published")
            } else {
                let calendar = app.buttons["plan-view-calendar"]
                XCTAssertTrue(calendar.waitForExistence(timeout: 25)); calendar.tap()
                XCTAssertTrue(app.tabBars.buttons["日历"].isSelected)
                app.buttons["calendar-search"].tap()
                let search = app.searchFields.firstMatch
                XCTAssertTrue(search.waitForExistence(timeout: 10)); search.tap(); search.typeText(f.title)
                let result = app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH 'calendar-search-result-' AND label CONTAINS %@", f.title)).firstMatch
                XCTAssertTrue(result.waitForExistence(timeout: 20))
                print("NATIVE_PARTICIPANT_PHASE contacts-calendar-verified")
            }
            Thread.sleep(forTimeInterval: 3)
            let shot = XCTAttachment(screenshot: app.screenshot())
            shot.name = "publish184-\(role)"; shot.lifetime = .keepAlways; add(shot)
        }
    }
    func testConfirmedPlanInRealParticipantCalendar() throws {
        continueAfterFailure = false
        struct Fixture: Decodable {
            struct Account: Decodable { let role: String; let identifier: String; let password: String }
            let bundle: String; let title: String; let accounts: [Account]
        }
        let raw = try XCTUnwrap(ProcessInfo.processInfo.environment["SIDESEAT_PLAN_CONTACTS_JSON"])
        let f = try JSONDecoder().decode(Fixture.self, from: Data(raw.utf8))
        let peer = try XCTUnwrap(f.accounts.first { $0.role == "participant" })
        let app = XCUIApplication(bundleIdentifier: f.bundle)
        app.launchArguments = ["--ui-testing-signed-out", "--ui-testing-ephemeral-credentials", "--ui-testing-skip-tutorial",
            "--ui-testing-language=zh-Hans", "--ui-testing-appearance=light"]
        app.launch(); defer { app.terminate() }
        let username = app.textFields["login-identifier"]
        XCTAssertTrue(username.waitForExistence(timeout: 20)); username.tap(); username.typeText(peer.identifier)
        let password = app.secureTextFields["login-password"]
        password.tap(); password.typeText(peer.password); app.buttons["login-submit"].tap()
        XCTAssertTrue(app.tabBars.firstMatch.waitForExistence(timeout: 30))
        app.tabBars.buttons["计划"].tap(); app.buttons["plans-tab-upcoming"].tap()
        let card = app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH 'plans-coordinated-' AND label CONTAINS %@", f.title)).firstMatch
        XCTAssertTrue(card.waitForExistence(timeout: 20)); card.tap()
        let calendar = app.buttons["plan-view-calendar"]
        XCTAssertTrue(calendar.waitForExistence(timeout: 20)); calendar.tap()
        XCTAssertTrue(app.tabBars.buttons["日历"].isSelected); app.buttons["calendar-search"].tap()
        let search = app.searchFields.firstMatch
        XCTAssertTrue(search.waitForExistence(timeout: 10)); search.tap(); search.typeText(f.title)
        let result = app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH 'calendar-search-result-' AND label CONTAINS %@", f.title)).firstMatch
        XCTAssertTrue(result.waitForExistence(timeout: 20))
        print("NATIVE_PARTICIPANT_PHASE contacts-calendar-verified"); Thread.sleep(forTimeInterval: 3)
        let shot = XCTAttachment(screenshot: app.screenshot())
        shot.name = "publish184-real-participant-calendar"; shot.lifetime = .keepAlways; add(shot)
    }

}
