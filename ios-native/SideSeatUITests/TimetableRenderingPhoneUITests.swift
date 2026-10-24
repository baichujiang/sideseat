import XCTest
import UIKit

/// Reads the disposable plan and edits local drafts only; never submits or invites.
@MainActor final class TimetableRenderingPhoneUITests: XCTestCase {
    private struct Account: Decodable { let role: String; let accessToken: String }
    private struct Fixture: Decodable {
        let bundle: String
        let finalBlockToken: String
        let accounts: [Account]
    }
    private var app: XCUIApplication!

    override func setUpWithError() throws { continueAfterFailure = false }
    override func tearDown() { app?.terminate() }

    func testLargestFinalPaintAfterOuterScroll() throws {
        let raw = ProcessInfo.processInfo.environment["SIDESEAT_PLAN_CONTACTS_JSON"]
        try XCTSkipIf(raw == nil, "Requires the disposable timetable fixture.")
        let fixture = try JSONDecoder().decode(Fixture.self, from: Data(try XCTUnwrap(raw).utf8))
        let owner = try XCTUnwrap(fixture.accounts.first { $0.role == "owner" })
        launch(fixture: fixture, owner: owner, language: "de", large: true, resetSystemTextSize: false)
        let first = cell(0), second = cell(2)
        XCTAssertTrue(first.waitForExistence(timeout: 25))
        if app.buttons["time-poll-cancel-final"].exists { app.buttons["time-poll-cancel-final"].tap() }
        enterFinal()
        if app.buttons["time-poll-reset-final"].exists { app.buttons["time-poll-reset-final"].tap() }
        // Preserve the original auto-scroll path that exposed a visually blank grid despite AX success.
        first.tap(); second.tap()
        let review = app.buttons["unified-plan-review-roster"]
        XCTAssertTrue(review.isEnabled)
        let viewport = app.scrollViews["time-poll-final-scroll"]
        let summary = app.staticTexts["time-poll-final-summary"]
        let top = app.navigationBars.firstMatch.frame.maxY + 4
        for _ in 0..<8 {
            if first.frame.minY >= top && second.frame.maxY <= summary.frame.minY - 8 { break }
            let origin = app.coordinate(withNormalizedOffset: .zero)
            let startY = min(summary.frame.minY - 24, max(top + 24, viewport.frame.minY - 24))
            let amount: CGFloat = second.frame.maxY > summary.frame.minY - 8 ? -140 : 140
            origin.withOffset(CGVector(dx: 20, dy: startY)).press(forDuration: 0.1,
                thenDragTo: origin.withOffset(CGVector(dx: 20, dy: startY + amount)))
        }
        print("TIMETABLE_ORIGINAL_PATH first=\(first.frame) second=\(second.frame) inner=\(viewport.frame) summary=\(summary.frame)")
        capture("timetable-original-path-before-paint-check-de-largest-dark")
        for target in [first, second] {
            XCTAssertTrue(target.isHittable)
            XCTAssertGreaterThanOrEqual(target.frame.minX, app.frame.minX - 0.501)
            XCTAssertLessThanOrEqual(target.frame.maxX, app.frame.maxX + 0.501)
            XCTAssertGreaterThanOrEqual(target.frame.minY, top)
            XCTAssertLessThanOrEqual(target.frame.maxY, summary.frame.minY - 8)
            XCTAssertTrue(viewport.frame.insetBy(dx: -0.501, dy: -0.501)
                .contains(CGPoint(x: target.frame.midX, y: target.frame.midY)))
        }
        first.tap(); XCTAssertFalse(first.isSelected)
        first.tap(); XCTAssertTrue(first.isSelected)
        assertFinalHour()
        try assertPaintedSelection(first, tag: "timetable-original-path-painted-de-largest-dark")
        app.terminate(); app.launch()
        XCTAssertTrue(review.waitForExistence(timeout: 25))
        XCTAssertTrue(first.waitForExistence(timeout: 10))
        revealPair(first, second, final: true)
        XCTAssertTrue(first.isSelected && second.isSelected); assertFinalHour()
        try assertPaintedSelection(first, tag: "timetable-original-path-reopened-de-largest-dark")
    }

