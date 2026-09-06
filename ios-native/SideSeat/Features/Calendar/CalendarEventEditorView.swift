import SwiftUI
import UIKit

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

enum NativeCalendarRepeatRule: String, CaseIterable, Codable, Identifiable, Sendable {
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

    var localizedLabel: String {
        switch self {
        case .none: AppLocalization.string("Does not repeat")
        case .daily: AppLocalization.string("Every day")
        case .weekly: AppLocalization.string("Every week")
        case .biweekly: AppLocalization.string("Every two weeks")
        case .monthly: AppLocalization.string("Every month")
        case .yearly: AppLocalization.string("Every year")
        }
    }
}

struct CalendarUpdateResult: Decodable, Sendable {
    let id: String
}

struct CalendarDeleteResult: Decodable, Sendable {
    let deleted: Int
}

private enum CalendarEventConfirmation {
    case update
    case delete
}

enum CalendarEventTiming {
    static let defaultDuration: TimeInterval = 60 * 60
    static let selectionStepMinutes = 5
    static let minimumSelectableDuration = TimeInterval(selectionStepMinutes * 60)

    static func isAlignedToSelectionStep(
        _ date: Date,
        calendar: Calendar = .sideSeatBerlin
    ) -> Bool {
        let minuteStart = startOfMinute(containing: date)
        return abs(date.timeIntervalSince(minuteStart)) < 1
            && calendar.component(.minute, from: minuteStart) % selectionStepMinutes == 0
    }

    /// New plans should start on the next selectable minute without carrying seconds forward.
    static func snappedUpToSelectionStep(
        _ date: Date,
        calendar: Calendar = .sideSeatBerlin
    ) -> Date {
        let minuteStart = startOfMinute(containing: date)
        let minute = calendar.component(.minute, from: minuteStart)
        let remainder = minute % selectionStepMinutes
        let carriesPartialMinute = date.timeIntervalSince(minuteStart) >= 1
        guard remainder != 0 || carriesPartialMinute else { return minuteStart }
        let minutesToAdd = remainder == 0
            ? selectionStepMinutes
            : selectionStepMinutes - remainder
        return minuteStart.addingTimeInterval(
            TimeInterval(minutesToAdd * 60)
        )
    }

    /// Combines the day selected in calendar chrome with the current clock time.
    /// A toolbar/floating create action therefore never inherits the week viewport's
    /// midnight anchor, while taps on explicit timeline slots can still pass their
    /// exact date directly to the editor.
    static func defaultStart(
        on selectedDay: Date,
        now: Date = Date(),
        calendar: Calendar = .sideSeatBerlin
    ) -> Date {
        let dayStart = calendar.startOfDay(for: selectedDay)
        let clock = calendar.dateComponents([.hour, .minute, .second], from: now)
        let combined = calendar.date(
            bySettingHour: clock.hour ?? 0,
            minute: clock.minute ?? 0,
            second: clock.second ?? 0,
            of: dayStart,
            matchingPolicy: .nextTimePreservingSmallerComponents,
            repeatedTimePolicy: .first,
            direction: .forward
        ) ?? dayStart
        return snappedUpToSelectionStep(combined, calendar: calendar)
    }

    static func snappedToNearestSelectionStep(
        _ date: Date,
        calendar: Calendar = .sideSeatBerlin
    ) -> Date {
        let minuteStart = startOfMinute(containing: date)
        let minute = calendar.component(.minute, from: minuteStart)
        let remainder = minute % selectionStepMinutes
        guard remainder != 0 else { return minuteStart }
        let adjustment = remainder * 2 < selectionStepMinutes
            ? -remainder
            : selectionStepMinutes - remainder
        return minuteStart.addingTimeInterval(TimeInterval(adjustment * 60))
    }

    static func firstSelectableEnd(
        after start: Date,
        calendar: Calendar = .sideSeatBerlin
    ) -> Date {
        let earliestEnd = start.addingTimeInterval(minimumSelectableDuration)
        let snappedEnd = snappedUpToSelectionStep(earliestEnd, calendar: calendar)
        guard snappedEnd < earliestEnd else { return snappedEnd }
        return snappedEnd.addingTimeInterval(minimumSelectableDuration)
    }

    static func endPreservingDuration(
        oldStart: Date,
        newStart: Date,
        end: Date
    ) -> Date {
        let currentDuration = end.timeIntervalSince(oldStart)
        return newStart.addingTimeInterval(
            currentDuration > 0 ? currentDuration : defaultDuration
        )
    }

