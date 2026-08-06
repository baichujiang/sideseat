import SwiftUI

struct CalendarSmartAddView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(SessionStore.self) private var session

    let categories: [NativeHomeCalendarCategory]
    let onSaved: @MainActor () async -> Void

    @State private var store = CalendarSmartAddStore()
    @State private var voiceInput = CalendarVoiceInput()
    @State private var text = ""
    @State private var voicePrefix = ""
    @FocusState private var isInputFocused: Bool

    var body: some View {
        NavigationStack {
            Form {
                if store.drafts.isEmpty {
                    Section {
                        TextEditor(text: $text)
                            .frame(minHeight: 128)
                            .focused($isInputFocused)
                            .accessibilityIdentifier("smart-schedule-input")

                        HStack(spacing: SideSeatTheme.spaceMD) {
                            Button {
                                toggleVoiceInput()
                            } label: {
                                Image(systemName: voiceInput.isRecording ? "stop.fill" : "mic.fill")
                                    .font(.body.weight(.semibold))
                                    .frame(width: 44, height: 44)
                                    .foregroundStyle(voiceInput.isRecording ? .white : SideSeatTheme.accent)
                                    .background(
                                        voiceInput.isRecording ? SideSeatTheme.danger : SideSeatTheme.accent.opacity(0.12),
                                        in: Circle()
                                    )
                            }
                            .buttonStyle(.plain)
                            .accessibilityLabel(voiceInput.isRecording ? "Stop dictation" : "Dictate event")
                            .accessibilityIdentifier("smart-schedule-voice")

                            if voiceInput.isRecording {
                                Label("Listening", systemImage: "waveform")
                                    .font(.subheadline)
                                    .foregroundStyle(.secondary)
                            }

                            Spacer()
                        }

                        if let voiceIssue = voiceInput.issue {
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

                        Button {
                            voiceInput.stop()
                            isInputFocused = false
                            Task { await parse() }
                        } label: {
                            if store.isParsing {
                                ProgressView()
                            } else {
                                Label("Preview events", systemImage: "sparkles")
                            }
                        }
                        .disabled(text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || store.isParsing)
                        .accessibilityIdentifier("smart-schedule-parse")
                    }
                } else {
                    if !store.warnings.isEmpty {
                        Section {
                            ForEach(store.warnings, id: \.self) { warning in
                                Label(warning, systemImage: "exclamationmark.triangle")
                                    .foregroundStyle(SideSeatTheme.warning)
                            }
                        }
                    }

                    Section("Preview") {
                        ForEach(store.drafts) { draft in
                            CalendarSmartDraftRow(
                                draft: draft,
                                categories: categories,
                                categoryID: Binding(
                                    get: { draft.categoryId },
                                    set: { store.setCategory($0, for: draft.id) }
                                )
                            )
                        }
                    }

                    Section {
                        Button("Start over") {
                            store = CalendarSmartAddStore()
                        }
                    }
                }

                if let issue = store.issue {
                    Section {
                        Label(issue, systemImage: "exclamationmark.triangle")
                            .foregroundStyle(SideSeatTheme.danger)
                        if store.needsSignIn {
                            Button("Sign in") {
                                dismiss()
                                Task { await session.logout() }
                            }
                            .accessibilityIdentifier("smart-schedule-sign-in")
                        }
                    }
                }
            }
            .navigationTitle("Smart add")
            .navigationBarTitleDisplayMode(.inline)
            .interactiveDismissDisabled(store.isSaving)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                        .disabled(store.isSaving)
                }
                if !store.drafts.isEmpty {
                    ToolbarItem(placement: .confirmationAction) {
                        Button("Add events") {
                            Task { await save() }
                        }
                        .disabled(store.isSaving)
                        .accessibilityIdentifier("smart-schedule-save")
                    }
                }
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
                voiceInput.stop()
            }
            .accessibilityIdentifier("smart-schedule-view")
        }
    }

    private func toggleVoiceInput() {
        if voiceInput.isRecording {
            voiceInput.stop()
            return
        }

        voicePrefix = text
        isInputFocused = false
        Task { await voiceInput.start() }
    }

    private func parse() async {
        let language = Locale.current.language.languageCode?.identifier == "zh" ? "zh-CN" : "en"
        await store.parse(text: text, locale: language, using: session)
    }

    private func save() async {
        guard await store.save(using: session) else { return }
        await onSaved()
        dismiss()
    }
}

private struct CalendarSmartDraftRow: View {
    let draft: NativeCalendarNaturalDraft
    let categories: [NativeHomeCalendarCategory]
    @Binding var categoryID: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(draft.title)
                .font(.headline)
            if let start = parseDate(draft.startAt), let end = parseDate(draft.endAt) {
                Text(start.formatted(date: .abbreviated, time: .shortened) + " - " + end.formatted(date: .omitted, time: .shortened))
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }
            if !draft.location.isEmpty {
                Label(draft.location, systemImage: "mappin.and.ellipse")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }
            Picker("Calendar", selection: $categoryID) {
                Text("None").tag(String?.none)
                ForEach(categories) { category in
                    Text(category.name).tag(Optional(category.id))
                }
            }
        }
        .padding(.vertical, 2)
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("smart-schedule-draft-\(draft.id.uuidString)")
    }

    private func parseDate(_ value: String) -> Date? {
        let fractional = ISO8601DateFormatter()
        fractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return fractional.date(from: value) ?? ISO8601DateFormatter().date(from: value)
    }
}
