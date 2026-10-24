import XCTest

/// Edits only a disposable poll's information; availability stays an unsubmitted local draft.
@MainActor final class PlanInformationEditorPhoneUITests: XCTestCase {
    private struct Account: Decodable { let role: String; let accessToken: String }
    private struct Fixture: Decodable {
        let bundle: String
        let finalBlockToken: String
        let accounts: [Account]
    }
    private var app: XCUIApplication!
    override func setUpWithError() throws { continueAfterFailure = false }
    override func tearDown() { app?.terminate() }

    func testDirectInformationEditingKeepsLabelsActionsAndAvailabilityDraft() throws {
        let raw = try XCTUnwrap(ProcessInfo.processInfo.environment["SIDESEAT_PLAN_CONTACTS_JSON"])
        let fixture = try JSONDecoder().decode(Fixture.self, from: Data(raw.utf8))
        let owner = try XCTUnwrap(fixture.accounts.first { $0.role == "owner" })
        let participant = try XCTUnwrap(fixture.accounts.first { $0.role == "participant" })
        for (language, large) in [("zh-Hans", false), ("de", true)] {
            let tag = "\(language)-\(large ? "largest" : "normal")"
            launch(fixture, account: owner, language: language, large: large)
            let heading = app.staticTexts["time-poll-detail-title"]
            let place = app.descendants(matching: .any)["plan-detail-location"].firstMatch
            let originalTitle = heading.label
            revealValue(place, tag: "initial-place-\(tag)"); let originalPlace = place.label
            XCTAssertFalse(app.buttons["plan-edit-information"].exists)
            XCTAssertFalse(app.descendants(matching: .any)["plan-information-editor"].firstMatch.exists)

            let first = app.buttons["time-poll-cell-0"]
            reveal(first)
            if !first.isSelected { first.tap() }
            XCTAssertTrue(first.isSelected)
            capture("information-editor-initial-private-draft-\(tag)")
            assertPrivateDraft(language: language)
            tapValue(heading, tag: "title-entry-\(tag)")
            XCTAssertTrue(app.staticTexts["plan-edit-title-label"].waitForExistence(timeout: 10))
            let title = field("plan-edit-title"), location = field("plan-edit-location")
            XCTAssertEqual(title.value as? String, originalTitle)
            let originalLocation = try XCTUnwrap(location.value as? String)
            XCTAssertFalse(originalLocation.isEmpty)
            XCTAssertFalse(app.buttons["plan-edit-save"].isEnabled)
            verifyEditor(language: language, large: large, tag: "title-entry-\(tag)")

            // Fixed labels still identify both fields while the name is empty or contains a value.
            replace(title, with: "")
            XCTAssertEqual(app.staticTexts["plan-edit-title-label"].label, language == "de" ? "Aktivitätsname" : "活动名称")
            XCTAssertFalse(app.buttons["plan-edit-save"].isEnabled)
            replace(title, with: originalTitle + " QA")
            replace(location, with: originalLocation + " QA")
            let cancel = app.buttons["plan-edit-cancel"]
            reveal(cancel); assertTarget(cancel)
            capture("information-editor-before-cancel-\(tag)")
            cancel.tap()
            XCTAssertTrue(app.staticTexts["plan-edit-title-label"].waitForNonExistence(timeout: 8))
            XCTAssertEqual(heading.label, originalTitle)
            revealValue(place, tag: "cancelled-place-\(tag)"); XCTAssertEqual(place.label, originalPlace)
            reveal(first); XCTAssertTrue(first.isSelected); assertPrivateDraft(language: language)

            // Location is a second direct entry to the same editor; there is no intermediate Edit action.
            tapValue(place, tag: "location-entry-\(tag)")
            XCTAssertTrue(app.staticTexts["plan-edit-location-label"].waitForExistence(timeout: 10))
            XCTAssertEqual(field("plan-edit-title").value as? String, originalTitle)
            XCTAssertEqual(field("plan-edit-location").value as? String, originalLocation)
            let editedTitle = language == "de"
                ? "Gemeinsam die Ausstellung besuchen und danach in Ruhe Kaffee trinken"
                : "周末一起去看展，顺便喝杯咖啡，保存后继续填写空闲"
            let editedLocation = "Treffpunkt am Haupteingang der Pinakothek der Moderne, danach gemeinsam Kaffee trinken und den Heimweg planen"
            replace(field("plan-edit-title"), with: editedTitle)
            replace(field("plan-edit-location"), with: editedLocation)
            verifyEditor(language: language, large: large, tag: "location-entry-\(tag)")
            let save = app.buttons["plan-edit-save"]
            reveal(save); assertTarget(save); XCTAssertTrue(save.isEnabled)
            save.tap()
            XCTAssertTrue(app.staticTexts["plan-edit-title-label"].waitForNonExistence(timeout: 20))
            XCTAssertTrue(heading.waitForExistence(timeout: 10)); XCTAssertEqual(heading.label, editedTitle)
            revealValue(heading, tag: "saved-title-\(tag)"); capture("information-editor-saved-title-\(tag)")
            revealValue(place, tag: "saved-place-\(tag)"); XCTAssertTrue(place.label.contains(editedLocation))
            capture("information-editor-saved-location-\(tag)")
            reveal(first); XCTAssertTrue(first.isSelected)
            assertPrivateDraft(language: language)
            capture("information-editor-saved-private-draft-\(tag)")

            launch(fixture, account: participant, language: language, large: large)
            XCTAssertEqual(app.staticTexts["time-poll-detail-title"].label, editedTitle)
            let readOnlyPlace = app.descendants(matching: .any)["plan-detail-location"].firstMatch
            revealValue(readOnlyPlace, tag: "participant-place-\(tag)"); XCTAssertTrue(readOnlyPlace.label.contains(editedLocation))
            for value in [app.staticTexts["time-poll-detail-title"], readOnlyPlace] {
                tapValue(value, tag: "participant-\(value.identifier)-\(tag)")
                XCTAssertFalse(app.staticTexts["plan-edit-title-label"].exists)
                XCTAssertFalse(app.staticTexts["plan-edit-location-label"].exists)
                XCTAssertFalse(app.buttons["plan-edit-save"].exists)
                XCTAssertFalse(app.keyboards.firstMatch.exists)
                capture("information-editor-participant-readonly-\(value.identifier)-\(tag)")
            }
            XCTAssertFalse(app.buttons["plan-edit-information"].exists)
            app.terminate()
        }
    }

