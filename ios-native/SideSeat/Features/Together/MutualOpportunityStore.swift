import Foundation
import Observation

@MainActor
@Observable
final class MutualOpportunityStore {
    private(set) var opportunities: [NativeMutualOpportunity] = []
    private(set) var isLoading = false
    private(set) var hasLoaded = false
    private(set) var mutatingIDs: Set<String> = []
    private(set) var issue: String?
    private(set) var notice: String?

    #if DEBUG
    static var fixtureConversations: [String: NativeMutualOpportunity] = [:]
    static var fixtureChatMessages: [String: [NativeDirectMessage]] = [:]
    private var simulatedDecisionFailures = 0
    private var loadAttempts = 0
    private var fixtureOverrides: [String: NativeMutualOpportunity] = [:]
    #endif

    func load(using session: SessionStore) async {
        guard !isLoading else { return }
        isLoading = true
        issue = nil
        defer { isLoading = false }

        #if DEBUG
        loadAttempts += 1
        if ProcessInfo.processInfo.arguments.contains("--ui-testing-recommendation-slow") {
            do { try await Task.sleep(for: .seconds(4)) } catch { return }
        }
        if ProcessInfo.processInfo.arguments.contains("--ui-testing-recommendation-load-error"), loadAttempts == 1 {
            issue = "Recommendations could not be loaded."
            return
        }
        if ProcessInfo.processInfo.arguments.contains("--ui-testing-recommendation-refresh-error"), loadAttempts > 1 {
            issue = "Recommendations could not be loaded."
            return
        }
        if ProcessInfo.processInfo.arguments.contains("--ui-testing-mutual-opportunity-empty") {
            opportunities = []
            hasLoaded = true
            return
        }
        if ProcessInfo.processInfo.arguments.contains("--ui-testing-mutual-opportunity") {
            let ids = ProcessInfo.processInfo.arguments.contains("--ui-testing-opportunity-list")
                ? ["cmutualui0000000000000001", "cmutualui0000000000000002", "cmutualui0000000000000003"]
                : ["cmutualui0000000000000001"]
            hasLoaded = true
            opportunities = ids.map { fixtureOverrides[$0] ?? .uiTestingFixture(id: $0) }
                + fixtureOverrides.values.filter { !ids.contains($0.id) }.sorted { $0.id < $1.id }
            return
        }
        #endif

        do {
            let envelope: APIEnvelope<NativeMutualOpportunitiesPayload> = try await session.sendAuthorized(
                "api/v1/me/mutual-opportunities"
            )
            opportunities = envelope.data.opportunities
            hasLoaded = true
        } catch is CancellationError {
            // A cancelled refresh says nothing about the already loaded matches.
            return
        } catch {
            if Task.isCancelled { return }
            issue = error.localizedDescription
        }
    }

