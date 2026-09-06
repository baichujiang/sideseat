import SwiftUI
import UIKit

struct DirectChatInfoView: View {
    @Environment(SessionStore.self) private var session

    let store: DirectChatStore
    let searchRows: [ChatThreadSearchRow]
    let onSelectMessage: (String) -> Void
    let onViewProfile: (String) -> Void
    let onConversationClosed: () -> Void

    @State private var showThreadSearch = false
    @State private var confirmEnd = false
    @State private var confirmBlock = false
    @State private var activeAction: String?
    @State private var actionNotice: ChatTransientNotice?

    private var isSelfNotes: Bool {
        store.conversation?.isSelfNotes == true || store.connectionActions?.isSelfNotes == true
    }

    private var peerName: String {
        store.conversation?.displayName ?? AppLocalization.string( "Contact")
    }

    var body: some View {
        List {
            if !isSelfNotes {
                profileSection
            }

            chatSection

            if !isSelfNotes {
                if store.connectionActions == nil, store.actionIssue == nil {
                    Section {
                        HStack(spacing: 12) {
                            ProgressView()
                            Text("Loading chat settings")
                                .foregroundStyle(.secondary)
                        }
                    }
                } else {
                    relationshipSection
                    contactExchangeSection
                }

                if let issue = store.actionIssue {
                    Section {
                        Label(issue, systemImage: "exclamationmark.triangle.fill")
                            .font(.footnote)
                            .foregroundStyle(SideSeatTheme.danger)

                        Button("Try again") {
                            Task { await store.loadConnectionActions(using: session) }
                        }
                        .disabled(store.isMutatingConnectionAction)
                    }
                    .accessibilityIdentifier("direct-info-action-error")
                }

                safetySection
            }
        }
        .listStyle(.insetGrouped)
        .navigationTitle("Chat info")
        .navigationBarTitleDisplayMode(.inline)
        .accessibilityIdentifier("direct-chat-info")
        .sheet(isPresented: $showThreadSearch) {
            ChatThreadSearchSheet(
                title: AppLocalization.string( "Search chat"),
                rows: searchRows,
                onSelect: { messageID in
                    showThreadSearch = false
                    onSelectMessage(messageID)
                }
            )
        }
        .ssActionPrompt(
            isPresented: $confirmEnd,
            title: AppLocalization.string("End this conversation?"),
            systemImage: "bubble.left.and.bubble.right.fill",
            tint: SideSeatTheme.danger,
            onDismiss: { confirmEnd = false },
            accessibilityIdentifier: "direct-info-end-prompt"
        ) {
            [
                SSActionPromptAction(
                    id: "direct-info-cancel-end",
                    title: AppLocalization.string("Cancel"),
                    systemImage: "xmark",
                    role: .cancel
                ) {},
                SSActionPromptAction(
                    id: "direct-info-confirm-end",
                    title: AppLocalization.string("End chat"),
                    systemImage: "rectangle.portrait.and.arrow.right",
                    role: .destructive
                ) {
                    Task {
                        if await store.endConnection(using: session) {
                            onConversationClosed()
                        }
                    }
                },
            ]
        }
        .ssActionPrompt(
            isPresented: $confirmBlock,
            title: AppLocalization.string("Block this person?"),
            systemImage: "hand.raised.fill",
            tint: SideSeatTheme.danger,
            onDismiss: { confirmBlock = false },
            accessibilityIdentifier: "direct-info-block-prompt"
        ) {
            [
                SSActionPromptAction(
                    id: "direct-info-cancel-block",
                    title: AppLocalization.string("Cancel"),
                    systemImage: "xmark",
                    role: .cancel
                ) {},
                SSActionPromptAction(
                    id: "direct-info-confirm-block",
                    title: AppLocalization.string("Block"),
                    systemImage: "hand.raised",
                    role: .destructive
                ) {
                    Task {
                        if await store.blockPeer(using: session) {
                            onConversationClosed()
                        }
                    }
                },
            ]
        }
        .overlay(alignment: .bottom) {
            if let actionNotice {
                ChatTransientNoticeView(notice: actionNotice)
                    .padding(.horizontal, 16)
                    .padding(.bottom, 18)
            }
        }
        .onDisappear {
            store.clearActionIssue()
        }
    }

