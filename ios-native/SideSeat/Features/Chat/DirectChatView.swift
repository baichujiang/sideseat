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
    @State private var draft = ""
    @State private var replyDraft: NativeDirectMessage?
    @State private var isNearBottom = true
    @State private var knownMessageIDs: Set<String> = []
    @State private var pendingDelete: NativeDirectMessage?
    @State private var pendingReport: NativeDirectMessage?
    @State private var selectedPhoto: PhotosPickerItem?
    @State private var previewImageURL: URL?
    @State private var locationCapture = ChatLocationCapture()
    @State private var showLocationPicker = false
    @State private var showThreadSearch = false
    @State private var showRemarkEditor = false
    @State private var remarkDraft = ""
    @State private var confirmEnd = false
    @State private var confirmBlock = false
    @State private var showPlanCreate = false
    @State private var showScheduleShare = false
    @State private var openedScheduleShareToken: ScheduleShareNavToken?
    @State private var counterPlan: NativePlanRequest?
    @State private var scrollToMessageID: String?
    @State private var showComposerTools = false
    @State private var showAllAssistantChips = false
    @FocusState private var composerFocused: Bool
    @Environment(\.dismiss) private var dismiss

    private struct ScheduleShareNavToken: Identifiable, Hashable {
        let id: String
    }

    var body: some View {
        // Composer in a VStack (not safeAreaInset) so scrollTo(bottom) isn't short by one row.
        VStack(spacing: 0) {
            messageList
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            composer
        }
            .background(SideSeatTheme.bgGrouped)
            .navigationTitle(store.conversation?.displayName ?? String(localized: "Chat"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                if store.isAssistantChat {
                    ToolbarItem(placement: .principal) {
                        VStack(spacing: 2) {
                            HStack(spacing: 6) {
                                Text(store.conversation?.displayName ?? String(localized: "SideSeat Assistant"))
                                    .font(.headline)
                                    .lineLimit(1)
                                Text(String(localized: "Official"))
                                    .font(.caption2.weight(.semibold))
                                    .padding(.horizontal, 6)
                                    .padding(.vertical, 2)
                                    .background(SideSeatTheme.accent.opacity(0.14), in: Capsule())
                            }
                            Text(String(localized: "Product help · not a classmate"))
                                .font(.caption2)
                                .foregroundStyle(.secondary)
                                .lineLimit(1)
                        }
                    }
                }
            }
            .accessibilityIdentifier("direct-chat")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Menu {
                        Button {
                            showThreadSearch = true
                        } label: {
                            Label("Search chat", systemImage: "magnifyingglass")
                        }
                        .accessibilityIdentifier("direct-chat-search")

                        Divider()
                        connectionActionMenu
                    } label: {
                        Image(systemName: "ellipsis")
                            .font(.body.weight(.semibold))
                            .frame(minWidth: 28, minHeight: 28)
                            .contentShape(Rectangle())
                    }
                    .accessibilityIdentifier("direct-chat-actions")
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
            .sheet(isPresented: $showRemarkEditor) {
                NavigationStack {
                    Form {
                        TextField("Remark", text: $remarkDraft)
                            .accessibilityIdentifier("direct-remark-field")
                    }
                    .navigationTitle("Contact remark")
                    .toolbar {
                        ToolbarItem(placement: .cancellationAction) {
                            Button("Cancel") { showRemarkEditor = false }
                        }
                        ToolbarItem(placement: .confirmationAction) {
                            Button("Save") {
                                Task {
                                    let value = remarkDraft.trimmingCharacters(in: .whitespacesAndNewlines)
                                    _ = await store.updateRemark(value.isEmpty ? nil : value, using: session)
                                    showRemarkEditor = false
                                }
                            }
                            .accessibilityIdentifier("direct-remark-save")
                        }
                    }
                }
                .presentationDetents([.medium])
            }
            .confirmationDialog("End this conversation?", isPresented: $confirmEnd, titleVisibility: .visible) {
                Button("End chat", role: .destructive) {
                    Task {
                        if await store.endConnection(using: session) {
                            dismiss()
                        }
                    }
                }
                Button("Cancel", role: .cancel) {}
            }
            .confirmationDialog("Block this person?", isPresented: $confirmBlock, titleVisibility: .visible) {
                Button("Block", role: .destructive) {
                    Task {
                        if await store.blockPeer(using: session) {
                            dismiss()
                        }
                    }
                }
                Button("Cancel", role: .cancel) {}
            }
            .task(id: connectionID) {
                await store.load(
                    connectionID: connectionID,
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
            .onChange(of: selectedPhoto) { _, item in
                guard let item else { return }
                showComposerTools = false
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
    }

    private var messageList: some View {
        ScrollViewReader { proxy in
            ZStack(alignment: .bottom) {
                ScrollView {
                    LazyVStack(spacing: 8) {
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
                                    .accessibilityIdentifier("chat-day-\(day.timeIntervalSince1970)")
                            }

                            let isMine = message.sender.id == (session.currentUser?.id ?? "ui-test-user")
                            let fromAssistant = store.isAssistantChat && AssistantBot.isBot(message.sender)
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
                                avatarURL: avatarURL,
                                currentUserID: session.currentUser?.id ?? "ui-test-user",
                                status: store.sendStatuses[message.id],
                                isActingOnPlan: store.isActingOnPlan,
                                isAssistantChat: store.isAssistantChat,
                                fromAssistant: fromAssistant,
                                onOpenProfile: {
                                    guard !fromAssistant else { return }
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
                                },
                                onOpenAssistantLink: { href in
                                    deepLinkRouter.handleAppPath(href)
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
                        .frame(width: 3)
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
                .padding(.horizontal, 12)
                .padding(.top, 8)
            }

            if store.isAssistantChat {
                AssistantQuickRepliesView(
                    keys: AssistantFaqKey.suggested(
                        isGuest: session.currentUser?.isGuest ?? false,
                        verifiedStudent: session.currentUser?.verifiedStudent ?? false,
                        compact: !showAllAssistantChips
                    ),
                    showMore: !showAllAssistantChips,
                    onSelect: { key in
                        Task {
                            _ = await store.sendFaq(key, using: session)
                            NotificationCenter.default.post(
                                name: .sideSeatChatScrollToBottom,
                                object: nil,
                                userInfo: ["animated": true]
                            )
                        }
                    },
                    onMore: { showAllAssistantChips = true }
                )
                .padding(.horizontal, 12)
                .padding(.top, 4)
                .disabled(store.isSending)
                .opacity(store.isSending ? 0.55 : 1)

                if store.isSending {
                    AssistantTypingIndicatorView()
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.horizontal, 12)
                }
            }

            if !store.isAssistantChat {
                LazyVGrid(
                    columns: [
                        GridItem(.flexible(), spacing: 8),
                        GridItem(.flexible(), spacing: 8),
                    ],
                    spacing: 8
                ) {
                    PhotosPicker(selection: $selectedPhoto, matching: .images) {
                        ComposerToolLabel(
                            title: String(localized: "Photo"),
                            systemImage: "photo",
                            accessibilityID: "chat-composer-photo"
                        )
                    }
                    .disabled(store.isSending || store.isUnrepliedSendBlocked)
                    .accessibilityIdentifier("chat-composer-photo")

                    Button {
                        showComposerTools = false
                        showLocationPicker = true
                    } label: {
                        ComposerToolLabel(
                            title: String(localized: "Location"),
                            systemImage: "mappin.and.ellipse",
                            accessibilityID: "chat-composer-location"
                        )
                    }
                    .disabled(store.isSending || store.isUnrepliedSendBlocked)
                    .accessibilityIdentifier("chat-composer-location")

                    Button {
                        showComposerTools = false
                        showPlanCreate = true
                    } label: {
                        ComposerToolLabel(
                            title: String(localized: "Plan"),
                            systemImage: "calendar.badge.plus",
                            accessibilityID: "chat-composer-plan"
                        )
                    }
                    .disabled(store.isSending || store.isUnrepliedSendBlocked)
                    .accessibilityIdentifier("chat-composer-plan")

                    Button {
                        showComposerTools = false
                        showScheduleShare = true
                    } label: {
                        ComposerToolLabel(
                            title: String(localized: "Share schedule"),
                            systemImage: "calendar.badge.clock",
                            accessibilityID: "chat-composer-schedule-share"
                        )
                    }
                    .disabled(store.isSending || store.isUnrepliedSendBlocked)
                    .accessibilityIdentifier("chat-composer-schedule-share")
                }
                .padding(.horizontal, 12)
                .padding(.top, showComposerTools ? 10 : 0)
                .frame(height: showComposerTools ? 120 : 0)
                .opacity(showComposerTools ? 1 : 0)
                .allowsHitTesting(showComposerTools)
                .accessibilityHidden(!showComposerTools)
                .accessibilityElement(children: .contain)
                .accessibilityIdentifier("chat-composer-tools")
                .transition(.move(edge: .bottom).combined(with: .opacity))
            }

            HStack(alignment: .bottom, spacing: 10) {
                Button {
                    guard !store.isAssistantChat else { return }
                    let shouldOpen = !showComposerTools
                    if shouldOpen {
                        composerFocused = false
                    }
                    withAnimation(.easeOut(duration: 0.18)) {
                        showComposerTools = shouldOpen
                    }
                } label: {
                    Image(systemName: showComposerTools ? "xmark.circle.fill" : "plus.circle.fill")
                        .font(.system(size: 30))
                        .symbolRenderingMode(.hierarchical)
                        .foregroundStyle(.secondary)
                }
                .disabled(store.isUnrepliedSendBlocked || store.isAssistantChat)
                .opacity(store.isAssistantChat ? 0.35 : 1)
                .accessibilityIdentifier("chat-composer-attach")
                .accessibilityLabel(showComposerTools ? String(localized: "Close attachments") : String(localized: "Attachments"))

                TextField(
                    replyDraft == nil
                        ? (store.isAssistantChat
                            ? String(localized: "Ask how SideSeat works…")
                            : String(localized: "Message"))
                        : String(localized: "Reply"),
                    text: $draft,
                    axis: .vertical
                )
                    .lineLimit(1...5)
                    .textFieldStyle(.plain)
                    .padding(.horizontal, 14)
                    .padding(.vertical, 10)
                    .frame(minHeight: 40)
                    .background(SideSeatTheme.Chat.peerBubble, in: RoundedRectangle(cornerRadius: SideSeatTheme.Chat.composerRadius, style: .continuous))
                    .focused($composerFocused)
                    .submitLabel(.send)
                    .disabled(store.isUnrepliedSendBlocked)
                    .onSubmit { Task { await send() } }
                    .accessibilityIdentifier("chat-composer-field")

                Button {
                    Task { await send() }
                } label: {
                    Image(systemName: "arrow.up.circle.fill")
                        .font(.system(size: 30))
                        .symbolRenderingMode(.hierarchical)
                }
                .disabled(!canSend || store.isSending || store.isUnrepliedSendBlocked)
                .accessibilityIdentifier("chat-composer-send")
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .accessibilityElement(children: .contain)
            .accessibilityIdentifier("chat-composer")
        }
        .background(.bar)
        .onChange(of: composerFocused) { _, focused in
            guard focused, showComposerTools else { return }
            withAnimation(.easeOut(duration: 0.18)) {
                showComposerTools = false
            }
        }
    }

    private var canSend: Bool {
        !draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            && !store.isUnrepliedSendBlocked
    }

    @ViewBuilder
    private var connectionActionMenu: some View {
        let friend = store.connectionActions?.friendLink
        let exchange = store.connectionActions?.contactExchange
        let isSelfNotes = store.conversation?.isSelfNotes == true
            || store.connectionActions?.isSelfNotes == true
        let isAssistant = store.isAssistantChat

        if !isSelfNotes && !isAssistant {
            if let peerID = store.conversation?.peer.id {
                Button("View profile") {
                    router.navigate(to: .profile(userID: peerID))
                }
                .accessibilityIdentifier("direct-action-profile")
            }

            Button("Edit remark") {
                remarkDraft = store.connectionActions?.remark ?? ""
                showRemarkEditor = true
            }
            .accessibilityIdentifier("direct-action-remark")

            if friend?.status == "NONE" || friend?.status == "DECLINED" || friend == nil {
                Button("Add close friend") {
                    Task { _ = await store.performFriendLink(action: "request", using: session) }
                }
            } else if friend?.status == "PENDING", friend?.role == "requester" {
                Button("Cancel friend request") {
                    Task { _ = await store.performFriendLink(action: "cancel", using: session) }
                }
            } else if friend?.status == "PENDING", friend?.role == "responder" {
                Button("Accept friend request") {
                    Task { _ = await store.performFriendLink(action: "accept", using: session) }
                }
                Button("Decline friend request", role: .destructive) {
                    Task { _ = await store.performFriendLink(action: "decline", using: session) }
                }
            }

            if exchange?.status == "NONE" || exchange?.status == "DECLINED"
                || exchange?.status == "CANCELED" || exchange == nil {
                Button("Request contact exchange") {
                    Task { _ = await store.performContactExchange(action: "request", using: session) }
                }
            } else if exchange?.status == "PENDING", exchange?.role == "requester" {
                Button("Cancel contact request") {
                    Task { _ = await store.performContactExchange(action: "cancel", using: session) }
                }
            } else if exchange?.status == "PENDING", exchange?.role == "responder" {
                Button("Accept contact exchange") {
                    Task { _ = await store.performContactExchange(action: "accept", using: session) }
                }
                Button("Decline contact exchange", role: .destructive) {
                    Task { _ = await store.performContactExchange(action: "decline", using: session) }
                }
            }

            Divider()
            Button("End chat", role: .destructive) { confirmEnd = true }
            Button("Block", role: .destructive) { confirmBlock = true }
        }
    }

    private func send() async {
        let text = draft
        guard canSend else { return }
        let reply = replyDraft
        // Clear immediately so failed rows own the text (avoid draft + bubble duplication).
        draft = ""
        replyDraft = nil
        isNearBottom = true
        composerFocused = true
        _ = await store.sendText(text, replyTo: reply, using: session)
        // Always pin to bottom after send (success or failed optimistic row).
        NotificationCenter.default.post(
            name: .sideSeatChatScrollToBottom,
            object: nil,
            userInfo: ["animated": true]
        )
    }

    private func sendPhoto(_ item: PhotosPickerItem) async {
        defer { selectedPhoto = nil }
        guard let data = try? await item.loadTransferable(type: Data.self),
              let draftImage = DiscoverImagePreprocessor.makeDraft(from: data)
        else {
            store.noteSendIssue(String(localized: "Could not prepare that photo."))
            return
        }
        // Chat upload limit is 2 MB.
        guard draftImage.data.count <= 2 * 1024 * 1024 else {
            store.noteSendIssue(String(localized: "Image is too large. Max 2 MB."))
            return
        }
        let caption = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        let ok = await store.sendImage(
            data: draftImage.data,
            mimeType: draftImage.mimeType,
            fileName: "chat-\(draftImage.id.uuidString).jpg",
            caption: caption.isEmpty ? nil : caption,
            using: session
        )
        isNearBottom = true
        if ok {
            draft = ""
            replyDraft = nil
            composerFocused = true
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

private struct ComposerToolLabel: View {
    let title: String
    let systemImage: String
    let accessibilityID: String

    var body: some View {
        HStack(spacing: 10) {
            Image(systemName: systemImage)
                .font(.system(size: 18, weight: .semibold))
                .foregroundStyle(SideSeatTheme.accent)
                .frame(width: 34, height: 34)
                .background(SideSeatTheme.accent.opacity(0.10), in: Circle())
            Text(title)
                .font(.subheadline.weight(.medium))
                .foregroundStyle(.primary)
                .lineLimit(1)
                .minimumScaleFactor(0.8)
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 10)
        .frame(maxWidth: .infinity, minHeight: 52, maxHeight: 52)
        .background(
            SideSeatTheme.Chat.peerBubble,
            in: RoundedRectangle(cornerRadius: 8, style: .continuous)
        )
        .accessibilityElement(children: .combine)
        .accessibilityLabel(title)
    }
}

private struct DirectMessageBubble: View {
    let message: NativeDirectMessage
    let isMine: Bool
    var showSenderName: Bool = true
    var avatarURL: String? = nil
    let currentUserID: String
    let status: NativeMessageSendStatus?
    let isActingOnPlan: Bool
    var isAssistantChat: Bool = false
    var fromAssistant: Bool = false
    let onOpenProfile: () -> Void
    let onReply: () -> Void
    let onRetry: () -> Void
    let onDelete: () -> Void
    let onReport: () -> Void
    let onOpenImage: (URL) -> Void
    let onAcceptPlan: (String) -> Void
    let onDeclinePlan: (String) -> Void
    let onCounterPlan: (NativePlanRequest) -> Void
    let onOpenCalendar: () -> Void
    let onOpenScheduleShare: (String) -> Void
    var onOpenAssistantLink: (String) -> Void = { _ in }

    private var canRetrySend: Bool {
        status == .failed && message.type == "TEXT" && !(message.body?.isEmpty ?? true)
    }

    var body: some View {
        HStack(alignment: .top, spacing: 8) {
            if !isMine {
                Button(action: onOpenProfile) {
                    InitialAvatar(
                        name: message.sender.displayName,
                        url: avatarURL ?? message.sender.avatarUrl,
                        size: 32
                    )
                }
                .buttonStyle(fromAssistant ? .plain : .plain)
                .disabled(fromAssistant)
                .accessibilityIdentifier("chat-avatar-\(message.id)")
                .accessibilityLabel(String(localized: "\(message.sender.displayName) profile"))
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

                bubbleBody

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
        .accessibilityIdentifier("chat-bubble-\(message.id)")
        .contextMenu {
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
                        let paste =
                            fromAssistant
                            ? AssistantMessageParser.parse(body).text
                            : (isAssistantChat && isMine
                                ? AssistantMessageParser.displayUserBody(body)
                                : body)
                        UIPasteboard.general.string = paste
                    } label: {
                        Label("Copy", systemImage: "doc.on.doc")
                    }
                }
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
    private var bubbleBody: some View {
        if message.isDeleted {
            Text("Message deleted")
                .font(.body.italic())
                .padding(.horizontal, 12)
                .padding(.vertical, 8)
                .background(bubbleFill, in: RoundedRectangle(cornerRadius: SideSeatTheme.Chat.bubbleRadius, style: .continuous))
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
                        .background(bubbleFill, in: RoundedRectangle(cornerRadius: SideSeatTheme.Chat.bubbleRadius, style: .continuous))
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
                if fromAssistant, let body = message.body, message.deletedAt == nil {
                    AssistantMessageBodyView(
                        rawBody: body,
                        onOpenLink: onOpenAssistantLink
                    )
                } else {
                    Text(displayBody)
                }
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .background(bubbleFill, in: RoundedRectangle(cornerRadius: SideSeatTheme.Chat.bubbleRadius, style: .continuous))
            .foregroundStyle(isMine ? Color.white : Color.primary)
        }
    }

    private var displayBody: String {
        guard let body = message.body else { return "" }
        if isAssistantChat, isMine {
            return AssistantMessageParser.displayUserBody(body)
        }
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

private struct AssistantMessageBodyView: View {
    let rawBody: String
    let onOpenLink: (String) -> Void

    var body: some View {
        let payload = AssistantMessageParser.parse(rawBody)
        VStack(alignment: .leading, spacing: 8) {
            Text(payload.text)
                .font(.body)
                .multilineTextAlignment(.leading)
            if !payload.links.isEmpty {
                FlowLayout(spacing: 6) {
                    ForEach(payload.links, id: \.href) { link in
                        Button(link.label) {
                            onOpenLink(link.href)
                        }
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(SideSeatTheme.accent)
                        .padding(.horizontal, 10)
                        .padding(.vertical, 6)
                        .background(SideSeatTheme.accent.opacity(0.12), in: Capsule())
                        .overlay(Capsule().strokeBorder(SideSeatTheme.accent.opacity(0.22), lineWidth: 1))
                        .buttonStyle(.plain)
                    }
                }
            }
        }
        .accessibilityIdentifier("assistant-message-body")
    }
}

private struct AssistantQuickRepliesView: View {
    let keys: [AssistantFaqKey]
    let showMore: Bool
    let onSelect: (AssistantFaqKey) -> Void
    let onMore: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text(String(localized: "Quick questions"))
                    .font(.caption2.weight(.semibold))
                    .foregroundStyle(.secondary)
                    .textCase(.uppercase)
                Spacer(minLength: 8)
                if showMore {
                    Button(String(localized: "More"), action: onMore)
                        .font(.caption2.weight(.semibold))
                        .foregroundStyle(SideSeatTheme.accent)
                        .buttonStyle(.plain)
                }
            }
            FlowLayout(spacing: 6) {
                ForEach(keys, id: \.self) { key in
                    Button(key.chipTitle) {
                        onSelect(key)
                    }
                    .font(.caption.weight(.medium))
                    .foregroundStyle(SideSeatTheme.accent)
                    .padding(.horizontal, 10)
                    .padding(.vertical, 6)
                    .background(SideSeatTheme.accent.opacity(0.10), in: Capsule())
                    .overlay(Capsule().strokeBorder(SideSeatTheme.accent.opacity(0.18), lineWidth: 1))
                    .buttonStyle(.plain)
                    .disabled(false)
                    .accessibilityIdentifier("assistant-faq-\(key.rawValue)")
                }
            }
        }
        .accessibilityIdentifier("assistant-quick-replies")
    }
}

private struct AssistantTypingIndicatorView: View {
    var body: some View {
        HStack(spacing: 8) {
            HStack(spacing: 4) {
                ForEach(0..<3, id: \.self) { index in
                    Circle()
                        .fill(SideSeatTheme.accent.opacity(0.75))
                        .frame(width: 6, height: 6)
                        .opacity(0.45 + Double(index) * 0.15)
                }
            }
            Text(String(localized: "Assistant is typing…"))
                .font(.caption)
                .foregroundStyle(.secondary)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .background(SideSeatTheme.Chat.peerBubble, in: Capsule())
        .accessibilityIdentifier("assistant-typing")
        .accessibilityLabel(String(localized: "Assistant is typing…"))
    }
}

/// Simple horizontal wrapping layout for assistant chips and links.
private struct FlowLayout: Layout {
    var spacing: CGFloat = 8

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let width = proposal.width ?? 0
        var x: CGFloat = 0
        var y: CGFloat = 0
        var rowHeight: CGFloat = 0
        for subview in subviews {
            let size = subview.sizeThatFits(.unspecified)
            if x > 0, x + size.width > width {
                x = 0
                y += rowHeight + spacing
                rowHeight = 0
            }
            rowHeight = max(rowHeight, size.height)
            x += size.width + spacing
        }
        return CGSize(width: width, height: y + rowHeight)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        var x = bounds.minX
        var y = bounds.minY
        var rowHeight: CGFloat = 0
        for subview in subviews {
            let size = subview.sizeThatFits(.unspecified)
            if x > bounds.minX, x + size.width > bounds.maxX {
                x = bounds.minX
                y += rowHeight + spacing
                rowHeight = 0
            }
            subview.place(at: CGPoint(x: x, y: y), proposal: ProposedViewSize(size))
            rowHeight = max(rowHeight, size.height)
            x += size.width + spacing
        }
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
                    .foregroundStyle(isMine ? Color.white.opacity(0.85) : SideSeatTheme.accent)
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
                        .foregroundStyle(accent)
                    Spacer(minLength: 4)
                    Text("\(sent) / \(max)")
                        .font(.caption2.weight(.semibold).monospacedDigit())
                        .foregroundStyle(accent)
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
    /// A confirmed plan changed the signed-in user's calendar.
    static let sideSeatCalendarNeedsRefresh = Notification.Name("sideSeatCalendarNeedsRefresh")
    /// A plan was accepted or declined and the plan center should reload.
    static let sideSeatPlansNeedsRefresh = Notification.Name("sideSeatPlansNeedsRefresh")
    static let sideseatReplayProductTutorial = Notification.Name("sideseatReplayProductTutorial")
}
