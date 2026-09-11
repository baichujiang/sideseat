import PhotosUI
import SwiftUI

struct MeRootView: View {
    @Environment(SessionStore.self) private var session
    @Environment(RouterPath.self) private var router
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    @State private var store = CurrentProfileStore()
    @State private var editingProfile: NativeCurrentProfile?
    @State private var editingPrivacy: NativeCurrentProfile?
    @State private var editingLanguages: NativeCurrentProfile?
    @State private var verifyingProfile: NativeCurrentProfile?
    @State private var selectedAvatarPhoto: PhotosPickerItem?
    @State private var isChoosingAvatar = false
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
                            isPreparingAvatar: isPreparingAvatar || store.isSaving || selectedAvatarPhoto != nil,
                            avatarIssue: avatarIssue,
                            onChangeAvatar: { isChoosingAvatar = true },
                            onEditProfile: { editingProfile = profile }
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

                        SSManagementSection(
                            title: AppLocalization.string("Campus"),
                            accessibilityID: "me-section-campus"
                        ) {
                            SSManagementRow(
                                title: AppLocalization.string("Verification"),
                                value: StudentIdentityDisplay.label(
                                    school: profile.school,
                                    verifiedStudent: profile.verifiedStudent,
                                    status: profile.studentVerificationStatus
                                ),
                                systemImage: StudentIdentityDisplay.systemImage(
                                    verifiedStudent: profile.verifiedStudent,
                                    status: profile.studentVerificationStatus
                                ),
                                accessibilityID: "me-verification"
                            ) {
                                verifyingProfile = profile
                            }

                            SSManagementRow(
                                title: AppLocalization.string("Courses"),
                                systemImage: "book.closed",
                                accessibilityID: "me-courses"
                            ) {
                                router.navigate(to: .courses)
                            }

                            SSManagementRow(
                                title: AppLocalization.string("Languages"),
                                value: languageSummary(profile.languages),
                                systemImage: "character.bubble",
                                showDivider: false,
                                accessibilityID: "me-languages"
                            ) {
                                editingLanguages = profile
                            }
                        }

                        SSManagementSection(
                            title: AppLocalization.string("Privacy & Safety"),
                            accessibilityID: "me-section-privacy-safety"
                        ) {
                            SSManagementRow(
                                title: AppLocalization.string("Privacy"),
                                systemImage: "hand.raised",
                                accessibilityID: "profile-privacy-settings"
                            ) {
                                editingPrivacy = profile
                            }

                            SSManagementRow(
                                title: AppLocalization.string("Blocked"),
                                systemImage: "person.crop.circle.badge.xmark",
                                showDivider: false,
                                accessibilityID: "me-blocked"
                            ) {
                                router.navigate(to: .blockedUsers)
                            }
                        }

