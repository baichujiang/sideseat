import PhotosUI
import SwiftUI
import UIKit
import UniformTypeIdentifiers

struct MeRootView: View {
    @Environment(SessionStore.self) private var session
    @Environment(RouterPath.self) private var router
    @State private var store = CurrentProfileStore()
    @State private var cityPreference = DiscoverCityPreferenceStore.shared
    @State private var editingProfile: NativeCurrentProfile?
    @State private var editingUsername: NativeCurrentProfile?
    @State private var verifyingProfile: NativeCurrentProfile?
    @State private var selectedAvatarPhoto: PhotosPickerItem?
    @State private var isPreparingAvatar = false
    @State private var avatarIssue: String?
    @State private var showAppShare = false

    var body: some View {
        Group {
            if let profile = store.profile {
                ScrollView {
                    VStack(alignment: .leading, spacing: 18) {
                        MeHeroCard(
                            profile: profile,
                            isPreparingAvatar: isPreparingAvatar || selectedAvatarPhoto != nil,
                            avatarIssue: avatarIssue,
                            selectedAvatarPhoto: $selectedAvatarPhoto,
                            onEditProfile: { editingProfile = profile },
                            onVerifySchool: { verifyingProfile = profile }
                        )

                        if !profile.languages.isEmpty {
                            MeLanguagesStrip(languages: profile.languages)
                        }

                        SSGroupedSection(title: String(localized: "My hub")) {
                            SSListRow(
                                title: String(localized: "My courses"),
                                subtitle: String(localized: "Classes, classmates, and course chats"),
                                systemImage: "book.fill",
                                tint: SideSeatTheme.HubTint.courses,
                                accessibilityID: "me-courses"
                            ) {
                                router.navigate(to: .courses)
                            }
                            SSListRow(
                                title: String(localized: "My plans"),
                                subtitle: String(localized: "Invites and upcoming meetups"),
                                systemImage: "calendar",
                                tint: SideSeatTheme.HubTint.plans,
                                accessibilityID: "me-plans"
                            ) {
                                router.navigate(to: .plans)
                            }
                            SSListRow(
                                title: String(localized: "My posts"),
                                subtitle: String(localized: "Manage plans you've published"),
                                systemImage: "rectangle.stack.fill",
                                tint: SideSeatTheme.HubTint.posts,
                                accessibilityID: "me-posts"
                            ) {
                                router.navigate(to: .myPosts)
                            }
                            SSListRow(
                                title: String(localized: "Contacts"),
                                subtitle: String(localized: "People you've connected with"),
                                systemImage: "person.2.fill",
                                tint: SideSeatTheme.HubTint.contacts,
                                showDivider: false,
                                accessibilityID: "me-contacts"
                            ) {
                                router.navigate(to: .contacts)
                            }
                        }

                        SSGroupedSection(title: String(localized: "Profile")) {
                            SSListRow(
                                title: String(localized: "Username"),
                                subtitle: "@\(profile.username)",
                                systemImage: "at",
                                tint: SideSeatTheme.HubTint.username,
                                accessibilityID: "profile-change-username"
                            ) {
                                editingUsername = profile
                            }
                            .disabled(!profile.canChangeUsernameNow)

                            MePrivacySummaryRows(privacy: profile.privacy)
                        }

                        SSGroupedSection(title: String(localized: "More")) {
                            SSListRow(
                                title: String(localized: "Share SideSeat"),
                                subtitle: String(localized: "Invite friends with a share card"),
                                systemImage: "square.and.arrow.up.fill",
                                tint: SideSeatTheme.rose,
                                accessibilityID: "me-share-sideseat"
                            ) {
                                showAppShare = true
                            }
                            SSListRow(
                                title: String(localized: "Settings"),
                                subtitle: settingsSubtitle(blocked: profile.counts.blocked),
                                systemImage: "gearshape.fill",
                                tint: SideSeatTheme.HubTint.settings,
                                accessibilityID: "me-settings"
                            ) {
                                router.navigate(to: .settings)
                            }
                            MeCityRow(
                                city: cityPreference.selectedCity,
                                cities: cityPreference.servedCities,
                                onSelect: { cityPreference.select($0) }
                            )
                        }

                        Button(role: .destructive) {
                            Task { await session.logout() }
                        } label: {
                            Text("Log out")
                                .font(.body.weight(.semibold))
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, 14)
                        }
                        .buttonStyle(.plain)
                        .background(
                            RoundedRectangle(cornerRadius: SideSeatTheme.controlRadius, style: .continuous)
                                .fill(SideSeatTheme.surface)
                        )
                        .disabled(session.isWorking)
                        .accessibilityIdentifier("logout")
                        .padding(.top, 4)
                    }
                    .padding(.horizontal, 16)
                    .padding(.top, 6)
                    .padding(.bottom, 28)
                }
                .background(SideSeatTheme.bgGrouped.ignoresSafeArea())
                .refreshable {
                    await cityPreference.refreshConfig(using: session)
                    await store.load(using: session)
                }
                .accessibilityIdentifier("me-profile")
            } else if store.isLoading {
                SSLoadingState("Loading profile")
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                ContentUnavailableView {
                    Label("Profile unavailable", systemImage: "person.crop.circle.badge.exclamationmark")
                } description: {
                    Text(store.issue ?? String(localized: "Your profile could not be loaded."))
                } actions: {
                    Button("Try again") { Task { await store.load(using: session) } }
                }
            }
        }
        .ssRootNavigationTitle("Me")
        .sheet(item: $editingProfile) { profile in
            ProfileEditSheet(profile: profile) { request in
                await store.save(request, using: session)
            }
        }
        .sheet(item: $editingUsername) { profile in
            ProfileUsernameSheet(profile: profile) { username in
                if await store.updateUsername(username, using: session) {
                    return nil
                }
                return store.issue ?? String(localized: "The username could not be saved.")
            }
        }
        .sheet(item: $verifyingProfile) { profile in
            StudentVerificationSheet(profile: profile) { email in
                let result = await store.requestStudentVerification(email: email, using: session)
                if result != nil {
                    await store.load(using: session)
                }
                return result
            } onManualReview: { proof, email in
                let result = await store.submitStudentProof(proof, email: email, using: session)
                if result != nil {
                    await store.load(using: session)
                }
                return result
            } onRefresh: {
                await store.load(using: session)
            }
        }
        .sheet(isPresented: $showAppShare) {
            SideSeatAppSharePreview()
        }
        .onChange(of: selectedAvatarPhoto) { _, item in
            Task { await uploadAvatar(from: item) }
        }
        .task {
            await cityPreference.refreshConfig(using: session)
            await store.load(using: session)
        }
    }

    private func settingsSubtitle(blocked: Int) -> String {
        if blocked <= 0 {
            return String(localized: "Language, support, and account")
        }
        if blocked == 1 {
            return String(localized: "Language, 1 blocked user, account")
        }
        return String(format: String(localized: "Language, %lld blocked users, account"), Int64(blocked))
    }

    private func blockedSubtitle(count: Int) -> String {
        if count <= 0 {
            return String(localized: "No one blocked yet")
        }
        if count == 1 {
            return String(localized: "1 person blocked")
        }
        return String(format: String(localized: "%lld people blocked"), Int64(count))
    }

    private func uploadAvatar(from item: PhotosPickerItem?) async {
        guard let item else { return }
        isPreparingAvatar = true
        avatarIssue = nil
        defer {
            isPreparingAvatar = false
            selectedAvatarPhoto = nil
        }

        do {
            guard let data = try await item.loadTransferable(type: Data.self),
                  let draft = ProfileAvatarPreprocessor.makeDraft(from: data)
            else {
                avatarIssue = String(localized: "That photo could not be read.")
                return
            }
            if !(await store.uploadAvatar(draft, using: session)) {
                avatarIssue = store.issue ?? String(localized: "The profile photo could not be uploaded.")
            }
        } catch {
            avatarIssue = String(localized: "That photo could not be read.")
        }
    }

}

