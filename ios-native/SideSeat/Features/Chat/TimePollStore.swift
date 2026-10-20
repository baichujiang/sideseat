import Foundation
import Observation

@MainActor @Observable
final class TimePollStore {
    let token: String
    private(set) var poll: NativeTimePoll?
    var selected = Set<Int>() { didSet { if selected != oldValue { revision += 1; edited = true } } }
    var displayName = "" { didSet { if displayName != oldValue { revision += 1; edited = true } } }
    private(set) var saving = false
    private(set) var error: String?
    private(set) var acting = false
    private var edited = false
    private var revision = 0
    private var refreshID = UUID()
    var hasChanges: Bool {
        guard let poll else { return false }
        return (!poll.didRespond && edited) || selected != Set(poll.mySlotIds)
            || displayName.trimmingCharacters(in: .whitespacesAndNewlines) != poll.myDisplayName
    }
    var saved: Bool { poll?.didRespond == true && !hasChanges }
    var canMutate: Bool { !acting && !saving && !hasChanges }

    func showError(_ error: Error) { self.error = error.localizedDescription }
    func chooseNoFreeTime() { selected = []; edited = true; revision += 1; error = nil }

    init(token: String, poll: NativeTimePoll? = nil) {
        self.token = token
        if let poll { accept(poll) }
    }

    func load(session: SessionStore) async {
        guard !saving && !acting && !hasChanges else { return }
        let generation = session.authorizationGeneration
        let currentRevision = revision
        let request = UUID()
        refreshID = request
        do {
            let response: APIEnvelope<NativeTimePoll> = try await session.sendAuthorized("/api/v1/time-polls/\(token)")
            guard generation == session.authorizationGeneration,
                  currentRevision == revision, request == refreshID else { return }
            if !saving && !acting && !hasChanges { accept(response.data); error = nil }
        } catch {
            if generation == session.authorizationGeneration, currentRevision == revision,
               request == refreshID, !saving, !acting { self.error = error.localizedDescription }
        }
    }

    func accept(_ value: NativeTimePoll) {
        poll = value
        selected = Set(value.mySlotIds)
        displayName = value.myDisplayName
        edited = false
    }

    func mutate<Body: Encodable & Sendable>(_ action: String, method: HTTPMethod = .post, body: Body, session: SessionStore) async {
        guard canMutate else { return }
        revision += 1
        acting = true; defer { acting = false }
        let generation = session.authorizationGeneration
        let userID = session.currentUser?.id
        do {
            let result: APIEnvelope<NativeTimePoll> = try await session.sendAuthorized("/api/v1/time-polls/\(token)/\(action)", method: method, body: body)
            guard generation == session.authorizationGeneration, userID == session.currentUser?.id else { return }
            accept(result.data); error = nil
            NotificationCenter.default.post(name: .sideSeatPlansNeedsRefresh, object: nil)
            NotificationCenter.default.post(name: .sideSeatCalendarNeedsRefresh, object: nil)
        } catch { self.error = error.localizedDescription }
    }

    /// Only this explicit action publishes availability. Later edits remain a separate draft.
    func submit(session: SessionStore) async {
        guard !saving, !acting, hasChanges, poll?.planningPhase == "COLLECTING" else { return }
        let name = displayName.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !name.isEmpty else { error = AppLocalization.string("Enter your name."); return }
        let request = SaveTimePollRequest(displayName: name, slotIds: selected.sorted())
        let submittedRevision = revision
        let generation = session.authorizationGeneration
        let userID = session.currentUser?.id
        saving = true; error = nil
        defer { saving = false }
        do {
            let result: APIEnvelope<NativeTimePoll> = try await session.sendAuthorized(
                "/api/v1/time-polls/\(token)/response", method: .put, body: request
            )
            guard generation == session.authorizationGeneration, userID == session.currentUser?.id else { return }
            if submittedRevision == revision { accept(result.data) }
            else { poll = result.data }
            NotificationCenter.default.post(name: .sideSeatPlansNeedsRefresh, object: nil)
        } catch {
            if generation == session.authorizationGeneration, userID == session.currentUser?.id {
                self.error = error.localizedDescription
            }
        }
    }
}
