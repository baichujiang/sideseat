import Foundation

/// Read-only presentation of the two existing plan contracts. No persisted state is translated.
enum PlanDisplayStatus: String, Sendable {
    case choosingActivity, findingTime, awaitingConfirmation, confirmed, inProgress, ended, cancelled, expired, declined, superseded, unavailable

    var title: String {
        let key: String.LocalizationValue = switch self {
        case .choosingActivity: "Choosing activity and time"
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
        case .choosingActivity: "lightbulb"
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
    var viewerHasConfirmed = false

    /// Overview speaks about this viewer's task; detail keeps the shared lifecycle.
    var cardStatusTitle: String {
        let key: String.LocalizationValue? = switch nextStep {
        case .suggestActivity: "Your activity ideas needed"
        case .chooseActivity: "Ready to choose an activity"
        case .waitForActivity: "Waiting for the activity choice"
        case .fillAvailability: "Your availability needed"
        case .shareAvailability, .shareInvitation: "Ready to share"
        case .chooseTime: "Ready for you to choose"
        case .confirm: "Your confirmation needed"
        case .waitForOrganizer: "Waiting for a final time"
        case .waitForReplies: viewerHasConfirmed ? "You've confirmed" : "Waiting for friends"
        case .publishPlan: "Ready to send final plan"
        case .reviewReplies: "Waiting for friends"
        case .declined: "You’ve replied that you can’t attend"
        case .notIncluded: "You’re not joining this plan"
        default: nil
        }
        return key.map { AppLocalization.string($0) } ?? status.title
    }

    var cardActionTitle: String {
        let key: String.LocalizationValue = switch nextStep {
        case .suggestActivity, .chooseActivity, .waitForActivity: "View activity ideas"
        case .confirm: "Review invitation"
        case .fillAvailability, .waitForOrganizer: "Open timetable"
        case .chooseTime: "Choose final time"
        case .shareAvailability, .shareInvitation: "Open and share"
        case .publishPlan: "Review and send"
        case .waitForReplies, .reviewReplies: "View progress"
        case .viewCalendar, .viewPlan, .notIncluded: "View arrangement"
        case .declined: "View my response"
        case .recordOutcome: "View activity feedback"
        }
        return AppLocalization.string(key)
    }

    static func manual(phase: String, isOwner: Bool, didRespond: Bool, respondedCount: Int,
                       myStatus: String?, isIncluded: Bool, fixed: Bool, accepted: Int, target: Int,
                       start: Date?, end: Date?, now: Date, activity: NativePlanActivity? = nil) -> Self {
        if phase == "COLLECTING", let activity, activity.isOpen {
            return Self(status: .choosingActivity,
                        nextStep: isOwner ? (respondedCount > (didRespond ? 1 : 0) ? .chooseTime : .shareAvailability)
                            : didRespond ? .waitForOrganizer : .fillAvailability,
                        detail: AppLocalization.string("Suggest activities and fill free time here. Neither is a commitment to attend."))
        }
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
                step = .publishPlan
                detail = "Send the final plan whenever you are ready. Only people who accepted will be notified."
            } else if myStatus == "ACCEPTED" && isIncluded {
                step = .waitForReplies
                detail = "You accepted. Waiting for the organizer to send the final plan."
            } else if (isIncluded && myStatus == "INVITED") || (fixed && accepted < target && myStatus == nil) {
                step = .confirm
                detail = "Accept, decline, or reply later. Only accepted participants join the final plan."
            } else {
                step = .notIncluded
                detail = "You are not included in this invitation. Your availability is saved."
            }
        case .confirmed, .inProgress:
            if isOwner || (isIncluded && myStatus == "ACCEPTED") {
                step = .viewCalendar
                detail = "Synced to Sideseat calendars"
            } else if myStatus == "DECLINED" {
                step = .declined
                detail = "Your reply is saved. You have not confirmed attendance."
            } else if start.map({ $0 > now }) == true && ((isIncluded && myStatus == "INVITED") || (fixed && accepted < target)) {
                step = .confirm
                detail = "The organizer sent the final plan. You can still accept before it starts."
            } else {
                step = .notIncluded
                detail = "Only accepted participants have this plan in their calendars."
            }
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
        return Self(status: status, nextStep: step, detail: AppLocalization.string(detail),
                    viewerHasConfirmed: !isOwner && isIncluded && myStatus == "ACCEPTED")
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
                       target: targetCount, start: chosenStart, end: chosenEnd, now: now, activity: activitySelection)
    }
}

extension NativeTimePollList.Item {
    func presentation(at now: Date) -> PlanPresentation {
        .manual(phase: planningPhase(at: now), isOwner: isOwner == true, didRespond: didRespond == true,
                respondedCount: respondedCount ?? 0, myStatus: myInvitationStatus,
                isIncluded: isOwner == true || isIncluded != false, fixed: planningMode == "FIXED",
                accepted: acceptedCount ?? 0, target: confirmationTarget, start: chosenStart, end: chosenEnd, now: now, activity: activitySelection)
    }
}

/// Concise overview dates, retaining exact cross-day / cross-year and foreign-zone context.
struct PlanOverviewTiming {
    let start: Date?
    let end: Date?
    var candidateDates: [String] = []
    let timeZone: String
    let now: Date
    let locale: Locale
    var viewerTimeZone: TimeZone = .current

    private var zone: TimeZone { TimeZone(identifier: timeZone) ?? .current }
    private var calendar: Calendar {
        var value = Calendar(identifier: .gregorian); value.timeZone = zone; return value
    }
    var crossesDay: Bool {
        guard let start, let end else { return false }
        return !calendar.isDate(start, inSameDayAs: end)
    }
    func datePart(_ date: Date, template: String) -> String {
        let format = DateFormatter()
        format.locale = locale; format.timeZone = zone
        format.setLocalizedDateFormatFromTemplate(template)
        return format.string(from: date)
    }
    func dayNumber(_ date: Date) -> String {
        calendar.component(.day, from: date).formatted(.number.locale(locale))
    }
    private func dateLabel(_ date: Date, weekday: Bool = true) -> String {
        let year = calendar.component(.year, from: date) != calendar.component(.year, from: now)
        return datePart(date, template: (year ? "y" : "") + "MMMd" + (weekday ? "EEE" : ""))
    }
    var dateText: String {
        if let start { return dateLabel(start) }
        let parser = DateFormatter()
        parser.locale = Locale(identifier: "en_US_POSIX"); parser.timeZone = zone; parser.dateFormat = "yyyy-MM-dd"
        let dates = candidateDates.compactMap { parser.date(from: $0) }.sorted()
        guard let first = dates.first, let last = dates.last else { return AppLocalization.string("No time selected yet") }
        if first == last { return dateLabel(first) }
        return String(format: AppLocalization.string("%d dates · %@"), dates.count,
                      dateLabel(first, weekday: false) + " – " + dateLabel(last, weekday: false))
    }
    var clockText: String? {
        guard let start, let end else { return nil }
        return datePart(start, template: "jmm") + " – "
            + (crossesDay ? dateLabel(end, weekday: false) + " " : "") + datePart(end, template: "jmm")
    }
    var zoneText: String? {
        guard zone.identifier != viewerTimeZone.identifier else { return nil }
        let date = start ?? now
        let name = zone.localizedName(for: .generic, locale: locale) ?? zone.identifier
        let offset = zone.abbreviation(for: date) ?? ""
        let endOffset = end.map { zone.abbreviation(for: $0) ?? "" }
        return name + " · " + offset + (endOffset != nil && endOffset != offset ? " / " + endOffset! : "")
    }
}
