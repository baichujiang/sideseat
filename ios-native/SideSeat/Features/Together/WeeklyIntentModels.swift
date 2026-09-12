import Foundation

enum NativeWeeklyIntentTopic: String, Codable, CaseIterable, Identifiable, Sendable {
    case coffee = "COFFEE"
    case study = "STUDY"
    case sports = "SPORTS"
    case explore = "EXPLORE"
    case food = "FOOD"
    case events = "EVENTS"

    var id: String { rawValue }

    var title: String {
        switch self {
        case .coffee: AppLocalization.string("Coffee")
        case .study: AppLocalization.string("Study")
        case .sports: AppLocalization.string("Sports")
        case .explore: AppLocalization.string("Explore")
        case .food: AppLocalization.string("Food")
        case .events: AppLocalization.string("Events")
        }
    }

    var systemImage: String {
        switch self {
        case .coffee: "cup.and.saucer.fill"
        case .study: "book.fill"
        case .sports: "figure.run"
        case .explore: "map.fill"
        case .food: "fork.knife"
        case .events: "ticket.fill"
        }
    }
}

enum NativeSportTag: String, Codable, CaseIterable, Identifiable, Sendable {
    case basketball = "BASKETBALL"
    case badminton = "BADMINTON"
    case tableTennis = "TABLE_TENNIS"
    case football = "FOOTBALL"
    case volleyball = "VOLLEYBALL"
    case tennis = "TENNIS"
    case gym = "GYM"
    case running = "RUNNING"
    case hiking = "HIKING"
    case cycling = "CYCLING"
    case swimming = "SWIMMING"
    case skiing = "SKIING"
    case climbing = "CLIMBING"
    case yoga = "YOGA"
    case other = "OTHER"

    var id: String { rawValue }

    static var commonSuggestions: [Self] {
        allCases.filter { $0 != .other }
    }

    var title: String {
        AppLocalization.string(localizationKey)
    }

    fileprivate var inputAliases: [String] {
        [
            title,
            rawValue.replacingOccurrences(of: "_", with: " "),
        ]
    }

    private var localizationKey: String.LocalizationValue {
        switch self {
        case .basketball: "Basketball"
        case .badminton: "Badminton"
        case .tableTennis: "Table tennis"
        case .football: "Football"
        case .volleyball: "Volleyball"
        case .tennis: "Tennis"
        case .gym: "Gym"
        case .running: "Running"
        case .hiking: "Hiking"
        case .cycling: "Cycling"
        case .swimming: "Swimming"
        case .skiing: "Skiing"
        case .climbing: "Climbing"
        case .yoga: "Yoga"
        case .other: "Other sport"
        }
    }
}

struct NativeSportInput: Equatable, Sendable {
    let tag: NativeSportTag?
    let otherNote: String?

    static func normalized(_ text: String) -> Self {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else {
            return Self(tag: nil, otherNote: nil)
        }
        let normalizedInput = normalizedText(trimmed)
        if let known = NativeSportTag.commonSuggestions.first(where: { sport in
            sport.inputAliases.contains { alias in
                normalizedText(alias) == normalizedInput
            }
        }) {
            return Self(tag: known, otherNote: nil)
        }
        return Self(tag: .other, otherNote: trimmed)
    }

    static func displayText(tag: NativeSportTag?, otherNote: String?) -> String {
        guard let tag else { return "" }
        if tag == .other {
            return otherNote?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        }
        return tag.title
    }

    static func suggestions(matching text: String, limit: Int = 5) -> [NativeSportTag] {
        let query = normalizedText(text)
        guard !query.isEmpty, limit > 0 else { return [] }
        return NativeSportTag.commonSuggestions
            .filter { sport in
                sport.inputAliases.contains { normalizedText($0).contains(query) }
            }
            .prefix(limit)
            .map { $0 }
    }

    private static func normalizedText(_ text: String) -> String {
        text
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .folding(options: [.caseInsensitive, .diacriticInsensitive], locale: .current)
    }
}

enum NativeTogetherMode: String, Codable, CaseIterable, Identifiable, Sendable {
    case sameActivity = "SAME_ACTIVITY"
    case parallel = "PARALLEL"
    case either = "EITHER"

