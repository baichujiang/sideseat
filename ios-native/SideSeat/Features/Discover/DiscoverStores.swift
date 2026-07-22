import Foundation
import Observation

@MainActor
@Observable
final class DiscoverFeedStore {
    private(set) var payload: NativeDiscoverFeed?
    private(set) var isLoading = false
    private(set) var issue: String?
    private var latestRequestID: UUID?

    func load(using session: SessionStore, query: String = "") async {
        let requestID = UUID()
        latestRequestID = requestID
        isLoading = true
        issue = nil
        defer {
            if latestRequestID == requestID { isLoading = false }
        }

        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("--ui-testing-authenticated") {
            guard latestRequestID == requestID else { return }
            let fixture = UITestingDiscoverFixture.feed
            let needle = query.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
            payload = NativeDiscoverFeed(
                city: fixture.city,
                buddies: needle.isEmpty
                    ? fixture.buddies
                    : fixture.buddies.filter { ($0.title + " " + ($0.body ?? "")).lowercased().contains(needle) },
                activities: needle.isEmpty
                    ? fixture.activities
                    : fixture.activities.filter { ($0.title + " " + ($0.description ?? "")).lowercased().contains(needle) }
            )
            return
        }
        #endif

        do {
            await DiscoverCityPreferenceStore.shared.refreshConfig(using: session)
            let city = DiscoverCityPreferenceStore.shared.selectedCity
            var queryItems = [URLQueryItem(name: "city", value: city)]
            let trimmed = query.trimmingCharacters(in: .whitespacesAndNewlines)
            if !trimmed.isEmpty { queryItems.append(URLQueryItem(name: "q", value: trimmed)) }
            let response: APIEnvelope<NativeDiscoverFeed> = try await session.sendAuthorized(
                "api/v1/discover",
                queryItems: queryItems
            )
            guard latestRequestID == requestID else { return }
            payload = response.data
        } catch is CancellationError {
            return
        } catch {
            guard latestRequestID == requestID else { return }
            issue = error.localizedDescription
        }
    }
}

@MainActor
@Observable
final class DiscoverCreateStore {
    private(set) var isSaving = false
    private(set) var issue: String?

    func createBuddy(
        title: String,
        body: String,
        expiresAt: Date,
        images: [NativeDiscoverBuddyImageDraft] = [],
        using session: SessionStore
    ) async -> Bool {
        let trimmedTitle = title.trimmingCharacters(in: .whitespacesAndNewlines)
        let trimmedBody = body.trimmingCharacters(in: .whitespacesAndNewlines).nilIfEmpty

        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("--ui-testing-authenticated") {
            UITestingDiscoverFixture.prependBuddy(
                title: trimmedTitle,
                body: trimmedBody,
                expiresAt: expiresAt
            )
            return true
        }
        #endif

        return await save(using: session) {
            let imageUrls = try await uploadBuddyImages(images, using: session)
            await DiscoverCityPreferenceStore.shared.refreshConfig(using: session)
            let request = NativeDiscoverBuddyRequest(
                city: DiscoverCityPreferenceStore.shared.selectedCity,
                title: trimmedTitle,
                body: trimmedBody,
                expiresAt: expiresAt.formatted(.iso8601),
                imageUrls: imageUrls.isEmpty ? nil : imageUrls
            )
            let _: APIEnvelope<NativeDiscoverBuddyCreation> = try await session.sendAuthorized(
                "api/v1/discover/posts",
                method: .post,
                body: request,
                idempotencyKey: UUID().uuidString
            )
        }
    }

    private func uploadBuddyImages(
        _ images: [NativeDiscoverBuddyImageDraft],
        using session: SessionStore
    ) async throws -> [String] {
        var urls: [String] = []
        for image in images.prefix(3) {
            let response: APIEnvelope<NativeDiscoverBuddyImageUpload> = try await session.uploadAuthorized(
                "api/v1/discover/posts/images",
                file: MultipartUploadFile(
                    fieldName: "file",
                    fileName: image.fileName,
                    mimeType: image.mimeType,
                    data: image.data
                ),
                idempotencyKey: UUID().uuidString
            )
            urls.append(response.data.image.url)
        }
        return urls
    }

