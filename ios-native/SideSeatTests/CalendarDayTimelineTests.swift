import Foundation
import Testing
@testable import SideSeat

@Suite("Calendar day timeline")
struct CalendarDayTimelineTests {
    @Test("Overlapping events receive separate lanes and boundary events reuse a lane")
    func overlapLanes() throws {
        let calendar = Calendar.sideSeatBerlin
        let day = try #require(calendar.date(from: DateComponents(year: 2026, month: 7, day: 17)))
        let first = item("first", from: 9 * 60, to: 10 * 60, day: day, calendar: calendar)
        let overlapping = item("overlap", from: 9 * 60 + 30, to: 10 * 60 + 30, day: day, calendar: calendar)
        let boundary = item("boundary", from: 10 * 60 + 30, to: 11 * 60, day: day, calendar: calendar)

        let placements = CalendarDayLayout.placements(
            items: [boundary, overlapping, first],
            on: day,
            calendar: calendar
        )
        let firstPlacement = try #require(placements.first { $0.id == "first" })
        let overlapPlacement = try #require(placements.first { $0.id == "overlap" })
        let boundaryPlacement = try #require(placements.first { $0.id == "boundary" })

        #expect(firstPlacement.laneCount == 2)
        #expect(overlapPlacement.laneCount == 2)
        #expect(firstPlacement.lane != overlapPlacement.lane)
        #expect(boundaryPlacement.lane == 0)
        #expect(boundaryPlacement.laneCount == 1)
    }

    @Test("Cross-day events are clipped to the visible day")
    func crossDayClipping() throws {
        let calendar = Calendar.sideSeatBerlin
        let day = try #require(calendar.date(from: DateComponents(year: 2026, month: 7, day: 17)))
        let previousDay = try #require(calendar.date(byAdding: .day, value: -1, to: day))
        let item = HomeAgendaItem(
            id: "overnight",
            title: "Overnight",
            start: try #require(calendar.date(byAdding: .hour, value: 23, to: previousDay)),
            end: try #require(calendar.date(byAdding: .minute, value: 45, to: day)),
            location: nil,
            colorHex: nil,
            source: .event
        )

        let placement = try #require(
            CalendarDayLayout.placements(items: [item], on: day, calendar: calendar).first
        )
        #expect(placement.startMinute == 0)
        #expect(placement.endMinute == 45)
    }

    @Test("Grid card time labels adapt to available card space")
    func adaptiveEventCardTimeLabels() throws {
        let calendar = Calendar.sideSeatBerlin
        let day = try #require(
            calendar.date(from: DateComponents(year: 2026, month: 7, day: 17, hour: 14))
        )
        let end = try #require(calendar.date(byAdding: .minute, value: 75, to: day))

        #expect(
            CalendarChrome.eventCardTimeLabel(
                from: day,
                to: end,
                height: 24,
                availableWidth: 100,
                calendar: calendar
            ) == nil
        )
        #expect(
            CalendarChrome.eventCardTimeLabel(
                from: day,
                to: end,
                height: 38,
                availableWidth: 100,
                calendar: calendar
            ) == "14:00"
        )
        #expect(
            CalendarChrome.eventCardTimeLabel(
                from: day,
                to: end,
                height: 60,
                availableWidth: 120,
                calendar: calendar
            ) == "14:00–15:15"
        )
        #expect(
            CalendarChrome.eventCardTimeLabel(
                from: day,
                to: end,
                height: 60,
                availableWidth: 50,
                calendar: calendar
            ) == "14:00"
        )
    }

    @Test("Copy and duplicate preserve details and duration but create one-off events")
    func eventTransfer() throws {
        let calendar = Calendar.sideSeatBerlin
        let start = try #require(
            calendar.date(from: DateComponents(year: 2026, month: 7, day: 17, hour: 14, minute: 15))
        )
        let end = try #require(calendar.date(byAdding: .minute, value: 75, to: start))
        let event = NativeHomeStudyEntry(
            id: "event-1",
            title: "Project review",
            location: "Room 4",
            withLabel: nil,
            note: "Bring notes",
            repeatRule: "WEEKLY",
            repeatUntilISO: nil,
            eventParticipants: [NativeHomeEventParticipant(userId: "peer-1", name: "Peer")],
            startISO: start.ISO8601Format(),
            endISO: end.ISO8601Format(),
            categoryId: "project",
            categoryColor: "#2563EB",
            categoryName: "Project",
            discoverActivityId: nil
        )
        let transfer = try #require(CalendarEventTransfer(event: event))
        let pastedStart = try #require(calendar.date(byAdding: .day, value: 1, to: start))
        let request = transfer.copyRequest(startingAt: pastedStart)

        #expect(transfer.duplicateStart == end)
        #expect(transfer.duration == 75 * 60)
        #expect(request.repeatRule == "NONE")
        #expect(request.repeatUntil.isEmpty)
        #expect(request.withUserIds == ["peer-1"])
        #expect(request.categoryId == "project")
        #expect(request.startAt == pastedStart.ISO8601Format())
        #expect(request.endAt == pastedStart.addingTimeInterval(75 * 60).ISO8601Format())
    }

    @Test("Move preserves recurrence metadata, details and duration")
    func eventMove() throws {
        let calendar = Calendar.sideSeatBerlin
        let start = try #require(
            calendar.date(from: DateComponents(year: 2026, month: 7, day: 17, hour: 9))
        )
        let end = try #require(calendar.date(byAdding: .minute, value: 45, to: start))
        let repeatUntil = try #require(calendar.date(byAdding: .month, value: 1, to: start))
        let event = NativeHomeStudyEntry(
            id: "recurring-event",
            title: "Weekly planning",
            location: "Studio",
            withLabel: nil,
            note: "Keep the series",
            repeatRule: "WEEKLY",
            repeatUntilISO: repeatUntil.ISO8601Format(),
            eventParticipants: [NativeHomeEventParticipant(userId: "peer-2", name: "Partner")],
            startISO: start.ISO8601Format(),
            endISO: end.ISO8601Format(),
            categoryId: "planning",
            categoryColor: "#16A34A",
            categoryName: "Planning",
            discoverActivityId: nil
        )
        let transfer = try #require(CalendarEventTransfer(event: event))
        let target = try #require(calendar.date(byAdding: .hour, value: 2, to: start))
        let request = transfer.moveRequest(startingAt: target)

        #expect(transfer.isRecurring)
        #expect(request.repeatRule == "WEEKLY")
        #expect(request.repeatUntil == repeatUntil.ISO8601Format())
        #expect(request.startAt == target.ISO8601Format())
        #expect(request.endAt == target.addingTimeInterval(45 * 60).ISO8601Format())
        #expect(request.location == "Studio")
        #expect(request.note == "Keep the series")
        #expect(request.withUserIds == ["peer-2"])
        #expect(request.categoryId == "planning")
    }

    private func item(
        _ id: String,
        from startMinute: Int,
        to endMinute: Int,
        day: Date,
        calendar: Calendar
    ) -> HomeAgendaItem {
        HomeAgendaItem(
            id: id,
            title: id,
            start: calendar.date(byAdding: .minute, value: startMinute, to: day)!,
            end: calendar.date(byAdding: .minute, value: endMinute, to: day)!,
            location: nil,
            colorHex: nil,
            source: .event
        )
    }
}
