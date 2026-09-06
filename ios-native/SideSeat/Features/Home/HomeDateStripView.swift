import SwiftUI

/// Compact date navigator for Day. Week and Month provide their own date chrome.
/// Selection uses a filled accent; today / now markers reuse the Rose family with a different shape.
struct HomeDateStripView: View {
    @Binding var selectedDate: Date
    let itemsByDay: [Date: [HomeAgendaItem]]
    var recenterToken: String
    var onOpenDay: ((Date) -> Void)?

    private let calendar = Calendar.sideSeatBerlin
    private let leadingDays = 21
    private let trailingDays = 42

    init(
        selectedDate: Binding<Date>,
        itemsByDay: [Date: [HomeAgendaItem]] = [:],
        recenterToken: String = "",
        onOpenDay: ((Date) -> Void)? = nil
    ) {
        _selectedDate = selectedDate
        self.itemsByDay = itemsByDay
        self.recenterToken = recenterToken
        self.onOpenDay = onOpenDay
    }

    var body: some View {
        let days = Self.days(
            around: selectedDate,
            leading: leadingDays,
            trailing: trailingDays,
            calendar: calendar
        )

        ScrollViewReader { proxy in
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: CalendarChrome.stripChipSpacing) {
                    ForEach(days, id: \.self) { day in
                        dayChip(day)
                            .id(Self.dayID(day, calendar: calendar))
                    }
                }
                .padding(.horizontal, SideSeatTheme.spaceSM)
                .padding(.vertical, 6)
            }
            .accessibilityIdentifier("home-date-strip")
            .task(id: scrollRequestID) {
                await Task.yield()
                guard !Task.isCancelled else { return }
                var transaction = Transaction()
                transaction.disablesAnimations = true
                withTransaction(transaction) {
                    proxy.scrollTo(
                        Self.dayID(selectedDate, calendar: calendar),
                        anchor: .center
                    )
                }
            }
        }
    }

    private var scrollRequestID: String {
        "\(recenterToken)|\(Self.dayID(selectedDate, calendar: calendar))"
    }

    private func dayChip(_ day: Date) -> some View {
        let dayStart = calendar.startOfDay(for: day)
        let items = itemsByDay[dayStart] ?? []
        let selected = calendar.isDate(day, inSameDayAs: selectedDate)
        let isToday = calendar.isDateInToday(day)

        return Button {
            selectedDate = day
        } label: {
            VStack(spacing: 2) {
                CalendarDayChipLabel(
                    day: day,
                    selected: selected,
                    isToday: isToday,
                    style: .strip,
                    calendar: calendar
                )

                CalendarEventDots(items: items)
            }
        }
        .buttonStyle(SSPressButtonStyle())
        .accessibilityLabel(day.formatted(date: .complete, time: .omitted))
        .accessibilityValue(eventCountLabel(items.count))
        .accessibilityAddTraits(selected ? .isSelected : [])
        .accessibilityIdentifier("home-date-\(Self.dayID(day, calendar: calendar))")
        .simultaneousGesture(
            TapGesture(count: 2).onEnded {
                onOpenDay?(day)
            }
        )
    }

    private func eventCountLabel(_ count: Int) -> String {
        guard count > 0 else { return AppLocalization.string("No events") }
        return String(
            format: AppLocalization.string("%lld events"),
            Int64(count)
        )
    }

    static func days(
        around focus: Date,
        leading: Int,
        trailing: Int,
        calendar: Calendar
    ) -> [Date] {
        let origin = calendar.startOfDay(for: focus)
        guard let start = calendar.date(byAdding: .day, value: -leading, to: origin) else {
            return [origin]
        }
        return (0...(leading + trailing)).compactMap {
            calendar.date(byAdding: .day, value: $0, to: start)
        }
    }

    static func dayID(_ day: Date, calendar: Calendar) -> String {
        let components = calendar.dateComponents([.year, .month, .day], from: day)
        return String(
            format: "%04d-%02d-%02d",
            components.year ?? 0,
            components.month ?? 0,
            components.day ?? 0
        )
    }
}

/// Month-scale calendar navigation. The grid answers "when" while the compact
/// agenda beneath it answers "what", keeping Month distinct from the 14-day list.
struct HomeMonthCalendarView: View {
    @Binding var selectedDate: Date
    let itemsByDay: [Date: [HomeAgendaItem]]
    let onOpen: (HomeAgendaItem) -> Void
    let onCopy: (HomeAgendaItem) -> Void
    let onDuplicate: (HomeAgendaItem) -> Void
    let onDelete: (HomeAgendaItem) -> Void
    let onCreate: (Date) -> Void

    @State private var actionItem: HomeAgendaItem?

    private let calendar = Calendar.sideSeatBerlin
    private let columns = Array(
        repeating: GridItem(.flexible(minimum: 36), spacing: 4),
        count: 7
    )

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                monthGrid

                Divider()
                    .padding(.horizontal, 16)

