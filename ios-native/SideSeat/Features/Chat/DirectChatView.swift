import PhotosUI
import SwiftUI
import UIKit

struct DirectChatView: View {
    @Environment(SessionStore.self) private var session
    @Environment(AppContainer.self) private var container
    @Environment(RouterPath.self) private var router
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
                PlanCreateSheet(connectionID: connectionID) {
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
            .sheet(item: $counterPlan) { plan in
                PlanCreateSheet(connectionID: connectionID, counterOf: plan) {
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
                ScheduleShareComposeSheet(connectionID: connectionID) {
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
                                onOpenScheduleShare: { token in
                                    openedScheduleShareToken = ScheduleShareNavToken(id: token)
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

            if showComposerTools {
                HStack(spacing: 8) {
                    PhotosPicker(selection: $selectedPhoto, matching: .images) {
                        ComposerToolLabel(title: String(localized: "Photo"), systemImage: "photo")
                    }
                    .disabled(store.isSending || store.isUnrepliedSendBlocked)
                    .accessibilityIdentifier("chat-composer-photo")

                    Button {
                        showComposerTools = false
                        Task { await sendLocation() }
                    } label: {
                        ComposerToolLabel(title: String(localized: "Location"), systemImage: "mappin.and.ellipse")
                    }
                    .disabled(store.isSending || store.isUnrepliedSendBlocked)
                    .accessibilityIdentifier("chat-composer-location")

                    Button {
                        showComposerTools = false
                        showPlanCreate = true
                    } label: {
                        ComposerToolLabel(title: String(localized: "Plan"), systemImage: "calendar.badge.plus")
                    }
                    .disabled(store.isSending || store.isUnrepliedSendBlocked)
                    .accessibilityIdentifier("chat-composer-plan")

                    Button {
                        showComposerTools = false
                        showScheduleShare = true
                    } label: {
                        ComposerToolLabel(title: String(localized: "Schedule"), systemImage: "calendar")
                    }
                    .disabled(store.isSending || store.isUnrepliedSendBlocked)
                    .accessibilityIdentifier("chat-composer-schedule-share")
                }
                .padding(.horizontal, 12)
                .padding(.top, 10)
                .transition(.move(edge: .bottom).combined(with: .opacity))
            }

            HStack(alignment: .bottom, spacing: 10) {
                Button {
                    withAnimation(.easeOut(duration: 0.18)) {
                        showComposerTools.toggle()
                    }
                    if showComposerTools {
                        composerFocused = false
                    }
                } label: {
                    Image(systemName: showComposerTools ? "xmark.circle.fill" : "plus.circle.fill")
                        .font(.system(size: 30))
                        .symbolRenderingMode(.hierarchical)
                        .foregroundStyle(.secondary)
                }
                .disabled(store.isUnrepliedSendBlocked)
                .accessibilityIdentifier("chat-composer-attach")
                .accessibilityLabel(showComposerTools ? String(localized: "Close attachments") : String(localized: "Attachments"))

                TextField(
                    replyDraft == nil ? String(localized: "Message") : String(localized: "Reply"),
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

        if !isSelfNotes {
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

    private func sendLocation() async {
        do {
            let coordinate = try await locationCapture.captureCurrentLocation()
            isNearBottom = true
            let ok = await store.sendLocation(
                latitude: coordinate.latitude,
                longitude: coordinate.longitude,
                using: session
            )
            if ok {
                replyDraft = nil
            }
            NotificationCenter.default.post(
                name: .sideSeatChatScrollToBottom,
                object: nil,
                userInfo: ["animated": true]
            )
        } catch {
            store.noteSendIssue(error.localizedDescription)
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

private struct ComposerToolLabel: View {
    let title: String
    let systemImage: String

    var body: some View {
        VStack(spacing: 6) {
            Image(systemName: systemImage)
                .font(.system(size: 20, weight: .medium))
                .foregroundStyle(.primary)
                .frame(width: 52, height: 52)
                .background(SideSeatTheme.Chat.peerBubble, in: RoundedRectangle(cornerRadius: SideSeatTheme.controlRadius, style: .continuous))
            Text(title)
                .font(.caption2)
                .foregroundStyle(.secondary)
                .lineLimit(1)
        }
        .frame(maxWidth: .infinity)
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
    let onOpenProfile: () -> Void
    let onReply: () -> Void
    let onRetry: () -> Void
    let onDelete: () -> Void
    let onReport: () -> Void
    let onOpenImage: (URL) -> Void
    let onAcceptPlan: (String) -> Void
    let onDeclinePlan: (String) -> Void
    let onCounterPlan: (NativePlanRequest) -> Void
    let onOpenScheduleShare: (String) -> Void

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
                .buttonStyle(.plain)
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
                        UIPasteboard.general.string = body
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
                        .accessibilityIdentifier("chat-location-\(message.id)")
                }
            }
        } else if (message.type == "PLAN_REQUEST_CARD" || message.type == "PLAN_CONFIRMED_CARD"),
                  let plan = message.planRequest {
            PlanCardView(
                plan: plan,
                currentUserID: currentUserID,
                isActing: isActingOnPlan,
                onAccept: { onAcceptPlan(plan.id) },
                onDecline: { onDeclinePlan(plan.id) },
                onCounter: { onCounterPlan(plan) }
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
                Text(message.body ?? "")
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .background(bubbleFill, in: RoundedRectangle(cornerRadius: SideSeatTheme.Chat.bubbleRadius, style: .continuous))
            .foregroundStyle(isMine ? Color.white : Color.primary)
        }
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

private struct ChatMessageImageView: View {
    let imageURL: String?
    let onTap: () -> Void

    var body: some View {
        Group {
            if let imageURL, let url = URL(string: imageURL), url.scheme == "http" || url.scheme == "https" {
                AsyncImage(url: url) { phase in
                    switch phase {
                    case .success(let image):
                        image
                            .resizable()
                            .scaledToFill()
                    case .failure:
                        placeholder
                    case .empty:
                        ProgressView()
                            .frame(maxWidth: .infinity, maxHeight: .infinity)
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

    private var placeholder: some View {
        ZStack {
            SideSeatTheme.fillTertiary
            Image(systemName: "photo")
                .font(.title2)
                .foregroundStyle(.secondary)
        }
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
                ZStack {
                    SideSeatTheme.accent.opacity(isMine ? 0.35 : 0.18)
                    Image(systemName: "mappin.circle.fill")
                        .font(.system(size: 34))
                        .foregroundStyle(isMine ? Color.white : SideSeatTheme.accent)
                        .shadow(radius: 2)
                }
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
    static let sideseatReplayProductTutorial = Notification.Name("sideseatReplayProductTutorial")
}
