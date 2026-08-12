import Foundation

struct NativeHomeSchedule: Codable, Sendable {
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
            guard let item = eventAgendaItem(entry), item.start < dayEnd, item.end > dayStart else {
                return nil
            }
            return item
        }

        let weekday = HomeWeekday(calendar.component(.weekday, from: dayStart))
        let courseItems = classBlocks.compactMap { block -> HomeAgendaItem? in
            guard block.weekday == weekday.rawValue else { return nil }
            return courseAgendaItem(block, on: dayStart, calendar: calendar)
        }

        return Self.sorted(eventItems + courseItems)
    }

    /// Builds the calendar's read model once per schedule refresh. Week paging then
    /// performs O(1) day lookups instead of reparsing every event on every drag frame.
    func indexedItemsByDay(calendar: Calendar = .sideSeatBerlin) -> [Date: [HomeAgendaItem]] {
        var result: [Date: [HomeAgendaItem]] = [:]

        for entry in studyEntries {
            guard let item = eventAgendaItem(entry) else { continue }
            var day = calendar.startOfDay(for: item.start)
            while day < item.end {
                guard let nextDay = calendar.date(byAdding: .day, value: 1, to: day) else { break }
                if item.start < nextDay, item.end > day {
                    result[day, default: []].append(item)
                }
                day = nextDay
            }
        }

        let configuredStart = Date.sideSeatISO8601(window.start).map { calendar.startOfDay(for: $0) }
        let configuredEnd = Date.sideSeatISO8601(window.end).map { calendar.startOfDay(for: $0) }
        let fallbackStart = result.keys.min() ?? calendar.startOfDay(for: Date())
        let fallbackEnd = result.keys.max().flatMap {
            calendar.date(byAdding: .day, value: 1, to: $0)
        } ?? calendar.date(byAdding: .day, value: 1, to: fallbackStart) ?? fallbackStart

        var day = configuredStart ?? fallbackStart
        let end = configuredEnd ?? fallbackEnd
        while day < end {
            let weekday = HomeWeekday(calendar.component(.weekday, from: day))
            for block in classBlocks where block.weekday == weekday.rawValue {
                if let item = courseAgendaItem(block, on: day, calendar: calendar) {
                    result[day, default: []].append(item)
                }
            }
            guard let nextDay = calendar.date(byAdding: .day, value: 1, to: day) else { break }
            day = nextDay
        }

        for day in result.keys {
            result[day] = Self.sorted(result[day] ?? [])
        }
        return result
    }

    private func eventAgendaItem(_ entry: NativeHomeStudyEntry) -> HomeAgendaItem? {
        guard
            let start = Date.sideSeatISO8601(entry.startISO),
            let end = Date.sideSeatISO8601(entry.endISO),
            end > start
        else { return nil }
        return HomeAgendaItem(
            id: entry.id,
            title: entry.title,
            start: start,
            end: end,
            location: entry.location,
            colorHex: entry.categoryColor,
            source: entry.id.hasPrefix("icsfeed:") ? .subscription : .event,
            withLabel: entry.withLabel,
            participantNames: entry.eventParticipants.map(\.name),
            discoverActivityID: entry.discoverActivityId
        )
    }

    private func courseAgendaItem(
        _ block: NativeHomeClassBlock,
        on day: Date,
        calendar: Calendar
    ) -> HomeAgendaItem? {
        guard
            let start = calendar.date(byAdding: .minute, value: block.startMinute, to: day),
            let end = calendar.date(byAdding: .minute, value: block.endMinute, to: day)
        else { return nil }
        let title = block.courseCode.map { "\($0) · \(block.courseName)" } ?? block.courseName
        return HomeAgendaItem(
            id: "course-\(block.courseId)-\(day.timeIntervalSince1970)-\(block.startMinute)",
            title: title,
            start: start,
            end: end,
            location: block.location,
            colorHex: block.categoryColor,
            source: .course
        )
    }

    private static func sorted(_ items: [HomeAgendaItem]) -> [HomeAgendaItem] {
        items.sorted {
            if $0.start == $1.start { return $0.title < $1.title }
            return $0.start < $1.start
        }
    }

    func agendaSections(
        startingAt startDate: Date,
        dayCount: Int = HomeAgendaWindow.defaultDayCount,
        calendar: Calendar = .sideSeatBerlin
    ) -> [HomeAgendaSection] {
        HomeAgendaWindow.sections(
            schedule: self,
            startingAt: startDate,
            dayCount: dayCount,
            calendar: calendar
        )
    }
}

