import Foundation
import Testing
@testable import SideSeat

@Suite("Feedback vote request contract")
struct FeedbackVoteRequestContractTests {
    @Test("Removing a vote sends the required value key as null")
    func removeVote() throws {
        let data = try JSONEncoder().encode(NativeFeedbackVoteRequest(value: nil))
        let object = try #require(JSONSerialization.jsonObject(with: data) as? [String: Any])
        #expect(object["value"] is NSNull)
    }

    @Test("A vote preserves its selected direction", arguments: ["UP", "DOWN"])
    func selectedVote(_ direction: String) throws {
        let data = try JSONEncoder().encode(NativeFeedbackVoteRequest(value: direction))
        let object = try #require(JSONSerialization.jsonObject(with: data) as? [String: Any])
        #expect(object["value"] as? String == direction)
    }
}
