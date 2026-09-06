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

    @Test("Decodes the legacy Discover payload before comment and organizer verification fields")
    func legacyDiscoverPayloadCompatibility() throws {
        let data = try #require(
            """
            {
              "city": "Munich",
              "buddies": [{
                "id": "post-legacy",
                "category": "GENERAL",
                "city": "Munich",
                "title": "Legacy plan",
                "status": "ACTIVE",
                "tags": [],
                "visibility": "CITY_INTERNATIONALS",
                "replyPreference": "DIRECT_MESSAGE",
                "createdAt": "2026-08-01T10:00:00Z",
                "expiresAt": "2026-08-20T10:00:00Z",
                "isOwn": false,
                "savedByViewer": false,
                "interestedCount": 2,
                "imageUrls": [],
                "linkedCourses": [],
                "author": {
                  "id": "author-legacy",
                  "displayName": "Legacy student",
                  "verifiedStudent": true
                }
              }],
              "activities": [{
                "id": "activity-legacy",
                "city": "Munich",
                "school": "TUM",
                "title": "Legacy activity",
                "startAt": "2026-08-15T18:00:00Z",
                "endAt": "2026-08-15T20:00:00Z",
                "location": "Munich",
                "status": "OPEN",
                "phase": "bookable",
                "goingCount": 3,
                "isOrganizer": false,
                "organizer": {
                  "id": "organizer-legacy",
                  "displayName": "Legacy organizer"
                }
              }]
            }
            """.data(using: .utf8)
        )

        let feed = try JSONDecoder().decode(NativeDiscoverFeed.self, from: data)

        #expect(feed.buddies.first?.commentCount == 0)
        #expect(feed.activities.first?.commentCount == 0)
        #expect(feed.activities.first?.organizer.verifiedStudent == false)
    }

    @Test("Orders upcoming plans soonest first, then fresh untimed posts, then past plans")
    func discoverFeedOrdering() {
        let now = Date(timeIntervalSince1970: 1_786_000_000)
        let buddy = NativeDiscoverFeed.uiTestingFixture.buddies[0]
        let activity = NativeDiscoverFeed.uiTestingFixture.activities[0]

        func editedBuddy(start: Date?) -> NativeDiscoverBuddyPost {
            buddy.withEdits(
                title: buddy.title,
                body: buddy.body,
                tags: buddy.tags,
                visibility: buddy.visibility,
                startsAt: start,
                endsAt: start?.addingTimeInterval(3_600),
                location: buddy.location,
                capacity: buddy.capacity,
                expiresAt: buddy.expiryDate ?? .distantFuture,
                imageUrls: buddy.imageUrls
            )
        }

        let untimed = editedBuddy(start: nil)
        let past = editedBuddy(start: now.addingTimeInterval(-7_200))

        let ordered = DiscoverPlanFeedItem.ordered(
            [.activity(activity), .post(untimed), .post(past), .post(buddy)],
            now: now
        )

        #expect(ordered.count == 4)
        if case .post(let first) = ordered[0] {
            #expect(first.startDate == buddy.startDate)
        } else {
            Issue.record("Expected the soonest upcoming buddy plan first")
        }
        if case .activity = ordered[1] {
            // The later upcoming activity follows the earlier buddy plan.
        } else {
            Issue.record("Expected the later upcoming activity second")
        }
        if case .post(let third) = ordered[2] {
            #expect(third.startDate == nil)
        } else {
            Issue.record("Expected the fresh untimed post before past plans")
        }
        if case .post(let fourth) = ordered[3] {
            #expect(fourth.startDate == past.startDate)
        } else {
            Issue.record("Expected past plans last")
        }
    }

    @Test("Keeps ongoing and future actions while removing finished actions")
    func discoverFeedVisibility() {
        let now = Date(timeIntervalSince1970: 1_786_000_000)
        let buddy = NativeDiscoverFeed.uiTestingFixture.buddies[0]

        func editedBuddy(start: Date?, end: Date?) -> NativeDiscoverBuddyPost {
            buddy.withEdits(
                title: buddy.title,
                body: buddy.body,
                tags: buddy.tags,
                visibility: buddy.visibility,
                startsAt: start,
                endsAt: end,
                location: buddy.location,
                capacity: buddy.capacity,
                expiresAt: buddy.expiryDate ?? .distantFuture,
                imageUrls: buddy.imageUrls
            )
        }

        let ongoing = editedBuddy(
            start: now.addingTimeInterval(-1_800),
            end: now.addingTimeInterval(1_800)
        )
        let future = editedBuddy(
            start: now.addingTimeInterval(3_600),
            end: now.addingTimeInterval(7_200)
        )
        let finished = editedBuddy(
            start: now.addingTimeInterval(-7_200),
            end: now.addingTimeInterval(-3_600)
        )
        let untimed = editedBuddy(start: nil, end: nil)

        let visible = DiscoverPlanFeedItem.visible(
            [.post(future), .post(finished), .post(untimed), .post(ongoing)],
            now: now
        )

        #expect(visible.count == 3)
        if case .post(let first) = visible[0] {
            #expect(first.startDate == ongoing.startDate)
        } else {
            Issue.record("Expected the ongoing action first")
        }
        #expect(!visible.contains { item in
            if case .post(let post) = item { return post.startDate == finished.startDate }
            return false
        })
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
        let suiteName = "DiscoverStoreTests.multi-city-\(UUID().uuidString)"
        let defaults = try #require(UserDefaults(suiteName: suiteName))
        defer { defaults.removePersistentDomain(forName: suiteName) }
        let cityPreference = DiscoverCityPreferenceStore(defaults: defaults)
        let transport = DiscoverTestTransport(
            cityConfiguration: DiscoverTestCityConfiguration(
                defaultCity: "Berlin",
                servedCities: ["Berlin", "Munich"]
            )
        )
        let session = makeSession(transport: transport)
        await session.login(identifier: "test_001", password: "Password123")

        let feed = DiscoverFeedStore(cityPreference: cityPreference)
        await feed.load(using: session, query: "library")
        #expect(feed.payload?.city == "Berlin")
        #expect(feed.payload?.buddies.first?.title == "Library study buddy")
        #expect(feed.payload?.activities.first?.title == "Conversation meetup")
        #expect(await transport.feedCity == "Berlin")
        #expect(await transport.feedQuery == "library")

        let create = DiscoverCreateStore(cityPreference: cityPreference)
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
        #expect(await transport.buddyCity == "Berlin")
        #expect(await transport.uploadedImageContentType == "multipart/form-data")
        #expect(await transport.activityCapacity == 8)
        #expect(await transport.activityCity == "Berlin")
        #expect(await transport.writeKeys.count == 3)
        #expect(await Set(transport.writeKeys).count == 3)
    }

    @Test("Reloads the feed for a selected city without retaining stale results")
    @MainActor
    func citySelectionReloadsOnlyMatchingFeedResults() async throws {
        let suiteName = "DiscoverStoreTests.city-selection-\(UUID().uuidString)"
        let defaults = try #require(UserDefaults(suiteName: suiteName))
        defer { defaults.removePersistentDomain(forName: suiteName) }

        let cityPreference = DiscoverCityPreferenceStore(defaults: defaults)
        let transport = DiscoverTestTransport(
            cityConfiguration: DiscoverTestCityConfiguration(
                defaultCity: "Munich",
                servedCities: ["Munich", "Berlin"]
            )
        )
        let session = makeSession(transport: transport)
        await session.login(identifier: "test_001", password: "Password123")

        let feed = DiscoverFeedStore(cityPreference: cityPreference)
        await feed.load(using: session, query: "library")
        #expect(feed.payload?.city == "Munich")

        cityPreference.select("Berlin")
        await feed.load(using: session, query: "library")

        #expect(defaults.string(forKey: "sideseat.discover.selectedCity") == "Berlin")
        #expect(await transport.feedCity == "Berlin")
        #expect(feed.payload?.city == "Berlin")
        #expect(feed.payload?.buddies.allSatisfy { $0.city == "Berlin" } == true)
        #expect(feed.payload?.activities.allSatisfy { $0.city == "Berlin" } == true)

        await transport.failFeed(query: "library")
        cityPreference.select("Munich")
        await feed.load(using: session, query: "library")

        #expect(await transport.feedCity == "Munich")
        #expect(feed.payload == nil)
        #expect(feed.issue != nil)
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
        #expect(post.detail?.post.interestedCount == 2)
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

    @Test("Uses the server coordination mode and fails closed for unknown contracts")
    func coordinationPrimaryAction() {
        let post = NativeDiscoverFeed.uiTestingFixture.buddies[0]
        let direct = NativeDiscoverBuddyPostDetail(
            post: post.withCoordination(
                NativeDiscoverActionCoordination(
                    policy: "DIRECT_CONVERSATION_V1",
                    schemaVersion: 1,
                    interactionMode: "DIRECT_CONVERSATION",
                    readOnlyReason: nil
                )
            ),
            viewerCanMessage: true,
            activeInterest: nil
        )
        let express = NativeDiscoverBuddyPostDetail(
            post: post,
            viewerCanMessage: false,
            activeInterest: nil
        )
        let futureContract = NativeDiscoverBuddyPostDetail(
            post: post.withCoordination(
                NativeDiscoverActionCoordination(
                    policy: "CREATOR_GATED_V2",
                    schemaVersion: 2,
                    interactionMode: "EXPRESS_INTEREST",
                    readOnlyReason: nil
                )
            ),
            viewerCanMessage: true,
            activeInterest: nil
        )
        let missingContract = NativeDiscoverBuddyPostDetail(
            post: post.withCoordination(nil),
            viewerCanMessage: true,
            activeInterest: nil
        )

        #expect(direct.primaryAction == .contactAuthor)
        #expect(express.primaryAction == .expressInterest)
        #expect(futureContract.primaryAction == .readOnly)
        #expect(missingContract.primaryAction == .readOnly)
    }

    @Test("Expresses, withdraws, reactivates, and restores creator-gated interest without saving")
    @MainActor
    func creatorGatedInterestLifecycle() async throws {
        let transport = DiscoverTestTransport()
        let session = makeSession(transport: transport)
        await session.login(identifier: "test_001", password: "Password123")

        let store = DiscoverPostDetailStore()
        await store.load(postID: "post-gated", using: session)
        #expect(store.detail?.primaryAction == .expressInterest)
        #expect(store.detail?.creatorGatedInterest == nil)
        #expect(store.detail?.post.savedByViewer == false)

        let createdResult = await store.expressInterest(postID: "post-gated", using: session)
        let created = try #require(createdResult)
        #expect(created.isWaiting)
        #expect(store.detail?.primaryAction == .waiting)
        #expect(store.detail?.post.savedByViewer == false)
        #expect(store.detail?.post.interestedByViewer == true)
        #expect(await transport.lastInterestPath == "/api/v1/action-coordination/v2/actions/post-gated/interest")
        #expect(await transport.lastInterestSurface == "ACTION_DETAIL")

        let withdrawnResult = await store.withdrawInterest(postID: "post-gated", using: session)
        let withdrawn = try #require(withdrawnResult)
        #expect(withdrawn.isWithdrawn)
        #expect(withdrawn.coordinationState == "UNAVAILABLE")
        #expect(store.detail?.primaryAction == .reactivateInterest)
        #expect(store.detail?.post.savedByViewer == false)
        #expect(store.detail?.post.interestedByViewer == false)
        #expect(await transport.lastInterestPath == "/api/v1/action-coordination/v2/interests/interest-gated")

        let reactivatedResult = await store.expressInterest(postID: "post-gated", using: session)
        let reactivated = try #require(reactivatedResult)
        #expect(reactivated.isWaiting)
        #expect(reactivated.activationId == "activation-gated-2")
        #expect(await transport.lastInterestPath == "/api/v1/action-coordination/v2/interests/interest-gated/reactivate")
        #expect(await transport.lastInterestSurface == "ACTION_DETAIL")

        let restoredStore = DiscoverPostDetailStore()
        await restoredStore.load(postID: "post-gated", using: session)
        #expect(restoredStore.detail?.creatorGatedInterest?.isWaiting == true)
        #expect(restoredStore.detail?.primaryAction == .waiting)
        #expect(await transport.lastInterestListPath == "/api/v1/action-coordination/v2/me/interests")
    }

    @Test("Restores an older creator-gated interest from the second page and keeps its safe-drain controls")
    @MainActor
    func restoresCreatorGatedInterestFromSecondPage() async throws {
        let transport = DiscoverTestTransport(creatorGatedListFixture: .targetOnSecondPage)
        let session = makeSession(transport: transport)
        await session.login(identifier: "test_001", password: "Password123")

        let store = DiscoverPostDetailStore()
        await store.load(postID: "post-gated", using: session)

        #expect(store.detail?.creatorGatedInterest?.id == "interest-gated")
        #expect(store.detail?.primaryAction == .waiting)
        #expect(await transport.interestListRequestCount == 2)
        #expect(await transport.interestListCursors == [nil, "page-2"])
        #expect(await transport.lastInterestListState == "ALL")
        #expect(await transport.lastInterestListLimit == "50")

        let withdrawn = await store.withdrawInterest(postID: "post-gated", using: session)
        #expect(withdrawn?.isWithdrawn == true)
        #expect(await transport.lastInterestPath == "/api/v1/action-coordination/v2/interests/interest-gated")

        let reactivated = await store.expressInterest(postID: "post-gated", using: session)
        #expect(reactivated?.isWaiting == true)
        #expect(await transport.lastInterestPath == "/api/v1/action-coordination/v2/interests/interest-gated/reactivate")
    }

    @Test("Stops creator-gated recovery when the server repeats a cursor")
    @MainActor
    func stopsCreatorGatedInterestCursorLoop() async {
        let transport = DiscoverTestTransport(creatorGatedListFixture: .repeatedCursor)
        let session = makeSession(transport: transport)
        await session.login(identifier: "test_001", password: "Password123")

        let store = DiscoverPostDetailStore()
        await store.load(postID: "post-gated", using: session)

        #expect(await transport.interestListRequestCount == 2)
        #expect(await transport.interestListCursors == [nil, "loop"])
        #expect(store.detail != nil)
        #expect(store.detail?.creatorGatedInterest == nil)
        #expect(store.issue == nil)
    }

    @Test("Bounds creator-gated recovery when every page returns a fresh cursor")
    @MainActor
    func boundsCreatorGatedInterestPagination() async {
        let transport = DiscoverTestTransport(creatorGatedListFixture: .unbounded)
        let session = makeSession(transport: transport)
        await session.login(identifier: "test_001", password: "Password123")

        let store = DiscoverPostDetailStore()
        await store.load(postID: "post-gated", using: session)

        #expect(
            await transport.interestListRequestCount
                == DiscoverPostDetailStore.maximumCreatorGatedInterestRestorePages
        )
        #expect(store.detail != nil)
        #expect(store.issue == nil)
    }

    @Test("Refreshes authoritative withdrawn state after a stale create conflict without auto-reactivating")
    @MainActor
    func recoversInactiveInterestCreateConflict() async {
        let transport = DiscoverTestTransport(createInterestConflict: true)
        let session = makeSession(transport: transport)
        await session.login(identifier: "test_001", password: "Password123")

        let store = DiscoverPostDetailStore()
        await store.load(postID: "post-gated", using: session)
        #expect(store.detail?.creatorGatedInterest == nil)

        let conflictedCreate = await store.expressInterest(postID: "post-gated", using: session)
        #expect(conflictedCreate == nil)
        #expect(store.issue == nil)
        #expect(store.detail?.creatorGatedInterest?.isWithdrawn == true)
        #expect(store.detail?.primaryAction == .reactivateInterest)
        #expect(await transport.createInterestRequestCount == 1)
        #expect(await transport.interestListRequestCount == 2)
        #expect(await transport.lastInterestPath == "/api/v1/action-coordination/v2/actions/post-gated/interest")

        let explicitReactivation = await store.expressInterest(postID: "post-gated", using: session)
        #expect(explicitReactivation?.isWaiting == true)
        #expect(await transport.lastInterestPath == "/api/v1/action-coordination/v2/interests/interest-gated/reactivate")
    }

    @Test("Keeps creator-gated safe-drain available while read-only and never reopens withdrawn interest")
    @MainActor
    func creatorGatedReadOnlySafeDrain() async {
        let waitingTransport = DiscoverTestTransport(
            gatedActionID: "post-gated-readonly",
            initialGatedInterestState: "ACTIVE",
            initialGatedCoordinationState: "INITIATING"
        )
        let waitingSession = makeSession(transport: waitingTransport)
        await waitingSession.login(identifier: "test_001", password: "Password123")
        let waitingStore = DiscoverPostDetailStore()
        await waitingStore.load(postID: "post-gated-readonly", using: waitingSession)

        #expect(waitingStore.detail?.post.interactionMode == .readOnly)
        #expect(waitingStore.detail?.primaryAction == .waiting)
        #expect(await waitingStore.withdrawInterest(
            postID: "post-gated-readonly",
            using: waitingSession
        ) != nil)

        let withdrawnTransport = DiscoverTestTransport(
            gatedActionID: "post-gated-readonly",
            initialGatedInterestState: "WITHDRAWN",
            initialGatedCoordinationState: "UNAVAILABLE"
        )
        let withdrawnSession = makeSession(transport: withdrawnTransport)
        await withdrawnSession.login(identifier: "test_001", password: "Password123")
        let withdrawnStore = DiscoverPostDetailStore()
        await withdrawnStore.load(postID: "post-gated-readonly", using: withdrawnSession)

        #expect(withdrawnStore.detail?.primaryAction == .readOnly)
        #expect(await withdrawnStore.expressInterest(
            postID: "post-gated-readonly",
            using: withdrawnSession
        ) == nil)
        #expect(await withdrawnTransport.lastInterestPath == nil)

        let emptyTransport = DiscoverTestTransport(gatedActionID: "post-gated-readonly")
        let emptySession = makeSession(transport: emptyTransport)
        await emptySession.login(identifier: "test_001", password: "Password123")
        let emptyStore = DiscoverPostDetailStore()
        await emptyStore.load(postID: "post-gated-readonly", using: emptySession)

        #expect(emptyStore.detail?.creatorGatedInterest == nil)
        #expect(emptyStore.detail?.primaryAction == .readOnly)
    }

    @Test("Keeps an existing waiting response withdrawable after the Action closes")
    @MainActor
    func closedCreatorGatedActionSafeDrain() async {
        let transport = DiscoverTestTransport(
            gatedActionID: "post-gated-closed",
            initialGatedInterestState: "ACTIVE",
            initialGatedCoordinationState: "WAITING"
        )
        let session = makeSession(transport: transport)
        await session.login(identifier: "test_001", password: "Password123")
        let store = DiscoverPostDetailStore()
        await store.load(postID: "post-gated-closed", using: session)

        #expect(store.detail?.post.status == "CLOSED")
        #expect(store.detail?.primaryAction == .waiting)
        #expect(await store.withdrawInterest(postID: "post-gated-closed", using: session) != nil)
    }

    @Test("Keeps My responses reachable across pages and withdraws from its snapshot")
    @MainActor
    func myResponsesPaginationAndSafeDrain() async throws {
        let transport = DiscoverTestTransport(creatorGatedListFixture: .targetOnSecondPage)
        let session = makeSession(transport: transport)
        await session.login(identifier: "test_001", password: "Password123")
        let store = DiscoverMyResponsesStore()

        await store.load(using: session)
        #expect(store.hasLoaded)
        #expect(store.interests.map(\.id) == ["interest-other"])
        #expect(store.canLoadMore)

        await store.loadNextPage(using: session)
        #expect(store.interests.map(\.id) == ["interest-other", "interest-gated"])
        #expect(!store.canLoadMore)
        #expect(await transport.interestListCursors == [nil, "page-2"])
        #expect(await transport.lastInterestListState == "ALL")
        #expect(await transport.lastInterestListLimit == "30")

        let withdrawalResult = await store.withdraw(
            interestID: "interest-gated",
            using: session
        )
        let withdrawn = try #require(withdrawalResult)
        #expect(withdrawn.isWithdrawn)
        #expect(store.interest(id: "interest-gated")?.isWithdrawn == true)
        #expect(await transport.lastInterestPath == "/api/v1/action-coordination/v2/interests/interest-gated")
    }

    @Test("Stops My responses pagination when the server repeats a cursor")
    @MainActor
    func myResponsesStopsCursorLoop() async {
        let transport = DiscoverTestTransport(creatorGatedListFixture: .repeatedCursor)
        let session = makeSession(transport: transport)
        await session.login(identifier: "test_001", password: "Password123")
        let store = DiscoverMyResponsesStore()

        await store.load(using: session)
        #expect(store.canLoadMore)
        await store.loadNextPage(using: session)
        #expect(!store.canLoadMore)
        await store.loadNextPage(using: session)

        #expect(await transport.interestListRequestCount == 2)
        #expect(await transport.interestListCursors == [nil, "loop"])
        #expect(store.issue == nil)
    }

    @Test("Keeps historical My responses visible without reopening them")
    @MainActor
    func myResponsesHistoricalState() async {
        let transport = DiscoverTestTransport(
            initialGatedInterestState: "WITHDRAWN",
            initialGatedCoordinationState: "UNAVAILABLE"
        )
        let session = makeSession(transport: transport)
        await session.login(identifier: "test_001", password: "Password123")
        let store = DiscoverMyResponsesStore()

        await store.load(using: session)
        #expect(store.interests.count == 1)
        #expect(store.interests.first?.isWithdrawn == true)
        #expect(await store.withdraw(interestID: "interest-gated", using: session) == nil)
        #expect(await transport.lastInterestPath == nil)
    }

    @Test("Decodes tombstones and routes generated action-context and plan focuses exactly")
    @MainActor
    func myResponsesTypedContextAndFocus() async throws {
        let transport = DiscoverTestTransport(creatorGatedListFixture: .typedContextAndFocus)
        let session = makeSession(transport: transport)
        await session.login(identifier: "test_001", password: "Password123")
        let store = DiscoverMyResponsesStore()

        await store.load(using: session)

        let tombstone = try #require(store.interest(id: "interest-tombstone"))
        #expect(tombstone.context.isTombstone)
        #expect(tombstone.context.title == nil)
        #expect(tombstone.planDraft.isTombstone)
        #expect(tombstone.planDraft.title == nil)
        #expect(tombstone.terminalReason == nil)
        #expect(tombstone.chatTarget == nil)

        let actionContext = try #require(store.interest(id: "interest-context"))
        let actionContextTarget = try #require(actionContext.chatTarget)
        #expect(actionContextTarget.connectionID == "connection-context")
        #expect(actionContextTarget.focus == .actionContext(id: "context-1"))

        let plan = try #require(store.interest(id: "interest-plan"))
        let planTarget = try #require(plan.chatTarget)
        #expect(planTarget.connectionID == "connection-plan")
        #expect(
            planTarget.focus == .plan(
                commitmentID: "commitment-plan",
                revisionID: "revision-plan"
            )
        )
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

    @Test("Loads and removes saved buddy posts")
    @MainActor
    func savedPostsManagement() async throws {
        let transport = DiscoverTestTransport()
        let session = makeSession(transport: transport)
        await session.login(identifier: "test_001", password: "Password123")

        let store = SavedPostsStore()
        await store.load(using: session)
        #expect(store.posts?.map(\.id) == ["post-1"])
        #expect(store.posts?.first?.savedByViewer == true)

        #expect(await store.remove(postID: "post-1", using: session))
        #expect(store.posts?.isEmpty == true)
        #expect(await transport.savedPostsRequestCount == 1)
        #expect(await transport.lastSavedPath == "/api/v1/discover/posts/post-1/saved")
        #expect(await transport.writeKeys.count == 1)
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

    @Test("Action responses merge a split Action group and mark each newly rendered page seen")
    @MainActor
    func actionResponsesPaginationAndExactSeenReceipts() async {
        let transport = ActionResponsesTestTransport(mode: .twoPages)
        let session = makeSession(transport: transport)
        await session.login(identifier: "test_001", password: "Password123")
        let store = ActionResponsesStore(actionID: "action-1")

        await store.load(using: session)
        #expect(store.groups.first?.responses.map(\.interestID) == ["interest-1"])
        await store.markSeen(groupID: "action-1", using: session)
        await store.loadNextPage(using: session)
        #expect(store.groups.first?.responses.map(\.interestID) == ["interest-1", "interest-2"])
        await store.markSeen(groupID: "action-1", using: session)

        #expect(await transport.requestedCursors == [nil, "page-2"])
        let seenInterestIDs = await transport.seenInterestIDs
        #expect(seenInterestIDs.count == 2, "Unexpected seen receipts: \(seenInterestIDs)")
        #expect(seenInterestIDs.first == ["interest-1"])
        #expect(seenInterestIDs.last == ["interest-2"])
        #expect(await transport.seenSnapshotTokens == ["snapshot-1", "snapshot-1"])
    }

    @Test("Action responses stop when a cursor repeats")
    @MainActor
    func actionResponsesRepeatedCursorStops() async {
        let transport = ActionResponsesTestTransport(mode: .repeatedCursor)
        let session = makeSession(transport: transport)
        await session.login(identifier: "test_001", password: "Password123")
        let store = ActionResponsesStore()

        await store.load(using: session)
        await store.loadNextPage(using: session)
        await store.loadNextPage(using: session)

        #expect(await transport.requestedCursors == [nil, "loop"])
        #expect(!store.canLoadMore)
    }

    @Test("Coordination shell reserves, heartbeats, and safe-drains without creating a conversation")
    @MainActor
    func coordinationShellLifecycle() async {
        let transport = CoordinationShellTestTransport()
        let session = makeSession(transport: transport)
        await session.login(identifier: "test_001", password: "Password123")
        let store = CoordinationShellStore()

        let reservation = await store.reserve(interestID: "interest-1", using: session)
        #expect(reservation?.interestID == "interest-1")
        #expect(reservation?.planTitle == "Library study")
        let resumed = await store.reserve(interestID: "interest-1", using: session)
        #expect(resumed?.id == reservation?.id)
        #expect(await transport.reserveCount == 2)
        await store.heartbeatIfNeeded(using: session, now: Date())
        #expect(await transport.heartbeatCount == 1)
        #expect(await store.release(using: session))
        #expect(store.reservation == nil)
        #expect(await transport.releaseCount == 1)
        #expect(await transport.connectionRequestCount == 0)
        #expect(await transport.idempotencyKeys.allSatisfy { !$0.isEmpty })
    }

    @Test("MESSAGE activation reuses a retry key, rotates it for changed content, and ignores a double tap")
    @MainActor
    func coordinationMessageActivationIdempotency() async {
        let transport = CoordinationShellTestTransport(activationFailures: 2)
        let session = makeSession(transport: transport)
        await session.login(identifier: "test_001", password: "Password123")
        let store = CoordinationShellStore()
        _ = await store.reserve(interestID: "interest-1", using: session)

        #expect(await store.activateMessage(" Hello ", using: session) == nil)
        #expect(await store.activateMessage("Hello", using: session) == nil)
        let activated = await store.activateMessage("Hello there", using: session)
        #expect(activated?.connectionID == "connection-1")
        #expect(activated?.contextID == "context-1")
        let keys = await transport.activationKeys
        #expect(keys.count == 3)
        #expect(keys[0] == keys[1])
        #expect(keys[1] != keys[2])

        let replayTransport = CoordinationShellTestTransport()
        let replaySession = makeSession(transport: replayTransport)
        await replaySession.login(identifier: "test_001", password: "Password123")
        let replayStore = CoordinationShellStore()
        _ = await replayStore.reserve(interestID: "interest-1", using: replaySession)
        async let first = replayStore.activateMessage("One message", using: replaySession)
        async let second = replayStore.activateMessage("One message", using: replaySession)
        _ = await (first, second)
        #expect(await replayTransport.activationCount == 1)
        #expect(!(await replayStore.release(using: replaySession)))
        #expect(await replayTransport.releaseCount == 0)
    }

    @Test("Retries a failed experiment assignment and clears its issue")
    @MainActor
    func experimentAssignmentFailureCanBeRetried() async {
        let transport = AssignmentTestTransport(responses: [.failure, .treatment])
        let session = makeSession(transport: transport)
        await session.login(identifier: "test_001", password: "Password123")
        let store = ActionToPlanV2Store()

        await store.loadAssignment(using: session)

        #expect(store.hasLoadedAssignment)
        #expect(!store.isLoadingAssignment)
        #expect(store.assignment == nil)
        #expect(store.assignmentIssue != nil)

        await store.loadAssignment(using: session, force: true)

        #expect(store.hasLoadedAssignment)
        #expect(!store.isLoadingAssignment)
        #expect(store.assignment?.key == "action_to_plan_v2")
        #expect(store.isTreatmentEnabled)
        #expect(store.assignmentIssue == nil)
        #expect(await transport.experimentRequestCount == 2)
    }

    @Test("Cancelled experiment assignments stay retryable without showing a failure")
    @MainActor
    func cancelledExperimentAssignmentsRetryAutomatically() async {
        let cancellationResponses: [AssignmentTestTransport.ExperimentResponse] = [
            .taskCancellation,
            .urlCancellation,
        ]

        for cancellationResponse in cancellationResponses {
            let transport = AssignmentTestTransport(
                responses: [cancellationResponse, .treatment]
            )
            let session = makeSession(transport: transport)
            await session.login(identifier: "test_001", password: "Password123")
            let store = ActionToPlanV2Store()

            await store.loadAssignment(using: session)

            #expect(!store.hasLoadedAssignment)
            #expect(!store.isLoadingAssignment)
            #expect(store.assignment == nil)
            #expect(store.assignmentIssue == nil)
            #expect(await transport.experimentRequestCount == 1)

            await store.loadAssignment(using: session)

            #expect(store.hasLoadedAssignment)
            #expect(!store.isLoadingAssignment)
            #expect(store.assignment?.key == "action_to_plan_v2")
            #expect(store.isMutualOpportunityEnabled)
            #expect(store.assignmentIssue == nil)
            #expect(await transport.experimentRequestCount == 2)
        }
    }

    @Test("Reset clears cached, failed, and in-flight experiment assignment state")
    @MainActor
    func resetExperimentAssignmentState() async {
        let transport = AssignmentTestTransport(
            responses: [.failure, .treatment, .suspendedTreatment]
        )
        let session = makeSession(transport: transport)
        await session.login(identifier: "test_001", password: "Password123")
        let store = ActionToPlanV2Store()

        await store.loadAssignment(using: session)
        #expect(store.hasLoadedAssignment)
        #expect(store.assignmentIssue != nil)

        store.resetAssignment()
        assertAssignmentStateIsReset(store)

        await store.loadAssignment(using: session)
        #expect(store.hasLoadedAssignment)
        #expect(store.assignment?.key == "action_to_plan_v2")

        store.resetAssignment()
        assertAssignmentStateIsReset(store)

        let inFlightLoad = Task { await store.loadAssignment(using: session) }
        await transport.waitUntilExperimentRequestIsSuspended()
        #expect(store.isLoadingAssignment)

        store.resetAssignment()
        assertAssignmentStateIsReset(store)

        await transport.completeSuspendedExperimentRequest()
        await inFlightLoad.value
        assertAssignmentStateIsReset(store)
    }

    @Test("Caches an empty successful experiment assignment")
    @MainActor
    func emptyExperimentAssignmentIsCached() async {
        let transport = AssignmentTestTransport(responses: [.empty])
        let session = makeSession(transport: transport)
        await session.login(identifier: "test_001", password: "Password123")
        let store = ActionToPlanV2Store()

        await store.loadAssignment(using: session)
        await store.loadAssignment(using: session)

        #expect(store.hasLoadedAssignment)
        #expect(!store.isLoadingAssignment)
        #expect(store.assignment == nil)
        #expect(store.assignmentIssue == nil)
        #expect(await transport.experimentRequestCount == 1)
    }

    @Test("Defers experiment assignment until a cached session finishes authentication")
    @MainActor
    func experimentAssignmentWaitsForCachedSessionAuthentication() async {
        let transport = CachedSessionAssignmentTestTransport()
        let credentialStore = CachedSessionAssignmentCredentialStore(
            token: "refresh-token",
            user: .cachedAssignmentTest
        )
        let session = SessionStore(
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
            credentialStore: credentialStore,
            device: NativeDevice(
                id: "cached-assignment-test-device",
                name: "Test iPhone",
                appVersion: "1.0.0",
                platformVersion: "26.5"
            )
        )
        let store = ActionToPlanV2Store()

        let restoration = Task { await session.restoreSession() }
        await transport.waitUntilRefreshStarted()

        #expect(session.currentUser?.id == "user-1")
        #expect(session.canPresentAppShell)
        #expect(!session.canMakeAuthenticatedRequests)

        await store.loadAssignment(using: session)

        #expect(await transport.experimentRequestCount == 0)
        #expect(!store.hasLoadedAssignment)
        #expect(!store.isLoadingAssignment)
        #expect(store.assignment == nil)
        #expect(store.assignmentIssue == nil)

        await transport.completeRefresh()
        await restoration.value
        #expect(session.canMakeAuthenticatedRequests)

        await store.loadAssignment(using: session)

        #expect(await transport.experimentRequestCount == 1)
        #expect(store.hasLoadedAssignment)
        #expect(!store.isLoadingAssignment)
        #expect(store.assignment?.key == "action_to_plan_v2")
        #expect(store.isMutualOpportunityEnabled)
        #expect(store.assignmentIssue == nil)
    }

    @MainActor
    private func makeSession(transport: any APITransport) -> SessionStore {
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

    @MainActor
    private func assertAssignmentStateIsReset(_ store: ActionToPlanV2Store) {
        #expect(store.assignment == nil)
        #expect(!store.hasLoadedAssignment)
        #expect(!store.isLoadingAssignment)
        #expect(store.assignmentIssue == nil)
    }
}

private actor AssignmentTestTransport: APITransport {
    enum ExperimentResponse: Sendable {
        case failure
        case taskCancellation
        case urlCancellation
        case empty
        case treatment
        case suspendedTreatment
    }

    private var responses: [ExperimentResponse]
    private(set) var experimentRequestCount = 0
    private var suspendedRequestStarted = false
    private var suspendedRequestStartWaiters: [CheckedContinuation<Void, Never>] = []
    private var suspendedRequestContinuation: CheckedContinuation<Void, Never>?
    private var shouldCompleteSuspendedRequest = false

    init(responses: [ExperimentResponse]) {
        self.responses = responses
    }

    func waitUntilExperimentRequestIsSuspended() async {
        if suspendedRequestStarted { return }
        await withCheckedContinuation { continuation in
            suspendedRequestStartWaiters.append(continuation)
        }
    }

    func completeSuspendedExperimentRequest() {
        shouldCompleteSuspendedRequest = true
        suspendedRequestContinuation?.resume()
        suspendedRequestContinuation = nil
    }

    func data(for request: URLRequest) async throws -> (Data, URLResponse) {
        switch request.url?.path {
        case "/api/v1/auth/login":
            return response(
                request,
                200,
                #"{"data":{"user":{"id":"user-1","username":"test_001","nickname":"Test User","gender":"UNSPECIFIED","onboardingComplete":true,"isGuest":false,"verifiedStudent":true,"studentVerificationStatus":"VERIFIED","locale":"en"},"tokens":{"accessToken":"access-token","accessExpiresIn":900,"refreshToken":"refresh-token","refreshExpiresAt":"2026-09-16T00:00:00Z"}}}"#
            )
        case "/api/v1/me/experiments":
            experimentRequestCount += 1
            let next = responses.isEmpty ? .empty : responses.removeFirst()
            switch next {
            case .failure:
                throw URLError(.timedOut)
            case .taskCancellation:
                throw CancellationError()
            case .urlCancellation:
                throw URLError(.cancelled)
            case .empty:
                return response(request, 200, #"{"data":{"experiments":[]}}"#)
            case .treatment:
                return treatmentResponse(for: request)
            case .suspendedTreatment:
                suspendedRequestStarted = true
                let waiters = suspendedRequestStartWaiters
                suspendedRequestStartWaiters.removeAll()
                waiters.forEach { $0.resume() }
                if !shouldCompleteSuspendedRequest {
                    await withCheckedContinuation { continuation in
                        suspendedRequestContinuation = continuation
                    }
                }
                return treatmentResponse(for: request)
            }
        default:
            return response(
                request,
                404,
                #"{"error":{"code":"NOT_FOUND","message":"Missing","retryable":false,"requestId":"request-1"}}"#
            )
        }
    }

    private func treatmentResponse(for request: URLRequest) -> (Data, URLResponse) {
        response(
            request,
            200,
            #"{"data":{"experiments":[{"key":"action_to_plan_v2","eligible":true,"variant":"TREATMENT","assignedAt":"2026-08-31T12:00:00Z","features":{"v2ActionInterest":true,"v2PlanInheritance":true,"v2WeeklyIntent":true,"v2MutualOpportunity":true}}]}}"#
        )
    }

    private func response(_ request: URLRequest, _ status: Int, _ body: String) -> (Data, URLResponse) {
        (
            Data(body.utf8),
            HTTPURLResponse(
                url: request.url!,
                statusCode: status,
                httpVersion: "HTTP/1.1",
                headerFields: ["Content-Type": "application/json"]
            )!
        )
    }
}

private actor CachedSessionAssignmentCredentialStore: CredentialStore {
    private var token: String?
    private var user: CurrentUser?

    init(token: String?, user: CurrentUser?) {
        self.token = token
        self.user = user
    }

    func refreshToken() -> String? { token }

    func save(refreshToken: String) {
        token = refreshToken
    }

    func cachedUser() -> CurrentUser? { user }

    func saveCachedUser(_ user: CurrentUser) {
        self.user = user
    }

    func clear() {
        token = nil
        user = nil
    }
}

private extension CurrentUser {
    static let cachedAssignmentTest = CurrentUser(
        id: "user-1",
        username: "test_001",
        nickname: "Test User",
        email: nil,
        phone: nil,
        avatarUrl: nil,
        tagline: nil,
        school: "TUM",
        studentStatus: "CURRENT_STUDENT",
        degreeLevel: nil,
        major: nil,
        semester: nil,
        graduationYear: nil,
        gender: "UNSPECIFIED",
        onboardingComplete: true,
        isGuest: false,
        verifiedStudent: true,
        studentVerificationStatus: "VERIFIED",
        usernameUpdatedAt: nil,
        productTutorialDismissedAt: "2026-01-01T00:00:00.000Z",
        locale: "en"
    )
}

private actor CachedSessionAssignmentTestTransport: APITransport {
    private var refreshStarted = false
    private var refreshStartWaiters: [CheckedContinuation<Void, Never>] = []
    private var refreshContinuation: CheckedContinuation<Void, Never>?
    private var shouldCompleteRefresh = false
    private(set) var experimentRequestCount = 0

    func waitUntilRefreshStarted() async {
        if refreshStarted { return }
        await withCheckedContinuation { continuation in
            refreshStartWaiters.append(continuation)
        }
    }

    func completeRefresh() {
        shouldCompleteRefresh = true
        refreshContinuation?.resume()
        refreshContinuation = nil
    }

    func data(for request: URLRequest) async throws -> (Data, URLResponse) {
        switch request.url?.path {
        case "/api/v1/auth/refresh":
            refreshStarted = true
            let waiters = refreshStartWaiters
            refreshStartWaiters.removeAll()
            waiters.forEach { $0.resume() }
            if !shouldCompleteRefresh {
                await withCheckedContinuation { continuation in
                    refreshContinuation = continuation
                }
            }
            return response(
                request,
                200,
                #"{"data":{"user":{"id":"user-1","username":"test_001","nickname":"Test User","school":"TUM","gender":"UNSPECIFIED","onboardingComplete":true,"isGuest":false,"verifiedStudent":true,"studentVerificationStatus":"VERIFIED","locale":"en"},"tokens":{"accessToken":"access-token","accessExpiresIn":900,"refreshToken":"refresh-token-new","refreshExpiresAt":"2026-09-16T00:00:00Z"}}}"#
            )
        case "/api/v1/me/experiments":
            experimentRequestCount += 1
            return response(
                request,
                200,
                #"{"data":{"experiments":[{"key":"action_to_plan_v2","eligible":true,"variant":"TREATMENT","assignedAt":"2026-08-31T12:00:00Z","features":{"v2ActionInterest":true,"v2PlanInheritance":true,"v2WeeklyIntent":true,"v2MutualOpportunity":true}}]}}"#
            )
        default:
            return response(
                request,
                404,
                #"{"error":{"code":"NOT_FOUND","message":"Missing","retryable":false,"requestId":"request-1"}}"#
            )
        }
    }

    private func response(_ request: URLRequest, _ status: Int, _ body: String) -> (Data, URLResponse) {
        (
            Data(body.utf8),
            HTTPURLResponse(
                url: request.url!,
                statusCode: status,
                httpVersion: "HTTP/1.1",
                headerFields: ["Content-Type": "application/json"]
            )!
        )
    }
}

private actor CoordinationShellTestTransport: APITransport {
    private(set) var reserveCount = 0
    private(set) var heartbeatCount = 0
    private(set) var releaseCount = 0
    private(set) var connectionRequestCount = 0
    private(set) var idempotencyKeys: [String] = []
    private(set) var activationKeys: [String] = []
    private(set) var activationCount = 0
    private var activationFailures: Int

    init(activationFailures: Int = 0) {
        self.activationFailures = activationFailures
    }

    func data(for request: URLRequest) async throws -> (Data, URLResponse) {
        if request.url?.path.contains("/connections/") == true { connectionRequestCount += 1 }
        if let key = request.value(forHTTPHeaderField: "Idempotency-Key") { idempotencyKeys.append(key) }
        switch request.url?.path {
        case "/api/v1/auth/login":
            return response(request, 200, #"{"data":{"user":{"id":"user-1","username":"test_001","nickname":"Test User","gender":"UNSPECIFIED","onboardingComplete":true,"isGuest":false,"verifiedStudent":true,"studentVerificationStatus":"VERIFIED","locale":"en"},"tokens":{"accessToken":"access-token","accessExpiresIn":900,"refreshToken":"refresh-token","refreshExpiresAt":"2026-09-16T00:00:00Z"}}}"#)
        case "/api/v1/action-coordination/v2/interests/interest-1/reservations":
            reserveCount += 1
            return response(request, reserveCount == 1 ? 201 : 200, reservationJSON())
        case "/api/v1/action-coordination/v2/reservations/123e4567-e89b-42d3-a456-426614174001/heartbeat":
            heartbeatCount += 1
            return response(request, 200, reservationJSON())
        case "/api/v1/action-coordination/v2/reservations/123e4567-e89b-42d3-a456-426614174001/activate":
            activationCount += 1
            activationKeys.append(request.value(forHTTPHeaderField: "Idempotency-Key") ?? "")
            if activationFailures > 0 {
                activationFailures -= 1
                return response(request, 500, #"{"error":{"code":"INTERNAL_ERROR","message":"Try again","retryable":true,"requestId":"request-1"}}"#)
            }
            return response(request, 201, #"{"activation":{"connectionId":"connection-1","contextId":"context-1","sourceCardMessageId":"source-1","firstMessageId":"message-1","firstContentType":"MESSAGE","focus":{"type":"ACTION_CONTEXT","connectionId":"connection-1","contextId":"context-1"}}}"#)
        case "/api/v1/action-coordination/v2/reservations/123e4567-e89b-42d3-a456-426614174001":
            releaseCount += 1
            return response(request, 200, #"{"release":{"reservationId":"123e4567-e89b-42d3-a456-426614174001","contextId":"context-1","interestId":"interest-1","actionId":"action-1","generation":1,"releasedAt":"2026-08-31T12:00:00Z","focus":{"type":"ACTION_RESPONSES","actionId":"action-1","interestId":"interest-1"}}}"#)
        default:
            return response(request, 404, #"{"error":{"code":"NOT_FOUND","message":"Missing","retryable":false,"requestId":"request-1"}}"#)
        }
    }

    private func reservationJSON() -> String {
        let expiry = ISO8601DateFormatter().string(from: Date().addingTimeInterval(120))
        return "{\"reservation\":{\"id\":\"123e4567-e89b-42d3-a456-426614174001\",\"contextId\":\"context-1\",\"leaseExpiresAt\":\"\(expiry)\",\"generation\":1,\"actionContextPreview\":{\"kind\":\"LIVE\",\"title\":\"Library study\",\"startsAt\":null,\"endsAt\":null,\"location\":\"Main Library\",\"course\":null},\"planDraft\":{\"kind\":\"LIVE\",\"title\":\"Library study\",\"startTime\":null,\"endTime\":null,\"location\":\"Main Library\",\"planType\":\"STUDY\"},\"focus\":{\"type\":\"COORDINATION_SHELL\",\"interestId\":\"interest-1\",\"reservationId\":\"123e4567-e89b-42d3-a456-426614174001\"}}}"
    }

    private func response(_ request: URLRequest, _ status: Int, _ body: String) -> (Data, URLResponse) {
        (Data(body.utf8), HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: nil, headerFields: ["Content-Type": "application/json"])!)
    }
}

private actor ActionResponsesTestTransport: APITransport {
    enum Mode: Sendable { case twoPages, repeatedCursor }
    let mode: Mode
    private(set) var requestedCursors: [String?] = []
    private(set) var seenInterestIDs: [[String]] = []
    private(set) var seenSnapshotTokens: [String] = []

    init(mode: Mode) { self.mode = mode }

    func data(for request: URLRequest) async throws -> (Data, URLResponse) {
        switch request.url?.path {
        case "/api/v1/auth/login":
            return response(request, 200, #"{"data":{"user":{"id":"user-1","username":"test_001","nickname":"Test User","gender":"UNSPECIFIED","onboardingComplete":true,"isGuest":false,"verifiedStudent":true,"studentVerificationStatus":"VERIFIED","locale":"en"},"tokens":{"accessToken":"access-token","accessExpiresIn":900,"refreshToken":"refresh-token","refreshExpiresAt":"2026-09-16T00:00:00Z"}}}"#)
        case "/api/v1/action-coordination/v2/responses":
            let cursor = URLComponents(url: request.url!, resolvingAgainstBaseURL: false)?
                .queryItems?.first(where: { $0.name == "cursor" })?.value
            requestedCursors.append(cursor)
            let interestID = cursor == nil ? "interest-1" : "interest-2"
            let next: String?
            switch mode {
            case .twoPages: next = cursor == nil ? "page-2" : nil
            case .repeatedCursor: next = "loop"
            }
            return response(request, 200, pageJSON(interestID: interestID, nextCursor: next))
        case "/api/v1/action-coordination/v2/actions/action-1/responses/seen":
            let object = try JSONSerialization.jsonObject(with: request.httpBody ?? Data()) as? [String: Any]
            let ids = object?["interestIds"] as? [String] ?? []
            let token = object?["snapshotToken"] as? String ?? ""
            seenInterestIDs.append(ids)
            seenSnapshotTokens.append(token)
            let viewed = ids.map {
                "{\"interestId\":\"\($0)\",\"activationId\":\"activation-\($0)\",\"viewedAt\":\"2026-08-31T12:00:00Z\"}"
            }.joined(separator: ",")
            return response(request, 200, "{\"actionId\":\"action-1\",\"viewed\":[\(viewed)],\"counts\":{\"totalActiveInterestCount\":2,\"visibleInterestCount\":2,\"unseenVisibleInterestCount\":0}}")
        default:
            return response(request, 404, #"{"error":{"code":"NOT_FOUND","message":"Missing","retryable":false,"requestId":"request-1"}}"#)
        }
    }

    private func pageJSON(interestID: String, nextCursor: String?) -> String {
        let next = nextCursor.map { "\"\($0)\"" } ?? "null"
        return "{\"snapshot\":{\"token\":\"snapshot-1\",\"createdAt\":\"2026-08-31T10:00:00Z\",\"expiresAt\":\"2026-08-31T11:00:00Z\"},\"groups\":[{\"action\":{\"id\":\"action-1\",\"title\":\"Library lunch\",\"actionState\":\"ACTIVE\",\"startsAt\":null,\"endsAt\":null,\"location\":\"Mensa\",\"course\":null},\"counts\":{\"totalActiveInterestCount\":2,\"visibleInterestCount\":2,\"unseenVisibleInterestCount\":2},\"responses\":[{\"interestId\":\"\(interestID)\",\"activationId\":\"activation-\(interestID)\",\"contextId\":\"context-\(interestID)\",\"responder\":{\"userId\":\"user-\(interestID)\",\"displayName\":\"Mina\",\"avatarUrl\":null,\"verifiedStudent\":true},\"signals\":{\"sharedCourse\":null,\"sharedLanguages\":[\"ENGLISH\"]},\"receivedAt\":\"2026-08-31T10:05:00Z\",\"viewedAt\":null,\"hiddenAt\":null,\"interestState\":\"ACTIVE\",\"coordinationState\":\"WAITING\",\"presentationState\":\"VISIBLE\",\"canStartCoordination\":false,\"startCoordinationUnavailableReason\":\"COORDINATION_START_UNAVAILABLE\"}],\"focus\":{\"type\":\"ACTION_RESPONSES\",\"actionId\":\"action-1\",\"interestId\":\"\(interestID)\"}}],\"nextCursor\":\(next)}"
    }

    private func response(_ request: URLRequest, _ status: Int, _ body: String) -> (Data, URLResponse) {
        (Data(body.utf8), HTTPURLResponse(
            url: request.url!, statusCode: status, httpVersion: "HTTP/1.1",
            headerFields: ["Content-Type": "application/json"]
        )!)
    }
}

private actor DiscoverMemoryCredentialStore: CredentialStore {
    private var token: String?
    func refreshToken() -> String? { token }
    func save(refreshToken: String) { token = refreshToken }
    func clear() { token = nil }
}

private struct DiscoverTestCityConfiguration: Sendable {
    let defaultCity: String
    let servedCities: [String]
}

private enum CreatorGatedInterestListFixture: Sendable {
    case stateful
    case targetOnSecondPage
    case repeatedCursor
    case unbounded
    case typedContextAndFocus
}

private actor DiscoverTestTransport: APITransport {
    private let myPostsUnavailable: Bool
    private let cityConfiguration: DiscoverTestCityConfiguration?
    private let creatorGatedListFixture: CreatorGatedInterestListFixture
    private let gatedActionID: String
    private let createInterestConflict: Bool
    private(set) var feedCity: String?
    private(set) var feedQuery: String?
    private(set) var discoverRequestCount = 0
    private(set) var myPostsRequestCount = 0
    private(set) var savedPostsRequestCount = 0
    private(set) var buddyTitle: String?
    private(set) var buddyCategory: String?
    private(set) var buddyCourseIds: [String] = []
    private(set) var buddyImageUrls: [String] = []
    private(set) var buddyVisibility: String?
    private(set) var buddyReplyPreference: String?
    private(set) var buddyCity: String?
    private(set) var uploadedImageContentType: String?
    private(set) var activityCapacity: Int?
    private(set) var activityCity: String?
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
    private(set) var lastInterestPath: String?
    private(set) var lastInterestListPath: String?
    private(set) var interestListRequestCount = 0
    private(set) var interestListCursors: [String?] = []
    private(set) var lastInterestListState: String?
    private(set) var lastInterestListLimit: String?
    private(set) var lastInterestSurface: String?
    private(set) var createInterestRequestCount = 0
    private(set) var updatedBuddyTitle: String?
    private(set) var updatedBuddyCategory: String?
    private(set) var updatedBuddyTags: [String] = []
    private(set) var updatedBuddyVisibility: String?
    private(set) var updatedBuddyReplyPreference: String?
    private var failingFeedQueries = Set<String>()
    private var gatedInterestState: String?
    private var gatedCoordinationState: String?
    private var gatedActivationID = "activation-gated-1"

    init(
        myPostsUnavailable: Bool = false,
        cityConfiguration: DiscoverTestCityConfiguration? = nil,
        creatorGatedListFixture: CreatorGatedInterestListFixture = .stateful,
        gatedActionID: String = "post-gated",
        initialGatedInterestState: String? = nil,
        initialGatedCoordinationState: String? = nil,
        createInterestConflict: Bool = false
    ) {
        self.myPostsUnavailable = myPostsUnavailable
        self.cityConfiguration = cityConfiguration
        self.creatorGatedListFixture = creatorGatedListFixture
        self.gatedActionID = gatedActionID
        self.gatedInterestState = initialGatedInterestState
        self.gatedCoordinationState = initialGatedCoordinationState
        self.createInterestConflict = createInterestConflict
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
        case "/api/v1/client-config":
            guard let cityConfiguration else {
                return response(
                    request,
                    404,
                    #"{"error":{"code":"NOT_FOUND","message":"Missing","retryable":false,"requestId":"request-1"}}"#
                )
            }
            let payload = try JSONSerialization.data(withJSONObject: [
                "data": [
                    "discover": [
                        "defaultCity": cityConfiguration.defaultCity,
                        "servedCities": cityConfiguration.servedCities,
                    ],
                ],
            ])
            return response(request, 200, String(decoding: payload, as: UTF8.self))
        case "/api/v1/discover":
            discoverRequestCount += 1
            let queryItems = URLComponents(url: request.url!, resolvingAgainstBaseURL: false)?.queryItems
            let requestQuery = queryItems?.first(where: { $0.name == "q" })?.value
            feedCity = queryItems?.first(where: { $0.name == "city" })?.value
            feedQuery = requestQuery
            if let requestQuery, failingFeedQueries.contains(requestQuery) {
                throw URLError(.timedOut)
            }
            if myPostsUnavailable {
                return response(
                    request,
                    200,
                    #"{"data":{"city":"Munich","buddies":[{"id":"post-peer","category":"OTHER","city":"Munich","title":"Peer plan","body":null,"status":"ACTIVE","tags":[],"visibility":"SCHOOL_ONLY","replyPreference":"REQUEST_FIRST","startsAt":null,"endsAt":null,"location":null,"capacity":null,"createdAt":"2026-07-17T09:00:00Z","expiresAt":"2027-07-20T10:00:00Z","isOwn":false,"savedByViewer":false,"interestedCount":0,"commentCount":0,"imageUrls":[],"linkedCourses":[],"author":{"id":"peer-1","displayName":"Mina","tagline":null,"avatarUrl":null,"major":null,"semester":null,"school":"TUM","verifiedStudent":true}},{"id":"post-owned","category":"OTHER","city":"Munich","title":"My library plan","body":"Study together","status":"ACTIVE","tags":[],"visibility":"SCHOOL_ONLY","replyPreference":"REQUEST_FIRST","startsAt":null,"endsAt":null,"location":"Main Library","capacity":null,"createdAt":"2026-07-17T10:00:00Z","expiresAt":"2027-07-20T10:00:00Z","isOwn":true,"savedByViewer":false,"interestedCount":2,"commentCount":0,"imageUrls":[],"linkedCourses":[],"author":{"id":"user-1","displayName":"Test User","tagline":null,"avatarUrl":null,"major":"Informatics","semester":3,"school":"TUM","verifiedStudent":true}}],"activities":[{"id":"activity-peer","city":"Munich","school":"TUM","title":"Peer meetup","description":null,"category":null,"startAt":"2027-07-18T14:00:00Z","endAt":"2027-07-18T15:00:00Z","location":"Campus","capacity":null,"status":"OPEN","phase":"bookable","goingCount":1,"commentCount":0,"viewerSignupStatus":null,"isOrganizer":false,"organizer":{"id":"peer-2","displayName":"Noah","avatarUrl":null,"verifiedStudent":true}},{"id":"activity-owned","city":"Munich","school":"TUM","title":"My meetup","description":"Practice together","category":null,"startAt":"2027-07-18T16:00:00Z","endAt":"2027-07-18T18:00:00Z","location":"Cafe","capacity":10,"status":"OPEN","phase":"bookable","goingCount":4,"commentCount":0,"viewerSignupStatus":null,"isOrganizer":true,"organizer":{"id":"user-1","displayName":"Test User","avatarUrl":null,"verifiedStudent":true}}]}}"#
                )
            }
            return response(
                request,
                200,
                #"{"data":{"city":"Munich","buddies":[{"id":"post-1","category":"OTHER","city":"Munich","title":"Library study buddy","body":"Study together","status":"ACTIVE","tags":[],"visibility":"SCHOOL_ONLY","replyPreference":"REQUEST_FIRST","startsAt":null,"endsAt":null,"location":null,"capacity":null,"createdAt":"2026-07-17T10:00:00Z","expiresAt":"2026-07-20T10:00:00Z","isOwn":false,"savedByViewer":false,"interestedCount":2,"commentCount":0,"imageUrls":[],"linkedCourses":[],"author":{"id":"peer-1","displayName":"Mina","tagline":"At the library","avatarUrl":null,"major":"Informatics","semester":3,"school":"TUM","verifiedStudent":true}}],"activities":[{"id":"activity-1","city":"Munich","school":"TUM","title":"Conversation meetup","description":"Practice together","category":null,"startAt":"2026-07-18T16:00:00Z","endAt":"2026-07-18T18:00:00Z","location":"Cafe","capacity":10,"status":"OPEN","phase":"bookable","goingCount":4,"commentCount":0,"viewerSignupStatus":null,"isOrganizer":false,"organizer":{"id":"peer-2","displayName":"Noah","avatarUrl":null,"verifiedStudent":true}}]}}"#
            )
        case "/api/v1/me/posts":
            myPostsRequestCount += 1
            if myPostsUnavailable {
                return response(request, 404, "<html><body>Not Found</body></html>")
            }
            return response(
                request,
                200,
                #"{"data":{"posts":[{"id":"post-owned","category":"OTHER","city":"Munich","title":"My library plan","body":"Study together","status":"ACTIVE","tags":[],"visibility":"SCHOOL_ONLY","replyPreference":"REQUEST_FIRST","startsAt":null,"endsAt":null,"location":"Main Library","capacity":null,"createdAt":"2026-07-17T10:00:00Z","expiresAt":"2027-07-20T10:00:00Z","isOwn":true,"savedByViewer":false,"interestedCount":2,"commentCount":0,"imageUrls":[],"linkedCourses":[],"author":{"id":"user-1","displayName":"Test User","tagline":null,"avatarUrl":null,"major":"Informatics","semester":3,"school":"TUM","verifiedStudent":true}}],"activities":[{"id":"activity-owned","city":"Munich","school":"TUM","title":"My meetup","description":"Practice together","category":null,"startAt":"2027-07-18T16:00:00Z","endAt":"2027-07-18T18:00:00Z","location":"Cafe","capacity":10,"status":"OPEN","phase":"bookable","goingCount":4,"commentCount":0,"viewerSignupStatus":null,"isOrganizer":true,"organizer":{"id":"user-1","displayName":"Test User","avatarUrl":null,"verifiedStudent":true}}]}}"#
            )
        case "/api/v1/me/saved-posts":
            savedPostsRequestCount += 1
            return response(
                request,
                200,
                #"{"data":{"posts":[{"id":"post-1","category":"OTHER","city":"Munich","title":"Library study buddy","body":"Study together","status":"ACTIVE","tags":[],"visibility":"SCHOOL_ONLY","replyPreference":"REQUEST_FIRST","startsAt":null,"endsAt":null,"location":"Main Library","capacity":null,"createdAt":"2026-07-17T10:00:00Z","expiresAt":"2027-07-20T10:00:00Z","isOwn":false,"savedByViewer":true,"interestedCount":3,"commentCount":1,"imageUrls":[],"linkedCourses":[],"author":{"id":"peer-1","displayName":"Mina","tagline":"At the library","avatarUrl":null,"major":"Informatics","semester":3,"school":"TUM","verifiedStudent":true}}]}}"#
            )
        case "/api/v1/discover/posts":
            let json = try bodyJSON(request)
            buddyTitle = json["title"] as? String
            buddyCity = json["city"] as? String
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
        case "/api/v1/discover/posts/post-gated",
             "/api/v1/discover/posts/post-gated-readonly",
             "/api/v1/discover/posts/post-gated-closed":
            let postID = request.url?.lastPathComponent ?? "post-gated"
            let status = postID == "post-gated-closed" ? "CLOSED" : "ACTIVE"
            let interactionMode = postID == "post-gated" ? "EXPRESS_INTEREST" : "READ_ONLY"
            return response(
                request,
                200,
                gatedPostDetailJSON(
                    postID: postID,
                    status: status,
                    interactionMode: interactionMode
                )
            )
        case "/api/v1/discover/posts/post-gated/questions",
             "/api/v1/discover/posts/post-gated-readonly/questions",
             "/api/v1/discover/posts/post-gated-closed/questions":
            return response(request, 200, #"{"data":{"total":0,"questions":[]}}"#)
        case "/api/v1/action-coordination/v2/me/interests":
            lastInterestListPath = request.url?.path
            interestListRequestCount += 1
            let queryItems = URLComponents(
                url: request.url!,
                resolvingAgainstBaseURL: false
            )?.queryItems ?? []
            let cursor = queryItems.first(where: { $0.name == "cursor" })?.value
            interestListCursors.append(cursor)
            lastInterestListState = queryItems.first(where: { $0.name == "state" })?.value
            lastInterestListLimit = queryItems.first(where: { $0.name == "limit" })?.value

            switch creatorGatedListFixture {
            case .stateful:
                let interests = gatedInterestState.map { state in
                    let interest = gatedInterestJSON(
                        state: state,
                        coordinationState: gatedCoordinationState,
                        activationID: gatedActivationID,
                        actionID: gatedActionID
                    )
                    return "[\(interest)]"
                } ?? "[]"
                return response(
                    request,
                    200,
                    "{\"interests\":\(interests),\"nextCursor\":null}"
                )
            case .targetOnSecondPage:
                if cursor == nil {
                    let other = gatedInterestJSON(
                        state: "ACTIVE",
                        activationID: "activation-other",
                        actionID: "post-other",
                        interestID: "interest-other"
                    )
                    return response(
                        request,
                        200,
                        "{\"interests\":[\(other)],\"nextCursor\":\"page-2\"}"
                    )
                }
                let target = gatedInterestJSON(
                    state: "ACTIVE",
                    activationID: gatedActivationID,
                    actionID: gatedActionID
                )
                return response(
                    request,
                    200,
                    "{\"interests\":[\(target)],\"nextCursor\":null}"
                )
            case .repeatedCursor:
                return response(
                    request,
                    200,
                    #"{"interests":[],"nextCursor":"loop"}"#
                )
            case .unbounded:
                return response(
                    request,
                    200,
                    "{\"interests\":[],\"nextCursor\":\"page-\(interestListRequestCount)\"}"
                )
            case .typedContextAndFocus:
                let tombstone = gatedInterestJSON(
                    state: "ACTIVE",
                    coordinationState: "UNAVAILABLE",
                    activationID: "activation-tombstone",
                    actionID: "post-removed",
                    interestID: "interest-tombstone",
                    contextJSON: #"{"kind":"TOMBSTONE"}"#,
                    planDraftJSON: #"{"kind":"TOMBSTONE"}"#,
                    focusJSON: #"{"type":"PLAN","connectionId":"blocked-connection","commitmentId":"blocked-commitment","revisionId":"blocked-revision"}"#
                )
                let actionContext = gatedInterestJSON(
                    state: "ACTIVE",
                    coordinationState: "OPEN",
                    activationID: "activation-context",
                    actionID: "post-context",
                    interestID: "interest-context",
                    focusJSON: #"{"type":"ACTION_CONTEXT","connectionId":"connection-context","contextId":"context-1"}"#
                )
                let plan = gatedInterestJSON(
                    state: "ACTIVE",
                    coordinationState: "OPEN",
                    activationID: "activation-plan",
                    actionID: "post-plan",
                    interestID: "interest-plan",
                    focusJSON: #"{"type":"PLAN","connectionId":"connection-plan","commitmentId":"commitment-plan","revisionId":"revision-plan"}"#
                )
                return response(
                    request,
                    200,
                    "{\"interests\":[\(tombstone),\(actionContext),\(plan)],\"nextCursor\":null}"
                )
            }
        case "/api/v1/action-coordination/v2/actions/post-gated/interest":
            lastInterestPath = request.url?.path
            lastInterestSurface = try bodyJSON(request)["interestSurface"] as? String
            createInterestRequestCount += 1
            if createInterestConflict {
                gatedInterestState = "WITHDRAWN"
                gatedCoordinationState = "UNAVAILABLE"
                return response(
                    request,
                    409,
                    #"{"error":{"code":"INTEREST_NOT_ACTIVE","message":"This response is no longer active.","field":null,"retryable":false,"requestId":"request-1"}}"#
                )
            }
            gatedInterestState = "ACTIVE"
            gatedCoordinationState = "WAITING"
            gatedActivationID = "activation-gated-1"
            recordKey(request)
            let interestJSON = gatedInterestJSON(
                state: "ACTIVE",
                activationID: gatedActivationID,
                actionID: gatedActionID
            )
            return response(
                request,
                201,
                "{\"interest\":\(interestJSON)}"
            )
        case "/api/v1/action-coordination/v2/interests/interest-gated/reactivate":
            lastInterestPath = request.url?.path
            lastInterestSurface = try bodyJSON(request)["interestSurface"] as? String
            gatedInterestState = "ACTIVE"
            gatedCoordinationState = "WAITING"
            gatedActivationID = "activation-gated-2"
            recordKey(request)
            let interestJSON = gatedInterestJSON(
                state: "ACTIVE",
                activationID: gatedActivationID,
                actionID: gatedActionID
            )
            return response(
                request,
                200,
                "{\"interest\":\(interestJSON)}"
            )
        case "/api/v1/action-coordination/v2/interests/interest-gated":
            lastInterestPath = request.url?.path
            gatedInterestState = "WITHDRAWN"
            gatedCoordinationState = "UNAVAILABLE"
            recordKey(request)
            let interestJSON = gatedInterestJSON(
                state: "WITHDRAWN",
                activationID: gatedActivationID,
                actionID: gatedActionID
            )
            return response(
                request,
                200,
                "{\"interest\":\(interestJSON)}"
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
                    #"{"data":{"post":{"id":"post-1","category":"OTHER","city":"Munich","title":"Updated study plan","body":"New details #focus","status":"ACTIVE","tags":["focus"],"visibility":"VERIFIED_ONLY","replyPreference":"REQUEST_FIRST","startsAt":null,"endsAt":null,"location":null,"capacity":null,"createdAt":"2026-07-17T10:00:00Z","expiresAt":"2030-03-17T17:46:40Z","isOwn":true,"savedByViewer":false,"interestedCount":2,"commentCount":0,"imageUrls":[],"linkedCourses":[],"author":{"id":"user-1","displayName":"Test User","tagline":null,"avatarUrl":null,"major":"Informatics","semester":3,"school":"TUM","verifiedStudent":true}}}}"#
                )
            }
            return response(
                request,
                200,
                #"{"data":{"post":{"id":"post-1","category":"OTHER","city":"Munich","title":"Library study buddy","body":"Study together","status":"ACTIVE","tags":[],"visibility":"SCHOOL_ONLY","replyPreference":"REQUEST_FIRST","startsAt":null,"endsAt":null,"location":null,"capacity":null,"createdAt":"2026-07-17T10:00:00Z","expiresAt":"2026-07-20T10:00:00Z","isOwn":false,"savedByViewer":false,"interestedCount":2,"commentCount":0,"imageUrls":[],"linkedCourses":[],"author":{"id":"peer-1","displayName":"Mina","tagline":null,"avatarUrl":null,"major":"Informatics","semester":3,"school":"TUM","verifiedStudent":true}},"viewerCanMessage":false}}"#
            )
        case "/api/v1/discover/posts/post-1/saved":
            lastSavedPath = request.url?.path
            recordKey(request)
            return response(
                request,
                request.httpMethod == "POST" ? 201 : 200,
                request.httpMethod == "POST"
                    ? #"{"data":{"postId":"post-1","savedByViewer":true,"interestedCount":3}}"#
                    : #"{"data":{"postId":"post-1","savedByViewer":false,"interestedCount":2}}"#
            )
        case "/api/v1/discover/posts/post-owned/status":
            lastPostStatusPath = request.url?.path
            recordKey(request)
            return response(
                request,
                200,
                #"{"data":{"post":{"id":"post-owned","category":"OTHER","city":"Munich","title":"My library plan","body":"Study together","status":"CLOSED","tags":[],"visibility":"SCHOOL_ONLY","replyPreference":"REQUEST_FIRST","startsAt":null,"endsAt":null,"location":"Main Library","capacity":null,"createdAt":"2026-07-17T10:00:00Z","expiresAt":"2027-07-20T10:00:00Z","isOwn":true,"savedByViewer":false,"interestedCount":2,"commentCount":0,"imageUrls":[],"linkedCourses":[],"author":{"id":"user-1","displayName":"Test User","tagline":null,"avatarUrl":null,"major":"Informatics","semester":3,"school":"TUM","verifiedStudent":true}}}}"#
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
            activityCity = json["city"] as? String
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
                #"{"data":{"activity":{"id":"activity-1","city":"Munich","school":"TUM","title":"Conversation meetup","description":"Practice together","category":null,"startAt":"2026-07-18T16:00:00Z","endAt":"2026-07-18T18:00:00Z","location":"Cafe","capacity":10,"status":"OPEN","phase":"bookable","goingCount":4,"commentCount":0,"viewerSignupStatus":null,"isOrganizer":false,"organizer":{"id":"peer-2","displayName":"Noah","avatarUrl":null,"verifiedStudent":true}},"goingAttendees":[{"userId":"peer-1","displayName":"Mina","avatarUrl":null}],"viewerHasExistingChat":false,"calendarEntryId":null}}"#
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
                #"{"data":{"activity":{"id":"activity-1","city":"Munich","school":"TUM","title":"Conversation meetup","description":"Practice together","category":null,"startAt":"2026-07-18T16:00:00Z","endAt":"2026-07-18T18:00:00Z","location":"Cafe","capacity":10,"status":"OPEN","phase":"bookable","goingCount":5,"commentCount":0,"viewerSignupStatus":"GOING","isOrganizer":false,"organizer":{"id":"peer-2","displayName":"Noah","avatarUrl":null,"verifiedStudent":true}}}}"#
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
                #"{"data":{"activity":{"id":"activity-owned","city":"Munich","school":"TUM","title":"My meetup","description":"Practice together","category":null,"startAt":"2027-07-18T16:00:00Z","endAt":"2027-07-18T18:00:00Z","location":"Cafe","capacity":10,"status":"CANCELED","phase":"canceled","goingCount":4,"commentCount":0,"viewerSignupStatus":null,"isOrganizer":true,"organizer":{"id":"user-1","displayName":"Test User","avatarUrl":null,"verifiedStudent":true}}}}"#
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

    private func gatedPostDetailJSON(
        postID: String,
        status: String,
        interactionMode: String
    ) -> String {
        """
        {"data":{"post":{"id":"\(postID)","category":"SHARED_COURSES","city":"Munich","title":"Review algorithms","body":"Work through the problem set","status":"\(status)","coordination":{"policy":"CREATOR_GATED_V2","schemaVersion":1,"interactionMode":"\(interactionMode)","readOnlyReason":\(interactionMode == "READ_ONLY" ? "\"NOT_ELIGIBLE\"" : "null")},"tags":["study"],"visibility":"COURSEMATES_ONLY","replyPreference":"REQUEST_FIRST","startsAt":"2027-09-02T15:00:00Z","endsAt":"2027-09-02T17:00:00Z","location":"Main Library","capacity":null,"createdAt":"2026-08-30T10:00:00Z","expiresAt":"2027-09-02T17:00:00Z","isOwn":false,"savedByViewer":false,"interestedByViewer":false,"interestedCount":2,"commentCount":0,"imageUrls":[],"linkedCourses":[{"id":"course-1","code":"IN0001","name":"Algorithms"}],"author":{"id":"peer-1","displayName":"Mina","tagline":null,"avatarUrl":null,"major":"Informatics","semester":3,"school":"TUM","verifiedStudent":true}},"viewerCanMessage":false,"activeInterest":null}}
        """
    }

    private func gatedInterestJSON(
        state: String,
        coordinationState: String? = nil,
        activationID: String,
        actionID: String = "post-gated",
        interestID: String = "interest-gated",
        contextJSON: String? = nil,
        planDraftJSON: String? = nil,
        focusJSON: String? = nil
    ) -> String {
        let coordinationState = coordinationState ?? (state == "ACTIVE" ? "WAITING" : "UNAVAILABLE")
        let contextJSON = contextJSON
            ?? #"{"kind":"LIVE","title":"Review algorithms","startsAt":"2027-09-02T15:00:00Z","endsAt":"2027-09-02T17:00:00.500Z","location":"Main Library","course":{"id":"course-1","code":"IN0001","name":"Algorithms"}}"#
        let planDraftJSON = planDraftJSON
            ?? #"{"kind":"LIVE","title":"Review algorithms","startTime":"2027-09-02T15:00:00Z","endTime":"2027-09-02T17:00:00.500Z","location":"Main Library","planType":"STUDY"}"#
        let focusJSON = focusJSON
            ?? "{\"type\":\"INTEREST\",\"interestId\":\"\(interestID)\"}"
        return """
        {"id":"\(interestID)","actionId":"\(actionID)","actionState":"ACTIVE","actionExpiresAt":"2027-09-02T17:00:00Z","interestState":"\(state)","coordinationState":"\(coordinationState)","activationId":"\(activationID)","activationStartedAt":"2026-08-31T10:00:00.125Z","terminalReason":null,"terminalAt":null,"context":\(contextJSON),"planDraft":\(planDraftJSON),"focus":\(focusJSON),"coordinationPolicy":"CREATOR_GATED_V2","policySchemaVersion":1,"createdAt":"2026-08-31T10:00:00Z","updatedAt":"2026-08-31T10:05:00.250Z"}
        """
    }

    private func recordKey(_ request: URLRequest) {
        if let key = request.value(forHTTPHeaderField: "Idempotency-Key") {
            writeKeys.append(key)
        }
    }

    private func response(_ request: URLRequest, _ status: Int, _ body: String) -> (Data, URLResponse) {
        let resolvedBody: String
        if request.url?.path == "/api/v1/discover", let feedCity {
            resolvedBody = body.replacingOccurrences(of: "Munich", with: feedCity)
        } else {
            resolvedBody = body
        }
        let response = HTTPURLResponse(
            url: request.url!,
            statusCode: status,
            httpVersion: "HTTP/1.1",
            headerFields: ["Content-Type": "application/json"]
        )!
        return (Data(resolvedBody.utf8), response)
    }
}
