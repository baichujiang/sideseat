import XCTest
import Vision

/// Existing offline records only. This suite never sends a message, deletes a record,
/// publishes a plan or saves a profile; those mutations belong to the disposable live flow.
@MainActor final class PopupAndConfirmedCardPhoneUITests: XCTestCase {
    private var app: XCUIApplication!
    private var systemTopInset: CGFloat = 0
    private struct Variant {
        let language: String
        let appearance: String
        let large: Bool
        var tag: String { "\(language)-\(appearance)-\(large ? "system-max" : "normal")" }
    }
    private let variants = [Variant(language: "zh-Hans", appearance: "light", large: false),
                            Variant(language: "de", appearance: "dark", large: false),
                            Variant(language: "zh-Hans", appearance: "dark", large: true),
                            Variant(language: "de", appearance: "light", large: true)]
    private var popupScope: String {
        let value = ProcessInfo.processInfo.environment["SIDESEAT_POPUP_SCOPE"] ?? "all"
        return ["maximum", "maximum-de", "ordinary-menus"].contains(value) ? value : "all"
    }
    private var selectedVariants: [Variant] {
        let selected: [Variant]
        switch popupScope {
        case "maximum": selected = variants.filter(\.large)
        case "maximum-de": selected = variants.filter { $0.large && $0.language == "de" }
        case "ordinary-menus": selected = variants.filter { !$0.large }
        default: selected = variants
        }
        print("POPUP220_VARIANT_SCOPE \(popupScope) \(selected.map(\.tag).joined(separator: ","))")
        return selected
    }
    private var window: CGRect { app.windows.firstMatch.frame }
    private var bundleID: String {
        ProcessInfo.processInfo.environment["SIDESEAT_PLAN_PRESENTATION_QA_BUNDLE"] ?? "app.sideseat.mobile.preview"
    }

    override func setUpWithError() throws { continueAfterFailure = false }
    override func tearDown() { app?.terminate() }

    func testConfirmedCalendarCardAcrossLanguagesAppearanceAndMaximumText() throws {
        for variant in selectedVariants {
            launch(variant)
            selectRoot(1)
            let confirmed = app.buttons["plans-tab-upcoming"]
            assertTarget(confirmed); confirmed.tap(); XCTAssertTrue(confirmed.isSelected)
            let card = app.buttons["plans-row-ui-plan-accepted"]
            XCTAssertTrue(card.waitForExistence(timeout: 10))
            let calendar = Calendar.autoupdatingCurrent
            let day = try XCTUnwrap(calendar.date(byAdding: .day, value: 2, to: calendar.startOfDay(for: Date())))
            let start = try XCTUnwrap(calendar.date(byAdding: .hour, value: 18, to: day))
            let end = start.addingTimeInterval(90 * 60)
            let formatter = DateFormatter()
            formatter.locale = Locale(identifier: variant.language); formatter.timeZone = calendar.timeZone
            formatter.setLocalizedDateFormatFromTemplate("MMMdEEE")
            XCTAssertTrue(card.label.contains(formatter.string(from: start)),
                          "The calendar tile must preserve its complete date and weekday in accessibility")
            formatter.setLocalizedDateFormatFromTemplate("jmm")
            XCTAssertTrue(card.label.contains(formatter.string(from: start)))
            XCTAssertTrue(card.label.contains(formatter.string(from: end)))
            XCTAssertTrue(card.label.contains("Dinner in town") && card.label.contains("Maxvorstadt"))
            let originalLabel = card.label
            if variant.large {
                showCompleteCard(card, tag: variant.tag)
            } else {
                reveal(card, in: app.scrollViews["plans-scroll-upcoming"], bounds: planViewport)
                capture("confirmed-calendar-card-\(variant.tag)")
                try assertPaintedCalendarTile(card, day: calendar.component(.day, from: start), language: variant.language)
            }
            let visible = revealCardSegment(card)
            tap(point: CGPoint(x: visible.minX + visible.width * 0.5, y: visible.midY))
            XCTAssertTrue(element("direct-chat").waitForExistence(timeout: 10),
                          "The same entire card must still open its original conversation")
            capture("confirmed-original-route-\(variant.tag)")
            let back = app.navigationBars.firstMatch.buttons.firstMatch
            assertTarget(back); back.tap()
            XCTAssertTrue(confirmed.waitForExistence(timeout: 10)); XCTAssertTrue(confirmed.isSelected)
            XCTAssertEqual(card.label, originalLabel)
            app.terminate()
        }
    }

