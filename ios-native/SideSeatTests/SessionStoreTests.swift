import Foundation
import Testing
@testable import SideSeat

@Suite("Authenticated networking", .serialized)
struct SessionStoreTests {
    @Test("Signup normalizes the username, signs in, and persists credentials")
    @MainActor
    func signupCompletesNativeAuthentication() async throws {
        let transport = AuthTestTransport()
        let credentialStore = MemoryCredentialStore()
        let store = SessionStore(
            apiClient: APIClient(environment: .test, transport: transport),
            credentialStore: credentialStore,
            device: .test
        )

        let issue = await store.signup(
            displayName: "Live Student",
            username: "  Mixed_CASE  ",
            password: "Password123",
            school: "TUM",
            studentStatus: "CURRENT_STUDENT",
            degreeLevel: "MASTER",
            semester: 3,
            graduationYear: nil
        )

        #expect(issue == nil)
        #expect(store.phase == .signedIn)
        #expect(store.currentUser?.id == "signup-user")
        #expect(store.currentUser?.username == "mixed_case")
        #expect(store.accessTokenForStreaming == "access-signup")
        #expect(await credentialStore.refreshToken() == "refresh-signup")
        #expect(
            await transport.signupCapture == SignupCapture(
                displayName: "Live Student",
                username: "mixed_case",
                school: "TUM",
                studentStatus: "CURRENT_STUDENT",
                degreeLevel: "MASTER",
                semester: 3,
                graduationYear: nil
            )
        )
    }

    @Test("Password reset normalizes email, resets credentials, and signs in")
    @MainActor
    func passwordResetCompletesNativeAuthentication() async throws {
        let transport = AuthTestTransport()
        let credentialStore = MemoryCredentialStore()
        let store = SessionStore(
            apiClient: APIClient(environment: .test, transport: transport),
            credentialStore: credentialStore,
            device: .test
        )

        let sendIssue = await store.sendPasswordResetOTP(email: "  Student@TUM.DE  ")
        #expect(sendIssue == nil)
        #expect(await transport.passwordResetEmail == "student@tum.de")

        let resetIssue = await store.resetPassword(
            email: "  Student@TUM.DE  ",
            code: " 123456 ",
            password: "NewPassword123",
            confirmPassword: "NewPassword123"
        )

        #expect(resetIssue == nil)
        #expect(
            await transport.passwordResetCapture == PasswordResetCapture(
                email: "student@tum.de",
                code: "123456",
                password: "NewPassword123",
                confirmPassword: "NewPassword123"
            )
        )
        #expect(store.phase == .signedIn)
        #expect(store.currentUser?.id == "reset-user")
        #expect(store.currentUser?.username == "reset_student")
        #expect(store.accessTokenForStreaming == "access-reset")
        #expect(await credentialStore.refreshToken() == "refresh-reset")
    }

    @Test("Password reset validation never reaches the network")
    @MainActor
    func passwordResetValidationStopsInvalidRequests() async {
        let transport = AuthTestTransport()
        let store = SessionStore(
            apiClient: APIClient(environment: .test, transport: transport),
            credentialStore: MemoryCredentialStore(),
            device: .test
        )

        let invalidEmail = await store.sendPasswordResetOTP(email: "not-an-email")
        #expect(invalidEmail != nil)

        let mismatched = await store.resetPassword(
            email: "student@tum.de",
            code: "123456",
            password: "NewPassword123",
            confirmPassword: "DifferentPassword123"
        )
        #expect(mismatched == String(localized: "Passwords do not match."))
        #expect(await transport.passwordResetEmail == nil)
        #expect(await transport.passwordResetCapture == nil)
    }

    @Test("Concurrent unauthorized requests share one refresh")
    @MainActor
    func concurrentUnauthorizedRequestsShareRefresh() async throws {
        let transport = AuthTestTransport()
        let credentialStore = MemoryCredentialStore()
        let client = APIClient(environment: .test, transport: transport)
        let store = SessionStore(
            apiClient: client,
            credentialStore: credentialStore,
            device: .test
        )

        await store.login(identifier: "test_001", password: "Password123")
        #expect(store.phase == .signedIn)

        async let first: APIEnvelope<TestValue> = store.sendAuthorized("api/v1/protected")
        async let second: APIEnvelope<TestValue> = store.sendAuthorized("api/v1/protected")
        let responses = try await (first, second)

        #expect(responses.0.data.value == "ok")
        #expect(responses.1.data.value == "ok")
        #expect(await transport.refreshCount == 1)
        #expect(await transport.expiredAccessCount == 2)
        #expect(await credentialStore.refreshToken() == "refresh-new")
    }

    @Test("Authorized writes refresh once after unauthorized")
    @MainActor
    func authorizedWriteRefreshesOnce() async throws {
        let transport = AuthTestTransport()
        let store = SessionStore(
            apiClient: APIClient(environment: .test, transport: transport),
            credentialStore: MemoryCredentialStore(),
            device: .test
        )
        await store.login(identifier: "test_001", password: "Password123")

        let response: APIEnvelope<TestValue> = try await store.sendAuthorized(
            "api/v1/protected",
            method: .post,
            body: TestBody(value: "safe-after-refresh"),
            idempotencyKey: "test-write-refresh"
        )

        #expect(response.data.value == "ok")
        #expect(await transport.refreshCount == 1)
        #expect(await transport.expiredAccessCount == 1)
    }

    @Test("Logout followed by another login adopts only the new account")
    @MainActor
    func logoutThenLoginUsesNewAccount() async throws {
        let transport = AuthTestTransport()
        let credentialStore = MemoryCredentialStore()
        let store = SessionStore(
            apiClient: APIClient(environment: .test, transport: transport),
            credentialStore: credentialStore,
            device: .test
        )

        await store.login(identifier: "test_001", password: "Password123")
        #expect(store.currentUser?.id == "user-1")
        #expect(await credentialStore.refreshToken() == "refresh-old")

        PushDeviceTokenStore.remember("test-apns-token")
        await store.logout()
        #expect(store.phase == .signedOut)
        #expect(store.currentUser == nil)
        #expect(store.accessTokenForStreaming == nil)
        #expect(await credentialStore.refreshToken() == nil)
        #expect(await transport.logoutPushToken == "test-apns-token")

        await store.login(identifier: "test_002", password: "Password123")
        #expect(store.phase == .signedIn)
        #expect(store.currentUser?.id == "user-2")
        #expect(store.currentUser?.username == "test_002")
        #expect(store.accessTokenForStreaming == "access-user-2")
        #expect(await credentialStore.refreshToken() == "refresh-user-2")
    }
}

