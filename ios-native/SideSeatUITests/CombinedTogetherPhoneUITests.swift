import XCTest
import UIKit
import Vision

/// Existing in-memory Together fixtures only; no real user or production write.
@MainActor final class CombinedTogetherPhoneUITests: XCTestCase {
    private struct Variant {
        let language: String
        let maximum: Bool
        var tag: String { "\(language)-light-\(maximum ? "system-max" : "normal")" }
        var finding: String { language == "de" ? "Suche aktiv" : "正在寻找" }
        var paused: String { language == "de" ? "Pausiert" : "已暂停" }
        var unpublished: String { language == "de" ? "Noch keine Suche" : "尚未寻找" }
    }
    private var app: XCUIApplication!
    private let coffee = "ui-intent-coffee"
    private let sports = "ui-intent-sports"
    private let study = "ui-intent-study"
    private let opportunity = "cmutualui0000000000000001"

    override func setUpWithError() throws { continueAfterFailure = false }
    override func tearDown() async throws { await MainActor.run { app?.terminate() } }

    func testChineseNormalCombinedTilesRecommendationsAndSaved() throws {
        let variant = Variant(language: "zh-Hans", maximum: false)
        launch(variant)
        XCTAssertFalse(app.buttons["together-tab-intentions"].exists)
        let first = element("weekly-intent-\(coffee)"), second = element("weekly-intent-\(sports)")
        XCTAssertTrue(first.waitForExistence(timeout: 8)); XCTAssertTrue(second.exists)
        reveal(edit(coffee)); assertTarget(edit(coffee)); assertTarget(menu(coffee)); assertTarget(menu(sports))
        XCTAssertLessThanOrEqual(abs(first.frame.minY - second.frame.minY), 1, "Two intentions must share one row")
        XCTAssertLessThanOrEqual(abs(first.frame.width - second.frame.width), 1)
        XCTAssertGreaterThan(first.frame.width, 130)
        XCTAssertLessThan(first.frame.width, viewport.width * 0.6)
        XCTAssertLessThanOrEqual(first.frame.maxX, second.frame.minX + 1)
        XCTAssertFalse(edit(study).isHittable, "The third card belongs to the horizontal rail, not another vertical row")
        try assertPaintedWords(["Coffee", "after", "class"], in: edit(coffee), language: variant.language)
        assertStatus(coffee, variant.finding); assertStatus(sports, variant.paused)
        capture("combined224-two-tiles-and-recommendation-\(variant.tag)")

        showTile(study); assertTarget(edit(study)); assertTarget(menu(study)); assertStatus(study, variant.unpublished)
        capture("combined224-third-tile-\(variant.tag)")
        let recommendation = element("mutual-opportunity-\(opportunity)")
        XCTAssertTrue(recommendation.waitForExistence(timeout: 8))
        let bookmark = app.buttons["mutual-opportunity-bookmark-\(opportunity)"]
        reveal(bookmark); assertTarget(bookmark)
        XCTAssertTrue(bookmark.isEnabled); XCTAssertEqual(bookmark.label, "收藏意愿")
        capture("combined224-recommendation-same-page-\(variant.tag)")
        bookmark.tap()
        let saved = XCTNSPredicateExpectation(predicate: NSPredicate(format: "label == %@", "取消收藏"), object: bookmark)
        XCTAssertEqual(XCTWaiter.wait(for: [saved], timeout: 8), .completed,
            "The existing fixture mutation must finish before changing sections")
        capture("combined224-bookmark-saved-before-section-change")
        selectSection("bookmarks")
        let savedBookmark = app.scrollViews["together-section-bookmarks"].buttons["mutual-opportunity-bookmark-\(opportunity)"]
        XCTAssertTrue(savedBookmark.waitForExistence(timeout: 8))
        XCTAssertEqual(savedBookmark.label, "取消收藏")
        XCTAssertTrue(app.buttons["together-tab-bookmarks"].isSelected)
        let savedHierarchy = XCTAttachment(string: app.debugDescription)
        savedHierarchy.name = "combined224-saved-page-accessibility-hierarchy"; savedHierarchy.lifetime = .keepAlways; add(savedHierarchy)
        capture("combined224-saved-recommendation-\(variant.tag)")
        selectSection("recommendations")
        XCTAssertTrue(rail.waitForExistence(timeout: 8))
        showTile(coffee); reveal(edit(coffee)); assertStatus(coffee, variant.finding)
        XCTAssertFalse(element("intent-editor").exists)
        let add = app.buttons["together-add-intent"]
        reveal(add); add.tap()
        XCTAssertTrue(element("intent-editor").waitForExistence(timeout: 8))
        app.buttons["intent-topic-coffee"].tap()
        let activity = element("intent-editor-activity")
        XCTAssertTrue(activity.waitForExistence(timeout: 5)); activity.tap(); activity.typeText("Quick coffee")
        app.buttons["intent-editor-save"].tap()
        XCTAssertTrue(element("intent-editor").waitForNonExistence(timeout: 8))
        let created = edit("ui-intent-created")
        XCTAssertTrue(created.waitForExistence(timeout: 8))
        // A fourth intention must become visible without a test-assisted rail swipe.
        XCTAssertTrue(created.isHittable)
        XCTAssertTrue(viewport.insetBy(dx: -1, dy: -1).contains(created.frame))
        capture("combined224-created-fourth-tile-focused")
        print("COMBINED224_NORMAL two-equal-tiles horizontal-third same-page-recommendation saved-roundtrip created-fourth-visible")
    }

