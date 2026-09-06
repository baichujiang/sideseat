import Foundation
import Testing
@testable import SideSeat

@Suite("Home schedule")
struct HomeScheduleTests {
    @Test("Combines weekday courses and events that cross midnight")
    func dailyAgenda() throws {
        let calendar = Calendar.sideSeatBerlin
        let monday = try #require(
            calendar.date(from: DateComponents(year: 2026, month: 7, day: 13, hour: 12))
        )
        let eventStart = try #require(
            calendar.date(from: DateComponents(year: 2026, month: 7, day: 13, hour: 23, minute: 30))
        )
        let eventEnd = try #require(
            calendar.date(from: DateComponents(year: 2026, month: 7, day: 14, hour: 0, minute: 30))
        )
        let tuesday = try #require(calendar.date(byAdding: .day, value: 1, to: monday))
        let schedule = NativeHomeSchedule(
            window: NativeHomeScheduleWindow(start: "", end: "", timeZone: "Europe/Berlin"),
            classBlocks: [
                NativeHomeClassBlock(
                    courseId: "course-1",
                    courseName: "Algorithms",
                    courseCode: "IN0001",
                    weekday: "MON",
                    startMinute: 9 * 60,
                    endMinute: 10 * 60,
                    location: "Room 1",
                    categoryColor: nil
                )
            ],
            studyEntries: [
                NativeHomeStudyEntry(
                    id: "event-1",
                    title: "Late study",
                    location: nil,
                    withLabel: nil,
                    note: nil,
                    repeatRule: "NONE",
                    repeatUntilISO: nil,
                    eventParticipants: [],
                    startISO: eventStart.ISO8601Format(),
                    endISO: eventEnd.ISO8601Format(),
                    categoryId: nil,
                    categoryColor: "#2563EB",
                    categoryName: nil,
                    discoverActivityId: nil
                )
            ],
            companionOptions: [],
            initialCalendarCategories: []
        )

        let mondayItems = schedule.items(on: monday, calendar: calendar)
        let tuesdayItems = schedule.items(on: tuesday, calendar: calendar)
        let indexedItems = schedule.indexedItemsByDay(calendar: calendar)

        #expect(mondayItems.map(\.id).contains("event-1"))
        #expect(mondayItems.contains { $0.source == .course })
        #expect(tuesdayItems.map(\.id) == ["event-1"])
        #expect(indexedItems[calendar.startOfDay(for: monday)]?.map(\.id) == mondayItems.map(\.id))
        #expect(indexedItems[calendar.startOfDay(for: tuesday)]?.map(\.id) == tuesdayItems.map(\.id))
    }

    @Test("Dense calendar fixture fills every half-hour slot across the loaded window")
    func denseCalendarFixture() throws {
        let calendar = Calendar.sideSeatBerlin
        let now = try #require(
            calendar.date(from: DateComponents(year: 2026, month: 8, day: 7, hour: 12))
        )
        let schedule = NativeHomeSchedule.uiTestingDenseFixture(now: now)
        let indexedItems = schedule.indexedItemsByDay(calendar: calendar)

        #expect(schedule.studyEntries.count == 59 * 48)
        #expect(indexedItems.count == 59)
        #expect(indexedItems.values.allSatisfy { $0.count == 48 })
    }

    @Test("Merges synthetic subscription entries and marks them read-only")
    func subscriptionEntries() throws {
        let calendar = Calendar.sideSeatBerlin
        let day = try #require(
            calendar.date(from: DateComponents(year: 2026, month: 7, day: 17, hour: 10))
        )
        let end = try #require(calendar.date(byAdding: .hour, value: 1, to: day))
        let base = NativeHomeSchedule(
            window: NativeHomeScheduleWindow(start: "", end: "", timeZone: "Europe/Berlin"),
            classBlocks: [],
            studyEntries: [],
            companionOptions: [],
            initialCalendarCategories: []
        )
        let subscription = NativeHomeStudyEntry(
            id: "icsfeed:calendar-1:1:0",
            title: "Subscribed lecture",
            location: "Online",
            withLabel: nil,
            note: nil,
            repeatRule: "NONE",
            repeatUntilISO: nil,
            eventParticipants: [],
            startISO: day.ISO8601Format(),
            endISO: end.ISO8601Format(),
            categoryId: "calendar-1",
            categoryColor: "#16A34A",
            categoryName: "External",
            discoverActivityId: nil
        )
        let untrustedStoredEntry = NativeHomeStudyEntry(
            id: "database-event",
            title: "Must not be merged",
            location: nil,
            withLabel: nil,
            note: nil,
            repeatRule: "NONE",
            repeatUntilISO: nil,
            eventParticipants: [],
            startISO: day.ISO8601Format(),
            endISO: end.ISO8601Format(),
            categoryId: nil,
            categoryColor: nil,
            categoryName: nil,
            discoverActivityId: nil
        )

        let merged = base.mergingSubscriptionEntries([subscription, untrustedStoredEntry])
        let items = merged.items(on: day, calendar: calendar)

        #expect(merged.studyEntries.map(\.id) == [subscription.id])
        #expect(items.count == 1)
        #expect(items.first?.source == .subscription)
    }

    @Test("Preserves social context for shared events and public plans")
    func socialContext() throws {
        let calendar = Calendar.sideSeatBerlin
        let start = try #require(
            calendar.date(from: DateComponents(year: 2026, month: 8, day: 3, hour: 17))
        )
        let end = try #require(calendar.date(byAdding: .hour, value: 1, to: start))
        let shared = entry(
            id: "shared",
            start: start,
            end: end,
            withLabel: "Mina",
            participants: [NativeHomeEventParticipant(userId: "mina", name: "Mina")]
        )
        let plan = entry(
            id: "plan",
            start: start,
            end: end,
            participants: [NativeHomeEventParticipant(userId: "mina", name: "Mina")],
            discoverActivityID: "activity-1"
        )
        let schedule = NativeHomeSchedule(
            window: NativeHomeScheduleWindow(start: "", end: "", timeZone: "Europe/Berlin"),
            classBlocks: [],
            studyEntries: [shared, plan],
            companionOptions: [],
            initialCalendarCategories: []
        )

        let items = schedule.items(on: start, calendar: calendar)
        let sharedItem = try #require(items.first { $0.id == "shared" })
        let planItem = try #require(items.first { $0.id == "plan" })

        #expect(sharedItem.context == .shared)
        #expect(sharedItem.participantNames == ["Mina"])
        #expect(planItem.context == .publicPlan)
        #expect(planItem.discoverActivityID == "activity-1")
    }

    @Test("Preserves event metadata required by the read-only detail")
    func eventDetailMetadata() throws {
        let calendar = Calendar.sideSeatBerlin
        let start = try #require(
            calendar.date(from: DateComponents(year: 2026, month: 9, day: 7, hour: 9))
        )
        let end = try #require(calendar.date(byAdding: .minute, value: 90, to: start))
        let repeatUntil = try #require(calendar.date(byAdding: .month, value: 2, to: start))
        let schedule = NativeHomeSchedule(
            window: NativeHomeScheduleWindow(start: "", end: "", timeZone: "Europe/Berlin"),
            classBlocks: [],
            studyEntries: [
                NativeHomeStudyEntry(
                    id: "weekly-study",
                    title: "Weekly study",
                    location: "Library",
                    withLabel: nil,
                    note: "Review chapter four",
                    repeatRule: "WEEKLY",
                    repeatUntilISO: repeatUntil.ISO8601Format(),
                    eventParticipants: [],
                    startISO: start.ISO8601Format(),
                    endISO: end.ISO8601Format(),
                    categoryId: "study",
                    categoryColor: "#7C3AED",
                    categoryName: "Study",
                    discoverActivityId: nil
                )
            ],
            companionOptions: [],
            initialCalendarCategories: []
        )

        let item = try #require(schedule.items(on: start, calendar: calendar).first)

        #expect(item.note == "Review chapter four")
        #expect(item.categoryName == "Study")
        #expect(item.repeatRule == "WEEKLY")
        #expect(item.repeatUntil == repeatUntil)
    }

    @Test("Builds a sparse 14-day agenda and keeps cross-day continuations")
    func multiDayAgenda() throws {
        let calendar = Calendar.sideSeatBerlin
        let start = try #require(
            calendar.date(from: DateComponents(year: 2026, month: 8, day: 3, hour: 12))
        )
        let lateStart = try #require(
            calendar.date(from: DateComponents(year: 2026, month: 8, day: 3, hour: 23, minute: 30))
        )
        let lateEnd = try #require(calendar.date(byAdding: .hour, value: 2, to: lateStart))
        let dayThree = try #require(calendar.date(byAdding: .day, value: 3, to: start))
        let dayThreeEnd = try #require(calendar.date(byAdding: .hour, value: 1, to: dayThree))
        let outside = try #require(calendar.date(byAdding: .day, value: 14, to: start))
        let outsideEnd = try #require(calendar.date(byAdding: .hour, value: 1, to: outside))
        let schedule = NativeHomeSchedule(
            window: NativeHomeScheduleWindow(start: "", end: "", timeZone: "Europe/Berlin"),
            classBlocks: [],
            studyEntries: [
                entry(id: "late", start: lateStart, end: lateEnd),
                entry(id: "day-three", start: dayThree, end: dayThreeEnd),
                entry(id: "outside", start: outside, end: outsideEnd),
            ],
            companionOptions: [],
            initialCalendarCategories: []
        )

        let sections = schedule.agendaSections(startingAt: start, calendar: calendar)

        #expect(sections.count == 3)
        #expect(sections[0].items.map(\.id) == ["late"])
        #expect(sections[1].items.map(\.id) == ["late"])
        #expect(sections[2].items.map(\.id) == ["day-three"])
        #expect(!sections.flatMap(\.items).contains(where: { $0.id == "outside" }))
    }

    @Test("Plans local event and course reminders 15 minutes before start")
    func calendarReminderPlanning() throws {
        let calendar = Calendar.sideSeatBerlin
        let now = try #require(
            calendar.date(from: DateComponents(year: 2026, month: 8, day: 5, hour: 8))
        )
        let eventStart = try #require(calendar.date(byAdding: .hour, value: 2, to: now))
        let eventEnd = try #require(calendar.date(byAdding: .hour, value: 1, to: eventStart))
        let schedule = NativeHomeSchedule(
            window: NativeHomeScheduleWindow(start: "", end: "", timeZone: "Europe/Berlin"),
            classBlocks: [
                NativeHomeClassBlock(
                    courseId: "course-1",
                    courseName: "Algorithms",
                    courseCode: "IN0001",
                    weekday: "WED",
                    startMinute: 11 * 60,
                    endMinute: 12 * 60,
                    location: "Room 1",
                    categoryColor: nil
                )
            ],
            studyEntries: [
                entry(id: "event-1", start: eventStart, end: eventEnd)
            ],
            companionOptions: [],
            initialCalendarCategories: []
        )

        let reminders = CalendarReminderPlanner.candidates(
            for: schedule,
            now: now,
            calendar: calendar
        )
        let eventReminder = try #require(reminders.first { $0.title == "event-1" })
        let courseReminder = try #require(reminders.first { $0.title == "IN0001 · Algorithms" })

        #expect(eventReminder.fireDate == eventStart.addingTimeInterval(-15 * 60))
        #expect(courseReminder.location == "Room 1")
        #expect(reminders.allSatisfy {
            $0.identifier.hasPrefix(CalendarReminderPlanner.notificationPrefix)
        })
    }

    @Test("Drops elapsed reminders, keeps nearest entries, and replaces identifiers after a move")
    func calendarReminderReconciliationInputs() throws {
        let calendar = Calendar.sideSeatBerlin
        let now = try #require(
            calendar.date(from: DateComponents(year: 2026, month: 8, day: 5, hour: 8))
        )
        let pastStart = try #require(calendar.date(byAdding: .minute, value: 10, to: now))
        let firstStart = try #require(calendar.date(byAdding: .hour, value: 1, to: now))
        let secondStart = try #require(calendar.date(byAdding: .hour, value: 2, to: now))
        let movedStart = try #require(calendar.date(byAdding: .minute, value: 30, to: secondStart))
        let schedule = reminderSchedule(
            entries: [
                entry(id: "past", start: pastStart, end: pastStart.addingTimeInterval(3_600)),
                entry(id: "first", start: firstStart, end: firstStart.addingTimeInterval(3_600)),
                entry(id: "second", start: secondStart, end: secondStart.addingTimeInterval(3_600)),
            ]
        )

        let limited = CalendarReminderPlanner.candidates(
            for: schedule,
            now: now,
            calendar: calendar,
            limit: 1
        )
        let originalSecond = try #require(
            CalendarReminderPlanner.candidates(for: schedule, now: now, calendar: calendar)
                .first { $0.title == "second" }
        )
        let moved = reminderSchedule(
            entries: [entry(id: "second", start: movedStart, end: movedStart.addingTimeInterval(3_600))]
        )
        let movedSecond = try #require(
            CalendarReminderPlanner.candidates(for: moved, now: now, calendar: calendar).first
        )

        #expect(limited.map(\.title) == ["first"])
        #expect(!limited.contains { $0.title == "past" })
        #expect(originalSecond.identifier != movedSecond.identifier)
    }

    @Test("Schedules all-day events at nine on their Berlin calendar day")
    func allDayReminderPlanning() throws {
        let calendar = Calendar.sideSeatBerlin
        let now = try #require(
            calendar.date(from: DateComponents(year: 2026, month: 10, day: 24, hour: 12))
        )
        let start = try #require(
            calendar.date(from: DateComponents(year: 2026, month: 10, day: 25))
        )
        let end = try #require(calendar.date(byAdding: .day, value: 2, to: start))
        let schedule = reminderSchedule(entries: [entry(id: "reading-week", start: start, end: end)])

        let reminder = try #require(
            CalendarReminderPlanner.candidates(
                for: schedule,
                now: now,
                calendar: calendar
            ).first
        )
        let expected = try #require(
            calendar.date(from: DateComponents(year: 2026, month: 10, day: 25, hour: 9))
        )

        #expect(reminder.fireDate == expected)
        #expect(reminder.isAllDay)
    }

    @Test("Offline startup restores the saved schedule without a home API request")
    @MainActor
    func offlineStartupUsesSavedSchedule() async throws {
        let focus = Date(timeIntervalSince1970: 1_786_000_000)
        let fixture = NativeHomeSchedule.uiTestingFixture(now: focus)
        let fileURL = FileManager.default.temporaryDirectory
            .appendingPathComponent("sideseat-home-startup-\(UUID().uuidString).json")
        let cache = HomeScheduleCache(fileURL: fileURL)
        let window = DateInterval(
            start: focus.addingTimeInterval(-14 * 86_400),
            end: focus.addingTimeInterval(45 * 86_400)
        )
        await cache.save(
            schedule: fixture,
            window: window,
            userID: "cached-home-user",
            savedAt: focus
        )
        let credentials = HomeStartupCredentialStore(
            token: "cached-refresh",
            user: .homeStartupTest
        )
        let transport = HomeStartupOfflineTransport()
        let session = SessionStore(
            apiClient: APIClient(environment: .homeStartupTest, transport: transport),
            credentialStore: credentials,
            device: .homeStartupTest
        )
        await session.restoreSession()
        let store = HomeScheduleStore(cache: cache)

        await store.load(using: session, around: focus)

        #expect(store.schedule?.studyEntries.map(\.id) == fixture.studyEntries.map(\.id))
        #expect(!store.isLoading)
        #expect(store.subscriptionIssue != nil)
        #expect(await transport.homeRequestCount == 0)
        await cache.clear()
    }

    @Test("Month grid uses six Monday-first weeks")
    func monthGridUsesMondayFirstSixWeekWindow() throws {
        let calendar = Calendar.sideSeatBerlin
        let august = try #require(
            calendar.date(from: DateComponents(year: 2026, month: 8, day: 22))
        )

        let days = HomeMonthGrid.visibleDays(containing: august, calendar: calendar)
        let first = try #require(days.first)
        let last = try #require(days.last)

        #expect(days.count == 42)
        #expect(calendar.component(.weekday, from: first) == calendar.firstWeekday)
        #expect(calendar.dateComponents([.year, .month, .day], from: first) == DateComponents(year: 2026, month: 7, day: 27))
        #expect(calendar.dateComponents([.year, .month, .day], from: last) == DateComponents(year: 2026, month: 9, day: 6))
        #expect(HomeMonthGrid.daysInMonth(containing: august, calendar: calendar).count == 31)
    }

    @Test("Month paging clamps the selected day")
    func monthPagingClampsSelectedDay() throws {
        let calendar = Calendar.sideSeatBerlin
        let january31 = try #require(
            calendar.date(from: DateComponents(year: 2026, month: 1, day: 31))
        )
        let february = HomeMonthGrid.shiftedSelection(january31, by: 1, calendar: calendar)

        #expect(
            calendar.dateComponents([.year, .month, .day], from: february)
                == DateComponents(year: 2026, month: 2, day: 28)
        )
    }

    @Test("Calendar event markers summarize overflow after three events")
    func calendarEventMarkersSummarizeOverflow() {
        #expect(CalendarEventMarkerLayout.visibleDotCount(for: 0) == 0)
        #expect(CalendarEventMarkerLayout.visibleDotCount(for: 1) == 1)
        #expect(CalendarEventMarkerLayout.visibleDotCount(for: 3) == 3)
        #expect(CalendarEventMarkerLayout.overflowCount(for: 3) == nil)
        #expect(CalendarEventMarkerLayout.visibleDotCount(for: 4) == 2)
        #expect(CalendarEventMarkerLayout.overflowCount(for: 4) == 2)
        #expect(CalendarEventMarkerLayout.visibleDotCount(for: 5) == 2)
        #expect(CalendarEventMarkerLayout.overflowCount(for: 5) == 3)
    }

    private func reminderSchedule(entries: [NativeHomeStudyEntry]) -> NativeHomeSchedule {
        NativeHomeSchedule(
            window: NativeHomeScheduleWindow(start: "", end: "", timeZone: "Europe/Berlin"),
            classBlocks: [],
            studyEntries: entries,
            companionOptions: [],
            initialCalendarCategories: []
        )
    }

    private func entry(
        id: String,
        start: Date,
        end: Date,
        withLabel: String? = nil,
        participants: [NativeHomeEventParticipant] = [],
        discoverActivityID: String? = nil
    ) -> NativeHomeStudyEntry {
        NativeHomeStudyEntry(
            id: id,
            title: id,
            location: nil,
            withLabel: withLabel,
            note: nil,
            repeatRule: "NONE",
            repeatUntilISO: nil,
            eventParticipants: participants,
            startISO: start.ISO8601Format(),
            endISO: end.ISO8601Format(),
            categoryId: nil,
            categoryColor: nil,
            categoryName: nil,
            discoverActivityId: discoverActivityID
        )
    }
}

