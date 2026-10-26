import XCTest
import Darwin

/// Each method requires its own fresh two-person local cohort and read-only observer.
/// All intention, bookmark, dismissal, report and block writes come from the real UI.
@MainActor final class FiveRootTogetherDiscoveryEdgesLiveUITests: XCTestCase {
    private struct Account: Decodable {
        let role: String
        let identifier: String
        let password: String
        let id: String
    }

    private struct Fixture: Decodable {
        let kind: String
        let schemaVersion: Int
        let runID: String
        let baseURL: String
        let accounts: [Account]
        let bundle: String?
        let activityTitle: String?
        let greeting: String?
        let reportDetails: String?
    }

    private struct Pair: Decodable {
        let opportunityID: String?
        let ownerIntentID: String?
        let peerIntentID: String?
    }

    private var app: XCUIApplication!
    private var fixture: Fixture!
    private var fixtureURL: URL!
    private var section = "recommendations"
    private let environment = ProcessInfo.processInfo.environment

    override func setUpWithError() throws {
        continueAfterFailure = false
        let path = environment["SIDESEAT_FIVE_ROOT_FIXTURE"] ?? ""
        try XCTSkipUnless(!path.isEmpty, "Supply the private fresh local two-person fixture.")
        fixtureURL = URL(fileURLWithPath: path)
        fixture = try JSONDecoder().decode(Fixture.self, from: Data(contentsOf: fixtureURL))
        XCTAssertEqual(fixture.kind, "five-roots-live")
        XCTAssertEqual(fixture.schemaVersion, 1)
        XCTAssertEqual(fixture.baseURL, "http://127.0.0.1:3344",
            "Discovery safety tests may only use the isolated verified QA database.")
        XCTAssertEqual(fixture.accounts.count, 2)
        XCTAssertEqual(Set(fixture.accounts.map(\.role)), Set(["owner", "peer"]))
        XCTAssertEqual(Set(fixture.accounts.map(\.id)).count, 2)
        for account in fixture.accounts {
            XCTAssertEqual(account.identifier, "e2e_roots_\(account.role)_\(fixture.runID)")
        }
    }

    override func tearDown() async throws { await MainActor.run { app?.terminate() } }

