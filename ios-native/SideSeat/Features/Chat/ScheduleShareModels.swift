import Foundation

struct NativeScheduleShareCreatePayload: Decodable, Sendable {
    let shareUrl: String
    let token: String?
    let linkId: String
    let message: NativeDirectMessage
}

struct NativeScheduleShareLinkCreatePayload: Decodable, Sendable {
    let shareUrl: String
    let token: String?
    let linkId: String
}

struct NativeScheduleShareChatPreview: Decodable, Sendable {
    let snapshot: NativeScheduleShareSnapshot
    let expired: Bool
    let ownerDisplayLabel: String
    let linkId: String?
    let ownedByViewer: Bool?
}

struct NativeScheduleShareRevokeResult: Decodable, Sendable {
    let linkId: String
    let revokedAt: String
}

struct NativeScheduleShareBlock: Decodable, Hashable, Identifiable, Sendable {
    let kind: String
    let start: String
    let end: String
    let title: String?
    let location: String?
    let categoryId: String?
    let categoryPresetKey: String?
    let categoryName: String?
    let categoryColor: String?

    var id: String { "\(start)-\(end)-\(title ?? kind)" }
}

struct NativeScheduleShareRevealConfigRequest: Encodable, Hashable, Sendable {
    let categoryIds: [String]
    let presetKeys: [String]
    let hideAllDetails: Bool
    let includedDates: [String]
}

struct NativeScheduleShareCreateRequest: Encodable, Hashable, Sendable {
    let rangeStart: String
    let rangeEnd: String
    let revealConfig: NativeScheduleShareRevealConfigRequest
    let allowGuestProposals: Bool
    let usageLimit: String
    let expiresAt: String
}

struct NativeScheduleShareSnapshot: Decodable, Sendable {
    let ownerDisplayLabel: String
    let rangeStart: String
    let rangeEnd: String
    let includedDates: [String]
    let expiresAt: String?
    let allowGuestProposals: Bool
    let freeSlots: [NativeScheduleShareSlot]
    let blocks: [NativeScheduleShareBlock]?
}

struct NativeScheduleShareSlot: Decodable, Hashable, Identifiable, Sendable {
    let start: String
    let end: String

    var id: String { "\(start)-\(end)" }
}

struct NativeScheduleShareProposalSelection: Hashable, Sendable {
    let bounds: NativeScheduleShareSlot
    let start: Date
    let end: Date
}

enum ScheduleShareProposalTime {
    static let defaultDisplayStartHour = 8
    static let defaultDisplayEndHour = 22
    static let minimumMinutes = 15
    static let maximumMinutes = 240
    static let defaultMinutes = 90
    static let snapMinutes = 30

    static func initialSelection(
        in bounds: NativeScheduleShareSlot,
        preferredStart: Date? = nil
    ) -> NativeScheduleShareProposalSelection? {
        guard let boundsStart = Date.sideSeatChatISO8601(bounds.start),
              let boundsEnd = Date.sideSeatChatISO8601(bounds.end),
              boundsEnd.timeIntervalSince(boundsStart) >= minutes(minimumMinutes)
        else { return nil }

        let candidate = max(
            preferredStart ?? defaultStart(in: boundsStart..<boundsEnd),
            boundsStart
        )
        var start = min(snappedUp(candidate), boundsEnd.addingTimeInterval(-minutes(minimumMinutes)))
        var end = min(start.addingTimeInterval(minutes(defaultMinutes)), boundsEnd)

        if end.timeIntervalSince(start) < minutes(minimumMinutes) {
            start = boundsStart
            end = min(boundsStart.addingTimeInterval(minutes(defaultMinutes)), boundsEnd)
        }
        guard end.timeIntervalSince(start) >= minutes(minimumMinutes) else { return nil }
        return NativeScheduleShareProposalSelection(bounds: bounds, start: start, end: end)
    }

    static func selection(
        in bounds: NativeScheduleShareSlot,
        start: Date,
        end: Date
    ) -> NativeScheduleShareProposalSelection? {
        guard fits(start: start, end: end, in: bounds) else { return nil }
        return NativeScheduleShareProposalSelection(bounds: bounds, start: start, end: end)
    }

