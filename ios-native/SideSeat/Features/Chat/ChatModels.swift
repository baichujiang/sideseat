import Foundation
import Popovers
import SwiftUI
import UIKit

struct ChatTransientNotice: Identifiable, Equatable {
    let id = UUID()
    let text: String
    let systemImage: String
}

struct ChatTransientNoticeView: View {
    let notice: ChatTransientNotice

    var body: some View {
        Label(notice.text, systemImage: notice.systemImage)
            .font(.footnote.weight(.semibold))
            .foregroundStyle(SideSeatTheme.textPrimary)
            .padding(.horizontal, 13)
            .padding(.vertical, 9)
            .background(.regularMaterial, in: Capsule())
            .overlay {
                Capsule()
                    .strokeBorder(Color.primary.opacity(0.08), lineWidth: 1)
            }
            .shadow(color: .black.opacity(0.12), radius: 10, y: 4)
            .transition(.move(edge: .bottom).combined(with: .opacity))
            .allowsHitTesting(false)
            .accessibilityElement(children: .combine)
            .accessibilityLabel(notice.text)
            .accessibilityIdentifier("chat-action-notice")
    }
}

enum ChatMessageContextMenuEdge {
    case leading
    case trailing
}

private struct ChatMessageSourceFramePreferenceKey: PreferenceKey {
    static let defaultValue = CGRect.zero

    static func reduce(value: inout CGRect, nextValue: () -> CGRect) {
        let next = nextValue()
        if !next.isEmpty {
            value = next
        }
    }
}

struct ChatMessageContextMenuTarget<Content: View>: View {
    let isEnabled: Bool
    let edge: ChatMessageContextMenuEdge
    private let content: Content
    private let actions: [SSLongPressAction]

    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    @State private var isPresented = false
    @State private var sourceFrame = CGRect.zero

    init(
        isEnabled: Bool,
        edge: ChatMessageContextMenuEdge = .leading,
        @ViewBuilder content: () -> Content,
        actions: () -> [SSLongPressAction]
    ) {
        self.isEnabled = isEnabled
        self.edge = edge
        self.content = content()
        self.actions = actions()
    }

    var body: some View {
        content
            .contentShape(.interaction, Rectangle())
            .scaleEffect(isPresented ? 1.018 : 1)
            .shadow(
                color: .black.opacity(isPresented ? (colorScheme == .dark ? 0.3 : 0.16) : 0),
                radius: isPresented ? 10 : 0,
                y: isPresented ? 4 : 0
            )
            .animation(.snappy(duration: 0.2), value: isPresented)
            .background {
                GeometryReader { proxy in
                    Color.clear.preference(
                        key: ChatMessageSourceFramePreferenceKey.self,
                        value: proxy.frame(in: .global)
                    )
                }
            }
            .onPreferenceChange(ChatMessageSourceFramePreferenceKey.self) { sourceFrame = $0 }
            .highPriorityGesture(
                LongPressGesture(minimumDuration: 0.46, maximumDistance: 14)
                    .onEnded { completed in
                        guard completed, isEnabled, !actions.isEmpty else { return }
                        UIImpactFeedbackGenerator(style: .soft).impactOccurred()
                        isPresented = true
                    }
            )
            .popover(
                present: $isPresented,
                attributes: { attributes in
                    attributes.position = popoverPosition
                    attributes.sourceFrame = { sourceFrame }
                    attributes.sourceFrameInset = UIEdgeInsets(
                        top: -8,
                        left: 0,
                        bottom: -8,
                        right: 0
                    )
                    attributes.screenEdgePadding = UIEdgeInsets(
                        top: 12,
                        left: 12,
                        bottom: 12,
                        right: 12
                    )
                    attributes.presentation.animation = .spring(
                        response: 0.28,
                        dampingFraction: 0.82
                    )
                    attributes.presentation.transition = .scale(
                        scale: 0.94,
                        anchor: transitionAnchor
                    ).combined(with: .opacity)
                    attributes.dismissal.animation = .easeOut(duration: 0.16)
                    attributes.dismissal.transition = .opacity
                    attributes.dismissal.mode = .tapOutside
                    attributes.rubberBandingMode = .none
                    attributes.blocksBackgroundTouches = true
                    attributes.onTapOutside = { isPresented = false }
                    attributes.accessibility.shiftFocus = true
                },
                view: {
                    ChatMessageActionPopover(
                        isPresented: $isPresented,
                        actions: actions,
                        width: menuWidth
                    )
                },
                background: {
                    ChatMessageContextBackdrop(
                        opacity: colorScheme == .dark ? 0.24 : 0.12
                    )
                }
            )
    }

    private var menuEstimatedHeight: CGFloat {
        let rowHeight: CGFloat = dynamicTypeSize.isAccessibilitySize ? 64 : 48
        return CGFloat(actions.count) * rowHeight + 4
    }

    private var menuWidth: CGFloat {
        let bodyFont = UIFont.preferredFont(forTextStyle: .body)
        let longestTitleWidth = actions
            .map { ($0.title as NSString).size(withAttributes: [.font: bodyFont]).width }
            .max() ?? 0
        let horizontalChrome: CGFloat = 26 + 22 + 12 + 4
        let idealWidth = ceil(longestTitleWidth + horizontalChrome)
        let minimumWidth: CGFloat = dynamicTypeSize.isAccessibilitySize ? 184 : 132
        let maximumWidth: CGFloat = dynamicTypeSize.isAccessibilitySize ? 260 : 204
        return min(max(idealWidth, minimumWidth), maximumWidth)
    }

    private var windowHeight: CGFloat {
        let connectedScenes = UIApplication.shared.connectedScenes
        return connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .flatMap(\.windows)
            .first(where: \.isKeyWindow)?
            .bounds.height ?? UIScreen.main.bounds.height
    }

    private var presentsAbove: Bool {
        guard !sourceFrame.isEmpty else { return true }
        let availableAbove = max(0, sourceFrame.minY - 24)
        let availableBelow = max(0, windowHeight - sourceFrame.maxY - 24)

        if availableAbove >= menuEstimatedHeight {
            return true
        }
        if availableBelow >= menuEstimatedHeight {
            return false
        }
        return availableAbove >= availableBelow
    }

    private var popoverPosition: Popover.Attributes.Position {
        switch (presentsAbove, edge) {
        case (true, .leading):
            return .absolute(originAnchor: .topLeft, popoverAnchor: .bottomLeft)
        case (true, .trailing):
            return .absolute(originAnchor: .topRight, popoverAnchor: .bottomRight)
        case (false, .leading):
            return .absolute(originAnchor: .bottomLeft, popoverAnchor: .topLeft)
        case (false, .trailing):
            return .absolute(originAnchor: .bottomRight, popoverAnchor: .topRight)
        }
    }

    private var transitionAnchor: UnitPoint {
        switch (presentsAbove, edge) {
        case (true, .leading): .bottomLeading
        case (true, .trailing): .bottomTrailing
        case (false, .leading): .topLeading
        case (false, .trailing): .topTrailing
        }
    }
}

