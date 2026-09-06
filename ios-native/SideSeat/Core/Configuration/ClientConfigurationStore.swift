import Foundation
import Observation

struct ClientConfiguration: Codable, Sendable {
    let apiVersion: String
    let serverTime: String
    let ios: IOSConfiguration
    let features: [String: Bool]
    let links: ClientLinks?

    func isFeatureEnabled(_ key: String) -> Bool {
        features[key] == true
    }
}

struct ClientLinks: Codable, Sendable {
    let privacyUrl: String?
    let supportUrl: String?
}

struct IOSConfiguration: Codable, Sendable {
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
    private let defaults: UserDefaults
    private let cacheKey = "sideseat.client-configuration-v1"
    private let hardGateCacheLifetime: TimeInterval = 24 * 60 * 60

    private(set) var availability: ClientAvailability = .available(updateAvailable: false)
    private(set) var configuration: ClientConfiguration?
    private(set) var issue: String?
    private(set) var isRefreshing = false
    private(set) var lastCheckedAt: Date?

    init(
        apiClient: APIClient,
        currentVersion: String,
        defaults: UserDefaults = .standard
    ) {
        self.apiClient = apiClient
        self.currentVersion = currentVersion
        self.defaults = defaults

        guard
            let data = defaults.data(forKey: cacheKey),
            let cached = try? JSONDecoder().decode(CachedClientConfiguration.self, from: data)
        else { return }

        configuration = cached.configuration
        lastCheckedAt = cached.savedAt
        if Date().timeIntervalSince(cached.savedAt) <= hardGateCacheLifetime {
            availability = Self.availability(
                for: cached.configuration.ios,
                currentVersion: currentVersion
            )
        }
    }

    func refresh() async {
        guard !isRefreshing else { return }
        isRefreshing = true
        defer { isRefreshing = false }
        issue = nil
        do {
            let response: APIEnvelope<ClientConfiguration> = try await apiClient.send(
                "api/v1/client-config"
            )
            configuration = response.data
            let checkedAt = Date()
            lastCheckedAt = checkedAt
            availability = Self.availability(
                for: response.data.ios,
                currentVersion: currentVersion
            )
            let cached = CachedClientConfiguration(
                savedAt: checkedAt,
                configuration: response.data
            )
            if let data = try? JSONEncoder().encode(cached) {
                defaults.set(data, forKey: cacheKey)
            }
        } catch {
            issue = error.localizedDescription
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

private struct CachedClientConfiguration: Codable {
    let savedAt: Date
    let configuration: ClientConfiguration
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
