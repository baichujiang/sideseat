import Foundation
import Observation
import SwiftData

struct NativeInboxPreferenceResult: Decodable, Sendable {
    let pinned: Bool
    let hidden: Bool
}

@MainActor
@Observable
final class InboxStore {
    private(set) var payload: NativeInboxPayload? {
        didSet {
            updateAttentionBadge()
        }
    }
    private(set) var manuallyUnreadIDs: Set<String> = [] {
        didSet { updateAttentionBadge() }
    }
    private(set) var isLoading = false
    private(set) var isMutating = false
    private(set) var issue: String?
    var searchQuery = ""
    private var latestRequestID: UUID?
    private var accountID = ""
    private var cacheWriteTask: Task<Void, Never>?
    private var handledFixtureRequests: Set<String> = []
    private let cache: InboxCache
    private let defaults: UserDefaults
    private var locallyReadMessageIDs: [String: String] = [:]
    private static var outboundPreviews: [String: (lastMessage: NativeInboxLastMessage, lastActivityAt: String)] = [:]

    init(cache: InboxCache = .shared, defaults: UserDefaults = .standard) {
        self.cache = cache
        self.defaults = defaults
    }

    nonisolated static func isMVPVisibleConversationKind(_ kind: NativeInboxConversation.Kind) -> Bool {
        kind == .direct
    }

    var filteredConversations: [NativeInboxConversation] {
        visibleConversations.filter { conversation in
            InboxChatSearch.matches(conversation, query: searchQuery)
        }
    }

    /// MVP Messages is the canonical home for mutual, contextual direct conversations.
    /// Legacy course/group rows remain in payload/cache for compatibility but are not surfaced.
    var visibleConversations: [NativeInboxConversation] {
        (payload?.conversations ?? []).filter {
            Self.isMVPVisibleConversationKind($0.kind)
        }
    }

    var messageRequests: [NativeMutualOpportunity] {
        payload?.messageRequests ?? []
    }

    func removeMessageRequest(_ id: String) {
        handledFixtureRequests.insert(id)
        payload?.messageRequests.removeAll { $0.id == id }
        scheduleCachePersist()
    }

    var pinned: [NativeInboxConversation] {
        filteredConversations.filter(\.pinned)
    }

    var recent: [NativeInboxConversation] {
        filteredConversations.filter { !$0.pinned }
    }

    var hasNoSearchMatches: Bool {
        let trimmed = searchQuery.trimmingCharacters(in: .whitespacesAndNewlines)
        return !trimmed.isEmpty
            && !visibleConversations.isEmpty
            && filteredConversations.isEmpty
    }

    var attentionBadgeLabel: String? {
        Self.badgeLabel(for: Self.attentionCount(in: payload) + manualUnreadAttentionCount)
    }

    var messageBadgeLabel: String? {
        Self.badgeLabel(for: Self.visibleUnreadCount(in: payload) + manualUnreadAttentionCount)
    }

    func isUnread(_ conversation: NativeInboxConversation) -> Bool {
        conversation.unreadCount > 0 || manuallyUnreadIDs.contains(conversation.id)
    }

    private var manualUnreadAttentionCount: Int {
        visibleConversations.filter {
            $0.unreadCount == 0 && manuallyUnreadIDs.contains($0.id)
        }.count
    }

    private func updateAttentionBadge() {
        PushBadgeController.update(Self.attentionCount(in: payload) + manualUnreadAttentionCount)
    }

    private var manualUnreadKey: String { "sideseat.inbox.manualUnread.\(accountID)" }

    private func persistManualUnread() {
        guard !accountID.isEmpty else { return }
        defaults.set(Array(manuallyUnreadIDs), forKey: manualUnreadKey)
    }

    var planBadgeLabel: String? {
        Self.badgeLabel(for: Self.planAttentionCount(in: payload))
    }

    private nonisolated static func visibleUnreadCount(in payload: NativeInboxPayload?) -> Int {
        let unread = payload?.conversations
            .filter { isMVPVisibleConversationKind($0.kind) }
            .reduce(0) { $0 + $1.unreadCount } ?? 0
        return unread + (payload?.messageRequests.filter { $0.messageRequest?.isIncoming == true }.count ?? 0)
    }

