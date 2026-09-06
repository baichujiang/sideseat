import SwiftUI

struct NativeFeedbackAuthor: Decodable, Hashable, Sendable {
    let id: String
    let username: String
    let nickname: String?
    let avatarUrl: String?

    var displayName: String {
        let nick = nickname?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        return nick.isEmpty ? username : nick
    }
}

struct NativeFeedbackComment: Decodable, Identifiable, Hashable, Sendable {
    let id: String
    let body: String
    let isOfficial: Bool
    let createdAt: String
    let author: NativeFeedbackAuthor
}

struct NativeFeedbackPost: Decodable, Identifiable, Hashable, Sendable {
    let id: String
    let topic: String
    let title: String
    let message: String
    let createdAt: String
    let score: Int
    let commentCount: Int
    let up: Int?
    let down: Int?
    let myVote: String?
    let comments: [NativeFeedbackComment]?
    let author: NativeFeedbackAuthor

    var topicLabel: String {
        switch topic.lowercased() {
        case "bug": AppLocalization.string( "Bug")
        case "idea": AppLocalization.string( "Idea")
        default: AppLocalization.string( "Other")
        }
    }

    func applyingVote(_ value: String?) -> NativeFeedbackPost {
        var nextUp = up ?? 0
        var nextDown = down ?? 0
        if myVote == "UP" { nextUp = max(0, nextUp - 1) }
        if myVote == "DOWN" { nextDown = max(0, nextDown - 1) }
        if value == "UP" { nextUp += 1 }
        if value == "DOWN" { nextDown += 1 }
        return NativeFeedbackPost(
            id: id,
            topic: topic,
            title: title,
            message: message,
            createdAt: createdAt,
            score: nextUp - nextDown,
            commentCount: commentCount,
            up: nextUp,
            down: nextDown,
            myVote: value,
            comments: comments,
            author: author
        )
    }

    func appending(_ comment: NativeFeedbackComment) -> NativeFeedbackPost {
        var nextComments = comments ?? []
        if !nextComments.contains(where: { $0.id == comment.id }) {
            nextComments.append(comment)
        }
        return NativeFeedbackPost(
            id: id,
            topic: topic,
            title: title,
            message: message,
            createdAt: createdAt,
            score: score,
            commentCount: nextComments.count,
            up: up,
            down: down,
            myVote: myVote,
            comments: nextComments,
            author: author
        )
    }
}

struct NativeFeedbackListPayload: Decodable, Sendable {
    let posts: [NativeFeedbackPost]
}

struct NativeFeedbackDetailPayload: Decodable, Sendable {
    let post: NativeFeedbackPost
}

struct NativeFeedbackCreatePayload: Decodable, Sendable {
    let id: String
}

struct NativeFeedbackCommentPayload: Decodable, Sendable {
    let comment: NativeFeedbackComment
}

struct NativeFeedbackCreateRequest: Encodable, Sendable {
    let topic: String
    let title: String?
    let message: String
}

struct NativeFeedbackVoteRequest: Encodable, Sendable {
    let value: String?
}

struct NativeFeedbackCommentRequest: Encodable, Sendable {
    let body: String
}

@MainActor
@Observable
final class FeedbackStore {
    private(set) var posts: [NativeFeedbackPost] = []
    private(set) var detail: NativeFeedbackPost?
    private(set) var isLoading = false
    private(set) var hasLoaded = false
    private(set) var isMutating = false
    private(set) var issue: String?

    func clearIssue() {
        issue = nil
    }

    func insertCreated(_ post: NativeFeedbackPost) {
        posts.removeAll { $0.id == post.id }
        posts.insert(post, at: 0)
    }

