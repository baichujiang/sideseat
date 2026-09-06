import SwiftUI

enum ChatCreationSymbol {
    static let addFriend = "person.crop.circle.badge.plus"
    static let newGroup = "person.2.badge.plus"
}

struct ChatsRootView: View {
    @Environment(SessionStore.self) private var session
    @Environment(RouterPath.self) private var router
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    @Bindable var store: InboxStore

    var body: some View {
        Group {
            if let payload = store.payload {
                if store.visibleConversations.isEmpty,
                   payload.plansNeedingYourAction == 0,
                   (payload.actionResponseSummary?.unseenVisibleInterestCount ?? 0) == 0
                {
                    SSEmptyState(
                        title: "No conversations",
                        systemImage: "bubble.left.and.bubble.right",
                        description: "Conversations appear here after you both choose to do something together."
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
                        if payload.plansNeedingYourAction > 0 {
                            Section {
                                pendingPlansRow(count: payload.plansNeedingYourAction)
                            }
                            .listRowInsets(EdgeInsets(top: 8, leading: 16, bottom: 4, trailing: 16))
                            .listRowSeparator(.hidden)
                            .listRowBackground(Color.clear)
                        }
                        if let summary = payload.actionResponseSummary,
                           summary.unseenVisibleInterestCount > 0
                        {
                            Section {
                                actionResponsesRow(summary)
                            }
                            .listRowInsets(EdgeInsets(top: 4, leading: 16, bottom: 4, trailing: 16))
                            .listRowSeparator(.hidden)
                            .listRowBackground(Color.clear)
                        }

                        if store.hasNoSearchMatches {
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
                                Section {
                                    ForEach(store.pinned) { row in
                                        inboxRow(row)
                                    }
                                } header: {
                                    inboxSectionHeader("Pinned")
                                }
                            }
                            Section {
                                ForEach(store.recent) { row in
                                    inboxRow(row)
                                }
                            } header: {
                                if !store.pinned.isEmpty {
                                    inboxSectionHeader("Recent")
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
                    Label("Messages unavailable", systemImage: "wifi.exclamationmark")
                } description: {
                    Text(issue)
                } actions: {
                    SSPrimaryButton(
                        title: AppLocalization.string( "Try again"),
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
        .searchable(
            text: $store.searchQuery,
            placement: .navigationBarDrawer(displayMode: .always),
            prompt: "Search messages"
        )
        .ssRootSearchSurface()
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

    private func inboxSectionHeader(_ title: LocalizedStringKey) -> some View {
        Text(title)
            .font(.subheadline.weight(.semibold))
            .foregroundStyle(SideSeatTheme.textSecondaryStrong)
            .textCase(nil)
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

    private func pendingPlansRow(count: Int) -> some View {
        Button {
            router.navigate(to: .plans)
        } label: {
            Group {
                if dynamicTypeSize.isAccessibilitySize {
                    HStack(alignment: .top, spacing: SideSeatTheme.spaceMD) {
                        pendingPlansIcon(size: 36)

                        Text("Plans waiting for your response")
                        .font(.body.weight(.semibold))
                        .foregroundStyle(SideSeatTheme.textPrimary)
                        .fixedSize(horizontal: false, vertical: true)

                        Spacer(minLength: SideSeatTheme.spaceXS)
                        pendingPlansCountBadge(count)
                    }
                } else {
                    HStack(spacing: SideSeatTheme.spaceMD) {
                        pendingPlansIcon(size: 42)

                        VStack(alignment: .leading, spacing: SideSeatTheme.spaceXS) {
                            Text("Plans waiting for your response")
                                .font(.body.weight(.semibold))
                                .foregroundStyle(SideSeatTheme.textPrimary)
                                .fixedSize(horizontal: false, vertical: true)

                            Text("Review invitations and schedule updates")
                                .font(.footnote)
                                .foregroundStyle(SideSeatTheme.textSecondaryStrong)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)

                        pendingPlansCountBadge(count)
                    }
                }
            }
            .padding(.horizontal, SideSeatTheme.spaceLG)
            .padding(.vertical, SideSeatTheme.spaceLG)
            .frame(minHeight: 80)
            .background(
                SideSeatTheme.surface,
                in: RoundedRectangle(cornerRadius: SideSeatTheme.cardRadius, style: .continuous)
            )
            .overlay {
                RoundedRectangle(cornerRadius: SideSeatTheme.cardRadius, style: .continuous)
                    .strokeBorder(SideSeatTheme.separator.opacity(0.65), lineWidth: 0.5)
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(SSPressButtonStyle())
        .accessibilityIdentifier("inbox-pending-plans")
        .accessibilityLabel("Plans waiting for your response")
        .accessibilityValue("\(count)")
        .accessibilityHint("Open plans")
    }

    private func actionResponsesRow(_ summary: Components.Schemas.ActionResponseSummary) -> some View {
        Button {
            router.navigate(to: .actionResponses(
                actionID: summary.focus.actionId,
                interestID: summary.focus.interestId
            ))
        } label: {
            ViewThatFits(in: .horizontal) {
                HStack(spacing: SideSeatTheme.spaceMD) {
                    actionResponsesIcon
                    VStack(alignment: .leading, spacing: SideSeatTheme.spaceXS) {
                        Text("Responses to your actions")
                            .font(.body.weight(.semibold))
                            .foregroundStyle(SideSeatTheme.textPrimary)
                        Text("See who would like to join you")
                            .font(.footnote)
                            .foregroundStyle(SideSeatTheme.textSecondaryStrong)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    responseCountBadge(summary.unseenVisibleInterestCount)
                }
                VStack(alignment: .leading, spacing: SideSeatTheme.spaceSM) {
                    HStack {
                        actionResponsesIcon
                        responseCountBadge(summary.unseenVisibleInterestCount)
                    }
                    Text("Responses to your actions")
                        .font(.body.weight(.semibold))
                        .foregroundStyle(SideSeatTheme.textPrimary)
                    Text("See who would like to join you")
                        .font(.footnote)
                        .foregroundStyle(SideSeatTheme.textSecondaryStrong)
                }
            }
            .fixedSize(horizontal: false, vertical: true)
            .padding(SideSeatTheme.spaceLG)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(SideSeatTheme.surface, in: RoundedRectangle(cornerRadius: SideSeatTheme.cardRadius))
            .overlay {
                RoundedRectangle(cornerRadius: SideSeatTheme.cardRadius)
                    .strokeBorder(SideSeatTheme.separator.opacity(0.65), lineWidth: 0.5)
            }
        }
        .buttonStyle(SSPressButtonStyle())
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Responses to your actions")
        .accessibilityValue("\(summary.unseenVisibleInterestCount)")
        .accessibilityHint("Open responses")
        .accessibilityIdentifier("inbox-action-responses")
    }

    private var actionResponsesIcon: some View {
        Image(systemName: "person.2.wave.2")
            .symbolRenderingMode(.hierarchical)
            .font(.system(size: 18, weight: .semibold))
            .foregroundStyle(SideSeatTheme.accentText)
            .frame(width: 42, height: 42)
            .background(SideSeatTheme.accent.opacity(0.12), in: RoundedRectangle(cornerRadius: 12))
    }

    private func responseCountBadge(_ count: Int) -> some View {
        Text("\(count)")
            .font(.footnote.weight(.bold))
            .foregroundStyle(SideSeatTheme.accentText)
            .padding(.horizontal, 10)
            .frame(minHeight: 28)
            .background(SideSeatTheme.accent.opacity(0.12), in: Capsule())
    }

    private func pendingPlansIcon(size: CGFloat) -> some View {
        Image(systemName: "calendar.badge.clock")
            .symbolRenderingMode(.hierarchical)
            .font(.system(size: size == 36 ? 17 : 19, weight: .semibold))
            .foregroundStyle(SideSeatTheme.HubTint.plans)
            .frame(width: size, height: size)
            .background(
                SideSeatTheme.HubTint.plans.opacity(0.12),
                in: RoundedRectangle(cornerRadius: SideSeatTheme.controlRadius, style: .continuous)
            )
            .accessibilityHidden(true)
    }

    private func pendingPlansCountBadge(_ count: Int) -> some View {
        Text(count > 99 ? "99+" : "\(count)")
            .font(.subheadline.weight(.bold))
            .foregroundStyle(SideSeatTheme.ink)
            .padding(.horizontal, SideSeatTheme.spaceSM)
            .frame(minWidth: 30, minHeight: 30)
            .background(SideSeatTheme.HubTint.plans, in: Capsule())
            .accessibilityHidden(true)
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
                                .foregroundStyle(SideSeatTheme.onAccent)
                                .padding(.horizontal, 6)
                                .padding(.vertical, 2)
                                .background(Capsule().fill(SideSeatTheme.accent))
                                .accessibilityLabel(AppLocalization.string( "\(row.unreadCount) unread"))
                        }
                    }
                    if row.kind != .direct {
                        Text(row.kind == .course ? AppLocalization.string( "Course chat") : AppLocalization.string( "Group chat"))
                            .font(.caption)
                            .foregroundStyle(SideSeatTheme.textSecondaryStrong)
                            .accessibilityIdentifier("inbox-kind-visual-\(row.id)")
                    }
                }
            }
            .padding(.vertical, 4)
            .contentShape(Rectangle())
        }
        .buttonStyle(SSPressButtonStyle())
        .disabled(row.route == nil)
        .opacity(row.route == nil ? 0.55 : 1)
        .accessibilityIdentifier("inbox-row-\(row.id)")
        .ssLongPressActionMenu(
            isEnabled: row.route != nil,
            title: row.displayName
        ) {
            var actions = [
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
                Task { await store.togglePin(row, using: session) }
            } label: {
                Label(
                    row.pinned ? AppLocalization.string( "Unpin") : AppLocalization.string( "Pin"),
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
