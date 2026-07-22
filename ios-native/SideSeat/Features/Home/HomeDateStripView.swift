import SwiftUI

/// Single Home date navigator shared by Week / Day / List.
/// Selection uses accent; today / now markers use `calendarNow` — never the same role.
struct HomeDateStripView: View {
    @Binding var selectedDate: Date
    var onOpenDay: ((Date) -> Void)? = nil

    private let calendar = Calendar.sideSeatBerlin
    private let leadingDays = 21
    private let trailingDays = 42

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
            .task(id: Self.dayID(selectedDate, calendar: calendar)) {
                await Task.yield()
                withAnimation(.easeInOut(duration: 0.22)) {
                    proxy.scrollTo(Self.dayID(selectedDate, calendar: calendar), anchor: .center)
                }
            }
        }
    }

    private func dayChip(_ day: Date) -> some View {
        let selected = calendar.isDate(day, inSameDayAs: selectedDate)
        let isToday = calendar.isDateInToday(day)

        return Button {
            selectedDate = day
        } label: {
            CalendarDayChipLabel(
                day: day,
                selected: selected,
                isToday: isToday,
                style: .strip,
                calendar: calendar
            )
        }
        .buttonStyle(.plain)
        .accessibilityLabel(day.formatted(date: .complete, time: .omitted))
        .accessibilityAddTraits(selected ? .isSelected : [])
        .accessibilityIdentifier("home-date-\(Self.dayID(day, calendar: calendar))")
        .simultaneousGesture(
            TapGesture(count: 2).onEnded {
                onOpenDay?(day)
            }
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
