import Foundation
import Testing
@testable import SideSeat

@Suite("Inbox notifications") @MainActor
struct InboxNotificationsTests {
    private func storage() -> UserDefaults {
        UserDefaults(suiteName: "notifications-tests.\(UUID())")!
    }

    @Test("Read markers survive refresh and relaunch, and stay scoped to an account")
    func readPersistenceAndAccountIsolation() throws {
        let defaults = storage()
        let store = InboxNotificationsStore(defaults: defaults)
        let poll = try poll()
        store.activate(accountID: "alice")
        store.reconcile(polls: [poll])
        #expect(store.unreadCount == 1)
        store.markAllRead()
        store.reconcile(polls: [try self.poll(updated: "2030-10-18T10:00:00Z")])
        #expect(store.items.count == 1)
        #expect(store.unreadCount == 0, "Other responses must not replay the same invitation")
        let relaunched = InboxNotificationsStore(defaults: defaults)
        relaunched.activate(accountID: "alice")
        #expect(relaunched.items.count == 1 && relaunched.unreadCount == 0)
        relaunched.activate(accountID: "bob")
        #expect(relaunched.items.isEmpty)
        relaunched.reconcile(polls: [poll])
        #expect(relaunched.unreadCount == 1)
        relaunched.activate(accountID: "alice")
        #expect(relaunched.unreadCount == 0)
        relaunched.reset()
        #expect(relaunched.items.isEmpty && relaunched.accountID == nil)
    }

    @Test("Time changes create one new notification and retain the canonical plan destination")
    func planChangeAndNavigation() throws {
        let store = InboxNotificationsStore(defaults: storage())
        store.activate(accountID: "alice")
        store.reconcile(polls: [try poll()])
        store.markAllRead()
        let changed = try poll(start: "2030-10-20T12:00:00Z", end: "2030-10-20T14:00:00Z", updated: "2030-10-18T11:00:00Z")
        store.reconcile(polls: [changed])
        #expect(store.items.count == 2 && store.unreadCount == 1)
        #expect(store.items.first?.kind == .changed)
        #expect(store.items.first?.destination.route == .timePoll(token: String(repeating: "a", count: 32)))
        store.reconcile(polls: [changed])
        #expect(store.items.count == 2 && store.unreadCount == 1)
        #expect(DeepLinkRouter.route(forPath: "/inbox/notifications") == .notifications)
        #expect(MVPRoutePolicy.tab(for: .notifications) == .chats)
        #expect(MVPRoutePolicy.disposition(for: .notifications) == .allowed)
    }

    @Test("Removed access prunes plan content; an unselected participant receives no notification")
    func accessRemoval() throws {
        let store = InboxNotificationsStore(defaults: storage())
        store.activate(accountID: "alice")
        store.reconcile(polls: [try poll()])
        #expect(!store.items.isEmpty)
        store.reconcile(polls: [try poll(included: false)])
        #expect(store.items.isEmpty)
    }

    @Test("Preview 112's missed INVITED snapshot is recovered once without losing read history")
    func recoverMissedInvitations() throws {
        let defaults = storage()
        let current = try poll()
        let old: [String: Any] = ["items": [], "fingerprints": [
            "shared:" + current.token: "\(current.chosenStart!.timeIntervalSince1970)|\(current.chosenEnd!.timeIntervalSince1970)|INVITING|INVITED"
        ]]
        defaults.set(try JSONSerialization.data(withJSONObject: old), forKey: "sideseat.notifications.v1.alice")
        let store = InboxNotificationsStore(defaults: defaults)
        store.activate(accountID: "alice")
        store.reconcile(polls: [try poll()])
        #expect(store.items.count == 1 && store.unreadCount == 1)
        store.markAllRead()
        let reopened = InboxNotificationsStore(defaults: defaults)
        reopened.activate(accountID: "alice")
        reopened.reconcile(polls: [try poll()])
        #expect(reopened.items.count == 1 && reopened.unreadCount == 0)
    }

    @Test("An elapsed invitation leaves no unread invitation or confirmation action")
    func expiredInvitation() throws {
        let store = InboxNotificationsStore(defaults: storage())
        store.activate(accountID: "alice")
        let item = try poll()
        store.reconcile(polls: [item], now: item.chosenStart!.addingTimeInterval(-1))
        #expect(store.unreadCount == 1)
        #expect(store.nextInvitationExpiry == item.chosenStart)
        store.expireInvitations(now: item.chosenStart!)
        #expect(store.items.isEmpty && store.unreadCount == 0)
        store.reconcile(polls: [item], now: item.chosenStart!)
        #expect(store.items.isEmpty && store.unreadCount == 0)
        #expect(item.planningPhase(at: item.chosenStart!) == "EXPIRED")
    }

    @Test("Cancelled accepted revisions are presented as cancellation, not confirmation")
    func acceptedCancellation() {
        let store = InboxNotificationsStore(defaults: storage())
        store.activate(accountID: "alice")
        var plan = NativePlanRequest(id: "accepted", connectionId: "connection", status: "ACCEPTED",
            planType: "CUSTOM", title: "Coffee", location: nil, message: nil,
            startTime: "2030-10-20T10:00:00Z", endTime: "2030-10-20T12:00:00Z",
            proposer: .init(id: "alice", username: "alice", nickname: nil, avatarUrl: nil),
            receiver: .init(id: "bob", username: "bob", nickname: nil, avatarUrl: nil),
            counterOfId: nil, availabilityShareId: nil, scheduleShareLinkId: nil,
            createdAt: "2030-10-18T09:00:00Z", updatedAt: "2030-10-18T09:00:00Z")
        plan.cancellation = .init(actorId: "peer", reasonCode: nil, note: nil,
            canceledAt: Date().ISO8601Format(), wasConfirmed: true)
        store.reconcile(plans: [plan], userID: "alice")
        #expect(store.items.count == 1)
        #expect(store.items.first?.kind == .cancelled)
        #expect(store.items.first?.destination.route == MVPPlanRoute.route(for: plan))
    }

