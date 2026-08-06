import Foundation
import Testing
@testable import SideSeat

@Suite("Home week window")
struct HomeWeekWindowTests {
    private let calendar = Calendar.sideSeatBerlin

    @Test("Prefers a Monday-start 5-day viewport for midweek focus")
    func mondayViewportForWeekday() throws {
        // 2026-07-15 is a Wednesday in Europe/Berlin.
        var components = DateComponents()
        components.year = 2026
        components.month = 7
        components.day = 15
        let wednesday = try #require(calendar.date(from: components))
        let start = HomeWeekWindow.viewportStart(
            containing: wednesday,
            visibleDayCount: 5,
            calendar: calendar
        )
        #expect(calendar.component(.weekday, from: start) == 2) // Monday
        let days = HomeWeekWindow.days(from: start, count: 5, calendar: calendar)
        #expect(days.count == 5)
        #expect(days.contains { calendar.isDate($0, inSameDayAs: wednesday) })
    }

    @Test("Keeps weekend focus inside the 5-day viewport")
    func weekendShiftsViewport() throws {
        var components = DateComponents()
        components.year = 2026
        components.month = 7
        components.day = 18 // Saturday
        let saturday = try #require(calendar.date(from: components))
        let start = HomeWeekWindow.viewportStart(
            containing: saturday,
            visibleDayCount: 5,
            calendar: calendar
        )
        let days = HomeWeekWindow.days(from: start, count: 5, calendar: calendar)
        #expect(days.contains { calendar.isDate($0, inSameDayAs: saturday) })
        #expect(calendar.isDate(days.last ?? start, inSameDayAs: saturday))
    }

    @Test("7-day viewport keeps the full Mon–Sun week")
    func sevenDayViewport() throws {
        var components = DateComponents()
        components.year = 2026
        components.month = 7
        components.day = 19 // Sunday
        let sunday = try #require(calendar.date(from: components))
        let start = HomeWeekWindow.viewportStart(
            containing: sunday,
            visibleDayCount: 7,
            calendar: calendar
        )
        #expect(calendar.component(.weekday, from: start) == 2)
        let days = HomeWeekWindow.days(from: start, count: 7, calendar: calendar)
        #expect(days.count == 7)
        #expect(days.contains { calendar.isDate($0, inSameDayAs: sunday) })
    }

    @Test("3-day viewport keeps focus as the last column when needed")
    func threeDayViewport() throws {
        var components = DateComponents()
        components.year = 2026
        components.month = 7
        components.day = 16 // Thursday
        let thursday = try #require(calendar.date(from: components))
        let start = HomeWeekWindow.viewportStart(
            containing: thursday,
            visibleDayCount: 3,
            calendar: calendar
        )
        let days = HomeWeekWindow.days(from: start, count: 3, calendar: calendar)
        #expect(days.count == 3)
        #expect(calendar.isDate(days.last ?? start, inSameDayAs: thursday))
    }

    @Test("Day-shift snap uses translation and predicted end")
    func dayShiftSnap() {
        #expect(
            HomeWeekWindow.dayShiftDelta(
                translationWidth: -80,
                predictedWidth: -120,
                dayWidth: 70
            ) == 1
        )
        #expect(
            HomeWeekWindow.dayShiftDelta(
                translationWidth: 10,
                predictedWidth: 12,
                dayWidth: 70
            ) == 0
        )
        #expect(
            HomeWeekWindow.dayShiftDelta(
                translationWidth: 30,
                predictedWidth: 40,
                dayWidth: 70
            ) == -1
        )
    }

    @Test("Event drag preview snaps to visible day and quarter-hour slots")
    func eventDragSnap() {
        let target = HomeWeekWindow.eventDragTarget(
            originDayIndex: 1,
            originStartMinute: 9 * 60 + 7,
            translation: CGSize(width: 74, height: 37),
            dayWidth: 70,
            minuteHeight: 1,
            dayCount: 5
        )

        #expect(target.dayIndex == 2)
        #expect(target.startMinute == 9 * 60 + 45)
    }

    @Test("Event drag target cannot leave the visible calendar grid")
    func eventDragClampsToGrid() {
        let upper = HomeWeekWindow.eventDragTarget(
            originDayIndex: 0,
            originStartMinute: 30,
            translation: CGSize(width: -500, height: -500),
            dayWidth: 70,
            minuteHeight: 1,
            dayCount: 3
        )
        let lower = HomeWeekWindow.eventDragTarget(
            originDayIndex: 2,
            originStartMinute: 23 * 60,
            translation: CGSize(width: 500, height: 500),
            dayWidth: 70,
            minuteHeight: 1,
            dayCount: 3
        )

        #expect(upper == HomeWeekWindow.EventDragTarget(dayIndex: 0, startMinute: 0))
        #expect(lower == HomeWeekWindow.EventDragTarget(dayIndex: 2, startMinute: 23 * 60 + 45))
    }

    @Test("Event drag ignores long-press jitter until movement is intentional")
    func eventDragActivationThreshold() {
        #expect(!HomeWeekWindow.isEventDragActivated(translation: CGSize(width: 3, height: 4)))
        #expect(HomeWeekWindow.isEventDragActivated(translation: CGSize(width: 6, height: 6)))
    }

    @Test("Clamps visible day counts to 3/5/7")
    func clampsVisibleDays() {
        #expect(HomeWeekWindow.clampVisibleDayCount(4) == 5)
        #expect(HomeWeekWindow.clampVisibleDayCount(3) == 3)
        #expect(HomeWeekWindow.clampVisibleDayCount(7) == 7)
    }

    @Test("Seven day columns fit inside an iPhone viewport")
    func sevenDayColumnsFitViewport() {
        let containerWidth: CGFloat = 402
        let gutter = CalendarChrome.weekTimeGutter
        let dayWidth = HomeWeekWindow.dayColumnWidth(
            containerWidth: containerWidth,
            timeGutter: gutter,
            visibleDayCount: 7
        )

        #expect(dayWidth == 50)
        #expect(dayWidth * 7 <= containerWidth - gutter)
        #expect(dayWidth > CalendarChrome.dayChipDiameter)
    }

    @Test("Clamps timeline density to compact, standard, or spacious")
    func clampsTimelineDensity() {
        #expect(HomeWeekWindow.clampTimelineDensityLevel(-1) == 0)
        #expect(HomeWeekWindow.clampTimelineDensityLevel(1) == 1)
        #expect(HomeWeekWindow.clampTimelineDensityLevel(3) == 2)
        #expect(HomeWeekWindow.timelineScale(for: 0) < 1)
        #expect(HomeWeekWindow.timelineScale(for: 1) == 1)
        #expect(HomeWeekWindow.timelineScale(for: 2) > 1)
    }
}
