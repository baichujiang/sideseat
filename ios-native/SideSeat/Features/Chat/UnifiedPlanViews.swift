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
    let range: TimePollFinalRange
    @Binding var selected: Set<String>
    @Binding var activityID: String?
    @Binding var linkParticipantCount: Int?
    @State private var sending = false

    init(poll: NativeTimePoll, store: TimePollStore, range: TimePollFinalRange, selected: Binding<Set<String>>, activityID: Binding<String?>, linkParticipantCount: Binding<Int?>) {
        self.poll = poll; self.store = store; self.range = range
        _selected = selected
        _activityID = activityID
        _linkParticipantCount = linkParticipantCount
    }

    private var needsActivityChoice: Bool { poll.activitySelection?.isOpen == true }
    private var activityIdeas: [NativePlanActivity.Idea] { poll.activitySelection?.ideas ?? [] }
    private var chosenActivity: NativePlanActivity.Idea? { activityIdeas.first { $0.id == activityID } }
    private var selectedFriends: Int { poll.participants.filter { !$0.isMe && selected.contains($0.id) }.count }
    private var hasFriends: Bool { poll.participants.contains { !$0.isMe } }
    private var minimumLinkCount: Int { min(20, max(2, selectedFriends + 2)) }
    private var reviewLocation: String? {
        if let chosenActivity { return chosenActivity.location }
        return poll.location
    }

    private var rangeIds: Set<Int> {
        Set(poll.slots.filter { $0.date == range.date && $0.start >= range.start && $0.end <= range.end }.map(\.id))
    }
    private func available(_ person: NativeTimePoll.Participant) -> Bool {
        !rangeIds.isEmpty && rangeIds.isSubset(of: Set(person.slotIds))
    }

    var body: some View {
        NavigationStack {
            Form {
                Section(chosenActivity?.title ?? poll.title) {
                    Text(unifiedPlanTimeLabel(start: range.start, end: range.end, timeZone: poll.timeZone))
                        .accessibilityIdentifier("unified-plan-chosen-range")
                    if let location = reviewLocation, !location.isEmpty { Label(location, systemImage: "mappin.and.ellipse") }
                }
                if needsActivityChoice {
                    Section {
                        ForEach(activityIdeas) { idea in
                            Button { activityID = idea.id } label: {
                                HStack {
                                    Image(systemName: activityID == idea.id ? "checkmark.circle.fill" : "circle")
                                    VStack(alignment: .leading, spacing: SideSeatTheme.spaceXS) {
                                        Text(idea.title).foregroundStyle(SideSeatTheme.textPrimary)
                                        if let location = idea.location, !location.isEmpty {
                                            Text(location).font(.caption).foregroundStyle(.secondary)
                                        }
                                    }
                                }.frame(minHeight: 44)
                            }.disabled(sending || store.acting)
                                .accessibilityIdentifier("unified-plan-activity-\(idea.id)")
                                .accessibilityValue(activityID == idea.id ? "Selected" : "Not selected")
                        }
                        if activityIdeas.isEmpty {
                            Text("Add an activity idea in the plan before sending invitations.")
                                .font(.footnote).foregroundStyle(.secondary)
                        }
                    } header: { Text("Choose the activity to invite people to") }
                    footer: { Text("Your activity choice is saved when you send invitations.") }
                }
                Section("Final time") {
                    LabeledContent("Time zone", value: poll.timeZone)
                    Button { dismiss() } label: { Label("Adjust time", systemImage: "pencil") }
                        .accessibilityIdentifier("unified-plan-adjust-time")
                }
                if hasFriends { Section("Choose who to invite") {
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
                } }
                Section {
                    if linkParticipantCount != nil {
                        Stepper(value: Binding(get: { linkParticipantCount ?? minimumLinkCount }, set: { linkParticipantCount = $0 }), in: minimumLinkCount...20) {
                            Text(String(format: AppLocalization.string("Plan for %d people, including you"), linkParticipantCount ?? minimumLinkCount))
                        }.accessibilityIdentifier("unified-plan-link-count")
                        Text("Friends can open this invitation link and confirm the selected time directly. They don't need to fill in availability first.")
                            .font(.footnote).foregroundStyle(.secondary)
                        if selectedFriends > 0 {
                            Button("Only invite selected people") { linkParticipantCount = nil }
                                .accessibilityIdentifier("unified-plan-link-off")
                        }
                    } else {
                        Button("Invite more friends by link") { linkParticipantCount = minimumLinkCount }
                            .disabled(selectedFriends >= 19).accessibilityIdentifier("unified-plan-link-on")
                    }
                } header: { Text("Invite friends") }
                if let error = store.error { Section { Text(error).foregroundStyle(SideSeatTheme.danger) } }
            }
            .safeAreaInset(edge: .bottom, spacing: 0) {
                VStack(alignment: .leading, spacing: SideSeatTheme.spaceSM) {
                    Text(String(format: AppLocalization.string(linkParticipantCount == nil ? "Inviting %d people, including you" : "Plan for %d people, including you"), linkParticipantCount ?? (selectedFriends + 1)))
                        .font(.subheadline.weight(.semibold))
                    Text("Sending confirms your participation. Everyone else confirms from the link.")
                        .font(.caption).foregroundStyle(SideSeatTheme.textSecondaryStrong)
                    PlanActionButton(title: AppLocalization.string(linkParticipantCount == nil ? "Send invitations" : "Create invitation link"), symbol: "paperplane.fill", kind: .commit, isLoading: sending || store.acting,
                                    accessibilityID: "unified-plan-send-invitations") {
                        Task {
                            sending = true
                            defer { sending = false }
                            if needsActivityChoice {
                                guard let activityID else { return }
                                await store.mutate("activities/choose", body: ChoosePlanActivityRequest(ideaId: activityID), session: session)
                                guard store.error == nil else { return }
                            }
                            await store.mutate("invitations", body: SendPollInvitationsRequest(start: ISO8601DateFormatter().string(from: range.start), end: ISO8601DateFormatter().string(from: range.end), attendeeIds: selected.sorted(), version: poll.invitationVersion ?? 0, linkParticipantCount: linkParticipantCount), session: session)
                            if store.error == nil && store.poll?.planningPhase == "INVITING" { dismiss() }
                        }
                    }
                    .disabled(sending || !store.canMutate || (needsActivityChoice && chosenActivity == nil)
                              || (linkParticipantCount == nil && selectedFriends == 0))
                }.padding(SideSeatTheme.spaceMD).background(SideSeatTheme.surface).overlay(alignment: .top) { Divider() }
            }
            .navigationTitle(hasFriends ? "Confirm invitation list" : "Review invitation").navigationBarTitleDisplayMode(.inline)
            .onChange(of: selected) { _, _ in
                if let count = linkParticipantCount { linkParticipantCount = max(count, minimumLinkCount) }
            }
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Back to timetable") { dismiss() }.disabled(sending || store.acting) } }
        }.tint(SideSeatTheme.utilityAction).interactiveDismissDisabled(sending || store.acting)
    }
}

