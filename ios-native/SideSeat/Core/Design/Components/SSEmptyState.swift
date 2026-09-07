import SwiftUI

/// Shared empty state: icon + copy + optional product-surface CTA.
struct SSEmptyState: View {
    let title: LocalizedStringKey
    var systemImage: String = "tray"
    var description: LocalizedStringKey? = nil
    /// Product-surface solid accent CTA (optional).
    var actionTitle: String? = nil
    var actionAccessibilityID: String? = nil
    var action: (() -> Void)? = nil

    var body: some View {
        ContentUnavailableView {
            Label(title, systemImage: systemImage)
        } description: {
            if let description {
                Text(description)
                    .foregroundStyle(SideSeatTheme.textSecondaryStrong)
            }
        } actions: {
            if let actionTitle, let action {
                SSPrimaryButton(
                    title: actionTitle,
                    fill: .product,
                    height: 48,
                    accessibilityID: actionAccessibilityID,
                    action: action
                )
                // Intrinsic width + label padding; avoid a skinny pill around short CJK labels.
                .frame(minWidth: 168, maxWidth: 280)
            }
        }
    }
}
