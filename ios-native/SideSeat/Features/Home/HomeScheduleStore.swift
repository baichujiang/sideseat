import Foundation
import Observation

@MainActor
@Observable
final class HomeScheduleStore {
    private(set) var schedule: NativeHomeSchedule?
    private(set) var agendaItemsByDay: [Date: [HomeAgendaItem]] = [:]
    /// Berlin-local interval currently covered by `schedule` (inclusive start, exclusive end).
    private(set) var loadedWindow: DateInterval?
    private(set) var isLoading = false
    private(set) var issue: String?
    /// Soft warning when ICS subscription merge fails (local schedule still shown).
    private(set) var subscriptionIssue: String?
    private(set) var lastSyncedAt: Date?

    private let leadingDays = 14
    private let trailingDays = 45
    private let foregroundRefreshAge: TimeInterval = 60
    /// Reload before the user reaches the hard edge of the loaded window.
    private let edgePaddingDays = 3
    private var restoredCacheForUserID: String?
    private var pendingLoadFocus: Date?

    func load(using session: SessionStore, around focus: Date = Date()) async {
        guard !isLoading else {
            pendingLoadFocus = focus
            return
        }
        isLoading = true
        issue = nil
        subscriptionIssue = nil
        defer { finishLoad(using: session) }

        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("--ui-testing-authenticated") {
            let arguments = ProcessInfo.processInfo.arguments
            let fixture: NativeHomeSchedule
            if arguments.contains("--ui-testing-dense-calendar") {
                fixture = NativeHomeSchedule.uiTestingDenseFixture(now: focus)
            } else if arguments.contains("--ui-testing-all-day-calendar") {
                fixture = NativeHomeSchedule.uiTestingAllDayFixture(now: focus)
            } else {
                fixture = NativeHomeSchedule.uiTestingFixture(now: focus)
            }
            replaceSchedule(fixture)
            let calendar = Calendar.sideSeatBerlin
            let day = calendar.startOfDay(for: focus)
            if
                let start = calendar.date(byAdding: .day, value: -leadingDays, to: day),
                let end = calendar.date(byAdding: .day, value: trailingDays, to: day)
            {
                loadedWindow = DateInterval(start: start, end: end)
            }
            lastSyncedAt = Date()
            return
        }
        #endif

        let userID = session.currentUser?.id
        if let userID {
            await restoreCacheIfNeeded(for: userID)
        }

        let calendar = Calendar.sideSeatBerlin
        let day = calendar.startOfDay(for: focus)
        guard
            let start = calendar.date(byAdding: .day, value: -leadingDays, to: day),
            let end = calendar.date(byAdding: .day, value: trailingDays, to: day)
        else {
            issue = String(localized: "The schedule window could not be created.")
            return
        }

        do {
            let response: APIEnvelope<NativeHomeSchedule> = try await session.sendAuthorized(
                "api/v1/home/schedule",
                queryItems: [
                    URLQueryItem(name: "windowStart", value: start.ISO8601Format()),
                    URLQueryItem(name: "windowEnd", value: end.ISO8601Format()),
                ]
            )
            var refreshedSchedule = response.data
            let hasSubscriptions = response.data.initialCalendarCategories.contains(where: { category in
                guard let url = category.icsSubscriptionUrl else { return false }
                return !url.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            })

            if hasSubscriptions {
                do {
                    let subscriptions: APIEnvelope<NativeHomeSubscriptionSchedule> = try await session.sendAuthorized(
                        "api/v1/home/schedule/ics-subscriptions",
                        queryItems: [
                            URLQueryItem(name: "windowStart", value: start.ISO8601Format()),
                            URLQueryItem(name: "windowEnd", value: end.ISO8601Format()),
                        ]
                    )
                    refreshedSchedule = response.data.mergingSubscriptionEntries(subscriptions.data.studyEntries)
                } catch {
                    subscriptionIssue = String(localized: "Calendar subscriptions could not be refreshed.")
                }
            }

            let refreshedWindow = DateInterval(start: start, end: end)
            replaceSchedule(refreshedSchedule)
            loadedWindow = refreshedWindow
            lastSyncedAt = Date()
            await CalendarReminderScheduler.shared.synchronize(with: refreshedSchedule)
            if let userID {
                await HomeScheduleCache.shared.save(
                    schedule: refreshedSchedule,
                    window: refreshedWindow,
                    userID: userID,
                    savedAt: lastSyncedAt ?? Date()
                )
            }
        } catch {
            if schedule == nil {
                issue = error.localizedDescription
            } else {
                subscriptionIssue = String(localized: "Showing saved schedule. Pull to refresh.")
            }
        }
    }

    /// Refreshes after foreground activation without repeatedly fetching during quick tab changes.
    func refreshIfStale(using session: SessionStore, around focus: Date = Date()) async {
        guard !isLoading else { return }
        if let lastSyncedAt, Date().timeIntervalSince(lastSyncedAt) < foregroundRefreshAge {
            return
        }
        await load(using: session, around: focus)
    }

    /// Loads (or reloads) when `date` is outside the comfortable interior of `loadedWindow`.
    func ensureCovers(_ date: Date, using session: SessionStore) async {
        let calendar = Calendar.sideSeatBerlin
        let day = calendar.startOfDay(for: date)
        if let window = loadedWindow,
           let safeStart = calendar.date(byAdding: .day, value: edgePaddingDays, to: window.start),
           let safeEnd = calendar.date(byAdding: .day, value: -edgePaddingDays, to: window.end),
           day >= safeStart,
           day < safeEnd
        {
            return
        }
        await load(using: session, around: date)
    }

