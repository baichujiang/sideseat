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
                if plan.counterOfId != nil {
                    Text("Another time suggested")
                        .font(.caption2.weight(.semibold))
                        .foregroundStyle(SideSeatTheme.textSecondaryStrong)
                }
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

            if let note = plan.message?.trimmingCharacters(in: .whitespacesAndNewlines), !note.isEmpty {
                Text(note)
                    .font(.footnote)
                    .foregroundStyle(SideSeatTheme.textSecondaryStrong)
                    .fixedSize(horizontal: false, vertical: true)
            }

            Divider()

            if canRespond {
                Text("Accepting adds this plan to both calendars.")
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
                    Text("Withdraw plan")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.bordered)
                .disabled(isActing)
                .accessibilityIdentifier("plan-card-withdraw-\(plan.id)")
            } else if plan.status == "PENDING" {
                Label(
                    plan.proposer.id == currentUserID
                        ? AppLocalization.string( "Waiting for a response")
                        : AppLocalization.string( "Response pending"),
                    systemImage: "hourglass"
                )
                .font(.caption.weight(.medium))
                .foregroundStyle(SideSeatTheme.textSecondaryStrong)
            } else if plan.status == "ACCEPTED" {
                HStack(spacing: 8) {
                    Label("Added to both calendars", systemImage: "calendar.badge.checkmark")
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
                        title: AppLocalization.string("Suggest another time"),
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
                        title: AppLocalization.string("Suggest another time"),
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
        .clipShape(
            RoundedRectangle(cornerRadius: SideSeatTheme.controlRadius, style: .continuous)
        )
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
            Label {
                Text(
                    "\(start.formatted(date: .abbreviated, time: .shortened)) · \(end.formatted(date: .omitted, time: .shortened))"
                )
            } icon: {
                Image(systemName: "calendar")
            }
        } else {
            Label {
                Text(
                    "\(start.formatted(date: .abbreviated, time: .shortened)) – \(end.formatted(date: .abbreviated, time: .shortened))"
                )
            } icon: {
                Image(systemName: "calendar")
            }
        }
    }

    private var canRespond: Bool {
        return plan.isPending && plan.receiver.id == currentUserID
    }

    private var statusLabel: String {
        switch plan.status {
        case "PENDING": return AppLocalization.string( "Plan invite")
        case "ACCEPTED": return AppLocalization.string( "Plan confirmed")
        case "DECLINED": return AppLocalization.string( "Plan declined")
        case "COUNTER_PROPOSED": return AppLocalization.string( "Another time suggested")
        default: return AppLocalization.string( "Plan")
        }
    }

    private var statusDetail: String {
        switch plan.status {
        case "DECLINED": return AppLocalization.string( "This plan was declined.")
        case "COUNTER_PROPOSED": return AppLocalization.string( "A new time was proposed in the chat.")
        default: return AppLocalization.string( "This plan is no longer active.")
        }
    }

    private var statusIcon: String {
        switch plan.status {
        case "ACCEPTED": "checkmark.circle.fill"
        case "DECLINED": "xmark.circle.fill"
        case "COUNTER_PROPOSED": "arrow.triangle.2.circlepath"
        default: "calendar.badge.clock"
        }
    }

    private var statusTint: Color {
        switch plan.status {
        case "ACCEPTED": SideSeatTheme.success
        case "DECLINED": SideSeatTheme.danger
        case "COUNTER_PROPOSED": SideSeatTheme.warning
        default: SideSeatTheme.warning
        }
    }

    private var statusForeground: Color {
        switch plan.status {
        case "ACCEPTED": SideSeatTheme.statusSuccessText
        case "DECLINED": SideSeatTheme.statusDangerText
        case "COUNTER_PROPOSED", "PENDING": SideSeatTheme.statusWarningText
        default: SideSeatTheme.textSecondaryStrong
        }
    }
}
