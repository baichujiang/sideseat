import Foundation

struct NativeProfileSchoolSummary: Decodable, Hashable, Sendable {
    let schoolShort: String
    let degreeLabel: String
    let major: String
    let semester: Int
    let studentStatus: String?
    let graduationYear: Int?

    var displayLine: String {
        let majorText = major.trimmingCharacters(in: .whitespacesAndNewlines)
        let studyText = majorText.isEmpty ? degreeLabel : majorText
        if studentStatus == "ALUMNI" {
            let year = graduationYear.map(String.init) ?? AppLocalization.string( "Alumni")
            return "\(schoolShort) · \(studyText) · \(year)"
        }
        if studentStatus == "EXCHANGE_STUDENT" {
            return "\(schoolShort) · \(studyText) · \(AppLocalization.string( "Exchange"))"
        }
        if majorText.isEmpty {
            return "\(schoolShort) · \(degreeLabel) · Semester \(semester)"
        }
        return "\(schoolShort) · \(majorText) · Semester \(semester)"
    }
}

enum StudentIdentityTone: Equatable {
    case verified
    case pending
    case rejected
    case neutral
}

enum StudentIdentityDisplay {
    static func schoolText(_ school: String?) -> String {
        let trimmed = school?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        return trimmed.isEmpty ? AppLocalization.string( "School") : trimmed.uppercased()
    }

    static func schoolCode(_ school: String?) -> String {
        let raw = school?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        let normalized = raw
            .folding(options: [.diacriticInsensitive, .caseInsensitive], locale: .current)
            .uppercased()

        switch normalized {
        case "TUM", "TECHNISCHE UNIVERSITAT MUNCHEN", "TECHNICAL UNIVERSITY OF MUNICH":
            return "TUM"
        case "LMU", "LMU MUNCHEN", "LUDWIG-MAXIMILIANS-UNIVERSITAT MUNCHEN":
            return "LMU"
        default:
            let words = normalized.split(whereSeparator: { !$0.isLetter && !$0.isNumber })
            if words.count > 1 {
                return String(words.prefix(4).compactMap(\.first))
            }
            return String((words.first ?? Substring("SCHOOL")).prefix(4))
        }
    }

    static func logoAssetName(_ school: String?) -> String {
        "SchoolLogo\(schoolCode(school))"
    }

    static func label(school: String?, verifiedStudent: Bool, status: String) -> String {
        let school = schoolText(school)
        switch status.uppercased() {
        case "VERIFIED":
            return AppLocalization.string( "\(school) verified")
        case "EMAIL_PENDING":
            return AppLocalization.string( "School email pending")
        case "MANUAL_REVIEW_REQUIRED":
            return AppLocalization.string( "Manual review")
        case "REJECTED":
            return AppLocalization.string( "Verification rejected")
        default:
            return verifiedStudent ? AppLocalization.string( "\(school) verified") : AppLocalization.string( "Not school verified")
        }
    }

    static func systemImage(verifiedStudent: Bool, status: String) -> String {
        switch status.uppercased() {
        case "VERIFIED":
            return "checkmark.seal.fill"
        case "EMAIL_PENDING":
            return "envelope.badge"
        case "MANUAL_REVIEW_REQUIRED":
            return "doc.badge.clock"
        case "REJECTED":
            return "exclamationmark.triangle.fill"
        default:
            return verifiedStudent ? "checkmark.seal.fill" : "person.crop.circle.badge.questionmark"
        }
    }

    static func tone(verifiedStudent: Bool, status: String) -> StudentIdentityTone {
        switch status.uppercased() {
        case "VERIFIED":
            return .verified
        case "EMAIL_PENDING", "MANUAL_REVIEW_REQUIRED":
            return .pending
        case "REJECTED":
            return .rejected
        default:
            return verifiedStudent ? .verified : .neutral
        }
    }

    static func canManageVerification(verifiedStudent: Bool, status: String) -> Bool {
        tone(verifiedStudent: verifiedStudent, status: status) != .verified
    }
}