    private func restoreCacheIfNeeded(for userID: String) async {
        guard restoredCacheForUserID != userID else { return }
        restoredCacheForUserID = userID
        guard let cached = await HomeScheduleCache.shared.load(for: userID) else { return }
        replaceSchedule(cached.schedule)
        loadedWindow = DateInterval(start: cached.windowStart, end: cached.windowEnd)
        lastSyncedAt = cached.savedAt
        await CalendarReminderScheduler.shared.synchronize(with: cached.schedule)
    }

    private func finishLoad(using session: SessionStore) {
        isLoading = false
        guard let pendingLoadFocus else { return }
        self.pendingLoadFocus = nil
        Task {
            await load(using: session, around: pendingLoadFocus)
        }
    }

    #if DEBUG
    /// Applies an in-memory move for hermetic UI tests (no network).
    func applyUITestingMove(
        eventID: String,
        start: Date,
        end: Date,
        detachSeries: Bool
    ) {
        guard
            ProcessInfo.processInfo.arguments.contains("--ui-testing-authenticated"),
            let schedule,
            let index = schedule.studyEntries.firstIndex(where: { $0.id == eventID })
        else { return }

        let old = schedule.studyEntries[index]
        var entries = schedule.studyEntries
        entries[index] = NativeHomeStudyEntry(
            id: old.id,
            title: old.title,
            location: old.location,
            withLabel: old.withLabel,
            note: old.note,
            repeatRule: detachSeries ? "NONE" : old.repeatRule,
            repeatUntilISO: detachSeries ? nil : old.repeatUntilISO,
            eventParticipants: old.eventParticipants,
            startISO: start.ISO8601Format(),
            endISO: end.ISO8601Format(),
            categoryId: old.categoryId,
            categoryColor: old.categoryColor,
            categoryName: old.categoryName,
            discoverActivityId: old.discoverActivityId
        )
        replaceSchedule(NativeHomeSchedule(
            window: schedule.window,
            classBlocks: schedule.classBlocks,
            studyEntries: entries,
            companionOptions: schedule.companionOptions,
            initialCalendarCategories: schedule.initialCalendarCategories
        ))
    }

    /// Inserts an in-memory event for hermetic UI tests (paste / duplicate).
    func applyUITestingCreate(from transfer: CalendarEventTransfer, at start: Date) {
        guard
            ProcessInfo.processInfo.arguments.contains("--ui-testing-authenticated"),
            let schedule
        else { return }

        let end = start.addingTimeInterval(transfer.duration)
        var entries = schedule.studyEntries
        entries.append(
            NativeHomeStudyEntry(
                id: "ui-created-\(UUID().uuidString)",
                title: transfer.title,
                location: transfer.location.isEmpty ? nil : transfer.location,
                withLabel: nil,
                note: transfer.note.isEmpty ? nil : transfer.note,
                repeatRule: "NONE",
                repeatUntilISO: nil,
                eventParticipants: transfer.participantIDs.map {
                    NativeHomeEventParticipant(userId: $0, name: $0)
                },
                startISO: start.ISO8601Format(),
                endISO: end.ISO8601Format(),
                categoryId: transfer.categoryID,
                categoryColor: schedule.studyEntries.first(where: { $0.categoryId == transfer.categoryID })?.categoryColor
                    ?? schedule.initialCalendarCategories.first(where: { $0.id == transfer.categoryID })?.color,
                categoryName: schedule.initialCalendarCategories.first(where: { $0.id == transfer.categoryID })?.name,
                discoverActivityId: nil
            )
        )
        replaceSchedule(NativeHomeSchedule(
            window: schedule.window,
            classBlocks: schedule.classBlocks,
            studyEntries: entries.sorted { $0.startISO < $1.startISO },
            companionOptions: schedule.companionOptions,
            initialCalendarCategories: schedule.initialCalendarCategories
        ))
    }
    #endif

    private func replaceSchedule(_ next: NativeHomeSchedule) {
        schedule = next
        agendaItemsByDay = next.indexedItemsByDay()
    }
}

struct CachedHomeSchedule: Codable, Sendable {
    let userID: String
    let savedAt: Date
    let windowStart: Date
    let windowEnd: Date
    let schedule: NativeHomeSchedule
}

actor HomeScheduleCache {
    static let shared = HomeScheduleCache()

    private let fileManager: FileManager
    private let fileURL: URL

    init(fileManager: FileManager = .default) {
        self.fileManager = fileManager
        let base = fileManager.urls(for: .cachesDirectory, in: .userDomainMask).first
            ?? fileManager.temporaryDirectory
        fileURL = base
            .appendingPathComponent("SideSeat", isDirectory: true)
            .appendingPathComponent("home-schedule-v1.json", isDirectory: false)
    }

    func load(for userID: String) -> CachedHomeSchedule? {
        do {
            let data = try Data(contentsOf: fileURL)
            let cached = try JSONDecoder().decode(CachedHomeSchedule.self, from: data)
            return cached.userID == userID ? cached : nil
        } catch {
            return nil
        }
    }

    func save(
        schedule: NativeHomeSchedule,
        window: DateInterval,
        userID: String,
        savedAt: Date
    ) {
        let cached = CachedHomeSchedule(
            userID: userID,
            savedAt: savedAt,
            windowStart: window.start,
            windowEnd: window.end,
            schedule: schedule
        )
        do {
            try fileManager.createDirectory(
                at: fileURL.deletingLastPathComponent(),
                withIntermediateDirectories: true
            )
            try JSONEncoder().encode(cached).write(to: fileURL, options: .atomic)
        } catch {
            // Cache persistence must never block a successful server refresh.
        }
    }

    func clear() {
        try? fileManager.removeItem(at: fileURL)
    }
}
