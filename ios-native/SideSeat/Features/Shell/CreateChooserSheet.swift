import SwiftUI

/// Bottom sheet for the center Create tab — product-surface options with press feedback.
struct CreateChooserSheet: View {
    let onChoose: (CreateDestination) -> Void
    let onCancel: () -> Void

    @State private var appeared = false

    var body: some View {
        VStack(spacing: 0) {
            Capsule()
                .fill(SideSeatTheme.fillTertiary)
                .frame(width: 36, height: 5)
                .padding(.top, SideSeatTheme.spaceSM)
                .padding(.bottom, SideSeatTheme.spaceMD)
                .accessibilityHidden(true)

            Text("Create")
                .font(SideSeatTheme.Text.titleSmall)
                .foregroundStyle(SideSeatTheme.textPrimary)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, SideSeatTheme.screenHorizontal)

            Text("Share a plan and find the right people.")
                .font(SideSeatTheme.Text.footnote)
                .foregroundStyle(SideSeatTheme.textSecondary)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, SideSeatTheme.screenHorizontal)
                .padding(.top, 4)
                .padding(.bottom, SideSeatTheme.spaceLG)

            VStack(spacing: SideSeatTheme.spaceSM) {
                CreateChooserOption(
                    title: "Create plan",
                    subtitle: "Add a time and place now, or decide them after you connect.",
                    systemImage: "calendar.badge.plus",
                    tint: SideSeatTheme.HubTint.contacts,
                    accessibilityID: "create-plan"
                ) {
                    onChoose(.plan)
                }
            }
            .padding(.horizontal, SideSeatTheme.screenHorizontal)
            .opacity(appeared ? 1 : 0)
            .offset(y: appeared ? 0 : 10)

            Button("Cancel", action: onCancel)
                .font(.body.weight(.medium))
                .foregroundStyle(SideSeatTheme.textSecondary)
                .frame(maxWidth: .infinity)
                .padding(.vertical, SideSeatTheme.spaceLG)
                .accessibilityIdentifier("create-chooser-cancel")
        }
        .padding(.bottom, SideSeatTheme.spaceSM)
        .background(SideSeatTheme.bg)
        .onAppear {
            withAnimation(.spring(response: 0.38, dampingFraction: 0.86)) {
                appeared = true
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("create-chooser-sheet")
    }
}

private struct CreateChooserOption: View {
    let title: LocalizedStringKey
    let subtitle: LocalizedStringKey
    let systemImage: String
    let tint: Color
    let accessibilityID: String
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: SideSeatTheme.spaceMD) {
                ZStack {
                    Circle()
                        .fill(
                            LinearGradient(
                                colors: [tint.opacity(0.22), tint.opacity(0.10)],
                                startPoint: .topLeading,
                                endPoint: .bottomTrailing
                            )
                        )
                    Image(systemName: systemImage)
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(tint)
                }
                .frame(width: 44, height: 44)

                VStack(alignment: .leading, spacing: 3) {
                    Text(title)
                        .font(.body.weight(.semibold))
                        .foregroundStyle(SideSeatTheme.textPrimary)
                    Text(subtitle)
                        .font(SideSeatTheme.Text.footnote)
                        .foregroundStyle(SideSeatTheme.textSecondary)
                        .fixedSize(horizontal: false, vertical: true)
                }

                Spacer(minLength: SideSeatTheme.spaceSM)

                Image(systemName: "chevron.right")
                    .font(.footnote.weight(.semibold))
                    .foregroundStyle(.tertiary)
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 14)
            .background(
                RoundedRectangle(cornerRadius: SideSeatTheme.controlRadius, style: .continuous)
                    .fill(SideSeatTheme.surface)
            )
            .overlay(
                RoundedRectangle(cornerRadius: SideSeatTheme.controlRadius, style: .continuous)
                    .strokeBorder(Color.primary.opacity(0.06), lineWidth: 1)
            )
            .accessibilityElement(children: .combine)
            .accessibilityIdentifier(accessibilityID)
        }
        .buttonStyle(CreateChooserPressStyle())
        .accessibilityIdentifier(accessibilityID)
        .accessibilityLabel(Text(title))
        .accessibilityAddTraits(.isButton)
    }
}

private struct CreateChooserPressStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .opacity(configuration.isPressed ? SideSeatTheme.Interaction.pressedOpacity : 1)
            .scaleEffect(configuration.isPressed ? SideSeatTheme.Interaction.pressedScale : 1)
            .animation(
                .easeOut(duration: SideSeatTheme.Interaction.pressDuration),
                value: configuration.isPressed
            )
    }
}

#Preview {
    CreateChooserSheet(onChoose: { _ in }, onCancel: {})
}