struct NativeCurrentProfile: Decodable, Identifiable, Sendable {
    let id: String
    let username: String
    let nickname: String?
    let email: String?
    let phone: String?
    let avatarUrl: String?
    let tagline: String?
    let school: String?
    let studentStatus: String?
    let degreeLevel: String?
    let major: String?
    let semester: Int?
    let graduationYear: Int?
    let gender: String
    let onboardingComplete: Bool
    let isGuest: Bool
    let verifiedStudent: Bool
    let studentVerificationStatus: String
    let usernameUpdatedAt: String?
    let usernameChangePolicy: NativeUsernameChangePolicy?
    let productTutorialDismissedAt: String?
    let locale: String
    let displayName: String
    let schoolSummary: NativeProfileSchoolSummary
    let contacts: NativeProfileContacts
    let privacy: NativeProfilePrivacy
    let counts: NativeProfileCounts
}

struct NativeProfileSchoolChangeSummary: Decodable, Equatable, Sendable {
    let archivedCourseCount: Int
    let removedCalendarEntryCount: Int
    let closedPostCount: Int
    let expiredInvitationCount: Int
}

struct NativeProfileUpdateResult: Decodable, Sendable {
    let profile: NativeCurrentProfile
    let schoolChange: NativeProfileSchoolChangeSummary?

    private enum CodingKeys: String, CodingKey {
        case schoolChange
    }

    init(from decoder: Decoder) throws {
        profile = try NativeCurrentProfile(from: decoder)
        let container = try decoder.container(keyedBy: CodingKeys.self)
        schoolChange = try container.decodeIfPresent(
            NativeProfileSchoolChangeSummary.self,
            forKey: .schoolChange
        )
    }
}

struct NativeUsernameChangePolicy: Decodable, Sendable {
    let limit: Int
    let windowDays: Int
    let changesUsed: Int
    let changesRemaining: Int
    let nextAllowedAt: String?
}

struct NativeStudentVerificationRequest: Encodable, Sendable {
    let email: String
}

struct NativeStudentProofDraft: Sendable {
    let fileName: String
    let mimeType: String
    let data: Data
}

struct NativeStudentVerificationResult: Decodable, Sendable {
    let status: String
    let delivery: String?
    let verifyUrl: String?
    let message: String
}

struct NativeProfileContacts: Decodable, Hashable, Sendable {
    let wechatHandle: String?
    let whatsappHandle: String?
    let telegramHandle: String?
    let instagramHandle: String?

    var hasAnyHandle: Bool {
        [wechatHandle, whatsappHandle, telegramHandle, instagramHandle]
            .contains { !($0?.trimmingCharacters(in: .whitespacesAndNewlines) ?? "").isEmpty }
    }
}

struct NativeProfileUpdateRequest: Encodable, Sendable {
    var nickname: String?
    var bio: String?
    var gender: String?
    var school: String?
    var studentStatus: String?
    var degreeLevel: String?
    var major: String?
    var semester: Int?
    var graduationYear: Int?
    var wechatHandle: String?
    var whatsappHandle: String?
    var telegramHandle: String?
    var instagramHandle: String?
    var contactInfoOptIn: Bool?
    var hideFromDiscovery: Bool?
    var hideFromCourseMembers: Bool?
}

struct NativeProfileUsernameUpdateRequest: Encodable, Sendable {
    let username: String
}

struct NativeProfilePrivacy: Decodable, Sendable {
    let discoverByCourse: Bool
    let discoverByMajor: Bool
    let discoverBySemester: Bool
    let allowInvitationNotes: Bool
    let contactInfoOptIn: Bool
    let hideFromCourseMembers: Bool
    let hideFromDiscovery: Bool
}

struct NativeProfileCounts: Decodable, Sendable {
    let blocked: Int
}

struct NativePublicProfile: Decodable, Sendable {
    let mode: String
    let connectionId: String?
    let metVia: String?
    let viewerCanMessage: Bool
    let myContactRemark: String?
    let profile: NativePublicProfileUser
    let sharedCourses: [NativeProfileCourse]
    let peerCourses: [NativeProfileCourse]
}

