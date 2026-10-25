import XCTest

/// Reads the same live, disposable plan after the native contact flow has published it.
/// No new plan, reply, message, profile change or API mutation is made by this suite.
@MainActor final class InlineInvitationRosterPhoneUITests: XCTestCase {
    private struct Account: Decodable {
        let role: String
        let accessToken: String
    }
    private struct Fixture: Decodable {
        let title: String
        let bundle: String
        let accounts: [Account]
    }
    private struct Variant {
        let language: String
        let maximum: Bool
        var tag: String { "\(language)-light-\(maximum ? "system-max" : "normal")" }
        var accepted: String { language == "de" ? "Angenommen" : "已接受" }
        var you: String { language == "de" ? "Du" : "你" }
    }
    private var app: XCUIApplication!
    private let variants = [Variant(language: "zh-Hans", maximum: false),
                            Variant(language: "de", maximum: true)]

    override func setUpWithError() throws { continueAfterFailure = false }

    func testPublishedRosterIsInlineForBothRolesAndMaximumText() throws {
        let raw = ProcessInfo.processInfo.environment["SIDESEAT_PLAN_CONTACTS_JSON"]
        try XCTSkipIf(raw == nil || raw!.isEmpty, "Requires the completed disposable contact plan.")
        let fixture = try JSONDecoder().decode(Fixture.self, from: Data(raw!.utf8))
        addTeardownBlock { [self] in MainActor.assumeIsolated { app?.terminate() } }
        let suffix = String((fixture.title.split(separator: " ").last ?? "").prefix(4))
        let names = ["Ming" + suffix, "Lin" + suffix]
        for role in ["owner", "participant"] {
            let account = try XCTUnwrap(fixture.accounts.first { $0.role == role })
            for variant in variants {
                let tag = "\(role)-\(variant.tag)"
                launch(account, bundle: fixture.bundle, variant: variant)
                let plans = app.tabBars.buttons.element(boundBy: 1)
                XCTAssertTrue(plans.isHittable); plans.tap(); XCTAssertTrue(plans.isSelected)
                let upcoming = app.buttons["plans-tab-upcoming"]
                assertCustomTarget(upcoming); upcoming.tap(); XCTAssertTrue(upcoming.isSelected)
                let card = app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH 'plans-coordinated-' AND label CONTAINS %@", fixture.title)).firstMatch
                let list = app.scrollViews["plans-scroll-upcoming"].firstMatch
                XCTAssertTrue(list.waitForExistence(timeout: 20))
                let create = app.buttons["plans-create-unified"].exists ? app.buttons["plans-create-unified"] : app.buttons["plans-create-primary"]
                let listTop = max(list.frame.minY, upcoming.frame.maxY) + 4
                let listBottom = min(list.frame.maxY, create.frame.minY - 12)
                let listBounds = CGRect(x: list.frame.minX, y: listTop,
                                        width: list.frame.width, height: listBottom - listTop)
                materialize(card, in: list, bounds: listBounds)
                revealCenter(card, in: list, bounds: listBounds)
                card.tap()
                XCTAssertTrue(element("time-poll-detail-title").waitForExistence(timeout: 20))
                XCTAssertEqual(element("time-poll-detail-title").label, fixture.title)
                let scroll = app.scrollViews["unified-plan-confirmation-scroll"].firstMatch
                XCTAssertTrue(scroll.waitForExistence(timeout: 10))
                XCTAssertFalse(app.buttons["plan-people-open"].exists)
                XCTAssertFalse(app.buttons["plan-people-done"].exists)
                XCTAssertFalse(element("plan-people-list").exists)
                let calendar = app.buttons["plan-view-calendar"]
                assertCustomTarget(calendar)
                capture("inline-roster-confirmed-entry-\(tag)")

                let roster = element("unified-plan-inline-people")
                materialize(roster, in: scroll, bounds: detailViewport(scroll))
                let summary = element("unified-plan-confirmation-count")
                materialize(summary, in: scroll, bounds: detailViewport(scroll))
                revealFully(summary, in: scroll, bounds: detailViewport(scroll))
                capture("inline-roster-summary-\(tag)")
                let rows = roster.descendants(matching: .any).matching(NSPredicate(format: "identifier BEGINSWITH 'unified-plan-person-'"))
                XCTAssertEqual(rows.count, 2, "Both original invitation records are visible in the page hierarchy")
                let ownName = role == "owner" ? names[0] : names[1]
                for name in names {
                    let row = rows.matching(NSPredicate(format: "label CONTAINS %@", name)).firstMatch
                    materialize(row, in: scroll, bounds: detailViewport(scroll))
                    XCTAssertTrue(row.label.contains(variant.accepted), row.label)
                    if name == ownName { XCTAssertTrue(row.label.contains(variant.you), row.label) }
                    revealFully(row, in: scroll, bounds: detailViewport(scroll))
                    XCTAssertTrue(row.isHittable)
                    let frame = row.frame, bounds = detailViewport(scroll)
                    XCTAssertTrue(bounds.contains(frame), "The complete name and reply must be painted above the fixed actions")
                    for other in rows.allElementsBoundByIndex where other.identifier != row.identifier {
                        XCTAssertLessThanOrEqual(frame.intersection(other.frame).height, 1, "Invitation rows must not overlap each other")
                    }
                    capture("inline-roster-\(name == names[0] ? "owner-row" : "peer-row")-\(tag)")
                }
                // Continuous screen segments retain the roster's section context at actual
                // system maximum size; overlapping segments avoid a cropped-row visual claim.
                let first = rows.element(boundBy: 0)
                let last = rows.element(boundBy: rows.count - 1)
                revealFully(first, in: scroll, bounds: detailViewport(scroll))
                capture("inline-roster-continuous-01-\(tag)")
                var segment = 1
                while last.frame.maxY > detailViewport(scroll).maxY && segment < 8 {
                    let viewport = detailViewport(scroll)
                    drag(in: scroll, bounds: viewport, upward: true, points: max(40, viewport.height - 32))
                    segment += 1
                    capture(String(format: "inline-roster-continuous-%02d-", segment) + tag)
                }
                XCTAssertLessThanOrEqual(last.frame.maxY, detailViewport(scroll).maxY)
                assertCustomTarget(calendar)
                XCTAssertFalse(app.buttons["plan-people-open"].exists)
                print("INLINE_ROSTER221_VERIFIED \(tag) two-accepted-inline-rows calendar-reachable")
                app.terminate()
            }
        }
    }