private struct ChatMessageContextBackdrop: View {
    let opacity: Double

    var body: some View {
        PopoverReader { context in
            Canvas { graphics, size in
                var mask = Path(CGRect(origin: .zero, size: size))
                let source = context.attributes.sourceFrame()
                    .insetBy(dx: -4, dy: -4)
                mask.addRoundedRect(
                    in: source,
                    cornerSize: CGSize(width: 18, height: 18)
                )
                graphics.fill(
                    mask,
                    with: .color(.black.opacity(opacity)),
                    style: FillStyle(eoFill: true)
                )
            }
            .frame(
                width: context.windowBounds.width,
                height: context.windowBounds.height
            )
            .ignoresSafeArea()
        }
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }
}

private struct ChatMessageActionPopover: View {
    @Binding var isPresented: Bool
    let actions: [SSLongPressAction]
    let width: CGFloat

    var body: some View {
        VStack(spacing: 0) {
            ForEach(Array(actions.enumerated()), id: \.element.id) { index, action in
                if index > 0 {
                    Divider()
                        .padding(.leading, 48)
                }

                actionButton(action)
            }
        }
        .frame(width: width)
        .background(.regularMaterial)
        .overlay {
            RoundedRectangle(cornerRadius: 15, style: .continuous)
                .strokeBorder(Color.primary.opacity(0.1), lineWidth: 0.5)
        }
        .clipShape(RoundedRectangle(cornerRadius: 15, style: .continuous))
        .shadow(color: .black.opacity(0.18), radius: 18, y: 8)
        .accessibilityElement(children: .contain)
        .accessibilityLabel(AppLocalization.string("Message actions"))
        .accessibilityIdentifier("chat-context-action-menu")
    }

    private func actionButton(_ action: SSLongPressAction) -> some View {
        Button(role: action.role == .destructive ? .destructive : nil) {
            isPresented = false
            Task { @MainActor in
                try? await Task.sleep(for: .milliseconds(170))
                action.perform()
            }
        } label: {
            HStack(spacing: 12) {
                Image(systemName: action.systemImage)
                    .font(.body.weight(.medium))
                    .foregroundStyle(actionTint(action))
                    .frame(width: 22)
                    .accessibilityHidden(true)

                Text(action.title)
                    .font(.body)
                    .foregroundStyle(
                        action.role == .destructive
                            ? SideSeatTheme.statusDangerText
                            : SideSeatTheme.textPrimary
                    )
                    .multilineTextAlignment(.leading)

                Spacer(minLength: 4)
            }
            .padding(.horizontal, 13)
            .padding(.vertical, 8)
            .frame(maxWidth: .infinity, minHeight: 48, alignment: .leading)
            .contentShape(Rectangle())
        }
        .buttonStyle(ChatMessageActionButtonStyle())
        .accessibilityIdentifier(action.id)
    }

    private func actionTint(_ action: SSLongPressAction) -> Color {
        action.role == .destructive ? SideSeatTheme.danger : SideSeatTheme.accentText
    }
}

private struct ChatMessageActionButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .background(Color.primary.opacity(configuration.isPressed ? 0.08 : 0))
            .animation(.easeOut(duration: 0.1), value: configuration.isPressed)
    }
}

@MainActor
@Observable
final class ChatComposerDraft {
    private enum PresentationState: Equatable {
        case empty
        case whitespaceOnly
        case sendable
    }

    @ObservationIgnored private(set) var text = ""
    private var presentationState = PresentationState.empty
    private(set) var resetVersion = 0

    var isEmpty: Bool { presentationState == .empty }
    var canSend: Bool { presentationState == .sendable }

    var trimmedText: String {
        text.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    func updateText(_ value: String) {
        text = value
        let nextState: PresentationState
        if value.isEmpty {
            nextState = .empty
        } else if value.contains(where: { !$0.isWhitespace }) {
            nextState = .sendable
        } else {
            nextState = .whitespaceOnly
        }
        if presentationState != nextState {
            presentationState = nextState
        }
    }

    func clear() {
        guard !text.isEmpty else { return }
        text = ""
        presentationState = .empty
        resetVersion &+= 1
    }
}

@MainActor
final class ChatComposerFocusController {
    private weak var textView: UITextView?

    var isFocused: Bool {
        textView?.isFirstResponder == true
    }

    func attach(_ textView: UITextView) {
        self.textView = textView
    }

    func detach(_ textView: UITextView) {
        guard self.textView === textView else { return }
        self.textView = nil
    }

    func focus() {
        textView?.becomeFirstResponder()
    }

    func blur() {
        textView?.resignFirstResponder()
    }
}

enum ChatComposerReturnKey {
    static func textBeforeInsertedReturn(previous: String, current: String) -> String? {
        guard current.count == previous.count + 1 else { return nil }

        for index in current.indices where current[index] == "\n" {
            var candidate = current
            candidate.remove(at: index)
            if candidate == previous {
                return candidate
            }
        }
        return nil
    }
}

struct NativeInboxPayload: Codable, Sendable {
    let conversations: [NativeInboxConversation]
    let unreadTotal: Int
    let plansNeedingYourAction: Int
    let planOutcomesNeedingYourResponse: Int
    let actionResponseSummary: Components.Schemas.ActionResponseSummary?

    private enum CodingKeys: String, CodingKey {
        case conversations
        case unreadTotal
        case plansNeedingYourAction
        case planOutcomesNeedingYourResponse
        case actionResponseSummary
    }

    init(
        conversations: [NativeInboxConversation],
        unreadTotal: Int,
        plansNeedingYourAction: Int,
        planOutcomesNeedingYourResponse: Int = 0,
        actionResponseSummary: Components.Schemas.ActionResponseSummary? = nil
    ) {
        self.conversations = conversations
        self.unreadTotal = unreadTotal
        self.plansNeedingYourAction = plansNeedingYourAction
        self.planOutcomesNeedingYourResponse = planOutcomesNeedingYourResponse
        self.actionResponseSummary = actionResponseSummary
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        conversations = try container.decode([NativeInboxConversation].self, forKey: .conversations)
        unreadTotal = try container.decode(Int.self, forKey: .unreadTotal)
        plansNeedingYourAction = try container.decode(Int.self, forKey: .plansNeedingYourAction)
        planOutcomesNeedingYourResponse = try container.decodeIfPresent(
            Int.self,
            forKey: .planOutcomesNeedingYourResponse
        ) ?? 0
        actionResponseSummary = try container.decodeIfPresent(
            Components.Schemas.ActionResponseSummary.self,
            forKey: .actionResponseSummary
        )
    }
}

struct NativeInboxConversation: Codable, Identifiable, Hashable, Sendable {
    enum Kind: String, Codable, Sendable {
        case direct = "DIRECT"
        case course = "COURSE"
        case group = "GROUP"
    }

    let kind: Kind
    let id: String
    let displayName: String
    let avatarUrl: String?
    let participantAvatars: [String]
    let unreadCount: Int
    let pinned: Bool
    let lastActivityAt: String
    let peer: NativeChatAuthor?
    let isSelfNotes: Bool
    let course: NativeInboxCourseRef?
    let group: NativeInboxGroupRef?
    let lastMessage: NativeInboxLastMessage?

