import Foundation
import Observation

@MainActor
@Observable
final class DirectChatStore {
    private(set) var conversation: NativeDirectConversation?
    private(set) var messages: [NativeDirectMessage] = []
    private(set) var isLoading = false
    private(set) var isLoadingOlder = false
    private(set) var isSending = false
    private(set) var hasMoreOlder = false
    private(set) var issue: String?
    private(set) var sendIssue: String?
    private(set) var pendingRemoteCount = 0
    /// Opening jump target when inbox unread exceeded ~one screen (WeChat-style).
    private(set) var unreadJumpCount = 0
    private(set) var unreadJumpMessageID: String?
    private(set) var sendStatuses: [String: NativeMessageSendStatus] = [:]
    private(set) var replyTarget: NativeDirectMessage?
    private(set) var connectionActions: NativeConnectionActionsPayload?
    private(set) var actionIssue: String?
    private(set) var isMutatingConnectionAction = false
    private(set) var isActingOnPlan = false
    private(set) var planIssue: String?
    private(set) var planRecoveryRoute: AppRoute?
    private var planMutationKeys: [String: String] = [:]
    private(set) var hasCachedSnapshot = false

    private var nextCursor: String?
    private var realtimeCursor: String?
    private var streamTask: Task<Void, Never>?
    private var initialSideEffectsTask: Task<Void, Never>?
    private var cacheWriteTask: Task<Void, Never>?
    private var connectionID: String = ""
    private var apiBaseURL: URL?
    private var currentUserID: String = ""
    /// Set while prepending history so scroll policy does not treat it as new arrivals.
    private var suppressNextScrollDecision = false
    private var markReadTask: Task<Void, Never>?
    private let cache: DirectChatCache

    private static let unrepliedDirectMessageLimit = 2

    init(cache: DirectChatCache = .shared) {
        self.cache = cache
    }

    /// Messages sent before the conversation completes its first mutual reply.
    var unrepliedStreak: Int {
        guard !isUnrepliedGateExempt else { return 0 }
        guard let peerID = conversation?.peer.id, !currentUserID.isEmpty else { return 0 }
        let countable = messages.filter {
            sendStatuses[$0.id] != .failed
                && $0.type != "ACTION_INTEREST_CARD"
                && $0.type != "MUTUAL_OPPORTUNITY_CARD"
        }
        return Self.countUnrepliedStreak(
            messagesNewestFirst: countable.reversed(),
            viewerID: currentUserID,
            peerID: peerID
        )
    }

    var isUnrepliedSendBlocked: Bool {
        unrepliedStreak >= Self.unrepliedDirectMessageLimit
    }

    /// Soft hint while under the unreplied send limit and awaiting a peer reply.
    var showUnrepliedHint: Bool {
        guard !isUnrepliedGateExempt else { return false }
        guard let peerID = conversation?.peer.id, !currentUserID.isEmpty else { return false }
        if isUnrepliedSendBlocked { return false }
        let countable = messages.filter {
            sendStatuses[$0.id] != .failed
                && $0.type != "ACTION_INTEREST_CARD"
                && $0.type != "MUTUAL_OPPORTUNITY_CARD"
        }
        guard let newest = countable.last else { return true }
        return newest.sender.id != peerID
    }

    private var isUnrepliedGateExempt: Bool {
        if conversation?.isSelfNotes == true { return true }
        if conversation?.replyLimitUnlocked == true { return true }
        if let peerID = conversation?.peer.id, !currentUserID.isEmpty {
            let countable = messages.filter {
                sendStatuses[$0.id] != .failed
                    && $0.type != "ACTION_INTEREST_CARD"
                    && $0.type != "MUTUAL_OPPORTUNITY_CARD"
            }
            if Self.hasMutualExchange(
                messages: countable,
                viewerID: currentUserID,
                peerID: peerID
            ) {
                return true
            }
        }
        return false
    }

    nonisolated static func countUnrepliedStreak(
        messagesNewestFirst: [NativeDirectMessage],
        viewerID: String,
        peerID: String
    ) -> Int {
        guard !viewerID.isEmpty, !peerID.isEmpty, viewerID != peerID else { return 0 }
        if hasMutualExchange(
            messages: messagesNewestFirst,
            viewerID: viewerID,
            peerID: peerID
        ) {
            return 0
        }
        var unreplied = 0
        for message in messagesNewestFirst
        where message.type != "ACTION_INTEREST_CARD"
            && message.type != "MUTUAL_OPPORTUNITY_CARD"
        {
            if message.sender.id == viewerID, message.type != "SYSTEM" {
                unreplied += 1
            }
        }
        return unreplied
    }

    nonisolated static func hasMutualExchange(
        messages: [NativeDirectMessage],
        viewerID: String,
        peerID: String
    ) -> Bool {
        guard !viewerID.isEmpty, !peerID.isEmpty, viewerID != peerID else { return false }
        var viewerHasSent = false
        var peerHasSent = false
        for message in messages
        where message.type != "SYSTEM"
            && message.type != "ACTION_INTEREST_CARD"
            && message.type != "MUTUAL_OPPORTUNITY_CARD"
        {
            if message.sender.id == viewerID { viewerHasSent = true }
            if message.sender.id == peerID { peerHasSent = true }
            if viewerHasSent, peerHasSent { return true }
        }
        return false
    }

    func stop() {
        streamTask?.cancel()
        streamTask = nil
        initialSideEffectsTask?.cancel()
        initialSideEffectsTask = nil
        markReadTask?.cancel()
        markReadTask = nil
    }

    func waitForInitialSideEffects() async {
        await initialSideEffectsTask?.value
    }

    func load(
        connectionID: String,
        using session: SessionStore,
        apiBaseURL: URL,
        enableRealtime: Bool = true
    ) async {
        stop()
        if self.connectionID != connectionID {
            conversation = nil
            messages = []
            sendStatuses = [:]
            replyTarget = nil
            connectionActions = nil
            nextCursor = nil
            realtimeCursor = nil
            hasMoreOlder = false
            clearUnreadJump()
        }
        self.connectionID = connectionID
        self.apiBaseURL = apiBaseURL
        currentUserID = session.currentUser?.id ?? ""
        hasCachedSnapshot = false
        isLoading = true
        issue = nil
        pendingRemoteCount = 0
        suppressNextScrollDecision = false

        let stagedUnread = ChatUnreadLaunch.take(conversationID: connectionID)

        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("--ui-testing-authenticated") {
            let fixture = NativeDirectMessagePageData.uiTestingFixture(connectionID: connectionID)
            conversation = fixture.connection
            if ProcessInfo.processInfo.arguments.contains("--ui-testing-cached-chat-refresh") {
                messages = Array(fixture.messages.suffix(2))
                hasCachedSnapshot = true
                isLoading = false
            } else {
                messages = fixture.messages
            }
            if ProcessInfo.processInfo.arguments.contains("--ui-testing-flexible-timing") {
                messages.append(NativeDirectMessage(
                    id: "ui-flexible-source", connectionId: connectionID, sender: fixture.connection.peer,
                    type: "MUTUAL_OPPORTUNITY_CARD", body: nil, createdAt: Date().ISO8601Format(),
                    mutualOpportunity: NativeMutualOpportunitySource(id: "ui-flexible-opportunity",
                        policyVersion: "MUTUAL_OPPORTUNITY_V1", topic: "COFFEE",
                        context: NativeActionContext(version: 1, sourceKind: "MUTUAL_OPPORTUNITY",
                            sourceId: "ui-flexible-opportunity", title: "Coffee together", startsAt: nil, endsAt: nil,
                            location: nil, planType: "CUSTOM", participantIds: ["ui-test-user", fixture.connection.peer.id],
                            author: NativeActionContextAuthor(id: fixture.connection.peer.id, displayName: "Peer"), course: nil,
                            timeContext: NativeIntentTimePreference(kind: "UNDECIDED")))))
            }
            hasMoreOlder = false
            nextCursor = nil
            realtimeCursor = "ui-cursor"
            currentUserID = "ui-test-user"
            applyUnreadJump(unreadCount: stagedUnread)
            await markRead(using: session)
            await loadConnectionActions(using: session)
            if ProcessInfo.processInfo.arguments.contains("--ui-testing-cached-chat-refresh") {
                try? await Task.sleep(for: .milliseconds(1_200))
                guard !Task.isCancelled else { return }
                messages = fixture.messages
            }
            isLoading = false
            return
        }
        #endif

        if !currentUserID.isEmpty,
           let snapshot = await cache.load(
               accountID: currentUserID,
               connectionID: connectionID
           )
        {
            restore(snapshot)
            hasCachedSnapshot = true
            applyUnreadJump(unreadCount: stagedUnread)
            isLoading = false
        }

        if enableRealtime {
            startRealtime(using: session)
        }
        scheduleInitialSideEffects(using: session)

        do {
            let page = try await fetchPage(cursor: nil, using: session)
            applyNetworkPage(page)
            applyUnreadJump(unreadCount: stagedUnread)
            issue = nil
            isLoading = false
            await persistCache()
        } catch {
            issue = error.localizedDescription
            if Self.shouldDiscardCachedConversation(after: error) {
                await discardCachedConversation()
            }
            isLoading = false
        }
    }

