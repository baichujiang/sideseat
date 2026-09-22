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

/// Product-content section header used on action-first surfaces such as Together.
/// This intentionally stays Title Case and visually stronger than management headers.
struct SSProductSectionHeader: View {
    let title: String
    var actionTitle: String? = nil
    var accessibilityID: String? = nil
    var actionAccessibilityID: String? = nil
    var onAction: (() -> Void)? = nil

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: SideSeatTheme.spaceMD) {
            Text(title)
                .font(.headline.weight(.semibold))
                .foregroundStyle(SideSeatTheme.textPrimary)
                .fixedSize(horizontal: false, vertical: true)
                .ssAccessibilityIdentifier(accessibilityID)

            Spacer(minLength: SideSeatTheme.spaceSM)

            if let actionTitle, let onAction {
                Button(actionTitle, action: onAction)
                    .font(.subheadline.weight(.medium))
                    .foregroundStyle(SideSeatTheme.accentText)
                    .frame(minWidth: 44, minHeight: 44)
                    .contentShape(Rectangle())
                    .buttonStyle(.plain)
                    .ssAccessibilityIdentifier(actionAccessibilityID)
            }
        }
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

/// Canonical management section for Me / Settings / campus and safety screens.
/// It keeps the existing grouped visual grammar while giving product code a semantic API.
struct SSManagementSection<Content: View>: View {
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
