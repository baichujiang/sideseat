import Foundation
import Observation

enum MVPReadinessCache {
    private static let keyPrefix = "sideseat.mvp-readiness.ready."

    static func ready(userID: String, defaults: UserDefaults = .standard) -> Bool? {
        let key = keyPrefix + userID
        guard defaults.object(forKey: key) != nil else { return nil }
        return defaults.bool(forKey: key)
    }

    static func store(
        _ readiness: NativeMVPReadiness,
        userID: String,
        defaults: UserDefaults = .standard
    ) {
        defaults.set(readiness.ready, forKey: keyPrefix + userID)
    }

    static func remove(userID: String, defaults: UserDefaults = .standard) {
        defaults.removeObject(forKey: keyPrefix + userID)
    }
}

@MainActor
@Observable
final class CurrentProfileStore {
    private(set) var profile: NativeCurrentProfile?
    private(set) var lastSchoolChange: NativeProfileSchoolChangeSummary?
    private(set) var isLoading = false
    private(set) var isSaving = false
    private(set) var issue: String?

    func reset() {
        profile = nil
        lastSchoolChange = nil
        isLoading = false
        isSaving = false
        issue = nil
    }

    func load(using session: SessionStore) async {
        isLoading = true
        issue = nil
        defer { isLoading = false }

        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("--ui-testing-authenticated") {
            let arguments = ProcessInfo.processInfo.arguments
            if arguments.contains("--ui-testing-required-setup") {
                install(.uiTestingRequiredSetupFixture)
            } else if arguments.contains("--ui-testing-pending-profile") {
                install(.uiTestingPendingFixture)
            } else if arguments.contains("--ui-testing-rejected-profile") {
                install(.uiTestingRejectedFixture)
            } else if arguments.contains("--ui-testing-unverified-profile") {
                install(.uiTestingUnverifiedFixture)
            } else {
                install(.uiTestingFixture)
            }
            return
        }
        #endif

        do {
            let response: APIEnvelope<NativeCurrentProfile> = try await session.sendAuthorized(
                "api/v1/me"
            )
            install(response.data)
        } catch {
            issue = error.localizedDescription
        }
    }

    func save(_ request: NativeProfileUpdateRequest, using session: SessionStore) async -> Bool {
        guard !isSaving else { return false }
        isSaving = true
        issue = nil
        lastSchoolChange = nil
        defer { isSaving = false }

        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("--ui-testing-authenticated") {
            let current = profile ?? .uiTestingFixture
            let changedSchool = request.school.map {
                StudentIdentityDisplay.schoolCode($0) != StudentIdentityDisplay.schoolCode(current.school)
            } ?? false
            install(current.applying(request))
            if changedSchool {
                lastSchoolChange = NativeProfileSchoolChangeSummary(
                    archivedCourseCount: 2,
                    removedCalendarEntryCount: 2,
                    closedPostCount: 1,
                    expiredInvitationCount: 0
                )
            }
            return true
        }
        #endif

        do {
            let response: APIEnvelope<NativeProfileUpdateResult> = try await session.sendAuthorized(
                "api/v1/me/profile",
                method: .patch,
                body: request,
                idempotencyKey: UUID().uuidString
            )
            install(response.data.profile)
            lastSchoolChange = response.data.schoolChange
            return true
        } catch {
            issue = error.localizedDescription
            return false
        }
    }

    func saveLanguages(
        _ languages: [NativeCoordinationLanguage],
        using session: SessionStore
    ) async -> Bool {
        guard !isSaving, !languages.isEmpty else { return false }
        isSaving = true
        issue = nil
        defer { isSaving = false }

        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("--ui-testing-authenticated") {
            let current = profile ?? .uiTestingRequiredSetupFixture
            let campusComplete =
                !StudentIdentityDisplay.schoolCode(current.school).isEmpty &&
                !(current.studentStatus?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ?? true)
            let verificationComplete =
                current.verifiedStudent &&
                current.studentVerificationStatus.uppercased() == "VERIFIED"
            let readiness = NativeMVPReadiness(
                campusIdentityComplete: campusComplete,
                languagesComplete: true,
                verificationState: current.studentVerificationStatus,
                ready: campusComplete && verificationComplete
            )
            install(current.withMVPState(languages: languages, readiness: readiness))
            return true
        }
        #endif

        struct Request: Encodable, Sendable {
            let languages: [NativeCoordinationLanguage]
        }

        do {
            let response: APIEnvelope<NativeCurrentProfile> = try await session.sendAuthorized(
                "api/v1/me/languages",
                method: .put,
                body: Request(languages: languages),
                idempotencyKey: UUID().uuidString
            )
            install(response.data)
            return true
        } catch {
            issue = error.localizedDescription
            return false
        }
    }

