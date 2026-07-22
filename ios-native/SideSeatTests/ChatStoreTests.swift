import Foundation
import Testing
@testable import SideSeat

@Suite("Chat scroll policy")
struct ChatScrollPolicyTests {
    private let me = NativeChatAuthor(id: "me", username: "me", nickname: "Me", avatarUrl: nil)
    private let peer = NativeChatAuthor(id: "peer", username: "peer", nickname: "Peer", avatarUrl: nil)

    @Test("Own message always scrolls to bottom")
    func ownMessageScrolls() {
        let previous = Set(["1"])
        let next = [
            message(id: "1", sender: peer),
            message(id: "2", sender: me)
        ]
        let decision = ChatScrollPolicy.decision(
            previousIDs: previous,
            nextMessages: next,
            currentUserID: me.id,
            isNearBottom: false
        )
        #expect(decision == .scrollToBottom(animated: true))
    }

    @Test("Remote message near bottom scrolls without animation")
    func remoteNearBottomScrolls() {
        let previous = Set(["1"])
        let next = [
            message(id: "1", sender: me),
            message(id: "2", sender: peer)
        ]
        let decision = ChatScrollPolicy.decision(
            previousIDs: previous,
            nextMessages: next,
            currentUserID: me.id,
            isNearBottom: true
        )
        #expect(decision == .scrollToBottom(animated: false))
    }

    @Test("Remote message while scrolled up retains position")
    func remoteWhileScrolledUpRetains() {
        let previous = Set(["1"])
        let next = [
            message(id: "1", sender: me),
            message(id: "2", sender: peer),
            message(id: "3", sender: peer)
        ]
        let decision = ChatScrollPolicy.decision(
            previousIDs: previous,
            nextMessages: next,
            currentUserID: me.id,
            isNearBottom: false
        )
        #expect(decision == .retainPosition(newRemoteCount: 2))
    }

    @Test("Pagination ignore helper returns none")
    func paginationIgnored() {
        #expect(ChatScrollPolicy.decisionIgnoringPagination() == .none)
    }

    @Test("Unread jump shows only when unread exceeds one screen")
    func unreadJumpThreshold() {
        #expect(ChatUnreadJumpPolicy.shouldShowJump(unreadCount: 8) == false)
        #expect(ChatUnreadJumpPolicy.shouldShowJump(unreadCount: 9) == true)
    }

    @Test("Unread jump targets oldest among latest unread from others")
    func unreadJumpFirstMessage() {
        let messages = [
            (id: "1", senderID: peer.id),
            (id: "2", senderID: me.id),
            (id: "3", senderID: peer.id),
            (id: "4", senderID: peer.id),
            (id: "5", senderID: peer.id)
        ]
        let first = ChatUnreadJumpPolicy.firstUnreadMessageID(
            messages: messages,
            unreadCount: 2,
            currentUserID: me.id
        )
        #expect(first == "4")
    }

    @Test("Inbox activity labels prefer relative day cues")
    func inboxActivityLabels() throws {
        let calendar = Calendar(identifier: .gregorian)
        let now = try #require(
            calendar.date(from: DateComponents(year: 2026, month: 7, day: 18, hour: 15))
        )
        let earlierToday = try #require(calendar.date(byAdding: .hour, value: -2, to: now))
        let yesterday = try #require(calendar.date(byAdding: .day, value: -1, to: now))
        let lastWeek = try #require(calendar.date(byAdding: .day, value: -3, to: now))
        let older = try #require(calendar.date(byAdding: .day, value: -20, to: now))

        #expect(InboxActivityFormatting.label(for: earlierToday, now: now, calendar: calendar).contains(":"))
        #expect(InboxActivityFormatting.label(for: yesterday, now: now, calendar: calendar) == "Yesterday")
        #expect(!InboxActivityFormatting.label(for: lastWeek, now: now, calendar: calendar).contains(":"))
        #expect(InboxActivityFormatting.label(for: older, now: now, calendar: calendar).contains("2026")
            || InboxActivityFormatting.label(for: older, now: now, calendar: calendar).contains("Jun")
            || InboxActivityFormatting.label(for: older, now: now, calendar: calendar).contains("6"))
    }

    private func message(id: String, sender: NativeChatAuthor) -> NativeDirectMessage {
        NativeDirectMessage(
            id: id,
            connectionId: "c1",
            sender: sender,
            type: "TEXT",
            body: "hi",
            createdAt: "2026-07-17T12:00:00.000Z"
        )
    }
}

