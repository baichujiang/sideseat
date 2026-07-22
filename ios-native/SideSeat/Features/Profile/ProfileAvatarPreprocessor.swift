import Foundation
import UIKit

enum ProfileAvatarPreprocessor {
    static let maxDimension: CGFloat = 1_024
    static let jpegQuality: CGFloat = 0.86

    static func makeDraft(from data: Data, id: UUID = UUID()) -> NativeProfileAvatarDraft? {
        guard let source = UIImage(data: data) else { return nil }
        let normalized = source.sideseatProfileAvatarScaledToFit(maxDimension: maxDimension)
        guard let jpegData = normalized.jpegData(compressionQuality: jpegQuality) else { return nil }
        return NativeProfileAvatarDraft(
            id: id,
            data: jpegData,
            mimeType: "image/jpeg",
            fileName: "avatar-\(id.uuidString).jpg"
        )
    }
}

private extension UIImage {
    func sideseatProfileAvatarScaledToFit(maxDimension: CGFloat) -> UIImage {
        let longestSide = max(size.width, size.height)
        let scale = min(1, maxDimension / max(longestSide, 1))
        let targetSize = CGSize(width: size.width * scale, height: size.height * scale)
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        format.opaque = false
        return UIGraphicsImageRenderer(size: targetSize, format: format).image { _ in
            draw(in: CGRect(origin: .zero, size: targetSize))
        }
    }
}
