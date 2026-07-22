import XCTest

@MainActor
final class CalendarLiveUITests: XCTestCase {
    override func setUpWithError() throws {
        continueAfterFailure = false
        try XCTSkipUnless(
            ProcessInfo.processInfo.environment["SIDESEAT_LIVE_UI_TESTS"] == "1",
            "Set SIDESEAT_LIVE_UI_TESTS=1 and point the Development build at an isolated local API."
        )
    }

    func testLoginCreateEventAndSeeItOnHome() {
        let username = ProcessInfo.processInfo.environment["E2E_USER"] ?? "test_001"
        let password = ProcessInfo.processInfo.environment["E2E_PASSWORD"] ?? "Password123"
        let title = "Native live event \(Int(Date().timeIntervalSince1970))"
        let app = XCUIApplication()
        app.launchArguments = [
            "--ui-testing-signed-out",
            "--ui-testing-ephemeral-credentials",
        ]
        app.launch()

        let identifier = app.textFields["login-identifier"]
        XCTAssertTrue(identifier.waitForExistence(timeout: 5))
        identifier.tap()
        identifier.typeText(username)
        let passwordField = app.secureTextFields["login-password"]
        passwordField.tap()
        passwordField.typeText(password)
        app.buttons["login-submit"].tap()

        let addEvent = app.buttons["new-event"]
        if !addEvent.waitForExistence(timeout: 10) {
            let addMenu = app.buttons["calendar-add-menu"]
            XCTAssertTrue(addMenu.waitForExistence(timeout: 3))
            addMenu.tap()
            XCTAssertTrue(addEvent.waitForExistence(timeout: 3))
        }
        addEvent.tap()

        let titleField = app.textFields["event-title"]
        XCTAssertTrue(titleField.waitForExistence(timeout: 3))
        titleField.tap()
        titleField.typeText(title)
        let save = app.buttons["event-save"]
        XCTAssertTrue(save.isEnabled)
        save.tap()

        XCTAssertTrue(titleField.waitForNonExistence(timeout: 10))
        XCTAssertTrue(app.staticTexts[title].waitForExistence(timeout: 10))

        let dayMode = app.buttons.matching(
            NSPredicate(format: "label IN %@", ["Day", "日视图"])
        ).firstMatch
        XCTAssertTrue(dayMode.waitForExistence(timeout: 3))
        dayMode.tap()

        let timeline = app.descendants(matching: .any)["calendar-day-timeline"]
        XCTAssertTrue(timeline.waitForExistence(timeout: 3))
        let sourceEvent = app.buttons[title]
        XCTAssertTrue(sourceEvent.waitForExistence(timeout: 5))
        sourceEvent.press(forDuration: 1.2)

        let move = app.buttons.matching(
            NSPredicate(
                format: "identifier == %@ OR label IN %@",
                "calendar-event-context-move",
                ["Move event", "移动日程"]
            )
        ).firstMatch
        XCTAssertTrue(move.waitForExistence(timeout: 3))
        move.tap()

        let moveTarget = app.buttons["calendar-move-target-180"]
        XCTAssertTrue(moveTarget.waitForExistence(timeout: 3))
        XCTAssertTrue(moveTarget.isHittable)
        moveTarget.tap()
        let confirmMove = app.buttons.matching(identifier: "calendar-move-confirm").firstMatch
        XCTAssertTrue(confirmMove.waitForExistence(timeout: 3))
        confirmMove.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)).tap()
        XCTAssertTrue(app.descendants(matching: .any)["calendar-move-banner"].waitForNonExistence(timeout: 10))

        let movedEvent = app.buttons[title]
        XCTAssertTrue(movedEvent.waitForExistence(timeout: 10))
        XCTAssertTrue(
            (movedEvent.value as? String)?.contains("3:00") == true,
            "Expected moved event value to contain 3:00, got \(String(describing: movedEvent.value))"
        )
        movedEvent.press(forDuration: 1.2)

        let copy = app.buttons.matching(
            NSPredicate(format: "label IN %@", ["Copy", "复制"])
        ).firstMatch
        XCTAssertTrue(copy.waitForExistence(timeout: 3))
        copy.tap()

        let paste = tryOpenPasteAction(in: app, timeline: timeline)
        XCTAssertNotNil(paste)
        guard let paste else { return }
        paste.tap()
        XCTAssertTrue(app.buttons.matching(NSPredicate(format: "label == %@", title)).element(boundBy: 1).waitForExistence(timeout: 10))
    }

    func testCreateAndDeleteCustomCalendar() {
        let username = ProcessInfo.processInfo.environment["E2E_USER"] ?? "test_001"
        let password = ProcessInfo.processInfo.environment["E2E_PASSWORD"] ?? "Password123"
        let name = "Native live calendar \(Int(Date().timeIntervalSince1970))"
        let app = XCUIApplication()
        app.launchArguments = [
            "--ui-testing-signed-out",
            "--ui-testing-ephemeral-credentials",
        ]
        app.launch()

        let identifier = app.textFields["login-identifier"]
        XCTAssertTrue(identifier.waitForExistence(timeout: 5))
        identifier.tap()
        identifier.typeText(username)
        let passwordField = app.secureTextFields["login-password"]
        passwordField.tap()
        passwordField.typeText(password)
        app.buttons["login-submit"].tap()

        let calendars = app.buttons["manage-calendars"]
        XCTAssertTrue(calendars.waitForExistence(timeout: 10))
        calendars.tap()
        XCTAssertTrue(app.descendants(matching: .any)["calendar-list"].waitForExistence(timeout: 3))
        app.buttons["calendar-add"].tap()

        let nameField = app.textFields["calendar-name"]
        XCTAssertTrue(nameField.waitForExistence(timeout: 3))
        nameField.tap()
        nameField.typeText(name)
        app.buttons["calendar-save"].tap()

        let created = app.staticTexts[name]
        XCTAssertTrue(created.waitForExistence(timeout: 10))
        created.tap()
        let delete = app.buttons["calendar-delete"]
        XCTAssertTrue(delete.waitForExistence(timeout: 3))
        delete.tap()
        let confirmDelete = app.buttons.matching(identifier: "calendar-delete-confirm").firstMatch
        XCTAssertTrue(confirmDelete.waitForExistence(timeout: 3))
        confirmDelete.tap()
        XCTAssertFalse(created.waitForExistence(timeout: 5))
    }

    private func tryOpenPasteAction(in app: XCUIApplication, timeline: XCUIElement) -> XCUIElement? {
        let startIndex = Int(Date().timeIntervalSince1970 / 60) % 48
        for offset in 0..<16 {
            let minute = ((startIndex + offset * 3) % 48) * 30
            let slot = app.descendants(matching: .any)["calendar-slot-\(minute)"]
            guard slot.waitForExistence(timeout: 1) else { continue }
            scrollToHittable(slot, in: timeline)
            guard slot.isHittable else { continue }
            slot.press(forDuration: 1.2)

            let paste = app.buttons["calendar-slot-context-paste-event"]
            if paste.waitForExistence(timeout: 1) {
                return paste
            }
            app.coordinate(withNormalizedOffset: CGVector(dx: 0.95, dy: 0.14)).tap()
        }
        return nil
    }

    private func scrollToHittable(_ element: XCUIElement, in scrollView: XCUIElement) {
        for _ in 0..<8 where !element.isHittable {
            if element.frame.midY < scrollView.frame.midY {
                scrollView.swipeDown()
            } else {
                scrollView.swipeUp()
            }
        }
    }
}
