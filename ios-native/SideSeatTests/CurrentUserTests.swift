import CoreGraphics
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

@Suite("Opportunity swipe decision")
struct OpportunitySwipeDecisionTests {
    @Test("Actual horizontal travel selects interest on the right and skip on the left")
    func choosesDirection() {
        #expect(SSOpportunitySwipeChoice.releasedChoice(
            translation: CGSize(width: 100, height: 4), travel: 120
        ) == .interested)
        #expect(SSOpportunitySwipeChoice.releasedChoice(
            translation: CGSize(width: -100, height: 4), travel: 120
        ) == .skip)
    }

    @Test("Short, returned and vertical drags do not submit a decision")
    func leavesChoiceOpen() {
        for translation in [CGSize(width: 30, height: 0), .zero, CGSize(width: 30, height: 120)] {
            #expect(SSOpportunitySwipeChoice.releasedChoice(translation: translation, travel: 120) == nil)
        }
    }
}

@Suite("MVP conversation info")
struct MVPConversationInfoTests {
    @Test("Keeps participant, context, search, and safety as the bounded info surface")
    func keepsBoundedInfoSurface() {
        #expect(MVPConversationInfoPolicy.surfaces == [.participant, .context, .search, .safety])
    }

    @Test("Does not re-expose legacy social identity and relationship management")
    func hidesLegacySocialManagement() {
        #expect(!MVPConversationInfoPolicy.exposesPublicProfile)
        #expect(!MVPConversationInfoPolicy.exposesRelationshipManagement)
        #expect(!MVPConversationInfoPolicy.exposesContactExchange)
    }

    @Test("Messages surfaces direct conversations only")
    func keepsDirectConversationOwnership() {
        #expect(InboxStore.isMVPVisibleConversationKind(.direct))
        #expect(!InboxStore.isMVPVisibleConversationKind(.course))
        #expect(!InboxStore.isMVPVisibleConversationKind(.group))
    }
}

@Suite("MVP Plan presentation")
struct MVPPlanPresentationTests {
    @Test("Keeps the four frozen Plan Center sections in order")
    func keepsSectionOrder() {
        #expect(MVPPlanSection.ordered == [.needsResponse, .upcoming, .proposed, .pastEnded])
        #expect(MVPPlanSection.ordered.map(\.title) == [
            "Needs your response",
            "Upcoming",
            "Proposed",
            "Past & Ended",
        ].map { AppLocalization.string($0) })
    }

    @Test("Classifies proposed and confirmed Plans by viewer role and time")
    func classifiesPlanStates() {
        let now = Date()
        #expect(
            MVPPlanSection.classify(
                plan(status: "PENDING", proposerID: "peer", receiverID: "viewer", end: now.addingTimeInterval(3600)),
                currentUserID: "viewer",
                now: now
            ) == .needsResponse
        )
        #expect(
            MVPPlanSection.classify(
                plan(status: "PENDING", proposerID: "viewer", receiverID: "peer", end: now.addingTimeInterval(3600)),
                currentUserID: "viewer",
                now: now
            ) == .proposed
        )
        #expect(
            MVPPlanSection.classify(
                plan(status: "ACCEPTED", proposerID: "viewer", receiverID: "peer", end: now.addingTimeInterval(3600)),
                currentUserID: "viewer",
                now: now
            ) == .upcoming
        )
        #expect(
            MVPPlanSection.classify(
                plan(status: "ACCEPTED", proposerID: "viewer", receiverID: "peer", end: now.addingTimeInterval(-1)),
                currentUserID: "viewer",
                now: now
            ) == .pastEnded
        )
        #expect(
            MVPPlanSection.classify(
                plan(status: "CANCELED", proposerID: "viewer", receiverID: "peer", end: now.addingTimeInterval(3600)),
                currentUserID: "viewer",
                now: now
            ) == .pastEnded
        )
    }

    @Test("Canonical Plan route preserves commitment and revision identity")
    func buildsCanonicalRoute() {
        let routedPlan = plan(
            status: "PENDING",
            proposerID: "viewer",
            receiverID: "peer",
            end: Date().addingTimeInterval(3600),
            commitmentID: "commitment-1",
            planID: "revision-1"
        )
        #expect(
            MVPPlanRoute.route(for: routedPlan)
                == AppRoute.plan(
                    connectionID: "connection-1",
                    commitmentID: "commitment-1",
                    revisionID: "revision-1"
                )
        )
    }

    @Test("Completed accepted Plans expose only the viewer's private Outcome")
    func keepsOutcomePrivateAndEligible() {
        let now = Date()
        let completed = plan(
            status: "ACCEPTED",
            proposerID: "viewer",
            receiverID: "peer",
            end: now.addingTimeInterval(-1)
        )
        let upcoming = plan(
            status: "ACCEPTED",
            proposerID: "viewer",
            receiverID: "peer",
            end: now.addingTimeInterval(3600)
        )

        #expect(completed.isOutcomeEligible(at: now))
        #expect(!upcoming.isOutcomeEligible(at: now))

        let answered = completed.replacingViewerOutcome(with: "OCCURRED")
        #expect(answered.viewerOutcome == "OCCURRED")
        #expect(answered.id == completed.id)
        #expect(answered.commitmentId == completed.commitmentId)
    }

    private func plan(
        status: String,
        proposerID: String,
        receiverID: String,
        end: Date,
        commitmentID: String? = nil,
        planID: String = "plan-1"
    ) -> NativePlanRequest {
        let formatter = ISO8601DateFormatter()
        return NativePlanRequest(
            id: planID,
            connectionId: "connection-1",
            commitmentId: commitmentID,
            status: status,
            planType: "CUSTOM",
            title: "Coffee",
            location: nil,
            message: nil,
            startTime: formatter.string(from: end.addingTimeInterval(-1800)),
            endTime: formatter.string(from: end),
            proposer: NativePlanAuthor(id: proposerID, username: proposerID, nickname: nil, avatarUrl: nil),
            receiver: NativePlanAuthor(id: receiverID, username: receiverID, nickname: nil, avatarUrl: nil),
            counterOfId: nil,
            availabilityShareId: nil,
            scheduleShareLinkId: nil,
            createdAt: formatter.string(from: Date()),
            updatedAt: formatter.string(from: Date())
        )
    }
}

