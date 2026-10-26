import XCTest
import Darwin

/// Current activity proposals on owned physical-phone accounts. Every business write is App UI.
@MainActor final class FiveRootPlanActivityPhoneUITests: XCTestCase {
    private struct Account: Decodable {
        let role: String; let id: String; let identifier: String; let password: String; let displayName: String
    }
    private struct Connection: Decodable { let peerRole: String; let connectionID: String }
    private struct Fixture: Decodable {
        let kind: String; let schemaVersion: Int; let runID: String; let baseURL: String
        let edgePrefix: String; let bundle: String; let accounts: [Account]; let connections: [Connection]
    }
    private var fixture: Fixture!
    private var app: XCUIApplication!
    private var activityToken: String!
    private var title: String { fixture.edgePrefix + " 双人活动" }
    private var ownerIdea: String { fixture.edgePrefix + " 图书馆复习" }
    private var peerIdea: String { fixture.edgePrefix + " 咖啡休息" }
    private var location: String { fixture.edgePrefix + " 校园" }

    override func setUpWithError() throws { continueAfterFailure = false }
    override func tearDown() async throws { await MainActor.run { app?.terminate() } }

    private func loadFixture() throws {
        try require(ProcessInfo.processInfo.environment["SIMULATOR_UDID"] == nil, "Use the default physical iPhone 14 Plus.")
        let raw = ProcessInfo.processInfo.environment["SIDESEAT_PLAN_SIX_JSON"] ?? ""
        try XCTSkipUnless(!raw.isEmpty, "Provide this stage's private six-account fixture.")
        let data = raw.hasPrefix("{") ? Data(raw.utf8) : try Data(contentsOf: URL(fileURLWithPath: raw))
        fixture = try JSONDecoder().decode(Fixture.self, from: data)
        try require(fixture.kind == "five-roots-plans-live" && fixture.schemaVersion == 1, "Use only the owned five-root plan fixture.")
        try require(fixture.baseURL == "https://api.sideseat.de" && fixture.bundle == "app.sideseat.mobile.preview", "Use the real production API in the explicit Preview bundle.")
        try require(fixture.runID.range(of: "^[a-f0-9]{8}$", options: .regularExpression) != nil, "The fixture run identity must be valid.")
        try require(Set(fixture.accounts.map(\.role)) == Set(["owner", "peer1", "peer2", "peer3", "peer4", "peer5"])
            && Set(fixture.accounts.map(\.id)).count == 6, "Use six distinct disposable registered accounts.")
        try require(!fixture.edgePrefix.isEmpty && fixture.connections.contains { $0.peerRole == "peer1" }, "The case needs its cleanup prefix and owned accepted contact.")
    }