    func testGermanActualSystemMaximumSingleReadableTile() throws {
        let variant = Variant(language: "de", maximum: true)
        launch(variant)
        let first = element("weekly-intent-\(coffee)")
        XCTAssertTrue(first.waitForExistence(timeout: 8)); reveal(edit(coffee))
        XCTAssertGreaterThanOrEqual(first.frame.width, viewport.width * 0.7,
            "Actual maximum text must use one wide tile instead of squeezing two columns")
        XCTAssertFalse(edit(sports).isHittable)
        let title = edit(coffee)
        XCTAssertTrue(title.label.contains("Coffee after class")); reveal(title)
        XCTAssertGreaterThan(title.frame.height, 40, "The activity title must retain the actual accessibility text size")
        try assertPaintedWords(["Coffee", "after", "class"], in: title, language: variant.language)
        capture("combined224-first-title-\(variant.tag)")
        assertStatus(coffee, variant.finding); capture("combined224-first-status-\(variant.tag)")
        let menuButton = menu(coffee); reveal(menuButton); assertTarget(menuButton); openMenu(coffee)
        let panel = element("weekly-intent-actions-prompt-\(coffee)")
        XCTAssertTrue(panel.waitForExistence(timeout: 8))
        capture("combined224-actions-panel-top-\(variant.tag)")
        for suffix in ["menu-edit", "share", "toggle-pause", "delete", "actions-cancel"] {
            let action = app.buttons["weekly-intent-\(suffix)-\(coffee)"]
            revealPanelAction(action, in: panel, tag: "\(suffix)-\(variant.tag)")
            assertTarget(action)
            try assertPaintedWords(action.label.components(separatedBy: .whitespacesAndNewlines).filter { !$0.isEmpty },
                in: action, language: variant.language, visibleBounds: panelBounds(panel))
            capture("combined224-actions-panel-\(suffix)-\(variant.tag)")
        }
        dismissMenu()
        XCTAssertTrue(panel.waitForNonExistence(timeout: 8))

        openMenu(coffee)
        let panelEdit = app.buttons["weekly-intent-menu-edit-\(coffee)"]
        revealPanelAction(panelEdit, in: panel, tag: "edit-before-sheet-\(variant.tag)"); assertTarget(panelEdit); panelEdit.tap()
        let editor = element("intent-editor")
        XCTAssertTrue(editor.waitForExistence(timeout: 8)); XCTAssertFalse(panel.exists)
        capture("combined224-panel-edit-opened-original-editor-\(variant.tag)")
        cancelEditor(); XCTAssertTrue(editor.waitForNonExistence(timeout: 8))

        openMenu(coffee)
        let panelDelete = app.buttons["weekly-intent-delete-\(coffee)"]
        revealPanelAction(panelDelete, in: panel, tag: "delete-before-confirmation-\(variant.tag)"); assertTarget(panelDelete); panelDelete.tap()
        let deletePrompt = element("weekly-intent-delete-prompt-\(coffee)")
        XCTAssertTrue(deletePrompt.waitForExistence(timeout: 8)); XCTAssertFalse(panel.exists)
        capture("combined224-panel-opened-original-delete-prompt-\(variant.tag)")
        let deleteCancel = app.buttons["weekly-intent-delete-cancel-\(coffee)"]
        revealPanelAction(deleteCancel, in: deletePrompt, tag: "original-delete-cancel-\(variant.tag)"); assertTarget(deleteCancel)
        capture("combined224-panel-delete-cancel-visible-\(variant.tag)"); deleteCancel.tap()
        XCTAssertTrue(deletePrompt.waitForNonExistence(timeout: 8)); assertStatus(coffee, variant.finding)
        showTile(sports); reveal(edit(sports)); assertTarget(edit(sports)); assertStatus(sports, variant.paused)
        capture("combined224-paused-tile-\(variant.tag)")
        showTile(study); reveal(edit(study)); assertTarget(edit(study)); assertStatus(study, variant.unpublished)
        capture("combined224-unpublished-tile-\(variant.tag)")
        let recommendationTitle = app.staticTexts.matching(NSPredicate(format: "label == %@", "Mia")).firstMatch
        XCTAssertTrue(recommendationTitle.waitForExistence(timeout: 8)); reveal(recommendationTitle)
        XCTAssertTrue(viewport.insetBy(dx: -1, dy: -1).contains(recommendationTitle.frame))
        capture("combined224-recommendation-\(variant.tag)")
        print("COMBINED224_SYSTEM_MAX actual-system-category single-wide-tile complete-title scroll-panel-all-actions44 readable-words edit-sheet-cancel delete-prompt-cancel horizontal-other-states recommendation-accessible")
    }

