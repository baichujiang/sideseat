import Foundation
import Observation

@MainActor
@Observable
final class WeeklyIntentStore {
    private(set) var intents: [NativeWeeklyIntent] = []
    private(set) var isLoading = false
    private(set) var isCreating = false
    private(set) var mutatingIDs: Set<String> = []
    private(set) var issue: String?

    var isMutating: Bool { isCreating || !mutatingIDs.isEmpty }

    func load(using session: SessionStore) async {
        guard !isLoading else { return }
        isLoading = true
        issue = nil
        defer { isLoading = false }

        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("--ui-testing-weekly-intent") {
            intents = []
            if ProcessInfo.processInfo.arguments.contains("--ui-testing-discovery-published") {
                intents = [NativeWeeklyIntent(id: "ui-published-intent", topic: .coffee, activityText: AppLocalization.string("Coffee"),
                    sportTag: nil, sportOtherNote: nil, togetherMode: .sameActivity, studyGoal: nil,
                    courseId: nil, course: nil, timeWindows: [], timeZone: "Europe/Berlin", note: nil,
                    status: "ACTIVE", policyVersion: 1, version: 1, expiresAt: Date().addingTimeInterval(86400),
                    pausedAt: nil, endedAt: nil, createdAt: Date(), updatedAt: Date(),
                    timePreference: NativeIntentTimePreference(kind: "UNDECIDED"), automaticMatching: true)]
            }
            return
        }
        #endif

        do {
            let response: APIEnvelope<NativeWeeklyIntentPayload> = try await session.sendAuthorized(
                "api/v1/me/weekly-intents"
            )
            intents = response.data.intents
        } catch is CancellationError {
            return
        } catch {
            issue = error.localizedDescription
        }
    }

    func save(
        intent existingIntent: NativeWeeklyIntent?,
        topic: NativeWeeklyIntentTopic,
        activityText: String,
        sportTag: NativeSportTag?,
        sportOtherNote: String,
        togetherMode: NativeTogetherMode,
        studyGoal: String,
        courseId: String?,
        timeWindows: [NativeWeeklyIntentTimeWindow],
        timePreference: NativeIntentTimePreference? = nil,
        automaticMatching: Bool = false,
        note: String,
        using session: SessionStore
    ) async -> Bool {
        if let existingIntent {
            guard !mutatingIDs.contains(existingIntent.id) else { return false }
            mutatingIDs.insert(existingIntent.id)
        } else {
            guard !isCreating else { return false }
            isCreating = true
        }
        issue = nil
        defer {
            if let existingIntent {
                mutatingIDs.remove(existingIntent.id)
            } else {
                isCreating = false
            }
        }

        let trimmedNote = note.trimmingCharacters(in: .whitespacesAndNewlines)
        let trimmedActivityText = activityText.trimmingCharacters(in: .whitespacesAndNewlines)
        let submittedActivityText: String? = topic == .study || topic == .sports
            ? nil
            : trimmedActivityText.isEmpty ? nil : trimmedActivityText
        let trimmedSportOtherNote = sportOtherNote.trimmingCharacters(in: .whitespacesAndNewlines)
        let submittedSportTag = topic == .sports ? sportTag : nil
        let submittedSportOtherNote = submittedSportTag == .other && !trimmedSportOtherNote.isEmpty
            ? trimmedSportOtherNote
            : nil
        let submittedTogetherDetails = NativeTogetherIntentDetails.normalized(
            topic: topic,
            togetherMode: togetherMode,
            studyGoal: studyGoal
        )
        let submittedCourseID = NativeWeeklyIntentSubmissionRules.normalizedCourseID(
            topic: topic,
            courseID: courseId
        )
        do {
            let response: APIEnvelope<NativeWeeklyIntentPayload>
            if let existingIntent {
                response = try await session.sendAuthorized(
                    "api/v1/me/weekly-intents/\(existingIntent.id)",
                    method: .patch,
                    body: NativeWeeklyIntentEditRequest(
                        expectedVersion: existingIntent.version,
                        topic: topic,
                        activityText: submittedActivityText,
                        sportTag: submittedSportTag,
                        sportOtherNote: submittedSportOtherNote,
                        togetherMode: submittedTogetherDetails.togetherMode,
                        studyGoal: submittedTogetherDetails.studyGoal,
                        courseId: submittedCourseID,
                        timeWindows: timeWindows,
                        timeZone: TimeZone.current.identifier,
                        note: trimmedNote.isEmpty ? nil : trimmedNote,
                        timePreference: timePreference,
                        automaticMatching: automaticMatching ? true : nil
                    ),
                    idempotencyKey: UUID().uuidString
                )
            } else {
                response = try await session.sendAuthorized(
                    "api/v1/me/weekly-intents",
                    method: .post,
                    body: NativeWeeklyIntentCreateRequest(
                        topic: topic,
                        activityText: submittedActivityText,
                        sportTag: submittedSportTag,
                        sportOtherNote: submittedSportOtherNote,
                        togetherMode: submittedTogetherDetails.togetherMode,
                        studyGoal: submittedTogetherDetails.studyGoal,
                        courseId: submittedCourseID,
                        timeWindows: timeWindows,
                        timeZone: TimeZone.current.identifier,
                        note: trimmedNote.isEmpty ? nil : trimmedNote,
                        timePreference: timePreference,
                        automaticMatching: automaticMatching ? true : nil
                    ),
                    idempotencyKey: UUID().uuidString
                )
            }
            if let changedIntent = response.data.intent {
                upsert(changedIntent)
            }
            await load(using: session)
            return true
        } catch {
            issue = error.localizedDescription
            return false
        }
    }