    func test01DiscoveryBookmarkDraftAndDismissUndoPersist() throws {
        let title = fixture.activityTitle ?? "五页同行发现边界"
        let draft = fixture.greeting ?? "五页同行未发送草稿"
        login("owner"); openTogether(); publishCoffee(title)
        phase("edge-owner-published")
        login("peer"); openTogether(); publishCoffee(title)
        phase("edge-peer-published")
        let pair = try observedPair()
        let id = try XCTUnwrap(pair.opportunityID)
        let ownerIntentID = try XCTUnwrap(pair.ownerIntentID)
        let bookmark = app.buttons["mutual-opportunity-bookmark-\(id)"]
        XCTAssertTrue(bookmark.waitForExistence(timeout: 20))
        findMore()
        let inlineResults = element("explore-intents-list")
        XCTAssertTrue(inlineResults.waitForExistence(timeout: 15),
            "Find more must display real results inline on the current Together page.")
        XCTAssertTrue(element("together-home").exists)
        XCTAssertTrue(inlineResults.buttons["mutual-opportunity-bookmark-\(id)"].waitForExistence(timeout: 20),
            "The exact peer must be rendered inside the inline discovery results, not only the old recommendation section.")
        let searchAgain = app.buttons["together-find-more"]
        if searchAgain.exists {
            XCTAssertTrue(waitUntil { searchAgain.isEnabled })
            reveal(searchAgain); searchAgain.tap()
            waitForInlineDiscovery()
            XCTAssertTrue(bookmark.waitForExistence(timeout: 15))
            print("FIVE_ROOT_TOGETHER_COVERAGE search-again=performed")
        } else {
            // The actual UI removes Search again when the two-account feed is exhausted.
            XCTAssertTrue(element("explore-intents-list").exists)
            print("FIVE_ROOT_TOGETHER_COVERAGE search-again=unavailable-exhausted-two-account-feed")
        }
        capture("discovery-inline-results")
        phase("edge-inline-results")

        openProfile(id)
        capture("discovery-profile")
        app.buttons["together-profile-done"].tap()
        XCTAssertTrue(app.buttons["mutual-opportunity-profile-\(id)"].waitForExistence(timeout: 10))
        phase("edge-profile-returned")
        reveal(bookmark)
        XCTAssertEqual(bookmark.label, "收藏意愿")
        bookmark.tap()
        XCTAssertTrue(waitUntil { bookmark.exists && bookmark.label == "取消收藏" })
        capture("discovery-bookmarked")
        phase("edge-bookmarked")
        selectSection("bookmarks")
        XCTAssertTrue(bookmark.waitForExistence(timeout: 10))
        reveal(bookmark); bookmark.tap()
        let emptyReturn = app.buttons["together-saved-empty-recommendations"]
        XCTAssertTrue(emptyReturn.waitForExistence(timeout: 12))
        XCTAssertFalse(bookmark.exists)
        capture("discovery-unbookmarked-empty-saved")
        phase("edge-unbookmarked")
        reveal(emptyReturn); emptyReturn.tap()
        section = "recommendations"
        XCTAssertTrue(currentList.waitForExistence(timeout: 8))
        XCTAssertTrue(bookmark.waitForExistence(timeout: 12))
        XCTAssertEqual(bookmark.label, "收藏意愿")
        phase("edge-empty-saved-returned")

        openGreeting(id)
        let body = element("opportunity-message-body")
        XCTAssertFalse(app.buttons["opportunity-message-submit"].isEnabled)
        replaceText(body, with: draft)
        cancelGreeting()
        phase("edge-composer-cancelled")
        login("peer"); openTogether()
        openGreeting(id)
        XCTAssertEqual(element("opportunity-message-body").value as? String, draft)
        capture("discovery-restored-unsent-draft")
        cancelGreeting()
        phase("edge-draft-restored")

        hideRecommendation(id)
        let undo = app.buttons["recommendation-dismiss-undo"]
        XCTAssertTrue(undo.waitForExistence(timeout: 2))
        // Do not open an observer window until Undo has happened inside its five seconds.
        undo.tap()
        XCTAssertTrue(undo.waitForNonExistence(timeout: 5))
        XCTAssertTrue(app.buttons["mutual-opportunity-profile-\(id)"].waitForExistence(timeout: 10))
        capture("discovery-hide-undone")
        phase("edge-hide-undone")
        hideRecommendation(id)
        XCTAssertTrue(undo.waitForExistence(timeout: 2))
        XCTAssertTrue(undo.waitForNonExistence(timeout: 12), "The real five-second undo period must finish before commit is checked.")
        XCTAssertTrue(app.buttons["mutual-opportunity-profile-\(id)"].waitForNonExistence(timeout: 10))
        capture("discovery-hide-committed")
        phase("edge-hide-committed")
        login("peer"); openTogether()
        assertPeerUnavailable(opportunityID: id, peerIntentID: ownerIntentID)
        capture("discovery-hidden-after-login")
        phase("edge-hidden-reloaded")
    }

    func test02ProfileReportAndBlockRequireExplicitConfirmation() throws {
        let title = fixture.activityTitle ?? "五页同行安全边界"
        let details = fixture.reportDetails ?? "五页同行QA举报测试"
        login("owner"); openTogether(); publishCoffee(title)
        phase("safety-owner-published")
        login("peer"); openTogether(); publishCoffee(title)
        phase("safety-peer-published")
        let pair = try observedPair()
        let id = try XCTUnwrap(pair.opportunityID)
        let ownerIntentID = try XCTUnwrap(pair.ownerIntentID)
        let peerIntentID = try XCTUnwrap(pair.peerIntentID)
        openProfile(id)
        capture("safety-profile")
        phase("safety-profile-opened")

        openSafetyAction("together-report-intention")
        XCTAssertTrue(element("chat-report-sheet").waitForExistence(timeout: 8))
        replaceText(element("chat-report-details"), with: details)
        app.buttons["chat-report-cancel"].tap()
        XCTAssertTrue(element("chat-report-sheet").waitForNonExistence(timeout: 8))
        XCTAssertFalse(element("together-report-sent").exists)
        phase("safety-report-cancelled")
        openSafetyAction("together-report-intention")
        XCTAssertTrue(element("chat-report-sheet").waitForExistence(timeout: 8))
        element("chat-report-reason").tap()
        let other = app.descendants(matching: .any).matching(
            NSPredicate(format: "label IN %@", ["其他", "Other"])).firstMatch
        XCTAssertTrue(other.waitForExistence(timeout: 5)); other.tap()
        replaceText(element("chat-report-details"), with: details)
        app.buttons["chat-report-send"].tap()
        XCTAssertTrue(element("chat-report-sheet").waitForNonExistence(timeout: 15))
        XCTAssertTrue(element("together-report-sent").waitForExistence(timeout: 15))
        capture("safety-report-sent")
        phase("safety-reported")

        openSafetyAction("together-block-peer")
        tapBlockPromptAction("together-block-cancel")
        XCTAssertTrue(app.buttons["together-profile-done"].exists)
        phase("safety-block-cancelled")
        openSafetyAction("together-block-peer")
        tapBlockPromptAction("together-block-confirm")
        XCTAssertTrue(app.buttons["together-profile-done"].waitForNonExistence(timeout: 20))
        assertPeerUnavailable(opportunityID: id, peerIntentID: ownerIntentID)
        capture("safety-blocked")
        phase("safety-blocked")
        login("peer"); openTogether()
        assertPeerUnavailable(opportunityID: id, peerIntentID: ownerIntentID)
        capture("safety-blocker-after-login")
        phase("safety-peer-reloaded")
        login("owner"); openTogether()
        assertPeerUnavailable(opportunityID: id, peerIntentID: peerIntentID)
        capture("safety-blocked-peer-after-login")
        phase("safety-owner-reloaded")
    }

