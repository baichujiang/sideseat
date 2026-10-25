import XCTest
import UIKit
import Vision

/// Existing in-memory Together fixtures only. No real account or production API write.
@MainActor final class IntentionCardActionsPhoneUITests: XCTestCase {
    private struct Variant {
        let language: String
        let appearance: String
        let maximum: Bool
        var tag: String { "\(language)-\(appearance)-\(maximum ? "system-max" : "normal")" }
        var pause: String { language == "de" ? "Suche pausieren" : "暂停寻找" }
        var resume: String { language == "de" ? "Suche fortsetzen" : "恢复寻找" }
        var finding: String { language == "de" ? "Suche aktiv" : "正在寻找" }
        var paused: String { language == "de" ? "Pausiert" : "已暂停" }
        var unpublished: String { language == "de" ? "Noch keine Suche" : "尚未寻找" }
    }
    private struct PaintedLine { let text: String; let frame: CGRect }
    private var app: XCUIApplication!
    private var bundleID: String {
        ProcessInfo.processInfo.environment["SIDESEAT_PLAN_PRESENTATION_QA_BUNDLE"] ?? "app.sideseat.mobile.preview"
    }
    private let coffee = "ui-intent-coffee"
    private let sports = "ui-intent-sports"
    private let study = "ui-intent-study"

    override func setUpWithError() throws { continueAfterFailure = false }
    override func tearDown() async throws { await MainActor.run { app?.terminate() } }

    func testChineseLightNormalCards() throws { try verifyCards(.init(language: "zh-Hans", appearance: "light", maximum: false)) }
    func testGermanDarkNormalCards() throws { try verifyCards(.init(language: "de", appearance: "dark", maximum: false)) }
    func testChineseDarkSystemMaximumCards() throws { try verifyCards(.init(language: "zh-Hans", appearance: "dark", maximum: true)) }
    func testGermanLightSystemMaximumCards() throws { try verifyCards(.init(language: "de", appearance: "light", maximum: true)) }

    func testFixturePauseEditResumeShareAndDeleteCallbacks() throws {
        let variant = Variant(language: "zh-Hans", appearance: "light", maximum: false)
        launch(variant)
        let toggle = app.buttons["weekly-intent-toggle-pause-\(coffee)"]
        let edit = app.buttons["weekly-intent-edit-\(coffee)"]
        let status = statusText(coffee)
        let editor = element("intent-editor")
        assertStatus(coffee, equals: variant.finding)
        reveal(toggle); assertTarget(toggle); XCTAssertTrue(toggle.label.contains(variant.pause)); toggle.tap()
        waitForLabel(toggle, contains: variant.resume)
        assertStatus(coffee, equals: variant.paused)
        XCTAssertFalse(editor.exists, "The pause action must not bubble into the card's edit gesture")
        XCTAssertFalse(app.buttons["weekly-intent-share-\(coffee)"].exists)
        capture("intent223-paused-callback")

        openMenu(coffee)
        let menuEdit = app.buttons["weekly-intent-menu-edit-\(coffee)"]
        assertTarget(menuEdit, nativeMenuItem: true); menuEdit.tap()
        XCTAssertTrue(editor.waitForExistence(timeout: 8))
        let save = app.buttons["intent-editor-save"]
        XCTAssertTrue(save.waitForExistence(timeout: 8)); XCTAssertTrue(save.isEnabled)
        save.tap()
        XCTAssertTrue(editor.waitForNonExistence(timeout: 8))
        assertStatus(coffee, equals: variant.paused)
        waitForLabel(toggle, contains: variant.resume)
        capture("intent223-paused-edit-saved")

        reveal(toggle); assertTarget(toggle); toggle.tap()
        waitForLabel(toggle, contains: variant.pause)
        assertStatus(coffee, equals: variant.finding)
        XCTAssertFalse(editor.exists)
        let share = app.buttons["weekly-intent-share-\(coffee)"]
        reveal(share); assertTarget(share); share.tap()
        let shareError = element("weekly-intent-share-error-prompt-\(coffee)")
        XCTAssertTrue(shareError.waitForExistence(timeout: 15))
        XCTAssertFalse(editor.exists, "Sharing must not open the intention editor")
        let okay = app.buttons["weekly-intent-share-error-ok-\(coffee)"]
        XCTAssertTrue(okay.waitForExistence(timeout: 5)); assertTarget(okay); okay.tap()
        XCTAssertTrue(shareError.waitForNonExistence(timeout: 8))
        XCTAssertTrue(share.isEnabled, "The existing loopback-only share failure must release its working state")

        let delete = app.buttons["weekly-intent-delete-\(coffee)"]
        openMenu(coffee); assertTarget(delete, nativeMenuItem: true); delete.tap()
        let prompt = element("weekly-intent-delete-prompt-\(coffee)")
        XCTAssertTrue(prompt.waitForExistence(timeout: 8)); XCTAssertFalse(editor.exists)
        let cancel = app.buttons["weekly-intent-delete-cancel-\(coffee)"]
        assertTarget(cancel); capture("intent223-delete-cancel-prompt"); cancel.tap()
        XCTAssertTrue(prompt.waitForNonExistence(timeout: 8)); XCTAssertTrue(edit.exists)
        XCTAssertEqual(status.label, variant.finding, "Cancelling deletion must preserve the active intention")
        openMenu(coffee); assertTarget(delete, nativeMenuItem: true); delete.tap()
        XCTAssertTrue(prompt.waitForExistence(timeout: 8))
        let confirm = app.buttons["weekly-intent-delete-confirm-\(coffee)"]
        assertTarget(confirm); confirm.tap()
        XCTAssertTrue(edit.waitForNonExistence(timeout: 8))
        XCTAssertFalse(element("weekly-intent-\(coffee)").exists)
        assertStatus(sports, equals: variant.paused)
        assertStatus(study, equals: variant.unpublished)
        XCTAssertFalse(editor.exists)
        capture("intent223-deleted-only-selected-fixture")
        print("INTENTION223_CALLBACKS paused edited-still-paused resumed share-loopback-error delete-cancel deleted neighbor-states-preserved")
    }

