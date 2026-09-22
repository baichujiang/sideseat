import SwiftUI

/// Kept for reference during Stage 5 rollout; production navigation uses `DirectChatView`.
struct DirectChatPlaceholderView: View {
    let connectionID: String

    var body: some View {
        DirectChatView(connectionID: connectionID)
    }
}
