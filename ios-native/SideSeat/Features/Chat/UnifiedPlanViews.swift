import SwiftUI

struct ExpiredTimePollView: View {
    let poll: NativeTimePoll
    let store: TimePollStore
    let backToPlans: () -> Void

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: SideSeatTheme.spaceLG) {
                PlanDetailHeading(poll: poll, store: store, statusIdentifier: "unified-plan-phase")
                    .padding(.horizontal, SideSeatTheme.spaceXS)
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
            }.padding(.horizontal, SideSeatTheme.spaceLG).padding(.bottom, SideSeatTheme.spaceLG)
                .frame(maxWidth: .infinity, alignment: .leading)
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

/// Optional invitation settings; selecting the final time sends from the timetable itself.
struct PlanInvitationSettingsView: View {
    @Environment(SessionStore.self) private var session
    @Environment(\.dismiss) private var dismiss
    let poll: NativeTimePoll
    @Bindable var store: TimePollStore
    @Binding var extraInviteeIDs: Set<String>
    @Binding var linkParticipantCount: Int?
    @State private var showsContacts = false
    private var currentPoll: NativeTimePoll { store.poll ?? poll }

    private var extras: [NativeTimePoll.Participant] {
        let respondents = Set(currentPoll.participants.map(\.id))
        return currentPoll.invitationCandidates.filter { !$0.isMe && !respondents.contains($0.id) }
    }
    private var selectedFriends: Int {
        let ownIDs = Set((currentPoll.participants + currentPoll.invitationCandidates).filter(\.isMe).map(\.id))
        return currentPoll.invitationParticipantIDs(adding: extraInviteeIDs).subtracting(ownIDs).count
    }
    private var minimumLinkCount: Int { min(20, max(2, selectedFriends + 1)) }
    private var displayedLinkCount: Int { min(20, max(linkParticipantCount ?? minimumLinkCount, minimumLinkCount)) }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    ForEach(currentPoll.participants) { person in
                        HStack {
                            Text(person.displayName)
                            Spacer(minLength: SideSeatTheme.spaceSM)
                            Image(systemName: "checkmark").foregroundStyle(SideSeatTheme.utilityAction)
                                .accessibilityHidden(true)
                        }.frame(minHeight: 44)
                    }
                    Text("Everyone who submitted availability is invited automatically.")
                        .font(.footnote).foregroundStyle(.secondary)
                } header: { Text("Timetable respondents") }
                Section {
                    ForEach(extras) { person in
                        Button {
                            if extraInviteeIDs.contains(person.id) { extraInviteeIDs.remove(person.id) }
                            else { extraInviteeIDs.insert(person.id) }
                        } label: {
                            HStack {
                                Text(person.displayName).foregroundStyle(SideSeatTheme.textPrimary)
                                Spacer(minLength: SideSeatTheme.spaceSM)
                                Image(systemName: extraInviteeIDs.contains(person.id) ? "checkmark.circle.fill" : "circle")
                            }.frame(minHeight: 44)
                        }.disabled(!store.canMutate || selectedFriends >= 19 && !extraInviteeIDs.contains(person.id))
                            .accessibilityIdentifier("unified-plan-extra-person-\(person.id)")
                            .accessibilityValue(extraInviteeIDs.contains(person.id) ? "Selected" : "Not selected")
                    }
                    if currentPoll.planningPhase == "COLLECTING" {
                        Button("Send plan cards to App friends", systemImage: "person.badge.plus") { showsContacts = true }
                            .disabled(!store.canMutate || selectedFriends >= 19)
                            .accessibilityIdentifier("unified-plan-add-contacts")
                    }
                } header: { Text("Additional invitees") }
                footer: { Text("Select extra invitees here after sending a plan card. Respondents join automatically.") }
                Section {
                    if linkParticipantCount != nil || currentPoll.hasFixedTime || selectedFriends == 0 {
                        Stepper(value: Binding(get: { displayedLinkCount },
                                               set: { linkParticipantCount = $0 }), in: minimumLinkCount...20) {
                            Text(String(format: AppLocalization.string("Plan for %d people, including you"), displayedLinkCount))
                        }.disabled(selectedFriends >= 20).accessibilityIdentifier("unified-plan-link-count")
                        Text("Friends can open this invitation link and confirm the selected time directly. They don't need to fill in availability first.")
                            .font(.footnote).foregroundStyle(.secondary)
                        if !currentPoll.hasFixedTime && selectedFriends > 0 {
                            Button("Only invite selected people") { linkParticipantCount = nil }
                                .accessibilityIdentifier("unified-plan-link-off")
                        }
                    } else {
                        Button("Invite more friends by link") { linkParticipantCount = min(20, max(2, selectedFriends + 2)) }
                            .disabled(selectedFriends >= 19).accessibilityIdentifier("unified-plan-link-on")
                    }
                } header: { Text("Invitation link") }
                if selectedFriends >= 20 {
                    Text("Plans support up to 20 people, including you.").foregroundStyle(SideSeatTheme.danger)
                }
            }
            .navigationTitle("Edit invitation").navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done", systemImage: "checkmark") { dismiss() }.ssToolbarAction()
                        .accessibilityIdentifier("unified-plan-invitation-editor-done")
                }.ssStandaloneAction()
            }
            .sheet(isPresented: $showsContacts) {
                PlanContactInviteSheet(poll: currentPoll) {
                    await store.load(session: session)
                }
            }
        }.tint(SideSeatTheme.utilityAction)
            .accessibilityIdentifier("unified-plan-invitation-editor")
    }
}

