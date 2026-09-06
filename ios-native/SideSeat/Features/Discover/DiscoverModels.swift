import Foundation

struct NativeProductFunnelBatch: Encodable, Sendable {
    let events: [NativeProductFunnelEvent]
}

struct NativeProductFunnelEvent: Encodable, Sendable {
    let clientEventId: String
    let name: String
    let surface: String
    let sourceKind: String
    let sourceId: String
    let occurredAt: String
    let metadata: NativeProductFunnelMetadata?
}

struct NativeProductFunnelMetadata: Encodable, Sendable {
    let reasonCodes: [String]?
    let visibilityDurationMs: Int?

    init(reasonCodes: [String]? = nil, visibilityDurationMs: Int? = nil) {
        self.reasonCodes = reasonCodes
        self.visibilityDurationMs = visibilityDurationMs
    }
}

struct NativeProductFunnelAcceptance: Decodable, Sendable {
    let accepted: Int
    let deduplicated: Int
}

@propertyWrapper
struct DiscoverDefaultZero: Decodable, Sendable {
    var wrappedValue: Int

    init(wrappedValue: Int) {
        self.wrappedValue = wrappedValue
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        wrappedValue = try container.decode(Int.self)
    }
}

@propertyWrapper
struct DiscoverDefaultFalse: Decodable, Sendable {
    var wrappedValue: Bool

    init(wrappedValue: Bool) {
        self.wrappedValue = wrappedValue
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        wrappedValue = try container.decode(Bool.self)
    }
}

extension KeyedDecodingContainer {
    func decode(_ type: DiscoverDefaultZero.Type, forKey key: Key) throws -> DiscoverDefaultZero {
        try decodeIfPresent(type, forKey: key) ?? DiscoverDefaultZero(wrappedValue: 0)
    }

    func decode(_ type: DiscoverDefaultFalse.Type, forKey key: Key) throws -> DiscoverDefaultFalse {
        try decodeIfPresent(type, forKey: key) ?? DiscoverDefaultFalse(wrappedValue: false)
    }
}

enum DiscoverFeedKind: String, CaseIterable, Identifiable {
    case buddies
    case activities

    var id: String { rawValue }

    var title: LocalizedStringResource {
        switch self {
        case .buddies: "Buddies"
        case .activities: "Activities"
        }
    }
}

struct NativeDiscoverFeed: Decodable, Sendable {
    let city: String
    let buddies: [NativeDiscoverBuddyPost]
    let activities: [NativeDiscoverActivity]
}

struct NativeExperimentAssignment: Decodable, Sendable {
    let key: String
    let eligible: Bool
    let variant: String
    let assignedAt: String
    let features: [String: Bool]

    var enablesActionToPlan: Bool {
        eligible && variant == "TREATMENT" && features["v2ActionInterest"] == true
    }
}

struct NativeExperimentsPayload: Decodable, Sendable {
    let experiments: [NativeExperimentAssignment]
}

struct NativeDiscoverRecommendation: Decodable, Identifiable, Sendable {
    let kind: String
    let reasonCodes: [String]
    let post: NativeDiscoverBuddyPost?
    let activity: NativeDiscoverActivity?

    var id: String {
        if let post { return "post-\(post.id)" }
        if let activity { return "activity-\(activity.id)" }
        return "unknown-\(kind)-\(reasonCodes.joined(separator: "-"))"
    }
}

struct NativeDiscoverRecommendationsPayload: Decodable, Sendable {
    let mode: String
    let preferenceActiveUntil: String?
    let items: [NativeDiscoverRecommendation]
}

struct NativeMyPostsPayload: Decodable, Sendable {
    let posts: [NativeDiscoverBuddyPost]
    let activities: [NativeDiscoverActivity]
}

struct NativeSavedPostsPayload: Decodable, Sendable {
    let posts: [NativeDiscoverBuddyPost]
}

enum NativeDiscoverInteractionMode: Equatable, Sendable {
    case directConversation
    case expressInterest
    case readOnly
}

struct NativeDiscoverActionCoordination: Decodable, Sendable {
    let policy: String
    let schemaVersion: Int
    let interactionMode: String
    let readOnlyReason: String?

    var usesCreatorGatedPolicy: Bool {
        policy.uppercased() == "CREATOR_GATED_V2"
    }

    var resolvedInteractionMode: NativeDiscoverInteractionMode {
        guard schemaVersion == 1 else { return .readOnly }

        switch (policy.uppercased(), interactionMode.uppercased()) {
        case ("DIRECT_CONVERSATION_V1", "DIRECT_CONVERSATION"):
            return .directConversation
        case ("CREATOR_GATED_V2", "EXPRESS_INTEREST"):
            return .expressInterest
        default:
            return .readOnly
        }
    }
}

struct NativeDiscoverBuddyPost: Decodable, Identifiable, Sendable {
    let id: String
    let category: String
    let city: String
    let title: String
    let body: String?
    let status: String
    let closureReason: String?
    let closedAt: String?
    let coordination: NativeDiscoverActionCoordination?
    let tags: [String]
    let visibility: String
    let replyPreference: String
    let startsAt: String?
    let endsAt: String?
    let location: String?
    let capacity: Int?
    let createdAt: String
    let expiresAt: String
    let isOwn: Bool
    let savedByViewer: Bool
    @DiscoverDefaultFalse var interestedByViewer: Bool
    let interestedCount: Int
    @DiscoverDefaultZero var commentCount: Int
    let imageUrls: [String]
    let linkedCourses: [NativeDiscoverLinkedCourse]
    let author: NativeDiscoverBuddyAuthor

    var expiryDate: Date? { try? Date(expiresAt, strategy: .iso8601) }
    var startDate: Date? { startsAt.flatMap { try? Date($0, strategy: .iso8601) } }
    var endDate: Date? { endsAt.flatMap { try? Date($0, strategy: .iso8601) } }
    var interactionMode: NativeDiscoverInteractionMode {
        coordination?.resolvedInteractionMode ?? .readOnly
    }
    var usesCreatorGatedCoordination: Bool {
        coordination?.usesCreatorGatedPolicy == true
    }
    var isCourseLinkedAction: Bool {
        category.uppercased() == "SHARED_COURSES"
            || visibility.uppercased() == "COURSEMATES_ONLY"
            || !linkedCourses.isEmpty
    }

    func withCoordination(
        _ coordination: NativeDiscoverActionCoordination?
    ) -> NativeDiscoverBuddyPost {
        NativeDiscoverBuddyPost(
            id: id,
            category: category,
            city: city,
            title: title,
            body: body,
            status: status,
            closureReason: closureReason,
            closedAt: closedAt,
            coordination: coordination,
            tags: tags,
            visibility: visibility,
            replyPreference: replyPreference,
            startsAt: startsAt,
            endsAt: endsAt,
            location: location,
            capacity: capacity,
            createdAt: createdAt,
            expiresAt: expiresAt,
            isOwn: isOwn,
            savedByViewer: savedByViewer,
            interestedByViewer: interestedByViewer,
            interestedCount: interestedCount,
            commentCount: commentCount,
            imageUrls: imageUrls,
            linkedCourses: linkedCourses,
            author: author
        )
    }

