import CoreGraphics
import Foundation
import Observation
import Testing
@testable import SideSeat

@Suite("Meet Again private state")
struct MeetAgainPrivateStateTests {
    private func plan(available: Bool? = true) -> NativePlanRequest {
        NativePlanRequest(
            id: "local-plan", connectionId: "local-connection", status: "ACCEPTED",
            planType: "CUSTOM", title: "Coffee", location: nil, message: nil,
            startTime: "2026-01-01T10:00:00Z", endTime: "2026-01-01T11:00:00Z",
            proposer: NativePlanAuthor(id: "a", username: "a", nickname: nil, avatarUrl: nil),
            receiver: NativePlanAuthor(id: "b", username: "b", nickname: nil, avatarUrl: nil),
            counterOfId: nil, availabilityShareId: nil, scheduleShareLinkId: nil,
            meetAgainAvailable: available,
            createdAt: "2026-01-01T09:00:00Z", updatedAt: "2026-01-01T09:00:00Z"
        )
    }

    @Test("Only the viewer's own occurred answer opens the private prompt")
    func ownOutcomeAndPermission() {
        let original = plan()
        #expect(!original.showsMeetAgain)
        let occurred = original.replacingViewerOutcome(with: "OCCURRED")
        #expect(occurred.showsMeetAgain)
        let permission = occurred.replacingViewerMeetAgain(with: "YES")
        #expect(permission.viewerOutcome == "OCCURRED")
        #expect(permission.viewerMeetAgain == "YES")
        let withdrawn = permission.replacingViewerMeetAgain(with: "WITHDRAWN")
        #expect(withdrawn.viewerOutcome == "OCCURRED")
        let corrected = permission.replacingViewerOutcome(with: "DID_NOT_OCCUR")
        #expect(!corrected.showsMeetAgain)
        #expect(corrected.viewerMeetAgain == "WITHDRAWN")
    }

    @Test("Older servers hide the feature; existing permission remains withdrawable during a kill switch")
    func rollingClientAndKillSwitch() throws {
        let old = plan(available: nil).replacingViewerOutcome(with: "OCCURRED")
        #expect(!old.showsMeetAgain)
        let disabled = plan(available: false).replacingViewerOutcome(with: "OCCURRED")
        #expect(!disabled.showsMeetAgain)
        #expect(disabled.replacingViewerMeetAgain(with: "YES").showsMeetAgain)
        let data = try JSONEncoder().encode(old)
        let decoded = try JSONDecoder().decode(NativePlanRequest.self, from: data)
        #expect(decoded.viewerMeetAgain == nil)
        #expect(decoded.meetAgainAvailable == nil)
    }
}

@Suite("Inbox previews")
struct InboxPreviewTests {
    @Test("Plan previews retain the plan title")
    func planPreviewTitle() {
        let peer = NativeChatAuthor(id: "peer", username: "peer", nickname: "Peer", avatarUrl: nil)
        let row = NativeInboxConversation(
            kind: .direct,
            id: "connection",
            displayName: "Peer",
            avatarUrl: nil,
            participantAvatars: [],
            unreadCount: 1,
            pinned: false,
            lastActivityAt: "2026-08-10T12:00:00Z",
            peer: peer,
            isSelfNotes: false,
            course: nil,
            group: nil,
            lastMessage: NativeInboxLastMessage(
                id: "plan-message",
                sender: peer,
                type: "PLAN_REQUEST_CARD",
                body: "Coffee after class",
                imageUrl: nil,
                deletedAt: nil,
                createdAt: "2026-08-10T12:00:00Z"
            )
        )

        #expect(row.previewText.contains("Coffee after class"))
    }
}

@Suite("Chat initial viewport")
struct ChatInitialViewportPolicyTests {
    @Test("Reveals a bottom-anchored cache immediately and waits when no cache exists")
    func cacheAwareReveal() {
        #expect(!ChatInitialViewportPolicy.canReveal(
            hasPreparedViewport: true,
            hasCompletedInitialLoad: false,
            hasCachedSnapshot: false,
            isVisible: false
        ))
        #expect(ChatInitialViewportPolicy.canReveal(
            hasPreparedViewport: true,
            hasCompletedInitialLoad: false,
            hasCachedSnapshot: true,
            isVisible: false
        ))
        #expect(ChatInitialViewportPolicy.canReveal(
            hasPreparedViewport: true,
            hasCompletedInitialLoad: true,
            hasCachedSnapshot: false,
            isVisible: false
        ))
        #expect(!ChatInitialViewportPolicy.canReveal(
            hasPreparedViewport: true,
            hasCompletedInitialLoad: true,
            hasCachedSnapshot: true,
            isVisible: true
        ))
        #expect(!ChatInitialViewportPolicy.canReveal(
            hasPreparedViewport: true,
            hasCompletedInitialLoad: true,
            hasCachedSnapshot: false,
            isVisible: false,
            hasPositionedInitialTarget: false
        ))
    }
}

@Suite("Direct chat plan focus")
struct DirectChatPlanFocusTests {
    @Test("Uses the newest message card matching the requested plan")
    func newestMatchingCard() {
        let sender = NativeChatAuthor(
            id: "peer",
            username: "peer",
            nickname: "Peer",
            avatarUrl: nil
        )
        let messages = [
            NativeDirectMessage(
                id: "plan-request",
                connectionId: "connection",
                sender: sender,
                type: "PLAN_REQUEST_CARD",
                body: nil,
                createdAt: "2026-08-20T10:00:00.000Z",
                planRequestId: "plan-1"
            ),
            NativeDirectMessage(
                id: "unrelated",
                connectionId: "connection",
                sender: sender,
                type: "TEXT",
                body: "Later message",
                createdAt: "2026-08-20T10:01:00.000Z"
            ),
            NativeDirectMessage(
                id: "plan-confirmed",
                connectionId: "connection",
                sender: sender,
                type: "PLAN_CONFIRMED_CARD",
                body: nil,
                createdAt: "2026-08-20T10:02:00.000Z",
                planRequestId: "plan-1"
            ),
            NativeDirectMessage(
                id: "action-context",
                connectionId: "connection",
                sender: sender,
                type: "ACTION_INTEREST_CARD",
                body: nil,
                createdAt: "2026-08-20T10:03:00.000Z",
                actionInterestId: "interest-1"
            ),
        ]

        #expect(
            DirectChatStore.messageID(forPlanID: "plan-1", in: messages)
                == "plan-confirmed"
        )
        #expect(DirectChatStore.messageID(forPlanID: "missing", in: messages) == nil)
        #expect(
            DirectChatStore.messageID(forActionInterestID: "interest-1", in: messages)
                == "action-context"
        )
    }
}

