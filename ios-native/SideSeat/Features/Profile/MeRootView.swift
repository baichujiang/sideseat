import PhotosUI
import SwiftUI

struct MeRootView: View {
    @Environment(SessionStore.self) private var session
    @Environment(RouterPath.self) private var router
    @State private var store = CurrentProfileStore()
    @State private var editingProfile: NativeCurrentProfile?
    @State private var editingUsername: NativeCurrentProfile?
    @State private var editingPrivacy: NativeCurrentProfile?
    @State private var verifyingProfile: NativeCurrentProfile?
    @State private var selectedAvatarPhoto: PhotosPickerItem?
    @State private var isPreparingAvatar = false
    @State private var avatarIssue: String?
    @State private var hasCompletedInitialProfileLoad = false
    @State private var schoolChangeResult: NativeProfileSchoolChangeSummary?

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

                        if let schoolChangeResult {
                            SchoolChangeResultBanner(
                                summary: schoolChangeResult,
                                onViewArchive: {
                                    self.schoolChangeResult = nil
                                    router.navigate(to: .archivedCourses)
                                },
                                onDismiss: { self.schoolChangeResult = nil }
                            )
                            .transition(.move(edge: .top).combined(with: .opacity))
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

                            SSListRow(
                                title: String(localized: "Privacy & visibility"),
                                subtitle: String(localized: "Discover, courses, and contact sharing"),
                                systemImage: "hand.raised.fill",
                                tint: SideSeatTheme.HubTint.privacyChat,
                                showDivider: false,
                                accessibilityID: "profile-privacy-settings"
                            ) {
                                editingPrivacy = profile
                            }
                        }

                        SSGroupedSection(title: String(localized: "More")) {
                            SSListRow(
                                title: String(localized: "Settings"),
                                subtitle: String(localized: "Preferences, support, and account"),
                                systemImage: "gearshape.fill",
                                tint: SideSeatTheme.HubTint.settings,
                                showDivider: false,
                                accessibilityID: "me-settings"
                            ) {
                                router.navigate(to: .settings)
                            }
                        }
                    }
                    .padding(.horizontal, 16)
                    .padding(.top, 6)
                    .padding(.bottom, 28)
                }
                .background(SideSeatTheme.bgGrouped.ignoresSafeArea())
                .refreshable {
                    await loadProfile()
                }
                .accessibilityIdentifier("me-profile")
            } else if !hasCompletedInitialProfileLoad || store.isLoading {
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
                let saved = await store.save(request, using: session)
                if saved {
                    schoolChangeResult = store.lastSchoolChange
                }
                return saved
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
        .sheet(item: $editingPrivacy) { profile in
            ProfilePrivacySheet(profile: profile) { request in
                await store.save(request, using: session)
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
        .onChange(of: selectedAvatarPhoto) { _, item in
            Task { await uploadAvatar(from: item) }
        }
        .task {
            await loadProfile()
        }
    }

    private func loadProfile() async {
        await store.load(using: session)
        hasCompletedInitialProfileLoad = true
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

private struct SchoolChangeResultBanner: View {
    let summary: NativeProfileSchoolChangeSummary
    let onViewArchive: () -> Void
    let onDismiss: () -> Void

    var body: some View {
        HStack(alignment: .top, spacing: SideSeatTheme.spaceMD) {
            Image(systemName: "checkmark.circle.fill")
                .font(.title3)
                .foregroundStyle(SideSeatTheme.success)
                .accessibilityHidden(true)

            VStack(alignment: .leading, spacing: SideSeatTheme.spaceXS) {
                Text("School updated")
                    .font(.subheadline.weight(.semibold))
                Text(resultText)
                    .font(.footnote)
                    .foregroundStyle(.secondary)

                if summary.archivedCourseCount > 0 {
                    Button("View archived courses", action: onViewArchive)
                        .font(.footnote.weight(.semibold))
                        .buttonStyle(.plain)
                        .foregroundStyle(SideSeatTheme.accent)
                        .padding(.top, 2)
                        .accessibilityIdentifier("me-school-change-view-archive")
                }
            }

            Spacer(minLength: 0)

            Button(action: onDismiss) {
                Image(systemName: "xmark")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.secondary)
                    .frame(width: 28, height: 28)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Dismiss")
            .accessibilityIdentifier("me-school-change-dismiss")
        }
        .padding(SideSeatTheme.spaceMD)
        .background(SideSeatTheme.surface, in: RoundedRectangle(cornerRadius: 8, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 8, style: .continuous)
                .strokeBorder(SideSeatTheme.success.opacity(0.24), lineWidth: 1)
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("me-school-change-result")
    }

    private var resultText: String {
        switch summary.archivedCourseCount {
        case 0:
            return String(localized: "No courses needed archiving.")
        case 1:
            return String(localized: "1 course archived")
        default:
            return String(
                format: String(localized: "%d courses archived"),
                summary.archivedCourseCount
            )
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
                            Text(profile.displayName)
                                .font(.title3.weight(.bold))
                                .foregroundStyle(.primary)
                                .lineLimit(1)
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
            schoolIdentityRow

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

    @ViewBuilder
    private var schoolIdentityRow: some View {
        if canManageVerification {
            Button(action: onVerifySchool) {
                schoolIdentityLabel(showsChevron: true)
            }
            .buttonStyle(.plain)
            .accessibilityLabel(String(localized: "School verification"))
            .accessibilityIdentifier("me-school-verification")
        } else {
            schoolIdentityLabel(showsChevron: false)
                .accessibilityIdentifier("me-school-identity")
        }
    }

    private func schoolIdentityLabel(showsChevron: Bool) -> some View {
        HStack(spacing: SideSeatTheme.spaceMD) {
            ZStack {
                Circle()
                    .fill(identityTone.fill)
                Image(
                    systemName: StudentIdentityDisplay.systemImage(
                        verifiedStudent: profile.verifiedStudent,
                        status: profile.studentVerificationStatus
                    )
                )
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(identityTone.foreground)
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
                .foregroundStyle(identityTone.foreground)
                .lineLimit(1)
            }

            Spacer(minLength: SideSeatTheme.spaceSM)

            if showsChevron {
                Image(systemName: "chevron.right")
                    .font(.footnote.weight(.semibold))
                    .foregroundStyle(.tertiary)
            }
        }
        .padding(.horizontal, SideSeatTheme.spaceLG)
        .padding(.vertical, SideSeatTheme.spaceMD)
        .contentShape(Rectangle())
    }

    private var identityTone: StudentIdentityTone {
        StudentIdentityDisplay.tone(
            verifiedStudent: profile.verifiedStudent,
            status: profile.studentVerificationStatus
        )
    }

    private var canManageVerification: Bool {
        StudentIdentityDisplay.canManageVerification(
            verifiedStudent: profile.verifiedStudent,
            status: profile.studentVerificationStatus
        )
    }
}
