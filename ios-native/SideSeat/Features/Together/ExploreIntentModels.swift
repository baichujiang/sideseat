import Foundation

struct NativeExploreIntentCourse: Codable, Hashable, Sendable {
    let code: String?
    let name: String

    var title: String {
        [code, name].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " ")
    }
}

struct NativeExploreIntentTime: Codable, Hashable, Sendable {
    let kind: String
    let startDate: String?
    let endDate: String?
    let period: String

    var summary: String {
        guard let first = NativeIntentTimePreference.date(startDate) else {
            return AppLocalization.string("Time to discuss")
        }
        let last = NativeIntentTimePreference.date(endDate) ?? first
        let style = Date.FormatStyle.dateTime.month(.abbreviated).day().locale(AppLocalization.selectedLanguage.locale)
        let dates = Calendar.current.isDate(first, inSameDayAs: last)
            ? first.formatted(style)
            : "\(first.formatted(style)) – \(last.formatted(style))"
        return "\(dates) · \(NativeIntentTimePreference.periodTitle(period))"
    }
}

struct NativeExploreIntent: Codable, Identifiable, Hashable, Sendable {
    let id: String
    let topic: NativeWeeklyIntentTopic
    let togetherMode: NativeTogetherMode?
    let studyGoal: String?
    let activityText: String?
    let sportTag: NativeSportTag?
    let sportOtherNote: String?
    let course: NativeExploreIntentCourse?
    let time: NativeExploreIntentTime
    let descriptionPreview: String?
    let campus: String
    let verifiedStudent: Bool
    let languages: [String]
    let expiresAt: Date
    let createdAt: Date

    var activityTitle: String {
        if topic == .study, let studyGoal, !studyGoal.isEmpty { return studyGoal }
        if topic == .sports {
            let sport = NativeSportInput.displayText(tag: sportTag, otherNote: sportOtherNote)
            return sport.isEmpty ? topic.title : sport
        }
        if let activityText, !activityText.isEmpty { return activityText }
        return topic.title
    }

    var primaryLanguageTitle: String? {
        guard let language = languages.first else { return nil }
        return AppLocalization.string(String.LocalizationValue([
            "CHINESE": "Chinese", "ENGLISH": "English", "GERMAN": "German",
            "FRENCH": "French", "HINDI": "Hindi", "SPANISH": "Spanish", "OTHER": "Other"
        ][language] ?? "Other"))
    }
}

struct NativeExploreIntentPayload: Decodable, Sendable {
    let intents: [NativeExploreIntent]
    let hasMore: Bool
}

enum ExploreAccessTier: Equatable, Sendable {
    case free
    case plus

    static var current: Self {
        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("--ui-testing-explore-plus") { return .plus }
        #endif
        return .free
    }

    var resultLimit: Int { self == .plus ? 10 : 5 }
    var showsAdvancedContext: Bool { self == .plus }
}
