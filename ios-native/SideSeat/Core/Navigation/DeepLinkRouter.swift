import Foundation
import Observation

@MainActor
@Observable
final class DeepLinkRouter {
    private(set) var pendingRoute: AppRoute?

    func handle(_ url: URL) {
        guard let route = Self.route(for: url) else { return }
        pendingRoute = route
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
        if let route = Self.route(forPath: trimmed) {
            pendingRoute = route
        }
    }

    func consumePendingRoute() -> AppRoute? {
        defer { pendingRoute = nil }
        return pendingRoute
    }

    nonisolated static func route(for url: URL) -> AppRoute? {
        guard let scheme = url.scheme?.lowercased(),
              scheme == "https" || scheme == "sideseat" || scheme == "http"
        else { return nil }
        return route(forPathComponents: url.pathComponents.filter { $0 != "/" })
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
}
