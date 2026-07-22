import SwiftUI

extension View {
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
