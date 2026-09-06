import SwiftUI
import UIKit

private struct CalendarDayScrollOffsetPreferenceKey: PreferenceKey {
    static let defaultValue: CGFloat = 0

    static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) {
        value = nextValue()
    }
}

private struct CalendarDayViewportTrackingModifier: ViewModifier {
    let minuteHeight: CGFloat
    let stepMinutes: Int
    @Binding var viewportStartMinute: Int?

    @ViewBuilder
    func body(content: Content) -> some View {
        if #available(iOS 18.0, *) {
            content.onScrollGeometryChange(for: Int.self) { geometry in
                let offset = max(0, geometry.contentOffset.y + geometry.contentInsets.top)
                return snappedMinute(forOffset: offset)
            } action: { _, nextMinute in
                guard nextMinute != viewportStartMinute else { return }
                viewportStartMinute = nextMinute
            }
        } else {
            content
        }
    }

    private func snappedMinute(forOffset offset: CGFloat) -> Int {
        let rawMinute = max(0, offset / minuteHeight)
        let step = CGFloat(stepMinutes)
        let maximumMinute = CGFloat(24 * 60 - stepMinutes)
        return Int(min(max(floor(rawMinute / step) * step, 0), maximumMinute))
    }
}

struct CalendarDayTimelineView: View {
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    @Environment(\.accessibilityReduceMotion) private var accessibilityReduceMotion

    let date: Date
    let items: [HomeAgendaItem]
    let onOpen: (HomeAgendaItem) -> Void
    let onCopy: (HomeAgendaItem) -> Void
    let onDuplicate: (HomeAgendaItem) -> Void
    let onDelete: (HomeAgendaItem) -> Void
    let canPaste: Bool
    let onCreateAtSlot: (Date) -> Void
    let onPasteAtSlot: (Date) -> Void
    /// Bumped by Home "Today" to re-anchor near now without chasing the clock.
    var scrollAnchorToken: Int = 0

    @State private var menuEvent: HomeAgendaItem?
    @State private var menuSlot: Date?
    @State private var verticalScrollPositionID: String?
    @State private var verticalViewportStartMinute: Int?
    @State private var verticalViewportHeight: CGFloat = 1

    private let calendar = Calendar.sideSeatBerlin
    private let minuteHeight = CalendarChrome.dayMinuteHeight
    private let timeGutter = CalendarChrome.dayTimeGutter
    private static let verticalScrollPositionStepMinutes = 5
    private static let scrollCoordinateSpace = "calendar-day-scroll-coordinate-space"

    private var allDayItems: [HomeAgendaItem] {
        items.filter { $0.isAllDayStyle(on: date, calendar: calendar) }
    }

    private var timedItems: [HomeAgendaItem] {
        items.filter { !$0.isAllDayStyle(on: date, calendar: calendar) }
    }

