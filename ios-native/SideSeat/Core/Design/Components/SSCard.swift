import SwiftUI

/// Content card on brand or light product surfaces. Uses `SideSeatCardBackground`.
struct SSCard<Content: View>: View {
    var padding: CGFloat = 20
    var cornerRadius: CGFloat = SideSeatTheme.cardRadius
    @ViewBuilder var content: () -> Content

    var body: some View {
        content()
            .padding(padding)
            .background { SideSeatCardBackground(cornerRadius: cornerRadius) }
    }
}
