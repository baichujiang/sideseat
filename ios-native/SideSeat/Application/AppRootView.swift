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
                case .checking, .available:
                    sessionContent
                }
            }
        }
    }

    @ViewBuilder
    private var sessionContent: some View {
        if session.canPresentAppShell {
            AppShellView()
        } else {
            switch session.phase {
            case .restoring:
                StartupTransitionView()
            case .signedOut:
                LoginView()
            case .signedIn:
                StartupTransitionView()
            }
        }
    }
}

private struct StartupTransitionView: View {
    @Environment(SessionStore.self) private var session

    var body: some View {
        ZStack {
            Color("LaunchBackground")
                .ignoresSafeArea()

            VStack(spacing: SideSeatTheme.spaceLG) {
                SideSeatBrandMark(size: 72, showsShadow: false)

                if let restorationIssue = session.restorationIssue {
                    VStack(spacing: SideSeatTheme.spaceMD) {
                        Text(restorationIssue)
                            .font(.footnote)
                            .foregroundStyle(SideSeatTheme.textSecondary)
                            .multilineTextAlignment(.center)

                        Button("Try again") {
                            Task { await session.retryConnection() }
                        }
                        .buttonStyle(.bordered)
                    }
                    .frame(maxWidth: 280)
                } else {
                    ProgressView()
                        .controlSize(.small)
                        .tint(SideSeatTheme.textSecondary)
                        .accessibilityLabel("Opening SideSeat")
                }
            }
            .padding(SideSeatTheme.spaceXL)
        }
        .accessibilityIdentifier("startup-transition")
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