    private func verifyCards(_ variant: Variant) throws {
        launch(variant)
        for (id, status) in [(coffee, variant.finding), (sports, variant.paused), (study, variant.unpublished)] {
            let card = element("weekly-intent-\(id)")
            XCTAssertTrue(card.waitForExistence(timeout: 8))
            assertStatus(id, equals: status)
            let edit = app.buttons["weekly-intent-edit-\(id)"]
            reveal(edit); assertTarget(edit)
            let menu = app.buttons["weekly-intent-menu-\(id)"]
            reveal(menu); assertTarget(menu)
            XCTAssertLessThanOrEqual(edit.frame.intersection(menu.frame).width, 0.5,
                                    "The title's edit target and the menu must use distinct layout space")
            let title = edit.staticTexts.matching(NSPredicate(format: "label == %@", "Coffee after class")).firstMatch
            if id == coffee {
                XCTAssertTrue(title.exists); reveal(title)
                try assertPaintedWords(["Coffee", "after", "class"], in: title, variant: variant)
                if variant.maximum {
                    XCTAssertGreaterThan(title.frame.height, 40, "The card title must use the actual accessibility font, not a compact capped size")
                }
            }
            capture("intent223-\(id)-header-\(variant.tag)")

            // Every leaf is brought fully into the real page viewport. At true system
            // maximum size a tall card is verified in overlapping continuous segments.
            var previousCaptureY = card.frame.minY
            let labels = card.staticTexts.allElementsBoundByIndex.filter { !$0.label.isEmpty }
            for label in labels {
                reveal(label)
                XCTAssertTrue(viewport.insetBy(dx: -0.5, dy: -0.5).contains(label.frame),
                              "The whole text block must remain above the native tab bar: \(label.label)")
                for control in ["share", "menu", "toggle-pause"] {
                    let action = app.buttons["weekly-intent-\(control)-\(id)"]
                    if action.exists {
                        let ownLabel = action.staticTexts.allElementsBoundByIndex.contains {
                            $0.label == label.label && $0.frame == label.frame
                        }
                        if !ownLabel { XCTAssertLessThanOrEqual(label.frame.intersection(action.frame).height, 1,
                            "Card text must not be painted underneath another action: \(label.label)") }
                    }
                }
                if abs(card.frame.minY - previousCaptureY) > 16 {
                    capture("intent223-\(id)-text-segment-\(label.identifier.isEmpty ? String(labels.firstIndex(of: label) ?? 0) : label.identifier)-\(variant.tag)")
                    previousCaptureY = card.frame.minY
                }
            }
            let toggle = app.buttons["weekly-intent-toggle-pause-\(id)"]
            let share = app.buttons["weekly-intent-share-\(id)"]
            reveal(toggle); assertTarget(toggle)
            XCTAssertTrue(viewport.insetBy(dx: -0.5, dy: -0.5).contains(toggle.frame))
            XCTAssertTrue(toggle.label.contains(id == sports ? variant.resume : variant.pause))
            reveal(toggle)
            try assertPaintedWords(variant.language == "de" ? ["Suche", id == sports ? "fortsetzen" : "pausieren"] : [id == sports ? variant.resume : variant.pause],
                                   in: toggle, variant: variant)
            capture("intent223-\(id)-finding-action-\(variant.tag)")
            if id != sports {
                reveal(share); assertTarget(share)
                XCTAssertLessThanOrEqual(share.frame.intersection(toggle.frame).height, 0.5,
                                        "Footer actions must not overlap")
            } else {
                XCTAssertFalse(share.exists, "A paused intention retains the existing rule that it cannot be shared")
            }
            openMenu(id)
            let menuEdit = app.buttons["weekly-intent-menu-edit-\(id)"]
            let delete = app.buttons["weekly-intent-delete-\(id)"]
            assertTarget(menuEdit, nativeMenuItem: true); assertTarget(delete, nativeMenuItem: true)
            XCTAssertLessThanOrEqual(menuEdit.frame.intersection(delete.frame).height, 0.5)
            capture("intent223-\(id)-menu-\(variant.tag)")
            // The native context menu dismisses on an actual outside tap.
            app.coordinate(withNormalizedOffset: .zero).withOffset(CGVector(dx: 4, dy: app.windows.firstMatch.frame.midY)).tap()
            XCTAssertTrue(delete.waitForNonExistence(timeout: 5))
            XCTAssertFalse(element("intent-editor").exists)
            print("INTENTION223_CARD \(id) \(variant.tag) status=\(status) edit=\(edit.frame) pause=\(toggle.frame) menu=\(menu.frame)")
        }
    }

