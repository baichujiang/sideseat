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
    @State private var v2Store = ActionToPlanV2Store.shared
    @State private var showsSocialPreferences = false

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

                        SSGroupedSection(
                            title: AppLocalization.string( "My hub"),
                            accessibilityID: "me-section-hub"
                        ) {
                            SSListRow(
                                title: AppLocalization.string( "My courses"),
                                subtitle: AppLocalization.string( "Course codes, names, and matching"),
                                systemImage: "book.fill",
                                tint: SideSeatTheme.HubTint.courses,
                                accessibilityID: "me-courses"
                            ) {
                                router.navigate(to: .courses)
                            }
                            if v2Store.assignment?.features["v2SocialPreferences"] == true {
                                SSListRow(
                                    title: AppLocalization.string("This week's social preferences"),
                                    subtitle: AppLocalization.string("Interests, group size, and times you want to meet"),
                                    systemImage: "sparkles",
                                    tint: SideSeatTheme.accentText,
                                    accessibilityID: "me-social-preferences"
                                ) {
                                    showsSocialPreferences = true
                                }
                            }
                            SSListRow(
                                title: AppLocalization.string( "Contacts"),
                                subtitle: AppLocalization.string( "People you've connected with"),
                                systemImage: "person.2.fill",
                                tint: SideSeatTheme.HubTint.contacts,
                                showDivider: false,
                                accessibilityID: "me-contacts"
                            ) {
                                router.navigate(to: .contacts)
                            }
                        }

                        SSGroupedSection(
                            title: AppLocalization.string( "Profile"),
                            accessibilityID: "me-section-profile"
                        ) {
                            SSListRow(
                                title: AppLocalization.string( "Username"),
                                subtitle: "@\(profile.username)",
                                systemImage: "at",
                                tint: SideSeatTheme.HubTint.username,
                                accessibilityID: "profile-change-username"
                            ) {
                                editingUsername = profile
                            }

                            SSListRow(
                                title: AppLocalization.string( "Privacy & visibility"),
                                subtitle: AppLocalization.string( "Together matching, courses, and contact sharing"),
                                systemImage: "hand.raised.fill",
                                tint: SideSeatTheme.HubTint.privacyChat,
                                showDivider: false,
                                accessibilityID: "profile-privacy-settings"
                            ) {
                                editingPrivacy = profile
                            }
                        }

                        SSGroupedSection(
                            title: AppLocalization.string( "More"),
                            accessibilityID: "me-section-more"
                        ) {
                            SSListRow(
                                title: AppLocalization.string( "Settings"),
                                subtitle: AppLocalization.string( "Preferences, support, and account"),
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
                    // iOS 26's floating tab bar overlays scroll content. Keep the final
                    // settings row fully scrollable above the glass bar.
                    .padding(.bottom, 104)
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
                    Text(store.issue ?? AppLocalization.string( "Your profile could not be loaded."))
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
                return store.issue ?? AppLocalization.string( "The username could not be saved.")
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
        .sheet(isPresented: $showsSocialPreferences) {
            SocialPreferencesView()
        }
        .onChange(of: selectedAvatarPhoto) { _, item in
            Task { await uploadAvatar(from: item) }
        }
        .task {
            async let profileLoad: Void = loadProfile()
            async let assignmentLoad: Void = v2Store.loadAssignment(using: session)
            _ = await (profileLoad, assignmentLoad)
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
                avatarIssue = AppLocalization.string( "That photo could not be read.")
                return
            }
            if !(await store.uploadAvatar(draft, using: session)) {
                avatarIssue = store.issue ?? AppLocalization.string( "The profile photo could not be uploaded.")
            }
        } catch {
            avatarIssue = AppLocalization.string( "That photo could not be read.")
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
                        .buttonStyle(SSPressButtonStyle())
                        .foregroundStyle(SideSeatTheme.textPrimary)
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
                    .ssIconButtonHitTarget()
            }
            .buttonStyle(SSPressButtonStyle())
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
            return AppLocalization.string( "No courses needed archiving.")
        case 1:
            return AppLocalization.string( "1 course archived")
        default:
            return String(
                format: AppLocalization.string( "%d courses archived"),
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
                            .foregroundStyle(SideSeatTheme.onAccent)
                            .frame(width: 26, height: 26)
                            .background(Circle().fill(SideSeatTheme.accent))
                            .overlay {
                                Circle().strokeBorder(SideSeatTheme.bg, lineWidth: 2)
                            }
                    }
                    .frame(width: 44, height: 44)
                    .contentShape(Rectangle())
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
                                    .accessibilityIdentifier("me-display-name-visual")
                                if profile.verifiedStudent {
                                    VerifiedSchoolMark(school: profile.school, compact: false)
                                }
                            }
                            Text("@\(profile.username)")
                                .font(.caption.monospaced())
                                .foregroundStyle(SideSeatTheme.textSecondaryStrong)
                                .fixedSize(horizontal: false, vertical: true)
                                .accessibilityIdentifier("me-username-visual")
                        }
                        .layoutPriority(1)

                        Spacer(minLength: 4)

                        Image(systemName: "chevron.right")
                            .font(.footnote.weight(.semibold))
                            .foregroundStyle(.tertiary)
                    }
                    .contentShape(Rectangle())
                }
                .buttonStyle(SSPressButtonStyle())
                .accessibilityLabel(AppLocalization.string( "Edit profile"))
                .accessibilityValue("\(profile.displayName), @\(profile.username)")
                .accessibilityIdentifier("me-hero-edit")
            }
            .padding(16)

            Divider().opacity(0.5)
            schoolIdentityRow

            if let tagline = profile.tagline?.trimmingCharacters(in: .whitespacesAndNewlines), !tagline.isEmpty {
                Divider().opacity(0.5)
                Text(tagline)
                    .font(.subheadline)
                    .foregroundStyle(SideSeatTheme.textPrimary)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityIdentifier("me-tagline-visual")
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
            .buttonStyle(SSPressButtonStyle())
            .accessibilityLabel(AppLocalization.string( "School verification"))
            .accessibilityIdentifier("me-school-verification")
        } else {
            schoolIdentityLabel(showsChevron: false)
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
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityIdentifier("me-school-identity")
                Text(
                    StudentIdentityDisplay.label(
                        school: profile.school,
                        verifiedStudent: profile.verifiedStudent,
                        status: profile.studentVerificationStatus
                    )
                )
                .font(.caption)
                .foregroundStyle(identityTone.foreground)
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityIdentifier("me-school-status-visual")
            }
            .layoutPriority(1)

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

