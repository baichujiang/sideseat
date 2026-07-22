import Foundation
import Testing
@testable import SideSeat

@Suite("Discover stores")
struct DiscoverStoreTests {
    @Test("Loads both feed kinds and creates idempotent buddy and activity writes")
    @MainActor
    func loadAndCreate() async throws {
        let transport = DiscoverTestTransport()
        let session = makeSession(transport: transport)
        await session.login(identifier: "test_001", password: "Password123")

        let feed = DiscoverFeedStore()
        await feed.load(using: session, query: "library")
        #expect(feed.payload?.buddies.first?.title == "Library study buddy")
        #expect(feed.payload?.activities.first?.title == "Conversation meetup")
        #expect(await transport.feedQuery == "library")

        let create = DiscoverCreateStore()
        let draft = NativeDiscoverBuddyImageDraft(
            id: UUID(uuidString: "11111111-1111-1111-1111-111111111111")!,
            data: Data([1, 2, 3, 4]),
            mimeType: "image/jpeg",
            fileName: "buddy-test.jpg"
        )
        #expect(await create.createBuddy(
            title: "Study together",
            body: "Main library",
            expiresAt: Date(timeIntervalSince1970: 1_800_000_000),
            images: [draft],
            using: session
        ))
        #expect(await create.createActivity(
            title: "Meetup",
            description: "Conversation practice",
            startAt: Date(timeIntervalSince1970: 1_800_003_600),
            location: "Cafe",
            unlimitedCapacity: false,
            capacity: 8,
            using: session
        ))
        #expect(await transport.buddyTitle == "Study together")
        #expect(await transport.buddyImageUrls == ["https://cdn.sideseat.test/classmate-posts/user-1/photo.jpg"])
        #expect(await transport.uploadedImageContentType == "multipart/form-data")
        #expect(await transport.activityCapacity == 8)
        #expect(await transport.writeKeys.count == 3)
        #expect(await Set(transport.writeKeys).count == 3)
    }

    @Test("Loads details and applies save and RSVP mutations")
    @MainActor
    func detailsAndActions() async throws {
        let transport = DiscoverTestTransport()
        let session = makeSession(transport: transport)
        await session.login(identifier: "test_001", password: "Password123")

        let post = DiscoverPostDetailStore()
        await post.load(postID: "post-1", using: session)
        #expect(post.detail?.post.title == "Library study buddy")
        #expect(post.detail?.post.savedByViewer == false)
        await post.setSaved(true, postID: "post-1", using: session)
        #expect(post.detail?.post.savedByViewer == true)
        #expect(post.detail?.post.interestedCount == 3)

        let activity = DiscoverActivityDetailStore()
        await activity.load(activityID: "activity-1", using: session)
        #expect(activity.detail?.activity.title == "Conversation meetup")
        #expect(activity.detail?.activity.viewerSignupStatus == nil)
        #expect(activity.detail?.calendarEntryId == nil)
        await activity.setSignup(true, activityID: "activity-1", using: session)
        #expect(activity.detail?.activity.viewerSignupStatus == "GOING")
        #expect(activity.detail?.activity.goingCount == 5)
        await activity.addToCalendar(activityID: "activity-1", using: session)
        #expect(activity.detail?.calendarEntryId == "calendar-1")

        #expect(await transport.lastSavedPath == "/api/v1/discover/posts/post-1/saved")
        #expect(await transport.lastSignupPath == "/api/v1/discover/activities/activity-1/signup")
        #expect(await transport.lastCalendarPath == "/api/v1/discover/activities/activity-1/calendar")
        #expect(await transport.writeKeys.count == 3)
    }

    @MainActor
    private func makeSession(transport: DiscoverTestTransport) -> SessionStore {
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
            credentialStore: DiscoverMemoryCredentialStore(),
            device: NativeDevice(
                id: "discover-test-device",
                name: "Test iPhone",
                appVersion: "1.0.0",
                platformVersion: "26.5"
            )
        )
    }
}

private actor DiscoverMemoryCredentialStore: CredentialStore {
    private var token: String?
    func refreshToken() -> String? { token }
    func save(refreshToken: String) { token = refreshToken }
    func clear() { token = nil }
}