@Suite("Action context message attribution")
struct ActionContextMessageAttributionTests {
    @Test("All direct message request types encode the exact Action Context")
    func requestEncoding() throws {
        func encodedContextID<Request: Encodable>(_ request: Request) throws -> String? {
            let data = try JSONEncoder().encode(request)
            let object = try #require(
                JSONSerialization.jsonObject(with: data) as? [String: Any]
            )
            return object["actionContextId"] as? String
        }

        #expect(try encodedContextID(
            NativeDirectTextMessageRequest(
                body: "Hello",
                actionContextId: "context-1"
            )
        ) == "context-1")
        #expect(try encodedContextID(
            NativeDirectImageMessageRequest(
                imageUrl: "https://example.com/photo.jpg",
                actionContextId: "context-1"
            )
        ) == "context-1")
        #expect(try encodedContextID(
            NativeDirectLocationMessageRequest(
                locationLat: 48.137,
                locationLng: 11.575,
                actionContextId: "context-1"
            )
        ) == "context-1")
    }

    @Test("Plan and message focus retain their source Action Context")
    func focusResolution() {
        let sender = NativeChatAuthor(
            id: "peer",
            username: "peer",
            nickname: "Peer",
            avatarUrl: nil
        )
        let messages = [
            NativeDirectMessage(
                id: "source",
                connectionId: "connection",
                sender: sender,
                type: "ACTION_INTEREST_CARD",
                body: nil,
                createdAt: "2026-08-20T10:00:00.000Z",
                actionInterestId: "interest-1",
                actionContextId: "context-1"
            ),
            NativeDirectMessage(
                id: "plan",
                connectionId: "connection",
                sender: sender,
                type: "PLAN_REQUEST_CARD",
                body: nil,
                createdAt: "2026-08-20T10:01:00.000Z",
                planRequestId: "revision-1",
                actionContextId: "context-1"
            ),
            NativeDirectMessage(
                id: "reply",
                connectionId: "connection",
                sender: sender,
                type: "TEXT",
                body: "Works for me",
                createdAt: "2026-08-20T10:02:00.000Z",
                actionContextId: "context-1"
            ),
            NativeDirectMessage(
                id: "plan-latest",
                connectionId: "connection",
                sender: sender,
                type: "PLAN_CONFIRMED_CARD",
                body: nil,
                createdAt: "2026-08-20T10:03:00.000Z",
                planRequestId: "revision-1",
                actionContextId: "context-1"
            ),
            NativeDirectMessage(
                id: "commitment-latest",
                connectionId: "connection",
                sender: sender,
                type: "PLAN_REQUEST_CARD",
                body: nil,
                createdAt: "2026-08-20T10:04:00.000Z",
                planRequestId: "revision-2",
                planRequest: NativePlanRequest(
                    id: "revision-2",
                    connectionId: "connection",
                    commitmentId: "commitment-1",
                    originContextId: "context-1",
                    status: "PENDING",
                    planType: "STUDY",
                    title: "Review",
                    location: nil,
                    message: nil,
                    startTime: "2026-08-21T10:00:00.000Z",
                    endTime: "2026-08-21T11:00:00.000Z",
                    proposer: NativePlanAuthor(id: "peer", username: "peer", nickname: nil, avatarUrl: nil),
                    receiver: NativePlanAuthor(id: "viewer", username: "viewer", nickname: nil, avatarUrl: nil),
                    counterOfId: nil,
                    availabilityShareId: nil,
                    scheduleShareLinkId: nil,
                    createdAt: "2026-08-20T10:04:00.000Z",
                    updatedAt: "2026-08-20T10:04:00.000Z"
                ),
                actionContextId: "context-1"
            ),
        ]

        #expect(DirectChatStore.actionContextID(
            for: .actionContext(id: "context-1"),
            in: messages
        ) == "context-1")
        #expect(DirectChatStore.actionContextID(
            for: .actionInterest(id: "interest-1"),
            in: messages
        ) == "context-1")
        #expect(DirectChatStore.actionContextID(
            for: .plan(commitmentID: "commitment-1", revisionID: "revision-1"),
            in: messages
        ) == "context-1")
        #expect(DirectChatStore.actionContextID(
            for: .message(id: "reply"),
            in: messages
        ) == "context-1")
        #expect(DirectChatStore.messageID(
            forPlanCommitmentID: "commitment-1",
            revisionID: "revision-1",
            in: messages
        ) == "plan-latest")
        #expect(DirectChatStore.messageID(forPlanID: "revision-1", in: messages) == "plan-latest")
        #expect(DirectChatStore.messageID(
            forPlanCommitmentID: "commitment-1",
            revisionID: nil,
            in: messages
        ) == "commitment-latest")
        #expect(
            DirectChatStore.presentationMessages(from: messages)
                .filter { $0.planRequestId == "revision-1" }
                .map(\.id) == ["plan-latest"]
        )
    }
}

