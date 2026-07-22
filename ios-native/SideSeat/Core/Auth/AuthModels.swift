import Foundation
import UIKit

struct NativeDevice: Codable, Sendable {
    let id: String
    let name: String
    let appVersion: String
    let platformVersion: String

    @MainActor
    static var current: NativeDevice {
        let defaultsKey = "app.sideseat.native-device-id"
        let defaults = UserDefaults.standard
        let identifier: String
        if let stored = defaults.string(forKey: defaultsKey) {
            identifier = stored
        } else {
            identifier = UUID().uuidString
            defaults.set(identifier, forKey: defaultsKey)
        }
        let bundle = Bundle.main
        return NativeDevice(
            id: identifier,
            name: UIDevice.current.name,
            appVersion: bundle.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "0",
            platformVersion: UIDevice.current.systemVersion
        )
    }
}

struct LoginRequest: Encodable, Sendable {
    let identifier: String
    let password: String
    let device: NativeDevice
}

struct SignupRequest: Encodable, Sendable {
    let username: String
    let password: String
}

struct SignupResponseData: Decodable, Sendable {
    let userId: String
}

struct ForgotPasswordSendOtpRequest: Encodable, Sendable {
    let email: String
}

struct ForgotPasswordSendOtpData: Decodable, Sendable {
    let sent: Bool
}

struct ForgotPasswordResetRequest: Encodable, Sendable {
    let email: String
    let code: String
    let password: String
    let confirmPassword: String
}

struct ForgotPasswordResetData: Decodable, Sendable {
    let userId: String
}

struct RefreshRequest: Encodable, Sendable {
    let refreshToken: String
    let device: NativeDevice
}

struct LogoutRequest: Encodable, Sendable {
    let refreshToken: String
}

enum AuthIssueMapper {
    static func message(for error: Error) -> String {
        if let api = error as? APIClientError {
            switch api {
            case .server(_, let payload):
                return friendlyMessage(code: payload.code, fallback: payload.message)
            case .transport:
                return String(localized: "The network connection failed. Please try again.")
            case .decoding, .invalidResponse:
                return String(localized: "Something went wrong. Please try again.")
            }
        }
        return error.localizedDescription
    }

    private static func friendlyMessage(code: String, fallback: String) -> String {
        switch code {
        case "INVALID_CREDENTIALS":
            return String(localized: "Incorrect username or password.")
        case "USERNAME_TAKEN", "SIGNUP_USERNAME_TAKEN":
            return String(localized: "That username is already taken.")
        case "CODE_INVALID", "OTP_INVALID", "PASSWORD_RESET_CODE_INVALID":
            return String(localized: "Invalid or expired verification code.")
        case "RATE_LIMITED", "TOO_MANY_REQUESTS", "EMAIL_OTP_RATE_LIMITED":
            return String(localized: "Too many attempts. Please wait a moment and try again.")
        case "DB_UNAVAILABLE", "DB_SCHEMA",
             "SIGNUP_DB_UNAVAILABLE", "PASSWORD_RESET_DB_UNAVAILABLE", "PASSWORD_RESET_DB_SCHEMA",
             "EMAIL_OTP_DB_UNAVAILABLE", "EMAIL_OTP_DB_SCHEMA":
            return String(localized: "The service is temporarily unavailable. Please try again shortly.")
        case "EMAIL_OTP_EMAIL_NOT_CONFIGURED", "EMAIL_OTP_EMAIL_SEND_FAILED":
            return String(localized: "We couldn't send the email right now. Please try again shortly.")
        default:
            return fallback
        }
    }
}

enum AuthFieldValidation {
    static func normalizeUsername(_ raw: String) -> String {
        raw.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    }

    static func usernameIssue(_ raw: String) -> String? {
        let value = normalizeUsername(raw)
        if value.count < 2 {
            return String(localized: "Username must be at least 2 characters.")
        }
        if value.count > 32 {
            return String(localized: "Username must be at most 32 characters.")
        }
        guard value.range(of: "^[a-z0-9_-]+$", options: .regularExpression) != nil else {
            return String(localized: "Use only letters, numbers, underscores, and hyphens.")
        }
        if value.hasPrefix("guest_") {
            return String(localized: "This username is reserved.")
        }
        return nil
    }

    static func passwordIssue(_ raw: String) -> String? {
        if raw.count < 8 {
            return String(localized: "Password must be at least 8 characters.")
        }
        return nil
    }

    static func emailIssue(_ raw: String) -> String? {
        let value = raw.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        if value.count < 3 {
            return String(localized: "Enter your email.")
        }
        guard value.range(of: "^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$", options: .regularExpression) != nil else {
            return String(localized: "Enter a valid email address.")
        }
        return nil
    }

    static func otpIssue(_ raw: String) -> String? {
        let value = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard value.range(of: "^\\d{6}$", options: .regularExpression) != nil else {
            return String(localized: "Enter the 6-digit verification code.")
        }
        return nil
    }
}

struct AuthPayload: Decodable, Sendable {
    let user: CurrentUser
    let tokens: AuthTokens
}

struct AuthTokens: Decodable, Sendable {
    let accessToken: String
    let accessExpiresIn: Int
    let refreshToken: String
    let refreshExpiresAt: String
}

struct CurrentUser: Codable, Hashable, Sendable {
    let id: String
    let username: String
    let nickname: String?
    let email: String?
    let phone: String?
    let avatarUrl: String?
    let tagline: String?
    let school: String?
    let degreeLevel: String?
    let major: String?
    let semester: Int?
    let gender: String
    let onboardingComplete: Bool
    let isGuest: Bool
    let verifiedStudent: Bool
    let studentVerificationStatus: String
    let usernameUpdatedAt: String?
    let productTutorialDismissedAt: String?
    let locale: String

    var displayName: String {
        let trimmed = nickname?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        return trimmed.isEmpty ? username : trimmed
    }
}
