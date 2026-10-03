import SwiftUI

/// Shared visual tokens so Week / Day surfaces stay Apple Calendar–grade and consistent.
///
/// Today uses a solid blue marker; other selected dates and current-time markers
/// use Rose. The grid itself stays neutral.
enum CalendarChrome {
    struct EventHitTargetLayout: Equatable {
        let top: CGFloat
        let topInset: CGFloat
        let bottomInset: CGFloat
        let targetHeight: CGFloat
    }

    // MARK: - Grid metrics

    static let weekMinuteHeight: CGFloat = 0.94
    static let dayMinuteHeight: CGFloat = 1.08
    static let weekTimeGutter: CGFloat = 52
    static let dayTimeGutter: CGFloat = 56
    static let weekHeaderHeight: CGFloat = 56
    /// A small cap keeps the 24:00 boundary label readable without creating a
    /// fake extra scroll region after the day has ended.
    static let timelineEndCapHeight: CGFloat = 10
    /// Keep modest — system context-menu chrome already rounds the lifted preview.
    static let eventCornerRadius: CGFloat = 3
    static let nowLineThickness: CGFloat = 2.5
    static let nowGuideLineThickness: CGFloat = 1
    static let nowLineHitSlop: CGFloat = 16
    /// Keep the date header visually separate from the scrollable timetable.
    static let headerDividerThickness: CGFloat = 1
    /// Grid lines are intentionally a little heavier than a system hairline so
    /// they remain legible on high-density displays without competing with events.
    static let hourLineThickness: CGFloat = 1
    static let halfHourLineThickness: CGFloat = 0.5
    static let columnDividerThickness: CGFloat = 0.75

    // MARK: - Day chip (date strip + week headers)

    static let dayChipDiameter: CGFloat = 34
    static let stripChipWidth: CGFloat = 42
    static let stripChipSpacing: CGFloat = 8

    // MARK: - Washes & lines

    /// The jump-to-today control stays on a neutral semantic surface.
    static let todayControlFill = SideSeatTheme.fillTertiary
    static let todayAccent = SideSeatTheme.calendarToday
    /// Focused day column uses a neutral wash; today and now retain their own markers.
    static let selectedWash = SideSeatTheme.utilityAction.opacity(0.045)
    /// Calendar structure uses the adaptive system separator so the grid remains
    /// legible on both white and black canvases without competing with event cards.
    static let hourLine = SideSeatTheme.separator.opacity(0.82)
    static let halfHourLine = SideSeatTheme.separator.opacity(0.58)
    static let columnDivider = SideSeatTheme.separator.opacity(0.65)
    static let headerDivider = SideSeatTheme.separator.opacity(0.96)
    /// Readable brand Rose for the current-time line.
    static let nowAccent = SideSeatTheme.calendarNow
    /// A quieter continuation of the current-time line across non-today columns.
    static let nowGuideLine = SideSeatTheme.calendarNow.opacity(0.32)
    /// Solid adaptive Rose surface for the current-time badge.
    static let nowBadgeFill = SideSeatTheme.calendarNowFill

    // MARK: - Typography

    enum Typography {
        static let weekday = Font.caption2.weight(.semibold)
        static let stripDayNumber = Font.body.weight(.semibold)
        static let weekDayNumber = Font.title3.weight(.semibold)
        static let hourRail = Font.caption2.monospacedDigit()
        static let allDayLabel = Font.caption2.weight(.semibold)
        static let nowBadge = Font.system(size: 10, weight: .semibold, design: .rounded)
        static let eventTitle = Font.caption.weight(.semibold)
        static let eventTitleCompact = Font.caption2.weight(.semibold)
        static let eventSubtitle = Font.caption2.monospacedDigit()
    }

    // MARK: - Selection vs today colors

    static func weekdayForeground(selected: Bool, isToday: Bool) -> Color {
        if isToday { return todayAccent }
        if selected { return SideSeatTheme.textPrimary }
        return SideSeatTheme.textSecondaryStrong
    }

    static func dayNumberForeground(selected: Bool, isToday: Bool) -> Color {
        if isToday { return SideSeatTheme.onCalendarToday }
        if selected { return SideSeatTheme.ProductAction.foreground }
        return SideSeatTheme.textPrimary
    }

    static func eventColor(for item: HomeAgendaItem) -> Color {
        Color(hex: item.colorHex)
            ?? (item.source == .course ? SideSeatTheme.courseFallback : SideSeatTheme.accent)
    }

    static func eventContextSymbol(for item: HomeAgendaItem) -> String? {
        switch item.context {
        case .personal: nil
        case .plan: "calendar.badge.checkmark"
        case .shared: "person.fill"
        case .publicPlan: "person.2.fill"
        case .subscription: "link"
        case .course: "book.closed.fill"
        }
    }

