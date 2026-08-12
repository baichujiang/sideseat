import SwiftUI

/// Uppercase caption used above Me / Settings / Discover grouped blocks.
struct SSSectionHeader: View {
    let title: String
    var accessibilityID: String? = nil

    var body: some View {
        Text(title)
            .font(.caption.weight(.bold))
            .textCase(.uppercase)
            .foregroundStyle(SideSeatTheme.textPrimary)
            .fixedSize(horizontal: false, vertical: true)
            .padding(.horizontal, SideSeatTheme.spaceXS)
            .ssAccessibilityIdentifier(accessibilityID)
    }
}

/// Grouped block: section header + inset surface for hub rows.
struct SSGroupedSection<Content: View>: View {
    let title: String
    var cornerRadius: CGFloat = 18
    var accessibilityID: String? = nil
    @ViewBuilder var content: () -> Content

    var body: some View {
        VStack(alignment: .leading, spacing: SideSeatTheme.spaceSM) {
            SSSectionHeader(title: title, accessibilityID: accessibilityID)

            VStack(spacing: 0) {
                content()
            }
            .background(
                RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                    .fill(SideSeatTheme.surface)
            )
            .overlay {
                RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                    .strokeBorder(Color.primary.opacity(0.04), lineWidth: 1)
            }
        }
    }
}
