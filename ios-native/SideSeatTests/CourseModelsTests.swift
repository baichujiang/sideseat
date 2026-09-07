import Foundation
import Testing
@testable import SideSeat

@Suite("Courses")
struct CourseModelsTests {
    @Test("Decodes catalog and nullable membership contracts")
    func decodesContracts() throws {
        let list = try JSONDecoder().decode(
            APIEnvelope<NativeCourseList>.self,
            from: Data(
                #"{"data":{"school":"TUM","semesterLabel":"SS 2026","scope":"popular","query":"","schools":[{"code":"TUM","shortLabel":"TUM","name":"Technical University of Munich"}],"courses":[{"id":"course-1","code":"IN2346","name":"Deep Learning","instructorSummary":null,"school":"TUM","semesterLabel":"SS 2026","memberCount":3,"viewer":{"enrolled":false,"saved":true},"sessions":[]}],"nextCursor":null,"semesterReview":{"semesterLabel":"SS 2026","required":true,"courseCount":1}}}"#.utf8
            )
        )
        #expect(list.data.courses.first?.viewer.saved == true)
        #expect(list.data.scope == .popular)
        #expect(list.data.semesterReview?.required == true)

        let detail = try JSONDecoder().decode(
            APIEnvelope<NativeCourseDetail>.self,
            from: Data(
                #"{"data":{"course":{"id":"course-1","code":"IN2346","name":"Deep Learning","instructorSummary":null,"school":"TUM","semesterLabel":"SS 2026","memberCount":3,"viewer":{"enrolled":false,"saved":true},"sessions":[],"officialScheduleSyncedAt":null},"membership":null,"officialScheduleVariants":[],"members":[],"chat":{"available":false,"unreadCount":0}}}"#.utf8
            )
        )
        #expect(detail.data.membership == nil)
        #expect(detail.data.chat.available == false)
    }

    @Test("Decodes archived course restore state")
    func decodesArchivedRestoreState() throws {
        let list = try JSONDecoder().decode(
            APIEnvelope<NativeCourseList>.self,
            from: Data(
                #"{"data":{"school":"TUM","semesterLabel":"SS 2026","scope":"archived","query":"","schools":[],"courses":[{"id":"course-old","code":"IN2346","name":"Deep Learning","instructorSummary":null,"school":"LMU","semesterLabel":"WS 2025/26","memberCount":0,"viewer":{"enrolled":false,"saved":false,"canRestore":false,"restoreBlockReason":"SCHOOL_MISMATCH"},"sessions":[]}],"nextCursor":null,"semesterReview":null}}"#.utf8
            )
        )

        #expect(list.data.scope == .archived)
        #expect(list.data.courses.first?.viewer.canRestore == false)
        #expect(list.data.courses.first?.viewer.restoreBlockReason == "SCHOOL_MISMATCH")
    }

    @Test("Changing filters never presents stale courses when the new request fails")
    @MainActor
    func clearsStalePayloadAcrossFilters() async {
        let transport = CourseListTestTransport()
        let session = makeSession(transport: transport)
        await session.login(identifier: "test_001", password: "Password123")
        let store = CourseListStore()

        await store.load(using: session, scope: .popular, school: nil, query: "")
        #expect(store.payload?.scope == .popular)

        await transport.setFailingScopes([NativeCourseScope.enrolled.rawValue])
        await store.load(using: session, scope: .enrolled, school: nil, query: "")

        #expect(store.payload == nil)
        #expect(store.issue != nil)
    }

    @Test("Refreshing the same filter keeps visible courses when the request fails")
    @MainActor
    func preservesPayloadForSameFilterRefresh() async {
        let transport = CourseListTestTransport()
        let session = makeSession(transport: transport)
        await session.login(identifier: "test_001", password: "Password123")
        let store = CourseListStore()

        await store.load(using: session, scope: .popular, school: nil, query: "")
        await transport.setFailingScopes([NativeCourseScope.popular.rawValue])
        await store.load(using: session, scope: .popular, school: nil, query: "")

        #expect(store.payload?.scope == .popular)
        #expect(store.payload?.courses.map(\.id) == ["course-1"])
        #expect(store.issue != nil)
    }

