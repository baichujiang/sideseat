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
            let formatter = ISO8601DateFormatter()
            let pendingStart = Date().addingTimeInterval(24 * 60 * 60)
            let acceptedStart = Date().addingTimeInterval(48 * 60 * 60)
            plans = [
                NativePlanRequest(
                    id: "ui-plan-1",
                    connectionId: "ui-connection",
                    status: "PENDING",
                    planType: "STUDY",
                    title: "Library study",
                    location: "Central Library",
                    message: "Bring notes",
                    startTime: formatter.string(from: pendingStart),
                    endTime: formatter.string(from: pendingStart.addingTimeInterval(60 * 60)),
                    proposer: NativePlanAuthor(id: "ui-peer", username: "test_002", nickname: "Mina", avatarUrl: nil),
                    receiver: NativePlanAuthor(id: "ui-test-user", username: "test_001", nickname: "Test User", avatarUrl: nil),
                    counterOfId: nil,
                    availabilityShareId: nil,
                    scheduleShareLinkId: nil,
                    createdAt: formatter.string(from: Date()),
                    updatedAt: formatter.string(from: Date())
                ),
                NativePlanRequest(
                    id: "ui-plan-accepted",
                    connectionId: "ui-connection",
                    status: "ACCEPTED",
                    planType: "CUSTOM",
                    title: "Dinner in town",
                    location: "Maxvorstadt",
                    message: nil,
                    startTime: formatter.string(from: acceptedStart),
                    endTime: formatter.string(from: acceptedStart.addingTimeInterval(90 * 60)),
                    proposer: NativePlanAuthor(id: "ui-test-user", username: "test_001", nickname: "Test User", avatarUrl: nil),
                    receiver: NativePlanAuthor(id: "ui-peer", username: "test_002", nickname: "Mina", avatarUrl: nil),
                    counterOfId: nil,
                    availabilityShareId: nil,
                    scheduleShareLinkId: nil,
                    createdAt: formatter.string(from: Date()),
                    updatedAt: formatter.string(from: Date())
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
