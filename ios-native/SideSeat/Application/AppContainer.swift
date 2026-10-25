import Foundation
import Observation

@MainActor
@Observable
final class AppContainer {
    let environment: AppEnvironment
    let apiClient: APIClient
    let credentialStore: any CredentialStore
    let session: SessionStore
    let clientConfiguration: ClientConfigurationStore
    let deepLinkRouter = DeepLinkRouter()
    let configurationIssue: String?

    init(
        environment: AppEnvironment,
        apiClient: APIClient,
        credentialStore: any CredentialStore,
        configurationIssue: String? = nil
    ) {
        self.environment = environment
        self.apiClient = apiClient
        self.credentialStore = credentialStore
        self.configurationIssue = configurationIssue
        self.session = SessionStore(
            apiClient: apiClient,
            credentialStore: credentialStore,
            device: NativeDevice.current
        )
        self.clientConfiguration = ClientConfigurationStore(
            apiClient: apiClient,
            currentVersion: environment.appVersion
        )
    }

    static func bootstrap(bundle: Bundle = .main) -> AppContainer {
        do {
            let environment = try AppEnvironment.load(from: bundle)
            let apiClient = APIClient(environment: environment)
            let credentialStore: any CredentialStore
            #if DEBUG
            let arguments = ProcessInfo.processInfo.arguments
            let qaCredentialsKey = "sideseat.ui-testing-persistent-qa-credentials"
            if arguments.contains("--ui-testing-end-persistent-qa-credentials") {
                UserDefaults.standard.removeObject(forKey: qaCredentialsKey)
            } else if arguments.contains("--ui-testing-persistent-qa-credentials") {
                UserDefaults.standard.set(true, forKey: qaCredentialsKey)
            }
            if arguments.contains("--ui-testing-ephemeral-credentials") {
                credentialStore = EphemeralCredentialStore()
            } else if UserDefaults.standard.bool(forKey: qaCredentialsKey) {
                // Notification cold launches have no test arguments; keep the owner's session separate.
                credentialStore = KeychainCredentialStore(service: environment.bundleIdentifier + ".ui-testing")
            } else {
                credentialStore = ResilientCredentialStore(service: environment.bundleIdentifier)
            }
            #else
            credentialStore = KeychainCredentialStore(service: environment.bundleIdentifier)
            #endif
            let container = AppContainer(
                environment: environment,
                apiClient: apiClient,
                credentialStore: credentialStore
            )
            #if DEBUG
            container.applyUITestingLaunchState()
            #endif
            return container
        } catch {
            let fallback = AppEnvironment.developmentFallback
            #if DEBUG
            let credentialStore: any CredentialStore = ResilientCredentialStore(service: fallback.bundleIdentifier)
            #else
            let credentialStore: any CredentialStore = KeychainCredentialStore(service: fallback.bundleIdentifier)
            #endif
            return AppContainer(
                environment: fallback,
                apiClient: APIClient(environment: fallback),
                credentialStore: credentialStore,
                configurationIssue: error.localizedDescription
            )
        }
    }

    #if DEBUG
    private func applyUITestingLaunchState() {
        let arguments = ProcessInfo.processInfo.arguments
        if arguments.contains("--ui-testing-slow-cached-launch") {
            session.installUITestingSlowCachedLaunchState()
            clientConfiguration.installUITestingAvailability()
        } else if arguments.contains("--ui-testing-offline-cached-launch") {
            session.installUITestingOfflineCachedLaunchState()
            clientConfiguration.installUITestingAvailability()
        } else if arguments.contains("--ui-testing-authenticated") {
            session.installUITestingSession()
            clientConfiguration.installUITestingAvailability(
                features: [
                    "naturalLanguageSchedule": arguments.contains("--ui-testing-smart-schedule"),
                    "storeKitSupport": true,
                    "apnsDelivery": false,
                    "v2FlexibleTiming": arguments.contains("--ui-testing-flexible-timing"),
                    "v2AutomaticMatching": arguments.contains("--ui-testing-automatic-matching"),
                    "v2DiscoveryMatching": arguments.contains("--ui-testing-discovery-matching"),
                    "v2ExploreIntents": arguments.contains("--ui-testing-explore-intents") || arguments.contains("--ui-testing-explore-empty"),
                ]
            )
        } else if arguments.contains("--ui-testing-signed-out") {
            session.installUITestingSignedOutState()
            clientConfiguration.installUITestingAvailability()
        }
    }
    #endif
}
