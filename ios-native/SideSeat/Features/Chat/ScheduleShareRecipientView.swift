import SwiftUI

@MainActor
@Observable
final class ScheduleShareRecipientStore {
    private(set) var snapshot: NativeScheduleShareSnapshot?
    private(set) var proposal: NativeScheduleShareViewerProposal?
    private(set) var allowGuestProposals = false
    private(set) var linkID: String?
    private(set) var ownedByViewer = false
    private(set) var updatedAt: String?
    private(set) var isUpdated = false
    private(set) var isLoading = false
    private(set) var isSubmitting = false
    private(set) var isRevoking = false
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
            if ProcessInfo.processInfo.arguments.contains("--ui-testing-smart-time") {
                let slots = SmartTimeMatcher.fixtureSlots(own: false)
                snapshot = NativeScheduleShareSnapshot(ownerDisplayLabel: "Mina", rangeStart: slots.first!.start,
                    rangeEnd: slots.last!.end, includedDates: [], expiresAt: nil, allowGuestProposals: true,
                    freeSlots: slots, blocks: nil)
            }
            allowGuestProposals = true
            proposal = nil
            linkID = "cuitestlink000000000000001"
            ownedByViewer = ProcessInfo.processInfo.arguments.contains("--ui-testing-schedule-share-owner")
            updatedAt = "2026-07-18T12:00:00.000Z"
            isUpdated = ProcessInfo.processInfo.arguments.contains("--ui-testing-schedule-share-updated")
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
            linkID = response.data.linkId
            ownedByViewer = response.data.ownedByViewer ?? false
            updatedAt = response.data.updatedAt
            isUpdated = response.data.isUpdated ?? false
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

    func revoke(using session: SessionStore) async -> Bool {
        guard let linkID, !isRevoking else { return false }
        isRevoking = true
        issue = nil
        defer { isRevoking = false }

        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("--ui-testing-authenticated") {
            return true
        }
        #endif

        do {
            let encoded = linkID.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? linkID
            let _: APIEnvelope<NativeScheduleShareRevokeResult> = try await session.sendAuthorized(
                "api/v1/schedule-shares/owner/\(encoded)",
                method: .delete
            )
            return true
        } catch {
            issue = error.localizedDescription
            return false
        }
    }
}

struct ScheduleShareRecipientView: View {
    @Environment(SessionStore.self) private var session
    @Environment(\.dismiss) private var dismiss
    let token: String
    var onReturnToChat: (() -> Void)? = nil

    @State private var store = ScheduleShareRecipientStore()
    @State private var smartAvailability = SmartTimeAvailabilityStore()
    @State private var isCheckingTime = false
    @State private var timingIssue: String?
    @State private var timeSelection: NativeScheduleShareProposalSelection?
    @State private var visibleDayCount = 3
    @State private var showsFullDay = false
    @State private var showsFullSchedule = false
    @State private var title = AppLocalization.string( "Meet up")
    @State private var note = ""
    @State private var location = ""
    @State private var showEditShare = false
    @State private var showRevokeConfirmation = false