    @discardableResult
    func interact(_ action: String, opportunity: NativeMutualOpportunity, body: String? = nil,
                  using session: SessionStore) async -> NativeMutualOpportunity? {
        guard !mutatingIDs.contains(opportunity.id) else { return nil }
        mutatingIDs.insert(opportunity.id)
        issue = nil
        defer { mutatingIDs.remove(opportunity.id) }
        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("--ui-testing-mutual-opportunity") {
            if ProcessInfo.processInfo.arguments.contains("--ui-testing-opportunity-decision-failure"), simulatedDecisionFailures == 0 {
                simulatedDecisionFailures += 1
                issue = "UI test: message was not sent."
                return nil
            }
            var updated = opportunity
            switch action {
            case "BOOKMARK": updated.isBookmarked = true
            case "UNBOOKMARK": updated.isBookmarked = false
            case "SEND":
                updated.messageRequest = NativeOpportunityMessageRequest(body: body ?? "", direction: "OUTGOING", status: "PENDING", createdAt: Date().ISO8601Format())
            case "IGNORE":
                updated.messageRequest = NativeOpportunityMessageRequest(body: opportunity.messageRequest?.body ?? "", direction: "INCOMING", status: "IGNORED", createdAt: Date().ISO8601Format())
            case "REPLY":
                updated = .uiTestingFixture(id: opportunity.id, stateOverride: "READY_TO_COORDINATE")
                if let request = opportunity.messageRequest, let connectionID = updated.coordination?.connectionId {
                    updated.messageRequest = NativeOpportunityMessageRequest(body: request.body, direction: request.direction,
                        status: "REPLIED", createdAt: request.createdAt, intention: request.intention)
                    Self.fixtureChatMessages[connectionID] = [
                        NativeDirectMessage(id: "ui-intention-context-\(opportunity.id)", connectionId: connectionID,
                            sender: NativeChatAuthor(id: "ui-peer", username: opportunity.peer.displayName, nickname: nil, avatarUrl: opportunity.peer.avatarUrl),
                            type: "MUTUAL_OPPORTUNITY_CARD", body: nil, createdAt: request.createdAt,
                            mutualOpportunity: NativeMutualOpportunitySource(id: opportunity.id,
                                policyVersion: opportunity.policyVersion, topic: opportunity.topic.rawValue,
                                context: NativeActionContext(version: 1, sourceKind: "MUTUAL_OPPORTUNITY",
                                    sourceId: opportunity.id, title: opportunity.messageActivityTitle,
                                    startsAt: opportunity.startsAt, endsAt: opportunity.endsAt, location: nil,
                                    planType: "CUSTOM", participantIds: ["ui-test-user", "ui-peer"],
                                    author: NativeActionContextAuthor(id: "ui-peer", displayName: opportunity.peer.displayName),
                                    course: nil))),
                        NativeDirectMessage(id: "ui-introduction-\(opportunity.id)", connectionId: connectionID,
                            sender: NativeChatAuthor(id: "ui-peer", username: opportunity.peer.displayName, nickname: nil, avatarUrl: opportunity.peer.avatarUrl),
                            type: "TEXT", body: request.body, createdAt: request.createdAt),
                        NativeDirectMessage(id: "ui-first-reply-\(opportunity.id)", connectionId: connectionID,
                            sender: NativeChatAuthor(id: "ui-test-user", username: "You", nickname: nil, avatarUrl: nil),
                            type: "TEXT", body: body, createdAt: Date().ISO8601Format())
                    ]
                }
            default: break
            }
            fixtureOverrides[opportunity.id] = updated
            upsert(updated)
            notifyConversationChange(action)
            return updated
        }
        #endif
        do {
            let envelope: APIEnvelope<NativeMutualOpportunity> = try await session.sendAuthorized(
                "api/v1/me/mutual-opportunities/\(opportunity.id)/interaction",
                method: .post, body: NativeOpportunityInteraction(action: action, body: body),
                idempotencyKey: UUID().uuidString
            )
            upsert(envelope.data)
            notifyConversationChange(action)
            return envelope.data
        } catch {
            issue = error.localizedDescription
            return nil
        }
    }

    private func notifyConversationChange(_ action: String) {
        guard ["SEND", "REPLY", "IGNORE"].contains(action) else { return }
        NotificationCenter.default.post(name: .sideSeatInboxNeedsRefresh, object: nil)
        NotificationCenter.default.post(name: .sideSeatTogetherNeedsRefresh, object: nil)
    }

    func refreshConversation(_ opportunity: NativeMutualOpportunity, using session: SessionStore) async -> NativeMutualOpportunity? {
        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("--ui-testing-authenticated") {
            return Self.fixtureConversations[opportunity.id] ?? opportunity
        }
        #endif
        return await loadConversation(id: opportunity.id, using: session)
    }

