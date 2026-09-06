import Foundation
import Observation

enum DiscoverCityDisplay {
    static func localizedName(for canonicalName: String) -> String {
        let language = AppLocalization.selectedLanguage
        return AppLocalization.localizationBundle(for: language).localizedString(
            forKey: canonicalName,
            value: canonicalName,
            table: nil
        )
    }
}

/// Device-local Discover city preference, mirroring the Web cookie preference.
/// Available cities come from `/api/v1/client-config`; only served cities may be selected.
@MainActor
@Observable
final class DiscoverCityPreferenceStore {
    static let shared = DiscoverCityPreferenceStore()

    private static let selectedCityKey = "sideseat.discover.selectedCity"
    private static let configurationCacheKey = "sideseat.discover.city-configuration-v1"
    /// Used only before this installation has ever received a server configuration.
    private static let bootstrapConfiguration = DiscoverCityConfiguration(
        defaultCity: "Munich",
        servedCities: ["Munich"]
    )

    private let defaults: UserDefaults
    private var hasPersistedSelection: Bool

    private(set) var selectedCity: String
    private(set) var servedCities: [String]
    private(set) var defaultCity: String
    private(set) var isLoadingConfig = false
    private(set) var issue: String?

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults

        let storedSelection = defaults.string(forKey: Self.selectedCityKey)?
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .nilIfEmpty
        hasPersistedSelection = storedSelection != nil

        let cachedConfiguration = defaults.data(forKey: Self.configurationCacheKey)
            .flatMap { try? JSONDecoder().decode(DiscoverCityConfiguration.self, from: $0) }
            .flatMap(Self.normalizedConfiguration)
        let initialConfiguration: DiscoverCityConfiguration
        if let cachedConfiguration {
            initialConfiguration = cachedConfiguration
        } else if let storedSelection {
            // A selection from an older app version is a better offline source than
            // resetting the user to the first-install bootstrap city.
            initialConfiguration = DiscoverCityConfiguration(
                defaultCity: storedSelection,
                servedCities: [storedSelection]
            )
        } else {
            initialConfiguration = Self.bootstrapConfiguration
        }

        defaultCity = initialConfiguration.defaultCity
        servedCities = initialConfiguration.servedCities
        selectedCity = storedSelection ?? initialConfiguration.defaultCity

        if cachedConfiguration != nil,
           hasPersistedSelection,
           !servedCities.contains(selectedCity)
        {
            selectedCity = initialConfiguration.defaultCity
            defaults.set(selectedCity, forKey: Self.selectedCityKey)
        }
    }

    func refreshConfig(using session: SessionStore) async {
        isLoadingConfig = true
        issue = nil
        defer { isLoadingConfig = false }

        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("--ui-testing-slow-city-config") {
            try? await Task.sleep(for: .seconds(4))
        }
        if ProcessInfo.processInfo.arguments.contains("--ui-testing-authenticated") ||
            ProcessInfo.processInfo.arguments.contains("--ui-testing")
        {
            applyConfig(
                defaultCity: Self.bootstrapConfiguration.defaultCity,
                servedCities: Self.bootstrapConfiguration.servedCities
            )
            return
        }
        #endif

        do {
            let response: APIEnvelope<NativeClientDiscoverConfigEnvelope> = try await session.sendAuthorized(
                "api/v1/client-config"
            )
            applyConfig(
                defaultCity: response.data.discover.defaultCity,
                servedCities: response.data.discover.servedCities
            )
        } catch {
            // Keep both the last successful configuration and selection while offline.
            issue = error.localizedDescription
        }
    }

    func select(_ city: String) {
        let trimmed = city.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        guard servedCities.contains(trimmed) else {
            issue = "That city is not available yet."
            return
        }
        selectedCity = trimmed
        hasPersistedSelection = true
        defaults.set(trimmed, forKey: Self.selectedCityKey)
        issue = nil
    }

    private func applyConfig(defaultCity: String, servedCities: [String]) {
        guard let configuration = Self.normalizedConfiguration(
            DiscoverCityConfiguration(defaultCity: defaultCity, servedCities: servedCities)
        ) else {
            issue = "No Discover cities are configured."
            return
        }

        self.defaultCity = configuration.defaultCity
        self.servedCities = configuration.servedCities
        if let data = try? JSONEncoder().encode(configuration) {
            defaults.set(data, forKey: Self.configurationCacheKey)
        }
        normalizeSelection()
    }

    private func normalizeSelection() {
        if hasPersistedSelection, servedCities.contains(selectedCity) { return }
        let next = servedCities.contains(defaultCity) ? defaultCity : servedCities[0]
        selectedCity = next
        hasPersistedSelection = true
        defaults.set(next, forKey: Self.selectedCityKey)
    }

    private static func normalizedConfiguration(
        _ configuration: DiscoverCityConfiguration
    ) -> DiscoverCityConfiguration? {
        var seen = Set<String>()
        let cities = configuration.servedCities.compactMap { rawCity -> String? in
            guard let city = rawCity.trimmingCharacters(in: .whitespacesAndNewlines).nilIfEmpty,
                  seen.insert(city).inserted
            else { return nil }
            return city
        }
        guard let firstCity = cities.first else { return nil }

        let requestedDefault = configuration.defaultCity
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .nilIfEmpty
        let resolvedDefault = requestedDefault.flatMap { cities.contains($0) ? $0 : nil } ?? firstCity
        return DiscoverCityConfiguration(defaultCity: resolvedDefault, servedCities: cities)
    }
}

private struct DiscoverCityConfiguration: Codable {
    let defaultCity: String
    let servedCities: [String]
}

struct NativeClientDiscoverConfigEnvelope: Decodable, Sendable {
    let discover: NativeClientDiscoverConfig
}

struct NativeClientDiscoverConfig: Decodable, Sendable {
    let defaultCity: String
    let servedCities: [String]
}

private extension String {
    var nilIfEmpty: String? {
        let trimmed = trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? nil : trimmed
    }
}
