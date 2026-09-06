import Foundation
import Observation

@MainActor
@Observable
final class CurrentProfileStore {
    private(set) var profile: NativeCurrentProfile?
    private(set) var lastSchoolChange: NativeProfileSchoolChangeSummary?
    private(set) var isLoading = false
    private(set) var isSaving = false
    private(set) var issue: String?

    func load(using session: SessionStore) async {
        isLoading = true
        issue = nil
        defer { isLoading = false }

        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("--ui-testing-authenticated") {
            let arguments = ProcessInfo.processInfo.arguments
            if arguments.contains("--ui-testing-pending-profile") {
                profile = .uiTestingPendingFixture
            } else if arguments.contains("--ui-testing-rejected-profile") {
                profile = .uiTestingRejectedFixture
            } else if arguments.contains("--ui-testing-unverified-profile") {
                profile = .uiTestingUnverifiedFixture
            } else {
                profile = .uiTestingFixture
            }
            return
        }
        #endif

        do {
            let response: APIEnvelope<NativeCurrentProfile> = try await session.sendAuthorized(
                "api/v1/me"
            )
            profile = response.data
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
            profile = current.applying(request)
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
            profile = response.data.profile
            lastSchoolChange = response.data.schoolChange
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
            profile = (profile ?? .uiTestingFixture).applyingUsername(
                username.lowercased(),
                updatedAt: Date().ISO8601Format()
            )
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
            profile = response.data
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
            profile = (profile ?? .uiTestingFixture).applyingVerification(status: result.status, verifiedStudent: false)
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
            profile = profile?.applyingVerification(
                status: response.data.status,
                verifiedStudent: response.data.status.uppercased() == "VERIFIED"
            )
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
            profile = (profile ?? .uiTestingFixture).applyingVerification(status: result.status, verifiedStudent: false)
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
            profile = profile?.applyingVerification(status: response.data.status, verifiedStudent: false)
            return response.data
        } catch {
            issue = error.localizedDescription
            return nil
        }
    }

    func uploadAvatar(_ draft: NativeProfileAvatarDraft, using session: SessionStore) async -> Bool {
        guard !isSaving else { return false }
        isSaving = true
        issue = nil
        defer { isSaving = false }

        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("--ui-testing-authenticated") {
            profile = (profile ?? .uiTestingFixture).applyingAvatar(url: "https://cdn.sideseat.test/avatars/ui-avatar.jpg")
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
            profile = response.data.profile
            return true
        } catch {
            issue = error.localizedDescription
            return false
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
