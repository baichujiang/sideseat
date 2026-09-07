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
        VStack(alignment: .leading, spacing: SideSeatTheme.spaceMD) {
            HStack(spacing: 8) {
                Image(systemName: statusIcon)
                    .font(.caption.weight(.bold))
                    .foregroundStyle(statusForeground)
                    .frame(width: 26, height: 26)
                    .background(statusTint.opacity(0.12), in: Circle())
                Text(statusLabel)
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(statusForeground)
                Spacer(minLength: 6)
            }
            .accessibilityIdentifier("plan-card-\(plan.id)")

            Text(plan.title)
                .font(.body.weight(.semibold))
                .foregroundStyle(SideSeatTheme.textPrimary)
                .fixedSize(horizontal: false, vertical: true)

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
                        ? "Accepting replaces the confirmed time and updates both calendars."
                        : "Accepting confirms this Plan and adds it to both calendars."
                )
                .font(.caption)
                .foregroundStyle(SideSeatTheme.textSecondaryStrong)
                .fixedSize(horizontal: false, vertical: true)

                planResponseActions
                    .accessibilityElement(children: .contain)
                    .accessibilityIdentifier("plan-card-actions-\(plan.id)")
            } else if plan.status == "PENDING",
                      plan.proposer.id == currentUserID,
                      plan.usesActionCoordinationV2 {
                Button(role: .destructive, action: onWithdraw) {
                    Text(isRescheduleProposal ? "Withdraw new time" : "Withdraw proposal")
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
        .padding(SideSeatTheme.spaceLG)
        .frame(
            maxWidth: dynamicTypeSize.isAccessibilitySize ? .infinity : 320,
            alignment: .leading
        )
        .background(
            SideSeatTheme.Chat.cardSurface,
            in: RoundedRectangle(cornerRadius: SideSeatTheme.Chat.bubbleRadius, style: .continuous)
        )
        .overlay(
            RoundedRectangle(cornerRadius: SideSeatTheme.Chat.bubbleRadius, style: .continuous)
                .strokeBorder(statusTint.opacity(0.16), lineWidth: 1)
        )
    }

    @ViewBuilder
    private var planResponseActions: some View {
        Group {
            if dynamicTypeSize.isAccessibilitySize {
                VStack(spacing: 0) {
                    expandedResponseButton(
                        title: AppLocalization.string("Accept"),
                        foreground: SideSeatTheme.textPrimary,
                        background: SideSeatTheme.HubTint.plans.opacity(0.16),
                        identifier: "plan-card-accept-\(plan.id)",
                        action: onAccept
                    )
                    expandedActionDivider
                    expandedResponseButton(
                        title: AppLocalization.string("Propose new time"),
                        foreground: SideSeatTheme.textPrimary,
                        identifier: "plan-card-counter-\(plan.id)",
                        action: onCounter
                    )
                    expandedActionDivider
                    expandedResponseButton(
                        title: AppLocalization.string("Decline"),
                        foreground: SideSeatTheme.statusDangerText,
                        role: .destructive,
                        identifier: "plan-card-decline-\(plan.id)",
                        action: onDecline
                    )
                }
            } else {
                HStack(spacing: 0) {
                    compactResponseButton(
                        title: AppLocalization.string("Accept"),
                        foreground: SideSeatTheme.textPrimary,
                        background: SideSeatTheme.HubTint.plans.opacity(0.16),
                        identifier: "plan-card-accept-\(plan.id)",
                        action: onAccept
                    )
                    .frame(width: 68)

                    compactActionDivider

                    compactResponseButton(
                        title: AppLocalization.string("New time"),
                        foreground: SideSeatTheme.textPrimary,
                        lineLimit: 2,
                        identifier: "plan-card-counter-\(plan.id)",
                        action: onCounter
                    )

                    compactActionDivider

                    compactResponseButton(
                        title: AppLocalization.string("Decline"),
                        foreground: SideSeatTheme.statusDangerText,
                        role: .destructive,
                        identifier: "plan-card-decline-\(plan.id)",
                        action: onDecline
                    )
                    .frame(width: 68)
                }
                .frame(height: 44)
            }
        }
        .background(
            SideSeatTheme.fillTertiary,
            in: RoundedRectangle(cornerRadius: SideSeatTheme.controlRadius, style: .continuous)
        )
        .clipShape(RoundedRectangle(cornerRadius: SideSeatTheme.controlRadius, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: SideSeatTheme.controlRadius, style: .continuous)
                .strokeBorder(SideSeatTheme.separator.opacity(0.55), lineWidth: 0.5)
        }
    }

    private func compactResponseButton(
        title: String,
        foreground: Color,
        background: Color = .clear,
        role: ButtonRole? = nil,
        lineLimit: Int = 1,
        identifier: String,
        action: @escaping () -> Void
    ) -> some View {
        Button(role: role, action: action) {
            Text(title)
                .font(.caption.weight(.semibold))
                .lineLimit(lineLimit)
                .multilineTextAlignment(.center)
                .minimumScaleFactor(0.78)
                .foregroundStyle(foreground)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .contentShape(Rectangle())
                .background(background)
        }
        .buttonStyle(SSPressButtonStyle())
        .disabled(isActing)
        .accessibilityIdentifier(identifier)
    }

    private func expandedResponseButton(
        title: String,
        foreground: Color,
        background: Color = .clear,
        role: ButtonRole? = nil,
        identifier: String,
        action: @escaping () -> Void
    ) -> some View {
        Button(role: role, action: action) {
            Text(title)
                .font(.caption2.weight(.semibold))
                .foregroundStyle(foreground)
                .multilineTextAlignment(.leading)
                .lineLimit(2)
                .minimumScaleFactor(0.8)
                .allowsTightening(true)
                .padding(.horizontal, SideSeatTheme.spaceMD)
                .padding(.vertical, SideSeatTheme.spaceXS)
                .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
                .contentShape(Rectangle())
                .background(background)
        }
        .buttonStyle(SSPressButtonStyle())
        .disabled(isActing)
        .accessibilityIdentifier(identifier)
    }

    private var compactActionDivider: some View {
        Rectangle()
            .fill(SideSeatTheme.separator.opacity(0.7))
            .frame(width: 0.5, height: 22)
            .accessibilityHidden(true)
    }

    private var expandedActionDivider: some View {
        Rectangle()
            .fill(SideSeatTheme.separator.opacity(0.7))
            .frame(height: 0.5)
            .accessibilityHidden(true)
    }

    @ViewBuilder
    private func planDateDetails(start: Date, end: Date) -> some View {
        let calendar = Calendar.autoupdatingCurrent
        if calendar.isDate(start, inSameDayAs: end) {
            Label(
                "\(start.formatted(date: .abbreviated, time: .shortened)) · \(end.formatted(date: .omitted, time: .shortened))",
                systemImage: "calendar"
            )
        } else {
            Label(
                "\(start.formatted(date: .abbreviated, time: .shortened)) – \(end.formatted(date: .abbreviated, time: .shortened))",
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

    private var statusTint: Color {
        switch plan.status {
        case "ACCEPTED": SideSeatTheme.success
        case "DECLINED", "CANCELED": SideSeatTheme.danger
        case "COUNTER_PROPOSED", "EXPIRED": SideSeatTheme.warning
        default: SideSeatTheme.warning
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
    let plan: NativePlanRequest
    let isSubmitting: Bool
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

            Text("A quick private response helps evaluate whether SideSeat creates real plans.")
                .font(.footnote)
                .foregroundStyle(SideSeatTheme.textSecondaryStrong)
                .fixedSize(horizontal: false, vertical: true)

            VStack(spacing: SideSeatTheme.spaceSM) {
                outcomeButton(
                    title: AppLocalization.string("Happened"),
                    systemImage: "checkmark.circle.fill",
                    value: "OCCURRED",
                    tint: SideSeatTheme.statusSuccessText
                )
                outcomeButton(
                    title: AppLocalization.string("Didn't happen"),
                    systemImage: "xmark.circle",
                    value: "DID_NOT_OCCUR",
                    tint: SideSeatTheme.textSecondaryStrong
                )
                outcomeButton(
                    title: AppLocalization.string("Skip"),
                    systemImage: "forward.fill",
                    value: "PREFER_NOT_TO_SAY",
                    tint: SideSeatTheme.textSecondaryStrong
                )
            }

            if plan.viewerOutcome != nil {
                Label("Your answer is saved privately. Only you can see it.", systemImage: "checkmark.shield.fill")
                    .font(.caption)
                    .foregroundStyle(SideSeatTheme.textSecondaryStrong)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityIdentifier("plan-outcome-saved-\(plan.id)")
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("plan-outcome-\(plan.id)")
    }

    private func outcomeButton(
        title: String,
        systemImage: String,
        value: String,
        tint: Color
    ) -> some View {
        let isSelected = plan.viewerOutcome == value
        return Button {
            onAnswer(value)
        } label: {
            HStack(spacing: SideSeatTheme.spaceSM) {
                Image(systemName: isSelected ? "checkmark.circle.fill" : systemImage)
                    .frame(width: 20)
                Text(title)
                    .font(.subheadline.weight(.semibold))
                Spacer(minLength: SideSeatTheme.spaceSM)
                if isSelected {
                    Text("Selected")
                        .font(.caption)
                }
            }
            .foregroundStyle(isSelected ? tint : SideSeatTheme.textPrimary)
            .padding(.horizontal, SideSeatTheme.spaceMD)
            .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
            .background(
                isSelected ? tint.opacity(0.12) : SideSeatTheme.fillTertiary,
                in: RoundedRectangle(
                    cornerRadius: SideSeatTheme.controlRadius,
                    style: .continuous
                )
            )
            .overlay {
                RoundedRectangle(
                    cornerRadius: SideSeatTheme.controlRadius,
                    style: .continuous
                )
                .strokeBorder(
                    isSelected ? tint.opacity(0.5) : SideSeatTheme.separator.opacity(0.55),
                    lineWidth: isSelected ? 1 : 0.5
                )
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(SSPressButtonStyle())
        .disabled(isSubmitting || isSelected)
        .accessibilityIdentifier("plan-outcome-\(value.lowercased())-\(plan.id)")
        .accessibilityAddTraits(isSelected ? .isSelected : [])
    }
}