    func load(using session: SessionStore) async {
        guard !isLoading else { return }
        isLoading = true
        issue = nil
        defer {
            isLoading = false
            hasLoaded = true
        }

        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("--ui-testing-authenticated") {
            if posts.isEmpty {
                posts = [NativeFeedbackPost(
                    id: "ui-feedback-1",
                    topic: "idea",
                    title: "Dark mode for calendar",
                    message: "Would love a darker calendar view for late-night planning.",
                    createdAt: "2026-07-17T12:00:00.000Z",
                    score: 3,
                    commentCount: 1,
                    up: 3,
                    down: 0,
                    myVote: nil,
                    comments: nil,
                    author: NativeFeedbackAuthor(
                        id: "ui-test-user",
                        username: "test_001",
                        nickname: "Test User",
                        avatarUrl: nil
                    )
                )]
            }
            return
        }
        #endif

        do {
            let response: APIEnvelope<NativeFeedbackListPayload> = try await session.sendAuthorized("api/v1/feedback")
            posts = response.data.posts
        } catch {
            issue = error.localizedDescription
        }
    }

    func loadDetail(id: String, using session: SessionStore) async {
        guard !isLoading else { return }
        isLoading = true
        issue = nil
        defer {
            isLoading = false
            hasLoaded = true
        }
        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("--ui-testing-authenticated") {
            detail = NativeFeedbackPost(
                id: id,
                topic: "idea",
                title: "Dark mode for calendar",
                message: "Would love a darker calendar view for late-night planning.",
                createdAt: "2026-07-17T12:00:00.000Z",
                score: 3,
                commentCount: 1,
                up: 3,
                down: 0,
                myVote: nil,
                comments: [
                    NativeFeedbackComment(
                        id: "ui-comment-1",
                        body: "Yes please.",
                        isOfficial: false,
                        createdAt: "2026-07-17T12:05:00.000Z",
                        author: NativeFeedbackAuthor(
                            id: "ui-peer",
                            username: "test_002",
                            nickname: "Mina",
                            avatarUrl: nil
                        )
                    )
                ],
                author: NativeFeedbackAuthor(
                    id: "ui-test-user",
                    username: "test_001",
                    nickname: "Test User",
                    avatarUrl: nil
                )
            )
            return
        }
        #endif
        do {
            let response: APIEnvelope<NativeFeedbackDetailPayload> = try await session.sendAuthorized(
                "api/v1/feedback/\(id)"
            )
            detail = response.data.post
        } catch {
            issue = error.localizedDescription
        }
    }

    func vote(id: String, value: String?, using session: SessionStore) async {
        guard !isMutating else { return }
        isMutating = true
        issue = nil
        defer { isMutating = false }

        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("--ui-testing-authenticated") {
            if let post = detail {
                detail = post.applyingVote(value)
            }
            return
        }
        #endif
        do {
            let response: APIEnvelope<NativeFeedbackDetailPayload> = try await session.sendAuthorized(
                "api/v1/feedback/\(id)/vote",
                method: .post,
                body: NativeFeedbackVoteRequest(value: value),
                idempotencyKey: UUID().uuidString
            )
            detail = response.data.post
        } catch {
            issue = error.localizedDescription
        }
    }

    func comment(id: String, body: String, using session: SessionStore) async -> Bool {
        guard !isMutating else { return false }
        isMutating = true
        issue = nil
        defer { isMutating = false }

        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("--ui-testing-authenticated") {
            if let post = detail {
                let user = session.currentUser
                detail = post.appending(
                    NativeFeedbackComment(
                        id: "ui-comment-\(UUID().uuidString)",
                        body: body,
                        isOfficial: false,
                        createdAt: Date().ISO8601Format(),
                        author: NativeFeedbackAuthor(
                            id: user?.id ?? "ui-test-user",
                            username: user?.username ?? "test_001",
                            nickname: user?.nickname,
                            avatarUrl: user?.avatarUrl
                        )
                    )
                )
            }
            return true
        }
        #endif
        do {
            let response: APIEnvelope<NativeFeedbackCommentPayload> = try await session.sendAuthorized(
                "api/v1/feedback/\(id)/comments",
                method: .post,
                body: NativeFeedbackCommentRequest(body: body),
                idempotencyKey: UUID().uuidString
            )
            if let post = detail {
                detail = post.appending(response.data.comment)
            }
            return true
        } catch {
            issue = error.localizedDescription
            return false
        }
    }
}

