import Foundation
import Testing
@testable import SideSeat

@Suite("Open conversation")
struct OpenConversationStoreTests {
    @Test("Opens an existing peer conversation idempotently")
    @MainActor
    func opensConversation() async throws {
        let transport = OpenConversationTestTransport()
        let session = SessionStore(
            apiClient: APIClient(
                environment: AppEnvironment(
                    deployment: .development,
                    apiBaseURL: URL(string: "https://api.sideseat.test")!,
                    bundleIdentifier: "app.sideseat.mobile.tests",
                    appVersion: "1.0.0",
                    buildNumber: "1"
                ),
                transport: transport
            ),
            credentialStore: OpenConversationMemoryCredentialStore(),
            device: NativeDevice(
                id: "open-conversation-device",
                name: "Open Conversation iPhone",
                appVersion: "1.0.0",
                platformVersion: "26.5"
            )
        )
        await session.login(identifier: "test_001", password: "Password123")

        let store = OpenConversationStore()
        let connectionID = await store.open(
            peerID: "peer-1",
            postID: "post-1",
            using: session
        )
        #expect(connectionID == "connection-1")
        #expect(await transport.openPath == "/api/v1/connections/open")
        #expect(await transport.openPeerID == "peer-1")
        #expect(await transport.openPostID == "post-1")
        #expect(await transport.writeKeys.count == 1)
    }
}

private actor OpenConversationMemoryCredentialStore: CredentialStore {
    private var token: String?
    func refreshToken() -> String? { token }
    func save(refreshToken: String) { token = refreshToken }
    func clear() { token = nil }
}

private actor OpenConversationTestTransport: APITransport {
    private(set) var openPath: String?
    private(set) var openPeerID: String?
    private(set) var openPostID: String?
    private(set) var writeKeys: [String] = []

    func data(for request: URLRequest) async throws -> (Data, URLResponse) {
        switch request.url?.path {
        case "/api/v1/auth/login":
            return response(
                request,
                200,
                #"{"data":{"user":{"id":"user-1","username":"test_001","nickname":"Test User","gender":"PRIVATE","onboardingComplete":true,"isGuest":false,"verifiedStudent":true,"studentVerificationStatus":"VERIFIED","locale":"en"},"tokens":{"accessToken":"access-token","accessExpiresIn":900,"refreshToken":"refresh-token","refreshExpiresAt":"2026-08-16T00:00:00.000Z"}}}"#
            )
        case "/api/v1/connections/open":
            openPath = request.url?.path
            if let key = request.value(forHTTPHeaderField: "Idempotency-Key") {
                writeKeys.append(key)
            }
            let body = try JSONSerialization.jsonObject(with: request.httpBody ?? Data()) as? [String: Any]
            openPeerID = body?["peerId"] as? String
            openPostID = body?["postId"] as? String
            return response(
                request,
                200,
                #"{"data":{"connectionId":"connection-1","created":false,"peerId":"peer-1"}}"#
            )
        default:
            throw URLError(.badURL)
        }
    }

    private func response(_ request: URLRequest, _ status: Int, _ body: String) -> (Data, URLResponse) {
        let response = HTTPURLResponse(
            url: request.url!,
            statusCode: status,
            httpVersion: nil,
            headerFields: ["Content-Type": "application/json"]
        )!
        return (Data(body.utf8), response)
    }
}
