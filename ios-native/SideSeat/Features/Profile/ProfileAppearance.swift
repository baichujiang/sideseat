import SwiftUI

struct NativeProfileAppearance: Codable, Equatable, Sendable {
    var theme = "classic"
    var icon = "none"
    var style = "classic"
    var showMembershipBadge = true

    static let standard = NativeProfileAppearance()
    static let themes = ["classic", "rose", "ocean", "forest"]
    static let icons = ["none", "sun", "moon", "leaf", "sparkles"]
    static let styles = ["classic", "outline", "spotlight"]

    var requiresPlus: Bool {
        ["ocean", "forest"].contains(theme) || ["moon", "leaf", "sparkles"].contains(icon) || style != "classic"
    }

    func effective(isPlus: Bool) -> Self {
        guard !isPlus else { return self }
        var result = self
        if ["ocean", "forest"].contains(theme) { result.theme = "classic" }
        if ["moon", "leaf", "sparkles"].contains(icon) { result.icon = "none" }
        result.style = "classic"
        return result
    }

    var color: Color {
        switch theme {
        case "rose": SideSeatTheme.accent
        case "ocean": SideSeatTheme.ProfilePalette.ocean
        case "forest": SideSeatTheme.ProfilePalette.forest
        default: SideSeatTheme.textSecondary
        }
    }

    var symbol: String? {
        switch icon {
        case "sun": "sun.max.fill"
        case "moon": "moon.stars.fill"
        case "leaf": "leaf.fill"
        case "sparkles": "sparkles"
        default: nil
        }
    }

    static func title(_ value: String) -> String {
        switch value {
        case "classic": AppLocalization.string("Classic")
        case "rose": AppLocalization.string("Rose")
        case "ocean": AppLocalization.string("Ocean")
        case "forest": AppLocalization.string("Forest")
        case "none": AppLocalization.string("None")
        case "sun": AppLocalization.string("Sun")
        case "moon": AppLocalization.string("Moon")
        case "leaf": AppLocalization.string("Leaf")
        case "sparkles": AppLocalization.string("Sparkles")
        case "outline": AppLocalization.string("Outline")
        case "spotlight": AppLocalization.string("Spotlight")
        default: value
        }
    }
}

struct ProfileAppearanceSurface: ViewModifier {
    let appearance: NativeProfileAppearance

    func body(content: Content) -> some View {
        content
            .background {
                RoundedRectangle(cornerRadius: SideSeatTheme.cardRadius, style: .continuous)
                    .fill(SideSeatTheme.surface)
                    .overlay {
                        RoundedRectangle(cornerRadius: SideSeatTheme.cardRadius, style: .continuous)
                            .fill(appearance.color.opacity(appearance.style == "spotlight" ? 0.14 : 0.04))
                    }
                    .overlay {
                        RoundedRectangle(cornerRadius: SideSeatTheme.cardRadius, style: .continuous)
                            .strokeBorder(appearance.color.opacity(appearance.style == "outline" ? 0.65 : 0.18),
                                          lineWidth: appearance.style == "outline" ? 2 : 0.5)
                    }
            }
    }
}

struct ProfileDecorationIcon: View {
    let appearance: NativeProfileAppearance
    var body: some View {
        if let symbol = appearance.symbol {
            Image(systemName: symbol)
                .font(.body.weight(.semibold))
                .foregroundStyle(appearance.color)
                .accessibilityLabel(NativeProfileAppearance.title(appearance.icon))
                .accessibilityIdentifier("profile-decoration-icon")
        }
    }
}

struct ProfileAppearanceSheet: View {
    @Environment(SessionStore.self) private var session
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    @Environment(\.dismiss) private var dismiss
    @AppStorage("sideseat.settings.colorScheme") private var colorScheme = "system"
    let profile: NativeCurrentProfile
    @Bindable var membershipStore: MembershipStore
    let onSave: (NativeProfileUpdateRequest) async -> Bool
    @State private var selection: NativeProfileAppearance
    @State private var isSaving = false
    @State private var issue: String?
    @State private var showsDiscard = false

    init(profile: NativeCurrentProfile, membershipStore: MembershipStore,
         onSave: @escaping (NativeProfileUpdateRequest) async -> Bool) {
        self.profile = profile
        self.membershipStore = membershipStore
        self.onSave = onSave
        _selection = State(initialValue: profile.appearance ?? .standard)
    }

