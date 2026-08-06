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
final class MyPostsStore {
    private(set) var payload: NativeMyPostsPayload?
    private(set) var isLoading = false
    private(set) var mutatingID: String?
    private(set) var issue: String?

    func load(using session: SessionStore) async {
        guard !isLoading else { return }
        isLoading = true
        issue = nil
        defer { isLoading = false }

        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("--ui-testing-authenticated") {
            let fixture = UITestingDiscoverFixture.feed
            payload = NativeMyPostsPayload(
                posts: fixture.buddies,
                activities: fixture.activities
            )
            return
        }
        #endif

        do {
            let response: APIEnvelope<NativeMyPostsPayload> = try await session.sendAuthorized(
                "api/v1/me/posts"
            )
            payload = response.data
        } catch {
            guard (error as? APIClientError)?.isNotFound == true else {
                issue = error.localizedDescription
                return
            }

            do {
                let response: APIEnvelope<NativeDiscoverFeed> = try await session.sendAuthorized(
                    "api/v1/discover"
                )
                payload = NativeMyPostsPayload(
                    posts: response.data.buddies.filter(\.isOwn),
                    activities: response.data.activities.filter(\.isOrganizer)
                )
            } catch {
                issue = error.localizedDescription
            }
        }
    }

    func closePost(postID: String, using session: SessionStore) async -> Bool {
        guard mutatingID == nil else { return false }
        mutatingID = "post-\(postID)"
        issue = nil
        defer { mutatingID = nil }

        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("--ui-testing-authenticated") {
            updatePost(id: postID) { $0.withStatus("CLOSED") }
            return true
        }
        #endif

        do {
            let response: APIEnvelope<NativeDiscoverBuddyPostAction> = try await session.sendAuthorized(
                "api/v1/discover/posts/\(postID)/status",
                method: .patch,
                body: NativeDiscoverActivityStatusRequest(status: "CLOSED"),
                idempotencyKey: UUID().uuidString
            )
            updatePost(id: postID) { _ in response.data.post }
            return true
        } catch {
            issue = error.localizedDescription
            return false
        }
    }

    func setActivityStatus(
        _ status: String,
        activityID: String,
        using session: SessionStore
    ) async -> Bool {
        guard mutatingID == nil else { return false }
        mutatingID = "activity-\(activityID)"
        issue = nil
        defer { mutatingID = nil }

        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("--ui-testing-authenticated") {
            updateActivity(id: activityID) {
                $0.withSignupStatus(
                    $0.viewerSignupStatus,
                    goingCount: $0.goingCount,
                    status: status,
                    phase: status == "CANCELED" ? "canceled" : "closed"
                )
            }
            return true
        }
        #endif

        do {
            let response: APIEnvelope<NativeDiscoverActivityAction> = try await session.sendAuthorized(
                "api/v1/discover/activities/\(activityID)/status",
                method: .patch,
                body: NativeDiscoverActivityStatusRequest(status: status),
                idempotencyKey: UUID().uuidString
            )
            updateActivity(id: activityID) { _ in response.data.activity }
            return true
        } catch {
            issue = error.localizedDescription
            return false
        }
    }

    private func updatePost(
        id: String,
        transform: (NativeDiscoverBuddyPost) -> NativeDiscoverBuddyPost
    ) {
        guard let payload else { return }
        self.payload = NativeMyPostsPayload(
            posts: payload.posts.map { $0.id == id ? transform($0) : $0 },
            activities: payload.activities
        )
    }

