import Foundation
import Observation

struct NativeInboxPreferenceResult: Decodable, Sendable {
    let pinned: Bool
    let hidden: Bool
}

@MainActor
@Observable
final class InboxStore {
    private(set) var payload: NativeInboxPayload?
    private(set) var isLoading = false
    private(set) var isMutating = false
    private(set) var issue: String?
    var searchQuery = ""
    private var latestRequestID: UUID?
    /// Conversation IDs cleared locally (UI-testing fixtures + optimistic clears).
    private var locallyReadIDs: Set<String> = []
    /// Last outbound preview overlays so fixture/API reloads keep Photo/Location/Plan snippets.
    private static var outboundPreviews: [String: (lastMessage: NativeInboxLastMessage, lastActivityAt: String)] = [:]

    var filteredConversations: [NativeInboxConversation] {
        (payload?.conversations ?? []).filter { InboxChatSearch.matches($0, query: searchQuery) }
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
            && !(payload?.conversations.isEmpty ?? true)
            && filteredConversations.isEmpty
    }

    func load(using session: SessionStore) async {
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
            payload = Self.applyLocalState(to: .uiTestingFixture, readIDs: locallyReadIDs)
            return
        }
        #endif

        do {
            let response: APIEnvelope<NativeInboxPayload> = try await session.sendAuthorized("api/v1/inbox")
            guard latestRequestID == requestID else { return }
            payload = Self.applyLocalState(to: response.data, readIDs: locallyReadIDs)
        } catch is CancellationError {
            return
        } catch {
            guard latestRequestID == requestID else { return }
            issue = error.localizedDescription
        }
    }

    /// Clears the unread badge immediately (opening a thread / mark-read success).
    func clearUnread(conversationID: String) {
        locallyReadIDs.insert(conversationID)
        replaceConversations { rows in
            rows.map { row in
                row.id == conversationID ? row.withUnreadCount(0) : row
            }
        }
    }

    /// Updates the inbox row preview after sending Photo / Location / Plan / Schedule / text.
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
            plansNeedingYourAction: current.plansNeedingYourAction
        )
    }

    private static func applyLocalState(
        to payload: NativeInboxPayload,
        readIDs: Set<String>
    ) -> NativeInboxPayload {
        let conversations = payload.conversations.map { row -> NativeInboxConversation in
            var next = row
            if let overlay = outboundPreviews[row.id] {
                next = next.withLastMessage(overlay.lastMessage, lastActivityAt: overlay.lastActivityAt)
            }
            if readIDs.contains(row.id) {
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
            plansNeedingYourAction: payload.plansNeedingYourAction
        )
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
