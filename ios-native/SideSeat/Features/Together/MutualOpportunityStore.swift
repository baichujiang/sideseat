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

    #if DEBUG
    private var simulatedDecisionFailures = 0
    #endif

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
            if ProcessInfo.processInfo.arguments.contains("--ui-testing-opportunity-decision-failure"),
               simulatedDecisionFailures == 0 || !ProcessInfo.processInfo.arguments.contains("--ui-testing-opportunity-retry-success") {
                // Offline UI fixture: exercise a real failed release, then an explicit retry.
                simulatedDecisionFailures += 1
                issue = "UI test: choice was not saved."
                return
            }
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
                notice = AppLocalization.string("You can chat about the details now.")
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
        let arguments = ProcessInfo.processInfo.arguments
        let related = arguments.contains("--ui-testing-related-activity")
        let discovery = arguments.contains("--ui-testing-discovery-matching")
        let flexible = arguments.contains("--ui-testing-flexible-timing") || discovery
        let topicArgument = arguments.first { $0.hasPrefix("--ui-testing-opportunity-topic=") }
            .map { String($0.dropFirst("--ui-testing-opportunity-topic=".count)) }
        let topic = topicArgument.flatMap(NativeWeeklyIntentTopic.init(rawValue:))
            ?? (related || flexible ? .coffee : .study)
        let state = arguments.first { $0.hasPrefix("--ui-testing-opportunity-state=") }
            .map { String($0.dropFirst("--ui-testing-opportunity-state=".count)) } ?? "NEEDS_DECISION"
        let start = Date().addingTimeInterval(26 * 60 * 60)
        let end = start.addingTimeInterval((related ? 30 : 60) * 60)
        var card = NativeMutualOpportunity(
            id: "cmutualui0000000000000001",
            policyVersion: "MUTUAL_OPPORTUNITY_V1",
            state: state,
            viewerIntentId: nil,
            topic: topic,
            activityText: nil,
            sportTag: topic == .sports ? .badminton : nil,
            sportOtherNote: nil,
            viewerTogetherMode: .parallel,
            peerTogetherMode: .either,
            viewerStudyGoal: "Review for the algorithms exam",
            peerStudyGoal: "Finish an algorithms problem set",
            matchKind: topic == .study ? .sharedContext : .exactActivity,
            sharedContext: topic == .study ? .parallelStudy : nil,
            course: topic != .study ? nil : NativeMutualOpportunityCourse(
                id: "cui-course",
                code: "IN0007",
                name: "Algorithms"
            ),
            startsAt: flexible ? nil : start.ISO8601Format(),
            endsAt: flexible ? nil : end.ISO8601Format(),
            expiresAt: start.addingTimeInterval(-15 * 60).ISO8601Format(),
            peer: NativeMutualOpportunityPeer(
                displayName: "Mia",
                avatarUrl: "p02",
                verifiedStudent: true,
                major: "Computer Science",
                semester: 3,
                sharedLanguages: discovery ? [] : ["ENGLISH", "GERMAN"]
            ),
            viewerDecision: ["DECIDED", "READY_TO_COORDINATE"].contains(state) ? "YES" : nil,
            coordination: state == "READY_TO_COORDINATE"
                ? NativeMutualOpportunityCoordination(connectionId: "ui-connection-1") : nil,
            version: 1,
            matchFit: flexible ? NativeActivityFit(
                policyVersion: "ACTIVITY_FIT_V2", basis: "EXACT_ACTIVITY", score: 100,
                activityPoints: 50, timePoints: nil, languagePoints: 10, schoolPoints: 10,
                overlapMinutes: nil, viewerActivityText: "Coffee", peerActivityText: "Coffee"
            ) : related ? NativeActivityFit(
                policyVersion: "ACTIVITY_FIT_V1", basis: "RELATED_ACTIVITY",
                score: 60, activityPoints: 25, timePoints: 15,
                languagePoints: 10, schoolPoints: 10, overlapMinutes: 30,
                viewerActivityText: "喝咖啡", peerActivityText: "咖啡聊聊"
            ) : topicArgument == nil ? nil : NativeActivityFit(
                policyVersion: "ACTIVITY_FIT_V1", basis: "EXACT_ACTIVITY",
                score: 100, activityPoints: 50, timePoints: 30,
                languagePoints: 10, schoolPoints: 10, overlapMinutes: 60,
                viewerActivityText: nil, peerActivityText: nil
            ),
            timeContext: flexible ? NativeIntentTimePreference(kind: "UNDECIDED") : nil
        )
        if discovery {
            card.matchFit = NativeActivityFit(
                policyVersion: "DISCOVERY_FIT_V1", basis: "DIFFERENT_ACTIVITY", score: 0,
                activityPoints: 0, timePoints: 0, languagePoints: 0, schoolPoints: 0,
                overlapMinutes: nil, viewerActivityText: AppLocalization.string("Coffee"), peerActivityText: nil,
                differences: ["ACTIVITY", "TIME", "LANGUAGE", "SCHOOL"],
                viewerActivity: NativeDiscoveryActivity(topic: .coffee, activityText: AppLocalization.string("Coffee"), studyGoal: nil, sportTag: nil, sportOtherNote: nil),
                peerActivity: NativeDiscoveryActivity(topic: .sports, activityText: nil, studyGoal: nil, sportTag: .basketball, sportOtherNote: nil)
            )
        }
        return card
    }
}
