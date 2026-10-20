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
        }.buttonStyle(.plain).foregroundStyle(SideSeatTheme.textPrimary)
            .accessibilityIdentifier("plan-people-open")
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
