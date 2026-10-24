import SwiftUI

struct FinalTimeControls: View {
    let slots: [NativeTimePoll.Slot]
    let timeZone: String
    @Binding var selection: Set<Int>

    var body: some View {
        let range = TimePollFinalRange.selected(selection, slots: slots)
        HStack(alignment: .center, spacing: SideSeatTheme.spaceSM) {
            VStack(alignment: .leading, spacing: 4) {
                if let range {
                    Text(summary(range))
                        .font(.subheadline.weight(.semibold))
                        .accessibilityLabel(unifiedPlanTimeLabel(start: range.start, end: range.end, timeZone: timeZone))
                        .accessibilityIdentifier("time-poll-final-summary")
                    Text(Duration.seconds(range.duration).formatted(.units(allowed: [.hours, .minutes], width: .abbreviated).locale(AppLocalization.selectedLanguage.locale)))
                        .font(.caption).foregroundStyle(SideSeatTheme.textSecondaryStrong)
                } else {
                    Text(selection.isEmpty ? "Tap or drag to select the final time." : "Keep one continuous period. Fill the gap or deselect extra times.")
                        .font(.caption).foregroundStyle(selection.isEmpty ? SideSeatTheme.textSecondaryStrong : SideSeatTheme.statusWarningText)
                        .accessibilityIdentifier(selection.isEmpty ? "time-poll-final-heading" : "time-poll-final-gap")
                }
            }.frame(maxWidth: .infinity, alignment: .leading)
            if !selection.isEmpty {
                Button { selection = [] } label: { Image(systemName: "xmark").frame(width: 44, height: 44) }
                    .buttonStyle(SSActionButtonStyle(horizontalPadding: 0, size: .icon))
                    .accessibilityLabel("Clear final time").accessibilityIdentifier("time-poll-reset-final")
            }
        }.dynamicTypeSize(...DynamicTypeSize.accessibility1)
    }

    private func summary(_ range: TimePollFinalRange) -> String {
        let zone = TimeZone(identifier: timeZone) ?? .current
        var calendar = Calendar(identifier: .gregorian); calendar.timeZone = zone
        let currentYear = calendar.component(.year, from: Date())
        let includesYear = calendar.component(.year, from: range.start) != currentYear
            || calendar.component(.year, from: range.end) != currentYear
        let date = DateIntervalFormatter()
        date.locale = AppLocalization.selectedLanguage.locale; date.timeZone = zone
        date.dateTemplate = includesYear ? "yMMMd" : "MMMd"
        let clock = timePollClockFormatter(timeZone)
        return date.string(from: range.start, to: range.end) + " · "
            + clock.string(from: range.start) + "–" + clock.string(from: range.end)
    }
}
