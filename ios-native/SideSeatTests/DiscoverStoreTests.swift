import Foundation
import Testing
@testable import SideSeat

@Suite("Discover stores")
struct DiscoverStoreTests {
    @Test("Derives plan status from both API state and expiry")
    func planStatusPresentation() {
        let now = Date(timeIntervalSince1970: 1_800_000_000)
        let future = Date(timeIntervalSince1970: 1_800_003_600)
        let past = Date(timeIntervalSince1970: 1_799_996_400)

        let open = BuddyPostDisplay.status("active", expiryDate: future, now: now)
        #expect(open.isOpen)
        #expect(open.tone == .success)
        #expect(open.systemImage == "circle.fill")

        let expired = BuddyPostDisplay.status("ACTIVE", expiryDate: past, now: now)
        #expect(!expired.isOpen)
        #expect(expired.systemImage == "clock.badge.exclamationmark")

        let closed = BuddyPostDisplay.status("closed", expiryDate: future, now: now)
        #expect(!closed.isOpen)
        #expect(closed.systemImage == "lock.fill")

        let schoolChanged = BuddyPostDisplay.status(
            "closed",
            closureReason: "SCHOOL_CHANGED",
            expiryDate: future,
            now: now
        )
        #expect(!schoolChanged.isOpen)
        #expect(schoolChanged.tone == .warning)
        #expect(schoolChanged.systemImage == "building.columns.fill")
    }

    @Test("Normalizes activity phase and visibility icon semantics")
    func activityAndVisibilityPresentation() {
        #expect(DiscoverActivityDisplay.status(phase: "BOOKABLE").isOpen)
        #expect(DiscoverActivityDisplay.status(phase: "FULL").tone == .warning)
        #expect(DiscoverActivityDisplay.status(phase: "CANCELED").tone == .danger)
        #expect(BuddyPostDisplay.visibilitySystemImage("SCHOOL_ONLY") == "building.columns")
        #expect(BuddyPostDisplay.visibilitySystemImage("VERIFIED_ONLY") == "checkmark.seal")
    }

