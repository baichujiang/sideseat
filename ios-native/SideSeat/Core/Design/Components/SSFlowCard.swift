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
            HStack(spacing: SideSeatTheme.spaceSM) {
                if !dynamicTypeSize.isAccessibilitySize {
                    SSActivityArtwork(topic: topic, size: 28)
                }
                Text(topic.title)
                    .font(.subheadline.weight(.semibold))
                    .multilineTextAlignment(.leading)
                    .fixedSize(horizontal: false, vertical: true)
                    .frame(maxWidth: .infinity, alignment: .leading)
                Image(systemName: "checkmark")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(SideSeatTheme.accentText)
                    .opacity(isSelected ? 1 : 0)
                    .accessibilityHidden(true)
            }
            .padding(.horizontal, SideSeatTheme.spaceSM)
            .padding(.vertical, SideSeatTheme.spaceSM)
            .frame(maxWidth: .infinity, minHeight: 56)
            .foregroundStyle(SideSeatTheme.textPrimary)
            .background(
                SideSeatTheme.surface,
                in: RoundedRectangle(cornerRadius: SideSeatTheme.controlRadius, style: .continuous)
            )
            .overlay {
                RoundedRectangle(cornerRadius: SideSeatTheme.controlRadius, style: .continuous)
                    .strokeBorder(isSelected ? SideSeatTheme.textPrimary.opacity(0.6)
                                  : SideSeatTheme.separator.opacity(0.2), lineWidth: isSelected ? 1.5 : 0.5)
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(SSPressButtonStyle())
        .accessibilityLabel(topic.title)
        .accessibilityAddTraits(isSelected ? .isSelected : [])
    }
}

enum SSOpportunitySwipeChoice: Equatable {
    case skip
    case interested

    static func releasedChoice(translation: CGSize, travel: CGFloat) -> Self? {
        guard travel > 0,
              abs(translation.width) >= travel * 0.68,
              abs(translation.width) > abs(translation.height) * 1.5
        else { return nil }
        return translation.width > 0 ? .interested : .skip
    }
}

/// The committed position of the interest control. It is a status, not a reversible slider.
struct SSOpportunityInterestStatus: View {
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    let id: String
    var accessibilityPrefix = "mutual-opportunity"
    let isWorking: Bool
    let onWithdraw: () -> Void

    private var footerLayout: AnyLayout {
        dynamicTypeSize.isAccessibilitySize
            ? AnyLayout(VStackLayout(alignment: .leading, spacing: SideSeatTheme.spaceXS))
            : AnyLayout(HStackLayout(alignment: .center, spacing: SideSeatTheme.spaceSM))
    }

