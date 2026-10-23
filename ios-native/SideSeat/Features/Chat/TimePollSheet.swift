import Combine
import SwiftUI
import UIKit

struct TimePollSheet: View {
    @Environment(SessionStore.self) private var session
    @Environment(\.dismiss) private var dismiss
    @State private var polls: [NativeTimePollList.Item] = []
    @State private var openToken: String?
    @State private var showsCreate = false
    @State private var showsOpen = false
    @State private var link = ""
    @State private var error: String?
    @State private var loading = true
    let initialToken: String?
    let initiallyCreating: Bool

    init(initialToken: String? = nil, initiallyCreating: Bool = false) { self.initialToken = initialToken; self.initiallyCreating = initiallyCreating }

    var body: some View {
        NavigationStack {
            if initiallyCreating {
                if let openToken {
                    TimePollDetailView(token: openToken)
                        .toolbar {
                            ToolbarItem(placement: .confirmationAction) {
                                Button("Done", systemImage: "checkmark") { dismiss() }.ssToolbarAction()
                            }.ssStandaloneAction()
                        }
                } else {
                    TimePollCreateView { poll in openToken = poll.token }
                }
            } else {
                pollList
            }
        }.tint(SideSeatTheme.utilityAction)
    }

    private var pollList: some View {
        List {
            Section {
                Button { showsCreate = true } label: { Label("Create a plan", systemImage: "plus") }
                    .accessibilityIdentifier("time-poll-create")
                Button { showsOpen = true } label: { Label("Open a poll link", systemImage: "link") }
            }
            Section("Your plans") {
                if loading { ProgressView() }
                if polls.isEmpty && !loading { Text("Create a poll and invite people to mark their free time.").foregroundStyle(.secondary) }
                ForEach(polls) { poll in
                    Button { openToken = poll.token } label: {
                        VStack(alignment: .leading, spacing: SideSeatTheme.spaceXS) {
                            Text(poll.title).font(.headline)
                            Text(poll.statusLabel).font(.subheadline).foregroundStyle(.secondary)
                        }.padding(.vertical, SideSeatTheme.spaceXS)
                    }
                    .accessibilityIdentifier("time-poll-recent-\(poll.token)")
                }
            }
            if let error { Section { Text(error).foregroundStyle(SideSeatTheme.danger) } }
        }
        .navigationTitle("Plan together")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done", systemImage: "checkmark") { dismiss() }.ssToolbarAction() }.ssStandaloneAction() }
        .navigationDestination(item: $openToken) { TimePollDetailView(token: $0) }
        .sheet(isPresented: $showsCreate, onDismiss: { Task { await load() } }) {
            NavigationStack {
                TimePollCreateView { poll in
                    openToken = poll.token
                    showsCreate = false
                }
            }.tint(SideSeatTheme.utilityAction)
        }
        .alert("Open a poll link", isPresented: $showsOpen) {
            TextField("Sideseat poll link", text: $link).textInputAutocapitalization(.never).autocorrectionDisabled()
            Button("Open") {
                if let token = TimePollLink.token(from: link) { openToken = token; error = nil }
                else { error = AppLocalization.string("Enter a Sideseat time poll link.") }
            }
            Button("Cancel", role: .cancel) {}
        }
        .refreshable { await load() }
        .task {
            openToken = initialToken
            await load()
        }
        .onChange(of: openToken) { _, token in if token == nil { Task { await load() } } }
    }

    private func load() async {
        do {
            let result: APIEnvelope<NativeTimePollList> = try await session.sendAuthorized("/api/v1/time-polls")
            polls = result.data.polls; error = nil
        } catch { self.error = error.localizedDescription }
        loading = false
    }
}

struct TimePollCreateView: View {
    @Environment(SessionStore.self) private var session
    @Environment(\.dismiss) private var dismiss
    @State private var title = ""
    @State private var location = ""
    @State private var dates: Set<DateComponents>
    @State private var table: TimePollTimetable
    @State private var startMinute = 9 * 60
    @State private var endMinute = 17 * 60
    @State private var chooseActivityTogether = false
    @State private var showsDateOptions = false
    @State private var creating = false
    @State private var error: String?
    @State private var createKey = UUID().uuidString
    @FocusState private var titleFocused: Bool
    @FocusState private var locationFocused: Bool
    private let calendar: Calendar
    let onCreate: (NativeTimePoll) -> Void

    init(onCreate: @escaping (NativeTimePoll) -> Void) {
        self.onCreate = onCreate
        var calendar = Calendar.current; calendar.locale = AppLocalization.selectedLanguage.locale
        self.calendar = calendar
        let dates = Set((1...7).compactMap { calendar.date(byAdding: .day, value: $0, to: Date()) }
            .map { calendar.dateComponents([.calendar, .era, .year, .month, .day], from: $0) })
        _dates = State(initialValue: dates)
        _table = State(initialValue: Self.timetable(dates: dates, from: 540, until: 1020))
    }