    private func launch(_ fixture: Fixture, account: Account, language: String, large: Bool) {
        app?.terminate(); app = XCUIApplication(bundleIdentifier: fixture.bundle)
        app.launchArguments = ["--ui-testing-authenticated", "--ui-testing-ephemeral-credentials",
            "--ui-testing-skip-tutorial", "--ui-testing-time-poll-live", "--ui-testing-language=\(language)",
            "--ui-testing-appearance=\(large ? "dark" : "light")", "--ui-testing-deep-link=/time-polls/\(fixture.finalBlockToken)",
            "-UIPreferredContentSizeCategoryName", large ? "UICTContentSizeCategoryAccessibilityXXXL" : "UICTContentSizeCategoryL"]
        if large { app.launchArguments.append("--ui-testing-dynamic-type-accessibility") }
        app.launchEnvironment = ["SIDESEAT_QA_ACCESS_TOKEN": account.accessToken]
        app.launch()
        XCTAssertTrue(app.staticTexts["time-poll-detail-title"].waitForExistence(timeout: 25))
    }

    private func field(_ identifier: String) -> XCUIElement {
        let match = app.textFields[identifier]
        return match.exists ? match : app.textViews[identifier]
    }

    private func verifyEditor(language: String, large: Bool, tag: String) {
        capture("information-editor-initial-\(tag)")
        let keyboard = app.keyboards.firstMatch, assistant = app.otherElements["SystemInputAssistantView"].firstMatch
        print("INFORMATION_KEYBOARD \(tag) keyboard=\(keyboard.exists ? keyboard.frame : .zero) assistant=\(assistant.exists ? assistant.frame : .zero)")
        let editor = app.descendants(matching: .any)["plan-information-editor"].firstMatch
        let titleLabel = app.staticTexts["plan-edit-title-label"], placeLabel = app.staticTexts["plan-edit-location-label"]
        let title = field("plan-edit-title"), location = field("plan-edit-location")
        let cancel = app.buttons["plan-edit-cancel"], save = app.buttons["plan-edit-save"]
        let actions = app.descendants(matching: .any)["plan-edit-actions"].firstMatch
        XCTAssertTrue(editor.exists && actions.exists)
        XCTAssertEqual(titleLabel.label, language == "de" ? "Aktivitätsname" : "活动名称")
        XCTAssertEqual(placeLabel.label, language == "de" ? "Ort (optional)" : "地点（可选）")
        XCTAssertFalse(app.buttons["plan-share-open"].exists)
        for (label, input) in [(titleLabel, title), (placeLabel, location)] {
            reveal(label); reveal(input)
            XCTAssertGreaterThanOrEqual(input.frame.minY, label.frame.maxY)
            XCTAssertLessThanOrEqual(abs(label.frame.minX - input.frame.minX), 16)
            XCTAssertFalse(label.frame.intersects(input.frame))
            if large { XCTAssertGreaterThan(input.frame.height, 40, "Verify actual maximum-size field geometry") }
            capture("information-editor-field-\(input.identifier)-\(tag)")
        }
        XCTAssertGreaterThanOrEqual(placeLabel.frame.minY, title.frame.maxY)
        for action in [cancel, save] { reveal(action); assertTarget(action) }
        XCTAssertFalse(cancel.frame.intersects(save.frame))
        for action in [cancel, save] {
            XCTAssertGreaterThanOrEqual(action.frame.minY, location.frame.maxY)
            XCTAssertFalse(action.frame.intersects(title.frame)); XCTAssertFalse(action.frame.intersects(location.frame))
        }
        XCTAssertLessThanOrEqual(abs(max(cancel.frame.maxX, save.frame.maxX) - location.frame.maxX), 16,
                                 "Adaptive actions retain trailing alignment with the inputs")
        XCTAssertTrue(actions.frame.insetBy(dx: -0.501, dy: -0.501).contains(cancel.frame))
        XCTAssertTrue(actions.frame.insetBy(dx: -0.501, dy: -0.501).contains(save.frame))
        print("INFORMATION_EDITOR \(tag) titleLabel=\(titleLabel.frame) title=\(title.frame) placeLabel=\(placeLabel.frame) place=\(location.frame) actions=\(actions.frame) cancel=\(cancel.frame) save=\(save.frame)")
        capture("information-editor-actions-\(tag)")
    }

