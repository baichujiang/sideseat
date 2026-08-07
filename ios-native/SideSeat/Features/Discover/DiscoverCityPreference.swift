import Foundation
import Observation

/// Device-local Discover city preference, mirroring the Web cookie preference.
/// Available cities come from `/api/v1/client-config`; only served cities may be selected.
@MainActor
@Observable
final class DiscoverCityPreferenceStore {
    static let shared = DiscoverCityPreferenceStore()

    private static let selectedCityKey = "sideseat.discover.selectedCity"
    private static let fallbackDefaultCity = "Munich"
    private static let fallbackServedCities = ["Munich"]

    private(set) var selectedCity: String
    private(set) var servedCities: [String]
    private(set) var defaultCity: String
    private(set) var isLoadingConfig = false
    private(set) var issue: String?

    private init() {
        let defaults = UserDefaults.standard
        let stored = defaults.string(forKey: Self.selectedCityKey)?.trimmingCharacters(in: .whitespacesAndNewlines)
        defaultCity = Self.fallbackDefaultCity
        servedCities = Self.fallbackServedCities
        if let stored, !stored.isEmpty {
            selectedCity = stored
        } else {
            selectedCity = Self.fallbackDefaultCity
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
            applyConfig(defaultCity: Self.fallbackDefaultCity, servedCities: Self.fallbackServedCities)
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
            // Keep the last known preference when config is temporarily unavailable.
            issue = error.localizedDescription
            normalizeSelection()
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
        UserDefaults.standard.set(trimmed, forKey: Self.selectedCityKey)
        issue = nil
    }

    private func applyConfig(defaultCity: String, servedCities: [String]) {
        let cities = servedCities
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
        self.defaultCity = defaultCity.trimmingCharacters(in: .whitespacesAndNewlines).nilIfEmpty
            ?? Self.fallbackDefaultCity
        self.servedCities = cities.isEmpty ? Self.fallbackServedCities : cities
        normalizeSelection()
    }

    private func normalizeSelection() {
        if servedCities.contains(selectedCity) { return }
        let next = servedCities.contains(defaultCity) ? defaultCity : (servedCities.first ?? Self.fallbackDefaultCity)
        selectedCity = next
        UserDefaults.standard.set(next, forKey: Self.selectedCityKey)
    }
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