@Suite("MVP Calendar presentation")
struct MVPCalendarPresentationTests {
    @Test("Requires explicit Plan identifiers instead of participant metadata")
    func requiresExplicitPlanIdentity() {
        let start = Date()
        let end = start.addingTimeInterval(3600)
        let plan = HomeAgendaItem(
            id: "plan-projection",
            title: "Coffee",
            start: start,
            end: end,
            location: "Campus cafe",
            colorHex: nil,
            source: .plan,
            participantNames: ["Peer"],
            planCommitmentID: "commitment-1",
            planConnectionID: "connection-1",
            planRevisionID: "revision-1"
        )
        let ordinary = HomeAgendaItem(
            id: "personal-event",
            title: "Study",
            start: start,
            end: end,
            location: nil,
            colorHex: nil,
            source: .event,
            participantNames: ["Peer"]
        )

        #expect(plan.context == .plan)
        #expect(plan.isPlanProjection)
        #expect(!plan.isUserEditableEvent)
        #expect(
            plan.canonicalPlanRoute
                == AppRoute.plan(
                    connectionID: "connection-1",
                    commitmentID: "commitment-1",
                    revisionID: "revision-1"
                )
        )
        #expect(ordinary.context == .personal)
        #expect(ordinary.isUserEditableEvent)
        #expect(ordinary.canonicalPlanRoute == nil)
    }

    @Test("Legacy revision-only projections remain read-only and routable")
    func routesLegacyRevisionOnlyProjection() {
        let start = Date()
        let legacy = HomeAgendaItem(
            id: "legacy-plan-projection",
            title: "Legacy plan",
            start: start,
            end: start.addingTimeInterval(3600),
            location: nil,
            colorHex: nil,
            source: .plan,
            planCommitmentID: nil,
            planConnectionID: "connection-legacy",
            planRevisionID: "revision-legacy"
        )

        #expect(legacy.isPlanProjection)
        #expect(!legacy.isUserEditableEvent)
        #expect(
            legacy.canonicalPlanRoute
                == AppRoute.plan(
                    connectionID: "connection-legacy",
                    commitmentID: "revision-legacy",
                    revisionID: "revision-legacy"
                )
        )
    }

    @Test("Decodes additive Plan projection identifiers")
    func decodesPlanProjectionIdentifiers() throws {
        let data = Data(
            """
            {
              "id": "entry-1",
              "title": "Coffee",
              "location": null,
              "withLabel": "With Peer",
              "note": null,
              "repeatRule": "NONE",
              "repeatUntilISO": null,
              "eventParticipants": [{"userId":"peer-1","name":"Peer"}],
              "startISO": "2026-09-07T10:00:00Z",
              "endISO": "2026-09-07T11:00:00Z",
              "categoryId": null,
              "categoryColor": null,
              "categoryName": null,
              "discoverActivityId": null,
              "planCommitmentId": "commitment-1",
              "planConnectionId": "connection-1",
              "planRevisionId": "revision-1"
            }
            """.utf8
        )

        let entry = try JSONDecoder().decode(NativeHomeStudyEntry.self, from: data)
        #expect(entry.planCommitmentId == "commitment-1")
        #expect(entry.planConnectionId == "connection-1")
        #expect(entry.planRevisionId == "revision-1")
    }

    @Test("Legacy revision identity decodes without inventing a commitment")
    func decodesLegacyPlanProjectionIdentifiers() throws {
        let data = Data(
            """
            {
              "id": "entry-legacy",
              "title": "Legacy plan",
              "location": null,
              "withLabel": null,
              "note": null,
              "repeatRule": "NONE",
              "repeatUntilISO": null,
              "eventParticipants": [],
              "startISO": "2026-09-07T10:00:00Z",
              "endISO": "2026-09-07T11:00:00Z",
              "categoryId": null,
              "categoryColor": null,
              "categoryName": null,
              "discoverActivityId": null,
              "planCommitmentId": null,
              "planConnectionId": "connection-legacy",
              "planRevisionId": "revision-legacy"
            }
            """.utf8
        )

        let entry = try JSONDecoder().decode(NativeHomeStudyEntry.self, from: data)
        #expect(entry.planProjectionIdentity?.commitmentID == nil)
        #expect(entry.planProjectionIdentity?.connectionID == "connection-legacy")
        #expect(entry.planProjectionIdentity?.revisionID == "revision-legacy")
    }

    @Test("Manage Plan hands off from Calendar to Messages")
    @MainActor
    func routesPlanManagementToMessages() {
        let router = DeepLinkRouter()
        let route = AppRoute.plan(
            connectionID: "connection-1",
            commitmentID: "commitment-1",
            revisionID: "revision-1"
        )

        router.handleAppRoute(route)

        #expect(router.consumePendingTab() == .chats)
        #expect(router.consumePendingRoute() == route)
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

    @Test("Keeps every bundled language on the same localization key set")
    func keepsLocalizationKeySetsAligned() throws {
        let englishKeys = try localizationKeys(for: .english)

        for language in [AppLanguage.simplifiedChinese, .german] {
            let localizedKeys = try localizationKeys(for: language)
            #expect(
                localizedKeys == englishKeys,
                "\(language.rawValue) localization keys differ from English"
            )
        }
    }

    @Test("Keeps the active Plan flow translated in every non-English bundle")
    func translatesActivePlanFlow() {
        let keys = [
            "Proposed and confirmed Plans will appear here.",
            "Opportunities",
            "Proposed",
            "Past & Ended",
            "Confirmed",
            "Superseded",
            "Manage in conversation",
            "Open Plan in conversation",
            "Your confirmed Plan stays in place until this new time is accepted.",
            "The confirmed Plan stays unchanged until this new time is accepted.",
            "Accepting replaces the confirmed time and updates both calendars.",
            "Accepting confirms this Plan and adds it to both calendars.",
            "Withdraw new time",
            "Withdraw proposal",
            "Confirmed in both calendars",
            "New time",
            "Propose new time",
            "Reschedule proposed",
            "This proposal was declined.",
            "A newer proposal is now in the conversation.",
            "This proposal was withdrawn or canceled.",
            "This proposal expired before it was confirmed.",
            "This Plan is no longer available.",
            "This Plan is no longer active.",
            "Manage Plan",
            "Shared Plan details are managed in Messages.",
        ]

        for language in [AppLanguage.simplifiedChinese, .german] {
            let bundle = AppLocalization.localizationBundle(for: language)
            for key in keys {
                let translation = bundle.localizedString(forKey: key, value: nil, table: nil)
                #expect(translation != key, "Missing \(language.rawValue) translation for \(key)")
            }
        }
    }

    private func localizationKeys(for language: AppLanguage) throws -> Set<String> {
        let bundle = AppLocalization.localizationBundle(for: language)
        let url = try #require(bundle.url(forResource: "Localizable", withExtension: "strings"))
        let data = try Data(contentsOf: url)
        let propertyList = try PropertyListSerialization.propertyList(
            from: data,
            options: [],
            format: nil
        )
        let table = try #require(propertyList as? [String: String])
        return Set(table.keys)
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
