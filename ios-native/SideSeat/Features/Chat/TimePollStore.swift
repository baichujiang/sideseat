import Foundation
import Observation

@MainActor @Observable
final class TimePollStore {
    let token: String
    private(set) var poll: NativeTimePoll?
    var selected = Set<Int>() { didSet { if selected != oldValue { draftDidChange() } } }
    var displayName = "" { didSet { if displayName != oldValue { draftDidChange() } } }
    private(set) var saving = false
    private(set) var submissionFailed = false
    private(set) var error: String?
    private(set) var acting = false
    private(set) var restoredDraft = false
    private let draftDefaults: UserDefaults?
    private var draftKey: String?
    private var hydratedDraft = false
    private var applyingSnapshot = false
    private struct Draft: Codable, Equatable {
        let version: Int
        let displayName: String
        let slotIds: [Int]
    }
    private var restoredIntent = false
    private var edited = false
    private var revision = 0
    private var refreshID = UUID()
    var hasChanges: Bool {
        guard let poll else { return false }
        return restoredIntent || (!poll.didRespond && edited) || selected != Set(poll.mySlotIds)
            || displayName.trimmingCharacters(in: .whitespacesAndNewlines) != poll.myDisplayName
    }
    var saved: Bool { !saving && poll?.didRespond == true && !hasChanges }
    var canMutate: Bool { !acting && !saving }

    private func draftDidChange() {
        guard !applyingSnapshot else { return }
        revision += 1; edited = true
        persistDraft()
        if submissionFailed { submissionFailed = false; error = nil }
    }

    func showError(_ error: Error) { self.error = error.localizedDescription }
    func chooseNoFreeTime() {
        if selected.isEmpty { draftDidChange() } else { selected = [] }
        error = nil
    }

    private func bindDraft(session: SessionStore) {
        let key = session.currentUser.map { "plan.availability-draft.v1.\($0.id).\(token)" }
        guard key != draftKey else { return }
        if draftKey != nil {
            applyingSnapshot = true
            poll = nil; selected = []; displayName = ""; edited = false; restoredIntent = false
            applyingSnapshot = false
        }
        draftKey = key; hydratedDraft = false; restoredDraft = false
        restoreDraft()
    }

    private func restoreDraft() {
        guard !hydratedDraft, let poll, let draftKey else { return }
        hydratedDraft = true
        guard let data = draftDefaults?.data(forKey: draftKey),
              let draft = try? JSONDecoder().decode(Draft.self, from: data), draft.version == 1 else { return }
        let validIds = Set(poll.slots.map(\.id))
        applyingSnapshot = true
        selected = Set(draft.slotIds).intersection(validIds); displayName = draft.displayName
        applyingSnapshot = false
        edited = true; restoredIntent = true; revision += 1; restoredDraft = true
    }

    private func persistDraft() {
        guard hydratedDraft, let draftKey, let draftDefaults else { return }
        if hasChanges || (saving && edited) {
            let draft = Draft(version: 1, displayName: displayName.trimmingCharacters(in: .whitespacesAndNewlines), slotIds: selected.sorted())
            if let data = try? JSONEncoder().encode(draft) { draftDefaults.set(data, forKey: draftKey) }
        } else { draftDefaults.removeObject(forKey: draftKey) }
    }

    init(token: String, poll: NativeTimePoll? = nil, draftDefaults: UserDefaults? = .standard) {
        self.token = token; self.draftDefaults = draftDefaults
        if let poll { accept(poll) }
    }

    func setAvailabilityDraft(_ selection: Set<Int>, session: SessionStore) {
        bindDraft(session: session)
        selected = selection
    }

    @discardableResult
    func load(session: SessionStore) async -> Bool {
        bindDraft(session: session)
        guard !saving && !acting else { return false }
        let generation = session.authorizationGeneration
        let currentRevision = revision
        let request = UUID()
        refreshID = request
        do {
            let response: APIEnvelope<NativeTimePoll> = try await session.sendAuthorized("/api/v1/time-polls/\(token)")
            guard generation == session.authorizationGeneration,
                  request == refreshID, !saving, !acting else { return false }
            if hasChanges || currentRevision != revision { poll = response.data }
            else { accept(response.data) }
            restoreDraft()
            if !submissionFailed { error = nil }
            return true
        } catch {
            if generation == session.authorizationGeneration, currentRevision == revision,
               request == refreshID, !saving, !acting { self.error = error.localizedDescription }
            return false
        }
    }

    func accept(_ value: NativeTimePoll) {
        applyingSnapshot = true
        defer { applyingSnapshot = false }
        poll = value
        selected = Set(value.mySlotIds)
        displayName = value.myDisplayName
        edited = false; restoredIntent = false; restoredDraft = false
    }

    func mutate<Body: Encodable & Sendable>(_ action: String, method: HTTPMethod = .post, body: Body, session: SessionStore) async {
        bindDraft(session: session)
        guard canMutate else { return }
        revision += 1; refreshID = UUID()
        acting = true; defer { acting = false }
        let generation = session.authorizationGeneration
        let userID = session.currentUser?.id
        do {
            let result: APIEnvelope<NativeTimePoll> = try await session.sendAuthorized("/api/v1/time-polls/\(token)/\(action)", method: method, body: body)
            guard generation == session.authorizationGeneration, userID == session.currentUser?.id else { return }
            if hasChanges { poll = result.data } else { accept(result.data) }; error = nil
            NotificationCenter.default.post(name: .sideSeatPlansNeedsRefresh, object: nil)
            NotificationCenter.default.post(name: .sideSeatCalendarNeedsRefresh, object: nil)
        } catch { self.error = error.localizedDescription }
    }

    func retry(session: SessionStore) async {
        if submissionFailed { await submit(session: session) }
        else { await load(session: session) }
    }

    /// Only this explicit action publishes availability. Later edits remain a separate draft.
    func submit(session: SessionStore) async {
        bindDraft(session: session)
        guard !saving, !acting, hasChanges, poll?.planningPhase == "COLLECTING" else { return }
        let name = displayName.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !name.isEmpty else { error = AppLocalization.string("Enter your name."); return }
        let request = SaveTimePollRequest(displayName: name, slotIds: selected.sorted())
        refreshID = UUID()
        let submittedRevision = revision
        let generation = session.authorizationGeneration
        let userID = session.currentUser?.id
        saving = true; submissionFailed = false; error = nil
        defer { saving = false }
        do {
            let result: APIEnvelope<NativeTimePoll> = try await session.sendAuthorized(
                "/api/v1/time-polls/\(token)/response", method: .put, body: request
            )
            guard generation == session.authorizationGeneration, userID == session.currentUser?.id else { return }
            if submittedRevision == revision { accept(result.data) }
            else { poll = result.data }
            if selected.sorted() == request.slotIds && displayName.trimmingCharacters(in: .whitespacesAndNewlines) == request.displayName {
                restoredIntent = false; restoredDraft = false; edited = false
            }
            persistDraft()
            NotificationCenter.default.post(name: .sideSeatPlansNeedsRefresh, object: nil)
        } catch {
            if generation == session.authorizationGeneration, userID == session.currentUser?.id {
                self.error = error.localizedDescription; submissionFailed = true
            }
        }
    }
}
