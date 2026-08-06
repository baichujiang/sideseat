import SwiftUI

struct ScheduleShareCardView: View {
    @Environment(SessionStore.self) private var session

    let shareURL: String
    let onOpenToken: (String) -> Void

    @State private var preview: NativeScheduleShareChatPreview?
    @State private var issue: String?
    @State private var isLoading = false
    @State private var isRevoking = false
    @State private var isRevoked = false
    @State private var isConfirmingRevoke = false

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Button {
                if let token = ScheduleShareURLParser.token(from: shareURL), !isRevoked {
                    onOpenToken(token)
                }
            } label: {
                cardContent
            }
            .buttonStyle(.plain)
            .disabled(isRevoked)
            .accessibilityIdentifier("schedule-share-card")

            if preview?.ownedByViewer == true, !isRevoked {
                Button(role: .destructive) {
                    isConfirmingRevoke = true
                } label: {
                    if isRevoking {
                        ProgressView()
                            .controlSize(.small)
                    } else {
                        Label("Stop sharing", systemImage: "link.badge.minus")
                            .font(.caption.weight(.semibold))
                    }
                }
                .disabled(isRevoking)
                .accessibilityIdentifier("schedule-share-revoke")
            }
            if let issue, preview != nil {
                Text(issue)
                    .font(.caption)
                    .foregroundStyle(SideSeatTheme.danger)
            }
        }
        .task(id: shareURL) { await loadPreview() }
        .confirmationDialog(
            "Stop sharing this schedule?",
            isPresented: $isConfirmingRevoke,
            titleVisibility: .visible
        ) {
            Button("Stop sharing", role: .destructive) {
                Task { await revoke() }
            }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("The recipient will no longer be able to view the link or propose a time.")
        }
    }

    private var cardContent: some View {
        VStack(alignment: .leading, spacing: 8) {
                Text(
                    isRevoked
                        ? String(localized: "Sharing stopped")
                        : preview?.expired == true
                        ? String(localized: "Schedule expired")
                        : String(localized: "Shared schedule")
                )
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.secondary)
                if let preview {
                    HStack(alignment: .firstTextBaseline) {
                        Text(preview.ownerDisplayLabel)
                            .font(.body.weight(.semibold))
                            .foregroundStyle(.primary)
                        Spacer(minLength: 8)
                        if let start = Date.sideSeatChatISO8601(preview.snapshot.rangeStart),
                           let end = Date.sideSeatChatISO8601(preview.snapshot.rangeEnd) {
                            Text("\(start.formatted(.dateTime.month(.abbreviated).day()))–\(end.formatted(.dateTime.month(.abbreviated).day()))")
                                .font(.caption2.weight(.medium))
                                .foregroundStyle(.secondary)
                        }
                    }
                    ScheduleShareTimelineView(
                        snapshot: preview.snapshot,
                        dayLimit: 7,
                        compact: true
                    )
                    HStack(spacing: 5) {
                        Image(systemName: "clock.badge.checkmark")
                        Text(String(localized: "\(preview.snapshot.freeSlots.count) free slots"))
                        Spacer(minLength: 4)
                        Image(systemName: "chevron.right")
                    }
                    .font(.caption)
                    .foregroundStyle(.secondary)
                } else if isLoading {
                    ProgressView()
                        .controlSize(.small)
                } else if let issue {
                    Text(issue)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                } else {
                    Text("Tap to open schedule")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
        }
        .padding(12)
        .frame(width: 276, alignment: .leading)
        .background(SideSeatTheme.Chat.peerBubble, in: RoundedRectangle(cornerRadius: SideSeatTheme.Chat.bubbleRadius, style: .continuous))
    }

    private func loadPreview() async {
        guard let token = ScheduleShareURLParser.token(from: shareURL) else {
            issue = String(localized: "Schedule link unavailable")
            return
        }

        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("--ui-testing-authenticated") {
            preview = NativeScheduleShareChatPreview(
                snapshot: NativeScheduleShareSnapshot(
                    ownerDisplayLabel: "Mina",
                    rangeStart: "2026-07-18T00:00:00.000Z",
                    rangeEnd: "2026-07-20T23:59:59.000Z",
                    includedDates: ["2026-07-18", "2026-07-19", "2026-07-20"],
                    expiresAt: nil,
                    allowGuestProposals: true,
                    freeSlots: [
                        NativeScheduleShareSlot(start: "2026-07-18T10:00:00.000Z", end: "2026-07-18T12:00:00.000Z")
                    ],
                    blocks: nil
                ),
                expired: false,
                ownerDisplayLabel: "Mina",
                linkId: "cuitestlink000000000000001",
                ownedByViewer: true
            )
            return
        }
        #endif

        isLoading = true
        issue = nil
        defer { isLoading = false }
        do {
            let path = "api/v1/schedule-shares/chat-preview/\(token.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? token)"
            let response: APIEnvelope<NativeScheduleShareChatPreview> = try await session.sendAuthorized(path)
            preview = response.data
        } catch {
            issue = String(localized: "Preview unavailable")
        }
    }

    private func revoke() async {
        guard let linkId = preview?.linkId, !isRevoking else { return }
        isRevoking = true
        issue = nil
        defer { isRevoking = false }

        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("--ui-testing-authenticated") {
            isRevoked = true
            return
        }
        #endif

        do {
            let encoded = linkId.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? linkId
            let _: APIEnvelope<NativeScheduleShareRevokeResult> = try await session.sendAuthorized(
                "api/v1/schedule-shares/owner/\(encoded)",
                method: .delete
            )
            isRevoked = true
        } catch {
            issue = error.localizedDescription
        }
    }
}

