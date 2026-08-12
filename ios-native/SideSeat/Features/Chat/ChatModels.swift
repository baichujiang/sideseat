import Foundation
import SwiftUI
import UIKit

struct ChatTransientNotice: Identifiable, Equatable {
    let id = UUID()
    let text: String
    let systemImage: String
}

struct ChatTransientNoticeView: View {
    let notice: ChatTransientNotice

    var body: some View {
        Label(notice.text, systemImage: notice.systemImage)
            .font(.footnote.weight(.semibold))
            .foregroundStyle(SideSeatTheme.textPrimary)
            .padding(.horizontal, 13)
            .padding(.vertical, 9)
            .background(.regularMaterial, in: Capsule())
            .overlay {
                Capsule()
                    .strokeBorder(Color.primary.opacity(0.08), lineWidth: 1)
            }
            .shadow(color: .black.opacity(0.12), radius: 10, y: 4)
            .transition(.move(edge: .bottom).combined(with: .opacity))
            .allowsHitTesting(false)
            .accessibilityElement(children: .combine)
            .accessibilityLabel(notice.text)
            .accessibilityIdentifier("chat-action-notice")
    }
}

struct ChatMessageContextMenuTarget<Content: View, Menu: View>: View {
    let isEnabled: Bool
    private let content: Content
    private let menu: Menu

    init(
        isEnabled: Bool,
        @ViewBuilder content: () -> Content,
        @ViewBuilder menu: () -> Menu
    ) {
        self.isEnabled = isEnabled
        self.content = content()
        self.menu = menu()
    }

    @ViewBuilder
    var body: some View {
        if isEnabled {
            content
                .contentShape(.interaction, Rectangle())
                .contentShape(
                    .contextMenuPreview,
                    RoundedRectangle(cornerRadius: SideSeatTheme.Chat.bubbleRadius, style: .continuous)
                )
                .contextMenu { menu }
        } else {
            content
        }
    }
}

@MainActor
@Observable
final class ChatComposerDraft {
    private enum PresentationState: Equatable {
        case empty
        case whitespaceOnly
        case sendable
    }

    @ObservationIgnored private(set) var text = ""
    private var presentationState = PresentationState.empty
    private(set) var resetVersion = 0

    var isEmpty: Bool { presentationState == .empty }
    var canSend: Bool { presentationState == .sendable }

    var trimmedText: String {
        text.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    func updateText(_ value: String) {
        text = value
        let nextState: PresentationState
        if value.isEmpty {
            nextState = .empty
        } else if value.contains(where: { !$0.isWhitespace }) {
            nextState = .sendable
        } else {
            nextState = .whitespaceOnly
        }
        if presentationState != nextState {
            presentationState = nextState
        }
    }

    func clear() {
        guard !text.isEmpty else { return }
        text = ""
        presentationState = .empty
        resetVersion &+= 1
    }
}

@MainActor
final class ChatComposerFocusController {
    private weak var textView: UITextView?

    var isFocused: Bool {
        textView?.isFirstResponder == true
    }

    func attach(_ textView: UITextView) {
        self.textView = textView
    }

    func detach(_ textView: UITextView) {
        guard self.textView === textView else { return }
        self.textView = nil
    }

    func focus() {
        textView?.becomeFirstResponder()
    }

    func blur() {
        textView?.resignFirstResponder()
    }
}

enum ChatComposerReturnKey {
    static func textBeforeInsertedReturn(previous: String, current: String) -> String? {
        guard current.count == previous.count + 1 else { return nil }

        for index in current.indices where current[index] == "\n" {
            var candidate = current
            candidate.remove(at: index)
            if candidate == previous {
                return candidate
            }
        }
        return nil
    }
}

struct NativeInboxPayload: Codable, Sendable {
    let conversations: [NativeInboxConversation]
    let unreadTotal: Int
    let plansNeedingYourAction: Int

    init(
        conversations: [NativeInboxConversation],
        unreadTotal: Int,
        plansNeedingYourAction: Int
    ) {
        self.conversations = conversations
        self.unreadTotal = unreadTotal
        self.plansNeedingYourAction = plansNeedingYourAction
    }
}

struct NativeInboxConversation: Codable, Identifiable, Hashable, Sendable {
    enum Kind: String, Codable, Sendable {
        case direct = "DIRECT"
        case course = "COURSE"
        case group = "GROUP"
    }

    let kind: Kind
    let id: String
    let displayName: String
    let avatarUrl: String?
    let participantAvatars: [String]
    let unreadCount: Int
    let pinned: Bool
    let lastActivityAt: String
    let peer: NativeChatAuthor?
    let isSelfNotes: Bool
    let course: NativeInboxCourseRef?
    let group: NativeInboxGroupRef?
    let lastMessage: NativeInboxLastMessage?

