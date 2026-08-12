import MapKit
import PhotosUI
import SwiftUI
import UIKit

struct DirectChatView: View {
    @Environment(SessionStore.self) private var session
    @Environment(AppContainer.self) private var container
    @Environment(RouterPath.self) private var router
    @Environment(DeepLinkRouter.self) private var deepLinkRouter
    @Environment(\.scenePhase) private var scenePhase

    let connectionID: String

    @State private var store = DirectChatStore()
    @State private var composerDraft = ChatComposerDraft()
    @State private var replyDraft: NativeDirectMessage?
    @State private var isNearBottom = true
    @State private var keyboardBottomAnchor = ChatKeyboardBottomAnchorState()
    @State private var hasPreparedInitialViewport = false
    @State private var hasCompletedInitialLoad = false
    @State private var isInitialViewportVisible = false
    @State private var knownMessageIDs: Set<String> = []
    @State private var pendingDelete: NativeDirectMessage?
    @State private var pendingReport: NativeDirectMessage?
    @State private var actionNotice: ChatTransientNotice?
    @State private var selectedPhoto: PhotosPickerItem?
    @State private var previewImageURL: URL?
    @State private var locationCapture = ChatLocationCapture()
    @State private var showLocationPicker = false
    @State private var showChatInfo = false
    @State private var showPlanCreate = false
    @State private var showScheduleShare = false
    @State private var isAttachmentTrayVisible = false
    @State private var openedScheduleShareToken: ScheduleShareNavToken?
    @State private var counterPlan: NativePlanRequest?
    @State private var scrollToMessageID: String?
    @State private var composerFocus = ChatComposerFocusController()
    @Environment(\.dismiss) private var dismiss

