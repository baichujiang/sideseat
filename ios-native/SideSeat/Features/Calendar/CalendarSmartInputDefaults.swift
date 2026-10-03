import Foundation

/// SI-08's offline basic draft uses the same policy resource as the server.
/// Semantic extraction remains on the server; the full source stays in the input.
struct CalendarSmartInputDefaults: Decodable {
    let timeZone: String
    let defaultMinutes: Int
    let shortErrandMinutes: Int
    let activityMinutes: Int
    let roundingMinutes: Int
    let shortErrandPattern: String
    let activityPattern: String

    static let shared: Self = {
        let url = Bundle.main.url(forResource: "CalendarSmartInputPolicy", withExtension: "json")!
        return try! JSONDecoder().decode(Self.self, from: Data(contentsOf: url))
    }()

    func basicDraft(text: String, referenceTime: Date) -> NativeCalendarNaturalDraft {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: timeZone)!
        // A strict future boundary on the instant timeline also survives DST.
        var start = Date(timeIntervalSince1970: floor(referenceTime.timeIntervalSince1970 / 60) * 60 + 60)
        while calendar.component(.minute, from: start) % roundingMinutes != 0 {
            start = start.addingTimeInterval(60)
        }
        let duration: Int
        if text.range(of: shortErrandPattern, options: [.regularExpression, .caseInsensitive]) != nil {
            duration = shortErrandMinutes
        } else if text.range(of: activityPattern, options: [.regularExpression, .caseInsensitive]) != nil {
            duration = activityMinutes
        } else {
            duration = defaultMinutes
        }
        // API title limits use UTF-16, not Swift's grapheme count.
        var title = ""
        for character in text {
            guard (title + String(character)).utf16.count <= 120 else { break }
            title.append(character)
        }
        return NativeCalendarNaturalDraft(
            title: title, location: "", note: "",
            startAt: start.ISO8601Format(),
            endAt: start.addingTimeInterval(TimeInterval(duration * 60)).ISO8601Format(),
            repeatRule: "NONE", repeatUntil: "", categoryId: nil, categoryPreset: nil
        )
    }
}
