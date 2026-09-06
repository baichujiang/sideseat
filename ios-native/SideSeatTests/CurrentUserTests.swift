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

@Suite("MVP readiness contract")
struct MVPReadinessTests {
    @Test("Decodes server-authoritative readiness")
    func decodesReadiness() throws {
        let data = Data(
            """
            {
              "campusIdentityComplete": true,
              "languagesComplete": true,
              "verificationState": "VERIFIED",
              "ready": true
            }
            """.utf8
        )

        let readiness = try JSONDecoder().decode(NativeMVPReadiness.self, from: data)
        #expect(readiness.campusIdentityComplete)
        #expect(readiness.languagesComplete)
        #expect(readiness.verificationState == "VERIFIED")
        #expect(readiness.ready)
    }

    @Test("Decodes coordination language independently of app locale")
    func decodesCoordinationLanguage() throws {
        let data = Data(
            """
            {
              "tag": "GERMAN",
              "proficiency": "CONVERSATIONAL"
            }
            """.utf8
        )

        let language = try JSONDecoder().decode(NativeCoordinationLanguage.self, from: data)
        #expect(language.tag == "GERMAN")
        #expect(language.proficiency == "CONVERSATIONAL")
    }
}

@Suite("MVP readiness cache", .serialized)
struct MVPReadinessCacheTests {
    @Test("Persists last-known ready state per user")
    func persistsReadyState() throws {
        let suiteName = "mvp-readiness-cache-tests-\(UUID().uuidString)"
        let defaults = try #require(UserDefaults(suiteName: suiteName))
        defer { defaults.removePersistentDomain(forName: suiteName) }

        #expect(MVPReadinessCache.ready(userID: "user-a", defaults: defaults) == nil)

        MVPReadinessCache.store(
            NativeMVPReadiness(
                campusIdentityComplete: true,
                languagesComplete: true,
                verificationState: "VERIFIED",
                ready: true
            ),
            userID: "user-a",
            defaults: defaults
        )
        MVPReadinessCache.store(
            NativeMVPReadiness(
                campusIdentityComplete: true,
                languagesComplete: false,
                verificationState: "VERIFIED",
                ready: false
            ),
            userID: "user-b",
            defaults: defaults
        )

        #expect(MVPReadinessCache.ready(userID: "user-a", defaults: defaults) == true)
        #expect(MVPReadinessCache.ready(userID: "user-b", defaults: defaults) == false)

        MVPReadinessCache.remove(userID: "user-a", defaults: defaults)
        #expect(MVPReadinessCache.ready(userID: "user-a", defaults: defaults) == nil)
    }
}

@Suite("MVP route policy")
struct MVPRoutePolicyTests {
    @Test("Keeps canonical MVP owners reachable")
    func allowsCanonicalRoutes() {
        let allowed: [AppRoute] = [
            .courses,
            .archivedCourses,
            .plans,
            .settings,
            .blockedUsers,
            .feedback,
            .feedbackDetail(feedbackID: "feedback-1"),
            .scheduleShare(token: "share-1"),
            .eventShare(token: "event-1"),
            .directChat(connectionID: "connection-1"),
            .course(courseID: "course-1"),
        ]

        for route in allowed {
            #expect(MVPRoutePolicy.disposition(for: route) == .allowed)
        }
    }

    @Test("Keeps legacy social routes parseable but unavailable")
    func hidesLegacyRoutes() {
        let legacy: [AppRoute] = [
            .myPosts,
            .savedPosts,
            .profile(userID: "user-1"),
            .contacts,
            .supportStore,
            .courseChat(courseID: "course-1"),
            .groupChat(groupChatID: "group-1"),
            .groupChatInfo(groupChatID: "group-1"),
            .discoverPost(postID: "post-1"),
            .activity(activityID: "activity-1"),
            .actionResponses(actionID: "action-1", interestID: nil),
            .coordinationShell(interestID: "interest-1", reservationID: nil),
        ]

        for route in legacy {
            #expect(MVPRoutePolicy.disposition(for: route) == .legacyUnavailable)
        }
    }

    @Test("Maps canonical owners to the stable four-tab IA")
    func mapsOwnerTabs() {
        #expect(MVPRoutePolicy.tab(for: .directChat(connectionID: "connection-1")) == .chats)
        #expect(MVPRoutePolicy.tab(for: .plans) == .chats)
        #expect(MVPRoutePolicy.tab(for: .eventShare(token: "event-1")) == .home)
        #expect(MVPRoutePolicy.tab(for: .courses) == .me)
    }
}

@Suite("Together presentation")
struct TogetherPresentationTests {
    @Test("Maps opportunity lifecycle to the five frozen presentation states")
    func mapsOpportunityStates() {
        #expect(
            TogetherOpportunityPresentationState(
                state: "NEEDS_DECISION",
                viewerDecision: nil,
                hasCoordination: false
            ) == .undecided
        )
        #expect(
            TogetherOpportunityPresentationState(
                state: "DECIDED",
                viewerDecision: "YES",
                hasCoordination: false
            ) == .privateYes
        )
        #expect(
            TogetherOpportunityPresentationState(
                state: "READY_TO_COORDINATE",
                viewerDecision: "YES",
                hasCoordination: true
            ) == .mutual
        )
        #expect(
            TogetherOpportunityPresentationState(
                state: "EXPIRED",
                viewerDecision: nil,
                hasCoordination: false
            ) == .expired
        )
        #expect(
            TogetherOpportunityPresentationState(
                state: "UNAVAILABLE",
                viewerDecision: nil,
                hasCoordination: false
            ) == .unavailable
        )
    }

    @Test("Does not treat a ready state without a canonical conversation as mutual")
    func requiresCoordinationForMutual() {
        #expect(
            TogetherOpportunityPresentationState(
                state: "READY_TO_COORDINATE",
                viewerDecision: "YES",
                hasCoordination: false
            ) == .unavailable
        )
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
