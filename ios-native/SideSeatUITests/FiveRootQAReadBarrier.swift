import Foundation
import XCTest

/// Mac GET observers acknowledge each verified state in this test runner's own
/// Documents directory. No synchronization hook or file is added to SideSeat.
enum FiveRootQAReadBarrier {
    @MainActor static func wait(for phase: String, timeout: TimeInterval = 300) throws {
        let environment = ProcessInfo.processInfo.environment
        let nonce = environment["SIDESEAT_QA_READ_BARRIER_NONCE"] ?? ""
        let runner = environment["SIDESEAT_QA_READ_BARRIER_RUNNER_BUNDLE"] ?? ""
        try require(nonce.range(of: "^[a-f0-9]{32}$", options: .regularExpression) != nil,
                    "Use a fresh explicit read-barrier nonce.")
        try require(runner.range(of: "^app\\.sideseat\\.fiveroots(calendar|calendarshare|calendaradvanced|calendarconnections|messages|me)qa\\.xctrunner$",
                                 options: .regularExpression) != nil && Bundle.main.bundleIdentifier == runner,
                    "Read acknowledgements only from the authorized QA runner's own sandbox.")
        try require(phase.range(of: "^[a-z][a-z0-9-]{0,79}$", options: .regularExpression) != nil,
                    "Use an explicit bounded phase identifier.")
        let documents = try FileManager.default.url(for: .documentDirectory, in: .userDomainMask,
                                                    appropriateFor: nil, create: true)
        let marker = documents.appendingPathComponent("sideseat-qa-read-barrier-\(nonce)-\(phase).json")
        let deadline = Date().addingTimeInterval(timeout)
        while Date() < deadline {
            if let data = try? Data(contentsOf: marker),
               let value = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
                try require(value["kind"] as? String == "sideseat-five-roots-read-barrier"
                            && value["schemaVersion"] as? Int == 1
                            && value["nonce"] as? String == nonce
                            && value["phase"] as? String == phase,
                            "The read acknowledgement must match this exact run and phase.")
                print("FIVE_ROOT_READ_ACK \(phase)"); fflush(stdout)
                return
            }
            RunLoop.current.run(until: Date().addingTimeInterval(0.1))
        }
        try require(false, "The independent GET observer did not acknowledge \(phase); stop before the next UI mutation.")
    }

    private static func require(_ condition: Bool, _ message: String) throws {
        guard condition else {
            XCTFail(message)
            throw NSError(domain: "FiveRootQAReadBarrier", code: 1,
                          userInfo: [NSLocalizedDescriptionKey: message])
        }
    }
}
