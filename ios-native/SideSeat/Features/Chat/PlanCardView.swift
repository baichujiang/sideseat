import SwiftUI

struct PlanCardView: View {
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    @Environment(DeepLinkRouter.self) private var deepLinkRouter

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
        SSFlowCard(contentPadding: 12, contentSpacing: SideSeatTheme.spaceSM) {
            HStack(alignment: .top) {
                let titleLayout = dynamicTypeSize.isAccessibilitySize
                    ? AnyLayout(VStackLayout(alignment: .leading, spacing: 4))
                    : AnyLayout(HStackLayout(alignment: .firstTextBaseline, spacing: 8))
                titleLayout {
                    Text(plan.title)
                        .font(.headline)
                        .foregroundStyle(SideSeatTheme.textPrimary)
                        .fixedSize(horizontal: false, vertical: true)
                        .frame(maxWidth: .infinity, alignment: .leading)
                    Label(statusLabel, systemImage: statusIcon)
                        .font(.caption.weight(.medium))
                        .foregroundStyle(statusForeground)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .accessibilityIdentifier("plan-card-\(plan.id)")
                if canCancel {
                    Menu {
                        Button(role: .destructive, action: onWithdraw) {
                            Label(plan.status == "ACCEPTED" ? "Cancel plan" : "Withdraw proposal", systemImage: "xmark.circle")
                        }.accessibilityIdentifier("plan-cancel-menu-action")
                    } label: {
                        Image(systemName: "ellipsis").frame(width: 44, height: 44)
                    }
                    .disabled(isActing)
                    .accessibilityLabel("Plan options")
                    .accessibilityIdentifier("plan-options-\(plan.id)")
                }
            }

            VStack(alignment: .leading, spacing: 4) {
                if let start = plan.startDate, let end = plan.endDate {
                    TimelineView(.periodic(from: .now, by: 60)) { context in
                        planDateDetails(start: start, end: end, now: context.date)
                    }
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
                .padding(SideSeatTheme.spaceSM)
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

            if plan.status != "PENDING" || canRespond { Divider() }

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
                    .buttonStyle(SSPressButtonStyle())
                    .accessibilityLabel("View calendar")
                    .accessibilityIdentifier("plan-card-calendar-\(plan.id)")
                }
            } else if plan.status != "PENDING" {
                Text(statusDetail)
                    .font(.caption)
                    .foregroundStyle(SideSeatTheme.textSecondaryStrong)
                if let cancellation = plan.cancellation {
                    Text(cancellation.wasConfirmed
                        ? (cancellation.actorId == currentUserID ? "Canceled by you" : "Canceled by the other person")
                        : (cancellation.actorId == currentUserID ? "Withdrawn by you" : "Withdrawn by the other person"))
                        .font(.caption).foregroundStyle(.secondary)
                    if let reason = cancellation.reasonCode {
                        Text(PlanCancellationSheet.reasonLabel(reason)).font(.footnote)
                    }
                    if let note = cancellation.note, !note.isEmpty { Text(note).font(.footnote) }
                }
                if plan.status == "CANCELED" {
                    Button {
                        PlanRebookingLaunch.shared.plan = plan
                        deepLinkRouter.handleAppPath("/together")
                    } label: { Label("Find other company", systemImage: "person.2") }
                    .buttonStyle(.bordered)
                    .accessibilityIdentifier("plan-find-company")
                }
            }
        }
        .frame(
            maxWidth: dynamicTypeSize.isAccessibilitySize ? .infinity : 340,
            alignment: .leading
        )
    }

    private var canCancel: Bool {
        (plan.endDate ?? .distantPast) > Date() &&
        (plan.status == "ACCEPTED" || (plan.status == "PENDING" && plan.proposer.id == currentUserID))
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

    private func planDateDetails(start: Date, end: Date, now: Date) -> some View {
        let calendar = Calendar.autoupdatingCurrent
        let locale = AppLocalization.selectedLanguage.locale
        let dates: String
        if calendar.isDate(start, inSameDayAs: end) {
            dates = "\(start.formatted(.dateTime.year().month(.abbreviated).day().hour().minute().locale(locale)))–\(end.formatted(.dateTime.hour().minute().locale(locale)))"
        } else {
            dates = "\(start.formatted(.dateTime.year().month(.abbreviated).day().hour().minute().locale(locale))) – \(end.formatted(.dateTime.year().month(.abbreviated).day().hour().minute().locale(locale)))"
        }
        let relative = PlanRelativeTime.value(status: plan.status, start: start, end: end, now: now)
        return Label {
            (Text(relative.map { "\($0.title) · " } ?? "").fontWeight(.semibold) + Text(dates))
                .fixedSize(horizontal: false, vertical: true)
        } icon: {
            Image(systemName: "calendar")
        }
        .accessibilityIdentifier("plan-card-time-\(plan.id)")
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
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    @State private var isEditing = false
    let plan: NativePlanRequest
    let isSubmitting: Bool
    var showsSavedQuestion = true
    let onAnswer: (String) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: SideSeatTheme.spaceSM) {
            if !showsSavedQuestion, plan.viewerOutcome != nil, !isEditing {
                outcomeContent(horizontal: true)
            } else if dynamicTypeSize.isAccessibilitySize {
                accessibleOutcomeStack
            } else {
                ViewThatFits(in: .horizontal) {
                    compactOutcomeRow
                    accessibleOutcomeStack
                }
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("plan-outcome-\(plan.id)")
        .accessibilityHint(AppLocalization.string("Your answer stays private. Choose what actually happened."))
        .onChange(of: plan.viewerOutcome) { _, _ in isEditing = false }
    }

    private var compactOutcomeRow: some View {
        HStack(spacing: SideSeatTheme.spaceSM) {
            outcomeQuestion(allowsWrapping: false)
            Spacer(minLength: SideSeatTheme.spaceXS)
            outcomeContent(horizontal: true)
        }
    }

    private var accessibleOutcomeStack: some View {
        VStack(alignment: .leading, spacing: SideSeatTheme.spaceSM) {
            outcomeQuestion(allowsWrapping: true)
            outcomeContent(horizontal: false)
        }
    }

    private func outcomeQuestion(allowsWrapping: Bool) -> some View {
        HStack(spacing: 5) {
            Text("Did this plan happen?")
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(SideSeatTheme.textPrimary)
                .fixedSize(horizontal: !allowsWrapping, vertical: allowsWrapping)
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
