import Foundation
import Testing
@testable import SideSeat

@Suite("Native time polls")
struct TimePollTests {
    @Test("Pending invitees reserve link places; declining frees a place without counting shared or declined rows")
    func invitationCapacityAndReplyEligibility() throws {
        let now = try #require(ISO8601DateFormatter().date(from: "2030-10-16T06:00:00Z"))
        func poll(phase: String, mine: String? = nil, selected: Bool = false,
                  reserved: Bool = true, owner: Bool = false, mode: String = "FIXED") throws -> NativeTimePoll {
            var object = try JSONSerialization.jsonObject(with: collectingPollData()) as! [String: Any]
            object["phase"] = phase; object["planningMode"] = mode; object["expectedCount"] = 2; object["isOwner"] = owner
            object["chosenStart"] = "2030-10-16T07:00:00Z"; object["chosenEnd"] = "2030-10-16T08:00:00Z"
            var invitations: [[String: Any]] = [["id": "owner", "displayName": "Owner", "status": "ACCEPTED", "selected": true, "isMe": owner]]
            if reserved { invitations.append(["id": "peer", "displayName": "Peer", "status": "INVITED", "selected": true, "isMe": false]) }
            if let mine { invitations.append(["id": "viewer", "displayName": "Viewer", "status": mine, "selected": selected, "isMe": true]) }
            object["invitations"] = invitations
            let decoder = JSONDecoder(); decoder.dateDecodingStrategy = .iso8601
            return try decoder.decode(NativeTimePoll.self, from: JSONSerialization.data(withJSONObject: object))
        }
        for phase in ["INVITING", "CONFIRMED"] {
            let full = try poll(phase: phase)
            #expect(full.occupiedCount == 2 && full.remainingCount == 0)
            #expect(full.allInvitations.filter { $0.selected && $0.status == "ACCEPTED" }.count == 1)
            #expect(!full.canReplyToInvitation(at: now))
            #expect(full.presentation(at: now).nextStep == .notIncluded)
            for status: String? in [nil, "SHARED", "DECLINED"] {
                let free = try poll(phase: phase, mine: status, reserved: false)
                #expect(free.occupiedCount == 1 && free.remainingCount == 1)
                #expect(free.canReplyToInvitation(at: now))
                #expect(free.presentation(at: now).nextStep == .confirm)
                let refilled = try poll(phase: phase, mine: status)
                #expect(!refilled.canReplyToInvitation(at: now))
                #expect(refilled.presentation(at: now).detail == AppLocalization.string("This plan is full. Contact the organizer."))
            }
            for status in ["INVITED", "ACCEPTED"] {
                let invited = try poll(phase: phase, mine: status, selected: true, reserved: false)
                #expect(invited.remainingCount == 0 && invited.canReplyToInvitation(at: now))
            }
            #expect(try !poll(phase: phase, owner: true).canReplyToInvitation(at: now))
            #expect(try !poll(phase: phase, mine: "SHARED", reserved: false, mode: "COLLECT").canReplyToInvitation(at: now))
        }
        for phase in ["CANCELLED", "EXPIRED", "COLLECTING"] {
            #expect(try !poll(phase: phase, mine: "INVITED", selected: true, reserved: false).canReplyToInvitation(at: now))
        }
        #expect(try !poll(phase: "CONFIRMED", reserved: false).canReplyToInvitation(at: now.addingTimeInterval(3600)))
    }

    @Test("Picker and default components share one day identity and can be removed")
    func candidateDateIdentity() throws {
        var calendar = Calendar(identifier: .gregorian)
        calendar.locale = Locale(identifier: "zh-Hans"); calendar.timeZone = TimeZone(identifier: "Europe/Berlin")!
        calendar.firstWeekday = 1; calendar.minimumDaysInFirstWeek = 5
        let date = try #require(calendar.date(from: DateComponents(year: 2026, month: 10, day: 24)))
        let oldDefault = calendar.dateComponents([.era, .year, .month, .day], from: date)
        let picker = calendar.dateComponents([.calendar, .era, .year, .month, .day], from: date)
        #expect(Set([oldDefault, picker]).count == 2, "The two representations caused the reported duplicate-key crash")
        let normalized = TimePollTimetable.normalizedDates([oldDefault, picker], calendar: calendar)
        #expect(normalized == [picker])
        #expect(normalized.subtracting([picker]).isEmpty, "The first tap must really remove a default date")
    }

    @Test("Duplicate candidate day keys build one unique timeline including DST")
    func duplicateCandidateDays() {
        let dates = ["2026-10-25", "2026-10-24", "2026-10-25"]
        let slots = TimePollTimetable.slots(dates: dates, timeZone: "Europe/Berlin", startMinute: 540, endMinute: 1020)
        #expect(slots.count == 64 && Set(slots.map(\.start)).count == slots.count)
        let table = TimePollTimetable(dates: dates, timeZone: "Europe/Berlin", startMinute: 540, slots: slots)
        #expect(table.dates == ["2026-10-24", "2026-10-25"])
        #expect(table.finalTimeSlots.count == 196)
        #expect(Set(table.finalTimeSlots.map(\.start)).count == 196)
        #expect(Set(table.finalTimeSlots.map(\.id)).count == 196)
    }

    @Test("Creation and server tables preserve the same availability IDs")
    func creationTimetable() {
        let dates = ["2026-10-24", "2026-10-25"]
        let slots = TimePollTimetable.slots(dates: dates, timeZone: "Europe/Berlin", startMinute: 540, endMinute: 1020)
        #expect(slots.count == 64)
        #expect(slots.map(\.id) == Array(0..<64))
        #expect(slots[0].label == "09:00" && slots[32].label == "09:00")
        let table = TimePollTimetable(dates: dates, timeZone: "Europe/Berlin", startMinute: 540, slots: slots)
        #expect(table.finalTimeSlots.count == 196, "DST fall-back day keeps all elapsed quarters")
        #expect(table.finalTimeSlots.filter { $0.id >= 0 }.map(\.id) == Array(0..<64))
        #expect(table.finalTimeSlots.first { $0.id == 32 }?.start == slots[32].start)
    }

