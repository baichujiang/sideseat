import SwiftUI

struct BlockedUsersView: View {
    @Environment(SessionStore.self) private var session
    @Environment(RouterPath.self) private var router
    @State private var store = BlockedUsersStore()
    @State private var pendingUnblock: NativeBlockedUser?

    var body: some View {
        Group {
            if store.isLoading && store.blocks.isEmpty {
                SSLoadingState("Loading blocked users")
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if store.blocks.isEmpty {
                SSEmptyState(
                    title: "No blocked users",
                    systemImage: "hand.raised",
                    description: "If you block someone, they will appear here."
                )
            } else {
                List {
                    ForEach(store.blocks) { block in
                        HStack(spacing: 12) {
                            Button {
                                router.navigate(to: .profile(userID: block.blockedId))
                            } label: {
                                HStack(spacing: 12) {
                                    InitialAvatar(name: block.displayName, url: block.avatarUrl, size: 44)
                                    VStack(alignment: .leading, spacing: 2) {
                                        Text(block.displayName)
                                            .font(.body.weight(.semibold))
                                            .foregroundStyle(.primary)
                                        Text(blockedRelativeLabel(for: block.createdAt))
                                            .font(.caption)
                                            .foregroundStyle(.secondary)
                                    }
                                }
                            }
                            .buttonStyle(.plain)

                            Spacer(minLength: 8)

                            Button("Unblock") {
                                pendingUnblock = block
                            }
                            .buttonStyle(.bordered)
                            .disabled(store.isMutating)
                            .accessibilityIdentifier("blocked-users-unblock-\(block.blockedId)")
                        }
                        .accessibilityIdentifier("blocked-users-row-\(block.blockedId)")
                    }
                }
                .listStyle(.insetGrouped)
            }
        }
        .navigationTitle("Blocked users")
        .navigationBarTitleDisplayMode(.inline)
        .accessibilityIdentifier("blocked-users-root")
        .task {
            await store.load(using: session)
        }
        .refreshable {
            await store.load(using: session)
        }
        .alert(
            "Unblock \(pendingUnblock?.displayName ?? "user")?",
            isPresented: Binding(
                get: { pendingUnblock != nil },
                set: { if !$0 { pendingUnblock = nil } }
            )
        ) {
            Button("Unblock", role: .destructive) {
                guard let pendingUnblock else { return }
                Task {
                    _ = await store.unblock(pendingUnblock, using: session)
                    self.pendingUnblock = nil
                }
            }
            Button("Cancel", role: .cancel) {
                pendingUnblock = nil
            }
        } message: {
            Text("They will be able to contact you again.")
        }
        .overlay(alignment: .bottom) {
            if let issue = store.issue {
                Text(issue)
                    .font(.footnote)
                    .foregroundStyle(SideSeatTheme.danger)
                    .padding()
                    .onTapGesture { store.clearIssue() }
            }
        }
    }

    private func blockedRelativeLabel(for iso: String) -> String {
        let fractional = ISO8601DateFormatter()
        fractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let date = fractional.date(from: iso) ?? ISO8601DateFormatter().date(from: iso)
        guard let date else { return String(localized: "Blocked") }
        let relative = date.formatted(.relative(presentation: .named))
        return String(format: String(localized: "Blocked %@"), relative)
    }
}
