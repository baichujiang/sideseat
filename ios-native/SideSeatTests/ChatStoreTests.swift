import Foundation
import Testing
@testable import SideSeat

@Suite("Chat composer return key")
struct ChatComposerReturnKeyTests {
    @Test("Detects Return inserted at the end or cursor position")
    func detectsSingleInsertedReturn() {
        #expect(
            ChatComposerReturnKey.textBeforeInsertedReturn(
                previous: "Meet at six",
                current: "Meet at six\n"
            ) == "Meet at six"
        )
        #expect(
            ChatComposerReturnKey.textBeforeInsertedReturn(
                previous: "Meet six",
                current: "Meet\n six"
            ) == "Meet six"
        )
    }

    @Test("Does not treat IME commits or multiline paste as Return")
    func ignoresNonReturnTextChanges() {
        #expect(
            ChatComposerReturnKey.textBeforeInsertedReturn(
                previous: "ni",
                current: "你"
            ) == nil
        )
        #expect(
            ChatComposerReturnKey.textBeforeInsertedReturn(
                previous: "",
                current: "Line one\nLine two"
            ) == nil
        )
    }
}

@Suite("Chat date parsing")
struct ChatDateParsingTests {
    @Test("Parses fractional and standard ISO 8601 timestamps")
    func parsesSupportedTimestamps() {
        #expect(Date.sideSeatChatISO8601("2026-08-07T13:30:45.123Z") != nil)
        #expect(Date.sideSeatChatISO8601("2026-08-07T13:30:45Z") != nil)
        #expect(Date.sideSeatChatISO8601("not-a-date") == nil)
    }

