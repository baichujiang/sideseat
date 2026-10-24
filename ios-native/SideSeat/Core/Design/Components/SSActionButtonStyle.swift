import SwiftUI

/// Quiet utilities, soft secondary actions and solid commits. Selection owns its own boundary.
struct SSActionButtonStyle: ButtonStyle {
    enum Size: Equatable { case regular, compact, toolbar, icon }
    @Environment(\.isEnabled) private var isEnabled
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    var prominent = false
    var softFill = true
    var horizontalPadding: CGFloat = 12
    var cornerRadius: CGFloat = SideSeatTheme.controlRadius
    var size: Size = .regular

    func makeBody(configuration: Configuration) -> some View {
        let destructive = configuration.role == .destructive
        let compact = size == .compact || size == .toolbar
        let radius: CGFloat = size == .compact || size == .icon ? 999 : size == .toolbar ? 12 : cornerRadius
        let shape = RoundedRectangle(cornerRadius: radius, style: .continuous)
        let fill = prominent ? (isEnabled ? SideSeatTheme.ProductAction.fill : SideSeatTheme.Interaction.disabledFill)
            : size == .toolbar || size == .icon || !softFill ? Color.clear
            : destructive ? SideSeatTheme.statusDangerText.opacity(0.08) : SideSeatTheme.fillTertiary
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
            .background(fill, in: shape)
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
}

extension ToolbarContent {
    @ToolbarContentBuilder
    func ssStandaloneAction() -> some ToolbarContent {
        if #available(iOS 26.0, *) { sharedBackgroundVisibility(.hidden) }
        else { self }
    }
}