    var route: AppRoute? {
        switch kind {
        case .direct: return .directChat(connectionID: id)
        case .course: return .courseChat(courseID: id)
        case .group: return .groupChat(groupChatID: id)
        }
    }

    var previewText: String {
        contentPreview
    }

    /// Inbox row preview with sender prefix for multi-party rooms / own messages.
    func listPreview(currentUserID: String?) -> String {
        guard let lastMessage else { return contentPreview }
        let content = contentPreview
        if kind == .direct {
            if let currentUserID, lastMessage.sender.id == currentUserID, lastMessage.deletedAt == nil {
                return "\(String(localized: "You")): \(content)"
            }
            return content
        }
        let name: String
        if let currentUserID, lastMessage.sender.id == currentUserID {
            name = String(localized: "You")
        } else {
            name = lastMessage.sender.displayName
        }
        return "\(name): \(content)"
    }

    private var contentPreview: String {
        guard let lastMessage else { return String(localized: "No messages yet") }
        if lastMessage.deletedAt != nil { return String(localized: "Message deleted") }
        switch lastMessage.type {
        case "IMAGE": return String(localized: "Photo")
        case "LOCATION": return String(localized: "Location")
        case "SCHEDULE_SHARE_CARD": return String(localized: "Shared schedule")
        case "AVAILABILITY_CARD": return String(localized: "Shared availability")
        case "PLAN_REQUEST_CARD":
            return titledPreview(prefix: String(localized: "Plan invite"), body: lastMessage.body)
        case "PLAN_CONFIRMED_CARD":
            return titledPreview(prefix: String(localized: "Plan confirmed"), body: lastMessage.body)
        case "SYSTEM":
            let body = lastMessage.body?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
            return body.isEmpty ? String(localized: "Update") : body
        default:
            let body = lastMessage.body?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
            if body.isEmpty { return String(localized: "New message") }
            return body
        }
    }

    private func titledPreview(prefix: String, body: String?) -> String {
        let title = body?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        return title.isEmpty ? prefix : "\(prefix) · \(title)"
    }

    var supportsHide: Bool { kind == .course || kind == .group }

    /// Members for WeChat-style group collage (up to 9). Prefers full participant list.
    var compositeAvatarMembers: [GroupCompositeAvatar.Member] {
        if let participants = group?.participants, !participants.isEmpty {
            return participants.prefix(9).map {
                GroupCompositeAvatar.Member(name: $0.displayName, url: $0.avatarUrl)
            }
        }
        return participantAvatars.prefix(9).map {
            GroupCompositeAvatar.Member(name: displayName, url: $0)
        }
    }

    var usesCompositeAvatar: Bool {
        kind == .group
            && (avatarUrl?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ?? true)
            && !compositeAvatarMembers.isEmpty
    }

    func withPinned(_ pinned: Bool) -> NativeInboxConversation {
        NativeInboxConversation(
            kind: kind,
            id: id,
            displayName: displayName,
            avatarUrl: avatarUrl,
            participantAvatars: participantAvatars,
            unreadCount: unreadCount,
            pinned: pinned,
            lastActivityAt: lastActivityAt,
            peer: peer,
            isSelfNotes: isSelfNotes,
            course: course,
            group: group,
            lastMessage: lastMessage
        )
    }

    func withUnreadCount(_ unreadCount: Int) -> NativeInboxConversation {
        NativeInboxConversation(
            kind: kind,
            id: id,
            displayName: displayName,
            avatarUrl: avatarUrl,
            participantAvatars: participantAvatars,
            unreadCount: unreadCount,
            pinned: pinned,
            lastActivityAt: lastActivityAt,
            peer: peer,
            isSelfNotes: isSelfNotes,
            course: course,
            group: group,
            lastMessage: lastMessage
        )
    }

    func withLastMessage(
        _ lastMessage: NativeInboxLastMessage,
        lastActivityAt: String
    ) -> NativeInboxConversation {
        NativeInboxConversation(
            kind: kind,
            id: id,
            displayName: displayName,
            avatarUrl: avatarUrl,
            participantAvatars: participantAvatars,
            unreadCount: unreadCount,
            pinned: pinned,
            lastActivityAt: lastActivityAt,
            peer: peer,
            isSelfNotes: isSelfNotes,
            course: course,
            group: group,
            lastMessage: lastMessage
        )
    }