@Suite("Unreplied direct message limit")
struct UnrepliedDirectMessageLimitTests {
    private let me = NativeChatAuthor(id: "me", username: "me", nickname: "Me", avatarUrl: nil)
    private let peer = NativeChatAuthor(id: "peer", username: "peer", nickname: "Peer", avatarUrl: nil)

    @Test("Counts consecutive unreplied viewer messages")
    func countsUnrepliedStreak() {
        let newestFirst = [
            message(id: "3", sender: me),
            message(id: "2", sender: me),
            message(id: "1", sender: peer),
        ]
        #expect(
            DirectChatStore.countUnrepliedStreak(
                messagesNewestFirst: newestFirst,
                viewerID: me.id,
                peerID: peer.id
            ) == 2
        )
    }

    @Test("Resets after a peer reply")
    func resetsAfterPeerReply() {
        let newestFirst = [
            message(id: "3", sender: me),
            message(id: "2", sender: peer),
            message(id: "1", sender: me),
        ]
        #expect(
            DirectChatStore.countUnrepliedStreak(
                messagesNewestFirst: newestFirst,
                viewerID: me.id,
                peerID: peer.id
            ) == 1
        )
    }

    private func message(id: String, sender: NativeChatAuthor) -> NativeDirectMessage {
        NativeDirectMessage(
            id: id,
            connectionId: "c1",
            sender: sender,
            type: "TEXT",
            body: "hi",
            createdAt: "2026-07-17T12:00:00.000Z"
        )
    }
}

@Suite("Chat SSE client")
struct ChatSSEClientTests {
    @Test("Parses multi-line SSE blocks across chunks")
    func parsesAcrossChunks() {
        var partial = ""
        let first = ChatSSEClient.parse("id: cursor-1\nevent: message\ndata: {\"ok\":true", carrying: &partial)
        #expect(first.isEmpty)
        let second = ChatSSEClient.parse("}\n\n", carrying: &partial)
        #expect(second.count == 1)
        #expect(second[0].id == "cursor-1")
        #expect(second[0].event == "message")
        #expect(second[0].data == #"{"ok":true}"#)
        #expect(partial.isEmpty)
    }
}

@Suite("Inbox store")
struct InboxStoreTests {
    @Test("Loads merged inbox conversations")
    @MainActor
    func loadsInbox() async throws {
        let transport = ChatTestTransport()
        let session = SessionStore(
            apiClient: APIClient(
                environment: AppEnvironment(
                    deployment: .development,
                    apiBaseURL: URL(string: "https://api.sideseat.test")!,
                    bundleIdentifier: "app.sideseat.mobile.tests",
                    appVersion: "1.0.0",
                    buildNumber: "1"
                ),
                transport: transport
            ),
            credentialStore: ChatMemoryCredentialStore(),
            device: NativeDevice(
                id: "chat-device",
                name: "Chat iPhone",
                appVersion: "1.0.0",
                platformVersion: "26.5"
            )
        )
        await session.login(identifier: "test_001", password: "Password123")

        let store = InboxStore()
        await store.load(using: session)
        #expect(store.payload?.conversations.count == 3)
        #expect(store.pinned.count == 1)
        #expect(store.pinned.first?.displayName == "Mina")
        #expect(store.pinned.first?.route == .directChat(connectionID: "connection-1"))
        #expect(store.recent.count == 2)
    }

    @Test("Filters conversations with client search")
    @MainActor
    func filtersSearch() async throws {
        let transport = ChatTestTransport()
        let session = try await chatSession(transport: transport)
        let store = InboxStore()
        await store.load(using: session)

        store.searchQuery = "algorithms"
        #expect(store.filteredConversations.map(\.id) == ["course-1"])
        #expect(store.hasNoSearchMatches == false)

        store.searchQuery = "zzzz-no-match"
        #expect(store.filteredConversations.isEmpty)
        #expect(store.hasNoSearchMatches)
    }

