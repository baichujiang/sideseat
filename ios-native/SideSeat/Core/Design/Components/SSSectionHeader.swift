import SwiftUI

/// Uppercase caption used above Me / Settings / Discover grouped blocks.
struct SSSectionHeader: View {
    let title: String

    var body: some View {
        Text(title)
            .font(.caption.weight(.bold))
            .tracking(0.6)
            .textCase(.uppercase)
            .foregroundStyle(SideSeatTheme.textSecondary)
            .padding(.horizontal, SideSeatTheme.spaceXS)
    }
}

/// Grouped block: section header + inset surface for hub rows.
struct SSGroupedSection<Content: View>: View {
    let title: String
    var cornerRadius: CGFloat = 18
    @ViewBuilder var content: () -> Content

    var body: some View {
        VStack(alignment: .leading, spacing: SideSeatTheme.spaceSM) {
            SSSectionHeader(title: title)

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
