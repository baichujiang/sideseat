import SwiftUI
import UIKit

/// Shared anatomy for Together and Plans: context, title, details, then one primary action.
struct SSFlowCard<Content: View>: View {
    var contentPadding: CGFloat = SideSeatTheme.spaceLG
    var contentSpacing: CGFloat = SideSeatTheme.spaceMD
    var activityTopic: NativeWeeklyIntentTopic? = nil
    @ViewBuilder var content: () -> Content

    private var radius: CGFloat {
        activityTopic == nil ? SideSeatTheme.cardRadius : SideSeatTheme.Together.cardRadius
    }

    var body: some View {
        VStack(alignment: .leading, spacing: contentSpacing, content: content)
            .padding(contentPadding)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(
                SideSeatTheme.surface,
                in: RoundedRectangle(
                    cornerRadius: radius, style: .continuous
                )
            )
            .overlay {
                RoundedRectangle(cornerRadius: radius, style: .continuous)
                    .strokeBorder(activityTopic == nil ? SideSeatTheme.separator.opacity(0.25)
                                  : SideSeatTheme.Together.border.opacity(0.7), lineWidth: 0.5)
            }
            .shadow(color: activityTopic == nil ? .clear : SideSeatTheme.Together.shadow.opacity(0.045), radius: 16, y: 6)
    }
}

/// Full-width category band shared by all three Together lists; the body stays neutral.
struct SSActivityHeaderBand<Content: View>: View {
    let topic: NativeWeeklyIntentTopic
    var horizontalPadding: CGFloat = SideSeatTheme.Together.cardPadding
    var verticalPadding: CGFloat = SideSeatTheme.spaceMD
    @ViewBuilder var content: () -> Content

    var body: some View {
        content()
            .padding(.horizontal, horizontalPadding)
            .padding(.vertical, verticalPadding)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background {
                UnevenRoundedRectangle(
                    topLeadingRadius: SideSeatTheme.Together.cardRadius,
                    topTrailingRadius: SideSeatTheme.Together.cardRadius,
                    style: .continuous
                )
                .fill(SideSeatTheme.Together.headerFill(for: topic))
            }
            .accessibilityElement(children: .contain)
    }
}

struct SSFlowCardHeader: View {
    let title: String
    let subtitle: String
    let systemImage: String
    var tint: Color = SideSeatTheme.textSecondaryStrong
    var activityTopic: NativeWeeklyIntentTopic? = nil

