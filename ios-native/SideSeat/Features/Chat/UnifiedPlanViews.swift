import SwiftUI

struct ExpiredTimePollView: View {
    let poll: NativeTimePoll
    let backToPlans: () -> Void

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: SideSeatTheme.spaceLG) {
                Text(poll.title).font(.title2.weight(.semibold)).accessibilityIdentifier("time-poll-detail-title")
                Label("Expired", systemImage: "clock.badge.exclamationmark")
                    .font(.headline).accessibilityIdentifier("unified-plan-phase")
                if let start = poll.chosenStart, let end = poll.chosenEnd {
                    Text(unifiedPlanTimeLabel(start: start, end: end, timeZone: poll.timeZone))
                }
                Text("This plan expired before it was confirmed. No calendar entries were added.")
                    .foregroundStyle(SideSeatTheme.textSecondaryStrong)
                Text("Create a new plan to arrange another time.")
                    .font(.subheadline).foregroundStyle(SideSeatTheme.textSecondaryStrong)
                Button("Back to plans", action: backToPlans)
                    .buttonStyle(.bordered).tint(SideSeatTheme.utilityAction)
                    .frame(minHeight: 44).accessibilityIdentifier("unified-plan-expired-back")
            }.padding(SideSeatTheme.spaceLG).frame(maxWidth: .infinity, alignment: .leading)
        }.accessibilityIdentifier("unified-plan-expired")
    }
}

func unifiedPlanTimeLabel(start: Date, end: Date, timeZone: String) -> String {
    let formatter = DateFormatter()
    formatter.locale = AppLocalization.selectedLanguage.locale
    formatter.timeZone = TimeZone(identifier: timeZone)
    formatter.dateStyle = .medium; formatter.timeStyle = .short
    return formatter.string(from: start) + " – " + formatter.string(from: end)
}

struct UnifiedPlanInviteView: View {
    @Environment(SessionStore.self) private var session
    @Environment(\.dismiss) private var dismiss
    let poll: NativeTimePoll
    @Bindable var store: TimePollStore
    @State private var date: String
    @State private var starts: Date
    @State private var ends: Date
    @State private var selected: Set<String>

    init(poll: NativeTimePoll, store: TimePollStore) {
        self.poll = poll; self.store = store
        let date = poll.slots.first(where: { $0.start == poll.chosenStart })?.date ?? poll.dates.first ?? ""
        let cells = poll.cells.filter { $0.date == date }
        let start = cells.first(where: { $0.slots[0].start == poll.chosenStart })?.slots[0].start ?? cells.first?.slots[0].start ?? Date()
        let end = cells.first(where: { $0.end == poll.chosenEnd && $0.end > start })?.end ?? cells.last?.end ?? start
        _date = State(initialValue: date); _starts = State(initialValue: start); _ends = State(initialValue: end)
        _selected = State(initialValue: Set(poll.participants.map(\.id)))
    }

    private var cells: [NativeTimePoll.Cell] { poll.cells.filter { $0.date == date } }
    private var rangeIds: Set<Int> {
        Set(poll.slots.filter { $0.date == date && $0.start >= starts && $0.end <= ends }.map(\.id))
    }
    private func available(_ person: NativeTimePoll.Participant) -> Bool {
        !rangeIds.isEmpty && rangeIds.isSubset(of: Set(person.slotIds))
    }
    private func endLabel(_ cell: NativeTimePoll.Cell) -> String {
        if let next = cells.first(where: { $0.slots[0].start == cell.end }) { return next.label }
        return poll.endMinute == 1440 ? "24:00" : timePollClockFormatter(poll.timeZone).string(from: cell.end)
    }

