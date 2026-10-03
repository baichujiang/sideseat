import SwiftUI
import UIKit

enum ChatCreationSymbol {
    static let addFriend = "person.crop.circle.badge.plus"
    static let newGroup = "person.2.badge.plus"
}

struct ChatsRootView: View {
    @Environment(SessionStore.self) private var session
    @Environment(RouterPath.self) private var router
    @Environment(DeepLinkRouter.self) private var deepLinkRouter
    @Bindable var store: InboxStore
    @ScaledMetric(relativeTo: .body) private var greetingTileSize: CGFloat = 54

    var body: some View {
        ZStack {
            if store.payload != nil {
                List {
                    messageRequestsEntry
                        .listRowInsets(EdgeInsets(top: 8, leading: 16, bottom: 12, trailing: 16))
                        .listRowSeparator(.hidden)
                        .listRowBackground(Color.clear)
                    if let issue = store.issue {
                        Section {
                            VStack(alignment: .leading, spacing: SideSeatTheme.spaceSM) {
                                Text(issue)
                                    .font(.footnote)
                                    .foregroundStyle(SideSeatTheme.danger)
                                SSSecondaryButton(
                                    title: AppLocalization.string("Try again"),
                                    expands: false,
                                    accessibilityID: "inbox-retry"
                                ) {
                                    Task { await loadInboxAndPrefetch() }
                                }
                                .disabled(store.isLoading)
                            }
                            .accessibilityElement(children: .contain)
                            .accessibilityIdentifier("inbox-issue-banner")
                        }
                    }
                    if store.visibleConversations.isEmpty {
                        SSEmptyState(
                            title: "No conversations",
                            systemImage: "bubble.left.and.bubble.right",
                            description: store.messageRequests.isEmpty
                                ? "Send a message about an intention to start a conversation."
                                : "Your greetings are in New greetings.",
                            actionTitle: AppLocalization.string("Open Together"),
                            actionAccessibilityID: "inbox-open-together"
                        ) {
                            deepLinkRouter.handleAppPath("/together")
                        }
                        .frame(maxWidth: .infinity, minHeight: 260)
                        .ssListPageStateRow()
                        .accessibilityElement(children: .contain)
                        .accessibilityIdentifier("inbox-empty")
                    } else if store.hasNoSearchMatches {
                        Section {
                            SSEmptyState(
                                title: "No matches",
                                systemImage: "magnifyingglass",
                                description: "Try a different name or message.",
                                actionTitle: AppLocalization.string("Clear search"),
                                actionAccessibilityID: "inbox-clear-search"
                            ) { store.searchQuery = "" }
                            .frame(maxWidth: .infinity, minHeight: 260)
                            .accessibilityElement(children: .contain)
                            .accessibilityIdentifier("inbox-empty-no-matches")
                        }
                        .listRowSeparator(.hidden)
                        .listRowBackground(Color.clear)
                    } else {
                        ForEach(store.pinned + store.recent) { row in
                            inboxRow(row)
                        }
                    }
                }
                .listStyle(.plain)
                .listSectionSpacing(.compact)
                .environment(\.defaultMinListRowHeight, 60)
                .contentMargins(.bottom, 88, for: .scrollContent)
                .scrollDismissesKeyboard(.interactively)
                .accessibilityIdentifier("inbox-list")
            } else if let issue = store.issue {
                ContentUnavailableView {
                    Label("Messages unavailable", systemImage: "wifi.exclamationmark")
                } description: {
                    Text(issue)
                } actions: {
                    SSPrimaryButton(
                        title: AppLocalization.string("Try again"),
                        fill: .product,
                        height: 44
                    ) {
                        Task { await loadInboxAndPrefetch() }
                    }
                    .frame(maxWidth: 220)
                }
            } else {
                SSLoadingState("Loading messages")
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        }
        .ssRootNavigationTitle("Messages")
        .safeAreaInset(edge: .top, spacing: 0) {
            InboxSearchHeader(text: $store.searchQuery)
        }
        .ssRootSearchSurface()
        .refreshable { await loadInboxAndPrefetch() }
        .onAppear {
            Task { await loadInboxAndPrefetch() }
        }
        .onChange(of: router.path.count) { previous, current in
            if previous > 0, current == 0 {
                Task { await loadInboxAndPrefetch() }
            }
        }
    }

    private var messageRequestsEntry: some View {
        Button { router.navigate(to: .messageRequests) } label: {
            HStack(alignment: .top, spacing: 0) {
                VStack(spacing: 8) {
                    Image(systemName: "hand.wave.fill")
                        .font(.title2.weight(.medium))
                        .foregroundStyle(SideSeatTheme.Chat.greetingIcon)
                        .frame(width: greetingTileSize, height: greetingTileSize)
                        .background(SideSeatTheme.Chat.greetingTile,
                            in: RoundedRectangle(cornerRadius: SideSeatTheme.controlRadius, style: .continuous))
                        .overlay(alignment: .topTrailing) {
                            if let count = InboxStore.badgeLabel(for: store.messageRequests.count) {
                                Text(count)
                                    .font(.caption2.weight(.semibold).monospacedDigit())
                                    .foregroundStyle(SideSeatTheme.onAttention)
                                    .padding(.horizontal, 6)
                                    .padding(.vertical, 3)
                                    .background(SideSeatTheme.attention, in: Capsule())
                                    .overlay(Capsule().stroke(SideSeatTheme.bg, lineWidth: 2))
                                    .offset(x: 8, y: -5)
                            }
                        }
                    Text("New greetings")
                        .font(.footnote.weight(.medium))
                        .foregroundStyle(SideSeatTheme.textPrimary)
                        .multilineTextAlignment(.center)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .padding(.vertical, 6)
                .frame(width: max(96, greetingTileSize + 28))
                Spacer(minLength: 0)
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(SSPressButtonStyle())
        .accessibilityLabel("New greetings")
        .accessibilityValue(String(store.messageRequests.count))
        .accessibilityIdentifier("inbox-message-requests")
    }

    private func loadInboxAndPrefetch() async {
        await store.load(using: session)
        guard let payload = store.payload else { return }
        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("--ui-testing-authenticated") {
            return
        }
        #endif
        Task {
            await DirectChatPreloader.primeAndPrefetch(
                payload: payload,
                using: session
            )
        }
    }

    private func inboxRow(_ row: NativeInboxConversation) -> some View {
        Button {
            if let route = row.route {
                if row.unreadCount > 0 {
                    ChatUnreadLaunch.stage(conversationID: row.id, unreadCount: row.unreadCount)
                }
                if store.isUnread(row) {
                    store.clearUnread(conversationID: row.id)
                }
                router.navigate(to: route)
            }
        } label: {
            HStack(spacing: 12) {
                if row.usesCompositeAvatar {
                    GroupCompositeAvatar(
                        members: row.compositeAvatarMembers,
                        size: 44
                    )
                } else {
                    InitialAvatar(
                        name: row.displayName,
                        url: row.avatarUrl,
                        size: 44
                    )
                }
                VStack(alignment: .leading, spacing: 3) {
                    HStack {
                        Text(row.displayName)
                            .font(.body.weight(.semibold))
                            .foregroundStyle(.primary)
                            .lineLimit(1)
                        if row.isSelfNotes != true && row.peer?.isPlus == true { SSPlusBadge() }
                        Spacer(minLength: 8)
                        if let date = Date.sideSeatInboxISO8601(row.lastActivityAt) {
                            Text(InboxActivityFormatting.label(for: date))
                                .font(.caption)
                                .foregroundStyle(SideSeatTheme.textSecondaryStrong)
                                .accessibilityIdentifier("inbox-date-visual-\(row.id)")
                        }
                    }
                    HStack(alignment: .firstTextBaseline) {
                        Text(row.listPreview(currentUserID: session.currentUser?.id))
                            .font(.subheadline)
                            .foregroundStyle(SideSeatTheme.textSecondaryStrong)
                            .lineLimit(2)
                            .accessibilityIdentifier("inbox-preview-visual-\(row.id)")
                        Spacer(minLength: 8)
                        if row.unreadCount > 0 {
                            Text(row.unreadCount > 99 ? "99+" : "\(row.unreadCount)")
                                .font(.caption.weight(.bold))
                                .foregroundStyle(SideSeatTheme.onAttention)
                                .padding(.horizontal, 6)
                                .padding(.vertical, 2)
                                .background(Capsule().fill(SideSeatTheme.attention))
                                .accessibilityLabel(AppLocalization.string("\(row.unreadCount) unread"))
                        } else if store.manuallyUnreadIDs.contains(row.id) {
                            Circle()
                                .fill(SideSeatTheme.attention)
                                .frame(width: 10, height: 10)
                                .accessibilityLabel("Marked as unread")
                                .accessibilityIdentifier("inbox-manual-unread-\(row.id)")
                        }
                    }
                }
            }
            .padding(.vertical, 2)
            .contentShape(Rectangle())
        }
        .buttonStyle(SSPressButtonStyle())
        .disabled(row.route == nil)
        .opacity(row.route == nil ? 0.55 : 1)
        .accessibilityIdentifier("inbox-row-\(row.id)")
        .accessibilityValue([
            row.pinned ? AppLocalization.string("Pinned") : nil,
            store.manuallyUnreadIDs.contains(row.id) ? AppLocalization.string("Marked as unread") : nil,
        ].compactMap { $0 }.joined(separator: ", "))
        .modifier(InboxListRowStyle(pinned: row.pinned))
        .ssLongPressActionMenu(
            isEnabled: row.route != nil,
            title: row.displayName
        ) {
            var actions = [
                SSLongPressAction(
                    id: "inbox-row-\(row.id)-read-menu",
                    title: AppLocalization.string(store.isUnread(row) ? "Mark as read" : "Mark as unread"),
                    systemImage: store.isUnread(row) ? "envelope.open" : "envelope.badge",
                    perform: { Task { await store.toggleUnread(row, using: session) } }
                ),
                SSLongPressAction(
                    id: "inbox-row-\(row.id)-pin-menu",
                    title: row.pinned
                        ? AppLocalization.string("Unpin")
                        : AppLocalization.string("Pin"),
                    systemImage: row.pinned ? "pin.slash.fill" : "pin.fill",
                    perform: {
                        Task { await store.togglePin(row, using: session) }
                    }
                ),
            ]
            if row.supportsHide {
                actions.append(
                    SSLongPressAction(
                        id: "inbox-row-\(row.id)-hide-menu",
                        title: AppLocalization.string("Hide"),
                        systemImage: "eye.slash",
                        role: .destructive,
                        perform: {
                            Task { await store.hide(row, using: session) }
                        }
                    )
                )
            }
            return actions
        }
        .swipeActions(edge: .trailing, allowsFullSwipe: false) {
            Button {
                Task { await store.toggleUnread(row, using: session) }
            } label: {
                Label(
                    AppLocalization.string(store.isUnread(row) ? "Mark as read" : "Mark as unread"),
                    systemImage: store.isUnread(row) ? "envelope.open" : "envelope.badge"
                )
            }
            .tint(SideSeatTheme.Chat.inboxReadAction)
            .disabled(store.isMutating)
            .accessibilityIdentifier("inbox-row-\(row.id)-read")

            Button {
                Task { await store.togglePin(row, using: session) }
            } label: {
                Label(
                    row.pinned ? AppLocalization.string("Unpin") : AppLocalization.string("Pin"),
                    systemImage: row.pinned ? "pin.slash.fill" : "pin.fill"
                )
            }
            .tint(SideSeatTheme.warning)
            .accessibilityIdentifier("inbox-row-\(row.id)-pin")

            if row.supportsHide {
                Button(role: .destructive) {
                    Task { await store.hide(row, using: session) }
                } label: {
                    Label("Hide", systemImage: "eye.slash")
                }
                .accessibilityIdentifier("inbox-row-\(row.id)-hide")
            }
        }
    }
}

struct MessageRequestsView: View {
    @Environment(SessionStore.self) private var session
    @Environment(RouterPath.self) private var router
    @Bindable var store: InboxStore
    @State private var searchQuery = ""

    private var requests: [NativeMutualOpportunity] {
        let query = searchQuery.trimmingCharacters(in: .whitespacesAndNewlines)
        return store.messageRequests.filter {
            query.isEmpty || $0.peer.displayName.localizedCaseInsensitiveContains(query)
                || ($0.messageRequest?.body.localizedCaseInsensitiveContains(query) ?? false)
        }
    }

    var body: some View {
        List {
            if let issue = store.issue {
                Section {
                    VStack(alignment: .leading, spacing: SideSeatTheme.spaceSM) {
                        Text(issue).font(.footnote).foregroundStyle(SideSeatTheme.danger)
                        Button("Try again") { Task { await store.load(using: session) } }
                            .disabled(store.isLoading)
                    }
                }
            }
            if store.payload == nil && store.isLoading {
                SSLoadingState("Loading messages").ssListPageStateRow()
            } else if store.messageRequests.isEmpty {
                SSEmptyState(
                    title: "No new greetings",
                    systemImage: "bubble.left.and.bubble.right",
                    description: "New greetings will appear here."
                )
                .frame(maxWidth: .infinity, minHeight: 260)
                .ssListPageStateRow()
                .accessibilityIdentifier("message-requests-empty")
            } else if requests.isEmpty {
                SSEmptyState(title: "No matches", systemImage: "magnifyingglass",
                    description: "Try a different name or message.")
                    .frame(maxWidth: .infinity, minHeight: 260)
                    .ssListPageStateRow()
            } else {
                ForEach(requests) { messageRequestRow($0) }
            }
        }
        .listStyle(.plain)
        .listSectionSpacing(.compact)
        .environment(\.defaultMinListRowHeight, 60)
        .contentMargins(.bottom, 88, for: .scrollContent)
        .navigationTitle("New greetings")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .principal) {
                HStack(spacing: SideSeatTheme.BrandChrome.rootTitleSpacing) {
                    Image(systemName: "hand.wave.fill")
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(SideSeatTheme.textSecondaryStrong)
                        .frame(width: SideSeatTheme.BrandChrome.rootMarkSize,
                            height: SideSeatTheme.BrandChrome.rootMarkSize)
                        .background(SideSeatTheme.fillTertiary,
                            in: RoundedRectangle(cornerRadius: SideSeatTheme.BrandChrome.rootMarkRadius,
                                style: .continuous))
                        .accessibilityHidden(true)
                    Text("New greetings")
                        .font(.headline.weight(.semibold))
                        .foregroundStyle(SideSeatTheme.textPrimary)
                        .lineLimit(1)
                }
                .accessibilityElement(children: .combine)
                .accessibilityAddTraits(.isHeader)
                .accessibilityIdentifier("new-greetings-navigation-title")
            }
        }
        .accessibilityIdentifier("message-requests-list")
        .safeAreaInset(edge: .top, spacing: 0) {
            InboxSearchHeader(text: $searchQuery)
        }
        .ssRootSearchSurface()
        .scrollDismissesKeyboard(.interactively)
        .refreshable { await store.load(using: session) }
        .onAppear { Task { await store.load(using: session) } }
    }

    private func messageRequestRow(_ opportunity: NativeMutualOpportunity) -> some View {
        Button { router.navigate(to: opportunity.conversationRoute) } label: {
            HStack(spacing: 12) {
                InitialAvatar(name: opportunity.peer.displayName, url: opportunity.peer.avatarUrl, size: 44)
                VStack(alignment: .leading, spacing: 3) {
                    HStack {
                        Text(opportunity.peer.displayName)
                            .font(.body.weight(.semibold))
                            .foregroundStyle(.primary)
                            .lineLimit(1)
                        if opportunity.peer.isPlus == true { SSPlusBadge() }
                        Spacer(minLength: 8)
                        if let value = opportunity.messageRequest?.createdAt,
                           let date = Date.sideSeatInboxISO8601(value) {
                            Text(InboxActivityFormatting.label(for: date))
                                .font(.caption)
                                .foregroundStyle(SideSeatTheme.textSecondaryStrong)
                        }
                    }
                    Text(opportunity.messageRequest?.body ?? "")
                        .font(.subheadline).foregroundStyle(SideSeatTheme.textSecondaryStrong).lineLimit(2)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
            }
            .padding(.vertical, 2)
            .contentShape(Rectangle())
        }
        .buttonStyle(SSPressButtonStyle())
        .modifier(InboxListRowStyle())
        .accessibilityIdentifier("message-request-\(opportunity.id)")
    }

}

/// Owns the search surface so its fill appears with the page, instead of the navigation
/// drawer installing its glass background after the push or tab transition.
private struct InboxSearchHeader: View {
    @Binding var text: String
    @State private var isFocused = false
    @Environment(\.colorScheme) private var colorScheme
    @ScaledMetric(relativeTo: .body) private var fieldHeight: CGFloat = 44

    var body: some View {
        HStack(spacing: 12) {
            InboxSearchTextField(text: $text, isFocused: $isFocused)
                .frame(height: fieldHeight)
                .background(colorScheme == .dark ? SideSeatTheme.fillTertiary : SideSeatTheme.bg,
                    in: Capsule())
                .overlay {
                    Capsule().strokeBorder(SideSeatTheme.separator.opacity(colorScheme == .dark ? 0.4 : 0), lineWidth: 0.5)
                }
                .shadow(color: .black.opacity(colorScheme == .dark ? 0 : 0.06), radius: 12, y: 4)
            if isFocused {
                Button("Cancel") {
                    text = ""
                    isFocused = false
                }
                .foregroundStyle(SideSeatTheme.textPrimary)
                .frame(minHeight: 44)
                .accessibilityIdentifier("inbox-search-cancel")
            }
        }
        .padding(.horizontal, 16)
        .padding(.top, 8)
        .padding(.bottom, 12)
        .background(SideSeatTheme.bg)
    }
}

/// Keeps native text editing, clear control, and the search-field accessibility role.
private struct InboxSearchTextField: UIViewRepresentable {
    @Binding var text: String
    @Binding var isFocused: Bool

    func makeUIView(context: Context) -> UISearchTextField {
        let field = UISearchTextField()
        field.attributedPlaceholder = NSAttributedString(
            string: AppLocalization.string("Search messages"),
            attributes: [.foregroundColor: UIColor.secondaryLabel])
        field.accessibilityIdentifier = "inbox-search-field"
        field.accessibilityTraits.insert(.searchField)
        field.borderStyle = .none
        field.backgroundColor = .clear
        field.font = .preferredFont(forTextStyle: .body)
        field.adjustsFontForContentSizeCategory = true
        field.autocapitalizationType = .none
        field.autocorrectionType = .no
        field.returnKeyType = .search
        field.clearButtonMode = .whileEditing
        field.delegate = context.coordinator
        field.addTarget(context.coordinator, action: #selector(Coordinator.textChanged), for: .editingChanged)
        field.setContentHuggingPriority(.defaultLow, for: .horizontal)
        field.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
        return field
    }

    func updateUIView(_ field: UISearchTextField, context: Context) {
        context.coordinator.parent = self
        if field.text != text { field.text = text }
        if !isFocused && field.isFirstResponder { field.resignFirstResponder() }
    }

    func makeCoordinator() -> Coordinator { Coordinator(parent: self) }

    final class Coordinator: NSObject, UITextFieldDelegate {
        var parent: InboxSearchTextField

        init(parent: InboxSearchTextField) { self.parent = parent }

        @objc func textChanged(_ field: UISearchTextField) { parent.text = field.text ?? "" }

        func textFieldDidBeginEditing(_ textField: UITextField) { parent.isFocused = true }
        func textFieldDidEndEditing(_ textField: UITextField) { parent.isFocused = false }
        func textFieldShouldReturn(_ textField: UITextField) -> Bool {
            textField.resignFirstResponder()
            return true
        }
    }
}

/// Shared geometry for normal chats and pending greetings.
private struct InboxListRowStyle: ViewModifier {
    @Environment(\.displayScale) private var displayScale
    var pinned = false

    func body(content: Content) -> some View {
        content
            .listRowSeparator(.hidden)
            .listRowBackground(
                (pinned ? SideSeatTheme.Chat.pinnedRow : Color(uiColor: .systemBackground))
                    .overlay(alignment: .bottom) {
                        Rectangle()
                            .fill(SideSeatTheme.Chat.inboxSeparator)
                            .frame(height: 1 / displayScale)
                            // Row inset + avatar + spacing: start at the message text.
                            .padding(.leading, 16 + 44 + 12)
                            .accessibilityHidden(true)
                    }
            )
    }
}

private extension Date {
    static func sideSeatInboxISO8601(_ value: String) -> Date? {
        let fractional = ISO8601DateFormatter()
        fractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return fractional.date(from: value) ?? ISO8601DateFormatter().date(from: value)
    }
}

/// One conversation destination: a first-message timeline becomes the normal chat after reply.
struct IntentionChatView: View {
    @Environment(SessionStore.self) private var session
    @Environment(\.scenePhase) private var scenePhase
    @Environment(\.dismiss) private var dismiss
    @State var opportunity: NativeMutualOpportunity
    @State private var store = MutualOpportunityStore()
    @State private var draft = ChatComposerDraft()
    @State private var focus = ChatComposerFocusController()
    @State private var lengthIssue = false
    @State private var showIntentionDetails = false

    private var request: NativeOpportunityMessageRequest? { opportunity.messageRequest }
    private var isMine: Bool { request?.isIncoming != true }
    private var canReply: Bool {
        request?.isIncoming == true && request?.status == "PENDING" && !opportunity.isUnavailable
    }
    private var isWorking: Bool { store.mutatingIDs.contains(opportunity.id) }

    var body: some View {
        Group {
            if let connectionID = opportunity.coordination?.connectionId {
                DirectChatView(connectionID: connectionID)
            } else {
                pendingConversation
            }
        }
        .task(id: scenePhase) {
            guard scenePhase == .active else { return }
            while !Task.isCancelled, opportunity.coordination == nil {
                await refresh()
                do { try await Task.sleep(for: .seconds(10)) } catch { return }
            }
        }
    }

    private var pendingConversation: some View {
        VStack(spacing: 0) {
            ScrollView {
                VStack(spacing: SideSeatTheme.spaceLG) {
                    Button { showIntentionDetails = true } label: {
                        HStack(spacing: SideSeatTheme.spaceMD) {
                            VStack(alignment: .leading, spacing: SideSeatTheme.spaceXS) {
                                Label(opportunity.messageActivityTitle, systemImage: opportunity.peerActivityTopic.systemImage)
                                    .font(.subheadline.weight(.semibold))
                                Text(opportunity.messageTimeSummary).font(.footnote).foregroundStyle(.secondary)
                                Text("View intention details").font(.caption).foregroundStyle(SideSeatTheme.utilityAction)
                            }
                            .frame(maxWidth: .infinity, alignment: .leading)
                            Image(systemName: "chevron.right").font(.caption.weight(.semibold)).foregroundStyle(.secondary)
                        }
                        .padding(SideSeatTheme.spaceMD)
                        .background(SideSeatTheme.surface, in: RoundedRectangle(cornerRadius: SideSeatTheme.controlRadius))
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityIdentifier("intention-chat-context")

                    if let request {
                        if let date = Date.sideSeatChatISO8601(request.createdAt) {
                            Text(date.formatted(.dateTime.month().day().hour().minute().locale(AppLocalization.selectedLanguage.locale)))
                                .font(.caption).foregroundStyle(.secondary)
                        }
                        HStack(alignment: .top, spacing: SideSeatTheme.spaceSM) {
                            if isMine { Spacer(minLength: 40) }
                            if !isMine {
                                InitialAvatar(name: opportunity.peer.displayName, url: opportunity.peer.avatarUrl, size: 32)
                            }
                            Text(request.body)
                                .font(.body)
                                .foregroundStyle(isMine ? SideSeatTheme.Chat.ownBubbleForeground : SideSeatTheme.textPrimary)
                                .textSelection(.enabled)
                                .padding(.horizontal, 14).padding(.vertical, 10)
                                .background(isMine ? SideSeatTheme.Chat.ownBubble : SideSeatTheme.Chat.peerBubble,
                                    in: ChatBubbleShape(isMine: isMine, connectsAbove: false, connectsBelow: false))
                                .accessibilityIdentifier("intention-chat-first-message")
                            if !isMine { Spacer(minLength: 40) }
                        }
                    }
                }
                .padding(SideSeatTheme.spaceMD)
            }
            .refreshable { await refresh() }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            if let issue = store.issue {
                Text(issue).font(.footnote).foregroundStyle(SideSeatTheme.danger).padding(SideSeatTheme.spaceSM)
            }
            if canReply {
                VStack(spacing: SideSeatTheme.spaceXS) {
                    Text(AppLocalization.string("Replying opens a chat with this person."))
                        .font(.footnote).foregroundStyle(.secondary)
                    if lengthIssue {
                        Text("Keep your message within 500 characters.").font(.footnote).foregroundStyle(SideSeatTheme.danger)
                    }
                    HStack(alignment: .bottom, spacing: SideSeatTheme.spaceSM) {
                        ChatComposerTextInput(draft: draft, placeholder: AppLocalization.string("Write a reply…"),
                            isBlocked: isWorking, focusController: focus) { body in
                            guard body.count <= 500 else { lengthIssue = true; return }
                            Task {
                                if let updated = await store.interact("REPLY", opportunity: opportunity, body: body, using: session) {
                                    draft.clear(); focus.blur(); opportunity = updated
                                }
                            }
                        }
                    }
                }
                .padding(SideSeatTheme.spaceMD)
                .background(SideSeatTheme.surface)
            } else {
                Label(AppLocalization.string(isMine ? "Your message has been sent. You can continue chatting after they reply." : "This intention is no longer available."), systemImage: isMine ? "clock" : "info.circle")
                    .font(.footnote).foregroundStyle(SideSeatTheme.textSecondaryStrong)
                    .fixedSize(horizontal: false, vertical: true)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(SideSeatTheme.spaceMD)
                    .background(SideSeatTheme.surface)
                    .accessibilityElement(children: .combine)
                    .accessibilityIdentifier("intention-chat-waiting")
            }
        }
        .background(SideSeatTheme.Chat.canvas)
        .sheet(isPresented: $showIntentionDetails) {
            IntentionDetailsSheet(opportunity: opportunity)
        }
        .navigationTitle(opportunity.peer.displayName)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            if canReply {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Ignore") {
                        Task {
                            if await store.interact("IGNORE", opportunity: opportunity, using: session) != nil { dismiss() }
                        }
                    }
                    .disabled(isWorking)
                    .accessibilityIdentifier("message-request-ignore-\(opportunity.id)")
                }
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("intention-chat")
    }

    private func refresh() async {
        guard !isWorking else { return }
        if let updated = await store.refreshConversation(opportunity, using: session),
           updated.version >= opportunity.version, updated != opportunity {
            opportunity = updated
            NotificationCenter.default.post(name: .sideSeatTogetherNeedsRefresh, object: nil)
            NotificationCenter.default.post(name: .sideSeatInboxNeedsRefresh, object: nil)
        }
    }
}


struct IntentionDetailsSheet: View {
    @Environment(\.dismiss) private var dismiss
    let opportunity: NativeMutualOpportunity

    var body: some View {
        NavigationStack {
            ScrollView {
                MutualOpportunityCard(opportunity: opportunity, isWorking: false,
                    onBookmark: {}, onMessage: {}, onOpenConversation: {}, showsActions: false)
                    .padding(SideSeatTheme.spaceMD)
            }
            .background(SideSeatTheme.bgGrouped)
            .navigationTitle("Intention details")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }.accessibilityIdentifier("intention-details-done")
                }
            }
        }
        .presentationDetents([.large])
        .presentationDragIndicator(.visible)
        .accessibilityIdentifier("intention-details-sheet")
    }
}
