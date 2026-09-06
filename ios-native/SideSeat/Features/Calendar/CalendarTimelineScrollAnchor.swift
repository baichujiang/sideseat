import Foundation

/// Apple Calendar–style vertical anchoring for day/week time grids.
/// - Today: align near the current minute (with a short lead-in above).
/// - Other days: first event, otherwise morning (08:00).
/// Programmatic scroll only — never chase the clock after the user scrolls.
enum CalendarTimelineScrollAnchor {
    static let morningMinute = 8 * 60
    static let leadInMinutes = 60
    static let slotMinutes = 30

    static func targetMinute(
        on date: Date,
        firstEventMinute: Int?,
        now: Date = Date(),
        calendar: Calendar = .sideSeatBerlin
    ) -> Int {
        let preferred: Int
        // Compare against `now` so callers/tests can pin the reference clock.
        if calendar.isDate(date, inSameDayAs: now) {
            preferred =
                calendar.component(.hour, from: now) * 60
                + calendar.component(.minute, from: now)
        } else if let firstEventMinute {
            preferred = firstEventMinute
        } else {
            preferred = morningMinute
        }

        let floored = max(0, preferred - leadInMinutes)
        let snapped = (floored / slotMinutes) * slotMinutes
        return min(23 * 60 + slotMinutes, snapped)
    }

    static func firstEventMinute(
        items: [HomeAgendaItem],
        on date: Date,
        calendar: Calendar = .sideSeatBerlin
    ) -> Int? {
        CalendarDayLayout.placements(items: items, on: date, calendar: calendar)
            .map(\.startMinute)
            .min()
    }
}

enum CalendarOffscreenEventEdge: Equatable, Sendable {
    case top
    case bottom
}

struct CalendarOffscreenEventHint: Equatable, Sendable {
    let item: HomeAgendaItem
    let startMinute: Int
    let endMinute: Int
}

/// Finds the nearest timed event that sits fully outside the vertical viewport.
/// Partially visible cards do not produce a hint because the event is already discoverable.
enum CalendarOffscreenEventHints {
    static let scrollLeadInMinutes = 30
    static let scrollStepMinutes = 5

    static func nearest(
        items: [HomeAgendaItem],
        on date: Date,
        viewportStartMinute: Int,
        viewportEndMinute: Int,
        edge: CalendarOffscreenEventEdge,
        calendar: Calendar = .sideSeatBerlin
    ) -> CalendarOffscreenEventHint? {
        let visibleStart = min(max(viewportStartMinute, 0), 24 * 60)
        let visibleEnd = min(max(viewportEndMinute, visibleStart), 24 * 60)
        let placements = CalendarDayLayout.placements(
            items: items.filter { !$0.isAllDayStyle(on: date, calendar: calendar) },
            on: date,
            calendar: calendar
        )

        let placement: CalendarDayPlacement?
        switch edge {
        case .top:
            placement = placements
                .filter { $0.endMinute <= visibleStart }
                .max {
                    if $0.endMinute == $1.endMinute {
                        return $0.startMinute < $1.startMinute
                    }
                    return $0.endMinute < $1.endMinute
                }
        case .bottom:
            placement = placements
                .filter { $0.startMinute >= visibleEnd }
                .min {
                    if $0.startMinute == $1.startMinute {
                        return $0.endMinute < $1.endMinute
                    }
                    return $0.startMinute < $1.startMinute
                }
        }

        guard let placement else { return nil }
        return CalendarOffscreenEventHint(
            item: placement.item,
            startMinute: placement.startMinute,
            endMinute: placement.endMinute
        )
    }

    static func scrollTargetMinute(
        for hint: CalendarOffscreenEventHint,
        leadInMinutes: Int = scrollLeadInMinutes,
        stepMinutes: Int = scrollStepMinutes
    ) -> Int {
        let step = max(1, stepMinutes)
        let preferred = max(0, hint.startMinute - max(0, leadInMinutes))
        return min(24 * 60 - step, (preferred / step) * step)
    }
}
