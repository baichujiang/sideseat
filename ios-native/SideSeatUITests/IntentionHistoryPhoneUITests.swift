import XCTest

/// Active process-local fixtures shared by the two page stores; no live account or API write.
@MainActor final class IntentionHistoryPhoneUITests: XCTestCase {
    private var app: XCUIApplication!
    private let oldID = "ui-intent-expired"
    private let newID = "ui-intent-created"
    override func setUpWithError() throws { continueAfterFailure = false }
    override func tearDown() async throws { await MainActor.run { app?.terminate() } }

    func testChineseHistoryCancelAndPublishFutureRepeat() {
        launch()
        XCTAssertFalse(element("weekly-intent-expired-history").exists)
        XCTAssertFalse(element("weekly-intent-\(oldID)").exists)
        openHistory()
        let oldTime = element("weekly-intent-time-\(oldID)-0")
        reveal(oldTime); XCTAssertFalse(oldTime.label.isEmpty)
        let originalTime = oldTime.label
        capture("history226-original-expired-time-zh")
        openRepeat()
        XCTAssertEqual(element("intent-editor-activity").value as? String, "Coffee after class")
        let save = app.buttons["intent-editor-save"]
        XCTAssertTrue(save.waitForExistence(timeout: 8)); XCTAssertTrue(save.isEnabled,
            "The existing submission validation must accept the prefilled future interval")
        XCTAssertTrue(app.descendants(matching: .any).matching(NSPredicate(format: "identifier BEGINSWITH %@", "intent-selected-time-")).firstMatch.exists)
        let choose = app.buttons["intent-timing-choose"]
        reveal(choose); choose.tap()
        let start = app.datePickers.matching(NSPredicate(format: "identifier BEGINSWITH %@", "intent-time-start-")).firstMatch
        XCTAssertTrue(start.waitForExistence(timeout: 8))
        let values = start.buttons.allElementsBoundByIndex.map(\.label)
        XCTAssertFalse(values.isEmpty)
        let attachment = XCTAttachment(string: values.joined(separator: "\n"))
        attachment.name = "history226-prefilled-future-picker-values"; attachment.lifetime = .keepAlways; add(attachment)
        capture("history226-prefilled-future-picker-zh")
        app.buttons["intent-time-picker-cancel"].tap()
        cancelEditor()
        XCTAssertTrue(element("intention-history").waitForExistence(timeout: 8))
        XCTAssertEqual(element("weekly-intent-time-\(oldID)-0").label, originalTime)
        selectTab(0)
        XCTAssertTrue(element("together-home").waitForExistence(timeout: 8))
        XCTAssertFalse(app.buttons["weekly-intent-edit-\(newID)"].exists, "Cancelling repeat must not create a record")
        openHistory(); openRepeat()
        XCTAssertTrue(save.waitForExistence(timeout: 8)); XCTAssertTrue(save.isEnabled)
        save.tap()
        verifyPublishedAtHome()
        capture("history226-repeat-published-and-focused-at-home-zh")
        openHistory()
        XCTAssertTrue(element("weekly-intent-\(oldID)").waitForExistence(timeout: 8))
        XCTAssertEqual(element("weekly-intent-time-\(oldID)-0").label, originalTime,
            "Publishing creates a new intention and preserves the original history")
        capture("history226-original-history-retained-after-publication-zh")
        print("HISTORY226_EXACT old-readonly future-prefill-valid picker-evidence cancelled-no-new-record published-home-focused original-retained")
    }

