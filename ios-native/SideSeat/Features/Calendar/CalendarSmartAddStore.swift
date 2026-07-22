import Foundation
import Observation

@MainActor
@Observable
final class CalendarSmartAddStore {
    private(set) var drafts: [NativeCalendarNaturalDraft] = []
    private(set) var warnings: [String] = []
    private(set) var isParsing = false
    private(set) var isSaving = false
    private(set) var issue: String?

    func parse(text: String, locale: String, using session: SessionStore) async {
        guard !isParsing, !isSaving else { return }
        let normalized = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !normalized.isEmpty else {
            issue = String(localized: "Describe at least one event.")
            return
        }

        isParsing = true
        issue = nil
        drafts = []
        warnings = []
        defer { isParsing = false }

        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("--ui-testing-smart-schedule")
            || ProcessInfo.processInfo.arguments.contains("--ui-testing-authenticated")
        {
            drafts = [.uiTestingFixture]
            warnings = [String(localized: "Check the date before saving.")]
            return
        }
        #endif

        do {
            let response: APIEnvelope<NativeCalendarNaturalParseResult> = try await session.sendAuthorized(
                "api/v1/calendar/parse-natural",
                method: .post,
                body: NativeCalendarNaturalParseRequest(text: normalized, locale: locale),
                idempotencyKey: UUID().uuidString
            )
            drafts = response.data.events
            warnings = response.data.warnings
        } catch {
            issue = Self.friendlyIssue(from: error)
        }
    }

    func setCategory(_ categoryID: String?, for draftID: UUID) {
        guard let index = drafts.firstIndex(where: { $0.id == draftID }) else { return }
        drafts[index].categoryId = categoryID
    }

    func save(using session: SessionStore) async -> Bool {
        guard !drafts.isEmpty, !isParsing, !isSaving else { return false }
        isSaving = true
        issue = nil
        defer { isSaving = false }

        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("--ui-testing-smart-schedule")
            || ProcessInfo.processInfo.arguments.contains("--ui-testing-authenticated")
        {
            return true
        }
        #endif

        do {
            let _: APIEnvelope<NativeCalendarEventBatchResult> = try await session.sendAuthorized(
                "api/v1/calendar/events/batch",
                method: .post,
                body: NativeCalendarEventBatchRequest(events: drafts.map(\.eventRequest)),
                idempotencyKey: UUID().uuidString
            )
            return true
        } catch {
            issue = Self.friendlyIssue(from: error)
            return false
        }
    }

    var needsSignIn: Bool {
        Self.isAuthenticationIssue(issue)
    }

    private static func friendlyIssue(from error: Error) -> String {
        if error is SessionError {
            return String(localized: "Your session expired. Please sign in again.")
        }
        if let apiError = error as? APIClientError, apiError.isUnauthorized {
            return String(localized: "Your session expired. Please sign in again.")
        }
        let description = error.localizedDescription
        if isAuthenticationIssue(description) {
            return String(localized: "Your session expired. Please sign in again.")
        }
        return description
    }

    private static func isAuthenticationIssue(_ message: String?) -> Bool {
        guard let message else { return false }
        let lowered = message.lowercased()
        return lowered.contains("sign in")
            || lowered.contains("authentication")
            || message.contains("登录")
            || message.contains("登入")
            || message.contains("过期")
    }
}

private extension NativeCalendarNaturalDraft {
    static var uiTestingFixture: Self {
        let start = Date().addingTimeInterval(24 * 60 * 60)
        return NativeCalendarNaturalDraft(
            uiTestingTitle: "Library study",
            location: "Main Library",
            note: "",
            startAt: start.ISO8601Format(),
            endAt: start.addingTimeInterval(60 * 60).ISO8601Format(),
            repeatRule: "NONE",
            repeatUntil: "",
            categoryId: nil,
            categoryPreset: nil
        )
    }

    init(
        uiTestingTitle title: String,
        location: String,
        note: String,
        startAt: String,
        endAt: String,
        repeatRule: String,
        repeatUntil: String,
        categoryId: String?,
        categoryPreset: String?
    ) {
        self.title = title
        self.location = location
        self.note = note
        self.startAt = startAt
        self.endAt = endAt
        self.repeatRule = repeatRule
        self.repeatUntil = repeatUntil
        self.categoryId = categoryId
        self.categoryPreset = categoryPreset
    }
}
