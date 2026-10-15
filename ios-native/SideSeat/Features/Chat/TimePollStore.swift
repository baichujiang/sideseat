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
    private var pending: SaveTimePollRequest?

    func showError(_ error: Error) { self.error = error.localizedDescription }

    init(token: String, poll: NativeTimePoll? = nil) {
        self.token = token
        if let poll { accept(poll) }
    }

    func load(session: SessionStore) async {
        do {
            let response: APIEnvelope<NativeTimePoll> = try await session.sendAuthorized("/api/v1/time-polls/\(token)")
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

    func save(session: SessionStore) {
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
