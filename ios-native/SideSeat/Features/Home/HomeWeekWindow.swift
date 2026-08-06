import Foundation

/// Pure layout rules for the phone week timetable (configurable 3 / 5 / 7 visible day columns).
enum HomeWeekWindow {
    struct EventDragTarget: Equatable, Sendable {
        let dayIndex: Int
        let startMinute: Int
    }

    static let allowedVisibleDayCounts = [3, 5, 7]
    static let defaultVisibleDayCount = 5
    static let defaultTimelineDensityLevel = 1
    private static let preferencesKey = "sideseat.home.weekVisibleDayCount"
    private static let timelineDensityPreferencesKey = "sideseat.home.weekTimelineDensity"

    static func clampVisibleDayCount(_ count: Int) -> Int {
        if allowedVisibleDayCounts.contains(count) { return count }
        return defaultVisibleDayCount
    }

    static func storedVisibleDayCount() -> Int {
        let raw = UserDefaults.standard.object(forKey: preferencesKey) as? Int
        return clampVisibleDayCount(raw ?? defaultVisibleDayCount)
    }

    static func storeVisibleDayCount(_ count: Int) {
        UserDefaults.standard.set(clampVisibleDayCount(count), forKey: preferencesKey)
    }

    static func clampTimelineDensityLevel(_ level: Int) -> Int {
        min(max(level, 0), 2)
    }

    static func storedTimelineDensityLevel() -> Int {
        let raw = UserDefaults.standard.object(forKey: timelineDensityPreferencesKey) as? Int
        return clampTimelineDensityLevel(raw ?? defaultTimelineDensityLevel)
    }

    static func storeTimelineDensityLevel(_ level: Int) {
        UserDefaults.standard.set(
            clampTimelineDensityLevel(level),
            forKey: timelineDensityPreferencesKey
        )
    }

    static func timelineScale(for level: Int) -> CGFloat {
        switch clampTimelineDensityLevel(level) {
        case 0: 0.82
        case 2: 1.25
        default: 1
        }
    }

    /// Fits every selected day inside the phone viewport. A visual minimum here
    /// would silently clip the final column in 7-day mode on narrow screens.
    static func dayColumnWidth(
        containerWidth: CGFloat,
        timeGutter: CGFloat,
        visibleDayCount: Int
    ) -> CGFloat {
        let count = max(1, clampVisibleDayCount(visibleDayCount))
        let available = max(0, containerWidth - timeGutter)
        return floor(available / CGFloat(count))
    }

    /// Start of the N-day viewport that should contain `focus`.
    /// Prefers Mon-start workweeks; if focus falls outside the first N columns of that week,
    /// shifts so the focused day remains the last visible column.
    static func viewportStart(
        containing focus: Date,
        visibleDayCount: Int = storedVisibleDayCount(),
        calendar: Calendar = .sideSeatBerlin
    ) -> Date {
        let count = clampVisibleDayCount(visibleDayCount)
        let day = calendar.startOfDay(for: focus)
        guard let weekStart = calendar.dateInterval(of: .weekOfYear, for: day)?.start else {
            return day
        }
        let offset = calendar.dateComponents([.day], from: weekStart, to: day).day ?? 0
        if offset < count {
            return weekStart
        }
        return calendar.date(byAdding: .day, value: offset - (count - 1), to: weekStart) ?? weekStart
    }

    static func days(
        from start: Date,
        count: Int,
        calendar: Calendar = .sideSeatBerlin
    ) -> [Date] {
        let safeCount = max(1, count)
        return (0..<safeCount).compactMap { calendar.date(byAdding: .day, value: $0, to: calendar.startOfDay(for: start)) }
    }

    /// Snap a horizontal drag to whole-day shifts using translation + predicted end.
    static func dayShiftDelta(
        translationWidth: CGFloat,
        predictedWidth: CGFloat,
        dayWidth: CGFloat
    ) -> Int {
        let width = max(dayWidth, 1)
        let blended = translationWidth * 0.65 + predictedWidth * 0.35
        let raw = -blended / width
        let rounded = Int(raw.rounded())
        if rounded != 0 { return rounded }
        // Small but intentional swipes still advance one day.
        if abs(translationWidth) >= width * 0.28 {
            return translationWidth < 0 ? 1 : -1
        }
        return 0
    }

    /// Converts a free-form card drag into the exact slot shown to the user.
    /// Keeping this calculation shared by the preview and drop avoids a visual
    /// jump when the finger is released.
    static func eventDragTarget(
        originDayIndex: Int,
        originStartMinute: Int,
        translation: CGSize,
        dayWidth: CGFloat,
        minuteHeight: CGFloat,
        dayCount: Int,
        snapMinutes: Int = 15
    ) -> EventDragTarget {
        let safeDayCount = max(1, dayCount)
        let safeSnap = max(1, snapMinutes)
        let dayDelta = Int((translation.width / max(dayWidth, 1)).rounded())
        let rawTargetMinute = CGFloat(originStartMinute)
            + translation.height / max(minuteHeight, 0.01)
        let snappedTargetMinute = Int(
            (rawTargetMinute / CGFloat(safeSnap)).rounded()
        ) * safeSnap

        return EventDragTarget(
            dayIndex: min(max(originDayIndex + dayDelta, 0), safeDayCount - 1),
            startMinute: min(
                max(snappedTargetMinute, 0),
                24 * 60 - safeSnap
            )
        )
    }

    static func isEventDragActivated(
        translation: CGSize,
        threshold: CGFloat = 8
    ) -> Bool {
        hypot(translation.width, translation.height) >= max(1, threshold)
    }
}
