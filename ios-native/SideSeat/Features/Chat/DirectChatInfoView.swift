import SwiftUI
import UIKit

enum MVPConversationPrimaryControl: String, CaseIterable, Sendable {
    case context
    case text
    case plan
    case safety
}

enum MVPConversationInfoSurface: String, CaseIterable, Sendable {
    case participant
    case context
    case search
    case safety
}

enum MVPConversationInfoPolicy {
    static let primaryControls: [MVPConversationPrimaryControl] = [
        .context,
        .text,
        .plan,
        .safety,
    ]

    static let surfaces: [MVPConversationInfoSurface] = [
        .participant,
        .context,
        .search,
        .safety,
    ]

    static let exposesPublicProfile = false
    static let exposesRelationshipManagement = false
    static let exposesContactExchange = false
    static let exposesLegacyAttachmentTray = false
}

struct ConversationContextSelection: Equatable, Sendable {
    enum Source: Equatable, Sendable {
        case actionInterest(interestID: String, contextID: String?)
        case mutualOpportunity(opportunityID: String)
        case plan
    }

    let context: NativeActionContext
    let source: Source

    static func resolve(
        focus: DirectChatFocus?,
        messages: [NativeDirectMessage]
    ) -> ConversationContextSelection? {
        if let focus, let focused = focusedSelection(focus, messages: messages) {
            return focused
        }
        for message in messages.reversed() {
            if let selection = selection(from: message) {
                return selection
            }
        }
        return nil
    }

    private static func focusedSelection(
        _ focus: DirectChatFocus,
        messages: [NativeDirectMessage]
    ) -> ConversationContextSelection? {
        let message: NativeDirectMessage?
        switch focus {
        case .message(let id):
            message = messages.last { $0.id == id }
        case .actionInterest(let id):
            message = messages.last { $0.actionInterest?.id == id }
        case .actionContext(let id):
            message = messages.last {
                $0.actionContextId == id || $0.planRequest?.originContextId == id
            }
        case .plan(let commitmentID, let revisionID):
            message = messages.last { candidate in
                guard let plan = candidate.planRequest else { return false }
                if let revisionID, plan.id == revisionID { return true }
                return plan.commitmentId == commitmentID
            }
        }
        return message.flatMap { selection(from: $0) }
    }

    private static func selection(from message: NativeDirectMessage) -> ConversationContextSelection? {
        if let interest = message.actionInterest {
            return ConversationContextSelection(
                context: interest.context,
                source: .actionInterest(
                    interestID: interest.id,
                    contextID: message.actionContextId
                )
            )
        }
        if let opportunity = message.mutualOpportunity {
            return ConversationContextSelection(
                context: opportunity.context,
                source: .mutualOpportunity(opportunityID: opportunity.id)
            )
        }
        if let origin = message.planRequest?.origin {
            return ConversationContextSelection(context: origin.snapshot, source: .plan)
        }
        return nil
    }

    var sourceTitle: String {
        switch source {
        case .mutualOpportunity:
            AppLocalization.string("Together opportunity")
        case .actionInterest:
            AppLocalization.string(context.sourceKind == "COURSE_ACTION" ? "Course action" : "Buddy action")
        case .plan:
            AppLocalization.string("Plan")
        }
    }

    var secondarySummary: String? {
        if let start = context.startDate {
            return start.formatted(date: .abbreviated, time: .shortened)
        }
        if let course = context.course {
            let title = [course.code, course.name]
                .compactMap { $0 }
                .filter { !$0.isEmpty }
                .joined(separator: " ")
            if !title.isEmpty { return title }
        }
        if let location = context.location?.trimmingCharacters(in: .whitespacesAndNewlines),
           !location.isEmpty {
            return location
        }
        return nil
    }
}

struct ConversationContextBar: View {
    let selection: ConversationContextSelection
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: SideSeatTheme.spaceMD) {
                Image(systemName: "sparkles")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(SideSeatTheme.accentText)
                    .frame(width: 32, height: 32)
                    .background(SideSeatTheme.accent.opacity(0.10), in: Circle())

                VStack(alignment: .leading, spacing: 2) {
                    Text(selection.sourceTitle)
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(SideSeatTheme.textSecondaryStrong)
                    Text(selection.context.localizedTitle)
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(SideSeatTheme.textPrimary)
                        .lineLimit(1)
                    if let summary = selection.secondarySummary {
                        Text(summary)
                            .font(.caption)
                            .foregroundStyle(SideSeatTheme.textSecondary)
                            .lineLimit(1)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)

                Image(systemName: "chevron.right")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.tertiary)
            }
            .padding(.horizontal, SideSeatTheme.spaceLG)
            .padding(.vertical, SideSeatTheme.spaceSM)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .background(.bar)
        .overlay(alignment: .bottom) { Divider() }
        .accessibilityIdentifier("conversation-context-bar")
    }
}

