import Foundation
import Observation

@MainActor
@Observable
final class CommunityChatStore {
    private(set) var conversation: NativeCommunityConversation?
    private(set) var messages: [NativeCommunityMessage] = []
    private(set) var isLoading = false
    private(set) var isLoadingOlder = false
    private(set) var isSending = false
    private(set) var hasMoreOlder = false
    private(set) var issue: String?
    private(set) var sendIssue: String?
    private(set) var pendingRemoteCount = 0
    private(set) var unreadJumpCount = 0
    private(set) var unreadJumpMessageID: String?
    private(set) var sendStatuses: [String: NativeMessageSendStatus] = [:]
    private(set) var replyTarget: NativeCommunityMessage?

    private var nextCursor: String?
    private var realtimeCursor: String?
    private var streamTask: Task<Void, Never>?
    private var kind: NativeCommunityChatKind = .course
    private var conversationID: String = ""
    private var apiBaseURL: URL?
    private var currentUserID: String = ""
    private var suppressNextScrollDecision = false
    private var markReadTask: Task<Void, Never>?

    func stop() {
        streamTask?.cancel()
        streamTask = nil
        markReadTask?.cancel()
        markReadTask = nil
    }

    func load(
        kind: NativeCommunityChatKind,
        conversationID: String,
        using session: SessionStore,
        apiBaseURL: URL,
        enableRealtime: Bool = true
    ) async {
        stop()
        if self.conversationID != conversationID || self.kind != kind {
            conversation = nil
            messages = []
            sendStatuses = [:]
            replyTarget = nil
            nextCursor = nil
            realtimeCursor = nil
            hasMoreOlder = false
            clearUnreadJump()
        }
        self.kind = kind
        self.conversationID = conversationID
        self.apiBaseURL = apiBaseURL
        currentUserID = session.currentUser?.id ?? ""
        isLoading = true
        issue = nil
        pendingRemoteCount = 0
        suppressNextScrollDecision = false
        defer { isLoading = false }

        let stagedUnread = ChatUnreadLaunch.take(conversationID: conversationID)

        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("--ui-testing-authenticated") {
            let fixture = NativeCommunityMessagePageData.uiTestingFixture(kind: kind)
            conversation = fixture.conversation
            messages = fixture.messages
            hasMoreOlder = false
            nextCursor = nil
            realtimeCursor = "ui-community-cursor"
            currentUserID = "ui-test-user"
            applyUnreadJump(unreadCount: stagedUnread)
            await markRead(using: session)
            return
        }
        #endif

        do {
            let page = try await fetchPage(cursor: nil, using: session)
            conversation = page.data.conversation
            messages = page.data.messages
            hasMoreOlder = page.meta.hasMore
            nextCursor = page.meta.nextCursor
            realtimeCursor = page.meta.realtimeCursor
            applyUnreadJump(unreadCount: stagedUnread)
            await markRead(using: session)
            if enableRealtime {
                startRealtime(using: session)
            }
        } catch {
            issue = error.localizedDescription
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
              !conversationID.isEmpty,
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
        } catch {
            issue = error.localizedDescription
        }
    }

    @discardableResult
    func retryFailedSend(_ messageID: String, using session: SessionStore) async -> Bool {
        guard
            let message = messages.first(where: { $0.id == messageID }),
            sendStatuses[messageID] == .failed,
            let body = message.body?.trimmingCharacters(in: .whitespacesAndNewlines),
            !body.isEmpty,
            !isSending
        else { return false }

        isSending = true
        sendIssue = nil
        sendStatuses[messageID] = .sending
        defer { isSending = false }

        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("--ui-testing-authenticated") {
            sendStatuses[messageID] = .sent
            return true
        }
        #endif

        do {
            let response: APIEnvelope<NativeCommunityMessage>
            switch kind {
            case .course:
                response = try await session.sendAuthorized(
                    "api/v1/courses/\(conversationID)/messages",
                    method: .post,
                    body: NativeCommunityTextMessageRequest(
                        body: body,
                        replyToId: kind.supportsReply ? message.replyTo?.id : nil
                    ),
                    idempotencyKey: UUID().uuidString
                )
            case .group:
                response = try await session.sendAuthorized(
                    "api/v1/group-chats/\(conversationID)/messages",
                    method: .post,
                    body: NativeGroupTextMessageRequest(body: body),
                    idempotencyKey: UUID().uuidString
                )
            }
            messages.removeAll { $0.id == messageID }
            sendStatuses.removeValue(forKey: messageID)
            upsert(response.data)
            return true
        } catch {
            sendStatuses[messageID] = .failed
            sendIssue = error.localizedDescription
            return false
        }
    }

