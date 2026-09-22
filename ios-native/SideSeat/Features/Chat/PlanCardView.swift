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
    let onAnswer: (String) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: SideSeatTheme.spaceSM) {
            ViewThatFits(in: .horizontal) {
                compactOutcomeRow
                accessibleOutcomeStack
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("plan-outcome-\(plan.id)")
        .accessibilityHint(AppLocalization.string("Your answer stays private. Choose what actually happened."))
        .onChange(of: plan.viewerOutcome) { _, _ in isEditing = false }
    }

    private var compactOutcomeRow: some View {
        HStack(spacing: SideSeatTheme.spaceSM) {
            outcomeQuestion
            Spacer(minLength: SideSeatTheme.spaceXS)
            outcomeContent(horizontal: true)
        }
    }

    private var accessibleOutcomeStack: some View {
        VStack(alignment: .leading, spacing: SideSeatTheme.spaceSM) {
            outcomeQuestion
            outcomeContent(horizontal: false)
        }
    }

    private var outcomeQuestion: some View {
        HStack(spacing: 5) {
            Text("Did this plan happen?")
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(SideSeatTheme.textPrimary)
                .fixedSize(horizontal: true, vertical: false)
            if isSubmitting {
                ProgressView()
                    .controlSize(.small)
                    .accessibilityLabel("Saving")
            }
        }
    }

    @ViewBuilder
    private func outcomeContent(horizontal: Bool) -> some View {
        if plan.viewerOutcome == nil || isEditing {
            if horizontal {
                HStack(spacing: 6) {
                    outcomeButton(title: AppLocalization.string("Happened"), systemImage: "checkmark", value: "OCCURRED", tone: .success)
                    outcomeButton(title: AppLocalization.string("Didn't happen"), systemImage: "xmark", value: "DID_NOT_OCCUR", tone: .danger)
                }
            } else {
                VStack(spacing: 6) {
                    outcomeButton(title: AppLocalization.string("Happened"), systemImage: "checkmark", value: "OCCURRED", tone: .success)
                    outcomeButton(title: AppLocalization.string("Didn't happen"), systemImage: "xmark", value: "DID_NOT_OCCUR", tone: .danger)
                }
            }
        } else {
            HStack(spacing: 6) {
                savedOutcomeChip
                Button {
                    isEditing = true
                } label: {
                    Image(systemName: "pencil")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(SideSeatTheme.textSecondaryStrong)
                        .frame(width: 44, height: 44)
                        .background(SideSeatTheme.fillTertiary, in: Circle())
                }
                .buttonStyle(SSPressButtonStyle())
                .accessibilityLabel("Change answer")
                .accessibilityIdentifier("plan-outcome-edit-\(plan.id)")
            }
        }
    }

    private var savedOutcomeChip: some View {
        Label(savedAnswerTitle, systemImage: savedAnswerIcon)
            .font(.subheadline.weight(.semibold))
            .foregroundStyle(savedAnswerTone.foreground)
            .lineLimit(1)
            .minimumScaleFactor(0.78)
            .padding(.horizontal, 10)
            .frame(minHeight: 44)
            .background(savedAnswerTone.fill, in: Capsule())
            .overlay {
                Capsule().strokeBorder(savedAnswerTone.stroke, lineWidth: 1)
            }
            .accessibilityLabel(AppLocalization.string("Your answer is saved privately. Only you can see it."))
            .accessibilityValue(savedAnswerTitle)
            .accessibilityIdentifier("plan-outcome-saved-\(plan.id)")
    }

    private var savedAnswerTitle: String {
        switch plan.viewerOutcome {
        case "OCCURRED": AppLocalization.string("Happened")
        case "DID_NOT_OCCUR": AppLocalization.string("Didn't happen")
        default: AppLocalization.string("No response")
        }
    }

    private var savedAnswerIcon: String {
        switch plan.viewerOutcome {
        case "OCCURRED": "checkmark"
        case "DID_NOT_OCCUR": "xmark"
        default: "minus"
        }
    }

    private var savedAnswerTone: OutcomeTone {
        switch plan.viewerOutcome {
        case "OCCURRED": .success
        case "DID_NOT_OCCUR": .danger
        default: .neutral
        }
    }

    private func outcomeButton(
        title: String,
        systemImage: String,
        value: String,
        tone: OutcomeTone
    ) -> some View {
        let isSelected = plan.viewerOutcome == value
        return Button {
            onAnswer(value)
        } label: {
            Label(title, systemImage: systemImage)
                .font(.caption.weight(.semibold))
                .foregroundStyle(tone.foreground)
                .lineLimit(1)
                .minimumScaleFactor(0.72)
                .padding(.horizontal, 9)
                .frame(minHeight: 44)
                .background(tone.fill, in: Capsule())
                .overlay {
                    Capsule().strokeBorder(tone.stroke, lineWidth: 1)
                }
        }
        .buttonStyle(SSPressButtonStyle())
        .disabled(isSubmitting || isSelected)
        .accessibilityLabel(outcomeAccessibilityLabel(for: value))
        .accessibilityAddTraits(isSelected ? .isSelected : [])
        .accessibilityIdentifier("plan-outcome-\(value.lowercased())-\(plan.id)")
    }

    private func outcomeAccessibilityLabel(for value: String) -> String {
        switch value {
        case "OCCURRED": AppLocalization.string("Happened")
        case "DID_NOT_OCCUR": AppLocalization.string("Didn't happen")
        default: AppLocalization.string("No response")
        }
    }

    private enum OutcomeTone {
        case success
        case danger
        case neutral

        var foreground: Color {
            switch self {
            case .success: SideSeatTheme.statusSuccessText
            case .danger: SideSeatTheme.statusDangerText
            case .neutral: SideSeatTheme.textSecondaryStrong
            }
        }

        var fill: Color {
            switch self {
            case .success: SideSeatTheme.success.opacity(0.10)
            case .danger: SideSeatTheme.danger.opacity(0.08)
            case .neutral: SideSeatTheme.fillTertiary
            }
        }

        var stroke: Color {
            switch self {
            case .success: SideSeatTheme.success.opacity(0.24)
            case .danger: SideSeatTheme.danger.opacity(0.20)
            case .neutral: SideSeatTheme.separator.opacity(0.55)
            }
        }
    }
}