    func createActivity(
        title: String,
        description: String,
        startAt: Date,
        location: String,
        unlimitedCapacity: Bool,
        capacity: Int,
        using session: SessionStore
    ) async -> Bool {
        let trimmedTitle = title.trimmingCharacters(in: .whitespacesAndNewlines)
        let trimmedDescription = description.trimmingCharacters(in: .whitespacesAndNewlines)
        let trimmedLocation = location.trimmingCharacters(in: .whitespacesAndNewlines)

        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("--ui-testing-authenticated") {
            UITestingDiscoverFixture.prependActivity(
                title: trimmedTitle,
                description: trimmedDescription.nilIfEmpty,
                startAt: startAt,
                location: trimmedLocation,
                unlimitedCapacity: unlimitedCapacity,
                capacity: capacity
            )
            return true
        }
        #endif

        let request = NativeDiscoverActivityRequest(
            title: trimmedTitle,
            description: trimmedDescription,
            startAt: startAt.formatted(.iso8601),
            location: trimmedLocation,
            unlimitedCapacity: unlimitedCapacity,
            capacity: unlimitedCapacity ? nil : capacity
        )
        return await save(using: session) {
            let _: APIEnvelope<NativeDiscoverActivityCreation> = try await session.sendAuthorized(
                "api/v1/discover/activities",
                method: .post,
                body: request,
                idempotencyKey: UUID().uuidString
            )
        }
    }

    private func save(
        using session: SessionStore,
        operation: () async throws -> Void
    ) async -> Bool {
        guard !isSaving else { return false }
        isSaving = true
        issue = nil
        defer { isSaving = false }

        do {
            try await operation()
            return true
        } catch {
            issue = error.localizedDescription
            return false
        }
    }
}

@MainActor
@Observable
final class DiscoverPostDetailStore {
    private(set) var detail: NativeDiscoverBuddyPostDetail?
    private(set) var isLoading = false
    private(set) var isMutating = false
    private(set) var issue: String?

    func load(postID: String, using session: SessionStore) async {
        isLoading = true
        issue = nil
        defer { isLoading = false }

        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("--ui-testing-authenticated") {
            let post = UITestingDiscoverFixture.feed.buddies.first { $0.id == postID }
                ?? UITestingDiscoverFixture.feed.buddies[0]
            detail = NativeDiscoverBuddyPostDetail(post: post, viewerCanMessage: true)
            return
        }
        #endif

        do {
            let response: APIEnvelope<NativeDiscoverBuddyPostDetail> = try await session.sendAuthorized(
                "api/v1/discover/posts/\(postID)"
            )
            detail = response.data
        } catch {
            issue = error.localizedDescription
        }
    }

    func setSaved(_ saved: Bool, postID: String, using session: SessionStore) async {
        guard !isMutating else { return }
        isMutating = true
        issue = nil
        defer { isMutating = false }

        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("--ui-testing-authenticated"), let current = detail {
            let nextCount = max(0, current.post.interestedCount + (saved ? 1 : -1))
            detail = NativeDiscoverBuddyPostDetail(
                post: current.post.withSaved(saved, interestedCount: nextCount),
                viewerCanMessage: current.viewerCanMessage
            )
            return
        }
        #endif

        do {
            let response: APIEnvelope<NativeDiscoverBuddyPostSaveResult> = try await session.sendAuthorized(
                "api/v1/discover/posts/\(postID)/saved",
                method: saved ? .post : .delete,
                idempotencyKey: UUID().uuidString
            )
            if let current = detail {
                detail = NativeDiscoverBuddyPostDetail(
                    post: current.post.withSaved(
                        response.data.savedByViewer,
                        interestedCount: response.data.interestedCount
                    ),
                    viewerCanMessage: current.viewerCanMessage
                )
            }
        } catch {
            issue = error.localizedDescription
        }
    }
}

@MainActor
@Observable
final class DiscoverActivityDetailStore {
    private(set) var detail: NativeDiscoverActivityDetail?
    private(set) var isLoading = false
    private(set) var isMutating = false
    private(set) var issue: String?

    func load(activityID: String, using session: SessionStore) async {
        isLoading = true
        issue = nil
        defer { isLoading = false }

        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("--ui-testing-authenticated") {
            let activity = UITestingDiscoverFixture.feed.activities.first { $0.id == activityID }
                ?? UITestingDiscoverFixture.feed.activities[0]
            detail = NativeDiscoverActivityDetail(
                activity: activity,
                goingAttendees: [
                    NativeDiscoverActivityAttendee(userId: "ui-peer", displayName: "Mina", avatarUrl: nil)
                ],
                viewerHasExistingChat: false,
                calendarEntryId: nil
            )
            return
        }
        #endif

        do {
            let response: APIEnvelope<NativeDiscoverActivityDetail> = try await session.sendAuthorized(
                "api/v1/discover/activities/\(activityID)"
            )
            detail = response.data
        } catch {
            issue = error.localizedDescription
        }
    }

