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
            return AppLocalization.string( "All day")
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
    let target: HomeAgendaItem
    @Binding var selectedItem: HomeAgendaItem?
    let onCopy: (HomeAgendaItem) -> Void
    let onDuplicate: (HomeAgendaItem) -> Void
    let onDelete: (HomeAgendaItem) -> Void

    func body(content: Content) -> some View {
        SSAnchoredActionMenuTarget(
            isPresented: presentationBinding,
            sourceCornerRadius: 8,
            minimumMenuWidth: 144,
            menuAccessibilityLabel: AppLocalization.string("Event actions"),
            menuAccessibilityIdentifier: "calendar-event-context-menu"
        ) {
            content
        } actions: {
            menuActions
        }
    }

    private var presentationBinding: Binding<Bool> {
        Binding(
            get: { selectedItem?.id == target.id },
            set: { presented in
                if !presented, selectedItem?.id == target.id {
                    selectedItem = nil
                }
            }
        )
    }

    private var menuActions: [SSLongPressAction] {
        guard target.source == .event else { return [] }
        return [
            SSLongPressAction(
                id: "calendar-event-context-copy",
                title: AppLocalization.string("Copy"),
                systemImage: "doc.on.doc",
                perform: { onCopy(target) }
            ),
            SSLongPressAction(
                id: "calendar-event-context-duplicate",
                title: AppLocalization.string("Create duplicate"),
                systemImage: "plus.square.on.square",
                perform: { onDuplicate(target) }
            ),
            SSLongPressAction(
                id: "calendar-event-context-delete",
                title: AppLocalization.string("Delete event"),
                systemImage: "trash",
                role: .destructive,
                perform: { onDelete(target) }
            ),
        ]
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
        target: HomeAgendaItem,
        selectedItem: Binding<HomeAgendaItem?>,
        onCopy: @escaping (HomeAgendaItem) -> Void,
        onDuplicate: @escaping (HomeAgendaItem) -> Void,
        onDelete: @escaping (HomeAgendaItem) -> Void
    ) -> some View {
        modifier(
            CalendarItemActionsModifier(
                target: target,
                selectedItem: selectedItem,
                onCopy: onCopy,
                onDuplicate: onDuplicate,
                onDelete: onDelete
            )
        )
    }
}