    nonisolated static func planAttentionCount(in payload: NativeInboxPayload?) -> Int {
        payload?.plansNeedingYourAction ?? 0
    }

    nonisolated static func attentionCount(in payload: NativeInboxPayload?) -> Int {
        visibleUnreadCount(in: payload) + planAttentionCount(in: payload)
    }

    nonisolated static func badgeLabel(for total: Int) -> String? {
        guard total > 0 else { return nil }
        return total > 99 ? "99+" : String(total)
    }

    func reset() {
        latestRequestID = UUID()
        cacheWriteTask?.cancel()
        cacheWriteTask = nil
        payload = nil
        isLoading = false
        isMutating = false
        issue = nil
        searchQuery = ""
        accountID = ""
        manuallyUnreadIDs = []
        locallyReadMessageIDs = [:]
        handledFixtureRequests = []
    }

    func load(using session: SessionStore) async {
        let requestID = UUID()
        latestRequestID = requestID
        let nextAccountID = session.currentUser?.id ?? ""
        if accountID != nextAccountID {
            payload = nil
            locallyReadMessageIDs = [:]
            accountID = nextAccountID
            #if DEBUG
            if ProcessInfo.processInfo.arguments.contains("--ui-testing-authenticated"),
               ProcessInfo.processInfo.arguments.contains("--ui-testing-reset-inbox-unread") {
                defaults.removeObject(forKey: manualUnreadKey)
            }
            #endif
            manuallyUnreadIDs = Set(defaults.stringArray(forKey: manualUnreadKey) ?? [])
        }
        accountID = nextAccountID
        isLoading = true
        issue = nil
        defer {
            if latestRequestID == requestID { isLoading = false }
        }

        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("--ui-testing-authenticated") {
            guard latestRequestID == requestID else { return }
            payload = Self.applyLocalState(
                to: .uiTestingFixture,
                readMessageIDs: locallyReadMessageIDs
            )
            if ProcessInfo.processInfo.arguments.contains("--ui-testing-inbox-empty") {
                payload = NativeInboxPayload(conversations: [], unreadTotal: 0, plansNeedingYourAction: 0)
            }
            if ProcessInfo.processInfo.arguments.contains("--ui-testing-message-request") {
                var request = NativeMutualOpportunity.uiTestingFixture(id: "cmutualui0000000000000001")
                request.messageRequest = NativeOpportunityMessageRequest(
                    body: AppLocalization.string("Hi! I'd like to join you. Would tomorrow afternoon work?"),
                    direction: "INCOMING", status: "PENDING", createdAt: Date().ISO8601Format())
                if MutualOpportunityStore.fixtureConversations[request.id] == nil {
                    MutualOpportunityStore.fixtureConversations[request.id] = request
                }
            }
            payload?.messageRequests = MutualOpportunityStore.fixtureConversations.values.filter {
                !$0.isReadyToCoordinate && !handledFixtureRequests.contains($0.id)
                    && ($0.messageRequest?.isIncoming == false || $0.messageRequest?.status == "PENDING")
            }.sorted { ($0.messageRequest?.createdAt ?? "") > ($1.messageRequest?.createdAt ?? "") }
            if ProcessInfo.processInfo.arguments.contains("--ui-testing-inbox-refresh-error") {
                issue = AppLocalization.string("Messages unavailable")
            }
            return
        }
        #endif

        if !accountID.isEmpty,
           let snapshot = await cache.load(accountID: accountID)
        {
            guard latestRequestID == requestID else { return }
            payload = Self.applyLocalState(
                to: snapshot.payload,
                readMessageIDs: locallyReadMessageIDs
            )
            isLoading = false
        }

        do {
            let response: APIEnvelope<NativeInboxPayload> = try await session.sendAuthorized("api/v1/inbox")
            guard latestRequestID == requestID else { return }
            reconcileLocalReadMarkers(with: response.data)
            payload = Self.applyLocalState(
                to: response.data,
                readMessageIDs: locallyReadMessageIDs
            )
            await persistCache()
        } catch is CancellationError {
            return
        } catch {
            guard latestRequestID == requestID else { return }
            issue = error.localizedDescription
        }
    }

