import SwiftUI

struct SavedPostsView: View {
    @Environment(SessionStore.self) private var session
    @Environment(RouterPath.self) private var router
    @State private var store = SavedPostsStore()

    var body: some View {
        List {
            if let issue = store.issue, store.posts == nil {
                ContentUnavailableView {
                    Label("Could not load saved posts", systemImage: "wifi.exclamationmark")
                } description: {
                    Text(issue)
                } actions: {
                    Button("Try again") { Task { await store.load(using: session) } }
                }
                .ssListPageStateRow()
            } else if store.posts == nil {
                SSLoadingState("Loading saved posts")
                    .frame(maxWidth: .infinity)
                    .ssListPageStateRow()
            } else if store.posts?.isEmpty == true {
                ContentUnavailableView {
                    Label("No saved posts", systemImage: "heart")
                } description: {
                    Text("Posts you save in Discover will appear here.")
                }
                .ssListPageStateRow()
                .accessibilityIdentifier("saved-posts-empty")
            } else {
                Section {
                    ForEach(store.posts ?? []) { post in
                        savedPostRow(post)
                    }
                } footer: {
                    Text("Swipe left or tap the heart to remove a saved post.")
                }
            }

            if let issue = store.issue, store.posts != nil {
                Text(issue)
                    .font(.footnote)
                    .foregroundStyle(SideSeatTheme.danger)
            }
        }
        .listStyle(.insetGrouped)
        .navigationTitle("Saved posts")
        .navigationBarTitleDisplayMode(.large)
        .refreshable { await store.load(using: session) }
        .task { await store.load(using: session) }
        .onChange(of: router.path) { previousPath, path in
            guard previousPath.count > path.count, path.last == .savedPosts else { return }
            Task { await store.load(using: session) }
        }
        .accessibilityIdentifier("saved-posts-list")
    }

    @ViewBuilder
    private func savedPostRow(_ post: NativeDiscoverBuddyPost) -> some View {
        HStack(spacing: SideSeatTheme.spaceSM) {
            NavigationLink(value: AppRoute.discoverPost(postID: post.id)) {
                SavedPostRow(post: post)
            }
            .accessibilityIdentifier("saved-post-\(post.id)")

            Button {
                Task { _ = await store.remove(postID: post.id, using: session) }
            } label: {
                if store.mutatingID == post.id {
                    ProgressView()
                        .controlSize(.small)
                        .frame(width: 44, height: 44)
                } else {
                    Image(systemName: "heart.fill")
                        .font(.body.weight(.semibold))
                        .foregroundStyle(SideSeatTheme.HubTint.savedPosts)
                        .frame(width: 44, height: 44)
                }
            }
            .buttonStyle(SSPressButtonStyle())
            .disabled(store.mutatingID != nil)
            .accessibilityLabel("Remove from saved posts")
            .accessibilityIdentifier("saved-post-remove-\(post.id)")
        }
        .swipeActions(edge: .trailing, allowsFullSwipe: true) {
            Button(role: .destructive) {
                Task { _ = await store.remove(postID: post.id, using: session) }
            } label: {
                Label("Remove", systemImage: "heart.slash")
            }
        }
    }
}

private struct SavedPostRow: View {
    let post: NativeDiscoverBuddyPost

    var body: some View {
        HStack(alignment: .top, spacing: SideSeatTheme.spaceMD) {
            thumbnail

            VStack(alignment: .leading, spacing: 5) {
                Text(post.title)
                    .font(.body.weight(.semibold))
                    .foregroundStyle(SideSeatTheme.textPrimary)
                    .lineLimit(2)

                HStack(spacing: 5) {
                    Text(post.author.displayName)
                    if post.author.verifiedStudent {
                        VerifiedSchoolMark(school: post.author.school)
                    }
                }
                .font(.caption.weight(.medium))
                .foregroundStyle(SideSeatTheme.textSecondaryStrong)

                if !detailLabel.isEmpty {
                    Text(detailLabel)
                        .font(.footnote)
                        .foregroundStyle(SideSeatTheme.textSecondary)
                        .lineLimit(2)
                }
            }

            Spacer(minLength: 0)
        }
        .padding(.vertical, 4)
    }

