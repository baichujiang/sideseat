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

struct NativeDiscoveryActivity: Codable, Hashable, Sendable {
    let topic: NativeWeeklyIntentTopic
    let activityText: String?
    let studyGoal: String?
    let sportTag: NativeSportTag?
    let sportOtherNote: String?

    var title: String {
        if topic == .sports, let sportTag {
            return sportTag == .other ? (sportOtherNote ?? sportTag.title) : sportTag.title
        }
        return (topic == .study ? studyGoal : activityText) ?? topic.title
    }
}

struct NativeActivityFit: Codable, Hashable, Sendable {
    let policyVersion: String
    let basis: String
    let score: Int
    let activityPoints: Int
    let timePoints: Int?
    let languagePoints: Int
    let schoolPoints: Int
    let overlapMinutes: Int?
    let viewerActivityText: String?
    let peerActivityText: String?
    var differences: [String]? = nil
    var viewerActivity: NativeDiscoveryActivity? = nil
    var peerActivity: NativeDiscoveryActivity? = nil

    var isRelatedActivity: Bool { basis == "RELATED_ACTIVITY" }
    var isDiscovery: Bool { policyVersion == "DISCOVERY_FIT_V1" }
    var isDifferentActivity: Bool { basis == "DIFFERENT_ACTIVITY" }
    var differenceHints: [String] {
        (differences ?? []).compactMap { code in
            let key: String
            switch code {
            case "ACTIVITY": key = "Different activities — see what you could enjoy together."
            case "TIME": key = "Times do not overlap yet — a different time would need agreement."
            case "TIME_UNDECIDED": key = "Timing is still open — discuss it together."
            case "LANGUAGE": key = "No shared language listed — check how you would communicate."
            case "SCHOOL": key = "Different or unspecified schools — agree on a convenient place."
            case "COURSE": key = "Different course preferences — the course is not agreed."
            default: return nil
            }
            return AppLocalization.string(String.LocalizationValue(key))
        }
    }
    var breakdown: String {
        guard let timePoints else {
            return AppLocalization.string("Activity fit uses your activities, shared language and school. Timing is discussed separately.")
        }
        return String(format: AppLocalization.string(
            "Activity %d/50 · Time %d/30 · Language %d/10 · School %d/10"
        ), activityPoints, timePoints, languagePoints, schoolPoints)
    }
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
    let startsAt: String?
    let endsAt: String?
    let expiresAt: String
    let peer: NativeMutualOpportunityPeer
    let viewerDecision: String?
    let coordination: NativeMutualOpportunityCoordination?
    let version: Int
    var isRepeat: Bool? = nil
    var matchFit: NativeActivityFit? = nil
    var timeContext: NativeIntentTimePreference? = nil

    var startDate: Date? { startsAt.flatMap(Date.sideSeatChatISO8601) }
    var endDate: Date? { endsAt.flatMap(Date.sideSeatChatISO8601) }
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
        if isRepeat == true { return AppLocalization.string("Another chance to do something together") }
        if matchFit?.isDiscovery == true { return AppLocalization.string("A possibility to explore") }
        if matchFit?.isRelatedActivity == true { return AppLocalization.string("Similar interests, details to agree") }
        return effectiveMatchKind == .sharedContext
            ? AppLocalization.string("Same-place match")
            : AppLocalization.string("Same activity")
    }
    var matchExplanation: String {
        if matchFit?.isDiscovery == true {
            return AppLocalization.string("Ranked by relevance, not filtered for a perfect fit. Both of you choose whether to chat; the activity and time still need agreement.")
        }
        if matchFit?.isRelatedActivity == true {
            return AppLocalization.string("You chose the same category, but different activities. See if you can agree on something together.")
        }
        return effectiveMatchKind == .sharedContext
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
