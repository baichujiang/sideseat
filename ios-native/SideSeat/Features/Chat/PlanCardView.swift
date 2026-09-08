import SwiftUI

struct PlanCardView: View {
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    let plan: NativePlanRequest
    let currentUserID: String
    let isActing: Bool
    let onAccept: () -> Void
    let onDecline: () -> Void
    let onWithdraw: () -> Void
    let onCounter: () -> Void
    let onRecordOutcome: (String) -> Void
    let onRecordMeetAgain: (String) -> Void
    let onOpenCalendar: () -> Void

    var body: some View {
        SSFlowCard {
            SSFlowCardHeader(
                title: plan.title,
                subtitle: statusLabel,
                systemImage: statusIcon,
                tint: statusForeground
            )
            .accessibilityIdentifier("plan-card-\(plan.id)")

            VStack(alignment: .leading, spacing: 7) {
                if let start = plan.startDate, let end = plan.endDate {
                    planDateDetails(start: start, end: end)
                }
                if let location = plan.location?.trimmingCharacters(in: .whitespacesAndNewlines), !location.isEmpty {
                    Label(location, systemImage: "mappin.and.ellipse")
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            .font(.footnote)
            .foregroundStyle(SideSeatTheme.textSecondaryStrong)

            if isRescheduleProposal {
                Label(
                    "The confirmed Plan stays unchanged until this new time is accepted.",
                    systemImage: "calendar.badge.clock"
                )
                .font(.footnote)
                .foregroundStyle(SideSeatTheme.textSecondaryStrong)
                .fixedSize(horizontal: false, vertical: true)
                .padding(SideSeatTheme.spaceMD)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(
                    SideSeatTheme.fillTertiary,
                    in: RoundedRectangle(
                        cornerRadius: SideSeatTheme.controlRadius,
                        style: .continuous
                    )
                )
                .accessibilityIdentifier("plan-card-reschedule-keeps-confirmed-\(plan.id)")
            }

            if let note = plan.message?.trimmingCharacters(in: .whitespacesAndNewlines), !note.isEmpty {
                Text(note)
                    .font(.footnote)
                    .foregroundStyle(SideSeatTheme.textSecondaryStrong)
                    .fixedSize(horizontal: false, vertical: true)
            }

            Divider()

            if canRespond {
                Text(
                    isRescheduleProposal
                        ? AppLocalization.string("Accepting replaces the confirmed time and updates both calendars.")
                        : AppLocalization.string("Accepting confirms this Plan and adds it to both calendars.")
                )
                .font(.caption)
                .foregroundStyle(SideSeatTheme.textSecondaryStrong)
                .fixedSize(horizontal: false, vertical: true)

                planResponseActions
                    .accessibilityElement(children: .contain)
                    .accessibilityIdentifier("plan-card-actions-\(plan.id)")
            } else if plan.status == "PENDING",
                plan.proposer.id == currentUserID,
                plan.usesActionCoordinationV2
            {
                Button(role: .destructive, action: onWithdraw) {
                    Text(
                        isRescheduleProposal
                            ? AppLocalization.string("Withdraw new time")
                            : AppLocalization.string("Withdraw proposal")
                    )
                    .frame(maxWidth: .infinity)
                }
                .buttonStyle(.bordered)
                .disabled(isActing)
                .accessibilityIdentifier("plan-card-withdraw-\(plan.id)")
            } else if plan.status == "PENDING" {
                Label(
                    plan.proposer.id == currentUserID
                        ? AppLocalization.string("Waiting for a response")
                        : AppLocalization.string("Response pending"),
                    systemImage: "hourglass"
                )
                .font(.caption.weight(.medium))
                .foregroundStyle(SideSeatTheme.textSecondaryStrong)
            } else if plan.isOutcomeEligible() {
                PlanOutcomePromptView(
                    plan: plan,
                    isSubmitting: isActing,
                    onMeetAgain: onRecordMeetAgain,
                    onAnswer: onRecordOutcome
                )
            } else if plan.status == "ACCEPTED" {
                HStack(spacing: 8) {
                    Label("Confirmed in both calendars", systemImage: "calendar.badge.checkmark")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(SideSeatTheme.statusSuccessText)
                    Spacer(minLength: 4)
                    Button(action: onOpenCalendar) {
                        Image(systemName: "arrow.up.right")
                            .font(.caption.weight(.bold))
                            .frame(width: 44, height: 44)
                    }
                    .buttonStyle(.bordered)
                    .accessibilityLabel("View calendar")
                    .accessibilityIdentifier("plan-card-calendar-\(plan.id)")
                }
            } else {
                Text(statusDetail)
                    .font(.caption)
                    .foregroundStyle(SideSeatTheme.textSecondaryStrong)
            }
        }
        .frame(
            maxWidth: dynamicTypeSize.isAccessibilitySize ? .infinity : 340,
            alignment: .leading
        )
    }

    private var planResponseActions: some View {
        VStack(spacing: SideSeatTheme.spaceSM) {
            SSPrimaryButton(
                title: AppLocalization.string("Accept"),
                isLoading: isActing,
                fill: .product,
                height: 46,
                accessibilityID: "plan-card-accept-\(plan.id)",
                action: onAccept
            )
            let layout =
                dynamicTypeSize.isAccessibilitySize
                ? AnyLayout(VStackLayout(spacing: SideSeatTheme.spaceXS))
                : AnyLayout(HStackLayout(spacing: SideSeatTheme.spaceSM))
            layout {
                Button(action: onCounter) {
                    Text("Propose new time")
                        .font(.subheadline.weight(.medium))
                        .fixedSize(horizontal: false, vertical: true)
                        .frame(maxWidth: .infinity, minHeight: 44)
                        .contentShape(Rectangle())
                }
                .accessibilityIdentifier("plan-card-counter-\(plan.id)")
                Button(role: .destructive, action: onDecline) {
                    Text("Decline")
                        .font(.subheadline.weight(.medium))
                        .frame(maxWidth: .infinity, minHeight: 44)
                        .contentShape(Rectangle())
                }
                .accessibilityIdentifier("plan-card-decline-\(plan.id)")
            }
            .buttonStyle(SSPressButtonStyle())
        }
        .disabled(isActing)
    }

    @ViewBuilder
    private func planDateDetails(start: Date, end: Date) -> some View {
        let calendar = Calendar.autoupdatingCurrent
        let locale = AppLocalization.selectedLanguage.locale
        if calendar.isDate(start, inSameDayAs: end) {
            Label(
                "\(start.formatted(.dateTime.year().month(.abbreviated).day().hour().minute().locale(locale))) · \(end.formatted(.dateTime.hour().minute().locale(locale)))",
                systemImage: "calendar"
            )
        } else {
            Label(
                "\(start.formatted(.dateTime.year().month(.abbreviated).day().hour().minute().locale(locale))) – \(end.formatted(.dateTime.year().month(.abbreviated).day().hour().minute().locale(locale)))",
                systemImage: "calendar"
            )
        }
    }

    private var canRespond: Bool {
        plan.isPending && plan.receiver.id == currentUserID
    }

    private var isRescheduleProposal: Bool {
        plan.status == "PENDING" && plan.counterOfId != nil && plan.commitmentId != nil
    }

    private var statusLabel: String {
        if isRescheduleProposal { return AppLocalization.string("Reschedule proposed") }
        switch plan.status {
        case "PENDING": return AppLocalization.string("Proposed")
        case "ACCEPTED": return AppLocalization.string("Confirmed")
        case "DECLINED": return AppLocalization.string("Declined")
        case "COUNTER_PROPOSED": return AppLocalization.string("Superseded")
        case "CANCELED": return AppLocalization.string("Canceled")
        case "EXPIRED": return AppLocalization.string("Expired")
        case "INVALIDATED": return AppLocalization.string("Ended")
        default: return AppLocalization.string("Plan")
        }
    }

    private var statusDetail: String {
        switch plan.status {
        case "DECLINED": return AppLocalization.string("This proposal was declined.")
        case "COUNTER_PROPOSED": return AppLocalization.string("A newer proposal is now in the conversation.")
        case "CANCELED": return AppLocalization.string("This proposal was withdrawn or canceled.")
        case "EXPIRED": return AppLocalization.string("This proposal expired before it was confirmed.")
        case "INVALIDATED": return AppLocalization.string("This Plan is no longer available.")
        default: return AppLocalization.string("This Plan is no longer active.")
        }
    }

    private var statusIcon: String {
        switch plan.status {
        case "ACCEPTED": "checkmark.circle.fill"
        case "DECLINED": "xmark.circle.fill"
        case "COUNTER_PROPOSED": "arrow.triangle.2.circlepath"
        case "CANCELED": "calendar.badge.minus"
        case "EXPIRED": "clock.badge.exclamationmark"
        default: "calendar.badge.clock"
        }
    }

    private var statusForeground: Color {
        switch plan.status {
        case "ACCEPTED": SideSeatTheme.statusSuccessText
        case "DECLINED", "CANCELED": SideSeatTheme.statusDangerText
        case "COUNTER_PROPOSED", "EXPIRED", "PENDING": SideSeatTheme.statusWarningText
        default: SideSeatTheme.textSecondaryStrong
        }
    }
}

struct PlanOutcomePromptView: View {
    @State private var isEditing = false
    let plan: NativePlanRequest
    let isSubmitting: Bool
    var onMeetAgain: ((String) -> Void)? = nil
    let onAnswer: (String) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: SideSeatTheme.spaceMD) {
            HStack(alignment: .firstTextBaseline, spacing: SideSeatTheme.spaceSM) {
                Label("Did it happen?", systemImage: "lock.fill")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(SideSeatTheme.textPrimary)
                Spacer(minLength: SideSeatTheme.spaceSM)
                if isSubmitting {
                    ProgressView()
                        .controlSize(.small)
                        .accessibilityLabel("Saving")
                }
            }

            Text("Your answer stays private. Choose what actually happened.")
                .font(.footnote)
                .foregroundStyle(SideSeatTheme.textSecondaryStrong)
                .fixedSize(horizontal: false, vertical: true)

            if plan.viewerOutcome == nil || isEditing {
                VStack(spacing: SideSeatTheme.spaceSM) {
                    outcomeButton(
                        title: AppLocalization.string("Happened"),
                        systemImage: "checkmark.circle.fill",
                        value: "OCCURRED"
                    )
                    outcomeButton(
                        title: AppLocalization.string("Didn't happen"),
                        systemImage: "xmark.circle",
                        value: "DID_NOT_OCCUR"
                    )
                    outcomeButton(
                        title: AppLocalization.string("Skip"),
                        systemImage: "forward.fill",
                        value: "PREFER_NOT_TO_SAY"
                    )
                }
            } else {
                HStack(alignment: .firstTextBaseline, spacing: SideSeatTheme.spaceSM) {
                    Text(savedAnswerTitle)
                        .font(.subheadline.weight(.semibold))
                    Spacer(minLength: 0)
                    Button {
                        isEditing = true
                    } label: {
                        Text("Change answer")
                            .font(.subheadline)
                            .frame(minHeight: 44)
                            .contentShape(Rectangle())
                    }
                    .accessibilityIdentifier("plan-outcome-edit-\(plan.id)")
                }
            }

            if plan.viewerOutcome != nil {
                Label("Your answer is saved privately. Only you can see it.", systemImage: "checkmark.shield.fill")
                    .font(.caption)
                    .foregroundStyle(SideSeatTheme.textSecondaryStrong)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityIdentifier("plan-outcome-saved-\(plan.id)")
            }

            if plan.showsMeetAgain, let onMeetAgain {
                Divider()
                PlanMeetAgainPromptView(plan: plan, isSubmitting: isSubmitting, onAnswer: onMeetAgain)
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("plan-outcome-\(plan.id)")
        .onChange(of: plan.viewerOutcome) { _, _ in isEditing = false }
    }

    private var savedAnswerTitle: String {
        switch plan.viewerOutcome {
        case "OCCURRED": AppLocalization.string("Happened")
        case "DID_NOT_OCCUR": AppLocalization.string("Didn't happen")
        default: AppLocalization.string("Skip")
        }
    }

    private func outcomeButton(
        title: String,
        systemImage: String,
        value: String
    ) -> some View {
        let isSelected = plan.viewerOutcome == value
        return SSFlowChoice(
            title: title,
            systemImage: systemImage,
            isSelected: isSelected
        ) {
            onAnswer(value)
        }
        .disabled(isSubmitting || isSelected)
        .accessibilityIdentifier("plan-outcome-\(value.lowercased())-\(plan.id)")
    }
}

struct PlanMeetAgainPromptView: View {
    @State private var isEditing = false
    let plan: NativePlanRequest
    let isSubmitting: Bool
    let onAnswer: (String) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: SideSeatTheme.spaceSM) {
            Label("Would you meet again?", systemImage: "arrow.triangle.2.circlepath")
                .font(.subheadline.weight(.semibold))
            Text("Your choice is private. A future opportunity still needs new intentions and consent.")
                .font(.footnote)
                .foregroundStyle(SideSeatTheme.textSecondaryStrong)
                .fixedSize(horizontal: false, vertical: true)
            if plan.viewerMeetAgain == nil || isEditing {
                choice("I'd be open to it", icon: "checkmark.circle", value: "YES")
                    .disabled(plan.meetAgainAvailable != true)
                choice("Not this time", icon: "minus.circle", value: "NO")
            } else {
                HStack {
                    Text(savedTitle).font(.subheadline.weight(.medium))
                    Spacer(minLength: SideSeatTheme.spaceSM)
                    Button("Change answer") { isEditing = true }
                        .frame(minHeight: 44)
                        .accessibilityIdentifier("plan-meet-again-edit-\(plan.id)")
                }
                if plan.viewerMeetAgain == "YES" {
                    Button("Withdraw permission") { onAnswer("WITHDRAWN") }
                        .frame(minHeight: 44)
                        .accessibilityIdentifier("plan-meet-again-withdraw-\(plan.id)")
                }
                Label("Only your choice is shown. You can change it anytime.", systemImage: "lock.fill")
                    .font(.caption)
                    .foregroundStyle(SideSeatTheme.textSecondaryStrong)
                    .accessibilityIdentifier("plan-meet-again-saved-\(plan.id)")
            }
        }
        .disabled(isSubmitting)
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("plan-meet-again-\(plan.id)")
        .onChange(of: plan.viewerMeetAgain) { _, _ in isEditing = false }
    }

    private var savedTitle: String {
        switch plan.viewerMeetAgain {
        case "YES": AppLocalization.string("Open to meeting again")
        case "NO": AppLocalization.string("Not this time")
        default: AppLocalization.string("Permission withdrawn")
        }
    }

    private func choice(_ title: String.LocalizationValue, icon: String, value: String) -> some View {
        SSFlowChoice(title: AppLocalization.string(title), systemImage: icon,
                     isSelected: plan.viewerMeetAgain == value) { onAnswer(value) }
            .accessibilityIdentifier("plan-meet-again-\(value.lowercased())-\(plan.id)")
    }
}