    var route: AppRoute? {
        switch kind {
        case .direct: return .directChat(connectionID: id)
        case .course: return .courseChat(courseID: id)
        case .group: return .groupChat(groupChatID: id)
        }
    }

    var previewText: String {
        contentPreview
    }

    /// Inbox row preview with sender prefix for multi-party rooms / own messages.
    func listPreview(currentUserID: String?) -> String {
        guard let lastMessage else { return contentPreview }
        let content = contentPreview
        if kind == .direct {
            if let currentUserID, lastMessage.sender.id == currentUserID, lastMessage.deletedAt == nil {
                return "\(AppLocalization.string( "You")): \(content)"
            }
            return content
        }
        let name: String
        if let currentUserID, lastMessage.sender.id == currentUserID {
            name = AppLocalization.string( "You")
        } else {
            name = lastMessage.sender.displayName
        }
        return "\(name): \(content)"
    }

    private var contentPreview: String {
        guard let lastMessage else { return AppLocalization.string( "No messages yet") }
        if lastMessage.deletedAt != nil { return AppLocalization.string( "Message deleted") }
        switch lastMessage.type {
        case "IMAGE": return AppLocalization.string( "Photo")
        case "LOCATION": return AppLocalization.string( "Location")
        case "SCHEDULE_SHARE_CARD": return AppLocalization.string("Shared availability")
        case "AVAILABILITY_CARD": return AppLocalization.string( "Shared availability")
        case "PLAN_REQUEST_CARD":
            return titledPreview(prefix: AppLocalization.string( "Plan invite"), body: lastMessage.body)
        case "PLAN_CONFIRMED_CARD":
            return titledPreview(prefix: AppLocalization.string( "Plan confirmed"), body: lastMessage.body)
        case "SYSTEM":
            let body = lastMessage.body?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
            return body.isEmpty ? AppLocalization.string( "Update") : body
        default:
            let body = lastMessage.body?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
            if body.isEmpty { return AppLocalization.string( "New message") }
            return body
        }
    }

    private func titledPreview(prefix: String, body: String?) -> String {
        let title = body?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        return title.isEmpty ? prefix : "\(prefix) · \(title)"
    }

    var supportsHide: Bool { kind == .course || kind == .group }

    /// Members for WeChat-style group collage (up to 9). Prefers full participant list.
    var compositeAvatarMembers: [GroupCompositeAvatar.Member] {
        if let participants = group?.participants, !participants.isEmpty {
            return participants.prefix(9).map {
                GroupCompositeAvatar.Member(name: $0.displayName, url: $0.avatarUrl)
            }
        }
        return participantAvatars.prefix(9).map {
            GroupCompositeAvatar.Member(name: displayName, url: $0)
        }
    }

    var usesCompositeAvatar: Bool {
        kind == .group
            && (avatarUrl?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ?? true)
            && !compositeAvatarMembers.isEmpty
    }

    func withPinned(_ pinned: Bool) -> NativeInboxConversation {
        NativeInboxConversation(
            kind: kind,
            id: id,
            displayName: displayName,
            avatarUrl: avatarUrl,
            participantAvatars: participantAvatars,
            unreadCount: unreadCount,
            pinned: pinned,
            lastActivityAt: lastActivityAt,
            peer: peer,
            isSelfNotes: isSelfNotes,
            course: course,
            group: group,
            lastMessage: lastMessage
        )
    }

    func withUnreadCount(_ unreadCount: Int) -> NativeInboxConversation {
        NativeInboxConversation(
            kind: kind,
            id: id,
            displayName: displayName,
            avatarUrl: avatarUrl,
            participantAvatars: participantAvatars,
            unreadCount: unreadCount,
            pinned: pinned,
            lastActivityAt: lastActivityAt,
            peer: peer,
            isSelfNotes: isSelfNotes,
            course: course,
            group: group,
            lastMessage: lastMessage
        )
    }

    func withLastMessage(
        _ lastMessage: NativeInboxLastMessage,
        lastActivityAt: String
    ) -> NativeInboxConversation {
        NativeInboxConversation(
            kind: kind,
            id: id,
            displayName: displayName,
            avatarUrl: avatarUrl,
            participantAvatars: participantAvatars,
            unreadCount: unreadCount,
            pinned: pinned,
            lastActivityAt: lastActivityAt,
            peer: peer,
            isSelfNotes: isSelfNotes,
            course: course,
            group: group,
            lastMessage: lastMessage
        )
    }

    init(
        kind: Kind,
        id: String,
        displayName: String,
        avatarUrl: String?,
        participantAvatars: [String],
        unreadCount: Int,
        pinned: Bool,
        lastActivityAt: String,
        peer: NativeChatAuthor?,
        isSelfNotes: Bool,
        course: NativeInboxCourseRef?,
        group: NativeInboxGroupRef?,
        lastMessage: NativeInboxLastMessage?
    ) {
        self.kind = kind
        self.id = id
        self.displayName = displayName
        self.avatarUrl = avatarUrl
        self.participantAvatars = participantAvatars
        self.unreadCount = unreadCount
        self.pinned = pinned
        self.lastActivityAt = lastActivityAt
        self.peer = peer
        self.isSelfNotes = isSelfNotes
        self.course = course
        self.group = group
        self.lastMessage = lastMessage
    }
}

struct NativeInboxCourseRef: Codable, Hashable, Sendable {
    let id: String
    let name: String
    let code: String?
    let school: String?
    let semesterLabel: String?
}

struct NativeInboxGroupRef: Codable, Hashable, Sendable {
    let id: String
    let participantCount: Int
    let participants: [NativeChatAuthor]
}

struct NativeInboxLastMessage: Codable, Hashable, Sendable {
    let id: String
    let sender: NativeChatAuthor
    let type: String
    let body: String?
    let imageUrl: String?
    let deletedAt: String?
    let createdAt: String
}

struct NativeChatAuthor: Codable, Hashable, Sendable, Identifiable {
    let id: String
    let username: String
    let nickname: String?
    let avatarUrl: String?

    var displayName: String {
        let trimmed = nickname?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        return trimmed.isEmpty ? username : trimmed
    }
}

struct NativeDirectMessagePageData: Decodable, Sendable {
    let connection: NativeDirectConversation
    let messages: [NativeDirectMessage]
}

struct NativeDirectMessagePageMeta: Decodable, Sendable {
    let hasMore: Bool
    let nextCursor: String?
    let realtimeCursor: String
}

struct NativeDirectMessagePageResponse: Decodable, Sendable {
    let data: NativeDirectMessagePageData
    let meta: NativeDirectMessagePageMeta
}

struct NativeDirectConversation: Codable, Sendable {
    let id: String
    let isSelfNotes: Bool
    let replyLimitUnlocked: Bool?
    let displayName: String
    let peer: NativeChatAuthor