    private func launch(_ variant: Variant) {
        app?.terminate(); app = XCUIApplication(bundleIdentifier: bundleID)
        app.launchArguments = ["--ui-testing-authenticated", "--ui-testing-ephemeral-credentials",
            "--ui-testing-skip-tutorial", "--ui-testing-local-api", "--ui-testing-weekly-intent",
            "--ui-testing-intent-card-states", "--ui-testing-mutual-opportunity", "--ui-testing-automatic-matching",
            "--ui-testing-together-matching", "--ui-testing-flexible-timing", "--ui-testing-discovery-matching",
            "--ui-testing-language=\(variant.language)", "--ui-testing-appearance=\(variant.appearance)",
            "-UIPreferredContentSizeCategoryName",
            variant.maximum ? "UICTContentSizeCategoryAccessibilityXXXL" : "UICTContentSizeCategoryL"]
        if variant.maximum { app.launchArguments.append("--ui-testing-dynamic-type-accessibility") }
        app.launchEnvironment = ["SIDESEAT_API_BASE_URL_OVERRIDE": "http://127.0.0.1:9"]
        app.launch(); XCTAssertTrue(app.tabBars.firstMatch.waitForExistence(timeout: 20))
        let together = app.tabBars.buttons.element(boundBy: 0)
        XCTAssertTrue(together.isHittable); together.tap()
        let menu = app.buttons["together-section-menu"]
        if menu.exists { assertTarget(menu); menu.tap() }
        let intentions = app.buttons["together-tab-intentions"]
        XCTAssertTrue(intentions.waitForExistence(timeout: 8)); assertTarget(intentions); intentions.tap()
        XCTAssertTrue(list.waitForExistence(timeout: 8))
    }

    private var list: XCUIElement { app.scrollViews["together-section-intentions"].firstMatch }
    private func element(_ id: String) -> XCUIElement { app.descendants(matching: .any).matching(identifier: id).firstMatch }
    private func statusText(_ id: String) -> XCUIElement {
        app.staticTexts.matching(identifier: "weekly-intent-status-\(id)").firstMatch
    }
    private func openMenu(_ id: String) {
        let menu = app.buttons["weekly-intent-menu-\(id)"]
        reveal(menu); assertTarget(menu); menu.tap()
        XCTAssertTrue(app.buttons["weekly-intent-menu-edit-\(id)"].waitForExistence(timeout: 5))
        XCTAssertFalse(element("intent-editor").exists, "Opening More must not trigger the title's edit gesture")
    }
    private var viewport: CGRect {
        let window = app.windows.firstMatch.frame
        let selector = element("together-segmented-control")
        let top = max(list.frame.minY, selector.exists ? selector.frame.maxY : app.navigationBars.firstMatch.frame.maxY) + 4
        let bottom = min(list.frame.maxY, app.tabBars.firstMatch.frame.minY) - 8
        return CGRect(x: window.minX + 12, y: top, width: window.width - 24, height: max(0, bottom - top))
    }

    private func reveal(_ target: XCUIElement) {
        for _ in 0..<24 {
            let bounds = viewport
            if target.exists {
                let frame = target.frame
                XCTAssertLessThanOrEqual(frame.height, bounds.height, "Each complete text block/action must fit within the viewport: \(target.identifier)")
                if target.isHittable && bounds.insetBy(dx: -0.5, dy: -0.5).contains(frame) { return }
                let points = frame.maxY > bounds.maxY ? min(180, frame.maxY - bounds.maxY + 12)
                    : -min(180, bounds.minY - frame.minY + 12)
                drag(points: points, bounds: bounds)
            } else { drag(points: 160, bounds: bounds) }
        }
        capture("intent223-unreachable-\(target.identifier)")
        XCTFail("Complete target is not reachable inside the current card viewport: \(target.identifier)")
    }

