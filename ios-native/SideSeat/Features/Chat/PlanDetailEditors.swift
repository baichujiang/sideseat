import SwiftUI

/// Short values share a row; longer values and accessibility text keep their full width.
struct PlanAdaptiveRow<Leading: View, Trailing: View>: View {
    @Environment(\.dynamicTypeSize) private var typeSize
    let leading: Leading
    let trailing: Trailing

    init(@ViewBuilder leading: () -> Leading, @ViewBuilder trailing: () -> Trailing) {
        self.leading = leading(); self.trailing = trailing()
    }

    var body: some View {
        if typeSize.isAccessibilitySize {
            stacked
        } else {
            ViewThatFits(in: .horizontal) {
                HStack(alignment: .firstTextBaseline, spacing: SideSeatTheme.spaceSM) {
                    leading.fixedSize()
                    Spacer(minLength: SideSeatTheme.spaceSM)
                    trailing.fixedSize()
                }
                stacked
            }
            .fixedSize(horizontal: false, vertical: true)
            .labelStyle(.titleAndIcon)
        }
    }

    private var stacked: some View {
        VStack(alignment: .leading, spacing: SideSeatTheme.spaceXS) {
            leading
            trailing
        }.frame(maxWidth: .infinity, alignment: .leading)
    }
}

/// Edit the visible values in place; no separate information sheet or edit entry.
struct PlanInlineInformation: View {
    @Environment(SessionStore.self) private var session
    let poll: NativeTimePoll
    let store: TimePollStore
    let editable: Bool
    var showsSharing = true
    @Binding var editing: Bool
    @State private var title = ""
    @State private var location = ""
    @FocusState private var focus: Field?
    private enum Field: Hashable { case title, location }

    private var trimmedTitle: String { title.trimmingCharacters(in: .whitespacesAndNewlines) }
    private var trimmedLocation: String { location.trimmingCharacters(in: .whitespacesAndNewlines) }
    private var hasChanges: Bool { trimmedTitle != poll.title || trimmedLocation != (poll.location ?? "") }

    var body: some View {
        VStack(alignment: .leading, spacing: SideSeatTheme.spaceSM) {
            if editing && editable {
                VStack(alignment: .leading, spacing: SideSeatTheme.spaceSM) {
                    VStack(alignment: .leading, spacing: SideSeatTheme.spaceXS) {
                        Text("Activity name")
                            .font(.caption.weight(.semibold)).foregroundStyle(SideSeatTheme.textSecondaryStrong)
                            .accessibilityIdentifier("plan-edit-title-label")
                        TextField("Activity name", text: $title, axis: .vertical)
                            .font(.title2.weight(.semibold)).foregroundStyle(SideSeatTheme.textPrimary).lineLimit(1...3)
                            .focused($focus, equals: .title).submitLabel(.next)
                            .accessibilityIdentifier("plan-edit-title")
                            .onSubmit { focus = .location }
                            .padding(.horizontal, 14).padding(.vertical, 13)
                            .frame(minHeight: 44, alignment: .leading)
                            .background(SSFieldChrome())
                    }
                    VStack(alignment: .leading, spacing: SideSeatTheme.spaceXS) {
                        Text("Location (optional)")
                            .font(.caption.weight(.semibold)).foregroundStyle(SideSeatTheme.textSecondaryStrong)
                            .accessibilityIdentifier("plan-edit-location-label")
                        TextField("Location (optional)", text: $location, axis: .vertical)
                            .font(.subheadline).foregroundStyle(SideSeatTheme.textPrimary).lineLimit(1...3)
                            .focused($focus, equals: .location).submitLabel(.done)
                            .accessibilityIdentifier("plan-edit-location")
                            .onSubmit { save() }
                            .padding(.horizontal, 14).padding(.vertical, 13)
                            .frame(minHeight: 44, alignment: .leading)
                            .background(SSFieldChrome())
                    }
                    ViewThatFits(in: .horizontal) {
                        HStack(spacing: SideSeatTheme.spaceSM) { cancelAction; saveAction }
                            .fixedSize(horizontal: true, vertical: false)
                        VStack(alignment: .trailing, spacing: SideSeatTheme.spaceSM) { cancelAction; saveAction }
                    }
                    .frame(maxWidth: .infinity, alignment: .trailing)
                    .accessibilityElement(children: .contain).accessibilityIdentifier("plan-edit-actions")
                }
                .textFieldStyle(.plain)
                .accessibilityElement(children: .contain).accessibilityIdentifier("plan-information-editor")
            } else {
                PlanDetailHeading(poll: poll, store: store, showsSharing: showsSharing,
                    showsStatus: poll.planningPhase != "COLLECTING" || poll.hasFixedTime,
                    editTitle: editable ? { begin(.title) } : nil,
                    editLocation: editable ? { begin(.location) } : nil)
            }
            Divider()
        }
    }