    func testChineseRepeatCanPublishUndecidedAndReopen() {
        launch(); openHistory(); openRepeat()
        let choose = app.buttons["intent-timing-choose"]
        reveal(choose); choose.tap()
        let clear = app.buttons["intent-time-clear"]
        XCTAssertTrue(clear.waitForExistence(timeout: 8)); reveal(clear); assertTarget(clear); clear.tap()
        XCTAssertTrue(choose.waitForExistence(timeout: 8)); XCTAssertTrue(choose.label.contains("待定"))
        let save = app.buttons["intent-editor-save"]
        XCTAssertTrue(save.isEnabled); capture("history226-repeat-time-cleared-before-publishing-zh"); save.tap()
        verifyPublishedAtHome()
        let edit = app.buttons["weekly-intent-edit-\(newID)"]
        assertTarget(edit); edit.tap()
        XCTAssertTrue(element("intent-editor").waitForExistence(timeout: 8))
        XCTAssertTrue(choose.label.contains("待定"), "The new shared record must retain the cleared time")
        XCTAssertFalse(app.descendants(matching: .any).matching(NSPredicate(format: "identifier BEGINSWITH %@", "intent-selected-time-")).firstMatch.exists)
        capture("history226-published-undecided-record-reopened-zh")
        cancelEditor(); openHistory()
        XCTAssertTrue(element("weekly-intent-\(oldID)").waitForExistence(timeout: 8))
        print("HISTORY226_UNDECIDED repeat-cleared published-home reopened-still-undecided original-retained")
    }

    func testEmptyHistoryCanReturnToMe() {
        launch(expired: false); openHistory()
        XCTAssertTrue(element("intention-history-empty").waitForExistence(timeout: 8))
        XCTAssertFalse(app.buttons["weekly-intent-repeat-\(oldID)"].exists)
        capture("history226-empty-history-zh")
        goBack(); XCTAssertTrue(element("me-profile").waitForExistence(timeout: 8))
        let row = app.buttons["me-intention-history"]
        reveal(row); assertTarget(row)
        capture("history226-empty-history-returned-to-me-zh")
        print("HISTORY226_EMPTY entry empty back-to-me")
    }

    func testGermanActualMaximumHistoryReadOnlyRepeatCancelAndBack() {
        launch(language: "de", maximum: true); openHistory()
        let card = element("weekly-intent-\(oldID)")
        XCTAssertTrue(card.waitForExistence(timeout: 8))
        XCTAssertFalse(app.buttons["weekly-intent-edit-\(oldID)"].exists)
        XCTAssertFalse(app.buttons["weekly-intent-menu-\(oldID)"].exists)
        XCTAssertFalse(app.buttons["weekly-intent-delete-\(oldID)"].exists)
        let labels = card.staticTexts.allElementsBoundByIndex.filter { !$0.label.isEmpty }
        XCTAssertFalse(labels.isEmpty)
        for (index, label) in labels.enumerated() {
            reveal(label)
            XCTAssertTrue(viewport.insetBy(dx: -1, dy: -1).contains(label.frame), label.label)
            capture("history226-expired-card-readable-segment-\(index)-de-system-max")
        }
        let repeatButton = app.buttons["weekly-intent-repeat-\(oldID)"]
        reveal(repeatButton); assertTarget(repeatButton)
        capture("history226-repeat-action-visible-de-system-max"); repeatButton.tap()
        XCTAssertTrue(element("intent-editor").waitForExistence(timeout: 8))
        XCTAssertTrue(app.buttons["intent-editor-save"].isEnabled)
        capture("history226-original-repeat-editor-de-system-max")
        cancelEditor(); XCTAssertTrue(element("intention-history").waitForExistence(timeout: 8))
        reveal(repeatButton); assertTarget(repeatButton)
        capture("history226-repeat-cancel-stays-in-history-de-system-max")
        goBack(); XCTAssertTrue(element("me-profile").waitForExistence(timeout: 8))
        let row = app.buttons["me-intention-history"]
        reveal(row); assertTarget(row)
        capture("history226-entry-after-return-de-system-max")
        print("HISTORY226_MAX real-system-max entry44 readonly-card-full-text-segments repeat44 editor-cancel back44")
    }

