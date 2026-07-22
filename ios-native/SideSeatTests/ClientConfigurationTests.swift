import Testing
@testable import SideSeat

@Suite("Client configuration")
struct ClientConfigurationTests {
    @Test("Compares numeric app version components")
    func versionComparison() {
        #expect(AppVersion("1.10.0") > AppVersion("1.9.9"))
        #expect(AppVersion("1.0") == AppVersion("1.0.0"))
        #expect(AppVersion("2.0.0-beta") == AppVersion("2.0.0"))
    }

    @Test("Requires an update below the minimum version")
    func minimumVersion() {
        let configuration = IOSConfiguration(
            minimumSupportedVersion: "1.2.0",
            latestVersion: "1.3.0",
            maintenanceMode: false
        )
        #expect(
            ClientConfigurationStore.availability(
                for: configuration,
                currentVersion: "1.1.9"
            ) == .updateRequired(minimumVersion: "1.2.0")
        )
    }

    @Test("Maintenance takes precedence over version state")
    func maintenanceMode() {
        let configuration = IOSConfiguration(
            minimumSupportedVersion: "1.0.0",
            latestVersion: "1.0.0",
            maintenanceMode: true
        )
        #expect(
            ClientConfigurationStore.availability(
                for: configuration,
                currentVersion: "2.0.0"
            ) == .maintenance
        )
    }
}