    private var profileSection: some View {
        Section {
            Button {
                if let peerID = store.conversation?.peer.id ?? store.connectionActions?.peerId {
                    onViewProfile(peerID)
                }
            } label: {
                HStack(spacing: 14) {
                    InitialAvatar(
                        name: peerName,
                        url: store.conversation?.peer.avatarUrl,
                        size: 54
                    )

                    VStack(alignment: .leading, spacing: 3) {
                        Text(peerName)
                            .font(.headline)
                            .foregroundStyle(.primary)
                            .lineLimit(1)

                        if let username = store.conversation?.peer.username {
                            Text("@\(username)")
                                .font(.subheadline)
                                .foregroundStyle(.secondary)
                                .lineLimit(1)
                        }
                    }

                    Spacer(minLength: 8)
                    Image(systemName: "chevron.right")
                        .font(.footnote.weight(.semibold))
                        .foregroundStyle(.tertiary)
                }
                .padding(.vertical, 6)
                .contentShape(Rectangle())
            }
            .buttonStyle(SSPressButtonStyle())
            .accessibilityIdentifier("direct-info-profile")
        }
    }

    private var chatSection: some View {
        Section {
            Button {
                showThreadSearch = true
            } label: {
                infoRow(title: "Search chat", systemImage: "magnifyingglass")
            }
            .accessibilityIdentifier("direct-info-search")

            if !isSelfNotes {
                NavigationLink {
                    DirectChatRemarkEditor(store: store)
                } label: {
                    HStack(spacing: 12) {
                        Image(systemName: "pencil")
                            .frame(width: 22)
                            .foregroundStyle(.secondary)
                        Text("Contact remark")
                            .foregroundStyle(.primary)
                        Spacer(minLength: 8)
                        if let remark = store.connectionActions?.remark, !remark.isEmpty {
                            Text(remark)
                                .foregroundStyle(.secondary)
                                .lineLimit(1)
                        }
                    }
                }
                .accessibilityIdentifier("direct-info-remark")
            }
        }
    }

    private var relationshipSection: some View {
        Section("Relationship") {
            let friend = store.connectionActions?.friendLink

            if friend?.status == "ACCEPTED" {
                statusRow(
                    title: "Close friend",
                    detail: nil,
                    systemImage: "person.2.fill",
                    color: .green
                )
            } else if friend?.status == "PENDING", friend?.role == "requester" {
                statusRow(
                    title: "Friend request sent",
                    detail: "Waiting for a response",
                    systemImage: "clock",
                    color: .orange
                )
                actionButton(
                    title: "Cancel friend request",
                    systemImage: "xmark.circle",
                    action: "friend-cancel"
                ) {
                    await performFriendAction("cancel", successMessage: "Friend request canceled")
                }
            } else if friend?.status == "PENDING", friend?.role == "responder" {
                statusRow(
                    title: "Friend request received",
                    detail: nil,
                    systemImage: "person.crop.circle.badge.plus",
                    color: SideSeatTheme.accent
                )
                actionButton(
                    title: "Accept friend request",
                    systemImage: "checkmark.circle",
                    action: "friend-accept"
                ) {
                    await performFriendAction("accept", successMessage: "Friend request accepted")
                }
                actionButton(
                    title: "Decline friend request",
                    systemImage: "xmark.circle",
                    role: .destructive,
                    action: "friend-decline"
                ) {
                    await performFriendAction("decline", successMessage: "Friend request declined")
                }
            } else {
                actionButton(
                    title: "Add close friend",
                    systemImage: "person.badge.plus",
                    action: "friend-request"
                ) {
                    await performFriendAction("request", successMessage: "Friend request sent")
                }
            }
        }
    }

