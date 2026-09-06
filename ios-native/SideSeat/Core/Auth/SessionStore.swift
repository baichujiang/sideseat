import Foundation
import Observation

enum SessionPhase: Sendable {
    case restoring
    case signedOut
    case signedIn
}

@MainActor
@Observable
final class SessionStore {
    private let apiClient: APIClient
    private let credentialStore: any CredentialStore
    private let device: NativeDevice
    private var refreshOperation: (id: UUID, epoch: UInt64, task: Task<AuthPayload, Error>)?
    private var sessionEpoch: UInt64 = 0

    private(set) var phase: SessionPhase = .restoring
    private(set) var currentUser: CurrentUser?
    private(set) var accessToken: String?
    private(set) var isWorking = false
    private(set) var isRestoringConnection = false
    private(set) var isOffline = false
    private(set) var restorationIssue: String?
    var issue: String?

    /// Access token for long-lived SSE; callers must handle 401 by restarting after refresh.
    var accessTokenForStreaming: String? { accessToken }
    var canPresentAppShell: Bool { currentUser != nil && phase != .signedOut }
    var canMakeAuthenticatedRequests: Bool { phase == .signedIn && accessToken != nil }
    var shouldAutomaticallyRetryConnection: Bool {
        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("--ui-testing-offline-cached-launch") {
            return false
        }
        #endif
        return isOffline
    }

    func applyCurrentUser(_ user: CurrentUser) async {
        currentUser = user
        try? await credentialStore.saveCachedUser(user)
    }

    /// Refresh the access token for SSE reconnect after a 401.
    /// Returns the new token, or throws (and signs out) if refresh is impossible.
    @discardableResult
    func refreshAccessTokenForStreaming() async throws -> String {
        try await refreshAccessToken()
    }

    init(
        apiClient: APIClient,
        credentialStore: any CredentialStore,
        device: NativeDevice
    ) {
        self.apiClient = apiClient
        self.credentialStore = credentialStore
        self.device = device
    }

    func restoreSession() async {
        guard phase == .restoring else { return }
        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("--ui-testing-slow-cached-launch") {
            isRestoringConnection = true
            defer { isRestoringConnection = false }
            try? await Task.sleep(for: .seconds(8))
            accessToken = "ui-test-restored-access-token"
            isOffline = false
            restorationIssue = nil
            phase = .signedIn
            return
        }
        #endif
        await restoreOrReconnect(loadCachedIdentity: true)
    }

    func retryConnection() async {
        guard !isRestoringConnection else { return }
        await restoreOrReconnect(loadCachedIdentity: currentUser == nil)
    }

    private func restoreOrReconnect(loadCachedIdentity: Bool) async {
        guard !isRestoringConnection else { return }
        isRestoringConnection = true
        defer { isRestoringConnection = false }
        restorationIssue = nil
        let epoch = sessionEpoch
        do {
            if loadCachedIdentity, currentUser == nil {
                currentUser = try await credentialStore.cachedUser()
            }
            guard let token = try await credentialStore.refreshToken() else {
                await invalidateLocalSession(expectedEpoch: epoch)
                return
            }
            try await refresh(using: token, expectedEpoch: epoch)
        } catch {
            guard sessionEpoch == epoch else { return }
            if Self.invalidatesCredentials(error) {
                await invalidateLocalSession(expectedEpoch: epoch)
            } else {
                accessToken = nil
                isOffline = true
                restorationIssue = AppLocalization.string(
                    "Couldn't connect. Your saved data is still available."
                )
                if currentUser != nil {
                    phase = .signedIn
                }
            }
        }
    }

    func login(identifier: String, password: String) async {
        guard !isWorking else { return }
        isWorking = true
        issue = nil
        defer { isWorking = false }
        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("--ui-testing-login-failure") {
            await Task.yield()
            issue = AppLocalization.string("Incorrect username or password.")
            return
        }
        #endif
        do {
            try await performLogin(identifier: identifier, password: password)
        } catch {
            issue = AuthIssueMapper.message(for: error)
        }
    }

