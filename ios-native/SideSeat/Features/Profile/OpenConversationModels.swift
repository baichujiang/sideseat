import Foundation

struct NativeOpenConversationRequest: Encodable, Sendable {
    let peerId: String
    var courseId: String?
}

struct NativeOpenConversationResult: Decodable, Sendable {
    let connectionId: String
    let created: Bool
    let peerId: String
}
