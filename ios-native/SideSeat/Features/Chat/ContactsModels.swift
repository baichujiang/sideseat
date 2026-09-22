import Foundation

struct NativeContactRow: Decodable, Identifiable, Hashable, Sendable {
    let connectionId: String
    let peer: NativeChatAuthor
    let remark: String?
    let courseName: String?
    let updatedAt: String

    var id: String { connectionId }

    var displayName: String {
        let trimmed = remark?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        return trimmed.isEmpty ? peer.displayName : trimmed
    }
}

struct NativeContactsPayload: Decodable, Sendable {
    let contacts: [NativeContactRow]
}

struct NativeContactSearchHit: Decodable, Identifiable, Hashable, Sendable {
    let id: String
    let username: String
    let nickname: String?
    let gender: String?
    let avatarUrl: String?
    let major: String?
    let school: String?
    let activeConnectionId: String?

    var displayName: String {
        let trimmed = nickname?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        return trimmed.isEmpty ? username : trimmed
    }
}

struct NativeContactSearchPayload: Decodable, Sendable {
    let hits: [NativeContactSearchHit]
}

struct NativeContactAddResult: Decodable, Sendable {
    let connectionId: String
    let created: Bool
}

struct NativeContactAddRequest: Encodable, Sendable {
    let peerId: String
}
