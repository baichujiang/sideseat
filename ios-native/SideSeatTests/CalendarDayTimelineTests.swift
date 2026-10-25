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

    @Test("Timed cards use their Berlin clock coordinates on autumn, spring and ordinary days")
    func wallClockPlacementAcrossSeasons() throws {
        for offsetDay in ["2026-10-25", "2026-03-29", "2026-07-17"] {
            let offset = offsetDay == "2026-10-25" ? "+01:00" : "+02:00"
            let event = try absoluteItem("clock", start: "\(offsetDay)T03:01:00\(offset)", end: "\(offsetDay)T04:01:00\(offset)")
            let placement = try #require(CalendarDayLayout.placements(items: [event], on: event.start).first)
            #expect(placement.startMinute == 181)
            #expect(placement.endMinute == 241)
            #expect(placement.item.start == event.start && placement.item.end == event.end)
            #expect(CalendarTimelineClock.minute(of: event.start) == placement.startMinute)
        }
    }

    @Test("The last clock hour remains visible and cross-midnight clipping ends at 24")
    func lastClockHourAcrossSeasons() throws {
        for (day, next, offset) in [("2026-10-25", "2026-10-26", "+01:00"),
                                     ("2026-03-29", "2026-03-30", "+02:00"),
                                     ("2026-07-17", "2026-07-18", "+02:00")] {
            let event = try absoluteItem("late", start: "\(day)T23:30:00\(offset)", end: "\(next)T00:30:00\(offset)")
            let first = try #require(CalendarDayLayout.placements(items: [event], on: event.start).first)
            let second = try #require(CalendarDayLayout.placements(items: [event], on: event.end).first)
            #expect(first.startMinute == 1_410 && first.endMinute == 1_440)
            #expect(second.startMinute == 0 && second.endMinute == 30)
        }
    }

    @Test("Both repeated clock hours remain separate events and fold-spanning cards remain visible")
    func repeatedHourPlacements() throws {
        let first = try absoluteItem("first-fold", start: "2026-10-25T02:15:00+02:00", end: "2026-10-25T02:45:00+02:00")
        let second = try absoluteItem("second-fold", start: "2026-10-25T02:15:00+01:00", end: "2026-10-25T02:45:00+01:00")
        let placements = CalendarDayLayout.placements(items: [first, second], on: first.start)
        #expect(placements.count == 2)
        #expect(placements.allSatisfy { $0.startMinute == 135 && $0.endMinute == 165 && $0.laneCount == 2 })
        #expect(Set(placements.map(\.lane)).count == 2)
        #expect(Set(placements.map { $0.item.start }) == [first.start, second.start])
        let crossing = try absoluteItem("cross-fold", start: "2026-10-25T02:45:00+02:00", end: "2026-10-25T02:15:00+01:00")
        let range = try #require(CalendarDayLayout.placements(items: [crossing], on: first.start).first)
        #expect(range.startMinute == 120 && range.endMinute == 180)
        #expect(range.item.start == crossing.start && range.item.end == crossing.end)
        let endingAtFold = try absoluteItem("fold-end", start: "2026-10-25T02:30:00+02:00", end: "2026-10-25T02:00:00+01:00")
        let boundary = try #require(CalendarDayLayout.placements(items: [endingAtFold], on: first.start).first)
        #expect(boundary.startMinute == 150 && boundary.endMinute == 180)
    }

    @Test("Blank-slot and drag clock minutes round-trip without shifting the date or hour")
    func gridClockConversionAcrossSeasons() throws {
        let calendar = Calendar.sideSeatBerlin
        for (day, next, offset) in [("2026-10-25", "2026-10-26", "+01:00"),
                                     ("2026-03-29", "2026-03-30", "+02:00"),
                                     ("2026-07-17", "2026-07-18", "+02:00")] {
            let event = try absoluteItem("slot", start: "\(day)T03:30:00\(offset)", end: "\(next)T00:00:00\(offset)")
            #expect(CalendarTimelineClock.date(on: event.start, minute: 210) == event.start)
            #expect(CalendarTimelineClock.date(on: event.start, minute: 1_440) == event.end)
            let previous = try #require(CalendarTimelineClock.date(on: event.start, minute: -30))
            #expect(CalendarTimelineClock.minute(of: previous) == 1_410)
            #expect(calendar.dateComponents([.day], from: calendar.startOfDay(for: previous), to: calendar.startOfDay(for: event.start)).day == 1)
        }
    }

    @Test("New repeated-hour slots choose the first occurrence while edits retain either original occurrence")
    func repeatedHourClockConversion() throws {
        let first = try absoluteItem("first", start: "2026-10-25T02:30:20+02:00", end: "2026-10-25T02:35:00+02:00")
        let second = try absoluteItem("second", start: "2026-10-25T02:30:20+01:00", end: "2026-10-25T02:35:00+01:00")
        let firstSlot = try #require(CalendarTimelineClock.date(on: first.start, minute: 150))
        #expect(firstSlot == first.start.addingTimeInterval(-20))
        #expect(CalendarTimelineClock.date(on: first.start, minute: 150, preserving: first.start) == first.start)
        #expect(CalendarTimelineClock.date(on: second.start, minute: 150, preserving: second.start) == second.start)
        #expect(CalendarTimelineClock.date(on: first.start, minute: 155, preserving: first.start) == first.end)
        #expect(CalendarTimelineClock.date(on: second.start, minute: 155, preserving: second.start) == second.end)
        let nextDay = try #require(CalendarTimelineClock.date(on: second.start, minute: 1_440 + 150, preserving: second.start))
        #expect(nextDay.ISO8601Format() == "2026-10-26T01:30:00Z")
    }

    @Test("A nonexistent spring slot advances to the next valid local clock time")
    func springGapClockConversion() throws {
        let event = try absoluteItem("spring", start: "2026-03-29T01:30:00+01:00", end: "2026-03-29T03:30:00+02:00")
        let slot = try #require(CalendarTimelineClock.date(on: event.start, minute: 150))
        #expect(slot.ISO8601Format() == "2026-03-29T01:00:00Z")
        #expect(CalendarTimelineClock.minute(of: slot) == 180)
        let placement = try #require(CalendarDayLayout.placements(items: [event], on: event.start).first)
        #expect(placement.startMinute == 90 && placement.endMinute == 210)
        #expect(placement.item.end.timeIntervalSince(placement.item.start) == 3_600)
    }

    @Test("Fold-spanning resize deltas apply to real endpoints and preserve midnight and no-op instants")
    func foldResizeUsesRealEndpointDelta() throws {
        let event = try absoluteItem("resize-fold", start: "2026-10-25T02:45:20+02:00", end: "2026-10-25T02:15:20+01:00")
        let projection = try #require(CalendarDayLayout.placements(items: [event], on: event.start).first)
        #expect(projection.startMinute == 120 && projection.endMinute == 180)
        let movedStart = try #require(CalendarTimelineClock.shiftedDate(event.start, from: event.start,
            to: event.start, by: 125 - projection.startMinute))
        let movedEnd = try #require(CalendarTimelineClock.shiftedDate(event.end, from: event.start,
            to: event.start, by: 185 - projection.endMinute))
        #expect(movedStart.ISO8601Format() == "2026-10-25T00:50:00Z")
        #expect(movedEnd.ISO8601Format() == "2026-10-25T01:20:00Z")
        #expect(CalendarTimelineClock.shiftedDate(event.start, from: event.start, to: event.start, by: 0) == event.start)
        #expect(CalendarTimelineClock.shiftedDate(event.end, from: event.start, to: event.start, by: 0) == event.end)
        let midnight = try absoluteItem("midnight", start: "2026-10-25T23:30:00+01:00", end: "2026-10-26T00:00:00+01:00")
        let earlierEnd = try #require(CalendarTimelineClock.shiftedDate(midnight.end, from: midnight.start,
            to: midnight.start, by: -5))
        #expect(earlierEnd.ISO8601Format() == "2026-10-25T22:55:00Z")
        let nextDay = try #require(CalendarTimelineClock.date(on: event.start, minute: 1_440))
        let moved = try #require(CalendarTimelineClock.shiftedDate(event.start, from: event.start, to: nextDay, by: 5))
        #expect(moved.ISO8601Format() == "2026-10-26T01:50:00Z")
    }

    private func absoluteItem(_ id: String, start: String, end: String) throws -> HomeAgendaItem {
        let formatter = ISO8601DateFormatter()
        return HomeAgendaItem(id: id, title: id, start: try #require(formatter.date(from: start)),
                              end: try #require(formatter.date(from: end)), location: nil, colorHex: nil, source: .event)
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
