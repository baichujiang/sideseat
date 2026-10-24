import XCTest
import UIKit
import Vision

/// Local fixtures only. OCR inspects painted glyphs, rather than the complete AX label.
@MainActor final class TypographyLayoutPhoneUITests: XCTestCase {
    private var app: XCUIApplication!
    private let variants = [("zh-Hans", false), ("de", true)]
    private struct PaintedLine { let text: String; let frame: CGRect }
    private var bundleID: String {
        ProcessInfo.processInfo.environment["SIDESEAT_PLAN_PRESENTATION_QA_BUNDLE"] ?? "app.sideseat.mobile.preview"
    }
    override func setUpWithError() throws { continueAfterFailure = false }
    override func tearDown() { app?.terminate() }

    func testCalendarDatesAcrossLanguagesAndTextSizes() throws {
        let traits = UITraitCollection(preferredContentSizeCategory: .extraLarge)
        let caption = UIFontMetrics(forTextStyle: .caption2).scaledFont(
            for: UIFont.systemFont(ofSize: 11, weight: .semibold), compatibleWith: traits)
        print("TYPOGRAPHY_WEEK_HEADER_BUDGET captionXlarge=\(caption.lineHeight) spacing=4 circle=34 total=\(caption.lineHeight + 4 + 34) header=56")
        XCTAssertLessThanOrEqual(caption.lineHeight + 4 + 34, 56, "Weekday, spacing and complete date circle must fit the fixed header")
        for (language, large) in variants {
            let tag = "\(language)-\(large ? "largest" : "normal")"
            launch(language: language, large: large)
            app.tabBars.buttons.element(boundBy: 2).tap()
            XCTAssertTrue(app.descendants(matching: .any)["home-week-timetable"].firstMatch.waitForExistence(timeout: 10))
            let seven = app.buttons.matching(NSPredicate(format: "label IN %@", ["7 days", "7 天", "7 Tage"])).firstMatch
            XCTAssertTrue(seven.waitForExistence(timeout: 5)); XCTAssertTrue(seven.isHittable); seven.tap()
            XCTAssertTrue(seven.isSelected)
            let headers = app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH %@", "home-week-day-"))
                .allElementsBoundByIndex.filter { $0.isHittable && $0.frame.intersects(app.windows.firstMatch.frame) }
            XCTAssertEqual(headers.count, 7)
            capture("typography-week-dates-\(tag)")
            for header in headers {
                assertTarget(header)
                let day = try expectedDay(header.identifier)
                let lines = try paintedLines(in: header.frame, language: language)
                XCTAssertTrue(lines.flatMap { $0.text.split(whereSeparator: { !$0.isNumber }).map(String.init) }.contains(day),
                              "The actual week header must paint day \(day), OCR=\(lines.map(\.text))")
            }
            if large {
                let top = (headers.map { $0.frame.maxY }.max() ?? 0) + 4
                let bottom = app.tabBars.firstMatch.frame.minY - 110
                try assertReadableHourRail(in: CGRect(x: 0, y: top, width: 52, height: max(0, bottom - top)),
                                           language: language, tag: "week-\(tag)")
            }
            if large, let header = headers.dropFirst(3).first {
                let selectedID = header.identifier.replacingOccurrences(of: "home-week-day-", with: "home-date-")
                header.tap()
                XCTAssertTrue(app.descendants(matching: .any)["calendar-day-timeline"].firstMatch.waitForExistence(timeout: 8))
                let selected = app.buttons[selectedID]
                XCTAssertTrue(selected.waitForExistence(timeout: 5)); XCTAssertTrue(selected.isSelected)
                capture("typography-day-strip-\(tag)")
                print("TYPOGRAPHY_DAY_STRIP selected=\(selected.frame) label=\(selected.label)")
                assertTarget(selected)
                let day = try expectedDay(selectedID)
                let lines = try paintedLines(in: selected.frame, language: language)
                XCTAssertTrue(lines.flatMap { $0.text.split(whereSeparator: { !$0.isNumber }).map(String.init) }.contains(day),
                              "The selected Day-strip date must remain readable: \(lines.map(\.text))")
                let top = selected.frame.maxY + 8
                let bottom = app.tabBars.firstMatch.frame.minY - 90
                try assertReadableHourRail(in: CGRect(x: 0, y: top, width: 56, height: max(0, bottom - top)),
                                           language: language, tag: "day-\(tag)")
            }
            app.terminate()
        }
    }

