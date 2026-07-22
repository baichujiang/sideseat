import SwiftUI
import UIKit

struct CommunityChatView: View {
    @Environment(SessionStore.self) private var session
    @Environment(AppContainer.self) private var container
    @Environment(\.scenePhase) private var scenePhase

    let kind: NativeCommunityChatKind
    let conversationID: String

    @State private var store = CommunityChatStore()
    @State private var draft = ""
    @State private var replyDraft: NativeCommunityMessage?
    @State private var isNearBottom = true
    @State private var knownMessageIDs: Set<String> = []
    @State private var pendingDelete: NativeCommunityMessage?
    @State private var pendingReport: NativeCommunityMessage?
    @State private var showThreadSearch = false
    @State private var scrollToMessageID: String?
    @FocusState private var composerFocused: Bool
    @Environment(RouterPath.self) private var router

    var body: some View {
        // Composer in a VStack (not safeAreaInset) so scrollTo(bottom) isn't short by one row.
        VStack(spacing: 0) {
            messageList
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            composer
        }
            .background(SideSeatTheme.bgGrouped)
            .navigationTitle(
                store.conversation?.displayName
                    ?? (kind == .course ? String(localized: "Course chat") : String(localized: "Group chat"))
            )
            .navigationBarTitleDisplayMode(.inline)
            .accessibilityIdentifier(kind.accessibilityRootID)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    if kind == .group {
                        Menu {
                            Button {
                                showThreadSearch = true
                            } label: {
                                Label("Search chat", systemImage: "magnifyingglass")
                            }
                            .accessibilityIdentifier("\(kind.accessibilityRootID)-search")

                            Button {
                                router.navigate(to: .groupChatInfo(groupChatID: conversationID))
                            } label: {
                                Label("Group info", systemImage: "person.3")
                            }
                            .accessibilityIdentifier("group-chat-info")
                        } label: {
                            Image(systemName: "ellipsis")
                                .font(.body.weight(.semibold))
                                .frame(minWidth: 28, minHeight: 28)
                                .contentShape(Rectangle())
                        }
                        .accessibilityIdentifier("group-chat-actions")
                    } else {
                        Button {
                            showThreadSearch = true
                        } label: {
                            Image(systemName: "magnifyingglass")
                                .font(.body.weight(.medium))
                                .frame(minWidth: 28, minHeight: 28)
                                .contentShape(Rectangle())
                        }
                        .accessibilityIdentifier("\(kind.accessibilityRootID)-search")
                    }
                }
            }
            .sheet(isPresented: $showThreadSearch) {
                ChatThreadSearchSheet(
                    title: String(localized: "Search chat"),
                    rows: store.messages.map(ChatThreadSearchRow.from),
                    onSelect: { messageID in
                        showThreadSearch = false
                        scrollToMessageID = messageID
                    }
                )
            }
            .task(id: "\(kind.rawValue)-\(conversationID)") {
                await store.load(
                    kind: kind,
                    conversationID: conversationID,
                    using: session,
                    apiBaseURL: container.environment.apiBaseURL
                )
                knownMessageIDs = Set(store.messages.map(\.id))
                isNearBottom = true
                NotificationCenter.default.post(
                    name: .sideSeatChatScrollToBottom,
                    object: nil,
                    userInfo: ["animated": false]
                )
            }
            .onDisappear { store.stop() }
            .onChange(of: scenePhase) { _, phase in
                if phase == .active {
                    store.resumeRealtimeIfNeeded(using: session)
                } else {
                    store.stop()
                }
            }
            .onChange(of: store.messages.map(\.id)) { _, _ in
                handleMessageChange()
            }
            .confirmationDialog(
                "Delete this message?",
                isPresented: Binding(
                    get: { pendingDelete != nil },
                    set: { if !$0 { pendingDelete = nil } }
                ),
                titleVisibility: .visible
            ) {
                Button("Delete", role: .destructive) {
                    guard let message = pendingDelete else { return }
                    pendingDelete = nil
                    Task {
                        let deleted = await store.deleteMessage(message.id, using: session)
                        if deleted, replyDraft?.id == message.id {
                            replyDraft = nil
                        }
                    }
                }
                Button("Cancel", role: .cancel) {
                    pendingDelete = nil
                }
            }
            .sheet(isPresented: Binding(
                get: { pendingReport != nil },
                set: { if !$0 { pendingReport = nil } }
            )) {
                ChatReportSheet { reason, details in
                    guard let message = pendingReport else { return String(localized: "Message unavailable.") }
                    let failure = await store.reportMessage(
                        message,
                        reason: reason,
                        details: details,
                        using: session
                    )
                    if failure == nil {
                        pendingReport = nil
                    }
                    return failure
                }
            }
    }

    private var restoreBanner: some View {
        HStack(spacing: 10) {
            Text("Hidden from Chats — restore the row anytime.")
                .font(.caption)
                .foregroundStyle(.primary)
                .frame(maxWidth: .infinity, alignment: .leading)
            Button("Show in Chats") {
                Task { await store.restoreInbox(using: session) }
            }
            .font(.caption.weight(.semibold))
            .buttonStyle(.bordered)
            .accessibilityIdentifier("inbox-restore-button")
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .background(SideSeatTheme.warning.opacity(0.12))
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("inbox-restore-banner")
    }

    private var messageList: some View {
        ScrollViewReader { proxy in
            ZStack(alignment: .bottom) {
                ScrollView {
                    LazyVStack(spacing: 8) {
                        if store.conversation?.isHiddenFromInbox == true {
                            restoreBanner
                        }

                        if store.isLoadingOlder {
                            ProgressView()
                                .padding(.vertical, 8)
                        } else if store.hasMoreOlder {
                            Button("Load earlier messages") {
                                let anchorID = store.messages.first?.id
                                Task {
                                    await store.loadOlder(using: session)
                                    if let anchorID {
                                        proxy.scrollTo(anchorID, anchor: .top)
                                    }
                                }
                            }
                            .font(.footnote)
                            .padding(.vertical, 6)
                            .accessibilityIdentifier("chat-load-older")
                        }

                        ForEach(Array(store.messages.enumerated()), id: \.element.id) { index, message in
                            let previous = index > 0 ? store.messages[index - 1] : nil
                            if let day = ChatDaySeparatorFormatting.dayStart(for: message.createdDate),
                               ChatDaySeparatorFormatting.dayStart(for: previous?.createdDate) != day
                            {
                                Text(ChatDaySeparatorFormatting.label(for: day))
                                    .font(.caption2.weight(.semibold))
                                    .foregroundStyle(.secondary)
                                    .padding(.vertical, 6)
                                    .frame(maxWidth: .infinity)
                            }

                            let isMine = message.sender.id == (session.currentUser?.id ?? "ui-test-user")
                            CommunityMessageBubble(
                                message: message,
                                isMine: isMine,
                                status: store.sendStatuses[message.id],
                                supportsReply: kind.supportsReply,
                                supportsDelete: kind.supportsDelete,
                                supportsReport: kind.supportsReport,
                                onOpenProfile: {
                                    router.navigate(to: .profile(userID: message.sender.id))
                                },
                                onReply: {
                                    replyDraft = message
                                    store.beginReply(to: message)
                                    composerFocused = true
                                },
                                onRetry: {
                                    Task { _ = await store.retryFailedSend(message.id, using: session) }
                                },
                                onDelete: {
                                    pendingDelete = message
                                },
                                onReport: {
                                    pendingReport = message
                                }
                            )
                            .id(message.id)
                        }
                        ChatBottomSentinel(isNearBottom: $isNearBottom) {
                            store.clearPendingRemoteCount()
                        }
                    }
                    .padding(.horizontal, 12)
                    .padding(.vertical, 10)
                }
                .scrollDismissesKeyboard(.interactively)
                .chatNearBottomTracker(isNearBottom: $isNearBottom) {
                    store.clearPendingRemoteCount()
                }

                if store.pendingRemoteCount > 0 {
                    Button {
                        store.clearPendingRemoteCount()
                        isNearBottom = true
                        Task {
                            await ChatScrollAnchor.scrollToBottom(
                                proxy: proxy,
                                latestMessageID: { store.messages.last?.id },
                                animated: true
                            )
                        }
                    } label: {
                        Text(store.pendingRemoteCount == 1 ? String(localized: "1 new message") : String(localized: "\(store.pendingRemoteCount) new messages"))
                            .font(.footnote.weight(.semibold))
                            .padding(.horizontal, 12)
                            .padding(.vertical, 8)
                            .background(.ultraThinMaterial, in: Capsule())
                    }
                    .buttonStyle(.plain)
                    .padding(.bottom, 10)
                    .accessibilityIdentifier("chat-new-messages")
                }
            }
            .overlay(alignment: .topTrailing) {
                if store.unreadJumpCount > 0, store.unreadJumpMessageID != nil {
                    ChatUnreadJumpButton(count: store.unreadJumpCount) {
                        let targetID = store.unreadJumpMessageID
                        store.clearUnreadJump()
                        guard let targetID else { return }
                        withAnimation(.easeOut(duration: 0.25)) {
                            proxy.scrollTo(targetID, anchor: .top)
                        }
                    }
                    .padding(.top, 10)
                    .padding(.trailing, 12)
                }
            }
            .onChange(of: scrollToMessageID) { _, messageID in
                guard let messageID else { return }
                withAnimation(.easeOut(duration: 0.2)) {
                    proxy.scrollTo(messageID, anchor: .center)
                }
                scrollToMessageID = nil
            }
            .onReceive(NotificationCenter.default.publisher(for: .sideSeatChatScrollToBottom)) { note in
                let animated = (note.userInfo?["animated"] as? Bool) ?? false
                isNearBottom = true
                store.clearPendingRemoteCount()
                Task {
                    await ChatScrollAnchor.scrollToBottom(
                        proxy: proxy,
                        latestMessageID: { store.messages.last?.id },
                        animated: animated
                    )
                }
            }
        }
        .overlay {
            if store.isLoading && store.messages.isEmpty {
                ProgressView("Loading conversation")
            } else if let issue = store.issue, store.messages.isEmpty {
                ContentUnavailableView {
                    Label("Chat unavailable", systemImage: "exclamationmark.bubble")
                } description: {
                    Text(issue)
                }
            }
        }
    }

    private var composer: some View {
        VStack(spacing: 6) {
            if let sendIssue = store.sendIssue {
                Text(sendIssue)
                    .font(.caption)
                    .foregroundStyle(SideSeatTheme.danger)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.horizontal, 12)
            }

            if let reply = replyDraft, kind.supportsReply {
                HStack(alignment: .top, spacing: 10) {
                    RoundedRectangle(cornerRadius: 1.5)
                        .fill(SideSeatTheme.accent)
                        .frame(width: 3)
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Replying to \(reply.sender.displayName)")
                            .font(.caption.weight(.semibold))
                        Text(reply.previewText)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                            .lineLimit(2)
                    }
                    Spacer(minLength: 8)
                    Button {
                        replyDraft = nil
                        store.clearReply()
                    } label: {
                        Image(systemName: "xmark.circle.fill")
                            .foregroundStyle(.secondary)
                    }
                    .accessibilityIdentifier("chat-reply-cancel")
                }
                .padding(.horizontal, 12)
                .padding(.top, 8)
            }

            HStack(alignment: .bottom, spacing: 10) {
                TextField(
                    replyDraft == nil ? String(localized: "Message") : String(localized: "Reply"),
                    text: $draft,
                    axis: .vertical
                )
                    .lineLimit(1...5)
                    .textFieldStyle(.plain)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 10)
                    .background(SideSeatTheme.Chat.peerBubble, in: RoundedRectangle(cornerRadius: SideSeatTheme.Chat.composerRadius, style: .continuous))
                    .focused($composerFocused)
                    .submitLabel(.send)
                    .onSubmit { Task { await send() } }
                    .accessibilityIdentifier("chat-composer-field")

                Button {
                    Task { await send() }
                } label: {
                    Image(systemName: "arrow.up.circle.fill")
                        .font(.system(size: 30))
                        .symbolRenderingMode(.hierarchical)
                }
                .disabled(!canSend || store.isSending)
                .accessibilityIdentifier("chat-composer-send")
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .accessibilityElement(children: .contain)
            .accessibilityIdentifier("chat-composer")
        }
        .background(.bar)
    }

    private var canSend: Bool {
        !draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    private func send() async {
        let text = draft
        guard canSend else { return }
        let reply = replyDraft
        draft = ""
        replyDraft = nil
        isNearBottom = true
        composerFocused = true
        _ = await store.sendText(text, replyTo: reply, using: session)
        NotificationCenter.default.post(
            name: .sideSeatChatScrollToBottom,
            object: nil,
            userInfo: ["animated": true]
        )
    }

    private func handleMessageChange() {
        let decision = store.consumeScrollDecision(
            previousIDs: knownMessageIDs,
            isNearBottom: isNearBottom
        )
        knownMessageIDs = Set(store.messages.map(\.id))
        switch decision {
        case .scrollToBottom(let animated):
            NotificationCenter.default.post(
                name: .sideSeatChatScrollToBottom,
                object: nil,
                userInfo: ["animated": animated]
            )
        case .retainPosition(let count):
            store.noteRemoteArrivalWhileScrolledUp(count: count)
        case .none:
            break
        }
    }
}

