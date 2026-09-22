import SwiftUI
import UIKit

/// Native phone week timetable: configurable day columns, shared time axis.
/// Column headers are the week date navigator and drill into Day view.
struct HomeWeekTimetableView: View {
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    @Environment(\.accessibilityReduceMotion) private var accessibilityReduceMotion
    @Environment(\.colorSchemeContrast) private var colorSchemeContrast

    let focusDate: Date
    let visibleDayCount: Int
    let timelineScale: CGFloat
    let itemsByDay: [Date: [HomeAgendaItem]]
    let onFocusDate: (Date) -> Void
    /// Reports horizontal viewport movement without turning it into date selection.
    let onViewportDateChange: (Date) -> Void
    /// Tap a column header to leave Week and open Day for that date.
    let onOpenDay: (Date) -> Void
    let onOpen: (HomeAgendaItem) -> Void
    let onCopy: (HomeAgendaItem) -> Void
    let onDuplicate: (HomeAgendaItem) -> Void
    let onDelete: (HomeAgendaItem) -> Void
    /// Direct drag-move from an event card to a new start time.
    let onDragMove: (HomeAgendaItem, Date) -> Void
    /// Direct edge-resize from an event card to a new start/end range.
    let onDragResize: (HomeAgendaItem, Date, Date) -> Void
    let onVisibleDayCountChange: (Int) -> Void
    let onTimelineScaleChange: (CGFloat) -> Void
    let canPaste: Bool
    let onCreateAtSlot: (Date) -> Void
    let onPasteAtSlot: (Date) -> Void
    /// Bumped by Home "Today" to re-anchor near now without chasing the clock.
    var scrollAnchorToken: Int = 0

    @State private var viewportStart: Date?
    @State private var menuEvent: HomeAgendaItem?
    @State private var menuSlot: Date?
    @State private var dragPreview: WeekDragPreview?
    @State private var armedEventID: String?
    @State private var activeEventDragOperation: HomeWeekWindow.EventDragOperation?
    /// Live horizontal day-shift offset (positive = reveal previous days).
    @State private var panOffset: CGFloat = 0
    @State private var isCommittingDayShift = false
    @State private var lockedScrollAxis: HomeWeekWindow.ScrollAxis?
    @State private var displayedScrollFeedbackEdge: HomeWeekWindow.ScrollFeedbackEdge?
    @State private var scrollIndicatorDismissTask: Task<Void, Never>?
    /// The time slot currently nearest the top edge of the vertical viewport.
    /// The binding continuously records the user's viewport so a density change
    /// can restore that exact clock-time anchor without returning near `focusDate`.
    @State private var verticalScrollPositionID: String?
    @State private var liveTimelineScale: CGFloat?
    @State private var pinchStartTimelineScale: CGFloat?
    @State private var pinchAnchorMinute: CGFloat?
    @State private var pinchAnchorFraction: CGFloat = 0.5
    @State private var lastPinchFeedbackScale: CGFloat?
    @State private var verticalViewportHeight: CGFloat = 1
    @State private var showsTimelineZoomHint = false
    @State private var timelineZoomHintTask: Task<Void, Never>?

    private let calendar = Calendar.sideSeatBerlin
    private let timeGutter = CalendarChrome.weekTimeGutter
    private let headerHeight = CalendarChrome.weekHeaderHeight
    private static let verticalScrollPositionStepMinutes = 5
    private static let denseCalendarStressTestEnabled =
        ProcessInfo.processInfo.arguments.contains("--ui-testing-dense-calendar")
    private static let exposesScrollAnchorsForUITesting =
        ProcessInfo.processInfo.arguments.contains("--ui-testing-expose-scroll-anchors")
    private static let exposesScrollDirectionForUITesting =
        ProcessInfo.processInfo.arguments.contains("--ui-testing-expose-scroll-direction-indicator")
    private static let exposesTimelineScaleForUITesting =
        ProcessInfo.processInfo.arguments.contains("--ui-testing-expose-timeline-scale")
    private static let isUITesting =
        ProcessInfo.processInfo.arguments.contains { $0.hasPrefix("--ui-testing") }

    private var dayCount: Int {
        HomeWeekWindow.clampVisibleDayCount(visibleDayCount)
    }

    private var effectiveTimelineScale: CGFloat {
        HomeWeekWindow.clampTimelineScale(liveTimelineScale ?? timelineScale)
    }

    private var minuteHeight: CGFloat {
        CalendarChrome.weekMinuteHeight * effectiveTimelineScale
    }