struct ConversationContextSheet: View {
    @Environment(\.dismiss) private var dismiss

    let selection: ConversationContextSelection
    var canMakePlan = false
    var onMakePlan: () -> Void = {}

    var body: some View {
        NavigationStack {
            List {
                Section {
                    VStack(alignment: .leading, spacing: SideSeatTheme.spaceSM) {
                        Text(selection.sourceTitle)
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(SideSeatTheme.textSecondaryStrong)
                        Text(selection.context.localizedTitle)
                            .font(.title3.weight(.semibold))
                            .foregroundStyle(SideSeatTheme.textPrimary)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    .padding(.vertical, SideSeatTheme.spaceXS)
                }

                if let course = selection.context.course {
                    Section {
                        contextRow(
                            title: AppLocalization.string("Course"),
                            value: [course.code, course.name]
                                .compactMap { $0 }
                                .filter { !$0.isEmpty }
                                .joined(separator: " "),
                            systemImage: "graduationcap"
                        )
                    }
                }

                Section {
                    if let start = selection.context.startDate {
                        contextRow(
                            title: AppLocalization.string("Starts"),
                            value: start.formatted(date: .abbreviated, time: .shortened),
                            systemImage: "calendar"
                        )
                    }
                    if let end = selection.context.endDate {
                        contextRow(
                            title: AppLocalization.string("Ends"),
                            value: end.formatted(date: .abbreviated, time: .shortened),
                            systemImage: "clock"
                        )
                    }
                    if let location = selection.context.location?.trimmingCharacters(in: .whitespacesAndNewlines),
                       !location.isEmpty {
                        contextRow(
                            title: AppLocalization.string("Location"),
                            value: location,
                            systemImage: "mappin.and.ellipse"
                        )
                    }
                }
            }
            .listStyle(.insetGrouped)
            .navigationTitle(selection.sourceTitle)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                }
            }
            .safeAreaInset(edge: .bottom, spacing: 0) {
                if canMakePlan {
                    SSPrimaryButton(
                        title: AppLocalization.string("Make a plan"),
                        fill: .product,
                        accessibilityID: "conversation-context-make-plan"
                    ) {
                        dismiss()
                        onMakePlan()
                    }
                    .padding(.horizontal, SideSeatTheme.screenHorizontal)
                    .padding(.vertical, SideSeatTheme.spaceSM)
                    .background(.bar)
                }
            }
        }
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
        .accessibilityIdentifier("conversation-context-sheet")
    }

    private func contextRow(title: String, value: String, systemImage: String) -> some View {
        HStack(alignment: .top, spacing: SideSeatTheme.spaceMD) {
            Image(systemName: systemImage)
                .foregroundStyle(SideSeatTheme.textSecondaryStrong)
                .frame(width: 22)
            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(SideSeatTheme.textSecondaryStrong)
                Text(value)
                    .foregroundStyle(SideSeatTheme.textPrimary)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }
}

struct ParticipantContextSheet: View {
    @Environment(\.dismiss) private var dismiss

    let conversation: NativeDirectConversation
    let selection: ConversationContextSelection?

