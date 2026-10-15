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
    let invitationVersion: Int?
    let chosenStart: Date?
    let chosenEnd: Date?
    let invitations: [Invitation]?
    var planningPhase: String { phase ?? "COLLECTING" }
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
    var rows: [String] {
        dates.map { date in slots.filter { $0.date == date } }
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
        let chosenStart: Date?
        let chosenEnd: Date?
        let expectedCount: Int?
        let respondedCount: Int?
        let acceptedCount: Int?
        let invitedCount: Int?
        let myInvitationStatus: String?
        let isIncluded: Bool?
        var statusLabel: String {
            switch phase ?? "COLLECTING" {
            case "INVITING": AppLocalization.string("Awaiting confirmations")
            case "CONFIRMED": AppLocalization.string("Confirmed")
            case "CANCELLED": AppLocalization.string("Cancelled")
            default: AppLocalization.string("Finding a time")
            }
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
    /// Paint a rectangle once; revisiting cells during a drag does not toggle them.
    static func rectangle(slots: [NativeTimePoll.Slot], dates: [String], rows: [String], from: (Int, Int), to: (Int, Int), original: Set<Int>, selecting: Bool) -> Set<Int> {
        let columns = min(from.0, to.0)...max(from.0, to.0)
        let rowRange = min(from.1, to.1)...max(from.1, to.1)
        let ids = Set(slots.filter { slot in
            guard let column = dates.firstIndex(of: slot.date), let row = rows.firstIndex(of: slot.row) else { return false }
            return columns.contains(column) && rowRange.contains(row)
        }.map(\.id))
        return selecting ? original.union(ids) : original.subtracting(ids)
    }
}
