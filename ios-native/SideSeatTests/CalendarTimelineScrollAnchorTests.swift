import Foundation
import SwiftUI
import Testing
@testable import SideSeat

@Suite("Calendar all-day style")
struct CalendarAllDayStyleTests {
    @Test("Long daytime spans are treated as all-day band items")
    func longSpansAreAllDay() throws {
        let calendar = Calendar.sideSeatBerlin
        let day = try #require(calendar.date(from: DateComponents(year: 2026, month: 7, day: 18)))
        let start = try #require(calendar.date(bySettingHour: 0, minute: 0, second: 0, of: day))
        let end = try #require(calendar.date(bySettingHour: 23, minute: 59, second: 0, of: day))
        #expect(CalendarAllDayStyle.contains(start: start, end: end, on: day, calendar: calendar))

        let shortEnd = try #require(calendar.date(bySettingHour: 11, minute: 0, second: 0, of: day))
        #expect(!CalendarAllDayStyle.contains(start: start, end: shortEnd, on: day, calendar: calendar))
    }

    @Test("A Berlin date-only range remains in the all-day band across DST")
    func dateOnlyRangeAcrossDST() throws {
        let calendar = Calendar.sideSeatBerlin
        let firstDay = try #require(
            calendar.date(from: DateComponents(year: 2026, month: 10, day: 25))
        )
        let secondDay = try #require(calendar.date(byAdding: .day, value: 1, to: firstDay))
        let end = try #require(calendar.date(byAdding: .day, value: 2, to: firstDay))

        #expect(
            CalendarAllDayStyle.contains(
                start: firstDay,
                end: end,
                on: firstDay,
                calendar: calendar
            )
        )
        #expect(
            CalendarAllDayStyle.contains(
                start: firstDay,
                end: end,
                on: secondDay,
                calendar: calendar
            )
        )
    }
}

@Suite("Calendar chrome formatting")
struct CalendarChromeFormattingTests {
    @Test("Day and clock labels stay digit-only so Chinese locale never truncates to ellipsis")
    func digitOnlyLabels() throws {
        let calendar = Calendar.sideSeatBerlin
        let day = try #require(
            calendar.date(from: DateComponents(year: 2026, month: 7, day: 18, hour: 10, minute: 5))
        )
        #expect(CalendarChrome.dayNumber(day, calendar: calendar) == "18")
        #expect(CalendarChrome.compactClock(day, calendar: calendar) == "10:05")
        #expect(CalendarChrome.compactHour(9) == "9")
        #expect(!CalendarChrome.dayNumber(day, calendar: calendar).contains("日"))
        #expect(!CalendarChrome.compactClock(day, calendar: calendar).contains("上午"))
    }

    @Test("Selection uses accent semantics separate from today/now")
    func selectionVersusTodayColors() {
        let selectedTodayWeekday = CalendarChrome.weekdayForeground(selected: true, isToday: true)
        let unselectedTodayWeekday = CalendarChrome.weekdayForeground(selected: false, isToday: true)
        #expect(selectedTodayWeekday == SideSeatTheme.textPrimary)
        #expect(unselectedTodayWeekday == CalendarChrome.nowAccent)

        let selectedNumber = CalendarChrome.dayNumberForeground(selected: true, isToday: false)
        let todayNumber = CalendarChrome.dayNumberForeground(selected: false, isToday: true)
        #expect(selectedNumber == Color.white)
        #expect(todayNumber == CalendarChrome.nowAccent)
    }

    @Test("Week header dimensions keep compact day chips readable")
    func weekHeaderDimensions() {
        #expect(CalendarChrome.dayChipDiameter == 34)
        #expect(CalendarChrome.weekHeaderHeight >= CalendarChrome.dayChipDiameter + 16)
    }

    @Test("Timeline ends with a compact day boundary")
    func compactTimelineEndCap() {
        #expect(CalendarChrome.timelineEndCapHeight > 0)
        #expect(CalendarChrome.timelineEndCapHeight <= 16)
        #expect(CalendarChrome.compactHour(24) == "24")
    }

    @Test("Short event hit targets reach 44pt and stay inside day boundaries")
    func eventHitTargetsStayInsideTimeline() {
        let middle = CalendarChrome.eventHitTargetLayout(
            visualTop: 100,
            visualHeight: 30,
            gridHeight: 1_000
        )
        #expect(middle.targetHeight == 44)
        #expect(middle.top == 93)
        #expect(middle.topInset == 7)
        #expect(middle.bottomInset == 7)

        let nearStart = CalendarChrome.eventHitTargetLayout(
            visualTop: 2,
            visualHeight: 18,
            gridHeight: 1_000
        )
        #expect(nearStart.top == 0)
        #expect(nearStart.topInset + 18 + nearStart.bottomInset == 44)

        let nearEnd = CalendarChrome.eventHitTargetLayout(
            visualTop: 982,
            visualHeight: 18,
            gridHeight: 1_000
        )
        #expect(nearEnd.top == 956)
        #expect(nearEnd.topInset + 18 + nearEnd.bottomInset == 44)
    }
}

