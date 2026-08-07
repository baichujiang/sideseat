import Foundation
import Testing
@testable import SideSeat

@Suite("Home schedule")
struct HomeScheduleTests {
    @Test("Combines weekday courses and events that cross midnight")
    func dailyAgenda() throws {
        let calendar = Calendar.sideSeatBerlin
        let monday = try #require(
            calendar.date(from: DateComponents(year: 2026, month: 7, day: 13, hour: 12))
        )
        let eventStart = try #require(
            calendar.date(from: DateComponents(year: 2026, month: 7, day: 13, hour: 23, minute: 30))
        )
        let eventEnd = try #require(
            calendar.date(from: DateComponents(year: 2026, month: 7, day: 14, hour: 0, minute: 30))
        )
        let tuesday = try #require(calendar.date(byAdding: .day, value: 1, to: monday))
        let schedule = NativeHomeSchedule(
            window: NativeHomeScheduleWindow(start: "", end: "", timeZone: "Europe/Berlin"),
            classBlocks: [
                NativeHomeClassBlock(
                    courseId: "course-1",
                    courseName: "Algorithms",
                    courseCode: "IN0001",
                    weekday: "MON",
                    startMinute: 9 * 60,
                    endMinute: 10 * 60,
                    location: "Room 1",
                    categoryColor: nil
                )
            ],
            studyEntries: [
                NativeHomeStudyEntry(
                    id: "event-1",
                    title: "Late study",
                    location: nil,
                    withLabel: nil,
                    note: nil,
                    repeatRule: "NONE",
                    repeatUntilISO: nil,
                    eventParticipants: [],
                    startISO: eventStart.ISO8601Format(),
                    endISO: eventEnd.ISO8601Format(),
                    categoryId: nil,
                    categoryColor: "#2563EB",
                    categoryName: nil,
                    discoverActivityId: nil
                )
            ],
            companionOptions: [],
            initialCalendarCategories: []
        )

        let mondayItems = schedule.items(on: monday, calendar: calendar)
        let tuesdayItems = schedule.items(on: tuesday, calendar: calendar)
        let indexedItems = schedule.indexedItemsByDay(calendar: calendar)

        #expect(mondayItems.map(\.id).contains("event-1"))
        #expect(mondayItems.contains { $0.source == .course })
        #expect(tuesdayItems.map(\.id) == ["event-1"])
        #expect(indexedItems[calendar.startOfDay(for: monday)]?.map(\.id) == mondayItems.map(\.id))
        #expect(indexedItems[calendar.startOfDay(for: tuesday)]?.map(\.id) == tuesdayItems.map(\.id))
    }

    @Test("Dense calendar fixture fills every half-hour slot across the loaded window")
    func denseCalendarFixture() throws {
        let calendar = Calendar.sideSeatBerlin
        let now = try #require(
            calendar.date(from: DateComponents(year: 2026, month: 8, day: 7, hour: 12))
        )
        let schedule = NativeHomeSchedule.uiTestingDenseFixture(now: now)
        let indexedItems = schedule.indexedItemsByDay(calendar: calendar)

        #expect(schedule.studyEntries.count == 59 * 48)
        #expect(indexedItems.count == 59)
        #expect(indexedItems.values.allSatisfy { $0.count == 48 })
    }

    @Test("Merges synthetic subscription entries and marks them read-only")
    func subscriptionEntries() throws {
        let calendar = Calendar.sideSeatBerlin
        let day = try #require(
            calendar.date(from: DateComponents(year: 2026, month: 7, day: 17, hour: 10))
        )
        let end = try #require(calendar.date(byAdding: .hour, value: 1, to: day))
        let base = NativeHomeSchedule(
            window: NativeHomeScheduleWindow(start: "", end: "", timeZone: "Europe/Berlin"),
            classBlocks: [],
            studyEntries: [],
            companionOptions: [],
            initialCalendarCategories: []
        )
        let subscription = NativeHomeStudyEntry(
            id: "icsfeed:calendar-1:1:0",
            title: "Subscribed lecture",
            location: "Online",
            withLabel: nil,
            note: nil,
            repeatRule: "NONE",
            repeatUntilISO: nil,
            eventParticipants: [],
            startISO: day.ISO8601Format(),
            endISO: end.ISO8601Format(),
            categoryId: "calendar-1",
            categoryColor: "#16A34A",
            categoryName: "External",
            discoverActivityId: nil
        )
        let untrustedStoredEntry = NativeHomeStudyEntry(
            id: "database-event",
            title: "Must not be merged",
            location: nil,
            withLabel: nil,
            note: nil,
            repeatRule: "NONE",
            repeatUntilISO: nil,
            eventParticipants: [],
            startISO: day.ISO8601Format(),
            endISO: end.ISO8601Format(),
            categoryId: nil,
            categoryColor: nil,
            categoryName: nil,
            discoverActivityId: nil
        )

        let merged = base.mergingSubscriptionEntries([subscription, untrustedStoredEntry])
        let items = merged.items(on: day, calendar: calendar)

        #expect(merged.studyEntries.map(\.id) == [subscription.id])
        #expect(items.count == 1)
        #expect(items.first?.source == .subscription)
    }

    @Test("Preserves social context for shared events and public plans")
    func socialContext() throws {
        let calendar = Calendar.sideSeatBerlin
        let start = try #require(
            calendar.date(from: DateComponents(year: 2026, month: 8, day: 3, hour: 17))
        )
        let end = try #require(calendar.date(byAdding: .hour, value: 1, to: start))
        let shared = entry(
            id: "shared",
            start: start,
            end: end,
            withLabel: "Mina",
            participants: [NativeHomeEventParticipant(userId: "mina", name: "Mina")]
        )
        let plan = entry(
            id: "plan",
            start: start,
            end: end,
            participants: [NativeHomeEventParticipant(userId: "mina", name: "Mina")],
            discoverActivityID: "activity-1"
        )
        let schedule = NativeHomeSchedule(
            window: NativeHomeScheduleWindow(start: "", end: "", timeZone: "Europe/Berlin"),
            classBlocks: [],
            studyEntries: [shared, plan],
            companionOptions: [],
            initialCalendarCategories: []
        )

        let items = schedule.items(on: start, calendar: calendar)
        let sharedItem = try #require(items.first { $0.id == "shared" })
        let planItem = try #require(items.first { $0.id == "plan" })

        #expect(sharedItem.context == .shared)
        #expect(sharedItem.participantNames == ["Mina"])
        #expect(planItem.context == .publicPlan)
        #expect(planItem.discoverActivityID == "activity-1")
    }

    @Test("Builds a sparse 14-day agenda and keeps cross-day continuations")
    func multiDayAgenda() throws {
        let calendar = Calendar.sideSeatBerlin
        let start = try #require(
            calendar.date(from: DateComponents(year: 2026, month: 8, day: 3, hour: 12))
        )
        let lateStart = try #require(
            calendar.date(from: DateComponents(year: 2026, month: 8, day: 3, hour: 23, minute: 30))
        )
        let lateEnd = try #require(calendar.date(byAdding: .hour, value: 2, to: lateStart))
        let dayThree = try #require(calendar.date(byAdding: .day, value: 3, to: start))
        let dayThreeEnd = try #require(calendar.date(byAdding: .hour, value: 1, to: dayThree))
        let outside = try #require(calendar.date(byAdding: .day, value: 14, to: start))
        let outsideEnd = try #require(calendar.date(byAdding: .hour, value: 1, to: outside))
        let schedule = NativeHomeSchedule(
            window: NativeHomeScheduleWindow(start: "", end: "", timeZone: "Europe/Berlin"),
            classBlocks: [],
            studyEntries: [
                entry(id: "late", start: lateStart, end: lateEnd),
                entry(id: "day-three", start: dayThree, end: dayThreeEnd),
                entry(id: "outside", start: outside, end: outsideEnd),
            ],
            companionOptions: [],
            initialCalendarCategories: []
        )

        let sections = schedule.agendaSections(startingAt: start, calendar: calendar)

        #expect(sections.count == 3)
        #expect(sections[0].items.map(\.id) == ["late"])
        #expect(sections[1].items.map(\.id) == ["late"])
        #expect(sections[2].items.map(\.id) == ["day-three"])
        #expect(!sections.flatMap(\.items).contains(where: { $0.id == "outside" }))
    }

    @Test("Plans local event and course reminders 15 minutes before start")
    func calendarReminderPlanning() throws {
        let calendar = Calendar.sideSeatBerlin
        let now = try #require(
            calendar.date(from: DateComponents(year: 2026, month: 8, day: 5, hour: 8))
        )
        let eventStart = try #require(calendar.date(byAdding: .hour, value: 2, to: now))
        let eventEnd = try #require(calendar.date(byAdding: .hour, value: 1, to: eventStart))
        let schedule = NativeHomeSchedule(
            window: NativeHomeScheduleWindow(start: "", end: "", timeZone: "Europe/Berlin"),
            classBlocks: [
                NativeHomeClassBlock(
                    courseId: "course-1",
                    courseName: "Algorithms",
                    courseCode: "IN0001",
                    weekday: "WED",
                    startMinute: 11 * 60,
                    endMinute: 12 * 60,
                    location: "Room 1",
                    categoryColor: nil
                )
            ],
            studyEntries: [
                entry(id: "event-1", start: eventStart, end: eventEnd)
            ],
            companionOptions: [],
            initialCalendarCategories: []
        )

        let reminders = CalendarReminderPlanner.candidates(
            for: schedule,
            now: now,
            calendar: calendar
        )
        let eventReminder = try #require(reminders.first { $0.title == "event-1" })
        let courseReminder = try #require(reminders.first { $0.title == "IN0001 · Algorithms" })

        #expect(eventReminder.fireDate == eventStart.addingTimeInterval(-15 * 60))
        #expect(courseReminder.location == "Room 1")
        #expect(reminders.allSatisfy {
            $0.identifier.hasPrefix(CalendarReminderPlanner.notificationPrefix)
        })
    }

    @Test("Drops elapsed reminders, keeps nearest entries, and replaces identifiers after a move")
    func calendarReminderReconciliationInputs() throws {
        let calendar = Calendar.sideSeatBerlin
        let now = try #require(
            calendar.date(from: DateComponents(year: 2026, month: 8, day: 5, hour: 8))
        )
        let pastStart = try #require(calendar.date(byAdding: .minute, value: 10, to: now))
        let firstStart = try #require(calendar.date(byAdding: .hour, value: 1, to: now))
        let secondStart = try #require(calendar.date(byAdding: .hour, value: 2, to: now))
        let movedStart = try #require(calendar.date(byAdding: .minute, value: 30, to: secondStart))
        let schedule = reminderSchedule(
            entries: [
                entry(id: "past", start: pastStart, end: pastStart.addingTimeInterval(3_600)),
                entry(id: "first", start: firstStart, end: firstStart.addingTimeInterval(3_600)),
                entry(id: "second", start: secondStart, end: secondStart.addingTimeInterval(3_600)),
            ]
        )

        let limited = CalendarReminderPlanner.candidates(
            for: schedule,
            now: now,
            calendar: calendar,
            limit: 1
        )
        let originalSecond = try #require(
            CalendarReminderPlanner.candidates(for: schedule, now: now, calendar: calendar)
                .first { $0.title == "second" }
        )
        let moved = reminderSchedule(
            entries: [entry(id: "second", start: movedStart, end: movedStart.addingTimeInterval(3_600))]
        )
        let movedSecond = try #require(
            CalendarReminderPlanner.candidates(for: moved, now: now, calendar: calendar).first
        )

        #expect(limited.map(\.title) == ["first"])
        #expect(!limited.contains { $0.title == "past" })
        #expect(originalSecond.identifier != movedSecond.identifier)
    }

    private func reminderSchedule(entries: [NativeHomeStudyEntry]) -> NativeHomeSchedule {
        NativeHomeSchedule(
            window: NativeHomeScheduleWindow(start: "", end: "", timeZone: "Europe/Berlin"),
            classBlocks: [],
            studyEntries: entries,
            companionOptions: [],
            initialCalendarCategories: []
        )
    }

    private func entry(
        id: String,
        start: Date,
        end: Date,
        withLabel: String? = nil,
        participants: [NativeHomeEventParticipant] = [],
        discoverActivityID: String? = nil
    ) -> NativeHomeStudyEntry {
        NativeHomeStudyEntry(
            id: id,
            title: id,
            location: nil,
            withLabel: withLabel,
            note: nil,
            repeatRule: "NONE",
            repeatUntilISO: nil,
            eventParticipants: participants,
            startISO: start.ISO8601Format(),
            endISO: end.ISO8601Format(),
            categoryId: nil,
            categoryColor: nil,
            categoryName: nil,
            discoverActivityId: discoverActivityID
        )
    }
}
