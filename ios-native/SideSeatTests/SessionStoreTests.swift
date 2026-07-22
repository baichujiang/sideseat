import Foundation
import Testing
@testable import SideSeat

@Suite("Authenticated networking", .serialized)
struct SessionStoreTests {
    @Test("Concurrent unauthorized requests share one refresh")
    @MainActor
    func concurrentUnauthorizedRequestsShareRefresh() async throws {
        let transport = AuthTestTransport()
        let credentialStore = MemoryCredentialStore()
        let client = APIClient(environment: .test, transport: transport)
        let store = SessionStore(
            apiClient: client,
            credentialStore: credentialStore,
            device: .test
        )

        await store.login(identifier: "test_001", password: "Password123")
        #expect(store.phase == .signedIn)

        async let first: APIEnvelope<TestValue> = store.sendAuthorized("api/v1/protected")
        async let second: APIEnvelope<TestValue> = store.sendAuthorized("api/v1/protected")
        let responses = try await (first, second)

        #expect(responses.0.data.value == "ok")
        #expect(responses.1.data.value == "ok")
        #expect(await transport.refreshCount == 1)
        #expect(await transport.expiredAccessCount == 2)
        #expect(await credentialStore.refreshToken() == "refresh-new")
    }

    @Test("Non-idempotent writes are not replayed after unauthorized")
    @MainActor
    func nonIdempotentWriteIsNotRetried() async throws {
        let transport = AuthTestTransport()
        let store = SessionStore(
            apiClient: APIClient(environment: .test, transport: transport),
            credentialStore: MemoryCredentialStore(),
            device: .test
        )
        await store.login(identifier: "test_001", password: "Password123")

        await #expect(throws: APIClientError.self) {
            let _: APIEnvelope<TestValue> = try await store.sendAuthorized(
                "api/v1/protected",
                method: .post,
                body: TestBody(value: "unsafe")
            )
        }

        #expect(await transport.refreshCount == 0)
        #expect(await transport.expiredAccessCount == 1)
    }
}

private struct TestValue: Decodable, Sendable {
    let value: String
}

private struct TestBody: Encodable, Sendable {
    let value: String
}

private actor MemoryCredentialStore: CredentialStore {
    private var token: String?

    func refreshToken() -> String? {
        token
    }

    func save(refreshToken: String) {
        token = refreshToken
    }

    func clear() {
        token = nil
    }
}

private actor AuthTestTransport: APITransport {
    private(set) var refreshCount = 0
    private(set) var expiredAccessCount = 0

    func data(for request: URLRequest) async throws -> (Data, URLResponse) {
        let path = request.url?.path ?? ""
        switch path {
        case "/api/v1/auth/login":
            return response(for: request, status: 200, body: authBody(access: "access-old", refresh: "refresh-old"))
        case "/api/v1/auth/refresh":
            refreshCount += 1
            try await Task.sleep(for: .milliseconds(120))
            return response(for: request, status: 200, body: authBody(access: "access-new", refresh: "refresh-new"))
        case "/api/v1/protected":
            if request.value(forHTTPHeaderField: "Authorization") == "Bearer access-new" {
                return response(for: request, status: 200, body: #"{"data":{"value":"ok"}}"#)
            }
            expiredAccessCount += 1
            try await Task.sleep(for: .milliseconds(80))
            return response(
                for: request,
                status: 401,
                body: #"{"error":{"code":"UNAUTHORIZED","message":"Expired","field":null,"retryable":false,"requestId":"request-1"}}"#
            )
        default:
            return response(for: request, status: 404, body: #"{"error":{"code":"NOT_FOUND","message":"Missing","field":null,"retryable":false,"requestId":"request-2"}}"#)
        }
    }

    private func response(
        for request: URLRequest,
        status: Int,
        body: String
    ) -> (Data, URLResponse) {
        let response = HTTPURLResponse(
            url: request.url!,
            statusCode: status,
            httpVersion: "HTTP/1.1",
            headerFields: ["Content-Type": "application/json"]
        )!
        return (Data(body.utf8), response)
    }

    private func authBody(access: String, refresh: String) -> String {
        """
        {"data":{"user":{"id":"user-1","username":"test_001","nickname":"Test User","gender":"UNSPECIFIED","onboardingComplete":true,"isGuest":false,"verifiedStudent":true,"studentVerificationStatus":"VERIFIED","locale":"en"},"tokens":{"accessToken":"\(access)","accessExpiresIn":900,"refreshToken":"\(refresh)","refreshExpiresAt":"2026-08-16T00:00:00.000Z"}}}
        """
    }
}

private extension AppEnvironment {
    static let test = AppEnvironment(
        deployment: .development,
        apiBaseURL: URL(string: "https://api.sideseat.test")!,
        bundleIdentifier: "app.sideseat.mobile.tests",
        appVersion: "1.0.0",
        buildNumber: "1"
    )
}

private extension NativeDevice {
    static let test = NativeDevice(
        id: "device-1",
        name: "Test iPhone",
        appVersion: "1.0.0",
        platformVersion: "26.5"
    )
}
