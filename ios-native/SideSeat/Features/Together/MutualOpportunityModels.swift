import Foundation

enum NativeMutualOpportunityMatchKind: String, Codable, Sendable {
    case exactActivity = "EXACT_ACTIVITY"
    case sharedContext = "SHARED_CONTEXT"
}

enum NativeMutualOpportunitySharedContext: String, Codable, Sendable {
    case parallelStudy = "PARALLEL_STUDY"
}

struct NativeMutualOpportunityCourse: Codable, Hashable, Sendable {
    let id: String
    let code: String?
    let name: String
}

struct NativeMutualOpportunityPeer: Codable, Hashable, Sendable {
    let displayName: String
    let avatarUrl: String?
    let verifiedStudent: Bool
    let major: String?
    let semester: Int?
    let sharedLanguages: [String]
}

struct NativeMutualOpportunityCoordination: Codable, Hashable, Sendable {
    let connectionId: String
}

struct NativeMutualOpportunity: Codable, Identifiable, Hashable, Sendable {
    let id: String
    let policyVersion: String
    let state: String
    let viewerIntentId: String?
    let topic: NativeWeeklyIntentTopic
    let activityText: String?
    let sportTag: NativeSportTag?
    let sportOtherNote: String?
    let viewerTogetherMode: NativeTogetherMode?
    let peerTogetherMode: NativeTogetherMode?
    let viewerStudyGoal: String?
    let peerStudyGoal: String?
    let matchKind: NativeMutualOpportunityMatchKind?
    let sharedContext: NativeMutualOpportunitySharedContext?
    let course: NativeMutualOpportunityCourse?
    let startsAt: String
    let endsAt: String
    let expiresAt: String
    let peer: NativeMutualOpportunityPeer
    let viewerDecision: String?
    let coordination: NativeMutualOpportunityCoordination?
    let version: Int

    var startDate: Date? { Date.sideSeatChatISO8601(startsAt) }
    var endDate: Date? { Date.sideSeatChatISO8601(endsAt) }
    var isReadyToCoordinate: Bool {
        state == "READY_TO_COORDINATE" && coordination != nil
    }
    var hasPrivateYes: Bool {
        state == "DECIDED" && viewerDecision == "YES"
    }
    var needsViewerDecision: Bool {
        state == "NEEDS_DECISION" && viewerDecision == nil
    }
    var effectiveMatchKind: NativeMutualOpportunityMatchKind {
        matchKind ?? .exactActivity
    }
    var effectiveViewerTogetherMode: NativeTogetherMode {
        viewerTogetherMode ?? .sameActivity
    }
    var effectivePeerTogetherMode: NativeTogetherMode {
        peerTogetherMode ?? .sameActivity
    }
    var matchTitle: String {
        effectiveMatchKind == .sharedContext
            ? AppLocalization.string("Same-place match")
            : AppLocalization.string("Same activity")
    }
    var matchExplanation: String {
        effectiveMatchKind == .sharedContext
            ? AppLocalization.string(
                "You can study in the same place while working on different things."
            )
            : AppLocalization.string("You both want to do the same activity.")
    }
    var matchContextTitle: String {
        if effectiveMatchKind == .sharedContext,
           sharedContext == .parallelStudy
        {
            return AppLocalization.string("Library or study space")
        }
        return activityTitle
    }
    var viewerStudyGoalTitle: String {
        normalizedStudyGoal(viewerStudyGoal)
    }
    var peerStudyGoalTitle: String {
        normalizedStudyGoal(peerStudyGoal)
    }
    var activityTitle: String {
        if topic != .study,
           topic != .sports,
           let activityText,
           !activityText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        {
            return activityText
        }
        guard topic == .sports, let sportTag else { return topic.title }
        if sportTag == .other,
           let sportOtherNote,
           !sportOtherNote.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        {
            return sportOtherNote
        }
        return sportTag.title
    }

    private func normalizedStudyGoal(_ goal: String?) -> String {
        guard let goal,
              !goal.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        else {
            return AppLocalization.string("Study")
        }
        return goal
    }
}

struct NativeMutualOpportunitiesPayload: Decodable, Sendable {
    let opportunities: [NativeMutualOpportunity]
}

struct NativeMutualOpportunityDecisionRequest: Encodable, Sendable {
    let decision: String
}
