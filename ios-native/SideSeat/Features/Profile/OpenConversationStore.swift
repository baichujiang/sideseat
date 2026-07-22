import Foundation
import Observation

@MainActor
@Observable
final class OpenConversationStore {
    private(set) var isOpening = false
    private(set) var issue: String?

    func open(
        peerID: String,
        courseID: String? = nil,
        using session: SessionStore
    ) async -> String? {
        guard !isOpening else { return nil }
        isOpening = true
        issue = nil
        defer { isOpening = false }

        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("--ui-testing-authenticated") {
            return peerID == "ui-peer" || peerID.hasPrefix("ui-")
                ? "ui-connection"
                : "ui-connection-\(peerID)"
        }
        #endif

        do {
            let response: APIEnvelope<NativeOpenConversationResult> = try await session.sendAuthorized(
                "api/v1/connections/open",
                method: .post,
                body: NativeOpenConversationRequest(peerId: peerID, courseId: courseID),
                idempotencyKey: UUID().uuidString
            )
            return response.data.connectionId
        } catch {
            issue = error.localizedDescription
            return nil
        }
    }
}
