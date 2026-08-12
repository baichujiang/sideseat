import Foundation
import SwiftData

struct DirectChatCacheSnapshot: Codable, Sendable {
    let conversation: NativeDirectConversation
    let messages: [NativeDirectMessage]
    let sendStatuses: [String: NativeMessageSendStatus]
    let hasMoreOlder: Bool
    let nextCursor: String?
    let realtimeCursor: String?
    let savedAt: Date

    init(
        conversation: NativeDirectConversation,
        messages: [NativeDirectMessage],
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

enum DirectChatPageReconciler {
    nonisolated static func reconcile(
        cached: [NativeDirectMessage],
        sendStatuses: [String: NativeMessageSendStatus],
        remote: [NativeDirectMessage],
        hasMore: Bool,
        accountID: String
    ) -> (messages: [NativeDirectMessage], sendStatuses: [String: NativeMessageSendStatus]) {
        var statuses = sendStatuses
        let remoteIDs = Set(remote.map(\.id))
        let oldestRemoteDate = remote.compactMap(\.createdDate).min()
        var merged: [String: NativeDirectMessage] = [:]

        for message in cached {
            if message.id.hasPrefix("local-") {
                merged[message.id] = message
                continue
            }
            guard !remoteIDs.contains(message.id) else { continue }
            if hasMore,
               let oldestRemoteDate,
               let messageDate = message.createdDate,
               messageDate < oldestRemoteDate
            {
                merged[message.id] = message
            } else {
                statuses.removeValue(forKey: message.id)
            }
        }

        for message in remote {
            if message.sender.id == accountID {
                let echoedLocalIDs = merged.values.compactMap { local -> String? in
                    guard local.id.hasPrefix("local-"),
                          statuses[local.id] == .sending,
                          local.type == message.type,
                          local.body == message.body
                    else { return nil }
                    return local.id
                }
                for localID in echoedLocalIDs {
                    merged.removeValue(forKey: localID)
                    statuses.removeValue(forKey: localID)
                }
            }
            merged[message.id] = message
            statuses[message.id] = .sent
        }

        return (
            merged.values.sorted(by: messageOrder),
            statuses
        )
    }

    private nonisolated static func messageOrder(
        _ lhs: NativeDirectMessage,
        _ rhs: NativeDirectMessage
    ) -> Bool {
        let left = lhs.createdDate ?? .distantPast
        let right = rhs.createdDate ?? .distantPast
        return left == right ? lhs.id < rhs.id : left < right
    }
}

@Model
final class CachedDirectChatRecord {
    @Attribute(.unique) var key: String
    var accountID: String
    var connectionID: String
    @Attribute(.externalStorage) var snapshotData: Data
    var updatedAt: Date

    init(
        key: String,
        accountID: String,
        connectionID: String,
        snapshotData: Data,
        updatedAt: Date
    ) {
        self.key = key
        self.accountID = accountID
        self.connectionID = connectionID
        self.snapshotData = snapshotData
        self.updatedAt = updatedAt
    }
}

actor DirectChatCache {
    static let shared = DirectChatCache()

    private let container: ModelContainer
    private let encoder = JSONEncoder()
    private let decoder = JSONDecoder()

    init(inMemoryOnly: Bool = false) {
        let schema = Schema([CachedDirectChatRecord.self])
        let configuration = ModelConfiguration(
            "SideSeatDirectChatCache",
            schema: schema,
            isStoredInMemoryOnly: inMemoryOnly
        )
        do {
            container = try ModelContainer(for: schema, configurations: [configuration])
        } catch {
            let fallback = ModelConfiguration(schema: schema, isStoredInMemoryOnly: true)
            container = try! ModelContainer(for: schema, configurations: [fallback])
            #if DEBUG
            print("[chat-cache] Persistent store unavailable; using memory cache: \(error)")
            #endif
        }
    }

    func load(accountID: String, connectionID: String) -> DirectChatCacheSnapshot? {
        let key = Self.key(accountID: accountID, connectionID: connectionID)
        let context = ModelContext(container)
        var descriptor = FetchDescriptor<CachedDirectChatRecord>(
            predicate: #Predicate { $0.key == key }
        )
        descriptor.fetchLimit = 1
        guard let record = try? context.fetch(descriptor).first else { return nil }
        guard let snapshot = try? decoder.decode(
            DirectChatCacheSnapshot.self,
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
        connectionID: String,
        snapshot: DirectChatCacheSnapshot
    ) {
        guard let data = try? encoder.encode(snapshot) else { return }
        let key = Self.key(accountID: accountID, connectionID: connectionID)
        let context = ModelContext(container)
        var descriptor = FetchDescriptor<CachedDirectChatRecord>(
            predicate: #Predicate { $0.key == key }
        )
        descriptor.fetchLimit = 1
        if let record = try? context.fetch(descriptor).first {
            record.snapshotData = data
            record.updatedAt = snapshot.savedAt
        } else {
            context.insert(
                CachedDirectChatRecord(
                    key: key,
                    accountID: accountID,
                    connectionID: connectionID,
                    snapshotData: data,
                    updatedAt: snapshot.savedAt
                )
            )
        }
        try? context.save()
    }

    func merge(
        accountID: String,
        connectionID: String,
        page: NativeDirectMessagePageResponse
    ) {
        let previous = load(accountID: accountID, connectionID: connectionID)
        let reconciled = DirectChatPageReconciler.reconcile(
            cached: previous?.messages ?? [],
            sendStatuses: previous?.sendStatuses ?? [:],
            remote: page.data.messages,
            hasMore: page.meta.hasMore,
            accountID: accountID
        )
        save(
            accountID: accountID,
            connectionID: connectionID,
            snapshot: DirectChatCacheSnapshot(
                conversation: page.data.connection,
                messages: reconciled.messages,
                sendStatuses: reconciled.sendStatuses,
                hasMoreOlder: page.meta.hasMore,
                nextCursor: page.meta.nextCursor,
                realtimeCursor: page.meta.realtimeCursor
            )
        )
    }

    func isFresh(
        accountID: String,
        connectionID: String,
        maxAge: TimeInterval,
        now: Date = Date()
    ) -> Bool {
        guard let snapshot = load(accountID: accountID, connectionID: connectionID) else {
            return false
        }
        return now.timeIntervalSince(snapshot.savedAt) <= maxAge
    }

    func prime(accountID: String, conversation row: NativeInboxConversation) {
        guard row.kind == .direct, let peer = row.peer else { return }
        let previous = load(accountID: accountID, connectionID: row.id)
        let conversation = NativeDirectConversation(
            id: row.id,
            isSelfNotes: row.isSelfNotes,
            displayName: row.displayName,
            peer: peer
        )
        var messages = previous?.messages ?? []
        if let latest = row.lastMessage,
           !messages.contains(where: { $0.id == latest.id })
        {
            messages.append(
                NativeDirectMessage(
                    id: latest.id,
                    connectionId: row.id,
                    sender: latest.sender,
                    type: latest.type,
                    body: latest.body,
                    createdAt: latest.createdAt,
                    imageUrl: latest.imageUrl,
                    deletedAt: latest.deletedAt
                )
            )
            messages.sort(by: Self.messageOrder)
        }
        save(
            accountID: accountID,
            connectionID: row.id,
            snapshot: DirectChatCacheSnapshot(
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
        let descriptor = FetchDescriptor<CachedDirectChatRecord>(
            predicate: #Predicate { $0.accountID == accountID }
        )
        guard let rows = try? context.fetch(descriptor) else { return }
        for row in rows {
            context.delete(row)
        }
        try? context.save()
    }

    private static func key(accountID: String, connectionID: String) -> String {
        "\(accountID)::\(connectionID)"
    }

    private static func messageOrder(_ lhs: NativeDirectMessage, _ rhs: NativeDirectMessage) -> Bool {
        let left = lhs.createdDate ?? .distantPast
        let right = rhs.createdDate ?? .distantPast
        return left == right ? lhs.id < rhs.id : left < right
    }
}

@MainActor
enum DirectChatPreloader {
    private static let freshInterval: TimeInterval = 5 * 60
    private static let preloadCount = 3

    static func primeAndPrefetch(
        payload: NativeInboxPayload,
        using session: SessionStore,
        cache: DirectChatCache = .shared
    ) async {
        guard let accountID = session.currentUser?.id else { return }
        let direct = payload.conversations.filter { $0.kind == .direct }

        for row in direct {
            await cache.prime(accountID: accountID, conversation: row)
        }

        for row in direct.prefix(preloadCount) {
            if await cache.isFresh(
                accountID: accountID,
                connectionID: row.id,
                maxAge: freshInterval
            ) {
                continue
            }
            do {
                let page: NativeDirectMessagePageResponse = try await session.sendAuthorized(
                    "api/v1/connections/\(row.id)/messages",
                    queryItems: [URLQueryItem(name: "limit", value: "30")]
                )
                await cache.merge(
                    accountID: accountID,
                    connectionID: row.id,
                    page: page
                )
            } catch {
                // Prefetch is opportunistic; opening the conversation retries normally.
            }
        }
    }
}
