import SwiftUI
import UIKit

enum SideSeatAppShareContent {
    static let url = URL(string: "https://www.sideseat.de")!

    static var text: String {
        [
            AppLocalization.string( "Meet international students nearby on SideSeat."),
            AppLocalization.string( "Find buddies, join plans, and meet students from your school."),
            "#SideSeat #留学生社交 #留学生活",
            url.absoluteString,
        ].joined(separator: "\n")
    }
}

struct SideSeatAppSharePreview: View {
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            GeometryReader { proxy in
                ScrollView {
                    VStack(spacing: SideSeatTheme.spaceLG) {
                        SideSeatAppShareCard()
                            .frame(width: 360, height: 480)
                            .scaleEffect(0.78)
                            .frame(width: 281, height: 374)
                            .shadow(color: Color.black.opacity(0.12), radius: 18, y: 8)
                            .accessibilityIdentifier("sideseat-app-share-card")

                        Text("SideSeat invite card")
                            .font(.headline)
                    }
                    .frame(maxWidth: .infinity)
                    .frame(minHeight: proxy.size.height)
                    .padding(.horizontal, SideSeatTheme.screenHorizontal)
                    .padding(.vertical, SideSeatTheme.spaceXL)
                }
            }
            .background(SideSeatTheme.bgGrouped)
            .navigationTitle("Share SideSeat")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Done") { dismiss() }
                        .accessibilityIdentifier("sideseat-app-share-done")
                }
            }
            .safeAreaInset(edge: .bottom, spacing: 0) {
                SSShareActionBar(
                    caption: SideSeatAppShareContent.text,
                    accessibilityPrefix: "sideseat-app-share",
                    makeImage: SideSeatAppShareRenderer.image
                )
            }
        }
        .presentationDetents([.large])
        .accessibilityIdentifier("sideseat-app-share-preview")
    }
}

@MainActor
enum SideSeatAppShareRenderer {
    static func image() -> UIImage? {
        let card = SideSeatAppShareCard()
            .frame(width: 360, height: 480)
            .environment(\.colorScheme, .light)
        let renderer = ImageRenderer(content: card)
        renderer.scale = 3
        renderer.isOpaque = true
        return renderer.uiImage
    }
}

private struct SideSeatAppShareCard: View {
    var body: some View {
        ZStack {
            Color.white

            VStack(alignment: .leading, spacing: 0) {
                SSShareMark()

                Text("International students, go together")
                    .font(.system(size: 32, weight: .bold, design: .rounded))
                    .foregroundStyle(Color(red: 0.11, green: 0.10, blue: 0.14))
                    .lineLimit(3)
                    .minimumScaleFactor(0.78)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.top, 34)

                Text("Find buddies, join plans, and meet students from your school.")
                    .font(.system(size: 15))
                    .foregroundStyle(Color(red: 0.34, green: 0.33, blue: 0.39))
                    .lineLimit(3)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.top, 12)

                VStack(alignment: .leading, spacing: 12) {
                    feature("person.2.fill", "Find buddies", Color(red: 0.18, green: 0.55, blue: 0.86))
                    feature("calendar", "Join plans", Color(red: 0.20, green: 0.62, blue: 0.42))
                    feature("checkmark.shield.fill", "Verified students", SideSeatTheme.rose)
                }
                .padding(.top, 30)

                Spacer(minLength: 20)

                HStack(alignment: .bottom, spacing: 14) {
                    VStack(alignment: .leading, spacing: 5) {
                        Text("Scan to join SideSeat")
                            .font(.system(size: 13, weight: .bold))
                            .foregroundStyle(Color(red: 0.11, green: 0.10, blue: 0.14))
                        Text("sideseat.de")
                            .font(.system(size: 11, weight: .medium))
                            .foregroundStyle(Color(red: 0.40, green: 0.39, blue: 0.44))
                    }
                    Spacer(minLength: 0)
                    SSQRCode(url: SideSeatAppShareContent.url)
                        .frame(width: 66, height: 66)
                }
            }
            .padding(26)
        }
        .frame(width: 360, height: 480)
        .clipped()
    }

    private func feature(_ systemImage: String, _ title: LocalizedStringKey, _ color: Color) -> some View {
        HStack(spacing: 10) {
            Image(systemName: systemImage)
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(color)
                .frame(width: 28, height: 28)
                .background(color.opacity(0.11), in: RoundedRectangle(cornerRadius: 7, style: .continuous))
            Text(title)
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(Color(red: 0.18, green: 0.17, blue: 0.22))
        }
    }
}
