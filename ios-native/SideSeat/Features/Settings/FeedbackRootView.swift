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
    private(set) var issue: String?

    func load(using session: SessionStore) async {
        isLoading = true
        issue = nil
        defer { isLoading = false }

        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("--ui-testing-authenticated") {
            posts = [
                NativeFeedbackPost(
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
                    comments: nil
                )
            ]
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
        issue = nil
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
                myVote: "UP",
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
                ]
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
        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("--ui-testing-authenticated") {
            if let post = detail {
                detail = NativeFeedbackPost(
                    id: post.id,
                    topic: post.topic,
                    title: post.title,
                    message: post.message,
                    createdAt: post.createdAt,
                    score: value == "UP" ? 4 : post.score,
                    commentCount: post.commentCount,
                    up: value == "UP" ? 4 : post.up,
                    down: post.down,
                    myVote: value,
                    comments: post.comments
                )
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
            await load(using: session)
        } catch {
            issue = error.localizedDescription
        }
    }

    func comment(id: String, body: String, using session: SessionStore) async -> Bool {
        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("--ui-testing-authenticated") {
            await loadDetail(id: id, using: session)
            return true
        }
        #endif
        do {
            let _: APIEnvelope<NativeFeedbackCommentPayload> = try await session.sendAuthorized(
                "api/v1/feedback/\(id)/comments",
                method: .post,
                body: NativeFeedbackCommentRequest(body: body),
                idempotencyKey: UUID().uuidString
            )
            await loadDetail(id: id, using: session)
            await load(using: session)
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
            if store.isLoading && store.posts.isEmpty {
                ProgressView("Loading feedback")
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
                    actionTitle: String(localized: "Share feedback"),
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
                                Text(post.topic.uppercased())
                                    .font(.caption2.weight(.semibold))
                                    .foregroundStyle(.secondary)
                                Text("Score \(post.score)")
                                    .font(.caption2)
                                    .foregroundStyle(.secondary)
                                Text("\(post.commentCount) comments")
                                    .font(.caption2)
                                    .foregroundStyle(.secondary)
                            }
                        }
                        .padding(.vertical, 4)
                    }
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
            FeedbackComposeSheet {
                showCompose = false
                Task { await store.load(using: session) }
            }
        }
        .refreshable { await store.load(using: session) }
        .task { await store.load(using: session) }
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
                        Text(post.title)
                            .font(.title3.weight(.semibold))
                        Text(post.message)
                            .font(.body)
                        HStack {
                            Button("Upvote") {
                                Task { await store.vote(id: post.id, value: "UP", using: session) }
                            }
                            .buttonStyle(.borderedProminent)
                            .accessibilityIdentifier("feedback-upvote")
                            Button("Downvote") {
                                Task { await store.vote(id: post.id, value: "DOWN", using: session) }
                            }
                            .buttonStyle(.bordered)
                            .accessibilityIdentifier("feedback-downvote")
                            if post.myVote != nil {
                                Button("Clear") {
                                    Task { await store.vote(id: post.id, value: nil, using: session) }
                                }
                                .buttonStyle(.bordered)
                            }
                        }
                        Text("Score \(post.score) · \(post.commentCount) comments")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }

                    Section("Comments") {
                        ForEach(post.comments ?? []) { comment in
                            VStack(alignment: .leading, spacing: 4) {
                                HStack {
                                    Text(comment.author.displayName)
                                        .font(.caption.weight(.semibold))
                                    if comment.isOfficial {
                                        Text("Official")
                                            .font(.caption2.weight(.bold))
                                            .foregroundStyle(.tint)
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
                        .disabled(commentDraft.trimmingCharacters(in: .whitespacesAndNewlines).count < 2)
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
        .accessibilityIdentifier("feedback-detail")
    }
}

private struct FeedbackComposeSheet: View {
    @Environment(SessionStore.self) private var session
    @Environment(\.dismiss) private var dismiss

    let onSubmitted: () -> Void

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
            onSubmitted()
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
            let _: APIEnvelope<NativeFeedbackCreatePayload> = try await session.sendAuthorized(
                "api/v1/feedback",
                method: .post,
                body: body,
                idempotencyKey: UUID().uuidString
            )
            onSubmitted()
            dismiss()
        } catch {
            issue = error.localizedDescription
        }
    }
}