    private func updateActivity(
        id: String,
        transform: (NativeDiscoverActivity) -> NativeDiscoverActivity
    ) {
        guard let payload else { return }
        self.payload = NativeMyPostsPayload(
            posts: payload.posts,
            activities: payload.activities.map { $0.id == id ? transform($0) : $0 }
        )
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
        tags: [String] = [],
        visibility: String = "CITY_INTERNATIONALS",
        replyPreference: String = "DIRECT_MESSAGE",
        courseIds: [String] = [],
        startsAt: Date? = nil,
        endsAt: Date? = nil,
        location: String? = nil,
        capacity: Int? = nil,
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
                tags: tags.isEmpty ? nil : tags,
                visibility: visibility,
                replyPreference: replyPreference,
                courseIds: courseIds.isEmpty ? nil : courseIds,
                startsAt: startsAt?.formatted(.iso8601),
                endsAt: endsAt?.formatted(.iso8601),
                location: location?.trimmingCharacters(in: .whitespacesAndNewlines).nilIfEmpty,
                capacity: capacity,
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

    func updateBuddy(
        post: NativeDiscoverBuddyPost,
        title: String,
        body: String,
        tags: [String],
        visibility: String,
        courseIds: [String],
        startsAt: Date?,
        endsAt: Date?,
        location: String?,
        capacity: Int?,
        expiresAt: Date,
        existingImageURLs: [String],
        images: [NativeDiscoverBuddyImageDraft],
        using session: SessionStore
    ) async -> Bool {
        let trimmedTitle = title.trimmingCharacters(in: .whitespacesAndNewlines)
        let trimmedBody = body.trimmingCharacters(in: .whitespacesAndNewlines).nilIfEmpty

        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("--ui-testing-authenticated") {
            UITestingDiscoverFixture.updateBuddy(
                id: post.id,
                title: trimmedTitle,
                body: trimmedBody,
                tags: tags,
                visibility: visibility,
                startsAt: startsAt,
                endsAt: endsAt,
                location: location?.trimmingCharacters(in: .whitespacesAndNewlines).nilIfEmpty,
                capacity: capacity,
                expiresAt: expiresAt
            )
            return true
        }
        #endif

        return await save(
            using: session,
            methodUnavailableMessage: String(
                localized: "Editing is not available on this server version yet. Please try again shortly."
            )
        ) {
            let uploadedImageURLs = try await uploadBuddyImages(images, using: session)
            let imageURLs = Array((existingImageURLs + uploadedImageURLs).prefix(3))
            let request = NativeDiscoverBuddyRequest(
                city: post.city,
                title: trimmedTitle,
                body: trimmedBody,
                tags: tags,
                visibility: visibility,
                replyPreference: post.replyPreference,
                courseIds: courseIds,
                startsAt: startsAt?.formatted(.iso8601),
                endsAt: endsAt?.formatted(.iso8601),
                location: location?.trimmingCharacters(in: .whitespacesAndNewlines).nilIfEmpty,
                capacity: capacity,
                expiresAt: expiresAt.formatted(.iso8601),
                imageUrls: imageURLs
            )
            let _: APIEnvelope<NativeDiscoverBuddyPostAction> = try await session.sendAuthorized(
                "api/v1/discover/posts/\(post.id)",
                method: .patch,
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
        methodUnavailableMessage: String? = nil,
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
            if let apiError = error as? APIClientError,
               apiError.statusCode == 405,
               let methodUnavailableMessage {
                issue = methodUnavailableMessage
            } else {
                issue = error.localizedDescription
            }
            return false
        }
    }
}

@MainActor
@Observable
final class DiscoverPostDetailStore {
    private(set) var detail: NativeDiscoverBuddyPostDetail?
    private(set) var questions: [NativeDiscoverPostQuestion] = []
    private(set) var isLoading = false
    private(set) var isMutating = false
    private(set) var isLoadingQuestions = false
    private(set) var isMutatingQuestion = false
    private(set) var issue: String?
    private(set) var questionIssue: String?

    func load(postID: String, using session: SessionStore) async {
        isLoading = true
        issue = nil
        defer { isLoading = false }

        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("--ui-testing-authenticated") {
            let post = UITestingDiscoverFixture.feed.buddies.first { $0.id == postID }
                ?? UITestingDiscoverFixture.feed.buddies[0]
            detail = NativeDiscoverBuddyPostDetail(post: post, viewerCanMessage: true)
            questions = []
            return
        }
        #endif

        do {
            let response: APIEnvelope<NativeDiscoverBuddyPostDetail> = try await session.sendAuthorized(
                "api/v1/discover/posts/\(postID)"
            )
            detail = response.data
            await loadQuestions(postID: postID, using: session)
        } catch {
            issue = error.localizedDescription
        }
    }

    func loadQuestions(postID: String, using session: SessionStore) async {
        guard !isLoadingQuestions else { return }
        isLoadingQuestions = true
        questionIssue = nil
        defer { isLoadingQuestions = false }

        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("--ui-testing-authenticated") {
            questions = []
            return
        }
        #endif

        do {
            let response: APIEnvelope<NativeDiscoverQuestionList> = try await session.sendAuthorized(
                "api/v1/discover/posts/\(postID)/questions"
            )
            questions = response.data.questions
        } catch {
            questionIssue = error.localizedDescription
        }
    }

    @discardableResult
    func submitQuestion(
        body: String,
        parentID: String? = nil,
        postID: String,
        using session: SessionStore
    ) async -> Bool {
        let trimmed = body.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty, !isMutatingQuestion else { return false }
        isMutatingQuestion = true
        questionIssue = nil
        defer { isMutatingQuestion = false }

        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("--ui-testing-authenticated") {
            return true
        }
        #endif

        do {
            let _: APIEnvelope<NativeDiscoverQuestionMutation> = try await session.sendAuthorized(
                "api/v1/discover/posts/\(postID)/questions",
                method: .post,
                body: NativeDiscoverQuestionWriteRequest(body: trimmed, parentId: parentID),
                idempotencyKey: UUID().uuidString
            )
            await loadQuestions(postID: postID, using: session)
            return true
        } catch {
            questionIssue = error.localizedDescription
            return false
        }
    }

    func deleteQuestionComment(
        commentID: String,
        postID: String,
        using session: SessionStore
    ) async {
        guard !isMutatingQuestion else { return }
        isMutatingQuestion = true
        questionIssue = nil
        defer { isMutatingQuestion = false }

        do {
            let _: APIEnvelope<NativeDiscoverQuestionDeletion> = try await session.sendAuthorized(
                "api/v1/discover/posts/\(postID)/questions/\(commentID)",
                method: .delete,
                idempotencyKey: UUID().uuidString
            )
            await loadQuestions(postID: postID, using: session)
        } catch {
            questionIssue = error.localizedDescription
        }
    }

    func reportQuestionComment(
        commentID: String,
        authorID: String,
        isOwn: Bool,
        reason: NativeReportReason,
        details: String,
        using session: SessionStore
    ) async -> String? {
        guard !isOwn else {
            return String(localized: "You can't report your own content.")
        }

        do {
            let _: APIEnvelope<NativeReportResult> = try await session.sendAuthorized(
                "api/reports",
                method: .post,
                body: NativeMessageReportRequest(
                    reportedUserId: authorID,
                    classmatePostCommentId: commentID,
                    reason: reason,
                    details: details
                )
            )
            return nil
        } catch {
            return error.localizedDescription
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

    func closePost(postID: String, using session: SessionStore) async -> Bool {
        guard !isMutating else { return false }
        isMutating = true
        issue = nil
        defer { isMutating = false }

        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("--ui-testing-authenticated"), let current = detail {
            detail = NativeDiscoverBuddyPostDetail(
                post: current.post.withStatus("CLOSED"),
                viewerCanMessage: current.viewerCanMessage
            )
            return true
        }
        #endif

        do {
            let response: APIEnvelope<NativeDiscoverBuddyPostAction> = try await session.sendAuthorized(
                "api/v1/discover/posts/\(postID)/status",
                method: .patch,
                body: NativeDiscoverActivityStatusRequest(status: "CLOSED"),
                idempotencyKey: UUID().uuidString
            )
            if let current = detail {
                detail = NativeDiscoverBuddyPostDetail(
                    post: response.data.post,
                    viewerCanMessage: current.viewerCanMessage
                )
            }
            return true
        } catch {
            issue = error.localizedDescription
            return false
        }
    }

    /// Returns `nil` on success, or a displayable error message on failure.
    func reportPost(
        _ post: NativeDiscoverBuddyPost,
        reason: NativeReportReason,
        details: String,
        using session: SessionStore
    ) async -> String? {
        guard !post.isOwn else {
            return String(localized: "You can't report your own post.")
        }

        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("--ui-testing-authenticated") {
            return nil
        }
        #endif

        do {
            let _: APIEnvelope<NativeReportResult> = try await session.sendAuthorized(
                "api/reports",
                method: .post,
                body: NativeMessageReportRequest(
                    reportedUserId: post.author.id,
                    classmatePostId: post.id,
                    reason: reason,
                    details: details
                )
            )
            return nil
        } catch {
            return error.localizedDescription
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