private struct TestValue: Decodable, Sendable {
    let value: String
}

#if DEBUG
@Suite("App environment test override")
struct AppEnvironmentOverrideTests {
    @Test("Development UI tests may use a loopback API")
    func acceptsExplicitLoopbackOverride() {
        let override = AppEnvironment.debugAPIBaseURLOverride(
            deployment: .development,
            arguments: ["SideSeat", "--ui-testing-local-api"],
            environment: ["SIDESEAT_API_BASE_URL_OVERRIDE": "http://127.0.0.1:3000"]
        )

        #expect(override == URL(string: "http://127.0.0.1:3000"))
    }

    @Test("The override requires the explicit UI-test launch flag")
    func rejectsMissingLaunchFlag() {
        let override = AppEnvironment.debugAPIBaseURLOverride(
            deployment: .development,
            arguments: ["SideSeat"],
            environment: ["SIDESEAT_API_BASE_URL_OVERRIDE": "http://127.0.0.1:3000"]
        )

        #expect(override == nil)
    }

    @Test("The override cannot redirect tests to a remote API")
    func rejectsRemoteURL() {
        let override = AppEnvironment.debugAPIBaseURLOverride(
            deployment: .development,
            arguments: ["SideSeat", "--ui-testing-local-api"],
            environment: ["SIDESEAT_API_BASE_URL_OVERRIDE": "https://api.sideseat.de"]
        )

        #expect(override == nil)
    }

    @Test("Production ignores all UI-test API overrides")
    func rejectsProductionOverride() {
        let override = AppEnvironment.debugAPIBaseURLOverride(
            deployment: .production,
            arguments: ["SideSeat", "--ui-testing-local-api"],
            environment: ["SIDESEAT_API_BASE_URL_OVERRIDE": "http://127.0.0.1:3000"]
        )

        #expect(override == nil)
    }
}
#endif

private struct TestBody: Encodable, Sendable {
    let value: String
}

private struct SignupCapture: Equatable, Sendable {
    let displayName: String
    let username: String
    let school: String
    let studentStatus: String
    let degreeLevel: String
    let semester: Int?
    let graduationYear: Int?
}

private struct PasswordResetCapture: Equatable, Sendable {
    let email: String
    let code: String
    let password: String
    let confirmPassword: String
}

private actor MemoryCredentialStore: CredentialStore {
    private var token: String?

    func refreshToken() -> String? {
        token
    }

    func save(refreshToken: String) {
        token = refreshToken
    }

    func clear() {
        token = nil
    }
}

