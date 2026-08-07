import SwiftUI

struct ProfileUsernameSheet: View {
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
                    VStack(alignment: .leading, spacing: 4) {
                        Text("2-32 letters, numbers, _ or -.")
                        Text("You can change your username up to 3 times every 7 days.")
                    }
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
                        .accessibilityIdentifier("profile-username-limit")
                    }
                } else {
                    Section {
                        Label(
                            String(
                                localized: "\(profile.usernameChangesRemaining) username changes remaining in this 7-day period."
                            ),
                            systemImage: "arrow.counterclockwise"
                        )
                        .foregroundStyle(.secondary)
                        .accessibilityIdentifier("profile-username-allowance")
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

struct ProfilePrivacySheet: View {
    @Environment(\.dismiss) private var dismiss
    let profile: NativeCurrentProfile
    let onSave: (NativeProfileUpdateRequest) async -> Bool

    @State private var isDiscoverable: Bool
    @State private var isVisibleToCourseMembers: Bool
    @State private var allowsContactExchange: Bool
    @State private var isSubmitting = false
    @State private var issue: String?

    init(
        profile: NativeCurrentProfile,
        onSave: @escaping (NativeProfileUpdateRequest) async -> Bool
    ) {
        self.profile = profile
        self.onSave = onSave
        _isDiscoverable = State(initialValue: !profile.privacy.hideFromDiscovery)
        _isVisibleToCourseMembers = State(initialValue: !profile.privacy.hideFromCourseMembers)
        _allowsContactExchange = State(initialValue: profile.privacy.contactInfoOptIn)
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: SideSeatTheme.spaceXL) {
                    ProfileEditSection(
                        title: String(localized: "Profile visibility"),
                        systemImage: "eye.fill",
                        tint: SideSeatTheme.HubTint.privacyDiscover
                    ) {
                        VStack(spacing: 0) {
                            ProfileEditToggleRow(
                                title: String(localized: "Show me in Discover"),
                                subtitle: String(localized: "People can find your profile in Discover."),
                                isOn: $isDiscoverable,
                                accessibilityID: "profile-privacy-discover"
                            )
                            Divider().padding(.leading, 4)
                            ProfileEditToggleRow(
                                title: String(localized: "Show me to course members"),
                                subtitle: String(localized: "Students in your courses can find your profile."),
                                isOn: $isVisibleToCourseMembers,
                                accessibilityID: "profile-privacy-course-members"
                            )
                        }
                    }

                    ProfileEditSection(
                        title: String(localized: "Contact sharing"),
                        systemImage: "person.crop.circle.badge.checkmark",
                        tint: SideSeatTheme.HubTint.privacyChat
                    ) {
                        ProfileEditToggleRow(
                            title: String(localized: "Allow contact exchange"),
                            subtitle: String(localized: "Handles stay private until you exchange them with a connection."),
                            isOn: $allowsContactExchange,
                            accessibilityID: "profile-privacy-contact-exchange"
                        )
                    }

                    if let issue {
                        SSFieldMessage(text: issue, accessibilityID: "profile-privacy-error")
                    }
                }
                .padding(.horizontal, SideSeatTheme.spaceLG)
                .padding(.top, SideSeatTheme.spaceMD)
                .padding(.bottom, SideSeatTheme.spaceXL)
            }
            .background(SideSeatTheme.bgGrouped.ignoresSafeArea())
            .accessibilityIdentifier("profile-privacy")
            .toolbar(.hidden, for: .navigationBar)
            .safeAreaInset(edge: .top, spacing: 0) {
                ProfileSheetHeader(title: String(localized: "Privacy & visibility")) {
                    dismiss()
                }
            }
            .safeAreaInset(edge: .bottom, spacing: 0) {
                VStack(spacing: 0) {
                    Divider()
                    SSPrimaryButton(
                        title: String(localized: "Save changes"),
                        isLoading: isSubmitting,
                        fill: .product,
                        accessibilityID: "profile-privacy-save"
                    ) {
                        Task { await save() }
                    }
                    .disabled(!hasChanges || isSubmitting)
                    .padding(.horizontal, SideSeatTheme.spaceLG)
                    .padding(.vertical, SideSeatTheme.spaceMD)
                }
                .background(SideSeatTheme.surface)
            }
        }
    }

    private var hasChanges: Bool {
        isDiscoverable != !profile.privacy.hideFromDiscovery ||
            isVisibleToCourseMembers != !profile.privacy.hideFromCourseMembers ||
            allowsContactExchange != profile.privacy.contactInfoOptIn
    }

    private func save() async {
        guard hasChanges, !isSubmitting else { return }
        isSubmitting = true
        defer { isSubmitting = false }
        issue = nil

        let request = NativeProfileUpdateRequest(
            contactInfoOptIn: allowsContactExchange,
            hideFromDiscovery: !isDiscoverable,
            hideFromCourseMembers: !isVisibleToCourseMembers
        )
        if await onSave(request) {
            dismiss()
        } else {
            issue = String(localized: "Privacy settings could not be saved.")
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
