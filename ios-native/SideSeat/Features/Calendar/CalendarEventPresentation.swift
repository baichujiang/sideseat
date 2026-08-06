import SwiftUI

/// Expanded event presentation for Agenda rows. Week and Day use the compact
/// block label, while this keeps the same color, source icon and type hierarchy.
struct CalendarAgendaRowLabel: View {
    let item: HomeAgendaItem
    let renderedDay: Date

    private let calendar = Calendar.sideSeatBerlin

    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            VStack(alignment: .trailing, spacing: 2) {
                Text(startLabel)
                    .font(.subheadline.weight(.semibold))
                    .monospacedDigit()
                    .foregroundStyle(SideSeatTheme.textPrimary)
                Text(endLabel)
                    .font(.caption)
                    .monospacedDigit()
                    .foregroundStyle(SideSeatTheme.textSecondary)
            }
            .frame(width: 48, alignment: .trailing)

            Capsule()
                .fill(color)
                .frame(width: item.context == .publicPlan ? 4 : 3, height: 48)

            VStack(alignment: .leading, spacing: 4) {
                HStack(alignment: .firstTextBaseline, spacing: 6) {
                    Text(item.title)
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(SideSeatTheme.textPrimary)
                        .lineLimit(2)
                        .multilineTextAlignment(.leading)

                    Spacer(minLength: 4)

                    if let symbol = CalendarChrome.eventContextSymbol(for: item) {
                        Image(systemName: symbol)
                            .font(.caption2.weight(.semibold))
                            .foregroundStyle(color)
                            .accessibilityLabel(CalendarChrome.eventContextLabel(for: item))
                    }
                }

                if let location = item.location?.trimmingCharacters(in: .whitespacesAndNewlines),
                   !location.isEmpty
                {
                    Label(location, systemImage: "mappin.and.ellipse")
                        .font(.caption)
                        .foregroundStyle(SideSeatTheme.textSecondary)
                        .lineLimit(1)
                } else if let socialSummary {
                    Label(socialSummary, systemImage: "person.2")
                        .font(.caption)
                        .foregroundStyle(SideSeatTheme.textSecondary)
                        .lineLimit(1)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 10)
        .background {
            RoundedRectangle(cornerRadius: 6, style: .continuous)
                .fill(color.opacity(item.context == .publicPlan ? 0.09 : 0.055))
        }
        .overlay {
            RoundedRectangle(cornerRadius: 6, style: .continuous)
                .stroke(color.opacity(0.12), lineWidth: 0.75)
        }
        .contentShape(Rectangle())
        .accessibilityElement(children: .combine)
    }

    private var color: Color {
        CalendarChrome.eventColor(for: item)
    }

    private var dayInterval: DateInterval? {
        calendar.dateInterval(of: .day, for: renderedDay)
    }

    private var startLabel: String {
        guard !item.isAllDayStyle(on: renderedDay, calendar: calendar) else {
            return String(localized: "All day")
        }
        guard let dayInterval, item.start < dayInterval.start else {
            return CalendarChrome.compactClock(item.start)
        }
        return "00:00"
    }

    private var endLabel: String {
        guard !item.isAllDayStyle(on: renderedDay, calendar: calendar) else { return "" }
        guard let dayInterval, item.end >= dayInterval.end else {
            return CalendarChrome.compactClock(item.end)
        }
        return "24:00"
    }

    private var socialSummary: String? {
        if !item.participantNames.isEmpty {
            let visible = item.participantNames.prefix(2).joined(separator: ", ")
            let remaining = item.participantNames.count - min(2, item.participantNames.count)
            return remaining > 0 ? "\(visible) +\(remaining)" : visible
        }
        return item.withLabel
    }
}

private struct CalendarItemActionsModifier: ViewModifier {
    @Binding var item: HomeAgendaItem?
    let onOpen: (HomeAgendaItem) -> Void
    let onEdit: (HomeAgendaItem) -> Void
    let onCopy: (HomeAgendaItem) -> Void
    let onDuplicate: (HomeAgendaItem) -> Void
    let onStartMove: (HomeAgendaItem) -> Void
    let moveAccessibilityIdentifier: String

    func body(content: Content) -> some View {
        content.confirmationDialog(
            item?.title ?? "",
            isPresented: Binding(
                get: { item != nil },
                set: { if !$0 { item = nil } }
            ),
            titleVisibility: .visible,
            presenting: item
        ) { selected in
            Button("View details") {
                onOpen(selected)
            }

            if selected.source == .event {
                Button("Edit event") {
                    onEdit(selected)
                }
                Button("Copy") {
                    onCopy(selected)
                }
                Button("Duplicate after event") {
                    onDuplicate(selected)
                }
                Button("Move event") {
                    onStartMove(selected)
                }
                .accessibilityIdentifier(moveAccessibilityIdentifier)
            }

            Button("Cancel", role: .cancel) {}
        }
    }
}

private struct CalendarTapOrLongPressModifier: ViewModifier {
    let minimumDuration: Double
    let onTap: () -> Void
    let onLongPress: () -> Void

    func body(content: Content) -> some View {
        let tap = TapGesture().onEnded(onTap)
        let longPress = LongPressGesture(minimumDuration: minimumDuration)
            .onEnded { completed in
                guard completed else { return }
                onLongPress()
            }

        content.gesture(tap.exclusively(before: longPress))
    }
}

extension View {
    /// Keeps a completed long press from also firing the card's tap action.
    func calendarTapOrLongPress(
        minimumDuration: Double = 0.45,
        onTap: @escaping () -> Void,
        onLongPress: @escaping () -> Void
    ) -> some View {
        modifier(
            CalendarTapOrLongPressModifier(
                minimumDuration: minimumDuration,
                onTap: onTap,
                onLongPress: onLongPress
            )
        )
    }

    func calendarItemActions(
        item: Binding<HomeAgendaItem?>,
        onOpen: @escaping (HomeAgendaItem) -> Void,
        onEdit: @escaping (HomeAgendaItem) -> Void,
        onCopy: @escaping (HomeAgendaItem) -> Void,
        onDuplicate: @escaping (HomeAgendaItem) -> Void,
        onStartMove: @escaping (HomeAgendaItem) -> Void,
        moveAccessibilityIdentifier: String
    ) -> some View {
        modifier(
            CalendarItemActionsModifier(
                item: item,
                onOpen: onOpen,
                onEdit: onEdit,
                onCopy: onCopy,
                onDuplicate: onDuplicate,
                onStartMove: onStartMove,
                moveAccessibilityIdentifier: moveAccessibilityIdentifier
            )
        )
    }
}
