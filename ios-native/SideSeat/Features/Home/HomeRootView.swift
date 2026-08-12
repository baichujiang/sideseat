import SwiftUI
import UIKit

private enum HomeCalendarMode: String, CaseIterable, Identifiable {
    case week
    case day
    case list

    var id: String { rawValue }
}

struct HomeRootView: View {
    @Environment(\.scenePhase) private var scenePhase
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
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
    @State private var activeMoveDestination: CalendarMoveDestination?
    @State private var isMovingEvent = false
    @State private var operationIssue: String?
    /// Apple-like Today: re-anchor the time grid near now without continuous chase.
    @State private var timelineScrollToken = 0
    @State private var readOnlyItem: HomeAgendaItem?
    @State private var pendingEditorEvent: NativeHomeStudyEntry?
    @State private var calendarNotice: CalendarNotice?
    @State private var pendingScheduleShareNotice: String?
    @State private var weekVisibleDayCount = HomeWeekWindow.storedVisibleDayCount()
    @State private var weekTimelineDensityLevel = HomeWeekWindow.storedTimelineDensityLevel()
    @State private var weekViewportDate = Date()

    private let calendar = Calendar.sideSeatBerlin

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            header
                .padding(.horizontal, 20)
                .padding(.top, 4)
                .padding(.bottom, 8)

            HStack(spacing: 10) {
                Picker(String(localized: "Calendar view"), selection: $calendarMode) {
                    Text("Week").tag(HomeCalendarMode.week)
                    Text("Day").tag(HomeCalendarMode.day)
                    Text("List").tag(HomeCalendarMode.list)
                }
                .pickerStyle(.segmented)
                .accessibilityIdentifier("calendar-view-mode")

                calendarCategoriesButton
            }
            .padding(.horizontal, 20)
            .padding(.bottom, 10)

            if calendarMode != .week {
                HomeDateStripView(
                    selectedDate: $selectedDate,
                    recenterToken: calendarMode.rawValue
                ) { day in
                    selectedDate = day
                }
                .padding(.bottom, 10)
            }

