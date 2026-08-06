import Foundation
import SwiftData

enum NativeCommunityChatKind: String, Codable, Hashable, Sendable {
    case course = "COURSE"
    case group = "GROUP"

    var pathSegment: String {
        switch self {
        case .course: return "courses"
        case .group: return "group-chats"
        }
    }

    var accessibilityRootID: String {
        switch self {
        case .course: return "course-chat"
        case .group: return "group-chat"
        }
    }

    var supportsReply: Bool { true }
    var supportsDelete: Bool { true }
    var supportsReport: Bool { true }
}

struct NativeCommunityConversation: Codable, Hashable, Sendable {
    let kind: String
    let id: String
    let name: String?
    let code: String?
    let school: String?
    let semesterLabel: String?
    let memberCount: Int?
    let title: String?
    let customTitle: String?
    let participants: [NativeChatAuthor]?
    let inboxHidden: Bool?

    var isHiddenFromInbox: Bool { inboxHidden == true }

    var displayName: String {
        if kind == NativeCommunityChatKind.course.rawValue {
            let trimmed = name?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
            return trimmed.isEmpty ? String(localized: "Course chat") : trimmed
        }
        let trimmedTitle = title?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        if !trimmedTitle.isEmpty { return trimmedTitle }
        let custom = customTitle?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        return custom.isEmpty ? String(localized: "Group chat") : custom
    }

    init(
        kind: String,
        id: String,
        name: String?,
        code: String?,
        school: String?,
        semesterLabel: String?,
        memberCount: Int?,
        title: String?,
        customTitle: String?,
        participants: [NativeChatAuthor]?,
        inboxHidden: Bool? = nil
    ) {
        self.kind = kind
        self.id = id
        self.name = name
        self.code = code
        self.school = school
        self.semesterLabel = semesterLabel
        self.memberCount = memberCount
        self.title = title
        self.customTitle = customTitle
        self.participants = participants
        self.inboxHidden = inboxHidden
    }

    func withInboxHidden(_ hidden: Bool) -> NativeCommunityConversation {
        NativeCommunityConversation(
            kind: kind,
            id: id,
            name: name,
            code: code,
            school: school,
            semesterLabel: semesterLabel,
            memberCount: memberCount,
            title: title,
            customTitle: customTitle,
            participants: participants,
            inboxHidden: hidden
        )
    }
}

struct NativeCommunityMessageReply: Codable, Hashable, Sendable {
    let id: String
    let sender: NativeChatAuthor
    let body: String?
    let deletedAt: String?

    var isDeleted: Bool { deletedAt != nil }

    var previewText: String {
        if isDeleted { return String(localized: "Message deleted") }
        let trimmed = body?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        return trimmed.isEmpty ? String(localized: "Message") : trimmed
    }
}

struct NativeCommunityMessage: Codable, Identifiable, Hashable, Sendable {
    let id: String
    let conversationId: String
    let sender: NativeChatAuthor
    let type: String
    let body: String?
    let replyTo: NativeCommunityMessageReply?
    let deletedAt: String?
    let createdAt: String

    init(
        id: String,
        conversationId: String,
        sender: NativeChatAuthor,
        type: String = "TEXT",
        body: String?,
        createdAt: String,
        replyTo: NativeCommunityMessageReply? = nil,
        deletedAt: String? = nil
    ) {
        self.id = id
        self.conversationId = conversationId
        self.sender = sender
        self.type = type
        self.body = body
        self.replyTo = replyTo
        self.deletedAt = deletedAt
        self.createdAt = createdAt
    }

    var isDeleted: Bool { deletedAt != nil }

    var createdDate: Date? {
        Date.sideSeatCommunityISO8601(createdAt)
    }

    var previewText: String {
        if isDeleted { return String(localized: "Message deleted") }
        let trimmed = body?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        return trimmed.isEmpty ? String(localized: "Message") : trimmed
    }

    func asReplyReference() -> NativeCommunityMessageReply {
        NativeCommunityMessageReply(
            id: id,
            sender: sender,
            body: body,
            deletedAt: deletedAt
        )
    }

    func tombstoned(at isoDate: String = ISO8601DateFormatter().string(from: Date())) -> NativeCommunityMessage {
        NativeCommunityMessage(
            id: id,
            conversationId: conversationId,
            sender: sender,
            type: type,
            body: nil,
            createdAt: createdAt,
            replyTo: replyTo,
            deletedAt: isoDate
        )
    }
}

