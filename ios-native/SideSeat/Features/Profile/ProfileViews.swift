import PhotosUI
import SwiftUI
import UIKit

private let profileLifePhotoMaxCount = 6

struct MeRootView: View {
    @Environment(SessionStore.self) private var session
    @Environment(RouterPath.self) private var router
    @State private var store = CurrentProfileStore()
    @State private var cityPreference = DiscoverCityPreferenceStore.shared
    @State private var editingProfile: NativeCurrentProfile?
    @State private var editingUsername: NativeCurrentProfile?
    @State private var selectedAvatarPhoto: PhotosPickerItem?
    @State private var selectedLifePhotos: [PhotosPickerItem] = []
    @State private var isPreparingAvatar = false
    @State private var isPreparingLifePhotos = false
    @State private var avatarIssue: String?
    @State private var lifePhotoIssue: String?
    @State private var showMomentsEditor = false

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
                            onEditProfile: { editingProfile = profile }
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

                        SSGroupedSection(title: String(localized: "More")) {
                            SSListRow(
                                title: String(localized: "Settings"),
                                subtitle: settingsSubtitle(blocked: profile.counts.blocked),
                                systemImage: "gearshape.fill",
                                tint: SideSeatTheme.HubTint.settings,
                                accessibilityID: "me-settings"
                            ) {
                                router.navigate(to: .settings)
                            }
                            SSListRow(
                                title: String(localized: "Feedback"),
                                subtitle: String(localized: "Ideas, bugs, and product requests"),
                                systemImage: "bubble.left.and.exclamationmark.bubble.right.fill",
                                tint: SideSeatTheme.HubTint.feedback,
                                accessibilityID: "me-feedback"
                            ) {
                                router.navigate(to: .feedback)
                            }
                            SSListRow(
                                title: String(localized: "Blocked users"),
                                subtitle: blockedSubtitle(count: profile.counts.blocked),
                                systemImage: "hand.raised.fill",
                                tint: SideSeatTheme.HubTint.blocked,
                                accessibilityID: "me-blocked-users"
                            ) {
                                router.navigate(to: .blockedUsers)
                            }

                            MeCityRow(
                                city: cityPreference.selectedCity,
                                cities: cityPreference.servedCities,
                                onSelect: { cityPreference.select($0) }
                            )
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

                            Button {
                                showMomentsEditor = true
                            } label: {
                                SSListRow.Label(
                                    title: String(localized: "Moments"),
                                    subtitle: momentsSubtitle(count: profile.lifePhotos.count),
                                    systemImage: "photo.on.rectangle.angled",
                                    tint: SideSeatTheme.HubTint.moments,
                                    showDivider: false
                                )
                            }
                            .buttonStyle(.plain)
                            .accessibilityIdentifier("me-moments")
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
                ProgressView("Loading profile")
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
        .navigationTitle("Me")
        .navigationBarTitleDisplayMode(.large)
        .toolbar {
            if let profile = store.profile {
                Button("Edit") {
                    editingProfile = profile
                }
                .accessibilityIdentifier("profile-edit-button")
            }
        }
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
                return store.issue ?? "The username could not be saved."
            }
        }
        .sheet(isPresented: $showMomentsEditor) {
            NavigationStack {
                List {
                    ProfileLifePhotosManagerSection(
                        photos: store.profile?.lifePhotos ?? [],
                        selectedPhotos: $selectedLifePhotos,
                        isBusy: isPreparingLifePhotos || store.isSaving,
                        issue: lifePhotoIssue,
                        onMove: { photo, direction in
                            Task { await moveLifePhoto(photo, direction: direction) }
                        },
                        onDelete: { photo in
                            Task { await deleteLifePhoto(photo) }
                        }
                    )
                }
                .navigationTitle("Moments")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .confirmationAction) {
                        Button("Done") { showMomentsEditor = false }
                    }
                }
            }
            .presentationDetents([.medium, .large])
        }
        .onChange(of: selectedAvatarPhoto) { _, item in
            Task { await uploadAvatar(from: item) }
        }
        .onChange(of: selectedLifePhotos) { _, items in
            Task { await uploadLifePhotos(from: items) }
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

    private func momentsSubtitle(count: Int) -> String {
        if count <= 0 {
            return String(localized: "Add photos to your profile")
        }
        if count == 1 {
            return String(localized: "1 photo")
        }
        return String(format: String(localized: "%lld photos"), Int64(count))
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
                avatarIssue = "That photo could not be read."
                return
            }
            if !(await store.uploadAvatar(draft, using: session)) {
                avatarIssue = store.issue ?? "The profile photo could not be uploaded."
            }
        } catch {
            avatarIssue = "That photo could not be read."
        }
    }

    private func uploadLifePhotos(from items: [PhotosPickerItem]) async {
        guard !items.isEmpty else { return }
        isPreparingLifePhotos = true
        lifePhotoIssue = nil
        defer {
            isPreparingLifePhotos = false
            selectedLifePhotos = []
        }

        for item in items {
            let currentCount = store.profile?.lifePhotos.count ?? 0
            guard currentCount < profileLifePhotoMaxCount else {
                lifePhotoIssue = "You can add at most \(profileLifePhotoMaxCount) moments."
                return
            }
            do {
                guard let data = try await item.loadTransferable(type: Data.self),
                      let draft = ProfileLifePhotoPreprocessor.makeDraft(from: data)
                else {
                    lifePhotoIssue = "That photo could not be read."
                    continue
                }
                if !(await store.uploadLifePhoto(draft, using: session)) {
                    lifePhotoIssue = store.issue ?? "The moment could not be uploaded."
                    return
                }
            } catch {
                lifePhotoIssue = "That photo could not be read."
            }
        }
    }

    private func moveLifePhoto(_ photo: NativeProfileLifePhoto, direction: Int) async {
        guard let profile = store.profile,
              let index = profile.lifePhotos.firstIndex(where: { $0.id == photo.id })
        else { return }
        let targetIndex = index + direction
        guard profile.lifePhotos.indices.contains(targetIndex) else { return }
        var photoIds = profile.lifePhotos.map(\.id)
        photoIds.swapAt(index, targetIndex)
        lifePhotoIssue = nil
        if !(await store.reorderLifePhotos(photoIds: photoIds, using: session)) {
            lifePhotoIssue = store.issue ?? "The moment order could not be saved."
        }
    }

    private func deleteLifePhoto(_ photo: NativeProfileLifePhoto) async {
        lifePhotoIssue = nil
        if !(await store.deleteLifePhoto(photoId: photo.id, using: session)) {
            lifePhotoIssue = store.issue ?? "The moment could not be removed."
        }
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
                            verifiedStudent: payload.profile.verifiedStudent
                        )
                        if let metVia = payload.metVia {
                            Label(metVia, systemImage: "link")
                                .font(.footnote)
                                .foregroundStyle(.secondary)
                        }
                    }

                    ProfileDetailsSection(
                        tagline: payload.profile.tagline,
                        languages: payload.profile.languages,
                        lifePhotos: payload.profile.lifePhotos
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
                ProgressView("Loading profile")
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
    @State private var major: String
    @State private var semester: Int
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
        _major = State(initialValue: profile.major ?? "")
        _semester = State(initialValue: profile.semester ?? profile.schoolSummary.semester)
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
            Form {
                Section("Basics") {
                    TextField("Nickname", text: $nickname)
                        .textInputAutocapitalization(.words)
                        .accessibilityIdentifier("profile-edit-nickname")
                    TextField("Tagline", text: $bio, axis: .vertical)
                        .lineLimit(2...3)
                        .accessibilityIdentifier("profile-edit-tagline")
                    Picker("Gender", selection: $gender) {
                        Text("Male").tag("MALE")
                        Text("Female").tag("FEMALE")
                        Text("Prefer not to say").tag("PRIVATE")
                    }
                }

                Section("Study") {
                    TextField("Major", text: $major)
                        .textInputAutocapitalization(.words)
                    Stepper(String(localized: "Semester \(semester)"), value: $semester, in: 1...14)
                }

                Section {
                    TextField("WeChat", text: $wechatHandle)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .accessibilityIdentifier("profile-edit-wechat")
                    TextField("WhatsApp", text: $whatsappHandle)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .accessibilityIdentifier("profile-edit-whatsapp")
                    TextField("Telegram", text: $telegramHandle)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .accessibilityIdentifier("profile-edit-telegram")
                    TextField("Instagram", text: $instagramHandle)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .accessibilityIdentifier("profile-edit-instagram")
                    Toggle("Allow contact exchange", isOn: $contactInfoOptIn)
                        .accessibilityIdentifier("profile-edit-contact-opt-in")
                } header: {
                    Text("Contact handles")
                } footer: {
                    Text("Handles stay private until you exchange them with a connection.")
                }

                Section("Privacy") {
                    Toggle("Hide from Discover", isOn: $hideFromDiscovery)
                    Toggle("Hide from course members", isOn: $hideFromCourseMembers)
                }

                if let issue {
                    Section {
                        Text(issue)
                            .foregroundStyle(SideSeatTheme.danger)
                            .accessibilityIdentifier("profile-edit-error")
                    }
                }
            }
            .navigationTitle("Edit profile")
            .navigationBarTitleDisplayMode(.inline)
            .accessibilityIdentifier("profile-edit")
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
                        } else {
                            Text("Save")
                        }
                    }
                    .disabled(!canSave || isSubmitting)
                    .accessibilityIdentifier("profile-edit-save")
                }
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
            major: major.trimmingCharacters(in: .whitespacesAndNewlines),
            semester: semester,
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
            issue = "The profile could not be saved."
        }
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

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .center, spacing: 14) {
                ProfileAvatar(url: avatarUrl, name: displayName, size: 56)
                VStack(alignment: .leading, spacing: 3) {
                    HStack(spacing: 5) {
                        Text(displayName)
                            .font(.title3.weight(.semibold))
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
            if let tagline, !tagline.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                Text(tagline)
                    .font(.body)
            }
        }
        .padding(.vertical, 6)
        .accessibilityElement(children: .combine)
    }
}

