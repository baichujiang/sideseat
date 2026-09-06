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
        return route(
            forPathComponents: components,
            queryItems: URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems ?? []
        )
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
        let normalized = path.hasPrefix("/") ? path : "/\(path)"
        let parsed = URLComponents(string: normalized)
        let routePath = parsed?.path ?? normalized
        let components = routePath.split(separator: "/").map(String.init).filter { !$0.isEmpty }
        return route(
            forPathComponents: components,
            queryItems: parsed?.queryItems ?? []
        )
    }

    nonisolated private static func route(
        forPathComponents components: [String],
        queryItems: [URLQueryItem]
    ) -> AppRoute? {
        guard components.count >= 2 else { return nil }
        let identifier = components[1]
        guard identifier.count <= 128 else { return nil }
        switch components[0] {
        case "users": return .profile(userID: identifier)
        case "connections":
            if components.count == 4, components[2] == "contexts" {
                let contextID = components[3]
                guard !contextID.isEmpty, contextID.count <= 128 else { return nil }
                return .directChat(
                    connectionID: identifier,
                    focus: .actionContext(id: contextID)
                )
            }
            if components.count == 4, components[2] == "plans" {
                let commitmentID = components[3]
                guard !commitmentID.isEmpty, commitmentID.count <= 128 else { return nil }
                let revisionID = queryItems.first(where: { $0.name == "revision" })?.value
                guard revisionID?.isEmpty != true, revisionID?.count ?? 0 <= 128 else { return nil }
                return .directChat(
                    connectionID: identifier,
                    focus: .plan(
                        commitmentID: commitmentID,
                        revisionID: revisionID
                    )
                )
            }
            guard components.count == 2 else { return nil }
            return .directChat(connectionID: identifier)
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
            if components.count >= 7,
               components[3] == "responses",
               components[5] == "coordination"
            {
                let interestID = components[4]
                let reservationID = components[6]
                guard interestID.count <= 128, reservationID.count <= 128 else { return nil }
                return .coordinationShell(interestID: interestID, reservationID: reservationID)
            }
            return .discoverPost(postID: postID)
        case "discover" where components.count >= 3 && components[1] == "activities":
            let activityID = components[2]
            guard activityID.count <= 128 else { return nil }
            return .activity(activityID: activityID)
        case "activities": return .activity(activityID: identifier)
        case "responses":
            let interestID = components.count >= 3 ? components[2] : nil
            guard interestID?.count ?? 0 <= 128 else { return nil }
            return .actionResponses(actionID: identifier, interestID: interestID)
        case "share" where components.count >= 3 && components[1] == "view":
            let token = components[2]
            guard token.count <= 128 else { return nil }
            return .scheduleShare(token: token)
        case "share" where components.count >= 3 && components[1] == "event":
            let token = components[2]
            guard token.count <= 128 else { return nil }
            return .eventShare(token: token)
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
            return (.me, .courses)
        case "/courses/archived":
            return (.me, .archivedCourses)
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
        MVPRoutePolicy.tab(for: route)
    }
}
