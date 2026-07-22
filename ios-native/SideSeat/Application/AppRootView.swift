import SwiftUI

struct AppRootView: View {
    @Environment(AppContainer.self) private var container
    @Environment(SessionStore.self) private var session
    @Environment(ClientConfigurationStore.self) private var clientConfiguration

    var body: some View {
        Group {
            if let issue = container.configurationIssue {
                ConfigurationIssueView(message: issue)
            } else {
                switch clientConfiguration.availability {
                case .checking:
                    ProgressView("Checking compatibility")
                        .accessibilityIdentifier("client-configuration-checking")
                case .maintenance:
                    ClientGateView(
                        title: "Temporarily unavailable",
                        message: "SideSeat is undergoing maintenance. Please try again shortly."
                    )
                case .updateRequired(let minimumVersion):
                    ClientGateView(
                        title: "Update required",
                        message: "Install SideSeat \(minimumVersion) or newer to continue."
                    )
                case .available:
                    sessionContent
                }
            }
        }
    }

    @ViewBuilder
    private var sessionContent: some View {
        switch session.phase {
        case .restoring:
            ProgressView("Restoring session")
                .accessibilityIdentifier("session-restoring")
        case .signedOut:
            LoginView()
        case .signedIn:
            AppShellView()
        }
    }
}

private struct ClientGateView: View {
    @Environment(ClientConfigurationStore.self) private var clientConfiguration
    let title: LocalizedStringKey
    let message: LocalizedStringKey

    var body: some View {
        ContentUnavailableView {
            Label(title, systemImage: "exclamationmark.arrow.trianglehead.2.clockwise.rotate.90")
        } description: {
            Text(message)
        } actions: {
            Button("Try again") {
                Task {
                    await clientConfiguration.refresh()
                }
            }
            .buttonStyle(.borderedProminent)
        }
        .padding()
        .accessibilityIdentifier("client-configuration-gate")
    }
}

private struct ConfigurationIssueView: View {
    let message: String

    var body: some View {
        ContentUnavailableView {
            Label("Configuration error", systemImage: "exclamationmark.triangle")
        } description: {
            Text(message)
        }
        .padding()
        .accessibilityIdentifier("configuration-error")
    }
}
