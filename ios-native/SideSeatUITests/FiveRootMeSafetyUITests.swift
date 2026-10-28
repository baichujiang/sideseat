import XCTest
import Darwin

/// Only fresh local QA actors; Feedback creation requires an independently verified mail-disabled server.
@MainActor final class FiveRootMeSafetyUITests: XCTestCase {
    private struct Account: Decodable {
        let role: String; let id: String; let identifier: String; let password: String
    }
    private struct Preparation: Decodable {
        let schemaVersion: Int; let runID: String; let preparedAt: String; let caseKind: String
        let connectionID: String?; let seedOwnerText: String?; let seedPeerText: String?
        let feedbackTitle: String; let feedbackMessage: String; let commentBody: String
    }
    private struct Fixture: Decodable {
        let kind: String; let schemaVersion: Int; let runID: String; let baseURL: String
        let bundle: String; let accounts: [Account]; let meSafety: Preparation
    }
    private var fixture: Fixture!, app: XCUIApplication!
    private func element(_ id: String) -> XCUIElement {
        app.descendants(matching: .any).matching(identifier: id).firstMatch
    }

    override func setUpWithError() throws {
        continueAfterFailure = false
        try XCTSkipUnless(ProcessInfo.processInfo.environment["SIDESEAT_ME_SAFETY_EXECUTE"] == "1",
                          "Only an explicitly prepared independent local Me cohort may execute.")
    }
    override func tearDown() async throws { await MainActor.run { app?.terminate() } }

    func testUnblockCancelConfirmAndBothAccountsRelaunchWithoutRestoringChat() throws {
        try loadFixture(kind: "unblock"); try login("owner"); try openSettingsEntry("settings-blocked-users")
        let peer = try account("peer"), button = app.buttons["blocked-users-unblock-\(peer.id)"]
        try require(button.waitForExistence(timeout: 20)
                    && element("blocked-users-row-\(peer.id)").exists, "The exact prepared blocked peer must appear.")
        try capture("unblock-01-existing-owned-block"); try phase("baseline")
        try tap(button)
        try require(element("blocked-users-unblock-prompt").waitForExistence(timeout: 10), "Open the real Unblock confirmation.")
        try capture("unblock-02-cancel-prompt"); try tap(app.buttons["blocked-users-unblock-cancel"])
        try require(element("blocked-users-unblock-prompt").waitForNonExistence(timeout: 10) && button.exists,
                    "Cancel must retain the exact blocked peer.")
        try phase("unblock-cancelled")
        try tap(button); try require(element("blocked-users-unblock-prompt").waitForExistence(timeout: 10), "Reopen the same confirmation.")
        try tap(app.buttons["blocked-users-confirm-unblock"])
        try require(element("blocked-users-empty").waitForExistence(timeout: 20) && !button.exists,
                    "Confirm must remove the exact owned block and show the empty list.")
        try capture("unblock-03-confirmed-empty"); try phase("unblock-confirmed")
        try login("owner"); try openSettingsEntry("settings-blocked-users")
        try require(element("blocked-users-empty").waitForExistence(timeout: 20), "The owner's unblock persists after relogin.")
        try openEmptyMessages(); try phase("owner-relaunched")
        try login("peer"); try openSettingsEntry("settings-blocked-users")
        try require(element("blocked-users-empty").waitForExistence(timeout: 20), "The peer never acquires a reciprocal block.")
        try openEmptyMessages(); try capture("unblock-04-peer-no-restored-chat")
        try phase("peer-relaunched"); try phase("complete")
    }