    private func launch(_ account: Account, bundle: String, variant: Variant) {
        app?.terminate(); app = XCUIApplication(bundleIdentifier: bundle)
        app.launchArguments = ["--ui-testing-authenticated", "--ui-testing-ephemeral-credentials",
            "--ui-testing-skip-tutorial", "--ui-testing-time-poll-live", "--ui-testing-language=\(variant.language)",
            "--ui-testing-appearance=light", "-UIPreferredContentSizeCategoryName",
            variant.maximum ? "UICTContentSizeCategoryAccessibilityXXXL" : "UICTContentSizeCategoryL"]
        if variant.maximum { app.launchArguments.append("--ui-testing-dynamic-type-accessibility") }
        app.launchEnvironment = ["SIDESEAT_QA_ACCESS_TOKEN": account.accessToken]
        app.launch()
        XCTAssertTrue(app.tabBars.firstMatch.waitForExistence(timeout: 25))
    }

    private func element(_ id: String) -> XCUIElement {
        app.descendants(matching: .any).matching(identifier: id).firstMatch
    }

    private func detailViewport(_ scroll: XCUIElement) -> CGRect {
        let window = app.windows.firstMatch.frame
        let top = max(scroll.frame.minY, app.navigationBars.firstMatch.frame.maxY) + 4
        let footerIDs = ["plan-next-step", "unified-plan-accepted-status", "plan-view-calendar", "unified-plan-decline"]
        let footerTop = footerIDs.map(element).filter { $0.exists && $0.isHittable }.map { $0.frame.minY }.min() ?? window.maxY
        let bottom = min(scroll.frame.maxY, footerTop - 20)
        return CGRect(x: window.minX + 12, y: top, width: window.width - 24, height: bottom - top)
    }