    private nonisolated static func shouldDiscardCachedConversation(
        after error: Error
    ) -> Bool {
        guard let apiError = error as? APIClientError else { return false }
        if apiError.statusCode == 403 || apiError.statusCode == 404 {
            return true
        }
        guard case .server(_, let payload) = apiError else { return false }
        return payload.code == "SAFETY_UNAVAILABLE"
            || payload.code == "CONTENT_RESTRICTED"
    }

    private func discardCachedConversation() async {
        let pendingCacheWrite = cacheWriteTask
        pendingCacheWrite?.cancel()
        cacheWriteTask = nil
        await pendingCacheWrite?.value
        stop()
        conversation = nil
        messages = []
        sendStatuses = [:]
        replyTarget = nil
        connectionActions = nil
        nextCursor = nil
        realtimeCursor = nil
        hasMoreOlder = false
        hasCachedSnapshot = false
        pendingRemoteCount = 0
        planRecoveryRoute = nil
        clearUnreadJump()
        if !currentUserID.isEmpty, !connectionID.isEmpty {
            await cache.remove(
                accountID: currentUserID,
                connectionID: connectionID
            )
        }
    }

    func clearUnreadJump() {
        unreadJumpCount = 0
        unreadJumpMessageID = nil
    }

    private func applyUnreadJump(unreadCount: Int) {
        guard ChatUnreadJumpPolicy.shouldShowJump(unreadCount: unreadCount) else {
            clearUnreadJump()
            return
        }
        let targetID = ChatUnreadJumpPolicy.firstUnreadMessageID(
            messages: messages.map { (id: $0.id, senderID: $0.sender.id) },
            unreadCount: unreadCount,
            currentUserID: currentUserID
        )
        guard let targetID else {
            clearUnreadJump()
            return
        }
        unreadJumpCount = unreadCount
        unreadJumpMessageID = targetID
    }

    func resumeRealtimeIfNeeded(using session: SessionStore) {
        guard streamTask == nil,
              apiBaseURL != nil,
              !connectionID.isEmpty,
              !ProcessInfo.processInfo.arguments.contains("--ui-testing-authenticated")
        else { return }
        startRealtime(using: session)
    }

    func loadOlder(using session: SessionStore) async {
        guard hasMoreOlder, let nextCursor, !isLoadingOlder else { return }
        isLoadingOlder = true
        defer { isLoadingOlder = false }
        do {
            let page = try await fetchPage(cursor: nextCursor, using: session)
            let existing = Set(messages.map(\.id))
            let older = page.data.messages.filter { !existing.contains($0.id) }
            guard !older.isEmpty else {
                hasMoreOlder = page.meta.hasMore
                self.nextCursor = page.meta.nextCursor
                return
            }
            suppressNextScrollDecision = true
            messages = older + messages
            hasMoreOlder = page.meta.hasMore
            self.nextCursor = page.meta.nextCursor
            scheduleCachePersist()
        } catch {
            issue = error.localizedDescription
            if Self.shouldDiscardCachedConversation(after: error) {
                await discardCachedConversation()
            }
        }
    }

    /// Finds the newest chat card for a plan, paging backward when the card is
    /// older than the initial message window.
    func messageID(forPlanID planID: String, loadingOlderUsing session: SessionStore) async -> String? {
        await messageID(
            forPlanCommitmentID: planID,
            revisionID: planID,
            loadingOlderUsing: session
        )
    }

    /// Finds the newest card for an exact Plan focus. A revision id wins when
    /// present; a commitment-only focus falls back to the legacy id until the
    /// additive commitment metadata is available on every Plan DTO.
    func messageID(
        forPlanCommitmentID commitmentID: String,
        revisionID: String?,
        loadingOlderUsing session: SessionStore
    ) async -> String? {
        if let messageID = Self.messageID(
            forPlanCommitmentID: commitmentID,
            revisionID: revisionID,
            in: messages
        ) {
            return messageID
        }

        defer { suppressNextScrollDecision = false }
        while hasMoreOlder {
            let previousCount = messages.count
            let previousCursor = nextCursor
            await loadOlder(using: session)

            if let messageID = Self.messageID(
                forPlanCommitmentID: commitmentID,
                revisionID: revisionID,
                in: messages
            ) {
                return messageID
            }

            guard messages.count > previousCount || nextCursor != previousCursor else {
                break
            }
        }
        return nil
    }

    nonisolated static func messageID(
        forPlanID planID: String,
        in messages: [NativeDirectMessage]
    ) -> String? {
        messageID(
            forPlanCommitmentID: planID,
            revisionID: planID,
            in: messages
        )
    }

    /// Chat history can contain a request card followed by a confirmed card for
    /// the same immutable revision. Present only the newest rich card while
    /// retaining every non-Plan message in timeline order.
    nonisolated static func presentationMessages(
        from messages: [NativeDirectMessage]
    ) -> [NativeDirectMessage] {
        var seenRevisionIDs = Set<String>()
        var retained: [NativeDirectMessage] = []
        retained.reserveCapacity(messages.count)
        for message in messages.reversed() {
            let isPlanCard = message.type == "PLAN_REQUEST_CARD" || message.type == "PLAN_CONFIRMED_CARD"
            guard isPlanCard, let revisionID = message.planRequestId ?? message.planRequest?.id else {
                retained.append(message)
                continue
            }
            if seenRevisionIDs.insert(revisionID).inserted {
                retained.append(message)
            }
        }
        return retained.reversed()
    }

    nonisolated static func messageID(
        forPlanCommitmentID commitmentID: String,
        revisionID: String?,
        in messages: [NativeDirectMessage]
    ) -> String? {
        return messages.last { message in
            let matches = if let revisionID {
                message.planRequestId == revisionID || message.planRequest?.id == revisionID
            } else {
                message.planRequest?.commitmentId == commitmentID
            }
            guard matches else {
                return false
            }
            return message.type == "PLAN_REQUEST_CARD" || message.type == "PLAN_CONFIRMED_CARD"
        }?.id
    }

    nonisolated static func messageID(
        forActionContextID contextID: String,
        in messages: [NativeDirectMessage]
    ) -> String? {
        messages.last {
            $0.type == "ACTION_INTEREST_CARD" && $0.actionContextId == contextID
        }?.id
    }

    nonisolated static func actionContextID(
        for focus: DirectChatFocus?,
        in messages: [NativeDirectMessage]
    ) -> String? {
        guard let focus else { return nil }
        switch focus {
        case .actionContext(let id):
            return id
        case .message(let id):
            return messages.last(where: { $0.id == id })?.actionContextId
        case .plan(let commitmentID, let revisionID):
            return messages.last(where: {
                if let revisionID {
                    return $0.planRequestId == revisionID || $0.planRequest?.id == revisionID
                }
                return $0.planRequest?.commitmentId == commitmentID
            })?.actionContextId
        case .actionInterest(let id):
            return messages.last(where: {
                ($0.actionInterestId == id || $0.actionInterest?.id == id)
                    && $0.type == "ACTION_INTEREST_CARD"
            })?.actionContextId
        }
    }