struct UnifiedPlanConfirmationView: View {
    @Environment(SessionStore.self) private var session
    @Environment(DeepLinkRouter.self) private var deepLinkRouter
    @Environment(\.dismiss) private var dismiss
    let poll: NativeTimePoll
    @Bindable var store: TimePollStore
    let chooseAnotherTime: () -> Void
    @State private var showsPublish = false
    private var mine: NativeTimePoll.Invitation? { poll.allInvitations.first(where: \.isMe) }
    private var accepted: Int { poll.allInvitations.filter { $0.selected && $0.status == "ACCEPTED" }.count }
    private var presentation: PlanPresentation { poll.presentation(at: Date()) }
    private var canReply: Bool { poll.canReplyToInvitation(at: Date()) }

    var body: some View {
        ScrollViewReader { reader in
        ScrollView {
            VStack(alignment: .leading, spacing: SideSeatTheme.spaceLG) {
                VStack(alignment: .leading, spacing: SideSeatTheme.spaceSM) {
                    PlanDetailHeading(poll: poll, store: store, statusIdentifier: "unified-plan-phase")
                        .padding(.horizontal, SideSeatTheme.spaceSM)
                        .id("plan-detail-start")
                    if let start = poll.chosenStart, let end = poll.chosenEnd {
                        InvitationTimetableView(start: start, end: end, timeZone: poll.timeZone)
                    }
                }
                VStack(alignment: .leading, spacing: SideSeatTheme.spaceSM) {
                    Divider()
                    Text("Invitation replies")
                        .font(.headline).fixedSize(horizontal: false, vertical: true)
                    Text(String(format: AppLocalization.string("%d of %d confirmed"), accepted, poll.targetCount))
                        .font(.subheadline.weight(.medium)).fixedSize(horizontal: false, vertical: true)
                        .accessibilityIdentifier("unified-plan-confirmation-count")
                    ProgressView(value: Double(min(accepted, poll.targetCount)), total: Double(max(1, poll.targetCount)))
                        .tint(SideSeatTheme.utilityAction).accessibilityHidden(true)
                    PlanPeopleView(poll: poll, isInline: true)
                    if poll.planningMode == "FIXED", poll.planningPhase == "INVITING", poll.remainingCount > 0 {
                        Text(String(format: AppLocalization.string("%d places still open"), poll.remainingCount))
                            .font(.subheadline).foregroundStyle(SideSeatTheme.textSecondaryStrong)
                    }
                    Label(calendarExplanation, systemImage: poll.planningPhase == "CONFIRMED" && included ? "calendar.badge.checkmark" : "info.circle")
                        .font(.footnote).foregroundStyle(SideSeatTheme.textSecondaryStrong)
                        .fixedSize(horizontal: false, vertical: true).accessibilityIdentifier("unified-plan-calendar-status")
                }
                if !poll.isOwner && mine == nil && poll.planningMode != "FIXED" {
                    Text("You are not included in this invitation. Your availability is saved.")
                        .font(.footnote).foregroundStyle(SideSeatTheme.textSecondaryStrong).accessibilityIdentifier("unified-plan-not-included")
                }
                if poll.isOwner && poll.planningPhase == "INVITING" && poll.planningMode != "FIXED" {
                    if poll.allInvitations.contains(where: { $0.selected && $0.status == "DECLINED" }) {
                        Text("Someone declined. You can still send the final plan to the people who accepted.")
                            .font(.subheadline.weight(.medium)).fixedSize(horizontal: false, vertical: true)
                            .accessibilityIdentifier("plan-declined-guidance")
                    }
                    Button(action: chooseAnotherTime) { Label("Adjust invitation", systemImage: "calendar.badge.clock") }.frame(minHeight: 44)
                        .accessibilityIdentifier("unified-plan-choose-again")
                    Text("Choosing another time asks everyone to confirm again.")
                        .font(.caption).foregroundStyle(SideSeatTheme.textSecondaryStrong)
                }
            }.padding(.horizontal, SideSeatTheme.spaceMD).padding(.bottom, SideSeatTheme.spaceMD)
        }
        .accessibilityIdentifier("unified-plan-confirmation-scroll")
        .background(SideSeatTheme.bgGrouped)
        .task(id: poll.invitationVersion) {
            reader.scrollTo("plan-detail-start", anchor: .top)
        }
        }
        .safeAreaInset(edge: .bottom, spacing: 0) {
            VStack(alignment: .leading, spacing: SideSeatTheme.spaceSM) {
                if let error = store.error { Text(error).font(.footnote).foregroundStyle(SideSeatTheme.danger) }
                if canReply {
                    Text(presentation.nextStep == .waitForReplies && presentation.viewerHasConfirmed
                        ? AppLocalization.string("Waiting for the organizer to send")
                        : presentation.nextStep.title).font(.caption)
                        .foregroundStyle(SideSeatTheme.textSecondaryStrong).accessibilityIdentifier("plan-next-step")
                    if mine?.status != "ACCEPTED" {
                        PlanActionButton(title: AppLocalization.string("Confirm participation"), symbol: "checkmark.circle", kind: .commit, isLoading: store.acting,
                                         accessibilityID: "unified-plan-accept") { reply("ACCEPTED") }
                    } else {
                        Text(presentation.detail).font(.subheadline).accessibilityIdentifier("unified-plan-accepted-status")
                        if poll.planningPhase == "CONFIRMED" {
                            PlanActionButton(title: AppLocalization.string("View in Calendar"), symbol: "calendar", kind: .navigate,
                                             accessibilityID: "plan-view-calendar") { deepLinkRouter.handleAppPath("/home") }
                        }
                    }
                    PlanActionButton(title: AppLocalization.string("I can't attend"), symbol: "xmark.circle", kind: .decline,
                                     accessibilityID: "unified-plan-decline") { reply("DECLINED") }
                        .disabled(mine?.status == "DECLINED")
                } else if poll.planningPhase == "INVITING" && poll.isOwner {
                    Text("Send whenever you are ready. Pending replies and declines do not hold up this plan.")
                        .font(.caption).foregroundStyle(SideSeatTheme.textSecondaryStrong)
                    PlanActionButton(title: AppLocalization.string("Send final plan"), symbol: "paperplane.fill", kind: .commit,
                                     isLoading: store.acting, accessibilityID: "unified-plan-publish") {
                        showsPublish = true
                    }
                } else if poll.planningPhase == "CONFIRMED" && included {
                    PlanActionButton(title: AppLocalization.string("View in Calendar"), symbol: "calendar", kind: .navigate,
                                    accessibilityID: "plan-view-calendar") { deepLinkRouter.handleAppPath("/home") }
                } else {
                    PlanActionButton(title: AppLocalization.string("Back to plans"), symbol: "list.bullet", kind: .navigate,
                                    accessibilityID: "plan-done-back") { dismiss() }
                }
            }.padding(SideSeatTheme.spaceMD).background(SideSeatTheme.surface)
                .overlay(alignment: .top) { Divider() }.disabled(store.acting)
        }
        .ssActionPrompt(
            isPresented: $showsPublish,
            title: AppLocalization.string("Send final plan?"),
            message: String(format: AppLocalization.string("Send to %d accepted people, including you. Pending and declined people will not be notified."), accepted),
            systemImage: "paperplane.fill",
            accessibilityIdentifier: "unified-plan-publish-prompt"
        ) {
            [
                SSActionPromptAction(id: "unified-plan-publish-cancel", title: AppLocalization.string("Cancel"), role: .cancel) {},
                SSActionPromptAction(id: "unified-plan-publish-confirm", title: AppLocalization.string("Send final plan"), systemImage: "paperplane.fill") {
                    Task { await store.mutate("publish", body: CancelPollPlanRequest(version: poll.invitationVersion ?? 0), session: session) }
                },
            ]
        }
    }
    private var included: Bool { poll.isOwner || (mine?.selected == true && mine?.status == "ACCEPTED") }
    private var calendarExplanation: String {
        if poll.planningMode == "FIXED", !poll.isOwner, mine?.selected != true, poll.remainingCount == 0,
           ["INVITING", "CONFIRMED"].contains(poll.planningPhase), (poll.chosenStart ?? .distantPast) > Date() {
            return AppLocalization.string("This plan is full. Contact the organizer.")
        }
        return AppLocalization.string(poll.planningPhase == "CANCELLED" ? "This plan is cancelled. Its calendar entries have been removed."
            : poll.planningPhase == "CONFIRMED" ? (included ? "Synced to Sideseat calendars" : "Only accepted participants have this plan in their calendars.")
            : "The organizer can send at any time. Only accepted participants are notified and added to calendars.")
    }
    private func reply(_ status: String) {
        Task { await store.mutate("invitation-response", method: .put, body: RespondPollInvitationRequest(status: status, version: poll.invitationVersion ?? 0), session: session) }
    }
}