    func testIntentionSourceHeadersAcrossLanguagesAndTextSizes() throws {
        for (language, large) in variants {
            let tag = "\(language)-\(large ? "largest" : "normal")"
            launch(language: language, large: large)
            app.tabBars.buttons.element(boundBy: 3).tap()
            let row = app.buttons["inbox-row-ui-connection-leo"]
            XCTAssertTrue(row.waitForExistence(timeout: 8)); row.tap()
            XCTAssertTrue(app.descendants(matching: .any)["direct-chat"].firstMatch.waitForExistence(timeout: 8))
            let expected = language == "de" ? "Gemeinsam Kaffee trinken" : "一起喝咖啡"
            let bubble = app.descendants(matching: .any)["chat-bubble-ui-flexible-source"].firstMatch
            XCTAssertTrue(bubble.waitForExistence(timeout: 8))
            let header = bubble.staticTexts.matching(NSPredicate(format: "label == %@", expected)).firstMatch
            XCTAssertTrue(header.waitForExistence(timeout: 8))
            reveal(header, in: app.scrollViews["chat-message-list"], above: app.textViews["chat-composer-field"])
            capture("typography-chat-source-header-\(tag)")
            let lines = try paintedLines(in: header.frame, language: language)
            if language == "de" {
                for word in ["Gemeinsam", "Kaffee", "trinken"] {
                    XCTAssertTrue(lines.contains { $0.text.range(of: "\\b\(word)\\b", options: [.regularExpression, .caseInsensitive]) != nil },
                                  "The painted title must keep \(word) together on one line: \(lines.map(\.text))")
                }
            } else {
                XCTAssertTrue(lines.map(\.text).joined().replacingOccurrences(of: " ", with: "").contains(expected),
                              "The complete Chinese title must remain painted: \(lines.map(\.text))")
            }
            if large {
                let propose = app.buttons["mutual-opportunity-propose-plan-ui-flexible-opportunity"]
                reveal(propose, in: app.scrollViews["chat-message-list"], above: app.textViews["chat-composer-field"])
                assertTarget(propose); propose.tap()
                let form = app.descendants(matching: .any)["plan-create-sheet"].firstMatch
                XCTAssertTrue(form.waitForExistence(timeout: 8))
                let recipient = form.staticTexts.matching(NSPredicate(format: "label IN %@", ["利奥", "Leo"])).firstMatch
                XCTAssertTrue(recipient.waitForExistence(timeout: 5))
                reveal(recipient, in: form.scrollViews.firstMatch, above: app.buttons["plan-create-submit"])
                print("TYPOGRAPHY_RECIPIENT_MAXIMUM title=\(recipient.frame) label=\(recipient.label)")
                XCTAssertGreaterThan(recipient.frame.height, 40,
                                     "The recipient heading must use the actual system accessibility size inside the sheet")
                capture("typography-source-propose-form-\(tag)")
                let cancel = app.navigationBars.buttons.matching(NSPredicate(format: "label IN %@", ["取消", "Abbrechen", "Cancel"])).firstMatch
                assertTarget(cancel); cancel.tap()
                XCTAssertTrue(form.waitForNonExistence(timeout: 8))
                app.navigationBars.buttons.firstMatch.tap()
                app.tabBars.buttons.element(boundBy: 0).tap()
                try verifyOwnIntentionHeader(language: language, tag: tag)
            }
            app.terminate()
        }
    }

    private func verifyOwnIntentionHeader(language: String, tag: String) throws {
        let menu = app.buttons["together-section-menu"]
        if menu.exists { menu.tap() }
        let intentions = app.buttons["together-tab-intentions"]
        XCTAssertTrue(intentions.waitForExistence(timeout: 5)); intentions.tap()
        let page = app.scrollViews["together-section-intentions"]
        let header = page.buttons["weekly-intent-edit-ui-intent-coffee"]
        reveal(header, in: page)
        assertTarget(header)
        let title = header.staticTexts.matching(NSPredicate(format: "label == %@", "Coffee after class")).firstMatch
        XCTAssertTrue(title.waitForExistence(timeout: 5))
        let share = app.buttons["weekly-intent-share-ui-intent-coffee"]
        let delete = app.buttons["weekly-intent-delete-ui-intent-coffee"]
        assertTarget(share); assertTarget(delete)
        XCTAssertFalse(share.frame.intersects(delete.frame))
        capture("typography-own-intention-header-\(tag)")
        let lines = try paintedLines(in: title.frame, language: language)
        let titleLines = lines.filter { $0.text.range(of: "Coffee|after|class", options: [.regularExpression, .caseInsensitive]) != nil }
        XCTAssertFalse(titleLines.isEmpty, "The existing Coffee after class fixture title must remain painted")
        for line in titleLines {
            XCTAssertFalse(line.frame.intersects(share.frame)); XCTAssertFalse(line.frame.intersects(delete.frame))
        }
    }

