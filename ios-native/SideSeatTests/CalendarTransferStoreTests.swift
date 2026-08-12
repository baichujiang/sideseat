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

        let exported = try #require(await store.prepareExport(using: session))
        #expect(exported.filename == "sideseat-schedule.ics")
        #expect(exported.mediaType == "text/calendar; charset=utf-8")
        #expect(exported.ics.contains("BEGIN:VCALENDAR"))
        #expect(CalendarICSFileDocument(ics: exported.ics).ics == exported.ics)
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

        #expect(selection.start == Date.sideSeatChatISO8601("2026-08-10T06:00:00.000Z"))
        #expect(selection.end == Date.sideSeatChatISO8601("2026-08-10T07:30:00.000Z"))
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

private actor CalendarTransferMemoryCredentialStore: CredentialStore {
    private var token: String?

    func refreshToken() -> String? { token }
    func save(refreshToken: String) { token = refreshToken }
    func clear() { token = nil }
}

private actor CalendarTransferTestTransport: APITransport {
    private(set) var importedICS: String?
    private(set) var importIdempotencyKey: String?

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
            return response(
                for: request,
                status: 200,
                body: #"{"data":{"filename":"sideseat-schedule.ics","mediaType":"text/calendar; charset=utf-8","ics":"BEGIN:VCALENDAR\r\nVERSION:2.0\r\nEND:VCALENDAR\r\n"}}"#
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
