import Foundation
import Testing
@testable import SideSeat

@Suite("Schedule share photo saving")
@MainActor
struct ScheduleSharePhotoLibraryTests {
    @Test("A successful Photos callback completes the save")
    func successfulCallbackCompletes() async throws {
        let operation = ScheduleSharePhotoWriteOperation()

        try await operation.run(timeout: 1) { completion in
            completion(true, nil)
        }
    }

    @Test("A missing Photos callback times out instead of hanging")
    func missingCallbackTimesOut() async {
        let operation = ScheduleSharePhotoWriteOperation()

        do {
            try await operation.run(timeout: 0.03) { _ in }
            Issue.record("Expected the photo save to time out")
        } catch let error as ScheduleSharePhotoLibraryError {
            #expect(error == .timedOut)
        } catch {
            Issue.record("Unexpected error: \(error)")
        }
    }

    @Test("Cancelling the task releases a pending Photos save")
    func cancellationReleasesWaiter() async {
        let task = Task {
            let operation = ScheduleSharePhotoWriteOperation()
            try await operation.run(timeout: 10) { _ in }
        }

        await Task.yield()
        task.cancel()

        do {
            try await task.value
            Issue.record("Expected cancellation")
        } catch is CancellationError {
            // Expected.
        } catch {
            Issue.record("Unexpected error: \(error)")
        }
    }
}