    /// Creates an account via legacy signup, then exchanges for native tokens via v1 login.
    @discardableResult
    func signup(
        displayName: String,
        username: String,
        password: String,
        school: String,
        studentStatus: String,
        degreeLevel: String,
        semester: Int?,
        graduationYear: Int?
    ) async -> String? {
        guard !isWorking else { return AppLocalization.string( "Please wait…") }
        if let usernameIssue = AuthFieldValidation.usernameIssue(username) {
            return usernameIssue
        }
        if let passwordIssue = AuthFieldValidation.passwordIssue(password) {
            return passwordIssue
        }
        isWorking = true
        issue = nil
        defer { isWorking = false }
        let normalized = AuthFieldValidation.normalizeUsername(username)
        do {
            let _: APIEnvelope<SignupResponseData> = try await apiClient.send(
                "api/auth/signup",
                method: .post,
                body: SignupRequest(
                    displayName: displayName,
                    username: normalized,
                    password: password,
                    school: school,
                    studentStatus: studentStatus,
                    degreeLevel: degreeLevel,
                    semester: semester,
                    graduationYear: graduationYear
                )
            )
            try await performLogin(identifier: normalized, password: password)
            return nil
        } catch {
            let message = AuthIssueMapper.message(for: error)
            issue = message
            return message
        }
    }

    @discardableResult
    func sendPasswordResetOTP(email: String) async -> String? {
        if let emailIssue = AuthFieldValidation.emailIssue(email) {
            return emailIssue
        }
        let normalized = email.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        do {
            let _: APIEnvelope<ForgotPasswordSendOtpData> = try await apiClient.send(
                "api/auth/forgot-password/send-otp",
                method: .post,
                body: ForgotPasswordSendOtpRequest(email: normalized)
            )
            return nil
        } catch {
            return AuthIssueMapper.message(for: error)
        }
    }

    /// Resets password via email OTP, then signs in with native tokens.
    @discardableResult
    func resetPassword(
        email: String,
        code: String,
        password: String,
        confirmPassword: String
    ) async -> String? {
        guard !isWorking else { return AppLocalization.string( "Please wait…") }
        if let emailIssue = AuthFieldValidation.emailIssue(email) {
            return emailIssue
        }
        if let otpIssue = AuthFieldValidation.otpIssue(code) {
            return otpIssue
        }
        if let passwordIssue = AuthFieldValidation.passwordIssue(password) {
            return passwordIssue
        }
        if password != confirmPassword {
            return AppLocalization.string( "Passwords do not match.")
        }
        isWorking = true
        issue = nil
        defer { isWorking = false }
        let normalizedEmail = email.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        let normalizedCode = code.trimmingCharacters(in: .whitespacesAndNewlines)
        do {
            let _: APIEnvelope<ForgotPasswordResetData> = try await apiClient.send(
                "api/auth/forgot-password/reset",
                method: .post,
                body: ForgotPasswordResetRequest(
                    email: normalizedEmail,
                    code: normalizedCode,
                    password: password,
                    confirmPassword: confirmPassword
                )
            )
            try await performLogin(identifier: normalizedEmail, password: password)
            return nil
        } catch {
            let message = AuthIssueMapper.message(for: error)
            issue = message
            return message
        }
    }

    private func performLogin(identifier: String, password: String) async throws {
        sessionEpoch &+= 1
        let epoch = sessionEpoch
        refreshOperation?.task.cancel()
        refreshOperation = nil
        let response: APIEnvelope<AuthPayload> = try await apiClient.send(
            "api/v1/auth/login",
            method: .post,
            body: LoginRequest(identifier: identifier, password: password, device: device)
        )
        try await adopt(response.data, expectedEpoch: epoch)
    }

    func logout() async {
        guard !isWorking else { return }
        isWorking = true
        defer { isWorking = false }
        sessionEpoch &+= 1
        refreshOperation?.task.cancel()
        refreshOperation = nil
        let refreshToken = try? await credentialStore.refreshToken()
        let pushToken = PushDeviceTokenStore.currentToken

        // Local identity must disappear before any network wait. This also
        // prevents a stale screen or refresh response from surviving logout.
        try? await credentialStore.clear()
        currentUser = nil
        accessToken = nil
        isOffline = false
        restorationIssue = nil
        issue = nil
        phase = .signedOut

        if let refreshToken {
            let _: APIEnvelope<LogoutResponse>? = try? await apiClient.send(
                "api/v1/auth/logout",
                method: .post,
                body: LogoutRequest(refreshToken: refreshToken, pushToken: pushToken)
            )
        }
    }

