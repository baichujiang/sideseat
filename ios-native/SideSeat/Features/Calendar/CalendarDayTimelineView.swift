import SwiftUI

struct CalendarDayTimelineView: View {
    let date: Date
    let items: [HomeAgendaItem]
    let onOpen: (HomeAgendaItem) -> Void
    let onEdit: (HomeAgendaItem) -> Void
    let onCopy: (HomeAgendaItem) -> Void
    let onDuplicate: (HomeAgendaItem) -> Void
    let movingEventID: String?
    let onStartMove: (HomeAgendaItem) -> Void
    let onChooseMoveTarget: (Date) -> Void
    let canPaste: Bool
    let onCreateAtSlot: (Date) -> Void
    let onPasteAtSlot: (Date) -> Void
    /// Bumped by Home "Today" to re-anchor near now without chasing the clock.
    var scrollAnchorToken: Int = 0

    @State private var menuEvent: HomeAgendaItem?
    @State private var menuSlot: Date?

    private let calendar = Calendar.sideSeatBerlin
    private let minuteHeight = CalendarChrome.dayMinuteHeight
    private let timeGutter = CalendarChrome.dayTimeGutter

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
                        onLongPress: { item in
                            guard movingEventID == nil else { return }
                            menuEvent = item
                        }
                    )
                }
                .padding(.bottom, 4)
                Divider().opacity(0.35)
            }

            GeometryReader { geometry in
                let gridHeight = minuteHeight * 24 * 60
                let contentHeight = gridHeight + CalendarChrome.timelineEndCapHeight

                ScrollViewReader { reader in
                    ScrollView(.vertical) {
                        ZStack(alignment: .topLeading) {
                            // Laid-out anchors so ScrollViewReader can find real Y positions.
                            VStack(spacing: 0) {
                                ForEach(0..<48, id: \.self) { index in
                                    let minute = index * 30
                                    Color.clear
                                        .frame(width: 1, height: CGFloat(30) * minuteHeight)
                                        .id("timeline-slot-\(minute)")
                                }
                            }
                            .accessibilityHidden(true)

                            timeline(width: geometry.size.width)
                        }
                        .frame(
                            width: geometry.size.width,
                            height: contentHeight,
                            alignment: .topLeading
                        )
                    }
                    .scrollIndicators(.hidden)
                    .accessibilityIdentifier("calendar-day-timeline")
                    // Changing the visible day must keep the same vertical time position.
                    // Only an explicit re-anchor request (for example, Today) scrolls again.
                    .task(id: scrollAnchorToken) {
                        await Task.yield()
                        try? await Task.sleep(nanoseconds: 50_000_000)
                        reader.scrollTo(scrollTargetID, anchor: .top)
                    }
                }
            }
        }
        .frame(minHeight: 420, maxHeight: .infinity)
        .background(SideSeatTheme.bg)
        .calendarItemActions(
            item: $menuEvent,
            onOpen: onOpen,
            onEdit: onEdit,
            onCopy: onCopy,
            onDuplicate: onDuplicate,
            onStartMove: onStartMove,
            moveAccessibilityIdentifier: "calendar-event-context-move"
        )
        .confirmationDialog(
            menuSlot.map(newEventLabel(for:)) ?? "",
            isPresented: Binding(
                get: { menuSlot != nil },
                set: { if !$0 { menuSlot = nil } }
            ),
            titleVisibility: .visible,
            presenting: menuSlot
        ) { slot in
            Button("New event") { onCreateAtSlot(slot) }
                .accessibilityIdentifier("calendar-slot-context-new-event")
            if canPaste {
                Button("Paste copied event") { onPasteAtSlot(slot) }
                    .accessibilityIdentifier("calendar-slot-context-paste-event")
            }
            Button("Cancel", role: .cancel) {}
        }
    }

    private func timeline(width: CGFloat) -> some View {
        let placements = CalendarDayLayout.placements(items: timedItems, on: date, calendar: calendar)
        let isToday = calendar.isDateInToday(date)

        return ZStack(alignment: .topLeading) {
            if isToday {
                CalendarChrome.todayWash
                    .frame(width: max(0, width - timeGutter))
                    .offset(x: timeGutter)
            }

            ForEach(0...48, id: \.self) { index in
                let minute = index * 30
                Rectangle()
                    .fill(index.isMultiple(of: 2) ? CalendarChrome.hourLine : CalendarChrome.halfHourLine)
                    .frame(height: index.isMultiple(of: 2) ? 0.66 : 0.33)
                    .offset(x: timeGutter, y: CGFloat(minute) * minuteHeight)
            }

            ForEach(1..<24, id: \.self) { hour in
                Text(CalendarChrome.compactHour(hour))
                    .font(CalendarChrome.Typography.hourRail)
                    .foregroundStyle(SideSeatTheme.textSecondary)
                    .lineLimit(1)
                    .frame(width: timeGutter - 8, alignment: .trailing)
                    .offset(y: CGFloat(hour * 60) * minuteHeight - 7)
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
                            guard movingEventID == nil, let slot = slotDate(minute: minute) else { return }
                            onCreateAtSlot(slot)
                        },
                        onLongPress: {
                            guard movingEventID == nil, let slot = slotDate(minute: minute) else { return }
                            menuSlot = slot
                        }
                    )
                    .allowsHitTesting(movingEventID == nil)
                    .accessibilityElement()
                    .accessibilityLabel(slotAccessibilityLabel(minute: minute))
                    .accessibilityHint("Creates an event. Long press for more actions.")
                    .accessibilityIdentifier("calendar-slot-\(minute)")
            }

            ForEach(placements) { placement in
                eventCard(placement, availableWidth: max(0, width - timeGutter - 8))
            }

            if movingEventID != nil {
                ForEach(0..<48, id: \.self) { index in
                    moveTarget(index: index, width: width)
                }
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
                            .fill(CalendarChrome.nowRed)
                            .frame(height: CalendarChrome.nowLineThickness)
                            .frame(height: CalendarChrome.nowLineHitSlop, alignment: .center)
                    }
                    .frame(width: width, alignment: .leading)
                    .offset(y: CGFloat(minute) * minuteHeight - 8)
                    .allowsHitTesting(false)
                    .accessibilityIdentifier("day-now-indicator")
                    .accessibilityLabel(
                        String(
                            format: String(localized: "Current time, %@"),
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

        return CalendarEventBlockLabel(
            title: placement.item.title,
            subtitle: subtitle,
            color: color,
            height: height,
            emphasized: placement.item.id == movingEventID,
            context: placement.item.context,
            contextSymbol: CalendarChrome.eventContextSymbol(for: placement.item)
        )
        .frame(width: laneWidth, height: height)
        .contentShape(Rectangle())
        .calendarTapOrLongPress(
            onTap: {
                guard movingEventID == nil else { return }
                onOpen(placement.item)
            },
            onLongPress: {
                guard movingEventID == nil else { return }
                menuEvent = placement.item
            }
        )
        .offset(x: x, y: CGFloat(placement.startMinute) * minuteHeight + 1)
        .allowsHitTesting(movingEventID == nil)
        .accessibilityElement(children: .ignore)
        .accessibilityIdentifier("calendar-timeline-event-\(placement.item.id)")
        .accessibilityLabel(placement.item.title)
        .accessibilityValue(timeRange(for: placement.item))
        .accessibilityAddTraits(.isButton)
    }

    private func moveTarget(index: Int, width: CGFloat) -> some View {
        let minute = index * 30
        let targetWidth = max(0, width - timeGutter)

        return Button {
            guard let slot = calendar.date(
                byAdding: .minute,
                value: minute,
                to: calendar.startOfDay(for: date)
            ) else { return }
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
        .frame(width: targetWidth, height: CGFloat(30) * minuteHeight)
        .offset(x: timeGutter, y: CGFloat(minute) * minuteHeight)
        .accessibilityLabel(moveTargetAccessibilityLabel(minute: minute))
        .accessibilityHint("Moves the selected event to this time")
        .accessibilityIdentifier("calendar-move-target-\(minute)")
    }

    private func slotDate(minute: Int) -> Date? {
        calendar.date(
            byAdding: .minute,
            value: minute,
            to: calendar.startOfDay(for: date)
        )
    }

    private var scrollTargetID: String {
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
            format: String(localized: "New event at %@"),
            slot.formatted(date: .omitted, time: .shortened)
        )
    }

    private func moveTargetAccessibilityLabel(minute: Int) -> String {
        guard let slot = calendar.date(
            byAdding: .minute,
            value: minute,
            to: calendar.startOfDay(for: date)
        ) else { return String(localized: "Move event") }
        return String(
            format: String(localized: "Move event to %@"),
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
                format: String(localized: "%lld people"),
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
