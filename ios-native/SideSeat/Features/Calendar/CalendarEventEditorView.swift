import SwiftUI

struct CalendarEventEditorContext: Identifiable {
    let id = UUID()
    let proposedStart: Date
    let event: NativeHomeStudyEntry?
    let categories: [NativeHomeCalendarCategory]
    let companions: [NativeHomeCompanionOption]

    init(proposedStart: Date, event: NativeHomeStudyEntry?, schedule: NativeHomeSchedule?) {
        self.proposedStart = proposedStart
        self.event = event
        self.categories = schedule?.initialCalendarCategories ?? []
        self.companions = schedule?.companionOptions ?? []
    }
}

private enum NativeCalendarRepeatRule: String, CaseIterable, Codable, Identifiable, Sendable {
    case none = "NONE"
    case daily = "DAILY"
    case weekly = "WEEKLY"
    case biweekly = "BIWEEKLY"
    case monthly = "MONTHLY"
    case yearly = "YEARLY"

    var id: String { rawValue }

    var label: LocalizedStringKey {
        switch self {
        case .none: "Does not repeat"
        case .daily: "Every day"
        case .weekly: "Every week"
        case .biweekly: "Every two weeks"
        case .monthly: "Every month"
        case .yearly: "Every year"
        }
    }
}

struct CalendarUpdateResult: Decodable, Sendable {
    let id: String
}

private struct CalendarDeleteResult: Decodable, Sendable {
    let deleted: Int
}

private enum CalendarEventConfirmation {
    case update
    case delete
}