struct MyPostsView: View {
    @Environment(SessionStore.self) private var session
    @State private var store = MyPostsStore()
    @State private var pendingAction: MyPublishedAction?
    @State private var editingPost: NativeDiscoverBuddyPost?

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
            } else if store.isLoading, store.payload == nil {
                SSLoadingState("Loading your posts")
                    .frame(maxWidth: .infinity)
                    .ssListPageStateRow()
            } else if allItems.isEmpty {
                ContentUnavailableView {
                    Label("No posts yet", systemImage: "rectangle.stack")
                } description: {
                    Text("Plans you publish in Discover will appear here.")
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
                    Section("Past") {
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
        .confirmationDialog(
            pendingAction?.confirmationTitle ?? "",
            isPresented: Binding(
                get: { pendingAction != nil },
                set: { if !$0 { pendingAction = nil } }
            ),
            titleVisibility: .visible
        ) {
            if let pendingAction {
                Button(pendingAction.buttonTitle, role: .destructive) {
                    Task { await perform(pendingAction) }
                }
            }
            Button("Cancel", role: .cancel) { pendingAction = nil }
        } message: {
            if let pendingAction {
                Text(pendingAction.message)
            }
        }
        .task { await store.load(using: session) }
        .sheet(item: $editingPost) { post in
            NavigationStack {
                DiscoverPlanCreateView(editingPost: post) {
                    editingPost = nil
                    await store.load(using: session)
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
            NavigationLink(value: item.route) {
                MyPublishedRow(item: item, isWorking: store.mutatingID == item.id)
            }
            .accessibilityIdentifier("my-post-\(item.id)")
            if let post = item.editablePost {
                Button {
                    editingPost = post
                } label: {
                    Image(systemName: "pencil")
                        .font(.subheadline.weight(.semibold))
                        .frame(width: 32, height: 32)
                }
                .buttonStyle(.borderless)
                .foregroundStyle(SideSeatTheme.accent)
                .accessibilityLabel("Edit plan")
                .accessibilityIdentifier("my-post-edit-\(post.id)")
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
                    editingPost = post
                } label: {
                    Label("Edit", systemImage: "pencil")
                }
                .tint(SideSeatTheme.accent)
            }
        }
        .contextMenu {
            if let post = item.editablePost {
                Button {
                    editingPost = post
                } label: {
                    Label("Edit", systemImage: "pencil")
                }
            }
            if item.canClose {
                Button {
                    pendingAction = item.closeAction
                } label: {
                    Label("Close", systemImage: "lock")
                }
            }
            if let cancelAction = item.cancelAction {
                Button(role: .destructive) {
                    pendingAction = cancelAction
                } label: {
                    Label("Cancel activity", systemImage: "xmark.circle")
                }
            }
        }
        .disabled(store.mutatingID != nil)
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
        case .post: String(localized: "Plan")
        case .activity: String(localized: "Activity")
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
            return BuddyPostDisplay.statusLabel(post.status)
        case .activity(let activity):
            switch activity.phase {
            case "bookable": return String(localized: "Open sign-ups")
            case "full": return String(localized: "Full")
            case "closed": return String(localized: "Closed")
            case "canceled": return String(localized: "Canceled")
            default: return String(localized: "Ended")
            }
        }
    }

    var statusColor: Color {
        if isLive { return SideSeatTheme.success }
        if case .activity(let activity) = self, activity.phase == "canceled" {
            return SideSeatTheme.danger
        }
        return SideSeatTheme.textSecondary
    }

    var detailLabel: String {
        switch self {
        case .post(let post):
            let date = post.startDate ?? (try? Date(post.createdAt, strategy: .iso8601))
            return cleanParts([
                date?.formatted(date: .abbreviated, time: post.startDate == nil ? .omitted : .shortened),
                post.location,
                post.interestedCount > 0 ? String(localized: "\(post.interestedCount) interested") : nil,
            ])
        case .activity(let activity):
            return cleanParts([
                activity.startDate?.formatted(date: .abbreviated, time: .shortened),
                activity.location,
                String(localized: "\(activity.goingCount) going"),
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
            return post.status == "ACTIVE" && (post.expiryDate ?? .distantPast) > Date()
        case .activity(let activity):
            return activity.phase == "bookable" || activity.phase == "full"
        }
    }

    var canClose: Bool { isLive }

    var editablePost: NativeDiscoverBuddyPost? {
        guard isLive, case .post(let post) = self else { return nil }
        return post
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
        case .closePost: String(localized: "Close this plan?")
        case .closeActivity: String(localized: "Close sign-ups?")
        case .cancelActivity: String(localized: "Cancel this activity?")
        }
    }

    var buttonTitle: String {
        switch self {
        case .closePost: String(localized: "Close plan")
        case .closeActivity: String(localized: "Close sign-ups")
        case .cancelActivity: String(localized: "Cancel activity")
        }
    }

    var message: String {
        switch self {
        case .closePost:
            String(localized: "\(title) will move to Past and stop accepting responses.")
        case .closeActivity:
            String(localized: "\(title) will remain visible, but new sign-ups will stop.")
        case .cancelActivity:
            String(localized: "\(title) will be marked as canceled for everyone.")
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
            }

            Spacer(minLength: 4)
            if isWorking {
                ProgressView().controlSize(.small)
            }
        }
        .padding(.vertical, 4)
    }
}

struct PublicProfileView: View {
    @Environment(SessionStore.self) private var session
    @Environment(RouterPath.self) private var router
    let userID: String
    @State private var store = PublicProfileStore()
    @State private var openConversation = OpenConversationStore()

    var body: some View {
        Group {
            if let payload = store.profile {
                List {
                    Section {
                        ProfileHeader(
                            displayName: payload.profile.displayName,
                            username: payload.profile.username,
                            avatarUrl: payload.profile.avatarUrl,
                            tagline: payload.profile.tagline,
                            schoolSummary: payload.profile.schoolSummary,
                            verifiedStudent: payload.profile.verifiedStudent,
                            verificationStatus: payload.profile.studentVerificationStatus
                        )
                        if let metVia = payload.metVia {
                            Label(metVia, systemImage: "link")
                                .font(.footnote)
                                .foregroundStyle(.secondary)
                        }
                    }

                    ProfileDetailsSection(
                        tagline: payload.profile.tagline,
                        languages: payload.profile.languages
                    )

                    Section("Courses") {
                        if payload.peerCourses.isEmpty {
                            Text("No courses shown")
                                .foregroundStyle(.secondary)
                        } else {
                            ForEach(payload.peerCourses) { course in
                                Label(course.code ?? course.name, systemImage: "book")
                            }
                        }
                        if !payload.sharedCourses.isEmpty {
                            Text(
                                payload.sharedCourses.count == 1
                                    ? String(localized: "\(payload.sharedCourses.count) shared course")
                                    : String(localized: "\(payload.sharedCourses.count) shared courses")
                            )
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    }

                    if payload.viewerCanMessage {
                        Section {
                            Button {
                                Task { await openChat(peerID: payload.profile.id) }
                            } label: {
                                if openConversation.isOpening {
                                    ProgressView()
                                        .ssNeutralProgressTint()
                                } else {
                                    Label(
                                        payload.connectionId == nil
                                            ? String(localized: "Message")
                                            : String(localized: "Open chat"),
                                        systemImage: "message"
                                    )
                                }
                            }
                            .disabled(openConversation.isOpening)
                            .accessibilityIdentifier("public-profile-message")

                            if let issue = openConversation.issue {
                                Text(issue)
                                    .font(.footnote)
                                    .foregroundStyle(SideSeatTheme.danger)
                                    .accessibilityIdentifier("public-profile-message-error")
                            }
                        }
                    }
                }
                .accessibilityIdentifier("public-profile")
            } else if store.isLoading {
                SSLoadingState("Loading profile")
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                ContentUnavailableView {
                    Label("Profile unavailable", systemImage: "person.crop.circle.badge.exclamationmark")
                } description: {
                    Text(store.issue ?? String(localized: "This profile is not available."))
                } actions: {
                    Button("Try again") { Task { await load() } }
                }
            }
        }
        .navigationTitle("Profile")
        .navigationBarTitleDisplayMode(.inline)
        .task { await load() }
    }

    private func load() async {
        await store.load(userID: userID, using: session)
    }

    private func openChat(peerID: String) async {
        guard let connectionID = await openConversation.open(peerID: peerID, using: session) else {
            return
        }
        if let current = store.profile, current.connectionId == nil {
            store.applyOpenedConnection(connectionID)
        }
        router.navigate(to: .directChat(connectionID: connectionID))
    }
}

private struct ProfileUsernameSection: View {
    let profile: NativeCurrentProfile
    let onEdit: () -> Void

    var body: some View {
        Section {
            LabeledContent("Username") {
                Text("@\(profile.username)")
                    .font(.body.monospaced())
                    .foregroundStyle(.secondary)
            }
            Button {
                onEdit()
            } label: {
                Label("Change username", systemImage: "at")
            }
            .disabled(!profile.canChangeUsernameNow)
            .accessibilityIdentifier("profile-change-username")
        } header: {
            Text("Account")
        } footer: {
            if let nextAllowedAt = profile.usernameNextAllowedAt, !profile.canChangeUsernameNow {
                Text(
                    String(
                        localized: "Available \(nextAllowedAt.formatted(date: .abbreviated, time: .shortened))."
                    )
                )
            } else {
                Text("Used for sign in and profile lookup.")
            }
        }
    }
}

private struct ProfileUsernameSheet: View {
    @Environment(\.dismiss) private var dismiss
    let profile: NativeCurrentProfile
    let onSave: (String) async -> String?

    @State private var username: String
    @State private var isSubmitting = false
    @State private var issue: String?

    init(profile: NativeCurrentProfile, onSave: @escaping (String) async -> String?) {
        self.profile = profile
        self.onSave = onSave
        _username = State(initialValue: profile.username)
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Username", text: $username)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .font(.body.monospaced())
                        .accessibilityIdentifier("profile-username-field")
                } footer: {
                    Text("2-32 letters, numbers, _ or -.")
                }

                if let nextAllowedAt = profile.usernameNextAllowedAt, !profile.canChangeUsernameNow {
                    Section {
                        Label(
                            String(
                                localized: "Available \(nextAllowedAt.formatted(date: .abbreviated, time: .shortened))."
                            ),
                            systemImage: "clock"
                        )
                        .foregroundStyle(.secondary)
                    }
                }

                if let issue {
                    Section {
                        Text(issue)
                            .foregroundStyle(SideSeatTheme.danger)
                            .accessibilityIdentifier("profile-username-error")
                    }
                }
            }
            .navigationTitle("Username")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button {
                        Task { await save() }
                    } label: {
                        if isSubmitting {
                            ProgressView()
                                .ssNeutralProgressTint()
                        } else {
                            Text("Save")
                        }
                    }
                    .disabled(!canSave || isSubmitting || !profile.canChangeUsernameNow)
                    .accessibilityIdentifier("profile-username-save")
                }
            }
        }
    }

    private var normalizedUsername: String {
        username.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    }

    private var canSave: Bool {
        let value = normalizedUsername
        guard value != profile.username else { return false }
        guard (2...32).contains(value.count) else { return false }
        return value.range(of: #"^[a-z0-9_-]+$"#, options: .regularExpression) != nil &&
            !value.hasPrefix("guest_")
    }

    private func save() async {
        guard !isSubmitting else { return }
        isSubmitting = true
        defer { isSubmitting = false }
        issue = nil
        if let message = await onSave(normalizedUsername) {
            issue = message
        } else {
            dismiss()
        }
    }
}

