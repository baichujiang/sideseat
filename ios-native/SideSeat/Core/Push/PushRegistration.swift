import Foundation
import UIKit
import UserNotifications

/// Registers for remote notifications and syncs the APNs device token to `/api/v1/push/devices`.
@MainActor
enum PushRegistration {
    static func requestAndRegister(using session: SessionStore) async {
        guard session.phase == .signedIn else { return }
        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("--ui-testing-authenticated") {
            return
        }
        #endif

        let center = UNUserNotificationCenter.current()
        let settings = await center.notificationSettings()
        let granted: Bool
        switch settings.authorizationStatus {
        case .authorized, .provisional, .ephemeral:
            granted = true
        case .notDetermined:
            granted = (try? await center.requestAuthorization(options: [.alert, .badge, .sound])) ?? false
        default:
            granted = false
        }
        guard granted else { return }

        await MainActor.run {
            UIApplication.shared.registerForRemoteNotifications()
        }
    }

    static func syncDeviceToken(_ deviceToken: Data, using session: SessionStore) async {
        guard session.phase == .signedIn else { return }
        let token = deviceToken.map { String(format: "%02.2hhx", $0) }.joined()
        guard !token.isEmpty else { return }
        do {
            let _: APIEnvelope<NativePushDeviceSaveResult> = try await session.sendAuthorized(
                "api/v1/push/devices",
                method: .post,
                body: NativePushDeviceRegisterRequest(token: token, platform: "ios")
            )
        } catch {
            // Soft-fail: push is optional until APNs delivery is enabled server-side.
            print("Push token sync failed: \(error.localizedDescription)")
        }
    }

    static func unregisterDeviceToken(_ deviceToken: Data, using session: SessionStore) async {
        let token = deviceToken.map { String(format: "%02.2hhx", $0) }.joined()
        guard !token.isEmpty else { return }
        do {
            let _: APIEnvelope<NativePushDeviceRemoveResult> = try await session.sendAuthorized(
                "api/v1/push/devices",
                method: .delete,
                body: NativePushDeviceUnregisterRequest(token: token)
            )
        } catch {
            print("Push token unregister failed: \(error.localizedDescription)")
        }
    }
}

struct NativePushDeviceRegisterRequest: Encodable, Sendable {
    let token: String
    let platform: String
}

struct NativePushDeviceUnregisterRequest: Encodable, Sendable {
    let token: String
}

struct NativePushDeviceSaveResult: Decodable, Sendable {
    let saved: Bool
}

struct NativePushDeviceRemoveResult: Decodable, Sendable {
    let removed: Bool
}