@Suite("Action-to-Plan inheritance")
struct ActionToPlanInheritanceTests {
    @Test("Generated opportunity titles localize without changing authored or saved titles")
    func localizesGeneratedOpportunityTitle() throws {
        let data = Data("""
        {
          "id":"opportunity", "policyVersion":"MUTUAL_OPPORTUNITY_V1", "topic":"EXPLORE",
          "context": {
            "version":1, "sourceKind":"MUTUAL_OPPORTUNITY", "sourceId":"opportunity",
            "title":"Explore together", "startsAt":"2026-09-09T10:00:00Z",
            "endsAt":"2026-09-09T10:30:00Z", "location":null, "planType":"CUSTOM",
            "participantIds":["a","b"], "author":{"id":"a","displayName":"QA"}, "course":null,
            "activityText":null, "sportTag":null, "sportOtherNote":null
          }
        }
        """.utf8)
        let source = try JSONDecoder().decode(NativeMutualOpportunitySource.self, from: data)
        #expect(source.context.localizedTitle == AppLocalization.string("Explore together"))
        #expect(source.planDraft.title == source.context.localizedTitle)
        #expect(source.planDraft.origin == NativePlanOriginReference(kind: "MUTUAL_OPPORTUNITY", id: "opportunity"))
        #expect(source.planDraft.startTime == source.context.startsAt)
        #expect(source.planDraft.endTime == source.context.endsAt)
        #expect(source.planDraft.participantIds == ["a", "b"])
        #expect(source.context.title == "Explore together")

        // Exact authored text may coincide with a translation key.
        let authoredData = Data(String(decoding: data, as: UTF8.self)
            .replacingOccurrences(of: "\"activityText\":null", with: "\"activityText\":\"Explore together\"").utf8)
        let authored = try JSONDecoder().decode(NativeMutualOpportunitySource.self, from: authoredData)
        #expect(authored.context.activityText == "Explore together")
        #expect(authored.context.localizedTitle == "Explore together")
        #expect(authored.planDraft.title == "Explore together")

        let buddyData = Data(String(decoding: data, as: UTF8.self)
            .replacingOccurrences(of: "\"sourceKind\":\"MUTUAL_OPPORTUNITY\"", with: "\"sourceKind\":\"BUDDY_POST\"").utf8)
        let buddy = try JSONDecoder().decode(NativeMutualOpportunitySource.self, from: buddyData)
        #expect(buddy.context.localizedTitle == "Explore together")
    }

    @Test("Every generated title has Chinese and German copy, including neutral related titles")
    func generatedOpportunityTitleTranslations() {
        let titles = [
            "Coffee together", "Study together", "Study side by side", "Do sports together",
            "Explore together", "Eat together", "Go to an event together", "Play basketball together",
            "Play badminton together", "Play table tennis together", "Play football together",
            "Play volleyball together", "Play tennis together", "Work out together", "Go running together",
            "Go hiking together", "Go cycling together", "Go swimming together", "Go skiing together",
            "Go climbing together", "Do yoga together", "%@ together",
        ]
        for language in [AppLanguage.simplifiedChinese, .german, .english] {
            let bundle = AppLocalization.localizationBundle(for: language)
            for title in titles {
                let value = bundle.localizedString(forKey: title, value: nil, table: nil)
                #expect(!value.isEmpty)
                if language == .english { #expect(value == title) }
                else { #expect(value != title) }
            }
        }
        #expect(AppLocalization.localizationBundle(for: .simplifiedChinese)
            .localizedString(forKey: "Explore together", value: nil, table: nil) == "一起探索")
    }

    @Test("Plan draft inherits all available action fields and trusted origin reference")
    func inheritsActionContext() {
        let context = NativeActionContext(
            version: 1,
            sourceKind: "COURSE_ACTION",
            sourceId: "post-1",
            title: "Review algorithms",
            startsAt: "2026-09-01T16:00:00.000Z",
            endsAt: "2026-09-01T17:30:00.000Z",
            location: "Main library",
            planType: "STUDY",
            participantIds: ["viewer", "author"],
            author: NativeActionContextAuthor(id: "author", displayName: "Mina"),
            course: NativeActionContextCourse(id: "course-1", code: "IN0001", name: "Algorithms")
        )
        let draft = NativePlanDraft(context: context, interestID: "interest-1")

        #expect(draft.title == context.title)
        #expect(draft.startTime == context.startsAt)
        #expect(draft.endTime == context.endsAt)
        #expect(draft.location == context.location)
        #expect(draft.planType == "STUDY")
        #expect(draft.origin == NativePlanOriginReference(kind: "ACTION_INTEREST", id: "interest-1"))
    }
}

@Suite("Chat composer return key")
struct ChatMessageGroupingTests {
    @Test("Consecutive messages from one sender join within two minutes")
    func continuationWindow() {
        let first = Date(timeIntervalSince1970: 1_000)

        #expect(ChatMessageGrouping.isContinuation(
            previousSenderID: "peer",
            previousDate: first,
            senderID: "peer",
            date: first.addingTimeInterval(90)
        ))
        #expect(!ChatMessageGrouping.isContinuation(
            previousSenderID: "peer",
            previousDate: first,
            senderID: "me",
            date: first.addingTimeInterval(30)
        ))
        #expect(!ChatMessageGrouping.isContinuation(
            previousSenderID: "peer",
            previousDate: first,
            senderID: "peer",
            date: first.addingTimeInterval(121)
        ))
    }

    @Test("Timeline timestamps appear only after meaningful gaps")
    func timestampWindow() {
        let first = Date(timeIntervalSince1970: 10_000)

        #expect(ChatMessageGrouping.shouldShowTimestamp(previousDate: nil, date: first))
        #expect(!ChatMessageGrouping.shouldShowTimestamp(
            previousDate: first,
            date: first.addingTimeInterval(14 * 60)
        ))
        #expect(ChatMessageGrouping.shouldShowTimestamp(
            previousDate: first,
            date: first.addingTimeInterval(15 * 60)
        ))
    }
}

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