    init(
        kind: Kind,
        id: String,
        displayName: String,
        avatarUrl: String?,
        participantAvatars: [String],
        unreadCount: Int,
        pinned: Bool,
        lastActivityAt: String,
        peer: NativeChatAuthor?,
        isSelfNotes: Bool,
        course: NativeInboxCourseRef?,
        group: NativeInboxGroupRef?,
        lastMessage: NativeInboxLastMessage?
    ) {
        self.kind = kind
        self.id = id
        self.displayName = displayName
        self.avatarUrl = avatarUrl
        self.participantAvatars = participantAvatars
        self.unreadCount = unreadCount
        self.pinned = pinned
        self.lastActivityAt = lastActivityAt
        self.peer = peer
        self.isSelfNotes = isSelfNotes
        self.course = course
        self.group = group
        self.lastMessage = lastMessage
    }
}

struct NativeInboxCourseRef: Codable, Hashable, Sendable {
    let id: String
    let name: String
    let code: String?
    let school: String?
    let semesterLabel: String?
}

struct NativeInboxGroupRef: Codable, Hashable, Sendable {
    let id: String
    let participantCount: Int
    let participants: [NativeChatAuthor]
}

struct NativeInboxLastMessage: Codable, Hashable, Sendable {
    let id: String
    let sender: NativeChatAuthor
    let type: String
    let body: String?
    let imageUrl: String?
    let deletedAt: String?
    let createdAt: String
}

struct NativeChatAuthor: Codable, Hashable, Sendable, Identifiable {
    let id: String
    let username: String
    let nickname: String?
    let avatarUrl: String?

    var displayName: String {
        let trimmed = nickname?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        return trimmed.isEmpty ? username : trimmed
    }
}

struct NativeDirectMessagePageData: Decodable, Sendable {
    let connection: NativeDirectConversation
    let messages: [NativeDirectMessage]
}

struct NativeDirectMessagePageMeta: Decodable, Sendable {
    let hasMore: Bool
    let nextCursor: String?
    let realtimeCursor: String
}

struct NativeDirectMessagePageResponse: Decodable, Sendable {
    let data: NativeDirectMessagePageData
    let meta: NativeDirectMessagePageMeta
}

struct NativeDirectConversation: Codable, Sendable {
    let id: String
    let isSelfNotes: Bool
    let replyLimitUnlocked: Bool?
    let displayName: String
    let peer: NativeChatAuthor

    init(
        id: String,
        isSelfNotes: Bool,
        replyLimitUnlocked: Bool? = nil,
        displayName: String,
        peer: NativeChatAuthor
    ) {
        self.id = id
        self.isSelfNotes = isSelfNotes
        self.replyLimitUnlocked = replyLimitUnlocked
        self.displayName = displayName
        self.peer = peer
    }
}

struct NativePlanAuthor: Codable, Hashable, Sendable {
    let id: String
    let username: String
    let nickname: String?
    let avatarUrl: String?

    var displayName: String {
        let nick = nickname?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        return nick.isEmpty ? username : nick
    }
}

struct NativePlanRequest: Codable, Identifiable, Hashable, Sendable {
    let id: String
    let connectionId: String
    let status: String
    let planType: String
    let title: String
    let location: String?
    let message: String?
    let startTime: String
    let endTime: String
    let proposer: NativePlanAuthor
    let receiver: NativePlanAuthor
    let counterOfId: String?
    let availabilityShareId: String?
    let scheduleShareLinkId: String?
    let createdAt: String
    let updatedAt: String

    var isPending: Bool { status == "PENDING" }
    var isAccepted: Bool { status == "ACCEPTED" }

    var startDate: Date? { Date.sideSeatChatISO8601(startTime) }
    var endDate: Date? { Date.sideSeatChatISO8601(endTime) }
}

struct NativePlansListPayload: Decodable, Sendable {
    let plans: [NativePlanRequest]
}

struct NativePlanEnvelopePayload: Decodable, Sendable {
    let plan: NativePlanRequest
}

struct NativePlanCreatePayload: Decodable, Sendable {
    let plan: NativePlanRequest
    let messageId: String
}

struct NativePlanCreateRequest: Encodable, Sendable {
    let title: String
    let location: String?
    let message: String?
    let startTime: String
    let endTime: String
    let planType: String
}

struct NativeDirectMessage: Codable, Identifiable, Hashable, Sendable {
    let id: String
    let connectionId: String
    let sender: NativeChatAuthor
    let type: String
    let body: String?
    let imageUrl: String?
    let location: NativeChatLocation?
    let availabilityShareId: String?
    let planRequestId: String?
    let planRequest: NativePlanRequest?
    let replyTo: NativeDirectMessageReply?
    let deletedAt: String?
    let createdAt: String