    func updateUsername(_ username: String, using session: SessionStore) async -> Bool {
        guard !isSaving else { return false }
        isSaving = true
        issue = nil
        defer { isSaving = false }

        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("--ui-testing-authenticated") {
            install((profile ?? .uiTestingFixture).applyingUsername(
                username.lowercased(),
                updatedAt: Date().ISO8601Format()
            ))
            return true
        }
        #endif

        do {
            let response: APIEnvelope<NativeCurrentProfile> = try await session.sendAuthorized(
                "api/v1/me/username",
                method: .patch,
                body: NativeProfileUsernameUpdateRequest(username: username),
                idempotencyKey: UUID().uuidString
            )
            install(response.data)
            return true
        } catch {
            issue = error.localizedDescription
            return false
        }
    }

    func requestStudentVerification(email: String, using session: SessionStore) async -> NativeStudentVerificationResult? {
        guard !isSaving else { return nil }
        isSaving = true
        issue = nil
        defer { isSaving = false }

        let normalized = email.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()

        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("--ui-testing-authenticated") {
            let result = NativeStudentVerificationResult(
                status: "EMAIL_PENDING",
                delivery: "skipped",
                verifyUrl: "http://127.0.0.1:3000/api/student-verification/verify?token=ui-testing",
                message: AppLocalization.string( "Email delivery is disabled in this test build. Use the verification link below to finish now.")
            )
            install((profile ?? .uiTestingFixture).applyingVerification(status: result.status, verifiedStudent: false))
            return result
        }
        #endif

        do {
            let response: APIEnvelope<NativeStudentVerificationResult> = try await session.sendAuthorized(
                "api/student-verification/request",
                method: .post,
                body: NativeStudentVerificationRequest(email: normalized),
                idempotencyKey: UUID().uuidString
            )
            if let current = profile {
                install(current.applyingVerification(
                    status: response.data.status,
                    verifiedStudent: response.data.status.uppercased() == "VERIFIED"
                ))
            }
            return response.data
        } catch {
            issue = error.localizedDescription
            return nil
        }
    }

    func submitStudentProof(
        _ proof: NativeStudentProofDraft,
        email: String,
        using session: SessionStore
    ) async -> NativeStudentVerificationResult? {
        guard !isSaving else { return nil }
        isSaving = true
        issue = nil
        defer { isSaving = false }

        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("--ui-testing-authenticated") {
            let result = NativeStudentVerificationResult(
                status: "MANUAL_REVIEW_REQUIRED",
                delivery: nil,
                verifyUrl: nil,
                message: AppLocalization.string( "Your school document was submitted for review.")
            )
            install((profile ?? .uiTestingFixture).applyingVerification(status: result.status, verifiedStudent: false))
            return result
        }
        #endif

        do {
            let normalizedEmail = email.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
            let response: APIEnvelope<NativeStudentVerificationResult> = try await session.uploadAuthorized(
                "api/student-verification/manual-review",
                file: MultipartUploadFile(
                    fieldName: "file",
                    fileName: proof.fileName,
                    mimeType: proof.mimeType,
                    data: proof.data
                ),
                fields: normalizedEmail.isEmpty ? [:] : ["email": normalizedEmail],
                idempotencyKey: UUID().uuidString
            )
            if let current = profile {
                install(current.applyingVerification(status: response.data.status, verifiedStudent: false))
            }
            return response.data
        } catch {
            issue = error.localizedDescription
            return nil
        }
    }