    @discardableResult
    func deleteAccount(confirmUsername: String) async -> String? {
        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("--ui-testing-authenticated") {
            sessionEpoch &+= 1
            refreshOperation?.task.cancel()
            refreshOperation = nil
            try? await credentialStore.clear()
            currentUser = nil
            accessToken = nil
            isOffline = false
            restorationIssue = nil
            phase = .signedOut
            return nil
        }
        #endif

        struct DeleteBody: Encodable, Sendable {
            let confirmUsername: String
        }
        struct DeletePayload: Decodable, Sendable {
            let deleted: Bool
        }

        do {
            let _: APIEnvelope<DeletePayload> = try await sendAuthorized(
                "api/v1/me",
                method: .delete,
                body: DeleteBody(confirmUsername: confirmUsername),
                idempotencyKey: UUID().uuidString
            )
            sessionEpoch &+= 1
            refreshOperation?.task.cancel()
            refreshOperation = nil
            try? await credentialStore.clear()
            currentUser = nil
            accessToken = nil
            isOffline = false
            restorationIssue = nil
            phase = .signedOut
            return nil
        } catch {
            return error.localizedDescription
        }
    }

    func sendAuthorized<Response: Decodable & Sendable>(
        _ path: String,
        method: HTTPMethod = .get,
        body: (any Encodable & Sendable)? = nil,
        queryItems: [URLQueryItem] = [],
        idempotencyKey: String? = nil
    ) async throws -> Response {
        guard phase == .signedIn else {
            throw SessionError.authenticationRequired
        }
        let accessToken = try await authenticatedAccessToken()

        do {
            return try await apiClient.send(
                path,
                method: method,
                body: body,
                queryItems: queryItems,
                accessToken: accessToken,
                idempotencyKey: idempotencyKey
            )
        } catch let error as APIClientError {
            // Always attempt one refresh on 401 — expired access tokens are common on POST too.
            guard error.isUnauthorized else { throw error }
        }

        let refreshedAccessToken = try await refreshAccessToken()
        return try await apiClient.send(
            path,
            method: method,
            body: body,
            queryItems: queryItems,
            accessToken: refreshedAccessToken,
            idempotencyKey: idempotencyKey
        )
    }

    func uploadAuthorized<Response: Decodable & Sendable>(
        _ path: String,
        file: MultipartUploadFile,
        fields: [String: String] = [:],
        idempotencyKey: String
    ) async throws -> Response {
        guard phase == .signedIn else {
            throw SessionError.authenticationRequired
        }
        let accessToken = try await authenticatedAccessToken()

        do {
            return try await apiClient.uploadMultipart(
                path,
                file: file,
                fields: fields,
                accessToken: accessToken,
                idempotencyKey: idempotencyKey
            )
        } catch let error as APIClientError {
            guard error.isUnauthorized else { throw error }
        }

        let refreshedAccessToken = try await refreshAccessToken()
        return try await apiClient.uploadMultipart(
            path,
            file: file,
            fields: fields,
            accessToken: refreshedAccessToken,
            idempotencyKey: idempotencyKey
        )
    }

    private func refresh(using token: String, expectedEpoch: UInt64) async throws {
        let response: APIEnvelope<AuthPayload> = try await apiClient.send(
            "api/v1/auth/refresh",
            method: .post,
            body: RefreshRequest(refreshToken: token, device: device)
        )
        try await adopt(response.data, expectedEpoch: expectedEpoch)
    }

    private func refreshAccessToken() async throws -> String {
        let operation: (id: UUID, epoch: UInt64, task: Task<AuthPayload, Error>)
        if let existing = refreshOperation {
            operation = existing
        } else {
            let credentialStore = credentialStore
            let apiClient = apiClient
            let device = device
            let epoch = sessionEpoch
            let task = Task<AuthPayload, Error> {
                guard let refreshToken = try await credentialStore.refreshToken() else {
                    throw SessionError.authenticationRequired
                }
                let response: APIEnvelope<AuthPayload> = try await apiClient.send(
                    "api/v1/auth/refresh",
                    method: .post,
                    body: RefreshRequest(refreshToken: refreshToken, device: device)
                )
                return response.data
            }
            operation = (UUID(), epoch, task)
            refreshOperation = operation
        }

        do {
            let payload = try await operation.task.value
            try await adopt(payload, expectedEpoch: operation.epoch)
            if refreshOperation?.id == operation.id {
                refreshOperation = nil
            }
            return payload.tokens.accessToken
        } catch {
            if refreshOperation?.id == operation.id {
                refreshOperation = nil
            }
            guard sessionEpoch == operation.epoch else {
                throw CancellationError()
            }
            accessToken = nil
            if Self.invalidatesCredentials(error) {
                await invalidateLocalSession(expectedEpoch: operation.epoch)
            } else {
                isOffline = true
                restorationIssue = AppLocalization.string(
                    "Couldn't connect. Your saved data is still available."
                )
                if currentUser != nil {
                    phase = .signedIn
                }
            }
            throw error
        }
    }

