import Foundation

struct NativePlanActivity: Decodable, Sendable {
    let topic: String
    let isOpen: Bool
    let selectedIdeaId: String?
    let ideaCount: Int
    let hasParticipated: Bool
    var ideas: [Idea]? = nil
    struct Idea: Decodable, Sendable, Identifiable {
        let id: String
        let title: String
        let location: String?
        let authorName: String
        let isMine: Bool
        let interestedBy: [Interest]
        var isInterested: Bool { interestedBy.contains(where: \.isMe) }
    }
    struct Interest: Decodable, Sendable {
        let displayName: String
        let isMe: Bool
    }
}

struct NativeTimePoll: Decodable, Sendable {
    let token: String
    let title: String
    let timeZone: String
    let dates: [String]
    let startMinute: Int
    let endMinute: Int
    let slots: [Slot]
    let participants: [Participant]
    let mySlotIds: [Int]
    let myDisplayName: String
    let didRespond: Bool
    let isOwner: Bool
    let updatedAt: Date
    let shareUrl: URL
    let summary: Summary

    let location: String?
    let durationMinutes: Int?
    let expectedCount: Int?
    let planningMode: String?
    let phase: String?
    let expiresAt: Date?
    let invitationVersion: Int?
    let chosenStart: Date?
    let chosenEnd: Date?
    var hasFixedTime: Bool { planningMode == "FIXED" && chosenStart != nil && chosenEnd != nil }
    let invitations: [Invitation]?
    var activitySelection: NativePlanActivity? = nil
    var invitees: [Participant]? = nil
    var sharedWithUserIds: [String]? = nil
    var invitationCandidates: [Participant] { invitees ?? participants }
    /// A submitted timetable joins the invitation; sharing alone does not.
    func invitationParticipantIDs(adding extraIDs: Set<String>) -> Set<String> {
        Set(participants.map(\.id)).union(extraIDs.intersection(Set(invitationCandidates.map(\.id))))
    }
    var expirationDate: Date? {
        expiresAt ?? (phase == "INVITING" ? chosenStart : (phase == nil || phase == "COLLECTING") ? slots.last?.end : nil)
    }
    func planningPhase(at now: Date) -> String {
        let phase = phase ?? "COLLECTING"
        return ["COLLECTING", "INVITING"].contains(phase) && expirationDate.map { $0 <= now } == true ? "EXPIRED" : phase
    }
    var planningPhase: String { planningPhase(at: Date()) }
    var allInvitations: [Invitation] { invitations ?? [] }
    var occupiedCount: Int { allInvitations.filter(\.selected).count }
    var hasUnlimitedLink: Bool { planningMode == "FIXED" && expectedCount == nil }
    var targetCount: Int { planningMode == "FIXED" ? expectedCount ?? 2 : occupiedCount }
    var remainingCount: Int { max(0, targetCount - occupiedCount) }
    func canReplyToInvitation(at now: Date) -> Bool {
        ["INVITING", "CONFIRMED"].contains(planningPhase(at: now)) && (chosenStart ?? .distantPast) > now && !isOwner
            && (allInvitations.first(where: \.isMe)?.selected == true || planningMode == "FIXED" && (hasUnlimitedLink || remainingCount > 0))
    }
    struct Invitation: Decodable, Sendable, Identifiable {
        let id: String
        let displayName: String
        let status: String
        let selected: Bool
        let isMe: Bool
        let isGuest: Bool?
        var needsGuestRecovery: Bool? = nil
    }