    var body: some View {
        let start = viewportStart ?? HomeWeekWindow.viewportStart(
            containing: focusDate,
            visibleDayCount: dayCount,
            calendar: calendar
        )
        let days = HomeWeekWindow.days(
            from: start,
            count: dayCount,
            calendar: calendar
        )
        let strip = stripDays(from: start)
        let hasAllDay = strip.contains { day in
            !items(on: day).filter {
                $0.isAllDayStyle(on: day, calendar: calendar)
            }.isEmpty
        }

        GeometryReader { geometry in
            // Floor widths so header + grid columns share exact pixel sizes.
            let dayWidth = HomeWeekWindow.dayColumnWidth(
                containerWidth: geometry.size.width,
                timeGutter: timeGutter,
                visibleDayCount: dayCount
            )
            let daysWidth = dayWidth * CGFloat(dayCount)
            let stripWidth = dayWidth * CGFloat(strip.count)
            let gridHeight = minuteHeight * 24 * 60
            let contentHeight = gridHeight + CalendarChrome.timelineEndCapHeight
            let stripX = -dayWidth + panOffset

            ZStack(alignment: .topTrailing) {
                VStack(spacing: 0) {
                    headerRow(
                        strip: strip,
                        visibleDays: days,
                        dayWidth: dayWidth,
                        daysWidth: daysWidth,
                        stripWidth: stripWidth,
                        stripX: stripX
                    )
                    Rectangle()
                        .fill(CalendarChrome.headerDivider)
                        .frame(height: CalendarChrome.headerDividerThickness)
                        .allowsHitTesting(false)
                    if hasAllDay {
                        allDayRow(
                            strip: strip,
                            dayWidth: dayWidth,
                            daysWidth: daysWidth,
                            stripWidth: stripWidth,
                            stripX: stripX
                        )
                        Rectangle()
                            .fill(CalendarChrome.hourLine)
                            .frame(height: CalendarChrome.hourLineThickness)
                            .allowsHitTesting(false)
                    }
                    ScrollViewReader { proxy in
                        ScrollView(.vertical) {
                            ZStack(alignment: .topLeading) {
                                HStack(alignment: .top, spacing: 0) {
                                    timeGutterColumn(gridHeight: gridHeight, contentHeight: contentHeight)
                                    HStack(alignment: .top, spacing: 0) {
                                        ForEach(strip, id: \.self) { day in
                                            dayColumn(
                                                day: day,
                                                width: dayWidth,
                                                height: gridHeight,
                                                days: days,
                                                dayWidth: dayWidth
                                            )
                                        }
                                    }
                                    .frame(width: stripWidth, alignment: .leading)
                                    .offset(x: stripX)
                                    .frame(width: daysWidth, alignment: .leading)
                                    .clipped()
                                }
                                .frame(width: timeGutter + daysWidth, alignment: .leading)

                                if strip.contains(where: { calendar.isDateInToday($0) }) {
                                    weekNowIndicator(
                                        strip: strip,
                                        dayWidth: dayWidth,
                                        daysWidth: daysWidth,
                                        stripWidth: stripWidth,
                                        stripX: stripX
                                    )
                                }

                                if let dragPreview {
                                    dragTargetGuide(dragPreview, dayWidth: dayWidth)
                                    dragPreviewCard(
                                        dragPreview,
                                        dayWidth: dayWidth,
                                        days: days
                                    )
                                }
                            }
                            .frame(
                                width: timeGutter + daysWidth,
                                height: contentHeight,
                                alignment: .topLeading
                            )
                            .contentShape(Rectangle())
                        }
                        .contentShape(Rectangle())
                        .simultaneousGesture(dayShiftGesture(from: start, dayWidth: dayWidth))
                        .simultaneousGesture(timelineMagnifyGesture(proxy: proxy))
                        .scrollDisabled(
                            armedEventID != nil
                                || dragPreview != nil
                                || liveTimelineScale != nil
                                || lockedScrollAxis == .horizontal
                                || abs(panOffset) > 0.5
                        )
                        .scrollIndicators(.hidden)
                        .scrollPosition(id: $verticalScrollPositionID, anchor: .top)
                        .background {
                            GeometryReader { scrollGeometry in
                                Color.clear
                                    .onAppear {
                                        verticalViewportHeight = max(1, scrollGeometry.size.height)
                                    }
                                    .onChange(of: scrollGeometry.size.height) { _, nextHeight in
                                        verticalViewportHeight = max(1, nextHeight)
                                    }
                            }
                        }
                        .overlay {
                            scrollDirectionIndicator(daysWidth: daysWidth)
                        }
                        .overlay {
                            offscreenEventIndicators(
                                days: days,
                                dayWidth: dayWidth,
                                proxy: proxy
                            )
                        }
                        .overlay(alignment: .bottom) {
                            timelineZoomHint
                        }
                        .onChange(of: timelineScale) { _, _ in
                            guard pinchStartTimelineScale == nil else { return }
                            guard let preservedID = verticalScrollPositionID else { return }
                            var transaction = Transaction()
                            transaction.disablesAnimations = true
                            withTransaction(transaction) {
                                proxy.scrollTo(preservedID, anchor: .top)
                            }
                        }
                        // Horizontal paging preserves the current vertical position.
                        // Only Today bumps this token and explicitly asks for a fresh
                        // anchor near the current time.
                        .task(id: scrollAnchorToken) {
                            await Task.yield()
                            let target = verticalScrollSlotID(for: focusDate)
                            var transaction = Transaction()
                            transaction.disablesAnimations = true
                            withTransaction(transaction) {
                                verticalScrollPositionID = target
                                proxy.scrollTo(target, anchor: .top)
                            }
                        }
                        .accessibilityZoomAction { action in
                            adjustTimelineScaleForAccessibility(action.direction)
                        }
                        .accessibilityHint("Use zoom actions to adjust time spacing")
                    }
                }

            }
        }
        .frame(
            minHeight: dynamicTypeSize.isAccessibilitySize ? 0 : 420,
            maxHeight: .infinity
        )
        .background(SideSeatTheme.bg)
        .safeAreaInset(edge: .bottom, spacing: 0) {
            weekDisplayBar
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("home-week-timetable")
        .accessibilityValue(
            Self.exposesTimelineScaleForUITesting
                ? String(format: "%.3f", Double(effectiveTimelineScale))
                : Self.exposesScrollDirectionForUITesting
                ? displayedScrollFeedbackEdge?.rawValue ?? "idle"
                : Self.exposesScrollAnchorsForUITesting
                    ? verticalScrollPositionID ?? ""
                    : ""
        )
        .ssLongPressActionMenu(
            isPresented: Binding(
                get: { menuSlot != nil },
                set: { if !$0 { menuSlot = nil } }
            ),
            title: menuSlot.map { slotMenuTitle(for: $0) }
                ?? AppLocalization.string("New event"),
            actions: slotMenuActions
        )
        .onAppear {
            if viewportStart == nil {
                let initialStart = HomeWeekWindow.viewportStart(
                    containing: focusDate,
                    visibleDayCount: dayCount,
                    calendar: calendar
                )
                viewportStart = initialStart
                onViewportDateChange(initialStart)
            }
            showTimelineZoomHintIfNeeded()
        }
        .onChange(of: focusDate) { _, newValue in
            guard !isCommittingDayShift, abs(panOffset) < 0.5 else { return }
            let next = HomeWeekWindow.viewportStart(
                containing: newValue,
                visibleDayCount: dayCount,
                calendar: calendar
            )
            let current = viewportStart ?? next
            let visible = HomeWeekWindow.days(
                from: current,
                count: dayCount,
                calendar: calendar
            )
            if !visible.contains(where: { calendar.isDate($0, inSameDayAs: newValue) }) {
                var transaction = Transaction()
                transaction.disablesAnimations = true
                withTransaction(transaction) {
                    viewportStart = next
                    panOffset = 0
                }
                onViewportDateChange(next)
            }
        }
        .onChange(of: dayCount) { _, _ in
            let next = HomeWeekWindow.viewportStart(
                containing: focusDate,
                visibleDayCount: dayCount,
                calendar: calendar
            )
            var transaction = Transaction()
            transaction.disablesAnimations = true
            withTransaction(transaction) {
                viewportStart = next
                panOffset = 0
                isCommittingDayShift = false
                armedEventID = nil
                dragPreview = nil
                activeEventDragOperation = nil
            }
            clearScrollDirectionIndicator()
            onViewportDateChange(next)
        }
        .onChange(of: scrollAnchorToken) { _, _ in
            let next = HomeWeekWindow.viewportStart(
                containing: focusDate,
                visibleDayCount: dayCount,
                calendar: calendar
            )
            var transaction = Transaction()
            transaction.disablesAnimations = true
            withTransaction(transaction) {
                viewportStart = next
                panOffset = 0
                isCommittingDayShift = false
                armedEventID = nil
                dragPreview = nil
                activeEventDragOperation = nil
            }
            clearScrollDirectionIndicator()
            onViewportDateChange(next)
        }
        .onDisappear {
            scrollIndicatorDismissTask?.cancel()
            timelineZoomHintTask?.cancel()
            activeEventDragOperation = nil
            liveTimelineScale = nil
            pinchStartTimelineScale = nil
        }
    }

    /// Previous day + visible window + next day, for live peek while panning.
    private func stripDays(from start: Date) -> [Date] {
        let visible = HomeWeekWindow.days(from: start, count: dayCount, calendar: calendar)
        let prev = calendar.date(byAdding: .day, value: -1, to: start) ?? start
        let nextAnchor = calendar.date(byAdding: .day, value: dayCount, to: start) ?? start
        return [prev] + visible + [nextAnchor]
    }

    private func slotMenuTitle(for slot: Date) -> String {
        String(
            format: AppLocalization.string( "New event at %@"),
            slot.formatted(date: .omitted, time: .shortened)
        )
    }

    private var slotMenuActions: [SSLongPressAction] {
        guard let slot = menuSlot else { return [] }
        var actions = [
            SSLongPressAction(
                id: "calendar-slot-context-new-event",
                title: AppLocalization.string("New event"),
                systemImage: "calendar.badge.plus",
                perform: {
                    onFocusDate(slot)
                    onCreateAtSlot(slot)
                }
            ),
        ]
        if canPaste {
            actions.append(
                SSLongPressAction(
                    id: "calendar-slot-context-paste-event",
                    title: AppLocalization.string("Paste copied event"),
                    systemImage: "doc.on.clipboard",
                    perform: {
                        onFocusDate(slot)
                        onPasteAtSlot(slot)
                    }
                )
            )
        }
        return actions
    }

    private func headerRow(
        strip: [Date],
        visibleDays: [Date],
        dayWidth: CGFloat,
        daysWidth: CGFloat,
        stripWidth: CGFloat,
        stripX: CGFloat
    ) -> some View {
        HStack(spacing: 0) {
            Color.clear.frame(width: timeGutter, height: headerHeight)
            HStack(spacing: 0) {
                ForEach(strip, id: \.self) { day in
                    let isVisible = visibleDays.contains {
                        calendar.isDate($0, inSameDayAs: day)
                    }
                    dayHeader(day: day, isVisible: isVisible)
                        .frame(width: dayWidth, height: headerHeight)
                }
            }
            .frame(width: stripWidth, alignment: .leading)
            .offset(x: stripX)
            .frame(width: daysWidth, alignment: .leading)
            .clipped()
        }
        .frame(width: timeGutter + daysWidth, alignment: .leading)
    }

    private func dayHeader(day: Date, isVisible: Bool) -> some View {
        let isToday = calendar.isDateInToday(day)

        return Button {
            onOpenDay(day)
        } label: {
            CalendarDayChipLabel(
                day: day,
                selected: false,
                isToday: isToday,
                style: .weekHeader,
                calendar: calendar
            )
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .contentShape(Rectangle())
        }
        .buttonStyle(SSPressButtonStyle())
        .accessibilityLabel(
            String(
                format: AppLocalization.string( "Open day %@"),
                day.formatted(date: .complete, time: .omitted)
            )
        )
        .accessibilityHint("Switches to Day view")
        .accessibilityHidden(!isVisible)
        .accessibilityIdentifier(
            "home-week-\(isVisible ? "day" : "buffer-day")-\(dayID(day))"
        )
    }

    private func timeGutterColumn(gridHeight: CGFloat, contentHeight: CGFloat) -> some View {
        ZStack(alignment: .topTrailing) {
            VStack(spacing: 0) {
                ForEach(
                    0..<(24 * 60 / Self.verticalScrollPositionStepMinutes),
                    id: \.self
                ) { index in
                    let minute = index * Self.verticalScrollPositionStepMinutes
                    Color.clear
                        .frame(
                            width: timeGutter,
                            height: CGFloat(Self.verticalScrollPositionStepMinutes) * minuteHeight
                        )
                        .id("week-scroll-\(minute)")
                        .accessibilityIdentifier(
                            Self.exposesScrollAnchorsForUITesting ? "week-scroll-\(minute)" : ""
                        )
                        .accessibilityHidden(!Self.exposesScrollAnchorsForUITesting)
                }
            }
            .scrollTargetLayout()
            ForEach(1..<24, id: \.self) { hour in
                Text(CalendarChrome.compactHour(hour))
                    .font(CalendarChrome.Typography.hourRail)
                    .foregroundStyle(SideSeatTheme.textSecondary)
                    .lineLimit(1)
                    .frame(width: timeGutter - 8, alignment: .trailing)
                    .offset(y: CGFloat(hour * 60) * minuteHeight - 7)
                    .accessibilityHidden(true)
            }

            Text(CalendarChrome.compactHour(24))
                .font(CalendarChrome.Typography.hourRail)
                .foregroundStyle(SideSeatTheme.textSecondary)
                .lineLimit(1)
                .frame(width: timeGutter - 8, alignment: .trailing)
                .offset(y: gridHeight - 7)
                .accessibilityHidden(true)
        }
        .frame(width: timeGutter, height: contentHeight, alignment: .top)
    }

    private func allDayRow(
        strip: [Date],
        dayWidth: CGFloat,
        daysWidth: CGFloat,
        stripWidth: CGFloat,
        stripX: CGFloat
    ) -> some View {
        HStack(alignment: .top, spacing: 0) {
            Text("All day")
                .font(CalendarChrome.Typography.allDayLabel)
                .foregroundStyle(SideSeatTheme.textSecondary)
                .frame(width: timeGutter, alignment: .trailing)
                .padding(.top, 8)
                .padding(.trailing, 4)

            HStack(alignment: .top, spacing: 0) {
                ForEach(strip, id: \.self) { day in
                    let items = items(on: day).filter {
                        $0.isAllDayStyle(on: day, calendar: calendar)
                    }
                    CalendarAllDayBand(
                        items: items,
                        onOpen: onOpen,
                        selectedActionItem: $menuEvent,
                        onLongPress: { item in
                            guard dragPreview == nil else { return }
                            showEventActions(item, renderedDay: day)
                        },
                        onCopy: onCopy,
                        onDuplicate: onDuplicate,
                        onDelete: onDelete
                    )
                        .frame(width: dayWidth, alignment: .topLeading)
                        .clipped()
                }
            }
            .frame(width: stripWidth, alignment: .leading)
            .offset(x: stripX)
            .frame(width: daysWidth, alignment: .leading)
            .clipped()
        }
        .frame(width: timeGutter + daysWidth, alignment: .leading)
        .frame(minHeight: 36)
        .accessibilityIdentifier("home-week-all-day-row")
    }

    private func verticalScrollSlotID(for day: Date) -> String {
        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("--ui-testing-offscreen-event-cues") {
            return "week-scroll-720"
        }
        #endif

        let items = items(on: day).filter {
            !$0.isAllDayStyle(on: day, calendar: calendar)
        }
        let firstEventMinute = CalendarTimelineScrollAnchor.firstEventMinute(
            items: items,
            on: day,
            calendar: calendar
        )
        let minute = CalendarTimelineScrollAnchor.targetMinute(
            on: day,
            firstEventMinute: firstEventMinute,
            calendar: calendar
        )
        return "week-scroll-\(minute)"
    }

    private func dayColumn(
        day: Date,
        width: CGFloat,
        height: CGFloat,
        days: [Date],
        dayWidth: CGFloat
    ) -> some View {
        let timedItems = items(on: day).filter {
            !$0.isAllDayStyle(on: day, calendar: calendar)
        }
        let placements = CalendarDayLayout.placements(items: timedItems, on: day, calendar: calendar)
        return ZStack(alignment: .topLeading) {
            ForEach(0..<48, id: \.self) { index in
                let minute = index * 30
                Rectangle()
                    .fill(index.isMultiple(of: 2) ? CalendarChrome.hourLine : CalendarChrome.halfHourLine)
                    .frame(
                        width: width,
                        height: index.isMultiple(of: 2)
                            ? CalendarChrome.hourLineThickness
                            : CalendarChrome.halfHourLineThickness
                    )
                    .offset(y: CGFloat(minute) * minuteHeight)
            }

            Rectangle()
                .fill(CalendarChrome.columnDivider)
                .frame(width: CalendarChrome.columnDividerThickness, height: height)

            ForEach(0..<48, id: \.self) { index in
                let minute = index * 30
                Color.clear
                    .contentShape(Rectangle())
                    .frame(width: width, height: CGFloat(30) * minuteHeight)
                    .offset(y: CGFloat(minute) * minuteHeight)
                    .id("week-slot-\(dayID(day))-\(minute)")
                    .calendarTapOrLongPress(
                        onTap: {
                            guard canUseEmptySlots, let slot = slotDate(on: day, minute: minute) else { return }
                            onFocusDate(day)
                            onCreateAtSlot(slot)
                        },
                        onLongPress: {
                            guard canUseEmptySlots, let slot = slotDate(on: day, minute: minute) else { return }
                            onFocusDate(day)
                            menuSlot = slot
                        }
                    )
                    .allowsHitTesting(dragPreview == nil)
                    .accessibilityHidden(true)
            }

            ForEach(placements) { placement in
                weekEventCard(
                    placement,
                    renderedDay: day,
                    columnWidth: width - 3,
                    dayWidth: dayWidth,
                    days: days
                )
            }

        }
        .frame(width: width, height: height, alignment: .topLeading)
        .overlay(alignment: .bottom) {
            Rectangle()
                .fill(CalendarChrome.hourLine)
                .frame(height: CalendarChrome.hourLineThickness)
                .allowsHitTesting(false)
        }
        .clipped()
    }

    private func weekNowIndicator(
        strip: [Date],
        dayWidth: CGFloat,
        daysWidth: CGFloat,
        stripWidth: CGFloat,
        stripX: CGFloat
    ) -> some View {
        TimelineView(.periodic(from: .now, by: 60)) { context in
            let now = context.date
            let minute =
                calendar.component(.hour, from: now) * 60
                + calendar.component(.minute, from: now)

            HStack(spacing: 0) {
                CalendarNowTimeBadge(date: now)
                    .frame(width: timeGutter, alignment: .trailing)
                    .padding(.trailing, 2)

                HStack(spacing: 0) {
                    ForEach(strip, id: \.self) { day in
                        let isToday = calendar.isDateInToday(day)
                        Rectangle()
                            .fill(
                                isToday
                                    ? CalendarChrome.nowAccent
                                    : CalendarChrome.nowGuideLine
                            )
                            .frame(
                                width: dayWidth,
                                height: isToday
                                    ? CalendarChrome.nowLineThickness
                                    : CalendarChrome.nowGuideLineThickness
                            )
                            .frame(height: CalendarChrome.nowLineHitSlop, alignment: .center)
                    }
                }
                .frame(width: stripWidth, alignment: .leading)
                .offset(x: stripX)
                .frame(width: daysWidth, alignment: .leading)
                .clipped()
            }
            .frame(width: timeGutter + daysWidth, alignment: .leading)
            .offset(y: CGFloat(minute) * minuteHeight - 8)
            .allowsHitTesting(false)
            .accessibilityIdentifier("week-now-indicator")
            .accessibilityLabel(
                String(
                    format: AppLocalization.string( "Current time, %@"),
                    now.formatted(date: .omitted, time: .shortened)
                )
            )
        }
    }

    private func weekEventCard(
        _ placement: CalendarDayPlacement,
        renderedDay: Date,
        columnWidth: CGFloat,
        dayWidth: CGFloat,
        days: [Date]
    ) -> some View {
        let spacing: CGFloat = 1.5
        let laneWidth = max(
            1,
            (columnWidth - CGFloat(placement.laneCount - 1) * spacing) / CGFloat(placement.laneCount)
        )
        let x = CGFloat(placement.lane) * (laneWidth + spacing) + 1
        let height = max(18, CGFloat(placement.endMinute - placement.startMinute) * minuteHeight - 1.5)
        let color = CalendarChrome.eventColor(for: placement.item)
        let isDragging = dragPreview?.item.id == placement.item.id
        let isArmed = armedEventID == placement.item.id
        let canResizeEnding = canDirectResizeEnd(
            placement.item,
            renderedDay: renderedDay,
            visibleDays: days
        )
        let timeLabel = CalendarChrome.eventCardTimeLabel(
            from: placement.item.start,
            to: placement.item.end,
            height: height,
            availableWidth: laneWidth,
            calendar: calendar
        )
        let visualTop = CGFloat(placement.startMinute) * minuteHeight + 0.5
        let hitTarget = CalendarChrome.eventHitTargetLayout(
            visualTop: visualTop,
            visualHeight: height,
            gridHeight: CGFloat(24 * 60) * minuteHeight
        )

        return CalendarEventBlockLabel(
            title: placement.item.title,
            subtitle: timeLabel,
            color: color,
            height: height,
            emphasized: isDragging,
            context: placement.item.context,
            contextSymbol: CalendarChrome.eventContextSymbol(for: placement.item),
            compact: true
        )
        .overlay {
            if isArmed {
                eventAdjustmentHandles(color: color, showsBottomHandle: canResizeEnding)
            }
        }
        .opacity(isDragging ? 0.16 : 1)
        .scaleEffect(isDragging ? 0.97 : 1)
        .frame(width: laneWidth, height: height, alignment: .topLeading)
        .padding(.top, hitTarget.topInset)
        .padding(.bottom, hitTarget.bottomInset)
        .contentShape(Rectangle())
        .gesture(
            eventCardInteractionGesture(
                for: placement,
                renderedDay: renderedDay,
                dayWidth: dayWidth,
                days: days,
                visualHeight: height,
                visualTopInset: hitTarget.topInset,
                canResizeEnd: canResizeEnding
            )
        )
        .calendarItemActions(
            target: placement.item,
            selectedItem: $menuEvent,
            onCopy: onCopy,
            onDuplicate: onDuplicate,
            onDelete: onDelete
        )
        .offset(x: x, y: hitTarget.top)
        .allowsHitTesting(dragPreview == nil || isDragging)
        .accessibilityElement(children: .ignore)
        .accessibilityIdentifier(weekEventAccessibilityID(for: placement.item, renderedDay: renderedDay))
        .accessibilityLabel(placement.item.title)
        .accessibilityValue(
            "\(CalendarChrome.compactClock(placement.item.start)) - \(CalendarChrome.compactClock(placement.item.end))"
        )
        .accessibilityAddTraits(.isButton)
        .accessibilityHidden(isDenseCalendarStressTest)
    }

    private func weekEventAccessibilityID(for item: HomeAgendaItem, renderedDay: Date) -> String {
        let base = "home-week-event-\(item.id)"
        guard !calendar.isDate(item.start, inSameDayAs: renderedDay) else { return base }
        return "\(base)-continuation-\(dayID(renderedDay))"
    }

    private func eventCardInteractionGesture(
        for placement: CalendarDayPlacement,
        renderedDay: Date,
        dayWidth: CGFloat,
        days: [Date],
        visualHeight: CGFloat,
        visualTopInset: CGFloat,
        canResizeEnd: Bool
    ) -> some Gesture {
        let tap = TapGesture()
            .onEnded {
                guard armedEventID == nil, dragPreview == nil else { return }
                onFocusDate(renderedDay)
                onOpen(placement.item)
            }
        let longPressDrag = LongPressGesture(minimumDuration: 0.25, maximumDistance: 14)
            .sequenced(before: DragGesture(minimumDistance: 0, coordinateSpace: .local))
            .onChanged { value in
                guard case .second(true, let drag) = value else { return }
                armEventGestureIfNeeded(placement.item)

                guard
                    canDirectDrag(placement.item, renderedDay: renderedDay, visibleDays: days),
                    let drag
                else { return }

                let operation = activeEventDragOperation
                    ?? HomeWeekWindow.eventDragOperation(
                        startLocationY: drag.startLocation.y,
                        visualTopInset: visualTopInset,
                        visualHeight: visualHeight,
                        canResizeEnd: canResizeEnd
                    )
                if activeEventDragOperation == nil {
                    activeEventDragOperation = operation
                }
                guard HomeWeekWindow.isEventDragActivated(translation: drag.translation) else {
                    return
                }

                updateDragPreview(
                    for: placement,
                    translation: drag.translation,
                    dayWidth: dayWidth,
                    days: days,
                    operation: operation
                )
            }
            .onEnded { value in
                defer {
                    dragPreview = nil
                    activeEventDragOperation = nil
                    releaseEventGestureLock(for: placement.item.id)
                }
                guard case .second(true, let drag) = value else { return }

                let canMove = canDirectDrag(
                    placement.item,
                    renderedDay: renderedDay,
                    visibleDays: days
                )
                let didDrag = drag.map {
                    HomeWeekWindow.isEventDragActivated(translation: $0.translation)
                } ?? false

                guard canMove, didDrag else {
                    showEventActions(placement.item, renderedDay: renderedDay)
                    return
                }
                guard let preview = dragPreview else { return }
                guard let target = dragTargetRange(for: preview, days: days) else { return }
                let startChanged = abs(target.start.timeIntervalSince(placement.item.start)) >= 60
                let endChanged = abs(target.end.timeIntervalSince(placement.item.end)) >= 60
                guard startChanged || endChanged else { return }
                UIImpactFeedbackGenerator(style: .light).impactOccurred()
                onFocusDate(target.start)
                switch preview.operation {
                case .move:
                    onDragMove(placement.item, target.start)
                case .resizeStart, .resizeEnd:
                    onDragResize(placement.item, target.start, target.end)
                }
            }

        return longPressDrag.simultaneously(with: tap)
    }

    private var canUseEmptySlots: Bool {
        armedEventID == nil && dragPreview == nil
    }

    private var isDenseCalendarStressTest: Bool {
        Self.denseCalendarStressTestEnabled
    }

    private func items(on day: Date) -> [HomeAgendaItem] {
        itemsByDay[calendar.startOfDay(for: day)] ?? []
    }

    private func slotDate(on day: Date, minute: Int) -> Date? {
        calendar.date(
            byAdding: .minute,
            value: minute,
            to: calendar.startOfDay(for: day)
        )
    }

    private func canDirectDrag(
        _ item: HomeAgendaItem,
        renderedDay: Date,
        visibleDays: [Date]
    ) -> Bool {
        item.source == .event
            && calendar.isDate(item.start, inSameDayAs: renderedDay)
            && visibleDays.contains { calendar.isDate($0, inSameDayAs: renderedDay) }
    }

    private func canDirectResizeEnd(
        _ item: HomeAgendaItem,
        renderedDay: Date,
        visibleDays: [Date]
    ) -> Bool {
        guard canDirectDrag(item, renderedDay: renderedDay, visibleDays: visibleDays) else {
            return false
        }
        // The bottom edge on a continuation segment is not the event's real end.
        let finalInstant = item.end.addingTimeInterval(-1)
        return calendar.isDate(finalInstant, inSameDayAs: renderedDay)
    }

    private func eventAdjustmentHandles(
        color: Color,
        showsBottomHandle: Bool
    ) -> some View {
        VStack(spacing: 0) {
            Capsule()
                .fill(color)
                .frame(width: 18, height: 3)
                .shadow(color: Color.black.opacity(0.18), radius: 1, y: 0.5)

            Spacer(minLength: 2)

            if showsBottomHandle {
                Capsule()
                    .fill(color)
                    .frame(width: 18, height: 3)
                    .shadow(color: Color.black.opacity(0.18), radius: 1, y: 0.5)
            }
        }
        .padding(.vertical, 2)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }

    private func armEventGestureIfNeeded(_ item: HomeAgendaItem) {
        guard armedEventID != item.id else { return }
        armedEventID = item.id
        activeEventDragOperation = nil
        menuEvent = nil
        menuSlot = nil
        panOffset = 0
        clearScrollDirectionIndicator()
        UIImpactFeedbackGenerator(style: .medium).impactOccurred()
    }

    private func releaseEventGestureLock(for eventID: String) {
        Task { @MainActor in
            await Task.yield()
            if armedEventID == eventID {
                armedEventID = nil
            }
        }
    }

    private func showEventActions(_ item: HomeAgendaItem, renderedDay: Date) {
        guard item.source == .event else { return }
        onFocusDate(renderedDay)
        menuEvent = item
    }

    private func updateDragPreview(
        for placement: CalendarDayPlacement,
        translation: CGSize,
        dayWidth: CGFloat,
        days: [Date],
        operation: HomeWeekWindow.EventDragOperation
    ) {
        guard let originDayIndex = days.firstIndex(where: {
            calendar.isDate($0, inSameDayAs: placement.item.start)
        }) else { return }
        let targetDayIndex: Int
        let targetStartMinute: Int
        let targetEndMinute: Int

        switch operation {
        case .move:
            let target = HomeWeekWindow.eventDragTarget(
                originDayIndex: originDayIndex,
                originStartMinute: placement.startMinute,
                translation: translation,
                dayWidth: dayWidth,
                minuteHeight: minuteHeight,
                dayCount: days.count
            )
            targetDayIndex = target.dayIndex
            targetStartMinute = target.startMinute
            targetEndMinute = target.startMinute + max(
                5,
                placement.endMinute - placement.startMinute
            )
        case .resizeStart, .resizeEnd:
            let target = HomeWeekWindow.eventResizeTarget(
                originStartMinute: placement.startMinute,
                originEndMinute: placement.endMinute,
                translationHeight: translation.height,
                minuteHeight: minuteHeight,
                operation: operation
            )
            targetDayIndex = originDayIndex
            targetStartMinute = target.startMinute
            targetEndMinute = target.endMinute
        }

        if dragPreview == nil {
            dragPreview = WeekDragPreview(
                item: placement.item,
                operation: operation,
                targetDayIndex: targetDayIndex,
                targetStartMinute: targetStartMinute,
                targetEndMinute: targetEndMinute
            )
            return
        }
        guard var preview = dragPreview else { return }
        let targetChanged = preview.targetDayIndex != targetDayIndex
            || preview.targetStartMinute != targetStartMinute
            || preview.targetEndMinute != targetEndMinute
        guard targetChanged else { return }
        preview.targetDayIndex = targetDayIndex
        preview.targetStartMinute = targetStartMinute
        preview.targetEndMinute = targetEndMinute
        withAnimation(.interactiveSpring(response: 0.16, dampingFraction: 0.88)) {
            dragPreview = preview
        }
        UISelectionFeedbackGenerator().selectionChanged()
    }

    private func dragTargetRange(
        for preview: WeekDragPreview,
        days: [Date]
    ) -> (start: Date, end: Date)? {
        guard days.indices.contains(preview.targetDayIndex) else { return nil }
        let targetDay = calendar.startOfDay(for: days[preview.targetDayIndex])
        guard let visualStart = calendar.date(
            byAdding: .minute,
            value: preview.targetStartMinute,
            to: targetDay
        ) else { return nil }

        switch preview.operation {
        case .move:
            return (
                visualStart,
                visualStart.addingTimeInterval(
                    preview.item.end.timeIntervalSince(preview.item.start)
                )
            )
        case .resizeStart:
            return (visualStart, preview.item.end)
        case .resizeEnd:
            guard let visualEnd = calendar.date(
                byAdding: .minute,
                value: preview.targetEndMinute,
                to: targetDay
            ) else { return nil }
            return (preview.item.start, visualEnd)
        }
    }

    private func dragTargetGuide(
        _ preview: WeekDragPreview,
        dayWidth: CGFloat
    ) -> some View {
        let height = dragPreviewHeight(preview)
        let x = timeGutter + CGFloat(preview.targetDayIndex) * dayWidth + 2
        let y = CGFloat(preview.targetStartMinute) * minuteHeight + 1

        return RoundedRectangle(cornerRadius: 5, style: .continuous)
            .fill(SideSeatTheme.accent.opacity(0.08))
            .overlay {
                RoundedRectangle(cornerRadius: 5, style: .continuous)
                    .stroke(
                        SideSeatTheme.accent.opacity(0.72),
                        style: StrokeStyle(lineWidth: 1.5, dash: [5, 3])
                    )
            }
            .frame(width: max(36, dayWidth - 4), height: height)
            .offset(x: x, y: y)
            .allowsHitTesting(false)
            .accessibilityHidden(true)
    }

    private func dragPreviewCard(
        _ preview: WeekDragPreview,
        dayWidth: CGFloat,
        days: [Date]
    ) -> some View {
        let height = dragPreviewHeight(preview)
        let targetX = timeGutter + CGFloat(preview.targetDayIndex) * dayWidth + 3
        let targetY = CGFloat(preview.targetStartMinute) * minuteHeight + 1
        let badgeWidth = min(170, max(132, dayWidth * 2.35))
        let gridMaxX = timeGutter + CGFloat(days.count) * dayWidth
        let badgeX = min(
            max(timeGutter + 3, targetX),
            max(timeGutter + 3, gridMaxX - badgeWidth - 3)
        )
        let badgeY = max(4, targetY - 31)

        return ZStack(alignment: .topLeading) {
            CalendarEventBlockLabel(
                title: preview.item.title,
                subtitle: nil,
                color: CalendarChrome.eventColor(for: preview.item),
                height: height,
                emphasized: true,
                context: preview.item.context,
                contextSymbol: CalendarChrome.eventContextSymbol(for: preview.item),
                compact: true
            )
            .overlay {
                eventAdjustmentHandles(
                    color: CalendarChrome.eventColor(for: preview.item),
                    showsBottomHandle: true
                )
            }
            .frame(width: max(36, dayWidth - 6), height: height, alignment: .topLeading)
            .scaleEffect(1.025)
            .shadow(color: .black.opacity(0.22), radius: 10, y: 5)
            .offset(x: targetX, y: targetY)
            .accessibilityIdentifier("week-drag-preview")

            Text(dragPreviewTimeLabel(preview, days: days))
                .font(.caption2.weight(.semibold))
                .monospacedDigit()
                .foregroundStyle(.white)
                .lineLimit(1)
                .minimumScaleFactor(0.78)
                .padding(.horizontal, 8)
                .frame(width: badgeWidth, height: 25)
                .background(SideSeatTheme.textPrimary, in: Capsule())
                .shadow(color: .black.opacity(0.14), radius: 4, y: 2)
                .offset(x: badgeX, y: badgeY)
                .accessibilityIdentifier("week-drag-target-time")
        }
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }

    private func dragPreviewHeight(_ preview: WeekDragPreview) -> CGFloat {
        let durationMinutes = max(5, preview.targetEndMinute - preview.targetStartMinute)
        return max(18, CGFloat(durationMinutes) * minuteHeight - 1.5)
    }

    private func dragPreviewTimeLabel(_ preview: WeekDragPreview, days: [Date]) -> String {
        guard let range = dragTargetRange(for: preview, days: days) else {
            return CalendarChrome.compactClock(preview.item.start)
        }
        let day = range.start.formatted(.dateTime.weekday(.abbreviated).day())
        return "\(day)  \(CalendarChrome.compactClock(range.start))–\(CalendarChrome.compactClock(range.end))"
    }

    private func timelineMagnifyGesture(proxy: ScrollViewProxy) -> some Gesture {
        MagnifyGesture(minimumScaleDelta: 0.01)
            .onChanged { value in
                guard armedEventID == nil, dragPreview == nil, !isCommittingDayShift else { return }

                if pinchStartTimelineScale == nil {
                    clearScrollDirectionIndicator()
                    dismissTimelineZoomHint()

                    let startScale = HomeWeekWindow.clampTimelineScale(timelineScale)
                    let anchorFraction = min(max(value.startAnchor.y, 0.05), 0.95)
                    let topMinute = verticalScrollMinute(from: verticalScrollPositionID)
                        ?? verticalScrollMinute(from: verticalScrollSlotID(for: focusDate))
                        ?? 0

                    pinchStartTimelineScale = startScale
                    liveTimelineScale = startScale
                    pinchAnchorFraction = anchorFraction
                    pinchAnchorMinute = topMinute
                        + anchorFraction * verticalViewportHeight
                            / (CalendarChrome.weekMinuteHeight * startScale)
                    lastPinchFeedbackScale = startScale
                }

                guard let startScale = pinchStartTimelineScale else { return }
                let nextScale = HomeWeekWindow.clampTimelineScale(
                    startScale * value.magnification
                )
                applyLiveTimelineScale(nextScale, proxy: proxy)
                provideTimelineScaleFeedbackIfNeeded(nextScale)
            }
            .onEnded { value in
                guard let startScale = pinchStartTimelineScale else { return }
                var finalScale = HomeWeekWindow.clampTimelineScale(
                    startScale * value.magnification
                )
                let snapsToDefault = abs(finalScale - HomeWeekWindow.defaultTimelineScale) < 0.035
                if snapsToDefault {
                    finalScale = HomeWeekWindow.defaultTimelineScale
                }

                applyLiveTimelineScale(finalScale, proxy: proxy)
                if snapsToDefault,
                   abs((lastPinchFeedbackScale ?? startScale) - finalScale) > 0.005
                {
                    UISelectionFeedbackGenerator().selectionChanged()
                }
                onTimelineScaleChange(finalScale)

                Task { @MainActor in
                    await Task.yield()
                    liveTimelineScale = nil
                    pinchStartTimelineScale = nil
                    pinchAnchorMinute = nil
                    lastPinchFeedbackScale = nil
                }
            }
    }

    private func applyLiveTimelineScale(
        _ scale: CGFloat,
        proxy: ScrollViewProxy
    ) {
        let clamped = HomeWeekWindow.clampTimelineScale(scale)
        let anchorMinute = pinchAnchorMinute ?? 0
        let topMinute = HomeWeekWindow.timelineTopMinutePreservingAnchor(
            anchorMinute: anchorMinute,
            anchorFraction: pinchAnchorFraction,
            viewportHeight: verticalViewportHeight,
            minuteHeight: CalendarChrome.weekMinuteHeight * clamped
        )
        let targetID = verticalScrollID(nearest: topMinute)

        var transaction = Transaction()
        transaction.disablesAnimations = true
        withTransaction(transaction) {
            liveTimelineScale = clamped
            verticalScrollPositionID = targetID
            proxy.scrollTo(targetID, anchor: .top)
        }
    }

    private func provideTimelineScaleFeedbackIfNeeded(_ scale: CGFloat) {
        guard let previous = lastPinchFeedbackScale else {
            lastPinchFeedbackScale = scale
            return
        }
        let defaultScale = HomeWeekWindow.defaultTimelineScale
        let crossedDefault = (previous < defaultScale && scale >= defaultScale)
            || (previous > defaultScale && scale <= defaultScale)
        let enteredMinimum = previous > HomeWeekWindow.minimumTimelineScale
            && scale == HomeWeekWindow.minimumTimelineScale
        let enteredMaximum = previous < HomeWeekWindow.maximumTimelineScale
            && scale == HomeWeekWindow.maximumTimelineScale
        if crossedDefault || enteredMinimum || enteredMaximum {
            UISelectionFeedbackGenerator().selectionChanged()
        }
        lastPinchFeedbackScale = scale
    }

    private func adjustTimelineScaleForAccessibility(
        _ direction: AccessibilityZoomGestureAction.Direction
    ) {
        let delta: CGFloat
        switch direction {
        case .zoomIn:
            delta = HomeWeekWindow.timelineScaleAccessibilityStep
        case .zoomOut:
            delta = -HomeWeekWindow.timelineScaleAccessibilityStep
        @unknown default:
            return
        }

        var next = HomeWeekWindow.clampTimelineScale(timelineScale + delta)
        if abs(next - HomeWeekWindow.defaultTimelineScale) < 0.045 {
            next = HomeWeekWindow.defaultTimelineScale
        }
        guard abs(next - timelineScale) > 0.001 else { return }
        UISelectionFeedbackGenerator().selectionChanged()
        onTimelineScaleChange(next)
    }

    private func verticalScrollMinute(from identifier: String?) -> CGFloat? {
        guard let identifier,
              identifier.hasPrefix("week-scroll-"),
              let minute = Double(identifier.dropFirst("week-scroll-".count))
        else { return nil }
        return CGFloat(minute)
    }

    private func verticalScrollID(nearest minute: CGFloat) -> String {
        let step = CGFloat(Self.verticalScrollPositionStepMinutes)
        let maximumMinute = CGFloat(24 * 60 - Self.verticalScrollPositionStepMinutes)
        let snapped = min(max((minute / step).rounded() * step, 0), maximumMinute)
        return "week-scroll-\(Int(snapped))"
    }

    @ViewBuilder
    private func offscreenEventIndicators(
        days: [Date],
        dayWidth: CGFloat,
        proxy: ScrollViewProxy
    ) -> some View {
        if menuEvent == nil,
           menuSlot == nil,
           armedEventID == nil,
           dragPreview == nil,
           activeEventDragOperation == nil,
           liveTimelineScale == nil,
           !isCommittingDayShift,
           abs(panOffset) < 0.5,
           !showsTimelineZoomHint,
           verticalViewportHeight >= 80,
           let viewportStart = verticalScrollMinute(from: verticalScrollPositionID)
        {
            let viewportStartMinute = Int(floor(viewportStart))
            let viewportEndMinute = min(
                24 * 60,
                viewportStartMinute + Int(ceil(verticalViewportHeight / minuteHeight))
            )
            let indicatorWidth = min(44, max(1, dayWidth))

            ZStack(alignment: .topLeading) {
                Color.clear
                    .allowsHitTesting(false)
                    .accessibilityHidden(true)

                ForEach(days.indices, id: \.self) { index in
                    let day = days[index]
                    let dayItems = items(on: day)
                    let topHint = CalendarOffscreenEventHints.nearest(
                        items: dayItems,
                        on: day,
                        viewportStartMinute: viewportStartMinute,
                        viewportEndMinute: viewportEndMinute,
                        edge: .top,
                        calendar: calendar
                    )
                    let bottomHint = CalendarOffscreenEventHints.nearest(
                        items: dayItems,
                        on: day,
                        viewportStartMinute: viewportStartMinute,
                        viewportEndMinute: viewportEndMinute,
                        edge: .bottom,
                        calendar: calendar
                    )
                    let indicatorX = timeGutter + (CGFloat(index) + 0.5) * dayWidth

                    if let topHint {
                        CalendarOffscreenEventBar(
                            edge: .top,
                            color: CalendarChrome.eventColor(for: topHint.item),
                            availableWidth: indicatorWidth,
                            accessibilityIdentifier: "calendar-week-offscreen-event-top-\(dayID(day))",
                            action: { scrollToOffscreenEvent(topHint, proxy: proxy) }
                        )
                        .position(x: indicatorX, y: 22)
                        .transition(.opacity)
                    }

                    if let bottomHint {
                        CalendarOffscreenEventBar(
                            edge: .bottom,
                            color: CalendarChrome.eventColor(for: bottomHint.item),
                            availableWidth: indicatorWidth,
                            accessibilityIdentifier: "calendar-week-offscreen-event-bottom-\(dayID(day))",
                            action: { scrollToOffscreenEvent(bottomHint, proxy: proxy) }
                        )
                        .position(x: indicatorX, y: verticalViewportHeight - 22)
                        .transition(.opacity)
                    }
                }
            }
            .animation(
                accessibilityReduceMotion ? nil : .easeOut(duration: 0.14),
                value: viewportStartMinute
            )
        }
    }

    private func scrollToOffscreenEvent(
        _ hint: CalendarOffscreenEventHint,
        proxy: ScrollViewProxy
    ) {
        let minute = CalendarOffscreenEventHints.scrollTargetMinute(for: hint)
        let target = verticalScrollID(nearest: CGFloat(minute))
        UISelectionFeedbackGenerator().selectionChanged()
        withAnimation(accessibilityReduceMotion ? nil : .easeInOut(duration: 0.26)) {
            verticalScrollPositionID = target
            proxy.scrollTo(target, anchor: .top)
        }
    }

    private func dayShiftGesture(from start: Date, dayWidth: CGFloat) -> some Gesture {
        DragGesture(minimumDistance: 16, coordinateSpace: .local)
            .onChanged { value in
                guard armedEventID == nil,
                      dragPreview == nil,
                      liveTimelineScale == nil,
                      !isCommittingDayShift
                else { return }

                if lockedScrollAxis == nil {
                    cancelLingeringScrollIndicator()
                }
                guard let axis = HomeWeekWindow.scrollAxis(
                    translation: value.translation,
                    lockedAxis: lockedScrollAxis
                ) else { return }
                if lockedScrollAxis == nil {
                    lockedScrollAxis = axis
                }
                if let edge = HomeWeekWindow.scrollFeedbackEdge(
                    translation: value.translation,
                    axis: axis
                ) {
                    showScrollDirectionIndicator(edge)
                }
                guard axis == .horizontal else { return }

                let dx = value.translation.width
                let limit = dayWidth * 0.92
                var next = dx
                if next > limit {
                    next = limit + (next - limit) * 0.18
                } else if next < -limit {
                    next = -limit + (next + limit) * 0.18
                }
                panOffset = next
            }
            .onEnded { value in
                guard armedEventID == nil,
                      dragPreview == nil,
                      liveTimelineScale == nil,
                      !isCommittingDayShift
                else {
                    clearScrollDirectionIndicator()
                    withAnimation(.interactiveSpring(response: 0.28, dampingFraction: 0.9)) {
                        panOffset = 0
                    }
                    return
                }

                let resolvedAxis = HomeWeekWindow.scrollAxis(
                    translation: value.translation,
                    lockedAxis: lockedScrollAxis
                )
                lockedScrollAxis = nil
                if let resolvedAxis {
                    if let edge = HomeWeekWindow.scrollFeedbackEdge(
                        translation: value.translation,
                        axis: resolvedAxis
                    ) {
                        showScrollDirectionIndicator(edge)
                    }
                    dismissScrollDirectionIndicatorAfterLinger()
                } else {
                    clearScrollDirectionIndicator()
                }

                guard resolvedAxis == .horizontal else {
                    panOffset = 0
                    return
                }

                let delta = HomeWeekWindow.dayShiftDelta(
                    translationWidth: value.translation.width,
                    predictedWidth: value.predictedEndTranslation.width,
                    dayWidth: dayWidth
                )
                let targetOffset = -CGFloat(delta) * dayWidth
                isCommittingDayShift = true

                withAnimation(.interactiveSpring(response: 0.28, dampingFraction: 0.86)) {
                    panOffset = targetOffset
                }

                Task { @MainActor in
                    try? await Task.sleep(nanoseconds: 170_000_000)
                    var transaction = Transaction()
                    transaction.disablesAnimations = true
                    withTransaction(transaction) {
                        if delta != 0,
                           let next = calendar.date(byAdding: .day, value: delta, to: start)
                        {
                            viewportStart = next
                            onViewportDateChange(next)
                        }
                        panOffset = 0
                        isCommittingDayShift = false
                    }
                }
            }
    }

    @ViewBuilder
    private func scrollDirectionIndicator(daysWidth: CGFloat) -> some View {
        GeometryReader { geometry in
            if let edge = displayedScrollFeedbackEdge {
                let thickness: CGFloat = colorSchemeContrast == .increased ? 4 : 3
                let indicatorLength: CGFloat = 28
                let gridLeading = timeGutter
                let gridTrailing = min(geometry.size.width, timeGutter + daysWidth)
                let inset = SideSeatTheme.spaceXS
                let indicatorX: CGFloat = switch edge {
                case .leading:
                    gridLeading + inset + thickness / 2
                case .trailing:
                    gridTrailing - inset - thickness / 2
                case .top, .bottom:
                    timeGutter / 2
                }
                let indicatorY: CGFloat = switch edge {
                case .top:
                    inset + thickness / 2
                case .bottom:
                    geometry.size.height - inset - thickness / 2
                case .leading, .trailing:
                    geometry.size.height / 2
                }
                Capsule()
                    .fill(SideSeatTheme.textSecondaryStrong.opacity(0.72))
                    .frame(
                        width: edge == .top || edge == .bottom ? indicatorLength : thickness,
                        height: edge == .leading || edge == .trailing ? indicatorLength : thickness
                    )
                    .position(x: indicatorX, y: indicatorY)
                    .shadow(color: SideSeatTheme.bg.opacity(0.92), radius: 1.5)
                    .id(edge)
                    // The direction cue belongs to a fixed viewport edge. Moving it in
                    // from that edge makes the cue look like content being paged, so it
                    // should only fade at its final position.
                    .transition(.opacity)
                    .accessibilityElement()
                    .accessibilityLabel(edge.rawValue)
                    .accessibilityIdentifier("week-scroll-direction-\(edge.rawValue)")
                    .accessibilityHidden(!Self.exposesScrollDirectionForUITesting)
            }
        }
        .allowsHitTesting(false)
    }

    private func showScrollDirectionIndicator(
        _ edge: HomeWeekWindow.ScrollFeedbackEdge
    ) {
        scrollIndicatorDismissTask?.cancel()
        scrollIndicatorDismissTask = nil
        guard displayedScrollFeedbackEdge != edge else { return }
        withAnimation(
            accessibilityReduceMotion
                ? .linear(duration: 0.05)
                : .easeOut(duration: 0.09)
        ) {
            displayedScrollFeedbackEdge = edge
        }
    }

    private func cancelLingeringScrollIndicator() {
        scrollIndicatorDismissTask?.cancel()
        scrollIndicatorDismissTask = nil
        guard lockedScrollAxis == nil, displayedScrollFeedbackEdge != nil else { return }
        withAnimation(.linear(duration: accessibilityReduceMotion ? 0.05 : 0.1)) {
            displayedScrollFeedbackEdge = nil
        }
    }

    private func dismissScrollDirectionIndicatorAfterLinger() {
        scrollIndicatorDismissTask?.cancel()
        let lingerNanoseconds: UInt64 = Self.exposesScrollDirectionForUITesting
            ? 5_000_000_000
            : 180_000_000
        scrollIndicatorDismissTask = Task { @MainActor in
            do {
                try await Task.sleep(nanoseconds: lingerNanoseconds)
            } catch {
                return
            }
            guard !Task.isCancelled else { return }
            withAnimation(
                accessibilityReduceMotion
                    ? .linear(duration: 0.06)
                    : .easeOut(duration: 0.13)
            ) {
                displayedScrollFeedbackEdge = nil
            }
            scrollIndicatorDismissTask = nil
        }
    }

    private func clearScrollDirectionIndicator() {
        scrollIndicatorDismissTask?.cancel()
        scrollIndicatorDismissTask = nil
        lockedScrollAxis = nil
        var transaction = Transaction()
        transaction.disablesAnimations = true
        withTransaction(transaction) {
            displayedScrollFeedbackEdge = nil
        }
    }

    @ViewBuilder
    private var timelineZoomHint: some View {
        if showsTimelineZoomHint {
            Label(
                "Pinch the timeline to adjust time spacing",
                systemImage: "arrow.up.left.and.arrow.down.right"
            )
            .font(.footnote.weight(.semibold))
            .foregroundStyle(SideSeatTheme.textPrimary)
            .padding(.horizontal, 14)
            .frame(minHeight: 38)
            .background(.regularMaterial, in: Capsule())
            .overlay {
                Capsule()
                    .stroke(SideSeatTheme.separator.opacity(0.7), lineWidth: 0.5)
            }
            .shadow(color: .black.opacity(0.1), radius: 8, y: 3)
            .padding(.horizontal, SideSeatTheme.screenHorizontal)
            .padding(.bottom, SideSeatTheme.spaceMD)
            .transition(.move(edge: .bottom).combined(with: .opacity))
            .allowsHitTesting(false)
            .accessibilityHidden(true)
        }
    }

    private func showTimelineZoomHintIfNeeded() {
        guard !Self.isUITesting,
              HomeWeekWindow.shouldShowTimelineZoomHint()
        else { return }

        HomeWeekWindow.markTimelineZoomHintSeen()
        withAnimation(
            accessibilityReduceMotion
                ? .linear(duration: 0.08)
                : .easeOut(duration: 0.2)
        ) {
            showsTimelineZoomHint = true
        }
        timelineZoomHintTask?.cancel()
        timelineZoomHintTask = Task { @MainActor in
            do {
                try await Task.sleep(nanoseconds: 3_800_000_000)
            } catch {
                return
            }
            guard !Task.isCancelled else { return }
            withAnimation(
                accessibilityReduceMotion
                    ? .linear(duration: 0.08)
                    : .easeOut(duration: 0.18)
            ) {
                showsTimelineZoomHint = false
            }
            timelineZoomHintTask = nil
        }
    }

    private func dismissTimelineZoomHint() {
        timelineZoomHintTask?.cancel()
        timelineZoomHintTask = nil
        guard showsTimelineZoomHint else { return }
        withAnimation(
            accessibilityReduceMotion
                ? .linear(duration: 0.05)
                : .easeOut(duration: 0.12)
        ) {
            showsTimelineZoomHint = false
        }
    }

    private var weekDisplayBar: some View {
        HStack(spacing: SideSeatTheme.spaceSM) {
            Image(systemName: "rectangle.split.3x1")
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(SideSeatTheme.textSecondary)
                .accessibilityHidden(true)

            Picker(
                "Visible days",
                selection: Binding(
                    get: { dayCount },
                    set: { next in
                        guard next != dayCount else { return }
                        onVisibleDayCountChange(next)
                    }
                )
            ) {
                ForEach(HomeWeekWindow.allowedVisibleDayCounts, id: \.self) { count in
                    Text(verbatim: "\(count)")
                        .tag(count)
                        .accessibilityLabel(
                            String(format: AppLocalization.string( "%lld days"), Int64(count))
                        )
                }
            }
            .pickerStyle(.segmented)
            .frame(maxWidth: 180)
        }
        .frame(maxWidth: .infinity)
        .padding(.horizontal, SideSeatTheme.screenHorizontal)
        .padding(.vertical, 7)
        .background(.bar)
        .overlay(alignment: .top) {
            Divider().opacity(0.35)
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("home-week-visible-day-count")
    }

    private func dayID(_ day: Date) -> String {
        let components = calendar.dateComponents([.year, .month, .day], from: day)
        return String(
            format: "%04d-%02d-%02d",
            components.year ?? 0,
            components.month ?? 0,
            components.day ?? 0
        )
    }
}

private struct WeekDragPreview {
    let item: HomeAgendaItem
    let operation: HomeWeekWindow.EventDragOperation
    var targetDayIndex: Int
    var targetStartMinute: Int
    var targetEndMinute: Int
}
