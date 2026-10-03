import SwiftUI

struct SmartTimeWindow: Identifiable, Hashable {
    let start: Date
    let end: Date
    var id: String { "\(start.ISO8601Format())/\(end.ISO8601Format())" }

    var dateLabel: String { datePart("MMM d EEE") }
    var monthLabel: String { datePart("MMM") }
    var dayLabel: String { datePart("d") }
    var weekdayLabel: String { datePart("EEE") }

    var durationLabel: String {
        let formatter = DateComponentsFormatter()
        var calendar = Calendar.sideSeatBerlin
        calendar.locale = AppLocalization.selectedLanguage.locale
        formatter.calendar = calendar
        formatter.allowedUnits = [.hour, .minute]
        formatter.unitsStyle = .short
        let duration = formatter.string(from: end.timeIntervalSince(start)) ?? ""
        return String(format: AppLocalization.string("%@ free"), duration)
    }

    private func datePart(_ template: String) -> String {
        let formatter = DateFormatter()
        formatter.locale = AppLocalization.selectedLanguage.locale
        formatter.timeZone = Calendar.sideSeatBerlin.timeZone
        formatter.setLocalizedDateFormatFromTemplate(template)
        return formatter.string(from: start)
    }

    var timeLabel: String {
        "\(SmartTimeFormatting.label(start, date: false, time: true)) – \(SmartTimeFormatting.label(end, date: false, time: true))"
    }

    /// Offer real free windows within morning, afternoon and evening, without a duration picker.
    static func recommendations(
        from slots: [NativeScheduleShareSlot], now: Date = Date(),
        calendar: Calendar = .sideSeatBerlin
    ) -> [Self] {
        let tomorrow = calendar.date(byAdding: .day, value: 1, to: calendar.startOfDay(for: now))!
        var merged: [DateInterval] = []
        for interval in slots.compactMap(SmartTimeMatcher.interval).sorted(by: { $0.start < $1.start }) {
            if let last = merged.last, interval.start <= last.end {
                merged[merged.count - 1] = DateInterval(start: last.start, end: max(last.end, interval.end))
            } else { merged.append(interval) }
        }
        var byDay: [[Self]] = []
        for offset in 0..<7 {
            let day = calendar.date(byAdding: .day, value: offset, to: tomorrow)!
            var windows: [Self] = []
            for hours in [9..<12, 12..<17, 17..<21] {
                let from = calendar.date(bySettingHour: hours.lowerBound, minute: 0, second: 0, of: day)!
                let until = calendar.date(bySettingHour: hours.upperBound, minute: 0, second: 0, of: day)!
                for interval in merged {
                    let start = max(from, interval.start), end = min(until, interval.end)
                    if end.timeIntervalSince(start) >= 30 * 60 { windows.append(.init(start: start, end: end)) }
                }
            }
            // Start with different parts of the day when several equally free windows exist.
            if !windows.isEmpty {
                let index = offset % windows.count
                byDay.append(Array(windows[index...]) + Array(windows[..<index]))
            }
        }
        // A first group spanning several dates is more useful than three windows on one day.
        return (0..<(byDay.map(\.count).max() ?? 0)).flatMap { index in
            byDay.compactMap { index < $0.count ? $0[index] : nil }
        }
    }
}

struct SmartTimeSuggestionSheet: View {
    @Environment(SessionStore.self) private var session
    @Environment(\.dismiss) private var dismiss
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    var activityTitle: String? = nil
    let onSelect: (SmartTimeWindow) -> Void
    @State private var availability = SmartTimeAvailabilityStore()
    @State private var offset = 0

    private var windows: [SmartTimeWindow] {
        SmartTimeWindow.recommendations(from: availability.slots ?? [])
    }