struct FeedbackRootView: View {
    @Environment(SessionStore.self) private var session
    @Environment(RouterPath.self) private var router
    @State private var store = FeedbackStore()
    @State private var showCompose = false

    var body: some View {
        Group {
            if (!store.hasLoaded || store.isLoading) && store.posts.isEmpty {
                SSLoadingState("Loading feedback")
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if let issue = store.issue, store.posts.isEmpty {
                ContentUnavailableView {
                    Label("Feedback unavailable", systemImage: "exclamationmark.bubble")
                } description: {
                    Text(issue)
                } actions: {
                    Button("Try again") { Task { await store.load(using: session) } }
                }
            } else if store.posts.isEmpty {
                SSEmptyState(
                    title: "No feedback yet",
                    systemImage: "bubble.left.and.bubble.right",
                    description: "Share a bug or idea to help improve SideSeat.",
                    actionTitle: AppLocalization.string( "Share feedback"),
                    actionAccessibilityID: "feedback-empty-compose"
                ) {
                    showCompose = true
                }
            } else {
                List(store.posts) { post in
                    Button {
                        router.navigate(to: .feedbackDetail(feedbackID: post.id))
                    } label: {
                        VStack(alignment: .leading, spacing: 6) {
                            Text(post.title)
                                .font(.body.weight(.semibold))
                                .foregroundStyle(.primary)
                            Text(post.message)
                                .font(.footnote)
                                .foregroundStyle(.secondary)
                                .lineLimit(3)
                            HStack(spacing: 12) {
                                Text(post.author.displayName)
                                    .font(.caption2.weight(.semibold))
                                    .foregroundStyle(.secondary)
                                Text(post.topicLabel)
                                    .font(.caption2)
                                    .foregroundStyle(.secondary)
                                Label("\(post.score)", systemImage: "arrow.up.arrow.down")
                                    .font(.caption2)
                                    .foregroundStyle(.secondary)
                                Label("\(post.commentCount)", systemImage: "bubble.left")
                                    .font(.caption2)
                                    .foregroundStyle(.secondary)
                            }
                        }
                        .padding(.vertical, 4)
                    }
                    .buttonStyle(SSPressButtonStyle())
                    .accessibilityIdentifier("feedback-row-\(post.id)")
                }
                .listStyle(.plain)
                .accessibilityIdentifier("feedback-list")
            }
        }
        .navigationTitle("Feedback")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button {
                    showCompose = true
                } label: {
                    Image(systemName: "square.and.pencil")
                }
                .accessibilityIdentifier("feedback-compose")
            }
        }
        .sheet(isPresented: $showCompose) {
            FeedbackComposeSheet { post in
                store.insertCreated(post)
                showCompose = false
                Task { await store.load(using: session) }
            }
        }
        .refreshable { await store.load(using: session) }
        .onAppear {
            Task { await store.load(using: session) }
        }
        .ssActionPrompt(
            isPresented: Binding(
                get: { store.issue != nil && !store.posts.isEmpty },
                set: { if !$0 { store.clearIssue() } }
            ),
            title: AppLocalization.string("Feedback could not be refreshed"),
            message: store.issue,
            systemImage: "arrow.clockwise.circle.fill",
            tint: SideSeatTheme.danger,
            dismissOnTapOutside: true,
            onDismiss: { store.clearIssue() },
            accessibilityIdentifier: "feedback-refresh-prompt"
        ) {
            [
                SSActionPromptAction(
                    id: "feedback-refresh-ok",
                    title: AppLocalization.string("OK")
                ) {
                    store.clearIssue()
                }
            ]
        }
        .accessibilityIdentifier("feedback-root")
    }
}

struct FeedbackDetailView: View {
    @Environment(SessionStore.self) private var session
    let feedbackID: String
    @State private var store = FeedbackStore()
    @State private var commentDraft = ""

