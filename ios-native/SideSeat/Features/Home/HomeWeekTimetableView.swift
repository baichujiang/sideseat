import SwiftUI
import UIKit

/// Native phone week timetable: configurable day columns, shared time axis.
/// Column headers are the week date navigator and drill into Day view.
struct HomeWeekTimetableView: View {
    let focusDate: Date
    let visibleDayCount: Int
    let timelineDensityLevel: Int
    let itemsByDay: [Date: [HomeAgendaItem]]
    let onFocusDate: (Date) -> Void
    /// Reports horizontal viewport movement without turning it into date selection.
    let onViewportDateChange: (Date) -> Void
    /// Tap a column header to leave Week and open Day for that date.
    let onOpenDay: (Date) -> Void
    let onOpen: (HomeAgendaItem) -> Void
    let onEdit: (HomeAgendaItem) -> Void
    let onCopy: (HomeAgendaItem) -> Void
    let onDuplicate: (HomeAgendaItem) -> Void
    let movingEventID: String?
    let onStartMove: (HomeAgendaItem) -> Void
    let onChooseMoveTarget: (Date) -> Void
    /// Direct drag-move from an event card to a new start time.
    let onDragMove: (HomeAgendaItem, Date) -> Void
    let onVisibleDayCountChange: (Int) -> Void
    let onTimelineDensityChange: (Int) -> Void
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
    /// Live horizontal day-shift offset (positive = reveal previous days).
    @State private var panOffset: CGFloat = 0
    @State private var isCommittingDayShift = false
    @State private var isHorizontalPanLocked = false

    private let calendar = Calendar.sideSeatBerlin
    private let timeGutter = CalendarChrome.weekTimeGutter
    private let headerHeight = CalendarChrome.weekHeaderHeight
    private static let denseCalendarStressTestEnabled =
        ProcessInfo.processInfo.arguments.contains("--ui-testing-dense-calendar")
    private static let exposesScrollAnchorsForUITesting =
        ProcessInfo.processInfo.arguments.contains("--ui-testing-expose-scroll-anchors")

    private var dayCount: Int {
        HomeWeekWindow.clampVisibleDayCount(visibleDayCount)
    }

    private var densityLevel: Int {
        HomeWeekWindow.clampTimelineDensityLevel(timelineDensityLevel)
    }