struct HomeAgendaSection: Identifiable, Hashable, Sendable {
    let day: Date
    let items: [HomeAgendaItem]

    var id: Date { day }
}

enum HomeAgendaWindow {
    static let defaultDayCount = 14

    static func sections(
        schedule: NativeHomeSchedule,
        startingAt startDate: Date,
        dayCount: Int = defaultDayCount,
        calendar: Calendar = .sideSeatBerlin
    ) -> [HomeAgendaSection] {
        let start = calendar.startOfDay(for: startDate)
        return (0..<max(1, dayCount)).compactMap { offset in
            guard let day = calendar.date(byAdding: .day, value: offset, to: start) else {
                return nil
            }
            let items = schedule.items(on: day, calendar: calendar)
            guard !items.isEmpty else { return nil }
            return HomeAgendaSection(day: day, items: items)
        }
    }
}

struct NativeHomeScheduleWindow: Codable, Sendable {
    let start: String
    let end: String
    let timeZone: String
}

struct NativeHomeSubscriptionSchedule: Codable, Sendable {
    let studyEntries: [NativeHomeStudyEntry]
}

struct NativeHomeClassBlock: Codable, Sendable {
    let courseId: String
    let courseName: String
    let courseCode: String?
    let weekday: String
    let startMinute: Int
    let endMinute: Int
    let location: String?
    let categoryColor: String?
}

struct NativeHomeStudyEntry: Codable, Hashable, Sendable {
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

struct NativeHomeEventParticipant: Codable, Hashable, Sendable {
    let userId: String?
    let name: String
}

struct NativeHomeCalendarCategory: Codable, Hashable, Identifiable, Sendable {
    let id: String
    let name: String
    let color: String
    let presetKey: String?
    let icsSubscriptionUrl: String?

    var displayName: String { CalendarCategoryDisplayName.resolve(name: name, presetKey: presetKey) }
}

struct NativeHomeCompanionOption: Codable, Hashable, Identifiable, Sendable {
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

    enum Context: Hashable, Sendable {
        case personal
        case shared
        case publicPlan
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
    let withLabel: String?
    let participantNames: [String]
    let discoverActivityID: String?

    init(
        id: String,
        title: String,
        start: Date,
        end: Date,
        location: String?,
        colorHex: String?,
        source: Source,
        withLabel: String? = nil,
        participantNames: [String] = [],
        discoverActivityID: String? = nil
    ) {
        self.id = id
        self.title = title
        self.start = start
        self.end = end
        self.location = location
        self.colorHex = colorHex
        self.source = source
        self.withLabel = withLabel
        self.participantNames = participantNames
        self.discoverActivityID = discoverActivityID
    }

    var context: Context {
        switch source {
        case .course:
            return .course
        case .subscription:
            return .subscription
        case .event:
            if discoverActivityID != nil { return .publicPlan }
            if !participantNames.isEmpty || !(withLabel?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ?? true) {
                return .shared
            }
            return .personal
        }
    }