    var body: some View {
        NavigationStack {
            Form {
                Section(poll.title) {
                    Text(unifiedPlanTimeLabel(start: starts, end: ends, timeZone: poll.timeZone))
                        .accessibilityIdentifier("unified-plan-chosen-range")
                    if let location = poll.location, !location.isEmpty { Label(location, systemImage: "mappin.and.ellipse") }
                }
                Section("Choose the time") {
                    Picker("Plan date", selection: Binding(get: { date }, set: { value in
                        date = value
                        let day = poll.cells.filter { $0.date == value }
                        starts = day.first?.slots[0].start ?? starts; ends = day.last?.end ?? ends
                    })) {
                        ForEach(poll.dates, id: \.self) { Text(timePollDateLabel($0).replacingOccurrences(of: "\n", with: " ")).tag($0) }
                    }.accessibilityIdentifier("unified-plan-invite-date")
                    Picker("From", selection: Binding(get: { starts }, set: { value in
                        starts = value
                        if ends <= value { ends = cells.first(where: { $0.end > value })?.end ?? ends }
                    })) {
                        ForEach(cells) { Text($0.label).tag($0.slots[0].start) }
                    }.accessibilityIdentifier("unified-plan-invite-from")
                    Picker("Until", selection: $ends) {
                        ForEach(cells.filter { $0.end > starts }) { Text(endLabel($0)).tag($0.end) }
                    }.accessibilityIdentifier("unified-plan-invite-until")
                    LabeledContent("Time zone", value: poll.timeZone)
                    Text("Choose the hours you want to spend together, including half a day or a full day.")
                        .font(.footnote).foregroundStyle(.secondary)
                }
                Section("Choose who to invite") {
                    ForEach(poll.participants) { person in
                        Button {
                            if selected.contains(person.id) { selected.remove(person.id) } else { selected.insert(person.id) }
                        } label: {
                            HStack {
                                Image(systemName: selected.contains(person.id) ? "checkmark.circle.fill" : "circle")
                                VStack(alignment: .leading) {
                                    Text(person.displayName).foregroundStyle(SideSeatTheme.textPrimary)
                                    if person.isGuest == true { Text("Guest").font(.caption).foregroundStyle(.secondary) }
                                    Text(available(person) ? "Available for the full activity" : "Not available for the full activity")
                                        .font(.caption).foregroundStyle(.secondary)
                                }
                            }.frame(minHeight: 44)
                        }
                        .disabled(person.isMe)
                        .accessibilityIdentifier("unified-plan-invite-person-\(person.id)")
                        .accessibilityValue(selected.contains(person.id) ? "Selected" : "Not selected")
                    }
                    Text("Sending confirms your participation. Everyone you select must confirm this exact time before calendars are updated.")
                        .font(.footnote).foregroundStyle(.secondary)
                }
                if let error = store.error { Section { Text(error).foregroundStyle(SideSeatTheme.danger) } }
            }
            .safeAreaInset(edge: .bottom, spacing: 0) {
                VStack(alignment: .leading, spacing: SideSeatTheme.spaceSM) {
                    Text(String(format: AppLocalization.string("Inviting %d people, including you"), 1 + poll.participants.filter { !$0.isMe && selected.contains($0.id) }.count))
                        .font(.subheadline.weight(.semibold))
                    Text("Sending confirms your participation. Everyone else confirms from the link.")
                        .font(.caption).foregroundStyle(SideSeatTheme.textSecondaryStrong)
                    SSPrimaryButton(title: AppLocalization.string("Send invitations"), isLoading: store.acting, fill: .product,
                                    accessibilityID: "unified-plan-send-invitations") {
                        Task {
                            await store.mutate("invitations", body: SendPollInvitationsRequest(start: ISO8601DateFormatter().string(from: starts), end: ISO8601DateFormatter().string(from: ends), attendeeIds: selected.sorted(), version: poll.invitationVersion ?? 0), session: session)
                            if store.error == nil && store.poll?.planningPhase == "INVITING" { dismiss() }
                        }
                    }
                    .disabled(!store.canMutate || ends <= starts || !poll.participants.contains { !$0.isMe && selected.contains($0.id) })
                }.padding(SideSeatTheme.spaceMD).background(SideSeatTheme.surface).overlay(alignment: .top) { Divider() }
            }
            .navigationTitle("Invite participants").navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() }.disabled(store.acting) } }
        }.tint(SideSeatTheme.utilityAction)
    }
}

