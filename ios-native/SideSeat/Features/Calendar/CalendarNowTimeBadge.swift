import SwiftUI

/// Compact brand-Rose pill showing the wall-clock time at the current-time indicator.
struct CalendarNowTimeBadge: View {
    let date: Date

    var body: some View {
        Text(CalendarChrome.compactClock(date))
            .font(CalendarChrome.Typography.nowBadge)
            .monospacedDigit()
            .foregroundStyle(SideSeatTheme.calendarNowForeground)
            .lineLimit(1)
            .minimumScaleFactor(0.75)
            .padding(.horizontal, 5)
            .padding(.vertical, 2)
            .background(Capsule(style: .continuous).fill(CalendarChrome.nowBadgeFill))
            .fixedSize(horizontal: true, vertical: false)
            .accessibilityHidden(true)
    }
}