    var id: String { rawValue }

    var studyTitle: String {
        switch self {
        case .sameActivity:
            AppLocalization.string("Study the same thing together")
        case .parallel:
            AppLocalization.string("Study separately in the same place")
        case .either:
            AppLocalization.string("Either works for me")
        }
    }
}

struct NativeTogetherIntentDetails: Equatable, Sendable {
    let togetherMode: NativeTogetherMode
    let studyGoal: String?

    static func normalized(
        topic: NativeWeeklyIntentTopic,
        togetherMode: NativeTogetherMode,
        studyGoal: String
    ) -> Self {
        guard topic == .study else {
            return Self(togetherMode: .sameActivity, studyGoal: nil)
        }
        let normalizedGoal = studyGoal.trimmingCharacters(in: .whitespacesAndNewlines)
        return Self(
            togetherMode: togetherMode,
            studyGoal: normalizedGoal.isEmpty ? nil : normalizedGoal
        )
    }
}

struct NativeWeeklyIntentTimeWindow: Codable, Hashable, Sendable {
    let startAt: Date
    let endAt: Date
}

enum NativeWeeklyIntentTimeRules {
    static let minuteInterval = 15
    static let minimumDuration: TimeInterval = 30 * 60
    static let minimumMatchingLeadTime: TimeInterval = 30 * 60

    static func roundedUpToQuarterHour(
        _ date: Date,
        calendar: Calendar = .current
    ) -> Date {
        let components = calendar.dateComponents(
            [.era, .year, .month, .day, .hour, .minute],
            from: date
        )
        guard let minuteStart = calendar.date(from: components) else { return date }
        let minute = calendar.component(.minute, from: minuteStart)
        let remainder = minute % minuteInterval
        let containsSubminute = date.timeIntervalSince(minuteStart) > 0.001
        let minutesToAdd: Int
        if remainder == 0 {
            minutesToAdd = containsSubminute ? minuteInterval : 0
        } else {
            minutesToAdd = minuteInterval - remainder
        }
        return calendar.date(byAdding: .minute, value: minutesToAdd, to: minuteStart) ?? date
    }

    static func minimumEnd(after start: Date) -> Date {
        start.addingTimeInterval(minimumDuration)
    }

    static func defaultWindow(startingAt date: Date) -> NativeWeeklyIntentTimeWindow {
        let start = roundedUpToQuarterHour(
            date.addingTimeInterval(minimumMatchingLeadTime)
        )
        return NativeWeeklyIntentTimeWindow(startAt: start, endAt: minimumEnd(after: start))
    }
}

enum NativeWeeklyIntentSubmissionRules {
    static func normalizedCourseID(
        topic: NativeWeeklyIntentTopic,
        courseID: String?
    ) -> String? {
        guard topic == .study else { return nil }
        let trimmed = courseID?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        return trimmed.isEmpty ? nil : trimmed
    }
}

struct NativeWeeklyIntentCourse: Codable, Hashable, Sendable {
    let id: String
    let code: String?
    let name: String
}

struct NativeIntentTimePreference: Codable, Hashable, Sendable {
    var kind: String
    var startDate: String? = nil
    var endDate: String? = nil
    var period: String? = nil

    static func dateKey(_ date: Date, timeZone: TimeZone = .current) -> String {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.timeZone = timeZone
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter.string(from: date)
    }

    static func date(_ key: String?) -> Date? {
        guard let key else { return nil }
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.timeZone = .current
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter.date(from: key)
    }

    var summary: String {
        guard kind == "FLEXIBLE", let first = Self.date(startDate), let last = Self.date(endDate) else {
            return AppLocalization.string("Time to discuss")
        }
        let style = Date.FormatStyle.dateTime.month(.abbreviated).day().locale(AppLocalization.selectedLanguage.locale)
        let dates = first == last ? first.formatted(style) : "\(first.formatted(style)) – \(last.formatted(style))"
        let part = Self.periodTitle(period ?? "ANY")
        return "\(dates) · \(part) · \(AppLocalization.string("Time to discuss"))"
    }

