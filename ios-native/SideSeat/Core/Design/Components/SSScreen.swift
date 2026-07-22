import SwiftUI

/// Screen chrome: brand atmosphere vs product system background.
struct SSScreen<Content: View>: View {
    enum Surface {
        /// Login / Signup / Forgot — softWash + brand orbs.
        case brand
        /// Main tabs — system background (non-grouped).
        case product
        /// Settings-style grouped lists.
        case productGrouped
    }

    var surface: Surface = .product
    @ViewBuilder var content: () -> Content

    var body: some View {
        ZStack {
            background
            content()
        }
    }

    @ViewBuilder
    private var background: some View {
        switch surface {
        case .brand:
            SSBrandAtmosphere()
        case .product:
            SideSeatTheme.bg.ignoresSafeArea()
        case .productGrouped:
            SideSeatTheme.bgGrouped.ignoresSafeArea()
        }
    }
}

/// Brand-surface atmosphere (softWash + soft orbs). Auth only / cold start.
struct SSBrandAtmosphere: View {
    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        ZStack {
            SideSeatTheme.softWash(for: colorScheme)
                .ignoresSafeArea()

            Circle()
                .fill(SideSeatTheme.peach.opacity(colorScheme == .dark ? 0.22 : 0.42))
                .frame(width: 300, height: 300)
                .blur(radius: 48)
                .offset(x: 140, y: -230)

            Circle()
                .fill(SideSeatTheme.magenta.opacity(colorScheme == .dark ? 0.20 : 0.18))
                .frame(width: 240, height: 240)
                .blur(radius: 42)
                .offset(x: -150, y: 270)

            Circle()
                .fill(SideSeatTheme.orchid.opacity(colorScheme == .dark ? 0.16 : 0.14))
                .frame(width: 180, height: 180)
                .blur(radius: 36)
                .offset(x: 90, y: 180)
        }
    }
}