    private static func startOfMinute(containing date: Date) -> Date {
        let interval = date.timeIntervalSinceReferenceDate
        return Date(timeIntervalSinceReferenceDate: floor(interval / 60) * 60)
    }
}

enum CalendarEventFormField: Hashable {
    case title
    case location
    case notes
}

enum CalendarEventFormValidation {
    static func issue(
        title: String,
        startAt: Date,
        endAt: Date,
        repeatRule: NativeCalendarRepeatRule,
        repeatUntil: Date,
        repeatHasEnd: Bool
    ) -> String? {
        guard !title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            return AppLocalization.string("Title is required.")
        }
        guard endAt > startAt else {
            return AppLocalization.string("End must be after start.")
        }
        if repeatRule != .none, repeatHasEnd, repeatUntil < startAt {
            return AppLocalization.string("Repeat end must be after the first event.")
        }
        return nil
    }
}

struct CalendarEventFormFields: View {
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    @Binding var title: String
    @Binding var location: String
    @Binding var note: String
    @Binding var startAt: Date
    @Binding var endAt: Date
    @Binding var categoryID: String?
    @Binding var repeatRule: NativeCalendarRepeatRule
    @Binding var repeatUntil: Date
    @Binding var repeatHasEnd: Bool

    let categories: [NativeHomeCalendarCategory]
    let preservesLegacyOffGridTimes: Bool
    let focusedField: FocusState<CalendarEventFormField?>.Binding

    var body: some View {
        Group {
            Section {
                TextField("Title", text: $title)
                    .textInputAutocapitalization(.sentences)
                    .focused(focusedField, equals: .title)
                    .submitLabel(.next)
                    .onSubmit { focusedField.wrappedValue = .location }
                    .accessibilityIdentifier("event-title")
                    .calendarEventPrimaryRow()
                TextField("Location", text: $location)
                    .focused(focusedField, equals: .location)
                    .submitLabel(.next)
                    .onSubmit { focusedField.wrappedValue = .notes }
                    .accessibilityIdentifier("event-location")
                    .calendarEventPrimaryRow()
                startTimePicker
                    .calendarEventPrimaryRow()
                endTimePicker
                    .calendarEventPrimaryRow()
                Picker("Repeat", selection: $repeatRule) {
                    ForEach(NativeCalendarRepeatRule.allCases) { rule in
                        Text(rule.label).tag(rule)
                    }
                }
                .accessibilityIdentifier("event-repeat")
                .calendarEventPrimaryRow()
                if repeatRule != .none {
                    Picker("End repeat", selection: $repeatHasEnd) {
                        Text("Never").tag(false)
                        Text("On date").tag(true)
                    }
                    .accessibilityIdentifier("event-repeat-end-mode")
                    .calendarEventPrimaryRow()
                    if repeatHasEnd {
                        DatePicker(
                            "Repeat until",
                            selection: $repeatUntil,
                            in: startAt...,
                            displayedComponents: .date
                        )
                        .environment(\.calendar, Calendar.sideSeatBerlin)
                        .environment(\.timeZone, Calendar.sideSeatBerlin.timeZone)
                        .accessibilityIdentifier("event-repeat-until")
                        .calendarEventPrimaryRow()
                    }
                }
            }

            Section {
                TextField("Notes", text: $note, axis: .vertical)
                    .lineLimit(2...5)
                    .focused(focusedField, equals: .notes)
                    .accessibilityIdentifier("event-notes")
            }

            Section {
                calendarCategoryPicker
            }
        }
    }