struct UnifiedPlanConfirmationView: View {
    @Environment(SessionStore.self) private var session
    @Environment(DeepLinkRouter.self) private var deepLinkRouter
    @Environment(\.dismiss) private var dismiss
    let poll: NativeTimePoll
    @Bindable var store: TimePollStore
    let chooseAnotherTime: () -> Void
    @State private var showsName = false
    @State private var draftName = ""
    private var mine: NativeTimePoll.Invitation? { poll.allInvitations.first(where: \.isMe) }
    private var accepted: Int { poll.allInvitations.filter { $0.selected && $0.status == "ACCEPTED" }.count }
    private var presentation: PlanPresentation { poll.presentation(at: Date()) }
    private var canReply: Bool {
        poll.planningPhase == "INVITING" && !poll.isOwner && (mine?.selected == true
            || poll.planningMode == "FIXED" && accepted < poll.targetCount && (mine == nil || mine?.status == "DECLINED"))
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: SideSeatTheme.spaceLG) {
                VStack(alignment: .leading, spacing: SideSeatTheme.spaceMD) {
                    if ["INVITING", "CONFIRMED"].contains(poll.planningPhase) {
                        PlanJourneyProgress(phase: poll.planningPhase, fixed: poll.planningMode == "FIXED")
                    }
                    PlanStatusBadge(status: presentation.status, needsYou: presentation.nextStep.needsYou,
                                    identifier: "unified-plan-phase")
                    PlanNextStepSummary(presentation: presentation)
                    Text(poll.title).font(.headline).accessibilityIdentifier("time-poll-detail-title")
                    if let start = poll.chosenStart, let end = poll.chosenEnd {
                        Label(unifiedPlanTimeLabel(start: start, end: end, timeZone: poll.timeZone), systemImage: "calendar")
                            .font(.body.weight(.medium)).fixedSize(horizontal: false, vertical: true)
                    }
                    if let location = poll.location, !location.isEmpty { Label(location, systemImage: "mappin.and.ellipse").font(.subheadline) }
                    Text(String(format: AppLocalization.string("All times in %@"), poll.timeZone))
                        .font(.caption).foregroundStyle(SideSeatTheme.textSecondaryStrong)
                }
                .frame(maxWidth: .infinity, alignment: .leading).padding(SideSeatTheme.spaceLG)
                .background(SideSeatTheme.surface, in: RoundedRectangle(cornerRadius: SideSeatTheme.cardRadius))
                VStack(alignment: .leading, spacing: SideSeatTheme.spaceMD) {
                    HStack {
                        Text("Who's joining?").font(.headline)
                        Spacer()
                        Text(String(format: AppLocalization.string("%d of %d confirmed"), accepted, poll.targetCount))
                            .font(.subheadline.weight(.medium)).accessibilityIdentifier("unified-plan-confirmation-count")
                    }
                    ForEach(poll.allInvitations.filter(\.selected)) { person in
                        HStack(spacing: SideSeatTheme.spaceMD) {
                            Image(systemName: person.status == "ACCEPTED" ? "checkmark.circle.fill" : person.status == "DECLINED" ? "xmark.circle" : "clock")
                                .foregroundStyle(person.status == "ACCEPTED" ? SideSeatTheme.statusSuccessText : SideSeatTheme.textSecondaryStrong)
                            VStack(alignment: .leading, spacing: 3) {
                                Text(person.displayName).font(.subheadline.weight(.medium))
                                Text(AppLocalization.string(person.status == "ACCEPTED" ? "Confirmed" : person.status == "DECLINED" ? "Declined" : "Awaiting confirmation"))
                                    .font(.caption).foregroundStyle(SideSeatTheme.textSecondaryStrong)
                            }
                            Spacer()
                            if person.isMe { Text("You").font(.caption).foregroundStyle(SideSeatTheme.textSecondaryStrong) }
                            else if person.isGuest == true { Text("Guest").font(.caption).foregroundStyle(SideSeatTheme.textSecondaryStrong) }
                        }.accessibilityIdentifier("unified-plan-person-\(person.id)")
                    }
                    if poll.planningMode == "FIXED", poll.planningPhase == "INVITING", poll.targetCount > poll.allInvitations.filter(\.selected).count {
                        Text(String(format: AppLocalization.string("%d places still open"), poll.targetCount - poll.allInvitations.filter(\.selected).count))
                            .font(.subheadline).foregroundStyle(SideSeatTheme.textSecondaryStrong)
                    }
                    Divider()
                    Label(calendarExplanation, systemImage: poll.planningPhase == "CONFIRMED" && included ? "calendar.badge.checkmark" : "info.circle")
                        .font(.footnote).foregroundStyle(SideSeatTheme.textSecondaryStrong)
                        .fixedSize(horizontal: false, vertical: true).accessibilityIdentifier("unified-plan-calendar-status")
                    if poll.planningPhase == "INVITING", mine != nil {
                        Button { draftName = poll.myDisplayName; showsName = true } label: { Label("Edit nickname", systemImage: "pencil") }
                            .font(.subheadline).frame(minHeight: 44).accessibilityIdentifier("time-poll-edit-name")
                    }
                }.padding(SideSeatTheme.spaceLG)
                    .background(SideSeatTheme.surface, in: RoundedRectangle(cornerRadius: SideSeatTheme.cardRadius))
                if !poll.isOwner && mine == nil && poll.planningMode != "FIXED" {
                    Text("You are not included in this invitation. Your availability is saved.")
                        .font(.footnote).foregroundStyle(SideSeatTheme.textSecondaryStrong).accessibilityIdentifier("unified-plan-not-included")
                }
                if poll.isOwner && poll.planningPhase == "INVITING" && poll.planningMode != "FIXED" {
                    if poll.allInvitations.contains(where: { $0.selected && $0.status == "DECLINED" }) {
                        Text("Someone can’t attend. Review the time or invitation list before sending a new invitation.")
                            .font(.subheadline.weight(.medium)).fixedSize(horizontal: false, vertical: true)
                            .accessibilityIdentifier("plan-declined-guidance")
                    }
                    Button("Choose another time", action: chooseAnotherTime).frame(minHeight: 44)
                        .accessibilityIdentifier("unified-plan-choose-again")
                    Text("Choosing another time asks everyone to confirm again.")
                        .font(.caption).foregroundStyle(SideSeatTheme.textSecondaryStrong)
                }
            }.padding(SideSeatTheme.spaceMD)
        }
        .background(SideSeatTheme.bgGrouped)
        .safeAreaInset(edge: .bottom, spacing: 0) {
            VStack(alignment: .leading, spacing: SideSeatTheme.spaceSM) {
                if let error = store.error { Text(error).font(.footnote).foregroundStyle(SideSeatTheme.danger) }
                if canReply && mine?.status != "ACCEPTED" {
                    SSPrimaryButton(title: AppLocalization.string("Confirm participation"), isLoading: store.acting, fill: .product,
                                    accessibilityID: "unified-plan-accept") { reply("ACCEPTED") }
                    Button("I can't attend") { reply("DECLINED") }
                        .font(.subheadline).frame(maxWidth: .infinity, minHeight: 44)
                        .disabled(mine?.status == "DECLINED").accessibilityIdentifier("unified-plan-decline")
                } else if poll.planningPhase == "INVITING" && poll.isOwner {
                    Text("Send the link to friends so they can confirm this time.")
                        .font(.caption).foregroundStyle(SideSeatTheme.textSecondaryStrong)
                    PlanShareActions(poll: poll, prominent: true)
                } else if poll.planningPhase == "CONFIRMED" && included {
                    SSPrimaryButton(title: AppLocalization.string("View in Calendar"), fill: .product,
                                    accessibilityID: "plan-view-calendar") { deepLinkRouter.handleAppPath("/home") }
                } else {
                    SSPrimaryButton(title: AppLocalization.string("Back to plans"), fill: .product,
                                    accessibilityID: "plan-done-back") { dismiss() }
                }
            }.padding(SideSeatTheme.spaceMD).background(SideSeatTheme.surface)
                .overlay(alignment: .top) { Divider() }.disabled(store.acting)
        }
        .sheet(isPresented: $showsName) {
            NavigationStack {
                Form {
                    Section("Your name in this plan") {
                        TextField("Your name", text: $draftName).textContentType(.nickname)
                            .accessibilityIdentifier("time-poll-edit-name-field")
                    }
                    if let error = store.error { Text(error).foregroundStyle(SideSeatTheme.danger) }
                }
                .navigationTitle("Edit nickname").navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) { Button("Cancel") { showsName = false }.disabled(store.acting) }
                    ToolbarItem(placement: .confirmationAction) {
                        Button("Save") {
                            Task {
                                await store.mutate("display-name", method: .patch, body: TimePollDisplayNameRequest(displayName: draftName.trimmingCharacters(in: .whitespacesAndNewlines)), session: session)
                                if store.error == nil { showsName = false }
                            }
                        }.disabled(!store.canMutate || draftName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || draftName.count > 60)
                    }
                }
            }.presentationDetents([.medium, .large])
        }
    }
    private var included: Bool { poll.isOwner || mine?.selected == true }
    private var calendarExplanation: String {
        AppLocalization.string(poll.planningPhase == "CANCELLED" ? "This plan is cancelled. Its calendar entries have been removed."
            : poll.planningPhase == "CONFIRMED" ? (included ? "Synced to Sideseat calendars" : "Only invited participants have this plan in their calendars.")
            : "The plan is added to calendars after everyone included confirms.")
    }
    private func reply(_ status: String) {
        Task { await store.mutate("invitation-response", method: .put, body: RespondPollInvitationRequest(status: status, version: poll.invitationVersion ?? 0), session: session) }
    }
}
