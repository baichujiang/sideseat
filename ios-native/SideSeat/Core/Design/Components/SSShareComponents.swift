import CoreImage
import SwiftUI
import UIKit

struct SSSharePayload: Identifiable {
    let id = UUID()
    let items: [Any]
}

struct SSActivityView: UIViewControllerRepresentable {
    let items: [Any]

    func makeUIViewController(context: Context) -> UIActivityViewController {
        UIActivityViewController(activityItems: items, applicationActivities: nil)
    }

    func updateUIViewController(_ uiViewController: UIActivityViewController, context: Context) {}
}

struct SSShareActionBar: View {
    let caption: String
    let accessibilityPrefix: String
    let makeImage: @MainActor () -> UIImage?

    @State private var payload: SSSharePayload?
    @State private var isPreparing = false
    @State private var didCopy = false

    var body: some View {
        VStack(spacing: 0) {
            Divider()
            HStack(spacing: SideSeatTheme.spaceMD) {
                Button {
                    UIPasteboard.general.string = caption
                    didCopy = true
                } label: {
                    Image(systemName: didCopy ? "checkmark" : "doc.on.doc")
                        .font(.body.weight(.semibold))
                        .frame(width: 46, height: 46)
                }
                .buttonStyle(.bordered)
                .accessibilityLabel(didCopy ? "Copied" : "Copy caption")
                .accessibilityIdentifier("\(accessibilityPrefix)-copy")

                Button {
                    prepareShare()
                } label: {
                    HStack(spacing: SideSeatTheme.spaceSM) {
                        if isPreparing {
                            ProgressView()
                                .tint(SideSeatTheme.onAccent)
                        } else {
                            Image(systemName: "square.and.arrow.up")
                            Text("Share poster")
                        }
                    }
                    .font(.body.weight(.semibold))
                    .foregroundStyle(SideSeatTheme.onAccent)
                    .frame(maxWidth: .infinity)
                    .frame(height: 48)
                    .background(
                        SideSeatTheme.accent,
                        in: RoundedRectangle(cornerRadius: SideSeatTheme.controlRadius, style: .continuous)
                    )
                }
                .buttonStyle(SSPressButtonStyle())
                .disabled(isPreparing)
                .accessibilityIdentifier("\(accessibilityPrefix)-system")
            }
            .padding(.horizontal, SideSeatTheme.spaceLG)
            .padding(.vertical, SideSeatTheme.spaceMD)
        }
        .background(.regularMaterial)
        .sheet(item: $payload) { payload in
            SSActivityView(items: payload.items)
        }
        .sensoryFeedback(.success, trigger: didCopy)
    }

    @MainActor
    private func prepareShare() {
        guard !isPreparing else { return }
        isPreparing = true
        defer { isPreparing = false }

        if let image = makeImage() {
            // Image-only payload keeps visual-first share extensions, including Xiaohongshu,
            // eligible. The caption is copied separately because third-party autofill is limited.
            payload = SSSharePayload(items: [image])
        } else {
            payload = SSSharePayload(items: [caption])
        }
    }
}

struct SSShareMark: View {
    var body: some View {
        HStack(spacing: 7) {
            Image(systemName: "person.2.fill")
                .font(.system(size: 11, weight: .bold))
                .foregroundStyle(SideSeatTheme.onAccent)
                .frame(width: 26, height: 26)
                .background(SideSeatTheme.rose, in: RoundedRectangle(cornerRadius: 8, style: .continuous))
            Text("SideSeat")
                .font(.system(size: 16, weight: .bold, design: .rounded))
                .foregroundStyle(Color(red: 0.11, green: 0.10, blue: 0.14))
        }
    }
}

struct SSQRCode: View {
    let url: URL

    var body: some View {
        if let image = qrCodeImage {
            Image(uiImage: image)
                .resizable()
                .interpolation(.none)
                .scaledToFit()
        } else {
            Image(systemName: "qrcode")
                .resizable()
                .scaledToFit()
        }
    }

    private var qrCodeImage: UIImage? {
        guard let filter = CIFilter(name: "CIQRCodeGenerator") else { return nil }
        filter.setValue(Data(url.absoluteString.utf8), forKey: "inputMessage")
        filter.setValue("M", forKey: "inputCorrectionLevel")
        guard let output = filter.outputImage else { return nil }
        let scale = 180 / output.extent.width
        let transformed = output.transformed(by: CGAffineTransform(scaleX: scale, y: scale))
        let context = CIContext(options: [.useSoftwareRenderer: false])
        guard let cgImage = context.createCGImage(transformed, from: transformed.extent) else { return nil }
        return UIImage(cgImage: cgImage)
    }
}