    @MainActor
    private func makeSession(transport: CourseListTestTransport) -> SessionStore {
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
            credentialStore: CourseListMemoryCredentialStore(),
            device: NativeDevice(
                id: "course-list-device",
                name: "Test iPhone",
                appVersion: "1.0.0",
                platformVersion: "26.5"
            )
        )
    }
}

@Suite("Together weekly intentions")
struct WeeklyIntentModelsTests {
    @Test("Decodes the multi-intent collection and legacy singleton payloads")
    func decodesCollectionAndLegacyPayloads() throws {
        let first = intentJSON(id: "intent-1", topic: "STUDY")
        let second = intentJSON(id: "intent-2", topic: "FOOD")
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601

        let collection = try decoder.decode(
            NativeWeeklyIntentPayload.self,
            from: Data(#"{"intents":[\#(first),\#(second)],"intent":\#(first)}"#.utf8)
        )
        #expect(collection.intents.map(\.id) == ["intent-1", "intent-2"])
        #expect(collection.intent?.id == "intent-1")
        #expect(collection.intent?.effectiveTogetherMode == .sameActivity)
        #expect(collection.intent?.studyGoal == nil)

        let legacy = try decoder.decode(
            NativeWeeklyIntentPayload.self,
            from: Data(#"{"intent":\#(second)}"#.utf8)
        )
        #expect(legacy.intents.map(\.id) == ["intent-2"])
        #expect(legacy.intent?.id == "intent-2")
    }

    @Test("Keeps every upcoming time and presents them chronologically")
    func ordersRelevantTimeWindows() {
        let now = Date(timeIntervalSince1970: 10_000)
        let elapsed = NativeWeeklyIntentTimeWindow(
            startAt: now.addingTimeInterval(-7_200),
            endAt: now.addingTimeInterval(-3_600)
        )
        let later = NativeWeeklyIntentTimeWindow(
            startAt: now.addingTimeInterval(7_200),
            endAt: now.addingTimeInterval(10_800)
        )
        let sooner = NativeWeeklyIntentTimeWindow(
            startAt: now.addingTimeInterval(3_600),
            endAt: now.addingTimeInterval(5_400)
        )
        let intent = makeIntent(timeWindows: [later, elapsed, sooner])

        #expect(intent.relevantTimeWindows(now: now) == [sooner, later])
    }

    @Test("Edit explicitly clears course scope and preserves multiple times")
    func editEncodesNullableCourseAndAllWindows() throws {
        let now = Date(timeIntervalSince1970: 10_000)
        let request = NativeWeeklyIntentEditRequest(
            expectedVersion: 3,
            topic: .study,
            activityText: nil,
            sportTag: nil,
            sportOtherNote: nil,
            togetherMode: .parallel,
            studyGoal: "Review for the algorithms exam",
            courseId: nil,
            timeWindows: [
                NativeWeeklyIntentTimeWindow(
                    startAt: now.addingTimeInterval(3_600),
                    endAt: now.addingTimeInterval(7_200)
                ),
                NativeWeeklyIntentTimeWindow(
                    startAt: now.addingTimeInterval(10_800),
                    endAt: now.addingTimeInterval(14_400)
                ),
            ],
            timeZone: "Europe/Berlin",
            note: nil
        )
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        let object = try #require(
            JSONSerialization.jsonObject(with: encoder.encode(request)) as? [String: Any]
        )

        #expect(object.keys.contains("courseId"))
        #expect(object["courseId"] is NSNull)
        #expect(object.keys.contains("sportTag"))
        #expect(object["sportTag"] is NSNull)
        #expect(object.keys.contains("sportOtherNote"))
        #expect(object["sportOtherNote"] is NSNull)
        #expect(object["togetherMode"] as? String == "PARALLEL")
        #expect(object["studyGoal"] as? String == "Review for the algorithms exam")
        #expect(object.keys.contains("activityText"))
        #expect(object["activityText"] is NSNull)
        #expect((object["timeWindows"] as? [[String: Any]])?.count == 2)
    }

    @Test("Study requests carry the mode and goal while other topics clear them")
    func normalizesTogetherDetailsForSubmission() throws {
        let study = NativeTogetherIntentDetails.normalized(
            topic: .study,
            togetherMode: .either,
            studyGoal: "  Write my thesis  "
        )
        #expect(study.togetherMode == .either)
        #expect(study.studyGoal == "Write my thesis")

        let sports = NativeTogetherIntentDetails.normalized(
            topic: .sports,
            togetherMode: .parallel,
            studyGoal: "This must not leak into sports"
        )
        #expect(sports.togetherMode == .sameActivity)
        #expect(sports.studyGoal == nil)

        let request = NativeWeeklyIntentCreateRequest(
            topic: .study,
            activityText: nil,
            sportTag: nil,
            sportOtherNote: nil,
            togetherMode: study.togetherMode,
            studyGoal: study.studyGoal,
            courseId: nil,
            timeWindows: [
                NativeWeeklyIntentTimeWindow(
                    startAt: Date(timeIntervalSince1970: 10_000),
                    endAt: Date(timeIntervalSince1970: 13_600)
                ),
            ],
            timeZone: "Europe/Berlin",
            note: nil
        )
        let object = try #require(
            JSONSerialization.jsonObject(with: JSONEncoder().encode(request)) as? [String: Any]
        )
        #expect(object["togetherMode"] as? String == "EITHER")
        #expect(object["studyGoal"] as? String == "Write my thesis")

        let sportsEdit = NativeWeeklyIntentEditRequest(
            expectedVersion: 4,
            topic: .sports,
            activityText: nil,
            sportTag: .badminton,
            sportOtherNote: nil,
            togetherMode: sports.togetherMode,
            studyGoal: sports.studyGoal,
            courseId: nil,
            timeWindows: request.timeWindows,
            timeZone: request.timeZone,
            note: nil
        )
        let sportsObject = try #require(
            JSONSerialization.jsonObject(with: JSONEncoder().encode(sportsEdit)) as? [String: Any]
        )
        #expect(sportsObject["togetherMode"] as? String == "SAME_ACTIVITY")
        #expect(sportsObject.keys.contains("studyGoal"))
        #expect(sportsObject["studyGoal"] is NSNull)
    }

    @Test("Sports use the backend wire value and display the specific activity")
    func encodesAndPresentsSpecificSport() throws {
        #expect(NativeSportTag.badminton.rawValue == "BADMINTON")
        #expect(NativeSportTag.tableTennis.rawValue == "TABLE_TENNIS")

        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        let payload = try decoder.decode(
            NativeWeeklyIntentPayload.self,
            from: Data(
                #"{"intent":{"id":"intent-sport","topic":"SPORTS","sportTag":"BADMINTON","sportOtherNote":null,"courseId":null,"course":null,"timeWindows":[{"startAt":"2026-09-01T10:00:00Z","endAt":"2026-09-01T11:00:00Z"}],"timeZone":"Europe/Berlin","note":null,"status":"ACTIVE","policyVersion":1,"version":1,"expiresAt":"2026-09-06T21:59:59Z","pausedAt":null,"endedAt":null,"createdAt":"2026-09-01T08:00:00Z","updatedAt":"2026-09-01T08:00:00Z"}}"#.utf8
            )
        )

        #expect(payload.intent?.sportTag == .badminton)
        #expect(payload.intent?.activityTitle == AppLocalization.string("Badminton"))
    }

    @Test("Known sport text maps to its tag without an other note")
    func normalizesKnownSportInput() {
        let input = NativeSportInput.normalized(
            "  \(NativeSportTag.badminton.title)\n"
        )

        #expect(input.tag == .badminton)
        #expect(input.otherNote == nil)
    }

    @Test("Custom sport text is trimmed and carried as an other sport")
    func normalizesCustomSportInput() {
        let input = NativeSportInput.normalized("  Ultimate frisbee\n")

        #expect(input.tag == .other)
        #expect(input.otherNote == "Ultimate frisbee")
    }

    @Test("Sport suggestions match localized titles and respect the result limit")
    func filtersAndLimitsSportSuggestions() {
        let localizedMatches = NativeSportInput.suggestions(
            matching: NativeSportTag.tableTennis.title,
            limit: 5
        )
        let limitedMatches = NativeSportInput.suggestions(matching: "ball", limit: 2)

        #expect(localizedMatches.contains(.tableTennis))
        #expect(limitedMatches.count == 2)
        #expect(limitedMatches.allSatisfy { $0 != .other })
    }

    @Test("Only study intentions retain a normalized course ID")
    func normalizesCourseScopeByTopic() {
        #expect(
            NativeWeeklyIntentSubmissionRules.normalizedCourseID(
                topic: .sports,
                courseID: "  course-1  "
            ) == nil
        )
        #expect(
            NativeWeeklyIntentSubmissionRules.normalizedCourseID(
                topic: .study,
                courseID: "  course-1  "
            ) == "course-1"
        )
    }

    @Test("Time input rounds up to fifteen-minute boundaries")
    func roundsTimeUpToQuarterHour() throws {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = try #require(TimeZone(secondsFromGMT: 0))
        let aligned = try #require(
            calendar.date(
                from: DateComponents(
                    year: 2026,
                    month: 9,
                    day: 1,
                    hour: 10,
                    minute: 30
                )
            )
        )
        let withSeconds = try #require(
            calendar.date(
                from: DateComponents(
                    year: 2026,
                    month: 9,
                    day: 1,
                    hour: 10,
                    minute: 30,
                    second: 1
                )
            )
        )
        let expectedNextQuarter = try #require(
            calendar.date(
                from: DateComponents(
                    year: 2026,
                    month: 9,
                    day: 1,
                    hour: 10,
                    minute: 45
                )
            )
        )

        #expect(
            NativeWeeklyIntentTimeRules.roundedUpToQuarterHour(
                aligned,
                calendar: calendar
            ) == aligned
        )
        #expect(
            NativeWeeklyIntentTimeRules.roundedUpToQuarterHour(
                withSeconds,
                calendar: calendar
            ) == expectedNextQuarter
        )
    }

    @Test("Default windows leave matching lead time and last thirty minutes")
    func providesThirtyMinuteEndTimes() throws {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = try #require(TimeZone(secondsFromGMT: 0))
        let unalignedStart = try #require(
            calendar.date(
                from: DateComponents(
                    year: 2026,
                    month: 9,
                    day: 1,
                    hour: 10,
                    minute: 7
                )
            )
        )
        let expectedStart = try #require(
            calendar.date(
                from: DateComponents(
                    year: 2026,
                    month: 9,
                    day: 1,
                    hour: 10,
                    minute: 45
                )
            )
        )
        let expectedEnd = expectedStart.addingTimeInterval(30 * 60)
        let window = NativeWeeklyIntentTimeRules.defaultWindow(startingAt: unalignedStart)

        #expect(window.startAt == expectedStart)
        #expect(window.endAt == expectedEnd)
        #expect(
            window.startAt.timeIntervalSince(unalignedStart) >=
                NativeWeeklyIntentTimeRules.minimumMatchingLeadTime
        )
        #expect(
            NativeWeeklyIntentTimeRules.minimumEnd(after: expectedStart) == expectedEnd
        )
    }

    @Test("A single YES is saved privately and does not reveal the other decision")
    func recognizesPrivateSavedOpportunityState() throws {
        let opportunity = try JSONDecoder().decode(
            NativeMutualOpportunity.self,
            from: Data(
                #"{"id":"opportunity-1","policyVersion":"MUTUAL_OPPORTUNITY_V1","state":"DECIDED","viewerIntentId":"intent-1","topic":"SPORTS","sportTag":"BADMINTON","sportOtherNote":null,"course":null,"startsAt":"2026-09-01T10:00:00Z","endsAt":"2026-09-01T11:00:00Z","expiresAt":"2026-09-01T09:45:00Z","peer":{"displayName":"Mia","avatarUrl":null,"verifiedStudent":true,"major":null,"semester":null,"sharedLanguages":["ENGLISH"]},"viewerDecision":"YES","coordination":null,"version":2}"#.utf8
            )
        )

        #expect(opportunity.hasPrivateYes)
        #expect(!opportunity.needsViewerDecision)
        #expect(!opportunity.isReadyToCoordinate)
        #expect(opportunity.activityTitle == AppLocalization.string("Badminton"))
        #expect(opportunity.effectiveMatchKind == .exactActivity)
        #expect(opportunity.effectiveViewerTogetherMode == .sameActivity)
        #expect(opportunity.matchTitle == AppLocalization.string("Same activity"))
    }

    @Test("Shared-context opportunities keep both goals and explain the shared setting")
    func decodesSharedContextOpportunity() throws {
        let opportunity = try JSONDecoder().decode(
            NativeMutualOpportunity.self,
            from: Data(
                #"{"id":"opportunity-shared","policyVersion":"MUTUAL_OPPORTUNITY_V1","state":"NEEDS_DECISION","viewerIntentId":"intent-1","topic":"STUDY","sportTag":null,"sportOtherNote":null,"viewerTogetherMode":"PARALLEL","peerTogetherMode":"EITHER","viewerStudyGoal":"Write my thesis","peerStudyGoal":"Review for an exam","matchKind":"SHARED_CONTEXT","sharedContext":"PARALLEL_STUDY","course":null,"startsAt":"2026-09-01T10:00:00Z","endsAt":"2026-09-01T11:00:00Z","expiresAt":"2026-09-01T09:45:00Z","peer":{"displayName":"Mia","avatarUrl":null,"verifiedStudent":true,"major":null,"semester":null,"sharedLanguages":["ENGLISH"]},"viewerDecision":null,"coordination":null,"version":1}"#.utf8
            )
        )

        #expect(opportunity.effectiveMatchKind == .sharedContext)
        #expect(opportunity.viewerStudyGoal == "Write my thesis")
        #expect(opportunity.peerStudyGoal == "Review for an exam")
        #expect(opportunity.viewerStudyGoalTitle == "Write my thesis")
        #expect(opportunity.peerStudyGoalTitle == "Review for an exam")
        #expect(opportunity.effectiveViewerTogetherMode == .parallel)
        #expect(opportunity.effectivePeerTogetherMode == .either)
        #expect(opportunity.matchTitle == AppLocalization.string("Same-place match"))
        #expect(opportunity.matchContextTitle == AppLocalization.string("Library or study space"))
    }

    private func makeIntent(
        timeWindows: [NativeWeeklyIntentTimeWindow]
    ) -> NativeWeeklyIntent {
        let now = Date(timeIntervalSince1970: 10_000)
        return NativeWeeklyIntent(
            id: "intent-1",
            topic: .study,
            activityText: nil,
            sportTag: nil,
            sportOtherNote: nil,
            togetherMode: .sameActivity,
            studyGoal: "Review for an exam",
            courseId: nil,
            course: nil,
            timeWindows: timeWindows,
            timeZone: "Europe/Berlin",
            note: nil,
            status: "ACTIVE",
            policyVersion: 1,
            version: 1,
            expiresAt: now.addingTimeInterval(604_800),
            pausedAt: nil,
            endedAt: nil,
            createdAt: now,
            updatedAt: now
        )
    }

    private func intentJSON(id: String, topic: String) -> String {
        #"{"id":"\#(id)","topic":"\#(topic)","courseId":null,"course":null,"timeWindows":[{"startAt":"2026-09-01T10:00:00Z","endAt":"2026-09-01T11:00:00Z"}],"timeZone":"Europe/Berlin","note":null,"status":"ACTIVE","policyVersion":1,"version":1,"expiresAt":"2026-09-06T21:59:59Z","pausedAt":null,"endedAt":null,"createdAt":"2026-09-01T08:00:00Z","updatedAt":"2026-09-01T08:00:00Z"}"#
    }
}

