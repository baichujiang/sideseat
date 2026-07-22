import Foundation
import Observation

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
            message = String(format: String(localized: "Imported %lld events. Skipped %lld."), 1, 0)
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
                format: String(localized: "Imported %lld events. Skipped %lld."),
                response.data.imported,
                response.data.skipped
            )
            return true
        } catch {
            message = error.localizedDescription
            return false
        }
    }

    func prepareExport(using session: SessionStore) async -> NativeCalendarIcsExport? {
        guard !isWorking else { return nil }
        isWorking = true
        message = nil
        defer { isWorking = false }

        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("--ui-testing-authenticated") {
            return NativeCalendarIcsExport(
                filename: "sideseat-schedule.ics",
                mediaType: "text/calendar; charset=utf-8",
                ics: "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nEND:VCALENDAR\r\n"
            )
        }
        #endif

        do {
            let response: APIEnvelope<NativeCalendarIcsExport> = try await session.sendAuthorized(
                "api/v1/calendar/export"
            )
            return response.data
        } catch {
            message = error.localizedDescription
            return nil
        }
    }

    func reportExportSaved() {
        message = String(localized: "Calendar exported.")
    }
}