private struct ProfileEditSheet: View {
    @Environment(\.dismiss) private var dismiss
    let profile: NativeCurrentProfile
    let onSave: (NativeProfileUpdateRequest) async -> Bool

    @State private var nickname: String
    @State private var bio: String
    @State private var gender: String
    @State private var school: String
    @State private var studentStatus: String
    @State private var degreeLevel: String
    @State private var major: String
    @State private var semester: Int
    @State private var graduationYear: Int
    @State private var wechatHandle: String
    @State private var whatsappHandle: String
    @State private var telegramHandle: String
    @State private var instagramHandle: String
    @State private var contactInfoOptIn: Bool
    @State private var hideFromDiscovery: Bool
    @State private var hideFromCourseMembers: Bool
    @State private var isSubmitting = false
    @State private var issue: String?

    init(
        profile: NativeCurrentProfile,
        onSave: @escaping (NativeProfileUpdateRequest) async -> Bool
    ) {
        self.profile = profile
        self.onSave = onSave
        _nickname = State(initialValue: profile.nickname ?? "")
        _bio = State(initialValue: profile.tagline ?? "")
        _gender = State(initialValue: profile.gender)
        _school = State(initialValue: profile.school ?? "TUM")
        _studentStatus = State(initialValue: profile.studentStatus ?? "CURRENT_STUDENT")
        _degreeLevel = State(initialValue: profile.degreeLevel ?? "BACHELOR")
        _major = State(initialValue: profile.major ?? "")
        _semester = State(initialValue: profile.semester ?? profile.schoolSummary.semester)
        _graduationYear = State(
            initialValue: profile.graduationYear ?? Calendar.current.component(.year, from: Date())
        )
        _wechatHandle = State(initialValue: profile.contacts.wechatHandle ?? "")
        _whatsappHandle = State(initialValue: profile.contacts.whatsappHandle ?? "")
        _telegramHandle = State(initialValue: profile.contacts.telegramHandle ?? "")
        _instagramHandle = State(initialValue: profile.contacts.instagramHandle ?? "")
        _contactInfoOptIn = State(initialValue: profile.privacy.contactInfoOptIn)
        _hideFromDiscovery = State(initialValue: profile.privacy.hideFromDiscovery)
        _hideFromCourseMembers = State(initialValue: profile.privacy.hideFromCourseMembers)
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: SideSeatTheme.spaceXL) {
                    ProfileEditSection(
                        title: String(localized: "Basics"),
                        systemImage: "person.text.rectangle.fill",
                        tint: SideSeatTheme.rose
                    ) {
                        VStack(spacing: SideSeatTheme.spaceLG) {
                            ProfileEditMenuPicker(
                                title: String(localized: "School"),
                                selection: $school,
                                options: [("TUM", "TUM"), ("LMU", "LMU")],
                                accessibilityID: "profile-edit-school"
                            )
                            ProfileEditMenuPicker(
                                title: String(localized: "Student status"),
                                selection: $studentStatus,
                                options: [
                                    ("CURRENT_STUDENT", String(localized: "Current student")),
                                    ("EXCHANGE_STUDENT", String(localized: "Exchange student")),
                                    ("ALUMNI", String(localized: "Alumni"))
                                ],
                                accessibilityID: "profile-edit-student-status"
                            )
                            ProfileEditMenuPicker(
                                title: String(localized: "Degree"),
                                selection: $degreeLevel,
                                options: [
                                    ("BACHELOR", String(localized: "Bachelor")),
                                    ("MASTER", String(localized: "Master")),
                                    ("OTHER", String(localized: "Other"))
                                ],
                                accessibilityID: "profile-edit-degree-level"
                            )
                            ProfileEditTextField(
                                title: String(localized: "Nickname"),
                                text: $nickname,
                                capitalization: .words,
                                autocorrectionDisabled: false,
                                accessibilityID: "profile-edit-nickname"
                            )
                            ProfileEditTaglineField(text: $bio)
                            ProfileEditGenderPicker(selection: $gender)
                        }
                    }

                    ProfileEditSection(
                        title: String(localized: "Study"),
                        systemImage: "graduationcap.fill",
                        tint: SideSeatTheme.HubTint.courses
                    ) {
                        VStack(spacing: SideSeatTheme.spaceLG) {
                            ProfileEditTextField(
                                title: String(localized: "Major"),
                                text: $major,
                                capitalization: .words,
                                autocorrectionDisabled: false,
                                accessibilityID: "profile-edit-major"
                            )
                            if studentStatus == "ALUMNI" {
                                ProfileEditGraduationYearControl(year: $graduationYear)
                            } else {
                                ProfileEditSemesterControl(semester: $semester)
                            }
                        }
                    }

                    ProfileEditSection(
                        title: String(localized: "Contact handles"),
                        systemImage: "bubble.left.and.bubble.right.fill",
                        tint: SideSeatTheme.HubTint.contacts
                    ) {
                        VStack(spacing: SideSeatTheme.spaceLG) {
                            ProfileEditTextField(
                                title: String(localized: "WeChat"),
                                text: $wechatHandle,
                                accessibilityID: "profile-edit-wechat"
                            )
                            ProfileEditTextField(
                                title: String(localized: "WhatsApp"),
                                text: $whatsappHandle,
                                accessibilityID: "profile-edit-whatsapp"
                            )
                            ProfileEditTextField(
                                title: String(localized: "Telegram"),
                                text: $telegramHandle,
                                accessibilityID: "profile-edit-telegram"
                            )
                            ProfileEditTextField(
                                title: String(localized: "Instagram"),
                                text: $instagramHandle,
                                accessibilityID: "profile-edit-instagram"
                            )

                            Divider()

                            ProfileEditToggleRow(
                                title: String(localized: "Allow contact exchange"),
                                subtitle: String(localized: "Handles stay private until you exchange them with a connection."),
                                isOn: $contactInfoOptIn,
                                accessibilityID: "profile-edit-contact-opt-in"
                            )
                        }
                    }

                    ProfileEditSection(
                        title: String(localized: "Privacy"),
                        systemImage: "hand.raised.fill",
                        tint: SideSeatTheme.HubTint.privacyChat
                    ) {
                        VStack(spacing: 0) {
                            ProfileEditToggleRow(
                                title: String(localized: "Hide from Discover"),
                                isOn: $hideFromDiscovery,
                                accessibilityID: "profile-edit-hide-discover"
                            )
                            Divider().padding(.leading, 4)
                            ProfileEditToggleRow(
                                title: String(localized: "Hide from course members"),
                                isOn: $hideFromCourseMembers,
                                accessibilityID: "profile-edit-hide-courses"
                            )
                        }
                    }

                    if let issue {
                        SSFieldMessage(text: issue, accessibilityID: "profile-edit-error")
                    }
                }
                .padding(.horizontal, SideSeatTheme.spaceLG)
                .padding(.top, SideSeatTheme.spaceMD)
                .padding(.bottom, SideSeatTheme.spaceXL)
            }
            .scrollDismissesKeyboard(.interactively)
            .background(SideSeatTheme.bgGrouped.ignoresSafeArea())
            .accessibilityIdentifier("profile-edit")
            .toolbar(.hidden, for: .navigationBar)
            .safeAreaInset(edge: .top, spacing: 0) {
                ProfileEditHeader {
                    dismiss()
                }
            }
            .safeAreaInset(edge: .bottom, spacing: 0) {
                VStack(spacing: 0) {
                    Divider()
                    SSPrimaryButton(
                        title: String(localized: "Save"),
                        isLoading: isSubmitting,
                        fill: .product,
                        accessibilityID: "profile-edit-save"
                    ) {
                        Task { await save() }
                    }
                    .disabled(!canSave || isSubmitting)
                    .padding(.horizontal, SideSeatTheme.spaceLG)
                    .padding(.vertical, SideSeatTheme.spaceMD)
                }
                .background(SideSeatTheme.surface)
            }
        }
    }

    private var canSave: Bool {
        let trimmedNickname = nickname.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmedNickname.count >= 2 && trimmedNickname.count <= 32 &&
            bio.count <= 120 &&
            wechatHandle.count <= 80 &&
            whatsappHandle.count <= 80 &&
            telegramHandle.count <= 80 &&
            instagramHandle.count <= 80
    }

    private func save() async {
        guard !isSubmitting else { return }
        isSubmitting = true
        defer { isSubmitting = false }
        issue = nil
        let request = NativeProfileUpdateRequest(
            nickname: nickname.trimmingCharacters(in: .whitespacesAndNewlines),
            bio: bio.trimmingCharacters(in: .whitespacesAndNewlines),
            gender: gender,
            school: school,
            studentStatus: studentStatus,
            degreeLevel: degreeLevel,
            major: major.trimmingCharacters(in: .whitespacesAndNewlines),
            semester: studentStatus == "ALUMNI" ? nil : semester,
            graduationYear: studentStatus == "ALUMNI" ? graduationYear : nil,
            wechatHandle: wechatHandle.trimmingCharacters(in: .whitespacesAndNewlines),
            whatsappHandle: whatsappHandle.trimmingCharacters(in: .whitespacesAndNewlines),
            telegramHandle: telegramHandle.trimmingCharacters(in: .whitespacesAndNewlines),
            instagramHandle: instagramHandle.trimmingCharacters(in: .whitespacesAndNewlines),
            contactInfoOptIn: contactInfoOptIn,
            hideFromDiscovery: hideFromDiscovery,
            hideFromCourseMembers: hideFromCourseMembers
        )
        if await onSave(request) {
            dismiss()
        } else {
            issue = String(localized: "The profile could not be saved.")
        }
    }
}

