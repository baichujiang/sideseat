import Foundation
import Observation

@MainActor @Observable
final class TimePollStore {
    let token: String
    private(set) var poll: NativeTimePoll?
    var selected = Set<Int>()
    var displayName = ""
    private(set) var saving = false
    private(set) var saved = false
    private(set) var error: String?
    private(set) var acting = false
    var canMutate: Bool { !acting && !saving && pending == nil }
    private var pending: SaveTimePollRequest?

    func showError(_ error: Error) { self.error = error.localizedDescription }

    init(token: String, poll: NativeTimePoll? = nil) {
        self.token = token
        if let poll { accept(poll) }
    }

    func load(session: SessionStore) async {
        let generation = session.authorizationGeneration
        do {
            let response: APIEnvelope<NativeTimePoll> = try await session.sendAuthorized("/api/v1/time-polls/\(token)")
            guard generation == session.authorizationGeneration else { return }
            // A refresh must never replace selections that are awaiting acknowledgement.
            if !saving && pending == nil { accept(response.data); error = nil }
        } catch { if !saving { self.error = error.localizedDescription } }
    }

    func accept(_ value: NativeTimePoll) {
        poll = value
        selected = Set(value.mySlotIds)
        displayName = value.myDisplayName
        saved = value.didRespond
    }

    func mutate<Body: Encodable & Sendable>(_ action: String, method: HTTPMethod = .post, body: Body, session: SessionStore) async {
        guard canMutate else { return }
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

    func save(session: SessionStore) {
        guard poll?.planningPhase == "COLLECTING" else { return }
        let name = displayName.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !name.isEmpty else { error = AppLocalization.string("Enter your name."); return }
        pending = SaveTimePollRequest(displayName: name, slotIds: selected.sorted())
        saved = false
        error = nil
        guard !saving else { return }
        saving = true
        let generation = session.authorizationGeneration
        let userID = session.currentUser?.id
        // Keep a serial queue alive after the sheet closes. The newest drag wins.
        Task {
            defer { saving = false }
            while let request = pending {
                guard session.authorizationGeneration == generation, session.currentUser?.id == userID else { pending = nil; return }
                pending = nil
                do {
                    let result: APIEnvelope<NativeTimePoll> = try await session.sendAuthorized(
                        "/api/v1/time-polls/\(token)/response", method: .put, body: request
                    )
                    guard session.authorizationGeneration == generation, session.currentUser?.id == userID else { pending = nil; return }
                    poll = result.data
                    saved = pending == nil
                    if saved { NotificationCenter.default.post(name: .sideSeatPlansNeedsRefresh, object: nil) }
                } catch {
                    guard session.authorizationGeneration == generation, session.currentUser?.id == userID else { pending = nil; return }
                    self.error = error.localizedDescription
                    saved = false
                    // Preserve the latest draft for an explicit retry.
                    if pending == nil { pending = request }
                    break
                }
            }
        }
    }
}