    init(
        id: String,
        connectionId: String,
        sender: NativeChatAuthor,
        type: String,
        body: String?,
        createdAt: String,
        imageUrl: String? = nil,
        location: NativeChatLocation? = nil,
        availabilityShareId: String? = nil,
        planRequestId: String? = nil,
        planRequest: NativePlanRequest? = nil,
        replyTo: NativeDirectMessageReply? = nil,
        deletedAt: String? = nil
    ) {
        self.id = id
        self.connectionId = connectionId
        self.sender = sender
        self.type = type
        self.body = body
        self.imageUrl = imageUrl
        self.location = location
        self.availabilityShareId = availabilityShareId
        self.planRequestId = planRequestId
        self.planRequest = planRequest
        self.replyTo = replyTo
        self.deletedAt = deletedAt
        self.createdAt = createdAt
    }

    var isDeleted: Bool { deletedAt != nil }

    var createdDate: Date? {
        Date.sideSeatChatISO8601(createdAt)
    }

    func asInboxLastMessage() -> NativeInboxLastMessage {
        NativeInboxLastMessage(
            id: id,
            sender: sender,
            type: type,
            body: body,
            imageUrl: imageUrl,
            deletedAt: deletedAt,
            createdAt: createdAt
        )
    }
}

enum NativeMessageSendStatus: String, Codable, Hashable, Sendable {
    case sending
    case sent
    case failed
}

struct NativeChatLocation: Codable, Hashable, Sendable {
    let latitude: Double
    let longitude: Double
    let name: String?
}

struct NativeDirectMessageReply: Codable, Hashable, Sendable {
    let id: String
    let sender: NativeChatAuthor
    let type: String
    let body: String?
    let deletedAt: String?

    var isDeleted: Bool { deletedAt != nil }

    var previewText: String {
        if isDeleted { return String(localized: "Message deleted") }
        switch type {
        case "IMAGE": return String(localized: "Photo")
        case "LOCATION": return String(localized: "Location")
        default:
            let trimmed = body?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
            if trimmed.isEmpty { return String(localized: "Message") }
            return trimmed
        }
    }
}

struct NativeDirectTextMessageRequest: Encodable, Sendable {
    let type = "TEXT"
    let body: String
    let replyToId: String?

    init(body: String, replyToId: String? = nil) {
        self.body = body
        self.replyToId = replyToId
    }

    private enum CodingKeys: String, CodingKey {
        case type, body, replyToId
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(type, forKey: .type)
        try container.encode(body, forKey: .body)
        try container.encodeIfPresent(replyToId, forKey: .replyToId)
    }
}

struct NativeDirectImageMessageRequest: Encodable, Sendable {
    let type = "IMAGE"
    let imageUrl: String
    let body: String?
    let replyToId: String?

    init(imageUrl: String, body: String? = nil, replyToId: String? = nil) {
        self.imageUrl = imageUrl
        self.body = body
        self.replyToId = replyToId
    }

    private enum CodingKeys: String, CodingKey {
        case type, imageUrl, body, replyToId
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(type, forKey: .type)
        try container.encode(imageUrl, forKey: .imageUrl)
        try container.encodeIfPresent(body, forKey: .body)
        try container.encodeIfPresent(replyToId, forKey: .replyToId)
    }
}

struct NativeDirectLocationMessageRequest: Encodable, Sendable {
    let type = "LOCATION"
    let locationLat: Double
    let locationLng: Double
    let locationName: String?
    let replyToId: String?

    init(
        locationLat: Double,
        locationLng: Double,
        locationName: String? = nil,
        replyToId: String? = nil
    ) {
        self.locationLat = locationLat
        self.locationLng = locationLng
        self.locationName = locationName
        self.replyToId = replyToId
    }

    private enum CodingKeys: String, CodingKey {
        case type, locationLat, locationLng, locationName, replyToId
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(type, forKey: .type)
        try container.encode(locationLat, forKey: .locationLat)
        try container.encode(locationLng, forKey: .locationLng)
        try container.encodeIfPresent(locationName, forKey: .locationName)
        try container.encodeIfPresent(replyToId, forKey: .replyToId)
    }
}

struct NativeChatImageUpload: Decodable, Sendable {
    let url: String
}

enum NativeReportReason: String, CaseIterable, Identifiable, Sendable {
    case harassment = "HARASSMENT"
    case repeatedUnwantedContact = "REPEATED_UNWANTED_CONTACT"
    case offensiveLanguage = "OFFENSIVE_LANGUAGE"
    case spam = "SPAM"
    case fakeIdentity = "FAKE_IDENTITY"
    case other = "OTHER"

