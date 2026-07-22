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