struct ScheduleShareTimelineView: View {
    let snapshot: NativeScheduleShareSnapshot
    var dayLimit = 7
    var compact = false
    var fullDay = false
    var displayDays: [Date]? = nil
    var highlightedDateKeys: Set<String>? = nil
    var compactDayWidth: CGFloat? = nil
    var showsDayHeaders = true
    var selectedSlotID: String? = nil
    var selectedRange: DateInterval? = nil
    var onSelectSlot: ((NativeScheduleShareSlot) -> Void)? = nil

    private let calendar = Calendar.sideSeatBerlin
    private var firstMinute: Int {
        fullDay ? 0 : ScheduleShareProposalTime.defaultDisplayStartHour * 60
    }
    private var lastMinute: Int {
        fullDay ? 24 * 60 : ScheduleShareProposalTime.defaultDisplayEndHour * 60
    }
    private var hourMarks: [Int] {
        fullDay ? [0, 4, 8, 12, 16, 20] : [8, 12, 16, 20]
    }
    private var timeGutter: CGFloat { compact ? 24 : 28 }

    var body: some View {
        if days.isEmpty {
            ContentUnavailableView("No schedule", systemImage: "calendar")
                .frame(height: compact ? 130 : 260)
        } else {
            ScrollView(.horizontal, showsIndicators: !compact) {
                VStack(spacing: 5) {
                    if showsDayHeaders {
                        HStack(spacing: 0) {
                            Color.clear.frame(width: timeGutter, height: 28)
                            ForEach(days, id: \.self) { day in
                                dayHeader(day)
                            }
                        }
                    }

                    HStack(alignment: .top, spacing: 0) {
                        timeAxis
                        ForEach(days, id: \.self) { day in
                            dayColumn(day)
                        }
                    }
                    .frame(height: timelineHeight)
                    .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
                }
                .frame(minWidth: timeGutter + dayWidth * CGFloat(days.count), alignment: .leading)
            }
            .scrollDisabled(compact)
            .accessibilityElement(children: .contain)
            .accessibilityIdentifier("schedule-share-timeline")
        }
    }

    private var timeAxis: some View {
        ZStack(alignment: .topTrailing) {
            SideSeatTheme.fillTertiary.opacity(0.45)
            ForEach(hourMarks, id: \.self) { hour in
                Text(String(format: "%02d", hour))
                    .font(.system(size: compact ? 7 : 9, weight: .medium, design: .rounded))
                    .foregroundStyle(.secondary)
                    .monospacedDigit()
                    .padding(.trailing, 4)
                    .offset(y: yPosition(for: hour * 60) - 4)
            }
        }
        .frame(width: timeGutter, height: timelineHeight)
    }

