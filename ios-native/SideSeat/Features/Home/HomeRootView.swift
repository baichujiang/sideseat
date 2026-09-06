import SwiftUI
import UIKit

private enum HomeCalendarMode: String, CaseIterable, Identifiable {
    case month
    case week
    case day

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
    @State private var pendingMove: CalendarMoveDestination?
    @State private var activeMoveDestination: CalendarMoveDestination?
    @State private var isMovingEvent = false
    @State private var pendingDeleteEvent: NativeHomeStudyEntry?
    @State private var isDeletingEvent = false
    @State private var operationIssue: String?
    /// Apple-like Today: re-anchor the time grid near now without continuous chase.
    @State private var timelineScrollToken = 0
    @State private var readOnlyItem: HomeAgendaItem?
    @State private var pendingEditorEvent: NativeHomeStudyEntry?
    @State private var searchDetailEvent: NativeHomeStudyEntry?
    @State private var pendingSearchSelection: NativeHomeStudyEntry?
    @State private var showsCalendarSearch = false
    @State private var calendarNotice: CalendarNotice?
    @State private var weekVisibleDayCount = HomeWeekWindow.storedVisibleDayCount()
    @State private var weekTimelineScale = HomeWeekWindow.storedTimelineScale()
    @State private var weekViewportDate = Date()

    private let calendar = Calendar.sideSeatBerlin

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            header
                .padding(.horizontal, 20)
                .padding(.top, 4)
                .padding(.bottom, 8)

            calendarViewControls
            .padding(.horizontal, 20)
            .padding(.bottom, 10)

            if calendarMode == .day {
                HomeDateStripView(
                    selectedDate: $selectedDate,
                    itemsByDay: store.agendaItemsByDay,
                    recenterToken: calendarMode.rawValue
                ) { day in
                    selectedDate = day
                }
                .padding(.bottom, 10)
            }

