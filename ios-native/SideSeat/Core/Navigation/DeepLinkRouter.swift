import Foundation
import Observation

@MainActor
@Observable
final class DeepLinkRouter {
    private(set) var pendingRoute: AppRoute?
    private(set) var pendingTab: AppTab?
    private(set) var navigationEpoch = 0

    func handle(_ url: URL) {
        guard Self.isSupportedScheme(url) else { return }
        if let tabRoute = Self.tabRoute(forAppPath: Self.appPath(for: url)) {
            pendingTab = tabRoute.tab
            pendingRoute = tabRoute.route
            navigationEpoch += 1
            return
        }
        guard let route = Self.route(for: url) else { return }
        pendingRoute = route
        pendingTab = Self.tab(for: route)
        navigationEpoch += 1
    }

    /// Handles absolute URLs or relative app paths from push payloads (`/connections/{id}`).
    func handleNotificationURL(_ raw: String) {
        let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        if let url = URL(string: trimmed), let scheme = url.scheme?.lowercased(),
           scheme == "https" || scheme == "sideseat" || scheme == "http"
        {
            handle(url)
            return
        }
        handleAppPath(trimmed)
    }

    /// Maps web in-app paths (e.g. `/discover`) to native tab + optional route.
    func handleAppPath(_ raw: String) {
        let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        let normalized = trimmed.hasPrefix("/") ? trimmed : "/\(trimmed)"
        if let tabRoute = Self.tabRoute(forAppPath: normalized) {
            pendingTab = tabRoute.tab
            pendingRoute = tabRoute.route
            navigationEpoch += 1
            return
        }
        if let route = Self.route(forPath: normalized) {
            pendingRoute = route
            pendingTab = Self.tab(for: route)
            navigationEpoch += 1
        }
    }

    func consumePendingRoute() -> AppRoute? {
        defer { pendingRoute = nil }
        return pendingRoute
    }

    func consumePendingTab() -> AppTab? {
        defer { pendingTab = nil }
        return pendingTab
    }

    nonisolated static func route(for url: URL) -> AppRoute? {
        guard isSupportedScheme(url), let scheme = url.scheme?.lowercased() else { return nil }
        var components = url.pathComponents.filter { $0 != "/" }
        if scheme == "sideseat", let host = url.host, !host.isEmpty {
            components.insert(host, at: 0)
        }
        return route(forPathComponents: components)
    }

    nonisolated private static func isSupportedScheme(_ url: URL) -> Bool {
        guard let scheme = url.scheme?.lowercased() else { return false }
        return scheme == "https" || scheme == "sideseat" || scheme == "http"
    }

    nonisolated private static func appPath(for url: URL) -> String {
        guard url.scheme?.lowercased() == "sideseat",
              let host = url.host,
              !host.isEmpty
        else { return url.path }
        return "/\(host)\(url.path)"
    }

    nonisolated static func route(forPath path: String) -> AppRoute? {
        let components = path.split(separator: "/").map(String.init).filter { !$0.isEmpty }
        return route(forPathComponents: components)
    }

    nonisolated private static func route(forPathComponents components: [String]) -> AppRoute? {
        guard components.count >= 2 else { return nil }
        let identifier = components[1]
        guard identifier.count <= 128 else { return nil }
        switch components[0] {
        case "users": return .profile(userID: identifier)
        case "connections": return .directChat(connectionID: identifier)
        case "courses":
            if components.count >= 3, components[2] == "chat" {
                return .courseChat(courseID: identifier)
            }
            return .course(courseID: identifier)
        case "groups":
            return .groupChat(groupChatID: identifier)
        case "discover" where components.count >= 3 && components[1] == "posts":
            let postID = components[2]
            guard postID.count <= 128 else { return nil }
            return .discoverPost(postID: postID)
        case "discover" where components.count >= 3 && components[1] == "activities":
            let activityID = components[2]
            guard activityID.count <= 128 else { return nil }
            return .activity(activityID: activityID)
        case "activities": return .activity(activityID: identifier)
        case "share" where components.count >= 3 && components[1] == "view":
            let token = components[2]
            guard token.count <= 128 else { return nil }
            return .scheduleShare(token: token)
        case "profile" where identifier == "blocked":
            return .blockedUsers
        default: return nil
        }
    }

    nonisolated private static func tabRoute(forAppPath path: String) -> (tab: AppTab, route: AppRoute?)? {
        switch path {
        case "/home":
            return (.home, nil)
        case "/discover":
            return (.discover, nil)
        case "/inbox":
            return (.chats, nil)
        case "/courses":
            return (.home, .courses)
        case "/courses/archived":
            return (.home, .archivedCourses)
        case "/profile":
            return (.me, nil)
        case "/profile/info", "/profile/verification":
            return (.me, nil)
        case "/profile/account":
            return (.me, .settings)
        default:
            return nil
        }
    }

    nonisolated private static func tab(for route: AppRoute) -> AppTab {
        switch route {
        case .courses, .archivedCourses, .course:
            return .home
        case .directChat, .courseChat, .groupChat, .groupChatInfo, .contacts, .plans, .scheduleShare:
            return .chats
        case .myPosts, .profile, .settings, .blockedUsers, .supportStore, .feedback, .feedbackDetail:
            return .me
        case .discoverPost, .activity:
            return .discover
        }
    }
}
