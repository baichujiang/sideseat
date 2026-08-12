import Foundation
import Testing
@testable import SideSeat

@Suite("Navigation")
struct NavigationTests {
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

        #expect(direct.navigationURL == "/connections/connection-123")
        #expect(course.navigationURL == "/courses/course-123/chat")
        #expect(group.navigationURL == "/groups/group-123")
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
