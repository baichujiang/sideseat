import SwiftUI

struct PlanParticipationSummary: View {
    @Environment(\.dynamicTypeSize) private var typeSize
    let name: String
    let edit: () -> Void

    var body: some View {
        SSFlowCard(contentSpacing: SideSeatTheme.spaceXS) {
            Text("My participation").font(.caption).foregroundStyle(SideSeatTheme.textSecondaryStrong)
            let layout = typeSize.isAccessibilitySize
                ? AnyLayout(VStackLayout(alignment: .leading, spacing: SideSeatTheme.spaceXS))
                : AnyLayout(HStackLayout(spacing: SideSeatTheme.spaceSM))
            layout {
                Text(name).font(.subheadline.weight(.medium))
                    .fixedSize(horizontal: false, vertical: true)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .accessibilityIdentifier("plan-my-nickname")
                Button(action: edit) {
                    Label("Edit nickname", systemImage: "pencil").font(.subheadline).frame(minHeight: 44)
                }.accessibilityIdentifier("time-poll-edit-name")
            }
        }.accessibilityElement(children: .contain).accessibilityIdentifier("plan-my-participation")
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

    var body: some View {
        NavigationStack {
            Form {
                Section("Activity name") {
                    TextField("Activity name", text: $title).submitLabel(.done)
                        .accessibilityIdentifier("plan-edit-title")
                }
                Section("Location (optional)") {
                    TextField("Location (optional)", text: $location).submitLabel(.done)
                        .accessibilityIdentifier("plan-edit-location")
                }
                Section("Timing") {
                    Label(poll.dates.map { timePollDateLabel($0).replacingOccurrences(of: "\n", with: " ") }.joined(separator: ", "), systemImage: "calendar")
                    Text("Choose the final time on the timetable. Editing these details keeps everyone's availability.")
                        .font(.footnote).foregroundStyle(.secondary)
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

struct PlanNicknameEditor: View {
    @Environment(SessionStore.self) private var session
    @Environment(\.dismiss) private var dismiss
    let poll: NativeTimePoll
    @Bindable var store: TimePollStore
    @State private var name: String
    @State private var showsDiscard = false
    @State private var attemptedSave = false
    private let original: String
    private let savesWithAvailability: Bool

    init(poll: NativeTimePoll, store: TimePollStore) {
        self.poll = poll; self.store = store
        let withAvailability = poll.planningPhase == "COLLECTING"
        let initialName = withAvailability ? store.displayName : poll.myDisplayName
        savesWithAvailability = withAvailability
        original = initialName
        _name = State(initialValue: initialName)
    }

    private var trimmedName: String { name.trimmingCharacters(in: .whitespacesAndNewlines) }
    private var hasChanges: Bool { trimmedName != original }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Your name", text: $name).textContentType(.nickname).submitLabel(.done)
                        .accessibilityIdentifier("time-poll-edit-name-field")
                } header: { Text("Your name in this plan") }
                footer: {
                    Text(savesWithAvailability
                         ? "This nickname is shared when you submit your availability. Your selected times stay unchanged."
                         : "Other participants will see this name.")
                }
                if attemptedSave, let error = store.error { Text(error).foregroundStyle(SideSeatTheme.danger) }
            }
            .scrollDismissesKeyboard(.interactively)
            .navigationTitle("Edit nickname").navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) {
                Button("Cancel") { if hasChanges { showsDiscard = true } else { dismiss() } }.disabled(store.acting)
            } }
            .safeAreaInset(edge: .bottom, spacing: 0) {
                PlanActionButton(title: AppLocalization.string(savesWithAvailability ? "Use nickname" : "Save nickname"),
                                 symbol: "checkmark", kind: .commit, isLoading: store.acting,
                                 accessibilityID: "plan-nickname-save") {
                    if savesWithAvailability {
                        store.displayName = trimmedName; dismiss()
                    } else {
                        attemptedSave = true
                        Task {
                            await store.mutate("display-name", method: .patch,
                                body: TimePollDisplayNameRequest(displayName: trimmedName), session: session)
                            if store.error == nil { dismiss() }
                        }
                    }
                }.disabled(trimmedName.isEmpty || name.count > 60 || !store.canMutate || !hasChanges)
                    .padding(SideSeatTheme.spaceMD).background(SideSeatTheme.surface)
                    .overlay(alignment: .top) { Divider() }
            }
            .confirmationDialog("Discard changes?", isPresented: $showsDiscard, titleVisibility: .visible) {
                Button("Discard changes", role: .destructive) { dismiss() }
                Button("Keep editing", role: .cancel) { }
            }
        }.interactiveDismissDisabled(hasChanges || store.acting).presentationDetents([.medium, .large])
    }
}

