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
    @Environment(\.dynamicTypeSize) private var typeSize
    @State private var title = ""
    @State private var dates: Set<DateComponents> = [Calendar.current.dateComponents([.era, .year, .month, .day], from: Calendar.current.date(byAdding: .day, value: 1, to: Date())!)]
    @State private var startMinute = 9 * 60
    @State private var endMinute = 17 * 60
    @State private var planningMode = "COLLECT"
    @State private var chooseActivityTogether = false
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
                        PlanTaskHeader(step: chooseActivityTogether ? "Choose together" : "Step 1 of 2", title: "What would you like to do together?", detail: chooseActivityTogether ? "Start with a theme. Friends can suggest activities and mark interest." : "Start with the activity. You can decide the time together.")
                        let startLayout = typeSize.isAccessibilitySize ? AnyLayout(VStackLayout(spacing: SideSeatTheme.spaceSM)) : AnyLayout(HStackLayout(spacing: SideSeatTheme.spaceSM))
                        startLayout {
                            activityStartingPoint(together: false, title: "Activity already decided", symbol: "checkmark.circle")
                            activityStartingPoint(together: true, title: "Choose an activity together", symbol: "lightbulb")
                        }
                        VStack(alignment: .leading, spacing: SideSeatTheme.spaceMD) {
                            TextField(chooseActivityTogether ? "For example: what shall we do this weekend?" : "For example: Friday dinner", text: $title)
                                .font(.title3.weight(.medium)).focused($titleFocused)
                                .submitLabel(.done).onSubmit { titleFocused = false }
                                .accessibilityIdentifier("time-poll-title")
                            Divider()
                            TextField("Location (optional)", text: $location)
                                .accessibilityIdentifier("unified-plan-location")
                        }
                        .padding(SideSeatTheme.spaceLG)
                        .background(SideSeatTheme.surface, in: RoundedRectangle(cornerRadius: SideSeatTheme.cardRadius))
                        if !chooseActivityTogether { ViewThatFits(in: .horizontal) {
                            HStack { activityExample("Study together"); activityExample("Have a meal"); activityExample("Play sports") }
                            VStack(alignment: .leading) { activityExample("Study together"); activityExample("Have a meal"); activityExample("Play sports") }
                        } }
                        if chooseActivityTogether {
                            Label("Everyone can suggest activities. Interest does not confirm attendance.", systemImage: "person.2")
                                .font(.subheadline).foregroundStyle(SideSeatTheme.textSecondaryStrong).fixedSize(horizontal: false, vertical: true)
                            Button { titleFocused = false; hasChosenTiming = true } label: {
                                Label("Review dates and hours", systemImage: "calendar").font(.subheadline).frame(minHeight: 44)
                            }.accessibilityIdentifier("plan-activity-date-options")
                            Text(String(format: AppLocalization.string("%d candidate days — you can start without changing them"), dates.count))
                                .font(.caption).foregroundStyle(SideSeatTheme.textSecondaryStrong).fixedSize(horizontal: false, vertical: true)
                        } else { VStack(alignment: .leading, spacing: SideSeatTheme.spaceSM) {
                            Text("Have you picked a time?").font(.headline)
                            timingChoice("COLLECT", title: "Time not set: find it together", detail: "Let friends mark when they're free.", symbol: "calendar.badge.clock")
                            timingChoice("FIXED", title: "The time is already set", detail: "Ask friends to confirm a specific time.", symbol: "calendar.badge.checkmark")
                        } }
                        if let message = validationMessage, title.count > 120 || location.count > 200 {
                            Text(message).font(.footnote).foregroundStyle(SideSeatTheme.danger)
                        }
                    }.padding(SideSeatTheme.spaceLG)
                }.scrollDismissesKeyboard(.interactively).background(SideSeatTheme.bgGrouped)
            } else {
                detailsForm
            }
        }
        .navigationTitle("Create activity").navigationBarTitleDisplayMode(.inline)
        .onChange(of: "\(title)|\(location)|\(durationMinutes)|\(expectedCount)|\(planningMode)|\(chooseActivityTogether)|\(fixedStart)|\(dates)|\(startMinute)|\(endMinute)") { _, _ in createKey = UUID().uuidString }
        .toolbar {
            ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() }.disabled(creating) }
        }
        .safeAreaInset(edge: .bottom, spacing: 0) {
            VStack(alignment: .leading, spacing: SideSeatTheme.spaceSM) {
                if hasChosenTiming || chooseActivityTogether {
                    if !typeSize.isAccessibilitySize {
                        Text(chooseActivityTogether ? "Next: share the plan so friends can suggest activities." : planningMode == "FIXED" ? "Next: share the invitation link with friends." : "Next: view and share the timetable. You can add your own free time anytime.")
                            .font(.caption).foregroundStyle(SideSeatTheme.textSecondaryStrong)
                    }
                    PlanActionButton(title: AppLocalization.string(chooseActivityTogether ? "Start choosing an activity" : planningMode == "FIXED" ? "Create invitation link" : "Create timetable"),
                                     symbol: chooseActivityTogether ? "lightbulb" : "plus", kind: .commit, isLoading: creating, accessibilityID: "time-poll-create-confirm") {
                        titleFocused = false; Task { await create() }
                    }.disabled(!canCreate)
                } else {
                    if title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && !typeSize.isAccessibilitySize {
                        Text(chooseActivityTogether ? "Give this plan a theme, such as a weekend together." : "Type an activity name or choose an example above.")
                            .font(.caption).foregroundStyle(SideSeatTheme.textSecondaryStrong)
                    }
                    PlanActionButton(title: AppLocalization.string(typeSize.isAccessibilitySize ? "Choose dates" : "Next: choose dates"), symbol: "calendar",
                                    accessibilityID: "plan-create-next") { titleFocused = false; hasChosenTiming = true }
                        .disabled(title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || title.count > 120 || location.count > 200)
                }
            }
            .padding(SideSeatTheme.spaceMD).background(SideSeatTheme.surface)
            .overlay(alignment: .top) { Divider() }
        }
    }

    private func activityStartingPoint(together: Bool, title: String, symbol: String) -> some View {
        let selected = chooseActivityTogether == together
        return Button {
            chooseActivityTogether = together
            if together {
                planningMode = "COLLECT"
                dates = Set((1...7).compactMap { Calendar.current.date(byAdding: .day, value: $0, to: Date()) }
                    .map { Calendar.current.dateComponents([.era, .year, .month, .day], from: $0) })
            }
            titleFocused = false
        } label: {
            HStack(spacing: SideSeatTheme.spaceSM) {
                Image(systemName: symbol).accessibilityHidden(true)
                Text(LocalizedStringKey(title)).fixedSize(horizontal: false, vertical: true)
                Spacer(minLength: 0)
                Image(systemName: selected ? "checkmark.circle.fill" : "circle").accessibilityHidden(true)
            }.font(.subheadline.weight(selected ? .semibold : .regular))
                .padding(SideSeatTheme.spaceMD).frame(maxWidth: .infinity, minHeight: 48, alignment: .leading)
                .background(selected ? SideSeatTheme.ControlSelection.fill : SideSeatTheme.surface,
                            in: RoundedRectangle(cornerRadius: SideSeatTheme.controlRadius))
                .overlay { RoundedRectangle(cornerRadius: SideSeatTheme.controlRadius).strokeBorder(selected ? SideSeatTheme.ControlSelection.border : SideSeatTheme.separator, lineWidth: 1) }
        }.buttonStyle(.plain).foregroundStyle(SideSeatTheme.textPrimary)
            .accessibilityValue(selected ? "Selected" : "Not selected")
            .accessibilityIdentifier(together ? "plan-start-together" : "plan-start-known-activity")
    }

    private func activityExample(_ value: String) -> some View {
        Button { title = AppLocalization.string(String.LocalizationValue(value)); titleFocused = false } label: {
            Text(LocalizedStringKey(value)).font(.subheadline)
                .padding(.horizontal, 14).frame(minHeight: 44)
                .background(SideSeatTheme.surface, in: Capsule())
        }.buttonStyle(.plain).foregroundStyle(SideSeatTheme.utilityAction)
    }

    private func timingChoice(_ mode: String, title: LocalizedStringKey, detail: LocalizedStringKey, symbol: String) -> some View {
        Button { planningMode = mode; titleFocused = false } label: {
            HStack(alignment: .center, spacing: SideSeatTheme.spaceMD) {
                Image(systemName: symbol).font(.title2).frame(width: 32).accessibilityHidden(true)
                VStack(alignment: .leading, spacing: 5) {
                    Text(title).font(.subheadline.weight(.semibold))
                    Text(detail).font(.caption).foregroundStyle(SideSeatTheme.textSecondaryStrong)
                        .fixedSize(horizontal: false, vertical: true)
                }.frame(maxWidth: .infinity, alignment: .leading)
                Image(systemName: planningMode == mode ? "checkmark.circle.fill" : "circle").accessibilityHidden(true)
            }
            .padding(SideSeatTheme.spaceMD)
            .background(SideSeatTheme.surface, in: RoundedRectangle(cornerRadius: SideSeatTheme.controlRadius))
            .overlay { RoundedRectangle(cornerRadius: SideSeatTheme.controlRadius).strokeBorder(planningMode == mode ? SideSeatTheme.utilityAction : .clear, lineWidth: 1.5) }
        }
        .buttonStyle(.plain).foregroundStyle(SideSeatTheme.textPrimary)
        .accessibilityAddTraits(planningMode == mode ? .isSelected : [])
        .accessibilityIdentifier(mode == "FIXED" ? "plan-mode-fixed" : "plan-mode-collect")
    }

    private var detailsForm: some View {
        Form {
            Section {
                PlanTaskHeader(step: "Step 2 of 2", title: planningMode == "FIXED" ? "When are we meeting?" : "Which dates could work?",
                               detail: planningMode == "FIXED" ? "Friends will confirm this exact time." : "Choose possible days. The final time comes after everyone fills in.")
                HStack {
                    Text(title).font(.subheadline.weight(.semibold))
                    Spacer()
                    Button("Edit activity") { titleFocused = false; hasChosenTiming = false }
                        .font(.subheadline).frame(minHeight: 44).accessibilityIdentifier("plan-change-method")
                }
            }.listRowBackground(Color.clear).listRowInsets(EdgeInsets(top: 4, leading: 0, bottom: 4, trailing: 0))
            if planningMode == "FIXED" {
                Section("When are we meeting?") {
                    DatePicker("Starts", selection: $fixedStart, in: Date()...).accessibilityIdentifier("unified-plan-fixed-start")
                    Picker("Activity duration", selection: $durationMinutes) {
                        ForEach([30, 45, 60, 90, 120, 180, 240], id: \.self) { Text(String(format: AppLocalization.string("%d minutes"), $0)).tag($0) }
                    }.accessibilityIdentifier("unified-plan-duration")
                }
                Section {
                    Stepper(String(format: AppLocalization.string("%d participants including you"), expectedCount), value: $expectedCount, in: 2...20)
                        .accessibilityIdentifier("unified-plan-participant-count")
                } header: { Text("How many people?") } footer: { Text("Include yourself. The plan is confirmed when this many people have accepted.") }
            } else {
                Section {
                    MultiDatePicker("Choose dates", selection: $dates, in: Calendar.current.startOfDay(for: Date())...)
                        .accessibilityIdentifier("time-poll-dates")
                } footer: { Text("Tap one or more dates. Tap again to remove a date.") }
                Section {
                    DisclosureGroup {
                        Picker("From", selection: $startMinute) { ForEach(Array(stride(from: 0, to: 1440, by: 30)), id: \.self) { Text(clock($0)).tag($0) } }
                            .accessibilityIdentifier("time-poll-from")
                        Picker("Until", selection: $endMinute) { ForEach(Array(stride(from: 30, through: 1440, by: 30)), id: \.self) { Text(clock($0)).tag($0) } }
                            .accessibilityIdentifier("time-poll-until")
                        if !chooseActivityTogether { Stepper(String(format: AppLocalization.string("%d participants including you"), expectedCount), value: $expectedCount, in: 2...20)
                            .accessibilityIdentifier("unified-plan-participant-count")
                        Text("This is an estimate; you choose who to invite later.").font(.caption).foregroundStyle(.secondary) }
                    } label: {
                        VStack(alignment: .leading, spacing: 4) {
                            Text("Hours people can choose from").font(.subheadline.weight(.medium))
                            Text(clock(startMinute) + "–" + clock(endMinute)).font(.subheadline.monospacedDigit()).foregroundStyle(.secondary)
                        }
                    }.accessibilityIdentifier("plan-time-options")
                } footer: { Text("This is the available range, not the final meeting time.") }
            }
            Section { Text(String(format: AppLocalization.string("All times in %@"), TimeZone.current.identifier)).font(.caption).foregroundStyle(.secondary) }
                .listRowBackground(Color.clear)
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
                body: CreateTimePollRequest(title: title, timeZone: TimeZone.current.identifier, dates: keys, startMinute: startMinute, endMinute: endMinute, location: location, durationMinutes: planningMode == "FIXED" ? durationMinutes : nil, expectedCount: chooseActivityTogether ? nil : expectedCount, planningMode: planningMode, fixedStart: planningMode == "FIXED" ? ISO8601DateFormatter().string(from: fixedStart) : nil, chooseActivityTogether: chooseActivityTogether ? true : nil),
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
    @State private var pickingFinalTime = false
    @State private var finalRange: TimePollFinalRange?
    @State private var invitationRoster = Set<String>()
    @State private var choosingAgain = false
    @State private var showsActivityTimetable = false
    @State private var showsActivityHistory = false
    @State private var now = Date()
    @FocusState private var nameFocused: Bool

    init(token: String) { _store = State(initialValue: TimePollStore(token: token)) }

    var body: some View {
        VStack(spacing: SideSeatTheme.spaceMD) {
            if let poll = store.poll {
                if poll.planningPhase(at: now) == "EXPIRED" {
                    ExpiredTimePollView(poll: poll) { dismiss() }
                } else if poll.planningPhase == "COLLECTING" || choosingAgain {
                if activityBoardVisible(poll) {
                    PlanActivityIdeasView(poll: poll, store: store) {
                        showsActivityTimetable = true; showsActivityHistory = false
                    }
                } else { collectionSurface(poll) }
                if let error = store.error {
                    HStack {
                        Text(error).font(.caption).foregroundStyle(SideSeatTheme.danger)
                        Button("Retry") { if deleting { Task { await delete() } } else { store.save(session: session) } }
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
        .navigationTitle("Plan together").navigationBarTitleDisplayMode(.inline)
        .safeAreaInset(edge: .bottom, spacing: 0) {
            if let poll = store.poll, (poll.planningPhase == "COLLECTING" || choosingAgain) && !activityBoardVisible(poll) {
                collectionFooter(poll)
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
        .sheet(isPresented: $showsInvite) { if let poll = store.poll, let finalRange { UnifiedPlanInviteView(poll: poll, store: store, range: finalRange, selected: $invitationRoster).dynamicTypeSize(typeSize) } }
        .sheet(isPresented: $showsPeople) {
            if let poll = store.poll {
                NavigationStack {
                    Form {
                        Section {
                            Text(String(format: AppLocalization.string("%d people responded"), poll.summary.participantCount))
                            Text(poll.participants.map { $0.displayName + ($0.isGuest == true ? " (" + AppLocalization.string("Guest") + ")" : "") }.joined(separator: "\n"))
                                .fixedSize(horizontal: false, vertical: true)
                                .accessibilityIdentifier("time-poll-participants")
                            Text("Filling in free time doesn't confirm attendance.").font(.footnote).foregroundStyle(.secondary)
                        }
                    }
                    .navigationTitle("Group timetable").navigationBarTitleDisplayMode(.inline)
                    .toolbar { ToolbarItem(placement: .confirmationAction) {
                        Button("Done") { showsPeople = false }.accessibilityIdentifier("plan-people-done")
                    } }
                }.dynamicTypeSize(typeSize)
            }
        }
        .onChange(of: store.poll?.invitationVersion) { _, _ in choosingAgain = false; pickingFinalTime = false; finalRange = nil }
        .onChange(of: nameFocused) { old, new in if old && !new && store.displayName.trimmingCharacters(in: .whitespacesAndNewlines) != store.poll?.myDisplayName { store.save(session: session) } }
        .task {
            await store.load(session: session)
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

    private func editsTimetable(_ poll: NativeTimePoll) -> Bool {
        poll.planningPhase == "COLLECTING" && !choosingAgain && !pickingFinalTime
    }

    private func activityBoardVisible(_ poll: NativeTimePoll) -> Bool {
        poll.planningPhase == "COLLECTING" && poll.activitySelection != nil
            && (showsActivityHistory || (poll.activitySelection?.isOpen == true && !showsActivityTimetable))
    }

    @ViewBuilder private func collectionSurface(_ poll: NativeTimePoll) -> some View {
        if typeSize.isAccessibilitySize {
            ScrollView {
                VStack(spacing: SideSeatTheme.spaceMD) {
                    collectionHeader(poll)
                    TimePollGrid(poll: poll, selected: $store.selected, editable: editsTimetable(poll), pickingFinalTime: pickingFinalTime, finalRange: $finalRange) { store.save(session: session) }
                }
            }.accessibilityIdentifier("time-poll-detail-scroll")
        } else {
            collectionHeader(poll)
            TimePollGrid(poll: poll, selected: $store.selected, editable: editsTimetable(poll), pickingFinalTime: pickingFinalTime, finalRange: $finalRange) { store.save(session: session) }
        }
    }

    private func collectionHeader(_ poll: NativeTimePoll) -> some View {
        VStack(alignment: .leading, spacing: SideSeatTheme.spaceSM) {
            PlanDetailHeading(poll: poll)
            if let activity = poll.activitySelection {
                Button {
                    showsActivityTimetable = false; showsActivityHistory = true
                } label: {
                    Label(activity.isOpen ? "Back to activity ideas" : "View activity ideas", systemImage: "lightbulb")
                        .font(.subheadline).frame(minHeight: 44)
                }.accessibilityIdentifier("plan-activity-open-ideas")
                if !activity.isOpen {
                    Text("Activity chosen. Your saved free time is kept.").font(.caption)
                        .foregroundStyle(SideSeatTheme.textSecondaryStrong).fixedSize(horizontal: false, vertical: true)
                }
            }
            Text(dateRange(poll) + " · " + poll.timeZone).font(.caption).foregroundStyle(SideSeatTheme.textSecondaryStrong)
                .fixedSize(horizontal: false, vertical: true).accessibilityIdentifier("time-poll-date-range")
            summary(poll)
            if editsTimetable(poll) {
                HStack(spacing: SideSeatTheme.spaceSM) {
                    Text("Your name").font(.caption).foregroundStyle(SideSeatTheme.textSecondaryStrong)
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

    private func collectionFooter(_ poll: NativeTimePoll) -> some View {
        VStack(alignment: .leading, spacing: SideSeatTheme.spaceSM) {
            if pickingFinalTime {
                Text("Choose final time").font(.subheadline.weight(.semibold)).accessibilityIdentifier("time-poll-final-heading")
                if let finalRange {
                    Text(timePollDateLabel(finalRange.date).replacingOccurrences(of: "\n", with: " "))
                        .font(.caption).foregroundStyle(SideSeatTheme.textSecondaryStrong)
                    Text(timePollClockFormatter(poll.timeZone).string(from: finalRange.start) + " – " + timePollClockFormatter(poll.timeZone).string(from: finalRange.end))
                        .font(.subheadline.monospacedDigit()).fixedSize(horizontal: false, vertical: true)
                        .accessibilityIdentifier("time-poll-final-range")
                } else if !typeSize.isAccessibilitySize {
                    Text("Tap the first and last time cells, or hold and drag.")
                        .font(.caption).foregroundStyle(SideSeatTheme.textSecondaryStrong)
                        .fixedSize(horizontal: false, vertical: true)
                }
                PlanActionButton(title: AppLocalization.string(typeSize.isAccessibilitySize ? "Review invitees" : "Next: review invitation list"), symbol: "person.2",
                                accessibilityID: "unified-plan-review-roster") { showsInvite = true }
                    .disabled(finalRange == nil || !store.canMutate)
                PlanActionButton(title: AppLocalization.string("Cancel time selection"), symbol: "xmark", kind: .utility,
                                 accessibilityID: "time-poll-cancel-final") {
                    pickingFinalTime = false; finalRange = nil
                    if choosingAgain { choosingAgain = false }
                }
            } else {
                if editsTimetable(poll) { saveStatus(poll) }
                if poll.isOwner {
                    if poll.activitySelection?.isOpen == true {
                        PlanActionButton(title: AppLocalization.string("Choose an activity first"), symbol: "lightbulb", kind: .navigate,
                                         accessibilityID: "plan-activity-back-to-ideas") { showsActivityTimetable = false; showsActivityHistory = true }
                    } else if poll.participants.contains(where: { !$0.isMe }) {
                        PlanActionButton(title: AppLocalization.string("Choose final time"), symbol: "calendar.badge.clock",
                                        accessibilityID: "unified-plan-invite-window") { beginFinalSelection(poll) }
                            .disabled(!store.canMutate || poll.slots.isEmpty)
                    }
                    PlanShareActions(poll: poll)
                } else {
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
        nameFocused = false
        invitationRoster = Set(poll.participants.map(\.id))
        finalRange = nil
        if let start = poll.chosenStart, let end = poll.chosenEnd,
           let first = poll.cells.first(where: { $0.slots[0].start == start }),
           let last = poll.cells.first(where: { $0.end == end }) {
            finalRange = TimePollFinalRange.spanning(first, last, cells: poll.cells)
        }
        pickingFinalTime = true
    }

    private func saveStatus(_ poll: NativeTimePoll) -> some View {
        let failed = !store.saved && !store.saving && store.error != nil
        return HStack(spacing: SideSeatTheme.spaceSM) {
            if store.saving { ProgressView().controlSize(.small) }
            else { Image(systemName: failed ? "exclamationmark.circle" : store.saved ? "checkmark.circle.fill" : "circle")
                .foregroundStyle(failed ? SideSeatTheme.danger : store.saved ? SideSeatTheme.statusSuccessText : SideSeatTheme.textSecondaryStrong) }
            VStack(alignment: .leading, spacing: 3) {
                Text(store.saving ? "Saving…" : failed ? "Couldn't save" : store.saved ? "Availability saved automatically" : "Choose when you're free")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(store.saved ? SideSeatTheme.statusSuccessText : SideSeatTheme.textPrimary)
                    .accessibilityIdentifier(store.saved ? "time-poll-saved" : "time-poll-save-state")
                Text(failed ? AppLocalization.string("Your choices are kept. Please retry.") : store.saving ? AppLocalization.string("Changes save automatically") : store.saved ? selectionSummary(poll) : AppLocalization.string("Changes save automatically"))
                    .font(.caption).foregroundStyle(.secondary)
            }.accessibilityElement(children: .contain)
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

    private func summary(_ poll: NativeTimePoll) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: SideSeatTheme.spaceSM) {
                Text("Group timetable").font(.headline).accessibilityIdentifier("time-poll-result-heading")
            Spacer(minLength: 0)
            Button { showsPeople = true } label: {
                HStack(spacing: SideSeatTheme.spaceXS) {
                    Text(String(format: AppLocalization.string("%d people responded"), poll.summary.participantCount))
                        .fixedSize(horizontal: false, vertical: true)
                    Image(systemName: "chevron.down").accessibilityHidden(true)
                }.font(.caption).frame(minHeight: 44)
            }.accessibilityIdentifier("plan-people-open")
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
    let editable: Bool
    let pickingFinalTime: Bool
    @Binding var finalRange: TimePollFinalRange?
    let onSave: () -> Void
    @State private var dragStart: (Int, Int)?
    @Environment(\.dynamicTypeSize) private var typeSize
    @State private var original = Set<Int>()
    @State private var preview: Set<Int>?
    @State private var selecting = true
    @State private var undoSelection: Set<Int>?
    @State private var finalAnchor: NativeTimePoll.Cell?
    @State private var originalFinalRange: TimePollFinalRange?
    private var cellHeight: CGFloat { typeSize.isAccessibilitySize ? 64 : 44 }
    private var labelWidth: CGFloat { typeSize.isAccessibilitySize ? 120 : 60 }
    private var headerHeight: CGFloat { typeSize.isAccessibilitySize ? 128 : 48 }

    var body: some View {
        let rows = poll.rows
        let cells = poll.cells
        let lookup = Dictionary(uniqueKeysWithValues: cells.map { ("\($0.date)|\($0.row)", $0) })
        let participantSelections = poll.timetableSelections(ownSelection: editable ? preview ?? selected : nil)
        VStack(spacing: SideSeatTheme.spaceSM) {
            if pickingFinalTime {
                VStack(alignment: .leading, spacing: SideSeatTheme.spaceSM) {
                    Label("Final time · not sent yet", systemImage: "calendar.badge.clock")
                        .font(.subheadline.weight(.semibold)).foregroundStyle(SideSeatTheme.textPrimary)
                    Text("Tap the first and last time cells, or hold and drag. Tap a date to select that day.")
                        .font(.caption).foregroundStyle(SideSeatTheme.textSecondaryStrong)
                    Text("Numbers show how many people are free. Your availability stays unchanged.")
                        .font(.caption2).foregroundStyle(SideSeatTheme.textSecondaryStrong)
                }.frame(maxWidth: .infinity, alignment: .leading).padding(.horizontal, SideSeatTheme.spaceMD)
            } else if editable {
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
                    Label { Text("My free time") } icon: {
                        Image(systemName: "checkmark.circle.fill").foregroundStyle(SideSeatTheme.Availability.selectedFill)
                    }
                    Label { Text("Partially selected") } icon: {
                        Image(systemName: "minus.circle.fill").foregroundStyle(SideSeatTheme.Availability.onPartial)
                    }
                    Text("Numbers include everyone available")
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
                if typeSize.isAccessibilitySize {
                    timetable(rows: rows, lookup: lookup, participantSelections: participantSelections, width: geometry.size.width)
                        .accessibilityIdentifier("time-poll-grid")
                } else {
                    ScrollView(.vertical) {
                        timetable(rows: rows, lookup: lookup, participantSelections: participantSelections, width: geometry.size.width)
                    }.accessibilityIdentifier("time-poll-grid")
                }
            }
            .frame(height: typeSize.isAccessibilitySize ? headerHeight + cellHeight * CGFloat(rows.count) : nil)
        }
        .onChange(of: editable) { _, _ in clearPreview(); finalAnchor = nil }
        .onChange(of: pickingFinalTime) { _, _ in clearPreview(); finalAnchor = nil }
        .onDisappear { clearPreview() }
    }

    private func timetable(rows: [String], lookup: [String: NativeTimePoll.Cell], participantSelections: [Set<Int>], width: CGFloat) -> some View {
        let cellWidth = typeSize.isAccessibilitySize ? max(280, width - labelWidth) : max(88, (width - labelWidth) / CGFloat(max(1, min(4, poll.dates.count))))
        let timeFormatter = timePollClockFormatter(poll.timeZone)
        return HStack(alignment: .top, spacing: 0) {
            VStack(spacing: 0) {
                Text("Time").font(.caption).lineLimit(1).minimumScaleFactor(0.7).frame(width: labelWidth, height: headerHeight)
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
                                            if finalActive { Rectangle().fill(SideSeatTheme.utilityAction.opacity(0.18)) }
                                            Rectangle().strokeBorder(finalActive ? SideSeatTheme.utilityAction : editable && active ? SideSeatTheme.Availability.selectedFill : editable && partial ? SideSeatTheme.Availability.onPartial : SideSeatTheme.separator, lineWidth: finalActive || editable && (active || partial) ? 2 : 0.5)
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
                finalAnchor = nil
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
            originalFinalRange = finalRange; dragStart = start; finalAnchor = nil
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
            if let anchor = finalAnchor, anchor.date == cell.date {
                finalRange = TimePollFinalRange.spanning(anchor, cell, cells: poll.cells)
                finalAnchor = nil
            } else {
                finalRange = TimePollFinalRange.spanning(cell, cell, cells: poll.cells)
                finalAnchor = cell
            }
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
    let onTimetable: () -> Void
    @State private var showsSuggestion = false
    @State private var draftTitle = ""
    @State private var draftLocation = ""
    @State private var selectedIdeaId: String?
    private var activity: NativePlanActivity { poll.activitySelection! }
    private var ideas: [NativePlanActivity.Idea] { activity.ideas ?? [] }
    private var canChoose: Bool { poll.isOwner && poll.planningPhase == "COLLECTING" }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: SideSeatTheme.spaceMD) {
                PlanDetailHeading(poll: poll)
                Text("Choose an activity → Find a time → Confirm participation")
                    .font(.caption).foregroundStyle(SideSeatTheme.textSecondaryStrong).fixedSize(horizontal: false, vertical: true)
                Text(activity.isOpen ? "Everyone can suggest activities and mark interest in several options. The organizer makes the final choice." : "The activity is chosen. Your ideas and saved free time are kept.")
                    .font(.subheadline).foregroundStyle(SideSeatTheme.textSecondaryStrong).fixedSize(horizontal: false, vertical: true)
                Text("Interest does not confirm attendance. You will confirm the final arrangement later.")
                    .font(.caption.weight(.medium)).fixedSize(horizontal: false, vertical: true)
                    .accessibilityIdentifier("plan-activity-consent-note")
                HStack {
                    Text("Activity ideas").font(.headline)
                    Text(ideas.count.formatted()).font(.caption).foregroundStyle(.secondary)
                    Spacer()
                    if activity.isOpen {
                        Button { showsSuggestion = true } label: { Label("Suggest an activity", systemImage: "plus").font(.subheadline).frame(minHeight: 44) }
                            .disabled(!store.canMutate).accessibilityIdentifier("plan-activity-suggest")
                    }
                }
                if ideas.isEmpty {
                    Text("No ideas yet. Suggest something you'd enjoy doing together.")
                        .font(.subheadline).foregroundStyle(SideSeatTheme.textSecondaryStrong).fixedSize(horizontal: false, vertical: true)
                        .padding(.vertical, SideSeatTheme.spaceLG)
                }
                ForEach(ideas) { idea in ideaRow(idea) }
                if !activity.isOpen && !canChoose {
                    Text("The activity cannot be changed after invitations are sent.")
                        .font(.caption).foregroundStyle(SideSeatTheme.textSecondaryStrong)
                }
            }.padding(SideSeatTheme.spaceMD)
        }.accessibilityIdentifier("plan-activity-ideas")
        .safeAreaInset(edge: .bottom, spacing: 0) {
            VStack(spacing: SideSeatTheme.spaceSM) {
                if let error = store.error { Text(error).font(.footnote).foregroundStyle(SideSeatTheme.danger).fixedSize(horizontal: false, vertical: true) }
                if canChoose && !ideas.isEmpty {
                    PlanActionButton(title: AppLocalization.string("Set activity and continue"), symbol: "checkmark.circle", kind: .commit,
                                     isLoading: store.acting, accessibilityID: "plan-activity-choose") {
                        guard let selectedIdeaId else { return }
                        Task {
                            await store.mutate("activities/choose", body: ChoosePlanActivityRequest(ideaId: selectedIdeaId), session: session)
                            if store.error == nil { onTimetable() }
                        }
                    }.disabled(selectedIdeaId == nil || !store.canMutate)
                }
                PlanActionButton(title: AppLocalization.string(activity.isOpen ? "Fill in free time too" : "Back to timetable"), symbol: "calendar", kind: .navigate,
                                 accessibilityID: "plan-activity-show-timetable", action: onTimetable)
                PlanShareActions(poll: poll)
            }.padding(SideSeatTheme.spaceMD).background(SideSeatTheme.surface).overlay(alignment: .top) { Divider() }
        }
        .onAppear { selectedIdeaId = activity.selectedIdeaId }
        .sheet(isPresented: $showsSuggestion) {
            NavigationStack {
                Form {
                    Section {
                        TextField("For example: an exhibition, dinner or badminton", text: $draftTitle)
                            .accessibilityLabel("Activity idea").accessibilityIdentifier("plan-activity-title")
                        TextField("Location (optional)", text: $draftLocation).accessibilityIdentifier("plan-activity-location")
                    } header: { Text("What would you like to suggest?") }
                    if let error = store.error { Text(error).font(.footnote).foregroundStyle(SideSeatTheme.danger) }
                }
                .navigationTitle("Suggest an activity").navigationBarTitleDisplayMode(.inline)
                .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Cancel") { showsSuggestion = false }.disabled(store.acting) } }
                .safeAreaInset(edge: .bottom) {
                    PlanActionButton(title: AppLocalization.string("Add suggestion"), symbol: "plus", kind: .commit, isLoading: store.acting,
                                     accessibilityID: "plan-activity-add") {
                        Task {
                            await store.mutate("activities", body: SuggestPlanActivityRequest(title: draftTitle.trimmingCharacters(in: .whitespacesAndNewlines), location: draftLocation.trimmingCharacters(in: .whitespacesAndNewlines)), session: session)
                            if store.error == nil { draftTitle = ""; draftLocation = ""; showsSuggestion = false }
                        }
                    }.disabled(!store.canMutate || draftTitle.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || draftTitle.count > 120 || draftLocation.count > 200)
                        .padding(SideSeatTheme.spaceMD).background(SideSeatTheme.surface)
                }
            }.dynamicTypeSize(typeSize).interactiveDismissDisabled(store.acting)
        }
    }

    private func ideaRow(_ idea: NativePlanActivity.Idea) -> some View {
        VStack(alignment: .leading, spacing: SideSeatTheme.spaceSM) {
            if canChoose {
                Button { selectedIdeaId = idea.id } label: {
                    HStack(alignment: .top, spacing: SideSeatTheme.spaceSM) {
                        ideaIdentity(idea)
                        Image(systemName: selectedIdeaId == idea.id ? "checkmark.circle.fill" : "circle").font(.title3).accessibilityHidden(true)
                    }.frame(minHeight: 44).contentShape(Rectangle())
                }.buttonStyle(.plain).disabled(!store.canMutate)
                    .accessibilityIdentifier("plan-activity-select-\(idea.id)")
                    .accessibilityValue(selectedIdeaId == idea.id ? "Selected" : "Not selected")
            } else { ideaIdentity(idea) }
            HStack(alignment: .top, spacing: SideSeatTheme.spaceSM) {
                if activity.isOpen {
                    Button {
                        Task { await store.mutate("activities/interest", method: .put, body: PlanActivityInterestRequest(ideaId: idea.id, interested: !idea.isInterested), session: session) }
                    } label: {
                        Label(idea.isInterested ? "Interest marked" : "I'm interested", systemImage: idea.isInterested ? "checkmark" : "heart")
                            .font(.subheadline.weight(.medium)).fixedSize(horizontal: false, vertical: true)
                            .padding(.horizontal, SideSeatTheme.spaceMD).frame(minHeight: 44)
                            .background(idea.isInterested ? SideSeatTheme.ControlSelection.fill : Color.clear, in: RoundedRectangle(cornerRadius: SideSeatTheme.controlRadius))
                            .overlay { RoundedRectangle(cornerRadius: SideSeatTheme.controlRadius).strokeBorder(SideSeatTheme.separator, lineWidth: 1) }
                    }.buttonStyle(.plain).disabled(!store.canMutate)
                        .accessibilityIdentifier("plan-activity-interest-\(idea.id)")
                        .accessibilityValue(idea.isInterested ? "Interest marked" : "Interest not marked")
                }
                VStack(alignment: .leading, spacing: 3) {
                    Text(String(format: AppLocalization.string("%d interested"), idea.interestedBy.count)).font(.caption.weight(.medium))
                    if !idea.interestedBy.isEmpty {
                        Text(idea.interestedBy.map(\.displayName).joined(separator: ", ")).font(.caption).foregroundStyle(SideSeatTheme.textSecondaryStrong)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }.frame(maxWidth: .infinity, alignment: .leading)
            }
        }
        .padding(SideSeatTheme.spaceMD).background(SideSeatTheme.surface, in: RoundedRectangle(cornerRadius: SideSeatTheme.controlRadius))
        .overlay { RoundedRectangle(cornerRadius: SideSeatTheme.controlRadius).strokeBorder(selectedIdeaId == idea.id ? SideSeatTheme.ControlSelection.border : SideSeatTheme.separator, lineWidth: 1) }
        .accessibilityElement(children: .contain).accessibilityIdentifier("plan-activity-idea-\(idea.id)")
    }

    private func ideaIdentity(_ idea: NativePlanActivity.Idea) -> some View {
        VStack(alignment: .leading, spacing: SideSeatTheme.spaceXS) {
            Text(idea.title).font(.headline).fixedSize(horizontal: false, vertical: true)
            if let location = idea.location, !location.isEmpty { Label(location, systemImage: "mappin.and.ellipse").font(.caption).foregroundStyle(SideSeatTheme.textSecondaryStrong) }
            Text(String(format: AppLocalization.string("%@ suggested this"), idea.authorName)).font(.caption).foregroundStyle(SideSeatTheme.textSecondaryStrong)
        }.frame(maxWidth: .infinity, alignment: .leading)
    }
}
