import SwiftUI

struct GroupInfoView: View {
    @Environment(SessionStore.self) private var session
    @Environment(RouterPath.self) private var router

    let groupChatID: String

    @State private var titleDraft = ""
    @State private var participants: [NativeChatAuthor] = []
    @State private var displayTitle = String(localized: "Group chat")
    @State private var isLoading = false
    @State private var isSaving = false
    @State private var issue: String?
    @State private var showAddMembers = false
    @State private var addCandidates: [NativeInboxConversation] = []
    @State private var addSelected: Set<String> = []

    var body: some View {
        Form {
            Section("Title") {
                TextField("Group title", text: $titleDraft)
                    .accessibilityIdentifier("group-info-title")
                Button("Save title") {
                    Task { await saveTitle() }
                }
                .disabled(isSaving)
                .accessibilityIdentifier("group-info-save-title")
            }
            Section("Members (\(participants.count))") {
                ForEach(participants) { peer in
                    Button {
                        router.navigate(to: .profile(userID: peer.id))
                    } label: {
                        HStack(spacing: 12) {
                            InitialAvatar(
                                name: peer.displayName,
                                url: peer.avatarUrl,
                                size: 32
                            )
                            Text(peer.displayName)
                                .foregroundStyle(.primary)
                        }
                    }
                    .buttonStyle(.plain)
                    .accessibilityIdentifier("group-member-\(peer.id)")
                }
                Button {
                    Task {
                        await loadAddCandidates()
                        showAddMembers = true
                    }
                } label: {
                    Label("Add members", systemImage: ChatCreationSymbol.newGroup)
                }
                .accessibilityIdentifier("group-info-add-members")
            }
            if let issue {
                Section {
                    Text(issue).foregroundStyle(SideSeatTheme.danger).font(.footnote)
                }
            }
        }
        .navigationTitle(displayTitle)
        .navigationBarTitleDisplayMode(.inline)
        .task { await load() }
        .sheet(isPresented: $showAddMembers) {
            NavigationStack {
                List {
                    ForEach(addCandidates) { row in
                        Button {
                            if addSelected.contains(row.id) {
                                addSelected.remove(row.id)
                            } else {
                                addSelected.insert(row.id)
                            }
                        } label: {
                            HStack {
                                Text(row.displayName).foregroundStyle(.primary)
                                Spacer()
                                if addSelected.contains(row.id) {
                                    Image(systemName: "checkmark.circle.fill")
                                        .foregroundStyle(SideSeatTheme.accent)
                                }
                            }
                        }
                        .buttonStyle(.plain)
                    }
                }
                .navigationTitle("Add members")
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) {
                        Button("Cancel") { showAddMembers = false }
                    }
                    ToolbarItem(placement: .confirmationAction) {
                        Button("Add") {
                            Task { await addMembers() }
                        }
                        .disabled(addSelected.isEmpty || isSaving)
                        .accessibilityIdentifier("group-info-add-confirm")
                    }
                }
            }
        }
        .accessibilityIdentifier("group-info-root")
    }

    private func load() async {
        isLoading = true
        defer { isLoading = false }

        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("--ui-testing-authenticated") {
            let fixture = NativeCommunityMessagePageData.uiTestingFixture(kind: .group)
            participants = fixture.conversation.participants ?? []
            displayTitle = fixture.conversation.displayName
            titleDraft = fixture.conversation.title ?? ""
            return
        }
        #endif

        do {
            let page: NativeCommunityMessagePageResponse = try await session.sendAuthorized(
                "api/v1/group-chats/\(groupChatID)/messages",
                queryItems: [URLQueryItem(name: "limit", value: "1")]
            )
            participants = page.data.conversation.participants ?? []
            displayTitle = page.data.conversation.displayName
            titleDraft = page.data.conversation.title
                ?? page.data.conversation.customTitle
                ?? ""
        } catch {
            issue = error.localizedDescription
        }
    }

    private func saveTitle() async {
        isSaving = true
        issue = nil
        defer { isSaving = false }

        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("--ui-testing-authenticated") {
            displayTitle = titleDraft.trimmingCharacters(in: .whitespacesAndNewlines).nilIfEmpty
                ?? String(localized: "Group chat")
            return
        }
        #endif

        do {
            let response: APIEnvelope<NativeGroupTitleResult> = try await session.sendAuthorized(
                "api/v1/group-chats/\(groupChatID)",
                method: .patch,
                body: NativeGroupTitlePatch(title: titleDraft),
                idempotencyKey: UUID().uuidString
            )
            displayTitle = response.data.title?.trimmingCharacters(in: .whitespacesAndNewlines).nilIfEmpty
                ?? String(localized: "Group chat")
        } catch {
            issue = error.localizedDescription
        }
    }

    private func loadAddCandidates() async {
        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("--ui-testing-authenticated") {
            addCandidates = NativeInboxPayload.uiTestingFixture.conversations.filter {
                $0.kind == .direct && !$0.isSelfNotes
            }
            return
        }
        #endif
        do {
            let response: APIEnvelope<NativeInboxPayload> = try await session.sendAuthorized("api/v1/inbox")
            let existing = Set(participants.map(\.id))
            addCandidates = response.data.conversations.filter {
                $0.kind == .direct
                    && !$0.isSelfNotes
                    && ($0.peer.map { !existing.contains($0.id) } ?? false)
            }
        } catch {
            issue = error.localizedDescription
        }
    }

    private func addMembers() async {
        isSaving = true
        issue = nil
        defer { isSaving = false }
        let peerIDs = addCandidates
            .filter { addSelected.contains($0.id) }
            .compactMap { $0.peer?.id }
        guard !peerIDs.isEmpty else { return }

        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("--ui-testing-authenticated") {
            showAddMembers = false
            addSelected = []
            return
        }
        #endif

        do {
            let _: APIEnvelope<NativeGroupAddMembersResult> = try await session.sendAuthorized(
                "api/v1/group-chats/\(groupChatID)/participants",
                method: .post,
                body: NativeGroupAddMembersRequest(participantIds: peerIDs),
                idempotencyKey: UUID().uuidString
            )
            showAddMembers = false
            addSelected = []
            await load()
        } catch {
            issue = error.localizedDescription
        }
    }
}

private extension String {
    var nilIfEmpty: String? {
        let trimmed = trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? nil : trimmed
    }
}
