import SwiftUI

extension View {
    func ssRootNavigationTitle(_ title: LocalizedStringKey) -> some View {
        navigationTitle(title)
            .navigationBarTitleDisplayMode(.inline)
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
