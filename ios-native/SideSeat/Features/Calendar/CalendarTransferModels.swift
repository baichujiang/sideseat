import Foundation
import SwiftUI
import UniformTypeIdentifiers

struct NativeCalendarIcsImportRequest: Codable, Sendable {
    let ics: String
}

struct NativeCalendarIcsImportResult: Decodable, Sendable {
    let imported: Int
    let skipped: Int
}

struct NativeCalendarIcsExport: Decodable, Sendable {
    let filename: String
    let mediaType: String
    let ics: String
}

struct NativeCalendarSubscriptionConnection: Decodable, Identifiable, Sendable, Equatable {
    let id: String
    let label: String
    let createdAt: String
    let lastAccessedAt: String?
}

struct NativeCalendarSubscriptionList: Decodable, Sendable {
    let connections: [NativeCalendarSubscriptionConnection]
}

struct NativeCalendarSubscriptionCreateRequest: Encodable, Sendable {
    let label: String
}

struct NativeCalendarSubscriptionCreateResult: Decodable, Sendable {
    let connection: NativeCalendarSubscriptionConnection
    let subscriptionUrl: String
}

struct NativeCalendarSubscriptionRevokeResult: Decodable, Sendable {
    let id: String
    let revoked: Bool
}

struct CalendarICSFileDocument: FileDocument {
    static var readableContentTypes: [UTType] { [.sideSeatICalendar] }
    static var writableContentTypes: [UTType] { [.sideSeatICalendar] }

    var ics: String

    init(ics: String) {
        self.ics = ics
    }

    init(configuration: ReadConfiguration) throws {
        guard let data = configuration.file.regularFileContents,
              let value = String(data: data, encoding: .utf8)
        else {
            throw CocoaError(.fileReadCorruptFile)
        }
        ics = value
    }

    func fileWrapper(configuration _: WriteConfiguration) throws -> FileWrapper {
        guard let data = ics.data(using: .utf8) else {
            throw CocoaError(.fileWriteInapplicableStringEncoding)
        }
        return FileWrapper(regularFileWithContents: data)
    }
}

extension UTType {
    static let sideSeatICalendar = UTType(filenameExtension: "ics") ?? .data
}