    func withSaved(_ saved: Bool, interestedCount: Int) -> NativeDiscoverBuddyPost {
        NativeDiscoverBuddyPost(
            id: id,
            category: category,
            city: city,
            title: title,
            body: body,
            status: status,
            closureReason: closureReason,
            closedAt: closedAt,
            coordination: coordination,
            tags: tags,
            visibility: visibility,
            replyPreference: replyPreference,
            startsAt: startsAt,
            endsAt: endsAt,
            location: location,
            capacity: capacity,
            createdAt: createdAt,
            expiresAt: expiresAt,
            isOwn: isOwn,
            savedByViewer: saved,
            interestedByViewer: interestedByViewer,
            interestedCount: interestedCount,
            commentCount: commentCount,
            imageUrls: imageUrls,
            linkedCourses: linkedCourses,
            author: author
        )
    }

    func withInterest(_ interested: Bool, interestedCount: Int) -> NativeDiscoverBuddyPost {
        NativeDiscoverBuddyPost(
            id: id,
            category: category,
            city: city,
            title: title,
            body: body,
            status: status,
            closureReason: closureReason,
            closedAt: closedAt,
            coordination: coordination,
            tags: tags,
            visibility: visibility,
            replyPreference: replyPreference,
            startsAt: startsAt,
            endsAt: endsAt,
            location: location,
            capacity: capacity,
            createdAt: createdAt,
            expiresAt: expiresAt,
            isOwn: isOwn,
            savedByViewer: savedByViewer,
            interestedByViewer: interested,
            interestedCount: max(0, interestedCount),
            commentCount: commentCount,
            imageUrls: imageUrls,
            linkedCourses: linkedCourses,
            author: author
        )
    }

    func withCommentCount(_ commentCount: Int) -> NativeDiscoverBuddyPost {
        NativeDiscoverBuddyPost(
            id: id,
            category: category,
            city: city,
            title: title,
            body: body,
            status: status,
            closureReason: closureReason,
            closedAt: closedAt,
            coordination: coordination,
            tags: tags,
            visibility: visibility,
            replyPreference: replyPreference,
            startsAt: startsAt,
            endsAt: endsAt,
            location: location,
            capacity: capacity,
            createdAt: createdAt,
            expiresAt: expiresAt,
            isOwn: isOwn,
            savedByViewer: savedByViewer,
            interestedByViewer: interestedByViewer,
            interestedCount: interestedCount,
            commentCount: max(0, commentCount),
            imageUrls: imageUrls,
            linkedCourses: linkedCourses,
            author: author
        )
    }

    func withStatus(
        _ status: String,
        closureReason: String? = nil,
        closedAt: Date? = nil
    ) -> NativeDiscoverBuddyPost {
        NativeDiscoverBuddyPost(
            id: id,
            category: category,
            city: city,
            title: title,
            body: body,
            status: status,
            closureReason: closureReason,
            closedAt: closedAt?.formatted(.iso8601),
            coordination: coordination,
            tags: tags,
            visibility: visibility,
            replyPreference: replyPreference,
            startsAt: startsAt,
            endsAt: endsAt,
            location: location,
            capacity: capacity,
            createdAt: createdAt,
            expiresAt: expiresAt,
            isOwn: isOwn,
            savedByViewer: savedByViewer,
            interestedByViewer: interestedByViewer,
            interestedCount: interestedCount,
            commentCount: commentCount,
            imageUrls: imageUrls,
            linkedCourses: linkedCourses,
            author: author
        )
    }

    func withEdits(
        title: String,
        body: String?,
        tags: [String],
        visibility: String,
        startsAt: Date?,
        endsAt: Date?,
        location: String?,
        capacity: Int?,
        expiresAt: Date,
        imageUrls: [String]
    ) -> NativeDiscoverBuddyPost {
        NativeDiscoverBuddyPost(
            id: id,
            category: category,
            city: city,
            title: title,
            body: body,
            status: status,
            closureReason: closureReason,
            closedAt: closedAt,
            coordination: coordination,
            tags: tags,
            visibility: visibility,
            replyPreference: replyPreference,
            startsAt: startsAt?.formatted(.iso8601),
            endsAt: endsAt?.formatted(.iso8601),
            location: location,
            capacity: capacity,
            createdAt: createdAt,
            expiresAt: expiresAt.formatted(.iso8601),
            isOwn: isOwn,
            savedByViewer: savedByViewer,
            interestedByViewer: interestedByViewer,
            interestedCount: interestedCount,
            commentCount: commentCount,
            imageUrls: imageUrls,
            linkedCourses: linkedCourses,
            author: author
        )
    }
}

struct DiscoverStatusPresentation: Equatable, Sendable {
    enum Tone: Equatable, Sendable {
        case success
        case warning
        case danger
        case neutral
    }

    let label: String
    let systemImage: String
    let tone: Tone
    let isOpen: Bool
}

enum BuddyPostDisplay {
    static func status(
        _ status: String,
        closureReason: String? = nil,
        expiryDate: Date? = nil,
        now: Date = Date()
    ) -> DiscoverStatusPresentation {
        let normalizedStatus = status.uppercased()

        if normalizedStatus == "ACTIVE", let expiryDate, expiryDate <= now {
            return expiredStatus
        }

        switch normalizedStatus {
        case "ACTIVE":
            return DiscoverStatusPresentation(
                label: AppLocalization.string( "Open plan"),
                systemImage: "circle.fill",
                tone: .success,
                isOpen: true
            )
        case "CLOSED" where closureReason?.uppercased() == "SCHOOL_CHANGED":
            return DiscoverStatusPresentation(
                label: AppLocalization.string( "School changed"),
                systemImage: "building.columns.fill",
                tone: .warning,
                isOpen: false
            )
        case "CLOSED":
            return DiscoverStatusPresentation(
                label: AppLocalization.string( "Closed"),
                systemImage: "lock.fill",
                tone: .neutral,
                isOpen: false
            )
        case "MATCHED":
            return DiscoverStatusPresentation(
                label: AppLocalization.string( "Matched"),
                systemImage: "checkmark.circle.fill",
                tone: .neutral,
                isOpen: false
            )
        case "EXPIRED":
            return expiredStatus
        default:
            return DiscoverStatusPresentation(
                label: status.capitalized,
                systemImage: "circle",
                tone: .neutral,
                isOpen: false
            )
        }
    }

    static func status(_ post: NativeDiscoverBuddyPost, now: Date = Date()) -> DiscoverStatusPresentation {
        status(
            post.status,
            closureReason: post.closureReason,
            expiryDate: post.expiryDate,
            now: now
        )
    }

    static func statusLabel(_ status: String) -> String {
        self.status(status).label
    }

    static func statusLabel(_ post: NativeDiscoverBuddyPost, now: Date = Date()) -> String {
        status(post, now: now).label
    }

    static func visibilityLabel(_ visibility: String) -> String {
        switch visibility.uppercased() {
        case "CITY_INTERNATIONALS":
            return AppLocalization.string( "Everyone")
        case "VERIFIED_ONLY":
            return AppLocalization.string( "Verified students")
        case "SCHOOL_ONLY":
            return AppLocalization.string( "Same school")
        case "COURSEMATES_ONLY":
            return AppLocalization.string( "Coursemates")
        default:
            return AppLocalization.string( "Visible")
        }
    }

    static func visibilitySystemImage(_ visibility: String) -> String {
        switch visibility.uppercased() {
        case "CITY_INTERNATIONALS":
            return "globe.europe.africa"
        case "VERIFIED_ONLY":
            return "checkmark.seal"
        case "SCHOOL_ONLY":
            return "building.columns"
        case "COURSEMATES_ONLY":
            return "book.closed"
        default:
            return "eye"
        }
    }