    func setPaused(
        _ paused: Bool,
        intent: NativeWeeklyIntent,
        extend: Bool = false,
        automaticMatching: Bool = false,
        using session: SessionStore
    ) async -> Bool {
        guard !mutatingIDs.contains(intent.id) else { return false }
        mutatingIDs.insert(intent.id)
        issue = nil
        defer { mutatingIDs.remove(intent.id) }
        do {
            let response: APIEnvelope<NativeWeeklyIntentPayload> = try await session.sendAuthorized(
                "api/v1/me/weekly-intents/\(intent.id)",
                method: .patch,
                body: NativeWeeklyIntentStateRequest(
                    action: extend ? "EXTEND" : paused ? "PAUSE" : "RESUME",
                    expectedVersion: intent.version,
                    automaticMatching: !paused && !extend && automaticMatching ? true : nil
                ),
                idempotencyKey: UUID().uuidString
            )
            if let changedIntent = response.data.intent {
                upsert(changedIntent)
            }
            await load(using: session)
            return true
        } catch {
            issue = error.localizedDescription
            return false
        }
    }

    func end(
        _ intent: NativeWeeklyIntent,
        using session: SessionStore
    ) async -> Bool {
        guard !mutatingIDs.contains(intent.id) else { return false }
        mutatingIDs.insert(intent.id)
        issue = nil
        defer { mutatingIDs.remove(intent.id) }
        do {
            let response: APIEnvelope<NativeWeeklyIntentPayload> = try await session.sendAuthorized(
                "api/v1/me/weekly-intents/\(intent.id)",
                method: .delete,
                body: NativeWeeklyIntentEndRequest(expectedVersion: intent.version),
                idempotencyKey: UUID().uuidString
            )
            if let changedIntent = response.data.intent, changedIntent.status == "ENDED" {
                intents.removeAll { $0.id == changedIntent.id }
            } else {
                intents.removeAll { $0.id == intent.id }
            }
            await load(using: session)
            return true
        } catch {
            issue = error.localizedDescription
            return false
        }
    }

