import Foundation
import Observation
import Vision

struct CourseScreenshotMatch: Identifiable, Sendable {
    let course: NativeCourseSummary
    let evidence: String
    let confidence: Double

    var id: String { course.id }

    var confidenceLabel: LocalizedStringResource {
        if confidence >= 0.9 { return "Exact match" }
        if confidence >= 0.65 { return "Likely match" }
        return "Review match"
    }
}

enum CourseScreenshotText {
    private static let codePattern = #"\b[A-ZÄÖÜ]{1,6}[\s-]?\d{3,8}[A-Z]?\b"#
    private static let timePattern = #"\b\d{1,2}[:.]\d{2}\b"#
    private static let weekdayPattern = #"(?i)\b(mon(day)?|tue(sday)?|wed(nesday)?|thu(rsday)?|fri(day)?|sat(urday)?|sun(day)?|mo|di|mi|do|fr|sa|so|montag|dienstag|mittwoch|donnerstag|freitag|samstag|sonntag)\b"#

    static func searchTerms(from lines: [String], limit: Int = 16) -> [String] {
        var terms: [String] = []
        var seen: Set<String> = []

        func append(_ raw: String) {
            let term = raw
                .trimmingCharacters(in: .whitespacesAndNewlines.union(.punctuationCharacters))
                .replacingOccurrences(of: #"\s+"#, with: " ", options: .regularExpression)
            let key = normalized(term)
            guard term.count >= 3, key.count >= 3, seen.insert(key).inserted else { return }
            terms.append(term)
        }

        for line in lines.prefix(40) {
            for code in matches(pattern: codePattern, in: line) {
                append(code.replacingOccurrences(of: " ", with: ""))
            }

            let fragments = line.components(separatedBy: CharacterSet(charactersIn: "|•·"))
            for fragment in fragments {
                let cleaned = fragment
                    .replacingOccurrences(of: timePattern, with: " ", options: .regularExpression)
                    .replacingOccurrences(of: weekdayPattern, with: " ", options: .regularExpression)
                    .replacingOccurrences(of: #"\b(?:room|raum|lecture|tutorial|übung)\s*[A-Z0-9.-]*\b"#, with: " ", options: [.regularExpression, .caseInsensitive])
                    .replacingOccurrences(of: #"\s+"#, with: " ", options: .regularExpression)
                    .trimmingCharacters(in: .whitespacesAndNewlines.union(.punctuationCharacters))
                guard cleaned.rangeOfCharacter(from: .letters) != nil else { continue }
                append(cleaned)

                let words = cleaned.split(separator: " ").map(String.init)
                if words.count > 4 {
                    append(words.prefix(4).joined(separator: " "))
                }
            }
            if terms.count >= limit { break }
        }
        return Array(terms.prefix(limit))
    }

    static func score(course: NativeCourseSummary, lines: [String]) -> (score: Double, evidence: String) {
        let normalizedLines = lines.map { (raw: $0, normalized: normalized($0)) }
        if let code = course.code {
            let normalizedCode = normalized(code)
            if let line = normalizedLines.first(where: { $0.normalized.contains(normalizedCode) }) {
                return (1, line.raw)
            }
        }

        let courseName = normalized(course.name)
        if let line = normalizedLines.first(where: {
            $0.normalized.contains(courseName) || courseName.contains($0.normalized)
        }) {
            return (0.92, line.raw)
        }

        let courseWords = meaningfulWords(course.name)
        var best = (score: 0.0, evidence: lines.first ?? course.name)
        for line in lines {
            let words = meaningfulWords(line)
            guard !courseWords.isEmpty, !words.isEmpty else { continue }
            let overlap = courseWords.intersection(words).count
            let coverage = Double(overlap) / Double(courseWords.count)
            let precision = Double(overlap) / Double(words.count)
            let score = coverage * 0.75 + precision * 0.25
            if score > best.score {
                best = (score, line)
            }
        }
        return best
    }

    private static func normalized(_ value: String) -> String {
        value.folding(options: [.caseInsensitive, .diacriticInsensitive], locale: .current)
            .unicodeScalars
            .filter(CharacterSet.alphanumerics.contains)
            .map(String.init)
            .joined()
    }

    private static func meaningfulWords(_ value: String) -> Set<String> {
        Set(
            value.folding(options: [.caseInsensitive, .diacriticInsensitive], locale: .current)
                .components(separatedBy: CharacterSet.alphanumerics.inverted)
                .filter { $0.count >= 3 }
        )
    }

    private static func matches(pattern: String, in value: String) -> [String] {
        guard let regex = try? NSRegularExpression(pattern: pattern) else { return [] }
        let range = NSRange(value.startIndex..., in: value)
        return regex.matches(in: value, range: range).compactMap { match in
            Range(match.range, in: value).map { String(value[$0]) }
        }
    }
}

enum CourseScreenshotOCR {
    static func recognize(in imageData: Data) async throws -> [String] {
        try await Task.detached(priority: .userInitiated) {
            let request = VNRecognizeTextRequest()
            request.recognitionLevel = .accurate
            request.usesLanguageCorrection = true
            request.recognitionLanguages = ["de-DE", "en-US", "zh-Hans"]
            let handler = VNImageRequestHandler(data: imageData)
            try handler.perform([request])
            return (request.results ?? []).compactMap {
                $0.topCandidates(1).first?.string.trimmingCharacters(in: .whitespacesAndNewlines)
            }.filter { !$0.isEmpty }
        }.value
    }
}

@MainActor
@Observable
final class CourseScreenshotImportStore {
    private(set) var recognizedLines: [String] = []
    private(set) var matches: [CourseScreenshotMatch] = []
    private(set) var selectedCourseIDs: Set<String> = []
    private(set) var isAnalyzing = false
    private(set) var isImporting = false
    private(set) var issue: String?

    func analyze(imageData: Data, school: String?, using session: SessionStore) async {
        guard !isAnalyzing, !isImporting else { return }
        isAnalyzing = true
        issue = nil
        matches = []
        selectedCourseIDs = []
        defer { isAnalyzing = false }

        do {
            let lines = try await CourseScreenshotOCR.recognize(in: imageData)
            recognizedLines = lines
            let terms = CourseScreenshotText.searchTerms(from: lines)
            guard !terms.isEmpty else {
                issue = String(localized: "No course text was found in this image.")
                return
            }

            let response: APIEnvelope<NativeCourseMatchResult> = try await session.sendAuthorized(
                "api/v1/courses/match",
                method: .post,
                body: NativeCourseMatchRequest(school: school, terms: terms)
            )

            matches = response.data.courses.compactMap { course in
                let result = CourseScreenshotText.score(course: course, lines: lines)
                guard result.score >= 0.32 else { return nil }
                return CourseScreenshotMatch(
                    course: course,
                    evidence: result.evidence,
                    confidence: result.score
                )
            }.sorted {
                $0.confidence == $1.confidence
                    ? $0.course.name.localizedCaseInsensitiveCompare($1.course.name) == .orderedAscending
                    : $0.confidence > $1.confidence
            }
            selectedCourseIDs = Set(matches.compactMap { match in
                match.confidence >= 0.65 && !match.course.viewer.enrolled ? match.id : nil
            })
        } catch {
            issue = error.localizedDescription
        }
    }

    func toggle(_ courseID: String) {
        if selectedCourseIDs.contains(courseID) {
            selectedCourseIDs.remove(courseID)
        } else {
            selectedCourseIDs.insert(courseID)
        }
    }

    func importSelected(using session: SessionStore) async -> Bool {
        let courseIDs = selectedCourseIDs.sorted()
        guard !courseIDs.isEmpty, !isAnalyzing, !isImporting else { return false }
        isImporting = true
        issue = nil
        defer { isImporting = false }

        var failed: [String] = []
        for courseID in courseIDs {
            do {
                let _: APIEnvelope<CourseScreenshotEnrollmentResult> = try await session.sendAuthorized(
                    "api/v1/courses/\(courseID)/enrollment",
                    method: .post,
                    idempotencyKey: UUID().uuidString
                )
                selectedCourseIDs.remove(courseID)
            } catch {
                failed.append(courseID)
            }
        }

        if !failed.isEmpty {
            issue = String(
                format: String(localized: "%d courses could not be added. Try again."),
                failed.count
            )
            return false
        }
        return true
    }
}

private struct CourseScreenshotEnrollmentResult: Decodable, Sendable {
    let courseId: String
}