    var id: String { rawValue }

    var title: String {
        switch self {
        case .harassment: String(localized: "Harassment")
        case .repeatedUnwantedContact: String(localized: "Repeated unwanted contact")
        case .offensiveLanguage: String(localized: "Offensive language")
        case .spam: String(localized: "Spam")
        case .fakeIdentity: String(localized: "Fake identity")
        case .other: String(localized: "Other")
        }
    }
}

struct NativeMessageReportRequest: Encodable, Sendable {
    let reportedUserId: String
    let messageId: String?
    let courseRoomMessageId: String?
    let groupChatMessageId: String?
    let classmatePostId: String?
    let classmatePostCommentId: String?
    let discoverActivityCommentId: String?
    let reason: String
    let details: String

    init(
        reportedUserId: String,
        messageId: String? = nil,
        courseRoomMessageId: String? = nil,
        groupChatMessageId: String? = nil,
        classmatePostId: String? = nil,
        classmatePostCommentId: String? = nil,
        discoverActivityCommentId: String? = nil,
        reason: NativeReportReason,
        details: String = ""
    ) {
        self.reportedUserId = reportedUserId
        self.messageId = messageId
        self.courseRoomMessageId = courseRoomMessageId
        self.groupChatMessageId = groupChatMessageId
        self.classmatePostId = classmatePostId
        self.classmatePostCommentId = classmatePostCommentId
        self.discoverActivityCommentId = discoverActivityCommentId
        self.reason = reason.rawValue
        self.details = details
    }
}

struct NativeReportResult: Decodable, Sendable {
    let id: String
}

extension NativeDirectMessage {
    var previewText: String {
        if isDeleted { return String(localized: "Message deleted") }
        switch type {
        case "IMAGE": return String(localized: "Photo")
        case "LOCATION": return location?.name ?? String(localized: "Location")
        default:
            let trimmed = body?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
            if trimmed.isEmpty { return String(localized: "Message") }
            return trimmed
        }
    }

    func asReplyReference() -> NativeDirectMessageReply {
        NativeDirectMessageReply(
            id: id,
            sender: sender,
            type: type,
            body: body,
            deletedAt: deletedAt
        )
    }

    func tombstoned(at isoDate: String = ISO8601DateFormatter().string(from: Date())) -> NativeDirectMessage {
        NativeDirectMessage(
            id: id,
            connectionId: connectionId,
            sender: sender,
            type: type,
            body: nil,
            createdAt: createdAt,
            imageUrl: nil,
            location: nil,
            availabilityShareId: availabilityShareId,
            planRequestId: planRequestId,
            planRequest: planRequest,
            replyTo: replyTo,
            deletedAt: isoDate
        )
    }
}

struct NativeChatRealtimeEvent: Decodable, Sendable {
    let schemaVersion: Int
    let type: String
    let conversation: NativeChatRealtimeConversation
    let cursor: String
    let occurredAt: String
    let resumed: Bool?
    let message: NativeDirectMessage?
    let messageId: String?
    let reason: String?
    let reloadHistory: Bool?
    let retryable: Bool?
    let requestId: String?
}

struct NativeChatRealtimeConversation: Decodable, Sendable {
    let kind: String
    let id: String
}

enum ChatScrollDecision: Equatable, Sendable {
    case scrollToBottom(animated: Bool)
    case retainPosition(newRemoteCount: Int)
    case none
}

/// WeChat-style open: always land at bottom; if unread exceeds ~one screen, offer ↑ jump.
enum ChatUnreadJumpPolicy {
    /// Roughly one viewport of chat bubbles (avatar + text + timestamp).
    static let screenfulMessageCount = 8

    static func shouldShowJump(unreadCount: Int) -> Bool {
        unreadCount > screenfulMessageCount
    }

    /// Oldest unread among the latest `unreadCount` messages from others (chronological list).
    static func firstUnreadMessageID(
        messages: [(id: String, senderID: String)],
        unreadCount: Int,
        currentUserID: String
    ) -> String? {
        guard unreadCount > 0, !currentUserID.isEmpty else { return nil }
        var remaining = unreadCount
        var firstID: String?
        for message in messages.reversed() {
            guard message.senderID != currentUserID else { continue }
            firstID = message.id
            remaining -= 1
            if remaining == 0 { break }
        }
        return firstID
    }
}

/// Passes inbox unread into a thread before mark-read clears the badge.
@MainActor
enum ChatUnreadLaunch {
    private static var pendingUnreadCounts: [String: Int] = [:]