    func testFixtureCreateEditPauseResumeShareAndDelete() {
        let variant = Variant(language: "zh-Hans", maximum: false)
        launch(variant)
        let add = app.buttons["together-add-intent"]
        reveal(add); assertTarget(add); add.tap()
        let editor = element("intent-editor")
        XCTAssertTrue(editor.waitForExistence(timeout: 8)); capture("combined224-add-opens-original-editor")
        cancelEditor(); XCTAssertTrue(editor.waitForNonExistence(timeout: 8))

        showTile(coffee); assertStatus(coffee, variant.finding)
        openMenu(coffee)
        let pause = app.buttons["weekly-intent-toggle-pause-\(coffee)"]
        assertTarget(pause, nativeMenuItem: true); pause.tap()
        assertStatus(coffee, variant.paused); XCTAssertFalse(editor.exists)
        capture("combined224-paused-through-menu")
        openMenu(coffee)
        XCTAssertFalse(app.buttons["weekly-intent-share-\(coffee)"].exists,
            "The existing paused intention sharing rule stays in place")
        let menuEdit = app.buttons["weekly-intent-menu-edit-\(coffee)"]
        assertTarget(menuEdit, nativeMenuItem: true); menuEdit.tap()
        XCTAssertTrue(editor.waitForExistence(timeout: 8))
        let save = app.buttons["intent-editor-save"]
        XCTAssertTrue(save.waitForExistence(timeout: 8)); XCTAssertTrue(save.isEnabled); save.tap()
        XCTAssertTrue(editor.waitForNonExistence(timeout: 8)); assertStatus(coffee, variant.paused)
        capture("combined224-edit-save-retains-paused")
        openMenu(coffee); assertTarget(pause, nativeMenuItem: true); pause.tap()
        assertStatus(coffee, variant.finding); XCTAssertFalse(editor.exists)
        openMenu(coffee)
        let share = app.buttons["weekly-intent-share-\(coffee)"]
        assertTarget(share, nativeMenuItem: true); share.tap()
        let shareError = element("weekly-intent-share-error-prompt-\(coffee)")
        XCTAssertTrue(shareError.waitForExistence(timeout: 15)); XCTAssertFalse(editor.exists)
        capture("combined224-original-share-loopback-error")
        let okay = app.buttons["weekly-intent-share-error-ok-\(coffee)"]
        assertTarget(okay); okay.tap(); XCTAssertTrue(shareError.waitForNonExistence(timeout: 8))

        openMenu(coffee); let delete = app.buttons["weekly-intent-delete-\(coffee)"]
        assertTarget(delete, nativeMenuItem: true); delete.tap()
        let prompt = element("weekly-intent-delete-prompt-\(coffee)")
        XCTAssertTrue(prompt.waitForExistence(timeout: 8)); XCTAssertFalse(editor.exists)
        let cancel = app.buttons["weekly-intent-delete-cancel-\(coffee)"]
        assertTarget(cancel); capture("combined224-original-delete-confirmation"); cancel.tap()
        XCTAssertTrue(prompt.waitForNonExistence(timeout: 8)); assertStatus(coffee, variant.finding)
        openMenu(coffee); delete.tap(); XCTAssertTrue(prompt.waitForExistence(timeout: 8))
        let confirm = app.buttons["weekly-intent-delete-confirm-\(coffee)"]
        assertTarget(confirm); confirm.tap()
        XCTAssertTrue(edit(coffee).waitForNonExistence(timeout: 8))
        XCTAssertFalse(element("weekly-intent-\(coffee)").exists)
        showTile(sports); assertStatus(sports, variant.paused)
        showTile(study); assertStatus(study, variant.unpublished)
        XCTAssertTrue(element("mutual-opportunity-\(opportunity)").exists)
        XCTAssertFalse(editor.exists); capture("combined224-only-selected-intention-deleted")
        print("COMBINED224_CALLBACKS add-cancel pause edit-saved-still-paused resume share-loopback-error delete-cancel confirm neighbors-retained")
    }

