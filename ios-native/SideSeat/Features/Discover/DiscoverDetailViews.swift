import SwiftUI

struct DiscoverBuddyDetailView: View {
    @Environment(SessionStore.self) private var session
    @Environment(RouterPath.self) private var router
    let postID: String
    @State private var store = DiscoverPostDetailStore()
    @State private var openConversation = OpenConversationStore()
    @State private var sharePost: NativeDiscoverBuddyPost?
    @State private var editingPost: NativeDiscoverBuddyPost?
    @State private var reportPost: NativeDiscoverBuddyPost?
    @State private var questionDraft = ""
    @State private var replyDraft = ""
    @State private var replyTargetID: String?
    @State private var reportComment: DiscoverQuestionReportTarget?
    @State private var deleteComment: DiscoverQuestionDeleteTarget?
    @State private var showsDeleteConfirmation = false
    @State private var showsCloseConfirmation = false
    @State private var showsAllQuestions = false
    @State private var showsDiscussion = false

    var body: some View {
        Group {
            if let detail = store.detail {
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 0) {
                        media(detail.post)
                        planSummary(detail.post)
                        Divider()
                            .padding(.horizontal, SideSeatTheme.screenHorizontal)
                        planDetails(detail.post)
                        Divider()
                            .padding(.horizontal, SideSeatTheme.screenHorizontal)
                        questions(detail)
                        if let issue = store.issue {
                            Text(issue)
                                .font(.footnote)
                                .foregroundStyle(SideSeatTheme.danger)
                                .padding(.horizontal, SideSeatTheme.screenHorizontal)
                                .padding(.bottom, SideSeatTheme.spaceMD)
                        }
                        if let issue = openConversation.issue {
                            Text(issue)
                                .font(.footnote)
                                .foregroundStyle(SideSeatTheme.danger)
                                .padding(.horizontal, SideSeatTheme.screenHorizontal)
                                .padding(.bottom, SideSeatTheme.spaceMD)
                        }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
                .background(SideSeatTheme.bg)
                .accessibilityIdentifier("discover-post-detail")
                .safeAreaInset(edge: .bottom, spacing: 0) {
                    actionBar(detail)
                }
                .toolbar {
                    ToolbarItem(placement: .principal) {
                        compactHostTitle(detail.post.author)
                    }
                    ToolbarItem(placement: .topBarTrailing) {
                        Menu {
                            Button {
                                sharePost = detail.post
                            } label: {
                                Label("Share plan", systemImage: "square.and.arrow.up")
                            }
                            if canEdit(detail.post) {
                                Button {
                                    editingPost = detail.post
                                } label: {
                                    Label("Edit plan", systemImage: "pencil")
                                }
                                .accessibilityIdentifier("discover-plan-edit")

                                Button {
                                    showsCloseConfirmation = true
                                } label: {
                                    Label("Close plan", systemImage: "lock")
                                }
                                .disabled(store.isMutating)
                            }
                            if !detail.post.isOwn {
                                Button(role: .destructive) {
                                    reportPost = detail.post
                                } label: {
                                    Label("Report post", systemImage: "flag")
                                }
                            }
                        } label: {
                            Image(systemName: "ellipsis.circle")
                        }
                        .accessibilityLabel("Plan actions")
                        .accessibilityIdentifier("discover-plan-actions")
                    }
                }
                .sheet(item: $sharePost) { post in
                    DiscoverPlanSharePreview(post: post)
                }
                .sheet(item: $editingPost) { post in
                    NavigationStack {
                        DiscoverPlanCreateView(editingPost: post) { _ in
                            editingPost = nil
                            await load()
                        }
                    }
                    .presentationDetents([.large])
                    .presentationDragIndicator(.visible)
                    .presentationCornerRadius(SideSeatTheme.cardRadius)
                    .presentationBackground(SideSeatTheme.bgGrouped)
                }
                .sheet(item: $reportPost) { post in
                    ChatReportSheet(title: String(localized: "Report post")) { reason, details in
                        await store.reportPost(post, reason: reason, details: details, using: session)
                    }
                }
                .sheet(item: $reportComment) { comment in
                    ChatReportSheet(title: String(localized: "Report message")) { reason, details in
                        await store.reportQuestionComment(
                            commentID: comment.id,
                            authorID: comment.authorID,
                            isOwn: comment.isOwn,
                            reason: reason,
                            details: details,
                            using: session
                        )
                    }
                }
                .sheet(isPresented: $showsDiscussion) {
                    DiscoverDiscussionView(
                        total: store.questionTotal,
                        comments: store.questions,
                        canComment: !detail.post.isOwn && BuddyPostDisplay.status(detail.post).isOpen,
                        closedMessage: String(localized: "Comments are closed for this plan."),
                        isLoading: store.isLoadingQuestions,
                        isMutating: store.isMutatingQuestion,
                        issue: store.questionIssue,
                        onRefresh: {
                            await store.loadQuestions(postID: postID, using: session)
                        },
                        onSubmit: { body in
                            await store.submitQuestion(body: body, postID: postID, using: session)
                        },
                        onReply: { commentID, body in
                            await store.submitQuestion(
                                body: body,
                                parentID: commentID,
                                postID: postID,
                                using: session
                            )
                        },
                        onDelete: { commentID in
                            await store.deleteQuestionComment(
                                commentID: commentID,
                                postID: postID,
                                using: session
                            )
                        },
                        onReport: { target, reason, details in
                            await store.reportQuestionComment(
                                commentID: target.id,
                                authorID: target.authorID,
                                isOwn: target.isOwn,
                                reason: reason,
                                details: details,
                                using: session
                            )
                        }
                    )
                    .presentationDetents([.large])
                    .presentationDragIndicator(.visible)
                }
                .confirmationDialog(
                    "Close this plan?",
                    isPresented: $showsCloseConfirmation,
                    titleVisibility: .visible
                ) {
                    Button("Close plan", role: .destructive) {
                        Task { _ = await store.closePost(postID: postID, using: session) }
                    }
                    Button("Cancel", role: .cancel) {}
                } message: {
                    Text("This plan will move to Past and stop accepting responses.")
                }
                .confirmationDialog(
                    deleteConfirmationTitle,
                    isPresented: $showsDeleteConfirmation,
                    titleVisibility: .visible
                ) {
                    Button("Delete", role: .destructive) {
                        guard let deleteComment else { return }
                        Task {
                            await store.deleteQuestionComment(
                                commentID: deleteComment.id,
                                postID: postID,
                                using: session
                            )
                            self.deleteComment = nil
                        }
                    }
                    Button("Cancel", role: .cancel) {
                        deleteComment = nil
                    }
                }
            } else if let issue = store.issue {
                ContentUnavailableView {
                    Label("Plan unavailable", systemImage: "person.crop.circle.badge.exclamationmark")
                } description: {
                    Text(issue)
                } actions: {
                    Button("Try again") { Task { await load() } }
                }
            } else {
                SSLoadingState("Loading plan")
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        }
        .navigationTitle("Plan")
        .navigationBarTitleDisplayMode(.inline)
        .toolbarBackground(.visible, for: .navigationBar)
        .task { await load() }
        .onReceive(NotificationCenter.default.publisher(for: .sideSeatDiscoverNeedsRefresh)) { _ in
            Task { await store.loadQuestions(postID: postID, using: session) }
        }
    }

    @ViewBuilder
    private func media(_ post: NativeDiscoverBuddyPost) -> some View {
        if !post.imageUrls.isEmpty {
            TabView {
                ForEach(post.imageUrls, id: \.self) { imageURL in
                    AsyncImage(url: URL(string: imageURL)) { phase in
                        switch phase {
                        case .success(let image):
                            image
                                .resizable()
                                .scaledToFill()
                        case .failure:
                            imagePlaceholder
                        default:
                            ZStack {
                                SideSeatTheme.fillSubtle
                                ProgressView()
                            }
                        }
                    }
                    .frame(maxWidth: .infinity)
                    .frame(height: 240)
                    .clipped()
                }
            }
            .frame(height: 240)
            .tabViewStyle(.page(indexDisplayMode: post.imageUrls.count > 1 ? .automatic : .never))
            .accessibilityIdentifier("discover-plan-media")
        }
    }

    private var imagePlaceholder: some View {
        ZStack {
            SideSeatTheme.fillSubtle
            Image(systemName: "photo")
                .font(.title2)
                .foregroundStyle(.secondary)
        }
    }

    private func planSummary(_ post: NativeDiscoverBuddyPost) -> some View {
        let status = BuddyPostDisplay.status(post)

        return VStack(alignment: .leading, spacing: SideSeatTheme.spaceMD) {
            HStack(spacing: SideSeatTheme.spaceSM) {
                DiscoverStatusBadge(status: status)

                Spacer(minLength: 0)

                Text(post.city)
                    .font(.caption.weight(.medium))
                    .foregroundStyle(.secondary)
            }

            VStack(alignment: .leading, spacing: SideSeatTheme.spaceSM) {
                Text(post.title)
                    .font(.title2.weight(.bold))
                    .fixedSize(horizontal: false, vertical: true)

                if let body = post.body, !body.isEmpty {
                    Text(body)
                        .font(.body)
                        .foregroundStyle(SideSeatTheme.textPrimary)
                        .fixedSize(horizontal: false, vertical: true)
                }
                if !post.tags.isEmpty {
                    BuddyPostTagChips(tags: post.tags)
                }
            }
        }
        .padding(.horizontal, SideSeatTheme.screenHorizontal)
        .padding(.vertical, SideSeatTheme.spaceLG)
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func planDetails(_ post: NativeDiscoverBuddyPost) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("Plan details")
                .font(.headline)
                .padding(.bottom, SideSeatTheme.spaceSM)

            VStack(alignment: .leading, spacing: 0) {
                DiscoverPlanDetailRow(systemImage: "calendar", title: "When", value: scheduleLabel(post))
                DiscoverPlanDetailRow(systemImage: "mappin.and.ellipse", title: "Where", value: locationLabel(post))
                DiscoverPlanDetailRow(
                    systemImage: "person.2",
                    title: "Group",
                    value: groupLabel(post),
                    accessibilityID: "discover-plan-group"
                )
                DiscoverPlanDetailRow(
                    systemImage: BuddyPostDisplay.visibilitySystemImage(post.visibility),
                    title: "Who can see this",
                    value: BuddyPostDisplay.visibilityLabel(post.visibility)
                )
                ForEach(post.linkedCourses) { course in
                    DiscoverPlanDetailRow(
                        systemImage: "book",
                        title: "Course",
                        value: course.code ?? course.name
                    )
                }
            }
            .padding(.horizontal, SideSeatTheme.spaceMD)
            .padding(.vertical, SideSeatTheme.spaceXS)
            .background(
                SideSeatTheme.fillSubtle,
                in: RoundedRectangle(cornerRadius: SideSeatTheme.controlRadius, style: .continuous)
            )

            if BuddyPostDisplay.status(post).isOpen, let expiry = post.expiryDate {
                Label(
                    "Plan closes \(expiry.formatted(date: .abbreviated, time: .shortened))",
                    systemImage: "clock"
                )
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .padding(.top, SideSeatTheme.spaceSM)
            }
        }
        .padding(.horizontal, SideSeatTheme.screenHorizontal)
        .padding(.vertical, SideSeatTheme.spaceXL)
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func compactHostTitle(_ author: NativeDiscoverBuddyAuthor) -> some View {
        Button {
            router.navigate(to: .profile(userID: author.id))
        } label: {
            HStack(spacing: 7) {
                InitialAvatar(name: author.displayName, url: author.avatarUrl, size: 28)
                VStack(alignment: .leading, spacing: 0) {
                    HStack(spacing: 4) {
                        Text(author.displayName)
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(.primary)
                            .lineLimit(1)
                        if author.verifiedStudent {
                            Image(systemName: "checkmark.seal.fill")
                                .font(.caption2)
                                .foregroundStyle(SideSeatTheme.verifiedSeal)
                                .accessibilityLabel("Verified student")
                                .accessibilityIdentifier("discover-plan-verified-host")
                        }
                    }

                    Text(author.school ?? author.studentRoleLabel ?? String(localized: "International student"))
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }
            }
            .frame(maxWidth: 190)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier("discover-plan-host")
    }

    private func questions(_ detail: NativeDiscoverBuddyPostDetail) -> some View {
        let preview = Array(store.questions.prefix(2))

        return VStack(alignment: .leading, spacing: SideSeatTheme.spaceLG) {
            Button {
                showsDiscussion = true
            } label: {
                VStack(alignment: .leading, spacing: SideSeatTheme.spaceLG) {
                    HStack(alignment: .firstTextBaseline) {
                        Text("Comments")
                            .font(.headline)
                            .foregroundStyle(SideSeatTheme.textPrimary)
                        if store.questionTotal > 0 {
                            Text("\(store.questionTotal)")
                                .font(.caption.weight(.semibold))
                                .foregroundStyle(.secondary)
                        }
                        Spacer(minLength: 0)
                        Text(store.questionTotal == 0 ? "Add comment" : "View all")
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(SideSeatTheme.accent)
                        Image(systemName: "chevron.right")
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(.tertiary)
                    }

                    if store.isLoadingQuestions, store.questions.isEmpty {
                        ProgressView("Loading comments")
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                            .frame(maxWidth: .infinity, alignment: .center)
                            .padding(.vertical, SideSeatTheme.spaceLG)
                    } else if store.questions.isEmpty {
                        Label(
                            detail.post.isOwn
                                ? String(localized: "Comments from interested people will appear here.")
                                : String(localized: "Start the conversation about this plan."),
                            systemImage: "text.bubble"
                        )
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.vertical, SideSeatTheme.spaceSM)
                    } else {
                        VStack(alignment: .leading, spacing: 0) {
                            ForEach(Array(preview.enumerated()), id: \.element.id) { index, comment in
                                DiscoverCommentPreviewRow(comment: comment)
                                if index < preview.count - 1 {
                                    Divider()
                                        .padding(.leading, 46)
                                }
                            }
                        }
                    }
                }
            }
            .buttonStyle(.plain)
            .accessibilityIdentifier("discover-comments-open")

            if let issue = store.questionIssue {
                Text(issue)
                    .font(.footnote)
                    .foregroundStyle(SideSeatTheme.danger)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .padding(.horizontal, SideSeatTheme.screenHorizontal)
        .padding(.vertical, SideSeatTheme.spaceXL)
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func questionRow(_ question: NativeDiscoverPostQuestion) -> some View {
        VStack(alignment: .leading, spacing: SideSeatTheme.spaceMD) {
            questionComment(
                id: question.id,
                body: question.body,
                createdDate: question.createdDate,
                isOwn: question.isOwn,
                canDelete: question.canDelete,
                author: question.author,
                kind: String(localized: "message")
            )

            if let reply = question.reply {
                HStack(alignment: .top, spacing: SideSeatTheme.spaceMD) {
                    RoundedRectangle(cornerRadius: 1)
                        .fill(SideSeatTheme.accent.opacity(0.35))
                        .frame(width: 3)
                    VStack(alignment: .leading, spacing: SideSeatTheme.spaceSM) {
                        HStack(spacing: SideSeatTheme.spaceXS) {
                            Image(systemName: "person.crop.circle.badge.checkmark")
                                .foregroundStyle(SideSeatTheme.accent)
                            Text("Organizer reply")
                                .foregroundStyle(SideSeatTheme.textPrimary)
                        }
                            .font(.caption.weight(.semibold))
                        questionComment(
                            id: reply.id,
                            body: reply.body,
                            createdDate: reply.createdDate,
                            isOwn: reply.isOwn,
                            canDelete: reply.canDelete,
                            author: reply.author,
                            kind: String(localized: "reply"),
                            compactAvatar: true
                        )
                    }
                }
                .padding(.leading, 46)
            } else if question.canReply {
                if replyTargetID == question.id {
                    HStack(alignment: .bottom, spacing: SideSeatTheme.spaceSM) {
                        TextField("Write a public reply", text: $replyDraft, axis: .vertical)
                            .lineLimit(1...4)
                            .textFieldStyle(.plain)
                            .padding(.horizontal, SideSeatTheme.spaceMD)
                            .padding(.vertical, 10)
                            .background(
                                SideSeatTheme.fillTertiary,
                                in: RoundedRectangle(cornerRadius: SideSeatTheme.controlRadius, style: .continuous)
                            )
                            .onChange(of: replyDraft) { _, value in
                                if value.count > 500 { replyDraft = String(value.prefix(500)) }
                            }
                        Button("Post") { submitReply(to: question.id) }
                            .buttonStyle(.borderedProminent)
                            .disabled(
                                replyDraft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                                    || store.isMutatingQuestion
                            )
                    }
                    .padding(.leading, 46)
                } else {
                    Button {
                        replyDraft = ""
                        replyTargetID = question.id
                    } label: {
                        Label("Reply publicly", systemImage: "arrowshape.turn.up.left")
                            .font(.footnote.weight(.semibold))
                    }
                    .padding(.leading, 46)
                }
            }
        }
        .padding(.vertical, SideSeatTheme.spaceMD)
    }

    private func questionComment(
        id: String,
        body: String,
        createdDate: Date?,
        isOwn: Bool,
        canDelete: Bool,
        author: NativeDiscoverQuestionAuthor,
        kind: String,
        compactAvatar: Bool = false
    ) -> some View {
        HStack(alignment: .top, spacing: SideSeatTheme.spaceMD) {
            InitialAvatar(name: author.displayName, url: author.avatarUrl, size: compactAvatar ? 28 : 34)

            VStack(alignment: .leading, spacing: 5) {
                HStack(spacing: SideSeatTheme.spaceXS) {
                    Text(author.displayName)
                        .font(.subheadline.weight(.semibold))
                        .lineLimit(1)
                    if let school = author.school, !school.isEmpty {
                        Text(school)
                            .font(.caption2.weight(.medium))
                            .foregroundStyle(.secondary)
                            .lineLimit(1)
                    }
                    if author.verifiedStudent {
                        Image(systemName: "checkmark.seal.fill")
                            .font(.caption)
                            .foregroundStyle(SideSeatTheme.verifiedSeal)
                            .accessibilityLabel("Verified student")
                    }
                    Spacer(minLength: 0)
                    questionActions(
                        id: id,
                        authorID: author.id,
                        isOwn: isOwn,
                        canDelete: canDelete,
                        kind: kind
                    )
                }

                Text(body)
                    .font(.subheadline)
                    .foregroundStyle(SideSeatTheme.textPrimary)
                    .fixedSize(horizontal: false, vertical: true)

                if let createdDate {
                    Text(createdDate.formatted(.relative(presentation: .numeric)))
                        .font(.caption2)
                        .foregroundStyle(.tertiary)
                }
            }
        }
    }

    @ViewBuilder
    private func questionActions(
        id: String,
        authorID: String,
        isOwn: Bool,
        canDelete: Bool,
        kind: String
    ) -> some View {
        if canDelete || !isOwn {
            Menu {
                if canDelete {
                    Button(role: .destructive) {
                        deleteComment = DiscoverQuestionDeleteTarget(id: id, kind: kind)
                        showsDeleteConfirmation = true
                    } label: {
                        Label("Delete", systemImage: "trash")
                    }
                }
                if !isOwn {
                    Button(role: .destructive) {
                        reportComment = DiscoverQuestionReportTarget(
                            id: id,
                            authorID: authorID,
                            isOwn: isOwn
                        )
                    } label: {
                        Label("Report", systemImage: "flag")
                    }
                }
            } label: {
                Image(systemName: "ellipsis")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.secondary)
                    .frame(width: 32, height: 28)
            }
            .accessibilityLabel("Message actions")
        }
    }

    private func submitQuestion() {
        let body = questionDraft
        Task {
            if await store.submitQuestion(body: body, postID: postID, using: session) {
                questionDraft = ""
            }
        }
    }

    private var deleteConfirmationTitle: String {
        let kind = deleteComment?.kind ?? String(localized: "comment")
        return String(format: String(localized: "Delete this %@?"), kind)
    }

    private func submitReply(to questionID: String) {
        let body = replyDraft
        Task {
            if await store.submitQuestion(
                body: body,
                parentID: questionID,
                postID: postID,
                using: session
            ) {
                replyDraft = ""
                replyTargetID = nil
            }
        }
    }

    @ViewBuilder
    private func actionBar(_ detail: NativeDiscoverBuddyPostDetail) -> some View {
        VStack(spacing: 0) {
            Divider()
            HStack(spacing: SideSeatTheme.spaceMD) {
                if detail.viewerCanMessage, !detail.post.isOwn {
                    Button {
                        toggleSaved(detail.post)
                    } label: {
                        Image(systemName: detail.post.savedByViewer ? "bookmark.fill" : "bookmark")
                            .font(.body.weight(.semibold))
                            .frame(width: 46, height: 46)
                            .background(
                                SideSeatTheme.fillTertiary,
                                in: RoundedRectangle(cornerRadius: SideSeatTheme.controlRadius, style: .continuous)
                            )
                    }
                    .disabled(store.isMutating)
                    .accessibilityLabel(detail.post.savedByViewer ? "Saved" : "Save")
                    .accessibilityIdentifier("discover-post-save")

                    Button {
                        Task { await openChat(peerID: detail.post.author.id) }
                    } label: {
                        HStack(spacing: SideSeatTheme.spaceSM) {
                            if openConversation.isOpening {
                                ProgressView()
                                    .tint(.white)
                            } else {
                                Image(systemName: "message.fill")
                                Text("Message \(detail.post.author.displayName)")
                                    .lineLimit(1)
                            }
                        }
                        .font(.body.weight(.semibold))
                        .foregroundStyle(.white)
                        .frame(maxWidth: .infinity)
                        .frame(height: 46)
                        .background(
                            SideSeatTheme.accent,
                            in: RoundedRectangle(cornerRadius: SideSeatTheme.controlRadius, style: .continuous)
                        )
                    }
                    .disabled(openConversation.isOpening)
                    .accessibilityIdentifier("discover-post-message")
                } else if !detail.post.isOwn {
                    Button {
                        toggleSaved(detail.post)
                    } label: {
                        HStack(spacing: SideSeatTheme.spaceSM) {
                            if store.isMutating {
                                ProgressView()
                                    .tint(.white)
                            } else {
                                Image(systemName: detail.post.savedByViewer ? "checkmark" : "hand.raised.fill")
                                Text(detail.post.savedByViewer ? "Interest sent" : "I'm interested")
                            }
                        }
                        .font(.body.weight(.semibold))
                        .foregroundStyle(.white)
                        .frame(maxWidth: .infinity)
                        .frame(height: 46)
                        .background(
                            SideSeatTheme.accent,
                            in: RoundedRectangle(cornerRadius: SideSeatTheme.controlRadius, style: .continuous)
                        )
                    }
                    .disabled(store.isMutating)
                    .accessibilityIdentifier("discover-post-save")
                } else {
                    Button {
                        editingPost = detail.post
                    } label: {
                        Label("Edit plan", systemImage: "pencil")
                            .font(.body.weight(.semibold))
                            .foregroundStyle(.white)
                            .frame(maxWidth: .infinity)
                            .frame(height: 46)
                            .background(
                                SideSeatTheme.accent,
                                in: RoundedRectangle(cornerRadius: SideSeatTheme.controlRadius, style: .continuous)
                            )
                    }
                    .disabled(store.isMutating || !canEdit(detail.post))
                    .accessibilityIdentifier("discover-post-edit-primary")
                }

                Button {
                    sharePost = detail.post
                } label: {
                    Image(systemName: "square.and.arrow.up")
                        .font(.body.weight(.semibold))
                        .frame(width: 46, height: 46)
                        .background(
                            SideSeatTheme.fillTertiary,
                            in: RoundedRectangle(cornerRadius: SideSeatTheme.controlRadius, style: .continuous)
                        )
                }
                .accessibilityLabel("Share plan")
                .accessibilityIdentifier("discover-plan-share")
            }
            .padding(.horizontal, SideSeatTheme.spaceLG)
            .padding(.top, SideSeatTheme.spaceMD)
            .padding(.bottom, SideSeatTheme.spaceSM)
        }
        .background(.regularMaterial)
    }

    private func toggleSaved(_ post: NativeDiscoverBuddyPost) {
        Task {
            await store.setSaved(
                !post.savedByViewer,
                postID: postID,
                using: session
            )
        }
    }

    private func scheduleLabel(_ post: NativeDiscoverBuddyPost) -> String {
        guard let start = post.startDate else {
            return String(localized: "Time to be decided")
        }
        let startLabel = start.formatted(date: .abbreviated, time: .shortened)
        guard let end = post.endDate else { return startLabel }
        return "\(startLabel) - \(end.formatted(date: .omitted, time: .shortened))"
    }

    private func locationLabel(_ post: NativeDiscoverBuddyPost) -> String {
        guard let location = post.location, !location.isEmpty else {
            return String(localized: "Place to be decided")
        }
        return "\(location), \(post.city)"
    }

    private func groupLabel(_ post: NativeDiscoverBuddyPost) -> String {
        if let capacity = post.capacity {
            return String(localized: "\(post.interestedCount) interested, up to \(capacity) people")
        }
        return String(localized: "\(post.interestedCount) interested")
    }

    private func load() async {
        await store.load(postID: postID, using: session)
    }

    private func canEdit(_ post: NativeDiscoverBuddyPost) -> Bool {
        post.isOwn && BuddyPostDisplay.status(post).isOpen
    }

    private func openChat(peerID: String) async {
        guard let connectionID = await openConversation.open(
            peerID: peerID,
            postID: postID,
            using: session
        ) else {
            return
        }
        router.navigate(to: .directChat(connectionID: connectionID))
    }

}

private struct DiscoverQuestionReportTarget: Identifiable {
    let id: String
    let authorID: String
    let isOwn: Bool
}

private struct DiscoverQuestionDeleteTarget: Identifiable {
    let id: String
    let kind: String
}

private struct DiscoverPlanDetailRow: View {
    let systemImage: String
    let title: LocalizedStringKey
    let value: String
    var accessibilityID: String? = nil

    var body: some View {
        HStack(alignment: .top, spacing: SideSeatTheme.spaceMD) {
            Image(systemName: systemImage)
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(SideSeatTheme.textSecondaryStrong)
                .frame(width: 32, height: 32)
                .background(
                    SideSeatTheme.fillTertiary,
                    in: RoundedRectangle(cornerRadius: 8, style: .continuous)
                )

            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                Text(value)
                    .font(.subheadline.weight(.medium))
                    .foregroundStyle(.primary)
                    .fixedSize(horizontal: false, vertical: true)
                    .ssAccessibilityIdentifier(accessibilityID)
            }
            .padding(.top, 1)

            Spacer(minLength: 0)
        }
        .padding(.vertical, SideSeatTheme.spaceSM)
    }
}

private struct BuddyPostTagChips: View {
    let tags: [String]

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 6) {
                ForEach(tags.prefix(8), id: \.self) { tag in
                    Text("#\(tag)")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(SideSeatTheme.textSecondary)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 4)
                        .background(SideSeatTheme.fillTertiary, in: Capsule())
                }
            }
        }
    }
}