    struct Slot: Decodable, Sendable, Identifiable {
        let id: Int
        let date: String
        let row: String
        let label: String
        let start: Date
        let end: Date
    }
    struct Participant: Decodable, Sendable, Identifiable {
        let id: String
        let displayName: String
        let slotIds: [Int]
        let isMe: Bool
        let isGuest: Bool?
        var didRespond: Bool? = nil
        var needsGuestRecovery: Bool? = nil
    }
    struct Cell: Sendable, Identifiable {
        let slots: [Slot]
        var id: Int { slots[0].id }
        var date: String { slots[0].date }
        var row: String { slots[0].row }
        var label: String { slots[0].label }
        var end: Date { slots[slots.count - 1].end }
        var slotIds: Set<Int> { Set(slots.map(\.id)) }
        func availableCount(in selections: [Set<Int>]) -> Int {
            let ids = slotIds
            return selections.filter { ids.isSubset(of: $0) }.count
        }
    }
    struct Window: Decodable, Sendable, Identifiable {
        var id: Date { start }
        let start: Date
        let end: Date
        let attendeeIds: [String]
        let count: Int
    }
    struct Summary: Decodable, Sendable {
        let counts: [Int]
        let participantCount: Int
        let maximum: Int
        let common: Bool
        let windows: [Window]
    }
    var cells: [Cell] { TimePollSelection.cells(slots) }
    /// Show the current draft once, alongside other people's saved responses.
    var submittedTimetableSelections: [Set<Int>] { participants.map { Set($0.slotIds) } }
    var rows: [String] {
        let cells = self.cells
        return dates.map { date in cells.filter { $0.date == date } }
            .max(by: { $0.count < $1.count })?.map(\.row) ?? []
    }
}

struct SharePlanContactsRequest: Encodable, Sendable {
    let connectionIds: [String]
    let version: Int
}

struct SharePlanContactsResult: Decodable, Sendable {
    let poll: NativeTimePoll
}

enum NativeSharedPlanMessage {
    /// Readable TEXT fallback for supported older clients, with no database enum change.
    static func parse(_ text: String) -> (token: String, title: String)? {
        let lines = text.components(separatedBy: "\n")
        guard lines.count == 2, lines[0].hasPrefix("📅 "),
              let token = TimePollLink.token(from: lines[1]) else { return nil }
        return (token, String(lines[0].dropFirst(2)))
    }
}

struct NativeTimePollList: Decodable, Sendable {
    let polls: [Item]
    struct Person: Decodable, Sendable {
        let displayName: String
        let avatarUrl: String?
    }
    struct Item: Decodable, Sendable, Identifiable {
        var id: String { token }
        let token: String
        let title: String
        let timeZone: String
        let dates: [String]
        let updatedAt: Date
        let shareUrl: URL
        let phase: String?
        let expiresAt: Date?
        let chosenStart: Date?
        let chosenEnd: Date?
        let expectedCount: Int?
        let respondedCount: Int?
        let acceptedCount: Int?
        let invitedCount: Int?
        let myInvitationStatus: String?
        let isIncluded: Bool?
        let isOwner: Bool?
        let didRespond: Bool?
        let planningMode: String?
        var activitySelection: NativePlanActivity? = nil
        var organizer: Person? = nil
        var peoplePreview: [Person]? = nil
        var hasUnlimitedLink: Bool { planningMode == "FIXED" && expectedCount == nil }
        var confirmationTarget: Int { planningMode == "FIXED" ? expectedCount ?? 2 : invitedCount ?? 0 }

        func nextStep(at now: Date) -> PlanNextStep {
            presentation(at: now).nextStep
        }
        func planningPhase(at now: Date) -> String {
            let phase = phase ?? "COLLECTING"
            let deadline = expiresAt ?? (phase == "INVITING" ? chosenStart : nil)
            return ["COLLECTING", "INVITING"].contains(phase) && deadline.map { $0 <= now } == true ? "EXPIRED" : phase
        }
        var statusLabel: String { statusLabel(at: Date()) }
        func statusLabel(at now: Date) -> String {
            presentation(at: now).status.title
        }
    }
}

struct CreateTimePollRequest: Encodable, Sendable {
    let title: String
    let timeZone: String
    let dates: [String]
    let startMinute: Int
    let endMinute: Int
    var location: String? = nil
    var durationMinutes: Int? = nil
    var expectedCount: Int? = nil
    var planningMode: String? = nil
    var fixedStart: String? = nil
    var chooseActivityTogether: Bool? = nil
}

