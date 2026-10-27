import XCTest
import UIKit
import Darwin

/// Real owned-account subscription lifecycle. External Calendar/Files are only
/// cancelled or left; no subscription, user calendar, file import or save occurs.
@MainActor final class FiveRootCalendarConnectionsPhoneUITests: XCTestCase {
    private struct Account: Decodable { let role, id, identifier, password: String }
    private struct Fixture: Decodable {
        let kind, runID, baseURL, bundle: String
        let schemaVersion: Int
        let accounts: [Account]
    }
    private var fixture: Fixture!
    private var app: XCUIApplication!
    private var connectionID: String!
    private var subscriptionURL: URL!
    private var externalOutcome = "not-opened"
    private var berlin: Calendar {
        var c = Calendar(identifier: .gregorian)
        c.timeZone = TimeZone(identifier: "Europe/Berlin")!
        return c
    }
    private func element(_ id: String) -> XCUIElement {
        app.descendants(matching: .any).matching(identifier: id).firstMatch
    }
    private var connections: XCUIElement { app.scrollViews["calendar-connections"].firstMatch }
    private let cancelLabels = ["取消", "Cancel", "Abbrechen"]

    override func setUpWithError() throws {
        continueAfterFailure = false
        try XCTSkipUnless(ProcessInfo.processInfo.environment["SIDESEAT_CALENDAR_CONNECTIONS_EXECUTE"] == "1",
                          "Prepare only until root authorizes the dedicated Calendar connections case.")
    }
    override func tearDown() async throws { await MainActor.run { app?.terminate() } }
    private func loadFixture() throws {
        try require(ProcessInfo.processInfo.environment["SIMULATOR_UDID"] == nil, "Use the default physical iPhone14Plus.")
        let raw = ProcessInfo.processInfo.environment["SIDESEAT_CALENDAR_CONNECTIONS_FIXTURE_JSON"] ?? ""
        try require(raw.hasPrefix("{"), "Embed only the fresh dedicated owned fixture.")
        fixture = try JSONDecoder().decode(Fixture.self, from: Data(raw.utf8))
        try require(fixture.kind == "five-roots-live" && fixture.schemaVersion == 1
                    && fixture.baseURL == "https://api.sideseat.de" && fixture.bundle == "app.sideseat.mobile.preview",
                    "Use the owned production Preview contract.")
        try require(fixture.runID.range(of: "^[a-f0-9]{12}$", options: .regularExpression) != nil
                    && fixture.accounts.count == 2 && Set(fixture.accounts.map(\.role)) == ["owner", "peer"]
                    && Set(fixture.accounts.map(\.id)).count == 2
                    && fixture.accounts.allSatisfy { $0.identifier == "e2e_roots_\($0.role)_\(fixture.runID)" && $0.password.count >= 24 },
                    "Only two distinct disposable identities from this run may be used.")
    }