    func testObjectMenusAndCenteredPromptsAcrossLanguagesAppearanceAndMaximumText() throws {
        for variant in selectedVariants {
            launch(variant)
            verifyInboxMenus(variant)
            if popupScope != "ordinary-menus" {
                verifyIntentionDeleteCancel(variant)
                verifyAppearanceDiscard(variant)
                try verifyCalendarReadOnlyDetail(variant)
            }
            app.terminate()
        }
    }

    func testMaximumGermanAppearanceDiscardActions() {
        let variant = Variant(language: "de", appearance: "light", large: true)
        launch(variant)
        verifyAppearanceDiscard(variant)
        app.terminate()
    }

    private func launch(_ variant: Variant) {
        app?.terminate(); app = XCUIApplication(bundleIdentifier: bundleID)
        app.launchArguments = ["--ui-testing-authenticated", "--ui-testing-ephemeral-credentials",
            "--ui-testing-skip-tutorial", "--ui-testing-local-api", "--ui-testing-chats",
            "--ui-testing-weekly-intent", "--ui-testing-intent-card-states",
            "--ui-testing-plans-mixed-waiting", "--ui-testing-plans-waiting-rail",
            "--ui-testing-language=\(variant.language)", "--ui-testing-appearance=\(variant.appearance)",
            "-UIPreferredContentSizeCategoryName",
            variant.large ? "UICTContentSizeCategoryAccessibilityXXXL" : "UICTContentSizeCategoryL"]
        if variant.large { app.launchArguments.append("--ui-testing-dynamic-type-accessibility") }
        app.launchEnvironment = ["SIDESEAT_API_BASE_URL_OVERRIDE": "http://127.0.0.1:9"]
        app.launch()
        XCTAssertTrue(app.tabBars.firstMatch.waitForExistence(timeout: 20))
        XCTAssertTrue(element("root-navigation-title").waitForExistence(timeout: 10))
        // The inline root navigation bar starts below the visible system status region.
        // Capture that observable boundary before sheets replace the root chrome.
        let rootNavigation = app.navigationBars.firstMatch
        XCTAssertTrue(rootNavigation.waitForExistence(timeout: 8))
        systemTopInset = rootNavigation.frame.minY - window.minY
        XCTAssertGreaterThan(systemTopInset, 0)
    }

    private func selectRoot(_ index: Int) {
        let tab = app.tabBars.buttons.element(boundBy: index)
        XCTAssertTrue(tab.isHittable); tab.tap(); XCTAssertTrue(tab.isSelected)
    }

