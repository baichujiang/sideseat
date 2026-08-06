import UIKit
import UserNotifications

/// App delegate bridge for APNs device token callbacks and notification taps.
final class SideSeatAppDelegate: NSObject, UIApplicationDelegate {
    weak var session: SessionStore?
    weak var deepLinkRouter: DeepLinkRouter?

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
        Self.refreshInboxIfChatNotification(notification.request.content.userInfo)
        completionHandler([.banner, .sound, .badge])
    }

    nonisolated func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        didReceive response: UNNotificationResponse,
        withCompletionHandler completionHandler: @escaping () -> Void
    ) {
        let userInfo = response.notification.request.content.userInfo
        let url = Self.notificationURL(from: userInfo)
        Self.refreshInboxIfChatNotification(userInfo)
        Task { @MainActor [weak self] in
            if let url {
                self?.deepLinkRouter?.handleNotificationURL(url)
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

    nonisolated private static func refreshInboxIfChatNotification(
        _ userInfo: [AnyHashable: Any]
    ) {
        guard let rawURL = notificationURL(from: userInfo) else { return }
        let path = URL(string: rawURL)?.path ?? rawURL
        let isChat = path.hasPrefix("/connections/")
            || (path.hasPrefix("/courses/") && path.hasSuffix("/chat"))
            || path.hasPrefix("/groups/")
        guard isChat else { return }
        Task { @MainActor in
            NotificationCenter.default.post(name: .sideSeatInboxNeedsRefresh, object: nil)
        }
    }
}