struct DiscoverActivityDetailView: View {
    @Environment(SessionStore.self) private var session
    @Environment(RouterPath.self) private var router
    let activityID: String
    @State private var store = DiscoverActivityDetailStore()
    @State private var openConversation = OpenConversationStore()
    @State private var showsCancelSignupConfirmation = false
    @State private var showsCloseConfirmation = false
    @State private var showsCancelActivityConfirmation = false
    @State private var activityMessageDraft = ""
    @State private var activityReplyDraft = ""
    @State private var activityReplyTargetID: String?
    @State private var reportActivityMessage: DiscoverQuestionReportTarget?
    @State private var deleteActivityMessage: DiscoverQuestionDeleteTarget?
    @State private var showsDeleteActivityMessageConfirmation = false
    @State private var showsAllActivityMessages = false
    @State private var showsActivityDiscussion = false

    var body: some View {
        Group {
            if let detail = store.detail {
                ScrollView {
                    VStack(alignment: .leading, spacing: 0) {
                        activitySummary(detail.activity)

                        Divider()
                            .padding(.horizontal, SideSeatTheme.screenHorizontal)

                        activityDetails(detail.activity)

                        Divider()
                            .padding(.horizontal, SideSeatTheme.screenHorizontal)

                        attendees(detail.goingAttendees, activity: detail.activity)

                        Divider()
                            .padding(.horizontal, SideSeatTheme.screenHorizontal)

                        activityMessages(detail)

                        if let issue = store.issue {
                            Text(issue)
                                .font(.footnote)
                                .foregroundStyle(SideSeatTheme.danger)
                                .padding(.horizontal, SideSeatTheme.screenHorizontal)
                                .padding(.bottom, SideSeatTheme.spaceMD)
                        }
                        if let issue = openConversation.issue {
                            Text(issue)
                                .font(.footnote)
                                .foregroundStyle(SideSeatTheme.danger)
                                .padding(.horizontal, SideSeatTheme.screenHorizontal)
                                .padding(.bottom, SideSeatTheme.spaceMD)
                        }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
                .background(SideSeatTheme.bg)
                .accessibilityIdentifier("discover-activity-detail")
                .safeAreaInset(edge: .bottom, spacing: 0) {
                    if !detail.activity.isOrganizer {
                        activityActionBar(detail)
                    }
                }
                .toolbar {
                    ToolbarItem(placement: .principal) {
                        compactOrganizerTitle(detail.activity)
                    }
                    ToolbarItem(placement: .topBarTrailing) {
                        activityMenu(detail)
                    }
                }
                .sheet(item: $reportActivityMessage) { message in
                    ChatReportSheet(title: String(localized: "Report message")) { reason, details in
                        await store.reportMessage(
                            commentID: message.id,
                            authorID: message.authorID,
                            isOwn: message.isOwn,
                            reason: reason,
                            details: details,
                            using: session
                        )
                    }
                }
                .sheet(isPresented: $showsActivityDiscussion) {
                    DiscoverDiscussionView(
                        total: store.messageTotal,
                        comments: store.messages,
                        canComment: !detail.activity.isOrganizer && canLeaveMessage(detail.activity),
                        closedMessage: String(localized: "Comments are closed for this plan."),
                        isLoading: store.isLoadingMessages,
                        isMutating: store.isMutatingMessage,
                        issue: store.messageIssue,
                        onRefresh: {
                            await store.loadMessages(activityID: activityID, using: session)
                        },
                        onSubmit: { body in
                            await store.submitMessage(
                                body: body,
                                activityID: activityID,
                                using: session
                            )
                        },
                        onReply: { commentID, body in
                            await store.submitMessage(
                                body: body,
                                parentID: commentID,
                                activityID: activityID,
                                using: session
                            )
                        },
                        onDelete: { commentID in
                            await store.deleteMessage(
                                commentID: commentID,
                                activityID: activityID,
                                using: session
                            )
                        },
                        onReport: { target, reason, details in
                            await store.reportMessage(
                                commentID: target.id,
                                authorID: target.authorID,
                                isOwn: target.isOwn,
                                reason: reason,
                                details: details,
                                using: session
                            )
                        }
                    )
                    .presentationDetents([.large])
                    .presentationDragIndicator(.visible)
                }
                .confirmationDialog(
                    "Delete this message?",
                    isPresented: $showsDeleteActivityMessageConfirmation,
                    titleVisibility: .visible
                ) {
                    Button("Delete", role: .destructive) {
                        guard let deleteActivityMessage else { return }
                        Task {
                            await store.deleteMessage(
                                commentID: deleteActivityMessage.id,
                                activityID: activityID,
                                using: session
                            )
                            self.deleteActivityMessage = nil
                        }
                    }
                    Button("Cancel", role: .cancel) {
                        deleteActivityMessage = nil
                    }
                }
                .confirmationDialog(
                    "Cancel your signup?",
                    isPresented: $showsCancelSignupConfirmation,
                    titleVisibility: .visible
                ) {
                    Button("Cancel signup", role: .destructive) {
                        Task { await store.setSignup(false, activityID: activityID, using: session) }
                    }
                    Button("Keep signup", role: .cancel) {}
                }
                .confirmationDialog(
                    "Close this plan?",
                    isPresented: $showsCloseConfirmation,
                    titleVisibility: .visible
                ) {
                    Button("Close plan", role: .destructive) {
                        Task { await store.setStatus("CLOSED", activityID: activityID, using: session) }
                    }
                    Button("Cancel", role: .cancel) {}
                }
                .confirmationDialog(
                    "Cancel this plan?",
                    isPresented: $showsCancelActivityConfirmation,
                    titleVisibility: .visible
                ) {
                    Button("Cancel plan", role: .destructive) {
                        Task { await store.setStatus("CANCELED", activityID: activityID, using: session) }
                    }
                    Button("Keep plan", role: .cancel) {}
                }
            } else if let issue = store.issue {
                ContentUnavailableView {
                    Label("Plan unavailable", systemImage: "calendar.badge.exclamationmark")
                } description: {
                    Text(issue)
                } actions: {
                    Button("Try again") { Task { await load() } }
                }
            } else {
                SSLoadingState("Loading plan")
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        }
        .navigationTitle("Plan")
        .navigationBarTitleDisplayMode(.inline)
        .toolbarBackground(.visible, for: .navigationBar)
        .task { await load() }
        .onReceive(NotificationCenter.default.publisher(for: .sideSeatDiscoverNeedsRefresh)) { _ in
            Task { await store.loadMessages(activityID: activityID, using: session) }
        }
    }

    private func activitySummary(_ activity: NativeDiscoverActivity) -> some View {
        VStack(alignment: .leading, spacing: SideSeatTheme.spaceMD) {
            HStack(spacing: SideSeatTheme.spaceMD) {
                DiscoverStatusBadge(status: DiscoverActivityDisplay.status(activity))
                Label(activity.city, systemImage: "mappin")
                    .font(.caption.weight(.medium))
                    .foregroundStyle(.secondary)
            }

            VStack(alignment: .leading, spacing: SideSeatTheme.spaceSM) {
                Text(activity.title)
                    .font(.title2.weight(.bold))
                    .fixedSize(horizontal: false, vertical: true)

                if let description = activity.description, !description.isEmpty {
                    Text(description)
                        .font(.body)
                        .foregroundStyle(SideSeatTheme.textPrimary)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
        }
        .padding(.horizontal, SideSeatTheme.screenHorizontal)
        .padding(.vertical, SideSeatTheme.spaceLG)
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func compactOrganizerTitle(_ activity: NativeDiscoverActivity) -> some View {
        Button {
            router.navigate(to: .profile(userID: activity.organizer.id))
        } label: {
            HStack(spacing: 7) {
                InitialAvatar(
                    name: activity.organizer.displayName,
                    url: activity.organizer.avatarUrl,
                    size: 28
                )
                VStack(alignment: .leading, spacing: 0) {
                    Text(activity.organizer.displayName)
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(.primary)
                        .lineLimit(1)
                    Text("\(String(localized: "Organizer")) · \(activity.school)")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }
            }
            .frame(maxWidth: 190)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier("discover-activity-organizer")
    }

    private func activityDetails(_ activity: NativeDiscoverActivity) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("Plan details")
                .font(.headline)
                .padding(.bottom, SideSeatTheme.spaceSM)

            VStack(alignment: .leading, spacing: 0) {
                if let start = activity.startDate {
                    DiscoverPlanDetailRow(
                        systemImage: "calendar",
                        title: "When",
                        value: scheduleLabel(activity, start: start)
                    )
                }
                DiscoverPlanDetailRow(
                    systemImage: "mappin.and.ellipse",
                    title: "Where",
                    value: locationLabel(activity)
                )
                DiscoverPlanDetailRow(
                    systemImage: "person.2",
                    title: "Attendance",
                    value: capacityLabel(activity)
                )
            }
            .padding(.horizontal, SideSeatTheme.spaceMD)
            .padding(.vertical, SideSeatTheme.spaceXS)
            .background(
                SideSeatTheme.fillSubtle,
                in: RoundedRectangle(cornerRadius: SideSeatTheme.controlRadius, style: .continuous)
            )
        }
        .padding(.horizontal, SideSeatTheme.screenHorizontal)
        .padding(.vertical, SideSeatTheme.spaceXL)
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func attendees(
        _ attendees: [NativeDiscoverActivityAttendee],
        activity: NativeDiscoverActivity
    ) -> some View {
        let visibleAttendees = Array(attendees.prefix(4))
        let remainingCount = max(0, activity.goingCount - visibleAttendees.count)

        return VStack(alignment: .leading, spacing: SideSeatTheme.spaceMD) {
            Text("Participants")
                .font(.headline)

            HStack(spacing: SideSeatTheme.spaceMD) {
                if attendees.isEmpty {
                    Image(systemName: "person.2")
                        .font(.body.weight(.medium))
                        .foregroundStyle(.secondary)
                        .frame(width: 38, height: 38)
                        .background(SideSeatTheme.fillTertiary, in: Circle())
                } else {
                    HStack(spacing: -8) {
                        ForEach(visibleAttendees) { attendee in
                            InitialAvatar(name: attendee.displayName, url: attendee.avatarUrl, size: 34)
                                .overlay(Circle().stroke(SideSeatTheme.bg, lineWidth: 2))
                        }
                        if remainingCount > 0 {
                            Text("+\(remainingCount)")
                                .font(.caption2.weight(.bold))
                                .foregroundStyle(SideSeatTheme.textSecondaryStrong)
                                .frame(width: 34, height: 34)
                                .background(SideSeatTheme.fillTertiary, in: Circle())
                                .overlay(Circle().stroke(SideSeatTheme.bg, lineWidth: 2))
                        }
                    }
                }

                VStack(alignment: .leading, spacing: 2) {
                    if attendees.isEmpty {
                        Text("No attendees yet")
                            .font(.subheadline.weight(.medium))
                    } else {
                        Text(capacityLabel(activity))
                            .font(.subheadline.weight(.medium))
                    }
                    if !attendees.isEmpty {
                        Text(attendees.prefix(3).map(\.displayName).joined(separator: ", "))
                            .font(.caption)
                            .foregroundStyle(.secondary)
                            .lineLimit(1)
                    }
                }

                Spacer(minLength: 0)
            }
        }
        .padding(.horizontal, SideSeatTheme.screenHorizontal)
        .padding(.vertical, SideSeatTheme.spaceXL)
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func activityMessages(_ detail: NativeDiscoverActivityDetail) -> some View {
        let preview = Array(store.messages.prefix(2))

        return VStack(alignment: .leading, spacing: SideSeatTheme.spaceLG) {
            Button {
                showsActivityDiscussion = true
            } label: {
                VStack(alignment: .leading, spacing: SideSeatTheme.spaceLG) {
                    HStack(alignment: .firstTextBaseline) {
                        Text("Comments")
                            .font(.headline)
                            .foregroundStyle(SideSeatTheme.textPrimary)
                        if store.messageTotal > 0 {
                            Text("\(store.messageTotal)")
                                .font(.caption.weight(.semibold))
                                .foregroundStyle(.secondary)
                        }
                        Spacer(minLength: 0)
                        Text(store.messageTotal == 0 ? "Add comment" : "View all")
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(SideSeatTheme.accent)
                        Image(systemName: "chevron.right")
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(.tertiary)
                    }

                    if store.isLoadingMessages, store.messages.isEmpty {
                        ProgressView("Loading comments")
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                            .frame(maxWidth: .infinity, alignment: .center)
                            .padding(.vertical, SideSeatTheme.spaceLG)
                    } else if store.messages.isEmpty {
                        Label(
                            detail.activity.isOrganizer
                                ? String(localized: "Comments from interested people will appear here.")
                                : canLeaveMessage(detail.activity)
                                    ? String(localized: "Start the conversation about this plan.")
                                    : String(localized: "Comments are closed for this plan."),
                            systemImage: "text.bubble"
                        )
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.vertical, SideSeatTheme.spaceSM)
                    } else {
                        VStack(alignment: .leading, spacing: 0) {
                            ForEach(Array(preview.enumerated()), id: \.element.id) { index, comment in
                                DiscoverCommentPreviewRow(comment: comment)
                                if index < preview.count - 1 {
                                    Divider()
                                        .padding(.leading, 46)
                                }
                            }
                        }
                    }
                }
            }
            .buttonStyle(.plain)
            .accessibilityIdentifier("discover-activity-comments-open")

            if let issue = store.messageIssue {
                Text(issue)
                    .font(.footnote)
                    .foregroundStyle(SideSeatTheme.danger)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .padding(.horizontal, SideSeatTheme.screenHorizontal)
        .padding(.vertical, SideSeatTheme.spaceXL)
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func activityMessageRow(_ message: NativeDiscoverPostQuestion) -> some View {
        VStack(alignment: .leading, spacing: SideSeatTheme.spaceMD) {
            activityMessageComment(
                id: message.id,
                body: message.body,
                createdDate: message.createdDate,
                isOwn: message.isOwn,
                canDelete: message.canDelete,
                author: message.author,
                kind: String(localized: "message")
            )

            if let reply = message.reply {
                HStack(alignment: .top, spacing: SideSeatTheme.spaceMD) {
                    RoundedRectangle(cornerRadius: 1)
                        .fill(SideSeatTheme.accent.opacity(0.35))
                        .frame(width: 3)

                    VStack(alignment: .leading, spacing: SideSeatTheme.spaceSM) {
                        Label("Organizer reply", systemImage: "person.crop.circle.badge.checkmark")
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(SideSeatTheme.textPrimary)
                            .accessibilityIdentifier("discover-activity-organizer-reply")

                        activityMessageComment(
                            id: reply.id,
                            body: reply.body,
                            createdDate: reply.createdDate,
                            isOwn: reply.isOwn,
                            canDelete: reply.canDelete,
                            author: reply.author,
                            kind: String(localized: "reply"),
                            compactAvatar: true
                        )
                    }
                }
                .padding(.leading, 46)
            } else if message.canReply {
                if activityReplyTargetID == message.id {
                    HStack(alignment: .bottom, spacing: SideSeatTheme.spaceSM) {
                        TextField("Write a public reply", text: $activityReplyDraft, axis: .vertical)
                            .lineLimit(1...4)
                            .textFieldStyle(.plain)
                            .padding(.horizontal, SideSeatTheme.spaceMD)
                            .padding(.vertical, 10)
                            .background(
                                SideSeatTheme.fillTertiary,
                                in: RoundedRectangle(cornerRadius: SideSeatTheme.controlRadius, style: .continuous)
                            )
                            .onChange(of: activityReplyDraft) { _, value in
                                if value.count > 500 {
                                    activityReplyDraft = String(value.prefix(500))
                                }
                            }

                        Button("Post") { submitActivityReply(to: message.id) }
                            .buttonStyle(.borderedProminent)
                            .disabled(
                                activityReplyDraft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                                    || store.isMutatingMessage
                            )
                    }
                    .padding(.leading, 46)
                } else {
                    Button {
                        activityReplyDraft = ""
                        activityReplyTargetID = message.id
                    } label: {
                        Label("Reply publicly", systemImage: "arrowshape.turn.up.left")
                            .font(.footnote.weight(.semibold))
                    }
                    .padding(.leading, 46)
                }
            }
        }
        .padding(.vertical, SideSeatTheme.spaceMD)
    }

    private func activityMessageComment(
        id: String,
        body: String,
        createdDate: Date?,
        isOwn: Bool,
        canDelete: Bool,
        author: NativeDiscoverQuestionAuthor,
        kind: String,
        compactAvatar: Bool = false
    ) -> some View {
        HStack(alignment: .top, spacing: SideSeatTheme.spaceMD) {
            InitialAvatar(name: author.displayName, url: author.avatarUrl, size: compactAvatar ? 28 : 34)

            VStack(alignment: .leading, spacing: 5) {
                HStack(spacing: SideSeatTheme.spaceXS) {
                    Text(author.displayName)
                        .font(.subheadline.weight(.semibold))
                        .lineLimit(1)
                    if let school = author.school, !school.isEmpty {
                        Text(school)
                            .font(.caption2.weight(.medium))
                            .foregroundStyle(.secondary)
                            .lineLimit(1)
                    }
                    if author.verifiedStudent {
                        Image(systemName: "checkmark.seal.fill")
                            .font(.caption)
                            .foregroundStyle(SideSeatTheme.verifiedSeal)
                            .accessibilityLabel("Verified student")
                    }
                    Spacer(minLength: 0)
                    activityMessageActions(
                        id: id,
                        authorID: author.id,
                        isOwn: isOwn,
                        canDelete: canDelete,
                        kind: kind
                    )
                }

                Text(body)
                    .font(.subheadline)
                    .foregroundStyle(SideSeatTheme.textPrimary)
                    .fixedSize(horizontal: false, vertical: true)

                if let createdDate {
                    Text(createdDate.formatted(.relative(presentation: .numeric)))
                        .font(.caption2)
                        .foregroundStyle(.tertiary)
                }
            }
        }
    }

    @ViewBuilder
    private func activityMessageActions(
        id: String,
        authorID: String,
        isOwn: Bool,
        canDelete: Bool,
        kind: String
    ) -> some View {
        if canDelete || !isOwn {
            Menu {
                if canDelete {
                    Button(role: .destructive) {
                        deleteActivityMessage = DiscoverQuestionDeleteTarget(id: id, kind: kind)
                        showsDeleteActivityMessageConfirmation = true
                    } label: {
                        Label("Delete", systemImage: "trash")
                    }
                }
                if !isOwn {
                    Button(role: .destructive) {
                        reportActivityMessage = DiscoverQuestionReportTarget(
                            id: id,
                            authorID: authorID,
                            isOwn: isOwn
                        )
                    } label: {
                        Label("Report", systemImage: "flag")
                    }
                }
            } label: {
                Image(systemName: "ellipsis")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.secondary)
                    .frame(width: 32, height: 28)
            }
            .accessibilityLabel("Message actions")
        }
    }

    private func submitActivityMessage() {
        let body = activityMessageDraft
        Task {
            if await store.submitMessage(
                body: body,
                activityID: activityID,
                using: session
            ) {
                activityMessageDraft = ""
            }
        }
    }

    private func submitActivityReply(to messageID: String) {
        let body = activityReplyDraft
        Task {
            if await store.submitMessage(
                body: body,
                parentID: messageID,
                activityID: activityID,
                using: session
            ) {
                activityReplyDraft = ""
                activityReplyTargetID = nil
            }
        }
    }

    private func activityActionBar(_ detail: NativeDiscoverActivityDetail) -> some View {
        VStack(spacing: 6) {
            if detail.calendarEntryId != nil {
                HStack(spacing: 5) {
                    Image(systemName: "calendar.badge.checkmark")
                    Text("On SideSeat calendar")
                        .accessibilityIdentifier("discover-activity-calendar-status")
                }
                    .font(.caption.weight(.medium))
                    .foregroundStyle(SideSeatTheme.textSecondaryStrong)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .transition(.move(edge: .bottom).combined(with: .opacity))
            }

            HStack(spacing: SideSeatTheme.spaceSM) {
                if canContactOrganizer(detail.activity) {
                    Button {
                        Task { await openChat(peerID: detail.activity.organizer.id) }
                    } label: {
                        Group {
                            if openConversation.isOpening {
                                ProgressView()
                            } else {
                                Image(systemName: "message")
                                    .font(.body.weight(.semibold))
                            }
                        }
                        .frame(width: 46, height: 46)
                        .background(
                            SideSeatTheme.fillTertiary,
                            in: RoundedRectangle(cornerRadius: SideSeatTheme.controlRadius, style: .continuous)
                        )
                    }
                    .foregroundStyle(SideSeatTheme.textPrimary)
                    .disabled(openConversation.isOpening)
                    .accessibilityLabel(detail.viewerHasExistingChat ? "Message organizer" : "Contact organizer")
                    .accessibilityIdentifier("discover-activity-message")
                }

                if canAddToCalendar(detail) {
                    Button {
                        Task { await store.addToCalendar(activityID: activityID, using: session) }
                    } label: {
                        Image(systemName: detail.calendarEntryId == nil ? "calendar.badge.plus" : "calendar.badge.checkmark")
                            .font(.body.weight(.semibold))
                            .frame(width: 46, height: 46)
                            .background(
                                SideSeatTheme.fillTertiary,
                                in: RoundedRectangle(cornerRadius: SideSeatTheme.controlRadius, style: .continuous)
                            )
                    }
                    .foregroundStyle(SideSeatTheme.textPrimary)
                    .disabled(store.isMutating || detail.calendarEntryId != nil)
                    .accessibilityLabel(detail.calendarEntryId == nil ? "Add to SideSeat calendar" : "On SideSeat calendar")
                    .accessibilityIdentifier("discover-activity-add-calendar")
                }

                if detail.activity.viewerSignupStatus == "GOING" {
                    Button {
                        showsCancelSignupConfirmation = true
                    } label: {
                        Label("Joined", systemImage: "checkmark")
                            .font(.body.weight(.semibold))
                            .foregroundStyle(SideSeatTheme.textPrimary)
                            .frame(maxWidth: .infinity)
                            .frame(height: 46)
                            .background(
                                SideSeatTheme.fillTertiary,
                                in: RoundedRectangle(cornerRadius: SideSeatTheme.controlRadius, style: .continuous)
                            )
                    }
                    .disabled(store.isMutating)
                    .accessibilityHint("Double tap to cancel your signup")
                    .accessibilityIdentifier("discover-activity-cancel-signup")
                } else {
                    Button {
                        Task { await store.setSignup(true, activityID: activityID, using: session) }
                    } label: {
                        HStack(spacing: SideSeatTheme.spaceSM) {
                            if store.isMutating {
                                ProgressView().tint(.white)
                            } else {
                                Image(systemName: "person.badge.plus")
                                Text("Join plan")
                            }
                        }
                        .font(.body.weight(.semibold))
                        .foregroundStyle(.white)
                        .frame(maxWidth: .infinity)
                        .frame(height: 46)
                        .background(
                            SideSeatTheme.accent,
                            in: RoundedRectangle(cornerRadius: SideSeatTheme.controlRadius, style: .continuous)
                        )
                    }
                    .disabled(store.isMutating || detail.activity.phase != "bookable")
                    .accessibilityIdentifier("discover-activity-join")
                }
            }
        }
        .padding(.horizontal, SideSeatTheme.spaceLG)
        .padding(.vertical, SideSeatTheme.spaceMD)
        .background(.regularMaterial)
    }

    private func activityMenu(_ detail: NativeDiscoverActivityDetail) -> some View {
        Menu {
            ShareLink(item: activityShareURL(detail.activity)) {
                Label("Share plan", systemImage: "square.and.arrow.up")
            }

            if detail.activity.isOrganizer {
                Button {
                    showsCloseConfirmation = true
                } label: {
                    Label("Close plan", systemImage: "lock")
                }
                .disabled(store.isMutating || !canClose(detail.activity))
                .accessibilityIdentifier("discover-activity-close")

                Button(role: .destructive) {
                    showsCancelActivityConfirmation = true
                } label: {
                    Label("Cancel plan", systemImage: "xmark.circle")
                }
                .disabled(store.isMutating || detail.activity.phase == "canceled")
                .accessibilityIdentifier("discover-activity-cancel")
            }
        } label: {
            Image(systemName: "ellipsis.circle")
        }
        .accessibilityLabel("Plan actions")
        .accessibilityIdentifier("discover-activity-actions")
    }

    private func load() async {
        await store.load(activityID: activityID, using: session)
    }

    private func openChat(peerID: String) async {
        guard let connectionID = await openConversation.open(peerID: peerID, using: session) else {
            return
        }
        router.navigate(to: .directChat(connectionID: connectionID))
    }

    private func capacityLabel(_ activity: NativeDiscoverActivity) -> String {
        if let capacity = activity.capacity {
            return String.localizedStringWithFormat(
                String(localized: "%lld/%lld people going"),
                Int64(activity.goingCount),
                Int64(capacity)
            )
        }
        return String.localizedStringWithFormat(
            String(localized: "%lld people going"),
            Int64(activity.goingCount)
        )
    }

    private func scheduleLabel(_ activity: NativeDiscoverActivity, start: Date) -> String {
        guard let end = activity.endDate else {
            return start.formatted(date: .abbreviated, time: .shortened)
        }

        if Calendar.autoupdatingCurrent.isDate(start, inSameDayAs: end) {
            let day = start.formatted(date: .abbreviated, time: .omitted)
            let startTime = start.formatted(date: .omitted, time: .shortened)
            let endTime = end.formatted(date: .omitted, time: .shortened)
            return "\(day) · \(startTime)–\(endTime)"
        }

        return "\(start.formatted(date: .abbreviated, time: .shortened)) – \(end.formatted(date: .abbreviated, time: .shortened))"
    }

    private func locationLabel(_ activity: NativeDiscoverActivity) -> String {
        guard !activity.location.localizedCaseInsensitiveContains(activity.city) else {
            return activity.location
        }
        return "\(activity.location), \(activity.city)"
    }

    private func activityShareURL(_ activity: NativeDiscoverActivity) -> URL {
        URL(string: "https://www.sideseat.de")!
            .appendingPathComponent("discover")
            .appendingPathComponent("activities")
            .appendingPathComponent(activity.id)
    }

    private func canClose(_ activity: NativeDiscoverActivity) -> Bool {
        let phase = activity.phase.lowercased()
        return phase == "bookable" || phase == "full"
    }

    private func canLeaveMessage(_ activity: NativeDiscoverActivity) -> Bool {
        let phase = activity.phase.lowercased()
        return phase == "bookable" || phase == "full"
    }

    private func canContactOrganizer(_ activity: NativeDiscoverActivity) -> Bool {
        let phase = activity.phase.lowercased()
        return !activity.isOrganizer && phase != "canceled" && phase != "expired"
    }

    private func canAddToCalendar(_ detail: NativeDiscoverActivityDetail) -> Bool {
        !detail.activity.isOrganizer
            && (detail.activity.viewerSignupStatus == "GOING" || detail.calendarEntryId != nil)
    }
}

private struct DiscoverCommentPreviewRow: View {
    let comment: NativeDiscoverPostQuestion

    var body: some View {
        HStack(alignment: .top, spacing: SideSeatTheme.spaceMD) {
            InitialAvatar(name: comment.author.displayName, url: comment.author.avatarUrl, size: 34)

            VStack(alignment: .leading, spacing: 5) {
                HStack(spacing: SideSeatTheme.spaceXS) {
                    Text(comment.author.displayName)
                        .font(.subheadline.weight(.semibold))
                        .lineLimit(1)
                    if let school = comment.author.school, !school.isEmpty {
                        Text(school)
                            .font(.caption2.weight(.medium))
                            .foregroundStyle(.secondary)
                            .lineLimit(1)
                    }
                    if comment.author.verifiedStudent {
                        Image(systemName: "checkmark.seal.fill")
                            .font(.caption)
                            .foregroundStyle(SideSeatTheme.verifiedSeal)
                            .accessibilityLabel("Verified student")
                    }
                }

                Text(comment.body)
                    .font(.subheadline)
                    .foregroundStyle(SideSeatTheme.textPrimary)
                    .lineLimit(2)

                if let reply = comment.reply {
                    Text(
                        String.localizedStringWithFormat(
                            String(localized: "Organizer: %@"),
                            reply.body
                        )
                    )
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }
            }

            Spacer(minLength: 0)
        }
        .padding(.vertical, SideSeatTheme.spaceMD)
    }
}

private enum DiscoverCommentFocus: Hashable {
    case newComment
    case reply(String)
}

private struct DiscoverDiscussionView: View {
    @Environment(\.dismiss) private var dismiss

    let total: Int
    let comments: [NativeDiscoverPostQuestion]
    let canComment: Bool
    let closedMessage: String
    let isLoading: Bool
    let isMutating: Bool
    let issue: String?
    let onRefresh: () async -> Void
    let onSubmit: (String) async -> Bool
    let onReply: (String, String) async -> Bool
    let onDelete: (String) async -> Void
    let onReport: (
        DiscoverQuestionReportTarget,
        NativeReportReason,
        String
    ) async -> String?

    @State private var draft = ""
    @State private var replyDraft = ""
    @State private var replyTargetID: String?
    @State private var reportTarget: DiscoverQuestionReportTarget?
    @State private var deleteTarget: DiscoverQuestionDeleteTarget?
    @State private var showsDeleteConfirmation = false
    @FocusState private var focusedField: DiscoverCommentFocus?

    var body: some View {
        NavigationStack {
            Group {
                if isLoading, comments.isEmpty {
                    SSLoadingState("Loading comments")
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else if comments.isEmpty {
                    ContentUnavailableView {
                        Label("No comments yet", systemImage: "text.bubble")
                    } description: {
                        Text(canComment ? "Start the conversation about this plan." : closedMessage)
                    }
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else {
                    ScrollView {
                        LazyVStack(alignment: .leading, spacing: 0) {
                            ForEach(Array(comments.enumerated()), id: \.element.id) { index, comment in
                                commentThread(comment)
                                if index < comments.count - 1 {
                                    Divider()
                                        .padding(.leading, 64)
                                }
                            }

                            if total > comments.count {
                                Text(
                                    String.localizedStringWithFormat(
                                        String(localized: "Showing the latest %lld comments"),
                                        Int64(comments.count)
                                    )
                                )
                                .font(.caption)
                                .foregroundStyle(.secondary)
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, SideSeatTheme.spaceXL)
                            }
                        }
                        .padding(.horizontal, SideSeatTheme.screenHorizontal)
                    }
                    .scrollDismissesKeyboard(.interactively)
                    .refreshable { await onRefresh() }
                    .accessibilityIdentifier("discover-comments-list")
                }
            }
            .background(SideSeatTheme.bg)
            .navigationTitle(discussionTitle)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                        .accessibilityIdentifier("discover-comments-done")
                }
            }
            .safeAreaInset(edge: .bottom, spacing: 0) {
                if canComment {
                    newCommentComposer
                } else {
                    closedFooter
                }
            }
            .overlay(alignment: .bottom) {
                if let issue {
                    Text(issue)
                        .font(.footnote)
                        .foregroundStyle(SideSeatTheme.danger)
                        .padding(.horizontal, SideSeatTheme.spaceMD)
                        .padding(.vertical, SideSeatTheme.spaceSM)
                        .background(.regularMaterial, in: Capsule())
                        .padding(.bottom, canComment ? 76 : 58)
                        .padding(.horizontal, SideSeatTheme.screenHorizontal)
                }
            }
            .task { await onRefresh() }
            .sheet(item: $reportTarget) { target in
                ChatReportSheet(title: String(localized: "Report comment")) { reason, details in
                    await onReport(target, reason, details)
                }
            }
            .confirmationDialog(
                deleteTarget?.kind == String(localized: "reply")
                    ? String(localized: "Delete this reply?")
                    : String(localized: "Delete this comment?"),
                isPresented: $showsDeleteConfirmation,
                titleVisibility: .visible
            ) {
                Button("Delete", role: .destructive) {
                    guard let deleteTarget else { return }
                    Task {
                        await onDelete(deleteTarget.id)
                        self.deleteTarget = nil
                    }
                }
                Button("Cancel", role: .cancel) { deleteTarget = nil }
            }
        }
        .accessibilityIdentifier("discover-comments-sheet")
    }

    private var discussionTitle: String {
        guard total > 0 else { return String(localized: "Comments") }
        return String.localizedStringWithFormat(
            String(localized: "%lld comments"),
            Int64(total)
        )
    }

    private var newCommentComposer: some View {
        VStack(spacing: 0) {
            Divider()
            HStack(alignment: .bottom, spacing: SideSeatTheme.spaceSM) {
                TextField("Add a public comment", text: $draft, axis: .vertical)
                    .lineLimit(1...4)
                    .textFieldStyle(.plain)
                    .padding(.horizontal, SideSeatTheme.spaceMD)
                    .padding(.vertical, 11)
                    .background(
                        SideSeatTheme.fillTertiary,
                        in: RoundedRectangle(
                            cornerRadius: SideSeatTheme.controlRadius,
                            style: .continuous
                        )
                    )
                    .focused($focusedField, equals: .newComment)
                    .submitLabel(.send)
                    .onSubmit { submitComment() }
                    .onChange(of: draft) { _, value in
                        if value.count > 500 { draft = String(value.prefix(500)) }
                    }
                    .accessibilityIdentifier("discover-comment-input")

                Button(action: submitComment) {
                    Group {
                        if isMutating {
                            ProgressView().tint(.white)
                        } else {
                            Image(systemName: "arrow.up")
                                .font(.body.weight(.bold))
                        }
                    }
                    .foregroundStyle(.white)
                    .frame(width: 42, height: 42)
                    .background(
                        trimmedDraft.isEmpty ? Color.secondary.opacity(0.45) : SideSeatTheme.accent,
                        in: Circle()
                    )
                }
                .disabled(trimmedDraft.isEmpty || isMutating)
                .accessibilityLabel("Post comment")
                .accessibilityIdentifier("discover-comment-send")
            }
            .padding(.horizontal, SideSeatTheme.screenHorizontal)
            .padding(.vertical, SideSeatTheme.spaceSM)
        }
        .background(.bar)
    }

    private var closedFooter: some View {
        HStack(spacing: SideSeatTheme.spaceSM) {
            Image(systemName: "lock")
            Text(closedMessage)
        }
        .font(.footnote)
        .foregroundStyle(.secondary)
        .frame(maxWidth: .infinity)
        .padding(.horizontal, SideSeatTheme.screenHorizontal)
        .padding(.vertical, SideSeatTheme.spaceMD)
        .background(.bar)
    }

    private func commentThread(_ comment: NativeDiscoverPostQuestion) -> some View {
        VStack(alignment: .leading, spacing: SideSeatTheme.spaceMD) {
            commentContent(
                id: comment.id,
                body: comment.body,
                createdDate: comment.createdDate,
                isOwn: comment.isOwn,
                canDelete: comment.canDelete,
                author: comment.author,
                kind: String(localized: "comment")
            )

            if let reply = comment.reply {
                HStack(alignment: .top, spacing: SideSeatTheme.spaceMD) {
                    RoundedRectangle(cornerRadius: 1)
                        .fill(SideSeatTheme.separator)
                        .frame(width: 3)

                    VStack(alignment: .leading, spacing: SideSeatTheme.spaceSM) {
                        Label("Organizer reply", systemImage: "person.crop.circle.badge.checkmark")
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(SideSeatTheme.textSecondary)

                        commentContent(
                            id: reply.id,
                            body: reply.body,
                            createdDate: reply.createdDate,
                            isOwn: reply.isOwn,
                            canDelete: reply.canDelete,
                            author: reply.author,
                            kind: String(localized: "reply"),
                            compactAvatar: true
                        )
                    }
                }
                .padding(.leading, 46)
                .accessibilityIdentifier("discover-comment-organizer-reply")
            } else if comment.canReply {
                replyControl(for: comment)
            }
        }
        .padding(.vertical, SideSeatTheme.spaceLG)
        .id(comment.id)
    }

    private func commentContent(
        id: String,
        body: String,
        createdDate: Date?,
        isOwn: Bool,
        canDelete: Bool,
        author: NativeDiscoverQuestionAuthor,
        kind: String,
        compactAvatar: Bool = false
    ) -> some View {
        HStack(alignment: .top, spacing: SideSeatTheme.spaceMD) {
            InitialAvatar(name: author.displayName, url: author.avatarUrl, size: compactAvatar ? 28 : 36)

            VStack(alignment: .leading, spacing: 5) {
                HStack(spacing: SideSeatTheme.spaceXS) {
                    Text(author.displayName)
                        .font(.subheadline.weight(.semibold))
                        .lineLimit(1)
                    if let school = author.school, !school.isEmpty {
                        Text(school)
                            .font(.caption2.weight(.medium))
                            .foregroundStyle(.secondary)
                            .lineLimit(1)
                    }
                    if author.verifiedStudent {
                        Image(systemName: "checkmark.seal.fill")
                            .font(.caption)
                            .foregroundStyle(SideSeatTheme.verifiedSeal)
                            .accessibilityLabel("Verified student")
                    }
                    Spacer(minLength: 0)
                    commentActions(
                        id: id,
                        authorID: author.id,
                        isOwn: isOwn,
                        canDelete: canDelete,
                        kind: kind
                    )
                }

                Text(body)
                    .font(.subheadline)
                    .foregroundStyle(SideSeatTheme.textPrimary)
                    .fixedSize(horizontal: false, vertical: true)

                if let createdDate {
                    Text(createdDate.formatted(.relative(presentation: .numeric)))
                        .font(.caption2)
                        .foregroundStyle(.tertiary)
                }
            }
        }
    }

    @ViewBuilder
    private func replyControl(for comment: NativeDiscoverPostQuestion) -> some View {
        if replyTargetID == comment.id {
            VStack(alignment: .trailing, spacing: SideSeatTheme.spaceSM) {
                TextField("Write a public reply", text: $replyDraft, axis: .vertical)
                    .lineLimit(1...4)
                    .textFieldStyle(.plain)
                    .padding(.horizontal, SideSeatTheme.spaceMD)
                    .padding(.vertical, 10)
                    .background(
                        SideSeatTheme.fillTertiary,
                        in: RoundedRectangle(
                            cornerRadius: SideSeatTheme.controlRadius,
                            style: .continuous
                        )
                    )
                    .focused($focusedField, equals: .reply(comment.id))
                    .onChange(of: replyDraft) { _, value in
                        if value.count > 500 { replyDraft = String(value.prefix(500)) }
                    }
                    .accessibilityIdentifier("discover-comment-reply-input")

                HStack(spacing: SideSeatTheme.spaceLG) {
                    Button("Cancel") {
                        replyDraft = ""
                        replyTargetID = nil
                        focusedField = nil
                    }
                    Button("Reply") { submitReply(to: comment.id) }
                        .fontWeight(.semibold)
                        .disabled(trimmedReply.isEmpty || isMutating)
                }
                .font(.footnote)
            }
            .padding(.leading, 48)
        } else {
            Button {
                replyDraft = ""
                replyTargetID = comment.id
                focusedField = .reply(comment.id)
            } label: {
                Label("Reply as organizer", systemImage: "arrowshape.turn.up.left")
                    .font(.footnote.weight(.semibold))
            }
            .padding(.leading, 48)
            .accessibilityIdentifier("discover-comment-reply")
        }
    }

    @ViewBuilder
    private func commentActions(
        id: String,
        authorID: String,
        isOwn: Bool,
        canDelete: Bool,
        kind: String
    ) -> some View {
        if canDelete || !isOwn {
            Menu {
                if canDelete {
                    Button(role: .destructive) {
                        deleteTarget = DiscoverQuestionDeleteTarget(id: id, kind: kind)
                        showsDeleteConfirmation = true
                    } label: {
                        Label("Delete", systemImage: "trash")
                    }
                }
                if !isOwn {
                    Button(role: .destructive) {
                        reportTarget = DiscoverQuestionReportTarget(
                            id: id,
                            authorID: authorID,
                            isOwn: isOwn
                        )
                    } label: {
                        Label("Report", systemImage: "flag")
                    }
                }
            } label: {
                Image(systemName: "ellipsis")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.secondary)
                    .frame(width: 32, height: 28)
            }
            .accessibilityLabel("Comment actions")
        }
    }

    private var trimmedDraft: String {
        draft.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private var trimmedReply: String {
        replyDraft.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private func submitComment() {
        let body = trimmedDraft
        guard !body.isEmpty else { return }
        Task {
            if await onSubmit(body) {
                draft = ""
                focusedField = nil
            }
        }
    }

    private func submitReply(to commentID: String) {
        let body = trimmedReply
        guard !body.isEmpty else { return }
        Task {
            if await onReply(commentID, body) {
                replyDraft = ""
                replyTargetID = nil
                focusedField = nil
            }
        }
    }
}
