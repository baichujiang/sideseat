import UIKit
import UserNotifications

struct ForegroundPushNotice: Equatable, Sendable {
    let title: String
    let body: String
    let url: String?
    let kind: String?
    let connectionID: String?
    let courseID: String?
    let groupChatID: String?

    var conversationKey: String? {
        if let connectionID { return "connection:\(connectionID)" }
        if let courseID { return "course:\(courseID)" }
        if let groupChatID { return "group:\(groupChatID)" }
        return nil
    }

    var isPlanUpdate: Bool {
        kind?.hasPrefix("plan_") == true
    }

    var updatesCalendar: Bool {
        kind == "plan_accepted"
    }

    /// Prefer the explicit server route, but keep notification taps useful when an
    /// older or partially delivered payload only contains its conversation ID.
    var navigationURL: String? {
        if let url, !url.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            return url
        }
        if let connectionID { return "/connections/\(connectionID)" }
        if let courseID { return "/courses/\(courseID)/chat" }
        if let groupChatID { return "/groups/\(groupChatID)" }
        return nil
    }

    init(
        title: String,
        body: String,
        url: String?,
        userInfo: [AnyHashable: Any]
    ) {
        self.title = title
        self.body = body
        self.url = url
        kind = Self.string("kind", in: userInfo)
        connectionID = Self.string("connectionId", in: userInfo)
        courseID = Self.string("courseId", in: userInfo)
        groupChatID = Self.string("groupChatId", in: userInfo)
    }

    private static func string(_ key: String, in userInfo: [AnyHashable: Any]) -> String? {
        if let value = userInfo[key] as? String, !value.isEmpty { return value }
        if let data = userInfo["data"] as? [AnyHashable: Any],
           let value = data[key] as? String,
           !value.isEmpty {
            return value
        }
        return nil
    }
}

@MainActor
enum ActiveChatPresentation {
    private(set) static var conversationKey: String?

    static func begin(_ key: String) {
        conversationKey = key
    }

    static func end(_ key: String) {
        if conversationKey == key {
            conversationKey = nil
        }
    }

    static func isDisplaying(_ notice: ForegroundPushNotice) -> Bool {
        notice.conversationKey != nil && notice.conversationKey == conversationKey
    }
}

/// App delegate bridge for APNs device token callbacks and notification taps.
final class SideSeatAppDelegate: NSObject, UIApplicationDelegate {
    weak var session: SessionStore?
    weak var deepLinkRouter: DeepLinkRouter?
    @MainActor private var pendingNotificationURL: String?

    @MainActor
    func installDeepLinkRouter(_ router: DeepLinkRouter) {
        deepLinkRouter = router
        guard let pendingNotificationURL else { return }
        self.pendingNotificationURL = nil
        router.handleNotificationURL(pendingNotificationURL)
    }

    @MainActor
    func routeNotification(_ rawURL: String) {
        if let deepLinkRouter {
            deepLinkRouter.handleNotificationURL(rawURL)
        } else {
            // A notification tap can arrive before SideSeatApp's first task runs.
            pendingNotificationURL = rawURL
        }
    }

    func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
    ) -> Bool {
        CrashReporting.start()
        UNUserNotificationCenter.current().delegate = self
        return true
    }

    func application(
        _ application: UIApplication,
        didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data
    ) {
        guard let session else { return }
        Task { @MainActor in
            await PushRegistration.syncDeviceToken(deviceToken, using: session)
        }
    }

    func application(
        _ application: UIApplication,
        didFailToRegisterForRemoteNotificationsWithError error: Error
    ) {
        print("APNs registration failed: \(error.localizedDescription)")
    }
}

extension SideSeatAppDelegate: UNUserNotificationCenterDelegate {
    nonisolated func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification,
        withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void
    ) {
        let content = notification.request.content
        let userInfo = content.userInfo
        let url = Self.notificationURL(from: userInfo)
        let notice = ForegroundPushNotice(
            title: content.title,
            body: content.body,
            url: url,
            userInfo: userInfo
        )
        Self.refreshAppState(for: notice)
        Task { @MainActor in
            NotificationCenter.default.post(
                name: .sideSeatForegroundPushReceived,
                object: notice
            )
        }
        // Foreground delivery uses SideSeat's compact in-app notice instead of a second system banner.
        completionHandler([])
    }

    nonisolated func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        didReceive response: UNNotificationResponse,
        withCompletionHandler completionHandler: @escaping () -> Void
    ) {
        let userInfo = response.notification.request.content.userInfo
        let url = Self.notificationURL(from: userInfo)
        let notice = ForegroundPushNotice(
            title: response.notification.request.content.title,
            body: response.notification.request.content.body,
            url: url,
            userInfo: userInfo
        )
        Self.refreshAppState(for: notice)
        Task { @MainActor [weak self] in
            if let navigationURL = notice.navigationURL {
                self?.routeNotification(navigationURL)
            }
        }
        completionHandler()
    }

    nonisolated private static func notificationURL(from userInfo: [AnyHashable: Any]) -> String? {
        if let url = userInfo["url"] as? String {
            return url
        }
        if let data = userInfo["data"] as? [AnyHashable: Any], let url = data["url"] as? String {
            return url
        }
        return nil
    }

    nonisolated private static func refreshAppState(for notice: ForegroundPushNotice) {
        let rawURL = notice.navigationURL ?? ""
        let path = URL(string: rawURL)?.path ?? rawURL
        let isChat = path.hasPrefix("/connections/")
            || (path.hasPrefix("/courses/") && path.hasSuffix("/chat"))
            || path.hasPrefix("/groups/")
        let isDiscover = path.hasPrefix("/discover/posts/")
            || path.hasPrefix("/discover/activities/")
        Task { @MainActor in
            if isChat {
                NotificationCenter.default.post(name: .sideSeatInboxNeedsRefresh, object: nil)
            }
            if notice.isPlanUpdate {
                NotificationCenter.default.post(name: .sideSeatPlansNeedsRefresh, object: nil)
            }
            if notice.updatesCalendar {
                NotificationCenter.default.post(name: .sideSeatCalendarNeedsRefresh, object: nil)
            }
            if isDiscover {
                NotificationCenter.default.post(name: .sideSeatDiscoverNeedsRefresh, object: nil)
            }
        }
    }
}
