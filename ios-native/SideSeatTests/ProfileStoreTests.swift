import Foundation
import Testing
@testable import SideSeat

@Suite("Profile stores")
struct ProfileStoreTests {
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
        #expect(current.profile?.languages.first?.tag == "ENGLISH")
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
        #expect(current.profile?.canChangeUsernameNow == false)
        #expect(current.profile?.usernameNextAllowedAt != nil)
        #expect(await transport.updatedUsernamePath == "/api/v1/me/username")
        #expect(await transport.updatedUsername == "native_001")
        #expect(await transport.writeKeys.count == 1)
    }

    @Test("Manages current profile life photos")
    @MainActor
    func manageLifePhotos() async throws {
        let transport = ProfileTestTransport()
        let session = makeSession(transport: transport)
        await session.login(identifier: "test_001", password: "Password123")

        let current = CurrentProfileStore()
        await current.load(using: session)
        let firstDraft = NativeProfileLifePhotoDraft(
            id: UUID(uuidString: "33333333-3333-3333-3333-333333333333")!,
            data: Data([1, 2, 3]),
            mimeType: "image/jpeg",
            fileName: "life-a.jpg"
        )
        let secondDraft = NativeProfileLifePhotoDraft(
            id: UUID(uuidString: "44444444-4444-4444-4444-444444444444")!,
            data: Data([4, 5, 6]),
            mimeType: "image/jpeg",
            fileName: "life-b.jpg"
        )

        #expect(await current.uploadLifePhoto(firstDraft, using: session))
        #expect(await current.uploadLifePhoto(secondDraft, using: session))
        #expect(current.profile?.lifePhotos.map(\.id) == ["photo-1", "photo-2"])
        #expect(await transport.uploadedLifePhotoPath == "/api/v1/me/life-photos")
        #expect(await transport.uploadedLifePhotoContentType == "multipart/form-data")
        #expect(await transport.uploadedLifePhotoBodyContainsFilename)

        #expect(await current.reorderLifePhotos(photoIds: ["photo-2", "photo-1"], using: session))
        #expect(current.profile?.lifePhotos.map(\.id) == ["photo-2", "photo-1"])
        #expect(await transport.reorderedLifePhotoIds == ["photo-2", "photo-1"])

        #expect(await current.deleteLifePhoto(photoId: "photo-2", using: session))
        #expect(current.profile?.lifePhotos.map(\.id) == ["photo-1"])
        #expect(await transport.deletedLifePhotoPath == "/api/v1/me/life-photos/photo-2")
        #expect(await transport.writeKeys.count == 4)
        #expect(await Set(transport.writeKeys).count == 4)
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
    private(set) var uploadedLifePhotoPath: String?
    private(set) var uploadedLifePhotoContentType: String?
    private(set) var uploadedLifePhotoBodyContainsFilename = false
    private(set) var reorderedLifePhotoIds: [String] = []
    private(set) var deletedLifePhotoPath: String?
    private(set) var writeKeys: [String] = []
    private var lifePhotoUploadCount = 0

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
            return response(
                request,
                200,
                #"{"data":{"id":"user-1","username":"test_001","nickname":"Test User","email":"test-001@tum.de","phone":null,"avatarUrl":null,"tagline":"Library regular","school":"TUM","degreeLevel":"BACHELOR","major":"Informatics","semester":3,"gender":"PRIVATE","onboardingComplete":true,"isGuest":false,"verifiedStudent":true,"studentVerificationStatus":"VERIFIED","usernameUpdatedAt":null,"locale":"en","displayName":"Test User","schoolSummary":{"schoolShort":"TUM","degreeLabel":"Bachelor","major":"Informatics","semester":3},"languages":[{"tag":"ENGLISH","proficiency":"FLUENT"}],"lifePhotos":[],"contacts":{"wechatHandle":null,"whatsappHandle":null,"telegramHandle":null,"instagramHandle":null},"privacy":{"discoverByCourse":true,"discoverByMajor":true,"discoverBySemester":true,"allowInvitationNotes":true,"contactInfoOptIn":false,"hideFromCourseMembers":false,"hideFromDiscovery":false},"counts":{"blocked":0}}}"#
            )
        case "/api/v1/me/profile":
            updatedProfilePath = request.url?.path
            updatedNickname = try bodyJSON(request)["nickname"] as? String
            recordKey(request)
            return response(
                request,
                200,
                #"{"data":{"id":"user-1","username":"test_001","nickname":"Native Edited","email":"test-001@tum.de","phone":null,"avatarUrl":null,"tagline":"Updated from Swift","school":"TUM","degreeLevel":"BACHELOR","major":"Mathematics","semester":4,"gender":"PRIVATE","onboardingComplete":true,"isGuest":false,"verifiedStudent":true,"studentVerificationStatus":"VERIFIED","usernameUpdatedAt":null,"locale":"en","displayName":"Native Edited","schoolSummary":{"schoolShort":"TUM","degreeLabel":"Bachelor","major":"Mathematics","semester":4},"languages":[{"tag":"ENGLISH","proficiency":"FLUENT"}],"lifePhotos":[],"contacts":{"wechatHandle":"wx_native","whatsappHandle":"+4915112345678","telegramHandle":"@tg_native","instagramHandle":"ig_native"},"privacy":{"discoverByCourse":true,"discoverByMajor":true,"discoverBySemester":true,"allowInvitationNotes":true,"contactInfoOptIn":true,"hideFromCourseMembers":true,"hideFromDiscovery":true},"counts":{"blocked":0}}}"#
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
                #"{"data":{"avatar":{"url":"https://cdn.sideseat.test/avatars/user-1/avatar.jpg","contentType":"image/jpeg","width":512,"height":512,"byteSize":5},"profile":{"id":"user-1","username":"test_001","nickname":"Test User","email":"test-001@tum.de","phone":null,"avatarUrl":"https://cdn.sideseat.test/avatars/user-1/avatar.jpg","tagline":"Library regular","school":"TUM","degreeLevel":"BACHELOR","major":"Informatics","semester":3,"gender":"PRIVATE","onboardingComplete":true,"isGuest":false,"verifiedStudent":true,"studentVerificationStatus":"VERIFIED","usernameUpdatedAt":null,"locale":"en","displayName":"Test User","schoolSummary":{"schoolShort":"TUM","degreeLabel":"Bachelor","major":"Informatics","semester":3},"languages":[{"tag":"ENGLISH","proficiency":"FLUENT"}],"lifePhotos":[],"contacts":{"wechatHandle":null,"whatsappHandle":null,"telegramHandle":null,"instagramHandle":null},"privacy":{"discoverByCourse":true,"discoverByMajor":true,"discoverBySemester":true,"allowInvitationNotes":true,"contactInfoOptIn":false,"hideFromCourseMembers":false,"hideFromDiscovery":false},"counts":{"blocked":0}}}}"#
            )
        case "/api/v1/me/username":
            updatedUsernamePath = request.url?.path
            updatedUsername = try bodyJSON(request)["username"] as? String
            recordKey(request)
            return response(
                request,
                200,
                #"{"data":{"id":"user-1","username":"native_001","nickname":"Test User","email":"test-001@tum.de","phone":null,"avatarUrl":null,"tagline":"Library regular","school":"TUM","degreeLevel":"BACHELOR","major":"Informatics","semester":3,"gender":"PRIVATE","onboardingComplete":true,"isGuest":false,"verifiedStudent":true,"studentVerificationStatus":"VERIFIED","usernameUpdatedAt":"2026-07-17T02:00:00.000Z","locale":"en","displayName":"Test User","schoolSummary":{"schoolShort":"TUM","degreeLabel":"Bachelor","major":"Informatics","semester":3},"languages":[{"tag":"ENGLISH","proficiency":"FLUENT"}],"lifePhotos":[],"contacts":{"wechatHandle":null,"whatsappHandle":null,"telegramHandle":null,"instagramHandle":null},"privacy":{"discoverByCourse":true,"discoverByMajor":true,"discoverBySemester":true,"allowInvitationNotes":true,"contactInfoOptIn":false,"hideFromCourseMembers":false,"hideFromDiscovery":false},"counts":{"blocked":0}}}"#
            )
        case "/api/v1/me/life-photos":
            recordKey(request)
            if request.httpMethod == "PATCH" {
                reorderedLifePhotoIds = try #require(bodyJSON(request)["photoIds"] as? [String])
                return response(
                    request,
                    200,
                    #"{"data":{"photos":[{"id":"photo-2","url":"https://cdn.sideseat.test/life/photo-2.jpg","sortOrder":0},{"id":"photo-1","url":"https://cdn.sideseat.test/life/photo-1.jpg","sortOrder":1}],"profile":{"id":"user-1","username":"test_001","nickname":"Test User","email":"test-001@tum.de","phone":null,"avatarUrl":null,"tagline":"Library regular","school":"TUM","degreeLevel":"BACHELOR","major":"Informatics","semester":3,"gender":"PRIVATE","onboardingComplete":true,"isGuest":false,"verifiedStudent":true,"studentVerificationStatus":"VERIFIED","usernameUpdatedAt":null,"locale":"en","displayName":"Test User","schoolSummary":{"schoolShort":"TUM","degreeLabel":"Bachelor","major":"Informatics","semester":3},"languages":[{"tag":"ENGLISH","proficiency":"FLUENT"}],"lifePhotos":[{"id":"photo-2","url":"https://cdn.sideseat.test/life/photo-2.jpg","sortOrder":0},{"id":"photo-1","url":"https://cdn.sideseat.test/life/photo-1.jpg","sortOrder":1}],"contacts":{"wechatHandle":null,"whatsappHandle":null,"telegramHandle":null,"instagramHandle":null},"privacy":{"discoverByCourse":true,"discoverByMajor":true,"discoverBySemester":true,"allowInvitationNotes":true,"contactInfoOptIn":false,"hideFromCourseMembers":false,"hideFromDiscovery":false},"counts":{"blocked":0}}}}"#
                )
            }
            lifePhotoUploadCount += 1
            uploadedLifePhotoPath = request.url?.path
            uploadedLifePhotoContentType = request.value(forHTTPHeaderField: "Content-Type")?
                .split(separator: ";")
                .first
                .map(String.init)
            uploadedLifePhotoBodyContainsFilename = request.httpBody.flatMap { body in
                String(data: body, encoding: .utf8)?.contains(#"filename="life-b.jpg""#)
            } ?? false
            if lifePhotoUploadCount == 1 {
                return response(
                    request,
                    201,
                    #"{"data":{"photo":{"id":"photo-1","url":"https://cdn.sideseat.test/life/photo-1.jpg","sortOrder":0},"upload":{"url":"https://cdn.sideseat.test/life/photo-1.jpg","contentType":"image/jpeg","width":800,"height":600,"byteSize":3},"profile":{"id":"user-1","username":"test_001","nickname":"Test User","email":"test-001@tum.de","phone":null,"avatarUrl":null,"tagline":"Library regular","school":"TUM","degreeLevel":"BACHELOR","major":"Informatics","semester":3,"gender":"PRIVATE","onboardingComplete":true,"isGuest":false,"verifiedStudent":true,"studentVerificationStatus":"VERIFIED","usernameUpdatedAt":null,"locale":"en","displayName":"Test User","schoolSummary":{"schoolShort":"TUM","degreeLabel":"Bachelor","major":"Informatics","semester":3},"languages":[{"tag":"ENGLISH","proficiency":"FLUENT"}],"lifePhotos":[{"id":"photo-1","url":"https://cdn.sideseat.test/life/photo-1.jpg","sortOrder":0}],"contacts":{"wechatHandle":null,"whatsappHandle":null,"telegramHandle":null,"instagramHandle":null},"privacy":{"discoverByCourse":true,"discoverByMajor":true,"discoverBySemester":true,"allowInvitationNotes":true,"contactInfoOptIn":false,"hideFromCourseMembers":false,"hideFromDiscovery":false},"counts":{"blocked":0}}}}"#
                )
            }
            return response(
                request,
                201,
                #"{"data":{"photo":{"id":"photo-2","url":"https://cdn.sideseat.test/life/photo-2.jpg","sortOrder":1},"upload":{"url":"https://cdn.sideseat.test/life/photo-2.jpg","contentType":"image/jpeg","width":800,"height":600,"byteSize":3},"profile":{"id":"user-1","username":"test_001","nickname":"Test User","email":"test-001@tum.de","phone":null,"avatarUrl":null,"tagline":"Library regular","school":"TUM","degreeLevel":"BACHELOR","major":"Informatics","semester":3,"gender":"PRIVATE","onboardingComplete":true,"isGuest":false,"verifiedStudent":true,"studentVerificationStatus":"VERIFIED","usernameUpdatedAt":null,"locale":"en","displayName":"Test User","schoolSummary":{"schoolShort":"TUM","degreeLabel":"Bachelor","major":"Informatics","semester":3},"languages":[{"tag":"ENGLISH","proficiency":"FLUENT"}],"lifePhotos":[{"id":"photo-1","url":"https://cdn.sideseat.test/life/photo-1.jpg","sortOrder":0},{"id":"photo-2","url":"https://cdn.sideseat.test/life/photo-2.jpg","sortOrder":1}],"contacts":{"wechatHandle":null,"whatsappHandle":null,"telegramHandle":null,"instagramHandle":null},"privacy":{"discoverByCourse":true,"discoverByMajor":true,"discoverBySemester":true,"allowInvitationNotes":true,"contactInfoOptIn":false,"hideFromCourseMembers":false,"hideFromDiscovery":false},"counts":{"blocked":0}}}}"#
            )
        case "/api/v1/me/life-photos/photo-2":
            deletedLifePhotoPath = request.url?.path
            recordKey(request)
            return response(
                request,
                200,
                #"{"data":{"deletedPhotoId":"photo-2","profile":{"id":"user-1","username":"test_001","nickname":"Test User","email":"test-001@tum.de","phone":null,"avatarUrl":null,"tagline":"Library regular","school":"TUM","degreeLevel":"BACHELOR","major":"Informatics","semester":3,"gender":"PRIVATE","onboardingComplete":true,"isGuest":false,"verifiedStudent":true,"studentVerificationStatus":"VERIFIED","usernameUpdatedAt":null,"locale":"en","displayName":"Test User","schoolSummary":{"schoolShort":"TUM","degreeLabel":"Bachelor","major":"Informatics","semester":3},"languages":[{"tag":"ENGLISH","proficiency":"FLUENT"}],"lifePhotos":[{"id":"photo-1","url":"https://cdn.sideseat.test/life/photo-1.jpg","sortOrder":0}],"contacts":{"wechatHandle":null,"whatsappHandle":null,"telegramHandle":null,"instagramHandle":null},"privacy":{"discoverByCourse":true,"discoverByMajor":true,"discoverBySemester":true,"allowInvitationNotes":true,"contactInfoOptIn":false,"hideFromCourseMembers":false,"hideFromDiscovery":false},"counts":{"blocked":0}}}}"#
            )
        case "/api/v1/users/peer-1/profile":
            loadedPublicProfilePath = request.url?.path
            return response(
                request,
                200,
                #"{"data":{"mode":"connection","connectionId":"connection-1","metVia":"Software Engineering","viewerCanMessage":true,"myContactRemark":null,"profile":{"id":"peer-1","username":"test_002","displayName":"Mina","nickname":"Mina","gender":"PRIVATE","avatarUrl":null,"tagline":"At the library","school":"TUM","degreeLevel":"BACHELOR","major":"Informatics","semester":3,"verifiedStudent":true,"studentVerificationStatus":"VERIFIED","schoolSummary":{"schoolShort":"TUM","degreeLabel":"Bachelor","major":"Informatics","semester":3},"languages":[{"tag":"ENGLISH","proficiency":"FLUENT"}],"lifePhotos":[]},"sharedCourses":[{"id":"course-1","code":"IN0001","name":"Software Engineering"}],"peerCourses":[{"id":"course-1","code":"IN0001","name":"Software Engineering"}]}}"#
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
