import SwiftUI

struct CalendarSmartAddView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(SessionStore.self) private var session

    let categories: [NativeHomeCalendarCategory]
    let onSaved: @MainActor () async -> Void

    @State private var store = CalendarSmartAddStore()
    @State private var voiceInput = CalendarVoiceInput.forCurrentProcess()
    @State private var text = ""
    @State private var voicePrefix = ""
    @State private var voiceStartTask: Task<Void, Never>?
    @State private var showWarningDetails = false
    @FocusState private var isInputFocused: Bool

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
            .onChange(of: voiceInput.transcript) { _, transcript in
                text = CalendarVoiceTranscript.merge(prefix: voicePrefix, transcript: transcript)
            }
            .onDisappear {
                voiceStartTask?.cancel()
                voiceStartTask = nil
                voiceInput.stop()
            }
        }
        .presentationDetents([.large])
        .presentationDragIndicator(.visible)
    }

    private var smartFillHeader: some View {
        ZStack {
            HStack(spacing: 7) {
                Image(systemName: "sparkles")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(SideSeatTheme.accent)

                Text("Smart fill")
                    .font(.title3.weight(.semibold))
                    .foregroundStyle(SideSeatTheme.textPrimary)
            }

            HStack {
                Button {
                    dismiss()
                } label: {
                    Image(systemName: "xmark")
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(SideSeatTheme.textPrimary)
                        .frame(width: 40, height: 40)
                        .background(SideSeatTheme.fillTertiary, in: Circle())
                }
                .buttonStyle(.plain)
                .disabled(store.isSaving)
                .accessibilityLabel("Cancel")
                .accessibilityIdentifier("smart-schedule-cancel")

                Spacer()
            }
        }
        .frame(height: 68)
        .padding(.horizontal, SideSeatTheme.spaceLG)
        .background(.bar)
        .overlay(alignment: .bottom) { Divider() }
    }

    private var inputPanel: some View {
        VStack(alignment: .leading, spacing: SideSeatTheme.spaceMD) {
            Label {
                Text("Describe your schedule")
                    .font(.headline)
                    .foregroundStyle(SideSeatTheme.textPrimary)
            } icon: {
                Image(systemName: "sparkles")
                    .foregroundStyle(SideSeatTheme.accent)
            }

            ZStack(alignment: .topLeading) {
                if text.isEmpty {
                    Text("For example: Tomorrow at 3 PM, study at the library for two hours.")
                        .font(.body)
                        .foregroundStyle(SideSeatTheme.textSecondary)
                        .padding(.horizontal, 5)
                        .padding(.vertical, 8)
                        .allowsHitTesting(false)
                }

                TextEditor(text: $text)
                    .scrollContentBackground(.hidden)
                    .frame(minHeight: 150, maxHeight: 220)
                    .focused($isInputFocused)
                    .accessibilityIdentifier("smart-schedule-input")
            }

            Divider()

            HStack(spacing: SideSeatTheme.spaceMD) {
                Button {
                    toggleVoiceInput()
                } label: {
                    Group {
                        if voiceInput.isStarting {
                            ProgressView()
                                .tint(.white)
                        } else {
                            Image(systemName: voiceInput.isRecording ? "stop.fill" : "mic.fill")
                                .font(.body.weight(.semibold))
                        }
                    }
                    .frame(width: 40, height: 40)
                    .foregroundStyle(voiceInput.isActive ? .white : SideSeatTheme.accent)
                    .background(voiceButtonBackground, in: Circle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel(voiceInput.isActive ? "Stop dictation" : "Dictate event")
                .accessibilityIdentifier("smart-schedule-voice")

                if voiceInput.isStarting {
                    Label("Preparing microphone", systemImage: "waveform")
                        .font(.subheadline)
                        .foregroundStyle(SideSeatTheme.textSecondary)
                } else if voiceInput.isRecording {
                    Label("Listening", systemImage: "waveform")
                        .font(.subheadline)
                        .foregroundStyle(SideSeatTheme.textSecondary)
                } else {
                    Text("Voice input")
                        .font(.subheadline)
                        .foregroundStyle(SideSeatTheme.textSecondary)
                }

                Spacer(minLength: 0)
            }

            if let voiceIssue = voiceInput.issue {
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
            }
        }
        .padding(SideSeatTheme.spaceLG)
        .background(
            SideSeatTheme.surface,
            in: RoundedRectangle(cornerRadius: SideSeatTheme.cardRadius, style: .continuous)
        )
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
                            categories: categories,
                            categoryID: Binding(
                                get: { draft.categoryId },
                                set: { store.setCategory($0, for: draft.id) }
                            )
                        )

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
                title: String(localized: "Preview events"),
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
                        .background(SideSeatTheme.fillTertiary, in: Circle())
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
            String(localized: "%lld events"),
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
            String(localized: "%lld details to review"),
            store.warnings.count
        )
    }

    private var addEventsLabel: String {
        String.localizedStringWithFormat(
            String(localized: "Add %lld events"),
            store.drafts.count
        )
    }

    private func startOver() {
        showWarningDetails = false
        store = CalendarSmartAddStore()
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
            String(localized: "%lld events ready"),
            eventCount
        )
    }
}

private struct CalendarSmartDraftRow: View {
    let draft: NativeCalendarNaturalDraft
    let categories: [NativeHomeCalendarCategory]
    @Binding var categoryID: String?

    var body: some View {
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

                Menu {
                    Picker("Calendar", selection: $categoryID) {
                        Text("None").tag(String?.none)
                        ForEach(categories) { category in
                            Text(category.displayName).tag(Optional(category.id))
                        }
                    }
                } label: {
                    HStack(spacing: 5) {
                        Circle()
                            .fill(selectedCategoryColor)
                            .frame(width: 7, height: 7)
                        Text(selectedCategoryName)
                            .lineLimit(1)
                        Image(systemName: "chevron.down")
                            .font(.caption2.weight(.semibold))
                    }
                    .font(.caption.weight(.medium))
                    .foregroundStyle(SideSeatTheme.textSecondary)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 5)
                    .background(SideSeatTheme.fillTertiary, in: Capsule())
                }
                .accessibilityLabel("Calendar")
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(.vertical, 4)
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("smart-schedule-draft-\(draft.id.uuidString)")
    }

    private var selectedCategory: NativeHomeCalendarCategory? {
        categories.first { $0.id == categoryID }
    }

    private var selectedCategoryColor: Color {
        selectedCategory.flatMap { Color(hex: $0.color) } ?? SideSeatTheme.textSecondary
    }

    private var selectedCategoryName: String {
        selectedCategory?.displayName ?? String(localized: "None")
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
