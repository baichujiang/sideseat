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

@MainActor
@Observable
final class CalendarVoiceInput {
    private(set) var transcript = ""
    private(set) var isRecording = false
    private(set) var issue: String?
    private(set) var needsSettings = false

    @ObservationIgnored private let audioEngine = AVAudioEngine()
    @ObservationIgnored private var recognitionRequest: SFSpeechAudioBufferRecognitionRequest?
    @ObservationIgnored private var recognitionTask: SFSpeechRecognitionTask?

    func start(locale: Locale = .current) async {
        guard !isRecording else { return }

        issue = nil
        needsSettings = false
        transcript = ""

        guard await requestSpeechPermission() else {
            issue = String(localized: "Allow speech recognition in Settings to dictate an event.")
            needsSettings = true
            return
        }
        guard await requestMicrophonePermission() else {
            issue = String(localized: "Allow microphone access in Settings to dictate an event.")
            needsSettings = true
            return
        }
        guard let recognizer = SFSpeechRecognizer(locale: locale), recognizer.isAvailable else {
            issue = String(localized: "Speech recognition is unavailable right now. Try again shortly.")
            return
        }
        guard recognizer.supportsOnDeviceRecognition else {
            issue = String(localized: "On-device speech recognition is unavailable for this language.")
            return
        }

        do {
            try beginRecognition(using: recognizer)
        } catch {
            endRecognition(cancelTask: true)
            issue = error.localizedDescription
        }
    }

    func stop() {
        endRecognition(cancelTask: true)
    }

    private func beginRecognition(using recognizer: SFSpeechRecognizer) throws {
        endRecognition(cancelTask: true)

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

        recognitionTask = recognizer.recognitionTask(with: request) { [weak self] result, error in
            let text = result?.bestTranscription.formattedString
            let isFinal = result?.isFinal == true
            let errorDescription = error?.localizedDescription

            Task { @MainActor [weak self] in
                guard let self else { return }
                if let text, !text.isEmpty {
                    self.transcript = text
                }
                if isFinal {
                    self.endRecognition(cancelTask: false)
                } else if let errorDescription, self.isRecording {
                    self.endRecognition(cancelTask: false)
                    self.issue = errorDescription
                }
            }
        }

        audioEngine.prepare()
        try audioEngine.start()
        isRecording = true
    }

    private func endRecognition(cancelTask: Bool) {
        if audioEngine.isRunning {
            audioEngine.stop()
        }
        audioEngine.inputNode.removeTap(onBus: 0)
        recognitionRequest?.endAudio()
        if cancelTask {
            recognitionTask?.cancel()
        }
        recognitionTask = nil
        recognitionRequest = nil
        isRecording = false
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    }

    private func requestSpeechPermission() async -> Bool {
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

    private func requestMicrophonePermission() async -> Bool {
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

private enum CalendarVoiceInputError: LocalizedError {
    case noAudioInput

    var errorDescription: String? {
        String(localized: "No microphone input is available on this device.")
    }
}