struct NativeCommunityMessagePageData: Decodable, Sendable {
    let conversation: NativeCommunityConversation
    let messages: [NativeCommunityMessage]
}

struct NativeCommunityMessagePageMeta: Decodable, Sendable {
    let hasMore: Bool
    let nextCursor: String?
    let realtimeCursor: String
}

struct NativeCommunityMessagePageResponse: Decodable, Sendable {
    let data: NativeCommunityMessagePageData
    let meta: NativeCommunityMessagePageMeta
}

struct NativeCommunityTextMessageRequest: Encodable, Sendable {
    let body: String
    let replyToId: String?

    init(body: String, replyToId: String? = nil) {
        self.body = body
        self.replyToId = replyToId
    }

    private enum CodingKeys: String, CodingKey {
        case body, replyToId
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(body, forKey: .body)
        try container.encodeIfPresent(replyToId, forKey: .replyToId)
    }
}

struct NativeCommunityRealtimeEvent: Decodable, Sendable {
    let schemaVersion: Int
    let type: String
    let conversation: NativeChatRealtimeConversation
    let cursor: String
    let occurredAt: String
    let resumed: Bool?
    let message: NativeCommunityMessage?
    let messageId: String?
    let reason: String?
    let reloadHistory: Bool?
    let retryable: Bool?
    let requestId: String?
}

extension NativeCommunityMessagePageData {
    static func uiTestingFixture(kind: NativeCommunityChatKind) -> NativeCommunityMessagePageData {
        #if DEBUG
        UITestingChatFixtures.communityPage(kind: kind)
        #else
        NativeCommunityMessagePageData(
            conversation: NativeCommunityConversation(
                kind: kind == .course ? "COURSE" : "GROUP",
                id: "empty",
                name: nil,
                code: nil,
                school: nil,
                semesterLabel: nil,
                memberCount: nil,
                title: nil,
                customTitle: nil,
                participants: nil,
                inboxHidden: false
            ),
            messages: []
        )
        #endif
    }
}

extension Date {
    fileprivate static func sideSeatCommunityISO8601(_ value: String) -> Date? {
        let fractional = ISO8601DateFormatter()
        fractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return fractional.date(from: value) ?? ISO8601DateFormatter().date(from: value)
    }
}

// MARK: - Local-first cache

struct CommunityChatCacheSnapshot: Codable, Sendable {
    let conversation: NativeCommunityConversation
    let messages: [NativeCommunityMessage]
    let sendStatuses: [String: NativeMessageSendStatus]
    let hasMoreOlder: Bool
    let nextCursor: String?
    let realtimeCursor: String?
    let savedAt: Date

    init(
        conversation: NativeCommunityConversation,
        messages: [NativeCommunityMessage],
        sendStatuses: [String: NativeMessageSendStatus] = [:],
        hasMoreOlder: Bool,
        nextCursor: String?,
        realtimeCursor: String?,
        savedAt: Date = Date()
    ) {
        self.conversation = conversation
        self.messages = Array(messages.suffix(200))
        self.sendStatuses = sendStatuses
        self.hasMoreOlder = hasMoreOlder
        self.nextCursor = nextCursor
        self.realtimeCursor = realtimeCursor
        self.savedAt = savedAt
    }
}

@Model
final class CachedCommunityChatRecord {
    @Attribute(.unique) var key: String
    var accountID: String
    var kindRawValue: String
    var conversationID: String
    @Attribute(.externalStorage) var snapshotData: Data
    var updatedAt: Date

    init(
        key: String,
        accountID: String,
        kindRawValue: String,
        conversationID: String,
        snapshotData: Data,
        updatedAt: Date
    ) {
        self.key = key
        self.accountID = accountID
        self.kindRawValue = kindRawValue
        self.conversationID = conversationID
        self.snapshotData = snapshotData
        self.updatedAt = updatedAt
    }
}

