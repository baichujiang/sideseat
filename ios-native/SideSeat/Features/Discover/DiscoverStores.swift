import Foundation
import Observation

@MainActor
@Observable
final class DiscoverFeedStore {
    private struct FeedContext: Equatable {
        let city: String
        let query: String
    }

    private(set) var payload: NativeDiscoverFeed?
    private(set) var isLoading = false
    private(set) var issue: String?
    private var latestRequestID: UUID?
    private var payloadContext: FeedContext?

    func load(using session: SessionStore, query: String = "") async {
        let requestID = UUID()
        latestRequestID = requestID
        let trimmedQuery = query.trimmingCharacters(in: .whitespacesAndNewlines)
        isLoading = true
        issue = nil
        defer {
            if latestRequestID == requestID { isLoading = false }
        }

        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("--ui-testing-authenticated") {
            guard latestRequestID == requestID else { return }
            let fixture = UITestingDiscoverFixture.feed
            let needle = trimmedQuery.lowercased()
            payload = NativeDiscoverFeed(
                city: fixture.city,
                buddies: needle.isEmpty
                    ? fixture.buddies
                    : fixture.buddies.filter { ($0.title + " " + ($0.body ?? "")).lowercased().contains(needle) },
                activities: needle.isEmpty
                    ? fixture.activities
                    : fixture.activities.filter { ($0.title + " " + ($0.description ?? "")).lowercased().contains(needle) }
            )
            payloadContext = FeedContext(city: fixture.city, query: trimmedQuery)
            return
        }
        #endif

        await DiscoverCityPreferenceStore.shared.refreshConfig(using: session)
        guard latestRequestID == requestID else { return }
        let city = DiscoverCityPreferenceStore.shared.selectedCity
        let requestContext = FeedContext(city: city, query: trimmedQuery)

        do {
            var queryItems = [URLQueryItem(name: "city", value: city)]
            if !trimmedQuery.isEmpty { queryItems.append(URLQueryItem(name: "q", value: trimmedQuery)) }
            let response: APIEnvelope<NativeDiscoverFeed> = try await session.sendAuthorized(
                "api/v1/discover",
                queryItems: queryItems
            )
            guard latestRequestID == requestID else { return }
            payload = response.data
            payloadContext = requestContext
        } catch is CancellationError {
            return
        } catch {
            guard latestRequestID == requestID else { return }
            if payloadContext != requestContext {
                payload = nil
                payloadContext = nil
            }
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
                posts: fixture.buddies + [.uiTestingSchoolChangedFixture],
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
            updatePost(id: postID) {
                $0.withStatus(
                    "CLOSED",
                    closureReason: "AUTHOR_CLOSED",
                    closedAt: Date()
                )
            }
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
    private(set) var savedPostID: String?

    func createBuddy(
        category: String = "OTHER",
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
        existingImageURLs: [String] = [],
        images: [NativeDiscoverBuddyImageDraft] = [],
        using session: SessionStore
    ) async -> Bool {
        savedPostID = nil
        let trimmedTitle = title.trimmingCharacters(in: .whitespacesAndNewlines)
        let trimmedBody = body.trimmingCharacters(in: .whitespacesAndNewlines).nilIfEmpty

        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("--ui-testing-authenticated") {
            savedPostID = UITestingDiscoverFixture.prependBuddy(
                category: category,
                title: trimmedTitle,
                body: trimmedBody,
                visibility: visibility,
                expiresAt: expiresAt
            )
            return true
        }
        #endif

        return await save(using: session) {
            let uploadedImageURLs = try await uploadBuddyImages(images, using: session)
            let imageUrls = Array((existingImageURLs + uploadedImageURLs).prefix(3))
            await DiscoverCityPreferenceStore.shared.refreshConfig(using: session)
            let request = NativeDiscoverBuddyRequest(
                category: category,
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
            let response: APIEnvelope<NativeDiscoverBuddyCreation> = try await session.sendAuthorized(
                "api/v1/discover/posts",
                method: .post,
                body: request,
                idempotencyKey: UUID().uuidString
            )
            self.savedPostID = response.data.postId
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
        savedPostID = nil
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
            savedPostID = post.id
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
                category: nil,
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
            self.savedPostID = post.id
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
    private(set) var questionTotal = 0
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
            questions = [
                NativeDiscoverPostQuestion(
                    id: "ui-post-comment",
                    body: "Is it okay if I join after class?",
                    createdAt: "2026-08-12T14:00:00Z",
                    isOwn: true,
                    canDelete: true,
                    canReply: false,
                    author: NativeDiscoverQuestionAuthor(
                        id: "ui-test-user",
                        displayName: "Test User",
                        avatarUrl: nil,
                        school: "TUM",
                        verifiedStudent: true
                    ),
                    reply: NativeDiscoverPostReply(
                        id: "ui-post-reply",
                        body: "Yes, just send me a message when you arrive.",
                        createdAt: "2026-08-12T14:05:00Z",
                        isOwn: false,
                        canDelete: false,
                        author: NativeDiscoverQuestionAuthor(
                            id: post.author.id,
                            displayName: post.author.displayName,
                            avatarUrl: post.author.avatarUrl,
                            school: post.author.school,
                            verifiedStudent: post.author.verifiedStudent
                        )
                    )
                )
            ]
            questionTotal = questions.count
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
            return
        }
        #endif

        do {
            let response: APIEnvelope<NativeDiscoverQuestionList> = try await session.sendAuthorized(
                "api/v1/discover/posts/\(postID)/questions"
            )
            questions = response.data.questions
            questionTotal = response.data.total
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
            guard let user = session.currentUser else { return false }
            let author = NativeDiscoverQuestionAuthor(
                id: user.id,
                displayName: user.displayName,
                avatarUrl: user.avatarUrl,
                school: user.school,
                verifiedStudent: user.verifiedStudent
            )
            if let parentID,
               let index = questions.firstIndex(where: { $0.id == parentID }) {
                let reply = NativeDiscoverPostReply(
                    id: "ui-post-reply-\(UUID().uuidString)",
                    body: trimmed,
                    createdAt: Date().formatted(.iso8601),
                    isOwn: true,
                    canDelete: true,
                    author: author
                )
                questions[index] = questions[index].replacingReply(reply, canReply: false)
            } else {
                questions.insert(
                    NativeDiscoverPostQuestion(
                        id: "ui-post-comment-\(UUID().uuidString)",
                        body: trimmed,
                        createdAt: Date().formatted(.iso8601),
                        isOwn: true,
                        canDelete: true,
                        canReply: false,
                        author: author,
                        reply: nil
                    ),
                    at: 0
                )
                questionTotal += 1
            }
            return true
        }
        #endif

        do {
            let response: APIEnvelope<NativeDiscoverQuestionMutation> = try await session.sendAuthorized(
                "api/v1/discover/posts/\(postID)/questions",
                method: .post,
                body: NativeDiscoverQuestionWriteRequest(body: trimmed, parentId: parentID),
                idempotencyKey: UUID().uuidString
            )
            upsertQuestionThread(response.data.thread)
            if parentID == nil {
                questionTotal += 1
            }
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

        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("--ui-testing-authenticated") {
            if let index = questions.firstIndex(where: { $0.reply?.id == commentID }) {
                questions[index] = questions[index].replacingReply(
                    nil,
                    canReply: detail?.post.isOwn == true
                )
            } else {
                questions.removeAll { $0.id == commentID }
                questionTotal = max(0, questionTotal - 1)
            }
            return
        }
        #endif

        do {
            let response: APIEnvelope<NativeDiscoverQuestionDeletion> = try await session.sendAuthorized(
                "api/v1/discover/posts/\(postID)/questions/\(commentID)",
                method: .delete,
                idempotencyKey: UUID().uuidString
            )
            applyQuestionDeletion(response.data)
        } catch {
            questionIssue = error.localizedDescription
        }
    }

    private func upsertQuestionThread(_ thread: NativeDiscoverPostQuestion) {
        questions.removeAll { $0.id == thread.id }
        questions.append(thread)
        questions.sort { ($0.createdDate ?? .distantPast) > ($1.createdDate ?? .distantPast) }
    }

    private func applyQuestionDeletion(_ deletion: NativeDiscoverQuestionDeletion) {
        if deletion.deletedReply,
           let index = questions.firstIndex(where: { $0.id == deletion.threadId }) {
            questions[index] = questions[index].replacingReply(
                nil,
                canReply: detail?.post.isOwn == true
            )
        } else {
            questions.removeAll { $0.id == deletion.threadId }
            questionTotal = max(0, questionTotal - 1)
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
                post: current.post.withStatus(
                    "CLOSED",
                    closureReason: "AUTHOR_CLOSED",
                    closedAt: Date()
                ),
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
    private(set) var messages: [NativeDiscoverPostQuestion] = []
    private(set) var messageTotal = 0
    private(set) var isLoading = false
    private(set) var isMutating = false
    private(set) var isLoadingMessages = false
    private(set) var isMutatingMessage = false
    private(set) var issue: String?
    private(set) var messageIssue: String?

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
            messages = [
                NativeDiscoverPostQuestion(
                    id: "ui-activity-message",
                    body: "Should I bring anything?",
                    createdAt: "2026-08-12T14:00:00Z",
                    isOwn: true,
                    canDelete: true,
                    canReply: false,
                    author: NativeDiscoverQuestionAuthor(
                        id: "ui-peer",
                        displayName: "Mina",
                        avatarUrl: nil,
                        school: "TUM",
                        verifiedStudent: true
                    ),
                    reply: NativeDiscoverPostReply(
                        id: "ui-activity-reply",
                        body: "Nothing special. I have reserved the table.",
                        createdAt: "2026-08-12T14:05:00Z",
                        isOwn: false,
                        canDelete: false,
                        author: NativeDiscoverQuestionAuthor(
                            id: activity.organizer.id,
                            displayName: activity.organizer.displayName,
                            avatarUrl: activity.organizer.avatarUrl,
                            school: activity.school,
                            verifiedStudent: true
                        )
                    )
                )
            ]
            messageTotal = messages.count
            return
        }
        #endif

        do {
            let response: APIEnvelope<NativeDiscoverActivityDetail> = try await session.sendAuthorized(
                "api/v1/discover/activities/\(activityID)"
            )
            detail = response.data
            await loadMessages(activityID: activityID, using: session)
        } catch {
            issue = error.localizedDescription
        }
    }

    func loadMessages(activityID: String, using session: SessionStore) async {
        guard !isLoadingMessages else { return }
        isLoadingMessages = true
        messageIssue = nil
        defer { isLoadingMessages = false }

        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("--ui-testing-authenticated") {
            return
        }
        #endif

        do {
            let response: APIEnvelope<NativeDiscoverMessageList> = try await session.sendAuthorized(
                "api/v1/discover/activities/\(activityID)/messages"
            )
            messages = response.data.messages
            messageTotal = response.data.total
        } catch {
            messageIssue = error.localizedDescription
        }
    }

    @discardableResult
    func submitMessage(
        body: String,
        parentID: String? = nil,
        activityID: String,
        using session: SessionStore
    ) async -> Bool {
        let trimmed = body.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty, !isMutatingMessage else { return false }
        isMutatingMessage = true
        messageIssue = nil
        defer { isMutatingMessage = false }

        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("--ui-testing-authenticated") {
            guard let user = session.currentUser else { return false }
            let author = NativeDiscoverQuestionAuthor(
                id: user.id,
                displayName: user.displayName,
                avatarUrl: user.avatarUrl,
                school: user.school,
                verifiedStudent: user.verifiedStudent
            )
            if let parentID,
               let index = messages.firstIndex(where: { $0.id == parentID }) {
                let reply = NativeDiscoverPostReply(
                    id: "ui-activity-reply-\(UUID().uuidString)",
                    body: trimmed,
                    createdAt: Date().formatted(.iso8601),
                    isOwn: true,
                    canDelete: true,
                    author: author
                )
                messages[index] = messages[index].replacingReply(reply, canReply: false)
            } else {
                messages.insert(
                    NativeDiscoverPostQuestion(
                        id: "ui-activity-comment-\(UUID().uuidString)",
                        body: trimmed,
                        createdAt: Date().formatted(.iso8601),
                        isOwn: true,
                        canDelete: true,
                        canReply: false,
                        author: author,
                        reply: nil
                    ),
                    at: 0
                )
                messageTotal += 1
            }
            return true
        }
        #endif

        do {
            let response: APIEnvelope<NativeDiscoverMessageMutation> = try await session.sendAuthorized(
                "api/v1/discover/activities/\(activityID)/messages",
                method: .post,
                body: NativeDiscoverQuestionWriteRequest(body: trimmed, parentId: parentID),
                idempotencyKey: UUID().uuidString
            )
            upsertMessageThread(response.data.thread)
            if parentID == nil {
                messageTotal += 1
            }
            return true
        } catch {
            messageIssue = error.localizedDescription
            return false
        }
    }

    func deleteMessage(
        commentID: String,
        activityID: String,
        using session: SessionStore
    ) async {
        guard !isMutatingMessage else { return }
        isMutatingMessage = true
        messageIssue = nil
        defer { isMutatingMessage = false }

        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("--ui-testing-authenticated") {
            if let index = messages.firstIndex(where: { $0.reply?.id == commentID }) {
                messages[index] = messages[index].replacingReply(
                    nil,
                    canReply: detail?.activity.isOrganizer == true
                )
            } else {
                messages.removeAll { $0.id == commentID }
                messageTotal = max(0, messageTotal - 1)
            }
            return
        }
        #endif

        do {
            let response: APIEnvelope<NativeDiscoverQuestionDeletion> = try await session.sendAuthorized(
                "api/v1/discover/activities/\(activityID)/messages/\(commentID)",
                method: .delete,
                idempotencyKey: UUID().uuidString
            )
            applyMessageDeletion(response.data)
        } catch {
            messageIssue = error.localizedDescription
        }
    }

    private func upsertMessageThread(_ thread: NativeDiscoverPostQuestion) {
        messages.removeAll { $0.id == thread.id }
        messages.append(thread)
        messages.sort { ($0.createdDate ?? .distantPast) > ($1.createdDate ?? .distantPast) }
    }

    private func applyMessageDeletion(_ deletion: NativeDiscoverQuestionDeletion) {
        if deletion.deletedReply,
           let index = messages.firstIndex(where: { $0.id == deletion.threadId }) {
            messages[index] = messages[index].replacingReply(
                nil,
                canReply: detail?.activity.isOrganizer == true
            )
        } else {
            messages.removeAll { $0.id == deletion.threadId }
            messageTotal = max(0, messageTotal - 1)
        }
    }

    func reportMessage(
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
                    reportedUserId: authorID,
                    discoverActivityCommentId: commentID,
                    reason: reason,
                    details: details
                )
            )
            return nil
        } catch {
            return error.localizedDescription
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
