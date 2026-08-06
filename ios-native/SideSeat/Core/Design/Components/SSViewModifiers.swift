import SwiftUI

/// Compact, stable navigation chrome for the four top-level tabs.
private struct SSRootNavigationTitle: View {
    let title: LocalizedStringKey
    var subtitle: String? = nil

    var body: some View {
        VStack(spacing: 0) {
            Text(title)
                .font(.headline.weight(.semibold))
                .foregroundStyle(SideSeatTheme.textPrimary)
                .lineLimit(1)

            if let subtitle, !subtitle.isEmpty {
                Text(subtitle)
                    .font(.caption2)
                    .foregroundStyle(SideSeatTheme.textSecondary)
                    .lineLimit(1)
            }
        }
        .frame(maxWidth: 180, minHeight: 34)
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier("root-navigation-title")
    }
}

extension View {
    func ssRootNavigationTitle(
        _ title: LocalizedStringKey,
        subtitle: String? = nil
    ) -> some View {
        navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .principal) {
                    SSRootNavigationTitle(title: title, subtitle: subtitle)
                }
            }
    }

    /// Applies `accessibilityIdentifier` only when non-nil / non-empty.
    @ViewBuilder
    func ssAccessibilityIdentifier(_ id: String?) -> some View {
        if let id, !id.isEmpty {
            accessibilityIdentifier(id)
        } else {
            self
        }
    }
}
