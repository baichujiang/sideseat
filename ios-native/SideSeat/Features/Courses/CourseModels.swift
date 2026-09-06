import Foundation

enum NativeCourseScope: String, CaseIterable, Codable, Sendable, Identifiable {
    case popular
    case enrolled
    case saved
    case archived

    var id: String { rawValue }

    var title: LocalizedStringResource {
        switch self {
        case .popular: "Popular"
        case .enrolled: "My courses"
        case .saved: "Saved"
        case .archived: "Archived"
        }
    }

    static let primaryCases: [NativeCourseScope] = [.popular, .enrolled, .saved]
}

struct NativeCourseList: Decodable, Sendable {
    let school: String
    let semesterLabel: String
    let scope: NativeCourseScope
    let query: String
    let schools: [NativeCourseSchool]
    let courses: [NativeCourseSummary]
    let nextCursor: String?
    let semesterReview: NativeCourseSemesterReviewSummary?
}

struct NativeCourseSemesterReviewSummary: Decodable, Sendable {
    let semesterLabel: String
    let required: Bool
    let courseCount: Int
}

struct NativeCourseSemesterReview: Decodable, Sendable {
    let semesterLabel: String
    let required: Bool
    let courseCount: Int
    let courses: [NativeCourseSemesterReviewCourse]
}

struct NativeCourseSemesterReviewCourse: Decodable, Identifiable, Sendable {
    let id: String
    let code: String?
    let name: String
    let school: String
    let previousSemesterLabel: String
    let activeUntil: String
    let sessions: [NativeCourseSession]
}

struct NativeCourseSemesterReviewRequest: Encodable, Sendable {
    let courseIds: [String]
}

struct NativeCourseSemesterReviewResult: Decodable, Sendable {
    let semesterLabel: String
    let renewedCount: Int
    let archivedCount: Int
}

struct NativeCourseSchool: Decodable, Sendable, Identifiable {
    let code: String
    let shortLabel: String
    let name: String

    var id: String { code }
}

struct NativeCourseSummary: Decodable, Sendable, Identifiable {
    let id: String
    let code: String?
    let name: String
    let instructorSummary: String?
    let school: String
    let semesterLabel: String
    let memberCount: Int
    let viewer: NativeCourseViewerState
    let sessions: [NativeCourseSession]
    let officialScheduleSyncedAt: String?
    let communitySubmitted: Bool?

    init(
        id: String,
        code: String?,
        name: String,
        instructorSummary: String?,
        school: String,
        semesterLabel: String,
        memberCount: Int,
        viewer: NativeCourseViewerState,
        sessions: [NativeCourseSession],
        officialScheduleSyncedAt: String? = nil,
        communitySubmitted: Bool? = nil
    ) {
        self.id = id
        self.code = code
        self.name = name
        self.instructorSummary = instructorSummary
        self.school = school
        self.semesterLabel = semesterLabel
        self.memberCount = memberCount
        self.viewer = viewer
        self.sessions = sessions
        self.officialScheduleSyncedAt = officialScheduleSyncedAt
        self.communitySubmitted = communitySubmitted
    }
}

struct NativeCourseViewerState: Decodable, Sendable {
    let enrolled: Bool
    let saved: Bool
    let canRestore: Bool?
    let restoreBlockReason: String?

    init(
        enrolled: Bool,
        saved: Bool,
        canRestore: Bool? = nil,
        restoreBlockReason: String? = nil
    ) {
        self.enrolled = enrolled
        self.saved = saved
        self.canRestore = canRestore
        self.restoreBlockReason = restoreBlockReason
    }
}

struct NativeCourseSession: Decodable, Sendable, Hashable {
    let weekday: NativeCourseWeekday
    let startMinute: Int
    let endMinute: Int
    let location: String?
}

enum NativeCourseWeekday: String, Codable, Sendable, CaseIterable {
    case mon = "MON"
    case tue = "TUE"
    case wed = "WED"
    case thu = "THU"
    case fri = "FRI"
    case sat = "SAT"
    case sun = "SUN"

