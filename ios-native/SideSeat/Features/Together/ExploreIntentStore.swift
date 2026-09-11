import Foundation
import Observation

@MainActor
@Observable
final class ExploreIntentStore {
    private(set) var intents: [NativeExploreIntent] = []
    private(set) var hasMore = false
    private(set) var isLoading = false
    private(set) var issue: String?

    func load(using session: SessionStore, limit: Int) async {
        guard !isLoading else { return }
        isLoading = true
        issue = nil
        defer { isLoading = false }

        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("--ui-testing-explore-empty") {
            intents = []
            hasMore = false
            return
        }
        if ProcessInfo.processInfo.arguments.contains("--ui-testing-explore-intents") {
            let count = min(limit, ExploreAccessTier.current == .plus ? 10 : 3)
            intents = (0..<count).map(Self.fixture(index:))
            hasMore = ExploreAccessTier.current == .free
            return
        }
        #endif

        do {
            let response: APIEnvelope<NativeExploreIntentPayload> = try await session.sendAuthorized(
                "api/v1/explore/intents",
                queryItems: [URLQueryItem(name: "limit", value: String(limit))]
            )
            intents = response.data.intents
            hasMore = response.data.hasMore
        } catch is CancellationError {
            return
        } catch {
            issue = error.localizedDescription
        }
    }

    #if DEBUG
    private static func fixture(index: Int) -> NativeExploreIntent {
        let topics: [NativeWeeklyIntentTopic] = [.sports, .coffee, .study, .food, .explore]
        let topic = topics[index % topics.count]
        let activity: String = ["Badminton", "Coffee after class", "Library study", "Try a new noodle place", "Walk around campus"][index % 5]
        let tomorrow = Calendar.current.date(byAdding: .day, value: 1 + index, to: Date())!
        let key = NativeIntentTimePreference.dateKey(tomorrow)
        return NativeExploreIntent(
            id: "ui-explore-\(index)", topic: topic, togetherMode: .sameActivity,
            studyGoal: topic == .study ? activity : nil,
            activityText: topic == .sports || topic == .study ? nil : activity,
            sportTag: topic == .sports ? .badminton : nil, sportOtherNote: nil,
            course: topic == .study ? NativeExploreIntentCourse(code: "IN0007", name: "Algorithms") : nil,
            time: NativeExploreIntentTime(kind: "FLEXIBLE", startDate: key, endDate: key,
                period: index % 2 == 0 ? "AFTERNOON" : "EVENING"),
            descriptionPreview: "Looking for someone to join casually. We can decide the exact details together.",
            campus: "TUM", verifiedStudent: true, languages: ["ENGLISH"],
            expiresAt: Date().addingTimeInterval(Double(3 + index) * 86400), createdAt: Date()
        )
    }
    #endif
}