@Suite("Together matching session")
struct TogetherMatchingSessionTests {
    @Test("Decodes idle, matching, expired, and the empty legacy projection")
    func decodesSessionStates() throws {
        let decoder = JSONDecoder()
        let idle = try decoder.decode(
            NativeTogetherMatchingSession.self,
            from: Data(
                #"{"state":"IDLE","startedAt":null,"matchingUntil":null,"stoppedAt":null,"version":0}"#.utf8
            )
        )
        #expect(idle.state == .idle)
        #expect(!idle.isMatching(at: Date(timeIntervalSince1970: 1)))

        let matching = try decoder.decode(
            NativeTogetherMatchingSession.self,
            from: Data(
                #"{"state":"MATCHING","startedAt":"2026-09-01T10:00:00Z","matchingUntil":"2026-09-03T10:00:00Z","stoppedAt":null,"version":1}"#.utf8
            )
        )
        #expect(matching.state == .matching)
        #expect(matching.isMatching(at: Date(timeIntervalSince1970: 1_788_257_400)))

        let expired = try decoder.decode(
            NativeTogetherMatchingSession.self,
            from: Data(
                #"{"state":"EXPIRED","startedAt":"2026-09-01T10:00:00Z","matchingUntil":"2026-09-03T10:00:00Z","stoppedAt":null,"version":2}"#.utf8
            )
        )
        #expect(expired.state == .expired)
        #expect(!expired.isMatching(at: Date(timeIntervalSince1970: 1_788_257_400)))

        let legacy = try decoder.decode(
            NativeTogetherMatchingSession.self,
            from: Data(#"{}"#.utf8)
        )
        #expect(legacy == .idle)
    }

    @Test("Shows days, hours, and minutes until the active session expires")
    func formatsRemainingTime() {
        let now = Date(timeIntervalSince1970: 2_000_000_000)
        let days = NativeTogetherMatchingSession(
            state: .matching,
            startedAt: now.ISO8601Format(),
            matchingUntil: now.addingTimeInterval(47 * 60 * 60 + 10).ISO8601Format(),
            stoppedAt: nil,
            version: 1
        )
        #expect(
            days.remainingText(at: now) == String(
                format: AppLocalization.string("1 day, %lld hours remaining"),
                Int64(23)
            )
        )

        let hours = NativeTogetherMatchingSession(
            state: .matching,
            startedAt: now.ISO8601Format(),
            matchingUntil: now.addingTimeInterval(8 * 60 * 60 + 59 * 60).ISO8601Format(),
            stoppedAt: nil,
            version: 1
        )
        #expect(
            hours.remainingText(at: now) == String(
                format: AppLocalization.string("%lld hours remaining"),
                Int64(8)
            )
        )

