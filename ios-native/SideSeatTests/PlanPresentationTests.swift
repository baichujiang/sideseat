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
        #expect(manual(owner: true).nextStep == .publishPlan)
        #expect(manual(owner: true).nextStep.needsYou)
        #expect(manual(owner: true, fixed: true).nextStep == .publishPlan)
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

    @Test("Published plans distinguish accepted, pending, declined, and link participants")
    func publishedAttendance() {
        #expect(manual("CONFIRMED", owner: true).nextStep == .viewCalendar)
        #expect(manual("CONFIRMED", reply: "INVITED").nextStep == .confirm)
        #expect(manual("CONFIRMED", reply: "DECLINED").nextStep == .declined)
        #expect(manual("CONFIRMED", reply: nil, included: false, fixed: true).nextStep == .confirm)
        #expect(manual("CONFIRMED", reply: "ACCEPTED").nextStep == .viewCalendar)
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
        #expect(owner.cardStatusTitle == AppLocalization.string("Ready to send final plan"))
        #expect(invited.status == accepted.status && accepted.status == owner.status)
        #expect(invited.nextStep == .confirm && !accepted.nextStep.needsYou && owner.nextStep.needsYou)
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

    @Test("Activity ideas are separate from availability and attendance")
    func activityStageRoles() {
        let open = NativePlanActivity(topic: "Weekend", isOpen: true, selectedIdeaId: nil, ideaCount: 2, hasParticipated: true)
        func present(owner: Bool, activity: NativePlanActivity, phase: String = "COLLECTING") -> PlanPresentation {
            .manual(phase: phase, isOwner: owner, didRespond: false, respondedCount: 0, myStatus: nil,
                    isIncluded: owner, fixed: false, accepted: 0, target: 0, start: nil, end: nil, now: now, activity: activity)
        }
        #expect(present(owner: true, activity: open).nextStep == .shareAvailability)
        #expect(present(owner: true, activity: open).status == .choosingActivity)
        #expect(present(owner: false, activity: open).nextStep == .fillAvailability)
        #expect(present(owner: false, activity: open).nextStep.needsYou)
        let chosen = NativePlanActivity(topic: "Weekend", isOpen: false, selectedIdeaId: "idea", ideaCount: 2, hasParticipated: true)
        #expect(present(owner: false, activity: chosen).nextStep == .fillAvailability)
        #expect(present(owner: false, activity: open, phase: "EXPIRED").status == .expired)
    }

    @Test("An untouched participant and empty organizer get a clear first activity action")
    func activityStageFirstAction() {
        let empty = NativePlanActivity(topic: "Weekend", isOpen: true, selectedIdeaId: nil, ideaCount: 0, hasParticipated: false)
        for owner in [true, false] {
            let value = PlanPresentation.manual(phase: "COLLECTING", isOwner: owner, didRespond: false,
                respondedCount: 0, myStatus: nil, isIncluded: owner, fixed: false, accepted: 0, target: 0,
                start: nil, end: nil, now: now, activity: empty)
            #expect(value.nextStep == (owner ? .shareAvailability : .fillAvailability))
            #expect(value.nextStep.needsYou)
        }
    }

    @Test("Activity interest never hides an outstanding availability task")
    func parallelActivityAndAvailability() {
        let activity = NativePlanActivity(topic: "Weekend", isOpen: true, selectedIdeaId: nil, ideaCount: 2, hasParticipated: true)
        func present(owner: Bool, responded: Bool, count: Int) -> PlanPresentation {
            .manual(phase: "COLLECTING", isOwner: owner, didRespond: responded, respondedCount: count,
                    myStatus: nil, isIncluded: owner, fixed: false, accepted: 0, target: 0,
                    start: nil, end: nil, now: now, activity: activity)
        }
        #expect(present(owner: false, responded: false, count: 1).nextStep == .fillAvailability)
        #expect(present(owner: false, responded: true, count: 1).nextStep == .waitForOrganizer)
        #expect(present(owner: true, responded: false, count: 1).nextStep == .chooseTime)
        #expect(present(owner: true, responded: true, count: 1).nextStep == .shareAvailability)
    }

}
