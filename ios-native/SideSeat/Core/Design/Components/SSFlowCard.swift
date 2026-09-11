import SwiftUI
import UIKit

/// Shared anatomy for Together and Plans: context, title, details, then one primary action.
struct SSFlowCard<Content: View>: View {
    var contentPadding: CGFloat = SideSeatTheme.spaceLG
    var contentSpacing: CGFloat = SideSeatTheme.spaceMD
    @ViewBuilder var content: () -> Content

    var body: some View {
        VStack(alignment: .leading, spacing: contentSpacing, content: content)
            .padding(contentPadding)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(
                SideSeatTheme.surface,
                in: RoundedRectangle(
                    cornerRadius: SideSeatTheme.cardRadius, style: .continuous
                )
            )
            .overlay {
                RoundedRectangle(cornerRadius: SideSeatTheme.cardRadius, style: .continuous)
                    .strokeBorder(SideSeatTheme.separator.opacity(0.25), lineWidth: 0.5)
            }
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
    let topic: NativeWeeklyIntentTopic
    let isSelected: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            VStack(spacing: SideSeatTheme.spaceSM) {
                SSActivityArtwork(topic: topic, size: 56)
                Text(topic.title)
                    .font(.subheadline.weight(.semibold))
                    .multilineTextAlignment(.center)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .padding(SideSeatTheme.spaceMD)
            .frame(maxWidth: .infinity, minHeight: 112)
            .foregroundStyle(SideSeatTheme.textPrimary)
            .background(
                isSelected ? SideSeatTheme.activityInset : SideSeatTheme.surface,
                in: RoundedRectangle(cornerRadius: SideSeatTheme.cardRadius, style: .continuous)
            )
            .overlay {
                RoundedRectangle(cornerRadius: SideSeatTheme.cardRadius, style: .continuous)
                    .strokeBorder(isSelected ? SideSeatTheme.textPrimary.opacity(0.6)
                                  : SideSeatTheme.separator.opacity(0.2), lineWidth: isSelected ? 1.5 : 0.5)
            }
            .overlay(alignment: .topTrailing) {
                if isSelected {
                    Image(systemName: "checkmark.circle.fill")
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundStyle(SideSeatTheme.accentText)
                        .padding(SideSeatTheme.spaceSM)
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

/// A compact bilateral decision control: left means not interested, right means interested.
struct SSOpportunityDecisionBar: View {
    @Environment(\.accessibilityReduceMotion) private var systemReduceMotion
    @State private var translation: CGSize = .zero
    @State private var trackWidth: CGFloat = 0
    @State private var committedChoice: SSOpportunitySwipeChoice?

    let opportunityID: String
    let isWorking: Bool
    let onInterested: () async -> Void
    let onSkip: () async -> Void

    private let thumbSize: CGFloat = 48
    private let trackInset: CGFloat = 8

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
    private var returnAnimation: Animation? {
        reduceMotion ? nil : .spring(response: 0.34, dampingFraction: 0.74)
    }

    var body: some View {
        accessibleTrack
    }

    private var feedbackTrack: some View {
        decisionTrack
            .opacity(isSubmitting ? 0.72 : 1)
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
            .accessibilityAdjustableAction { direction in
                switch direction {
                case .increment: submit(.interested)
                case .decrement: submit(.skip)
                @unknown default: break
                }
            }
            .accessibilityIdentifier("mutual-opportunity-swipe-\(opportunityID)")
    }

    private var decisionTrack: some View {
        ZStack(alignment: .leading) {
            Capsule()
                .fill(SideSeatTheme.fillTertiary)

            decisionLabels

            Capsule()
                .strokeBorder(trackStroke, lineWidth: armedChoice == nil ? 0.5 : 1.5)
                .allowsHitTesting(false)

            thumb
                .offset(x: centerOffset + offset)
        }
        .frame(height: 60)
        .background(trackWidthReader)
    }

    private var decisionLabels: some View {
        HStack(spacing: SideSeatTheme.spaceXS) {
            Label(AppLocalization.string("Not interested"), systemImage: "arrow.left")
                .font(.caption.weight(armedChoice == .skip ? .semibold : .medium))
                .foregroundStyle(armedChoice == .skip ? SideSeatTheme.textPrimary : SideSeatTheme.textSecondaryStrong)
                .lineLimit(1)
                .frame(maxWidth: .infinity, alignment: .leading)

            Color.clear.frame(width: thumbSize + SideSeatTheme.spaceSM)

            Label(AppLocalization.string("Interested"), systemImage: "arrow.right")
                .font(.caption.weight(armedChoice == .interested ? .semibold : .medium))
                .foregroundStyle(armedChoice == .interested ? SideSeatTheme.accentText : SideSeatTheme.textSecondaryStrong)
                .lineLimit(1)
                .frame(maxWidth: .infinity, alignment: .trailing)
        }
        .padding(.horizontal, SideSeatTheme.spaceMD)
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
        switch armedChoice {
        case .interested: return SideSeatTheme.accent.opacity(0.55)
        case .skip: return SideSeatTheme.textSecondaryStrong.opacity(0.42)
        case nil: return SideSeatTheme.separator.opacity(0.22)
        }
    }

    private var thumb: some View {
        ZStack {
            Circle().fill(thumbFill)
            Circle().strokeBorder(thumbStroke, lineWidth: armedChoice == nil ? 0.75 : 2)
            if isWorking {
                ProgressView().tint(thumbForeground)
            } else {
                Image(systemName: thumbSymbol)
                    .font(.system(size: 16, weight: .bold))
                    .foregroundStyle(thumbForeground)
            }
        }
        .frame(width: thumbSize, height: thumbSize)
        .contentShape(Circle())
        .shadow(color: SideSeatTheme.accent.opacity(isDragging ? 0.18 : 0.08), radius: isDragging ? 7 : 3, y: 2)
        .scaleEffect(reduceMotion || !isDragging ? 1 : (armedChoice == nil ? 1.04 : 1.08))
        .animation(reduceMotion ? nil : .spring(response: 0.22, dampingFraction: 0.7), value: armedChoice)
        .overlay(dragSurface)
        .allowsHitTesting(!isSubmitting)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(AppLocalization.string("Choose interest"))
        .accessibilityHint(AppLocalization.string("Swipe left for Not interested or right for Interested"))
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
        case .interested: return SideSeatTheme.accent
        case .skip: return SideSeatTheme.textSecondaryStrong
        case nil: return SideSeatTheme.surface
        }
    }

    private var thumbStroke: Color {
        switch armedChoice {
        case .interested: return SideSeatTheme.accent
        case .skip: return SideSeatTheme.textSecondaryStrong
        case nil: return SideSeatTheme.separator.opacity(0.28)
        }
    }

    private var thumbForeground: Color {
        (armedChoice ?? committedChoice) == nil ? SideSeatTheme.accentText : SideSeatTheme.onAccent
    }

    private var thumbSymbol: String {
        switch armedChoice ?? committedChoice {
        case .interested: return "checkmark"
        case .skip: return "xmark"
        case nil: return "arrow.left.and.right"
        }
    }

    private func submit(_ choice: SSOpportunitySwipeChoice) {
        guard !isSubmitting else { return }
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
