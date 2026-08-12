import SwiftUI
import UIKit
import UserNotifications

struct SettingsRootView: View {
    @Environment(SessionStore.self) private var session
    @Environment(ClientConfigurationStore.self) private var clientConfiguration
    @Environment(RouterPath.self) private var router
    @Environment(\.openURL) private var openURL
    @Environment(\.scenePhase) private var scenePhase

    @State private var cityPreference = DiscoverCityPreferenceStore.shared
    @State private var showDeleteAccount = false
    @State private var showAppShare = false
    @State private var notificationStatus: UNAuthorizationStatus = .notDetermined

    private var storeKitEnabled: Bool {
        clientConfiguration.configuration?.isFeatureEnabled("storeKitSupport") == true
    }

    private var privacyURL: URL? {
        url(from: clientConfiguration.configuration?.links?.privacyUrl) ?? URL(string: "https://sideseat.de/privacy")
    }

    private var supportURL: URL? {
        url(from: clientConfiguration.configuration?.links?.supportUrl) ?? URL(string: "https://sideseat.de/support")
    }

    var body: some View {
        List {
            Section("Preferences") {
                if cityPreference.servedCities.count > 1 {
                    Picker("City", selection: Binding(
                        get: { cityPreference.selectedCity },
                        set: { cityPreference.select($0) }
                    )) {
                        ForEach(cityPreference.servedCities, id: \.self) { city in
                            Text(city).tag(city)
                        }
                    }
                    .accessibilityIdentifier("settings-discover-city-picker")
                } else {
                    LabeledContent("City", value: cityPreference.selectedCity)
                        .accessibilityIdentifier("settings-discover-city")
                }

                Button {
                    guard let settingsURL = URL(string: UIApplication.openSettingsURLString) else { return }
                    openURL(settingsURL)
                } label: {
                    HStack(spacing: 12) {
                        Label("App language", systemImage: "globe")
                            .foregroundStyle(.primary)
                        Spacer()
                        Text(currentAppLanguageName)
                            .foregroundStyle(.secondary)
                        Image(systemName: "arrow.up.forward.app")
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(.tertiary)
                    }
                }
                .accessibilityIdentifier("settings-language")
                .accessibilityValue(currentAppLanguageName)
                Text("Change SideSeat's language in iPhone Settings.")
                    .font(.footnote)
                    .foregroundStyle(.secondary)

                Button {
                    Task {
                        if notificationStatus == .notDetermined {
                            await PushRegistration.requestAndRegister(using: session)
                            await refreshNotificationStatus()
                        } else if let settingsURL = URL(string: UIApplication.openSettingsURLString) {
                            openURL(settingsURL)
                        }
                    }
                } label: {
                    HStack(spacing: 12) {
                        Label("Notifications", systemImage: "bell")
                            .foregroundStyle(.primary)
                        Spacer()
                        Text(notificationStatusLabel)
                            .foregroundStyle(.secondary)
                        Image(systemName: notificationStatus == .notDetermined ? "chevron.right" : "arrow.up.forward.app")
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(.tertiary)
                    }
                }
                .accessibilityIdentifier("settings-notifications")
                .accessibilityValue(notificationStatusLabel)

                Button {
                    if let userID = session.currentUser?.id {
                        NotificationCenter.default.post(
                            name: .sideseatReplayProductTutorial,
                            object: nil,
                            userInfo: ["userID": userID]
                        )
                    }
                } label: {
                    Label("Replay app tutorial", systemImage: "sparkles")
                }
                .accessibilityIdentifier("settings-replay-tutorial")
            }

            Section("Support") {
                if storeKitEnabled {
                    Button {
                        router.navigate(to: .supportStore)
                    } label: {
                        Label("Support SideSeat", systemImage: "heart")
                    }
                    .accessibilityIdentifier("settings-support-store")
                }

                Button {
                    router.navigate(to: .feedback)
                } label: {
                    Label("Send feedback", systemImage: "bubble.left.and.exclamationmark.bubble.right")
                }
                .accessibilityIdentifier("settings-feedback")

                if let supportURL {
                    Button {
                        openURL(supportURL)
                    } label: {
                        Label("Help center", systemImage: "questionmark.circle")
                    }
                    .accessibilityIdentifier("settings-support-web")
                }

            }

            Section("About") {
                Button {
                    showAppShare = true
                } label: {
                    Label("Share SideSeat", systemImage: "square.and.arrow.up")
                }
                .accessibilityIdentifier("settings-share-sideseat")

                LabeledContent("Version", value: Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "1.0")
                LabeledContent("Build", value: Bundle.main.infoDictionary?["CFBundleVersion"] as? String ?? "1")
                if let privacyURL {
                    Button {
                        openURL(privacyURL)
                    } label: {
                        Label("Privacy", systemImage: "hand.raised")
                    }
                    .accessibilityIdentifier("settings-privacy")
                }
                Text("SideSeat helps classmates coordinate plans around real schedules.")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }

            Section("Account") {
                Button {
                    router.navigate(to: .blockedUsers)
                } label: {
                    Label("Blocked users", systemImage: "hand.raised")
                }
                .accessibilityIdentifier("settings-blocked-users")

                Button("Delete account", role: .destructive) {
                    showDeleteAccount = true
                }
                .accessibilityIdentifier("settings-delete-account")

                Button("Log out", role: .destructive) {
                    Task { await session.logout() }
                }
                .accessibilityIdentifier("settings-logout")
            }
        }
        .navigationTitle("Settings")
        .navigationBarTitleDisplayMode(.inline)
        .sheet(isPresented: $showDeleteAccount) {
            DeleteAccountSheet()
        }
        .sheet(isPresented: $showAppShare) {
            SideSeatAppSharePreview()
        }
        .task {
            await cityPreference.refreshConfig(using: session)
            await refreshNotificationStatus()
        }
        .onChange(of: scenePhase) { _, phase in
            guard phase == .active else { return }
            Task { await refreshNotificationStatus() }
        }
        .accessibilityIdentifier("settings-root")
    }

    private func url(from raw: String?) -> URL? {
        guard let raw, let url = URL(string: raw), url.scheme == "https" else { return nil }
        return url
    }

    private var currentAppLanguageName: String {
        let identifier = Bundle.main.preferredLocalizations.first ?? "en"
        if identifier.hasPrefix("de") { return "Deutsch" }
        if identifier.hasPrefix("zh") { return "中文" }
        return "English"
    }

    private var notificationStatusLabel: String {
        switch notificationStatus {
        case .authorized, .provisional, .ephemeral:
            return String(localized: "On")
        case .denied:
            return String(localized: "Off")
        case .notDetermined:
            return String(localized: "Set up")
        @unknown default:
            return String(localized: "Off")
        }
    }

    private func refreshNotificationStatus() async {
        notificationStatus = await UNUserNotificationCenter.current()
            .notificationSettings()
            .authorizationStatus
    }
}
