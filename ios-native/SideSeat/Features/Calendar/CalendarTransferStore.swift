import Foundation
import Observation

enum CalendarExportYearOptions {
    static let supportedYears = 2000 ... 2100
    static let defaultTimeZone = TimeZone(identifier: "Europe/Berlin") ?? .autoupdatingCurrent

    static func currentYear(
        on date: Date = .now,
        timeZone: TimeZone = defaultTimeZone
    ) -> Int {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = timeZone
        let year = calendar.component(.year, from: date)
        return min(max(year, supportedYears.lowerBound), supportedYears.upperBound)
    }
}

enum CalendarSubscriptionLink {
    static func validatedHTTPSURL(from rawValue: String) -> URL? {
        guard
            let components = URLComponents(string: rawValue),
            components.scheme?.lowercased() == "https",
            components.host?.isEmpty == false,
            components.user == nil,
            components.password == nil
        else {
            return nil
        }
        return components.url
    }

    static func appleCalendarURL(from subscriptionURL: URL) -> URL? {
        guard
            var components = URLComponents(url: subscriptionURL, resolvingAgainstBaseURL: false),
            components.scheme?.lowercased() == "https",
            components.host?.isEmpty == false,
            components.user == nil,
            components.password == nil
        else {
            return nil
        }
        components.scheme = "webcal"
        return components.url
    }
}

@MainActor
@Observable
final class CalendarTransferStore {
    nonisolated static let maximumImportBytes = 512 * 1024

    private(set) var isWorking = false
    private(set) var message: String?

    func clearMessage() {
        message = nil
    }

    func reportFileError(_ error: Error) {
        message = error.localizedDescription
    }

    func importICS(_ ics: String, using session: SessionStore) async -> Bool {
        guard !isWorking else { return false }
        isWorking = true
        message = nil
        defer { isWorking = false }

        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("--ui-testing-authenticated") {
            message = String(format: AppLocalization.string( "Imported %lld events. Skipped %lld."), 1, 0)
            return true
        }
        #endif

        do {
            let response: APIEnvelope<NativeCalendarIcsImportResult> = try await session.sendAuthorized(
                "api/v1/calendar/import",
                method: .post,
                body: NativeCalendarIcsImportRequest(ics: ics),
                idempotencyKey: UUID().uuidString
            )
            message = String(
                format: AppLocalization.string( "Imported %lld events. Skipped %lld."),
                response.data.imported,
                response.data.skipped
            )
            return true
        } catch {
            message = error.localizedDescription
            return false
        }
    }

    func prepareExport(year: Int, using session: SessionStore) async -> NativeCalendarIcsExport? {
        guard !isWorking else { return nil }
        isWorking = true
        message = nil
        defer { isWorking = false }

        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("--ui-testing-authenticated") {
            return NativeCalendarIcsExport(
                filename: "sideseat-schedule-\(year).ics",
                mediaType: "text/calendar; charset=utf-8",
                ics: "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nEND:VCALENDAR\r\n"
            )
        }
        #endif

        do {
            let response: APIEnvelope<NativeCalendarIcsExport> = try await session.sendAuthorized(
                "api/v1/calendar/export",
                queryItems: [URLQueryItem(name: "year", value: String(year))]
            )
            return response.data
        } catch {
            message = error.localizedDescription
            return nil
        }
    }

    func reportExportSaved() {
        message = AppLocalization.string( "Calendar exported.")
    }
}

@MainActor
@Observable
final class CalendarConnectionStore {
    private(set) var connections: [NativeCalendarSubscriptionConnection] = []
    private(set) var isLoading = false
    private(set) var isMutating = false
    private(set) var issue: String?
    private(set) var latestSubscriptionURL: URL?

    func clearIssue() {
        issue = nil
    }

    func load(using session: SessionStore) async {
        guard !isLoading else { return }
        isLoading = true
        issue = nil
        defer { isLoading = false }

        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("--ui-testing-authenticated") {
            connections = []
            return
        }
        #endif

        do {
            let response: APIEnvelope<NativeCalendarSubscriptionList> = try await session.sendAuthorized(
                "api/v1/calendar/subscriptions"
            )
            connections = response.data.connections
        } catch {
            issue = error.localizedDescription
        }
    }

    func create(using session: SessionStore) async -> URL? {
        guard !isMutating else { return nil }
        isMutating = true
        issue = nil
        defer { isMutating = false }

        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("--ui-testing-authenticated") {
            let connection = NativeCalendarSubscriptionConnection(
                id: "ui-calendar-connection",
                label: "Apple Calendar",
                createdAt: "2026-08-29T18:00:00.000Z",
                lastAccessedAt: nil
            )
            return recordCreatedConnection(
                connection,
                subscriptionURL: "https://www.sideseat.de/api/public/calendar-subscriptions/ui-testing-token-abcdefghijklmnopqrstuvwxyz.ics"
            )
        }
        #endif

        do {
            let response: APIEnvelope<NativeCalendarSubscriptionCreateResult> = try await session.sendAuthorized(
                "api/v1/calendar/subscriptions",
                method: .post,
                body: NativeCalendarSubscriptionCreateRequest(label: "Apple Calendar"),
                idempotencyKey: UUID().uuidString
            )
            return recordCreatedConnection(
                response.data.connection,
                subscriptionURL: response.data.subscriptionUrl
            )
        } catch {
            issue = error.localizedDescription
            return nil
        }
    }

    private func recordCreatedConnection(
        _ connection: NativeCalendarSubscriptionConnection,
        subscriptionURL: String
    ) -> URL? {
        guard let url = CalendarSubscriptionLink.validatedHTTPSURL(from: subscriptionURL) else {
            issue = AppLocalization.string(
                "The server returned an invalid calendar subscription link. Please try again."
            )
            return nil
        }
        connections.removeAll { $0.id == connection.id }
        connections.insert(connection, at: 0)
        latestSubscriptionURL = url
        return url
    }

    func revoke(_ connection: NativeCalendarSubscriptionConnection, using session: SessionStore) async -> Bool {
        guard !isMutating else { return false }
        isMutating = true
        issue = nil
        defer { isMutating = false }

        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("--ui-testing-authenticated") {
            connections.removeAll { $0.id == connection.id }
            latestSubscriptionURL = nil
            return true
        }
        #endif

        do {
            let _: APIEnvelope<NativeCalendarSubscriptionRevokeResult> = try await session.sendAuthorized(
                "api/v1/calendar/subscriptions/\(connection.id)",
                method: .delete,
                idempotencyKey: UUID().uuidString
            )
            connections.removeAll { $0.id == connection.id }
            latestSubscriptionURL = nil
            return true
        } catch {
            issue = error.localizedDescription
            return false
        }
    }
}