    @Test("Dense chat fixture contains a parseable multi-day history")
    func denseFixtureIsComplete() {
        let page = UITestingChatFixtures.denseDirectPage()

        #expect(page.messages.count == 960)
        #expect(page.messages.first?.id == "ui-dense-0000")
        #expect(page.messages.last?.id == "ui-dense-0959")
        #expect(page.messages.allSatisfy { $0.createdDate != nil })
        #expect(page.messages.contains { $0.replyTo != nil })
    }
}

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

    @Test("Keyboard resize keeps a bottom thread pinned")
    func keyboardResizeKeepsBottomPinned() {
        var state = ChatKeyboardBottomAnchorState()

        let focusShouldPin = state.composerFocusChanged(isFocused: true, isNearBottom: true)
        let resizeShouldPin = state.keyboardWillChange(isNearBottom: true)
        state.nearBottomChanged(false)
        let stayedPinnedDuringTransition = state.isPinned
        let wasTransitioning = state.isKeyboardTransitioning
        let settledShouldPin = state.keyboardDidChange(isNearBottom: false)

        #expect(focusShouldPin)
        #expect(resizeShouldPin)
        #expect(stayedPinnedDuringTransition)
        #expect(wasTransitioning)
        #expect(state.isPinned)
        #expect(!state.isKeyboardTransitioning)
        #expect(settledShouldPin)
    }

    @Test("A user scroll after keyboard resize releases the bottom pin")
    func userScrollAfterKeyboardResizeReleasesPin() {
        var state = ChatKeyboardBottomAnchorState()

        _ = state.composerFocusChanged(isFocused: true, isNearBottom: true)
        _ = state.keyboardWillChange(isNearBottom: true)
        _ = state.keyboardDidChange(isNearBottom: true)
        state.userScrollBegan()

        let dismissShouldPin = state.composerFocusChanged(isFocused: false, isNearBottom: false)

        #expect(!state.isPinned)
        #expect(!dismissShouldPin)
    }

    @Test("Focusing the composer while reading history preserves position")
    func composerFocusWhileReadingHistoryPreservesPosition() {
        var state = ChatKeyboardBottomAnchorState()

        state.userScrollBegan()
        state.nearBottomChanged(false)
        let focusShouldPin = state.composerFocusChanged(isFocused: true, isNearBottom: false)
        let resizeShouldPin = state.keyboardWillChange(isNearBottom: false)
        let settledShouldPin = state.keyboardDidChange(isNearBottom: false)

        #expect(!focusShouldPin)
        #expect(!resizeShouldPin)
        #expect(!settledShouldPin)
    }

    @Test("Keyboard layout settling does not break the next composer focus")
    func keyboardLayoutSettlingKeepsNextFocusPinned() {
        var state = ChatKeyboardBottomAnchorState()

        _ = state.composerFocusChanged(isFocused: true, isNearBottom: true)
        _ = state.keyboardWillChange(isNearBottom: true)
        _ = state.keyboardDidChange(isNearBottom: false)
        state.nearBottomChanged(false)
        let dismissShouldPin = state.composerFocusChanged(isFocused: false, isNearBottom: false)
        let secondFocusShouldPin = state.composerFocusChanged(isFocused: true, isNearBottom: false)

        #expect(state.isPinned)
        #expect(dismissShouldPin)
        #expect(secondFocusShouldPin)
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
        #expect(["Yesterday", "昨天"].contains(InboxActivityFormatting.label(for: yesterday, now: now, calendar: calendar)))
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

@Suite("Schedule share composition")
struct ScheduleShareCompositionTests {
    @Test("Default selection starts tomorrow and spans three days")
    func defaultDateSelection() throws {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = try #require(TimeZone(identifier: "Europe/Berlin"))
        let now = try #require(
            calendar.date(from: DateComponents(year: 2026, month: 8, day: 3, hour: 12))
        )

        let selected = ScheduleShareDateSelection.nextDays(3, from: now, calendar: calendar)

        #expect(selected == Set(["2026-08-04", "2026-08-05", "2026-08-06"]))
        let range = try #require(ScheduleShareDateSelection.range(for: selected, calendar: calendar))
        #expect(ScheduleShareDateSelection.dateKey(for: range.start, calendar: calendar) == "2026-08-04")
        #expect(ScheduleShareDateSelection.dateKey(for: range.end, calendar: calendar) == "2026-08-06")
    }

    @Test("Week preview always returns a stable Monday through Sunday grid")
    func fixedWeekPreviewDates() throws {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = try #require(TimeZone(identifier: "Europe/Berlin"))
        let thursday = try #require(
            calendar.date(from: DateComponents(year: 2026, month: 8, day: 6, hour: 12))
        )

        let currentWeek = ScheduleShareDateSelection.weekDays(
            containing: thursday,
            calendar: calendar
        )
        let nextWeek = ScheduleShareDateSelection.weekDays(
            containing: thursday,
            offset: 1,
            calendar: calendar
        )

        #expect(currentWeek.map { ScheduleShareDateSelection.dateKey(for: $0, calendar: calendar) } == [
            "2026-08-03", "2026-08-04", "2026-08-05", "2026-08-06",
            "2026-08-07", "2026-08-08", "2026-08-09",
        ])
        #expect(nextWeek.first.map { ScheduleShareDateSelection.dateKey(for: $0, calendar: calendar) } == "2026-08-10")
        #expect(nextWeek.count == 7)
    }

    @Test("A skipped day keeps its place inside the shared date range")
    func sharedRangeKeepsExcludedDayColumn() throws {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = try #require(TimeZone(identifier: "Europe/Berlin"))
        let start = try #require(
            calendar.date(from: DateComponents(year: 2026, month: 8, day: 3, hour: 0))
        )
        let end = try #require(
            calendar.date(from: DateComponents(year: 2026, month: 8, day: 9, hour: 23, minute: 59))
        )
        let included = Set([
            "2026-08-03", "2026-08-04", "2026-08-05",
            "2026-08-07", "2026-08-08", "2026-08-09",
        ])

        let displayKeys = ScheduleShareDateSelection.dates(
            from: start,
            through: end,
            limit: 7,
            calendar: calendar
        ).map { ScheduleShareDateSelection.dateKey(for: $0, calendar: calendar) }

        #expect(displayKeys.count == 7)
        #expect(displayKeys[3] == "2026-08-06")
        #expect(!included.contains(displayKeys[3]))
    }

    @Test("Hide-all privacy is encoded explicitly")
    func hideAllPrivacyEncoding() throws {
        let request = NativeScheduleShareCreateRequest(
            rangeStart: "2026-08-04T00:00:00.000Z",
            rangeEnd: "2026-08-06T23:59:59.999Z",
            revealConfig: NativeScheduleShareRevealConfigRequest(
                categoryIds: [],
                presetKeys: [],
                hideAllDetails: true,
                includedDates: ["2026-08-04", "2026-08-05", "2026-08-06"]
            ),
            allowGuestProposals: true,
            usageLimit: "SINGLE_USE",
            expiresAt: "2026-08-17T23:59:59.999Z"
        )

        let object = try #require(
            JSONSerialization.jsonObject(with: JSONEncoder().encode(request)) as? [String: Any]
        )
        let reveal = try #require(object["revealConfig"] as? [String: Any])
        #expect(reveal["hideAllDetails"] as? Bool == true)
        #expect((reveal["includedDates"] as? [String])?.count == 3)
    }

    @Test("Detail labels use live categories and real schedule sources")
    func revealOptionsExcludeGhostPresets() {
        let categories = [
            NativeCalendarCategory(
                id: "project-id",
                name: "Project",
                color: "#2563EB",
                sortOrder: 0,
                presetKey: nil,
                icsSubscriptionUrl: nil
            ),
            NativeCalendarCategory(
                id: "unused-id",
                name: "Unused",
                color: "#16A34A",
                sortOrder: 1,
                presetKey: nil,
                icsSubscriptionUrl: nil
            ),
        ]
        let blocks = [
            scheduleBlock(categoryID: "project-id", presetKey: nil),
            scheduleBlock(categoryID: nil, presetKey: "course"),
            scheduleBlock(categoryID: nil, presetKey: "none"),
            scheduleBlock(categoryID: nil, presetKey: "work"),
        ]

        let options = ScheduleShareRevealSelection.options(categories: categories, blocks: blocks)

        #expect(options.map(\.id) == [
            "project-id",
            ScheduleShareRevealOption.courseSourceID,
            ScheduleShareRevealOption.uncategorizedID,
        ])
        #expect(!options.contains { $0.name == "Work" || $0.name == "Unused" })
    }

    @Test("Share requests use live category IDs and only virtual source presets")
    func revealRequestUsesLiveCategoryIDs() {
        let categories = [
            NativeCalendarCategory(
                id: "personal-id",
                name: "Personal",
                color: "#EA580C",
                sortOrder: 0,
                presetKey: "personal",
                icsSubscriptionUrl: nil
            ),
            NativeCalendarCategory(
                id: "project-id",
                name: "Project",
                color: "#2563EB",
                sortOrder: 1,
                presetKey: nil,
                icsSubscriptionUrl: nil
            ),
        ]
        let blocks = [
            scheduleBlock(categoryID: "personal-id", presetKey: "personal"),
            scheduleBlock(categoryID: "project-id", presetKey: nil),
            scheduleBlock(categoryID: nil, presetKey: "course"),
            scheduleBlock(categoryID: nil, presetKey: "none"),
        ]
        let options = ScheduleShareRevealSelection.options(categories: categories, blocks: blocks)

        let selection = ScheduleShareRevealSelection.requestSelection(
            options: options,
            selectedOptionIDs: Set(options.map(\.id))
        )

        #expect(selection.categoryIDs == ["personal-id", "project-id"])
        #expect(selection.presetKeys == ["course", "none"])
    }

    private func scheduleBlock(categoryID: String?, presetKey: String?) -> NativeScheduleShareBlock {
        NativeScheduleShareBlock(
            kind: "busy_detail",
            start: "2026-08-04T10:00:00.000Z",
            end: "2026-08-04T11:00:00.000Z",
            title: "Event",
            location: nil,
            categoryId: categoryID,
            categoryPresetKey: presetKey,
            categoryName: nil,
            categoryColor: nil
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
        ]
        #expect(
            DirectChatStore.countUnrepliedStreak(
                messagesNewestFirst: newestFirst,
                viewerID: me.id,
                peerID: peer.id
            ) == 2
        )
    }

    @Test("Unlocks permanently after a mutual reply")
    func unlocksAfterMutualReply() {
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
            ) == 0
        )
        #expect(
            DirectChatStore.hasMutualExchange(
                messages: newestFirst,
                viewerID: me.id,
                peerID: peer.id
            )
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
    @Test("Formats the Chats tab badge from 1 through 99+")
    func formatsUnreadBadge() {
        #expect(InboxStore.unreadBadgeLabel(for: 0) == nil)
        #expect(InboxStore.unreadBadgeLabel(for: 1) == "1")
        #expect(InboxStore.unreadBadgeLabel(for: 99) == "99")
        #expect(InboxStore.unreadBadgeLabel(for: 100) == "99+")
    }

    @Test("Clears the Chats tab badge immediately after reading")
    @MainActor
    func clearsUnreadBadgeImmediately() async throws {
        let session = try await chatSession(transport: ChatTestTransport())
        let store = InboxStore(cache: InboxCache(inMemoryOnly: true))
        await store.load(using: session)

        #expect(store.unreadBadgeLabel == "1")
        store.clearUnread(conversationID: "connection-1")
        #expect(store.unreadBadgeLabel == nil)
        #expect(store.payload?.unreadTotal == 0)
    }

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

        let store = InboxStore(cache: InboxCache(inMemoryOnly: true))
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
        let store = InboxStore(cache: InboxCache(inMemoryOnly: true))
        await store.load(using: session)

        store.searchQuery = "algorithms"
        #expect(store.filteredConversations.map(\.id) == ["course-1"])
        #expect(store.hasNoSearchMatches == false)

        store.searchQuery = "zzzz-no-match"
        #expect(store.filteredConversations.isEmpty)
        #expect(store.hasNoSearchMatches)
    }

    @Test("Filters conversations by kind and combines with search")
    @MainActor
    func filtersConversationKinds() async throws {
        let session = try await chatSession(transport: ChatTestTransport())
        let store = InboxStore(cache: InboxCache(inMemoryOnly: true))
        await store.load(using: session)

        store.conversationFilter = .direct
        #expect(store.filteredConversations.map(\.id) == ["connection-1"])

        store.conversationFilter = .course
        #expect(store.filteredConversations.map(\.id) == ["course-1"])

        store.searchQuery = "mina"
        #expect(store.filteredConversations.isEmpty)
        #expect(store.hasNoSearchMatches)

        store.searchQuery = ""
        store.conversationFilter = .all
        #expect(store.filteredConversations.count == 3)
    }

    @Test("Toggles pin and hides course rows")
    @MainActor
    func pinAndHide() async throws {
        let transport = ChatTestTransport()
        let session = try await chatSession(transport: transport)
        let store = InboxStore(cache: InboxCache(inMemoryOnly: true))
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

    @Test("Restores the inbox snapshot while offline")
    @MainActor
    func restoresCachedInboxOffline() async throws {
        let cache = InboxCache(inMemoryOnly: true)
        await cache.save(
            accountID: "user-1",
            snapshot: InboxCacheSnapshot(payload: .uiTestingFixture)
        )
        let transport = ChatTestTransport(failInbox: true)
        let session = try await chatSession(transport: transport)
        let store = InboxStore(cache: cache)

        await store.load(using: session)

        #expect(store.payload?.conversations.isEmpty == false)
        #expect(store.isLoading == false)
        #expect(store.issue != nil)
    }

    @Test("Keeps inbox snapshots isolated by account")
    func cacheIsolation() async {
        let cache = InboxCache(inMemoryOnly: true)
        await cache.save(
            accountID: "user-1",
            snapshot: InboxCacheSnapshot(payload: .uiTestingFixture)
        )
        #expect(await cache.load(accountID: "user-1") != nil)
        #expect(await cache.load(accountID: "user-2") == nil)
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
        #expect(InboxChatSearch.matches(course, query: "  算法 "))
        let direct = NativeInboxPayload.uiTestingFixture.conversations.first { $0.id == "ui-connection" }!
        #expect(InboxChatSearch.matches(direct, query: "test_002"))
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
        #expect(["Shared schedule", "共享日程"].contains(row.preview))
        #expect(row.matches(query: row.preview))
        #expect(row.matches(query: "token"))
        #expect(!row.matches(query: "zzzz"))
    }
}