    var body: some View {
        HStack(alignment: .top, spacing: SideSeatTheme.spaceMD) {
            if let activityTopic {
                SSActivityArtwork(topic: activityTopic, size: 48)
            } else {
                Image(systemName: systemImage)
                    .font(.body.weight(.semibold))
                    .dynamicTypeSize(...DynamicTypeSize.xxxLarge)
                    .foregroundStyle(tint)
                    .frame(width: 44, height: 44)
                    .background(
                        tint.opacity(0.08),
                        in: RoundedRectangle(
                            cornerRadius: SideSeatTheme.controlRadius, style: .continuous
                        )
                    )
                    .accessibilityHidden(true)
            }
            VStack(alignment: .leading, spacing: SideSeatTheme.spaceXS) {
                Text(subtitle)
                    .font(.caption.weight(.medium))
                    .foregroundStyle(tint)
                    .fixedSize(horizontal: false, vertical: true)
                Text(title)
                    .font(.headline)
                    .foregroundStyle(SideSeatTheme.textPrimary)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .accessibilityElement(children: .combine)
    }
}

/// Original vector category illustrations. Category color never communicates selection.
struct SSActivityArtwork: View {
    let topic: NativeWeeklyIntentTopic
    var size: CGFloat = 64

    static func assetName(for topic: NativeWeeklyIntentTopic) -> String {
        "ActivityArtwork-\(topic.rawValue.lowercased())"
    }

    var body: some View {
        Image(Self.assetName(for: topic))
            .resizable()
            .scaledToFit()
            .frame(width: size, height: size)
            .accessibilityHidden(true)
    }
}

/// A visual category picker; the title and checkmark carry selection, not the illustration.
struct SSActivityChoice: View {
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    let topic: NativeWeeklyIntentTopic
    let isSelected: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            let layout = dynamicTypeSize.isAccessibilitySize
                ? AnyLayout(HStackLayout(spacing: SideSeatTheme.spaceSM))
                : AnyLayout(VStackLayout(spacing: SideSeatTheme.spaceXS))
            layout {
                SSActivityArtwork(topic: topic, size: 28)
                Text(topic.title)
                    .font(dynamicTypeSize.isAccessibilitySize ? .body.weight(.medium) : .caption.weight(.semibold))
                    .multilineTextAlignment(dynamicTypeSize.isAccessibilitySize ? .leading : .center)
                    .fixedSize(horizontal: false, vertical: true)
                    .frame(maxWidth: .infinity, alignment: dynamicTypeSize.isAccessibilitySize ? .leading : .center)
                    .padding(.trailing, dynamicTypeSize.isAccessibilitySize ? SideSeatTheme.spaceLG : 0)
            }
            .padding(.horizontal, SideSeatTheme.spaceSM)
            .padding(.vertical, SideSeatTheme.spaceSM)
            .frame(maxWidth: .infinity, minHeight: 72)
            .foregroundStyle(SideSeatTheme.textPrimary)
            .background(
                isSelected ? SideSeatTheme.ControlSelection.fill : SideSeatTheme.surface,
                in: RoundedRectangle(cornerRadius: SideSeatTheme.controlRadius, style: .continuous)
            )
            .overlay {
                RoundedRectangle(cornerRadius: SideSeatTheme.controlRadius, style: .continuous)
                    .strokeBorder(isSelected ? SideSeatTheme.ControlSelection.border
                                  : SideSeatTheme.separator.opacity(0.3), lineWidth: 1)
            }
            .overlay(alignment: .topTrailing) {
                if isSelected {
                    Image(systemName: "checkmark.circle.fill")
                        .font(.caption2.weight(.semibold))
                        .dynamicTypeSize(...DynamicTypeSize.large)
                        .foregroundStyle(SideSeatTheme.utilityAction)
                        .padding(SideSeatTheme.spaceXS)
                        .accessibilityHidden(true)
                }
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(SSPressButtonStyle())
        .accessibilityLabel(topic.title)
        .accessibilityAddTraits(isSelected ? .isSelected : [])
    }
}

/// Saved interest with a separate withdrawal action.
struct SSOpportunityInterestStatus: View {
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    let id: String
    var accessibilityPrefix = "mutual-opportunity"
    var compact = false
    let isWorking: Bool
    let onWithdraw: () -> Void

    private var footerLayout: AnyLayout {
        dynamicTypeSize.isAccessibilitySize
            ? AnyLayout(VStackLayout(alignment: .leading, spacing: SideSeatTheme.spaceXS))
            : AnyLayout(HStackLayout(alignment: .center, spacing: SideSeatTheme.spaceSM))
    }

    var body: some View {
        VStack(alignment: .leading, spacing: SideSeatTheme.spaceXS) {
            if compact {
                Label(AppLocalization.string("Interest shown"), systemImage: "checkmark.circle.fill")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(SideSeatTheme.utilityAction)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityIdentifier("\(accessibilityPrefix)-saved-\(id)")
            } else {
                HStack(spacing: SideSeatTheme.spaceSM) {
                    Text(AppLocalization.string("Interest shown"))
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(SideSeatTheme.utilityAction)
                        .fixedSize(horizontal: false, vertical: true)
                        .padding(.leading, SideSeatTheme.spaceMD)
                    Spacer(minLength: 0)
                    Image(systemName: "star.fill")
                        .font(.system(size: 19, weight: .semibold))
                        .foregroundStyle(SideSeatTheme.Together.decisionHandleInk)
                        .frame(width: 52, height: 52)
                        .background(SideSeatTheme.Together.decisionHandle, in: Circle())
                        .overlay { Circle().strokeBorder(SideSeatTheme.Together.decisionHandleBorder, lineWidth: 0.75) }
                        .accessibilityHidden(true)
                }
                .padding(6)
                .frame(maxWidth: .infinity, minHeight: dynamicTypeSize.isAccessibilitySize ? 72 : 64)
                .background(SideSeatTheme.Together.selectedTab, in: Capsule())
                .overlay { Capsule().strokeBorder(SideSeatTheme.ControlSelection.border, lineWidth: 0.5) }
                .accessibilityElement(children: .ignore)
                .accessibilityLabel(AppLocalization.string("Interest shown"))
                .accessibilityIdentifier("\(accessibilityPrefix)-saved-\(id)")
            }

            footerLayout {
                Text(AppLocalization.string("Waiting for a response"))
                    .font(.footnote)
                    .foregroundStyle(SideSeatTheme.textSecondaryStrong)
                    .fixedSize(horizontal: false, vertical: true)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .accessibilityIdentifier("\(accessibilityPrefix)-waiting-\(id)")
                Button(action: onWithdraw) {
                    Text(AppLocalization.string("Withdraw interest"))
                        .font(.footnote.weight(.medium))
                        .foregroundStyle(SideSeatTheme.textSecondaryStrong)
                        .fixedSize(horizontal: false, vertical: true)
                        .frame(minWidth: 44, minHeight: 44, alignment: .leading)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .disabled(isWorking)
                .accessibilityIdentifier("\(accessibilityPrefix)-withdraw-\(id)")
            }
        }
        .accessibilityElement(children: .contain)
        .background(SSPageSwipeExclusion())
    }
}

/// Two direct choices; only the submitted action shows progress.
struct SSOpportunityDecisionButtons: View {
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    @State private var submittingInterest: Bool?

    let opportunityID: String
    let isInterested: Bool
    let isWorking: Bool
    let onInterested: () async -> Void
    let onSkip: () async -> Void
    let onWithdraw: () -> Void

    private var isSubmitting: Bool { submittingInterest != nil || isWorking }
    private var layout: AnyLayout {
        dynamicTypeSize.isAccessibilitySize
            ? AnyLayout(VStackLayout(spacing: SideSeatTheme.spaceSM))
            : AnyLayout(HStackLayout(spacing: SideSeatTheme.spaceSM))
    }

    var body: some View {
        Group {
            if isInterested {
                SSOpportunityInterestStatus(id: opportunityID, compact: true,
                    isWorking: isWorking, onWithdraw: onWithdraw)
            } else {
                layout {
                    Button { submit(interested: false) } label: {
                        choiceLabel("Ignore", interested: false)
                            .foregroundStyle(SideSeatTheme.textPrimary)
                            .background(SideSeatTheme.fillTertiary,
                                        in: RoundedRectangle(cornerRadius: SideSeatTheme.controlRadius))
                    }
                    .accessibilityIdentifier("mutual-opportunity-skip-action-\(opportunityID)")
                    Button { submit(interested: true) } label: {
                        choiceLabel("Interested", interested: true)
                            .foregroundStyle(.white)
                            .background(SideSeatTheme.BrandAction.fill,
                                        in: RoundedRectangle(cornerRadius: SideSeatTheme.controlRadius))
                    }
                    .accessibilityIdentifier("mutual-opportunity-interest-action-\(opportunityID)")
                }
                .buttonStyle(.plain)
                .disabled(isSubmitting)
                .accessibilityElement(children: .contain)
                .accessibilityLabel(AppLocalization.string("Choose interest"))
                .accessibilityIdentifier("mutual-opportunity-actions-\(opportunityID)")
            }
        }
        .background(SSPageSwipeExclusion())
    }

    private func choiceLabel(_ title: String.LocalizationValue, interested: Bool) -> some View {
        HStack(spacing: SideSeatTheme.spaceSM) {
            if submittingInterest == interested {
                ProgressView().tint(interested ? .white : SideSeatTheme.textSecondaryStrong)
            }
            Text(AppLocalization.string(title))
                .font(.subheadline.weight(.semibold))
                .fixedSize(horizontal: false, vertical: true)
                .multilineTextAlignment(.center)
        }
        .padding(.horizontal, SideSeatTheme.spaceMD)
        .padding(.vertical, SideSeatTheme.spaceSM)
        .frame(maxWidth: .infinity, minHeight: 48)
        .contentShape(Rectangle())
    }

    private func submit(interested: Bool) {
        guard !isInterested, !isSubmitting else { return }
        submittingInterest = interested
        Task {
            defer { submittingInterest = nil }
            if interested { await onInterested() } else { await onSkip() }
        }
    }
}

struct SSFlowNotice: View {
    let text: String
    var systemImage: String = "info.circle"

    var body: some View {
        Label(text, systemImage: systemImage)
            .font(.footnote)
            .foregroundStyle(SideSeatTheme.textSecondaryStrong)
            .fixedSize(horizontal: false, vertical: true)
            .padding(SideSeatTheme.spaceMD)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(
                SideSeatTheme.fillTertiary,
                in: RoundedRectangle(
                    cornerRadius: SideSeatTheme.controlRadius, style: .continuous
                ))
    }
}

/// A pinned commit action shared by editors. Native sheets handle keyboard and motion.
struct SSFlowActionDock: View {
    let title: String
    let detail: String
    var isLoading = false
    var isEnabled = true
    let accessibilityID: String
    let action: () -> Void

    var body: some View {
        VStack(spacing: SideSeatTheme.spaceSM) {
            SSPrimaryButton(
                title: title,
                isLoading: isLoading,
                fill: .product,
                accessibilityID: accessibilityID,
                action: action
            )
            .disabled(!isEnabled || isLoading)
            if !detail.isEmpty {
                Text(detail)
                    .font(.caption)
                    .foregroundStyle(SideSeatTheme.textSecondaryStrong)
                    .multilineTextAlignment(.center)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .padding(.horizontal, SideSeatTheme.screenHorizontal)
        .padding(.vertical, SideSeatTheme.spaceMD)
        .background(SideSeatTheme.surface)
        .overlay(alignment: .top) { Divider() }
    }
}

struct SSFlowChoice: View {
    let title: String
    let systemImage: String
    var isSelected = false
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: SideSeatTheme.spaceSM) {
                Image(systemName: systemImage)
                    .frame(width: 22)
                    .accessibilityHidden(true)
                Text(title)
                    .font(.subheadline.weight(.medium))
                    .fixedSize(horizontal: false, vertical: true)
                    .frame(maxWidth: .infinity, alignment: .leading)
                if isSelected {
                    Image(systemName: "checkmark.circle.fill")
                        .foregroundStyle(SideSeatTheme.utilityAction)
                        .accessibilityHidden(true)
                }
            }
            .foregroundStyle(SideSeatTheme.textPrimary)
            .padding(.horizontal, SideSeatTheme.spaceMD)
            .padding(.vertical, SideSeatTheme.spaceSM)
            .frame(minHeight: 48)
            .background(
                isSelected ? SideSeatTheme.ControlSelection.fill : SideSeatTheme.fillTertiary,
                in: RoundedRectangle(cornerRadius: SideSeatTheme.controlRadius, style: .continuous)
            )
            .overlay {
                RoundedRectangle(cornerRadius: SideSeatTheme.controlRadius, style: .continuous)
                    .strokeBorder(isSelected ? SideSeatTheme.ControlSelection.border : .clear, lineWidth: 1)
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(SSPressButtonStyle())
        .accessibilityAddTraits(isSelected ? .isSelected : [])
    }
}

extension View {
    /// System sheet animation respects Reduce Motion and keeps native drag-to-dismiss behavior.
    func ssFlowSheet(isSaving: Bool = false) -> some View {
        presentationDetents([.large])
            .presentationDragIndicator(.visible)
            .presentationCornerRadius(SideSeatTheme.cardRadius)
            .presentationBackground(SideSeatTheme.bgGrouped)
            .interactiveDismissDisabled(isSaving)
    }
}

/// Private save and first contact use the same controls in recommendations and exploration.
struct SSIntentionActionRow<Contact: View>: View {
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    let isBookmarked: Bool
    let isDisabled: Bool
    let bookmarkIdentifier: String
    let onBookmark: () -> Void
    @ViewBuilder var contact: () -> Contact

    private var layout: AnyLayout {
        dynamicTypeSize.isAccessibilitySize
            ? AnyLayout(VStackLayout(spacing: SideSeatTheme.spaceSM))
            : AnyLayout(HStackLayout(spacing: SideSeatTheme.spaceSM))
    }

    var body: some View {
        layout {
            Button(action: onBookmark) {
                SSIntentionActionLabel(
                    title: AppLocalization.string(isBookmarked ? "Interest shown" : "Interested"),
                    icon: isBookmarked ? "heart.fill" : "heart"
                )
                .foregroundStyle(SideSeatTheme.utilityAction)
                .background(isBookmarked ? SideSeatTheme.ControlSelection.fill : SideSeatTheme.fillSubtle,
                            in: RoundedRectangle(cornerRadius: SideSeatTheme.controlRadius))
                .overlay {
                    RoundedRectangle(cornerRadius: SideSeatTheme.controlRadius)
                        .strokeBorder(isBookmarked ? SideSeatTheme.ControlSelection.border : SideSeatTheme.separator, lineWidth: 1)
                }
            }
            .buttonStyle(SSPressButtonStyle())
            .disabled(isDisabled)
            .accessibilityLabel(AppLocalization.string(isBookmarked ? "Remove bookmark" : "Bookmark intention"))
            .accessibilityIdentifier(bookmarkIdentifier)
            contact()
        }
    }
}

struct SSIntentionContactButton: View {
    let title: String
    let identifier: String
    let isDisabled: Bool
    let action: () -> Void
    var opensConversation = false

    var body: some View {
        Button(action: action) {
            SSIntentionActionLabel(title: title,
                icon: opensConversation ? "bubble.left.and.bubble.right.fill" : "hand.wave.fill")
                .foregroundStyle(opensConversation ? SideSeatTheme.statusSuccessText : SideSeatTheme.BrandAction.foreground)
                .background(
                    opensConversation ? SideSeatTheme.statusSuccessText.opacity(0.12) : SideSeatTheme.BrandAction.fill,
                    in: RoundedRectangle(cornerRadius: SideSeatTheme.controlRadius)
                )
                .overlay {
                    if opensConversation {
                        RoundedRectangle(cornerRadius: SideSeatTheme.controlRadius)
                            .strokeBorder(SideSeatTheme.statusSuccessText.opacity(0.35), lineWidth: 1)
                    }
                }
        }
        .buttonStyle(SSPressButtonStyle())
        .disabled(isDisabled)
        .accessibilityIdentifier(identifier)
    }
}

private struct SSIntentionActionLabel: View {
    let title: String
    let icon: String

    var body: some View {
        HStack(spacing: SideSeatTheme.spaceSM) {
            Image(systemName: icon).accessibilityHidden(true)
            Text(title)
                .fixedSize(horizontal: false, vertical: true)
                .multilineTextAlignment(.center)
        }
        .font(.subheadline.weight(.semibold))
        .padding(.horizontal, SideSeatTheme.spaceSM)
        .padding(.vertical, SideSeatTheme.spaceSM)
        .frame(maxWidth: .infinity, minHeight: 48)
        .contentShape(Rectangle())
    }
}


struct BookmarkFlightFrames: PreferenceKey {
    static let defaultValue: [String: CGRect] = [:]
    static func reduce(value: inout [String: CGRect], nextValue: () -> [String: CGRect]) {
        value.merge(nextValue(), uniquingKeysWith: { _, new in new })
    }
}

extension View {
    func bookmarkFlightFrame(_ id: String) -> some View {
        background {
            GeometryReader { geometry in
                Color.clear.preference(key: BookmarkFlightFrames.self,
                    value: [id: geometry.frame(in: .named("bookmark-flight-space"))])
            }
        }
    }
}

struct BookmarkFlight: Identifiable {
    let id = UUID()
    let title: String
    let start: CGPoint
    let end: CGPoint
}

struct BookmarkFlightCard: View {
    let flight: BookmarkFlight
    let onArrival: () -> Void
    @State private var arrived = false

    var body: some View {
        VStack(spacing: 6) {
            Image(systemName: "heart.fill").font(.title3).foregroundStyle(SideSeatTheme.utilityAction)
            Text(flight.title).font(.caption.weight(.semibold)).lineLimit(1)
                .foregroundStyle(SideSeatTheme.textPrimary)
        }
        .padding(10)
        .frame(width: 112, height: 76)
        .background(SideSeatTheme.surface, in: RoundedRectangle(cornerRadius: SideSeatTheme.controlRadius))
        .overlay {
            RoundedRectangle(cornerRadius: SideSeatTheme.controlRadius)
                .strokeBorder(SideSeatTheme.utilityAction.opacity(0.35), lineWidth: 1)
        }
        .shadow(color: SideSeatTheme.accent.opacity(0.2), radius: 10, y: 4)
        .rotationEffect(.degrees(arrived ? 8 : -6))
        .scaleEffect(arrived ? 0.15 : 1)
        .opacity(arrived ? 0 : 1)
        .position(arrived ? flight.end : flight.start)
        .allowsHitTesting(false)
        .accessibilityHidden(true)
        .task {
            do {
                try await Task.sleep(for: .milliseconds(30))
                withAnimation(.easeInOut(duration: 0.65)) { arrived = true }
                try await Task.sleep(for: .milliseconds(650))
                onArrival()
            } catch { }
        }
    }
}
