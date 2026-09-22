import Foundation
import Testing
@testable import SideSeat

@Suite("Discover city preference", .serialized)
struct DiscoverCityPreferenceTests {
    @Test("Uses the server city configuration and restores it while offline")
    @MainActor
    func loadsAndCachesDynamicCityConfiguration() async throws {
        let suiteName = "DiscoverCityPreferenceTests.dynamic-\(UUID().uuidString)"
        let defaults = try #require(UserDefaults(suiteName: suiteName))
        defer { defaults.removePersistentDomain(forName: suiteName) }

        let onlineSession = makeSession(
            transport: DiscoverCityTestTransport(
                configuration: .value(
                    defaultCity: "Berlin",
                    servedCities: [" Berlin ", "Munich", "Berlin", " "]
                )
            )
        )
        await onlineSession.login(identifier: "test_001", password: "Password123")

        let store = DiscoverCityPreferenceStore(defaults: defaults)
        await store.refreshConfig(using: onlineSession)

        #expect(store.defaultCity == "Berlin")
        #expect(store.servedCities == ["Berlin", "Munich"])
        #expect(store.selectedCity == "Berlin")

        store.select("Munich")
        #expect(store.selectedCity == "Munich")

        let restoredStore = DiscoverCityPreferenceStore(defaults: defaults)
        #expect(restoredStore.defaultCity == "Berlin")
        #expect(restoredStore.servedCities == ["Berlin", "Munich"])
        #expect(restoredStore.selectedCity == "Munich")

        let offlineSession = makeSession(
            transport: DiscoverCityTestTransport(configuration: .unavailable)
        )
        await offlineSession.login(identifier: "test_001", password: "Password123")
        await restoredStore.refreshConfig(using: offlineSession)

        #expect(restoredStore.defaultCity == "Berlin")
        #expect(restoredStore.servedCities == ["Berlin", "Munich"])
        #expect(restoredStore.selectedCity == "Munich")
        #expect(restoredStore.issue != nil)
    }

    @Test("Validates an older saved selection against the served city list")
    @MainActor
    func normalizesOnlyAfterReceivingAuthoritativeConfiguration() async throws {
        let suiteName = "DiscoverCityPreferenceTests.selection-\(UUID().uuidString)"
        let defaults = try #require(UserDefaults(suiteName: suiteName))
        defer { defaults.removePersistentDomain(forName: suiteName) }
        defaults.set("Hamburg", forKey: "sideseat.discover.selectedCity")

        let store = DiscoverCityPreferenceStore(defaults: defaults)
        #expect(store.selectedCity == "Hamburg")
        #expect(store.servedCities == ["Hamburg"])

        let session = makeSession(
            transport: DiscoverCityTestTransport(
                configuration: .value(
                    defaultCity: "Berlin",
                    servedCities: ["Berlin", "Munich"]
                )
            )
        )
        await session.login(identifier: "test_001", password: "Password123")
        await store.refreshConfig(using: session)

        #expect(store.defaultCity == "Berlin")
        #expect(store.servedCities == ["Berlin", "Munich"])
        #expect(store.selectedCity == "Berlin")
        #expect(defaults.string(forKey: "sideseat.discover.selectedCity") == "Berlin")

        store.select("Hamburg")
        #expect(store.selectedCity == "Berlin")
        #expect(store.issue == "That city is not available yet.")
    }

    @Test("Localizes the city picker and single-city explanation")
    func localizesSingleCityPickerCopy() {
        let cases: [(
            language: AppLanguage,
            title: String,
            city: String,
            explanation: String
        )] = [
            (
                .english,
                "Choose a city",
                "Munich",
                "Only Munich is available right now. More cities are coming."
            ),
            (
                .german,
                "Stadt auswählen",
                "München",
                "Derzeit ist nur München verfügbar. Weitere Städte folgen."
            ),
            (
                .simplifiedChinese,
                "选择城市",
                "慕尼黑",
                "目前仅支持慕尼黑，更多城市即将开放。"
            ),
        ]

        for testCase in cases {
            let bundle = AppLocalization.localizationBundle(for: testCase.language)
            let title = bundle.localizedString(
                forKey: "Choose a city",
                value: nil,
                table: nil
            )
            let city = bundle.localizedString(forKey: "Munich", value: nil, table: nil)
            let explanationFormat = bundle.localizedString(
                forKey: "Only %@ is available right now. More cities are coming.",
                value: nil,
                table: nil
            )

            #expect(title == testCase.title)
            #expect(city == testCase.city)
            #expect(String(format: explanationFormat, city) == testCase.explanation)
        }
    }

    @MainActor
    private func makeSession(transport: DiscoverCityTestTransport) -> SessionStore {
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
            credentialStore: DiscoverCityMemoryCredentialStore(),
            device: NativeDevice(
                id: "discover-city-device",
                name: "Discover City iPhone",
                appVersion: "1.0.0",
                platformVersion: "26.5"
            )
        )
    }
}

private actor DiscoverCityMemoryCredentialStore: CredentialStore {
    private var token: String?
    func refreshToken() -> String? { token }
    func save(refreshToken: String) { token = refreshToken }
    func clear() { token = nil }
}

private actor DiscoverCityTestTransport: APITransport {
    enum Configuration: Sendable {
        case value(defaultCity: String, servedCities: [String])
        case unavailable
    }

    private let configuration: Configuration

    init(configuration: Configuration) {
        self.configuration = configuration
    }

    func data(for request: URLRequest) async throws -> (Data, URLResponse) {
        let data: Data
        switch request.url?.path {
        case "/api/v1/auth/login":
            data = Data(
                #"{"data":{"user":{"id":"user-1","username":"test_001","nickname":"Test User","gender":"PRIVATE","onboardingComplete":true,"isGuest":false,"verifiedStudent":true,"studentVerificationStatus":"VERIFIED","locale":"en"},"tokens":{"accessToken":"access-token","accessExpiresIn":900,"refreshToken":"refresh-token","refreshExpiresAt":"2026-08-16T00:00:00.000Z"}}}"#.utf8
            )
        case "/api/v1/client-config":
            switch configuration {
            case .unavailable:
                throw URLError(.notConnectedToInternet)
            case .value(let defaultCity, let servedCities):
                data = try JSONSerialization.data(withJSONObject: [
                    "data": [
                        "apiVersion": "v1",
                        "serverTime": "2026-08-20T12:00:00.000Z",
                        "ios": [
                            "minimumSupportedVersion": "1.0.0",
                            "latestVersion": "1.0.0",
                            "maintenanceMode": false,
                        ],
                        "features": ["nativeAuthentication": true],
                        "discover": [
                            "defaultCity": defaultCity,
                            "servedCities": servedCities,
                        ],
                    ],
                ])
            }
        default:
            throw URLError(.badURL)
        }

        let response = HTTPURLResponse(
            url: request.url!,
            statusCode: 200,
            httpVersion: nil,
            headerFields: ["Content-Type": "application/json"]
        )!
        return (data, response)
    }
}
