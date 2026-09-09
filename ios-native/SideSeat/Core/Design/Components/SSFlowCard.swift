import SwiftUI
import UIKit

/// Shared anatomy for Together and Plans: context, title, details, then one primary action.
struct SSFlowCard<Content: View>: View {
    @ViewBuilder var content: () -> Content

    var body: some View {
        VStack(alignment: .leading, spacing: SideSeatTheme.spaceMD, content: content)
            .padding(SideSeatTheme.spaceLG)
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

    /// Actual horizontal travel, not projected flick velocity, commits a private choice.
    static func releasedChoice(translation: CGSize, travel: CGFloat) -> Self? {
        guard travel > 0,
              abs(translation.width) >= travel * 0.72,
              abs(translation.width) > abs(translation.height) * 1.5
        else { return nil }
        return translation.width > 0 ? .interested : .skip
    }
}

/// One bidirectional control for private interest, never a confirmed Plan.
/// The embedded end labels and VoiceOver actions provide non-drag alternatives.
struct SSOpportunityDecisionBar: View {
    @Environment(\.accessibilityReduceMotion) private var systemReduceMotion
    @State private var translation: CGSize = .zero
    @State private var trackWidth: CGFloat = 0
    @State private var committedChoice: SSOpportunitySwipeChoice?

    let opportunityID: String
    let isWorking: Bool
    let onInterested: () async -> Void
    let onSkip: () async -> Void

    private var reduceMotion: Bool {
        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("--ui-testing-reduce-motion") { return true }
        #endif
        return systemReduceMotion
    }

    private let thumbSize: CGFloat = 48
    private var travel: CGFloat { max(0, (trackWidth - thumbSize) / 2 - SideSeatTheme.spaceSM) }
    private var offset: CGFloat { min(travel, max(-travel, translation.width)) }
    private var progress: CGFloat { travel > 0 ? abs(offset) / travel : 0 }
    private var isDragging: Bool { translation != .zero && committedChoice == nil }
    private var isSubmitting: Bool { committedChoice != nil || isWorking }
    private var direction: SSOpportunitySwipeChoice? {
        if let committedChoice { return committedChoice }
        if offset == 0 { return nil }
        return offset > 0 ? .interested : .skip
    }
    private var feedbackColor: Color {
        direction == .interested ? SideSeatTheme.accentText : SideSeatTheme.textSecondaryStrong
    }
    private var feedbackFill: Color {
        direction == .interested ? SideSeatTheme.accent : SideSeatTheme.textSecondaryStrong
    }
    private var feedbackStep: Int { min(3, Int(progress / 0.24)) }
    private var returnAnimation: Animation? {
        reduceMotion ? nil : .spring(response: 0.38, dampingFraction: 0.66)
    }
    private var armedChoice: SSOpportunitySwipeChoice? {
        SSOpportunitySwipeChoice.releasedChoice(translation: translation, travel: travel)
    }
    private var feedbackKey: String {
        if isSubmitting { return "Saving…" }
        switch armedChoice {
        case .interested: return "Release to show interest"
        case .skip: return "Release to ignore"
        case nil:
            if direction == .interested { return "Show interest" }
            if direction == .skip { return "Ignore" }
            return "Slide or tap to choose"
        }
    }