struct NativePublicProfileUser: Decodable, Sendable {
    let id: String
    let username: String
    let displayName: String
    let nickname: String?
    let gender: String
    let avatarUrl: String?
    let tagline: String?
    let school: String?
    let studentStatus: String?
    let degreeLevel: String?
    let major: String?
    let semester: Int?
    let graduationYear: Int?
    let verifiedStudent: Bool
    let studentVerificationStatus: String
    let schoolSummary: NativeProfileSchoolSummary
}

struct NativeProfileCourse: Decodable, Identifiable, Hashable, Sendable {
    let id: String
    let code: String?
    let name: String
}

struct NativeProfileUploadedImage: Decodable, Sendable {
    let url: String
    let contentType: String
    let width: Int
    let height: Int
    let byteSize: Int
}

struct NativeProfileAvatarUpload: Decodable, Sendable {
    let avatar: NativeProfileUploadedImage
    let profile: NativeCurrentProfile
}

struct NativeProfileAvatarDraft: Identifiable, Sendable {
    let id: UUID
    let data: Data
    let mimeType: String
    let fileName: String
}

extension NativeCurrentProfile {
    static let uiTestingFixture = NativeCurrentProfile(
        id: "ui-test-user",
        username: "test_001",
        nickname: "Test User",
        email: "test-001@tum.de",
        phone: nil,
        avatarUrl: nil,
        tagline: "Usually at the main library",
        school: "TUM",
        studentStatus: "CURRENT_STUDENT",
        degreeLevel: "BACHELOR",
        major: "Informatics",
        semester: 3,
        graduationYear: nil,
        gender: "PRIVATE",
        onboardingComplete: true,
        isGuest: false,
        verifiedStudent: true,
        studentVerificationStatus: "VERIFIED",
        usernameUpdatedAt: nil,
        usernameChangePolicy: NativeUsernameChangePolicy(
            limit: 3,
            windowDays: 7,
            changesUsed: 0,
            changesRemaining: 3,
            nextAllowedAt: nil
        ),
        productTutorialDismissedAt: "2026-01-01T00:00:00.000Z",
        locale: "en",
        displayName: "Test User",
        schoolSummary: NativeProfileSchoolSummary(
            schoolShort: "TUM",
            degreeLabel: "Bachelor",
            major: "Informatics",
            semester: 3,
            studentStatus: "CURRENT_STUDENT",
            graduationYear: nil
        ),
        contacts: NativeProfileContacts(
            wechatHandle: nil,
            whatsappHandle: nil,
            telegramHandle: nil,
            instagramHandle: nil
        ),
        privacy: NativeProfilePrivacy(
            discoverByCourse: true,
            discoverByMajor: true,
            discoverBySemester: true,
            allowInvitationNotes: true,
            contactInfoOptIn: false,
            hideFromCourseMembers: false,
            hideFromDiscovery: false
        ),
        counts: NativeProfileCounts(blocked: 0)
    )

    static var uiTestingUnverifiedFixture: NativeCurrentProfile {
        uiTestingFixture.applyingVerification(status: "UNVERIFIED", verifiedStudent: false)
    }

    static var uiTestingPendingFixture: NativeCurrentProfile {
        uiTestingFixture.applyingVerification(status: "EMAIL_PENDING", verifiedStudent: false)
    }

    static var uiTestingRejectedFixture: NativeCurrentProfile {
        uiTestingFixture.applyingVerification(status: "REJECTED", verifiedStudent: false)
    }
}

extension NativePublicProfile {
    static let uiTestingFixture = NativePublicProfile(
        mode: "connection",
        connectionId: "ui-connection",
        metVia: "Software Engineering",
        viewerCanMessage: true,
        myContactRemark: nil,
        profile: NativePublicProfileUser(
            id: "ui-peer",
            username: "test_002",
            displayName: "Mina",
            nickname: "Mina",
            gender: "PRIVATE",
            avatarUrl: nil,
            tagline: "Usually at the main library",
            school: "TUM",
            studentStatus: "CURRENT_STUDENT",
            degreeLevel: "BACHELOR",
            major: "Informatics",
            semester: 3,
            graduationYear: nil,
            verifiedStudent: true,
            studentVerificationStatus: "VERIFIED",
            schoolSummary: NativeProfileSchoolSummary(
                schoolShort: "TUM",
                degreeLabel: "Bachelor",
                major: "Informatics",
                semester: 3,
                studentStatus: "CURRENT_STUDENT",
                graduationYear: nil
            )
        ),
        sharedCourses: [NativeProfileCourse(id: "ui-course", code: "IN0001", name: "Software Engineering")],
        peerCourses: [NativeProfileCourse(id: "ui-course", code: "IN0001", name: "Software Engineering")]
    )
}