    static func replyLabel(_ preference: String) -> String {
        switch preference.uppercased() {
        case "DIRECT_MESSAGE":
            return AppLocalization.string( "Direct message")
        case "VERIFIED_ONLY":
            return AppLocalization.string( "Verified replies")
        case "REQUEST_FIRST":
            return AppLocalization.string( "Request first")
        default:
            return AppLocalization.string( "Replies")
        }
    }

    private static var expiredStatus: DiscoverStatusPresentation {
        DiscoverStatusPresentation(
            label: AppLocalization.string( "Expired"),
            systemImage: "clock.badge.exclamationmark",
            tone: .neutral,
            isOpen: false
        )
    }
}

enum DiscoverActivityDisplay {
    static func status(_ activity: NativeDiscoverActivity) -> DiscoverStatusPresentation {
        status(phase: activity.phase)
    }

    static func status(phase: String) -> DiscoverStatusPresentation {
        switch phase.lowercased() {
        case "bookable":
            return DiscoverStatusPresentation(
                label: AppLocalization.string( "Open sign-ups"),
                systemImage: "circle.fill",
                tone: .success,
                isOpen: true
            )
        case "full":
            return DiscoverStatusPresentation(
                label: AppLocalization.string( "Full"),
                systemImage: "person.2.slash",
                tone: .warning,
                isOpen: false
            )
        case "canceled":
            return DiscoverStatusPresentation(
                label: AppLocalization.string( "Canceled"),
                systemImage: "xmark.circle.fill",
                tone: .danger,
                isOpen: false
            )
        case "closed":
            return DiscoverStatusPresentation(
                label: AppLocalization.string( "Closed"),
                systemImage: "checkmark.circle.fill",
                tone: .neutral,
                isOpen: false
            )
        default:
            return DiscoverStatusPresentation(
                label: AppLocalization.string( "Ended"),
                systemImage: "clock.badge.checkmark",
                tone: .neutral,
                isOpen: false
            )
        }
    }
}

enum BuddyHashtagParser {
    static func tags(in text: String, maxCount: Int = 8, maxLength: Int = 24) -> [String] {
        guard maxCount > 0, maxLength > 0 else { return [] }
        var tags: [String] = []
        var seen = Set<String>()
        var current = ""
        var isReadingTag = false

        func appendCurrentTag() {
            guard !current.isEmpty else { return }
            let normalized = current.lowercased()
            if seen.insert(normalized).inserted {
                tags.append(normalized)
            }
            current = ""
        }

        for character in text {
            if character == "#" {
                appendCurrentTag()
                isReadingTag = true
                continue
            }
            guard isReadingTag else { continue }
            if isTagCharacter(character) {
                if current.count < maxLength {
                    current.append(character)
                }
            } else {
                appendCurrentTag()
                isReadingTag = false
            }
            if tags.count >= maxCount { return Array(tags.prefix(maxCount)) }
        }
        appendCurrentTag()
        return Array(tags.prefix(maxCount))
    }

    private static func isTagCharacter(_ character: Character) -> Bool {
        character.unicodeScalars.allSatisfy { scalar in
            CharacterSet.alphanumerics.contains(scalar) || scalar.value == 45 || scalar.value == 95
        }
    }
}

struct NativeDiscoverLinkedCourse: Decodable, Identifiable, Sendable {
    let id: String
    let code: String?
    let name: String
}

struct NativeDiscoverBuddyAuthor: Decodable, Sendable {
    let id: String
    let displayName: String
    let tagline: String?
    let avatarUrl: String?
    let major: String?
    let semester: Int?
    let studentStatus: String?
    let graduationYear: Int?
    let school: String?
    let verifiedStudent: Bool

    var studentRoleLabel: String? {
        switch studentStatus {
        case "CURRENT_STUDENT":
            return AppLocalization.string( "Current student")
        case "EXCHANGE_STUDENT":
            return AppLocalization.string( "Exchange student")
        case "ALUMNI":
            if let graduationYear {
                return String(format: AppLocalization.string( "Alumni %@"), String(graduationYear))
            }
            return AppLocalization.string( "Alumni")
        default:
            return nil
        }
    }
}

struct NativeDiscoverActivity: Decodable, Identifiable, Sendable {
    let id: String
    let city: String
    let school: String
    let title: String
    let description: String?
    let category: String?
    let startAt: String
    let endAt: String
    let location: String
    let capacity: Int?
    let status: String
    let phase: String
    let goingCount: Int
    @DiscoverDefaultZero var commentCount: Int
    let viewerSignupStatus: String?
    let isOrganizer: Bool
    let organizer: NativeDiscoverActivityOrganizer

    var startDate: Date? { try? Date(startAt, strategy: .iso8601) }
    var endDate: Date? { try? Date(endAt, strategy: .iso8601) }

    func withSignupStatus(_ signupStatus: String?, goingCount: Int, status: String, phase: String) -> NativeDiscoverActivity {
        NativeDiscoverActivity(
            id: id,
            city: city,
            school: school,
            title: title,
            description: description,
            category: category,
            startAt: startAt,
            endAt: endAt,
            location: location,
            capacity: capacity,
            status: status,
            phase: phase,
            goingCount: goingCount,
            commentCount: commentCount,
            viewerSignupStatus: signupStatus,
            isOrganizer: isOrganizer,
            organizer: organizer
        )
    }

    func withCommentCount(_ commentCount: Int) -> NativeDiscoverActivity {
        NativeDiscoverActivity(
            id: id,
            city: city,
            school: school,
            title: title,
            description: description,
            category: category,
            startAt: startAt,
            endAt: endAt,
            location: location,
            capacity: capacity,
            status: status,
            phase: phase,
            goingCount: goingCount,
            commentCount: max(0, commentCount),
            viewerSignupStatus: viewerSignupStatus,
            isOrganizer: isOrganizer,
            organizer: organizer
        )
    }
}

struct NativeDiscoverActivityOrganizer: Decodable, Sendable {
    let id: String
    let displayName: String
    let avatarUrl: String?
    @DiscoverDefaultFalse var verifiedStudent: Bool
}

struct NativeDiscoverBuddyRequest: Encodable, Sendable {
    let category: String?
    let city: String
    let title: String
    let body: String?
    let tags: [String]?
    let visibility: String
    let replyPreference: String
    let courseIds: [String]?
    let startsAt: String?
    let endsAt: String?
    let location: String?
    let capacity: Int?
    let expiresAt: String
    let imageUrls: [String]?
}

struct NativeDiscoverBuddyImageDraft: Identifiable, Equatable, Sendable {
    let id: UUID
    let data: Data
    let mimeType: String
    let fileName: String
}

struct NativeDiscoverBuddyImageUpload: Decodable, Sendable {
    let image: NativeDiscoverUploadedImage
}

struct NativeDiscoverUploadedImage: Decodable, Sendable {
    let url: String
    let contentType: String
    let width: Int
    let height: Int
    let byteSize: Int
}

struct NativeDiscoverActivityRequest: Encodable, Sendable {
    let city: String
    let title: String
    let description: String
    let startAt: String
    let location: String
    let unlimitedCapacity: Bool
    let capacity: Int?
}

struct NativeDiscoverBuddyCreation: Decodable, Sendable {
    let postId: String
    let status: String
    let expiresAt: String
}

struct NativeDiscoverActivityCreation: Decodable, Sendable {
    let activityId: String
    let status: String
    let phase: String
}

struct NativeCreatorGatedActionContext: Sendable {
    let isTombstone: Bool
    let title: String?
    let startsAt: String?
    let endsAt: String?
    let location: String?
    let course: NativeCreatorGatedActionCourse?

