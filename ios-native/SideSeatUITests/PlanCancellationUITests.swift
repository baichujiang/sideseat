import XCTest

final class PlanCancellationUITests: XCTestCase {
    @MainActor
    func testLateCancellationAndFindNewCompany() throws {
        let app = XCUIApplication()
        app.launchArguments = ["--ui-testing-authenticated", "--ui-testing-skip-tutorial", "--ui-testing-chats", "--ui-testing-cached-chat-refresh", "--ui-testing-plan-cancel", "--ui-testing-language=zh-Hans"]
        app.launch()
        let plans = app.buttons["计划"].firstMatch
        XCTAssertTrue(plans.waitForExistence(timeout: 10)); plans.tap()
        let row = app.buttons["plans-row-ui-plan-1"]
        XCTAssertTrue(row.waitForExistence(timeout: 5)); row.tap()
        let menu = app.buttons["plan-options-ui-plan-1"]
        XCTAssertTrue(menu.waitForExistence(timeout: 8)); menu.tap()
        app.buttons["取消计划"].tap()
        let confirm = app.buttons["plan-cancel-confirm"]
        XCTAssertTrue(confirm.waitForExistence(timeout: 5)); XCTAssertFalse(confirm.isEnabled)
        XCTAssertTrue(app.staticTexts["距离开始不足 2 小时，对方可能已在准备或路上。请选择取消原因。"].exists)
        attach(app, "late-cancellation-confirmation")
        app.buttons["plan-cancel-reason"].tap()
        app.buttons["身体不适"].tap()
        XCTAssertTrue(confirm.isEnabled); confirm.tap()
        let find = app.buttons["plan-find-company"].firstMatch
        XCTAssertTrue(find.waitForExistence(timeout: 5))
        XCTAssertFalse(app.buttons["plan-options-ui-plan-1"].exists)
        attach(app, "canceled-plan-chat")
        find.tap()
        XCTAssertTrue(app.navigationBars["添加意愿"].waitForExistence(timeout: 8))
        XCTAssertTrue(app.textFields.containing(NSPredicate(format: "value == %@", "图书馆自习")).firstMatch.exists)
        attach(app, "new-intention-from-canceled-plan")
    }

    @MainActor
    func testCancellationPopupAcknowledgedAcrossRelaunch() throws {
        let app = XCUIApplication()
        let args = ["--ui-testing-authenticated", "--ui-testing-skip-tutorial", "--ui-testing-chats", "--ui-testing-cancellation-notice", "--ui-testing-language=zh-Hans"]
        app.launchArguments = args + ["--ui-testing-reset-cancellation-ack"]
        app.launch()
        let popup = app.alerts["计划变更"]
        XCTAssertTrue(popup.waitForExistence(timeout: 10))
        XCTAssertTrue(popup.staticTexts.containing(NSPredicate(format: "label CONTAINS %@", "米娜")).firstMatch.exists)
        attach(app, "cancellation-notification")
        popup.buttons["知道了"].tap()
        XCTAssertFalse(popup.exists)
        app.terminate()
        app.launchArguments = args
        app.launch()
        XCTAssertTrue(app.buttons["计划"].firstMatch.waitForExistence(timeout: 8))
        XCTAssertFalse(popup.waitForExistence(timeout: 3))
    }

    @MainActor
    func testNoticeOpensCanceledPlanInChat() throws {
        let app = XCUIApplication()
        app.launchArguments = ["--ui-testing-authenticated", "--ui-testing-skip-tutorial", "--ui-testing-chats", "--ui-testing-cancellation-notice", "--ui-testing-reset-cancellation-ack", "--ui-testing-language=zh-Hans"]
        app.launch()
        let popup = app.alerts["计划变更"]
        XCTAssertTrue(popup.waitForExistence(timeout: 10))
        popup.buttons["查看详情"].tap()
        XCTAssertTrue(app.buttons["plan-find-company"].firstMatch.waitForExistence(timeout: 8))
        XCTAssertFalse(popup.exists)
        attach(app, "notification-opens-canceled-plan")
    }

    @MainActor private func attach(_ app: XCUIApplication, _ name: String) {
        let attachment = XCTAttachment(screenshot: app.screenshot())
        attachment.name = name; attachment.lifetime = .keepAlways; add(attachment)
    }
}