private struct MeHeroCard: View {
    let profile: NativeCurrentProfile
    let isPreparingAvatar: Bool
    let avatarIssue: String?
    @Binding var selectedAvatarPhoto: PhotosPickerItem?
    let onEditProfile: () -> Void

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
                            Text(profile.schoolSummary.displayLine)
                                .font(.subheadline)
                                .foregroundStyle(.secondary)
                                .lineLimit(2)
                        }

                        Spacer(minLength: 4)

                        Image(systemName: "chevron.right")
                            .font(.footnote.weight(.semibold))
                            .foregroundStyle(.tertiary)
                    }
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityIdentifier("me-hero-edit")
            }
            .padding(16)

            if let tagline = profile.tagline?.trimmingCharacters(in: .whitespacesAndNewlines), !tagline.isEmpty {
                Divider().opacity(0.5)
                Text(tagline)
                    .font(.subheadline)
                    .foregroundStyle(.primary.opacity(0.9))
                    .padding(.horizontal, 16)
                    .padding(.vertical, 12)
            }

            if !profile.lifePhotos.isEmpty {
                Divider().opacity(0.5)
                VStack(alignment: .leading, spacing: 8) {
                    Text("LIFE PHOTOS")
                        .font(.caption2.weight(.bold))
                        .tracking(0.7)
                        .foregroundStyle(.secondary)
                    LazyVGrid(
                        columns: [
                            GridItem(.flexible(), spacing: 6),
                            GridItem(.flexible(), spacing: 6),
                            GridItem(.flexible(), spacing: 6),
                        ],
                        spacing: 6
                    ) {
                        ForEach(profile.lifePhotos.prefix(6)) { photo in
                            AsyncImage(url: URL(string: photo.url)) { phase in
                                switch phase {
                                case .success(let image):
                                    image.resizable().scaledToFill()
                                default:
                                    RoundedRectangle(cornerRadius: SideSeatTheme.mediaRadius, style: .continuous)
                                        .fill(Color.primary.opacity(0.06))
                                }
                            }
                            .frame(maxWidth: .infinity)
                            .aspectRatio(1, contentMode: .fill)
                            .clipShape(RoundedRectangle(cornerRadius: SideSeatTheme.mediaRadius, style: .continuous))
                        }
                    }
                }
                .padding(16)
            }

            if isPreparingAvatar {
                Divider().opacity(0.5)
                ProgressView("Updating photo")
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
                        .background(Capsule().fill(SideSeatTheme.rose.opacity(0.12)))
                        .foregroundStyle(SideSeatTheme.rose)
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
                tint: SideSeatTheme.HubTint.privacySchedule
            )
            privacyRow(
                title: String(localized: "Visible to course members"),
                value: !privacy.hideFromCourseMembers,
                systemImage: "person.2.fill",
                tint: SideSeatTheme.HubTint.privacyDiscover
            )
            privacyRow(
                title: String(localized: "Share contact handles"),
                value: privacy.contactInfoOptIn,
                systemImage: "person.crop.circle.badge.checkmark",
                tint: SideSeatTheme.HubTint.privacyChat,
                showDivider: true
            )
        }
    }

    private func privacyRow(
        title: String,
        value: Bool,
        systemImage: String,
        tint: Color,
        showDivider: Bool = true
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
    let lifePhotos: [NativeProfileLifePhoto]

    var body: some View {
        if !languages.isEmpty || !lifePhotos.isEmpty {
            Section("Details") {
                if !languages.isEmpty {
                    VStack(alignment: .leading, spacing: 8) {
                        Text("Languages")
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(.secondary)
                        FlowTags(values: languages.map { languageLabel($0) })
                    }
                }
                if !lifePhotos.isEmpty {
                    VStack(alignment: .leading, spacing: 8) {
                        Text("Moments")
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(.secondary)
                        ScrollView(.horizontal, showsIndicators: false) {
                            HStack(spacing: 10) {
                                ForEach(lifePhotos) { photo in
                                    AsyncImage(url: URL(string: photo.url)) { phase in
                                        switch phase {
                                        case .success(let image):
                                            image.resizable().scaledToFill()
                                        default:
                                            RoundedRectangle(cornerRadius: SideSeatTheme.controlRadius)
                                                .fill(.quaternary)
                                        }
                                    }
                                    .frame(width: 92, height: 92)
                                    .clipShape(RoundedRectangle(cornerRadius: SideSeatTheme.controlRadius, style: .continuous))
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    private func languageLabel(_ language: NativeProfileLanguage) -> String {
        "\(language.tag.replacingOccurrences(of: "_", with: " ").capitalized) · \(language.proficiency.capitalized)"
    }
}

private struct ProfileLifePhotosManagerSection: View {
    let photos: [NativeProfileLifePhoto]
    @Binding var selectedPhotos: [PhotosPickerItem]
    let isBusy: Bool
    let issue: String?
    let onMove: (NativeProfileLifePhoto, Int) -> Void
    let onDelete: (NativeProfileLifePhoto) -> Void

    var body: some View {
        Section("Moments") {
            PhotosPicker(
                selection: $selectedPhotos,
                maxSelectionCount: max(1, profileLifePhotoMaxCount - photos.count),
                matching: .images
            ) {
                Label("Add moments", systemImage: "photo.badge.plus")
            }
            .disabled(photos.count >= profileLifePhotoMaxCount || isBusy)
            .accessibilityIdentifier("profile-add-life-photos")

            if photos.isEmpty {
                Text("No moments yet")
                    .foregroundStyle(.secondary)
            } else {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 12) {
                        ForEach(Array(photos.enumerated()), id: \.element.id) { index, photo in
                            ProfileLifePhotoManagementTile(
                                photo: photo,
                                canMoveLeft: index > 0,
                                canMoveRight: index < photos.count - 1,
                                onMoveLeft: { onMove(photo, -1) },
                                onMoveRight: { onMove(photo, 1) },
                                onDelete: { onDelete(photo) }
                            )
                        }
                    }
                    .padding(.vertical, 4)
                }
                .accessibilityIdentifier("profile-life-photo-list")
            }

            if isBusy {
                ProgressView("Updating moments")
            }

            if let issue {
                Text(issue)
                    .font(.footnote)
                    .foregroundStyle(SideSeatTheme.danger)
                    .accessibilityIdentifier("profile-life-photo-error")
            }
        }
    }
}

private struct ProfileLifePhotoManagementTile: View {
    let photo: NativeProfileLifePhoto
    let canMoveLeft: Bool
    let canMoveRight: Bool
    let onMoveLeft: () -> Void
    let onMoveRight: () -> Void
    let onDelete: () -> Void

    var body: some View {
        VStack(spacing: 8) {
            AsyncImage(url: URL(string: photo.url)) { phase in
                switch phase {
                case .success(let image):
                    image.resizable().scaledToFill()
                default:
                    RoundedRectangle(cornerRadius: SideSeatTheme.controlRadius)
                        .fill(.quaternary)
                        .overlay {
                            Image(systemName: "photo")
                                .foregroundStyle(.secondary)
                        }
                }
            }
            .frame(width: 104, height: 104)
            .clipShape(RoundedRectangle(cornerRadius: SideSeatTheme.controlRadius, style: .continuous))

            HStack(spacing: 8) {
                Button(action: onMoveLeft) {
                    Image(systemName: "chevron.left")
                }
                .disabled(!canMoveLeft)
                .accessibilityLabel("Move moment left")

                Button(action: onMoveRight) {
                    Image(systemName: "chevron.right")
                }
                .disabled(!canMoveRight)
                .accessibilityLabel("Move moment right")

                Button(role: .destructive, action: onDelete) {
                    Image(systemName: "trash")
                }
                .accessibilityLabel("Delete moment")
            }
            .buttonStyle(.borderless)
        }
        .frame(width: 112)
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
