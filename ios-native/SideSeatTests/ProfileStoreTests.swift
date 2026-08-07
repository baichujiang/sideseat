import Foundation
import Testing
@testable import SideSeat

@Suite("Profile stores")
struct ProfileStoreTests {
    @Test("Normalizes school identity codes for branded verified badges")
    func schoolIdentityCodes() {
        #expect(StudentIdentityDisplay.schoolCode("TUM") == "TUM")
        #expect(StudentIdentityDisplay.schoolCode("Technical University of Munich") == "TUM")
        #expect(StudentIdentityDisplay.schoolCode("Ludwig-Maximilians-Universität München") == "LMU")
        #expect(StudentIdentityDisplay.logoAssetName("LMU") == "SchoolLogoLMU")
    }

    @Test("Maps every school verification state to one consistent presentation")
    func schoolIdentityStates() {
        #expect(StudentIdentityDisplay.tone(verifiedStudent: true, status: "VERIFIED") == .verified)
        #expect(StudentIdentityDisplay.tone(verifiedStudent: false, status: "EMAIL_PENDING") == .pending)
        #expect(StudentIdentityDisplay.tone(verifiedStudent: false, status: "MANUAL_REVIEW_REQUIRED") == .pending)
        #expect(StudentIdentityDisplay.tone(verifiedStudent: false, status: "REJECTED") == .rejected)
        #expect(StudentIdentityDisplay.tone(verifiedStudent: false, status: "UNVERIFIED") == .neutral)
        #expect(!StudentIdentityDisplay.canManageVerification(verifiedStudent: true, status: "VERIFIED"))
        #expect(StudentIdentityDisplay.canManageVerification(verifiedStudent: false, status: "EMAIL_PENDING"))
        #expect(StudentIdentityDisplay.canManageVerification(verifiedStudent: false, status: "REJECTED"))
        #expect(StudentIdentityDisplay.canManageVerification(verifiedStudent: false, status: "UNVERIFIED"))
    }

    @Test("Changing school clears the locally mirrored verification identity")
    func changingSchoolClearsVerificationIdentity() {
        let changed = NativeCurrentProfile.uiTestingFixture.applying(
            NativeProfileUpdateRequest(school: "LMU")
        )

        #expect(changed.school == "LMU")
        #expect(changed.schoolSummary.schoolShort == "LMU")
        #expect(changed.email == nil)
        #expect(!changed.verifiedStudent)
        #expect(changed.studentVerificationStatus == "UNVERIFIED")
    }

    @Test("Editing the same school keeps the locally mirrored verification identity")
    func keepingSchoolKeepsVerificationIdentity() {
        let unchanged = NativeCurrentProfile.uiTestingFixture.applying(
            NativeProfileUpdateRequest(school: "Technical University of Munich")
        )

        #expect(unchanged.schoolSummary.schoolShort == "TUM")
        #expect(unchanged.email == "test-001@tum.de")
        #expect(unchanged.verifiedStudent)
        #expect(unchanged.studentVerificationStatus == "VERIFIED")
    }