    var body: some View {
        VStack(spacing: SideSeatTheme.spaceSM) {
            HStack(spacing: 0) {
                endpoint(.skip)
                Color.clear.frame(width: thumbSize + SideSeatTheme.spaceLG, height: thumbSize)
                endpoint(.interested)
            }
            .padding(.horizontal, SideSeatTheme.spaceSM)
            .frame(minHeight: 64)
            .background {
                HStack(spacing: 0) {
                    Color.clear
                    SideSeatTheme.accent.opacity(0.08 + (offset > 0 ? progress * 0.12 : 0))
                }
                .background(SideSeatTheme.fillTertiary)
                .clipShape(Capsule())
            }
            .overlay {
                Capsule().strokeBorder(feedbackColor.opacity(0.12 + progress * 0.35),
                                       lineWidth: armedChoice == nil ? 0.5 : 1.5)
            }
            .background {
                GeometryReader { proxy in
                    Color.clear
                        .onAppear { trackWidth = proxy.size.width }
                        .onChange(of: proxy.size.width) { _, width in trackWidth = width }
                }
            }
            .overlay {
                ZStack {
                    // A continuous color trail connects the origin to the moving handle.
                    Capsule()
                        .fill(feedbackFill.opacity(0.18 * progress))
                        .frame(width: thumbSize + abs(offset), height: thumbSize)
                        .offset(x: offset / 2)
                    Circle()
                        .strokeBorder(feedbackColor.opacity(progress * 0.45),
                                      style: StrokeStyle(lineWidth: 1.5, dash: [3, 4]))
                        .frame(width: thumbSize + 6, height: thumbSize + 6)
                        .offset(x: direction == .interested ? travel : -travel)
                }
                .allowsHitTesting(false)
                .accessibilityHidden(true)
            }
            .overlay { thumb.offset(x: offset) }
            .sensoryFeedback(.impact(weight: .light, intensity: 0.5), trigger: isDragging) { _, dragging in dragging }
            .sensoryFeedback(.selection, trigger: feedbackStep) { old, new in
                isDragging && new > old && new < 3
            }
            .sensoryFeedback(.impact(weight: .medium, intensity: 0.9), trigger: armedChoice) { _, choice in
                !isSubmitting && choice != nil
            }
            .sensoryFeedback(.impact(weight: .heavy, intensity: 0.8), trigger: committedChoice) { _, choice in
                choice != nil
            }

            // Reserve the tallest localized cue so feedback never moves the track mid-drag.
            ZStack {
                ForEach(["Slide or tap to choose", "Release to show interest", "Release to ignore", "Saving…"], id: \.self) { key in
                    Text(AppLocalization.string(String.LocalizationValue(key)))
                        .hidden()
                        .accessibilityHidden(true)
                }
                Text(AppLocalization.string(String.LocalizationValue(feedbackKey)))
                    .fontWeight(armedChoice == nil ? .regular : .semibold)
                    .contentTransition(.opacity)
                    .accessibilityIdentifier("mutual-opportunity-swipe-feedback-\(opportunityID)")
            }
                .font(.caption)
                .foregroundStyle(direction == nil ? SideSeatTheme.textSecondaryStrong : feedbackColor)
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("mutual-opportunity-swipe-\(opportunityID)")
    }

    private func endpoint(_ choice: SSOpportunitySwipeChoice) -> some View {
        Button { submit(choice) } label: {
            Text(AppLocalization.string(choice == .interested ? "Show interest" : "Ignore"))
                .font(.subheadline.weight(.semibold))
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)
                .foregroundStyle(choice == .interested ? SideSeatTheme.accentText : SideSeatTheme.textSecondaryStrong)
                .padding(.vertical, SideSeatTheme.spaceMD)
                .frame(maxWidth: .infinity, minHeight: 64)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .opacity(isSubmitting ? 0.15 : (direction == choice ? 1 - progress : 1 - progress * 0.65))
        .offset(x: reduceMotion ? 0 : (choice == .interested ? -1 : 1) * progress * 6)
        .disabled(isSubmitting || isDragging)
        .accessibilityIdentifier("mutual-opportunity-\(choice == .interested ? "yes" : "no")-\(opportunityID)")
    }

    private var thumb: some View {
        ZStack {
            Circle()
                .strokeBorder(feedbackColor.opacity(armedChoice == nil ? 0.12 : 0.45), lineWidth: 2)
                .frame(width: thumbSize + 6, height: thumbSize + 6)
                .scaleEffect(reduceMotion ? 1 : (armedChoice == nil ? 1 : 1.13))
                .opacity(progress)
                .animation(reduceMotion ? nil : .spring(response: 0.24, dampingFraction: 0.5), value: armedChoice)

            ZStack {
                Circle()
                    .fill(armedChoice == .interested ? SideSeatTheme.accent : SideSeatTheme.surface)
                Circle()
                    .trim(from: 0, to: min(1, progress / 0.72))
                    .stroke(feedbackColor, style: StrokeStyle(lineWidth: 2.5, lineCap: .round))
                    .rotationEffect(.degrees(-90))
                    .padding(3)
                    .opacity(isSubmitting ? 0 : 1)
                Group {
                    if isWorking {
                        ProgressView().tint(direction == .interested ? SideSeatTheme.onAccent : SideSeatTheme.textPrimary)
                    } else if let choice = committedChoice ?? armedChoice {
                        Image(systemName: choice == .interested ? "checkmark" : "minus")
                            .font(.system(size: 18, weight: .bold))
                            .foregroundStyle(choice == .interested ? SideSeatTheme.onAccent : SideSeatTheme.textPrimary)
                    } else {
                        HStack(spacing: SideSeatTheme.spaceSM) {
                            Image(systemName: "chevron.left")
                                .foregroundStyle(SideSeatTheme.textSecondaryStrong)
                            Image(systemName: "chevron.right")
                                .foregroundStyle(SideSeatTheme.accentText)
                        }
                        .font(.system(size: 12, weight: .bold))
                    }
                }
            }
            .frame(width: thumbSize, height: thumbSize)
            .overlay { Circle().strokeBorder(SideSeatTheme.separator.opacity(0.2), lineWidth: 0.5) }
            .shadow(color: feedbackFill.opacity(0.12 + progress * 0.22),
                    radius: isDragging ? 10 : 4, y: isDragging ? 5 : 2)
            .scaleEffect(x: reduceMotion ? 1 : (isDragging ? 1.08 + progress * 0.06 : 1),
                         y: reduceMotion ? 1 : (isDragging ? 1.08 - progress * 0.03 : 1))
            .rotationEffect(.degrees(reduceMotion || isSubmitting ? 0 : (offset / max(1, travel)) * 8))
            .animation(reduceMotion ? nil : .spring(response: 0.24, dampingFraction: 0.6), value: isDragging)
        }
        .frame(width: thumbSize, height: thumbSize)
        .contentShape(Circle())
        .overlay {
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
                        translation: movement, travel: travel
                    ) { submit(choice) }
                }
            )
            .accessibilityHidden(true)
        }
        .allowsHitTesting(!isSubmitting)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(AppLocalization.string("Slide or tap to choose"))
        .accessibilityValue(AppLocalization.string(String.LocalizationValue(feedbackKey)))
        .accessibilityAction(named: Text(AppLocalization.string("Show interest"))) { submit(.interested) }
        .accessibilityAction(named: Text(AppLocalization.string("Ignore"))) { submit(.skip) }
        .accessibilityIdentifier("mutual-opportunity-swipe-handle-\(opportunityID)")
    }

    private func submit(_ choice: SSOpportunitySwipeChoice) {
        guard !isSubmitting else { return }
        withAnimation(reduceMotion ? nil : .easeOut(duration: 0.18), completionCriteria: .logicallyComplete) {
            committedChoice = choice
            translation = CGSize(width: choice == .interested ? travel : -travel, height: 0)
        } completion: {
            Task {
                if choice == .interested { await onInterested() } else { await onSkip() }
                // The existing action handles save errors. If the card remains, it is retryable.
                withAnimation(returnAnimation) {
                    committedChoice = nil
                    translation = .zero
                }
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
