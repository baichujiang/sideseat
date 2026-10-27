import XCTest
import Darwin

/// Real production API and fresh owned actors on the default physical iPhone.
@MainActor final class FiveRootMessagesRemarkPhoneUITests: XCTestCase {
    private struct Account: Decodable { let role: String; let id: String; let identifier: String; let password: String; let displayName: String }
    private struct Seed: Decodable {
        let schemaVersion: Int; let runID: String; let preparedAt: String; let connectionID: String
        let seedOwnerMessageID: String; let seedPeerMessageID: String; let seedOwnerText: String; let seedPeerText: String; let remark: String
    }
    private struct Fixture: Decodable {
        let kind: String; let schemaVersion: Int; let runID: String; let baseURL: String; let bundle: String
        let accounts: [Account]; let messagesRemark: Seed
    }
    private var fixture: Fixture!, app: XCUIApplication!
    private var activeRole: String!
    private var row: XCUIElement { app.buttons["inbox-row-\(fixture.messagesRemark.connectionID)"] }
    private var field: XCUIElement { app.textFields["direct-remark-field"] }
    private func element(_ id: String) -> XCUIElement { app.descendants(matching: .any).matching(identifier: id).firstMatch }
    override func setUpWithError() throws {
        continueAfterFailure = false
        try XCTSkipUnless(ProcessInfo.processInfo.environment["SIDESEAT_MESSAGES_REMARK_EXECUTE"] == "1", "Require the explicit fresh physical remark cohort.")
    }
    override func tearDown() async throws { await MainActor.run { app?.terminate() } }

