import Foundation

struct APIEnvelope<Value: Decodable & Sendable>: Decodable, Sendable {
    let data: Value
}

struct APIErrorEnvelope: Decodable, Sendable {
    let error: APIErrorPayload
    let recovery: APIErrorRecovery?
}

struct APIErrorPayload: Decodable, Sendable {
    let code: String
    let message: String
    let field: String?
    let retryable: Bool
    let requestId: String?
    let recovery: APIErrorRecovery?

    init(
        code: String,
        message: String,
        field: String?,
        retryable: Bool,
        requestId: String?,
        recovery: APIErrorRecovery? = nil
    ) {
        self.code = code
        self.message = message
        self.field = field
        self.retryable = retryable
        self.requestId = requestId
        self.recovery = recovery
    }

    private enum CodingKeys: String, CodingKey {
        case code
        case message
        case field
        case retryable
        case requestId
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        code = try container.decode(String.self, forKey: .code)
        message = try container.decode(String.self, forKey: .message)
        field = try container.decodeIfPresent(String.self, forKey: .field)
        retryable = try container.decode(Bool.self, forKey: .retryable)
        requestId = try container.decodeIfPresent(String.self, forKey: .requestId)
        recovery = nil
    }

    func withRecovery(_ recovery: APIErrorRecovery?) -> APIErrorPayload {
        APIErrorPayload(
            code: code,
            message: message,
            field: field,
            retryable: retryable,
            requestId: requestId,
            recovery: recovery
        )
    }
}

struct APIErrorRecovery: Decodable, Hashable, Sendable {
    let action: String
    let focus: APIErrorRecoveryFocus
}

struct APIErrorRecoveryFocus: Decodable, Hashable, Sendable {
    let type: String
    let interestId: String?
    let reservationId: String?
    let connectionId: String?
    let contextId: String?
    let messageId: String?
    let commitmentId: String?
    let revisionId: String?
}

/// Legacy `/api/auth/*` error shape: `{ success: false, error: "…", code?: "…" }`.
struct LegacyAPIErrorBody: Decodable, Sendable {
    let error: String
    let code: String?
}

enum APIClientError: LocalizedError, Sendable {
    case invalidResponse
    case transport(String)
    case server(status: Int, payload: APIErrorPayload)
    case decoding(status: Int, requestId: String?)

    var errorDescription: String? {
        switch self {
        case .invalidResponse:
            "The server returned an invalid response."
        case .transport:
            "The network connection failed. Please try again."
        case .server(_, let payload):
            payload.message
        case .decoding:
            "The server response could not be read."
        }
    }
}

extension APIClientError {
    var statusCode: Int? {
        switch self {
        case .server(let status, _), .decoding(let status, _):
            status
        case .invalidResponse, .transport:
            nil
        }
    }

    var isUnauthorized: Bool {
        statusCode == 401
    }

    var isNotFound: Bool { statusCode == 404 }

    /// Retain the same Idempotency-Key when the server explicitly says the
    /// command is retryable, or when the client cannot know whether it landed.
    var shouldPreserveIdempotencyKey: Bool {
        switch self {
        case .server(let status, let payload):
            payload.retryable || (500...599).contains(status)
        case .invalidResponse, .transport, .decoding:
            true
        }
    }
}

enum HTTPMethod: String, Sendable {
    case get = "GET"
    case post = "POST"
    case put = "PUT"
    case patch = "PATCH"
    case delete = "DELETE"
}

struct MultipartUploadFile: Sendable {
    let fieldName: String
    let fileName: String
    let mimeType: String
    let data: Data
}
