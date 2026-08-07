import Foundation

#if DEBUG
/// Hermetic multi-peer chat fixtures for `--ui-testing-authenticated`.
enum UITestingChatFixtures {
    static let me = NativeChatAuthor(
        id: "ui-test-user",
        username: "test_001",
        nickname: "测试用户",
        avatarUrl: nil
    )

    struct Peer: Sendable {
        let id: String
        let username: String
        let nickname: String
        let connectionID: String
        let unreadCount: Int
        let pinned: Bool
        let lastPreview: String
        let lastActivityAt: String
        let lastMessageID: String

        var author: NativeChatAuthor {
            NativeChatAuthor(id: id, username: username, nickname: nickname, avatarUrl: nil)
        }
    }

    static let mina = Peer(
        id: "ui-peer",
        username: "test_002",
        nickname: "米娜",
        connectionID: "ui-connection",
        unreadCount: 12,
        pinned: true,
        lastPreview: "未读 12 — 最新",
        lastActivityAt: "2026-07-17T12:20:00.000Z",
        lastMessageID: "ui-unread-12"
    )

    static let leo = Peer(
        id: "ui-peer-leo",
        username: "leo_hart",
        nickname: "利奥",
        connectionID: "ui-connection-leo",
        unreadCount: 3,
        pinned: false,
        lastPreview: "上课前喝杯咖啡？",
        lastActivityAt: "2026-07-17T15:10:00.000Z",
        lastMessageID: "ui-leo-msg-3"
    )

    static let sara = Peer(
        id: "ui-peer-sara",
        username: "sara_kim",
        nickname: "萨拉",
        connectionID: "ui-connection-sara",
        unreadCount: 0,
        pinned: false,
        lastPreview: "笔记在网盘里",
        lastActivityAt: "2026-07-17T11:40:00.000Z",
        lastMessageID: "ui-sara-msg-2"
    )

    static let chen = Peer(
        id: "ui-peer-chen",
        username: "chen_wei",
        nickname: "陈伟",
        connectionID: "ui-connection-chen",
        unreadCount: 10,
        pinned: false,
        lastPreview: "陈的未读 10",
        lastActivityAt: "2026-07-17T16:05:00.000Z",
        lastMessageID: "ui-chen-unread-10"
    )

    static let nora = Peer(
        id: "ui-peer-nora",
        username: "nora_blake",
        nickname: "诺拉",
        connectionID: "ui-connection-nora",
        unreadCount: 1,
        pinned: false,
        lastPreview: "食堂见",
        lastActivityAt: "2026-07-17T09:15:00.000Z",
        lastMessageID: "ui-nora-msg-2"
    )

    static let allPeers: [Peer] = [mina, leo, sara, chen, nora]

    static func peer(connectionID: String) -> Peer? {
        allPeers.first { $0.connectionID == connectionID }
    }

    static var inboxPayload: NativeInboxPayload {
        var rows: [NativeInboxConversation] = allPeers.map { peer in
            NativeInboxConversation(
                kind: .direct,
                id: peer.connectionID,
                displayName: peer.nickname,
                avatarUrl: nil,
                participantAvatars: [],
                unreadCount: peer.unreadCount,
                pinned: peer.pinned,
                lastActivityAt: peer.lastActivityAt,
                peer: peer.author,
                isSelfNotes: false,
                course: nil,
                group: nil,
                lastMessage: NativeInboxLastMessage(
                    id: peer.lastMessageID,
                    sender: peer.author,
                    type: "TEXT",
                    body: peer.lastPreview,
                    imageUrl: nil,
                    deletedAt: nil,
                    createdAt: peer.lastActivityAt
                )
            )
        }

        rows.append(
            NativeInboxConversation(
                kind: .course,
                id: "ui-course",
                displayName: "算法",
                avatarUrl: nil,
                participantAvatars: [],
                unreadCount: 2,
                pinned: false,
                lastActivityAt: "2026-07-17T13:01:00.000Z",
                peer: nil,
                isSelfNotes: false,
                course: NativeInboxCourseRef(
                    id: "ui-course",
                    name: "算法",
                    code: "IN0007",
                    school: "TUM",
                    semesterLabel: "SS26"
                ),
                group: nil,
                lastMessage: NativeInboxLastMessage(
                    id: "ui-course-msg-4",
                    sender: leo.author,
                    type: "TEXT",
                    body: "我在前排占了个座。",
                    imageUrl: nil,
                    deletedAt: nil,
                    createdAt: "2026-07-17T13:04:00.000Z"
                )
            )
        )

        rows.append(
            NativeInboxConversation(
                kind: .group,
                id: "ui-group",
                displayName: "学习小组",
                avatarUrl: nil,
                participantAvatars: groupParticipants.compactMap(\.avatarUrl),
                unreadCount: 4,
                pinned: false,
                lastActivityAt: "2026-07-17T14:30:00.000Z",
                peer: nil,
                isSelfNotes: false,
                course: nil,
                group: NativeInboxGroupRef(
                    id: "ui-group",
                    participantCount: groupParticipants.count,
                    participants: groupParticipants
                ),
                lastMessage: NativeInboxLastMessage(
                    id: "ui-group-msg-5",
                    sender: sara.author,
                    type: "TEXT",
                    body: "充电器我也带上",
                    imageUrl: nil,
                    deletedAt: nil,
                    createdAt: "2026-07-17T14:30:00.000Z"
                )
            )
        )

        let unreadTotal = rows.reduce(0) { $0 + $1.unreadCount }
        return NativeInboxPayload(
            conversations: rows.sorted {
                $0.lastActivityAt > $1.lastActivityAt
            },
            unreadTotal: unreadTotal,
            plansNeedingYourAction: 1
        )
    }