    var body: some View {
        NavigationStack {
            List {
                Section {
                    HStack(spacing: SideSeatTheme.spaceLG) {
                        InitialAvatar(
                            name: conversation.displayName,
                            url: conversation.peer.avatarUrl,
                            size: 58
                        )
                        VStack(alignment: .leading, spacing: 3) {
                            Text(conversation.displayName)
                                .font(.headline)
                                .foregroundStyle(SideSeatTheme.textPrimary)
                            Text("@\(conversation.peer.username)")
                                .font(.subheadline)
                                .foregroundStyle(SideSeatTheme.textSecondary)
                        }
                    }
                    .padding(.vertical, SideSeatTheme.spaceXS)
                }

                if let selection {
                    Section {
                        VStack(alignment: .leading, spacing: 5) {
                            Text(selection.sourceTitle)
                                .font(.caption.weight(.semibold))
                                .foregroundStyle(SideSeatTheme.textSecondaryStrong)
                            Text(selection.context.localizedTitle)
                                .font(.body.weight(.medium))
                                .foregroundStyle(SideSeatTheme.textPrimary)
                                .fixedSize(horizontal: false, vertical: true)
                            if let summary = selection.secondarySummary {
                                Text(summary)
                                    .font(.footnote)
                                    .foregroundStyle(SideSeatTheme.textSecondary)
                            }
                        }
                    }
                }
            }
            .listStyle(.insetGrouped)
            .navigationTitle(conversation.displayName)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                }
            }
        }
        .presentationDetents([.medium])
        .presentationDragIndicator(.visible)
        .accessibilityIdentifier("participant-context-sheet")
    }
}

struct DirectChatInfoView: View {
    @Environment(SessionStore.self) private var session

    let store: DirectChatStore
    let searchRows: [ChatThreadSearchRow]
    let onSelectMessage: (String) -> Void
    /// Kept in the call contract so older callers remain source-compatible. MVP Chat Info
    /// deliberately does not expose a generic public-profile destination.
    let onViewProfile: (String) -> Void
    let onConversationClosed: () -> Void

    @State private var showThreadSearch = false
    @State private var showParticipantContext = false
    @State private var showContextDetails = false
    @State private var confirmEnd = false
    @State private var confirmBlock = false

    private var isSelfNotes: Bool {
        store.conversation?.isSelfNotes == true || store.connectionActions?.isSelfNotes == true
    }

    private var contextSelection: ConversationContextSelection? {
        ConversationContextSelection.resolve(focus: nil, messages: store.messages)
    }

    var body: some View {
        List {
            if !isSelfNotes, let conversation = store.conversation {
                participantSection(conversation)
            }

            if let contextSelection {
                Section {
                    ConversationContextBar(selection: contextSelection) {
                        showContextDetails = true
                    }
                    .listRowInsets(EdgeInsets())
                }
            }

            chatSection

            if !isSelfNotes {
                safetySection
            }
        }
        .listStyle(.insetGrouped)
        .navigationTitle("Chat info")
        .navigationBarTitleDisplayMode(.inline)
        .accessibilityIdentifier("direct-chat-info")
        .sheet(isPresented: $showThreadSearch) {
            ChatThreadSearchSheet(
                title: AppLocalization.string("Search chat"),
                rows: searchRows,
                onSelect: { messageID in
                    showThreadSearch = false
                    onSelectMessage(messageID)
                }
            )
        }
        .sheet(isPresented: $showParticipantContext) {
            if let conversation = store.conversation {
                ParticipantContextSheet(
                    conversation: conversation,
                    selection: contextSelection
                )
            }
        }
        .sheet(isPresented: $showContextDetails) {
            if let contextSelection {
                ConversationContextSheet(selection: contextSelection)
            }
        }
        .ssActionPrompt(
            isPresented: $confirmEnd,
            title: AppLocalization.string("End this conversation?"),
            systemImage: "bubble.left.and.bubble.right.fill",
            tint: SideSeatTheme.danger,
            onDismiss: { confirmEnd = false },
            accessibilityIdentifier: "direct-info-end-prompt"
        ) {
            [
                SSActionPromptAction(
                    id: "direct-info-cancel-end",
                    title: AppLocalization.string("Cancel"),
                    systemImage: "xmark",
                    role: .cancel
                ) {},
                SSActionPromptAction(
                    id: "direct-info-confirm-end",
                    title: AppLocalization.string("End chat"),
                    systemImage: "rectangle.portrait.and.arrow.right",
                    role: .destructive
                ) {
                    Task {
                        if await store.endConnection(using: session) {
                            onConversationClosed()
                        }
                    }
                },
            ]
        }
        .ssActionPrompt(
            isPresented: $confirmBlock,
            title: AppLocalization.string("Block this person?"),
            systemImage: "hand.raised.fill",
            tint: SideSeatTheme.danger,
            onDismiss: { confirmBlock = false },
            accessibilityIdentifier: "direct-info-block-prompt"
        ) {
            [
                SSActionPromptAction(
                    id: "direct-info-cancel-block",
                    title: AppLocalization.string("Cancel"),
                    systemImage: "xmark",
                    role: .cancel
                ) {},
                SSActionPromptAction(
                    id: "direct-info-confirm-block",
                    title: AppLocalization.string("Block"),
                    systemImage: "hand.raised",
                    role: .destructive
                ) {
                    Task {
                        if await store.blockPeer(using: session) {
                            onConversationClosed()
                        }
                    }
                },
            ]
        }
        .onDisappear {
            store.clearActionIssue()
        }
    }