private actor AuthTestTransport: APITransport {
    private(set) var refreshCount = 0
    private(set) var expiredAccessCount = 0
    private(set) var logoutPushToken: String?
    private(set) var signupCapture: SignupCapture?
    private(set) var passwordResetEmail: String?
    private(set) var passwordResetCapture: PasswordResetCapture?

    func data(for request: URLRequest) async throws -> (Data, URLResponse) {
        let path = request.url?.path ?? ""
        switch path {
        case "/api/auth/signup":
            let body = jsonBody(from: request)
            signupCapture = SignupCapture(
                displayName: body?["displayName"] as? String ?? "",
                username: body?["username"] as? String ?? "",
                school: body?["school"] as? String ?? "",
                studentStatus: body?["studentStatus"] as? String ?? "",
                degreeLevel: body?["degreeLevel"] as? String ?? "",
                semester: body?["semester"] as? Int,
                graduationYear: body?["graduationYear"] as? Int
            )
            return response(
                for: request,
                status: 201,
                body: #"{"data":{"userId":"signup-user","onboardingComplete":true}}"#
            )
        case "/api/auth/forgot-password/send-otp":
            passwordResetEmail = jsonBody(from: request)?["email"] as? String
            return response(for: request, status: 200, body: #"{"data":{"sent":true}}"#)
        case "/api/auth/forgot-password/reset":
            let body = jsonBody(from: request)
            passwordResetCapture = PasswordResetCapture(
                email: body?["email"] as? String ?? "",
                code: body?["code"] as? String ?? "",
                password: body?["password"] as? String ?? "",
                confirmPassword: body?["confirmPassword"] as? String ?? ""
            )
            return response(for: request, status: 200, body: #"{"data":{"userId":"reset-user"}}"#)
        case "/api/v1/auth/login":
            let identifier = loginIdentifier(from: request)
            if identifier == "mixed_case" {
                return response(
                    for: request,
                    status: 200,
                    body: authBody(
                        access: "access-signup",
                        refresh: "refresh-signup",
                        userID: "signup-user",
                        username: "mixed_case"
                    )
                )
            }
            if identifier == "test_002" {
                return response(
                    for: request,
                    status: 200,
                    body: authBody(
                        access: "access-user-2",
                        refresh: "refresh-user-2",
                        userID: "user-2",
                        username: "test_002"
                    )
                )
            }
            if identifier == "student@tum.de" {
                return response(
                    for: request,
                    status: 200,
                    body: authBody(
                        access: "access-reset",
                        refresh: "refresh-reset",
                        userID: "reset-user",
                        username: "reset_student"
                    )
                )
            }
            return response(for: request, status: 200, body: authBody(access: "access-old", refresh: "refresh-old"))
        case "/api/v1/auth/logout":
            logoutPushToken = jsonBody(from: request)?["pushToken"] as? String
            return response(for: request, status: 200, body: #"{"data":{"revoked":true}}"#)
        case "/api/v1/auth/refresh":
            refreshCount += 1
            try await Task.sleep(for: .milliseconds(120))
            return response(for: request, status: 200, body: authBody(access: "access-new", refresh: "refresh-new"))
        case "/api/v1/protected":
            if request.value(forHTTPHeaderField: "Authorization") == "Bearer access-new" {
                return response(for: request, status: 200, body: #"{"data":{"value":"ok"}}"#)
            }
            expiredAccessCount += 1
            try await Task.sleep(for: .milliseconds(80))
            return response(
                for: request,
                status: 401,
                body: #"{"error":{"code":"UNAUTHORIZED","message":"Expired","field":null,"retryable":false,"requestId":"request-1"}}"#
            )
        default:
            return response(for: request, status: 404, body: #"{"error":{"code":"NOT_FOUND","message":"Missing","field":null,"retryable":false,"requestId":"request-2"}}"#)
        }
    }

    private func response(
        for request: URLRequest,
        status: Int,
        body: String
    ) -> (Data, URLResponse) {
        let response = HTTPURLResponse(
            url: request.url!,
            statusCode: status,
            httpVersion: "HTTP/1.1",
            headerFields: ["Content-Type": "application/json"]
        )!
        return (Data(body.utf8), response)
    }

    private func loginIdentifier(from request: URLRequest) -> String? {
        jsonBody(from: request)?["identifier"] as? String
    }

    private func jsonBody(from request: URLRequest) -> [String: Any]? {
        guard let data = request.httpBody else { return nil }
        return try? JSONSerialization.jsonObject(with: data) as? [String: Any]
    }

    private func authBody(
        access: String,
        refresh: String,
        userID: String = "user-1",
        username: String = "test_001"
    ) -> String {
        """
        {"data":{"user":{"id":"\(userID)","username":"\(username)","nickname":"Test User","gender":"UNSPECIFIED","onboardingComplete":true,"isGuest":false,"verifiedStudent":true,"studentVerificationStatus":"VERIFIED","locale":"en"},"tokens":{"accessToken":"\(access)","accessExpiresIn":900,"refreshToken":"\(refresh)","refreshExpiresAt":"2026-08-16T00:00:00.000Z"}}}
        """
    }
}

private extension AppEnvironment {
    static let test = AppEnvironment(
        deployment: .development,
        apiBaseURL: URL(string: "https://api.sideseat.test")!,
        bundleIdentifier: "app.sideseat.mobile.tests",
        appVersion: "1.0.0",
        buildNumber: "1"
    )
}

private extension NativeDevice {
    static let test = NativeDevice(
        id: "device-1",
        name: "Test iPhone",
        appVersion: "1.0.0",
        platformVersion: "26.5"
    )
}