    func messageID(
        forActionContextID contextID: String,
        loadingOlderUsing session: SessionStore
    ) async -> String? {
        if let id = Self.messageID(forActionContextID: contextID, in: messages) { return id }
        defer { suppressNextScrollDecision = false }
        while hasMoreOlder {
            let previousCount = messages.count
            let previousCursor = nextCursor
            await loadOlder(using: session)
            if let id = Self.messageID(forActionContextID: contextID, in: messages) { return id }
            guard messages.count > previousCount || nextCursor != previousCursor else { break }
        }
        return nil
    }

    func messageID(
        forActionInterestID interestID: String,
        loadingOlderUsing session: SessionStore
    ) async -> String? {
        if let messageID = Self.messageID(forActionInterestID: interestID, in: messages) {
            return messageID
        }

        defer { suppressNextScrollDecision = false }
        while hasMoreOlder {
            let previousCount = messages.count
            let previousCursor = nextCursor
            await loadOlder(using: session)
            if let messageID = Self.messageID(forActionInterestID: interestID, in: messages) {
                return messageID
            }
            guard messages.count > previousCount || nextCursor != previousCursor else { break }
        }
        return nil
    }

    func messageID(
        forMessageID messageID: String,
        loadingOlderUsing session: SessionStore
    ) async -> String? {
        if messages.contains(where: { $0.id == messageID }) { return messageID }
        defer { suppressNextScrollDecision = false }
        while hasMoreOlder {
            let previousCount = messages.count
            let previousCursor = nextCursor
            await loadOlder(using: session)
            if messages.contains(where: { $0.id == messageID }) { return messageID }
            guard messages.count > previousCount || nextCursor != previousCursor else { break }
        }
        return nil
    }

    nonisolated static func messageID(
        forActionInterestID interestID: String,
        in messages: [NativeDirectMessage]
    ) -> String? {
        messages.last {
            ($0.actionInterestId == interestID || $0.actionInterest?.id == interestID)
                && $0.type == "ACTION_INTEREST_CARD"
        }?.id
    }

    /// Retries a failed optimistic text send in place.
    @discardableResult
    func retryFailedSend(_ messageID: String, using session: SessionStore) async -> Bool {
        guard
            let message = messages.first(where: { $0.id == messageID }),
            sendStatuses[messageID] == .failed,
            message.type == "TEXT",
            let body = message.body?.trimmingCharacters(in: .whitespacesAndNewlines),
            !body.isEmpty,
            !isSending
        else { return false }

        isSending = true
        sendIssue = nil
        sendStatuses[messageID] = .sending
        scheduleCachePersist()
        defer { isSending = false }

        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("--ui-testing-authenticated") {
            sendStatuses[messageID] = .sent
            return true
        }
        #endif

        do {
            let response: APIEnvelope<NativeDirectMessage> = try await session.sendAuthorized(
                "api/v1/connections/\(connectionID)/messages",
                method: .post,
                body: NativeDirectTextMessageRequest(
                    body: body,
                    replyToId: message.replyTo?.id,
                    actionContextId: message.actionContextId
                ),
                idempotencyKey: UUID().uuidString
            )
            messages.removeAll { $0.id == messageID }
            sendStatuses.removeValue(forKey: messageID)
            upsert(response.data)
            return true
        } catch {
            sendStatuses[messageID] = .failed
            scheduleCachePersist()
            noteSendFailure(error)
            return false
        }
    }

    @discardableResult
    func sendText(
        _ raw: String,
        replyTo: NativeDirectMessage? = nil,
        actionContextID: String? = nil,
        using session: SessionStore
    ) async -> Bool {
        let body = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !body.isEmpty else { return false }
        if isUnrepliedSendBlocked {
            sendIssue = AppLocalization.string( "Wait for a reply before sending more messages.")
            return false
        }
        sendIssue = nil

        let reply = replyTo ?? replyTarget
        let replyToId = reply?.id

        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("--ui-testing-authenticated") {
            let optimistic = NativeDirectMessage(
                id: "ui-local-\(UUID().uuidString)",
                connectionId: connectionID.isEmpty ? "ui-connection" : connectionID,
                sender: NativeChatAuthor(
                    id: currentUserID,
                    username: "test_001",
                    nickname: "Test User",
                    avatarUrl: nil
                ),
                type: "TEXT",
                body: body,
                createdAt: ISO8601DateFormatter().string(from: Date()),
                replyTo: reply?.asReplyReference()
            )
            messages.append(optimistic)
            sendStatuses[optimistic.id] = .sent
            pendingRemoteCount = 0
            clearReply(ifMatching: replyToId)
            publishInboxPreview(for: optimistic)
            return true
        }
        #endif

        let localID = "local-\(UUID().uuidString)"
        let optimistic = NativeDirectMessage(
            id: localID,
            connectionId: connectionID,
            sender: NativeChatAuthor(
                id: currentUserID,
                username: session.currentUser?.username ?? "me",
                nickname: session.currentUser?.nickname,
                avatarUrl: session.currentUser?.avatarUrl
            ),
            type: "TEXT",
            body: body,
            createdAt: ISO8601DateFormatter().string(from: Date()),
            actionContextId: actionContextID,
            replyTo: reply?.asReplyReference()
        )
        messages.append(optimistic)
        sendStatuses[localID] = .sending
        pendingRemoteCount = 0
        clearReply(ifMatching: replyToId)
        publishInboxPreview(for: optimistic)
        scheduleCachePersist()

        do {
            let response: APIEnvelope<NativeDirectMessage> = try await session.sendAuthorized(
                "api/v1/connections/\(connectionID)/messages",
                method: .post,
                body: NativeDirectTextMessageRequest(
                    body: body,
                    replyToId: replyToId,
                    actionContextId: actionContextID
                ),
                idempotencyKey: UUID().uuidString
            )
            // The optimistic row already handled the visible scroll. Replacing its
            // local ID with the server ID must not start a second animation.
            suppressNextScrollDecision = true
            messages.removeAll { $0.id == localID }
            sendStatuses.removeValue(forKey: localID)
            upsert(response.data)
            return true
        } catch {
            sendStatuses[localID] = .failed
            scheduleCachePersist()
            noteSendFailure(error)
            return false
        }
    }

    @discardableResult
    func sendImage(
        data: Data,
        mimeType: String,
        fileName: String,
        caption: String? = nil,
        actionContextID: String? = nil,
        using session: SessionStore
    ) async -> Bool {
        guard !isSending else { return false }
        if isUnrepliedSendBlocked {
            sendIssue = AppLocalization.string( "Wait for a reply before sending more messages.")
            return false
        }
        isSending = true
        sendIssue = nil
        defer { isSending = false }

        let reply = replyTarget
        let replyToId = reply?.id
        let localID = "local-\(UUID().uuidString)"
        let optimistic = NativeDirectMessage(
            id: localID,
            connectionId: connectionID,
            sender: NativeChatAuthor(
                id: currentUserID,
                username: session.currentUser?.username ?? "me",
                nickname: session.currentUser?.nickname,
                avatarUrl: session.currentUser?.avatarUrl
            ),
            type: "IMAGE",
            body: caption,
            createdAt: ISO8601DateFormatter().string(from: Date()),
            imageUrl: nil,
            actionContextId: actionContextID,
            replyTo: reply?.asReplyReference()
        )
        messages.append(optimistic)
        sendStatuses[localID] = .sending
        pendingRemoteCount = 0
        clearReply(ifMatching: replyToId)
        publishInboxPreview(for: optimistic)
        scheduleCachePersist()

        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("--ui-testing-authenticated") {
            let sent = NativeDirectMessage(
                id: "ui-local-image-\(UUID().uuidString)",
                connectionId: connectionID.isEmpty ? "ui-connection" : connectionID,
                sender: optimistic.sender,
                type: "IMAGE",
                body: caption,
                createdAt: optimistic.createdAt,
                imageUrl: "https://example.com/ui-uploaded.jpg",
                actionContextId: actionContextID,
                replyTo: reply?.asReplyReference()
            )
            messages.removeAll { $0.id == localID }
            upsert(sent)
            return true
        }
        #endif

        do {
            let upload: APIEnvelope<NativeChatImageUpload> = try await session.uploadAuthorized(
                "api/connections/\(connectionID)/chat-images",
                file: MultipartUploadFile(
                    fieldName: "file",
                    fileName: fileName,
                    mimeType: mimeType,
                    data: data
                ),
                idempotencyKey: UUID().uuidString
            )
            let response: APIEnvelope<NativeDirectMessage> = try await session.sendAuthorized(
                "api/v1/connections/\(connectionID)/messages",
                method: .post,
                body: NativeDirectImageMessageRequest(
                    imageUrl: upload.data.url,
                    body: caption,
                    replyToId: replyToId,
                    actionContextId: actionContextID
                ),
                idempotencyKey: UUID().uuidString
            )
            messages.removeAll { $0.id == localID }
            sendStatuses.removeValue(forKey: localID)
            upsert(response.data)
            return true
        } catch {
            sendStatuses[localID] = .failed
            scheduleCachePersist()
            noteSendFailure(error)
            return false
        }
    }

