import Foundation
import Testing
@testable import SideSeat

@Suite("Navigation")
struct NavigationTests {
    @MainActor @Test("Shared plan entry always returns directly to the Plans root")
    func sharedPlanHasOneCanonicalLevel() {
        let router = RouterPath()
        router.path = [.plans, .timePoll(token: "old")]
        router.openPlan(token: "new")
        #expect(router.path == [.timePoll(token: "new")])
        router.openPlan(token: "new")
        #expect(router.path.count == 1)
        router.path.removeLast()
        #expect(router.path.isEmpty)
    }

    @MainActor @Test("Plan previews are token scoped and disappear after native back navigation")
    func planPreviewFollowsTheCurrentEntry() throws {
        let first = try planPreview(token: "first", title: "First plan")
        let second = try planPreview(token: "second", title: "Second plan")
        let router = RouterPath()
        router.openPlan(token: first.token, preview: first)
        #expect(router.planPreview(for: first.token)?.title == first.title)
        #expect(router.planPreview(for: second.token) == nil)
        router.path.removeLast()
        #expect(router.timePollPreview == nil)
        router.openPlan(token: second.token, preview: second)
        #expect(router.path == [.timePoll(token: second.token)])
        #expect(router.planPreview(for: second.token)?.title == second.title)
        #expect(router.planPreview(for: first.token) == nil)
        router.openPlan(token: first.token)
        #expect(router.timePollPreview == nil)
        router.openPlan(token: first.token, preview: second)
        #expect(router.timePollPreview == nil)
    }

    @MainActor @Test("History previews preserve the original append path and clear on pop, replacement and reset")
    func historyPlanPreviewRetainsNavigationSemantics() throws {
        let preview = try planPreview(token: "history", title: "History plan")
        let router = RouterPath()
        router.navigate(to: .planHistory)
        router.navigate(to: .timePoll(token: preview.token), preview: preview)
        #expect(router.path == [.planHistory, .timePoll(token: preview.token)])
        #expect(router.planPreview(for: preview.token)?.title == preview.title)
        router.path = [.planHistory]
        #expect(router.timePollPreview == nil)
        router.navigate(to: .timePoll(token: preview.token), preview: preview)
        router.replaceTop(with: .settings)
        #expect(router.timePollPreview == nil)
        router.openPlan(token: preview.token, preview: preview)
        router.reset()
        #expect(router.path.isEmpty && router.timePollPreview == nil)
        router.navigate(to: .settings, preview: preview)
        #expect(router.timePollPreview == nil)
    }

    private func planPreview(token: String, title: String) throws -> NativeTimePollList.Item {
        let data = try JSONSerialization.data(withJSONObject: [
            "token": token, "title": title, "timeZone": "Europe/Berlin", "dates": ["2026-11-01"],
            "updatedAt": "2026-10-25T12:00:00Z", "shareUrl": "https://sideseat.de/time-polls/" + token,
            "phase": "COLLECTING",
        ])
        let decoder = JSONDecoder(); decoder.dateDecodingStrategy = .iso8601
        return try decoder.decode(NativeTimePollList.Item.self, from: data)
    }

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

    @Test("Together combines intentions with recommendations before saved intentions")
    func togetherTaskNavigation() {
        #expect(TogetherSection.allCases == [.recommendations, .bookmarks])
    }

