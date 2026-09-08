import Foundation
import Observation

@MainActor
@Observable
final class MutualOpportunityStore {
    private(set) var opportunities: [NativeMutualOpportunity] = []
    private(set) var isLoading = false
    private(set) var mutatingIDs: Set<String> = []
    private(set) var issue: String?
    private(set) var notice: String?

    func load(using session: SessionStore) async {
        guard !isLoading else { return }
        isLoading = true
        issue = nil
        defer { isLoading = false }

        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("--ui-testing-mutual-opportunity-empty") {
            opportunities = []
            return
        }
        if ProcessInfo.processInfo.arguments.contains("--ui-testing-mutual-opportunity") {
            opportunities = [.uiTestingFixture]
            return
        }
        #endif

        do {
            let envelope: APIEnvelope<NativeMutualOpportunitiesPayload> = try await session.sendAuthorized(
                "api/v1/me/mutual-opportunities"
            )
            opportunities = envelope.data.opportunities
        } catch is CancellationError {
            // A cancelled refresh says nothing about the already loaded matches.
            return
        } catch {
            opportunities = []
            issue = error.localizedDescription
        }
    }

    func decide(
        _ decision: String,
        opportunity: NativeMutualOpportunity,
        using session: SessionStore
    ) async {
        guard !mutatingIDs.contains(opportunity.id) else { return }
        mutatingIDs.insert(opportunity.id)
        issue = nil
        notice = nil
        defer { mutatingIDs.remove(opportunity.id) }

        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("--ui-testing-mutual-opportunity") {
            opportunities.removeAll { $0.id == opportunity.id }
            notice = AppLocalization.string("Your choice was saved privately.")
            return
        }
        #endif

        do {
            let envelope: APIEnvelope<NativeMutualOpportunity> = try await session.sendAuthorized(
                "api/v1/me/mutual-opportunities/\(opportunity.id)/decision",
                method: .post,
                body: NativeMutualOpportunityDecisionRequest(decision: decision),
                idempotencyKey: UUID().uuidString
            )
            let updated = envelope.data
            if updated.isReadyToCoordinate {
                upsert(updated)
                notice = AppLocalization.string("You can plan this together now.")
            } else if decision == "YES" {
                upsert(updated)
                notice = AppLocalization.string("Your choice was saved privately.")
            } else {
                opportunities.removeAll { $0.id == opportunity.id }
                notice = AppLocalization.string("SideSeat is looking for another match.")
                await load(using: session)
            }
        } catch {
            issue = error.localizedDescription
        }
    }

    func withdraw(
        opportunity: NativeMutualOpportunity,
        using session: SessionStore
    ) async {
        guard opportunity.hasPrivateYes,
              !mutatingIDs.contains(opportunity.id)
        else { return }
        mutatingIDs.insert(opportunity.id)
        issue = nil
        notice = nil
        defer { mutatingIDs.remove(opportunity.id) }

        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("--ui-testing-mutual-opportunity") {
            opportunities.removeAll { $0.id == opportunity.id }
            notice = AppLocalization.string("Your choice was withdrawn.")
            return
        }
        #endif

        do {
            let _: APIEnvelope<NativeMutualOpportunity> = try await session.sendAuthorized(
                "api/v1/me/mutual-opportunities/\(opportunity.id)/decision",
                method: .delete,
                idempotencyKey: UUID().uuidString
            )
            opportunities.removeAll { $0.id == opportunity.id }
            notice = AppLocalization.string("Your choice was withdrawn.")
            await load(using: session)
        } catch {
            issue = error.localizedDescription
        }
    }

    private func upsert(_ opportunity: NativeMutualOpportunity) {
        if let index = opportunities.firstIndex(where: { $0.id == opportunity.id }) {
            opportunities[index] = opportunity
        } else {
            opportunities.append(opportunity)
        }
    }
}

private extension NativeMutualOpportunity {
    static var uiTestingFixture: NativeMutualOpportunity {
        let related = ProcessInfo.processInfo.arguments.contains("--ui-testing-related-activity")
        let start = Date().addingTimeInterval(26 * 60 * 60)
        let end = start.addingTimeInterval((related ? 30 : 60) * 60)
        return NativeMutualOpportunity(
            id: "cmutualui0000000000000001",
            policyVersion: "MUTUAL_OPPORTUNITY_V1",
            state: "NEEDS_DECISION",
            viewerIntentId: nil,
            topic: related ? .coffee : .study,
            activityText: nil,
            sportTag: nil,
            sportOtherNote: nil,
            viewerTogetherMode: .parallel,
            peerTogetherMode: .either,
            viewerStudyGoal: "Review for the algorithms exam",
            peerStudyGoal: "Finish an algorithms problem set",
            matchKind: .sharedContext,
            sharedContext: related ? nil : .parallelStudy,
            course: related ? nil : NativeMutualOpportunityCourse(
                id: "cui-course",
                code: "IN0007",
                name: "Algorithms"
            ),
            startsAt: start.ISO8601Format(),
            endsAt: end.ISO8601Format(),
            expiresAt: start.addingTimeInterval(-15 * 60).ISO8601Format(),
            peer: NativeMutualOpportunityPeer(
                displayName: "Mia",
                avatarUrl: nil,
                verifiedStudent: true,
                major: "Computer Science",
                semester: 3,
                sharedLanguages: ["ENGLISH", "GERMAN"]
            ),
            viewerDecision: nil,
            coordination: nil,
            version: 1,
            matchFit: related ? NativeActivityFit(
                policyVersion: "ACTIVITY_FIT_V1", basis: "RELATED_ACTIVITY",
                score: 60, activityPoints: 25, timePoints: 15,
                languagePoints: 10, schoolPoints: 10, overlapMinutes: 30,
                viewerActivityText: "喝咖啡", peerActivityText: "咖啡聊聊"
            ) : nil
        )
    }
}
