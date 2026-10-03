import SwiftUI

enum SmartTimeFormatting {
    static func label(_ value: Date, date: Bool, time: Bool) -> String {
        let formatter = DateFormatter()
        formatter.locale = AppLocalization.selectedLanguage.locale
        formatter.timeZone = Calendar.sideSeatBerlin.timeZone
        formatter.dateStyle = date ? .medium : .none
        formatter.timeStyle = time ? .short : .none
        return formatter.string(from: value)
    }
}

enum SmartTimePeriod: String, CaseIterable, Identifiable {
    case any, morning, afternoon, evening
    var id: String { rawValue }
    var title: String {
        switch self {
        case .any: AppLocalization.string("Any daytime")
        case .morning: AppLocalization.string("Morning")
        case .afternoon: AppLocalization.string("Afternoon")
        case .evening: AppLocalization.string("Evening")
        }
    }
    var hours: Range<Int> {
        switch self {
        case .any: 9..<21
        case .morning: 9..<12
        case .afternoon: 12..<18
        case .evening: 18..<21
        }
    }
}

enum SmartTimeMatcher {
    /// Intersect only explicitly shared free intervals with the viewer's own availability.
    static func commonSlots(_ peer: [NativeScheduleShareSlot], _ own: [NativeScheduleShareSlot]) -> [NativeScheduleShareSlot] {
        let intersections = peer.compactMap(interval).flatMap { left in
            own.compactMap(interval).compactMap { right -> DateInterval? in
                let start = max(left.start, right.start), end = min(left.end, right.end)
                return start < end ? DateInterval(start: start, end: end) : nil
            }
        }.sorted { $0.start < $1.start }
        var merged: [DateInterval] = []
        for item in intersections {
            if let last = merged.last, item.start <= last.end {
                merged[merged.count - 1] = DateInterval(start: last.start, end: max(last.end, item.end))
            } else { merged.append(item) }
        }
        return merged.map { .init(start: $0.start.ISO8601Format(), end: $0.end.ISO8601Format()) }
    }

    static func interval(_ slot: NativeScheduleShareSlot) -> DateInterval? {
        guard let start = Date.sideSeatChatISO8601(slot.start), let end = Date.sideSeatChatISO8601(slot.end), end > start else { return nil }
        return DateInterval(start: start, end: end)
    }

    static func contains(start: Date, end: Date, in slots: [NativeScheduleShareSlot], now: Date = Date()) -> Bool {
        start > now && end > start && slots.compactMap(interval).contains { $0.start <= start && $0.end >= end }
    }

    static func candidates(
        slots: [NativeScheduleShareSlot], durationMinutes: Int = 60,
        period: SmartTimePeriod = .any, now: Date = Date(),
        calendar: Calendar = .sideSeatBerlin
    ) -> [NativeScheduleShareCandidate] {
        guard [30, 60, 90, 120].contains(durationMinutes) else { return [] }
        let duration = TimeInterval(durationMinutes * 60)
        let earliest = now.addingTimeInterval(60 * 60)
        let horizon = calendar.date(byAdding: .day, value: 31, to: now)!
        var byDay: [Date: [NativeScheduleShareCandidate]] = [:]
        for bounds in slots {
            guard let interval = interval(bounds) else { continue }
            var day = calendar.startOfDay(for: max(interval.start, earliest))
            while day < min(interval.end, horizon) {
                guard let next = calendar.date(byAdding: .day, value: 1, to: day),
                      let from = calendar.date(bySettingHour: period.hours.lowerBound, minute: 0, second: 0, of: day),
                      let until = calendar.date(bySettingHour: period.hours.upperBound, minute: 0, second: 0, of: day)
                else { break }
                let lower = max(interval.start, from, earliest), upper = min(interval.end, until, horizon)
                var start = Date(timeIntervalSince1970: ceil(lower.timeIntervalSince1970 / 1800) * 1800)
                while start.addingTimeInterval(duration) <= upper {
                    byDay[day, default: []].append(.init(bounds: bounds, start: start, end: start.addingTimeInterval(duration)))
                    // Avoid filling the list with almost identical overlapping choices.
                    start = start.addingTimeInterval(max(duration, 1800))
                }
                day = next
            }
        }
        // Offer different days first, then further choices on those days.
        let days = byDay.keys.sorted()
        var result: [NativeScheduleShareCandidate] = []
        for index in 0..<(byDay.values.map(\.count).max() ?? 0) {
            for day in days {
                if let choices = byDay[day], index < choices.count { result.append(choices[index]) }
            }
            if result.count >= 60 { break }
        }
        return Array(result.prefix(60))
    }

    #if DEBUG
    static func fixtureSlots(own: Bool, now: Date = Date()) -> [NativeScheduleShareSlot] {
        let calendar = Calendar.sideSeatBerlin
        return (1...7).map { offset in
            let day = calendar.date(byAdding: .day, value: offset, to: now)!
            let start = calendar.date(bySettingHour: own ? 14 : 9, minute: 0, second: 0, of: day)!
            let end = calendar.date(bySettingHour: 20, minute: 0, second: 0, of: day)!
            return .init(start: start.ISO8601Format(), end: end.ISO8601Format())
        }
    }
    #endif
}

@MainActor @Observable
final class SmartTimeAvailabilityStore {
    private(set) var slots: [NativeScheduleShareSlot]?
    private(set) var isLoading = false
    private(set) var issue: String?