    private static func timetable(dates: Set<DateComponents>, from: Int, until: Int) -> TimePollTimetable {
        let formatter = DateFormatter(); formatter.calendar = Calendar(identifier: .gregorian)
        formatter.locale = Locale(identifier: "en_US_POSIX"); formatter.timeZone = .current; formatter.dateFormat = "yyyy-MM-dd"
        let keys = Array(Set(dates.compactMap { Calendar.current.date(from: $0) }.map { formatter.string(from: $0) })).sorted()
        return .init(dates: keys, timeZone: TimeZone.current.identifier, startMinute: from,
                     slots: TimePollTimetable.slots(dates: keys, timeZone: TimeZone.current.identifier, startMinute: from, endMinute: until))
    }
    private var candidateDateSummary: String {
        let values = dates.compactMap { Calendar.current.date(from: $0) }.sorted()
        guard let first = values.first, let last = values.last else { return AppLocalization.string("Choose at least one date.") }
        let formatter = DateIntervalFormatter(); formatter.locale = AppLocalization.selectedLanguage.locale
        formatter.dateTemplate = Calendar.current.component(.year, from: first) == Calendar.current.component(.year, from: Date())
            && Calendar.current.component(.year, from: last) == Calendar.current.component(.year, from: Date()) ? "MMMd" : "yMMMd"
        return formatter.string(from: first, to: last)
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: SideSeatTheme.spaceMD) {
                informationFields
                if showsDateOptions {
                    MultiDatePicker("Choose dates", selection: Binding(get: { dates }, set: {
                        dates = TimePollTimetable.normalizedDates($0, calendar: calendar)
                    }), in: calendar.startOfDay(for: Date())...)
                        .environment(\.calendar, calendar)
                        .accessibilityIdentifier("time-poll-dates")
                    Button("Clear dates") { dates.removeAll() }
                        .buttonStyle(SSActionButtonStyle(size: .compact))
                        .disabled(dates.isEmpty)
                        .accessibilityIdentifier("time-poll-dates-clear")
                        .frame(maxWidth: .infinity)
                }
                if !showsDateOptions {
                    TimePollGrid(table: table, selected: .constant([]), editable: false,
                                 pickingFinalTime: false, finalSelected: .constant([]),
                                 showsResponses: false, bounded: true,
                                 heading: "Voting timetable") {}
                        .padding(.horizontal, -SideSeatTheme.spaceMD)
                }
                Text(table.timeZone).font(.caption).foregroundStyle(SideSeatTheme.textSecondaryStrong)
                if let message = validationMessage { Text(message).font(.caption).foregroundStyle(SideSeatTheme.danger) }
                if let error { Text(error).font(.caption).foregroundStyle(SideSeatTheme.danger) }
            }.padding(SideSeatTheme.spaceMD)
        }.scrollDismissesKeyboard(.interactively).background(SideSeatTheme.bg)
            .navigationTitle("Start a plan").navigationBarTitleDisplayMode(.inline)
            .disabled(creating)
            .toolbar { ToolbarItem(placement: .cancellationAction) {
                Button("Cancel", systemImage: "xmark") { dismiss() }.ssToolbarAction().disabled(creating)
            }.ssStandaloneAction() }
            .safeAreaInset(edge: .bottom, spacing: 0) {
                if !titleFocused && !locationFocused {
                    PlanActionButton(title: AppLocalization.string("Share for availability"),
                                     symbol: "square.and.arrow.up", kind: .commit,
                                     isLoading: creating, accessibilityID: "time-poll-create-confirm") { Task { await create() } }
                        .disabled(!canCreate)
                        .padding(SideSeatTheme.spaceMD).background(SideSeatTheme.surface)
                        .overlay(alignment: .top) { Divider() }
                }
            }
            .onChange(of: dates) { _, _ in rebuildTimetable() }
            .onChange(of: startMinute) { _, _ in rebuildTimetable() }
            .onChange(of: endMinute) { _, _ in rebuildTimetable() }
            .onChange(of: "\(title)|\(location)|\(dates)|\(startMinute)|\(endMinute)|\(chooseActivityTogether)") { _, _ in createKey = UUID().uuidString }
    }

    private func rebuildTimetable() {
        table = Self.timetable(dates: dates, from: startMinute, until: endMinute)
    }

    private func hourPicker(_ label: LocalizedStringKey, selection: Binding<Int>, minutes: ClosedRange<Int>, id: String) -> some View {
        Menu {
            Picker(label, selection: selection) {
                ForEach(Array(stride(from: minutes.lowerBound, through: minutes.upperBound, by: 30)), id: \.self) { Text(clock($0)).tag($0) }
            }.pickerStyle(.inline)
        } label: {
            HStack(spacing: 4) {
                Text(clock(selection.wrappedValue)).monospacedDigit()
                Image(systemName: "chevron.down").font(.caption2)
            }
        }.buttonStyle(SSActionButtonStyle(size: .compact))
            .accessibilityLabel(label).accessibilityValue(clock(selection.wrappedValue)).accessibilityIdentifier(id)
    }

    private var informationFields: some View {
        VStack(alignment: .leading, spacing: 0) {
            TextField("Activity name", text: $title, prompt: Text("Activity name").foregroundStyle(SideSeatTheme.placeholderText))
                .font(.title2.weight(.semibold)).foregroundStyle(SideSeatTheme.textPrimary)
                .focused($titleFocused).submitLabel(.done).onSubmit { titleFocused = false }
                .accessibilityLabel("Activity name").accessibilityIdentifier("time-poll-title")
                .frame(minHeight: 52)
            Divider()
            HStack(spacing: SideSeatTheme.spaceSM) {
                Image(systemName: "mappin.and.ellipse").font(.system(size: 18)).frame(width: 20).foregroundStyle(.secondary).accessibilityHidden(true)
                TextField("Location (optional)", text: $location, prompt: Text("Location (optional)").foregroundStyle(SideSeatTheme.placeholderText))
                    .foregroundStyle(SideSeatTheme.textPrimary)
                    .focused($locationFocused).submitLabel(.done).onSubmit { locationFocused = false }
                    .accessibilityLabel("Location (optional)").accessibilityIdentifier("unified-plan-location")
            }.font(.subheadline).frame(minHeight: 44)
            Divider()
            Button {
                titleFocused = false; locationFocused = false; showsDateOptions.toggle()
            } label: {
                HStack(spacing: SideSeatTheme.spaceSM) {
                    Image(systemName: "calendar").font(.system(size: 18)).frame(width: 20).foregroundStyle(.secondary)
                    PlanAdaptiveRow {
                        Text("Candidate dates").foregroundStyle(SideSeatTheme.textSecondaryStrong)
                    } trailing: {
                        Text(candidateDateSummary).foregroundStyle(SideSeatTheme.textPrimary)
                    }
                    Image(systemName: showsDateOptions ? "chevron.up" : "chevron.down")
                        .font(.system(size: 11, weight: .semibold)).foregroundStyle(.secondary)
                }.font(.subheadline).padding(.vertical, 6).frame(minHeight: 44).contentShape(Rectangle())
            }.buttonStyle(.plain).accessibilityIdentifier("plan-date-options")
                .accessibilityValue(AppLocalization.string(showsDateOptions ? "Expanded" : "Collapsed"))
            Divider()
            HStack(spacing: SideSeatTheme.spaceSM) {
                Image(systemName: "clock").font(.system(size: 18)).frame(width: 20).foregroundStyle(.secondary)
                PlanAdaptiveRow {
                    Text("Daily time range").foregroundStyle(SideSeatTheme.textSecondaryStrong)
                } trailing: {
                    HStack(spacing: 4) {
                        hourPicker("From", selection: $startMinute, minutes: 0...1410, id: "time-poll-from")
                        Text("–").foregroundStyle(SideSeatTheme.textSecondaryStrong)
                        hourPicker("Until", selection: $endMinute, minutes: 30...1440, id: "time-poll-until")
                    }.fixedSize(horizontal: true, vertical: false)
                }
            }.font(.subheadline).frame(minHeight: 44).accessibilityElement(children: .contain).accessibilityIdentifier("plan-create-hours")
            Divider()
            Button {
                chooseActivityTogether.toggle(); titleFocused = false; locationFocused = false
            } label: {
                HStack(spacing: SideSeatTheme.spaceSM) {
                    Image(systemName: chooseActivityTogether ? "checkmark.square.fill" : "square").font(.system(size: 18)).frame(width: 20)
                    Text("Friends can suggest activities").fixedSize(horizontal: false, vertical: true)
                    Spacer(minLength: 0)
                }.font(.subheadline).frame(minHeight: 44).padding(.vertical, 2).contentShape(Rectangle())
            }.buttonStyle(.plain).foregroundStyle(SideSeatTheme.utilityAction)
                .accessibilityIdentifier("plan-start-together")
                .accessibilityValue(AppLocalization.string(chooseActivityTogether ? "Selected" : "Not selected"))
                .accessibilityAddTraits(chooseActivityTogether ? .isSelected : [])
        }.textFieldStyle(.plain).dynamicTypeSize(...DynamicTypeSize.accessibility1)
            .padding(.horizontal, SideSeatTheme.spaceMD).padding(.vertical, 4)
            .background(SideSeatTheme.surface, in: RoundedRectangle(cornerRadius: SideSeatTheme.controlRadius))
            .ssActionOutline()
            .accessibilityElement(children: .contain)
            .accessibilityIdentifier("plan-create-information")
    }
    private var validationMessage: String? {
        if title.count > 120 { return AppLocalization.string("Keep the plan title within 120 characters.") }
        if location.count > 200 { return AppLocalization.string("Keep the location within 200 characters.") }
        if dates.isEmpty { return AppLocalization.string("Choose at least one date.") }
        if dates.count > 31 { return AppLocalization.string("Choose up to 31 dates.") }
        if endMinute <= startMinute { return AppLocalization.string("End time must be after start time.") }
        return nil
    }
    private var canCreate: Bool {
        !creating && !title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && validationMessage == nil
    }
    private func create() async {
        guard canCreate else { return }
        titleFocused = false; locationFocused = false; creating = true; defer { creating = false }
        do {
            let response: APIEnvelope<NativeTimePoll> = try await session.sendAuthorized(
                "/api/v1/time-polls", method: .post,
                body: CreateTimePollRequest(title: title, timeZone: table.timeZone, dates: table.dates,
                    startMinute: startMinute, endMinute: endMinute, location: location, planningMode: "COLLECT",
                    chooseActivityTogether: chooseActivityTogether ? true : nil), idempotencyKey: createKey)
            if let userID = session.currentUser?.id {
                TimePollFinalDraft(selected: [], choosingFinal: false, invitationVersion: 0, next: .share)
                    .save(userID: userID, token: response.data.token)
            }
            onCreate(response.data)
        } catch { self.error = error.localizedDescription }
    }
}