private struct ProfileEditMenuPicker: View {
    let title: String
    @Binding var selection: String
    let options: [(value: String, label: String)]
    let accessibilityID: String

    var body: some View {
        VStack(alignment: .leading, spacing: 7) {
            Text(title)
                .font(.caption.weight(.semibold))
                .foregroundStyle(SideSeatTheme.textSecondary)
            Picker(title, selection: $selection) {
                ForEach(options, id: \.value) { option in
                    Text(option.label).tag(option.value)
                }
            }
            .pickerStyle(.menu)
            .frame(maxWidth: .infinity, minHeight: 46, alignment: .leading)
            .padding(.horizontal, 6)
            .background {
                RoundedRectangle(cornerRadius: SideSeatTheme.controlRadius, style: .continuous)
                    .fill(SideSeatTheme.fillTertiary)
            }
            .accessibilityIdentifier(accessibilityID)
        }
    }
}

private struct ProfileEditSection<Content: View>: View {
    let title: String
    let systemImage: String
    let tint: Color
    @ViewBuilder let content: () -> Content

    var body: some View {
        VStack(alignment: .leading, spacing: SideSeatTheme.spaceSM) {
            Label(title, systemImage: systemImage)
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(tint)
                .padding(.horizontal, SideSeatTheme.spaceXS)

            content()
                .padding(SideSeatTheme.spaceLG)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background {
                    RoundedRectangle(cornerRadius: SideSeatTheme.controlRadius, style: .continuous)
                        .fill(SideSeatTheme.surface)
                }
                .overlay {
                    RoundedRectangle(cornerRadius: SideSeatTheme.controlRadius, style: .continuous)
                        .strokeBorder(Color.primary.opacity(0.04), lineWidth: 1)
                }
        }
    }
}

private struct ProfileEditHeader: View {
    let onClose: () -> Void

    var body: some View {
        HStack {
            Button(action: onClose) {
                Image(systemName: "xmark")
                    .font(.body.weight(.semibold))
                    .foregroundStyle(SideSeatTheme.accent)
                    .frame(width: 42, height: 42)
                    .background(Circle().fill(SideSeatTheme.surface))
            }
            .buttonStyle(.plain)
            .accessibilityLabel(String(localized: "Cancel"))

            Spacer()

            Text("Edit profile")
                .font(.title3.weight(.bold))
                .foregroundStyle(SideSeatTheme.textPrimary)

            Spacer()

            Color.clear.frame(width: 42, height: 42)
        }
        .padding(.horizontal, SideSeatTheme.spaceLG)
        .padding(.vertical, SideSeatTheme.spaceSM)
        .background(SideSeatTheme.bgGrouped)
    }
}

private struct ProfileEditTextField: View {
    let title: String
    @Binding var text: String
    var capitalization: TextInputAutocapitalization = .never
    var autocorrectionDisabled = true
    let accessibilityID: String

    var body: some View {
        VStack(alignment: .leading, spacing: 7) {
            Text(title)
                .font(.caption.weight(.semibold))
                .foregroundStyle(SideSeatTheme.textSecondary)
            TextField(title, text: $text)
                .textInputAutocapitalization(capitalization)
                .autocorrectionDisabled(autocorrectionDisabled)
                .padding(.horizontal, 13)
                .frame(minHeight: 46)
                .background {
                    RoundedRectangle(cornerRadius: SideSeatTheme.controlRadius, style: .continuous)
                        .fill(SideSeatTheme.fillTertiary)
                }
                .accessibilityIdentifier(accessibilityID)
        }
    }
}

private struct ProfileEditTaglineField: View {
    @Binding var text: String

