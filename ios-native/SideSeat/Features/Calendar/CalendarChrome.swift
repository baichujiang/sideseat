import SwiftUI

/// Shared visual tokens so Week / Day surfaces stay Apple Calendar–grade and consistent.
///
/// Selection uses ``SideSeatTheme/accent``; “now” / today markers use ``nowRed`` /
/// ``SideSeatTheme/calendarNow``. Never paint brand gradients into the grid.
enum CalendarChrome {
    // MARK: - Grid metrics

    static let weekMinuteHeight: CGFloat = 0.94
    static let dayMinuteHeight: CGFloat = 1.08
    static let weekTimeGutter: CGFloat = 52
    static let dayTimeGutter: CGFloat = 56
    /// Floor width per week column (3 / 5 / 7-day pinch).
    static let weekMinDayWidth: CGFloat = 58
    static let weekHeaderHeight: CGFloat = 56
    /// Keep modest — system context-menu chrome already rounds the lifted preview.
    static let eventCornerRadius: CGFloat = 3
    static let nowLineThickness: CGFloat = 2
    static let nowLineHitSlop: CGFloat = 16

    // MARK: - Day chip (date strip + week headers)

    static let dayChipDiameter: CGFloat = 34
    static let stripChipWidth: CGFloat = 42
    static let stripChipSpacing: CGFloat = 8

    // MARK: - Washes & lines

    static let todayWash = SideSeatTheme.calendarNow.opacity(0.055)
    /// Focused day column in week grid — accent, not now-red.
    static let selectedWash = SideSeatTheme.accent.opacity(0.045)
    static let hourLine = Color.primary.opacity(0.12)
    static let halfHourLine = Color.primary.opacity(0.06)
    static let columnDivider = Color.primary.opacity(0.08)
    /// Alias of `SideSeatTheme.calendarNow` — kept separate from accent selection.
    static let nowRed = SideSeatTheme.calendarNow

    // MARK: - Typography

    enum Typography {
        static let weekday = Font.caption2.weight(.semibold)
        static let stripDayNumber = Font.body.weight(.semibold)
        static let weekDayNumber = Font.title3.weight(.semibold)
        static let hourRail = Font.caption2.monospacedDigit()
        static let allDayLabel = Font.caption2.weight(.semibold)
        static let nowBadge = Font.system(size: 10, weight: .semibold, design: .rounded)
        static let eventTitle = Font.caption.weight(.semibold)
        static let eventTitleCompact = Font.system(size: 10, weight: .semibold)
        static let eventSubtitle = Font.caption2.monospacedDigit()
    }

    // MARK: - Selection vs today colors

    static func weekdayForeground(selected: Bool, isToday: Bool) -> Color {
        if selected { return SideSeatTheme.accent }
        if isToday { return nowRed }
        return SideSeatTheme.textSecondary
    }

    static func dayNumberForeground(selected: Bool, isToday: Bool) -> Color {
        if selected { return .white }
        if isToday { return nowRed }
        return SideSeatTheme.textPrimary
    }

    static func eventColor(for item: HomeAgendaItem) -> Color {
        Color(hex: item.colorHex)
            ?? (item.source == .course ? SideSeatTheme.courseFallback : SideSeatTheme.accent)
    }

    /// Narrow gutters / badges cannot fit localized "上午10:45" — keep digit clock only.
    static func compactClock(_ date: Date, calendar: Calendar = .sideSeatBerlin) -> String {
        String(
            format: "%02d:%02d",
            calendar.component(.hour, from: date),
            calendar.component(.minute, from: date)
        )
    }

    /// Hour rail labels — plain digits, never localized "9时" / "9 AM".
    static func compactHour(_ hour: Int) -> String {
        String(hour)
    }

    /// Day-of-month for chips/headers — plain digits, never localized "18日".
    static func dayNumber(_ date: Date, calendar: Calendar = .sideSeatBerlin) -> String {
        String(calendar.component(.day, from: date))
    }
}

