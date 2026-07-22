import XCTest

@MainActor
final class CoursesLiveUITests: XCTestCase {
    override func setUpWithError() throws {
        continueAfterFailure = false
        let environment = ProcessInfo.processInfo.environment
        try XCTSkipUnless(
            environment["SIDESEAT_LIVE_UI_TESTS"] == "1"
                && !(environment["E2E_COURSE_ID"] ?? "").isEmpty
                && !(environment["E2E_COURSE_NAME"] ?? "").isEmpty,
            "Set SIDESEAT_LIVE_UI_TESTS=1, E2E_COURSE_ID and E2E_COURSE_NAME against an isolated local API."
        )
    }

    func testSearchSaveJoinAndApplyOfficialTimetable() {
        let environment = ProcessInfo.processInfo.environment
        let username = environment["E2E_USER"] ?? "test_001"
        let password = environment["E2E_PASSWORD"] ?? "Password123"
        let courseID = environment["E2E_COURSE_ID"]!
        let courseName = environment["E2E_COURSE_NAME"]!
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

        let courses = app.buttons["open-courses"]
        XCTAssertTrue(courses.waitForExistence(timeout: 10))
        courses.tap()

        let search = app.searchFields.firstMatch
        XCTAssertTrue(search.waitForExistence(timeout: 5))
        search.tap()
        search.typeText(courseName)

        let row = app.descendants(matching: .any)["course-row-\(courseID)"]
        XCTAssertTrue(row.waitForExistence(timeout: 10))
        row.tap()

        let save = app.buttons["course-save"]
        XCTAssertTrue(save.waitForExistence(timeout: 5))
        save.tap()
        XCTAssertTrue(app.buttons["course-save"].waitForExistence(timeout: 5))

        app.buttons["course-join"].tap()
        XCTAssertTrue(app.buttons["course-leave"].waitForExistence(timeout: 10))

        let timetable = app.buttons.matching(
            NSPredicate(format: "identifier BEGINSWITH 'course-use-schedule-'")
        ).firstMatch
        XCTAssertTrue(timetable.waitForExistence(timeout: 5))
        timetable.tap()

        app.navigationBars.buttons.firstMatch.tap()
        app.navigationBars.buttons.firstMatch.tap()
        XCTAssertTrue(app.staticTexts[courseName].waitForExistence(timeout: 10))
    }
}
