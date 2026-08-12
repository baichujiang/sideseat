import Foundation
import Observation

@MainActor
@Observable
final class ContactsStore {
    private(set) var contacts: [NativeContactRow] = []
    private(set) var searchHits: [NativeContactSearchHit] = []
    private(set) var isLoading = false
    private(set) var hasLoaded = false
    private(set) var isSearching = false
    private(set) var isMutating = false
    private(set) var issue: String?
    var searchQuery = ""

    func load(using session: SessionStore) async {
        isLoading = true
        issue = nil
        defer {
            isLoading = false
            hasLoaded = true
        }

        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("--ui-testing-authenticated") {
            contacts = Self.uiTestingContacts
            return
        }
        #endif

        do {
            let response: APIEnvelope<NativeContactsPayload> = try await session.sendAuthorized("api/v1/contacts")
            contacts = response.data.contacts
        } catch {
            issue = error.localizedDescription
        }
    }

    func search(using session: SessionStore) async {
        let query = searchQuery.trimmingCharacters(in: .whitespacesAndNewlines)
        guard query.count >= 2 else {
            searchHits = []
            return
        }
        isSearching = true
        defer { isSearching = false }

        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("--ui-testing-authenticated") {
            searchHits = Self.uiTestingContacts.map {
                NativeContactSearchHit(
                    id: $0.peer.id,
                    username: $0.peer.username,
                    nickname: $0.peer.nickname,
                    gender: nil,
                    avatarUrl: $0.peer.avatarUrl,
                    major: nil,
                    school: nil,
                    activeConnectionId: $0.connectionId
                )
            }.filter {
                $0.displayName.lowercased().contains(query.lowercased())
                    || $0.username.lowercased().contains(query.lowercased())
            }
            return
        }
        #endif

        do {
            let response: APIEnvelope<NativeContactSearchPayload> = try await session.sendAuthorized(
                "api/v1/contacts/search",
                queryItems: [URLQueryItem(name: "q", value: query)]
            )
            searchHits = response.data.hits
        } catch {
            issue = error.localizedDescription
        }
    }

    @discardableResult
    func add(peerID: String, using session: SessionStore) async -> String? {
        guard !isMutating else { return nil }
        isMutating = true
        issue = nil
        defer { isMutating = false }

        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("--ui-testing-authenticated") {
            return "ui-connection"
        }
        #endif

        do {
            let response: APIEnvelope<NativeContactAddResult> = try await session.sendAuthorized(
                "api/v1/contacts",
                method: .post,
                body: NativeContactAddRequest(peerId: peerID),
                idempotencyKey: UUID().uuidString
            )
            await load(using: session)
            return response.data.connectionId
        } catch {
            issue = error.localizedDescription
            return nil
        }
    }

    private static var uiTestingContacts: [NativeContactRow] {
        #if DEBUG
        UITestingChatFixtures.contacts
        #else
        []
        #endif
    }
}