    var body: some View {
        Group {
            if let post = store.detail {
                List {
                    Section {
                        HStack(spacing: 8) {
                            Text(post.author.displayName)
                                .font(.subheadline.weight(.semibold))
                            Text(post.topicLabel)
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                        Text(post.title)
                            .font(.title3.weight(.semibold))
                        Text(post.message)
                            .font(.body)
                        HStack(spacing: 10) {
                            Button {
                                let nextVote: String? = post.myVote == "UP" ? nil : "UP"
                                Task { await store.vote(id: post.id, value: nextVote, using: session) }
                            } label: {
                                Label("\(post.up ?? 0)", systemImage: post.myVote == "UP" ? "hand.thumbsup.fill" : "hand.thumbsup")
                            }
                            .buttonStyle(.bordered)
                            .tint(post.myVote == "UP" ? SideSeatTheme.accentText : SideSeatTheme.textSecondary)
                            .disabled(store.isMutating)
                            .accessibilityLabel(post.myVote == "UP" ? "Remove upvote" : "Upvote")
                            .accessibilityValue(post.myVote == "UP" ? "Selected" : "Not selected")
                            .accessibilityIdentifier("feedback-upvote")
                            Button {
                                let nextVote: String? = post.myVote == "DOWN" ? nil : "DOWN"
                                Task { await store.vote(id: post.id, value: nextVote, using: session) }
                            } label: {
                                Label("\(post.down ?? 0)", systemImage: post.myVote == "DOWN" ? "hand.thumbsdown.fill" : "hand.thumbsdown")
                            }
                            .buttonStyle(.bordered)
                            .tint(post.myVote == "DOWN" ? SideSeatTheme.accentText : SideSeatTheme.textSecondary)
                            .disabled(store.isMutating)
                            .accessibilityLabel(post.myVote == "DOWN" ? "Remove downvote" : "Downvote")
                            .accessibilityValue(post.myVote == "DOWN" ? "Selected" : "Not selected")
                            .accessibilityIdentifier("feedback-downvote")
                            if store.isMutating {
                                ProgressView()
                                    .controlSize(.small)
                            }
                        }
                        Text("Score \(post.score) · \(post.commentCount) comments")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }

                    Section("Comments") {
                        if (post.comments ?? []).isEmpty {
                            Text("No comments yet")
                                .font(.footnote)
                                .foregroundStyle(.secondary)
                        }
                        ForEach(post.comments ?? []) { comment in
                            VStack(alignment: .leading, spacing: 4) {
                                HStack {
                                    Text(comment.author.displayName)
                                        .font(.caption.weight(.semibold))
                                        .foregroundStyle(.primary)
                                    if comment.isOfficial {
                                        Text("Official")
                                            .font(.caption2.weight(.bold))
                                            .foregroundStyle(.primary)
                                            .padding(.horizontal, 7)
                                            .padding(.vertical, 3)
                                            .background(SideSeatTheme.HubTint.feedback.opacity(0.14), in: Capsule())
                                    }
                                }
                                Text(comment.body)
                                    .font(.footnote)
                            }
                            .accessibilityIdentifier("feedback-comment-\(comment.id)")
                        }
                    }

                    Section("Add comment") {
                        TextField("Write a comment", text: $commentDraft, axis: .vertical)
                            .lineLimit(2...5)
                            .accessibilityIdentifier("feedback-comment-field")
                        Button("Post comment") {
                            Task {
                                let body = commentDraft.trimmingCharacters(in: .whitespacesAndNewlines)
                                if await store.comment(id: post.id, body: body, using: session) {
                                    commentDraft = ""
                                }
                            }
                        }
                        .ssConfirmationActionStyle()
                        .disabled(
                            commentDraft.trimmingCharacters(in: .whitespacesAndNewlines).count < 2 ||
                            store.isMutating
                        )
                        .accessibilityIdentifier("feedback-comment-submit")
                    }
                }
            } else if store.issue != nil {
                ContentUnavailableView("Feedback unavailable", systemImage: "exclamationmark.bubble")
            } else {
                ProgressView()
            }
        }
        .navigationTitle("Feedback")
        .navigationBarTitleDisplayMode(.inline)
        .task { await store.loadDetail(id: feedbackID, using: session) }
        .ssActionPrompt(
            isPresented: Binding(
                get: { store.issue != nil && store.detail != nil },
                set: { if !$0 { store.clearIssue() } }
            ),
            title: AppLocalization.string("Action failed"),
            message: store.issue,
            systemImage: "exclamationmark.triangle.fill",
            tint: SideSeatTheme.danger,
            dismissOnTapOutside: true,
            onDismiss: { store.clearIssue() },
            accessibilityIdentifier: "feedback-action-failed-prompt"
        ) {
            [
                SSActionPromptAction(
                    id: "feedback-action-failed-ok",
                    title: AppLocalization.string("OK")
                ) {
                    store.clearIssue()
                }
            ]
        }
        .accessibilityIdentifier("feedback-detail")
    }
}

private struct FeedbackComposeSheet: View {
    @Environment(SessionStore.self) private var session
    @Environment(\.dismiss) private var dismiss

