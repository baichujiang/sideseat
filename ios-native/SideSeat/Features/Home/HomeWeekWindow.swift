import Foundation

/// Pure layout rules for the phone week timetable (configurable 3 / 5 / 7 visible day columns).
enum HomeWeekWindow {
    enum ScrollAxis: String, Equatable, Sendable {
        case horizontal
        case vertical
    }

    /// The viewport edge from which new calendar content is entering while the
    /// user's finger moves along a locked scroll axis.
    enum ScrollFeedbackEdge: String, Equatable, Sendable {
        case leading
        case trailing
        case top
        case bottom
    }

    enum EventDragOperation: Equatable, Sendable {
        case move
        case resizeStart
        case resizeEnd
    }

    struct EventDragTarget: Equatable, Sendable {
        let dayIndex: Int
        let startMinute: Int
    }

    struct EventResizeTarget: Equatable, Sendable {
        let startMinute: Int
        let endMinute: Int
    }

    static let allowedVisibleDayCounts = [3, 5, 7]
    static let defaultVisibleDayCount = 5
    static let minimumTimelineScale: CGFloat = 0.8
    static let defaultTimelineScale: CGFloat = 1
    static let maximumTimelineScale: CGFloat = 1.35
    static let timelineScaleAccessibilityStep: CGFloat = 0.1
    private static let preferencesKey = "sideseat.home.weekVisibleDayCount"
    private static let timelineScalePreferencesKey = "sideseat.home.weekTimelineScale.v2"
    private static let timelineZoomHintPreferencesKey = "sideseat.home.weekTimelineZoomHintSeen"
    /// Kept only to migrate the former compact / standard / spacious preference.
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

    static func clampTimelineScale(_ scale: CGFloat) -> CGFloat {
        min(max(scale, minimumTimelineScale), maximumTimelineScale)
    }

    static func timelineTopMinutePreservingAnchor(
        anchorMinute: CGFloat,
        anchorFraction: CGFloat,
        viewportHeight: CGFloat,
        minuteHeight: CGFloat
    ) -> CGFloat {
        let fraction = min(max(anchorFraction, 0), 1)
        return anchorMinute - fraction * max(0, viewportHeight) / max(0.001, minuteHeight)
    }

    static func storedTimelineScale(defaults: UserDefaults = .standard) -> CGFloat {
        if let stored = defaults.object(forKey: timelineScalePreferencesKey) as? NSNumber {
            return clampTimelineScale(CGFloat(stored.doubleValue))
        }
        if let stored = defaults.string(forKey: timelineScalePreferencesKey),
           let value = Double(stored)
        {
            return clampTimelineScale(CGFloat(value))
        }

        let legacyLevel = defaults.object(forKey: timelineDensityPreferencesKey) as? NSNumber
        switch legacyLevel?.intValue {
        case 0: return 0.82
        case 2: return 1.25
        default: return defaultTimelineScale
        }
    }

    static func storeTimelineScale(
        _ scale: CGFloat,
        defaults: UserDefaults = .standard
    ) {
        defaults.set(
            Double(clampTimelineScale(scale)),
            forKey: timelineScalePreferencesKey
        )
    }

    static func shouldShowTimelineZoomHint(defaults: UserDefaults = .standard) -> Bool {
        !defaults.bool(forKey: timelineZoomHintPreferencesKey)
    }