    static func stage(conversationID: String, unreadCount: Int) {
        if unreadCount > 0 {
            pendingUnreadCounts[conversationID] = unreadCount
        } else {
            pendingUnreadCounts.removeValue(forKey: conversationID)
        }
    }

    static func take(conversationID: String) -> Int {
        pendingUnreadCounts.removeValue(forKey: conversationID) ?? 0
    }
}

enum ChatScrollPolicy {
    static let bottomThreshold: CGFloat = 80

    static func decision(
        previousIDs: Set<String>,
        nextMessages: [NativeDirectMessage],
        currentUserID: String,
        isNearBottom: Bool
    ) -> ChatScrollDecision {
        decision(
            previousIDs: previousIDs,
            added: nextMessages
                .filter { !previousIDs.contains($0.id) }
                .map { (id: $0.id, senderID: $0.sender.id) },
            currentUserID: currentUserID,
            isNearBottom: isNearBottom
        )
    }

    static func decision(
        previousIDs: Set<String>,
        nextMessages: [NativeCommunityMessage],
        currentUserID: String,
        isNearBottom: Bool
    ) -> ChatScrollDecision {
        decision(
            previousIDs: previousIDs,
            added: nextMessages
                .filter { !previousIDs.contains($0.id) }
                .map { (id: $0.id, senderID: $0.sender.id) },
            currentUserID: currentUserID,
            isNearBottom: isNearBottom
        )
    }

    static func decision(
        previousIDs: Set<String>,
        added: [(id: String, senderID: String)],
        currentUserID: String,
        isNearBottom: Bool
    ) -> ChatScrollDecision {
        _ = previousIDs
        guard !added.isEmpty else { return .none }
        if added.contains(where: { $0.senderID == currentUserID }) {
            return .scrollToBottom(animated: true)
        }
        if isNearBottom {
            return .scrollToBottom(animated: false)
        }
        let remoteCount = added.filter { $0.senderID != currentUserID }.count
        return remoteCount > 0 ? .retainPosition(newRemoteCount: remoteCount) : .none
    }

    /// Older pages are prepended while scrolled up — never treat them as live arrivals.
    static func decisionIgnoringPagination() -> ChatScrollDecision { .none }
}

/// Keeps a thread pinned to its latest message while the software keyboard changes
/// the available height. A real user scroll after the transition releases the pin.
struct ChatKeyboardBottomAnchorState: Equatable, Sendable {
    private(set) var isPinned = true
    private(set) var isKeyboardVisible = false

    mutating func nearBottomChanged(_ isNearBottom: Bool) {
        if isNearBottom {
            isPinned = true
        }
    }

    mutating func pinToBottom() {
        isPinned = true
    }

    mutating func userScrollBegan() {
        isPinned = false
    }

    @discardableResult
    mutating func composerFocusChanged(isFocused: Bool, isNearBottom: Bool) -> Bool {
        _ = isFocused
        if isNearBottom {
            isPinned = true
        }
        return isPinned
    }

    mutating func keyboardVisibilityChanged(
        isVisible: Bool,
        isNearBottom: Bool
    ) -> Bool? {
        guard isVisible != isKeyboardVisible else { return nil }
        isKeyboardVisible = isVisible
        if isNearBottom {
            isPinned = true
        }
        return isPinned
    }
}

enum ChatKeyboardTransition {
    static func isVisible(endFrame: CGRect, screenBounds: CGRect) -> Bool {
        guard endFrame.height > 1 else { return false }
        return endFrame.intersection(screenBounds).height > 1
    }

    @MainActor
    static func visibility(from notification: Notification) -> Bool? {
        guard let endFrame = notification.userInfo?[UIResponder.keyboardFrameEndUserInfoKey] as? CGRect,
              let screenBounds = UIApplication.shared.connectedScenes
                  .compactMap({ ($0 as? UIWindowScene)?.screen.bounds })
                  .first
        else { return nil }

        return isVisible(endFrame: endFrame, screenBounds: screenBounds)
    }
}

enum InboxActivityFormatting {
    /// Today → time; yesterday → label; this week → weekday; older → short date.
    static func label(for date: Date, now: Date = Date(), calendar: Calendar = .current) -> String {
        if calendar.isDate(date, inSameDayAs: now) {
            return date.formatted(date: .omitted, time: .shortened)
        }
        if let yesterday = calendar.date(byAdding: .day, value: -1, to: now),
           calendar.isDate(date, inSameDayAs: yesterday)
        {
            return String(localized: "Yesterday")
        }
        if let weekAgo = calendar.date(byAdding: .day, value: -6, to: calendar.startOfDay(for: now)),
           date >= weekAgo
        {
            return date.formatted(.dateTime.weekday(.abbreviated))
        }
        return date.formatted(date: .abbreviated, time: .omitted)
    }
}

enum ChatDaySeparatorFormatting {
    static func label(for day: Date, calendar: Calendar = .current) -> String {
        if calendar.isDateInToday(day) { return String(localized: "Today") }
        if calendar.isDateInYesterday(day) { return String(localized: "Yesterday") }
        return day.formatted(date: .abbreviated, time: .omitted)
    }

