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

    @Test("Rejects unknown and unsafe links")
    func rejectsUnknownLinks() throws {
        let unknown = try #require(URL(string: "https://sideseat.example/admin/users/123"))
        let unsafe = try #require(URL(string: "javascript://connections/123"))
        #expect(DeepLinkRouter.route(for: unknown) == nil)
        #expect(DeepLinkRouter.route(for: unsafe) == nil)
    }
}