    func testEmptyIntentionsKeepRecommendationsAndAddEntry() {
        launch(.init(language: "zh-Hans", maximum: false), cardStates: false)
        let empty = element("together-set-intent")
        XCTAssertTrue(empty.waitForExistence(timeout: 8))
        let add = app.buttons["together-add-first-intent"]
        reveal(add); assertTarget(add)
        XCTAssertFalse(rail.exists)
        XCTAssertTrue(element("mutual-opportunity-\(opportunity)").waitForExistence(timeout: 8))
        capture("combined224-empty-intentions-with-recommendation")
        add.tap(); XCTAssertTrue(element("intent-editor").waitForExistence(timeout: 8))
        cancelEditor(); XCTAssertTrue(element("intent-editor").waitForNonExistence(timeout: 8))
        XCTAssertTrue(empty.exists); XCTAssertTrue(element("mutual-opportunity-\(opportunity)").exists)
        add.tap(); XCTAssertTrue(element("intent-editor").waitForExistence(timeout: 8))
        let coffeeTopic = app.buttons["intent-topic-coffee"]
        XCTAssertTrue(coffeeTopic.waitForExistence(timeout: 5)); assertTarget(coffeeTopic); coffeeTopic.tap()
        let activity = element("intent-editor-activity")
        XCTAssertTrue(activity.waitForExistence(timeout: 5)); activity.tap(); activity.typeText("Coffee after class")
        let save = app.buttons["intent-editor-save"]
        XCTAssertTrue(save.waitForExistence(timeout: 5)); XCTAssertTrue(save.isEnabled); save.tap()
        XCTAssertTrue(element("intent-editor").waitForNonExistence(timeout: 8))
        XCTAssertTrue(rail.waitForExistence(timeout: 8)); XCTAssertFalse(empty.exists)
        let created = edit("ui-intent-created")
        XCTAssertTrue(created.waitForExistence(timeout: 8))
        // No reveal/scroll helper here: creation itself must return to the rail.
        XCTAssertTrue(created.isHittable)
        XCTAssertTrue(viewport.insetBy(dx: -1, dy: -1).contains(created.frame))
        let heading = element("together-intentions-heading")
        XCTAssertTrue(heading.isHittable)
        XCTAssertTrue(viewport.insetBy(dx: -1, dy: -1).contains(heading.frame))
        XCTAssertTrue(created.label.contains("Coffee after class"))
        XCTAssertEqual(status("ui-intent-created").label, "正在寻找")
        XCTAssertTrue(element("mutual-opportunity-\(opportunity)").exists)
        XCTAssertFalse(app.scrollViews["together-section-intentions"].exists)
        capture("combined224-created-intention-at-top-of-combined-page")
        print("COMBINED224_EMPTY no-intention same-page-recommendation add-cancel reopen-created returns-to-top-finding-tile")
    }

