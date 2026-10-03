import Foundation
import Testing
@testable import SideSeat

@Suite("Same-person follow-up plans")
struct ConversationPlansTests {
    let now = Date(timeIntervalSince1970: 1_800_000_000)

    private func plan(_ id: String, status: String = "PENDING", receiver: String = "me",
                      hours: Double = 2, commitment: String? = nil) -> NativePlanRequest {
        let start = now.addingTimeInterval(hours * 3600)
        return NativePlanRequest(id: id, connectionId: "chat", commitmentId: commitment,
            status: status, planType: "STUDY", title: "Library", location: "Campus", message: "Old note",
            startTime: start.ISO8601Format(), endTime: start.addingTimeInterval(3600).ISO8601Format(),
            proposer: NativePlanAuthor(id: receiver == "me" ? "peer" : "me", username: "author", nickname: nil, avatarUrl: nil),
            receiver: NativePlanAuthor(id: receiver, username: receiver, nickname: nil, avatarUrl: nil),
            counterOfId: nil, availabilityShareId: nil, scheduleShareLinkId: nil,
            meetAgainAvailable: false, createdAt: now.ISO8601Format(), updatedAt: now.ISO8601Format())
    }

    @Test("An ended plan seeds a new invitation without reusing time, origin or requiring feedback")
    func repeatDraft() {
        let first = plan("first", status: "ACCEPTED", hours: -3, commitment: "old")
        let draft = NativePlanDraft(repeating: first)
        #expect(draft.title == "Library")
        #expect(draft.location == "Campus")
        #expect(draft.planType == "STUDY")
        #expect(draft.participantIds == ["peer", "me"])
        #expect(draft.startTime == nil && draft.endTime == nil && draft.origin == nil)
        #expect(draft.needsTimeSelection && draft.isRepeat)
        #expect(draft.suggestedDuration == 3600)
        #expect(first.viewerOutcome == nil && first.meetAgainAvailable == false)
    }

    @Test("An invitation needing my reply takes precedence over an earlier confirmed meet-up")
    func incomingFirst() {
        let list = [plan("confirmed", status: "ACCEPTED", hours: 1), plan("incoming", hours: 3), plan("outgoing", receiver: "peer", hours: 0.5)]
        #expect(ConversationPlanSelection.groups(list, viewerID: "me", now: now).map(\.primary.id) == ["incoming", "confirmed", "outgoing"])
    }

    @Test("The next confirmed meet-up precedes outgoing invitations")
    func confirmedFirst() {
        let list = [plan("later", status: "ACCEPTED", hours: 4), plan("outgoing", receiver: "peer"), plan("next", status: "ACCEPTED", hours: 1)]
        #expect(ConversationPlanSelection.groups(list, viewerID: "me", now: now).first?.primary.id == "next")
    }

    @Test("A current plan is available without any chat history or intention origin")
    func independentOfOrigin() {
        let current = plan("second", status: "ACCEPTED")
        #expect(current.origin == nil)
        #expect(ConversationPlanSelection.groups([current], viewerID: "me", now: now).first?.primary.title == "Library")
    }

    @Test("Ended, declined, canceled, superseded and stale pending proposals cannot become current")
    func terminalAndStale() {
        let list = [plan("ended", status: "ACCEPTED", hours: -3), plan("stale", hours: -1),
                    plan("declined", status: "DECLINED"), plan("canceled", status: "CANCELED"),
                    plan("old-revision", status: "SUPERSEDED"), plan("current", status: "ACCEPTED")]
        #expect(ConversationPlanSelection.groups(list, viewerID: "me", now: now).map(\.primary.id) == ["current"])
    }

    @Test("A reschedule invitation and the still-confirmed time stay in one group")
    func rescheduleGrouping() {
        let groups = ConversationPlanSelection.groups([
            plan("accepted", status: "ACCEPTED", commitment: "same"),
            plan("new-time", hours: 4, commitment: "same"),
            plan("separate", status: "ACCEPTED", hours: 5, commitment: "other"),
        ], viewerID: "me", now: now)
        #expect(groups.count == 2)
        #expect(groups[0].primary.id == "new-time")
        #expect(groups[0].plans.map(\.id) == ["new-time", "accepted"])
    }

    @Test("Simultaneous plans retain deterministic order")
    func stableOrder() {
        let list = [plan("b"), plan("a")]
        #expect(ConversationPlanSelection.groups(list, viewerID: "me", now: now).map(\.primary.id) == ["a", "b"])
    }
}