    func testOwnedFeedbackCreateVoteUndoCommentAndRelaunchWithMailDisabled() throws {
        try loadFixture(kind: "feedback"); try login("owner"); try openFeedback()
        try require(!feedbackRows.firstMatch.exists, "The isolated local feedback board must start empty.")
        try phase("empty")
        try compose()
        try writeEmpty("feedback-title", "Cancelled " + fixture.runID)
        try writeEmpty("feedback-message", "This owned draft is cancelled without submitting " + fixture.runID)
        try tap(app.navigationBars.buttons.matching(NSPredicate(format: "label IN %@", ["Cancel", "取消"])).firstMatch)
        try require(element("feedback-compose-sheet").waitForNonExistence(timeout: 10) && !feedbackRows.firstMatch.exists,
                    "Cancel must not create a feedback post.")
        try phase("draft-cancelled")
        try compose(); try writeEmpty("feedback-title", fixture.meSafety.feedbackTitle)
        try writeEmpty("feedback-message", fixture.meSafety.feedbackMessage)
        try tap(app.buttons["feedback-submit"])
        try require(element("feedback-compose-sheet").waitForNonExistence(timeout: 25), "Successful submission dismisses its form.")
        try require(waitUntil { self.feedbackRows.count == 1 && self.feedbackRows.firstMatch.label.contains(self.fixture.meSafety.feedbackTitle) },
                    "Exactly one server-backed owned post must appear.")
        let row = feedbackRows.firstMatch, postID = String(row.identifier.dropFirst("feedback-row-".count))
        try require(postID.range(of: "^c[a-z0-9]{20,32}$", options: .regularExpression) != nil,
                    "Use the actual API post identity, never a UI placeholder.")
        try capture("feedback-01-created-owned-post"); try phase("created")
        try login("owner"); try openFeedback(); try openPost(postID)
        try assertVotes(up: false, down: false); try phase("creator-reloaded")
        try login("peer"); try openFeedback(); try openPost(postID)
        try assertVotes(up: false, down: false)
        try tap(app.buttons["feedback-upvote"]); try assertVotes(up: true, down: false)
        try capture("feedback-02-peer-upvote"); try phase("upvoted")
        try tap(app.buttons["feedback-upvote"]); try assertVotes(up: false, down: false)
        try capture("feedback-03-upvote-removed"); try phase("upvote-removed")
        try tap(app.buttons["feedback-downvote"]); try assertVotes(up: false, down: true)
        try phase("downvoted")
        try tap(app.buttons["feedback-downvote"]); try assertVotes(up: false, down: false)
        try capture("feedback-04-downvote-removed"); try phase("downvote-removed")
        let comment = input("feedback-comment-field"); try reveal(comment)
        try writeEmpty("feedback-comment-field", fixture.meSafety.commentBody)
        let send = try revealFeedbackElement(app.buttons.matching(identifier: "feedback-comment-submit"), interactive: true, downFirst: false)
        try tap(send)
        let clearedField = try revealFeedbackElement(app.textFields.matching(identifier: "feedback-comment-field"), interactive: true, downFirst: true)
        try require(waitUntil { clearedField.exists && self.textValue(clearedField).isEmpty },
                    "The actual input must clear only its successfully submitted draft.")
        let postedComment = try revealFeedbackElement(app.staticTexts.matching(NSPredicate(format: "label == %@", fixture.meSafety.commentBody)), interactive: false, downFirst: true)
        try require(postedComment.exists && postedComment.label == fixture.meSafety.commentBody,
                    "The exact actual comment must be fully visible after its single submission.")
        try capture("feedback-05-peer-comment"); try phase("comment-sent")
        try login("peer"); try openFeedback(); try openPost(postID)
        try assertVotes(up: false, down: false)
        let peerComment = try revealFeedbackElement(app.staticTexts.matching(NSPredicate(format: "label == %@", fixture.meSafety.commentBody)), interactive: false, downFirst: false)
        try require(peerComment.exists && peerComment.label == fixture.meSafety.commentBody,
                    "The exact comment and removed vote must survive the author's relogin.")
        try phase("peer-reloaded")
        try login("owner"); try openFeedback(); try openPost(postID)
        try assertVotes(up: false, down: false)
        let ownerComment = try revealFeedbackElement(app.staticTexts.matching(NSPredicate(format: "label == %@", fixture.meSafety.commentBody)), interactive: false, downFirst: false)
        try require(ownerComment.exists && ownerComment.label == fixture.meSafety.commentBody,
                    "The post creator must receive the other actor's actual comment without inheriting a vote.")
        try capture("feedback-06-owner-received-comment"); try phase("owner-read-comment"); try phase("complete")
    }