    static func eventContextLabel(for item: HomeAgendaItem) -> LocalizedStringKey {
        switch item.context {
        case .personal: "Personal"
        case .plan: "Plan"
        case .shared: "Shared"
        case .publicPlan: "Community event"
        case .subscription: "Subscribed"
        case .course: "Course"
        }
    }

    /// Narrow gutters / badges cannot fit localized "上午10:45" — keep digit clock only.
    static func compactClock(_ date: Date, calendar: Calendar = .sideSeatBerlin) -> String {
        String(
            format: "%02d:%02d",
            calendar.component(.hour, from: date),
            calendar.component(.minute, from: date)
        )
    }

    static func compactTimeRange(
        from start: Date,
        to end: Date,
        calendar: Calendar = .sideSeatBerlin
    ) -> String {
        "\(compactClock(start, calendar: calendar))–\(compactClock(end, calendar: calendar))"
    }

    static func eventCardTimeLabel(
        from start: Date,
        to end: Date,
        height: CGFloat,
        availableWidth: CGFloat,
        calendar: Calendar = .sideSeatBerlin
    ) -> String? {
        guard height >= 30, availableWidth >= 40 else { return nil }
        guard height >= 44, availableWidth >= 86 else {
            return compactClock(start, calendar: calendar)
        }
        return compactTimeRange(from: start, to: end, calendar: calendar)
    }

