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
    var onRepeat: (() -> Void)? = nil

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
                    showsSavedQuestion: false,
                    onAnswer: onRecordOutcome
                )
                PlanContinuationActions(plan: plan, currentUserID: currentUserID,
                                        isDisabled: isActing, onRepeat: onRepeat)
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

struct PlanContinuationActions: View {
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    @Environment(DeepLinkRouter.self) private var deepLinkRouter
    @State private var showsNewIntention = false
    @State private var publishedIntentID: String?
    let plan: NativePlanRequest
    let currentUserID: String
    var isDisabled = false
    var onRepeat: (() -> Void)?

    var body: some View {
        VStack(spacing: SideSeatTheme.spaceXS) {
            if let onRepeat {
                PlanRepeatButton(plan: plan, isDisabled: isDisabled,
                                 recipientName: plan.proposer.id == currentUserID
                                    ? plan.receiver.displayName : plan.proposer.displayName,
                                 action: onRepeat)
            }
            if ActionToPlanV2Store.shared.isWeeklyIntentEnabled {
                Button { showsNewIntention = true } label: {
                    Text(AppLocalization.string(dynamicTypeSize.isAccessibilitySize
                        ? "New intention (compact)" : "Publish new intention"))
                        .font(.subheadline.weight(.medium))
                        .fixedSize(horizontal: false, vertical: true)
                        .frame(maxWidth: .infinity, minHeight: 44)
                        .contentShape(Rectangle())
                }
                .buttonStyle(SSPressButtonStyle())
                .foregroundStyle(SideSeatTheme.utilityAction)
                .disabled(isDisabled)
                .accessibilityLabel(AppLocalization.string("Publish new intention"))
                .accessibilityIdentifier("plan-new-intention-\(plan.id)")
            }
        }
        .sheet(isPresented: $showsNewIntention, onDismiss: {
            guard let id = publishedIntentID else { return }
            publishedIntentID = nil
            IntentionPublicationLaunch.shared.intentID = id
            deepLinkRouter.handleAppPath("/together")
        }) {
            CompletedPlanIntentionSheet(draft: CompletedPlanIntentDraft(plan: plan)) { id in
                publishedIntentID = id
                showsNewIntention = false
            }
        }
    }
}

struct PlanRepeatButton: View {
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    let plan: NativePlanRequest
    var isDisabled = false
    var recipientName: String? = nil
    let action: () -> Void

