import SwiftUI

struct BlockedUsersView: View {
    @Environment(SessionStore.self) private var session
    @Environment(RouterPath.self) private var router
    @State private var store = BlockedUsersStore()
    @State private var pendingUnblock: NativeBlockedUser?
    @State private var showsUnblockPrompt = false

    var body: some View {
        ZStack {
            if (!store.hasLoaded || store.isLoading) && store.blocks.isEmpty {
                SSLoadingState("Loading blocked users")
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if store.blocks.isEmpty {
                SSEmptyState(
                    title: "No blocked users",
                    systemImage: "hand.raised",
                    description: "If you block someone, they will appear here."
                )
                .accessibilityIdentifier("blocked-users-empty")
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
                            .buttonStyle(SSPressButtonStyle())
                            .accessibilityIdentifier("blocked-users-row-\(block.blockedId)")

                            Spacer(minLength: 8)

                            Button("Unblock") {
                                pendingUnblock = block
                                // Let the selected value reach the prompt content before asking
                                // the window-level presenter to snapshot it.
                                Task { @MainActor in
                                    await Task.yield()
                                    guard pendingUnblock?.id == block.id else { return }
                                    showsUnblockPrompt = true
                                }
                            }
                            .buttonStyle(.bordered)
                            .disabled(store.isMutating)
                            .accessibilityIdentifier("blocked-users-unblock-\(block.blockedId)")
                        }
                    }
                }
                .listStyle(.insetGrouped)
            }
        }
        .navigationTitle("Blocked users")
        .navigationBarTitleDisplayMode(.inline)
        .task {
            await store.load(using: session)
        }
        .refreshable {
            await store.load(using: session)
        }
        .ssActionPrompt(
            isPresented: $showsUnblockPrompt,
            title: String(
                format: AppLocalization.string("Unblock %@?"),
                pendingUnblock?.displayName ?? AppLocalization.string("user")
            ),
            message: AppLocalization.string("They will be able to contact you again."),
            systemImage: "hand.raised.slash.fill",
            tint: SideSeatTheme.danger,
            onDismiss: {
                showsUnblockPrompt = false
                pendingUnblock = nil
            },
            accessibilityIdentifier: "blocked-users-unblock-prompt"
        ) {
            guard let block = pendingUnblock else { return [] }
            return [
                SSActionPromptAction(
                    id: "blocked-users-unblock-cancel",
                    title: AppLocalization.string("Cancel"),
                    role: .cancel
                ) {
                    showsUnblockPrompt = false
                    pendingUnblock = nil
                },
                SSActionPromptAction(
                    id: "blocked-users-confirm-unblock",
                    title: AppLocalization.string("Unblock"),
                    systemImage: "hand.raised.slash",
                    role: .destructive
                ) {
                    Task {
                        _ = await store.unblock(block, using: session)
                        showsUnblockPrompt = false
                        pendingUnblock = nil
                    }
                },
            ]
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
        guard let date else { return AppLocalization.string( "Blocked") }
        let relative = date.formatted(.relative(presentation: .named))
        return String(format: AppLocalization.string( "Blocked %@"), relative)
    }
}