    private func verifyInboxMenus(_ variant: Variant) {
        selectRoot(3)
        let list = app.collectionViews["inbox-list"].exists ? app.collectionViews["inbox-list"] : element("inbox-list")
        let bounds = CGRect(x: window.minX, y: app.navigationBars.firstMatch.frame.maxY + 4,
                            width: window.width, height: app.tabBars.firstMatch.frame.minY - app.navigationBars.firstMatch.frame.maxY - 12)
        // Pinned first row and chronologically last row exercise both available-space branches.
        for id in ["ui-connection", "ui-connection-nora"] {
            let row = app.buttons["inbox-row-\(id)"]
            if id == "ui-connection-nora" {
                materializeKnownLaterRow("inbox-row-ui-connection-nora", in: list, bounds: bounds)
            }
            reveal(row, in: list, bounds: bounds)
            let originalLabel = row.label, originalValue = row.value as? String, source = row.frame
            row.press(forDuration: 0.7)
            let menu = element("long-press-action-menu")
            XCTAssertTrue(menu.waitForExistence(timeout: 8)); assertInWindow(menu)
            // These visible MVP fixtures are direct conversations. Hide is intentionally
            // restricted to retained course/group kinds (NativeInboxConversation.supportsHide).
            let actionIDs = ["read", "pin"].map { "inbox-row-\(id)-\($0)-menu" }
            XCTAssertFalse(app.buttons["inbox-row-\(id)-hide-menu"].exists)
            if variant.large {
                XCTAssertGreaterThan(menu.frame.height, window.height * 0.65,
                                     "Accessibility text opens the scrollable large panel directly")
                let scroll = app.scrollViews["long-press-action-menu"].firstMatch
                XCTAssertTrue(scroll.exists)
                let menuBounds = menu.frame.insetBy(dx: 0, dy: 12)
                for actionID in actionIDs + ["long-press-menu-cancel"] {
                    let action = app.buttons[actionID]
                    reveal(action, in: scroll, bounds: menuBounds); assertTarget(action)
                    capture("inbox-large-panel-\(id)-\(actionID)-\(variant.tag)")
                }
                app.buttons["long-press-menu-cancel"].tap()
            } else {
                XCTAssertEqual(menu.buttons.count, 2, "Direct conversations retain exactly read and pin actions")
                XCTAssertFalse(app.buttons["long-press-menu-cancel"].exists,
                               "Regular text uses an object-anchored menu rather than a distant sheet")
                XCTAssertGreaterThanOrEqual(menu.frame.minY, app.navigationBars.firstMatch.frame.maxY - 1)
                XCTAssertLessThanOrEqual(menu.frame.maxY, app.tabBars.firstMatch.frame.minY - 4)
                XCTAssertGreaterThanOrEqual(menu.frame.minX, window.minX + 11)
                XCTAssertLessThanOrEqual(menu.frame.maxX, window.maxX - 11)
                let gap = min(abs(menu.frame.maxY - source.minY), abs(source.maxY - menu.frame.minY))
                XCTAssertLessThanOrEqual(gap, 24, "The menu must remain attached to its actual source row")
                XCTAssertLessThanOrEqual(menu.frame.intersection(source).height, 1)
                for actionID in actionIDs { assertTarget(app.buttons[actionID]) }
                capture("inbox-anchored-\(id)-\(variant.tag)")
                let outside = CGPoint(x: window.minX + 3, y: window.midY)
                XCTAssertFalse(menu.frame.contains(outside)); tap(point: outside)
            }
            XCTAssertTrue(menu.waitForNonExistence(timeout: 8))
            XCTAssertTrue(app.tabBars.buttons.element(boundBy: 3).isSelected)
            XCTAssertFalse(element("direct-chat").exists)
            XCTAssertEqual(row.label, originalLabel); XCTAssertEqual(row.value as? String, originalValue)
        }
    }

    private func verifyIntentionDeleteCancel(_ variant: Variant) {
        selectRoot(0)
        let sectionMenu = app.buttons["together-section-menu"]
        if sectionMenu.exists {
            assertTarget(sectionMenu); sectionMenu.tap()
            let picker = element("together-section-picker")
            XCTAssertTrue(picker.waitForExistence(timeout: 8))
            let option = picker.buttons["together-tab-intentions"]
            reveal(option, in: app.scrollViews.firstMatch, bounds: window.insetBy(dx: 0, dy: 80))
            assertTarget(option); option.tap(); XCTAssertTrue(picker.waitForNonExistence(timeout: 8))
        } else {
            let option = app.buttons["together-tab-intentions"]
            assertTarget(option); option.tap()
        }
        let section = app.scrollViews["together-section-intentions"]
        XCTAssertTrue(section.waitForExistence(timeout: 8))
        let cardID = "weekly-intent-ui-intent-coffee"
        let card = element(cardID), delete = app.buttons["weekly-intent-delete-ui-intent-coffee"]
        XCTAssertTrue(card.waitForExistence(timeout: 8))
        reveal(delete, in: section, bounds: rootContentBounds); assertTarget(delete); delete.tap()
        let prompt = element("weekly-intent-delete-prompt-ui-intent-coffee")
        assertCenteredPrompt(prompt)
        let cancel = app.buttons["weekly-intent-delete-cancel-ui-intent-coffee"]
        let confirm = app.buttons["weekly-intent-delete-confirm-ui-intent-coffee"]
        verifyPromptActions(prompt: prompt, actions: [cancel, confirm], variant: variant, tag: "intention-delete")
        reveal(cancel, in: promptScrollingContainer(prompt), bounds: prompt.frame.insetBy(dx: 0, dy: 8))
        assertTarget(cancel); cancel.tap()
        XCTAssertTrue(prompt.waitForNonExistence(timeout: 8)); XCTAssertTrue(card.exists)
        XCTAssertTrue(delete.isEnabled, "Cancel must keep the existing intention available")
        verifyIntentionShareError(variant, in: section)
    }