    private var cancelAction: some View {
        Button("Cancel", systemImage: "xmark") { focus = nil; editing = false }
            .buttonStyle(SSActionButtonStyle(size: .compact))
            .accessibilityIdentifier("plan-edit-cancel")
    }

    private var saveAction: some View {
        Button("Save", systemImage: "checkmark") { save() }
            .buttonStyle(SSActionButtonStyle(prominent: true, size: .compact))
            .disabled(!hasChanges || trimmedTitle.isEmpty || title.count > 120 || location.count > 200 || !store.canMutate)
            .accessibilityIdentifier("plan-edit-save")
    }

    private func begin(_ field: Field) {
        title = poll.title; location = poll.location ?? ""
        editing = true; focus = field
    }

    private func save() {
        guard hasChanges, !trimmedTitle.isEmpty, title.count <= 120, location.count <= 200, store.canMutate else { return }
        focus = nil
        Task {
            await store.mutate("details", method: .patch,
                body: UpdateTimePollDetailsRequest(title: trimmedTitle, location: trimmedLocation), session: session)
            if store.error == nil { editing = false }
        }
    }
}

struct PlanResponseSummary: View {
    let poll: NativeTimePoll
    let openPeople: () -> Void
    private var countLabel: String {
        String(format: AppLocalization.string("%d people responded"), poll.summary.participantCount)
    }

    var body: some View {
        HStack(spacing: SideSeatTheme.spaceMD) {
            Text(countLabel)
                .font(.subheadline.weight(.medium))
                .foregroundStyle(SideSeatTheme.textSecondaryStrong)
                .fixedSize(horizontal: false, vertical: true)
                .dynamicTypeSize(...DynamicTypeSize.accessibility1)
                .accessibilityIdentifier("time-poll-response-count")
            Spacer(minLength: 0)
            Button(action: openPeople) {
                HStack(spacing: 6) {
                    if poll.participants.isEmpty {
                        Image(systemName: "person.2").font(.system(size: 16, weight: .medium))
                    }
                    HStack(spacing: -6) {
                        ForEach(poll.participants.prefix(3)) { person in
                            PlanParticipantAvatar(name: person.displayName)
                                .overlay(Circle().stroke(SideSeatTheme.bg, lineWidth: 2))
                        }
                        if poll.summary.participantCount > 3 {
                            Text("+\(poll.summary.participantCount - 3)").font(.system(size: 12, weight: .medium))
                                .frame(width: 30, height: 30)
                                .background(SideSeatTheme.fillTertiary, in: Circle())
                                .overlay(Circle().stroke(SideSeatTheme.bg, lineWidth: 2))
                                .accessibilityIdentifier("plan-response-overflow")
                        }
                    }
                    Image(systemName: "chevron.right").font(.system(size: 10, weight: .semibold))
                        .accessibilityHidden(true)
                }
            }
            .buttonStyle(SSActionButtonStyle(size: .compact))
            .accessibilityElement(children: .ignore)
            .accessibilityAddTraits(.isButton)
            .accessibilityLabel(countLabel + (poll.summary.participantCount > 3 ? ", +\(poll.summary.participantCount - 3)" : ""))
            .accessibilityIdentifier("plan-people-open")
        }.frame(minHeight: 44)
    }
}