    @discardableResult
    func sendText(
        _ raw: String,
        replyTo: NativeCommunityMessage? = nil,
        using session: SessionStore
    ) async -> Bool {
        let body = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !body.isEmpty, !isSending else { return false }
        isSending = true
        sendIssue = nil
        defer { isSending = false }

        let reply = kind.supportsReply ? (replyTo ?? replyTarget) : nil
        let replyToId = reply?.id

        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("--ui-testing-authenticated") {
            let optimistic = NativeCommunityMessage(
                id: "ui-local-\(UUID().uuidString)",
                conversationId: conversationID.isEmpty ? "ui-\(kind.rawValue.lowercased())" : conversationID,
                sender: NativeChatAuthor(
                    id: currentUserID,
                    username: "test_001",
                    nickname: "Test User",
                    avatarUrl: nil
                ),
                body: body,
                createdAt: ISO8601DateFormatter().string(from: Date()),
                replyTo: reply?.asReplyReference()
            )
            messages.append(optimistic)
            sendStatuses[optimistic.id] = .sent
            pendingRemoteCount = 0
            clearReply()
            return true
        }
        #endif

        let localID = "local-\(UUID().uuidString)"
        let optimistic = NativeCommunityMessage(
            id: localID,
            conversationId: conversationID,
            sender: NativeChatAuthor(
                id: currentUserID,
                username: session.currentUser?.username ?? "me",
                nickname: session.currentUser?.nickname,
                avatarUrl: session.currentUser?.avatarUrl
            ),
            body: body,
            createdAt: ISO8601DateFormatter().string(from: Date()),
            replyTo: reply?.asReplyReference()
        )
        messages.append(optimistic)
        sendStatuses[localID] = .sending
        pendingRemoteCount = 0

        do {
            let response: APIEnvelope<NativeCommunityMessage>
            switch kind {
            case .course:
                response = try await session.sendAuthorized(
                    "api/v1/courses/\(conversationID)/messages",
                    method: .post,
                    body: NativeCommunityTextMessageRequest(body: body, replyToId: replyToId),
                    idempotencyKey: UUID().uuidString
                )
            case .group:
                response = try await session.sendAuthorized(
                    "api/v1/group-chats/\(conversationID)/messages",
                    method: .post,
                    body: NativeGroupTextMessageRequest(body: body),
                    idempotencyKey: UUID().uuidString
                )
            }
            messages.removeAll { $0.id == localID }
            sendStatuses.removeValue(forKey: localID)
            upsert(response.data)
            clearReply()
            return true
        } catch {
            sendStatuses[localID] = .failed
            sendIssue = error.localizedDescription
            return false
        }
    }

    @discardableResult
    func deleteMessage(_ messageID: String, using session: SessionStore) async -> Bool {
        guard kind.supportsDelete,
              let existing = messages.first(where: { $0.id == messageID }),
              existing.sender.id == currentUserID,
              !existing.isDeleted
        else { return false }

        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("--ui-testing-authenticated") {
            upsert(existing.tombstoned(at: "2026-07-17T13:10:00.000Z"))
            if replyTarget?.id == messageID { clearReply() }
            return true
        }
        #endif

        do {
            struct DeleteResult: Decodable, Sendable { let id: String }
            let _: APIEnvelope<DeleteResult> = try await session.sendAuthorized(
                "api/courses/\(conversationID)/chat/messages/\(messageID)",
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
        _ message: NativeCommunityMessage,
        reason: NativeReportReason,
        details: String,
        using session: SessionStore
    ) async -> String? {
        guard kind.supportsReport,
              message.sender.id != currentUserID,
              !message.isDeleted
        else {
            return String(localized: "You can't report this message.")
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
                    courseRoomMessageId: message.id,
                    reason: reason,
                    details: details
                )
            )
            return nil
        } catch {
            return error.localizedDescription
        }
    }

    @discardableResult
    func restoreInbox(using session: SessionStore) async -> Bool {
        guard conversation?.isHiddenFromInbox == true else { return false }

        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("--ui-testing-authenticated") {
            conversation = conversation?.withInboxHidden(false)
            return true
        }
        #endif

        do {
            struct PreferenceResult: Decodable, Sendable {
                let pinned: Bool
                let hidden: Bool
            }
            let _: APIEnvelope<PreferenceResult> = try await session.sendAuthorized(
                "api/v1/\(kind.pathSegment)/\(conversationID)/inbox-restore",
                method: .post
            )
            conversation = conversation?.withInboxHidden(false)
            return true
        } catch {
            issue = error.localizedDescription
            return false
        }
    }