    init(wire: Components.Schemas.CreatorGatedInterestContext) {
        switch wire {
        case .live(let live):
            isTombstone = false
            title = live.title
            startsAt = live.startsAt?.formatted(.iso8601)
            endsAt = live.endsAt?.formatted(.iso8601)
            location = live.location
            course = live.course.map(NativeCreatorGatedActionCourse.init(wire:))
        case .tombstone:
            isTombstone = true
            title = nil
            startsAt = nil
            endsAt = nil
            location = nil
            course = nil
        }
    }

    init(
        title: String?,
        startsAt: String?,
        endsAt: String?,
        location: String?,
        course: NativeCreatorGatedActionCourse?,
        isTombstone: Bool = false
    ) {
        self.isTombstone = isTombstone
        self.title = title
        self.startsAt = startsAt
        self.endsAt = endsAt
        self.location = location
        self.course = course
    }
}

struct NativeCreatorGatedActionCourse: Sendable {
    let id: String
    let code: String?
    let name: String

    init(wire: Components.Schemas.CreatorGatedInterestCourse) {
        id = wire.id
        code = wire.code
        name = wire.name
    }

    init(id: String, code: String?, name: String) {
        self.id = id
        self.code = code
        self.name = name
    }
}

struct NativeCreatorGatedPlanDraft: Sendable {
    let isTombstone: Bool
    let title: String?
    let startTime: String?
    let endTime: String?
    let location: String?
    let planType: String?

    init(wire: Components.Schemas.CreatorGatedPlanDraft) {
        switch wire {
        case .live(let live):
            isTombstone = false
            title = live.title
            startTime = live.startTime?.formatted(.iso8601)
            endTime = live.endTime?.formatted(.iso8601)
            location = live.location
            planType = live.planType.rawValue
        case .tombstone:
            isTombstone = true
            title = nil
            startTime = nil
            endTime = nil
            location = nil
            planType = nil
        }
    }

    init(
        title: String?,
        startTime: String?,
        endTime: String?,
        location: String?,
        planType: String?,
        isTombstone: Bool = false
    ) {
        self.isTombstone = isTombstone
        self.title = title
        self.startTime = startTime
        self.endTime = endTime
        self.location = location
        self.planType = planType
    }
}

enum NativeCreatorGatedInterestFocus: Sendable {
    case interest(interestID: String)
    case actionContext(connectionID: String, contextID: String)
    case plan(connectionID: String, commitmentID: String, revisionID: String)

    init(wire: Components.Schemas.CreatorGatedInterestFocus) {
        switch wire {
        case .interest(let interest):
            self = .interest(interestID: interest.interestId)
        case .actionContext(let context):
            self = .actionContext(
                connectionID: context.connectionId,
                contextID: context.contextId
            )
        case .plan(let plan):
            self = .plan(
                connectionID: plan.connectionId,
                commitmentID: plan.commitmentId,
                revisionID: plan.revisionId
            )
        }
    }

    var interestId: String? {
        guard case .interest(let interestID) = self else { return nil }
        return interestID
    }

    var isInterestFocus: Bool { interestId != nil }
}

struct NativeCreatorGatedChatTarget: Sendable {
    let connectionID: String
    let focus: DirectChatFocus
}

struct NativeCreatorGatedActionInterest: Identifiable, Sendable {
    let id: String
    let actionId: String
    let actionState: String
    let actionExpiresAt: String
    let interestState: String
    let coordinationState: String
    let activationId: String
    let activationStartedAt: String
    let terminalReason: String?
    let terminalAt: String?
    let context: NativeCreatorGatedActionContext
    let planDraft: NativeCreatorGatedPlanDraft
    let focus: NativeCreatorGatedInterestFocus
    let coordinationPolicy: String
    let policySchemaVersion: Int
    let createdAt: String
    let updatedAt: String

    init(wire: Components.Schemas.CreatorGatedActionInterest) {
        id = wire.id
        actionId = wire.actionId
        actionState = wire.actionState.rawValue
        actionExpiresAt = wire.actionExpiresAt.formatted(.iso8601)
        interestState = wire.interestState.rawValue
        coordinationState = wire.coordinationState.rawValue
        activationId = wire.activationId
        activationStartedAt = wire.activationStartedAt.formatted(.iso8601)
        terminalReason = wire.terminalReason.flatMap { reason in
            reason == ._empty_ ? nil : reason.rawValue
        }
        terminalAt = wire.terminalAt?.formatted(.iso8601)
        context = NativeCreatorGatedActionContext(wire: wire.context)
        planDraft = NativeCreatorGatedPlanDraft(wire: wire.planDraft)
        focus = NativeCreatorGatedInterestFocus(wire: wire.focus)
        coordinationPolicy = wire.coordinationPolicy.rawValue
        policySchemaVersion = wire.policySchemaVersion.rawValue
        createdAt = wire.createdAt.formatted(.iso8601)
        updatedAt = wire.updatedAt.formatted(.iso8601)
    }

    init(
        id: String,
        actionId: String,
        actionState: String,
        actionExpiresAt: String,
        interestState: String,
        coordinationState: String,
        activationId: String,
        activationStartedAt: String,
        terminalReason: String?,
        terminalAt: String?,
        context: NativeCreatorGatedActionContext,
        planDraft: NativeCreatorGatedPlanDraft,
        focus: NativeCreatorGatedInterestFocus,
        coordinationPolicy: String,
        policySchemaVersion: Int,
        createdAt: String,
        updatedAt: String
    ) {
        self.id = id
        self.actionId = actionId
        self.actionState = actionState
        self.actionExpiresAt = actionExpiresAt
        self.interestState = interestState
        self.coordinationState = coordinationState
        self.activationId = activationId
        self.activationStartedAt = activationStartedAt
        self.terminalReason = terminalReason
        self.terminalAt = terminalAt
        self.context = context
        self.planDraft = planDraft
        self.focus = focus
        self.coordinationPolicy = coordinationPolicy
        self.policySchemaVersion = policySchemaVersion
        self.createdAt = createdAt
        self.updatedAt = updatedAt
    }

    var isActive: Bool { interestState.uppercased() == "ACTIVE" }
    var isWaiting: Bool {
        isActive
            && coordinationState.uppercased() == "WAITING"
            && focus.isInterestFocus
            && focus.interestId == id
    }
    var isWithdrawableBeforeConnect: Bool {
        isActive
            && ["WAITING", "INITIATING"].contains(coordinationState.uppercased())
            && focus.isInterestFocus
            && focus.interestId == id
    }
    var isWithdrawn: Bool { interestState.uppercased() == "WITHDRAWN" }
    var chatTarget: NativeCreatorGatedChatTarget? {
        // A tombstone deliberately withholds the source context. Keep it as neutral
        // history instead of using otherwise-valid identifiers to reopen a thread.
        guard !context.isTombstone else { return nil }
        switch focus {
        case .interest:
            return nil
        case .actionContext(let connectionID, let contextID):
            return NativeCreatorGatedChatTarget(
                connectionID: connectionID,
                focus: .actionContext(id: contextID)
            )
        case .plan(let connectionID, let commitmentID, let revisionID):
            return NativeCreatorGatedChatTarget(
                connectionID: connectionID,
                focus: .plan(
                    commitmentID: commitmentID,
                    revisionID: revisionID
                )
            )
        }
    }
    var contextStartDate: Date? {
        context.startsAt.flatMap { try? Date($0, strategy: .iso8601) }
    }
    var updatedDate: Date? { try? Date(updatedAt, strategy: .iso8601) }

