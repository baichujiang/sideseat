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

    var phase: NativeContactExchangePhase {
        switch status {
        case "PENDING" where role == "requester":
            .outgoingPending
        case "PENDING" where role == "responder":
            .incomingPending
        case "ACCEPTED":
            .accepted
        case "DECLINED" where cooldownUntil != nil:
            .declined(cooldownUntil: cooldownUntil)
        default:
            // NONE, CANCELED, and an elapsed decline are all immediately actionable.
            .available
        }
    }
}

enum NativeContactExchangePhase: Equatable, Sendable {
    case available
    case outgoingPending
    case incomingPending
    case accepted
    case declined(cooldownUntil: String?)
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
