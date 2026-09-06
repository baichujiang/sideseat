import SwiftUI

struct AppRootView: View {
    @Environment(AppContainer.self) private var container
    @Environment(SessionStore.self) private var session
    @Environment(ClientConfigurationStore.self) private var clientConfiguration

    @State private var readinessProfile = CurrentProfileStore()
    @State private var readinessUserID: String?
    @State private var setupRequiredForCurrentSession: Bool?

    var body: some View {
        Group {
            if let issue = container.configurationIssue {
                ConfigurationIssueView(message: issue)
            } else {
                switch clientConfiguration.availability {
                case .maintenance:
                    ClientGateView(
                        title: "Temporarily unavailable",
                        message: "SideSeat is undergoing maintenance. Please try again shortly."
                    )
                case .updateRequired(let minimumVersion):
                    ClientGateView(
                        title: "Update required",
                        message: "Install SideSeat \(minimumVersion) or newer to continue."
                    )
                case .checking, .available:
                    sessionContent
                }
            }
        }
        .task(id: readinessTaskID) {
            await synchronizeReadiness()
        }
    }

    private var readinessTaskID: String {
        let phase: String
        switch session.phase {
        case .restoring: phase = "restoring"
        case .signedOut: phase = "signed-out"
        case .signedIn: phase = "signed-in"
        }
        return "\(phase)|\(session.currentUser?.id ?? "-")|\(session.canMakeAuthenticatedRequests)"
    }

    @ViewBuilder
    private var sessionContent: some View {
        switch session.phase {
        case .restoring:
            StartupTransitionView()
        case .signedOut:
            LoginView()
        case .signedIn:
            signedInContent
        }
    }

    @ViewBuilder
    private var signedInContent: some View {
        if let profile = readinessProfile.profile, let readiness = profile.readiness {
            if readiness.ready && setupRequiredForCurrentSession != true {
                AppShellView()
            } else {
                RequiredSetupView(
                    profileStore: readinessProfile,
                    onEnter: { setupRequiredForCurrentSession = false }
                )
            }
        } else if let userID = session.currentUser?.id,
                  session.isOffline,
                  MVPReadinessCache.ready(userID: userID) == true {
            AppShellView()
        } else if session.isOffline {
            RequiredSetupUnavailableView(
                onRetry: {
                    Task { await retryReadiness() }
                },
                onLogout: {
                    Task { await session.logout() }
                }
            )
        } else if readinessProfile.isLoading || readinessProfile.issue == nil {
            StartupTransitionView()
        } else {
            RequiredSetupUnavailableView(
                onRetry: {
                    Task { await retryReadiness() }
                },
                onLogout: {
                    Task { await session.logout() }
                }
            )
        }
    }

    @MainActor
    private func synchronizeReadiness() async {
        guard case .signedIn = session.phase, let user = session.currentUser else {
            readinessProfile.reset()
            readinessUserID = nil
            setupRequiredForCurrentSession = nil
            return
        }

        if readinessUserID != user.id {
            readinessProfile.reset()
            readinessUserID = user.id
            setupRequiredForCurrentSession = nil
        }

        #if DEBUG
        let canUseUITestingFixture = ProcessInfo.processInfo.arguments.contains("--ui-testing-authenticated")
        #else
        let canUseUITestingFixture = false
        #endif

        guard session.canMakeAuthenticatedRequests || canUseUITestingFixture else {
            if session.isOffline, MVPReadinessCache.ready(userID: user.id) == true {
                setupRequiredForCurrentSession = false
            }
            return
        }

        await readinessProfile.load(using: session)
        if let readiness = readinessProfile.profile?.readiness,
           setupRequiredForCurrentSession == nil {
            setupRequiredForCurrentSession = !readiness.ready
        }
    }

    @MainActor
    private func retryReadiness() async {
        if session.isOffline {
            await session.retryConnection()
        }
        await synchronizeReadiness()
    }
}

private struct RequiredSetupView: View {
    @Environment(SessionStore.self) private var session

    let profileStore: CurrentProfileStore
    let onEnter: () -> Void

    @State private var activeSheet: RequiredSetupSheet?