struct InvitationTimetableView: View {
    let start: Date
    let end: Date
    let timeZone: String
    var isDraft = false
    @ScaledMetric(relativeTo: .caption) private var rowHeight: CGFloat = 44
    @ScaledMetric(relativeTo: .caption2) private var labelWidth: CGFloat = 64

    var body: some View {
        let rows = TimePollInvitationRow.rows(start: start, end: end, timeZone: timeZone)
        let dates = rows.map(\.date).reduce(into: [String]()) { if $0.last != $1 { $0.append($1) } }
        VStack(alignment: .leading, spacing: SideSeatTheme.spaceSM) {
            ForEach(dates, id: \.self) { date in
                let dayRows = rows.filter { $0.date == date }
                let dayStart = max(start, dayRows.first?.start ?? start)
                let dayEnd = min(end, dayRows.last?.end ?? end)
                let dateHeader = VStack(alignment: .leading, spacing: 4) {
                    Text(timePollDateLabel(date).replacingOccurrences(of: "\n", with: " ")).font(.subheadline.weight(.semibold))
                    Text(timePollClockFormatter(timeZone).string(from: dayStart) + " – " + (dayEnd == dayRows.last?.end && dayEnd > dayStart && timePollClockFormatter(timeZone).string(from: dayEnd) == "00:00" ? "24:00" : timePollClockFormatter(timeZone).string(from: dayEnd)))
                        .font(.caption.monospacedDigit()).accessibilityHint(timeZone)
                }
                let legend = HStack(spacing: 6) {
                    RoundedRectangle(cornerRadius: 2).fill(SideSeatTheme.success.opacity(0.26))
                        .overlay { RoundedRectangle(cornerRadius: 2).strokeBorder(SideSeatTheme.utilityAction, lineWidth: 1) }
                        .frame(width: 14, height: 10).accessibilityHidden(true)
                    Text(LocalizedStringKey(isDraft ? "Time already set" : "Invited time"))
                        .font(.caption2).foregroundStyle(SideSeatTheme.textSecondary)
                }.fixedSize().accessibilityElement(children: .combine)
                    .accessibilityIdentifier("plan-invitation-legend")
                VStack(spacing: 0) {
                    ViewThatFits(in: .horizontal) {
                        HStack(alignment: .top, spacing: SideSeatTheme.spaceSM) {
                            dateHeader.fixedSize(horizontal: true, vertical: false)
                            Spacer(minLength: SideSeatTheme.spaceSM)
                            legend
                        }
                        VStack(alignment: .leading, spacing: SideSeatTheme.spaceSM) {
                            dateHeader
                            legend.frame(maxWidth: .infinity, alignment: .trailing)
                        }
                    }.frame(maxWidth: .infinity, alignment: .leading).padding(SideSeatTheme.spaceSM)
                        .id(date)
                    VStack(spacing: 0) {
                        ForEach(dayRows) { row in
                            HStack(spacing: 0) {
                                Text(row.label).font(.caption2.monospacedDigit()).lineLimit(1).minimumScaleFactor(0.7)
                                    .frame(width: labelWidth, height: rowHeight)
                                Rectangle().fill(SideSeatTheme.success.opacity(0.04)).frame(height: rowHeight)
                            }
                            .overlay(alignment: .bottom) { Divider() }
                            .accessibilityElement(children: .ignore)
                            .accessibilityLabel(timePollDateLabel(row.date).replacingOccurrences(of: "\n", with: ", ") + ", " + row.label)
                            .accessibilityValue(AppLocalization.string(row.highlighted ? (isDraft ? "Time already set" : "Invited time") : "Outside the invited time"))
                            .accessibilityAddTraits(row.highlighted ? .isSelected : [])
                            .accessibilityIdentifier("plan-invitation-cell-\(rows.firstIndex(where: { $0.id == row.id }) ?? 0)")
                        }
                    }
                    .overlay(alignment: .topLeading) {
                        if let first = dayRows.firstIndex(where: \.highlighted),
                           let last = dayRows.lastIndex(where: \.highlighted) {
                            let offset = CGFloat(first) + CGFloat(dayRows[first].from)
                            let length = CGFloat(last - first) + CGFloat(dayRows[last].through - dayRows[first].from)
                            HStack(spacing: 0) {
                                Color.clear.frame(width: labelWidth)
                                Rectangle().fill(SideSeatTheme.success.opacity(0.26))
                                    .overlay { Rectangle().strokeBorder(SideSeatTheme.utilityAction, lineWidth: 2) }
                                    .accessibilityHidden(true)
                            }
                            .frame(height: rowHeight * length)
                            .offset(y: rowHeight * offset)
                            .allowsHitTesting(false)
                        }
                    }
                }.background(SideSeatTheme.surface).clipShape(RoundedRectangle(cornerRadius: SideSeatTheme.cardRadius))
                    .overlay { RoundedRectangle(cornerRadius: SideSeatTheme.cardRadius).strokeBorder(SideSeatTheme.separator, lineWidth: 0.5) }
            }
        }.id("invitation-timetable-focus")
    }
}