    @Test("Verification alerts reflect an observed result, not a fabricated initial event")
    func verificationResult() {
        let store = InboxNotificationsStore(defaults: storage())
        let pending = NativeCurrentProfile.uiTestingPendingFixture
        store.activate(accountID: pending.id)
        store.observe(profile: pending)
        #expect(store.items.isEmpty)
        store.observe(profile: .uiTestingFixture)
        #expect(store.items.count == 1)
        #expect(store.items.first?.kind == .verificationApproved)
        store.markAllRead()
        store.observe(profile: .uiTestingFixture)
        #expect(store.unreadCount == 0 && store.items.count == 1)
    }

    @Test("Authenticated API hydration loads real domain responses without replaying reads")
    func authenticatedHydration() async throws {
        let transport = NotificationsTransport()
        let session = SessionStore(apiClient: APIClient(environment: .developmentFallback, transport: transport),
            credentialStore: EphemeralCredentialStore(), device: .current)
        session.installUITestingSession()
        let store = InboxNotificationsStore(defaults: storage())
        await store.refresh(using: session)
        #expect(store.issue == nil)
        #expect(store.unreadCount == 1)
        #expect(store.items.first?.detail == "API plan")
        #expect(await transport.paths == ["/api/v1/plans", "/api/v1/time-polls", "/api/v1/me"])
        store.markAllRead()
        await store.refresh(using: session)
        #expect(store.unreadCount == 0 && store.items.count == 1)
    }

    @Test("Switching notification accounts discards an in-flight API response")
    func inFlightAccountSwitch() async throws {
        let transport = NotificationsTransport(delayFirst: true)
        let session = SessionStore(apiClient: APIClient(environment: .developmentFallback, transport: transport),
            credentialStore: EphemeralCredentialStore(), device: .current)
        session.installUITestingSession()
        let store = InboxNotificationsStore(defaults: storage())
        let load = Task { await store.refresh(using: session) }
        await transport.waitUntilStarted()
        store.activate(accountID: "bob")
        store.reconcile(polls: [try poll()])
        await transport.releaseFirst()
        await load.value
        #expect(store.accountID == "bob" && store.unreadCount == 1)
        #expect(store.items.first?.detail == "Coffee")
        #expect(await transport.paths.count == 1)
    }

    private func poll(start: String = "2030-10-20T10:00:00Z", end: String = "2030-10-20T12:00:00Z",
                      updated: String = "2030-10-18T09:00:00Z", included: Bool = true) throws -> NativeTimePollList.Item {
        let object: [String: Any] = ["token": String(repeating: "a", count: 32), "title": "Coffee",
            "timeZone": "Europe/Berlin", "dates": ["2030-10-20"], "updatedAt": updated,
            "shareUrl": "https://www.sideseat.de/time-polls/" + String(repeating: "a", count: 32),
            "phase": "INVITING", "chosenStart": start, "chosenEnd": end,
            "myInvitationStatus": "INVITED", "isIncluded": included]
        let decoder = JSONDecoder(); decoder.dateDecodingStrategy = .iso8601
        return try decoder.decode(NativeTimePollList.Item.self, from: JSONSerialization.data(withJSONObject: object))
    }
}

private actor NotificationsTransport: APITransport {
    private(set) var paths: [String] = []
    private let delayFirst: Bool
    private var started: CheckedContinuation<Void, Never>?
    private var pending: CheckedContinuation<Void, Never>?
    init(delayFirst: Bool = false) { self.delayFirst = delayFirst }
    func waitUntilStarted() async {
        if paths.isEmpty { await withCheckedContinuation { started = $0 } }
    }
    func releaseFirst() { pending?.resume(); pending = nil }
    func data(for request: URLRequest) async throws -> (Data, URLResponse) {
        let path = request.url!.path
        paths.append(path)
        if paths.count == 1 {
            started?.resume(); started = nil
            if delayFirst { await withCheckedContinuation { pending = $0 } }
        }
        let body: String
        switch path {
        case "/api/v1/plans": body = #"{"data":{"plans":[]}}"#
        case "/api/v1/time-polls":
            body = #"{"data":{"polls":[{"token":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","title":"API plan","timeZone":"Europe/Berlin","dates":["2030-10-20"],"updatedAt":"2030-10-18T09:00:00Z","shareUrl":"https://www.sideseat.de/time-polls/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","phase":"INVITING","chosenStart":"2030-10-20T10:00:00Z","chosenEnd":"2030-10-20T12:00:00Z","myInvitationStatus":"INVITED","isIncluded":true}]}}"#
        case "/api/v1/me":
            body = #"{"data":{"id":"ui-test-user","username":"test_001","gender":"PRIVATE","onboardingComplete":true,"isGuest":false,"verifiedStudent":true,"studentVerificationStatus":"VERIFIED","locale":"en","displayName":"Test User","schoolSummary":{"schoolShort":"TUM","degreeLabel":"Bachelor","major":"Informatics","semester":3},"contacts":{},"privacy":{"discoverByCourse":true,"discoverByMajor":true,"discoverBySemester":true,"allowInvitationNotes":true,"contactInfoOptIn":false,"hideFromCourseMembers":false,"hideFromDiscovery":false},"counts":{"blocked":0}}}"#
        default: throw URLError(.badURL)
        }
        return (Data(body.utf8), HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil,
            headerFields: ["Content-Type": "application/json"])!)
    }
}
