import Foundation
import Sentry

enum CrashReporting {
    static func start() {
        guard let dsn = Bundle.main.object(forInfoDictionaryKey: "SideSeatCrashDSN") as? String,
              !dsn.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        else {
            return
        }

        let environment = Bundle.main.object(forInfoDictionaryKey: "SideSeatEnvironment") as? String
        SentrySDK.start { options in
            options.dsn = dsn
            options.environment = environment ?? "unknown"
            options.sendDefaultPii = false
            options.enableAutoSessionTracking = true
            options.tracesSampleRate = 0.05
#if DEBUG
            options.debug = true
#endif
        }
    }
}
