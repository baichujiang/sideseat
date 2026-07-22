import Foundation
import Observation

@MainActor
@Observable
final class PlansStore {
    private(set) var plans: [NativePlanRequest] = []
    private(set) var isLoading = false
    private(set) var issue: String?

    func load(using session: SessionStore) async {
        isLoading = true
        issue = nil
        defer { isLoading = false }

        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("--ui-testing-authenticated") {
            plans = [
                NativePlanRequest(
                    id: "ui-plan-1",
                    connectionId: "ui-connection",
                    status: "PENDING",
                    planType: "STUDY",
                    title: "Library study",
                    location: "Central Library",
                    message: "Bring notes",
                    startTime: "2026-07-18T14:00:00.000Z",
                    endTime: "2026-07-18T15:00:00.000Z",
                    proposer: NativePlanAuthor(id: "ui-peer", username: "test_002", nickname: "Mina", avatarUrl: nil),
                    receiver: NativePlanAuthor(id: "ui-test-user", username: "test_001", nickname: "Test User", avatarUrl: nil),
                    counterOfId: nil,
                    availabilityShareId: nil,
                    scheduleShareLinkId: nil,
                    createdAt: "2026-07-17T12:04:00.000Z",
                    updatedAt: "2026-07-17T12:04:00.000Z"
                )
            ]
            return
        }
        #endif

        do {
            let response: APIEnvelope<NativePlansListPayload> = try await session.sendAuthorized("api/v1/plans")
            plans = response.data.plans
        } catch {
            issue = error.localizedDescription
        }
    }
}