    private func authenticatedAccessToken() async throws -> String {
        if let accessToken { return accessToken }
        guard currentUser != nil else { throw SessionError.authenticationRequired }
        return try await refreshAccessToken()
    }

    private func adopt(_ payload: AuthPayload, expectedEpoch: UInt64) async throws {
        guard sessionEpoch == expectedEpoch else { throw CancellationError() }
        try await credentialStore.save(refreshToken: payload.tokens.refreshToken)
        try await credentialStore.saveCachedUser(payload.user)
        guard sessionEpoch == expectedEpoch else { throw CancellationError() }
        accessToken = payload.tokens.accessToken
        currentUser = payload.user
        isOffline = false
        restorationIssue = nil
        phase = .signedIn
    }

    private func invalidateLocalSession(expectedEpoch: UInt64) async {
        guard sessionEpoch == expectedEpoch else { return }
        try? await credentialStore.clear()
        guard sessionEpoch == expectedEpoch else { return }
        currentUser = nil
        accessToken = nil
        isOffline = false
        restorationIssue = nil
        phase = .signedOut
    }

    private nonisolated static func invalidatesCredentials(_ error: Error) -> Bool {
        if error is SessionError { return true }
        return (error as? APIClientError)?.isUnauthorized == true
    }

    #if DEBUG
    func installUITestingSession() {
        sessionEpoch &+= 1
        refreshOperation?.task.cancel()
        refreshOperation = nil
        currentUser = Self.uiTestingUser
        accessToken = "ui-test-access-token"
        isOffline = false
        restorationIssue = nil
        phase = .signedIn
    }

    func installUITestingSlowCachedLaunchState() {
        sessionEpoch &+= 1
        refreshOperation?.task.cancel()
        refreshOperation = nil
        currentUser = Self.uiTestingUser
        accessToken = nil
        isOffline = false
        restorationIssue = nil
        phase = .restoring
    }

    func installUITestingOfflineCachedLaunchState() {
        sessionEpoch &+= 1
        refreshOperation?.task.cancel()
        refreshOperation = nil
        currentUser = Self.uiTestingUser
        accessToken = nil
        isOffline = true
        restorationIssue = AppLocalization.string(
            "Couldn't connect. Your saved data is still available."
        )
        phase = .signedIn
    }

    private static let uiTestingUser = CurrentUser(
            id: "ui-test-user",
            username: "test_001",
            nickname: "Test User",
            email: nil,
            phone: nil,
            avatarUrl: nil,
            tagline: nil,
            school: "TUM",
            studentStatus: "CURRENT_STUDENT",
            degreeLevel: nil,
            major: nil,
            semester: nil,
            graduationYear: nil,
            gender: "UNSPECIFIED",
            onboardingComplete: true,
            isGuest: false,
            verifiedStudent: true,
            studentVerificationStatus: "VERIFIED",
            usernameUpdatedAt: nil,
            productTutorialDismissedAt: "2026-01-01T00:00:00.000Z",
            locale: "en"
        )

    func installUITestingSignedOutState() {
        sessionEpoch &+= 1
        refreshOperation?.task.cancel()
        refreshOperation = nil
        currentUser = nil
        accessToken = nil
        isOffline = false
        restorationIssue = nil
        phase = .signedOut
    }
    #endif
}

enum SessionError: LocalizedError, Sendable {
    case authenticationRequired

    var errorDescription: String? {
        "Please sign in again."
    }
}

private struct LogoutResponse: Decodable, Sendable {
    let revoked: Bool
}
