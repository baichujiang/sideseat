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

private struct PlanEditorField: View {
    @Environment(\.dynamicTypeSize) private var typeSize
    let title: LocalizedStringKey
    @Binding var text: String
    let accessibilityID: String

    var body: some View {
        let stacked = typeSize.isAccessibilitySize
        let layout = stacked
            ? AnyLayout(VStackLayout(alignment: .leading, spacing: SideSeatTheme.spaceXS))
            : AnyLayout(HStackLayout(alignment: .firstTextBaseline, spacing: SideSeatTheme.spaceMD))
        layout {
            Text(title).foregroundStyle(.secondary).fixedSize(horizontal: !stacked, vertical: true)
            TextField("", text: $text).submitLabel(.done)
                .multilineTextAlignment(stacked ? .leading : .trailing)
                .frame(maxWidth: .infinity)
                .accessibilityLabel(Text(title)).accessibilityIdentifier(accessibilityID)
        }.frame(minHeight: 44)
            .listRowInsets(EdgeInsets(top: stacked ? 8 : 0, leading: 20, bottom: stacked ? 8 : 0, trailing: 20))
    }
}

struct PlanInformationEditor: View {
    @Environment(SessionStore.self) private var session
    @Environment(\.dismiss) private var dismiss
    let poll: NativeTimePoll
    @Bindable var store: TimePollStore
    @State private var title: String
    @State private var location: String
    @State private var showsDiscard = false
    @State private var attemptedSave = false

    init(poll: NativeTimePoll, store: TimePollStore) {
        self.poll = poll; self.store = store
        _title = State(initialValue: poll.title)
        _location = State(initialValue: poll.location ?? "")
    }

    private var trimmedTitle: String { title.trimmingCharacters(in: .whitespacesAndNewlines) }
    private var trimmedLocation: String { location.trimmingCharacters(in: .whitespacesAndNewlines) }
    private var hasChanges: Bool { trimmedTitle != poll.title || trimmedLocation != (poll.location ?? "") }
    private var candidateDates: String {
        let parser = DateFormatter()
        parser.locale = Locale(identifier: "en_US_POSIX"); parser.timeZone = TimeZone(secondsFromGMT: 0); parser.dateFormat = "yyyy-MM-dd"
        let output = DateFormatter()
        output.locale = AppLocalization.selectedLanguage.locale; output.timeZone = parser.timeZone
        output.setLocalizedDateFormatFromTemplate("MMMd")
        return poll.dates.map { key in parser.date(from: key).map { output.string(from: $0) } ?? key }.joined(separator: " · ")
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    PlanEditorField(title: "Activity name", text: $title, accessibilityID: "plan-edit-title")
                    PlanEditorField(title: "Location (optional)", text: $location, accessibilityID: "plan-edit-location")
                    LabeledContent("Candidate dates") {
                        Text(candidateDates)
                            .multilineTextAlignment(.trailing).fixedSize(horizontal: false, vertical: true)
                    }
                    LabeledContent("Time zone", value: poll.timeZone)
                } footer: {
                    Text("Choose the final time on the timetable. Editing these details keeps everyone's availability.")
                }
                if attemptedSave, let error = store.error { Text(error).foregroundStyle(SideSeatTheme.danger) }
            }
            .scrollDismissesKeyboard(.interactively)
            .navigationTitle("Edit plan information").navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) {
                Button("Cancel") { if hasChanges { showsDiscard = true } else { dismiss() } }.disabled(store.acting)
            } }
            .safeAreaInset(edge: .bottom, spacing: 0) {
                PlanActionButton(title: AppLocalization.string("Save changes"), symbol: "checkmark", kind: .commit,
                                 isLoading: store.acting, accessibilityID: "plan-edit-save") {
                    attemptedSave = true
                    Task {
                        await store.mutate("details", method: .patch,
                            body: UpdateTimePollDetailsRequest(title: trimmedTitle, location: trimmedLocation), session: session)
                        if store.error == nil { dismiss() }
                    }
                }.disabled(!hasChanges || trimmedTitle.isEmpty || title.count > 120 || location.count > 200)
                    .padding(SideSeatTheme.spaceMD).background(SideSeatTheme.surface)
                    .overlay(alignment: .top) { Divider() }
            }
            .confirmationDialog("Discard changes?", isPresented: $showsDiscard, titleVisibility: .visible) {
                Button("Discard changes", role: .destructive) { dismiss() }
                Button("Keep editing", role: .cancel) { }
            }
        }.interactiveDismissDisabled(hasChanges || store.acting)
    }
}

struct PlanResponseSummary: View {
    let poll: NativeTimePoll
    let openPeople: () -> Void

    var body: some View {
        Button(action: openPeople) {
            HStack(spacing: SideSeatTheme.spaceSM) {
                Text(String(format: AppLocalization.string("%d people responded"), poll.summary.participantCount))
                    .font(.subheadline.weight(.medium))
                    .accessibilityIdentifier("time-poll-response-count")
                Spacer(minLength: 0)
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
            }.frame(minHeight: 44).contentShape(Rectangle())
        }.buttonStyle(SSActionButtonStyle(horizontalPadding: 0)).foregroundStyle(SideSeatTheme.textPrimary)
            .accessibilityIdentifier("plan-people-open")
    }
}

struct PlanPeopleView: View {
    @Environment(\.dynamicTypeSize) private var typeSize
    @Environment(\.dismiss) private var dismiss
    @Environment(SessionStore.self) private var session
    let poll: NativeTimePoll
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
                        ForEach(poll.allInvitations) { person in
                            row(name: person.displayName, isMe: person.isMe, guest: person.isGuest == true,
                                status: person.status == "ACCEPTED" ? "Accepted" : person.status == "DECLINED" ? "Declined" : "Awaiting confirmation",
                                symbol: person.status == "ACCEPTED" ? "checkmark.circle.fill" : person.status == "DECLINED" ? "xmark.circle" : "clock",
                                accepted: person.status == "ACCEPTED", identifier: "unified-plan-person-\(person.id)")
                            if poll.isOwner && person.needsGuestRecovery == true { recoveryButton(person.id) }
                        }
                    }
                }
                if collecting {
                    Section { Text("Filling in free time doesn't confirm attendance.").font(.footnote).foregroundStyle(.secondary) }
                }
                if let recoveryError { Section { Text(recoveryError).foregroundStyle(SideSeatTheme.danger) } }
            }
            .navigationTitle("Participants and progress").navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .confirmationAction) {
                Button("Done") { dismiss() }.accessibilityIdentifier("plan-people-done")
            } }
            .accessibilityIdentifier("plan-people-list")
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
                        .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { recoveryShare = nil } } }
                }.dynamicTypeSize(typeSize).accessibilityIdentifier("guest-recovery-share")
            }
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
