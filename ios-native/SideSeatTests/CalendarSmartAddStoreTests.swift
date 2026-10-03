import Foundation
import Testing
import UIKit
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
        #expect(store.originalText == "Tomorrow at 3")
        #expect(await transport.savedTitles.isEmpty)

        var editedDraft = draft
        editedDraft.title = "Updated library study"
        editedDraft.endAt = "2026-07-18T15:20:00.000Z"
        editedDraft.location = "Quiet room"
        editedDraft.note = "Bring notes"
        editedDraft.repeatRule = "WEEKLY"
        editedDraft.repeatUntil = "2026-09-18T16:00:00.000Z"
        editedDraft.categoryId = "category-2"
        store.updateDraft(editedDraft)
        #expect(store.drafts.first?.categoryId == "category-2")
        #expect(store.drafts.first?.title == "Updated library study")
        #expect(store.drafts.first?.repeatRule == "WEEKLY")
        #expect(await store.save(using: session))
        #expect(await transport.savedTitles == ["Updated library study"])
        #expect(await transport.savedEnds == ["2026-07-18T15:20:00.000Z"], "EX-13: explicit edits outrank defaults")
        #expect(await transport.savedCategoryIDs == ["category-2"])
        #expect(await transport.idempotencyKey?.isEmpty == false)

        store.removeDraft(withID: draft.id)
        #expect(store.drafts.isEmpty)
    }

    @Test("SI-08: offline parse yields a basic editable draft; failed save preserves it and the full input")
    @MainActor
    func offlineDraftAndFailedSave() async throws {
        let transport = CalendarSmartAddTestTransport(parseUnavailable: true, saveUnavailable: true)
        let session = makeSession(transport: transport)
        await session.login(identifier: "test_001", password: "Password123")
        let store = CalendarSmartAddStore()
        let now = try #require(ISO8601DateFormatter().date(from: "2026-10-03T12:12:00Z"))
        let source = String(repeating: "办事", count: 100)
        await store.parse(text: source, locale: "zh-CN", using: session, referenceTime: now)
        let draft = try #require(store.drafts.first)
        #expect(store.issue == nil)
        #expect(store.originalText == source)
        #expect(draft.title.utf16.count == 120)
        #expect(draft.startAt == "2026-10-03T12:30:00Z")
        #expect(draft.endAt == "2026-10-03T13:00:00Z")
        #expect(draft.location.isEmpty && draft.note.isEmpty)
        #expect(await transport.savedTitles.isEmpty)
        #expect(await store.save(using: session) == false)
        #expect(store.issue != nil)
        #expect(store.drafts.first?.id == draft.id)
        #expect(store.originalText == source)
    }

    @Test("SI-04/SI-05: shared fallback durations and strict next boundary")
    func sharedFallbackPolicy() throws {
        let now = try #require(ISO8601DateFormatter().date(from: "2026-10-03T21:50:00Z"))
        for (text, minutes) in [("取充电线", 15), ("开会", 60), ("学习", 60), ("办事", 30)] {
            let draft = CalendarSmartInputDefaults.shared.basicDraft(text: text, referenceTime: now)
            #expect(draft.startAt == "2026-10-03T22:00:00Z")
            let start = try #require(ISO8601DateFormatter().date(from: draft.startAt))
            let end = try #require(ISO8601DateFormatter().date(from: draft.endAt))
            #expect(end.timeIntervalSince(start) == Double(minutes * 60))
        }
        let boundary = try #require(ISO8601DateFormatter().date(from: "2026-10-03T12:30:00Z"))
        #expect(CalendarSmartInputDefaults.shared.basicDraft(text: "办事", referenceTime: boundary).startAt == "2026-10-03T13:00:00Z")
    }

    @Test("Image OCR preserves event titles and times, and only reviewed text reaches parsing")
    @MainActor
    func imageTextFlowsThroughExistingParser() async throws {
        let image = makeTextImage("Library study\nOctober 9, 2026 14:00-16:00\nMain Library\nYoga\nOctober 10, 2026 18:00-19:00")
        let result = try await CalendarImageInput.recognize(in: image)
        #expect(result.text.contains("Library study"))
        #expect(result.text.contains("14:00"))
        #expect(result.text.contains("Yoga"))
        #expect(result.text.contains("18:00"))
        #expect(UIImage(data: result.previewData) != nil)
        let combined = CalendarImageInput.appending(result.text, to: "Bring my notes")
        #expect(combined.hasPrefix("Bring my notes\n\n"))

        let transport = CalendarSmartAddTestTransport()
        let session = makeSession(transport: transport)
        await session.login(identifier: "test_001", password: "Password123")
        let store = CalendarSmartAddStore()
        #expect(await transport.parseText == nil, "Recognizing an image does not call the model")
        await store.parse(text: combined, locale: "en", using: session)
        #expect(await transport.parseText == combined)
        #expect(await transport.parseBodyKeys == ["locale", "text"], "The source image never leaves the device")
        #expect(store.drafts.count == 1)
        #expect(await transport.savedTitles.isEmpty)
        #expect(await store.save(using: session))
        #expect(await transport.savedTitles == ["Library study"])
    }

    @Test("Blank and invalid images cannot silently become event text")
    @MainActor
    func imageWithoutText() async {
        for data in [makeTextImage(""), Data("not an image".utf8)] {
            do {
                _ = try await CalendarImageInput.recognize(in: data)
                Issue.record("Invalid or blank image should not produce text")
            } catch {
                #expect(error is CalendarImageInputError)
            }
        }
    }

    @Test("Oversized recognized input is preserved but cannot spend an AI request")
    @MainActor
    func longImageTextDoesNotCallParser() async {
        let transport = CalendarSmartAddTestTransport()
        let session = makeSession(transport: transport)
        await session.login(identifier: "test_001", password: "Password123")
        let store = CalendarSmartAddStore()
        let text = CalendarImageInput.appending(String(repeating: "📅", count: 1_001), to: "My original text")
        #expect(text.hasPrefix("My original text"))
        await store.parse(text: text, locale: "en", using: session)
        #expect(store.issue != nil)
        #expect(store.drafts.isEmpty)
        #expect(await transport.parseText == nil)
    }

    @MainActor
    private func makeTextImage(_ text: String) -> Data {
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        return UIGraphicsImageRenderer(size: CGSize(width: 1_200, height: 900), format: format).pngData { context in
            UIColor.white.setFill()
            context.fill(CGRect(x: 0, y: 0, width: 1_200, height: 900))
            (text as NSString).draw(in: CGRect(x: 60, y: 60, width: 1_080, height: 780), withAttributes: [
                .font: UIFont.systemFont(ofSize: 46), .foregroundColor: UIColor.black,
            ])
        }
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
    private(set) var parseBodyKeys: [String] = []
    private(set) var savedTitles: [String] = []
    private(set) var savedCategoryIDs: [String?] = []
    private(set) var savedEnds: [String] = []
    private let parseUnavailable: Bool
    private let saveUnavailable: Bool

    init(parseUnavailable: Bool = false, saveUnavailable: Bool = false) {
        self.parseUnavailable = parseUnavailable
        self.saveUnavailable = saveUnavailable
    }
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
            if parseUnavailable { throw URLError(.notConnectedToInternet) }
            let body = try #require(request.httpBody)
            let json = try #require(JSONSerialization.jsonObject(with: body) as? [String: String])
            parseBodyKeys = json.keys.sorted()
            parseText = json["text"]
            parseLocale = json["locale"]
            return response(
                for: request,
                status: 200,
                body: #"{"data":{"events":[{"title":"Library study","location":"Main Library","note":"","startAt":"2026-07-18T15:00:00.000Z","endAt":"2026-07-18T16:00:00.000Z","repeat":"NONE","repeatUntil":"","categoryId":"category-1","categoryPreset":"study"}],"warnings":["Check time"]}}"#
            )
        case "/api/v1/calendar/events/batch":
            if saveUnavailable { throw URLError(.notConnectedToInternet) }
            let body = try #require(request.httpBody)
            let json = try #require(JSONSerialization.jsonObject(with: body) as? [String: Any])
            let events = try #require(json["events"] as? [[String: Any]])
            savedTitles = events.compactMap { $0["title"] as? String }
            savedEnds = events.compactMap { $0["endAt"] as? String }
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
