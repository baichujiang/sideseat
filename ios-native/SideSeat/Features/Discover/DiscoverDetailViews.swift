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
                        host(detail.post.author)
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
                        DiscoverPlanCreateView(editingPost: post) {
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
                    ChatReportSheet(title: String(localized: "Report question")) { reason, details in
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
            } else if store.isLoading {
                SSLoadingState("Loading plan")
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                ContentUnavailableView {
                    Label("Plan unavailable", systemImage: "person.crop.circle.badge.exclamationmark")
                } description: {
                    Text(store.issue ?? "This post is no longer available.")
                } actions: {
                    Button("Try again") { Task { await load() } }
                }
            }
        }
        .navigationTitle("Plan")
        .navigationBarTitleDisplayMode(.inline)
        .toolbarBackground(.visible, for: .navigationBar)
        .task { await load() }
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
                    .frame(height: 280)
                    .clipped()
                }
            }
            .frame(height: 280)
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
        VStack(alignment: .leading, spacing: SideSeatTheme.spaceMD) {
            HStack(spacing: SideSeatTheme.spaceSM) {
                Label(
                    BuddyPostDisplay.statusLabel(post.status),
                    systemImage: post.status == "ACTIVE" ? "circle.fill" : "checkmark.circle.fill"
                )
                .font(.caption.weight(.semibold))
                .foregroundStyle(post.status == "ACTIVE" ? SideSeatTheme.success : SideSeatTheme.textSecondary)

                Spacer(minLength: 0)

                Text(post.city)
                    .font(.caption.weight(.medium))
                    .foregroundStyle(.secondary)
            }

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
        .padding(.horizontal, SideSeatTheme.screenHorizontal)
        .padding(.vertical, SideSeatTheme.spaceXL)
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func planDetails(_ post: NativeDiscoverBuddyPost) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("Plan details")
                .font(.headline)
                .padding(.bottom, SideSeatTheme.spaceSM)

            DiscoverPlanDetailRow(systemImage: "calendar", title: "When", value: scheduleLabel(post))
            DiscoverPlanDetailRow(systemImage: "mappin.and.ellipse", title: "Where", value: locationLabel(post))
            DiscoverPlanDetailRow(
                systemImage: "person.2",
                title: "Group",
                value: groupLabel(post),
                accessibilityID: "discover-plan-group"
            )
            DiscoverPlanDetailRow(
                systemImage: "eye",
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

            if let expiry = post.expiryDate {
                Text("Plan closes \(expiry.formatted(date: .abbreviated, time: .shortened))")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .padding(.top, SideSeatTheme.spaceSM)
            }
        }
        .padding(.horizontal, SideSeatTheme.screenHorizontal)
        .padding(.vertical, SideSeatTheme.spaceXL)
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func host(_ author: NativeDiscoverBuddyAuthor) -> some View {
        VStack(alignment: .leading, spacing: SideSeatTheme.spaceLG) {
            Text("Meet your host")
                .font(.headline)

            Button {
                router.navigate(to: .profile(userID: author.id))
            } label: {
                HStack(spacing: SideSeatTheme.spaceMD) {
                    InitialAvatar(name: author.displayName, url: author.avatarUrl, size: 52)
                    VStack(alignment: .leading, spacing: SideSeatTheme.spaceXS) {
                        HStack(spacing: SideSeatTheme.spaceSM) {
                            Text(author.displayName)
                                .font(.body.weight(.semibold))
                                .foregroundStyle(.primary)
                                .lineLimit(1)
                            SchoolIdentityBadge(
                                school: author.school,
                                verifiedStudent: author.verifiedStudent,
                                status: author.verifiedStudent ? "VERIFIED" : "UNVERIFIED",
                                compact: true
                            )
                        }

                        Text(hostAcademicLine(author))
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                            .lineLimit(2)

                        if let tagline = author.tagline, !tagline.isEmpty {
                            Text(tagline)
                                .font(.subheadline)
                                .foregroundStyle(.primary)
                                .lineLimit(2)
                        }
                    }
                    Spacer(minLength: 0)
                    Image(systemName: "chevron.right")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(.tertiary)
                }
            }
            .buttonStyle(.plain)

            if author.verifiedStudent {
                Label("Student identity verified", systemImage: "checkmark.shield.fill")
                    .font(.footnote.weight(.medium))
                    .foregroundStyle(SideSeatTheme.verifiedSeal)
                    .padding(.horizontal, SideSeatTheme.spaceMD)
                    .padding(.vertical, SideSeatTheme.spaceSM)
                    .background(
                        SideSeatTheme.verifiedSeal.opacity(0.10),
                        in: RoundedRectangle(cornerRadius: SideSeatTheme.controlRadius, style: .continuous)
                    )
                    .accessibilityIdentifier("discover-plan-verified-host")
            }
        }
        .padding(.horizontal, SideSeatTheme.screenHorizontal)
        .padding(.vertical, SideSeatTheme.spaceXL)
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func questions(_ detail: NativeDiscoverBuddyPostDetail) -> some View {
        VStack(alignment: .leading, spacing: SideSeatTheme.spaceLG) {
            HStack(alignment: .firstTextBaseline) {
                Text("Questions")
                    .font(.headline)
                if !store.questions.isEmpty {
                    Text("\(store.questions.count)")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(.secondary)
                }
                Spacer(minLength: 0)
            }

            if !detail.post.isOwn {
                HStack(alignment: .bottom, spacing: SideSeatTheme.spaceSM) {
                    TextField("Ask about this plan", text: $questionDraft, axis: .vertical)
                        .lineLimit(1...4)
                        .textFieldStyle(.plain)
                        .padding(.horizontal, SideSeatTheme.spaceMD)
                        .padding(.vertical, 11)
                        .background(
                            SideSeatTheme.fillTertiary,
                            in: RoundedRectangle(cornerRadius: SideSeatTheme.controlRadius, style: .continuous)
                        )
                        .submitLabel(.send)
                        .onSubmit { submitQuestion() }
                        .onChange(of: questionDraft) { _, value in
                            if value.count > 500 { questionDraft = String(value.prefix(500)) }
                        }
                        .accessibilityIdentifier("discover-question-input")

                    Button(action: submitQuestion) {
                        Image(systemName: "arrow.up")
                            .font(.body.weight(.bold))
                            .foregroundStyle(.white)
                            .frame(width: 42, height: 42)
                            .background(
                                questionDraft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                                    ? Color.secondary.opacity(0.45)
                                    : SideSeatTheme.accent,
                                in: Circle()
                            )
                    }
                    .disabled(
                        questionDraft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                            || store.isMutatingQuestion
                    )
                    .accessibilityLabel("Post question")
                    .accessibilityIdentifier("discover-question-send")
                }
            }

            if store.isLoadingQuestions, store.questions.isEmpty {
                ProgressView("Loading questions")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity, alignment: .center)
                    .padding(.vertical, SideSeatTheme.spaceLG)
            } else if store.questions.isEmpty {
                Text(detail.post.isOwn ? "Questions from interested people will appear here." : "No questions yet. Ask the first one.")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .padding(.vertical, SideSeatTheme.spaceSM)
            } else {
                VStack(alignment: .leading, spacing: 0) {
                    ForEach(Array(store.questions.enumerated()), id: \.element.id) { index, question in
                        questionRow(question)
                        if index < store.questions.count - 1 {
                            Divider()
                                .padding(.leading, 46)
                        }
                    }
                }
            }

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
        .accessibilityIdentifier("discover-questions")
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
                kind: String(localized: "question")
            )

            if let reply = question.reply {
                HStack(alignment: .top, spacing: SideSeatTheme.spaceMD) {
                    RoundedRectangle(cornerRadius: 1)
                        .fill(SideSeatTheme.accent.opacity(0.35))
                        .frame(width: 3)
                    VStack(alignment: .leading, spacing: SideSeatTheme.spaceSM) {
                        Label("Host reply", systemImage: "person.crop.circle.badge.checkmark")
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(SideSeatTheme.accent)
                        questionComment(
                            id: reply.id,
                            body: reply.body,
                            createdDate: reply.createdDate,
                            isOwn: reply.isOwn,
                            canDelete: reply.canDelete,
                            author: reply.author,
                            kind: String(localized: "answer"),
                            compactAvatar: true
                        )
                    }
                }
                .padding(.leading, 46)
            } else if question.canReply {
                if replyTargetID == question.id {
                    HStack(alignment: .bottom, spacing: SideSeatTheme.spaceSM) {
                        TextField("Write a public answer", text: $replyDraft, axis: .vertical)
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
            .accessibilityLabel("Question actions")
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
                    Label("Your plan", systemImage: "person.crop.circle.badge.checkmark")
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(.secondary)
                        .frame(maxWidth: .infinity)
                        .frame(height: 46)
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

    private func hostAcademicLine(_ author: NativeDiscoverBuddyAuthor) -> String {
        var parts: [String] = []
        if let studentRoleLabel = author.studentRoleLabel {
            parts.append(studentRoleLabel)
        }
        if let school = author.school, !school.isEmpty {
            parts.append(school)
        }
        if let major = author.major, !major.isEmpty {
            parts.append(major)
        }
        if let semester = author.semester {
            parts.append(String(localized: "Semester \(semester)"))
        }
        return parts.isEmpty ? String(localized: "International student") : parts.joined(separator: " · ")
    }

    private func load() async {
        await store.load(postID: postID, using: session)
    }

    private func canEdit(_ post: NativeDiscoverBuddyPost) -> Bool {
        post.isOwn && post.status == "ACTIVE" && (post.expiryDate ?? .distantPast) > Date()
    }

    private func openChat(peerID: String) async {
        guard let connectionID = await openConversation.open(peerID: peerID, using: session) else {
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
                .foregroundStyle(SideSeatTheme.accent)
                .frame(width: 32, height: 32)
                .background(
                    SideSeatTheme.accent.opacity(0.10),
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

    var body: some View {
        Group {
            if let detail = store.detail {
                ScrollView {
                    VStack(alignment: .leading, spacing: 20) {
                        VStack(alignment: .leading, spacing: 10) {
                            Text(detail.activity.title)
                                .font(.title3.weight(.semibold))
                                .fixedSize(horizontal: false, vertical: true)
                            if let description = detail.activity.description, !description.isEmpty {
                                Text(description)
                                    .fixedSize(horizontal: false, vertical: true)
                            }
                        }
                        .padding(16)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(SideSeatTheme.surface, in: RoundedRectangle(cornerRadius: SideSeatTheme.controlRadius, style: .continuous))

                        VStack(alignment: .leading, spacing: 10) {
                            if let start = detail.activity.startDate {
                                Label(start.formatted(date: .abbreviated, time: .shortened), systemImage: "calendar")
                            }
                            Label(detail.activity.location, systemImage: "mappin.and.ellipse")
                            Label(capacityLabel(detail.activity), systemImage: "person.2")
                            Label(detail.activity.organizer.displayName, systemImage: "person.crop.circle")
                        }
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                        .padding(16)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(SideSeatTheme.surface, in: RoundedRectangle(cornerRadius: SideSeatTheme.controlRadius, style: .continuous))

                        VStack(alignment: .leading, spacing: 10) {
                            Text("Going")
                                .font(.subheadline.weight(.semibold))
                            if detail.goingAttendees.isEmpty {
                                Text("No attendees yet")
                                    .foregroundStyle(.secondary)
                            } else {
                                ForEach(detail.goingAttendees) { attendee in
                                    Label(attendee.displayName, systemImage: "person")
                                }
                            }
                        }
                        .padding(16)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(SideSeatTheme.surface, in: RoundedRectangle(cornerRadius: SideSeatTheme.controlRadius, style: .continuous))

                        activityActions(detail)

                        if let issue = store.issue {
                            Text(issue)
                                .font(.footnote)
                                .foregroundStyle(SideSeatTheme.danger)
                        }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.horizontal, 16)
                    .padding(.top, 12)
                    .padding(.bottom, 24)
                }
                .background(SideSeatTheme.bgGrouped)
                .accessibilityIdentifier("discover-activity-detail")
            } else if store.isLoading {
                SSLoadingState("Loading activity")
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                ContentUnavailableView {
                    Label("Activity unavailable", systemImage: "calendar.badge.exclamationmark")
                } description: {
                    Text(store.issue ?? "This activity is no longer available.")
                } actions: {
                    Button("Try again") { Task { await load() } }
                }
            }
        }
        .navigationTitle("Activity")
        .navigationBarTitleDisplayMode(.inline)
        .toolbarBackground(.visible, for: .navigationBar)
        .task { await load() }
    }

    @ViewBuilder
    private func activityActions(_ detail: NativeDiscoverActivityDetail) -> some View {
        VStack(spacing: 0) {
            if detail.activity.isOrganizer {
                Button {
                    Task { await store.setStatus("CLOSED", activityID: activityID, using: session) }
                } label: {
                    Label("Close activity", systemImage: "lock")
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.vertical, 12)
                }
                .disabled(store.isMutating || !canClose(detail.activity))
                .accessibilityIdentifier("discover-activity-close")

                Divider()

                Button(role: .destructive) {
                    Task { await store.setStatus("CANCELED", activityID: activityID, using: session) }
                } label: {
                    Label("Cancel activity", systemImage: "xmark.circle")
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.vertical, 12)
                }
                .disabled(store.isMutating || detail.activity.phase == "canceled")
                .accessibilityIdentifier("discover-activity-cancel")
            } else {
                if canContactOrganizer(detail.activity) {
                    Button {
                        Task { await openChat(peerID: detail.activity.organizer.id) }
                    } label: {
                        Group {
                            if openConversation.isOpening {
                                ProgressView()
                                    .frame(maxWidth: .infinity, alignment: .leading)
                            } else {
                                Label(
                                    detail.viewerHasExistingChat ? "Message organizer" : "Contact organizer",
                                    systemImage: "message"
                                )
                                .frame(maxWidth: .infinity, alignment: .leading)
                            }
                        }
                        .padding(.vertical, 12)
                    }
                    .disabled(openConversation.isOpening)
                    .accessibilityIdentifier("discover-activity-message")

                    if let issue = openConversation.issue {
                        Text(issue)
                            .font(.footnote)
                            .foregroundStyle(SideSeatTheme.danger)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(.bottom, 8)
                    }

                    Divider()
                }

                if canAddToCalendar(detail) {
                    Button {
                        Task { await store.addToCalendar(activityID: activityID, using: session) }
                    } label: {
                        Label(
                            detail.calendarEntryId == nil
                                ? "Add to SideSeat calendar"
                                : "On SideSeat calendar",
                            systemImage: detail.calendarEntryId == nil
                                ? "calendar.badge.plus"
                                : "calendar.badge.checkmark"
                        )
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.vertical, 12)
                    }
                    .disabled(store.isMutating || detail.calendarEntryId != nil)
                    .accessibilityIdentifier("discover-activity-add-calendar")

                    Divider()
                }

                if detail.activity.viewerSignupStatus == "GOING" {
                    Button(role: .destructive) {
                        Task { await store.setSignup(false, activityID: activityID, using: session) }
                    } label: {
                        Label("Cancel signup", systemImage: "person.badge.minus")
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(.vertical, 12)
                    }
                    .disabled(store.isMutating)
                    .accessibilityIdentifier("discover-activity-cancel-signup")
                } else {
                    Button {
                        Task { await store.setSignup(true, activityID: activityID, using: session) }
                    } label: {
                        Label("Join activity", systemImage: "person.badge.plus")
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(.vertical, 12)
                    }
                    .disabled(store.isMutating || detail.activity.phase != "bookable")
                    .accessibilityIdentifier("discover-activity-join")
                }
            }
        }
        .padding(.horizontal, 16)
        .background(SideSeatTheme.surface, in: RoundedRectangle(cornerRadius: SideSeatTheme.controlRadius, style: .continuous))
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
            return "\(activity.goingCount)/\(capacity) going"
        }
        return "\(activity.goingCount) going"
    }

    private func canClose(_ activity: NativeDiscoverActivity) -> Bool {
        activity.phase == "bookable" || activity.phase == "full"
    }

    private func canContactOrganizer(_ activity: NativeDiscoverActivity) -> Bool {
        !activity.isOrganizer && activity.phase != "canceled" && activity.phase != "expired"
    }

    private func canAddToCalendar(_ detail: NativeDiscoverActivityDetail) -> Bool {
        !detail.activity.isOrganizer
            && (detail.activity.viewerSignupStatus == "GOING" || detail.calendarEntryId != nil)
    }
}