    static func periodTitle(_ value: String) -> String {
        AppLocalization.string(String.LocalizationValue(["ANY": "Any part of the day", "MORNING": "Morning", "AFTERNOON": "Afternoon", "EVENING": "Evening"][value] ?? "Any part of the day"))
    }
}

struct NativeWeeklyIntent: Codable, Identifiable, Hashable, Sendable {
    let id: String
    let topic: NativeWeeklyIntentTopic
    let activityText: String?
    let sportTag: NativeSportTag?
    let sportOtherNote: String?
    let togetherMode: NativeTogetherMode?
    let studyGoal: String?
    let courseId: String?
    let course: NativeWeeklyIntentCourse?
    let timeWindows: [NativeWeeklyIntentTimeWindow]
    let timeZone: String
    let note: String?
    let status: String
    let policyVersion: Int
    let version: Int
    let expiresAt: Date
    let pausedAt: Date?
    let endedAt: Date?
    let createdAt: Date
    let updatedAt: Date
    var timePreference: NativeIntentTimePreference? = nil
    var automaticMatching: Bool? = nil
    var exploreVisible: Bool? = nil

    var isPaused: Bool { status == "PAUSED" }
    var effectiveTogetherMode: NativeTogetherMode { togetherMode ?? .sameActivity }

    var activityTitle: String {
        if topic == .study,
           let studyGoal,
           !studyGoal.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        {
            return studyGoal
        }
        if topic != .sports,
           let activityText,
           !activityText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        {
            return activityText
        }
        guard topic == .sports else { return topic.title }
        let sportTitle = NativeSportInput.displayText(
            tag: sportTag,
            otherNote: sportOtherNote
        )
        if !sportTitle.isEmpty {
            return sportTitle
        }
        return topic.title
    }

    func relevantTimeWindows(now: Date = Date()) -> [NativeWeeklyIntentTimeWindow] {
        let ordered = timeWindows.sorted {
            $0.startAt == $1.startAt
                ? $0.endAt < $1.endAt
                : $0.startAt < $1.startAt
        }
        let upcoming = ordered.filter { $0.endAt > now }
        return upcoming.isEmpty ? ordered : upcoming
    }
}

struct NativeWeeklyIntentPayload: Decodable, Sendable {
    let intents: [NativeWeeklyIntent]
    let intent: NativeWeeklyIntent?

    private enum CodingKeys: String, CodingKey {
        case intents
        case intent
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        let legacyIntent = try container.decodeIfPresent(
            NativeWeeklyIntent.self,
            forKey: .intent
        )
        let collection = try container.decodeIfPresent(
            [NativeWeeklyIntent].self,
            forKey: .intents
        )
        intents = collection ?? legacyIntent.map { [$0] } ?? []
        intent = legacyIntent ?? intents.first
    }
}

struct NativeWeeklyIntentCreateRequest: Encodable, Sendable {
    let topic: NativeWeeklyIntentTopic
    let activityText: String?
    let sportTag: NativeSportTag?
    let sportOtherNote: String?
    let togetherMode: NativeTogetherMode
    let studyGoal: String?
    let courseId: String?
    let timeWindows: [NativeWeeklyIntentTimeWindow]
    let timeZone: String
    let note: String?
    var timePreference: NativeIntentTimePreference? = nil
    var automaticMatching: Bool? = nil
    var exploreVisible: Bool? = nil
}

struct NativeWeeklyIntentEditRequest: Encodable, Sendable {
    let action = "EDIT"
    let expectedVersion: Int
    let topic: NativeWeeklyIntentTopic
    let activityText: String?
    let sportTag: NativeSportTag?
    let sportOtherNote: String?
    let togetherMode: NativeTogetherMode
    let studyGoal: String?
    let courseId: String?
    let timeWindows: [NativeWeeklyIntentTimeWindow]
    let timeZone: String
    let note: String?
    var timePreference: NativeIntentTimePreference? = nil
    var automaticMatching: Bool? = nil
    var exploreVisible: Bool? = nil

