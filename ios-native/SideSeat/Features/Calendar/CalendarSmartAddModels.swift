import Foundation

struct NativeCalendarNaturalParseRequest: Encodable, Sendable {
    let text: String
    let locale: String
}

struct NativeCalendarNaturalDraft: Decodable, Identifiable, Sendable {
    let id = UUID()
    var title: String
    var location: String
    var note: String
    var startAt: String
    var endAt: String
    var repeatRule: String
    var repeatUntil: String
    var categoryId: String?
    var categoryPreset: String?

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