    func withLifecycle(
        interestState: String,
        coordinationState: String,
        activationId: String? = nil
    ) -> NativeCreatorGatedActionInterest {
        NativeCreatorGatedActionInterest(
            id: id,
            actionId: actionId,
            actionState: actionState,
            actionExpiresAt: actionExpiresAt,
            interestState: interestState,
            coordinationState: coordinationState,
            activationId: activationId ?? self.activationId,
            activationStartedAt: activationStartedAt,
            terminalReason: terminalReason,
            terminalAt: terminalAt,
            context: context,
            planDraft: planDraft,
            focus: focus,
            coordinationPolicy: coordinationPolicy,
            policySchemaVersion: policySchemaVersion,
            createdAt: createdAt,
            updatedAt: Date().formatted(.iso8601)
        )
    }
}

#if DEBUG
extension NativeCreatorGatedActionInterest {
    static var uiTestingResponses: [NativeCreatorGatedActionInterest] {
        let now = Date().formatted(.iso8601)
        let waitingID = "ui-my-response-waiting"
        let historicalID = "ui-my-response-history"
        let commonContext = NativeCreatorGatedActionContext(
            title: "Review algorithms together",
            startsAt: Date().addingTimeInterval(86_400).formatted(.iso8601),
            endsAt: Date().addingTimeInterval(90_000).formatted(.iso8601),
            location: "Main Library",
            course: NativeCreatorGatedActionCourse(
                id: "ui-course",
                code: "IN0001",
                name: "Algorithms"
            )
        )
        let commonDraft = NativeCreatorGatedPlanDraft(
            title: commonContext.title,
            startTime: commonContext.startsAt,
            endTime: commonContext.endsAt,
            location: commonContext.location,
            planType: "STUDY"
        )

        return [
            NativeCreatorGatedActionInterest(
                id: waitingID,
                actionId: "ui-buddy",
                actionState: "ACTIVE",
                actionExpiresAt: Date().addingTimeInterval(172_800).formatted(.iso8601),
                interestState: "ACTIVE",
                coordinationState: "WAITING",
                activationId: "ui-my-response-activation",
                activationStartedAt: now,
                terminalReason: nil,
                terminalAt: nil,
                context: commonContext,
                planDraft: commonDraft,
                focus: .interest(interestID: waitingID),
                coordinationPolicy: "CREATOR_GATED_V2",
                policySchemaVersion: 1,
                createdAt: now,
                updatedAt: now
            ),
            NativeCreatorGatedActionInterest(
                id: historicalID,
                actionId: "ui-history-action",
                actionState: "EXPIRED",
                actionExpiresAt: Date().addingTimeInterval(-86_400).formatted(.iso8601),
                interestState: "ACTIVE",
                coordinationState: "UNAVAILABLE",
                activationId: "ui-history-activation",
                activationStartedAt: Date().addingTimeInterval(-172_800).formatted(.iso8601),
                terminalReason: "ACTION_EXPIRED_BEFORE_CONNECT",
                terminalAt: Date().addingTimeInterval(-86_400).formatted(.iso8601),
                context: commonContext,
                planDraft: commonDraft,
                focus: .interest(interestID: historicalID),
                coordinationPolicy: "CREATOR_GATED_V2",
                policySchemaVersion: 1,
                createdAt: Date().addingTimeInterval(-172_800).formatted(.iso8601),
                updatedAt: Date().addingTimeInterval(-86_400).formatted(.iso8601)
            ),
        ]
    }
}
#endif

struct NativeActionResponsesFocus: Hashable, Sendable {
    let actionID: String
    let interestID: String?

    init(wire: Components.Schemas.ActionResponsesFocus) {
        actionID = wire.actionId
        interestID = wire.interestId
    }
}

struct NativeActionResponseCounts: Hashable, Sendable {
    let totalActiveInterestCount: Int
    let visibleInterestCount: Int
    let unseenVisibleInterestCount: Int

    init(wire: Components.Schemas.ActionResponseCounts) {
        totalActiveInterestCount = wire.totalActiveInterestCount
        visibleInterestCount = wire.visibleInterestCount
        unseenVisibleInterestCount = wire.unseenVisibleInterestCount
    }
}

struct NativeActionResponseCourse: Hashable, Sendable {
    let id: String
    let code: String?
    let name: String

    init(wire: Components.Schemas.NullableActionResponseCourse) {
        id = wire.id
        code = wire.code
        name = wire.name
    }
}

struct NativeActionResponseResponder: Hashable, Sendable {
    let userID: String
    let displayName: String
    let avatarURL: String?
    let verifiedStudent: Bool

    init(wire: Components.Schemas.LimitedActionResponder) {
        userID = wire.userId
        displayName = wire.displayName
        avatarURL = wire.avatarUrl
        verifiedStudent = wire.verifiedStudent
    }
}

struct NativeActionResponseItem: Identifiable, Hashable, Sendable {
    var id: String { interestID }
    let interestID: String
    let activationID: String
    let contextID: String
    let responder: NativeActionResponseResponder
    let sharedCourse: NativeActionResponseCourse?
    let sharedLanguages: [String]
    let receivedAt: Date
    let viewedAt: Date?
    let hiddenAt: Date?
    let interestState: String
    let coordinationState: String
    let presentationState: String
    let canStartCoordination: Bool
    let startCoordinationUnavailableReason: String?

    init(wire: Components.Schemas.ActionResponseItem) {
        interestID = wire.interestId
        activationID = wire.activationId
        contextID = wire.contextId
        responder = NativeActionResponseResponder(wire: wire.responder)
        sharedCourse = wire.signals.sharedCourse.map(NativeActionResponseCourse.init(wire:))
        sharedLanguages = wire.signals.sharedLanguages.map(\.rawValue)
        receivedAt = wire.receivedAt
        viewedAt = wire.viewedAt
        hiddenAt = wire.hiddenAt
        interestState = wire.interestState.rawValue
        coordinationState = wire.coordinationState.rawValue
        presentationState = wire.presentationState.rawValue
        canStartCoordination = wire.canStartCoordination
        startCoordinationUnavailableReason = wire.startCoordinationUnavailableReason?.rawValue
    }

    init(
        interestID: String,
        activationID: String,
        contextID: String,
        responder: NativeActionResponseResponder,
        sharedCourse: NativeActionResponseCourse?,
        sharedLanguages: [String],
        receivedAt: Date,
        viewedAt: Date?,
        hiddenAt: Date?,
        interestState: String,
        coordinationState: String,
        presentationState: String,
        canStartCoordination: Bool,
        startCoordinationUnavailableReason: String?
    ) {
        self.interestID = interestID
        self.activationID = activationID
        self.contextID = contextID
        self.responder = responder
        self.sharedCourse = sharedCourse
        self.sharedLanguages = sharedLanguages
        self.receivedAt = receivedAt
        self.viewedAt = viewedAt
        self.hiddenAt = hiddenAt
        self.interestState = interestState
        self.coordinationState = coordinationState
        self.presentationState = presentationState
        self.canStartCoordination = canStartCoordination
        self.startCoordinationUnavailableReason = startCoordinationUnavailableReason
    }

    var isUnseen: Bool { viewedAt == nil }
    var isHidden: Bool { presentationState == "HIDDEN" }