    func testEmptyRecommendationsReturnToExistingIntentionRail() {
        // Actual maximum text gives this otherwise short empty state enough
        // content to exercise the real same-page scroll-to-intentions action.
        launch(.init(language: "zh-Hans", maximum: true), emptyRecommendations: true)
        XCTAssertTrue(rail.waitForExistence(timeout: 8))
        let empty = element("together-opportunities-empty")
        XCTAssertTrue(empty.waitForExistence(timeout: 8))
        let returnToIntentions = app.buttons["together-discovery-empty-action"]
        reveal(returnToIntentions); assertTarget(returnToIntentions)
        let heading = element("together-intentions-heading")
        for _ in 0..<4 where heading.frame.maxY >= viewport.minY {
            dragVertically(points: 120, bounds: viewport)
        }
        assertTarget(returnToIntentions)
        XCTAssertLessThan(heading.frame.maxY, viewport.minY,
            "The empty-state action is tested after the intention rail has scrolled above the viewport")
        capture("combined224-empty-recommendations-action-below-rail")
        returnToIntentions.tap()
        let visibleHeading = XCTNSPredicateExpectation(predicate: NSPredicate(format: "hittable == true"), object: heading)
        XCTAssertEqual(XCTWaiter.wait(for: [visibleHeading], timeout: 8), .completed)
        // The original callback must scroll this same page; do not assist it.
        capture("combined224-empty-recommendations-after-return-diagnostic")
        print("COMBINED224_RETURN_GEOMETRY heading=\(heading.frame) viewport=\(viewport) list=\(list.frame) selector=\(element("together-segmented-control").frame) menu=\(menu(coffee).frame)")
        let returnedHierarchy = XCTAttachment(string: app.debugDescription)
        returnedHierarchy.name = "combined224-empty-return-accessibility-hierarchy"; returnedHierarchy.lifetime = .keepAlways; add(returnedHierarchy)
        // Explicit scrollTo(.top) uses the actual boundary, before the helper's4pt drag guard.
        let visibleTop = max(list.frame.minY, element("together-segmented-control").frame.maxY)
        let alignedViewport = CGRect(x: viewport.minX, y: visibleTop, width: viewport.width,
                                     height: viewport.maxY - visibleTop)
        XCTAssertTrue(alignedViewport.insetBy(dx: -1, dy: -1).contains(heading.frame))
        XCTAssertTrue(menu(coffee).isHittable)
        XCTAssertTrue(viewport.insetBy(dx: -1, dy: -1).contains(menu(coffee).frame))
        XCTAssertTrue(list.exists); XCTAssertFalse(app.scrollViews["together-section-intentions"].exists)
        XCTAssertFalse(element("intent-editor").exists)
        capture("combined224-empty-recommendations-returned-to-rail")
        print("COMBINED224_EMPTY_RECOMMENDATIONS existing-fixture-empty scroll-down action-scrolls-same-page-to-rail")
    }

