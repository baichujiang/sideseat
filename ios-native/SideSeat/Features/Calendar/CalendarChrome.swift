import SwiftUI

/// Shared visual tokens so Week / Day surfaces stay Apple Calendar–grade and consistent.
///
/// Selection uses a bright Rose fill; today / current-time markers use the adaptive
/// ``SideSeatTheme/calendarNow`` Rose. The grid itself stays neutral.
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

    /// Today controls stay on a neutral semantic surface; the Rose foreground carries meaning.
    static let todayControlFill = SideSeatTheme.fillTertiary
    /// The floating create action uses one restrained Rose family in both appearances instead
    /// of combining a neutral gray surface with an unrelated Rose symbol. The dark fill remains
    /// low-luminance so it reads as an elevated control without becoming a glowing color block.
    static let createActionFill = Color(
        uiColor: UIColor { traits in
            return UIColor(SideSeatTheme.accent)
                .resolvedColor(with: traits)
                .withAlphaComponent(traits.userInterfaceStyle == .dark ? 0.26 : 0.28)
        }
    )
    static let createActionBorder = Color(
        uiColor: UIColor { traits in
            return UIColor(SideSeatTheme.accentText)
                .resolvedColor(with: traits)
                .withAlphaComponent(traits.userInterfaceStyle == .dark ? 0.30 : 0.24)
        }
    )
    static let createActionForeground = SideSeatTheme.accentText
    /// Focused day column in week grid — accent, not now-red.
    static let selectedWash = SideSeatTheme.accent.opacity(0.045)
    /// Calendar structure uses the adaptive system separator so the grid remains
    /// legible on both white and black canvases without competing with event cards.
    static let hourLine = SideSeatTheme.separator.opacity(0.82)
    static let halfHourLine = SideSeatTheme.separator.opacity(0.58)
    static let columnDivider = SideSeatTheme.separator.opacity(0.65)
    static let headerDivider = SideSeatTheme.separator.opacity(0.96)
    /// Readable brand Rose for today labels and the current-time line.
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
        if selected { return SideSeatTheme.textPrimary }
        if isToday { return nowAccent }
        return SideSeatTheme.textSecondaryStrong
    }

    static func dayNumberForeground(selected: Bool, isToday: Bool) -> Color {
        if selected { return .white }
        if isToday { return nowAccent }
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

/// A quiet, category-colored edge cue for a timed event outside the viewport.
/// The visible bar stays small while its button keeps a full 44-point hit target.
struct CalendarOffscreenEventBar: View {
    let edge: CalendarOffscreenEventEdge
    let color: Color
    let availableWidth: CGFloat
    let accessibilityIdentifier: String
    let action: () -> Void

    private var barWidth: CGFloat {
        min(36, max(20, availableWidth - 12))
    }

    private var barAlignment: Alignment {
        edge == .top ? .top : .bottom
    }

    private var accessibilityLabel: LocalizedStringKey {
        switch edge {
        case .top: "An earlier event is outside the visible timeline"
        case .bottom: "A later event is outside the visible timeline"
        }
    }

    var body: some View {
        Button(action: action) {
            Capsule(style: .continuous)
                .fill(color)
                .frame(width: barWidth, height: 3)
                .overlay {
                    Capsule(style: .continuous)
                        .stroke(SideSeatTheme.textPrimary.opacity(0.2), lineWidth: 0.5)
                }
                .shadow(color: SideSeatTheme.bg.opacity(0.9), radius: 1.5)
                .frame(
                    width: max(1, availableWidth),
                    height: 44,
                    alignment: barAlignment
                )
                .contentShape(Rectangle())
        }
        .buttonStyle(SSPressButtonStyle())
        .accessibilityLabel(Text(accessibilityLabel))
        .accessibilityHint("Scrolls to the event")
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
                .background {
                    if selected {
                        Circle().fill(SideSeatTheme.accent)
                    } else if isToday {
                        Circle().fill(CalendarChrome.nowAccent.opacity(0.12))
                    }
                }
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