private actor HomeStartupCredentialStore: CredentialStore {
    private var token: String?
    private var user: CurrentUser?

    init(token: String?, user: CurrentUser?) {
        self.token = token
        self.user = user
    }

    func refreshToken() -> String? { token }
    func save(refreshToken: String) { token = refreshToken }
    func cachedUser() async throws -> CurrentUser? { user }
    func saveCachedUser(_ user: CurrentUser) async throws { self.user = user }
    func clear() {
        token = nil
        user = nil
    }
}

private actor HomeStartupOfflineTransport: APITransport {
    private(set) var homeRequestCount = 0

    func data(for request: URLRequest) async throws -> (Data, URLResponse) {
        if request.url?.path.contains("/api/v1/home/") == true {
            homeRequestCount += 1
        }
        throw URLError(.notConnectedToInternet)
    }
}

private extension AppEnvironment {
    static let homeStartupTest = AppEnvironment(
        deployment: .development,
        apiBaseURL: URL(string: "https://api.sideseat.test")!,
        bundleIdentifier: "app.sideseat.mobile.home-startup-tests",
        appVersion: "1.0.0",
        buildNumber: "1"
    )
}

private extension NativeDevice {
    static let homeStartupTest = NativeDevice(
        id: "home-device",
        name: "Test iPhone",
        appVersion: "1.0.0",
        platformVersion: "26.5"
    )
}

private extension CurrentUser {
    static let homeStartupTest = CurrentUser(
        id: "cached-home-user",
        username: "cached_home_user",
        nickname: "Cached Student",
        email: nil,
        phone: nil,
        avatarUrl: nil,
        tagline: nil,
        school: "TUM",
        studentStatus: "CURRENT_STUDENT",
        degreeLevel: nil,
        major: nil,
        semester: nil,
        graduationYear: nil,
        gender: "UNSPECIFIED",
        onboardingComplete: true,
        isGuest: false,
        verifiedStudent: true,
        studentVerificationStatus: "VERIFIED",
        usernameUpdatedAt: nil,
        productTutorialDismissedAt: "2026-01-01T00:00:00.000Z",
        locale: "en"
    )
}