    private var visibleWindows: [SmartTimeWindow] { Array(windows.dropFirst(offset).prefix(3)) }
    private var isLoading: Bool { availability.isLoading || (availability.slots == nil && availability.issue == nil) }
    private var activity: String? {
        let value = activityTitle?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        return value.isEmpty ? nil : value
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: SideSeatTheme.spaceLG) {
                    VStack(alignment: .leading, spacing: SideSeatTheme.spaceSM) {
                        if let activity {
                            Text(activity)
                                .font(.title3.weight(.semibold))
                                .fixedSize(horizontal: false, vertical: true)
                                .accessibilityIdentifier("smart-time-activity")
                        }
                        Text("Tap a time to fill your plan. You can still adjust it.")
                            .font(.subheadline)
                            .foregroundStyle(SideSeatTheme.textSecondaryStrong)
                            .fixedSize(horizontal: false, vertical: true)
                    }

                    VStack(spacing: SideSeatTheme.spaceSM) {
                        let sectionLayout = dynamicTypeSize.isAccessibilitySize
                            ? AnyLayout(VStackLayout(alignment: .leading, spacing: SideSeatTheme.spaceSM))
                            : AnyLayout(HStackLayout())
                        sectionLayout {
                            Text("Next 7 days").font(.subheadline.weight(.semibold))
                            if !dynamicTypeSize.isAccessibilitySize { Spacer(minLength: SideSeatTheme.spaceSM) }
                            if !isLoading, availability.issue == nil, windows.count > 3 {
                                Button {
                                    offset = offset + 3 < windows.count ? offset + 3 : 0
                                } label: {
                                    Label("Show other times", systemImage: "arrow.clockwise")
                                        .font(.subheadline.weight(.medium))
                                        .fixedSize(horizontal: false, vertical: true)
                                        .frame(minHeight: 44)
                                }
                                .buttonStyle(SSPressButtonStyle())
                                .foregroundStyle(SideSeatTheme.utilityAction)
                                .accessibilityIdentifier("smart-time-more")
                            }
                        }.frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)

                        if isLoading {
                            loadingPanel
                        } else if let issue = availability.issue {
                            statePanel(title: issue, icon: "wifi.exclamationmark", isError: true)
                        } else if windows.isEmpty {
                            statePanel(title: AppLocalization.string("No suitable free windows in the next 7 days"),
                                       icon: "calendar", isError: false)
                        } else {
                            VStack(spacing: 0) {
                                ForEach(visibleWindows) { window in
                                    windowRow(window)
                                    if window.id != visibleWindows.last?.id {
                                        Divider().padding(.horizontal, SideSeatTheme.spaceLG)
                                    }
                                }
                            }
                            .background(SideSeatTheme.surface, in: RoundedRectangle(cornerRadius: SideSeatTheme.cardRadius))
                        }
                    }

