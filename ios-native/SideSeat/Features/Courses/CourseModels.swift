import Foundation

enum NativeCourseScope: String, CaseIterable, Codable, Sendable, Identifiable {
    case popular
    case enrolled
    case saved

    var id: String { rawValue }

    var title: LocalizedStringResource {
        switch self {
        case .popular: "Popular"
        case .enrolled: "My courses"
        case .saved: "Saved"
        }
    }
}

struct NativeCourseList: Decodable, Sendable {
    let school: String
    let semesterLabel: String
    let scope: NativeCourseScope
    let query: String
    let schools: [NativeCourseSchool]
    let courses: [NativeCourseSummary]
    let nextCursor: String?
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
        officialScheduleSyncedAt: String? = nil
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
    }
}

struct NativeCourseViewerState: Decodable, Sendable {
    let enrolled: Bool
    let saved: Bool
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
        case .mon: String(localized: "Mon")
        case .tue: String(localized: "Tue")
        case .wed: String(localized: "Wed")
        case .thu: String(localized: "Thu")
        case .fri: String(localized: "Fri")
        case .sat: String(localized: "Sat")
        case .sun: String(localized: "Sun")
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
        nextCursor: nil
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