    @Test("Extracts unique Unicode hashtags from plan copy")
    func planHashtags() {
        #expect(
            BuddyHashtagParser.tags(
                in: "Looking for #Study and #自习 buddies. #study #coffee-time #not@included"
            ) == ["study", "自习", "coffee-time", "not"]
        )
        #expect(BuddyHashtagParser.tags(in: "No separate tag field") == [])
    }

    @Test("Builds a public SideSeat invite caption")
    func appShareContent() {
        #expect(SideSeatAppShareContent.url.absoluteString == "https://www.sideseat.de")
        #expect(SideSeatAppShareContent.text.contains("SideSeat"))
        #expect(SideSeatAppShareContent.text.contains("#留学生社交"))
        #expect(SideSeatAppShareContent.text.contains(SideSeatAppShareContent.url.absoluteString))
    }

    @Test("Builds a public plan share link and Xiaohongshu-ready caption")
    func planShareContent() {
        let post = NativeDiscoverFeed.uiTestingFixture.buddies[0]
        let url = DiscoverPlanShareContent.url(for: post)
        let text = DiscoverPlanShareContent.text(for: post)

        #expect(url.absoluteString == "https://www.sideseat.de/discover/posts/ui-buddy")
        #expect(text.contains("Library study buddy"))
        #expect(text.contains("Main Library, Munich"))
        #expect(text.contains("#留学生找搭子"))
        #expect(text.contains(url.absoluteString))
    }

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
        #expect(create.savedPostID == "post-new")
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
        #expect(await transport.buddyVisibility == "CITY_INTERNATIONALS")
        #expect(await transport.buddyReplyPreference == "DIRECT_MESSAGE")
        #expect(await transport.uploadedImageContentType == "multipart/form-data")
        #expect(await transport.activityCapacity == 8)
        #expect(await transport.writeKeys.count == 3)
        #expect(await Set(transport.writeKeys).count == 3)
    }

    @Test("Creates a fresh shared-course post when reposting")
    @MainActor
    func repostSharedCoursePlan() async throws {
        let transport = DiscoverTestTransport()
        let session = makeSession(transport: transport)
        await session.login(identifier: "test_001", password: "Password123")

        let store = DiscoverCreateStore()
        #expect(await store.createBuddy(
            category: "SHARED_COURSES",
            title: "Find classmates for algorithms",
            body: "Review problem sets together",
            visibility: "SCHOOL_ONLY",
            courseIds: ["current-course"],
            expiresAt: Date(timeIntervalSince1970: 1_900_000_000),
            existingImageURLs: ["https://cdn.sideseat.test/classmate-posts/user-1/existing.jpg"],
            using: session
        ))
        #expect(store.savedPostID == "post-new")
        #expect(await transport.buddyCategory == "SHARED_COURSES")
        #expect(await transport.buddyCourseIds == ["current-course"])
        #expect(
            await transport.buddyImageUrls == [
                "https://cdn.sideseat.test/classmate-posts/user-1/existing.jpg"
            ]
        )
    }

    @Test("Updates an existing buddy post in place")
    @MainActor
    func updateBuddy() async throws {
        let transport = DiscoverTestTransport()
        let session = makeSession(transport: transport)
        await session.login(identifier: "test_001", password: "Password123")

        let feed = DiscoverFeedStore()
        await feed.load(using: session)
        let post = try #require(feed.payload?.buddies.first)
        let store = DiscoverCreateStore()
        let expiry = Date(timeIntervalSince1970: 1_900_000_000)

        #expect(await store.updateBuddy(
            post: post,
            title: "Updated study plan",
            body: "New details #focus",
            tags: ["focus"],
            visibility: "VERIFIED_ONLY",
            courseIds: [],
            startsAt: nil,
            endsAt: nil,
            location: nil,
            capacity: nil,
            expiresAt: expiry,
            existingImageURLs: [],
            images: [],
            using: session
        ))
        #expect(store.savedPostID == "post-1")
        #expect(await transport.lastPostUpdatePath == "/api/v1/discover/posts/post-1")
        #expect(await transport.updatedBuddyTitle == "Updated study plan")
        #expect(await transport.updatedBuddyCategory == nil)
        #expect(await transport.updatedBuddyTags == ["focus"])
        #expect(await transport.updatedBuddyVisibility == "VERIFIED_ONLY")
        #expect(await transport.updatedBuddyReplyPreference == "REQUEST_FIRST")
        #expect(await transport.writeKeys.count == 1)
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
        #expect(post.questions.first?.body == "Is the library card required?")
        #expect(post.questionTotal == 1)
        await post.setSaved(true, postID: "post-1", using: session)
        #expect(post.detail?.post.savedByViewer == true)
        #expect(post.detail?.post.interestedCount == 3)
        #expect(await post.submitQuestion(
            body: "Can exchange students join?",
            postID: "post-1",
            using: session
        ))
        #expect(post.questions.first?.body == "Can exchange students join?")
        #expect(post.questionTotal == 2)
        await post.deleteQuestionComment(
            commentID: "question-1",
            postID: "post-1",
            using: session
        )
        #expect(post.questions.map(\.id) == ["question-new"])
        #expect(post.questionTotal == 1)

        let activity = DiscoverActivityDetailStore()
        await activity.load(activityID: "activity-1", using: session)
        #expect(activity.detail?.activity.title == "Conversation meetup")
        #expect(activity.detail?.activity.viewerSignupStatus == nil)
        #expect(activity.detail?.calendarEntryId == nil)
        #expect(activity.messages.first?.body == "Is the table reserved?")
        #expect(activity.messageTotal == 1)
        #expect(await activity.submitMessage(
            body: "Can I arrive late?",
            activityID: "activity-1",
            using: session
        ))
        #expect(activity.messages.first?.body == "Can I arrive late?")
        #expect(activity.messageTotal == 2)
        await activity.deleteMessage(
            commentID: "activity-message-1",
            activityID: "activity-1",
            using: session
        )
        #expect(activity.messages.map(\.id) == ["activity-message-new"])
        #expect(activity.messageTotal == 1)
        await activity.setSignup(true, activityID: "activity-1", using: session)
        #expect(activity.detail?.activity.viewerSignupStatus == "GOING")
        #expect(activity.detail?.activity.goingCount == 5)
        await activity.addToCalendar(activityID: "activity-1", using: session)
        #expect(activity.detail?.calendarEntryId == "calendar-1")

        #expect(await transport.lastSavedPath == "/api/v1/discover/posts/post-1/saved")
        #expect(await transport.lastQuestionWritePath == "/api/v1/discover/posts/post-1/questions")
        #expect(await transport.lastQuestionBody == "Can exchange students join?")
        #expect(await transport.lastQuestionDeletePath == "/api/v1/discover/posts/post-1/questions/question-1")
        #expect(await transport.lastActivityMessageWritePath == "/api/v1/discover/activities/activity-1/messages")
        #expect(await transport.lastActivityMessageBody == "Can I arrive late?")
        #expect(await transport.lastActivityMessageDeletePath == "/api/v1/discover/activities/activity-1/messages/activity-message-1")
        #expect(await transport.lastSignupPath == "/api/v1/discover/activities/activity-1/signup")
        #expect(await transport.lastCalendarPath == "/api/v1/discover/activities/activity-1/calendar")
        #expect(await transport.writeKeys.count == 7)
    }

    @Test("Loads and manages the current user's published plans")
    @MainActor
    func myPostsManagement() async throws {
        let transport = DiscoverTestTransport()
        let session = makeSession(transport: transport)
        await session.login(identifier: "test_001", password: "Password123")

        let store = MyPostsStore()
        await store.load(using: session)
        #expect(store.payload?.posts.first?.title == "My library plan")
        #expect(store.payload?.activities.first?.title == "My meetup")

        #expect(await store.closePost(postID: "post-owned", using: session))
        #expect(store.payload?.posts.first?.status == "CLOSED")
        #expect(await store.setActivityStatus("CANCELED", activityID: "activity-owned", using: session))
        #expect(store.payload?.activities.first?.phase == "canceled")
        #expect(await transport.lastPostStatusPath == "/api/v1/discover/posts/post-owned/status")
        #expect(await transport.lastActivityStatusPath == "/api/v1/discover/activities/activity-owned/status")
        #expect(await transport.writeKeys.count == 2)
    }

    @Test("Falls back to the discover feed when the owned-posts endpoint is not deployed")
    @MainActor
    func myPostsDeploymentFallback() async throws {
        let transport = DiscoverTestTransport(myPostsUnavailable: true)
        let session = makeSession(transport: transport)
        await session.login(identifier: "test_001", password: "Password123")

        let store = MyPostsStore()
        await store.load(using: session)

        #expect(store.issue == nil)
        #expect(store.payload?.posts.map(\.id) == ["post-owned"])
        #expect(store.payload?.activities.map(\.id) == ["activity-owned"])
        #expect(await transport.myPostsRequestCount == 1)
        #expect(await transport.discoverRequestCount == 1)
    }

    @Test("Clears stale results for a failed new search but preserves a failed refresh")
    @MainActor
    func feedFailureUsesOnlyMatchingCachedResults() async throws {
        let transport = DiscoverTestTransport()
        let session = makeSession(transport: transport)
        await session.login(identifier: "test_001", password: "Password123")

        let store = DiscoverFeedStore()
        await store.load(using: session, query: "library")
        #expect(store.payload?.buddies.first?.title == "Library study buddy")

        await transport.failFeed(query: "library")
        await store.load(using: session, query: "library")
        #expect(store.payload?.buddies.first?.title == "Library study buddy")
        #expect(store.issue != nil)

        await transport.failFeed(query: "museum")
        await store.load(using: session, query: "museum")
        #expect(store.payload == nil)
        #expect(store.issue != nil)
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
    private let myPostsUnavailable: Bool
    private(set) var feedQuery: String?
    private(set) var discoverRequestCount = 0
    private(set) var myPostsRequestCount = 0
    private(set) var buddyTitle: String?
    private(set) var buddyCategory: String?
    private(set) var buddyCourseIds: [String] = []
    private(set) var buddyImageUrls: [String] = []
    private(set) var buddyVisibility: String?
    private(set) var buddyReplyPreference: String?
    private(set) var uploadedImageContentType: String?
    private(set) var activityCapacity: Int?
    private(set) var writeKeys: [String] = []
    private(set) var lastSavedPath: String?
    private(set) var lastSignupPath: String?
    private(set) var lastCalendarPath: String?
    private(set) var lastQuestionWritePath: String?
    private(set) var lastQuestionDeletePath: String?
    private(set) var lastQuestionBody: String?
    private(set) var lastActivityMessageWritePath: String?
    private(set) var lastActivityMessageDeletePath: String?
    private(set) var lastActivityMessageBody: String?
    private(set) var lastPostStatusPath: String?
    private(set) var lastActivityStatusPath: String?
    private(set) var lastPostUpdatePath: String?
    private(set) var updatedBuddyTitle: String?
    private(set) var updatedBuddyCategory: String?
    private(set) var updatedBuddyTags: [String] = []
    private(set) var updatedBuddyVisibility: String?
    private(set) var updatedBuddyReplyPreference: String?
    private var failingFeedQueries = Set<String>()

    init(myPostsUnavailable: Bool = false) {
        self.myPostsUnavailable = myPostsUnavailable
    }

    func failFeed(query: String) {
        failingFeedQueries.insert(query)
    }

    func data(for request: URLRequest) async throws -> (Data, URLResponse) {
        switch request.url?.path {
        case "/api/v1/auth/login":
            return response(
                request,
                200,
                #"{"data":{"user":{"id":"user-1","username":"test_001","nickname":"Test User","gender":"UNSPECIFIED","onboardingComplete":true,"isGuest":false,"verifiedStudent":true,"studentVerificationStatus":"VERIFIED","locale":"en"},"tokens":{"accessToken":"access-token","accessExpiresIn":900,"refreshToken":"refresh-token","refreshExpiresAt":"2026-08-16T00:00:00.000Z"}}}"#
            )
        case "/api/v1/discover":
            discoverRequestCount += 1
            let requestQuery = URLComponents(url: request.url!, resolvingAgainstBaseURL: false)?
                .queryItems?.first(where: { $0.name == "q" })?.value
            feedQuery = requestQuery
            if let requestQuery, failingFeedQueries.contains(requestQuery) {
                throw URLError(.timedOut)
            }
            if myPostsUnavailable {
                return response(
                    request,
                    200,
                    #"{"data":{"city":"Munich","buddies":[{"id":"post-peer","category":"OTHER","city":"Munich","title":"Peer plan","body":null,"status":"ACTIVE","tags":[],"visibility":"SCHOOL_ONLY","replyPreference":"REQUEST_FIRST","startsAt":null,"endsAt":null,"location":null,"capacity":null,"createdAt":"2026-07-17T09:00:00Z","expiresAt":"2027-07-20T10:00:00Z","isOwn":false,"savedByViewer":false,"interestedCount":0,"imageUrls":[],"linkedCourses":[],"author":{"id":"peer-1","displayName":"Mina","tagline":null,"avatarUrl":null,"major":null,"semester":null,"school":"TUM","verifiedStudent":true}},{"id":"post-owned","category":"OTHER","city":"Munich","title":"My library plan","body":"Study together","status":"ACTIVE","tags":[],"visibility":"SCHOOL_ONLY","replyPreference":"REQUEST_FIRST","startsAt":null,"endsAt":null,"location":"Main Library","capacity":null,"createdAt":"2026-07-17T10:00:00Z","expiresAt":"2027-07-20T10:00:00Z","isOwn":true,"savedByViewer":false,"interestedCount":2,"imageUrls":[],"linkedCourses":[],"author":{"id":"user-1","displayName":"Test User","tagline":null,"avatarUrl":null,"major":"Informatics","semester":3,"school":"TUM","verifiedStudent":true}}],"activities":[{"id":"activity-peer","city":"Munich","school":"TUM","title":"Peer meetup","description":null,"category":null,"startAt":"2027-07-18T14:00:00Z","endAt":"2027-07-18T15:00:00Z","location":"Campus","capacity":null,"status":"OPEN","phase":"bookable","goingCount":1,"viewerSignupStatus":null,"isOrganizer":false,"organizer":{"id":"peer-2","displayName":"Noah","avatarUrl":null}},{"id":"activity-owned","city":"Munich","school":"TUM","title":"My meetup","description":"Practice together","category":null,"startAt":"2027-07-18T16:00:00Z","endAt":"2027-07-18T18:00:00Z","location":"Cafe","capacity":10,"status":"OPEN","phase":"bookable","goingCount":4,"viewerSignupStatus":null,"isOrganizer":true,"organizer":{"id":"user-1","displayName":"Test User","avatarUrl":null}}]}}"#
                )
            }
            return response(
                request,
                200,
                #"{"data":{"city":"Munich","buddies":[{"id":"post-1","category":"OTHER","city":"Munich","title":"Library study buddy","body":"Study together","status":"ACTIVE","tags":[],"visibility":"SCHOOL_ONLY","replyPreference":"REQUEST_FIRST","startsAt":null,"endsAt":null,"location":null,"capacity":null,"createdAt":"2026-07-17T10:00:00Z","expiresAt":"2026-07-20T10:00:00Z","isOwn":false,"savedByViewer":false,"interestedCount":2,"imageUrls":[],"linkedCourses":[],"author":{"id":"peer-1","displayName":"Mina","tagline":"At the library","avatarUrl":null,"major":"Informatics","semester":3,"school":"TUM","verifiedStudent":true}}],"activities":[{"id":"activity-1","city":"Munich","school":"TUM","title":"Conversation meetup","description":"Practice together","category":null,"startAt":"2026-07-18T16:00:00Z","endAt":"2026-07-18T18:00:00Z","location":"Cafe","capacity":10,"status":"OPEN","phase":"bookable","goingCount":4,"viewerSignupStatus":null,"isOrganizer":false,"organizer":{"id":"peer-2","displayName":"Noah","avatarUrl":null}}]}}"#
            )
        case "/api/v1/me/posts":
            myPostsRequestCount += 1
            if myPostsUnavailable {
                return response(request, 404, "<html><body>Not Found</body></html>")
            }
            return response(
                request,
                200,
                #"{"data":{"posts":[{"id":"post-owned","category":"OTHER","city":"Munich","title":"My library plan","body":"Study together","status":"ACTIVE","tags":[],"visibility":"SCHOOL_ONLY","replyPreference":"REQUEST_FIRST","startsAt":null,"endsAt":null,"location":"Main Library","capacity":null,"createdAt":"2026-07-17T10:00:00Z","expiresAt":"2027-07-20T10:00:00Z","isOwn":true,"savedByViewer":false,"interestedCount":2,"imageUrls":[],"linkedCourses":[],"author":{"id":"user-1","displayName":"Test User","tagline":null,"avatarUrl":null,"major":"Informatics","semester":3,"school":"TUM","verifiedStudent":true}}],"activities":[{"id":"activity-owned","city":"Munich","school":"TUM","title":"My meetup","description":"Practice together","category":null,"startAt":"2027-07-18T16:00:00Z","endAt":"2027-07-18T18:00:00Z","location":"Cafe","capacity":10,"status":"OPEN","phase":"bookable","goingCount":4,"viewerSignupStatus":null,"isOrganizer":true,"organizer":{"id":"user-1","displayName":"Test User","avatarUrl":null}}]}}"#
            )
        case "/api/v1/discover/posts":
            let json = try bodyJSON(request)
            buddyTitle = json["title"] as? String
            buddyCategory = json["category"] as? String
            buddyCourseIds = (json["courseIds"] as? [String]) ?? []
            buddyImageUrls = (json["imageUrls"] as? [String]) ?? []
            buddyVisibility = json["visibility"] as? String
            buddyReplyPreference = json["replyPreference"] as? String
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
            if request.httpMethod == "PATCH" {
                let json = try bodyJSON(request)
                lastPostUpdatePath = request.url?.path
                updatedBuddyTitle = json["title"] as? String
                updatedBuddyCategory = json["category"] as? String
                updatedBuddyTags = (json["tags"] as? [String]) ?? []
                updatedBuddyVisibility = json["visibility"] as? String
                updatedBuddyReplyPreference = json["replyPreference"] as? String
                recordKey(request)
                return response(
                    request,
                    200,
                    #"{"data":{"post":{"id":"post-1","category":"OTHER","city":"Munich","title":"Updated study plan","body":"New details #focus","status":"ACTIVE","tags":["focus"],"visibility":"VERIFIED_ONLY","replyPreference":"REQUEST_FIRST","startsAt":null,"endsAt":null,"location":null,"capacity":null,"createdAt":"2026-07-17T10:00:00Z","expiresAt":"2030-03-17T17:46:40Z","isOwn":true,"savedByViewer":false,"interestedCount":2,"imageUrls":[],"linkedCourses":[],"author":{"id":"user-1","displayName":"Test User","tagline":null,"avatarUrl":null,"major":"Informatics","semester":3,"school":"TUM","verifiedStudent":true}}}}"#
                )
            }
            return response(
                request,
                200,
                #"{"data":{"post":{"id":"post-1","category":"OTHER","city":"Munich","title":"Library study buddy","body":"Study together","status":"ACTIVE","tags":[],"visibility":"SCHOOL_ONLY","replyPreference":"REQUEST_FIRST","startsAt":null,"endsAt":null,"location":null,"capacity":null,"createdAt":"2026-07-17T10:00:00Z","expiresAt":"2026-07-20T10:00:00Z","isOwn":false,"savedByViewer":false,"interestedCount":2,"imageUrls":[],"linkedCourses":[],"author":{"id":"peer-1","displayName":"Mina","tagline":null,"avatarUrl":null,"major":"Informatics","semester":3,"school":"TUM","verifiedStudent":true}},"viewerCanMessage":false}}"#
            )
        case "/api/v1/discover/posts/post-1/saved":
            lastSavedPath = request.url?.path
            recordKey(request)
            return response(
                request,
                request.httpMethod == "POST" ? 201 : 200,
                #"{"data":{"postId":"post-1","savedByViewer":true,"interestedCount":3}}"#
            )
        case "/api/v1/discover/posts/post-owned/status":
            lastPostStatusPath = request.url?.path
            recordKey(request)
            return response(
                request,
                200,
                #"{"data":{"post":{"id":"post-owned","category":"OTHER","city":"Munich","title":"My library plan","body":"Study together","status":"CLOSED","tags":[],"visibility":"SCHOOL_ONLY","replyPreference":"REQUEST_FIRST","startsAt":null,"endsAt":null,"location":"Main Library","capacity":null,"createdAt":"2026-07-17T10:00:00Z","expiresAt":"2027-07-20T10:00:00Z","isOwn":true,"savedByViewer":false,"interestedCount":2,"imageUrls":[],"linkedCourses":[],"author":{"id":"user-1","displayName":"Test User","tagline":null,"avatarUrl":null,"major":"Informatics","semester":3,"school":"TUM","verifiedStudent":true}}}}"#
            )
        case "/api/v1/discover/posts/post-1/questions":
            if request.httpMethod == "POST" {
                let json = try bodyJSON(request)
                lastQuestionWritePath = request.url?.path
                lastQuestionBody = json["body"] as? String
                recordKey(request)
                return response(
                    request,
                    201,
                    #"{"data":{"commentId":"question-new","questionId":"question-new","thread":{"id":"question-new","body":"Can exchange students join?","createdAt":"2026-07-17T12:00:00Z","isOwn":true,"canDelete":true,"canReply":false,"author":{"id":"user-1","displayName":"Test User","avatarUrl":null,"school":"TUM","verifiedStudent":true},"reply":null}}}"#
                )
            }
            return response(
                request,
                200,
                #"{"data":{"total":1,"questions":[{"id":"question-1","body":"Is the library card required?","createdAt":"2026-07-17T11:00:00Z","isOwn":true,"canDelete":true,"canReply":false,"author":{"id":"user-1","displayName":"Test User","avatarUrl":null,"school":"TUM","verifiedStudent":true},"reply":{"id":"answer-1","body":"No, meet at the entrance.","createdAt":"2026-07-17T11:10:00Z","isOwn":false,"canDelete":false,"author":{"id":"peer-1","displayName":"Mina","avatarUrl":null,"school":"TUM","verifiedStudent":true}}}]}}"#
            )
        case "/api/v1/discover/posts/post-1/questions/question-1":
            lastQuestionDeletePath = request.url?.path
            recordKey(request)
            return response(
                request,
                200,
                #"{"data":{"commentId":"question-1","threadId":"question-1","deletedReply":false,"deleted":true}}"#
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
        case "/api/v1/discover/activities/activity-1/messages":
            if request.httpMethod == "POST" {
                let json = try bodyJSON(request)
                lastActivityMessageWritePath = request.url?.path
                lastActivityMessageBody = json["body"] as? String
                recordKey(request)
                return response(
                    request,
                    201,
                    #"{"data":{"commentId":"activity-message-new","messageId":"activity-message-new","thread":{"id":"activity-message-new","body":"Can I arrive late?","createdAt":"2026-07-17T12:00:00Z","isOwn":true,"canDelete":true,"canReply":false,"author":{"id":"user-1","displayName":"Test User","avatarUrl":null,"school":"TUM","verifiedStudent":true},"reply":null}}}"#
                )
            }
            return response(
                request,
                200,
                #"{"data":{"total":1,"messages":[{"id":"activity-message-1","body":"Is the table reserved?","createdAt":"2026-07-17T11:00:00Z","isOwn":true,"canDelete":true,"canReply":false,"author":{"id":"user-1","displayName":"Test User","avatarUrl":null,"school":"TUM","verifiedStudent":true},"reply":{"id":"activity-reply-1","body":"Yes, it is reserved.","createdAt":"2026-07-17T11:10:00Z","isOwn":false,"canDelete":false,"author":{"id":"peer-2","displayName":"Noah","avatarUrl":null,"school":"TUM","verifiedStudent":true}}}]}}"#
            )
        case "/api/v1/discover/activities/activity-1/messages/activity-message-1":
            lastActivityMessageDeletePath = request.url?.path
            recordKey(request)
            return response(
                request,
                200,
                #"{"data":{"commentId":"activity-message-1","threadId":"activity-message-1","deletedReply":false,"deleted":true}}"#
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
        case "/api/v1/discover/activities/activity-owned/status":
            lastActivityStatusPath = request.url?.path
            recordKey(request)
            return response(
                request,
                200,
                #"{"data":{"activity":{"id":"activity-owned","city":"Munich","school":"TUM","title":"My meetup","description":"Practice together","category":null,"startAt":"2027-07-18T16:00:00Z","endAt":"2027-07-18T18:00:00Z","location":"Cafe","capacity":10,"status":"CANCELED","phase":"canceled","goingCount":4,"viewerSignupStatus":null,"isOrganizer":true,"organizer":{"id":"user-1","displayName":"Test User","avatarUrl":null}}}}"#
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