private struct CommunityMessageBubble: View {
    let message: NativeCommunityMessage
    let isMine: Bool
    let status: NativeMessageSendStatus?
    let supportsReply: Bool
    let supportsDelete: Bool
    let supportsReport: Bool
    let onOpenProfile: () -> Void
    let onReply: () -> Void
    let onRetry: () -> Void
    let onDelete: () -> Void
    let onReport: () -> Void

    var body: some View {
        HStack(alignment: .top, spacing: 8) {
            if !isMine {
                Button(action: onOpenProfile) {
                    InitialAvatar(
                        name: message.sender.displayName,
                        url: message.sender.avatarUrl,
                        size: 32
                    )
                }
                .buttonStyle(.plain)
                .accessibilityIdentifier("chat-avatar-\(message.id)")
                .accessibilityLabel(String(localized: "\(message.sender.displayName) profile"))
            }

            if isMine { Spacer(minLength: 48) }
            VStack(alignment: isMine ? .trailing : .leading, spacing: 4) {
                if !isMine {
                    Button(action: onOpenProfile) {
                        Text(message.sender.displayName)
                            .font(.caption2.weight(.semibold))
                            .foregroundStyle(.secondary)
                    }
                    .buttonStyle(.plain)
                }

                VStack(alignment: .leading, spacing: 6) {
                    if let reply = message.replyTo {
                        HStack(alignment: .top, spacing: 8) {
                            RoundedRectangle(cornerRadius: 1.5)
                                .fill(isMine ? Color.white.opacity(0.85) : SideSeatTheme.accent)
                                .frame(width: 3)
                            VStack(alignment: .leading, spacing: 2) {
                                Text(reply.sender.displayName)
                                    .font(.caption2.weight(.semibold))
                                Text(reply.previewText)
                                    .font(.caption2)
                                    .lineLimit(2)
                                    .opacity(0.85)
                            }
                        }
                        .accessibilityIdentifier("chat-quote-\(message.id)")
                    }

                    if message.isDeleted {
                        Text("Message deleted")
                            .font(.body.italic())
                            .opacity(0.9)
                            .accessibilityIdentifier("chat-tombstone-\(message.id)")
                    } else {
                        Text(message.body ?? "")
                    }
                }
                .padding(.horizontal, 12)
                .padding(.vertical, 8)
                .background(
                    RoundedRectangle(cornerRadius: SideSeatTheme.Chat.bubbleRadius, style: .continuous)
                        .fill(isMine ? SideSeatTheme.Chat.ownBubble : SideSeatTheme.Chat.peerBubble)
                )
                .foregroundStyle(isMine ? Color.white : Color.primary)

                if let created = message.createdDate, status != .sending, status != .failed {
                    Text(created, style: .time)
                        .font(.caption2)
                        .foregroundStyle(.tertiary)
                }

                if status == .sending {
                    Text("Sending…")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                } else if status == .failed {
                    Button(action: onRetry) {
                        Text("Not delivered · Tap to retry")
                            .font(.caption2)
                            .foregroundStyle(SideSeatTheme.danger)
                    }
                    .buttonStyle(.plain)
                    .accessibilityIdentifier("chat-retry-\(message.id)")
                }

            }
            if !isMine { Spacer(minLength: 48) }
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("chat-bubble-\(message.id)")
        .contextMenu {
            if supportsReply && !message.isDeleted {
                Button {
                    onReply()
                } label: {
                    Label("Reply", systemImage: "arrowshape.turn.up.left")
                }
                .accessibilityIdentifier("chat-reply-\(message.id)")
            }
            if !message.isDeleted,
               let body = message.body?.trimmingCharacters(in: .whitespacesAndNewlines),
               !body.isEmpty
            {
                Button {
                    UIPasteboard.general.string = body
                } label: {
                    Label("Copy", systemImage: "doc.on.doc")
                }
            }
            if supportsReport && !isMine && !message.isDeleted {
                Button(role: .destructive) {
                    onReport()
                } label: {
                    Label("Report", systemImage: "flag")
                }
                .accessibilityIdentifier("chat-report-\(message.id)")
            }
            if supportsDelete && isMine && !message.isDeleted {
                Button(role: .destructive) {
                    onDelete()
                } label: {
                    Label("Delete", systemImage: "trash")
                }
                .accessibilityIdentifier("chat-delete-\(message.id)")
            }
        }
    }
}