    func clearUnread(conversationID: String) {
        if manuallyUnreadIDs.remove(conversationID) != nil { persistManualUnread() }
        if let row = payload?.conversations.first(where: { $0.id == conversationID }) {
            locallyReadMessageIDs[conversationID] = row.lastMessage?.id ?? ""
        }
        replaceConversations { rows in
            rows.map { row in
                row.id == conversationID ? row.withUnreadCount(0) : row
            }
        }
    }

    /// Manual unread is a device-local reminder, separate from the server's read cursor.
    @discardableResult
    func toggleUnread(_ conversation: NativeInboxConversation, using session: SessionStore) async -> Bool {
        guard !isMutating, !accountID.isEmpty, accountID == session.currentUser?.id,
              let current = payload?.conversations.first(where: { $0.id == conversation.id }) else { return false }
        issue = nil
        if !isUnread(current) {
            manuallyUnreadIDs.insert(current.id)
            persistManualUnread()
            return true
        }
        if current.unreadCount == 0 {
            clearUnread(conversationID: current.id)
            return true
        }

        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("--ui-testing-authenticated") {
            clearUnread(conversationID: current.id)
            return true
        }
        #endif

        isMutating = true
        let activeAccountID = accountID
        defer { if accountID == activeAccountID { isMutating = false } }
        struct ReadBody: Encodable, Sendable {}
        struct ReadResult: Decodable, Sendable { let readAt: String }
        let path: String
        switch current.kind {
        case .direct: path = "api/v1/connections/\(current.id)/read"
        case .course: path = "api/v1/courses/\(current.id)/read"
        case .group: path = "api/v1/group-chats/\(current.id)/read"
        }
        do {
            let _: APIEnvelope<ReadResult> = try await session.sendAuthorized(path, method: .post, body: ReadBody())
            guard accountID == activeAccountID else { return false }
            clearUnread(conversationID: current.id)
            return true
        } catch {
            if accountID == activeAccountID { issue = error.localizedDescription }
            return false
        }
    }

    func applyOutboundPreview(
        conversationID: String,
        lastMessage: NativeInboxLastMessage,
        lastActivityAt: String
    ) {
        Self.outboundPreviews[conversationID] = (lastMessage, lastActivityAt)
        replaceConversations { rows in
            rows.map { row in
                row.id == conversationID
                    ? row.withLastMessage(lastMessage, lastActivityAt: lastActivityAt)
                    : row
            }
            .sorted { lhs, rhs in
                if lhs.pinned != rhs.pinned { return lhs.pinned && !rhs.pinned }
                return lhs.lastActivityAt > rhs.lastActivityAt
            }
        }
    }

    func applyOutboundPreview(from note: Notification) {
        guard let info = note.userInfo,
              let conversationID = info["conversationID"] as? String,
              let messageID = info["lastMessageID"] as? String,
              let type = info["type"] as? String,
              let createdAt = info["createdAt"] as? String,
              let senderID = info["senderID"] as? String,
              let senderUsername = info["senderUsername"] as? String
        else { return }

        let lastMessage = NativeInboxLastMessage(
            id: messageID,
            sender: NativeChatAuthor(
                id: senderID,
                username: senderUsername,
                nickname: info["senderNickname"] as? String,
                avatarUrl: info["senderAvatarUrl"] as? String
            ),
            type: type,
            body: info["body"] as? String,
            imageUrl: info["imageUrl"] as? String,
            deletedAt: info["deletedAt"] as? String,
            createdAt: createdAt
        )
        applyOutboundPreview(
            conversationID: conversationID,
            lastMessage: lastMessage,
            lastActivityAt: createdAt
        )
    }

    @discardableResult
    func togglePin(_ conversation: NativeInboxConversation, using session: SessionStore) async -> Bool {
        guard !isMutating else { return false }
        isMutating = true
        issue = nil
        defer { isMutating = false }

        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("--ui-testing-authenticated") {
            replaceConversations { rows in
                rows.map { row in
                    row.id == conversation.id ? row.withPinned(!row.pinned) : row
                }
            }
            return true
        }
        #endif

        do {
            let response: APIEnvelope<NativeInboxPreferenceResult> = try await session.sendAuthorized(
                pinPath(for: conversation),
                method: .post
            )
            replaceConversations { rows in
                rows.map { row in
                    row.id == conversation.id ? row.withPinned(response.data.pinned) : row
                }
            }
            return true
        } catch {
            issue = error.localizedDescription
            return false
        }
    }