    var body: some View {
        NavigationStack {
            ScrollView {
                if let profile = profileStore.profile,
                   let readiness = profile.readiness {
                    VStack(alignment: .leading, spacing: SideSeatTheme.spaceXL) {
                        VStack(alignment: .leading, spacing: SideSeatTheme.spaceSM) {
                            Text("Set your context")
                                .font(.title2.weight(.semibold))
                                .foregroundStyle(SideSeatTheme.textPrimary)

                            Text("A verified school identity helps people know who they are meeting.")
                                .font(.body)
                                .foregroundStyle(SideSeatTheme.textSecondary)
                                .fixedSize(horizontal: false, vertical: true)
                        }

                        VStack(spacing: 0) {
                            RequiredSetupRow(
                                title: "School",
                                value: readiness.campusIdentityComplete
                                    ? profile.schoolSummary.schoolShort
                                    : AppLocalization.string("None"),
                                isComplete: readiness.campusIdentityComplete,
                                action: { activeSheet = .campus }
                            )

                            Divider().padding(.leading, 52)

                            RequiredSetupRow(
                                title: "Languages used for matching",
                                value: languageSummary(profile.languages),
                                isComplete: readiness.languagesComplete,
                                action: { activeSheet = .languages }
                            )

                            Divider().padding(.leading, 52)

                            RequiredSetupRow(
                                title: "School verification",
                                value: StudentIdentityDisplay.label(
                                    school: profile.school,
                                    verifiedStudent: profile.verifiedStudent,
                                    status: profile.studentVerificationStatus
                                ),
                                isComplete: profile.verifiedStudent &&
                                    profile.studentVerificationStatus.uppercased() == "VERIFIED",
                                action: { activeSheet = .verification }
                            )
                        }
                        .background(
                            SideSeatTheme.surface,
                            in: RoundedRectangle(cornerRadius: 18, style: .continuous)
                        )

                        if let issue = profileStore.issue {
                            SSFieldMessage(text: issue, accessibilityID: "required-setup-error")
                        }

                        if readiness.ready {
                            SSPrimaryButton(
                                title: AppLocalization.string("Start"),
                                fill: .product,
                                accessibilityID: "required-setup-enter"
                            ) {
                                onEnter()
                            }
                        }

                        Button("Log out") {
                            Task { await session.logout() }
                        }
                        .font(.body.weight(.medium))
                        .foregroundStyle(SideSeatTheme.textSecondaryStrong)
                        .frame(maxWidth: .infinity, minHeight: 44)
                        .accessibilityIdentifier("required-setup-logout")
                    }
                    .padding(.horizontal, SideSeatTheme.screenHorizontal)
                    .padding(.top, SideSeatTheme.spaceXL)
                    .padding(.bottom, SideSeatTheme.spaceXXL)
                } else {
                    ProgressView()
                        .frame(maxWidth: .infinity, minHeight: 240)
                        .accessibilityLabel("Loading profile")
                }
            }
            .background(SideSeatTheme.bgGrouped.ignoresSafeArea())
            .navigationTitle("SideSeat")
            .navigationBarTitleDisplayMode(.inline)
        }
        .accessibilityIdentifier("required-setup")
        .sheet(item: $activeSheet) { sheet in
            if let profile = profileStore.profile {
                switch sheet {
                case .campus:
                    CampusIdentitySetupSheet(profile: profile) { request in
                        await profileStore.save(request, using: session)
                    }
                case .languages:
                    CoordinationLanguageSelectionSheet(profile: profile) { languages in
                        await profileStore.saveLanguages(languages, using: session)
                    }
                case .verification:
                    StudentVerificationSheet(
                        profile: profile,
                        onRequest: { email in
                            await profileStore.requestStudentVerification(email: email, using: session)
                        },
                        onManualReview: { proof, email in
                            await profileStore.submitStudentProof(proof, email: email, using: session)
                        },
                        onRefresh: {
                            await profileStore.load(using: session)
                        }
                    )
                }
            }
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

private enum RequiredSetupSheet: String, Identifiable {
    case campus
    case languages
    case verification

    var id: String { rawValue }
}

private struct RequiredSetupRow: View {
    let title: LocalizedStringKey
    let value: String
    let isComplete: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: SideSeatTheme.spaceMD) {
                Image(systemName: isComplete ? "checkmark.circle.fill" : "circle")
                    .font(.body.weight(.semibold))
                    .foregroundStyle(isComplete ? SideSeatTheme.success : SideSeatTheme.textSecondary)
                    .frame(width: 28, height: 28)

                VStack(alignment: .leading, spacing: 3) {
                    Text(title)
                        .font(.body.weight(.medium))
                        .foregroundStyle(SideSeatTheme.textPrimary)
                    Text(value)
                        .font(.footnote)
                        .foregroundStyle(SideSeatTheme.textSecondary)
                        .lineLimit(2)
                }

                Spacer(minLength: SideSeatTheme.spaceSM)

                Image(systemName: "chevron.right")
                    .font(.footnote.weight(.semibold))
                    .foregroundStyle(SideSeatTheme.textSecondary)
            }
            .padding(.horizontal, SideSeatTheme.spaceLG)
            .padding(.vertical, SideSeatTheme.spaceMD)
            .frame(minHeight: 58)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}

private struct CoordinationLanguageSelectionSheet: View {
    @Environment(\.dismiss) private var dismiss

    let profile: NativeCurrentProfile
    let onSave: ([NativeCoordinationLanguage]) async -> Bool

    @State private var selectedTags: Set<String>
    @State private var isSaving = false
    @State private var issue: String?

    init(
        profile: NativeCurrentProfile,
        onSave: @escaping ([NativeCoordinationLanguage]) async -> Bool
    ) {
        self.profile = profile
        self.onSave = onSave
        _selectedTags = State(initialValue: Set(profile.languages?.map(\.tag) ?? []))
    }

    var body: some View {
        NavigationStack {
            List {
                Section {
                    ForEach(CoordinationLanguageOption.all) { option in
                        Button {
                            if selectedTags.contains(option.tag) {
                                selectedTags.remove(option.tag)
                            } else {
                                selectedTags.insert(option.tag)
                            }
                        } label: {
                            HStack {
                                Text(option.name)
                                    .foregroundStyle(SideSeatTheme.textPrimary)
                                Spacer()
                                if selectedTags.contains(option.tag) {
                                    Image(systemName: "checkmark")
                                        .font(.body.weight(.semibold))
                                        .foregroundStyle(SideSeatTheme.utilityAction)
                                }
                            }
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                    }
                }

                if let issue {
                    Section {
                        Text(issue)
                            .foregroundStyle(SideSeatTheme.danger)
                    }
                }
            }
            .navigationTitle("Languages used for matching")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    if isSaving {
                        ProgressView()
                    } else {
                        Button("Done") {
                            Task { await save() }
                        }
                        .disabled(selectedTags.isEmpty)
                    }
                }
            }
        }
        .accessibilityIdentifier("required-setup-languages")
    }

    @MainActor
    private func save() async {
        guard !selectedTags.isEmpty, !isSaving else { return }
        isSaving = true
        issue = nil
        defer { isSaving = false }

        let existing = Dictionary(
            uniqueKeysWithValues: (profile.languages ?? []).map { ($0.tag, $0.proficiency) }
        )
        let languages = CoordinationLanguageOption.all.compactMap { option -> NativeCoordinationLanguage? in
            guard selectedTags.contains(option.tag) else { return nil }
            return NativeCoordinationLanguage(
                tag: option.tag,
                proficiency: existing[option.tag] ?? "CONVERSATIONAL"
            )
        }

        if await onSave(languages) {
            dismiss()
        } else {
            issue = AppLocalization.string("Something went wrong. Please try again.")
        }
    }
}

private struct CoordinationLanguageOption: Identifiable {
    let tag: String
    let name: String