                        SSManagementSection(
                            title: AppLocalization.string("Settings"),
                            accessibilityID: "me-section-settings"
                        ) {
                            SSManagementRow(
                                title: AppLocalization.string("Settings"),
                                systemImage: "gearshape",
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
        .sheet(isPresented: $isChoosingAvatar) {
            if let profile = store.profile {
                SystemAvatarPickerSheet(
                    profile: profile,
                    selectedPhoto: $selectedAvatarPhoto,
                    issue: store.issue
                ) { id in
                    await store.saveSystemAvatar(id, using: session)
                }
                .dynamicTypeSize(dynamicTypeSize)
            }
        }
        .sheet(item: $editingProfile) { profile in
            ProfileEditSheet(profile: profile) { request in
                let saved = await store.save(request, using: session)
                if saved {
                    schoolChangeResult = store.lastSchoolChange
                }
                return saved
            }
        }
        .sheet(item: $editingPrivacy) { profile in
            ProfilePrivacySheet(profile: profile) { request in
                await store.save(request, using: session)
            }
        }
        .sheet(item: $editingLanguages) { profile in
            CoordinationLanguageSelectionSheet(
                profile: profile,
                accessibilityID: "me-coordination-languages"
            ) { languages in
                await store.saveLanguages(languages, using: session)
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

    private func languageSummary(_ languages: [NativeCoordinationLanguage]?) -> String {
        guard let languages, !languages.isEmpty else {
            return AppLocalization.string("None")
        }
        let names = languages.prefix(2).map { CoordinationLanguageOption.name(for: $0.tag) }
        let suffix = languages.count > 2 ? " +\(languages.count - 2)" : ""
        return names.joined(separator: ", ") + suffix
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


private struct SystemAvatarPickerSheet: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    let profile: NativeCurrentProfile
    @Binding var selectedPhoto: PhotosPickerItem?
    let issue: String?
    let onSave: (String) async -> Bool
    @State private var selection: String?
    @State private var isSaving = false

    init(
        profile: NativeCurrentProfile,
        selectedPhoto: Binding<PhotosPickerItem?>,
        issue: String?,
        onSave: @escaping (String) async -> Bool
    ) {
        self.profile = profile
        _selectedPhoto = selectedPhoto
        self.issue = issue
        self.onSave = onSave
        _selection = State(initialValue: NativeSystemAvatar.presetID(for: profile.avatarUrl))
    }

    private var previewName: String {
        NativeSystemAvatar.all.first { $0.id == selection }?.localizedName
            ?? AppLocalization.string("Your current avatar")
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: SideSeatTheme.spaceXL) {
                    VStack(spacing: SideSeatTheme.spaceSM) {
                        ProfileAvatar(url: selection ?? profile.avatarUrl, name: profile.displayName, size: 88)
                        Text(previewName)
                            .font(.headline)
                            .accessibilityIdentifier("system-avatar-preview-name")
                        Text("A little companion, a familiar face.")
                            .font(.subheadline)
                            .foregroundStyle(SideSeatTheme.textSecondaryStrong)
                            .multilineTextAlignment(.center)
                    }
                    .frame(maxWidth: .infinity)

                    PhotosPicker(selection: $selectedPhoto, matching: .images) {
                        Label("Choose a photo", systemImage: "photo.on.rectangle")
                            .font(.subheadline.weight(.semibold))
                            .frame(maxWidth: .infinity, minHeight: 48)
                            .background(SideSeatTheme.surface, in: RoundedRectangle(cornerRadius: 14))
                    }
                    .disabled(isSaving)
                    .accessibilityIdentifier("profile-choose-photo")

                    VStack(alignment: .leading, spacing: SideSeatTheme.spaceMD) {
                        Text("System avatars").font(.headline)
                        LazyVGrid(
                            columns: [GridItem(.adaptive(minimum: dynamicTypeSize.isAccessibilitySize ? 280 : 72), spacing: 12)],
                            alignment: .center, spacing: 16
                        ) {
                            ForEach(NativeSystemAvatar.all) { avatar in
                                Button { selection = avatar.id } label: {
                                    VStack(spacing: 8) {
                                        Image(avatar.assetName)
                                            .resizable().scaledToFit()
                                            .frame(width: 64, height: 64)
                                            .clipShape(Circle())
                                            .padding(4)
                                            .overlay {
                                                if selection == avatar.id {
                                                    Circle().strokeBorder(SideSeatTheme.accent, lineWidth: 2)
                                                }
                                            }
                                            .overlay(alignment: .bottomTrailing) {
                                                if selection == avatar.id {
                                                    Image(systemName: "checkmark.circle.fill")
                                                        .symbolRenderingMode(.palette)
                                                        .foregroundStyle(SideSeatTheme.onAccent, SideSeatTheme.accent)
                                                        .font(.system(size: 21, weight: .semibold))
                                                }
                                            }
                                        Text(avatar.localizedName)
                                            .font(.caption)
                                            .foregroundStyle(SideSeatTheme.textPrimary)
                                            .multilineTextAlignment(.center)
                                            .fixedSize(horizontal: false, vertical: true)
                                    }
                                    .frame(maxWidth: .infinity)
                                    .contentShape(Rectangle())
                                }
                                .buttonStyle(SSPressButtonStyle())
                                .disabled(isSaving)
                                .accessibilityLabel(avatar.localizedName)
                                .accessibilityAddTraits(selection == avatar.id ? .isSelected : [])
                                .accessibilityIdentifier("system-avatar-\(avatar.id)")
                            }
                        }
                    }
                    if let issue {
                        Text(issue)
                            .font(.footnote)
                            .foregroundStyle(SideSeatTheme.danger)
                            .accessibilityIdentifier("system-avatar-error")
                    }
                }
                .padding(20)
            }
            .navigationTitle("Choose an avatar")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }.disabled(isSaving)
                }
            }
            .safeAreaInset(edge: .bottom) {
                SSFlowActionDock(
                    title: AppLocalization.string(dynamicTypeSize.isAccessibilitySize ? "Save" : "Save avatar"),
                    detail: dynamicTypeSize.isAccessibilitySize ? "" : AppLocalization.string("Your avatar appears in chats, plans and your profile."),
                    isLoading: isSaving,
                    isEnabled: selection != nil && selection != NativeSystemAvatar.presetID(for: profile.avatarUrl),
                    accessibilityID: "system-avatar-save"
                ) {
                    guard let selection else { return }
                    isSaving = true
                    Task {
                        if await onSave(selection) { dismiss() }
                        isSaving = false
                    }
                }
            }
            .interactiveDismissDisabled(isSaving)
            .onChange(of: selectedPhoto) { _, item in
                if item != nil { dismiss() }
            }
            .ssFlowSheet()
        }
    }
}

private struct MeHeroCard: View {
    let profile: NativeCurrentProfile
    let isPreparingAvatar: Bool
    let avatarIssue: String?
    let onChangeAvatar: () -> Void
    let onEditProfile: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .center, spacing: 14) {
                ZStack(alignment: .bottomTrailing) {
                    ProfileAvatar(url: profile.avatarUrl, name: profile.displayName, size: 64)
                        .overlay {
                            Circle()
                                .strokeBorder(Color.white.opacity(0.9), lineWidth: 3)
                        }
                        .shadow(color: .black.opacity(0.10), radius: 10, y: 4)

                    Button(action: onChangeAvatar) {
                        Image(systemName: "camera.fill")
                            .font(.caption2.weight(.bold))
                            .foregroundStyle(SideSeatTheme.textPrimary)
                            .frame(width: 26, height: 26)
                            .background(Circle().fill(SideSeatTheme.fillTertiary))
                            .overlay {
                                Circle().strokeBorder(SideSeatTheme.bg, lineWidth: 2)
                            }
                    }
                    .frame(width: 44, height: 44)
                    .contentShape(Rectangle())
                    .disabled(isPreparingAvatar)
                    .accessibilityLabel(AppLocalization.string("Change avatar"))
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
                            Text(profile.schoolSummary.displayLine)
                                .font(.caption)
                                .foregroundStyle(SideSeatTheme.textSecondaryStrong)
                                .fixedSize(horizontal: false, vertical: true)
                                .accessibilityIdentifier("me-campus-summary")
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
                .fill(SideSeatTheme.surface)
                .overlay {
                    RoundedRectangle(cornerRadius: SideSeatTheme.cardRadius, style: .continuous)
                        .strokeBorder(SideSeatTheme.separator.opacity(0.35), lineWidth: 0.5)
                }
                .shadow(color: Color.black.opacity(0.04), radius: 10, y: 4)
        }
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
