import XCTest
import UIKit
import Darwin

/// Real owned-account Files save/import round trip; no authenticated stub or API business writes.
@MainActor final class FiveRootCalendarTransferUITests: XCTestCase {
    private struct Account: Decodable { let role, id, identifier, password: String }
    private struct Fixture: Decodable {
        let kind, runID, baseURL, bundle: String
        let schemaVersion: Int
        let accounts: [Account]
    }
    private var fixture: Fixture!
    private var app: XCUIApplication!
    private var sourceID = ""
    private var importedID = ""
    private var title: String { "Transfer " + fixture.runID }
    private var directoryName: String { "SideSeat-QA-Transfer-" + fixture.runID }
    private let filename = "sideseat-schedule-2026.ics"
    private var berlin: Calendar { var c = Calendar(identifier: .gregorian); c.timeZone = TimeZone(identifier: "Europe/Berlin")!; return c }
    private var window: CGRect { app.windows.firstMatch.frame }
    private var editor: XCUIElement { app.collectionViews["event-editor-form"].firstMatch }
    private var connections: XCUIElement { app.scrollViews["calendar-connections"].firstMatch }
    private var pickerNavigation: XCUIElement { app.navigationBars["FullDocumentManagerViewControllerNavigationBar"] }
    private var ownedFilesFolderID: String { "DOC.browsingRoot Source: com.apple.FileProvider.LocalStorage, Title: " + directoryName }
    private func element(_ id: String) -> XCUIElement { app.descendants(matching: .any).matching(identifier: id).firstMatch }