    @ViewBuilder
    private var thumbnail: some View {
        if let source = post.imageUrls.first {
            DiscoverMediaImage(source: source)
                .frame(width: 60, height: 60)
                .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
        } else {
            ZStack {
                RoundedRectangle(cornerRadius: 8, style: .continuous)
                    .fill(SideSeatTheme.HubTint.savedPosts.opacity(0.12))
                Image(systemName: "person.2.fill")
                    .font(.body.weight(.semibold))
                    .foregroundStyle(SideSeatTheme.HubTint.savedPosts)
            }
            .frame(width: 60, height: 60)
        }
    }

    private var detailLabel: String {
        [
            post.startDate?.formatted(date: .abbreviated, time: .shortened),
            post.location,
            post.commentCount > 0 ? AppLocalization.string( "\(post.commentCount) comments") : nil,
        ]
        .compactMap { value in
            guard let value else { return nil }
            let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
            return trimmed.isEmpty ? nil : trimmed
        }
        .joined(separator: " · ")
    }
}

struct MyPostsView: View {
    @Environment(SessionStore.self) private var session
    @Environment(RouterPath.self) private var router
    @State private var store = MyPostsStore()
    @State private var pendingAction: MyPublishedAction?
    @State private var composer: MyPublishedComposer?

    var body: some View {
        List {
            if let issue = store.issue, store.payload == nil {
                ContentUnavailableView {
                    Label("Could not load your posts", systemImage: "wifi.exclamationmark")
                } description: {
                    Text(issue)
                } actions: {
                    Button("Try again") { Task { await store.load(using: session) } }
                }
                .ssListPageStateRow()
            } else if store.payload == nil {
                SSLoadingState("Loading your posts")
                    .frame(maxWidth: .infinity)
                    .ssListPageStateRow()
            } else if allItems.isEmpty {
                ContentUnavailableView {
                    Label("No posts yet", systemImage: "rectangle.stack")
                } description: {
                    Text("Buddy posts and activities you publish in Discover will appear here.")
                }
                .ssListPageStateRow()
            } else {
                if !liveItems.isEmpty {
                    Section("Live") {
                        ForEach(liveItems) { item in
                            itemRow(item)
                        }
                    }
                }

                if !pastItems.isEmpty {
                    Section("Closed & past") {
                        ForEach(pastItems) { item in
                            itemRow(item)
                        }
                    }
                }
            }

            if let issue = store.issue, store.payload != nil {
                Text(issue)
                    .font(.footnote)
                    .foregroundStyle(SideSeatTheme.danger)
            }
        }
        .listStyle(.insetGrouped)
        .navigationTitle("My posts")
        .navigationBarTitleDisplayMode(.large)
        .refreshable { await store.load(using: session) }
        .ssActionPrompt(
            isPresented: Binding(
                get: { pendingAction != nil },
                set: { if !$0 { pendingAction = nil } }
            ),
            title: pendingAction?.confirmationTitle ?? "",
            message: pendingAction?.message,
            systemImage: pendingAction?.systemImage ?? "questionmark",
            tint: SideSeatTheme.danger,
            dismissOnTapOutside: true,
            onDismiss: { pendingAction = nil },
            accessibilityIdentifier: pendingAction.map { "my-post-\($0.id)-prompt" }
                ?? "my-post-action-prompt"
        ) {
            guard let action = pendingAction else { return [] }
            return [
                SSActionPromptAction(
                    id: "my-post-\(action.id)-cancel",
                    title: AppLocalization.string("Cancel"),
                    role: .cancel,
                    perform: {}
                ),
                SSActionPromptAction(
                    id: "my-post-\(action.id)-confirm",
                    title: action.buttonTitle,
                    systemImage: action.systemImage,
                    role: .destructive,
                    perform: {
                        Task { await perform(action) }
                    }
                ),
            ]
        }
        .task { await store.load(using: session) }
        .sheet(item: $composer) { composer in
            NavigationStack {
                switch composer {
                case .edit(let post):
                    DiscoverPlanCreateView(
                        editingPost: post,
                        onClose: {
                            await store.closePost(postID: post.id, using: session)
                        }
                    ) { _ in
                        self.composer = nil
                        await store.load(using: session)
                    }
                case .repost(let post):
                    DiscoverPlanCreateView(repostingPost: post) { postID in
                        self.composer = nil
                        await store.load(using: session)
                        router.navigate(to: .discoverPost(postID: postID))
                    }
                }
            }
            .presentationDetents([.large])
            .presentationDragIndicator(.visible)
            .presentationCornerRadius(SideSeatTheme.cardRadius)
            .presentationBackground(SideSeatTheme.bgGrouped)
        }
        .accessibilityIdentifier("my-posts-list")
    }