    private var calendarCategoryPicker: some View {
        Menu {
            Button {
                categoryID = nil
            } label: {
                if categoryID == nil {
                    Label("None", systemImage: "checkmark")
                } else {
                    Text("None")
                }
            }
            .accessibilityIdentifier("event-calendar-option-none")
            .accessibilityAddTraits(categoryID == nil ? .isSelected : [])

            ForEach(categories) { category in
                Button {
                    categoryID = category.id
                } label: {
                    Label {
                        Text(category.displayName)
                    } icon: {
                        calendarCategoryMenuIcon(
                            colorHex: category.color,
                            isSelected: categoryID == category.id
                        )
                    }
                }
                .accessibilityIdentifier("event-calendar-option-\(category.id)")
                .accessibilityAddTraits(categoryID == category.id ? .isSelected : [])
            }
        } label: {
            HStack(spacing: SideSeatTheme.spaceMD) {
                Text("Calendar")
                    .foregroundStyle(SideSeatTheme.textPrimary)
                Spacer(minLength: SideSeatTheme.spaceMD)
                HStack(spacing: SideSeatTheme.spaceSM) {
                    if let selectedCalendarCategory {
                        CalendarCategoryColorIndicator(
                            colorHex: selectedCalendarCategory.color,
                            diameter: 12
                        )
                    }
                    Text(selectedCalendarCategoryName)
                        .lineLimit(1)
                    Image(systemName: "chevron.up.chevron.down")
                        .font(.caption2.weight(.semibold))
                        .foregroundStyle(SideSeatTheme.textSecondary)
                }
                .foregroundStyle(SideSeatTheme.textPrimary)
            }
            .frame(maxWidth: .infinity, minHeight: 44)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Calendar")
        .accessibilityValue(selectedCalendarCategoryName)
        .accessibilityIdentifier("event-calendar-picker")
    }

    private var selectedCalendarCategory: NativeHomeCalendarCategory? {
        categories.first { $0.id == categoryID }
    }

    private var selectedCalendarCategoryName: String {
        selectedCalendarCategory?.displayName ?? AppLocalization.string("None")
    }

    private func calendarCategoryMenuIcon(
        colorHex: String,
        isSelected: Bool
    ) -> Image {
        let systemName = isSelected ? "checkmark.circle.fill" : "circle.fill"
        let fallback = SideSeatTheme.textSecondary
        let tint = UIColor(Color(hex: colorHex) ?? fallback)
        let configuration = UIImage.SymbolConfiguration(pointSize: 14, weight: .semibold)
        guard let symbol = UIImage(systemName: systemName, withConfiguration: configuration) else {
            return Image(systemName: systemName)
        }
        return Image(uiImage: symbol.withTintColor(tint, renderingMode: .alwaysOriginal))
    }

    @ViewBuilder
    private var startTimePicker: some View {
        if !preservesLegacyOffGridTimes || CalendarEventTiming.isAlignedToSelectionStep(startAt) {
            fiveMinuteTimePickerRow(
                label: "Starts",
                selection: startAtBinding,
                minimumDate: nil,
                accessibilityLabel: AppLocalization.string("Starts"),
                identifier: "event-start"
            )
        } else {
            // Preserve legacy/imported off-grid values until the user intentionally edits time.
            DatePicker("Starts", selection: startAtBinding)
                .datePickerStyle(.compact)
                .environment(\.calendar, Calendar.sideSeatBerlin)
                .environment(\.timeZone, Calendar.sideSeatBerlin.timeZone)
                .accessibilityIdentifier("event-start")
        }
    }

    @ViewBuilder
    private var endTimePicker: some View {
        if usesFiveMinuteEndPicker {
            fiveMinuteTimePickerRow(
                label: "Ends",
                selection: endAtBinding,
                minimumDate: CalendarEventTiming.firstSelectableEnd(after: startAt),
                accessibilityLabel: AppLocalization.string("Ends"),
                identifier: "event-end"
            )
        } else {
            // Preserve legacy/imported off-grid values until the user intentionally edits time.
            DatePicker(
                "Ends",
                selection: endAtBinding,
                in: legacyMinimumEnd...,
                displayedComponents: [.date, .hourAndMinute]
            )
            .datePickerStyle(.compact)
            .environment(\.calendar, Calendar.sideSeatBerlin)
            .environment(\.timeZone, Calendar.sideSeatBerlin.timeZone)
            .accessibilityIdentifier("event-end")
        }
    }

    @ViewBuilder
    private func fiveMinuteTimePickerRow(
        label: LocalizedStringKey,
        selection: Binding<Date>,
        minimumDate: Date?,
        accessibilityLabel: String,
        identifier: String
    ) -> some View {
        if dynamicTypeSize.isAccessibilitySize {
            VStack(alignment: .leading, spacing: SideSeatTheme.spaceSM) {
                Text(label)
                    .foregroundStyle(SideSeatTheme.textPrimary)
                    .accessibilityHidden(true)
                CalendarMinuteStepDatePicker(
                    selection: selection,
                    minimumDate: minimumDate,
                    style: .compact,
                    locale: eventPresentationLocale,
                    accessibilityLabel: accessibilityLabel,
                    accessibilityIdentifier: identifier
                )
                .frame(maxWidth: .infinity, minHeight: 44)
            }
        } else {
            HStack(spacing: SideSeatTheme.spaceMD) {
                Text(label)
                    .foregroundStyle(SideSeatTheme.textPrimary)
                    .accessibilityHidden(true)
                Spacer(minLength: SideSeatTheme.spaceMD)
                CalendarMinuteStepDatePicker(
                    selection: selection,
                    minimumDate: minimumDate,
                    style: .compact,
                    locale: eventPresentationLocale,
                    accessibilityLabel: accessibilityLabel,
                    accessibilityIdentifier: identifier
                )
                .frame(width: 220, height: 44)
            }
        }
    }

    private var startAtBinding: Binding<Date> {
        Binding(
            get: { startAt },
            set: { newStart in
                let alignedStart = !preservesLegacyOffGridTimes
                    || CalendarEventTiming.isAlignedToSelectionStep(startAt)
                    ? CalendarEventTiming.snappedToNearestSelectionStep(newStart)
                    : newStart
                let nextEnd = CalendarEventTiming.endPreservingDuration(
                    oldStart: startAt,
                    newStart: alignedStart,
                    end: endAt
                )
                startAt = alignedStart
                endAt = nextEnd
                if repeatUntil < alignedStart {
                    repeatUntil = Calendar.sideSeatBerlin.date(
                        byAdding: .month,
                        value: 1,
                        to: alignedStart
                    ) ?? alignedStart
                }
            }
        )
    }

    private var endAtBinding: Binding<Date> {
        Binding(
            get: { endAt },
            set: { newEnd in
                guard usesFiveMinuteEndPicker else {
                    endAt = max(newEnd, legacyMinimumEnd)
                    return
                }
                let minimumEnd = CalendarEventTiming.firstSelectableEnd(after: startAt)
                let alignedEnd = CalendarEventTiming.snappedToNearestSelectionStep(newEnd)
                endAt = max(alignedEnd, minimumEnd)
            }
        )
    }

    private var usesFiveMinuteEndPicker: Bool {
        !preservesLegacyOffGridTimes
            || (
                CalendarEventTiming.isAlignedToSelectionStep(endAt)
                    && endAt >= CalendarEventTiming.firstSelectableEnd(after: startAt)
            )
    }

    private var legacyMinimumEnd: Date {
        startAt.addingTimeInterval(60)
    }

    private var eventPresentationLocale: Locale {
        let language = AppLocalization.selectedLanguage
        guard let languageIdentifier = language.localizationIdentifier else {
            return .autoupdatingCurrent
        }
        guard let region = Locale.autoupdatingCurrent.region?.identifier else {
            return language.locale
        }
        return Locale(identifier: "\(languageIdentifier)_\(region)")
    }
}

struct CalendarEventEditorView: View {
    // Keep enough calendar context visible when creating, while leaving the primary fields above the fold.
    private static let creationDetent = SSSheetPresentation.creationForm