            switch calendarMode {
            case .week:
                HomeWeekTimetableView(
                    focusDate: selectedDate,
                    visibleDayCount: weekVisibleDayCount,
                    timelineDensityLevel: weekTimelineDensityLevel,
                    itemsByDay: store.agendaItemsByDay,
                    onFocusDate: { selectedDate = $0 },
                    onViewportDateChange: { date in
                        weekViewportDate = date
                        Task { await store.ensureCovers(date, using: session) }
                    },
                    onOpenDay: { day in
                        selectedDate = day
                        calendarMode = .day
                    },
                    onOpen: openAgendaItem,
                    onEdit: editAgendaItem,
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
                    onTimelineDensityChange: { next in
                        guard next != weekTimelineDensityLevel else { return }
                        weekTimelineDensityLevel = next
                        HomeWeekWindow.storeTimelineDensityLevel(next)
                    },
                    canPaste: calendarClipboard != nil,
                    onCreateAtSlot: openNewEvent,
                    onPasteAtSlot: { slot in
                        Task { await pasteCopiedEvent(at: slot) }
                    },
                    scrollAnchorToken: timelineScrollToken
                )
                .refreshable {
                    await store.load(using: session, around: weekViewportDate)
                }
            case .day:
                CalendarDayTimelineView(
                    date: selectedDate,
                    items: agendaItems,
                    onOpen: openAgendaItem,
                    onEdit: editAgendaItem,
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
                CalendarAgendaListView(
                    schedule: store.schedule,
                    startDate: selectedDate,
                    isLoading: store.isLoading,
                    issue: store.issue,
                    onRetry: {
                        Task { await store.load(using: session, around: selectedDate) }
                    },
                    onOpenDay: { day in
                        selectedDate = day
                        calendarMode = .day
                    },
                    onOpen: { item, renderedDay in
                        selectedDate = renderedDay
                        openAgendaItem(item)
                    },
                    onEdit: editAgendaItem,
                    onCopy: copyAgendaItem,
                    onDuplicate: duplicateAgendaItem,
                    onStartMove: startMovingAgendaItem,
                    onCreate: openNewEvent
                )
                .refreshable {
                    await store.load(using: session, around: selectedDate)
                }
            }
        }
        .background(SideSeatTheme.bg)
        .ssRootNavigationTitle("Calendar")
        .onChange(of: selectedDate) { _, newValue in
            Task { await store.ensureCovers(newValue, using: session) }
        }
        .onChange(of: scenePhase) { _, newPhase in
            guard newPhase == .active else { return }
            Task {
                await store.refreshIfStale(using: session, around: calendarActionDate)
            }
        }
        .onReceive(NotificationCenter.default.publisher(for: .sideSeatCalendarNeedsRefresh)) { _ in
            Task {
                await store.load(using: session, around: calendarActionDate)
            }
        }
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button {
                    performCalendarSelection {
                        openNewEvent(at: calendarActionDate)
                    }
                } label: {
                    Image(systemName: "plus")
                        .font(.system(size: 18, weight: .semibold))
                        .frame(width: 32, height: 32)
                        .contentShape(Circle())
                }
                .accessibilityLabel("New event")
                .accessibilityIdentifier("new-event")
                .disabled(store.schedule == nil)
            }
        }
        .sheet(item: $sheet, onDismiss: showPendingScheduleShareNotice) { destination in
            switch destination {
            case .event(let context):
                CalendarEventEditorView(
                    context: context,
                    smartScheduleEnabled: smartScheduleEnabled
                ) {
                    await store.load(using: session, around: selectedDate)
                }
            case .calendars:
                CalendarCategoryListView {
                    await store.load(using: session, around: selectedDate)
                }
            case .shareSchedule(let initialDates):
                ScheduleShareComposeSheet(initialDates: initialDates) { recipientName in
                    pendingScheduleShareNotice = String(
                        format: String(localized: "Schedule sent to %@"),
                        recipientName
                    )
                }
            }
        }
        .sheet(item: $readOnlyItem, onDismiss: openPendingEditor) { item in
            HomeAgendaDetailView(
                item: item,
                footer: readOnlyFooter(for: item),
                canEdit: item.source == .event && event(withID: item.id) != nil,
                onDone: { readOnlyItem = nil },
                onEdit: {
                    pendingEditorEvent = event(withID: item.id)
                    readOnlyItem = nil
                },
                onOpenPlan: {
                    guard let activityID = item.discoverActivityID else { return }
                    readOnlyItem = nil
                    router.navigate(to: .activity(activityID: activityID))
                }
            )
            .presentationDetents([.medium])
            .accessibilityIdentifier("calendar-readonly-detail")
        }
        .overlay {
            calendarFeedbackLayer
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

    @ViewBuilder
    private var header: some View {
        if dynamicTypeSize.isAccessibilitySize {
            VStack(alignment: .leading, spacing: 8) {
                calendarMonthTitle
                calendarHeaderActions
                    .frame(maxWidth: .infinity, alignment: .trailing)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        } else {
            HStack(alignment: .center, spacing: 6) {
                calendarMonthTitle
                Spacer(minLength: 4)
                calendarHeaderActions
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    private var calendarMonthTitle: some View {
        Text(calendarMode == .week ? weekViewportDate : selectedDate, format: .dateTime.month(.wide).year())
            .font(SideSeatTheme.Text.title)
            .foregroundStyle(SideSeatTheme.textPrimary)
            .lineLimit(1)
            .layoutPriority(1)
            .accessibilityIdentifier("calendar-month-title")
    }

    private var calendarHeaderActions: some View {
        HStack(alignment: .center, spacing: 6) {
            Button {
                performCalendarSelection {
                    router.navigate(to: .courses)
                }
            } label: {
                Label("Courses", systemImage: "books.vertical.fill")
                    .lineLimit(1)
            }
            .buttonStyle(CalendarCoursesButtonStyle())
            .frame(minHeight: 44)
            .accessibilityIdentifier("open-courses")

            Button {
                performCalendarSelection {
                    sheet = .shareSchedule(scheduleShareInitialDates)
                }
            } label: {
                Image(systemName: "square.and.arrow.up")
            }
            .buttonStyle(CalendarShareButtonStyle())
            .frame(width: 44, height: 44)
            .accessibilityLabel("Share schedule")
            .accessibilityHint("Choose dates and sharing options")
            .accessibilityIdentifier("calendar-share-schedule")
            Button {
                jumpToToday()
            } label: {
                Text("Today")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(.white)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 10)
                    .background(
                        CalendarChrome.nowFill,
                        in: RoundedRectangle(cornerRadius: 8, style: .continuous)
                    )
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .frame(minHeight: 44)
            .accessibilityIdentifier("home-jump-today")
        }
    }

    private var calendarCategoriesButton: some View {
        Button {
            performCalendarSelection { sheet = .calendars }
        } label: {
            Image(systemName: "calendar")
                .symbolRenderingMode(.hierarchical)
                .font(.system(size: 16, weight: .semibold))
                .foregroundStyle(SideSeatTheme.textPrimary)
                .frame(width: 42, height: 32)
                .background(
                    SideSeatTheme.fillTertiary,
                    in: RoundedRectangle(cornerRadius: 8, style: .continuous)
                )
                .contentShape(Rectangle())
        }
        .accessibilityLabel("Calendar categories")
        .accessibilityIdentifier("manage-calendars")
    }

    private var agendaItems: [HomeAgendaItem] {
        store.agendaItemsByDay[calendar.startOfDay(for: selectedDate)] ?? []
    }

    private var smartScheduleEnabled: Bool {
        clientConfiguration.configuration?.features["naturalLanguageSchedule"] == true
    }

    private var calendarActionDate: Date {
        calendarMode == .week ? weekViewportDate : selectedDate
    }

    private var scheduleShareInitialDates: [Date] {
        switch calendarMode {
        case .week:
            let start = HomeWeekWindow.viewportStart(
                containing: weekViewportDate,
                visibleDayCount: weekVisibleDayCount,
                calendar: calendar
            )
            return HomeWeekWindow.days(
                from: start,
                count: weekVisibleDayCount,
                calendar: calendar
            )
        case .day:
            return [selectedDate]
        case .list:
            return HomeWeekWindow.days(from: selectedDate, count: 7, calendar: calendar)
        }
    }

    private func performCalendarSelection(_ action: () -> Void) {
        UISelectionFeedbackGenerator().selectionChanged()
        action()
    }

    private func jumpToToday() {
        UISelectionFeedbackGenerator().selectionChanged()
        let today = Date()
        withAnimation(.easeOut(duration: 0.22)) {
            selectedDate = today
            weekViewportDate = today
        }
        timelineScrollToken += 1
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

    private func moveActionTitle(for destination: CalendarMoveDestination) -> String {
        return String(
            format: String(localized: "Move to %@?"),
            destination.start.formatted(date: .abbreviated, time: .shortened)
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
        readOnlyItem = item
    }

    private func editAgendaItem(_ item: HomeAgendaItem) {
        guard item.source == .event, let event = event(withID: item.id) else { return }
        openEvent(event)
    }

    private func readOnlyFooter(for item: HomeAgendaItem) -> LocalizedStringKey? {
        if item.context == .publicPlan { return "A plan from the SideSeat community." }
        if item.context == .shared { return "This event includes other people." }
        return switch item.source {
        case .course: "Course blocks are read-only on Home."
        case .subscription: "Subscribed events are read-only."
        case .event: nil
        }
    }

    private func openPendingEditor() {
        guard let event = pendingEditorEvent else { return }
        pendingEditorEvent = nil
        openEvent(event)
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
        withAnimation(.snappy(duration: 0.2)) {
            calendarNotice = nil
            movingEvent = nil
            pendingMove = CalendarMoveDestination(event: event, start: start)
        }
    }

    private func startMovingEvent(_ event: NativeHomeStudyEntry) {
        withAnimation(.snappy(duration: 0.2)) {
            calendarNotice = nil
            pendingMove = nil
            movingEvent = event
        }
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
        withAnimation(.snappy(duration: 0.2)) {
            pendingMove = CalendarMoveDestination(event: movingEvent, start: start)
        }
    }

    @ViewBuilder
    private var calendarFeedbackLayer: some View {
        ZStack(alignment: .bottom) {
            if pendingMove != nil || isMovingEvent {
                Color.clear
                    .contentShape(Rectangle())
                    .onTapGesture {
                        guard !isMovingEvent else { return }
                        cancelMove()
                    }
            } else if movingEvent != nil {
                Color.clear
                    .allowsHitTesting(false)
            }

            Group {
                if isMovingEvent, let activeMoveDestination {
                    moveProgressPanel(for: activeMoveDestination)
                        .transition(.move(edge: .bottom).combined(with: .opacity))
                } else if let pendingMove {
                    moveConfirmationPanel(for: pendingMove)
                        .transition(.move(edge: .bottom).combined(with: .opacity))
                } else if let movingEvent {
                    moveSelectionPanel(for: movingEvent)
                        .transition(.move(edge: .bottom).combined(with: .opacity))
                } else if let calendarNotice {
                    calendarNoticePanel(calendarNotice)
                        .transition(.scale(scale: 0.96).combined(with: .opacity))
                }
            }
            .padding(.horizontal, SideSeatTheme.spaceLG)
            .padding(.bottom, 72)
        }
        .animation(.snappy(duration: 0.24), value: calendarFeedbackIdentity)
    }

    private var calendarFeedbackIdentity: String {
        if isMovingEvent { return "moving-\(activeMoveDestination?.id.uuidString ?? "")" }
        if let pendingMove { return "confirm-\(pendingMove.id.uuidString)" }
        if let movingEvent { return "select-\(movingEvent.id)" }
        if let calendarNotice { return "notice-\(calendarNotice.id.uuidString)" }
        return "none"
    }

    private func moveSelectionPanel(for event: NativeHomeStudyEntry) -> some View {
        calendarFloatingPanel {
            HStack(spacing: SideSeatTheme.spaceMD) {
                Image(systemName: "arrow.up.and.down.and.arrow.left.and.right")
                    .font(.body.weight(.semibold))
                    .foregroundStyle(SideSeatTheme.accent)
                    .frame(width: 36, height: 36)
                    .background(SideSeatTheme.accent.opacity(0.10), in: Circle())

                VStack(alignment: .leading, spacing: 2) {
                    Text(String(format: String(localized: "Moving %@"), event.title))
                        .font(.subheadline.weight(.semibold))
                        .lineLimit(1)
                    Text("Choose a new time")
                        .font(.caption)
                        .foregroundStyle(SideSeatTheme.textSecondary)
                }

                Spacer(minLength: SideSeatTheme.spaceSM)

                Button {
                    cancelMove()
                } label: {
                    Image(systemName: "xmark")
                        .font(.caption.weight(.bold))
                        .frame(width: 36, height: 36)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .foregroundStyle(SideSeatTheme.textSecondary)
                .accessibilityLabel("Cancel")
                .accessibilityIdentifier("calendar-move-cancel")
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("calendar-move-banner")
    }

    private func moveConfirmationPanel(for destination: CalendarMoveDestination) -> some View {
        let isRecurring = CalendarEventTransfer(event: destination.event)?.isRecurring == true
        return calendarFloatingPanel {
            VStack(alignment: .leading, spacing: SideSeatTheme.spaceMD) {
                HStack(alignment: .top, spacing: SideSeatTheme.spaceMD) {
                    Image(systemName: "calendar.badge.clock")
                        .font(.body.weight(.semibold))
                        .foregroundStyle(SideSeatTheme.accent)
                        .frame(width: 38, height: 38)
                        .background(SideSeatTheme.accent.opacity(0.10), in: Circle())

                    VStack(alignment: .leading, spacing: 3) {
                        Text(destination.event.title)
                            .font(.subheadline.weight(.semibold))
                            .lineLimit(1)
                        Text(moveActionTitle(for: destination))
                            .font(.footnote)
                            .foregroundStyle(SideSeatTheme.textSecondary)
                    }

                    Spacer(minLength: SideSeatTheme.spaceSM)

                    Button {
                        cancelMove()
                    } label: {
                        Image(systemName: "xmark")
                            .font(.caption.weight(.bold))
                            .frame(width: 32, height: 32)
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .foregroundStyle(SideSeatTheme.textSecondary)
                    .accessibilityLabel("Cancel")
                }

                HStack(spacing: SideSeatTheme.spaceSM) {
                    SSSecondaryButton(
                        title: String(localized: "Cancel"),
                        kind: .softFill,
                        fontWeight: .semibold,
                        accessibilityID: "calendar-move-cancel-confirmation"
                    ) {
                        cancelMove()
                    }

                    SSPrimaryButton(
                        title: isRecurring
                            ? String(localized: "Only this event")
                            : String(localized: "Move event"),
                        fill: .product,
                        height: 44,
                        accessibilityID: isRecurring ? "calendar-move-this" : "calendar-move-confirm"
                    ) {
                        performMove(destination, scope: "this")
                    }
                }

                if isRecurring {
                    HStack(spacing: SideSeatTheme.spaceSM) {
                        moveSeriesScopeButton(
                            title: String(localized: "This and future events"),
                            accessibilityID: "calendar-move-future"
                        ) {
                            performMove(destination, scope: "future")
                        }
                        moveSeriesScopeButton(
                            title: String(localized: "All events"),
                            accessibilityID: "calendar-move-all"
                        ) {
                            performMove(destination, scope: "all")
                        }
                    }
                }
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("calendar-move-confirmation")
    }

    private func moveProgressPanel(for destination: CalendarMoveDestination) -> some View {
        calendarFloatingPanel {
            HStack(spacing: SideSeatTheme.spaceMD) {
                ProgressView()
                    .controlSize(.regular)
                    .tint(SideSeatTheme.accent)
                    .frame(width: 38, height: 38)

                VStack(alignment: .leading, spacing: 3) {
                    Text(String(format: String(localized: "Moving %@"), destination.event.title))
                        .font(.subheadline.weight(.semibold))
                        .lineLimit(1)
                    Text(
                        String(
                            format: String(localized: "Move event to %@"),
                            destination.start.formatted(date: .abbreviated, time: .shortened)
                        )
                    )
                    .font(.footnote)
                    .foregroundStyle(SideSeatTheme.textSecondary)
                    .lineLimit(1)
                }

                Spacer(minLength: SideSeatTheme.spaceSM)
            }
        }
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier("calendar-move-progress")
    }

    private func calendarNoticePanel(_ notice: CalendarNotice) -> some View {
        calendarFloatingPanel {
            HStack(spacing: SideSeatTheme.spaceMD) {
                Image(systemName: notice.systemImage)
                    .font(.title3.weight(.semibold))
                    .foregroundStyle(notice.isSuccess ? SideSeatTheme.success : SideSeatTheme.accent)
                    .symbolEffect(.bounce, value: notice.id)
                Text(notice.text)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(SideSeatTheme.textPrimary)
                    .lineLimit(2)
                Spacer(minLength: SideSeatTheme.spaceSM)
            }
        }
        .allowsHitTesting(false)
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier("calendar-notice")
    }

    private func moveSeriesScopeButton(
        title: String,
        accessibilityID: String,
        action: @escaping () -> Void
    ) -> some View {
        Button(action: action) {
            Text(title)
                .font(.caption.weight(.semibold))
                .multilineTextAlignment(.center)
                .lineLimit(2)
                .frame(maxWidth: .infinity)
                .frame(minHeight: 40)
                .padding(.horizontal, SideSeatTheme.spaceSM)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .foregroundStyle(SideSeatTheme.textPrimary)
        .background(SideSeatTheme.fillTertiary, in: RoundedRectangle(cornerRadius: SideSeatTheme.controlRadius))
        .accessibilityIdentifier(accessibilityID)
    }

    private func calendarFloatingPanel<Content: View>(
        @ViewBuilder content: () -> Content
    ) -> some View {
        content()
            .padding(SideSeatTheme.spaceLG)
            .frame(maxWidth: 390)
            .background(.regularMaterial, in: RoundedRectangle(cornerRadius: SideSeatTheme.controlRadius, style: .continuous))
            .overlay {
                RoundedRectangle(cornerRadius: SideSeatTheme.controlRadius, style: .continuous)
                    .strokeBorder(Color.primary.opacity(0.10), lineWidth: 0.75)
            }
            .shadow(color: Color.black.opacity(0.12), radius: 18, y: 8)
    }

    private func performMove(_ destination: CalendarMoveDestination, scope: String) {
        Task { await moveEvent(destination, scope: scope) }
    }

    private func cancelMove() {
        withAnimation(.snappy(duration: 0.2)) {
            movingEvent = nil
            pendingMove = nil
            activeMoveDestination = nil
        }
    }

    private func copyEvent(_ event: NativeHomeStudyEntry) {
        guard let transfer = CalendarEventTransfer(event: event) else { return }
        calendarClipboard = transfer
        UIPasteboard.general.string = transfer.plainText(timeZone: calendar.timeZone)
        showCalendarNotice(
            String(localized: "Copied"),
            systemImage: "doc.on.doc.fill",
            isSuccess: false
        )
    }

    private func showCalendarNotice(
        _ text: String,
        systemImage: String = "checkmark.circle.fill",
        isSuccess: Bool = true
    ) {
        let notice = CalendarNotice(
            text: text,
            systemImage: systemImage,
            isSuccess: isSuccess
        )
        withAnimation(.easeOut(duration: 0.2)) {
            calendarNotice = notice
        }
        Task {
            try? await Task.sleep(nanoseconds: 2_500_000_000)
            withAnimation(.easeIn(duration: 0.2)) {
                if calendarNotice?.id == notice.id {
                    calendarNotice = nil
                }
            }
        }
    }

    private func showPendingScheduleShareNotice() {
        guard let notice = pendingScheduleShareNotice else { return }
        pendingScheduleShareNotice = nil
        showCalendarNotice(notice, systemImage: "paperplane.fill")
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
        movingEvent = destination.event
        activeMoveDestination = destination
        isMovingEvent = true
        pendingMove = nil
        calendarNotice = nil
        operationIssue = nil
        defer {
            isMovingEvent = false
            activeMoveDestination = nil
        }

        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("--ui-testing-authenticated") {
            if ProcessInfo.processInfo.arguments.contains("--ui-testing-calendar-move-delay") {
                try? await Task.sleep(nanoseconds: 3_000_000_000)
            }
            store.applyUITestingMove(
                eventID: destination.event.id,
                start: destination.start,
                end: destination.start.addingTimeInterval(transfer.duration),
                detachSeries: transfer.isRecurring && scope == "this"
            )
            selectedDate = destination.start
            movingEvent = nil
            showMovedNotice(destination.start)
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
            await store.load(using: session, around: destination.start)
            selectedDate = destination.start
            movingEvent = nil
            showMovedNotice(destination.start)
        } catch {
            movingEvent = nil
            operationIssue = error.localizedDescription
        }
    }

    private func showMovedNotice(_ start: Date) {
        UINotificationFeedbackGenerator().notificationOccurred(.success)
        showCalendarNotice(
            String(
                format: String(localized: "Moved to %@"),
                start.formatted(date: .abbreviated, time: .shortened)
            ),
            systemImage: "checkmark.circle.fill"
        )
    }
}

private struct CalendarShareButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: 17, weight: .semibold))
            .foregroundStyle(.white)
            .frame(width: 40, height: 40)
            .background(
                SideSeatTheme.accent,
                in: RoundedRectangle(cornerRadius: 8, style: .continuous)
            )
            .scaleEffect(configuration.isPressed ? 0.94 : 1)
            .opacity(configuration.isPressed ? 0.82 : 1)
            .animation(.easeOut(duration: 0.12), value: configuration.isPressed)
    }
}

private struct CalendarCoursesButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.subheadline.weight(.semibold))
            .foregroundStyle(SideSeatTheme.textPrimary)
            .padding(.horizontal, 9)
            .frame(height: 40)
            .background(
                SideSeatTheme.fillTertiary,
                in: RoundedRectangle(cornerRadius: 8, style: .continuous)
            )
            .scaleEffect(configuration.isPressed ? 0.96 : 1)
            .opacity(configuration.isPressed ? 0.72 : 1)
            .animation(.easeOut(duration: 0.12), value: configuration.isPressed)
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

private struct CalendarNotice: Identifiable {
    let id = UUID()
    let text: String
    let systemImage: String
    let isSuccess: Bool
}

private enum HomeSheet: Identifiable {
    case event(CalendarEventEditorContext)
    case calendars
    case shareSchedule([Date])

    var id: String {
        switch self {
        case .event(let context): "event-\(context.id.uuidString)"
        case .calendars: "calendars"
        case .shareSchedule: "share-schedule"
        }
    }
}

private struct HomeAgendaDetailView: View {
    let item: HomeAgendaItem
    let footer: LocalizedStringKey?
    let canEdit: Bool
    let onDone: () -> Void
    let onEdit: () -> Void
    let onOpenPlan: () -> Void

    var body: some View {
        NavigationStack {
            List {
                Section {
                    Text(item.title)
                        .font(.headline)

                    Label {
                        Text(CalendarChrome.eventContextLabel(for: item))
                    } icon: {
                        Image(systemName: CalendarChrome.eventContextSymbol(for: item) ?? "calendar")
                            .foregroundStyle(CalendarChrome.eventColor(for: item))
                    }

                    Label(
                        "\(CalendarChrome.compactClock(item.start)) – \(CalendarChrome.compactClock(item.end))",
                        systemImage: "clock"
                    )
                    .foregroundStyle(.secondary)

                    if let location = item.location, !location.isEmpty {
                        Label(location, systemImage: "mappin.and.ellipse")
                    }
                } footer: {
                    if let footer {
                        Text(footer)
                    }
                }

                if item.discoverActivityID != nil {
                    Section {
                        Button(action: onOpenPlan) {
                            Label("Open plan", systemImage: "arrow.up.right.square")
                        }
                        .accessibilityIdentifier("calendar-open-plan")
                    }
                }

                if !people.isEmpty {
                    Section("People") {
                        ForEach(people, id: \.self) { name in
                            HStack(spacing: 10) {
                                InitialAvatar(name: name, size: 30)
                                Text(name)
                            }
                        }
                    }
                }
            }
            .navigationTitle(CalendarChrome.eventContextLabel(for: item))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Done", action: onDone)
                }
                if canEdit {
                    ToolbarItem(placement: .confirmationAction) {
                        Button("Edit", action: onEdit)
                            .accessibilityIdentifier("calendar-detail-edit")
                    }
                }
            }
        }
    }

    private var people: [String] {
        if !item.participantNames.isEmpty {
            var seen = Set<String>()
            return item.participantNames.filter { seen.insert($0).inserted }
        }
        guard let withLabel = item.withLabel, !withLabel.isEmpty else { return [] }
        return [withLabel]
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