extension NativeCurrentProfile {
    var usernameNextAllowedAt: Date? {
        guard let nextAllowedAt = usernameChangePolicy?.nextAllowedAt,
              let date = Date.sideSeatProfileISO8601(nextAllowedAt),
              date > Date()
        else { return nil }
        return date
    }

    var usernameChangesRemaining: Int {
        if let nextAllowedAt = usernameChangePolicy?.nextAllowedAt,
           let date = Date.sideSeatProfileISO8601(nextAllowedAt),
           date <= Date() {
            return usernameChangePolicy?.limit ?? 3
        }
        return usernameChangePolicy?.changesRemaining ?? 3
    }

    var canChangeUsernameNow: Bool {
        usernameChangesRemaining > 0
    }

    func applying(_ request: NativeProfileUpdateRequest) -> NativeCurrentProfile {
        let nextSchool = request.school ?? school
        let changedSchool = StudentIdentityDisplay.schoolCode(nextSchool) != StudentIdentityDisplay.schoolCode(school)

        return NativeCurrentProfile(
            id: id,
            username: username,
            nickname: request.nickname ?? nickname,
            email: changedSchool ? nil : email,
            phone: phone,
            avatarUrl: avatarUrl,
            tagline: request.bio ?? tagline,
            school: nextSchool,
            studentStatus: request.studentStatus ?? studentStatus,
            degreeLevel: request.degreeLevel ?? degreeLevel,
            major: request.major ?? major,
            semester: request.semester ?? semester,
            graduationYear: request.graduationYear ?? graduationYear,
            gender: request.gender ?? gender,
            onboardingComplete: onboardingComplete,
            isGuest: isGuest,
            verifiedStudent: changedSchool ? false : verifiedStudent,
            studentVerificationStatus: changedSchool ? "UNVERIFIED" : studentVerificationStatus,
            usernameUpdatedAt: usernameUpdatedAt,
            usernameChangePolicy: usernameChangePolicy,
            productTutorialDismissedAt: productTutorialDismissedAt,
            locale: locale,
            displayName: {
                let trimmed = (request.nickname ?? nickname)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
                return trimmed.isEmpty ? username : trimmed
            }(),
            schoolSummary: NativeProfileSchoolSummary(
                schoolShort: StudentIdentityDisplay.schoolCode(nextSchool),
                degreeLabel: schoolSummary.degreeLabel,
                major: request.major ?? schoolSummary.major,
                semester: request.semester ?? schoolSummary.semester,
                studentStatus: request.studentStatus ?? schoolSummary.studentStatus,
                graduationYear: request.graduationYear ?? schoolSummary.graduationYear
            ),
            contacts: NativeProfileContacts(
                wechatHandle: request.wechatHandle ?? contacts.wechatHandle,
                whatsappHandle: request.whatsappHandle ?? contacts.whatsappHandle,
                telegramHandle: request.telegramHandle ?? contacts.telegramHandle,
                instagramHandle: request.instagramHandle ?? contacts.instagramHandle
            ),
            privacy: NativeProfilePrivacy(
                discoverByCourse: privacy.discoverByCourse,
                discoverByMajor: privacy.discoverByMajor,
                discoverBySemester: privacy.discoverBySemester,
                allowInvitationNotes: privacy.allowInvitationNotes,
                contactInfoOptIn: request.contactInfoOptIn ?? privacy.contactInfoOptIn,
                hideFromCourseMembers: request.hideFromCourseMembers ?? privacy.hideFromCourseMembers,
                hideFromDiscovery: request.hideFromDiscovery ?? privacy.hideFromDiscovery
            ),
            counts: counts
        )
    }

