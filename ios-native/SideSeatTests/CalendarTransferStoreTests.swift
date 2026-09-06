import Foundation
import Testing
@testable import SideSeat

@Suite("Calendar ICS transfer")
struct CalendarTransferStoreTests {
    @Test("Import sends the full calendar with an idempotency key")
    @MainActor
    func importIsIdempotent() async throws {
        let transport = CalendarTransferTestTransport()
        let session = makeSession(transport: transport)
        await session.login(identifier: "test_001", password: "Password123")
        let store = CalendarTransferStore()
        let ics = "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nEND:VCALENDAR\r\n"

        #expect(await store.importICS(ics, using: session))
        #expect(await transport.importedICS == ics)
        #expect(await transport.importIdempotencyKey?.isEmpty == false)
        #expect(store.message?.contains("1") == true)
        #expect(store.message?.contains("2") == true)
    }

    @Test("Export returns a writable iCalendar document")
    @MainActor
    func exportDocument() async throws {
        let transport = CalendarTransferTestTransport()
        let session = makeSession(transport: transport)
        await session.login(identifier: "test_001", password: "Password123")
        let store = CalendarTransferStore()

        let exported = try #require(await store.prepareExport(year: 2028, using: session))
        #expect(exported.filename == "sideseat-schedule-2028.ics")
        #expect(exported.mediaType == "text/calendar; charset=utf-8")
        #expect(exported.ics.contains("BEGIN:VCALENDAR"))
        #expect(CalendarICSFileDocument(ics: exported.ics).ics == exported.ics)
        #expect(await transport.exportYear == "2028")
    }

    @Test("Export years default to the Berlin Gregorian year")
    func exportYearOptions() throws {
        var calendar = Calendar(identifier: .gregorian)
        let timeZone = try #require(TimeZone(secondsFromGMT: 0))
        calendar.timeZone = timeZone
        let date = try #require(
            calendar.date(from: DateComponents(year: 2026, month: 8, day: 29))
        )

        let currentYear = CalendarExportYearOptions.currentYear(
            on: date,
            timeZone: timeZone
        )

        #expect(currentYear == 2026)
        #expect(CalendarExportYearOptions.supportedYears.lowerBound == 2000)
        #expect(CalendarExportYearOptions.supportedYears.upperBound == 2100)

