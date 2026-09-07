import SwiftUI
import UIKit
import UserNotifications

struct SettingsRootView: View {
    @Environment(SessionStore.self) private var session
    @Environment(ClientConfigurationStore.self) private var clientConfiguration
    @Environment(RouterPath.self) private var router
    @Environment(AppLanguageStore.self) private var appLanguage
    @Environment(\.openURL) private var openURL
    @Environment(\.scenePhase) private var scenePhase

    @State private var cityPreference = DiscoverCityPreferenceStore.shared
    @State private var showDeleteAccount = false
    @State private var showAppShare = false
    @State private var notificationStatus: UNAuthorizationStatus = .notDetermined

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
                            Text(verbatim: DiscoverCityDisplay.localizedName(for: city))
                                .tag(city)
                        }
                    }
                    .accessibilityIdentifier("settings-discover-city-picker")
                } else {
                    LabeledContent("City") {
                        Text(verbatim: DiscoverCityDisplay.localizedName(for: cityPreference.selectedCity))
                    }
                    .accessibilityIdentifier("settings-discover-city")
                }

                NavigationLink {
                    AppLanguageSettingsView()
                } label: {
                    HStack(spacing: 12) {
                        Label("App language", systemImage: "globe")
                            .foregroundStyle(.primary)
                        Spacer()
                        Text(appLanguage.currentSelectionName)
                            .foregroundStyle(.secondary)
                    }
                }
                .accessibilityIdentifier("settings-language")
                .accessibilityValue(appLanguage.currentSelectionName)

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

    private var notificationStatusLabel: String {
        switch notificationStatus {
        case .authorized, .provisional, .ephemeral:
            return AppLocalization.string( "On")
        case .denied:
            return AppLocalization.string( "Off")
        case .notDetermined:
            return AppLocalization.string( "Set up")
        @unknown default:
            return AppLocalization.string( "Off")
        }
    }

    private func refreshNotificationStatus() async {
        notificationStatus = await UNUserNotificationCenter.current()
            .notificationSettings()
            .authorizationStatus
    }
}

private struct AppLanguageSettingsView: View {
    @Environment(AppLanguageStore.self) private var appLanguage

    var body: some View {
        List {
            Section {
                languageRow(.system, title: nil, subtitle: "Use the language selected for your iPhone.")
                languageRow(.simplifiedChinese, title: AppLanguage.simplifiedChinese.nativeName)
                languageRow(.english, title: AppLanguage.english.nativeName)
                languageRow(.german, title: AppLanguage.german.nativeName)
            } footer: {
                Text("SideSeat changes language immediately. iOS permission prompts continue to use the iPhone language.")
            }
        }
        .navigationTitle(AppLocalization.string("App language"))
        .navigationBarTitleDisplayMode(.inline)
        .accessibilityIdentifier("app-language-settings")
    }

    private func languageRow(
        _ language: AppLanguage,
        title: String?,
        subtitle: LocalizedStringKey? = nil
    ) -> some View {
        Button {
            appLanguage.select(language)
        } label: {
            HStack(spacing: 12) {
                VStack(alignment: .leading, spacing: 3) {
                    Text(title ?? AppLocalization.string("Follow iPhone"))
                        .foregroundStyle(.primary)
                    if let subtitle {
                        Text(subtitle)
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                    }
                }
                Spacer(minLength: 12)
                if appLanguage.selection == language {
                    Image(systemName: "checkmark")
                        .font(.body.weight(.semibold))
                        .foregroundStyle(SideSeatTheme.utilityAction)
                }
            }
            .contentShape(Rectangle())
        }
        .accessibilityIdentifier("app-language-\(language.rawValue)")
        .accessibilityAddTraits(appLanguage.selection == language ? .isSelected : [])
    }
}