    var id: String { tag }

    static var all: [CoordinationLanguageOption] {
        [
            CoordinationLanguageOption(tag: "CHINESE", name: AppLocalization.string("Chinese")),
            CoordinationLanguageOption(tag: "ENGLISH", name: AppLocalization.string("English")),
            CoordinationLanguageOption(tag: "GERMAN", name: AppLocalization.string("German")),
            CoordinationLanguageOption(tag: "FRENCH", name: AppLocalization.string("French")),
            CoordinationLanguageOption(tag: "HINDI", name: AppLocalization.string("Hindi")),
            CoordinationLanguageOption(tag: "SPANISH", name: AppLocalization.string("Spanish")),
            CoordinationLanguageOption(tag: "OTHER", name: AppLocalization.string("Other")),
        ]
    }

    static func name(for tag: String) -> String {
        all.first(where: { $0.tag == tag })?.name ?? tag.capitalized
    }
}

private struct CampusIdentitySetupSheet: View {
    @Environment(\.dismiss) private var dismiss

    let onSave: (NativeProfileUpdateRequest) async -> Bool

    @State private var school: String
    @State private var studentStatus: String
    @State private var graduationYear: Int
    @State private var isSaving = false
    @State private var issue: String?

    init(
        profile: NativeCurrentProfile,
        onSave: @escaping (NativeProfileUpdateRequest) async -> Bool
    ) {
        self.onSave = onSave
        _school = State(initialValue: profile.school ?? "TUM")
        _studentStatus = State(initialValue: profile.studentStatus ?? "CURRENT_STUDENT")
        _graduationYear = State(initialValue: profile.graduationYear ?? Calendar.current.component(.year, from: Date()))
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Picker("School", selection: $school) {
                        Text("TUM").tag("TUM")
                        Text("LMU").tag("LMU")
                    }

                    Picker("Student status", selection: $studentStatus) {
                        Text("Current student").tag("CURRENT_STUDENT")
                        Text("Exchange student").tag("EXCHANGE_STUDENT")
                        Text("Alumni").tag("ALUMNI")
                    }

                    if studentStatus == "ALUMNI" {
                        Stepper(
                            "\(AppLocalization.string("Year")): \(graduationYear)",
                            value: $graduationYear,
                            in: (Calendar.current.component(.year, from: Date()) - 80)...(Calendar.current.component(.year, from: Date()) + 1)
                        )
                    }
                } header: {
                    Text("Current identity")
                }

