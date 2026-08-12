import Foundation
import Testing
@testable import SideSeat

@Suite("Calendar smart add")
struct CalendarSmartAddStoreTests {
    @Test("Voice transcript keeps existing event details")
    func mergesVoiceTranscript() {
        #expect(
            CalendarVoiceTranscript.merge(
                prefix: "Lunch with Lin tomorrow",
                transcript: "at twelve thirty"
            ) == "Lunch with Lin tomorrow at twelve thirty"
        )
        #expect(CalendarVoiceTranscript.merge(prefix: "", transcript: "  Friday at nine  ") == "Friday at nine")
        #expect(CalendarVoiceTranscript.merge(prefix: "Monday", transcript: "") == "Monday")
    }

    @Test("Voice startup is non-reentrant and can be cancelled while audio prepares")
    @MainActor
    func voiceStartupCanBeCancelled() async {
        let audio = CalendarVoiceTestAudioController(startDelay: .milliseconds(200))
        let input = CalendarVoiceInput(
            permissionProvider: CalendarVoiceAllowedPermissionProvider(),
            audioController: audio
        )

        let startTask = Task { @MainActor in
            await input.start(locale: Locale(identifier: "en-US"))
        }
        await waitForVoiceTestCondition { await audio.startCount == 1 }

        #expect(input.isStarting)
        await input.start(locale: Locale(identifier: "en-US"))
        #expect(await audio.startCount == 1)

        startTask.cancel()
        input.stop()
        await startTask.value
        await waitForVoiceTestCondition { await audio.stopCount > 0 }

        #expect(!input.isActive)
        #expect(await audio.stopCount > 0)
    }

    @Test("Voice recognition publishes text and closes after a final result")
    @MainActor
    func voiceRecognitionFinishesCleanly() async {
        let audio = CalendarVoiceTestAudioController()
        let input = CalendarVoiceInput(
            permissionProvider: CalendarVoiceAllowedPermissionProvider(),
            audioController: audio
        )

        await input.start(locale: Locale(identifier: "en-US"))
        #expect(input.isRecording)

        await audio.send(
            CalendarVoiceRecognitionUpdate(
                transcript: "Lunch tomorrow at twelve",
                isFinal: true,
                errorDescription: nil
            )
        )
        await waitForVoiceTestCondition { !input.isActive }

        #expect(input.transcript == "Lunch tomorrow at twelve")
        #expect(!input.isActive)
    }

    @Test("A stale voice cleanup cannot stop a newer recording")
    @MainActor
    func staleVoiceCleanupIsIgnored() async {
        let audio = CalendarVoiceTestAudioController(startDelay: .milliseconds(120))
        let input = CalendarVoiceInput(
            permissionProvider: CalendarVoiceAllowedPermissionProvider(),
            audioController: audio
        )

        let firstStart = Task { @MainActor in
            await input.start(locale: Locale(identifier: "en-US"))
        }
        await waitForVoiceTestCondition { await audio.startCount == 1 }
        input.stop()

        let secondStart = Task { @MainActor in
            await input.start(locale: Locale(identifier: "en-US"))
        }
        await waitForVoiceTestCondition { await audio.startCount == 2 }
        await firstStart.value
        await secondStart.value

        #expect(input.isRecording)
        #expect(await audio.activeSessionID != nil)
        input.stop()
    }

    @Test("Timetable OCR extracts course searches and ranks exact course codes")
    func timetableScreenshotMatching() throws {
        let lines = [
            "Tuesday 10:00 IN2346 Introduction to Deep Learning",
            "Room 01.07.023",
            "Computer Vision Thursday 14:00"
        ]
        let terms = CourseScreenshotText.searchTerms(from: lines)
        #expect(terms.contains("IN2346"))
        #expect(terms.contains(where: { $0.localizedCaseInsensitiveContains("Introduction to Deep Learning") }))
        #expect(terms.contains(where: { $0.localizedCaseInsensitiveContains("Computer Vision") }))

        let course = NativeCourseSummary(
            id: "course-1",
            code: "IN2346",
            name: "Introduction to Deep Learning",
            instructorSummary: nil,
            school: "TUM",
            semesterLabel: "SS 2026",
            memberCount: 0,
            viewer: NativeCourseViewerState(enrolled: false, saved: false),
            sessions: []
        )
        let result = CourseScreenshotText.score(course: course, lines: lines)
        #expect(result.score == 1)
        #expect(result.evidence == lines[0])
    }

    @Test("Timetable OCR punctuation cannot create an empty exact match")
    func timetableScreenshotRejectsEmptyNormalizedEvidence() {
        let course = NativeCourseSummary(
            id: "course-noisy",
            code: "---",
            name: "Introduction to Deep Learning",
            instructorSummary: nil,
            school: "TUM",
            semesterLabel: "SS 2026",
            memberCount: 0,
            viewer: NativeCourseViewerState(enrolled: false, saved: false),
            sessions: []
        )

        let result = CourseScreenshotText.score(
            course: course,
            lines: ["---", "•••", "10:00"]
        )

        #expect(result.score == 0)
    }

    @Test("Parses drafts, updates their calendar and saves one idempotent batch")
    @MainActor
    func parseAndSave() async throws {
        let transport = CalendarSmartAddTestTransport()
        let session = makeSession(transport: transport)
        await session.login(identifier: "test_001", password: "Password123")
        let store = CalendarSmartAddStore()

        await store.parse(text: "Tomorrow at 3", locale: "en", using: session)
        let draft = try #require(store.drafts.first)
        #expect(await transport.parseText == "Tomorrow at 3")
        #expect(await transport.parseLocale == "en")
        #expect(draft.title == "Library study")
        #expect(store.warnings == ["Check time"])

        store.setCategory("category-2", for: draft.id)
        #expect(store.drafts.first?.categoryId == "category-2")
        #expect(await store.save(using: session))
        #expect(await transport.savedTitles == ["Library study"])
        #expect(await transport.savedCategoryIDs == ["category-2"])
        #expect(await transport.idempotencyKey?.isEmpty == false)
    }

    @MainActor
    private func makeSession(transport: CalendarSmartAddTestTransport) -> SessionStore {
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
            credentialStore: CalendarSmartAddMemoryCredentialStore(),
            device: NativeDevice(
                id: "calendar-smart-add-device",
                name: "Test iPhone",
                appVersion: "1.0.0",
                platformVersion: "26.5"
            )
        )
    }
}

