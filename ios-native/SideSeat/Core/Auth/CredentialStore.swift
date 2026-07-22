import Foundation
import Security

protocol CredentialStore: Sendable {
    func refreshToken() async throws -> String?
    func save(refreshToken: String) async throws
    func clear() async throws
}

actor KeychainCredentialStore: CredentialStore {
    private let service: String
    private let account = "native-refresh-token"

    init(service: String) {
        self.service = service
    }

    func refreshToken() throws -> String? {
        var query = baseQuery
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne
        var result: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        if status == errSecItemNotFound { return nil }
        guard status == errSecSuccess, let data = result as? Data else {
            throw CredentialStoreError.keychain(status)
        }
        return String(data: data, encoding: .utf8)
    }

    func save(refreshToken: String) throws {
        guard let data = refreshToken.data(using: .utf8) else {
            throw CredentialStoreError.encoding
        }
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

    func clear() throws {
        let status = SecItemDelete(baseQuery as CFDictionary)
        guard status == errSecSuccess || status == errSecItemNotFound else {
            throw CredentialStoreError.keychain(status)
        }
    }

    private var baseQuery: [String: Any] {
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
