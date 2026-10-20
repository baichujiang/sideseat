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
    var expirationDate: Date? {
        expiresAt ?? (phase == "INVITING" ? chosenStart : (phase == nil || phase == "COLLECTING") ? slots.last?.end : nil)
    }
    func planningPhase(at now: Date) -> String {
        let phase = phase ?? "COLLECTING"
        return ["COLLECTING", "INVITING"].contains(phase) && expirationDate.map { $0 <= now } == true ? "EXPIRED" : phase
    }
    var planningPhase: String { planningPhase(at: Date()) }
    var allInvitations: [Invitation] { invitations ?? [] }
    var targetCount: Int { planningMode == "FIXED" ? expectedCount ?? 2 : allInvitations.filter(\.selected).count }
    struct Invitation: Decodable, Sendable, Identifiable {
        let id: String
        let displayName: String
        let status: String
        let selected: Bool
        let isMe: Bool
        let isGuest: Bool?
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

/// One continuous, candidate-backed invitation window; never an availability response.
struct TimePollFinalRange: Equatable, Sendable {
    let date: String
    let start: Date
    let end: Date

    func contains(_ cell: NativeTimePoll.Cell) -> Bool {
        cell.date == date && cell.slots[0].start >= start && cell.end <= end
    }

    /// Further taps grow the same interval instead of restarting every third tap.
    static func selecting(_ cell: NativeTimePoll.Cell, in range: Self?, cells: [NativeTimePoll.Cell]) -> Self? {
        guard let range, range.date == cell.date else { return spanning(cell, cell, cells: cells) }
        let included = (cells.filter { range.contains($0) } + [cell]).sorted { $0.slots[0].start < $1.slots[0].start }
        return spanning(included.first!, included.last!, cells: cells) ?? range
    }

    static func spanning(_ first: NativeTimePoll.Cell, _ last: NativeTimePoll.Cell, cells: [NativeTimePoll.Cell]) -> Self? {
        guard first.date == last.date else { return nil }
        let start = min(first.slots[0].start, last.slots[0].start), end = max(first.end, last.end)
        let range = cells.filter { $0.date == first.date && $0.slots[0].start >= start && $0.end <= end }
            .sorted { $0.slots[0].start < $1.slots[0].start }
        guard range.first?.slots[0].start == start, range.last?.end == end,
              zip(range, range.dropFirst()).allSatisfy({ pair in pair.0.end == pair.1.slots[0].start }) else { return nil }
        return .init(date: first.date, start: start, end: end)
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
