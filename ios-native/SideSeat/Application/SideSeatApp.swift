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
                .task {
                    SideSeatTheme.configureChrome()
                    CrashReporting.start()
                    appDelegate.session = container.session
                    appDelegate.deepLinkRouter = container.deepLinkRouter
                    await container.session.restoreSession()
                }
                .task {
                    await container.clientConfiguration.refresh()
                }
                .task(id: container.session.phase) {
                    guard container.session.phase == .signedIn else { return }
                    await PushRegistration.requestAndRegister(using: container.session)
                }
                .onOpenURL { url in
                    container.deepLinkRouter.handle(url)
                }
        }
    }
}