    var body: some View {
        VStack(alignment: .leading, spacing: 7) {
            HStack {
                Text("Tagline")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(SideSeatTheme.textSecondary)
                Spacer()
                Text("\(text.count)/120")
                    .font(.caption2.monospacedDigit())
                    .foregroundStyle(text.count > 120 ? SideSeatTheme.danger : SideSeatTheme.textSecondary)
            }

            TextField("Tagline", text: $text, axis: .vertical)
                .lineLimit(2...3)
                .padding(.horizontal, 13)
                .padding(.vertical, 12)
                .background {
                    RoundedRectangle(cornerRadius: SideSeatTheme.controlRadius, style: .continuous)
                        .fill(SideSeatTheme.fillTertiary)
                }
                .accessibilityIdentifier("profile-edit-tagline")
        }
    }
}

private struct ProfileEditGenderPicker: View {
    @Binding var selection: String

    var body: some View {
        VStack(alignment: .leading, spacing: 7) {
            Text("Gender")
                .font(.caption.weight(.semibold))
                .foregroundStyle(SideSeatTheme.textSecondary)
            Picker("Gender", selection: $selection) {
                Text("Male").tag("MALE")
                Text("Female").tag("FEMALE")
                Text("Prefer not to say").tag("PRIVATE")
            }
            .pickerStyle(.segmented)
            .labelsHidden()
            .accessibilityIdentifier("profile-edit-gender")
        }
    }
}

private struct ProfileEditSemesterControl: View {
    @Binding var semester: Int

    var body: some View {
        VStack(alignment: .leading, spacing: 7) {
            Text("Semester")
                .font(.caption.weight(.semibold))
                .foregroundStyle(SideSeatTheme.textSecondary)

            HStack(spacing: SideSeatTheme.spaceMD) {
                semesterButton(systemImage: "minus", enabled: semester > 1) {
                    semester -= 1
                }

                Text("\(semester)")
                    .font(.title3.weight(.semibold).monospacedDigit())
                    .frame(maxWidth: .infinity)
                    .accessibilityIdentifier("profile-edit-semester")

                semesterButton(systemImage: "plus", enabled: semester < 14) {
                    semester += 1
                }
            }
            .padding(6)
            .background {
                RoundedRectangle(cornerRadius: SideSeatTheme.controlRadius, style: .continuous)
                    .fill(SideSeatTheme.fillTertiary)
            }
        }
    }

    private func semesterButton(
        systemImage: String,
        enabled: Bool,
        action: @escaping () -> Void
    ) -> some View {
        Button(action: action) {
            Image(systemName: systemImage)
                .font(.body.weight(.semibold))
                .frame(width: 38, height: 38)
                .background(Circle().fill(SideSeatTheme.surface))
        }
        .buttonStyle(.plain)
        .foregroundStyle(enabled ? SideSeatTheme.accent : SideSeatTheme.textSecondary.opacity(0.4))
        .disabled(!enabled)
        .accessibilityLabel(
            systemImage == "plus"
                ? String(localized: "Increase semester")
                : String(localized: "Decrease semester")
        )
    }
}

private struct ProfileEditGraduationYearControl: View {
    @Binding var year: Int

    private var range: ClosedRange<Int> {
        let current = Calendar.current.component(.year, from: Date())
        return (current - 80)...(current + 1)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 7) {
            Text("Graduation year")
                .font(.caption.weight(.semibold))
                .foregroundStyle(SideSeatTheme.textSecondary)
            Stepper(value: $year, in: range) {
                Text("\(year)")
                    .font(.body.weight(.semibold).monospacedDigit())
            }
            .padding(.horizontal, 12)
            .frame(minHeight: 46)
            .background {
                RoundedRectangle(cornerRadius: SideSeatTheme.controlRadius, style: .continuous)
                    .fill(SideSeatTheme.fillTertiary)
            }
            .accessibilityIdentifier("profile-edit-graduation-year")
        }
    }
}

private struct ProfileEditToggleRow: View {
    let title: String
    var subtitle: String? = nil
    @Binding var isOn: Bool
    let accessibilityID: String

    var body: some View {
        Toggle(isOn: $isOn) {
            VStack(alignment: .leading, spacing: 3) {
                Text(title)
                    .font(.body.weight(.medium))
                if let subtitle {
                    Text(subtitle)
                        .font(.footnote)
                        .foregroundStyle(SideSeatTheme.textSecondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            .padding(.trailing, SideSeatTheme.spaceSM)
        }
        .tint(SideSeatTheme.accent)
        .padding(.vertical, SideSeatTheme.spaceXS)
        .accessibilityIdentifier(accessibilityID)
    }
}

private struct ProfileContactsSection: View {
    let contacts: NativeProfileContacts
    let optIn: Bool

    @ViewBuilder
    private func contactRow(_ title: String, _ value: String?, identifier: String) -> some View {
        if let value, !value.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            LabeledContent(title, value: value)
                .accessibilityIdentifier(identifier)
        }
    }

    var body: some View {
        Section("Contacts") {
            if contacts.hasAnyHandle {
                contactRow(String(localized: "WeChat"), contacts.wechatHandle, identifier: "profile-contact-wechat")
                contactRow(String(localized: "WhatsApp"), contacts.whatsappHandle, identifier: "profile-contact-whatsapp")
                contactRow(String(localized: "Telegram"), contacts.telegramHandle, identifier: "profile-contact-telegram")
                contactRow(String(localized: "Instagram"), contacts.instagramHandle, identifier: "profile-contact-instagram")
            } else {
                Text("No contact handles yet")
                    .foregroundStyle(.secondary)
                    .accessibilityIdentifier("profile-contacts-empty")
            }
            ProfileToggleSummary(
                title: String(localized: "Contact exchange enabled"),
                value: optIn,
                systemImage: "arrow.left.arrow.right"
            )
        }
    }
}

private struct ProfileHeader: View {
    let displayName: String
    let username: String
    let avatarUrl: String?
    let tagline: String?
    let schoolSummary: NativeProfileSchoolSummary
    let verifiedStudent: Bool
    let verificationStatus: String

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .center, spacing: 14) {
                ProfileAvatar(url: avatarUrl, name: displayName, size: 56)
                VStack(alignment: .leading, spacing: 3) {
                    HStack(spacing: 5) {
                        Text(displayName)
                            .font(.title3.weight(.semibold))
                            .foregroundStyle(.primary)
                        if verifiedStudent {
                            Image(systemName: "checkmark.seal.fill")
                                .foregroundStyle(SideSeatTheme.verifiedSeal)
                        }
                    }
                    Text("@\(username)")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
            }
            Text(schoolSummary.displayLine)
                .font(.subheadline)
                .foregroundStyle(.secondary)
            SchoolIdentityBadge(
                school: schoolSummary.schoolShort,
                verifiedStudent: verifiedStudent,
                status: verificationStatus
            )
            if let tagline, !tagline.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                Text(tagline)
                    .font(.body)
            }
        }
        .padding(.vertical, 6)
        .accessibilityElement(children: .combine)
    }
}

struct SchoolIdentityBadge: View {
    let school: String?
    let verifiedStudent: Bool
    let status: String
    var compact = false

    private var tone: StudentIdentityTone {
        StudentIdentityDisplay.tone(verifiedStudent: verifiedStudent, status: status)
    }

    private var foreground: Color {
        switch tone {
        case .verified:
            return SideSeatTheme.verifiedSeal
        case .pending:
            return SideSeatTheme.warning
        case .warning:
            return SideSeatTheme.danger
        case .neutral:
            return SideSeatTheme.textSecondary
        }
    }

    private var fill: Color {
        switch tone {
        case .verified:
            return SideSeatTheme.verifiedSeal.opacity(0.12)
        case .pending:
            return SideSeatTheme.warning.opacity(0.14)
        case .warning:
            return SideSeatTheme.danger.opacity(0.12)
        case .neutral:
            return SideSeatTheme.fillTertiary
        }
    }

    var body: some View {
        Label {
            Text(StudentIdentityDisplay.label(school: school, verifiedStudent: verifiedStudent, status: status))
                .lineLimit(1)
        } icon: {
            Image(systemName: StudentIdentityDisplay.systemImage(verifiedStudent: verifiedStudent, status: status))
                .imageScale(.small)
        }
        .font(compact ? .caption2.weight(.semibold) : .caption.weight(.semibold))
        .foregroundStyle(foreground)
        .padding(.horizontal, compact ? 7 : 9)
        .padding(.vertical, compact ? 3 : 5)
        .background(fill, in: Capsule())
        .accessibilityIdentifier("school-identity-badge")
    }
}