    init(
        id: String,
        isSelfNotes: Bool,
        replyLimitUnlocked: Bool? = nil,
        displayName: String,
        peer: NativeChatAuthor
    ) {
        self.id = id
        self.isSelfNotes = isSelfNotes
        self.replyLimitUnlocked = replyLimitUnlocked
        self.displayName = displayName
        self.peer = peer
    }
}

struct NativePlanAuthor: Codable, Hashable, Sendable {
    let id: String
    let username: String
    let nickname: String?
    let avatarUrl: String?

    var displayName: String {
        let nick = nickname?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        return nick.isEmpty ? username : nick
    }
}

struct NativePlanRequest: Codable, Identifiable, Hashable, Sendable {
    let id: String
    let connectionId: String
    let commitmentId: String?
    let originContextId: String?
    let coordinationPolicy: String?
    let status: String
    let planType: String
    let title: String
    let location: String?
    let message: String?
    let startTime: String
    let endTime: String
    let proposer: NativePlanAuthor
    let receiver: NativePlanAuthor
    let counterOfId: String?
    let availabilityShareId: String?
    let scheduleShareLinkId: String?
    let origin: NativePlanOrigin?
    let viewerOutcome: String?
    let viewerMeetAgain: String?
    let meetAgainAvailable: Bool?
    let createdAt: String
    let updatedAt: String

    init(
        id: String,
        connectionId: String,
        commitmentId: String? = nil,
        originContextId: String? = nil,
        coordinationPolicy: String? = nil,
        status: String,
        planType: String,
        title: String,
        location: String?,
        message: String?,
        startTime: String,
        endTime: String,
        proposer: NativePlanAuthor,
        receiver: NativePlanAuthor,
        counterOfId: String?,
        availabilityShareId: String?,
        scheduleShareLinkId: String?,
        origin: NativePlanOrigin? = nil,
        viewerOutcome: String? = nil,
        viewerMeetAgain: String? = nil,
        meetAgainAvailable: Bool? = nil,
        createdAt: String,
        updatedAt: String
    ) {
        self.id = id
        self.connectionId = connectionId
        self.commitmentId = commitmentId
        self.originContextId = originContextId
        self.coordinationPolicy = coordinationPolicy
        self.status = status
        self.planType = planType
        self.title = title
        self.location = location
        self.message = message
        self.startTime = startTime
        self.endTime = endTime
        self.proposer = proposer
        self.receiver = receiver
        self.counterOfId = counterOfId
        self.availabilityShareId = availabilityShareId
        self.scheduleShareLinkId = scheduleShareLinkId
        self.origin = origin
        self.viewerOutcome = viewerOutcome
        self.viewerMeetAgain = viewerMeetAgain
        self.meetAgainAvailable = meetAgainAvailable
        self.createdAt = createdAt
        self.updatedAt = updatedAt
    }

    var isPending: Bool { status == "PENDING" }
    var isAccepted: Bool { status == "ACCEPTED" }

    var usesActionCoordinationV2: Bool {
        coordinationPolicy == "CREATOR_GATED_V2"
            && commitmentId != nil
            && originContextId != nil
    }

    var startDate: Date? { Date.sideSeatChatISO8601(startTime) }
    var endDate: Date? { Date.sideSeatChatISO8601(endTime) }

    func isOutcomeEligible(at date: Date = Date()) -> Bool {
        status == "ACCEPTED" && (endDate ?? .distantFuture) <= date
    }

    func replacingViewerOutcome(with value: String) -> NativePlanRequest {
        replacingPrivateResponses(
            outcome: value,
            meetAgain: value != "OCCURRED" && viewerMeetAgain == "YES" ? "WITHDRAWN" : viewerMeetAgain
        )
    }

    var showsMeetAgain: Bool {
        isOutcomeEligible() && viewerOutcome == "OCCURRED"
            && (meetAgainAvailable == true || viewerMeetAgain == "YES")
    }

    func replacingViewerMeetAgain(with value: String) -> NativePlanRequest {
        replacingPrivateResponses(outcome: viewerOutcome, meetAgain: value)
    }

    private func replacingPrivateResponses(outcome: String?, meetAgain: String?) -> NativePlanRequest {
        NativePlanRequest(
            id: id,
            connectionId: connectionId,
            commitmentId: commitmentId,
            originContextId: originContextId,
            coordinationPolicy: coordinationPolicy,
            status: status,
            planType: planType,
            title: title,
            location: location,
            message: message,
            startTime: startTime,
            endTime: endTime,
            proposer: proposer,
            receiver: receiver,
            counterOfId: counterOfId,
            availabilityShareId: availabilityShareId,
            scheduleShareLinkId: scheduleShareLinkId,
            origin: origin,
            viewerOutcome: outcome,
            viewerMeetAgain: meetAgain,
            meetAgainAvailable: meetAgainAvailable,
            createdAt: createdAt,
            updatedAt: updatedAt
        )
    }
}

struct NativePlanOutcome: Decodable, Sendable {
    let planId: String
    let value: String
    let updatedAt: String
}

struct NativePlanOutcomeEnvelope: Decodable, Sendable {
    let outcome: NativePlanOutcome
}

struct NativePlanOutcomeRequest: Encodable, Sendable {
    let value: String
}

struct NativePlanMeetAgainRequest: Encodable, Sendable {
    let value: String
}

struct NativePlanMeetAgainEnvelope: Decodable, Sendable {
    let meetAgain: NativePlanOutcome
}

enum PlanSubmissionTarget: Hashable, Sendable {
    case legacyConnection(connectionID: String)
    case actionContext(contextID: String)
    case coordination(reservationID: String)
    case legacyCounter(planID: String)
    case actionCounter(revisionID: String, commitmentID: String, contextID: String)

    static func counter(for plan: NativePlanRequest) -> PlanSubmissionTarget {
        if plan.usesActionCoordinationV2,
           let commitmentID = plan.commitmentId,
           let contextID = plan.originContextId
        {
            return .actionCounter(
                revisionID: plan.id,
                commitmentID: commitmentID,
                contextID: contextID
            )
        }
        return .legacyCounter(planID: plan.id)
    }
}

struct PlanSubmissionResult: Hashable, Sendable {
    let connectionID: String
    let contextID: String?
    let focus: DirectChatFocus

    init(
        connectionID: String,
        commitmentID: String?,
        revisionID: String?,
        contextID: String?
    ) {
        self.connectionID = connectionID
        self.contextID = contextID
        if let commitmentID {
            focus = .plan(commitmentID: commitmentID, revisionID: revisionID)
        } else if let revisionID {
            focus = .plan(id: revisionID)
        } else {
            preconditionFailure("A Plan submission result requires a commitment or revision identifier.")
        }
    }
}

struct NativePlanOrigin: Codable, Hashable, Sendable {
    let kind: String
    let id: String
    let snapshot: NativeActionContext
}

struct NativeActionContextCourse: Codable, Hashable, Sendable {
    let id: String
    let code: String?
    let name: String
}

struct NativeActionContextAuthor: Codable, Hashable, Sendable {
    let id: String
    let displayName: String
}

struct NativeActionContext: Codable, Hashable, Sendable {
    let version: Int
    let sourceKind: String
    let sourceId: String
    let title: String
    let startsAt: String?
    let endsAt: String?
    let location: String?
    let planType: String
    let participantIds: [String]
    let author: NativeActionContextAuthor
    let course: NativeActionContextCourse?