    private func verifyIntentionShareError(_ variant: Variant, in section: XCUIElement) {
        let share = app.buttons["weekly-intent-share-ui-intent-coffee"]
        let prompt = element("weekly-intent-share-error-prompt-ui-intent-coffee")
        let okay = app.buttons["weekly-intent-share-error-ok-ui-intent-coffee"]
        // The real share action reaches only the explicitly configured loopback port9. The
        // refused local connection exercises the existing error path without a real write.
        for attempt in 1...2 {
            reveal(share, in: section, bounds: rootContentBounds); assertTarget(share); share.tap()
            assertCenteredPrompt(prompt)
            reveal(okay, in: promptScrollingContainer(prompt), bounds: prompt.frame.insetBy(dx: 0, dy: 8))
            assertTarget(okay)
            capture("intention-share-error-attempt-\(attempt)-\(variant.tag)")
            let outside = CGPoint(x: window.minX + 3, y: window.midY)
            XCTAssertFalse(prompt.frame.contains(outside)); tap(point: outside)
            XCTAssertTrue(prompt.exists, "This existing confirmation requires its explicit OK exit")
            okay.tap(); XCTAssertTrue(prompt.waitForNonExistence(timeout: 8))
            XCTAssertTrue(share.isEnabled, "Error cleanup must permit a new share attempt")
        }
    }

    private func verifyAppearanceDiscard(_ variant: Variant) {
        selectRoot(4)
        let open = app.buttons["me-personalization"]
        reveal(open, in: app.scrollViews["me-profile"], bounds: rootContentBounds)
        assertTarget(open); open.tap()
        let classic = app.buttons["appearance-theme-classic"], rose = app.buttons["appearance-theme-rose"]
        XCTAssertTrue(element("appearance-preview").waitForExistence(timeout: 8))
        let form = app.collectionViews.firstMatch.exists ? app.collectionViews.firstMatch : app.tables.firstMatch
        let sheetBounds = CGRect(x: window.minX, y: app.navigationBars.firstMatch.frame.maxY + 4,
                                 width: window.width, height: window.maxY - app.navigationBars.firstMatch.frame.maxY - 40)
        materializeKnownLaterRow("appearance-theme-classic", in: form, bounds: sheetBounds)
        reveal(classic, in: form, bounds: sheetBounds); XCTAssertTrue(classic.isSelected)
        materializeKnownLaterRow("appearance-theme-rose", in: form, bounds: sheetBounds)
        reveal(rose, in: form, bounds: sheetBounds); XCTAssertFalse(rose.isSelected)
        assertTarget(rose); rose.tap(); XCTAssertTrue(rose.isSelected)
        let cancel = toolbarButton(["取消", "Abbrechen", "Cancel"])
        assertTarget(cancel); cancel.tap()
        let prompt = element("appearance-discard-prompt")
        assertCenteredPrompt(prompt)
        let keep = app.buttons["appearance-keep-editing"], discard = app.buttons["appearance-discard"]
        verifyPromptActions(prompt: prompt, actions: [keep, discard], variant: variant, tag: "appearance-discard")
        reveal(keep, in: promptScrollingContainer(prompt), bounds: prompt.frame.insetBy(dx: 0, dy: 8))
        assertTarget(keep); keep.tap(); XCTAssertTrue(prompt.waitForNonExistence(timeout: 8))
        materializeKnownLaterRow("appearance-theme-rose", in: form, bounds: sheetBounds)
        reveal(rose, in: form, bounds: sheetBounds); XCTAssertTrue(rose.isSelected)
        XCTAssertTrue(app.buttons["appearance-save"].isEnabled, "Keep editing retains the unsaved selection")
        cancel.tap(); assertCenteredPrompt(prompt)
        reveal(discard, in: promptScrollingContainer(prompt), bounds: prompt.frame.insetBy(dx: 0, dy: 8))
        assertTarget(discard); discard.tap()
        XCTAssertTrue(prompt.waitForNonExistence(timeout: 8))
        XCTAssertTrue(app.scrollViews["me-profile"].waitForExistence(timeout: 8))
        reveal(open, in: app.scrollViews["me-profile"], bounds: rootContentBounds); open.tap()
        XCTAssertTrue(element("appearance-preview").waitForExistence(timeout: 8))
        let reopenedForm = app.collectionViews.firstMatch.exists ? app.collectionViews.firstMatch : app.tables.firstMatch
        materializeKnownLaterRow("appearance-theme-classic", in: reopenedForm, bounds: sheetBounds)
        reveal(classic, in: reopenedForm, bounds: sheetBounds); XCTAssertTrue(classic.isSelected)
        materializeKnownLaterRow("appearance-theme-rose", in: reopenedForm, bounds: sheetBounds)
        reveal(rose, in: reopenedForm, bounds: sheetBounds); XCTAssertFalse(rose.isSelected)
        XCTAssertFalse(app.buttons["appearance-save"].isEnabled, "Discard must not save the draft")
        capture("appearance-discard-restored-\(variant.tag)")
        toolbarButton(["取消", "Abbrechen", "Cancel"]).tap()
        XCTAssertTrue(app.scrollViews["me-profile"].waitForExistence(timeout: 8))
        XCTAssertFalse(prompt.exists, "An unchanged reopened sheet closes without another discard prompt")
    }