struct UnifiedPlanConfirmationView: View {
    @Environment(SessionStore.self) private var session
    @Environment(DeepLinkRouter.self) private var deepLinkRouter
    @Environment(\.dismiss) private var dismiss
    @Environment(\.dynamicTypeSize) private var typeSize
    let poll: NativeTimePoll
    @Bindable var store: TimePollStore
    let chooseAnotherTime: () -> Void
    @State private var showsName = false
    @State private var showsPeople = false
    @State private var draftName = ""
    private var mine: NativeTimePoll.Invitation? { poll.allInvitations.first(where: \.isMe) }
    private var accepted: Int { poll.allInvitations.filter { $0.selected && $0.status == "ACCEPTED" }.count }
    private var presentation: PlanPresentation { poll.presentation(at: Date()) }
    private var canReply: Bool {
        poll.planningPhase == "INVITING" && !poll.isOwner && (mine?.selected == true
            || poll.planningMode == "FIXED" && accepted < poll.targetCount && (mine == nil || mine?.status == "DECLINED"))
    }

    var body: some View {
        ScrollViewReader { reader in
        ScrollView {
            VStack(alignment: .leading, spacing: SideSeatTheme.spaceLG) {
                PlanDetailHeading(poll: poll, statusIdentifier: "unified-plan-phase")
                    .id("plan-detail-start")
                if let start = poll.chosenStart, let end = poll.chosenEnd {
                    InvitationTimetableView(start: start, end: end, timeZone: poll.timeZone, needsConfirmation: canReply && mine?.status != "ACCEPTED")
                }
                VStack(alignment: .leading, spacing: SideSeatTheme.spaceSM) {
                    Divider()
                    let layout = typeSize.isAccessibilitySize
                        ? AnyLayout(VStackLayout(alignment: .leading, spacing: SideSeatTheme.spaceXS))
                        : AnyLayout(HStackLayout(alignment: .center, spacing: SideSeatTheme.spaceSM))
                    layout {
                        Text(String(format: AppLocalization.string("%d of %d confirmed"), accepted, poll.targetCount))
                            .font(.subheadline.weight(.medium)).fixedSize(horizontal: false, vertical: true)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .accessibilityIdentifier("unified-plan-confirmation-count")
                        Button { showsPeople = true } label: {
                            Label("Who's joining?", systemImage: "person.2").font(.subheadline).frame(minHeight: 44)
                        }.accessibilityIdentifier("plan-people-open")
                    }
                    ProgressView(value: Double(min(accepted, poll.targetCount)), total: Double(max(1, poll.targetCount)))
                        .tint(SideSeatTheme.utilityAction).accessibilityHidden(true)
                    if poll.planningMode == "FIXED", poll.planningPhase == "INVITING", poll.targetCount > poll.allInvitations.filter(\.selected).count {
                        Text(String(format: AppLocalization.string("%d places still open"), poll.targetCount - poll.allInvitations.filter(\.selected).count))
                            .font(.subheadline).foregroundStyle(SideSeatTheme.textSecondaryStrong)
                    }
                    Label(calendarExplanation, systemImage: poll.planningPhase == "CONFIRMED" && included ? "calendar.badge.checkmark" : "info.circle")
                        .font(.footnote).foregroundStyle(SideSeatTheme.textSecondaryStrong)
                        .fixedSize(horizontal: false, vertical: true).accessibilityIdentifier("unified-plan-calendar-status")
                    if poll.planningPhase == "INVITING", mine != nil {
                        Button { draftName = poll.myDisplayName; showsName = true } label: { Label("Edit nickname", systemImage: "pencil") }
                            .font(.subheadline).frame(minHeight: 44).accessibilityIdentifier("time-poll-edit-name")
                    }
                }
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
                    Button(action: chooseAnotherTime) { Label("Choose another time", systemImage: "calendar.badge.clock") }.frame(minHeight: 44)
                        .accessibilityIdentifier("unified-plan-choose-again")
                    Text("Choosing another time asks everyone to confirm again.")
                        .font(.caption).foregroundStyle(SideSeatTheme.textSecondaryStrong)
                }
            }.padding(SideSeatTheme.spaceMD)
        }
        .background(SideSeatTheme.bgGrouped)
        .task(id: poll.invitationVersion) {
            reader.scrollTo("plan-detail-start", anchor: .top)
        }
        }
        .safeAreaInset(edge: .bottom, spacing: 0) {
            VStack(alignment: .leading, spacing: SideSeatTheme.spaceSM) {
                if let error = store.error { Text(error).font(.footnote).foregroundStyle(SideSeatTheme.danger) }
                if canReply && mine?.status != "ACCEPTED" {
                    Text(presentation.nextStep.title).font(.caption)
                        .foregroundStyle(SideSeatTheme.textSecondaryStrong).accessibilityIdentifier("plan-next-step")
                    PlanActionButton(title: AppLocalization.string("Confirm participation"), symbol: "checkmark.circle", kind: .commit, isLoading: store.acting,
                                    accessibilityID: "unified-plan-accept") { reply("ACCEPTED") }
                    PlanActionButton(title: AppLocalization.string("I can't attend"), symbol: "xmark.circle", kind: .decline,
                                     accessibilityID: "unified-plan-decline") { reply("DECLINED") }
                        .disabled(mine?.status == "DECLINED")
                } else if poll.planningPhase == "INVITING" && poll.isOwner {
                    Text("Send the link to friends so they can confirm this time.")
                        .font(.caption).foregroundStyle(SideSeatTheme.textSecondaryStrong)
                    PlanShareActions(poll: poll)
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
        .sheet(isPresented: $showsPeople) {
            NavigationStack {
                Form {
                    Section {
                        Text(String(format: AppLocalization.string("%d of %d confirmed"), accepted, poll.targetCount))
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
                                if person.isMe { Text("You").font(.caption).foregroundStyle(.secondary) }
                                else if person.isGuest == true { Text("Guest").font(.caption).foregroundStyle(.secondary) }
                            }.accessibilityIdentifier("unified-plan-person-\(person.id)")
                        }
                    }
                }
                .navigationTitle("Who's joining?").navigationBarTitleDisplayMode(.inline)
                .toolbar { ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { showsPeople = false }.accessibilityIdentifier("plan-people-done")
                } }
            }.dynamicTypeSize(typeSize)
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


private struct InvitationTimetableView: View {
    let start: Date
    let end: Date
    let timeZone: String
    let needsConfirmation: Bool
    @ScaledMetric(relativeTo: .caption) private var rowHeight: CGFloat = 44
    @ScaledMetric(relativeTo: .caption2) private var labelWidth: CGFloat = 64

    var body: some View {
        let rows = TimePollInvitationRow.rows(start: start, end: end, timeZone: timeZone)
        let dates = rows.map(\.date).reduce(into: [String]()) { if $0.last != $1 { $0.append($1) } }
        VStack(alignment: .leading, spacing: SideSeatTheme.spaceSM) {
            VStack(alignment: .leading, spacing: SideSeatTheme.spaceSM) {
                Text("Invited timetable").font(.subheadline.weight(.semibold))
            }.id("invitation-timetable-focus")
            Text(LocalizedStringKey(needsConfirmation ? "The highlighted time is the invitation. Review it, then confirm participation below." : "Highlighted cells show the final activity time."))
                .font(.caption).foregroundStyle(SideSeatTheme.textSecondaryStrong)
            ForEach(dates, id: \.self) { date in
                let dayRows = rows.filter { $0.date == date }
                let dayStart = max(start, dayRows.first?.start ?? start)
                let dayEnd = min(end, dayRows.last?.end ?? end)
                VStack(spacing: 0) {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(timePollDateLabel(date).replacingOccurrences(of: "\n", with: " ")).font(.subheadline.weight(.semibold))
                        Text(timePollClockFormatter(timeZone).string(from: dayStart) + " – " + (dayEnd == dayRows.last?.end && dayEnd > dayStart && timePollClockFormatter(timeZone).string(from: dayEnd) == "00:00" ? "24:00" : timePollClockFormatter(timeZone).string(from: dayEnd)))
                            .font(.caption.monospacedDigit())
                        Text(timeZone).font(.caption2).foregroundStyle(SideSeatTheme.textSecondaryStrong)
                    }.frame(maxWidth: .infinity, alignment: .leading).padding(SideSeatTheme.spaceSM)
                        .id(date)
                    ForEach(dayRows) { row in
                        HStack(spacing: 0) {
                            Text(row.label).font(.caption2.monospacedDigit()).lineLimit(1).minimumScaleFactor(0.7)
                                .frame(width: labelWidth, height: rowHeight)
                            GeometryReader { geometry in
                                ZStack(alignment: .top) {
                                    Rectangle().fill(SideSeatTheme.success.opacity(0.04))
                                    if row.highlighted {
                                        Rectangle().fill(SideSeatTheme.success.opacity(0.26))
                                            .overlay { Rectangle().strokeBorder(SideSeatTheme.utilityAction, lineWidth: 2) }
                                            .overlay {
                                                if row.through - row.from >= 0.5 {
                                                    Label("Invited time", systemImage: "calendar")
                                                        .font(.caption2.weight(.semibold)).foregroundStyle(SideSeatTheme.textPrimary)
                                                }
                                            }
                                            .frame(height: geometry.size.height * (row.through - row.from))
                                            .offset(y: geometry.size.height * row.from)
                                    }
                                }
                            }.frame(height: rowHeight)
                        }
                        .overlay(alignment: .bottom) { Divider() }
                        .accessibilityElement(children: .ignore)
                        .accessibilityLabel(timePollDateLabel(row.date).replacingOccurrences(of: "\n", with: ", ") + ", " + row.label)
                        .accessibilityValue(AppLocalization.string(row.highlighted ? "Invited time" : "Outside the invited time"))
                        .accessibilityAddTraits(row.highlighted ? .isSelected : [])
                        .accessibilityIdentifier("plan-invitation-cell-\(rows.firstIndex(where: { $0.id == row.id }) ?? 0)")
                    }
                }.background(SideSeatTheme.surface).clipShape(RoundedRectangle(cornerRadius: SideSeatTheme.cardRadius))
                    .overlay { RoundedRectangle(cornerRadius: SideSeatTheme.cardRadius).strokeBorder(SideSeatTheme.separator, lineWidth: 0.5) }
            }
        }
    }
}