    var body: some View {
        let title = plan.viewerOutcome == "DID_NOT_OCCUR"
            ? AppLocalization.string("Arrange another time")
            : recipientName.map { String(format: AppLocalization.string("Plan again with %@"), $0) }
                ?? AppLocalization.string("Plan again")
        Group {
            if dynamicTypeSize.isAccessibilitySize {
                Button(action: action) {
                    Text(AppLocalization.string(plan.viewerOutcome == "DID_NOT_OCCUR"
                        ? "New time (compact)" : "Plan again (compact)"))
                        .font(.body.weight(.semibold))
                        .fixedSize(horizontal: false, vertical: true)
                        .padding(.horizontal, SideSeatTheme.spaceSM)
                        .padding(.vertical, SideSeatTheme.spaceXS)
                        .frame(maxWidth: .infinity, minHeight: 44)
                        .foregroundStyle(plan.viewerOutcome != nil
                            ? SideSeatTheme.ProductAction.foreground : SideSeatTheme.utilityAction)
                        .background(plan.viewerOutcome != nil ? SideSeatTheme.ProductAction.fill : Color.clear,
                            in: RoundedRectangle(cornerRadius: SideSeatTheme.controlRadius))
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel(title)
                .accessibilityIdentifier("plan-repeat-\(plan.id)")
            } else if plan.viewerOutcome != nil {
                SSPrimaryButton(title: title, fill: .product, height: 46,
                                accessibilityID: "plan-repeat-\(plan.id)", action: action)
            } else {
                Button(action: action) {
                    Text(title).font(.subheadline.weight(.medium))
                        .frame(maxWidth: .infinity, minHeight: 44)
                        .contentShape(Rectangle())
                }
                .buttonStyle(SSPressButtonStyle())
                .accessibilityIdentifier("plan-repeat-\(plan.id)")
            }
        }
        .disabled(isDisabled)
    }
}

struct PlanOutcomePromptView: View {
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    @State private var isEditing = false
    @State private var attemptedAnswer: String?
    @State private var saveIssue: String?
    @AccessibilityFocusState private var outcomeFocus: OutcomeFocus?
    private enum OutcomeFocus: Hashable { case saved, edit, question, issue }
    let plan: NativePlanRequest
    let isSubmitting: Bool
    var showsSavedQuestion = true
    let onAnswer: (String) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: SideSeatTheme.spaceSM) {
            if dynamicTypeSize.isAccessibilitySize || isEditing {
                accessibleOutcomeStack
            } else {
                ViewThatFits(in: .horizontal) {
                    compactOutcomeRow.fixedSize(horizontal: true, vertical: true)
                    accessibleOutcomeStack
                }
            }
            if isSubmitting && attemptedAnswer != nil {
                HStack(spacing: 8) {
                    ProgressView().accessibilityHidden(true)
                    Text("Saving").fixedSize(horizontal: false, vertical: true)
                }
                .font(.subheadline).accessibilityElement(children: .combine)
                .accessibilityIdentifier("plan-outcome-saving-\(plan.id)")
            }
            if let saveIssue {
                Text(saveIssue).font(.subheadline).foregroundStyle(SideSeatTheme.danger)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityFocused($outcomeFocus, equals: .issue)
                    .accessibilityIdentifier("plan-outcome-error-\(plan.id)")
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("plan-outcome-\(plan.id)")
        .accessibilityHint(AppLocalization.string("Your answer stays private. Choose what actually happened."))
        .onChange(of: plan.viewerOutcome) { _, answer in
            guard let attemptedAnswer, answer == attemptedAnswer else { return }
            finishSave()
        }
        .onChange(of: isSubmitting) { wasSubmitting, nowSubmitting in
            guard wasSubmitting, !nowSubmitting, let attemptedAnswer else { return }
            if plan.viewerOutcome == attemptedAnswer {
                finishSave()
            } else {
                self.attemptedAnswer = nil
                saveIssue = AppLocalization.string("Your answer was not confirmed. Please try again.")
                outcomeFocus = .issue
            }
        }
    }

    private func finishSave() {
        attemptedAnswer = nil
        saveIssue = nil
        isEditing = false
        outcomeFocus = .saved
    }

    private var shouldShowQuestion: Bool { showsSavedQuestion || plan.viewerOutcome == nil || isEditing }

    private var compactOutcomeRow: some View {
        HStack(spacing: SideSeatTheme.spaceSM) {
            if shouldShowQuestion { outcomeQuestion }
            if plan.viewerOutcome == nil {
                answerChoices(horizontal: true)
            } else {
                savedOutcomeChip(stacked: false)
                editButton(compact: true)
            }
        }
    }

    private var accessibleOutcomeStack: some View {
        VStack(alignment: .leading, spacing: SideSeatTheme.spaceSM) {
            if shouldShowQuestion { outcomeQuestion }
            if plan.viewerOutcome != nil {
                savedOutcomeChip(stacked: true)
            }
            if plan.viewerOutcome == nil || isEditing {
                answerChoices(horizontal: false)
                if isEditing {
                    Button {
                        isEditing = false
                        saveIssue = nil
                        outcomeFocus = .edit
                    } label: {
                        Text("Cancel editing answer").font(.subheadline)
                            .fixedSize(horizontal: false, vertical: true)
                            .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain).foregroundStyle(SideSeatTheme.utilityAction)
                    .disabled(isSubmitting)
                    .accessibilityIdentifier("plan-outcome-cancel-\(plan.id)")
                }
            } else {
                editButton(compact: false)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var outcomeQuestion: some View {
        Text("Did this plan happen?").font(.subheadline.weight(.semibold))
            .foregroundStyle(SideSeatTheme.textPrimary)
            .fixedSize(horizontal: false, vertical: true)
            .accessibilityFocused($outcomeFocus, equals: .question)
    }

    @ViewBuilder private func answerChoices(horizontal: Bool) -> some View {
        if horizontal {
            HStack(spacing: 6) {
                outcomeButton(title: AppLocalization.string("Happened"), systemImage: "checkmark", value: "OCCURRED", tone: .success, stacked: false)
                outcomeButton(title: AppLocalization.string("Didn't happen"), systemImage: "xmark", value: "DID_NOT_OCCUR", tone: .danger, stacked: false)
            }
        } else {
            VStack(spacing: 6) {
                outcomeButton(title: AppLocalization.string("Happened"), systemImage: "checkmark", value: "OCCURRED", tone: .success, stacked: true)
                outcomeButton(title: AppLocalization.string("Didn't happen"), systemImage: "xmark", value: "DID_NOT_OCCUR", tone: .danger, stacked: true)
            }
        }
    }

    private func editButton(compact: Bool) -> some View {
        Button {
            isEditing = true
            saveIssue = nil
            outcomeFocus = .question
        } label: {
            HStack(spacing: 8) {
                Image(systemName: "pencil").font(.system(size: 18)).accessibilityHidden(true)
                if !compact {
                    Text("Change answer").font(.subheadline).fixedSize(horizontal: false, vertical: true)
                }
            }
            .frame(minWidth: 44, maxWidth: compact ? nil : .infinity, minHeight: 44, alignment: compact ? .center : .leading)
            .background(compact ? SideSeatTheme.fillTertiary : Color.clear, in: Circle())
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain).foregroundStyle(SideSeatTheme.utilityAction)
        .disabled(isSubmitting)
        .accessibilityLabel("Change answer")
        .accessibilityFocused($outcomeFocus, equals: .edit)
        .accessibilityIdentifier("plan-outcome-edit-\(plan.id)")
    }

    private func savedOutcomeChip(stacked: Bool) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 8) {
            Image(systemName: savedAnswerIcon).font(.system(size: 18, weight: .semibold)).accessibilityHidden(true)
            Text(savedAnswerTitle).fixedSize(horizontal: false, vertical: true)
        }
        .font(.subheadline.weight(.semibold)).foregroundStyle(savedAnswerTone.foreground)
        .padding(.horizontal, 10).padding(.vertical, stacked ? 8 : 0)
        .frame(maxWidth: stacked ? .infinity : nil, minHeight: 44, alignment: .leading)
        .background(savedAnswerTone.fill, in: RoundedRectangle(cornerRadius: stacked ? SideSeatTheme.controlRadius : 1000))
        .overlay { RoundedRectangle(cornerRadius: stacked ? SideSeatTheme.controlRadius : 1000).strokeBorder(savedAnswerTone.stroke, lineWidth: 1) }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(AppLocalization.string("Your answer is saved privately. Only you can see it."))
        .accessibilityValue(savedAnswerTitle)
        .accessibilityFocused($outcomeFocus, equals: .saved)
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
        title: String, systemImage: String, value: String, tone: OutcomeTone, stacked: Bool
    ) -> some View {
        let isSelected = plan.viewerOutcome == value
        return Button {
            attemptedAnswer = value
            saveIssue = nil
            onAnswer(value)
        } label: {
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                Image(systemName: systemImage).font(.system(size: 18, weight: .semibold)).accessibilityHidden(true)
                Text(title).fixedSize(horizontal: false, vertical: true)
            }
            .font(stacked ? .subheadline.weight(.semibold) : .caption.weight(.semibold))
            .foregroundStyle(tone.foreground)
            .padding(.horizontal, 9).padding(.vertical, stacked ? 8 : 0)
            .frame(maxWidth: stacked ? .infinity : nil, minHeight: 44, alignment: .leading)
            .background(tone.fill, in: RoundedRectangle(cornerRadius: stacked ? SideSeatTheme.controlRadius : 1000))
            .overlay { RoundedRectangle(cornerRadius: stacked ? SideSeatTheme.controlRadius : 1000).strokeBorder(tone.stroke, lineWidth: 1) }
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