    @Test("Toggles pin and hides course rows")
    @MainActor
    func pinAndHide() async throws {
        let transport = ChatTestTransport()
        let session = try await chatSession(transport: transport)
        let store = InboxStore()
        await store.load(using: session)

        let direct = try #require(store.payload?.conversations.first { $0.id == "connection-1" })
        let pinned = await store.togglePin(direct, using: session)
        #expect(pinned)
        #expect(store.payload?.conversations.first { $0.id == "connection-1" }?.pinned == false)
        #expect(await transport.pinnedPaths.contains("/api/v1/connections/connection-1/pin"))

        let course = try #require(store.payload?.conversations.first { $0.id == "course-1" })
        let hidden = await store.hide(course, using: session)
        #expect(hidden)
        #expect(store.payload?.conversations.contains(where: { $0.id == "course-1" }) == false)
        #expect(await transport.hiddenPaths.contains("/api/v1/courses/course-1/inbox-hide"))
    }

    @MainActor
    private func chatSession(transport: ChatTestTransport) async throws -> SessionStore {
        let session = SessionStore(
            apiClient: APIClient(
                environment: AppEnvironment(
                    deployment: .development,
                    apiBaseURL: URL(string: "https://api.sideseat.test")!,
                    bundleIdentifier: "app.sideseat.mobile.tests",
                    appVersion: "1.0.0",
                    buildNumber: "1"
                ),
                transport: transport
            ),
            credentialStore: ChatMemoryCredentialStore(),
            device: NativeDevice(
                id: "chat-device",
                name: "Chat iPhone",
                appVersion: "1.0.0",
                platformVersion: "26.5"
            )
        )
        await session.login(identifier: "test_001", password: "Password123")
        return session
    }
}

@Suite("Inbox chat search")
struct InboxChatSearchTests {
    @Test("Matches course code and peer nickname")
    func matchesHaystack() {
        let course = NativeInboxPayload.uiTestingFixture.conversations.first { $0.kind == .course }!
        #expect(InboxChatSearch.matches(course, query: "IN0007"))
        #expect(InboxChatSearch.matches(course, query: "  algorithms "))
        let direct = NativeInboxPayload.uiTestingFixture.conversations.first { $0.kind == .direct }!
        #expect(InboxChatSearch.matches(direct, query: "mina"))
        #expect(!InboxChatSearch.matches(direct, query: "nope"))
    }
}

@Suite("Chat thread search rows")
struct ChatThreadSearchRowTests {
    @Test("Builds searchable rows for card message types")
    func cardRows() {
        let peer = NativeChatAuthor(id: "p", username: "peer", nickname: "Peer", avatarUrl: nil)
        let schedule = NativeDirectMessage(
            id: "m1",
            connectionId: "c1",
            sender: peer,
            type: "SCHEDULE_SHARE_CARD",
            body: "https://example.test/s/token",
            createdAt: "2026-07-17T12:00:00.000Z"
        )
        let row = ChatThreadSearchRow.from(schedule)
        #expect(row.preview == "Shared schedule")
        #expect(row.matches(query: "schedule"))
        #expect(!row.matches(query: "zzzz"))
    }
}

@Suite("Direct chat store")
struct DirectChatStoreTests {
    @Test("Loads history and sends optimistic text")
    @MainActor
    func loadsAndSends() async throws {
        let transport = ChatTestTransport()
        let session = SessionStore(
            apiClient: APIClient(
                environment: AppEnvironment(
                    deployment: .development,
                    apiBaseURL: URL(string: "https://api.sideseat.test")!,
                    bundleIdentifier: "app.sideseat.mobile.tests",
                    appVersion: "1.0.0",
                    buildNumber: "1"
                ),
                transport: transport
            ),
            credentialStore: ChatMemoryCredentialStore(),
            device: NativeDevice(
                id: "chat-device",
                name: "Chat iPhone",
                appVersion: "1.0.0",
                platformVersion: "26.5"
            )
        )
        await session.login(identifier: "test_001", password: "Password123")

        let store = DirectChatStore()
        await store.load(
            connectionID: "connection-1",
            using: session,
            apiBaseURL: URL(string: "https://api.sideseat.test")!,
            enableRealtime: false
        )

        #expect(store.conversation?.displayName == "Mina")
        #expect(store.messages.count == 1)
        #expect(await transport.readMarked)

        let ok = await store.sendText("Hello Mina", using: session)
        #expect(ok)
        #expect(store.messages.contains(where: { $0.body == "Hello Mina" && !$0.id.hasPrefix("local-") }))
        #expect(await transport.sentBodies.contains("Hello Mina"))
        #expect(await transport.writeKeys.count == 1)
    }

