import SwiftUI
import UIKit

private enum HomeCalendarMode: String, CaseIterable, Identifiable {
    case week
    case day
    case list

    var id: String { rawValue }

    var label: LocalizedStringKey {
        switch self {
        case .week: "Week"
        case .day: "Day"
        case .list: "List"
        }
    }
}

struct HomeRootView: View {
    @Environment(SessionStore.self) private var session
    @Environment(RouterPath.self) private var router
    @Environment(ClientConfigurationStore.self) private var clientConfiguration
    @State private var store = HomeScheduleStore()
    @State private var selectedDate = Date()
    @State private var sheet: HomeSheet?
    @State private var calendarMode = HomeCalendarMode.week
    @State private var calendarClipboard: CalendarEventTransfer?
    @State private var movingEvent: NativeHomeStudyEntry?
    @State private var pendingMove: CalendarMoveDestination?
    @State private var isMovingEvent = false
    @State private var operationIssue: String?
    /// Apple-like Today: re-anchor the time grid near now without continuous chase.
    @State private var timelineScrollToken = 0
    @State private var readOnlyItem: HomeAgendaItem?
    @State private var copyNotice: String?
    @State private var weekVisibleDayCount = HomeWeekWindow.storedVisibleDayCount()

    private let calendar = Calendar.sideSeatBerlin

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            header
                .padding(.horizontal, 20)
                .padding(.top, 4)
                .padding(.bottom, 8)

            // Single date navigator for all modes.
            HomeDateStripView(selectedDate: $selectedDate) { day in
                selectedDate = day
                calendarMode = .day
            }
            .padding(.bottom, 10)

            Picker("Calendar view", selection: $calendarMode) {
                ForEach(HomeCalendarMode.allCases) { mode in
                    Text(mode.label).tag(mode)
                }
            }
            .pickerStyle(.segmented)
            .padding(.horizontal, 20)
            .padding(.bottom, 10)
            .accessibilityIdentifier("calendar-view-mode")

            if let movingEvent {
                moveBanner(for: movingEvent)
                    .padding(.horizontal, 16)
                    .padding(.bottom, 8)
            }