    @Test("Final draft is private to the account and plan and consumes its navigation intent")
    func finalDraftPersistence() throws {
        let name = "plan-draft-test-" + UUID().uuidString
        let defaults = try #require(UserDefaults(suiteName: name))
        defer { defaults.removePersistentDomain(forName: name) }
        TimePollFinalDraft(selected: [-95, -96, 0, 1], choosingFinal: true, invitationVersion: 0, next: .review)
            .save(userID: "owner", token: "plan", defaults: defaults)
        var draft = try #require(TimePollFinalDraft.load(userID: "owner", token: "plan", defaults: defaults))
        #expect(draft.selected == [-95, -96, 0, 1] && draft.choosingFinal && draft.next == .review)
        #expect(TimePollFinalDraft.load(userID: "peer", token: "plan", defaults: defaults) == nil)
        #expect(TimePollFinalDraft.load(userID: "owner", token: "other", defaults: defaults) == nil)
        draft.next = nil; draft.save(userID: "owner", token: "plan", defaults: defaults)
        #expect(TimePollFinalDraft.load(userID: "owner", token: "plan", defaults: defaults)?.next == nil)
        #expect(TimePollFinalDraft.load(userID: "owner", token: "plan", defaults: defaults)?.selected == draft.selected)
    }

    @Test("Every submitted identity joins automatically, including empty availability and same-name guests")
    func automaticInvitationParticipants() throws {
        let responses: [[String: Any]] = [
            ["id": "owner", "displayName": "Owner", "slotIds": [], "isMe": true, "didRespond": true],
            ["id": "app", "displayName": "App friend", "slotIds": [0, 1], "isMe": false, "didRespond": true],
            ["id": "guest-one", "displayName": "Same name", "slotIds": [], "isMe": false, "isGuest": true, "didRespond": true],
            ["id": "guest-two", "displayName": "Same name", "slotIds": [2, 3], "isMe": false, "isGuest": true],
        ]
        let shared: [String: Any] = ["id": "shared", "displayName": "Not filled", "slotIds": [], "isMe": false, "didRespond": false]
        let poll = try invitationPoll(responses: responses, candidates: responses + [shared])
        #expect(poll.invitationParticipantIDs(adding: []) == ["owner", "app", "guest-one", "guest-two"])
        #expect(!poll.invitationParticipantIDs(adding: []).contains("shared"))
    }

    @Test("Explicit extras intersect current candidates and never duplicate submitted identities")
    func explicitInvitationExtras() throws {
        let response: [String: Any] = ["id": "responded", "displayName": "Friend", "slotIds": [], "isMe": false]
        let shared: [String: Any] = ["id": "shared", "displayName": "Friend", "slotIds": [], "isMe": false, "didRespond": false]
        let poll = try invitationPoll(responses: [response], candidates: [response, shared])
        let extras = Set(["shared", "shared", "responded", "unknown-or-removed"])
        #expect(poll.invitationParticipantIDs(adding: extras) == ["responded", "shared"])
        let noResponses = try invitationPoll(responses: [], candidates: [shared])
        #expect(noResponses.invitationParticipantIDs(adding: []).isEmpty)
        #expect(noResponses.invitationParticipantIDs(adding: ["shared"]) == ["shared"])
    }

    @Test("A refreshed response joins without an old roster snapshot and removed extras stop joining")
    func refreshedInvitationParticipants() throws {
        let initial: [String: Any] = ["id": "initial", "displayName": "Initial", "slotIds": [0], "isMe": false]
        let newResponse: [String: Any] = ["id": "new-response", "displayName": "New", "slotIds": [], "isMe": false]
        let removed: [String: Any] = ["id": "removed", "displayName": "Removed", "slotIds": [], "isMe": false, "didRespond": false]
        let old = try invitationPoll(responses: [initial], candidates: [initial, removed])
        let refreshed = try invitationPoll(responses: [initial, newResponse], candidates: [initial])
        let extras: Set<String> = ["removed"]
        #expect(old.invitationParticipantIDs(adding: extras) == ["initial", "removed"])
        #expect(refreshed.invitationParticipantIDs(adding: extras) == ["initial", "new-response"])
    }

