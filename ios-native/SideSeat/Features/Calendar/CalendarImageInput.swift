import Foundation
import ImageIO
import UniformTypeIdentifiers
import Vision

struct CalendarImageRecognition: Sendable {
    let text: String
    let previewData: Data
}

enum CalendarImageInput {
    // Match the existing parse-natural API's UTF-16 string limit.
    static let maximumTextLength = 2_000
    static let maximumImageBytes = 20 * 1_024 * 1_024

    static func appending(_ recognizedText: String, to existingText: String) -> String {
        [existingText, recognizedText]
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
            .joined(separator: "\n\n")
    }

    static func recognize(in data: Data) async throws -> CalendarImageRecognition {
        let worker = Task.detached(priority: .userInitiated) {
            try Task.checkCancellation()
            guard data.count <= maximumImageBytes else { throw CalendarImageInputError.tooLarge }
            guard let source = CGImageSourceCreateWithData(data as CFData, nil),
                  let image = CGImageSourceCreateThumbnailAtIndex(source, 0, [
                    kCGImageSourceCreateThumbnailFromImageAlways: true,
                    kCGImageSourceCreateThumbnailWithTransform: true,
                    kCGImageSourceThumbnailMaxPixelSize: 2_400,
                    kCGImageSourceShouldCacheImmediately: true,
                  ] as CFDictionary)
            else { throw CalendarImageInputError.unreadable }

            let request = VNRecognizeTextRequest()
            request.recognitionLevel = .accurate
            request.usesLanguageCorrection = true
            request.automaticallyDetectsLanguage = true
            request.recognitionLanguages = ["zh-Hans", "en-US", "de-DE"]
            try VNImageRequestHandler(cgImage: image).perform([request])
            try Task.checkCancellation()
            let text = (request.results ?? []).compactMap {
                $0.topCandidates(1).first?.string.trimmingCharacters(in: .whitespacesAndNewlines)
            }.filter { !$0.isEmpty }.joined(separator: "\n")
            guard !text.isEmpty else { throw CalendarImageInputError.noText }

            let preview = NSMutableData()
            guard let destination = CGImageDestinationCreateWithData(preview, UTType.jpeg.identifier as CFString, 1, nil)
            else { throw CalendarImageInputError.unreadable }
            CGImageDestinationAddImage(destination, image, [kCGImageDestinationLossyCompressionQuality: 0.75] as CFDictionary)
            guard CGImageDestinationFinalize(destination) else { throw CalendarImageInputError.unreadable }
            return CalendarImageRecognition(text: text, previewData: preview as Data)
        }
        return try await withTaskCancellationHandler {
            try await worker.value
        } onCancel: {
            worker.cancel()
        }
    }
}

enum CalendarImageInputError: LocalizedError {
    case unreadable, tooLarge, noText

    var errorDescription: String? {
        switch self {
        case .unreadable: AppLocalization.string("The selected image could not be read.")
        case .tooLarge: AppLocalization.string("Choose an image smaller than 20 MB, or crop it first.")
        case .noText: AppLocalization.string("No readable text was found. Try a clearer image or type the event details.")
        }
    }
}