@MainActor
@Suite("Chat composer draft")
struct ChatComposerDraftTests {
    @Test("Tracks native text without treating whitespace as sendable")
    func tracksNativeTextState() {
        let draft = ChatComposerDraft()

        draft.updateText("   ")
        #expect(draft.text == "   ")
        #expect(!draft.isEmpty)
        #expect(!draft.canSend)

        draft.updateText("  hello")
        #expect(draft.text == "  hello")
        #expect(draft.canSend)
        #expect(draft.trimmedText == "hello")
    }

    @Test("Clearing resets the native text and presentation state")
    func clearsDraftState() {
        let draft = ChatComposerDraft()
        draft.updateText("连续发送")
        let initialResetVersion = draft.resetVersion

        draft.clear()

        #expect(draft.text.isEmpty)
        #expect(draft.isEmpty)
        #expect(!draft.canSend)
        #expect(draft.resetVersion == initialResetVersion + 1)
    }

    @Test("Continuous typing does not invalidate the SwiftUI presentation state")
    func continuousTypingAvoidsPresentationInvalidation() async {
        let draft = ChatComposerDraft()
        draft.updateText("a")

        await confirmation("No presentation invalidation", expectedCount: 0) { invalidated in
            withObservationTracking {
                _ = draft.isEmpty
                _ = draft.canSend
            } onChange: {
                invalidated()
            }

            draft.updateText("ab")
            draft.updateText("abc")
            await Task.yield()
        }

        #expect(draft.text == "abc")
        #expect(draft.canSend)
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

    @Test("Keyboard presentation keeps a bottom thread pinned")
    func keyboardPresentationKeepsBottomPinned() {
        var state = ChatKeyboardBottomAnchorState()

        let focusShouldPin = state.composerFocusChanged(isFocused: true, isNearBottom: true)
        state.nearBottomChanged(false)
        let keyboardShouldPin = state.keyboardVisibilityChanged(
            isVisible: true,
            isNearBottom: false
        )

        #expect(focusShouldPin)
        #expect(state.isPinned)
        #expect(keyboardShouldPin == true)
    }

    @Test("A user scroll after keyboard presentation releases the bottom pin")
    func userScrollAfterKeyboardPresentationReleasesPin() {
        var state = ChatKeyboardBottomAnchorState()

        _ = state.composerFocusChanged(isFocused: true, isNearBottom: true)
        _ = state.keyboardVisibilityChanged(isVisible: true, isNearBottom: true)
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
        let keyboardShouldPin = state.keyboardVisibilityChanged(
            isVisible: true,
            isNearBottom: false
        )

        #expect(!focusShouldPin)
        #expect(keyboardShouldPin == false)
    }

    @Test("Keyboard presentation does not break the next composer focus")
    func keyboardPresentationKeepsNextFocusPinned() {
        var state = ChatKeyboardBottomAnchorState()

        _ = state.composerFocusChanged(isFocused: true, isNearBottom: true)
        _ = state.keyboardVisibilityChanged(isVisible: true, isNearBottom: false)
        state.nearBottomChanged(false)
        let dismissShouldPin = state.composerFocusChanged(isFocused: false, isNearBottom: false)
        let secondFocusShouldPin = state.composerFocusChanged(isFocused: true, isNearBottom: false)

        #expect(state.isPinned)
        #expect(dismissShouldPin)
        #expect(secondFocusShouldPin)
    }

    @Test("Keyboard candidate-bar changes do not request another bottom scroll")
    func keyboardCandidateBarChangeIsIgnored() {
        var state = ChatKeyboardBottomAnchorState()

        let presentation = state.keyboardVisibilityChanged(isVisible: true, isNearBottom: true)
        let candidateBarChange = state.keyboardVisibilityChanged(isVisible: true, isNearBottom: false)

        #expect(presentation == true)
        #expect(candidateBarChange == nil)
        #expect(state.isKeyboardVisible)
    }

    @Test("Keyboard frame visibility uses its intersection with the iPhone screen")
    func keyboardFrameVisibility() {
        let screen = CGRect(x: 0, y: 0, width: 390, height: 844)

        #expect(ChatKeyboardTransition.isVisible(
            endFrame: CGRect(x: 0, y: 500, width: 390, height: 344),
            screenBounds: screen
        ))
        #expect(!ChatKeyboardTransition.isVisible(
            endFrame: CGRect(x: 0, y: 844, width: 390, height: 344),
            screenBounds: screen
        ))
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
                includedDates: ["2026-08-04", "2026-08-05", "2026-08-06"],
                availabilityStartMinutes: 9 * 60,
                availabilityEndMinutes: 21 * 60
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
        #expect(reveal["availabilityStartMinutes"] as? Int == 540)
        #expect(reveal["availabilityEndMinutes"] as? Int == 1260)
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

    @Test("A peer source card neither counts as a message nor unlocks the gate")
    func sourceCardDoesNotUnlock() {
        let sourceCard = NativeDirectMessage(
            id: "source",
            connectionId: "c1",
            sender: peer,
            type: "ACTION_INTEREST_CARD",
            body: nil,
            createdAt: "2026-07-17T12:01:00.000Z",
            actionContextId: "context-1"
        )
        let messages = [message(id: "mine", sender: me), sourceCard]
        #expect(!DirectChatStore.hasMutualExchange(
            messages: messages,
            viewerID: me.id,
            peerID: peer.id
        ))
        #expect(DirectChatStore.countUnrepliedStreak(
            messagesNewestFirst: Array(messages.reversed()),
            viewerID: me.id,
            peerID: peer.id
        ) == 1)
        #expect(DirectChatStore.messageID(forActionContextID: "context-1", in: messages) == "source")
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
    @Test("Formats the Messages attention badge from 1 through 99+")
    func formatsAttentionBadge() {
        #expect(InboxStore.badgeLabel(for: 0) == nil)
        #expect(InboxStore.badgeLabel(for: 1) == "1")
        #expect(InboxStore.badgeLabel(for: 99) == "99")
        #expect(InboxStore.badgeLabel(for: 100) == "99+")
    }

    @Test("Counts pending Plan decisions and Outcomes as Messages attention")
    func countsPlanResponsesInAttentionBadge() {
        let payload = NativeInboxPayload(
            conversations: [],
            unreadTotal: 0,
            plansNeedingYourAction: 2,
            planOutcomesNeedingYourResponse: 3
        )

        #expect(InboxStore.attentionCount(in: payload) == 5)
        #expect(InboxStore.badgeLabel(for: InboxStore.attentionCount(in: payload)) == "5")
    }

    @Test("Clears the Chats tab badge immediately after reading")
    @MainActor
    func clearsUnreadBadgeImmediately() async throws {
        let session = try await chatSession(transport: ChatTestTransport())
        let store = InboxStore(cache: InboxCache(inMemoryOnly: true))
        await store.load(using: session)

        #expect(store.attentionBadgeLabel == "1")
        store.clearUnread(conversationID: "connection-1")
        #expect(store.attentionBadgeLabel == nil)
        #expect(store.payload?.unreadTotal == 0)
    }

    @Test("Loads merged payload while surfacing only MVP direct conversations")
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
        #expect(store.recent.isEmpty)
    }

    @Test("Filters conversations with client search")
    @MainActor
    func filtersSearch() async throws {
        let transport = ChatTestTransport()
        let session = try await chatSession(transport: transport)
        let store = InboxStore(cache: InboxCache(inMemoryOnly: true))
        await store.load(using: session)

        store.searchQuery = "algorithms"
        #expect(store.filteredConversations.isEmpty)
        #expect(store.hasNoSearchMatches)

        store.searchQuery = "zzzz-no-match"
        #expect(store.filteredConversations.isEmpty)
        #expect(store.hasNoSearchMatches)
    }

    @Test("Shows only direct conversations in the primary MVP inbox")
    @MainActor
    func unifiedConversationKinds() async throws {
        let session = try await chatSession(transport: ChatTestTransport())
        let store = InboxStore(cache: InboxCache(inMemoryOnly: true))
        await store.load(using: session)

        #expect(
            Set(store.filteredConversations.map(\.id))
                == Set(["connection-1"])
        )
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
        #expect(
            ["Shared availability", "共享空闲时间", "Geteilte Verfügbarkeit"]
                .contains(row.preview)
        )
        #expect(row.matches(query: row.preview))
        #expect(row.matches(query: "token"))
        #expect(!row.matches(query: "zzzz"))
    }
}

