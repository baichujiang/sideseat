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
    @State private var title = ""
    @State private var dates: Set<DateComponents> = [Calendar.current.dateComponents([.era, .year, .month, .day], from: Calendar.current.date(byAdding: .day, value: 1, to: Date())!)]
    @State private var startMinute = 9 * 60
    @State private var endMinute = 17 * 60
    @State private var planningMode = "COLLECT"
    @State private var hasChosenTiming = false
    @FocusState private var titleFocused: Bool
    @State private var location = ""
    @State private var durationMinutes = 60
    @State private var expectedCount = 5
    @State private var fixedStart = Date(timeIntervalSince1970: ceil(Date().addingTimeInterval(3600).timeIntervalSince1970 / 900) * 900)
    @State private var creating = false
    @State private var error: String?
    @State private var createKey = UUID().uuidString
    let onCreate: (NativeTimePoll) -> Void

    var body: some View {
        Group {
            if !hasChosenTiming {
                ScrollView {
                    VStack(alignment: .leading, spacing: SideSeatTheme.spaceLG) {
                        Text("How would you like to plan?").font(.largeTitle.weight(.bold))
                            .fixedSize(horizontal: false, vertical: true)
                        Text("Choose what you know now. We'll guide you through the next step.")
                            .font(.body).foregroundStyle(SideSeatTheme.textSecondaryStrong)
                        timingChoice("COLLECT", title: "We haven't picked a time", detail: "Friends fill in their free time. You choose a time and send an invitation.", symbol: "calendar.badge.clock")
                        timingChoice("FIXED", title: "We already have a time", detail: "Set the date and send a link. Everyone confirms before it goes into Calendar.", symbol: "calendar.badge.checkmark")
                        Label("Friends can join from the link. No app download needed.", systemImage: "link")
                            .font(.footnote).foregroundStyle(SideSeatTheme.textSecondaryStrong)
                    }.padding(SideSeatTheme.spaceLG)
                }.background(SideSeatTheme.bgGrouped)
            } else {
                detailsForm
            }
        }
        .navigationTitle("Create a plan").navigationBarTitleDisplayMode(.inline)
        .onChange(of: "\(title)|\(location)|\(durationMinutes)|\(expectedCount)|\(planningMode)|\(fixedStart)|\(dates)|\(startMinute)|\(endMinute)") { _, _ in createKey = UUID().uuidString }
        .toolbar {
            ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() }.disabled(creating) }
        }
        .safeAreaInset(edge: .bottom, spacing: 0) {
            if hasChosenTiming {
                VStack(alignment: .leading, spacing: SideSeatTheme.spaceSM) {
                    Text(title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? "Give your plan a title to continue." : planningMode == "FIXED" ? "Next: share the invitation link with friends." : "Next: fill in your free time and share the link.")
                        .font(.caption).foregroundStyle(SideSeatTheme.textSecondaryStrong)
                    SSPrimaryButton(title: AppLocalization.string(planningMode == "FIXED" ? "Create invitation link" : "Create and fill in my time"),
                                    isLoading: creating, fill: .product, accessibilityID: "time-poll-create-confirm") {
                        titleFocused = false
                        Task { await create() }
                    }.disabled(!canCreate)
                }
                .padding(SideSeatTheme.spaceMD).background(SideSeatTheme.surface)
                .overlay(alignment: .top) { Divider() }
            }
        }
    }

    private func timingChoice(_ mode: String, title: LocalizedStringKey, detail: LocalizedStringKey, symbol: String) -> some View {
        Button {
            planningMode = mode
            hasChosenTiming = true
        } label: {
            VStack(alignment: .leading, spacing: SideSeatTheme.spaceMD) {
                HStack {
                    Image(systemName: symbol).font(.title).accessibilityHidden(true)
                    Spacer()
                    Image(systemName: "arrow.right").font(.headline).accessibilityHidden(true)
                }
                Text(title).font(.title3.weight(.semibold))
                Text(detail).font(.subheadline).foregroundStyle(SideSeatTheme.textSecondaryStrong)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .frame(maxWidth: .infinity, alignment: .leading).padding(SideSeatTheme.spaceLG)
            .background(SideSeatTheme.surface, in: RoundedRectangle(cornerRadius: SideSeatTheme.cardRadius))
        }
        .buttonStyle(SSPressButtonStyle()).foregroundStyle(SideSeatTheme.textPrimary)
        .accessibilityIdentifier(mode == "FIXED" ? "plan-mode-fixed" : "plan-mode-collect")
    }

    private var detailsForm: some View {
        Form {
            Section {
                VStack(alignment: .leading, spacing: SideSeatTheme.spaceSM) {
                    Label(planningMode == "FIXED" ? "We already have a time" : "We haven't picked a time", systemImage: planningMode == "FIXED" ? "calendar.badge.checkmark" : "calendar.badge.clock")
                        .font(.headline)
                    PlanJourneyProgress(phase: planningMode == "FIXED" ? "INVITING" : "COLLECTING", fixed: planningMode == "FIXED")
                    Button("Change planning method") { titleFocused = false; hasChosenTiming = false }
                        .font(.subheadline).frame(minHeight: 44).accessibilityIdentifier("plan-change-method")
                }
            }
            Section("What's the plan?") {
                TextField("For example: Friday dinner", text: $title)
                    .focused($titleFocused).submitLabel(.done).onSubmit { titleFocused = false }
                    .accessibilityIdentifier("time-poll-title")
                TextField("Location (optional)", text: $location).accessibilityIdentifier("unified-plan-location")
            }
            Section {
                Stepper(String(format: AppLocalization.string("%d participants including you"), expectedCount), value: $expectedCount, in: 2...20)
                    .accessibilityIdentifier("unified-plan-participant-count")
            } header: { Text("How many people?") } footer: {
                Text(planningMode == "FIXED" ? "Include yourself. The plan is confirmed when this many people have accepted." : "Include yourself. This is an estimate; you choose the final invitation list later.")
            }
            if planningMode == "FIXED" {
                Section("When are we meeting?") {
                    DatePicker("Starts", selection: $fixedStart, in: Date()...).accessibilityIdentifier("unified-plan-fixed-start")
                    Picker("Activity duration", selection: $durationMinutes) {
                        ForEach([30, 45, 60, 90, 120, 180, 240], id: \.self) { Text(String(format: AppLocalization.string("%d minutes"), $0)).tag($0) }
                    }.accessibilityIdentifier("unified-plan-duration")
                    LabeledContent("Time zone", value: TimeZone.current.identifier)
                }
            } else {
                Section("Which days could work?") {
                    MultiDatePicker("Choose dates", selection: $dates, in: Calendar.current.startOfDay(for: Date())...)
                        .accessibilityIdentifier("time-poll-dates")
                    Text("Choose up to 31 dates.").font(.caption).foregroundStyle(.secondary)
                }
                Section {
                    Picker("From", selection: $startMinute) { ForEach(Array(stride(from: 0, to: 1440, by: 30)), id: \.self) { Text(clock($0)).tag($0) } }
                        .accessibilityIdentifier("time-poll-from")
                    Picker("Until", selection: $endMinute) { ForEach(Array(stride(from: 30, through: 1440, by: 30)), id: \.self) { Text(clock($0)).tag($0) } }
                        .accessibilityIdentifier("time-poll-until")
                    LabeledContent("Time zone", value: TimeZone.current.identifier)
                } header: { Text("Hours to choose from") } footer: {
                    Text("These are the hours people can mark as free, not the final activity time.")
                }
            }
            if let message = validationMessage { Section { Text(message).font(.footnote).foregroundStyle(SideSeatTheme.danger) } }
            if let error { Section { Text(error).foregroundStyle(SideSeatTheme.danger) } }
        }.scrollDismissesKeyboard(.interactively)
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
                body: CreateTimePollRequest(title: title, timeZone: TimeZone.current.identifier, dates: keys, startMinute: startMinute, endMinute: endMinute, location: location, durationMinutes: planningMode == "FIXED" ? durationMinutes : nil, expectedCount: expectedCount, planningMode: planningMode, fixedStart: planningMode == "FIXED" ? ISO8601DateFormatter().string(from: fixedStart) : nil),
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
    @State private var results = false
    @State private var showsDelete = false
    @State private var showsCancelPlan = false
    @State private var deleting = false
    @State private var showsInvite = false
    @State private var choosingAgain = false
    @State private var completed = false
    @State private var finishWhenSaved = false
    @State private var now = Date()
    @FocusState private var nameFocused: Bool

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
                        Button("Retry") { if deleting { Task { await delete() } } else { store.save(session: session) } }
                    }.padding(.horizontal, SideSeatTheme.spaceMD)
                }
                } else {
                    UnifiedPlanConfirmationView(poll: poll, store: store) {
                        choosingAgain = true; results = true
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
        .navigationTitle("Plan together").navigationBarTitleDisplayMode(.inline)
        .safeAreaInset(edge: .bottom, spacing: 0) {
            if let poll = store.poll, poll.planningPhase == "COLLECTING", !results {
                selectionFooter(poll)
            } else if let poll = store.poll, (poll.planningPhase == "COLLECTING" || choosingAgain), results {
                resultsFooter(poll)
            }
        }
        .toolbar {
            if let poll = store.poll {
                ToolbarItem(placement: .topBarTrailing) {
                    Menu {
                        ShareLink(item: poll.shareUrl) { Label("Share poll", systemImage: "square.and.arrow.up") }
                        Button { UIPasteboard.general.url = poll.shareUrl } label: { Label("Copy link", systemImage: "doc.on.doc") }
                        if poll.isOwner && ["INVITING", "CONFIRMED"].contains(poll.planningPhase) {
                            Button("Cancel plan", role: .destructive) { showsCancelPlan = true }.accessibilityIdentifier("unified-plan-cancel")
                        }
                        if poll.isOwner && ["COLLECTING", "CANCELLED", "EXPIRED"].contains(poll.planningPhase) { Button("Delete poll", role: .destructive) { showsDelete = true } }
                    } label: { Image(systemName: "ellipsis") }.accessibilityIdentifier("time-poll-menu")
                }
            }
        }
        .confirmationDialog("Cancel this plan for everyone?", isPresented: $showsCancelPlan, titleVisibility: .visible) {
            Button("Cancel plan", role: .destructive) {
                Task { await store.mutate("cancel", body: CancelPollPlanRequest(version: store.poll?.invitationVersion ?? 0), session: session) }
            }
        }
        .confirmationDialog("Delete this poll and all responses?", isPresented: $showsDelete, titleVisibility: .visible) {
            Button("Delete poll", role: .destructive) { Task { await delete() } }
        }
        .sheet(isPresented: $showsInvite) { if let poll = store.poll { UnifiedPlanInviteView(poll: poll, store: store).dynamicTypeSize(typeSize) } }
        .onChange(of: store.poll?.invitationVersion) { _, _ in choosingAgain = false }
        .onChange(of: nameFocused) { old, new in if old && !new && store.displayName.trimmingCharacters(in: .whitespacesAndNewlines) != store.poll?.myDisplayName { store.save(session: session) } }
        .onChange(of: results) { _, new in nameFocused = false; if !new { completed = false } }
        .onChange(of: store.saving) { _, new in
            if !new && finishWhenSaved {
                finishWhenSaved = false
                if store.saved { completed = true; results = true }
            }
        }
        .task {
            await store.load(session: session)
            if store.poll?.didRespond == true { results = true }
            while !Task.isCancelled {
                do { try await Task.sleep(for: .seconds(10)) } catch { return }
                if scenePhase == .active && !nameFocused { await store.load(session: session) }
            }
        }
        .onChange(of: scenePhase) { _, phase in if phase == .active { Task { await store.load(session: session) } } }
        .onReceive(Timer.publish(every: 1, on: .main, in: .common).autoconnect()) { date in
            if let expiry = store.poll?.expirationDate, now < expiry, expiry <= date { now = date }
        }
    }

    @ViewBuilder private func collectionSurface(_ poll: NativeTimePoll) -> some View {
        if typeSize.isAccessibilitySize {
            GeometryReader { geometry in
                ScrollView {
                    VStack(spacing: SideSeatTheme.spaceMD) {
                        collectionHeader(poll)
                        TimePollGrid(poll: poll, selected: $store.selected, results: results) { store.save(session: session) }
                            .frame(height: max(500, geometry.size.height))
                    }
                }
            }
        } else {
            collectionHeader(poll)
            TimePollGrid(poll: poll, selected: $store.selected, results: results) { store.save(session: session) }
        }
    }

    private func collectionHeader(_ poll: NativeTimePoll) -> some View {
        VStack(alignment: .leading, spacing: SideSeatTheme.spaceSM) {
            PlanJourneyProgress(phase: "COLLECTING")
            Text(poll.title).font(.title3.weight(.bold))
                .fixedSize(horizontal: false, vertical: true).accessibilityIdentifier("time-poll-detail-title")
            ViewThatFits(in: .horizontal) {
                HStack {
                    Label(dateRange(poll), systemImage: "calendar")
                    Text("· " + poll.timeZone)
                }
                VStack(alignment: .leading, spacing: 3) {
                    Label(dateRange(poll), systemImage: "calendar")
                    Text(String(format: AppLocalization.string("All times in %@"), poll.timeZone))
                }
            }
            .font(.caption).foregroundStyle(SideSeatTheme.textSecondaryStrong)
            .accessibilityIdentifier("time-poll-date-range")
            if let location = poll.location, !location.isEmpty { Label(location, systemImage: "mappin.and.ellipse").font(.caption).foregroundStyle(SideSeatTheme.textSecondaryStrong) }
            if poll.isOwner && !results { PlanShareActions(poll: poll) }
            Picker("Availability", selection: $results) {
                Text("My availability").tag(false)
                Text("Group results").tag(true)
            }.pickerStyle(.segmented).accessibilityIdentifier("time-poll-mode").disabled(choosingAgain)
            if results {
                if completed {
                    Label("Your availability is saved. You can edit it anytime.", systemImage: "checkmark.circle.fill")
                        .font(.caption).foregroundStyle(SideSeatTheme.statusSuccessText)
                        .accessibilityIdentifier("time-poll-completed")
                }
                summary(poll)
            } else {
                HStack(spacing: SideSeatTheme.spaceSM) {
                    Text("Filling in as").font(.caption).foregroundStyle(SideSeatTheme.textSecondaryStrong)
                    TextField("Your name", text: $store.displayName)
                        .font(.subheadline.weight(.medium)).focused($nameFocused).submitLabel(.done)
                        .onSubmit { store.save(session: session); nameFocused = false }
                        .accessibilityLabel("Your name in this plan").accessibilityIdentifier("time-poll-name")
                    Button { nameFocused = true } label: { Image(systemName: "pencil") }
                        .frame(minWidth: 44, minHeight: 44).accessibilityLabel("Edit nickname")
                        .accessibilityIdentifier("time-poll-edit-name")
                    if !poll.didRespond && store.selected.isEmpty {
                        Button("No free time") { store.save(session: session) }
                            .font(.caption).accessibilityIdentifier("time-poll-none")
                    }
                }
            }
        }.padding(.horizontal, SideSeatTheme.spaceMD)
    }

    private func resultsFooter(_ poll: NativeTimePoll) -> some View {
        VStack(alignment: .leading, spacing: SideSeatTheme.spaceSM) {
            if poll.isOwner {
                if poll.participants.contains(where: { !$0.isMe }) {
                    Text("Choose the final time and invite people. Everyone still needs to confirm.")
                        .font(.caption).foregroundStyle(SideSeatTheme.textSecondaryStrong)
                    SSPrimaryButton(title: AppLocalization.string("Choose time and invite"), fill: .product,
                                    accessibilityID: "unified-plan-invite-window") { showsInvite = true }
                        .disabled(!store.canMutate || poll.slots.isEmpty)
                } else {
                    Text("Share this link so at least one friend can fill in their free time.")
                        .font(.caption).foregroundStyle(SideSeatTheme.textSecondaryStrong)
                    PlanShareActions(poll: poll, prominent: true)
                }
            } else {
                Text("Your free time is saved. The organizer will choose a time for you to confirm.")
                    .font(.subheadline).foregroundStyle(SideSeatTheme.textSecondaryStrong)
                SSPrimaryButton(title: AppLocalization.string("Back to plans"), fill: .product,
                                accessibilityID: "plan-done-back") { dismiss() }
            }
        }
        .padding(SideSeatTheme.spaceMD).background(SideSeatTheme.surface)
        .overlay(alignment: .top) { Divider() }
    }

    private func selectionFooter(_ poll: NativeTimePoll) -> some View {
        let failed = !store.saved && !store.saving && store.error != nil
        return HStack(spacing: SideSeatTheme.spaceSM) {
            HStack(spacing: SideSeatTheme.spaceSM) {
                if store.saving { ProgressView().controlSize(.small) }
                else { Image(systemName: failed ? "exclamationmark.circle" : store.saved ? "checkmark.circle.fill" : "circle")
                    .foregroundStyle(failed ? SideSeatTheme.danger : store.saved ? SideSeatTheme.statusSuccessText : SideSeatTheme.textSecondaryStrong) }
                VStack(alignment: .leading, spacing: 3) {
                    Text(store.saving ? "Saving…" : failed ? "Couldn't save" : store.saved ? "Availability saved automatically" : "Choose when you're free")
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(store.saved ? SideSeatTheme.statusSuccessText : SideSeatTheme.textPrimary)
                        .accessibilityIdentifier(store.saved ? "time-poll-saved" : "time-poll-save-state")
                    Text(failed ? AppLocalization.string("Your choices are kept. Please retry.") : store.saving ? AppLocalization.string("Finish once saving completes") : store.saved ? selectionSummary(poll) : AppLocalization.string("Changes save automatically"))
                        .font(.caption).foregroundStyle(.secondary)
                }.accessibilityElement(children: .contain)
            }
            Spacer(minLength: 0)
            Button {
                if failed { store.save(session: session) }
                else {
                    nameFocused = false
                    if store.displayName.trimmingCharacters(in: .whitespacesAndNewlines) != poll.myDisplayName {
                        finishWhenSaved = true; store.save(session: session)
                    } else { completed = true; results = true }
                }
            } label: {
                Text(failed ? "Retry" : "Done selecting")
                    .foregroundStyle(SideSeatTheme.ProductAction.foreground)
            }
            .font(.subheadline.weight(.semibold)).frame(minHeight: 44)
            .buttonStyle(.borderedProminent).tint(SideSeatTheme.ProductAction.fill)
            .disabled(store.saving || store.acting || (!failed && !store.saved))
            .accessibilityIdentifier("time-poll-finish")
        }
        .padding(.horizontal, SideSeatTheme.spaceMD).padding(.vertical, SideSeatTheme.spaceSM)
        .background(SideSeatTheme.surface).overlay(alignment: .top) { Divider() }
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

    private func summary(_ poll: NativeTimePoll) -> some View {
        VStack(alignment: .leading, spacing: 5) {
            HStack {
                Text("Group timetable").font(.headline).accessibilityIdentifier("time-poll-result-heading")
                Spacer()
                Text(String(format: AppLocalization.string("%d people responded"), poll.summary.participantCount))
                    .font(.caption).foregroundStyle(SideSeatTheme.textSecondaryStrong)
            }
            if poll.isOwner && poll.participants.contains(where: { !$0.isMe }) { PlanShareActions(poll: poll) }
            Text(poll.participants.map { $0.displayName + ($0.isGuest == true ? " (" + AppLocalization.string("Guest") + ")" : "") }.joined(separator: " · "))
                .font(.caption).foregroundStyle(SideSeatTheme.textSecondaryStrong).lineLimit(2)
                .accessibilityIdentifier("time-poll-participants")
        }.accessibilityElement(children: .contain)
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
    let results: Bool
    let onSave: () -> Void
    @State private var dragStart: (Int, Int)?
    @Environment(\.dynamicTypeSize) private var typeSize
    @State private var original = Set<Int>()
    @State private var preview: Set<Int>?
    @State private var selecting = true
    @State private var undoSelection: Set<Int>?
    private var cellHeight: CGFloat { typeSize.isAccessibilitySize ? 64 : 44 }
    private let labelWidth: CGFloat = 60
    private var headerHeight: CGFloat { typeSize.isAccessibilitySize ? 88 : 48 }

    var body: some View {
        let rows = poll.rows
        let cells = poll.cells
        let lookup = Dictionary(uniqueKeysWithValues: cells.map { ("\($0.date)|\($0.row)", $0) })
        let participantSelections = poll.participants.map { Set($0.slotIds) }
        let timeFormatter = timePollClockFormatter(poll.timeZone)
        VStack(spacing: SideSeatTheme.spaceSM) {
            if !results {
                HStack(alignment: .center, spacing: SideSeatTheme.spaceSM) {
                    Text("Tap your free time. Each cell is 30 minutes. Tap a date to select the day.")
                        .font(.caption).foregroundStyle(.secondary)
                    Spacer(minLength: 0)
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
                }.padding(.horizontal, SideSeatTheme.spaceMD)
                let legendLayout = typeSize.isAccessibilitySize ? AnyLayout(VStackLayout(alignment: .leading, spacing: 6)) : AnyLayout(HStackLayout(alignment: .top, spacing: SideSeatTheme.spaceSM))
                legendLayout {
                    Label { Text("Selected slots") } icon: {
                        Image(systemName: "checkmark.circle.fill").foregroundStyle(SideSeatTheme.Availability.selectedFill)
                    }
                    Label { Text("Partially selected") } icon: {
                        Image(systemName: "minus.circle.fill").foregroundStyle(SideSeatTheme.Availability.onPartial)
                    }
                    Label("Unselected slots", systemImage: "circle")
                }
                .font(.caption2).foregroundStyle(SideSeatTheme.textSecondaryStrong)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, SideSeatTheme.spaceMD)
            } else {
                Text("Darker cells mean more people are available. Numbers show attendance per slot.")
                    .font(.caption).foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.horizontal, SideSeatTheme.spaceMD)
            }
            GeometryReader { geometry in
                let cellWidth = max(88, (geometry.size.width - labelWidth) / CGFloat(max(1, min(4, poll.dates.count))))
                ScrollView(.vertical) {
                    HStack(alignment: .top, spacing: 0) {
                        VStack(spacing: 0) {
                            Text("Time").font(.caption).frame(width: labelWidth, height: headerHeight)
                            ForEach(rows, id: \.self) { row in
                                Text(poll.slots.first { $0.row == row }?.label ?? "")
                                    .font(.caption2.monospacedDigit())
                                    .minimumScaleFactor(0.7)
                                    .frame(width: labelWidth, height: cellHeight)
                            }
                        }
                        ScrollView(.horizontal) {
                            VStack(spacing: 0) {
                                HStack(spacing: 0) {
                                    ForEach(poll.dates, id: \.self) { date in
                                        if results {
                                            Text(timePollDateLabel(date)).font(.caption.weight(.semibold))
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
                                                    ZStack {
                                                        Rectangle().fill(results ? SideSeatTheme.success.opacity(count == 0 ? 0.06 : 0.14 + 0.42 * Double(count) / Double(max(1, poll.summary.participantCount))) : active ? SideSeatTheme.Availability.selectedFill : partial ? SideSeatTheme.Availability.partialFill : SideSeatTheme.surface)
                                                        Rectangle().strokeBorder(active && !results ? SideSeatTheme.Availability.onSelected.opacity(0.3) : SideSeatTheme.separator, lineWidth: 0.5)
                                                        if results { Text("\(count)").font(.caption.monospacedDigit()).foregroundStyle(.primary) }
                                                        else if active { Image(systemName: "checkmark").font(.caption.weight(.medium)).foregroundStyle(SideSeatTheme.Availability.onSelected) }
                                                        else if partial { Image(systemName: "minus").font(.caption.weight(.medium)).foregroundStyle(SideSeatTheme.Availability.onPartial) }
                                                    }.frame(width: cellWidth, height: cellHeight)
                                                    .accessibilityElement()
                                                    .accessibilityLabel("\(date), \(slot.label)–\(timeFormatter.string(from: slot.end)), \(results ? String(count) : AppLocalization.string(active ? "Available" : partial ? "Some times selected" : "Unavailable"))")
                                                    .accessibilityIdentifier("time-poll-cell-\(slot.id)")
                                                    .accessibilityAddTraits(results ? [] : .isButton)
                                                    .accessibilityAddTraits(active && !results ? .isSelected : [])
                                                    .accessibilityAction { toggle(slot) }
                                                } else { Color.clear.frame(width: cellWidth, height: cellHeight) }
                                            }
                                        }
                                    }
                                }
                                .overlay {
                                    if !results {
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
                        }.frame(width: max(0, geometry.size.width - labelWidth), height: headerHeight + cellHeight * CGFloat(rows.count))
                    }
                }
                .accessibilityIdentifier("time-poll-grid")
            }
        }
        .onChange(of: results) { _, _ in clearPreview() }
        .onDisappear { clearPreview() }
    }

    private func dayButton(_ date: String, width: CGFloat) -> some View {
        let slots = Set(poll.slots.filter { $0.date == date }.map(\.id))
        let allSelected = !slots.isEmpty && slots.isSubset(of: selected)
        let partlySelected = !allSelected && !slots.isDisjoint(with: selected)
        return Button {
            apply(allSelected ? selected.subtracting(slots) : selected.union(slots))
        } label: {
            HStack(spacing: 4) {
                Text(timePollDateLabel(date)).multilineTextAlignment(.center)
                Image(systemName: allSelected ? "checkmark.circle.fill" : partlySelected ? "minus.circle" : "circle")
            }
            .font(.caption.weight(.semibold))
            .frame(width: width - 6, height: headerHeight - 4)
            .foregroundStyle(allSelected ? SideSeatTheme.Availability.onSelected : partlySelected ? SideSeatTheme.Availability.onPartial : SideSeatTheme.textPrimary)
            .background(allSelected ? SideSeatTheme.Availability.selectedFill : partlySelected ? SideSeatTheme.Availability.partialFill : Color.clear, in: RoundedRectangle(cornerRadius: 8))
            .overlay {
                RoundedRectangle(cornerRadius: 8).strokeBorder(allSelected ? SideSeatTheme.Availability.selectedFill : partlySelected ? SideSeatTheme.Availability.onPartial.opacity(0.5) : SideSeatTheme.separator, lineWidth: 0.5)
            }
            .frame(width: width, height: headerHeight)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .disabled(slots.isEmpty || dragStart != nil)
        .accessibilityLabel(timePollDateLabel(date).replacingOccurrences(of: "\n", with: ", "))
        .accessibilityValue(AppLocalization.string(allSelected ? "All times selected" : partlySelected ? "Some times selected" : "No times selected"))
        .accessibilityHint(AppLocalization.string(allSelected ? "Deselect all times for this day" : "Select all times for this day"))
        .accessibilityAddTraits(allSelected ? .isSelected : [])
        .accessibilityIdentifier("time-poll-day-\(date)")
    }

    private func updateRange(_ state: UIGestureRecognizer.State, point: CGPoint, rows: [String], cellWidth: CGFloat, lookup: [String: NativeTimePoll.Cell]) {
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

    private func toggle(_ cell: NativeTimePoll.Cell) {
        guard !results else { return }
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
