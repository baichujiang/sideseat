import SwiftUI

struct ProductTutorialOverlay: View {
    @Bindable var controller: ProductTutorialController
    let session: SessionStore
    let selectTab: (AppTab) -> Void

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var pulse = false

    var body: some View {
        GeometryReader { geometry in
            let bottomInset = max(geometry.safeAreaInsets.bottom, 8)
            // Sit above the system tab bar without covering it.
            let tabBarLift: CGFloat = 56 + bottomInset

            ZStack(alignment: .bottom) {
                Color.clear
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .allowsHitTesting(false)

                VStack(spacing: 10) {
                    tabSpotlight
                    coachCard
                }
                .padding(.horizontal, 14)
                .padding(.bottom, tabBarLift)
                .frame(maxWidth: 420)
                .frame(maxWidth: .infinity)
                .opacity(controller.hasEntered ? 1 : 0)
                .offset(y: controller.hasEntered ? 0 : 14)
                .allowsHitTesting(controller.hasEntered)
            }
        }
        .ignoresSafeArea()
        .accessibilityIdentifier("product-tutorial")
        .onAppear {
            selectTab(controller.currentStep.tab)
            runEnterAnimation()
            startPulseIfNeeded()
        }
        .onChange(of: controller.stepIndex) { _, _ in
            pulse = false
            startPulseIfNeeded()
        }
        .onChange(of: controller.isPresented) { _, presented in
            if presented {
                runEnterAnimation()
            }
        }
    }

    private var tabSpotlight: some View {
        HStack(spacing: 6) {
            ForEach(Array(ProductTutorialController.steps.enumerated()), id: \.element.id) { index, step in
                let active = index == controller.stepIndex
                Button {
                    withAnimation(stepAnimation) {
                        controller.jump(to: index, selectTab: selectTab)
                    }
                } label: {
                    HStack(spacing: 6) {
                        Image(systemName: step.systemImage)
                            .font(.caption.weight(.semibold))
                        if active {
                            Text(step.title)
                                .font(.caption.weight(.semibold))
                                .lineLimit(1)
                        }
                    }
                    .foregroundStyle(active ? Color.white : Color.primary.opacity(0.72))
                    .padding(.horizontal, active ? 12 : 10)
                    .padding(.vertical, 8)
                    .background {
                        Capsule(style: .continuous)
                            .fill(active ? SideSeatTheme.rose : Color.primary.opacity(0.06))
                    }
                    .overlay {
                        Capsule(style: .continuous)
                            .strokeBorder(
                                active ? SideSeatTheme.rose.opacity(0.01) : Color.primary.opacity(0.08),
                                lineWidth: 1
                            )
                    }
                    .scaleEffect(active && pulse && !reduceMotion ? 1.04 : 1)
                    .shadow(
                        color: active ? SideSeatTheme.magenta.opacity(0.28) : .clear,
                        radius: active ? 10 : 0,
                        y: 3
                    )
                }
                .buttonStyle(.plain)
                .accessibilityLabel(step.title)
                .accessibilityAddTraits(active ? .isSelected : [])
                .accessibilityIdentifier("product-tutorial-tab-\(step.id)")
            }
        }
        .padding(6)
        .background(
            Capsule(style: .continuous)
                .fill(.ultraThinMaterial)
                .shadow(color: .black.opacity(0.08), radius: 12, y: 4)
        )
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("product-tutorial-spotlight")
    }