@Suite("Contact exchange presentation state")
struct ContactExchangePresentationStateTests {
    @Test("Requester cancellation immediately becomes available")
    func canceledIsAvailable() {
        let state = NativeConnectionExchangeState(
            status: "CANCELED",
            role: "requester",
            cooldownUntil: nil
        )

        #expect(state.phase == .available)
    }

    @Test("Pending direction remains explicit")
    func pendingDirection() {
        let outgoing = NativeConnectionExchangeState(
            status: "PENDING",
            role: "requester",
            cooldownUntil: nil
        )
        let incoming = NativeConnectionExchangeState(
            status: "PENDING",
            role: "responder",
            cooldownUntil: nil
        )

        #expect(outgoing.phase == .outgoingPending)
        #expect(incoming.phase == .incomingPending)
    }

    @Test("A declined request preserves its cooldown")
    func declinedHasCooldown() {
        let cooldownUntil = "2026-08-12T10:00:00.000Z"
        let state = NativeConnectionExchangeState(
            status: "DECLINED",
            role: "requester",
            cooldownUntil: cooldownUntil
        )

        #expect(state.phase == .declined(cooldownUntil: cooldownUntil))
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
        let staleServerMessage = NativeDirectMessage(
            id: "stale-server-message",
            connectionId: "connection-1",
            sender: peer,
            type: "PLAN_REQUEST_CARD",
            body: "Deleted plan",
            createdAt: "2026-08-04T12:00:30.000Z"
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
                messages: [pending, staleServerMessage],
                sendStatuses: [pending.id: .failed],
                hasMoreOlder: true,
                nextCursor: "older-cursor",
                realtimeCursor: "realtime-cursor"
            )
        )

