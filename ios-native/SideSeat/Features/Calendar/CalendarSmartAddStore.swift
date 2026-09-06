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
            issue = AppLocalization.string( "Describe at least one event.")
            return
        }

        isParsing = true
        issue = nil
        drafts = []
        warnings = []
        defer { isParsing = false }

        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("--ui-testing-smart-schedule-dense") {
            drafts = NativeCalendarNaturalDraft.uiTestingDenseFixtures
            warnings = [
                "The title may need review.",
                "The date range was inferred from the next three days.",
                "Two study blocks were created for each day.",
            ]
            return
        }
        if ProcessInfo.processInfo.arguments.contains("--ui-testing-smart-schedule")
            || ProcessInfo.processInfo.arguments.contains("--ui-testing-authenticated")
        {
            drafts = [.uiTestingFixture]
            warnings = [AppLocalization.string( "Check the date before saving.")]
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

    func updateDraft(_ draft: NativeCalendarNaturalDraft) {
        guard let index = drafts.firstIndex(where: { $0.id == draft.id }) else { return }
        drafts[index] = draft
    }

    func removeDraft(withID draftID: UUID) {
        drafts.removeAll { $0.id == draftID }
        if drafts.isEmpty {
            warnings = []
        }
    }

    func save(using session: SessionStore) async -> Bool {
        guard !drafts.isEmpty, !isParsing, !isSaving else { return false }
        isSaving = true
        issue = nil
        defer { isSaving = false }

        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("--ui-testing-smart-schedule")
            || ProcessInfo.processInfo.arguments.contains("--ui-testing-smart-schedule-dense")
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
            return AppLocalization.string( "Your session expired. Please sign in again.")
        }
        if let apiError = error as? APIClientError, apiError.isUnauthorized {
            return AppLocalization.string( "Your session expired. Please sign in again.")
        }
        let description = error.localizedDescription
        if isAuthenticationIssue(description) {
            return AppLocalization.string( "Your session expired. Please sign in again.")
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
    static var uiTestingDenseFixtures: [Self] {
        let calendar = Calendar.sideSeatBerlin
        let firstDay = calendar.startOfDay(for: Date().addingTimeInterval(24 * 60 * 60))
        return (0..<3).flatMap { dayOffset in
            [9, 14].compactMap { hour in
                guard let day = calendar.date(byAdding: .day, value: dayOffset, to: firstDay),
                      let start = calendar.date(bySettingHour: hour, minute: 0, second: 0, of: day)
                else { return nil }
                return NativeCalendarNaturalDraft(
                    uiTestingTitle: "Focused study",
                    location: "",
                    note: "",
                    startAt: start.ISO8601Format(),
                    endAt: start.addingTimeInterval(3 * 60 * 60).ISO8601Format(),
                    repeatRule: "NONE",
                    repeatUntil: "",
                    categoryId: nil,
                    categoryPreset: "personal"
                )
            }
        }
    }

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
