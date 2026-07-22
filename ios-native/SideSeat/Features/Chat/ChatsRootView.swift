import SwiftUI

struct ChatsRootView: View {
    @Environment(SessionStore.self) private var session
    @Environment(RouterPath.self) private var router
    @State private var store = InboxStore()
    @State private var showCreateGroup = false

    var body: some View {
        @Bindable var store = store
        Group {
            if let payload = store.payload {
                if payload.conversations.isEmpty {
                    SSEmptyState(
                        title: "No conversations",
                        systemImage: "bubble.left.and.bubble.right",
                        description: "Message someone from Discover or a profile to start chatting."
                    )
                } else if store.hasNoSearchMatches {
                    SSEmptyState(
                        title: "No matches",
                        systemImage: "magnifyingglass",
                        description: "Try a different name or message."
                    )
                    .accessibilityIdentifier("inbox-empty-no-matches")
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

                        if !store.pinned.isEmpty {
                            Section("Pinned") {
                                ForEach(store.pinned) { row in
                                    inboxRow(row)
                                }
                            }
                        }
                        Section(store.pinned.isEmpty ? String(localized: "Chats") : String(localized: "Recent")) {
                            ForEach(store.recent) { row in
                                inboxRow(row)
                            }
                        }
                    }
                    .listStyle(.plain)
                    .accessibilityIdentifier("inbox-list")
                }
            } else if store.isLoading {
                ProgressView("Loading chats")
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                ContentUnavailableView {
                    Label("Chats unavailable", systemImage: "wifi.exclamationmark")
                } description: {
                    Text(store.issue ?? String(localized: "Your conversations could not be loaded."))
                } actions: {
                    SSPrimaryButton(
                        title: String(localized: "Try again"),
                        fill: .product,
                        height: 44
                    ) {
                        Task { await store.load(using: session) }
                    }
                    .frame(maxWidth: 220)
                }
            }
        }
        .navigationTitle("Chats")
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
                        Label("Add friend", systemImage: "person.badge.plus")
                    }
                    .accessibilityIdentifier("inbox-toolbar-contacts")

                    Button {
                        showCreateGroup = true
                    } label: {
                        Label("New group", systemImage: "person.3")
                    }
                    .accessibilityIdentifier("inbox-toolbar-new-group")
                } label: {
                    Image(systemName: "plus")
                        .font(.body.weight(.semibold))
                        .frame(minWidth: 28, minHeight: 28)
                        .contentShape(Rectangle())
                }
                .accessibilityIdentifier("inbox-toolbar-more")
            }
        }
        .sheet(isPresented: $showCreateGroup) {
            GroupCreateSheet { groupChatID in
                showCreateGroup = false
                router.navigate(to: .groupChat(groupChatID: groupChatID))
            }
        }
        .refreshable { await store.load(using: session) }
        // Initial load. Returning from a pushed chat does not re-fire `onAppear` (root stayed visible).
        .onAppear {
            Task { await store.load(using: session) }
        }
        // Popping back to inbox — refresh unread from server.
        .onChange(of: router.path.count) { previous, current in
            if previous > 0, current == 0 {
                Task { await store.load(using: session) }
            }
        }
        .onReceive(NotificationCenter.default.publisher(for: .sideSeatInboxConversationRead)) { note in
            if let id = note.userInfo?["conversationID"] as? String {
                store.clearUnread(conversationID: id)
            }
        }
        .onReceive(NotificationCenter.default.publisher(for: .sideSeatInboxConversationUpdated)) { note in
            store.applyOutboundPreview(from: note)
        }
    }

    @ViewBuilder
    private func inboxQuickChips(payload: NativeInboxPayload) -> some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                chip(
                    title: String(localized: "Direct"),
                    count: payload.conversations.filter { $0.kind == .direct }.count,
                    identifier: "inbox-chip-direct"
                )
                chip(
                    title: String(localized: "Courses"),
                    count: payload.conversations.filter { $0.kind == .course }.count,
                    identifier: "inbox-chip-courses"
                )
                chip(
                    title: String(localized: "Groups"),
                    count: payload.conversations.filter { $0.kind == .group }.count,
                    identifier: "inbox-chip-groups"
                )
                Button {
                    router.navigate(to: .plans)
                } label: {
                    chipLabel(
                        title: String(localized: "Plans"),
                        count: payload.plansNeedingYourAction,
                        emphasized: payload.plansNeedingYourAction > 0
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

    private func chip(title: String, count: Int, identifier: String, emphasized: Bool = false) -> some View {
        chipLabel(title: title, count: count, emphasized: emphasized)
            .accessibilityIdentifier(identifier)
            .accessibilityLabel(String(localized: "\(title), \(count)"))
    }

    private func chipLabel(title: String, count: Int, emphasized: Bool = false) -> some View {
        HStack(spacing: 6) {
            Text(title)
                .font(.caption.weight(.semibold))
            if count > 0 {
                Text(count > 99 ? "99+" : "\(count)")
                    .font(.caption2.weight(.bold))
                    .padding(.horizontal, 6)
                    .padding(.vertical, 2)
                    .background(Capsule().fill(emphasized ? SideSeatTheme.accent : SideSeatTheme.fillSubtle))
                    .foregroundStyle(emphasized ? Color.white : Color.primary)
            }
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 7)
        .background(
            Capsule().fill(SideSeatTheme.Chat.peerBubble)
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
                                .foregroundStyle(.secondary)
                        }
                    }
                    HStack(alignment: .firstTextBaseline) {
                        Text(row.listPreview(currentUserID: session.currentUser?.id))
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                            .lineLimit(2)
                        Spacer(minLength: 8)
                        if row.unreadCount > 0 {
                            Text(row.unreadCount > 99 ? "99+" : "\(row.unreadCount)")
                                .font(.caption2.weight(.bold))
                                .foregroundStyle(.white)
                                .padding(.horizontal, 6)
                                .padding(.vertical, 2)
                                .background(Capsule().fill(SideSeatTheme.accent))
                                .accessibilityLabel(String(localized: "\(row.unreadCount) unread"))
                        }
                    }
                    if row.kind != .direct {
                        Text(row.kind == .course ? String(localized: "Course chat") : String(localized: "Group chat"))
                            .font(.caption2)
                            .foregroundStyle(.tertiary)
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
