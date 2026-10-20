import Foundation
import Testing
@testable import SideSeat

@Suite("Native time polls")
struct TimePollTests {
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

    @Test("Final time spans continuous half-hour cells in either direction without changing replies")
    func finalTimeRange() {
        let slots = (0..<8).map { id in NativeTimePoll.Slot(id: id, date: "2026-10-19", row: String(id), label: String(id), start: Date(timeIntervalSince1970: Double(id * 900)), end: Date(timeIntervalSince1970: Double((id + 1) * 900))) }
        let cells = TimePollSelection.cells(slots)
        let forward = TimePollFinalRange.spanning(cells[0], cells[2], cells: cells)
        let reverse = TimePollFinalRange.spanning(cells[2], cells[0], cells: cells)
        #expect(forward == reverse)
        #expect(forward?.start == slots[0].start)
        #expect(forward?.end == slots[5].end)
        #expect(forward?.contains(cells[1]) == true)
        #expect(forward?.contains(cells[3]) == false)
        #expect(cells.flatMap { $0.slots.map(\.id) } == Array(0..<8))
    }

    @Test("Final time cannot span different dates or gaps")
    func finalTimeBoundaries() {
        let slots = (0..<6).map { id in NativeTimePoll.Slot(id: id, date: id < 4 ? "2026-10-19" : "2026-10-20", row: String(id), label: String(id), start: Date(timeIntervalSince1970: Double(id * 900)), end: Date(timeIntervalSince1970: Double((id + 1) * 900))) }
        let cells = TimePollSelection.cells(slots)
        #expect(TimePollFinalRange.spanning(cells[0], cells[2], cells: cells) == nil)
        let separated = [cells[0], NativeTimePoll.Cell(slots: [.init(id: 10, date: "2026-10-19", row: "10", label: "10", start: Date(timeIntervalSince1970: 9000), end: Date(timeIntervalSince1970: 9900))])]
        #expect(TimePollFinalRange.spanning(separated[0], separated[1], cells: separated) == nil)
    }