    @ViewBuilder
    private func itemRow(_ item: MyPublishedItem) -> some View {
        HStack(spacing: SideSeatTheme.spaceSM) {
            HStack(spacing: SideSeatTheme.spaceSM) {
                MyPublishedRow(item: item, isWorking: store.mutatingID == item.id)
                Image(systemName: "chevron.right")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(SideSeatTheme.textSecondary)
                    .accessibilityHidden(true)
            }
            .contentShape(Rectangle())
            .accessibilityElement(children: .combine)
            .accessibilityAddTraits(.isButton)
            .accessibilityAction { router.navigate(to: item.route) }
            .accessibilityIdentifier("my-post-\(item.id)")
            .ssTapOrLongPressActionMenu(
                isEnabled: !contextActions(for: item).isEmpty,
                title: item.title,
                actions: { contextActions(for: item) },
                onTap: { router.navigate(to: item.route) }
            )
            if let post = item.editablePost {
                Button {
                    composer = .edit(post)
                } label: {
                    Image(systemName: "pencil")
                        .font(.subheadline.weight(.semibold))
                        .frame(width: 44, height: 44)
                }
                .buttonStyle(SSPressButtonStyle())
                .foregroundStyle(SideSeatTheme.textPrimary)
                .accessibilityLabel("Edit buddy post")
                .accessibilityIdentifier("my-post-edit-\(post.id)")
            } else if let post = item.repostablePost {
                Button {
                    composer = .repost(post)
                } label: {
                    Image(systemName: "arrow.clockwise")
                        .font(.subheadline.weight(.semibold))
                        .frame(width: 44, height: 44)
                }
                .buttonStyle(SSPressButtonStyle())
                .foregroundStyle(SideSeatTheme.textPrimary)
                .accessibilityLabel("Repost buddy post")
                .accessibilityIdentifier("my-post-repost-\(post.id)")
            }
        }
        .swipeActions(edge: .trailing, allowsFullSwipe: false) {
            if item.canClose {
                Button {
                    pendingAction = item.closeAction
                } label: {
                    Label("Close", systemImage: "lock")
                }
                .tint(SideSeatTheme.warning)
            }
        }
        .swipeActions(edge: .leading, allowsFullSwipe: false) {
            if let post = item.editablePost {
                Button {
                    composer = .edit(post)
                } label: {
                    Label("Edit", systemImage: "pencil")
                }
                .tint(SideSeatTheme.HubTint.posts)
            } else if let post = item.repostablePost {
                Button {
                    composer = .repost(post)
                } label: {
                    Label("Repost", systemImage: "arrow.clockwise")
                }
                .tint(SideSeatTheme.HubTint.posts)
            }
        }
        .disabled(store.mutatingID != nil)
    }

    private func contextActions(for item: MyPublishedItem) -> [SSLongPressAction] {
        var actions: [SSLongPressAction] = []
        if let post = item.editablePost {
            actions.append(
                SSLongPressAction(
                    id: "my-post-context-edit-\(post.id)",
                    title: AppLocalization.string("Edit"),
                    systemImage: "pencil",
                    perform: { composer = .edit(post) }
                )
            )
        }
        if let post = item.repostablePost {
            actions.append(
                SSLongPressAction(
                    id: "my-post-context-repost-\(post.id)",
                    title: AppLocalization.string("Repost"),
                    systemImage: "arrow.clockwise",
                    perform: { composer = .repost(post) }
                )
            )
        }
        if item.canClose {
            actions.append(
                SSLongPressAction(
                    id: "my-post-context-close-\(item.id)",
                    title: AppLocalization.string("Close"),
                    systemImage: "lock",
                    perform: { pendingAction = item.closeAction }
                )
            )
        }
        if let cancelAction = item.cancelAction {
            actions.append(
                SSLongPressAction(
                    id: "my-post-context-cancel-\(item.id)",
                    title: AppLocalization.string("Cancel activity"),
                    systemImage: "xmark.circle",
                    role: .destructive,
                    perform: { pendingAction = cancelAction }
                )
            )
        }
        return actions
    }

