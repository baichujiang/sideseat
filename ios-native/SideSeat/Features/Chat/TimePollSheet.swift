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

    init(initialToken: String? = nil) { self.initialToken = initialToken }

    var body: some View {
        NavigationStack {
            List {
                Section {
                    Button { showsCreate = true } label: { Label("Create time poll", systemImage: "plus") }
                        .accessibilityIdentifier("time-poll-create")
                    Button { showsOpen = true } label: { Label("Open a poll link", systemImage: "link") }
                }
                Section("Your time polls") {
                    if loading { ProgressView() }
                    if polls.isEmpty && !loading { Text("Create a poll and invite people to mark their free time.").foregroundStyle(.secondary) }
                    ForEach(polls) { poll in
                        Button { openToken = poll.token } label: {
                            VStack(alignment: .leading, spacing: SideSeatTheme.spaceXS) {
                                Text(poll.title).font(.headline)
                                Text(poll.dates.joined(separator: " · ")).font(.caption).foregroundStyle(.secondary)
                            }.padding(.vertical, SideSeatTheme.spaceXS)
                        }
                        .accessibilityIdentifier("time-poll-recent-\(poll.token)")
                    }
                }
                if let error { Section { Text(error).foregroundStyle(SideSeatTheme.danger) } }
            }
            .navigationTitle("Coordinate a time")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } } }
            .navigationDestination(item: $openToken) { TimePollDetailView(token: $0) }
            .sheet(isPresented: $showsCreate, onDismiss: { Task { await load() } }) {
                TimePollCreateView { poll in openToken = poll.token }
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
        }.tint(SideSeatTheme.utilityAction)
    }

    private func load() async {
        do {
            let result: APIEnvelope<NativeTimePollList> = try await session.sendAuthorized("/api/v1/time-polls")
            polls = result.data.polls; error = nil
        } catch { self.error = error.localizedDescription }
        loading = false
    }
}

private struct TimePollCreateView: View {
    @Environment(SessionStore.self) private var session
    @Environment(\.dismiss) private var dismiss
    @State private var title = ""
    @State private var dates: Set<DateComponents> = [Calendar.current.dateComponents([.era, .year, .month, .day], from: Date())]
    @State private var startMinute = 9 * 60
    @State private var endMinute = 17 * 60
    @State private var creating = false
    @State private var error: String?
    @State private var createKey = UUID().uuidString
    let onCreate: (NativeTimePoll) -> Void

    var body: some View {
        NavigationStack {
            Form {
                Section("Poll name") { TextField("For example: Friday dinner", text: $title).accessibilityIdentifier("time-poll-title") }
                Section("Candidate dates") {
                    MultiDatePicker("Choose dates", selection: $dates)
                        .accessibilityIdentifier("time-poll-dates")
                    Text("Choose up to 31 dates.").font(.caption).foregroundStyle(.secondary)
                }
                Section("Daily time range") {
                    Picker("From", selection: $startMinute) { ForEach(Array(stride(from: 0, to: 1440, by: 15)), id: \.self) { Text(clock($0)).tag($0) } }
                        .accessibilityIdentifier("time-poll-from")
                    Picker("Until", selection: $endMinute) { ForEach(Array(stride(from: 15, through: 1440, by: 15)), id: \.self) { Text(clock($0)).tag($0) } }
                        .accessibilityIdentifier("time-poll-until")
                    LabeledContent("Time zone", value: TimeZone.current.identifier)
                    Text("Everyone sees the same dates and time zone. Each cell is 15 minutes.").font(.caption).foregroundStyle(.secondary)
                }
                if let error { Section { Text(error).foregroundStyle(SideSeatTheme.danger) } }
            }
            .navigationTitle("Create time poll").navigationBarTitleDisplayMode(.inline)
            .onChange(of: title) { _, _ in createKey = UUID().uuidString }
            .onChange(of: dates) { _, _ in createKey = UUID().uuidString }
            .onChange(of: startMinute) { _, _ in createKey = UUID().uuidString }
            .onChange(of: endMinute) { _, _ in createKey = UUID().uuidString }
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() }.disabled(creating) }
                ToolbarItem(placement: .confirmationAction) {
                    Button { Task { await create() } } label: {
                        if creating { ProgressView() } else { Text("Create") }
                    }
                    .disabled(creating || title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || dates.isEmpty || dates.count > 31 || endMinute <= startMinute)
                    .accessibilityIdentifier("time-poll-create-confirm")
                }
            }
        }.tint(SideSeatTheme.utilityAction)
    }

    private func create() async {
        creating = true; defer { creating = false }
        let keys = dates.compactMap { Calendar.current.date(from: $0) }.map { date in
            let formatter = DateFormatter(); formatter.calendar = Calendar(identifier: .gregorian)
            formatter.locale = Locale(identifier: "en_US_POSIX"); formatter.timeZone = .current; formatter.dateFormat = "yyyy-MM-dd"
            return formatter.string(from: date)
        }.sorted()
        do {
            let response: APIEnvelope<NativeTimePoll> = try await session.sendAuthorized(
                "/api/v1/time-polls", method: .post,
                body: CreateTimePollRequest(title: title, timeZone: TimeZone.current.identifier, dates: keys, startMinute: startMinute, endMinute: endMinute),
                idempotencyKey: createKey
            )
            onCreate(response.data); dismiss()
        } catch { self.error = error.localizedDescription }
    }
}