// MARK: - Day number chip

/// Shared weekday + day-number chrome for the Home date strip and week column headers.
struct CalendarDayChipLabel: View {
    enum Style {
        /// Horizontal strip under the month title.
        case strip
        /// Week timetable column header (fills available width).
        case weekHeader
    }

    let day: Date
    let selected: Bool
    let isToday: Bool
    var style: Style = .strip
    var calendar: Calendar = .sideSeatBerlin

    var body: some View {
        VStack(spacing: style == .strip ? 6 : 4) {
            Text(day, format: .dateTime.weekday(.narrow))
                .font(CalendarChrome.Typography.weekday)
                .foregroundStyle(CalendarChrome.weekdayForeground(selected: selected, isToday: isToday))
                .textCase(.uppercase)

            Text(CalendarChrome.dayNumber(day, calendar: calendar))
                .font(dayNumberFont)
                .monospacedDigit()
                .foregroundStyle(CalendarChrome.dayNumberForeground(selected: selected, isToday: isToday))
                .lineLimit(1)
                .minimumScaleFactor(0.8)
                .frame(
                    width: CalendarChrome.dayChipDiameter,
                    height: CalendarChrome.dayChipDiameter
                )
                .background {
                    if selected {
                        Circle().fill(SideSeatTheme.accent)
                    } else if isToday {
                        Circle().fill(CalendarChrome.nowRed.opacity(0.12))
                    }
                }
        }
        .modifier(CalendarDayChipFrame(style: style))
    }

    private var dayNumberFont: Font {
        switch style {
        case .strip: CalendarChrome.Typography.stripDayNumber
        case .weekHeader: CalendarChrome.Typography.weekDayNumber
        }
    }
}

private struct CalendarDayChipFrame: ViewModifier {
    let style: CalendarDayChipLabel.Style

    func body(content: Content) -> some View {
        switch style {
        case .strip:
            content.frame(width: CalendarChrome.stripChipWidth)
        case .weekHeader:
            content.frame(maxWidth: .infinity, maxHeight: .infinity)
        }
    }
}

/// Compact event tile used in week/day time grids.
struct CalendarEventBlockLabel: View {
    let title: String
    let subtitle: String?
    let color: Color
    let height: CGFloat
    var emphasized: Bool = false

    private var verticalPadding: CGFloat { height < 28 ? 2 : 4 }
    private var horizontalPadding: CGFloat { height < 28 ? 3 : 5 }
    private var titleFont: Font {
        height < 26
            ? CalendarChrome.Typography.eventTitleCompact
            : CalendarChrome.Typography.eventTitle
    }

    private var titleLineLimit: Int {
        let reserved = verticalPadding * 2 + (subtitle == nil || height < 44 ? 0 : 14)
        let linePitch: CGFloat = height < 26 ? 11 : 13
        return max(1, Int(floor((height - reserved) / linePitch)))
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 1) {
            Text(title)
                .font(titleFont)
                .foregroundStyle(.white)
                .lineLimit(titleLineLimit)
                .minimumScaleFactor(0.72)
                .allowsTightening(true)
                .truncationMode(.tail)

            if let subtitle, height >= 44, titleLineLimit >= 2 {
                Text(subtitle)
                    .font(CalendarChrome.Typography.eventSubtitle)
                    .foregroundStyle(.white.opacity(0.88))
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .padding(.horizontal, horizontalPadding)
        .padding(.vertical, verticalPadding)
        .background(
            RoundedRectangle(cornerRadius: CalendarChrome.eventCornerRadius, style: .circular)
                .fill(color.opacity(0.92))
        )
        .overlay {
            RoundedRectangle(cornerRadius: CalendarChrome.eventCornerRadius, style: .circular)
                .stroke(emphasized ? Color.primary.opacity(0.35) : Color.clear, lineWidth: 2)
        }
    }
}