    @Test("Sends a reply with replyToId and soft-deletes own messages")
    @MainActor
    func repliesAndDeletes() async throws {
        let transport = ChatTestTransport()
        let session = SessionStore(
            apiClient: APIClient(
                environment: AppEnvironment(
                    deployment: .development,
                    apiBaseURL: URL(string: "https://api.sideseat.test")!,
                    bundleIdentifier: "app.sideseat.mobile.tests",
                    appVersion: "1.0.0",
                    buildNumber: "1"
                ),
                transport: transport
            ),
            credentialStore: ChatMemoryCredentialStore(),
            device: NativeDevice(
                id: "chat-device",
                name: "Chat iPhone",
                appVersion: "1.0.0",
                platformVersion: "26.5"
            )
        )
        await session.login(identifier: "test_001", password: "Password123")

        let store = DirectChatStore()
        await store.load(
            connectionID: "connection-1",
            using: session,
            apiBaseURL: URL(string: "https://api.sideseat.test")!,
            enableRealtime: false
        )

        let peerMessage = try #require(store.messages.first)
        store.beginReply(to: peerMessage)
        #expect(store.replyTarget?.id == "msg-1")

        let replied = await store.sendText("Sounds good", using: session)
        #expect(replied)
        #expect(store.replyTarget == nil)
        #expect(await transport.lastReplyToId == "msg-1")
        #expect(store.messages.contains(where: { $0.body == "Sounds good" && $0.replyTo?.id == "msg-1" }))

        let own = try #require(store.messages.first(where: { $0.body == "Sounds good" }))
        let deleted = await store.deleteMessage(own.id, using: session)
        #expect(deleted)
        #expect(await transport.deletedMessageID == own.id)
        #expect(store.messages.contains(where: { $0.id == own.id && $0.isDeleted }))
    }

    @Test("Sends a location pin and reports a peer message")
    @MainActor
    func locationAndReport() async throws {
        let transport = ChatTestTransport()
        let session = SessionStore(
            apiClient: APIClient(
                environment: AppEnvironment(
                    deployment: .development,
                    apiBaseURL: URL(string: "https://api.sideseat.test")!,
                    bundleIdentifier: "app.sideseat.mobile.tests",
                    appVersion: "1.0.0",
                    buildNumber: "1"
                ),
                transport: transport
            ),
            credentialStore: ChatMemoryCredentialStore(),
            device: NativeDevice(
                id: "chat-device",
                name: "Chat iPhone",
                appVersion: "1.0.0",
                platformVersion: "26.5"
            )
        )
        await session.login(identifier: "test_001", password: "Password123")

        let store = DirectChatStore()
        await store.load(
            connectionID: "connection-1",
            using: session,
            apiBaseURL: URL(string: "https://api.sideseat.test")!,
            enableRealtime: false
        )

        let sent = await store.sendLocation(latitude: 48.137, longitude: 11.575, using: session)
        #expect(sent)
        #expect(await transport.lastLocationLat == 48.137)
        #expect(await transport.lastLocationLng == 11.575)
        #expect(store.messages.contains(where: { $0.type == "LOCATION" && $0.location?.latitude == 48.137 }))

        let peer = try #require(store.messages.first(where: { $0.sender.id == "peer-1" }))
        let failure = await store.reportMessage(
            peer,
            reason: .spam,
            details: "Looks like spam",
            using: session
        )
        #expect(failure == nil)
        #expect(await transport.lastReportMessageID == "msg-1")
        #expect(await transport.lastReportReason == "SPAM")
    }
}