private struct NativeSocialWindow: Codable, Hashable, Sendable {
    let weekday: Int
    var startMinutes: Int
    var endMinutes: Int
}

private struct NativeSocialPreference: Decodable, Sendable {
    let topics: [String]
    let meetingPreference: String
    let weeklyWindows: [NativeSocialWindow]
    let timeZone: String
    let activeUntil: String
    let isActive: Bool
}

private struct NativeSocialPreferencesPayload: Decodable, Sendable {
    let preference: NativeSocialPreference?
    let languages: [String]
}

private struct NativeSocialPreferencesRequest: Encodable, Sendable {
    let topics: [String]
    let meetingPreference: String
    let weeklyWindows: [NativeSocialWindow]
    let timeZone: String
}

private struct SocialPreferencesView: View {
    @Environment(SessionStore.self) private var session
    @Environment(\.dismiss) private var dismiss

    @State private var topics = Set<String>()
    @State private var meetingPreference = "BOTH"
    @State private var windows: [Int: NativeSocialWindow] = [:]
    @State private var languages: [String] = []
    @State private var isLoading = true
    @State private var isSaving = false
    @State private var issue: String?

    private let topicOptions = ["COFFEE", "STUDY", "SPORTS", "EXPLORE", "FOOD", "EVENTS"]
    private let timeOptions = Array(stride(from: 8 * 60, through: 22 * 60, by: 30))

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Text("These private preferences improve action recommendations. They never expose your calendar.")
                        .font(.footnote)
                        .foregroundStyle(SideSeatTheme.textSecondaryStrong)
                }

                Section("This week I'd like to") {
                    LazyVGrid(columns: [GridItem(.adaptive(minimum: 108), spacing: 10)], spacing: 10) {
                        ForEach(topicOptions, id: \.self) { topic in
                            Button {
                                if topics.contains(topic) { topics.remove(topic) } else { topics.insert(topic) }
                            } label: {
                                Label(topicLabel(topic), systemImage: topicIcon(topic))
                                    .font(.subheadline.weight(.semibold))
                                    .frame(maxWidth: .infinity, minHeight: 44)
                                    .background(
                                        topics.contains(topic) ? SideSeatTheme.accent.opacity(0.16) : SideSeatTheme.fillTertiary,
                                        in: Capsule()
                                    )
                            }
                            .buttonStyle(.plain)
                            .foregroundStyle(topics.contains(topic) ? SideSeatTheme.accentText : SideSeatTheme.textPrimary)
                            .accessibilityAddTraits(topics.contains(topic) ? .isSelected : [])
                            .accessibilityIdentifier("social-topic-\(topic.lowercased())")
                        }
                    }
                    .padding(.vertical, 4)
                }

                Section("Meeting preference") {
                    Picker("Meeting preference", selection: $meetingPreference) {
                        Text("1 to 1").tag("ONE_TO_ONE")
                        Text("Small group").tag("SMALL_GROUP")
                        Text("Either").tag("BOTH")
                    }
                    .pickerStyle(.segmented)
                }

                Section {
                    ForEach(1...7, id: \.self) { weekday in
                        VStack(alignment: .leading, spacing: 8) {
                            Toggle(dayName(weekday), isOn: windowEnabledBinding(weekday))
                            if windows[weekday] != nil {
                                HStack {
                                    timePicker("From", weekday: weekday, keyPath: \.startMinutes)
                                    Spacer()
                                    timePicker("To", weekday: weekday, keyPath: \.endMinutes)
                                }
                            }
                        }
                    }
                } header: {
                    Text("Times I usually want to meet")
                } footer: {
                    Text("Availability means times you are willing to meet, not every free moment in your calendar.")
                }

                if !languages.isEmpty {
                    Section("Languages used for matching") {
                        Text(languages.joined(separator: " · "))
                    }
                }
                if let issue { Section { Text(issue).foregroundStyle(SideSeatTheme.danger) } }
            }
            .navigationTitle("Social preferences")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") { Task { await save() } }
                        .disabled(isSaving || topics.isEmpty || invalidWindowExists)
                        .accessibilityIdentifier("social-preferences-save")
                }
            }
            .overlay { if isLoading { SSLoadingState("Loading preferences") } }
            .task { await load() }
            .accessibilityIdentifier("social-preferences-sheet")
        }
    }

    private var invalidWindowExists: Bool { windows.values.contains { $0.endMinutes <= $0.startMinutes } }

    private func windowEnabledBinding(_ weekday: Int) -> Binding<Bool> {
        Binding(
            get: { windows[weekday] != nil },
            set: { enabled in
                if enabled {
                    windows[weekday] = NativeSocialWindow(weekday: weekday, startMinutes: 18 * 60, endMinutes: 21 * 60)
                } else { windows.removeValue(forKey: weekday) }
            }
        )
    }

    private func timePicker(
        _ label: LocalizedStringKey,
        weekday: Int,
        keyPath: WritableKeyPath<NativeSocialWindow, Int>
    ) -> some View {
        Picker(label, selection: Binding(
            get: { windows[weekday]?[keyPath: keyPath] ?? 0 },
            set: { value in windows[weekday]?[keyPath: keyPath] = value }
        )) {
            ForEach(timeOptions, id: \.self) { minutes in Text(timeLabel(minutes)).tag(minutes) }
        }
        .pickerStyle(.menu)
    }

    private func load() async {
        defer { isLoading = false }
        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("--ui-testing-authenticated") { languages = ["de", "en"]; return }
        #endif
        do {
            let response: APIEnvelope<NativeSocialPreferencesPayload> = try await session.sendAuthorized("api/v1/me/social-preferences")
            languages = response.data.languages
            if let preference = response.data.preference {
                topics = Set(preference.topics)
                meetingPreference = preference.meetingPreference
                windows = Dictionary(uniqueKeysWithValues: preference.weeklyWindows.map { ($0.weekday, $0) })
            }
        } catch { issue = error.localizedDescription }
    }

    private func save() async {
        isSaving = true
        issue = nil
        defer { isSaving = false }
        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("--ui-testing-authenticated") { dismiss(); return }
        #endif
        do {
            let body = NativeSocialPreferencesRequest(
                topics: topics.sorted(),
                meetingPreference: meetingPreference,
                weeklyWindows: windows.values.sorted { $0.weekday < $1.weekday },
                timeZone: TimeZone.current.identifier
            )
            let _: APIEnvelope<NativeSocialPreferencesPayload> = try await session.sendAuthorized(
                "api/v1/me/social-preferences", method: .patch, body: body
            )
            dismiss()
        } catch { issue = error.localizedDescription }
    }

    private func topicLabel(_ topic: String) -> String {
        switch topic {
        case "COFFEE": AppLocalization.string("Coffee")
        case "STUDY": AppLocalization.string("Study")
        case "SPORTS": AppLocalization.string("Sports")
        case "EXPLORE": AppLocalization.string("Explore")
        case "FOOD": AppLocalization.string("Food")
        default: AppLocalization.string("Events")
        }
    }

    private func topicIcon(_ topic: String) -> String {
        switch topic {
        case "COFFEE": "cup.and.saucer.fill"
        case "STUDY": "book.fill"
        case "SPORTS": "figure.run"
        case "EXPLORE": "map.fill"
        case "FOOD": "fork.knife"
        default: "ticket.fill"
        }
    }

    private func dayName(_ weekday: Int) -> String {
        let symbols = Calendar.current.weekdaySymbols
        return symbols[(weekday - 1) % symbols.count]
    }

    private func timeLabel(_ minutes: Int) -> String {
        String(format: "%02d:%02d", minutes / 60, minutes % 60)
    }
}