    private enum CodingKeys: String, CodingKey {
        case action
        case expectedVersion
        case topic
        case activityText
        case sportTag
        case sportOtherNote
        case togetherMode
        case studyGoal
        case courseId
        case timeWindows
        case timePreference
        case automaticMatching
        case exploreVisible
        case timeZone
        case note
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(action, forKey: .action)
        try container.encode(expectedVersion, forKey: .expectedVersion)
        try container.encode(topic, forKey: .topic)
        if let activityText {
            try container.encode(activityText, forKey: .activityText)
        } else {
            try container.encodeNil(forKey: .activityText)
        }
        if let sportTag {
            try container.encode(sportTag, forKey: .sportTag)
        } else {
            try container.encodeNil(forKey: .sportTag)
        }
        if let sportOtherNote {
            try container.encode(sportOtherNote, forKey: .sportOtherNote)
        } else {
            try container.encodeNil(forKey: .sportOtherNote)
        }
        try container.encode(togetherMode, forKey: .togetherMode)
        if let studyGoal {
            try container.encode(studyGoal, forKey: .studyGoal)
        } else {
            // EDIT uses an explicit null when switching away from Study.
            try container.encodeNil(forKey: .studyGoal)
        }
        if let courseId {
            try container.encode(courseId, forKey: .courseId)
        } else {
            // EDIT uses an explicit null to remove an existing course scope.
            try container.encodeNil(forKey: .courseId)
        }
        try container.encode(timeWindows, forKey: .timeWindows)
        try container.encodeIfPresent(timePreference, forKey: .timePreference)
        try container.encodeIfPresent(automaticMatching, forKey: .automaticMatching)
        try container.encodeIfPresent(exploreVisible, forKey: .exploreVisible)
        try container.encode(timeZone, forKey: .timeZone)
        try container.encodeIfPresent(note, forKey: .note)
        if note == nil {
            try container.encodeNil(forKey: .note)
        }
    }
}

struct NativeWeeklyIntentStateRequest: Encodable, Sendable {
    let action: String
    let expectedVersion: Int
    var automaticMatching: Bool? = nil
}

struct NativeWeeklyIntentEndRequest: Encodable, Sendable {
    let expectedVersion: Int
}

enum NativeTogetherMatchingSessionState: String, Codable, Sendable {
    case idle = "IDLE"
    case matching = "MATCHING"
    case expired = "EXPIRED"
}

struct NativeTogetherMatchingSession: Decodable, Equatable, Sendable {
    let state: NativeTogetherMatchingSessionState
    let startedAt: String?
    let matchingUntil: String?
    let stoppedAt: String?
    let version: Int

    private enum CodingKeys: String, CodingKey {
        case state
        case startedAt
        case matchingUntil
        case stoppedAt
        case version
    }

    init(
        state: NativeTogetherMatchingSessionState,
        startedAt: String?,
        matchingUntil: String?,
        stoppedAt: String?,
        version: Int
    ) {
        self.state = state
        self.startedAt = startedAt
        self.matchingUntil = matchingUntil
        self.stoppedAt = stoppedAt
        self.version = version
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        // Older accounts have no stored session yet. Treat an empty projection as
        // IDLE so the explicit start control remains available.
        state = try container.decodeIfPresent(
            NativeTogetherMatchingSessionState.self,
            forKey: .state
        ) ?? .idle
        startedAt = try container.decodeIfPresent(String.self, forKey: .startedAt)
        matchingUntil = try container.decodeIfPresent(String.self, forKey: .matchingUntil)
        stoppedAt = try container.decodeIfPresent(String.self, forKey: .stoppedAt)
        version = try container.decodeIfPresent(Int.self, forKey: .version) ?? 0
    }

    static let idle = Self(
        state: .idle,
        startedAt: nil,
        matchingUntil: nil,
        stoppedAt: nil,
        version: 0
    )

    var matchingUntilDate: Date? {
        matchingUntil.flatMap(Date.sideSeatChatISO8601)
    }

    var startedAtDate: Date? {
        startedAt.flatMap(Date.sideSeatChatISO8601)
    }

    func isMatching(at now: Date = Date()) -> Bool {
        guard state == .matching,
              let matchingUntilDate
        else {
            return false
        }
        return matchingUntilDate > now
    }

