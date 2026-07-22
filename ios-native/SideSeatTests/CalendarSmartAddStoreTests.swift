import Foundation
import Testing
@testable import SideSeat

@Suite("Calendar smart add")
struct CalendarSmartAddStoreTests {
    @Test("Parses drafts, updates their calendar and saves one idempotent batch")
    @MainActor
    func parseAndSave() async throws {
        let transport = CalendarSmartAddTestTransport()
        let session = makeSession(transport: transport)
        await session.login(identifier: "test_001", password: "Password123")
        let store = CalendarSmartAddStore()

        await store.parse(text: "Tomorrow at 3", locale: "en", using: session)
        let draft = try #require(store.drafts.first)
        #expect(await transport.parseText == "Tomorrow at 3")
        #expect(await transport.parseLocale == "en")
        #expect(draft.title == "Library study")
        #expect(store.warnings == ["Check time"])

        store.setCategory("category-2", for: draft.id)
        #expect(store.drafts.first?.categoryId == "category-2")
        #expect(await store.save(using: session))
        #expect(await transport.savedTitles == ["Library study"])
        #expect(await transport.savedCategoryIDs == ["category-2"])
        #expect(await transport.idempotencyKey?.isEmpty == false)
    }

    @MainActor
    private func makeSession(transport: CalendarSmartAddTestTransport) -> SessionStore {
        SessionStore(
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
            credentialStore: CalendarSmartAddMemoryCredentialStore(),
            device: NativeDevice(
                id: "calendar-smart-add-device",
                name: "Test iPhone",
                appVersion: "1.0.0",
                platformVersion: "26.5"
            )
        )
    }
}

private actor CalendarSmartAddMemoryCredentialStore: CredentialStore {
    private var token: String?

    func refreshToken() -> String? { token }
    func save(refreshToken: String) { token = refreshToken }
    func clear() { token = nil }
}

private actor CalendarSmartAddTestTransport: APITransport {
    private(set) var parseText: String?
    private(set) var parseLocale: String?
    private(set) var savedTitles: [String] = []
    private(set) var savedCategoryIDs: [String?] = []
    private(set) var idempotencyKey: String?

    func data(for request: URLRequest) async throws -> (Data, URLResponse) {
        switch request.url?.path {
        case "/api/v1/auth/login":
            return response(
                for: request,
                status: 200,
                body: #"{"data":{"user":{"id":"user-1","username":"test_001","nickname":"Test User","gender":"UNSPECIFIED","onboardingComplete":true,"isGuest":false,"verifiedStudent":true,"studentVerificationStatus":"VERIFIED","locale":"en"},"tokens":{"accessToken":"access-token","accessExpiresIn":900,"refreshToken":"refresh-token","refreshExpiresAt":"2026-08-16T00:00:00.000Z"}}}"#
            )
        case "/api/v1/calendar/parse-natural":
            let body = try #require(request.httpBody)
            let json = try #require(JSONSerialization.jsonObject(with: body) as? [String: String])
            parseText = json["text"]
            parseLocale = json["locale"]
            return response(
                for: request,
                status: 200,
                body: #"{"data":{"events":[{"title":"Library study","location":"Main Library","note":"","startAt":"2026-07-18T15:00:00.000Z","endAt":"2026-07-18T16:00:00.000Z","repeat":"NONE","repeatUntil":"","categoryId":"category-1","categoryPreset":"other"}],"warnings":["Check time"]}}"#
            )
        case "/api/v1/calendar/events/batch":
            let body = try #require(request.httpBody)
            let json = try #require(JSONSerialization.jsonObject(with: body) as? [String: Any])
            let events = try #require(json["events"] as? [[String: Any]])
            savedTitles = events.compactMap { $0["title"] as? String }
            savedCategoryIDs = events.map { $0["categoryId"] as? String }
            idempotencyKey = request.value(forHTTPHeaderField: "Idempotency-Key")
            return response(
                for: request,
                status: 201,
                body: #"{"data":{"count":1,"events":1}}"#
            )
        default:
            return response(
                for: request,
                status: 404,
                body: #"{"error":{"code":"NOT_FOUND","message":"Missing","retryable":false,"requestId":"request-1"}}"#
            )
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
}
