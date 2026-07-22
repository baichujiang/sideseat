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

struct NativeDiscoverBuddyPost: Decodable, Identifiable, Sendable {
    let id: String
    let category: String
    let city: String
    let title: String
    let body: String?
    let createdAt: String
    let expiresAt: String
    let isOwn: Bool
    let savedByViewer: Bool
    let interestedCount: Int
    let imageUrls: [String]
    let linkedCourses: [NativeDiscoverLinkedCourse]
    let author: NativeDiscoverBuddyAuthor

    var expiryDate: Date? { try? Date(expiresAt, strategy: .iso8601) }

    func withSaved(_ saved: Bool, interestedCount: Int) -> NativeDiscoverBuddyPost {
        NativeDiscoverBuddyPost(
            id: id,
            category: category,
            city: city,
            title: title,
            body: body,
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
    let school: String?
    let verifiedStudent: Bool
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

struct NativeDiscoverBuddyPostSaveResult: Decodable, Sendable {
    let postId: String
    let savedByViewer: Bool
    let interestedCount: Int
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
                createdAt: "2026-07-17T10:00:00Z",
                expiresAt: "2026-07-20T10:00:00Z",
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