struct PlanPeopleView: View {
    @Environment(\.dynamicTypeSize) private var typeSize
    @Environment(\.dismiss) private var dismiss
    @Environment(SessionStore.self) private var session
    let poll: NativeTimePoll
    var isInline = false
    @State private var recoveryPersonID: String?
    @State private var preparingRecovery = false
    @State private var recoveryError: String?
    @State private var recoveryShare: GuestRecoveryShare?
    @State private var copiedRecovery = false
    private var collecting: Bool { poll.planningPhase == "COLLECTING" }
    private struct GuestRecoveryShare: Identifiable {
        let id: String
        let url: URL
    }

    var body: some View {
        Group {
            if isInline {
                VStack(alignment: .leading, spacing: SideSeatTheme.spaceSM) {
                    invitationRows
                    if let recoveryError { Text(recoveryError).foregroundStyle(SideSeatTheme.danger) }
                }
                .accessibilityElement(children: .contain)
                .accessibilityIdentifier("unified-plan-inline-people")
            } else {
                peopleSheet
            }
        }
        .alert("Recover an old guest response", isPresented: Binding(get: { recoveryPersonID != nil }, set: { if !$0 { recoveryPersonID = nil } }), presenting: recoveryPersonID) { id in
            Button("Generate personal recovery link") {
                recoveryPersonID = nil
                Task { await prepareRecovery(for: id) }
            }.accessibilityIdentifier("guest-recovery-generate")
            Button("Cancel", role: .cancel) { recoveryPersonID = nil }
        } message: { _ in
            Text("Verify who owns this old response, then send the link privately. Their availability and invitation reply will be kept. A new link replaces any unclaimed link; after restoration, only their private key can edit it.")
        }
        .sheet(item: $recoveryShare) { share in
            NavigationStack {
                ScrollView {
                VStack(alignment: .leading, spacing: SideSeatTheme.spaceMD) {
                    Text("Personal recovery link").font(.title2.bold())
                    Text("Send this link only to the person who owns the old response. Anyone holding it can edit that response.")
                        .foregroundStyle(SideSeatTheme.textSecondaryStrong)
                    ShareLink(item: share.url) {
                        PlanActionLabel(title: AppLocalization.string("Share personal recovery link"), symbol: "square.and.arrow.up", kind: .commit, isLoading: false)
                    }.buttonStyle(SSPressButtonStyle()).accessibilityIdentifier("guest-recovery-share-link")
                    PlanActionButton(title: AppLocalization.string(copiedRecovery ? "Copied" : "Copy personal recovery link"), symbol: copiedRecovery ? "checkmark" : "doc.on.doc", kind: .edit, accessibilityID: "guest-recovery-copy") {
                        UIPasteboard.general.string = share.url.absoluteString; copiedRecovery = true
                    }
                }.padding(SideSeatTheme.screenHorizontal)
                }
                    .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done", systemImage: "checkmark") { recoveryShare = nil }.ssToolbarAction() }.ssStandaloneAction() }
            }.dynamicTypeSize(typeSize).accessibilityIdentifier("guest-recovery-share")
        }
    }