    private var contactExchangeSection: some View {
        Section {
            switch store.connectionActions?.contactExchange?.phase ?? .available {
            case .available:
                actionButton(
                    title: "Request contact exchange",
                    systemImage: "person.2.badge.plus",
                    action: "contact-request",
                    accessibilityIdentifier: "direct-contact-request"
                ) {
                    await performContactAction("request", successMessage: "Contact request sent")
                }

            case .outgoingPending:
                statusRow(
                    title: "Request sent",
                    detail: "Waiting for a response",
                    systemImage: "clock",
                    color: .orange
                )
                .accessibilityIdentifier("direct-contact-status-pending")

                actionButton(
                    title: "Cancel contact request",
                    systemImage: "xmark.circle",
                    action: "contact-cancel",
                    accessibilityIdentifier: "direct-contact-cancel"
                ) {
                    await performContactAction("cancel", successMessage: "Contact request canceled")
                }

            case .incomingPending:
                VStack(alignment: .leading, spacing: 5) {
                    Label("Contact exchange request", systemImage: "person.crop.circle.badge.questionmark")
                        .font(.body.weight(.medium))
                    Text("\(peerName) wants to exchange contact details with you.")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
                .padding(.vertical, 3)

                actionButton(
                    title: "Accept contact exchange",
                    systemImage: "checkmark.circle",
                    action: "contact-accept",
                    accessibilityIdentifier: "direct-contact-accept"
                ) {
                    await performContactAction("accept", successMessage: "Contact request accepted")
                }

                actionButton(
                    title: "Decline contact exchange",
                    systemImage: "xmark.circle",
                    role: .destructive,
                    action: "contact-decline",
                    accessibilityIdentifier: "direct-contact-decline"
                ) {
                    await performContactAction("decline", successMessage: "Contact request declined")
                }

            case .accepted:
                statusRow(
                    title: "Contact exchange enabled",
                    detail: "Both people approved this request",
                    systemImage: "checkmark.circle.fill",
                    color: .green
                )
                .accessibilityIdentifier("direct-contact-status-accepted")

            case let .declined(cooldownUntil):
                statusRow(
                    title: "Request declined",
                    detail: cooldownDescription(cooldownUntil),
                    systemImage: "clock.badge.exclamationmark",
                    color: .orange
                )
                .accessibilityIdentifier("direct-contact-status-declined")
            }
        } header: {
            Text("Contact information")
        } footer: {
            Text("Contact details are shared only after both people agree.")
        }
    }

    private var safetySection: some View {
        Section {
            Button("End chat", role: .destructive) {
                confirmEnd = true
            }
            .accessibilityIdentifier("direct-info-end")

            Button("Block", role: .destructive) {
                confirmBlock = true
            }
            .accessibilityIdentifier("direct-info-block")
        }
    }

    private func infoRow(title: LocalizedStringKey, systemImage: String) -> some View {
        HStack(spacing: 12) {
            Image(systemName: systemImage)
                .frame(width: 22)
                .foregroundStyle(.secondary)
            Text(title)
                .foregroundStyle(.primary)
            Spacer()
            Image(systemName: "chevron.right")
                .font(.footnote.weight(.semibold))
                .foregroundStyle(.tertiary)
        }
        .contentShape(Rectangle())
    }

    private func statusRow(
        title: LocalizedStringKey,
        detail: LocalizedStringKey?,
        systemImage: String,
        color: Color
    ) -> some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: systemImage)
                .frame(width: 22)
                .foregroundStyle(color)
            VStack(alignment: .leading, spacing: 3) {
                Text(title)
                    .foregroundStyle(.primary)
                if let detail {
                    Text(detail)
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
            }
        }
        .padding(.vertical, 2)
    }

    private func actionButton(
        title: LocalizedStringKey,
        systemImage: String,
        role: ButtonRole? = nil,
        action: String,
        accessibilityIdentifier: String? = nil,
        operation: @escaping @MainActor () async -> Void
    ) -> some View {
        Button(role: role) {
            Task { await operation() }
        } label: {
            HStack(spacing: 12) {
                Image(systemName: systemImage)
                    .frame(width: 22)
                Text(title)
                Spacer()
                if activeAction == action {
                    ProgressView()
                        .controlSize(.small)
                }
            }
            .contentShape(Rectangle())
        }
        .disabled(activeAction != nil || store.isMutatingConnectionAction)
        .accessibilityIdentifier(accessibilityIdentifier ?? action)
    }

    private func performContactAction(_ action: String, successMessage: LocalizedStringResource) async {
        guard activeAction == nil else { return }
        activeAction = "contact-\(action)"
        let succeeded = await store.performContactExchange(action: action, using: session)
        activeAction = nil
        if succeeded {
            showNotice(
                AppLocalization.string(resource: successMessage),
                systemImage: action == "cancel" ? "xmark.circle" : "checkmark.circle"
            )
        }
    }

    private func performFriendAction(_ action: String, successMessage: LocalizedStringResource) async {
        guard activeAction == nil else { return }
        activeAction = "friend-\(action)"
        let succeeded = await store.performFriendLink(action: action, using: session)
        activeAction = nil
        if succeeded {
            showNotice(AppLocalization.string(resource: successMessage), systemImage: "checkmark.circle")
        }
    }

    private func showNotice(_ text: String, systemImage: String) {
        let notice = ChatTransientNotice(text: text, systemImage: systemImage)
        UINotificationFeedbackGenerator().notificationOccurred(.success)
        withAnimation(.spring(response: 0.28, dampingFraction: 0.86)) {
            actionNotice = notice
        }
        Task { @MainActor in
            try? await Task.sleep(for: .seconds(3))
            guard actionNotice?.id == notice.id else { return }
            withAnimation(.easeIn(duration: 0.18)) {
                actionNotice = nil
            }
        }
    }

    private func cooldownDescription(_ rawValue: String?) -> LocalizedStringKey {
        guard let rawValue, let date = contactExchangeDate(from: rawValue) else {
            return "You can request again after the cooldown."
        }
        let value = date.formatted(date: .abbreviated, time: .shortened)
        return "You can request again after \(value)."
    }

    private func contactExchangeDate(from value: String) -> Date? {
        let fractional = ISO8601DateFormatter()
        fractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return fractional.date(from: value) ?? ISO8601DateFormatter().date(from: value)
    }
}

private struct DirectChatRemarkEditor: View {
    @Environment(SessionStore.self) private var session
    @Environment(\.dismiss) private var dismiss

    let store: DirectChatStore

    @State private var draft = ""
    @State private var hasPrepared = false

    var body: some View {
        Form {
            Section {
                TextField("Remark", text: $draft)
                    .accessibilityIdentifier("direct-remark-field")
            } footer: {
                Text("A remark is visible only to you.")
            }

            if let issue = store.actionIssue {
                Section {
                    Text(issue)
                        .font(.footnote)
                        .foregroundStyle(SideSeatTheme.danger)
                }
            }
        }
        .navigationTitle("Contact remark")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .confirmationAction) {
                Button("Save") {
                    Task {
                        let value = draft.trimmingCharacters(in: .whitespacesAndNewlines)
                        if await store.updateRemark(value.isEmpty ? nil : value, using: session) {
                            dismiss()
                        }
                    }
                }
                .disabled(store.isMutatingConnectionAction)
                .ssConfirmationActionStyle()
                .accessibilityIdentifier("direct-remark-save")
            }
        }
        .task {
            guard !hasPrepared else { return }
            draft = store.connectionActions?.remark ?? ""
            hasPrepared = true
        }
    }
}