        let restored = try #require(
            await cache.load(accountID: "user-1", connectionID: "connection-1")
        )
        #expect(restored.messages == [pending, staleServerMessage])
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
        #expect(!merged.messages.contains(staleServerMessage))
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
        #expect(store.hasCachedSnapshot)
        #expect(store.conversation?.displayName == "Mina")
        #expect(store.messages == [cachedMessage])
    }

    @Test("Authoritative restricted history purges sensitive cached conversation")
    @MainActor
    func restrictedHistoryPurgesCachedConversation() async {
        let cache = DirectChatCache(inMemoryOnly: true)
        let peer = NativeChatAuthor(
            id: "peer-1",
            username: "test_002",
            nickname: "Mina",
            avatarUrl: nil
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
                messages: [
                    NativeDirectMessage(
                        id: "cached-action-context",
                        connectionId: "connection-1",
                        sender: peer,
                        type: "ACTION_INTEREST_CARD",
                        body: "Private study location",
                        createdAt: "2026-08-04T12:00:00.000Z"
                    ),
                ],
                hasMoreOlder: false,
                nextCursor: nil,
                realtimeCursor: "realtime-cursor"
            )
        )

        let transport = ChatTestTransport(directHistoryStatus: 404)
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

        #expect(store.conversation == nil)
        #expect(store.messages.isEmpty)
        #expect(store.hasCachedSnapshot == false)
        #expect(
            await cache.load(accountID: "user-1", connectionID: "connection-1") == nil
        )
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

    @Test("Loads earlier pages until the requested plan card is available")
    @MainActor
    func loadsEarlierPagesForPlanFocus() async throws {
        let transport = ChatTestTransport(paginatePlanHistory: true)
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

        #expect(store.messages.map(\.id) == ["latest-message"])
        let messageID = await store.messageID(
            forPlanID: "older-plan",
            loadingOlderUsing: session
        )

        #expect(messageID == "older-plan-message")
        #expect(store.messages.first?.id == "older-plan-message")
        #expect(!store.hasMoreOlder)
        #expect(await transport.directHistoryRequestCount == 2)
    }

    @Test("Keeps consecutive text sends responsive on a slow connection")
    @MainActor
    func consecutiveSendsStayOptimistic() async throws {
        let transport = ChatTestTransport(holdTextSends: true)
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

        let initialIDs = Set(store.messages.map(\.id))
        let first = Task { await store.sendText("First message", using: session) }
        let second = Task { await store.sendText("Second message", using: session) }

        for _ in 0..<100 where await transport.pendingTextSendCount < 2 {
            try await Task.sleep(for: .milliseconds(5))
        }
        #expect(await transport.pendingTextSendCount == 2)

        let optimisticBodies = Set(
            store.messages
                .filter { $0.id.hasPrefix("local-") }
                .compactMap(\.body)
        )
        #expect(optimisticBodies == ["First message", "Second message"])
        #expect(store.isSending == false)
        #expect(
            store.consumeScrollDecision(previousIDs: initialIDs, isNearBottom: true)
                == .scrollToBottom(animated: true)
        )
        let optimisticIDs = Set(store.messages.map(\.id))

        await transport.releaseTextSends()
        #expect(await first.value)
        #expect(await second.value)
        #expect(Set(await transport.sentBodies) == ["First message", "Second message"])
        #expect(store.messages.allSatisfy { !$0.id.hasPrefix("local-") })
        #expect(
            store.consumeScrollDecision(previousIDs: optimisticIDs, isNearBottom: true)
                == .none
        )
    }

    @Test("A delayed send cannot clear a newer reply target")
    @MainActor
    func delayedSendPreservesNewReply() async throws {
        let transport = ChatTestTransport(holdTextSends: true)
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
        let originalReply = try #require(store.messages.first)
        let newerReply = NativeDirectMessage(
            id: "msg-newer-reply",
            connectionId: "connection-1",
            sender: originalReply.sender,
            type: "TEXT",
            body: "A newer question",
            createdAt: "2026-07-17T12:02:00.000Z"
        )

        store.beginReply(to: originalReply)
        let send = Task {
            await store.sendText("First reply", replyTo: originalReply, using: session)
        }
        for _ in 0..<100 where await transport.pendingTextSendCount < 1 {
            try await Task.sleep(for: .milliseconds(5))
        }
        #expect(await transport.pendingTextSendCount == 1)

        store.beginReply(to: newerReply)
        #expect(store.replyTarget?.id == newerReply.id)

        await transport.releaseTextSends()
        #expect(await send.value)
        #expect(store.replyTarget?.id == newerReply.id)
    }

    @Test("A failed optimistic text remains retryable without duplication")
    @MainActor
    func failedTextRetriesInPlace() async throws {
        let transport = ChatTestTransport(textSendFailures: 1)
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

        #expect(await store.sendText("Retry me", using: session) == false)
        let failed = try #require(store.messages.first(where: { $0.body == "Retry me" }))
        #expect(failed.id.hasPrefix("local-"))
        #expect(store.sendStatuses[failed.id] == .failed)

        #expect(await store.retryFailedSend(failed.id, using: session))
        #expect(store.messages.filter { $0.body == "Retry me" }.count == 1)
        #expect(store.messages.allSatisfy { !$0.id.hasPrefix("local-") })
        #expect(await transport.sentBodies == ["Retry me"])
        #expect(await transport.writeKeys.count == 2)
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

    @Test("Blocking immediately clears chat and refreshes plan-backed surfaces")
    @MainActor
    func blockingClearsChatAndRefreshesPlanSurfaces() async {
        let cache = DirectChatCache(inMemoryOnly: true)
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

        let store = DirectChatStore(cache: cache)
        await store.load(
            connectionID: "connection-1",
            using: session,
            apiBaseURL: URL(string: "https://api.sideseat.test")!,
            enableRealtime: false
        )
        #expect(store.conversation != nil)
        #expect(
            await cache.load(accountID: "user-1", connectionID: "connection-1") != nil
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
        defer { observers.forEach(NotificationCenter.default.removeObserver) }

        #expect(await store.blockPeer(using: session))
        #expect(store.conversation == nil)
        #expect(store.messages.isEmpty)
        #expect(
            await cache.load(accountID: "user-1", connectionID: "connection-1") == nil
        )
        #expect(probe.received(.sideSeatCalendarNeedsRefresh))
        #expect(probe.received(.sideSeatPlansNeedsRefresh))
        #expect(probe.received(.sideSeatInboxNeedsRefresh))
    }

    @Test("Plan mutations select v2 only from the authoritative coordination policy")
    @MainActor
    func planMutationNetworkRouting() async throws {
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

        let v2 = planFixture(
            id: "revision-v2",
            commitmentID: "commitment-v2",
            contextID: "context-v2",
            coordinationPolicy: "CREATOR_GATED_V2"
        )
        _ = await store.acceptPlan(v2, using: session)
        _ = await store.declinePlan(v2, using: session)
        _ = await store.withdrawPlan(v2, using: session)

        // DB-05 may backfill these stable identifiers on a DIRECT_V1 Plan.
        // They must never be treated as proof that the v2 routes own it.
        let legacy = planFixture(
            id: "revision-legacy",
            commitmentID: "legacy-commitment",
            contextID: "legacy-context",
            coordinationPolicy: "DIRECT_CONVERSATION_V1"
        )
        _ = await store.acceptPlan(legacy, using: session)
        _ = await store.declinePlan(legacy, using: session)

        #expect(await transport.planMutationRequests == [
            "POST /api/v1/action-coordination/v2/plans/revision-v2/accept",
            "POST /api/v1/action-coordination/v2/plans/revision-v2/decline",
            "DELETE /api/v1/action-coordination/v2/plans/revision-v2",
            "POST /api/v1/plans/revision-legacy/accept",
            "POST /api/v1/plans/revision-legacy/decline",
        ])
    }

    @Test("Counter target requires both identifiers and the creator-gated policy")
    func counterTargetRouting() {
        let v2 = planFixture(
            id: "revision-v2",
            commitmentID: "commitment-v2",
            contextID: "context-v2",
            coordinationPolicy: "CREATOR_GATED_V2"
        )
        #expect(PlanSubmissionTarget.counter(for: v2) == .actionCounter(
            revisionID: "revision-v2",
            commitmentID: "commitment-v2",
            contextID: "context-v2"
        ))
        #expect(
            PlanSubmissionTarget.counter(for: planFixture(
                id: "revision-legacy",
                commitmentID: "legacy-commitment",
                contextID: "legacy-context",
                coordinationPolicy: "DIRECT_CONVERSATION_V1"
            )) == .legacyCounter(planID: "revision-legacy")
        )
    }

    @Test("Plan recovery can focus a commitment without a revision")
    func commitmentOnlySubmissionFocus() {
        let result = PlanSubmissionResult(
            connectionID: "connection-winning",
            commitmentID: "commitment-winning",
            revisionID: nil,
            contextID: nil
        )
        #expect(
            result.focus == .plan(
                commitmentID: "commitment-winning",
                revisionID: nil
            )
        )
    }

    @Test("Structured workflow cards cannot use generic message deletion")
    func structuredCardsAreNotUserDeletable() {
        let sender = NativeChatAuthor(
            id: "user-1",
            username: "viewer",
            nickname: "Viewer",
            avatarUrl: nil
        )
        let structuredTypes = [
            "AVAILABILITY_CARD",
            "SCHEDULE_SHARE_CARD",
            "ACTION_INTEREST_CARD",
            "PLAN_REQUEST_CARD",
            "PLAN_CONFIRMED_CARD",
            "SYSTEM",
        ]

        for type in structuredTypes {
            let message = NativeDirectMessage(
                id: "message-\(type)",
                connectionId: "connection-1",
                sender: sender,
                type: type,
                body: nil,
                createdAt: "2026-08-31T12:00:00.000Z"
            )
            #expect(message.supportsUserDeletion == false)
        }

        for type in ["TEXT", "IMAGE", "LOCATION"] {
            let message = NativeDirectMessage(
                id: "message-\(type)",
                connectionId: "connection-1",
                sender: sender,
                type: type,
                body: nil,
                createdAt: "2026-08-31T12:00:00.000Z"
            )
            #expect(message.supportsUserDeletion)
        }
    }

    @Test("Retryable Plan conflicts preserve the original idempotency key")
    @MainActor
    func retryablePlanConflictKeepsIdempotencyKey() async {
        let transport = ChatTestTransport(planMutationRetryableConflicts: 1)
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
        let plan = planFixture(
            id: "revision-v2",
            commitmentID: "commitment-v2",
            contextID: "context-v2",
            coordinationPolicy: "CREATOR_GATED_V2"
        )

        #expect(await store.acceptPlan(plan, using: session) == false)
        #expect(await store.acceptPlan(plan, using: session) == true)
        let keys = await transport.planMutationIdempotencyKeys
        #expect(keys.count == 2)
        #expect(keys.first == keys.last)
    }

    private func planFixture(
        id: String,
        commitmentID: String?,
        contextID: String?,
        coordinationPolicy: String?
    ) -> NativePlanRequest {
        NativePlanRequest(
            id: id,
            connectionId: "connection-1",
            commitmentId: commitmentID,
            originContextId: contextID,
            coordinationPolicy: coordinationPolicy,
            status: "PENDING",
            planType: "STUDY",
            title: "Review",
            location: nil,
            message: nil,
            startTime: "2026-09-01T10:00:00.000Z",
            endTime: "2026-09-01T11:00:00.000Z",
            proposer: NativePlanAuthor(id: "peer-1", username: "peer", nickname: nil, avatarUrl: nil),
            receiver: NativePlanAuthor(id: "user-1", username: "viewer", nickname: nil, avatarUrl: nil),
            counterOfId: nil,
            availabilityShareId: nil,
            scheduleShareLinkId: nil,
            createdAt: "2026-08-31T10:00:00.000Z",
            updatedAt: "2026-08-31T10:00:00.000Z"
        )
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
    private let directHistoryStatus: Int?
    private let failCommunityHistory: Bool
    private let failInbox: Bool
    private let holdTextSends: Bool
    private let paginatePlanHistory: Bool
    private var remainingTextSendFailures: Int
    private var textSendWaiters: [CheckedContinuation<Void, Never>] = []
    private(set) var pendingTextSendCount = 0
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
    private(set) var planMutationRequests: [String] = []
    private(set) var planMutationIdempotencyKeys: [String] = []
    private(set) var directHistoryRequestCount = 0
    private var messageCounter = 2
    private var courseMessageCounter = 1
    private var groupMessageCounter = 1
    private var directPinned = true
    private var remainingPlanMutationRetryableConflicts: Int

    init(
        failDirectHistory: Bool = false,
        directHistoryStatus: Int? = nil,
        failCommunityHistory: Bool = false,
        failInbox: Bool = false,
        holdTextSends: Bool = false,
        textSendFailures: Int = 0,
        paginatePlanHistory: Bool = false,
        planMutationRetryableConflicts: Int = 0
    ) {
        self.failDirectHistory = failDirectHistory
        self.directHistoryStatus = directHistoryStatus
        self.failCommunityHistory = failCommunityHistory
        self.failInbox = failInbox
        self.holdTextSends = holdTextSends
        remainingTextSendFailures = textSendFailures
        self.paginatePlanHistory = paginatePlanHistory
        remainingPlanMutationRetryableConflicts = planMutationRetryableConflicts
    }

    func releaseTextSends() {
        let waiters = textSendWaiters
        textSendWaiters.removeAll()
        waiters.forEach { $0.resume() }
    }

    func data(for request: URLRequest) async throws -> (Data, URLResponse) {
        let path = request.url?.path ?? ""
        let isLegacyMutation = path == "/api/v1/plans/revision-legacy/accept"
            || path == "/api/v1/plans/revision-legacy/decline"
        if path.hasPrefix("/api/v1/action-coordination/v2/plans/") || isLegacyMutation
        {
            planMutationRequests.append("\(request.httpMethod ?? "") \(path)")
            if let key = request.value(forHTTPHeaderField: "Idempotency-Key") {
                planMutationIdempotencyKeys.append(key)
            }
            if remainingPlanMutationRetryableConflicts > 0 {
                remainingPlanMutationRetryableConflicts -= 1
                return response(
                    request,
                    409,
                    #"{"error":{"code":"REQUEST_IN_PROGRESS","message":"The command is still running.","retryable":true}}"#
                )
            }
            if path.hasPrefix("/api/v1/action-coordination/v2/plans/") {
                let status = path.hasSuffix("/accept") ? "ACCEPTED" : (request.httpMethod == "DELETE" ? "CANCELED" : "DECLINED")
                return response(request, 200, #"{"plan":{"commitmentId":"commitment-v2","revisionId":"revision-v2","connectionId":"connection-1","commitmentStatus":"NEGOTIATING","revisionStatus":"\#(status)","focus":{"type":"PLAN","connectionId":"connection-1","commitmentId":"commitment-v2","revisionId":"revision-v2"}}}"#)
            }
            return response(request, 200, #"{"data":{"plan":{"id":"revision-legacy","connectionId":"connection-1","status":"ACCEPTED","planType":"STUDY","title":"Review","location":null,"message":null,"startTime":"2026-09-01T10:00:00.000Z","endTime":"2026-09-01T11:00:00.000Z","proposer":{"id":"peer-1","username":"peer","nickname":null,"avatarUrl":null},"receiver":{"id":"user-1","username":"viewer","nickname":null,"avatarUrl":null},"counterOfId":null,"availabilityShareId":null,"scheduleShareLinkId":null,"createdAt":"2026-08-31T10:00:00.000Z","updatedAt":"2026-08-31T10:00:00.000Z"}}}"#)
        }
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
        case "/api/v1/connections/connection-1/block":
            return response(request, 200, #"{"data":{"blocked":true}}"#)
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
                if holdTextSends {
                    pendingTextSendCount += 1
                    await withCheckedContinuation { continuation in
                        textSendWaiters.append(continuation)
                    }
                }
                if remainingTextSendFailures > 0 {
                    remainingTextSendFailures -= 1
                    throw URLError(.networkConnectionLost)
                }
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
            if let directHistoryStatus {
                return response(
                    request,
                    directHistoryStatus,
                    #"{"error":{"code":"NOT_FOUND","message":"Conversation unavailable.","retryable":false}}"#
                )
            }
            directHistoryRequestCount += 1
            if paginatePlanHistory {
                let cursor = URLComponents(
                    url: request.url!,
                    resolvingAgainstBaseURL: false
                )?.queryItems?.first(where: { $0.name == "cursor" })?.value
                if cursor == nil {
                    return response(
                        request,
                        200,
                        #"{"data":{"connection":{"id":"connection-1","isSelfNotes":false,"displayName":"Mina","peer":{"id":"peer-1","username":"test_002","nickname":"Mina","avatarUrl":null}},"messages":[{"id":"latest-message","connectionId":"connection-1","sender":{"id":"peer-1","username":"test_002","nickname":"Mina","avatarUrl":null},"type":"TEXT","body":"Latest","imageUrl":null,"location":null,"availabilityShareId":null,"planRequestId":null,"planRequest":null,"replyTo":null,"deletedAt":null,"createdAt":"2026-07-17T12:10:00.000Z"}]},"meta":{"hasMore":true,"nextCursor":"older-cursor-1","realtimeCursor":"cursor-1"}}"#
                    )
                }
                return response(
                    request,
                    200,
                    #"{"data":{"connection":{"id":"connection-1","isSelfNotes":false,"displayName":"Mina","peer":{"id":"peer-1","username":"test_002","nickname":"Mina","avatarUrl":null}},"messages":[{"id":"older-plan-message","connectionId":"connection-1","sender":{"id":"peer-1","username":"test_002","nickname":"Mina","avatarUrl":null},"type":"PLAN_REQUEST_CARD","body":null,"imageUrl":null,"location":null,"availabilityShareId":null,"planRequestId":"older-plan","planRequest":{"id":"older-plan","connectionId":"connection-1","status":"PENDING","planType":"STUDY","title":"Library study","location":"Library","message":null,"startTime":"2026-07-18T14:00:00.000Z","endTime":"2026-07-18T15:00:00.000Z","proposer":{"id":"peer-1","username":"test_002","nickname":"Mina","avatarUrl":null},"receiver":{"id":"user-1","username":"test_001","nickname":"Test User","avatarUrl":null},"counterOfId":null,"availabilityShareId":null,"scheduleShareLinkId":null,"createdAt":"2026-07-17T12:00:00.000Z","updatedAt":"2026-07-17T12:00:00.000Z"},"replyTo":null,"deletedAt":null,"createdAt":"2026-07-17T12:00:00.000Z"}]},"meta":{"hasMore":false,"nextCursor":null,"realtimeCursor":"cursor-1"}}"#
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