    private func launch(_ variant: Variant, cardStates: Bool = true, emptyRecommendations: Bool = false) {
        app?.terminate()
        app = XCUIApplication(bundleIdentifier: ProcessInfo.processInfo.environment["SIDESEAT_PLAN_PRESENTATION_QA_BUNDLE"] ?? "app.sideseat.mobile.preview")
        app.launchArguments = ["--ui-testing-authenticated", "--ui-testing-ephemeral-credentials",
            "--ui-testing-skip-tutorial", "--ui-testing-local-api", "--ui-testing-weekly-intent",
            "--ui-testing-mutual-opportunity", "--ui-testing-automatic-matching", "--ui-testing-together-matching",
            "--ui-testing-flexible-timing", "--ui-testing-discovery-matching", "--ui-testing-language=\(variant.language)",
            "--ui-testing-appearance=light", "-UIPreferredContentSizeCategoryName",
            variant.maximum ? "UICTContentSizeCategoryAccessibilityXXXL" : "UICTContentSizeCategoryL"]
        if cardStates { app.launchArguments.append("--ui-testing-intent-card-states") }
        if emptyRecommendations { app.launchArguments.append("--ui-testing-mutual-opportunity-empty") }
        if variant.maximum { app.launchArguments.append("--ui-testing-dynamic-type-accessibility") }
        app.launchEnvironment = ["SIDESEAT_API_BASE_URL_OVERRIDE": "http://127.0.0.1:9"]
        app.launch(); XCTAssertTrue(app.tabBars.firstMatch.waitForExistence(timeout: 20))
        let together = app.tabBars.buttons.element(boundBy: 0)
        XCTAssertTrue(together.isHittable); together.tap()
        XCTAssertTrue(list.waitForExistence(timeout: 8))
    }

    private var list: XCUIElement { app.scrollViews["together-section-recommendations"].firstMatch }
    private var rail: XCUIElement { app.scrollViews["together-intention-rail"].firstMatch }
    private func element(_ id: String) -> XCUIElement { app.descendants(matching: .any).matching(identifier: id).firstMatch }
    private func edit(_ id: String) -> XCUIElement { app.buttons["weekly-intent-edit-\(id)"] }
    private func menu(_ id: String) -> XCUIElement { app.buttons["weekly-intent-menu-\(id)"] }
    private func status(_ id: String) -> XCUIElement { app.staticTexts.matching(identifier: "weekly-intent-status-\(id)").firstMatch }
    private func openMenu(_ id: String) {
        showTile(id); let button = menu(id); reveal(button); assertTarget(button); button.tap()
        XCTAssertTrue(app.buttons["weekly-intent-menu-edit-\(id)"].waitForExistence(timeout: 5))
        XCTAssertFalse(element("intent-editor").exists, "More must not trigger the tile editor")
    }
    private func dismissMenu() {
        let panel = element("weekly-intent-actions-prompt-\(coffee)")
        if panel.exists {
            let cancel = app.buttons["weekly-intent-actions-cancel-\(coffee)"]
            revealPanelAction(cancel, in: panel, tag: "dismiss-actions"); assertTarget(cancel); cancel.tap()
            XCTAssertTrue(panel.waitForNonExistence(timeout: 8))
        } else {
            app.coordinate(withNormalizedOffset: .zero).withOffset(CGVector(dx: 4, dy: viewport.midY)).tap()
        }
        XCTAssertTrue(app.buttons["weekly-intent-menu-edit-\(coffee)"].waitForNonExistence(timeout: 5))
    }