    @discardableResult
    func sendLocation(
        latitude: Double,
        longitude: Double,
        name: String? = nil,
        actionContextID: String? = nil,
        using session: SessionStore
    ) async -> Bool {
        guard !isSending else { return false }
        if isUnrepliedSendBlocked {
            sendIssue = AppLocalization.string( "Wait for a reply before sending more messages.")
            return false
        }
        isSending = true
        sendIssue = nil
        defer { isSending = false }

        let reply = replyTarget
        let replyToId = reply?.id
        let localID = "local-\(UUID().uuidString)"
        let optimistic = NativeDirectMessage(
            id: localID,
            connectionId: connectionID,
            sender: NativeChatAuthor(
                id: currentUserID,
                username: session.currentUser?.username ?? "me",
                nickname: session.currentUser?.nickname,
                avatarUrl: session.currentUser?.avatarUrl
            ),
            type: "LOCATION",
            body: nil,
            createdAt: ISO8601DateFormatter().string(from: Date()),
            location: NativeChatLocation(latitude: latitude, longitude: longitude, name: name),
            actionContextId: actionContextID,
            replyTo: reply?.asReplyReference()
        )
        messages.append(optimistic)
        sendStatuses[localID] = .sending
        pendingRemoteCount = 0
        clearReply(ifMatching: replyToId)
        publishInboxPreview(for: optimistic)
        scheduleCachePersist()

        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("--ui-testing-authenticated") {
            let sent = NativeDirectMessage(
                id: "ui-local-location",
                connectionId: connectionID.isEmpty ? "ui-connection" : connectionID,
                sender: optimistic.sender,
                type: "LOCATION",
                body: nil,
                createdAt: optimistic.createdAt,
                location: NativeChatLocation(latitude: latitude, longitude: longitude, name: name),
                actionContextId: actionContextID,
                replyTo: reply?.asReplyReference()
            )
            messages.removeAll { $0.id == localID }
            upsert(sent)
            return true
        }
        #endif

        do {
            let response: APIEnvelope<NativeDirectMessage> = try await session.sendAuthorized(
                "api/v1/connections/\(connectionID)/messages",
                method: .post,
                body: NativeDirectLocationMessageRequest(
                    locationLat: latitude,
                    locationLng: longitude,
                    locationName: name,
                    replyToId: replyToId,
                    actionContextId: actionContextID
                ),
                idempotencyKey: UUID().uuidString
            )
            messages.removeAll { $0.id == localID }
            sendStatuses.removeValue(forKey: localID)
            upsert(response.data)
            return true
        } catch {
            sendStatuses[localID] = .failed
            scheduleCachePersist()
            noteSendFailure(error)
            return false
        }
    }

    private func noteSendFailure(_ error: Error) {
        if let apiError = error as? APIClientError,
           case .server(_, let payload) = apiError,
           payload.code == "PEER_REPLY_REQUIRED"
        {
            sendIssue = AppLocalization.string( "Wait for a reply before sending more messages.")
            return
        }
        sendIssue = error.localizedDescription
    }

    @discardableResult
    func deleteMessage(_ messageID: String, using session: SessionStore) async -> Bool {
        guard let existing = messages.first(where: { $0.id == messageID }),
              existing.sender.id == currentUserID,
              existing.supportsUserDeletion,
              !existing.isDeleted
        else { return false }

        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("--ui-testing-authenticated") {
            upsert(existing.tombstoned(at: "2026-07-17T12:10:00.000Z"))
            if replyTarget?.id == messageID { clearReply() }
            return true
        }
        #endif

        do {
            struct DeleteResult: Decodable, Sendable { let id: String }
            let _: APIEnvelope<DeleteResult> = try await session.sendAuthorized(
                "api/connections/\(connectionID)/messages/\(messageID)",
                method: .delete
            )
            upsert(existing.tombstoned())
            if replyTarget?.id == messageID { clearReply() }
            return true
        } catch {
            sendIssue = error.localizedDescription
            return false
        }
    }