    var body: some View {
        Group {
            if let issue = store.issue, store.snapshot == nil {
                ContentUnavailableView("Availability unavailable", systemImage: "calendar.badge.exclamationmark", description: Text(issue))
            } else if let snapshot = store.snapshot {
                ScrollViewReader { scroll in
                ScrollView {
                    VStack(alignment: .leading, spacing: SideSeatTheme.spaceXL) {
                        scheduleHeader(snapshot)
                        if store.ownedByViewer {
                            scheduleTimeline(snapshot)
                        } else {
                            if store.allowGuestProposals {
                                SmartTimeSuggestionsPanel(peerSlots: snapshot.freeSlots, ownStore: smartAvailability,
                                    selection: timeSelection, onSelect: { candidate in
                                        timingIssue = nil
                                        if let candidate { selectCandidate(candidate) } else { timeSelection = nil }
                                    }, onRetry: { Task { await smartAvailability.load(using: session) } })
                                Button(showsFullSchedule ? "Hide full availability" : "View all available times") {
                                    showsFullSchedule.toggle()
                                }
                                .frame(minHeight: 44)
                                .accessibilityIdentifier("schedule-share-full-availability")
                            } else if snapshot.freeSlots.isEmpty {
                                scheduleTimeline(snapshot)
                            } else {
                                recommendedTimes(
                                    snapshot.freeSlots,
                                    allowsSelection: store.allowGuestProposals
                                )
                            }
                            if showsFullSchedule {
                                scheduleTimeline(snapshot)
                                    .transition(.opacity.combined(with: .move(edge: .top)))
                            }
                        }

                    if !store.ownedByViewer, let proposal = store.proposal {
                            VStack(alignment: .leading, spacing: SideSeatTheme.spaceMD) {
                                Text("Your proposal")
                                    .font(.headline)
                            Text(proposal.title)
                                .font(.body.weight(.semibold))
                            if let start = Date.sideSeatChatISO8601(proposal.startTime),
                               let end = Date.sideSeatChatISO8601(proposal.endTime) {
                                Text("\(SmartTimeFormatting.label(start, date: true, time: true)) – \(SmartTimeFormatting.label(end, date: false, time: true))")
                                    .font(.footnote)
                                    .foregroundStyle(.secondary)
                            }
                                Label(proposalStatus(proposal.status), systemImage: proposalStatusIcon(proposal.status))
                                    .font(.caption.weight(.semibold))
                                    .foregroundStyle(proposalStatusColor(proposal.status))
                            }
                            .padding(SideSeatTheme.spaceMD)
                            .background(SideSeatTheme.surface, in: RoundedRectangle(cornerRadius: 8, style: .continuous))
                            .accessibilityRepresentation {
                                Text(proposal.title)
                                    .accessibilityLabel("Your proposal")
                                    .accessibilityValue(
                                        "\(proposal.title), \(proposalStatus(proposal.status))"
                                    )
                                    .accessibilityIdentifier("schedule-share-my-proposal")
                            }
                            .id("smart-time-sent-proposal")
                            if let onReturnToChat {
                                Button("Back to chat", action: onReturnToChat)
                                    .font(.subheadline.weight(.semibold))
                                    .frame(maxWidth: .infinity, minHeight: 44)
                                    .accessibilityIdentifier("smart-time-return-chat")
                            }
                    }

                    if !store.ownedByViewer,
                       store.allowGuestProposals,
                       timeSelection != nil {
                        proposalComposer.id("smart-time-proposal-editor")
                    }

                    if let timingIssue {
                        Text(timingIssue).font(.footnote).foregroundStyle(SideSeatTheme.danger)
                            .accessibilityIdentifier("smart-time-conflict")
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
                .disabled(isCheckingTime || store.isSubmitting)
                .onChange(of: store.proposal?.id) { _, id in
                    if id != nil { withAnimation { scroll.scrollTo("smart-time-sent-proposal", anchor: .top) } }
                }
                .onChange(of: timeSelection != nil) { _, selected in
                    if selected { withAnimation { scroll.scrollTo("smart-time-proposal-editor", anchor: .top) } }
                }
                }
            } else {
                SSLoadingState("Loading availability")
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        }
        .background(SideSeatTheme.bgGrouped)
        .navigationTitle(store.ownedByViewer ? "Your shared availability" : "Shared availability")
        .navigationBarTitleDisplayMode(.inline)
        .environment(\.timeZone, Calendar.sideSeatBerlin.timeZone)
        .toolbar {
            if store.ownedByViewer, store.linkID != nil {
                ToolbarItemGroup(placement: .topBarTrailing) {
                    Button {
                        showEditShare = true
                    } label: {
                        Image(systemName: "slider.horizontal.3")
                    }
                    .accessibilityLabel("Edit sharing settings")
                    .accessibilityIdentifier("schedule-share-owner-edit")

                    Menu {
                        Button(role: .destructive) {
                            showRevokeConfirmation = true
                        } label: {
                            Label("Stop sharing", systemImage: "link.badge.minus")
                        }
                        .accessibilityIdentifier("schedule-share-owner-stop")
                    } label: {
                        Image(systemName: "ellipsis.circle")
                    }
                    .accessibilityLabel("More")
                    .accessibilityIdentifier("schedule-share-owner-more")
                }
            }
        }
        .task {
            await store.load(token: token, using: session)
            if let snapshot = store.snapshot, rangeDayCount(snapshot) > 3 {
                visibleDayCount = 7
            }
            if !store.ownedByViewer, store.allowGuestProposals { await smartAvailability.load(using: session) }
            restoreExistingProposalSelection()
        }
        .sheet(isPresented: $showEditShare) {
            if let linkID = store.linkID {
                ScheduleShareComposeSheet(editingLinkID: linkID)
            }
        }
        .ssActionPrompt(
            isPresented: $showRevokeConfirmation,
            title: AppLocalization.string("Stop sharing this availability?"),
            message: AppLocalization.string("Anyone with this link will no longer be able to view your availability or suggest a time."),
            systemImage: "link.badge.minus",
            tint: SideSeatTheme.danger,
            onDismiss: { showRevokeConfirmation = false },
            accessibilityIdentifier: "schedule-share-owner-stop-prompt"
        ) {
            [
                SSActionPromptAction(
                    id: "schedule-share-owner-cancel-stop",
                    title: AppLocalization.string("Cancel"),
                    systemImage: "xmark",
                    role: .cancel
                ) {},
                SSActionPromptAction(
                    id: "schedule-share-owner-confirm-stop",
                    title: AppLocalization.string("Stop sharing"),
                    systemImage: "link.badge.minus",
                    role: .destructive
                ) {
                    Task { await revokeShare() }
                },
            ]
        }
        .onReceive(NotificationCenter.default.publisher(for: .sideSeatScheduleShareDidUpdate)) { notification in
            guard notification.userInfo?[ScheduleShareNotificationKey.linkID] as? String == store.linkID else {
                return
            }
            Task { await store.load(token: token, using: session) }
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier(store.ownedByViewer ? "schedule-share-owner" : "schedule-share-recipient")
    }

    private func scheduleHeader(_ snapshot: NativeScheduleShareSnapshot) -> some View {
        HStack(spacing: SideSeatTheme.spaceMD) {
            Image(systemName: "calendar.badge.clock")
                .font(.title2.weight(.semibold))
                .foregroundStyle(SideSeatTheme.HubTint.plans)
                .frame(width: 44, height: 44)
                .background(SideSeatTheme.HubTint.plans.opacity(0.12), in: Circle())
            VStack(alignment: .leading, spacing: 3) {
                Text(snapshot.ownerDisplayLabel)
                    .font(.title3.weight(.semibold))
                if let start = Date.sideSeatChatISO8601(snapshot.rangeStart),
                   let end = Date.sideSeatChatISO8601(snapshot.rangeEnd) {
                    Text("\(SmartTimeFormatting.label(start, date: true, time: false)) – \(SmartTimeFormatting.label(end, date: true, time: false))")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
                if store.isUpdated {
                    Label("Updated", systemImage: "arrow.triangle.2.circlepath")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(SideSeatTheme.textSecondaryStrong)
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
                onSelectSlot: store.allowGuestProposals ? { slot in
                    selectFreeWindow(slot)
                } : nil
            )

            HStack(spacing: SideSeatTheme.spaceLG) {
                legend(color: SideSeatTheme.success, title: AppLocalization.string( "Free"))
                legend(color: SideSeatTheme.textSecondary, title: AppLocalization.string( "Busy"))
                if timeSelection != nil {
                    legend(color: SideSeatTheme.accent, title: AppLocalization.string( "Your time"))
                }
                Spacer(minLength: 0)
                Button {
                    withAnimation(.easeInOut(duration: 0.2)) {
                        showsFullDay.toggle()
                    }
                } label: {
                    HStack(spacing: SideSeatTheme.spaceXS) {
                        Image(systemName: showsFullDay ? "sun.max" : "clock")
                            .foregroundStyle(SideSeatTheme.textSecondaryStrong)
                        Text(showsFullDay ? AppLocalization.string( "Day view") : AppLocalization.string( "24 hours"))
                            .foregroundStyle(SideSeatTheme.textPrimary)
                    }
                    .font(.caption.weight(.semibold))
                }
                .buttonStyle(SSPressButtonStyle())
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

    private func recommendedTimes(
        _ slots: [NativeScheduleShareSlot],
        allowsSelection: Bool
    ) -> some View {
        let candidates = ScheduleShareCandidateRecommendations.candidates(from: slots)
        return VStack(alignment: .leading, spacing: SideSeatTheme.spaceMD) {
            VStack(alignment: .leading, spacing: 4) {
                Text(allowsSelection ? "Recommended times" : "Available times")
                    .font(.headline)
                Text(
                    allowsSelection
                        ? "Choose a suggested time, or open the full availability to find another."
                        : "This availability is for viewing only."
                )
                    .font(.footnote)
                    .foregroundStyle(SideSeatTheme.textSecondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
            if !allowsSelection {
                Label("View only", systemImage: "eye")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(SideSeatTheme.textSecondaryStrong)
                    .accessibilityIdentifier("schedule-share-view-only")
            }
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: SideSeatTheme.spaceSM) {
                    ForEach(candidates) { candidate in
                        if allowsSelection {
                            Button {
                                selectCandidate(candidate)
                            } label: {
                                candidateCard(candidate, selected: isCandidateSelected(candidate))
                            }
                            .buttonStyle(SSPressButtonStyle())
                            .accessibilityIdentifier("schedule-share-candidate-\(candidate.id)")
                        } else {
                            candidateCard(candidate, selected: false)
                                .accessibilityIdentifier("schedule-share-candidate-\(candidate.id)")
                        }
                    }
                }
            }

            Button {
                withAnimation(.easeInOut(duration: 0.2)) {
                    showsFullSchedule.toggle()
                }
            } label: {
                HStack(spacing: SideSeatTheme.spaceSM) {
                    Image(systemName: showsFullSchedule ? "chevron.up" : "calendar")
                    Text(showsFullSchedule ? "Hide full availability" : "View all available times")
                    Spacer(minLength: 0)
                }
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(SideSeatTheme.utilityAction)
                .frame(minHeight: 44)
            }
            .buttonStyle(SSPressButtonStyle())
            .accessibilityIdentifier("schedule-share-full-availability")
        }
        .padding(SideSeatTheme.spaceMD)
        .background(SideSeatTheme.surface, in: RoundedRectangle(cornerRadius: 8, style: .continuous))
    }

    private func candidateCard(
        _ candidate: NativeScheduleShareCandidate,
        selected: Bool
    ) -> some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(candidate.start.formatted(.dateTime.weekday(.abbreviated).month(.abbreviated).day()))
                .font(.caption2.weight(.semibold))
            Text(freeWindowTimeLabel(start: candidate.start, end: candidate.end))
                .font(.caption.monospacedDigit())
        }
        .foregroundStyle(selected ? SideSeatTheme.ProductAction.foreground : SideSeatTheme.textPrimary)
        .padding(.horizontal, 12)
        .frame(height: 50)
        .background(
            selected ? SideSeatTheme.ProductAction.fill : SideSeatTheme.fillTertiary,
            in: RoundedRectangle(cornerRadius: 8, style: .continuous)
        )
        .overlay(
            RoundedRectangle(cornerRadius: 8, style: .continuous)
                .strokeBorder(SideSeatTheme.separator, lineWidth: selected ? 0 : 0.5)
        )
    }

    private func isCandidateSelected(_ candidate: NativeScheduleShareCandidate) -> Bool {
        guard let timeSelection else { return false }
        return abs(timeSelection.start.timeIntervalSince(candidate.start)) < 1
            && abs(timeSelection.end.timeIntervalSince(candidate.end)) < 1
    }

    private func selectCandidate(_ candidate: NativeScheduleShareCandidate) {
        guard let selection = ScheduleShareProposalTime.selection(
            in: candidate.bounds,
            start: candidate.start,
            end: candidate.end
        ) else { return }
        withAnimation(.easeOut(duration: 0.18)) {
            timeSelection = selection
        }
    }

    private var proposalComposer: some View {
        VStack(alignment: .leading, spacing: SideSeatTheme.spaceMD) {
            Text("Suggest a plan")
                .font(.headline)

            if let selection = timeSelection {
                proposalTimeEditor(selection)
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
                title: AppLocalization.string( "Send proposal"),
                isLoading: store.isSubmitting || isCheckingTime,
                fill: .product,
                height: 46,
                accessibilityID: "schedule-share-proposal-submit"
            ) {
                Task { await submitProposal() }
            }
            .disabled(
                timeSelection == nil
                    || title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                    || store.isSubmitting || isCheckingTime
            )
        }
    }

    @ViewBuilder
    private func proposalTimeEditor(_ selection: NativeScheduleShareProposalSelection) -> some View {
        if let boundsStart = Date.sideSeatChatISO8601(selection.bounds.start),
           let boundsEnd = Date.sideSeatChatISO8601(selection.bounds.end) {
            VStack(alignment: .leading, spacing: SideSeatTheme.spaceSM) {
                HStack(spacing: SideSeatTheme.spaceSM) {
                    Image(systemName: "calendar.badge.checkmark")
                        .foregroundStyle(SideSeatTheme.HubTint.plans)
                    Text("\(SmartTimeFormatting.label(selection.start, date: true, time: true)) – \(SmartTimeFormatting.label(selection.end, date: false, time: true))")
                        .foregroundStyle(SideSeatTheme.textPrimary)
                }
                .font(.subheadline.weight(.semibold))

                Text(
                    "\(AppLocalization.string( "Free window")) \(SmartTimeFormatting.label(boundsStart, date: false, time: true))–\(SmartTimeFormatting.label(boundsEnd, date: false, time: true))"
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
                .foregroundStyle(currentMinutes == minutes ? SideSeatTheme.ProductAction.foreground : SideSeatTheme.textPrimary)
                .background(
                    currentMinutes == minutes ? SideSeatTheme.ProductAction.fill : SideSeatTheme.fillTertiary,
                    in: RoundedRectangle(cornerRadius: 8, style: .continuous)
                )
        }
        .buttonStyle(SSPressButtonStyle())
        .disabled(!fits)
        .opacity(fits ? 1 : 0.38)
        .accessibilityIdentifier("schedule-share-duration-\(minutes)")
    }

    private func durationLabel(_ minutes: Int) -> String {
        switch minutes {
        case 30: AppLocalization.string( "30 min")
        case 60: AppLocalization.string( "1 hr")
        case 90: AppLocalization.string( "90 min")
        default: AppLocalization.string( "2 hr")
        }
    }

    private func freeWindowTimeLabel(start: Date, end: Date) -> String {
        let calendar = Calendar.sideSeatBerlin
        if calendar.isDate(start, inSameDayAs: end.addingTimeInterval(-0.001)) {
            return "\(SmartTimeFormatting.label(start, date: false, time: true))–\(SmartTimeFormatting.label(end, date: false, time: true))"
        }
        return "\(SmartTimeFormatting.label(start, date: false, time: true))–\(SmartTimeFormatting.label(end, date: true, time: true))"
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
        case "ACCEPTED": AppLocalization.string( "Accepted")
        case "DECLINED": AppLocalization.string( "Declined")
        default: AppLocalization.string( "Waiting for a response")
        }
    }

    private func proposalStatusIcon(_ status: String) -> String {
        switch status {
        case "ACCEPTED": "checkmark.circle.fill"
        case "DECLINED": "xmark.circle.fill"
        default: "hourglass"
        }
    }

    private func proposalStatusColor(_ status: String) -> Color {
        switch status {
        case "ACCEPTED": SideSeatTheme.success
        case "DECLINED": SideSeatTheme.danger
        default: SideSeatTheme.warning
        }
    }

    private func submitProposal() async {
        guard let selection = timeSelection, !isCheckingTime, !store.isSubmitting else { return }
        isCheckingTime = true
        timingIssue = nil
        defer { isCheckingTime = false }
        await store.load(token: token, using: session)
        guard store.issue == nil, !store.ownedByViewer, store.allowGuestProposals else {
            timeSelection = nil
            return
        }
        guard await smartAvailability.load(using: session) else { return }
        let common = SmartTimeMatcher.commonSlots(store.snapshot?.freeSlots ?? [], smartAvailability.slots ?? [])
        guard SmartTimeMatcher.contains(start: selection.start, end: selection.end, in: common) else {
            timeSelection = nil
            timingIssue = AppLocalization.string("This time is no longer free for both of you. Choose another suggestion.")
            return
        }
        let sent = await store.submit(
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
        if sent { timeSelection = nil }
    }

    @MainActor
    private func revokeShare() async {
        guard await store.revoke(using: session), let linkID = store.linkID else { return }
        NotificationCenter.default.post(
            name: .sideSeatScheduleShareDidRevoke,
            object: nil,
            userInfo: [ScheduleShareNotificationKey.linkID: linkID]
        )
        dismiss()
    }
}
