import SwiftUI

/// Native phone week timetable: configurable day columns, shared time axis.
/// Date selection lives in `HomeDateStripView`; column headers only label + drill into Day.
struct HomeWeekTimetableView: View {
    let focusDate: Date
    let visibleDayCount: Int
    let schedule: NativeHomeSchedule?
    let onFocusDate: (Date) -> Void
    /// Tap a column header to leave Week and open Day for that date.
    let onOpenDay: (Date) -> Void
    let onOpen: (HomeAgendaItem) -> Void
    let onCopy: (HomeAgendaItem) -> Void
    let onDuplicate: (HomeAgendaItem) -> Void
    let movingEventID: String?
    let onStartMove: (HomeAgendaItem) -> Void
    let onChooseMoveTarget: (Date) -> Void
    /// Direct drag-move from an event card to a new start time.
    let onDragMove: (HomeAgendaItem, Date) -> Void
    let onVisibleDayCountChange: (Int) -> Void
    let canPaste: Bool
    let onCreateAtSlot: (Date) -> Void
    let onPasteAtSlot: (Date) -> Void
    /// Bumped by Home "Today" to re-anchor near now without chasing the clock.
    var scrollAnchorToken: Int = 0

    @State private var viewportStart: Date?
    @State private var menuEvent: HomeAgendaItem?
    @State private var menuSlot: Date?
    @State private var dragPreview: WeekDragPreview?
    @State private var pinchBaseDayCount: Int?
    @State private var visibleDaysHint: String?
    @State private var visibleDaysHintTask: Task<Void, Never>?
    /// Live horizontal day-shift offset (positive = reveal previous days).
    @State private var panOffset: CGFloat = 0
    @State private var isCommittingDayShift = false
    @State private var isHorizontalPanLocked = false

    private let calendar = Calendar.sideSeatBerlin
    private let minuteHeight = CalendarChrome.weekMinuteHeight
    private let timeGutter = CalendarChrome.weekTimeGutter
    private let headerHeight = CalendarChrome.weekHeaderHeight

    private var dayCount: Int {
        HomeWeekWindow.clampVisibleDayCount(visibleDayCount)
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
            !(schedule?.items(on: day, calendar: calendar) ?? []).filter {
                $0.isAllDayStyle(on: day, calendar: calendar)
            }.isEmpty
        }