    var isSocial: Bool {
        context == .shared || context == .publicPlan
    }

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
        let planStart = Calendar.sideSeatBerlin.date(byAdding: .hour, value: 2, to: now) ?? now
        let planEnd = Calendar.sideSeatBerlin.date(byAdding: .minute, value: 75, to: planStart) ?? planStart
        let tomorrowStart = Calendar.sideSeatBerlin.date(byAdding: .day, value: 1, to: now) ?? now
        let tomorrowEnd = Calendar.sideSeatBerlin.date(byAdding: .hour, value: 1, to: tomorrowStart) ?? tomorrowStart
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
                ),
                NativeHomeStudyEntry(
                    id: "ui-social-plan",
                    title: "Coffee meetup",
                    location: "Campus cafe",
                    withLabel: "Test Peer",
                    note: nil,
                    repeatRule: "NONE",
                    repeatUntilISO: nil,
                    eventParticipants: [
                        NativeHomeEventParticipant(userId: "ui-test-peer", name: "Test Peer"),
                        NativeHomeEventParticipant(userId: "ui-test-peer-2", name: "Mina")
                    ],
                    startISO: planStart.ISO8601Format(),
                    endISO: planEnd.ISO8601Format(),
                    categoryId: nil,
                    categoryColor: "#0F766E",
                    categoryName: nil,
                    discoverActivityId: "ui-plan-1"
                ),
                NativeHomeStudyEntry(
                    id: "ui-tomorrow-event",
                    title: "Tomorrow review",
                    location: "Study room",
                    withLabel: nil,
                    note: nil,
                    repeatRule: "NONE",
                    repeatUntilISO: nil,
                    eventParticipants: [],
                    startISO: tomorrowStart.ISO8601Format(),
                    endISO: tomorrowEnd.ISO8601Format(),
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

    static func uiTestingAllDayFixture(now: Date) -> NativeHomeSchedule {
        let base = uiTestingFixture(now: now)
        let calendar = Calendar.sideSeatBerlin
        let start = calendar.startOfDay(for: now)
        let end = calendar.date(byAdding: .day, value: 2, to: start) ?? start.addingTimeInterval(48 * 3_600)
        let allDay = NativeHomeStudyEntry(
            id: "icsfeed:ui-all-day:0",
            title: "Reading week",
            location: nil,
            withLabel: nil,
            note: "Imported all-day subscription",
            repeatRule: "NONE",
            repeatUntilISO: nil,
            eventParticipants: [],
            startISO: start.ISO8601Format(),
            endISO: end.ISO8601Format(),
            categoryId: "external",
            categoryColor: "#16A34A",
            categoryName: "External",
            discoverActivityId: nil
        )
        return NativeHomeSchedule(
            window: base.window,
            classBlocks: base.classBlocks,
            studyEntries: base.studyEntries + [allDay],
            companionOptions: base.companionOptions,
            initialCalendarCategories: base.initialCalendarCategories
        )
    }

    /// Deliberately exceeds a realistic student calendar: 59 days with one event
    /// in every half-hour slot. Used to catch paging work that scales with event count.
    static func uiTestingDenseFixture(now: Date) -> NativeHomeSchedule {
        let calendar = Calendar.sideSeatBerlin
        let focusDay = calendar.startOfDay(for: now)
        let windowStart = calendar.date(byAdding: .day, value: -14, to: focusDay) ?? focusDay
        let windowEnd = calendar.date(byAdding: .day, value: 45, to: focusDay) ?? focusDay
        let colors = ["#2563EB", "#0F766E", "#9333EA", "#C2410C"]
        var entries: [NativeHomeStudyEntry] = []
        entries.reserveCapacity(59 * 48)

        for dayOffset in -14..<45 {
            guard let day = calendar.date(byAdding: .day, value: dayOffset, to: focusDay) else {
                continue
            }
            for slot in 0..<48 {
                guard
                    let start = calendar.date(byAdding: .minute, value: slot * 30, to: day),
                    let end = calendar.date(byAdding: .minute, value: 30, to: start)
                else { continue }
                entries.append(
                    NativeHomeStudyEntry(
                        id: "ui-dense-\(dayOffset)-\(slot)",
                        title: "Busy \(slot + 1)",
                        location: slot.isMultiple(of: 3) ? "Campus" : nil,
                        withLabel: nil,
                        note: nil,
                        repeatRule: "NONE",
                        repeatUntilISO: nil,
                        eventParticipants: [],
                        startISO: start.ISO8601Format(),
                        endISO: end.ISO8601Format(),
                        categoryId: "ui-dense-category",
                        categoryColor: colors[slot % colors.count],
                        categoryName: "Stress test",
                        discoverActivityId: nil
                    )
                )
            }
        }

        return NativeHomeSchedule(
            window: NativeHomeScheduleWindow(
                start: windowStart.ISO8601Format(),
                end: windowEnd.ISO8601Format(),
                timeZone: "Europe/Berlin"
            ),
            classBlocks: [],
            studyEntries: entries,
            companionOptions: [],
            initialCalendarCategories: [
                NativeHomeCalendarCategory(
                    id: "ui-dense-category",
                    name: "Stress test",
                    color: colors[0],
                    presetKey: nil,
                    icsSubscriptionUrl: nil
                )
            ]
        )
    }
}
#endif

private extension Date {
    static let sideSeatFractionalISO8601 = Date.ISO8601FormatStyle(includingFractionalSeconds: true)
    static let sideSeatStandardISO8601 = Date.ISO8601FormatStyle()

    static func sideSeatISO8601(_ value: String) -> Date? {
        if let date = try? Date(value, strategy: sideSeatFractionalISO8601) {
            return date
        }
        return try? Date(value, strategy: sideSeatStandardISO8601)
    }
}
