import SwiftUI

@MainActor
@Observable
final class ScheduleShareRecipientStore {
    private(set) var snapshot: NativeScheduleShareSnapshot?
    private(set) var proposal: NativeScheduleShareViewerProposal?
    private(set) var allowGuestProposals = false
    private(set) var isLoading = false
    private(set) var isSubmitting = false
    private(set) var issue: String?

    func load(token: String, using session: SessionStore) async {
        isLoading = true
        issue = nil
        defer { isLoading = false }

        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("--ui-testing-authenticated") {
            snapshot = NativeScheduleShareSnapshot(
                ownerDisplayLabel: "Mina",
                rangeStart: "2026-07-18T00:00:00.000+02:00",
                rangeEnd: "2026-07-24T23:59:59.000+02:00",
                includedDates: [
                    "2026-07-18", "2026-07-19", "2026-07-20",
                    "2026-07-22", "2026-07-23", "2026-07-24",
                ],
                expiresAt: nil,
                allowGuestProposals: true,
                freeSlots: [
                    NativeScheduleShareSlot(start: "2026-07-18T21:00:00.000Z", end: "2026-07-19T02:00:00.000Z"),
                    NativeScheduleShareSlot(start: "2026-07-19T14:00:00.000Z", end: "2026-07-19T15:00:00.000Z")
                ],
                blocks: [
                    NativeScheduleShareBlock(
                        kind: "busy_anonymous",
                        start: "2026-07-18T12:00:00.000Z",
                        end: "2026-07-18T13:00:00.000Z",
                        title: nil,
                        location: nil,
                        categoryId: nil,
                        categoryPresetKey: nil,
                        categoryName: nil,
                        categoryColor: nil
                    )
                ]
            )
            allowGuestProposals = true
            proposal = nil
            return
        }
        #endif

        do {
            let encoded = token.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? token
            let response: APIEnvelope<NativeScheduleShareRecipientPayload> = try await session.sendAuthorized(
                "api/v1/schedule-shares/recipient/\(encoded)"
            )
            snapshot = response.data.snapshot
            proposal = response.data.proposal
            allowGuestProposals = response.data.allowGuestProposals
        } catch {
            issue = error.localizedDescription
        }
    }

    func submit(
        token: String,
        title: String,
        note: String?,
        location: String?,
        start: Date,
        end: Date,
        using session: SessionStore
    ) async -> Bool {
        guard !isSubmitting else { return false }
        isSubmitting = true
        issue = nil
        defer { isSubmitting = false }

        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]

        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("--ui-testing-authenticated") {
            proposal = NativeScheduleShareViewerProposal(
                id: "ui-proposal-1",
                title: title,
                note: note,
                location: location,
                startTime: formatter.string(from: start),
                endTime: formatter.string(from: end),
                status: "PENDING"
            )
            return true
        }
        #endif

        do {
            let encoded = token.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? token
            let response: APIEnvelope<NativeScheduleShareProposalResult> = try await session.sendAuthorized(
                "api/v1/schedule-shares/recipient/\(encoded)/proposals",
                method: .post,
                body: NativeScheduleShareProposalRequest(
                    title: title,
                    note: note,
                    location: location,
                    startTime: formatter.string(from: start),
                    endTime: formatter.string(from: end)
                ),
                idempotencyKey: UUID().uuidString
            )
            proposal = response.data.proposal
            return true
        } catch {
            issue = error.localizedDescription
            return false
        }
    }
}

struct ScheduleShareRecipientView: View {
    @Environment(SessionStore.self) private var session
    let token: String

    @State private var store = ScheduleShareRecipientStore()
    @State private var timeSelection: NativeScheduleShareProposalSelection?
    @State private var visibleDayCount = 3
    @State private var showsFullDay = false
    @State private var title = String(localized: "Meet up")
    @State private var note = ""
    @State private var location = ""