    static func dayStart(for date: Date?, calendar: Calendar = .current) -> Date? {
        guard let date else { return nil }
        return calendar.startOfDay(for: date)
    }
}

enum ChatMessageGrouping {
    static let continuationInterval: TimeInterval = 2 * 60
    static let timestampInterval: TimeInterval = 15 * 60

    static func isContinuation(
        previousSenderID: String?,
        previousDate: Date?,
        senderID: String,
        date: Date?
    ) -> Bool {
        guard previousSenderID == senderID,
              let previousDate,
              let date
        else { return false }

        let interval = date.timeIntervalSince(previousDate)
        return interval >= 0 && interval <= continuationInterval
    }

    static func shouldShowTimestamp(
        previousDate: Date?,
        date: Date?,
        calendar: Calendar = .current
    ) -> Bool {
        guard let date else { return false }
        guard let previousDate else { return true }
        guard calendar.isDate(previousDate, inSameDayAs: date) else { return true }
        return date.timeIntervalSince(previousDate) >= timestampInterval
    }

    static func timestampLabel(
        for date: Date,
        calendar: Calendar = .current
    ) -> String {
        let time = date.formatted(date: .omitted, time: .shortened)
        if calendar.isDateInToday(date) {
            return String(localized: "Today, \(time)")
        }
        if calendar.isDateInYesterday(date) {
            return String(localized: "Yesterday, \(time)")
        }
        return date.formatted(date: .abbreviated, time: .shortened)
    }
}

struct ChatTimelineTimestamp: View {
    let date: Date

    var body: some View {
        Text(ChatMessageGrouping.timestampLabel(for: date))
            .font(.caption2.weight(.semibold))
            .foregroundStyle(.secondary)
            .frame(maxWidth: .infinity)
            .padding(.top, 12)
            .padding(.bottom, 6)
            .accessibilityIdentifier("chat-timestamp-\(date.timeIntervalSince1970)")
    }
}

struct ChatMessageStack<Content: View>: View {
    static var eagerMessageLimit: Int { 160 }

    let usesLazyLayout: Bool
    private let content: () -> Content

    init(
        usesLazyLayout: Bool,
        @ViewBuilder content: @escaping () -> Content
    ) {
        self.usesLazyLayout = usesLazyLayout
        self.content = content
    }

    @ViewBuilder
    var body: some View {
        if usesLazyLayout {
            LazyVStack(spacing: 0) {
                content()
            }
        } else {
            VStack(spacing: 0) {
                content()
            }
        }
    }
}

struct ChatBubbleShape: Shape {
    let isMine: Bool
    let connectsAbove: Bool
    let connectsBelow: Bool

    func path(in rect: CGRect) -> Path {
        let radius = SideSeatTheme.Chat.bubbleRadius
        let joinedRadius: CGFloat = 5
        return UnevenRoundedRectangle(
            topLeadingRadius: !isMine && connectsAbove ? joinedRadius : radius,
            bottomLeadingRadius: !isMine && connectsBelow ? joinedRadius : radius,
            bottomTrailingRadius: isMine && connectsBelow ? joinedRadius : radius,
            topTrailingRadius: isMine && connectsAbove ? joinedRadius : radius,
            style: .continuous
        )
        .path(in: rect)
    }
}

private struct ChatKeyboardBottomAnchorModifier: ViewModifier {
    @Binding var state: ChatKeyboardBottomAnchorState
    @Binding var isNearBottom: Bool
    let requestBottom: (_ animated: Bool) -> Void

