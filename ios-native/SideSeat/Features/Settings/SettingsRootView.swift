import SwiftUI

struct SettingsRootView: View {
    @Environment(SessionStore.self) private var session
    @Environment(ClientConfigurationStore.self) private var clientConfiguration
    @Environment(RouterPath.self) private var router
    @Environment(\.openURL) private var openURL

    @AppStorage("sideseat.preferredLanguage") private var preferredLanguage = "system"
    @State private var showDeleteAccount = false

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
                Picker("Language", selection: $preferredLanguage) {
                    Text("System").tag("system")
                    Text("English").tag("en")
                    Text("Deutsch").tag("de")
                    Text("中文").tag("zh")
                }
                .accessibilityIdentifier("settings-language")
                Text("App language follows this preference after the next launch.")
                    .font(.footnote)
                    .foregroundStyle(.secondary)

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

                Button {
                    if let url = URL(string: "mailto:support@sideseat.app") {
                        openURL(url)
                    }
                } label: {
                    Label("Email support", systemImage: "envelope")
                }
                .accessibilityIdentifier("settings-support")
            }

            Section("About") {
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
        .accessibilityIdentifier("settings-root")
    }

    private func url(from raw: String?) -> URL? {
        guard let raw, let url = URL(string: raw), url.scheme == "https" else { return nil }
        return url
    }
}