    private func login(_ role: String) {
        let account = fixture.accounts.first { $0.role == role }!
        app?.terminate()
        app = XCUIApplication(bundleIdentifier: environment["SIDESEAT_FIVE_ROOT_QA_BUNDLE"]
            ?? environment["SIDESEAT_PLAN_PRESENTATION_QA_BUNDLE"] ?? fixture.bundle ?? "app.sideseat.mobile.preview")
        app.launchArguments = ["--ui-testing-signed-out", "--ui-testing-ephemeral-credentials",
            "--ui-testing-skip-tutorial", "--ui-testing-local-api", "--ui-testing-language=zh-Hans",
            "--ui-testing-appearance=light", "-UIPreferredContentSizeCategoryName", "UICTContentSizeCategoryL"]
        app.launchEnvironment["SIDESEAT_API_BASE_URL_OVERRIDE"] = fixture.baseURL
        app.launch()
        let identifier = app.textFields["login-identifier"]
        XCTAssertTrue(identifier.waitForExistence(timeout: 15)); identifier.tap(); identifier.typeText(account.identifier)
        let password = app.secureTextFields["login-password"]
        XCTAssertTrue(password.exists); password.tap(); password.typeText(account.password)
        app.buttons["login-submit"].tap()
        XCTAssertTrue(waitUntil(timeout: 30) { self.app.tabBars.firstMatch.exists || self.element("required-setup").exists })
        XCTAssertTrue(app.tabBars.firstMatch.waitForExistence(timeout: 15),
            "Both QA accounts must pass the real readiness gate; no authenticated fixture is permitted.")
        let system = XCUIApplication(bundleIdentifier: "com.apple.springboard")
        let deny = system.buttons.matching(NSPredicate(format: "label IN %@",
            ["不允许", "Don’t Allow", "Don't Allow", "Nicht erlauben"])).firstMatch
        if deny.waitForExistence(timeout: 2) { deny.tap() }
        section = "recommendations"
    }

    private func openTogether() {
        let tab = app.tabBars.buttons.matching(NSPredicate(format: "label IN %@", ["同行", "Together"])).firstMatch
        XCTAssertTrue(tab.waitForExistence(timeout: 10)); tab.tap()
        XCTAssertTrue(element("together-home").waitForExistence(timeout: 20))
        selectSection("recommendations")
    }

    private func selectSection(_ target: String) {
        let button = app.buttons["together-tab-\(target)"]
        if !button.exists {
            let menu = app.buttons["together-section-menu"]
            XCTAssertTrue(menu.waitForExistence(timeout: 8)); menu.tap()
        }
        XCTAssertTrue(button.waitForExistence(timeout: 8)); button.tap()
        section = target
        XCTAssertTrue(currentList.waitForExistence(timeout: 8))
    }

