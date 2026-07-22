import Foundation

struct NativeCalendarNaturalParseRequest: Encodable, Sendable {
    let text: String
    let locale: String
}

struct NativeCalendarNaturalDraft: Decodable, Identifiable, Sendable {
    let id = UUID()
    let title: String
    let location: String
    let note: String
    let startAt: String
    let endAt: String
    let repeatRule: String
    let repeatUntil: String
    var categoryId: String?
    let categoryPreset: String?

    enum CodingKeys: String, CodingKey {
        case title, location, note, startAt, endAt, repeatUntil, categoryId, categoryPreset
        case repeatRule = "repeat"
    }

    var eventRequest: NativeCalendarEventRequest {
        NativeCalendarEventRequest(
            title: title,
            location: location,
            note: note,
            startAt: startAt,
            endAt: endAt,
            withUserIds: [],
            repeatRule: repeatRule,
            repeatUntil: repeatUntil,
            categoryId: categoryId
        )
    }
}

struct NativeCalendarNaturalParseResult: Decodable, Sendable {
    let events: [NativeCalendarNaturalDraft]
    let warnings: [String]
}

struct NativeCalendarEventBatchRequest: Encodable, Sendable {
    let events: [NativeCalendarEventRequest]
}

struct NativeCalendarEventBatchResult: Decodable, Sendable {
    let count: Int
    let events: Int
}
