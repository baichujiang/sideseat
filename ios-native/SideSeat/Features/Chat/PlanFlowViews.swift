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

    var needsYou: Bool { [.fillAvailability, .shareAvailability, .chooseTime, .confirm].contains(self) }
    var title: String {
        let key: String.LocalizationValue = switch self {
        case .fillAvailability: "Fill in your free time"
        case .shareAvailability: "Invite friends to fill in"
        case .chooseTime: "Choose a time for everyone"
        case .confirm: "Does this time work for you?"
        case .waitForOrganizer: "Waiting for the organizer"
        case .waitForReplies: "Waiting for confirmations"
        case .viewPlan: "View plan"
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
        case .viewPlan: "calendar"
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