    static var contacts: [NativeContactRow] {
        allPeers.enumerated().map { index, peer in
            NativeContactRow(
                connectionId: peer.connectionID,
                peer: peer.author,
                remark: index == 0 ? nil : nil,
                courseName: index % 2 == 0 ? "Algorithms" : "Databases",
                updatedAt: peer.lastActivityAt
            )
        }
    }

    static let groupParticipants: [NativeChatAuthor] = [
        me,
        mina.author,
        leo.author,
        sara.author,
        chen.author
    ]

    static func directPage(connectionID: String) -> NativeDirectMessagePageData {
        if ProcessInfo.processInfo.arguments.contains("--ui-testing-dense-chat") {
            return denseDirectPage(connectionID: connectionID)
        }

        switch connectionID {
        case mina.connectionID:
            return minaDirectPage
        case leo.connectionID:
            return simpleDirectPage(
                peer: leo,
                messages: [
                    text(id: "ui-leo-msg-1", on: leo, fromMe: false, body: "嘿，晚点儿有空吗？", at: "2026-07-17T15:00:00.000Z"),
                    text(id: "ui-leo-msg-2", on: leo, fromMe: true, body: "四点后可以？", at: "2026-07-17T15:05:00.000Z"),
                    text(id: "ui-leo-msg-3", on: leo, fromMe: false, body: "上课前喝杯咖啡？", at: "2026-07-17T15:10:00.000Z")
                ]
            )
        case sara.connectionID:
            return simpleDirectPage(
                peer: sara,
                messages: [
                    text(id: "ui-sara-msg-1", on: sara, fromMe: true, body: "第三张练习做完了吗？", at: "2026-07-17T11:30:00.000Z"),
                    text(id: "ui-sara-msg-2", on: sara, fromMe: false, body: "笔记在网盘里", at: "2026-07-17T11:40:00.000Z")
                ]
            )
        case chen.connectionID:
            return simpleDirectPage(
                peer: chen,
                messages: [
                    text(id: "ui-chen-msg-0", on: chen, fromMe: true, body: "有空了叫我", at: "2026-07-17T15:50:00.000Z")
                ] + (1...10).map { index in
                    text(
                        id: String(format: "ui-chen-unread-%02d", index),
                        on: chen,
                        fromMe: false,
                        body: index == 1
                            ? "陈的未读 1 — 跳转目标"
                            : "陈的未读 \(index)",
                        at: String(format: "2026-07-17T16:%02d:00.000Z", index)
                    )
                }
            )
        case nora.connectionID:
            return simpleDirectPage(
                peer: nora,
                messages: [
                    text(id: "ui-nora-msg-1", on: nora, fromMe: true, body: "一起吃午饭？", at: "2026-07-17T09:00:00.000Z"),
                    text(id: "ui-nora-msg-2", on: nora, fromMe: false, body: "食堂见", at: "2026-07-17T09:15:00.000Z")
                ]
            )
        default:
            return minaDirectPage
        }
    }

    private static func simpleDirectPage(
        peer: Peer,
        messages: [NativeDirectMessage]
    ) -> NativeDirectMessagePageData {
        NativeDirectMessagePageData(
            connection: NativeDirectConversation(
                id: peer.connectionID,
                isSelfNotes: false,
                displayName: peer.nickname,
                peer: peer.author
            ),
            messages: messages
        )
    }

