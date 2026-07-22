import Foundation
import Testing
@testable import SideSeat

@Suite("Discover city preference")
struct DiscoverCityPreferenceTests {
    @Test("Loads served cities from client config and keeps only allowed selections")
    @MainActor
    func loadsServedCitiesAndNormalizesSelection() async throws {
        let defaults = UserDefaults.standard
        let key = "sideseat.discover.selectedCity"
        defaults.set("Berlin", forKey: key)
        defer { defaults.removeObject(forKey: key) }

        let transport = DiscoverCityTestTransport()
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
            credentialStore: DiscoverCityMemoryCredentialStore(),
            device: NativeDevice(
                id: "discover-city-device",
                name: "Discover City iPhone",
                appVersion: "1.0.0",
                platformVersion: "26.5"
            )
        )
        await session.login(identifier: "test_001", password: "Password123")

        let store = DiscoverCityPreferenceStore.shared
        await store.refreshConfig(using: session)
        #expect(store.defaultCity == "Munich")
        #expect(store.servedCities == ["Munich"])
        #expect(store.selectedCity == "Munich")
        #expect(defaults.string(forKey: key) == "Munich")

        store.select("Munich")
        #expect(store.selectedCity == "Munich")
        store.select("Berlin")
        #expect(store.selectedCity == "Munich")
        #expect(store.issue == "That city is not available yet.")
    }
}

private actor DiscoverCityMemoryCredentialStore: CredentialStore {
    private var token: String?
    func refreshToken() -> String? { token }
    func save(refreshToken: String) { token = refreshToken }
    func clear() { token = nil }
}

private actor DiscoverCityTestTransport: APITransport {
    func data(for request: URLRequest) async throws -> (Data, URLResponse) {
        let path = request.url?.path
        let payload: String
        switch path {
        case "/api/v1/auth/login":
            payload =
                #"{"data":{"user":{"id":"user-1","username":"test_001","nickname":"Test User","gender":"PRIVATE","onboardingComplete":true,"isGuest":false,"verifiedStudent":true,"studentVerificationStatus":"VERIFIED","locale":"en"},"tokens":{"accessToken":"access-token","accessExpiresIn":900,"refreshToken":"refresh-token","refreshExpiresAt":"2026-08-16T00:00:00.000Z"}}}"#
        case "/api/v1/client-config":
            payload =
                #"{"data":{"apiVersion":"v1","serverTime":"2026-07-17T12:00:00.000Z","ios":{"minimumSupportedVersion":"1.0.0","latestVersion":"1.0.0","maintenanceMode":false},"features":{"nativeAuthentication":true},"discover":{"defaultCity":"Munich","servedCities":["Munich"]}}}"#
        default:
            throw URLError(.badURL)
        }
        let response = HTTPURLResponse(
            url: request.url!,
            statusCode: 200,
            httpVersion: nil,
            headerFields: ["Content-Type": "application/json"]
        )!
        return (Data(payload.utf8), response)
    }
}