    func loadConversation(id: String, using session: SessionStore) async -> NativeMutualOpportunity? {
        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("--ui-testing-authenticated") {
            return Self.fixtureConversations[id] ?? .uiTestingFixture(id: id)
        }
        #endif
        do {
            let response: APIEnvelope<NativeMutualOpportunity> = try await session.sendAuthorized(
                "api/v1/me/mutual-opportunities/\(id)")
            issue = nil
            return response.data
        } catch is CancellationError { return nil }
        catch { issue = error.localizedDescription; return nil }
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
            if decision == "YES" {
                upsert(.uiTestingFixture(id: opportunity.id, stateOverride: "DECIDED"))
            } else {
                opportunities.removeAll { $0.id == opportunity.id }
            }
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

    func upsert(_ opportunity: NativeMutualOpportunity) {
        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("--ui-testing-mutual-opportunity") {
            fixtureOverrides[opportunity.id] = opportunity
            if opportunity.messageRequest != nil || opportunity.isBookmarked != nil { Self.fixtureConversations[opportunity.id] = opportunity }
        }
        #endif
        if opportunity.isBookmarked != true && (opportunity.state == "UNAVAILABLE" || opportunity.state == "CLOSED") {
            opportunities.removeAll { $0.id == opportunity.id }
            return
        }
        if let index = opportunities.firstIndex(where: { $0.id == opportunity.id }) {
            opportunities[index] = opportunity
        } else {
            opportunities.append(opportunity)
        }
    }
}

extension NativeMutualOpportunity {
    static func uiTestingFixture(id: String, stateOverride: String? = nil) -> NativeMutualOpportunity {
        let arguments = ProcessInfo.processInfo.arguments
        let related = arguments.contains("--ui-testing-related-activity")
        let discovery = arguments.contains("--ui-testing-discovery-matching")
        let flexible = arguments.contains("--ui-testing-flexible-timing") || discovery
        let topicArgument = arguments.first { $0.hasPrefix("--ui-testing-opportunity-topic=") }
            .map { String($0.dropFirst("--ui-testing-opportunity-topic=".count)) }
        let topic = topicArgument.flatMap(NativeWeeklyIntentTopic.init(rawValue:))
            ?? (related || flexible ? .coffee : .study)
        let state = stateOverride ?? arguments.first { $0.hasPrefix("--ui-testing-opportunity-state=") }
            .map { String($0.dropFirst("--ui-testing-opportunity-state=".count)) } ?? "NEEDS_DECISION"
        let start = Date().addingTimeInterval(26 * 60 * 60)
        let end = start.addingTimeInterval((related ? 30 : 60) * 60)
        var card = NativeMutualOpportunity(
            id: id,
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
                sharedLanguages: discovery ? [] : ["ENGLISH", "GERMAN"],
                isPlus: ProcessInfo.processInfo.arguments.contains("--ui-testing-plus-member"),
                campus: "TUM", languages: ["ENGLISH"]
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
        if flexible, arguments.contains("--ui-testing-opportunity-flexible-window") {
            let day = NativeIntentTimePreference.dateKey(start)
            card.timeContext = NativeIntentTimePreference(kind: "FLEXIBLE", startDate: day, endDate: day, period: "AFTERNOON")
        }
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
        card.peerIntention = NativeOpportunityIntention(
            activity: card.matchFit?.peerActivity ?? NativeDiscoveryActivity(
                topic: topic, activityText: card.matchFit?.peerActivityText ?? card.activityText,
                studyGoal: card.peerStudyGoal, sportTag: card.sportTag, sportOtherNote: card.sportOtherNote),
            timePreference: discovery ? NativeIntentTimePreference(kind: "EXACT") : card.timeContext,
            timeWindows: flexible && !discovery ? [] : [NativeWeeklyIntentTimeWindow(startAt: start, endAt: end)],
            course: !discovery && topic == .study ? NativeExploreIntentCourse(code: "IN0007", name: "Algorithms") : nil,
            descriptionPreview: AppLocalization.string("Looking for someone to join casually. We can decide the exact details together.")
        )
        return card
    }
}