    func withViewedAt(_ date: Date) -> NativeActionResponseItem {
        NativeActionResponseItem(
            interestID: interestID,
            activationID: activationID,
            contextID: contextID,
            responder: responder,
            sharedCourse: sharedCourse,
            sharedLanguages: sharedLanguages,
            receivedAt: receivedAt,
            viewedAt: date,
            hiddenAt: hiddenAt,
            interestState: interestState,
            coordinationState: coordinationState,
            presentationState: presentationState,
            canStartCoordination: canStartCoordination,
            startCoordinationUnavailableReason: startCoordinationUnavailableReason
        )
    }
}

struct NativeActionResponseAction: Identifiable, Hashable, Sendable {
    let id: String
    let title: String
    let actionState: String
    let startsAt: Date?
    let endsAt: Date?
    let location: String?
    let course: NativeActionResponseCourse?

    init(wire: Components.Schemas.ActionResponseAction) {
        id = wire.id
        title = wire.title
        actionState = wire.actionState.rawValue
        startsAt = wire.startsAt
        endsAt = wire.endsAt
        location = wire.location
        course = wire.course.map(NativeActionResponseCourse.init(wire:))
    }
}

struct NativeActionResponseGroup: Identifiable, Hashable, Sendable {
    var id: String { action.id }
    let action: NativeActionResponseAction
    let counts: NativeActionResponseCounts
    let responses: [NativeActionResponseItem]
    let focus: NativeActionResponsesFocus

    init(wire: Components.Schemas.ActionResponseGroup) {
        action = NativeActionResponseAction(wire: wire.action)
        counts = NativeActionResponseCounts(wire: wire.counts)
        responses = wire.responses.map(NativeActionResponseItem.init(wire:))
        focus = NativeActionResponsesFocus(wire: wire.focus)
    }

    init(
        action: NativeActionResponseAction,
        counts: NativeActionResponseCounts,
        responses: [NativeActionResponseItem],
        focus: NativeActionResponsesFocus
    ) {
        self.action = action
        self.counts = counts
        self.responses = responses
        self.focus = focus
    }
}

struct NativeActionResponseSnapshot: Hashable, Sendable {
    let token: String
    let createdAt: Date
    let expiresAt: Date

    init(wire: Components.Schemas.ActionResponseSnapshotMetadata) {
        token = wire.token
        createdAt = wire.createdAt
        expiresAt = wire.expiresAt
    }
}

struct NativeActionResponsesPage: Sendable {
    let snapshot: NativeActionResponseSnapshot
    let groups: [NativeActionResponseGroup]
    let nextCursor: String?

    init(wire: Components.Schemas.ActionResponsesEnvelope) {
        snapshot = NativeActionResponseSnapshot(wire: wire.snapshot)
        groups = wire.groups.map(NativeActionResponseGroup.init(wire:))
        nextCursor = wire.nextCursor
    }
}

struct NativeCoordinationShellReservation: Identifiable, Hashable, Sendable {
    let id: String
    let contextID: String
    let interestID: String
    let leaseExpiresAt: Date
    let generation: Int
    let title: String
    let startsAt: Date?
    let endsAt: Date?
    let location: String?
    let courseName: String?
    let planTitle: String
    let planStart: Date?
    let planEnd: Date?
    let planLocation: String?
    let planType: String

    init(wire: Components.Schemas.ActionCoordinationReservation) {
        id = wire.id
        contextID = wire.contextId
        interestID = wire.focus.interestId
        leaseExpiresAt = wire.leaseExpiresAt
        generation = wire.generation
        title = wire.actionContextPreview.title
        startsAt = wire.actionContextPreview.startsAt
        endsAt = wire.actionContextPreview.endsAt
        location = wire.actionContextPreview.location
        courseName = wire.actionContextPreview.course?.name
        planTitle = wire.planDraft.title
        planStart = wire.planDraft.startTime
        planEnd = wire.planDraft.endTime
        planLocation = wire.planDraft.location
        planType = wire.planDraft.planType.rawValue
    }
}

struct NativeCoordinationShellDraft: Hashable, Sendable {
    var message = ""
    var title: String
    var location: String
    var start: Date
    var end: Date
    var planType: String

    init(reservation: NativeCoordinationShellReservation) {
        title = reservation.planTitle
        location = reservation.planLocation ?? ""
        start = reservation.planStart ?? Date().addingTimeInterval(60 * 60)
        end = reservation.planEnd ?? (reservation.planStart ?? Date()).addingTimeInterval(60 * 60)
        planType = reservation.planType
    }
}

struct NativeCoordinationMessageActivation: Hashable, Sendable {
    let connectionID: String
    let contextID: String

    init(wire: Components.Schemas.ActionCoordinationMessageActivation) {
        connectionID = wire.focus.connectionId
        contextID = wire.focus.contextId
    }
}

enum NativeActionResponsePresentationFilter: String, CaseIterable, Identifiable, Sendable {
    case visible = "VISIBLE"
    case hidden = "HIDDEN"

    var id: String { rawValue }
}

enum NativeDiscoverBuddyPrimaryAction: Equatable, Sendable {
    case contactAuthor
    case expressInterest
    case reactivateInterest
    case waiting
    case readOnly
}

struct NativeDiscoverBuddyPostDetail: Decodable, Sendable {
    let post: NativeDiscoverBuddyPost
    let viewerCanMessage: Bool
    let activeInterest: NativeActionInterest?
    let creatorGatedInterest: NativeCreatorGatedActionInterest?
    let creatorResponseEntry: Components.Schemas.CreatorResponseEntry?

    init(
        post: NativeDiscoverBuddyPost,
        viewerCanMessage: Bool,
        activeInterest: NativeActionInterest?,
        creatorGatedInterest: NativeCreatorGatedActionInterest? = nil,
        creatorResponseEntry: Components.Schemas.CreatorResponseEntry? = nil
    ) {
        self.post = post
        self.viewerCanMessage = viewerCanMessage
        self.activeInterest = activeInterest
        self.creatorGatedInterest = creatorGatedInterest
        self.creatorResponseEntry = creatorResponseEntry
    }

    init(from decoder: any Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        post = try container.decode(NativeDiscoverBuddyPost.self, forKey: .post)
        viewerCanMessage = try container.decodeIfPresent(Bool.self, forKey: .viewerCanMessage) ?? false
        activeInterest = try? container.decode(NativeActionInterest.self, forKey: .activeInterest)
        let wireCreatorGatedInterest = try? container.decode(
            Components.Schemas.CreatorGatedActionInterest.self,
            forKey: .creatorGatedInterest
        )
        creatorGatedInterest = wireCreatorGatedInterest.map(
            NativeCreatorGatedActionInterest.init(wire:)
        )
        creatorResponseEntry = try? container.decode(
            Components.Schemas.CreatorResponseEntry.self,
            forKey: .creatorResponseEntry
        )
    }

    var primaryAction: NativeDiscoverBuddyPrimaryAction {
        guard !post.isOwn else { return .readOnly }

        // Safe-drain controls remain available even when eligibility, a kill switch,
        // or the Action lifecycle has made the enrollment CTA read-only.
        if creatorGatedInterest?.isWithdrawableBeforeConnect == true {
            return .waiting
        }

        guard BuddyPostDisplay.status(post).isOpen else { return .readOnly }

        switch post.interactionMode {
        case .directConversation:
            return .contactAuthor
        case .expressInterest:
            if let creatorGatedInterest {
                if creatorGatedInterest.isWithdrawn { return .reactivateInterest }
                return .readOnly
            }
            return post.interestedByViewer ? .waiting : .expressInterest
        case .readOnly:
            return .readOnly
        }
    }