    func testPublicationClearsRetainedTogetherChildAndOrdinaryTabsKeepTheirState() {
        launch(retainedTogetherChild: true)
        let child = element("explore-intents-list")
        XCTAssertTrue(child.waitForExistence(timeout: 8))
        let back = app.navigationBars.firstMatch.buttons.element(boundBy: 0)
        assertTarget(back)
        let oldBackLabel = back.label
        XCTAssertFalse(oldBackLabel.isEmpty)
        capture("history226-retained-together-child-and-back-before-publication")

        selectTab(4); XCTAssertTrue(element("me-profile").waitForExistence(timeout: 8))
        selectTab(0)
        XCTAssertTrue(child.waitForExistence(timeout: 8)); assertTarget(back)
        capture("history226-ordinary-tab-roundtrip-preserves-existing-child")

        openHistory(); openRepeat()
        let save = app.buttons["intent-editor-save"]
        XCTAssertTrue(save.waitForExistence(timeout: 8)); XCTAssertTrue(save.isEnabled); save.tap()
        verifyPublishedAtHome()
        XCTAssertTrue(child.waitForNonExistence(timeout: 8))
        XCTAssertFalse(app.navigationBars.buttons.matching(NSPredicate(format: "label == %@", oldBackLabel)).firstMatch.exists)
        capture("history226-publication-resets-retained-child-and-focuses-new-card")

        selectTab(4); XCTAssertTrue(element("me-profile").waitForExistence(timeout: 8))
        XCTAssertFalse(element("intention-history").exists, "Publication must also reset the source history stack")
        selectTab(0)
        let created = app.buttons["weekly-intent-edit-\(newID)"]
        XCTAssertTrue(created.waitForExistence(timeout: 8)); assertTarget(created)
        XCTAssertTrue(element("together-home").exists); XCTAssertFalse(child.exists)
        XCTAssertFalse(app.navigationBars.buttons.matching(NSPredicate(format: "label == %@", oldBackLabel)).firstMatch.exists)
        capture("history226-post-publication-tab-roundtrip-keeps-new-root-card")
        print("HISTORY226_RETAINED_CHILD real-existing-child-and-back ordinary-tab-preservation publication-clears-source-and-target-stacks new-card-focused roundtrip-stays-root")
    }