@Suite("Direct chat store")
struct DirectChatStoreTests {
    @Test("Local cache keeps message state isolated by account")
    func cacheIsolation() async throws {
        let cache = DirectChatCache(inMemoryOnly: true)
        let peer = NativeChatAuthor(
            id: "peer-1",
            username: "test_002",
            nickname: "Mina",
            avatarUrl: nil
        )
        let pending = NativeDirectMessage(
            id: "local-pending",
            connectionId: "connection-1",
            sender: NativeChatAuthor(
                id: "user-1",
                username: "test_001",
                nickname: "Test User",
                avatarUrl: nil
            ),
            type: "TEXT",
            body: "Cached hello",
            createdAt: "2026-08-04T12:00:00.000Z"
        )
        await cache.save(
            accountID: "user-1",
            connectionID: "connection-1",
            snapshot: DirectChatCacheSnapshot(
                conversation: NativeDirectConversation(
                    id: "connection-1",
                    isSelfNotes: false,
                    displayName: "Mina",
                    peer: peer
                ),
                messages: [pending],
                sendStatuses: [pending.id: .failed],
                hasMoreOlder: true,
                nextCursor: "older-cursor",
                realtimeCursor: "realtime-cursor"
            )
        )

        let restored = try #require(
            await cache.load(accountID: "user-1", connectionID: "connection-1")
        )
        #expect(restored.messages == [pending])
        #expect(restored.sendStatuses[pending.id] == .failed)
        #expect(
            await cache.load(accountID: "user-2", connectionID: "connection-1") == nil
        )

        let remote = NativeDirectMessage(
            id: "remote-2",
            connectionId: "connection-1",
            sender: peer,
            type: "TEXT",
            body: "Server update",
            createdAt: "2026-08-04T12:01:00.000Z"
        )
        await cache.merge(
            accountID: "user-1",
            connectionID: "connection-1",
            page: NativeDirectMessagePageResponse(
                data: NativeDirectMessagePageData(
                    connection: restored.conversation,
                    messages: [remote]
                ),
                meta: NativeDirectMessagePageMeta(
                    hasMore: false,
                    nextCursor: nil,
                    realtimeCursor: "realtime-cursor-2"
                )
            )
        )
        let merged = try #require(
            await cache.load(accountID: "user-1", connectionID: "connection-1")
        )
        #expect(merged.messages.contains(pending))
        #expect(merged.messages.contains(remote))
        #expect(merged.sendStatuses[pending.id] == .failed)

        await cache.removeAccount("user-1")
        #expect(
            await cache.load(accountID: "user-1", connectionID: "connection-1") == nil
        )
    }

    @Test("Cached conversation opens when history sync is offline")
    @MainActor
    func cachedConversationSurvivesOfflineSync() async throws {
        let cache = DirectChatCache(inMemoryOnly: true)
        let peer = NativeChatAuthor(
            id: "peer-1",
            username: "test_002",
            nickname: "Mina",
            avatarUrl: nil
        )
        let cachedMessage = NativeDirectMessage(
            id: "cached-1",
            connectionId: "connection-1",
            sender: peer,
            type: "TEXT",
            body: "Available offline",
            createdAt: "2026-08-04T12:00:00.000Z"
        )
        await cache.save(
            accountID: "user-1",
            connectionID: "connection-1",
            snapshot: DirectChatCacheSnapshot(
                conversation: NativeDirectConversation(
                    id: "connection-1",
                    isSelfNotes: false,
                    displayName: "Mina",
                    peer: peer
                ),
                messages: [cachedMessage],
                hasMoreOlder: true,
                nextCursor: "older-cursor",
                realtimeCursor: "realtime-cursor"
            )
        )

        let transport = ChatTestTransport(failDirectHistory: true)
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

        let store = DirectChatStore(cache: cache)
        await store.load(
            connectionID: "connection-1",
            using: session,
            apiBaseURL: URL(string: "https://api.sideseat.test")!,
            enableRealtime: false
        )

        #expect(store.isLoading == false)
        #expect(store.conversation?.displayName == "Mina")
        #expect(store.messages == [cachedMessage])
    }

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

        let store = DirectChatStore(cache: DirectChatCache(inMemoryOnly: true))
        await store.load(
            connectionID: "connection-1",
            using: session,
            apiBaseURL: URL(string: "https://api.sideseat.test")!,
            enableRealtime: false
        )

        #expect(store.conversation?.displayName == "Mina")
        #expect(store.messages.count == 1)
        await store.waitForInitialSideEffects()
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

        let store = DirectChatStore(cache: DirectChatCache(inMemoryOnly: true))
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

        let store = DirectChatStore(cache: DirectChatCache(inMemoryOnly: true))
        await store.load(
            connectionID: "connection-1",
            using: session,
            apiBaseURL: URL(string: "https://api.sideseat.test")!,
            enableRealtime: false
        )

        let sent = await store.sendLocation(
            latitude: 48.137,
            longitude: 11.575,
            name: "Marienplatz, Munich",
            using: session
        )
        #expect(sent)
        #expect(await transport.lastLocationLat == 48.137)
        #expect(await transport.lastLocationLng == 11.575)
        #expect(await transport.lastLocationName == "Marienplatz, Munich")
        #expect(store.messages.contains(where: {
            $0.type == "LOCATION"
                && $0.location?.latitude == 48.137
                && $0.location?.name == "Marienplatz, Munich"
        }))

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

    @Test("Accepting a plan invalidates calendar, plans, and inbox state")
    @MainActor
    func acceptingPlanPublishesRefreshes() async throws {
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

        let store = DirectChatStore(cache: DirectChatCache(inMemoryOnly: true))
        await store.load(
            connectionID: "connection-1",
            using: session,
            apiBaseURL: URL(string: "https://api.sideseat.test")!,
            enableRealtime: false
        )

        let probe = ChatNotificationProbe()
        let names: [Notification.Name] = [
            .sideSeatCalendarNeedsRefresh,
            .sideSeatPlansNeedsRefresh,
            .sideSeatInboxNeedsRefresh,
        ]
        let observers = names.map { name in
            NotificationCenter.default.addObserver(forName: name, object: nil, queue: nil) { notification in
                probe.record(notification.name)
            }
        }
        defer {
            observers.forEach(NotificationCenter.default.removeObserver)
        }

        #expect(await store.acceptPlan("plan-accepted", using: session))
        #expect(await transport.acceptedPlanIDs == ["plan-accepted"])
        #expect(probe.received(.sideSeatCalendarNeedsRefresh))
        #expect(probe.received(.sideSeatPlansNeedsRefresh))
        #expect(probe.received(.sideSeatInboxNeedsRefresh))
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

        let store = CommunityChatStore(cache: CommunityChatCache(inMemoryOnly: true))
        await store.load(
            kind: .course,
            conversationID: "course-1",
            using: session,
            apiBaseURL: URL(string: "https://api.sideseat.test")!,
            enableRealtime: false
        )
        await store.waitForInitialSideEffects()
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

    @Test("Loads group history and supports reply, delete, and report")
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

        let store = CommunityChatStore(cache: CommunityChatCache(inMemoryOnly: true))
        await store.load(
            kind: .group,
            conversationID: "group-1",
            using: session,
            apiBaseURL: URL(string: "https://api.sideseat.test")!,
            enableRealtime: false
        )
        await store.waitForInitialSideEffects()
        #expect(store.conversation?.displayName == "Study crew")
        let peer = try #require(store.messages.first)
        store.beginReply(to: peer)
        #expect(store.replyTarget?.id == "group-msg-1")

        let sent = await store.sendText("See you there", using: session)
        #expect(sent)
        #expect(await transport.lastReplyToId == "group-msg-1")
        #expect(store.messages.contains(where: { $0.body == "See you there" }))
        #expect(await transport.groupReadMarked)

        let own = try #require(store.messages.first(where: { $0.body == "See you there" }))
        #expect(await store.deleteMessage(own.id, using: session))
        #expect(await transport.deletedGroupMessageID == own.id)
        #expect(store.messages.contains(where: { $0.id == own.id && $0.isDeleted }))

        let failure = await store.reportMessage(
            peer,
            reason: .harassment,
            details: "",
            using: session
        )
        #expect(failure == nil)
        #expect(await transport.lastReportGroupMessageID == "group-msg-1")
        #expect(await transport.lastReportReason == "HARASSMENT")
    }

    @Test("Restores cached course history while offline")
    @MainActor
    func cachedCourseHistoryWorksOffline() async throws {
        let cache = CommunityChatCache(inMemoryOnly: true)
        let conversation = NativeCommunityConversation(
            kind: NativeCommunityChatKind.course.rawValue,
            id: "course-1",
            name: "Algorithms",
            code: "IN0007",
            school: "TUM",
            semesterLabel: "SS26",
            memberCount: 12,
            title: nil,
            customTitle: nil,
            participants: nil
        )
        let cachedMessage = NativeCommunityMessage(
            id: "cached-course-message",
            conversationId: "course-1",
            sender: NativeChatAuthor(
                id: "peer-1",
                username: "test_002",
                nickname: "Mina",
                avatarUrl: nil
            ),
            body: "Cached tutorial note",
            createdAt: "2026-07-17T13:00:00.000Z"
        )
        await cache.save(
            accountID: "user-1",
            kind: .course,
            conversationID: "course-1",
            snapshot: CommunityChatCacheSnapshot(
                conversation: conversation,
                messages: [cachedMessage],
                hasMoreOlder: false,
                nextCursor: nil,
                realtimeCursor: "cached-cursor"
            )
        )

        let transport = ChatTestTransport(failCommunityHistory: true)
        let session = makeChatSession(transport: transport)
        await session.login(identifier: "test_001", password: "Password123")

        let store = CommunityChatStore(cache: cache)
        await store.load(
            kind: .course,
            conversationID: "course-1",
            using: session,
            apiBaseURL: URL(string: "https://api.sideseat.test")!,
            enableRealtime: false
        )

        #expect(store.isLoading == false)
        #expect(store.conversation?.displayName == "Algorithms")
        #expect(store.messages.map(\.id) == ["cached-course-message"])
        #expect(store.issue != nil)
    }

    @Test("Separates community cache by account and chat kind")
    @MainActor
    func communityCacheIsolation() async {
        let cache = CommunityChatCache(inMemoryOnly: true)
        let course = NativeCommunityConversation(
            kind: NativeCommunityChatKind.course.rawValue,
            id: "shared-id",
            name: "Course room",
            code: nil,
            school: "TUM",
            semesterLabel: nil,
            memberCount: nil,
            title: nil,
            customTitle: nil,
            participants: nil
        )
        await cache.save(
            accountID: "user-a",
            kind: .course,
            conversationID: "shared-id",
            snapshot: CommunityChatCacheSnapshot(
                conversation: course,
                messages: [],
                hasMoreOlder: false,
                nextCursor: nil,
                realtimeCursor: nil
            )
        )

        #expect(await cache.load(accountID: "user-a", kind: .course, conversationID: "shared-id") != nil)
        #expect(await cache.load(accountID: "user-a", kind: .group, conversationID: "shared-id") == nil)
        #expect(await cache.load(accountID: "user-b", kind: .course, conversationID: "shared-id") == nil)
    }

    @MainActor
    private func makeChatSession(transport: ChatTestTransport) -> SessionStore {
        SessionStore(
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
    }
}