    private func replace(_ input: XCUIElement, with value: String) {
        reveal(input); input.tap(); input.typeKey("a", modifierFlags: .command)
        input.typeText(value.isEmpty ? XCUIKeyboardKey.delete.rawValue : value)
        if !value.isEmpty { XCTAssertEqual(input.value as? String, value) }
    }

    private func assertPrivateDraft(language: String) {
        let expected = language == "de"
            ? ["Nicht gesendet", "Entwurf wiederhergestellt · nicht gesendet"]
            : ["未提交", "已恢复草稿 · 未提交"]
        let state = app.staticTexts["time-poll-save-state"].label
        XCTAssertTrue(expected.contains(state), "Expected an exact unsubmitted draft state, got: \(state)")
        XCTAssertTrue(app.buttons["time-poll-submit"].isEnabled)
        XCTAssertFalse(app.staticTexts["time-poll-saved"].exists)
        XCTAssertFalse(app.buttons["plan-copy-link"].exists)
    }

    private func viewport() -> CGRect {
        let bounds = app.scrollViews["time-poll-detail-scroll"].frame.intersection(app.windows.firstMatch.frame)
        let top = max(bounds.minY, app.navigationBars.firstMatch.frame.maxY + 4)
        var bottom = bounds.maxY - 8
        for id in ["time-poll-save-state", "time-poll-saved", "time-poll-submit", "unified-plan-invite-window", "plan-participant-next-step"] {
            let item = app.descendants(matching: .any)[id].firstMatch
            if item.exists && item.isHittable { bottom = min(bottom, item.frame.minY - 8) }
        }
        if app.keyboards.firstMatch.exists {
            bottom = min(bottom, app.keyboards.firstMatch.frame.minY - 8)
            let assistant = app.otherElements["SystemInputAssistantView"].firstMatch
            if assistant.exists {
                let frame = assistant.frame
                if frame.width > 0 && frame.height > 0 && frame.intersects(app.windows.firstMatch.frame) {
                    bottom = min(bottom, frame.minY - 8)
                }
            }
        }
        return CGRect(x: bounds.minX, y: top, width: bounds.width, height: max(0, bottom - top))
    }

