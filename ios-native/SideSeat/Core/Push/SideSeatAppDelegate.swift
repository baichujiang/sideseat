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
        completionHandler([.banner, .sound, .badge])
    }

    nonisolated func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        didReceive response: UNNotificationResponse,
        withCompletionHandler completionHandler: @escaping () -> Void
    ) {
        let url = Self.notificationURL(from: response.notification.request.content.userInfo)
        let router = deepLinkRouter
        Task { @MainActor in
            if let url {
                router?.handleNotificationURL(url)
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
}