        let berlinNewYear = try #require(
            calendar.date(
                from: DateComponents(
                    year: 2026,
                    month: 12,
                    day: 31,
                    hour: 23,
                    minute: 30
                )
            )
        )
        let losAngeles = try #require(TimeZone(identifier: "America/Los_Angeles"))
        #expect(CalendarExportYearOptions.currentYear(on: berlinNewYear) == 2027)
        #expect(
            CalendarExportYearOptions.currentYear(
                on: berlinNewYear,
                timeZone: losAngeles
            ) == 2026
        )
    }

    @Test("Calendar connections load, create, and revoke with idempotency keys")
    @MainActor
    func calendarConnectionsLifecycle() async throws {
        let transport = CalendarTransferTestTransport()
        let session = makeSession(transport: transport)
        await session.login(identifier: "test_001", password: "Password123")
        let store = CalendarConnectionStore()

        await store.load(using: session)
        #expect(store.connections.map(\.id) == ["connection-existing"])

        let subscriptionURL = try #require(await store.create(using: session))
        #expect(subscriptionURL.scheme == "https")
        #expect(subscriptionURL.path.hasSuffix(".ics"))
        #expect(store.connections.first?.id == "connection-new")
        #expect(await transport.createIdempotencyKey?.isEmpty == false)

        let created = try #require(store.connections.first)
        #expect(await store.revoke(created, using: session))
        #expect(!store.connections.contains { $0.id == created.id })
        #expect(await transport.revokeIdempotencyKey?.isEmpty == false)
    }

    @Test("Apple Calendar links are validated and converted without losing their token")
    func appleCalendarLinkConversion() throws {
        let source = try #require(
            CalendarSubscriptionLink.validatedHTTPSURL(
                from: "https://www.sideseat.de/api/public/calendar-subscriptions/private-token.ics?source=ios"
            )
        )
        let appleCalendarURL = try #require(
            CalendarSubscriptionLink.appleCalendarURL(from: source)
        )

        #expect(appleCalendarURL.scheme == "webcal")
        #expect(appleCalendarURL.host == "www.sideseat.de")
        #expect(appleCalendarURL.path.hasSuffix("private-token.ics"))
        #expect(appleCalendarURL.query == "source=ios")
    }

    @Test("Calendar subscription links must be absolute secure URLs")
    func rejectsUnsafeCalendarLinks() {
        #expect(CalendarSubscriptionLink.validatedHTTPSURL(from: "private-token.ics") == nil)
        #expect(
            CalendarSubscriptionLink.validatedHTTPSURL(
                from: "http://www.sideseat.de/private-token.ics"
            ) == nil
        )
        #expect(
            CalendarSubscriptionLink.validatedHTTPSURL(
                from: "https://user:password@www.sideseat.de/private-token.ics"
            ) == nil
        )
    }

    @Test("An invalid subscription response is surfaced without adding a connection")
    @MainActor
    func invalidCalendarSubscriptionResponse() async {
        let transport = CalendarTransferTestTransport(subscriptionURL: "private-token.ics")
        let session = makeSession(transport: transport)
        await session.login(identifier: "test_001", password: "Password123")
        let store = CalendarConnectionStore()

        #expect(await store.create(using: session) == nil)
        #expect(store.connections.isEmpty)
        #expect(store.latestSubscriptionURL == nil)
        #expect(store.issue?.isEmpty == false)
    }

    @MainActor
    private func makeSession(transport: CalendarTransferTestTransport) -> SessionStore {
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
            credentialStore: CalendarTransferMemoryCredentialStore(),
            device: NativeDevice(
                id: "calendar-transfer-device",
                name: "Test iPhone",
                appVersion: "1.0.0",
                platformVersion: "26.5"
            )
        )
    }
}

@Suite("Schedule share proposal time")
struct ScheduleShareProposalTimeTests {
    @Test("Selecting a free window creates a snapped 90 minute proposal")
    func createsDefaultSubrange() throws {
        let bounds = NativeScheduleShareSlot(
            start: "2026-08-10T08:10:00.000Z",
            end: "2026-08-10T14:00:00.000Z"
        )

        let now = try #require(Date.sideSeatChatISO8601("2026-08-10T06:00:00.000Z"))
        let selection = try #require(ScheduleShareProposalTime.initialSelection(in: bounds, now: now))

        #expect(selection.start == Date.sideSeatChatISO8601("2026-08-10T08:30:00.000Z"))
        #expect(selection.end == Date.sideSeatChatISO8601("2026-08-10T10:00:00.000Z"))
        #expect(selection.bounds == bounds)
    }

    @Test("Changing the start preserves duration without leaving the free window")
    func clampsEditedRange() throws {
        let bounds = NativeScheduleShareSlot(
            start: "2026-08-10T08:00:00.000Z",
            end: "2026-08-10T11:00:00.000Z"
        )
        let now = try #require(Date.sideSeatChatISO8601("2026-08-10T06:00:00.000Z"))
        let original = try #require(ScheduleShareProposalTime.initialSelection(in: bounds, now: now))
        let requestedStart = try #require(Date.sideSeatChatISO8601("2026-08-10T10:30:00.000Z"))

        let updated = ScheduleShareProposalTime.updatingStart(original, to: requestedStart)

        #expect(updated.start == requestedStart)
        #expect(updated.end == Date.sideSeatChatISO8601("2026-08-10T11:00:00.000Z"))
        #expect(ScheduleShareProposalTime.fits(start: updated.start, end: updated.end, in: bounds))
    }