        let minutes = NativeTogetherMatchingSession(
            state: .matching,
            startedAt: now.ISO8601Format(),
            matchingUntil: now.addingTimeInterval(17 * 60 + 1).ISO8601Format(),
            stoppedAt: nil,
            version: 1
        )
        #expect(
            minutes.remainingText(at: now) == String(
                format: AppLocalization.string("%lld minutes remaining"),
                Int64(18)
            )
        )
        #expect(minutes.remainingText(at: now.addingTimeInterval(18 * 60)) == nil)
        #expect(minutes.hasExpired(at: now.addingTimeInterval(18 * 60)))
    }

    @Test("Countdown progress decreases and clamps to the active session")
    func calculatesRemainingFraction() {
        let now = Date(timeIntervalSince1970: 2_000_000_000)
        let session = NativeTogetherMatchingSession(
            state: .matching,
            startedAt: now.ISO8601Format(),
            matchingUntil: now.addingTimeInterval(48 * 60 * 60).ISO8601Format(),
            stoppedAt: nil,
            version: 1
        )

        #expect(session.remainingFraction(at: now) == 1)
        #expect(session.remainingFraction(at: now.addingTimeInterval(24 * 60 * 60)) == 0.5)
        #expect(session.remainingFraction(at: now.addingTimeInterval(48 * 60 * 60)) == nil)
    }

    @Test("Start and stop use bodyless idempotent requests")
    @MainActor
    func startAndStopRequests() async throws {
        let transport = TogetherMatchingSessionTestTransport()
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
            credentialStore: TogetherMatchingMemoryCredentialStore(),
            device: NativeDevice(
                id: "matching-session-device",
                name: "Test iPhone",
                appVersion: "1.0.0",
                platformVersion: "26.5"
            )
        )
        await session.login(identifier: "test_001", password: "Password123")
        let store = TogetherMatchingSessionStore()

        await store.load(using: session)
        #expect(store.session.state == .idle)
        #expect(await store.start(using: session))
        #expect(store.session.state == .matching)
        #expect(await store.stop(using: session))
        #expect(store.session.state == .idle)

        let requests = await transport.matchingRequests()
        #expect(requests.map(\.method) == ["GET", "POST", "DELETE"])
        #expect(requests.map(\.bodyByteCount) == [0, 0, 0])
        #expect(requests[0].idempotencyKey == nil)
        #expect(requests[1].idempotencyKey?.isEmpty == false)
        #expect(requests[2].idempotencyKey?.isEmpty == false)
    }
}