    private func launch(language: String = "zh-Hans", maximum: Bool = false, expired: Bool = true, retainedTogetherChild: Bool = false) {
        app?.terminate()
        app = XCUIApplication(bundleIdentifier: "app.sideseat.mobile.preview")
        app.launchArguments = ["--ui-testing-authenticated", "--ui-testing-ephemeral-credentials",
            "--ui-testing-skip-tutorial", "--ui-testing-local-api", "--ui-testing-weekly-intent",
            "--ui-testing-mutual-opportunity-empty", "--ui-testing-automatic-matching", "--ui-testing-together-matching",
            "--ui-testing-flexible-timing", "--ui-testing-discovery-matching", "--ui-testing-language=\(language)",
            "--ui-testing-appearance=light", "-UIPreferredContentSizeCategoryName",
            maximum ? "UICTContentSizeCategoryAccessibilityXXXL" : "UICTContentSizeCategoryL"]
        if expired { app.launchArguments.append("--ui-testing-expired-intention") }
        if maximum { app.launchArguments.append("--ui-testing-dynamic-type-accessibility") }
        if retainedTogetherChild {
            app.launchArguments += ["--ui-testing-retained-together-route", "--ui-testing-explore-intents"]
        }
        app.launchEnvironment = ["SIDESEAT_API_BASE_URL_OVERRIDE": "http://127.0.0.1:9"]
        app.launch(); XCTAssertTrue(app.tabBars.firstMatch.waitForExistence(timeout: 20)); selectTab(0)
        XCTAssertTrue(element(retainedTogetherChild ? "explore-intents-list" : "together-home").waitForExistence(timeout: 8))
    }
    private func openHistory() {
        selectTab(4)
        // Native tabs preserve each navigation stack. Re-enter through the Me
        // row so this also verifies a fresh history store reads the shared data.
        if element("intention-history").exists { goBack() }
        XCTAssertTrue(element("me-profile").waitForExistence(timeout: 8))
        let entry = app.buttons["me-intention-history"]
        XCTAssertTrue(entry.waitForExistence(timeout: 8)); reveal(entry); assertTarget(entry)
        capture("history226-me-history-entry"); entry.tap()
        XCTAssertTrue(element("intention-history").waitForExistence(timeout: 8))
    }
    private func openRepeat() {
        let button = app.buttons["weekly-intent-repeat-\(oldID)"]
        XCTAssertTrue(button.waitForExistence(timeout: 8)); reveal(button); assertTarget(button); button.tap()
        XCTAssertTrue(element("intent-editor").waitForExistence(timeout: 8))
    }
    private func verifyPublishedAtHome() {
        XCTAssertTrue(element("intent-editor").waitForNonExistence(timeout: 8))
        XCTAssertTrue(element("together-home").waitForExistence(timeout: 8))
        XCTAssertTrue(app.tabBars.buttons.element(boundBy: 0).isSelected)
        let created = app.buttons["weekly-intent-edit-\(newID)"]
        XCTAssertTrue(created.waitForExistence(timeout: 8)); XCTAssertTrue(created.isHittable)
        XCTAssertTrue(viewport.insetBy(dx: -1, dy: -1).contains(created.frame), "Publication itself must reveal the new card")
        XCTAssertFalse(element("weekly-intent-expired-history").exists)
    }
    private func selectTab(_ index: Int) {
        let button = app.tabBars.buttons.element(boundBy: index)
        XCTAssertTrue(button.waitForExistence(timeout: 8)); assertTarget(button); button.tap()
    }
    private func goBack() {
        let back = app.navigationBars.firstMatch.buttons.element(boundBy: 0)
        assertTarget(back); back.tap()
    }
    private func cancelEditor() {
        let cancel = app.navigationBars.buttons.matching(NSPredicate(format: "label == %@ OR label == %@ OR label == %@", "取消", "Cancel", "Abbrechen")).firstMatch
        XCTAssertTrue(cancel.waitForExistence(timeout: 8)); assertTarget(cancel); cancel.tap()
        XCTAssertTrue(element("intent-editor").waitForNonExistence(timeout: 8))
    }
    private func element(_ id: String) -> XCUIElement { app.descendants(matching: .any).matching(identifier: id).firstMatch }
    private var viewport: CGRect {
        let window = app.windows.firstMatch.frame
        let bar = app.navigationBars.firstMatch
        let top = bar.exists ? max(window.minY, bar.frame.maxY) : window.minY + 50
        let tabs = app.tabBars.firstMatch
        let bottom = tabs.exists ? min(window.maxY, tabs.frame.minY) : window.maxY - 34
        return CGRect(x: window.minX + 12, y: top + 2, width: window.width - 24, height: max(0, bottom - top - 4))
    }
    private func reveal(_ target: XCUIElement) {
        for segment in 0..<20 {
            let bounds = viewport
            if target.exists {
                let frame = target.frame
                XCTAssertLessThanOrEqual(frame.height, bounds.height, "Each complete text/action must fit in the actual viewport")
                if target.isHittable && bounds.insetBy(dx: -1, dy: -1).contains(frame) { return }
                let points = frame.maxY > bounds.maxY ? min(170, frame.maxY - bounds.maxY + 10)
                    : -min(170, bounds.minY - frame.minY + 10)
                drag(points, in: bounds)
            } else { drag(170, in: bounds) }
            capture("history226-continuous-scroll-\(target.identifier)-\(segment)")
        }
        XCTFail("Complete visible target unreachable: \(target.identifier)")
    }
    private func drag(_ points: CGFloat, in bounds: CGRect) {
        let travel = min(abs(points), bounds.height * 0.4)
        let y = bounds.midY + (points > 0 ? travel / 2 : -travel / 2)
        let origin = app.coordinate(withNormalizedOffset: .zero)
        origin.withOffset(CGVector(dx: bounds.midX, dy: y)).press(forDuration: 0.05,
            thenDragTo: origin.withOffset(CGVector(dx: bounds.midX, dy: y + (points > 0 ? -travel : travel))))
    }
    private func assertTarget(_ target: XCUIElement) {
        XCTAssertTrue(target.exists && target.isHittable, target.identifier)
        XCTAssertTrue(app.windows.firstMatch.frame.insetBy(dx: -1, dy: -1).contains(target.frame))
        XCTAssertGreaterThanOrEqual(target.frame.width + 0.001, 44)
        XCTAssertGreaterThanOrEqual(target.frame.height + 0.001, 44)
    }
    private func capture(_ name: String) {
        let attachment = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
        attachment.name = name; attachment.lifetime = .keepAlways; add(attachment)
    }
}
