import SwiftUI

struct ProductTutorialOverlay: View {
    @Bindable var controller: ProductTutorialController
    let session: SessionStore
    let selectTab: (AppTab) -> Void

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    var body: some View {
        GeometryReader { geometry in
            let tabBarLift: CGFloat = 56 + max(geometry.safeAreaInsets.bottom, 8)
            let availableHeight = geometry.size.height - geometry.safeAreaInsets.top - tabBarLift - 16

            coachCard
                .frame(maxHeight: availableHeight, alignment: .bottom)
                .padding(.horizontal, 14)
                .padding(.bottom, tabBarLift)
                .frame(maxWidth: 420)
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottom)
                .opacity(controller.hasEntered ? 1 : 0)
                .offset(y: controller.hasEntered ? 0 : 14)
                .allowsHitTesting(controller.hasEntered)
        }
        .accessibilityIdentifier("product-tutorial")
        .onAppear {
            selectTab(controller.currentStep.tab)
            runEnterAnimation()
        }
    }

    private var coachCard: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 16) {
                Text(
                    String(
                        format: AppLocalization.string("%lld / %lld"),
                        Int64(controller.stepIndex + 1),
                        Int64(ProductTutorialController.steps.count)
                    )
                )
                .font(.caption.weight(.semibold))
                .foregroundStyle(.secondary)
                .fixedSize()
                .accessibilityIdentifier("product-tutorial-progress")

                Spacer(minLength: 0)

                SSSecondaryButton(
                    title: AppLocalization.string("Close"),
                    expands: false,
                    accessibilityID: "product-tutorial-skip"
                ) {
                    Task { await controller.dismiss(using: session, selectTab: selectTab) }
                }
            }
            .fixedSize(horizontal: false, vertical: true)

            // Keep navigation in place when the explanation needs more than one screen.
            ViewThatFits(in: .vertical) {
                stepDescription.fixedSize(horizontal: false, vertical: true)
                ScrollView {
                    stepDescription
                }
                .accessibilityIdentifier("product-tutorial-content")
            }
            .id(controller.currentStep.id)

            HStack(spacing: 10) {
                if controller.stepIndex > 0 {
                    SSSecondaryButton(
                        title: AppLocalization.string("Back"),
                        fontWeight: .semibold,
                        accessibilityID: "product-tutorial-back"
                    ) {
                        controller.goBack(selectTab: selectTab)
                    }
                }

                SSPrimaryButton(
                    title: controller.isLastStep
                        ? AppLocalization.string("Done")
                        : AppLocalization.string("Next"),
                    fill: .product,
                    height: 44,
                    accessibilityID: controller.isLastStep
                        ? "product-tutorial-done"
                        : "product-tutorial-next"
                ) {
                    if controller.isLastStep {
                        Task { await controller.dismiss(using: session, selectTab: selectTab) }
                    } else {
                        controller.advance(selectTab: selectTab)
                    }
                }
            }
            .fixedSize(horizontal: false, vertical: true)
        }
        .padding(16)
        .background {
            RoundedRectangle(cornerRadius: SideSeatTheme.heroRadius, style: .continuous)
                .fill(.regularMaterial)
                .overlay {
                    RoundedRectangle(cornerRadius: SideSeatTheme.heroRadius, style: .continuous)
                        .strokeBorder(Color.primary.opacity(0.06), lineWidth: 1)
                }
                .shadow(color: .black.opacity(0.1), radius: 12, y: 4)
        }
        .accessibilityElement(children: .contain)
        .accessibilityAddTraits(.isModal)
    }

    private var stepDescription: some View {
        HStack(alignment: .top, spacing: 12) {
            if !dynamicTypeSize.isAccessibilitySize {
                Image(systemName: controller.currentStep.systemImage)
                    .font(.body.weight(.semibold))
                    .dynamicTypeSize(...DynamicTypeSize.xxxLarge)
                    .frame(width: 40, height: 40)
                    .background(Color.primary.opacity(0.06), in: RoundedRectangle(cornerRadius: SideSeatTheme.controlRadius))
                    .accessibilityHidden(true)
            }

            VStack(alignment: .leading, spacing: 8) {
                Text(controller.currentStep.title)
                    .font(.title3.weight(.semibold))
                    .foregroundStyle(.primary)
                    .accessibilityIdentifier("product-tutorial-title")

                Text(controller.currentStep.body)
                    .font(.subheadline)
                    .foregroundStyle(.primary)
                    .accessibilityIdentifier("product-tutorial-body")

                Text(controller.currentStep.hint)
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                    .accessibilityIdentifier("product-tutorial-hint")
            }
            .fixedSize(horizontal: false, vertical: true)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    private func runEnterAnimation() {
        if reduceMotion {
            controller.markEntered()
        } else {
            withAnimation(.easeOut(duration: 0.2)) {
                controller.markEntered()
            }
        }
    }
}