    @Test("Whole-day final time preserves midnight and an odd legacy boundary")
    func finalTimeWholeDay() {
        let slots = (0..<95).map { id in NativeTimePoll.Slot(id: id, date: "2026-10-19", row: String(id), label: String(id), start: Date(timeIntervalSince1970: Double(id * 900)), end: Date(timeIntervalSince1970: Double((id + 1) * 900))) }
        let cells = TimePollSelection.cells(slots)
        #expect(TimePollFinalRange.spanning(cells.first!, cells.last!, cells: cells)?.end == slots.last!.end)
        let last = NativeTimePoll.Cell(slots: [.init(id: 95, date: "2026-10-19", row: "95", label: "23:45", start: slots.last!.end, end: Date(timeIntervalSince1970: 86400))])
        #expect(TimePollFinalRange.spanning(cells[0], last, cells: cells + [last])?.end == Date(timeIntervalSince1970: 86400))
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

    @Test("Inline timetable counts the current draft once and preserves other replies")
    func inlineTimetableCounts() throws {
        var object = try JSONSerialization.jsonObject(with: collectingPollData()) as! [String: Any]
        object["participants"] = [
            ["id": "me", "displayName": "Ming", "slotIds": [0, 1], "isMe": true],
            ["id": "friend", "displayName": "Lin", "slotIds": [0, 1, 2, 3], "isMe": false],
        ]
        let decoder = JSONDecoder(); decoder.dateDecodingStrategy = .iso8601
        let poll = try decoder.decode(NativeTimePoll.self, from: JSONSerialization.data(withJSONObject: object))
        #expect(poll.timetableSelections(ownSelection: [2, 3]) == [[0, 1, 2, 3], [2, 3]])
        #expect(poll.timetableSelections(ownSelection: []) == [[0, 1, 2, 3], []])
        #expect(poll.timetableSelections(ownSelection: nil) == [[0, 1], [0, 1, 2, 3]])
        #expect(try collectingPoll().timetableSelections(ownSelection: [0, 1]) == [[0, 1]])
    }

    @Test("Selections stay local until one explicit submission")
    @MainActor
    func manualSubmission() async throws {
        let transport = PollSaveTransport()
        let session = SessionStore(apiClient: APIClient(environment: .developmentFallback, transport: transport), credentialStore: EphemeralCredentialStore(), device: .current)
        session.installUITestingSession()
        let store = TimePollStore(token: "poll", poll: try collectingPoll())
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
        let store = TimePollStore(token: "poll", poll: try collectingPoll())
        store.selected = [0]
        let submit = Task { await store.submit(session: session) }
        await transport.waitUntilFirstStarted(); store.selected = [1, 2]
        await transport.finishFirst(); await submit.value
        try await Task.sleep(for: .seconds(1))
        #expect(store.selected == [1, 2] && store.hasChanges && store.error != nil)
        #expect(await transport.writes == [[0]])
        await store.submit(session: session)
        #expect(store.saved && store.error == nil)
        #expect(await transport.writes == [[0], [1, 2]])
    }

    @Test("Editing during submission never publishes or discards the newer draft")
    @MainActor
    func manualSubmissionSnapshot() async throws {
        let transport = PollSaveTransport()
        let session = SessionStore(apiClient: APIClient(environment: .developmentFallback, transport: transport), credentialStore: EphemeralCredentialStore(), device: .current)
        session.installUITestingSession()
        let store = TimePollStore(token: "poll", poll: try collectingPoll())
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
            let store = TimePollStore(token: "poll", poll: try collectingPoll())
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
        let store = TimePollStore(token: "poll", poll: try collectingPoll())
        store.chooseNoFreeTime()
        let submit = Task { await store.submit(session: session) }
        await transport.waitUntilFirstStarted(); await transport.finishFirst(); await submit.value
        #expect(store.saved && store.poll?.didRespond == true && store.selected.isEmpty)
        #expect(await transport.writes == [[]])
    }

    @Test("A delayed refresh cannot undo an acknowledged save or report an old refresh error")
    @MainActor
    func refreshAfterSave() async throws {
        for status in [200, 503] {
            let transport = PollRefreshRaceTransport(refreshStatus: status)
            let session = SessionStore(apiClient: APIClient(environment: .developmentFallback, transport: transport), credentialStore: EphemeralCredentialStore(), device: .current)
            session.installUITestingSession()
            let store = TimePollStore(token: "poll", poll: try collectingPoll())
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
        let store = TimePollStore(token: "poll")
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
        let store = TimePollStore(token: "poll", poll: try collectingPoll())
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
    private(set) var writes: [[Int]] = []
    init(refreshStatus: Int = 200, initialPhase: String = "COLLECTING") {
        self.refreshStatus = refreshStatus; self.initialPhase = initialPhase
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
        else {
            let body = try JSONDecoder().decode(SaveTimePollRequest.self, from: request.httpBody!)
            slots = body.slotIds; writes.append(slots)
        }
        var object = try JSONSerialization.jsonObject(with: collectingPollData()) as! [String: Any]
        object["mySlotIds"] = slots; object["didRespond"] = true; object["phase"] = phase
        // Use APIClient's wire date representation, not JSONEncoder's default numeric dates.
        object["updatedAt"] = "2030-10-16T07:00:00Z"
        let data = status == 200 ? try JSONSerialization.data(withJSONObject: ["data": object])
            : Data(#"{"error":{"code":"UNAVAILABLE","message":"Old refresh failed","retryable":true}}"#.utf8)
        return (data, HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: nil, headerFields: nil)!)
    }
}

private func collectingPollData() -> Data {
    Data(#"{"token":"poll","title":"Dinner","timeZone":"Europe/Berlin","dates":["2026-10-16"],"startMinute":540,"endMinute":600,"slots":[],"participants":[],"mySlotIds":[],"myDisplayName":"Ming","didRespond":false,"isOwner":true,"updatedAt":"2026-10-16T07:00:00Z","shareUrl":"https://www.sideseat.de/time-polls/poll","summary":{"counts":[],"participantCount":0,"maximum":0,"common":false,"windows":[]}}"#.utf8)
}

private func collectingPoll() throws -> NativeTimePoll {
    let decoder = JSONDecoder(); decoder.dateDecodingStrategy = .iso8601
    return try decoder.decode(NativeTimePoll.self, from: collectingPollData())
}

private actor PollSaveTransport: APITransport {
    private(set) var writes: [[Int]] = []
    private var firstStarted: CheckedContinuation<Void, Never>?
    private var firstPending: CheckedContinuation<Void, Never>?
    private let firstStatus: Int
    private(set) var refreshCount = 0
    init(firstStatus: Int = 200) { self.firstStatus = firstStatus }
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
        let data = try JSONSerialization.data(withJSONObject: ["data": [
            "token": "poll", "title": "Dinner", "timeZone": "Europe/Berlin", "dates": ["2026-10-16"], "startMinute": 540, "endMinute": 600,
            "slots": [], "participants": [], "mySlotIds": input.slotIds, "myDisplayName": input.displayName,
            "didRespond": true, "isOwner": true, "updatedAt": "2026-10-16T07:00:00Z", "shareUrl": "https://www.sideseat.de/time-polls/poll",
            "summary": ["counts": [], "participantCount": 1, "maximum": 1, "common": true, "windows": []],
        ]])
        return (data, HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!)
    }
}