    var body: some View {
        VStack(spacing: 0) {
            if !allDayItems.isEmpty {
                HStack(alignment: .top, spacing: 0) {
                    Text("All day")
                        .font(CalendarChrome.Typography.allDayLabel)
                        .foregroundStyle(SideSeatTheme.textSecondary)
                        .frame(width: timeGutter, alignment: .trailing)
                        .padding(.trailing, 6)
                        .padding(.top, 8)
                    CalendarAllDayBand(
                        items: allDayItems,
                        onOpen: onOpen,
                        selectedActionItem: $menuEvent,
                        onLongPress: { item in
                            guard item.source == .event else { return }
                            menuEvent = item
                        },
                        onCopy: onCopy,
                        onDuplicate: onDuplicate,
                        onDelete: onDelete
                    )
                }
                .padding(.bottom, 4)
                Rectangle()
                    .fill(CalendarChrome.hourLine)
                    .frame(height: CalendarChrome.hourLineThickness)
                    .allowsHitTesting(false)
            }

            GeometryReader { geometry in
                let gridHeight = minuteHeight * 24 * 60
                let contentHeight = gridHeight + CalendarChrome.timelineEndCapHeight

                ScrollViewReader { reader in
                    ScrollView(.vertical) {
                        ZStack(alignment: .topLeading) {
                            // Laid-out anchors so ScrollViewReader can find real Y positions.
                            VStack(spacing: 0) {
                                ForEach(
                                    0..<(24 * 60 / Self.verticalScrollPositionStepMinutes),
                                    id: \.self
                                ) { index in
                                    let minute = index * Self.verticalScrollPositionStepMinutes
                                    Color.clear
                                        .frame(
                                            // Match the week timeline's full gutter-width targets.
                                            // A one-point target can be scrolled to, but SwiftUI may
                                            // drop it from the scroll-position binding after layout.
                                            width: timeGutter,
                                            height: CGFloat(Self.verticalScrollPositionStepMinutes) * minuteHeight
                                        )
                                        .id("timeline-slot-\(minute)")
                                        .allowsHitTesting(false)
                                }
                            }
                            .scrollTargetLayout()
                            .accessibilityHidden(true)

                            timeline(width: geometry.size.width)
                        }
                        .frame(
                            width: geometry.size.width,
                            height: contentHeight,
                            alignment: .topLeading
                        )
                        .background {
                            GeometryReader { contentGeometry in
                                Color.clear.preference(
                                    key: CalendarDayScrollOffsetPreferenceKey.self,
                                    value: contentGeometry.frame(
                                        in: .named(Self.scrollCoordinateSpace)
                                    ).minY
                                )
                            }
                        }
                    }
                    .scrollIndicators(.hidden)
                    .scrollPosition(id: $verticalScrollPositionID, anchor: .top)
                    .accessibilityIdentifier("calendar-day-timeline")
                    .coordinateSpace(name: Self.scrollCoordinateSpace)
                    .onPreferenceChange(CalendarDayScrollOffsetPreferenceKey.self) { contentMinY in
                        updateViewportStartMinute(forContentMinY: contentMinY)
                    }
                    .modifier(
                        CalendarDayViewportTrackingModifier(
                            minuteHeight: minuteHeight,
                            stepMinutes: Self.verticalScrollPositionStepMinutes,
                            viewportStartMinute: $verticalViewportStartMinute
                        )
                    )
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
                        offscreenEventIndicators(width: geometry.size.width, reader: reader)
                    }
                    // Keep the final time slots scrollable above Home's 44-point
                    // calendar-canvas create action without changing root geometry.
                    .contentMargins(.bottom, 86, for: .scrollContent)
                    // Changing the visible day must keep the same vertical time position.
                    // Only an explicit re-anchor request (for example, Today) scrolls again.
                    .task(id: scrollAnchorToken) {
                        await Task.yield()
                        try? await Task.sleep(nanoseconds: 50_000_000)
                        let target = scrollTargetID
                        verticalScrollPositionID = target
                        verticalViewportStartMinute = timelineMinute(from: target)
                        reader.scrollTo(target, anchor: .top)
                    }
                }
            }
        }
        .frame(
            minHeight: dynamicTypeSize.isAccessibilitySize ? 0 : 420,
            maxHeight: .infinity
        )
        .background(SideSeatTheme.bg)
        .ssLongPressActionMenu(
            isPresented: Binding(
                get: { menuSlot != nil },
                set: { if !$0 { menuSlot = nil } }
            ),
            title: menuSlot.map(newEventLabel(for:)) ?? AppLocalization.string("New event"),
            actions: slotMenuActions
        )
    }

    private var slotMenuActions: [SSLongPressAction] {
        guard let slot = menuSlot else { return [] }
        var actions = [
            SSLongPressAction(
                id: "calendar-slot-context-new-event",
                title: AppLocalization.string("New event"),
                systemImage: "calendar.badge.plus",
                perform: { onCreateAtSlot(slot) }
            ),
        ]
        if canPaste {
            actions.append(
                SSLongPressAction(
                    id: "calendar-slot-context-paste-event",
                    title: AppLocalization.string("Paste copied event"),
                    systemImage: "doc.on.clipboard",
                    perform: { onPasteAtSlot(slot) }
                )
            )
        }
        return actions
    }

    private func timeline(width: CGFloat) -> some View {
        let placements = CalendarDayLayout.placements(items: timedItems, on: date, calendar: calendar)
        return ZStack(alignment: .topLeading) {
            ForEach(0...48, id: \.self) { index in
                let minute = index * 30
                Rectangle()
                    .fill(index.isMultiple(of: 2) ? CalendarChrome.hourLine : CalendarChrome.halfHourLine)
                    .frame(
                        height: index.isMultiple(of: 2)
                            ? CalendarChrome.hourLineThickness
                            : CalendarChrome.halfHourLineThickness
                    )
                    .offset(x: timeGutter, y: CGFloat(minute) * minuteHeight)
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
                .offset(y: CGFloat(24 * 60) * minuteHeight - 7)
                .accessibilityHidden(true)

            ForEach(0..<48, id: \.self) { index in
                let minute = index * 30
                Color.clear
                    .contentShape(Rectangle())
                    .frame(width: max(0, width - timeGutter), height: CGFloat(30) * minuteHeight)
                    .offset(x: timeGutter, y: CGFloat(minute) * minuteHeight)
                    .calendarTapOrLongPress(
                        onTap: {
                            guard let slot = slotDate(minute: minute) else { return }
                            onCreateAtSlot(slot)
                        },
                        onLongPress: {
                            guard let slot = slotDate(minute: minute) else { return }
                            menuSlot = slot
                        }
                    )
                    .accessibilityElement()
                    .accessibilityLabel(slotAccessibilityLabel(minute: minute))
                    .accessibilityHint("Creates an event. Long press for more actions.")
                    .accessibilityIdentifier("calendar-slot-\(minute)")
            }

            ForEach(placements) { placement in
                eventCard(placement, availableWidth: max(0, width - timeGutter - 8))
            }

            if calendar.isDateInToday(date) {
                TimelineView(.periodic(from: .now, by: 60)) { context in
                    let now = context.date
                    let minute =
                        calendar.component(.hour, from: now) * 60
                        + calendar.component(.minute, from: now)

                    HStack(spacing: 0) {
                        CalendarNowTimeBadge(date: now)
                            .frame(width: timeGutter - 2, alignment: .trailing)
                            .padding(.trailing, 2)

                        Rectangle()
                            .fill(CalendarChrome.nowAccent)
                            .frame(height: CalendarChrome.nowLineThickness)
                            .frame(height: CalendarChrome.nowLineHitSlop, alignment: .center)
                    }
                    .frame(width: width, alignment: .leading)
                    .offset(y: CGFloat(minute) * minuteHeight - 8)
                    .allowsHitTesting(false)
                    .accessibilityIdentifier("day-now-indicator")
                    .accessibilityLabel(
                        String(
                            format: AppLocalization.string( "Current time, %@"),
                            now.formatted(date: .omitted, time: .shortened)
                        )
                    )
                }
            }
        }
    }

    private func eventCard(_ placement: CalendarDayPlacement, availableWidth: CGFloat) -> some View {
        let spacing: CGFloat = 3
        let laneWidth = max(
            1,
            (availableWidth - CGFloat(placement.laneCount - 1) * spacing) / CGFloat(placement.laneCount)
        )
        let x = timeGutter + CGFloat(placement.lane) * (laneWidth + spacing)
        let height = max(30, CGFloat(placement.endMinute - placement.startMinute) * minuteHeight - 2)
        let color = CalendarChrome.eventColor(for: placement.item)
        let subtitle = eventSubtitle(
            for: placement.item,
            height: height,
            availableWidth: laneWidth
        )
        let visualTop = CGFloat(placement.startMinute) * minuteHeight + 1
        let hitTarget = CalendarChrome.eventHitTargetLayout(
            visualTop: visualTop,
            visualHeight: height,
            gridHeight: CGFloat(24 * 60) * minuteHeight
        )

        return CalendarEventBlockLabel(
            title: placement.item.title,
            subtitle: subtitle,
            color: color,
            height: height,
            emphasized: false,
            context: placement.item.context,
            contextSymbol: CalendarChrome.eventContextSymbol(for: placement.item)
        )
        .frame(width: laneWidth, height: height)
        .padding(.top, hitTarget.topInset)
        .padding(.bottom, hitTarget.bottomInset)
        .contentShape(Rectangle())
        .calendarTapOrLongPress(
            onTap: {
                onOpen(placement.item)
            },
            onLongPress: {
                guard placement.item.source == .event else { return }
                menuEvent = placement.item
            }
        )
        .calendarItemActions(
            target: placement.item,
            selectedItem: $menuEvent,
            onCopy: onCopy,
            onDuplicate: onDuplicate,
            onDelete: onDelete
        )
        .offset(x: x, y: hitTarget.top)
        .accessibilityElement(children: .ignore)
        .accessibilityIdentifier("calendar-timeline-event-\(placement.item.id)")
        .accessibilityLabel(placement.item.title)
        .accessibilityValue(timeRange(for: placement.item))
        .accessibilityAddTraits(.isButton)
    }

    @ViewBuilder
    private func offscreenEventIndicators(
        width: CGFloat,
        reader: ScrollViewProxy
    ) -> some View {
        if menuEvent == nil,
           menuSlot == nil,
           verticalViewportHeight >= 80,
           let viewportStartMinute = verticalViewportStartMinute
        {
            let viewportEndMinute = min(
                24 * 60,
                viewportStartMinute + Int(ceil(verticalViewportHeight / minuteHeight))
            )
            let topHint = CalendarOffscreenEventHints.nearest(
                items: timedItems,
                on: date,
                viewportStartMinute: viewportStartMinute,
                viewportEndMinute: viewportEndMinute,
                edge: .top,
                calendar: calendar
            )
            let bottomHint = CalendarOffscreenEventHints.nearest(
                items: timedItems,
                on: date,
                viewportStartMinute: viewportStartMinute,
                viewportEndMinute: viewportEndMinute,
                edge: .bottom,
                calendar: calendar
            )
            let canvasWidth = max(1, width - timeGutter)
            let indicatorWidth = min(44, canvasWidth)
            let indicatorX = timeGutter + canvasWidth / 2

            ZStack(alignment: .topLeading) {
                Color.clear
                    .allowsHitTesting(false)
                    .accessibilityHidden(true)

                if let topHint {
                    CalendarOffscreenEventBar(
                        edge: .top,
                        color: CalendarChrome.eventColor(for: topHint.item),
                        availableWidth: indicatorWidth,
                        accessibilityIdentifier: "calendar-day-offscreen-event-top",
                        action: { scrollToOffscreenEvent(topHint, reader: reader) }
                    )
                    .position(x: indicatorX, y: 22)
                    .transition(.opacity)
                }

                if let bottomHint {
                    CalendarOffscreenEventBar(
                        edge: .bottom,
                        color: CalendarChrome.eventColor(for: bottomHint.item),
                        availableWidth: indicatorWidth,
                        accessibilityIdentifier: "calendar-day-offscreen-event-bottom",
                        action: { scrollToOffscreenEvent(bottomHint, reader: reader) }
                    )
                    .position(x: indicatorX, y: verticalViewportHeight - 22)
                    .transition(.opacity)
                }
            }
            .animation(
                accessibilityReduceMotion ? nil : .easeOut(duration: 0.14),
                value: topHint?.item.id
            )
            .animation(
                accessibilityReduceMotion ? nil : .easeOut(duration: 0.14),
                value: bottomHint?.item.id
            )
        }
    }

    private func scrollToOffscreenEvent(
        _ hint: CalendarOffscreenEventHint,
        reader: ScrollViewProxy
    ) {
        let minute = CalendarOffscreenEventHints.scrollTargetMinute(for: hint)
        let target = timelineScrollID(nearest: minute)
        UISelectionFeedbackGenerator().selectionChanged()
        withAnimation(accessibilityReduceMotion ? nil : .easeInOut(duration: 0.26)) {
            verticalScrollPositionID = target
            verticalViewportStartMinute = minute
            reader.scrollTo(target, anchor: .top)
        }
    }

    private func updateViewportStartMinute(forContentMinY contentMinY: CGFloat) {
        let rawMinute = max(0, -contentMinY / minuteHeight)
        let step = CGFloat(Self.verticalScrollPositionStepMinutes)
        let maximumMinute = CGFloat(24 * 60 - Self.verticalScrollPositionStepMinutes)
        let snappedMinute = Int(min(max(floor(rawMinute / step) * step, 0), maximumMinute))
        guard snappedMinute != verticalViewportStartMinute else { return }
        verticalViewportStartMinute = snappedMinute
    }

    private func timelineMinute(from identifier: String) -> Int? {
        guard identifier.hasPrefix("timeline-slot-") else { return nil }
        return Int(identifier.dropFirst("timeline-slot-".count))
    }

    private func timelineScrollID(nearest minute: Int) -> String {
        let step = Self.verticalScrollPositionStepMinutes
        let maximumMinute = 24 * 60 - step
        let snapped = min(max((minute / step) * step, 0), maximumMinute)
        return "timeline-slot-\(snapped)"
    }

    private func slotDate(minute: Int) -> Date? {
        calendar.date(
            byAdding: .minute,
            value: minute,
            to: calendar.startOfDay(for: date)
        )
    }

    private var scrollTargetID: String {
        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("--ui-testing-offscreen-event-cues") {
            return "timeline-slot-720"
        }
        #endif

        let firstMinute = CalendarTimelineScrollAnchor.firstEventMinute(
            items: timedItems,
            on: date,
            calendar: calendar
        )
        let target = CalendarTimelineScrollAnchor.targetMinute(
            on: date,
            firstEventMinute: firstMinute,
            calendar: calendar
        )
        return "timeline-slot-\(target)"
    }

    private func slotAccessibilityLabel(minute: Int) -> String {
        guard let slot = calendar.date(byAdding: .minute, value: minute, to: calendar.startOfDay(for: date)) else {
            return "Calendar time"
        }
        return slot.formatted(date: .omitted, time: .shortened)
    }

    private func newEventLabel(for slot: Date) -> String {
        String(
            format: AppLocalization.string( "New event at %@"),
            slot.formatted(date: .omitted, time: .shortened)
        )
    }

    private func timeRange(for item: HomeAgendaItem) -> String {
        "\(item.start.formatted(date: .omitted, time: .shortened)) - \(item.end.formatted(date: .omitted, time: .shortened))"
    }

    private func eventSubtitle(
        for item: HomeAgendaItem,
        height: CGFloat,
        availableWidth: CGFloat
    ) -> String? {
        guard let time = CalendarChrome.eventCardTimeLabel(
            from: item.start,
            to: item.end,
            height: height,
            availableWidth: availableWidth,
            calendar: calendar
        ) else { return nil }
        guard height >= 46, availableWidth >= 150 else { return time }

        switch item.context {
        case .publicPlan where !item.participantNames.isEmpty:
            let people = String(
                format: AppLocalization.string( "%lld people"),
                Int64(item.participantNames.count)
            )
            return "\(time) · \(people)"
        case .shared:
            let companion = item.withLabel ?? item.participantNames.first
            guard let companion, !companion.isEmpty else { return time }
            return "\(time) · \(companion)"
        default:
            return time
        }
    }

}

