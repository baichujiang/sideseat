import SwiftUI

struct CalendarSmartAddView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(SessionStore.self) private var session
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    let categories: [NativeHomeCalendarCategory]
    let onSaved: @MainActor () async -> Void

    @State private var store = CalendarSmartAddStore()
    @State private var voiceInput = CalendarVoiceInput.forCurrentProcess()
    @State private var text = ""
    @State private var voicePrefix = ""
    @State private var voiceStartTask: Task<Void, Never>?
    @State private var showWarningDetails = false
    @State private var editingDraft: NativeCalendarNaturalDraft?
    @State private var selectedPresentationDetent = SSSheetPresentation.adaptiveInput
    @FocusState private var isInputFocused: Bool

    private static let exposesPresentationStateForUITesting =
        ProcessInfo.processInfo.arguments.contains("--ui-testing-expose-smart-detent")

    var body: some View {
        NavigationStack {
            ZStack {
                SideSeatTheme.bgGrouped.ignoresSafeArea()

                ScrollView {
                    LazyVStack(alignment: .leading, spacing: SideSeatTheme.spaceXL) {
                        if store.drafts.isEmpty {
                            inputPanel
                        } else {
                            previewContent
                        }

                        if let issue = store.issue {
                            issuePanel(issue)
                        }
                    }
                    .padding(.horizontal, SideSeatTheme.screenHorizontal)
                    .padding(.top, SideSeatTheme.spaceLG)
                    .padding(.bottom, SideSeatTheme.spaceXL)
                }
                .scrollDismissesKeyboard(.interactively)
                .accessibilityIdentifier("smart-schedule-view")
                .accessibilityValue(
                    Self.exposesPresentationStateForUITesting
                        ? (dynamicTypeSize.isAccessibilitySize || selectedPresentationDetent == .large
                            ? "large"
                            : "compact")
                        : ""
                )
            }
            .toolbar(.hidden, for: .navigationBar)
            .interactiveDismissDisabled(store.isSaving)
            .safeAreaInset(edge: .top, spacing: 0) {
                smartFillHeader
            }
            .safeAreaInset(edge: .bottom, spacing: 0) {
                bottomActionBar
            }
            .overlay {
                if store.isSaving {
                    SSLoadingState("Adding events")
                        .padding(18)
                        .background(.regularMaterial)
                        .clipShape(RoundedRectangle(cornerRadius: SideSeatTheme.controlRadius, style: .continuous))
                }
            }
            .sheet(item: $editingDraft) { draft in
                CalendarSmartDraftEditorView(
                    draft: draft,
                    categories: categories,
                    onApply: { store.updateDraft($0) },
                    onRemove: { store.removeDraft(withID: draft.id) }
                )
            }
            .onChange(of: voiceInput.transcript) { _, transcript in
                text = CalendarVoiceTranscript.merge(prefix: voicePrefix, transcript: transcript)
            }
            .onChange(of: isInputFocused) { _, isFocused in
                guard isFocused else { return }
                selectedPresentationDetent = .large
            }
            .onChange(of: store.drafts.isEmpty) { _, isEmpty in
                guard !isEmpty else { return }
                selectedPresentationDetent = .large
            }
            .onDisappear {
                voiceStartTask?.cancel()
                voiceStartTask = nil
                voiceInput.stop()
            }
        }
        .presentationDetents(
            [SSSheetPresentation.adaptiveInput, .large],
            selection: $selectedPresentationDetent
        )
        .presentationDragIndicator(.visible)
        .presentationContentInteraction(.scrolls)
    }

    private var smartFillHeader: some View {
        ZStack {
            HStack(spacing: 7) {
                Image(systemName: "sparkles")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(SideSeatTheme.accentText)

                Text("Smart fill")
                    .font(.headline)
                    .foregroundStyle(SideSeatTheme.textPrimary)
            }

            HStack {
                Button {
                    dismiss()
                } label: {
                    Image(systemName: "xmark")
                        .font(.caption.weight(.bold))
                        .foregroundStyle(SideSeatTheme.textPrimary)
                        .frame(width: 44, height: 44)
                        .background {
                            Circle()
                                .fill(SideSeatTheme.Interaction.neutralControlFill)
                                .frame(width: 34, height: 34)
                                .overlay {
                                    Circle()
                                        .strokeBorder(
                                            SideSeatTheme.separator.opacity(0.55),
                                            lineWidth: 0.5
                                        )
                                }
                        }
                }
                .buttonStyle(SSPressButtonStyle())
                .disabled(store.isSaving)
                .accessibilityLabel("Cancel")
                .accessibilityIdentifier("smart-schedule-cancel")

                Spacer()
            }
        }
        .frame(height: 56)
        .padding(.horizontal, SideSeatTheme.spaceMD)
        .background(.bar)
        .overlay(alignment: .bottom) { Divider() }
    }

    private var inputPanel: some View {
        VStack(spacing: 0) {
            VStack(alignment: .leading, spacing: SideSeatTheme.spaceMD) {
                Text("Describe your schedule")
                    .font(.headline)
                    .foregroundStyle(SideSeatTheme.textPrimary)

                ZStack(alignment: .topLeading) {
                    if text.isEmpty {
                        Text("For example: Tomorrow at 3 PM, study at the library for two hours.")
                            .font(.callout)
                            .foregroundStyle(SideSeatTheme.textSecondary)
                            .padding(.horizontal, 5)
                            .padding(.vertical, 8)
                            .allowsHitTesting(false)
                    }

                    TextEditor(text: $text)
                        .font(.body)
                        .scrollContentBackground(.hidden)
                        .frame(
                            minHeight: dynamicTypeSize.isAccessibilitySize ? 176 : 124,
                            maxHeight: dynamicTypeSize.isAccessibilitySize ? 240 : 168
                        )
                        .focused($isInputFocused)
                        .accessibilityIdentifier("smart-schedule-input")
                }
            }
            .padding(SideSeatTheme.spaceLG)

            Divider()
                .padding(.leading, SideSeatTheme.spaceLG)

            Button {
                toggleVoiceInput()
            } label: {
                HStack(spacing: SideSeatTheme.spaceMD) {
                    Text(voiceButtonTitle)
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(voiceButtonTitleColor)

                    Spacer(minLength: SideSeatTheme.spaceSM)

                    Group {
                        if voiceInput.isStarting {
                            ProgressView()
                                .tint(voiceButtonIconColor)
                        } else {
                            Image(systemName: voiceInput.isRecording ? "stop.fill" : "mic.fill")
                                .font(.body.weight(.semibold))
                        }
                    }
                    .frame(width: 36, height: 36)
                    .foregroundStyle(voiceButtonIconColor)
                    .background(voiceButtonBackground, in: Circle())
                    .accessibilityHidden(true)
                }
                .frame(maxWidth: .infinity, minHeight: 56, alignment: .leading)
                .padding(.horizontal, SideSeatTheme.spaceLG)
                .contentShape(Rectangle())
                .background(voiceRowBackground)
            }
            .buttonStyle(SSPressButtonStyle())
            .accessibilityLabel(voiceInput.isActive ? "Stop dictation" : "Dictate event")
            .accessibilityValue(voiceButtonTitle)
            .accessibilityIdentifier("smart-schedule-voice")

            if let voiceIssue = voiceInput.issue {
                Divider()
                    .padding(.leading, SideSeatTheme.spaceLG)

                VStack(alignment: .leading, spacing: SideSeatTheme.spaceSM) {
                    Label(voiceIssue, systemImage: "exclamationmark.triangle")
                        .font(.footnote)
                        .foregroundStyle(SideSeatTheme.danger)
                    if voiceInput.needsSettings {
                        Button("Open Settings") {
                            guard let url = URL(string: UIApplication.openSettingsURLString) else { return }
                            UIApplication.shared.open(url)
                        }
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(SideSeatTheme.spaceLG)
            }
        }
        .background(
            SideSeatTheme.surface,
            in: RoundedRectangle(cornerRadius: SideSeatTheme.cardRadius, style: .continuous)
        )
        .clipShape(RoundedRectangle(cornerRadius: SideSeatTheme.cardRadius, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: SideSeatTheme.cardRadius, style: .continuous)
                .stroke(SideSeatTheme.separator.opacity(0.45), lineWidth: 0.5)
        }
    }

    @ViewBuilder
    private var previewContent: some View {
        VStack(alignment: .leading, spacing: SideSeatTheme.spaceMD) {
            CalendarSmartResultSummary(
                eventCount: store.drafts.count,
                dateRange: previewDateRange
            )

            if !store.warnings.isEmpty {
                Divider()
                warningDisclosure
            }
        }
        .padding(SideSeatTheme.spaceLG)
        .background(
            SideSeatTheme.surface,
            in: RoundedRectangle(cornerRadius: SideSeatTheme.cardRadius, style: .continuous)
        )

        ForEach(previewDayGroups) { group in
            VStack(alignment: .leading, spacing: SideSeatTheme.spaceMD) {
                HStack {
                    Text(group.day.formatted(.dateTime.weekday(.wide).month(.wide).day()))
                        .font(.headline)
                        .foregroundStyle(SideSeatTheme.textPrimary)
                    Spacer()
                    Text(eventCountLabel(group.drafts.count))
                        .font(.subheadline)
                        .foregroundStyle(SideSeatTheme.textSecondary)
                        .monospacedDigit()
                }

                VStack(spacing: 0) {
                    ForEach(Array(group.drafts.enumerated()), id: \.element.id) { index, draft in
                        CalendarSmartDraftRow(
                            draft: draft,
                            categories: categories
                        ) {
                            editingDraft = draft
                        }

                        if index < group.drafts.count - 1 {
                            Divider()
                                .padding(.leading, 82)
                        }
                    }
                }
                .padding(.horizontal, SideSeatTheme.spaceLG)
                .background(
                    SideSeatTheme.surface,
                    in: RoundedRectangle(cornerRadius: SideSeatTheme.cardRadius, style: .continuous)
                )
            }
        }
    }

    private var warningDisclosure: some View {
        DisclosureGroup(isExpanded: $showWarningDetails) {
            VStack(alignment: .leading, spacing: 10) {
                ForEach(Array(store.warnings.enumerated()), id: \.offset) { _, warning in
                    HStack(alignment: .top, spacing: 8) {
                        Circle()
                            .fill(SideSeatTheme.warning)
                            .frame(width: 5, height: 5)
                            .padding(.top, 7)
                        Text(warning)
                            .font(.footnote)
                            .foregroundStyle(SideSeatTheme.textSecondary)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
            }
            .padding(.top, 8)
        } label: {
            Label {
                VStack(alignment: .leading, spacing: 2) {
                    Text(reviewDetailCountLabel)
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(SideSeatTheme.textPrimary)
                    Text("Smart add made a few assumptions.")
                        .font(.caption)
                        .foregroundStyle(SideSeatTheme.textSecondary)
                }
            } icon: {
                Image(systemName: "exclamationmark.triangle.fill")
                    .foregroundStyle(SideSeatTheme.warning)
            }
        }
        .tint(SideSeatTheme.textSecondary)
        .accessibilityIdentifier("smart-schedule-warning-summary")
    }

    @ViewBuilder
    private var bottomActionBar: some View {
        if store.drafts.isEmpty {
            SSPrimaryButton(
                title: AppLocalization.string( "Preview events"),
                isLoading: store.isParsing,
                fill: .product,
                height: 48,
                accessibilityID: "smart-schedule-parse"
            ) {
                previewEvents()
            }
            .disabled(text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || store.isParsing)
            .padding(.horizontal, SideSeatTheme.spaceLG)
            .padding(.vertical, 10)
            .background(.bar)
            .overlay(alignment: .top) { Divider() }
        } else {
            HStack(spacing: 12) {
                Button(action: startOver) {
                    Image(systemName: "arrow.counterclockwise")
                        .font(.body.weight(.semibold))
                        .foregroundStyle(SideSeatTheme.textPrimary)
                        .frame(width: 48, height: 48)
                        .background(SideSeatTheme.Interaction.neutralControlFill, in: Circle())
                        .overlay {
                            Circle()
                                .strokeBorder(
                                    SideSeatTheme.separator.opacity(0.55),
                                    lineWidth: 0.5
                                )
                        }
                }
                .disabled(store.isSaving)
                .accessibilityLabel("Start over")
                .accessibilityIdentifier("smart-schedule-start-over")

                SSPrimaryButton(
                    title: addEventsLabel,
                    isLoading: store.isSaving,
                    fill: .product,
                    height: 48,
                    accessibilityID: "smart-schedule-save"
                ) {
                    Task { await save() }
                }
                .disabled(store.isSaving)
            }
            .padding(.horizontal, SideSeatTheme.spaceLG)
            .padding(.vertical, 10)
            .background(.bar)
            .overlay(alignment: .top) { Divider() }
        }
    }

    private func issuePanel(_ issue: String) -> some View {
        VStack(alignment: .leading, spacing: SideSeatTheme.spaceMD) {
            Label(issue, systemImage: "exclamationmark.triangle")
                .font(.subheadline)
                .foregroundStyle(SideSeatTheme.danger)
            if store.needsSignIn {
                Button("Sign in") {
                    dismiss()
                    Task { await session.logout() }
                }
                .accessibilityIdentifier("smart-schedule-sign-in")
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(SideSeatTheme.spaceLG)
        .background(
            SideSeatTheme.danger.opacity(0.08),
            in: RoundedRectangle(cornerRadius: SideSeatTheme.controlRadius, style: .continuous)
        )
    }

    private func previewEvents() {
        voiceStartTask?.cancel()
        voiceInput.stop()
        isInputFocused = false
        Task { await parse() }
    }

    private func eventCountLabel(_ count: Int) -> String {
        String.localizedStringWithFormat(
            AppLocalization.string( "%lld events"),
            count
        )
    }

    private var voiceButtonBackground: Color {
        if voiceInput.isRecording {
            return SideSeatTheme.danger
        }
        if voiceInput.isStarting {
            return SideSeatTheme.accent
        }
        return SideSeatTheme.accent.opacity(0.12)
    }

    private var voiceButtonIconColor: Color {
        if voiceInput.isRecording {
            return .white
        }
        if voiceInput.isStarting {
            return SideSeatTheme.onAccent
        }
        return SideSeatTheme.accentText
    }

    private var voiceButtonTitle: LocalizedStringKey {
        if voiceInput.isStarting {
            return "Preparing microphone"
        }
        if voiceInput.isRecording {
            return "Listening"
        }
        return "Voice input"
    }

    private var voiceButtonTitleColor: Color {
        voiceInput.isRecording ? SideSeatTheme.danger : SideSeatTheme.textPrimary
    }

    private var voiceRowBackground: Color {
        voiceInput.isRecording
            ? SideSeatTheme.danger.opacity(0.07)
            : .clear
    }

    private var previewDayGroups: [CalendarSmartDraftDay] {
        let calendar = Calendar.sideSeatBerlin
        let grouped = Dictionary(grouping: store.drafts) { draft in
            calendar.startOfDay(for: CalendarSmartDateParser.parse(draft.startAt) ?? .distantPast)
        }
        return grouped
            .map { CalendarSmartDraftDay(day: $0.key, drafts: $0.value.sorted(by: CalendarSmartDateParser.isEarlier)) }
            .sorted { $0.day < $1.day }
    }

    private var previewDateRange: String {
        let dates = store.drafts.compactMap { CalendarSmartDateParser.parse($0.startAt) }
        guard let first = dates.min(), let last = dates.max() else { return "" }
        if Calendar.sideSeatBerlin.isDate(first, inSameDayAs: last) {
            return first.formatted(.dateTime.year().month(.abbreviated).day())
        }
        return first.formatted(.dateTime.month(.abbreviated).day())
            + " – "
            + last.formatted(.dateTime.month(.abbreviated).day())
    }

    private var reviewDetailCountLabel: String {
        String.localizedStringWithFormat(
            AppLocalization.string( "%lld details to review"),
            store.warnings.count
        )
    }

    private var addEventsLabel: String {
        String.localizedStringWithFormat(
            AppLocalization.string( "Add %lld events"),
            store.drafts.count
        )
    }

    private func startOver() {
        showWarningDetails = false
        store = CalendarSmartAddStore()
        isInputFocused = false
        selectedPresentationDetent = SSSheetPresentation.adaptiveInput
    }

    private func toggleVoiceInput() {
        if voiceInput.isActive {
            voiceStartTask?.cancel()
            voiceStartTask = nil
            voiceInput.stop()
            return
        }

        voicePrefix = text
        isInputFocused = false
        voiceStartTask?.cancel()
        voiceStartTask = Task { @MainActor in
            await Task.yield()
            guard !Task.isCancelled else { return }
            await voiceInput.start()
        }
    }

    private func parse() async {
        showWarningDetails = false
        let language = Locale.current.language.languageCode?.identifier == "zh" ? "zh-CN" : "en"
        await store.parse(text: text, locale: language, using: session)
    }

    private func save() async {
        guard await store.save(using: session) else { return }
        await onSaved()
        dismiss()
    }
}

private struct CalendarSmartDraftDay: Identifiable {
    let day: Date
    let drafts: [NativeCalendarNaturalDraft]

    var id: Date { day }
}

private struct CalendarSmartResultSummary: View {
    let eventCount: Int
    let dateRange: String

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: "checkmark.circle.fill")
                .font(.title2)
                .foregroundStyle(SideSeatTheme.success)

            VStack(alignment: .leading, spacing: 3) {
                Text(eventCountLabel)
                    .font(.headline)
                    .foregroundStyle(SideSeatTheme.textPrimary)
                if !dateRange.isEmpty {
                    Text(dateRange)
                        .font(.subheadline)
                        .foregroundStyle(SideSeatTheme.textSecondary)
                }
            }
            Spacer(minLength: 0)
        }
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier("smart-schedule-result-summary")
    }

    private var eventCountLabel: String {
        String.localizedStringWithFormat(
            AppLocalization.string( "%lld events ready"),
            eventCount
        )
    }
}

private struct CalendarSmartDraftRow: View {
    let draft: NativeCalendarNaturalDraft
    let categories: [NativeHomeCalendarCategory]
    let onEdit: () -> Void

    var body: some View {
        Button(action: onEdit) {
            HStack(alignment: .top, spacing: 10) {
                if let start = CalendarSmartDateParser.parse(draft.startAt),
                   let end = CalendarSmartDateParser.parse(draft.endAt)
                {
                    VStack(alignment: .trailing, spacing: 2) {
                        Text(start.formatted(date: .omitted, time: .shortened))
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(SideSeatTheme.textPrimary)
                        Text(end.formatted(date: .omitted, time: .shortened))
                            .font(.caption)
                            .foregroundStyle(SideSeatTheme.textSecondary)
                    }
                    .monospacedDigit()
                    .frame(width: 52, alignment: .trailing)
                }

                RoundedRectangle(cornerRadius: 1.5, style: .continuous)
                    .fill(selectedCategoryColor)
                    .frame(width: 3, height: 58)

                VStack(alignment: .leading, spacing: 6) {
                    Text(draft.title)
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(SideSeatTheme.textPrimary)
                        .lineLimit(2)

                    if !draft.location.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                        Label(draft.location, systemImage: "mappin.and.ellipse")
                            .font(.caption)
                            .foregroundStyle(SideSeatTheme.textSecondary)
                            .lineLimit(1)
                    }

                    HStack(spacing: 5) {
                        Circle()
                            .fill(selectedCategoryColor)
                            .frame(width: 7, height: 7)
                        Text(selectedCategoryName)
                            .lineLimit(1)
                    }
                    .font(.caption.weight(.medium))
                    .foregroundStyle(SideSeatTheme.textSecondary)
                }
                .frame(maxWidth: .infinity, alignment: .leading)

                Image(systemName: "pencil")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(SideSeatTheme.textSecondary)
                    .frame(width: 32, height: 44)
                    .accessibilityHidden(true)
            }
            .padding(.vertical, 4)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(draft.title)
        .accessibilityHint("Edit event details")
        .accessibilityIdentifier("smart-schedule-draft-\(draft.id.uuidString)")
    }

    private var selectedCategory: NativeHomeCalendarCategory? {
        categories.first { $0.id == draft.categoryId }
    }

    private var selectedCategoryColor: Color {
        selectedCategory.flatMap { Color(hex: $0.color) } ?? SideSeatTheme.textSecondary
    }

    private var selectedCategoryName: String {
        selectedCategory?.displayName ?? AppLocalization.string( "None")
    }
}

private struct CalendarSmartDraftEditorView: View {
    @Environment(\.dismiss) private var dismiss

    let draft: NativeCalendarNaturalDraft
    let categories: [NativeHomeCalendarCategory]
    let onApply: (NativeCalendarNaturalDraft) -> Void
    let onRemove: () -> Void

    @State private var title: String
    @State private var location: String
    @State private var note: String
    @State private var startAt: Date
    @State private var endAt: Date
    @State private var repeatRule: NativeCalendarRepeatRule
    @State private var repeatUntil: Date
    @State private var repeatHasEnd: Bool
    @State private var categoryID: String?
    @State private var issue: String?
    @FocusState private var focusedField: CalendarEventFormField?

    init(
        draft: NativeCalendarNaturalDraft,
        categories: [NativeHomeCalendarCategory],
        onApply: @escaping (NativeCalendarNaturalDraft) -> Void,
        onRemove: @escaping () -> Void
    ) {
        self.draft = draft
        self.categories = categories
        self.onApply = onApply
        self.onRemove = onRemove

        let now = CalendarEventTiming.snappedUpToSelectionStep(Date())
        let start = CalendarSmartDateParser.parse(draft.startAt) ?? now
        let end = CalendarSmartDateParser.parse(draft.endAt)
            ?? start.addingTimeInterval(CalendarEventTiming.defaultDuration)
        let rule = NativeCalendarRepeatRule(rawValue: draft.repeatRule) ?? .none
        let repeatEnd = CalendarSmartDateParser.parse(draft.repeatUntil)
            ?? Calendar.sideSeatBerlin.date(byAdding: .month, value: 1, to: start)
            ?? start

        _title = State(initialValue: draft.title)
        _location = State(initialValue: draft.location)
        _note = State(initialValue: draft.note)
        _startAt = State(initialValue: start)
        _endAt = State(initialValue: end)
        _repeatRule = State(initialValue: rule)
        _repeatUntil = State(initialValue: repeatEnd)
        _repeatHasEnd = State(initialValue: !draft.repeatUntil.isEmpty)
        _categoryID = State(initialValue: draft.categoryId)
    }

    var body: some View {
        NavigationStack {
            Form {
                CalendarEventFormFields(
                    title: $title,
                    location: $location,
                    note: $note,
                    startAt: $startAt,
                    endAt: $endAt,
                    categoryID: $categoryID,
                    repeatRule: $repeatRule,
                    repeatUntil: $repeatUntil,
                    repeatHasEnd: $repeatHasEnd,
                    categories: categories,
                    preservesLegacyOffGridTimes: false,
                    focusedField: $focusedField
                )

                if let issue {
                    Section {
                        Label(issue, systemImage: "exclamationmark.triangle")
                            .foregroundStyle(SideSeatTheme.danger)
                    }
                }

                Section {
                    Button("Remove event", role: .destructive) {
                        onRemove()
                        dismiss()
                    }
                    .accessibilityIdentifier("smart-draft-remove")
                }
            }
            .background(
                CalendarEventKeyboardDismissBridge {
                    focusedField = nil
                }
            )
            .simultaneousGesture(
                DragGesture(minimumDistance: 4).onChanged { _ in
                    guard focusedField != nil else { return }
                    focusedField = nil
                }
            )
            .scrollDismissesKeyboard(.immediately)
            .navigationTitle("Edit event details")
            .navigationBarTitleDisplayMode(.inline)
            .accessibilityIdentifier("smart-schedule-draft-editor")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Apply") { applyChanges() }
                        .ssConfirmationActionStyle()
                        .accessibilityIdentifier("smart-draft-apply")
                }
                ToolbarItemGroup(placement: .keyboard) {
                    Spacer()
                    Button("Done") { focusedField = nil }
                }
            }
        }
        .presentationDetents([.large])
        .presentationDragIndicator(.visible)
    }

    private func applyChanges() {
        focusedField = nil
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

        var updated = draft
        updated.title = normalizedTitle
        updated.location = location.trimmingCharacters(in: .whitespacesAndNewlines)
        updated.note = note.trimmingCharacters(in: .whitespacesAndNewlines)
        updated.startAt = startAt.ISO8601Format()
        updated.endAt = endAt.ISO8601Format()
        updated.repeatRule = repeatRule.rawValue
        updated.repeatUntil = repeatRule == .none || !repeatHasEnd
            ? ""
            : repeatUntil.ISO8601Format()
        updated.categoryId = categoryID
        onApply(updated)
        dismiss()
    }
}

private enum CalendarSmartDateParser {
    static func parse(_ value: String) -> Date? {
        let fractional = ISO8601DateFormatter()
        fractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return fractional.date(from: value) ?? ISO8601DateFormatter().date(from: value)
    }

    static func isEarlier(_ lhs: NativeCalendarNaturalDraft, _ rhs: NativeCalendarNaturalDraft) -> Bool {
        (parse(lhs.startAt) ?? .distantPast) < (parse(rhs.startAt) ?? .distantPast)
    }
}