struct TimePollDetailView: View {
    @Environment(SessionStore.self) private var session
    @Environment(\.dismiss) private var dismiss
    @Environment(\.scenePhase) private var scenePhase
    @State private var store: TimePollStore
    @State private var results = false
    @State private var showsDelete = false
    @State private var deleting = false
    @FocusState private var nameFocused: Bool

    init(token: String) { _store = State(initialValue: TimePollStore(token: token)) }

    var body: some View {
        VStack(spacing: SideSeatTheme.spaceMD) {
            if let poll = store.poll {
                VStack(alignment: .leading, spacing: SideSeatTheme.spaceSM) {
                    Text(poll.title).font(.title2.weight(.semibold)).accessibilityIdentifier("time-poll-detail-title")
                    Text(poll.timeZone).font(.caption).foregroundStyle(.secondary)
                    Picker("Availability", selection: $results) {
                        Text("My availability").tag(false)
                        Text("Group results").tag(true)
                    }.pickerStyle(.segmented).accessibilityIdentifier("time-poll-mode")
                    if results { summary(poll) }
                    else {
                        HStack {
                            TextField("Your name", text: $store.displayName)
                                .focused($nameFocused).submitLabel(.done)
                                .onSubmit { store.save(session: session); nameFocused = false }
                                .accessibilityIdentifier("time-poll-name")
                            saveStatus
                        }
                        Text("Drag to mark free time. Start on a selected cell to erase. Changes save automatically.")
                            .font(.caption).foregroundStyle(.secondary)
                        if !poll.didRespond && store.selected.isEmpty {
                            Button("I have no available time") { store.save(session: session) }
                                .font(.caption).accessibilityIdentifier("time-poll-none")
                        }
                    }
                }.padding(.horizontal, SideSeatTheme.spaceMD)
                TimePollGrid(poll: poll, selected: $store.selected, results: results) { store.save(session: session) }
                if let error = store.error {
                    HStack {
                        Text(error).font(.caption).foregroundStyle(SideSeatTheme.danger)
                        Button("Retry") { if deleting { Task { await delete() } } else { store.save(session: session) } }
                    }.padding(.horizontal, SideSeatTheme.spaceMD)
                }
            } else if let error = store.error {
                ContentUnavailableView {
                    Label("Couldn't load the poll", systemImage: "wifi.exclamationmark")
                } description: { Text(error) } actions: { Button("Retry") { Task { await store.load(session: session) } } }
            } else { Spacer(); ProgressView(); Spacer() }
        }
        .padding(.top, SideSeatTheme.spaceSM)
        .background(SideSeatTheme.bg)
        .navigationTitle("Coordinate a time").navigationBarTitleDisplayMode(.inline)
        .toolbar {
            if let poll = store.poll {
                ToolbarItem(placement: .topBarTrailing) {
                    Menu {
                        ShareLink(item: poll.shareUrl) { Label("Share poll", systemImage: "square.and.arrow.up") }
                        Button { UIPasteboard.general.url = poll.shareUrl } label: { Label("Copy link", systemImage: "doc.on.doc") }
                        if poll.isOwner { Button("Delete poll", role: .destructive) { showsDelete = true } }
                    } label: { Image(systemName: "ellipsis") }.accessibilityIdentifier("time-poll-menu")
                }
            }
        }
        .confirmationDialog("Delete this poll and all responses?", isPresented: $showsDelete, titleVisibility: .visible) {
            Button("Delete poll", role: .destructive) { Task { await delete() } }
        }
        .onChange(of: nameFocused) { old, new in if old && !new { store.save(session: session) } }
        .onChange(of: results) { _, _ in nameFocused = false }
        .task {
            await store.load(session: session)
            while !Task.isCancelled {
                do { try await Task.sleep(for: .seconds(10)) } catch { return }
                if scenePhase == .active && !nameFocused { await store.load(session: session) }
            }
        }
        .onChange(of: scenePhase) { _, phase in if phase == .active { Task { await store.load(session: session) } } }
    }