private actor ChatMemoryCredentialStore: CredentialStore {
    private var token: String?
    func refreshToken() -> String? { token }
    func save(refreshToken: String) { token = refreshToken }
    func clear() { token = nil }
}

private final class ChatNotificationProbe: @unchecked Sendable {
    private let lock = NSLock()
    private var names = Set<Notification.Name>()

    func record(_ name: Notification.Name) {
        lock.lock()
        names.insert(name)
        lock.unlock()
    }

    func received(_ name: Notification.Name) -> Bool {
        lock.lock()
        defer { lock.unlock() }
        return names.contains(name)
    }
}

private actor ChatTestTransport: APITransport {
    private let failDirectHistory: Bool
    private let failCommunityHistory: Bool
    private let failInbox: Bool
    private(set) var readMarked = false
    private(set) var courseReadMarked = false
    private(set) var groupReadMarked = false
    private(set) var sentBodies: [String] = []
    private(set) var writeKeys: [String] = []
    private(set) var lastReplyToId: String?
    private(set) var lastLocationLat: Double?
    private(set) var lastLocationLng: Double?
    private(set) var lastLocationName: String?
    private(set) var lastReportMessageID: String?
    private(set) var lastReportCourseMessageID: String?
    private(set) var lastReportGroupMessageID: String?
    private(set) var lastReportReason: String?
    private(set) var deletedMessageID: String?
    private(set) var deletedCourseMessageID: String?
    private(set) var deletedGroupMessageID: String?
    private(set) var pinnedPaths: [String] = []
    private(set) var hiddenPaths: [String] = []
    private(set) var acceptedPlanIDs: [String] = []
    private var messageCounter = 2
    private var courseMessageCounter = 1
    private var groupMessageCounter = 1
    private var directPinned = true

    init(
        failDirectHistory: Bool = false,
        failCommunityHistory: Bool = false,
        failInbox: Bool = false
    ) {
        self.failDirectHistory = failDirectHistory
        self.failCommunityHistory = failCommunityHistory
        self.failInbox = failInbox
    }

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
            if failInbox {
                throw URLError(.notConnectedToInternet)
            }
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
            lastReportGroupMessageID = body?["groupChatMessageId"] as? String
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
                    let name = body?["locationName"] as? String
                    lastLocationLat = lat
                    lastLocationLng = lng
                    lastLocationName = name
                    return response(
                        request,
                        201,
                        #"{"data":{"id":"\#(messageID)","connectionId":"connection-1","sender":{"id":"user-1","username":"test_001","nickname":"Test User","avatarUrl":null},"type":"LOCATION","body":null,"imageUrl":null,"location":{"latitude":\#(lat),"longitude":\#(lng),"name":"\#(name ?? "Location")"},"availabilityShareId":null,"planRequestId":null,"replyTo":\#(replyJSON),"deletedAt":null,"createdAt":"2026-07-17T12:01:00.000Z"}}"#
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
            if failDirectHistory {
                throw URLError(.notConnectedToInternet)
            }
            return response(
                request,
                200,
                #"{"data":{"connection":{"id":"connection-1","isSelfNotes":false,"displayName":"Mina","peer":{"id":"peer-1","username":"test_002","nickname":"Mina","avatarUrl":null}},"messages":[{"id":"msg-1","connectionId":"connection-1","sender":{"id":"peer-1","username":"test_002","nickname":"Mina","avatarUrl":null},"type":"TEXT","body":"See you?","imageUrl":null,"location":null,"availabilityShareId":null,"planRequestId":null,"replyTo":null,"deletedAt":null,"createdAt":"2026-07-17T12:00:00.000Z"}]},"meta":{"hasMore":false,"nextCursor":null,"realtimeCursor":"cursor-1"}}"#
            )
        case "/api/v1/connections/connection-1/read":
            readMarked = true
            return response(request, 200, #"{"data":{"readAt":"2026-07-17T12:00:30.000Z"}}"#)
        case "/api/v1/plans/plan-accepted/accept":
            acceptedPlanIDs.append("plan-accepted")
            return response(
                request,
                200,
                #"{"data":{"plan":{"id":"plan-accepted","connectionId":"connection-1","status":"ACCEPTED","planType":"CUSTOM","title":"Dinner in town","location":"Maxvorstadt","message":null,"startTime":"2026-08-07T18:00:00.000Z","endTime":"2026-08-07T19:30:00.000Z","proposer":{"id":"peer-1","username":"test_002","nickname":"Mina","avatarUrl":null},"receiver":{"id":"user-1","username":"test_001","nickname":"Test User","avatarUrl":null},"counterOfId":null,"availabilityShareId":null,"scheduleShareLinkId":null,"createdAt":"2026-08-05T12:00:00.000Z","updatedAt":"2026-08-05T12:01:00.000Z"}}}"#
            )
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
            if failCommunityHistory {
                throw URLError(.notConnectedToInternet)
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
                let replyJSON: String
                if let replyToId = lastReplyToId {
                    replyJSON = #"{"id":"\#(replyToId)","sender":{"id":"peer-1","username":"test_002","nickname":"Mina","avatarUrl":null},"body":"Library at 4?","deletedAt":null}"#
                } else {
                    replyJSON = "null"
                }
                return response(
                    request,
                    201,
                    #"{"data":{"id":"\#(messageID)","conversationId":"group-1","sender":{"id":"user-1","username":"test_001","nickname":"Test User","avatarUrl":null},"type":"TEXT","body":"\#(text)","replyTo":\#(replyJSON),"deletedAt":null,"createdAt":"2026-07-17T14:01:00.000Z"}}"#
                )
            }
            if failCommunityHistory {
                throw URLError(.notConnectedToInternet)
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
                if path.hasPrefix("/api/group-chats/group-1/messages/") {
                    deletedGroupMessageID = path.split(separator: "/").last.map(String.init)
                    return response(request, 200, #"{"success":true,"data":{"id":"\#(deletedGroupMessageID ?? "")"}}"#)
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