@Suite("Community chat store")
struct CommunityChatStoreTests {
    @Test("Loads course history, replies, and soft-deletes")
    @MainActor
    func courseChatFlow() async throws {
        let transport = ChatTestTransport()
        let session = SessionStore(
            apiClient: APIClient(
                environment: AppEnvironment(
                    deployment: .development,
                    apiBaseURL: URL(string: "https://api.sideseat.test")!,
                    bundleIdentifier: "app.sideseat.mobile.tests",
                    appVersion: "1.0.0",
                    buildNumber: "1"
                ),
                transport: transport
            ),
            credentialStore: ChatMemoryCredentialStore(),
            device: NativeDevice(
                id: "chat-device",
                name: "Chat iPhone",
                appVersion: "1.0.0",
                platformVersion: "26.5"
            )
        )
        await session.login(identifier: "test_001", password: "Password123")

        let store = CommunityChatStore()
        await store.load(
            kind: .course,
            conversationID: "course-1",
            using: session,
            apiBaseURL: URL(string: "https://api.sideseat.test")!,
            enableRealtime: false
        )
        #expect(store.conversation?.displayName == "Algorithms")
        #expect(store.messages.count == 1)
        #expect(await transport.courseReadMarked)

        let peer = try #require(store.messages.first)
        store.beginReply(to: peer)
        let sent = await store.sendText("Count me in", using: session)
        #expect(sent)
        #expect(await transport.lastReplyToId == "course-msg-1")
        let own = try #require(store.messages.first(where: { $0.body == "Count me in" }))
        #expect(await store.deleteMessage(own.id, using: session))
        #expect(await transport.deletedCourseMessageID == own.id)
        #expect(store.messages.contains(where: { $0.id == own.id && $0.isDeleted }))

        let peerAgain = try #require(store.messages.first(where: { $0.id == "course-msg-1" }))
        let failure = await store.reportMessage(
            peerAgain,
            reason: .harassment,
            details: "",
            using: session
        )
        #expect(failure == nil)
        #expect(await transport.lastReportCourseMessageID == "course-msg-1")
        #expect(await transport.lastReportReason == "HARASSMENT")
    }