    private var feedbackRows: XCUIElementQuery {
        app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH 'feedback-row-'"))
    }
    private func loadFixture(kind: String) throws {
        try require(ProcessInfo.processInfo.environment["SIMULATOR_UDID"] == "AEBD816E-53A7-4012-B76A-FEF82CF02A6B",
                    "Use only the owned iPhone17Pro Simulator.")
        try require(ProcessInfo.processInfo.environment["SIDESEAT_ME_SAFETY_CASE"] == kind, "Run exactly one independent case.")
        let raw = ProcessInfo.processInfo.environment["SIDESEAT_ME_SAFETY_FIXTURE_JSON"] ?? ""
        try require(raw.hasPrefix("{"), "Supply the exact owned local fixture.")
        fixture = try JSONDecoder().decode(Fixture.self, from: Data(raw.utf8))
        try require(fixture.kind == "five-roots-live" && fixture.schemaVersion == 1 && fixture.baseURL == "http://127.0.0.1:3344"
                    && fixture.bundle == "app.sideseat.mobile.preview" && fixture.runID.range(of: "^[a-f0-9]{12}$", options: .regularExpression) != nil,
                    "These cases must never operate against production.")
        try require(fixture.accounts.count == 2 && Set(fixture.accounts.map(\.role)) == ["owner", "peer"]
                    && Set(fixture.accounts.map(\.id)).count == 2 && fixture.accounts.allSatisfy {
                        $0.identifier == "e2e_roots_\($0.role)_\(fixture.runID)" && $0.password.count >= 24
                    }, "Only this run's two owned actors are permitted.")
        let m = fixture.meSafety, parser = ISO8601DateFormatter(); parser.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        try require(m.schemaVersion == 1 && m.runID == fixture.runID && m.caseKind == kind
                    && (parser.date(from: m.preparedAt) ?? ISO8601DateFormatter().date(from: m.preparedAt)) != nil
                    && m.feedbackTitle == "Owned feedback " + fixture.runID && m.feedbackMessage == "Owned feedback message " + fixture.runID
                    && m.commentBody == "Owned feedback comment " + fixture.runID, "Validate the exact prepared owned content.")
        if kind == "unblock" {
            try require(m.connectionID?.range(of: "^c[a-z0-9]{20,32}$", options: .regularExpression) != nil,
                        "The prepared blocked connection must be a real owned identifier.")
        } else { try require(m.connectionID == nil, "Feedback must start without any relationship or chat.") }
    }
    private func account(_ role: String) throws -> Account { try XCTUnwrap(fixture.accounts.first { $0.role == role }) }
    private func login(_ role: String) throws {
        let variant = ProcessInfo.processInfo.environment["SIDESEAT_ME_SAFETY_TEXT_SIZE"] ?? ""
        try require(["standard", "maximum"].contains(variant), "Root must select exactly one explicit text-size variant.")
        let category = variant == "standard" ? "UICTContentSizeCategoryL" : "UICTContentSizeCategoryAccessibilityXXXL"
        print("ME_SAFETY_TEXT_SIZE \(variant) \(category)"); fflush(stdout)
        let a = try account(role); app?.terminate(); app = XCUIApplication(bundleIdentifier: fixture.bundle)
        app.launchArguments = ["--ui-testing-signed-out", "--ui-testing-ephemeral-credentials", "--ui-testing-skip-tutorial",
            "--ui-testing-local-api", "--ui-testing-language=en", "--ui-testing-appearance=light",
            "-UIPreferredContentSizeCategoryName", category]
        if variant == "maximum" { app.launchArguments.append("--ui-testing-dynamic-type-accessibility") }
        app.launchEnvironment = ["SIDESEAT_API_BASE_URL_OVERRIDE": fixture.baseURL]; app.launch()
        let name = app.textFields["login-identifier"], password = app.secureTextFields["login-password"]
        try require(name.waitForExistence(timeout: 25) && password.exists, "Use the real local login form.")
        name.tap(); name.typeText(a.identifier); password.tap(); password.typeText(a.password); app.buttons["login-submit"].tap()
        try require(waitUntil(timeout: 35) { self.app.state == .runningForeground && !name.exists && !password.exists
            && self.app.tabBars.firstMatch.exists && self.app.tabBars.firstMatch.buttons.count == 5 }, "Wait for the exact ready five-tab shell.")
    }
    private func openSettingsEntry(_ id: String) throws {
        try tap(app.tabBars.buttons.element(boundBy: 4))
        try require(app.buttons["me-hero-edit"].waitForExistence(timeout: 20), "The owned Me profile must load.")
        try reveal(app.buttons["me-settings"]); try tap(app.buttons["me-settings"])
        try require(element("settings-root").waitForExistence(timeout: 15), "Open actual Settings.")
        try reveal(app.buttons[id]); try tap(app.buttons[id])
    }
    private func openEmptyMessages() throws {
        try tap(app.tabBars.buttons.element(boundBy: 3))
        try require(app.buttons["inbox-notifications"].waitForExistence(timeout: 20), "Load the actual Messages root.")
        let rows = app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH 'inbox-row-'"))
        try require(rows.count == 0, "Unblock never restores the prior blocked conversation.")
    }
    private func openFeedback() throws {
        try openSettingsEntry("settings-feedback")
        try require(element("feedback-root").waitForExistence(timeout: 20), "Open the actual Feedback board.")
    }
    private func compose() throws {
        try tap(app.buttons["feedback-compose"])
        try require(element("feedback-compose-sheet").waitForExistence(timeout: 15), "Open the actual feedback form.")
        try require(!app.buttons["feedback-submit"].isEnabled, "An empty post cannot be submitted.")
    }
    private func openPost(_ id: String) throws {
        try require(feedbackRows.count == 1, "Only this run's owned feedback post may be shown.")
        let rows = app.buttons.matching(identifier: "feedback-row-\(id)")
        try require(rows.count == 1, "There must be exactly one current owned row.")
        let row = rows.firstMatch
        try require(row.exists && row.isEnabled && row.isHittable, "The current owned row must already be visible and enabled.")
        let frame = row.frame, window = app.windows.firstMatch.frame
        let lists = app.collectionViews.containing(.button, identifier: "feedback-row-\(id)")
        try require(lists.count == 1, "The exact owned row must belong to one actual collection.")
        let list = lists.firstMatch
        try require(list.exists && list.identifier == "feedback-root", "Use the actual loaded Feedback collection.")
        let containedRows = list.buttons.matching(identifier: "feedback-row-\(id)")
        try require(containedRows.count == 1 && containedRows.firstMatch.isEnabled && containedRows.firstMatch.isHittable
                    && containedRows.firstMatch.frame == frame, "The collection must contain the same unique visible enabled owned row.")
        let listFrame = list.frame
        try require(!frame.isNull && !frame.isEmpty && frame.width >= 44 && frame.height >= 44
                    && !listFrame.isNull && !listFrame.isEmpty && listFrame.width > 0 && listFrame.height > 0
                    && [frame.minX, frame.minY, frame.width, frame.height, listFrame.minX, listFrame.minY, listFrame.width, listFrame.height].allSatisfy { $0.isFinite },
                    "Use positive finite actual row and collection frames.")
        let intersection = listFrame.intersection(window)
        try require(!intersection.isNull && !intersection.isEmpty, "The collection must intersect the actual app window.")
        var viewport = intersection
        let navigation = app.navigationBars.firstMatch, tabs = app.tabBars.firstMatch
        if navigation.exists { viewport = viewport.intersection(CGRect(x: window.minX, y: navigation.frame.maxY,
            width: window.width, height: max(0, window.maxY - navigation.frame.maxY))) }
        if tabs.exists { viewport = viewport.intersection(CGRect(x: window.minX, y: window.minY,
            width: window.width, height: max(0, tabs.frame.minY - window.minY))) }
        try require(!viewport.isNull && viewport.contains(frame), "The entire row must fit the actual viewport without scrolling around a layout defect.")
        let textFrames = row.descendants(matching: .staticText).allElementsBoundByIndex.map(\.frame)
        try require(!textFrames.isEmpty && textFrames.allSatisfy { !$0.isEmpty }, "Prove the row's visible text bounds before selecting blank space.")
        let contentFrames = textFrames + row.descendants(matching: .image).allElementsBoundByIndex.map(\.frame).filter { !$0.isEmpty }
        let x = frame.maxX - 12
        let edges = ([frame.minY + 8, frame.maxY - 8] + contentFrames.filter { $0.minX - 1 <= x && x <= $0.maxX + 1 }
            .flatMap { [$0.minY - 1, $0.maxY + 1] }).sorted()
        let gaps = zip(edges, edges.dropFirst()).map { ($0 + $1) / 2 }
        let candidates = ([frame.midY, frame.minY + 12, frame.maxY - 12] + gaps)
            .map { CGPoint(x: x, y: $0) }
        guard let point = candidates.first(where: { candidate in frame.insetBy(dx: 8, dy: 8).contains(candidate)
            && contentFrames.allSatisfy { contentFrame in !contentFrame.insetBy(dx: -1, dy: -1).contains(candidate) } }) else {
            try require(false, "A genuine visible right-side blank area must exist; do not substitute a text/control tap."); return
        }
        let geometry: [String: Any] = ["rowID": id, "rowFrame": NSCoder.string(for: frame), "viewport": NSCoder.string(for: viewport),
            "rightBlankPoint": NSCoder.string(for: point), "contentFrames": contentFrames.map { NSCoder.string(for: $0) }, "singleTap": true]
        let evidence = XCTAttachment(string: String(data: try JSONSerialization.data(withJSONObject: geometry, options: [.sortedKeys]), encoding: .utf8)!)
        evidence.name = "feedback-right-blank-tap-geometry"; evidence.lifetime = .keepAlways; add(evidence)
        try capture("feedback-row-right-blank-before-tap")
        print("ME_SAFETY_ROW_RIGHT_BLANK_TAP \(Int(point.x)) \(Int(point.y))"); fflush(stdout)
        row.coordinate(withNormalizedOffset: .zero).withOffset(CGVector(dx: point.x - frame.minX, dy: point.y - frame.minY)).tap()
        try require(element("feedback-detail").waitForExistence(timeout: 20)
                    && app.staticTexts[fixture.meSafety.feedbackMessage].firstMatch.exists,
                    "Open the same exact post and original body.")
    }
    private func assertVotes(up: Bool, down: Bool) throws {
        try revealDetailVotes()
        let u = app.buttons["feedback-upvote"], d = app.buttons["feedback-downvote"]
        try require(waitUntil { u.exists && d.exists && u.isEnabled && d.isEnabled
            && (u.value as? String) == (up ? "Selected" : "Not selected")
            && (d.value as? String) == (down ? "Selected" : "Not selected")
            && !self.element("feedback-action-failed-prompt").exists }, "The two real vote buttons must show the exact current selection.")
    }
    private func revealDetailVotes() throws {
        let lists = app.collectionViews.matching(identifier: "feedback-detail")
        try require(lists.firstMatch.waitForExistence(timeout: 20) && lists.count == 1,
                    "Use the unique actual Feedback detail collection.")
        let list = lists.firstMatch
        let ups = list.buttons.matching(identifier: "feedback-upvote"), downs = list.buttons.matching(identifier: "feedback-downvote")
        let u = ups.firstMatch, d = downs.firstMatch
        func viewport() -> CGRect {
            let window = app.windows.firstMatch.frame
            var rect = list.frame.intersection(window)
            let navigation = app.navigationBars.firstMatch, tabs = app.tabBars.firstMatch
            if navigation.exists { rect = rect.intersection(CGRect(x: window.minX, y: navigation.frame.maxY,
                width: window.width, height: max(0, window.maxY - navigation.frame.maxY))) }
            if tabs.exists { rect = rect.intersection(CGRect(x: window.minX, y: window.minY,
                width: window.width, height: max(0, tabs.frame.minY - window.minY))) }
            return rect
        }
        func inside() -> Bool {
            let rect = viewport()
            return ups.count == 1 && downs.count == 1 && !rect.isNull && !rect.isEmpty
                && [u, d].allSatisfy { button in button.exists && !button.frame.isNull && !button.frame.isEmpty
                    && [button.frame.minX, button.frame.minY, button.frame.width, button.frame.height].allSatisfy { $0.isFinite }
                    && rect.contains(button.frame) }
        }
        func ready() -> Bool { inside() && u.isEnabled && d.isEnabled && u.isHittable && d.isHittable }
        if inside() {
            try require(waitUntil { ready() }, "The two fully visible real vote controls must be enabled and hittable.")
            return
        }
        func record(_ stage: String, count: Int) throws {
            try require(app.state == .runningForeground && !app.textFields["login-identifier"].exists
                        && !app.secureTextFields["login-password"].exists && lists.count == 1,
                        "Capture only the actual loaded Feedback detail, never authentication inputs.")
            let ax = XCTAttachment(string: list.debugDescription)
            ax.name = "feedback-detail-votes-scroll-\(stage)-AX"; ax.lifetime = .keepAlways; add(ax)
            let geometry: [String: Any] = ["collectionID": list.identifier, "collectionFrame": NSCoder.string(for: list.frame),
                "viewport": NSCoder.string(for: viewport()), "buttonIDs": ["feedback-upvote", "feedback-downvote"],
                "buttonFrames": [u, d].map { $0.exists ? NSCoder.string(for: $0.frame) : "not-instantiated" },
                "buttonCounts": [ups.count, downs.count], "normalScrollCount": count]
            let attachment = XCTAttachment(string: String(data: try JSONSerialization.data(withJSONObject: geometry, options: [.sortedKeys]), encoding: .utf8)!)
            attachment.name = "feedback-detail-votes-scroll-\(stage)-geometry"; attachment.lifetime = .keepAlways; add(attachment)
            try capture("feedback-detail-votes-scroll-\(stage)")
        }
        try record("before", count: 0)
        for count in 0...8 {
            if inside() {
                try require(waitUntil { ready() }, "After normal scrolling, both exact vote controls must be fully visible, enabled and hittable.")
                try record("after", count: count)
                print("ME_SAFETY_DETAIL_VOTES_SCROLL \(count)"); fflush(stdout)
                return
            }
            if count == 8 { break }
            let rect = viewport()
            try require(!rect.isNull && !rect.isEmpty && [rect.minX, rect.minY, rect.width, rect.height].allSatisfy { $0.isFinite },
                        "Scroll only the actual positive finite detail viewport.")
            let frames = [u, d].filter { $0.exists }.map(\.frame)
            if !frames.isEmpty && frames.allSatisfy({ $0.minY < rect.minY }) { list.swipeDown(velocity: .slow) }
            else { list.swipeUp(velocity: .slow) }
        }
        try require(false, "Both real vote controls must fit the current Nav/Tab viewport after at most eight normal detail scrolls.")
    }
    private func feedbackViewport(_ list: XCUIElement) -> CGRect {
        let window = app.windows.firstMatch.frame
        var rect = list.frame.intersection(window)
        let nav = app.navigationBars.firstMatch, tabs = app.tabBars.firstMatch
        if nav.exists { rect = rect.intersection(CGRect(x: window.minX, y: nav.frame.maxY, width: window.width, height: max(0, window.maxY - nav.frame.maxY))) }
        if tabs.exists { rect = rect.intersection(CGRect(x: window.minX, y: window.minY, width: window.width, height: max(0, tabs.frame.minY - window.minY))) }
        let keyboard = app.keyboards.allElementsBoundByIndex
            + app.otherElements.matching(identifier: "inputView").allElementsBoundByIndex
            + app.otherElements.matching(identifier: "SystemInputAssistantView").allElementsBoundByIndex
        let frames = keyboard.filter { $0.exists }.map(\.frame).filter { !$0.isNull && !$0.isEmpty && $0.width > window.width / 2
            && $0.minY > window.minY && $0.intersects(window) }
        if let top = frames.map(\.minY).min() {
            rect = rect.intersection(CGRect(x: window.minX, y: window.minY, width: window.width, height: max(0, top - window.minY)))
        }
        return rect
    }
    private func revealFeedbackElement(_ matches: XCUIElementQuery, interactive: Bool, downFirst: Bool) throws -> XCUIElement {
        let lists = app.collectionViews.matching(identifier: "feedback-detail")
        try require(lists.count == 1 && lists.firstMatch.exists, "Use the unique actual detail CollectionView.")
        let list = lists.firstMatch, target = matches.firstMatch
        func inside() -> Bool {
            let rect = feedbackViewport(list)
            return matches.count == 1 && target.exists && !target.frame.isNull && !target.frame.isEmpty
                && !rect.isNull && !rect.isEmpty && rect.contains(target.frame)
        }
        func ready() -> Bool { inside() && (!interactive || (target.isEnabled && target.isHittable)) }
        func record(_ stage: String, step: Int) throws {
            try require(app.state == .runningForeground && !app.textFields["login-identifier"].exists
                        && !app.secureTextFields["login-password"].exists, "Capture only the owned Feedback detail, never authentication inputs.")
            let ax = XCTAttachment(string: app.debugDescription); ax.name = "feedback-reveal-\(stage)-\(step)-safe-AX"; ax.lifetime = .keepAlways; add(ax)
            let geometry: [String: Any] = ["stage": stage, "step": step, "matchCount": matches.count, "interactive": interactive,
                "viewport": NSCoder.string(for: feedbackViewport(list)), "gutterX": feedbackViewport(list).minX + 12,
                "targetFrame": target.exists ? NSCoder.string(for: target.frame) : "not-instantiated", "targetID": target.exists ? target.identifier : "not-instantiated",
                "ready": ready(), "keyboardPresent": app.keyboards.firstMatch.exists]
            let attachment = XCTAttachment(string: String(data: try JSONSerialization.data(withJSONObject: geometry, options: [.sortedKeys]), encoding: .utf8)!)
            attachment.name = "feedback-reveal-\(stage)-\(step)-geometry"; attachment.lifetime = .keepAlways; add(attachment)
            try capture("feedback-reveal-\(stage)-\(step)")
        }
        if inside() {
            try require(waitUntil { ready() }, "The current exact control must be ready; read-only text needs only its full visible frame.")
            return target
        }
        for step in 0...8 {
            try require(matches.count <= 1, "The intended exact Feedback element must be unique.")
            if inside() {
                try require(waitUntil { ready() }, "The exact revealed control must be ready before acting.")
                try record("visible", step: step); return target
            }
            if step == 8 { break }
            try record("before", step: step)
            let rect = feedbackViewport(list), x = rect.minX + 12
            try require(!rect.isNull && !rect.isEmpty && rect.height >= 120,
                        "Use only a real visible content viewport above the keyboard and prediction bar.")
            var down = step < 4 ? downFirst : !downFirst
            if target.exists && !target.frame.isEmpty {
                if target.frame.minY < rect.minY { down = true }
                else if target.frame.maxY > rect.maxY { down = false }
            }
            let lower = CGPoint(x: x, y: rect.minY + rect.height * 0.80), upper = CGPoint(x: x, y: rect.minY + rect.height * 0.40)
            let start = down ? upper : lower, end = down ? lower : upper
            try require(rect.insetBy(dx: 8, dy: 8).contains(start) && rect.insetBy(dx: 8, dy: 8).contains(end),
                        "Keep the normal short drag inside the measured x12 content gutter.")
            let line = CGRect(x: x - 1, y: min(start.y, end.y), width: 2, height: abs(start.y - end.y))
            let controls = list.buttons.allElementsBoundByIndex + list.textFields.allElementsBoundByIndex + list.textViews.allElementsBoundByIndex
            try require(controls.filter { $0.exists && $0.isHittable }.allSatisfy { $0.frame.intersection(line).isNull || $0.frame.intersection(line).isEmpty },
                        "Do not drag through a visible actionable control or input.")
            let frame = list.frame
            let from = list.coordinate(withNormalizedOffset: .zero).withOffset(CGVector(dx: start.x - frame.minX, dy: start.y - frame.minY))
            let to = list.coordinate(withNormalizedOffset: .zero).withOffset(CGVector(dx: end.x - frame.minX, dy: end.y - frame.minY))
            from.press(forDuration: 0.05, thenDragTo: to, withVelocity: 180, thenHoldForDuration: 0)
            try record("after", step: step)
        }
        try require(false, "The exact Feedback element must fit the real viewport after at most eight normal x12 gutter drags.")
        return target
    }
    private func input(_ id: String) -> XCUIElement {
        app.textFields[id]
    }
    private func textValue(_ input: XCUIElement) -> String {
        let value = input.value as? String ?? ""; return value == input.placeholderValue ? "" : value
    }
    private func writeEmpty(_ id: String, _ text: String) throws {
        let field = input(id); try reveal(field); try tap(field)
        try require(textValue(field).isEmpty, "Never overwrite an unexpected existing draft.")
        if ProcessInfo.processInfo.environment["SIDESEAT_ME_SAFETY_TEXT_SIZE"] == "maximum" && id == "feedback-comment-field" {
            try require(app.state == .runningForeground && !app.textFields["login-identifier"].exists
                        && !app.secureTextFields["login-password"].exists && field.exists && field.isEnabled && field.isHittable,
                        "Capture only the normally revealed owned comment TextField, never authentication inputs.")
            let ax = XCTAttachment(string: field.debugDescription)
            ax.name = "feedback-comment-TextField-visible-before-input-AX"; ax.lifetime = .keepAlways; add(ax)
            try capture("feedback-comment-TextField-visible-before-input")
        }
        field.typeText(text); try require(textValue(field) == text, "The exact intended owned content must be entered.")
    }
    private var scroll: XCUIElement {
        if app.collectionViews.firstMatch.exists { return app.collectionViews.firstMatch }
        if app.tables.firstMatch.exists { return app.tables.firstMatch }; return app.scrollViews.firstMatch
    }
    private func reveal(_ target: XCUIElement) throws {
        for _ in 0..<12 {
            if target.exists && target.isHittable && app.windows.firstMatch.frame.contains(target.frame) { return }
            if scroll.exists { scroll.swipeUp(velocity: .slow) } else { break }
        }
        for _ in 0..<12 {
            if target.exists && target.isHittable && app.windows.firstMatch.frame.contains(target.frame) { return }
            if scroll.exists { scroll.swipeDown(velocity: .slow) } else { break }
        }
        try require(target.exists && target.isHittable, "Reach the intended current Me control.")
    }
    private func tap(_ item: XCUIElement) throws {
        try require(item.waitForExistence(timeout: 15) && item.isEnabled && item.isHittable, "Use only the actual visible enabled control."); item.tap()
    }
    private func waitUntil(timeout: TimeInterval = 30, _ condition: () -> Bool) -> Bool {
        let end = Date().addingTimeInterval(timeout)
        repeat { if condition() { return true }; RunLoop.current.run(until: Date().addingTimeInterval(0.2)) } while Date() < end
        return condition()
    }
    private func phase(_ name: String) throws {
        print("ME_SAFETY_PHASE \(name)"); fflush(stdout); try FiveRootQAReadBarrier.wait(for: name)
    }
    private func capture(_ name: String) throws {
        try require(app.state == .runningForeground && !app.textFields["login-identifier"].exists
                    && !app.secureTextFields["login-password"].exists, "Never capture authentication inputs.")
        let image = XCTAttachment(screenshot: app.screenshot()); image.name = "me-safety-" + name; image.lifetime = .keepAlways; add(image)
    }
    private func require(_ condition: Bool, _ message: String) throws {
        guard condition else {
            if let app, app.state == .runningForeground && !app.textFields["login-identifier"].exists && !app.secureTextFields["login-password"].exists {
                let tree = XCTAttachment(string: app.debugDescription); tree.name = "me-safety-private-failure-AX"; tree.lifetime = .keepAlways; add(tree)
                let image = XCTAttachment(screenshot: app.screenshot()); image.name = "me-safety-private-failure"; image.lifetime = .keepAlways; add(image)
            }
            XCTFail(message); throw NSError(domain: "FiveRootMeSafety", code: 1, userInfo: [NSLocalizedDescriptionKey: message])
        }
    }
}
