import Foundation
import Observation

struct ClientConfiguration: Decodable, Sendable {
    let apiVersion: String
    let serverTime: String
    let ios: IOSConfiguration
    let features: [String: Bool]
    let links: ClientLinks?

    func isFeatureEnabled(_ key: String) -> Bool {
        features[key] == true
    }
}

struct ClientLinks: Decodable, Sendable {
    let privacyUrl: String?
    let supportUrl: String?
}

struct IOSConfiguration: Decodable, Sendable {
    let minimumSupportedVersion: String
    let latestVersion: String
    let maintenanceMode: Bool
}

enum ClientAvailability: Equatable, Sendable {
    case checking
    case available(updateAvailable: Bool)
    case maintenance
    case updateRequired(minimumVersion: String)
}

@MainActor
@Observable
final class ClientConfigurationStore {
    private let apiClient: APIClient
    private let currentVersion: String

    private(set) var availability: ClientAvailability = .checking
    private(set) var configuration: ClientConfiguration?
    private(set) var issue: String?

    init(apiClient: APIClient, currentVersion: String) {
        self.apiClient = apiClient
        self.currentVersion = currentVersion
    }

    func refresh() async {
        issue = nil
        do {
            let response: APIEnvelope<ClientConfiguration> = try await apiClient.send(
                "api/v1/client-config"
            )
            configuration = response.data
            availability = Self.availability(
                for: response.data.ios,
                currentVersion: currentVersion
            )
        } catch {
            issue = error.localizedDescription
            availability = .available(updateAvailable: false)
        }
    }

    nonisolated static func availability(
        for configuration: IOSConfiguration,
        currentVersion: String
    ) -> ClientAvailability {
        if configuration.maintenanceMode {
            return .maintenance
        }
        if AppVersion(currentVersion) < AppVersion(configuration.minimumSupportedVersion) {
            return .updateRequired(minimumVersion: configuration.minimumSupportedVersion)
        }
        return .available(
            updateAvailable: AppVersion(currentVersion) < AppVersion(configuration.latestVersion)
        )
    }

    #if DEBUG
    func installUITestingAvailability(features: [String: Bool] = [:]) {
        configuration = ClientConfiguration(
            apiVersion: "v1",
            serverTime: Date().ISO8601Format(),
            ios: IOSConfiguration(
                minimumSupportedVersion: "1.0.0",
                latestVersion: "1.0.0",
                maintenanceMode: false
            ),
            features: features,
            links: ClientLinks(
                privacyUrl: "https://sideseat.de/privacy",
                supportUrl: "https://sideseat.de/support"
            )
        )
        availability = .available(updateAvailable: false)
    }
    #endif
}

struct AppVersion: Comparable, Sendable {
    private let components: [Int]

    init(_ value: String) {
        let core = value.split(separator: "-", maxSplits: 1).first ?? ""
        let parsed = core.split(separator: ".").map { Int($0) ?? 0 }
        self.components = parsed.isEmpty ? [0] : parsed
    }

    static func == (lhs: AppVersion, rhs: AppVersion) -> Bool {
        !(lhs < rhs) && !(rhs < lhs)
    }

    static func < (lhs: AppVersion, rhs: AppVersion) -> Bool {
        let count = max(lhs.components.count, rhs.components.count)
        for index in 0..<count {
            let left = index < lhs.components.count ? lhs.components[index] : 0
            let right = index < rhs.components.count ? rhs.components[index] : 0
            if left != right {
                return left < right
            }
        }
        return false
    }
}
