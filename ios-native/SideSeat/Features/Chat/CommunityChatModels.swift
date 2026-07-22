import Foundation

enum NativeCommunityChatKind: String, Hashable, Sendable {
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

    var supportsReply: Bool { self == .course }
    var supportsDelete: Bool { self == .course }
    var supportsReport: Bool { self == .course }
}

struct NativeCommunityConversation: Decodable, Hashable, Sendable {
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

struct NativeCommunityMessageReply: Decodable, Hashable, Sendable {
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

struct NativeCommunityMessage: Decodable, Identifiable, Hashable, Sendable {
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

struct NativeGroupTextMessageRequest: Encodable, Sendable {
    let body: String
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