    private func drag(points: CGFloat, bounds: CGRect) {
        let upward = points > 0
        let travel = min(abs(points), bounds.height * 0.45)
        let start = CGPoint(x: bounds.midX, y: upward ? bounds.midY + travel / 2 : bounds.midY - travel / 2)
        let end = CGPoint(x: start.x, y: start.y + (upward ? -travel : travel))
        let origin = app.coordinate(withNormalizedOffset: .zero)
        origin.withOffset(CGVector(dx: start.x, dy: start.y)).press(forDuration: 0.05,
            thenDragTo: origin.withOffset(CGVector(dx: end.x, dy: end.y)))
    }

    private func assertTarget(_ target: XCUIElement, nativeMenuItem: Bool = false) {
        XCTAssertTrue(target.exists && target.isHittable, target.identifier)
        XCTAssertTrue(app.windows.firstMatch.frame.insetBy(dx: -0.5, dy: -0.5).contains(target.frame))
        XCTAssertGreaterThanOrEqual(target.frame.width + 0.001, 44)
        // iOS renders standard context-menu rows at 42pt on this device;
        // custom card controls must retain their own 44pt touch target.
        XCTAssertGreaterThanOrEqual(target.frame.height + 0.001, nativeMenuItem ? 40 : 44)
    }

    private func assertStatus(_ id: String, equals text: String) {
        let status = statusText(id)
        XCTAssertTrue(status.waitForExistence(timeout: 8))
        let expectation = XCTNSPredicateExpectation(predicate: NSPredicate(format: "label == %@", text), object: status)
        XCTAssertEqual(XCTWaiter.wait(for: [expectation], timeout: 8), .completed, "Expected status text \(text), got \(status.label)")
        reveal(status)
        XCTAssertEqual(status.label, text)
    }

    private func waitForLabel(_ target: XCUIElement, contains text: String) {
        let expectation = XCTNSPredicateExpectation(predicate: NSPredicate(format: "label CONTAINS %@", text), object: target)
        XCTAssertEqual(XCTWaiter.wait(for: [expectation], timeout: 8), .completed, "Expected \(text), got \(target.label)")
    }

    private func assertPaintedWords(_ words: [String], in target: XCUIElement, variant: Variant) throws {
        let screen = XCUIScreen.main.screenshot()
        let image = try XCTUnwrap(screen.image.cgImage)
        let window = app.windows.firstMatch.frame, frame = target.frame
        XCTAssertTrue(viewport.insetBy(dx: -0.5, dy: -0.5).contains(frame))
        let scaleX = CGFloat(image.width) / window.width, scaleY = CGFloat(image.height) / window.height
        let pixels = CGRect(x: (frame.minX - window.minX) * scaleX, y: (frame.minY - window.minY) * scaleY,
                            width: frame.width * scaleX, height: frame.height * scaleY).integral
        let crop = try XCTUnwrap(image.cropping(to: pixels))
        let request = VNRecognizeTextRequest()
        request.recognitionLevel = .accurate; request.usesLanguageCorrection = false
        request.recognitionLanguages = variant.language == "de" ? ["de-DE", "en-US"] : ["zh-Hans", "en-US"]
        try VNImageRequestHandler(cgImage: crop).perform([request])
        let lines = (request.results ?? []).compactMap { result -> PaintedLine? in
            guard let text = result.topCandidates(1).first?.string else { return nil }
            let box = result.boundingBox
            return PaintedLine(text: text, frame: CGRect(x: frame.minX + box.minX * frame.width,
                y: frame.minY + (1 - box.maxY) * frame.height, width: box.width * frame.width, height: box.height * frame.height))
        }
        for word in words {
            let escaped = NSRegularExpression.escapedPattern(for: word)
            let pattern = variant.language == "de" || word.first?.isASCII == true ? "\\b\(escaped)\\b" : escaped
            XCTAssertTrue(lines.contains { $0.text.replacingOccurrences(of: " ", with: "").range(of: pattern, options: [.regularExpression, .caseInsensitive]) != nil }
                || lines.contains { $0.text.range(of: pattern, options: [.regularExpression, .caseInsensitive]) != nil },
                "The painted word must be complete on one line: \(word); OCR=\(lines.map(\.text))")
        }
        let diagnostic = lines.map { "\($0.text) | \($0.frame)" }.joined(separator: "\n")
        let attachment = XCTAttachment(string: diagnostic)
        attachment.name = "intent223-painted-\(target.identifier)-\(variant.tag)"; attachment.lifetime = .keepAlways; add(attachment)
    }

    private func capture(_ name: String) {
        let attachment = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
        attachment.name = name; attachment.lifetime = .keepAlways; add(attachment)
    }
}
