import SwiftUI

struct InboxNotificationsView: View {
    @Environment(InboxNotificationsStore.self) private var store
    @Environment(SessionStore.self) private var session
    @Environment(DeepLinkRouter.self) private var deepLinkRouter

    var body: some View {
        List {
            if let issue = store.issue {
                VStack(alignment: .leading, spacing: SideSeatTheme.spaceSM) {
                    Text(issue).font(.footnote).foregroundStyle(SideSeatTheme.danger)
                    Button("Try again") { Task { await store.refresh(using: session) } }
                        .disabled(store.isLoading)
                }
                .accessibilityIdentifier("notifications-error")
            }
            if store.items.isEmpty {
                if store.isLoading {
                    SSLoadingState("Loading notifications").ssListPageStateRow()
                } else if store.issue == nil {
                    SSEmptyState(title: "No notifications", systemImage: "bell",
                        description: "Plan invitations, changes and account updates will appear here.")
                        .frame(maxWidth: .infinity, minHeight: 280)
                        .ssListPageStateRow()
                        .accessibilityIdentifier("notifications-empty")
                }
            } else {
                ForEach(store.items) { item in
                    Button {
                        store.markRead(item.id)
                        if let route = item.destination.route { deepLinkRouter.handleAppRoute(route) }
                        else { deepLinkRouter.handleAppPath("/profile") }
                    } label: {
                        HStack(alignment: .top, spacing: SideSeatTheme.spaceMD) {
                            Image(systemName: item.kind.symbol)
                                .font(.system(size: 22, weight: .medium))
                                .foregroundStyle(SideSeatTheme.Chat.greetingIcon)
                                .frame(width: 44, height: 44)
                                .background(SideSeatTheme.Chat.greetingTile, in: RoundedRectangle(cornerRadius: SideSeatTheme.controlRadius))
                                .accessibilityHidden(true)
                            VStack(alignment: .leading, spacing: SideSeatTheme.spaceXS) {
                                Text(item.kind.title)
                                    .font(.body.weight(item.isRead ? .regular : .semibold))
                                    .foregroundStyle(SideSeatTheme.textPrimary)
                                if !item.detail.isEmpty {
                                    Text(item.detail).font(.subheadline).foregroundStyle(SideSeatTheme.textSecondaryStrong)
                                }
                                Text(item.date, format: .dateTime.month().day().hour().minute())
                                    .font(.caption).foregroundStyle(SideSeatTheme.textSecondaryStrong)
                            }
                            Spacer(minLength: 0)
                            if !item.isRead {
                                Circle().fill(SideSeatTheme.attention).frame(width: 8, height: 8)
                                    .padding(.top, 8).accessibilityHidden(true)
                            }
                        }
                        .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
                        .padding(.vertical, SideSeatTheme.spaceSM)
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityElement(children: .combine)
                    .accessibilityValue(item.isRead ? AppLocalization.string("Read") : AppLocalization.string("Unread"))
                    .accessibilityHint("Open related details")
                    .accessibilityIdentifier("notification-\(item.id)")
                }
            }
        }
        .listStyle(.plain)
        .navigationTitle("Notifications")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button { store.markAllRead() } label: {
                    Label("Mark all as read", systemImage: "checkmark.message")
                }
                    .ssToolbarAction()
                    .disabled(store.unreadCount == 0)
                    .accessibilityIdentifier("notifications-read-all")
            }.ssStandaloneAction()
        }
        .refreshable { await store.refresh(using: session) }
        .task { await store.refresh(using: session) }
        .accessibilityIdentifier("notifications-list")
    }
}