private struct StudentVerificationSheet: View {
    @Environment(\.dismiss) private var dismiss
    let profile: NativeCurrentProfile
    let onRequest: (String) async -> NativeStudentVerificationResult?
    let onManualReview: (NativeStudentProofDraft, String) async -> NativeStudentVerificationResult?
    let onRefresh: () async -> Void

    @State private var email: String
    @State private var result: NativeStudentVerificationResult?
    @State private var issue: String?
    @State private var isSubmitting = false
    @State private var isSubmittingProof = false
    @State private var isOpeningVerification = false
    @State private var isChoosingProof = false
    @State private var showsManualReview: Bool
    @State private var proof: NativeStudentProofDraft?
    @FocusState private var isEmailFocused: Bool

    init(
        profile: NativeCurrentProfile,
        onRequest: @escaping (String) async -> NativeStudentVerificationResult?,
        onManualReview: @escaping (NativeStudentProofDraft, String) async -> NativeStudentVerificationResult?,
        onRefresh: @escaping () async -> Void
    ) {
        self.profile = profile
        self.onRequest = onRequest
        self.onManualReview = onManualReview
        self.onRefresh = onRefresh
        _email = State(initialValue: profile.email ?? "")
        _showsManualReview = State(
            initialValue: ["MANUAL_REVIEW_REQUIRED", "REJECTED"]
                .contains(profile.studentVerificationStatus.uppercased())
        )
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    LabeledContent("School", value: profile.schoolSummary.schoolShort)
                    SchoolIdentityBadge(
                        school: profile.school,
                        verifiedStudent: displayedVerifiedStudent,
                        status: displayedVerificationStatus
                    )
                    .listRowInsets(EdgeInsets(top: 10, leading: 16, bottom: 10, trailing: 16))
                } header: {
                    Text("Current identity")
                } footer: {
                    Text("A verified school identity makes posts, activity signups, course spaces, and chats safer for international students.")
                }

                if displayedVerifiedStudent {
                    Section {
                        Label("School identity verified", systemImage: "checkmark.seal.fill")
                            .foregroundStyle(SideSeatTheme.success)
                    } footer: {
                        Text("Your school badge stays verified. You do not need to verify again.")
                    }
                } else {
                    Section {
                        TextField("you@school.edu", text: $email)
                            .textInputAutocapitalization(.never)
                            .keyboardType(.emailAddress)
                            .autocorrectionDisabled()
                            .focused($isEmailFocused)
                            .accessibilityIdentifier("student-verification-email")
                    } header: {
                        Text("School email")
                    } footer: {
                        Text("School email is the fastest option. Open the verification link from that inbox within 48 hours.")
                    }

                    if showsManualReview {
                        Section {
                            Button {
                                isChoosingProof = true
                            } label: {
                                Label(proof == nil ? "Choose document" : "Choose another document", systemImage: "doc.badge.plus")
                            }

                            if let proof {
                                LabeledContent("Selected file", value: proof.fileName)
                                Button {
                                    Task { await submitProof() }
                                } label: {
                                    if isSubmittingProof {
                                        ProgressView()
                                            .ssNeutralProgressTint()
                                    } else {
                                        Label("Submit for review", systemImage: "paperplane.fill")
                                    }
                                }
                                .disabled(isSubmittingProof)
                                .accessibilityIdentifier("student-verification-submit-proof")
                            }

                            Button("Use school email instead") {
                                proof = nil
                                showsManualReview = false
                            }
                        } header: {
                            Text("Document review")
                        } footer: {
                            Text(manualReviewFooter)
                        }
                    } else {
                        Section {
                            Button {
                                showsManualReview = true
                            } label: {
                                Label("Can't use your school email?", systemImage: "doc.text.magnifyingglass")
                            }
                        } footer: {
                            Text("Document review is a fallback for students and alumni who cannot use a school inbox.")
                        }
                    }

                    if let result {
                        Section("Next step") {
                            HStack(alignment: .top, spacing: SideSeatTheme.spaceMD) {
                                Image(systemName: deliveryIcon(for: result))
                                    .font(.subheadline.weight(.semibold))
                                    .foregroundStyle(deliveryColor(for: result))
                                    .frame(width: 34, height: 34)
                                    .background(
                                        deliveryColor(for: result).opacity(0.12),
                                        in: Circle()
                                    )

                                VStack(alignment: .leading, spacing: 4) {
                                    Text(
                                        verificationResultTitle(for: result)
                                    )
                                    .font(.subheadline.weight(.semibold))
                                    .foregroundStyle(SideSeatTheme.textPrimary)

                                    Text(result.message)
                                        .font(.footnote)
                                        .foregroundStyle(SideSeatTheme.textSecondary)
                                        .fixedSize(horizontal: false, vertical: true)
                                }
                            }
                            .padding(.vertical, 4)
                            .accessibilityIdentifier("student-verification-delivery-status")

                            if let verifyUrl = result.verifyUrl, let url = URL(string: verifyUrl) {
                                Button {
                                    Task { await verifyUsingLink(url) }
                                } label: {
                                    if isOpeningVerification {
                                        ProgressView()
                                            .ssNeutralProgressTint()
                                    } else {
                                        Label(verificationLinkTitle(for: result), systemImage: "checkmark.seal")
                                    }
                                }
                                .disabled(isOpeningVerification)
                                .accessibilityIdentifier("student-verification-open-link")
                            }
                        }
                    }
                }

