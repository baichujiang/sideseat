import SwiftUI

enum ChatCreationSymbol {
    static let addFriend = "person.crop.circle.badge.plus"
    static let newGroup = "person.2.badge.plus"
}

struct ChatsRootView: View {
    @Environment(SessionStore.self) private var session
    @Environment(RouterPath.self) private var router
    @Bindable var store: InboxStore
    @State private var showCreateGroup = false

    var body: some View {
        Group {
            if let payload = store.payload {
                if payload.conversations.isEmpty {
                    SSEmptyState(
                        title: "No conversations",
                        systemImage: "bubble.left.and.bubble.right",
                        description: "Message someone from Discover or a profile to start chatting."
                    )
                } else {
                    List {
                        if let issue = store.issue {
                            Section {
                                Text(issue)
                                    .font(.footnote)
                                    .foregroundStyle(SideSeatTheme.danger)
                                    .accessibilityIdentifier("inbox-issue-banner")
                            }
                        }
                        Section {
                            inboxQuickChips(payload: payload)
                        }
                        .listRowInsets(EdgeInsets(top: 8, leading: 16, bottom: 4, trailing: 16))
                        .listRowSeparator(.hidden)
                        .listRowBackground(Color.clear)

                        if store.hasNoSearchMatches || store.hasNoFilterMatches {
                            Section {
                                SSEmptyState(
                                    title: "No matches",
                                    systemImage: "magnifyingglass",
                                    description: "Try a different name or message."
                                )
                                .frame(maxWidth: .infinity, minHeight: 260)
                                .accessibilityIdentifier("inbox-empty-no-matches")
                            }
                            .listRowSeparator(.hidden)
                            .listRowBackground(Color.clear)
                        } else {
                            if !store.pinned.isEmpty {
                                Section("Pinned") {
                                    ForEach(store.pinned) { row in
                                        inboxRow(row)
                                    }
                                }
                            }
                            Section {
                                ForEach(store.recent) { row in
                                    inboxRow(row)
                                }
                            } header: {
                                if !store.pinned.isEmpty {
                                    Text("Recent")
                                }
                            }
                        }
                    }
                    .listStyle(.plain)
                    .contentMargins(.bottom, 88, for: .scrollContent)
                    .accessibilityIdentifier("inbox-list")
                }
            } else if let issue = store.issue {
                ContentUnavailableView {
                    Label("Chats unavailable", systemImage: "wifi.exclamationmark")
                } description: {
                    Text(issue)
                } actions: {
                    SSPrimaryButton(
                        title: String(localized: "Try again"),
                        fill: .product,
                        height: 44
                    ) {
                        Task { await loadInboxAndPrefetch() }
                    }
                    .frame(maxWidth: 220)
                }
            } else {
                SSLoadingState("Loading chats")
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        }
        .ssRootNavigationTitle("Chats")
        .searchable(
            text: $store.searchQuery,
            placement: .navigationBarDrawer(displayMode: .always),
            prompt: "Search chats"
        )
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Menu {
                    Button {
                        router.navigate(to: .contacts)
                    } label: {
                        Label {
                            Text("Add friend")
                        } icon: {
                            Image(systemName: ChatCreationSymbol.addFriend)
                                .symbolRenderingMode(.hierarchical)
                        }
                    }
                    .accessibilityIdentifier("inbox-toolbar-contacts")

                    Button {
                        showCreateGroup = true
                    } label: {
                        Label {
                            Text("New group")
                        } icon: {
                            Image(systemName: ChatCreationSymbol.newGroup)
                                .symbolRenderingMode(.hierarchical)
                        }
                    }
                    .accessibilityIdentifier("inbox-toolbar-new-group")
                } label: {
                    Image(systemName: ChatCreationSymbol.newGroup)
                        .symbolRenderingMode(.hierarchical)
                        .font(.system(size: 17, weight: .semibold))
                        .frame(width: 32, height: 32)
                        .contentShape(Rectangle())
                }
                .accessibilityLabel("Create chat")
                .accessibilityIdentifier("inbox-toolbar-more")
            }
        }
        .sheet(isPresented: $showCreateGroup) {
            GroupCreateSheet { groupChatID in
                showCreateGroup = false
                router.navigate(to: .groupChat(groupChatID: groupChatID))
            }
        }
        .refreshable { await loadInboxAndPrefetch() }
        // Initial load. Returning from a pushed chat does not re-fire `onAppear` (root stayed visible).
        .onAppear {
            Task { await loadInboxAndPrefetch() }
        }
        // Popping back to inbox — refresh unread from server.
        .onChange(of: router.path.count) { previous, current in
            if previous > 0, current == 0 {
                Task { await loadInboxAndPrefetch() }
            }
        }
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
            async let directPrefetch: Void = DirectChatPreloader.primeAndPrefetch(
                payload: payload,
                using: session
            )
            async let communityPrefetch: Void = CommunityChatPreloader.primeAndPrefetch(
                payload: payload,
                using: session
            )
            _ = await (directPrefetch, communityPrefetch)
        }
    }

    @ViewBuilder
    private func inboxQuickChips(payload: NativeInboxPayload) -> some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(InboxConversationFilter.allCases, id: \.self) { filter in
                    let count = conversationCount(for: filter, payload: payload)
                    Button {
                        withAnimation(.easeOut(duration: 0.16)) {
                            store.conversationFilter = filter
                        }
                    } label: {
                        chipLabel(
                            title: filter.title,
                            count: count,
                            selected: store.conversationFilter == filter
                        )
                    }
                    .buttonStyle(.plain)
                    .disabled(filter != .all && count == 0)
                    .opacity(filter != .all && count == 0 ? 0.45 : 1)
                    .accessibilityIdentifier(filter.accessibilityIdentifier)
                    .accessibilityLabel(String(localized: "\(filter.title), \(count)"))
                    .accessibilityAddTraits(store.conversationFilter == filter ? .isSelected : [])
                }

                Button {
                    router.navigate(to: .plans)
                } label: {
                    chipLabel(
                        title: String(localized: "Plans"),
                        count: payload.plansNeedingYourAction,
                        emphasized: payload.plansNeedingYourAction > 0,
                        systemImage: "calendar"
                    )
                }
                .buttonStyle(.plain)
                .accessibilityIdentifier("inbox-chip-plans")
                .accessibilityLabel(String(localized: "Plans, \(payload.plansNeedingYourAction)"))
            }
            .padding(.vertical, 2)
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("inbox-quick-chips")
    }

    private func conversationCount(
        for filter: InboxConversationFilter,
        payload: NativeInboxPayload
    ) -> Int {
        guard let kind = filter.kind else { return payload.conversations.count }
        return payload.conversations.filter { $0.kind == kind }.count
    }

    private func chipLabel(
        title: String,
        count: Int,
        emphasized: Bool = false,
        selected: Bool = false,
        systemImage: String? = nil
    ) -> some View {
        HStack(spacing: 6) {
            if let systemImage {
                Image(systemName: systemImage)
                    .font(.caption.weight(.semibold))
            }
            Text(title)
                .font(.caption.weight(.semibold))
            if count > 0 {
                Text(count > 99 ? "99+" : "\(count)")
                    .font(.caption.weight(.bold))
                    .padding(.horizontal, 6)
                    .padding(.vertical, 2)
                    .background(
                        Capsule().fill(
                            selected
                                ? Color.white.opacity(0.22)
                                : (emphasized ? SideSeatTheme.accent : SideSeatTheme.fillSubtle)
                        )
                    )
                    .foregroundStyle(selected || emphasized ? SideSeatTheme.ink : Color.primary)
                    .accessibilityHidden(true)
            }
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 7)
        .frame(minHeight: 44)
        .foregroundStyle(selected ? SideSeatTheme.ink : Color.primary)
        .background(
            Capsule().fill(selected ? SideSeatTheme.accent : SideSeatTheme.Chat.controlFill)
        )
    }

    @ViewBuilder
    private func inboxRow(_ row: NativeInboxConversation) -> some View {
        Button {
            if let route = row.route {
                // Stage unread for WeChat-style ↑ jump, then clear badge optimistically.
                if row.unreadCount > 0 {
                    ChatUnreadLaunch.stage(conversationID: row.id, unreadCount: row.unreadCount)
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
                                .foregroundStyle(SideSeatTheme.ink)
                                .padding(.horizontal, 6)
                                .padding(.vertical, 2)
                                .background(Capsule().fill(SideSeatTheme.accent))
                                .accessibilityLabel(String(localized: "\(row.unreadCount) unread"))
                        }
                    }
                    if row.kind != .direct {
                        Text(row.kind == .course ? String(localized: "Course chat") : String(localized: "Group chat"))
                            .font(.caption)
                            .foregroundStyle(SideSeatTheme.textSecondaryStrong)
                            .accessibilityIdentifier("inbox-kind-visual-\(row.id)")
                    }
                }
            }
            .padding(.vertical, 4)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .disabled(row.route == nil)
        .opacity(row.route == nil ? 0.55 : 1)
        .accessibilityIdentifier("inbox-row-\(row.id)")
        .contextMenu {
            Button {
                Task { await store.togglePin(row, using: session) }
            } label: {
                Label(
                    row.pinned ? String(localized: "Unpin") : String(localized: "Pin"),
                    systemImage: row.pinned ? "pin.slash.fill" : "pin.fill"
                )
            }
            .accessibilityIdentifier("inbox-row-\(row.id)-pin-menu")

            if row.supportsHide {
                Button(role: .destructive) {
                    Task { await store.hide(row, using: session) }
                } label: {
                    Label("Hide", systemImage: "eye.slash")
                }
                .accessibilityIdentifier("inbox-row-\(row.id)-hide-menu")
            }
        }
        .swipeActions(edge: .trailing, allowsFullSwipe: false) {
            Button {
                Task { await store.togglePin(row, using: session) }
            } label: {
                Label(
                    row.pinned ? String(localized: "Unpin") : String(localized: "Pin"),
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

private extension Date {
    static func sideSeatInboxISO8601(_ value: String) -> Date? {
        let fractional = ISO8601DateFormatter()
        fractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return fractional.date(from: value) ?? ISO8601DateFormatter().date(from: value)
    }
}
