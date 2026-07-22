import Foundation

struct NativeHomeSchedule: Decodable, Sendable {
    let window: NativeHomeScheduleWindow
    let classBlocks: [NativeHomeClassBlock]
    let studyEntries: [NativeHomeStudyEntry]
    let companionOptions: [NativeHomeCompanionOption]
    let initialCalendarCategories: [NativeHomeCalendarCategory]

    func mergingSubscriptionEntries(_ incoming: [NativeHomeStudyEntry]) -> NativeHomeSchedule {
        var entriesByID: [String: NativeHomeStudyEntry] = [:]
        for entry in studyEntries {
            entriesByID[entry.id] = entry
        }
        for entry in incoming where entry.id.hasPrefix("icsfeed:") {
            entriesByID[entry.id] = entry
        }
        return NativeHomeSchedule(
            window: window,
            classBlocks: classBlocks,
            studyEntries: entriesByID.values.sorted { $0.startISO < $1.startISO },
            companionOptions: companionOptions,
            initialCalendarCategories: initialCalendarCategories
        )
    }

    func items(on date: Date, calendar: Calendar = .sideSeatBerlin) -> [HomeAgendaItem] {
        guard
            let dayStart = calendar.dateInterval(of: .day, for: date)?.start,
            let dayEnd = calendar.date(byAdding: .day, value: 1, to: dayStart)
        else { return [] }

        let eventItems = studyEntries.compactMap { entry -> HomeAgendaItem? in
            guard
                let start = Date.sideSeatISO8601(entry.startISO),
                let end = Date.sideSeatISO8601(entry.endISO),
                start < dayEnd,
                end > dayStart
            else { return nil }
            return HomeAgendaItem(
                id: entry.id,
                title: entry.title,
                start: start,
                end: end,
                location: entry.location,
                colorHex: entry.categoryColor,
                source: entry.id.hasPrefix("icsfeed:") ? .subscription : .event
            )
        }

        let weekday = HomeWeekday(calendar.component(.weekday, from: dayStart))
        let courseItems = classBlocks.compactMap { block -> HomeAgendaItem? in
            guard block.weekday == weekday.rawValue else { return nil }
            guard
                let start = calendar.date(byAdding: .minute, value: block.startMinute, to: dayStart),
                let end = calendar.date(byAdding: .minute, value: block.endMinute, to: dayStart)
            else { return nil }
            let title = block.courseCode.map { "\($0) · \(block.courseName)" } ?? block.courseName
            return HomeAgendaItem(
                id: "course-\(block.courseId)-\(dayStart.timeIntervalSince1970)-\(block.startMinute)",
                title: title,
                start: start,
                end: end,
                location: block.location,
                colorHex: block.categoryColor,
                source: .course
            )
        }

        return (eventItems + courseItems).sorted {
            if $0.start == $1.start { return $0.title < $1.title }
            return $0.start < $1.start
        }
    }
}

struct NativeHomeScheduleWindow: Decodable, Sendable {
    let start: String
    let end: String
    let timeZone: String
}

struct NativeHomeSubscriptionSchedule: Decodable, Sendable {
    let studyEntries: [NativeHomeStudyEntry]
}

struct NativeHomeClassBlock: Decodable, Sendable {
    let courseId: String
    let courseName: String
    let courseCode: String?
    let weekday: String
    let startMinute: Int
    let endMinute: Int
    let location: String?
    let categoryColor: String?
}

struct NativeHomeStudyEntry: Decodable, Hashable, Sendable {
    let id: String
    let title: String
    let location: String?
    let withLabel: String?
    let note: String?
    let repeatRule: String
    let repeatUntilISO: String?
    let eventParticipants: [NativeHomeEventParticipant]
    let startISO: String
    let endISO: String
    let categoryId: String?
    let categoryColor: String?
    let categoryName: String?
    let discoverActivityId: String?
}

struct NativeHomeEventParticipant: Decodable, Hashable, Sendable {
    let userId: String?
    let name: String
}

struct NativeHomeCalendarCategory: Decodable, Hashable, Identifiable, Sendable {
    let id: String
    let name: String
    let color: String
    let presetKey: String?
    let icsSubscriptionUrl: String?
}

struct NativeHomeCompanionOption: Decodable, Hashable, Identifiable, Sendable {
    let id: String
    let name: String
    let avatarUrl: String?
}

