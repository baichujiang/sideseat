import AVFoundation
import Foundation
import Observation
import Speech

enum CalendarVoiceTranscript {
    static func merge(prefix: String, transcript: String) -> String {
        let prefix = prefix.trimmingCharacters(in: .whitespacesAndNewlines)
        let transcript = transcript.trimmingCharacters(in: .whitespacesAndNewlines)

        switch (prefix.isEmpty, transcript.isEmpty) {
        case (true, _):
            return transcript
        case (_, true):
            return prefix
        case (false, false):
            return prefix + " " + transcript
        }
    }
}

struct CalendarVoiceRecognitionUpdate: Sendable {
    let transcript: String?
    let isFinal: Bool
    let errorDescription: String?
}

protocol CalendarVoicePermissionProviding: Sendable {
    func requestSpeechPermission() async -> Bool
    func requestMicrophonePermission() async -> Bool
}

protocol CalendarVoiceAudioControlling: Sendable {
    func start(
        sessionID: UUID,
        locale: Locale,
        onUpdate: @escaping @Sendable (CalendarVoiceRecognitionUpdate) -> Void
    ) async throws
    func stop(sessionID: UUID, cancelTask: Bool) async
}

struct SystemCalendarVoicePermissionProvider: CalendarVoicePermissionProviding {
    func requestSpeechPermission() async -> Bool {
        switch SFSpeechRecognizer.authorizationStatus() {
        case .authorized:
            return true
        case .notDetermined:
            let status = await withCheckedContinuation { continuation in
                SFSpeechRecognizer.requestAuthorization { status in
                    continuation.resume(returning: status)
                }
            }
            return status == .authorized
        case .denied, .restricted:
            return false
        @unknown default:
            return false
        }
    }

    func requestMicrophonePermission() async -> Bool {
        switch AVAudioApplication.shared.recordPermission {
        case .granted:
            return true
        case .undetermined:
            return await withCheckedContinuation { continuation in
                AVAudioApplication.requestRecordPermission { granted in
                    continuation.resume(returning: granted)
                }
            }
        case .denied:
            return false
        @unknown default:
            return false
        }
    }
}

actor SystemCalendarVoiceAudioController: CalendarVoiceAudioControlling {
    private let audioEngine = AVAudioEngine()
    private var recognitionRequest: SFSpeechAudioBufferRecognitionRequest?
    private var recognitionTask: SFSpeechRecognitionTask?
    private var hasInputTap = false
    private var activeSessionID: UUID?

    func start(
        sessionID: UUID,
        locale: Locale,
        onUpdate: @escaping @Sendable (CalendarVoiceRecognitionUpdate) -> Void
    ) async throws {
        stopLocked(cancelTask: true)
        activeSessionID = sessionID

        do {
            guard let recognizer = SFSpeechRecognizer(locale: locale), recognizer.isAvailable else {
                throw CalendarVoiceInputError.speechUnavailable
            }
            guard recognizer.supportsOnDeviceRecognition else {
                throw CalendarVoiceInputError.onDeviceRecognitionUnavailable
            }

            let audioSession = AVAudioSession.sharedInstance()
            try audioSession.setCategory(.record, mode: .measurement, options: [.duckOthers])
            try audioSession.setActive(true, options: .notifyOthersOnDeactivation)

            let request = SFSpeechAudioBufferRecognitionRequest()
            request.shouldReportPartialResults = true
            request.requiresOnDeviceRecognition = true
            recognitionRequest = request

            let inputNode = audioEngine.inputNode
            let format = inputNode.outputFormat(forBus: 0)
            guard format.sampleRate > 0, format.channelCount > 0 else {
                throw CalendarVoiceInputError.noAudioInput
            }
            inputNode.installTap(onBus: 0, bufferSize: 1_024, format: format) { buffer, _ in
                request.append(buffer)
            }
            hasInputTap = true

            recognitionTask = recognizer.recognitionTask(with: request) { result, error in
                onUpdate(
                    CalendarVoiceRecognitionUpdate(
                        transcript: result?.bestTranscription.formattedString,
                        isFinal: result?.isFinal == true,
                        errorDescription: error?.localizedDescription
                    )
                )
            }

            audioEngine.prepare()
            try audioEngine.start()
        } catch {
            stopLocked(cancelTask: true)
            throw error
        }
    }

    func stop(sessionID: UUID, cancelTask: Bool) async {
        guard activeSessionID == sessionID else { return }
        stopLocked(cancelTask: cancelTask)
    }

    private func stopLocked(cancelTask: Bool) {
        if audioEngine.isRunning {
            audioEngine.stop()
        }
        if hasInputTap {
            audioEngine.inputNode.removeTap(onBus: 0)
            hasInputTap = false
        }
        recognitionRequest?.endAudio()
        if cancelTask {
            recognitionTask?.cancel()
        }
        recognitionTask = nil
        recognitionRequest = nil
        activeSessionID = nil
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    }
}

