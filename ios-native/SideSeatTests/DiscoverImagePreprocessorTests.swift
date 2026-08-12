import Foundation
import Testing
import UIKit
@testable import SideSeat

@Suite("Discover image preprocessing")
struct DiscoverImagePreprocessorTests {
    @Test("Downsamples a high-resolution photo before upload")
    func downsamplesLargePhoto() throws {
        let source = UIGraphicsImageRenderer(size: CGSize(width: 4_000, height: 3_000)).image { context in
            context.cgContext.setFillColor(UIColor.systemPink.cgColor)
            context.cgContext.fill(CGRect(x: 0, y: 0, width: 4_000, height: 3_000))
        }
        let sourceData = try #require(source.jpegData(compressionQuality: 0.95))
        let id = UUID(uuidString: "11111111-2222-3333-4444-555555555555")!

        let draft = try #require(DiscoverImagePreprocessor.makeDraft(from: sourceData, id: id))
        let result = try #require(UIImage(data: draft.data))

        #expect(max(result.size.width, result.size.height) <= DiscoverImagePreprocessor.maxDimension)
        #expect(result.size.width == 1_600)
        #expect(result.size.height == 1_200)
        #expect(draft.mimeType == "image/jpeg")
        #expect(draft.fileName == "buddy-\(id.uuidString).jpg")
    }

    @Test("Rejects corrupt, empty, and unreasonably large input")
    func rejectsInvalidInput() {
        #expect(DiscoverImagePreprocessor.makeDraft(from: Data()) == nil)
        #expect(DiscoverImagePreprocessor.makeDraft(from: Data([0, 1, 2, 3])) == nil)
        #expect(
            DiscoverImagePreprocessor.makeDraft(
                from: Data(count: DiscoverImagePreprocessor.maxInputBytes + 1)
            ) == nil
        )
    }
}