    private enum CodingKeys: String, CodingKey {
        case post
        case viewerCanMessage
        case activeInterest
        case creatorGatedInterest
        case creatorResponseEntry
    }
}

struct NativeDiscoverQuestionList: Decodable, Sendable {
    let total: Int
    let questions: [NativeDiscoverPostQuestion]
}

struct NativeDiscoverMessageList: Decodable, Sendable {
    let total: Int
    let messages: [NativeDiscoverPostQuestion]
}

struct NativeDiscoverPostQuestion: Decodable, Identifiable, Sendable {
    let id: String
    let body: String
    let createdAt: String
    let isOwn: Bool
    let canDelete: Bool
    let canReply: Bool
    let author: NativeDiscoverQuestionAuthor
    let reply: NativeDiscoverPostReply?

    var createdDate: Date? { try? Date(createdAt, strategy: .iso8601) }

    func replacingReply(
        _ nextReply: NativeDiscoverPostReply?,
        canReply nextCanReply: Bool? = nil
    ) -> NativeDiscoverPostQuestion {
        NativeDiscoverPostQuestion(
            id: id,
            body: body,
            createdAt: createdAt,
            isOwn: isOwn,
            canDelete: canDelete,
            canReply: nextCanReply ?? canReply,
            author: author,
            reply: nextReply
        )
    }
}

struct NativeDiscoverPostReply: Decodable, Identifiable, Sendable {
    let id: String
    let body: String
    let createdAt: String
    let isOwn: Bool
    let canDelete: Bool
    let author: NativeDiscoverQuestionAuthor

    var createdDate: Date? { try? Date(createdAt, strategy: .iso8601) }
}

struct NativeDiscoverQuestionAuthor: Decodable, Sendable {
    let id: String
    let displayName: String
    let avatarUrl: String?
    let school: String?
    let verifiedStudent: Bool
}

struct NativeDiscoverQuestionWriteRequest: Encodable, Sendable {
    let body: String
    let parentId: String?
}

struct NativeDiscoverQuestionMutation: Decodable, Sendable {
    let commentId: String
    let questionId: String
    let thread: NativeDiscoverPostQuestion
}

struct NativeDiscoverMessageMutation: Decodable, Sendable {
    let commentId: String
    let messageId: String
    let thread: NativeDiscoverPostQuestion
}

struct NativeDiscoverQuestionDeletion: Decodable, Sendable {
    let commentId: String
    let threadId: String
    let deletedReply: Bool
    let deleted: Bool
}

struct NativeDiscoverBuddyPostSaveResult: Decodable, Sendable {
    let postId: String
    let savedByViewer: Bool
    let interestedCount: Int
}

struct NativeDiscoverBuddyPostAction: Decodable, Sendable {
    let post: NativeDiscoverBuddyPost
}

struct NativeDiscoverActivityDetail: Decodable, Sendable {
    let activity: NativeDiscoverActivity
    let goingAttendees: [NativeDiscoverActivityAttendee]
    let viewerHasExistingChat: Bool
    let calendarEntryId: String?
}

struct NativeDiscoverActivityAttendee: Decodable, Identifiable, Sendable {
    let userId: String
    let displayName: String
    let avatarUrl: String?

    var id: String { userId }
}

struct NativeDiscoverActivityAction: Decodable, Sendable {
    let activity: NativeDiscoverActivity
}

struct NativeDiscoverActivityCalendarResult: Decodable, Sendable {
    let calendarEntryId: String
    let created: Bool
}

struct NativeDiscoverActivityStatusRequest: Encodable, Sendable {
    let status: String
}

extension NativeDiscoverFeed {
    static let uiTestingFixture: NativeDiscoverFeed = {
        let referenceDate = Date()
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime]
        func fixtureDate(daysFromNow days: Double, hours: Double = 0) -> String {
            formatter.string(from: referenceDate.addingTimeInterval((days * 24 + hours) * 3_600))
        }

        return NativeDiscoverFeed(
            city: "Munich",
            buddies: [
                NativeDiscoverBuddyPost(
                    id: "ui-buddy",
                    category: "OTHER",
                    city: "Munich",
                    title: "Library study buddy",
                    body: "Looking for someone to study with this week.",
                    status: "ACTIVE",
                    closureReason: nil,
                    closedAt: nil,
                    coordination: NativeDiscoverActionCoordination(
                        policy: "CREATOR_GATED_V2",
                        schemaVersion: 1,
                        interactionMode: "EXPRESS_INTEREST",
                        readOnlyReason: nil
                    ),
                    tags: ["study", "library"],
                    visibility: "SCHOOL_ONLY",
                    replyPreference: "REQUEST_FIRST",
                    startsAt: fixtureDate(daysFromNow: 3),
                    endsAt: fixtureDate(daysFromNow: 3, hours: 2),
                    location: "Main Library",
                    capacity: 3,
                    createdAt: fixtureDate(daysFromNow: -1),
                    expiresAt: fixtureDate(daysFromNow: 14),
                    isOwn: false,
                    savedByViewer: false,
                    interestedByViewer: false,
                    interestedCount: 2,
                    commentCount: 1,
                    imageUrls: [
                        "sideseat-preview://discover-study/1",
                        "sideseat-preview://discover-study/2",
                        "sideseat-preview://discover-study/3",
                        "sideseat-preview://discover-study/4",
                    ],
                    linkedCourses: [],
                    author: NativeDiscoverBuddyAuthor(
                        id: "ui-peer",
                        displayName: "Mina",
                        tagline: "Usually at the main library",
                        avatarUrl: nil,
                        major: "Informatics",
                        semester: 3,
                        studentStatus: "CURRENT_STUDENT",
                        graduationYear: nil,
                        school: "TUM",
                        verifiedStudent: true
                    )
                )
            ],
            activities: [
                NativeDiscoverActivity(
                    id: "ui-activity",
                    city: "Munich",
                    school: "TUM",
                    title: "English conversation meetup",
                    description: "A relaxed hour of conversation practice.",
                    category: nil,
                    startAt: fixtureDate(daysFromNow: 5),
                    endAt: fixtureDate(daysFromNow: 5, hours: 2),
                    location: "Student Cafe",
                    capacity: 10,
                    status: "OPEN",
                    phase: "bookable",
                    goingCount: 4,
                    commentCount: 1,
                    viewerSignupStatus: nil,
                    isOrganizer: false,
                    organizer: NativeDiscoverActivityOrganizer(
                        id: "ui-organizer",
                        displayName: "Noah",
                        avatarUrl: nil,
                        verifiedStudent: true
                    )
                )
            ]
        )
    }()
}