    private var allItems: [MyPublishedItem] {
        guard let payload = store.payload else { return [] }
        return (payload.posts.map(MyPublishedItem.post) + payload.activities.map(MyPublishedItem.activity))
            .sorted { $0.sortDate > $1.sortDate }
    }

    private var liveItems: [MyPublishedItem] { allItems.filter(\.isLive) }
    private var pastItems: [MyPublishedItem] { allItems.filter { !$0.isLive } }

    private func perform(_ action: MyPublishedAction) async {
        pendingAction = nil
        switch action {
        case .closePost(let id, _):
            _ = await store.closePost(postID: id, using: session)
        case .closeActivity(let id, _):
            _ = await store.setActivityStatus("CLOSED", activityID: id, using: session)
        case .cancelActivity(let id, _):
            _ = await store.setActivityStatus("CANCELED", activityID: id, using: session)
        }
    }
}

private enum MyPublishedItem: Identifiable {
    case post(NativeDiscoverBuddyPost)
    case activity(NativeDiscoverActivity)

    var id: String {
        switch self {
        case .post(let post): "post-\(post.id)"
        case .activity(let activity): "activity-\(activity.id)"
        }
    }

    var route: AppRoute {
        switch self {
        case .post(let post): .discoverPost(postID: post.id)
        case .activity(let activity): .activity(activityID: activity.id)
        }
    }

    var title: String {
        switch self {
        case .post(let post): post.title
        case .activity(let activity): activity.title
        }
    }

    var kindLabel: String {
        switch self {
        case .post: AppLocalization.string( "Buddy post")
        case .activity: AppLocalization.string( "Activity")
        }
    }

    var systemImage: String {
        switch self {
        case .post: "person.2.fill"
        case .activity: "calendar.badge.clock"
        }
    }

    var tint: Color {
        switch self {
        case .post: SideSeatTheme.HubTint.posts
        case .activity: SideSeatTheme.HubTint.plans
        }
    }

    var statusLabel: String {
        switch self {
        case .post(let post):
            return BuddyPostDisplay.statusLabel(post)
        case .activity(let activity):
            return DiscoverActivityDisplay.status(activity).label
        }
    }

    var statusColor: Color {
        let tone: DiscoverStatusPresentation.Tone
        switch self {
        case .post(let post):
            tone = BuddyPostDisplay.status(post).tone
        case .activity(let activity):
            tone = DiscoverActivityDisplay.status(activity).tone
        }
        switch tone {
        case .success: return SideSeatTheme.success
        case .warning: return SideSeatTheme.warning
        case .danger: return SideSeatTheme.danger
        case .neutral: return SideSeatTheme.textSecondary
        }
    }

    var detailLabel: String {
        switch self {
        case .post(let post):
            let date = post.startDate ?? (try? Date(post.createdAt, strategy: .iso8601))
            return cleanParts([
                date?.formatted(date: .abbreviated, time: post.startDate == nil ? .omitted : .shortened),
                post.location,
                post.interestedCount > 0 ? AppLocalization.string( "\(post.interestedCount) interested") : nil,
            ])
        case .activity(let activity):
            return cleanParts([
                activity.startDate?.formatted(date: .abbreviated, time: .shortened),
                activity.location,
                AppLocalization.string( "\(activity.goingCount) going"),
            ])
        }
    }

    var sortDate: Date {
        switch self {
        case .post(let post):
            return post.startDate ?? (try? Date(post.createdAt, strategy: .iso8601)) ?? .distantPast
        case .activity(let activity):
            return activity.startDate ?? .distantPast
        }
    }

    var isLive: Bool {
        switch self {
        case .post(let post):
            return BuddyPostDisplay.status(post).isOpen
        case .activity(let activity):
            let phase = activity.phase.lowercased()
            return phase == "bookable" || phase == "full"
        }
    }

    var canClose: Bool { isLive }

    var editablePost: NativeDiscoverBuddyPost? {
        guard isLive, case .post(let post) = self else { return nil }
        return post
    }

    var repostablePost: NativeDiscoverBuddyPost? {
        guard case .post(let post) = self,
              post.status.uppercased() == "CLOSED",
              post.closureReason?.uppercased() == "SCHOOL_CHANGED"
        else { return nil }
        return post
    }

    var statusExplanation: String? {
        guard case .post(let post) = self,
              post.status.uppercased() == "CLOSED"
        else { return nil }
        switch post.closureReason?.uppercased() {
        case "SCHOOL_CHANGED":
            return AppLocalization.string(
                "Closed because your school changed. Review visibility and courses before reposting."
            )
        case "AUTHOR_CLOSED":
            return AppLocalization.string( "Closed by you.")
        default:
            return nil
        }
    }

