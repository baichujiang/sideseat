import SwiftUI

/// A screen tells the viewer the one task to finish before moving on.
struct PlanTaskHeader: View {
    let step: String
    let title: String
    let detail: String

    var body: some View {
        VStack(alignment: .leading, spacing: SideSeatTheme.spaceSM) {
            Text(LocalizedStringKey(step)).font(.caption.weight(.semibold)).foregroundStyle(SideSeatTheme.textSecondaryStrong)
            Text(LocalizedStringKey(title)).font(.title2.weight(.bold)).fixedSize(horizontal: false, vertical: true)
            Text(LocalizedStringKey(detail)).font(.subheadline).foregroundStyle(SideSeatTheme.textSecondaryStrong)
                .fixedSize(horizontal: false, vertical: true)
        }.frame(maxWidth: .infinity, alignment: .leading)
    }
}

struct PlanGuideRow: View {
    let number: Int
    let title: String
    let detail: String
    var complete = false

    var body: some View {
        HStack(alignment: .top, spacing: SideSeatTheme.spaceMD) {
            Image(systemName: complete ? "checkmark.circle.fill" : "\(number).circle.fill")
                .font(.title3).foregroundStyle(complete ? SideSeatTheme.statusSuccessText : SideSeatTheme.textSecondaryStrong)
                .frame(width: 28).accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 4) {
                Text(LocalizedStringKey(title)).font(.subheadline.weight(.semibold))
                Text(LocalizedStringKey(detail)).font(.caption).foregroundStyle(SideSeatTheme.textSecondaryStrong)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }.accessibilityElement(children: .combine)
    }
}

/// An explicitly labelled illustration explains what a plan helps friends do.
struct PlanPurposeExample: View {
    @Environment(\.dynamicTypeSize) private var typeSize
    private let names = ["You", "Friend Lin", "Friend Chen"]
    private let choices = [[true, true, false], [true, true, true], [false, true, false]]
    private let times = ["Sat\n14:00", "Sat\n15:00", "Sun\n10:00"]

    var body: some View {
        VStack(alignment: .leading, spacing: SideSeatTheme.spaceMD) {
            HStack {
                Text("Example").font(.caption.weight(.semibold))
                    .padding(.horizontal, 8).padding(.vertical, 4)
                    .background(SideSeatTheme.bgGrouped, in: Capsule())
                Text("Three friends want to study together").font(.caption).foregroundStyle(SideSeatTheme.textSecondaryStrong)
            }
            Text("One link collects everyone's free time.")
                .font(.subheadline).fixedSize(horizontal: false, vertical: true)
            if typeSize.isAccessibilitySize {
                Text("You, Lin and Chen are all free on Saturday at 15:00.")
                    .font(.body).fixedSize(horizontal: false, vertical: true)
            } else {
                Grid(horizontalSpacing: 5, verticalSpacing: 5) {
                    GridRow {
                        Color.clear.gridCellUnsizedAxes([.horizontal, .vertical])
                        ForEach(0..<3) { column in
                            Text(LocalizedStringKey(times[column])).font(.caption2).multilineTextAlignment(.center)
                                .frame(maxWidth: .infinity, minHeight: 34)
                        }
                    }
                    ForEach(0..<3) { row in
                        GridRow {
                            Text(LocalizedStringKey(names[row])).font(.caption).frame(minWidth: 38, alignment: .leading)
                            ForEach(0..<3) { column in
                                Image(systemName: choices[row][column] ? "checkmark" : "minus")
                                    .font(.caption.weight(.semibold))
                                    .foregroundStyle(choices[row][column] ? column == 1 ? SideSeatTheme.Availability.onSelected : SideSeatTheme.statusSuccessText : SideSeatTheme.textSecondaryStrong)
                                    .frame(maxWidth: .infinity, minHeight: 30)
                                    .background(column == 1 ? SideSeatTheme.Availability.selectedFill : SideSeatTheme.bgGrouped,
                                                in: RoundedRectangle(cornerRadius: 6))
                            }
                        }
                    }
                }
                .accessibilityElement(children: .ignore)
                .accessibilityLabel(AppLocalization.string("You, Lin and Chen are all free on Saturday at 15:00."))
            }
            Label("Saturday at 15:00 works for all three", systemImage: "checkmark.circle.fill")
                .font(.subheadline.weight(.semibold)).foregroundStyle(SideSeatTheme.statusSuccessText)
                .fixedSize(horizontal: false, vertical: true)
            Text("You pick the final time. Everyone confirms, then it appears in Calendar.")
                .font(.caption).foregroundStyle(SideSeatTheme.textSecondaryStrong)
                .fixedSize(horizontal: false, vertical: true)
        }.accessibilityIdentifier("plans-purpose-illustration")
    }
}