    /// Long display values are read in overlapping segments; inputs, labels and actions keep strict reveal().
    @discardableResult private func revealValue(_ target: XCUIElement, tag: String) -> CGPoint {
        XCTAssertTrue(["time-poll-detail-title", "plan-detail-location"].contains(target.identifier))
        XCTAssertTrue(target.waitForExistence(timeout: 10))
        if target.frame.height <= viewport().height {
            reveal(target)
        } else {
            let segmentHeight = viewport().height - 2
            XCTAssertGreaterThan(segmentHeight, 44)
            var offset: CGFloat = 0
            var index = 0
            while offset < target.frame.height {
                var readable = false
                for _ in 0..<12 {
                    let visible = viewport(), frame = target.frame
                    let segment = CGRect(x: frame.minX, y: frame.minY + offset, width: frame.width,
                                         height: min(segmentHeight, frame.height - offset))
                    XCTAssertGreaterThanOrEqual(frame.minX, visible.minX - 0.501)
                    XCTAssertLessThanOrEqual(frame.maxX, visible.maxX + 0.501)
                    // A display glyph's optical bounds may overhang the scroll edge by at most one point.
                    if visible.insetBy(dx: -0.501, dy: -1).contains(segment) { readable = true; break }
                    let above = segment.minY < visible.minY
                    let overflow = above ? visible.minY - segment.minY : max(0, segment.maxY - visible.maxY)
                    let distance = min(max(overflow + 12, 24), visible.height * 0.4)
                    let start = CGPoint(x: visible.minX + 12, y: visible.midY)
                    let end = CGPoint(x: start.x, y: start.y + (above ? distance : -distance))
                    XCTAssertTrue(visible.contains(start) && visible.contains(end))
                    drag(from: start, to: end)
                }
                let frame = target.frame, visible = viewport()
                let segment = CGRect(x: frame.minX, y: frame.minY + offset, width: frame.width,
                                     height: min(segmentHeight, frame.height - offset))
                print("INFORMATION_VALUE \(tag) segment=\(index) frame=\(frame) read=\(segment) viewport=\(visible)")
                capture("information-editor-value-\(tag)-segment-\(index)")
                XCTAssertTrue(readable && visible.insetBy(dx: -0.501, dy: -1).contains(segment),
                              "Each display-value segment must be readable above the keyboard/footer")
                if offset + segmentHeight >= frame.height { break }
                offset += segmentHeight - 24
                index += 1
            }
        }
        let visiblePart = target.frame.intersection(viewport())
        XCTAssertTrue(target.isHittable)
        XCTAssertGreaterThanOrEqual(visiblePart.width + 0.501, min(44, target.frame.width))
        XCTAssertGreaterThanOrEqual(visiblePart.height + 1, min(44, target.frame.height))
        return CGPoint(x: visiblePart.midX, y: visiblePart.midY)
    }

    private func tapValue(_ target: XCUIElement, tag: String) {
        let point = revealValue(target, tag: tag)
        XCTAssertTrue(target.frame.contains(point) && viewport().contains(point))
        app.coordinate(withNormalizedOffset: .zero).withOffset(CGVector(dx: point.x, dy: point.y)).tap()
    }

    private func reveal(_ target: XCUIElement) {
        XCTAssertTrue(target.waitForExistence(timeout: 10))
        for _ in 0..<12 {
            let visible = viewport()
            if target.isHittable && visible.insetBy(dx: -0.501, dy: -0.501).contains(target.frame) { return }
            XCTAssertGreaterThan(visible.height, 44)
            let above = target.frame.minY < visible.minY
            let overflow = above ? visible.minY - target.frame.minY : max(0, target.frame.maxY - visible.maxY)
            let distance = min(max(overflow + 12, 24), visible.height * 0.4)
            let start = CGPoint(x: visible.minX + 12, y: visible.midY)
            let end = CGPoint(x: start.x, y: start.y + (above ? distance : -distance))
            XCTAssertTrue(visible.contains(start) && visible.contains(end))
            drag(from: start, to: end)
        }
        print("INFORMATION_EDITOR_REVEAL_FAILED id=\(target.identifier) frame=\(target.frame) viewport=\(viewport())")
        capture("information-editor-reveal-failed")
        XCTFail("The full field, fixed label or action must be visible above keyboard/footer")
    }

    private func drag(from start: CGPoint, to end: CGPoint) {
        let origin = app.coordinate(withNormalizedOffset: .zero)
        origin.withOffset(CGVector(dx: start.x, dy: start.y)).press(forDuration: 0.05,
            thenDragTo: origin.withOffset(CGVector(dx: end.x, dy: end.y)),
            withVelocity: .slow, thenHoldForDuration: 0.2)
    }

    private func assertTarget(_ target: XCUIElement) {
        XCTAssertTrue(target.exists && target.isHittable)
        XCTAssertGreaterThanOrEqual(target.frame.width + 0.001, 44)
        XCTAssertGreaterThanOrEqual(target.frame.height + 0.001, 44)
        XCTAssertTrue(app.windows.firstMatch.frame.insetBy(dx: -0.501, dy: -0.501).contains(target.frame))
    }

    private func capture(_ name: String) {
        let attachment = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
        attachment.name = name; attachment.lifetime = .keepAlways; add(attachment)
    }
}