    @Test("Legacy final drafts retain their range while optional invitation edits round-trip per account")
    func invitationDraftCompatibility() throws {
        let suite = "invitation-draft-test-" + UUID().uuidString
        let defaults = try #require(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }
        let key = TimePollFinalDraft.key(userID: "owner", token: "plan")
        defaults.set(Data(#"{"selected":[0,1,2,3],"choosingFinal":true,"invitationVersion":0,"next":"review"}"#.utf8), forKey: key)
        var draft = try #require(TimePollFinalDraft.load(userID: "owner", token: "plan", defaults: defaults))
        #expect(draft.selected == [0, 1, 2, 3] && draft.choosingFinal && draft.next == .review)
        #expect(draft.extraInviteeIDs == nil && draft.activityID == nil && draft.linkParticipantCount == nil)
        // Old navigation data remains decodable; the current screen owns whether any action runs.
        draft.next = nil; draft.extraInviteeIDs = ["extra"]; draft.activityID = "idea"; draft.linkParticipantCount = 5
        draft.save(userID: "owner", token: "plan", defaults: defaults)
        let restored = try #require(TimePollFinalDraft.load(userID: "owner", token: "plan", defaults: defaults))
        #expect(restored.selected == draft.selected && restored.extraInviteeIDs == ["extra"])
        #expect(restored.activityID == "idea" && restored.linkParticipantCount == 5 && restored.next == nil)
        #expect(TimePollFinalDraft.load(userID: "other", token: "plan", defaults: defaults) == nil)
    }

    @Test("Paint and erase a rectangle without toggling revisited cells")
    func rectangles() {
        let slots = (0..<8).map { id in NativeTimePoll.Slot(id: id, date: id < 4 ? "2026-10-16" : "2026-10-17", row: String(id % 4), label: String(id % 4), start: Date(timeIntervalSince1970: Double(id * 900)), end: Date(timeIntervalSince1970: Double((id + 1) * 900))) }
        let cells = TimePollSelection.cells(slots)
        let dates = ["2026-10-16", "2026-10-17"], rows = ["0", "2"]
        #expect(cells.count == 4)
        let painted = TimePollSelection.rectangle(cells: cells, dates: dates, rows: rows, from: (0, 0), to: (1, 0), original: [3], selecting: true)
        #expect(painted == [0, 1, 3, 4, 5])
        let erased = TimePollSelection.rectangle(cells: cells, dates: dates, rows: rows, from: (1, 0), to: (0, 0), original: painted, selecting: false)
        #expect(erased == [3])
    }

    @Test("Partial legacy cells fill explicitly and heatmap counts only whole-cell attendees")
    func legacyHalfHours() {
        let slots = (0..<5).map { id in NativeTimePoll.Slot(id: id, date: "2026-10-16", row: String(id), label: String(id), start: Date(timeIntervalSince1970: Double(id * 900)), end: Date(timeIntervalSince1970: Double((id + 1) * 900))) }
        let cells = TimePollSelection.cells(slots)
        #expect(cells.count == 3)
        #expect(cells.flatMap { $0.slots.map(\.id) } == [0, 1, 2, 3, 4])
        #expect(cells[2].slotIds == [4])
        #expect(TimePollSelection.toggle(cells[0], original: [0, 3]) == [0, 1, 3])
        #expect(TimePollSelection.toggle(cells[0], original: [0, 1, 3]) == [3])
        #expect(cells[0].availableCount(in: [[0], [1], [0, 1]]) == 1)
        #expect(cells[0].availableCount(in: [[0], [1]]) == 0)
    }

    @Test("Invitation timetable focuses the actual time without depending on candidate slots")
    func invitationTimetable() {
        let start = ISO8601DateFormatter().date(from: "2030-10-20T20:00:00Z")!
        let rows = TimePollInvitationRow.rows(start: start, end: start.addingTimeInterval(3600), timeZone: "Europe/Berlin")
        #expect(rows.map(\.label) == ["21:30", "22:00", "22:30", "23:00"])
        #expect(rows.map(\.highlighted) == [false, true, true, false])
        #expect(rows.filter(\.highlighted).allSatisfy { $0.from == 0 && $0.through == 1 })
    }

    @Test("Invitation timetable keeps legacy quarter-hour edges exact")
    func invitationTimetablePartial() {
        let start = ISO8601DateFormatter().date(from: "2030-10-20T07:15:00Z")!
        let rows = TimePollInvitationRow.rows(start: start, end: start.addingTimeInterval(3600), timeZone: "Europe/Berlin")
        let selected = rows.filter(\.highlighted)
        #expect(selected.count == 3)
        #expect(selected.first?.label == "09:00")
        #expect(selected.first?.from == 0.5 && selected.first?.through == 1)
        #expect(selected.last?.label == "10:00")
        #expect(selected.last?.from == 0 && selected.last?.through == 0.5)
    }

    @Test("Invitation timetable separates midnight and repeated DST times")
    func invitationTimetableDates() {
        let formatter = ISO8601DateFormatter()
        let start = formatter.date(from: "2030-10-20T21:45:00Z")!
        let cross = TimePollInvitationRow.rows(start: start, end: start.addingTimeInterval(1800), timeZone: "Europe/Berlin")
        #expect(Set(cross.filter(\.highlighted).map(\.date)) == ["2030-10-20", "2030-10-21"])
        let fall = formatter.date(from: "2026-10-25T00:30:00Z")!
        let repeated = TimePollInvitationRow.rows(start: fall, end: fall.addingTimeInterval(7200), timeZone: "Europe/Berlin")
        #expect(repeated.filter(\.highlighted).count == 4)
        #expect(repeated.contains { $0.label == "02:30 +01:00" })
    }

    @Test("Final cells toggle without replacing earlier choices and gaps remain editable")
    func finalTimeToggles() throws {
        let poll = try collectingPoll(), cells = TimePollSelection.cells(poll.finalTimeSlots)
        let first = cells.first { $0.id == 0 }!, second = cells.first { $0.id == 2 }!, third = cells.first { $0.id == 4 }!
        let one = TimePollSelection.toggle(first, original: [])
        #expect(TimePollFinalRange.selected(one, slots: poll.finalTimeSlots)?.duration == 1800)
        let gap = TimePollSelection.toggle(third, original: one)
        #expect(gap.isSuperset(of: one))
        #expect(TimePollFinalRange.selected(gap, slots: poll.finalTimeSlots) == nil)
        let filled = TimePollSelection.toggle(second, original: gap)
        #expect(TimePollFinalRange.selected(filled, slots: poll.finalTimeSlots)?.duration == 5400)
        #expect(TimePollSelection.toggle(third, original: filled) == one.union(second.slotIds))
        #expect(poll.mySlotIds.isEmpty)
    }

    @Test("Final context retains old response IDs and marks uncollected hours separately")
    func finalTimeContext() throws {
        let poll = try collectingPoll(), expanded = poll.finalTimeSlots
        #expect(expanded.count == 96)
        for slot in poll.slots { #expect(expanded.first { $0.start == slot.start }?.id == slot.id) }
        #expect(expanded.filter { $0.id < 0 }.count == 84)
        #expect(Set(expanded.map(\.id)).count == expanded.count)
        #expect(TimePollFinalRange.selected([], slots: expanded) == nil)
    }

    @Test("Cross-midnight painting follows elapsed time in both directions and can erase")
    func finalTimeAcrossDays() throws {
        var object = try JSONSerialization.jsonObject(with: collectingPollData()) as! [String: Any]
        object["dates"] = ["2030-10-16", "2030-10-17"]
        let decoder = JSONDecoder(); decoder.dateDecodingStrategy = .iso8601
        let poll = try decoder.decode(NativeTimePoll.self, from: JSONSerialization.data(withJSONObject: object))
        let slots = poll.finalTimeSlots, cells = TimePollSelection.cells(slots)
        let from = cells.first { $0.date == "2030-10-16" && $0.label == "22:00" }!
        let to = cells.first { $0.date == "2030-10-17" && $0.label == "01:30" }!
        let ids = TimePollSelection.interval(cells: cells, from: from, to: to, original: [], selecting: true)
        let range = try #require(TimePollFinalRange.selected(ids, slots: slots))
        #expect(ids.count == 16 && range.duration == 4 * 3600)
        #expect(TimePollSelection.interval(cells: cells, from: to, to: from, original: [], selecting: true) == ids)
        #expect(TimePollSelection.interval(cells: cells, from: to, to: from, original: ids, selecting: false).isEmpty)
        #expect(TimePollFinalRange.validated(start: range.start, end: range.end, slots: poll.slots) == nil)
    }

    @Test("Whole-day generation preserves real DST boundaries without merging repeated hours")
    func finalTimeDaylightSaving() throws {
        var object = try JSONSerialization.jsonObject(with: collectingPollData()) as! [String: Any]
        let decoder = JSONDecoder(); decoder.dateDecodingStrategy = .iso8601
        object["dates"] = ["2026-10-24", "2026-10-25"]
        let fall = try decoder.decode(NativeTimePoll.self, from: JSONSerialization.data(withJSONObject: object)).finalTimeSlots
        #expect(fall.count == 196)
        #expect(fall.filter { $0.date == "2026-10-25" && $0.label.hasPrefix("02:00") }.count == 2)
        #expect(TimePollFinalRange.selected(Set(fall.map(\.id)), slots: fall)?.duration == 176400.0)
        object["dates"] = ["2026-03-29"]
        let spring = try decoder.decode(NativeTimePoll.self, from: JSONSerialization.data(withJSONObject: object)).finalTimeSlots
        #expect(spring.count == 92)
        #expect(TimePollFinalRange.selected(Set(spring.map(\.id)), slots: spring)?.duration == 82800.0)
    }

    @Test("Invite links use the Sideseat domain and route into the native feature")
    func links() {
        let token = String(repeating: "a", count: 32)
        #expect(TimePollLink.token(from: "https://www.sideseat.de/time-polls/\(token)") == token)
        #expect(TimePollLink.token(from: "https://www.when2meet.com/?12345-AbC") == nil)
        #expect(TimePollLink.token(from: "https://sideseat.de.attacker.test/time-polls/\(token)") == nil)
        #expect(DeepLinkRouter.route(for: URL(string: "sideseat://time-polls/\(token)")!) == .timePoll(token: token))
        #expect(MVPRoutePolicy.tab(for: .timePoll(token: token)) == .plans)
    }

    @Test("Heatmap counts submitted responses while drafts remain separate")
    func submittedTimetableCounts() throws {
        var object = try JSONSerialization.jsonObject(with: collectingPollData()) as! [String: Any]
        object["participants"] = [
            ["id": "me", "displayName": "Ming", "slotIds": [0, 1], "isMe": true],
            ["id": "friend", "displayName": "Lin", "slotIds": [0, 1, 2, 3], "isMe": false],
        ]
        let decoder = JSONDecoder(); decoder.dateDecodingStrategy = .iso8601
        let poll = try decoder.decode(NativeTimePoll.self, from: JSONSerialization.data(withJSONObject: object))
        #expect(poll.submittedTimetableSelections == [[0, 1], [0, 1, 2, 3]])
        #expect(try collectingPoll().submittedTimetableSelections.isEmpty)
    }

    @Test("Selections stay local until one explicit submission")
    @MainActor
    func manualSubmission() async throws {
        let transport = PollSaveTransport()
        let session = SessionStore(apiClient: APIClient(environment: .developmentFallback, transport: transport), credentialStore: EphemeralCredentialStore(), device: .current)
        session.installUITestingSession()
        let store = TimePollStore(token: "poll", poll: try collectingPoll(), draftDefaults: nil)
        for id in 0..<10 { store.selected.insert(id) }
        try await Task.sleep(for: .seconds(2))
        #expect(await transport.writes.isEmpty)
        #expect(store.hasChanges && !store.saved && !store.saving)
        let submit = Task { await store.submit(session: session) }
        await transport.waitUntilFirstStarted()
        await store.submit(session: session)
        #expect(await transport.writes == [Array(0..<10)])
        await transport.finishFirst(); await submit.value
        #expect(store.saved && !store.hasChanges)
        await store.submit(session: session)
        #expect(await transport.writes.count == 1)
    }

    @Test("Failed submission keeps newer edits and only explicit retry publishes them")
    @MainActor
    func manualRetry() async throws {
        let transport = PollSaveTransport(firstStatus: 503)
        let session = SessionStore(apiClient: APIClient(environment: .developmentFallback, transport: transport), credentialStore: EphemeralCredentialStore(), device: .current)
        session.installUITestingSession()
        let store = TimePollStore(token: "poll", poll: try collectingPoll(), draftDefaults: nil)
        store.selected = [0]
        let submit = Task { await store.submit(session: session) }
        await transport.waitUntilFirstStarted(); store.selected = [1, 2]
        await transport.finishFirst(); await submit.value
        try await Task.sleep(for: .seconds(1))
        #expect(store.selected == [1, 2] && store.hasChanges && store.error != nil)
        #expect(await transport.writes == [[0]])
        await store.retry(session: session)
        #expect(store.saved && store.error == nil)
        #expect(await transport.writes == [[0], [1, 2]])
    }

    @Test("Editing during submission never publishes or discards the newer draft")
    @MainActor
    func manualSubmissionSnapshot() async throws {
        let transport = PollSaveTransport()
        let session = SessionStore(apiClient: APIClient(environment: .developmentFallback, transport: transport), credentialStore: EphemeralCredentialStore(), device: .current)
        session.installUITestingSession()
        let store = TimePollStore(token: "poll", poll: try collectingPoll(), draftDefaults: nil)
        store.selected = [0]
        let submit = Task { await store.submit(session: session) }
        await transport.waitUntilFirstStarted(); store.selected = [1, 2]
        await transport.finishFirst(); await submit.value
        #expect(store.selected == [1, 2] && store.poll?.mySlotIds == [0] && !store.saved)
        try await Task.sleep(for: .seconds(1))
        #expect(await transport.writes == [[0]])
        await store.submit(session: session)
        #expect(store.saved && store.poll?.mySlotIds == [1, 2])
    }

    @Test("Acknowledgement from a previous account never changes the current view")
    @MainActor
    func manualSubmissionAccountScope() async throws {
        for status in [200, 401] {
            let transport = PollSaveTransport(firstStatus: status)
            let session = SessionStore(apiClient: APIClient(environment: .developmentFallback, transport: transport), credentialStore: EphemeralCredentialStore(), device: .current)
            session.installUITestingSession()
            let store = TimePollStore(token: "poll", poll: try collectingPoll(), draftDefaults: nil)
            store.selected = [0]
            let submit = Task { await store.submit(session: session) }
            await transport.waitUntilFirstStarted()
            await session.login(identifier: "other", password: "test")
            await transport.finishFirst(); await submit.value
            #expect(!store.saved && !store.saving && store.poll?.didRespond == false)
            #expect(await transport.writes == [[0]])
            #expect(await transport.refreshCount == 0)
        }
    }

    @Test("No free time is a valid explicit response")
    @MainActor
    func manualEmptyResponse() async throws {
        let transport = PollSaveTransport()
        let session = SessionStore(apiClient: APIClient(environment: .developmentFallback, transport: transport), credentialStore: EphemeralCredentialStore(), device: .current)
        session.installUITestingSession()
        let store = TimePollStore(token: "poll", poll: try collectingPoll(), draftDefaults: nil)
        store.chooseNoFreeTime()
        let submit = Task { await store.submit(session: session) }
        await transport.waitUntilFirstStarted(); await transport.finishFirst(); await submit.value
        #expect(store.saved && store.poll?.didRespond == true && store.selected.isEmpty)
        #expect(await transport.writes == [[]])
    }

    @Test("Retrying a failed refresh never submits private availability")
    @MainActor
    func refreshRetryDoesNotSubmit() async throws {
        let transport = PollSaveTransport(readStatus: 503)
        let session = SessionStore(apiClient: APIClient(environment: .developmentFallback, transport: transport), credentialStore: EphemeralCredentialStore(), device: .current)
        session.installUITestingSession()
        let store = TimePollStore(token: "poll", poll: try collectingPoll(), draftDefaults: nil)
        store.selected = [0, 1]
        await store.load(session: session)
        #expect(store.error != nil && !store.submissionFailed)
        await store.retry(session: session)
        #expect(await transport.writes.isEmpty)
        #expect(store.selected == [0, 1] && store.hasChanges && store.error != nil)
    }

    @Test("Pre-send refresh reports fresh success or failure without submitting private availability")
    @MainActor
    func refreshResultKeepsPrivateDraft() async throws {
        for status in [200, 503] {
            let transport = PollSaveTransport(initialSlots: [0, 1], readStatus: status)
            let session = SessionStore(apiClient: APIClient(environment: .developmentFallback, transport: transport),
                                       credentialStore: EphemeralCredentialStore(), device: .current)
            session.installUITestingSession()
            let store = TimePollStore(token: "poll", poll: try collectingPoll(), draftDefaults: nil)
            store.selected = [4, 5]; store.displayName = "Unsubmitted availability"
            let refreshed = await store.load(session: session)
            #expect(refreshed == (status == 200))
            #expect(store.selected == [4, 5] && store.displayName == "Unsubmitted availability" && store.hasChanges)
            #expect(await transport.writes.isEmpty)
            if status == 200 {
                #expect(store.poll?.mySlotIds == [0, 1] && store.poll?.didRespond == true && store.error == nil)
            } else {
                #expect(store.poll?.mySlotIds == [] && store.poll?.didRespond == false && store.error != nil)
            }
        }
    }

    @Test("Drafts restore per account and plan without publishing")
    @MainActor
    func localDraftRecovery() async throws {
        let suite = "sideseat-draft-test-" + UUID().uuidString
        let defaults = UserDefaults(suiteName: suite)!
        defer { defaults.removePersistentDomain(forName: suite) }
        let transport = PollSaveTransport()
        let session = SessionStore(apiClient: APIClient(environment: .developmentFallback, transport: transport), credentialStore: EphemeralCredentialStore(), device: .current)
        session.installUITestingSession()
        let first = TimePollStore(token: "poll", draftDefaults: defaults)
        await first.load(session: session)
        first.selected = [0, 1]; first.displayName = "My draft"
        let reopened = TimePollStore(token: "poll", draftDefaults: defaults)
        await reopened.load(session: session)
        #expect(reopened.selected == [0, 1] && reopened.displayName == "My draft")
        #expect(reopened.restoredDraft && reopened.hasChanges && !reopened.saved)
        let otherPlan = TimePollStore(token: "other-plan", draftDefaults: defaults)
        await otherPlan.load(session: session)
        #expect(otherPlan.selected.isEmpty && !otherPlan.restoredDraft)
        await session.login(identifier: "other", password: "test")
        await reopened.load(session: session)
        #expect(reopened.selected.isEmpty && !reopened.restoredDraft && reopened.displayName == "Ming")
        #expect(await transport.writes.isEmpty)
    }

    @Test("Old acknowledgements and failures keep the newer durable draft")
    @MainActor
    func durableDraftDuringSubmission() async throws {
        for status in [200, 503] {
            let suite = "sideseat-draft-test-" + UUID().uuidString
            let defaults = UserDefaults(suiteName: suite)!
            defer { defaults.removePersistentDomain(forName: suite) }
            let transport = PollSaveTransport(firstStatus: status, initialSlots: [])
            let session = SessionStore(apiClient: APIClient(environment: .developmentFallback, transport: transport), credentialStore: EphemeralCredentialStore(), device: .current)
            session.installUITestingSession()
            let store = TimePollStore(token: "poll", draftDefaults: defaults)
            await store.load(session: session); store.selected = [0, 1]
            let submit = Task { await store.submit(session: session) }
            await transport.waitUntilFirstStarted(); store.selected = []
            let during = TimePollStore(token: "poll", draftDefaults: defaults)
            await during.load(session: session)
            #expect(during.selected.isEmpty && during.restoredDraft && during.hasChanges)
            await transport.finishFirst(); await submit.value
            let reopened = TimePollStore(token: "poll", draftDefaults: defaults)
            await reopened.load(session: session)
            #expect(reopened.selected.isEmpty && reopened.restoredDraft && reopened.hasChanges)
            await reopened.submit(session: session)
            #expect(reopened.saved && !reopened.restoredDraft)
            let after = TimePollStore(token: "poll", draftDefaults: defaults)
            await after.load(session: session)
            #expect(after.saved && !after.restoredDraft && !after.hasChanges)
        }
    }

    @Test("Creation hands its unsubmitted availability to the existing durable draft")
    @MainActor
    func creationAvailabilityDraft() async throws {
        let name = "creation-availability-" + UUID().uuidString
        let defaults = try #require(UserDefaults(suiteName: name))
        defer { defaults.removePersistentDomain(forName: name) }
        let transport = PollSaveTransport()
        let session = SessionStore(apiClient: APIClient(environment: .developmentFallback, transport: transport), credentialStore: EphemeralCredentialStore(), device: .current)
        session.installUITestingSession()
        let created = TimePollStore(token: "poll", poll: try collectingPoll(), draftDefaults: defaults)
        created.setAvailabilityDraft([2, 3], session: session)
        let reopened = TimePollStore(token: "poll", draftDefaults: defaults)
        await reopened.load(session: session)
        #expect(reopened.selected == [2, 3] && reopened.restoredDraft && reopened.hasChanges)
        #expect(reopened.poll?.didRespond == false)
        #expect(await transport.writes.isEmpty)
    }

    @Test("Organizer invitation does not submit or discard an availability draft")
    @MainActor
    func invitationWithDraft() async throws {
        let transport = PollRefreshRaceTransport()
        let session = SessionStore(apiClient: APIClient(environment: .developmentFallback, transport: transport), credentialStore: EphemeralCredentialStore(), device: .current)
        session.installUITestingSession()
        let store = TimePollStore(token: "poll", poll: try collectingPoll(), draftDefaults: nil)
        store.selected = [2, 3]; store.displayName = "Local nickname"
        #expect(store.canMutate)
        await store.mutate("invitations", body: SendPollInvitationsRequest(start: "2030-10-16T07:00:00Z", end: "2030-10-16T08:00:00Z", attendeeIds: [], version: 0, linkParticipantCount: 2), session: session)
        #expect(store.poll?.planningPhase == "INVITING")
        #expect(store.selected == [2, 3] && store.displayName == "Local nickname" && store.hasChanges)
        #expect(await transport.writes.isEmpty)
    }

    @Test("Invitation failure and duplicate taps keep private availability for explicit retry")
    @MainActor
    func invitationFailureAndDuplicateGuard() async throws {
        let transport = PollInvitationTransport()
        let session = SessionStore(apiClient: APIClient(environment: .developmentFallback, transport: transport),
                                   credentialStore: EphemeralCredentialStore(), device: .current)
        session.installUITestingSession()
        let store = TimePollStore(token: "poll", poll: try collectingPoll(), draftDefaults: nil)
        store.selected = [4, 5]; store.displayName = "Private availability"
        let request = SendPollInvitationsRequest(start: "2030-10-16T07:00:00Z", end: "2030-10-16T08:00:00Z",
                                                 attendeeIds: ["friend"], version: 0)
        let sending = Task { await store.mutate("invitations", body: request, session: session) }
        await transport.waitUntilFirstStarted()
        #expect(store.acting && !store.canMutate)
        await store.mutate("invitations", body: request, session: session)
        #expect(await transport.paths.count == 1)
        await transport.finishFirst(); await sending.value
        #expect(store.error != nil && store.canMutate)
        #expect(store.poll?.planningPhase == "COLLECTING")
        #expect(store.selected == [4, 5] && store.displayName == "Private availability" && store.hasChanges)
        await store.mutate("invitations", body: request, session: session)
        #expect(store.error == nil && store.poll?.planningPhase == "INVITING")
        #expect(store.selected == [4, 5] && store.displayName == "Private availability" && store.hasChanges)
        #expect(await transport.paths == ["/api/v1/time-polls/poll/invitations", "/api/v1/time-polls/poll/invitations"])
    }

    @Test("Dirty availability keeps refreshing peers and formal invitation phases")
    @MainActor
    func refreshWithDraft() async throws {
        for phase in ["COLLECTING", "INVITING"] {
            let transport = PollRefreshRaceTransport(initialPhase: phase, includePeer: true)
            let session = SessionStore(apiClient: APIClient(environment: .developmentFallback, transport: transport), credentialStore: EphemeralCredentialStore(), device: .current)
            session.installUITestingSession()
            let store = TimePollStore(token: "poll", poll: try collectingPoll(), draftDefaults: nil)
            store.selected = [2, 3]; store.displayName = "Draft name"
            let refresh = Task { await store.load(session: session) }
            await transport.waitForRefresh(); await transport.releaseRefresh(); await refresh.value
            #expect(store.selected == [2, 3] && store.displayName == "Draft name" && store.hasChanges)
            #expect(store.poll?.participants.first?.displayName == "Friend")
            #expect(store.poll?.planningPhase == phase)
            if phase == "INVITING" { #expect(store.canMutate) }
            #expect(await transport.writes.isEmpty)
        }
    }

    @Test("A delayed refresh cannot undo an acknowledged save or report an old refresh error")
    @MainActor
    func refreshAfterSave() async throws {
        for status in [200, 503] {
            let transport = PollRefreshRaceTransport(refreshStatus: status)
            let session = SessionStore(apiClient: APIClient(environment: .developmentFallback, transport: transport), credentialStore: EphemeralCredentialStore(), device: .current)
            session.installUITestingSession()
            let store = TimePollStore(token: "poll", poll: try collectingPoll(), draftDefaults: nil)
            let refresh = Task { await store.load(session: session) }
            await transport.waitForRefresh()
            store.selected = [2, 3]; await store.submit(session: session)
            while store.saving { await Task.yield() }
            await transport.releaseRefresh(); await refresh.value
            #expect(store.selected == [2, 3] && store.poll?.mySlotIds == [2, 3])
            #expect(store.saved && store.error == nil)
            store.selected.insert(4); await store.submit(session: session)
            while store.saving { await Task.yield() }
            #expect(await transport.writes == [[2, 3], [2, 3, 4]])
        }
    }

    @Test("A refresh started before cancellation cannot restore the confirmed state")
    @MainActor
    func refreshAfterMutation() async throws {
        let transport = PollRefreshRaceTransport(initialPhase: "CONFIRMED")
        let session = SessionStore(apiClient: APIClient(environment: .developmentFallback, transport: transport), credentialStore: EphemeralCredentialStore(), device: .current)
        session.installUITestingSession()
        let store = TimePollStore(token: "poll", draftDefaults: nil)
        let refresh = Task { await store.load(session: session) }
        await transport.waitForRefresh()
        await store.mutate("cancel", body: CancelPollPlanRequest(version: 1), session: session)
        await transport.releaseRefresh(); await refresh.value
        #expect(store.poll?.planningPhase == "CANCELLED" && store.error == nil)
    }

    @Test("A refresh already in flight cannot replace a nickname being edited")
    @MainActor
    func refreshDuringNameEdit() async throws {
        let transport = PollRefreshRaceTransport()
        let session = SessionStore(apiClient: APIClient(environment: .developmentFallback, transport: transport), credentialStore: EphemeralCredentialStore(), device: .current)
        session.installUITestingSession()
        let store = TimePollStore(token: "poll", poll: try collectingPoll(), draftDefaults: nil)
        let refresh = Task { await store.load(session: session) }
        await transport.waitForRefresh()
        store.displayName = "New nickname"
        await transport.releaseRefresh(); await refresh.value
        #expect(store.displayName == "New nickname")
    }
}

private actor PollRefreshRaceTransport: APITransport {
    private var gate: CheckedContinuation<Void, Never>?
    private var started: CheckedContinuation<Void, Never>?
    private var refreshing = false
    private let refreshStatus: Int
    private let initialPhase: String
    private let includePeer: Bool
    private(set) var writes: [[Int]] = []
    init(refreshStatus: Int = 200, initialPhase: String = "COLLECTING", includePeer: Bool = false) {
        self.refreshStatus = refreshStatus; self.initialPhase = initialPhase; self.includePeer = includePeer
    }
    func waitForRefresh() async {
        if !refreshing { await withCheckedContinuation { started = $0 } }
    }
    func releaseRefresh() { gate?.resume(); gate = nil }
    func data(for request: URLRequest) async throws -> (Data, URLResponse) {
        var slots = [Int](), phase = initialPhase, status = 200
        if request.httpMethod == "GET" {
            refreshing = true
            await withCheckedContinuation { gate = $0; started?.resume(); started = nil }
            status = refreshStatus
        } else if request.url!.path.hasSuffix("/cancel") { phase = "CANCELLED" }
        else if request.url!.path.hasSuffix("/invitations") { phase = "INVITING" }
        else {
            let body = try JSONDecoder().decode(SaveTimePollRequest.self, from: request.httpBody!)
            slots = body.slotIds; writes.append(slots)
        }
        var object = try JSONSerialization.jsonObject(with: collectingPollData()) as! [String: Any]
        object["mySlotIds"] = slots; object["didRespond"] = true; object["phase"] = phase
        if includePeer { object["participants"] = [["id": "friend", "displayName": "Friend", "slotIds": [0, 1], "isMe": false]] }
        // Use APIClient's wire date representation, not JSONEncoder's default numeric dates.
        object["updatedAt"] = "2030-10-16T07:00:00Z"
        let data = status == 200 ? try JSONSerialization.data(withJSONObject: ["data": object])
            : Data(#"{"error":{"code":"UNAVAILABLE","message":"Old refresh failed","retryable":true}}"#.utf8)
        return (data, HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: nil, headerFields: nil)!)
    }
}

private func collectingPollData() -> Data {
    let start = ISO8601DateFormatter().date(from: "2030-10-16T07:00:00Z")!
    let formatter = ISO8601DateFormatter()
    var slots = [[String: Any]]()
    for id in 0..<12 {
        let from = formatter.string(from: start.addingTimeInterval(Double(id * 900)))
        let until = formatter.string(from: start.addingTimeInterval(Double((id + 1) * 900)))
        slots.append(["id": id, "date": "2030-10-16", "row": String(id), "label": String(id), "start": from, "end": until])
    }
    return try! JSONSerialization.data(withJSONObject: [
        "token": "poll", "title": "Dinner", "timeZone": "Europe/Berlin", "dates": ["2030-10-16"], "startMinute": 540, "endMinute": 720,
        "slots": slots, "participants": [], "mySlotIds": [], "myDisplayName": "Ming", "didRespond": false, "isOwner": true,
        "updatedAt": "2030-10-16T07:00:00Z", "shareUrl": "https://www.sideseat.de/time-polls/poll",
        "summary": ["counts": [], "participantCount": 0, "maximum": 0, "common": false, "windows": []],
    ])
}

private func collectingPoll() throws -> NativeTimePoll {
    let decoder = JSONDecoder(); decoder.dateDecodingStrategy = .iso8601
    return try decoder.decode(NativeTimePoll.self, from: collectingPollData())
}

private func invitationPoll(responses: [[String: Any]], candidates: [[String: Any]]) throws -> NativeTimePoll {
    var object = try JSONSerialization.jsonObject(with: collectingPollData()) as! [String: Any]
    object["participants"] = responses; object["invitees"] = candidates
    let decoder = JSONDecoder(); decoder.dateDecodingStrategy = .iso8601
    return try decoder.decode(NativeTimePoll.self, from: JSONSerialization.data(withJSONObject: object))
}

private actor PollInvitationTransport: APITransport {
    private(set) var paths: [String] = []
    private var started: CheckedContinuation<Void, Never>?
    private var pending: CheckedContinuation<Void, Never>?
    func waitUntilFirstStarted() async {
        if paths.isEmpty { await withCheckedContinuation { started = $0 } }
    }
    func finishFirst() { pending?.resume(); pending = nil }
    func data(for request: URLRequest) async throws -> (Data, URLResponse) {
        paths.append(request.url!.path)
        if paths.count == 1 {
            await withCheckedContinuation { continuation in
                pending = continuation; started?.resume(); started = nil
            }
            return (Data(#"{"error":{"code":"UNAVAILABLE","message":"Invitation failed","retryable":false}}"#.utf8),
                    HTTPURLResponse(url: request.url!, statusCode: 503, httpVersion: nil, headerFields: nil)!)
        }
        var object = try JSONSerialization.jsonObject(with: collectingPollData()) as! [String: Any]
        object["phase"] = "INVITING"; object["invitationVersion"] = 1
        let data = try JSONSerialization.data(withJSONObject: ["data": object])
        return (data, HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!)
    }
}

private actor PollSaveTransport: APITransport {
    private(set) var writes: [[Int]] = []
    private var firstStarted: CheckedContinuation<Void, Never>?
    private var firstPending: CheckedContinuation<Void, Never>?
    private let firstStatus: Int
    private(set) var refreshCount = 0
    private let readStatus: Int
    private var acknowledged: [Int]?
    private var acknowledgedName = "Ming"
    init(firstStatus: Int = 200, initialSlots: [Int]? = nil, readStatus: Int = 200) { self.firstStatus = firstStatus; acknowledged = initialSlots; self.readStatus = readStatus }
    private func response(_ request: URLRequest) throws -> (Data, URLResponse) {
        var object = try JSONSerialization.jsonObject(with: collectingPollData()) as! [String: Any]
        object["mySlotIds"] = acknowledged ?? []; object["myDisplayName"] = acknowledgedName; object["didRespond"] = acknowledged != nil
        return (try JSONSerialization.data(withJSONObject: ["data": object]), HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!)
    }
    func waitUntilFirstStarted() async {
        if writes.isEmpty { await withCheckedContinuation { firstStarted = $0 } }
    }
    func finishFirst() { firstPending?.resume(); firstPending = nil }
    func data(for request: URLRequest) async throws -> (Data, URLResponse) {
        if request.url?.path == "/api/v1/auth/login" || request.url?.path == "/api/v1/auth/refresh" {
            if request.url?.path == "/api/v1/auth/refresh" { refreshCount += 1 }
            let body = #"{"data":{"user":{"id":"other-user","username":"other","nickname":"Other","gender":"PRIVATE","onboardingComplete":true,"isGuest":false,"verifiedStudent":true,"studentVerificationStatus":"VERIFIED","locale":"en"},"tokens":{"accessToken":"other-access","accessExpiresIn":900,"refreshToken":"other-refresh","refreshExpiresAt":"2026-10-17T00:00:00Z"}}}"#
            return (Data(body.utf8), HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!)
        }
        if request.httpMethod == "GET" {
            if readStatus != 200 {
                return (Data(#"{"error":{"code":"UNAVAILABLE","message":"Refresh failed","retryable":false}}"#.utf8), HTTPURLResponse(url: request.url!, statusCode: readStatus, httpVersion: nil, headerFields: nil)!)
            }
            return try response(request)
        }
        let input = try JSONDecoder().decode(SaveTimePollRequest.self, from: request.httpBody!)
        writes.append(input.slotIds)
        if writes.count == 1 {
            await withCheckedContinuation { continuation in
                firstPending = continuation; firstStarted?.resume(); firstStarted = nil
            }
            if firstStatus != 200 {
                let body = #"{"error":{"code":"UNAVAILABLE","message":"Save failed","retryable":false}}"#
                return (Data(body.utf8), HTTPURLResponse(url: request.url!, statusCode: firstStatus, httpVersion: nil, headerFields: nil)!)
            }
        }
        acknowledged = input.slotIds; acknowledgedName = input.displayName
        return try response(request)
    }
}