enum PlanNextStep: String, Sendable {
    case fillAvailability, shareAvailability, chooseTime, confirm, waitForOrganizer, waitForReplies, viewPlan
    case shareInvitation, reviewReplies, declined, notIncluded, viewCalendar, recordOutcome

    var needsYou: Bool { [.fillAvailability, .shareAvailability, .chooseTime, .confirm, .shareInvitation].contains(self) }
    var title: String {
        let key: String.LocalizationValue = switch self {
        case .fillAvailability: "Fill in your free time"
        case .shareAvailability: "Invite friends to fill in"
        case .chooseTime: "Choose a time for everyone"
        case .confirm: "Does this time work for you?"
        case .waitForOrganizer: "Waiting for the organizer"
        case .waitForReplies: "Waiting for confirmations"
        case .viewPlan: "View plan"
        case .shareInvitation: "Invite friends to confirm"
        case .reviewReplies: "Review replies and arrange the next step"
        case .declined: "You’ve replied that you can’t attend"
        case .notIncluded: "You’re not joining this plan"
        case .viewCalendar: "You’re all set"
        case .recordOutcome: "How did the activity go?"
        }
        return AppLocalization.string(key)
    }
    var action: String {
        let key: String.LocalizationValue = switch self {
        case .fillAvailability: "Fill in my availability"
        case .shareAvailability: "Share with friends"
        case .chooseTime: "View timetable and choose"
        case .confirm: "View and confirm"
        case .waitForOrganizer: "View saved availability"
        case .waitForReplies: "View confirmation progress"
        case .viewPlan: "View plan"
        case .shareInvitation: "Share invitation"
        case .reviewReplies: "View confirmation progress"
        case .declined: "View my response"
        case .notIncluded: "View plan"
        case .viewCalendar: "View in Calendar"
        case .recordOutcome: "View activity feedback"
        }
        return AppLocalization.string(key)
    }
    var symbol: String {
        switch self {
        case .fillAvailability: "hand.tap"
        case .shareAvailability: "square.and.arrow.up"
        case .chooseTime: "calendar.badge.clock"
        case .confirm: "envelope.badge"
        case .waitForOrganizer, .waitForReplies: "hourglass"
        case .viewPlan, .viewCalendar: "calendar"
        case .shareInvitation: "square.and.arrow.up"
        case .reviewReplies: "person.2.badge.gearshape"
        case .declined, .notIncluded: "person.crop.circle.badge.xmark"
        case .recordOutcome: "checkmark.bubble"
        }
    }
}

/// The same short lifecycle appears in creation, availability and confirmation.
struct PlanJourneyProgress: View {
    @Environment(\.dynamicTypeSize) private var typeSize
    var phase: String
    var fixed = false
    private var labels: [String] { fixed ? ["Confirm together", "In your calendars"] : ["Find a time", "Confirm together", "In your calendars"] }
    private var current: Int { phase == "CONFIRMED" ? labels.count - 1 : phase == "INVITING" ? labels.count - 2 : 0 }

