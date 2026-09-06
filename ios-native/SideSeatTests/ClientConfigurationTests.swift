import Foundation
import Testing
@testable import SideSeat

@Suite("Client configuration", .serialized)
struct ClientConfigurationTests {
    @Test("Compares numeric app version components")
    func versionComparison() {
        #expect(AppVersion("1.10.0") > AppVersion("1.9.9"))
        #expect(AppVersion("1.0") == AppVersion("1.0.0"))
        #expect(AppVersion("2.0.0-beta") == AppVersion("2.0.0"))
    }

    @Test("Requires an update below the minimum version")
    func minimumVersion() {
        let configuration = IOSConfiguration(
            minimumSupportedVersion: "1.2.0",
            latestVersion: "1.3.0",
            maintenanceMode: false
        )
        #expect(
            ClientConfigurationStore.availability(
                for: configuration,
                currentVersion: "1.1.9"
            ) == .updateRequired(minimumVersion: "1.2.0")
        )
    }

    @Test("Maintenance takes precedence over version state")
    func maintenanceMode() {
        let configuration = IOSConfiguration(
            minimumSupportedVersion: "1.0.0",
            latestVersion: "1.0.0",
            maintenanceMode: true
        )
        #expect(
            ClientConfigurationStore.availability(
                for: configuration,
                currentVersion: "2.0.0"
            ) == .maintenance
        )
    }

    @Test("Advertises creator-gated coordination capability on every API request")
    func actionCoordinationCapabilityHeader() async throws {
        let transport = CapabilityHeaderTransport()
        let client = APIClient(
            environment: .clientConfigurationTest,
            transport: transport
        )

        let _: EmptyCapabilityResponse = try await client.send("api/v1/capability-test")
        let _: EmptyCapabilityResponse = try await client.uploadMultipart(
            "api/v1/capability-upload-test",
            file: MultipartUploadFile(
                fieldName: "file",
                fileName: "test.txt",
                mimeType: "text/plain",
                data: Data("test".utf8)
            )
        )

        let capabilityHeaders = await transport.capabilityHeaders
        #expect(capabilityHeaders == [
            APIClient.actionCoordinationCapability,
            APIClient.actionCoordinationCapability,
        ])
    }

    @Test("A first launch never waits for the compatibility endpoint")
    @MainActor
    func firstLaunchDefaultsToAvailable() {
        let defaults = UserDefaults(suiteName: "ClientConfigurationTests.firstLaunch")!
        defaults.removePersistentDomain(forName: "ClientConfigurationTests.firstLaunch")
        let store = ClientConfigurationStore(
            apiClient: APIClient(
                environment: .clientConfigurationTest,
                transport: ClientConfigurationTransport(result: .offline)
            ),
            currentVersion: "1.0.0",
            defaults: defaults
        )

        #expect(store.availability == .available(updateAvailable: false))
        #expect(!store.isRefreshing)
    }

    @Test("A saved configuration is available before the next network request")
    @MainActor
    func hydratesSavedConfigurationSynchronously() async {
        let suiteName = "ClientConfigurationTests.cache"
        let defaults = UserDefaults(suiteName: suiteName)!
        defaults.removePersistentDomain(forName: suiteName)
        let onlineStore = ClientConfigurationStore(
            apiClient: APIClient(
                environment: .clientConfigurationTest,
                transport: ClientConfigurationTransport(result: .success)
            ),
            currentVersion: "1.0.0",
            defaults: defaults
        )

        await onlineStore.refresh()
        #expect(onlineStore.configuration?.isFeatureEnabled("naturalLanguageSchedule") == true)

        let offlineStore = ClientConfigurationStore(
            apiClient: APIClient(
                environment: .clientConfigurationTest,
                transport: ClientConfigurationTransport(result: .offline)
            ),
            currentVersion: "1.0.0",
            defaults: defaults
        )

        #expect(offlineStore.configuration?.isFeatureEnabled("naturalLanguageSchedule") == true)
        #expect(offlineStore.availability == .available(updateAvailable: true))
        defaults.removePersistentDomain(forName: suiteName)
    }
}

private struct EmptyCapabilityResponse: Decodable, Sendable {}

private actor CapabilityHeaderTransport: APITransport {
    private(set) var capabilityHeaders: [String?] = []

    func data(for request: URLRequest) async throws -> (Data, URLResponse) {
        capabilityHeaders.append(
            request.value(forHTTPHeaderField: "X-SideSeat-Capabilities")
        )
        let response = HTTPURLResponse(
            url: request.url!,
            statusCode: 200,
            httpVersion: "HTTP/1.1",
            headerFields: ["Content-Type": "application/json"]
        )!
        return (Data("{}".utf8), response)
    }
}

private actor ClientConfigurationTransport: APITransport {
    enum Result: Sendable {
        case success
        case offline
    }

    let result: Result

    init(result: Result) {
        self.result = result
    }

    func data(for request: URLRequest) async throws -> (Data, URLResponse) {
        switch result {
        case .offline:
            throw URLError(.notConnectedToInternet)
        case .success:
            let response = HTTPURLResponse(
                url: request.url!,
                statusCode: 200,
                httpVersion: "HTTP/1.1",
                headerFields: ["Content-Type": "application/json"]
            )!
            let body = #"{"data":{"apiVersion":"v1","serverTime":"2026-08-14T00:00:00Z","ios":{"minimumSupportedVersion":"1.0.0","latestVersion":"1.1.0","maintenanceMode":false},"features":{"naturalLanguageSchedule":true},"links":null}}"#
            return (Data(body.utf8), response)
        }
    }
}

private extension AppEnvironment {
    static let clientConfigurationTest = AppEnvironment(
        deployment: .development,
        apiBaseURL: URL(string: "https://api.sideseat.test")!,
        bundleIdentifier: "app.sideseat.mobile.client-configuration-tests",
        appVersion: "1.0.0",
        buildNumber: "1"
    )
}
