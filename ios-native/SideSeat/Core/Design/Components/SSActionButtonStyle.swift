import SwiftUI

/// Default chrome for standalone actions. Content cards keep their own button style.
struct SSActionButtonStyle: ButtonStyle {
    @Environment(\.isEnabled) private var isEnabled
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    var prominent = false
    var horizontalPadding: CGFloat = SideSeatTheme.spaceMD

    var cornerRadius: CGFloat = SideSeatTheme.controlRadius
    var compactOutline = false

    func makeBody(configuration: Configuration) -> some View {
        let destructive = configuration.role == .destructive
        configuration.label
            .font(.subheadline.weight(prominent ? .semibold : .medium))
            .foregroundStyle(destructive ? SideSeatTheme.statusDangerText : prominent && isEnabled ? SideSeatTheme.ProductAction.foreground : SideSeatTheme.textPrimary)
            .opacity(isEnabled ? 1 : 0.46)
            .padding(.horizontal, horizontalPadding)
            .frame(minWidth: 44, minHeight: 44)
            .background(prominent && isEnabled ? SideSeatTheme.ProductAction.fill : Color.clear,
                        in: RoundedRectangle(cornerRadius: cornerRadius))
            .ssActionOutline(cornerRadius: cornerRadius, destructive: destructive, verticalInset: compactOutline ? 6 : 0)
            .contentShape(RoundedRectangle(cornerRadius: cornerRadius))
            .opacity(configuration.isPressed ? SideSeatTheme.Interaction.pressedOpacity : 1)
            .scaleEffect(configuration.isPressed && !reduceMotion ? SideSeatTheme.Interaction.pressedScale : 1)
            .animation(reduceMotion ? nil : .easeOut(duration: SideSeatTheme.Interaction.pressDuration), value: configuration.isPressed)
    }
}

extension View {
    /// Shared boundary for controls that already own their padding and fill.
    func ssActionOutline(cornerRadius: CGFloat = SideSeatTheme.controlRadius, destructive: Bool = false, verticalInset: CGFloat = 0) -> some View {
        overlay {
            RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                .strokeBorder(destructive ? SideSeatTheme.statusDangerText : SideSeatTheme.actionBorder, lineWidth: 1)
                .padding(.vertical, verticalInset)
                .allowsHitTesting(false)
        }
    }
}