@Suite("Calendar timeline scroll anchor")
struct CalendarTimelineScrollAnchorTests {
    @Test("Today anchors near now with a one-hour lead-in")
    func todayAnchorsNearNow() throws {
        let calendar = Calendar.sideSeatBerlin
        let day = try #require(calendar.date(from: DateComponents(year: 2026, month: 7, day: 18)))
        let now = try #require(
            calendar.date(from: DateComponents(year: 2026, month: 7, day: 18, hour: 14, minute: 20))
        )

        // Prefer now over an earlier morning event (Apple-like).
        let minute = CalendarTimelineScrollAnchor.targetMinute(
            on: day,
            firstEventMinute: 9 * 60,
            now: now,
            calendar: calendar
        )
        #expect(minute == 13 * 60)
    }

    @Test("Other days prefer the first event, then morning")
    func otherDaysPreferFirstEventOrMorning() throws {
        let calendar = Calendar.sideSeatBerlin
        let day = try #require(calendar.date(from: DateComponents(year: 2026, month: 7, day: 17)))
        let now = try #require(
            calendar.date(from: DateComponents(year: 2026, month: 7, day: 18, hour: 14, minute: 20))
        )

        let withEvent = CalendarTimelineScrollAnchor.targetMinute(
            on: day,
            firstEventMinute: 10 * 60 + 15,
            now: now,
            calendar: calendar
        )
        #expect(withEvent == 9 * 60)

        let empty = CalendarTimelineScrollAnchor.targetMinute(
            on: day,
            firstEventMinute: nil,
            now: now,
            calendar: calendar
        )
        #expect(empty == 7 * 60)
    }

    @Test("Offscreen cues select the nearest fully hidden event on each edge")
    func offscreenCuesSelectNearestEvents() throws {
        let calendar = Calendar.sideSeatBerlin
        let day = try #require(
            calendar.date(from: DateComponents(year: 2026, month: 8, day: 24))
        )
        let early = item("early", from: 7 * 60, to: 8 * 60, day: day, calendar: calendar)
        let nearestEarly = item(
            "nearest-early",
            from: 8 * 60,
            to: 9 * 60,
            day: day,
            calendar: calendar
        )
        let overlapsTop = item(
            "overlaps-top",
            from: 8 * 60 + 30,
            to: 9 * 60 + 30,
            day: day,
            calendar: calendar
        )
        let nearestLate = item(
            "nearest-late",
            from: 17 * 60,
            to: 18 * 60,
            day: day,
            calendar: calendar
        )
        let late = item("late", from: 20 * 60, to: 21 * 60, day: day, calendar: calendar)
        let items = [early, nearestEarly, overlapsTop, nearestLate, late]

        let top = CalendarOffscreenEventHints.nearest(
            items: items,
            on: day,
            viewportStartMinute: 9 * 60,
            viewportEndMinute: 17 * 60,
            edge: .top,
            calendar: calendar
        )
        let bottom = CalendarOffscreenEventHints.nearest(
            items: items,
            on: day,
            viewportStartMinute: 9 * 60,
            viewportEndMinute: 17 * 60,
            edge: .bottom,
            calendar: calendar
        )

        #expect(top?.item.id == "nearest-early")
        #expect(bottom?.item.id == "nearest-late")
    }

    @Test("Partially visible events do not create offscreen cues")
    func partiallyVisibleEventsDoNotCreateCues() throws {
        let calendar = Calendar.sideSeatBerlin
        let day = try #require(
            calendar.date(from: DateComponents(year: 2026, month: 8, day: 24))
        )
        let crossesTop = item(
            "crosses-top",
            from: 8 * 60 + 30,
            to: 9 * 60 + 30,
            day: day,
            calendar: calendar
        )
        let crossesBottom = item(
            "crosses-bottom",
            from: 16 * 60 + 30,
            to: 17 * 60 + 30,
            day: day,
            calendar: calendar
        )

        #expect(
            CalendarOffscreenEventHints.nearest(
                items: [crossesTop, crossesBottom],
                on: day,
                viewportStartMinute: 9 * 60,
                viewportEndMinute: 17 * 60,
                edge: .top,
                calendar: calendar
            ) == nil
        )
        #expect(
            CalendarOffscreenEventHints.nearest(
                items: [crossesTop, crossesBottom],
                on: day,
                viewportStartMinute: 9 * 60,
                viewportEndMinute: 17 * 60,
                edge: .bottom,
                calendar: calendar
            ) == nil
        )
    }

    @Test("Tapping a cue keeps a half-hour lead-in on the five-minute grid")
    func offscreenCueScrollTarget() throws {
        let calendar = Calendar.sideSeatBerlin
        let day = try #require(
            calendar.date(from: DateComponents(year: 2026, month: 8, day: 24))
        )
        let event = item(
            "target",
            from: 17 * 60 + 17,
            to: 18 * 60,
            day: day,
            calendar: calendar
        )
        let hint = try #require(
            CalendarOffscreenEventHints.nearest(
                items: [event],
                on: day,
                viewportStartMinute: 9 * 60,
                viewportEndMinute: 17 * 60,
                edge: .bottom,
                calendar: calendar
            )
        )

        #expect(CalendarOffscreenEventHints.scrollTargetMinute(for: hint) == 16 * 60 + 45)
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
            colorHex: "#2563EB",
            source: .event
        )
    }
}
