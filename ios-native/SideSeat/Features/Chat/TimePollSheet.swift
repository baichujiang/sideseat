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
                                Button("Done") { dismiss() }
                            }
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
        .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } } }
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
    @Environment(\.locale) private var locale
    @State private var title = ""
    @State private var dates: Set<DateComponents> = Set((1...7).compactMap {
        Calendar.current.date(byAdding: .day, value: $0, to: Date())
    }.map { Calendar.current.dateComponents([.era, .year, .month, .day], from: $0) })
    @State private var startMinute = 9 * 60
    @State private var endMinute = 17 * 60
    @State private var planningMode = "COLLECT"
    @State private var chooseActivityTogether = false
    @State private var showsDateOptions = false
    @FocusState private var titleFocused: Bool
    @FocusState private var locationFocused: Bool
    @State private var location = ""
    @State private var durationMinutes = 60
    @State private var expectedCount = 5
    @State private var fixedStart = Date(timeIntervalSince1970: ceil(Date().addingTimeInterval(3600).timeIntervalSince1970 / 900) * 900)
    @State private var creating = false
    @State private var error: String?
    @State private var createKey = UUID().uuidString
    let onCreate: (NativeTimePoll) -> Void

    var body: some View {
        Form {
            Section("Activity") {
                TextField(chooseActivityTogether ? "For example: what shall we do this weekend?" : "For example: Friday dinner", text: $title)
                    .font(.title3.weight(.medium)).focused($titleFocused)
                    .submitLabel(.done).onSubmit { titleFocused = false }
                    .accessibilityIdentifier("time-poll-title")
                TextField("Location (optional)", text: $location)
                    .focused($locationFocused).submitLabel(.done).onSubmit { locationFocused = false }
                    .accessibilityIdentifier("unified-plan-location")
                Button {
                    chooseActivityTogether.toggle(); titleFocused = false; locationFocused = false
                } label: {
                    HStack(spacing: SideSeatTheme.spaceSM) {
                        Image(systemName: chooseActivityTogether ? "checkmark.square.fill" : "square")
                            .font(.title3).accessibilityHidden(true)
                        Text("Friends can suggest activities").font(.subheadline)
                            .fixedSize(horizontal: false, vertical: true)
                        Spacer(minLength: 0)
                    }.frame(minHeight: 44).contentShape(Rectangle())
                }.buttonStyle(.plain).foregroundStyle(SideSeatTheme.utilityAction)
                    .accessibilityIdentifier("plan-start-together")
                    .accessibilityLabel("Friends can suggest activities")
                    .accessibilityValue(AppLocalization.string(chooseActivityTogether ? "Selected" : "Not selected"))
                    .accessibilityAddTraits(chooseActivityTogether ? .isSelected : [])
            }
            Section {
                if planningMode == "FIXED" {
                    PlanAdaptiveRow {
                        Text("Starts")
                    } trailing: {
                        DatePicker("Starts", selection: $fixedStart, in: Date()...).labelsHidden()
                            .dynamicTypeSize(...DynamicTypeSize.xxxLarge)
                            .accessibilityIdentifier("unified-plan-fixed-start")
                    }
                    Picker("Activity duration", selection: $durationMinutes) {
                        ForEach([30, 45, 60, 90, 120, 180, 240], id: \.self) {
                            Text(String(format: AppLocalization.string("%d minutes"), $0)).tag($0)
                        }
                    }.accessibilityIdentifier("unified-plan-duration")
                    Stepper(String(format: AppLocalization.string("%d participants including you"), expectedCount), value: $expectedCount, in: 2...20)
                        .accessibilityIdentifier("unified-plan-participant-count")
                    Button("Find a time together instead") { planningMode = "COLLECT"; titleFocused = false }
                        .font(.subheadline).frame(minHeight: 44).accessibilityIdentifier("plan-mode-collect")
                } else {
                    Button {
                        titleFocused = false; locationFocused = false; showsDateOptions.toggle()
                    } label: {
                        HStack(spacing: SideSeatTheme.spaceMD) {
                            VStack(alignment: .leading, spacing: SideSeatTheme.spaceXS) {
                                Label("Dates to find a time", systemImage: "calendar")
                                Text(candidateDateSummary).font(.subheadline).foregroundStyle(SideSeatTheme.textSecondaryStrong)
                                    .fixedSize(horizontal: false, vertical: true)
                                Text(clock(startMinute) + "–" + clock(endMinute))
                                    .font(.caption.monospacedDigit()).foregroundStyle(SideSeatTheme.textSecondaryStrong)
                            }.frame(maxWidth: .infinity, alignment: .leading)
                            Image(systemName: showsDateOptions ? "chevron.down" : "chevron.right").font(.caption.weight(.semibold)).accessibilityHidden(true)
                        }.padding(.vertical, SideSeatTheme.spaceXS).contentShape(Rectangle())
                    }.buttonStyle(.plain).accessibilityIdentifier("plan-date-options")
                        .accessibilityValue(showsDateOptions ? "Expanded" : "Collapsed")
                    if showsDateOptions {
                        MultiDatePicker("Choose dates", selection: $dates, in: Calendar.current.startOfDay(for: Date())...)
                            .accessibilityIdentifier("time-poll-dates")
                        Picker("From", selection: $startMinute) {
                            ForEach(Array(stride(from: 0, to: 1440, by: 30)), id: \.self) { Text(clock($0)).tag($0) }
                        }.accessibilityIdentifier("time-poll-from")
                        Picker("Until", selection: $endMinute) {
                            ForEach(Array(stride(from: 30, through: 1440, by: 30)), id: \.self) { Text(clock($0)).tag($0) }
                        }.accessibilityIdentifier("time-poll-until")
                    }
                        Button("Time already set?") { planningMode = "FIXED"; titleFocused = false }
                            .font(.subheadline).frame(minHeight: 44).accessibilityIdentifier("plan-mode-fixed")
                }
            } header: { Text("When") } footer: {
                VStack(alignment: .leading, spacing: SideSeatTheme.spaceXS) {
                    Text(LocalizedStringKey(planningMode == "FIXED" ? (chooseActivityTogether ? "Time is set. Choose the activity together before sending a formal invitation." : "Collect replies first, then send the final plan whenever you are ready.") : "Everyone can fill free time on the same timetable."))
                    Text(String(format: AppLocalization.string("All times in %@"), TimeZone.current.identifier))
                }
            }
            if let message = validationMessage { Section { Text(message).font(.footnote).foregroundStyle(SideSeatTheme.danger) } }
            if let error { Section { Text(error).foregroundStyle(SideSeatTheme.danger) } }
        }
        .scrollDismissesKeyboard(.interactively)
        .navigationTitle("Start a plan").navigationBarTitleDisplayMode(.inline)
        .onChange(of: "\(title)|\(location)|\(durationMinutes)|\(expectedCount)|\(planningMode)|\(chooseActivityTogether)|\(fixedStart)|\(dates)|\(startMinute)|\(endMinute)") { _, _ in createKey = UUID().uuidString }
        .toolbar {
            ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() }.disabled(creating) }
        }
        .safeAreaInset(edge: .bottom, spacing: 0) {
            PlanActionButton(title: AppLocalization.string(planningMode == "FIXED" && !chooseActivityTogether ? "Create invitation link" : "Create a plan"),
                             symbol: "plus", kind: .commit, isLoading: creating,
                             accessibilityID: "time-poll-create-confirm") {
                titleFocused = false; locationFocused = false; Task { await create() }
            }.disabled(!canCreate)
                .padding(SideSeatTheme.spaceMD).background(SideSeatTheme.surface)
                .overlay(alignment: .top) { Divider() }
        }
    }

    private var candidateDateSummary: String {
        let days = dates.compactMap { Calendar.current.date(from: $0) }.sorted()
        guard let first = days.first, let last = days.last else { return AppLocalization.string("Choose at least one date.") }
        let formatter = DateIntervalFormatter()
        formatter.locale = locale; formatter.dateStyle = .medium; formatter.timeStyle = .none
        let range = formatter.string(from: first, to: last)
        return String(format: AppLocalization.string("%@ · %d candidate days"), range, days.count)
    }

    private var validationMessage: String? {
        if title.count > 120 { return AppLocalization.string("Keep the plan title within 120 characters.") }
        if location.count > 200 { return AppLocalization.string("Keep the location within 200 characters.") }
        if planningMode == "FIXED" { return fixedStart <= Date() ? AppLocalization.string("Choose a future start time.") : nil }
        if dates.isEmpty { return AppLocalization.string("Choose at least one date.") }
        if dates.count > 31 { return AppLocalization.string("Choose up to 31 dates.") }
        if endMinute <= startMinute { return AppLocalization.string("End time must be after start time.") }
        if let last = dates.compactMap({ Calendar.current.date(from: $0) }).max(),
           Calendar.current.date(byAdding: .minute, value: endMinute, to: last).map({ $0 <= Date() }) == true {
            return AppLocalization.string("These hours have already passed. Choose a later time or date.")
        }
        return nil
    }
    private var canCreate: Bool {
        !creating && !title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && title.count <= 120 &&
        validationMessage == nil
    }

    private func create() async {
        creating = true; defer { creating = false }
        let chosenDates = planningMode == "FIXED" ? Set([Calendar.current.dateComponents([.era, .year, .month, .day], from: fixedStart)]) : dates
        let keys = chosenDates.compactMap { Calendar.current.date(from: $0) }.map { date in
            let formatter = DateFormatter(); formatter.calendar = Calendar(identifier: .gregorian)
            formatter.locale = Locale(identifier: "en_US_POSIX"); formatter.timeZone = .current; formatter.dateFormat = "yyyy-MM-dd"
            return formatter.string(from: date)
        }.sorted()
        do {
            let response: APIEnvelope<NativeTimePoll> = try await session.sendAuthorized(
                "/api/v1/time-polls", method: .post,
                body: CreateTimePollRequest(title: title, timeZone: TimeZone.current.identifier, dates: keys, startMinute: startMinute, endMinute: endMinute, location: location, durationMinutes: planningMode == "FIXED" ? durationMinutes : nil, expectedCount: chooseActivityTogether && planningMode != "FIXED" ? nil : expectedCount, planningMode: planningMode, fixedStart: planningMode == "FIXED" ? ISO8601DateFormatter().string(from: fixedStart) : nil, chooseActivityTogether: chooseActivityTogether ? true : nil),
                idempotencyKey: createKey
            )
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
    @State private var showsInformation = false
    @State private var activityDraftTitle = ""
    @State private var pickingFinalTime = false
    @State private var finalRange: TimePollFinalRange?
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
            if let poll = store.poll, poll.planningPhase == "COLLECTING" || choosingAgain {
                collectionFooter(poll)
            }
        }
        .toolbar {
            if pickingFinalTime {
                ToolbarItem(placement: .topBarLeading) {
                    Button { cancelFinalSelection() } label: { Label("Back to plan", systemImage: "chevron.left") }
                        .accessibilityIdentifier("time-poll-cancel-final")
                }
            }
            if let poll = store.poll, !pickingFinalTime {
                ToolbarItem(placement: .topBarTrailing) { PlanShareActions(poll: poll, store: store) }
                if poll.isOwner {
                ToolbarItem(placement: .topBarTrailing) {
                    Menu {
                        if poll.isOwner && ["INVITING", "CONFIRMED"].contains(poll.planningPhase) {
                            Button("Cancel plan", role: .destructive) { showsCancelPlan = true }.accessibilityIdentifier("unified-plan-cancel")
                        }
                        if poll.isOwner && ["COLLECTING", "CANCELLED", "EXPIRED"].contains(poll.planningPhase) { Button("Delete poll", role: .destructive) { showsDelete = true } }
                    } label: { Image(systemName: "ellipsis") }.accessibilityIdentifier("time-poll-menu")
                }
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
        .sheet(isPresented: $showsInformation) {
            if let poll = store.poll { PlanInformationEditor(poll: poll, store: store).dynamicTypeSize(typeSize) }
        }
        .onChange(of: store.poll?.invitationVersion) { _, _ in choosingAgain = false; pickingFinalTime = false; finalRange = nil }
        .task {
            await store.load(session: session)
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
                        InvitationTimetableView(start: start, end: end, timeZone: poll.timeZone, needsConfirmation: false, isDraft: true)
                            .padding(.horizontal, SideSeatTheme.spaceMD)
                    } else {
                        PlanResponseSummary(poll: poll) { showsPeople = true }
                            .padding(.horizontal, SideSeatTheme.spaceMD)
                        TimePollGrid(poll: poll, selected: $store.selected, editable: editsTimetable(poll), pickingFinalTime: pickingFinalTime, finalRange: $finalRange,
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
            PlanDetailHeading(poll: poll, edit: !pickingFinalTime && poll.isOwner && poll.activitySelection?.selectedIdeaId == nil ? { showsInformation = true } : nil)
                .disabled(!store.canMutate)
            if pickingFinalTime {
                Label("Choose the invitation time. Your availability stays unchanged.", systemImage: "calendar.badge.clock")
                    .font(.subheadline).foregroundStyle(SideSeatTheme.statusWarningText)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityIdentifier("plan-final-time-context")
            } else {
                if poll.activitySelection?.isOpen == true {
                    PlanActivityIdeasView(poll: poll, store: store, draftTitle: $activityDraftTitle)
                }
            }
            Text(dateRange(poll) + " · " + poll.timeZone).font(.caption).foregroundStyle(SideSeatTheme.textSecondaryStrong)
                .fixedSize(horizontal: false, vertical: true).accessibilityIdentifier("time-poll-date-range")
        }.padding(.horizontal, SideSeatTheme.spaceMD)
    }

    private func collectionFooter(_ poll: NativeTimePoll) -> some View {
        VStack(alignment: .leading, spacing: SideSeatTheme.spaceSM) {
            if pickingFinalTime {
                let layout = typeSize.isAccessibilitySize ? AnyLayout(VStackLayout(alignment: .leading, spacing: 4)) : AnyLayout(HStackLayout(spacing: 8))
                layout {
                    Text("Choose final time").font(.subheadline.weight(.semibold))
                        .frame(maxWidth: .infinity, alignment: .leading).accessibilityIdentifier("time-poll-final-heading")
                    Button { finalRange = nil } label: {
                        Label("Clear final time", systemImage: "arrow.counterclockwise").font(.caption.weight(.medium)).frame(minHeight: 44)
                    }
                    .buttonStyle(.plain).foregroundStyle(SideSeatTheme.utilityAction)
                    .disabled(finalRange == nil)
                    .accessibilityIdentifier("time-poll-reset-final")
                }
                if let finalRange {
                    Text(timePollDateLabel(finalRange.date).replacingOccurrences(of: "\n", with: " "))
                        .font(.caption).foregroundStyle(SideSeatTheme.textSecondaryStrong)
                    Text(timePollClockFormatter(poll.timeZone).string(from: finalRange.start) + " – " + timePollClockFormatter(poll.timeZone).string(from: finalRange.end))
                        .font(.subheadline.monospacedDigit()).fixedSize(horizontal: false, vertical: true)
                        .accessibilityIdentifier("time-poll-final-range")
                } else if !typeSize.isAccessibilitySize {
                    Text("Tap cells to extend one continuous time range.")
                        .font(.caption).foregroundStyle(SideSeatTheme.textSecondaryStrong)
                        .fixedSize(horizontal: false, vertical: true)
                }
                PlanActionButton(title: AppLocalization.string(typeSize.isAccessibilitySize ? "Review invitation" : "Next: review invitation"), symbol: "person.2", kind: .commit,
                                accessibilityID: "unified-plan-review-roster") { showsInvite = true }
                    .disabled(finalRange == nil || !store.canMutate)
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
        if finalRange == nil {
        invitationRoster = Set(poll.invitationCandidates.map(\.id))
        invitationActivityID = poll.activitySelection?.selectedIdeaId
        invitationLinkCount = poll.hasFixedTime ? poll.expectedCount : poll.invitationCandidates.contains(where: { !$0.isMe }) ? nil : 2
        finalRange = nil
        if poll.hasFixedTime, let start = poll.chosenStart, let end = poll.chosenEnd, let date = poll.dates.first {
            finalRange = TimePollFinalRange(date: date, start: start, end: end)
        } else if let start = poll.chosenStart, let end = poll.chosenEnd,
           let first = poll.cells.first(where: { $0.slots[0].start == start }),
           let last = poll.cells.first(where: { $0.end == end }) {
            finalRange = TimePollFinalRange.spanning(first, last, cells: poll.cells)
        }
        }
        if poll.hasFixedTime { showsInvite = true } else { pickingFinalTime = true }
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
    let poll: NativeTimePoll
    @Binding var selected: Set<Int>
    let editable: Bool
    let pickingFinalTime: Bool
    @Binding var finalRange: TimePollFinalRange?
    var chooseNoFreeTime: (() -> Void)? = nil
    let onSave: () -> Void
    @State private var dragStart: (Int, Int)?
    @Environment(\.dynamicTypeSize) private var typeSize
    @State private var original = Set<Int>()
    @State private var preview: Set<Int>?
    @State private var selecting = true
    @State private var undoSelection: Set<Int>?
    @State private var originalFinalRange: TimePollFinalRange?
    private var cellHeight: CGFloat { typeSize.isAccessibilitySize ? 64 : 44 }
    private var labelWidth: CGFloat { typeSize.isAccessibilitySize ? 120 : 60 }
    private var headerHeight: CGFloat { typeSize.isAccessibilitySize ? 128 : 48 }

    var body: some View {
        let rows = poll.rows
        let cells = poll.cells
        let lookup = Dictionary(uniqueKeysWithValues: cells.map { ("\($0.date)|\($0.row)", $0) })
        let participantSelections = poll.submittedTimetableSelections
        VStack(spacing: SideSeatTheme.spaceSM) {
            if pickingFinalTime {
                VStack(alignment: .leading, spacing: SideSeatTheme.spaceSM) {
                    Label("Final time · not sent yet", systemImage: "calendar.badge.clock")
                        .font(.subheadline.weight(.semibold)).foregroundStyle(SideSeatTheme.textPrimary)
                    Text("Tap cells to extend one continuous time range. To start over, clear the time or hold and drag. Choosing another day replaces the range.")
                        .font(.caption).foregroundStyle(SideSeatTheme.textSecondaryStrong)
                    Text("Numbers show how many people are free. Your availability stays unchanged.")
                        .font(.caption2).foregroundStyle(SideSeatTheme.textSecondaryStrong)
                }.frame(maxWidth: .infinity, alignment: .leading).padding(.horizontal, SideSeatTheme.spaceMD)
            }
            GeometryReader { geometry in
                timetable(rows: rows, lookup: lookup, participantSelections: participantSelections, width: geometry.size.width)
                    .accessibilityElement(children: .contain)
                    .accessibilityIdentifier("time-poll-grid")
            }
            .frame(height: headerHeight + cellHeight * CGFloat(rows.count))
            if editable, let chooseNoFreeTime {
                HStack {
                    Spacer(minLength: 0)
                    Button("No free time", action: chooseNoFreeTime)
                        .font(.caption).frame(minHeight: 44).accessibilityIdentifier("time-poll-none")
                }.padding(.horizontal, SideSeatTheme.spaceMD)
            }
        }
        .onChange(of: editable) { _, _ in clearPreview() }
        .onChange(of: pickingFinalTime) { _, _ in clearPreview() }
        .onDisappear { clearPreview() }
    }

    private func timetable(rows: [String], lookup: [String: NativeTimePoll.Cell], participantSelections: [Set<Int>], width: CGFloat) -> some View {
        let cellWidth = typeSize.isAccessibilitySize ? max(280, width - labelWidth) : max(88, (width - labelWidth) / CGFloat(max(1, min(4, poll.dates.count))))
        let timeFormatter = timePollClockFormatter(poll.timeZone)
        return HStack(alignment: .top, spacing: 0) {
            VStack(spacing: 0) {
                Group {
                    if editable {
                        Button {
                            guard let undoSelection else { return }
                            selected = undoSelection
                            self.undoSelection = nil
                            onSave()
                        } label: {
                            Image(systemName: "arrow.uturn.backward").frame(minWidth: 44, minHeight: 44)
                        }
                        .disabled(undoSelection == nil || dragStart != nil)
                        .accessibilityLabel("Undo last change")
                        .accessibilityIdentifier("time-poll-undo")
                    } else { Text("Time").font(.caption).lineLimit(1).minimumScaleFactor(0.7) }
                }.frame(width: labelWidth, height: headerHeight)
                ForEach(rows, id: \.self) { row in
                    Text(poll.slots.first { $0.row == row }?.label ?? "")
                        .font(.caption2.monospacedDigit())
                        .lineLimit(1).minimumScaleFactor(0.7)
                        .frame(width: labelWidth, height: cellHeight)
                }
            }
            ScrollView(.horizontal) {
                VStack(spacing: 0) {
                    HStack(spacing: 0) {
                        ForEach(poll.dates, id: \.self) { date in
                            if !editable && !pickingFinalTime {
                                Text(timePollDateLabel(date)).font(.caption.weight(.semibold)).lineLimit(2).minimumScaleFactor(0.75)
                                    .frame(width: cellWidth, height: headerHeight)
                            } else {
                                dayButton(date, width: cellWidth)
                            }
                        }
                    }
                    VStack(spacing: 0) {
                        ForEach(rows, id: \.self) { row in
                            HStack(spacing: 0) {
                                ForEach(poll.dates, id: \.self) { date in
                                    if let slot = lookup["\(date)|\(row)"] {
                                        let count = slot.availableCount(in: participantSelections)
                                        let active = slot.slotIds.isSubset(of: preview ?? selected)
                                        let partial = !active && !slot.slotIds.isDisjoint(with: preview ?? selected)
                                        let finalActive = pickingFinalTime && finalRange?.contains(slot) == true
                                        ZStack {
                                            Rectangle().fill(SideSeatTheme.success.opacity(count == 0 ? 0.06 : 0.14 + 0.42 * Double(count) / Double(max(1, participantSelections.count))))
                                            if finalActive { Rectangle().fill(SideSeatTheme.statusWarningText.opacity(0.16)) }
                                            Rectangle().strokeBorder(finalActive ? SideSeatTheme.statusWarningText : editable && active ? SideSeatTheme.Availability.selectedFill : editable && partial ? SideSeatTheme.Availability.onPartial : SideSeatTheme.separator, lineWidth: finalActive || editable && (active || partial) ? 2 : 0.5)
                                            HStack(spacing: 5) {
                                                if finalActive {
                                                    Image(systemName: "calendar.badge.checkmark").foregroundStyle(SideSeatTheme.textPrimary)
                                                } else if editable && (active || partial) {
                                                    Image(systemName: active ? "checkmark.circle.fill" : "minus.circle.fill")
                                                        .foregroundStyle(active ? SideSeatTheme.Availability.selectedFill : SideSeatTheme.Availability.onPartial)
                                                }
                                                Text("\(count)").monospacedDigit().foregroundStyle(.primary)
                                            }.font(.caption.weight(.semibold))
                                        }.frame(width: cellWidth, height: cellHeight)
                                        .accessibilityElement()
                                        .accessibilityLabel("\(date), \(slot.label)–\(timeFormatter.string(from: slot.end)), \(count)")
                                        .accessibilityValue(pickingFinalTime ? AppLocalization.string(finalActive ? "Final time selected" : "Select final time") : editable ? AppLocalization.string(active ? "Available" : partial ? "Some times selected" : "Unavailable") : "")
                                        .accessibilityIdentifier("time-poll-cell-\(slot.id)")
                                        .accessibilityAddTraits(editable || pickingFinalTime ? .isButton : [])
                                        .accessibilityAddTraits(finalActive || active && editable ? .isSelected : [])
                                        .accessibilityAction { toggle(slot) }
                                    } else { Color.clear.frame(width: cellWidth, height: cellHeight) }
                                }
                            }
                        }
                    }
                    .overlay {
                        if editable || pickingFinalTime {
                            TimePollTouchSurface(
                                onTap: { point in
                                    if let position = position(point, rows: rows, cellWidth: cellWidth),
                                       let slot = lookup["\(poll.dates[position.0])|\(rows[position.1])"] { toggle(slot) }
                                },
                                onRange: { state, point in updateRange(state, point: point, rows: rows, cellWidth: cellWidth, lookup: lookup) }
                            ).accessibilityHidden(true)
                        }
                    }
                }
            }.frame(width: max(0, width - labelWidth), height: headerHeight + cellHeight * CGFloat(rows.count))
        }
    }

    private func dayButton(_ date: String, width: CGFloat) -> some View {
        let slots = Set(poll.slots.filter { $0.date == date }.map(\.id))
        let allSelected = !slots.isEmpty && slots.isSubset(of: selected)
        let partlySelected = !allSelected && !slots.isDisjoint(with: selected)
        let day = poll.cells.filter { $0.date == date }
        return Button {
            if pickingFinalTime {
                if let first = day.first, let last = day.last { finalRange = TimePollFinalRange.spanning(first, last, cells: poll.cells) }
            } else { apply(allSelected ? selected.subtracting(slots) : selected.union(slots)) }
        } label: {
            HStack(spacing: 4) {
                Text(timePollDateLabel(date)).multilineTextAlignment(.center).lineLimit(2).minimumScaleFactor(0.75)
                Image(systemName: pickingFinalTime ? "calendar" : allSelected ? "checkmark.circle.fill" : partlySelected ? "minus.circle" : "circle")
            }
            .font(.caption.weight(.semibold))
            .frame(width: width - 6, height: headerHeight - 4)
            .foregroundStyle(pickingFinalTime ? SideSeatTheme.textPrimary : allSelected ? SideSeatTheme.Availability.onSelected : partlySelected ? SideSeatTheme.Availability.onPartial : SideSeatTheme.textPrimary)
            .background(pickingFinalTime ? Color.clear : allSelected ? SideSeatTheme.Availability.selectedFill : partlySelected ? SideSeatTheme.Availability.partialFill : Color.clear, in: RoundedRectangle(cornerRadius: 8))
            .overlay {
                RoundedRectangle(cornerRadius: 8).strokeBorder(pickingFinalTime ? SideSeatTheme.separator : allSelected ? SideSeatTheme.Availability.selectedFill : partlySelected ? SideSeatTheme.Availability.onPartial.opacity(0.5) : SideSeatTheme.separator, lineWidth: 0.5)
            }
            .frame(width: width, height: headerHeight)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .disabled(slots.isEmpty || dragStart != nil)
        .accessibilityLabel(timePollDateLabel(date).replacingOccurrences(of: "\n", with: ", "))
        .accessibilityValue(pickingFinalTime ? "" : AppLocalization.string(allSelected ? "All times selected" : partlySelected ? "Some times selected" : "No times selected"))
        .accessibilityHint(AppLocalization.string(pickingFinalTime ? "Select this day as the final time" : allSelected ? "Deselect all times for this day" : "Select all times for this day"))
        .accessibilityAddTraits(!pickingFinalTime && allSelected ? .isSelected : [])
        .accessibilityIdentifier("time-poll-day-\(date)")
    }

    private func updateRange(_ state: UIGestureRecognizer.State, point: CGPoint, rows: [String], cellWidth: CGFloat, lookup: [String: NativeTimePoll.Cell]) {
        if pickingFinalTime {
            updateFinalRange(state, point: point, rows: rows, cellWidth: cellWidth, lookup: lookup)
            return
        }
        switch state {
        case .began:
            guard let start = position(point, rows: rows, cellWidth: cellWidth),
                  let slot = lookup["\(poll.dates[start.0])|\(rows[start.1])"] else { return }
            dragStart = start
            original = selected
            selecting = !slot.slotIds.isSubset(of: selected)
            preview = TimePollSelection.rectangle(cells: poll.cells, dates: poll.dates, rows: rows, from: start, to: start, original: original, selecting: selecting)
            UIImpactFeedbackGenerator(style: .light).impactOccurred()
        case .changed:
            guard let start = dragStart,
                  let end = position(point, rows: rows, cellWidth: cellWidth, clamped: true) else { return }
            preview = TimePollSelection.rectangle(cells: poll.cells, dates: poll.dates, rows: rows, from: start, to: end, original: original, selecting: selecting)
        case .ended:
            if let preview { apply(preview) }
            clearPreview()
        case .cancelled, .failed:
            clearPreview()
        default: break
        }
    }

    private func updateFinalRange(_ state: UIGestureRecognizer.State, point: CGPoint, rows: [String], cellWidth: CGFloat, lookup: [String: NativeTimePoll.Cell]) {
        switch state {
        case .began:
            guard let start = position(point, rows: rows, cellWidth: cellWidth),
                  let cell = lookup["\(poll.dates[start.0])|\(rows[start.1])"] else { return }
            originalFinalRange = finalRange; dragStart = start
            finalRange = TimePollFinalRange.spanning(cell, cell, cells: poll.cells)
            UIImpactFeedbackGenerator(style: .light).impactOccurred()
        case .changed:
            guard let start = dragStart,
                  let end = position(point, rows: rows, cellWidth: cellWidth, clamped: true),
                  let first = lookup["\(poll.dates[start.0])|\(rows[start.1])"],
                  let last = lookup["\(poll.dates[start.0])|\(rows[end.1])"] else { return }
            finalRange = TimePollFinalRange.spanning(first, last, cells: poll.cells)
        case .ended:
            clearPreview()
        case .cancelled, .failed:
            finalRange = originalFinalRange; clearPreview()
        default: break
        }
    }

    private func toggle(_ cell: NativeTimePoll.Cell) {
        if pickingFinalTime {
            finalRange = TimePollFinalRange.selecting(cell, in: finalRange, cells: poll.cells)
            return
        }
        guard editable else { return }
        apply(TimePollSelection.toggle(cell, original: selected))
    }

    private func apply(_ value: Set<Int>) {
        guard value != selected else { return }
        undoSelection = selected
        selected = value
        onSave()
    }

    private func clearPreview() { preview = nil; dragStart = nil }

    private func position(_ point: CGPoint, rows: [String], cellWidth: CGFloat, clamped: Bool = false) -> (Int, Int)? {
        guard !poll.dates.isEmpty, !rows.isEmpty else { return nil }
        let column = Int(floor(point.x / cellWidth)), row = Int(floor(point.y / cellHeight))
        if clamped { return (min(max(0, column), poll.dates.count - 1), min(max(0, row), rows.count - 1)) }
        guard column >= 0, row >= 0, column < poll.dates.count, row < rows.count else { return nil }
        return (column, row)
    }
}

/// Native recognizers let either enclosing scroll view win an ordinary swipe.
/// Once the hold recognizes, it owns that touch until release or cancellation.
private struct TimePollTouchSurface: UIViewRepresentable {
    let onTap: (CGPoint) -> Void
    let onRange: (UIGestureRecognizer.State, CGPoint) -> Void

    func makeUIView(context: Context) -> TimePollTouchView { TimePollTouchView() }
    func updateUIView(_ view: TimePollTouchView, context: Context) {
        view.onTap = onTap
        view.onRange = onRange
    }
}

private final class TimePollTouchView: UIView {
    var onTap: ((CGPoint) -> Void)?
    var onRange: ((UIGestureRecognizer.State, CGPoint) -> Void)?

    init() {
        super.init(frame: .zero)
        backgroundColor = .clear
        isAccessibilityElement = false
        let hold = UILongPressGestureRecognizer(target: self, action: #selector(handleHold))
        hold.minimumPressDuration = 0.4
        hold.allowableMovement = 10
        let tap = UITapGestureRecognizer(target: self, action: #selector(handleTap))
        tap.require(toFail: hold)
        addGestureRecognizer(hold)
        addGestureRecognizer(tap)
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
    @State private var showsSuggestion = false
    @Binding var draftTitle: String
    @FocusState private var suggestionFocused: Bool
    private var activity: NativePlanActivity { poll.activitySelection! }
    private var ideas: [NativePlanActivity.Idea] { activity.ideas ?? [] }

    var body: some View {
        VStack(alignment: .leading, spacing: SideSeatTheme.spaceSM) {
            let layout = typeSize.isAccessibilitySize
                ? AnyLayout(VStackLayout(alignment: .leading, spacing: SideSeatTheme.spaceXS))
                : AnyLayout(HStackLayout(alignment: .center, spacing: SideSeatTheme.spaceSM))
            layout {
                Button { expanded.toggle() } label: {
                    HStack(spacing: SideSeatTheme.spaceSM) {
                        Text(String(format: AppLocalization.string("Activity undecided · %d ideas"), ideas.count)).fontWeight(.medium)
                        Image(systemName: expanded ? "chevron.up" : "chevron.down").font(.caption).accessibilityHidden(true)
                    }.font(.subheadline).frame(minHeight: 44).contentShape(Rectangle())
                }.buttonStyle(.plain).accessibilityIdentifier("plan-activity-open-ideas")
                    .accessibilityValue(expanded ? "Expanded" : "Collapsed")
                if !typeSize.isAccessibilitySize { Spacer(minLength: 0) }
            }
            if expanded {
                if ideas.isEmpty && !showsSuggestion {
                    Text("No ideas yet. Suggest something you'd enjoy doing together.")
                        .font(.subheadline).foregroundStyle(SideSeatTheme.textSecondaryStrong)
                        .fixedSize(horizontal: false, vertical: true)
                }
                ForEach(ideas) { idea in
                    Divider()
                    ideaRow(idea)
                }
                if showsSuggestion {
                    suggestionForm
                } else {
                    Button { showsSuggestion = true; suggestionFocused = true } label: {
                        Label("Suggest an activity", systemImage: "plus").font(.subheadline).frame(minHeight: 44)
                    }.disabled(!store.canMutate).accessibilityIdentifier("plan-activity-suggest")
                }
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
    }

    private var suggestionForm: some View {
        VStack(alignment: .leading, spacing: SideSeatTheme.spaceSM) {
            TextField("For example: an exhibition, dinner or badminton", text: $draftTitle)
                .textFieldStyle(.roundedBorder).focused($suggestionFocused)
                .submitLabel(.done).onSubmit { suggestionFocused = false }
                .accessibilityLabel("Activity idea").accessibilityIdentifier("plan-activity-title")
            HStack(spacing: SideSeatTheme.spaceLG) {
            Button("Add suggestion") {
                Task {
                    await store.mutate("activities", body: SuggestPlanActivityRequest(title: draftTitle.trimmingCharacters(in: .whitespacesAndNewlines), location: ""), session: session)
                    if store.error == nil { draftTitle = ""; showsSuggestion = false; suggestionFocused = false }
                }
            }.font(.subheadline.weight(.medium)).frame(minHeight: 44).accessibilityIdentifier("plan-activity-add")
                .disabled(!store.canMutate || draftTitle.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || draftTitle.count > 120)
            Button("Cancel") { showsSuggestion = false; suggestionFocused = false; draftTitle = "" }.font(.subheadline).frame(minHeight: 44).disabled(store.acting)
            }
        }.disabled(store.acting)
    }

    private func ideaRow(_ idea: NativePlanActivity.Idea) -> some View {
        let layout = typeSize.isAccessibilitySize
            ? AnyLayout(VStackLayout(alignment: .leading, spacing: SideSeatTheme.spaceXS))
            : AnyLayout(HStackLayout(alignment: .center, spacing: SideSeatTheme.spaceSM))
        return layout {
            ideaIdentity(idea)
            Button {
                Task { await store.mutate("activities/interest", method: .put, body: PlanActivityInterestRequest(ideaId: idea.id, interested: !idea.isInterested), session: session) }
            } label: {
                Label(String(format: AppLocalization.string("%d interested"), idea.interestedBy.count),
                      systemImage: idea.isInterested ? "heart.fill" : "heart")
                    .font(.caption.weight(.medium)).fixedSize(horizontal: false, vertical: true)
                    .frame(minHeight: 44).contentShape(Rectangle())
                    .foregroundStyle(idea.isInterested ? SideSeatTheme.utilityAction : SideSeatTheme.textSecondaryStrong)
            }.buttonStyle(.plain).disabled(!store.canMutate)
                .accessibilityLabel(AppLocalization.string(idea.isInterested ? "Interest marked" : "I'm interested"))
                .accessibilityIdentifier("plan-activity-interest-\(idea.id)")
                .accessibilityValue(String(format: AppLocalization.string("%d interested"), idea.interestedBy.count))
        }
        .padding(.vertical, SideSeatTheme.spaceXS)
        .accessibilityElement(children: .contain).accessibilityIdentifier("plan-activity-idea-\(idea.id)")
    }

    private func ideaIdentity(_ idea: NativePlanActivity.Idea) -> some View {
        VStack(alignment: .leading, spacing: SideSeatTheme.spaceXS) {
            Text(idea.title).font(.subheadline.weight(.medium)).fixedSize(horizontal: false, vertical: true)
            if let location = idea.location, !location.isEmpty { Label(location, systemImage: "mappin.and.ellipse").font(.caption).foregroundStyle(SideSeatTheme.textSecondaryStrong) }
        }.frame(maxWidth: .infinity, alignment: .leading)
            .accessibilityLabel(idea.title + ", " + String(format: AppLocalization.string("%@ suggested this"), idea.authorName))
    }
}