    @Test("Loads group history and sends text without reply")
    @MainActor
    func groupChatFlow() async throws {
        let transport = ChatTestTransport()
        let session = SessionStore(
            apiClient: APIClient(
                environment: AppEnvironment(
                    deployment: .development,
                    apiBaseURL: URL(string: "https://api.sideseat.test")!,
                    bundleIdentifier: "app.sideseat.mobile.tests",
                    appVersion: "1.0.0",
                    buildNumber: "1"
                ),
                transport: transport
            ),
            credentialStore: ChatMemoryCredentialStore(),
            device: NativeDevice(
                id: "chat-device",
                name: "Chat iPhone",
                appVersion: "1.0.0",
                platformVersion: "26.5"
            )
        )
        await session.login(identifier: "test_001", password: "Password123")

        let store = CommunityChatStore()
        await store.load(
            kind: .group,
            conversationID: "group-1",
            using: session,
            apiBaseURL: URL(string: "https://api.sideseat.test")!,
            enableRealtime: false
        )
        #expect(store.conversation?.displayName == "Study crew")
        store.beginReply(to: try #require(store.messages.first))
        #expect(store.replyTarget == nil)

        let sent = await store.sendText("See you there", using: session)
        #expect(sent)
        #expect(await transport.lastReplyToId == nil)
        #expect(store.messages.contains(where: { $0.body == "See you there" }))
        #expect(await transport.groupReadMarked)
    }
}

private actor ChatMemoryCredentialStore: CredentialStore {
    private var token: String?
    func refreshToken() -> String? { token }
    func save(refreshToken: String) { token = refreshToken }
    func clear() { token = nil }
}

private actor ChatTestTransport: APITransport {
    private(set) var readMarked = false
    private(set) var courseReadMarked = false
    private(set) var groupReadMarked = false
    private(set) var sentBodies: [String] = []
    private(set) var writeKeys: [String] = []
    private(set) var lastReplyToId: String?
    private(set) var lastLocationLat: Double?
    private(set) var lastLocationLng: Double?
    private(set) var lastReportMessageID: String?
    private(set) var lastReportCourseMessageID: String?
    private(set) var lastReportReason: String?
    private(set) var deletedMessageID: String?
    private(set) var deletedCourseMessageID: String?
    private(set) var pinnedPaths: [String] = []
    private(set) var hiddenPaths: [String] = []
    private var messageCounter = 2
    private var courseMessageCounter = 1
    private var groupMessageCounter = 1
    private var directPinned = true

    func data(for request: URLRequest) async throws -> (Data, URLResponse) {
        let path = request.url?.path ?? ""
        switch path {
        case "/api/v1/auth/login":
            return response(
                request,
                200,
                #"{"data":{"user":{"id":"user-1","username":"test_001","nickname":"Test User","gender":"PRIVATE","onboardingComplete":true,"isGuest":false,"verifiedStudent":true,"studentVerificationStatus":"VERIFIED","locale":"en"},"tokens":{"accessToken":"access-token","accessExpiresIn":900,"refreshToken":"refresh-token","refreshExpiresAt":"2026-08-16T00:00:00.000Z"}}}"#
            )
        case "/api/v1/inbox":
            return response(
                request,
                200,
                #"{"data":{"conversations":[{"kind":"DIRECT","id":"connection-1","displayName":"Mina","avatarUrl":null,"participantAvatars":[],"unreadCount":1,"pinned":\#(directPinned),"lastActivityAt":"2026-07-17T12:00:00.000Z","peer":{"id":"peer-1","username":"test_002","nickname":"Mina","avatarUrl":null},"isSelfNotes":false,"course":null,"group":null,"lastMessage":{"id":"msg-1","sender":{"id":"peer-1","username":"test_002","nickname":"Mina","avatarUrl":null},"type":"TEXT","body":"See you?","imageUrl":null,"deletedAt":null,"createdAt":"2026-07-17T12:00:00.000Z"}},{"kind":"COURSE","id":"course-1","displayName":"Algorithms","avatarUrl":null,"participantAvatars":[],"unreadCount":0,"pinned":false,"lastActivityAt":"2026-07-17T13:00:00.000Z","peer":null,"isSelfNotes":false,"course":{"id":"course-1","name":"Algorithms","code":"IN0007","school":"TUM","semesterLabel":"SS26"},"group":null,"lastMessage":{"id":"course-msg-1","sender":{"id":"peer-1","username":"test_002","nickname":"Mina","avatarUrl":null},"type":"TEXT","body":"Tutorial?","imageUrl":null,"deletedAt":null,"createdAt":"2026-07-17T13:00:00.000Z"}},{"kind":"GROUP","id":"group-1","displayName":"Study crew","avatarUrl":null,"participantAvatars":[],"unreadCount":0,"pinned":false,"lastActivityAt":"2026-07-17T14:00:00.000Z","peer":null,"isSelfNotes":false,"course":null,"group":{"id":"group-1","participantCount":2,"participants":[{"id":"user-1","username":"test_001","nickname":"Test User","avatarUrl":null},{"id":"peer-1","username":"test_002","nickname":"Mina","avatarUrl":null}]},"lastMessage":{"id":"group-msg-1","sender":{"id":"peer-1","username":"test_002","nickname":"Mina","avatarUrl":null},"type":"TEXT","body":"Library at 4?","imageUrl":null,"deletedAt":null,"createdAt":"2026-07-17T14:00:00.000Z"}}],"unreadTotal":1,"plansNeedingYourAction":0}}"#
            )
        case "/api/v1/connections/connection-1/pin":
            pinnedPaths.append(path)
            directPinned.toggle()
            return response(
                request,
                200,
                #"{"data":{"pinned":\#(directPinned),"hidden":false}}"#
            )
        case "/api/v1/courses/course-1/inbox-hide":
            hiddenPaths.append(path)
            return response(request, 200, #"{"data":{"pinned":false,"hidden":true}}"#)
        case "/api/v1/courses/course-1/inbox-restore":
            return response(request, 200, #"{"data":{"pinned":false,"hidden":false}}"#)
        case "/api/v1/courses/course-1/inbox-pin":
            pinnedPaths.append(path)
            return response(request, 200, #"{"data":{"pinned":true,"hidden":false}}"#)
        case "/api/reports":
            let body = try JSONSerialization.jsonObject(with: request.httpBody ?? Data()) as? [String: Any]
            lastReportMessageID = body?["messageId"] as? String
            lastReportCourseMessageID = body?["courseRoomMessageId"] as? String
            lastReportReason = body?["reason"] as? String
            return response(
                request,
                201,
                #"{"success":true,"data":{"id":"report-1","reason":"\#(lastReportReason ?? "OTHER")","status":"OPEN"}}"#
            )
        case "/api/v1/connections/connection-1/messages":
            if request.httpMethod == "POST" {
                if let key = request.value(forHTTPHeaderField: "Idempotency-Key") {
                    writeKeys.append(key)
                }
                let body = try JSONSerialization.jsonObject(with: request.httpBody ?? Data()) as? [String: Any]
                let type = body?["type"] as? String ?? "TEXT"
                let replyToId = body?["replyToId"] as? String
                lastReplyToId = replyToId
                messageCounter += 1
                let messageID = "msg-\(messageCounter)"
                let replyJSON: String
                if let replyToId {
                    replyJSON = #"{"id":"\#(replyToId)","sender":{"id":"peer-1","username":"test_002","nickname":"Mina","avatarUrl":null},"type":"TEXT","body":"See you?","deletedAt":null}"#
                } else {
                    replyJSON = "null"
                }
                if type == "LOCATION" {
                    let lat = body?["locationLat"] as? Double ?? 0
                    let lng = body?["locationLng"] as? Double ?? 0
                    lastLocationLat = lat
                    lastLocationLng = lng
                    return response(
                        request,
                        201,
                        #"{"data":{"id":"\#(messageID)","connectionId":"connection-1","sender":{"id":"user-1","username":"test_001","nickname":"Test User","avatarUrl":null},"type":"LOCATION","body":null,"imageUrl":null,"location":{"latitude":\#(lat),"longitude":\#(lng),"name":null},"availabilityShareId":null,"planRequestId":null,"replyTo":\#(replyJSON),"deletedAt":null,"createdAt":"2026-07-17T12:01:00.000Z"}}"#
                    )
                }
                let text = body?["body"] as? String ?? ""
                sentBodies.append(text)
                return response(
                    request,
                    201,
                    #"{"data":{"id":"\#(messageID)","connectionId":"connection-1","sender":{"id":"user-1","username":"test_001","nickname":"Test User","avatarUrl":null},"type":"TEXT","body":"\#(text)","imageUrl":null,"location":null,"availabilityShareId":null,"planRequestId":null,"replyTo":\#(replyJSON),"deletedAt":null,"createdAt":"2026-07-17T12:01:00.000Z"}}"#
                )
            }
            return response(
                request,
                200,
                #"{"data":{"connection":{"id":"connection-1","isSelfNotes":false,"displayName":"Mina","peer":{"id":"peer-1","username":"test_002","nickname":"Mina","avatarUrl":null}},"messages":[{"id":"msg-1","connectionId":"connection-1","sender":{"id":"peer-1","username":"test_002","nickname":"Mina","avatarUrl":null},"type":"TEXT","body":"See you?","imageUrl":null,"location":null,"availabilityShareId":null,"planRequestId":null,"replyTo":null,"deletedAt":null,"createdAt":"2026-07-17T12:00:00.000Z"}]},"meta":{"hasMore":false,"nextCursor":null,"realtimeCursor":"cursor-1"}}"#
            )
        case "/api/v1/connections/connection-1/read":
            readMarked = true
            return response(request, 200, #"{"data":{"readAt":"2026-07-17T12:00:30.000Z"}}"#)
        case "/api/v1/courses/course-1/messages":
            if request.httpMethod == "POST" {
                if let key = request.value(forHTTPHeaderField: "Idempotency-Key") {
                    writeKeys.append(key)
                }
                let body = try JSONSerialization.jsonObject(with: request.httpBody ?? Data()) as? [String: Any]
                let text = body?["body"] as? String ?? ""
                lastReplyToId = body?["replyToId"] as? String
                courseMessageCounter += 1
                let messageID = "course-msg-\(courseMessageCounter)"
                let replyJSON: String
                if let replyToId = lastReplyToId {
                    replyJSON = #"{"id":"\#(replyToId)","sender":{"id":"peer-1","username":"test_002","nickname":"Mina","avatarUrl":null},"body":"Tutorial?","deletedAt":null}"#
                } else {
                    replyJSON = "null"
                }
                return response(
                    request,
                    201,
                    #"{"data":{"id":"\#(messageID)","conversationId":"course-1","sender":{"id":"user-1","username":"test_001","nickname":"Test User","avatarUrl":null},"type":"TEXT","body":"\#(text)","replyTo":\#(replyJSON),"deletedAt":null,"createdAt":"2026-07-17T13:02:00.000Z"}}"#
                )
            }
            return response(
                request,
                200,
                #"{"data":{"conversation":{"kind":"COURSE","id":"course-1","name":"Algorithms","code":"IN0007","school":"TUM","semesterLabel":"SS26","memberCount":12,"inboxHidden":false},"messages":[{"id":"course-msg-1","conversationId":"course-1","sender":{"id":"peer-1","username":"test_002","nickname":"Mina","avatarUrl":null},"type":"TEXT","body":"Tutorial?","replyTo":null,"deletedAt":null,"createdAt":"2026-07-17T13:00:00.000Z"}]},"meta":{"hasMore":false,"nextCursor":null,"realtimeCursor":"course-cursor-1"}}"#
            )
        case "/api/v1/courses/course-1/read":
            courseReadMarked = true
            return response(request, 200, #"{"data":{"readAt":"2026-07-17T13:00:30.000Z"}}"#)
        case "/api/v1/group-chats/group-1/messages":
            if request.httpMethod == "POST" {
                if let key = request.value(forHTTPHeaderField: "Idempotency-Key") {
                    writeKeys.append(key)
                }
                let body = try JSONSerialization.jsonObject(with: request.httpBody ?? Data()) as? [String: Any]
                let text = body?["body"] as? String ?? ""
                lastReplyToId = body?["replyToId"] as? String
                groupMessageCounter += 1
                let messageID = "group-msg-\(groupMessageCounter)"
                return response(
                    request,
                    201,
                    #"{"data":{"id":"\#(messageID)","conversationId":"group-1","sender":{"id":"user-1","username":"test_001","nickname":"Test User","avatarUrl":null},"type":"TEXT","body":"\#(text)","replyTo":null,"deletedAt":null,"createdAt":"2026-07-17T14:01:00.000Z"}}"#
                )
            }
            return response(
                request,
                200,
                #"{"data":{"conversation":{"kind":"GROUP","id":"group-1","title":"Study crew","customTitle":null,"participants":[{"id":"user-1","username":"test_001","nickname":"Test User","avatarUrl":null},{"id":"peer-1","username":"test_002","nickname":"Mina","avatarUrl":null}]},"messages":[{"id":"group-msg-1","conversationId":"group-1","sender":{"id":"peer-1","username":"test_002","nickname":"Mina","avatarUrl":null},"type":"TEXT","body":"Library at 4?","replyTo":null,"deletedAt":null,"createdAt":"2026-07-17T14:00:00.000Z"}]},"meta":{"hasMore":false,"nextCursor":null,"realtimeCursor":"group-cursor-1"}}"#
            )
        case "/api/v1/group-chats/group-1/read":
            groupReadMarked = true
            return response(request, 200, #"{"data":{"readAt":"2026-07-17T14:00:30.000Z"}}"#)
        default:
            if request.httpMethod == "DELETE" {
                if path.hasPrefix("/api/connections/connection-1/messages/") {
                    deletedMessageID = path.split(separator: "/").last.map(String.init)
                    return response(request, 200, #"{"success":true,"data":{"id":"\#(deletedMessageID ?? "")"}}"#)
                }
                if path.hasPrefix("/api/courses/course-1/chat/messages/") {
                    deletedCourseMessageID = path.split(separator: "/").last.map(String.init)
                    return response(request, 200, #"{"success":true,"data":{"id":"\#(deletedCourseMessageID ?? "")"}}"#)
                }
            }
            throw URLError(.badURL)
        }
    }

    private func response(_ request: URLRequest, _ status: Int, _ body: String) -> (Data, URLResponse) {
        let response = HTTPURLResponse(
            url: request.url!,
            statusCode: status,
            httpVersion: nil,
            headerFields: ["Content-Type": "application/json"]
        )!
        return (Data(body.utf8), response)
    }
}