    func testTimetablePaintAndLocalSelectionAcrossTextSizes() throws {
        let raw = ProcessInfo.processInfo.environment["SIDESEAT_PLAN_CONTACTS_JSON"]
        try XCTSkipIf(raw == nil, "Requires the disposable timetable fixture.")
        let fixture = try JSONDecoder().decode(Fixture.self, from: Data(try XCTUnwrap(raw).utf8))
        let owner = try XCTUnwrap(fixture.accounts.first { $0.role == "owner" })
        for (language, large) in [("zh-Hans", false), ("zh-Hans", true), ("de", false), ("de", true)] {
            let tag = "\(language)-\(large ? "largest" : "normal")-dark"
            launch(fixture: fixture, owner: owner, language: language, large: large)
            let first = cell(0), second = cell(2)
            XCTAssertTrue(first.waitForExistence(timeout: 25))
            if app.buttons["time-poll-cancel-final"].exists { app.buttons["time-poll-cancel-final"].tap() }
            XCTAssertTrue(app.buttons["unified-plan-invite-window"].waitForExistence(timeout: 8))
            if !large { try verifyCrossColumnDrag(final: false, tag: tag) }
            revealPair(first, second, final: false)
            let originalAvailability = first.isSelected
            first.tap(); XCTAssertEqual(first.isSelected, !originalAvailability)
            first.tap(); XCTAssertEqual(first.isSelected, originalAvailability)
            assertAvailabilityFooter(large: large)
            capture("timetable-availability-restored-\(tag)")
            XCTAssertFalse(app.buttons["time-poll-undo"].exists)

            enterFinal()
            let reset = app.buttons["time-poll-reset-final"]
            if reset.exists { XCTAssertTrue(reset.isHittable); reset.tap() }
            let review = app.buttons["unified-plan-review-roster"]
            XCTAssertFalse(review.isEnabled)
            if !large { try verifyCrossColumnDrag(final: true, tag: tag) }
            revealPair(first, second, final: true)
            XCTAssertFalse(first.isSelected || second.isSelected)
            first.tap(); second.tap()
            XCTAssertTrue(first.isSelected && second.isSelected)
            first.tap(); XCTAssertFalse(first.isSelected)
            first.tap(); XCTAssertTrue(first.isSelected)
            assertFinalHour()
            try assertPaintedSelection(first, tag: "timetable-final-selected-\(tag)")

            // The existing long-press gesture must select and erase the same contiguous hour.
            first.tap(); second.tap()
            XCTAssertFalse(first.isSelected || second.isSelected)
            XCTAssertFalse(review.isEnabled)
            first.press(forDuration: 0.5, thenDragTo: second)
            XCTAssertTrue(first.isSelected && second.isSelected); assertFinalHour()
            capture("timetable-final-drag-selected-\(tag)")
            first.press(forDuration: 0.5, thenDragTo: second)
            XCTAssertFalse(first.isSelected || second.isSelected)
            XCTAssertFalse(review.isEnabled)
            first.tap(); second.tap(); assertFinalHour()

            let back = app.buttons["time-poll-cancel-final"]
            XCTAssertTrue(back.isHittable); back.tap()
            XCTAssertTrue(app.buttons["unified-plan-invite-window"].waitForExistence(timeout: 8))
            revealPair(first, second, final: false)
            XCTAssertEqual(first.isSelected, originalAvailability, "Final-time editing must preserve availability")
            enterFinal(); revealPair(first, second, final: true)
            XCTAssertTrue(first.isSelected && second.isSelected); assertFinalHour()

            app.terminate(); app.launch()
            XCTAssertTrue(review.waitForExistence(timeout: 25))
            XCTAssertTrue(first.waitForExistence(timeout: 10))
            revealPair(first, second, final: true)
            XCTAssertTrue(first.isSelected && second.isSelected); assertFinalHour()
            try assertPaintedSelection(first, tag: "timetable-final-reopened-\(tag)")
            XCTAssertFalse(app.buttons["time-poll-undo"].exists)
            XCTAssertEqual(app.state, .runningForeground)
            app.terminate()
        }
    }

