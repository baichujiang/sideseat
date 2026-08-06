import SwiftUI

/// A multi-day agenda. It shares event semantics with Week and Day while using
/// a denser, scan-first layout instead of recreating a time grid.
struct CalendarAgendaListView: View {
    let schedule: NativeHomeSchedule?
    let startDate: Date
    let isLoading: Bool
    let issue: String?
    let onRetry: () -> Void
    let onOpenDay: (Date) -> Void
    let onOpen: (HomeAgendaItem, Date) -> Void
    let onEdit: (HomeAgendaItem) -> Void
    let onCopy: (HomeAgendaItem) -> Void
    let onDuplicate: (HomeAgendaItem) -> Void
    let onStartMove: (HomeAgendaItem) -> Void
    let onCreate: (Date) -> Void

    @State private var actionItem: HomeAgendaItem?
    @State private var actionRenderedDay: Date?

    private let calendar = Calendar.sideSeatBerlin
    private let dayCount = HomeAgendaWindow.defaultDayCount

    private var sections: [HomeAgendaSection] {
        schedule?.agendaSections(
            startingAt: startDate,
            dayCount: dayCount,
            calendar: calendar
        ) ?? []
    }

    var body: some View {
        Group {
            if let issue, schedule == nil {
                ContentUnavailableView {
                    Label("Could not load schedule", systemImage: "wifi.exclamationmark")
                } description: {
                    Text(issue)
                } actions: {
                    Button("Try again", action: onRetry)
                        .buttonStyle(.borderedProminent)
                }
            } else if isLoading, schedule == nil {
                SSLoadingState("Loading schedule")
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if sections.isEmpty {
                SSEmptyState(
                    title: "No upcoming events",
                    systemImage: "calendar",
                    description: "The next 14 days are open.",
                    actionTitle: String(localized: "New event"),
                    actionAccessibilityID: "agenda-empty-new-event"
                ) {
                    onCreate(startDate)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .padding(.horizontal, 20)
            } else {
                agendaScrollView
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(SideSeatTheme.bg)
        .calendarItemActions(
            item: $actionItem,
            onOpen: { selected in
                onOpen(selected, actionRenderedDay ?? selected.start)
            },
            onEdit: onEdit,
            onCopy: onCopy,
            onDuplicate: onDuplicate,
            onStartMove: onStartMove,
            moveAccessibilityIdentifier: "agenda-event-context-move"
        )
        .accessibilityIdentifier("calendar-agenda-list")
    }

    private var agendaScrollView: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 14, pinnedViews: [.sectionHeaders]) {
                HStack(spacing: 8) {
                    Image(systemName: "list.bullet")
                        .foregroundStyle(SideSeatTheme.accent)
                    Text("Next 14 days")
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(SideSeatTheme.textPrimary)
                    Spacer(minLength: 0)
                    if isLoading {
                        ProgressView()
                            .controlSize(.small)
                    }
                }
                .padding(.horizontal, 4)
                .padding(.bottom, 2)

                ForEach(sections) { section in
                    Section {
                        VStack(spacing: 6) {
                            ForEach(section.items) { item in
                                CalendarAgendaRowLabel(item: item, renderedDay: section.day)
                                    .calendarTapOrLongPress(
                                        onTap: { onOpen(item, section.day) },
                                        onLongPress: {
                                            actionRenderedDay = section.day
                                            actionItem = item
                                        }
                                    )
                                    .accessibilityElement(children: .combine)
                                    .accessibilityAddTraits(.isButton)
                                    .accessibilityIdentifier(rowAccessibilityID(for: item, day: section.day))
                                    .accessibilityHint("Opens event details. Long press for more actions.")
                            }
                        }
                    } header: {
                        Button {
                            onOpenDay(section.day)
                        } label: {
                            HStack(spacing: 8) {
                                Text(dayHeading(section.day))
                                    .font(.headline)
                                    .foregroundStyle(
                                        calendar.isDateInToday(section.day)
                                            ? CalendarChrome.nowRed
                                            : SideSeatTheme.textPrimary
                                    )
                                Spacer(minLength: 0)
                                Image(systemName: "chevron.right")
                                    .font(.caption.weight(.semibold))
                                    .foregroundStyle(SideSeatTheme.textSecondary)
                            }
                            .padding(.horizontal, 4)
                            .padding(.vertical, 7)
                            .background(SideSeatTheme.bg)
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel(
                            String(
                                format: String(localized: "Open day %@"),
                                section.day.formatted(date: .complete, time: .omitted)
                            )
                        )
                        .accessibilityIdentifier("agenda-day-\(dayID(section.day))")
                    }
                }
            }
            .padding(.horizontal, 16)
            .padding(.bottom, 28)
        }
        .scrollIndicators(.hidden)
    }

    private func dayHeading(_ day: Date) -> String {
        if calendar.isDateInToday(day) {
            return String(localized: "Today")
        }
        return day.formatted(.dateTime.weekday(.wide).month(.abbreviated).day())
    }

    private func rowAccessibilityID(for item: HomeAgendaItem, day: Date) -> String {
        let base = item.source == .event ? "agenda-event-\(item.id)" : "agenda-item-\(item.id)"
        guard calendar.isDate(item.start, inSameDayAs: day) else {
            return "\(base)-continuation-\(dayID(day))"
        }
        return base
    }

    private func dayID(_ day: Date) -> String {
        let components = calendar.dateComponents([.year, .month, .day], from: day)
        return String(
            format: "%04d-%02d-%02d",
            components.year ?? 0,
            components.month ?? 0,
            components.day ?? 0
        )
    }
}