    static func updatingStart(
        _ selection: NativeScheduleShareProposalSelection,
        to requestedStart: Date
    ) -> NativeScheduleShareProposalSelection {
        guard let boundsStart = Date.sideSeatChatISO8601(selection.bounds.start),
              let boundsEnd = Date.sideSeatChatISO8601(selection.bounds.end)
        else { return selection }

        let latestStart = boundsEnd.addingTimeInterval(-minutes(minimumMinutes))
        let start = min(max(requestedStart, boundsStart), latestStart)
        let currentDuration = min(
            max(selection.end.timeIntervalSince(selection.start), minutes(minimumMinutes)),
            minutes(maximumMinutes)
        )
        let end = min(start.addingTimeInterval(currentDuration), boundsEnd)
        return NativeScheduleShareProposalSelection(bounds: selection.bounds, start: start, end: end)
    }

    static func updatingEnd(
        _ selection: NativeScheduleShareProposalSelection,
        to requestedEnd: Date
    ) -> NativeScheduleShareProposalSelection {
        guard let boundsEnd = Date.sideSeatChatISO8601(selection.bounds.end) else { return selection }
        let earliestEnd = selection.start.addingTimeInterval(minutes(minimumMinutes))
        let latestEnd = min(
            boundsEnd,
            selection.start.addingTimeInterval(minutes(maximumMinutes))
        )
        let end = min(max(requestedEnd, earliestEnd), latestEnd)
        return NativeScheduleShareProposalSelection(
            bounds: selection.bounds,
            start: selection.start,
            end: end
        )
    }

    static func applyingDuration(
        _ durationMinutes: Int,
        to selection: NativeScheduleShareProposalSelection
    ) -> NativeScheduleShareProposalSelection {
        let requestedEnd = selection.start.addingTimeInterval(
            minutes(min(max(durationMinutes, minimumMinutes), maximumMinutes))
        )
        return updatingEnd(selection, to: requestedEnd)
    }

    static func fits(start: Date, end: Date, in bounds: NativeScheduleShareSlot) -> Bool {
        guard let boundsStart = Date.sideSeatChatISO8601(bounds.start),
              let boundsEnd = Date.sideSeatChatISO8601(bounds.end)
        else { return false }
        let duration = end.timeIntervalSince(start)
        return start >= boundsStart
            && end <= boundsEnd
            && duration >= minutes(minimumMinutes)
            && duration <= minutes(maximumMinutes)
    }

    private static func snappedUp(_ date: Date) -> Date {
        let interval = minutes(snapMinutes)
        let value = date.timeIntervalSinceReferenceDate
        return Date(timeIntervalSinceReferenceDate: ceil(value / interval) * interval)
    }

    private static func defaultStart(in bounds: Range<Date>) -> Date {
        let now = Date()
        if bounds.contains(now) { return now }

        let calendar = Calendar.sideSeatBerlin
        let dayStart = calendar.startOfDay(for: bounds.lowerBound)
        var daytime = calendar.date(
            bySettingHour: defaultDisplayStartHour,
            minute: 0,
            second: 0,
            of: dayStart
        ) ?? bounds.lowerBound
        if daytime < bounds.lowerBound {
            daytime = calendar.date(byAdding: .day, value: 1, to: daytime) ?? bounds.lowerBound
        }
        return bounds.contains(daytime) ? daytime : bounds.lowerBound
    }

    private static func minutes(_ value: Int) -> TimeInterval {
        TimeInterval(value * 60)
    }
}

struct NativeScheduleShareViewerProposal: Decodable, Hashable, Sendable {
    let id: String
    let title: String
    let note: String?
    let location: String?
    let startTime: String
    let endTime: String
    let status: String
}

struct NativeScheduleShareRecipientPayload: Decodable, Sendable {
    let snapshot: NativeScheduleShareSnapshot
    let proposal: NativeScheduleShareViewerProposal?
    let allowGuestProposals: Bool
    let linkId: String
}

struct NativeScheduleShareMyProposalPayload: Decodable, Sendable {
    let proposal: NativeScheduleShareViewerProposal?
}

struct NativeScheduleShareProposalResult: Decodable, Sendable {
    let submitted: Bool
    let updated: Bool
    let proposal: NativeScheduleShareViewerProposal
}

struct NativeScheduleShareProposalRequest: Encodable, Sendable {
    let title: String
    let note: String?
    let location: String?
    let startTime: String
    let endTime: String
}

enum ScheduleShareURLParser {
    static func token(from shareURL: String) -> String? {
        guard let url = URL(string: shareURL) else {
            if let match = shareURL.range(of: #"/share/view/([^?#]+)"#, options: .regularExpression) {
                let full = String(shareURL[match])
                return full.replacingOccurrences(of: "/share/view/", with: "")
                    .removingPercentEncoding
            }
            return nil
        }
        let parts = url.path.split(separator: "/").map(String.init)
        guard parts.count >= 3, parts[0] == "share", parts[1] == "view" else { return nil }
        return parts[2].removingPercentEncoding ?? parts[2]
    }
}