            switch calendarMode {
            case .month:
                HomeMonthCalendarView(
                    selectedDate: $selectedDate,
                    itemsByDay: store.agendaItemsByDay,
                    onOpen: openAgendaItem,
                    onCopy: copyAgendaItem,
                    onDuplicate: duplicateAgendaItem,
                    onDelete: requestDeleteAgendaItem,
                    onCreate: { day in
                        openNewEvent(on: day)
                    }
                )
                .refreshable {
                    await store.load(using: session, around: monthDataFocus)
                }
            case .week:
                HomeWeekTimetableView(
                    focusDate: selectedDate,
                    visibleDayCount: weekVisibleDayCount,
                    timelineScale: weekTimelineScale,
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
                    onCopy: copyAgendaItem,
                    onDuplicate: duplicateAgendaItem,
                    onDelete: requestDeleteAgendaItem,
                    onDragMove: dragMoveAgendaItem,
                    onDragResize: dragResizeAgendaItem,
                    onVisibleDayCountChange: { next in
                        guard next != weekVisibleDayCount else { return }
                        weekVisibleDayCount = next
                        HomeWeekWindow.storeVisibleDayCount(next)
                    },
                    onTimelineScaleChange: { next in
                        let clamped = HomeWeekWindow.clampTimelineScale(next)
                        guard abs(clamped - weekTimelineScale) > 0.001 else { return }
                        weekTimelineScale = clamped
                        HomeWeekWindow.storeTimelineScale(clamped)
                    },
                    canPaste: calendarClipboard != nil,
                    onCreateAtSlot: { slot in
                        openNewEvent(at: slot)
                    },
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
                    onCopy: copyAgendaItem,
                    onDuplicate: duplicateAgendaItem,
                    onDelete: requestDeleteAgendaItem,
                    canPaste: calendarClipboard != nil,
                    onCreateAtSlot: { slot in
                        openNewEvent(at: slot)
                    },
                    onPasteAtSlot: { slot in
                        Task { await pasteCopiedEvent(at: slot) }
                    },
                    scrollAnchorToken: timelineScrollToken
                )
                .refreshable {
                    await store.load(using: session, around: selectedDate)
                }
            }
        }
        .background(SideSeatTheme.bg)
        .ssRootNavigationTitle("Calendar")
        .onChange(of: selectedDate) { _, newValue in
            let focus = calendarMode == .month
                ? HomeMonthGrid.dataFocus(containing: newValue, calendar: calendar)
                : newValue
            Task { await store.ensureCovers(focus, using: session) }
        }
        .onChange(of: calendarMode) { _, newMode in
            guard newMode == .month else { return }
            Task { await store.ensureCovers(monthDataFocus, using: session) }
        }
        .onChange(of: session.canMakeAuthenticatedRequests) { _, canRefresh in
            guard canRefresh else { return }
            Task { await store.load(using: session, around: calendarActionDate) }
        }
        .onChange(of: scenePhase) { _, newPhase in
            guard newPhase == .active else { return }
            Task {
                await store.refreshIfStale(using: session, around: calendarActionDate)
            }
        }
        .onReceive(NotificationCenter.default.publisher(for: .sideSeatCalendarNeedsRefresh)) { _ in
            Task<Void, Never> { @MainActor in
                await store.load(using: session, around: calendarActionDate)
            }
        }
        .sheet(item: $sheet) { destination in
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
            case .connections:
                CalendarConnectionView {
                    await store.load(using: session, around: selectedDate)
                }
            }
        }
        .fullScreenCover(
            isPresented: $showsCalendarSearch,
            onDismiss: handleCalendarSearchDismiss
        ) {
            CalendarSearchView { event in
                pendingSearchSelection = event
                showsCalendarSearch = false
            }
        }
        .sheet(item: $readOnlyItem, onDismiss: openPendingEditor) { item in
            HomeAgendaDetailView(
                item: item,
                footer: readOnlyFooter(for: item),
                canEdit: item.source == .event && detailEvent(for: item) != nil,
                canShare: item.source == .event,
                onDone: { readOnlyItem = nil },
                onEdit: {
                    pendingEditorEvent = detailEvent(for: item)
                    readOnlyItem = nil
                },
                onOpenPlan: {
                    guard let activityID = item.discoverActivityID else { return }
                    readOnlyItem = nil
                    router.navigate(to: .activity(activityID: activityID))
                }
            )
            .presentationDetents([.medium, .large])
            .accessibilityIdentifier("calendar-readonly-detail")
        }
        .ssActionPrompt(
            isPresented: pendingDeletePromptPresented,
            title: AppLocalization.string("Delete this event?"),
            systemImage: "trash.fill",
            tint: SideSeatTheme.danger,
            onDismiss: { pendingDeleteEvent = nil },
            accessibilityIdentifier: "calendar-event-delete-prompt",
            actions: { calendarDeletePromptActions }
        )
        .overlay {
            calendarFeedbackLayer
        }
        .overlay(alignment: .bottomTrailing) {
            if showsNewEventFloatingButton {
                newEventFloatingButton
                    .padding(.trailing, 16)
                    .padding(.bottom, newEventButtonBottomPadding)
                    .transition(.scale(scale: 0.9).combined(with: .opacity))
            }
        }
        .overlay(alignment: .bottomLeading) {
            homeSyncStatus
                .padding(.leading, SideSeatTheme.spaceMD)
                .padding(.bottom, 72)
        }
        .animation(.snappy(duration: 0.2), value: showsNewEventFloatingButton)
        .ssActionPrompt(
            isPresented: operationIssueBinding,
            title: AppLocalization.string("Calendar update failed"),
            message: operationIssue,
            systemImage: "exclamationmark.triangle.fill",
            tint: SideSeatTheme.danger,
            onDismiss: { operationIssue = nil },
            accessibilityIdentifier: "calendar-operation-error-prompt"
        ) {
            [
                SSActionPromptAction(
                    id: "calendar-operation-error-ok",
                    title: AppLocalization.string("OK"),
                    role: .cancel
                ) {
                    operationIssue = nil
                },
            ]
        }
        .task {
            await store.ensureCovers(selectedDate, using: session)
        }
    }

    @ViewBuilder
    private var homeSyncStatus: some View {
        if store.isLoading {
            homeSyncPill {
                ProgressView()
                    .controlSize(.mini)
                Text("Updating")
            }
            .accessibilityIdentifier("home-sync-status")
        } else if session.isRestoringConnection {
            homeSyncPill {
                ProgressView()
                    .controlSize(.mini)
                Text("Connecting")
            }
            .accessibilityIdentifier("home-sync-status")
        } else if session.isOffline {
            Button {
                Task {
                    await session.retryConnection()
                    await store.load(using: session, around: calendarActionDate)
                }
            } label: {
                homeSyncPill {
                    Image(systemName: "wifi.slash")
                    Text("Offline")
                }
            }
            .buttonStyle(SSPressButtonStyle())
            .accessibilityIdentifier("home-sync-status")
            .accessibilityHint("Reconnect and update the calendar")
        } else if store.issue != nil || store.subscriptionIssue != nil {
            Button {
                Task { await store.load(using: session, around: calendarActionDate) }
            } label: {
                homeSyncPill {
                    Image(systemName: "exclamationmark.arrow.trianglehead.2.clockwise.rotate.90")
                    Text(store.schedule == nil ? "Couldn't load" : "Saved calendar")
                }
            }
            .buttonStyle(SSPressButtonStyle())
            .accessibilityIdentifier("home-sync-status")
            .accessibilityHint("Try updating the calendar again")
        }
    }

    private func homeSyncPill<Content: View>(
        @ViewBuilder content: () -> Content
    ) -> some View {
        HStack(spacing: 7, content: content)
            .font(.caption.weight(.semibold))
            .foregroundStyle(SideSeatTheme.textSecondary)
            .padding(.horizontal, 11)
            .frame(minHeight: 34)
            .background(.regularMaterial, in: Capsule())
            .overlay {
                Capsule()
                    .strokeBorder(SideSeatTheme.separator.opacity(0.28), lineWidth: 0.5)
            }
            .shadow(color: SideSeatTheme.cardShadow, radius: 8, y: 3)
            .accessibilityElement(children: .combine)
    }

    @ViewBuilder
    private var header: some View {
        if dynamicTypeSize.isAccessibilitySize {
            VStack(alignment: .leading, spacing: 8) {
                calendarMonthTitle
                calendarHeaderUtilities
                    .frame(maxWidth: .infinity, alignment: .trailing)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        } else {
            ViewThatFits(in: .horizontal) {
                HStack(alignment: .center, spacing: 6) {
                    calendarMonthTitle
                        .fixedSize(horizontal: true, vertical: false)
                    Spacer(minLength: 4)
                    calendarHeaderUtilities
                }

                VStack(alignment: .leading, spacing: 8) {
                    calendarMonthTitle
                    calendarHeaderUtilities
                        .frame(maxWidth: .infinity, alignment: .trailing)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    private var calendarMonthTitle: some View {
        Text(calendarMode == .week ? weekViewportDate : selectedDate, format: .dateTime.month(.wide).year())
            .font(SideSeatTheme.Text.title)
            .foregroundStyle(SideSeatTheme.textPrimary)
            .lineLimit(dynamicTypeSize.isAccessibilitySize ? 2 : 1)
            .fixedSize(horizontal: false, vertical: dynamicTypeSize.isAccessibilitySize)
            .layoutPriority(1)
            .accessibilityIdentifier("calendar-month-title")
    }

    @ViewBuilder
    private var calendarViewControls: some View {
        if dynamicTypeSize.isAccessibilitySize {
            VStack(alignment: .trailing, spacing: 8) {
                calendarModePicker
                calendarTodayButton
            }
        } else {
            HStack(spacing: 10) {
                calendarModePicker
                calendarTodayButton
            }
        }
    }

    @ViewBuilder
    private var calendarHeaderUtilities: some View {
        if dynamicTypeSize.isAccessibilitySize {
            VStack(alignment: .trailing, spacing: 8) {
                calendarUtilityActions
                calendarCategoriesAction
            }
        } else {
            HStack(spacing: 8) {
                calendarUtilityActions
                calendarCategoriesAction
            }
        }
    }

    private var calendarModePicker: some View {
        Picker(AppLocalization.string("Calendar view"), selection: $calendarMode) {
            Text("Month").tag(HomeCalendarMode.month)
            Text("Week").tag(HomeCalendarMode.week)
            Text("Day").tag(HomeCalendarMode.day)
        }
        .pickerStyle(.segmented)
        .accessibilityIdentifier("calendar-view-mode")
    }

    private var calendarTodayButton: some View {
        Button {
            jumpToToday()
        } label: {
            Text("Today")
                .font(
                    dynamicTypeSize.isAccessibilitySize
                        ? .subheadline.weight(.semibold)
                        : .caption.weight(.semibold)
                )
                .foregroundStyle(SideSeatTheme.textPrimary)
                .padding(.horizontal, dynamicTypeSize.isAccessibilitySize ? 12 : 9)
                .frame(
                    minWidth: dynamicTypeSize.isAccessibilitySize ? 70 : 54,
                    minHeight: dynamicTypeSize.isAccessibilitySize ? 44 : 34
                )
                .background(CalendarChrome.todayControlFill, in: Capsule())
                .overlay {
                    Capsule()
                        .strokeBorder(SideSeatTheme.separator.opacity(0.32), lineWidth: 0.5)
                }
                .frame(minHeight: 44)
                .contentShape(Rectangle())
        }
        .buttonStyle(CalendarHeaderActionButtonStyle())
        .fixedSize(horizontal: true, vertical: false)
        .accessibilityIdentifier("home-jump-today")
    }

    private var calendarUtilityActions: some View {
        HStack(spacing: 8) {
            Button {
                performCalendarSelection { showsCalendarSearch = true }
            } label: {
                Image(systemName: "magnifyingglass")
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(SideSeatTheme.textPrimary)
                    .frame(width: 44, height: 44)
                    .contentShape(Rectangle())
            }
            .buttonStyle(CalendarHeaderActionButtonStyle())
            .background {
                RoundedRectangle(cornerRadius: 9, style: .continuous)
                    .fill(SideSeatTheme.fillTertiary)
                    .frame(height: calendarHeaderControlVisualHeight)
            }
            .overlay {
                RoundedRectangle(cornerRadius: 9, style: .continuous)
                    .strokeBorder(SideSeatTheme.separator.opacity(0.22), lineWidth: 0.5)
                    .frame(height: calendarHeaderControlVisualHeight)
            }
            .accessibilityLabel("Search events")
            .accessibilityIdentifier("calendar-search")

            Button {
                performCalendarSelection {
                    sheet = .connections
                }
            } label: {
                Image(systemName: "square.and.arrow.up")
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(SideSeatTheme.HubTint.privacySchedule)
                    .frame(width: 44, height: 44)
                    .contentShape(Rectangle())
            }
            .buttonStyle(CalendarHeaderActionButtonStyle())
            .background {
                RoundedRectangle(cornerRadius: 9, style: .continuous)
                    .fill(SideSeatTheme.HubTint.privacySchedule.opacity(0.11))
                    .frame(height: calendarHeaderControlVisualHeight)
            }
            .overlay {
                RoundedRectangle(cornerRadius: 9, style: .continuous)
                    .strokeBorder(
                        SideSeatTheme.HubTint.privacySchedule.opacity(0.22),
                        lineWidth: 0.5
                    )
                    .frame(height: calendarHeaderControlVisualHeight)
            }
            .accessibilityLabel("Calendar connections")
            .accessibilityHint("Connect Apple Calendar or transfer an iCalendar file")
            .accessibilityIdentifier("calendar-connections")
        }
        .fixedSize(horizontal: true, vertical: false)
    }

    private var calendarCategoriesAction: some View {
        Button {
            performCalendarSelection { sheet = .calendars }
        } label: {
            calendarCategoriesLabel
        }
        .buttonStyle(CalendarHeaderActionButtonStyle())
        .accessibilityLabel("Calendar categories")
        .accessibilityIdentifier("manage-calendars")
        .background {
            RoundedRectangle(cornerRadius: 9, style: .continuous)
                .fill(SideSeatTheme.fillTertiary)
                .frame(height: calendarHeaderControlVisualHeight)
        }
        .overlay {
            RoundedRectangle(cornerRadius: 9, style: .continuous)
                .strokeBorder(SideSeatTheme.separator.opacity(0.22), lineWidth: 0.5)
                .frame(height: calendarHeaderControlVisualHeight)
        }
        .fixedSize(horizontal: true, vertical: false)
    }

    @ViewBuilder
    private var calendarCategoriesLabel: some View {
        CalendarCategoriesIcon(color: calendarCategoryIconColor)
            .frame(
                width: dynamicTypeSize.isAccessibilitySize ? 23 : 18,
                height: dynamicTypeSize.isAccessibilitySize ? 22 : 18
            )
            .frame(width: 44, height: 44)
            .contentShape(Rectangle())
    }

    private var calendarHeaderControlVisualHeight: CGFloat {
        dynamicTypeSize.isAccessibilitySize ? 44 : 34
    }

    private var calendarCategoryIconColor: Color {
        let configured = store.schedule?.initialCalendarCategories.compactMap { category in
            Color(hex: category.color.trimmingCharacters(in: .whitespacesAndNewlines))
        }.first

        return configured ?? Color(hex: "#7C3AED") ?? SideSeatTheme.utilityAction
    }

    private var newEventFloatingButton: some View {
        Button {
            performCalendarSelection {
                openNewEvent(on: selectedDate)
            }
        } label: {
            Image(systemName: "plus")
                .font(.system(size: 16, weight: .bold))
                .foregroundStyle(CalendarChrome.createActionForeground)
                .frame(width: 40, height: 40)
                .background(CalendarChrome.createActionFill, in: Circle())
                .overlay {
                    Circle()
                        .strokeBorder(CalendarChrome.createActionBorder, lineWidth: 0.75)
                }
                .shadow(color: .black.opacity(0.16), radius: 8, y: 3)
                .frame(width: 44, height: 44)
                .contentShape(Circle())
        }
        .buttonStyle(SSPressButtonStyle())
        .accessibilityLabel("New event")
        .accessibilityIdentifier("new-event")
        .disabled(store.schedule == nil)
    }

    private var newEventButtonBottomPadding: CGFloat {
        calendarMode == .week
            ? weekNewEventButtonBottomPadding
            : SideSeatTheme.spaceMD
    }

    private var weekNewEventButtonBottomPadding: CGFloat {
        dynamicTypeSize.isAccessibilitySize ? 70 : 58
    }

    private var showsNewEventFloatingButton: Bool {
        pendingMove == nil
            && !isMovingEvent
            && pendingDeleteEvent == nil
            && !isDeletingEvent
            && calendarNotice == nil
    }

    private var agendaItems: [HomeAgendaItem] {
        store.agendaItemsByDay[calendar.startOfDay(for: selectedDate)] ?? []
    }

    private var monthDataFocus: Date {
        HomeMonthGrid.dataFocus(containing: selectedDate, calendar: calendar)
    }

    private var smartScheduleEnabled: Bool {
        clientConfiguration.configuration?.features["naturalLanguageSchedule"] == true
    }

    private var calendarActionDate: Date {
        switch calendarMode {
        case .month: monthDataFocus
        case .week: weekViewportDate
        case .day: selectedDate
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

    private func detailEvent(for item: HomeAgendaItem) -> NativeHomeStudyEntry? {
        event(withID: item.id) ?? searchDetailEvent.flatMap { $0.id == item.id ? $0 : nil }
    }

    private var operationIssueBinding: Binding<Bool> {
        Binding(
            get: { operationIssue != nil },
            set: { if !$0 { operationIssue = nil } }
        )
    }

    private var pendingDeletePromptPresented: Binding<Bool> {
        Binding(
            get: { pendingDeleteEvent != nil },
            set: { if !$0 { pendingDeleteEvent = nil } }
        )
    }

    private var calendarDeletePromptActions: [SSActionPromptAction] {
        guard let event = pendingDeleteEvent else { return [] }
        let isRecurring = event.repeatRule != NativeCalendarRepeatRule.none.rawValue

        var actions = [
            SSActionPromptAction(
                id: "calendar-event-delete-this",
                title: AppLocalization.string(
                    isRecurring ? "Delete this event" : "Delete event"
                ),
                systemImage: "trash",
                role: .destructive
            ) {
                performDelete(event, scope: "this")
            },
        ]

        if isRecurring {
            actions.append(
                SSActionPromptAction(
                    id: "calendar-event-delete-future",
                    title: AppLocalization.string("Delete this and future events"),
                    systemImage: "calendar.badge.minus",
                    role: .destructive
                ) {
                    performDelete(event, scope: "future")
                }
            )
            actions.append(
                SSActionPromptAction(
                    id: "calendar-event-delete-all",
                    title: AppLocalization.string("Delete all events"),
                    systemImage: "trash.slash",
                    role: .destructive
                ) {
                    performDelete(event, scope: "all")
                }
            )
        }

        actions.append(
            SSActionPromptAction(
                id: "calendar-event-delete-cancel",
                title: AppLocalization.string("Cancel"),
                systemImage: "xmark",
                role: .cancel
            ) {
                pendingDeleteEvent = nil
            }
        )
        return actions
    }

    private func moveActionTitle(for destination: CalendarMoveDestination) -> String {
        switch destination.kind {
        case .move:
            return String(
                format: AppLocalization.string( "Move to %@?"),
                destination.start.formatted(date: .abbreviated, time: .shortened)
            )
        case .resize:
            return String(
                format: AppLocalization.string("Change time to %@?"),
                adjustmentRangeLabel(for: destination)
            )
        }
    }

    private func adjustmentRangeLabel(for destination: CalendarMoveDestination) -> String {
        let date = destination.start.formatted(date: .abbreviated, time: .omitted)
        let range = CalendarChrome.compactTimeRange(
            from: destination.start,
            to: destination.end,
            calendar: calendar
        )
        return "\(date)  \(range)"
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

    private func openNewEvent(on day: Date) {
        openNewEvent(
            at: CalendarEventTiming.defaultStart(
                on: day,
                calendar: calendar
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

    private func openSearchResult(_ event: NativeHomeStudyEntry) {
        guard
            let start = Date.sideSeatISO8601(event.startISO),
            let end = Date.sideSeatISO8601(event.endISO),
            end > start
        else { return }

        selectedDate = start
        weekViewportDate = start
        searchDetailEvent = event
        readOnlyItem = HomeAgendaItem(
            id: event.id,
            title: event.title,
            start: start,
            end: end,
            location: event.location,
            note: event.note,
            colorHex: event.categoryColor,
            categoryName: event.categoryName,
            repeatRule: event.repeatRule,
            repeatUntil: event.repeatUntilISO.flatMap(Date.sideSeatISO8601),
            source: .event,
            withLabel: event.withLabel,
            participantNames: event.eventParticipants.map(\.name),
            discoverActivityID: event.discoverActivityId
        )
        Task { await store.ensureCovers(start, using: session) }
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
        let event = pendingEditorEvent
        pendingEditorEvent = nil
        searchDetailEvent = nil
        guard let event else { return }
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

    private func requestDeleteAgendaItem(_ item: HomeAgendaItem) {
        guard item.source == .event, let event = event(withID: item.id) else { return }
        Task { @MainActor in
            // Let the action menu dismiss before presenting the destructive scope dialog.
            await Task.yield()
            pendingDeleteEvent = event
        }
    }

    private func dragMoveAgendaItem(_ item: HomeAgendaItem, to start: Date) {
        guard
            item.source == .event,
            let event = event(withID: item.id),
            let transfer = CalendarEventTransfer(event: event)
        else { return }
        withAnimation(.snappy(duration: 0.2)) {
            calendarNotice = nil
            pendingMove = CalendarMoveDestination(
                event: event,
                start: start,
                end: start.addingTimeInterval(transfer.duration),
                kind: .move
            )
        }
    }

    private func dragResizeAgendaItem(
        _ item: HomeAgendaItem,
        to start: Date,
        end: Date
    ) {
        guard item.source == .event, end > start, let event = event(withID: item.id) else {
            return
        }
        withAnimation(.snappy(duration: 0.2)) {
            calendarNotice = nil
            pendingMove = CalendarMoveDestination(
                event: event,
                start: start,
                end: end,
                kind: .resize
            )
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
            }

            Group {
                if isMovingEvent, let activeMoveDestination {
                    moveProgressPanel(for: activeMoveDestination)
                        .transition(.move(edge: .bottom).combined(with: .opacity))
                } else if let pendingMove {
                    moveConfirmationPanel(for: pendingMove)
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
        if isMovingEvent {
            return "updating-\(activeMoveDestination?.id.uuidString ?? "")"
        }
        if let pendingMove {
            return "confirm-\(pendingMove.kind)-\(pendingMove.id.uuidString)"
        }
        if let calendarNotice { return "notice-\(calendarNotice.id.uuidString)" }
        return "none"
    }

    private func moveConfirmationPanel(for destination: CalendarMoveDestination) -> some View {
        let isRecurring = CalendarEventTransfer(event: destination.event)?.isRecurring == true
        let isResize = destination.kind == .resize
        return calendarFloatingPanel {
            VStack(alignment: .leading, spacing: SideSeatTheme.spaceMD) {
                HStack(alignment: .top, spacing: SideSeatTheme.spaceMD) {
                    Image(systemName: "calendar.badge.clock")
                        .font(.body.weight(.semibold))
                        .foregroundStyle(SideSeatTheme.HubTint.plans)
                        .frame(width: 38, height: 38)
                        .background(SideSeatTheme.HubTint.plans.opacity(0.12), in: Circle())

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
                            .ssIconButtonHitTarget()
                    }
                    .buttonStyle(SSPressButtonStyle())
                    .foregroundStyle(SideSeatTheme.textSecondary)
                    .accessibilityLabel("Cancel")
                }

                HStack(spacing: SideSeatTheme.spaceSM) {
                    SSSecondaryButton(
                        title: AppLocalization.string( "Cancel"),
                        kind: .softFill,
                        fontWeight: .semibold,
                        accessibilityID: isResize
                            ? "calendar-resize-cancel-confirmation"
                            : "calendar-move-cancel-confirmation"
                    ) {
                        cancelMove()
                    }

                    SSPrimaryButton(
                        title: isRecurring
                            ? AppLocalization.string( "Only this event")
                            : AppLocalization.string(isResize ? "Adjust event time" : "Move event"),
                        fill: .product,
                        height: 44,
                        accessibilityID: isResize
                            ? (isRecurring ? "calendar-resize-this" : "calendar-resize-confirm")
                            : (isRecurring ? "calendar-move-this" : "calendar-move-confirm")
                    ) {
                        performMove(destination, scope: "this")
                    }
                }

                if isRecurring {
                    HStack(spacing: SideSeatTheme.spaceSM) {
                        moveSeriesScopeButton(
                            title: AppLocalization.string( "This and future events"),
                            accessibilityID: isResize
                                ? "calendar-resize-future"
                                : "calendar-move-future"
                        ) {
                            performMove(destination, scope: "future")
                        }
                        moveSeriesScopeButton(
                            title: AppLocalization.string( "All events"),
                            accessibilityID: isResize
                                ? "calendar-resize-all"
                                : "calendar-move-all"
                        ) {
                            performMove(destination, scope: "all")
                        }
                    }
                }
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier(
            isResize ? "calendar-resize-confirmation" : "calendar-move-confirmation"
        )
    }

    private func moveProgressPanel(for destination: CalendarMoveDestination) -> some View {
        let isResize = destination.kind == .resize
        return calendarFloatingPanel {
            HStack(spacing: SideSeatTheme.spaceMD) {
                ProgressView()
                    .controlSize(.regular)
                    .tint(SideSeatTheme.HubTint.plans)
                    .frame(width: 38, height: 38)

                VStack(alignment: .leading, spacing: 3) {
                    Text(
                        isResize
                            ? String(
                                format: AppLocalization.string("Adjusting %@"),
                                destination.event.title
                            )
                            : String(
                                format: AppLocalization.string( "Moving %@"),
                                destination.event.title
                            )
                    )
                        .font(.subheadline.weight(.semibold))
                        .lineLimit(1)
                    Text(
                        isResize
                            ? adjustmentRangeLabel(for: destination)
                            : String(
                                format: AppLocalization.string( "Move event to %@"),
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
        .accessibilityIdentifier(isResize ? "calendar-resize-progress" : "calendar-move-progress")
    }

    private func calendarNoticePanel(_ notice: CalendarNotice) -> some View {
        calendarFloatingPanel {
            HStack(spacing: SideSeatTheme.spaceMD) {
                Image(systemName: notice.systemImage)
                    .font(.title3.weight(.semibold))
                    .foregroundStyle(notice.isSuccess ? SideSeatTheme.success : SideSeatTheme.warning)
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
        .buttonStyle(SSPressButtonStyle())
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

    private func performDelete(_ event: NativeHomeStudyEntry, scope: String) {
        Task { await deleteEvent(event, scope: scope) }
    }

    private func cancelMove() {
        withAnimation(.snappy(duration: 0.2)) {
            pendingMove = nil
            activeMoveDestination = nil
        }
    }

    private func copyEvent(_ event: NativeHomeStudyEntry) {
        guard let transfer = CalendarEventTransfer(event: event) else { return }
        calendarClipboard = transfer
        UIPasteboard.general.string = transfer.plainText(timeZone: calendar.timeZone)
        showCalendarNotice(
            AppLocalization.string( "Copied"),
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

    private func handleCalendarSearchDismiss() {
        if let event = pendingSearchSelection {
            pendingSearchSelection = nil
            Task { @MainActor in
                await Task.yield()
                openSearchResult(event)
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
    private func deleteEvent(_ event: NativeHomeStudyEntry, scope: String) async {
        guard !isDeletingEvent else { return }
        isDeletingEvent = true
        pendingDeleteEvent = nil
        calendarNotice = nil
        operationIssue = nil
        defer { isDeletingEvent = false }

        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("--ui-testing-authenticated") {
            store.applyUITestingDelete(eventID: event.id)
            showCalendarNotice(
                AppLocalization.string("Event deleted"),
                systemImage: "trash.fill"
            )
            return
        }
        #endif

        do {
            let _: APIEnvelope<CalendarDeleteResult> = try await session.sendAuthorized(
                "api/v1/calendar/events/\(event.id)",
                method: .delete,
                queryItems: [URLQueryItem(name: "scope", value: scope)],
                idempotencyKey: UUID().uuidString
            )
            let focus = Date.sideSeatISO8601(event.startISO) ?? selectedDate
            await store.load(using: session, around: focus)
            showCalendarNotice(
                AppLocalization.string("Event deleted"),
                systemImage: "trash.fill"
            )
        } catch {
            operationIssue = error.localizedDescription
        }
    }

    @MainActor
    private func moveEvent(_ destination: CalendarMoveDestination, scope: String) async {
        guard !isMovingEvent, let transfer = CalendarEventTransfer(event: destination.event) else { return }
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
                end: destination.end,
                detachSeries: transfer.isRecurring && scope == "this"
            )
            selectedDate = destination.start
            showTimingAdjustmentNotice(destination)
            return
        }
        #endif

        do {
            let _: APIEnvelope<CalendarUpdateResult> = try await session.sendAuthorized(
                "api/v1/calendar/events/\(destination.event.id)",
                method: .patch,
                body: transfer.timingRequest(
                    startingAt: destination.start,
                    endingAt: destination.end
                ),
                queryItems: [URLQueryItem(name: "scope", value: scope)],
                idempotencyKey: UUID().uuidString
            )
            await store.load(using: session, around: destination.start)
            selectedDate = destination.start
            showTimingAdjustmentNotice(destination)
        } catch {
            operationIssue = error.localizedDescription
        }
    }

    private func showTimingAdjustmentNotice(_ destination: CalendarMoveDestination) {
        UINotificationFeedbackGenerator().notificationOccurred(.success)
        let message: String
        switch destination.kind {
        case .move:
            message = String(
                format: AppLocalization.string( "Moved to %@"),
                destination.start.formatted(date: .abbreviated, time: .shortened)
            )
        case .resize:
            message = String(
                format: AppLocalization.string("Time changed to %@"),
                adjustmentRangeLabel(for: destination)
            )
        }
        showCalendarNotice(message, systemImage: "checkmark.circle.fill")
    }
}

private struct CalendarHeaderActionButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .background(
                configuration.isPressed ? Color.primary.opacity(0.08) : Color.clear,
                in: RoundedRectangle(cornerRadius: 7, style: .continuous)
            )
            .scaleEffect(configuration.isPressed ? 0.96 : 1)
            .opacity(configuration.isPressed ? SideSeatTheme.Interaction.pressedOpacity : 1)
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
    let end: Date
    let kind: CalendarTimingAdjustmentKind
}

private enum CalendarTimingAdjustmentKind: Equatable {
    case move
    case resize
}

private struct CalendarNotice: Identifiable {
    let id = UUID()
    let text: String
    let systemImage: String
    let isSuccess: Bool
}

private struct CalendarCategoriesIcon: View {
    let color: Color

    var body: some View {
        Image(systemName: "calendar")
            .symbolRenderingMode(.monochrome)
            .foregroundStyle(color)
            .font(.system(size: 16, weight: .semibold))
            .accessibilityHidden(true)
    }
}

private enum HomeSheet: Identifiable {
    case event(CalendarEventEditorContext)
    case calendars
    case connections

    var id: String {
        switch self {
        case .event(let context): "event-\(context.id.uuidString)"
        case .calendars: "calendars"
        case .connections: "connections"
        }
    }
}

private struct HomeAgendaDetailView: View {
    let item: HomeAgendaItem
    let footer: LocalizedStringKey?
    let canEdit: Bool
    let canShare: Bool
    let onDone: () -> Void
    let onEdit: () -> Void
    let onOpenPlan: () -> Void

    @State private var showsEventShare = false

    var body: some View {
        NavigationStack {
            List {
                Section {
                    Text(item.title)
                        .font(.title3.weight(.semibold))

                    Label {
                        Text(CalendarChrome.eventContextLabel(for: item))
                    } icon: {
                        Image(systemName: CalendarChrome.eventContextSymbol(for: item) ?? "calendar")
                            .foregroundStyle(CalendarChrome.eventColor(for: item))
                    }
                } footer: {
                    if let footer {
                        Text(footer)
                    }
                }

                Section("When") {
                    detailRow(
                        label: "Starts",
                        value: formattedDateTime(item.start),
                        systemImage: "calendar.badge.clock",
                        identifier: "calendar-detail-start"
                    )
                    detailRow(
                        label: "Ends",
                        value: formattedDateTime(item.end),
                        systemImage: "calendar.badge.checkmark",
                        identifier: "calendar-detail-end"
                    )
                    detailRow(
                        label: "Duration",
                        value: formattedDuration,
                        systemImage: "timer",
                        identifier: "calendar-detail-duration"
                    )
                    detailRow(
                        label: "Repeat",
                        value: repeatRule.localizedLabel,
                        systemImage: "repeat",
                        identifier: "calendar-detail-repeat"
                    )
                    if repeatRule != .none {
                        detailRow(
                            label: "Repeat until",
                            value: item.repeatUntil.map(formattedDate) ?? AppLocalization.string("Never"),
                            systemImage: "calendar.badge.minus",
                            identifier: "calendar-detail-repeat-until"
                        )
                    }
                }

                if showsDetailsSection {
                    Section("Details") {
                        if showsCalendarCategory {
                            calendarCategoryRow
                        }
                        if let location = normalized(item.location) {
                            detailRow(
                                label: "Location",
                                value: location,
                                systemImage: "mappin.and.ellipse",
                                identifier: "calendar-detail-location"
                            )
                        }
                        if let note = normalized(item.note) {
                            detailRow(
                                label: "Notes",
                                value: note,
                                systemImage: "note.text",
                                identifier: "calendar-detail-notes"
                            )
                        }
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
                if canShare {
                    ToolbarItem(placement: .primaryAction) {
                        Button {
                            showsEventShare = true
                        } label: {
                            Image(systemName: "square.and.arrow.up")
                        }
                        .accessibilityLabel("Share event details")
                        .accessibilityIdentifier("calendar-detail-share-event")
                    }
                }
                if canEdit {
                    ToolbarItem(placement: .confirmationAction) {
                        Button("Edit", action: onEdit)
                            .accessibilityIdentifier("calendar-detail-edit")
                    }
                }
            }
        }
        .sheet(isPresented: $showsEventShare) {
            CalendarEventShareSheet(item: item)
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

    private var repeatRule: NativeCalendarRepeatRule {
        NativeCalendarRepeatRule(rawValue: item.repeatRule) ?? .none
    }

    private var showsCalendarCategory: Bool {
        item.source == .event || item.source == .subscription
    }

    private var showsDetailsSection: Bool {
        showsCalendarCategory || normalized(item.location) != nil || normalized(item.note) != nil
    }

    private var calendarCategoryRow: some View {
        HStack(alignment: .top, spacing: SideSeatTheme.spaceMD) {
            ZStack {
                Circle()
                    .fill(Color(hex: item.colorHex) ?? SideSeatTheme.textSecondary)
                Circle()
                    .stroke(Color.primary.opacity(0.16), lineWidth: 0.5)
            }
            .frame(width: 18, height: 18)
            .frame(width: 24, height: 24)
            .accessibilityHidden(true)

            VStack(alignment: .leading, spacing: 3) {
                Text("Calendar")
                    .font(.caption)
                    .foregroundStyle(SideSeatTheme.textSecondary)
                Text(normalized(item.categoryName) ?? AppLocalization.string("None"))
                    .foregroundStyle(SideSeatTheme.textPrimary)
            }
        }
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier("calendar-detail-category")
    }

    private func detailRow(
        label: LocalizedStringKey,
        value: String,
        systemImage: String,
        identifier: String
    ) -> some View {
        HStack(alignment: .top, spacing: SideSeatTheme.spaceMD) {
            Image(systemName: systemImage)
                .foregroundStyle(SideSeatTheme.textSecondary)
                .frame(width: 24, height: 24)
                .accessibilityHidden(true)

            VStack(alignment: .leading, spacing: 3) {
                Text(label)
                    .font(.caption)
                    .foregroundStyle(SideSeatTheme.textSecondary)
                Text(value)
                    .foregroundStyle(SideSeatTheme.textPrimary)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier(identifier)
    }

    private func formattedDateTime(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.locale = AppLocalization.selectedLanguage.locale
        formatter.calendar = Calendar.sideSeatBerlin
        formatter.timeZone = Calendar.sideSeatBerlin.timeZone
        formatter.dateStyle = .long
        formatter.timeStyle = .short
        return formatter.string(from: date)
    }

    private func formattedDate(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.locale = AppLocalization.selectedLanguage.locale
        formatter.calendar = Calendar.sideSeatBerlin
        formatter.timeZone = Calendar.sideSeatBerlin.timeZone
        formatter.dateStyle = .long
        formatter.timeStyle = .none
        return formatter.string(from: date)
    }

    private var formattedDuration: String {
        let formatter = DateComponentsFormatter()
        formatter.allowedUnits = item.end.timeIntervalSince(item.start) >= 3_600
            ? [.hour, .minute]
            : [.minute]
        formatter.unitsStyle = .abbreviated
        formatter.maximumUnitCount = 2
        formatter.zeroFormattingBehavior = .dropAll
        var calendar = Calendar.sideSeatBerlin
        calendar.locale = AppLocalization.selectedLanguage.locale
        formatter.calendar = calendar
        return formatter.string(from: max(0, item.end.timeIntervalSince(item.start))) ?? ""
    }

    private func normalized(_ value: String?) -> String? {
        guard let value else { return nil }
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? nil : trimmed
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