    @Test("Intention history belongs to Me and leaves plan history in Plans")
    func intentionHistoryRoute() {
        #expect(MVPRoutePolicy.disposition(for: .intentionHistory) == .allowed)
        #expect(MVPRoutePolicy.tab(for: .intentionHistory) == .me)
        #expect(MVPRoutePolicy.tab(for: .planHistory) == .plans)
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

    @Test("Message requests stay in the Messages navigation stack")
    func messageRequestsRoute() {
        #expect(MVPRoutePolicy.disposition(for: .messageRequests) == .allowed)
        #expect(MVPRoutePolicy.tab(for: .messageRequests) == .chats)
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

    @Test("Published shared-plan pushes open the plan and refresh both Plans and Calendar")
    @MainActor
    func publishedSharedPlanPush() async {
        let token = String(repeating: "a", count: 32)
        let notice = ForegroundPushNotice(title: "Your plan is confirmed", body: "Dinner",
            url: "/time-polls/" + token, userInfo: ["kind": "time_poll_confirmed", "timePollToken": token])
        #expect(notice.isPlanUpdate && notice.updatesCalendar)
        #expect(notice.navigationURL == "/time-polls/" + token)
        #expect(DeepLinkRouter.route(forPath: notice.navigationURL!) == .timePoll(token: token))
        let probe = NavigationNotificationProbe()
        let observers = [Notification.Name.sideSeatPlansNeedsRefresh, .sideSeatCalendarNeedsRefresh].map { name in
            NotificationCenter.default.addObserver(forName: name, object: nil, queue: nil) { probe.record($0.name) }
        }
        defer { observers.forEach { NotificationCenter.default.removeObserver($0) } }
        SideSeatAppDelegate.refreshAppState(for: notice)
        for _ in 0..<10 where probe.count(for: .sideSeatCalendarNeedsRefresh) == 0 { await Task.yield() }
        #expect(probe.count(for: .sideSeatPlansNeedsRefresh) == 1)
        #expect(probe.count(for: .sideSeatCalendarNeedsRefresh) == 1)
    }

    @Test("Shared-plan invitations refresh Plans without adding a Calendar commitment")
    @MainActor
    func sharedPlanInvitationPush() async {
        let token = String(repeating: "b", count: 32)
        let notice = ForegroundPushNotice(title: "A plan is waiting for you", body: "Dinner",
            url: "/time-polls/" + token, userInfo: ["kind": "time_poll_invitation", "timePollToken": token])
        #expect(notice.isPlanUpdate && !notice.updatesCalendar)
        #expect(DeepLinkRouter.route(forPath: notice.navigationURL!) == .timePoll(token: token))
        let probe = NavigationNotificationProbe()
        let observers = [Notification.Name.sideSeatPlansNeedsRefresh, .sideSeatCalendarNeedsRefresh].map { name in
            NotificationCenter.default.addObserver(forName: name, object: nil, queue: nil) { probe.record($0.name) }
        }
        defer { observers.forEach { NotificationCenter.default.removeObserver($0) } }
        SideSeatAppDelegate.refreshAppState(for: notice)
        for _ in 0..<10 where probe.count(for: .sideSeatPlansNeedsRefresh) == 0 { await Task.yield() }
        #expect(probe.count(for: .sideSeatPlansNeedsRefresh) == 1)
        #expect(probe.count(for: .sideSeatCalendarNeedsRefresh) == 0)
    }

    @Test("Shared-plan APNs title keys use the current App language and keep the body literal")
    @MainActor
    func localizedSharedPlanPushPresentation() {
        let token = String(repeating: "d", count: 32)
        let planTitle = "Coffee %@ 100%"
        let language = AppLocalization.selectedLanguage.locale.language.languageCode?.identifier ?? "en"
        let cases: [(String, String, [String: String])] = [
            ("time_poll_invitation", "A plan is waiting for you", [
                "en": "A plan is waiting for you", "zh": "有计划待你确认", "de": "Ein Plan wartet auf dich",
            ]),
            ("time_poll_confirmed", "Plan confirmed", [
                "en": "Plan confirmed", "zh": "计划已确认", "de": "Plan bestätigt",
            ]),
            ("plan_canceled", "Plan cancelled", [
                "en": "Plan cancelled", "zh": "计划已取消", "de": "Plan abgesagt",
            ]),
        ]
        for (kind, titleKey, translations) in cases {
            let notice = ForegroundPushNotice(title: "System-language title", body: planTitle,
                url: "/time-polls/" + token, userInfo: [
                    "kind": kind, "timePollToken": token,
                    "aps": ["alert": ["title-loc-key": titleKey, "body": planTitle]],
                ])
            let expected = translations[language] ?? translations["en"]!
            #expect(notice.title == expected)
            #expect(notice.body == planTitle)
            #expect(notice.navigationURL == "/time-polls/" + token)
            #expect(notice.isPlanUpdate)
            #expect(notice.updatesCalendar == (kind != "time_poll_invitation"))
            #expect(!notice.isDirectPlanCancellation)
        }
    }

    @Test("Ordinary, unknown and missing APNs title keys retain the original presentation")
    func unrelatedPushPresentationStaysUnchanged() {
        let knownAlert: [String: Any] = ["title-loc-key": "Plan confirmed", "body": "Coffee %@ 100%"]
        let unknownAlert: [String: Any] = ["title-loc-key": "Unknown remote title", "body": "Coffee %@ 100%"]
        let incompleteAlert: [String: Any] = ["title": "Literal title", "body": "Coffee %@ 100%"]
        let inputs: [[AnyHashable: Any]] = [
            ["kind": "direct_message", "connectionId": "connection-123", "aps": ["alert": knownAlert]],
            ["kind": "time_poll_confirmed", "timePollToken": "owned-token", "aps": ["alert": unknownAlert]],
            ["kind": "time_poll_confirmed", "timePollToken": "owned-token", "aps": ["alert": incompleteAlert]],
            ["kind": "time_poll_confirmed", "aps": ["alert": knownAlert]],
        ]
        for userInfo in inputs {
            let notice = ForegroundPushNotice(title: "Original title", body: "Coffee %@ 100%", url: nil, userInfo: userInfo)
            #expect(notice.title == "Original title")
            #expect(notice.body == "Coffee %@ 100%")
        }
    }

    @Test("Shared-plan cancellations keep the foreground banner and refresh Plans and Calendar")
    @MainActor
    func sharedPlanCancellationPush() async {
        let token = String(repeating: "c", count: 32)
        for url in ["/time-polls/" + token, "https://sideseat.de/time-polls/" + token] {
            let notice = ForegroundPushNotice(title: "A plan was cancelled", body: "Dinner",
                url: url, userInfo: ["kind": "plan_canceled", "timePollToken": token])
            #expect(notice.isPlanUpdate && notice.updatesCalendar)
            #expect(!notice.isDirectPlanCancellation)
            #expect(DeepLinkRouter.route(forPath: URL(string: notice.navigationURL!)!.path) == .timePoll(token: token))
            let probe = NavigationNotificationProbe()
            let observers = [Notification.Name.sideSeatPlansNeedsRefresh, .sideSeatCalendarNeedsRefresh].map { name in
                NotificationCenter.default.addObserver(forName: name, object: nil, queue: nil) { probe.record($0.name) }
            }
            SideSeatAppDelegate.refreshAppState(for: notice)
            for _ in 0..<10 where probe.count(for: .sideSeatCalendarNeedsRefresh) == 0 { await Task.yield() }
            observers.forEach { NotificationCenter.default.removeObserver($0) }
            #expect(probe.count(for: .sideSeatPlansNeedsRefresh) == 1)
            #expect(probe.count(for: .sideSeatCalendarNeedsRefresh) == 1)
        }
        let directURLs: [String?] = ["/connections/connection-123", "https://sideseat.de/connections/connection-123", nil]
        for url in directURLs {
            let notice = ForegroundPushNotice(title: "Plan cancelled", body: "Dinner", url: url,
                userInfo: ["kind": "plan_canceled", "connectionId": "connection-123"])
            #expect(notice.isDirectPlanCancellation)
        }
    }

    @Test("Native plan cards preserve readable fallback and accept only supported plan URLs")
    func nativeContactPlanMessage() {
        let token = String(repeating: "b", count: 32)
        let card = NativeSharedPlanMessage.parse("📅 Coffee\nhttps://www.sideseat.de/time-polls/" + token)
        #expect(card?.title == "Coffee" && card?.token == token)
        #expect(NativeSharedPlanMessage.parse("Hello\nhttps://www.sideseat.de/time-polls/" + token) == nil)
        #expect(NativeSharedPlanMessage.parse("📅 Coffee\nhttps://example.com/time-polls/" + token) == nil)
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

    @Test("Canonical Together links open the same root as legacy Discover links")
    @MainActor
    func routesCanonicalTogetherLinks() throws {
        let router = DeepLinkRouter()
        router.handleAppPath("/together")
        #expect(router.consumePendingTab() == .discover)
        #expect(router.consumePendingRoute() == nil)

        for raw in ["sideseat://together", "https://sideseat.example/together"] {
            router.handle(try #require(URL(string: raw)))
            #expect(router.consumePendingTab() == .discover)
            #expect(router.consumePendingRoute() == nil)
        }
        #expect(router.navigationEpoch == 3)
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