                    Label("Based on your synced calendar · Berlin time", systemImage: "calendar")
                        .font(.footnote)
                        .foregroundStyle(SideSeatTheme.textSecondaryStrong)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .padding(.horizontal, SideSeatTheme.screenHorizontal)
                .padding(.top, SideSeatTheme.spaceMD)
                .padding(.bottom, SideSeatTheme.spaceLG)
            }
            .background(SideSeatTheme.bgGrouped)
            .toolbar(.hidden, for: .navigationBar)
            .safeAreaInset(edge: .top, spacing: 0) { header }
            .task { await availability.load(using: session) }
        }
        .presentationDetents(dynamicTypeSize >= .xxxLarge ? [.large] : [SSSheetPresentation.chooser, .large])
        .presentationDragIndicator(.visible)
        .presentationCornerRadius(SideSeatTheme.cardRadius)
        .presentationBackground(SideSeatTheme.bgGrouped)
        .presentationContentInteraction(.scrolls)
    }

    private var header: some View {
        HStack(spacing: SideSeatTheme.spaceSM) {
            if !dynamicTypeSize.isAccessibilitySize {
                Image(systemName: "sparkles")
                    .foregroundStyle(SideSeatTheme.HubTint.plans)
                    .accessibilityHidden(true)
            }
            Text("Find a time together").font(.headline)
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityAddTraits(.isHeader)
            Spacer(minLength: SideSeatTheme.spaceSM)
            Button { dismiss() } label: {
                Image(systemName: "xmark")
                    .font(.caption.weight(.bold))
                    .dynamicTypeSize(...DynamicTypeSize.xxxLarge)
                    .foregroundStyle(SideSeatTheme.textPrimary)
                    .frame(width: 44, height: 44)
                    .background {
                        Circle().fill(SideSeatTheme.Interaction.neutralControlFill).frame(width: 32, height: 32)
                    }
            }
            .buttonStyle(SSPressButtonStyle())
            .accessibilityLabel("Cancel")
            .accessibilityIdentifier("smart-time-close")
        }
        .padding(.leading, SideSeatTheme.screenHorizontal)
        .padding(.trailing, SideSeatTheme.spaceMD)
        .padding(.vertical, SideSeatTheme.spaceSM)
        .background(SideSeatTheme.bgGrouped)
    }

    private func windowRow(_ window: SmartTimeWindow) -> some View {
        Button { onSelect(window) } label: {
            HStack(spacing: SideSeatTheme.spaceMD) {
                if !dynamicTypeSize.isAccessibilitySize {
                    VStack(spacing: 2) {
                        Text(window.monthLabel).font(.caption2.weight(.medium))
                        Text(window.dayLabel).font(.title2.weight(.semibold)).monospacedDigit()
                    }
                    .foregroundStyle(SideSeatTheme.textPrimary)
                    .frame(width: 52).frame(minHeight: 58)
                    .background(SideSeatTheme.activityInset, in: RoundedRectangle(cornerRadius: SideSeatTheme.controlRadius))
                }
                VStack(alignment: .leading, spacing: SideSeatTheme.spaceSM) {
                    if dynamicTypeSize.isAccessibilitySize {
                        Text(window.dateLabel).font(.subheadline)
                    }
                    Text(window.timeLabel)
                        .font(.headline).monospacedDigit()
                        .fixedSize(horizontal: false, vertical: true)
                    Text(dynamicTypeSize.isAccessibilitySize ? window.durationLabel : "\(window.weekdayLabel) · \(window.durationLabel)")
                        .font(.subheadline)
                        .foregroundStyle(SideSeatTheme.textSecondaryStrong)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                if !dynamicTypeSize.isAccessibilitySize {
                    Image(systemName: "chevron.right")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(SideSeatTheme.textSecondary)
                        .accessibilityHidden(true)
                }
            }
            .foregroundStyle(SideSeatTheme.textPrimary)
            .padding(.horizontal, SideSeatTheme.spaceLG)
            .padding(.vertical, SideSeatTheme.spaceMD)
            .frame(maxWidth: .infinity, minHeight: 78, alignment: .leading)
            .contentShape(Rectangle())
        }
        .buttonStyle(SSPressButtonStyle())
        .accessibilityElement(children: .ignore)
        .accessibilityAddTraits(.isButton)
        .accessibilityLabel("\(window.dateLabel), \(window.timeLabel), \(window.durationLabel)")
        .accessibilityHint("Use this time in a plan")
        .accessibilityIdentifier("smart-time-window-\(window.id)")
    }

    private var loadingPanel: some View {
        VStack(spacing: SideSeatTheme.spaceLG) {
            ProgressView()
            Text("Finding free times…").font(.subheadline)
                .foregroundStyle(SideSeatTheme.textSecondaryStrong)
        }
        .frame(maxWidth: .infinity, minHeight: 246)
        .background(SideSeatTheme.surface, in: RoundedRectangle(cornerRadius: SideSeatTheme.cardRadius))
        .accessibilityElement(children: .combine)
    }

    private func statePanel(title: String, icon: String, isError: Bool) -> some View {
        VStack(alignment: .leading, spacing: SideSeatTheme.spaceMD) {
            Image(systemName: icon).font(.title2)
                .foregroundStyle(SideSeatTheme.textSecondaryStrong)
                .accessibilityHidden(true)
            Text(title).font(.headline)
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityIdentifier(isError ? "smart-time-error" : "smart-time-empty")
            Text("Return to your plan to choose a time yourself.")
                .font(.subheadline).foregroundStyle(SideSeatTheme.textSecondaryStrong)
                .fixedSize(horizontal: false, vertical: true)
            if isError {
                Button("Try again") { Task { await availability.load(using: session) } }
                    .font(.subheadline.weight(.semibold)).frame(minHeight: 44)
                    .accessibilityIdentifier("smart-time-retry")
            }
            Button("Choose time manually") { dismiss() }
                .font(.subheadline.weight(.semibold)).frame(minHeight: 44)
                .accessibilityIdentifier("smart-time-manual")
        }
        .padding(SideSeatTheme.spaceLG)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(SideSeatTheme.surface, in: RoundedRectangle(cornerRadius: SideSeatTheme.cardRadius))
    }
}