    @Environment(\.dismiss) private var dismiss
    @Environment(SessionStore.self) private var session

    private let context: CalendarEventEditorContext
    private let smartScheduleEnabled: Bool
    private let onSaved: @MainActor () async -> Void

    @State private var title: String
    @State private var location: String
    @State private var note: String
    @State private var startAt: Date
    @State private var endAt: Date
    @State private var categoryId: String?
    @State private var repeatRule: NativeCalendarRepeatRule
    @State private var repeatUntil: Date
    @State private var repeatHasEnd: Bool
    @State private var companionIDs: Set<String>
    @State private var isSaving = false
    @State private var issue: String?
    @State private var confirmation: CalendarEventConfirmation?
    @State private var showConfirmation = false
    @State private var pendingSaveRequest: NativeCalendarEventRequest?
    @State private var showsSmartFill = false
    @State private var smartFillDidSave = false
    @State private var selectedPresentationDetent: PresentationDetent
    @FocusState private var focusedTextField: CalendarEventFormField?

    init(
        context: CalendarEventEditorContext,
        smartScheduleEnabled: Bool = false,
        onSaved: @escaping @MainActor () async -> Void
    ) {
        self.context = context
        self.smartScheduleEnabled = smartScheduleEnabled
        self.onSaved = onSaved

        let calendar = Calendar.sideSeatBerlin
        let eventStart = context.event.flatMap { Date.sideSeatEventISO8601($0.startISO) }
        let eventEnd = context.event.flatMap { Date.sideSeatEventISO8601($0.endISO) }
        // Keep the tapped slot, while a toolbar-created event moves forward to the next
        // selectable five-minute boundary instead of starting in the past.
        let proposed = CalendarEventTiming.snappedUpToSelectionStep(
            context.proposedStart,
            calendar: calendar
        )
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
        _repeatHasEnd = State(initialValue: context.event?.repeatUntilISO != nil)
        _companionIDs = State(
            initialValue: Set(context.event?.eventParticipants.compactMap(\.userId) ?? [])
        )
        _selectedPresentationDetent = State(
            initialValue: context.event == nil ? Self.creationDetent : .large
        )
    }