    private func publishCoffee(_ title: String) {
        let add = app.buttons["together-add-intent"]
        let first = app.buttons["together-add-first-intent"]
        XCTAssertTrue(waitUntil { add.exists || first.exists })
        let button = add.exists ? add : first
        reveal(button); button.tap()
        XCTAssertTrue(element("intent-editor").waitForExistence(timeout: 10))
        app.buttons["intent-topic-coffee"].tap()
        replaceText(element("intent-editor-activity"), with: title)
        let save = app.buttons["intent-editor-save"]
        XCTAssertTrue(save.isEnabled); save.tap()
        XCTAssertTrue(element("intent-editor").waitForNonExistence(timeout: 20))
        let ownTitle = app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH %@ AND label CONTAINS %@",
            "weekly-intent-edit-", title)).firstMatch
        XCTAssertTrue(ownTitle.waitForExistence(timeout: 15))
    }

    private func findMore() {
        let more = app.buttons["together-find-more"]
        XCTAssertTrue(more.waitForExistence(timeout: 10)); reveal(more)
        XCTAssertTrue(more.isEnabled); more.tap()
        waitForInlineDiscovery()
    }

    private func waitForInlineDiscovery() {
        XCTAssertTrue(element("explore-intents-list").waitForExistence(timeout: 20))
        // Exhausted results remove the button. Query its disabled state atomically
        // instead of reading isEnabled after a separate, stale exists snapshot.
        let loading = app.buttons.matching(NSPredicate(format: "identifier == %@ AND enabled == false",
            "together-find-more")).firstMatch
        XCTAssertTrue(loading.waitForNonExistence(timeout: 20))
    }

    private func openProfile(_ id: String) {
        let profile = app.buttons["mutual-opportunity-profile-\(id)"]
        XCTAssertTrue(profile.waitForExistence(timeout: 15)); reveal(profile); profile.tap()
        XCTAssertTrue(waitUntil { self.element("public-profile").exists || self.element("together-private-profile").exists })
        XCTAssertTrue(app.buttons["together-profile-done"].waitForExistence(timeout: 8))
    }

    private func openGreeting(_ id: String) {
        let message = app.buttons["mutual-opportunity-message-\(id)"]
        XCTAssertTrue(message.waitForExistence(timeout: 15)); reveal(message); message.tap()
        XCTAssertTrue(element("opportunity-message-body").waitForExistence(timeout: 8))
    }

    private func cancelGreeting() {
        let cancel = app.navigationBars.buttons.matching(NSPredicate(format: "label IN %@", ["取消", "Cancel"])).firstMatch
        XCTAssertTrue(cancel.waitForExistence(timeout: 5)); cancel.tap()
        XCTAssertTrue(element("opportunity-message-body").waitForNonExistence(timeout: 8))
    }

    private func hideRecommendation(_ id: String) {
        let menu = app.buttons["mutual-opportunity-menu-\(id)"]
        XCTAssertTrue(menu.waitForExistence(timeout: 10)); reveal(menu); menu.tap()
        let hide = app.buttons["recommendation-dismiss"]
        XCTAssertTrue(hide.waitForExistence(timeout: 5)); hide.tap()
    }

    private func openSafetyAction(_ id: String) {
        let menu = app.buttons["together-profile-safety"]
        XCTAssertTrue(menu.waitForExistence(timeout: 8)); menu.tap()
        let action = app.buttons[id]
        XCTAssertTrue(action.waitForExistence(timeout: 5)); action.tap()
    }

    private func tapBlockPromptAction(_ id: String) {
        let prompts = app.alerts.matching(NSPredicate(format: "label IN %@",
            ["拉黑此人？", "Block this person?", "Diese Person blockieren?"]))
        var action: XCUIElement?
        XCTAssertTrue(waitUntil(timeout: 5) {
            for prompt in prompts.allElementsBoundByIndex where prompt.exists && prompt.isHittable {
                // SwiftUI exposes the alert action as nested Buttons with the same ID.
                // Stay inside this visible safety alert and use its deepest hittable action.
                if let button = prompt.buttons.matching(identifier: id).allElementsBoundByIndex.last(where: { $0.isHittable }) {
                    action = button
                    return true
                }
            }
            return false
        }, "The explicit block confirmation must expose its current hittable action.")
        guard let action else { return }
        action.tap()
        XCTAssertTrue(prompts.firstMatch.waitForNonExistence(timeout: 8))
    }

    private func assertPeerUnavailable(opportunityID: String, peerIntentID: String) {
        XCTAssertTrue(element("together-opportunities-empty").waitForExistence(timeout: 20))
        assertNoContactControls(opportunityID: opportunityID, peerIntentID: peerIntentID)
        // Asking the real discovery feed again must also respect the dismissal/block.
        findMore()
        XCTAssertTrue(element("explore-intents-empty").waitForExistence(timeout: 15))
        assertNoContactControls(opportunityID: opportunityID, peerIntentID: peerIntentID)
    }

    private func assertNoContactControls(opportunityID: String, peerIntentID: String) {
        for prefix in ["mutual-opportunity-profile-", "mutual-opportunity-bookmark-", "mutual-opportunity-message-", "mutual-opportunity-open-"] {
            XCTAssertFalse(app.buttons[prefix + opportunityID].exists)
        }
        for prefix in ["explore-profile-", "explore-bookmark-", "explore-message-"] {
            XCTAssertFalse(app.buttons[prefix + peerIntentID].exists)
        }
        XCTAssertFalse(element("intention-chat").exists)
        XCTAssertFalse(element("direct-chat").exists)
        XCTAssertFalse(element("plan-create-sheet").exists)
    }

    private var currentList: XCUIElement { app.scrollViews["together-section-\(section)"].firstMatch }
    private func element(_ id: String) -> XCUIElement {
        app.descendants(matching: .any).matching(identifier: id).firstMatch
    }

    private func reveal(_ target: XCUIElement) {
        XCTAssertTrue(target.waitForExistence(timeout: 10))
        for _ in 0..<8 where !fullyVisible(target) { currentList.swipeUp() }
        for _ in 0..<8 where !fullyVisible(target) { currentList.swipeDown() }
        XCTAssertTrue(target.isHittable, "The exact owned peer's control must be reachable in this section.")
    }

    private func fullyVisible(_ target: XCUIElement) -> Bool {
        guard target.exists, target.isHittable else { return false }
        let list = currentList.frame
        let top = max(list.minY, element("together-segmented-control").frame.maxY)
        let bottom = min(list.maxY, app.tabBars.firstMatch.frame.minY)
        return CGRect(x: list.minX, y: top, width: list.width, height: max(0, bottom - top))
            .insetBy(dx: -1, dy: -1).contains(target.frame)
    }

    private func replaceText(_ field: XCUIElement, with text: String) {
        XCTAssertTrue(field.waitForExistence(timeout: 8)); field.tap()
        for _ in 0..<3 {
            let current = field.value as? String ?? ""
            if current.isEmpty || current == field.placeholderValue { break }
            field.press(forDuration: 1.1)
            let selectAll = app.descendants(matching: .any).matching(
                NSPredicate(format: "label IN %@", ["全选", "Select All"])).firstMatch
            if selectAll.waitForExistence(timeout: 2) {
                selectAll.tap(); field.typeText(XCUIKeyboardKey.delete.rawValue)
            } else {
                let cut = app.descendants(matching: .any).matching(
                    NSPredicate(format: "label IN %@", ["剪切", "Cut"])).firstMatch
                XCTAssertTrue(cut.waitForExistence(timeout: 2)); cut.tap()
            }
        }
        let cleared = field.value as? String ?? ""
        XCTAssertTrue(cleared.isEmpty || cleared == field.placeholderValue)
        field.typeText(text)
        XCTAssertEqual(field.value as? String, text)
    }

    private func observedPair() throws -> Pair {
        let path = environment["SIDESEAT_FIVE_ROOT_OBSERVER_STATE"].map { URL(fileURLWithPath: $0) }
            ?? fixtureURL.deletingLastPathComponent().appendingPathComponent("together-observer-state.json")
        var pair: Pair?
        XCTAssertTrue(waitUntil(timeout: 30) {
            guard let data = try? Data(contentsOf: path),
                  let candidate = try? JSONDecoder().decode(Pair.self, from: data),
                  candidate.opportunityID != nil, candidate.ownerIntentID != nil, candidate.peerIntentID != nil else { return false }
            pair = candidate
            return true
        }, "The observer must identify only this run's exact two-person opportunity.")
        return try XCTUnwrap(pair)
    }

    private func waitUntil(timeout: TimeInterval = 12, _ condition: () -> Bool) -> Bool {
        let deadline = Date().addingTimeInterval(timeout)
        repeat {
            if condition() { return true }
            RunLoop.current.run(until: Date().addingTimeInterval(0.25))
        } while Date() < deadline
        return condition()
    }

    private func capture(_ name: String) {
        XCTAssertFalse(app.secureTextFields["login-password"].exists)
        let attachment = XCTAttachment(screenshot: app.screenshot())
        attachment.name = "five-root-together-\(name)"
        attachment.lifetime = .keepAlways
        add(attachment)
    }

    private func phase(_ name: String) {
        print("FIVE_ROOT_TOGETHER_PHASE \(name)")
        fflush(stdout)
        RunLoop.current.run(until: Date().addingTimeInterval(3))
    }
}
