import SwiftUI

@main
struct SideSeatApp: App {
    @UIApplicationDelegateAdaptor(SideSeatAppDelegate.self) private var appDelegate
    @State private var container = AppContainer.bootstrap()

    var body: some Scene {
        WindowGroup {
            AppRootView()
                .environment(container)
                .environment(container.session)
                .environment(container.clientConfiguration)
                .environment(container.deepLinkRouter)
                .tint(SideSeatTheme.accent)
                .preferredColorScheme(Self.uiTestingPreferredColorScheme)
                .modifier(UITestingDynamicTypeModifier(size: Self.uiTestingDynamicTypeSize))
                .task {
                    SideSeatTheme.configureChrome()
                    appDelegate.session = container.session
                    appDelegate.installDeepLinkRouter(container.deepLinkRouter)
                    await container.session.restoreSession()
                }
                .task {
                    await container.clientConfiguration.refresh()
                }
                .task(id: container.session.phase) {
                    switch container.session.phase {
                    case .signedIn:
                        await PushRegistration.requestAndRegister(using: container.session)
                    case .signedOut:
                        PushBadgeController.update(0)
                        await CalendarReminderScheduler.shared.clear()
                        await HomeScheduleCache.shared.clear()
                    case .restoring:
                        break
                    }
                }
                .onOpenURL { url in
                    container.deepLinkRouter.handle(url)
                }
                .onContinueUserActivity(NSUserActivityTypeBrowsingWeb) { activity in
                    guard let url = activity.webpageURL else { return }
                    container.deepLinkRouter.handle(url)
                }
        }
    }

    /// Forced by Visual QA / UITests via `--ui-testing-appearance=light|dark` (needed on physical devices; simulators also honor it).
    private static var uiTestingPreferredColorScheme: ColorScheme? {
        let prefix = "--ui-testing-appearance="
        guard let raw = ProcessInfo.processInfo.arguments
            .first(where: { $0.hasPrefix(prefix) })?
            .dropFirst(prefix.count)
            .lowercased()
        else { return nil }
        switch raw {
        case "dark": return .dark
        case "light": return .light
        default: return nil
        }
    }

    private static var uiTestingDynamicTypeSize: DynamicTypeSize? {
        ProcessInfo.processInfo.arguments.contains("--ui-testing-dynamic-type-accessibility")
            ? .accessibility5
            : nil
    }
}

private struct UITestingDynamicTypeModifier: ViewModifier {
    let size: DynamicTypeSize?

    @ViewBuilder
    func body(content: Content) -> some View {
        if let size {
            content.dynamicTypeSize(size)
        } else {
            content
        }
    }
}