    var startDate: Date? { startsAt.flatMap(Date.sideSeatChatISO8601) }
    var endDate: Date? { endsAt.flatMap(Date.sideSeatChatISO8601) }
}

struct NativeActionInterest: Codable, Identifiable, Hashable, Sendable {
    let id: String
    let status: String
    let connectionId: String
    let postId: String
    let context: NativeActionContext
    let createdAt: String
    let updatedAt: String
}

struct NativeMutualOpportunitySource: Codable, Identifiable, Hashable, Sendable {
    let id: String
    let policyVersion: String
    let topic: String
    let context: NativeActionContext

    var planDraft: NativePlanDraft {
        NativePlanDraft(
            title: context.title,
            startTime: context.startsAt,
            endTime: context.endsAt,
            location: context.location,
            planType: context.planType,
            participantIds: context.participantIds,
            origin: NativePlanOriginReference(kind: "MUTUAL_OPPORTUNITY", id: id)
        )
    }
}

struct NativePlanDraft: Codable, Hashable, Identifiable, Sendable {
    let title: String
    let startTime: String?
    let endTime: String?
    let location: String?
    let planType: String
    let participantIds: [String]
    let origin: NativePlanOriginReference

    var id: String { "\(origin.kind):\(origin.id)" }

    init(context: NativeActionContext, interestID: String) {
        title = context.title
        startTime = context.startsAt
        endTime = context.endsAt
        location = context.location
        planType = context.planType
        participantIds = context.participantIds
        origin = NativePlanOriginReference(kind: "ACTION_INTEREST", id: interestID)
    }

    init(
        title: String,
        startTime: String?,
        endTime: String?,
        location: String?,
        planType: String,
        participantIds: [String] = [],
        origin: NativePlanOriginReference
    ) {
        self.title = title
        self.startTime = startTime
        self.endTime = endTime
        self.location = location
        self.planType = planType
        self.participantIds = participantIds
        self.origin = origin
    }
}

struct NativePlanOriginReference: Codable, Hashable, Sendable {
    let kind: String
    let id: String
}

struct NativeActionInterestMutationPayload: Decodable, Sendable {
    let interest: NativeActionInterest
    let messageId: String?
}

struct NativePlansListPayload: Decodable, Sendable {
    let plans: [NativePlanRequest]
}

struct NativePlanEnvelopePayload: Decodable, Sendable {
    let plan: NativePlanRequest
}

struct NativePlanCreatePayload: Decodable, Sendable {
    let plan: NativePlanRequest
    let messageId: String
}

struct NativePlanCreateRequest: Encodable, Sendable {
    let title: String
    let location: String?
    let message: String?
    let startTime: String
    let endTime: String
    let planType: String
    let origin: NativePlanOriginReference?
}

struct NativeDirectMessage: Codable, Identifiable, Hashable, Sendable {
    let id: String
    let connectionId: String
    let sender: NativeChatAuthor
    let type: String
    let body: String?
    let imageUrl: String?
    let location: NativeChatLocation?
    let availabilityShareId: String?
    let planRequestId: String?
    let planRequest: NativePlanRequest?
    let actionInterestId: String?
    let actionContextId: String?
    let actionInterest: NativeActionInterest?
    let mutualOpportunity: NativeMutualOpportunitySource?
    let replyTo: NativeDirectMessageReply?
    let deletedAt: String?
    let createdAt: String

    init(
        id: String,
        connectionId: String,
        sender: NativeChatAuthor,
        type: String,
        body: String?,
        createdAt: String,
        imageUrl: String? = nil,
        location: NativeChatLocation? = nil,
        availabilityShareId: String? = nil,
        planRequestId: String? = nil,
        planRequest: NativePlanRequest? = nil,
        actionInterestId: String? = nil,
        actionContextId: String? = nil,
        actionInterest: NativeActionInterest? = nil,
        mutualOpportunity: NativeMutualOpportunitySource? = nil,
        replyTo: NativeDirectMessageReply? = nil,
        deletedAt: String? = nil
    ) {
        self.id = id
        self.connectionId = connectionId
        self.sender = sender
        self.type = type
        self.body = body
        self.imageUrl = imageUrl
        self.location = location
        self.availabilityShareId = availabilityShareId
        self.planRequestId = planRequestId
        self.planRequest = planRequest
        self.actionInterestId = actionInterestId
        self.actionContextId = actionContextId
        self.actionInterest = actionInterest
        self.mutualOpportunity = mutualOpportunity
        self.replyTo = replyTo
        self.deletedAt = deletedAt
        self.createdAt = createdAt
    }

    var isDeleted: Bool { deletedAt != nil }

    /// Structured cards are projections of server-owned workflow state. They
    /// must be handled through their own accept/decline/withdraw controls,
    /// never hidden by the generic message delete action.
    var supportsUserDeletion: Bool {
        type == "TEXT" || type == "IMAGE" || type == "LOCATION"
    }

    var createdDate: Date? {
        Date.sideSeatChatISO8601(createdAt)
    }

    func asInboxLastMessage() -> NativeInboxLastMessage {
        NativeInboxLastMessage(
            id: id,
            sender: sender,
            type: type,
            body: body,
            imageUrl: imageUrl,
            deletedAt: deletedAt,
            createdAt: createdAt
        )
    }

    func replacingPlanRequest(_ plan: NativePlanRequest) -> NativeDirectMessage {
        NativeDirectMessage(
            id: id,
            connectionId: connectionId,
            sender: sender,
            type: type,
            body: body,
            createdAt: createdAt,
            imageUrl: imageUrl,
            location: location,
            availabilityShareId: availabilityShareId,
            planRequestId: planRequestId,
            planRequest: plan,
            actionInterestId: actionInterestId,
            actionContextId: actionContextId,
            actionInterest: actionInterest,
            mutualOpportunity: mutualOpportunity,
            replyTo: replyTo,
            deletedAt: deletedAt
        )
    }
}

enum NativeMessageSendStatus: String, Codable, Hashable, Sendable {
    case sending
    case sent
    case failed
}

struct NativeChatLocation: Codable, Hashable, Sendable {
    let latitude: Double
    let longitude: Double
    let name: String?
}

struct NativeDirectMessageReply: Codable, Hashable, Sendable {
    let id: String
    let sender: NativeChatAuthor
    let type: String
    let body: String?
    let deletedAt: String?

    var isDeleted: Bool { deletedAt != nil }

    var previewText: String {
        if isDeleted { return AppLocalization.string( "Message deleted") }
        switch type {
        case "IMAGE": return AppLocalization.string( "Photo")
        case "LOCATION": return AppLocalization.string( "Location")
        default:
            let trimmed = body?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
            if trimmed.isEmpty { return AppLocalization.string( "Message") }
            return trimmed
        }
    }
}

struct NativeDirectTextMessageRequest: Encodable, Sendable {
    let type = "TEXT"
    let body: String
    let replyToId: String?
    let actionContextId: String?