    func testPrivateRemarkSaveClearAndBothAccountsRelogin() throws {
        try loadFixture(); try login("owner"); try openRemark()
        try require(isEmpty(), "A fresh owner's private remark is empty.")
        try capture("01-empty-private-remark"); try phase("baseline")
        try replace(fixture.messagesRemark.remark); try save(expectedRemark: fixture.messagesRemark.remark)
        try capture("02-owner-remark-saved"); try phase("remark-saved")
        try login("owner"); try openRemark(expectedInboxRemark: fixture.messagesRemark.remark)
        try require(field.value as? String == fixture.messagesRemark.remark, "Owner relogin must restore the full private remark.")
        try capture("03-owner-remark-reloaded"); try phase("owner-reloaded")
        try login("peer"); try openRemark()
        try require(isEmpty(), "The peer must not inherit the owner's private remark.")
        try capture("04-peer-remark-isolated"); try phase("peer-isolated")
        try login("owner"); try openRemark(expectedInboxRemark: fixture.messagesRemark.remark)
        try require(field.value as? String == fixture.messagesRemark.remark, "Clear only the exact saved owned remark.")
        try replace(""); try capture("05-cleared-field-before-save"); try save(expectedRemark: nil)
        try capture("06-clear-saved-and-returned-to-chat-info"); try phase("remark-cleared")
        try login("owner"); try openRemark()
        try require(isEmpty(), "The cleared remark must stay empty after owner relogin.")
        try capture("07-owner-clear-persisted"); try phase("owner-clear-reloaded")
        try login("peer"); try openRemark()
        try require(isEmpty(), "Clearing the owner's remark must preserve the peer's independent empty state.")
        try capture("08-peer-still-isolated"); try phase("peer-still-isolated"); try phase("complete")
    }
    private func loadFixture() throws {
        try require(ProcessInfo.processInfo.environment["SIMULATOR_UDID"] == nil, "Use only the explicitly verified default physical iPhone.")
        let raw = ProcessInfo.processInfo.environment["SIDESEAT_MESSAGES_REMARK_FIXTURE_JSON"] ?? ""
        try require(raw.hasPrefix("{"), "Inject the exact private owned fixture.")
        fixture = try JSONDecoder().decode(Fixture.self, from: Data(raw.utf8))
        try require(fixture.kind == "five-roots-live" && fixture.schemaVersion == 1 && fixture.baseURL == "https://api.sideseat.de"
                    && fixture.bundle == "app.sideseat.mobile.preview", "This focused physical case uses the production API and Preview only.")
        try require(fixture.runID.range(of: "^[a-f0-9]{12}$", options: .regularExpression) != nil && fixture.accounts.count == 2
                    && Set(fixture.accounts.map(\.role)) == ["owner", "peer"] && Set(fixture.accounts.map(\.id)).count == 2
                    && fixture.accounts.allSatisfy { $0.identifier == "e2e_roots_\($0.role)_\(fixture.runID)" }, "Only two fresh owned internal actors are allowed.")
        let m = fixture.messagesRemark
        try require(m.schemaVersion == 1 && m.runID == fixture.runID && !m.preparedAt.isEmpty
                    && [m.connectionID, m.seedOwnerMessageID, m.seedPeerMessageID].allSatisfy { $0.range(of: "^c[a-z0-9]{20,32}$", options: .regularExpression) != nil }
                    && m.seedOwnerMessageID != m.seedPeerMessageID && m.seedOwnerText == "Remark " + fixture.runID + " seed owner"
                    && m.seedPeerText == "Remark " + fixture.runID + " seed peer" && m.remark == "QA friend " + fixture.runID
                    && m.remark.count == 22 && m.remark.unicodeScalars.allSatisfy(\.isASCII), "Validate the exact two TEXT seeds and fully visible ASCII remark.")
    }
    private func login(_ role: String) throws {
        let account = try XCTUnwrap(fixture.accounts.first { $0.role == role })
        activeRole = role
        app?.terminate(); app = XCUIApplication(bundleIdentifier: fixture.bundle)
        app.launchArguments = ["--ui-testing-signed-out", "--ui-testing-ephemeral-credentials", "--ui-testing-skip-tutorial",
            "--ui-testing-language=zh-Hans", "--ui-testing-appearance=light", "-UIPreferredContentSizeCategoryName", "UICTContentSizeCategoryL"]
        app.launchEnvironment = [:]; app.launch()
        let name = app.textFields["login-identifier"], password = app.secureTextFields["login-password"]
        try require(name.waitForExistence(timeout: 25), "Use the actual physical login form.")
        name.tap(); name.typeText(account.identifier); password.tap(); password.typeText(account.password); app.buttons["login-submit"].tap()
        try require(waitUntil(timeout: 35) { self.app.state == .runningForeground && !name.exists && !password.exists
            && self.app.tabBars.firstMatch.exists && self.app.tabBars.firstMatch.buttons.count == 5 }, "The owned actor must reach the actual five-tab shell.")
    }
    private func openRemark(expectedInboxRemark: String? = nil) throws {
        let tab = app.tabBars.buttons.element(boundBy: 3)
        try require(tab.label == "消息", "Use the current Messages root."); try tap(tab)
        try require(app.buttons["inbox-notifications"].waitForExistence(timeout: 20) && row.waitForExistence(timeout: 20), "Load the exact owned live conversation.")
        let peer = try XCTUnwrap(fixture.accounts.first { $0.role != activeRole })
        if let expectedInboxRemark { try require(row.label.contains(expectedInboxRemark), "The owner's persisted private name must appear in the inbox.") }
        else { try require(row.label.contains(peer.displayName) && !row.label.contains(fixture.messagesRemark.remark), "This account must show its original peer name.") }
        try tap(row); try require(element("direct-chat").waitForExistence(timeout: 20)
            && app.staticTexts[fixture.messagesRemark.seedPeerText].firstMatch.waitForExistence(timeout: 15), "Open the actual seeded history.")
        try tap(app.buttons["direct-chat-actions"]); try require(element("direct-chat-info").waitForExistence(timeout: 15), "Open actual chat info.")
        try tap(element("direct-info-remark")); try require(field.waitForExistence(timeout: 15), "Open the actual single-line remark editor.")
    }
    private func save(expectedRemark: String?) throws {
        try tap(app.buttons["direct-remark-save"], minimumHeight: 35.99)
        try require(element("direct-chat-info").waitForExistence(timeout: 20) && !field.exists, "A successful save must leave the editor and return to chat info.")
        let label = element("direct-info-remark").label
        try require(expectedRemark.map { label.contains($0) } ?? !label.contains(fixture.messagesRemark.remark), "The info row must reflect the exact saved or cleared remark.")
        try verifyImmediateNames(expectedRemark: expectedRemark)
    }
    private func verifyImmediateNames(expectedRemark: String?) throws {
        try require(activeRole == "owner", "Only the owner changes this fixture's private remark.")
        let peer = try XCTUnwrap(fixture.accounts.first { $0.role == "peer" })
        let name = expectedRemark ?? peer.displayName
        let excluded = expectedRemark == nil ? fixture.messagesRemark.remark : nil
        let state = expectedRemark == nil ? "cleared" : "saved"
        try requireNameButton("direct-info-participant-context", name: name, excluding: excluded)
        try capture("immediate-\(state)-info-header-name")
        try back()
        try require(element("direct-chat").waitForExistence(timeout: 15), "Return directly to the same chat without relogin.")
        try requireNameButton("direct-chat-title", name: name, excluding: excluded)
        try capture("immediate-\(state)-chat-toolbar-name")
        try back()
        try require(waitUntil { self.app.buttons["inbox-notifications"].isHittable }, "Return to the actual loaded inbox without relogin.")
        try requireNameButton("inbox-row-\(fixture.messagesRemark.connectionID)", name: name, excluding: excluded)
        try capture("immediate-\(state)-inbox-row-name")
        try tap(row)
        try require(element("direct-chat").waitForExistence(timeout: 15)
            && app.staticTexts[fixture.messagesRemark.seedPeerText].firstMatch.waitForExistence(timeout: 15), "Reopen the same exact connection and original seeded history.")
        try requireNameButton("direct-chat-title", name: name, excluding: excluded)
        try tap(app.buttons["direct-chat-actions"])
        try require(element("direct-chat-info").waitForExistence(timeout: 15), "Return to chat info before continuing the original relogin flow.")
        try requireNameButton("direct-info-participant-context", name: name, excluding: excluded)
    }
    private func requireNameButton(_ id: String, name: String, excluding oldName: String?) throws {
        let matches = app.buttons.matching(identifier: id)
        try require(matches.firstMatch.waitForExistence(timeout: 15) && matches.count == 1, "Verify exactly one Button for the intended name surface.")
        let button = matches.element(boundBy: 0)
        try require(waitUntil { button.isHittable && button.label.contains(name)
            && (oldName.map { !button.label.contains($0) } ?? true) }, "The precise header, toolbar or inbox row must immediately show its current private name.")
    }
    private func isEmpty() -> Bool { let value = field.value as? String ?? ""; return value.isEmpty || value == field.placeholderValue }
    private func replace(_ text: String) throws {
        try tap(field, minimumHeight: nil)
        if !isEmpty() {
            let old = field.value as? String ?? ""
            try require(old == fixture.messagesRemark.remark, "Delete only the known fully visible ASCII fixture remark.")
            field.coordinate(withNormalizedOffset: CGVector(dx: 1, dy: 0.5)).withOffset(CGVector(dx: -8, dy: 0)).tap()
            field.typeText(String(repeating: XCUIKeyboardKey.delete.rawValue, count: old.count))
            try require(waitUntil(timeout: 2) { self.field.exists && self.isEmpty() }, "Public end-caret deletion must clear the complete single-line field.")
        }
        try require(field.exists && isEmpty(), "Clear the exact previous text before typing.")
        if !text.isEmpty { field.typeText(text); try require(field.value as? String == text, "The editor must contain the full intended remark.") }
    }
    private func back() throws { try tap(app.navigationBars.buttons.element(boundBy: 0), minimumHeight: 35.99) }
    private func tap(_ item: XCUIElement, minimumHeight: CGFloat? = 43.99) throws {
        try require(item.waitForExistence(timeout: 15) && item.isHittable && item.isEnabled, "Reach the real enabled control before tapping.")
        if let minimumHeight { try require(item.frame.height >= minimumHeight, "Keep the actual touch target intact.") }; item.tap()
    }
    private func waitUntil(timeout: TimeInterval = 30, _ condition: () -> Bool) -> Bool {
        let until = Date().addingTimeInterval(timeout)
        repeat { if condition() { return true }; RunLoop.current.run(until: Date().addingTimeInterval(0.2)) } while Date() < until
        return condition()
    }
    private func require(_ condition: Bool, _ message: String) throws {
        guard condition else {
            if let app, app.state == .runningForeground, !app.textFields["login-identifier"].exists, !app.secureTextFields.firstMatch.exists {
                let tree = XCTAttachment(string: app.debugDescription); tree.name = "remark-phone-private-failure-AX"; tree.lifetime = .keepAlways; add(tree)
                try capture("remark-phone-private-failure-screen")
            }
            XCTFail(message); throw NSError(domain: "FiveRootMessagesRemarkPhone", code: 1, userInfo: [NSLocalizedDescriptionKey: message])
        }
    }
    private func capture(_ name: String) throws {
        let attachment = XCTAttachment(screenshot: app.screenshot()); attachment.name = name; attachment.lifetime = .keepAlways; add(attachment)
    }
    private func phase(_ name: String) throws { print("MESSAGES_REMARK_PHASE \(name)"); fflush(stdout); try FiveRootQAReadBarrier.wait(for: name) }
}