    private func launch(fixture: Fixture, owner: Account, language: String, large: Bool, resetSystemTextSize: Bool = true) {
        app?.terminate(); app = XCUIApplication(bundleIdentifier: fixture.bundle)
        app.launchArguments = ["--ui-testing-authenticated", "--ui-testing-ephemeral-credentials",
            "--ui-testing-skip-tutorial", "--ui-testing-time-poll-live", "--ui-testing-language=\(language)",
            "--ui-testing-appearance=dark", "--ui-testing-deep-link=/time-polls/\(fixture.finalBlockToken)"]
        if resetSystemTextSize { app.launchArguments += ["-UIPreferredContentSizeCategoryName", "UICTContentSizeCategoryL"] }
        if large { app.launchArguments.append("--ui-testing-dynamic-type-accessibility") }
        app.launchEnvironment = ["SIDESEAT_QA_ACCESS_TOKEN": owner.accessToken]
        app.launch()
    }

    private func cell(_ id: Int) -> XCUIElement { app.buttons["time-poll-cell-\(id)"] }

    private func assertAvailabilityFooter(large: Bool) {
        let status = app.staticTexts["time-poll-save-state"]
        let summary = app.staticTexts["time-poll-selection-summary"]
        XCTAssertTrue(status.exists && summary.exists)
        let bounds = app.windows.firstMatch.frame
        for text in [status, summary] {
            XCTAssertTrue(text.isHittable)
            XCTAssertTrue(bounds.insetBy(dx: -0.501, dy: -0.501).contains(text.frame))
            XCTAssertLessThanOrEqual(text.frame.height, large ? 100 : 60,
                                    "Status and selected-hours text must not fragment into a tall narrow column")
        }
        XCTAssertFalse(status.frame.intersects(summary.frame))
        let choose = app.buttons["unified-plan-invite-window"]
        let submit = app.buttons["time-poll-submit"]
        let actionTop = min(choose.frame.minY, submit.exists ? submit.frame.minY : choose.frame.minY)
        XCTAssertLessThanOrEqual(max(status.frame.maxY, summary.frame.maxY), actionTop)
        if large {
            XCTAssertLessThan(bounds.maxY - status.frame.minY, bounds.height * 0.4,
                              "The fixed availability controls must leave enough screen height for the timetable")
        }
    }

    private func verifyCrossColumnDrag(final: Bool, tag: String) throws {
        // IDs retain the first quarter-slot ID: the fixture has 48 quarter slots per date.
        let targets = [0, 2, 48, 50].map { cell($0) }
        let first = targets[0], last = targets[3]
        revealPair(first, last, final: final)
        let original = targets.map(\.isSelected)
        for target in targets {
            XCTAssertTrue(target.exists && target.isHittable)
            XCTAssertGreaterThanOrEqual(target.frame.width + 0.001, 44)
            XCTAssertGreaterThanOrEqual(target.frame.height + 0.001, 44)
            if target.isSelected { target.tap() }
        }
        first.press(forDuration: 0.5, thenDragTo: last)
        for target in targets { XCTAssertTrue(target.isSelected, "Diagonal dragging must include both columns and rows") }
        if final { XCTAssertTrue(app.buttons["unified-plan-review-roster"].isEnabled) }
        try assertPaintedSelection(first, tag: "timetable-\(final ? "final-cross-day" : "availability-rectangle")-drag-\(tag)")
        last.press(forDuration: 0.5, thenDragTo: first)
        for target in targets { XCTAssertFalse(target.isSelected, "Reverse dragging must erase the same range") }
        if final { XCTAssertFalse(app.buttons["unified-plan-review-roster"].isEnabled) }
        capture("timetable-\(final ? "final-cross-day" : "availability-rectangle")-erased-\(tag)")
        for (index, target) in targets.enumerated() where original[index] { target.tap() }
        for (index, target) in targets.enumerated() {
            XCTAssertEqual(target.isSelected, original[index], "The local gesture check must restore its original selection")
        }
    }

