import Foundation

enum AppTab: String, CaseIterable, Hashable, Identifiable {
    case home
    case discover
    case plans
    case chats
    case me

    var id: String { rawValue }
}

enum DirectChatFocus: Hashable, Sendable {
    case message(id: String)
    case plan(commitmentID: String, revisionID: String?)
    case actionInterest(id: String)
    case actionContext(id: String)

    /// Compatibility for legacy Plan callers whose only stable identifier is
    /// the PlanRequest revision id. New callers should preserve commitment id.
    static func plan(id: String) -> DirectChatFocus {
        .plan(commitmentID: id, revisionID: id)
    }
}

enum AppRoute: Hashable, Sendable {
    case courses
    case archivedCourses
    case myPosts
    case savedPosts
    case profile(userID: String)
    case contacts
    case plans
    case exploreIntents
    case settings
    case blockedUsers
    case supportStore
    case feedback
    case feedbackDetail(feedbackID: String)
    case scheduleShare(token: String)
    case eventShare(token: String)
    case directChat(connectionID: String, focus: DirectChatFocus? = nil)
    case courseChat(courseID: String)
    case groupChat(groupChatID: String)
    case groupChatInfo(groupChatID: String)
    case course(courseID: String)
    case discoverPost(postID: String)
    case activity(activityID: String)
    case actionResponses(actionID: String?, interestID: String?)
    case coordinationShell(interestID: String, reservationID: String?)

    /// Canonical Plan route. Kept as a factory over the existing direct-chat
    /// destination so MVP navigation converges without duplicating mutation owners.
    static func plan(
        connectionID: String,
        commitmentID: String,
        revisionID: String? = nil
    ) -> AppRoute {
        .directChat(
            connectionID: connectionID,
            focus: .plan(commitmentID: commitmentID, revisionID: revisionID)
        )
    }
}

enum MVPRouteDisposition: Equatable, Sendable {
    case allowed
    case legacyUnavailable
}

enum MVPRoutePolicy {
    static func disposition(for route: AppRoute) -> MVPRouteDisposition {
        switch route {
        case .courses,
             .archivedCourses,
             .plans,
             .exploreIntents,
             .settings,
             .blockedUsers,
             .feedback,
             .feedbackDetail,
             .scheduleShare,
             .eventShare,
             .directChat,
             .course:
            return .allowed

        case .myPosts,
             .savedPosts,
             .profile,
             .contacts,
             .supportStore,
             .courseChat,
             .groupChat,
             .groupChatInfo,
             .discoverPost,
             .activity,
             .actionResponses,
             .coordinationShell:
            return .legacyUnavailable
        }
    }

    static func tab(for route: AppRoute) -> AppTab {
        switch route {
        case .courses, .archivedCourses, .course:
            return .me
        case .plans:
            return .plans
        case .directChat, .courseChat, .groupChat, .groupChatInfo, .contacts, .scheduleShare,
             .actionResponses, .coordinationShell:
            return .chats
        case .eventShare:
            return .home
        case .myPosts, .savedPosts, .profile, .settings, .blockedUsers, .supportStore, .feedback, .feedbackDetail:
            return .me
        case .discoverPost, .activity, .exploreIntents:
            return .discover
        }
    }
}

enum CreateDestination: String, Identifiable, CaseIterable {
    case courseAction
    case buddyPost
    case activity

    var id: String { rawValue }
}
