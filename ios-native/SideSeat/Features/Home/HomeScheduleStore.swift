import Foundation
import Observation

@MainActor
@Observable
final class HomeScheduleStore {
    private(set) var schedule: NativeHomeSchedule?
    /// Berlin-local interval currently covered by `schedule` (inclusive start, exclusive end).
    private(set) var loadedWindow: DateInterval?
    private(set) var isLoading = false
    private(set) var issue: String?
    /// Soft warning when ICS subscription merge fails (local schedule still shown).
    private(set) var subscriptionIssue: String?

    private let leadingDays = 14
    private let trailingDays = 45
    /// Reload before the user reaches the hard edge of the loaded window.
    private let edgePaddingDays = 3

    func load(using session: SessionStore, around focus: Date = Date()) async {
        isLoading = true
        issue = nil
        subscriptionIssue = nil
        defer { isLoading = false }

        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("--ui-testing-authenticated") {
            schedule = .uiTestingFixture(now: focus)
            let calendar = Calendar.sideSeatBerlin
            let day = calendar.startOfDay(for: focus)
            if
                let start = calendar.date(byAdding: .day, value: -leadingDays, to: day),
                let end = calendar.date(byAdding: .day, value: trailingDays, to: day)
            {
                loadedWindow = DateInterval(start: start, end: end)
            }
            return
        }
        #endif

        let calendar = Calendar.sideSeatBerlin
        let day = calendar.startOfDay(for: focus)
        guard
            let start = calendar.date(byAdding: .day, value: -leadingDays, to: day),
            let end = calendar.date(byAdding: .day, value: trailingDays, to: day)
        else {
            issue = "The schedule window could not be created."
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
            schedule = response.data
            loadedWindow = DateInterval(start: start, end: end)

            guard response.data.initialCalendarCategories.contains(where: { category in
                guard let url = category.icsSubscriptionUrl else { return false }
                return !url.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            }) else { return }

            do {
                let subscriptions: APIEnvelope<NativeHomeSubscriptionSchedule> = try await session.sendAuthorized(
                    "api/v1/home/schedule/ics-subscriptions",
                    queryItems: [
                        URLQueryItem(name: "windowStart", value: start.ISO8601Format()),
                        URLQueryItem(name: "windowEnd", value: end.ISO8601Format()),
                    ]
                )
                schedule = response.data.mergingSubscriptionEntries(subscriptions.data.studyEntries)
            } catch {
                subscriptionIssue = String(localized: "Calendar subscriptions could not be refreshed.")
            }
        } catch {
            issue = error.localizedDescription
        }
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
        self.schedule = NativeHomeSchedule(
            window: schedule.window,
            classBlocks: schedule.classBlocks,
            studyEntries: entries,
            companionOptions: schedule.companionOptions,
            initialCalendarCategories: schedule.initialCalendarCategories
        )
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
        self.schedule = NativeHomeSchedule(
            window: schedule.window,
            classBlocks: schedule.classBlocks,
            studyEntries: entries.sorted { $0.startISO < $1.startISO },
            companionOptions: schedule.companionOptions,
            initialCalendarCategories: schedule.initialCalendarCategories
        )
    }
    #endif
}