            switch calendarMode {
            case .week:
                HomeWeekTimetableView(
                    focusDate: selectedDate,
                    visibleDayCount: weekVisibleDayCount,
                    schedule: store.schedule,
                    onFocusDate: { selectedDate = $0 },
                    onOpenDay: { day in
                        selectedDate = day
                        calendarMode = .day
                    },
                    onOpen: openAgendaItem,
                    onCopy: copyAgendaItem,
                    onDuplicate: duplicateAgendaItem,
                    movingEventID: movingEvent?.id,
                    onStartMove: startMovingAgendaItem,
                    onChooseMoveTarget: chooseMoveTarget,
                    onDragMove: dragMoveAgendaItem,
                    onVisibleDayCountChange: { next in
                        guard next != weekVisibleDayCount else { return }
                        weekVisibleDayCount = next
                        HomeWeekWindow.storeVisibleDayCount(next)
                    },
                    canPaste: calendarClipboard != nil,
                    onCreateAtSlot: openNewEvent,
                    onPasteAtSlot: { slot in
                        Task { await pasteCopiedEvent(at: slot) }
                    },
                    scrollAnchorToken: timelineScrollToken
                )
                .refreshable {
                    await store.load(using: session, around: selectedDate)
                }
            case .day:
                CalendarDayTimelineView(
                    date: selectedDate,
                    items: agendaItems,
                    onOpen: openAgendaItem,
                    onCopy: copyAgendaItem,
                    onDuplicate: duplicateAgendaItem,
                    movingEventID: movingEvent?.id,
                    onStartMove: startMovingAgendaItem,
                    onChooseMoveTarget: chooseMoveTarget,
                    canPaste: calendarClipboard != nil,
                    onCreateAtSlot: openNewEvent,
                    onPasteAtSlot: { slot in
                        Task { await pasteCopiedEvent(at: slot) }
                    },
                    scrollAnchorToken: timelineScrollToken
                )
                .refreshable {
                    await store.load(using: session, around: selectedDate)
                }
            case .list:
                ScrollView {
                    agenda
                        .padding(.horizontal, 16)
                        .padding(.bottom, 24)
                }
                .refreshable {
                    await store.load(using: session, around: selectedDate)
                }
            }
        }
        .background(SideSeatTheme.bg)
        .navigationTitle("Home")
        .navigationBarTitleDisplayMode(.inline)
        .onChange(of: selectedDate) { _, newValue in
            Task { await store.ensureCovers(newValue, using: session) }
        }
        .toolbar {
            ToolbarItemGroup(placement: .topBarTrailing) {
                Button {
                    sheet = .calendars
                } label: {
                    Image(systemName: "calendar")
                }
                .accessibilityLabel("Calendars")
                .accessibilityIdentifier("manage-calendars")

                Button {
                    router.navigate(to: .courses)
                } label: {
                    Image(systemName: "books.vertical")
                }
                .accessibilityLabel("Courses")
                .accessibilityIdentifier("open-courses")

                if smartScheduleEnabled {
                    Menu {
                        Button {
                            openNewEvent(at: selectedDate)
                        } label: {
                            Label("New event", systemImage: "calendar.badge.plus")
                        }
                        .accessibilityIdentifier("new-event")
                        Button {
                            sheet = .smartSchedule
                        } label: {
                            Label("Smart add", systemImage: "sparkles")
                        }
                        .accessibilityIdentifier("smart-schedule-open")
                    } label: {
                        Image(systemName: "plus")
                    }
                    .accessibilityLabel("Add event")
                    .accessibilityIdentifier("calendar-add-menu")
                    .disabled(store.schedule == nil)
                } else {
                    Button {
                        openNewEvent(at: selectedDate)
                    } label: {
                        Image(systemName: "plus")
                    }
                    .accessibilityLabel("New event")
                    .accessibilityIdentifier("new-event")
                    .disabled(store.schedule == nil)
                }
            }
        }
        .sheet(item: $sheet) { destination in
            switch destination {
            case .event(let context):
                CalendarEventEditorView(context: context) {
                    await store.load(using: session, around: selectedDate)
                }
            case .calendars:
                CalendarCategoryListView {
                    await store.load(using: session, around: selectedDate)
                }
            case .smartSchedule:
                CalendarSmartAddView(
                    categories: store.schedule?.initialCalendarCategories ?? []
                ) {
                    await store.load(using: session, around: selectedDate)
                }
            }
        }
        .sheet(item: $readOnlyItem) { item in
            NavigationStack {
                List {
                    Section {
                        Text(item.title)
                            .font(.headline)
                        Text(
                            "\(CalendarChrome.compactClock(item.start)) – \(CalendarChrome.compactClock(item.end))"
                        )
                        .foregroundStyle(.secondary)
                        if let location = item.location, !location.isEmpty {
                            Label(location, systemImage: "mappin.and.ellipse")
                        }
                    } footer: {
                        Text(readOnlyFooter(for: item))
                    }
                }
                .navigationTitle(readOnlyTitle(for: item))
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .confirmationAction) {
                        Button("Done") { readOnlyItem = nil }
                    }
                }
            }
            .presentationDetents([.medium])
            .accessibilityIdentifier("calendar-readonly-detail")
        }
        .overlay(alignment: .bottom) {
            if let copyNotice {
                Text(copyNotice)
                    .font(.footnote.weight(.semibold))
                    .padding(.horizontal, 14)
                    .padding(.vertical, 8)
                    .background(.ultraThinMaterial, in: Capsule())
                    .padding(.bottom, 12)
                    .transition(.move(edge: .bottom).combined(with: .opacity))
                    .accessibilityIdentifier("calendar-copy-notice")
            }
        }
        .confirmationDialog(
            moveActionTitle,
            isPresented: moveDialogBinding,
            titleVisibility: .visible,
            presenting: pendingMove
        ) { destination in
            if let transfer = CalendarEventTransfer(event: destination.event), transfer.isRecurring {
                Button("Only this event") {
                    Task { await moveEvent(destination, scope: "this") }
                }
                .accessibilityIdentifier("calendar-move-this")
                Button("This and future events") {
                    Task { await moveEvent(destination, scope: "future") }
                }
                .accessibilityIdentifier("calendar-move-future")
                Button("All events") {
                    Task { await moveEvent(destination, scope: "all") }
                }
                .accessibilityIdentifier("calendar-move-all")
            } else {
                Button("Move event") {
                    Task { await moveEvent(destination, scope: "this") }
                }
                .accessibilityIdentifier("calendar-move-confirm")
            }
            Button("Cancel", role: .cancel) {}
        }
        .alert("Calendar update failed", isPresented: operationIssueBinding) {
            Button("OK", role: .cancel) {
                operationIssue = nil
            }
        } message: {
            Text(operationIssue ?? "")
        }
        .task {
            await store.ensureCovers(selectedDate, using: session)
        }
    }

    private var header: some View {
        HStack(alignment: .firstTextBaseline) {
            // Month is the primary calendar landmark (Apple Calendar pattern).
            Text(selectedDate, format: .dateTime.month(.wide).year())
                .font(SideSeatTheme.Text.title)
                .foregroundStyle(SideSeatTheme.textPrimary)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
                .layoutPriority(1)
            Spacer(minLength: 12)
            Button("Today") {
                selectedDate = Date()
                timelineScrollToken += 1
            }
            .font(.body.weight(.semibold))
            .foregroundStyle(CalendarChrome.nowRed)
            .accessibilityIdentifier("home-jump-today")
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    @ViewBuilder
    private var agenda: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text(calendar.isDateInToday(selectedDate) ? "Today" : "Schedule")
                    .font(.headline)
                Spacer()
                if store.isLoading {
                    ProgressView()
                        .controlSize(.small)
                }
            }

            if let issue = store.issue, store.schedule == nil {
                ContentUnavailableView {
                    Label("Could not load schedule", systemImage: "wifi.exclamationmark")
                } description: {
                    Text(issue)
                } actions: {
                    Button("Try again") {
                        Task { await store.load(using: session) }
                    }
                    .buttonStyle(.borderedProminent)
                }
                .frame(maxWidth: .infinity)
            } else if store.isLoading, store.schedule == nil {
                ProgressView("Loading schedule")
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 40)
            } else if agendaItems.isEmpty {
                SSEmptyState(
                    title: "No events",
                    systemImage: "calendar",
                    description: "This day is open.",
                    actionTitle: String(localized: "New event"),
                    actionAccessibilityID: "agenda-empty-new-event"
                ) {
                    openNewEvent(at: selectedDate)
                }
                .frame(maxWidth: .infinity)
            } else {
                VStack(spacing: 0) {
                    ForEach(Array(agendaItems.enumerated()), id: \.element.id) { index, item in
                        if item.source == .event, let event = event(withID: item.id) {
                            Button {
                                sheet = .event(
                                    CalendarEventEditorContext(
                                        proposedStart: item.start,
                                        event: event,
                                        schedule: store.schedule
                                    )
                                )
                            } label: {
                                HomeAgendaRow(item: item)
                            }
                            .buttonStyle(.plain)
                            .accessibilityIdentifier("agenda-event-\(item.id)")
                            .contextMenu {
                                Button {
                                    openEvent(event)
                                } label: {
                                    Label("Edit event", systemImage: "pencil")
                                }
                                Button {
                                    copyEvent(event)
                                } label: {
                                    Label("Copy", systemImage: "doc.on.doc")
                                }
                                Button {
                                    duplicateEvent(event)
                                } label: {
                                    Label("Duplicate after event", systemImage: "plus.square.on.square")
                                }
                                Button {
                                    startMovingEvent(event)
                                } label: {
                                    Label("Move event", systemImage: "arrow.up.and.down.and.arrow.left.and.right")
                                }
                            }
                        } else {
                            HomeAgendaRow(item: item)
                        }
                        if index < agendaItems.count - 1 {
                            Divider().padding(.leading, 76)
                        }
                    }
                }
                .background(SideSeatTheme.surface, in: RoundedRectangle(cornerRadius: SideSeatTheme.controlRadius, style: .continuous))
            }
        }
    }

    private var agendaItems: [HomeAgendaItem] {
        store.schedule?.items(on: selectedDate, calendar: calendar) ?? []
    }

    private var smartScheduleEnabled: Bool {
        clientConfiguration.configuration?.features["naturalLanguageSchedule"] == true
    }

    private func event(withID id: String) -> NativeHomeStudyEntry? {
        store.schedule?.studyEntries.first { $0.id == id }
    }

    private var operationIssueBinding: Binding<Bool> {
        Binding(
            get: { operationIssue != nil },
            set: { if !$0 { operationIssue = nil } }
        )
    }

    private var moveDialogBinding: Binding<Bool> {
        Binding(
            get: { pendingMove != nil },
            set: { if !$0 { pendingMove = nil } }
        )
    }

    private var moveActionTitle: String {
        guard let pendingMove else { return String(localized: "Move event") }
        return String(
            format: String(localized: "Move to %@?"),
            pendingMove.start.formatted(date: .omitted, time: .shortened)
        )
    }

    private func openNewEvent(at date: Date) {
        sheet = .event(
            CalendarEventEditorContext(
                proposedStart: date,
                event: nil,
                schedule: store.schedule
            )
        )
    }

    private func openEvent(_ event: NativeHomeStudyEntry) {
        sheet = .event(
            CalendarEventEditorContext(
                proposedStart: CalendarEventTransfer(event: event)?.originalStart ?? selectedDate,
                event: event,
                schedule: store.schedule
            )
        )
    }

    private func openAgendaItem(_ item: HomeAgendaItem) {
        if item.source == .event, let event = event(withID: item.id) {
            openEvent(event)
        } else {
            readOnlyItem = item
        }
    }

    private func readOnlyTitle(for item: HomeAgendaItem) -> LocalizedStringKey {
        switch item.source {
        case .course: "Course"
        case .subscription: "Subscribed event"
        case .event: "Event"
        }
    }

    private func readOnlyFooter(for item: HomeAgendaItem) -> LocalizedStringKey {
        switch item.source {
        case .course: "Course blocks are read-only on Home."
        case .subscription: "Subscribed events are read-only."
        case .event: "Event"
        }
    }

    private func copyAgendaItem(_ item: HomeAgendaItem) {
        guard item.source == .event, let event = event(withID: item.id) else { return }
        copyEvent(event)
    }

    private func duplicateAgendaItem(_ item: HomeAgendaItem) {
        guard item.source == .event, let event = event(withID: item.id) else { return }
        duplicateEvent(event)
    }

    private func startMovingAgendaItem(_ item: HomeAgendaItem) {
        guard item.source == .event, let event = event(withID: item.id) else { return }
        startMovingEvent(event)
    }

    private func dragMoveAgendaItem(_ item: HomeAgendaItem, to start: Date) {
        guard item.source == .event, let event = event(withID: item.id) else { return }
        movingEvent = nil
        pendingMove = CalendarMoveDestination(event: event, start: start)
    }

    private func startMovingEvent(_ event: NativeHomeStudyEntry) {
        pendingMove = nil
        movingEvent = event
        if let start = Date.sideSeatISO8601(event.startISO) {
            selectedDate = start
        }
        // List has no time grid — jump to Day so the user can pick a slot.
        if calendarMode == .list {
            calendarMode = .day
        }
    }

    private func chooseMoveTarget(_ start: Date) {
        guard !isMovingEvent, let movingEvent else { return }
        pendingMove = CalendarMoveDestination(event: movingEvent, start: start)
    }

    @ViewBuilder
    private func moveBanner(for event: NativeHomeStudyEntry) -> some View {
        HStack(spacing: 10) {
            Image(systemName: "arrow.up.and.down.and.arrow.left.and.right")
                .foregroundStyle(SideSeatTheme.accent)
            VStack(alignment: .leading, spacing: 1) {
                Text(String(format: String(localized: "Moving %@"), event.title))
                    .font(.subheadline.weight(.semibold))
                    .lineLimit(1)
                Text("Choose a new time")
                    .font(.caption)
                    .foregroundStyle(SideSeatTheme.textSecondary)
            }
            Spacer(minLength: 0)
            if isMovingEvent {
                ProgressView()
                    .controlSize(.small)
            } else {
                Button("Cancel") {
                    movingEvent = nil
                    pendingMove = nil
                }
                .buttonStyle(.bordered)
                .controlSize(.small)
                .accessibilityIdentifier("calendar-move-cancel")
            }
        }
        .padding(.horizontal, SideSeatTheme.spaceMD)
        .padding(.vertical, 9)
        .background(SideSeatTheme.accent.opacity(0.09))
        .clipShape(RoundedRectangle(cornerRadius: SideSeatTheme.controlRadius, style: .continuous))
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("calendar-move-banner")
    }

    private func copyEvent(_ event: NativeHomeStudyEntry) {
        guard let transfer = CalendarEventTransfer(event: event) else { return }
        calendarClipboard = transfer
        UIPasteboard.general.string = transfer.plainText(timeZone: calendar.timeZone)
        withAnimation(.easeOut(duration: 0.2)) {
            copyNotice = String(localized: "Copied")
        }
        Task {
            try? await Task.sleep(nanoseconds: 1_400_000_000)
            withAnimation(.easeIn(duration: 0.2)) {
                copyNotice = nil
            }
        }
    }

    private func duplicateEvent(_ event: NativeHomeStudyEntry) {
        guard let transfer = CalendarEventTransfer(event: event) else { return }
        Task { await createEvent(from: transfer, at: transfer.duplicateStart) }
    }

    @MainActor
    private func pasteCopiedEvent(at start: Date) async {
        guard let calendarClipboard else { return }
        await createEvent(from: calendarClipboard, at: start)
    }

    @MainActor
    private func createEvent(from transfer: CalendarEventTransfer, at start: Date) async {
        operationIssue = nil

        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("--ui-testing-authenticated") {
            store.applyUITestingCreate(from: transfer, at: start)
            selectedDate = start
            return
        }
        #endif

        do {
            let _: APIEnvelope<CalendarCreateResult> = try await session.sendAuthorized(
                "api/v1/calendar/events",
                method: .post,
                body: transfer.copyRequest(startingAt: start),
                idempotencyKey: UUID().uuidString
            )
            await store.load(using: session, around: selectedDate)
        } catch {
            operationIssue = error.localizedDescription
        }
    }

    @MainActor
    private func moveEvent(_ destination: CalendarMoveDestination, scope: String) async {
        guard !isMovingEvent, let transfer = CalendarEventTransfer(event: destination.event) else { return }
        isMovingEvent = true
        pendingMove = nil
        operationIssue = nil
        defer { isMovingEvent = false }

        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("--ui-testing-authenticated") {
            store.applyUITestingMove(
                eventID: destination.event.id,
                start: destination.start,
                end: destination.start.addingTimeInterval(transfer.duration),
                detachSeries: transfer.isRecurring && scope == "this"
            )
            selectedDate = destination.start
            movingEvent = nil
            return
        }
        #endif

        do {
            let _: APIEnvelope<CalendarUpdateResult> = try await session.sendAuthorized(
                "api/v1/calendar/events/\(destination.event.id)",
                method: .patch,
                body: transfer.moveRequest(startingAt: destination.start),
                queryItems: [URLQueryItem(name: "scope", value: scope)],
                idempotencyKey: UUID().uuidString
            )
            await store.load(using: session, around: selectedDate)
            selectedDate = destination.start
            movingEvent = nil
        } catch {
            operationIssue = error.localizedDescription
        }
    }
}

