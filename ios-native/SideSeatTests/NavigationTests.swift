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
