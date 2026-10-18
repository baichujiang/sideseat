import Foundation

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
    let invitations: [Invitation]?
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
    var rows: [String] {
        let cells = self.cells
        return dates.map { date in cells.filter { $0.date == date } }
            .max(by: { $0.count < $1.count })?.map(\.row) ?? []
    }
}

struct NativeTimePollList: Decodable, Sendable {
    let polls: [Item]
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
}

struct SendPollInvitationsRequest: Encodable, Sendable {
    let start: String
    var end: String? = nil
    let attendeeIds: [String]
    let version: Int
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