    let onSubmitted: (NativeFeedbackPost) -> Void

    @State private var topic = "idea"
    @State private var title = ""
    @State private var message = ""
    @State private var isSubmitting = false
    @State private var issue: String?

    var body: some View {
        NavigationStack {
            Form {
                Section("Topic") {
                    Picker("Topic", selection: $topic) {
                        Text("Idea").tag("idea")
                        Text("Bug").tag("bug")
                        Text("Other").tag("other")
                    }
                    .accessibilityIdentifier("feedback-topic")
                }
                Section("Details") {
                    TextField("Title (optional)", text: $title)
                        .accessibilityIdentifier("feedback-title")
                    TextField("Message", text: $message, axis: .vertical)
                        .lineLimit(4...8)
                        .accessibilityIdentifier("feedback-message")
                }
                if let issue {
                    Section {
                        Text(issue)
                            .font(.footnote)
                            .foregroundStyle(SideSeatTheme.danger)
                    }
                }
            }
            .navigationTitle("New feedback")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Send") {
                        Task { await submit() }
                    }
                    .disabled(message.trimmingCharacters(in: .whitespacesAndNewlines).count < 10 || isSubmitting)
                    .ssConfirmationActionStyle()
                    .accessibilityIdentifier("feedback-submit")
                }
            }
            .accessibilityIdentifier("feedback-compose-sheet")
        }
    }

    private func submit() async {
        isSubmitting = true
        issue = nil
        defer { isSubmitting = false }

        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("--ui-testing-authenticated") {
            onSubmitted(submittedPost(id: "ui-feedback-created-\(UUID().uuidString)"))
            dismiss()
            return
        }
        #endif

        do {
            let trimmedTitle = title.trimmingCharacters(in: .whitespacesAndNewlines)
            let body = NativeFeedbackCreateRequest(
                topic: topic,
                title: trimmedTitle.count >= 3 ? trimmedTitle : nil,
                message: message.trimmingCharacters(in: .whitespacesAndNewlines)
            )
            let response: APIEnvelope<NativeFeedbackCreatePayload> = try await session.sendAuthorized(
                "api/v1/feedback",
                method: .post,
                body: body,
                idempotencyKey: UUID().uuidString
            )
            onSubmitted(submittedPost(id: response.data.id))
            dismiss()
        } catch {
            issue = error.localizedDescription
        }
    }

    private func submittedPost(id: String) -> NativeFeedbackPost {
        let trimmedTitle = title.trimmingCharacters(in: .whitespacesAndNewlines)
        let trimmedMessage = message.trimmingCharacters(in: .whitespacesAndNewlines)
        let fallbackTitle = String(trimmedMessage.split(separator: "\n").first?.prefix(80) ?? "Feedback")
        let user = session.currentUser
        return NativeFeedbackPost(
            id: id,
            topic: topic,
            title: trimmedTitle.count >= 3 ? trimmedTitle : fallbackTitle,
            message: trimmedMessage,
            createdAt: Date().ISO8601Format(),
            score: 0,
            commentCount: 0,
            up: 0,
            down: 0,
            myVote: nil,
            comments: [],
            author: NativeFeedbackAuthor(
                id: user?.id ?? "current-user",
                username: user?.username ?? "user",
                nickname: user?.nickname,
                avatarUrl: user?.avatarUrl
            )
        )
    }
}
