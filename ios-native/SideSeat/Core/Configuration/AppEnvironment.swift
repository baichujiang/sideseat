import Foundation

enum DeploymentEnvironment: String, Sendable {
    case development
    case staging
    case production
}

struct AppEnvironment: Sendable {
    let deployment: DeploymentEnvironment
    let apiBaseURL: URL
    let bundleIdentifier: String
    let appVersion: String
    let buildNumber: String

    static func load(from bundle: Bundle) throws -> AppEnvironment {
        guard
            let environmentValue = bundle.object(forInfoDictionaryKey: "SideSeatEnvironment") as? String,
            let deployment = DeploymentEnvironment(rawValue: environmentValue)
        else {
            throw AppConfigurationError.missingEnvironment
        }
        guard
            let rawURL = bundle.object(forInfoDictionaryKey: "SideSeatAPIBaseURL") as? String,
            let configuredAPIBaseURL = URL(string: rawURL),
            configuredAPIBaseURL.host != nil
        else {
            throw AppConfigurationError.invalidAPIBaseURL
        }

        var apiBaseURL = configuredAPIBaseURL
#if DEBUG
        if let testOverride = debugAPIBaseURLOverride(
            deployment: deployment,
            arguments: ProcessInfo.processInfo.arguments,
            environment: ProcessInfo.processInfo.environment
        ) {
            apiBaseURL = testOverride
        }
#endif

        if deployment == .production {
            guard apiBaseURL.scheme == "https" else {
                throw AppConfigurationError.insecureProductionURL
            }
            guard !apiBaseURL.isLocalOrPlaceholder else {
                throw AppConfigurationError.placeholderProductionURL
            }
        }

        return AppEnvironment(
            deployment: deployment,
            apiBaseURL: apiBaseURL,
            bundleIdentifier: bundle.bundleIdentifier ?? "app.sideseat.mobile",
            appVersion: bundle.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "0",
            buildNumber: bundle.object(forInfoDictionaryKey: "CFBundleVersion") as? String ?? "0"
        )
    }

#if DEBUG
    static func debugAPIBaseURLOverride(
        deployment: DeploymentEnvironment,
        arguments: [String],
        environment: [String: String]
    ) -> URL? {
        guard
            deployment == .development,
            arguments.contains("--ui-testing-local-api"),
            let rawURL = environment["SIDESEAT_API_BASE_URL_OVERRIDE"],
            let url = URL(string: rawURL),
            url.isLoopback
        else {
            return nil
        }
        return url
    }
#endif

    static let developmentFallback = AppEnvironment(
        deployment: .development,
        apiBaseURL: URL(string: "http://127.0.0.1:3000")!,
        bundleIdentifier: "app.sideseat.mobile",
        appVersion: "0",
        buildNumber: "0"
    )
}

enum AppConfigurationError: LocalizedError {
    case missingEnvironment
    case invalidAPIBaseURL
    case insecureProductionURL
    case placeholderProductionURL

    var errorDescription: String? {
        switch self {
        case .missingEnvironment:
            "SideSeatEnvironment is missing from Info.plist."
        case .invalidAPIBaseURL:
            "SideSeatAPIBaseURL is missing or invalid."
        case .insecureProductionURL:
            "Production requires an HTTPS API URL."
        case .placeholderProductionURL:
            "Production requires a public API URL instead of localhost or a placeholder domain."
        }
    }
}

private extension URL {
    var isLoopback: Bool {
        guard let host = host?.lowercased() else { return false }
        return host == "localhost" || host == "127.0.0.1" || host == "::1"
    }

    var isLocalOrPlaceholder: Bool {
        guard let host = host?.lowercased() else { return true }
        return host == "localhost" ||
            host == "127.0.0.1" ||
            host == "::1" ||
            host.hasSuffix(".localhost") ||
            host.hasSuffix(".invalid")
    }
}