    private func verifyCalendarReadOnlyDetail(_ variant: Variant) throws {
        selectRoot(2)
        assertTarget(app.buttons["calendar-search"]); app.buttons["calendar-search"].tap()
        XCTAssertTrue(element("calendar-search-sheet").waitForExistence(timeout: 8))
        let search = app.searchFields.firstMatch
        assertTarget(search); search.tap(); search.typeText("Weekly planning")
        let result = app.buttons["calendar-search-result-ui-recurring-event"]
        XCTAssertTrue(result.waitForExistence(timeout: 8))
        // A maximum-text result may extend below the keyboard; open a verified visible 44 pt
        // part of that actual result, without canceling the native search and clearing its query.
        let resultBottom = app.keyboards.firstMatch.exists ? app.keyboards.firstMatch.frame.minY : window.maxY - 36
        let resultViewport = CGRect(x: window.minX, y: app.navigationBars.firstMatch.frame.maxY + 4,
                                    width: window.width, height: max(0, resultBottom - app.navigationBars.firstMatch.frame.maxY - 8))
        let resultRegion = result.frame.intersection(resultViewport)
        XCTAssertTrue(result.isHittable)
        XCTAssertGreaterThanOrEqual(resultRegion.height, 44); XCTAssertGreaterThanOrEqual(resultRegion.width, 44)
        tap(point: CGPoint(x: resultRegion.midX, y: resultRegion.midY))
        let detail = element("calendar-readonly-detail")
        XCTAssertTrue(detail.waitForExistence(timeout: 10)); assertInWindow(detail)
        if variant.large {
            XCTAssertGreaterThan(detail.frame.height, window.height * 0.75,
                                 "Read-only Calendar detail must enter its large detent at maximum text")
            XCTAssertLessThan(detail.frame.minY, window.minY + window.height * 0.2)
        }
        let start = element("calendar-detail-start")
        let detailList = app.collectionViews.firstMatch.exists ? app.collectionViews.firstMatch : app.tables.firstMatch
        let detailBounds = CGRect(x: detail.frame.minX, y: app.navigationBars.firstMatch.frame.maxY + 4,
                                  width: detail.frame.width, height: window.maxY - app.navigationBars.firstMatch.frame.maxY - 38)
        materializeKnownLaterRow("calendar-detail-start", in: detailList, bounds: detailBounds)
        reveal(start, in: detailList, bounds: detailBounds)
        XCTAssertTrue(start.label.count > 8)
        capture("calendar-readonly-detent-and-start-\(variant.tag)")
        let end = element("calendar-detail-end")
        materializeKnownLaterRow("calendar-detail-end", in: detailList, bounds: detailBounds)
        reveal(end, in: detailList, bounds: detailBounds); XCTAssertTrue(end.label.count > 8)
        capture("calendar-readonly-end-\(variant.tag)")
        let done = toolbarButton(["完成", "Fertig", "Done"])
        // This native iOS navigation item reports its visual AX frame, which may be narrower
        // than the system's actual tap region. Verify its real interaction and dismissal;
        // retain the strict 44 pt bounds for all product-owned menu/prompt actions above.
        XCTAssertTrue(done.waitForExistence(timeout: 8)); XCTAssertTrue(done.isHittable); assertInWindow(done)
        done.tap(); XCTAssertTrue(detail.waitForNonExistence(timeout: 8))
    }