    private var isPlus: Bool { membershipStore.membership?.isPlus == true }
    private var changed: Bool { selection != (profile.appearance ?? .standard) }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    VStack(alignment: .leading, spacing: 12) {
                        let layout = dynamicTypeSize.isAccessibilitySize
                            ? AnyLayout(VStackLayout(alignment: .leading, spacing: 12))
                            : AnyLayout(HStackLayout(alignment: .top, spacing: 12))
                        layout {
                            ProfileAvatar(url: profile.avatarUrl, name: profile.displayName, size: 58)
                            VStack(alignment: .leading, spacing: 5) {
                                Text(profile.displayName).font(.title3.bold())
                                    .fixedSize(horizontal: false, vertical: true)
                                Text("@\(profile.username)").font(.caption).foregroundStyle(.secondary)
                                if isPlus && selection.showMembershipBadge { SSPlusBadge() }
                            }
                            if !dynamicTypeSize.isAccessibilitySize { Spacer(minLength: 0) }
                            ProfileDecorationIcon(appearance: selection)
                        }
                        Text(profile.schoolSummary.displayLine).font(.subheadline).foregroundStyle(.secondary)
                        if let tagline = profile.tagline, !tagline.isEmpty { Text(tagline).font(.subheadline) }
                    }
                    .padding(16)
                    .modifier(ProfileAppearanceSurface(appearance: selection))
                    .listRowInsets(EdgeInsets())
                    .listRowBackground(Color.clear)
                    .accessibilityElement(children: .contain)
                    .accessibilityIdentifier("appearance-preview")
                } header: { Text("Profile preview") }

                Section {
                    Picker("App theme", selection: $colorScheme) {
                        Text("Follow iPhone").tag("system")
                        Text("Light").tag("light")
                        Text("Dark").tag("dark")
                    }
                    .accessibilityIdentifier("appearance-app-theme")
                } footer: { Text("App theme applies immediately on this device.") }

                Section("Profile theme") {
                    options(NativeProfileAppearance.themes, selected: selection.theme, category: "theme") { selection.theme = $0 }
                }
                Section("Profile icon") {
                    options(NativeProfileAppearance.icons, selected: selection.icon, category: "icon") { selection.icon = $0 }
                }
                Section("Display style") {
                    options(NativeProfileAppearance.styles, selected: selection.style, category: "style") { selection.style = $0 }
                }
                Section {
                    Toggle("Show Plus badge", isOn: $selection.showMembershipBadge)
                        .disabled(!isPlus)
                        .accessibilityIdentifier("appearance-show-badge")
                    if !isPlus {
                        NavigationLink {
                            MembershipView(store: membershipStore)
                        } label: { Label("Explore Plus membership", systemImage: "sparkles") }
                        .accessibilityIdentifier("appearance-membership")
                    }
                    Button("Reset profile style") { selection = .standard }
                        .accessibilityIdentifier("appearance-reset")
                } footer: {
                    Text("Plus styles can be previewed by everyone. An active membership is required to save them. After expiry, your profile uses free styles and keeps your saved choices.")
                }
                if let membershipIssue = membershipStore.issue {
                    Section {
                        Text(membershipIssue).foregroundStyle(SideSeatTheme.danger)
                        Button("Try again") { Task { await membershipStore.load(using: session) } }
                    }
                }
                if let issue { Section { Text(issue).foregroundStyle(SideSeatTheme.danger) } }
                if selection.requiresPlus && !isPlus {
                    Section { Label("This selection requires Plus", systemImage: "lock.fill") }
                        .accessibilityIdentifier("appearance-plus-required")
                }
            }
            .disabled(isSaving)
            .navigationTitle("Personalization")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { if changed { showsDiscard = true } else { dismiss() } }
                        .disabled(isSaving)
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button {
                        Task {
                            isSaving = true
                            issue = nil
                            var request = NativeProfileUpdateRequest()
                            request.appearance = selection
                            if await onSave(request) { dismiss() }
                            else { issue = AppLocalization.string("Could not save your style. Check your connection and membership, then try again.") }
                            isSaving = false
                        }
                    } label: {
                        if isSaving { ProgressView() } else { Text("Save") }
                    }
                    .disabled(!changed || isSaving || (selection.requiresPlus && !isPlus))
                    .accessibilityIdentifier("appearance-save")
                }
            }
            .interactiveDismissDisabled(changed || isSaving)
            .confirmationDialog("Discard changes?", isPresented: $showsDiscard, titleVisibility: .visible) {
                Button("Discard changes", role: .destructive) { dismiss() }
                Button("Keep editing", role: .cancel) {}
            }
            .task { await membershipStore.load(using: session) }
        }
    }

    private func options(_ values: [String], selected: String, category: String,
                         choose: @escaping (String) -> Void) -> some View {
        ForEach(values, id: \.self) { value in
            let plus = category == "theme" ? ["ocean", "forest"].contains(value)
                : category == "icon" ? ["moon", "leaf", "sparkles"].contains(value) : value != "classic"
            Button { choose(value) } label: {
                HStack(spacing: 12) {
                    if category == "theme" {
                        Circle().fill(NativeProfileAppearance(theme: value).color).frame(width: 22, height: 22)
                    } else if category == "icon" {
                        Image(systemName: NativeProfileAppearance(icon: value).symbol ?? "circle.dashed")
                            .frame(width: 22)
                    } else {
                        Image(systemName: value == "spotlight" ? "rectangle.fill" : "rectangle")
                            .frame(width: 22)
                    }
                    Text(NativeProfileAppearance.title(value)).foregroundStyle(.primary)
                        .fixedSize(horizontal: false, vertical: true)
                    Spacer(minLength: 4)
                    if plus { Text("PLUS").font(.caption2.bold()).foregroundStyle(.secondary) }
                    if selected == value { Image(systemName: "checkmark").font(.body.bold()) }
                }
                .frame(minHeight: 32)
                .contentShape(Rectangle())
            }
            .foregroundStyle(SideSeatTheme.textPrimary)
            .accessibilityAddTraits(selected == value ? .isSelected : [])
            .accessibilityIdentifier("appearance-\(category)-\(value)")
        }
    }
}