    private var coachCard: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .center, spacing: 10) {
                Text(
                    String(
                        format: String(localized: "%lld / %lld"),
                        Int64(controller.stepIndex + 1),
                        Int64(ProductTutorialController.steps.count)
                    )
                )
                .font(.caption2.weight(.bold))
                .tracking(0.8)
                .textCase(.uppercase)
                .foregroundStyle(.secondary)
                .padding(.horizontal, 10)
                .padding(.vertical, 5)
                .background(Capsule().fill(Color.primary.opacity(0.06)))

                Spacer(minLength: 8)

                Button("Skip") {
                    Task { await controller.dismiss(using: session, selectTab: selectTab) }
                }
                .font(.subheadline.weight(.medium))
                .foregroundStyle(.secondary)
                .accessibilityIdentifier("product-tutorial-skip")
                .disabled(controller.isDismissing)

                Button {
                    Task { await controller.dismiss(using: session, selectTab: selectTab) }
                } label: {
                    Image(systemName: "xmark")
                        .font(.caption.weight(.bold))
                        .foregroundStyle(.secondary)
                        .frame(width: 28, height: 28)
                        .background(Circle().fill(Color.primary.opacity(0.06)))
                }
                .accessibilityLabel("Close tutorial")
                .accessibilityIdentifier("product-tutorial-close")
                .disabled(controller.isDismissing)
            }
            .padding(.horizontal, 16)
            .padding(.top, 14)
            .padding(.bottom, 10)

            HStack(alignment: .top, spacing: 12) {
                ZStack {
                    RoundedRectangle(cornerRadius: SideSeatTheme.controlRadius, style: .continuous)
                        .fill(SideSeatTheme.accentGradient)
                        .shadow(color: SideSeatTheme.magenta.opacity(0.28), radius: 8, y: 3)
                    Image(systemName: controller.currentStep.systemImage)
                        .font(.body.weight(.semibold))
                        .foregroundStyle(.white)
                }
                .frame(width: 40, height: 40)

                VStack(alignment: .leading, spacing: 6) {
                    Text(controller.currentStep.title)
                        .font(.title3.weight(.semibold))
                        .foregroundStyle(.primary)
                        .accessibilityIdentifier("product-tutorial-title")

                    Text(controller.currentStep.body)
                        .font(.subheadline)
                        .foregroundStyle(.primary.opacity(0.88))
                        .fixedSize(horizontal: false, vertical: true)
                        .accessibilityIdentifier("product-tutorial-body")

                    Text(controller.currentStep.hint)
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .padding(.horizontal, 16)
            .id(controller.currentStep.id)
            .transition(
                reduceMotion
                    ? .opacity
                    : .asymmetric(
                        insertion: .opacity.combined(with: .move(edge: .trailing)),
                        removal: .opacity.combined(with: .move(edge: .leading))
                    )
            )

            progressDots
                .padding(.top, 14)
                .padding(.horizontal, 16)

            HStack(spacing: 10) {
                if controller.stepIndex > 0 {
                    SSSecondaryButton(
                        title: String(localized: "Back"),
                        kind: .softFill,
                        fontWeight: .semibold,
                        accessibilityID: "product-tutorial-back"
                    ) {
                        withAnimation(stepAnimation) {
                            controller.goBack(selectTab: selectTab)
                        }
                    }
                } else {
                    Color.clear.frame(height: 44)
                        .frame(maxWidth: .infinity)
                }

                if controller.isLastStep {
                    SSPrimaryButton(
                        title: String(localized: "Done"),
                        isLoading: controller.isDismissing,
                        fill: .brand,
                        chrome: .capsule,
                        height: 44,
                        accessibilityID: "product-tutorial-done"
                    ) {
                        Task { await controller.dismiss(using: session, selectTab: selectTab) }
                    }
                    .disabled(controller.isDismissing)
                } else {
                    SSPrimaryButton(
                        title: String(localized: "Next"),
                        fill: .brand,
                        chrome: .capsule,
                        height: 44,
                        accessibilityID: "product-tutorial-next"
                    ) {
                        withAnimation(stepAnimation) {
                            controller.advance(selectTab: selectTab)
                        }
                    }
                }
            }
            .padding(.horizontal, 16)
            .padding(.top, 12)
            .padding(.bottom, 16)
        }
        .background {
            RoundedRectangle(cornerRadius: SideSeatTheme.heroRadius, style: .continuous)
                .fill(.regularMaterial)
                .overlay {
                    RoundedRectangle(cornerRadius: SideSeatTheme.heroRadius, style: .continuous)
                        .strokeBorder(Color.primary.opacity(0.06), lineWidth: 1)
                }
                .shadow(color: .black.opacity(0.14), radius: 22, y: 10)
        }
        .accessibilityElement(children: .contain)
        .accessibilityAddTraits(.isModal)
    }

    private var progressDots: some View {
        HStack(spacing: 6) {
            ForEach(Array(ProductTutorialController.steps.indices), id: \.self) { index in
                Capsule()
                    .fill(index == controller.stepIndex ? SideSeatTheme.rose : Color.primary.opacity(0.14))
                    .frame(
                        width: index == controller.stepIndex ? 18 : 6,
                        height: 6
                    )
                    .animation(stepAnimation, value: controller.stepIndex)
            }
            Spacer(minLength: 0)
        }
        .accessibilityHidden(true)
    }

    private var stepAnimation: Animation? {
        reduceMotion ? .easeInOut(duration: 0.01) : .spring(response: 0.32, dampingFraction: 0.86)
    }

    private func runEnterAnimation() {
        if reduceMotion {
            controller.markEntered()
            return
        }
        Task { @MainActor in
            try? await Task.sleep(nanoseconds: 40_000_000)
            withAnimation(.spring(response: 0.38, dampingFraction: 0.86)) {
                controller.markEntered()
            }
        }
    }

    private func startPulseIfNeeded() {
        guard !reduceMotion else { return }
        withAnimation(.easeInOut(duration: 0.9).repeatForever(autoreverses: true)) {
            pulse = true
        }
    }
}