struct CalendarEventEditorView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(SessionStore.self) private var session

    private let context: CalendarEventEditorContext
    private let onSaved: @MainActor () async -> Void

    @State private var title: String
    @State private var location: String
    @State private var note: String
    @State private var startAt: Date
    @State private var endAt: Date
    @State private var categoryId: String?
    @State private var repeatRule: NativeCalendarRepeatRule
    @State private var repeatUntil: Date
    @State private var companionIDs: Set<String>
    @State private var isSaving = false
    @State private var issue: String?
    @State private var confirmation: CalendarEventConfirmation?
    @State private var showConfirmation = false
    @State private var pendingSaveRequest: NativeCalendarEventRequest?
    @State private var sheetDetent: PresentationDetent
    @FocusState private var isTitleFocused: Bool

    init(
        context: CalendarEventEditorContext,
        onSaved: @escaping @MainActor () async -> Void
    ) {
        self.context = context
        self.onSaved = onSaved

        let calendar = Calendar.sideSeatBerlin
        let eventStart = context.event.flatMap { Date.sideSeatEventISO8601($0.startISO) }
        let eventEnd = context.event.flatMap { Date.sideSeatEventISO8601($0.endISO) }
        // Keep the tapped/slot time from the calendar surface (day + hour + minute).
        let proposed = calendar.date(
            bySettingHour: calendar.component(.hour, from: context.proposedStart),
            minute: calendar.component(.minute, from: context.proposedStart),
            second: 0,
            of: context.proposedStart
        ) ?? context.proposedStart
        let start = eventStart ?? proposed
        let end = eventEnd ?? calendar.date(byAdding: .hour, value: 1, to: start) ?? start
        let rule = NativeCalendarRepeatRule(rawValue: context.event?.repeatRule ?? "NONE") ?? .none
        let repeatEnd = context.event
            .flatMap { $0.repeatUntilISO }
            .flatMap(Date.sideSeatEventISO8601)
            ?? calendar.date(byAdding: .month, value: 1, to: start)
            ?? start

        _title = State(initialValue: context.event?.title ?? "")
        _location = State(initialValue: context.event?.location ?? "")
        _note = State(initialValue: context.event?.note ?? "")
        _startAt = State(initialValue: start)
        _endAt = State(initialValue: end)
        _categoryId = State(initialValue: context.event?.categoryId)
        _repeatRule = State(initialValue: rule)
        _repeatUntil = State(initialValue: repeatEnd)
        _companionIDs = State(
            initialValue: Set(context.event?.eventParticipants.compactMap(\.userId) ?? [])
        )
        // New events start half-height so the timetable stays in view; edit opens taller.
        _sheetDetent = State(initialValue: context.event == nil ? .medium : .large)
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Title", text: $title)
                        .textInputAutocapitalization(.sentences)
                        .focused($isTitleFocused)
                        .accessibilityIdentifier("event-title")
                    DatePicker("Starts", selection: $startAt)
                        .datePickerStyle(.compact)
                        .environment(\.calendar, Calendar.sideSeatBerlin)
                        .environment(\.timeZone, Calendar.sideSeatBerlin.timeZone)
                        .accessibilityIdentifier("event-start")
                    DatePicker("Ends", selection: $endAt, in: startAt...)
                        .datePickerStyle(.compact)
                        .environment(\.calendar, Calendar.sideSeatBerlin)
                        .environment(\.timeZone, Calendar.sideSeatBerlin.timeZone)
                        .accessibilityIdentifier("event-end")
                }

                Section {
                    TextField("Location", text: $location)
                    TextField("Notes", text: $note, axis: .vertical)
                        .lineLimit(2...5)
                }

                Section {
                    Picker("Calendar", selection: $categoryId) {
                        Text("None").tag(String?.none)
                        ForEach(context.categories) { category in
                            Label {
                                Text(category.name)
                            } icon: {
                                Circle()
                                    .fill(Color(hex: category.color) ?? SideSeatTheme.accent)
                            }
                            .tag(Optional(category.id))
                        }
                    }
                    Picker("Repeat", selection: $repeatRule) {
                        ForEach(NativeCalendarRepeatRule.allCases) { rule in
                            Text(rule.label).tag(rule)
                        }
                    }
                    if repeatRule != .none {
                        DatePicker("Repeat until", selection: $repeatUntil, in: startAt..., displayedComponents: .date)
                            .environment(\.calendar, Calendar.sideSeatBerlin)
                            .environment(\.timeZone, Calendar.sideSeatBerlin.timeZone)
                    }
                }

                if !context.companions.isEmpty {
                    Section("With") {
                        ForEach(context.companions) { companion in
                            Toggle(companion.name, isOn: companionBinding(companion.id))
                        }
                    }
                }

                if let issue {
                    Section {
                        Label(issue, systemImage: "exclamationmark.triangle")
                            .foregroundStyle(SideSeatTheme.danger)
                    }
                }

                if context.event != nil {
                    Section {
                        Button("Delete event", role: .destructive) {
                            confirmation = .delete
                            showConfirmation = true
                        }
                        .disabled(isSaving)
                    }
                }
            }
            .navigationTitle(context.event == nil ? "New event" : "Edit event")
            .navigationBarTitleDisplayMode(.inline)
            .interactiveDismissDisabled(isSaving)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                        .disabled(isSaving)
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") {
                        commitTextInputAndPrepareSave()
                    }
                    .accessibilityIdentifier("event-save")
                    .disabled(isSaving)
                }
            }
            .confirmationDialog(
                confirmation == .update
                    ? "Apply changes to recurring event?"
                    : "Delete this event?",
                isPresented: $showConfirmation,
                titleVisibility: .visible
            ) {
                if confirmation == .update {
                    Button("Only this event") {
                        commitPendingSave(scope: "this")
                    }
                    .accessibilityIdentifier("event-update-this")
                    Button("This and future events") {
                        commitPendingSave(scope: "future")
                    }
                    .accessibilityIdentifier("event-update-future")
                    Button("All events") {
                        commitPendingSave(scope: "all")
                    }
                    .accessibilityIdentifier("event-update-all")
                } else {
                    Button("Delete this event", role: .destructive) {
                        Task { await delete(scope: "this") }
                    }
                    if repeatRule != .none {
                        Button("Delete this and future events", role: .destructive) {
                            Task { await delete(scope: "future") }
                        }
                        Button("Delete all events", role: .destructive) {
                            Task { await delete(scope: "all") }
                        }
                    }
                }
                Button("Cancel", role: .cancel) {
                    pendingSaveRequest = nil
                    confirmation = nil
                }
            }
        }
        // Half-sheet by default — full page sheet left a thin strip of calendar at the top and felt awkward.
        .presentationDetents([.medium, .large], selection: $sheetDetent)
        .presentationDragIndicator(.visible)
        .presentationContentInteraction(.scrolls)
        .onChange(of: isTitleFocused) { _, focused in
            if focused {
                sheetDetent = .large
            }
        }
    }

    private func companionBinding(_ id: String) -> Binding<Bool> {
        Binding(
            get: { companionIDs.contains(id) },
            set: { selected in
                if selected {
                    companionIDs.insert(id)
                } else {
                    companionIDs.remove(id)
                }
            }
        )
    }

    @MainActor
    private func commitTextInputAndPrepareSave() {
        isTitleFocused = false
        Task { @MainActor in
            await Task.yield()
            prepareSave()
        }
    }

    @MainActor
    private func prepareSave() {
        guard !isSaving else { return }
        issue = nil
        let normalizedTitle = title.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !normalizedTitle.isEmpty else {
            issue = String(localized: "Title is required.")
            return
        }
        guard endAt > startAt else {
            issue = String(localized: "End must be after start.")
            return
        }
        if repeatRule != .none, repeatUntil < startAt {
            issue = String(localized: "Repeat end must be after the first event.")
            return
        }

        let request = NativeCalendarEventRequest(
            title: normalizedTitle,
            location: location.trimmingCharacters(in: .whitespacesAndNewlines),
            note: note.trimmingCharacters(in: .whitespacesAndNewlines),
            startAt: startAt.ISO8601Format(),
            endAt: endAt.ISO8601Format(),
            withUserIds: companionIDs.sorted(),
            repeatRule: repeatRule.rawValue,
            repeatUntil: repeatRule == .none ? "" : repeatUntil.ISO8601Format(),
            categoryId: categoryId
        )

        if let event = context.event, event.repeatRule != "NONE" {
            pendingSaveRequest = request
            confirmation = .update
            showConfirmation = true
        } else {
            Task { await save(request, scope: "this") }
        }
    }

    @MainActor
    private func commitPendingSave(scope: String) {
        guard let request = pendingSaveRequest else { return }
        pendingSaveRequest = nil
        confirmation = nil
        Task { await save(request, scope: scope) }
    }

    @MainActor
    private func save(_ body: NativeCalendarEventRequest, scope: String) async {
        guard !isSaving else { return }
        isSaving = true
        issue = nil
        defer { isSaving = false }

        do {
            if let event = context.event {
                let _: APIEnvelope<CalendarUpdateResult> = try await session.sendAuthorized(
                    "api/v1/calendar/events/\(event.id)",
                    method: .patch,
                    body: body,
                    queryItems: [URLQueryItem(name: "scope", value: scope)],
                    idempotencyKey: UUID().uuidString
                )
            } else {
                let _: APIEnvelope<CalendarCreateResult> = try await session.sendAuthorized(
                    "api/v1/calendar/events",
                    method: .post,
                    body: body,
                    idempotencyKey: UUID().uuidString
                )
            }
            await onSaved()
            dismiss()
        } catch {
            issue = error.localizedDescription
        }
    }

    @MainActor
    private func delete(scope: String) async {
        guard !isSaving, let event = context.event else { return }
        isSaving = true
        issue = nil
        defer { isSaving = false }
        do {
            let _: APIEnvelope<CalendarDeleteResult> = try await session.sendAuthorized(
                "api/v1/calendar/events/\(event.id)",
                method: .delete,
                queryItems: [URLQueryItem(name: "scope", value: scope)],
                idempotencyKey: UUID().uuidString
            )
            await onSaved()
            dismiss()
        } catch {
            issue = error.localizedDescription
        }
    }
}

private extension Date {
    static func sideSeatEventISO8601(_ value: String) -> Date? {
        let fractional = ISO8601DateFormatter()
        fractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return fractional.date(from: value) ?? ISO8601DateFormatter().date(from: value)
    }
}