    func saveSystemAvatar(_ id: String, using session: SessionStore) async -> Bool {
        guard !isSaving, let current = profile,
              NativeSystemAvatar.all.contains(where: { $0.id == id }) else { return false }
        isSaving = true
        issue = nil
        defer { isSaving = false }

        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("--ui-testing-authenticated") {
            install(current.applyingAvatar(url: id))
            return true
        }
        #endif

        struct Selection: Codable, Sendable { let avatarId: String }
        do {
            // Existing authenticated endpoint accepts the same access bearer as v1.
            let response: APIEnvelope<Selection> = try await session.sendAuthorized(
                "api/profile/avatar", method: .post, body: Selection(avatarId: id)
            )
            install(current.applyingAvatar(url: response.data.avatarId))
            return true
        } catch {
            issue = error.localizedDescription
            return false
        }
    }

    func uploadAvatar(_ draft: NativeProfileAvatarDraft, using session: SessionStore) async -> Bool {
        guard !isSaving else { return false }
        isSaving = true
        issue = nil
        defer { isSaving = false }

        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("--ui-testing-authenticated") {
            install((profile ?? .uiTestingFixture).applyingAvatar(url: "https://cdn.sideseat.test/avatars/ui-avatar.jpg"))
            return true
        }
        #endif

        do {
            let response: APIEnvelope<NativeProfileAvatarUpload> = try await session.uploadAuthorized(
                "api/v1/me/avatar",
                file: MultipartUploadFile(
                    fieldName: "file",
                    fileName: draft.fileName,
                    mimeType: draft.mimeType,
                    data: draft.data
                ),
                idempotencyKey: UUID().uuidString
            )
            install(response.data.profile)
            return true
        } catch {
            issue = error.localizedDescription
            return false
        }
    }

    private func install(_ nextProfile: NativeCurrentProfile) {
        profile = nextProfile
        if let readiness = nextProfile.readiness {
            MVPReadinessCache.store(readiness, userID: nextProfile.id)
        }
    }
}

@MainActor
@Observable
final class PublicProfileStore {
    private(set) var profile: NativePublicProfile?
    private(set) var isLoading = false
    private(set) var issue: String?

    func load(userID: String, using session: SessionStore) async {
        isLoading = true
        issue = nil
        defer { isLoading = false }

        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("--ui-testing-authenticated") {
            profile = .uiTestingFixture
            return
        }
        #endif

        do {
            let response: APIEnvelope<NativePublicProfile> = try await session.sendAuthorized(
                "api/v1/users/\(userID)/profile"
            )
            profile = response.data
        } catch {
            issue = error.localizedDescription
        }
    }

    func applyOpenedConnection(_ connectionID: String) {
        guard let current = profile else { return }
        profile = NativePublicProfile(
            mode: current.mode == "public" || current.mode == "classmate" ? "connection" : current.mode,
            connectionId: connectionID,
            metVia: current.metVia,
            viewerCanMessage: current.viewerCanMessage,
            myContactRemark: current.myContactRemark,
            profile: current.profile,
            sharedCourses: current.sharedCourses,
            peerCourses: current.peerCourses
        )
    }
}

private extension NativeCurrentProfile {
    static var uiTestingRequiredSetupFixture: NativeCurrentProfile {
        uiTestingFixture.withMVPState(
            languages: [],
            readiness: NativeMVPReadiness(
                campusIdentityComplete: true,
                languagesComplete: false,
                verificationState: "UNVERIFIED",
                ready: false
            ),
            verifiedStudent: false,
            verificationStatus: "UNVERIFIED"
        )
    }

    func withMVPState(
        languages: [NativeCoordinationLanguage],
        readiness: NativeMVPReadiness,
        verifiedStudent nextVerifiedStudent: Bool? = nil,
        verificationStatus nextVerificationStatus: String? = nil
    ) -> NativeCurrentProfile {
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
            verifiedStudent: nextVerifiedStudent ?? verifiedStudent,
            studentVerificationStatus: nextVerificationStatus ?? studentVerificationStatus,
            usernameUpdatedAt: usernameUpdatedAt,
            usernameChangePolicy: usernameChangePolicy,
            productTutorialDismissedAt: productTutorialDismissedAt,
            locale: locale,
            languages: languages,
            readiness: readiness,
            displayName: displayName,
            schoolSummary: schoolSummary,
            contacts: contacts,
            privacy: privacy,
            counts: counts
        )
    }
}