    var body: some View {
        Group {
            if store.isLoading && store.snapshot == nil {
                SSLoadingState("Loading schedule")
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if let issue = store.issue, store.snapshot == nil {
                ContentUnavailableView("Schedule unavailable", systemImage: "calendar.badge.exclamationmark", description: Text(issue))
            } else if let snapshot = store.snapshot {
                ScrollView {
                    VStack(alignment: .leading, spacing: SideSeatTheme.spaceXL) {
                        scheduleHeader(snapshot)
                        scheduleTimeline(snapshot)

                        if !snapshot.freeSlots.isEmpty {
                            availableTimes(snapshot.freeSlots)
                        }

                    if let proposal = store.proposal {
                            VStack(alignment: .leading, spacing: SideSeatTheme.spaceMD) {
                                Text("Your proposal")
                                    .font(.headline)
                            Text(proposal.title)
                                .font(.body.weight(.semibold))
                            if let start = Date.sideSeatChatISO8601(proposal.startTime),
                               let end = Date.sideSeatChatISO8601(proposal.endTime) {
                                Text("\(start.formatted(date: .abbreviated, time: .shortened)) – \(end.formatted(date: .omitted, time: .shortened))")
                                    .font(.footnote)
                                    .foregroundStyle(.secondary)
                            }
                                Label(proposalStatus(proposal.status), systemImage: "hourglass")
                                    .font(.caption.weight(.semibold))
                                    .foregroundStyle(SideSeatTheme.accent)
                        }
                            .padding(SideSeatTheme.spaceMD)
                            .background(SideSeatTheme.surface, in: RoundedRectangle(cornerRadius: 8, style: .continuous))
                        .accessibilityIdentifier("schedule-share-my-proposal")
                    }

                    if store.allowGuestProposals {
                            proposalComposer
                    }

                    if let issue = store.issue {
                            Label(issue, systemImage: "exclamationmark.circle")
                                .font(.footnote)
                                .foregroundStyle(SideSeatTheme.danger)
                    }
                    }
                    .padding(.horizontal, SideSeatTheme.screenHorizontal)
                    .padding(.vertical, SideSeatTheme.spaceLG)
                }
                .background(SideSeatTheme.bgGrouped)
            }
        }
        .navigationTitle("Shared schedule")
        .navigationBarTitleDisplayMode(.inline)
        .task {
            await store.load(token: token, using: session)
            if let snapshot = store.snapshot, rangeDayCount(snapshot) > 3 {
                visibleDayCount = 7
            }
            restoreExistingProposalSelection()
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("schedule-share-recipient")
    }

    private func scheduleHeader(_ snapshot: NativeScheduleShareSnapshot) -> some View {
        HStack(spacing: SideSeatTheme.spaceMD) {
            Image(systemName: "calendar.badge.clock")
                .font(.title2.weight(.semibold))
                .foregroundStyle(SideSeatTheme.accent)
                .frame(width: 44, height: 44)
                .background(SideSeatTheme.accent.opacity(0.10), in: Circle())
            VStack(alignment: .leading, spacing: 3) {
                Text(snapshot.ownerDisplayLabel)
                    .font(.title3.weight(.semibold))
                if let start = Date.sideSeatChatISO8601(snapshot.rangeStart),
                   let end = Date.sideSeatChatISO8601(snapshot.rangeEnd) {
                    Text("\(start.formatted(date: .abbreviated, time: .omitted)) – \(end.formatted(date: .abbreviated, time: .omitted))")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
            }
            Spacer(minLength: 0)
        }
        .padding(SideSeatTheme.spaceMD)
        .background(SideSeatTheme.surface, in: RoundedRectangle(cornerRadius: 8, style: .continuous))
    }

    private func scheduleTimeline(_ snapshot: NativeScheduleShareSnapshot) -> some View {
        VStack(alignment: .leading, spacing: SideSeatTheme.spaceMD) {
            HStack {
                Text("Schedule")
                    .font(.headline)
                Spacer(minLength: SideSeatTheme.spaceMD)
                if rangeDayCount(snapshot) > 3 {
                    Picker("Days", selection: $visibleDayCount) {
                        Text("3 days").tag(3)
                        Text("Week").tag(7)
                    }
                    .pickerStyle(.segmented)
                    .frame(width: 158)
                    .accessibilityIdentifier("schedule-share-day-range")
                }
            }

            ScheduleShareTimelineView(
                snapshot: snapshot,
                dayLimit: visibleDayCount,
                compact: false,
                fullDay: showsFullDay,
                selectedSlotID: timeSelection?.bounds.id,
                selectedRange: timeSelection.map { DateInterval(start: $0.start, end: $0.end) },
                onSelectSlot: { slot in
                    selectFreeWindow(slot)
                }
            )

            HStack(spacing: SideSeatTheme.spaceLG) {
                legend(color: SideSeatTheme.success, title: String(localized: "Free"))
                legend(color: SideSeatTheme.textSecondary, title: String(localized: "Busy"))
                if timeSelection != nil {
                    legend(color: SideSeatTheme.accent, title: String(localized: "Your time"))
                }
                Spacer(minLength: 0)
                Button {
                    withAnimation(.easeInOut(duration: 0.2)) {
                        showsFullDay.toggle()
                    }
                } label: {
                    Label(
                        showsFullDay ? String(localized: "Day view") : String(localized: "24 hours"),
                        systemImage: showsFullDay ? "sun.max" : "clock"
                    )
                    .font(.caption.weight(.semibold))
                }
                .buttonStyle(.plain)
                .foregroundStyle(SideSeatTheme.accent)
                .accessibilityIdentifier("schedule-share-full-day-toggle")
            }
        }
        .padding(SideSeatTheme.spaceMD)
        .background(SideSeatTheme.surface, in: RoundedRectangle(cornerRadius: 8, style: .continuous))
    }

    private func legend(color: Color, title: String) -> some View {
        HStack(spacing: 5) {
            RoundedRectangle(cornerRadius: 2)
                .fill(color.opacity(0.72))
                .frame(width: 12, height: 7)
            Text(title)
                .font(.caption)
                .foregroundStyle(.secondary)
        }
    }

    private func rangeDayCount(_ snapshot: NativeScheduleShareSnapshot) -> Int {
        guard let start = Date.sideSeatChatISO8601(snapshot.rangeStart),
              let end = Date.sideSeatChatISO8601(snapshot.rangeEnd)
        else { return snapshot.includedDates.count }
        return ScheduleShareDateSelection.dates(
            from: start,
            through: end,
            calendar: .sideSeatBerlin
        ).count
    }

    private func availableTimes(_ slots: [NativeScheduleShareSlot]) -> some View {
        VStack(alignment: .leading, spacing: SideSeatTheme.spaceMD) {
            HStack(alignment: .firstTextBaseline) {
                Text("Free windows")
                    .font(.headline)
                Spacer(minLength: SideSeatTheme.spaceMD)
                Text("All day")
                    .font(.caption.monospacedDigit())
                    .foregroundStyle(.secondary)
            }
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: SideSeatTheme.spaceSM) {
                    ForEach(slots) { slot in
                        Button {
                            selectFreeWindow(slot)
                        } label: {
                            VStack(alignment: .leading, spacing: 3) {
                                if let start = Date.sideSeatChatISO8601(slot.start),
                                   let end = Date.sideSeatChatISO8601(slot.end) {
                                    Text(start.formatted(.dateTime.weekday(.abbreviated).month(.abbreviated).day()))
                                        .font(.caption2.weight(.semibold))
                                    Text(freeWindowTimeLabel(start: start, end: end))
                                        .font(.caption.monospacedDigit())
                                }
                            }
                            .foregroundStyle(timeSelection?.bounds.id == slot.id ? Color.white : SideSeatTheme.textPrimary)
                            .padding(.horizontal, 12)
                            .frame(height: 50)
                            .background(
                                timeSelection?.bounds.id == slot.id ? SideSeatTheme.accent : SideSeatTheme.surface,
                                in: RoundedRectangle(cornerRadius: 8, style: .continuous)
                            )
                            .overlay(
                                RoundedRectangle(cornerRadius: 8, style: .continuous)
                                    .strokeBorder(SideSeatTheme.fillTertiary, lineWidth: timeSelection?.bounds.id == slot.id ? 0 : 1)
                            )
                        }
                        .buttonStyle(.plain)
                        .accessibilityIdentifier("schedule-share-slot-\(slot.id)")
                    }
                }
            }
        }
    }

    private var proposalComposer: some View {
        VStack(alignment: .leading, spacing: SideSeatTheme.spaceMD) {
            Text("Suggest a plan")
                .font(.headline)

            if let selection = timeSelection {
                proposalTimeEditor(selection)
            } else {
                Label("Choose a green free window", systemImage: "hand.tap")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }

            VStack(spacing: 0) {
                TextField("Title", text: $title)
                    .padding(.horizontal, SideSeatTheme.spaceMD)
                    .frame(minHeight: 48)
                    .accessibilityIdentifier("schedule-share-proposal-title")
                Divider()
                TextField("Location (optional)", text: $location)
                    .padding(.horizontal, SideSeatTheme.spaceMD)
                    .frame(minHeight: 48)
                Divider()
                TextField("Note (optional)", text: $note, axis: .vertical)
                    .lineLimit(2...4)
                    .padding(SideSeatTheme.spaceMD)
                    .frame(minHeight: 56, alignment: .top)
            }
            .background(SideSeatTheme.surface, in: RoundedRectangle(cornerRadius: 8, style: .continuous))

            SSPrimaryButton(
                title: String(localized: "Send proposal"),
                isLoading: store.isSubmitting,
                fill: .product,
                height: 46,
                accessibilityID: "schedule-share-proposal-submit"
            ) {
                Task { await submitProposal() }
            }
            .disabled(
                timeSelection == nil
                    || title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                    || store.isSubmitting
            )
        }
    }

    @ViewBuilder
    private func proposalTimeEditor(_ selection: NativeScheduleShareProposalSelection) -> some View {
        if let boundsStart = Date.sideSeatChatISO8601(selection.bounds.start),
           let boundsEnd = Date.sideSeatChatISO8601(selection.bounds.end) {
            VStack(alignment: .leading, spacing: SideSeatTheme.spaceSM) {
                Label(
                    "\(selection.start.formatted(date: .abbreviated, time: .shortened)) – \(selection.end.formatted(date: .omitted, time: .shortened))",
                    systemImage: "calendar.badge.checkmark"
                )
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(SideSeatTheme.accent)

                Text(
                    "\(String(localized: "Free window")) \(boundsStart.formatted(date: .omitted, time: .shortened))–\(boundsEnd.formatted(date: .omitted, time: .shortened))"
                )
                .font(.caption)
                .foregroundStyle(.secondary)

                VStack(spacing: 0) {
                    DatePicker(
                        "Starts",
                        selection: Binding(
                            get: { timeSelection?.start ?? selection.start },
                            set: { requested in
                                guard let current = timeSelection else { return }
                                timeSelection = ScheduleShareProposalTime.updatingStart(current, to: requested)
                            }
                        ),
                        in: boundsStart...boundsEnd.addingTimeInterval(
                            -TimeInterval(ScheduleShareProposalTime.minimumMinutes * 60)
                        ),
                        displayedComponents: datePickerComponents(boundsStart: boundsStart, boundsEnd: boundsEnd)
                    )
                    .padding(.horizontal, SideSeatTheme.spaceMD)
                    .frame(minHeight: 46)
                    .accessibilityIdentifier("schedule-share-proposal-start")

                    Divider()

                    DatePicker(
                        "Ends",
                        selection: Binding(
                            get: { timeSelection?.end ?? selection.end },
                            set: { requested in
                                guard let current = timeSelection else { return }
                                timeSelection = ScheduleShareProposalTime.updatingEnd(current, to: requested)
                            }
                        ),
                        in: selection.start.addingTimeInterval(
                            TimeInterval(ScheduleShareProposalTime.minimumMinutes * 60)
                        )...min(
                            boundsEnd,
                            selection.start.addingTimeInterval(
                                TimeInterval(ScheduleShareProposalTime.maximumMinutes * 60)
                            )
                        ),
                        displayedComponents: datePickerComponents(boundsStart: boundsStart, boundsEnd: boundsEnd)
                    )
                    .padding(.horizontal, SideSeatTheme.spaceMD)
                    .frame(minHeight: 46)
                    .accessibilityIdentifier("schedule-share-proposal-end")
                }
                .background(SideSeatTheme.surface, in: RoundedRectangle(cornerRadius: 8, style: .continuous))

                HStack(spacing: SideSeatTheme.spaceXS) {
                    ForEach([30, 60, 90, 120], id: \.self) { minutes in
                        durationButton(minutes, selection: selection, boundsEnd: boundsEnd)
                    }
                }
            }
        }
    }

    private func durationButton(
        _ minutes: Int,
        selection: NativeScheduleShareProposalSelection,
        boundsEnd: Date
    ) -> some View {
        let currentMinutes = Int(selection.end.timeIntervalSince(selection.start) / 60)
        let fits = selection.start.addingTimeInterval(TimeInterval(minutes * 60)) <= boundsEnd
        return Button {
            withAnimation(.easeOut(duration: 0.16)) {
                timeSelection = ScheduleShareProposalTime.applyingDuration(minutes, to: selection)
            }
        } label: {
            Text(durationLabel(minutes))
                .font(.caption.weight(.semibold))
                .frame(maxWidth: .infinity)
                .frame(height: 32)
                .foregroundStyle(currentMinutes == minutes ? Color.white : SideSeatTheme.textPrimary)
                .background(
                    currentMinutes == minutes ? SideSeatTheme.accent : SideSeatTheme.fillTertiary,
                    in: RoundedRectangle(cornerRadius: 8, style: .continuous)
                )
        }
        .buttonStyle(.plain)
        .disabled(!fits)
        .opacity(fits ? 1 : 0.38)
        .accessibilityIdentifier("schedule-share-duration-\(minutes)")
    }

    private func durationLabel(_ minutes: Int) -> String {
        switch minutes {
        case 30: String(localized: "30 min")
        case 60: String(localized: "1 hr")
        case 90: String(localized: "90 min")
        default: String(localized: "2 hr")
        }
    }

    private func freeWindowTimeLabel(start: Date, end: Date) -> String {
        let calendar = Calendar.sideSeatBerlin
        if calendar.isDate(start, inSameDayAs: end.addingTimeInterval(-0.001)) {
            return "\(start.formatted(date: .omitted, time: .shortened))–\(end.formatted(date: .omitted, time: .shortened))"
        }
        return "\(start.formatted(date: .omitted, time: .shortened))–\(end.formatted(.dateTime.weekday(.abbreviated).hour().minute()))"
    }

    private func datePickerComponents(boundsStart: Date, boundsEnd: Date) -> DatePickerComponents {
        Calendar.sideSeatBerlin.isDate(
            boundsStart,
            inSameDayAs: boundsEnd.addingTimeInterval(-0.001)
        ) ? .hourAndMinute : [.date, .hourAndMinute]
    }

    private func selectFreeWindow(_ slot: NativeScheduleShareSlot) {
        guard let selection = ScheduleShareProposalTime.initialSelection(in: slot) else { return }
        withAnimation(.easeOut(duration: 0.18)) {
            timeSelection = selection
        }
    }

    private func restoreExistingProposalSelection() {
        guard let proposal = store.proposal,
              let snapshot = store.snapshot,
              let start = Date.sideSeatChatISO8601(proposal.startTime),
              let end = Date.sideSeatChatISO8601(proposal.endTime),
              let bounds = snapshot.freeSlots.first(where: {
                  ScheduleShareProposalTime.fits(start: start, end: end, in: $0)
              })
        else { return }
        timeSelection = ScheduleShareProposalTime.selection(in: bounds, start: start, end: end)
    }

    private func proposalStatus(_ status: String) -> String {
        switch status {
        case "ACCEPTED": String(localized: "Accepted")
        case "DECLINED": String(localized: "Declined")
        default: String(localized: "Waiting for a response")
        }
    }

    private func submitProposal() async {
        guard let selection = timeSelection else { return }
        _ = await store.submit(
            token: token,
            title: title.trimmingCharacters(in: .whitespacesAndNewlines),
            note: {
                let value = note.trimmingCharacters(in: .whitespacesAndNewlines)
                return value.isEmpty ? nil : value
            }(),
            location: {
                let value = location.trimmingCharacters(in: .whitespacesAndNewlines)
                return value.isEmpty ? nil : value
            }(),
            start: selection.start,
            end: selection.end,
            using: session
        )
    }
}
