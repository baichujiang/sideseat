import Foundation
import Testing
@testable import SideSeat

@Suite("Navigation")
struct NavigationTests {
    @Test("Section paging needs deliberate horizontal travel and never wraps")
    func sectionPagingBoundariesAndDirection() {
        func target(_ index: Int, _ dx: CGFloat, _ dy: CGFloat = 0, velocity: CGFloat = 0) -> Int {
            SSPageSwitchPolicy.destination(index: index, count: 3,
                translation: CGSize(width: dx, height: dy), velocityX: velocity, width: 400)
        }
        #expect(target(0, -180) == 1)
        #expect(target(1, 180) == 0)
        #expect(target(1, -380) == 2)
        #expect(target(2, -180) == 2)
        #expect(target(0, 180) == 0)
        #expect(target(1, -20) == 1)
        #expect(target(1, -80, 150) == 1)
        #expect(target(1, -45, velocity: -700) == 2)
        #expect(target(1, -45, velocity: 700) == 1)
    }

    @Test("Together task tabs have a stable order and a useful first section")
    func togetherTaskNavigation() {
        #expect(TogetherSection.allCases == [.recommendations, .intentions, .explore])
        #expect(TogetherSection.initial(hasIntentions: false, hasOpportunities: false, hasLegacySession: false) == .intentions)
        #expect(TogetherSection.initial(hasIntentions: true, hasOpportunities: false, hasLegacySession: false) == .recommendations)
        #expect(TogetherSection.initial(hasIntentions: false, hasOpportunities: true, hasLegacySession: false) == .recommendations)
        #expect(TogetherSection.initial(hasIntentions: false, hasOpportunities: false, hasLegacySession: true) == .recommendations)
    }

    @Test("App shell exposes the new product navigation in its exact order")
    func appShellTabOrder() {
        #expect(AppShellNavigation.tabs.map(\.tab) == [.discover, .plans, .home, .chats, .me])
    }

    @Test("App shell uses the new customer-facing tab titles")
    func appShellTabTitles() {
        let titles = AppShellNavigation.tabs.map(\.title)

        #expect(titles == ["Together", "Plans", "Calendar", "Messages", "Me"])
        #expect(!titles.contains("Discover"))
        #expect(!titles.contains("Chats"))
    }