private actor CourseListMemoryCredentialStore: CredentialStore {
    private var token: String?

    func refreshToken() -> String? { token }
    func save(refreshToken: String) { token = refreshToken }
    func clear() { token = nil }
}

private actor TogetherMatchingMemoryCredentialStore: CredentialStore {
    private var token: String?

    func refreshToken() -> String? { token }
    func save(refreshToken: String) { token = refreshToken }
    func clear() { token = nil }
}

private struct TogetherMatchingRequestRecord: Sendable {
    let method: String
    let bodyByteCount: Int
    let idempotencyKey: String?
}

private actor TogetherMatchingSessionTestTransport: APITransport {
    private var requests: [TogetherMatchingRequestRecord] = []

    func matchingRequests() -> [TogetherMatchingRequestRecord] {
        requests
    }

    func data(for request: URLRequest) async throws -> (Data, URLResponse) {
        switch request.url?.path {
        case "/api/v1/auth/login":
            return response(
                for: request,
                status: 200,
                body: #"{"data":{"user":{"id":"user-1","username":"test_001","nickname":"Test User","gender":"UNSPECIFIED","onboardingComplete":true,"isGuest":false,"verifiedStudent":true,"studentVerificationStatus":"VERIFIED","locale":"en"},"tokens":{"accessToken":"access-token","accessExpiresIn":900,"refreshToken":"refresh-token","refreshExpiresAt":"2026-09-16T00:00:00.000Z"}}}"#
            )
        case "/api/v1/me/together-matching-session":
            let method = request.httpMethod ?? "GET"
            requests.append(
                TogetherMatchingRequestRecord(
                    method: method,
                    bodyByteCount: request.httpBody?.count ?? 0,
                    idempotencyKey: request.value(forHTTPHeaderField: "Idempotency-Key")
                )
            )
            let body: String
            switch method {
            case "POST":
                body = #"{"data":{"state":"MATCHING","startedAt":"2026-09-01T10:00:00Z","matchingUntil":"2026-09-03T10:00:00Z","stoppedAt":null,"version":1}}"#
            case "DELETE":
                body = #"{"data":{"state":"IDLE","startedAt":"2026-09-01T10:00:00Z","matchingUntil":"2026-09-03T10:00:00Z","stoppedAt":"2026-09-01T10:10:00Z","version":2}}"#
            default:
                body = #"{"data":{"state":"IDLE","startedAt":null,"matchingUntil":null,"stoppedAt":null,"version":0}}"#
            }
            return response(for: request, status: 200, body: body)
        default:
            return response(
                for: request,
                status: 404,
                body: #"{"error":{"code":"NOT_FOUND","message":"Missing","field":null,"retryable":false,"requestId":"request-1"}}"#
            )
        }
    }

    private func response(
        for request: URLRequest,
        status: Int,
        body: String
    ) -> (Data, URLResponse) {
        let response = HTTPURLResponse(
            url: request.url!,
            statusCode: status,
            httpVersion: "HTTP/1.1",
            headerFields: ["Content-Type": "application/json"]
        )!
        return (Data(body.utf8), response)
    }
}

