import SwiftUI

/// Hub / settings-style row: tinted icon block + title + subtitle + chevron.
struct SSListRow: View {
    let title: String
    let subtitle: String
    let systemImage: String
    let tint: Color
    var showDivider: Bool = true
    var accessibilityID: String? = nil
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Label(
                title: title,
                subtitle: subtitle,
                systemImage: systemImage,
                tint: tint,
                showDivider: showDivider
            )
        }
        .buttonStyle(.plain)
        .ssAccessibilityIdentifier(accessibilityID)
    }
}

extension SSListRow {
    /// Visual chrome without the outer `Button` (for custom wrappers).
    struct Label: View {
        let title: String
        let subtitle: String
        let systemImage: String
        let tint: Color
        var showDivider: Bool = true

        var body: some View {
            VStack(spacing: 0) {
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
                    .frame(width: 40, height: 40)

                    VStack(alignment: .leading, spacing: 2) {
                        Text(title)
                            .font(.body.weight(.semibold))
                            .foregroundStyle(SideSeatTheme.textPrimary)
                        Text(subtitle)
                            .font(SideSeatTheme.Text.footnote)
                            .foregroundStyle(SideSeatTheme.textSecondary)
                            .lineLimit(2)
                    }

                    Spacer(minLength: SideSeatTheme.spaceSM)

                    Image(systemName: "chevron.right")
                        .font(.footnote.weight(.semibold))
                        .foregroundStyle(.tertiary)
                }
                .padding(.horizontal, 14)
                .padding(.vertical, 13)

                if showDivider {
                    Divider()
                        .padding(.leading, 66)
                }
            }
            .contentShape(Rectangle())
        }
    }
}
