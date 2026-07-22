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