    func testActivityProposalsVotesDirectInvitationAndBothCalendars() throws {
        try loadFixture()
        try login("owner")
        try openPlans(confirmed: false)
        let create = app.buttons.matching(NSPredicate(format: "identifier IN %@", ["plans-create-primary", "plans-create-unified"])).firstMatch
        try reveal(create, in: app.scrollViews["plans-scroll-waitingResponse"])
        try tap(create)
        let form = app.collectionViews["plan-create-information"]
        let name = element("time-poll-title"), place = app.textFields["unified-plan-location"]
        try require(name.waitForExistence(timeout: 10), "The current creation form must open.")
        try reveal(name, in: form); try tap(name, minimumHeight: nil); name.typeText(title + "\n")
        try reveal(place, in: form); try tap(place, minimumHeight: nil); place.typeText(location + "\n")
        let proposals = app.buttons["plan-start-together"]
        try reveal(proposals, in: form); try tap(proposals)
        try require(proposals.isSelected, "The visible activity-proposal option must be enabled.")
        try tap(app.buttons["time-poll-create-confirm"])
        try verifyTitle(title)
        try require(app.buttons["time-poll-cell-0"].exists && app.buttons["plan-activity-suggest"].exists,
            "Activity proposals must coexist with the directly fillable timetable.")
        try capture("01-created-with-activity-proposals")
        phase("created")
        try recordCreatedPlanIdentity()
        let ownerIdeaID = try suggest(ownerIdea)
        try vote(ownerIdeaID)
        try capture("02-owner-proposed-and-voted")
        phase("owner-proposed")
        try selectAvailability()
        try tap(app.buttons["time-poll-submit"])
        try require(app.buttons["plan-invite-contacts"].waitForExistence(timeout: 25), "The first owner submission must open the existing share sheet.")
        phase("owner-submitted")
        try tap(app.buttons["plan-invite-contacts"])
        let contact = app.buttons["plan-contact-\(try account("peer1").id)"]
        try reveal(contact, in: app.scrollViews.firstMatch); try tap(contact)
        let sendCard = app.buttons["plan-contact-send"]
        try tap(sendCard)
        try require(sendCard.waitForNonExistence(timeout: 25), "The App contact must receive the real plan card.")
        let done = app.navigationBars.buttons.matching(NSPredicate(format: "label IN %@", ["完成", "Done"])).firstMatch
        try tap(done, minimumHeight: 35.99)
        try verifyTitle(title)
        try require(app.buttons["time-poll-cell-0"].isSelected && app.buttons["time-poll-cell-2"].isSelected,
            "Sharing must preserve the owner's submitted availability.")
        try capture("03-shared-with-owned-App-friend")
        phase("app-shared")

        try login("peer1")
        try openChatCard()
        try require(!app.buttons["time-poll-cell-0"].isSelected && !app.buttons["time-poll-cell-2"].isSelected,
            "The friend must not inherit the owner's availability.")
        let peerIdeaID = try suggest(peerIdea)
        try require(peerIdeaID != ownerIdeaID, "The two real suggestions must have different stable idea identities.")
        try vote(ownerIdeaID); try vote(peerIdeaID)
        try capture("04-peer-proposed-and-voted-on-both")
        phase("peer-proposed-and-voted")
        try selectAvailability()
        try tap(app.buttons["time-poll-submit"])
        try require(element("time-poll-saved").waitForExistence(timeout: 25), "The friend's availability must be explicitly submitted.")
        try require(app.buttons["plan-people-open"].label.contains("2 人已填写"), "Both submitted responses must remain in the same timetable.")
        phase("peer-submitted")

        try login("owner"); try openListCard(confirmed: false)
        try require(app.buttons["time-poll-cell-0"].isSelected && app.buttons["time-poll-cell-2"].isSelected,
            "The owner's submitted time must survive other people's proposals and votes.")
        try openIdeas()
        let existingVote = app.buttons["plan-activity-interest-\(ownerIdeaID)"]
        try require(existingVote.label == "已感兴趣", "The owner's first vote must persist across real login.")
        try vote(peerIdeaID)
        for idea in [ownerIdeaID, peerIdeaID] {
            try require(app.buttons["plan-activity-interest-\(idea)"].value as? String == "2 人感兴趣", "Each idea must retain both people's independent votes.")
        }
        let choice = app.buttons["unified-plan-activity-\(peerIdeaID)"]
        try reveal(choice, in: detail); try tap(choice)
        try require(choice.value as? String == "已选择", "The owner must choose the final activity on the current proposal board.")
        try verifyTitle(title)
        for id in [0, 2] {
            let cell = app.buttons["time-poll-cell-\(id)"]
            try reveal(cell, in: detail)
            try require(cell.isSelected, "Activity selection must preserve the original submitted availability.")
        }
        try capture("05-activity-choice-keeps-submitted-timetable")
        phase("owner-voted-and-selected")
        try tap(app.buttons["unified-plan-invite-window"])
        for id in [0, 2] {
            let cell = app.buttons["time-poll-cell-\(id)"]
            try revealFinal(cell)
            if !cell.isSelected { try tap(cell) }
            try require(cell.isSelected, "The final 09:00–10:00 range must use actual timetable cells.")
        }
        let summary = element("time-poll-final-summary")
        try require(summary.label.contains("09:00") && summary.label.contains("10:00"), "The final range must be the same selected hour.")
        try require(!app.buttons["unified-plan-review-roster"].exists && !element("unified-plan-invitation-editor").exists,
            "The final activity and time must send directly without a required roster step.")
        try tap(app.buttons["unified-plan-send-invitations"])
        try require(app.buttons["unified-plan-publish"].waitForExistence(timeout: 30), "The real direct-send chain must finish.")
        try verifyTitle(peerIdea)
        try require(app.descendants(matching: .any).matching(NSPredicate(format: "identifier BEGINSWITH 'unified-plan-person-'" )).count == 2,
            "Only the two submitted registered participants belong to this invitation.")
        try capture("06-chosen-activity-invited-directly")
        phase("invited")

        try login("peer1"); try openListCard(confirmed: false)
        try verifyTitle(peerIdea)
        try tap(app.buttons["unified-plan-accept"])
        try require(element("unified-plan-accepted-status").waitForExistence(timeout: 25), "The friend must explicitly accept the chosen activity and hour.")
        try require(!app.buttons["plan-view-calendar"].exists, "Acceptance must still wait for the owner's final publication.")
        try capture("07-peer-accepted-chosen-activity")
        phase("peer-accepted")
        try login("owner"); try openListCard(confirmed: false)
        try tap(app.buttons["unified-plan-publish"])
        try require(element("unified-plan-publish-prompt").waitForExistence(timeout: 10), "Final publication must retain its existing confirmation.")
        try tap(app.buttons["unified-plan-publish-confirm"])
        try require(app.buttons["plan-view-calendar"].waitForExistence(timeout: 30), "The chosen activity must publish successfully.")
        try capture("08-owner-published-selected-activity")
        phase("published")
        try verifyCalendar(otherRole: "peer1", tag: "owner")
        phase("owner-calendar-verified")
        try login("peer1"); try openListCard(confirmed: true)
        try verifyCalendar(otherRole: "owner", tag: "peer")
        phase("peer-calendar-verified")

        try login("owner"); try openListCard(confirmed: true)
        try tap(app.buttons["time-poll-menu"], minimumHeight: 35.99)
        try tap(app.buttons["unified-plan-cancel"], minimumHeight: nil)
        try require(element("time-poll-cancel-prompt").waitForExistence(timeout: 10), "Cancel only this new activity plan through its real confirmation.")
        try tap(app.buttons["time-poll-cancel-confirm"])
        try require(waitUntil { self.element("unified-plan-phase").label.contains("取消") }, "The activity plan must become cancelled.")
        try require(!app.buttons["plan-view-calendar"].exists, "A cancelled activity must not keep its Calendar action.")
        try capture("11-owner-cancelled-selected-activity")
        phase("cancelled")
        try login("owner"); try verifyCalendarAbsent(tag: "owner")
        try login("peer1"); try verifyCalendarAbsent(tag: "peer")
        phase("calendar-cleared")
    }

