import Foundation

/// Crash monitoring stub. When `SideSeatCrashDSN` is set in Info.plist / xcconfig,
/// wire a real SDK (Sentry, etc.) here. Development stays a no-op without a DSN.
enum CrashReporting {
    static func start() {
        guard let dsn = Bundle.main.object(forInfoDictionaryKey: "SideSeatCrashDSN") as? String,
              !dsn.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        else {
            return
        }
        // Placeholder until a monitoring SDK and production DSN are approved.
        // Keeping this entry point avoids scattering SDK setup across the app later.
        print("Crash reporting DSN present (\(dsn.prefix(12))…); SDK not linked yet.")
    }
}
