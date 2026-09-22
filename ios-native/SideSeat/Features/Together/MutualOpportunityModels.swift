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

    /// The card keeps a stable two-row scan pattern: activity first, timing second.
    /// Secondary differences remain available in the expanded explanation below.
    var differenceHints: [String] {
        guard isDiscovery else { return detailedDifferenceHints }
        return [activitySummaryHint, timeSummaryHint]
    }

    private var activitySummaryHint: String {
        if differenceCodes.contains("ACTIVITY") {
            return localizedDifference("ACTIVITY")
                ?? AppLocalization.string("Different activities — see what you could enjoy together.")
        }
        return AppLocalization.string("Same activity")
    }

    private var timeSummaryHint: String {
        if differenceCodes.contains("TIME") {
            return localizedDifference("TIME")
                ?? AppLocalization.string("Times do not overlap yet — a different time would need agreement.")
        }
        if differenceCodes.contains("TIME_UNDECIDED") {
            return localizedDifference("TIME_UNDECIDED")
                ?? AppLocalization.string("Timing is still open — discuss it together.")
        }
        if let overlapMinutes, overlapMinutes > 0 {
            return String(
                format: AppLocalization.string("%d minutes of shared availability"),
                overlapMinutes
            )
        }
        if let timePoints, timePoints > 0 {
            return AppLocalization.string("Available together")
        }
        return AppLocalization.string("Time to discuss")
    }

    private var differenceCodes: Set<String> {
        Set(differences ?? [])
    }

    private var detailedDifferenceHints: [String] {
        (differences ?? []).compactMap(localizedDifference)
    }

    private func localizedDifference(_ code: String) -> String? {
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

    var breakdown: String {
        let scoreBreakdown: String
        if let timePoints {
            scoreBreakdown = String(format: AppLocalization.string(
                "Activity %d/50 · Time %d/30 · Language %d/10 · School %d/10"
            ), activityPoints, timePoints, languagePoints, schoolPoints)
        } else {
            scoreBreakdown = AppLocalization.string(
                "Activity fit uses your activities, shared language and school. Timing is discussed separately."
            )
        }

        guard isDiscovery, !detailedDifferenceHints.isEmpty else {
            return scoreBreakdown
        }
        return (detailedDifferenceHints + [scoreBreakdown]).joined(separator: "\n")
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

/// Presentation only. Shared preferences are never a confirmed Plan.
enum NativeOpportunityCueTone: Equatable, Sendable {
    case shared
    case discuss
    case unspecified
}

extension NativeMutualOpportunity {
    var activityCueTone: NativeOpportunityCueTone {
        if matchFit?.differences?.contains("ACTIVITY") == true ||
            matchFit?.isDifferentActivity == true || matchFit?.isRelatedActivity == true ||
            effectiveMatchKind == .sharedContext {
            return .discuss
        }
        if let fit = matchFit, fit.basis != "EXACT_ACTIVITY" { return .unspecified }
        return .shared
    }

    private var cueViewerActivity: String {
        nonemptyActivity(matchFit?.viewerActivity?.title) ??
            nonemptyActivity(matchFit?.viewerActivityText) ??
            (topic == .study ? viewerStudyGoalTitle : activityTitle)
    }

    private var cuePeerActivity: String? {
        nonemptyActivity(matchFit?.peerActivity?.title) ??
            nonemptyActivity(matchFit?.peerActivityText) ??
            (topic == .study ? nonemptyActivity(peerStudyGoal) : nil)
    }

    var shortActivitySummary: String {
        switch activityCueTone {
        case .shared:
            return String(format: AppLocalization.string("Both: %@"), cueViewerActivity)
        case .discuss:
            return String(format: AppLocalization.string("You: %@ · Them: %@"),
                          cueViewerActivity, cuePeerActivity ?? AppLocalization.string("Activity to agree"))
        case .unspecified:
            return cueViewerActivity
        }
    }

    var timeCueTone: NativeOpportunityCueTone {
        // Explicit differences outrank timestamps: never invent shared availability.
        if matchFit?.differences?.contains("TIME") == true { return .discuss }
        if matchFit?.differences?.contains("TIME_UNDECIDED") == true { return .unspecified }
        if let start = startDate, let end = endDate, end > start { return .shared }
        if let timing = timeContext, timing.kind == "FLEXIBLE",
           let first = NativeIntentTimePreference.date(timing.startDate),
           let last = NativeIntentTimePreference.date(timing.endDate), first <= last {
            return .shared
        }
        return .unspecified
    }

    var shortTimeSummary: String {
        switch timeCueTone {
        case .discuss: return AppLocalization.string("Find another time")
        case .unspecified: return AppLocalization.string("Time undecided")
        case .shared:
            let locale = AppLocalization.selectedLanguage.locale
            if let start = startDate, let end = endDate, end > start {
                let first = start.formatted(.dateTime.month(.abbreviated).day().hour().minute().locale(locale))
                let endStyle: Date.FormatStyle = Calendar.current.isDate(start, inSameDayAs: end)
                    ? .dateTime.hour().minute() : .dateTime.month(.abbreviated).day().hour().minute()
                let range = "\(first)–\(end.formatted(endStyle.locale(locale)))"
                return String(format: AppLocalization.string("%@ · Shared time"), range)
            }
            if let timing = timeContext,
               let first = NativeIntentTimePreference.date(timing.startDate),
               let last = NativeIntentTimePreference.date(timing.endDate) {
                let style = Date.FormatStyle.dateTime.month(.abbreviated).day().locale(locale)
                let dates = first == last ? first.formatted(style) : "\(first.formatted(style))–\(last.formatted(style))"
                let period = timing.period.flatMap { $0 == "ANY" ? nil : NativeIntentTimePreference.periodTitle($0) }
                return [dates, period, AppLocalization.string("Similar timing")].compactMap { $0 }.joined(separator: " · ")
            }
            return AppLocalization.string("Time undecided")
        }
    }

    /// Secondary caveats stay short and factual, not a score or an explanation paragraph.
    var shortContextDifferences: [String] {
        let codes = Set(matchFit?.differences ?? [])
        return [("LANGUAGE", "Check language"), ("SCHOOL", "Different or unlisted schools"),
                ("COURSE", "Course to agree")].compactMap { code, key in
            codes.contains(code) ? AppLocalization.string(String.LocalizationValue(key)) : nil
        }
    }

    private func nonemptyActivity(_ value: String?) -> String? {
        guard let trimmed = value?.trimmingCharacters(in: .whitespacesAndNewlines), !trimmed.isEmpty else { return nil }
        return trimmed
    }
}