    private func participantSection(_ conversation: NativeDirectConversation) -> some View {
        Section {
            Button {
                showParticipantContext = true
            } label: {
                HStack(spacing: SideSeatTheme.spaceMD) {
                    InitialAvatar(
                        name: conversation.displayName,
                        url: conversation.peer.avatarUrl,
                        size: 46
                    )
                    VStack(alignment: .leading, spacing: 2) {
                        Text(conversation.displayName)
                            .font(.body.weight(.semibold))
                            .foregroundStyle(SideSeatTheme.textPrimary)
                        Text("@\(conversation.peer.username)")
                            .font(.footnote)
                            .foregroundStyle(SideSeatTheme.textSecondary)
                    }
                    Spacer(minLength: SideSeatTheme.spaceSM)
                    Image(systemName: "chevron.right")
                        .font(.footnote.weight(.semibold))
                        .foregroundStyle(.tertiary)
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityIdentifier("direct-info-participant-context")
        }
    }

    private var chatSection: some View {
        Section {
            Button {
                showThreadSearch = true
            } label: {
                infoRow(title: "Search chat", systemImage: "magnifyingglass")
            }
            .accessibilityIdentifier("direct-info-search")

            if !isSelfNotes {
                NavigationLink {
                    DirectChatRemarkEditor(store: store)
                } label: {
                    HStack(spacing: 12) {
                        Image(systemName: "pencil")
                            .frame(width: 22)
                            .foregroundStyle(.secondary)
                        Text("Contact remark")
                            .foregroundStyle(.primary)
                        Spacer(minLength: 8)
                        if let remark = store.connectionActions?.remark, !remark.isEmpty {
                            Text(remark)
                                .foregroundStyle(.secondary)
                                .lineLimit(1)
                        }
                    }
                }
                .accessibilityIdentifier("direct-info-remark")
            }
        }
    }

    private var safetySection: some View {
        Section {
            Button("End chat", role: .destructive) {
                confirmEnd = true
            }
            .accessibilityIdentifier("direct-info-end")

            Button("Block", role: .destructive) {
                confirmBlock = true
            }
            .accessibilityIdentifier("direct-info-block")
        }
    }

    private func infoRow(title: LocalizedStringKey, systemImage: String) -> some View {
        HStack(spacing: 12) {
            Image(systemName: systemImage)
                .frame(width: 22)
                .foregroundStyle(.secondary)
            Text(title)
                .foregroundStyle(.primary)
            Spacer()
            Image(systemName: "chevron.right")
                .font(.footnote.weight(.semibold))
                .foregroundStyle(.tertiary)
        }
        .contentShape(Rectangle())
    }
}

private struct DirectChatRemarkEditor: View {
    @Environment(SessionStore.self) private var session
    @Environment(\.dismiss) private var dismiss

    let store: DirectChatStore

    @State private var draft = ""
    @State private var hasPrepared = false

    var body: some View {
        Form {
            Section {
                TextField("Remark", text: $draft)
                    .accessibilityIdentifier("direct-remark-field")
            } footer: {
                Text("A remark is visible only to you.")
            }

            if let issue = store.actionIssue {
                Section {
                    Text(issue)
                        .font(.footnote)
                        .foregroundStyle(SideSeatTheme.danger)
                }
            }
        }
        .navigationTitle("Contact remark")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .confirmationAction) {
                Button("Save") {
                    Task {
                        let value = draft.trimmingCharacters(in: .whitespacesAndNewlines)
                        if await store.updateRemark(value.isEmpty ? nil : value, using: session) {
                            dismiss()
                        }
                    }
                }
                .disabled(store.isMutatingConnectionAction)
                .ssConfirmationActionStyle()
                .accessibilityIdentifier("direct-remark-save")
            }
        }
        .task {
            guard !hasPrepared else { return }
            draft = store.connectionActions?.remark ?? ""
            hasPrepared = true
        }
    }
}