private actor DiscoverTestTransport: APITransport {
    private(set) var feedQuery: String?
    private(set) var buddyTitle: String?
    private(set) var buddyImageUrls: [String] = []
    private(set) var uploadedImageContentType: String?
    private(set) var activityCapacity: Int?
    private(set) var writeKeys: [String] = []
    private(set) var lastSavedPath: String?
    private(set) var lastSignupPath: String?
    private(set) var lastCalendarPath: String?

    func data(for request: URLRequest) async throws -> (Data, URLResponse) {
        switch request.url?.path {
        case "/api/v1/auth/login":
            return response(
                request,
                200,
                #"{"data":{"user":{"id":"user-1","username":"test_001","nickname":"Test User","gender":"UNSPECIFIED","onboardingComplete":true,"isGuest":false,"verifiedStudent":true,"studentVerificationStatus":"VERIFIED","locale":"en"},"tokens":{"accessToken":"access-token","accessExpiresIn":900,"refreshToken":"refresh-token","refreshExpiresAt":"2026-08-16T00:00:00.000Z"}}}"#
            )
        case "/api/v1/discover":
            feedQuery = URLComponents(url: request.url!, resolvingAgainstBaseURL: false)?
                .queryItems?.first(where: { $0.name == "q" })?.value
            return response(
                request,
                200,
                #"{"data":{"city":"Munich","buddies":[{"id":"post-1","category":"OTHER","city":"Munich","title":"Library study buddy","body":"Study together","createdAt":"2026-07-17T10:00:00Z","expiresAt":"2026-07-20T10:00:00Z","isOwn":false,"savedByViewer":false,"interestedCount":2,"imageUrls":[],"linkedCourses":[],"author":{"id":"peer-1","displayName":"Mina","tagline":"At the library","avatarUrl":null,"major":"Informatics","semester":3,"school":"TUM","verifiedStudent":true}}],"activities":[{"id":"activity-1","city":"Munich","school":"TUM","title":"Conversation meetup","description":"Practice together","category":null,"startAt":"2026-07-18T16:00:00Z","endAt":"2026-07-18T18:00:00Z","location":"Cafe","capacity":10,"status":"OPEN","phase":"bookable","goingCount":4,"viewerSignupStatus":null,"isOrganizer":false,"organizer":{"id":"peer-2","displayName":"Noah","avatarUrl":null}}]}}"#
            )
        case "/api/v1/discover/posts":
            let json = try bodyJSON(request)
            buddyTitle = json["title"] as? String
            buddyImageUrls = (json["imageUrls"] as? [String]) ?? []
            recordKey(request)
            return response(
                request,
                201,
                #"{"data":{"postId":"post-new","status":"ACTIVE","expiresAt":"2027-01-15T08:00:00Z"}}"#
            )
        case "/api/v1/discover/posts/images":
            uploadedImageContentType = request.value(forHTTPHeaderField: "Content-Type")?
                .split(separator: ";")
                .first
                .map(String.init)
            recordKey(request)
            return response(
                request,
                201,
                #"{"data":{"image":{"url":"https://cdn.sideseat.test/classmate-posts/user-1/photo.jpg","contentType":"image/jpeg","width":800,"height":600,"byteSize":4}}}"#
            )
        case "/api/v1/discover/posts/post-1":
            return response(
                request,
                200,
                #"{"data":{"post":{"id":"post-1","category":"OTHER","city":"Munich","title":"Library study buddy","body":"Study together","createdAt":"2026-07-17T10:00:00Z","expiresAt":"2026-07-20T10:00:00Z","isOwn":false,"savedByViewer":false,"interestedCount":2,"imageUrls":[],"linkedCourses":[],"author":{"id":"peer-1","displayName":"Mina","tagline":null,"avatarUrl":null,"major":"Informatics","semester":3,"school":"TUM","verifiedStudent":true}},"viewerCanMessage":true}}"#
            )
        case "/api/v1/discover/posts/post-1/saved":
            lastSavedPath = request.url?.path
            recordKey(request)
            return response(
                request,
                request.httpMethod == "POST" ? 201 : 200,
                #"{"data":{"postId":"post-1","savedByViewer":true,"interestedCount":3}}"#
            )
        case "/api/v1/discover/activities":
            let json = try bodyJSON(request)
            activityCapacity = json["capacity"] as? Int
            recordKey(request)
            return response(
                request,
                201,
                #"{"data":{"activityId":"activity-new","status":"OPEN","phase":"bookable"}}"#
            )
        case "/api/v1/discover/activities/activity-1":
            return response(
                request,
                200,
                #"{"data":{"activity":{"id":"activity-1","city":"Munich","school":"TUM","title":"Conversation meetup","description":"Practice together","category":null,"startAt":"2026-07-18T16:00:00Z","endAt":"2026-07-18T18:00:00Z","location":"Cafe","capacity":10,"status":"OPEN","phase":"bookable","goingCount":4,"viewerSignupStatus":null,"isOrganizer":false,"organizer":{"id":"peer-2","displayName":"Noah","avatarUrl":null}},"goingAttendees":[{"userId":"peer-1","displayName":"Mina","avatarUrl":null}],"viewerHasExistingChat":false,"calendarEntryId":null}}"#
            )
        case "/api/v1/discover/activities/activity-1/signup":
            lastSignupPath = request.url?.path
            recordKey(request)
            return response(
                request,
                request.httpMethod == "POST" ? 201 : 200,
                #"{"data":{"activity":{"id":"activity-1","city":"Munich","school":"TUM","title":"Conversation meetup","description":"Practice together","category":null,"startAt":"2026-07-18T16:00:00Z","endAt":"2026-07-18T18:00:00Z","location":"Cafe","capacity":10,"status":"OPEN","phase":"bookable","goingCount":5,"viewerSignupStatus":"GOING","isOrganizer":false,"organizer":{"id":"peer-2","displayName":"Noah","avatarUrl":null}}}}"#
            )
        case "/api/v1/discover/activities/activity-1/calendar":
            lastCalendarPath = request.url?.path
            recordKey(request)
            return response(
                request,
                201,
                #"{"data":{"calendarEntryId":"calendar-1","created":true}}"#
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
