import SwiftUI

/// The same membership identity mark on profiles, recommendations, and chats.
struct SSPlusBadge: View {
    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        HStack(spacing: 3) {
            Image(systemName: "sparkle")
            Text(verbatim: "PLUS").tracking(0.5)
        }
        .font(.caption2.weight(.bold))
        .foregroundStyle(colorScheme == .dark
            ? Color(red: 1, green: 0.84, blue: 0.47)
            : Color(red: 0.43, green: 0.28, blue: 0.06))
        .padding(.horizontal, 7)
        .padding(.vertical, 4)
        .background(colorScheme == .dark
            ? Color(red: 0.25, green: 0.20, blue: 0.10)
            : Color(red: 1, green: 0.94, blue: 0.77), in: Capsule())
        .overlay(Capsule().strokeBorder(Color.yellow.opacity(0.25), lineWidth: 0.5))
        .fixedSize()
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(AppLocalization.string("Plus member"))
        .accessibilityIdentifier("plus-member-badge")
    }
}