private extension Date {
    static func sideSeatISO8601(_ value: String) -> Date? {
        let fractional = ISO8601DateFormatter()
        fractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let date = fractional.date(from: value) { return date }
        return ISO8601DateFormatter().date(from: value)
    }
}

private struct CalendarMoveDestination: Identifiable {
    let id = UUID()
    let event: NativeHomeStudyEntry
    let start: Date
}

private enum HomeSheet: Identifiable {
    case event(CalendarEventEditorContext)
    case calendars
    case smartSchedule

    var id: String {
        switch self {
        case .event(let context): "event-\(context.id.uuidString)"
        case .calendars: "calendars"
        case .smartSchedule: "smart-schedule"
        }
    }
}

private struct HomeAgendaRow: View {
    let item: HomeAgendaItem

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            VStack(alignment: .trailing, spacing: 2) {
                Text(CalendarChrome.compactClock(item.start))
                    .font(.subheadline.weight(.semibold))
                    .monospacedDigit()
                Text(CalendarChrome.compactClock(item.end))
                    .font(.caption)
                    .monospacedDigit()
                    .foregroundStyle(SideSeatTheme.textSecondary)
            }
            .fixedSize(horizontal: true, vertical: false)

            Capsule()
                .fill(Color(hex: item.colorHex) ?? (item.source == .course ? SideSeatTheme.courseFallback : SideSeatTheme.accent))
                .frame(width: 3, height: 42)

            VStack(alignment: .leading, spacing: 4) {
                Text(item.title)
                    .font(.subheadline.weight(.semibold))
                    .lineLimit(3)
                    .minimumScaleFactor(0.85)
                    .fixedSize(horizontal: false, vertical: true)
                if let location = item.location, !location.isEmpty {
                    Label(location, systemImage: "mappin.and.ellipse")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .lineLimit(2)
                        .minimumScaleFactor(0.85)
                }
                if item.source == .subscription {
                    Label("Subscribed", systemImage: "link")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
            }
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 12)
        .accessibilityElement(children: .combine)
    }
}

extension Color {
    init?(hex: String?) {
        guard let hex else { return nil }
        let value = hex.trimmingCharacters(in: CharacterSet(charactersIn: "#"))
        guard value.count == 6, let rgb = Int(value, radix: 16) else { return nil }
        self.init(
            red: Double((rgb >> 16) & 0xFF) / 255,
            green: Double((rgb >> 8) & 0xFF) / 255,
            blue: Double(rgb & 0xFF) / 255
        )
    }
}
