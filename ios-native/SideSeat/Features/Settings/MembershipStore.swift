import Foundation
import Observation

struct NativeMembership: Decodable, Sendable {
    let tier: String
    let plusExpiresAt: String?
    let alreadyRedeemed: Bool?

    var expirationDate: Date? {
        guard let plusExpiresAt else { return nil }
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter.date(from: plusExpiresAt) ?? ISO8601DateFormatter().date(from: plusExpiresAt)
    }

    var isPlus: Bool {
        tier == "PLUS" && (expirationDate ?? .distantPast) > Date()
    }

    var displayName: String { isPlus ? "Plus" : AppLocalization.string("Free membership") }
}

@MainActor
@Observable
final class MembershipStore {
    private(set) var membership: NativeMembership?
    private(set) var isLoading = false
    private(set) var isRedeeming = false
    private(set) var issue: String?
    private(set) var confirmation: String?

    func load(using session: SessionStore) async {
        guard !isLoading, !isRedeeming else { return }
        isLoading = true
        defer { isLoading = false }
        #if DEBUG
        // The simulated login has no API credentials, like the other UI fixtures.
        if ProcessInfo.processInfo.arguments.contains("--ui-testing-authenticated") {
            let plus = ProcessInfo.processInfo.arguments.contains("--ui-testing-plus-member")
            let expired = ProcessInfo.processInfo.arguments.contains("--ui-testing-plus-expired")
            membership = NativeMembership(tier: plus || expired ? "PLUS" : "FREE",
                plusExpiresAt: plus || expired ? ISO8601DateFormatter().string(from: Date().addingTimeInterval(expired ? -60 : 86400)) : nil, alreadyRedeemed: nil)
            issue = nil
            return
        }
        #endif
        do {
            let response: APIEnvelope<NativeMembership> = try await session.sendAuthorized("api/v1/me/membership")
            membership = response.data
            issue = nil
        } catch { issue = AppLocalization.string(String.LocalizationValue(error.localizedDescription)) }
    }

    func redeem(_ code: String, using session: SessionStore) async -> Bool {
        guard !isRedeeming, !isLoading else { return false }
        isRedeeming = true
        issue = nil
        confirmation = nil
        defer { isRedeeming = false }
        struct Request: Encodable { let code: String }
        do {
            let response: APIEnvelope<NativeMembership> = try await session.sendAuthorized(
                "api/v1/me/membership/redeem", method: .post,
                body: Request(code: code.trimmingCharacters(in: .whitespacesAndNewlines))
            )
            membership = response.data
            confirmation = AppLocalization.string(response.data.alreadyRedeemed == true
                ? "You have already redeemed this invitation code."
                : "Invitation redeemed. Your Plus membership is active.")
            return true
        } catch {
            if case APIClientError.server(_, let payload) = error, payload.field == "code" {
                issue = AppLocalization.string("This invitation code is invalid, expired, or fully redeemed.")
            } else { issue = AppLocalization.string(String.LocalizationValue(error.localizedDescription)) }
            return false
        }
    }
}