    @Test("Loads current and public profile DTOs")
    @MainActor
    func loadProfiles() async throws {
        let transport = ProfileTestTransport()
        let session = makeSession(transport: transport)
        await session.login(identifier: "test_001", password: "Password123")

        let current = CurrentProfileStore()
        await current.load(using: session)
        #expect(current.profile?.username == "test_001")
        #expect(current.profile?.schoolSummary.schoolShort == "TUM")
        #expect(await transport.loadedMe)
        #expect(await current.save(
            NativeProfileUpdateRequest(
                nickname: "Native Edited",
                bio: "Updated from Swift",
                gender: "PRIVATE",
                major: "Mathematics",
                semester: 4,
                wechatHandle: "wx_native",
                whatsappHandle: "+4915112345678",
                telegramHandle: "@tg_native",
                instagramHandle: "ig_native",
                contactInfoOptIn: true,
                hideFromDiscovery: true,
                hideFromCourseMembers: true
            ),
            using: session
        ))
        #expect(current.profile?.displayName == "Native Edited")
        #expect(current.profile?.tagline == "Updated from Swift")
        #expect(current.profile?.contacts.wechatHandle == "wx_native")
        #expect(current.profile?.privacy.contactInfoOptIn == true)
        #expect(current.profile?.privacy.hideFromDiscovery == true)
        #expect(await transport.updatedProfilePath == "/api/v1/me/profile")
        #expect(await transport.updatedNickname == "Native Edited")
        #expect(await transport.writeKeys.count == 1)

        let publicStore = PublicProfileStore()
        await publicStore.load(userID: "peer-1", using: session)
        #expect(publicStore.profile?.profile.username == "test_002")
        #expect(publicStore.profile?.mode == "connection")
        #expect(await transport.loadedPublicProfilePath == "/api/v1/users/peer-1/profile")
    }

    @Test("Surfaces archived course counts after a school change")
    @MainActor
    func capturesSchoolChangeSummary() async throws {
        let transport = ProfileTestTransport()
        let session = makeSession(transport: transport)
        await session.login(identifier: "test_001", password: "Password123")

        let current = CurrentProfileStore()
        await current.load(using: session)
        #expect(await current.save(
            NativeProfileUpdateRequest(school: "LMU"),
            using: session
        ))
        #expect(current.profile?.school == "LMU")
        #expect(current.lastSchoolChange == NativeProfileSchoolChangeSummary(
            archivedCourseCount: 2,
            removedCalendarEntryCount: 2,
            closedPostCount: 1,
            expiredInvitationCount: 0
        ))
    }

    @Test("Keeps the cached profile when a refresh fails")
    @MainActor
    func keepCachedProfileAfterRefreshFailure() async throws {
        let transport = ProfileTestTransport()
        let session = makeSession(transport: transport)
        await session.login(identifier: "test_001", password: "Password123")

        let current = CurrentProfileStore()
        await current.load(using: session)
        let cachedProfileID = try #require(current.profile?.id)

        await transport.failFutureProfileLoads()
        await current.load(using: session)

        #expect(current.profile?.id == cachedProfileID)
        #expect(current.issue != nil)
        #expect(!current.isLoading)
    }

    @Test("Uploads the current profile avatar")
    @MainActor
    func uploadCurrentAvatar() async throws {
        let transport = ProfileTestTransport()
        let session = makeSession(transport: transport)
        await session.login(identifier: "test_001", password: "Password123")

        let current = CurrentProfileStore()
        await current.load(using: session)
        let draft = NativeProfileAvatarDraft(
            id: UUID(uuidString: "22222222-2222-2222-2222-222222222222")!,
            data: Data([1, 2, 3, 4, 5]),
            mimeType: "image/jpeg",
            fileName: "avatar-test.jpg"
        )

        #expect(await current.uploadAvatar(draft, using: session))
        #expect(current.profile?.avatarUrl == "https://cdn.sideseat.test/avatars/user-1/avatar.jpg")
        #expect(await transport.uploadedAvatarPath == "/api/v1/me/avatar")
        #expect(await transport.uploadedAvatarContentType == "multipart/form-data")
        #expect(await transport.uploadedAvatarBodyContainsFilename)
        #expect(await transport.writeKeys.count == 1)
    }

    @Test("Updates the current login username")
    @MainActor
    func updateCurrentUsername() async throws {
        let transport = ProfileTestTransport()
        let session = makeSession(transport: transport)
        await session.login(identifier: "test_001", password: "Password123")

        let current = CurrentProfileStore()
        await current.load(using: session)

        #expect(await current.updateUsername("native_001", using: session))
        #expect(current.profile?.username == "native_001")
        #expect(current.profile?.canChangeUsernameNow == true)
        #expect(current.profile?.usernameChangesRemaining == 2)
        #expect(current.profile?.usernameNextAllowedAt == nil)
        #expect(await transport.updatedUsernamePath == "/api/v1/me/username")
        #expect(await transport.updatedUsername == "native_001")
        #expect(await transport.writeKeys.count == 1)
    }

    @Test("Tracks the three-change weekly username allowance")
    func tracksWeeklyUsernameAllowance() {
        let changedAt = Date().ISO8601Format()
        var profile = NativeCurrentProfile.uiTestingFixture

        profile = profile.applyingUsername("test_001a", updatedAt: changedAt)
        #expect(profile.usernameChangesRemaining == 2)
        #expect(profile.canChangeUsernameNow)

        profile = profile.applyingUsername("test_001b", updatedAt: changedAt)
        profile = profile.applyingUsername("test_001c", updatedAt: changedAt)
        #expect(profile.usernameChangesRemaining == 0)
        #expect(!profile.canChangeUsernameNow)
        #expect(profile.usernameNextAllowedAt != nil)
    }

    @MainActor
    private func makeSession(transport: ProfileTestTransport) -> SessionStore {
        SessionStore(
            apiClient: APIClient(
                environment: AppEnvironment(
                    deployment: .development,
                    apiBaseURL: URL(string: "https://api.sideseat.test")!,
                    bundleIdentifier: "app.sideseat.mobile.tests",
                    appVersion: "1.0.0",
                    buildNumber: "1"
                ),
                transport: transport
            ),
            credentialStore: ProfileMemoryCredentialStore(),
            device: NativeDevice(
                id: "profile-test-device",
                name: "Test iPhone",
                appVersion: "1.0.0",
                platformVersion: "26.5"
            )
        )
    }
}