struct PlanPeopleView: View {
    @Environment(\.dismiss) private var dismiss
    let poll: NativeTimePoll
    private var collecting: Bool { poll.planningPhase == "COLLECTING" }

    var body: some View {
        NavigationStack {
            List {
                Section {
                    Text(poll.title).font(.headline)
                    Text(collecting
                         ? String(format: AppLocalization.string("%d people responded"), poll.summary.participantCount)
                         : String(format: AppLocalization.string("%d of %d confirmed"), poll.allInvitations.filter { $0.selected && $0.status == "ACCEPTED" }.count, poll.targetCount))
                        .font(.subheadline).foregroundStyle(SideSeatTheme.textSecondaryStrong)
                }
                Section(collecting ? "Availability responses" : "Invitation replies") {
                    if collecting {
                        ForEach(poll.invitationCandidates) { person in
                            row(name: person.displayName, isMe: person.isMe, guest: person.isGuest == true,
                                status: person.didRespond == false ? "Has not filled availability yet" : "Availability submitted",
                                symbol: person.didRespond == false ? "clock" : "checkmark.circle.fill",
                                accepted: person.didRespond != false, identifier: "plan-response-person-\(person.id)")
                        }
                    } else {
                        ForEach(poll.allInvitations) { person in
                            row(name: person.displayName, isMe: person.isMe, guest: person.isGuest == true,
                                status: person.status == "ACCEPTED" ? "Accepted" : person.status == "DECLINED" ? "Declined" : "Awaiting confirmation",
                                symbol: person.status == "ACCEPTED" ? "checkmark.circle.fill" : person.status == "DECLINED" ? "xmark.circle" : "clock",
                                accepted: person.status == "ACCEPTED", identifier: "unified-plan-person-\(person.id)")
                        }
                    }
                }
                if collecting {
                    Section { Text("Filling in free time doesn't confirm attendance.").font(.footnote).foregroundStyle(.secondary) }
                }
            }
            .navigationTitle("Participants and progress").navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .confirmationAction) {
                Button("Done") { dismiss() }.accessibilityIdentifier("plan-people-done")
            } }
            .accessibilityIdentifier("plan-people-list")
        }
    }

    private func row(name: String, isMe: Bool, guest: Bool, status: String, symbol: String, accepted: Bool, identifier: String) -> some View {
        HStack(spacing: SideSeatTheme.spaceMD) {
            Text(String(name.prefix(1)).uppercased()).font(.subheadline.weight(.medium))
                .frame(width: 36, height: 36).background(SideSeatTheme.fillTertiary, in: Circle()).accessibilityHidden(true)
            VStack(alignment: .leading, spacing: SideSeatTheme.spaceXS) {
                Text(name).font(.subheadline.weight(.medium))
                if isMe { Text("You").font(.caption).foregroundStyle(.secondary) }
                else if guest { Text("Guest").font(.caption).foregroundStyle(.secondary) }
                Label(LocalizedStringKey(status), systemImage: symbol).font(.caption)
                    .foregroundStyle(accepted ? SideSeatTheme.statusSuccessText : SideSeatTheme.textSecondaryStrong)
            }
        }.padding(.vertical, SideSeatTheme.spaceXS)
            .accessibilityElement(children: .combine).accessibilityIdentifier(identifier)
    }
}
