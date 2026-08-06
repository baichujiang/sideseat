import SwiftUI

/// Apple-style all-day strip above the timed grid (day or a single week column).
struct CalendarAllDayBand: View {
    let items: [HomeAgendaItem]
    let onOpen: (HomeAgendaItem) -> Void
    var onLongPress: ((HomeAgendaItem) -> Void)? = nil

    var body: some View {
        if items.isEmpty {
            EmptyView()
        } else {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 6) {
                    ForEach(items) { item in
                        let color = CalendarChrome.eventColor(for: item)
                        HStack(spacing: 5) {
                            if let symbol = CalendarChrome.eventContextSymbol(for: item) {
                                Image(systemName: symbol)
                                    .font(.caption2.weight(.semibold))
                            }
                            Text(item.title)
                                .font(.caption.weight(.semibold))
                                .lineLimit(1)
                                .minimumScaleFactor(0.8)
                        }
                        .foregroundStyle(SideSeatTheme.textPrimary)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 5)
                        .background(color.opacity(item.context == .publicPlan ? 0.2 : 0.14))
                        .clipShape(Capsule(style: .continuous))
                        .overlay {
                            Capsule(style: .continuous)
                                .stroke(color.opacity(0.5), lineWidth: 0.75)
                        }
                        .contentShape(Capsule(style: .continuous))
                        .calendarTapOrLongPress(
                            onTap: { onOpen(item) },
                            onLongPress: { onLongPress?(item) }
                        )
                        .accessibilityElement(children: .combine)
                        .accessibilityAddTraits(.isButton)
                        .accessibilityIdentifier("calendar-all-day-\(item.id)")
                        .accessibilityHint("Opens event details. Long press for more actions.")
                    }
                }
                .padding(.horizontal, 4)
                .padding(.vertical, 4)
            }
            .accessibilityIdentifier("calendar-all-day-band")
        }
    }
}
