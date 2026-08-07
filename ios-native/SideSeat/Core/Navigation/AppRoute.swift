import Foundation

enum AppTab: String, CaseIterable, Hashable, Identifiable {
    case home
    case discover
    case create
    case chats
    case me

    var id: String { rawValue }
}

enum AppRoute: Hashable, Sendable {
    case courses
    case archivedCourses
    case myPosts
    case profile(userID: String)
    case contacts
    case plans
    case settings
    case blockedUsers
    case supportStore
    case feedback
    case feedbackDetail(feedbackID: String)
    case scheduleShare(token: String)
    case directChat(connectionID: String)
    case courseChat(courseID: String)
    case groupChat(groupChatID: String)
    case groupChatInfo(groupChatID: String)
    case course(courseID: String)
    case discoverPost(postID: String)
    case activity(activityID: String)
}

enum CreateDestination: String, Identifiable, CaseIterable {
    case plan

    var id: String { rawValue }
}