    var body: some View {
        let layout = typeSize.isAccessibilitySize ? AnyLayout(VStackLayout(alignment: .leading, spacing: 8)) : AnyLayout(HStackLayout(alignment: .top, spacing: 8))
        layout {
            ForEach(Array(labels.enumerated()), id: \.offset) { index, label in
                HStack(alignment: .firstTextBaseline, spacing: 5) {
                    Image(systemName: index < current ? "checkmark.circle.fill" : "\(index + 1).circle\(index == current ? ".fill" : "")")
                        .accessibilityHidden(true)
                    Text(LocalizedStringKey(label)).fontWeight(index == current ? .semibold : .regular)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .font(.caption)
                .foregroundStyle(index == current ? SideSeatTheme.textPrimary : SideSeatTheme.textSecondaryStrong)
                .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier("plan-journey-progress")
    }
}

struct PlanShareActions: View {
    let poll: NativeTimePoll
    var prominent = false
    @State private var copied = false

    var body: some View {
        let layout = prominent ? AnyLayout(VStackLayout(spacing: SideSeatTheme.spaceSM)) : AnyLayout(HStackLayout(spacing: SideSeatTheme.spaceSM))
        layout {
            ShareLink(item: poll.shareUrl) {
                Label(poll.planningPhase == "COLLECTING" ? "Send link to friends" : "Share invitation", systemImage: "square.and.arrow.up")
                    .font(.subheadline.weight(.semibold))
                    .fixedSize(horizontal: false, vertical: true)
                    .frame(maxWidth: .infinity, minHeight: 48)
                    .padding(.horizontal, SideSeatTheme.spaceSM)
                    .foregroundStyle(prominent ? SideSeatTheme.ProductAction.foreground : SideSeatTheme.textPrimary)
                    .background(prominent ? SideSeatTheme.ProductAction.fill : SideSeatTheme.bgGrouped,
                                in: RoundedRectangle(cornerRadius: SideSeatTheme.controlRadius))
            }.buttonStyle(.plain).accessibilityIdentifier("plan-share-primary")
            Button {
                UIPasteboard.general.url = poll.shareUrl
                copied = true
            } label: {
                Label(copied ? "Link copied" : "Copy link", systemImage: copied ? "checkmark" : "doc.on.doc")
                    .font(.subheadline.weight(.medium))
                    .frame(maxWidth: prominent ? .infinity : nil, minHeight: 48)
                    .padding(.horizontal, SideSeatTheme.spaceMD)
                    .background(SideSeatTheme.bgGrouped, in: RoundedRectangle(cornerRadius: SideSeatTheme.controlRadius))
            }
            .buttonStyle(.plain).foregroundStyle(SideSeatTheme.utilityAction)
            .accessibilityLabel(copied ? "Link copied" : "Copy link")
            .accessibilityIdentifier("plan-copy-link")
        }
    }
}


/// Shared display only: each caller retains its existing navigation and mutation actions.
struct PlanStatusBadge: View {
    let status: PlanDisplayStatus
    var needsYou = false
    var identifier: String = "plan-display-status"

    private var foreground: Color {
        if status == .confirmed || status == .inProgress { return SideSeatTheme.statusSuccessText }
        if needsYou { return SideSeatTheme.statusWarningText }
        return SideSeatTheme.textSecondaryStrong
    }

    var body: some View {
        Label(status.title, systemImage: status.symbol)
            .font(.caption.weight(.semibold)).foregroundStyle(foreground)
            .fixedSize(horizontal: false, vertical: true)
            .padding(.horizontal, SideSeatTheme.spaceSM)
            .padding(.vertical, SideSeatTheme.spaceXS)
            .background(foreground.opacity(0.08), in: Capsule())
            .accessibilityIdentifier(identifier)
    }
}

struct PlanNextStepSummary: View {
    let presentation: PlanPresentation
    var showsDetail = true

    var body: some View {
        VStack(alignment: .leading, spacing: 5) {
            Text(presentation.nextStep.title).font(.subheadline.weight(.semibold))
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityIdentifier("plan-next-step")
            if showsDetail {
                Text(presentation.detail).font(.caption).foregroundStyle(SideSeatTheme.textSecondaryStrong)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }.frame(maxWidth: .infinity, alignment: .leading)
    }
}

struct PlanOpenActionLabel: View {
    let step: PlanNextStep
    var body: some View {
        HStack {
            Text(step.action).font(.subheadline.weight(.semibold)).fixedSize(horizontal: false, vertical: true)
            Spacer(minLength: 8)
            Image(systemName: "arrow.right").accessibilityHidden(true)
        }
        .foregroundStyle(step.needsYou ? SideSeatTheme.ProductAction.foreground : SideSeatTheme.textPrimary)
        .padding(.horizontal, step.needsYou ? 12 : 0).frame(minHeight: 46)
        .background(step.needsYou ? SideSeatTheme.ProductAction.fill : Color.clear,
                    in: RoundedRectangle(cornerRadius: SideSeatTheme.controlRadius))
    }
}

/// Shared card anatomy only; callers own navigation and all plan mutations.
struct PlanCardHeading: View {
    @Environment(\.dynamicTypeSize) private var typeSize
    let title: String
    let presentation: PlanPresentation
    var context: String? = nil
    var titleIdentifier: String? = nil
    var statusIdentifier = "plan-display-status"

    var body: some View {
        VStack(alignment: .leading, spacing: SideSeatTheme.spaceMD) {
            let layout = typeSize.isAccessibilitySize
                ? AnyLayout(VStackLayout(alignment: .leading, spacing: SideSeatTheme.spaceXS))
                : AnyLayout(HStackLayout(alignment: .firstTextBaseline, spacing: SideSeatTheme.spaceSM))
            layout {
                PlanStatusBadge(status: presentation.status, needsYou: presentation.nextStep.needsYou,
                                identifier: statusIdentifier)
                if let context {
                    if !typeSize.isAccessibilitySize { Spacer(minLength: 4) }
                    Text(context).font(.caption).foregroundStyle(SideSeatTheme.textSecondaryStrong)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            if let titleIdentifier {
                titleText.accessibilityIdentifier(titleIdentifier)
            } else { titleText }
        }
    }

    private var titleText: some View {
        Text(title).font(.title3.weight(.semibold)).foregroundStyle(SideSeatTheme.textPrimary)
            .fixedSize(horizontal: false, vertical: true).frame(maxWidth: .infinity, alignment: .leading)
    }
}

struct PlanCardSchedule: View {
    let start: Date
    let end: Date
    var timeZone: String = TimeZone.current.identifier
    var location: String? = nil
    var relative: String? = nil
    var compact = false

    var body: some View {
        VStack(alignment: .leading, spacing: SideSeatTheme.spaceSM) {
            if compact {
                Text(dateText + " · " + clockText).font(.footnote)
                    .fixedSize(horizontal: false, vertical: true)
                Text(timeZone).font(.caption).foregroundStyle(SideSeatTheme.textSecondaryStrong)
            } else { HStack(alignment: .top, spacing: SideSeatTheme.spaceSM) {
                Image(systemName: "calendar").font(.subheadline)
                    .foregroundStyle(SideSeatTheme.textSecondaryStrong).padding(.top, 2).accessibilityHidden(true)
                VStack(alignment: .leading, spacing: SideSeatTheme.spaceXS) {
                    Text(dateText).font(.subheadline.weight(.medium)).fixedSize(horizontal: false, vertical: true)
                    Text(clockText).font(.title3.weight(.semibold).monospacedDigit())
                        .fixedSize(horizontal: false, vertical: true)
                    if let relative {
                        Text(relative).font(.caption.weight(.medium)).foregroundStyle(SideSeatTheme.textSecondaryStrong)
                    }
                    Text(timeZone).font(.caption).foregroundStyle(SideSeatTheme.textSecondaryStrong)
                }.frame(maxWidth: .infinity, alignment: .leading)
            } }
            if let location = location?.trimmingCharacters(in: .whitespacesAndNewlines), !location.isEmpty {
                Label(location, systemImage: "mappin.and.ellipse").font(.subheadline)
                    .foregroundStyle(SideSeatTheme.textSecondaryStrong).fixedSize(horizontal: false, vertical: true)
            }
        }.foregroundStyle(SideSeatTheme.textPrimary)
    }

    private func formatter(_ template: String) -> DateFormatter {
        let format = DateFormatter()
        format.locale = AppLocalization.selectedLanguage.locale
        format.timeZone = TimeZone(identifier: timeZone) ?? .current
        format.setLocalizedDateFormatFromTemplate(template)
        return format
    }
    private var dateText: String {
        let format = formatter("yMMMdEEE")
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = format.timeZone
        let first = format.string(from: start)
        return calendar.isDate(start, inSameDayAs: end) ? first : first + " – " + format.string(from: end)
    }
    private var clockText: String {
        let format = formatter("jmm")
        return format.string(from: start) + " – " + format.string(from: end)
    }
}

struct PlanCardProgress: View {
    let title: String
    var confirmed: Int? = nil
    var target: Int? = nil

    var body: some View {
        VStack(alignment: .leading, spacing: SideSeatTheme.spaceSM) {
            Label(title, systemImage: "person.2")
                .font(.caption.weight(.medium)).foregroundStyle(SideSeatTheme.textSecondaryStrong)
                .fixedSize(horizontal: false, vertical: true)
            if let confirmed, let target, target > 0 {
                ProgressView(value: Double(min(confirmed, target)), total: Double(target))
                    .tint(SideSeatTheme.utilityAction).accessibilityHidden(true)
            }
        }
    }
}

struct PlanCardActionFooter: View {
    let presentation: PlanPresentation

    private var step: PlanNextStep { presentation.nextStep == .viewCalendar ? .viewPlan : presentation.nextStep }
    var body: some View {
        HStack(alignment: .center, spacing: SideSeatTheme.spaceMD) {
            VStack(alignment: .leading, spacing: SideSeatTheme.spaceXS) {
                if presentation.nextStep.title != step.action {
                    Text(presentation.nextStep.title).font(.caption)
                        .fixedSize(horizontal: false, vertical: true).accessibilityIdentifier("plan-next-step")
                }
                Text(step.action).font(.subheadline.weight(.semibold)).fixedSize(horizontal: false, vertical: true)
            }.frame(maxWidth: .infinity, alignment: .leading)
            Image(systemName: "arrow.right").font(.subheadline.weight(.semibold)).accessibilityHidden(true)
        }
        .foregroundStyle(step.needsYou ? SideSeatTheme.ProductAction.foreground : SideSeatTheme.textPrimary)
        .padding(SideSeatTheme.spaceMD).frame(maxWidth: .infinity, minHeight: 52, alignment: .leading)
        .background(step.needsYou ? SideSeatTheme.ProductAction.fill : SideSeatTheme.bgGrouped,
                    in: RoundedRectangle(cornerRadius: SideSeatTheme.controlRadius))
    }
}
