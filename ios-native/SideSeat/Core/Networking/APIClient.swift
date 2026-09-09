import Foundation

actor APIClient {
    static let actionCoordinationCapability = "action-coordination-v2"

    private let environment: AppEnvironment
    private let transport: any APITransport
    private let encoder: JSONEncoder
    private let decoder: JSONDecoder

    init(
        environment: AppEnvironment,
        transport: any APITransport = URLSessionTransport()
    ) {
        self.environment = environment
        self.transport = transport
        self.encoder = Self.makeEncoder()
        self.decoder = Self.makeDecoder()
    }

    func send<Response: Decodable & Sendable>(
        _ path: String,
        method: HTTPMethod = .get,
        body: (any Encodable & Sendable)? = nil,
        queryItems: [URLQueryItem] = [],
        accessToken: String? = nil,
        idempotencyKey: String? = nil
    ) async throws -> Response {
        let baseURL = environment.apiBaseURL.appending(
            path: path.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        )
        guard var components = URLComponents(url: baseURL, resolvingAgainstBaseURL: false) else {
            throw APIClientError.invalidResponse
        }
        components.queryItems = queryItems.isEmpty ? nil : queryItems
        guard let url = components.url else {
            throw APIClientError.invalidResponse
        }
        var request = URLRequest(url: url)
        request.httpMethod = method.rawValue
        request.timeoutInterval = 30
        request.httpShouldHandleCookies = false
        request.cachePolicy = .reloadIgnoringLocalCacheData
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue("ios", forHTTPHeaderField: "X-SideSeat-Platform")
        request.setValue("1", forHTTPHeaderField: "X-SideSeat-Flexible-Timing")
        request.setValue(environment.appVersion, forHTTPHeaderField: "X-SideSeat-App-Version")
        request.setValue(environment.buildNumber, forHTTPHeaderField: "X-SideSeat-Build")
        request.setValue(
            Self.actionCoordinationCapability,
            forHTTPHeaderField: "X-SideSeat-Capabilities"
        )
        request.setValue(UUID().uuidString, forHTTPHeaderField: "X-Request-Id")
        if let accessToken {
            request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
        }
        if let idempotencyKey {
            request.setValue(idempotencyKey, forHTTPHeaderField: "Idempotency-Key")
        }
        if let body {
            request.httpBody = try encoder.encode(AnyEncodable(body))
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        }

        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await transport.data(for: request)
        } catch is CancellationError {
            throw CancellationError()
        } catch let error as URLError where error.code == .cancelled {
            throw CancellationError()
        } catch {
            throw APIClientError.transport(String(describing: error))
        }
        guard let httpResponse = response as? HTTPURLResponse else {
            throw APIClientError.invalidResponse
        }
        try Self.throwIfFailed(status: httpResponse.statusCode, data: data, httpResponse: httpResponse, decoder: decoder)
        do {
            return try decoder.decode(Response.self, from: data)
        } catch {
            throw APIClientError.decoding(
                status: httpResponse.statusCode,
                requestId: httpResponse.value(forHTTPHeaderField: "X-Request-Id")
            )
        }
    }

    func uploadMultipart<Response: Decodable & Sendable>(
        _ path: String,
        file: MultipartUploadFile,
        fields: [String: String] = [:],
        accessToken: String? = nil,
        idempotencyKey: String? = nil
    ) async throws -> Response {
        let baseURL = environment.apiBaseURL.appending(
            path: path.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        )
        guard let url = URLComponents(url: baseURL, resolvingAgainstBaseURL: false)?.url else {
            throw APIClientError.invalidResponse
        }

        let boundary = "sideseat-\(UUID().uuidString)"
        var request = URLRequest(url: url)
        request.httpMethod = HTTPMethod.post.rawValue
        request.timeoutInterval = 60
        request.httpShouldHandleCookies = false
        request.cachePolicy = .reloadIgnoringLocalCacheData
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
        request.setValue("ios", forHTTPHeaderField: "X-SideSeat-Platform")
        request.setValue(environment.appVersion, forHTTPHeaderField: "X-SideSeat-App-Version")
        request.setValue(environment.buildNumber, forHTTPHeaderField: "X-SideSeat-Build")
        request.setValue(
            Self.actionCoordinationCapability,
            forHTTPHeaderField: "X-SideSeat-Capabilities"
        )
        request.setValue(UUID().uuidString, forHTTPHeaderField: "X-Request-Id")
        if let accessToken {
            request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
        }
        if let idempotencyKey {
            request.setValue(idempotencyKey, forHTTPHeaderField: "Idempotency-Key")
        }
        request.httpBody = Self.multipartBody(boundary: boundary, fields: fields, file: file)

        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await transport.data(for: request)
        } catch is CancellationError {
            throw CancellationError()
        } catch let error as URLError where error.code == .cancelled {
            throw CancellationError()
        } catch {
            throw APIClientError.transport(String(describing: error))
        }
        guard let httpResponse = response as? HTTPURLResponse else {
            throw APIClientError.invalidResponse
        }
        try Self.throwIfFailed(status: httpResponse.statusCode, data: data, httpResponse: httpResponse, decoder: decoder)
        do {
            return try decoder.decode(Response.self, from: data)
        } catch {
            throw APIClientError.decoding(
                status: httpResponse.statusCode,
                requestId: httpResponse.value(forHTTPHeaderField: "X-Request-Id")
            )
        }
    }

    private static func throwIfFailed(
        status: Int,
        data: Data,
        httpResponse: HTTPURLResponse,
        decoder: JSONDecoder
    ) throws {
        guard !(200..<300).contains(status) else { return }
        if let envelope = try? decoder.decode(APIErrorEnvelope.self, from: data) {
            throw APIClientError.server(
                status: status,
                payload: envelope.error.withRecovery(envelope.recovery)
            )
        }
        if let legacy = try? decoder.decode(LegacyAPIErrorBody.self, from: data) {
            throw APIClientError.server(
                status: status,
                payload: APIErrorPayload(
                    code: legacy.code ?? "REQUEST_FAILED",
                    message: legacy.error,
                    field: nil,
                    retryable: status >= 500,
                    requestId: httpResponse.value(forHTTPHeaderField: "X-Request-Id")
                )
            )
        }
        throw APIClientError.decoding(
            status: status,
            requestId: httpResponse.value(forHTTPHeaderField: "X-Request-Id")
        )
    }

    private static func makeDecoder() -> JSONDecoder {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .custom { decoder in
            let container = try decoder.singleValueContainer()
            let rawValue = try container.decode(String.self)
            if let date = try? Date(
                rawValue,
                strategy: Date.ISO8601FormatStyle(includingFractionalSeconds: true)
            ) {
                return date
            }
            if let date = try? Date(
                rawValue,
                strategy: Date.ISO8601FormatStyle(includingFractionalSeconds: false)
            ) {
                return date
            }
            throw DecodingError.dataCorruptedError(
                in: container,
                debugDescription: "Expected an ISO 8601 date-time string."
            )
        }
        return decoder
    }

    private static func makeEncoder() -> JSONEncoder {
        let encoder = JSONEncoder()
        // OpenAPI date-time fields are JSON strings. JSONEncoder's default
        // Date strategy emits seconds since 2001, which the server correctly
        // rejects for generated Action/Plan request bodies.
        encoder.dateEncodingStrategy = .iso8601
        return encoder
    }

    private static func multipartBody(
        boundary: String,
        fields: [String: String],
        file: MultipartUploadFile
    ) -> Data {
        var body = Data()
        let lineBreak = "\r\n"
        for (name, value) in fields.sorted(by: { $0.key < $1.key }) {
            body.append("--\(boundary)\(lineBreak)")
            body.append("Content-Disposition: form-data; name=\"\(name)\"\(lineBreak)\(lineBreak)")
            body.append("\(value)\(lineBreak)")
        }
        body.append("--\(boundary)\(lineBreak)")
        body.append(
            "Content-Disposition: form-data; name=\"\(file.fieldName)\"; filename=\"\(file.fileName)\"\(lineBreak)"
        )
        body.append("Content-Type: \(file.mimeType)\(lineBreak)\(lineBreak)")
        body.append(file.data)
        body.append(lineBreak)
        body.append("--\(boundary)--\(lineBreak)")
        return body
    }
}

protocol APITransport: Sendable {
    func data(for request: URLRequest) async throws -> (Data, URLResponse)
}

struct URLSessionTransport: APITransport {
    private let session: URLSession

    init(session: URLSession? = nil) {
        if let session {
            self.session = session
            return
        }

        let configuration = URLSessionConfiguration.ephemeral
        configuration.httpCookieStorage = nil
        configuration.httpShouldSetCookies = false
        configuration.urlCache = nil
        configuration.requestCachePolicy = .reloadIgnoringLocalCacheData
        self.session = URLSession(configuration: configuration)
    }

    func data(for request: URLRequest) async throws -> (Data, URLResponse) {
        try await session.data(for: request)
    }
}

private struct AnyEncodable: Encodable, @unchecked Sendable {
    private let encodeValue: (Encoder) throws -> Void

    init(_ value: any Encodable & Sendable) {
        self.encodeValue = value.encode
    }

    func encode(to encoder: Encoder) throws {
        try encodeValue(encoder)
    }
}

private extension Data {
    mutating func append(_ string: String) {
        append(Data(string.utf8))
    }
}