    init(body: String, replyToId: String? = nil, actionContextId: String? = nil) {
        self.body = body
        self.replyToId = replyToId
        self.actionContextId = actionContextId
    }

    private enum CodingKeys: String, CodingKey {
        case type, body, replyToId, actionContextId
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(type, forKey: .type)
        try container.encode(body, forKey: .body)
        try container.encodeIfPresent(replyToId, forKey: .replyToId)
        try container.encodeIfPresent(actionContextId, forKey: .actionContextId)
    }
}

struct NativeDirectImageMessageRequest: Encodable, Sendable {
    let type = "IMAGE"
    let imageUrl: String
    let body: String?
    let replyToId: String?
    let actionContextId: String?

    init(
        imageUrl: String,
        body: String? = nil,
        replyToId: String? = nil,
        actionContextId: String? = nil
    ) {
        self.imageUrl = imageUrl
        self.body = body
        self.replyToId = replyToId
        self.actionContextId = actionContextId
    }

    private enum CodingKeys: String, CodingKey {
        case type, imageUrl, body, replyToId, actionContextId
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(type, forKey: .type)
        try container.encode(imageUrl, forKey: .imageUrl)
        try container.encodeIfPresent(body, forKey: .body)
        try container.encodeIfPresent(replyToId, forKey: .replyToId)
        try container.encodeIfPresent(actionContextId, forKey: .actionContextId)
    }
}

struct NativeDirectLocationMessageRequest: Encodable, Sendable {
    let type = "LOCATION"
    let locationLat: Double
    let locationLng: Double
    let locationName: String?
    let replyToId: String?
    let actionContextId: String?

    init(
        locationLat: Double,
        locationLng: Double,
        locationName: String? = nil,
        replyToId: String? = nil,
        actionContextId: String? = nil
    ) {
        self.locationLat = locationLat
        self.locationLng = locationLng
        self.locationName = locationName
        self.replyToId = replyToId
        self.actionContextId = actionContextId
    }

    private enum CodingKeys: String, CodingKey {
        case type, locationLat, locationLng, locationName, replyToId, actionContextId
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(type, forKey: .type)
        try container.encode(locationLat, forKey: .locationLat)
        try container.encode(locationLng, forKey: .locationLng)
        try container.encodeIfPresent(locationName, forKey: .locationName)
        try container.encodeIfPresent(replyToId, forKey: .replyToId)
        try container.encodeIfPresent(actionContextId, forKey: .actionContextId)
    }
}

struct NativeChatImageUpload: Decodable, Sendable {
    let url: String
}

enum NativeReportReason: String, CaseIterable, Identifiable, Sendable {
    case harassment = "HARASSMENT"
    case repeatedUnwantedContact = "REPEATED_UNWANTED_CONTACT"
    case offensiveLanguage = "OFFENSIVE_LANGUAGE"
    case spam = "SPAM"
    case fakeIdentity = "FAKE_IDENTITY"
    case other = "OTHER"

    var id: String { rawValue }

    var title: String {
        switch self {
        case .harassment: AppLocalization.string( "Harassment")
        case .repeatedUnwantedContact: AppLocalization.string( "Repeated unwanted contact")
        case .offensiveLanguage: AppLocalization.string( "Offensive language")
        case .spam: AppLocalization.string( "Spam")
        case .fakeIdentity: AppLocalization.string( "Fake identity")
        case .other: AppLocalization.string( "Other")
        }
    }
}

struct NativeMessageReportRequest: Encodable, Sendable {
    let reportedUserId: String
    let messageId: String?
    let courseRoomMessageId: String?
    let groupChatMessageId: String?
    let classmatePostId: String?
    let classmatePostCommentId: String?
    let discoverActivityCommentId: String?
    let reason: String
    let details: String

    init(
        reportedUserId: String,
        messageId: String? = nil,
        courseRoomMessageId: String? = nil,
        groupChatMessageId: String? = nil,
        classmatePostId: String? = nil,
        classmatePostCommentId: String? = nil,
        discoverActivityCommentId: String? = nil,
        reason: NativeReportReason,
        details: String = ""
    ) {
        self.reportedUserId = reportedUserId
        self.messageId = messageId
        self.courseRoomMessageId = courseRoomMessageId
        self.groupChatMessageId = groupChatMessageId
        self.classmatePostId = classmatePostId
        self.classmatePostCommentId = classmatePostCommentId
        self.discoverActivityCommentId = discoverActivityCommentId
        self.reason = reason.rawValue
        self.details = details
    }
}

struct NativeReportResult: Decodable, Sendable {
    let id: String
}

extension NativeDirectMessage {
    var previewText: String {
        if isDeleted { return AppLocalization.string( "Message deleted") }
        switch type {
        case "IMAGE": return AppLocalization.string( "Photo")
        case "LOCATION": return location?.name ?? AppLocalization.string( "Location")
        default:
            let trimmed = body?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
            if trimmed.isEmpty { return AppLocalization.string( "Message") }
            return trimmed
        }
    }

    func asReplyReference() -> NativeDirectMessageReply {
        NativeDirectMessageReply(
            id: id,
            sender: sender,
            type: type,
            body: body,
            deletedAt: deletedAt
        )
    }

    func tombstoned(at isoDate: String = ISO8601DateFormatter().string(from: Date())) -> NativeDirectMessage {
        NativeDirectMessage(
            id: id,
            connectionId: connectionId,
            sender: sender,
            type: type,
            body: nil,
            createdAt: createdAt,
            imageUrl: nil,
            location: nil,
            availabilityShareId: availabilityShareId,
            planRequestId: planRequestId,
            planRequest: planRequest,
            replyTo: replyTo,
            deletedAt: isoDate
        )
    }
}

struct NativeChatRealtimeEvent: Decodable, Sendable {
    let schemaVersion: Int
    let type: String
    let conversation: NativeChatRealtimeConversation
    let cursor: String
    let occurredAt: String
    let resumed: Bool?
    let message: NativeDirectMessage?
    let messageId: String?
    let reason: String?
    let reloadHistory: Bool?
    let retryable: Bool?
    let requestId: String?
}

struct NativeChatRealtimeConversation: Decodable, Sendable {
    let kind: String
    let id: String
}

enum ChatScrollDecision: Equatable, Sendable {
    case scrollToBottom(animated: Bool)
    case retainPosition(newRemoteCount: Int)
    case none
}

/// WeChat-style open: always land at bottom; if unread exceeds ~one screen, offer ↑ jump.
enum ChatUnreadJumpPolicy {
    /// Roughly one viewport of chat bubbles (avatar + text + timestamp).
    static let screenfulMessageCount = 8

    static func shouldShowJump(unreadCount: Int) -> Bool {
        unreadCount > screenfulMessageCount
    }