    private func dayColumn(_ day: Date) -> some View {
        let isIncluded = isDayIncluded(day)
        return ZStack(alignment: .top) {
            if isIncluded {
                SideSeatTheme.accent.opacity(0.035)
            } else {
                SideSeatTheme.fillTertiary.opacity(0.52)
            }

            if isIncluded {
                ForEach(hourMarks, id: \.self) { hour in
                    Rectangle()
                        .fill(SideSeatTheme.fillTertiary)
                        .frame(height: 0.5)
                        .offset(y: yPosition(for: hour * 60))
                }

                ForEach(freeSlots(on: day)) { slot in
                    if let geometry = geometry(start: slot.start, end: slot.end, on: day) {
                        if let onSelectSlot {
                            Button {
                                onSelectSlot(slot)
                            } label: {
                                freeSlotBlock(selected: selectedSlotID == slot.id)
                            }
                            .buttonStyle(.plain)
                            .frame(width: max(dayWidth - 4, 8), height: geometry.height)
                            .offset(y: geometry.y)
                            .accessibilityIdentifier("schedule-share-timeline-slot-\(slot.id)")
                        } else if !compact {
                            freeSlotBlock(selected: false)
                                .frame(width: max(dayWidth - 4, 8), height: geometry.height)
                                .offset(y: geometry.y)
                        }
                    }
                }

                ForEach(blocks(on: day)) { block in
                    if let geometry = geometry(start: block.start, end: block.end, on: day) {
                        busyBlock(block, height: geometry.height)
                            .frame(width: max(dayWidth - 4, 8), height: geometry.height)
                            .offset(y: geometry.y)
                    }
                }

                if let selectedRange,
                   let geometry = geometry(start: selectedRange.start, end: selectedRange.end, on: day) {
                    selectedRangeBlock
                        .frame(width: max(dayWidth - 8, 8), height: geometry.height)
                        .offset(y: geometry.y)
                        .allowsHitTesting(false)
                        .accessibilityHidden(true)
                }
            } else {
                notSharedDayOverlay
            }
        }
        .frame(width: dayWidth, height: timelineHeight)
        .overlay(alignment: .leading) {
            Rectangle().fill(SideSeatTheme.fillTertiary).frame(width: 0.5)
        }
        .accessibilityLabel(day.formatted(date: .complete, time: .omitted))
        .accessibilityValue(isIncluded ? String(localized: "Shared") : String(localized: "Not shared"))
        .accessibilityIdentifier(
            "schedule-share-timeline-day-\(ScheduleShareDateSelection.dateKey(for: day, calendar: calendar))"
        )
    }

    private func dayHeader(_ day: Date) -> some View {
        let highlighted = isDayIncluded(day)
        return VStack(spacing: 1) {
            Text(day, format: .dateTime.weekday(.narrow))
                .font(.caption2.weight(.semibold))
            Text(day, format: .dateTime.day())
                .font(.caption2.monospacedDigit())
        }
        .foregroundStyle(highlighted ? SideSeatTheme.accent : SideSeatTheme.textSecondary)
        .frame(width: dayWidth, height: 28)
        .background(
            highlighted ? SideSeatTheme.accent.opacity(0.08) : Color.clear,
            in: RoundedRectangle(cornerRadius: 4, style: .continuous)
        )
        .opacity(highlighted ? 1 : 0.62)
    }