struct HomeAgendaItem: Identifiable, Hashable, Sendable {
    enum Source: Hashable, Sendable {
        case event
        case subscription
        case course
    }

    let id: String
    let title: String
    let start: Date
    let end: Date
    let location: String?
    let colorHex: String?
    let source: Source

    /// Matches Web `isLongOrAllDayTimedMinutes` — long blocks belong in the all-day band.
    func isAllDayStyle(on day: Date, calendar: Calendar = .sideSeatBerlin) -> Bool {
        CalendarAllDayStyle.contains(start: start, end: end, on: day, calendar: calendar)
    }
}

enum CalendarAllDayStyle {
    static func contains(
        start: Date,
        end: Date,
        on day: Date,
        calendar: Calendar = .sideSeatBerlin
    ) -> Bool {
        let dayStart = calendar.startOfDay(for: day)
        guard let dayEnd = calendar.date(byAdding: .day, value: 1, to: dayStart) else { return false }
        guard start < dayEnd, end > dayStart else { return false }

        let clippedStart = max(start, dayStart)
        let clippedEnd = min(end, dayEnd)
        let startMinute = Int(clippedStart.timeIntervalSince(dayStart) / 60)
        let endMinute = Int(clippedEnd.timeIntervalSince(dayStart) / 60)
        guard endMinute > startMinute else { return false }

        let duration = endMinute - startMinute
        if duration >= 21 * 60 { return true }
        if startMinute <= 3 * 60, endMinute >= 22 * 60 + 45 { return true }
        return duration >= 24 * 60 - 120
    }
}

enum HomeWeekday: String, Sendable {
    case sunday = "SUN"
    case monday = "MON"
    case tuesday = "TUE"
    case wednesday = "WED"
    case thursday = "THU"
    case friday = "FRI"
    case saturday = "SAT"

    init(_ calendarWeekday: Int) {
        self = switch calendarWeekday {
        case 1: .sunday
        case 2: .monday
        case 3: .tuesday
        case 4: .wednesday
        case 5: .thursday
        case 6: .friday
        default: .saturday
        }
    }
}

extension Calendar {
    static var sideSeatBerlin: Calendar {
        var calendar = Calendar(identifier: .gregorian)
        calendar.locale = Locale(identifier: "en_US_POSIX")
        calendar.timeZone = TimeZone(identifier: "Europe/Berlin")!
        calendar.firstWeekday = 2
        return calendar
    }
}

#if DEBUG
extension NativeHomeSchedule {
    static func uiTestingFixture(now: Date) -> NativeHomeSchedule {
        let end = Calendar.sideSeatBerlin.date(byAdding: .hour, value: 1, to: now) ?? now
        return NativeHomeSchedule(
            window: NativeHomeScheduleWindow(
                start: now.ISO8601Format(),
                end: end.ISO8601Format(),
                timeZone: "Europe/Berlin"
            ),
            classBlocks: [],
            studyEntries: [
                NativeHomeStudyEntry(
                    id: "ui-recurring-event",
                    title: "Weekly planning",
                    location: "Library",
                    withLabel: nil,
                    note: nil,
                    repeatRule: "WEEKLY",
                    repeatUntilISO: Calendar.sideSeatBerlin.date(byAdding: .month, value: 1, to: now)?.ISO8601Format(),
                    eventParticipants: [],
                    startISO: now.ISO8601Format(),
                    endISO: end.ISO8601Format(),
                    categoryId: "ui-test-category",
                    categoryColor: "#2563EB",
                    categoryName: "Study",
                    discoverActivityId: nil
                )
            ],
            companionOptions: [
                NativeHomeCompanionOption(
                    id: "ui-test-peer",
                    name: "Test Peer",
                    avatarUrl: nil
                )
            ],
            initialCalendarCategories: [
                NativeHomeCalendarCategory(
                    id: "ui-test-category",
                    name: "Study",
                    color: "#2563EB",
                    presetKey: nil,
                    icsSubscriptionUrl: nil
                )
            ]
        )
    }
}
#endif

private extension Date {
    static func sideSeatISO8601(_ value: String) -> Date? {
        let fractional = ISO8601DateFormatter()
        fractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let date = fractional.date(from: value) { return date }
        return ISO8601DateFormatter().date(from: value)
    }
}
