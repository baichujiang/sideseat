import Foundation

struct NativeCalendarEventRequest: Encodable, Sendable {
    let title: String
    let location: String
    let note: String
    let startAt: String
    let endAt: String
    let withUserIds: [String]
    let repeatRule: String
    let repeatUntil: String
    let categoryId: String?

    enum CodingKeys: String, CodingKey {
        case title, location, note, startAt, endAt, withUserIds, repeatUntil, categoryId
        case repeatRule = "repeat"
    }
}

struct CalendarCreateResult: Decodable, Sendable {
    let count: Int
}

struct CalendarEventTransfer: Equatable, Sendable {
    let title: String
    let location: String
    let note: String
    let duration: TimeInterval
    let participantIDs: [String]
    let categoryID: String?
    let repeatRule: String
    let repeatUntilISO: String?
    let originalStart: Date
    let originalEnd: Date

    init?(event: NativeHomeStudyEntry) {
        guard
            let start = CalendarEventTransfer.parseISO8601(event.startISO),
            let end = CalendarEventTransfer.parseISO8601(event.endISO),
            end > start
        else { return nil }

        title = event.title
        location = event.location ?? ""
        note = event.note ?? ""
        duration = max(5 * 60, end.timeIntervalSince(start))
        participantIDs = event.eventParticipants.compactMap(\.userId).sorted()
        categoryID = event.categoryId
        repeatRule = event.repeatRule
        repeatUntilISO = event.repeatUntilISO
        originalStart = start
        originalEnd = end
    }

    var duplicateStart: Date { originalEnd }
    var isRecurring: Bool { repeatRule != "NONE" }

    func copyRequest(startingAt start: Date) -> NativeCalendarEventRequest {
        request(startingAt: start, repeatRule: "NONE", repeatUntil: "")
    }

    func moveRequest(startingAt start: Date) -> NativeCalendarEventRequest {
        request(
            startingAt: start,
            endingAt: start.addingTimeInterval(duration),
            repeatRule: repeatRule,
            repeatUntil: isRecurring ? (repeatUntilISO ?? "") : ""
        )
    }

    func timingRequest(
        startingAt start: Date,
        endingAt end: Date
    ) -> NativeCalendarEventRequest {
        request(
            startingAt: start,
            endingAt: max(end, start.addingTimeInterval(5 * 60)),
            repeatRule: repeatRule,
            repeatUntil: isRecurring ? (repeatUntilISO ?? "") : ""
        )
    }

    private func request(
        startingAt start: Date,
        endingAt end: Date? = nil,
        repeatRule: String,
        repeatUntil: String
    ) -> NativeCalendarEventRequest {
        NativeCalendarEventRequest(
            title: title,
            location: location,
            note: note,
            startAt: start.ISO8601Format(),
            endAt: (end ?? start.addingTimeInterval(duration)).ISO8601Format(),
            withUserIds: participantIDs,
            repeatRule: repeatRule,
            repeatUntil: repeatUntil,
            categoryId: categoryID
        )
    }

    func plainText(locale: Locale = .current, timeZone: TimeZone = .current) -> String {
        var dateStyle = Date.FormatStyle(date: .abbreviated, time: .shortened, locale: locale)
        dateStyle.timeZone = timeZone
        var timeStyle = Date.FormatStyle(date: .omitted, time: .shortened, locale: locale)
        timeStyle.timeZone = timeZone

        var lines = [
            title,
            "\(originalStart.formatted(dateStyle)) - \(originalEnd.formatted(timeStyle))",
        ]
        if !location.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            lines.append(location)
        }
        if !note.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            lines.append("")
            lines.append(note)
        }
        return lines.joined(separator: "\n")
    }

    private static func parseISO8601(_ value: String) -> Date? {
        let fractional = ISO8601DateFormatter()
        fractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return fractional.date(from: value) ?? ISO8601DateFormatter().date(from: value)
    }
}