    /// Oldest unread among the latest `unreadCount` messages from others (chronological list).
    static func firstUnreadMessageID(
        messages: [(id: String, senderID: String)],
        unreadCount: Int,
        currentUserID: String
    ) -> String? {
        guard unreadCount > 0, !currentUserID.isEmpty else { return nil }
        var remaining = unreadCount
        var firstID: String?
        for message in messages.reversed() {
            guard message.senderID != currentUserID else { continue }
            firstID = message.id
            remaining -= 1
            if remaining == 0 { break }
        }
        return firstID
    }
}

/// Passes inbox unread into a thread before mark-read clears the badge.
@MainActor
enum ChatUnreadLaunch {
    private static var pendingUnreadCounts: [String: Int] = [:]

    static func stage(conversationID: String, unreadCount: Int) {
        if unreadCount > 0 {
            pendingUnreadCounts[conversationID] = unreadCount
        } else {
            pendingUnreadCounts.removeValue(forKey: conversationID)
        }
    }

    static func take(conversationID: String) -> Int {
        pendingUnreadCounts.removeValue(forKey: conversationID) ?? 0
    }
}

enum ChatScrollPolicy {
    static let bottomThreshold: CGFloat = 80

    static func decision(
        previousIDs: Set<String>,
        nextMessages: [NativeDirectMessage],
        currentUserID: String,
        isNearBottom: Bool
    ) -> ChatScrollDecision {
        decision(
            previousIDs: previousIDs,
            added: nextMessages
                .filter { !previousIDs.contains($0.id) }
                .map { (id: $0.id, senderID: $0.sender.id) },
            currentUserID: currentUserID,
            isNearBottom: isNearBottom
        )
    }

    static func decision(
        previousIDs: Set<String>,
        nextMessages: [NativeCommunityMessage],
        currentUserID: String,
        isNearBottom: Bool
    ) -> ChatScrollDecision {
        decision(
            previousIDs: previousIDs,
            added: nextMessages
                .filter { !previousIDs.contains($0.id) }
                .map { (id: $0.id, senderID: $0.sender.id) },
            currentUserID: currentUserID,
            isNearBottom: isNearBottom
        )
    }

    static func decision(
        previousIDs: Set<String>,
        added: [(id: String, senderID: String)],
        currentUserID: String,
        isNearBottom: Bool
    ) -> ChatScrollDecision {
        _ = previousIDs
        guard !added.isEmpty else { return .none }
        if added.contains(where: { $0.senderID == currentUserID }) {
            return .scrollToBottom(animated: true)
        }
        if isNearBottom {
            return .scrollToBottom(animated: false)
        }
        let remoteCount = added.filter { $0.senderID != currentUserID }.count
        return remoteCount > 0 ? .retainPosition(newRemoteCount: remoteCount) : .none
    }

    /// Older pages are prepended while scrolled up — never treat them as live arrivals.
    static func decisionIgnoringPagination() -> ChatScrollDecision { .none }
}

/// Keeps a thread pinned to its latest message while the software keyboard changes
/// the available height. A real user scroll after the transition releases the pin.
struct ChatKeyboardBottomAnchorState: Equatable, Sendable {
    private(set) var isPinned = true
    private(set) var isKeyboardVisible = false

    mutating func nearBottomChanged(_ isNearBottom: Bool) {
        if isNearBottom {
            isPinned = true
        }
    }

    mutating func pinToBottom() {
        isPinned = true
    }

    mutating func userScrollBegan() {
        isPinned = false
    }

    @discardableResult
    mutating func composerFocusChanged(isFocused: Bool, isNearBottom: Bool) -> Bool {
        _ = isFocused
        if isNearBottom {
            isPinned = true
        }
        return isPinned
    }

    mutating func keyboardVisibilityChanged(
        isVisible: Bool,
        isNearBottom: Bool
    ) -> Bool? {
        guard isVisible != isKeyboardVisible else { return nil }
        isKeyboardVisible = isVisible
        if isNearBottom {
            isPinned = true
        }
        return isPinned
    }
}

enum ChatKeyboardTransition {
    static func isVisible(endFrame: CGRect, screenBounds: CGRect) -> Bool {
        guard endFrame.height > 1 else { return false }
        return endFrame.intersection(screenBounds).height > 1
    }

    @MainActor
    static func visibility(from notification: Notification) -> Bool? {
        guard let endFrame = notification.userInfo?[UIResponder.keyboardFrameEndUserInfoKey] as? CGRect,
              let screenBounds = UIApplication.shared.connectedScenes
                  .compactMap({ ($0 as? UIWindowScene)?.screen.bounds })
                  .first
        else { return nil }

        return isVisible(endFrame: endFrame, screenBounds: screenBounds)
    }
}

enum InboxActivityFormatting {
    /// Today → time; yesterday → label; this week → weekday; older → short date.
    static func label(for date: Date, now: Date = Date(), calendar: Calendar = .current) -> String {
        if calendar.isDate(date, inSameDayAs: now) {
            return date.formatted(date: .omitted, time: .shortened)
        }
        if let yesterday = calendar.date(byAdding: .day, value: -1, to: now),
           calendar.isDate(date, inSameDayAs: yesterday)
        {
            return AppLocalization.string( "Yesterday")
        }
        if let weekAgo = calendar.date(byAdding: .day, value: -6, to: calendar.startOfDay(for: now)),
           date >= weekAgo
        {
            return date.formatted(.dateTime.weekday(.abbreviated))
        }
        return date.formatted(date: .abbreviated, time: .omitted)
    }
}

enum ChatDaySeparatorFormatting {
    static func label(for day: Date, calendar: Calendar = .current) -> String {
        if calendar.isDateInToday(day) { return AppLocalization.string( "Today") }
        if calendar.isDateInYesterday(day) { return AppLocalization.string( "Yesterday") }
        return day.formatted(date: .abbreviated, time: .omitted)
    }

    static func dayStart(for date: Date?, calendar: Calendar = .current) -> Date? {
        guard let date else { return nil }
        return calendar.startOfDay(for: date)
    }
}

enum ChatMessageGrouping {
    static let continuationInterval: TimeInterval = 2 * 60
    static let timestampInterval: TimeInterval = 15 * 60

    static func isContinuation(
        previousSenderID: String?,
        previousDate: Date?,
        senderID: String,
        date: Date?
    ) -> Bool {
        guard previousSenderID == senderID,
              let previousDate,
              let date
        else { return false }

        let interval = date.timeIntervalSince(previousDate)
        return interval >= 0 && interval <= continuationInterval
    }

    static func shouldShowTimestamp(
        previousDate: Date?,
        date: Date?,
        calendar: Calendar = .current
    ) -> Bool {
        guard let date else { return false }
        guard let previousDate else { return true }
        guard calendar.isDate(previousDate, inSameDayAs: date) else { return true }
        return date.timeIntervalSince(previousDate) >= timestampInterval
    }

    static func timestampLabel(
        for date: Date,
        calendar: Calendar = .current
    ) -> String {
        let time = date.formatted(date: .omitted, time: .shortened)
        if calendar.isDateInToday(date) {
            return AppLocalization.string( "Today, \(time)")
        }
        if calendar.isDateInYesterday(date) {
            return AppLocalization.string( "Yesterday, \(time)")
        }
        return date.formatted(date: .abbreviated, time: .shortened)
    }
}

struct ChatTimelineTimestamp: View {
    let date: Date

