import Foundation
import ImageIO
import UIKit

enum DiscoverImagePreprocessor {
    static let maxDimension: CGFloat = 1_600
    static let jpegQuality: CGFloat = 0.82
    static let maxInputBytes = 50 * 1_024 * 1_024

    static func makeDraftAsync(
        from data: Data,
        id: UUID = UUID()
    ) async -> NativeDiscoverBuddyImageDraft? {
        await Task.detached(priority: .userInitiated) {
            makeDraft(from: data, id: id)
        }.value
    }

    static func makeDraft(from data: Data, id: UUID = UUID()) -> NativeDiscoverBuddyImageDraft? {
        guard !data.isEmpty, data.count <= maxInputBytes,
              let source = CGImageSourceCreateWithData(data as CFData, nil),
              let image = CGImageSourceCreateThumbnailAtIndex(
                  source,
                  0,
                  [
                      kCGImageSourceCreateThumbnailFromImageAlways: true,
                      kCGImageSourceCreateThumbnailWithTransform: true,
                      kCGImageSourceShouldCacheImmediately: true,
                      kCGImageSourceThumbnailMaxPixelSize: Int(maxDimension),
                  ] as CFDictionary
              )
        else { return nil }

        let normalized = UIImage(cgImage: image)
        guard let jpegData = normalized.jpegData(compressionQuality: jpegQuality) else { return nil }
        return NativeDiscoverBuddyImageDraft(
            id: id,
            data: jpegData,
            mimeType: "image/jpeg",
            fileName: "buddy-\(id.uuidString).jpg"
        )
    }
}
