import Foundation
import Testing
@testable import SideSeat

@Suite("Shared plan presentation preserves separate contracts")
struct PlanPresentationTests {
    private let now = Date(timeIntervalSince1970: 1_800_000_000)

    private func chat(status: String = "PENDING", receiver: String = "me", hours: Double = 2,
                      reschedule: Bool = false) -> NativePlanRequest {
        let start = now.addingTimeInterval(hours * 3600)
        return NativePlanRequest(id: "revision", connectionId: "conversation",
            commitmentId: reschedule ? "commitment" : nil, status: status,
            planType: "STUDY", title: "Study", location: "Library", message: nil,
            startTime: start.ISO8601Format(), endTime: start.addingTimeInterval(3600).ISO8601Format(),
            proposer: .init(id: receiver == "me" ? "peer" : "me", username: "host", nickname: nil, avatarUrl: nil),
            receiver: .init(id: receiver, username: receiver, nickname: nil, avatarUrl: nil),
            counterOfId: reschedule ? "previous" : nil, availabilityShareId: nil, scheduleShareLinkId: nil,
            createdAt: now.ISO8601Format(), updatedAt: now.ISO8601Format())
    }

    private func manual(_ phase: String = "INVITING", owner: Bool = false,
                        reply: String? = "INVITED", included: Bool = true,
                        fixed: Bool = false, end: Date? = nil) -> PlanPresentation {
        .manual(phase: phase, isOwner: owner, didRespond: true, respondedCount: 2,
                myStatus: reply, isIncluded: included, fixed: fixed, accepted: 1, target: 2,
                start: now.addingTimeInterval(3600), end: end ?? now.addingTimeInterval(7200), now: now)
    }

    @Test("The same pending invitation has the same status and next step across plan types")
    func pendingEquivalence() {
        let bilateral = PlanPresentation.conversation(chat(), viewerID: "me", now: now)
        #expect(bilateral.status == manual().status)
        #expect(bilateral.nextStep == manual().nextStep)
        #expect(bilateral.nextStep == .confirm)
    }

    @Test("The sender, accepting participant, declined participant and excluded participant see different tasks")
    func roles() {
        #expect(manual(owner: true).nextStep == .reviewReplies)
        #expect(!manual(owner: true).nextStep.needsYou)
        #expect(manual(owner: true, fixed: true).nextStep == .shareInvitation)
        #expect(manual(reply: "ACCEPTED").nextStep == .waitForReplies)
        #expect(manual(reply: "DECLINED", included: false).nextStep == .declined)
        #expect(manual(reply: nil, included: false).nextStep == .notIncluded)
        #expect(!manual(reply: "DECLINED").nextStep.needsYou)
        #expect(PlanPresentation.conversation(chat(receiver: "peer"), viewerID: "me", now: now).nextStep == .waitForReplies)
    }

    @Test("An open invitation offers explicit confirmation, while unselected collection respondents cannot join")
    func fixedAndRosterRemainDistinct() {
        #expect(manual(reply: nil, included: false, fixed: true).nextStep == .confirm)
        #expect(manual(reply: nil, included: false).nextStep == .notIncluded)
    }

    @Test("Only confirmed participants get Calendar guidance; elapsed time never creates attendance feedback for manual plans")
    func calendarAndFeedbackBoundary() {
        #expect(manual("CONFIRMED", reply: "ACCEPTED").nextStep == .viewCalendar)
        #expect(manual("CONFIRMED", reply: nil, included: false).nextStep == .notIncluded)
        let ended = manual("CONFIRMED", end: now.addingTimeInterval(-1))
        #expect(ended.status == .ended && ended.nextStep == .viewPlan)
        let bilateral = PlanPresentation.conversation(chat(status: "ACCEPTED", hours: -3), viewerID: "me", now: now)
        #expect(bilateral.status == .ended && bilateral.nextStep == .recordOutcome)
    }

    @Test("Rescheduling retains the existing confirmed-time rule and never changes the persisted invitation")
    func rescheduleKeepsContract() {
        let proposal = chat(reschedule: true)
        let display = PlanPresentation.conversation(proposal, viewerID: "me", now: now)
        #expect(display.status == .awaitingConfirmation && display.nextStep == .confirm)
        #expect(display.detail == AppLocalization.string("The confirmed Plan stays unchanged until this new time is accepted."))
        #expect(proposal.status == "PENDING" && proposal.counterOfId == "previous")
    }

    @Test("Expired, cancelled and superseded plans never request confirmation")
    func terminalStates() {
        for phase in ["EXPIRED", "CANCELLED"] { #expect(!manual(phase).nextStep.needsYou) }
        for status in ["EXPIRED", "CANCELED", "DECLINED", "COUNTER_PROPOSED", "INVALIDATED"] {
            #expect(!PlanPresentation.conversation(chat(status: status), viewerID: "me", now: now).nextStep.needsYou)
        }
        #expect(PlanPresentation.conversation(chat(hours: -1), viewerID: "me", now: now).status == .expired)
    }
    @Test("Overview status names the viewer's task without changing the invitation lifecycle")
    func overviewPerspective() {
        let invited = manual()
        let accepted = manual(reply: "ACCEPTED")
        let owner = manual(owner: true)
        #expect(invited.cardStatusTitle == AppLocalization.string("Your confirmation needed"))
        #expect(invited.cardActionTitle == AppLocalization.string("Review invitation"))
        #expect(accepted.cardStatusTitle == AppLocalization.string("You've confirmed"))
        #expect(owner.cardStatusTitle == AppLocalization.string("Waiting for friends"))
        #expect(invited.status == accepted.status && accepted.status == owner.status)
        #expect(invited.nextStep == .confirm && !accepted.nextStep.needsYou && !owner.nextStep.needsYou)
    }

    @Test("Compact dates retain cross-midnight and cross-year meaning")
    func overviewDates() throws {
        let start = try #require(ISO8601DateFormatter().date(from: "2026-12-31T22:30:00Z"))
        let end = start.addingTimeInterval(7200)
        let display = PlanOverviewTiming(start: start, end: end, timeZone: "Europe/Berlin", now: start,
                                         locale: Locale(identifier: "en_GB"))
        #expect(display.crossesDay)
        #expect(!display.dateText.contains("2026"))
        #expect(display.clockText?.contains("2027") == true)
        #expect(display.clockText?.contains("23:30") == true)
        #expect(display.clockText?.contains("01:30") == true)
    }

    @Test("Only a different viewer zone needs an explicit overview zone; DST offsets remain visible")
    func overviewZones() throws {
        let start = try #require(ISO8601DateFormatter().date(from: "2026-10-24T23:30:00Z"))
        var display = PlanOverviewTiming(start: start, end: start.addingTimeInterval(10800),
            timeZone: "Europe/Berlin", now: start, locale: Locale(identifier: "en_GB"),
            viewerTimeZone: try #require(TimeZone(identifier: "Europe/Berlin")))
        #expect(display.zoneText == nil)
        display.viewerTimeZone = try #require(TimeZone(identifier: "UTC"))
        #expect(display.zoneText != nil)
        #expect(display.zoneText?.contains(" / ") == true)
        #expect(display.zoneText?.contains("Europe/Berlin") == false)
    }

}