actor CommunityChatCache {
    static let shared = CommunityChatCache()

    private let container: ModelContainer
    private let encoder = JSONEncoder()
    private let decoder = JSONDecoder()

    init(inMemoryOnly: Bool = false) {
        let schema = Schema([CachedCommunityChatRecord.self])
        let configuration = ModelConfiguration(
            "SideSeatCommunityChatCache",
            schema: schema,
            isStoredInMemoryOnly: inMemoryOnly
        )
        do {
            container = try ModelContainer(for: schema, configurations: [configuration])
        } catch {
            let fallback = ModelConfiguration(schema: schema, isStoredInMemoryOnly: true)
            container = try! ModelContainer(for: schema, configurations: [fallback])
            #if DEBUG
            print("[community-chat-cache] Persistent store unavailable; using memory cache: \(error)")
            #endif
        }
    }

    func load(
        accountID: String,
        kind: NativeCommunityChatKind,
        conversationID: String
    ) -> CommunityChatCacheSnapshot? {
        let key = Self.key(accountID: accountID, kind: kind, conversationID: conversationID)
        let context = ModelContext(container)
        var descriptor = FetchDescriptor<CachedCommunityChatRecord>(
            predicate: #Predicate { $0.key == key }
        )
        descriptor.fetchLimit = 1
        guard let record = try? context.fetch(descriptor).first else { return nil }
        guard let snapshot = try? decoder.decode(
            CommunityChatCacheSnapshot.self,
            from: record.snapshotData
        ) else {
            context.delete(record)
            try? context.save()
            return nil
        }
        return snapshot
    }

    func save(
        accountID: String,
        kind: NativeCommunityChatKind,
        conversationID: String,
        snapshot: CommunityChatCacheSnapshot
    ) {
        guard let data = try? encoder.encode(snapshot) else { return }
        let key = Self.key(accountID: accountID, kind: kind, conversationID: conversationID)
        let context = ModelContext(container)
        var descriptor = FetchDescriptor<CachedCommunityChatRecord>(
            predicate: #Predicate { $0.key == key }
        )
        descriptor.fetchLimit = 1
        if let record = try? context.fetch(descriptor).first {
            record.snapshotData = data
            record.updatedAt = snapshot.savedAt
        } else {
            context.insert(
                CachedCommunityChatRecord(
                    key: key,
                    accountID: accountID,
                    kindRawValue: kind.rawValue,
                    conversationID: conversationID,
                    snapshotData: data,
                    updatedAt: snapshot.savedAt
                )
            )
        }
        try? context.save()
    }

    func merge(
        accountID: String,
        kind: NativeCommunityChatKind,
        conversationID: String,
        page: NativeCommunityMessagePageResponse
    ) {
        let previous = load(accountID: accountID, kind: kind, conversationID: conversationID)
        var statuses = previous?.sendStatuses ?? [:]
        var merged = Dictionary(
            uniqueKeysWithValues: (previous?.messages ?? []).map { ($0.id, $0) }
        )
        for remote in page.data.messages {
            if remote.sender.id == accountID {
                let echoedLocalIDs = merged.values.compactMap { local -> String? in
                    guard local.id.hasPrefix("local-"),
                          statuses[local.id] == .sending,
                          local.type == remote.type,
                          local.body == remote.body
                    else { return nil }
                    return local.id
                }
                for localID in echoedLocalIDs {
                    merged.removeValue(forKey: localID)
                    statuses.removeValue(forKey: localID)
                }
            }
            merged[remote.id] = remote
            statuses[remote.id] = .sent
        }
        save(
            accountID: accountID,
            kind: kind,
            conversationID: conversationID,
            snapshot: CommunityChatCacheSnapshot(
                conversation: page.data.conversation,
                messages: merged.values.sorted(by: Self.messageOrder),
                sendStatuses: statuses,
                hasMoreOlder: page.meta.hasMore,
                nextCursor: page.meta.nextCursor,
                realtimeCursor: page.meta.realtimeCursor
            )
        )
    }

    func isFresh(
        accountID: String,
        kind: NativeCommunityChatKind,
        conversationID: String,
        maxAge: TimeInterval,
        now: Date = Date()
    ) -> Bool {
        guard let snapshot = load(
            accountID: accountID,
            kind: kind,
            conversationID: conversationID
        ) else { return false }
        return now.timeIntervalSince(snapshot.savedAt) <= maxAge
    }

    func prime(accountID: String, conversation row: NativeInboxConversation) {
        guard let kind = NativeCommunityChatKind(inboxKind: row.kind) else { return }
        let previous = load(accountID: accountID, kind: kind, conversationID: row.id)
        let conversation = Self.conversation(from: row, kind: kind)
        var messages = previous?.messages ?? []
        if let latest = row.lastMessage,
           !messages.contains(where: { $0.id == latest.id })
        {
            messages.append(
                NativeCommunityMessage(
                    id: latest.id,
                    conversationId: row.id,
                    sender: latest.sender,
                    type: latest.type,
                    body: latest.body,
                    createdAt: latest.createdAt,
                    deletedAt: latest.deletedAt
                )
            )
            messages.sort(by: Self.messageOrder)
        }
        save(
            accountID: accountID,
            kind: kind,
            conversationID: row.id,
            snapshot: CommunityChatCacheSnapshot(
                conversation: conversation,
                messages: messages,
                sendStatuses: previous?.sendStatuses ?? [:],
                hasMoreOlder: previous?.hasMoreOlder ?? true,
                nextCursor: previous?.nextCursor,
                realtimeCursor: previous?.realtimeCursor,
                savedAt: previous?.savedAt ?? .distantPast
            )
        )
    }

    func removeAccount(_ accountID: String) {
        let context = ModelContext(container)
        let descriptor = FetchDescriptor<CachedCommunityChatRecord>(
            predicate: #Predicate { $0.accountID == accountID }
        )
        guard let rows = try? context.fetch(descriptor) else { return }
        for row in rows {
            context.delete(row)
        }
        try? context.save()
    }

    private static func key(
        accountID: String,
        kind: NativeCommunityChatKind,
        conversationID: String
    ) -> String {
        "\(accountID)::\(kind.rawValue)::\(conversationID)"
    }

    private static func conversation(
        from row: NativeInboxConversation,
        kind: NativeCommunityChatKind
    ) -> NativeCommunityConversation {
        switch kind {
        case .course:
            return NativeCommunityConversation(
                kind: kind.rawValue,
                id: row.id,
                name: row.course?.name ?? row.displayName,
                code: row.course?.code,
                school: row.course?.school,
                semesterLabel: row.course?.semesterLabel,
                memberCount: nil,
                title: nil,
                customTitle: nil,
                participants: nil,
                inboxHidden: false
            )
        case .group:
            return NativeCommunityConversation(
                kind: kind.rawValue,
                id: row.id,
                name: nil,
                code: nil,
                school: nil,
                semesterLabel: nil,
                memberCount: row.group?.participantCount,
                title: row.displayName,
                customTitle: nil,
                participants: row.group?.participants,
                inboxHidden: false
            )
        }
    }

    private static func messageOrder(
        _ lhs: NativeCommunityMessage,
        _ rhs: NativeCommunityMessage
    ) -> Bool {
        let left = lhs.createdDate ?? .distantPast
        let right = rhs.createdDate ?? .distantPast
        return left == right ? lhs.id < rhs.id : left < right
    }
}

