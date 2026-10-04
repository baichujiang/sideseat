import Foundation

/// Minimal SSE parser for SideSeat chat event streams.
struct ChatSSEClient: Sendable {
    struct Event: Sendable {
        var id: String?
        var event: String?
        var data: String
    }

    /// AsyncBytes.lines omits blank lines, which SSE needs as event boundaries.
    /// Decode complete UTF-8 lines from bytes instead, retaining empty separators.
    struct ByteDecoder {
        private var lineBytes: [UInt8] = []
        private var partial = ""

        mutating func append(_ byte: UInt8) -> [Event] {
            guard byte == 10 else {
                lineBytes.append(byte)
                return []
            }
            var line = String(decoding: lineBytes, as: UTF8.self)
            lineBytes.removeAll(keepingCapacity: true)
            if line.last == "\r" { line.removeLast() }
            return ChatSSEClient.parse(line + "\n", carrying: &partial)
        }
    }

    static func parse(_ chunk: String, carrying partial: inout String) -> [Event] {
        partial += chunk
        var events: [Event] = []
        while let range = partial.range(of: "\n\n") {
            let block = String(partial[..<range.lowerBound])
            partial = String(partial[range.upperBound...])
            if let event = parseBlock(block) {
                events.append(event)
            }
        }
        return events
    }

    private static func parseBlock(_ block: String) -> Event? {
        var id: String?
        var event: String?
        var dataLines: [String] = []
        for rawLine in block.split(separator: "\n", omittingEmptySubsequences: false) {
            let line = String(rawLine)
            if line.hasPrefix(":") { continue }
            if line.hasPrefix("id:") {
                id = String(line.dropFirst(3)).trimmingCharacters(in: .whitespaces)
            } else if line.hasPrefix("event:") {
                event = String(line.dropFirst(6)).trimmingCharacters(in: .whitespaces)
            } else if line.hasPrefix("data:") {
                dataLines.append(String(line.dropFirst(5)).trimmingCharacters(in: .whitespaces))
            }
        }
        guard !dataLines.isEmpty else { return nil }
        return Event(id: id, event: event, data: dataLines.joined(separator: "\n"))
    }
}