    private var notSharedDayOverlay: some View {
        VStack(spacing: 5) {
            Image(systemName: "eye.slash")
                .font(.system(size: compact ? 9 : 12, weight: .semibold))
            if !compact || dayWidth >= 54 {
                Text("Not shared")
                    .font(.system(size: 9, weight: .semibold))
                    .multilineTextAlignment(.center)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .foregroundStyle(SideSeatTheme.textSecondary)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Not shared")
        .accessibilityIdentifier("schedule-share-not-shared-day")
    }

    private func freeSlotBlock(selected: Bool) -> some View {
        RoundedRectangle(cornerRadius: compact ? 2 : 4, style: .continuous)
            .fill(SideSeatTheme.success.opacity(selected ? 0.32 : 0.13))
            .overlay(
                RoundedRectangle(cornerRadius: compact ? 2 : 4, style: .continuous)
                    .strokeBorder(SideSeatTheme.success.opacity(selected ? 0.9 : 0.35), lineWidth: selected ? 1.5 : 0.7)
            )
    }

    private var selectedRangeBlock: some View {
        RoundedRectangle(cornerRadius: 4, style: .continuous)
            .fill(SideSeatTheme.accent.opacity(0.78))
            .overlay(alignment: .topTrailing) {
                Image(systemName: "checkmark")
                    .font(.system(size: 8, weight: .bold))
                    .foregroundStyle(Color.white)
                    .padding(3)
            }
            .overlay(
                RoundedRectangle(cornerRadius: 4, style: .continuous)
                    .strokeBorder(Color.white.opacity(0.85), lineWidth: 1)
            )
    }

    private func busyBlock(_ block: NativeScheduleShareBlock, height: CGFloat) -> some View {
        let revealsDetails = block.kind == "busy_detail"
        return ZStack(alignment: .topLeading) {
            RoundedRectangle(cornerRadius: compact ? 2 : 4, style: .continuous)
                .fill(blockColor(block).opacity(revealsDetails ? 0.86 : 0.52))
            if (!compact || days.count <= 3), height >= 13 {
                Text(revealsDetails ? (block.title ?? String(localized: "Busy")) : String(localized: "Busy"))
                    .font(.system(size: compact ? 7 : 9, weight: .semibold))
                    .foregroundStyle(Color.white)
                    .lineLimit(compact ? 1 : 2)
                    .padding(.horizontal, compact ? 2 : 4)
                    .padding(.vertical, 2)
            }
        }
        .accessibilityLabel(revealsDetails ? (block.title ?? String(localized: "Busy")) : String(localized: "Busy"))
    }

    private var days: [Date] {
        if let displayDays, !displayDays.isEmpty {
            return Array(displayDays.sorted().prefix(max(dayLimit, 1)))
        }
        if let start = Date.sideSeatChatISO8601(snapshot.rangeStart),
           let end = Date.sideSeatChatISO8601(snapshot.rangeEnd) {
            let continuousRange = ScheduleShareDateSelection.dates(
                from: start,
                through: end,
                limit: max(dayLimit, 1),
                calendar: calendar
            )
            if !continuousRange.isEmpty { return continuousRange }
        }
        return Array(
            snapshot.includedDates
                .compactMap { ScheduleShareDateSelection.date(from: $0, calendar: calendar) }
                .sorted()
                .prefix(max(dayLimit, 1))
        )
    }

    private var dayWidth: CGFloat {
        if compact, let compactDayWidth {
            return max(24, compactDayWidth)
        }
        if compact { return days.count <= 3 ? 76 : 32 }
        return 76
    }

    private func isDayIncluded(_ day: Date) -> Bool {
        let dayKey = ScheduleShareDateSelection.dateKey(for: day, calendar: calendar)
        if let highlightedDateKeys {
            return highlightedDateKeys.contains(dayKey)
        }
        guard !snapshot.includedDates.isEmpty else { return true }
        return snapshot.includedDates.contains(dayKey)
    }

    private var timelineHeight: CGFloat {
        if compact { return 132 }
        return fullDay ? 480 : 340
    }

    private func blocks(on day: Date) -> [NativeScheduleShareBlock] {
        (snapshot.blocks ?? []).filter { block in
            guard let start = Date.sideSeatChatISO8601(block.start),
                  let end = Date.sideSeatChatISO8601(block.end),
                  let dayInterval = calendar.dateInterval(of: .day, for: day)
            else { return false }
            return start < dayInterval.end && end > dayInterval.start
        }
    }

    private func freeSlots(on day: Date) -> [NativeScheduleShareSlot] {
        snapshot.freeSlots.filter { slot in
            guard let start = Date.sideSeatChatISO8601(slot.start),
                  let end = Date.sideSeatChatISO8601(slot.end),
                  let dayInterval = calendar.dateInterval(of: .day, for: day)
            else { return false }
            return start < dayInterval.end && end > dayInterval.start
        }
    }

    private func geometry(start: String, end: String, on day: Date) -> (y: CGFloat, height: CGFloat)? {
        guard let startDate = Date.sideSeatChatISO8601(start),
              let endDate = Date.sideSeatChatISO8601(end) else { return nil }
        return geometry(start: startDate, end: endDate, on: day)
    }

    private func geometry(
        start startDate: Date,
        end endDate: Date,
        on day: Date
    ) -> (y: CGFloat, height: CGFloat)? {
        guard let dayInterval = calendar.dateInterval(of: .day, for: day) else { return nil }
        let clippedStartDate = max(startDate, dayInterval.start)
        let clippedEndDate = min(endDate, dayInterval.end)
        guard clippedEndDate > clippedStartDate else { return nil }

        let startComponents = calendar.dateComponents([.hour, .minute], from: clippedStartDate)
        let endComponents = calendar.dateComponents([.hour, .minute], from: clippedEndDate)
        let rawStart = clippedStartDate == dayInterval.start
            ? 0
            : (startComponents.hour ?? 0) * 60 + (startComponents.minute ?? 0)
        let rawEnd = clippedEndDate == dayInterval.end
            ? 24 * 60
            : (endComponents.hour ?? 0) * 60 + (endComponents.minute ?? 0)
        let clippedStart = min(max(rawStart, firstMinute), lastMinute)
        let clippedEnd = min(max(rawEnd, firstMinute), lastMinute)
        guard clippedEnd > clippedStart else { return nil }
        return (
            yPosition(for: clippedStart),
            max(compact ? 5 : 8, yPosition(for: clippedEnd) - yPosition(for: clippedStart))
        )
    }

    private func yPosition(for minute: Int) -> CGFloat {
        let ratio = CGFloat(minute - firstMinute) / CGFloat(lastMinute - firstMinute)
        return min(max(ratio, 0), 1) * timelineHeight
    }

    private func blockColor(_ block: NativeScheduleShareBlock) -> Color {
        if block.kind != "busy_detail" { return SideSeatTheme.textSecondary }
        if let color = block.categoryColor.flatMap(Color.init(hex:)) { return color }
        return SideSeatTheme.accent
    }
}