    @discardableResult
    func load(using session: SessionStore) async -> Bool {
        isLoading = true
        slots = nil
        issue = nil
        defer { isLoading = false }
        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("--ui-testing-authenticated") {
            if ProcessInfo.processInfo.arguments.contains("--ui-testing-smart-time-error") {
                issue = AppLocalization.string("Your calendar could not be checked. Try again.")
                return false
            }
            if ProcessInfo.processInfo.arguments.contains("--ui-testing-smart-time-busy") {
                slots = []
            } else if ProcessInfo.processInfo.arguments.contains("--ui-testing-smart-time-windows") {
                let calendar = Calendar.sideSeatBerlin
                slots = (1...7).map { offset in
                    let day = calendar.date(byAdding: .day, value: offset, to: Date())!
                    let morning = offset % 2 == 1
                    let start = calendar.date(bySettingHour: morning ? 9 : 13, minute: 0, second: 0, of: day)!
                    let end = calendar.date(bySettingHour: morning ? 12 : 17, minute: 0, second: 0, of: day)!
                    return .init(start: start.ISO8601Format(), end: end.ISO8601Format())
                }
            } else {
                slots = SmartTimeMatcher.fixtureSlots(own: true)
            }
            return true
        }
        #endif
        do {
            let response: APIEnvelope<NativeScheduleShareOwnerPreviewPayload> = try await session.sendAuthorized("api/v1/schedule-shares/owner-preview")
            slots = response.data.snapshot.freeSlots
            return true
        } catch {
            issue = AppLocalization.string("Your calendar could not be checked. Try again.")
            return false
        }
    }
}

struct SmartTimeSuggestionsPanel: View {
    let peerSlots: [NativeScheduleShareSlot]
    let ownStore: SmartTimeAvailabilityStore
    let selection: NativeScheduleShareProposalSelection?
    let onSelect: (NativeScheduleShareCandidate?) -> Void
    let onRetry: () -> Void
    @State private var duration = 60
    @State private var period = SmartTimePeriod.any
    @State private var offset = 0

    private var candidates: [NativeScheduleShareCandidate] {
        SmartTimeMatcher.candidates(slots: SmartTimeMatcher.commonSlots(peerSlots, ownStore.slots ?? []), durationMinutes: duration, period: period)
    }

    var body: some View {
        SSFlowCard {
            Label("Find a time together", systemImage: "calendar.badge.clock")
                .font(.headline)
            Text("Based on your synced calendars. Check any plans you have not added. Times are in Berlin time.")
                .font(.footnote).foregroundStyle(SideSeatTheme.textSecondaryStrong)
            Picker("Duration", selection: $duration) {
                ForEach([30, 60, 90, 120], id: \.self) { minutes in
                    Text(String.localizedStringWithFormat(AppLocalization.string("%lld min"), minutes)).tag(minutes)
                }
            }
            .pickerStyle(.segmented).accessibilityIdentifier("smart-time-duration")
            Picker("Preferred time", selection: $period) {
                ForEach(SmartTimePeriod.allCases) { Text($0.title).tag($0) }
            }.accessibilityIdentifier("smart-time-period")
            if ownStore.isLoading || (ownStore.slots == nil && ownStore.issue == nil) {
                ProgressView("Checking both calendars")
            } else if let issue = ownStore.issue {
                Text(issue).font(.footnote).foregroundStyle(SideSeatTheme.danger)
                Button("Try again", action: onRetry).accessibilityIdentifier("smart-time-retry")
            } else if candidates.isEmpty {
                Label("No common time in this range. Try a shorter duration or another time of day.", systemImage: "calendar.badge.exclamationmark")
                    .font(.subheadline).foregroundStyle(SideSeatTheme.textSecondaryStrong)
                    .accessibilityIdentifier("smart-time-empty")
            } else {
                ForEach(Array(candidates.dropFirst(offset).prefix(3))) { candidate in
                    Button { onSelect(candidate) } label: {
                        HStack {
                            VStack(alignment: .leading, spacing: 4) {
                                Text(dayLabel(candidate.start))
                                    .font(.subheadline.weight(.semibold))
                                Text("\(time(candidate.start))–\(time(candidate.end))")
                                    .font(.body.monospacedDigit())
                            }
                            Spacer()
                            Image(systemName: selection?.start == candidate.start && selection?.end == candidate.end ? "checkmark.circle.fill" : "circle")
                        }
                        .padding(12).foregroundStyle(SideSeatTheme.textPrimary)
                        .background(SideSeatTheme.utilityAction.opacity(0.08), in: RoundedRectangle(cornerRadius: 10))
                    }.buttonStyle(.plain).accessibilityIdentifier("smart-time-candidate-\(candidate.id)")
                }
                if candidates.count > 3 {
                    Button("Other suggestions") { offset = offset + 3 < candidates.count ? offset + 3 : 0 }
                        .frame(minHeight: 44).accessibilityIdentifier("smart-time-more")
                }
            }
        }
        .onChange(of: duration) { _, _ in offset = 0; onSelect(nil) }
        .onChange(of: period) { _, _ in offset = 0; onSelect(nil) }
        .onChange(of: ownStore.slots) { _, _ in offset = 0 }
    }

    private func dayLabel(_ date: Date) -> String {
        var style = Date.FormatStyle.dateTime.weekday(.abbreviated).month().day().locale(AppLocalization.selectedLanguage.locale)
        style.timeZone = Calendar.sideSeatBerlin.timeZone
        return date.formatted(style)
    }

    private func time(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.locale = AppLocalization.selectedLanguage.locale
        formatter.timeZone = Calendar.sideSeatBerlin.timeZone
        formatter.dateFormat = "HH:mm"
        return formatter.string(from: date)
    }
}
