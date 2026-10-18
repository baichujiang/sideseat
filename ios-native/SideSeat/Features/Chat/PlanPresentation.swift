import Foundation

/// Read-only presentation of the two existing plan contracts. No persisted state is translated.
enum PlanDisplayStatus: String, Sendable {
    case findingTime, awaitingConfirmation, confirmed, inProgress, ended, cancelled, expired, declined, superseded, unavailable

    var title: String {
        let key: String.LocalizationValue = switch self {
        case .findingTime: "Finding a time"
        case .awaitingConfirmation: "Awaiting confirmations"
        case .confirmed: "Confirmed"
        case .inProgress: "In progress"
        case .ended: "Ended"
        case .cancelled: "Cancelled"
        case .expired: "Expired"
        case .declined: "Declined"
        case .superseded: "Superseded"
        case .unavailable: "Plan unavailable"
        }
        return AppLocalization.string(key)
    }

    var symbol: String {
        switch self {
        case .findingTime: "calendar.badge.clock"
        case .awaitingConfirmation: "envelope.badge"
        case .confirmed, .inProgress: "checkmark.circle.fill"
        case .ended: "clock.arrow.circlepath"
        case .cancelled, .declined: "xmark.circle"
        case .expired: "clock.badge.exclamationmark"
        case .superseded: "arrow.triangle.2.circlepath"
        case .unavailable: "calendar.badge.exclamationmark"
        }
    }
}

struct PlanPresentation: Sendable {
    let status: PlanDisplayStatus
    let nextStep: PlanNextStep
    let detail: String

    static func manual(phase: String, isOwner: Bool, didRespond: Bool, respondedCount: Int,
                       myStatus: String?, isIncluded: Bool, fixed: Bool, accepted: Int, target: Int,
                       start: Date?, end: Date?, now: Date) -> Self {
        let status: PlanDisplayStatus = switch phase {
        case "COLLECTING": .findingTime
        case "INVITING": .awaitingConfirmation
        case "CONFIRMED": end.map { $0 <= now } == true ? .ended
            : start.map { $0 <= now } == true ? .inProgress : .confirmed
        case "CANCELLED": .cancelled
        case "EXPIRED": .expired
        default: .unavailable
        }
        let step: PlanNextStep
        let detail: String.LocalizationValue
        switch status {
        case .findingTime:
            if isOwner {
                step = respondedCount > (didRespond ? 1 : 0) ? .chooseTime : .shareAvailability
            } else {
                step = didRespond ? .waitForOrganizer : .fillAvailability
            }
            detail = "Filling in free time doesn't confirm attendance."
        case .awaitingConfirmation:
            if myStatus == "DECLINED" {
                step = .declined
                detail = "Your reply is saved. You have not confirmed attendance."
            } else if isOwner {
                step = fixed ? .shareInvitation : .reviewReplies
                detail = "Send the link to friends so they can confirm this time."
            } else if myStatus == "ACCEPTED" && isIncluded {
                step = .waitForReplies
                detail = "You've confirmed. The plan is added to calendars after everyone included confirms."
            } else if (isIncluded && myStatus == "INVITED") || (fixed && accepted < target && myStatus == nil) {
                step = .confirm
                detail = "The plan is added to calendars after everyone included confirms."
            } else {
                step = .notIncluded
                detail = "You are not included in this invitation. Your availability is saved."
            }
        case .confirmed, .inProgress:
            step = isIncluded ? .viewCalendar : .notIncluded
            detail = isIncluded ? "Synced to Sideseat calendars" : "Only invited participants have this plan in their calendars."
        case .ended:
            step = .viewPlan
            detail = "This activity has ended."
        case .cancelled:
            step = .viewPlan
            detail = "This plan is cancelled. Its calendar entries have been removed."
        case .expired:
            step = .viewPlan
            detail = "This plan expired before it was confirmed. No calendar entries were added."
        default:
            step = .viewPlan
            detail = "This Plan is no longer available."
        }
        return Self(status: status, nextStep: step, detail: AppLocalization.string(detail))
    }

    static func conversation(_ plan: NativePlanRequest, viewerID: String, now: Date) -> Self {
        let status: PlanDisplayStatus
        switch plan.cancellation != nil ? "CANCELED" : plan.status {
        case "PENDING": status = (plan.startDate ?? .distantPast) <= now ? .expired : .awaitingConfirmation
        case "ACCEPTED": status = (plan.endDate ?? .distantFuture) <= now ? .ended
            : (plan.startDate ?? .distantFuture) <= now ? .inProgress : .confirmed
        case "CANCELED": status = .cancelled
        case "DECLINED": status = .declined
        case "COUNTER_PROPOSED", "SUPERSEDED": status = .superseded
        case "EXPIRED": status = .expired
        default: status = .unavailable
        }
        let step: PlanNextStep
        let detail: String.LocalizationValue
        switch status {
        case .awaitingConfirmation:
            step = plan.receiver.id == viewerID ? .confirm : .waitForReplies
            detail = plan.counterOfId != nil && plan.commitmentId != nil
                ? "The confirmed Plan stays unchanged until this new time is accepted."
                : plan.receiver.id == viewerID ? "Accepting confirms this Plan and adds it to both calendars."
                : "Your invitation is sent. The other person needs to confirm this time."
        case .confirmed, .inProgress:
            step = .viewCalendar
            detail = "Confirmed in both calendars"
        case .ended:
            step = plan.isOutcomeEligible(at: now) ? .recordOutcome : .viewPlan
            detail = "This activity has ended."
        case .cancelled:
            step = .viewPlan
            detail = "This proposal was withdrawn or canceled."
        case .declined:
            step = .viewPlan
            detail = "This proposal was declined."
        case .superseded:
            step = .viewPlan
            detail = "A newer proposal is now in the conversation."
        case .expired:
            step = .viewPlan
            detail = "This proposal expired before it was confirmed."
        default:
            step = .viewPlan
            detail = "This Plan is no longer available."
        }
        return Self(status: status, nextStep: step, detail: AppLocalization.string(detail))
    }
}

extension NativeTimePoll {
    func presentation(at now: Date) -> PlanPresentation {
        let mine = allInvitations.first(where: \.isMe)
        return .manual(phase: planningPhase(at: now), isOwner: isOwner, didRespond: didRespond,
                       respondedCount: participants.count, myStatus: mine?.status,
                       isIncluded: isOwner || mine?.selected == true, fixed: planningMode == "FIXED",
                       accepted: allInvitations.filter { $0.selected && $0.status == "ACCEPTED" }.count,
                       target: targetCount, start: chosenStart, end: chosenEnd, now: now)
    }
}

extension NativeTimePollList.Item {
    func presentation(at now: Date) -> PlanPresentation {
        .manual(phase: planningPhase(at: now), isOwner: isOwner == true, didRespond: didRespond == true,
                respondedCount: respondedCount ?? 0, myStatus: myInvitationStatus,
                isIncluded: isOwner == true || isIncluded != false, fixed: planningMode == "FIXED",
                accepted: acceptedCount ?? 0, target: confirmationTarget, start: chosenStart, end: chosenEnd, now: now)
    }
}