struct SuggestPlanActivityRequest: Encodable, Sendable { let title: String; let location: String }
struct UpdateTimePollDetailsRequest: Encodable, Sendable { let title: String; let location: String }
struct PlanActivityInterestRequest: Encodable, Sendable { let ideaId: String; let interested: Bool }
struct ChoosePlanActivityRequest: Encodable, Sendable { let ideaId: String }

struct SendPollInvitationsRequest: Encodable, Sendable {
    let start: String
    var end: String? = nil
    let attendeeIds: [String]
    let version: Int
    var linkParticipantCount: Int? = nil
}
struct RespondPollInvitationRequest: Encodable, Sendable { let status: String; let version: Int }
struct CancelPollPlanRequest: Encodable, Sendable { let version: Int }
struct TimePollDisplayNameRequest: Encodable, Sendable { let displayName: String }

struct SaveTimePollRequest: Codable, Sendable, Equatable {
    let displayName: String
    let slotIds: [Int]
}

enum TimePollLink {
    static func token(from raw: String) -> String? {
        guard let url = URL(string: raw.trimmingCharacters(in: .whitespacesAndNewlines)),
              url.scheme == "https", let host = url.host?.lowercased(),
              ["sideseat.de", "www.sideseat.de", "api.sideseat.de"].contains(host)
        else { return nil }
        let components = url.pathComponents.filter { $0 != "/" }
        guard components.count == 2, components[0] == "time-polls",
              components[1].range(of: "^[A-Za-z0-9_-]{32}$", options: .regularExpression) != nil
        else { return nil }
        return components[1]
    }

    static func firstToken(in text: String) -> String? {
        guard let detector = try? NSDataDetector(types: NSTextCheckingResult.CheckingType.link.rawValue) else { return nil }
        return detector.matches(in: text, range: NSRange(text.startIndex..., in: text))
            .compactMap { $0.url.flatMap { token(from: $0.absoluteString) } }.first
    }
}

/// Read-only invitation context, independent of saved availability and fixed-plan candidate hours.
struct TimePollInvitationRow: Identifiable, Sendable {
    var id: Date { start }
    let start: Date
    let end: Date
    let date: String
    let label: String
    let from: Double
    let through: Double
    var highlighted: Bool { through > from }

    static func rows(start: Date, end: Date, timeZone: String) -> [Self] {
        guard end > start else { return [] }
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: timeZone) ?? .gmt
        let day = DateFormatter(); day.locale = Locale(identifier: "en_US_POSIX"); day.timeZone = calendar.timeZone; day.dateFormat = "yyyy-MM-dd"
        let clock = DateFormatter(); clock.locale = day.locale; clock.timeZone = calendar.timeZone; clock.dateFormat = "HH:mm"
        let offset = DateFormatter(); offset.locale = day.locale; offset.timeZone = calendar.timeZone; offset.dateFormat = "XXX"
        func floorHalfHour(_ date: Date) -> Date {
            date.addingTimeInterval(-Double(calendar.component(.minute, from: date) % 30 * 60 + calendar.component(.second, from: date)) - Double(calendar.component(.nanosecond, from: date)) / 1_000_000_000)
        }
        var cursor = floorHalfHour(start).addingTimeInterval(-1800)
        let last = floorHalfHour(end)
        let limit = (last < end ? last.addingTimeInterval(1800) : last).addingTimeInterval(1800)
        var rows: [Self] = [], occurrences: [String: Int] = [:]
        while cursor < limit {
            let next = cursor.addingTimeInterval(1800), date = day.string(from: cursor), time = clock.string(from: cursor)
            let key = date + time, occurrence = occurrences[key, default: 0]
            occurrences[key] = occurrence + 1
            rows.append(.init(start: cursor, end: next, date: date, label: time + (occurrence > 0 ? " " + offset.string(from: cursor) : ""),
                              from: max(0, min(1, start.timeIntervalSince(cursor) / 1800)),
                              through: max(0, min(1, end.timeIntervalSince(cursor) / 1800))))
            cursor = next
        }
        let dates = Set(rows.filter(\.highlighted).map(\.date))
        return rows.filter { dates.contains($0.date) }
    }
}