                if let issue {
                    Section {
                        Text(issue)
                            .foregroundStyle(SideSeatTheme.danger)
                            .accessibilityIdentifier("student-verification-error")
                    }
                }
            }
            .navigationTitle("School verification")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Done") { dismiss() }
                }
            }
            .fileImporter(
                isPresented: $isChoosingProof,
                allowedContentTypes: [.pdf, .image],
                allowsMultipleSelection: false
            ) { selection in
                prepareProof(selection)
            }
            .onChange(of: email) { oldValue, newValue in
                guard oldValue != newValue, result != nil else { return }
                result = nil
                issue = nil
            }
            .safeAreaInset(edge: .bottom, spacing: 0) {
                if !displayedVerifiedStudent {
                    VStack(spacing: 0) {
                        Divider()
                        if verificationRequestCompleted, let result {
                            HStack(spacing: SideSeatTheme.spaceSM) {
                                Image(systemName: "checkmark.circle.fill")
                                    .font(.body.weight(.semibold))
                                Text(verificationCompletionTitle(for: result))
                                    .font(.body.weight(.semibold))
                            }
                            .foregroundStyle(deliveryColor(for: result))
                            .frame(maxWidth: .infinity, minHeight: 50)
                            .background(
                                deliveryColor(for: result).opacity(0.12),
                                in: RoundedRectangle(
                                    cornerRadius: SideSeatTheme.controlRadius,
                                    style: .continuous
                                )
                            )
                            .accessibilityIdentifier("student-verification-requested")
                            .padding(.horizontal, SideSeatTheme.spaceLG)
                            .padding(.vertical, SideSeatTheme.spaceMD)
                        } else {
                            SSPrimaryButton(
                                title: verificationButtonTitle,
                                isLoading: isSubmitting,
                                fill: .product,
                                accessibilityID: "student-verification-submit"
                            ) {
                                Task { await submit() }
                            }
                            .disabled(!canSubmit || isSubmitting)
                            .padding(.horizontal, SideSeatTheme.spaceLG)
                            .padding(.vertical, SideSeatTheme.spaceMD)
                        }
                    }
                    .background(SideSeatTheme.surface)
                }
            }
        }
    }

    private var normalizedEmail: String {
        email.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    }

    private var displayedVerificationStatus: String {
        result?.status ?? profile.studentVerificationStatus
    }

    private var displayedVerifiedStudent: Bool {
        displayedVerificationStatus.uppercased() == "VERIFIED" || (result == nil && profile.verifiedStudent)
    }

    private var canSubmit: Bool {
        let value = normalizedEmail
        return value.contains("@") && value.contains(".") && value.count <= 254
    }

    private var verificationRequestCompleted: Bool {
        guard let result else { return false }
        return result.delivery?.lowercased() != "failed"
    }

    private var verificationButtonTitle: String {
        if result?.delivery?.lowercased() == "failed" {
            return String(localized: "Try again")
        }
        return String(localized: "Verify school email")
    }

    private func verificationResultTitle(for result: NativeStudentVerificationResult) -> String {
        switch result.delivery?.lowercased() {
        case "sent":
            return String(localized: "Check your school inbox")
        case "failed":
            return String(localized: "Email delivery failed")
        case "skipped":
            return String(localized: "Complete verification")
        default:
            return result.status.uppercased() == "MANUAL_REVIEW_REQUIRED"
                ? String(localized: "Review submitted")
                : String(localized: "Verification update")
        }
    }

    private func verificationCompletionTitle(for result: NativeStudentVerificationResult) -> String {
        switch result.delivery?.lowercased() {
        case "sent":
            return String(localized: "Verification email sent")
        case "skipped":
            return String(localized: "Verification link ready")
        default:
            return String(localized: "Verification requested")
        }
    }

    private var manualReviewFooter: String {
        let document = profile.studentStatus == "ALUMNI"
            ? String(localized: "a diploma or graduation document")
            : String(localized: "an enrollment document or student card")
        return String(
            localized: "Upload \(document), PDF or image, up to 4 MB. Hide student numbers, birth dates, addresses, and other details we do not need. The private file is deleted after review or within 30 days."
        )
    }

    private func deliveryColor(for result: NativeStudentVerificationResult) -> Color {
        switch result.delivery?.lowercased() {
        case "sent":
            return SideSeatTheme.success
        case "failed":
            return SideSeatTheme.danger
        case "skipped":
            return SideSeatTheme.warning
        default:
            return SideSeatTheme.textSecondary
        }
    }

    private func deliveryIcon(for result: NativeStudentVerificationResult) -> String {
        switch result.delivery?.lowercased() {
        case "sent":
            return "envelope.badge.fill"
        case "failed":
            return "exclamationmark.triangle.fill"
        case "skipped":
            return "link.circle.fill"
        default:
            return "info.circle.fill"
        }
    }

    private func verificationLinkTitle(for result: NativeStudentVerificationResult) -> String {
        result.delivery?.lowercased() == "sent"
            ? String(localized: "Open verification link")
            : String(localized: "Verify with link")
    }

    private func submit() async {
        guard canSubmit, !isSubmitting else { return }
        isEmailFocused = false
        isSubmitting = true
        issue = nil
        defer { isSubmitting = false }

        if let next = await onRequest(normalizedEmail) {
            result = next
            if next.delivery?.lowercased() == "manual" {
                showsManualReview = true
            }
        } else {
            issue = String(localized: "Unable to start school verification.")
        }
    }

    private func prepareProof(_ selection: Result<[URL], Error>) {
        issue = nil
        do {
            guard let url = try selection.get().first else { return }
            let accessed = url.startAccessingSecurityScopedResource()
            defer {
                if accessed { url.stopAccessingSecurityScopedResource() }
            }
            let data = try Data(contentsOf: url, options: .mappedIfSafe)
            guard !data.isEmpty else {
                issue = String(localized: "The selected file is empty.")
                return
            }
            guard data.count <= 4 * 1024 * 1024 else {
                issue = String(localized: "The selected file is larger than 4 MB.")
                return
            }
            let contentType = UTType(filenameExtension: url.pathExtension)
            let mimeType = contentType?.preferredMIMEType ?? "application/octet-stream"
            let allowedMIMETypes = Set(["application/pdf", "image/jpeg", "image/png", "image/webp", "image/heic"])
            guard allowedMIMETypes.contains(mimeType) else {
                issue = String(localized: "Choose a PDF, JPG, PNG, WEBP, or HEIC file.")
                return
            }
            proof = NativeStudentProofDraft(
                fileName: url.lastPathComponent,
                mimeType: mimeType,
                data: data
            )
        } catch {
            issue = String(localized: "The selected document could not be read.")
        }
    }

    private func submitProof() async {
        guard let proof, !isSubmittingProof else { return }
        isSubmittingProof = true
        issue = nil
        defer { isSubmittingProof = false }

        if let next = await onManualReview(proof, normalizedEmail) {
            result = next
            self.proof = nil
        } else {
            issue = String(localized: "Unable to submit the school document for review.")
        }
    }

    private func verifyUsingLink(_ url: URL) async {
        guard !isOpeningVerification else { return }
        isOpeningVerification = true
        issue = nil
        defer { isOpeningVerification = false }

        do {
            _ = try await URLSession.shared.data(from: url)
            await onRefresh()
            result = NativeStudentVerificationResult(
                status: "VERIFIED",
                delivery: nil,
                verifyUrl: nil,
                message: String(localized: "School email verified. Your posts and profile now show a verified school identity.")
            )
        } catch {
            issue = String(localized: "The verification link could not be opened. Try again in a moment.")
        }
    }
}

private struct MeHeroCard: View {
    let profile: NativeCurrentProfile
    let isPreparingAvatar: Bool
    let avatarIssue: String?
    @Binding var selectedAvatarPhoto: PhotosPickerItem?
    let onEditProfile: () -> Void
    let onVerifySchool: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .center, spacing: 14) {
                ZStack(alignment: .bottomTrailing) {
                    ProfileAvatar(url: profile.avatarUrl, name: profile.displayName, size: 76)
                        .overlay {
                            Circle()
                                .strokeBorder(Color.white.opacity(0.9), lineWidth: 3)
                        }
                        .shadow(color: .black.opacity(0.10), radius: 10, y: 4)

                    PhotosPicker(selection: $selectedAvatarPhoto, matching: .images) {
                        Image(systemName: "camera.fill")
                            .font(.caption2.weight(.bold))
                            .foregroundStyle(.white)
                            .frame(width: 26, height: 26)
                            .background(Circle().fill(SideSeatTheme.accent))
                            .overlay {
                                Circle().strokeBorder(SideSeatTheme.bg, lineWidth: 2)
                            }
                    }
                    .disabled(isPreparingAvatar)
                    .accessibilityIdentifier("profile-change-photo")
                    .offset(x: 2, y: 2)
                }

                Button(action: onEditProfile) {
                    HStack(spacing: 14) {
                        VStack(alignment: .leading, spacing: 5) {
                            HStack(spacing: 6) {
                                Text(profile.displayName)
                                    .font(.title3.weight(.bold))
                                    .foregroundStyle(.primary)
                                    .lineLimit(1)
                                if profile.verifiedStudent {
                                    Image(systemName: "checkmark.seal.fill")
                                        .foregroundStyle(SideSeatTheme.verifiedSeal)
                                        .imageScale(.medium)
                                }
                            }
                            Text("@\(profile.username)")
                                .font(.caption.monospaced())
                                .foregroundStyle(.secondary)
                        }

                        Spacer(minLength: 4)

                        Image(systemName: "chevron.right")
                            .font(.footnote.weight(.semibold))
                            .foregroundStyle(.tertiary)
                    }
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel(String(localized: "Edit profile"))
                .accessibilityIdentifier("me-hero-edit")
            }
            .padding(16)

            Divider().opacity(0.5)
            Button(action: onVerifySchool) {
                HStack(spacing: SideSeatTheme.spaceMD) {
                    ZStack {
                        Circle()
                            .fill(identityTint.opacity(0.13))
                        Image(
                            systemName: StudentIdentityDisplay.systemImage(
                                verifiedStudent: profile.verifiedStudent,
                                status: profile.studentVerificationStatus
                            )
                        )
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(identityTint)
                    }
                    .frame(width: 36, height: 36)

                    VStack(alignment: .leading, spacing: 2) {
                        Text(profile.schoolSummary.displayLine)
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(SideSeatTheme.textPrimary)
                            .lineLimit(2)
                        Text(
                            StudentIdentityDisplay.label(
                                school: profile.school,
                                verifiedStudent: profile.verifiedStudent,
                                status: profile.studentVerificationStatus
                            )
                        )
                        .font(.caption)
                        .foregroundStyle(identityTint)
                        .lineLimit(1)
                    }

                    Spacer(minLength: SideSeatTheme.spaceSM)

                    Image(systemName: "chevron.right")
                        .font(.footnote.weight(.semibold))
                        .foregroundStyle(.tertiary)
                }
                .padding(.horizontal, SideSeatTheme.spaceLG)
                .padding(.vertical, SideSeatTheme.spaceMD)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel(String(localized: "School verification"))
            .accessibilityIdentifier("me-school-verification")

            if let tagline = profile.tagline?.trimmingCharacters(in: .whitespacesAndNewlines), !tagline.isEmpty {
                Divider().opacity(0.5)
                Text(tagline)
                    .font(.subheadline)
                    .foregroundStyle(.primary.opacity(0.9))
                    .padding(.horizontal, 16)
                    .padding(.vertical, 12)
            }

            if isPreparingAvatar {
                Divider().opacity(0.5)
                SSLoadingState("Updating photo", style: .inline, expands: false)
                    .padding(14)
            }

            if let avatarIssue {
                Divider().opacity(0.5)
                Text(avatarIssue)
                    .font(.footnote)
                    .foregroundStyle(SideSeatTheme.danger)
                    .padding(14)
                    .accessibilityIdentifier("profile-avatar-error")
            }
        }
        .background {
            RoundedRectangle(cornerRadius: SideSeatTheme.cardRadius, style: .continuous)
                .fill(
                    LinearGradient(
                        colors: [
                            SideSeatTheme.surface,
                            SideSeatTheme.surface.opacity(0.94),
                            SideSeatTheme.peach.opacity(0.18),
                            SideSeatTheme.rose.opacity(0.08),
                        ],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )
                )
                .overlay {
                    RoundedRectangle(cornerRadius: SideSeatTheme.cardRadius, style: .continuous)
                        .strokeBorder(
                            LinearGradient(
                                colors: [
                                    SideSeatTheme.peach.opacity(0.45),
                                    SideSeatTheme.orchid.opacity(0.22),
                                ],
                                startPoint: .topLeading,
                                endPoint: .bottomTrailing
                            ),
                            lineWidth: 1
                        )
                }
                .shadow(color: SideSeatTheme.magenta.opacity(0.08), radius: 16, y: 7)
        }
    }

    private var identityTint: Color {
        profile.verifiedStudent ? SideSeatTheme.verifiedSeal : SideSeatTheme.warning
    }
}