struct TimePollDetailView: View {
    @Environment(SessionStore.self) private var session
    @Environment(\.dismiss) private var dismiss
    @Environment(\.scenePhase) private var scenePhase
    @Environment(\.dynamicTypeSize) private var typeSize
    @State private var store: TimePollStore
    @State private var showsDelete = false
    @State private var showsCancelPlan = false
    @State private var deleting = false
    @State private var showsInvite = false
    @State private var showsPeople = false
    @State private var showsSharing = false
    @State private var restoredFinalDraft = false
    @State private var preparedInvitation = false
    @State private var editingInformation = false
    @State private var editingActivity = false
    @State private var activityDraftTitle = ""
    @State private var pickingFinalTime = false
    @State private var finalSelected = Set<Int>()
    private var finalRange: TimePollFinalRange? {
        guard let poll = store.poll else { return nil }
        if poll.hasFixedTime, let start = poll.chosenStart, let end = poll.chosenEnd { return .init(start: start, end: end) }
        return TimePollFinalRange.selected(finalSelected, slots: poll.finalTimeSlots)
    }
    @State private var invitationRoster = Set<String>()
    @State private var invitationActivityID: String?
    @State private var invitationLinkCount: Int?
    @State private var choosingAgain = false
    @State private var now = Date()

    init(token: String) { _store = State(initialValue: TimePollStore(token: token)) }

    var body: some View {
        VStack(spacing: SideSeatTheme.spaceMD) {
            if let poll = store.poll {
                if poll.planningPhase(at: now) == "EXPIRED" {
                    ExpiredTimePollView(poll: poll) { dismiss() }
                } else if poll.planningPhase == "COLLECTING" || choosingAgain {
                collectionSurface(poll)
                if let error = store.error {
                    HStack {
                        Text(error).font(.caption).foregroundStyle(SideSeatTheme.danger)
                        Button("Retry") { if deleting { Task { await delete() } } else { Task { await store.retry(session: session) } } }
                    }.padding(.horizontal, SideSeatTheme.spaceMD)
                }
                } else {
                    UnifiedPlanConfirmationView(poll: poll, store: store) {
                        choosingAgain = true
                        beginFinalSelection(poll)
                    }
                }
            } else if let error = store.error {
                ContentUnavailableView {
                    Label("Couldn't load the poll", systemImage: "wifi.exclamationmark")
                } description: { Text(error) } actions: { Button("Retry") { Task { await store.load(session: session) } } }
            } else { Spacer(); ProgressView(); Spacer() }
        }
        .padding(.top, SideSeatTheme.spaceSM)
        .background(SideSeatTheme.bg)
        .navigationTitle(pickingFinalTime ? "Choose final time" : "Plan together").navigationBarTitleDisplayMode(.inline)
        .navigationBarBackButtonHidden(pickingFinalTime)
        .safeAreaInset(edge: .bottom, spacing: 0) {
            if let poll = store.poll, !editingInformation && !editingActivity, poll.planningPhase == "COLLECTING" || choosingAgain {
                collectionFooter(poll)
            }
        }
        .toolbar {
            if pickingFinalTime {
                ToolbarItem(placement: .topBarLeading) {
                    Button { cancelFinalSelection() } label: { Label("Back to plan", systemImage: "chevron.left").labelStyle(.iconOnly) }
                        .buttonStyle(SSActionButtonStyle(size: .toolbar))
                        .accessibilityIdentifier("time-poll-cancel-final")
                }.ssStandaloneAction()
            }
            if let poll = store.poll, !editingInformation && !editingActivity {
                ToolbarItem(placement: .topBarTrailing) { PlanShareActions(poll: poll, store: store) }.ssStandaloneAction()
                if poll.isOwner && !pickingFinalTime {
                ToolbarItem(placement: .topBarTrailing) {
                    Menu {
                        if poll.isOwner && ["INVITING", "CONFIRMED"].contains(poll.planningPhase) {
                            Button("Cancel plan", role: .destructive) { showsCancelPlan = true }.accessibilityIdentifier("unified-plan-cancel")
                        }
                        if poll.isOwner && ["COLLECTING", "CANCELLED", "EXPIRED"].contains(poll.planningPhase) { Button("Delete poll", role: .destructive) { showsDelete = true } }
                    } label: { Image(systemName: "ellipsis") }
                    .buttonStyle(SSActionButtonStyle(size: .toolbar)).accessibilityIdentifier("time-poll-menu")
                }.ssStandaloneAction()
                }
            }
        }
        .alert("Cancel this plan for everyone?", isPresented: $showsCancelPlan) {
            Button("Cancel plan", role: .destructive) {
                Task { await store.mutate("cancel", body: CancelPollPlanRequest(version: store.poll?.invitationVersion ?? 0), session: session) }
            }
            Button("Keep plan", role: .cancel) { }
        } message: {
            Text("Everyone will see that this plan is cancelled. Its calendar entries will be removed.")
        }
        .alert("Delete this poll and all responses?", isPresented: $showsDelete) {
            Button("Delete poll", role: .destructive) { Task { await delete() } }
            Button("Keep plan", role: .cancel) { }
        } message: {
            Text("This deletes the plan and everyone's availability responses.")
        }
        .sheet(isPresented: $showsInvite) { if let poll = store.poll, let finalRange { UnifiedPlanInviteView(poll: poll, store: store, range: finalRange, selected: $invitationRoster, activityID: $invitationActivityID, linkParticipantCount: $invitationLinkCount).dynamicTypeSize(typeSize) } }
        .sheet(isPresented: $showsPeople) {
            if let poll = store.poll {
                PlanPeopleView(poll: poll).dynamicTypeSize(typeSize)
            }
        }
        .sheet(isPresented: $showsSharing) {
            if let poll = store.poll { PlanShareSheet(poll: poll, store: store).dynamicTypeSize(typeSize) }
        }
        .onChange(of: finalSelected) { _, _ in persistFinalDraft() }
        .onChange(of: pickingFinalTime) { _, _ in persistFinalDraft() }
        .onChange(of: store.poll?.invitationVersion) { previous, _ in
            guard previous != nil else { return }
            choosingAgain = false; pickingFinalTime = false; finalSelected = []; preparedInvitation = false
            if let userID = session.currentUser?.id {
                UserDefaults.standard.removeObject(forKey: TimePollFinalDraft.key(userID: userID, token: store.token))
            }
        }
        .task {
            await store.load(session: session)
            restoreFinalDraft()
            while !Task.isCancelled {
                do { try await Task.sleep(for: .seconds(10)) } catch { return }
                if scenePhase == .active { await store.load(session: session) }
            }
        }
        .onChange(of: scenePhase) { _, phase in
            if phase == .active { Task { await store.load(session: session) } }
        }
        .onReceive(Timer.publish(every: 1, on: .main, in: .common).autoconnect()) { date in
            if let expiry = store.poll?.expirationDate, now < expiry, expiry <= date { now = date }
        }
    }

    private func editsTimetable(_ poll: NativeTimePoll) -> Bool {
        poll.planningPhase == "COLLECTING" && !poll.hasFixedTime && !choosingAgain && !pickingFinalTime
    }

    private func collectionSurface(_ poll: NativeTimePoll) -> some View {
        ScrollViewReader { reader in
            ScrollView {
                VStack(spacing: SideSeatTheme.spaceMD) {
                    collectionHeader(poll)
                    if poll.hasFixedTime, let start = poll.chosenStart, let end = poll.chosenEnd {
                        InvitationTimetableView(start: start, end: end, timeZone: poll.timeZone, isDraft: true)
                            .padding(.horizontal, SideSeatTheme.spaceMD)
                    } else {
                        PlanResponseSummary(poll: poll) { showsPeople = true }
                            .padding(.horizontal, SideSeatTheme.spaceMD)
                        TimePollGrid(table: poll.timetable, selected: $store.selected, editable: editsTimetable(poll), pickingFinalTime: pickingFinalTime, finalSelected: $finalSelected,
                            chooseNoFreeTime: !poll.didRespond && store.selected.isEmpty ? { store.chooseNoFreeTime() } : nil) {}
                            .disabled(store.acting).allowsHitTesting(!store.acting)
                            .id("plan-timetable")
                    }
                }
            }.scrollDismissesKeyboard(.interactively)
                .accessibilityIdentifier("time-poll-detail-scroll")
                .onChange(of: pickingFinalTime) { _, picking in
                    if picking { reader.scrollTo("plan-timetable", anchor: .top) }
                }
        }
    }