    private var detail: XCUIElement { app.scrollViews["time-poll-detail-scroll"] }
    private var finalScroll: XCUIElement { app.scrollViews["time-poll-final-scroll"] }
    private func element(_ id: String) -> XCUIElement { app.descendants(matching: .any).matching(identifier: id).firstMatch }
    private func account(_ role: String) throws -> Account { try XCTUnwrap(fixture.accounts.first { $0.role == role }) }
    private func login(_ role: String) throws {
        app?.terminate(); app = XCUIApplication(bundleIdentifier: fixture.bundle)
        app.launchArguments = ["--ui-testing-signed-out", "--ui-testing-ephemeral-credentials", "--ui-testing-skip-tutorial",
            "--ui-testing-language=zh-Hans", "--ui-testing-appearance=light", "-UIPreferredContentSizeCategoryName", "UICTContentSizeCategoryL"]
        app.launchEnvironment = [:]; app.launch()
        let user = try account(role), identifier = app.textFields["login-identifier"]
        try require(identifier.waitForExistence(timeout: 25), "The owned role must use the real login form.")
        identifier.tap(); identifier.typeText(user.identifier)
        let password = app.secureTextFields["login-password"]
        try require(password.exists, "The actual password field must exist.")
        password.tap(); password.typeText(user.password); app.buttons["login-submit"].tap()
        try require(app.tabBars.firstMatch.waitForExistence(timeout: 35), "The owned role must reach the real App shell.")
    }
    private func openPlans(confirmed: Bool) throws {
        try tap(app.tabBars.buttons["计划"])
        try tap(app.buttons[confirmed ? "plans-tab-upcoming" : "plans-tab-waitingResponse"])
    }
    private func openListCard(confirmed: Bool) throws {
        try openPlans(confirmed: confirmed)
        try require(activityToken != nil, "Capture this newly created plan's stable identity before reopening it.")
        let card = app.buttons["plans-coordinated-\(activityToken!)"]
        try require(card.waitForExistence(timeout: 25), "Only this case's exact newly created plan may open.")
        try reveal(card, in: app.scrollViews[confirmed ? "plans-scroll-upcoming" : "plans-scroll-waitingResponse"])
        try tap(card); try require(element("time-poll-detail-title").waitForExistence(timeout: 25), "The owned activity plan must open.")
    }
    private func openChatCard() throws {
        try tap(app.tabBars.buttons["消息"])
        let connection = try XCTUnwrap(fixture.connections.first { $0.peerRole == "peer1" })
        try tap(app.buttons["inbox-row-\(connection.connectionID)"])
        try require(activityToken != nil, "Use the new plan token rather than an older same-name chat card.")
        let card = app.buttons["shared-plan-card-\(activityToken!)"]
        try require(card.staticTexts[title].waitForExistence(timeout: 25), "The exact new chat card must load this plan's activity title.")
        try reveal(card, in: app.scrollViews["chat-message-list"]); try tap(card)
        try verifyTitle(title)
    }
    private func recordCreatedPlanIdentity() throws {
        try tap(app.navigationBars.buttons.element(boundBy: 0), minimumHeight: 35.99)
        let cards = app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH 'plans-coordinated-' AND label CONTAINS %@", title))
        try require(cards.firstMatch.waitForExistence(timeout: 25) && cards.count == 1,
            "Exactly one live owned plan with this new title must exist in Plans.")
        activityToken = String(cards.firstMatch.identifier.dropFirst("plans-coordinated-".count))
        try require(activityToken.range(of: "^[A-Za-z0-9_-]{32}$", options: .regularExpression) != nil,
            "Read the new plan identity from its actual native card.")
        try reveal(cards.firstMatch, in: app.scrollViews["plans-scroll-waitingResponse"])
        try tap(cards.firstMatch); try verifyTitle(title)
    }
    private func verifyTitle(_ expected: String) throws {
        let heading = element("time-poll-detail-title")
        try require(heading.waitForExistence(timeout: 25) && heading.label == expected, "The visible title must identify this owned activity plan.")
    }
    private func suggest(_ value: String) throws -> String {
        try openIdeas()
        let before = ideaIDs
        let add = app.buttons["plan-activity-suggest"]
        try reveal(add, in: detail); try tap(add)
        let input = element("plan-activity-title")
        try reveal(input, in: detail); try tap(input, minimumHeight: nil); input.typeText(value + "\n")
        try require((input.value as? String)?.trimmingCharacters(in: .whitespacesAndNewlines) == value,
            "The suggestion form must contain this case's exact new activity name.")
        try reveal(app.buttons["plan-activity-add"], in: detail); try tap(app.buttons["plan-activity-add"])
        try require(input.waitForNonExistence(timeout: 25), "A real suggestion must finish before voting.")
        try openIdeas()
        let added = ideaIDs.subtracting(before)
        try require(added.count == 1 && ideaIDs.count == before.count + 1,
            "One confirmed proposal must add exactly one new stable idea ID.")
        try require(element("plan-activity-board").descendants(matching: .any)
            .matching(NSPredicate(format: "label BEGINSWITH %@", value)).firstMatch.exists,
            "The actual proposal board must display the exact new activity name.")
        return try XCTUnwrap(added.first)
    }
    private func openIdeas() throws {
        let expand = app.buttons["plan-activity-open-ideas"]
        try reveal(expand, in: detail)
        if !(expand.value as? String ?? "").contains("Expanded") { try tap(expand) }
        try require(element("plan-activity-board").exists, "The current activity proposal board must be expanded.")
    }
    private var ideaIDs: Set<String> {
        Set(app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH 'plan-activity-interest-'"))
            .allElementsBoundByIndex.map { String($0.identifier.dropFirst("plan-activity-interest-".count)) })
    }
    private func vote(_ id: String) throws {
        let button = app.buttons["plan-activity-interest-\(id)"]
        try reveal(button, in: detail)
        try require(waitUntil { button.isEnabled }, "Voting must wait for the previous real mutation.")
        try require(button.label == "我感兴趣", "This fresh independent vote must not remove an existing vote.")
        try tap(button)
        try require(waitUntil { button.label == "已感兴趣" && button.isEnabled }, "The real interest vote must persist.")
    }
    private func selectAvailability() throws {
        for id in [0, 2] {
            let cell = app.buttons["time-poll-cell-\(id)"]
            try reveal(cell, in: detail)
            try require(!cell.isSelected, "A new response must start with the role's own empty selection.")
            try tap(cell); try require(cell.isSelected, "The role must directly choose its own available half-hour.")
        }
    }
    private var finalDockTop: CGFloat {
        ["time-poll-final-summary", "time-poll-final-gap", "time-poll-final-heading", "unified-plan-invitation-summary", "unified-plan-send-invitations"]
            .compactMap { id -> CGFloat? in let item = element(id); return item.exists && !item.frame.isEmpty ? item.frame.minY : nil }.min()
            ?? app.windows.firstMatch.frame.maxY
    }
    private var finalClip: CGRect {
        let window = app.windows.firstMatch.frame
        let top = max(finalScroll.frame.minY, app.navigationBars.firstMatch.frame.maxY + 2)
        return finalScroll.frame.intersection(detail.frame).intersection(window)
            .intersection(CGRect(x: window.minX, y: top, width: window.width, height: max(0, finalDockTop - 12 - top)))
    }
    private func revealFinal(_ cell: XCUIElement) throws {
        try require(finalScroll.waitForExistence(timeout: 10), "The final timetable must exist.")
        for _ in 0..<12 {
            let clip = finalClip
            if !clip.isNull && cell.isHittable && clip.insetBy(dx: -0.5, dy: -0.5).contains(cell.frame) { return }
            if clip.isNull || clip.height < cell.frame.height * 2 {
                let origin = app.coordinate(withNormalizedOffset: .zero), top = app.navigationBars.firstMatch.frame.maxY + 20
                let lower = min(finalDockTop - 24, top + 150), down = finalScroll.frame.minY < top
                origin.withOffset(CGVector(dx: 8, dy: down ? top : lower)).press(forDuration: 0.05,
                    thenDragTo: origin.withOffset(CGVector(dx: 8, dy: down ? lower : top)), withVelocity: .slow, thenHoldForDuration: 0.1)
            } else {
                let down = cell.frame.minY < clip.minY
                let gap = down ? clip.minY - cell.frame.minY : cell.frame.maxY - clip.maxY
                let distance = min(CGFloat(180), max(CGFloat(48), gap))
                let startY = clip.midY
                let endY = min(clip.maxY - 24, max(clip.minY + 24, startY + (down ? distance : -distance)))
                let origin = app.coordinate(withNormalizedOffset: .zero), x = clip.minX + 24
                origin.withOffset(CGVector(dx: x, dy: startY)).press(forDuration: 0.05,
                    thenDragTo: origin.withOffset(CGVector(dx: x, dy: endY)), withVelocity: .slow, thenHoldForDuration: 0.1)
            }
        }
        try require(false, "The complete final cell must be reachable above the actual fixed footer.")
    }
    private func verifyCalendar(otherRole: String, tag: String) throws {
        try tap(app.buttons["plan-view-calendar"])
        try require(app.tabBars.buttons["日历"].isSelected, "The confirmed plan must open Calendar.")
        let result = try searchCalendar()
        try require(result.waitForExistence(timeout: 25), "Calendar must contain the chosen activity.")
        try require(app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH 'calendar-search-result-' AND label CONTAINS %@", peerIdea)).count == 1,
            "Only one Calendar event may represent the chosen activity.")
        try tap(result)
        try require(element("calendar-readonly-detail").waitForExistence(timeout: 15), "Open the original read-only event detail.")
        let list = app.collectionViews.firstMatch.exists ? app.collectionViews.firstMatch : app.tables.firstMatch
        for (id, clock) in [("calendar-detail-start", "09:00"), ("calendar-detail-end", "10:00"), ("calendar-detail-location", location)] {
            let row = element(id); try reveal(row, in: list)
            try require(row.label.contains(clock), "Calendar must retain the selected activity's time and original place.")
        }
        let companion = app.staticTexts[try account(otherRole).displayName]
        try reveal(companion, in: list)
        try capture("09-calendar-\(tag)-chosen-activity-and-companion")
    }
    private func searchCalendar() throws -> XCUIElement {
        try tap(app.buttons["calendar-search"], minimumHeight: 35.99)
        let query = app.searchFields.firstMatch
        try require(query.waitForExistence(timeout: 10), "Calendar search must open.")
        query.tap(); query.typeText(peerIdea)
        return app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH 'calendar-search-result-' AND label CONTAINS %@", peerIdea)).firstMatch
    }
    private func verifyCalendarAbsent(tag: String) throws {
        try tap(app.tabBars.buttons["日历"])
        let result = try searchCalendar()
        try require(element("calendar-search-empty").waitForExistence(timeout: 25) && result.waitForNonExistence(timeout: 10),
            "Cancelling this activity must remove its corresponding Calendar event.")
        try capture("12-calendar-\(tag)-cleared-after-cancel")
    }
    private func reveal(_ target: XCUIElement, in scroll: XCUIElement) throws {
        try require(scroll.waitForExistence(timeout: 10), "The intended current scroll surface must exist.")
        for _ in 0..<10 where !target.exists { scroll.swipeUp(velocity: .slow) }
        try require(target.exists, "The exact owned control must exist.")
        for _ in 0..<24 {
            let window = app.windows.firstMatch.frame
            let footer = ["time-poll-create-confirm", "time-poll-submit", "unified-plan-invite-window", "unified-plan-send-invitations", "unified-plan-publish", "unified-plan-accept", "plan-view-calendar"]
                .compactMap { id -> CGFloat? in let item = app.buttons[id]; return item.exists && !item.frame.isEmpty ? item.frame.minY : nil }.min()
            let top = max(scroll.frame.minY, app.navigationBars.firstMatch.frame.maxY + 2)
            let bottom = element("calendar-readonly-detail").exists ? window.maxY : min(scroll.frame.maxY, footer.map { $0 - 8 } ?? window.maxY)
            let clip = scroll.frame.intersection(CGRect(x: window.minX, y: top, width: window.width, height: max(0, bottom - top)))
            if target.isHittable && clip.insetBy(dx: -0.5, dy: -0.5).contains(target.frame) { return }
            let distance = min(CGFloat(180), max(CGFloat(48), target.frame.minY < top ? top - target.frame.minY : target.frame.maxY - bottom))
            let y = min(bottom - 24, max(top + 24, (top + bottom) / 2)), origin = app.coordinate(withNormalizedOffset: .zero)
            origin.withOffset(CGVector(dx: 24, dy: y)).press(forDuration: 0.05,
                thenDragTo: origin.withOffset(CGVector(dx: 24, dy: y + (target.frame.minY < top ? distance : -distance))))
        }
        try require(false, "The whole requested control must be reachable inside the visible page.")
    }
    private func tap(_ control: XCUIElement, minimumHeight: CGFloat? = 43.99) throws {
        try require(control.waitForExistence(timeout: 20) && control.isHittable && control.isEnabled, "The intended actual UI action must be reachable and enabled.")
        try require(app.windows.firstMatch.frame.insetBy(dx: -0.5, dy: -0.5).contains(control.frame), "The complete action must fit in the current window.")
        if let minimumHeight { try require(control.frame.height >= minimumHeight, "Standalone actions keep their 44-point touch target.") }
        control.coordinate(withNormalizedOffset: CGVector(dx: 0.2, dy: 0.5)).tap()
    }
    private func waitUntil(timeout: TimeInterval = 25, _ condition: () -> Bool) -> Bool {
        let deadline = Date().addingTimeInterval(timeout)
        repeat {
            if condition() { return true }
            RunLoop.current.run(until: Date().addingTimeInterval(0.2))
        } while Date() < deadline
        return condition()
    }
    private func require(_ condition: Bool, _ message: String) throws {
        guard condition else {
            if let app, app.state == .runningForeground, !app.textFields["login-identifier"].exists,
               !app.secureTextFields.firstMatch.exists, !app.buttons["plan-invite-contacts"].exists {
                let tree = XCTAttachment(string: app.debugDescription)
                tree.name = "activity-failure-private-AX"; tree.lifetime = .keepAlways; add(tree)
                let screenshot = XCTAttachment(screenshot: app.screenshot())
                screenshot.name = "activity-failure-private-screen"; screenshot.lifetime = .keepAlways; add(screenshot)
            }
            XCTFail(message)
            throw NSError(domain: "FiveRootPlanActivityPhone", code: 1, userInfo: [NSLocalizedDescriptionKey: message])
        }
    }
    private func phase(_ value: String) {
        print("PLAN_ACTIVITY_PHASE \(value)"); fflush(stdout)
        RunLoop.current.run(until: Date().addingTimeInterval(3))
    }
    private func capture(_ name: String) throws {
        try require(!app.secureTextFields["login-password"].exists, "Never capture credentials.")
        let attachment = XCTAttachment(screenshot: app.screenshot())
        attachment.name = "five-root-plan-activity-" + name; attachment.lifetime = .keepAlways; add(attachment)
    }
}