    private func assertCenteredPrompt(_ prompt: XCUIElement) {
        XCTAssertTrue(prompt.waitForExistence(timeout: 8)); assertInWindow(prompt)
        XCTAssertEqual(prompt.frame.midX, window.midX, accuracy: 2)
        // Popovers SwiftUI/Modifiers.swift defaults relative positioning to the UIWindow's
        // safeAreaLayoutGuide.layoutFrame; it does not use the tapped card. Its center can
        // differ from the raw window center by half the top/bottom system-inset difference.
        // XCTest has no public remote safeAreaInsets API, so the observed status-region
        // height bounds that asymmetry on this portrait phone. No model-specific offset.
        XCTAssertEqual(prompt.frame.midY, window.midY, accuracy: systemTopInset / 2,
                       "Global confirmation stays at the window safe-area center, independent of its source row")
        XCTAssertGreaterThanOrEqual(prompt.frame.minX, window.minX + 15)
        XCTAssertLessThanOrEqual(prompt.frame.maxX, window.maxX - 15)
        XCTAssertGreaterThanOrEqual(prompt.frame.minY, window.minY + 18)
        XCTAssertLessThanOrEqual(prompt.frame.maxY, window.maxY - 18)
    }

    private func verifyPromptActions(prompt: XCUIElement, actions: [XCUIElement], variant: Variant, tag: String) {
        if prompt.elementType == .scrollView { capture("\(tag)-initial-scroll-content-\(variant.tag)") }
        for (index, action) in actions.enumerated() {
            reveal(action, in: promptScrollingContainer(prompt), bounds: prompt.frame.insetBy(dx: 0, dy: 8))
            assertTarget(action)
            capture("\(tag)-action-\(index)-\(variant.tag)")
        }
        if !variant.large {
            XCTAssertEqual(actions[0].frame.minY, actions[1].frame.minY, accuracy: 1)
            XCTAssertLessThanOrEqual(actions[0].frame.maxX, actions[1].frame.minX)
        } else {
            XCTAssertLessThan(actions[0].frame.minY, actions[1].frame.minY)
        }
    }

    private func promptScrollingContainer(_ prompt: XCUIElement) -> XCUIElement {
        // ViewThatFits exposes its chosen ScrollView fallback as the prompt AX element
        // itself. A descendants-only query cannot find that root scrolling container.
        prompt.elementType == .scrollView ? prompt : prompt.scrollViews.firstMatch
    }

    private var rootContentBounds: CGRect {
        let top = app.navigationBars.firstMatch.frame.maxY + 4
        let bottom = app.tabBars.firstMatch.exists ? app.tabBars.firstMatch.frame.minY - 8 : window.maxY - 36
        return CGRect(x: window.minX, y: top, width: window.width, height: max(0, bottom - top))
    }
    private var planViewport: CGRect {
        let top = element("plans-segmented-control").frame.maxY + 8
        let bottom = app.tabBars.firstMatch.frame.minY - 8
        return CGRect(x: window.minX, y: top, width: window.width, height: max(0, bottom - top))
    }

