import Foundation
import Observation
import UIKit

@MainActor @Observable
final class TimePollStore {
    let token: String
    private(set) var poll: NativeTimePoll?
    var selected = Set<Int>() { didSet { if selected != oldValue { revision += 1 } } }
    var displayName = "" { didSet { if displayName != oldValue { revision += 1 } } }
    private(set) var saving = false
    private(set) var saved = false
    private(set) var error: String?
    private(set) var acting = false
    var canMutate: Bool { !acting && !saving && pending == nil }
    private var pending: SaveTimePollRequest?
    private var debounceTask: Task<Void, Never>?
    private var saveTask: Task<Void, Never>?
    private var pendingReady = false
    private var draftGeneration: UInt64?
    private var draftUserID: String?
    private var inFlight: SaveTimePollRequest?
    private var revision = 0
    private var refreshID = UUID()

    func showError(_ error: Error) { self.error = error.localizedDescription }

    init(token: String, poll: NativeTimePoll? = nil) {
        self.token = token
        if let poll { accept(poll) }
    }

    func load(session: SessionStore) async {
        guard !saving && !acting && pending == nil else { return }
        let generation = session.authorizationGeneration
        let currentRevision = revision
        let request = UUID()
        refreshID = request
        do {
            let response: APIEnvelope<NativeTimePoll> = try await session.sendAuthorized("/api/v1/time-polls/\(token)")
            guard generation == session.authorizationGeneration,
                  currentRevision == revision, request == refreshID else { return }
            // A refresh must never replace selections that are awaiting acknowledgement.
            if !saving && !acting && pending == nil { accept(response.data); error = nil }
        } catch {
            if generation == session.authorizationGeneration, currentRevision == revision,
               request == refreshID, !saving, !acting { self.error = error.localizedDescription }
        }
    }

    func accept(_ value: NativeTimePoll) {
        poll = value
        selected = Set(value.mySlotIds)
        displayName = value.myDisplayName
        saved = value.didRespond
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

    func save(session: SessionStore) {
        guard poll?.planningPhase == "COLLECTING" else { return }
        let name = displayName.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !name.isEmpty else { error = AppLocalization.string("Enter your name."); return }
        let draft = SaveTimePollRequest(displayName: name, slotIds: selected.sorted())
        if error == nil && (draft == pending || (pending == nil && draft == inFlight)) { return }
        if !saving && pending == nil && poll?.didRespond == true,
           name == poll?.myDisplayName, draft.slotIds == poll?.mySlotIds { return }
        revision += 1
        pending = draft
        draftGeneration = session.authorizationGeneration; draftUserID = session.currentUser?.id
        pendingReady = false
        saved = false; saving = true; error = nil
        debounceTask?.cancel()
        // Each burst of taps (or completed drag) sends only its latest snapshot.
        debounceTask = Task {
            do { try await Task.sleep(for: .milliseconds(700)) } catch { return }
            flush(session: session)
        }
    }

    /// Bypass the quiet period when leaving the screen or retrying a failed save.
    /// Never cancel a write already in flight: the newest snapshot follows it serially.
    func flush(session: SessionStore) {
        debounceTask?.cancel(); debounceTask = nil
        guard pending != nil else { return }
        guard draftGeneration == session.authorizationGeneration, draftUserID == session.currentUser?.id else {
            pending = nil; saved = false; saving = false; return
        }
        pendingReady = true
        guard saveTask == nil else { return }
        saving = true; error = nil
        let generation = session.authorizationGeneration
        let userID = session.currentUser?.id
        let background = UIApplication.shared.beginBackgroundTask(withName: "Save plan availability")
        saveTask = Task {
            defer {
                saveTask = nil; inFlight = nil
                saving = pending != nil && error == nil
                if background != .invalid { UIApplication.shared.endBackgroundTask(background) }
            }
            while pendingReady, let request = pending {
                guard session.authorizationGeneration == generation, session.currentUser?.id == userID else {
                    pending = nil; saved = false; return
                }
                pending = nil; pendingReady = false; inFlight = request
                do {
                    let result: APIEnvelope<NativeTimePoll> = try await session.sendAuthorized(
                        "/api/v1/time-polls/\(token)/response", method: .put, body: request
                    )
                    guard session.authorizationGeneration == generation, session.currentUser?.id == userID else {
                        pending = nil; saved = false; return
                    }
                    poll = result.data
                    saved = pending == nil
                    if saved { NotificationCenter.default.post(name: .sideSeatPlansNeedsRefresh, object: nil) }
                } catch {
                    guard session.authorizationGeneration == generation, session.currentUser?.id == userID else {
                        pending = nil; saved = false; return
                    }
                    self.error = error.localizedDescription; saved = false
                    if pending == nil { pending = request }
                    pendingReady = false
                    debounceTask?.cancel(); debounceTask = nil
                    break
                }
            }
        }
    }
}