    var shortName: String {
        switch self {
        case .mon: AppLocalization.string( "Mon")
        case .tue: AppLocalization.string( "Tue")
        case .wed: AppLocalization.string( "Wed")
        case .thu: AppLocalization.string( "Thu")
        case .fri: AppLocalization.string( "Fri")
        case .sat: AppLocalization.string( "Sat")
        case .sun: AppLocalization.string( "Sun")
        }
    }
}

struct NativeCourseDetail: Decodable, Sendable {
    let course: NativeCourseSummary
    let membership: NativeCourseMembership?
    let officialScheduleVariants: [NativeCourseScheduleVariant]
    let members: [NativeCourseMember]
    let chat: NativeCourseChatState
}

struct NativeCourseMembership: Decodable, Sendable {
    let id: String
    let intentions: [String]
    let sessions: [NativeCourseSession]
}

struct NativeCourseScheduleVariant: Decodable, Sendable, Identifiable {
    let fingerprint: String
    let label: String
    let sessions: [NativeCourseSession]

    var id: String { fingerprint }
}

struct NativeCourseMember: Decodable, Sendable, Identifiable {
    let userId: String
    let username: String
    let nickname: String?
    let avatarUrl: String?
    let tagline: String?
    let major: String?
    let semester: Int?
    let verifiedStudent: Bool
    let intentions: [String]

    var id: String { userId }
    var displayName: String { nickname?.nilIfBlank ?? username }
}

struct NativeCourseChatState: Decodable, Sendable {
    let available: Bool
    let unreadCount: Int
}

struct NativeCourseScheduleRequest: Encodable, Sendable {
    let variantFingerprint: String
}

struct NativeCourseManualCreateRequest: Encodable, Sendable {
    let name: String
    let code: String
}

struct NativeCourseManualCreateResult: Decodable, Sendable {
    let courseId: String
    let name: String
    let code: String?
    let school: String
    let semesterLabel: String
    let communitySubmitted: Bool
}

struct NativeCourseMatchRequest: Encodable, Sendable {
    let school: String?
    let terms: [String]
}

struct NativeCourseMatchResult: Decodable, Sendable {
    let school: String
    let semesterLabel: String
    let courses: [NativeCourseSummary]
}

private extension String {
    var nilIfBlank: String? {
        trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? nil : self
    }
}

#if DEBUG
extension NativeCourseList {
    static let uiTestingFixture = NativeCourseList(
        school: "TUM",
        semesterLabel: "SS 2026",
        scope: .popular,
        query: "",
        schools: [
            NativeCourseSchool(code: "TUM", shortLabel: "TUM", name: "Technical University of Munich"),
            NativeCourseSchool(code: "LMU", shortLabel: "LMU", name: "Ludwig Maximilian University of Munich")
        ],
        courses: [
            NativeCourseSummary(
                id: "ui-course",
                code: "IN2346",
                name: "Introduction to Deep Learning",
                instructorSummary: "Prof. Native",
                school: "TUM",
                semesterLabel: "SS 2026",
                memberCount: 12,
                viewer: NativeCourseViewerState(enrolled: false, saved: false),
                sessions: []
            )
        ],
        nextCursor: nil,
        semesterReview: NativeCourseSemesterReviewSummary(
            semesterLabel: "SS 2026",
            required: true,
            courseCount: 1
        )
    )
}

extension NativeCourseDetail {
    static let uiTestingFixture = NativeCourseDetail(
        course: NativeCourseList.uiTestingFixture.courses[0],
        membership: nil,
        officialScheduleVariants: [
            NativeCourseScheduleVariant(
                fingerprint: "TUE 10:00-11:30",
                label: "Lecture",
                sessions: [
                    NativeCourseSession(
                        weekday: .tue,
                        startMinute: 600,
                        endMinute: 690,
                        location: "Room N1"
                    )
                ]
            )
        ],
        members: [],
        chat: NativeCourseChatState(available: false, unreadCount: 0)
    )
}
#endif