    @Test("A proposal cannot exceed four hours")
    func rejectsOversizedRange() throws {
        let bounds = NativeScheduleShareSlot(
            start: "2026-08-10T08:00:00.000Z",
            end: "2026-08-10T22:00:00.000Z"
        )
        let start = try #require(Date.sideSeatChatISO8601("2026-08-10T08:00:00.000Z"))
        let end = try #require(Date.sideSeatChatISO8601("2026-08-10T13:00:00.000Z"))

        #expect(ScheduleShareProposalTime.selection(in: bounds, start: start, end: end) == nil)
    }

    @Test("A proposal can cross midnight inside one continuous free window")
    func acceptsCrossMidnightRange() throws {
        let bounds = NativeScheduleShareSlot(
            start: "2026-08-10T20:00:00.000Z",
            end: "2026-08-11T03:00:00.000Z"
        )
        let start = try #require(Date.sideSeatChatISO8601("2026-08-10T21:00:00.000Z"))
        let end = try #require(Date.sideSeatChatISO8601("2026-08-11T00:00:00.000Z"))

        let selection = ScheduleShareProposalTime.selection(in: bounds, start: start, end: end)

        #expect(selection?.start == start)
        #expect(selection?.end == end)
    }

    @Test("A full-day free window defaults to a daytime suggestion")
    func fullDayWindowUsesDaytimeDefault() throws {
        let bounds = NativeScheduleShareSlot(
            start: "2026-08-09T22:00:00.000Z",
            end: "2026-08-10T22:00:00.000Z"
        )

        let now = try #require(Date.sideSeatChatISO8601("2026-08-09T12:00:00.000Z"))
        let selection = try #require(ScheduleShareProposalTime.initialSelection(in: bounds, now: now))

        #expect(selection.start == Date.sideSeatChatISO8601("2026-08-10T07:00:00.000Z"))
        #expect(selection.end == Date.sideSeatChatISO8601("2026-08-10T08:30:00.000Z"))
    }

    @Test("An active free window starts at the next half hour")
    func activeWindowStartsNearNow() throws {
        let bounds = NativeScheduleShareSlot(
            start: "2026-08-10T08:00:00.000Z",
            end: "2026-08-10T14:00:00.000Z"
        )
        let now = try #require(Date.sideSeatChatISO8601("2026-08-10T09:07:00.000Z"))

        let selection = try #require(ScheduleShareProposalTime.initialSelection(in: bounds, now: now))

        #expect(selection.start == Date.sideSeatChatISO8601("2026-08-10T09:30:00.000Z"))
        #expect(selection.end == Date.sideSeatChatISO8601("2026-08-10T11:00:00.000Z"))
    }
}

@Suite("Schedule share candidate recommendations")
struct ScheduleShareCandidateRecommendationTests {
    @Test("Builds concrete one-hour candidates instead of returning whole free windows")
    func buildsConcreteCandidates() throws {
        let slots = [
            NativeScheduleShareSlot(
                start: "2026-08-10T07:00:00.000Z",
                end: "2026-08-10T19:00:00.000Z"
            ),
            NativeScheduleShareSlot(
                start: "2026-08-11T07:00:00.000Z",
                end: "2026-08-11T19:00:00.000Z"
            ),
            NativeScheduleShareSlot(
                start: "2026-08-12T07:00:00.000Z",
                end: "2026-08-12T19:00:00.000Z"
            ),
        ]

        let candidates = ScheduleShareCandidateRecommendations.candidates(from: slots)

        #expect(candidates.count == 5)
        #expect(candidates.allSatisfy { $0.end.timeIntervalSince($0.start) == 3_600 })
        let grouped = Dictionary(grouping: candidates) {
            Calendar.sideSeatBerlin.startOfDay(for: $0.start)
        }
        #expect(grouped.values.allSatisfy { $0.count <= 2 })
    }