private struct MeLanguagesStrip: View {
    let languages: [NativeProfileLanguage]

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(languages, id: \.tag) { language in
                    Text(languageLabel(language))
                        .font(.caption.weight(.medium))
                        .padding(.horizontal, 11)
                        .padding(.vertical, 7)
                        .background(Capsule().fill(SideSeatTheme.fillTertiary))
                        .foregroundStyle(.primary)
                }
            }
            .padding(.horizontal, 2)
        }
        .accessibilityIdentifier("me-languages")
    }

    private func languageLabel(_ language: NativeProfileLanguage) -> String {
        "\(language.tag.replacingOccurrences(of: "_", with: " ").capitalized) · \(language.proficiency.capitalized)"
    }
}


private struct MeCityRow: View {
    let city: String
    let cities: [String]
    let onSelect: (String) -> Void

    var body: some View {
        VStack(spacing: 0) {
            Divider().padding(.leading, 66)
            HStack(spacing: 12) {
                ZStack {
                    Circle()
                        .fill(SideSeatTheme.HubTint.moments.opacity(0.14))
                    Image(systemName: "building.2.fill")
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(SideSeatTheme.HubTint.moments)
                }
                .frame(width: 40, height: 40)

                VStack(alignment: .leading, spacing: 2) {
                    Text("City")
                        .font(.body.weight(.semibold))
                    Text(city)
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                        .accessibilityIdentifier("profile-discover-city")
                }

                Spacer(minLength: 8)

                if cities.count > 1 {
                    Picker("City", selection: Binding(
                        get: { city },
                        set: { onSelect($0) }
                    )) {
                        ForEach(cities, id: \.self) { option in
                            Text(option).tag(option)
                        }
                    }
                    .labelsHidden()
                    .accessibilityIdentifier("profile-discover-city-picker")
                }
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 12)
        }
    }
}

private struct MePrivacySummaryRows: View {
    let privacy: NativeProfilePrivacy

    var body: some View {
        VStack(spacing: 0) {
            privacyRow(
                title: String(localized: "Discoverable"),
                value: !privacy.hideFromDiscovery,
                systemImage: "safari.fill",
                tint: SideSeatTheme.HubTint.privacySchedule,
                identifier: "profile-privacy-discoverable"
            )
            privacyRow(
                title: String(localized: "Visible to course members"),
                value: !privacy.hideFromCourseMembers,
                systemImage: "person.2.fill",
                tint: SideSeatTheme.HubTint.privacyDiscover,
                identifier: "profile-privacy-course-members"
            )
            privacyRow(
                title: String(localized: "Share contact handles"),
                value: privacy.contactInfoOptIn,
                systemImage: "person.crop.circle.badge.checkmark",
                tint: SideSeatTheme.HubTint.privacyChat,
                showDivider: true,
                identifier: "profile-privacy-contacts"
            )
        }
    }

    private func privacyRow(
        title: String,
        value: Bool,
        systemImage: String,
        tint: Color,
        showDivider: Bool = true,
        identifier: String
    ) -> some View {
        VStack(spacing: 0) {
            HStack(spacing: 12) {
                ZStack {
                    Circle()
                        .fill(tint.opacity(0.14))
                    Image(systemName: systemImage)
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(tint)
                }
                .frame(width: 40, height: 40)

                Text(title)
                    .font(.body.weight(.medium))
                Spacer()
                Text(value ? String(localized: "On") : String(localized: "Off"))
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(value ? SideSeatTheme.success : Color.secondary)
                    .padding(.horizontal, 10)
                    .padding(.vertical, 5)
                    .background(
                        Capsule().fill(value ? SideSeatTheme.success.opacity(0.12) : Color.primary.opacity(0.06))
                    )
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 11)
            .accessibilityElement(children: .combine)
            .accessibilityIdentifier(identifier)

            if showDivider {
                Divider().padding(.leading, 66)
            }
        }
    }
}

private struct ProfileAvatar: View {
    let url: String?
    let name: String
    var size: CGFloat = 56

    var body: some View {
        Group {
            if let url, let imageURL = URL(string: url) {
                AsyncImage(url: imageURL) { phase in
                    switch phase {
                    case .success(let image):
                        image.resizable().scaledToFill()
                    default:
                        InitialAvatar(name: name, size: size)
                    }
                }
            } else {
                InitialAvatar(name: name, size: size)
            }
        }
        .frame(width: size, height: size)
        .clipShape(Circle())
    }
}

private struct ProfileDetailsSection: View {
    let tagline: String?
    let languages: [NativeProfileLanguage]

    var body: some View {
        if !languages.isEmpty {
            Section("Details") {
                VStack(alignment: .leading, spacing: 8) {
                    Text("Languages")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(.secondary)
                    FlowTags(values: languages.map { languageLabel($0) })
                }
            }
        }
    }

    private func languageLabel(_ language: NativeProfileLanguage) -> String {
        "\(language.tag.replacingOccurrences(of: "_", with: " ").capitalized) · \(language.proficiency.capitalized)"
    }
}

private struct FlowTags: View {
    let values: [String]

    var body: some View {
        LazyVGrid(columns: [GridItem(.adaptive(minimum: 120), spacing: 8)], alignment: .leading, spacing: 8) {
            ForEach(values, id: \.self) { value in
                Text(value)
                    .font(.caption)
                    .lineLimit(1)
                    .padding(.horizontal, 10)
                    .padding(.vertical, 6)
                    .background(.thinMaterial, in: Capsule())
            }
        }
    }
}

private struct ProfileToggleSummary: View {
    let title: String
    let value: Bool
    let systemImage: String

    var body: some View {
        HStack {
            Label(title, systemImage: systemImage)
            Spacer()
            Text(value ? String(localized: "On") : String(localized: "Off"))
                .foregroundStyle(value ? SideSeatTheme.success : SideSeatTheme.textSecondary)
        }
    }
}
