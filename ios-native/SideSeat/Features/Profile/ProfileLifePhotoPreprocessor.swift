import Foundation
import UIKit

enum ProfileLifePhotoPreprocessor {
    static let maxDimension: CGFloat = 1_600
    static let jpegQuality: CGFloat = 0.82

    static func makeDraft(from data: Data, id: UUID = UUID()) -> NativeProfileLifePhotoDraft? {
        guard let source = UIImage(data: data) else { return nil }
        let normalized = source.sideseatLifePhotoScaledToFit(maxDimension: maxDimension)
        guard let jpegData = normalized.jpegData(compressionQuality: jpegQuality) else { return nil }
        return NativeProfileLifePhotoDraft(
            id: id,
            data: jpegData,
            mimeType: "image/jpeg",
            fileName: "life-photo-\(id.uuidString).jpg"
        )
    }
}

private extension UIImage {
    func sideseatLifePhotoScaledToFit(maxDimension: CGFloat) -> UIImage {
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