    private func launch(language: String, large: Bool) {
        app?.terminate(); app = XCUIApplication(bundleIdentifier: bundleID)
        app.launchArguments = ["--ui-testing-authenticated", "--ui-testing-ephemeral-credentials", "--ui-testing-skip-tutorial",
            "--ui-testing-chats", "--ui-testing-reset-inbox-unread", "--ui-testing-local-api", "--ui-testing-flexible-timing",
            "--ui-testing-discover", "--ui-testing-weekly-intent", "--ui-testing-mutual-opportunity",
            "--ui-testing-automatic-matching", "--ui-testing-together-matching", "--ui-testing-discovery-matching",
            "--ui-testing-intent-card-states", "--ui-testing-language=\(language)", "--ui-testing-appearance=\(large ? "dark" : "light")",
            "-UIPreferredContentSizeCategoryName", large ? "UICTContentSizeCategoryAccessibilityXXXL" : "UICTContentSizeCategoryL"]
        if large { app.launchArguments.append("--ui-testing-dynamic-type-accessibility") }
        app.launchEnvironment = ["SIDESEAT_API_BASE_URL_OVERRIDE": "http://127.0.0.1:9"]
        app.launch(); XCTAssertTrue(app.tabBars.firstMatch.waitForExistence(timeout: 20))
    }

    private func expectedDay(_ identifier: String) throws -> String {
        String(try XCTUnwrap(Int(try XCTUnwrap(identifier.split(separator: "-").last))))
    }

    private func assertReadableHourRail(in frame: CGRect, language: String, tag: String) throws {
        XCTAssertGreaterThan(frame.height, 44, "The hour-rail sample must include actual visible timeline content")
        let lines = try paintedLines(in: frame, language: language)
        print("TYPOGRAPHY_HOUR_RAIL \(tag) frame=\(frame) lines=\(lines.map(\.text))")
        XCTAssertTrue(lines.contains {
            $0.text.range(of: "^\\s*(?:1[0-9]|2[0-3])\\s*$", options: .regularExpression) != nil
        }, "The painted rail must show a complete two-digit hour (10–23), rather than an ellipsis: \(lines.map(\.text))")
    }

    private func paintedLines(in frame: CGRect, language: String) throws -> [PaintedLine] {
        let screenshot = XCUIScreen.main.screenshot()
        let image = try XCTUnwrap(screenshot.image.cgImage)
        let bounds = app.windows.firstMatch.frame
        let visible = frame.intersection(bounds)
        XCTAssertFalse(visible.isEmpty)
        let sx = CGFloat(image.width) / bounds.width, sy = CGFloat(image.height) / bounds.height
        let pixels = CGRect(x: (visible.minX - bounds.minX) * sx, y: (visible.minY - bounds.minY) * sy,
                            width: visible.width * sx, height: visible.height * sy).integral
        let crop = try XCTUnwrap(image.cropping(to: pixels))
        let request = VNRecognizeTextRequest()
        request.recognitionLevel = .accurate
        request.usesLanguageCorrection = false
        request.recognitionLanguages = language == "de" ? ["de-DE", "en-US"] : ["zh-Hans", "en-US"]
        try VNImageRequestHandler(cgImage: crop).perform([request])
        let lines = (request.results ?? []).compactMap { observation -> PaintedLine? in
            guard let text = observation.topCandidates(1).first?.string else { return nil }
            let box = observation.boundingBox
            return PaintedLine(text: text, frame: CGRect(x: visible.minX + box.minX * visible.width,
                y: visible.minY + (1 - box.maxY) * visible.height, width: box.width * visible.width, height: box.height * visible.height))
        }.sorted { $0.frame.minY < $1.frame.minY }
        let diagnostic = lines.map { "\($0.text) | \($0.frame)" }.joined(separator: "\n")
        print("TYPOGRAPHY_OCR frame=\(frame)\n\(diagnostic)")
        let attachment = XCTAttachment(string: diagnostic); attachment.name = "typography-painted-lines"; attachment.lifetime = .keepAlways; add(attachment)
        return lines
    }

    private func reveal(_ target: XCUIElement, in scroll: XCUIElement, above bottomControl: XCUIElement? = nil) {
        for _ in 0..<10 {
            let bounds = app.windows.firstMatch.frame
            let top = app.navigationBars.firstMatch.frame.maxY
            let bottom = bottomControl?.exists == true ? bottomControl!.frame.minY - 8
                : app.tabBars.firstMatch.exists ? app.tabBars.firstMatch.frame.minY : bounds.maxY - 8
            let visible = CGRect(x: bounds.minX, y: top, width: bounds.width, height: max(0, bottom - top))
            if target.exists && target.isHittable && visible.insetBy(dx: -0.501, dy: -0.501).contains(target.frame) { return }
            if target.exists && target.frame.minY < top { scroll.swipeDown(velocity: .slow) }
            else { scroll.swipeUp(velocity: .slow) }
        }
        capture("typography-control-not-visible")
        XCTFail("The complete typography target must be reachable: \(target.identifier)")
    }

    private func assertTarget(_ target: XCUIElement) {
        XCTAssertTrue(target.exists && target.isHittable)
        XCTAssertTrue(app.windows.firstMatch.frame.insetBy(dx: -0.501, dy: -0.501).contains(target.frame))
        XCTAssertGreaterThanOrEqual(target.frame.width + 0.001, 44)
        XCTAssertGreaterThanOrEqual(target.frame.height + 0.001, 44)
    }

    private func capture(_ name: String) {
        let attachment = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
        attachment.name = name; attachment.lifetime = .keepAlways; add(attachment)
    }
}