    private var peopleSheet: some View {
        NavigationStack {
            List {
                Section {
                    PlanAdaptiveRow {
                        Text(poll.title).font(.headline)
                    } trailing: {
                        Text(collecting
                             ? String(format: AppLocalization.string("%d people responded"), poll.summary.participantCount)
                             : String(format: AppLocalization.string("%d of %d confirmed"), poll.allInvitations.filter { $0.selected && $0.status == "ACCEPTED" }.count, poll.targetCount))
                            .font(.subheadline).foregroundStyle(SideSeatTheme.textSecondaryStrong)
                    }
                }
                Section(collecting ? "Availability responses" : "Invitation replies") {
                    if collecting {
                        ForEach(poll.invitationCandidates) { person in
                            row(name: person.displayName, isMe: person.isMe, guest: person.isGuest == true,
                                status: person.didRespond == false ? "Has not filled availability yet" : "Availability submitted",
                                symbol: person.didRespond == false ? "clock" : "checkmark.circle.fill",
                                accepted: person.didRespond != false, identifier: "plan-response-person-\(person.id)")
                            if poll.isOwner && person.needsGuestRecovery == true { recoveryButton(person.id) }
                        }
                    } else {
                        invitationRows
                    }
                }
                if collecting {
                    Section { Text("Filling in free time doesn't confirm attendance.").font(.footnote).foregroundStyle(.secondary) }
                }
                if let recoveryError { Section { Text(recoveryError).foregroundStyle(SideSeatTheme.danger) } }
            }
            .navigationTitle("Participants and progress").navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .confirmationAction) {
                Button("Done", systemImage: "checkmark") { dismiss() }.ssToolbarAction().accessibilityIdentifier("plan-people-done")
            }.ssStandaloneAction() }
            .accessibilityIdentifier("plan-people-list")
        }
    }

    private var invitationRows: some View {
        ForEach(poll.allInvitations) { person in
            row(name: person.displayName, isMe: person.isMe, guest: person.isGuest == true,
                status: person.status == "ACCEPTED" ? "Accepted" : person.status == "DECLINED" ? "Declined" : "Awaiting confirmation",
                symbol: person.status == "ACCEPTED" ? "checkmark.circle.fill" : person.status == "DECLINED" ? "xmark.circle" : "clock",
                accepted: person.status == "ACCEPTED", identifier: "unified-plan-person-\(person.id)")
            if poll.isOwner && person.needsGuestRecovery == true { recoveryButton(person.id) }
            if isInline && person.id != poll.allInvitations.last?.id { Divider() }
        }
    }

    private func recoveryButton(_ id: String) -> some View {
        Button {
            recoveryError = nil
            recoveryPersonID = id
        } label: {
            Label("Recover old guest response", systemImage: "key.horizontal")
                .font(.subheadline).frame(minHeight: 44)
        }.disabled(preparingRecovery).accessibilityIdentifier("guest-recovery-\(id)")
    }

    private func prepareRecovery(for id: String) async {
        preparingRecovery = true
        defer { preparingRecovery = false }
        struct Body: Encodable { let participantId: String }
        struct Result: Decodable { let recoveryUrl: URL }
        do {
            let response: APIEnvelope<Result> = try await session.sendAuthorized(
                "api/v1/time-polls/\(poll.token)/guest-recovery", method: .post, body: Body(participantId: id))
            copiedRecovery = false
            recoveryShare = GuestRecoveryShare(id: id, url: response.data.recoveryUrl)
        } catch { recoveryError = error.localizedDescription }
    }

    private func row(name: String, isMe: Bool, guest: Bool, status: String, symbol: String, accepted: Bool, identifier: String) -> some View {
        HStack(spacing: SideSeatTheme.spaceMD) {
            PlanParticipantAvatar(name: name, size: 36)
            PlanAdaptiveRow {
                HStack(alignment: .firstTextBaseline, spacing: SideSeatTheme.spaceXS) {
                    Text(name).font(.subheadline.weight(.medium))
                    if isMe { Text("You").font(.caption).foregroundStyle(.secondary) }
                    else if guest { Text("Guest").font(.caption).foregroundStyle(.secondary) }
                }
            } trailing: {
                Label(LocalizedStringKey(status), systemImage: symbol).font(.caption)
                    .foregroundStyle(accepted ? SideSeatTheme.statusSuccessText : SideSeatTheme.textSecondaryStrong)
            }
        }.padding(.vertical, SideSeatTheme.spaceXS)
            .accessibilityElement(children: .combine).accessibilityIdentifier(identifier)
    }
}

private struct PlanParticipantAvatar: View {
    let name: String
    var size: CGFloat = 30

    var body: some View {
        Text(String(name.prefix(1)).uppercased()).font(.system(size: size * 0.4, weight: .medium))
            .frame(width: size, height: size)
            .background(SideSeatTheme.fillTertiary, in: Circle()).accessibilityHidden(true)
    }
}