    private func panelBounds(_ panel: XCUIElement) -> CGRect {
        panel.frame.intersection(app.windows.firstMatch.frame).insetBy(dx: 1, dy: 4)
    }

    private func revealPanelAction(_ target: XCUIElement, in panel: XCUIElement, tag: String) {
        XCTAssertTrue(panel.waitForExistence(timeout: 8)); XCTAssertTrue(target.waitForExistence(timeout: 5))
        for segment in 0..<16 {
            let bounds = panelBounds(panel), frame = target.frame
            XCTAssertGreaterThan(bounds.height, 44)
            XCTAssertLessThanOrEqual(frame.height, bounds.height, "A complete action must fit inside its actual prompt viewport")
            if target.isHittable && bounds.insetBy(dx: -1, dy: -1).contains(frame) { return }
            let points = frame.maxY > bounds.maxY ? min(180, frame.maxY - bounds.maxY + 12)
                : -min(180, bounds.minY - frame.minY + 12)
            dragVertically(points: points, bounds: bounds)
            capture("combined224-prompt-continuous-\(tag)-segment-\(segment)")
        }
        capture("combined224-prompt-action-unreachable-\(tag)")
        XCTFail("The complete action must be reachable in the actual scrolling panel: \(target.identifier)")
    }
    private func cancelEditor() {
        let cancel = app.navigationBars.buttons.matching(NSPredicate(format: "label == %@ OR label == %@ OR label == %@", "取消", "Cancel", "Abbrechen")).firstMatch
        XCTAssertTrue(cancel.waitForExistence(timeout: 5)); assertTarget(cancel); cancel.tap()
    }
    private func selectSection(_ rawValue: String) {
        let selector = app.buttons["together-section-menu"]
        if selector.exists { assertTarget(selector); selector.tap() }
        let tab = app.buttons["together-tab-\(rawValue)"]
        XCTAssertTrue(tab.waitForExistence(timeout: 5)); assertTarget(tab); tab.tap()
        XCTAssertTrue(app.scrollViews["together-section-\(rawValue)"].firstMatch.waitForExistence(timeout: 8))
    }
    private func assertStatus(_ id: String, _ expected: String) {
        let text = status(id)
        XCTAssertTrue(text.waitForExistence(timeout: 8))
        let condition = XCTNSPredicateExpectation(predicate: NSPredicate(format: "label == %@", expected), object: text)
        XCTAssertEqual(XCTWaiter.wait(for: [condition], timeout: 8), .completed, "Expected \(expected), got \(text.label)")
        reveal(text)
    }
    private func showTile(_ id: String) {
        if !rail.exists { XCTFail("The intention rail is absent"); return }
        // Bring a short existing menu control into the vertical viewport first;
        // horizontal movement then stays inside the rail instead of paging roots.
        let knownMenu = rail.buttons.matching(NSPredicate(format: "identifier BEGINSWITH %@", "weekly-intent-menu-")).allElementsBoundByIndex.first { $0.isHittable }
        if let knownMenu { reveal(knownMenu) }
        for left in [true, false] {
            for _ in 0..<4 {
                let target = menu(id)
                if target.exists, target.isHittable, viewport.insetBy(dx: -1, dy: -1).contains(target.frame) { return }
                let frame = rail.frame.intersection(viewport)
                XCTAssertGreaterThan(frame.height, 44)
                let y = min(frame.maxY - 22, frame.minY + 50)
                let fromX = left ? frame.maxX - 16 : frame.minX + 16
                let toX = left ? frame.minX + 16 : frame.maxX - 16
                let origin = app.coordinate(withNormalizedOffset: .zero)
                origin.withOffset(CGVector(dx: fromX, dy: y)).press(forDuration: 0.05,
                    thenDragTo: origin.withOffset(CGVector(dx: toX, dy: y)))
            }
        }
        capture("combined224-unreachable-tile-\(id)"); XCTFail("Horizontal tile is unreachable: \(id)")
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
                XCTAssertLessThanOrEqual(frame.height, bounds.height, "A complete target must fit in the scrolling viewport: \(target.identifier)")
                if target.isHittable && bounds.insetBy(dx: -1, dy: -1).contains(frame) { return }
                let points = frame.maxY > bounds.maxY ? min(180, frame.maxY - bounds.maxY + 12)
                    : -min(180, bounds.minY - frame.minY + 12)
                dragVertically(points: points, bounds: bounds)
            } else { dragVertically(points: 160, bounds: bounds) }
        }
        capture("combined224-unreachable-\(target.identifier)"); XCTFail("Complete target is unreachable: \(target.identifier)")
    }
    private func dragVertically(points: CGFloat, bounds: CGRect) {
        let travel = min(abs(points), bounds.height * 0.45)
        let start = CGPoint(x: bounds.midX, y: points > 0 ? bounds.midY + travel / 2 : bounds.midY - travel / 2)
        let origin = app.coordinate(withNormalizedOffset: .zero)
        origin.withOffset(CGVector(dx: start.x, dy: start.y)).press(forDuration: 0.05,
            thenDragTo: origin.withOffset(CGVector(dx: start.x, dy: start.y + (points > 0 ? -travel : travel))))
    }
    private func assertTarget(_ target: XCUIElement, nativeMenuItem: Bool = false) {
        XCTAssertTrue(target.exists && target.isHittable, target.identifier)
        XCTAssertTrue(app.windows.firstMatch.frame.insetBy(dx: -1, dy: -1).contains(target.frame))
        XCTAssertGreaterThanOrEqual(target.frame.width + 0.001, 44)
        XCTAssertGreaterThanOrEqual(target.frame.height + 0.001, nativeMenuItem ? 40 : 44)
    }
    private func assertPaintedWords(_ words: [String], in target: XCUIElement, language: String, visibleBounds: CGRect? = nil) throws {
        let image = try XCTUnwrap(XCUIScreen.main.screenshot().image.cgImage)
        let window = app.windows.firstMatch.frame, frame = target.frame
        XCTAssertTrue((visibleBounds ?? viewport).insetBy(dx: -1, dy: -1).contains(frame))
        let sx = CGFloat(image.width) / window.width, sy = CGFloat(image.height) / window.height
        let crop = try XCTUnwrap(image.cropping(to: CGRect(x: frame.minX * sx, y: frame.minY * sy,
            width: frame.width * sx, height: frame.height * sy).integral))
        let request = VNRecognizeTextRequest()
        request.recognitionLevel = .accurate; request.usesLanguageCorrection = false
        request.recognitionLanguages = language == "de" ? ["de-DE", "en-US"] : ["zh-Hans", "en-US"]
        try VNImageRequestHandler(cgImage: crop).perform([request])
        let lines = (request.results ?? []).compactMap { $0.topCandidates(1).first?.string }
        for word in words {
            let pattern = "\\b\(NSRegularExpression.escapedPattern(for: word))\\b"
            XCTAssertTrue(lines.contains { $0.range(of: pattern, options: [.regularExpression, .caseInsensitive]) != nil },
                "The painted word must remain complete on one line: \(word); OCR=\(lines)")
        }
        let attachment = XCTAttachment(string: lines.joined(separator: "\n"))
        attachment.name = "combined224-painted-\(target.identifier)"; attachment.lifetime = .keepAlways; add(attachment)
    }
    private func capture(_ name: String) {
        let attachment = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
        attachment.name = name; attachment.lifetime = .keepAlways; add(attachment)
    }
}
