import Foundation
import Security

protocol CredentialStore: Sendable {
    func refreshToken() async throws -> String?
    func save(refreshToken: String) async throws
    func cachedUser() async throws -> CurrentUser?
    func saveCachedUser(_ user: CurrentUser) async throws
    func clear() async throws
}

extension CredentialStore {
    func cachedUser() async throws -> CurrentUser? { nil }
    func saveCachedUser(_ user: CurrentUser) async throws {}
}

actor KeychainCredentialStore: CredentialStore {
    private let service: String
    private let refreshTokenAccount = "native-refresh-token"
    private let currentUserAccount = "native-current-user"

    init(service: String) {
        self.service = service
    }

    func refreshToken() throws -> String? {
        guard let data = try data(for: refreshTokenAccount) else { return nil }
        return String(data: data, encoding: .utf8)
    }

    func save(refreshToken: String) throws {
        guard let data = refreshToken.data(using: .utf8) else {
            throw CredentialStoreError.encoding
        }
        try save(data, for: refreshTokenAccount)
    }

    func cachedUser() throws -> CurrentUser? {
        guard let data = try data(for: currentUserAccount) else { return nil }
        do {
            return try JSONDecoder().decode(CurrentUser.self, from: data)
        } catch {
            try? delete(account: currentUserAccount)
            return nil
        }
    }

    func saveCachedUser(_ user: CurrentUser) throws {
        do {
            try save(JSONEncoder().encode(user), for: currentUserAccount)
        } catch is EncodingError {
            throw CredentialStoreError.encoding
        }
    }

    func clear() throws {
        try delete(account: refreshTokenAccount)
        try delete(account: currentUserAccount)
    }

    private func data(for account: String) throws -> Data? {
        var query = baseQuery(account: account)
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne
        var result: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        if status == errSecItemNotFound { return nil }
        guard status == errSecSuccess, let data = result as? Data else {
            throw CredentialStoreError.keychain(status)
        }
        return data
    }

    private func save(_ data: Data, for account: String) throws {
        let baseQuery = baseQuery(account: account)
        let attributes = [kSecValueData as String: data]
        let updateStatus = SecItemUpdate(baseQuery as CFDictionary, attributes as CFDictionary)
        if updateStatus == errSecItemNotFound {
            var query = baseQuery
            query[kSecValueData as String] = data
            query[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
            let addStatus = SecItemAdd(query as CFDictionary, nil)
            guard addStatus == errSecSuccess else {
                throw CredentialStoreError.keychain(addStatus)
            }
        } else if updateStatus != errSecSuccess {
            throw CredentialStoreError.keychain(updateStatus)
        }
    }

    private func delete(account: String) throws {
        let status = SecItemDelete(baseQuery(account: account) as CFDictionary)
        guard status == errSecSuccess || status == errSecItemNotFound else {
            throw CredentialStoreError.keychain(status)
        }
    }

    private func baseQuery(account: String) -> [String: Any] {
        [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecUseDataProtectionKeychain as String: true,
        ]
    }
}

#if DEBUG
actor EphemeralCredentialStore: CredentialStore {
    private var token: String?
    private var user: CurrentUser?

    func refreshToken() -> String? {
        token
    }

    func save(refreshToken: String) {
        token = refreshToken
    }

    func cachedUser() async throws -> CurrentUser? {
        user
    }

    func saveCachedUser(_ user: CurrentUser) async throws {
        self.user = user
    }

    func clear() {
        token = nil
        user = nil
    }
}

/// Prefers Keychain, but falls back to in-memory storage when the Simulator
/// returns `errSecMissingEntitlement` (-34018) — common for unsigned or
/// "Sign to Run Locally" installs without a development team.
actor ResilientCredentialStore: CredentialStore {
    private let keychain: KeychainCredentialStore
    private let ephemeral = EphemeralCredentialStore()
    private var useEphemeral = false

    init(service: String) {
        keychain = KeychainCredentialStore(service: service)
    }

    func refreshToken() async throws -> String? {
        if useEphemeral { return await ephemeral.refreshToken() }
        do {
            return try await keychain.refreshToken()
        } catch let CredentialStoreError.keychain(status) where status == errSecMissingEntitlement {
            useEphemeral = true
            return await ephemeral.refreshToken()
        }
    }

    func save(refreshToken: String) async throws {
        if useEphemeral {
            await ephemeral.save(refreshToken: refreshToken)
            return
        }
        do {
            try await keychain.save(refreshToken: refreshToken)
        } catch let CredentialStoreError.keychain(status) where status == errSecMissingEntitlement {
            useEphemeral = true
            await ephemeral.save(refreshToken: refreshToken)
        }
    }

    func cachedUser() async throws -> CurrentUser? {
        if useEphemeral { return try await ephemeral.cachedUser() }
        do {
            return try await keychain.cachedUser()
        } catch let CredentialStoreError.keychain(status) where status == errSecMissingEntitlement {
            useEphemeral = true
            return try await ephemeral.cachedUser()
        }
    }

    func saveCachedUser(_ user: CurrentUser) async throws {
        if useEphemeral {
            try await ephemeral.saveCachedUser(user)
            return
        }
        do {
            try await keychain.saveCachedUser(user)
        } catch let CredentialStoreError.keychain(status) where status == errSecMissingEntitlement {
            useEphemeral = true
            try await ephemeral.saveCachedUser(user)
        }
    }

    func clear() async throws {
        if useEphemeral {
            await ephemeral.clear()
            return
        }
        do {
            try await keychain.clear()
        } catch let CredentialStoreError.keychain(status) where status == errSecMissingEntitlement {
            useEphemeral = true
            await ephemeral.clear()
        }
    }
}
#endif

enum CredentialStoreError: LocalizedError {
    case encoding
    case keychain(OSStatus)

    var errorDescription: String? {
        switch self {
        case .encoding:
            "The secure credential could not be encoded."
        case .keychain(let status):
            "Keychain operation failed (\(status))."
        }
    }
}
