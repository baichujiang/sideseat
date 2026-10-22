import SwiftUI

struct FinalTimeControls: View {
    let poll: NativeTimePoll
    @Binding var range: TimePollFinalRange?

    var body: some View {
        if let range {
            HStack {
                Menu {
                    ForEach(poll.dates, id: \.self) { date in
                        Button(timePollDateLabel(date).replacingOccurrences(of: "\n", with: " ")) {
                            self.range = range.onDay(date, timeZone: poll.timeZone, slots: poll.slots) ?? range
                        }.accessibilityIdentifier("time-poll-final-date-" + date)
                    }
                } label: {
                    Label(timePollDateLabel(range.date).replacingOccurrences(of: "\n", with: " "), systemImage: "calendar")
                        .font(.caption)
                }.buttonStyle(SSActionButtonStyle(size: .compact)).accessibilityIdentifier("time-poll-final-date")
                Spacer(minLength: 4)
                Text(String(format: AppLocalization.string("%d min"), Int(range.duration / 60)))
                    .font(.caption2).foregroundStyle(SideSeatTheme.textSecondaryStrong)
                Button { self.range = nil } label: {
                    Image(systemName: "xmark.circle").frame(width: 44, height: 44)
                }.buttonStyle(SSActionButtonStyle(horizontalPadding: 0, size: .icon)).accessibilityLabel("Clear final time").accessibilityIdentifier("time-poll-reset-final")
            }
            HStack(spacing: SideSeatTheme.spaceSM) {
                clockMenu(range, start: true)
                Image(systemName: "arrow.right").font(.caption).accessibilityHidden(true)
                clockMenu(range, start: false)
            }
        } else {
            Text("Tap the timetable to place a time block.")
                .font(.caption).foregroundStyle(SideSeatTheme.textSecondaryStrong)
                .accessibilityIdentifier("time-poll-final-heading")
        }
    }

    private func clock(_ date: Date, end: Bool = false) -> String {
        let text = timePollClockFormatter(poll.timeZone).string(from: date)
        return end && text == "00:00" ? "24:00" : text
    }

    private func clockMenu(_ range: TimePollFinalRange, start: Bool) -> some View {
        let slots = poll.slots.filter { $0.date == range.date }
        let options = start ? slots.map(\.start).filter { $0 < range.end } : slots.map(\.end).filter { $0 > range.start }
        return Menu {
            ForEach(options, id: \.self) { date in
                Button(clock(date, end: !start)) {
                    self.range = TimePollFinalRange.validated(date: range.date, start: start ? date : range.start,
                                                             end: start ? range.end : date, slots: poll.slots) ?? range
                }.accessibilityIdentifier("time-poll-final-" + (start ? "start-" : "end-") + clock(date, end: !start))
            }
        } label: {
            VStack(alignment: .leading, spacing: 2) {
                Text(LocalizedStringKey(start ? "Starts" : "Ends")).font(.caption2).foregroundStyle(SideSeatTheme.textSecondaryStrong)
                HStack {
                    Text(clock(start ? range.start : range.end, end: !start)).font(.subheadline.weight(.semibold).monospacedDigit()).lineLimit(1).minimumScaleFactor(0.7)
                    Spacer(minLength: 4)
                    Image(systemName: "chevron.down").font(.caption2)
                }
            }.dynamicTypeSize(...DynamicTypeSize.accessibility1)
                .padding(8).frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
                .background(SideSeatTheme.bg, in: RoundedRectangle(cornerRadius: 8))
        }.buttonStyle(SSPressButtonStyle()).ssActionOutline(cornerRadius: 8)
            .accessibilityIdentifier("time-poll-final-" + (start ? "start" : "end"))
    }
}

struct FinalTimeBlock: View {
    let start: String
    let end: String

    var body: some View {
        Rectangle().fill(SideSeatTheme.statusWarningText.opacity(0.12))
            .overlay { Rectangle().strokeBorder(SideSeatTheme.statusWarningText, lineWidth: 2) }
            .overlay(alignment: .topTrailing) { handle.padding(.trailing, 10).offset(y: -3) }
            .overlay(alignment: .bottomLeading) { handle.padding(.leading, 10).offset(y: 3) }
            .accessibilityElement(children: .ignore).accessibilityLabel("Final time")
            .accessibilityValue(start + " – " + end).accessibilityIdentifier("time-poll-final-block")
    }

    private var handle: some View {
        Capsule().fill(SideSeatTheme.statusWarningText).frame(width: 24, height: 6)
            .overlay { Capsule().strokeBorder(SideSeatTheme.surface, lineWidth: 1) }
    }
}