    @discardableResult
    func hide(_ conversation: NativeInboxConversation, using session: SessionStore) async -> Bool {
        guard conversation.kind == .course || conversation.kind == .group, !isMutating else {
            return false
        }
        isMutating = true
        issue = nil
        defer { isMutating = false }

        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("--ui-testing-authenticated") {
            replaceConversations { rows in
                rows.filter { $0.id != conversation.id }
            }
            return true
        }
        #endif

        do {
            let _: APIEnvelope<NativeInboxPreferenceResult> = try await session.sendAuthorized(
                hidePath(for: conversation),
                method: .post
            )
            replaceConversations { rows in
                rows.filter { $0.id != conversation.id }
            }
            return true
        } catch {
            issue = error.localizedDescription
            return false
        }
    }

    @discardableResult
    func restore(
        kind: NativeInboxConversation.Kind,
        conversationID: String,
        using session: SessionStore
    ) async -> Bool {
        guard kind == .course || kind == .group, !isMutating else { return false }
        isMutating = true
        issue = nil
        defer { isMutating = false }

        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("--ui-testing-authenticated") {
            await load(using: session)
            return true
        }
        #endif

        do {
            let _: APIEnvelope<NativeInboxPreferenceResult> = try await session.sendAuthorized(
                restorePath(kind: kind, conversationID: conversationID),
                method: .post
            )
            await load(using: session)
            return true
        } catch {
            issue = error.localizedDescription
            return false
        }
    }

    private func replaceConversations(
        _ transform: ([NativeInboxConversation]) -> [NativeInboxConversation]
    ) {
        guard let current = payload else { return }
        let conversations = transform(current.conversations)
        payload = NativeInboxPayload(
            conversations: conversations,
            unreadTotal: conversations.reduce(0) { $0 + $1.unreadCount },
            plansNeedingYourAction: current.plansNeedingYourAction,
            planOutcomesNeedingYourResponse: current.planOutcomesNeedingYourResponse,
            actionResponseSummary: current.actionResponseSummary,
            messageRequests: current.messageRequests
        )
        scheduleCachePersist()
    }

    private func persistCache() async {
        guard let payload, !accountID.isEmpty else { return }
        await cache.save(
            accountID: accountID,
            snapshot: InboxCacheSnapshot(payload: payload)
        )
    }

    private func scheduleCachePersist() {
        guard let payload, !accountID.isEmpty else { return }
        let accountID = accountID
        let cache = cache
        let snapshot = InboxCacheSnapshot(payload: payload)
        cacheWriteTask?.cancel()
        cacheWriteTask = Task {
            try? await Task.sleep(nanoseconds: 100_000_000)
            guard !Task.isCancelled else { return }
            await cache.save(accountID: accountID, snapshot: snapshot)
        }
    }

    private static func applyLocalState(
        to payload: NativeInboxPayload,
        readMessageIDs: [String: String]
    ) -> NativeInboxPayload {
        let conversations = payload.conversations.map { row -> NativeInboxConversation in
            var next = row
            if let overlay = outboundPreviews[row.id] {
                next = next.withLastMessage(overlay.lastMessage, lastActivityAt: overlay.lastActivityAt)
            }
            if readMessageIDs[row.id] == (row.lastMessage?.id ?? "") {
                next = next.withUnreadCount(0)
            }
            return next
        }
        .sorted { lhs, rhs in
            if lhs.pinned != rhs.pinned { return lhs.pinned && !rhs.pinned }
            return lhs.lastActivityAt > rhs.lastActivityAt
        }
        return NativeInboxPayload(
            conversations: conversations,
            unreadTotal: conversations.reduce(0) { $0 + $1.unreadCount },
            plansNeedingYourAction: payload.plansNeedingYourAction,
            planOutcomesNeedingYourResponse: payload.planOutcomesNeedingYourResponse,
            actionResponseSummary: payload.actionResponseSummary,
            messageRequests: payload.messageRequests
        )
    }

