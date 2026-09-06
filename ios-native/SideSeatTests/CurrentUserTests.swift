import Foundation
import Testing
@testable import SideSeat

@Suite("Current user")
struct CurrentUserTests {
    @Test("Prefers a non-empty nickname")
    func displayName() {
        let user = CurrentUser.fixture(nickname: "Ada")
        #expect(user.displayName == "Ada")
    }

    @Test("Falls back to username for blank nickname")
    func blankNickname() {
        let user = CurrentUser.fixture(nickname: "  ")
        #expect(user.displayName == "ada_001")
    }
}

@Suite("App language", .serialized)
struct AppLanguageTests {
    @Test("Persists an in-app language selection")
    @MainActor
    func persistsSelection() throws {
        let suiteName = "app-language-tests-\(UUID().uuidString)"
        let defaults = try #require(UserDefaults(suiteName: suiteName))
        defer { defaults.removePersistentDomain(forName: suiteName) }

        let store = AppLanguageStore(defaults: defaults)
        #expect(store.selection == .system)

        store.select(.german)
        #expect(store.selection == .german)
        #expect(defaults.string(forKey: AppLocalization.preferenceKey) == "de")

        let restored = AppLanguageStore(defaults: defaults)
        #expect(restored.selection == .german)
    }

    @Test("Maps supported iPhone languages")
    func mapsSystemLanguage() {
        #expect(AppLanguage.supportedSystemLanguage(from: ["zh-Hans-DE"]) == .simplifiedChinese)
        #expect(AppLanguage.supportedSystemLanguage(from: ["de-DE"]) == .german)
        #expect(AppLanguage.supportedSystemLanguage(from: ["fr-FR"]) == .english)
    }

    @Test("Loads each bundled translation without changing iPhone settings")
    func loadsLanguageBundles() {
        let german = String(
            localized: "Settings",
            bundle: AppLocalization.localizationBundle(for: .german),
            locale: AppLanguage.german.locale
        )
        let chinese = String(
            localized: "Settings",
            bundle: AppLocalization.localizationBundle(for: .simplifiedChinese),
            locale: AppLanguage.simplifiedChinese.locale
        )

        #expect(german == "Einstellungen")
        #expect(chinese == "设置")
    }
}

private extension CurrentUser {
    static func fixture(nickname: String?) -> CurrentUser {
        CurrentUser(
            id: "user-1",
            username: "ada_001",
            nickname: nickname,
            email: nil,
            phone: nil,
            avatarUrl: nil,
            tagline: nil,
            school: "TUM",
            studentStatus: "CURRENT_STUDENT",
            degreeLevel: nil,
            major: nil,
            semester: nil,
            graduationYear: nil,
            gender: "UNSPECIFIED",
            onboardingComplete: true,
            isGuest: false,
            verifiedStudent: true,
            studentVerificationStatus: "VERIFIED",
            usernameUpdatedAt: nil,
            productTutorialDismissedAt: nil,
            locale: "en"
        )
    }
}