struct CalendarDayPlacement: Identifiable, Equatable, Sendable {
    let item: HomeAgendaItem
    let startMinute: Int
    let endMinute: Int
    let lane: Int
    let laneCount: Int

    var id: String { item.id }
}

enum CalendarDayLayout {
    static func placements(
        items: [HomeAgendaItem],
        on date: Date,
        calendar: Calendar = .sideSeatBerlin
    ) -> [CalendarDayPlacement] {
        let dayStart = calendar.startOfDay(for: date)
        guard let dayEnd = calendar.date(byAdding: .day, value: 1, to: dayStart) else { return [] }

        let timed = items.compactMap { item -> (HomeAgendaItem, Int, Int)? in
            guard item.start < dayEnd, item.end > dayStart else { return nil }
            let clippedStart = max(item.start, dayStart)
            let clippedEnd = min(item.end, dayEnd)
            let startMinute = max(0, calendar.dateComponents([.minute], from: dayStart, to: clippedStart).minute ?? 0)
            let endMinute = min(24 * 60, calendar.dateComponents([.minute], from: dayStart, to: clippedEnd).minute ?? 0)
            guard endMinute > startMinute else { return nil }
            return (item, startMinute, endMinute)
        }
        .sorted {
            if $0.1 == $1.1 { return $0.2 > $1.2 }
            return $0.1 < $1.1
        }

        var result: [CalendarDayPlacement] = []
        var cluster: [(HomeAgendaItem, Int, Int)] = []
        var clusterEnd = -1

        func appendCluster(_ values: [(HomeAgendaItem, Int, Int)], to result: inout [CalendarDayPlacement]) {
            guard !values.isEmpty else { return }
            var laneEnds: [Int] = []
            var assigned: [(HomeAgendaItem, Int, Int, Int)] = []

            for value in values {
                let lane = laneEnds.firstIndex(where: { $0 <= value.1 }) ?? laneEnds.count
                if lane == laneEnds.count {
                    laneEnds.append(value.2)
                } else {
                    laneEnds[lane] = value.2
                }
                assigned.append((value.0, value.1, value.2, lane))
            }

            let laneCount = max(1, laneEnds.count)
            result.append(contentsOf: assigned.map {
                CalendarDayPlacement(
                    item: $0.0,
                    startMinute: $0.1,
                    endMinute: $0.2,
                    lane: $0.3,
                    laneCount: laneCount
                )
            })
        }

        for value in timed {
            if !cluster.isEmpty, value.1 >= clusterEnd {
                appendCluster(cluster, to: &result)
                cluster.removeAll(keepingCapacity: true)
                clusterEnd = -1
            }
            cluster.append(value)
            clusterEnd = max(clusterEnd, value.2)
        }
        appendCluster(cluster, to: &result)
        return result
    }
}