private extension NativeCommunityChatKind {
    init?(inboxKind: NativeInboxConversation.Kind) {
        switch inboxKind {
        case .direct: return nil
        case .course: self = .course
        case .group: self = .group
        }
    }
}

@MainActor
enum CommunityChatPreloader {
    private static let freshInterval: TimeInterval = 5 * 60
    private static let preloadCount = 3

    static func primeAndPrefetch(
        payload: NativeInboxPayload,
        using session: SessionStore,
        cache: CommunityChatCache = .shared
    ) async {
        guard let accountID = session.currentUser?.id else { return }
        let rows = payload.conversations.filter { $0.kind == .course || $0.kind == .group }

        for row in rows {
            await cache.prime(accountID: accountID, conversation: row)
        }

        for row in rows.prefix(preloadCount) {
            guard let kind = NativeCommunityChatKind(inboxKind: row.kind) else { continue }
            if await cache.isFresh(
                accountID: accountID,
                kind: kind,
                conversationID: row.id,
                maxAge: freshInterval
            ) {
                continue
            }
            do {
                let page: NativeCommunityMessagePageResponse = try await session.sendAuthorized(
                    "api/v1/\(kind.pathSegment)/\(row.id)/messages",
                    queryItems: [URLQueryItem(name: "limit", value: "30")]
                )
                await cache.merge(
                    accountID: accountID,
                    kind: kind,
                    conversationID: row.id,
                    page: page
                )
            } catch {
                // Prefetch is opportunistic; opening the conversation retries normally.
            }
        }
    }
}
