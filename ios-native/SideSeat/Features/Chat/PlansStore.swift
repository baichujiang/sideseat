import Foundation
import Observation

@MainActor
@Observable
final class PlansStore {
    private(set) var plans: [NativePlanRequest] = []
    private(set) var isLoading = false
    private(set) var hasLoaded = false
    private(set) var issue: String?
    private(set) var mutatingOutcomeID: String?

    func load(using session: SessionStore) async {
        isLoading = true
        issue = nil
        defer {
            isLoading = false
            hasLoaded = true
        }

        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("--ui-testing-authenticated") {
            let formatter = ISO8601DateFormatter()
            let pendingStart = Date().addingTimeInterval(24 * 60 * 60)
            let acceptedStart = Date().addingTimeInterval(48 * 60 * 60)
            let completedStart = Date().addingTimeInterval(-2 * 60 * 60)
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
                ),
                NativePlanRequest(
                    id: "ui-plan-completed",
                    connectionId: "ui-connection",
                    commitmentId: "ui-plan-completed-commitment",
                    status: "ACCEPTED",
                    planType: "COFFEE",
                    title: "Coffee after class",
                    location: "Campus café",
                    message: nil,
                    startTime: formatter.string(from: completedStart),
                    endTime: formatter.string(from: completedStart.addingTimeInterval(60 * 60)),
                    proposer: NativePlanAuthor(id: "ui-test-user", username: "test_001", nickname: "Test User", avatarUrl: nil),
                    receiver: NativePlanAuthor(id: "ui-peer", username: "test_002", nickname: "Mina", avatarUrl: nil),
                    counterOfId: nil,
                    availabilityShareId: nil,
                    scheduleShareLinkId: nil,
                    createdAt: formatter.string(from: completedStart),
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

    func recordOutcome(
        _ value: String,
        for planID: String,
        using session: SessionStore
    ) async {
        guard mutatingOutcomeID == nil else { return }
        mutatingOutcomeID = planID
        issue = nil
        defer { mutatingOutcomeID = nil }
        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("--ui-testing-authenticated") {
            plans = plans.map {
                $0.id == planID ? $0.replacingViewerOutcome(with: value) : $0
            }
            return
        }
        #endif
        do {
            let body = NativePlanOutcomeRequest(value: value)
            let _: APIEnvelope<NativePlanOutcomeEnvelope> = try await session.sendAuthorized(
                "api/v1/plans/\(planID)/outcome",
                method: .post,
                body: body,
                idempotencyKey: UUID().uuidString
            )
            await load(using: session)
        } catch { issue = error.localizedDescription }
    }
}

struct NativeSmallGroupSignals: Decodable, Hashable, Sendable {
    let verifiedStudent: Bool
    let school: String?
    let sharedLanguages: [String]
    let topic: String
    let meetingPreference: String?
}

struct NativeSmallGroupOpportunity: Decodable, Identifiable, Hashable, Sendable {
    let id: String
    let topic: String
    let title: String
    let description: String?
    let startAt: String
    let endAt: String
    let location: String?
    let responseDeadline: String
    let status: String
    let responseStatus: String
    let limitedSignals: NativeSmallGroupSignals
    let groupChatId: String?
}

private struct NativeSmallGroupListPayload: Decodable, Sendable {
    let opportunities: [NativeSmallGroupOpportunity]
}

private struct NativeSmallGroupResponseRequest: Encodable, Sendable { let status: String }
private struct NativeSmallGroupResponsePayload: Decodable, Sendable {
    let status: String
    let groupChatId: String?
}

@MainActor
@Observable
final class SmallGroupPilotStore {
    private(set) var opportunities: [NativeSmallGroupOpportunity] = []
    private(set) var isLoading = false
    private(set) var mutatingID: String?
    private(set) var issue: String?

    func load(using session: SessionStore) async {
        isLoading = true
        issue = nil
        defer { isLoading = false }
        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("--ui-testing-authenticated") {
            opportunities = []
            return
        }
        #endif
        do {
            let response: APIEnvelope<NativeSmallGroupListPayload> = try await session.sendAuthorized(
                "api/v1/social-group-opportunities"
            )
            opportunities = response.data.opportunities
        } catch { issue = error.localizedDescription }
    }

    func respond(
        _ status: String,
        to opportunity: NativeSmallGroupOpportunity,
        using session: SessionStore
    ) async -> String? {
        guard mutatingID == nil else { return nil }
        mutatingID = opportunity.id
        issue = nil
        defer { mutatingID = nil }
        do {
            let response: APIEnvelope<NativeSmallGroupResponsePayload> = try await session.sendAuthorized(
                "api/v1/social-group-opportunities/\(opportunity.id)/response",
                method: .post,
                body: NativeSmallGroupResponseRequest(status: status),
                idempotencyKey: UUID().uuidString
            )
            await load(using: session)
            return response.data.groupChatId
        } catch {
            issue = error.localizedDescription
            return nil
        }
    }
}