    /// Adjacent original screenshots overlap by 24 pt so the largest card is visually reviewable in full.
    private func showCompleteCard(_ card: XCUIElement, tag: String) {
        var offset: CGFloat = 0, part = 1
        for _ in 0..<24 {
            let viewport = planViewport, frame = card.frame
            let segment = CGRect(x: frame.minX, y: frame.minY + offset, width: frame.width,
                                 height: min(viewport.height * 0.6, frame.height - offset))
            if viewport.insetBy(dx: -0.5, dy: -0.5).contains(segment) {
                XCTAssertTrue(card.isHittable)
                print("POPUP220_CARD_SEGMENT part=\(part) frame=\(frame) segment=\(segment) viewport=\(viewport)")
                capture("confirmed-calendar-card-\(tag)-part-\(part)")
                if offset + segment.height >= frame.height - 0.5 { return }
                offset += segment.height - 24; part += 1
            } else { move(segment: segment, into: viewport) }
        }
        XCTFail("Every part of the maximum-text calendar card must be reachable above the floating tab bar")
    }

    private func revealCardSegment(_ card: XCUIElement) -> CGRect {
        for _ in 0..<20 {
            let visible = card.frame.intersection(planViewport)
            if card.isHittable && visible.width >= 44 && visible.height >= 44 { return visible }
            move(segment: card.frame, into: planViewport)
        }
        XCTFail("The entire-card route requires a visible 44 pt interaction region"); return .zero
    }

    private func reveal(_ target: XCUIElement, in scroll: XCUIElement, bounds: CGRect) {
        XCTAssertTrue(target.waitForExistence(timeout: 8))
        for _ in 0..<20 {
            if target.isHittable && bounds.insetBy(dx: -0.5, dy: -0.5).contains(target.frame) { return }
            XCTAssertTrue(scroll.exists, "An offscreen control needs its actual scrolling container: \(target.identifier)")
            move(segment: target.frame, into: bounds)
        }
        XCTFail("The entire control must remain reachable: \(target.identifier)")
    }

    /// Only these known later rows in the current Inbox/Form/List can be virtualized at
    /// maximum text. Materialize them by bounded forward scrolling before reading any frame;
    /// the existing full-control reveal/44 pt checks still run afterward.
    private func materializeKnownLaterRow(_ id: String, in list: XCUIElement, bounds: CGRect) {
        let allowed = ["inbox-row-ui-connection-nora", "appearance-theme-classic", "appearance-theme-rose",
                       "calendar-detail-start", "calendar-detail-end"]
        XCTAssertTrue(allowed.contains(id))
        XCTAssertTrue(list.waitForExistence(timeout: 8))
        let target = element(id)
        for attempt in 0..<12 {
            if target.exists { return }
            let visibleList = list.frame.intersection(bounds)
            XCTAssertGreaterThan(visibleList.height, 80)
            XCTAssertGreaterThan(visibleList.width, 44)
            print("POPUP220_MATERIALIZE id=\(id) attempt=\(attempt) viewport=\(visibleList)")
            let x = visibleList.midX
            coordinate(CGPoint(x: x, y: visibleList.minY + visibleList.height * 0.8))
                .press(forDuration: 0.08,
                    thenDragTo: coordinate(CGPoint(x: x, y: visibleList.minY + visibleList.height * 0.3)),
                    withVelocity: .slow, thenHoldForDuration: 0.2)
        }
        XCTAssertTrue(target.exists, "The exact known row must materialize after bounded list scrolling: \(id)")
    }

    private func move(segment: CGRect, into viewport: CGRect) {
        XCTAssertGreaterThan(viewport.height, 80)
        let down = segment.minY < viewport.minY
        let delta = down ? viewport.minY - segment.minY : segment.maxY - viewport.maxY
        let distance = min(max(delta, 60), viewport.height * 0.6)
        // Use the scrolling surface's left interior, avoiding tappable row controls and tab swipes.
        let x = max(viewport.minX + 12, window.minX + 12)
        let startY = down ? viewport.minY + 16 : viewport.maxY - 16
        let endY = startY + (down ? distance : -distance)
        coordinate(CGPoint(x: x, y: startY)).press(forDuration: 0.08,
            thenDragTo: coordinate(CGPoint(x: x, y: endY)), withVelocity: .slow, thenHoldForDuration: 0.2)
    }

