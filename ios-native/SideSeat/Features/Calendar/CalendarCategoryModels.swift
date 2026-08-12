import Foundation

struct NativeCalendarCategoryList: Decodable, Sendable {
    let categories: [NativeCalendarCategory]
}

struct NativeCalendarCategory: Codable, Hashable, Identifiable, Sendable {
    let id: String
    let name: String
    let color: String
    let sortOrder: Int
    let presetKey: String?
    let icsSubscriptionUrl: String?

    var isPreset: Bool { presetKey != nil }
    var displayName: String { CalendarCategoryDisplayName.resolve(name: name, presetKey: presetKey) }
}

enum CalendarCategoryDisplayName {
    static func resolve(name: String, presetKey: String?) -> String {
        switch presetKey?.lowercased() {
        case "study" where name.caseInsensitiveCompare("Study") == .orderedSame:
            String(localized: "Study calendar")
        case "work" where name.caseInsensitiveCompare("Work") == .orderedSame:
            String(localized: "Work")
        case "personal" where name.caseInsensitiveCompare("Personal") == .orderedSame:
            String(localized: "Personal")
        case "important" where name.caseInsensitiveCompare("Important") == .orderedSame:
            String(localized: "Important")
        case "other" where name.caseInsensitiveCompare("Other") == .orderedSame:
            String(localized: "Other")
        default:
            name
        }
    }
}

struct NativeCalendarCategoryCreateRequest: Encodable, Sendable {
    let name: String
    let color: String
    let icsSubscriptionUrl: String?
}

struct NativeCalendarCategoryPatchRequest: Encodable, Sendable {
    let name: String
    let color: String
    let icsSubscriptionUrl: String?
    let includesSubscription: Bool

    enum CodingKeys: String, CodingKey {
        case name, color, icsSubscriptionUrl
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(name, forKey: .name)
        try container.encode(color, forKey: .color)
        if includesSubscription {
            try container.encode(icsSubscriptionUrl, forKey: .icsSubscriptionUrl)
        }
    }
}

struct NativeCalendarCategoryDeleteResult: Decodable, Sendable {
    let categoryId: String
    let deleted: Bool
    let detachedEventCount: Int
}

enum CalendarCategoryPalette {
    static let colors = [
        "#DC2626", "#EA580C", "#D97706", "#65A30D",
        "#16A34A", "#0D9488", "#0284C7", "#2563EB",
        "#4F46E5", "#7C3AED", "#C026D3", "#DB2777",
    ]
}

#if DEBUG
extension NativeCalendarCategoryList {
    static let uiTestingFixture = NativeCalendarCategoryList(categories: [
        NativeCalendarCategory(
            id: "ui-calendar-study",
            name: "Study",
            color: "#2563EB",
            sortOrder: 0,
            presetKey: "study",
            icsSubscriptionUrl: nil
        ),
        NativeCalendarCategory(
            id: "ui-calendar-work",
            name: "Work",
            color: "#0D9488",
            sortOrder: 1,
            presetKey: "work",
            icsSubscriptionUrl: nil
        ),
        NativeCalendarCategory(
            id: "ui-calendar-personal",
            name: "Personal",
            color: "#EA580C",
            sortOrder: 2,
            presetKey: "personal",
            icsSubscriptionUrl: nil
        ),
        NativeCalendarCategory(
            id: "ui-calendar-custom",
            name: "Project",
            color: "#2563EB",
            sortOrder: 3,
            presetKey: nil,
            icsSubscriptionUrl: "https://example.com/project.ics"
        ),
    ])
}
#endif
