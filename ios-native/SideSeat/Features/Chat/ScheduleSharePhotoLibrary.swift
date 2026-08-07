import Foundation
import OSLog
import Photos

enum ScheduleSharePhotoSaveDiagnostics {
    static let logger = Logger(
        subsystem: Bundle.main.bundleIdentifier ?? "app.sideseat.mobile",
        category: "SchedulePhotoSave"
    )

    static func elapsedMilliseconds(since startedAt: TimeInterval) -> Int {
        Int(((ProcessInfo.processInfo.systemUptime - startedAt) * 1_000).rounded())
    }

    static func label(for status: PHAuthorizationStatus) -> String {
        switch status {
        case .notDetermined: "not_determined"
        case .restricted: "restricted"
        case .denied: "denied"
        case .authorized: "authorized"
        case .limited: "limited"
        @unknown default: "unknown"
        }
    }
}

enum ScheduleSharePhotoLibraryError: Error, Equatable {
    case timedOut
    case saveFailed
}

protocol ScheduleSharePhotoLibraryClient {
    func authorizationStatus() -> PHAuthorizationStatus
    func requestAuthorization() async -> PHAuthorizationStatus
    func save(_ imageData: Data) async throws
}

struct SystemScheduleSharePhotoLibraryClient: ScheduleSharePhotoLibraryClient {
    private let saveTimeout: TimeInterval

    init(saveTimeout: TimeInterval = 15) {
        self.saveTimeout = saveTimeout
    }

    func authorizationStatus() -> PHAuthorizationStatus {
        PHPhotoLibrary.authorizationStatus(for: .addOnly)
    }

    func requestAuthorization() async -> PHAuthorizationStatus {
        await PHPhotoLibrary.requestAuthorization(for: .addOnly)
    }

    func save(_ imageData: Data) async throws {
        let operation = ScheduleSharePhotoWriteOperation()
        try await operation.run(timeout: saveTimeout) { completion in
            PHPhotoLibrary.shared().performChanges {
                let request = PHAssetCreationRequest.forAsset()
                let options = PHAssetResourceCreationOptions()
                options.originalFilename = "SideSeat Schedule.png"
                request.addResource(with: .photo, data: imageData, options: options)
            } completionHandler: { didSave, error in
                completion(didSave, error)
            }
        }
    }
}

final class ScheduleSharePhotoWriteOperation: @unchecked Sendable {
    private let lock = NSLock()
    private var continuation: CheckedContinuation<Void, Error>?
    private var terminalResult: Result<Void, Error>?
    private var timeoutTask: Task<Void, Never>?

    func run(
        timeout: TimeInterval,
        start: @escaping @Sendable (@escaping @Sendable (Bool, Error?) -> Void) -> Void
    ) async throws {
        try await withTaskCancellationHandler {
            try await withCheckedThrowingContinuation { continuation in
                guard install(continuation) else { return }

                let timeoutNanoseconds = UInt64(max(timeout, 0.01) * 1_000_000_000)
                let timeoutTask = Task.detached { [weak self] in
                    do {
                        try await Task.sleep(nanoseconds: timeoutNanoseconds)
                    } catch {
                        return
                    }
                    self?.finish(.failure(ScheduleSharePhotoLibraryError.timedOut))
                }
                setTimeoutTask(timeoutTask)

                start { [weak self] didSave, error in
                    guard let self else { return }
                    if didSave {
                        finish(.success(()))
                    } else {
                        finish(.failure(error ?? ScheduleSharePhotoLibraryError.saveFailed))
                    }
                }
            }
        } onCancel: {
            finish(.failure(CancellationError()))
        }
    }

    private func install(_ continuation: CheckedContinuation<Void, Error>) -> Bool {
        lock.lock()
        if let terminalResult {
            lock.unlock()
            continuation.resume(with: terminalResult)
            return false
        }
        self.continuation = continuation
        lock.unlock()
        return true
    }

    private func setTimeoutTask(_ task: Task<Void, Never>) {
        lock.lock()
        if terminalResult == nil {
            timeoutTask = task
            lock.unlock()
        } else {
            lock.unlock()
            task.cancel()
        }
    }

    private func finish(_ result: Result<Void, Error>) {
        let continuation: CheckedContinuation<Void, Error>?
        let timeoutTask: Task<Void, Never>?

        lock.lock()
        guard terminalResult == nil else {
            lock.unlock()
            return
        }
        terminalResult = result
        continuation = self.continuation
        self.continuation = nil
        timeoutTask = self.timeoutTask
        self.timeoutTask = nil
        lock.unlock()

        timeoutTask?.cancel()
        continuation?.resume(with: result)
    }
}
