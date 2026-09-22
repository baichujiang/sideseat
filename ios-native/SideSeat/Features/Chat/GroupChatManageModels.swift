import Foundation

struct NativeGroupCreateRequest: Encodable, Sendable {
    let title: String?
    let participantIds: [String]
}

struct NativeGroupCreateResult: Decodable, Sendable {
    let groupChatId: String
}

struct NativeGroupTitlePatch: Encodable, Sendable {
    let title: String
}

struct NativeGroupTitleResult: Decodable, Sendable {
    let title: String?
}

struct NativeGroupAddMembersRequest: Encodable, Sendable {
    let participantIds: [String]
}

struct NativeGroupAddMembersResult: Decodable, Sendable {
    let addedUserIds: [String]
    let memberCount: Int
}

struct NativeGroupInfoPayload: Decodable, Sendable {
    let id: String
    let title: String?
    let customTitle: String?
    let participants: [NativeChatAuthor]
    let memberCount: Int
}
