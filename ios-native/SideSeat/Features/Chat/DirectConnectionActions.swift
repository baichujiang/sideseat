import Foundation

struct NativeConnectionActionsPayload: Decodable, Sendable {
    let remark: String?
    let peerId: String?
    let isSelfNotes: Bool?
    let friendLink: NativeConnectionLinkState?
    let contactExchange: NativeConnectionExchangeState?
}

struct NativeConnectionLinkState: Decodable, Sendable {
    let status: String
    let role: String
}

struct NativeConnectionExchangeState: Decodable, Sendable {
    let status: String
    let role: String
    let cooldownUntil: String?
}

struct NativeConnectionActionRequest: Encodable, Sendable {
    let action: String
}

struct NativeConnectionRemarkPatch: Encodable, Sendable {
    let remark: String?
}

struct NativeConnectionRemarkResult: Decodable, Sendable {
    let remark: String?
}

struct NativeConnectionEndResult: Decodable, Sendable {
    let endedAt: String
}

struct NativeConnectionBlockRequest: Encodable, Sendable {
    let blockedId: String
    let connectionId: String?
    let reason: String?
}

struct NativeConnectionBlockResult: Decodable, Sendable {
    let blocked: Bool
}

struct NativeConnectionLinkResult: Decodable, Sendable {
    let status: String
    let role: String
}

struct NativeConnectionExchangeResult: Decodable, Sendable {
    let status: String
    let role: String
    let cooldownUntil: String?
}
