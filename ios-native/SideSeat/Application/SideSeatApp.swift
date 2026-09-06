import Foundation
import Observation
import SwiftUI

enum AppLanguage: String, CaseIterable, Identifiable, Sendable {
    case system
    case simplifiedChinese = "zh-Hans"
    case english = "en"
    case german = "de"

    var id: String { rawValue }

    var localizationIdentifier: String? {
        self == .system ? nil : rawValue
    }

    var locale: Locale {
        if let localizationIdentifier {
            return Locale(identifier: localizationIdentifier)
        }
        let language = Self.supportedSystemLanguage().rawValue
        guard let region = Locale.autoupdatingCurrent.region?.identifier else {
            return Locale(identifier: language)
        }
        return Locale(identifier: "\(language)_\(region)")
    }

    var nativeName: String {
        switch self {
        case .system: ""
        case .simplifiedChinese: "中文（简体）"
        case .english: "English"
        case .german: "Deutsch"
        }
    }

    static func supportedSystemLanguage(
        from preferredLanguages: [String] = Locale.preferredLanguages
    ) -> AppLanguage {
        guard let identifier = preferredLanguages.first?.lowercased() else { return .english }
        if identifier.hasPrefix("zh") { return .simplifiedChinese }
        if identifier.hasPrefix("de") { return .german }
        return .english
    }
}

enum AppLocalization {
    static let preferenceKey = "sideseat.settings.appLanguage"

    static var selectedLanguage: AppLanguage {
        selectedLanguage(defaults: .standard)
    }

    static func selectedLanguage(defaults: UserDefaults) -> AppLanguage {
        if let override = uiTestingLanguageOverride {
            return override
        }
        guard
            let rawValue = defaults.string(forKey: preferenceKey),
            let language = AppLanguage(rawValue: rawValue)
        else {
            return .system
        }
        return language
    }

    static func string(_ keyAndValue: String.LocalizationValue) -> String {
        String(
            localized: keyAndValue,
            bundle: localizationBundle(for: selectedLanguage),
            locale: selectedLanguage.locale
        )
    }

    static func string(resource: LocalizedStringResource) -> String {
        let language = selectedLanguage
        return String(
            localized: String.LocalizationValue(resource.key),
            table: resource.table,
            bundle: localizationBundle(for: language),
            locale: language.locale
        )
    }

    static func localizationBundle(for language: AppLanguage) -> Bundle {
        guard
            let identifier = language.localizationIdentifier,
            let path = Bundle.main.path(forResource: identifier, ofType: "lproj"),
            let bundle = Bundle(path: path)
        else {
            return .main
        }
        return bundle
    }

    private static var uiTestingLanguageOverride: AppLanguage? {
        let prefix = "--ui-testing-language="
        guard let rawValue = ProcessInfo.processInfo.arguments
            .first(where: { $0.hasPrefix(prefix) })?
            .dropFirst(prefix.count)
        else {
            return nil
        }
        return AppLanguage(rawValue: String(rawValue))
    }
}

@MainActor
@Observable
final class AppLanguageStore {
    private(set) var selection: AppLanguage
    private let defaults: UserDefaults
    private let systemLanguage: AppLanguage

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
        systemLanguage = AppLanguage.supportedSystemLanguage()
        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("--ui-testing-reset-language") {
            defaults.removeObject(forKey: AppLocalization.preferenceKey)
        }
        #endif
        selection = AppLocalization.selectedLanguage(defaults: defaults)
    }

    var locale: Locale {
        selection == .system ? systemLanguage.locale : selection.locale
    }

    var currentSelectionName: String {
        if selection == .system {
            return "\(AppLocalization.string("Follow iPhone")) · \(systemLanguage.nativeName)"
        }
        return selection.nativeName
    }

    func select(_ language: AppLanguage) {
        guard selection != language else { return }
        defaults.set(language.rawValue, forKey: AppLocalization.preferenceKey)
        selection = language
    }
}

@main
struct SideSeatApp: App {
    @UIApplicationDelegateAdaptor(SideSeatAppDelegate.self) private var appDelegate
    @Environment(\.scenePhase) private var scenePhase
    @State private var container = AppContainer.bootstrap()
    @State private var appLanguage = AppLanguageStore()

    var body: some Scene {
        WindowGroup {
            AppRootView()
                .environment(container)
                .environment(container.session)
                .environment(container.clientConfiguration)
                .environment(container.deepLinkRouter)
                .environment(appLanguage)
                .environment(\.locale, appLanguage.locale)
                .tint(SideSeatTheme.utilityAction)
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
                        if container.session.canMakeAuthenticatedRequests {
                            await PushRegistration.requestAndRegister(using: container.session)
                        }
                    case .signedOut:
                        PushBadgeController.update(0)
                        await CalendarReminderScheduler.shared.clear()
                        await HomeScheduleCache.shared.clear()
                    case .restoring:
                        break
                    }
                }
                .onChange(of: scenePhase) { _, newPhase in
                    guard newPhase == .active else { return }
                    if container.session.shouldAutomaticallyRetryConnection {
                        Task { await container.session.retryConnection() }
                    }
                    Task { await container.clientConfiguration.refresh() }
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