    private var minuteHeight: CGFloat {
        CalendarChrome.weekMinuteHeight * HomeWeekWindow.timelineScale(for: densityLevel)
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
                    Divider().opacity(0.35)
                    if hasAllDay {
                        allDayRow(
                            strip: strip,
                            dayWidth: dayWidth,
                            daysWidth: daysWidth,
                            stripWidth: stripWidth,
                            stripX: stripX
                        )
                        Divider().opacity(0.35)
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
                            .simultaneousGesture(dayShiftGesture(from: start, dayWidth: dayWidth))
                        }
                        .scrollDisabled(
                            armedEventID != nil
                                || dragPreview != nil
                                || isHorizontalPanLocked
                                || abs(panOffset) > 0.5
                        )
                        .scrollIndicators(.hidden)
                        // Horizontal paging updates `start`, but must not reset the
                        // vertical time position. Density changes alter the Y scale,
                        // while Today explicitly bumps `scrollAnchorToken`.
                        .task(id: "\(scrollAnchorToken)-\(densityLevel)") {
                            await Task.yield()
                            try? await Task.sleep(nanoseconds: 50_000_000)
                            proxy.scrollTo(verticalScrollSlotID(for: focusDate), anchor: .top)
                        }
                    }
                }

            }
        }
        .frame(minHeight: 420, maxHeight: .infinity)
        .background(SideSeatTheme.bg)
        .safeAreaInset(edge: .bottom, spacing: 0) {
            weekDisplayBar
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("home-week-timetable")
        .calendarItemActions(
            item: $menuEvent,
            onOpen: onOpen,
            onEdit: onEdit,
            onCopy: onCopy,
            onDuplicate: onDuplicate,
            onStartMove: onStartMove,
            moveAccessibilityIdentifier: "home-week-event-context-move"
        )
        .confirmationDialog(
            menuSlot.map { slotMenuTitle(for: $0) } ?? "",
            isPresented: Binding(
                get: { menuSlot != nil },
                set: { if !$0 { menuSlot = nil } }
            ),
            titleVisibility: .visible,
            presenting: menuSlot
        ) { slot in
            Button("New event") {
                onFocusDate(slot)
                onCreateAtSlot(slot)
            }
            if canPaste {
                Button("Paste copied event") {
                    onFocusDate(slot)
                    onPasteAtSlot(slot)
                }
            }
            Button("Cancel", role: .cancel) {}
        }
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
                isHorizontalPanLocked = false
                isCommittingDayShift = false
                armedEventID = nil
                dragPreview = nil
            }
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
                isHorizontalPanLocked = false
                isCommittingDayShift = false
                armedEventID = nil
                dragPreview = nil
            }
            onViewportDateChange(next)
        }
        .onChange(of: movingEventID) { _, _ in
            armedEventID = nil
            dragPreview = nil
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
            format: String(localized: "New event at %@"),
            slot.formatted(date: .omitted, time: .shortened)
        )
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
        }
        .buttonStyle(.plain)
        .accessibilityLabel(
            String(
                format: String(localized: "Open day %@"),
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
                ForEach(0..<48, id: \.self) { index in
                    let minute = index * 30
                    Color.clear
                        .frame(width: timeGutter, height: CGFloat(30) * minuteHeight)
                        .id("week-scroll-\(minute)")
                        .accessibilityIdentifier(
                            Self.exposesScrollAnchorsForUITesting ? "week-scroll-\(minute)" : ""
                        )
                        .accessibilityHidden(!Self.exposesScrollAnchorsForUITesting)
                }
            }
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
                        onLongPress: { item in
                            guard movingEventID == nil, dragPreview == nil else { return }
                            onFocusDate(day)
                            menuEvent = item
                        }
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
        let isToday = calendar.isDateInToday(day)

        return ZStack(alignment: .topLeading) {
            if isToday {
                CalendarChrome.todayWash
                    .frame(width: width, height: height)
            }

            ForEach(0..<48, id: \.self) { index in
                let minute = index * 30
                Rectangle()
                    .fill(index.isMultiple(of: 2) ? CalendarChrome.hourLine : CalendarChrome.halfHourLine)
                    .frame(width: width, height: index.isMultiple(of: 2) ? 0.66 : 0.33)
                    .offset(y: CGFloat(minute) * minuteHeight)
            }

            Rectangle()
                .fill(CalendarChrome.columnDivider)
                .frame(width: 0.5, height: height)

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
                    .allowsHitTesting(movingEventID == nil && dragPreview == nil)
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

            if movingEventID != nil, dragPreview == nil {
                ForEach(0..<48, id: \.self) { index in
                    weekMoveTarget(day: day, index: index, width: width)
                }
            }
        }
        .frame(width: width, height: height, alignment: .topLeading)
        .overlay(alignment: .bottom) {
            Rectangle()
                .fill(CalendarChrome.hourLine)
                .frame(height: 0.66)
                .allowsHitTesting(false)
        }
        .clipped()
    }

    private func weekMoveTarget(day: Date, index: Int, width: CGFloat) -> some View {
        let minute = index * 30
        return Button {
            guard let slot = calendar.date(
                byAdding: .minute,
                value: minute,
                to: calendar.startOfDay(for: day)
            ) else { return }
            onFocusDate(day)
            onChooseMoveTarget(slot)
        } label: {
            Rectangle()
                .fill(SideSeatTheme.accent.opacity(index.isMultiple(of: 2) ? 0.055 : 0.035))
                .overlay(alignment: .top) {
                    Rectangle()
                        .fill(SideSeatTheme.accent.opacity(0.18))
                        .frame(height: 0.5)
                }
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .frame(width: width, height: CGFloat(30) * minuteHeight)
        .offset(y: CGFloat(minute) * minuteHeight)
        .accessibilityIdentifier("week-move-target-\(dayID(day))-\(minute)")
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
                            .fill(CalendarChrome.nowRed.opacity(isToday ? 1 : 0.28))
                            .frame(
                                width: dayWidth,
                                height: isToday
                                    ? CalendarChrome.nowLineThickness
                                    : max(1, CalendarChrome.nowLineThickness * 0.4)
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
                    format: String(localized: "Current time, %@"),
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
            emphasized: placement.item.id == movingEventID || isDragging,
            context: placement.item.context,
            contextSymbol: CalendarChrome.eventContextSymbol(for: placement.item),
            compact: true
        )
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
                days: days
            )
        )
        .offset(x: x, y: hitTarget.top)
        .allowsHitTesting(movingEventID == nil && (dragPreview == nil || isDragging))
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
        days: [Date]
    ) -> some Gesture {
        let tap = TapGesture()
            .onEnded {
                guard movingEventID == nil, armedEventID == nil, dragPreview == nil else { return }
                onFocusDate(renderedDay)
                onOpen(placement.item)
            }
        let longPressDrag = LongPressGesture(minimumDuration: 0.25, maximumDistance: 14)
            .sequenced(before: DragGesture(minimumDistance: 0, coordinateSpace: .local))
            .onChanged { value in
                guard case .second(true, let drag) = value, movingEventID == nil else { return }
                armEventGestureIfNeeded(placement.item)

                guard
                    canDirectDrag(placement.item, renderedDay: renderedDay, visibleDays: days),
                    let drag,
                    HomeWeekWindow.isEventDragActivated(translation: drag.translation)
                else { return }

                updateDragPreview(
                    for: placement,
                    translation: drag.translation,
                    dayWidth: dayWidth,
                    days: days
                )
            }
            .onEnded { value in
                defer {
                    dragPreview = nil
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
                guard let target = dragTargetDate(for: preview, days: days) else { return }
                guard abs(target.timeIntervalSince(placement.item.start)) >= 60 else { return }
                UIImpactFeedbackGenerator(style: .light).impactOccurred()
                onFocusDate(target)
                onDragMove(placement.item, target)
            }

        return longPressDrag.simultaneously(with: tap)
    }

    private var canUseEmptySlots: Bool {
        movingEventID == nil && armedEventID == nil && dragPreview == nil
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

    private func armEventGestureIfNeeded(_ item: HomeAgendaItem) {
        guard armedEventID != item.id else { return }
        armedEventID = item.id
        menuEvent = nil
        menuSlot = nil
        panOffset = 0
        isHorizontalPanLocked = false
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
        onFocusDate(renderedDay)
        menuEvent = item
    }

    private func updateDragPreview(
        for placement: CalendarDayPlacement,
        translation: CGSize,
        dayWidth: CGFloat,
        days: [Date]
    ) {
        guard let originDayIndex = days.firstIndex(where: {
            calendar.isDate($0, inSameDayAs: placement.item.start)
        }) else { return }
        let target = HomeWeekWindow.eventDragTarget(
            originDayIndex: originDayIndex,
            originStartMinute: placement.startMinute,
            translation: translation,
            dayWidth: dayWidth,
            minuteHeight: minuteHeight,
            dayCount: days.count
        )

        if dragPreview == nil {
            dragPreview = WeekDragPreview(
                item: placement.item,
                targetDayIndex: target.dayIndex,
                targetStartMinute: target.startMinute
            )
            return
        }
        guard var preview = dragPreview else { return }
        let targetChanged = preview.targetDayIndex != target.dayIndex
            || preview.targetStartMinute != target.startMinute
        guard targetChanged else { return }
        preview.targetDayIndex = target.dayIndex
        preview.targetStartMinute = target.startMinute
        withAnimation(.interactiveSpring(response: 0.16, dampingFraction: 0.88)) {
            dragPreview = preview
        }
        UISelectionFeedbackGenerator().selectionChanged()
    }

    private func dragTargetDate(
        for preview: WeekDragPreview,
        days: [Date]
    ) -> Date? {
        guard days.indices.contains(preview.targetDayIndex) else { return nil }
        let targetDay = days[preview.targetDayIndex]
        return calendar.date(
            byAdding: .minute,
            value: preview.targetStartMinute,
            to: calendar.startOfDay(for: targetDay)
        )
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
        let durationMinutes = max(
            15,
            Int(preview.item.end.timeIntervalSince(preview.item.start) / 60)
        )
        return max(18, CGFloat(durationMinutes) * minuteHeight - 1.5)
    }

    private func dragPreviewTimeLabel(_ preview: WeekDragPreview, days: [Date]) -> String {
        guard let start = dragTargetDate(for: preview, days: days) else {
            return CalendarChrome.compactClock(preview.item.start)
        }
        let end = start.addingTimeInterval(preview.item.end.timeIntervalSince(preview.item.start))
        let day = start.formatted(.dateTime.weekday(.abbreviated).day())
        return "\(day)  \(CalendarChrome.compactClock(start))–\(CalendarChrome.compactClock(end))"
    }

    private func dayShiftGesture(from start: Date, dayWidth: CGFloat) -> some Gesture {
        DragGesture(minimumDistance: 16, coordinateSpace: .local)
            .onChanged { value in
                guard armedEventID == nil, dragPreview == nil, !isCommittingDayShift else { return }

                let dx = value.translation.width
                let dy = value.translation.height
                if !isHorizontalPanLocked {
                    // Lock only after a clearly horizontal intent so vertical scrolling stays smooth.
                    guard abs(dx) > 18, abs(dx) > abs(dy) * 1.25 else { return }
                    isHorizontalPanLocked = true
                }

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
                defer {
                    isHorizontalPanLocked = false
                }
                guard armedEventID == nil, dragPreview == nil, !isCommittingDayShift else {
                    withAnimation(.interactiveSpring(response: 0.28, dampingFraction: 0.9)) {
                        panOffset = 0
                    }
                    return
                }

                let wasHorizontal = isHorizontalPanLocked
                    || abs(value.translation.width) > abs(value.translation.height) * 1.25
                guard wasHorizontal else {
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
                            String(format: String(localized: "%lld days"), Int64(count))
                        )
                }
            }
            .pickerStyle(.segmented)
            .frame(maxWidth: 180)

            Divider()
                .frame(height: 24)

            Button {
                onTimelineDensityChange(
                    HomeWeekWindow.clampTimelineDensityLevel(densityLevel - 1)
                )
            } label: {
                Image(systemName: "minus.magnifyingglass")
                    .frame(width: 32, height: 32)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .foregroundStyle(SideSeatTheme.textPrimary)
            .disabled(densityLevel == 0)
            .accessibilityLabel("Decrease time spacing")
            .accessibilityIdentifier("home-week-time-density-decrease")

            Button {
                onTimelineDensityChange(
                    HomeWeekWindow.clampTimelineDensityLevel(densityLevel + 1)
                )
            } label: {
                Image(systemName: "plus.magnifyingglass")
                    .frame(width: 32, height: 32)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .foregroundStyle(SideSeatTheme.textPrimary)
            .disabled(densityLevel == 2)
            .accessibilityLabel("Increase time spacing")
            .accessibilityIdentifier("home-week-time-density-increase")
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
    var targetDayIndex: Int
    var targetStartMinute: Int
}
