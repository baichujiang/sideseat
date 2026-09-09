import SwiftUI

struct GroupCreateSheet: View {
    @Environment(SessionStore.self) private var session
    @Environment(\.dismiss) private var dismiss

    let onCreated: (String) -> Void

    @State private var title = ""
    @State private var candidates: [NativeInboxConversation] = []
    @State private var selectedIDs: Set<String> = []
    @State private var isLoading = false
    @State private var isCreating = false
    @State private var issue: String?

    var body: some View {
        NavigationStack {
            Form {
                Section("Title") {
                    TextField("Optional group title", text: $title)
                        .accessibilityIdentifier("group-create-title")
                }
                Section("Members (pick at least 2)") {
                    if isLoading {
                        ProgressView()
                    } else if candidates.isEmpty {
                        Text("Start a few direct chats first — only existing contacts can join a group.")
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                    } else {
                        ForEach(candidates) { row in
                            Button {
                                toggle(row)
                            } label: {
                                HStack {
                                    InitialAvatar(name: row.displayName, url: row.peer?.avatarUrl, size: 32)
                                    Text(row.displayName)
                                        .foregroundStyle(.primary)
                                    Spacer()
                                    if selectedIDs.contains(row.id) {
                                        Image(systemName: "checkmark.circle.fill")
                                            .foregroundStyle(SideSeatTheme.accentText)
                                    }
                                }
                            }
                            .buttonStyle(SSPressButtonStyle())
                            .accessibilityIdentifier("group-create-peer-\(row.id)")
                        }
                    }
                }
                if let issue {
                    Section {
                        Text(issue)
                            .foregroundStyle(SideSeatTheme.danger)
                            .font(.footnote)
                    }
                }
            }
            .navigationTitle("New group")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(AppLocalization.string( "Create group")) {
                        Task { await create() }
                    }
                    .disabled(selectedIDs.count < 2 || isCreating)
                    .ssConfirmationActionStyle()
                    .accessibilityIdentifier("group-create-submit")
                }
            }
            .task { await loadCandidates() }
            .accessibilityIdentifier("group-create-sheet")
        }
    }

    private func toggle(_ row: NativeInboxConversation) {
        if selectedIDs.contains(row.id) {
            selectedIDs.remove(row.id)
        } else {
            selectedIDs.insert(row.id)
        }
    }

    private func loadCandidates() async {
        isLoading = true
        defer { isLoading = false }

        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("--ui-testing-authenticated") {
            candidates = NativeInboxPayload.uiTestingFixture.conversations.filter {
                $0.kind == .direct && !$0.isSelfNotes
            }
            return
        }
        #endif

        do {
            let response: APIEnvelope<NativeInboxPayload> = try await session.sendAuthorized("api/v1/inbox")
            candidates = response.data.conversations.filter { $0.kind == .direct && !$0.isSelfNotes }
        } catch {
            issue = error.localizedDescription
        }
    }

    private func create() async {
        guard selectedIDs.count >= 2, !isCreating else { return }
        isCreating = true
        issue = nil
        defer { isCreating = false }

        let peerIDs = candidates
            .filter { selectedIDs.contains($0.id) }
            .compactMap { $0.peer?.id }

        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("--ui-testing-authenticated") {
            onCreated("ui-group")
            dismiss()
            return
        }
        #endif

        do {
            let trimmed = title.trimmingCharacters(in: .whitespacesAndNewlines)
            let response: APIEnvelope<NativeGroupCreateResult> = try await session.sendAuthorized(
                "api/v1/group-chats",
                method: .post,
                body: NativeGroupCreateRequest(
                    title: trimmed.isEmpty ? nil : trimmed,
                    participantIds: peerIDs
                ),
                idempotencyKey: UUID().uuidString
            )
            onCreated(response.data.groupChatId)
            dismiss()
        } catch {
            issue = error.localizedDescription
        }
    }
}
