import SwiftUI

/// Primary CTA — brand gradient for Auth; adaptive ink/chalk for product actions.
struct SSPrimaryButton: View {
    @Environment(\.isEnabled) private var isEnabled
    enum Chrome {
        /// Continuous rounded rect (`controlRadius`) — Auth forms.
        case rounded
        /// Capsule — Tutorial / compact toolbars.
        case capsule
    }

    let title: String
    var isLoading: Bool = false
    var fill: SideSeatTheme.ButtonFill = .brand
    var chrome: Chrome = .rounded
    var height: CGFloat = 50
    var accessibilityID: String? = nil
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: SideSeatTheme.spaceSM) {
                if isLoading {
                    ProgressView()
                        .tint(isEnabled ? fill.foreground : SideSeatTheme.textPrimary)
                } else {
                    Text(title)
                        .font(.body.weight(.semibold))
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            // Content-sized CTAs (empty states) must keep inset; full-width forms stay centered.
            .padding(.horizontal, SideSeatTheme.spaceXL)
            .frame(maxWidth: .infinity)
            .frame(minHeight: height)
            .contentShape(Rectangle())
        }
        .buttonStyle(SSPrimaryButtonStyle(fill: fill, chrome: chrome))
        .ssAccessibilityIdentifier(accessibilityID)
    }
}

private struct SSPrimaryButtonStyle: ButtonStyle {
    @Environment(\.isEnabled) private var isEnabled
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    let fill: SideSeatTheme.ButtonFill
    let chrome: SSPrimaryButton.Chrome

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .foregroundStyle(foreground)
            .background(background(isPressed: configuration.isPressed))
            .opacity(configuration.isPressed ? SideSeatTheme.Interaction.pressedOpacity : 1)
            .scaleEffect(configuration.isPressed && !reduceMotion ? SideSeatTheme.Interaction.pressedScale : 1)
            .animation(
                reduceMotion ? nil : .easeOut(duration: SideSeatTheme.Interaction.pressDuration),
                value: configuration.isPressed
            )
    }

    private var foreground: Color {
        guard isEnabled else { return SideSeatTheme.textPrimary }
        return fill.foreground
    }

    @ViewBuilder
    private func background(isPressed: Bool) -> some View {
        let style = isEnabled ? fill.enabledStyle : fill.disabledStyle
        let shadowColor = isEnabled && fill == .brand
            ? SideSeatTheme.magenta.opacity(0.28)
            : Color.clear
        let radius: CGFloat = isPressed ? 4 : (fill == .brand ? 10 : 0)
        let y: CGFloat = isPressed ? 2 : (fill == .brand ? 5 : 0)

        switch chrome {
        case .rounded:
            RoundedRectangle(cornerRadius: SideSeatTheme.controlRadius, style: .continuous)
                .fill(style)
                .shadow(color: shadowColor, radius: radius, y: y)
        case .capsule:
            Capsule(style: .continuous)
                .fill(style)
                .shadow(color: shadowColor, radius: isPressed ? 4 : 8, y: isPressed ? 2 : 3)
        }
    }
}