    func setSignup(_ going: Bool, activityID: String, using session: SessionStore) async {
        await mutate(
            activityID: activityID,
            using: session,
            testingUpdate: { activity in
                if activity.viewerSignupStatus == "GOING" {
                    return activity.withSignupStatus(
                        nil,
                        goingCount: max(0, activity.goingCount - 1),
                        status: "OPEN",
                        phase: "bookable"
                    )
                }
                return activity.withSignupStatus(
                    "GOING",
                    goingCount: activity.goingCount + 1,
                    status: activity.status,
                    phase: activity.phase
                )
            }
        ) {
            try await session.sendAuthorized(
                "api/v1/discover/activities/\(activityID)/signup",
                method: going ? .post : .delete,
                idempotencyKey: UUID().uuidString
            ) as APIEnvelope<NativeDiscoverActivityAction>
        }
    }

    func setStatus(_ status: String, activityID: String, using session: SessionStore) async {
        await mutate(
            activityID: activityID,
            using: session,
            testingUpdate: { activity in
                activity.withSignupStatus(
                    activity.viewerSignupStatus,
                    goingCount: activity.goingCount,
                    status: status,
                    phase: status == "CANCELED" ? "canceled" : "closed"
                )
            }
        ) {
            try await session.sendAuthorized(
                "api/v1/discover/activities/\(activityID)/status",
                method: .patch,
                body: NativeDiscoverActivityStatusRequest(status: status),
                idempotencyKey: UUID().uuidString
            ) as APIEnvelope<NativeDiscoverActivityAction>
        }
    }

    func addToCalendar(activityID: String, using session: SessionStore) async {
        guard !isMutating else { return }
        isMutating = true
        issue = nil
        defer { isMutating = false }

        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("--ui-testing-authenticated"), let current = detail {
            detail = NativeDiscoverActivityDetail(
                activity: current.activity,
                goingAttendees: current.goingAttendees,
                viewerHasExistingChat: current.viewerHasExistingChat,
                calendarEntryId: current.calendarEntryId ?? "ui-calendar-entry"
            )
            _ = activityID
            _ = session
            return
        }
        #endif

        do {
            let response: APIEnvelope<NativeDiscoverActivityCalendarResult> = try await session.sendAuthorized(
                "api/v1/discover/activities/\(activityID)/calendar",
                method: .post,
                idempotencyKey: UUID().uuidString
            )
            if let current = detail {
                detail = NativeDiscoverActivityDetail(
                    activity: current.activity,
                    goingAttendees: current.goingAttendees,
                    viewerHasExistingChat: current.viewerHasExistingChat,
                    calendarEntryId: response.data.calendarEntryId
                )
            }
        } catch {
            issue = error.localizedDescription
        }
    }

    private func mutate(
        activityID: String,
        using session: SessionStore,
        testingUpdate: @escaping (NativeDiscoverActivity) -> NativeDiscoverActivity,
        operation: () async throws -> APIEnvelope<NativeDiscoverActivityAction>
    ) async {
        guard !isMutating else { return }
        isMutating = true
        issue = nil
        defer { isMutating = false }

        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("--ui-testing-authenticated"), let current = detail {
            let activity = testingUpdate(current.activity)
            detail = NativeDiscoverActivityDetail(
                activity: activity,
                goingAttendees: current.goingAttendees,
                viewerHasExistingChat: current.viewerHasExistingChat,
                calendarEntryId: current.calendarEntryId
            )
            _ = activityID
            _ = session
            return
        }
        #endif

        do {
            let response = try await operation()
            if let current = detail {
                detail = NativeDiscoverActivityDetail(
                    activity: response.data.activity,
                    goingAttendees: current.goingAttendees,
                    viewerHasExistingChat: current.viewerHasExistingChat,
                    calendarEntryId: current.calendarEntryId
                )
            }
        } catch {
            issue = error.localizedDescription
        }
    }
}

private extension String {
    var nilIfEmpty: String? { isEmpty ? nil : self }
}