    @ViewBuilder private var saveStatus: some View {
        if store.saving { ProgressView().controlSize(.small); Text("Saving…").font(.caption) }
        else if store.saved { Label("Saved", systemImage: "checkmark.circle").font(.caption).foregroundStyle(SideSeatTheme.statusSuccessText).accessibilityIdentifier("time-poll-saved") }
    }

    private func summary(_ poll: NativeTimePoll) -> some View {
        VStack(alignment: .leading, spacing: SideSeatTheme.spaceXS) {
            Text(String(format: AppLocalization.string("%d people responded"), poll.summary.participantCount)).font(.caption).foregroundStyle(.secondary)
            if poll.summary.maximum == 0 {
                Text("No available time yet.").font(.headline)
            } else {
                Text(AppLocalization.string(poll.summary.common ? "Everyone can attend" : "Best available times")).font(.headline)
                    .accessibilityIdentifier("time-poll-result-heading")
                ScrollView(.horizontal) {
                    HStack(spacing: SideSeatTheme.spaceSM) {
                        ForEach(Array(poll.summary.windows.enumerated()), id: \.offset) { _, window in
                            VStack(alignment: .leading, spacing: SideSeatTheme.spaceXS) {
                                Text(windowLabel(window, timeZone: poll.timeZone)).font(.subheadline.weight(.medium))
                                Text(String(format: AppLocalization.string("%d of %d available"), window.count, poll.summary.participantCount)).font(.caption)
                                Text(poll.participants.filter { window.attendeeIds.contains($0.id) }.map(\.displayName).joined(separator: ", "))
                                    .font(.caption).foregroundStyle(.secondary)
                            }
                            .padding(SideSeatTheme.spaceSM)
                            .background(SideSeatTheme.surface, in: RoundedRectangle(cornerRadius: SideSeatTheme.controlRadius))
                            .accessibilityIdentifier("time-poll-window-\(window.count)")
                        }
                    }
                }.scrollIndicators(.hidden)
            }
            Text(poll.participants.map(\.displayName).joined(separator: " · ")).font(.caption).foregroundStyle(.secondary)
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
    @State private var original = Set<Int>()
    @State private var preview: Set<Int>?
    @State private var selecting = true
    private let cellHeight: CGFloat = 36
    private let labelWidth: CGFloat = 60
    private let headerHeight: CGFloat = 48

    var body: some View {
        let rows = poll.rows
        let lookup = Dictionary(uniqueKeysWithValues: poll.slots.map { ("\($0.date)|\($0.row)", $0) })
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
                    ForEach(poll.dates, id: \.self) { date in Text(dateLabel(date)).font(.caption.weight(.semibold)).frame(width: cellWidth, height: headerHeight) }
                }
                ForEach(rows, id: \.self) { row in
                    HStack(spacing: 0) {
                        ForEach(poll.dates, id: \.self) { date in
                            if let slot = lookup["\(date)|\(row)"] {
                                let count = poll.summary.counts[slot.id]
                                let active = (preview ?? selected).contains(slot.id)
                                Button {
                                    if !results {
                                        if selected.contains(slot.id) { selected.remove(slot.id) } else { selected.insert(slot.id) }
                                        onSave()
                                    }
                                } label: {
                                    ZStack {
                                        Rectangle().fill(results ? SideSeatTheme.success.opacity(count == 0 ? 0.06 : 0.14 + 0.42 * Double(count) / Double(max(1, poll.summary.participantCount))) : active ? SideSeatTheme.ControlSelection.fill : SideSeatTheme.surface)
                                        Rectangle().strokeBorder(SideSeatTheme.bg, lineWidth: 1)
                                        if results { Text("\(count)").font(.caption.monospacedDigit()).foregroundStyle(.primary) }
                                        else if active { Image(systemName: "checkmark").font(.caption.weight(.medium)).foregroundStyle(.primary) }
                                    }.frame(width: cellWidth, height: cellHeight)
                                }.buttonStyle(.plain)
                                    .accessibilityLabel("\(date), \(slot.label), \(results ? String(count) : AppLocalization.string(active ? "Available" : "Unavailable"))")
                                    .accessibilityIdentifier("time-poll-cell-\(slot.id)")
                                    .accessibilityAddTraits(active && !results ? .isSelected : [])
                            } else { Color.clear.frame(width: cellWidth, height: cellHeight) }
                        }
                    }
                }
            }
            .overlay(alignment: .topLeading) {
                if !results {
                    Color.clear.contentShape(Rectangle())
                        .frame(width: cellWidth * CGFloat(poll.dates.count), height: cellHeight * CGFloat(rows.count))
                        .gesture(DragGesture(minimumDistance: 0).onChanged { value in
                            guard let start = position(value.startLocation, rows: rows, cellWidth: cellWidth), let end = position(value.location, rows: rows, cellWidth: cellWidth) else { return }
                            if dragStart == nil {
                                guard let slot = lookup["\(poll.dates[start.0])|\(rows[start.1])"] else { return }
                                dragStart = start; original = selected; selecting = !selected.contains(slot.id)
                            }
                            preview = TimePollSelection.rectangle(slots: poll.slots, dates: poll.dates, rows: rows, from: start, to: end, original: original, selecting: selecting)
                        }.onEnded { _ in
                            if let preview { selected = preview; onSave() }
                            preview = nil; dragStart = nil
                        })
                        .offset(y: headerHeight)
                        .accessibilityHidden(true)
                }
            }
                }.frame(width: max(0, geometry.size.width - labelWidth), height: headerHeight + cellHeight * CGFloat(rows.count))
            }
        }.accessibilityIdentifier("time-poll-grid")
        }
    }

    private func position(_ point: CGPoint, rows: [String], cellWidth: CGFloat) -> (Int, Int)? {
        guard point.x >= 0, point.y >= 0 else { return nil }
        let column = Int(point.x / cellWidth), row = Int(point.y / cellHeight)
        guard column < poll.dates.count, row < rows.count else { return nil }
        return (column, row)
    }
}