    override func setUpWithError() throws {
        continueAfterFailure = false
        try XCTSkipUnless(ProcessInfo.processInfo.environment["SIDESEAT_CALENDAR_TRANSFER_EXECUTE"] == "1", "Prepare only; Root must authorize the dedicated Files round trip.")
    }
    override func tearDown() async throws {
        await MainActor.run {
            if let app, app.state == .runningForeground, !app.secureTextFields["login-password"].exists, pickerNavigation.exists {
                try? captureFilesDiagnostics("picker-at-test-end-private")
            }
            app?.terminate()
        }
    }
    private func loadFixture() throws {
        try require(ProcessInfo.processInfo.environment["SIMULATOR_UDID"] == "AEBD816E-53A7-4012-B76A-FEF82CF02A6B", "Only the explicitly owned iPhone17Pro Simulator may run this case; no physical Phone.")
        let raw = ProcessInfo.processInfo.environment["SIDESEAT_CALENDAR_TRANSFER_FIXTURE_JSON"] ?? ""
        try require(raw.hasPrefix("{"), "Embed only a fresh owned factory fixture.")
        fixture = try JSONDecoder().decode(Fixture.self, from: Data(raw.utf8))
        try require(fixture.kind == "five-roots-live" && fixture.schemaVersion == 1 && fixture.baseURL == "https://api.sideseat.de" && fixture.bundle == "app.sideseat.mobile.preview", "Use the owned real Preview contract.")
        try require(fixture.runID.range(of: "^[a-f0-9]{12}$", options: .regularExpression) != nil && fixture.accounts.count == 2 && Set(fixture.accounts.map(\.role)) == ["owner", "peer"] && Set(fixture.accounts.map(\.id)).count == 2 && fixture.accounts.allSatisfy { $0.identifier == "e2e_roots_\($0.role)_\(fixture.runID)" && $0.password.count >= 24 }, "Only two distinct disposable identities from this run may be used.")
    }
    func testOwnedFilesExportDeleteImportRelaunchAndDelete() throws {
        try loadFixture()
        let day = berlin.startOfDay(for: Date())
        try require(berlin.component(.year, from: day) == 2026, "This explicitly bounded transfer case exports2026.")
        let start = try XCTUnwrap(berlin.date(bySettingHour: 9, minute: 0, second: 0, of: day))
        let end = try XCTUnwrap(berlin.date(byAdding: .hour, value: 1, to: start))
        print("CALENDAR_TRANSFER_EXPECTED_RANGE \(start.ISO8601Format()) \(end.ISO8601Format())")
        print("CALENDAR_TRANSFER_EXPECTED_YEAR 2026"); fflush(stdout)
        try loginOwner(); try phase("signed-in")
        try tap(app.buttons["calendar-view-day"]); try tap(app.buttons["home-jump-today"])
        let timeline = app.scrollViews["calendar-day-timeline"].firstMatch
        let slot = element("calendar-slot-540")
        try reveal(slot, in: timeline); try tap(slot)
        try require(editor.waitForExistence(timeout: 15), "The genuine09:00 Calendar slot must open the editor.")
        try fillEmpty(app.textFields["event-title"], with: title)
        try fillEmpty(app.textFields["event-location"], with: "文件传输测试地点")
        try fillEmpty(element("event-notes"), with: "文件传输备注")
        capture("01-source-form")
        try saveEvent()
        try search(title, expecting: 1)
        sourceID = try searchResultID()
        print("CALENDAR_TRANSFER_SOURCE_ID \(sourceID)"); fflush(stdout)
        try openSearchResult(title); try assertOwnedDetail()
        capture("02-source-detail"); try closeDetail(); try closeSearch()
        try phase("source-created")

        try openConnections()
        try reveal(app.buttons["calendar-export"], in: connections); try tap(app.buttons["calendar-export"])
        let yearSheet = element("calendar-export-year-sheet")
        try require(yearSheet.waitForExistence(timeout: 12) && element("calendar-export-year-picker").value as? String == "2026", "Export the actual2026 year containing this source event.")
        try tap(app.buttons["calendar-export-confirm"])
        try saveToNewOwnedFolder()
        try dismissTransferNotice(imported: false)
        try closeConnections()
        try phase("export-saved")

        try deleteOwnedEvent(expectedID: sourceID)
        try phase("source-deleted")
        try openConnections(); try reveal(app.buttons["calendar-import"], in: connections); try tap(app.buttons["calendar-import"])
        try importOwnedSavedFile()
        try dismissTransferNotice(imported: true); try closeConnections()
        try search(title, expecting: 1)
        importedID = try searchResultID()
        try require(importedID != sourceID, "Import after deleting the source must create a genuinely new event identity.")
        print("CALENDAR_TRANSFER_IMPORTED_ID \(importedID)"); fflush(stdout)
        try openSearchResult(title); try assertOwnedDetail()
        capture("06-imported-detail"); try closeDetail(); try closeSearch()
        try phase("imported")

        app.terminate(); try loginOwner()
        try search(title, expecting: 1)
        let relaunchedID = try searchResultID()
        try require(relaunchedID == importedID, "A real fresh login must preserve the imported event identity.")
        try openSearchResult(title); try assertOwnedDetail(); capture("07-imported-relogin-detail")
        try closeDetail(); try closeSearch(); try phase("import-relaunched")
        try deleteOwnedEvent(expectedID: importedID); try phase("import-deleted")
        app.terminate(); try loginOwner(); try search(title, expecting: 0)
        capture("08-deleted-relogin-empty"); try closeSearch(); try phase("deleted-relaunched")
    }
    private func fillEmpty(_ target: XCUIElement, with text: String) throws {
        let nativeField = app.textFields.matching(identifier: target.identifier).firstMatch
        let nativeView = app.textViews.matching(identifier: target.identifier).firstMatch
        let field = nativeField.exists ? nativeField : nativeView.exists ? nativeView : target
        try require(field.waitForExistence(timeout: 15), "A real native editor input must exist.")
        try prepareVisibleInput(field, in: editor)
        let old = try XCTUnwrap(field.value as? String)
        try require(old.isEmpty || old == field.placeholderValue, "Populate only a genuinely empty new owned draft.")
        field.typeText(text)
        try require(field.value as? String == text && inputIsAboveKeyboard(field), "The complete typed value must read back in the visible native field.")
        try dismissEventEditorKeyboard()
    }
    private func searchResultID() throws -> String {
        let rows = app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH 'calendar-search-result-' AND label CONTAINS %@", title))
        try require(rows.count == 1, "Use exactly one owned search identity.")
        let id = String(rows.element(boundBy: 0).identifier.dropFirst("calendar-search-result-".count))
        try require(!id.isEmpty, "The search result must expose a real identity."); return id
    }
    private func assertOwnedDetail() throws {
        let detail = element("calendar-readonly-detail")
        try require(detail.waitForExistence(timeout: 15) && detail.staticTexts[title].waitForExistence(timeout: 15), "The exact owned event must open its actual detail.")
        let list = detail.collectionViews.firstMatch
        let scroll = list.exists ? list : detail.tables.firstMatch
        for (id, expected) in [("calendar-detail-start", "09:00"), ("calendar-detail-end", "10:00"), ("calendar-detail-location", "文件传输测试地点"), ("calendar-detail-notes", "文件传输备注")] {
            let row = detail.descendants(matching: .any).matching(identifier: id).firstMatch
            try reveal(row, in: scroll); try require(row.label.contains(expected), "The real event detail must preserve \(id).")
        }
    }
    private func deleteOwnedEvent(expectedID: String) throws {
        try search(title, expecting: 1); let id = try searchResultID(); try require(id == expectedID, "Delete only the exact source or imported event from this run.")
        try openSearchResult(title); try tap(app.buttons["calendar-detail-edit"])
        let delete = app.buttons.matching(NSPredicate(format: "label IN %@", ["删除日程", "删除活动", "删除事件", "Delete event"])).firstMatch
        try reveal(delete, in: editor); try tap(delete); try tap(app.buttons["event-delete-this"])
        try require(editor.waitForNonExistence(timeout: 25), "The real owned event deletion must finish.")
        if element("calendar-readonly-detail").exists { try closeDetail() }
        if element("calendar-search-sheet").exists { try closeSearch() }
        try search(title, expecting: 0); try closeSearch()
    }
    private func openConnections() throws {
        try tap(app.buttons["calendar-connections"])
        try require(connections.waitForExistence(timeout: 15), "Open actual Calendar Connections.")
    }
    private func closeConnections() throws {
        try tap(app.navigationBars.buttons.matching(NSPredicate(format: "label IN %@", ["完成", "Done", "Fertig"])).firstMatch)
        try require(connections.waitForNonExistence(timeout: 12) && app.buttons["calendar-search"].isHittable, "Connections must close to the actual Calendar root.")
    }
    private func dismissTransferNotice(imported: Bool) throws {
        let ok = app.buttons["calendar-transfer-ok"]
        try require(ok.waitForExistence(timeout: 25), "A real import/export completion notice must appear; no cancellation counts as success.")
        let expected = imported ? "已导入 1 个日程，跳过 0 个。" : "日历已导出。"
        try require(app.staticTexts[expected].waitForExistence(timeout: 10), "The actual notice must report successful export or exactly one imported event with zero skipped.")
        capture(imported ? "05-import-completion-notice" : "04-export-completion-notice")
        try tap(ok); try require(ok.waitForNonExistence(timeout: 10), "Acknowledge the completed transfer.")
    }
    private func saveToNewOwnedFolder() throws {
        try require(app.textFields["DOCPicker.filenameTextField"].waitForExistence(timeout: 20), "The real Files Save picker must appear.")
        try showLocalStorageRoot()
        try tap(app.buttons["OverflowBarButtonItem"])
        let newFolder = try uniqueVisibleLabel(["新建文件夹", "New Folder", "Neuer Ordner"])
        try tap(newFolder)
        print("CALENDAR_TRANSFER_NEW_FOLDER_ACTION"); fflush(stdout)
        let rename = app.textViews["DOC.inlineRenameField"]
        try require(rename.waitForExistence(timeout: 8) && app.textViews.matching(identifier: "DOC.inlineRenameField").count == 1,
                    "Use only Files' actual new-folder inline rename editor.")
        let keyboard = app.keyboards.firstMatch
        try require(keyboard.exists && keyboard.frame.height > 120 && rename.isEnabled && rename.isHittable
                    && window.contains(rename.frame) && rename.frame.maxY < keyboard.frame.minY - 8,
                    "The newly created folder name must be genuinely visible above its focused software keyboard.")
        capture("03-new-folder-default-selection")
        let initial = try XCTUnwrap(rename.value as? String)
        let encodedDefault = try JSONEncoder().encode([initial])
        print("CALENDAR_TRANSFER_NEW_FOLDER_DEFAULT_NAME \(String(decoding: encodedDefault, as: UTF8.self))"); fflush(stdout)
        if !initial.isEmpty && initial != rename.placeholderValue {
            // Files has just selected its new default folder name. Keep that
            // selection intact; one actual Delete must clear it completely.
            let deletes = keyboard.keys.matching(identifier: "delete").allElementsBoundByIndex.filter {
                $0.isEnabled && $0.frame.width > 0 && $0.frame.height > 0
                    && keyboard.frame.contains($0.frame) && window.contains($0.frame) && $0.isHittable
            }
            try require(deletes.count == 1, "Use the one real visible software Delete key for the newly selected default name.")
            deletes[0].tap()
        }
        let clearedNameValue: () throws -> String = {
            try self.require(rename.exists && self.app.textViews.matching(identifier: "DOC.inlineRenameField").count == 1
                             && rename.isEnabled && rename.isHittable && keyboard.exists && keyboard.frame.height > 120
                             && self.window.contains(rename.frame) && rename.frame.maxY < keyboard.frame.minY - 8,
                             "Read an empty name only while the same unique inline editor and actual keyboard remain visible.")
            let raw = rename.value
            try self.require(raw == nil || raw is String, "The controlled inline clear value must be nil or String, never another type.")
            return raw as? String ?? ""
        }
        let clearDeadline = Date().addingTimeInterval(2)
        while Date() < clearDeadline {
            let value = try clearedNameValue()
            if value.isEmpty || value == rename.placeholderValue { break }
            RunLoop.current.run(until: Date().addingTimeInterval(0.1))
        }
        let cleared = try clearedNameValue()
        try require(cleared.isEmpty || cleared == rename.placeholderValue,
                    "One native Delete must actually clear the new-folder default name before typing; never retry a partial clear.")
        try require(keyboard.buttons["Done"].exists && !keyboard.buttons["Done"].isEnabled,
                    "Files must keep Done disabled while its new-folder name is genuinely empty.")
        capture("04-new-folder-cleared-empty")
        rename.typeText(directoryName)
        try require(rename.value as? String == directoryName, "The actual new-folder name must exactly match this run.")
        let done = keyboard.buttons["Done"]
        try require(done.exists && done.isEnabled && done.isHittable && window.contains(done.frame)
                    && keyboard.frame.contains(done.frame), "Commit only with Files' actual visible keyboard Done button.")
        done.tap()
        try require(rename.waitForNonExistence(timeout: 10) && keyboard.waitForNonExistence(timeout: 10),
                    "The actual new-folder name must finish editing before entering it.")
        // Files enters the new folder after keyboard Done. Its full title is
        // exposed by the provider root identifier, while the toolbar is a menu Button.
        try require(element(ownedFilesFolderID).waitForExistence(timeout: 12)
                    && app.descendants(matching: .any).matching(identifier: ownedFilesFolderID).count == 1,
                    "Save only inside the exact newly created local run folder.")
        capture("03-owned-files-folder-save")
        try tap(pickerNavigation.buttons.matching(NSPredicate(format: "label IN %@", ["保存", "Save", "Sichern"])).firstMatch)
        try require(app.textFields["DOCPicker.filenameTextField"].waitForNonExistence(timeout: 20), "The real Files save picker must complete, not cancel.")
        print("CALENDAR_TRANSFER_FILE_SAVED \(directoryName)/\(filename)"); fflush(stdout)
    }
    private func showLocalStorageRoot() throws {
        let localLabels = ["我的iPhone", "On My iPhone", "Auf meinem iPhone"]
        for _ in 0..<5 {
            if pickerNavigation.staticTexts.matching(NSPredicate(format: "label IN %@", localLabels)).firstMatch.exists {
                let root = app.descendants(matching: .any).matching(NSPredicate(format: "identifier BEGINSWITH %@", "DOC.browsingRoot Source: com.apple.FileProvider.LocalStorage,")).firstMatch
                try require(root.exists, "The selected Files root must be the owned Simulator's local storage provider."); return
            }
            let local = app.cells.matching(NSPredicate(format: "label IN %@", localLabels)).firstMatch
            if local.exists && local.isHittable { try tap(local); continue }
            let localText = app.staticTexts.matching(NSPredicate(format: "label IN %@", localLabels)).firstMatch
            if localText.exists && localText.isHittable { try tap(localText); continue }
            let back = pickerNavigation.buttons["BackButton"]
            if back.exists && back.isHittable { try tap(back); continue }
            break
        }
        try captureFilesDiagnostics("local-storage-root-unavailable")
        try require(false, "A real local Files save/import provider must be available; do not substitute App Documents or ordinary data.")
    }
    private func importOwnedSavedFile() throws {
        try require(pickerNavigation.waitForExistence(timeout: 20), "The real Files import picker must appear.")
        try captureFilesDiagnostics("import-picker-initial-private")
        if !element(ownedFilesFolderID).exists {
            try showLocalStorageRoot()
            try tap(app.staticTexts[directoryName])
        }
        try require(element(ownedFilesFolderID).waitForExistence(timeout: 12)
                    && app.descendants(matching: .any).matching(identifier: ownedFilesFolderID).count == 1,
                    "Import only from this run's exact owned local Files folder.")
        let root = element(ownedFilesFolderID)
        let fileViews = root.collectionViews.matching(identifier: "File View")
        try require(fileViews.count == 1, "The owned local folder must expose exactly one actual Files collection.")
        let files = fileViews.element(boundBy: 0).cells.matching(identifier: "sideseat-schedule-2026, ics")
        try require(files.firstMatch.waitForExistence(timeout: 10) && files.count == 1,
                    "Use the exact single native ICS Cell, never its filename text child.")
        let file = files.element(boundBy: 0)
        let frame = file.frame
        try require(file.isEnabled && frame.width > 0 && frame.height > 0 && window.contains(frame)
                    && root.frame.contains(frame) && file.isHittable,
                    "The exact owned ICS Cell must be enabled, hittable and fully visible in its actual folder.")
        print("CALENDAR_TRANSFER_IMPORT_CELL id=\(file.identifier) type=\(file.elementType.rawValue) frame=\(frame) enabled=\(file.isEnabled) hittable=\(file.isHittable)"); fflush(stdout)
        capture("04-owned-file-before-import")
        file.tap()
        try require(pickerNavigation.waitForNonExistence(timeout: 25), "Choosing the exact saved ICS must close the real import picker.")
    }
    private func uniqueVisibleLabel(_ labels: [String]) throws -> XCUIElement {
        for type in [XCUIElement.ElementType.menuItem, .button] {
            let candidates = app.descendants(matching: type).matching(NSPredicate(format: "label IN %@", labels)).allElementsBoundByIndex.filter { $0.isEnabled && $0.frame.width > 0 && $0.frame.height > 0 && window.contains($0.frame) && $0.isHittable }
            if candidates.count == 1 { return candidates[0] }
            try require(candidates.count <= 1, "The intended native Files action must be unique.")
        }
        try captureFilesDiagnostics("new-folder-action-unavailable")
        try require(false, "The actual native Files New Folder action must be reachable; do not guess a coordinate.")
        throw NSError(domain: "FiveRootCalendarTransfer", code: 2)
    }
    private func captureFilesDiagnostics(_ name: String) throws {
        try require(app.state == .runningForeground && !app.secureTextFields["login-password"].exists && pickerNavigation.exists, "Capture only the known native Files picker, without authentication.")
        capture(name)
        let tree = XCTAttachment(string: app.debugDescription); tree.name = "transfer-private-files-" + name; tree.lifetime = .keepAlways; add(tree)
    }
    private func loginOwner() throws {
        let owner = try XCTUnwrap(fixture.accounts.first { $0.role == "owner" })
        app = XCUIApplication(bundleIdentifier: fixture.bundle)
        app.launchArguments = ["--ui-testing-signed-out", "--ui-testing-ephemeral-credentials", "--ui-testing-skip-tutorial",
                               "--ui-testing-language=zh-Hans", "--ui-testing-appearance=light",
                               "-UIPreferredContentSizeCategoryName", "UICTContentSizeCategoryL"]
        app.launchEnvironment = [:]
        app.launch()
        let identifier = app.textFields["login-identifier"]
        try require(identifier.waitForExistence(timeout: 25), "Real signed-out authentication form must appear.")
        identifier.tap(); identifier.typeText(owner.identifier)
        app.secureTextFields["login-password"].tap(); app.secureTextFields["login-password"].typeText(owner.password)
        app.buttons["login-submit"].tap()
        try require(app.tabBars.firstMatch.waitForExistence(timeout: 35), "Fresh owned account must reach the real shell.")
        let deny = XCUIApplication(bundleIdentifier: "com.apple.springboard").buttons.matching(
            NSPredicate(format: "label IN %@", ["不允许", "Don’t Allow", "Don't Allow"])).firstMatch
        if deny.waitForExistence(timeout: 1) { deny.tap() }
        try require(app.tabBars.buttons.count == 5, "Current product must expose five root destinations.")
        try tap(app.tabBars.buttons.element(boundBy: 2))
        try require(app.buttons["calendar-search"].waitForExistence(timeout: 25), "Tab index2 must be the actual Calendar root.")
    }
    private func visibleKeyboardFrame() -> CGRect {
        let keyboard = app.keyboards.firstMatch
        return keyboard.exists ? keyboard.frame.intersection(window) : CGRect.null
    }
    private func inputIsAboveKeyboard(_ field: XCUIElement) -> Bool {
        let keyboard = visibleKeyboardFrame()
        guard !keyboard.isNull && keyboard.height > 120 else { return false }
        let navBottom = app.navigationBars.firstMatch.frame.maxY + 4
        let clip = window.intersection(CGRect(x: window.minX, y: navBottom, width: window.width, height: max(0, keyboard.minY - navBottom - 8)))
        return field.isEnabled && field.isHittable && !clip.isNull && clip.insetBy(dx: -0.5, dy: -0.5).contains(field.frame)
    }
    private func prepareVisibleInput(_ field: XCUIElement, in form: XCUIElement) throws {
        let oldKeyboard = visibleKeyboardFrame()
        if !oldKeyboard.isNull && oldKeyboard.height > 120 && field.frame.maxY > oldKeyboard.minY - 8 {
            try require(form.identifier == "event-editor-form", "Only the event editor uses its keyboard Done control.")
            try dismissEventEditorKeyboard()
        }
        try revealInput(field, in: form)
        let keyboard = visibleKeyboardFrame()
        let navBottom = app.navigationBars.firstMatch.frame.maxY + 4
        let bottom = !keyboard.isNull && keyboard.height > 120 ? keyboard.minY - 8 : window.maxY - 24
        let clip = form.frame.intersection(window).intersection(CGRect(x: window.minX, y: navBottom, width: window.width, height: max(0, bottom - navBottom)))
        print("INPUT_PRE_TAP_VISIBILITY id=\(field.identifier) field=\(field.frame) actualKeyboard=\(keyboard) clip=\(clip) hittable=\(field.isHittable)"); fflush(stdout)
        try require(field.isEnabled && field.isHittable && app.state == .runningForeground && !clip.isNull && clip.insetBy(dx: -0.5, dy: -0.5).contains(field.frame), "The complete native input field must be visible above the current keyboard and navigation bar before tapping.")
        field.tap()
        let focusDeadline = Date().addingTimeInterval(3)
        var visible = false
        while Date() < focusDeadline {
            visible = inputIsAboveKeyboard(field)
            if visible { break }
            RunLoop.current.run(until: Date().addingTimeInterval(0.1))
        }
        print("INPUT_POST_TAP_FULLY_VISIBLE id=\(field.identifier) value=\(visible)"); fflush(stdout)
        try require(visible, "After an ordinary visible input tap, the complete input field must remain above the real keyboard before any input; do not edit a hidden field.")
    }
    private func dismissEventEditorKeyboard() throws {
        let done = app.buttons["event-keyboard-done"]
        try require(done.exists && done.isEnabled && done.isHittable && window.insetBy(dx: -0.5, dy: -0.5).contains(done.frame), "Only the real reachable event keyboard Done may dismiss this keyboard; Return may advance focus.")
        done.tap()
        let deadline = Date().addingTimeInterval(3)
        while Date() < deadline {
            let frame = visibleKeyboardFrame()
            if frame.isNull || frame.height <= 1 { break }
            RunLoop.current.run(until: Date().addingTimeInterval(0.1))
        }
        let frame = visibleKeyboardFrame()
        print("EXACT_BACKSPACE_EVENT_KEYBOARD_DISMISSED actualIntersection=\(frame)"); fflush(stdout)
        try require(frame.isNull || frame.height <= 1, "The actual event keyboard must leave the viewport before revealing another field.")
    }
    private func revealInput(_ target: XCUIElement, in scroll: XCUIElement) throws {
        for _ in 0..<20 {
            let keyboard = app.keyboards.firstMatch
            let k = keyboard.exists ? keyboard.frame : CGRect.null
            let keyboardTop = !k.isNull && k.height > 100 && k.minY < window.maxY ? k.minY : window.maxY - 24
            let top = app.navigationBars.firstMatch.frame.maxY + 4
            let clip = scroll.frame.intersection(window).intersection(CGRect(x: window.minX, y: top, width: window.width, height: max(0, keyboardTop - top - 8)))
            if target.exists && target.isHittable && clip.insetBy(dx: -0.5, dy: -0.5).contains(target.frame) { return }
            try require(!clip.isNull && clip.height > 96, "The real editor must have a usable visible area.")
            let down = target.exists && target.frame.minY < clip.minY
            let gap = target.exists ? (down ? clip.minY - target.frame.minY : target.frame.maxY - clip.maxY) : CGFloat(120)
            let distance = min(CGFloat(180), max(CGFloat(48), gap + 8))
            let endY = min(clip.maxY - 24, max(clip.minY + 24, clip.midY + (down ? distance : -distance)))
            let origin = app.coordinate(withNormalizedOffset: .zero), x = clip.minX + 24
            origin.withOffset(CGVector(dx: x, dy: clip.midY)).press(forDuration: 0.05, thenDragTo: origin.withOffset(CGVector(dx: x, dy: endY)), withVelocity: .slow, thenHoldForDuration: 0.1)
        }
        try require(false, "The complete intended input must be reachable.")
    }
    private func search(_ title: String, expecting count: Int) throws {
        try tap(app.buttons["calendar-search"])
        let field = app.searchFields.firstMatch
        try require(field.waitForExistence(timeout: 10), "Real calendar search input must appear.")
        field.tap(); field.typeText(title)
        let rows = app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH 'calendar-search-result-' AND label CONTAINS %@", title))
        if count == 1 {
            try require(rows.firstMatch.waitForExistence(timeout: 20) && rows.count == 1, "Search must show exactly one owned event.")
        } else {
            try require(element("calendar-search-empty").waitForExistence(timeout: 20) && rows.count == 0, "Deleted owned event must have no search result.")
        }
    }
    private func openSearchResult(_ title: String) throws {
        let row = app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH 'calendar-search-result-' AND label CONTAINS %@", title)).firstMatch
        try tap(row)
        try require(element("calendar-readonly-detail").waitForExistence(timeout: 15), "Search must open the event's actual detail.")
    }
    private func closeSearch() throws {
        let sheet = element("calendar-search-sheet")
        if !sheet.exists {
            try require(app.buttons["calendar-search"].exists && app.buttons["calendar-search"].isHittable
                        && !element("calendar-readonly-detail").exists && !app.keyboards.firstMatch.exists,
                        "A dismissed search must leave the actual Calendar root reachable, with no detail or keyboard.")
            return
        }
        let done = app.buttons["calendar-search-done"]
        if !done.exists {
            let closeFocus = app.navigationBars.buttons.matching(NSPredicate(format: "label IN %@", ["关闭", "Close", "取消", "Cancel"])).firstMatch
            try tap(closeFocus)
            _ = sheet.waitForNonExistence(timeout: 3)
        }
        if sheet.exists { try tap(done) }
        try require(sheet.waitForNonExistence(timeout: 10), "The actual search dismissal must return to Calendar.")
        try require(!app.keyboards.firstMatch.exists && app.buttons["calendar-search"].isHittable,
                    "Search cancellation must leave the Calendar root visible with no keyboard.")
    }
    private func closeDetail() throws { try tap(app.navigationBars.buttons.matching(NSPredicate(format: "label IN %@", ["完成", "Done"])).firstMatch) }
    private func saveEvent() throws {
        try tap(app.buttons["event-save"])
        try require(element("event-editor-form").waitForNonExistence(timeout: 25), "Real save must finish and close the event editor.")
    }
    private func revealTimeline(_ target: XCUIElement, in scroll: XCUIElement) throws {
        try require(scroll.waitForExistence(timeout: 10) && target.waitForExistence(timeout: 15),
                    "The actual timeline and intended control must exist.")
        for _ in 0..<16 {
            let window = app.windows.firstMatch.frame
            let actions = element("calendar-bottom-actions")
            let bottom = min(actions.exists ? actions.frame.minY : window.maxY,
                             app.tabBars.firstMatch.frame.minY) - 8
            let top = max(scroll.frame.minY, app.navigationBars.firstMatch.frame.maxY + 2)
            let clip = scroll.frame.intersection(window).intersection(
                CGRect(x: window.minX, y: top, width: window.width, height: max(0, bottom - top)))
            let frame = target.frame
            if !clip.isNull && target.isHittable && clip.insetBy(dx: -0.5, dy: -0.5).contains(frame) { return }
            try require(!clip.isNull && clip.height > 96, "The live timeline must have a usable viewport above its footer.")
            let down = frame.minY < clip.minY
            let gap = down ? clip.minY - frame.minY : frame.maxY - clip.maxY
            let distance = min(CGFloat(180), max(CGFloat(48), gap + 8))
            let startY = clip.midY
            let endY = min(clip.maxY - 24, max(clip.minY + 24, startY + (down ? distance : -distance)))
            let origin = app.coordinate(withNormalizedOffset: .zero), x = clip.minX + 24
            print("CALENDAR_TIMELINE_GEOMETRY target=\(frame) clip=\(clip)"); fflush(stdout)
            origin.withOffset(CGVector(dx: x, dy: startY)).press(forDuration: 0.05,
                thenDragTo: origin.withOffset(CGVector(dx: x, dy: endY)), withVelocity: .slow, thenHoldForDuration: 0.1)
        }
        try require(false, "The complete timeline control must be reachable above the actual fixed footer.")
    }
    private func reveal(_ target: XCUIElement, in scroll: XCUIElement) throws {
        if scroll.identifier == "calendar-day-timeline" {
            try revealTimeline(target, in: scroll)
            return
        }
        try require(scroll.waitForExistence(timeout: 10), "Expected scrolling surface must exist.")
        for _ in 0..<30 {
            let window = app.windows.firstMatch.frame
            let clip = scroll.frame.intersection(window.insetBy(dx: 0, dy: 50))
            if target.exists && target.isHittable && clip.contains(target.frame) { return }
            if target.exists && target.frame.minY < clip.minY { scroll.swipeDown(velocity: .slow) }
            else { scroll.swipeUp(velocity: .slow) }
        }
        try require(false, "The complete intended control must be reachable.")
    }
    private func tap(_ target: XCUIElement) throws {
        try require(target.waitForExistence(timeout: 15) && target.isEnabled && target.isHittable, "Intended UI control must be enabled and reachable.")
        target.tap()
    }
    private func phase(_ name: String) throws { print("CALENDAR_TRANSFER_PHASE \(name)"); fflush(stdout); try FiveRootQAReadBarrier.wait(for: name) }
    private func require(_ condition: Bool, _ message: String) throws {
        guard condition else { XCTFail(message); throw NSError(domain: "FiveRootCalendarTransfer", code: 1, userInfo: [NSLocalizedDescriptionKey: message]) }
    }
    private func capture(_ name: String) {
        XCTAssertFalse(app.secureTextFields["login-password"].exists, "Never capture authentication.")
        let image = XCTAttachment(screenshot: app.screenshot()); image.name = "five-root-calendar-transfer-" + name; image.lifetime = .keepAlways; add(image)
    }
}
