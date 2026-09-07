import Foundation
import Observation

enum ProductFunnelReporter {
    static func record(
        name: String,
        surface: String,
        sourceKind: String,
        sourceID: String,
        metadata: NativeProductFunnelMetadata? = nil,
        using session: SessionStore
    ) async {
        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("--ui-testing-authenticated") { return }
        #endif
        let event = NativeProductFunnelEvent(
            clientEventId: UUID().uuidString,
            name: name,
            surface: surface,
            sourceKind: sourceKind,
            sourceId: sourceID,
            occurredAt: Date().ISO8601Format(),
            metadata: metadata
        )
        let _: APIEnvelope<NativeProductFunnelAcceptance>? = try? await session.sendAuthorized(
            "api/v1/analytics/events",
            method: .post,
            body: NativeProductFunnelBatch(events: [event]),
            idempotencyKey: event.clientEventId
        )
    }
}

@MainActor
@Observable
final class ActionToPlanV2Store {
    static let shared = ActionToPlanV2Store()

    private(set) var assignment: NativeExperimentAssignment?
    private(set) var hasLoadedAssignment = false
    private(set) var isLoadingAssignment = false
    private(set) var assignmentIssue: String?
    private(set) var recommendations: NativeDiscoverRecommendationsPayload?
    private(set) var isLoadingRecommendations = false
    private(set) var issue: String?
    private var loadedUserID: String?
    private var assignmentRequestID: UUID?

    var isTreatmentEnabled: Bool { assignment?.enablesActionToPlan == true }
    var isWeeklyIntentEnabled: Bool {
        assignment?.features["v2WeeklyIntent"] == true
    }
    var isMutualOpportunityEnabled: Bool {
        assignment?.features["v2MutualOpportunity"] == true
    }

    func resetAssignment() {
        resetAssignmentState(for: nil)
        recommendations = nil
        isLoadingRecommendations = false
        issue = nil
    }

    func loadAssignment(using session: SessionStore, force: Bool = false) async {
        let userID = session.currentUser?.id
        if loadedUserID != userID {
            resetAssignmentState(for: userID)
        }

        // A cached identity can make the app shell visible before the access token
        // has finished restoring. That is a waiting state, not an assignment
        // failure, so do not send or cache a request until authorization is ready.
        guard userID != nil, session.canMakeAuthenticatedRequests else { return }

        if !force, loadedUserID == userID, hasLoadedAssignment { return }
        if !force, loadedUserID == userID, isLoadingAssignment { return }

        loadedUserID = userID
        let requestID = UUID()
        assignmentRequestID = requestID
        isLoadingAssignment = true
        assignmentIssue = nil

        defer {
            if assignmentRequestID == requestID {
                isLoadingAssignment = false
            }
        }

        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("--ui-testing-authenticated") {
            let enabled = ProcessInfo.processInfo.arguments.contains("--ui-testing-v2-action-to-plan")
            assignment = NativeExperimentAssignment(
                key: "action_to_plan_v2",
                eligible: enabled,
                variant: enabled ? "TREATMENT" : "CONTROL",
                assignedAt: Date().ISO8601Format(),
                features: [
                    "v2ActionInterest": enabled,
                    "v2PlanInheritance": enabled,
                    "v2SocialPreferences": enabled,
                    "v2WeeklyIntent": ProcessInfo.processInfo.arguments.contains("--ui-testing-weekly-intent"),
                    "v2MutualOpportunity": ProcessInfo.processInfo.arguments.contains("--ui-testing-mutual-opportunity")
                        || ProcessInfo.processInfo.arguments.contains("--ui-testing-mutual-opportunity-empty"),
                    "v2Recommendations": enabled,
                    "v2SmallGroupPilot": enabled,
                ]
            )
            hasLoadedAssignment = true
            return
        }
        #endif

        do {
            let response: APIEnvelope<NativeExperimentsPayload> = try await session.sendAuthorized(
                "api/v1/me/experiments"
            )
            guard assignmentRequestID == requestID, loadedUserID == userID else { return }
            assignment = response.data.experiments.first { $0.key == "action_to_plan_v2" }
            hasLoadedAssignment = true
        } catch is CancellationError {
            return
        } catch {
            guard assignmentRequestID == requestID, loadedUserID == userID else { return }
            guard !Task.isCancelled else { return }
            assignment = nil
            hasLoadedAssignment = true
            assignmentIssue = error.localizedDescription
        }
    }

    private func resetAssignmentState(for userID: String?) {
        assignmentRequestID = nil
        loadedUserID = userID
        assignment = nil
        hasLoadedAssignment = false
        isLoadingAssignment = false
        assignmentIssue = nil
    }