    static func markTimelineZoomHintSeen(defaults: UserDefaults = .standard) {
        defaults.set(true, forKey: timelineZoomHintPreferencesKey)
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

    /// Resolves the dominant axis once and keeps it locked for the rest of the drag.
    /// Ambiguous diagonal movement stays unresolved so the timetable never flashes
    /// between horizontal paging and vertical time scrolling.
    static func scrollAxis(
        translation: CGSize,
        lockedAxis: ScrollAxis? = nil,
        activationDistance: CGFloat = 18,
        dominanceRatio: CGFloat = 1.25
    ) -> ScrollAxis? {
        if let lockedAxis { return lockedAxis }

        let horizontalDistance = abs(translation.width)
        let verticalDistance = abs(translation.height)
        guard max(horizontalDistance, verticalDistance) > max(0, activationDistance) else {
            return nil
        }

        let ratio = max(1, dominanceRatio)
        if horizontalDistance > verticalDistance * ratio {
            return .horizontal
        }
        if verticalDistance > horizontalDistance * ratio {
            return .vertical
        }
        return nil
    }

    /// Maps a locked axis plus the signed drag translation to the edge where
    /// newly revealed content enters the viewport. Keeping this signed intent
    /// separate from axis locking allows an intentional reversal without ever
    /// changing horizontal scrolling into vertical scrolling mid-gesture.
    static func scrollFeedbackEdge(
        translation: CGSize,
        axis: ScrollAxis,
        directionChangeDistance: CGFloat = 8
    ) -> ScrollFeedbackEdge? {
        let threshold = max(0, directionChangeDistance)
        switch axis {
        case .horizontal:
            guard abs(translation.width) > threshold else { return nil }
            return translation.width < 0 ? .trailing : .leading
        case .vertical:
            guard abs(translation.height) > threshold else { return nil }
            return translation.height < 0 ? .bottom : .top
        }
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
        snapMinutes: Int = 5
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

    /// Resolves whether a long-press drag began on a resize edge or on the card body.
    /// The edge zone scales down for short events so a central move target always remains.
    static func eventDragOperation(
        startLocationY: CGFloat,
        visualTopInset: CGFloat,
        visualHeight: CGFloat,
        canResizeEnd: Bool = true,
        maximumEdgeZone: CGFloat = 14
    ) -> EventDragOperation {
        let safeHeight = max(1, visualHeight)
        let edgeZone = min(max(5, safeHeight * 0.25), max(5, maximumEdgeZone))
        let visualY = startLocationY - visualTopInset

        if visualY <= edgeZone {
            return .resizeStart
        }
        if canResizeEnd, visualY >= safeHeight - edgeZone {
            return .resizeEnd
        }
        return .move
    }

    /// Converts a vertical edge drag into a valid, snapped time range for one day.
    /// Start and end never cross, and every edited edge lands on the same five-minute
    /// grid used by the event editor.
    static func eventResizeTarget(
        originStartMinute: Int,
        originEndMinute: Int,
        translationHeight: CGFloat,
        minuteHeight: CGFloat,
        operation: EventDragOperation,
        snapMinutes: Int = 5,
        minimumDurationMinutes: Int = 5
    ) -> EventResizeTarget {
        let safeSnap = max(1, snapMinutes)
        let safeMinimumDuration = max(safeSnap, minimumDurationMinutes)
        let start = min(max(originStartMinute, 0), 24 * 60 - safeMinimumDuration)
        let end = min(max(originEndMinute, start + safeMinimumDuration), 24 * 60)
        let rawDelta = translationHeight / max(minuteHeight, 0.01)
        let targetMinute = { (origin: Int) in
            Int(((CGFloat(origin) + rawDelta) / CGFloat(safeSnap)).rounded()) * safeSnap
        }

        switch operation {
        case .resizeStart:
            return EventResizeTarget(
                startMinute: min(max(targetMinute(start), 0), end - safeMinimumDuration),
                endMinute: end
            )
        case .resizeEnd:
            return EventResizeTarget(
                startMinute: start,
                endMinute: min(
                    max(targetMinute(end), start + safeMinimumDuration),
                    24 * 60
                )
            )
        case .move:
            return EventResizeTarget(startMinute: start, endMinute: end)
        }
    }

    static func isEventDragActivated(
        translation: CGSize,
        threshold: CGFloat = 8
    ) -> Bool {
        hypot(translation.width, translation.height) >= max(1, threshold)
    }
}