#if DEBUG
extension NativeDiscoverBuddyPost {
    static let uiTestingSchoolChangedFixture = NativeDiscoverBuddyPost(
        id: "ui-school-changed-post",
        category: "SHARED_COURSES",
        city: "Munich",
        title: "Find classmates for algorithms",
        body: "Looking for classmates to review problem sets together. #study",
        status: "CLOSED",
        closureReason: "SCHOOL_CHANGED",
        closedAt: "2026-08-07T12:00:00Z",
        coordination: NativeDiscoverActionCoordination(
            policy: "CREATOR_GATED_V2",
            schemaVersion: 1,
            interactionMode: "READ_ONLY",
            readOnlyReason: "PILOT_UNAVAILABLE"
        ),
        tags: ["study"],
        visibility: "SCHOOL_ONLY",
        replyPreference: "DIRECT_MESSAGE",
        startsAt: nil,
        endsAt: nil,
        location: "University library",
        capacity: 4,
        createdAt: "2026-08-01T10:00:00Z",
        expiresAt: "2099-12-31T23:59:59Z",
        isOwn: true,
        savedByViewer: false,
        interestedByViewer: false,
        interestedCount: 3,
        commentCount: 0,
        imageUrls: [],
        linkedCourses: [
            NativeDiscoverLinkedCourse(id: "archived-course", code: "IN0001", name: "Algorithms")
        ],
        author: NativeDiscoverBuddyAuthor(
            id: "ui-test-user",
            displayName: "测试用户",
            tagline: nil,
            avatarUrl: nil,
            major: nil,
            semester: nil,
            studentStatus: "ALUMNI",
            graduationYear: 2025,
            school: "TUM",
            verifiedStudent: true
        )
    )

    func uiTestingClone(index: Int) -> NativeDiscoverBuddyPost {
        NativeDiscoverBuddyPost(
            id: "ui-dense-buddy-\(index)",
            category: index.isMultiple(of: 3) ? "SHARED_COURSES" : category,
            city: city,
            title: "Study plan \(index)",
            body: "Dense feed plan \(index) for scrolling and search performance. #study",
            status: status,
            closureReason: closureReason,
            closedAt: closedAt,
            coordination: coordination,
            tags: ["study", "plan\(index)"],
            visibility: index.isMultiple(of: 2) ? "SCHOOL_ONLY" : "CITY_INTERNATIONALS",
            replyPreference: replyPreference,
            startsAt: Date(timeIntervalSince1970: 1_800_000_000 + Double(index * 60)).formatted(.iso8601),
            endsAt: Date(timeIntervalSince1970: 1_800_003_600 + Double(index * 60)).formatted(.iso8601),
            location: "Campus \(index % 8)",
            capacity: capacity,
            createdAt: createdAt,
            expiresAt: expiresAt,
            isOwn: false,
            savedByViewer: index.isMultiple(of: 7),
            interestedByViewer: false,
            interestedCount: index % 12,
            commentCount: index % 5,
            imageUrls: [],
            linkedCourses: linkedCourses,
            author: author
        )
    }
}

/// Mutable Discover feed for `--ui-testing-authenticated` so fake creates show up in the list.
@MainActor
enum UITestingDiscoverFixture {
    private static var feedStorage = NativeDiscoverFeed.uiTestingFixture

    static var feed: NativeDiscoverFeed {
        guard ProcessInfo.processInfo.arguments.contains("--ui-testing-dense-discover"),
              let seed = feedStorage.buddies.first
        else { return feedStorage }
        return NativeDiscoverFeed(
            city: feedStorage.city,
            buddies: (0..<80).map(seed.uiTestingClone(index:)) + feedStorage.buddies,
            activities: feedStorage.activities
        )
    }

    static func reset() {
        feedStorage = .uiTestingFixture
    }

    static func prependBuddy(
        category: String,
        title: String,
        body: String?,
        visibility: String,
        expiresAt: Date
    ) -> String {
        let post = NativeDiscoverBuddyPost(
            id: "ui-buddy-local-\(UUID().uuidString)",
            category: category,
            city: "Munich",
            title: title,
            body: body,
            status: "ACTIVE",
            closureReason: nil,
            closedAt: nil,
            coordination: NativeDiscoverActionCoordination(
                policy: "CREATOR_GATED_V2",
                schemaVersion: 1,
                interactionMode: "EXPRESS_INTEREST",
                readOnlyReason: nil
            ),
            tags: BuddyHashtagParser.tags(in: "\(title) \(body ?? "")"),
            visibility: visibility,
            replyPreference: "DIRECT_MESSAGE",
            startsAt: nil,
            endsAt: nil,
            location: nil,
            capacity: nil,
            createdAt: Date().formatted(.iso8601),
            expiresAt: expiresAt.formatted(.iso8601),
            isOwn: true,
            savedByViewer: false,
            interestedByViewer: false,
            interestedCount: 0,
            commentCount: 0,
            imageUrls: [],
            linkedCourses: [],
            author: NativeDiscoverBuddyAuthor(
                id: "ui-test-user",
                displayName: "测试用户",
                tagline: nil,
                avatarUrl: nil,
                major: nil,
                semester: nil,
                studentStatus: "ALUMNI",
                graduationYear: 2025,
                school: "TUM",
                verifiedStudent: true
            )
        )
        feedStorage = NativeDiscoverFeed(
            city: feedStorage.city,
            buddies: [post] + feedStorage.buddies,
            activities: feedStorage.activities
        )
        return post.id
    }

    static func updateBuddy(
        id: String,
        title: String,
        body: String?,
        tags: [String],
        visibility: String,
        startsAt: Date?,
        endsAt: Date?,
        location: String?,
        capacity: Int?,
        expiresAt: Date
    ) {
        feedStorage = NativeDiscoverFeed(
            city: feedStorage.city,
            buddies: feedStorage.buddies.map { post in
                guard post.id == id else { return post }
                return post.withEdits(
                    title: title,
                    body: body,
                    tags: tags,
                    visibility: visibility,
                    startsAt: startsAt,
                    endsAt: endsAt,
                    location: location,
                    capacity: capacity,
                    expiresAt: expiresAt,
                    imageUrls: post.imageUrls
                )
            },
            activities: feedStorage.activities
        )
    }

    static func adjustBuddyCommentCount(postID: String, by delta: Int) {
        feedStorage = NativeDiscoverFeed(
            city: feedStorage.city,
            buddies: feedStorage.buddies.map { post in
                guard post.id == postID else { return post }
                return post.withCommentCount(post.commentCount + delta)
            },
            activities: feedStorage.activities
        )
    }

    static func prependActivity(
        title: String,
        description: String?,
        startAt: Date,
        location: String,
        unlimitedCapacity: Bool,
        capacity: Int
    ) {
        let endAt = startAt.addingTimeInterval(60 * 60)
        let activity = NativeDiscoverActivity(
            id: "ui-activity-local-\(UUID().uuidString)",
            city: "Munich",
            school: "TUM",
            title: title,
            description: description,
            category: nil,
            startAt: startAt.formatted(.iso8601),
            endAt: endAt.formatted(.iso8601),
            location: location,
            capacity: unlimitedCapacity ? nil : capacity,
            status: "OPEN",
            phase: "bookable",
            goingCount: 1,
            commentCount: 0,
            viewerSignupStatus: "GOING",
            isOrganizer: true,
            organizer: NativeDiscoverActivityOrganizer(
                id: "ui-test-user",
                displayName: "测试用户",
                avatarUrl: nil,
                verifiedStudent: true
            )
        )
        feedStorage = NativeDiscoverFeed(
            city: feedStorage.city,
            buddies: feedStorage.buddies,
            activities: [activity] + feedStorage.activities
        )
    }

    static func adjustActivityCommentCount(activityID: String, by delta: Int) {
        feedStorage = NativeDiscoverFeed(
            city: feedStorage.city,
            buddies: feedStorage.buddies,
            activities: feedStorage.activities.map { activity in
                guard activity.id == activityID else { return activity }
                return activity.withCommentCount(activity.commentCount + delta)
            }
        )
    }
}
#endif

extension Notification.Name {
    static let sideSeatDiscoverFeedNeedsRefresh = Notification.Name("sideSeatDiscoverFeedNeedsRefresh")
}