/// A single continuous invitation interval, independent of availability responses.
struct TimePollFinalRange: Equatable, Sendable {
    let start: Date
    let end: Date
    var duration: TimeInterval { end.timeIntervalSince(start) }

    static func selected(_ ids: Set<Int>, slots: [NativeTimePoll.Slot]) -> Self? {
        let included = slots.filter { ids.contains($0.id) }.sorted { $0.start < $1.start }
        guard included.count == ids.count, let first = included.first, let last = included.last else { return nil }
        return validated(start: first.start, end: last.end, slots: included)
    }

    static func validated(start: Date, end: Date, slots: [NativeTimePoll.Slot]) -> Self? {
        let included = slots.filter { $0.start >= start && $0.end <= end }.sorted { $0.start < $1.start }
        guard start < end, included.first?.start == start, included.last?.end == end,
              zip(included, included.dropFirst()).allSatisfy({ $0.0.end == $0.1.start }) else { return nil }
        return .init(start: start, end: end)
    }
}

struct TimePollTimetable: Sendable {
    let dates: [String]
    let timeZone: String
    let startMinute: Int
    let slots: [NativeTimePoll.Slot]
    var responses: [Set<Int>] = []

    let finalTimeSlots: [NativeTimePoll.Slot]

    init(dates: [String], timeZone: String, startMinute: Int, slots: [NativeTimePoll.Slot], responses: [Set<Int>] = []) {
        self.dates = Array(Set(dates)).sorted(); self.timeZone = timeZone; self.startMinute = startMinute
        self.slots = slots; self.responses = responses
        let fullDay = Self.slots(dates: self.dates, timeZone: timeZone, startMinute: 0, endMinute: 1440)
        let existing = Dictionary(uniqueKeysWithValues: slots.map { ($0.start, $0.id) })
        finalTimeSlots = fullDay.enumerated().map { index, slot in
            .init(id: existing[slot.start] ?? -(index + 1), date: slot.date, row: slot.row,
                  label: slot.label, start: slot.start, end: slot.end)
        }
    }

    /// Defaults and UIKit edits must represent a calendar day with the same components.
    static func normalizedDates(_ dates: Set<DateComponents>, calendar: Calendar) -> Set<DateComponents> {
        Set(dates.compactMap { value in
            var day = DateComponents(era: value.era, year: value.year, month: value.month, day: value.day)
            day.isLeapMonth = value.isLeapMonth
            return calendar.date(from: day).map { calendar.dateComponents([.calendar, .era, .year, .month, .day], from: $0) }
        })
    }

    /// Both creation and server-backed tables use the same real quarter-hour timeline.
    static func slots(dates: [String], timeZone: String, startMinute: Int, endMinute: Int) -> [NativeTimePoll.Slot] {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: timeZone) ?? .current
        let parser = DateFormatter(); parser.locale = Locale(identifier: "en_US_POSIX")
        parser.timeZone = calendar.timeZone; parser.dateFormat = "yyyy-MM-dd"
        let clock = timePollClockFormatter(timeZone)
        let offset = DateFormatter(); offset.timeZone = calendar.timeZone; offset.dateFormat = "XXX"
        var result: [NativeTimePoll.Slot] = []
        for date in Set(dates).sorted() {
            guard let midnight = parser.date(from: date),
                  var cursor = calendar.date(bySettingHour: startMinute / 60, minute: startMinute % 60, second: 0, of: midnight),
                  let end = endMinute == 1440 ? calendar.date(byAdding: .day, value: 1, to: midnight)
                    : calendar.date(bySettingHour: endMinute / 60, minute: endMinute % 60, second: 0, of: midnight) else { continue }
            var occurrences: [String: Int] = [:]
            while cursor < end {
                let label = clock.string(from: cursor), ordinal = occurrences[label, default: 0]
                occurrences[label] = ordinal + 1
                let next = cursor.addingTimeInterval(900)
                result.append(.init(id: result.count, date: date, row: "\(label)-\(ordinal)",
                    label: label + (ordinal > 0 ? " " + offset.string(from: cursor) : ""), start: cursor, end: next))
                cursor = next
            }
        }
        return result
    }
}

