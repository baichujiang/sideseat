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

    @Test("Invite links use the Sideseat domain and route into the native feature")
    func links() {
        let token = String(repeating: "a", count: 32)
        #expect(TimePollLink.token(from: "https://www.sideseat.de/time-polls/\(token)") == token)
        #expect(TimePollLink.token(from: "https://www.when2meet.com/?12345-AbC") == nil)
        #expect(TimePollLink.token(from: "https://sideseat.de.attacker.test/time-polls/\(token)") == nil)
        #expect(DeepLinkRouter.route(for: URL(string: "sideseat://time-polls/\(token)")!) == .timePoll(token: token))
        #expect(MVPRoutePolicy.tab(for: .timePoll(token: token)) == .plans)
    }

    @Test("Quick consecutive drags save in order and leave the latest draft acknowledged")
    @MainActor
    func autosaveOrder() async throws {
        let transport = PollSaveTransport()
        let session = SessionStore(apiClient: APIClient(environment: .developmentFallback, transport: transport), credentialStore: EphemeralCredentialStore(), device: .current)
        session.installUITestingSession()
        let store = TimePollStore(token: "poll", poll: try collectingPoll())
        store.displayName = "Ming"
        store.selected = [0]; store.save(session: session)
        await transport.waitUntilFirstStarted()
        store.selected = [1, 2]; store.save(session: session)
        await transport.finishFirst()
        for _ in 0..<100 where store.saving { try await Task.sleep(for: .milliseconds(10)) }
        #expect(!store.saving); #expect(store.saved)
        #expect(store.selected == [1, 2]); #expect(store.poll?.mySlotIds == [1, 2])
        #expect(await transport.writes == [[0], [1, 2]])
    }

    @Test("Switching accounts drops queued availability from the previous account")
    @MainActor
    func autosaveAccountScope() async throws {
        for status in [200, 401] {
        let transport = PollSaveTransport(firstStatus: status)
        let session = SessionStore(apiClient: APIClient(environment: .developmentFallback, transport: transport), credentialStore: EphemeralCredentialStore(), device: .current)
        session.installUITestingSession()
        let store = TimePollStore(token: "poll", poll: try collectingPoll())
        store.displayName = "Ming"; store.selected = [0]; store.save(session: session)
        await transport.waitUntilFirstStarted()
        store.selected = [1, 2]; store.save(session: session)
        await session.login(identifier: "other", password: "test")
        #expect(session.currentUser?.id == "other-user")
        await transport.finishFirst()
        for _ in 0..<100 where store.saving { try await Task.sleep(for: .milliseconds(10)) }
        #expect(!store.saving); #expect(!store.saved)
        #expect(await transport.writes == [[0]])
        #expect(await transport.refreshCount == 0)
        }
    }
}

private func collectingPoll() throws -> NativeTimePoll {
    let data = Data(#"{"token":"poll","title":"Dinner","timeZone":"Europe/Berlin","dates":["2026-10-16"],"startMinute":540,"endMinute":600,"slots":[],"participants":[],"mySlotIds":[],"myDisplayName":"Ming","didRespond":false,"isOwner":true,"updatedAt":"2026-10-16T07:00:00Z","shareUrl":"https://www.sideseat.de/time-polls/poll","summary":{"counts":[],"participantCount":0,"maximum":0,"common":false,"windows":[]}}"#.utf8)
    let decoder = JSONDecoder(); decoder.dateDecodingStrategy = .iso8601
    return try decoder.decode(NativeTimePoll.self, from: data)
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
            if firstStatus == 401 {
                let body = #"{"error":{"code":"AUTH_REQUIRED","message":"Expired QA session","retryable":false}}"#
                return (Data(body.utf8), HTTPURLResponse(url: request.url!, statusCode: 401, httpVersion: nil, headerFields: nil)!)
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