enum ScheduleShareDateSelection {
    static let maximumDayCount = 31

    static func dateKey(for date: Date, calendar: Calendar = .sideSeatBerlin) -> String {
        let components = calendar.dateComponents([.year, .month, .day], from: date)
        return String(
            format: "%04d-%02d-%02d",
            components.year ?? 0,
            components.month ?? 0,
            components.day ?? 0
        )
    }

    static func date(from key: String, calendar: Calendar = .sideSeatBerlin) -> Date? {
        let parts = key.split(separator: "-").compactMap { Int($0) }
        guard parts.count == 3 else { return nil }
        return calendar.date(from: DateComponents(year: parts[0], month: parts[1], day: parts[2], hour: 12))
    }

    static func nextDays(
        _ count: Int,
        from now: Date = Date(),
        calendar: Calendar = .sideSeatBerlin
    ) -> Set<String> {
        let capped = min(max(count, 1), maximumDayCount)
        let tomorrow = calendar.date(byAdding: .day, value: 1, to: calendar.startOfDay(for: now)) ?? now
        return Set((0..<capped).compactMap { offset in
            calendar.date(byAdding: .day, value: offset, to: tomorrow).map { dateKey(for: $0, calendar: calendar) }
        })
    }

    static func nextWeek(
        from now: Date = Date(),
        calendar: Calendar = .sideSeatBerlin
    ) -> Set<String> {
        var mondayCalendar = calendar
        mondayCalendar.firstWeekday = 2
        let currentWeek = mondayCalendar.dateInterval(of: .weekOfYear, for: now)
        let start = currentWeek.flatMap { mondayCalendar.date(byAdding: .weekOfYear, value: 1, to: $0.start) }
            ?? nextDay(after: now, calendar: mondayCalendar)
        return Set((0..<7).compactMap { offset in
            mondayCalendar.date(byAdding: .day, value: offset, to: start).map {
                dateKey(for: $0, calendar: mondayCalendar)
            }
        })
    }

    static func weekStart(
        containing date: Date,
        calendar: Calendar = .sideSeatBerlin
    ) -> Date {
        var mondayCalendar = calendar
        mondayCalendar.firstWeekday = 2
        return mondayCalendar.dateInterval(of: .weekOfYear, for: date)?.start
            ?? mondayCalendar.startOfDay(for: date)
    }

    static func weekDays(
        containing date: Date,
        offset: Int = 0,
        calendar: Calendar = .sideSeatBerlin
    ) -> [Date] {
        let start = weekStart(containing: date, calendar: calendar)
        let shiftedStart = calendar.date(byAdding: .weekOfYear, value: offset, to: start) ?? start
        return (0..<7).compactMap {
            calendar.date(byAdding: .day, value: $0, to: shiftedStart)
        }
    }

    static func range(
        for selectedDateKeys: Set<String>,
        calendar: Calendar = .sideSeatBerlin
    ) -> (start: Date, end: Date)? {
        let dates = selectedDateKeys.compactMap { date(from: $0, calendar: calendar) }.sorted()
        guard let first = dates.first, let last = dates.last else { return nil }
        let start = calendar.startOfDay(for: first)
        guard let nextDay = calendar.date(byAdding: .day, value: 1, to: calendar.startOfDay(for: last)) else {
            return nil
        }
        return (start, nextDay.addingTimeInterval(-0.001))
    }

    static func dates(
        from rangeStart: Date,
        through rangeEnd: Date,
        limit: Int = maximumDayCount,
        calendar: Calendar = .sideSeatBerlin
    ) -> [Date] {
        guard rangeEnd >= rangeStart, limit > 0 else { return [] }
        var result: [Date] = []
        var cursor = calendar.startOfDay(for: rangeStart)
        let lastDay = calendar.startOfDay(for: rangeEnd)
        while cursor <= lastDay, result.count < limit {
            result.append(cursor)
            guard let next = calendar.date(byAdding: .day, value: 1, to: cursor) else { break }
            cursor = next
        }
        return result
    }

    private static func nextDay(after date: Date, calendar: Calendar) -> Date {
        calendar.date(byAdding: .day, value: 1, to: calendar.startOfDay(for: date)) ?? date
    }
}