    func beginReply(to message: NativeCommunityMessage) {
        guard kind.supportsReply, !message.isDeleted else { return }
        replyTarget = message
    }

    func clearReply() {
        replyTarget = nil
    }

    func clearPendingRemoteCount() {
        pendingRemoteCount = 0
    }

    func noteRemoteArrivalWhileScrolledUp(count: Int) {
        guard count > 0 else { return }
        pendingRemoteCount += count
    }

    func noteSendIssue(_ message: String) {
        sendIssue = message
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

    private var messagesPath: String {
        "api/v1/\(kind.pathSegment)/\(conversationID)/messages"
    }

    private var readPath: String {
        "api/v1/\(kind.pathSegment)/\(conversationID)/read"
    }

    private var eventsPath: String {
        "api/v1/\(kind.pathSegment)/\(conversationID)/events"
    }

    private func fetchPage(cursor: String?, using session: SessionStore) async throws -> NativeCommunityMessagePageResponse {
        var queryItems: [URLQueryItem] = [URLQueryItem(name: "limit", value: "50")]
        if let cursor {
            queryItems.append(URLQueryItem(name: "cursor", value: cursor))
        }
        return try await session.sendAuthorized(messagesPath, queryItems: queryItems)
    }

    private func markRead(using session: SessionStore) async {
        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("--ui-testing-authenticated") {
            NotificationCenter.default.post(
                name: .sideSeatInboxConversationRead,
                object: nil,
                userInfo: ["conversationID": conversationID]
            )
            return
        }
        #endif

        struct ReadBody: Encodable, Sendable {}
        struct ReadResult: Decodable, Sendable { let readAt: String }
        do {
            let _: APIEnvelope<ReadResult> = try await session.sendAuthorized(
                readPath,
                method: .post,
                body: ReadBody()
            )
            NotificationCenter.default.post(
                name: .sideSeatInboxConversationRead,
                object: nil,
                userInfo: ["conversationID": conversationID]
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
        let eventsPath = eventsPath
        let initialCursor = realtimeCursor
        streamTask = Task { [weak self] in
            var cursor = initialCursor
            var backoff: UInt64 = 500_000_000
            while !Task.isCancelled {
                do {
                    try await self?.consumeStream(
                        apiBaseURL: apiBaseURL,
                        eventsPath: eventsPath,
                        lastEventID: cursor,
                        using: session
                    ) { next in
                        cursor = next
                        backoff = 500_000_000
                    }
                    try await Task.sleep(nanoseconds: 250_000_000)
                } catch is CancellationError {
                    break
                } catch SessionError.authenticationRequired {
                    break
                } catch let error as APIClientError {
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
        eventsPath: String,
        lastEventID: String?,
        using session: SessionStore,
        onCursor: @MainActor (String) -> Void
    ) async throws {
        guard let accessToken = session.accessTokenForStreaming else {
            throw SessionError.authenticationRequired
        }
        var components = URLComponents(
            url: apiBaseURL.appending(path: eventsPath),
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
              let event = try? JSONDecoder().decode(NativeCommunityRealtimeEvent.self, from: payload)
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
        case "STREAM_REVOKED", "STREAM_ERROR", "STREAM_CURSOR":
            break
        default:
            if event.reloadHistory == true {
                await reloadHistory(using: session)
            }
        }
    }

    private func reloadHistory(using session: SessionStore) async {
        do {
            let page = try await fetchPage(cursor: nil, using: session)
            conversation = page.data.conversation
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
            for local in locals {
                let echoed = messages.contains {
                    $0.sender.id == currentUserID && $0.body == local.body
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
            await markRead(using: session)
        } catch {
            issue = error.localizedDescription
        }
    }

    private func upsert(_ message: NativeCommunityMessage) {
        if let index = messages.firstIndex(where: { $0.id == message.id }) {
            messages[index] = message
        } else {
            if message.sender.id == currentUserID {
                messages.removeAll {
                    $0.id.hasPrefix("local-") &&
                        $0.sender.id == currentUserID &&
                        $0.body == message.body &&
                        sendStatuses[$0.id] == .sending
                }
            }
            messages.append(message)
            messages.sort { lhs, rhs in
                (lhs.createdDate ?? .distantPast) < (rhs.createdDate ?? .distantPast)
                    || ((lhs.createdDate == rhs.createdDate) && lhs.id < rhs.id)
            }
        }
        sendStatuses[message.id] = .sent
    }
}