    private func enterFinal() {
        let choose = app.buttons["unified-plan-invite-window"]
        XCTAssertTrue(choose.waitForExistence(timeout: 8)); XCTAssertTrue(choose.isHittable)
        XCTAssertGreaterThanOrEqual(choose.frame.height + 0.001, 44)
        choose.tap()
        let review = app.buttons["unified-plan-review-roster"]
        XCTAssertTrue(review.waitForExistence(timeout: 10)); XCTAssertTrue(review.isHittable)
        XCTAssertGreaterThanOrEqual(review.frame.height + 0.001, 44)
    }

    private func visibleDetailBounds() -> CGRect {
        let scroll = app.scrollViews["time-poll-detail-scroll"]
        let bounds = scroll.frame.intersection(app.windows.firstMatch.frame)
        let top = max(bounds.minY, app.navigationBars.firstMatch.frame.maxY + 4)
        var bottom = bounds.maxY - 8
        for id in ["time-poll-save-state", "time-poll-saved", "time-poll-submit",
                   "unified-plan-invite-window", "time-poll-final-summary", "unified-plan-review-roster"] {
            let footer = app.descendants(matching: .any)[id].firstMatch
            if footer.exists && footer.isHittable { bottom = min(bottom, footer.frame.minY - 8) }
        }
        return CGRect(x: bounds.minX, y: top, width: bounds.width, height: max(0, bottom - top))
    }

    private func revealPair(_ first: XCUIElement, _ second: XCUIElement, final: Bool) {
        XCTAssertTrue(first.waitForExistence(timeout: 10)); XCTAssertTrue(second.exists)
        for _ in 0..<12 {
            let visible = visibleDetailBounds()
            let pair = first.frame.union(second.frame)
            if first.isHittable && second.isHittable && visible.insetBy(dx: -0.501, dy: -0.501).contains(pair) { break }
            XCTAssertGreaterThan(visible.height, pair.height + 8, "The fixed controls must leave room for both rows")
            let above = pair.minY < visible.minY
            let overflow = above ? visible.minY - pair.minY : max(0, pair.maxY - visible.maxY)
            let distance = min(max(overflow + 12, 24), visible.height * 0.4)
            let start = CGPoint(x: visible.minX + 20, y: visible.midY)
            let end = CGPoint(x: start.x, y: start.y + (above ? distance : -distance))
            XCTAssertTrue(visible.contains(start) && visible.contains(end))
            let origin = app.coordinate(withNormalizedOffset: .zero)
            origin.withOffset(CGVector(dx: start.x - app.frame.minX, dy: start.y - app.frame.minY))
                .press(forDuration: 0.05,
                    thenDragTo: origin.withOffset(CGVector(dx: end.x - app.frame.minX, dy: end.y - app.frame.minY)),
                    withVelocity: .slow, thenHoldForDuration: 0.2)
        }
        let visible = visibleDetailBounds()
        if !first.isHittable || !second.isHittable
            || !visible.insetBy(dx: -0.501, dy: -0.501).contains(first.frame.union(second.frame)) {
            print("TIMETABLE_REVEAL_FAILED final=\(final) first=\(first.frame) second=\(second.frame) visible=\(visible) outer=\(app.scrollViews["time-poll-detail-scroll"].frame) window=\(app.windows.firstMatch.frame)")
            capture("timetable-reveal-failed-\(final ? "final" : "availability")")
        }
        for target in [first, second] {
            XCTAssertTrue(target.isHittable)
            XCTAssertTrue(visible.insetBy(dx: -0.501, dy: -0.501).contains(target.frame), "The entire time cell must remain above the fixed controls")
            if final {
                let inner = app.scrollViews["time-poll-final-scroll"]
                XCTAssertTrue(inner.exists)
                XCTAssertTrue(inner.frame.contains(CGPoint(x: target.frame.midX, y: target.frame.midY)))
            }
        }
    }