    @Test("Focused plan chat routes remain distinct from ordinary chat routes")
    func focusedPlanRouteIdentity() {
        let ordinary = AppRoute.directChat(connectionID: "connection-123")
        let focused = AppRoute.directChat(
            connectionID: "connection-123",
            focus: .plan(id: "plan-123")
        )

        #expect(ordinary != focused)
        #expect(focused != .directChat(connectionID: "connection-123", focus: .actionInterest(id: "plan-123")))
        #expect(ordinary == .directChat(connectionID: "connection-123"))
        #expect(
            DirectChatFocus.plan(id: "legacy-revision")
                == .plan(commitmentID: "legacy-revision", revisionID: "legacy-revision")
        )
    }

    @Test("Plan deep links preserve commitment and optional revision focus")
    func routesExactPlanFocus() throws {
        let full = try #require(URL(string:
            "https://sideseat.example/connections/connection-123/plans/commitment-123?revision=revision-456"
        ))
        let custom = try #require(URL(string:
            "sideseat://connections/connection-123/plans/commitment-123?revision=revision-456"
        ))
        let expected = AppRoute.directChat(
            connectionID: "connection-123",
            focus: .plan(commitmentID: "commitment-123", revisionID: "revision-456")
        )

        #expect(DeepLinkRouter.route(for: full) == expected)
        #expect(DeepLinkRouter.route(for: custom) == expected)
        #expect(
            DeepLinkRouter.route(forPath:
                "/connections/connection-123/plans/commitment-123?revision=revision-456"
            ) == expected
        )
        #expect(
            DeepLinkRouter.route(forPath: "/connections/connection-123/plans/commitment-123")
                == .directChat(
                    connectionID: "connection-123",
                    focus: .plan(commitmentID: "commitment-123", revisionID: nil)
                )
        )
        #expect(DeepLinkRouter.route(forPath: "/connections/connection-123/unknown/value") == nil)
    }

    @Test("Action Context deep links are not swallowed by the ordinary chat route")
    func routesExactActionContextFocus() {
        #expect(
            DeepLinkRouter.route(forPath: "/connections/connection-123/contexts/context-456")
                == .directChat(
                    connectionID: "connection-123",
                    focus: .actionContext(id: "context-456")
                )
        )
    }

    @Test("Routes supported universal links")
    func routesUniversalLinks() throws {
        let url = try #require(URL(string: "https://sideseat.example/connections/connection-123"))
        let courseURL = try #require(URL(string: "https://sideseat.example/courses/course-123"))
        #expect(DeepLinkRouter.route(for: url) == .directChat(connectionID: "connection-123"))
        #expect(DeepLinkRouter.route(for: courseURL) == .course(courseID: "course-123"))
        let courseChatURL = try #require(URL(string: "https://sideseat.example/courses/course-123/chat"))
        let groupURL = try #require(URL(string: "https://sideseat.example/groups/group-123"))
        #expect(DeepLinkRouter.route(for: courseChatURL) == .courseChat(courseID: "course-123"))
        #expect(DeepLinkRouter.route(for: groupURL) == .groupChat(groupChatID: "group-123"))
        let shareURL = try #require(URL(string: "https://sideseat.example/share/view/share-token-123"))
        #expect(DeepLinkRouter.route(for: shareURL) == .scheduleShare(token: "share-token-123"))
        let customShareURL = try #require(URL(string: "sideseat://share/view/share-token-123"))
        #expect(DeepLinkRouter.route(for: customShareURL) == .scheduleShare(token: "share-token-123"))
        let pathCustomShareURL = try #require(URL(string: "sideseat:///share/view/share-token-123"))
        #expect(DeepLinkRouter.route(for: pathCustomShareURL) == .scheduleShare(token: "share-token-123"))
        let eventShareURL = try #require(
            URL(string: "https://sideseat.example/share/event/event-share-token-123")
        )
        #expect(
            DeepLinkRouter.route(for: eventShareURL)
                == .eventShare(token: "event-share-token-123")
        )
        let customEventShareURL = try #require(
            URL(string: "sideseat://share/event/event-share-token-123")
        )
        #expect(
            DeepLinkRouter.route(for: customEventShareURL)
                == .eventShare(token: "event-share-token-123")
        )
        let activityURL = try #require(
            URL(string: "https://sideseat.example/discover/activities/activity-123")
        )
        #expect(DeepLinkRouter.route(for: activityURL) == .activity(activityID: "activity-123"))
        let profileURL = try #require(URL(string: "https://sideseat.example/users/user-123"))
        let postURL = try #require(
            URL(string: "https://sideseat.example/discover/posts/post-123")
        )
        let legacyActivityURL = try #require(
            URL(string: "https://sideseat.example/activities/activity-123")
        )
        #expect(DeepLinkRouter.route(for: profileURL) == .profile(userID: "user-123"))
        #expect(DeepLinkRouter.route(for: postURL) == .discoverPost(postID: "post-123"))
        #expect(DeepLinkRouter.route(for: legacyActivityURL) == .activity(activityID: "activity-123"))
        let responsesURL = try #require(
            URL(string: "https://sideseat.example/responses/action-123/interest-456")
        )
        #expect(
            DeepLinkRouter.route(for: responsesURL)
                == .actionResponses(actionID: "action-123", interestID: "interest-456")
        )
        let shellURL = try #require(URL(string:
            "https://sideseat.example/discover/posts/action-123/responses/interest-456/coordination/123e4567-e89b-42d3-a456-426614174001"
        ))
        #expect(DeepLinkRouter.route(for: shellURL) == .coordinationShell(
            interestID: "interest-456",
            reservationID: "123e4567-e89b-42d3-a456-426614174001"
        ))
    }

    @Test("Universal links route profile handoffs to the Me tab")
    @MainActor
    func routesProfileHandoffs() throws {
        let router = DeepLinkRouter()
        let profile = try #require(URL(string: "https://sideseat.example/profile"))
        let info = try #require(URL(string: "https://sideseat.example/profile/info"))
        let verification = try #require(
            URL(string: "sideseat://profile/verification")
        )
        let account = try #require(URL(string: "https://sideseat.example/profile/account"))
        let blocked = try #require(URL(string: "https://sideseat.example/profile/blocked"))

        router.handle(profile)
        #expect(router.consumePendingTab() == .me)
        #expect(router.consumePendingRoute() == nil)

        router.handle(info)
        #expect(router.consumePendingTab() == .me)
        #expect(router.consumePendingRoute() == nil)

        router.handle(verification)
        #expect(router.consumePendingTab() == .me)
        #expect(router.consumePendingRoute() == nil)

        router.handle(account)
        #expect(router.consumePendingTab() == .me)
        #expect(router.consumePendingRoute() == .settings)

        router.handle(blocked)
        #expect(router.consumePendingTab() == .me)
        #expect(router.consumePendingRoute() == .blockedUsers)
    }

    @Test("Course links hand off to course management in the Me tab")
    @MainActor
    func routesCourseHandoffs() throws {
        let router = DeepLinkRouter()
        let courses = try #require(URL(string: "https://sideseat.example/courses"))
        let archived = try #require(URL(string: "https://sideseat.example/courses/archived"))
        let detail = try #require(URL(string: "https://sideseat.example/courses/course-123"))

        router.handle(courses)
        #expect(router.consumePendingTab() == .me)
        #expect(router.consumePendingRoute() == .courses)

        router.handle(archived)
        #expect(router.consumePendingTab() == .me)
        #expect(router.consumePendingRoute() == .archivedCourses)

        router.handle(detail)
        #expect(router.consumePendingTab() == .me)
        #expect(router.consumePendingRoute() == .course(courseID: "course-123"))
    }

    @Test("Routes relative push notification paths")
    func routesPushPaths() {
        #expect(
            DeepLinkRouter.route(forPath: "/connections/connection-123")
                == .directChat(connectionID: "connection-123")
        )
        #expect(
            DeepLinkRouter.route(forPath: "/courses/course-123/chat")
                == .courseChat(courseID: "course-123")
        )
        #expect(
            DeepLinkRouter.route(forPath: "/groups/group-123")
                == .groupChat(groupChatID: "group-123")
        )
        #expect(
            DeepLinkRouter.route(forPath: "/discover/posts/post-123")
                == .discoverPost(postID: "post-123")
        )
        #expect(
            DeepLinkRouter.route(forPath: "/discover/activities/activity-123")
                == .activity(activityID: "activity-123")
        )
        #expect(DeepLinkRouter.route(forPath: "/profile/blocked") == .blockedUsers)
    }

    @Test("Parses structured plan pushes and suppresses duplicate notice in the open chat")
    @MainActor
    func parsesStructuredPlanPush() {
        let notice = ForegroundPushNotice(
            title: "Plan accepted",
            body: "Mina accepted Library study",
            url: "/connections/connection-123",
            userInfo: [
                "kind": "plan_accepted",
                "connectionId": "connection-123",
                "planId": "plan-123",
            ]
        )

        #expect(notice.isPlanUpdate)
        #expect(notice.updatesCalendar)
        #expect(notice.conversationKey == "connection:connection-123")
        #expect(!ActiveChatPresentation.isDisplaying(notice))

        ActiveChatPresentation.begin("connection:connection-123")
        #expect(ActiveChatPresentation.isDisplaying(notice))
        ActiveChatPresentation.end("connection:connection-123")
        #expect(!ActiveChatPresentation.isDisplaying(notice))
    }

    @Test("Builds notification routes from structured conversation identifiers")
    func buildsStructuredNotificationRoutes() {
        let direct = ForegroundPushNotice(
            title: "New message",
            body: "Hello",
            url: nil,
            userInfo: ["kind": "direct_message", "connectionId": "connection-123"]
        )
        let course = ForegroundPushNotice(
            title: "Course message",
            body: "New reply",
            url: nil,
            userInfo: ["data": ["kind": "course_message", "courseId": "course-123"]]
        )
        let group = ForegroundPushNotice(
            title: "Group message",
            body: "New reply",
            url: "  ",
            userInfo: ["groupChatId": "group-123"]
        )
        let mutual = ForegroundPushNotice(
            title: "A new match",
            body: "Someone also wants to play badminton",
            url: nil,
            userInfo: [
                "data": [
                    "kind": "mutual_opportunity",
                    "opportunityId": "opportunity-123",
                ],
            ]
        )

        #expect(direct.navigationURL == "/connections/connection-123")
        #expect(course.navigationURL == "/courses/course-123/chat")
        #expect(group.navigationURL == "/groups/group-123")
        #expect(mutual.isMutualOpportunity)
        #expect(mutual.navigationURL == "/discover")
    }

    @Test("Mutual opportunity notifications route to Together")
    @MainActor
    func routesMutualOpportunityPushToTogether() {
        let router = DeepLinkRouter()

        router.handleNotificationURL("/discover")

        #expect(router.consumePendingTab() == .discover)
        #expect(router.consumePendingRoute() == nil)
        #expect(router.navigationEpoch == 1)
    }

    @Test("Mutual opportunity delivery refreshes Together exactly once")
    @MainActor
    func refreshesTogetherForMutualOpportunityPush() async {
        let notice = ForegroundPushNotice(
            title: "A new match",
            body: "Someone also wants to play badminton",
            url: "/discover",
            userInfo: ["kind": "mutual_opportunity"]
        )
        let probe = NavigationNotificationProbe()
        let observer = NotificationCenter.default.addObserver(
            forName: .sideSeatTogetherNeedsRefresh,
            object: nil,
            queue: nil
        ) { notification in
            probe.record(notification.name)
        }
        defer { NotificationCenter.default.removeObserver(observer) }

        SideSeatAppDelegate.refreshAppState(for: notice)
        await Task.yield()

        #expect(probe.count(for: .sideSeatTogetherNeedsRefresh) == 1)
    }

    @Test("Replays a notification tap received before the app router is installed")
    @MainActor
    func replaysColdLaunchNotificationTap() {
        let delegate = SideSeatAppDelegate()
        let router = DeepLinkRouter()

        delegate.routeNotification("/connections/cold-launch-connection")
        #expect(router.pendingRoute == nil)

        delegate.installDeepLinkRouter(router)

        #expect(router.pendingRoute == .directChat(connectionID: "cold-launch-connection"))
        #expect(router.pendingTab == .chats)
        #expect(router.navigationEpoch == 1)
    }

    @Test("Rejects unknown and unsafe links")
    func rejectsUnknownLinks() throws {
        let unknown = try #require(URL(string: "https://sideseat.example/admin/users/123"))
        let unsafe = try #require(URL(string: "javascript://connections/123"))
        #expect(DeepLinkRouter.route(for: unknown) == nil)
        #expect(DeepLinkRouter.route(for: unsafe) == nil)
    }

    @Test("Product tutorial copy stays customer-facing")
    @MainActor
    func productTutorialCopyIsCustomerFacing() {
        let internalPhrases = [
            "the guide",
            "switches tabs",
            "compare the note",
            "the screen",
            "replay this",
        ]

        for step in ProductTutorialController.steps {
            let visibleCopy = "\(step.title) \(step.body) \(step.hint)".lowercased()
            #expect(!step.body.isEmpty)
            #expect(!step.hint.isEmpty)
            for phrase in internalPhrases {
                #expect(!visibleCopy.contains(phrase))
            }
        }
    }
}

private final class NavigationNotificationProbe: @unchecked Sendable {
    private let lock = NSLock()
    private var counts: [Notification.Name: Int] = [:]

    func record(_ name: Notification.Name) {
        lock.lock()
        counts[name, default: 0] += 1
        lock.unlock()
    }

    func count(for name: Notification.Name) -> Int {
        lock.lock()
        defer { lock.unlock() }
        return counts[name, default: 0]
    }
}