    private func collectionHeader(_ poll: NativeTimePoll) -> some View {
        VStack(alignment: .leading, spacing: SideSeatTheme.spaceSM) {
            PlanInlineInformation(poll: poll, store: store,
                editable: poll.planningPhase == "COLLECTING" && poll.isOwner && poll.activitySelection?.selectedIdeaId == nil,
                editing: $editingInformation)
                .disabled(!store.canMutate)
            if pickingFinalTime {
                Label("Choose the invitation time. Your availability stays unchanged.", systemImage: "calendar.badge.clock")
                    .font(.subheadline).foregroundStyle(SideSeatTheme.statusWarningText)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityIdentifier("plan-final-time-context")
            }
            if poll.activitySelection?.isOpen == true {
                PlanActivityIdeasView(poll: poll, store: store, draftTitle: $activityDraftTitle, showsSuggestion: $editingActivity)
            }
            Text(dateRange(poll) + " · " + poll.timeZone).font(.caption).foregroundStyle(SideSeatTheme.textSecondaryStrong)
                .fixedSize(horizontal: false, vertical: true).accessibilityIdentifier("time-poll-date-range")
        }.padding(.horizontal, SideSeatTheme.spaceMD)
    }

    private func collectionFooter(_ poll: NativeTimePoll) -> some View {
        VStack(alignment: .leading, spacing: SideSeatTheme.spaceSM) {
            if pickingFinalTime {
                FinalTimeControls(slots: poll.finalTimeSlots, timeZone: poll.timeZone, selection: $finalSelected)
                PlanActionButton(title: AppLocalization.string(typeSize.isAccessibilitySize ? "Review invitees" : "Next: review invitation list"), symbol: "person.2", kind: .commit,
                                accessibilityID: "unified-plan-review-roster") { showsInvite = true }
                    .disabled(finalRange == nil || !store.canMutate || poll.activitySelection?.isOpen == true && (poll.activitySelection?.ideas ?? []).isEmpty)
                if poll.activitySelection?.isOpen == true {
                    Button("Share for activity ideas") { showsSharing = true }
                        .buttonStyle(SSActionButtonStyle(size: .compact)).frame(maxWidth: .infinity)
                        .accessibilityIdentifier("plan-share-activity-ideas")
                }
            } else {
                if editsTimetable(poll) {
                    saveStatus(poll)
                    let layout = typeSize.isAccessibilitySize
                        ? AnyLayout(VStackLayout(spacing: SideSeatTheme.spaceSM))
                        : AnyLayout(HStackLayout(spacing: SideSeatTheme.spaceSM))
                    layout {
                        if !store.saved {
                            PlanActionButton(title: AppLocalization.string(poll.didRespond ? "Save changes" : "Submit my availability"), symbol: "checkmark", kind: .commit,
                                             isLoading: store.saving, accessibilityID: "time-poll-submit") {
                                Task { await store.submit(session: session) }
                            }.disabled(!store.hasChanges || store.saving || store.acting)
                        }
                        if poll.isOwner {
                            PlanActionButton(title: AppLocalization.string("Choose final time"), symbol: "calendar.badge.clock", kind: .edit,
                                accessibilityID: "unified-plan-invite-window") { beginFinalSelection(poll) }
                                .disabled(!store.canMutate || poll.slots.isEmpty)
                        }
                    }
                }
                if poll.isOwner && poll.hasFixedTime {
                    PlanActionButton(title: AppLocalization.string(poll.activitySelection?.isOpen == true ? "Choose activity and review invitation" : "Review invitation"), symbol: "person.2", kind: .commit,
                        accessibilityID: "unified-plan-review-fixed") { beginFinalSelection(poll) }
                        .disabled(!store.canMutate || (poll.activitySelection?.isOpen == true && (poll.activitySelection?.ideas ?? []).isEmpty))
                }
                if !poll.isOwner {
                    Text("Wait for the organizer's invitation")
                        .font(.caption).foregroundStyle(SideSeatTheme.textSecondaryStrong)
                        .accessibilityIdentifier("plan-participant-next-step")
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(SideSeatTheme.spaceMD).background(SideSeatTheme.surface)
        .overlay(alignment: .top) { Divider() }
    }

    private func beginFinalSelection(_ poll: NativeTimePoll) {
        if !preparedInvitation {
            preparedInvitation = true
            invitationRoster = Set(poll.invitationCandidates.map(\.id))
            invitationActivityID = poll.activitySelection?.selectedIdeaId
            invitationLinkCount = poll.hasFixedTime ? poll.expectedCount : poll.invitationCandidates.contains(where: { !$0.isMe }) ? nil : 2
            if finalSelected.isEmpty, let start = poll.chosenStart, let end = poll.chosenEnd {
                finalSelected = Set(poll.finalTimeSlots.filter { $0.start >= start && $0.end <= end }.map(\.id))
            }
        }
        if poll.hasFixedTime { showsInvite = true } else { pickingFinalTime = true }
    }

    private func restoreFinalDraft() {
        guard !restoredFinalDraft, let poll = store.poll, let userID = session.currentUser?.id else { return }
        restoredFinalDraft = true
        guard poll.isOwner, poll.planningPhase == "COLLECTING",
              var draft = TimePollFinalDraft.load(userID: userID, token: store.token),
              draft.invitationVersion == (poll.invitationVersion ?? 0) else { return }
        finalSelected = draft.selected.intersection(Set(poll.finalTimeSlots.map(\.id)))
        if draft.choosingFinal { beginFinalSelection(poll) }
        let next = draft.next; draft.next = nil; draft.save(userID: userID, token: store.token)
        if next == .review, finalRange != nil { showsInvite = true }
        if next == .share { showsSharing = true }
    }

    private func persistFinalDraft() {
        guard restoredFinalDraft, let poll = store.poll, poll.isOwner,
              poll.planningPhase == "COLLECTING", let userID = session.currentUser?.id else { return }
        TimePollFinalDraft(selected: finalSelected, choosingFinal: pickingFinalTime,
            invitationVersion: poll.invitationVersion ?? 0).save(userID: userID, token: store.token)
    }

    private func cancelFinalSelection() {
        pickingFinalTime = false
        if choosingAgain { choosingAgain = false }
    }

    private func saveStatus(_ poll: NativeTimePoll) -> some View {
        let failed = store.submissionFailed && !store.saving
        return HStack(spacing: SideSeatTheme.spaceSM) {
            if store.saving { ProgressView().controlSize(.small) }
            else { Image(systemName: failed ? "exclamationmark.circle" : store.saved ? "checkmark.circle.fill" : "circle")
                .foregroundStyle(failed ? SideSeatTheme.danger : store.saved ? SideSeatTheme.statusSuccessText : SideSeatTheme.textSecondaryStrong) }
            Text(store.saving ? "Submitting…" : failed ? "Couldn't submit" : store.saved ? "Availability submitted" : store.restoredDraft ? "Draft restored · not submitted" : "Not submitted")
                .font(.caption.weight(.semibold))
                .foregroundStyle(store.saved ? SideSeatTheme.statusSuccessText : SideSeatTheme.textPrimary)
                .accessibilityIdentifier(store.saved ? "time-poll-saved" : "time-poll-save-state")
            Spacer(minLength: 0)
            Text(failed ? AppLocalization.string("Your choices are kept. Please retry.") : selectionSummary(poll))
                .font(.caption).foregroundStyle(.secondary)
        }
    }

    private func selectionSummary(_ poll: NativeTimePoll) -> String {
        let slots = poll.slots.filter { store.selected.contains($0.id) }
        let hours = slots.reduce(0.0) { $0 + $1.end.timeIntervalSince($1.start) / 3600 }
        let formatter = NumberFormatter(); formatter.locale = AppLocalization.selectedLanguage.locale; formatter.maximumFractionDigits = 2
        return String(format: AppLocalization.string("%d days · %@ hours selected"), Set(slots.map(\.date)).count, formatter.string(from: NSNumber(value: hours)) ?? String(hours))
    }

    private func dateRange(_ poll: NativeTimePoll) -> String {
        let input = DateFormatter(); input.locale = Locale(identifier: "en_US_POSIX"); input.dateFormat = "yyyy-MM-dd"
        let output = DateFormatter(); output.locale = AppLocalization.selectedLanguage.locale; output.setLocalizedDateFormatFromTemplate("MMMd")
        let labels = poll.dates.compactMap { input.date(from: $0).map { output.string(from: $0) } }
        guard let first = labels.first, let last = labels.last else { return "" }
        return labels.count == 1 ? first : "\(first) – \(last)"
    }

    private func delete() async {
        struct Result: Decodable, Sendable { let deleted: Bool }
        deleting = true
        do {
            let _: APIEnvelope<Result> = try await session.sendAuthorized("/api/v1/time-polls/\(store.token)", method: .delete)
            dismiss()
        } catch { store.showError(error) }
    }
}

private struct TimePollGrid: View {
    let table: TimePollTimetable
    @Binding var selected: Set<Int>
    let editable: Bool
    let pickingFinalTime: Bool
    @Binding var finalSelected: Set<Int>
    var showsResponses = true
    var bounded = false
    var heading: LocalizedStringKey? = nil
    var chooseNoFreeTime: (() -> Void)? = nil
    let onSave: () -> Void
    @Environment(\.dynamicTypeSize) private var typeSize
    @State private var dragStart: (Int, Int)?
    @State private var original = Set<Int>()
    @State private var preview: Set<Int>?
    @State private var selecting = true
    @State private var undoSelection: Set<Int>?
    private var selection: Set<Int> { pickingFinalTime ? finalSelected : selected }
    private var cellHeight: CGFloat { typeSize.isAccessibilitySize ? 64 : 44 }
    private var labelWidth: CGFloat { typeSize.isAccessibilitySize ? 120 : 60 }
    private var headerHeight: CGFloat { typeSize.isAccessibilitySize ? (pickingFinalTime || bounded ? 72 : 128) : 48 }
    private var viewportHeight: CGFloat { typeSize.isAccessibilitySize ? 320 : 352 }
    private var gridSlots: [NativeTimePoll.Slot] { pickingFinalTime ? table.finalTimeSlots : table.slots }

    var body: some View {
        let cells = TimePollSelection.cells(gridSlots)
        let rows = table.dates.map { date in cells.filter { $0.date == date } }.max(by: { $0.count < $1.count })?.map(\.row) ?? []
        let lookup = Dictionary(uniqueKeysWithValues: cells.map { ("\($0.date)|\($0.row)", $0) })
        VStack(spacing: SideSeatTheme.spaceSM) {
            if let heading {
                VStack(alignment: .leading, spacing: 4) {
                    HStack(spacing: SideSeatTheme.spaceSM) {
                        Text(heading).font(.subheadline.weight(.semibold)).fixedSize(horizontal: false, vertical: true)
                        Spacer(minLength: 0)
                        if pickingFinalTime && !typeSize.isAccessibilitySize { finalLegendLabels.font(.caption) }
                        if editable || pickingFinalTime { undoButton }
                    }
                    if pickingFinalTime && typeSize.isAccessibilitySize { finalLegendLabels.font(.caption) }
                    Text(editable || pickingFinalTime ? "Tap or hold and drag to select or deselect." : "Friends mark their availability here. Choose the final time after sharing.")
                        .font(.caption2).foregroundStyle(SideSeatTheme.textSecondaryStrong)
                }.dynamicTypeSize(...DynamicTypeSize.xxxLarge).padding(.horizontal, SideSeatTheme.spaceMD)
                    .accessibilityElement(children: .contain)
                    .accessibilityIdentifier("plan-create-timetable-heading")
            } else if pickingFinalTime {
                ViewThatFits(in: .horizontal) {
                    HStack(spacing: SideSeatTheme.spaceMD) { finalLegendLabels }.fixedSize(horizontal: true, vertical: false)
                    VStack(alignment: .leading, spacing: 4) { finalLegendLabels }
                }.font(.caption).dynamicTypeSize(...DynamicTypeSize.xxxLarge)
                    .frame(maxWidth: .infinity, alignment: .leading).padding(.horizontal, SideSeatTheme.spaceMD)
                    .accessibilityIdentifier("time-poll-final-legend")
            }
            GeometryReader { geometry in
                if pickingFinalTime || bounded {
                    finalTimetable(cells: cells, rows: rows, lookup: lookup, width: geometry.size.width)
                } else {
                    timetable(cells: cells, rows: rows, lookup: lookup, width: geometry.size.width)
                }
            }
            .frame(height: headerHeight + (pickingFinalTime || bounded ? viewportHeight - (heading == nil ? 0 : 48) : cellHeight * CGFloat(rows.count)))
            .accessibilityElement(children: .contain).accessibilityIdentifier("time-poll-grid")
            if editable, let chooseNoFreeTime {
                HStack {
                    Spacer(minLength: 0)
                    Button("No free time", action: chooseNoFreeTime)
                        .font(.caption).frame(minHeight: 44).accessibilityIdentifier("time-poll-none")
                }.padding(.horizontal, SideSeatTheme.spaceMD)
            }
        }
        .onChange(of: editable) { _, _ in clearPreview(); undoSelection = nil }
        .onChange(of: pickingFinalTime) { _, _ in clearPreview(); undoSelection = nil }
        .onDisappear { clearPreview() }
    }

    private var finalLegendLabels: some View {
        Group {
            if showsResponses || !selected.isEmpty { Label("My availability", systemImage: "checkmark.circle.fill").foregroundStyle(SideSeatTheme.Availability.selectedFill) }
            Label("Final time", systemImage: "checkmark.square.fill").foregroundStyle(SideSeatTheme.statusWarningText)
            if showsResponses { Label("Availability not collected", systemImage: "minus").foregroundStyle(SideSeatTheme.textSecondaryStrong) }
        }.fixedSize(horizontal: false, vertical: true)
    }

    private func finalTimetable(cells: [NativeTimePoll.Cell], rows: [String], lookup: [String: NativeTimePoll.Cell], width: CGFloat) -> some View {
        let cellWidth = typeSize.isAccessibilitySize ? max(280, width) : max(96, width / CGFloat(max(1, min(4, table.dates.count))))
        return VStack(spacing: 4) {
            if heading == nil {
                HStack {
                    undoButton
                    Spacer(minLength: 0)
                    Text("Tap or hold and drag to select or deselect.").font(.caption2).foregroundStyle(SideSeatTheme.textSecondaryStrong)
                }.dynamicTypeSize(...DynamicTypeSize.xxxLarge).frame(height: 44).padding(.horizontal, SideSeatTheme.spaceSM)
            }
            ScrollView(.horizontal) {
                VStack(spacing: 0) {
                    HStack(spacing: 0) { ForEach(table.dates, id: \.self) { dayButton($0, cells: cells, width: cellWidth) } }
                    ScrollViewReader { reader in
                        ScrollView(.vertical) {
                            cellGrid(cells: cells, rows: rows, lookup: lookup, cellWidth: cellWidth)
                        }.frame(width: cellWidth * CGFloat(table.dates.count), height: viewportHeight - 48)
                            .accessibilityIdentifier("time-poll-final-scroll")
                            .task(id: pickingFinalTime) {
                                await Task.yield()
                                let initial = cells.first { !$0.slotIds.isDisjoint(with: selection) }
                                    ?? cells.first { $0.label == String(format: "%02d:%02d", table.startMinute / 60, table.startMinute % 60) }
                                if let row = initial?.row { reader.scrollTo(row, anchor: .top) }
                            }
                    }
                }
            }
        }
    }

    private func timetable(cells: [NativeTimePoll.Cell], rows: [String], lookup: [String: NativeTimePoll.Cell], width: CGFloat) -> some View {
        let cellWidth = typeSize.isAccessibilitySize ? max(280, width - labelWidth) : max(88, (width - labelWidth) / CGFloat(max(1, min(4, table.dates.count))))
        return HStack(alignment: .top, spacing: 0) {
            VStack(spacing: 0) {
                Group { if editable { undoButton } else { Text("Time").font(.caption) } }
                    .frame(width: labelWidth, height: headerHeight)
                ForEach(rows, id: \.self) { row in
                    Text(table.slots.first { $0.row == row }?.label ?? "")
                        .font(.caption2.monospacedDigit()).lineLimit(1).minimumScaleFactor(0.7)
                        .frame(width: labelWidth, height: cellHeight)
                }
            }
            ScrollView(.horizontal) {
                VStack(spacing: 0) {
                    HStack(spacing: 0) {
                        ForEach(table.dates, id: \.self) { date in
                            if editable { dayButton(date, cells: cells, width: cellWidth) }
                            else { Text(timePollDateLabel(date)).font(.caption.weight(.semibold)).lineLimit(2).minimumScaleFactor(0.75).frame(width: cellWidth, height: headerHeight) }
                        }
                    }
                    cellGrid(cells: cells, rows: rows, lookup: lookup, cellWidth: cellWidth)
                }
            }.frame(width: max(0, width - labelWidth), height: headerHeight + cellHeight * CGFloat(rows.count))
        }
    }

    private var undoButton: some View {
        Button {
            guard let undoSelection else { return }
            apply(undoSelection); self.undoSelection = nil
        } label: { Image(systemName: "arrow.uturn.backward").frame(minWidth: 44, minHeight: 44) }
            .disabled(undoSelection == nil || dragStart != nil)
            .accessibilityLabel("Undo last change")
            .buttonStyle(SSActionButtonStyle(horizontalPadding: 0, size: .icon))
            .accessibilityIdentifier("time-poll-undo")
    }

    private func cellGrid(cells: [NativeTimePoll.Cell], rows: [String], lookup: [String: NativeTimePoll.Cell], cellWidth: CGFloat) -> some View {
        let participantSelections = table.responses
        let clock = timePollClockFormatter(table.timeZone)
        return VStack(spacing: 0) {
            ForEach(rows, id: \.self) { row in
                HStack(spacing: 0) {
                    ForEach(table.dates, id: \.self) { date in
                        if let cell = lookup["\(date)|\(row)"] {
                            cellView(cell, participantSelections: participantSelections, width: cellWidth, clock: clock)
                        } else { Color.clear.frame(width: cellWidth, height: cellHeight) }
                    }
                }.id(row)
            }
        }
        .overlay(alignment: .topLeading) {
            if editable || pickingFinalTime {
                TimePollTouchSurface(onTap: { point in
                    if let p = position(point, rows: rows, cellWidth: cellWidth), let cell = lookup["\(table.dates[p.0])|\(rows[p.1])"] { apply(TimePollSelection.toggle(cell, original: selection)) }
                }, onRange: { state, point in
                    updateRange(state, point: point, cells: cells, rows: rows, cellWidth: cellWidth, lookup: lookup)
                }).accessibilityHidden(true)
            }
        }
    }

    @ViewBuilder
    private func cellView(_ cell: NativeTimePoll.Cell, participantSelections: [Set<Int>], width: CGFloat, clock: DateFormatter) -> some View {
        let known = cell.slotIds.allSatisfy { $0 >= 0 }
        let count = cell.availableCount(in: participantSelections)
        let draft = preview ?? selection
        let active = cell.slotIds.isSubset(of: draft), partial = !active && !cell.slotIds.isDisjoint(with: draft)
        let mine = cell.slotIds.isSubset(of: selected)
        let partlyMine = !mine && !cell.slotIds.isDisjoint(with: selected)
        let final = pickingFinalTime && (active || partial)
        let content = ZStack {
            Rectangle().fill(known ? SideSeatTheme.success.opacity(count == 0 ? 0.06 : 0.14 + 0.42 * Double(count) / Double(max(1, participantSelections.count))) : SideSeatTheme.fillTertiary.opacity(0.4))
            if final { Rectangle().fill(SideSeatTheme.statusWarningText.opacity(active ? 0.23 : 0.1)) }
            Rectangle().strokeBorder(final ? SideSeatTheme.statusWarningText : editable && active ? SideSeatTheme.Availability.selectedFill : editable && partial ? SideSeatTheme.Availability.onPartial : SideSeatTheme.separator,
                lineWidth: final || editable && (active || partial) ? 2 : 0.5)
            VStack(spacing: 1) {
                if pickingFinalTime || bounded { Text(cell.label).font(.caption2.monospacedDigit()).foregroundStyle(SideSeatTheme.textSecondaryStrong) }
                HStack(spacing: 5) {
                    if editable && (active || partial) || pickingFinalTime && (mine || partlyMine) {
                        Image(systemName: pickingFinalTime ? (mine ? "checkmark.circle.fill" : "minus.circle.fill") : active ? "checkmark.circle.fill" : "minus.circle.fill")
                            .foregroundStyle(!editable || active ? SideSeatTheme.Availability.selectedFill : SideSeatTheme.Availability.onPartial)
                    }
                    if showsResponses { Text(known ? "\(count)" : "—").monospacedDigit().foregroundStyle(SideSeatTheme.textPrimary) }
                    if final { Image(systemName: active ? "checkmark.square.fill" : "minus.square.fill").foregroundStyle(SideSeatTheme.statusWarningText) }
                }.font(.caption.weight(.semibold))
            }.dynamicTypeSize(...DynamicTypeSize.xxxLarge)
        }.frame(width: width, height: cellHeight)
            .accessibilityElement()
            .accessibilityLabel("\(cell.date), \(cell.label)–\(clock.string(from: cell.end)), " + (known ? "\(count)" : AppLocalization.string("Availability not collected")))
            .accessibilityValue(AppLocalization.string(pickingFinalTime ? (active ? "Final time selected" : partial ? "Some times selected" : "Select final time") : editable ? (active ? "Available" : partial ? "Some times selected" : "Unavailable") : ""))
            .accessibilityIdentifier("time-poll-cell-\(cell.id)")
            .accessibilityAddTraits(editable || pickingFinalTime ? .isButton : [])
            .accessibilityAddTraits(active && (editable || pickingFinalTime) ? .isSelected : [])
        if editable || pickingFinalTime {
            content.accessibilityAction { apply(TimePollSelection.toggle(cell, original: selection)) }
        } else { content }
    }

    private func dayButton(_ date: String, cells: [NativeTimePoll.Cell], width: CGFloat) -> some View {
        let ids = Set(cells.filter { $0.date == date }.flatMap(\.slotIds))
        let all = !ids.isEmpty && ids.isSubset(of: selection), partial = !all && !ids.isDisjoint(with: selection)
        let color = pickingFinalTime ? SideSeatTheme.statusWarningText : SideSeatTheme.Availability.selectedFill
        return Button { apply(all ? selection.subtracting(ids) : selection.union(ids)) } label: {
            HStack(spacing: 4) {
                Text(timePollDateLabel(date)).multilineTextAlignment(.center).lineLimit(2).minimumScaleFactor(0.75)
                if editable || pickingFinalTime { Image(systemName: all ? "checkmark.circle.fill" : partial ? "minus.circle" : "circle") }
            }.font(.caption.weight(.semibold)).dynamicTypeSize(...DynamicTypeSize.xxxLarge)
                .frame(width: width - 6, height: headerHeight - 4)
                .foregroundStyle(all ? (pickingFinalTime ? SideSeatTheme.textPrimary : SideSeatTheme.Availability.onSelected) : partial ? color : SideSeatTheme.textPrimary)
                .background(all ? color.opacity(pickingFinalTime ? 0.2 : 1) : partial ? color.opacity(0.08) : Color.clear, in: RoundedRectangle(cornerRadius: 8))
                .overlay { RoundedRectangle(cornerRadius: 8).strokeBorder(all || partial ? color : SideSeatTheme.separator, lineWidth: 0.5) }
                .frame(width: width, height: headerHeight).contentShape(Rectangle())
        }.buttonStyle(.plain).disabled(!editable && !pickingFinalTime || ids.isEmpty || dragStart != nil)
            .accessibilityLabel(timePollDateLabel(date).replacingOccurrences(of: "\n", with: ", "))
            .accessibilityValue(editable || pickingFinalTime ? AppLocalization.string(all ? "All times selected" : partial ? "Some times selected" : "No times selected") : "")
            .accessibilityHint(editable || pickingFinalTime ? AppLocalization.string(all ? "Deselect all times for this day" : "Select all times for this day") : "")
            .accessibilityAddTraits(all ? .isSelected : []).accessibilityIdentifier("time-poll-day-\(date)")
    }

    private func apply(_ value: Set<Int>) {
        guard value != selection else { return }
        undoSelection = selection
        if pickingFinalTime { finalSelected = value } else { selected = value; onSave() }
    }

    private func updateRange(_ state: UIGestureRecognizer.State, point: CGPoint, cells: [NativeTimePoll.Cell], rows: [String], cellWidth: CGFloat, lookup: [String: NativeTimePoll.Cell]) {
        switch state {
        case .began:
            guard let p = position(point, rows: rows, cellWidth: cellWidth), let cell = lookup["\(table.dates[p.0])|\(rows[p.1])"] else { return }
            dragStart = p; original = selection; selecting = !cell.slotIds.isSubset(of: original)
            preview = TimePollSelection.toggle(cell, original: original)
            UIImpactFeedbackGenerator(style: .light).impactOccurred()
        case .changed:
            guard let from = dragStart, let to = position(point, rows: rows, cellWidth: cellWidth, clamped: true) else { return }
            if pickingFinalTime {
                guard let first = lookup["\(table.dates[from.0])|\(rows[from.1])"], let last = lookup["\(table.dates[to.0])|\(rows[to.1])"] else { return }
                preview = TimePollSelection.interval(cells: cells, from: first, to: last, original: original, selecting: selecting)
            } else {
                preview = TimePollSelection.rectangle(cells: cells, dates: table.dates, rows: rows, from: from, to: to, original: original, selecting: selecting)
            }
        case .ended:
            if let preview { apply(preview) }; clearPreview()
        case .cancelled, .failed: clearPreview()
        default: break
        }
    }

    private func clearPreview() { preview = nil; dragStart = nil }
    private func position(_ point: CGPoint, rows: [String], cellWidth: CGFloat, clamped: Bool = false) -> (Int, Int)? {
        guard !table.dates.isEmpty, !rows.isEmpty else { return nil }
        let column = Int(floor(point.x / cellWidth)), row = Int(floor(point.y / cellHeight))
        if clamped { return (min(max(0, column), table.dates.count - 1), min(max(0, row), rows.count - 1)) }
        guard column >= 0, row >= 0, column < table.dates.count, row < rows.count else { return nil }
        return (column, row)
    }
}

/// Native recognizers let either enclosing scroll view win an ordinary swipe.
/// Once the hold recognizes, it owns that touch until release or cancellation.
private struct TimePollTouchSurface: UIViewRepresentable {
    let onTap: (CGPoint) -> Void
    var onRange: ((UIGestureRecognizer.State, CGPoint) -> Void)? = nil

    func makeUIView(context: Context) -> TimePollTouchView { TimePollTouchView() }
    func updateUIView(_ view: TimePollTouchView, context: Context) {
        view.onTap = onTap; view.onRange = onRange
    }
}

private final class TimePollTouchView: UIView {
    var onTap: ((CGPoint) -> Void)?
    var onRange: ((UIGestureRecognizer.State, CGPoint) -> Void)? { didSet { if hold.isEnabled != (onRange != nil) { hold.isEnabled = onRange != nil } } }
    private let hold = UILongPressGestureRecognizer()

    init() {
        super.init(frame: .zero)
        backgroundColor = .clear
        isAccessibilityElement = false
        hold.addTarget(self, action: #selector(handleHold))
        hold.minimumPressDuration = 0.4
        hold.allowableMovement = 10
        let tap = UITapGestureRecognizer(target: self, action: #selector(handleTap))
        tap.require(toFail: hold)
        addGestureRecognizer(hold); addGestureRecognizer(tap)
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }
    @objc private func handleTap(_ gesture: UITapGestureRecognizer) { onTap?(gesture.location(in: self)) }
    @objc private func handleHold(_ gesture: UILongPressGestureRecognizer) { onRange?(gesture.state, gesture.location(in: self)) }

}

struct TimePollMessageContent: View {
    @Environment(DeepLinkRouter.self) private var deepLinkRouter
    let text: String
    var body: some View {
        VStack(alignment: .leading, spacing: SideSeatTheme.spaceSM) {
            Text(text)
            if let token = TimePollLink.firstToken(in: text) {
                Button { deepLinkRouter.handleAppRoute(.timePoll(token: token)) } label: { Label("Open time poll", systemImage: "calendar.badge.clock") }
                    .buttonStyle(SSPressButtonStyle())
                    .accessibilityIdentifier("time-poll-message-link")
            }
        }
    }
}

private func clock(_ minute: Int) -> String { String(format: "%02d:%02d", minute / 60, minute % 60) }
func timePollClockFormatter(_ timeZone: String) -> DateFormatter {
    let formatter = DateFormatter(); formatter.locale = Locale(identifier: "en_GB"); formatter.timeZone = TimeZone(identifier: timeZone); formatter.dateFormat = "HH:mm"
    return formatter
}
func timePollDateLabel(_ key: String) -> String {
    let parser = DateFormatter(); parser.locale = Locale(identifier: "en_US_POSIX"); parser.dateFormat = "yyyy-MM-dd"
    guard let date = parser.date(from: key) else { return key }
    let output = DateFormatter(); output.locale = AppLocalization.selectedLanguage.locale; output.dateFormat = "EEE\nMMM d"; return output.string(from: date)
}

/// An optional starting stage, sharing the plan identity and keeping attendance explicit.
struct PlanActivityIdeasView: View {
    @Environment(SessionStore.self) private var session
    @Environment(\.dynamicTypeSize) private var typeSize
    let poll: NativeTimePoll
    @Bindable var store: TimePollStore
    @State private var expanded = false
    @Binding var draftTitle: String
    @Binding var showsSuggestion: Bool
    @FocusState private var suggestionFocused: Bool
    private var activity: NativePlanActivity { poll.activitySelection! }
    private var ideas: [NativePlanActivity.Idea] { activity.ideas ?? [] }
    private var completions: [String] {
        let query = draftTitle.trimmingCharacters(in: .whitespacesAndNewlines).folding(options: [.caseInsensitive, .diacriticInsensitive], locale: .current)
        return [AppLocalization.string("Exhibition"), AppLocalization.string("Hotpot"), AppLocalization.string("Badminton")].filter {
            let value = $0.folding(options: [.caseInsensitive, .diacriticInsensitive], locale: .current)
            return value.hasPrefix(query) && value != query
        }
    }


    var body: some View {
        VStack(alignment: .leading, spacing: SideSeatTheme.spaceSM) {
            HStack(alignment: .firstTextBaseline, spacing: SideSeatTheme.spaceSM) {
                Button { expanded.toggle() } label: {
                    HStack(spacing: SideSeatTheme.spaceXS) {
                        Text(typeSize.isAccessibilitySize ? AppLocalization.string("Activity undecided") : String(format: AppLocalization.string("Activity undecided · %d ideas"), ideas.count))
                            .fixedSize(horizontal: false, vertical: true)
                        Image(systemName: expanded ? "chevron.up" : "chevron.down").font(.caption).accessibilityHidden(true)
                    }.font(.subheadline.weight(.medium))
                }.buttonStyle(SSActionButtonStyle(size: .compact)).accessibilityIdentifier("plan-activity-open-ideas")
                    .accessibilityValue(String(format: AppLocalization.string("Activity undecided · %d ideas"), ideas.count) + ", " + (expanded ? "Expanded" : "Collapsed"))
                Spacer(minLength: 0)
                if showsSuggestion {
                    Button("Confirm suggestion", action: addSuggestion)
                        .buttonStyle(SSActionButtonStyle(prominent: true, size: .compact))
                        .fixedSize(horizontal: false, vertical: true)
                        .disabled(!store.canMutate || draftTitle.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || draftTitle.count > 120)
                        .accessibilityIdentifier("plan-activity-add")
                } else {
                    Button { expanded = true; showsSuggestion = true; suggestionFocused = true } label: {
                        Label("Suggest an activity", systemImage: "plus")
                            .font(.subheadline.weight(.medium)).fixedSize(horizontal: false, vertical: true)
                    }.buttonStyle(SSActionButtonStyle(size: .compact))
                        .disabled(!store.canMutate).accessibilityIdentifier("plan-activity-suggest")
                }
            }
            if showsSuggestion { suggestionForm }
            if expanded {
                if ideas.isEmpty && !showsSuggestion {
                    Text("No ideas yet. Suggest something you'd enjoy doing together.")
                        .font(.subheadline).foregroundStyle(SideSeatTheme.textSecondaryStrong)
                        .fixedSize(horizontal: false, vertical: true)
                }
                LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: SideSeatTheme.spaceSM, alignment: .top), count: typeSize.isAccessibilitySize ? 1 : 2), alignment: .leading, spacing: SideSeatTheme.spaceSM) {
                    ForEach(ideas) { idea in ideaCard(idea) }
                }.accessibilityIdentifier("plan-activity-board")
                Text("Interest is not attendance. The organizer confirms the activity when reviewing invitations.")
                    .font(.caption).foregroundStyle(SideSeatTheme.textSecondaryStrong)
                    .fixedSize(horizontal: false, vertical: true).accessibilityIdentifier("plan-activity-consent-note")
            }
        }
        .accessibilityElement(children: .contain).accessibilityIdentifier("plan-activity-ideas")
        .onAppear {
            if poll.hasFixedTime { expanded = true }
            if !draftTitle.isEmpty { expanded = true; showsSuggestion = true }
        }
        .onDisappear { showsSuggestion = false }
    }

    private var suggestionForm: some View {
        VStack(alignment: .leading, spacing: SideSeatTheme.spaceXS) {
            if typeSize.isAccessibilitySize && !completions.isEmpty { completionRow }
            HStack(alignment: .top, spacing: SideSeatTheme.spaceSM) {
                TextField("For example: an exhibition, dinner or badminton", text: $draftTitle, axis: .vertical)
                    .lineLimit(1...3).focused($suggestionFocused)
                    .submitLabel(.done).onSubmit { suggestionFocused = false }
                    .onKeyPress(.tab, phases: .down) { press in
                        guard press.modifiers.isEmpty, let first = completions.first else { return .ignored }
                        draftTitle = first
                        return .handled
                    }
                    .padding(SideSeatTheme.spaceMD)
                    .background(SideSeatTheme.surface, in: RoundedRectangle(cornerRadius: 12))
                    .overlay(RoundedRectangle(cornerRadius: 12).strokeBorder(SideSeatTheme.textSecondaryStrong.opacity(0.25)))
                    .accessibilityLabel("Activity idea").accessibilityIdentifier("plan-activity-title")
                Button { showsSuggestion = false; suggestionFocused = false; draftTitle = "" } label: {
                    Image(systemName: "xmark").font(.subheadline).frame(width: 44, height: 44)
                }.buttonStyle(SSActionButtonStyle(horizontalPadding: 0, size: .icon)).accessibilityLabel("Cancel").accessibilityIdentifier("plan-activity-cancel")
            }
            if !typeSize.isAccessibilitySize && !completions.isEmpty { completionRow }
        }.disabled(store.acting)
    }

    private var completionRow: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: SideSeatTheme.spaceSM) {
                Text("Quick fill").font(.caption).foregroundStyle(SideSeatTheme.textSecondaryStrong)
                ForEach(completions, id: \.self) { value in
                    Button { draftTitle = value; suggestionFocused = true } label: {
                        Label(value, systemImage: "arrow.up.left")
                            .font(.caption.weight(.medium)).padding(.horizontal, SideSeatTheme.spaceMD).frame(minHeight: 44)
                            .background(SideSeatTheme.surface, in: Capsule())
                            .overlay(Capsule().strokeBorder(SideSeatTheme.actionBorder))
                    }.buttonStyle(.plain)
                        .accessibilityLabel(String(format: AppLocalization.string("Fill with %@"), value))
                        .accessibilityIdentifier("plan-activity-complete-\(value)")
                }
            }
        }.accessibilityIdentifier("plan-activity-completions")
    }

    private func addSuggestion() {
        suggestionFocused = false
        Task {
            await store.mutate("activities", body: SuggestPlanActivityRequest(title: draftTitle.trimmingCharacters(in: .whitespacesAndNewlines), location: ""), session: session)
            if store.error == nil { draftTitle = ""; showsSuggestion = false; expanded = true }
        }
    }

    private func ideaCard(_ idea: NativePlanActivity.Idea) -> some View {
        VStack(alignment: .leading, spacing: SideSeatTheme.spaceXS) {
            Text(idea.title).font(.subheadline.weight(.semibold)).fixedSize(horizontal: false, vertical: true)
                .frame(maxWidth: .infinity, alignment: .leading)
                .accessibilityLabel(idea.title + ", " + String(format: AppLocalization.string("%@ suggested this"), idea.authorName))
            if let location = idea.location, !location.isEmpty {
                Label(location, systemImage: "mappin.and.ellipse").font(.caption).foregroundStyle(SideSeatTheme.textSecondaryStrong)
                    .fixedSize(horizontal: false, vertical: true)
            }
            Button {
                Task { await store.mutate("activities/interest", method: .put, body: PlanActivityInterestRequest(ideaId: idea.id, interested: !idea.isInterested), session: session) }
            } label: {
                Label(String(format: AppLocalization.string("%d interested"), idea.interestedBy.count), systemImage: idea.isInterested ? "heart.fill" : "heart")
                    .font(.caption.weight(.medium)).fixedSize(horizontal: false, vertical: true)
                    .frame(maxWidth: .infinity, alignment: .center).contentShape(Rectangle())
                    .foregroundStyle(idea.isInterested ? SideSeatTheme.utilityAction : SideSeatTheme.textSecondaryStrong)
            }.buttonStyle(SSActionButtonStyle(size: .compact)).disabled(!store.canMutate)
                .accessibilityLabel(AppLocalization.string(idea.isInterested ? "Interest marked" : "I'm interested"))
                .accessibilityIdentifier("plan-activity-interest-\(idea.id)")
                .accessibilityValue(String(format: AppLocalization.string("%d interested"), idea.interestedBy.count))
        }
        .padding(.horizontal, SideSeatTheme.spaceMD).padding(.top, SideSeatTheme.spaceMD).padding(.bottom, SideSeatTheme.spaceSM)
        .background(SideSeatTheme.surface, in: RoundedRectangle(cornerRadius: 12))
        .overlay(RoundedRectangle(cornerRadius: 12).strokeBorder(SideSeatTheme.textSecondaryStrong.opacity(0.18)))
        .accessibilityElement(children: .contain).accessibilityIdentifier("plan-activity-idea-\(idea.id)")
    }
}