                selectedDayAgenda
            }
            .padding(.bottom, 112)
        }
        .scrollIndicators(.hidden)
        .background(SideSeatTheme.bg)
        .accessibilityIdentifier("calendar-month-view")
    }

    private var monthGrid: some View {
        VStack(spacing: 8) {
            LazyVGrid(columns: columns, spacing: 0) {
                ForEach(weekdayLabels, id: \.self) { label in
                    Text(label)
                        .font(.caption2.weight(.semibold))
                        .foregroundStyle(SideSeatTheme.textSecondaryStrong)
                        .frame(maxWidth: .infinity, minHeight: 24)
                        .accessibilityHidden(true)
                }
            }

            LazyVGrid(columns: columns, spacing: 5) {
                ForEach(visibleDays, id: \.self) { day in
                    monthDayButton(day)
                }
            }
        }
        .padding(.horizontal, 16)
        .contentShape(Rectangle())
        .simultaneousGesture(monthSwipeGesture)
    }

    private func monthDayButton(_ day: Date) -> some View {
        let dayStart = calendar.startOfDay(for: day)
        let items = itemsByDay[dayStart] ?? []
        let selected = calendar.isDate(day, inSameDayAs: selectedDate)
        let isToday = calendar.isDateInToday(day)
        let inDisplayedMonth = calendar.isDate(
            day,
            equalTo: selectedDate,
            toGranularity: .month
        )

        return Button {
            withAnimation(.easeOut(duration: 0.18)) {
                selectedDate = dayStart
            }
        } label: {
            VStack(spacing: 3) {
                Text(CalendarChrome.dayNumber(day, calendar: calendar))
                    .font(.subheadline.weight(selected || isToday ? .bold : .medium))
                    .monospacedDigit()
                    .foregroundStyle(dayNumberColor(selected: selected, isToday: isToday))
                    .frame(width: 32, height: 32)
                    .background {
                        if selected {
                            Circle().fill(SideSeatTheme.accent)
                        } else if isToday {
                            Circle().fill(CalendarChrome.nowAccent.opacity(0.12))
                        }
                    }

                CalendarEventDots(items: items)
            }
            .frame(maxWidth: .infinity, minHeight: 44)
            .opacity(inDisplayedMonth ? 1 : 0.38)
            .contentShape(Rectangle())
        }
        .buttonStyle(SSPressButtonStyle())
        .accessibilityLabel(day.formatted(date: .complete, time: .omitted))
        .accessibilityValue(eventCountLabel(items.count))
        .accessibilityAddTraits(selected ? .isSelected : [])
        .accessibilityIdentifier("calendar-month-day-\(HomeDateStripView.dayID(day, calendar: calendar))")
    }

    @ViewBuilder
    private var selectedDayAgenda: some View {
        let day = calendar.startOfDay(for: selectedDate)
        let items = itemsByDay[day] ?? []

        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 8) {
                Text(day, format: .dateTime.weekday(.wide).month(.abbreviated).day())
                    .font(.headline)
                    .foregroundStyle(
                        calendar.isDateInToday(day)
                            ? CalendarChrome.nowAccent
                            : SideSeatTheme.textPrimary
                    )

                Spacer(minLength: 0)
            }

            if items.isEmpty {
                HStack(spacing: 10) {
                    Label("No events on this day", systemImage: "calendar")
                        .font(.subheadline)
                        .foregroundStyle(SideSeatTheme.textSecondary)

                    Spacer(minLength: 8)

                    Button {
                        onCreate(day)
                    } label: {
                        Image(systemName: "plus")
                            .font(.subheadline.weight(.semibold))
                            .frame(width: 44, height: 44)
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(SSPressButtonStyle())
                    .foregroundStyle(SideSeatTheme.utilityAction)
                    .accessibilityLabel("New event")
                    .accessibilityIdentifier("calendar-month-new-event")
                }
                .padding(.horizontal, 10)
                .background(
                    SideSeatTheme.fillTertiary,
                    in: RoundedRectangle(cornerRadius: 10, style: .continuous)
                )
            } else {
                LazyVStack(spacing: 6) {
                    ForEach(items) { item in
                        CalendarAgendaRowLabel(item: item, renderedDay: day)
                            .calendarTapOrLongPress(
                                onTap: { onOpen(item) },
                                onLongPress: {
                                    guard item.source == .event else { return }
                                    actionItem = item
                                }
                            )
                            .calendarItemActions(
                                target: item,
                                selectedItem: $actionItem,
                                onCopy: onCopy,
                                onDuplicate: onDuplicate,
                                onDelete: onDelete
                            )
                            .accessibilityElement(children: .ignore)
                            .accessibilityLabel(item.title)
                            .accessibilityValue(
                                "\(CalendarChrome.compactClock(item.start)) - \(CalendarChrome.compactClock(item.end))"
                            )
                            .accessibilityAddTraits(.isButton)
                            .accessibilityIdentifier("month-event-\(item.id)")
                            .accessibilityHint(
                                item.source == .event
                                    ? "Opens event details. Long press for more actions."
                                    : "Opens event details."
                            )
                    }
                }
            }
        }
        .padding(.horizontal, 16)
    }

    private var visibleDays: [Date] {
        HomeMonthGrid.visibleDays(containing: selectedDate, calendar: calendar)
    }

    private var weekdayLabels: [String] {
        guard
            let monday = calendar.date(from: DateComponents(year: 2024, month: 1, day: 1))
        else { return [] }

        return (0..<7).compactMap { offset in
            calendar.date(byAdding: .day, value: offset, to: monday)?.formatted(
                .dateTime.weekday(.narrow).locale(AppLocalization.selectedLanguage.locale)
            )
        }
    }

    private var monthSwipeGesture: some Gesture {
        DragGesture(minimumDistance: 24)
            .onEnded { value in
                let horizontal = value.translation.width
                let vertical = value.translation.height
                guard abs(horizontal) > abs(vertical) * 1.25 else { return }
                let offset = horizontal < 0 ? 1 : -1
                withAnimation(.easeOut(duration: 0.2)) {
                    selectedDate = HomeMonthGrid.shiftedSelection(
                        selectedDate,
                        by: offset,
                        calendar: calendar
                    )
                }
            }
    }

    private func dayNumberColor(selected: Bool, isToday: Bool) -> Color {
        if selected { return SideSeatTheme.onAccent }
        if isToday { return CalendarChrome.nowAccent }
        return SideSeatTheme.textPrimary
    }

    private func eventCountLabel(_ count: Int) -> String {
        guard count > 0 else { return AppLocalization.string("No events") }
        return String(
            format: AppLocalization.string("%lld events"),
            Int64(count)
        )
    }
}

