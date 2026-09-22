import CoreLocation
import Foundation

@MainActor
@Observable
final class ChatLocationCapture: NSObject, CLLocationManagerDelegate {
    enum CaptureError: LocalizedError {
        case denied
        case unavailable

        var errorDescription: String? {
            switch self {
            case .denied:
                AppLocalization.string( "Location access is required to share where you are.")
            case .unavailable:
                AppLocalization.string( "Could not get your current location. Try again.")
            }
        }
    }

    private let manager = CLLocationManager()
    private var continuation: CheckedContinuation<(latitude: Double, longitude: Double), Error>?
    private var awaitingAuthorization = false

    override init() {
        super.init()
        manager.desiredAccuracy = kCLLocationAccuracyHundredMeters
        manager.delegate = self
    }

    func captureCurrentLocation() async throws -> (latitude: Double, longitude: Double) {
        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("--ui-testing-authenticated") {
            return (48.137, 11.575)
        }
        #endif

        return try await withCheckedThrowingContinuation { continuation in
            self.continuation = continuation
            switch manager.authorizationStatus {
            case .authorizedWhenInUse, .authorizedAlways:
                manager.requestLocation()
            case .notDetermined:
                awaitingAuthorization = true
                manager.requestWhenInUseAuthorization()
            default:
                finish(.failure(CaptureError.denied))
            }
        }
    }

    nonisolated func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        Task { @MainActor in
            self.handleAuthorizationChange()
        }
    }

    nonisolated func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        let coordinate = locations.first.map { ($0.coordinate.latitude, $0.coordinate.longitude) }
        Task { @MainActor in
            if let coordinate {
                self.finish(.success((coordinate.0, coordinate.1)))
            } else {
                self.finish(.failure(CaptureError.unavailable))
            }
        }
    }

    nonisolated func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        Task { @MainActor in
            self.finish(.failure(CaptureError.unavailable))
        }
    }

    private func handleAuthorizationChange() {
        guard awaitingAuthorization else { return }
        awaitingAuthorization = false
        switch manager.authorizationStatus {
        case .authorizedWhenInUse, .authorizedAlways:
            manager.requestLocation()
        default:
            finish(.failure(CaptureError.denied))
        }
    }

    private func finish(_ result: Result<(latitude: Double, longitude: Double), Error>) {
        guard let continuation else { return }
        self.continuation = nil
        awaitingAuthorization = false
        continuation.resume(with: result)
    }
}