    @Test("Recommendations exclude overnight hours even for legacy full-day links")
    func excludesOvernightHours() {
        let slots = [
            NativeScheduleShareSlot(
                start: "2026-08-09T22:00:00.000Z",
                end: "2026-08-10T22:00:00.000Z"
            ),
        ]

        let candidates = ScheduleShareCandidateRecommendations.candidates(from: slots)

        #expect(!candidates.isEmpty)
        #expect(candidates.allSatisfy {
            let hour = Calendar.sideSeatBerlin.component(.hour, from: $0.start)
            return hour >= 9 && hour < 21
        })
    }
}

private actor CalendarTransferMemoryCredentialStore: CredentialStore {
    private var token: String?

    func refreshToken() -> String? { token }
    func save(refreshToken: String) { token = refreshToken }
    func clear() { token = nil }
}

private actor CalendarTransferTestTransport: APITransport {
    private(set) var importedICS: String?
    private(set) var importIdempotencyKey: String?
    private(set) var exportYear: String?
    private(set) var createIdempotencyKey: String?
    private(set) var revokeIdempotencyKey: String?
    private let subscriptionURL: String

    init(
        subscriptionURL: String = "https://www.sideseat.de/api/public/calendar-subscriptions/private-token-abcdefghijklmnopqrstuvwxyz.ics"
    ) {
        self.subscriptionURL = subscriptionURL
    }

    func data(for request: URLRequest) async throws -> (Data, URLResponse) {
        switch request.url?.path {
        case "/api/v1/auth/login":
            return response(
                for: request,
                status: 200,
                body: #"{"data":{"user":{"id":"user-1","username":"test_001","nickname":"Test User","gender":"UNSPECIFIED","onboardingComplete":true,"isGuest":false,"verifiedStudent":true,"studentVerificationStatus":"VERIFIED","locale":"en"},"tokens":{"accessToken":"access-token","accessExpiresIn":900,"refreshToken":"refresh-token","refreshExpiresAt":"2026-08-16T00:00:00.000Z"}}}"#
            )
        case "/api/v1/calendar/import":
            let body = try #require(request.httpBody)
            importedICS = try JSONDecoder().decode(NativeCalendarIcsImportRequest.self, from: body).ics
            importIdempotencyKey = request.value(forHTTPHeaderField: "Idempotency-Key")
            return response(
                for: request,
                status: 201,
                body: #"{"data":{"imported":1,"skipped":2}}"#
            )
        case "/api/v1/calendar/export":
            exportYear = URLComponents(url: request.url!, resolvingAgainstBaseURL: false)?
                .queryItems?
                .first { $0.name == "year" }?
                .value
            let responseYear = exportYear ?? "current"
            return response(
                for: request,
                status: 200,
                body: #"{"data":{"filename":"sideseat-schedule-"#
                    + responseYear
                    + #".ics","mediaType":"text/calendar; charset=utf-8","ics":"BEGIN:VCALENDAR\r\nVERSION:2.0\r\nEND:VCALENDAR\r\n"}}"#
            )
        case "/api/v1/calendar/subscriptions":
            if request.httpMethod == "POST" {
                createIdempotencyKey = request.value(forHTTPHeaderField: "Idempotency-Key")
                return response(
                    for: request,
                    status: 201,
                    body: #"{"data":{"connection":{"id":"connection-new","label":"Apple Calendar","createdAt":"2026-08-29T18:00:00.000Z","lastAccessedAt":null},"subscriptionUrl":"\#(subscriptionURL)"}}"#
                )
            }
            return response(
                for: request,
                status: 200,
                body: #"{"data":{"connections":[{"id":"connection-existing","label":"Apple Calendar","createdAt":"2026-08-28T18:00:00.000Z","lastAccessedAt":"2026-08-29T09:00:00.000Z"}]}}"#
            )
        case "/api/v1/calendar/subscriptions/connection-new":
            revokeIdempotencyKey = request.value(forHTTPHeaderField: "Idempotency-Key")
            return response(
                for: request,
                status: 200,
                body: #"{"data":{"id":"connection-new","revoked":true}}"#
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