    func hasExpired(at now: Date = Date()) -> Bool {
        if state == .expired {
            return true
        }
        guard state == .matching, let matchingUntilDate else { return false }
        return matchingUntilDate <= now
    }

    func remainingFraction(at now: Date = Date()) -> Double? {
        guard isMatching(at: now),
              let startedAtDate,
              let matchingUntilDate
        else {
            return nil
        }
        let total = matchingUntilDate.timeIntervalSince(startedAtDate)
        guard total > 0 else { return nil }
        let remaining = matchingUntilDate.timeIntervalSince(now)
        return min(max(remaining / total, 0), 1)
    }

    func remainingText(at now: Date = Date()) -> String? {
        guard isMatching(at: now), let matchingUntilDate else { return nil }
        let seconds = matchingUntilDate.timeIntervalSince(now)
        if seconds >= 24 * 60 * 60 {
            let days = Int64(floor(seconds / (24 * 60 * 60)))
            let hours = Int64(floor(seconds.truncatingRemainder(dividingBy: 24 * 60 * 60) / (60 * 60)))
            if hours == 0 {
                return days == 1
                    ? AppLocalization.string("1 day remaining")
                    : String(
                        format: AppLocalization.string("%lld days remaining"),
                        days
                    )
            }
            if days == 1, hours == 1 {
                return AppLocalization.string("1 day, 1 hour remaining")
            }
            if days == 1 {
                return String(
                    format: AppLocalization.string("1 day, %lld hours remaining"),
                    hours
                )
            }
            return String(
                format: AppLocalization.string("%lld days, %lld hours remaining"),
                days,
                hours
            )
        }
        if seconds >= 60 * 60 {
            let hours = max(Int64(1), Int64(floor(seconds / (60 * 60))))
            if hours == 1 {
                return AppLocalization.string("1 hour remaining")
            }
            return String(
                format: AppLocalization.string("%lld hours remaining"),
                hours
            )
        }
        let minutes = max(Int64(1), Int64(ceil(seconds / 60)))
        if minutes == 1 {
            return AppLocalization.string("1 minute remaining")
        }
        return String(
            format: AppLocalization.string("%lld minutes remaining"),
            minutes
        )
    }
}


/// Display state follows participation, not merely a stored ACTIVE row.
enum TogetherIntentStatus: String, Equatable, Sendable {
    case finding, paused, unpublished, unavailable, expired, ended

    init(intent: NativeWeeklyIntent, matchingEnabled: Bool,
         automaticMatchingEnabled: Bool, legacySessionActive: Bool, now: Date = Date()) {
        if intent.status == "ENDED" { self = .ended }
        else if intent.status == "EXPIRED" || intent.expiresAt <= now { self = .expired }
        else if intent.isPaused { self = .paused }
        else if !matchingEnabled { self = .unavailable }
        else if (automaticMatchingEnabled && intent.automaticMatching == true) || legacySessionActive { self = .finding }
        else { self = .unpublished }
    }

    var title: String {
        switch self {
        case .finding: AppLocalization.string("Finding company")
        case .paused: AppLocalization.string("Intention paused")
        case .unpublished: AppLocalization.string("Not finding yet")
        case .unavailable: AppLocalization.string("Finding unavailable")
        case .expired: AppLocalization.string("Expired")
        case .ended: AppLocalization.string("Ended")
        }
    }
    var detail: String {
        switch self {
        case .finding: AppLocalization.string("SideSeat is using this intention to find company. You can pause anytime.")
        case .paused: AppLocalization.string("This intention is paused and is not used for new suggestions.")
        case .unpublished: AppLocalization.string("This saved intention is not participating in finding company.")
        case .unavailable: AppLocalization.string("Finding company is unavailable right now. Your intention is saved.")
        case .expired: AppLocalization.string("This intention has expired and is no longer finding company.")
        case .ended: AppLocalization.string("This intention has ended and is no longer finding company.")
        }
    }
    var symbol: String {
        switch self {
        case .finding: "dot.radiowaves.left.and.right"
        case .paused: "pause.circle"
        case .unpublished: "tray"
        case .unavailable: "exclamationmark.circle"
        case .expired: "clock"
        case .ended: "stop.circle"
        }
    }
}