    /// A long, multi-day text thread that keeps UI performance tests hermetic.
    /// This approximates a user who has paged deeply into an active conversation.
    static func denseDirectPage(
        connectionID: String = mina.connectionID,
        messageCount: Int = 960
    ) -> NativeDirectMessagePageData {
        let selectedPeer = peer(connectionID: connectionID) ?? mina
        let baseDate = Date(timeIntervalSince1970: 1_752_758_400)
        let iso8601 = Date.ISO8601FormatStyle(includingFractionalSeconds: true)
        var messages: [NativeDirectMessage] = []
        messages.reserveCapacity(messageCount)

        for index in 0..<messageCount {
            let fromMe = index.isMultiple(of: 2)
            let body: String
            if index.isMultiple(of: 19) {
                body = "压力测试长消息 \(index)：这是一段用于检查聊天列表布局、自动换行和连续滚动性能的较长文本。"
            } else {
                body = "压力测试消息 \(index)"
            }
            let reply: NativeDirectMessageReply? = if index > 0, index.isMultiple(of: 23) {
                NativeDirectMessageReply(
                    id: String(format: "ui-dense-%04d", index - 1),
                    sender: fromMe ? selectedPeer.author : me,
                    type: "TEXT",
                    body: "压力测试消息 \(index - 1)",
                    deletedAt: nil
                )
            } else {
                nil
            }

            messages.append(
                NativeDirectMessage(
                    id: String(format: "ui-dense-%04d", index),
                    connectionId: selectedPeer.connectionID,
                    sender: fromMe ? me : selectedPeer.author,
                    type: "TEXT",
                    body: body,
                    createdAt: baseDate
                        .addingTimeInterval(Double(index) * 15 * 60)
                        .formatted(iso8601),
                    replyTo: reply
                )
            )
        }

        return simpleDirectPage(peer: selectedPeer, messages: messages)
    }

    private static func text(
        id: String,
        on peer: Peer,
        fromMe: Bool,
        body: String,
        at createdAt: String
    ) -> NativeDirectMessage {
        NativeDirectMessage(
            id: id,
            connectionId: peer.connectionID,
            sender: fromMe ? me : peer.author,
            type: "TEXT",
            body: body,
            createdAt: createdAt
        )
    }

    /// Rich Mina thread (cards + 12 unread) kept for existing UI tests.
    private static var minaDirectPage: NativeDirectMessagePageData {
        let peer = mina.author
        let unread = (1...12).map { index -> NativeDirectMessage in
            let minute = 5 + index
            return NativeDirectMessage(
                id: String(format: "ui-unread-%02d", index),
                connectionId: mina.connectionID,
                sender: peer,
                type: "TEXT",
                body: index == 1
                    ? "未读 1 — 第一条未读（跳转目标）"
                    : "未读 \(index)\(index == 12 ? " — 最新" : "")",
                createdAt: String(format: "2026-07-17T12:%02d:00.000Z", minute)
            )
        }

        return NativeDirectMessagePageData(
            connection: NativeDirectConversation(
                id: mina.connectionID,
                isSelfNotes: false,
                displayName: mina.nickname,
                peer: peer
            ),
            messages: [
                NativeDirectMessage(
                    id: "ui-msg-1",
                    connectionId: mina.connectionID,
                    sender: peer,
                    type: "TEXT",
                    body: "图书馆见？",
                    createdAt: "2026-07-17T12:00:00.000Z"
                ),
                NativeDirectMessage(
                    id: "ui-msg-2",
                    connectionId: mina.connectionID,
                    sender: me,
                    type: "TEXT",
                    body: "我在路上。",
                    createdAt: "2026-07-17T12:01:00.000Z",
                    replyTo: NativeDirectMessageReply(
                        id: "ui-msg-1",
                        sender: peer,
                        type: "TEXT",
                        body: "图书馆见？",
                        deletedAt: nil
                    )
                ),
                NativeDirectMessage(
                    id: "ui-msg-image",
                    connectionId: mina.connectionID,
                    sender: peer,
                    type: "IMAGE",
                    body: "校园地图",
                    createdAt: "2026-07-17T12:02:00.000Z",
                    imageUrl: "https://example.com/chat-photo.jpg"
                ),
                NativeDirectMessage(
                    id: "ui-msg-location",
                    connectionId: mina.connectionID,
                    sender: peer,
                    type: "LOCATION",
                    body: nil,
                    createdAt: "2026-07-17T12:03:00.000Z",
                    location: NativeChatLocation(latitude: 48.137, longitude: 11.575, name: "Marienplatz")
                ),
                NativeDirectMessage(
                    id: "ui-msg-schedule",
                    connectionId: mina.connectionID,
                    sender: peer,
                    type: "SCHEDULE_SHARE_CARD",
                    body: "https://example.com/share/view/ui-token",
                    createdAt: "2026-07-17T12:03:30.000Z"
                ),
                NativeDirectMessage(
                    id: "ui-msg-plan",
                    connectionId: mina.connectionID,
                    sender: peer,
                    type: "PLAN_REQUEST_CARD",
                    body: nil,
                    createdAt: "2026-07-17T12:04:00.000Z",
                    planRequestId: "ui-plan-1",
                    planRequest: NativePlanRequest(
                        id: "ui-plan-1",
                        connectionId: mina.connectionID,
                        status: "PENDING",
                        planType: "STUDY",
                        title: "图书馆自习",
                        location: "中心图书馆",
                        message: "带上笔记",
                        startTime: "2026-07-18T14:00:00.000Z",
                        endTime: "2026-07-18T15:00:00.000Z",
                        proposer: NativePlanAuthor(
                            id: mina.id,
                            username: mina.username,
                            nickname: mina.nickname,
                            avatarUrl: nil
                        ),
                        receiver: NativePlanAuthor(
                            id: me.id,
                            username: me.username,
                            nickname: me.nickname,
                            avatarUrl: nil
                        ),
                        counterOfId: nil,
                        availabilityShareId: nil,
                        scheduleShareLinkId: nil,
                        createdAt: "2026-07-17T12:04:00.000Z",
                        updatedAt: "2026-07-17T12:04:00.000Z"
                    )
                )
            ] + unread
        )
    }