    func applyingUsername(_ nextUsername: String, updatedAt: String) -> NativeCurrentProfile {
        let limit = usernameChangePolicy?.limit ?? 3
        let windowDays = usernameChangePolicy?.windowDays ?? 7
        let nextChangesUsed = min(limit, (usernameChangePolicy?.changesUsed ?? 0) + 1)
        let nextAllowedAt = nextChangesUsed == limit
            ? Date.sideSeatProfileISO8601(updatedAt)?
                .addingTimeInterval(TimeInterval(windowDays * 24 * 60 * 60))
                .ISO8601Format()
            : nil

        return NativeCurrentProfile(
            id: id,
            username: nextUsername,
            nickname: nickname,
            email: email,
            phone: phone,
            avatarUrl: avatarUrl,
            tagline: tagline,
            school: school,
            studentStatus: studentStatus,
            degreeLevel: degreeLevel,
            major: major,
            semester: semester,
            graduationYear: graduationYear,
            gender: gender,
            onboardingComplete: onboardingComplete,
            isGuest: isGuest,
            verifiedStudent: verifiedStudent,
            studentVerificationStatus: studentVerificationStatus,
            usernameUpdatedAt: updatedAt,
            usernameChangePolicy: NativeUsernameChangePolicy(
                limit: limit,
                windowDays: windowDays,
                changesUsed: nextChangesUsed,
                changesRemaining: max(0, limit - nextChangesUsed),
                nextAllowedAt: nextAllowedAt
            ),
            productTutorialDismissedAt: productTutorialDismissedAt,
            locale: locale,
            displayName: {
                let trimmed = nickname?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
                return trimmed.isEmpty ? nextUsername : trimmed
            }(),
            schoolSummary: schoolSummary,
            contacts: contacts,
            privacy: privacy,
            counts: counts
        )
    }

    func applyingVerification(status: String, verifiedStudent: Bool) -> NativeCurrentProfile {
        NativeCurrentProfile(
            id: id,
            username: username,
            nickname: nickname,
            email: email,
            phone: phone,
            avatarUrl: avatarUrl,
            tagline: tagline,
            school: school,
            studentStatus: studentStatus,
            degreeLevel: degreeLevel,
            major: major,
            semester: semester,
            graduationYear: graduationYear,
            gender: gender,
            onboardingComplete: onboardingComplete,
            isGuest: isGuest,
            verifiedStudent: verifiedStudent,
            studentVerificationStatus: status,
            usernameUpdatedAt: usernameUpdatedAt,
            usernameChangePolicy: usernameChangePolicy,
            productTutorialDismissedAt: productTutorialDismissedAt,
            locale: locale,
            displayName: displayName,
            schoolSummary: schoolSummary,
            contacts: contacts,
            privacy: privacy,
            counts: counts
        )
    }

    func applyingAvatar(url: String) -> NativeCurrentProfile {
        NativeCurrentProfile(
            id: id,
            username: username,
            nickname: nickname,
            email: email,
            phone: phone,
            avatarUrl: url,
            tagline: tagline,
            school: school,
            studentStatus: studentStatus,
            degreeLevel: degreeLevel,
            major: major,
            semester: semester,
            graduationYear: graduationYear,
            gender: gender,
            onboardingComplete: onboardingComplete,
            isGuest: isGuest,
            verifiedStudent: verifiedStudent,
            studentVerificationStatus: studentVerificationStatus,
            usernameUpdatedAt: usernameUpdatedAt,
            usernameChangePolicy: usernameChangePolicy,
            productTutorialDismissedAt: productTutorialDismissedAt,
            locale: locale,
            displayName: displayName,
            schoolSummary: schoolSummary,
            contacts: contacts,
            privacy: privacy,
            counts: counts
        )
    }
}

private extension Date {
    static func sideSeatProfileISO8601(_ value: String) -> Date? {
        let fractional = ISO8601DateFormatter()
        fractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return fractional.date(from: value) ?? ISO8601DateFormatter().date(from: value)
    }
}