/// A quiet, color-preserving event-density cue shared by Month and Day navigation.
/// Up to three events remain individual dots; larger sets show two colors plus the
/// undisplayed count while the parent control exposes the exact total.
private struct CalendarEventDots: View {
    let items: [HomeAgendaItem]

    var body: some View {
        HStack(spacing: 2) {
            ForEach(Array(items.prefix(visibleDotCount).enumerated()), id: \.offset) { _, item in
                Circle()
                    .fill(CalendarChrome.eventColor(for: item))
                    .frame(width: 4, height: 4)
            }

            if let overflowCount {
                Text(verbatim: "+\(overflowCount)")
                    .font(.system(size: 8, weight: .bold, design: .rounded))
                    .monospacedDigit()
                    .foregroundStyle(SideSeatTheme.textSecondaryStrong)
                    .frame(minWidth: 12, minHeight: 8)
            }
        }
        .frame(height: 8)
        .accessibilityHidden(true)
    }

    private var visibleDotCount: Int {
        CalendarEventMarkerLayout.visibleDotCount(for: items.count)
    }

    private var overflowCount: Int? {
        CalendarEventMarkerLayout.overflowCount(for: items.count)
    }
}

enum CalendarEventMarkerLayout {
    static func visibleDotCount(for total: Int) -> Int {
        total > 3 ? 2 : min(max(0, total), 3)
    }

    static func overflowCount(for total: Int) -> Int? {
        guard total > 3 else { return nil }
        return total - visibleDotCount(for: total)
    }
}

enum HomeMonthGrid {
    static let visibleDayCount = 42

    static func visibleDays(
        containing date: Date,
        calendar: Calendar = .sideSeatBerlin
    ) -> [Date] {
        guard let monthStart = calendar.dateInterval(of: .month, for: date)?.start else {
            return [calendar.startOfDay(for: date)]
        }
        let weekday = calendar.component(.weekday, from: monthStart)
        let leading = (weekday - calendar.firstWeekday + 7) % 7
        guard let gridStart = calendar.date(byAdding: .day, value: -leading, to: monthStart) else {
            return [monthStart]
        }
        return (0..<visibleDayCount).compactMap {
            calendar.date(byAdding: .day, value: $0, to: gridStart)
        }
    }

    static func daysInMonth(
        containing date: Date,
        calendar: Calendar = .sideSeatBerlin
    ) -> [Date] {
        guard
            let monthStart = calendar.dateInterval(of: .month, for: date)?.start,
            let dayRange = calendar.range(of: .day, in: .month, for: monthStart)
        else { return [calendar.startOfDay(for: date)] }

        return dayRange.compactMap { day in
            calendar.date(byAdding: .day, value: day - 1, to: monthStart)
        }
    }

    static func dataFocus(
        containing date: Date,
        calendar: Calendar = .sideSeatBerlin
    ) -> Date {
        guard let monthStart = calendar.dateInterval(of: .month, for: date)?.start else {
            return date
        }
        return calendar.date(byAdding: .day, value: 14, to: monthStart) ?? date
    }

    static func shiftedSelection(
        _ date: Date,
        by monthOffset: Int,
        calendar: Calendar = .sideSeatBerlin
    ) -> Date {
        guard
            let monthStart = calendar.dateInterval(of: .month, for: date)?.start,
            let targetStart = calendar.date(byAdding: .month, value: monthOffset, to: monthStart),
            let targetDayRange = calendar.range(of: .day, in: .month, for: targetStart)
        else { return date }

        let originalDay = calendar.component(.day, from: date)
        let targetDay = min(originalDay, targetDayRange.count)
        return calendar.date(byAdding: .day, value: targetDay - 1, to: targetStart) ?? targetStart
    }
}