    var body: some View {
        Text(ChatMessageGrouping.timestampLabel(for: date))
            .font(.caption2.weight(.semibold))
            .foregroundStyle(.secondary)
            .frame(maxWidth: .infinity)
            .padding(.top, 12)
            .padding(.bottom, 6)
            .accessibilityIdentifier("chat-timestamp-\(date.timeIntervalSince1970)")
    }
}

struct ChatMessageStack<Content: View>: View {
    static var eagerMessageLimit: Int { 160 }

    let usesLazyLayout: Bool
    private let content: () -> Content

    init(
        usesLazyLayout: Bool,
        @ViewBuilder content: @escaping () -> Content
    ) {
        self.usesLazyLayout = usesLazyLayout
        self.content = content
    }

    @ViewBuilder
    var body: some View {
        if usesLazyLayout {
            LazyVStack(spacing: 0) {
                content()
            }
        } else {
            VStack(spacing: 0) {
                content()
            }
        }
    }
}

struct ChatBubbleShape: Shape {
    let isMine: Bool
    let connectsAbove: Bool
    let connectsBelow: Bool

    func path(in rect: CGRect) -> Path {
        let radius = SideSeatTheme.Chat.bubbleRadius
        let joinedRadius: CGFloat = 5
        return UnevenRoundedRectangle(
            topLeadingRadius: !isMine && connectsAbove ? joinedRadius : radius,
            bottomLeadingRadius: !isMine && connectsBelow ? joinedRadius : radius,
            bottomTrailingRadius: isMine && connectsBelow ? joinedRadius : radius,
            topTrailingRadius: isMine && connectsAbove ? joinedRadius : radius,
            style: .continuous
        )
        .path(in: rect)
    }
}

private struct ChatKeyboardBottomAnchorModifier: ViewModifier {
    @Binding var state: ChatKeyboardBottomAnchorState
    @Binding var isNearBottom: Bool
    let requestBottom: (_ animated: Bool) -> Void

    func body(content: Content) -> some View {
        content
            .simultaneousGesture(
                DragGesture(minimumDistance: 6).onChanged { _ in
                    var updated = state
                    updated.userScrollBegan()
                    state = updated
                    isNearBottom = false
                }
            )
            .onChange(of: isNearBottom) { _, nearBottom in
                var updated = state
                updated.nearBottomChanged(nearBottom)
                state = updated
            }
            // Scroll only after UIKit has committed the keyboard's final frame. Asking a
            // LazyVStack to scroll while an attachment tray is leaving can create a layout loop.
            .onReceive(NotificationCenter.default.publisher(for: UIResponder.keyboardDidShowNotification)) { _ in
                var updated = state
                let shouldPin = updated.keyboardVisibilityChanged(
                    isVisible: true,
                    isNearBottom: isNearBottom
                )
                state = updated
                if shouldPin == true {
                    requestBottom(false)
                }
            }
            .onReceive(NotificationCenter.default.publisher(for: UIResponder.keyboardDidHideNotification)) { _ in
                var updated = state
                _ = updated.keyboardVisibilityChanged(
                    isVisible: false,
                    isNearBottom: isNearBottom
                )
                state = updated
            }
    }
}

enum ChatScrollAnchor {
    static let bottomID = "chat-bottom"

    /// Scroll once after LazyVStack commits new rows. Keyboard candidate-bar frame
    /// changes must never start additional scroll passes while the user is typing.
    @MainActor
    static func scrollToBottom(
        proxy: ScrollViewProxy,
        animated: Bool
    ) async {
        func jump() {
            proxy.scrollTo(bottomID, anchor: .bottom)
        }

        await Task.yield()
        if animated {
            withAnimation(.easeOut(duration: 0.22)) { jump() }
        } else {
            jump()
        }
    }
}

enum ChatInitialViewportPolicy {
    static func canReveal(
        hasPreparedViewport: Bool,
        hasCompletedInitialLoad: Bool,
        hasCachedSnapshot: Bool,
        isVisible: Bool,
        hasPositionedInitialTarget: Bool = true
    ) -> Bool {
        hasPreparedViewport
            && (hasCompletedInitialLoad || hasCachedSnapshot)
            && !isVisible
            && hasPositionedInitialTarget
    }
}

/// Bottom list anchor used for scroll-to-end and iOS 17 near-bottom detection.
struct ChatBottomSentinel: View {
    @Binding var isNearBottom: Bool
    var onReachedBottom: () -> Void

    var body: some View {
        Color.clear
            .frame(height: 12)
            .id(ChatScrollAnchor.bottomID)
            .onAppear {
                isNearBottom = true
                onReachedBottom()
            }
            .onDisappear {
                isNearBottom = false
            }
    }
}

extension View {
    func chatKeyboardBottomAnchor(
        state: Binding<ChatKeyboardBottomAnchorState>,
        isNearBottom: Binding<Bool>,
        requestBottom: @escaping (_ animated: Bool) -> Void
    ) -> some View {
        modifier(
            ChatKeyboardBottomAnchorModifier(
                state: state,
                isNearBottom: isNearBottom,
                requestBottom: requestBottom
            )
        )
    }

}

struct ChatUnreadJumpButton: View {
    let count: Int
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Text("↑ \(count) new messages")
                .font(.footnote.weight(.semibold))
                .padding(.horizontal, 12)
                .padding(.vertical, 8)
                .background(.ultraThinMaterial, in: Capsule())
        }
        .buttonStyle(SSPressButtonStyle())
        .accessibilityIdentifier("chat-unread-jump")
        .accessibilityLabel(AppLocalization.string( "\(count) earlier new messages"))
    }
}

extension NativeInboxPayload {
    static var uiTestingFixture: NativeInboxPayload {
        #if DEBUG
        UITestingChatFixtures.inboxPayload
        #else
        NativeInboxPayload(conversations: [], unreadTotal: 0, plansNeedingYourAction: 0)
        #endif
    }
}

extension NativeDirectMessagePageData {
    static var uiTestingFixture: NativeDirectMessagePageData {
        uiTestingFixture(connectionID: "ui-connection")
    }

    static func uiTestingFixture(connectionID: String) -> NativeDirectMessagePageData {
        #if DEBUG
        UITestingChatFixtures.directPage(connectionID: connectionID)
        #else
        NativeDirectMessagePageData(
            connection: NativeDirectConversation(
                id: connectionID,
                isSelfNotes: false,
                displayName: "Chat",
                peer: NativeChatAuthor(id: "peer", username: "peer", nickname: nil, avatarUrl: nil)
            ),
            messages: []
        )
        #endif
    }
}

extension Date {
    private static let sideSeatChatFractionalISO8601 = Date.ISO8601FormatStyle(
        includingFractionalSeconds: true
    )
    private static let sideSeatChatStandardISO8601 = Date.ISO8601FormatStyle()

    static func sideSeatChatISO8601(_ value: String) -> Date? {
        if let date = try? Date(value, strategy: sideSeatChatFractionalISO8601) {
            return date
        }
        return try? Date(value, strategy: sideSeatChatStandardISO8601)
    }
}