    func body(content: Content) -> some View {
        content
            .simultaneousGesture(
                DragGesture(minimumDistance: 6).onChanged { _ in
                    var updated = state
                    updated.userScrollBegan()
                    state = updated
                    isNearBottom = false
                }
            )
            .onChange(of: isNearBottom) { _, nearBottom in
                var updated = state
                updated.nearBottomChanged(nearBottom)
                state = updated
            }
            // Scroll only after UIKit has committed the keyboard's final frame. Asking a
            // LazyVStack to scroll while an attachment tray is leaving can create a layout loop.
            .onReceive(NotificationCenter.default.publisher(for: UIResponder.keyboardDidShowNotification)) { _ in
                var updated = state
                let shouldPin = updated.keyboardVisibilityChanged(
                    isVisible: true,
                    isNearBottom: isNearBottom
                )
                state = updated
                if shouldPin == true {
                    requestBottom(false)
                }
            }
            .onReceive(NotificationCenter.default.publisher(for: UIResponder.keyboardDidHideNotification)) { _ in
                var updated = state
                _ = updated.keyboardVisibilityChanged(
                    isVisible: false,
                    isNearBottom: isNearBottom
                )
                state = updated
            }
    }
}

enum ChatScrollAnchor {
    static let bottomID = "chat-bottom"

    /// Scroll once after LazyVStack commits new rows. Keyboard candidate-bar frame
    /// changes must never start additional scroll passes while the user is typing.
    @MainActor
    static func scrollToBottom(
        proxy: ScrollViewProxy,
        animated: Bool
    ) async {
        func jump() {
            proxy.scrollTo(bottomID, anchor: .bottom)
        }

        await Task.yield()
        if animated {
            withAnimation(.easeOut(duration: 0.22)) { jump() }
        } else {
            jump()
        }
    }
}

enum ChatInitialViewportPolicy {
    static func canReveal(
        hasPreparedViewport: Bool,
        hasCompletedInitialLoad: Bool,
        hasCachedSnapshot: Bool,
        isVisible: Bool
    ) -> Bool {
        hasPreparedViewport && (hasCompletedInitialLoad || hasCachedSnapshot) && !isVisible
    }
}

/// Bottom list anchor used for scroll-to-end and iOS 17 near-bottom detection.
struct ChatBottomSentinel: View {
    @Binding var isNearBottom: Bool
    var onReachedBottom: () -> Void

    var body: some View {
        Color.clear
            .frame(height: 12)
            .id(ChatScrollAnchor.bottomID)
            .onAppear {
                isNearBottom = true
                onReachedBottom()
            }
            .onDisappear {
                isNearBottom = false
            }
    }
}

extension View {
    func chatKeyboardBottomAnchor(
        state: Binding<ChatKeyboardBottomAnchorState>,
        isNearBottom: Binding<Bool>,
        requestBottom: @escaping (_ animated: Bool) -> Void
    ) -> some View {
        modifier(
            ChatKeyboardBottomAnchorModifier(
                state: state,
                isNearBottom: isNearBottom,
                requestBottom: requestBottom
            )
        )
    }

}

struct ChatUnreadJumpButton: View {
    let count: Int
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Text("↑ \(count) new messages")
                .font(.footnote.weight(.semibold))
                .padding(.horizontal, 12)
                .padding(.vertical, 8)
                .background(.ultraThinMaterial, in: Capsule())
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier("chat-unread-jump")
        .accessibilityLabel(String(localized: "\(count) earlier new messages"))
    }
}

extension NativeInboxPayload {
    static var uiTestingFixture: NativeInboxPayload {
        #if DEBUG
        UITestingChatFixtures.inboxPayload
        #else
        NativeInboxPayload(conversations: [], unreadTotal: 0, plansNeedingYourAction: 0)
        #endif
    }
}

extension NativeDirectMessagePageData {
    static var uiTestingFixture: NativeDirectMessagePageData {
        uiTestingFixture(connectionID: "ui-connection")
    }

    static func uiTestingFixture(connectionID: String) -> NativeDirectMessagePageData {
        #if DEBUG
        UITestingChatFixtures.directPage(connectionID: connectionID)
        #else
        NativeDirectMessagePageData(
            connection: NativeDirectConversation(
                id: connectionID,
                isSelfNotes: false,
                displayName: "Chat",
                peer: NativeChatAuthor(id: "peer", username: "peer", nickname: nil, avatarUrl: nil)
            ),
            messages: []
        )
        #endif
    }
}

extension Date {
    private static let sideSeatChatFractionalISO8601 = Date.ISO8601FormatStyle(
        includingFractionalSeconds: true
    )
    private static let sideSeatChatStandardISO8601 = Date.ISO8601FormatStyle()

    static func sideSeatChatISO8601(_ value: String) -> Date? {
        if let date = try? Date(value, strategy: sideSeatChatFractionalISO8601) {
            return date
        }
        return try? Date(value, strategy: sideSeatChatStandardISO8601)
    }
}