    func testOwnedSubscriptionLifecycleAndTransferCancellationBoundaries() throws {
        try loadFixture()
        let day = berlin.startOfDay(for: Date())
        let lower = try XCTUnwrap(berlin.date(byAdding: .day, value: -1, to: day))
        let upper = try XCTUnwrap(berlin.date(byAdding: .day, value: 118, to: day))
        let year = berlin.component(.year, from: day)
        print("CALENDAR_CONNECTIONS_EXPECTED_WINDOW \(lower.ISO8601Format()) \(upper.ISO8601Format()) \(year)")
        fflush(stdout)
        try loginOwner()
        try phase("signed-in")
        try openConnections()
        capture("01-empty-owned-connections")
        try phase("connections-opened")

        try reveal(app.buttons["calendar-import"])
        try tap(app.buttons["calendar-import"])
        let importCancelled = cancelOnlyFilePicker()
        if !importCancelled { app.terminate(); try loginOwner(); try openConnections() }
        try require(importCancelled, "The system import picker must cancel without choosing or reading any file.")
        try dismissTransferNoticeIfPresent()
        try phase("import-cancelled")

        try reveal(app.buttons["calendar-export"])
        try tap(app.buttons["calendar-export"])
        let yearSheet = element("calendar-export-year-sheet")
        try require(yearSheet.waitForExistence(timeout: 12), "Open the actual year-selection sheet.")
        try require(element("calendar-export-year-picker").value as? String == String(year), "Export defaults to the Berlin Gregorian year.")
        try tap(app.buttons["calendar-export-year-increment"])
        try require(element("calendar-export-year-picker").value as? String == String(year + 1), "The real year stepper must advance.")
        try tap(app.buttons["calendar-export-year-decrement"])
        try require(element("calendar-export-year-picker").value as? String == String(year), "Return to the same owned export year.")
        capture("02-export-year-cancel")
        try tap(app.buttons["calendar-export-cancel"])
        try require(yearSheet.waitForNonExistence(timeout: 12) && connections.isHittable, "Cancel the year selection back to connections.")
        try phase("export-year-cancelled")

        try tap(app.buttons["calendar-export"])
        try require(yearSheet.waitForExistence(timeout: 12), "Reopen the same export selection.")
        try require(element("calendar-export-year-picker").value as? String == String(year), "Reopened year must retain the selected value.")
        try tap(app.buttons["calendar-export-confirm"])
        let exportCancelled = cancelOnlyFilePicker()
        if !exportCancelled { app.terminate(); try loginOwner(); try openConnections() }
        try require(exportCancelled, "The system export picker must cancel without saving into ordinary Files.")
        try dismissTransferNoticeIfPresent()
        try phase("export-save-cancelled")

        try reveal(app.buttons["calendar-connection-add-apple"])
        try tap(app.buttons["calendar-connection-add-apple"])
        handleExternalCalendarWithoutSubscribing()
        try require(app.wait(for: .runningForeground, timeout: 15), "Return to Preview before reading or capturing any content.")
        try require(connections.waitForExistence(timeout: 20), "The connection view must remain after the external boundary.")
        try dismissConnectionNoticeIfPresent()
        let revoke = app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH 'calendar-connection-revoke-' AND identifier != 'calendar-connection-revoke-cancel' AND identifier != 'calendar-connection-revoke-confirm'")).firstMatch
        try reveal(revoke)
        try require(revoke.exists, "Only one newly created owned connection must appear.")
        connectionID = String(revoke.identifier.dropFirst("calendar-connection-revoke-".count))
        try require(!connectionID.isEmpty, "Read the actual created connection identity.")
        try reveal(app.buttons["calendar-connection-copy-link"])
        // Replace the clipboard with a harmless run marker first. A failed Copy
        // action must never submit an earlier ordinary subscription URL.
        UIPasteboard.general.string = "SideSeat QA Connections \(fixture.runID)"
        try tap(app.buttons["calendar-connection-copy-link"])
        try dismissConnectionNoticeIfPresent()
        capture("03-created-owned-connection")
        try tap(app.navigationBars.buttons.matching(NSPredicate(format: "label IN %@", ["完成", "Done", "Fertig"])).firstMatch)
        try require(connections.waitForNonExistence(timeout: 10) && app.buttons["calendar-search"].isHittable,
                    "Close connections before opening the temporary local paste draft.")
        let copied = try copiedTextThroughCancelledDraft()
        let url = try XCTUnwrap(URL(string: copied))
        try require(url.scheme == "https" && ["www.sideseat.de", "sideseat.de", "api.sideseat.de"].contains(url.host ?? "")
                    && url.path.range(of: "^/api/public/calendar-subscriptions/[A-Za-z0-9_-]{43}\\.ics$", options: .regularExpression) != nil
                    && url.query == nil && url.fragment == nil && url.user == nil && url.password == nil,
                    "Copy only the private subscription URL created through this owned UI.")
        subscriptionURL = url
        print("CALENDAR_CONNECTIONS_OWNED_ID \(connectionID!)")
        print("CALENDAR_CONNECTIONS_OWNED_URL \(url.absoluteString)")
        print("CALENDAR_CONNECTIONS_EXTERNAL_OUTCOME \(externalOutcome)"); fflush(stdout)
        try openConnections()
        try reveal(app.buttons["calendar-connection-revoke-\(connectionID!)"])
        try require(app.buttons["calendar-connection-revoke-\(connectionID!)"].isHittable,
                    "Return to the same owned connection without recreating its identity or private URL.")
        try phase("connection-created")

        app.terminate(); try loginOwner(); try openConnections()
        try reveal(app.buttons["calendar-connection-revoke-\(connectionID!)"])
        try require(app.buttons["calendar-connection-revoke-\(connectionID!)"].isHittable,
                    "The same connection identity must persist after a real fresh login.")
        try require(!app.buttons["calendar-connection-copy-link"].exists,
                    "The private URL is only shown after creation; list reload must not regenerate a token.")
        capture("04-owned-connection-after-login")
        try phase("connection-relaunched")

        try tap(app.buttons["calendar-connection-revoke-\(connectionID!)"])
        try require(element("calendar-connection-revoke-prompt").waitForExistence(timeout: 10), "Open the owned revoke confirmation.")
        capture("05-revoke-cancel")
        try tapVisibleRevokeAction("calendar-connection-revoke-cancel")
        try require(app.buttons["calendar-connection-revoke-\(connectionID!)"].exists,
                    "Cancel must keep the same active connection.")
        try phase("revoke-cancelled")
        try tap(app.buttons["calendar-connection-revoke-\(connectionID!)"])
        try tapVisibleRevokeAction("calendar-connection-revoke-confirm")
        try require(app.buttons["calendar-connection-revoke-\(connectionID!)"].waitForNonExistence(timeout: 25),
                    "Confirm must remove only this owned active connection.")
        capture("06-revoked-owned-connection")
        try phase("connection-revoked")
        app.terminate(); try loginOwner(); try openConnections()
        try require(!app.buttons["calendar-connection-revoke-\(connectionID!)"].exists,
                    "The revoked connection must remain absent after fresh login.")
        try phase("revoked-relaunched")
        try tap(app.navigationBars.buttons.matching(NSPredicate(format: "label IN %@", ["完成", "Done", "Fertig"])).firstMatch)
        try require(app.buttons["calendar-search"].isHittable, "Finish back at the actual Calendar root.")
    }

