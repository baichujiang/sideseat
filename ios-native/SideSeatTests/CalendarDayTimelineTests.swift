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
        let resizedEnd = try #require(calendar.date(byAdding: .minute, value: 90, to: target))
        let resizedRequest = transfer.timingRequest(startingAt: target, endingAt: resizedEnd)

        #expect(transfer.isRecurring)
        #expect(request.repeatRule == "WEEKLY")
        #expect(request.repeatUntil == repeatUntil.ISO8601Format())
        #expect(request.startAt == target.ISO8601Format())
        #expect(request.endAt == target.addingTimeInterval(45 * 60).ISO8601Format())
        #expect(request.location == "Studio")
        #expect(request.note == "Keep the series")
        #expect(request.withUserIds == ["peer-2"])
        #expect(request.categoryId == "planning")
        #expect(resizedRequest.startAt == target.ISO8601Format())
        #expect(resizedRequest.endAt == resizedEnd.ISO8601Format())
        #expect(resizedRequest.repeatRule == "WEEKLY")
        #expect(resizedRequest.repeatUntil == repeatUntil.ISO8601Format())
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

@Suite("Calendar event timing")
struct CalendarEventTimingTests {
    @Test("New event starts round up to the next five-minute boundary")
    func roundsNewEventStartsToFiveMinutes() throws {
        let calendar = Calendar.sideSeatBerlin
        let offGrid = try #require(
            calendar.date(
                from: DateComponents(
                    year: 2026,
                    month: 8,
                    day: 20,
                    hour: 9,
                    minute: 2,
                    second: 47
                )
            )
        )
        let onGridWithSeconds = try #require(
            calendar.date(
                from: DateComponents(
                    year: 2026,
                    month: 8,
                    day: 20,
                    hour: 9,
                    minute: 5,
                    second: 47
                )
            )
        )

        let rounded = CalendarEventTiming.snappedUpToSelectionStep(offGrid, calendar: calendar)
        let nextGridMinute = CalendarEventTiming.snappedUpToSelectionStep(
            onGridWithSeconds,
            calendar: calendar
        )

        #expect(calendar.component(.minute, from: rounded) == 5)
        #expect(calendar.component(.second, from: rounded) == 0)
        #expect(calendar.component(.minute, from: nextGridMinute) == 10)
        #expect(calendar.component(.second, from: nextGridMinute) == 0)
        #expect(CalendarEventTiming.isAlignedToSelectionStep(rounded, calendar: calendar))
        #expect(CalendarEventTiming.minimumSelectableDuration == 5 * 60)
    }

    @Test("Floating create combines the selected day with the next current five-minute slot")
    func defaultsNewEventToSelectedDayAndCurrentTime() throws {
        let calendar = Calendar.sideSeatBerlin
        let selectedDay = try #require(
            calendar.date(
                from: DateComponents(year: 2026, month: 9, day: 3)
            )
        )
        let now = try #require(
            calendar.date(
                from: DateComponents(
                    year: 2026,
                    month: 8,
                    day: 28,
                    hour: 14,
                    minute: 35,
                    second: 42
                )
            )
        )

        let start = CalendarEventTiming.defaultStart(
            on: selectedDay,
            now: now,
            calendar: calendar
        )

        let components = calendar.dateComponents(
            [.year, .month, .day, .hour, .minute, .second],
            from: start
        )
        #expect(components.year == 2026)
        #expect(components.month == 9)
        #expect(components.day == 3)
        #expect(components.hour == 14)
        #expect(components.minute == 40)
        #expect(components.second == 0)
    }

    @Test("Five-minute rounding crosses midnight and the Berlin DST gap")
    func roundsFiveMinutesAcrossCalendarBoundaries() throws {
        let calendar = Calendar.sideSeatBerlin
        let late = try #require(
            calendar.date(
                from: DateComponents(
                    year: 2026,
                    month: 8,
                    day: 20,
                    hour: 23,
                    minute: 58,
                    second: 40
                )
            )
        )
        let springGap = try #require(
            calendar.date(
                from: DateComponents(
                    year: 2026,
                    month: 3,
                    day: 29,
                    hour: 1,
                    minute: 58
                )
            )
        )

        let midnight = CalendarEventTiming.snappedUpToSelectionStep(late, calendar: calendar)
        let afterGap = CalendarEventTiming.snappedUpToSelectionStep(springGap, calendar: calendar)

        #expect(calendar.component(.day, from: midnight) == 21)
        #expect(calendar.component(.hour, from: midnight) == 0)
        #expect(calendar.component(.minute, from: midnight) == 0)
        #expect(calendar.component(.hour, from: afterGap) == 3)
        #expect(calendar.component(.minute, from: afterGap) == 0)
    }

    @Test("Picker values align to the nearest five minutes")
    func alignsPickerValuesToFiveMinutes() throws {
        let calendar = Calendar.sideSeatBerlin
        let lower = try #require(
            calendar.date(
                from: DateComponents(year: 2026, month: 8, day: 20, hour: 9, minute: 2, second: 30)
            )
        )
        let upper = try #require(
            calendar.date(
                from: DateComponents(year: 2026, month: 8, day: 20, hour: 9, minute: 3, second: 30)
            )
        )

        let roundedDown = CalendarEventTiming.snappedToNearestSelectionStep(lower, calendar: calendar)
        let roundedUp = CalendarEventTiming.snappedToNearestSelectionStep(upper, calendar: calendar)

        #expect(calendar.component(.minute, from: roundedDown) == 0)
        #expect(calendar.component(.second, from: roundedDown) == 0)
        #expect(calendar.component(.minute, from: roundedUp) == 5)
        #expect(calendar.component(.second, from: roundedUp) == 0)
    }

    @Test("First selectable end is five-minute aligned and safely after the start")
    func computesFirstSelectableEnd() throws {
        let calendar = Calendar.sideSeatBerlin
        let alignedStart = try #require(
            calendar.date(
                from: DateComponents(year: 2026, month: 8, day: 20, hour: 9)
            )
        )
        let offGridStart = try #require(
            calendar.date(
                from: DateComponents(
                    year: 2026,
                    month: 8,
                    day: 20,
                    hour: 9,
                    minute: 2,
                    second: 30
                )
            )
        )
        let onGridMinuteWithSeconds = try #require(
            calendar.date(
                from: DateComponents(
                    year: 2026,
                    month: 8,
                    day: 20,
                    hour: 9,
                    second: 30
                )
            )
        )

        let alignedEnd = CalendarEventTiming.firstSelectableEnd(
            after: alignedStart,
            calendar: calendar
        )
        let offGridEnd = CalendarEventTiming.firstSelectableEnd(
            after: offGridStart,
            calendar: calendar
        )
        let endAfterPartialMinute = CalendarEventTiming.firstSelectableEnd(
            after: onGridMinuteWithSeconds,
            calendar: calendar
        )

        #expect(alignedEnd.timeIntervalSince(alignedStart) == 5 * 60)
        #expect(calendar.component(.minute, from: alignedEnd) == 5)
        #expect(offGridEnd.timeIntervalSince(offGridStart) >= 5 * 60)
        #expect(calendar.component(.minute, from: offGridEnd) == 10)
        #expect(calendar.component(.second, from: offGridEnd) == 0)
        #expect(CalendarEventTiming.isAlignedToSelectionStep(offGridEnd, calendar: calendar))
        #expect(endAfterPartialMinute.timeIntervalSince(onGridMinuteWithSeconds) >= 5 * 60)
        #expect(calendar.component(.minute, from: endAfterPartialMinute) == 10)
    }

    @Test("First selectable end crosses midnight and daylight-saving changes safely")
    func computesFirstSelectableEndAcrossCalendarBoundaries() throws {
        let calendar = Calendar.sideSeatBerlin
        let lateStart = try #require(
            calendar.date(
                from: DateComponents(year: 2026, month: 8, day: 20, hour: 23, minute: 58)
            )
        )
        let springStart = try #require(
            calendar.date(
                from: DateComponents(year: 2026, month: 3, day: 29, hour: 1, minute: 58)
            )
        )
        let autumnStart = try #require(
            calendar.date(
                from: DateComponents(year: 2026, month: 10, day: 25, hour: 2, minute: 58)
            )
        )

        let midnightEnd = CalendarEventTiming.firstSelectableEnd(
            after: lateStart,
            calendar: calendar
        )
        let springEnd = CalendarEventTiming.firstSelectableEnd(
            after: springStart,
            calendar: calendar
        )
        let autumnEnd = CalendarEventTiming.firstSelectableEnd(
            after: autumnStart,
            calendar: calendar
        )

        #expect(calendar.component(.day, from: midnightEnd) == 21)
        #expect(calendar.component(.hour, from: midnightEnd) == 0)
        #expect(calendar.component(.minute, from: midnightEnd) == 5)
        #expect(calendar.component(.hour, from: springEnd) == 3)
        #expect(springEnd.timeIntervalSince(springStart) >= 5 * 60)
        #expect(autumnEnd.timeIntervalSince(autumnStart) >= 5 * 60)
        #expect(CalendarEventTiming.isAlignedToSelectionStep(springEnd, calendar: calendar))
        #expect(CalendarEventTiming.isAlignedToSelectionStep(autumnEnd, calendar: calendar))
    }

    @Test("Changing the start preserves the existing duration")
    func preservesDurationWhenStartMoves() throws {
        let calendar = Calendar.sideSeatBerlin
        let oldStart = try #require(
            calendar.date(
                from: DateComponents(year: 2026, month: 8, day: 20, hour: 9)
            )
        )
        let oldEnd = oldStart.addingTimeInterval(75 * 60)
        let newStart = try #require(calendar.date(byAdding: .day, value: 2, to: oldStart))

        let newEnd = CalendarEventTiming.endPreservingDuration(
            oldStart: oldStart,
            newStart: newStart,
            end: oldEnd
        )

        #expect(newEnd.timeIntervalSince(newStart) == 75 * 60)
    }

    @Test("Elapsed duration stays exact across the Berlin daylight-saving boundary")
    func durationAcrossDaylightSavingTime() throws {
        let calendar = Calendar.sideSeatBerlin
        let oldStart = try #require(
            calendar.date(
                from: DateComponents(year: 2026, month: 3, day: 28, hour: 1, minute: 30)
            )
        )
        let oldEnd = oldStart.addingTimeInterval(60 * 60)
        let newStart = try #require(
            calendar.date(
                from: DateComponents(year: 2026, month: 3, day: 29, hour: 1, minute: 30)
            )
        )

        let newEnd = CalendarEventTiming.endPreservingDuration(
            oldStart: oldStart,
            newStart: newStart,
            end: oldEnd
        )

        #expect(newEnd.timeIntervalSince(newStart) == 60 * 60)
        #expect(calendar.component(.hour, from: newEnd) == 3)
    }

    @Test("A repeating event without an end passes editor validation")
    func validatesNeverEndingRepeat() throws {
        let calendar = Calendar.sideSeatBerlin
        let start = try #require(
            calendar.date(from: DateComponents(year: 2026, month: 9, day: 1, hour: 9))
        )
        let end = start.addingTimeInterval(60 * 60)

        #expect(
            CalendarEventFormValidation.issue(
                title: "Weekly review",
                startAt: start,
                endAt: end,
                repeatRule: .weekly,
                repeatUntil: start.addingTimeInterval(-24 * 60 * 60),
                repeatHasEnd: false
            ) == nil
        )
    }

    @Test("An explicit repeat boundary still has to follow the first event")
    func validatesBoundedRepeat() throws {
        let calendar = Calendar.sideSeatBerlin
        let start = try #require(
            calendar.date(from: DateComponents(year: 2026, month: 9, day: 1, hour: 9))
        )
        let end = start.addingTimeInterval(60 * 60)

        #expect(
            CalendarEventFormValidation.issue(
                title: "Weekly review",
                startAt: start,
                endAt: end,
                repeatRule: .weekly,
                repeatUntil: start.addingTimeInterval(-24 * 60 * 60),
                repeatHasEnd: true
            ) == AppLocalization.string("Repeat end must be after the first event.")
        )
    }
}
