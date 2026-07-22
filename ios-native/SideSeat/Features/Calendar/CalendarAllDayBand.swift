import SwiftUI

/// Apple-style all-day strip above the timed grid (day or a single week column).
struct CalendarAllDayBand: View {
    let items: [HomeAgendaItem]
    let onOpen: (HomeAgendaItem) -> Void

    var body: some View {
        if items.isEmpty {
            EmptyView()
        } else {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 6) {
                    ForEach(items) { item in
                        Button {
                            onOpen(item)
                        } label: {
                            Text(item.title)
                                .font(.caption.weight(.semibold))
                                .foregroundStyle(.white)
                                .lineLimit(1)
                                .minimumScaleFactor(0.8)
                                .padding(.horizontal, 8)
                                .padding(.vertical, 5)
                                .background(
                                    Capsule(style: .continuous)
                                        .fill(CalendarChrome.eventColor(for: item).opacity(0.92))
                                )
                        }
                        .buttonStyle(.plain)
                        .accessibilityIdentifier("calendar-all-day-\(item.id)")
                    }
                }
                .padding(.horizontal, 4)
                .padding(.vertical, 4)
            }
            .accessibilityIdentifier("calendar-all-day-band")
        }
    }
}