    private func upsert(_ intent: NativeWeeklyIntent) {
        if intent.status == "ENDED" || intent.status == "EXPIRED" {
            intents.removeAll { $0.id == intent.id }
        } else if let index = intents.firstIndex(where: { $0.id == intent.id }) {
            intents[index] = intent
        } else {
            intents.append(intent)
        }
    }
}

@MainActor
@Observable
final class TogetherMatchingSessionStore {
    private(set) var session: NativeTogetherMatchingSession = .idle
    private(set) var hasLoaded = false
    private(set) var isLoading = false
    private(set) var isMutating = false
    private(set) var issue: String?

    func load(using userSession: SessionStore) async {
        guard !isLoading else { return }
        isLoading = true
        issue = nil
        defer {
            isLoading = false
            hasLoaded = true
        }

        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("--ui-testing-together-matching-active") {
            let now = Date()
            session = NativeTogetherMatchingSession(
                state: .matching,
                startedAt: now.ISO8601Format(),
                matchingUntil: now.addingTimeInterval(48 * 60 * 60).ISO8601Format(),
                stoppedAt: nil,
                version: 1
            )
            return
        }
        if ProcessInfo.processInfo.arguments.contains("--ui-testing-together-matching") {
            session = .idle
            return
        }
        #endif

        _ = await refreshSession(using: userSession)
    }

    func start(using userSession: SessionStore) async -> Bool {
        guard !isMutating else { return false }
        isMutating = true
        issue = nil
        defer {
            isMutating = false
            hasLoaded = true
        }

        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("--ui-testing-together-matching") {
            let now = Date()
            session = NativeTogetherMatchingSession(
                state: .matching,
                startedAt: now.ISO8601Format(),
                matchingUntil: now.addingTimeInterval(48 * 60 * 60).ISO8601Format(),
                stoppedAt: nil,
                version: session.version + 1
            )
            return true
        }
        #endif

        do {
            let response: APIEnvelope<NativeTogetherMatchingSession> =
                try await userSession.sendAuthorized(
                    "api/v1/me/together-matching-session",
                    method: .post,
                    idempotencyKey: UUID().uuidString
                )
            session = response.data
            return true
        } catch is CancellationError {
            // The server may have accepted the write before its response was
            // cancelled. Read the state once; never replay the start mutation.
            guard !Task.isCancelled else { return false }
            let refreshed = await refreshSession(using: userSession)
            return refreshed && session.isMatching(at: Date())
        } catch {
            issue = error.localizedDescription
            return false
        }
    }

    func stop(using userSession: SessionStore) async -> Bool {
        guard !isMutating else { return false }
        isMutating = true
        issue = nil
        defer {
            isMutating = false
            hasLoaded = true
        }

        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("--ui-testing-together-matching") {
            session = NativeTogetherMatchingSession(
                state: .idle,
                startedAt: session.startedAt,
                matchingUntil: session.matchingUntil,
                stoppedAt: Date().ISO8601Format(),
                version: session.version + 1
            )
            return true
        }
        #endif

        do {
            let response: APIEnvelope<NativeTogetherMatchingSession> =
                try await userSession.sendAuthorized(
                    "api/v1/me/together-matching-session",
                    method: .delete,
                    idempotencyKey: UUID().uuidString
                )
            session = response.data
            return true
        } catch is CancellationError {
            guard !Task.isCancelled else { return false }
            let refreshed = await refreshSession(using: userSession)
            return refreshed && !session.isMatching(at: Date())
        } catch {
            issue = error.localizedDescription
            return false
        }
    }

    private func refreshSession(using userSession: SessionStore) async -> Bool {
        do {
            let response: APIEnvelope<NativeTogetherMatchingSession> =
                try await userSession.sendAuthorized("api/v1/me/together-matching-session")
            session = response.data
            return true
        } catch is CancellationError {
            return false
        } catch {
            issue = error.localizedDescription
            return false
        }
    }
}