    var closeAction: MyPublishedAction {
        switch self {
        case .post(let post): .closePost(id: post.id, title: post.title)
        case .activity(let activity): .closeActivity(id: activity.id, title: activity.title)
        }
    }

    var cancelAction: MyPublishedAction? {
        guard case .activity(let activity) = self,
              activity.phase != "expired",
              activity.phase != "canceled"
        else { return nil }
        return .cancelActivity(id: activity.id, title: activity.title)
    }

    private func cleanParts(_ parts: [String?]) -> String {
        parts.compactMap { value in
            guard let value else { return nil }
            let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
            return trimmed.isEmpty ? nil : trimmed
        }
        .joined(separator: " · ")
    }
}

private enum MyPublishedAction: Identifiable {
    case closePost(id: String, title: String)
    case closeActivity(id: String, title: String)
    case cancelActivity(id: String, title: String)

    var id: String {
        switch self {
        case .closePost(let id, _): "close-post-\(id)"
        case .closeActivity(let id, _): "close-activity-\(id)"
        case .cancelActivity(let id, _): "cancel-activity-\(id)"
        }
    }

    var title: String {
        switch self {
        case .closePost(_, let title), .closeActivity(_, let title), .cancelActivity(_, let title): title
        }
    }

    var confirmationTitle: String {
        switch self {
        case .closePost: AppLocalization.string( "Close this buddy post?")
        case .closeActivity: AppLocalization.string( "Close sign-ups?")
        case .cancelActivity: AppLocalization.string( "Cancel this activity?")
        }
    }

    var buttonTitle: String {
        switch self {
        case .closePost: AppLocalization.string( "Close buddy post")
        case .closeActivity: AppLocalization.string( "Close sign-ups")
        case .cancelActivity: AppLocalization.string( "Cancel activity")
        }
    }

    var systemImage: String {
        switch self {
        case .closePost, .closeActivity: "lock"
        case .cancelActivity: "xmark.circle"
        }
    }

    var message: String {
        switch self {
        case .closePost:
            AppLocalization.string( "\(title) will move to Past and stop accepting responses.")
        case .closeActivity:
            AppLocalization.string( "\(title) will remain visible, but new sign-ups will stop.")
        case .cancelActivity:
            AppLocalization.string( "\(title) will be marked as canceled for everyone.")
        }
    }
}

private enum MyPublishedComposer: Identifiable {
    case edit(NativeDiscoverBuddyPost)
    case repost(NativeDiscoverBuddyPost)

    var id: String {
        switch self {
        case .edit(let post): "edit-\(post.id)"
        case .repost(let post): "repost-\(post.id)"
        }
    }
}

private struct MyPublishedRow: View {
    let item: MyPublishedItem
    let isWorking: Bool

    var body: some View {
        HStack(alignment: .top, spacing: SideSeatTheme.spaceMD) {
            ZStack {
                RoundedRectangle(cornerRadius: 10, style: .continuous)
                    .fill(item.tint.opacity(0.12))
                Image(systemName: item.systemImage)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(item.tint)
            }
            .frame(width: 40, height: 40)

            VStack(alignment: .leading, spacing: 5) {
                Text(item.title)
                    .font(.body.weight(.semibold))
                    .foregroundStyle(SideSeatTheme.textPrimary)
                    .lineLimit(2)

                HStack(spacing: 6) {
                    Text(item.kindLabel)
                    Text(item.statusLabel)
                        .foregroundStyle(item.statusColor)
                }
                .font(.caption.weight(.medium))
                .foregroundStyle(SideSeatTheme.textSecondary)

                if !item.detailLabel.isEmpty {
                    Text(item.detailLabel)
                        .font(.footnote)
                        .foregroundStyle(SideSeatTheme.textSecondary)
                        .lineLimit(2)
                }

                if let explanation = item.statusExplanation {
                    Label(explanation, systemImage: "info.circle.fill")
                        .font(.footnote)
                        .foregroundStyle(item.statusColor)
                        .lineLimit(3)
                }
            }

            Spacer(minLength: 4)
            if isWorking {
                ProgressView().controlSize(.small)
            }
        }
        .padding(.vertical, 4)
    }
}