    func loadRecommendations(
        city: String,
        using session: SessionStore
    ) async {
        await loadAssignment(using: session)
        guard assignment?.features["v2Recommendations"] == true,
              assignment?.eligible == true,
              assignment?.variant == "TREATMENT"
        else {
            recommendations = nil
            return
        }
        isLoadingRecommendations = true
        issue = nil
        defer { isLoadingRecommendations = false }

        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("--ui-testing-authenticated") {
            recommendations = NativeDiscoverRecommendationsPayload(
                mode: "PERSONALIZED",
                preferenceActiveUntil: Calendar.current.date(byAdding: .day, value: 3, to: Date())?.ISO8601Format(),
                items: UITestingDiscoverFixture.feed.buddies.prefix(2).map {
                    NativeDiscoverRecommendation(
                        kind: "BUDDY_POST",
                        reasonCodes: ["MATCHES_INTEREST", "SAME_COURSE"],
                        post: $0,
                        activity: nil
                    )
                }
            )
            return
        }
        #endif

        do {
            let response: APIEnvelope<NativeDiscoverRecommendationsPayload> = try await session.sendAuthorized(
                "api/v1/discover/recommendations",
                queryItems: [URLQueryItem(name: "city", value: city)]
            )
            recommendations = response.data
        } catch {
            recommendations = nil
            issue = error.localizedDescription
        }
    }
}

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
    private let cityPreference: DiscoverCityPreferenceStore
    private var latestRequestID: UUID?
    private var payloadContext: FeedContext?

    init(cityPreference: DiscoverCityPreferenceStore = .shared) {
        self.cityPreference = cityPreference
    }

    func load(using session: SessionStore, query: String = "") async {
        let requestID = UUID()
        latestRequestID = requestID
        let trimmedQuery = query.trimmingCharacters(in: .whitespacesAndNewlines)
        invalidatePayload(ifCityDoesNotMatch: cityPreference.selectedCity)
        isLoading = true
        issue = nil
        defer {
            if latestRequestID == requestID { isLoading = false }
        }

        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("--ui-testing-authenticated") {
            await cityPreference.refreshConfig(using: session)
            guard latestRequestID == requestID else { return }
            let fixture = UITestingDiscoverFixture.feed
            guard fixture.city == cityPreference.selectedCity else {
                payload = nil
                payloadContext = nil
                assertionFailure("The Discover fixture does not match the selected city.")
                return
            }
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

        await cityPreference.refreshConfig(using: session)
        guard latestRequestID == requestID else { return }
        let city = cityPreference.selectedCity
        let requestContext = FeedContext(city: city, query: trimmedQuery)
        invalidatePayload(ifCityDoesNotMatch: city)

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

    private func invalidatePayload(ifCityDoesNotMatch city: String) {
        guard let currentCity = payloadContext?.city ?? payload?.city,
              currentCity != city
        else { return }
        payload = nil
        payloadContext = nil
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
final class SavedPostsStore {
    private(set) var posts: [NativeDiscoverBuddyPost]?
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
            posts = UITestingDiscoverFixture.feed.buddies.map {
                $0.withSaved(true, interestedCount: max(1, $0.interestedCount))
            }
            return
        }
        #endif

        do {
            let response: APIEnvelope<NativeSavedPostsPayload> = try await session.sendAuthorized(
                "api/v1/me/saved-posts"
            )
            posts = response.data.posts
        } catch {
            issue = error.localizedDescription
        }
    }

    func remove(postID: String, using session: SessionStore) async -> Bool {
        guard mutatingID == nil,
              let currentPosts = posts,
              let index = currentPosts.firstIndex(where: { $0.id == postID })
        else { return false }

        let removed = currentPosts[index]
        mutatingID = postID
        issue = nil
        posts?.remove(at: index)
        defer { mutatingID = nil }

        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("--ui-testing-authenticated") {
            NotificationCenter.default.post(name: .sideSeatDiscoverFeedNeedsRefresh, object: nil)
            return true
        }
        #endif

        do {
            let response: APIEnvelope<NativeDiscoverBuddyPostSaveResult> = try await session.sendAuthorized(
                "api/v1/discover/posts/\(postID)/saved",
                method: .delete,
                idempotencyKey: UUID().uuidString
            )
            guard response.data.savedByViewer == false else {
                throw APIClientError.invalidResponse
            }
            NotificationCenter.default.post(name: .sideSeatDiscoverFeedNeedsRefresh, object: nil)
            return true
        } catch {
            if posts?.contains(where: { $0.id == postID }) == false {
                posts?.insert(removed, at: min(index, posts?.count ?? 0))
            }
            issue = error.localizedDescription
            return false
        }
    }
}

@MainActor
@Observable
final class DiscoverCreateStore {
    private(set) var isSaving = false
    private(set) var issue: String?
    private(set) var savedPostID: String?
    private let cityPreference: DiscoverCityPreferenceStore

    init(cityPreference: DiscoverCityPreferenceStore = .shared) {
        self.cityPreference = cityPreference
    }

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
            await cityPreference.refreshConfig(using: session)
            let request = NativeDiscoverBuddyRequest(
                category: category,
                city: cityPreference.selectedCity,
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

        return await save(using: session) {
            await cityPreference.refreshConfig(using: session)
            let request = NativeDiscoverActivityRequest(
                city: cityPreference.selectedCity,
                title: trimmedTitle,
                description: trimmedDescription,
                startAt: startAt.formatted(.iso8601),
                location: trimmedLocation,
                unlimitedCapacity: unlimitedCapacity,
                capacity: unlimitedCapacity ? nil : capacity
            )
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
final class DiscoverMyResponsesStore {
    static let maximumPages = 20
    static let pageSize = 30

    private(set) var interests: [NativeCreatorGatedActionInterest] = []
    private(set) var nextCursor: String?
    private(set) var isLoading = false
    private(set) var isLoadingNextPage = false
    private(set) var mutatingInterestIDs: Set<String> = []
    private(set) var hasLoaded = false
    private(set) var issue: String?

    private var requestedCursors = Set<String>()
    private var loadedPageCount = 0

    var canLoadMore: Bool {
        nextCursor != nil && loadedPageCount < Self.maximumPages
    }

    func interest(id: String) -> NativeCreatorGatedActionInterest? {
        interests.first { $0.id == id }
    }

    func isMutating(interestID: String) -> Bool {
        mutatingInterestIDs.contains(interestID)
    }

    func clearIssue() {
        issue = nil
    }

    func load(using session: SessionStore) async {
        guard !isLoading, !isLoadingNextPage else { return }
        isLoading = true
        issue = nil
        hasLoaded = false
        interests = []
        nextCursor = nil
        requestedCursors = []
        loadedPageCount = 0
        defer {
            isLoading = false
            hasLoaded = true
        }

        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("--ui-testing-authenticated") {
            interests = NativeCreatorGatedActionInterest.uiTestingResponses
            return
        }
        #endif

        do {
            try await loadPage(cursor: nil, using: session)
        } catch is CancellationError {
            return
        } catch {
            issue = error.localizedDescription
        }
    }

    func loadNextPage(using session: SessionStore) async {
        guard !isLoading, !isLoadingNextPage else { return }
        guard let cursor = nextCursor, loadedPageCount < Self.maximumPages else { return }
        guard requestedCursors.insert(cursor).inserted else {
            nextCursor = nil
            return
        }

        isLoadingNextPage = true
        issue = nil
        defer { isLoadingNextPage = false }

        do {
            try await loadPage(cursor: cursor, using: session)
        } catch is CancellationError {
            requestedCursors.remove(cursor)
            return
        } catch {
            requestedCursors.remove(cursor)
            issue = error.localizedDescription
        }
    }

    func loadNextPageIfNeeded(
        after interestID: String,
        using session: SessionStore
    ) async {
        guard interests.suffix(3).contains(where: { $0.id == interestID }) else { return }
        await loadNextPage(using: session)
    }

    @discardableResult
    func withdraw(
        interestID: String,
        using session: SessionStore
    ) async -> NativeCreatorGatedActionInterest? {
        guard let current = interest(id: interestID),
              current.isWithdrawableBeforeConnect,
              mutatingInterestIDs.insert(interestID).inserted
        else { return nil }
        issue = nil
        defer { mutatingInterestIDs.remove(interestID) }

        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("--ui-testing-authenticated") {
            let withdrawn = current.withLifecycle(
                interestState: "WITHDRAWN",
                coordinationState: "UNAVAILABLE"
            )
            replace(withdrawn)
            return withdrawn
        }
        #endif

        do {
            let response: Components.Schemas.CreatorGatedInterestEnvelope = try await session.sendAuthorized(
                "api/v1/action-coordination/v2/interests/\(interestID)",
                method: .delete,
                idempotencyKey: UUID().uuidString
            )
            let withdrawn = NativeCreatorGatedActionInterest(wire: response.interest)
            replace(withdrawn)
            return withdrawn
        } catch is CancellationError {
            return nil
        } catch {
            issue = error.localizedDescription
            return nil
        }
    }

    private func loadPage(cursor: String?, using session: SessionStore) async throws {
        try Task.checkCancellation()

        var queryItems = [
            URLQueryItem(
                name: "state",
                value: Operations.ListMyCreatorGatedActionInterests.Input.Query.StatePayload.all.rawValue
            ),
            URLQueryItem(name: "limit", value: String(Self.pageSize)),
        ]
        if let cursor {
            queryItems.append(URLQueryItem(name: "cursor", value: cursor))
        }

        let response: Components.Schemas.CreatorGatedMyInterestsEnvelope = try await session.sendAuthorized(
            "api/v1/action-coordination/v2/me/interests",
            queryItems: queryItems
        )
        try Task.checkCancellation()

        loadedPageCount += 1
        merge(response.interests.map(NativeCreatorGatedActionInterest.init(wire:)))

        guard loadedPageCount < Self.maximumPages,
              let candidate = response.nextCursor?.trimmingCharacters(in: .whitespacesAndNewlines),
              !candidate.isEmpty,
              candidate != cursor,
              !requestedCursors.contains(candidate)
        else {
            nextCursor = nil
            return
        }
        nextCursor = candidate
    }

    private func merge(_ page: [NativeCreatorGatedActionInterest]) {
        var indices = Dictionary(uniqueKeysWithValues: interests.enumerated().map { ($1.id, $0) })
        for interest in page {
            if let index = indices[interest.id] {
                interests[index] = interest
            } else {
                indices[interest.id] = interests.count
                interests.append(interest)
            }
        }
    }

    private func replace(_ interest: NativeCreatorGatedActionInterest) {
        guard let index = interests.firstIndex(where: { $0.id == interest.id }) else { return }
        interests[index] = interest
    }
}

@MainActor
@Observable
final class ActionResponsesStore {
    static let maximumPages = 20
    static let pageSize = 30

    private(set) var groups: [NativeActionResponseGroup] = []
    private(set) var snapshot: NativeActionResponseSnapshot?
    private(set) var nextCursor: String?
    private(set) var presentation: NativeActionResponsePresentationFilter = .visible
    private(set) var isLoading = false
    private(set) var isLoadingNextPage = false
    private(set) var mutatingInterestIDs: Set<String> = []
    private(set) var issue: String?
    private(set) var hasLoaded = false

    let actionID: String?
    private var loadedPageCount = 0
    private var requestedCursors = Set<String>()
    private var markedSeenKeys = Set<String>()
    private var markedSeenInterestIDs = Set<String>()

    init(actionID: String? = nil) {
        self.actionID = actionID
    }

    var canLoadMore: Bool {
        nextCursor != nil && loadedPageCount < Self.maximumPages
    }

    func response(interestID: String) -> NativeActionResponseItem? {
        groups.lazy.flatMap(\.responses).first { $0.interestID == interestID }
    }

    func clearIssue() {
        issue = nil
    }

    func isMutating(interestID: String) -> Bool {
        mutatingInterestIDs.contains(interestID)
    }

    func load(
        presentation: NativeActionResponsePresentationFilter = .visible,
        using session: SessionStore
    ) async {
        guard !isLoading, !isLoadingNextPage else { return }
        isLoading = true
        issue = nil
        hasLoaded = false
        self.presentation = presentation
        clearSnapshot()
        defer {
            isLoading = false
            hasLoaded = true
        }

        do {
            try await loadPage(cursor: nil, using: session)
        } catch is CancellationError {
            return
        } catch {
            issue = error.localizedDescription
        }
    }

    func loadNextPage(using session: SessionStore) async {
        guard !isLoading, !isLoadingNextPage else { return }
        guard let cursor = nextCursor, loadedPageCount < Self.maximumPages else { return }
        guard requestedCursors.insert(cursor).inserted else {
            nextCursor = nil
            return
        }

        isLoadingNextPage = true
        issue = nil
        do {
            try await loadPage(cursor: cursor, using: session)
            isLoadingNextPage = false
        } catch is CancellationError {
            requestedCursors.remove(cursor)
            isLoadingNextPage = false
        } catch let apiError as APIClientError where apiError.statusCode == 410 {
            // Cursors are snapshot-bound. Never append live rows to an expired snapshot.
            isLoadingNextPage = false
            await load(presentation: presentation, using: session)
        } catch {
            requestedCursors.remove(cursor)
            isLoadingNextPage = false
            issue = error.localizedDescription
        }
    }

    func loadNextPageIfNeeded(after groupID: String, using session: SessionStore) async {
        guard groups.suffix(2).contains(where: { $0.id == groupID }) else { return }
        await loadNextPage(using: session)
    }

    func markSeen(groupID: String, using session: SessionStore) async {
        guard let snapshot,
              let group = groups.first(where: { $0.id == groupID })
        else { return }
        let unseen = group.responses.filter { response in
            response.isUnseen && !markedSeenInterestIDs.contains(response.interestID)
        }
        guard !unseen.isEmpty else { return }
        let unseenIDs = unseen.map(\.interestID).sorted()
        let key = "\(snapshot.token):\(groupID):\(unseenIDs.joined(separator: ","))"
        guard markedSeenKeys.insert(key).inserted else { return }

        do {
            let request = Components.Schemas.ActionResponsesSeenRequest(
                snapshotToken: snapshot.token,
                interestIds: unseenIDs
            )
            let response: Components.Schemas.ActionResponsesSeenEnvelope = try await session.sendAuthorized(
                "api/v1/action-coordination/v2/actions/\(groupID)/responses/seen",
                method: .post,
                body: request,
                idempotencyKey: UUID().uuidString
            )
            applySeen(response)
            markedSeenInterestIDs.formUnion(unseenIDs)
        } catch is CancellationError {
            markedSeenKeys.remove(key)
        } catch let apiError as APIClientError where apiError.statusCode == 410 {
            markedSeenKeys.remove(key)
            await load(presentation: presentation, using: session)
        } catch {
            markedSeenKeys.remove(key)
            issue = error.localizedDescription
        }
    }

    func setPresentation(
        interestID: String,
        to target: NativeActionResponsePresentationFilter,
        using session: SessionStore
    ) async {
        guard response(interestID: interestID) != nil,
              mutatingInterestIDs.insert(interestID).inserted
        else { return }
        issue = nil
        defer { mutatingInterestIDs.remove(interestID) }

        do {
            let wireTarget: Components.Schemas.ActionResponsePresentationRequest.PresentationStatePayload =
                target == .visible ? .visible : .hidden
            let request = Components.Schemas.ActionResponsePresentationRequest(
                presentationState: wireTarget
            )
            let response: Components.Schemas.ActionResponsePresentationEnvelope = try await session.sendAuthorized(
                "api/v1/action-coordination/v2/interests/\(interestID)/presentation",
                method: .patch,
                body: request,
                idempotencyKey: UUID().uuidString
            )
            applyPresentation(response)
        } catch is CancellationError {
            return
        } catch {
            issue = error.localizedDescription
        }
    }

    private func loadPage(cursor: String?, using session: SessionStore) async throws {
        try Task.checkCancellation()
        var queryItems = [
            URLQueryItem(name: "presentation", value: presentation.rawValue),
            URLQueryItem(name: "limit", value: String(Self.pageSize)),
        ]
        if let actionID {
            queryItems.append(URLQueryItem(name: "actionId", value: actionID))
        }
        if let cursor {
            queryItems.append(URLQueryItem(name: "cursor", value: cursor))
        }

        let response: Components.Schemas.ActionResponsesEnvelope = try await session.sendAuthorized(
            "api/v1/action-coordination/v2/responses",
            queryItems: queryItems
        )
        try Task.checkCancellation()
        let page = NativeActionResponsesPage(wire: response)

        if let snapshot, snapshot.token != page.snapshot.token {
            throw APIClientError.invalidResponse
        }
        snapshot = page.snapshot
        loadedPageCount += 1
        merge(page.groups)

        guard loadedPageCount < Self.maximumPages,
              let candidate = page.nextCursor?.trimmingCharacters(in: .whitespacesAndNewlines),
              !candidate.isEmpty,
              candidate != cursor,
              !requestedCursors.contains(candidate)
        else {
            nextCursor = nil
            return
        }
        nextCursor = candidate
    }

    private func merge(_ page: [NativeActionResponseGroup]) {
        var groupIndices = Dictionary(uniqueKeysWithValues: groups.enumerated().map { ($1.id, $0) })
        for incoming in page {
            guard let index = groupIndices[incoming.id] else {
                groupIndices[incoming.id] = groups.count
                groups.append(incoming)
                continue
            }
            var responses = groups[index].responses
            var responseIndices = Dictionary(
                uniqueKeysWithValues: responses.enumerated().map { ($1.interestID, $0) }
            )
            for response in incoming.responses {
                if let responseIndex = responseIndices[response.interestID] {
                    responses[responseIndex] = response
                } else {
                    responseIndices[response.interestID] = responses.count
                    responses.append(response)
                }
            }
            groups[index] = NativeActionResponseGroup(
                action: incoming.action,
                counts: incoming.counts,
                responses: responses,
                focus: incoming.focus
            )
        }
    }

    private func applySeen(_ envelope: Components.Schemas.ActionResponsesSeenEnvelope) {
        guard let groupIndex = groups.firstIndex(where: { $0.id == envelope.actionId }) else { return }
        let viewed = Dictionary(uniqueKeysWithValues: envelope.viewed.map { ($0.interestId, $0.viewedAt) })
        let group = groups[groupIndex]
        groups[groupIndex] = NativeActionResponseGroup(
            action: group.action,
            counts: NativeActionResponseCounts(wire: envelope.counts),
            responses: group.responses.map { response in
                viewed[response.interestID].map(response.withViewedAt) ?? response
            },
            focus: group.focus
        )
    }

    private func applyPresentation(_ envelope: Components.Schemas.ActionResponsePresentationEnvelope) {
        guard let groupIndex = groups.firstIndex(where: { $0.id == envelope.actionId }) else { return }
        let group = groups[groupIndex]
        let responses = group.responses.filter { $0.interestID != envelope.presentation.interestId }
        if responses.isEmpty {
            groups.remove(at: groupIndex)
            return
        }
        groups[groupIndex] = NativeActionResponseGroup(
            action: group.action,
            counts: NativeActionResponseCounts(wire: envelope.counts),
            responses: responses,
            focus: group.focus
        )
    }

    private func clearSnapshot() {
        groups = []
        snapshot = nil
        nextCursor = nil
        loadedPageCount = 0
        requestedCursors = []
        markedSeenKeys = []
        markedSeenInterestIDs = []
    }
}

@MainActor
@Observable
final class CoordinationShellStore {
    private(set) var reservation: NativeCoordinationShellReservation?
    private(set) var isWorking = false
    private(set) var isReadOnly = false
    private(set) var issue: String?
    private var reserveKey: String?
    private var heartbeatKey: String?
    private var releaseKey: String?
    private var activationKey: String?
    private var activationSignature: String?
    private(set) var activationMayHaveSucceeded = false

    var isExpired: Bool {
        guard let reservation else { return true }
        return reservation.leaseExpiresAt <= Date()
    }

    func clearIssue() { issue = nil }

    func markActivationUncertain() {
        activationMayHaveSucceeded = true
    }

    @discardableResult
    func reserve(interestID: String, using session: SessionStore) async -> NativeCoordinationShellReservation? {
        guard !isWorking, !isReadOnly else { return nil }
        let isRecoveryAfterMissingLease = reservation == nil
        isWorking = true
        issue = nil
        let key = reserveKey ?? UUID().uuidString
        reserveKey = key
        defer { isWorking = false }
        do {
            let envelope: Components.Schemas.ActionCoordinationReservationEnvelope = try await session.sendAuthorized(
                "api/v1/action-coordination/v2/interests/\(interestID)/reservations",
                method: .post,
                idempotencyKey: key
            )
            let next = NativeCoordinationShellReservation(wire: envelope.reservation)
            reservation = next
            if isRecoveryAfterMissingLease {
                activationKey = nil
                activationSignature = nil
                activationMayHaveSucceeded = false
            }
            reserveKey = nil
            heartbeatKey = nil
            releaseKey = nil
            return next
        } catch is CancellationError {
            return nil
        } catch let error as APIClientError {
            if error.statusCode == 426 { isReadOnly = true }
            issue = error.localizedDescription
            return nil
        } catch {
            issue = error.localizedDescription
            return nil
        }
    }

    func install(_ reservation: NativeCoordinationShellReservation) {
        self.reservation = reservation
    }

    func heartbeatIfNeeded(using session: SessionStore, now: Date = Date()) async {
        guard !isWorking, !isReadOnly, let reservation else { return }
        guard reservation.leaseExpiresAt.timeIntervalSince(now) <= 150 else { return }
        if reservation.leaseExpiresAt <= now {
            issue = AppLocalization.string("This coordination reservation expired. Your draft is still here.")
            return
        }
        isWorking = true
        let key = heartbeatKey ?? UUID().uuidString
        heartbeatKey = key
        defer { isWorking = false }
        do {
            let envelope: Components.Schemas.ActionCoordinationReservationEnvelope = try await session.sendAuthorized(
                "api/v1/action-coordination/v2/reservations/\(reservation.id)/heartbeat",
                method: .post,
                idempotencyKey: key
            )
            self.reservation = NativeCoordinationShellReservation(wire: envelope.reservation)
            heartbeatKey = nil
        } catch is CancellationError {
            return
        } catch let error as APIClientError {
            if error.statusCode == 426 { isReadOnly = true }
            issue = error.statusCode == 409
                ? AppLocalization.string("This coordination reservation expired. Your draft is still here.")
                : error.localizedDescription
        } catch {
            issue = error.localizedDescription
        }
    }

    @discardableResult
    func release(using session: SessionStore) async -> Bool {
        guard !activationMayHaveSucceeded else { return false }
        guard !isWorking, let reservation else { return self.reservation == nil }
        isWorking = true
        let key = releaseKey ?? UUID().uuidString
        releaseKey = key
        defer { isWorking = false }
        do {
            let _: Components.Schemas.ActionCoordinationReservationReleaseEnvelope = try await session.sendAuthorized(
                "api/v1/action-coordination/v2/reservations/\(reservation.id)",
                method: .delete,
                idempotencyKey: key
            )
            self.reservation = nil
            releaseKey = nil
            return true
        } catch is CancellationError {
            return false
        } catch {
            issue = error.localizedDescription
            return false
        }
    }

    func activateMessage(
        _ rawBody: String,
        using session: SessionStore
    ) async -> NativeCoordinationMessageActivation? {
        let body = rawBody.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !body.isEmpty, !isWorking, !isReadOnly, let reservation else { return nil }
        let signature = "\(reservation.generation):\(body)"
        if activationSignature != signature {
            activationSignature = signature
            activationKey = UUID().uuidString
            activationMayHaveSucceeded = false
        }
        guard let key = activationKey else { return nil }
        isWorking = true
        issue = nil
        defer { isWorking = false }
        do {
            let request = Components.Schemas.ActionCoordinationActivationRequest(
                firstContent: .message(Components.Schemas.ActionCoordinationFirstMessageContent(
                    _type: .message,
                    body: body
                ))
            )
            let envelope: Components.Schemas.ActionCoordinationActivationEnvelope = try await session.sendAuthorized(
                "api/v1/action-coordination/v2/reservations/\(reservation.id)/activate",
                method: .post,
                body: request,
                idempotencyKey: key
            )
            activationMayHaveSucceeded = true
            guard case .message(let activation) = envelope.activation else {
                issue = AppLocalization.string("The server returned an invalid response.")
                return nil
            }
            return NativeCoordinationMessageActivation(wire: activation)
        } catch is CancellationError {
            activationMayHaveSucceeded = true
            return nil
        } catch let error as APIClientError {
            switch error.statusCode {
            case 426:
                isReadOnly = true
            case 404:
                isReadOnly = true
            case 409:
                self.reservation = nil
                issue = AppLocalization.string("This coordination reservation expired. Your draft is still here.")
                return nil
            default:
                if let status = error.statusCode, (500...599).contains(status) {
                    activationMayHaveSucceeded = true
                }
                break
            }
            issue = error.localizedDescription
            return nil
        } catch {
            activationMayHaveSucceeded = true
            issue = error.localizedDescription
            return nil
        }
    }
}

@MainActor
@Observable
final class DiscoverPostDetailStore {
    static let maximumCreatorGatedInterestRestorePages = 20
    private static let creatorGatedInterestRestorePageSize = 50

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
            detail = NativeDiscoverBuddyPostDetail(
                post: post,
                viewerCanMessage: true,
                activeInterest: nil,
                creatorGatedInterest: nil
            )
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
            if response.data.post.usesCreatorGatedCoordination {
                await restoreCreatorGatedInterest(postID: postID, using: session)
            }
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
                UITestingDiscoverFixture.adjustBuddyCommentCount(postID: postID, by: 1)
                notifyDiscoverFeedChanged()
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
                notifyDiscoverFeedChanged()
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
                UITestingDiscoverFixture.adjustBuddyCommentCount(postID: postID, by: -1)
                notifyDiscoverFeedChanged()
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
            if !response.data.deletedReply {
                notifyDiscoverFeedChanged()
            }
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

    private func notifyDiscoverFeedChanged() {
        NotificationCenter.default.post(name: .sideSeatDiscoverFeedNeedsRefresh, object: nil)
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
            return AppLocalization.string( "You can't report your own content.")
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
            detail = NativeDiscoverBuddyPostDetail(
                post: current.post.withSaved(saved, interestedCount: current.post.interestedCount),
                viewerCanMessage: current.viewerCanMessage,
                activeInterest: current.activeInterest,
                creatorGatedInterest: current.creatorGatedInterest
            )
            notifyDiscoverFeedChanged()
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
                        interestedCount: current.post.interestedCount
                    ),
                    viewerCanMessage: current.viewerCanMessage,
                    activeInterest: current.activeInterest,
                    creatorGatedInterest: current.creatorGatedInterest
                )
            }
            notifyDiscoverFeedChanged()
        } catch {
            issue = error.localizedDescription
        }
    }

    @discardableResult
    func expressInterest(
        postID: String,
        using session: SessionStore
    ) async -> NativeCreatorGatedActionInterest? {
        guard !isMutating,
              let current = detail,
              current.post.id == postID,
              current.post.interactionMode == .expressInterest,
              [.expressInterest, .reactivateInterest].contains(current.primaryAction)
        else { return nil }
        isMutating = true
        issue = nil
        defer { isMutating = false }

        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("--ui-testing-authenticated") {
            let nextInterest: NativeCreatorGatedActionInterest
            if let existing = current.creatorGatedInterest, existing.isWithdrawn {
                nextInterest = existing.withLifecycle(
                    interestState: "ACTIVE",
                    coordinationState: "WAITING",
                    activationId: "ui-activation-\(UUID().uuidString)"
                )
            } else {
                nextInterest = makeDebugCreatorGatedInterest(for: current.post)
            }
            applyCreatorGatedInterest(nextInterest, to: current)
            return nextInterest
        }
        #endif

        do {
            let response: Components.Schemas.CreatorGatedInterestEnvelope
            let request = Components.Schemas.CreatorGatedInterestRequest(
                interestSurface: .actionDetail
            )
            if let existing = current.creatorGatedInterest, existing.isWithdrawn {
                response = try await session.sendAuthorized(
                    "api/v1/action-coordination/v2/interests/\(existing.id)/reactivate",
                    method: .post,
                    body: request,
                    idempotencyKey: UUID().uuidString
                )
            } else {
                response = try await session.sendAuthorized(
                    "api/v1/action-coordination/v2/actions/\(postID)/interest",
                    method: .post,
                    body: request,
                    idempotencyKey: UUID().uuidString
                )
            }
            let interest = NativeCreatorGatedActionInterest(wire: response.interest)
            applyCreatorGatedInterest(interest, to: current)
            return interest
        } catch {
            if Self.isInactiveInterestConflict(error) {
                await restoreCreatorGatedInterest(postID: postID, using: session)
                if detail?.creatorGatedInterest?.isWithdrawn == true {
                    // The authoritative recovery state now exposes a user-initiated
                    // explicit reactivate action. Never reactivate from this catch path.
                    return nil
                }
            }
            issue = error.localizedDescription
            return nil
        }
    }

    @discardableResult
    func withdrawInterest(
        postID: String,
        using session: SessionStore
    ) async -> NativeCreatorGatedActionInterest? {
        guard !isMutating,
              let current = detail,
              current.post.id == postID,
              let interest = current.creatorGatedInterest,
              interest.isWithdrawableBeforeConnect
        else { return nil }
        isMutating = true
        issue = nil
        defer { isMutating = false }

        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("--ui-testing-authenticated") {
            let withdrawn = interest.withLifecycle(
                interestState: "WITHDRAWN",
                coordinationState: "UNAVAILABLE"
            )
            applyCreatorGatedInterest(withdrawn, to: current)
            return withdrawn
        }
        #endif

        do {
            let response: Components.Schemas.CreatorGatedInterestEnvelope = try await session.sendAuthorized(
                "api/v1/action-coordination/v2/interests/\(interest.id)",
                method: .delete,
                idempotencyKey: UUID().uuidString
            )
            let nextInterest = NativeCreatorGatedActionInterest(wire: response.interest)
            applyCreatorGatedInterest(nextInterest, to: current)
            return nextInterest
        } catch {
            issue = error.localizedDescription
            return nil
        }
    }

    private func restoreCreatorGatedInterest(postID: String, using session: SessionStore) async {
        do {
            var cursor: String?
            var requestedCursors = Set<String>()

            for _ in 0..<Self.maximumCreatorGatedInterestRestorePages {
                try Task.checkCancellation()
                if let cursor, !requestedCursors.insert(cursor).inserted {
                    return
                }

                var queryItems = [
                    URLQueryItem(
                        name: "state",
                        value: Operations.ListMyCreatorGatedActionInterests.Input.Query.StatePayload.all.rawValue
                    ),
                    URLQueryItem(
                        name: "limit",
                        value: String(Self.creatorGatedInterestRestorePageSize)
                    ),
                ]
                if let cursor {
                    queryItems.append(URLQueryItem(name: "cursor", value: cursor))
                }

                let response: Components.Schemas.CreatorGatedMyInterestsEnvelope = try await session.sendAuthorized(
                    "api/v1/action-coordination/v2/me/interests",
                    queryItems: queryItems
                )
                try Task.checkCancellation()

                if let wireInterest = response.interests.first(where: { $0.actionId == postID }) {
                    guard let current = detail, current.post.id == postID else { return }
                    let interest = NativeCreatorGatedActionInterest(wire: wireInterest)
                    detail = NativeDiscoverBuddyPostDetail(
                        post: current.post.withInterest(
                            interest.isActive,
                            interestedCount: current.post.interestedCount
                        ),
                        viewerCanMessage: current.viewerCanMessage,
                        activeInterest: current.activeInterest,
                        creatorGatedInterest: interest
                    )
                    return
                }

                guard let nextCursor = response.nextCursor, !nextCursor.isEmpty else { return }
                cursor = nextCursor
            }
        } catch is CancellationError {
            return
        } catch {
            // Eligibility recovery is additive: a failed lookup must not hide a valid post detail.
        }
    }

    private static func isInactiveInterestConflict(_ error: any Error) -> Bool {
        guard let apiError = error as? APIClientError,
              case .server(let status, let payload) = apiError
        else { return false }
        return status == 409 && payload.code == "INTEREST_NOT_ACTIVE"
    }

    private func applyCreatorGatedInterest(
        _ interest: NativeCreatorGatedActionInterest,
        to current: NativeDiscoverBuddyPostDetail
    ) {
        let isInterested = interest.isActive
        let delta = current.post.interestedByViewer == isInterested ? 0 : (isInterested ? 1 : -1)
        detail = NativeDiscoverBuddyPostDetail(
            post: current.post.withInterest(
                isInterested,
                interestedCount: current.post.interestedCount + delta
            ),
            viewerCanMessage: current.viewerCanMessage,
            activeInterest: current.activeInterest,
            creatorGatedInterest: interest
        )
        notifyDiscoverFeedChanged()
    }

    private func makeDebugCreatorGatedInterest(
        for post: NativeDiscoverBuddyPost
    ) -> NativeCreatorGatedActionInterest {
        let interestID = "ui-interest-\(post.id)"
        let now = Date().formatted(.iso8601)
        return NativeCreatorGatedActionInterest(
            id: interestID,
            actionId: post.id,
            actionState: post.status,
            actionExpiresAt: post.expiresAt,
            interestState: "ACTIVE",
            coordinationState: "WAITING",
            activationId: "ui-activation-\(UUID().uuidString)",
            activationStartedAt: now,
            terminalReason: nil,
            terminalAt: nil,
            context: NativeCreatorGatedActionContext(
                title: post.title,
                startsAt: post.startsAt,
                endsAt: post.endsAt,
                location: post.location,
                course: post.linkedCourses.first.map {
                    NativeCreatorGatedActionCourse(id: $0.id, code: $0.code, name: $0.name)
                }
            ),
            planDraft: NativeCreatorGatedPlanDraft(
                title: post.title,
                startTime: post.startsAt,
                endTime: post.endsAt,
                location: post.location,
                planType: post.isCourseLinkedAction ? "STUDY" : "CUSTOM"
            ),
            focus: .interest(interestID: interestID),
            coordinationPolicy: "CREATOR_GATED_V2",
            policySchemaVersion: 1,
            createdAt: now,
            updatedAt: now
        )
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
                viewerCanMessage: current.viewerCanMessage,
                activeInterest: current.activeInterest,
                creatorGatedInterest: current.creatorGatedInterest
            )
            notifyDiscoverFeedChanged()
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
                    viewerCanMessage: current.viewerCanMessage,
                    activeInterest: current.activeInterest,
                    creatorGatedInterest: current.creatorGatedInterest
                )
            }
            notifyDiscoverFeedChanged()
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
            return AppLocalization.string( "You can't report your own post.")
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
                UITestingDiscoverFixture.adjustActivityCommentCount(activityID: activityID, by: 1)
                notifyDiscoverFeedChanged()
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
                notifyDiscoverFeedChanged()
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
                UITestingDiscoverFixture.adjustActivityCommentCount(activityID: activityID, by: -1)
                notifyDiscoverFeedChanged()
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
            if !response.data.deletedReply {
                notifyDiscoverFeedChanged()
            }
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

    private func notifyDiscoverFeedChanged() {
        NotificationCenter.default.post(name: .sideSeatDiscoverFeedNeedsRefresh, object: nil)
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
            return AppLocalization.string( "You can't report your own content.")
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
