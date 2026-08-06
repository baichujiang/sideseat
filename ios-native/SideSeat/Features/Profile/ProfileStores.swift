import Foundation
import Observation

@MainActor
@Observable
final class CurrentProfileStore {
    private(set) var profile: NativeCurrentProfile?
    private(set) var isLoading = false
    private(set) var isSaving = false
    private(set) var issue: String?

    func load(using session: SessionStore) async {
        isLoading = true
        issue = nil
        defer { isLoading = false }

        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("--ui-testing-authenticated") {
            profile = ProcessInfo.processInfo.arguments.contains("--ui-testing-unverified-profile")
                ? .uiTestingUnverifiedFixture
                : .uiTestingFixture
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
        defer { isSaving = false }

        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("--ui-testing-authenticated") {
            profile = (profile ?? .uiTestingFixture).applying(request)
            return true
        }
        #endif

        do {
            let response: APIEnvelope<NativeCurrentProfile> = try await session.sendAuthorized(
                "api/v1/me/profile",
                method: .patch,
                body: request,
                idempotencyKey: UUID().uuidString
            )
            profile = response.data
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
                message: String(localized: "Email delivery is disabled in this test build. Use the verification link below to finish now.")
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
                message: String(localized: "Your school document was submitted for review.")
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

    func uploadLifePhoto(_ draft: NativeProfileLifePhotoDraft, using session: SessionStore) async -> Bool {
        guard !isSaving else { return false }
        isSaving = true
        issue = nil
        defer { isSaving = false }

        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("--ui-testing-authenticated") {
            let existing = profile ?? .uiTestingFixture
            let nextPhoto = NativeProfileLifePhoto(
                id: draft.id.uuidString,
                url: "https://cdn.sideseat.test/life-photos/\(draft.id.uuidString).jpg",
                sortOrder: existing.lifePhotos.count
            )
            profile = existing.applyingLifePhotos(existing.lifePhotos + [nextPhoto])
            return true
        }
        #endif

        do {
            let response: APIEnvelope<NativeProfileLifePhotoUpload> = try await session.uploadAuthorized(
                "api/v1/me/life-photos",
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

    func reorderLifePhotos(photoIds: [String], using session: SessionStore) async -> Bool {
        guard !isSaving else { return false }
        isSaving = true
        issue = nil
        defer { isSaving = false }

        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("--ui-testing-authenticated") {
            let existing = profile ?? .uiTestingFixture
            let photosByID = Dictionary(uniqueKeysWithValues: existing.lifePhotos.map { ($0.id, $0) })
            let reordered = photoIds.enumerated().compactMap { index, id -> NativeProfileLifePhoto? in
                guard let photo = photosByID[id] else { return nil }
                return NativeProfileLifePhoto(id: photo.id, url: photo.url, sortOrder: index)
            }
            guard reordered.count == existing.lifePhotos.count else {
                issue = String(localized: "The life photo order could not be saved.")
                return false
            }
            profile = existing.applyingLifePhotos(reordered)
            return true
        }
        #endif

        do {
            let response: APIEnvelope<NativeProfileLifePhotosMutation> = try await session.sendAuthorized(
                "api/v1/me/life-photos",
                method: .patch,
                body: NativeProfileLifePhotosReorderRequest(photoIds: photoIds),
                idempotencyKey: UUID().uuidString
            )
            profile = response.data.profile
            return true
        } catch {
            issue = error.localizedDescription
            return false
        }
    }

    func deleteLifePhoto(photoId: String, using session: SessionStore) async -> Bool {
        guard !isSaving else { return false }
        isSaving = true
        issue = nil
        defer { isSaving = false }

        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("--ui-testing-authenticated") {
            let existing = profile ?? .uiTestingFixture
            let nextPhotos = existing.lifePhotos
                .filter { $0.id != photoId }
                .enumerated()
                .map { index, photo in
                    NativeProfileLifePhoto(id: photo.id, url: photo.url, sortOrder: index)
                }
            profile = existing.applyingLifePhotos(nextPhotos)
            return true
        }
        #endif

        do {
            let response: APIEnvelope<NativeProfileLifePhotoDelete> = try await session.sendAuthorized(
                "api/v1/me/life-photos/\(photoId)",
                method: .delete,
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