    var body: some View {
        NavigationStack {
            Form {
                if context.event == nil, smartScheduleEnabled {
                    Section {
                        Button {
                            focusedTextField = nil
                            showsSmartFill = true
                        } label: {
                            HStack(spacing: SideSeatTheme.spaceMD) {
                                Image(systemName: "sparkles")
                                    .font(.body.weight(.semibold))
                                    .foregroundStyle(SideSeatTheme.HubTint.plans)
                                    .frame(width: 38, height: 38)
                                    .background(SideSeatTheme.HubTint.plans.opacity(0.12), in: Circle())

                                VStack(alignment: .leading, spacing: 2) {
                                    Text("Smart fill")
                                        .font(.body.weight(.semibold))
                                        .foregroundStyle(SideSeatTheme.textPrimary)
                                    Text("Describe or dictate your schedule")
                                        .font(.footnote)
                                        .foregroundStyle(SideSeatTheme.textSecondary)
                                }

                                Spacer(minLength: SideSeatTheme.spaceSM)

                                Image(systemName: "chevron.right")
                                    .font(.footnote.weight(.semibold))
                                    .foregroundStyle(.tertiary)
                            }
                            .contentShape(Rectangle())
                            .padding(.vertical, 2)
                        }
                        .buttonStyle(SSPressButtonStyle())
                        .accessibilityIdentifier("event-smart-fill")
                    }
                }

                CalendarEventFormFields(
                    title: $title,
                    location: $location,
                    note: $note,
                    startAt: $startAt,
                    endAt: $endAt,
                    categoryID: $categoryId,
                    repeatRule: $repeatRule,
                    repeatUntil: $repeatUntil,
                    repeatHasEnd: $repeatHasEnd,
                    categories: context.categories,
                    preservesLegacyOffGridTimes: context.event != nil,
                    focusedField: $focusedTextField
                )

                if !context.companions.isEmpty {
                    Section("With") {
                        ForEach(context.companions) { companion in
                            Toggle(companion.name, isOn: companionBinding(companion.id))
                                .tint(SideSeatTheme.accentText)
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
                            focusedTextField = nil
                            confirmation = .delete
                            showConfirmation = true
                        }
                        .disabled(isSaving)
                    }
                }
            }
            .background(
                CalendarEventKeyboardDismissBridge {
                    focusedTextField = nil
                }
            )
            .simultaneousGesture(
                DragGesture(minimumDistance: 4).onChanged { _ in
                    guard focusedTextField != nil else { return }
                    focusedTextField = nil
                }
            )
            .scrollDismissesKeyboard(.immediately)
            .accessibilityIdentifier("event-editor-form")
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
                    .ssConfirmationActionStyle()
                }
                ToolbarItemGroup(placement: .keyboard) {
                    Spacer()
                    Button("Done") { focusedTextField = nil }
                        .accessibilityIdentifier("event-keyboard-done")
                }
            }
            .ssActionPrompt(
                isPresented: $showConfirmation,
                title: eventConfirmationTitle,
                systemImage: confirmation == .update ? "arrow.triangle.2.circlepath" : "trash.fill",
                tint: confirmation == .update ? SideSeatTheme.accentText : SideSeatTheme.danger,
                onDismiss: clearEventConfirmation,
                accessibilityIdentifier: "event-action-prompt",
                actions: { eventConfirmationActions }
            )
            .sheet(isPresented: $showsSmartFill, onDismiss: finishSmartFillIfNeeded) {
                CalendarSmartAddView(categories: context.categories) {
                    smartFillDidSave = true
                    await onSaved()
                }
            }
        }
        .presentationDetents(presentationDetents, selection: $selectedPresentationDetent)
        .presentationDragIndicator(.visible)
        .presentationContentInteraction(.scrolls)
    }

    private var presentationDetents: Set<PresentationDetent> {
        context.event == nil ? [Self.creationDetent, .large] : [.large]
    }

    private var eventConfirmationTitle: String {
        AppLocalization.string(
            confirmation == .update
                ? "Apply changes to recurring event?"
                : "Delete this event?"
        )
    }

    private var eventConfirmationActions: [SSActionPromptAction] {
        var actions: [SSActionPromptAction]
        let deletesRecurringEvent = context.event.map {
            $0.repeatRule != NativeCalendarRepeatRule.none.rawValue
        } ?? false

        if confirmation == .update {
            actions = [
                SSActionPromptAction(
                    id: "event-update-this",
                    title: AppLocalization.string("Only this event"),
                    systemImage: "calendar"
                ) {
                    commitPendingSave(scope: "this")
                },
                SSActionPromptAction(
                    id: "event-update-future",
                    title: AppLocalization.string("This and future events"),
                    systemImage: "calendar.badge.plus"
                ) {
                    commitPendingSave(scope: "future")
                },
                SSActionPromptAction(
                    id: "event-update-all",
                    title: AppLocalization.string("All events"),
                    systemImage: "calendar.circle"
                ) {
                    commitPendingSave(scope: "all")
                },
            ]
        } else {
            actions = [
                SSActionPromptAction(
                    id: "event-delete-this",
                    title: AppLocalization.string(
                        deletesRecurringEvent ? "Delete this event" : "Delete event"
                    ),
                    systemImage: "trash",
                    role: .destructive
                ) {
                    beginEventDelete(scope: "this")
                },
            ]
            if deletesRecurringEvent {
                actions.append(
                    SSActionPromptAction(
                        id: "event-delete-future",
                        title: AppLocalization.string("Delete this and future events"),
                        systemImage: "calendar.badge.minus",
                        role: .destructive
                    ) {
                        beginEventDelete(scope: "future")
                    }
                )
                actions.append(
                    SSActionPromptAction(
                        id: "event-delete-all",
                        title: AppLocalization.string("Delete all events"),
                        systemImage: "trash.slash",
                        role: .destructive
                    ) {
                        beginEventDelete(scope: "all")
                    }
                )
            }
        }

        actions.append(
            SSActionPromptAction(
                id: "event-action-cancel",
                title: AppLocalization.string("Cancel"),
                systemImage: "xmark",
                role: .cancel,
                perform: clearEventConfirmation
            )
        )
        return actions
    }

    @MainActor
    private func clearEventConfirmation() {
        pendingSaveRequest = nil
        confirmation = nil
    }

    @MainActor
    private func beginEventDelete(scope: String) {
        confirmation = nil
        Task { await delete(scope: scope) }
    }

    @MainActor
    private func finishSmartFillIfNeeded() {
        guard smartFillDidSave else { return }
        smartFillDidSave = false
        dismiss()
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
        focusedTextField = nil
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
        if let validationIssue = CalendarEventFormValidation.issue(
            title: normalizedTitle,
            startAt: startAt,
            endAt: endAt,
            repeatRule: repeatRule,
            repeatUntil: repeatUntil,
            repeatHasEnd: repeatHasEnd
        ) {
            issue = validationIssue
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
            repeatUntil: repeatRule == .none || !repeatHasEnd
                ? ""
                : repeatUntil.ISO8601Format(),
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

struct CalendarEventKeyboardDismissBridge: UIViewRepresentable {
    let onTapOutsideTextInput: @MainActor () -> Void

    func makeCoordinator() -> Coordinator {
        Coordinator(action: onTapOutsideTextInput)
    }

    func makeUIView(context: Context) -> WindowObservingView {
        let view = WindowObservingView()
        view.isUserInteractionEnabled = false
        view.onWindowChange = { [weak coordinator = context.coordinator] window in
            coordinator?.install(in: window)
        }
        return view
    }

    func updateUIView(_ view: WindowObservingView, context: Context) {
        context.coordinator.action = onTapOutsideTextInput
        context.coordinator.install(in: view.window)
    }

    static func dismantleUIView(_ view: WindowObservingView, coordinator: Coordinator) {
        view.onWindowChange = nil
        coordinator.uninstall()
    }

    @MainActor
    final class Coordinator: NSObject, UIGestureRecognizerDelegate {
        var action: @MainActor () -> Void
        private weak var installedWindow: UIWindow?
        private lazy var recognizer: UITapGestureRecognizer = {
            let recognizer = UITapGestureRecognizer(target: self, action: #selector(handleTap))
            recognizer.cancelsTouchesInView = false
            recognizer.delegate = self
            return recognizer
        }()

        init(action: @escaping @MainActor () -> Void) {
            self.action = action
        }

        func install(in window: UIWindow?) {
            guard installedWindow !== window else { return }
            uninstall()
            guard let window else { return }
            window.addGestureRecognizer(recognizer)
            installedWindow = window
        }

        func uninstall() {
            installedWindow?.removeGestureRecognizer(recognizer)
            installedWindow = nil
        }

        @objc private func handleTap() {
            action()
        }

        func gestureRecognizer(
            _ gestureRecognizer: UIGestureRecognizer,
            shouldReceive touch: UITouch
        ) -> Bool {
            var view = touch.view
            while let current = view {
                if current is UITextField || current is UITextView {
                    return false
                }
                view = current.superview
            }
            return true
        }
    }

    final class WindowObservingView: UIView {
        var onWindowChange: ((UIWindow?) -> Void)?

        override func didMoveToWindow() {
            super.didMoveToWindow()
            onWindowChange?(window)
        }
    }
}

private struct CalendarCategoryColorIndicator: View {
    let colorHex: String
    var diameter: CGFloat = 12

    private var color: Color {
        Color(hex: colorHex) ?? SideSeatTheme.textSecondary
    }

    var body: some View {
        ZStack {
            Circle()
                .fill(color)
            Circle()
                .stroke(Color.primary.opacity(0.18), lineWidth: 0.5)
        }
        .frame(width: diameter, height: diameter)
        .accessibilityHidden(true)
    }
}

private struct CalendarEventPrimaryRowModifier: ViewModifier {
    func body(content: Content) -> some View {
        content
            .frame(minHeight: 44)
            .listRowInsets(
                EdgeInsets(
                    top: 3,
                    leading: SideSeatTheme.spaceLG,
                    bottom: 3,
                    trailing: SideSeatTheme.spaceLG
                )
            )
    }
}

private extension View {
    func calendarEventPrimaryRow() -> some View {
        modifier(CalendarEventPrimaryRowModifier())
    }
}

struct CalendarMinuteStepDatePicker: UIViewRepresentable {
    @Binding var selection: Date

    let minimumDate: Date?
    let style: UIDatePickerStyle
    let locale: Locale
    let accessibilityLabel: String
    let accessibilityIdentifier: String

    func makeCoordinator() -> Coordinator {
        Coordinator(parent: self)
    }

    func makeUIView(context: Context) -> UIDatePicker {
        let picker = UIDatePicker()
        picker.datePickerMode = .dateAndTime
        picker.preferredDatePickerStyle = style
        picker.addTarget(
            context.coordinator,
            action: #selector(Coordinator.valueChanged(_:)),
            for: .valueChanged
        )
        configure(picker)
        return picker
    }

    func updateUIView(_ picker: UIDatePicker, context: Context) {
        context.coordinator.parent = self
        configure(picker)
    }

    private func configure(_ picker: UIDatePicker) {
        picker.calendar = Calendar.sideSeatBerlin
        picker.timeZone = Calendar.sideSeatBerlin.timeZone
        picker.locale = locale
        picker.minuteInterval = CalendarEventTiming.selectionStepMinutes
        picker.roundsToMinuteInterval = true
        picker.minimumDate = minimumDate
        picker.accessibilityLabel = accessibilityLabel
        picker.accessibilityIdentifier = accessibilityIdentifier
        if abs(picker.date.timeIntervalSince(selection)) >= 1 {
            picker.setDate(selection, animated: false)
        }
    }

    @MainActor
    final class Coordinator: NSObject {
        var parent: CalendarMinuteStepDatePicker

        init(parent: CalendarMinuteStepDatePicker) {
            self.parent = parent
        }

        @objc func valueChanged(_ picker: UIDatePicker) {
            parent.selection = CalendarEventTiming.snappedToNearestSelectionStep(picker.date)
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
