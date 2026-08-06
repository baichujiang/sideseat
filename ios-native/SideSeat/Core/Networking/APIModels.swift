import Foundation

struct APIEnvelope<Value: Decodable & Sendable>: Decodable, Sendable {
    let data: Value
}

struct APIErrorEnvelope: Decodable, Sendable {
    let error: APIErrorPayload
}

struct APIErrorPayload: Decodable, Sendable {
    let code: String
    let message: String
    let field: String?
    let retryable: Bool
    let requestId: String?
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
}

enum HTTPMethod: String, Sendable {
    case get = "GET"
    case post = "POST"
    case patch = "PATCH"
    case delete = "DELETE"
}

struct MultipartUploadFile: Sendable {
    let fieldName: String
    let fileName: String
    let mimeType: String
    let data: Data
}