@MainActor
@Observable
final class CalendarVoiceInput {
    private(set) var transcript = ""
    private(set) var isStarting = false
    private(set) var isRecording = false
    private(set) var issue: String?
    private(set) var needsSettings = false

    var isActive: Bool {
        isStarting || isRecording
    }

    @ObservationIgnored private let permissionProvider: any CalendarVoicePermissionProviding
    @ObservationIgnored private let audioController: any CalendarVoiceAudioControlling
    @ObservationIgnored private var activeAttempt: UUID?

    init(
        permissionProvider: any CalendarVoicePermissionProviding = SystemCalendarVoicePermissionProvider(),
        audioController: any CalendarVoiceAudioControlling = SystemCalendarVoiceAudioController()
    ) {
        self.permissionProvider = permissionProvider
        self.audioController = audioController
    }

    static func forCurrentProcess() -> CalendarVoiceInput {
        guard ProcessInfo.processInfo.arguments.contains("--ui-testing-smart-voice") else {
            return CalendarVoiceInput()
        }
        return CalendarVoiceInput(
            permissionProvider: CalendarVoiceUITestPermissionProvider(),
            audioController: CalendarVoiceUITestAudioController()
        )
    }

    func start(locale: Locale = .current) async {
        guard !isActive else { return }

        let attempt = UUID()
        activeAttempt = attempt
        isStarting = true
        issue = nil
        needsSettings = false
        transcript = ""

        guard await permissionProvider.requestSpeechPermission() else {
            failPermission(
                AppLocalization.string( "Allow speech recognition in Settings to dictate an event."),
                attempt: attempt
            )
            return
        }
        guard canContinue(attempt) else { return }

        guard await permissionProvider.requestMicrophonePermission() else {
            failPermission(
                AppLocalization.string( "Allow microphone access in Settings to dictate an event."),
                attempt: attempt
            )
            return
        }
        guard canContinue(attempt) else { return }

        do {
            try await audioController.start(sessionID: attempt, locale: locale) { [weak self] update in
                Task { @MainActor [weak self] in
                    self?.receive(update, attempt: attempt)
                }
            }
            guard canContinue(attempt) else {
                await audioController.stop(sessionID: attempt, cancelTask: true)
                return
            }
            isStarting = false
            isRecording = true
        } catch {
            guard activeAttempt == attempt else { return }
            activeAttempt = nil
            isStarting = false
            isRecording = false
            issue = error.localizedDescription
        }
    }

    func stop() {
        let attempt = activeAttempt
        activeAttempt = nil
        isStarting = false
        isRecording = false
        guard let attempt else { return }
        Task {
            await audioController.stop(sessionID: attempt, cancelTask: true)
        }
    }

    private func receive(_ update: CalendarVoiceRecognitionUpdate, attempt: UUID) {
        guard activeAttempt == attempt else { return }

        if let text = update.transcript, !text.isEmpty {
            transcript = text
        }
        guard update.isFinal || update.errorDescription != nil else { return }

        activeAttempt = nil
        isStarting = false
        isRecording = false
        if !update.isFinal {
            issue = update.errorDescription
        }
        Task {
            await audioController.stop(sessionID: attempt, cancelTask: false)
        }
    }

    private func canContinue(_ attempt: UUID) -> Bool {
        activeAttempt == attempt && !Task.isCancelled
    }

    private func failPermission(_ message: String, attempt: UUID) {
        guard activeAttempt == attempt else { return }
        activeAttempt = nil
        isStarting = false
        isRecording = false
        issue = message
        needsSettings = true
    }
}

private struct CalendarVoiceUITestPermissionProvider: CalendarVoicePermissionProviding {
    func requestSpeechPermission() async -> Bool { true }
    func requestMicrophonePermission() async -> Bool { true }
}

private actor CalendarVoiceUITestAudioController: CalendarVoiceAudioControlling {
    func start(
        sessionID: UUID,
        locale: Locale,
        onUpdate: @escaping @Sendable (CalendarVoiceRecognitionUpdate) -> Void
    ) async throws {
        _ = sessionID
        _ = locale
        try await Task.sleep(for: .milliseconds(180))
        onUpdate(
            CalendarVoiceRecognitionUpdate(
                transcript: "Tomorrow at three in the library",
                isFinal: false,
                errorDescription: nil
            )
        )
    }

    func stop(sessionID: UUID, cancelTask: Bool) async {
        _ = sessionID
        _ = cancelTask
    }
}

enum CalendarVoiceInputError: LocalizedError {
    case noAudioInput
    case speechUnavailable
    case onDeviceRecognitionUnavailable

    var errorDescription: String? {
        switch self {
        case .noAudioInput:
            AppLocalization.string( "No microphone input is available on this device.")
        case .speechUnavailable:
            AppLocalization.string( "Speech recognition is unavailable right now. Try again shortly.")
        case .onDeviceRecognitionUnavailable:
            AppLocalization.string( "On-device speech recognition is unavailable for this language.")
        }
    }
}
