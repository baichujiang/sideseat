import Foundation

struct NativeProfileLanguage: Decodable, Hashable, Sendable {
    let tag: String
    let proficiency: String
}

struct NativeProfileLifePhoto: Decodable, Hashable, Sendable, Identifiable {
    let id: String
    let url: String
    let sortOrder: Int
}

struct NativeProfileSchoolSummary: Decodable, Hashable, Sendable {
    let schoolShort: String
    let degreeLabel: String
    let major: String
    let semester: Int

    var displayLine: String {
        let majorText = major.trimmingCharacters(in: .whitespacesAndNewlines)
        if majorText.isEmpty {
            return "\(schoolShort) · \(degreeLabel) · Semester \(semester)"
        }
        return "\(schoolShort) · \(majorText) · Semester \(semester)"
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
    let degreeLevel: String?
    let major: String?
    let semester: Int?
    let gender: String
    let onboardingComplete: Bool
    let isGuest: Bool
    let verifiedStudent: Bool
    let studentVerificationStatus: String
    let usernameUpdatedAt: String?
    let productTutorialDismissedAt: String?
    let locale: String
    let displayName: String
    let schoolSummary: NativeProfileSchoolSummary
    let languages: [NativeProfileLanguage]
    let lifePhotos: [NativeProfileLifePhoto]
    let contacts: NativeProfileContacts
    let privacy: NativeProfilePrivacy
    let counts: NativeProfileCounts
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
    var major: String?
    var semester: Int?
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
    let degreeLevel: String?
    let major: String?
    let semester: Int?
    let verifiedStudent: Bool
    let studentVerificationStatus: String
    let schoolSummary: NativeProfileSchoolSummary
    let languages: [NativeProfileLanguage]
    let lifePhotos: [NativeProfileLifePhoto]
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

struct NativeProfileLifePhotoUpload: Decodable, Sendable {
    let photo: NativeProfileLifePhoto
    let upload: NativeProfileUploadedImage
    let profile: NativeCurrentProfile
}

struct NativeProfileLifePhotosMutation: Decodable, Sendable {
    let photos: [NativeProfileLifePhoto]
    let profile: NativeCurrentProfile
}

struct NativeProfileLifePhotoDelete: Decodable, Sendable {
    let deletedPhotoId: String
    let profile: NativeCurrentProfile
}

struct NativeProfileLifePhotosReorderRequest: Encodable, Sendable {
    let photoIds: [String]
}

struct NativeProfileLifePhotoDraft: Identifiable, Sendable {
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
        degreeLevel: "BACHELOR",
        major: "Informatics",
        semester: 3,
        gender: "PRIVATE",
        onboardingComplete: true,
        isGuest: false,
        verifiedStudent: true,
        studentVerificationStatus: "VERIFIED",
        usernameUpdatedAt: nil,
        productTutorialDismissedAt: "2026-01-01T00:00:00.000Z",
        locale: "en",
        displayName: "Test User",
        schoolSummary: NativeProfileSchoolSummary(
            schoolShort: "TUM",
            degreeLabel: "Bachelor",
            major: "Informatics",
            semester: 3
        ),
        languages: [
            NativeProfileLanguage(tag: "ENGLISH", proficiency: "FLUENT"),
            NativeProfileLanguage(tag: "GERMAN", proficiency: "CONVERSATIONAL")
        ],
        lifePhotos: [],
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
            degreeLevel: "BACHELOR",
            major: "Informatics",
            semester: 3,
            verifiedStudent: true,
            studentVerificationStatus: "VERIFIED",
            schoolSummary: NativeProfileSchoolSummary(
                schoolShort: "TUM",
                degreeLabel: "Bachelor",
                major: "Informatics",
                semester: 3
            ),
            languages: [NativeProfileLanguage(tag: "ENGLISH", proficiency: "FLUENT")],
            lifePhotos: []
        ),
        sharedCourses: [NativeProfileCourse(id: "ui-course", code: "IN0001", name: "Software Engineering")],
        peerCourses: [NativeProfileCourse(id: "ui-course", code: "IN0001", name: "Software Engineering")]
    )
}

