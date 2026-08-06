import SwiftUI

/// Text or soft secondary action (links, cancel-adjacent CTAs).
struct SSSecondaryButton: View {
    enum Kind {
        /// Rose text link — Auth “Forgot password?”, “Create an account”.
        case accentText
        /// Soft fill capsule — Tutorial Back, etc.
        case softFill
    }

    let title: String
    var kind: Kind = .accentText
    var fontWeight: Font.Weight = .medium
    var expands: Bool = true
    var accessibilityID: String? = nil
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Text(title)
                .font(.subheadline.weight(fontWeight))
                .lineLimit(1)
                .padding(.horizontal, kind == .softFill ? SideSeatTheme.spaceLG : 0)
                .frame(maxWidth: expands ? .infinity : nil)
                .frame(minHeight: kind == .softFill ? 44 : nil)
                .contentShape(Rectangle())
        }
        .buttonStyle(SSSecondaryButtonStyle(kind: kind))
        .ssAccessibilityIdentifier(accessibilityID)
    }
}

private struct SSSecondaryButtonStyle: ButtonStyle {
    let kind: SSSecondaryButton.Kind

    func makeBody(configuration: Configuration) -> some View {
        switch kind {
        case .accentText:
            configuration.label
                .foregroundStyle(SideSeatTheme.rose)
                .opacity(configuration.isPressed ? SideSeatTheme.Interaction.pressedOpacity : 1)
        case .softFill:
            configuration.label
                .foregroundStyle(SideSeatTheme.textPrimary)
                .background(
                    Capsule(style: .continuous)
                        .fill(Color.primary.opacity(configuration.isPressed ? 0.1 : 0.06))
                )
                .overlay {
                    Capsule(style: .continuous)
                        .strokeBorder(Color.primary.opacity(0.1), lineWidth: 1)
                }
                .opacity(configuration.isPressed ? SideSeatTheme.Interaction.pressedOpacity : 1)
                .scaleEffect(configuration.isPressed ? SideSeatTheme.Interaction.pressedScale : 1)
        }
    }
}
