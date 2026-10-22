import SwiftUI

/// Default chrome for standalone actions. Content cards keep their own button style.
struct SSActionButtonStyle: ButtonStyle {
    enum Size: Equatable { case regular, compact, toolbar, icon }
    @Environment(\.isEnabled) private var isEnabled
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    var prominent = false
    var horizontalPadding: CGFloat = 12
    var cornerRadius: CGFloat = SideSeatTheme.controlRadius
    var size: Size = .regular

    func makeBody(configuration: Configuration) -> some View {
        let destructive = configuration.role == .destructive
        let compact = size == .compact || size == .toolbar
        let shape = RoundedRectangle(cornerRadius: compact ? 10 : cornerRadius, style: .continuous)
        configuration.label
            .font(compact ? .callout.weight(.semibold) : .subheadline.weight(prominent ? .semibold : .medium))
            .multilineTextAlignment(.center)
            .fixedSize(horizontal: false, vertical: true)
            .dynamicTypeSize(...(compact || size == .icon ? DynamicTypeSize.xxxLarge : DynamicTypeSize.accessibility1))
            .foregroundStyle(destructive ? SideSeatTheme.statusDangerText : prominent && isEnabled ? SideSeatTheme.ProductAction.foreground : SideSeatTheme.textPrimary)
            .opacity(isEnabled ? 1 : 0.46)
            .padding(.horizontal, horizontalPadding)
            .padding(.vertical, size == .icon ? 0 : compact ? 6 : 8)
            .frame(minWidth: size == .icon ? 44 : compact ? 32 : 44, minHeight: compact ? 36 : 44)
            .background(prominent && isEnabled ? SideSeatTheme.ProductAction.fill : SideSeatTheme.surface, in: shape)
            .overlay(shape.strokeBorder(destructive ? SideSeatTheme.statusDangerText : SideSeatTheme.actionBorder, lineWidth: 1))
            .frame(minWidth: 44, minHeight: 44)
            .contentShape(Rectangle())
            .opacity(configuration.isPressed ? SideSeatTheme.Interaction.pressedOpacity : 1)
            .scaleEffect(configuration.isPressed && !reduceMotion ? SideSeatTheme.Interaction.pressedScale : 1)
            .animation(reduceMotion ? nil : .easeOut(duration: SideSeatTheme.Interaction.pressDuration), value: configuration.isPressed)
    }
}

extension View {
    func ssToolbarAction() -> some View {
        labelStyle(.iconOnly)
            .buttonStyle(SSActionButtonStyle(horizontalPadding: 12, size: .toolbar))
    }

    /// Shared boundary for controls that already own their padding and fill.
    func ssActionOutline(cornerRadius: CGFloat = SideSeatTheme.controlRadius, destructive: Bool = false) -> some View {
        overlay {
            RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                .strokeBorder(destructive ? SideSeatTheme.statusDangerText : SideSeatTheme.actionBorder, lineWidth: 1)
                .allowsHitTesting(false)
        }
    }
}

extension ToolbarContent {
    @ToolbarContentBuilder
    func ssStandaloneAction() -> some ToolbarContent {
        if #available(iOS 26.0, *) { sharedBackgroundVisibility(.hidden) }
        else { self }
    }
}