extension NativeTimePoll {
    var timetable: TimePollTimetable {
        .init(dates: dates, timeZone: timeZone, startMinute: startMinute, slots: slots, responses: submittedTimetableSelections)
    }
    var finalTimeSlots: [Slot] { timetable.finalTimeSlots }
}

/// Local final-time edits never submit availability or create an invitation.
struct TimePollFinalDraft: Codable {
    enum Next: String, Codable { case review, share }
    var selected: Set<Int>
    var choosingFinal: Bool
    var invitationVersion: Int
    var next: Next? = nil
    var extraInviteeIDs: Set<String>? = nil
    var activityID: String? = nil
    var linkParticipantCount: Int? = nil

    static func key(userID: String, token: String) -> String { "plan.final-time-draft.v1.\(userID).\(token)" }
    static func load(userID: String, token: String, defaults: UserDefaults = .standard) -> Self? {
        guard let data = defaults.data(forKey: key(userID: userID, token: token)) else { return nil }
        return try? JSONDecoder().decode(Self.self, from: data)
    }
    func save(userID: String, token: String, defaults: UserDefaults = .standard) {
        if let data = try? JSONEncoder().encode(self) { defaults.set(data, forKey: Self.key(userID: userID, token: token)) }
    }
}

enum TimePollSelection {
    /// Group adjacent quarters for display without changing persisted IDs.
    static func cells(_ slots: [NativeTimePoll.Slot]) -> [NativeTimePoll.Cell] {
        var cells: [NativeTimePoll.Cell] = []
        var index = 0
        while index < slots.count {
            let first = slots[index]
            if index + 1 < slots.count, slots[index + 1].date == first.date, first.end == slots[index + 1].start {
                cells.append(.init(slots: [first, slots[index + 1]]))
                index += 2
            } else {
                cells.append(.init(slots: [first]))
                index += 1
            }
        }
        return cells
    }
    static func toggle(_ cell: NativeTimePoll.Cell, original: Set<Int>) -> Set<Int> {
        cell.slotIds.isSubset(of: original) ? original.subtracting(cell.slotIds) : original.union(cell.slotIds)
    }
    /// Across midnight, paint actual elapsed time rather than a rectangle spanning both days.
    static func interval(cells: [NativeTimePoll.Cell], from: NativeTimePoll.Cell, to: NativeTimePoll.Cell,
                         original: Set<Int>, selecting: Bool) -> Set<Int> {
        let start = min(from.slots[0].start, to.slots[0].start), end = max(from.end, to.end)
        let ids = Set(cells.filter { $0.slots[0].start >= start && $0.end <= end }.flatMap(\.slotIds))
        return selecting ? original.union(ids) : original.subtracting(ids)
    }

    /// Paint a rectangle once; revisiting cells during a drag does not toggle them.
    static func rectangle(cells: [NativeTimePoll.Cell], dates: [String], rows: [String], from: (Int, Int), to: (Int, Int), original: Set<Int>, selecting: Bool) -> Set<Int> {
        let columns = min(from.0, to.0)...max(from.0, to.0)
        let rowRange = min(from.1, to.1)...max(from.1, to.1)
        let ids = Set(cells.filter { slot in
            guard let column = dates.firstIndex(of: slot.date), let row = rows.firstIndex(of: slot.row) else { return false }
            return columns.contains(column) && rowRange.contains(row)
        }.flatMap(\.slotIds))
        return selecting ? original.union(ids) : original.subtracting(ids)
    }
}