struct TimePollMessageContent: View {
    let text: String
    @State private var showsPoll = false
    var body: some View {
        VStack(alignment: .leading, spacing: SideSeatTheme.spaceSM) {
            Text(text)
            if let token = TimePollLink.firstToken(in: text) {
                Button { showsPoll = true } label: { Label("Open time poll", systemImage: "calendar.badge.clock") }
                    .buttonStyle(SSPressButtonStyle())
                    .accessibilityIdentifier("time-poll-message-link")
                    .sheet(isPresented: $showsPoll) { TimePollSheet(initialToken: token) }
            }
        }
    }
}

private func clock(_ minute: Int) -> String { String(format: "%02d:%02d", minute / 60, minute % 60) }
private func dateLabel(_ key: String) -> String {
    let parser = DateFormatter(); parser.locale = Locale(identifier: "en_US_POSIX"); parser.dateFormat = "yyyy-MM-dd"
    guard let date = parser.date(from: key) else { return key }
    let output = DateFormatter(); output.locale = AppLocalization.selectedLanguage.locale; output.dateFormat = "EEE\nMMM d"; return output.string(from: date)
}
private func windowLabel(_ window: NativeTimePoll.Window, timeZone: String) -> String {
    let formatter = DateFormatter(); formatter.locale = AppLocalization.selectedLanguage.locale; formatter.timeZone = TimeZone(identifier: timeZone); formatter.dateFormat = "EEE, MMM d · HH:mm"
    let start = formatter.string(from: window.start); formatter.dateFormat = "HH:mm"
    return "\(start)–\(formatter.string(from: window.end))"
}