    private func assertFinalHour() {
        let summary = app.staticTexts["time-poll-final-summary"]
        XCTAssertTrue(summary.exists)
        XCTAssertTrue(summary.label.contains("09:00") && summary.label.contains("10:00"), summary.label)
        let review = app.buttons["unified-plan-review-roster"]
        XCTAssertTrue(review.isEnabled && review.isHittable)
        XCTAssertLessThanOrEqual(summary.frame.maxY, review.frame.minY)
    }

    private func assertPaintedSelection(_ selected: XCUIElement, tag: String) throws {
        XCTAssertTrue(selected.isSelected)
        let bounds = app.windows.firstMatch.frame, frame = selected.frame
        XCTAssertTrue(bounds.insetBy(dx: -0.501, dy: -0.501).contains(frame))
        let borderPoint = CGPoint(x: frame.minX + 1, y: frame.midY)
        let fillPoint = CGPoint(x: frame.minX + 8, y: frame.midY)
        XCTAssertTrue(frame.contains(borderPoint) && frame.contains(fillPoint))
        let screenshot = XCUIScreen.main.screenshot()
        let image = try XCTUnwrap(screenshot.image.cgImage)
        let border = try rgb(image, at: borderPoint, bounds: bounds)
        let fill = try rgb(image, at: fillPoint, bounds: bounds)
        let difference = zip(border, fill).map { abs(Int($0.0) - Int($0.1)) }.max() ?? 0
        print("TIMETABLE_PAINT \(tag) borderRGB=\(border) fillRGB=\(fill) maxChannelDifference=\(difference)")
        attach(screenshot, name: tag)
        XCTAssertGreaterThan(difference, 30, "The actual screen must show a distinct selection border and fill; AX selection alone is insufficient")
    }

    private func rgb(_ image: CGImage, at point: CGPoint, bounds: CGRect) throws -> [UInt8] {
        let pixelX = floor((point.x - bounds.minX) * CGFloat(image.width) / bounds.width)
        let pixelY = floor((point.y - bounds.minY) * CGFloat(image.height) / bounds.height)
        XCTAssertGreaterThanOrEqual(pixelX, 0); XCTAssertLessThan(pixelX, CGFloat(image.width))
        XCTAssertGreaterThanOrEqual(pixelY, 0); XCTAssertLessThan(pixelY, CGFloat(image.height))
        let pixel = try XCTUnwrap(image.cropping(to: CGRect(x: pixelX, y: pixelY, width: 1, height: 1)))
        var rgba = [UInt8](repeating: 0, count: 4)
        try rgba.withUnsafeMutableBytes { buffer in
            let context = try XCTUnwrap(CGContext(data: buffer.baseAddress, width: 1, height: 1,
                bitsPerComponent: 8, bytesPerRow: 4, space: CGColorSpaceCreateDeviceRGB(),
                bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue | CGBitmapInfo.byteOrder32Big.rawValue))
            context.draw(pixel, in: CGRect(x: 0, y: 0, width: 1, height: 1))
        }
        return Array(rgba.prefix(3))
    }

    private func capture(_ name: String) { attach(XCUIScreen.main.screenshot(), name: name) }

    private func attach(_ screenshot: XCUIScreenshot, name: String) {
        let attachment = XCTAttachment(screenshot: screenshot)
        attachment.name = name; attachment.lifetime = .keepAlways; add(attachment)
    }
}