        GeometryReader { geometry in
            // Floor widths so header + grid columns share exact pixel sizes.
            let usableWidth = max(0, geometry.size.width - timeGutter)
            let dayWidth = max(CalendarChrome.weekMinDayWidth, floor(usableWidth / CGFloat(dayCount)))
            let daysWidth = dayWidth * CGFloat(dayCount)
            let stripWidth = dayWidth * CGFloat(strip.count)
            let gridHeight = minuteHeight * 24 * 60
            let stripX = -dayWidth + panOffset

            ZStack(alignment: .topTrailing) {
                VStack(spacing: 0) {
                    headerRow(
                        strip: strip,
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
                                    timeGutterColumn(height: gridHeight)
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
                                    dragPreviewCard(dragPreview, dayWidth: dayWidth)
                                }
                            }
                            .frame(width: timeGutter + daysWidth, height: gridHeight, alignment: .topLeading)
                            .contentShape(Rectangle())
                            .simultaneousGesture(dayShiftGesture(from: start, dayWidth: dayWidth))
                            .simultaneousGesture(visibleDaysPinchGesture)
                        }
                        .scrollDisabled(isHorizontalPanLocked || abs(panOffset) > 0.5)
                        .scrollIndicators(.hidden)
                        .task(id: "\(dayID(start))-\(dayID(focusDate))-\(scrollAnchorToken)-\(dayCount)") {
                            await Task.yield()
                            try? await Task.sleep(nanoseconds: 50_000_000)
                            proxy.scrollTo(verticalScrollSlotID(for: focusDate), anchor: .top)
                        }
                    }
                }

                if let visibleDaysHint {
                    Text(visibleDaysHint)
                        .font(.caption.weight(.semibold))
                        .padding(.horizontal, 12)
                        .padding(.vertical, 7)
                        .background(.ultraThinMaterial, in: Capsule())
                        .padding(.top, 10)
                        .padding(.trailing, 12)
                        .transition(.opacity)
                        .accessibilityIdentifier("home-week-visible-days-hint")
                }
            }
        }
        .frame(minHeight: 420, maxHeight: .infinity)
        .background(SideSeatTheme.bg)
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("home-week-timetable")
        .confirmationDialog(
            menuEvent?.title ?? "",
            isPresented: Binding(
                get: { menuEvent != nil },
                set: { if !$0 { menuEvent = nil } }
            ),
            titleVisibility: .visible,
            presenting: menuEvent
        ) { item in
            Button("Edit event") { onOpen(item) }
            Button("Copy") { onCopy(item) }
            Button("Duplicate after event") { onDuplicate(item) }
            Button("Move event") { onStartMove(item) }
                .accessibilityIdentifier("home-week-event-context-move")
            Button("Cancel", role: .cancel) {}
        }
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
                viewportStart = HomeWeekWindow.viewportStart(
                    containing: focusDate,
                    visibleDayCount: dayCount,
                    calendar: calendar
                )
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
            }
        }
        .onChange(of: dayCount) { _, _ in
            var transaction = Transaction()
            transaction.disablesAnimations = true
            withTransaction(transaction) {
                viewportStart = HomeWeekWindow.viewportStart(
                    containing: focusDate,
                    visibleDayCount: dayCount,
                    calendar: calendar
                )
                panOffset = 0
                isHorizontalPanLocked = false
                isCommittingDayShift = false
            }
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
        dayWidth: CGFloat,
        daysWidth: CGFloat,
        stripWidth: CGFloat,
        stripX: CGFloat
    ) -> some View {
        HStack(spacing: 0) {
            Color.clear.frame(width: timeGutter, height: headerHeight)
            HStack(spacing: 0) {
                ForEach(strip, id: \.self) { day in
                    dayHeader(day: day)
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

    private func dayHeader(day: Date) -> some View {
        let selected = calendar.isDate(day, inSameDayAs: focusDate)
        let isToday = calendar.isDateInToday(day)

        return Button {
            onOpenDay(day)
        } label: {
            CalendarDayChipLabel(
                day: day,
                selected: selected,
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
        .accessibilityAddTraits(selected ? .isSelected : [])
        .accessibilityIdentifier("home-week-day-\(dayID(day))")
    }

    private func timeGutterColumn(height: CGFloat) -> some View {
        ZStack(alignment: .topTrailing) {
            VStack(spacing: 0) {
                ForEach(0..<48, id: \.self) { index in
                    let minute = index * 30
                    Color.clear
                        .frame(width: timeGutter, height: CGFloat(30) * minuteHeight)
                        .id("week-scroll-\(minute)")
                        .accessibilityIdentifier("week-scroll-\(minute)")
                }
            }
            ForEach(1..<24, id: \.self) { hour in
                Text(CalendarChrome.compactHour(hour))
                    .font(CalendarChrome.Typography.hourRail)
                    .foregroundStyle(SideSeatTheme.textSecondary)
                    .lineLimit(1)
                    .frame(width: timeGutter - 8, alignment: .trailing)
                    .offset(y: CGFloat(hour * 60) * minuteHeight - 7)
            }
        }
        .frame(width: timeGutter, height: height, alignment: .top)
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
                    let items = (schedule?.items(on: day, calendar: calendar) ?? []).filter {
                        $0.isAllDayStyle(on: day, calendar: calendar)
                    }
                    CalendarAllDayBand(items: items, onOpen: onOpen)
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
        let items = (schedule?.items(on: day, calendar: calendar) ?? []).filter {
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
        let timedItems = (schedule?.items(on: day, calendar: calendar) ?? []).filter {
            !$0.isAllDayStyle(on: day, calendar: calendar)
        }
        let placements = CalendarDayLayout.placements(items: timedItems, on: day, calendar: calendar)
        let isToday = calendar.isDateInToday(day)
        let selected = calendar.isDate(day, inSameDayAs: focusDate)

        return ZStack(alignment: .topLeading) {
            if isToday {
                CalendarChrome.todayWash
                    .frame(width: width, height: height)
            } else if selected {
                CalendarChrome.selectedWash
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
                    .onTapGesture {
                        guard movingEventID == nil, dragPreview == nil else { return }
                        guard let slot = calendar.date(
                            byAdding: .minute,
                            value: minute,
                            to: calendar.startOfDay(for: day)
                        ) else { return }
                        onFocusDate(day)
                        onCreateAtSlot(slot)
                    }
                    .onLongPressGesture {
                        guard movingEventID == nil, dragPreview == nil else { return }
                        guard let slot = calendar.date(
                            byAdding: .minute,
                            value: minute,
                            to: calendar.startOfDay(for: day)
                        ) else { return }
                        onFocusDate(day)
                        menuSlot = slot
                    }
                    .allowsHitTesting(movingEventID == nil && dragPreview == nil)
                    .accessibilityHidden(true)
            }

            ForEach(placements) { placement in
                weekEventCard(
                    placement,
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

        return CalendarEventBlockLabel(
            title: placement.item.title,
            subtitle: nil,
            color: color,
            height: height,
            emphasized: placement.item.id == movingEventID || isDragging
        )
        .opacity(isDragging ? 0.35 : 1)
        .frame(width: laneWidth, height: height, alignment: .topLeading)
        .contentShape(Rectangle())
        .onTapGesture {
            guard movingEventID == nil, dragPreview == nil else { return }
            onFocusDate(placement.item.start)
            onOpen(placement.item)
        }
        .onLongPressGesture {
            guard movingEventID == nil, dragPreview == nil, placement.item.source == .event else { return }
            onFocusDate(placement.item.start)
            menuEvent = placement.item
        }
        .gesture(eventDragGesture(for: placement, dayWidth: dayWidth, days: days))
        .offset(x: x, y: CGFloat(placement.startMinute) * minuteHeight + 0.5)
        .allowsHitTesting(movingEventID == nil)
        .accessibilityIdentifier("home-week-event-\(placement.item.id)")
        .accessibilityAddTraits(.isButton)
    }

    private func eventDragGesture(
        for placement: CalendarDayPlacement,
        dayWidth: CGFloat,
        days: [Date]
    ) -> some Gesture {
        LongPressGesture(minimumDuration: 0.28)
            .sequenced(before: DragGesture(minimumDistance: 2))
            .onChanged { value in
                guard placement.item.source == .event, movingEventID == nil else { return }
                switch value {
                case .second(true, let drag):
                    let translation = drag?.translation ?? .zero
                    if dragPreview == nil {
                        dragPreview = WeekDragPreview(
                            item: placement.item,
                            originStartMinute: placement.startMinute,
                            originDayIndex: days.firstIndex(where: {
                                calendar.isDate($0, inSameDayAs: placement.item.start)
                            }) ?? 0,
                            translation: translation
                        )
                    } else if var preview = dragPreview {
                        preview.translation = translation
                        dragPreview = preview
                    }
                default:
                    break
                }
            }
            .onEnded { value in
                guard placement.item.source == .event else {
                    dragPreview = nil
                    return
                }
                defer { dragPreview = nil }
                guard case .second(true, let drag?) = value else { return }
                guard let target = dragTargetDate(
                    for: placement,
                    translation: drag.translation,
                    dayWidth: dayWidth,
                    days: days
                ) else { return }
                onFocusDate(target)
                onDragMove(placement.item, target)
            }
    }

    private func dragTargetDate(
        for placement: CalendarDayPlacement,
        translation: CGSize,
        dayWidth: CGFloat,
        days: [Date]
    ) -> Date? {
        let originIndex = days.firstIndex(where: {
            calendar.isDate($0, inSameDayAs: placement.item.start)
        }) ?? 0
        let dayDelta = Int((translation.width / max(dayWidth, 1)).rounded())
        let minuteDelta = Int((translation.height / minuteHeight / 15).rounded()) * 15
        let targetIndex = min(max(originIndex + dayDelta, 0), max(days.count - 1, 0))
        let targetDay = days[targetIndex]
        let targetMinute = min(max(placement.startMinute + minuteDelta, 0), 24 * 60 - 15)
        return calendar.date(byAdding: .minute, value: targetMinute, to: calendar.startOfDay(for: targetDay))
    }

    private func dragPreviewCard(
        _ preview: WeekDragPreview,
        dayWidth: CGFloat
    ) -> some View {
        let durationMinutes = max(
            15,
            Int(preview.item.end.timeIntervalSince(preview.item.start) / 60)
        )
        let height = max(18, CGFloat(durationMinutes) * minuteHeight - 1.5)
        let originX = timeGutter + CGFloat(preview.originDayIndex) * dayWidth + 1
        let originY = CGFloat(preview.originStartMinute) * minuteHeight + 0.5
        return CalendarEventBlockLabel(
            title: preview.item.title,
            subtitle: nil,
            color: CalendarChrome.eventColor(for: preview.item),
            height: height,
            emphasized: true
        )
        .frame(width: max(40, dayWidth - 6), height: height, alignment: .topLeading)
        .shadow(color: .black.opacity(0.18), radius: 8, y: 4)
        .offset(x: originX + preview.translation.width, y: originY + preview.translation.height)
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }

    private func dayShiftGesture(from start: Date, dayWidth: CGFloat) -> some Gesture {
        DragGesture(minimumDistance: 16, coordinateSpace: .local)
            .onChanged { value in
                guard dragPreview == nil, pinchBaseDayCount == nil, !isCommittingDayShift else { return }

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
                guard dragPreview == nil, pinchBaseDayCount == nil, !isCommittingDayShift else {
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
                           let next = calendar.date(byAdding: .day, value: delta, to: start),
                           let focus = calendar.date(byAdding: .day, value: delta, to: focusDate)
                        {
                            viewportStart = next
                            onFocusDate(focus)
                        }
                        panOffset = 0
                        isCommittingDayShift = false
                    }
                }
            }
    }

    private var visibleDaysPinchGesture: some Gesture {
        MagnificationGesture()
            .onChanged { magnification in
                guard dragPreview == nil else { return }
                if pinchBaseDayCount == nil {
                    pinchBaseDayCount = dayCount
                }
                guard let base = pinchBaseDayCount else { return }
                let next = HomeWeekWindow.visibleDayCount(base: base, magnification: magnification)
                if next != dayCount {
                    onVisibleDayCountChange(next)
                    showVisibleDaysHint(next)
                }
            }
            .onEnded { magnification in
                let base = pinchBaseDayCount ?? dayCount
                let next = HomeWeekWindow.visibleDayCount(base: base, magnification: magnification)
                onVisibleDayCountChange(next)
                showVisibleDaysHint(next)
                pinchBaseDayCount = nil
            }
    }

    private func showVisibleDaysHint(_ count: Int) {
        let text = String(format: String(localized: "%lld days"), Int64(count))
        visibleDaysHint = text
        visibleDaysHintTask?.cancel()
        visibleDaysHintTask = Task { @MainActor in
            try? await Task.sleep(nanoseconds: 900_000_000)
            guard !Task.isCancelled else { return }
            visibleDaysHint = nil
        }
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
    let originStartMinute: Int
    let originDayIndex: Int
    var translation: CGSize
}