private struct CalendarVoiceAllowedPermissionProvider: CalendarVoicePermissionProviding {
    func requestSpeechPermission() async -> Bool { true }
    func requestMicrophonePermission() async -> Bool { true }
}

private actor CalendarVoiceTestAudioController: CalendarVoiceAudioControlling {
    private let startDelay: Duration
    private var onUpdate: (@Sendable (CalendarVoiceRecognitionUpdate) -> Void)?
    private(set) var startCount = 0
    private(set) var stopCount = 0
    private(set) var activeSessionID: UUID?

    init(startDelay: Duration = .zero) {
        self.startDelay = startDelay
    }

    func start(
        sessionID: UUID,
        locale: Locale,
        onUpdate: @escaping @Sendable (CalendarVoiceRecognitionUpdate) -> Void
    ) async throws {
        _ = locale
        startCount += 1
        activeSessionID = sessionID
        self.onUpdate = onUpdate
        if startDelay > .zero {
            try await Task.sleep(for: startDelay)
        }
    }

    func stop(sessionID: UUID, cancelTask: Bool) async {
        _ = cancelTask
        guard activeSessionID == sessionID else { return }
        activeSessionID = nil
        stopCount += 1
    }

    func send(_ update: CalendarVoiceRecognitionUpdate) {
        onUpdate?(update)
    }
}

@MainActor
private func waitForVoiceTestCondition(
    _ condition: @escaping @MainActor () async -> Bool
) async {
    for _ in 0..<100 {
        if await condition() { return }
        try? await Task.sleep(for: .milliseconds(5))
    }
}

private actor CalendarSmartAddMemoryCredentialStore: CredentialStore {
    private var token: String?

    func refreshToken() -> String? { token }
    func save(refreshToken: String) { token = refreshToken }
    func clear() { token = nil }
}

private actor CalendarSmartAddTestTransport: APITransport {
    private(set) var parseText: String?
    private(set) var parseLocale: String?
    private(set) var savedTitles: [String] = []
    private(set) var savedCategoryIDs: [String?] = []
    private(set) var idempotencyKey: String?

    func data(for request: URLRequest) async throws -> (Data, URLResponse) {
        switch request.url?.path {
        case "/api/v1/auth/login":
            return response(
                for: request,
                status: 200,
                body: #"{"data":{"user":{"id":"user-1","username":"test_001","nickname":"Test User","gender":"UNSPECIFIED","onboardingComplete":true,"isGuest":false,"verifiedStudent":true,"studentVerificationStatus":"VERIFIED","locale":"en"},"tokens":{"accessToken":"access-token","accessExpiresIn":900,"refreshToken":"refresh-token","refreshExpiresAt":"2026-08-16T00:00:00.000Z"}}}"#
            )
        case "/api/v1/calendar/parse-natural":
            let body = try #require(request.httpBody)
            let json = try #require(JSONSerialization.jsonObject(with: body) as? [String: String])
            parseText = json["text"]
            parseLocale = json["locale"]
            return response(
                for: request,
                status: 200,
                body: #"{"data":{"events":[{"title":"Library study","location":"Main Library","note":"","startAt":"2026-07-18T15:00:00.000Z","endAt":"2026-07-18T16:00:00.000Z","repeat":"NONE","repeatUntil":"","categoryId":"category-1","categoryPreset":"study"}],"warnings":["Check time"]}}"#
            )
        case "/api/v1/calendar/events/batch":
            let body = try #require(request.httpBody)
            let json = try #require(JSONSerialization.jsonObject(with: body) as? [String: Any])
            let events = try #require(json["events"] as? [[String: Any]])
            savedTitles = events.compactMap { $0["title"] as? String }
            savedCategoryIDs = events.map { $0["categoryId"] as? String }
            idempotencyKey = request.value(forHTTPHeaderField: "Idempotency-Key")
            return response(
                for: request,
                status: 201,
                body: #"{"data":{"count":1,"events":1}}"#
            )
        default:
            return response(
                for: request,
                status: 404,
                body: #"{"error":{"code":"NOT_FOUND","message":"Missing","retryable":false,"requestId":"request-1"}}"#
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