    var body: some View {
        VStack(alignment: .leading, spacing: SideSeatTheme.spaceXS) {
            HStack(spacing: SideSeatTheme.spaceSM) {
                Text(AppLocalization.string("Interest shown"))
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(SideSeatTheme.accentText)
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
            .overlay { Capsule().strokeBorder(SideSeatTheme.accent.opacity(0.25), lineWidth: 0.5) }
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(AppLocalization.string("Interest shown"))
            .accessibilityIdentifier("\(accessibilityPrefix)-saved-\(id)")

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

/// A bilateral decision control that retains its selected appearance after interest is saved.
struct SSOpportunityDecisionBar: View {
    @Environment(\.accessibilityReduceMotion) private var systemReduceMotion
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    @State private var translation: CGSize = .zero
    @State private var trackWidth: CGFloat = 0
    @State private var committedChoice: SSOpportunitySwipeChoice?

    let opportunityID: String
    let isInterested: Bool
    let isWorking: Bool
    let onInterested: () async -> Void
    let onSkip: () async -> Void
    let onWithdraw: () -> Void

    private let thumbSize: CGFloat = 52
    private let trackInset: CGFloat = 6
    private var trackHeight: CGFloat { dynamicTypeSize.isAccessibilitySize ? 72 : 64 }

    private var reduceMotion: Bool {
        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("--ui-testing-reduce-motion") { return true }
        #endif
        return systemReduceMotion
    }

    private var centerOffset: CGFloat { max(0, (trackWidth - thumbSize) / 2) }
    private var travel: CGFloat { max(0, centerOffset - trackInset) }
    private var offset: CGFloat { min(travel, max(-travel, translation.width)) }
    private var armedChoice: SSOpportunitySwipeChoice? {
        SSOpportunitySwipeChoice.releasedChoice(translation: translation, travel: travel)
    }
    private var isDragging: Bool { translation != .zero && committedChoice == nil }
    private var isSubmitting: Bool { committedChoice != nil || isWorking }
    private var activeChoice: SSOpportunitySwipeChoice? {
        if let committedChoice { return committedChoice }
        guard abs(offset) > 3 else { return nil }
        return offset > 0 ? .interested : .skip
    }
    private var progress: CGFloat { travel > 0 ? abs(offset) / travel : 0 }
    private var feedbackText: String {
        if isSubmitting { return AppLocalization.string("Saving…") }
        return AppLocalization.string(armedChoice == nil ? "Keep sliding" : "Release to confirm")
    }
    private var returnAnimation: Animation? {
        reduceMotion ? nil : .spring(response: 0.34, dampingFraction: 0.74)
    }

    var body: some View {
        Group {
            if isInterested {
                SSOpportunityInterestStatus(id: opportunityID, isWorking: isWorking, onWithdraw: onWithdraw)
            } else {
                VStack(spacing: SideSeatTheme.spaceSM) {
                    decisionLabels
                    accessibleTrack
                }
            }
        }
        .background(SSPageSwipeExclusion())
    }

    private var feedbackTrack: some View {
        decisionTrack
            .sensoryFeedback(.impact(weight: .light, intensity: 0.55), trigger: armedChoice) { old, new in
                old == nil && new != nil && !isSubmitting
            }
            .sensoryFeedback(.impact(weight: .medium, intensity: 0.75), trigger: committedChoice) { _, choice in
                choice != nil
            }
    }

    private var accessibleTrack: some View {
        feedbackTrack
            .accessibilityElement(children: .contain)
            .accessibilityLabel(AppLocalization.string("Choose interest"))
            .accessibilityHint(AppLocalization.string("Swipe left for Not interested or right for Interested"))
            .accessibilityValue(isSubmitting ? AppLocalization.string("Saving…") : AppLocalization.string("Not selected"))
            .accessibilityAdjustableAction { direction in
                switch direction {
                case .increment: submit(.interested)
                case .decrement: submit(.skip)
                @unknown default: break
                }
            }
            .accessibilityAction(named: AppLocalization.string("Interested")) { submit(.interested) }
            .accessibilityAction(named: AppLocalization.string("Not interested")) { submit(.skip) }
            .accessibilityIdentifier("mutual-opportunity-swipe-\(opportunityID)")
    }

    private var decisionTrack: some View {
        ZStack(alignment: .leading) {
            Capsule()
                .fill(SideSeatTheme.Together.decisionWell)

            // The wash follows actual distance; it never advances on its own.
            Capsule()
                .fill(activeChoice == .interested ? SideSeatTheme.accent.opacity(0.16) : SideSeatTheme.Together.ink.opacity(0.07))
                .frame(width: thumbSize + abs(offset), height: trackHeight - trackInset * 2)
                .offset(x: centerOffset + min(0, offset))
                .opacity(Double(min(1, progress * 4)))
                .allowsHitTesting(false)

            HStack {
                Image(systemName: "minus")
                    .foregroundStyle(SideSeatTheme.textSecondaryStrong)
                Spacer()
                Image(systemName: "star")
                    .foregroundStyle(SideSeatTheme.Together.decisionHandleInk)
            }
            .font(.system(size: 16, weight: .medium))
            .padding(.horizontal, 22)
            .opacity(activeChoice == nil ? 1 : 0)
            .accessibilityHidden(true)

            dragFeedback

            Capsule()
                .strokeBorder(trackStroke, lineWidth: armedChoice == nil ? 0.5 : 1)
                .allowsHitTesting(false)

            thumb
                .offset(x: centerOffset + offset)
        }
        .frame(height: trackHeight)
        .background(trackWidthReader)
    }

    private var decisionLabels: some View {
        HStack(alignment: .top, spacing: SideSeatTheme.spaceLG) {
            Button { submit(.skip) } label: {
                Text(AppLocalization.string("Not interested"))
                    .foregroundStyle(SideSeatTheme.textSecondaryStrong)
                    .opacity(activeChoice == .interested ? 0.5 : 1)
                    .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
                    .contentShape(Rectangle())
            }
            .accessibilityIdentifier("mutual-opportunity-skip-action-\(opportunityID)")

            Button { submit(.interested) } label: {
                Text(AppLocalization.string("Interested"))
                    .foregroundStyle(SideSeatTheme.accentText)
                    .opacity(activeChoice == .skip ? 0.5 : 1)
                    .multilineTextAlignment(.trailing)
                    .frame(maxWidth: .infinity, minHeight: 44, alignment: .trailing)
                    .contentShape(Rectangle())
            }
            .accessibilityIdentifier("mutual-opportunity-interest-action-\(opportunityID)")
        }
        .buttonStyle(.plain)
        .disabled(isSubmitting)
        .font(.caption.weight(.medium))
        .fixedSize(horizontal: false, vertical: true)
        .padding(.horizontal, 4)
        .animation(reduceMotion ? nil : .easeOut(duration: 0.15), value: activeChoice)
    }

    private var dragFeedback: some View {
        let isRight = offset >= 0
        let availableWidth = max(0, centerOffset + abs(offset) - 24)
        return Text(feedbackText)
            .font(.caption.weight(armedChoice == nil ? .medium : .semibold))
            .foregroundStyle(SideSeatTheme.Together.ink)
            .multilineTextAlignment(.center)
            .lineLimit(2)
            .minimumScaleFactor(0.85)
            .frame(width: availableWidth, height: trackHeight - 12)
            .offset(x: isRight ? 12 : centerOffset + offset + thumbSize + 12)
            .opacity(Double(min(1, max(0, (progress - 0.12) / 0.25))))
            .allowsHitTesting(false)
            .accessibilityHidden(true)
    }

    private var trackWidthReader: some View {
        GeometryReader { proxy in
            Color.clear
                .onAppear { trackWidth = proxy.size.width }
                .onChange(of: proxy.size.width) { _, width in trackWidth = width }
        }
    }

    private var trackStroke: Color {
        switch armedChoice ?? committedChoice {
        case .interested: return SideSeatTheme.accent.opacity(0.45)
        case .skip: return SideSeatTheme.Together.ink.opacity(0.25)
        case nil: return SideSeatTheme.Together.border
        }
    }

    private var thumb: some View {
        ZStack {
            Circle().fill(thumbFill)
            Circle().strokeBorder(thumbStroke, lineWidth: 0.75)
            if isSubmitting {
                ProgressView().tint(thumbForeground)
            } else if let choice = armedChoice {
                Image(systemName: choice == .interested ? "star.fill" : "minus")
                    .font(.system(size: 19, weight: .semibold))
                    .foregroundStyle(thumbForeground)
            } else {
                HStack(spacing: 3) {
                    Image(systemName: "chevron.left").font(.system(size: 8, weight: .semibold))
                    Image(systemName: "star").font(.system(size: 19, weight: .semibold))
                    Image(systemName: "chevron.right").font(.system(size: 8, weight: .semibold))
                }
                .foregroundStyle(thumbForeground)
            }
        }
        .frame(width: thumbSize, height: thumbSize)
        .contentShape(Circle())
        .shadow(color: SideSeatTheme.Together.shadow.opacity(isDragging ? 0.16 : 0.10), radius: isDragging ? 8 : 4, y: isDragging ? 3 : 2)
        .scaleEffect(reduceMotion || !isDragging ? 1 : 1.04)
        .animation(reduceMotion ? nil : .spring(response: 0.24, dampingFraction: 0.8), value: isDragging)
        .overlay(dragSurface)
        .allowsHitTesting(!isSubmitting)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(AppLocalization.string("Choose interest"))
        .accessibilityHint(AppLocalization.string("Swipe left for Not interested or right for Interested"))
        .accessibilityAdjustableAction { direction in
            switch direction {
            case .increment: submit(.interested)
            case .decrement: submit(.skip)
            @unknown default: break
            }
        }
        .accessibilityIdentifier("mutual-opportunity-swipe-handle-\(opportunityID)")
    }

    private var dragSurface: some View {
        SSHorizontalDecisionDragSurface(
            isEnabled: !isSubmitting,
            onChange: { movement in
                guard committedChoice == nil else { return }
                if movement == .zero {
                    withAnimation(returnAnimation) { translation = .zero }
                } else {
                    translation = movement
                }
            },
            onEnd: { movement in
                if let choice = SSOpportunitySwipeChoice.releasedChoice(
                    translation: movement,
                    travel: travel
                ) {
                    submit(choice)
                }
            }
        )
        .accessibilityHidden(true)
    }

    private var thumbFill: Color {
        switch armedChoice ?? committedChoice {
        case .interested: return SideSeatTheme.Together.decisionHandle
        case .skip: return SideSeatTheme.Together.ink
        case nil: return SideSeatTheme.Together.decisionHandle
        }
    }

    private var thumbStroke: Color {
        switch armedChoice {
        case .interested: return SideSeatTheme.Together.decisionHandleBorder
        case .skip: return SideSeatTheme.Together.ink
        case nil: return SideSeatTheme.Together.decisionHandleBorder
        }
    }

    private var thumbForeground: Color {
        switch armedChoice ?? committedChoice {
        case .interested: return SideSeatTheme.Together.decisionHandleInk
        case .skip: return SideSeatTheme.Together.canvas
        case nil: return SideSeatTheme.Together.decisionHandleInk
        }
    }

    private func submit(_ choice: SSOpportunitySwipeChoice) {
        guard !isInterested, !isSubmitting else { return }
        committedChoice = choice
        withAnimation(reduceMotion ? nil : .easeOut(duration: 0.16)) {
            translation = CGSize(width: choice == .interested ? travel : -travel, height: 0)
        }
        Task {
            if choice == .interested { await onInterested() } else { await onSkip() }
            withAnimation(returnAnimation) {
                committedChoice = nil
                translation = .zero
            }
        }
    }
}

/// SwiftUI DragGesture consumed vertical drags in the Together ScrollView on iOS 26.5.
/// Reject vertical movement before recognition so the parent can keep scrolling.
private struct SSHorizontalDecisionDragSurface: UIViewRepresentable {
    let isEnabled: Bool
    let onChange: (CGSize) -> Void
    let onEnd: (CGSize) -> Void

    func makeCoordinator() -> Coordinator { Coordinator(parent: self) }

    func makeUIView(context: Context) -> UIView {
        let view = UIView()
        let pan = UIPanGestureRecognizer(target: context.coordinator, action: #selector(Coordinator.drag(_:)))
        pan.maximumNumberOfTouches = 1
        pan.delegate = context.coordinator
        pan.isEnabled = isEnabled
        view.addGestureRecognizer(pan)
        return view
    }

    func updateUIView(_ uiView: UIView, context: Context) {
        context.coordinator.parent = self
        if let pan = uiView.gestureRecognizers?.first, pan.isEnabled != isEnabled {
            pan.isEnabled = isEnabled
        }
    }

    final class Coordinator: NSObject, UIGestureRecognizerDelegate {
        var parent: SSHorizontalDecisionDragSurface
        init(parent: SSHorizontalDecisionDragSurface) { self.parent = parent }

        func gestureRecognizerShouldBegin(_ gestureRecognizer: UIGestureRecognizer) -> Bool {
            guard let pan = gestureRecognizer as? UIPanGestureRecognizer else { return false }
            let velocity = pan.velocity(in: pan.view?.window)
            return abs(velocity.x) > abs(velocity.y) * 1.5
        }

        func gestureRecognizer(_ gestureRecognizer: UIGestureRecognizer,
                               shouldRecognizeSimultaneouslyWith other: UIGestureRecognizer) -> Bool {
            other.view is UIScrollView
        }

        @objc func drag(_ pan: UIPanGestureRecognizer) {
            // Window coordinates remain stable while the handle follows the finger.
            let point = pan.translation(in: pan.view?.window)
            let movement = CGSize(width: point.x, height: point.y)
            switch pan.state {
            case .began, .changed: parent.onChange(movement)
            case .ended:
                parent.onEnd(movement)
                parent.onChange(.zero)
            case .cancelled, .failed: parent.onChange(.zero)
            default: break
            }
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
                        .foregroundStyle(SideSeatTheme.accentText)
                        .accessibilityHidden(true)
                }
            }
            .foregroundStyle(SideSeatTheme.textPrimary)
            .padding(.horizontal, SideSeatTheme.spaceMD)
            .padding(.vertical, SideSeatTheme.spaceSM)
            .frame(minHeight: 48)
            .background(
                isSelected ? SideSeatTheme.accent.opacity(0.08) : SideSeatTheme.fillTertiary,
                in: RoundedRectangle(cornerRadius: SideSeatTheme.controlRadius, style: .continuous)
            )
            .overlay {
                RoundedRectangle(cornerRadius: SideSeatTheme.controlRadius, style: .continuous)
                    .strokeBorder(isSelected ? SideSeatTheme.accent : .clear, lineWidth: 1)
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
