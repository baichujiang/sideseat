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

    @Test("Scroll direction waits for intentional movement")
    func scrollDirectionActivationThreshold() {
        #expect(HomeWeekWindow.scrollAxis(translation: CGSize(width: 18, height: 0)) == nil)
        #expect(HomeWeekWindow.scrollAxis(translation: CGSize(width: 0, height: -18)) == nil)
        #expect(HomeWeekWindow.scrollAxis(translation: CGSize(width: 24, height: 22)) == nil)
    }

    @Test("Scroll direction recognizes both signs of each axis")
    func scrollDirectionRecognizesDominantAxis() {
        #expect(HomeWeekWindow.scrollAxis(translation: CGSize(width: 24, height: 8)) == .horizontal)
        #expect(HomeWeekWindow.scrollAxis(translation: CGSize(width: -24, height: -8)) == .horizontal)
        #expect(HomeWeekWindow.scrollAxis(translation: CGSize(width: 8, height: 24)) == .vertical)
        #expect(HomeWeekWindow.scrollAxis(translation: CGSize(width: -8, height: -24)) == .vertical)
    }

    @Test("Scroll direction remains locked until the gesture ends")
    func scrollDirectionDoesNotFlipAfterLocking() {
        #expect(
            HomeWeekWindow.scrollAxis(
                translation: CGSize(width: 2, height: 40),
                lockedAxis: .horizontal
            ) == .horizontal
        )
        #expect(
            HomeWeekWindow.scrollAxis(
                translation: CGSize(width: 40, height: 2),
                lockedAxis: .vertical
            ) == .vertical
        )
    }

    @Test("Scroll feedback follows the edge where new content enters")
    func scrollFeedbackUsesIncomingContentEdge() {
        #expect(
            HomeWeekWindow.scrollFeedbackEdge(
                translation: CGSize(width: -30, height: 2),
                axis: .horizontal
            ) == .trailing
        )
        #expect(
            HomeWeekWindow.scrollFeedbackEdge(
                translation: CGSize(width: 30, height: -2),
                axis: .horizontal
            ) == .leading
        )
        #expect(
            HomeWeekWindow.scrollFeedbackEdge(
                translation: CGSize(width: 2, height: -30),
                axis: .vertical
            ) == .bottom
        )
        #expect(
            HomeWeekWindow.scrollFeedbackEdge(
                translation: CGSize(width: -2, height: 30),
                axis: .vertical
            ) == .top
        )
    }

    @Test("Scroll feedback waits through a small direction reversal")
    func scrollFeedbackIgnoresDirectionJitter() {
        #expect(
            HomeWeekWindow.scrollFeedbackEdge(
                translation: CGSize(width: -8, height: 0),
                axis: .horizontal
            ) == nil
        )
        #expect(
            HomeWeekWindow.scrollFeedbackEdge(
                translation: CGSize(width: 0, height: 8),
                axis: .vertical
            ) == nil
        )
    }

    @Test("Event drag preview snaps to visible day and five-minute slots")
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
        #expect(lower == HomeWeekWindow.EventDragTarget(dayIndex: 2, startMinute: 23 * 60 + 55))
    }

    @Test("Event long-press drag distinguishes body and resize edges")
    func eventDragOperationUsesVisibleEdges() {
        #expect(
            HomeWeekWindow.eventDragOperation(
                startLocationY: 6,
                visualTopInset: 4,
                visualHeight: 60
            ) == .resizeStart
        )
        #expect(
            HomeWeekWindow.eventDragOperation(
                startLocationY: 34,
                visualTopInset: 4,
                visualHeight: 60
            ) == .move
        )
        #expect(
            HomeWeekWindow.eventDragOperation(
                startLocationY: 62,
                visualTopInset: 4,
                visualHeight: 60
            ) == .resizeEnd
        )
        #expect(
            HomeWeekWindow.eventDragOperation(
                startLocationY: 62,
                visualTopInset: 4,
                visualHeight: 60,
                canResizeEnd: false
            ) == .move
        )
    }

    @Test("Short events retain a central move target between resize edges")
    func shortEventKeepsMoveTarget() {
        #expect(
            HomeWeekWindow.eventDragOperation(
                startLocationY: 9,
                visualTopInset: 0,
                visualHeight: 18
            ) == .move
        )
    }

    @Test("Event edge resize snaps to five minutes and preserves a valid range")
    func eventResizeSnapAndMinimumDuration() {
        let laterEnd = HomeWeekWindow.eventResizeTarget(
            originStartMinute: 9 * 60,
            originEndMinute: 10 * 60,
            translationHeight: 17,
            minuteHeight: 1,
            operation: .resizeEnd
        )
        #expect(laterEnd == HomeWeekWindow.EventResizeTarget(
            startMinute: 9 * 60,
            endMinute: 10 * 60 + 15
        ))

        let laterStart = HomeWeekWindow.eventResizeTarget(
            originStartMinute: 9 * 60,
            originEndMinute: 10 * 60,
            translationHeight: 17,
            minuteHeight: 1,
            operation: .resizeStart
        )
        #expect(laterStart == HomeWeekWindow.EventResizeTarget(
            startMinute: 9 * 60 + 15,
            endMinute: 10 * 60
        ))

        let minimum = HomeWeekWindow.eventResizeTarget(
            originStartMinute: 9 * 60,
            originEndMinute: 10 * 60,
            translationHeight: -200,
            minuteHeight: 1,
            operation: .resizeEnd
        )
        #expect(minimum.endMinute - minimum.startMinute == 5)
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

    @Test("Clamps continuous timeline scale to the supported range")
    func clampsTimelineScale() {
        #expect(
            HomeWeekWindow.clampTimelineScale(0.2)
                == HomeWeekWindow.minimumTimelineScale
        )
        #expect(HomeWeekWindow.clampTimelineScale(1.13) == 1.13)
        #expect(
            HomeWeekWindow.clampTimelineScale(2)
                == HomeWeekWindow.maximumTimelineScale
        )
    }

    @Test("Continuous zoom preserves the time beneath the gesture anchor")
    func timelineZoomPreservesGestureAnchor() {
        let anchorMinute: CGFloat = 12 * 60
        let viewportHeight: CGFloat = 500
        let anchorFraction: CGFloat = 0.5
        let compactTop = HomeWeekWindow.timelineTopMinutePreservingAnchor(
            anchorMinute: anchorMinute,
            anchorFraction: anchorFraction,
            viewportHeight: viewportHeight,
            minuteHeight: CalendarChrome.weekMinuteHeight * 0.9
        )
        let spaciousTop = HomeWeekWindow.timelineTopMinutePreservingAnchor(
            anchorMinute: anchorMinute,
            anchorFraction: anchorFraction,
            viewportHeight: viewportHeight,
            minuteHeight: CalendarChrome.weekMinuteHeight * 1.3
        )

        let compactAnchor = compactTop
            + anchorFraction * viewportHeight / (CalendarChrome.weekMinuteHeight * 0.9)
        let spaciousAnchor = spaciousTop
            + anchorFraction * viewportHeight / (CalendarChrome.weekMinuteHeight * 1.3)
        #expect(abs(compactAnchor - anchorMinute) < 0.001)
        #expect(abs(spaciousAnchor - anchorMinute) < 0.001)
    }

    @Test("Persists an exact continuous timeline scale")
    func storesContinuousTimelineScale() {
        let suiteName = "HomeWeekWindowTests.timelineScale.\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: suiteName)!
        defer { defaults.removePersistentDomain(forName: suiteName) }

        HomeWeekWindow.storeTimelineScale(1.17, defaults: defaults)

        #expect(abs(HomeWeekWindow.storedTimelineScale(defaults: defaults) - 1.17) < 0.001)
    }
}