    /// Expands short timeline events to a 44pt interaction target without changing their
    /// visible duration. Near midnight boundaries, expansion stays inside the day grid.
    static func eventHitTargetLayout(
        visualTop: CGFloat,
        visualHeight: CGFloat,
        gridHeight: CGFloat,
        minimumTargetHeight: CGFloat = 44
    ) -> EventHitTargetLayout {
        let targetHeight = max(minimumTargetHeight, visualHeight)
        let maximumTop = max(0, gridHeight - targetHeight)
        let preferredTop = visualTop - (targetHeight - visualHeight) / 2
        let top = min(max(0, preferredTop), maximumTop)
        let topInset = max(0, visualTop - top)
        let bottomInset = max(0, targetHeight - topInset - visualHeight)
        return EventHitTargetLayout(
            top: top,
            topInset: topInset,
            bottomInset: bottomInset,
            targetHeight: targetHeight
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

/// Explicit direction and count for timed events outside the viewport.
struct CalendarOffscreenEventButton: View {
    let edge: CalendarOffscreenEventEdge
    let count: Int
    let availableWidth: CGFloat
    let accessibilityIdentifier: String
    let action: () -> Void

    private var title: String {
        if count == 1 {
            return AppLocalization.string(edge == .top ? "1 event above" : "1 event below")
        }
        let key: String.LocalizationValue = edge == .top
            ? "%lld events above" : "%lld events below"
        return String(format: AppLocalization.string(key), Int64(count))
    }

    var body: some View {
        Button(action: action) {
            HStack(spacing: 6) {
                Image(systemName: edge == .top ? "arrow.up" : "arrow.down")
                    .accessibilityHidden(true)
                Text(title)
                    .multilineTextAlignment(.center)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .font(.footnote.weight(.semibold))
            .foregroundStyle(SideSeatTheme.utilityAction)
            .padding(.horizontal, 12)
            .padding(.vertical, 7)
            .background(SideSeatTheme.surface, in: Capsule())
            .overlay {
                Capsule().strokeBorder(SideSeatTheme.utilityAction.opacity(0.22), lineWidth: 1)
            }
            .shadow(color: .black.opacity(0.08), radius: 4, y: 1)
            .frame(maxWidth: availableWidth)
            .frame(minHeight: 44)
            .contentShape(Rectangle())
        }
        .buttonStyle(SSPressButtonStyle())
        .accessibilityLabel(title)
        .accessibilityHint("Scrolls to the nearest hidden event")
        .accessibilityIdentifier(accessibilityIdentifier)
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
                .accessibilityIdentifier("calendar-weekday-visual")
                .accessibilityHidden(true)

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
                .background(CalendarDateHighlight(selected: selected, isToday: isToday))
                .accessibilityIdentifier("calendar-day-number-visual")
                .accessibilityHidden(true)
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

/// Used by Month, Week and Day so today stays visible when another date is selected.
struct CalendarDateHighlight: View {
    let selected: Bool
    let isToday: Bool

    var body: some View {
        Circle()
            .fill(isToday ? CalendarChrome.todayAccent : selected ? SideSeatTheme.ProductAction.fill : .clear)
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
    var context: HomeAgendaItem.Context = .personal
    var contextSymbol: String? = nil
    var compact = false

    private var verticalPadding: CGFloat { height < 40 ? 2 : 4 }
    private var horizontalPadding: CGFloat { height < 40 ? 3 : 5 }
    private var titleFont: Font {
        height < 36
            ? CalendarChrome.Typography.eventTitleCompact
            : CalendarChrome.Typography.eventTitle
    }

    private var displaysSubtitle: Bool {
        subtitle != nil && height >= 30
    }

    private var displaysContextSymbol: Bool {
        contextSymbol != nil && height >= 26 && !(compact && displaysSubtitle && height < 44)
    }

    private var titleLineLimit: Int {
        let reserved = verticalPadding * 2 + (displaysSubtitle ? 12 : 0)
        let linePitch: CGFloat = height < 26 ? 11 : 13
        let lines = max(1, Int(floor((height - reserved) / linePitch)))
        return compact ? min(2, lines) : lines
    }

    private var backgroundOpacity: Double {
        context == .plan || context == .publicPlan ? 0.2 : 0.14
    }

    private var borderOpacity: Double {
        switch context {
        case .plan, .publicPlan: 0.58
        case .shared: 0.4
        default: 0.24
        }
    }

    var body: some View {
        HStack(spacing: 0) {
            Rectangle()
                .fill(color)
                .frame(width: context == .plan || context == .publicPlan ? 4 : 3)

            VStack(alignment: .leading, spacing: 1) {
                Text(title)
                    .font(titleFont)
                    .foregroundStyle(SideSeatTheme.textPrimary)
                    .lineLimit(titleLineLimit)
                    .truncationMode(.tail)
                    .accessibilityIdentifier("calendar-event-title-visual")
                    .accessibilityHidden(true)

                if let subtitle, displaysSubtitle {
                    Text(subtitle)
                        .font(CalendarChrome.Typography.eventSubtitle)
                        .foregroundStyle(SideSeatTheme.textSecondaryStrong)
                        .lineLimit(1)
                        .accessibilityIdentifier("calendar-event-subtitle-visual")
                        .accessibilityHidden(true)
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
            .padding(.trailing, displaysContextSymbol && !compact ? 10 : 0)
            .padding(.horizontal, horizontalPadding)
            .padding(.vertical, verticalPadding)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .background(
            RoundedRectangle(cornerRadius: CalendarChrome.eventCornerRadius, style: .circular)
                .fill(color.opacity(backgroundOpacity))
        )
        .overlay {
            RoundedRectangle(cornerRadius: CalendarChrome.eventCornerRadius, style: .circular)
                .stroke(
                    emphasized ? color : color.opacity(borderOpacity),
                    lineWidth: emphasized ? 2 : 0.75
                )
        }
        .overlay(alignment: .bottomTrailing) {
            if let contextSymbol, displaysContextSymbol {
                Image(systemName: contextSymbol)
                    .font(.system(size: compact ? 8 : 9, weight: .semibold))
                    .foregroundStyle(color)
                    .padding(compact ? 3 : 4)
                    .accessibilityHidden(true)
            }
        }
    }
}


/// Shared bottom-toolbar navigation action for all calendar modes.
struct CalendarTodayButton: View {
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Text("Today")
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(SideSeatTheme.textPrimary)
                .padding(.horizontal, 16)
                .frame(minWidth: 64, minHeight: 36)
                .background(CalendarChrome.todayControlFill, in: Capsule())
                .overlay {
                    Capsule().strokeBorder(SideSeatTheme.separator.opacity(0.32), lineWidth: 0.5)
                }
                .frame(minHeight: 44)
                .contentShape(Rectangle())
        }
        .buttonStyle(SSPressButtonStyle())
        .fixedSize(horizontal: true, vertical: false)
        .accessibilityIdentifier("home-jump-today")
    }
}

/// Neutral utility icon beside the calendar mode selector.
struct CalendarAddEventButton: View {
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    let isEnabled: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Image(systemName: "plus")
                .font(.system(size: 16, weight: .semibold))
                .foregroundStyle(SideSeatTheme.textPrimary)
                .frame(width: 44, height: 44)
                .background {
                    RoundedRectangle(cornerRadius: 9, style: .continuous)
                        .fill(SideSeatTheme.fillTertiary)
                        .frame(height: dynamicTypeSize.isAccessibilitySize ? 44 : 34)
                }
                .overlay {
                    RoundedRectangle(cornerRadius: 9, style: .continuous)
                        .strokeBorder(SideSeatTheme.separator.opacity(0.22), lineWidth: 0.5)
                        .frame(height: dynamicTypeSize.isAccessibilitySize ? 44 : 34)
                }
                .contentShape(Rectangle())
        }
        .buttonStyle(SSPressButtonStyle())
        .accessibilityLabel("Add event")
        .accessibilityIdentifier("new-event")
        .disabled(!isEnabled)
    }
}