                if let issue {
                    Section {
                        Text(issue)
                            .foregroundStyle(SideSeatTheme.danger)
                    }
                }
            }
            .navigationTitle("School")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    if isSaving {
                        ProgressView()
                    } else {
                        Button("Save") {
                            Task { await save() }
                        }
                    }
                }
            }
        }
        .accessibilityIdentifier("required-setup-campus")
    }

    @MainActor
    private func save() async {
        guard !isSaving else { return }
        isSaving = true
        issue = nil
        defer { isSaving = false }

        let request = NativeProfileUpdateRequest(
            nickname: nil,
            bio: nil,
            gender: nil,
            school: school,
            studentStatus: studentStatus,
            degreeLevel: nil,
            major: nil,
            semester: nil,
            graduationYear: studentStatus == "ALUMNI" ? graduationYear : nil,
            wechatHandle: nil,
            whatsappHandle: nil,
            telegramHandle: nil,
            instagramHandle: nil,
            contactInfoOptIn: nil,
            hideFromDiscovery: nil,
            hideFromCourseMembers: nil
        )

        if await onSave(request) {
            dismiss()
        } else {
            issue = AppLocalization.string("The profile could not be saved.")
        }
    }
}

private struct RequiredSetupUnavailableView: View {
    let onRetry: () -> Void
    let onLogout: () -> Void

    var body: some View {
        ContentUnavailableView {
            Label("Profile unavailable", systemImage: "person.crop.circle.badge.exclamationmark")
        } description: {
            Text("Your profile could not be loaded.")
        } actions: {
            VStack(spacing: SideSeatTheme.spaceSM) {
                Button("Try again", action: onRetry)
                    .buttonStyle(.borderedProminent)
                Button("Log out", action: onLogout)
                    .buttonStyle(.bordered)
            }
        }
        .padding()
        .accessibilityIdentifier("required-setup-unavailable")
    }
}

private struct StartupTransitionView: View {
    @Environment(SessionStore.self) private var session

    var body: some View {
        ZStack {
            Color("LaunchBackground")
                .ignoresSafeArea()

            VStack(spacing: SideSeatTheme.spaceLG) {
                SideSeatBrandMark(size: 72, showsShadow: false)

                if let restorationIssue = session.restorationIssue {
                    VStack(spacing: SideSeatTheme.spaceMD) {
                        Text(restorationIssue)
                            .font(.footnote)
                            .foregroundStyle(SideSeatTheme.textSecondary)
                            .multilineTextAlignment(.center)

                        Button("Try again") {
                            Task { await session.retryConnection() }
                        }
                        .buttonStyle(.bordered)
                    }
                    .frame(maxWidth: 280)
                } else {
                    ProgressView()
                        .controlSize(.small)
                        .tint(SideSeatTheme.textSecondary)
                        .accessibilityLabel("Opening SideSeat")
                }
            }
            .padding(SideSeatTheme.spaceXL)
        }
        .accessibilityIdentifier("startup-transition")
    }
}

private struct ClientGateView: View {
    @Environment(ClientConfigurationStore.self) private var clientConfiguration
    let title: LocalizedStringKey
    let message: LocalizedStringKey

    var body: some View {
        ContentUnavailableView {
            Label(title, systemImage: "exclamationmark.arrow.trianglehead.2.clockwise.rotate.90")
        } description: {
            Text(message)
        } actions: {
            Button("Try again") {
                Task {
                    await clientConfiguration.refresh()
                }
            }
            .buttonStyle(.borderedProminent)
        }
        .padding()
        .accessibilityIdentifier("client-configuration-gate")
    }
}

private struct ConfigurationIssueView: View {
    let message: String

    var body: some View {
        ContentUnavailableView {
            Label("Configuration error", systemImage: "exclamationmark.triangle")
        } description: {
            Text(message)
        }
        .padding()
        .accessibilityIdentifier("configuration-error")
    }
}
