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

        #expect(mondayItems.map(\.id).contains("event-1"))
        #expect(mondayItems.contains { $0.source == .course })
        #expect(tuesdayItems.map(\.id) == ["event-1"])
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
}