    /// Returns `nil` on success, or an error message on failure.
    func reportMessage(
        _ message: NativeDirectMessage,
        reason: NativeReportReason,
        details: String,
        using session: SessionStore
    ) async -> String? {
        guard message.sender.id != currentUserID, !message.isDeleted else {
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
                    reportedUserId: message.sender.id,
                    messageId: message.id,
                    reason: reason,
                    details: details
                )
            )
            return nil
        } catch {
            return error.localizedDescription
        }
    }

    func loadConnectionActions(using session: SessionStore) async {
        actionIssue = nil
        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("--ui-testing-authenticated") {
            connectionActions = NativeConnectionActionsPayload(
                remark: nil,
                peerId: "ui-peer",
                isSelfNotes: false,
                friendLink: NativeConnectionLinkState(status: "NONE", role: "none"),
                contactExchange: NativeConnectionExchangeState(status: "NONE", role: "none", cooldownUntil: nil)
            )
            return
        }
        #endif
        do {
            let response: APIEnvelope<NativeConnectionActionsPayload> = try await session.sendAuthorized(
                "api/v1/connections/\(connectionID)/actions"
            )
            connectionActions = response.data
        } catch {
            actionIssue = error.localizedDescription
        }
    }

    @discardableResult
    func updateRemark(_ remark: String?, using session: SessionStore) async -> Bool {
        guard !isMutatingConnectionAction else { return false }
        isMutatingConnectionAction = true
        actionIssue = nil
        defer { isMutatingConnectionAction = false }
        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("--ui-testing-authenticated") {
            connectionActions = NativeConnectionActionsPayload(
                remark: remark,
                peerId: connectionActions?.peerId,
                isSelfNotes: connectionActions?.isSelfNotes,
                friendLink: connectionActions?.friendLink,
                contactExchange: connectionActions?.contactExchange
            )
            return true
        }
        #endif
        do {
            let response: APIEnvelope<NativeConnectionRemarkResult> = try await session.sendAuthorized(
                "api/v1/connections/\(connectionID)/contact-remark",
                method: .patch,
                body: NativeConnectionRemarkPatch(remark: remark),
                idempotencyKey: UUID().uuidString
            )
            connectionActions = NativeConnectionActionsPayload(
                remark: response.data.remark,
                peerId: connectionActions?.peerId,
                isSelfNotes: connectionActions?.isSelfNotes,
                friendLink: connectionActions?.friendLink,
                contactExchange: connectionActions?.contactExchange
            )
            return true
        } catch {
            actionIssue = error.localizedDescription
            return false
        }
    }

    @discardableResult
    func performFriendLink(action: String, using session: SessionStore) async -> Bool {
        guard !isMutatingConnectionAction else { return false }
        isMutatingConnectionAction = true
        actionIssue = nil
        defer { isMutatingConnectionAction = false }
        return await mutateLinkAction(
            path: "api/v1/connections/\(connectionID)/friend-link",
            action: action,
            using: session
        ) { result in
            connectionActions = NativeConnectionActionsPayload(
                remark: connectionActions?.remark,
                peerId: connectionActions?.peerId,
                isSelfNotes: connectionActions?.isSelfNotes,
                friendLink: NativeConnectionLinkState(status: result.status, role: result.role),
                contactExchange: connectionActions?.contactExchange
            )
        }
    }

    @discardableResult
    func performContactExchange(action: String, using session: SessionStore) async -> Bool {
        guard !isMutatingConnectionAction else { return false }
        isMutatingConnectionAction = true
        actionIssue = nil
        defer { isMutatingConnectionAction = false }
        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("--ui-testing-authenticated") {
            let state: (status: String, role: String) = switch action {
            case "request": ("PENDING", "requester")
            case "accept": ("ACCEPTED", "responder")
            case "decline": ("DECLINED", "responder")
            case "cancel": ("CANCELED", "requester")
            default: ("NONE", "none")
            }
            connectionActions = NativeConnectionActionsPayload(
                remark: connectionActions?.remark,
                peerId: connectionActions?.peerId,
                isSelfNotes: connectionActions?.isSelfNotes,
                friendLink: connectionActions?.friendLink,
                contactExchange: NativeConnectionExchangeState(
                    status: state.status,
                    role: state.role,
                    cooldownUntil: nil
                )
            )
            return true
        }
        #endif
        do {
            let response: APIEnvelope<NativeConnectionExchangeResult> = try await session.sendAuthorized(
                "api/v1/connections/\(connectionID)/contact-exchange",
                method: .post,
                body: NativeConnectionActionRequest(action: action),
                idempotencyKey: UUID().uuidString
            )
            connectionActions = NativeConnectionActionsPayload(
                remark: connectionActions?.remark,
                peerId: connectionActions?.peerId,
                isSelfNotes: connectionActions?.isSelfNotes,
                friendLink: connectionActions?.friendLink,
                contactExchange: NativeConnectionExchangeState(
                    status: response.data.status,
                    role: response.data.role,
                    cooldownUntil: response.data.cooldownUntil
                )
            )
            return true
        } catch {
            actionIssue = error.localizedDescription
            return false
        }
    }

    @discardableResult
    func endConnection(using session: SessionStore) async -> Bool {
        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("--ui-testing-authenticated") {
            return true
        }
        #endif
        do {
            let _: APIEnvelope<NativeConnectionEndResult> = try await session.sendAuthorized(
                "api/v1/connections/\(connectionID)/end",
                method: .post,
                idempotencyKey: UUID().uuidString
            )
            return true
        } catch {
            actionIssue = error.localizedDescription
            return false
        }
    }

    @discardableResult
    func blockPeer(using session: SessionStore) async -> Bool {
        guard let peerID = conversation?.peer.id ?? connectionActions?.peerId else { return false }
        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("--ui-testing-authenticated") {
            await completeLocalBlockEffects()
            return true
        }
        #endif
        do {
            let _: APIEnvelope<NativeConnectionBlockResult> = try await session.sendAuthorized(
                "api/v1/connections/\(connectionID)/block",
                method: .post,
                body: NativeConnectionBlockRequest(
                    blockedId: peerID,
                    connectionId: connectionID,
                    reason: nil
                ),
                idempotencyKey: UUID().uuidString
            )
            await completeLocalBlockEffects()
            return true
        } catch {
            actionIssue = error.localizedDescription
            return false
        }
    }

    private func completeLocalBlockEffects() async {
        await HomeScheduleCache.shared.clear()
        await discardCachedConversation()
        NotificationCenter.default.post(name: .sideSeatCalendarNeedsRefresh, object: nil)
        NotificationCenter.default.post(name: .sideSeatPlansNeedsRefresh, object: nil)
        NotificationCenter.default.post(name: .sideSeatInboxNeedsRefresh, object: nil)
    }

    func refreshMessages(using session: SessionStore) async {
        await reloadHistory(using: session)
    }

    @discardableResult
    func sendScheduleShare(using session: SessionStore) async -> Bool {
        guard !isSending else { return false }
        isSending = true
        sendIssue = nil
        defer { isSending = false }

        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("--ui-testing-authenticated") {
            seedLocalScheduleShareCard()
            return true
        }
        #endif

        do {
            struct EmptyBody: Encodable, Sendable {}
            let response: APIEnvelope<NativeScheduleShareCreatePayload> = try await session.sendAuthorized(
                "api/v1/connections/\(connectionID)/schedule-shares",
                method: .post,
                body: EmptyBody(),
                idempotencyKey: UUID().uuidString
            )
            upsert(response.data.message)
            sendStatuses[response.data.message.id] = .sent
            return true
        } catch {
            sendIssue = error.localizedDescription
            return false
        }
    }

    /// UI-testing / local seed after Plan sheet send (server creates the card message).
    func seedLocalPlanCard(title: String = "图书馆自习") {
        let now = ISO8601DateFormatter().string(from: Date())
        let meAuthor = NativePlanAuthor(
            id: currentUserID.isEmpty ? "ui-test-user" : currentUserID,
            username: "test_001",
            nickname: "测试用户",
            avatarUrl: nil
        )
        let peerAuthor = NativePlanAuthor(
            id: conversation?.peer.id ?? "ui-peer",
            username: conversation?.peer.username ?? "test_002",
            nickname: conversation?.peer.nickname ?? conversation?.displayName,
            avatarUrl: conversation?.peer.avatarUrl
        )
        let plan = NativePlanRequest(
            id: "ui-local-plan-\(UUID().uuidString)",
            connectionId: connectionID.isEmpty ? "ui-connection" : connectionID,
            status: "PENDING",
            planType: "CUSTOM",
            title: title,
            location: nil,
            message: nil,
            startTime: now,
            endTime: now,
            proposer: meAuthor,
            receiver: peerAuthor,
            counterOfId: nil,
            availabilityShareId: nil,
            scheduleShareLinkId: nil,
            createdAt: now,
            updatedAt: now
        )
        let message = NativeDirectMessage(
            id: "ui-local-plan-msg-\(UUID().uuidString)",
            connectionId: plan.connectionId,
            sender: NativeChatAuthor(
                id: meAuthor.id,
                username: meAuthor.username,
                nickname: meAuthor.nickname,
                avatarUrl: nil
            ),
            type: "PLAN_REQUEST_CARD",
            body: nil,
            createdAt: now,
            planRequestId: plan.id,
            planRequest: plan
        )
        upsert(message)
    }

    func seedLocalScheduleShareCard() {
        let message = NativeDirectMessage(
            id: "ui-local-schedule-shared",
            connectionId: connectionID.isEmpty ? "ui-connection" : connectionID,
            sender: NativeChatAuthor(
                id: currentUserID.isEmpty ? "ui-test-user" : currentUserID,
                username: "test_001",
                nickname: "测试用户",
                avatarUrl: nil
            ),
            type: "SCHEDULE_SHARE_CARD",
            body: "https://example.com/share/view/ui-token",
            createdAt: ISO8601DateFormatter().string(from: Date())
        )
        upsert(message)
    }

    @discardableResult
    func acceptPlan(_ plan: NativePlanRequest, using session: SessionStore) async -> Bool {
        await mutatePlan(plan, action: "accept", method: .post, using: session)
    }

    /// Compatibility for callers that only hold a legacy PlanRequest id.
    @discardableResult
    func acceptPlan(_ planID: String, using session: SessionStore) async -> Bool {
        if let plan = messages.last(where: { $0.planRequest?.id == planID })?.planRequest {
            return await acceptPlan(plan, using: session)
        }
        guard !isActingOnPlan else { return false }
        isActingOnPlan = true
        planIssue = nil
        defer { isActingOnPlan = false }
        let mutationKey = "\(planID):accept"
        let key = planMutationKeys[mutationKey] ?? UUID().uuidString
        planMutationKeys[mutationKey] = key
        do {
            let _: APIEnvelope<NativePlanEnvelopePayload> = try await session.sendAuthorized(
                "api/v1/plans/\(planID)/accept",
                method: .post,
                idempotencyKey: key
            )
            planMutationKeys[mutationKey] = nil
            await reloadHistory(using: session)
            await publishPlanMutationEffects(didAccept: true)
            return true
        } catch let error as APIClientError {
            if !error.shouldPreserveIdempotencyKey {
                planMutationKeys[mutationKey] = nil
            }
            planIssue = error.localizedDescription
            return false
        } catch {
            planIssue = error.localizedDescription
            return false
        }
    }

    @discardableResult
    func declinePlan(_ plan: NativePlanRequest, using session: SessionStore) async -> Bool {
        await mutatePlan(plan, action: "decline", method: .post, using: session)
    }

    @discardableResult
    func withdrawPlan(_ plan: NativePlanRequest, using session: SessionStore) async -> Bool {
        await mutatePlan(plan, action: "withdraw", method: .delete, using: session)
    }

    @discardableResult
    func recordOutcome(
        _ value: String,
        for plan: NativePlanRequest,
        using session: SessionStore
    ) async -> Bool {
        guard !isActingOnPlan, plan.isOutcomeEligible() else { return false }
        isActingOnPlan = true
        planIssue = nil
        defer { isActingOnPlan = false }

        let mutationKey = "\(plan.id):outcome:\(value)"
        let idempotencyKey = planMutationKeys[mutationKey] ?? UUID().uuidString
        planMutationKeys[mutationKey] = idempotencyKey

        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("--ui-testing-authenticated") {
            messages = messages.map { message in
                guard message.planRequest?.id == plan.id else { return message }
                return message.replacingPlanRequest(
                    plan.replacingViewerOutcome(with: value)
                )
            }
            planMutationKeys[mutationKey] = nil
            return true
        }
        #endif

        do {
            let body = NativePlanOutcomeRequest(value: value)
            let _: APIEnvelope<NativePlanOutcomeEnvelope> = try await session.sendAuthorized(
                "api/v1/plans/\(plan.id)/outcome",
                method: .post,
                body: body,
                idempotencyKey: idempotencyKey
            )
            planMutationKeys[mutationKey] = nil
            await reloadHistory(using: session)
            NotificationCenter.default.post(name: .sideSeatPlansNeedsRefresh, object: nil)
            NotificationCenter.default.post(name: .sideSeatInboxNeedsRefresh, object: nil)
            NotificationCenter.default.post(name: .sideSeatTogetherNeedsRefresh, object: nil)
            return true
        } catch let error as APIClientError {
            if !error.shouldPreserveIdempotencyKey {
                planMutationKeys[mutationKey] = nil
            }
            planIssue = error.localizedDescription
            return false
        } catch {
            planIssue = error.localizedDescription
            return false
        }
    }

    @discardableResult
    func recordMeetAgain(_ value: String, for plan: NativePlanRequest, using session: SessionStore) async -> Bool {
        guard !isActingOnPlan, plan.showsMeetAgain else { return false }
        isActingOnPlan = true
        planIssue = nil
        defer { isActingOnPlan = false }
        let mutationKey = "\(plan.id):meet-again:\(value)"
        let key = planMutationKeys[mutationKey] ?? UUID().uuidString
        planMutationKeys[mutationKey] = key
        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("--ui-testing-authenticated") {
            messages = messages.map { message in
                guard message.planRequest?.id == plan.id else { return message }
                return message.replacingPlanRequest(plan.replacingViewerMeetAgain(with: value))
            }
            planMutationKeys[mutationKey] = nil
            return true
        }
        #endif
        do {
            let _: APIEnvelope<NativePlanMeetAgainEnvelope> = try await session.sendAuthorized(
                "api/v1/plans/\(plan.id)/meet-again", method: .post,
                body: NativePlanMeetAgainRequest(value: value), idempotencyKey: key
            )
            planMutationKeys[mutationKey] = nil
            await reloadHistory(using: session)
            NotificationCenter.default.post(name: .sideSeatPlansNeedsRefresh, object: nil)
            NotificationCenter.default.post(name: .sideSeatTogetherNeedsRefresh, object: nil)
            return true
        } catch let error as APIClientError {
            if !error.shouldPreserveIdempotencyKey { planMutationKeys[mutationKey] = nil }
            planIssue = error.localizedDescription
            return false
        } catch {
            planIssue = error.localizedDescription
            return false
        }
    }

    private func mutatePlan(
        _ plan: NativePlanRequest,
        action: String,
        method: HTTPMethod,
        using session: SessionStore
    ) async -> Bool {
        guard !isActingOnPlan else { return false }
        isActingOnPlan = true
        planIssue = nil
        planRecoveryRoute = nil
        defer { isActingOnPlan = false }

        let usesV2 = plan.usesActionCoordinationV2
        let path: String
        if usesV2, action == "withdraw" {
            path = "api/v1/action-coordination/v2/plans/\(plan.id)"
        } else if usesV2 {
            path = "api/v1/action-coordination/v2/plans/\(plan.id)/\(action)"
        } else {
            path = "api/v1/plans/\(plan.id)/\(action)"
        }
        let mutationKey = "\(plan.id):\(action)"
        let idempotencyKey = planMutationKeys[mutationKey] ?? UUID().uuidString
        planMutationKeys[mutationKey] = idempotencyKey

        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("--ui-testing-authenticated") {
            messages = messages.map { message in
                guard message.planRequestId == plan.id, var updatedPlan = message.planRequest else { return message }
                let status = action == "accept" ? "ACCEPTED" : (action == "withdraw" ? "CANCELED" : "DECLINED")
                updatedPlan = NativePlanRequest(
                    id: updatedPlan.id,
                    connectionId: updatedPlan.connectionId,
                    commitmentId: updatedPlan.commitmentId,
                    originContextId: updatedPlan.originContextId,
                    coordinationPolicy: updatedPlan.coordinationPolicy,
                    status: status,
                    planType: updatedPlan.planType,
                    title: updatedPlan.title,
                    location: updatedPlan.location,
                    message: updatedPlan.message,
                    startTime: updatedPlan.startTime,
                    endTime: updatedPlan.endTime,
                    proposer: updatedPlan.proposer,
                    receiver: updatedPlan.receiver,
                    counterOfId: updatedPlan.counterOfId,
                    availabilityShareId: updatedPlan.availabilityShareId,
                    scheduleShareLinkId: updatedPlan.scheduleShareLinkId,
                    origin: updatedPlan.origin,
                    viewerOutcome: updatedPlan.viewerOutcome,
                    viewerMeetAgain: updatedPlan.viewerMeetAgain,
                    meetAgainAvailable: updatedPlan.meetAgainAvailable,
                    createdAt: updatedPlan.createdAt,
                    updatedAt: updatedPlan.updatedAt
                )
                return NativeDirectMessage(
                    id: message.id,
                    connectionId: message.connectionId,
                    sender: message.sender,
                    type: status == "ACCEPTED" ? "PLAN_CONFIRMED_CARD" : message.type,
                    body: message.body,
                    createdAt: message.createdAt,
                    imageUrl: message.imageUrl,
                    location: message.location,
                    availabilityShareId: message.availabilityShareId,
                    planRequestId: message.planRequestId,
                    planRequest: updatedPlan,
                    replyTo: message.replyTo,
                    deletedAt: message.deletedAt
                )
            }
            await publishPlanMutationEffects(didAccept: action == "accept")
            planMutationKeys[mutationKey] = nil
            return true
        }
        #endif

        do {
            if usesV2 {
                let _: Components.Schemas.ActionPlanMutationEnvelope = try await session.sendAuthorized(
                    path, method: method, idempotencyKey: idempotencyKey
                )
            } else {
                let _: APIEnvelope<NativePlanEnvelopePayload> = try await session.sendAuthorized(
                    path, method: method, idempotencyKey: idempotencyKey
                )
            }
            await reloadHistory(using: session)
            await publishPlanMutationEffects(didAccept: action == "accept")
            planMutationKeys[mutationKey] = nil
            return true
        } catch let error as APIClientError {
            if case .server(_, let payload) = error,
               payload.recovery?.action == "OPEN_PLAN",
               let focus = payload.recovery?.focus,
               let connectionID = focus.connectionId,
               let commitmentID = focus.commitmentId
            {
                planRecoveryRoute = .directChat(
                    connectionID: connectionID,
                    focus: .plan(commitmentID: commitmentID, revisionID: focus.revisionId)
                )
            }
            if !error.shouldPreserveIdempotencyKey {
                planMutationKeys[mutationKey] = nil
            }
            planIssue = error.localizedDescription
            return false
        } catch {
            planIssue = error.localizedDescription
            return false
        }
    }

    private func publishPlanMutationEffects(didAccept: Bool) async {
        if didAccept {
            await HomeScheduleCache.shared.clear()
            NotificationCenter.default.post(name: .sideSeatCalendarNeedsRefresh, object: nil)
            NotificationCenter.default.post(name: .sideSeatTogetherNeedsRefresh, object: nil)
        }
        NotificationCenter.default.post(name: .sideSeatPlansNeedsRefresh, object: nil)
        NotificationCenter.default.post(name: .sideSeatInboxNeedsRefresh, object: nil)
    }

    private func mutateLinkAction(
        path: String,
        action: String,
        using session: SessionStore,
        apply: (NativeConnectionLinkResult) -> Void
    ) async -> Bool {
        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("--ui-testing-authenticated") {
            apply(NativeConnectionLinkResult(
                status: action == "request" ? "PENDING" : (action == "accept" ? "ACCEPTED" : "DECLINED"),
                role: action == "request" ? "requester" : "responder"
            ))
            return true
        }
        #endif
        do {
            let response: APIEnvelope<NativeConnectionLinkResult> = try await session.sendAuthorized(
                path,
                method: .post,
                body: NativeConnectionActionRequest(action: action),
                idempotencyKey: UUID().uuidString
            )
            apply(response.data)
            return true
        } catch {
            actionIssue = error.localizedDescription
            return false
        }
    }

    func beginReply(to message: NativeDirectMessage) {
        guard !message.isDeleted else { return }
        replyTarget = message
    }

    func clearReply() {
        replyTarget = nil
    }

    private func clearReply(ifMatching messageID: String?) {
        guard let messageID, replyTarget?.id == messageID else { return }
        replyTarget = nil
    }

    func noteSendIssue(_ message: String) {
        sendIssue = message
    }

    func clearActionIssue() {
        actionIssue = nil
    }

    /// After Plan/Schedule sheets reload history, push the newest outbound card into the inbox row.
    func publishLatestOutboundToInbox() {
        guard let last = messages.last else { return }
        guard last.sender.id == currentUserID || last.sender.id == "ui-test-user" else { return }
        publishInboxPreview(for: last)
    }

    func clearPendingRemoteCount() {
        pendingRemoteCount = 0
    }

    func noteRemoteArrivalWhileScrolledUp(count: Int) {
        guard count > 0 else { return }
        pendingRemoteCount += count
    }

    func consumeScrollDecision(
        previousIDs: Set<String>,
        isNearBottom: Bool
    ) -> ChatScrollDecision {
        if suppressNextScrollDecision {
            suppressNextScrollDecision = false
            return ChatScrollPolicy.decisionIgnoringPagination()
        }
        return ChatScrollPolicy.decision(
            previousIDs: previousIDs,
            nextMessages: messages,
            currentUserID: currentUserID,
            isNearBottom: isNearBottom
        )
    }

    private func restore(_ snapshot: DirectChatCacheSnapshot) {
        conversation = snapshot.conversation
        messages = snapshot.messages
        sendStatuses = snapshot.sendStatuses.mapValues { status in
            status == .sending ? .failed : status
        }
        hasMoreOlder = snapshot.hasMoreOlder
        nextCursor = snapshot.nextCursor
        realtimeCursor = snapshot.realtimeCursor
    }

    private func applyNetworkPage(_ page: NativeDirectMessagePageResponse) {
        conversation = page.data.connection
        let reconciled = DirectChatPageReconciler.reconcile(
            cached: messages,
            sendStatuses: sendStatuses,
            remote: page.data.messages,
            hasMore: page.meta.hasMore,
            accountID: currentUserID
        )
        messages = reconciled.messages
        sendStatuses = reconciled.sendStatuses
        hasMoreOlder = page.meta.hasMore
        nextCursor = page.meta.nextCursor
        realtimeCursor = page.meta.realtimeCursor
    }

    private func scheduleInitialSideEffects(using session: SessionStore) {
        initialSideEffectsTask?.cancel()
        initialSideEffectsTask = Task { [weak self] in
            guard let self else { return }
            async let markRead: Void = self.markRead(using: session)
            async let actions: Void = self.loadConnectionActions(using: session)
            _ = await (markRead, actions)
        }
    }

    private func cacheSnapshot(savedAt: Date = Date()) -> DirectChatCacheSnapshot? {
        guard let conversation,
              !currentUserID.isEmpty,
              !connectionID.isEmpty,
              !ProcessInfo.processInfo.arguments.contains("--ui-testing-authenticated")
        else { return nil }
        return DirectChatCacheSnapshot(
            conversation: conversation,
            messages: messages,
            sendStatuses: sendStatuses,
            hasMoreOlder: hasMoreOlder,
            nextCursor: nextCursor,
            realtimeCursor: realtimeCursor,
            savedAt: savedAt
        )
    }

    private func persistCache() async {
        guard let snapshot = cacheSnapshot() else { return }
        await cache.save(
            accountID: currentUserID,
            connectionID: connectionID,
            snapshot: snapshot
        )
    }

    private func scheduleCachePersist() {
        guard let snapshot = cacheSnapshot() else { return }
        let accountID = currentUserID
        let connectionID = connectionID
        let cache = cache
        cacheWriteTask?.cancel()
        cacheWriteTask = Task {
            try? await Task.sleep(nanoseconds: 100_000_000)
            guard !Task.isCancelled else { return }
            await cache.save(
                accountID: accountID,
                connectionID: connectionID,
                snapshot: snapshot
            )
        }
    }

    private func fetchPage(cursor: String?, using session: SessionStore) async throws -> NativeDirectMessagePageResponse {
        var queryItems: [URLQueryItem] = [
            URLQueryItem(name: "limit", value: cursor == nil ? "30" : "50")
        ]
        if let cursor {
            queryItems.append(URLQueryItem(name: "cursor", value: cursor))
        }
        return try await session.sendAuthorized(
            "api/v1/connections/\(connectionID)/messages",
            queryItems: queryItems
        )
    }

    private func markRead(using session: SessionStore) async {
        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("--ui-testing-authenticated") {
            NotificationCenter.default.post(
                name: .sideSeatInboxConversationRead,
                object: nil,
                userInfo: ["conversationID": connectionID]
            )
            return
        }
        #endif

        struct ReadBody: Encodable, Sendable {}
        struct ReadResult: Decodable, Sendable { let readAt: String }
        do {
            let _: APIEnvelope<ReadResult> = try await session.sendAuthorized(
                "api/v1/connections/\(connectionID)/read",
                method: .post,
                body: ReadBody()
            )
            NotificationCenter.default.post(
                name: .sideSeatInboxConversationRead,
                object: nil,
                userInfo: ["conversationID": connectionID]
            )
        } catch {
            // Keep badge until inbox refresh if the read cursor update fails.
        }
    }

    private func scheduleMarkRead(using session: SessionStore) {
        markReadTask?.cancel()
        markReadTask = Task { [weak self] in
            try? await Task.sleep(nanoseconds: 450_000_000)
            guard !Task.isCancelled, let self else { return }
            await self.markRead(using: session)
        }
    }

    private func startRealtime(using session: SessionStore) {
        streamTask?.cancel()
        guard let apiBaseURL else { return }
        let connectionID = connectionID
        let initialCursor = realtimeCursor
        streamTask = Task { [weak self] in
            var cursor = initialCursor
            var backoff: UInt64 = 500_000_000
            while !Task.isCancelled {
                do {
                    try await self?.consumeStream(
                        apiBaseURL: apiBaseURL,
                        connectionID: connectionID,
                        lastEventID: cursor,
                        using: session
                    ) { next in
                        cursor = next
                        backoff = 500_000_000
                    }
                    // Clean end of stream — reconnect with current cursor.
                    try await Task.sleep(nanoseconds: 250_000_000)
                } catch is CancellationError {
                    break
                } catch SessionError.authenticationRequired {
                    // Refresh failed / signed out — stop spinning on 401.
                    break
                } catch let error as APIClientError {
                    if Self.shouldDiscardCachedConversation(after: error) {
                        await self?.discardCachedConversation()
                        break
                    }
                    if case .server(_, let payload) = error, payload.code == "STREAM_REAUTH" {
                        backoff = 250_000_000
                    }
                    try? await Task.sleep(nanoseconds: backoff)
                    backoff = min(backoff * 2, 8_000_000_000)
                } catch {
                    try? await Task.sleep(nanoseconds: backoff)
                    backoff = min(backoff * 2, 8_000_000_000)
                }
            }
        }
    }

    private func consumeStream(
        apiBaseURL: URL,
        connectionID: String,
        lastEventID: String?,
        using session: SessionStore,
        onCursor: @MainActor (String) -> Void
    ) async throws {
        guard let accessToken = session.accessTokenForStreaming else {
            throw SessionError.authenticationRequired
        }
        var components = URLComponents(
            url: apiBaseURL.appending(path: "api/v1/connections/\(connectionID)/events"),
            resolvingAgainstBaseURL: false
        )
        if let lastEventID, !lastEventID.isEmpty {
            components?.queryItems = [URLQueryItem(name: "cursor", value: lastEventID)]
        }
        guard let url = components?.url else { throw APIClientError.invalidResponse }

        var request = URLRequest(url: url)
        request.setValue("text/event-stream", forHTTPHeaderField: "Accept")
        request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
        request.setValue("ios", forHTTPHeaderField: "X-SideSeat-Platform")
        if let lastEventID, !lastEventID.isEmpty {
            request.setValue(lastEventID, forHTTPHeaderField: "Last-Event-ID")
        }
        request.timeoutInterval = 60 * 30

        let (bytes, response) = try await URLSession.shared.bytes(for: request)
        if let http = response as? HTTPURLResponse, !(200..<300).contains(http.statusCode) {
            if http.statusCode == 401 {
                // Refresh for the next reconnect attempt; throw retryable (not auth-fatal).
                do {
                    _ = try await session.refreshAccessTokenForStreaming()
                } catch {
                    throw SessionError.authenticationRequired
                }
                throw APIClientError.server(
                    status: 503,
                    payload: APIErrorPayload(
                        code: "STREAM_REAUTH",
                        message: "Realtime stream reauthorizing.",
                        field: nil,
                        retryable: true,
                        requestId: nil
                    )
                )
            }
            if http.statusCode == 409 {
                await reloadHistory(using: session)
            }
            throw APIClientError.server(
                status: http.statusCode,
                payload: APIErrorPayload(
                    code: "STREAM_ERROR",
                    message: "Realtime stream failed.",
                    field: nil,
                    retryable: true,
                    requestId: nil
                )
            )
        }

        var partial = ""
        for try await line in bytes.lines {
            if Task.isCancelled { break }
            let events = ChatSSEClient.parse(line + "\n", carrying: &partial)
            for event in events {
                if let id = event.id {
                    await MainActor.run { onCursor(id) }
                }
                await handleSSEData(event.data, using: session, onCursor: onCursor)
            }
        }
    }

    private func handleSSEData(
        _ data: String,
        using session: SessionStore,
        onCursor: @MainActor (String) -> Void
    ) async {
        guard let payload = data.data(using: .utf8),
              let event = try? JSONDecoder().decode(NativeChatRealtimeEvent.self, from: payload)
        else { return }

        onCursor(event.cursor)
        realtimeCursor = event.cursor

        switch event.type {
        case "CHAT_MESSAGE_UPSERTED":
            if let message = event.message {
                upsert(message)
                if message.sender.id != currentUserID {
                    scheduleMarkRead(using: session)
                }
            }
        case "CHAT_MESSAGE_REMOVED":
            if let messageID = event.messageId {
                messages.removeAll { $0.id == messageID }
                sendStatuses.removeValue(forKey: messageID)
            }
        case "STREAM_RESET":
            await reloadHistory(using: session)
        case "STREAM_REVOKED":
            await discardCachedConversation()
            return
        case "STREAM_ERROR":
            break
        default:
            if event.reloadHistory == true {
                await reloadHistory(using: session)
            }
        }
        scheduleCachePersist()
    }

    private func reloadHistory(using session: SessionStore) async {
        do {
            let page = try await fetchPage(cursor: nil, using: session)
            conversation = page.data.connection
            let locals = messages.filter { message in
                message.id.hasPrefix("local-") &&
                    (sendStatuses[message.id] == .sending || sendStatuses[message.id] == .failed)
            }
            let localStatuses = Dictionary(
                uniqueKeysWithValues: locals.compactMap { message in
                    sendStatuses[message.id].map { (message.id, $0) }
                }
            )
            messages = page.data.messages
            hasMoreOlder = page.meta.hasMore
            nextCursor = page.meta.nextCursor
            realtimeCursor = page.meta.realtimeCursor
            // Keep in-flight / failed optimistic rows across stream resets.
            for local in locals {
                let echoed = messages.contains {
                    $0.sender.id == currentUserID &&
                        $0.body == local.body &&
                        $0.type == local.type
                }
                if !echoed {
                    messages.append(local)
                    if let status = localStatuses[local.id] {
                        sendStatuses[local.id] = status
                    }
                } else {
                    sendStatuses.removeValue(forKey: local.id)
                }
            }
            messages.sort { lhs, rhs in
                (lhs.createdDate ?? .distantPast) < (rhs.createdDate ?? .distantPast)
                    || ((lhs.createdDate == rhs.createdDate) && lhs.id < rhs.id)
            }
            scheduleCachePersist()
            await markRead(using: session)
        } catch {
            issue = error.localizedDescription
            if Self.shouldDiscardCachedConversation(after: error) {
                await discardCachedConversation()
            }
        }
    }

    private func upsert(_ message: NativeDirectMessage) {
        if let index = messages.firstIndex(where: { $0.id == message.id }) {
            messages[index] = message
        } else {
            // Drop matching in-flight optimistic locals only — keep failed ones for retry.
            if message.sender.id == currentUserID {
                messages.removeAll {
                    $0.id.hasPrefix("local-") &&
                        $0.sender.id == currentUserID &&
                        $0.body == message.body &&
                        $0.type == message.type &&
                        sendStatuses[$0.id] == .sending
                }
            }
            messages.append(message)
            messages.sort(by: Self.messageOrder)
        }
        sendStatuses[message.id] = .sent
        if message.sender.id == currentUserID || message.sender.id == "ui-test-user" {
            publishInboxPreview(for: message)
        }
        scheduleCachePersist()
    }

    private static func messageOrder(_ lhs: NativeDirectMessage, _ rhs: NativeDirectMessage) -> Bool {
        let left = lhs.createdDate ?? .distantPast
        let right = rhs.createdDate ?? .distantPast
        return left == right ? lhs.id < rhs.id : left < right
    }

    private func publishInboxPreview(for message: NativeDirectMessage) {
        let conversationID = message.connectionId.isEmpty ? connectionID : message.connectionId
        guard !conversationID.isEmpty else { return }
        let last = message.asInboxLastMessage()
        NotificationCenter.default.post(
            name: .sideSeatInboxConversationUpdated,
            object: nil,
            userInfo: [
                "conversationID": conversationID,
                "lastMessageID": last.id,
                "type": last.type,
                "body": last.body as Any,
                "imageUrl": last.imageUrl as Any,
                "deletedAt": last.deletedAt as Any,
                "createdAt": last.createdAt,
                "senderID": last.sender.id,
                "senderUsername": last.sender.username,
                "senderNickname": last.sender.nickname as Any,
                "senderAvatarUrl": last.sender.avatarUrl as Any
            ]
        )
    }
}
