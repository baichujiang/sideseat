import Foundation

/// Pure layout rules for the phone week timetable (configurable 3 / 5 / 7 visible day columns).
enum HomeWeekWindow {
    static let allowedVisibleDayCounts = [3, 5, 7]
    static let defaultVisibleDayCount = 5
    private static let preferencesKey = "sideseat.home.weekVisibleDayCount"

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

    /// Pinch out (magnification > 1) zooms into fewer day columns; pinch in shows more.
    static func visibleDayCount(base: Int, magnification: CGFloat) -> Int {
        let ordered = allowedVisibleDayCounts
        let clamped = clampVisibleDayCount(base)
        guard let index = ordered.firstIndex(of: clamped) else { return defaultVisibleDayCount }
        let safeMagnification = max(magnification, 0.01)
        let steps = Int((log(safeMagnification) / log(1.22)).rounded())
        let nextIndex = min(max(index - steps, 0), ordered.count - 1)
        return ordered[nextIndex]
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
}
