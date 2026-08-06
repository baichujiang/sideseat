import Foundation

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

struct NativeMyPostsPayload: Decodable, Sendable {
    let posts: [NativeDiscoverBuddyPost]
    let activities: [NativeDiscoverActivity]
}

struct NativeDiscoverBuddyPost: Decodable, Identifiable, Sendable {
    let id: String
    let category: String
    let city: String
    let title: String
    let body: String?
    let status: String
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
    let interestedCount: Int
    let imageUrls: [String]
    let linkedCourses: [NativeDiscoverLinkedCourse]
    let author: NativeDiscoverBuddyAuthor

    var expiryDate: Date? { try? Date(expiresAt, strategy: .iso8601) }
    var startDate: Date? { startsAt.flatMap { try? Date($0, strategy: .iso8601) } }
    var endDate: Date? { endsAt.flatMap { try? Date($0, strategy: .iso8601) } }

    func withSaved(_ saved: Bool, interestedCount: Int) -> NativeDiscoverBuddyPost {
        NativeDiscoverBuddyPost(
            id: id,
            category: category,
            city: city,
            title: title,
            body: body,
            status: status,
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
            interestedCount: interestedCount,
            imageUrls: imageUrls,
            linkedCourses: linkedCourses,
            author: author
        )
    }

    func withStatus(_ status: String) -> NativeDiscoverBuddyPost {
        NativeDiscoverBuddyPost(
            id: id,
            category: category,
            city: city,
            title: title,
            body: body,
            status: status,
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
            interestedCount: interestedCount,
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
            interestedCount: interestedCount,
            imageUrls: imageUrls,
            linkedCourses: linkedCourses,
            author: author
        )
    }
}

enum BuddyPostDisplay {
    static func statusLabel(_ status: String) -> String {
        switch status.uppercased() {
        case "ACTIVE":
            return String(localized: "Open plan")
        case "CLOSED":
            return String(localized: "Matched")
        case "EXPIRED":
            return String(localized: "Expired")
        default:
            return status.capitalized
        }
    }

    static func visibilityLabel(_ visibility: String) -> String {
        switch visibility.uppercased() {
        case "CITY_INTERNATIONALS":
            return String(localized: "Everyone")
        case "VERIFIED_ONLY":
            return String(localized: "Verified students")
        case "SCHOOL_ONLY":
            return String(localized: "Same school")
        case "COURSEMATES_ONLY":
            return String(localized: "Coursemates")
        default:
            return String(localized: "Visible")
        }
    }

    static func replyLabel(_ preference: String) -> String {
        switch preference.uppercased() {
        case "DIRECT_MESSAGE":
            return String(localized: "Direct message")
        case "VERIFIED_ONLY":
            return String(localized: "Verified replies")
        case "REQUEST_FIRST":
            return String(localized: "Request first")
        default:
            return String(localized: "Replies")
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
            return String(localized: "Current student")
        case "EXCHANGE_STUDENT":
            return String(localized: "Exchange student")
        case "ALUMNI":
            if let graduationYear {
                return String(localized: "Alumni \(graduationYear)")
            }
            return String(localized: "Alumni")
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
    let viewerSignupStatus: String?
    let isOrganizer: Bool
    let organizer: NativeDiscoverActivityOrganizer

    var startDate: Date? { try? Date(startAt, strategy: .iso8601) }

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
            viewerSignupStatus: signupStatus,
            isOrganizer: isOrganizer,
            organizer: organizer
        )
    }
}

struct NativeDiscoverActivityOrganizer: Decodable, Sendable {
    let id: String
    let displayName: String
    let avatarUrl: String?
}

struct NativeDiscoverBuddyRequest: Encodable, Sendable {
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

struct NativeDiscoverBuddyPostDetail: Decodable, Sendable {
    let post: NativeDiscoverBuddyPost
    let viewerCanMessage: Bool
}

struct NativeDiscoverQuestionList: Decodable, Sendable {
    let questions: [NativeDiscoverPostQuestion]
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
}

struct NativeDiscoverQuestionDeletion: Decodable, Sendable {
    let commentId: String
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
    static let uiTestingFixture = NativeDiscoverFeed(
        city: "Munich",
        buddies: [
            NativeDiscoverBuddyPost(
                id: "ui-buddy",
                category: "OTHER",
                city: "Munich",
                title: "Library study buddy",
                body: "Looking for someone to study with this week.",
                status: "ACTIVE",
                tags: ["study", "library"],
                visibility: "SCHOOL_ONLY",
                replyPreference: "REQUEST_FIRST",
                startsAt: "2026-07-18T14:00:00Z",
                endsAt: "2026-07-18T16:00:00Z",
                location: "Main Library",
                capacity: 3,
                createdAt: "2026-07-17T10:00:00Z",
                expiresAt: "2099-12-31T23:59:59Z",
                isOwn: false,
                savedByViewer: false,
                interestedCount: 2,
                imageUrls: [],
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
                startAt: "2026-07-18T16:00:00Z",
                endAt: "2026-07-18T18:00:00Z",
                location: "Student Cafe",
                capacity: 10,
                status: "OPEN",
                phase: "bookable",
                goingCount: 4,
                viewerSignupStatus: nil,
                isOrganizer: false,
                organizer: NativeDiscoverActivityOrganizer(
                    id: "ui-organizer",
                    displayName: "Noah",
                    avatarUrl: nil
                )
            )
        ]
    )
}

#if DEBUG
/// Mutable Discover feed for `--ui-testing-authenticated` so fake creates show up in the list.
@MainActor
enum UITestingDiscoverFixture {
    private static var feedStorage = NativeDiscoverFeed.uiTestingFixture

    static var feed: NativeDiscoverFeed { feedStorage }

    static func reset() {
        feedStorage = .uiTestingFixture
    }

    static func prependBuddy(title: String, body: String?, expiresAt: Date) {
        let post = NativeDiscoverBuddyPost(
            id: "ui-buddy-local-\(UUID().uuidString)",
            category: "OTHER",
            city: "Munich",
            title: title,
            body: body,
            status: "ACTIVE",
            tags: BuddyHashtagParser.tags(in: "\(title) \(body ?? "")"),
            visibility: "CITY_INTERNATIONALS",
            replyPreference: "DIRECT_MESSAGE",
            startsAt: nil,
            endsAt: nil,
            location: nil,
            capacity: nil,
            createdAt: Date().formatted(.iso8601),
            expiresAt: expiresAt.formatted(.iso8601),
            isOwn: true,
            savedByViewer: false,
            interestedCount: 0,
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
            viewerSignupStatus: "GOING",
            isOrganizer: true,
            organizer: NativeDiscoverActivityOrganizer(
                id: "ui-test-user",
                displayName: "测试用户",
                avatarUrl: nil
            )
        )
        feedStorage = NativeDiscoverFeed(
            city: feedStorage.city,
            buddies: feedStorage.buddies,
            activities: [activity] + feedStorage.activities
        )
    }
}
#endif