    private func loginOwner() throws {
        let owner = try XCTUnwrap(fixture.accounts.first { $0.role == "owner" })
        app = XCUIApplication(bundleIdentifier: fixture.bundle)
        app.launchArguments = ["--ui-testing-signed-out", "--ui-testing-ephemeral-credentials", "--ui-testing-skip-tutorial",
            "--ui-testing-language=zh-Hans", "--ui-testing-appearance=light", "-UIPreferredContentSizeCategoryName", "UICTContentSizeCategoryL"]
        app.launchEnvironment = [:]; app.launch()
        let identifier = app.textFields["login-identifier"]
        try require(identifier.waitForExistence(timeout: 25), "Use the actual signed-out login form.")
        identifier.tap(); identifier.typeText(owner.identifier)
        app.secureTextFields["login-password"].tap(); app.secureTextFields["login-password"].typeText(owner.password)
        app.buttons["login-submit"].tap()
        let loginDeadline = Date().addingTimeInterval(35)
        var shellReady = false
        while Date() < loginDeadline {
            if app.state == .runningForeground && !app.textFields["login-identifier"].exists
                && !app.secureTextFields["login-password"].exists && app.tabBars.firstMatch.exists
                && app.tabBars.buttons.count == 5 { shellReady = true; break }
            RunLoop.current.run(until: Date().addingTimeInterval(0.1))
        }
        try require(shellReady, "Owned login must finish loading, dismiss both login inputs and expose exactly five root destinations.")
        try tap(app.tabBars.buttons.element(boundBy: 2))
        try require(app.buttons["calendar-search"].waitForExistence(timeout: 20), "Select the actual Calendar root.")
    }
    private func openConnections() throws {
        try tap(app.buttons["calendar-connections"])
        try require(connections.waitForExistence(timeout: 15) && element("calendar-connection-title").exists,
                    "Open the genuine connections ScrollView.")
        try require(app.buttons["calendar-connection-add-apple"].waitForExistence(timeout: 15), "The owned connections entry must load.")
    }
    private func tapVisibleRevokeAction(_ identifier: String) throws {
        let prompt = element("calendar-connection-revoke-prompt")
        try require(["calendar-connection-revoke-cancel", "calendar-connection-revoke-confirm"].contains(identifier)
                    && prompt.waitForExistence(timeout: 10) && app.state == .runningForeground
                    && app.secureTextFields.count == 0, "Resolve only an action in the actual owned Revoke prompt.")
        let labels = identifier == "calendar-connection-revoke-cancel" ? cancelLabels : ["撤销", "Revoke", "Widerrufen"]
        let deadline = Date().addingTimeInterval(15)
        var visible: [XCUIElement] = []
        while Date() < deadline && prompt.exists && app.state == .runningForeground {
            let window = app.windows.firstMatch.frame
            let promptFrame = prompt.frame
            visible = app.descendants(matching: .any).matching(identifier: identifier).allElementsBoundByIndex.filter {
                let frame = $0.frame
                return labels.contains($0.label) && $0.isEnabled && promptFrame.width > 0 && promptFrame.height > 0
                    && frame.width > 0 && frame.height > 0 && window.contains(frame) && promptFrame.contains(frame)
                    && $0.isHittable
            }
            if !visible.isEmpty { break }
            RunLoop.current.run(until: Date().addingTimeInterval(0.1))
        }
        if visible.count != 1 && prompt.exists && app.state == .runningForeground && app.secureTextFields.count == 0 {
            let screenshot = XCTAttachment(screenshot: app.screenshot())
            screenshot.name = "private-owned-revoke-prompt-action-unreachable"; screenshot.lifetime = .keepAlways; add(screenshot)
            let tree = XCTAttachment(string: app.debugDescription)
            tree.name = "private-owned-revoke-prompt-" + identifier; tree.lifetime = .keepAlways; add(tree)
        }
        try require(visible.count == 1 && prompt.exists && app.state == .runningForeground,
                    "The exact Revoke action must have one enabled, hittable, fully visible native target in its current prompt.")
        let action = visible[0]
        print("CALENDAR_CONNECTIONS_REVOKE_ACTION id=\(identifier) type=\(action.elementType.rawValue) frame=\(action.frame) label=\(action.label)"); fflush(stdout)
        action.tap()
        try require(prompt.waitForNonExistence(timeout: 12), "The actual Revoke prompt must disappear after its native action.")
    }
    private func cancelOnlyFilePicker() -> Bool {
        // Query only the system Cancel control, never filenames or its AX tree.
        let cancel = app.navigationBars.buttons.matching(NSPredicate(format: "label IN %@", cancelLabels)).firstMatch
        if !cancel.waitForExistence(timeout: 3) {
            // Export can restore the local folder; return to Browse before its Cancel.
            let browse = app.navigationBars.buttons.matching(NSPredicate(format: "label IN %@", ["浏览", "Browse", "Durchsuchen"]))
            let visible = browse.allElementsBoundByIndex.filter { $0.isHittable }
            if visible.count == 1 { visible[0].tap() }
        }
        guard cancel.waitForExistence(timeout: 17), cancel.isHittable else { return false }
        cancel.tap()
        return cancel.waitForNonExistence(timeout: 12) && connections.waitForExistence(timeout: 12)
    }
    private func handleExternalCalendarWithoutSubscribing() {
        let calendar = XCUIApplication(bundleIdentifier: "com.apple.mobilecal")
        let system = XCUIApplication(bundleIdentifier: "com.apple.springboard")
        let titles = ["添加订阅日历", "日历订阅", "添加日历订阅", "Calendar Subscription", "Add Calendar Subscription", "Add Subscription Calendar", "Kalenderabonnement", "Kalenderabonnement hinzufügen"]
        let deadline = Date().addingTimeInterval(18)
        while Date() < deadline {
            // The system editor can arrive after Preview's openURL callback.
            // Never query Preview's covered AX tree while Calendar is foreground.
            if calendar.state == .runningForeground {
                let window = calendar.windows.firstMatch.frame
                let editors = calendar.navigationBars.matching(NSPredicate(format: "identifier IN %@ OR label IN %@", titles, titles))
                    .allElementsBoundByIndex.filter { $0.frame.width > 0 && $0.frame.height > 0 && window.contains($0.frame) }
                if editors.count == 1 {
                    let editor = editors[0]
                    let cancels = editor.buttons.matching(identifier: "cancel-button").allElementsBoundByIndex.filter {
                        cancelLabels.contains($0.label) && $0.isEnabled && $0.frame.width > 0 && $0.frame.height > 0
                            && editor.frame.contains($0.frame) && window.contains($0.frame) && $0.isHittable
                    }
                    if cancels.count == 1 {
                        let cancel = cancels[0]
                        print("CALENDAR_CONNECTIONS_EXTERNAL_NATIVE_CANCEL host=com.apple.mobilecal nav=\(editor.identifier) id=\(cancel.identifier) frame=\(cancel.frame)"); fflush(stdout)
                        cancel.tap()
                        guard editor.waitForNonExistence(timeout: 12) else {
                            XCTFail("The actual system subscription editor must close after its one Cancel action."); return
                        }
                        externalOutcome = "calendar-subscription-cancelled"
                        break
                    }
                }
            } else {
                let alert = system.alerts.firstMatch
                let isCalendarOpen = alert.staticTexts.matching(NSPredicate(format: "label CONTAINS[c] 'Calendar' OR label CONTAINS[c] '日历' OR label CONTAINS[c] 'Kalender'")).firstMatch.exists
                let cancel = alert.buttons.matching(NSPredicate(format: "label IN %@", cancelLabels)).firstMatch
                if isCalendarOpen && cancel.exists && cancel.isEnabled && cancel.isHittable {
                    cancel.tap()
                    guard alert.waitForNonExistence(timeout: 12) else {
                        XCTFail("The actual system Open Calendar confirmation must close after Cancel."); return
                    }
                    externalOutcome = "system-open-cancelled"
                    break
                }
            }
            RunLoop.current.run(until: Date().addingTimeInterval(0.1))
        }
        if externalOutcome == "not-opened" {
            guard calendar.state != .runningForeground else {
                XCTFail("Do not leave an unverified foreground system Calendar editor or query the covered Preview."); return
            }
            // Only after the bounded external-opening window may the callback-only route be observed.
            if app.state == .runningForeground && element("calendar-connection-notice").exists {
                externalOutcome = "preview-callback-notice-no-subscription"
            } else { externalOutcome = "external-return-only-unverified-cancel" }
        }
        app.activate()
        let returnDeadline = Date().addingTimeInterval(15)
        var returnedToPreview = false
        while Date() < returnDeadline {
            if app.state == .runningForeground && calendar.state != .runningForeground {
                returnedToPreview = true; break
            }
            RunLoop.current.run(until: Date().addingTimeInterval(0.1))
        }
        guard returnedToPreview else {
            XCTFail("Return to actual foreground Preview only after the system cancellation completes."); return
        }
    }
    private func dismissConnectionNoticeIfPresent() throws {
        if element("calendar-connection-notice").waitForExistence(timeout: 2) { try tap(app.buttons["calendar-connection-notice-ok"]) }
    }
    private func dismissTransferNoticeIfPresent() throws {
        if element("calendar-transfer-prompt").waitForExistence(timeout: 2) { try tap(app.buttons["calendar-transfer-ok"]) }
    }
    private func reveal(_ target: XCUIElement) throws {
        try require(connections.waitForExistence(timeout: 10), "Use the actual connections scroll container.")
        for _ in 0..<10 {
            let clip = connections.frame.intersection(app.windows.firstMatch.frame.insetBy(dx: 0, dy: 64))
            if target.exists && target.isHittable && clip.insetBy(dx: -0.5, dy: -0.5).contains(target.frame) { return }
            if target.exists && target.frame.minY < clip.minY { connections.swipeDown(velocity: .slow) }
            else { connections.swipeUp(velocity: .slow) }
        }
        try require(false, "The complete intended connections control must be reachable.")
    }
    private func tap(_ target: XCUIElement) throws {
        try require(target.waitForExistence(timeout: 15) && target.isEnabled && target.isHittable, "Use the actual visible enabled UI control.")
        target.tap()
    }
    private func copiedTextThroughCancelledDraft() throws -> String {
        try require(app.buttons["calendar-search"].isHittable && !element("event-editor-form").exists,
                    "Open the local paste draft only from the actual Calendar root.")
        try tap(app.buttons["new-event"])
        let draft = app.collectionViews["event-editor-form"].firstMatch
        let field = app.textFields["event-title"]
        var copied = ""
        var pasteFailure: Error?
        do {
            try require(draft.waitForExistence(timeout: 15) && field.waitForExistence(timeout: 10),
                        "The temporary new-event draft must expose its native title input.")
            let initial = try XCTUnwrap(field.value as? String)
            try require(initial.isEmpty || initial == field.placeholderValue,
                        "Paste only into a genuinely empty new draft, never an existing event.")
            try tap(field)
            let window = app.windows.firstMatch.frame
            let keyboard = app.keyboards.firstMatch
            let keyboardFrame = keyboard.exists ? keyboard.frame.intersection(window) : CGRect.null
            var bottom = !keyboardFrame.isNull && keyboardFrame.height > 100 ? keyboardFrame.minY : window.maxY
            let done = app.buttons["event-keyboard-done"]
            if done.exists && done.isHittable { bottom = min(bottom, done.frame.minY) }
            try require(field.isHittable && window.contains(field.frame)
                        && field.frame.minY > app.navigationBars.firstMatch.frame.maxY
                        && field.frame.maxY < bottom,
                        "The complete empty title must be visibly above the keyboard and Done bar.")
            field.press(forDuration: 0.9)
            let predicate = NSPredicate(format: "label IN %@", ["粘贴", "Paste", "Einsetzen"])
            let deadline = Date().addingTimeInterval(5)
            var candidates: [XCUIElement] = []
            repeat {
                candidates = [app.menuItems.matching(predicate), app.buttons.matching(predicate)]
                    .flatMap { $0.allElementsBoundByIndex }
                    .filter { $0.isHittable && window.contains($0.frame) }
                if !candidates.isEmpty { break }
                RunLoop.current.run(until: Date().addingTimeInterval(0.1))
            } while Date() < deadline
            try require(candidates.count == 1, "Use exactly one visible native Paste action; never type or recover a URL through another channel.")
            try tap(candidates[0])
            let pasteDeadline = Date().addingTimeInterval(5)
            repeat {
                copied = try XCTUnwrap(field.value as? String)
                if !copied.isEmpty && copied != field.placeholderValue { break }
                RunLoop.current.run(until: Date().addingTimeInterval(0.1))
            } while Date() < pasteDeadline
        } catch { pasteFailure = error }
        try tap(app.navigationBars.buttons.matching(NSPredicate(format: "label IN %@", ["取消", "Cancel", "Abbrechen"])).firstMatch)
        try require(draft.waitForNonExistence(timeout: 15) && !app.keyboards.firstMatch.exists
                    && app.buttons["calendar-search"].isHittable,
                    "Always cancel the temporary paste draft without saving and return to Calendar.")
        if let pasteFailure { throw pasteFailure }
        return copied
    }
    private func phase(_ name: String) throws {
        print("CALENDAR_CONNECTIONS_PHASE \(name)"); fflush(stdout)
        try FiveRootQAReadBarrier.wait(for: name)
    }
    private func require(_ condition: Bool, _ message: String) throws {
        guard condition else { XCTFail(message); throw NSError(domain: "FiveRootCalendarConnections", code: 1, userInfo: [NSLocalizedDescriptionKey: message]) }
    }
    private func capture(_ name: String) {
        guard app.state == .runningForeground,
              (element("calendar-connection-revoke-prompt").exists
               || connections.isHittable || element("calendar-export-year-sheet").isHittable),
              !app.secureTextFields["login-password"].exists else { return }
        let attachment = XCTAttachment(screenshot: app.screenshot())
        attachment.name = "five-root-calendar-connections-" + name; attachment.lifetime = .keepAlways; add(attachment)
    }
}