    private func materialize(_ target: XCUIElement, in scroll: XCUIElement, bounds: CGRect) {
        // Do not read offscreen or virtualized frames until the element exists.
        for _ in 0..<14 where !target.exists { drag(in: scroll, bounds: bounds, upward: true, points: 150) }
        XCTAssertTrue(target.exists)
    }

    private func revealCenter(_ target: XCUIElement, in scroll: XCUIElement, bounds: CGRect) {
        for _ in 0..<18 {
            let frame = target.frame
            if target.isHittable && bounds.contains(CGPoint(x: frame.midX, y: frame.midY)) { return }
            drag(in: scroll, bounds: bounds, upward: frame.midY > bounds.midY, points: 140)
        }
        XCTAssertTrue(target.isHittable)
        XCTAssertTrue(bounds.contains(CGPoint(x: target.frame.midX, y: target.frame.midY)))
    }

    private func revealFully(_ target: XCUIElement, in scroll: XCUIElement, bounds: CGRect) {
        XCTAssertLessThanOrEqual(target.frame.height, bounds.height, "A complete participant row must fit the readable viewport")
        print("INLINE_ROSTER221_GEOMETRY \(target.identifier) target=\(target.frame) viewport=\(bounds) scroll=\(scroll.frame)")
        for _ in 0..<20 {
            let frame = target.frame
            if target.isHittable && bounds.contains(frame) { return }
            let upward = frame.maxY > bounds.maxY
            let distance = upward ? frame.maxY - bounds.maxY : bounds.minY - frame.minY
            drag(in: scroll, bounds: bounds, upward: upward, points: min(150, max(28, distance + 12)))
        }
        capture("inline-roster-unreachable-" + target.identifier)
        print("INLINE_ROSTER221_UNREACHABLE \(target.identifier) target=\(target.frame) viewport=\(bounds) scroll=\(scroll.frame)")
        XCTAssertTrue(bounds.contains(target.frame))
    }

    private func drag(in scroll: XCUIElement, bounds: CGRect, upward: Bool, points: CGFloat) {
        // safeAreaInset leaves the accessibility ScrollView frame underneath its fixed
        // footer. Both ends must lie in the measured, unobscured content viewport.
        let touchBounds = bounds.insetBy(dx: 4, dy: 12)
        XCTAssertGreaterThan(touchBounds.height, 44)
        let distance = min(points, touchBounds.height * 0.6)
        let center = CGPoint(x: touchBounds.midX, y: touchBounds.midY)
        let from = CGPoint(x: center.x, y: center.y + (upward ? distance * 0.5 : -distance * 0.5))
        let to = CGPoint(x: center.x, y: center.y + (upward ? -distance * 0.5 : distance * 0.5))
        XCTAssertTrue(touchBounds.contains(from) && touchBounds.contains(to))
        let origin = app.coordinate(withNormalizedOffset: .zero)
        origin.withOffset(CGVector(dx: from.x, dy: from.y)).press(forDuration: 0.05,
            thenDragTo: origin.withOffset(CGVector(dx: to.x, dy: to.y)), withVelocity: .slow, thenHoldForDuration: 0)
    }

    private func assertCustomTarget(_ target: XCUIElement) {
        XCTAssertTrue(target.waitForExistence(timeout: 15)); XCTAssertTrue(target.isHittable && target.isEnabled)
        XCTAssertGreaterThanOrEqual(target.frame.width, 44)
        XCTAssertGreaterThanOrEqual(target.frame.height, 44)
        XCTAssertTrue(app.windows.firstMatch.frame.contains(target.frame))
    }

    private func capture(_ name: String) {
        let attachment = XCTAttachment(screenshot: app.screenshot())
        attachment.name = name; attachment.lifetime = .keepAlways; add(attachment)
    }
}