    private func reconcileLocalReadMarkers(with next: NativeInboxPayload) {
        for row in next.conversations {
            guard let marker = locallyReadMessageIDs[row.id] else { continue }
            let lastMessageID = row.lastMessage?.id ?? ""
            if row.unreadCount == 0 || lastMessageID != marker {
                locallyReadMessageIDs.removeValue(forKey: row.id)
            }
        }
    }

    private func pinPath(for conversation: NativeInboxConversation) -> String {
        switch conversation.kind {
        case .direct: return "api/v1/connections/\(conversation.id)/pin"
        case .course: return "api/v1/courses/\(conversation.id)/inbox-pin"
        case .group: return "api/v1/group-chats/\(conversation.id)/inbox-pin"
        }
    }

    private func hidePath(for conversation: NativeInboxConversation) -> String {
        switch conversation.kind {
        case .course: return "api/v1/courses/\(conversation.id)/inbox-hide"
        case .group: return "api/v1/group-chats/\(conversation.id)/inbox-hide"
        case .direct: return ""
        }
    }

    private func restorePath(kind: NativeInboxConversation.Kind, conversationID: String) -> String {
        switch kind {
        case .course: return "api/v1/courses/\(conversationID)/inbox-restore"
        case .group: return "api/v1/group-chats/\(conversationID)/inbox-restore"
        case .direct: return ""
        }
    }
}

struct InboxCacheSnapshot: Codable, Sendable {
    let payload: NativeInboxPayload
    let savedAt: Date

    init(payload: NativeInboxPayload, savedAt: Date = Date()) {
        self.payload = payload
        self.savedAt = savedAt
    }
}

@Model
final class CachedInboxRecord {
    @Attribute(.unique) var accountID: String
    @Attribute(.externalStorage) var snapshotData: Data
    var updatedAt: Date

    init(accountID: String, snapshotData: Data, updatedAt: Date) {
        self.accountID = accountID
        self.snapshotData = snapshotData
        self.updatedAt = updatedAt
    }
}

actor InboxCache {
    static let shared = InboxCache()

    private let container: ModelContainer
    private let encoder = JSONEncoder()
    private let decoder = JSONDecoder()

    init(inMemoryOnly: Bool = false) {
        let schema = Schema([CachedInboxRecord.self])
        let configuration = ModelConfiguration(
            "SideSeatInboxCache",
            schema: schema,
            isStoredInMemoryOnly: inMemoryOnly
        )
        do {
            container = try ModelContainer(for: schema, configurations: [configuration])
        } catch {
            let fallback = ModelConfiguration(schema: schema, isStoredInMemoryOnly: true)
            container = try! ModelContainer(for: schema, configurations: [fallback])
            #if DEBUG
            print("[inbox-cache] Persistent store unavailable; using memory cache: \(error)")
            #endif
        }
    }

    func load(accountID: String) -> InboxCacheSnapshot? {
        let context = ModelContext(container)
        var descriptor = FetchDescriptor<CachedInboxRecord>(
            predicate: #Predicate { $0.accountID == accountID }
        )
        descriptor.fetchLimit = 1
        guard let record = try? context.fetch(descriptor).first else { return nil }
        guard let snapshot = try? decoder.decode(InboxCacheSnapshot.self, from: record.snapshotData) else {
            context.delete(record)
            try? context.save()
            return nil
        }
        return snapshot
    }

    func save(accountID: String, snapshot: InboxCacheSnapshot) {
        guard let data = try? encoder.encode(snapshot) else { return }
        let context = ModelContext(container)
        var descriptor = FetchDescriptor<CachedInboxRecord>(
            predicate: #Predicate { $0.accountID == accountID }
        )
        descriptor.fetchLimit = 1
        if let record = try? context.fetch(descriptor).first {
            record.snapshotData = data
            record.updatedAt = snapshot.savedAt
        } else {
            context.insert(
                CachedInboxRecord(
                    accountID: accountID,
                    snapshotData: data,
                    updatedAt: snapshot.savedAt
                )
            )
        }
        try? context.save()
    }

    func removeAccount(_ accountID: String) {
        let context = ModelContext(container)
        let descriptor = FetchDescriptor<CachedInboxRecord>(
            predicate: #Predicate { $0.accountID == accountID }
        )
        guard let rows = try? context.fetch(descriptor) else { return }
        for row in rows { context.delete(row) }
        try? context.save()
    }
}