    static func communityPage(kind: NativeCommunityChatKind) -> NativeCommunityMessagePageData {
        let inboxHidden = ProcessInfo.processInfo.arguments.contains("--ui-testing-inbox-hidden")
        switch kind {
        case .course:
            return NativeCommunityMessagePageData(
                conversation: NativeCommunityConversation(
                    kind: "COURSE",
                    id: "ui-course",
                    name: "算法",
                    code: "IN0007",
                    school: "TUM",
                    semesterLabel: "SS26",
                    memberCount: 42,
                    title: nil,
                    customTitle: nil,
                    participants: nil,
                    inboxHidden: inboxHidden
                ),
                messages: [
                    NativeCommunityMessage(
                        id: "ui-course-msg-1",
                        conversationId: "ui-course",
                        sender: mina.author,
                        body: "有人一起上习题课吗？",
                        createdAt: "2026-07-17T13:00:00.000Z"
                    ),
                    NativeCommunityMessage(
                        id: "ui-course-msg-2",
                        conversationId: "ui-course",
                        sender: me,
                        body: "午饭后我可以去。",
                        createdAt: "2026-07-17T13:01:00.000Z",
                        replyTo: NativeCommunityMessageReply(
                            id: "ui-course-msg-1",
                            sender: mina.author,
                            body: "有人一起上习题课吗？",
                            deletedAt: nil
                        )
                    ),
                    NativeCommunityMessage(
                        id: "ui-course-msg-3",
                        conversationId: "ui-course",
                        sender: sara.author,
                        body: "我也行，13:30 可以。",
                        createdAt: "2026-07-17T13:02:00.000Z"
                    ),
                    NativeCommunityMessage(
                        id: "ui-course-msg-4",
                        conversationId: "ui-course",
                        sender: leo.author,
                        body: "我在前排占了个座。",
                        createdAt: "2026-07-17T13:04:00.000Z"
                    )
                ]
            )
        case .group:
            return NativeCommunityMessagePageData(
                conversation: NativeCommunityConversation(
                    kind: "GROUP",
                    id: "ui-group",
                    name: nil,
                    code: nil,
                    school: nil,
                    semesterLabel: nil,
                    memberCount: nil,
                    title: "学习小组",
                    customTitle: nil,
                    participants: groupParticipants,
                    inboxHidden: inboxHidden
                ),
                messages: [
                    NativeCommunityMessage(
                        id: "ui-group-msg-1",
                        conversationId: "ui-group",
                        sender: mina.author,
                        body: "四点图书馆？",
                        createdAt: "2026-07-17T14:00:00.000Z"
                    ),
                    NativeCommunityMessage(
                        id: "ui-group-msg-2",
                        conversationId: "ui-group",
                        sender: leo.author,
                        body: "我可以。",
                        createdAt: "2026-07-17T14:05:00.000Z"
                    ),
                    NativeCommunityMessage(
                        id: "ui-group-msg-3",
                        conversationId: "ui-group",
                        sender: chen.author,
                        body: "我去楼上占大桌子。",
                        createdAt: "2026-07-17T14:12:00.000Z"
                    ),
                    NativeCommunityMessage(
                        id: "ui-group-msg-4",
                        conversationId: "ui-group",
                        sender: me,
                        body: "我从加兴过来。",
                        createdAt: "2026-07-17T14:20:00.000Z"
                    ),
                    NativeCommunityMessage(
                        id: "ui-group-msg-5",
                        conversationId: "ui-group",
                        sender: sara.author,
                        body: "充电器我也带上",
                        createdAt: "2026-07-17T14:30:00.000Z"
                    )
                ]
            )
        }
    }
}
#endif