    private struct PaintedLine { let text: String; let frame: CGRect }
    private func assertPaintedCalendarTile(_ card: XCUIElement, day: Int, language: String) throws {
        let screenshot = app.screenshot(), image = try XCTUnwrap(screenshot.image.cgImage)
        // The regular left date column is 112 pt wide, with the common 16 pt card inset.
        let region = CGRect(x: card.frame.minX + 16, y: card.frame.minY + 12, width: 112,
                            height: card.frame.height - 24)
        XCTAssertTrue(window.contains(region))
        let sx = CGFloat(image.width) / window.width, sy = CGFloat(image.height) / window.height
        let pixelRect = CGRect(x: (region.minX - window.minX) * sx, y: (region.minY - window.minY) * sy,
                               width: region.width * sx, height: region.height * sy).integral
        let cropped = try XCTUnwrap(image.cropping(to: pixelRect))
        let request = VNRecognizeTextRequest(); request.recognitionLevel = .accurate
        request.usesLanguageCorrection = false
        request.recognitionLanguages = language == "de" ? ["de-DE", "en-US"] : ["zh-Hans", "en-US"]
        try VNImageRequestHandler(cgImage: cropped).perform([request])
        let lines: [PaintedLine] = (request.results ?? []).compactMap { observation in
            guard let text = observation.topCandidates(1).first?.string else { return nil }
            let box = observation.boundingBox
            return PaintedLine(text: text, frame: CGRect(x: region.minX + box.minX * region.width,
                y: region.minY + (1 - box.maxY) * region.height,
                width: box.width * region.width, height: box.height * region.height))
        }.sorted { $0.frame.minY < $1.frame.minY }
        let diagnostic = lines.map { "\($0.text) | \($0.frame)" }.joined(separator: "\n")
        let attachment = XCTAttachment(string: diagnostic)
        attachment.name = "popup220-calendar-tile-painted-lines-\(language)"; attachment.lifetime = .keepAlways; add(attachment)
        let dayLine = try XCTUnwrap(lines.first { $0.text.trimmingCharacters(in: .whitespacesAndNewlines) == String(day) },
                                   "The approved calendar tile paints the day as its own prominent number")
        let metadata = try XCTUnwrap(lines.last { $0.frame.maxY < dayLine.frame.minY })
        XCTAssertGreaterThan(dayLine.frame.height, metadata.frame.height * 1.2,
                             "The day number must be visibly larger than month/weekday metadata")
        XCTAssertTrue(lines.contains { $0.frame.minY > dayLine.frame.maxY && $0.text.contains(":") },
                      "The complete start/end clocks stay below the day number")
    }

    private func element(_ id: String) -> XCUIElement { app.descendants(matching: .any)[id].firstMatch }
    private func toolbarButton(_ labels: [String]) -> XCUIElement {
        app.navigationBars.buttons.matching(NSPredicate(format: "label IN %@", labels)).firstMatch
    }
    private func assertTarget(_ target: XCUIElement) {
        XCTAssertTrue(target.waitForExistence(timeout: 8)); XCTAssertTrue(target.isHittable); assertInWindow(target)
        XCTAssertGreaterThanOrEqual(target.frame.width + 0.001, 44)
        XCTAssertGreaterThanOrEqual(target.frame.height + 0.001, 44)
    }
    private func assertInWindow(_ target: XCUIElement) {
        XCTAssertFalse(target.frame.isEmpty); XCTAssertTrue(window.insetBy(dx: -0.5, dy: -0.5).contains(target.frame))
    }
    private func coordinate(_ point: CGPoint) -> XCUICoordinate {
        app.coordinate(withNormalizedOffset: .zero).withOffset(CGVector(dx: point.x - app.frame.minX, dy: point.y - app.frame.minY))
    }
    private func tap(point: CGPoint) { coordinate(point).tap() }
    private func capture(_ name: String) {
        let attachment = XCTAttachment(screenshot: app.screenshot())
        attachment.name = "popup220-" + name; attachment.lifetime = .keepAlways; add(attachment)
    }
}
