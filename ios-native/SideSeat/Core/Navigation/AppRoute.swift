import Foundation

enum AppTab: String, CaseIterable, Hashable, Identifiable {
    case home
    case discover
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
    /// the PlanRequest revision id. New B-light callers must preserve the
    /// commitment id separately.
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
}

enum CreateDestination: String, Identifiable, CaseIterable {
    case courseAction
    case buddyPost
    case activity

    var id: String { rawValue }
}
