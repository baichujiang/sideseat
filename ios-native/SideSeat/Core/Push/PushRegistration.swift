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

        await CalendarReminderScheduler.shared.rescheduleLatest()

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

struct CalendarReminderCandidate: Hashable, Sendable {
    let identifier: String
    let title: String
    let location: String?
    let eventStart: Date
    let fireDate: Date
}

enum CalendarReminderPlanner {
    static let notificationPrefix = "sideseat.calendar."
    static let leadTime: TimeInterval = 15 * 60
    static let maximumPendingCount = 48
    static let horizonDays = 45

    static func candidates(
        for schedule: NativeHomeSchedule,
        now: Date = Date(),
        calendar: Calendar = .sideSeatBerlin,
        limit: Int = maximumPendingCount
    ) -> [CalendarReminderCandidate] {
        guard limit > 0,
              let horizon = calendar.date(byAdding: .day, value: horizonDays, to: now)
        else { return [] }

        var candidates: [CalendarReminderCandidate] = schedule.studyEntries.compactMap { entry in
            guard let start = parseISO8601(entry.startISO), start <= horizon else { return nil }
            return candidate(
                identity: "event:\(entry.id)",
                title: entry.title,
                location: entry.location,
                start: start,
                now: now
            )
        }

        var day = calendar.startOfDay(for: now)
        let lastDay = calendar.startOfDay(for: horizon)
        while day <= lastDay {
            let weekday = HomeWeekday(calendar.component(.weekday, from: day)).rawValue
            for block in schedule.classBlocks where block.weekday == weekday {
                guard let start = calendar.date(byAdding: .minute, value: block.startMinute, to: day) else {
                    continue
                }
                let title = block.courseCode.map { "\($0) · \(block.courseName)" } ?? block.courseName
                if let reminder = candidate(
                    identity: "course:\(block.courseId)",
                    title: title,
                    location: block.location,
                    start: start,
                    now: now
                ) {
                    candidates.append(reminder)
                }
            }
            guard let nextDay = calendar.date(byAdding: .day, value: 1, to: day) else { break }
            day = nextDay
        }

        var seen = Set<String>()
        return candidates
            .sorted {
                if $0.fireDate == $1.fireDate { return $0.identifier < $1.identifier }
                return $0.fireDate < $1.fireDate
            }
            .filter { seen.insert($0.identifier).inserted }
            .prefix(limit)
            .map { $0 }
    }

    private static func candidate(
        identity: String,
        title: String,
        location: String?,
        start: Date,
        now: Date
    ) -> CalendarReminderCandidate? {
        let fireDate = start.addingTimeInterval(-leadTime)
        guard fireDate > now else { return nil }
        let occurrence = String(Int(start.timeIntervalSince1970))
        return CalendarReminderCandidate(
            identifier: "\(notificationPrefix)\(stableHash(identity)).\(occurrence)",
            title: title,
            location: location?.trimmingCharacters(in: .whitespacesAndNewlines).nilIfEmpty,
            eventStart: start,
            fireDate: fireDate
        )
    }

    private static func parseISO8601(_ raw: String) -> Date? {
        let fractional = ISO8601DateFormatter()
        fractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return fractional.date(from: raw) ?? ISO8601DateFormatter().date(from: raw)
    }

    /// Stable FNV-1a keeps notification identifiers short without using process-randomized `hashValue`.
    private static func stableHash(_ value: String) -> String {
        var hash: UInt64 = 14_695_981_039_346_656_037
        for byte in value.utf8 {
            hash ^= UInt64(byte)
            hash &*= 1_099_511_628_211
        }
        return String(hash, radix: 16)
    }
}

@MainActor
final class CalendarReminderScheduler {
    static let shared = CalendarReminderScheduler()

    private let center: UNUserNotificationCenter
    private var latestSchedule: NativeHomeSchedule?

    init(center: UNUserNotificationCenter = .current()) {
        self.center = center
    }

    func synchronize(with schedule: NativeHomeSchedule) async {
        latestSchedule = schedule
        await rescheduleLatest()
    }

    func rescheduleLatest() async {
        guard let latestSchedule else { return }
        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("--ui-testing-authenticated") {
            return
        }
        #endif

        let settings = await center.notificationSettings()
        guard Self.canDeliverNotifications(settings.authorizationStatus) else { return }

        let desired = CalendarReminderPlanner.candidates(for: latestSchedule)
        let desiredIDs = Set(desired.map(\.identifier))
        let existing = await center.pendingNotificationRequests()
        let staleIDs = existing
            .map(\.identifier)
            .filter {
                $0.hasPrefix(CalendarReminderPlanner.notificationPrefix) && !desiredIDs.contains($0)
            }
        if !staleIDs.isEmpty {
            center.removePendingNotificationRequests(withIdentifiers: staleIDs)
        }

        for candidate in desired {
            let content = UNMutableNotificationContent()
            content.title = candidate.title
            let startsSoon = String(localized: "Starts in 15 minutes")
            content.body = candidate.location.map { "\(startsSoon) · \($0)" } ?? startsSoon
            content.sound = .default
            content.threadIdentifier = "calendar"
            content.userInfo = ["url": "/home"]

            var components = Calendar.sideSeatBerlin.dateComponents(
                [.year, .month, .day, .hour, .minute, .second],
                from: candidate.fireDate
            )
            components.timeZone = Calendar.sideSeatBerlin.timeZone
            let trigger = UNCalendarNotificationTrigger(dateMatching: components, repeats: false)
            let request = UNNotificationRequest(
                identifier: candidate.identifier,
                content: content,
                trigger: trigger
            )
            do {
                try await center.add(request)
            } catch {
                print("Calendar reminder scheduling failed: \(error.localizedDescription)")
            }
        }
    }

    func clear() async {
        latestSchedule = nil
        let existing = await center.pendingNotificationRequests()
        let identifiers = existing
            .map(\.identifier)
            .filter { $0.hasPrefix(CalendarReminderPlanner.notificationPrefix) }
        if !identifiers.isEmpty {
            center.removePendingNotificationRequests(withIdentifiers: identifiers)
        }
    }

    private static func canDeliverNotifications(_ status: UNAuthorizationStatus) -> Bool {
        switch status {
        case .authorized, .provisional, .ephemeral:
            return true
        default:
            return false
        }
    }
}

private extension String {
    var nilIfEmpty: String? { isEmpty ? nil : self }
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
