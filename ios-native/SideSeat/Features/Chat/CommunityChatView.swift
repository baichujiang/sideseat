import SwiftUI
import UIKit

struct CommunityChatView: View {
    @Environment(SessionStore.self) private var session
    @Environment(AppContainer.self) private var container
    @Environment(\.scenePhase) private var scenePhase

    let kind: NativeCommunityChatKind
    let conversationID: String

    @State private var store = CommunityChatStore()
    @State private var composerDraft = ChatComposerDraft()
    @State private var replyDraft: NativeCommunityMessage?
    @State private var isNearBottom = true
    @State private var keyboardBottomAnchor = ChatKeyboardBottomAnchorState()
    @State private var hasPreparedInitialViewport = false
    @State private var isInitialViewportVisible = false
    @State private var knownMessageIDs: Set<String> = []
    @State private var pendingDelete: NativeCommunityMessage?
    @State private var pendingReport: NativeCommunityMessage?
    @State private var actionNotice: ChatTransientNotice?
    @State private var showThreadSearch = false
    @State private var scrollToMessageID: String?
    @State private var composerFocus = ChatComposerFocusController()
    @Environment(RouterPath.self) private var router

    var body: some View {
        // Composer in a VStack (not safeAreaInset) so scrollTo(bottom) isn't short by one row.
        VStack(spacing: 0) {
            ZStack {
                if hasPreparedInitialViewport {
                    messageList
                        .opacity(isInitialViewportVisible ? 1 : 0)
                        .allowsHitTesting(isInitialViewportVisible)
                        .accessibilityHidden(!isInitialViewportVisible)
                }
                if !hasPreparedInitialViewport || !isInitialViewportVisible {
                    SSLoadingState("Loading conversation")
                        .accessibilityIdentifier("chat-initial-loading")
                }
            }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            composer
        }
            .background(SideSeatTheme.Chat.canvas)
            .navigationTitle("")
            .navigationBarTitleDisplayMode(.inline)
            .accessibilityIdentifier(kind.accessibilityRootID)
            .toolbar {
                ToolbarItem(placement: .principal) {
                    communityChatTitle
                }
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
                            Image(systemName: "ellipsis.circle")
                                .symbolRenderingMode(.hierarchical)
                                .font(.system(size: 17, weight: .semibold))
                                .frame(width: 32, height: 32)
                                .contentShape(Circle())
                        }
                        .accessibilityIdentifier("group-chat-actions")
                        .accessibilityLabel("Chat actions")
                    } else {
                        Button {
                            showThreadSearch = true
                        } label: {
                            Image(systemName: "magnifyingglass")
                                .symbolRenderingMode(.hierarchical)
                                .font(.system(size: 17, weight: .semibold))
                                .frame(width: 32, height: 32)
                                .contentShape(Circle())
                        }
                        .accessibilityIdentifier("\(kind.accessibilityRootID)-search")
                        .accessibilityLabel("Search chat")
                    }
                }
            }
            .sheet(isPresented: $showThreadSearch) {
                ChatThreadSearchSheet(
                    title: AppLocalization.string( "Search chat"),
                    rows: store.messages.map(ChatThreadSearchRow.from),
                    onSelect: { messageID in
                        showThreadSearch = false
                        scrollToMessageID = messageID
                    }
                )
            }
            .task(id: "\(kind.rawValue)-\(conversationID)") {
                ActiveChatPresentation.begin(activeConversationKey)
                hasPreparedInitialViewport = false
                isInitialViewportVisible = false
                knownMessageIDs = []
                await store.load(
                    kind: kind,
                    conversationID: conversationID,
                    using: session,
                    apiBaseURL: container.environment.apiBaseURL
                )
                if !hasPreparedInitialViewport {
                    prepareInitialViewport(messageIDs: store.messages.map(\.id))
                }
            }
            .onDisappear {
                ActiveChatPresentation.end(activeConversationKey)
                composerFocus.blur()
                store.stop()
            }
            .onChange(of: scenePhase) { _, phase in
                if phase == .active {
                    store.resumeRealtimeIfNeeded(using: session)
                } else {
                    store.stop()
                }
            }
            .onChange(of: store.messages.map(\.id)) { _, messageIDs in
                if !hasPreparedInitialViewport, !messageIDs.isEmpty {
                    prepareInitialViewport(messageIDs: messageIDs)
                    return
                }
                guard hasPreparedInitialViewport else { return }
                handleMessageChange()
            }
            .ssActionPrompt(
                isPresented: pendingDeletePromptPresented,
                title: AppLocalization.string("Delete this message?"),
                systemImage: "trash.fill",
                tint: SideSeatTheme.danger,
                onDismiss: { pendingDelete = nil },
                accessibilityIdentifier: "chat-delete-prompt",
                actions: { pendingDeletePromptActions }
            )
            .sheet(isPresented: Binding(
                get: { pendingReport != nil },
                set: { if !$0 { pendingReport = nil } }
            )) {
                ChatReportSheet { reason, details in
                    guard let message = pendingReport else { return AppLocalization.string( "Message unavailable.") }
                    let failure = await store.reportMessage(
                        message,
                        reason: reason,
                        details: details,
                        using: session
                    )
                    if failure == nil {
                        pendingReport = nil
                        showActionNotice(AppLocalization.string( "Report sent"), systemImage: "checkmark.shield")
                    }
                    return failure
                }
            }
    }

    private var activeConversationKey: String {
        kind == .course ? "course:\(conversationID)" : "group:\(conversationID)"
    }

    @ViewBuilder
    private var communityChatTitle: some View {
        if kind == .group {
            Button {
                router.navigate(to: .groupChatInfo(groupChatID: conversationID))
            } label: {
                communityChatTitleContent
            }
            .buttonStyle(SSPressButtonStyle())
            .accessibilityIdentifier("group-chat-title")
        } else {
            communityChatTitleContent
                .accessibilityIdentifier("course-chat-title")
        }
    }

    private var communityChatTitleContent: some View {
        HStack(spacing: 7) {
            ZStack {
                Circle()
                    .fill(SideSeatTheme.fillTertiary)
                Image(systemName: kind == .course ? "graduationcap.fill" : "person.3.fill")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(.secondary)
            }
            .frame(width: 28, height: 28)

            VStack(alignment: .leading, spacing: 0) {
                Text(
                    store.conversation?.displayName
                        ?? (kind == .course ? AppLocalization.string( "Course chat") : AppLocalization.string( "Group chat"))
                )
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(.primary)
                .lineLimit(1)

                if let subtitle = communityChatSubtitle {
                    Text(subtitle)
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }
            }
        }
        .frame(maxWidth: 200)
        .contentShape(Rectangle())
    }

    private var communityChatSubtitle: String? {
        guard let conversation = store.conversation else { return nil }
        if kind == .course {
            let values = [conversation.code, conversation.semesterLabel]
                .compactMap { value -> String? in
                    guard let value else { return nil }
                    let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
                    return trimmed.isEmpty ? nil : trimmed
                }
            return values.isEmpty ? nil : values.joined(separator: " · ")
        }
        guard let memberCount = conversation.memberCount else { return nil }
        return AppLocalization.string( "\(memberCount) members")
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
                    ChatMessageStack(
                        usesLazyLayout: store.messages.count > ChatMessageStack<EmptyView>.eagerMessageLimit
                    ) {
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
                            let next = index + 1 < store.messages.count ? store.messages[index + 1] : nil
                            let connectsAbove = ChatMessageGrouping.isContinuation(
                                previousSenderID: previous?.sender.id,
                                previousDate: previous?.createdDate,
                                senderID: message.sender.id,
                                date: message.createdDate
                            )
                            let connectsBelow = ChatMessageGrouping.isContinuation(
                                previousSenderID: message.sender.id,
                                previousDate: message.createdDate,
                                senderID: next?.sender.id ?? "",
                                date: next?.createdDate
                            )
                            VStack(spacing: 0) {
                                if ChatMessageGrouping.shouldShowTimestamp(
                                    previousDate: previous?.createdDate,
                                    date: message.createdDate
                                ), let date = message.createdDate {
                                    ChatTimelineTimestamp(date: date)
                                }

                                let isMine = message.sender.id == (session.currentUser?.id ?? "ui-test-user")
                                CommunityMessageBubble(
                                message: message,
                                isMine: isMine,
                                showSenderName: !connectsAbove,
                                showAvatar: !connectsBelow,
                                connectsAbove: connectsAbove,
                                connectsBelow: connectsBelow,
                                status: store.sendStatuses[message.id],
                                supportsReply: kind.supportsReply,
                                supportsDelete: kind.supportsDelete,
                                supportsReport: kind.supportsReport,
                                onOpenProfile: {
                                    router.navigate(to: .profile(userID: message.sender.id))
                                },
                                onReply: {
                                    beginReply(to: message)
                                },
                                onRetry: {
                                    Task { _ = await store.retryFailedSend(message.id, using: session) }
                                },
                                onDelete: {
                                    presentDeleteConfirmation(for: message)
                                },
                                onReport: {
                                    presentReportSheet(for: message)
                                },
                                onCopy: { text in
                                    copyMessageText(text)
                                }
                                )
                                .padding(.top, connectsAbove ? 2 : 8)
                            }
                            .id(message.id)
                        }
                        ChatBottomSentinel(isNearBottom: $isNearBottom) {
                            revealInitialViewport()
                            store.clearPendingRemoteCount()
                        }
                    }
                    .padding(.horizontal, 12)
                    .padding(.vertical, 10)
                }
                .contentShape(Rectangle())
                .simultaneousGesture(
                    TapGesture().onEnded {
                        guard composerFocus.isFocused else { return }
                        composerFocus.blur()
                    }
                )
                .scrollDismissesKeyboard(.interactively)
                .defaultScrollAnchor(.bottom)
                .accessibilityIdentifier("chat-message-list")

                VStack(spacing: 8) {
                    if let actionNotice {
                        ChatTransientNoticeView(notice: actionNotice)
                    }

                    if store.pendingRemoteCount > 0 {
                        Button {
                            store.clearPendingRemoteCount()
                            isNearBottom = true
                            Task {
                                await ChatScrollAnchor.scrollToBottom(
                                    proxy: proxy,
                                    animated: true
                                )
                            }
                        } label: {
                            Text(store.pendingRemoteCount == 1 ? AppLocalization.string( "1 new message") : AppLocalization.string( "\(store.pendingRemoteCount) new messages"))
                                .font(.footnote.weight(.semibold))
                                .padding(.horizontal, 12)
                                .padding(.vertical, 8)
                                .background(.ultraThinMaterial, in: Capsule())
                        }
                        .buttonStyle(SSPressButtonStyle())
                        .accessibilityIdentifier("chat-new-messages")
                    }
                }
                .padding(.bottom, 10)
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
                        animated: animated
                    )
                }
            }
            .task(id: activeConversationKey) {
                guard hasPreparedInitialViewport, !isInitialViewportVisible else { return }
                await ChatScrollAnchor.scrollToBottom(
                    proxy: proxy,
                    animated: false
                )
                await Task.yield()
                revealInitialViewport()
            }
            .chatKeyboardBottomAnchor(
                state: $keyboardBottomAnchor,
                isNearBottom: $isNearBottom
            ) { animated in
                Task {
                    await ChatScrollAnchor.scrollToBottom(
                        proxy: proxy,
                        animated: animated
                    )
                }
            }
        }
        .overlay {
            if store.isLoading && store.messages.isEmpty {
                SSLoadingState("Loading conversation")
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
                        .frame(width: 3, height: 38)
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
                .fixedSize(horizontal: false, vertical: true)
                .padding(.horizontal, 12)
                .padding(.top, 8)
            }

            HStack(alignment: .bottom, spacing: 10) {
                ChatComposerTextInput(
                    draft: composerDraft,
                    placeholder: replyDraft == nil ? AppLocalization.string( "Message") : AppLocalization.string( "Reply"),
                    focusController: composerFocus
                ) { text in
                    Task { await send(text) }
                }
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .accessibilityElement(children: .contain)
            .accessibilityIdentifier("chat-composer")
        }
        .background(.bar)
    }

    private func beginReply(to message: NativeCommunityMessage) {
        UISelectionFeedbackGenerator().selectionChanged()
        withAnimation(.easeOut(duration: 0.18)) {
            replyDraft = message
        }
        store.beginReply(to: message)

        guard !composerFocus.isFocused else { return }
        Task { @MainActor in
            await Task.yield()
            composerFocus.focus()
        }
    }

    private func copyMessageText(_ text: String) {
        UIPasteboard.general.string = text
        Task { @MainActor in
            try? await Task.sleep(for: .milliseconds(140))
            showActionNotice(AppLocalization.string( "Copied"), systemImage: "checkmark")
        }
    }

    private var pendingDeletePromptPresented: Binding<Bool> {
        Binding(
            get: { pendingDelete != nil },
            set: { if !$0 { pendingDelete = nil } }
        )
    }

    private var pendingDeletePromptActions: [SSActionPromptAction] {
        guard let message = pendingDelete else { return [] }

        return [
            SSActionPromptAction(
                id: "chat-delete-cancel",
                title: AppLocalization.string("Cancel"),
                systemImage: "xmark",
                role: .cancel
            ) {
                pendingDelete = nil
            },
            SSActionPromptAction(
                id: "chat-delete-confirm",
                title: AppLocalization.string("Delete"),
                systemImage: "trash",
                role: .destructive
            ) {
                Task {
                    let deleted = await store.deleteMessage(message.id, using: session)
                    if deleted, replyDraft?.id == message.id {
                        replyDraft = nil
                    }
                    if deleted {
                        showActionNotice(
                            AppLocalization.string("Message deleted"),
                            systemImage: "trash"
                        )
                    }
                }
            },
        ]
    }

    private func presentDeleteConfirmation(for message: NativeCommunityMessage) {
        UISelectionFeedbackGenerator().selectionChanged()
        Task { @MainActor in
            try? await Task.sleep(for: .milliseconds(140))
            pendingDelete = message
        }
    }

    private func presentReportSheet(for message: NativeCommunityMessage) {
        UISelectionFeedbackGenerator().selectionChanged()
        Task { @MainActor in
            try? await Task.sleep(for: .milliseconds(140))
            pendingReport = message
        }
    }

    private func showActionNotice(_ text: String, systemImage: String) {
        let notice = ChatTransientNotice(text: text, systemImage: systemImage)
        UINotificationFeedbackGenerator().notificationOccurred(.success)
        withAnimation(.spring(response: 0.28, dampingFraction: 0.86)) {
            actionNotice = notice
        }
        Task { @MainActor in
            try? await Task.sleep(for: .milliseconds(4_000))
            guard actionNotice?.id == notice.id else { return }
            withAnimation(.easeIn(duration: 0.18)) {
                actionNotice = nil
            }
        }
    }

    private func send(_ text: String) async {
        let normalizedText = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !normalizedText.isEmpty else { return }
        let reply = replyDraft
        composerDraft.clear()
        replyDraft = nil
        isNearBottom = true
        _ = await store.sendText(text, replyTo: reply, using: session)
    }

    private func prepareInitialViewport(messageIDs: [String]) {
        knownMessageIDs = Set(messageIDs)
        isNearBottom = true
        hasPreparedInitialViewport = true
    }

    private func revealInitialViewport() {
        guard hasPreparedInitialViewport, !isInitialViewportVisible else { return }
        var transaction = Transaction()
        transaction.disablesAnimations = true
        withTransaction(transaction) {
            isInitialViewportVisible = true
        }
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
    let showSenderName: Bool
    let showAvatar: Bool
    let connectsAbove: Bool
    let connectsBelow: Bool
    let status: NativeMessageSendStatus?
    let supportsReply: Bool
    let supportsDelete: Bool
    let supportsReport: Bool
    let onOpenProfile: () -> Void
    let onReply: () -> Void
    let onRetry: () -> Void
    let onDelete: () -> Void
    let onReport: () -> Void
    let onCopy: (String) -> Void

    private var copyableText: String? {
        guard !message.isDeleted else { return nil }
        let value = message.body?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        return value.isEmpty ? nil : value
    }

    var body: some View {
        HStack(alignment: .top, spacing: 8) {
            if !isMine {
                if showAvatar {
                    Button(action: onOpenProfile) {
                        InitialAvatar(
                            name: message.sender.displayName,
                            url: message.sender.avatarUrl,
                            size: 32
                        )
                    }
                    .buttonStyle(SSPressButtonStyle())
                    .accessibilityIdentifier("chat-avatar-\(message.id)")
                    .accessibilityLabel(AppLocalization.string( "\(message.sender.displayName) profile"))
                } else {
                    Color.clear
                        .frame(width: 32, height: 1)
                        .accessibilityHidden(true)
                }
            }

            if isMine { Spacer(minLength: 48) }
            VStack(alignment: isMine ? .trailing : .leading, spacing: 4) {
                if !isMine, showSenderName {
                    Button(action: onOpenProfile) {
                        Text(message.sender.displayName)
                            .font(.caption2.weight(.semibold))
                            .foregroundStyle(.secondary)
                    }
                    .buttonStyle(SSPressButtonStyle())
                }

                ChatMessageContextMenuTarget(
                    isEnabled: !message.isDeleted,
                    edge: isMine ? .trailing : .leading
                ) {
                    VStack(alignment: .leading, spacing: 6) {
                        if let reply = message.replyTo {
                            HStack(alignment: .top, spacing: 8) {
                                RoundedRectangle(cornerRadius: 1.5)
                                    .fill(
                                        isMine
                                            ? SideSeatTheme.Chat.ownBubbleForeground.opacity(0.72)
                                            : SideSeatTheme.accent
                                    )
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
                            .padding(.horizontal, 8)
                            .padding(.vertical, 6)
                            .background(
                                SideSeatTheme.Chat.quoteSurface,
                                in: RoundedRectangle(cornerRadius: 8, style: .continuous)
                            )
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
                        isMine ? SideSeatTheme.Chat.ownBubble : SideSeatTheme.Chat.peerBubble,
                        in: ChatBubbleShape(
                            isMine: isMine,
                            connectsAbove: connectsAbove,
                            connectsBelow: connectsBelow
                        )
                    )
                    .foregroundStyle(isMine ? SideSeatTheme.Chat.ownBubbleForeground : Color.primary)
                    .accessibilityElement(children: .contain)
                    .accessibilityIdentifier("chat-bubble-\(message.id)")
                } actions: {
                    messageContextMenuActions
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
                    .buttonStyle(SSPressButtonStyle())
                    .accessibilityIdentifier("chat-retry-\(message.id)")
                }

            }
            if !isMine { Spacer(minLength: 48) }
        }
        .accessibilityElement(children: .contain)
    }

    private var messageContextMenuActions: [SSLongPressAction] {
        var actions: [SSLongPressAction] = []

        if supportsReply && !message.isDeleted {
            actions.append(
                SSLongPressAction(
                    id: "chat-reply-\(message.id)",
                    title: AppLocalization.string("Reply"),
                    systemImage: "arrowshape.turn.up.left",
                    perform: onReply
                )
            )
        }
        if let copyableText {
            actions.append(
                SSLongPressAction(
                    id: "chat-copy-\(message.id)",
                    title: AppLocalization.string("Copy"),
                    systemImage: "doc.on.doc",
                    perform: { onCopy(copyableText) }
                )
            )
        }
        if supportsReport && !isMine && !message.isDeleted {
            actions.append(
                SSLongPressAction(
                    id: "chat-report-\(message.id)",
                    title: AppLocalization.string("Report"),
                    systemImage: "flag",
                    role: .destructive,
                    perform: onReport
                )
            )
        }
        if supportsDelete && isMine && !message.isDeleted {
            actions.append(
                SSLongPressAction(
                    id: "chat-delete-\(message.id)",
                    title: AppLocalization.string("Delete"),
                    systemImage: "trash",
                    role: .destructive,
                    perform: onDelete
                )
            )
        }
        return actions
    }
}