private actor ProfileMemoryCredentialStore: CredentialStore {
    private var token: String?
    func refreshToken() -> String? { token }
    func save(refreshToken: String) { token = refreshToken }
    func clear() { token = nil }
}

private actor ProfileTestTransport: APITransport {
    private(set) var loadedMe = false
    private(set) var loadedPublicProfilePath: String?
    private(set) var updatedProfilePath: String?
    private(set) var updatedNickname: String?
    private(set) var uploadedAvatarPath: String?
    private(set) var uploadedAvatarContentType: String?
    private(set) var uploadedAvatarBodyContainsFilename = false
    private(set) var updatedUsernamePath: String?
    private(set) var updatedUsername: String?
    private(set) var writeKeys: [String] = []
    private var shouldFailProfileLoads = false

    func failFutureProfileLoads() {
        shouldFailProfileLoads = true
    }

    func data(for request: URLRequest) async throws -> (Data, URLResponse) {
        switch request.url?.path {
        case "/api/v1/auth/login":
            return response(
                request,
                200,
                #"{"data":{"user":{"id":"user-1","username":"test_001","nickname":"Test User","gender":"PRIVATE","onboardingComplete":true,"isGuest":false,"verifiedStudent":true,"studentVerificationStatus":"VERIFIED","locale":"en"},"tokens":{"accessToken":"access-token","accessExpiresIn":900,"refreshToken":"refresh-token","refreshExpiresAt":"2026-08-16T00:00:00.000Z"}}}"#
            )
        case "/api/v1/me":
            loadedMe = true
            if shouldFailProfileLoads {
                throw URLError(.timedOut)
            }
            return response(
                request,
                200,
                #"{"data":{"id":"user-1","username":"test_001","nickname":"Test User","email":"test-001@tum.de","phone":null,"avatarUrl":null,"tagline":"Library regular","school":"TUM","degreeLevel":"BACHELOR","major":"Informatics","semester":3,"gender":"PRIVATE","onboardingComplete":true,"isGuest":false,"verifiedStudent":true,"studentVerificationStatus":"VERIFIED","usernameUpdatedAt":null,"locale":"en","displayName":"Test User","schoolSummary":{"schoolShort":"TUM","degreeLabel":"Bachelor","major":"Informatics","semester":3},"lifePhotos":[],"contacts":{"wechatHandle":null,"whatsappHandle":null,"telegramHandle":null,"instagramHandle":null},"privacy":{"discoverByCourse":true,"discoverByMajor":true,"discoverBySemester":true,"allowInvitationNotes":true,"contactInfoOptIn":false,"hideFromCourseMembers":false,"hideFromDiscovery":false},"counts":{"blocked":0}}}"#
            )
        case "/api/v1/me/profile":
            updatedProfilePath = request.url?.path
            let requestBody = try bodyJSON(request)
            updatedNickname = requestBody["nickname"] as? String
            recordKey(request)
            let changedSchool = requestBody["school"] as? String == "LMU"
            let school = changedSchool ? "LMU" : "TUM"
            let schoolChange = changedSchool
                ? #"{"archivedCourseCount":2,"removedCalendarEntryCount":2,"closedPostCount":1,"expiredInvitationCount":0}"#
                : nil
            let schoolChangeField = schoolChange.map { ",\"schoolChange\":\($0)" } ?? ""
            return response(
                request,
                200,
                """
                {"data":{"id":"user-1","username":"test_001","nickname":"Native Edited","email":"test-001@tum.de","phone":null,"avatarUrl":null,"tagline":"Updated from Swift","school":"\(school)","degreeLevel":"BACHELOR","major":"Mathematics","semester":4,"gender":"PRIVATE","onboardingComplete":true,"isGuest":false,"verifiedStudent":true,"studentVerificationStatus":"VERIFIED","usernameUpdatedAt":null,"locale":"en","displayName":"Native Edited","schoolSummary":{"schoolShort":"\(school)","degreeLabel":"Bachelor","major":"Mathematics","semester":4},"lifePhotos":[],"contacts":{"wechatHandle":"wx_native","whatsappHandle":"+4915112345678","telegramHandle":"@tg_native","instagramHandle":"ig_native"},"privacy":{"discoverByCourse":true,"discoverByMajor":true,"discoverBySemester":true,"allowInvitationNotes":true,"contactInfoOptIn":true,"hideFromCourseMembers":true,"hideFromDiscovery":true},"counts":{"blocked":0}\(schoolChangeField)}}
                """
            )
        case "/api/v1/me/avatar":
            uploadedAvatarPath = request.url?.path
            uploadedAvatarContentType = request.value(forHTTPHeaderField: "Content-Type")?
                .split(separator: ";")
                .first
                .map(String.init)
            uploadedAvatarBodyContainsFilename = request.httpBody.flatMap { body in
                String(data: body, encoding: .utf8)?.contains(#"filename="avatar-test.jpg""#)
            } ?? false
            recordKey(request)
            return response(
                request,
                201,
                #"{"data":{"avatar":{"url":"https://cdn.sideseat.test/avatars/user-1/avatar.jpg","contentType":"image/jpeg","width":512,"height":512,"byteSize":5},"profile":{"id":"user-1","username":"test_001","nickname":"Test User","email":"test-001@tum.de","phone":null,"avatarUrl":"https://cdn.sideseat.test/avatars/user-1/avatar.jpg","tagline":"Library regular","school":"TUM","degreeLevel":"BACHELOR","major":"Informatics","semester":3,"gender":"PRIVATE","onboardingComplete":true,"isGuest":false,"verifiedStudent":true,"studentVerificationStatus":"VERIFIED","usernameUpdatedAt":null,"locale":"en","displayName":"Test User","schoolSummary":{"schoolShort":"TUM","degreeLabel":"Bachelor","major":"Informatics","semester":3},"lifePhotos":[],"contacts":{"wechatHandle":null,"whatsappHandle":null,"telegramHandle":null,"instagramHandle":null},"privacy":{"discoverByCourse":true,"discoverByMajor":true,"discoverBySemester":true,"allowInvitationNotes":true,"contactInfoOptIn":false,"hideFromCourseMembers":false,"hideFromDiscovery":false},"counts":{"blocked":0}}}}"#
            )
        case "/api/v1/me/username":
            updatedUsernamePath = request.url?.path
            updatedUsername = try bodyJSON(request)["username"] as? String
            recordKey(request)
            return response(
                request,
                200,
                #"{"data":{"id":"user-1","username":"native_001","nickname":"Test User","email":"test-001@tum.de","phone":null,"avatarUrl":null,"tagline":"Library regular","school":"TUM","degreeLevel":"BACHELOR","major":"Informatics","semester":3,"gender":"PRIVATE","onboardingComplete":true,"isGuest":false,"verifiedStudent":true,"studentVerificationStatus":"VERIFIED","usernameUpdatedAt":"2026-08-07T02:00:00.000Z","usernameChangePolicy":{"limit":3,"windowDays":7,"changesUsed":1,"changesRemaining":2,"nextAllowedAt":null},"locale":"en","displayName":"Test User","schoolSummary":{"schoolShort":"TUM","degreeLabel":"Bachelor","major":"Informatics","semester":3},"lifePhotos":[],"contacts":{"wechatHandle":null,"whatsappHandle":null,"telegramHandle":null,"instagramHandle":null},"privacy":{"discoverByCourse":true,"discoverByMajor":true,"discoverBySemester":true,"allowInvitationNotes":true,"contactInfoOptIn":false,"hideFromCourseMembers":false,"hideFromDiscovery":false},"counts":{"blocked":0}}}"#
            )
        case "/api/v1/users/peer-1/profile":
            loadedPublicProfilePath = request.url?.path
            return response(
                request,
                200,
                #"{"data":{"mode":"connection","connectionId":"connection-1","metVia":"Software Engineering","viewerCanMessage":true,"myContactRemark":null,"profile":{"id":"peer-1","username":"test_002","displayName":"Mina","nickname":"Mina","gender":"PRIVATE","avatarUrl":null,"tagline":"At the library","school":"TUM","degreeLevel":"BACHELOR","major":"Informatics","semester":3,"verifiedStudent":true,"studentVerificationStatus":"VERIFIED","schoolSummary":{"schoolShort":"TUM","degreeLabel":"Bachelor","major":"Informatics","semester":3},"lifePhotos":[]},"sharedCourses":[{"id":"course-1","code":"IN0001","name":"Software Engineering"}],"peerCourses":[{"id":"course-1","code":"IN0001","name":"Software Engineering"}]}}"#
            )
        default:
            return response(
                request,
                404,
                #"{"error":{"code":"NOT_FOUND","message":"Missing","retryable":false,"requestId":"request-1"}}"#
            )
        }
    }

    private func bodyJSON(_ request: URLRequest) throws -> [String: Any] {
        let body = try #require(request.httpBody)
        return try #require(JSONSerialization.jsonObject(with: body) as? [String: Any])
    }

    private func recordKey(_ request: URLRequest) {
        if let key = request.value(forHTTPHeaderField: "Idempotency-Key") {
            writeKeys.append(key)
        }
    }

    private func response(_ request: URLRequest, _ status: Int, _ body: String) -> (Data, URLResponse) {
        let response = HTTPURLResponse(
            url: request.url!,
            statusCode: status,
            httpVersion: "HTTP/1.1",
            headerFields: ["Content-Type": "application/json"]
        )!
        return (Data(body.utf8), response)
    }
}
