import Foundation

struct NativeScheduleShareCreatePayload: Decodable, Sendable {
    let shareUrl: String
    let token: String?
    let linkId: String
    let message: NativeDirectMessage
}

struct NativeScheduleShareChatPreview: Decodable, Sendable {
    let snapshot: NativeScheduleShareSnapshot
    let expired: Bool
    let ownerDisplayLabel: String
}

struct NativeScheduleShareBlock: Decodable, Hashable, Sendable {
    let kind: String
    let start: String
    let end: String
    let title: String?
    let location: String?
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
