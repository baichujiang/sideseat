import Foundation
import SwiftUI

struct NativeInboxPayload: Decodable, Sendable {
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

struct NativeInboxConversation: Decodable, Identifiable, Hashable, Sendable {
    enum Kind: String, Decodable, Sendable {
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
        case "PLAN_REQUEST_CARD": return String(localized: "Plan invite")
        case "PLAN_CONFIRMED_CARD": return String(localized: "Plan confirmed")
        case "SYSTEM":
            let body = lastMessage.body?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
            return body.isEmpty ? String(localized: "Update") : body
        default:
            let body = lastMessage.body?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
            return body.isEmpty ? String(localized: "New message") : body
        }
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

struct NativeInboxCourseRef: Decodable, Hashable, Sendable {
    let id: String
    let name: String
    let code: String?
    let school: String?
    let semesterLabel: String?
}

struct NativeInboxGroupRef: Decodable, Hashable, Sendable {
    let id: String
    let participantCount: Int
    let participants: [NativeChatAuthor]
}

struct NativeInboxLastMessage: Decodable, Hashable, Sendable {
    let id: String
    let sender: NativeChatAuthor
    let type: String
    let body: String?
    let imageUrl: String?
    let deletedAt: String?
    let createdAt: String
}

struct NativeChatAuthor: Decodable, Hashable, Sendable, Identifiable {
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

struct NativeDirectConversation: Decodable, Sendable {
    let id: String
    let isSelfNotes: Bool
    let displayName: String
    let peer: NativeChatAuthor
}

struct NativePlanAuthor: Decodable, Hashable, Sendable {
    let id: String
    let username: String
    let nickname: String?
    let avatarUrl: String?

    var displayName: String {
        let nick = nickname?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        return nick.isEmpty ? username : nick
    }
}

struct NativePlanRequest: Decodable, Identifiable, Hashable, Sendable {
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

struct NativeDirectMessage: Decodable, Identifiable, Hashable, Sendable {
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

enum NativeMessageSendStatus: String, Hashable, Sendable {
    case sending
    case sent
    case failed
}

struct NativeChatLocation: Decodable, Hashable, Sendable {
    let latitude: Double
    let longitude: Double
    let name: String?
}

struct NativeDirectMessageReply: Decodable, Hashable, Sendable {
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
            return trimmed.isEmpty ? String(localized: "Message") : trimmed
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
    let replyToId: String?

    init(locationLat: Double, locationLng: Double, replyToId: String? = nil) {
        self.locationLat = locationLat
        self.locationLng = locationLng
        self.replyToId = replyToId
    }

    private enum CodingKeys: String, CodingKey {
        case type, locationLat, locationLng, replyToId
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(type, forKey: .type)
        try container.encode(locationLat, forKey: .locationLat)
        try container.encode(locationLng, forKey: .locationLng)
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
    let reason: String
    let details: String

    init(
        reportedUserId: String,
        messageId: String? = nil,
        courseRoomMessageId: String? = nil,
        reason: NativeReportReason,
        details: String = ""
    ) {
        self.reportedUserId = reportedUserId
        self.messageId = messageId
        self.courseRoomMessageId = courseRoomMessageId
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
            return trimmed.isEmpty ? String(localized: "Message") : trimmed
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

enum InboxActivityFormatting {
    /// Today → time; yesterday → label; this week → weekday; older → short date.
    static func label(for date: Date, now: Date = Date(), calendar: Calendar = .current) -> String {
        if calendar.isDateInToday(date) {
            return date.formatted(date: .omitted, time: .shortened)
        }
        if calendar.isDateInYesterday(date) {
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

/// Sticky-scroll helper: iOS 18 uses geometry; iOS 17 uses bottom-sentinel visibility.
struct ChatNearBottomTracker: ViewModifier {
    @Binding var isNearBottom: Bool
    var threshold: CGFloat = ChatScrollPolicy.bottomThreshold
    let onReachedBottom: () -> Void

    func body(content: Content) -> some View {
        if #available(iOS 18.0, *) {
            content.onScrollGeometryChange(for: Bool.self) { geometry in
                let distance = geometry.contentSize.height
                    - geometry.contentOffset.y
                    - geometry.containerSize.height
                return distance < threshold
            } action: { _, nearBottom in
                apply(nearBottom)
            }
        } else {
            content
        }
    }

    private func apply(_ nearBottom: Bool) {
        isNearBottom = nearBottom
        if nearBottom { onReachedBottom() }
    }
}

enum ChatScrollAnchor {
    static let bottomID = "chat-bottom"

    /// Scroll after LazyVStack commits new rows.
    /// Always prefer the bottom sentinel — pinning the last message with `.bottom` undershoots
    /// by roughly one row when a composer sits in `safeAreaInset` / after optimistic ID swaps.
    @MainActor
    static func scrollToBottom(
        proxy: ScrollViewProxy,
        latestMessageID: @MainActor @escaping () -> String?,
        animated: Bool
    ) async {
        func jump() {
            proxy.scrollTo(bottomID, anchor: .bottom)
            // If the sentinel is not mounted yet, land on the latest row then re-pin bottom.
            if let id = latestMessageID() {
                proxy.scrollTo(id, anchor: .bottom)
                proxy.scrollTo(bottomID, anchor: .bottom)
            }
        }

        await Task.yield()
        if animated {
            withAnimation(.easeOut(duration: 0.22)) { jump() }
        } else {
            jump()
        }
        await Task.yield()
        try? await Task.sleep(nanoseconds: 80_000_000)
        jump()
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
                if #unavailable(iOS 18.0) {
                    isNearBottom = false
                }
            }
    }
}

extension View {
    func chatNearBottomTracker(
        isNearBottom: Binding<Bool>,
        onReachedBottom: @escaping () -> Void
    ) -> some View {
        modifier(ChatNearBottomTracker(isNearBottom: isNearBottom, onReachedBottom: onReachedBottom))
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
    static func sideSeatChatISO8601(_ value: String) -> Date? {
        let fractional = ISO8601DateFormatter()
        fractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return fractional.date(from: value) ?? ISO8601DateFormatter().date(from: value)
    }
}