private actor CourseListTestTransport: APITransport {
    private var failingScopes: Set<String> = []

    func setFailingScopes(_ scopes: Set<String>) {
        failingScopes = scopes
    }

    func data(for request: URLRequest) async throws -> (Data, URLResponse) {
        switch request.url?.path {
        case "/api/v1/auth/login":
            return response(
                for: request,
                status: 200,
                body: #"{"data":{"user":{"id":"user-1","username":"test_001","nickname":"Test User","gender":"UNSPECIFIED","onboardingComplete":true,"isGuest":false,"verifiedStudent":true,"studentVerificationStatus":"VERIFIED","locale":"en"},"tokens":{"accessToken":"access-token","accessExpiresIn":900,"refreshToken":"refresh-token","refreshExpiresAt":"2026-08-16T00:00:00.000Z"}}}"#
            )
        case "/api/v1/courses":
            let components = URLComponents(url: request.url!, resolvingAgainstBaseURL: false)
            let scope = components?.queryItems?.first(where: { $0.name == "scope" })?.value ?? "popular"
            if failingScopes.contains(scope) {
                return response(
                    for: request,
                    status: 503,
                    body: #"{"error":{"code":"UNAVAILABLE","message":"Try again","field":null,"retryable":true,"requestId":"request-1"}}"#
                )
            }
            return response(
                for: request,
                status: 200,
                body: #"{"data":{"school":"TUM","semesterLabel":"SS 2026","scope":"\#(scope)","query":"","schools":[],"courses":[{"id":"course-1","code":"IN2346","name":"Deep Learning","instructorSummary":null,"school":"TUM","semesterLabel":"SS 2026","memberCount":3,"viewer":{"enrolled":false,"saved":false},"sessions":[]}],"nextCursor":null,"semesterReview":null}}"#
            )
        default:
            return response(
                for: request,
                status: 404,
                body: #"{"error":{"code":"NOT_FOUND","message":"Missing","field":null,"retryable":false,"requestId":"request-1"}}"#
            )
        }
    }

    private func response(
        for request: URLRequest,
        status: Int,
        body: String
    ) -> (Data, URLResponse) {
        let response = HTTPURLResponse(
            url: request.url!,
            statusCode: status,
            httpVersion: "HTTP/1.1",
            headerFields: ["Content-Type": "application/json"]
        )!
        return (Data(body.utf8), response)
    }
}