extension NativeCurrentProfile {
    private static let usernameCooldownSeconds: TimeInterval = 30 * 24 * 60 * 60

    var usernameNextAllowedAt: Date? {
        guard let usernameUpdatedAt,
              let updatedAt = Date.sideSeatProfileISO8601(usernameUpdatedAt)
        else { return nil }
        return updatedAt.addingTimeInterval(Self.usernameCooldownSeconds)
    }

    var canChangeUsernameNow: Bool {
        guard let usernameNextAllowedAt else { return true }
        return usernameNextAllowedAt <= Date()
    }

    func applying(_ request: NativeProfileUpdateRequest) -> NativeCurrentProfile {
        NativeCurrentProfile(
            id: id,
            username: username,
            nickname: request.nickname ?? nickname,
            email: email,
            phone: phone,
            avatarUrl: avatarUrl,
            tagline: request.bio ?? tagline,
            school: school,
            degreeLevel: degreeLevel,
            major: request.major ?? major,
            semester: request.semester ?? semester,
            gender: request.gender ?? gender,
            onboardingComplete: onboardingComplete,
            isGuest: isGuest,
            verifiedStudent: verifiedStudent,
            studentVerificationStatus: studentVerificationStatus,
            usernameUpdatedAt: usernameUpdatedAt,
            productTutorialDismissedAt: productTutorialDismissedAt,
            locale: locale,
            displayName: {
                let trimmed = (request.nickname ?? nickname)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
                return trimmed.isEmpty ? username : trimmed
            }(),
            schoolSummary: NativeProfileSchoolSummary(
                schoolShort: schoolSummary.schoolShort,
                degreeLabel: schoolSummary.degreeLabel,
                major: request.major ?? schoolSummary.major,
                semester: request.semester ?? schoolSummary.semester
            ),
            languages: languages,
            lifePhotos: lifePhotos,
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
        NativeCurrentProfile(
            id: id,
            username: nextUsername,
            nickname: nickname,
            email: email,
            phone: phone,
            avatarUrl: avatarUrl,
            tagline: tagline,
            school: school,
            degreeLevel: degreeLevel,
            major: major,
            semester: semester,
            gender: gender,
            onboardingComplete: onboardingComplete,
            isGuest: isGuest,
            verifiedStudent: verifiedStudent,
            studentVerificationStatus: studentVerificationStatus,
            usernameUpdatedAt: updatedAt,
            productTutorialDismissedAt: productTutorialDismissedAt,
            locale: locale,
            displayName: {
                let trimmed = nickname?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
                return trimmed.isEmpty ? nextUsername : trimmed
            }(),
            schoolSummary: schoolSummary,
            languages: languages,
            lifePhotos: lifePhotos,
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
            degreeLevel: degreeLevel,
            major: major,
            semester: semester,
            gender: gender,
            onboardingComplete: onboardingComplete,
            isGuest: isGuest,
            verifiedStudent: verifiedStudent,
            studentVerificationStatus: studentVerificationStatus,
            usernameUpdatedAt: usernameUpdatedAt,
            productTutorialDismissedAt: productTutorialDismissedAt,
            locale: locale,
            displayName: displayName,
            schoolSummary: schoolSummary,
            languages: languages,
            lifePhotos: lifePhotos,
            contacts: contacts,
            privacy: privacy,
            counts: counts
        )
    }

    func applyingLifePhotos(_ nextLifePhotos: [NativeProfileLifePhoto]) -> NativeCurrentProfile {
        NativeCurrentProfile(
            id: id,
            username: username,
            nickname: nickname,
            email: email,
            phone: phone,
            avatarUrl: avatarUrl,
            tagline: tagline,
            school: school,
            degreeLevel: degreeLevel,
            major: major,
            semester: semester,
            gender: gender,
            onboardingComplete: onboardingComplete,
            isGuest: isGuest,
            verifiedStudent: verifiedStudent,
            studentVerificationStatus: studentVerificationStatus,
            usernameUpdatedAt: usernameUpdatedAt,
            productTutorialDismissedAt: productTutorialDismissedAt,
            locale: locale,
            displayName: displayName,
            schoolSummary: schoolSummary,
            languages: languages,
            lifePhotos: nextLifePhotos,
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