    private struct ScheduleShareNavToken: Identifiable, Hashable {
        let id: String
    }

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
            .background(SideSeatTheme.bgGrouped)
            .navigationTitle("")
            .navigationBarTitleDisplayMode(.inline)
            .accessibilityIdentifier("direct-chat")
            .toolbar {
                ToolbarItem(placement: .principal) {
                    directChatTitle
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        composerFocus.blur()
                        showChatInfo = true
                    } label: {
                        Image(systemName: "ellipsis.circle")
                            .symbolRenderingMode(.hierarchical)
                            .font(.system(size: 17, weight: .semibold))
                            .frame(width: 32, height: 32)
                            .contentShape(Circle())
                    }
                    .accessibilityIdentifier("direct-chat-actions")
                    .accessibilityLabel("Chat actions")
                }
            }
            .task(id: connectionID) {
                ActiveChatPresentation.begin("connection:\(connectionID)")
                keyboardBottomAnchor = ChatKeyboardBottomAnchorState()
                hasPreparedInitialViewport = false
                hasCompletedInitialLoad = false
                isInitialViewportVisible = false
                knownMessageIDs = []
                await store.load(
                    connectionID: connectionID,
                    using: session,
                    apiBaseURL: container.environment.apiBaseURL
                )
                hasCompletedInitialLoad = true
                if !hasPreparedInitialViewport {
                    prepareInitialViewport(messageIDs: store.messages.map(\.id))
                }
            }
            .onDisappear {
                ActiveChatPresentation.end("connection:\(connectionID)")
                isAttachmentTrayVisible = false
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
                guard hasCompletedInitialLoad || store.hasCachedSnapshot else {
                    knownMessageIDs = Set(messageIDs)
                    return
                }
                handleMessageChange()
            }
            .onChange(of: selectedPhoto) { _, item in
                guard let item else { return }
                isAttachmentTrayVisible = false
                Task { await sendPhoto(item) }
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
                        if deleted {
                            showActionNotice(String(localized: "Message deleted"), systemImage: "trash")
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
                        showActionNotice(String(localized: "Report sent"), systemImage: "checkmark.shield")
                    }
                    return failure
                }
            }
            .fullScreenCover(isPresented: Binding(
                get: { previewImageURL != nil },
                set: { if !$0 { previewImageURL = nil } }
            )) {
                ChatImagePreviewView(url: previewImageURL) {
                    previewImageURL = nil
                }
            }
            .sheet(isPresented: $showPlanCreate) {
                PlanCreateSheet(
                    connectionID: connectionID,
                    recipientName: store.conversation?.displayName
                ) {
                    Task {
                        #if DEBUG
                        if ProcessInfo.processInfo.arguments.contains("--ui-testing-authenticated") {
                            store.seedLocalPlanCard()
                        } else {
                            await store.refreshMessages(using: session)
                            store.publishLatestOutboundToInbox()
                        }
                        #else
                        await store.refreshMessages(using: session)
                        store.publishLatestOutboundToInbox()
                        #endif
                        NotificationCenter.default.post(
                            name: .sideSeatChatScrollToBottom,
                            object: nil,
                            userInfo: ["animated": true]
                        )
                    }
                }
            }
            .sheet(isPresented: $showLocationPicker) {
                ChatLocationShareSheet(capture: locationCapture) { location in
                    let sent = await store.sendLocation(
                        latitude: location.latitude,
                        longitude: location.longitude,
                        name: location.name,
                        using: session
                    )
                    if sent {
                        replyDraft = nil
                        isNearBottom = true
                        NotificationCenter.default.post(
                            name: .sideSeatChatScrollToBottom,
                            object: nil,
                            userInfo: ["animated": true]
                        )
                    }
                    return sent
                }
            }
            .sheet(item: $counterPlan) { plan in
                PlanCreateSheet(
                    connectionID: connectionID,
                    recipientName: store.conversation?.displayName,
                    counterOf: plan
                ) {
                    Task {
                        #if DEBUG
                        if ProcessInfo.processInfo.arguments.contains("--ui-testing-authenticated") {
                            store.seedLocalPlanCard(title: plan.title)
                        } else {
                            await store.refreshMessages(using: session)
                            store.publishLatestOutboundToInbox()
                        }
                        #else
                        await store.refreshMessages(using: session)
                        store.publishLatestOutboundToInbox()
                        #endif
                        NotificationCenter.default.post(
                            name: .sideSeatChatScrollToBottom,
                            object: nil,
                            userInfo: ["animated": true]
                        )
                    }
                }
            }
            .sheet(isPresented: $showScheduleShare) {
                ScheduleShareComposeSheet(
                    connectionID: connectionID,
                    recipientName: store.conversation?.displayName
                ) {
                    Task {
                        #if DEBUG
                        if ProcessInfo.processInfo.arguments.contains("--ui-testing-authenticated") {
                            store.seedLocalScheduleShareCard()
                        } else {
                            await store.refreshMessages(using: session)
                            store.publishLatestOutboundToInbox()
                        }
                        #else
                        await store.refreshMessages(using: session)
                        store.publishLatestOutboundToInbox()
                        #endif
                        NotificationCenter.default.post(
                            name: .sideSeatChatScrollToBottom,
                            object: nil,
                            userInfo: ["animated": true]
                        )
                    }
                }
            }
            .navigationDestination(item: $openedScheduleShareToken) { item in
                ScheduleShareRecipientView(token: item.id)
            }
            .navigationDestination(isPresented: $showChatInfo) {
                DirectChatInfoView(
                    store: store,
                    searchRows: store.messages.map(ChatThreadSearchRow.from),
                    onSelectMessage: { messageID in
                        showChatInfo = false
                        Task { @MainActor in
                            await Task.yield()
                            scrollToMessageID = messageID
                        }
                    },
                    onViewProfile: { peerID in
                        showChatInfo = false
                        Task { @MainActor in
                            await Task.yield()
                            router.navigate(to: .profile(userID: peerID))
                        }
                    },
                    onConversationClosed: {
                        showChatInfo = false
                        Task { @MainActor in
                            await Task.yield()
                            closeChat()
                        }
                    }
                )
            }
    }

    private func closeChat() {
        dismiss()
    }

    private var messageList: some View {
        ScrollViewReader { proxy in
            ZStack(alignment: .bottom) {
                ScrollView {
                    ChatMessageStack(
                        usesLazyLayout: store.messages.count > ChatMessageStack<EmptyView>.eagerMessageLimit
                    ) {
                        if store.isLoadingOlder {
                            ProgressView()
                                .padding(.vertical, 8)
                        } else if store.hasMoreOlder {
                            Button("Load earlier messages") {
                                let anchorID = store.messages.first?.id
                                releaseMessageListBottomPin()
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
                                let peer = store.conversation?.peer
                                let avatarURL: String? = {
                                    if let url = message.sender.avatarUrl, !url.isEmpty { return url }
                                    if message.sender.id == peer?.id { return peer?.avatarUrl }
                                    return nil
                                }()
                                DirectMessageBubble(
                                message: message,
                                isMine: isMine,
                                showSenderName: false,
                                showAvatar: !connectsBelow,
                                connectsAbove: connectsAbove,
                                connectsBelow: connectsBelow,
                                avatarURL: avatarURL,
                                currentUserID: session.currentUser?.id ?? "ui-test-user",
                                status: store.sendStatuses[message.id],
                                isActingOnPlan: store.isActingOnPlan,
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
                                },
                                onOpenImage: { url in
                                    previewImageURL = url
                                },
                                onAcceptPlan: { planID in
                                    Task { _ = await store.acceptPlan(planID, using: session) }
                                },
                                onDeclinePlan: { planID in
                                    Task { _ = await store.declinePlan(planID, using: session) }
                                },
                                onCounterPlan: { plan in
                                    counterPlan = plan
                                },
                                onOpenCalendar: {
                                    deepLinkRouter.handleAppPath("/home")
                                },
                                onOpenScheduleShare: { token in
                                    openedScheduleShareToken = ScheduleShareNavToken(id: token)
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
                        if isAttachmentTrayVisible {
                            isAttachmentTrayVisible = false
                            return
                        }
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
                            pinMessageListToBottom()
                            Task {
                                await ChatScrollAnchor.scrollToBottom(
                                    proxy: proxy,
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
                        releaseMessageListBottomPin()
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
                releaseMessageListBottomPin()
                withAnimation(.easeOut(duration: 0.2)) {
                    proxy.scrollTo(messageID, anchor: .center)
                }
                scrollToMessageID = nil
            }
            .onReceive(NotificationCenter.default.publisher(for: .sideSeatChatScrollToBottom)) { note in
                let animated = (note.userInfo?["animated"] as? Bool) ?? false
                isNearBottom = true
                pinMessageListToBottom()
                store.clearPendingRemoteCount()
                Task {
                    await ChatScrollAnchor.scrollToBottom(
                        proxy: proxy,
                        animated: animated
                    )
                }
            }
            .task(id: hasPreparedInitialViewport && (hasCompletedInitialLoad || store.hasCachedSnapshot)) {
                guard hasPreparedInitialViewport,
                      hasCompletedInitialLoad || store.hasCachedSnapshot,
                      !isInitialViewportVisible
                else { return }
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
                if store.isUnrepliedSendBlocked || store.showUnrepliedHint {
                    UnrepliedReplyBanner(
                        blocked: store.isUnrepliedSendBlocked,
                        sent: min(store.unrepliedStreak, 2),
                        max: 2
                    )
                    .padding(.horizontal, 12)
                    .accessibilityIdentifier("chat-unreplied-hint")
                }

                if let issue = store.sendIssue ?? store.planIssue ?? store.actionIssue {
                    Text(issue)
                        .font(.caption)
                        .foregroundStyle(SideSeatTheme.danger)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.horizontal, 12)
                        .accessibilityIdentifier("chat-action-issue")
                }

                if let reply = replyDraft {
                    HStack(alignment: .top, spacing: 10) {
                        RoundedRectangle(cornerRadius: 1.5)
                            .fill(SideSeatTheme.accent)
                            .frame(width: 3, height: 38)
                        VStack(alignment: .leading, spacing: 2) {
                            Text("Replying to \(reply.sender.displayName)")
                                .font(.caption.weight(.semibold))
                                .accessibilityIdentifier("chat-reply-preview")
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

                if isAttachmentTrayVisible {
                    attachmentTray
                        .transition(.opacity)
                }

                HStack(alignment: .bottom, spacing: 10) {
                    Button {
                        withAnimation(.easeOut(duration: 0.16)) {
                            isAttachmentTrayVisible.toggle()
                        }
                    } label: {
                        Image(systemName: isAttachmentTrayVisible ? "xmark" : "plus")
                            .font(.system(size: 17, weight: .semibold))
                            .foregroundStyle(.primary)
                            .frame(width: 30, height: 30)
                            .background(.quaternary, in: Circle())
                    }
                    .buttonStyle(.plain)
                    .disabled(store.isUnrepliedSendBlocked)
                    .accessibilityIdentifier("chat-composer-attach")
                    .accessibilityLabel(isAttachmentTrayVisible ? "Close attachments" : "Attachments")

                    ChatComposerTextInput(
                        draft: composerDraft,
                        placeholder: replyDraft == nil ? String(localized: "Message") : String(localized: "Reply"),
                        isBlocked: store.isUnrepliedSendBlocked,
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

    private var attachmentTray: some View {
        HStack(alignment: .top, spacing: 12) {
            PhotosPicker(selection: $selectedPhoto, matching: .images) {
                attachmentActionLabel(title: "Photo", systemImage: "photo")
            }
            .disabled(store.isSending || store.isUnrepliedSendBlocked)
            .accessibilityIdentifier("chat-composer-photo")

            Button {
                closeAttachmentTrayForDestination()
                showLocationPicker = true
            } label: {
                attachmentActionLabel(title: "Location", systemImage: "mappin.and.ellipse")
            }
            .disabled(store.isSending || store.isUnrepliedSendBlocked)
            .accessibilityIdentifier("chat-composer-location")

            Button {
                closeAttachmentTrayForDestination()
                showPlanCreate = true
            } label: {
                attachmentActionLabel(title: "Plan", systemImage: "calendar.badge.plus")
            }
            .disabled(store.isSending || store.isUnrepliedSendBlocked)
            .accessibilityIdentifier("chat-composer-plan")

            Button {
                closeAttachmentTrayForDestination()
                showScheduleShare = true
            } label: {
                attachmentActionLabel(title: "Share schedule", systemImage: "calendar.badge.clock")
            }
            .disabled(store.isSending || store.isUnrepliedSendBlocked)
            .accessibilityIdentifier("chat-composer-schedule-share")
        }
        .buttonStyle(.plain)
        .padding(.horizontal, 12)
        .padding(.top, 8)
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("chat-attachment-tray")
    }

    nonisolated private func attachmentActionLabel(
        title: LocalizedStringKey,
        systemImage: String
    ) -> some View {
        VStack(spacing: 5) {
            Image(systemName: systemImage)
                .font(.system(size: 19, weight: .medium))
                .foregroundStyle(.primary)
                .frame(width: 44, height: 40)
                .background(.quaternary, in: RoundedRectangle(cornerRadius: 8, style: .continuous))
            Text(title)
                .font(.caption2)
                .foregroundStyle(.secondary)
                .lineLimit(1)
                .minimumScaleFactor(0.75)
        }
        .frame(maxWidth: .infinity)
        .contentShape(Rectangle())
    }

    private func closeAttachmentTrayForDestination() {
        isAttachmentTrayVisible = false
        composerFocus.blur()
    }

    private func pinMessageListToBottom() {
        var updated = keyboardBottomAnchor
        updated.pinToBottom()
        keyboardBottomAnchor = updated
    }

    private func prepareInitialViewport(messageIDs: [String]) {
        knownMessageIDs = Set(messageIDs)
        isNearBottom = true
        pinMessageListToBottom()
        hasPreparedInitialViewport = true
    }

    private func revealInitialViewport() {
        guard ChatInitialViewportPolicy.canReveal(
            hasPreparedViewport: hasPreparedInitialViewport,
            hasCompletedInitialLoad: hasCompletedInitialLoad,
            hasCachedSnapshot: store.hasCachedSnapshot,
            isVisible: isInitialViewportVisible
        )
        else { return }
        var transaction = Transaction()
        transaction.disablesAnimations = true
        withTransaction(transaction) {
            isInitialViewportVisible = true
        }
    }

    private func releaseMessageListBottomPin() {
        var updated = keyboardBottomAnchor
        updated.userScrollBegan()
        keyboardBottomAnchor = updated
    }

    @ViewBuilder
    private var directChatTitle: some View {
        if let conversation = store.conversation {
            Button {
                guard !conversation.isSelfNotes else { return }
                router.navigate(to: .profile(userID: conversation.peer.id))
            } label: {
                HStack(spacing: 7) {
                    InitialAvatar(
                        name: conversation.displayName,
                        url: conversation.peer.avatarUrl,
                        size: 28
                    )
                    VStack(alignment: .leading, spacing: 0) {
                        Text(conversation.displayName)
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(.primary)
                            .lineLimit(1)
                        if !conversation.isSelfNotes {
                            Text("@\(conversation.peer.username)")
                                .font(.caption2)
                                .foregroundStyle(.secondary)
                                .lineLimit(1)
                        }
                    }
                }
                .frame(maxWidth: 190)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .disabled(conversation.isSelfNotes)
            .accessibilityIdentifier("direct-chat-title")
        } else {
            Text("Chat")
                .font(.headline)
                .accessibilityIdentifier("direct-chat-title")
        }
    }

    private func beginReply(to message: NativeDirectMessage) {
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
            showActionNotice(String(localized: "Copied"), systemImage: "checkmark")
        }
    }

    private func presentDeleteConfirmation(for message: NativeDirectMessage) {
        UISelectionFeedbackGenerator().selectionChanged()
        Task { @MainActor in
            try? await Task.sleep(for: .milliseconds(140))
            pendingDelete = message
        }
    }

    private func presentReportSheet(for message: NativeDirectMessage) {
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
        guard !normalizedText.isEmpty,
              !store.isUnrepliedSendBlocked
        else { return }
        let reply = replyDraft
        // Clear immediately so failed rows own the text (avoid draft + bubble duplication).
        composerDraft.clear()
        replyDraft = nil
        isNearBottom = true
        _ = await store.sendText(text, replyTo: reply, using: session)
    }

    private func sendPhoto(_ item: PhotosPickerItem) async {
        defer { selectedPhoto = nil }
        guard let data = try? await item.loadTransferable(type: Data.self),
              let draftImage = await DiscoverImagePreprocessor.makeDraftAsync(from: data)
        else {
            store.noteSendIssue(String(localized: "Could not prepare that photo."))
            return
        }
        // Chat upload limit is 2 MB.
        guard draftImage.data.count <= 2 * 1024 * 1024 else {
            store.noteSendIssue(String(localized: "Image is too large. Max 2 MB."))
            return
        }
        let caption = composerDraft.trimmedText
        let ok = await store.sendImage(
            data: draftImage.data,
            mimeType: draftImage.mimeType,
            fileName: "chat-\(draftImage.id.uuidString).jpg",
            caption: caption.isEmpty ? nil : caption,
            using: session
        )
        isNearBottom = true
        if ok {
            composerDraft.clear()
            replyDraft = nil
        }
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

struct ChatComposerTextInput: View {
    let draft: ChatComposerDraft
    @State private var editorHeight = ChatComposerUIKitTextView.minimumHeight

    let placeholder: String
    let isBlocked: Bool
    let focusController: ChatComposerFocusController
    let onSend: (String) -> Void

    init(
        draft: ChatComposerDraft,
        placeholder: String,
        isBlocked: Bool = false,
        focusController: ChatComposerFocusController,
        onSend: @escaping (String) -> Void
    ) {
        self.draft = draft
        self.placeholder = placeholder
        self.isBlocked = isBlocked
        self.focusController = focusController
        self.onSend = onSend
    }

    var body: some View {
        ZStack(alignment: .topLeading) {
            Text(placeholder)
                .font(.body)
                .foregroundStyle(.tertiary)
                .padding(.top, 1)
                .opacity(draft.isEmpty ? 1 : 0)
                .allowsHitTesting(false)
                .accessibilityHidden(true)

            ChatComposerUIKitTextView(
                text: draft.text,
                resetVersion: draft.resetVersion,
                isBlocked: isBlocked,
                accessibilityLabel: placeholder,
                focusController: focusController,
                onTextChange: draft.updateText,
                onHeightChange: { height in
                    guard abs(editorHeight - height) > 0.5 else { return }
                    editorHeight = height
                },
                onSend: submit
            )
            .frame(height: editorHeight)
        }
            .padding(.horizontal, 14)
            .padding(.vertical, 9)
            .frame(minHeight: 40)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(
                SideSeatTheme.Chat.controlFill,
                in: RoundedRectangle(
                    cornerRadius: SideSeatTheme.Chat.composerRadius,
                    style: .continuous
                )
            )
            .contentShape(Rectangle())
            .onTapGesture {
                guard !isBlocked else { return }
                focusController.focus()
            }
            .layoutPriority(1)

        Button {
            submit(draft.text)
        } label: {
            Image(systemName: "arrow.up.circle.fill")
                .font(.system(size: 30))
                .symbolRenderingMode(.hierarchical)
        }
        .disabled(!canSend || isBlocked)
        .accessibilityIdentifier("chat-composer-send")
    }

    private var canSend: Bool {
        draft.canSend && !isBlocked
    }

    private func submit(_ text: String) {
        guard !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
              !isBlocked
        else { return }

        draft.clear()
        onSend(text)
    }
}

private struct ChatComposerUIKitTextView: UIViewRepresentable {
    static var minimumHeight: CGFloat {
        ceil(UIFont.preferredFont(forTextStyle: .body).lineHeight)
    }

    private static var maximumHeight: CGFloat {
        ceil(UIFont.preferredFont(forTextStyle: .body).lineHeight * 4)
    }

    let text: String
    let resetVersion: Int
    let isBlocked: Bool
    let accessibilityLabel: String
    let focusController: ChatComposerFocusController
    let onTextChange: (String) -> Void
    let onHeightChange: (CGFloat) -> Void
    let onSend: (String) -> Void

    func makeCoordinator() -> Coordinator {
        Coordinator(parent: self)
    }

    func makeUIView(context: Context) -> UITextView {
        let textView = UITextView()
        textView.delegate = context.coordinator
        textView.backgroundColor = .clear
        textView.font = UIFont.preferredFont(forTextStyle: .body)
        textView.adjustsFontForContentSizeCategory = true
        textView.textColor = .label
        textView.tintColor = .tintColor
        textView.textContainerInset = .zero
        textView.textContainer.lineFragmentPadding = 0
        textView.returnKeyType = .send
        textView.enablesReturnKeyAutomatically = true
        textView.keyboardDismissMode = .none
        textView.isScrollEnabled = false
        textView.showsVerticalScrollIndicator = false
        textView.accessibilityIdentifier = "chat-composer-field"
        textView.accessibilityLabel = context.coordinator.resolvedAccessibilityLabel(
            base: accessibilityLabel
        )
        textView.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
        textView.setContentHuggingPriority(.defaultLow, for: .horizontal)
        textView.text = text
        textView.selectedRange = NSRange(location: text.utf16.count, length: 0)
        context.coordinator.rememberSelection(textView.selectedRange, in: textView)
        context.coordinator.appliedResetVersion = resetVersion
        focusController.attach(textView)
        return textView
    }

    static func dismantleUIView(_ uiView: UITextView, coordinator: Coordinator) {
        coordinator.parent.focusController.detach(uiView)
    }

    func updateUIView(_ textView: UITextView, context: Context) {
        context.coordinator.parent = self

        if context.coordinator.appliedResetVersion != resetVersion,
           textView.markedTextRange == nil
        {
            context.coordinator.appliedResetVersion = resetVersion
            let selectedRange = textView.selectedRange
            if textView.text != text {
                textView.text = text
            }
            textView.selectedRange = NSRange(
                location: min(selectedRange.location, textView.text.utf16.count),
                length: 0
            )
            context.coordinator.rememberSelection(textView.selectedRange, in: textView)
            context.coordinator.scheduleHeightUpdate(for: textView, force: true)
        }

        textView.isEditable = !isBlocked
        textView.accessibilityLabel = context.coordinator.resolvedAccessibilityLabel(
            base: accessibilityLabel
        )

        context.coordinator.scheduleHeightUpdate(for: textView)
    }

    @MainActor
    final class Coordinator: NSObject, UITextViewDelegate {
        var parent: ChatComposerUIKitTextView
        var appliedResetVersion = 0
        private var lastMeasuredWidth: CGFloat = 0
        private var lastReportedHeight = ChatComposerUIKitTextView.minimumHeight
        private var isHeightUpdateScheduled = false
        private var lastSelectedRange = NSRange(location: 0, length: 0)
        #if DEBUG
        private let recordsInputLatency = ProcessInfo.processInfo.arguments.contains(
            "--ui-testing-chat-input-diagnostics"
        )
        private var inputStartedAt: CFTimeInterval?
        private var inputSequence = 0
        private var measuredInputSequence = 0
        private var latestInputLatencyMilliseconds: Double?
        #endif

        init(parent: ChatComposerUIKitTextView) {
            self.parent = parent
        }

        func textViewDidBeginEditing(_ textView: UITextView) {
            let restoredSelection = clampedSelection(in: textView)
            textView.selectedRange = restoredSelection
            DispatchQueue.main.async { [weak self, weak textView] in
                guard let self, let textView, textView.isFirstResponder else { return }
                textView.selectedRange = restoredSelection
                self.rememberSelection(restoredSelection, in: textView)
            }
        }

        func textViewShouldBeginEditing(_ textView: UITextView) -> Bool {
            !parent.isBlocked
        }

        func textViewDidChange(_ textView: UITextView) {
            #if DEBUG
            let startedAt = inputStartedAt
            let sequence = inputSequence
            inputStartedAt = nil
            #endif
            if parent.text != textView.text {
                parent.onTextChange(textView.text)
            }
            rememberSelection(textView.selectedRange, in: textView)
            updateHeight(for: textView)
            #if DEBUG
            if recordsInputLatency, let startedAt {
                DispatchQueue.main.async { [weak self, weak textView] in
                    guard let self, let textView,
                          sequence == self.inputSequence
                    else { return }
                    self.measuredInputSequence = sequence
                    self.latestInputLatencyMilliseconds =
                        (CACurrentMediaTime() - startedAt) * 1_000
                    textView.accessibilityLabel = self.resolvedAccessibilityLabel(
                        base: self.parent.accessibilityLabel
                    )
                }
            }
            #endif
        }

        func textViewDidChangeSelection(_ textView: UITextView) {
            guard textView.isFirstResponder else { return }
            rememberSelection(textView.selectedRange, in: textView)
        }

        func textView(
            _ textView: UITextView,
            shouldChangeTextIn range: NSRange,
            replacementText replacement: String
        ) -> Bool {
            #if DEBUG
            if recordsInputLatency, replacement != "\n" {
                inputSequence &+= 1
                inputStartedAt = CACurrentMediaTime()
            }
            #endif
            guard replacement == "\n", textView.markedTextRange == nil else {
                return !parent.isBlocked
            }

            let message = textView.text ?? ""
            guard !message.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
                  !parent.isBlocked
            else { return false }

            textView.text = ""
            parent.onTextChange("")
            lastSelectedRange = NSRange(location: 0, length: 0)
            scheduleHeightUpdate(for: textView, force: true)
            parent.onSend(message)
            return false
        }

        func resolvedAccessibilityLabel(base: String) -> String {
            #if DEBUG
            if recordsInputLatency, let latestInputLatencyMilliseconds {
                return "\(base) [input-sequence=\(measuredInputSequence);input-latency-ms=\(String(format: "%.3f", latestInputLatencyMilliseconds))]"
            }
            #endif
            return base
        }

        func rememberSelection(_ range: NSRange, in textView: UITextView) {
            let textLength = textView.text.utf16.count
            lastSelectedRange = NSRange(
                location: min(range.location, textLength),
                length: min(range.length, max(textLength - min(range.location, textLength), 0))
            )
        }

        private func clampedSelection(in textView: UITextView) -> NSRange {
            let textLength = textView.text.utf16.count
            let location = min(lastSelectedRange.location, textLength)
            return NSRange(
                location: location,
                length: min(lastSelectedRange.length, max(textLength - location, 0))
            )
        }

        func updateHeight(for textView: UITextView) {
            guard textView.bounds.width > 0 else { return }
            lastMeasuredWidth = textView.bounds.width
            let contentHeight = ceil(textView.contentSize.height)
            let height = min(
                max(contentHeight, ChatComposerUIKitTextView.minimumHeight),
                ChatComposerUIKitTextView.maximumHeight
            )
            let shouldScroll = contentHeight > ChatComposerUIKitTextView.maximumHeight + 0.5
            if textView.isScrollEnabled != shouldScroll {
                textView.isScrollEnabled = shouldScroll
            }
            guard abs(lastReportedHeight - height) > 0.5 else { return }
            lastReportedHeight = height
            parent.onHeightChange(height)
        }

        func scheduleHeightUpdate(for textView: UITextView, force: Bool = false) {
            guard textView.bounds.width > 0,
                  (force || abs(lastMeasuredWidth - textView.bounds.width) > 0.5),
                  !isHeightUpdateScheduled
            else { return }

            isHeightUpdateScheduled = true
            DispatchQueue.main.async { [weak self, weak textView] in
                guard let self, let textView else { return }
                self.isHeightUpdateScheduled = false
                self.updateHeight(for: textView)
            }
        }
    }
}

private struct DirectMessageBubble: View {
    let message: NativeDirectMessage
    let isMine: Bool
    var showSenderName: Bool = true
    let showAvatar: Bool
    let connectsAbove: Bool
    let connectsBelow: Bool
    var avatarURL: String? = nil
    let currentUserID: String
    let status: NativeMessageSendStatus?
    let isActingOnPlan: Bool
    let onOpenProfile: () -> Void
    let onReply: () -> Void
    let onRetry: () -> Void
    let onDelete: () -> Void
    let onReport: () -> Void
    let onCopy: (String) -> Void
    let onOpenImage: (URL) -> Void
    let onAcceptPlan: (String) -> Void
    let onDeclinePlan: (String) -> Void
    let onCounterPlan: (NativePlanRequest) -> Void
    let onOpenCalendar: () -> Void
    let onOpenScheduleShare: (String) -> Void

    private var canRetrySend: Bool {
        status == .failed && message.type == "TEXT" && !(message.body?.isEmpty ?? true)
    }

    var body: some View {
        HStack(alignment: .top, spacing: 8) {
            if !isMine {
                if showAvatar {
                    Button(action: onOpenProfile) {
                        InitialAvatar(
                            name: message.sender.displayName,
                            url: avatarURL ?? message.sender.avatarUrl,
                            size: 32
                        )
                    }
                    .buttonStyle(.plain)
                    .accessibilityIdentifier("chat-avatar-\(message.id)")
                    .accessibilityLabel(String(localized: "\(message.sender.displayName) profile"))
                } else {
                    Color.clear
                        .frame(width: 32, height: 1)
                        .accessibilityHidden(true)
                }
            }

            if isMine { Spacer(minLength: 48) }
            VStack(alignment: isMine ? .trailing : .leading, spacing: 4) {
                if showSenderName, !isMine {
                    Button(action: onOpenProfile) {
                        Text(message.sender.displayName)
                            .font(.caption2.weight(.semibold))
                            .foregroundStyle(.secondary)
                    }
                    .buttonStyle(.plain)
                }

                contextualBubble

                if status == .sending {
                    Text("Sending…")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                } else if status == .failed {
                    if canRetrySend {
                        Button(action: onRetry) {
                            Text("Not delivered · Tap to retry")
                                .font(.caption2)
                                .foregroundStyle(SideSeatTheme.danger)
                        }
                        .buttonStyle(.plain)
                        .accessibilityIdentifier("chat-retry-\(message.id)")
                    } else {
                        Text("Not delivered")
                            .font(.caption2)
                            .foregroundStyle(SideSeatTheme.danger)
                    }
                }

            }
            if !isMine { Spacer(minLength: 48) }
        }
        .accessibilityElement(children: .contain)
    }

    private var contextualBubble: some View {
        ChatMessageContextMenuTarget(isEnabled: !message.isDeleted) {
            bubbleBody
                .accessibilityElement(children: .contain)
                .accessibilityIdentifier("chat-bubble-\(message.id)")
        } menu: {
            messageContextMenu
        }
            .accessibilityAction(named: Text(String(localized: "Reply"))) {
                if !message.isDeleted { onReply() }
            }
            .accessibilityAction(named: Text(String(localized: "Report"))) {
                if !isMine && !message.isDeleted { onReport() }
            }
            .modifier(ChatDeleteAccessibilityAction(
                enabled: isMine && !message.isDeleted,
                action: onDelete
            ))
    }

    @ViewBuilder
    private var messageContextMenu: some View {
        if !message.isDeleted {
            Button {
                onReply()
            } label: {
                Label("Reply", systemImage: "arrowshape.turn.up.left")
            }
            .accessibilityIdentifier("chat-reply-\(message.id)")
            if message.type == "TEXT",
               let body = message.body?.trimmingCharacters(in: .whitespacesAndNewlines),
               !body.isEmpty
            {
                Button {
                    onCopy(body)
                } label: {
                    Label("Copy", systemImage: "doc.on.doc")
                }
                .accessibilityIdentifier("chat-copy-\(message.id)")
            }
        }
        if !message.isDeleted {
            Divider()
        }
        if !isMine && !message.isDeleted {
            Button(role: .destructive) {
                onReport()
            } label: {
                Label("Report", systemImage: "flag")
            }
            .accessibilityIdentifier("chat-report-\(message.id)")
        }
        if isMine && !message.isDeleted {
            Button(role: .destructive) {
                onDelete()
            } label: {
                Label("Delete", systemImage: "trash")
            }
            .accessibilityIdentifier("chat-delete-\(message.id)")
        }
    }

    @ViewBuilder
    private var bubbleBody: some View {
        if message.isDeleted {
            Text("Message deleted")
                .font(.body.italic())
                .padding(.horizontal, 12)
                .padding(.vertical, 8)
                .background(bubbleFill, in: bubbleShape)
                .foregroundStyle(isMine ? Color.white.opacity(0.9) : Color.secondary)
                .accessibilityIdentifier("chat-tombstone-\(message.id)")
        } else if message.type == "IMAGE" {
            VStack(alignment: isMine ? .trailing : .leading, spacing: 6) {
                if let reply = message.replyTo {
                    replyStrip(reply)
                        .padding(.horizontal, 4)
                }
                ChatMessageImageView(imageURL: message.imageUrl) {
                    if let url = resolvableURL(message.imageUrl) {
                        onOpenImage(url)
                    }
                }
                if let caption = message.body?.trimmingCharacters(in: .whitespacesAndNewlines), !caption.isEmpty {
                    Text(caption)
                        .font(.body)
                        .padding(.horizontal, 12)
                        .padding(.vertical, 8)
                        .background(bubbleFill, in: bubbleShape)
                        .foregroundStyle(isMine ? Color.white : Color.primary)
                }
            }
        } else if message.type == "LOCATION" {
            VStack(alignment: isMine ? .trailing : .leading, spacing: 6) {
                if let reply = message.replyTo {
                    replyStrip(reply)
                }
                if let location = message.location {
                    ChatLocationBubble(location: location, isMine: isMine)
                } else {
                    Text(String(localized: "Location"))
                        .font(.footnote.weight(.medium))
                        .padding(.horizontal, 12)
                        .padding(.vertical, 8)
                        .background(SideSeatTheme.fillTertiary, in: Capsule())
                        .foregroundStyle(.secondary)
                }
            }
            .accessibilityIdentifier("chat-location-\(message.id)")
        } else if (message.type == "PLAN_REQUEST_CARD" || message.type == "PLAN_CONFIRMED_CARD"),
                  let plan = message.planRequest {
            PlanCardView(
                plan: plan,
                currentUserID: currentUserID,
                isActing: isActingOnPlan,
                onAccept: { onAcceptPlan(plan.id) },
                onDecline: { onDeclinePlan(plan.id) },
                onCounter: { onCounterPlan(plan) },
                onOpenCalendar: onOpenCalendar
            )
        } else if message.type == "SCHEDULE_SHARE_CARD",
                  let shareURL = message.body?.trimmingCharacters(in: .whitespacesAndNewlines),
                  !shareURL.isEmpty {
            ScheduleShareCardView(shareURL: shareURL, onOpenToken: onOpenScheduleShare)
        } else if message.type == "SCHEDULE_SHARE_CARD"
            || message.type == "AVAILABILITY_CARD"
            || message.type == "PLAN_REQUEST_CARD"
            || message.type == "PLAN_CONFIRMED_CARD"
            || message.type == "SYSTEM" {
            Text(cardPreviewText(for: message))
                .font(.footnote.weight(.medium))
                .padding(.horizontal, 12)
                .padding(.vertical, 8)
                .background(SideSeatTheme.fillTertiary, in: Capsule())
                .foregroundStyle(.secondary)
                .accessibilityIdentifier("chat-card-\(message.id)")
        } else {
            VStack(alignment: .leading, spacing: 6) {
                if let reply = message.replyTo {
                    replyStrip(reply)
                }
                Text(displayBody)
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .background(bubbleFill, in: bubbleShape)
            .foregroundStyle(isMine ? Color.white : Color.primary)
        }
    }

    private var displayBody: String {
        guard let body = message.body else { return "" }
        return body
    }

    private func cardPreviewText(for message: NativeDirectMessage) -> String {
        switch message.type {
        case "SCHEDULE_SHARE_CARD": return String(localized: "Shared schedule")
        case "AVAILABILITY_CARD":
            return message.availabilityShareId == nil ? String(localized: "Availability unavailable") : String(localized: "Shared availability")
        case "PLAN_REQUEST_CARD": return String(localized: "Plan invite")
        case "PLAN_CONFIRMED_CARD": return String(localized: "Plan confirmed")
        case "SYSTEM":
            let body = message.body?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
            return body.isEmpty ? String(localized: "Update") : body
        default: return String(localized: "Message")
        }
    }

    private var bubbleFill: Color {
        isMine ? SideSeatTheme.Chat.ownBubble : SideSeatTheme.Chat.peerBubble
    }

    private var bubbleShape: ChatBubbleShape {
        ChatBubbleShape(
            isMine: isMine,
            connectsAbove: connectsAbove,
            connectsBelow: connectsBelow
        )
    }

    private func replyStrip(_ reply: NativeDirectMessageReply) -> some View {
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

    private func resolvableURL(_ value: String?) -> URL? {
        guard let value, let url = URL(string: value), url.scheme == "http" || url.scheme == "https" else {
            return nil
        }
        return url
    }
}

private struct ChatMessageImageView: View {
    let imageURL: String?
    let onTap: () -> Void

    var body: some View {
        Group {
            if isUITesting {
                placeholder
            } else if let imageURL, let url = URL(string: imageURL), url.scheme == "http" || url.scheme == "https" {
                AsyncImage(url: url) { phase in
                    switch phase {
                    case .success(let image):
                        image
                            .resizable()
                            .scaledToFill()
                    case .failure:
                        placeholder
                    case .empty:
                        placeholder
                    @unknown default:
                        placeholder
                    }
                }
            } else {
                placeholder
            }
        }
        .frame(width: 220, height: 220)
        .clipped()
        .clipShape(RoundedRectangle(cornerRadius: SideSeatTheme.Chat.bubbleRadius, style: .continuous))
        .contentShape(RoundedRectangle(cornerRadius: SideSeatTheme.Chat.bubbleRadius, style: .continuous))
        .onTapGesture(perform: onTap)
        .accessibilityIdentifier("chat-image")
    }

    private var isUITesting: Bool {
        #if DEBUG
        ProcessInfo.processInfo.arguments.contains("--ui-testing-authenticated")
        #else
        false
        #endif
    }

    private var placeholder: some View {
        ZStack {
            SideSeatTheme.fillTertiary
            Image(systemName: "photo")
                .font(.title2)
                .foregroundStyle(.secondary)
        }
    }
}

private struct ChatLocationShareSheet: View {
    @Environment(\.dismiss) private var dismiss

    let capture: ChatLocationCapture
    let onSend: (NativeChatLocation) async -> Bool

    @State private var position: MapCameraPosition = .automatic
    @State private var coordinate: CLLocationCoordinate2D?
    @State private var locationName = ""
    @State private var isLoading = true
    @State private var isSending = false
    @State private var issue: String?
    @State private var hasLoadedCoordinate = false
    @State private var lookupID = UUID()

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                ZStack {
                    mapSurface

                    Image(systemName: "mappin.circle.fill")
                        .font(.system(size: 38, weight: .semibold))
                        .symbolRenderingMode(.palette)
                        .foregroundStyle(SideSeatTheme.accent, Color.white)
                        .shadow(color: .black.opacity(0.18), radius: 4, y: 2)
                        .offset(y: -18)

                    if isLoading {
                        ProgressView()
                            .padding(14)
                            .background(.regularMaterial, in: Circle())
                    }

                    VStack {
                        HStack {
                            Spacer()
                            Button {
                                Task { await loadCurrentLocation() }
                            } label: {
                                Image(systemName: "location.fill")
                                    .font(.body.weight(.semibold))
                                    .frame(width: 42, height: 42)
                                    .background(.regularMaterial, in: Circle())
                            }
                            .buttonStyle(.plain)
                            .accessibilityLabel("Current location")
                            .accessibilityIdentifier("chat-location-current")
                        }
                        Spacer()
                    }
                    .padding(14)
                }
                .frame(maxHeight: .infinity)

                VStack(alignment: .leading, spacing: 5) {
                    Text(locationName.isEmpty ? String(localized: "Pinned location") : locationName)
                        .font(.headline)
                        .lineLimit(2)
                    if let coordinate {
                        Text(Self.coordinateLabel(coordinate))
                            .font(.caption.monospacedDigit())
                            .foregroundStyle(.secondary)
                    }
                    if let issue {
                        Text(issue)
                            .font(.caption)
                            .foregroundStyle(SideSeatTheme.danger)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, SideSeatTheme.screenHorizontal)
                .padding(.vertical, SideSeatTheme.spaceMD)
                .background(SideSeatTheme.surface)
            }
            .background(SideSeatTheme.bgGrouped)
            .navigationTitle("Share location")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
            }
            .safeAreaInset(edge: .bottom, spacing: 0) {
                SSPrimaryButton(
                    title: String(localized: "Send location"),
                    isLoading: isSending,
                    fill: .product,
                    height: 48,
                    accessibilityID: "chat-location-send"
                ) {
                    Task { await send() }
                }
                .disabled(coordinate == nil || isLoading || isSending)
                .padding(.horizontal, SideSeatTheme.screenHorizontal)
                .padding(.vertical, SideSeatTheme.spaceSM)
                .background(.bar)
            }
            .task { await loadCurrentLocation() }
        }
        .presentationDetents([.large])
        .presentationDragIndicator(.visible)
        .accessibilityIdentifier("chat-location-picker")
    }

    @ViewBuilder
    private var mapSurface: some View {
        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("--ui-testing-authenticated") {
            ZStack {
                SideSeatTheme.fillTertiary
                Image(systemName: "map")
                    .font(.system(size: 74, weight: .ultraLight))
                    .foregroundStyle(SideSeatTheme.accent.opacity(0.22))
            }
        } else {
            interactiveMap
        }
        #else
        interactiveMap
        #endif
    }

    private var interactiveMap: some View {
        Map(position: $position, interactionModes: [.pan, .zoom])
            .mapStyle(.standard(elevation: .flat))
            .onMapCameraChange(frequency: .onEnd) { context in
                guard hasLoadedCoordinate else { return }
                let next = context.region.center
                coordinate = next
                locationName = ""
                Task { await resolveName(for: next) }
            }
    }

    @MainActor
    private func loadCurrentLocation() async {
        guard !isLoading || coordinate == nil else { return }
        isLoading = true
        issue = nil
        do {
            let captured = try await capture.captureCurrentLocation()
            let next = CLLocationCoordinate2D(
                latitude: captured.latitude,
                longitude: captured.longitude
            )
            coordinate = next
            position = .region(
                MKCoordinateRegion(
                    center: next,
                    span: MKCoordinateSpan(latitudeDelta: 0.012, longitudeDelta: 0.012)
                )
            )
            await resolveName(for: next)
            hasLoadedCoordinate = true
        } catch {
            issue = error.localizedDescription
        }
        isLoading = false
    }

    @MainActor
    private func resolveName(for coordinate: CLLocationCoordinate2D) async {
        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("--ui-testing-authenticated") {
            locationName = "Marienplatz, Munich"
            return
        }
        #endif

        let requestID = UUID()
        lookupID = requestID
        do {
            let placemark = try await CLGeocoder()
                .reverseGeocodeLocation(CLLocation(latitude: coordinate.latitude, longitude: coordinate.longitude))
                .first
            guard lookupID == requestID else { return }
            let parts = [placemark?.name, placemark?.locality]
                .compactMap { $0?.trimmingCharacters(in: .whitespacesAndNewlines) }
                .filter { !$0.isEmpty }
            locationName = parts.reduce(into: [String]()) { unique, part in
                if !unique.contains(part) { unique.append(part) }
            }
            .prefix(2)
            .joined(separator: ", ")
        } catch {
            guard lookupID == requestID else { return }
            locationName = ""
        }
    }

    @MainActor
    private func send() async {
        guard let coordinate, !isSending else { return }
        isSending = true
        issue = nil
        let trimmedName = locationName.trimmingCharacters(in: .whitespacesAndNewlines)
        let sent = await onSend(
            NativeChatLocation(
                latitude: coordinate.latitude,
                longitude: coordinate.longitude,
                name: trimmedName.isEmpty ? nil : trimmedName
            )
        )
        isSending = false
        if sent {
            dismiss()
        } else {
            issue = String(localized: "Could not share this location. Try again.")
        }
    }

    private static func coordinateLabel(_ coordinate: CLLocationCoordinate2D) -> String {
        String(format: "%.5f, %.5f", coordinate.latitude, coordinate.longitude)
    }
}

private struct ChatLocationBubble: View {
    let location: NativeChatLocation
    let isMine: Bool

    var body: some View {
        Button {
            openInMaps()
        } label: {
            VStack(alignment: .leading, spacing: 6) {
                ChatLocationSnapshotView(location: location)
                .frame(width: 220, height: 120)
                .clipShape(RoundedRectangle(cornerRadius: SideSeatTheme.controlRadius, style: .continuous))

                Text(location.name ?? String(localized: "Location"))
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(isMine ? Color.white : Color.primary)
                Text("Open in Maps")
                    .font(.caption)
                    .foregroundStyle(isMine ? Color.white.opacity(0.85) : SideSeatTheme.textSecondary)
            }
            .padding(10)
            .background(
                RoundedRectangle(cornerRadius: SideSeatTheme.Chat.bubbleRadius, style: .continuous)
                    .fill(isMine ? SideSeatTheme.Chat.ownBubble : SideSeatTheme.Chat.peerBubble)
            )
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier("chat-location")
    }

    private func openInMaps() {
        var components = URLComponents(string: "http://maps.apple.com/")
        components?.queryItems = [
            URLQueryItem(name: "ll", value: "\(location.latitude),\(location.longitude)"),
            URLQueryItem(name: "q", value: location.name ?? "Location")
        ]
        if let url = components?.url {
            UIApplication.shared.open(url)
        }
    }
}

private struct ChatLocationSnapshotView: View {
    let location: NativeChatLocation
    @State private var image: UIImage?

    var body: some View {
        ZStack {
            if let image {
                Image(uiImage: image)
                    .resizable()
                    .scaledToFill()
            } else {
                ZStack {
                    Color(red: 0.90, green: 0.93, blue: 0.92)
                    Image(systemName: "map")
                        .font(.system(size: 62, weight: .ultraLight))
                        .foregroundStyle(SideSeatTheme.accent.opacity(0.20))
                }
            }

            Image(systemName: "mappin.circle.fill")
                .font(.system(size: 32, weight: .semibold))
                .symbolRenderingMode(.palette)
                .foregroundStyle(SideSeatTheme.accent, Color.white)
                .shadow(color: .black.opacity(0.18), radius: 3, y: 2)
                .offset(y: -14)
        }
        .clipped()
        .task(id: "\(location.latitude),\(location.longitude)") {
            await loadSnapshot()
        }
        .accessibilityHidden(true)
    }

    @MainActor
    private func loadSnapshot() async {
        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("--ui-testing-authenticated") { return }
        #endif

        let options = MKMapSnapshotter.Options()
        options.region = MKCoordinateRegion(
            center: CLLocationCoordinate2D(
                latitude: location.latitude,
                longitude: location.longitude
            ),
            span: MKCoordinateSpan(latitudeDelta: 0.012, longitudeDelta: 0.012)
        )
        options.size = CGSize(width: 220, height: 120)
        options.scale = UIScreen.main.scale
        options.mapType = .standard
        guard let snapshot = try? await MKMapSnapshotter(options: options).start() else { return }
        image = snapshot.image
    }
}

private struct ChatImagePreviewView: View {
    let url: URL?
    let onClose: () -> Void

    var body: some View {
        NavigationStack {
            ZStack {
                Color.black.ignoresSafeArea()
                if let url {
                    AsyncImage(url: url) { phase in
                        switch phase {
                        case .success(let image):
                            image
                                .resizable()
                                .scaledToFit()
                        case .failure:
                            ContentUnavailableView("Photo unavailable", systemImage: "photo")
                                .foregroundStyle(.white)
                        default:
                            ProgressView()
                                .tint(.white)
                        }
                    }
                }
            }
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done", action: onClose)
                        .foregroundStyle(.white)
                }
            }
            .toolbarBackground(.hidden, for: .navigationBar)
        }
    }
}

private struct UnrepliedReplyBanner: View {
    let blocked: Bool
    let sent: Int
    let max: Int

    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            Image(systemName: blocked ? "hourglass" : "bubble.left.and.bubble.right")
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(accent)
                .frame(width: 32, height: 32)
                .background(accent.opacity(0.14), in: Circle())

            VStack(alignment: .leading, spacing: 4) {
                HStack(alignment: .firstTextBaseline, spacing: 8) {
                    Text(blocked ? "Waiting for a reply" : "Before they reply")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(blocked ? SideSeatTheme.warning : SideSeatTheme.textPrimary)
                    Spacer(minLength: 4)
                    Text("\(sent) / \(max)")
                        .font(.caption2.weight(.semibold).monospacedDigit())
                        .foregroundStyle(blocked ? SideSeatTheme.warning : SideSeatTheme.textSecondary)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 3)
                        .background(accent.opacity(0.12), in: Capsule())
                }

                Text(
                    blocked
                        ? "Wait for a reply before sending more."
                        : "You can send up to 2 messages before they reply."
                )
                .font(.caption)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)

                HStack(spacing: 5) {
                    ForEach(0..<max, id: \.self) { index in
                        Capsule()
                            .fill(index < sent ? accent.opacity(0.75) : SideSeatTheme.fillTertiary)
                            .frame(height: 4)
                    }
                }
                .padding(.top, 4)
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
        .background(
            RoundedRectangle(cornerRadius: SideSeatTheme.Chat.bubbleRadius, style: .continuous)
                .fill(accent.opacity(0.08))
        )
        .overlay(
            RoundedRectangle(cornerRadius: SideSeatTheme.Chat.bubbleRadius, style: .continuous)
                .strokeBorder(accent.opacity(0.18), lineWidth: 1)
        )
    }

    private var accent: Color {
        blocked ? SideSeatTheme.warning : SideSeatTheme.accent
    }
}

private struct ChatDeleteAccessibilityAction: ViewModifier {
    let enabled: Bool
    let action: () -> Void

    func body(content: Content) -> some View {
        if enabled {
            content.accessibilityAction(named: Text(String(localized: "Delete")), action)
        } else {
            content
        }
    }
}

extension Notification.Name {
    static let sideSeatChatScrollToBottom = Notification.Name("sideSeatChatScrollToBottom")
    static let sideSeatInboxConversationRead = Notification.Name("sideSeatInboxConversationRead")
    /// Outbound (or inbound) message should refresh the matching inbox row preview.
    static let sideSeatInboxConversationUpdated = Notification.Name("sideSeatInboxConversationUpdated")
    /// A chat push arrived while the app is active or was opened by the user.
    static let sideSeatInboxNeedsRefresh = Notification.Name("sideSeatInboxNeedsRefresh")
    /// A remote notification arrived while SideSeat is in the foreground.
    static let sideSeatForegroundPushReceived = Notification.Name("sideSeatForegroundPushReceived")
    /// A confirmed plan changed the signed-in user's calendar.
    static let sideSeatCalendarNeedsRefresh = Notification.Name("sideSeatCalendarNeedsRefresh")
    /// A plan was accepted or declined and the plan center should reload.
    static let sideSeatPlansNeedsRefresh = Notification.Name("sideSeatPlansNeedsRefresh")
    static let sideseatReplayProductTutorial = Notification.Name("sideseatReplayProductTutorial")
}
