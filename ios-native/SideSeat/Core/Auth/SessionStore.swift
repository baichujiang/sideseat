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
    private var refreshOperation: (id: UUID, task: Task<AuthPayload, Error>)?

    private(set) var phase: SessionPhase = .restoring
    private(set) var currentUser: CurrentUser?
    private(set) var accessToken: String?
    private(set) var isWorking = false
    var issue: String?

    /// Access token for long-lived SSE; callers must handle 401 by restarting after refresh.
    var accessTokenForStreaming: String? { accessToken }

    func applyCurrentUser(_ user: CurrentUser) {
        currentUser = user
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
        do {
            guard let token = try await credentialStore.refreshToken() else {
                phase = .signedOut
                return
            }
            try await refresh(using: token)
        } catch {
            try? await credentialStore.clear()
            currentUser = nil
            accessToken = nil
            phase = .signedOut
        }
    }

    func login(identifier: String, password: String) async {
        guard !isWorking else { return }
        isWorking = true
        issue = nil
        defer { isWorking = false }
        do {
            try await performLogin(identifier: identifier, password: password)
        } catch {
            issue = AuthIssueMapper.message(for: error)
        }
    }

    /// Creates an account via legacy signup, then exchanges for native tokens via v1 login.
    @discardableResult
    func signup(username: String, password: String) async -> String? {
        guard !isWorking else { return String(localized: "Please wait…") }
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
                body: SignupRequest(username: normalized, password: password)
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
        guard !isWorking else { return String(localized: "Please wait…") }
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
            return String(localized: "Passwords do not match.")
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
        let response: APIEnvelope<AuthPayload> = try await apiClient.send(
            "api/v1/auth/login",
            method: .post,
            body: LoginRequest(identifier: identifier, password: password, device: device)
        )
        try await adopt(response.data)
    }

    func logout() async {
        guard !isWorking else { return }
        isWorking = true
        defer { isWorking = false }
        refreshOperation?.task.cancel()
        refreshOperation = nil
        let refreshToken = try? await credentialStore.refreshToken()
        if let refreshToken {
            let _: APIEnvelope<LogoutResponse>? = try? await apiClient.send(
                "api/v1/auth/logout",
                method: .post,
                body: LogoutRequest(refreshToken: refreshToken)
            )
        }
        try? await credentialStore.clear()
        currentUser = nil
        accessToken = nil
        issue = nil
        phase = .signedOut
    }

    @discardableResult
    func deleteAccount(confirmUsername: String) async -> String? {
        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("--ui-testing-authenticated") {
            try? await credentialStore.clear()
            currentUser = nil
            accessToken = nil
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
            try? await credentialStore.clear()
            currentUser = nil
            accessToken = nil
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
        guard phase == .signedIn, let accessToken else {
            throw SessionError.authenticationRequired
        }

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
        guard phase == .signedIn, let accessToken else {
            throw SessionError.authenticationRequired
        }

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

    private func refresh(using token: String) async throws {
        let response: APIEnvelope<AuthPayload> = try await apiClient.send(
            "api/v1/auth/refresh",
            method: .post,
            body: RefreshRequest(refreshToken: token, device: device)
        )
        try await adopt(response.data)
    }

    private func refreshAccessToken() async throws -> String {
        let operation: (id: UUID, task: Task<AuthPayload, Error>)
        if let existing = refreshOperation {
            operation = existing
        } else {
            let credentialStore = credentialStore
            let apiClient = apiClient
            let device = device
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
            operation = (UUID(), task)
            refreshOperation = operation
        }

        do {
            let payload = try await operation.task.value
            try await adopt(payload)
            if refreshOperation?.id == operation.id {
                refreshOperation = nil
            }
            return payload.tokens.accessToken
        } catch {
            if refreshOperation?.id == operation.id {
                refreshOperation = nil
            }
            try? await credentialStore.clear()
            currentUser = nil
            accessToken = nil
            phase = .signedOut
            throw error
        }
    }

    private func adopt(_ payload: AuthPayload) async throws {
        try await credentialStore.save(refreshToken: payload.tokens.refreshToken)
        accessToken = payload.tokens.accessToken
        currentUser = payload.user
        phase = .signedIn
    }

    #if DEBUG
    func installUITestingSession() {
        currentUser = CurrentUser(
            id: "ui-test-user",
            username: "test_001",
            nickname: "Test User",
            email: nil,
            phone: nil,
            avatarUrl: nil,
            tagline: nil,
            school: "TUM",
            degreeLevel: nil,
            major: nil,
            semester: nil,
            gender: "UNSPECIFIED",
            onboardingComplete: true,
            isGuest: false,
            verifiedStudent: true,
            studentVerificationStatus: "VERIFIED",
            usernameUpdatedAt: nil,
            productTutorialDismissedAt: "2026-01-01T00:00:00.000Z",
            locale: "en"
        )
        accessToken = "ui-test-access-token"
        phase = .signedIn
    }

    func installUITestingSignedOutState() {
        currentUser = nil
        accessToken = nil
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
