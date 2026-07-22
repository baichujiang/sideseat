import Foundation
import Observation

struct NativeBlockedUser: Decodable, Identifiable, Hashable, Sendable {
    let id: String
    let blockedId: String
    let nickname: String?
    let username: String
    let avatarUrl: String?
    let createdAt: String

    var displayName: String {
        let trimmed = nickname?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        return trimmed.isEmpty ? username : trimmed
    }
}

struct NativeBlockedUserList: Decodable, Sendable {
    let blocks: [NativeBlockedUser]
}

struct NativeUnblockUserResult: Decodable, Sendable {
    let unblocked: Bool
    let blockedId: String
}

@MainActor
@Observable
final class BlockedUsersStore {
    private(set) var blocks: [NativeBlockedUser] = []
    private(set) var isLoading = false
    private(set) var isMutating = false
    private(set) var issue: String?

    func clearIssue() {
        issue = nil
    }

    func load(using session: SessionStore) async {
        guard !isLoading else { return }
        isLoading = true
        issue = nil
        defer { isLoading = false }

        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("--ui-testing-authenticated") {
            if blocks.isEmpty {
                blocks = [
                    NativeBlockedUser(
                        id: "ui-block-1",
                        blockedId: "ui-blocked-user",
                        nickname: "Blocked Peer",
                        username: "blocked_peer",
                        avatarUrl: nil,
                        createdAt: "2026-07-01T12:00:00.000Z"
                    )
                ]
            }
            return
        }
        #endif

        do {
            let response: APIEnvelope<NativeBlockedUserList> = try await session.sendAuthorized(
                "api/v1/me/blocks"
            )
            blocks = response.data.blocks
        } catch {
            issue = error.localizedDescription
        }
    }

    @discardableResult
    func unblock(_ block: NativeBlockedUser, using session: SessionStore) async -> Bool {
        guard !isMutating else { return false }
        isMutating = true
        issue = nil
        defer { isMutating = false }

        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("--ui-testing-authenticated") {
            blocks.removeAll { $0.id == block.id }
            return true
        }
        #endif

        do {
            let _: APIEnvelope<NativeUnblockUserResult> = try await session.sendAuthorized(
                "api/v1/me/blocks/\(block.blockedId)",
                method: .delete,
                idempotencyKey: UUID().uuidString
            )
            blocks.removeAll { $0.id == block.id }
            return true
        } catch {
            issue = error.localizedDescription
            return false
        }
    }
}
