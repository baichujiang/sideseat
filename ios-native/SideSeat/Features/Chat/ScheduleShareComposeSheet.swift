import OSLog
import Photos
import SwiftUI
import UIKit

struct NativeScheduleShareOwnerPreviewPayload: Decodable, Sendable {
    let snapshot: NativeScheduleShareSnapshot
}

struct ScheduleShareRevealOption: Identifiable, Hashable {
    let id: String
    let name: String
    let colorHex: String
    let presetKey: String?

    static let uncategorizedID = "__sideseat_uncategorized__"
    static let courseSourceID = "__sideseat_course_source__"
}

struct ScheduleShareRevealRequestSelection: Equatable {
    let categoryIDs: [String]
    let presetKeys: [String]
}

enum ScheduleShareRevealSelection {
    static func options(
        categories: [NativeCalendarCategory],
        blocks: [NativeScheduleShareBlock]
    ) -> [ScheduleShareRevealOption] {
        let categoryIDs = Set(blocks.compactMap { normalized($0.categoryId) })
        var options = categories.compactMap { category -> ScheduleShareRevealOption? in
            guard categoryIDs.contains(category.id) else { return nil }
            return ScheduleShareRevealOption(
                id: category.id,
                name: category.displayName,
                colorHex: category.color,
                presetKey: category.presetKey
            )
        }

        if blocks.contains(where: isCourseSource) {
            options.append(
                ScheduleShareRevealOption(
                    id: ScheduleShareRevealOption.courseSourceID,
                    name: AppLocalization.string( "Course timetable"),
                    colorHex: "#3385DB",
                    presetKey: "course"
                )
            )
        }

        if blocks.contains(where: isUncategorized) {
            options.append(
                ScheduleShareRevealOption(
                    id: ScheduleShareRevealOption.uncategorizedID,
                    name: AppLocalization.string( "No category"),
                    colorHex: "#94A3B8",
                    presetKey: "none"
                )
            )
        }

        return options
    }

    static func optionID(for block: NativeScheduleShareBlock) -> String? {
        if let categoryID = normalized(block.categoryId) { return categoryID }
        if isCourseSource(block) { return ScheduleShareRevealOption.courseSourceID }
        if isUncategorized(block) { return ScheduleShareRevealOption.uncategorizedID }
        return nil
    }

    static func requestSelection(
        options: [ScheduleShareRevealOption],
        selectedOptionIDs: Set<String>
    ) -> ScheduleShareRevealRequestSelection {
        let selected = options.filter { selectedOptionIDs.contains($0.id) }
        let categoryIDs = selected.compactMap { option -> String? in
            switch option.id {
            case ScheduleShareRevealOption.courseSourceID,
                 ScheduleShareRevealOption.uncategorizedID:
                return nil
            default:
                return option.id
            }
        }
        let presetKeys = selected.compactMap { option -> String? in
            switch option.id {
            case ScheduleShareRevealOption.courseSourceID:
                return "course"
            case ScheduleShareRevealOption.uncategorizedID:
                return "none"
            default:
                return nil
            }
        }
        return ScheduleShareRevealRequestSelection(
            categoryIDs: Array(Set(categoryIDs)).sorted(),
            presetKeys: Array(Set(presetKeys)).sorted()
        )
    }

    private static func normalized(_ value: String?) -> String? {
        guard let value = value?.trimmingCharacters(in: .whitespacesAndNewlines), !value.isEmpty else {
            return nil
        }
        return value
    }

    private static func isCourseSource(_ block: NativeScheduleShareBlock) -> Bool {
        normalized(block.categoryId) == nil && block.categoryPresetKey == "course"
    }

    private static func isUncategorized(_ block: NativeScheduleShareBlock) -> Bool {
        guard normalized(block.categoryId) == nil else { return false }
        return block.categoryPresetKey == nil || block.categoryPresetKey == "none"
    }
}

private enum ScheduleShareRouteKind: String, Hashable {
    case editor
    case contacts
    case contact
}

private struct ScheduleShareRoute: Hashable {
    let kind: ScheduleShareRouteKind
    let connectionID: String?
    let displayName: String?

    static let editor = ScheduleShareRoute(kind: .editor, connectionID: nil, displayName: nil)
    static let contacts = ScheduleShareRoute(kind: .contacts, connectionID: nil, displayName: nil)

    static func contact(connectionID: String, displayName: String) -> ScheduleShareRoute {
        ScheduleShareRoute(kind: .contact, connectionID: connectionID, displayName: displayName)
    }
}

private enum ScheduleShareDestination {
    case contacts
    case copyLink
    case shareLink
    case imagePreview
}

struct ScheduleShareComposeSheet: View {
    @Environment(SessionStore.self) private var session
    @Environment(\.dismiss) private var dismiss

    private let initialConnectionID: String?
    private let fixedRecipientName: String?
    private let editingLinkID: String?
    private let onSent: (String) -> Void
    private let onUpdated: () -> Void

    @State private var contactsStore = ContactsStore()
    @State private var categoryStore = CalendarCategoryStore()
    @State private var routePath: [ScheduleShareRoute] = []
    @State private var contactQuery = ""
    @State private var preview: NativeScheduleShareSnapshot?
    @State private var selectedDateKeys = ScheduleShareDateSelection.nextDays(3)
    @State private var isWeekPreviewExpanded = false
    @State private var previewWeekAnchor = Calendar.sideSeatBerlin.date(
        byAdding: .day,
        value: 1,
        to: Date()
    ) ?? Date()
    @State private var focusedPreviewDateKey: String?
    @State private var selectedRevealOptionIDs: Set<String> = []
    @State private var didInitializeRevealOptions = false
    @State private var allowGuestProposals = true
    @State private var usageLimit = "UNLIMITED"
    @State private var availabilityStartMinutes = 9 * 60
    @State private var availabilityEndMinutes = 21 * 60
    @State private var expiryDays = 14
    @State private var isLoading = false
    @State private var isSending = false
    @State private var issue: String?
    @State private var sharePayload: SSSharePayload?
    @State private var createdShareURL: URL?
    @State private var didCopyLink = false
    @State private var didConfigureExternalLinkDefaults = false
    @State private var showShareDestinations = false
    @State private var isLinkSettingsExpanded = false
    @State private var shareNotice: String?
    @State private var sendingConnectionID: String?
    @State private var imagePreviewTask: Task<Void, Never>?
    @State private var imagePreviewOperationID: UUID?
    @State private var imagePreviewImages: [UIImage] = []
    @State private var imagePreviewIssue: String?
    @State private var imagePreviewNotice: String?
    @State private var isPreparingImagePreview = false
    @State private var showImagePreview = false
    @State private var imageSaveTask: Task<Void, Never>?
    @State private var imageSaveOperationID: UUID?
    @State private var isSavingImage = false
    @State private var ownerSettings: NativeScheduleShareOwnerSettings?
    @State private var pendingProposalCount = 0
    @State private var originalSelectedDateKeys: Set<String> = []
    @State private var originalSelectedRevealOptionIDs: Set<String> = []
    @State private var originalAllowsGuestProposals = false
    @State private var originalUsageLimit = "SINGLE_USE"
    @State private var originalAvailabilityStartMinutes = 9 * 60
    @State private var originalAvailabilityEndMinutes = 21 * 60
    @State private var originalExpiresAt: Date?
    @State private var originalExpiryDays = 14
    @State private var showEditConfirmation = false
    @State private var editConfirmationMessage = ""

    private let calendar = Calendar.sideSeatBerlin

    init(
        connectionID: String,
        recipientName: String? = nil,
        onSent: @escaping () -> Void
    ) {
        initialConnectionID = connectionID
        fixedRecipientName = recipientName
        editingLinkID = nil
        self.onSent = { _ in onSent() }
        onUpdated = {}
    }

    init(initialDates: [Date] = [], onSent: @escaping (String) -> Void) {
        initialConnectionID = nil
        fixedRecipientName = nil
        editingLinkID = nil
        self.onSent = onSent
        onUpdated = {}

        let calendar = Calendar.sideSeatBerlin
        let today = calendar.startOfDay(for: Date())
        let latest = calendar.date(
            byAdding: .day,
            value: ScheduleShareDateSelection.maximumDayCount - 1,
            to: today
        ) ?? today
        let normalizedDates = initialDates
            .map { calendar.startOfDay(for: $0) }
            .filter { $0 >= today && $0 <= latest }
        let initialKeys = Set(normalizedDates.map {
            ScheduleShareDateSelection.dateKey(for: $0, calendar: calendar)
        })
        let resolvedKeys = initialKeys.isEmpty
            ? ScheduleShareDateSelection.nextDays(3, calendar: calendar)
            : initialKeys
        _selectedDateKeys = State(initialValue: resolvedKeys)
        let firstDate = resolvedKeys.sorted().first.flatMap {
            ScheduleShareDateSelection.date(from: $0, calendar: calendar)
        } ?? today
        _previewWeekAnchor = State(initialValue: firstDate)
        _focusedPreviewDateKey = State(initialValue: resolvedKeys.sorted().first)
    }

    init(editingLinkID: String, onUpdated: @escaping () -> Void = {}) {
        initialConnectionID = nil
        fixedRecipientName = nil
        self.editingLinkID = editingLinkID
        onSent = { _ in }
        self.onUpdated = onUpdated
    }

    private var isEditingExistingLink: Bool {
        editingLinkID != nil
    }

    var body: some View {
        NavigationStack(path: $routePath) {
            Group {
                if initialConnectionID == nil {
                    shareSettingsScreen(for: .editor)
                } else {
                    shareSettingsScreen(
                        for: .contact(
                            connectionID: initialConnectionID ?? "",
                            displayName: fixedRecipientName ?? AppLocalization.string( "This chat")
                        )
                    )
                }
            }
            .navigationDestination(for: ScheduleShareRoute.self) { route in
                switch route.kind {
                case .contacts:
                    recipientPicker
                        .accessibilityElement(children: .contain)
                        .accessibilityIdentifier("schedule-share-recipient-picker")
                        .navigationTitle("Send in SideSeat")
                case .contact:
                    shareSettingsScreen(for: route)
                case .editor:
                    EmptyView()
                }
            }
            .background(SideSeatTheme.bgGrouped)
            .navigationBarTitleDisplayMode(.inline)
            .task { await load() }
        }
        .accessibilityIdentifier("schedule-share-compose")
        .sheet(isPresented: $showShareDestinations) {
            shareDestinationPicker
        }
        .sheet(item: $sharePayload) { payload in
            SSActivityView(items: payload.items)
        }
        .ssActionPrompt(
            isPresented: $showEditConfirmation,
            title: AppLocalization.string("Save these changes?"),
            message: editConfirmationMessage,
            systemImage: "eye.fill",
            tint: SideSeatTheme.warning,
            onDismiss: { showEditConfirmation = false },
            accessibilityIdentifier: "schedule-share-owner-save-prompt"
        ) {
            [
                SSActionPromptAction(
                    id: "schedule-share-owner-cancel-save",
                    title: AppLocalization.string("Cancel"),
                    systemImage: "xmark",
                    role: .cancel
                ) {},
                SSActionPromptAction(
                    id: "schedule-share-owner-confirm-save",
                    title: AppLocalization.string("Save changes"),
                    systemImage: "checkmark",
                    role: .standard
                ) {
                    Task { await updateExistingShare() }
                },
            ]
        }
        .overlay(alignment: .top) {
            if let shareNotice {
                Label(shareNotice, systemImage: "checkmark.circle.fill")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(SideSeatTheme.textPrimary)
                    .padding(.horizontal, SideSeatTheme.spaceMD)
                    .frame(minHeight: 42)
                    .background(.regularMaterial, in: Capsule())
                    .shadow(color: .black.opacity(0.12), radius: 12, y: 4)
                    .padding(.top, SideSeatTheme.spaceSM)
                    .transition(.move(edge: .top).combined(with: .opacity))
                    .accessibilityIdentifier("schedule-share-notice")
            }
        }
        .sensoryFeedback(.success, trigger: didCopyLink)
        .onChange(of: selectedDateKeys) { _, _ in invalidateCreatedLink() }
        .onChange(of: selectedRevealOptionIDs) { _, _ in invalidateCreatedLink() }
        .onChange(of: allowGuestProposals) { _, _ in invalidateCreatedLink() }
        .onChange(of: usageLimit) { _, _ in invalidateCreatedLink() }
        .onChange(of: availabilityStartMinutes) { _, newValue in
            if availabilityEndMinutes <= newValue {
                availabilityEndMinutes = min(newValue + 60, 24 * 60)
            }
            invalidateCreatedLink()
        }
        .onChange(of: availabilityEndMinutes) { _, _ in invalidateCreatedLink() }
        .onChange(of: expiryDays) { _, _ in invalidateCreatedLink() }
    }

    private func shareSettingsScreen(for route: ScheduleShareRoute) -> some View {
        shareSettings(for: route)
            .accessibilityElement(children: .contain)
            .accessibilityIdentifier("schedule-share-settings")
            .navigationTitle(isEditingExistingLink ? "Edit availability sharing" : "Share availability")
            .toolbar {
                if initialConnectionID != nil || route.kind == .editor {
                    ToolbarItem(placement: .cancellationAction) {
                        Button("Cancel") { dismiss() }
                    }
                }
            }
            .safeAreaInset(edge: .bottom, spacing: 0) {
                sendBar(for: route)
            }
            .onAppear { configureDefaultsIfNeeded(for: route) }
    }

    private var shareDestinationPicker: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: SideSeatTheme.spaceLG) {
                    if !contactsStore.contacts.isEmpty {
                        VStack(alignment: .leading, spacing: SideSeatTheme.spaceMD) {
                            Text("Contacts")
                                .font(SideSeatTheme.Text.titleSmall)

                            ScrollView(.horizontal, showsIndicators: false) {
                                HStack(spacing: SideSeatTheme.spaceMD) {
                                    ForEach(Array(contactsStore.contacts.prefix(5)), id: \.id) { contact in
                                        Button {
                                            selectShareContact(contact)
                                        } label: {
                                            VStack(spacing: SideSeatTheme.spaceXS) {
                                                InitialAvatar(
                                                    name: contact.displayName,
                                                    url: contact.peer.avatarUrl,
                                                    size: 50
                                                )
                                                Text(contact.displayName)
                                                    .font(.caption)
                                                    .foregroundStyle(SideSeatTheme.textPrimary)
                                                    .lineLimit(1)
                                            }
                                            .frame(width: 68)
                                        }
                                        .buttonStyle(SSPressButtonStyle())
                                        .disabled(isSending)
                                        .accessibilityIdentifier(
                                            "schedule-share-destination-contact-\(contact.connectionId)"
                                        )
                                    }
                                }
                            }
                        }
                    }

                    VStack(spacing: 0) {
                        shareDestinationRow(
                            title: "Send in SideSeat",
                            subtitle: "Choose from all your contacts.",
                            systemImage: "person.2.fill",
                            accessibilityID: "schedule-share-destination-contacts"
                        ) {
                            selectShareDestination(.contacts)
                        }
                        Divider().padding(.leading, 60)
                        shareDestinationRow(
                            title: "Copy link",
                            subtitle: "Create a link and copy it now.",
                            systemImage: "link",
                            accessibilityID: "schedule-share-destination-copy-link"
                        ) {
                            selectShareDestination(.copyLink)
                        }
                        Divider().padding(.leading, 60)
                        shareDestinationRow(
                            title: "Share with other apps",
                            subtitle: "Send a link through the iOS share menu.",
                            systemImage: "square.and.arrow.up",
                            accessibilityID: "schedule-share-destination-link"
                        ) {
                            selectShareDestination(.shareLink)
                        }
                    }
                    .background(
                        SideSeatTheme.surface,
                        in: RoundedRectangle(cornerRadius: SideSeatTheme.controlRadius, style: .continuous)
                    )

                    DisclosureGroup {
                        shareDestinationRow(
                            title: "Share image",
                            subtitle: "Preview before sharing or saving.",
                            systemImage: "photo.on.rectangle.angled",
                            accessibilityID: "schedule-share-destination-image-preview",
                            isDisabled: isPreparingImagePreview || isSavingImage
                        ) {
                            selectShareDestination(.imagePreview)
                        }
                    } label: {
                        Label("More ways", systemImage: "ellipsis.circle")
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(SideSeatTheme.textPrimary)
                    }
                    .padding(.horizontal, SideSeatTheme.spaceMD)
                    .padding(.vertical, SideSeatTheme.spaceSM)
                    .background(
                        SideSeatTheme.surface,
                        in: RoundedRectangle(cornerRadius: SideSeatTheme.controlRadius, style: .continuous)
                    )
                    .accessibilityIdentifier("schedule-share-more-destinations")

                    Label(
                        "Only the dates and details shown in your preview will be shared.",
                        systemImage: "lock.shield"
                    )
                    .font(.footnote)
                    .foregroundStyle(SideSeatTheme.textSecondary)

                    if let issue {
                        issueText(issue)
                    }
                }
                .padding(.horizontal, SideSeatTheme.screenHorizontal)
                .padding(.vertical, SideSeatTheme.spaceLG)
            }
            .background(SideSeatTheme.bgGrouped)
            .navigationTitle("Share with")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") {
                        cancelScheduleImageSave()
                        showShareDestinations = false
                    }
                }
            }
        }
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
        .fullScreenCover(isPresented: $showImagePreview, onDismiss: cancelScheduleImageFlow) {
            scheduleImagePreview
        }
        .onDisappear {
            if !showImagePreview {
                cancelScheduleImageFlow()
            }
        }
        .accessibilityIdentifier("schedule-share-destination-picker")
    }

    private var scheduleImagePreview: some View {
        ScheduleShareImagePreviewView(
            images: imagePreviewImages,
            isPreparing: isPreparingImagePreview,
            isSaving: isSavingImage,
            issue: imagePreviewIssue,
            notice: imagePreviewNotice,
            onRetry: startScheduleImagePreviewGeneration,
            onSave: startScheduleImageSave,
            onCancelSave: cancelScheduleImageSave,
            onClose: closeScheduleImagePreview
        )
    }

    private func shareDestinationRow(
        title: LocalizedStringKey,
        subtitle: LocalizedStringKey,
        systemImage: String,
        accessibilityID: String,
        isDisabled: Bool = false,
        action: @escaping () -> Void
    ) -> some View {
        Button(action: action) {
            HStack(spacing: SideSeatTheme.spaceMD) {
                Image(systemName: systemImage)
                    .font(.body.weight(.semibold))
                    .foregroundStyle(SideSeatTheme.HubTint.plans)
                    .frame(width: 36, height: 36)
                    .background(SideSeatTheme.HubTint.plans.opacity(0.12), in: RoundedRectangle(cornerRadius: 8))
                VStack(alignment: .leading, spacing: 2) {
                    Text(title)
                        .font(.body.weight(.semibold))
                        .foregroundStyle(SideSeatTheme.textPrimary)
                    Text(subtitle)
                        .font(.caption)
                        .foregroundStyle(SideSeatTheme.textSecondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
                Spacer(minLength: SideSeatTheme.spaceSM)
                Image(systemName: "chevron.right")
                    .font(.caption.weight(.bold))
                    .foregroundStyle(SideSeatTheme.textSecondary)
            }
            .padding(.horizontal, SideSeatTheme.spaceMD)
            .padding(.vertical, 10)
            .contentShape(Rectangle())
        }
        .buttonStyle(SSPressButtonStyle())
        .disabled(isSending || isDisabled)
        .accessibilityIdentifier(accessibilityID)
    }

    private var recipientPicker: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: SideSeatTheme.spaceLG) {
                VStack(alignment: .leading, spacing: SideSeatTheme.spaceXS) {
                    Text("Choose a chat")
                        .font(SideSeatTheme.Text.titleSmall)
                    Text("Your availability will be sent as a private card in this conversation.")
                        .font(.footnote)
                        .foregroundStyle(SideSeatTheme.textSecondary)
                }

                HStack(spacing: SideSeatTheme.spaceSM) {
                    Image(systemName: "magnifyingglass")
                        .foregroundStyle(SideSeatTheme.textSecondary)
                    TextField("Search contacts", text: $contactQuery)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .accessibilityIdentifier("schedule-share-contact-search")
                    if !contactQuery.isEmpty {
                        Button {
                            contactQuery = ""
                        } label: {
                            Image(systemName: "xmark.circle.fill")
                                .foregroundStyle(SideSeatTheme.textSecondary)
                        }
                        .accessibilityLabel("Clear search")
                    }
                }
                .padding(.horizontal, SideSeatTheme.spaceMD)
                .frame(minHeight: 44)
                .background(SideSeatTheme.surface, in: RoundedRectangle(cornerRadius: SideSeatTheme.controlRadius, style: .continuous))

                if contactsStore.isLoading {
                    SSLoadingState("Loading contacts")
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, SideSeatTheme.spaceXXL)
                } else if filteredContacts.isEmpty {
                    SSEmptyState(
                        title: contactQuery.isEmpty ? "No contacts yet" : "No matching contacts",
                        systemImage: "person.2",
                        description: contactQuery.isEmpty
                            ? "Add a classmate before sharing your availability privately."
                            : "Try another name or username."
                    )
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, SideSeatTheme.spaceXL)
                } else {
                    VStack(spacing: 0) {
                        ForEach(Array(filteredContacts.enumerated()), id: \.element.id) { index, contact in
                            Button {
                                Task {
                                    await sendToContact(
                                        connectionID: contact.connectionId,
                                        recipientName: contact.displayName
                                    )
                                }
                            } label: {
                                HStack(spacing: SideSeatTheme.spaceMD) {
                                    InitialAvatar(
                                        name: contact.displayName,
                                        url: contact.peer.avatarUrl,
                                        size: 44
                                    )
                                    VStack(alignment: .leading, spacing: 2) {
                                        Text(contact.displayName)
                                            .font(.body.weight(.semibold))
                                            .foregroundStyle(SideSeatTheme.textPrimary)
                                            .lineLimit(1)
                                        Text("@\(contact.peer.username)")
                                            .font(.caption)
                                            .foregroundStyle(SideSeatTheme.textSecondary)
                                            .lineLimit(1)
                                    }
                                    Spacer(minLength: SideSeatTheme.spaceSM)
                                    if sendingConnectionID == contact.connectionId {
                                        ProgressView()
                                    } else {
                                        Image(systemName: "paperplane.fill")
                                            .font(.subheadline.weight(.semibold))
                                            .foregroundStyle(SideSeatTheme.HubTint.contacts)
                                    }
                                }
                                .padding(.horizontal, SideSeatTheme.spaceMD)
                                .padding(.vertical, 10)
                                .contentShape(Rectangle())
                            }
                            .buttonStyle(SSPressButtonStyle())
                            .disabled(isSending)
                            .accessibilityIdentifier("schedule-share-contact-\(contact.connectionId)")

                            if index < filteredContacts.count - 1 {
                                Divider().padding(.leading, 68)
                            }
                        }
                    }
                    .background(SideSeatTheme.surface, in: RoundedRectangle(cornerRadius: SideSeatTheme.controlRadius, style: .continuous))
                }

                if let contactIssue = contactsStore.issue {
                    issueText(contactIssue)
                }
            }
            .padding(.horizontal, SideSeatTheme.screenHorizontal)
            .padding(.vertical, SideSeatTheme.spaceLG)
        }
    }

    private func shareSettings(for route: ScheduleShareRoute) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: SideSeatTheme.spaceXL) {
                if route.kind == .contact {
                    sharingSummary(for: route)
                }
                daySelection
                eventDetailSelection
                if route.kind == .editor {
                    linkSettingsDisclosure
                }
                if route.kind == .editor, !isEditingExistingLink, let createdShareURL {
                    createdLinkCard(createdShareURL)
                }
                if let issue {
                    issueText(issue)
                }
            }
            .padding(.horizontal, SideSeatTheme.screenHorizontal)
            .padding(.top, SideSeatTheme.spaceLG)
            .padding(.bottom, SideSeatTheme.spaceXL)
        }
    }

    private func sharingSummary(for route: ScheduleShareRoute) -> some View {
        let content = sharingSummaryContent(for: route)
        return HStack(spacing: SideSeatTheme.spaceMD) {
            Image(systemName: content.systemImage)
                .font(.title2)
                .foregroundStyle(SideSeatTheme.HubTint.plans)
                .frame(width: 36, height: 36)
            VStack(alignment: .leading, spacing: 2) {
                Text(content.title)
                    .font(.body.weight(.semibold))
                    .lineLimit(1)
                Text(content.subtitle)
                    .font(.caption)
                    .foregroundStyle(SideSeatTheme.textSecondary)
                    .lineLimit(2)
            }
            Spacer(minLength: SideSeatTheme.spaceSM)
            if initialConnectionID == nil, route.kind == .contact {
                Button("Change") {
                    routePath.removeAll()
                    issue = nil
                }
                .font(.subheadline.weight(.semibold))
            }
        }
        .padding(.horizontal, SideSeatTheme.spaceMD)
        .padding(.vertical, 10)
        .background(SideSeatTheme.surface, in: RoundedRectangle(cornerRadius: SideSeatTheme.controlRadius, style: .continuous))
        .accessibilityIdentifier("schedule-share-recipient-summary")
    }

    private func sharingSummaryContent(
        for route: ScheduleShareRoute
    ) -> (systemImage: String, title: String, subtitle: String) {
        switch route.kind {
        case .contact:
            return (
                "person.crop.circle.badge.checkmark",
                route.displayName ?? AppLocalization.string( "This chat"),
                AppLocalization.string("Send an interactive availability card in SideSeat.")
            )
        case .contacts:
            return (
                "person.2",
                AppLocalization.string( "Send in SideSeat"),
                AppLocalization.string( "Choose a contact to continue.")
            )
        case .editor:
            return (
                "square.and.arrow.up",
                AppLocalization.string("Share availability"),
                AppLocalization.string("Choose a destination after reviewing your available time."),
            )
        }
    }

    private var daySelection: some View {
        VStack(alignment: .leading, spacing: SideSeatTheme.spaceMD) {
            sectionHeader(
                title: AppLocalization.string("Time range"),
                detail: AppLocalization.string( "\(selectedDateKeys.count) selected")
            )

            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: SideSeatTheme.spaceSM) {
                    quickDayButton("Next 3 days", keys: ScheduleShareDateSelection.nextDays(3))
                    quickDayButton("Next 7 days", keys: ScheduleShareDateSelection.nextDays(7))
                    quickDayButton("Next week", keys: ScheduleShareDateSelection.nextWeek())
                    if !selectedDateKeys.isEmpty {
                        Button("Clear") {
                            selectedDateKeys.removeAll()
                        }
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(SideSeatTheme.textSecondary)
                            .padding(.horizontal, 12)
                            .frame(height: 34)
                            .background(SideSeatTheme.fillTertiary, in: Capsule())
                            .accessibilityIdentifier("schedule-share-clear-days")
                    }
                }
            }

            HStack(spacing: SideSeatTheme.spaceSM) {
                Button {
                    movePreviewWeek(by: -1)
                } label: {
                    Image(systemName: "chevron.left")
                        .frame(width: 32, height: 32)
                        .ssIconButtonHitTarget()
                }
                .buttonStyle(SSPressButtonStyle())
                .disabled(!canMovePreviewWeek(by: -1))
                .accessibilityLabel("Previous week")
                .accessibilityIdentifier("schedule-share-previous-week")

                Text(previewWeekRangeLabel)
                    .font(.subheadline.weight(.semibold))
                    .frame(maxWidth: .infinity)
                    .lineLimit(1)

                Button {
                    movePreviewWeek(by: 1)
                } label: {
                    Image(systemName: "chevron.right")
                        .frame(width: 32, height: 32)
                        .ssIconButtonHitTarget()
                }
                .buttonStyle(SSPressButtonStyle())
                .disabled(!canMovePreviewWeek(by: 1))
                .accessibilityLabel("Next week")
                .accessibilityIdentifier("schedule-share-next-week")
            }

            HStack(spacing: 4) {
                ForEach(previewWeekDates, id: \.self) { date in
                    weekDayButton(date)
                }
            }
            .frame(maxWidth: .infinity)
            .accessibilityElement(children: .contain)
            .accessibilityIdentifier("schedule-share-week-days")

            dailyAvailabilityRow

            Button {
                withAnimation(.snappy(duration: 0.24)) {
                    isWeekPreviewExpanded.toggle()
                }
            } label: {
                HStack(spacing: SideSeatTheme.spaceSM) {
                    Image(systemName: "calendar.day.timeline.left")
                        .foregroundStyle(SideSeatTheme.HubTint.plans)
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Availability preview")
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(SideSeatTheme.textPrimary)
                        Text(selectionEventSummary)
                            .font(.caption)
                            .foregroundStyle(SideSeatTheme.textSecondary)
                    }
                    Spacer(minLength: SideSeatTheme.spaceSM)
                    Image(systemName: "chevron.down")
                        .font(.caption.weight(.bold))
                        .foregroundStyle(SideSeatTheme.textSecondary)
                        .rotationEffect(.degrees(isWeekPreviewExpanded ? 180 : 0))
                }
                .padding(.horizontal, SideSeatTheme.spaceMD)
                .frame(minHeight: 48)
                .contentShape(Rectangle())
            }
            .buttonStyle(SSPressButtonStyle())
            .background(
                SideSeatTheme.surface,
                in: RoundedRectangle(cornerRadius: SideSeatTheme.controlRadius, style: .continuous)
            )
            .accessibilityValue(isWeekPreviewExpanded ? AppLocalization.string( "Expanded") : AppLocalization.string( "Collapsed"))
            .accessibilityIdentifier("schedule-share-week-preview-toggle")

            if isWeekPreviewExpanded {
                selectionWeekPreview
                    .transition(.opacity.combined(with: .move(edge: .top)))
            }
        }
    }

    private var dailyAvailabilityRow: some View {
        HStack(spacing: SideSeatTheme.spaceSM) {
            Label("Available each day", systemImage: "clock.badge.checkmark")
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(SideSeatTheme.textPrimary)
            Spacer(minLength: SideSeatTheme.spaceSM)
            Picker("Available from", selection: $availabilityStartMinutes) {
                ForEach(Array(stride(from: 0, to: availabilityEndMinutes, by: 30)), id: \.self) {
                    Text(dailyTimeLabel($0)).tag($0)
                }
            }
            .labelsHidden()
            .pickerStyle(.menu)
            .accessibilityIdentifier("schedule-share-daily-start")

            Text("–")
                .foregroundStyle(SideSeatTheme.textSecondary)

            Picker("Available until", selection: $availabilityEndMinutes) {
                ForEach(
                    Array(stride(from: availabilityStartMinutes + 30, through: 24 * 60, by: 30)),
                    id: \.self
                ) {
                    Text(dailyTimeLabel($0)).tag($0)
                }
            }
            .labelsHidden()
            .pickerStyle(.menu)
            .accessibilityIdentifier("schedule-share-daily-end")
        }
        .padding(.horizontal, SideSeatTheme.spaceMD)
        .frame(minHeight: 46)
        .background(
            SideSeatTheme.surface,
            in: RoundedRectangle(cornerRadius: SideSeatTheme.controlRadius, style: .continuous)
        )
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("schedule-share-daily-availability")
    }

    private func dailyTimeLabel(_ minuteOfDay: Int) -> String {
        if minuteOfDay == 24 * 60 { return "24:00" }
        return String(format: "%02d:%02d", minuteOfDay / 60, minuteOfDay % 60)
    }

    @ViewBuilder
    private var selectionWeekPreview: some View {
        VStack(alignment: .leading, spacing: SideSeatTheme.spaceMD) {
            if isLoading {
                SSLoadingState("Loading your schedule")
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, SideSeatTheme.spaceLG)
            } else if let weekPreviewSnapshot {
                GeometryReader { geometry in
                    ScheduleShareTimelineView(
                        snapshot: weekPreviewSnapshot,
                        dayLimit: 7,
                        compact: true,
                        displayDays: previewWeekDates,
                        highlightedDateKeys: selectedDateKeys,
                        compactDayWidth: max(36, floor((geometry.size.width - 24) / 7)),
                        showsDayHeaders: false
                    )
                }
                .frame(height: 132)
                .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
                .overlay {
                    RoundedRectangle(cornerRadius: 6, style: .continuous)
                        .stroke(Color.primary.opacity(0.10), lineWidth: 0.75)
                }
                .accessibilityIdentifier("schedule-share-selection-week-preview")

                focusedDayEventList
            } else {
                Text("Preview unavailable")
                    .font(.footnote)
                    .foregroundStyle(SideSeatTheme.textSecondary)
            }
        }
        .padding(SideSeatTheme.spaceMD)
        .background(
            SideSeatTheme.surface,
            in: RoundedRectangle(cornerRadius: SideSeatTheme.controlRadius, style: .continuous)
        )
    }

    @ViewBuilder
    private var focusedDayEventList: some View {
        if let day = focusedPreviewDate {
            let dayKey = ScheduleShareDateSelection.dateKey(for: day, calendar: calendar)
            let isIncluded = selectedDateKeys.contains(dayKey)
            let blocks = isIncluded ? previewBlocks(on: day).map(redactedBlock) : []
            VStack(alignment: .leading, spacing: SideSeatTheme.spaceSM) {
                HStack(spacing: SideSeatTheme.spaceSM) {
                    Text(day, format: .dateTime.weekday(.wide).month(.abbreviated).day())
                        .font(.subheadline.weight(.semibold))
                    Spacer(minLength: SideSeatTheme.spaceSM)
                    HStack(spacing: SideSeatTheme.spaceXS) {
                        Image(systemName: isIncluded ? "checkmark.circle.fill" : "eye.slash")
                            .foregroundStyle(isIncluded ? SideSeatTheme.accentText : SideSeatTheme.textSecondary)
                        Text(isIncluded ? "Shared" : "Not shared")
                            .foregroundStyle(isIncluded ? SideSeatTheme.textPrimary : SideSeatTheme.textSecondary)
                    }
                    .font(.caption.weight(.semibold))
                }

                if !isIncluded {
                    Label("This date stays visible but its schedule is not shared.", systemImage: "lock.fill")
                        .font(.footnote)
                        .foregroundStyle(SideSeatTheme.textSecondary)
                        .padding(.vertical, SideSeatTheme.spaceSM)
                } else if blocks.isEmpty {
                    Text("No events on this day")
                        .font(.footnote)
                        .foregroundStyle(SideSeatTheme.textSecondary)
                        .padding(.vertical, SideSeatTheme.spaceSM)
                } else {
                    VStack(spacing: 0) {
                        ForEach(Array(blocks.prefix(4).enumerated()), id: \.element.id) { index, block in
                            selectionPreviewBlockRow(block)
                            if index < min(blocks.count, 4) - 1 {
                                Divider().padding(.leading, 60)
                            }
                        }
                    }
                    if blocks.count > 4 {
                        Text(AppLocalization.string( "\(blocks.count - 4) more events"))
                            .font(.caption)
                            .foregroundStyle(SideSeatTheme.textSecondary)
                    }
                }
            }
            .accessibilityIdentifier("schedule-share-focused-day-events")
        }
    }

    private var eventDetailSelection: some View {
        VStack(alignment: .leading, spacing: SideSeatTheme.spaceMD) {
            sectionHeader(
                title: AppLocalization.string("Share content"),
                detail: detailVisibilitySummary
            ) {
                if !revealOptions.isEmpty {
                    Button(allDetailsVisible ? "Hide all" : "Show all") {
                        let visibleOptionIDs = Set(revealOptions.map(\.id))
                        if allDetailsVisible {
                            selectedRevealOptionIDs.subtract(visibleOptionIDs)
                        } else {
                            selectedRevealOptionIDs.formUnion(visibleOptionIDs)
                        }
                    }
                    .font(.caption.weight(.semibold))
                    .accessibilityIdentifier("schedule-share-toggle-all-details")
                }
            }

            if revealOptions.isEmpty {
                Text(selectedDateKeys.isEmpty
                     ? "Select days to choose which event details are visible."
                     : "There are no event details to configure on the selected days.")
                    .font(.footnote)
                    .foregroundStyle(SideSeatTheme.textSecondary)
            } else {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: SideSeatTheme.spaceSM) {
                        ForEach(revealOptions) { option in
                            revealOptionButton(option)
                        }
                    }
                }

                Text("Hidden events still reserve their time, but their title and location appear only as Busy.")
                    .font(.caption)
                    .foregroundStyle(SideSeatTheme.textSecondary)
            }
        }
    }

    private var linkSettingsDisclosure: some View {
        DisclosureGroup(isExpanded: $isLinkSettingsExpanded) {
            VStack(alignment: .leading, spacing: SideSeatTheme.spaceMD) {
                Divider()

                Toggle("Allow time suggestions", isOn: $allowGuestProposals)
                    .tint(SideSeatTheme.accentText)
                    .accessibilityIdentifier("schedule-share-allow-proposals")

                Picker("Link use", selection: $usageLimit) {
                    Text("One recipient").tag("SINGLE_USE")
                    Text("Reusable").tag("UNLIMITED")
                }
                .pickerStyle(.segmented)
                .accessibilityIdentifier("schedule-share-usage")

                if usageLimit == "UNLIMITED" {
                    HStack {
                        Text("Expires after")
                            .font(.subheadline)
                        Spacer()
                        Picker("Expires after", selection: $expiryDays) {
                            Text("7 days").tag(7)
                            Text("14 days").tag(14)
                            Text("30 days").tag(30)
                        }
                        .labelsHidden()
                        .pickerStyle(.menu)
                        .accessibilityIdentifier("schedule-share-expiry")
                    }
                }
            }
            .padding(.top, SideSeatTheme.spaceSM)
        } label: {
            HStack(spacing: SideSeatTheme.spaceMD) {
                Image(systemName: "link.badge.plus")
                    .foregroundStyle(SideSeatTheme.HubTint.plans)
                VStack(alignment: .leading, spacing: 2) {
                    Text("Advanced settings")
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(SideSeatTheme.textPrimary)
                    Text(linkSettingsSummary)
                        .font(.caption)
                        .foregroundStyle(SideSeatTheme.textSecondary)
                }
            }
            .accessibilityIdentifier("schedule-share-link-settings")
        }
        .tint(SideSeatTheme.textSecondary)
        .padding(.horizontal, SideSeatTheme.spaceMD)
        .padding(.vertical, SideSeatTheme.spaceMD)
        .background(
            SideSeatTheme.surface,
            in: RoundedRectangle(cornerRadius: SideSeatTheme.controlRadius, style: .continuous)
        )
    }

    private var linkSettingsSummary: String {
        let remainingDays: Int
        if isEditingExistingLink,
           usageLimit == originalUsageLimit,
           expiryDays == originalExpiryDays,
           let originalExpiresAt {
            remainingDays = max(1, Int(ceil(originalExpiresAt.timeIntervalSinceNow / 86_400)))
        } else {
            remainingDays = usageLimit == "SINGLE_USE" ? 14 : expiryDays
        }

        if usageLimit == "SINGLE_USE" {
            return AppLocalization.string( "One recipient · expires in \(remainingDays) days")
        }
        return AppLocalization.string( "Reusable · expires in \(remainingDays) days")
    }

    private func sendBar(for route: ScheduleShareRoute) -> some View {
        let button = primaryButtonContent(for: route)
        return VStack(spacing: SideSeatTheme.spaceSM) {
            if selectedDateKeys.isEmpty {
                Text("Select at least one day to continue.")
                    .font(.caption)
                    .foregroundStyle(SideSeatTheme.danger)
            }
            SSPrimaryButton(
                title: button.title,
                isLoading: isSending,
                fill: .product,
                height: 48,
                accessibilityID: button.accessibilityID
            ) {
                Task { await performPrimaryAction(for: route) }
            }
            .disabled(
                isSending
                    || preview == nil
                    || selectedDateKeys.isEmpty
                    || (isEditingExistingLink && ownerSettings == nil)
                    || (route.kind == .contact && route.connectionID == nil)
            )
        }
        .padding(.horizontal, SideSeatTheme.screenHorizontal)
        .padding(.top, SideSeatTheme.spaceMD)
        .padding(.bottom, SideSeatTheme.spaceSM)
        .background(.bar)
    }

    private func primaryButtonContent(for route: ScheduleShareRoute) -> (title: String, accessibilityID: String) {
        switch route.kind {
        case .contact:
            (AppLocalization.string("Send availability"), "schedule-share-send")
        case .contacts:
            (AppLocalization.string( "Continue"), "schedule-share-continue")
        case .editor:
            isEditingExistingLink
                ? (AppLocalization.string( "Save changes"), "schedule-share-owner-save")
                : (AppLocalization.string( "Share"), "schedule-share-open-destinations")
        }
    }

    private func createdLinkCard(_ url: URL) -> some View {
        VStack(alignment: .leading, spacing: SideSeatTheme.spaceMD) {
            sectionHeader(title: AppLocalization.string( "Link ready"), detail: nil)
            HStack(spacing: SideSeatTheme.spaceSM) {
                Image(systemName: "link")
                    .foregroundStyle(SideSeatTheme.HubTint.plans)
                Text(url.host.map { "\($0)\(url.path)" } ?? url.absoluteString)
                    .font(.footnote.monospaced())
                    .lineLimit(1)
                    .truncationMode(.middle)
                Spacer(minLength: SideSeatTheme.spaceSM)
                Button {
                    UIPasteboard.general.url = url
                    didCopyLink.toggle()
                    showShareNotice(AppLocalization.string( "Link copied"))
                } label: {
                    Image(systemName: "doc.on.doc")
                        .frame(width: 34, height: 34)
                }
                .buttonStyle(.bordered)
                .accessibilityLabel("Copy link")
                .accessibilityIdentifier("schedule-share-copy-link")
            }
        }
        .padding(SideSeatTheme.spaceMD)
        .background(SideSeatTheme.surface, in: RoundedRectangle(cornerRadius: SideSeatTheme.controlRadius, style: .continuous))
        .accessibilityIdentifier("schedule-share-created-link")
    }

    private var filteredContacts: [NativeContactRow] {
        let query = contactQuery.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard !query.isEmpty else { return contactsStore.contacts }
        return contactsStore.contacts.filter {
            $0.displayName.lowercased().contains(query)
                || $0.peer.username.lowercased().contains(query)
        }
    }

    private var availableDates: [Date] {
        let today = calendar.startOfDay(for: Date())
        let upcoming = (0..<ScheduleShareDateSelection.maximumDayCount).compactMap {
            calendar.date(byAdding: .day, value: $0, to: today)
        }
        let existing = selectedDateKeys.compactMap {
            ScheduleShareDateSelection.date(from: $0, calendar: calendar)
        }
        return Array(Set(upcoming + existing)).sorted()
    }

    private var availableDateKeys: Set<String> {
        Set(availableDates.map { ScheduleShareDateSelection.dateKey(for: $0, calendar: calendar) })
    }

    private var previewWeekDates: [Date] {
        ScheduleShareDateSelection.weekDays(containing: previewWeekAnchor, calendar: calendar)
    }

    private var previewWeekRangeLabel: String {
        guard let first = previewWeekDates.first, let last = previewWeekDates.last else { return "" }
        if calendar.component(.month, from: first) == calendar.component(.month, from: last) {
            return "\(first.formatted(.dateTime.month(.abbreviated))) \(calendar.component(.day, from: first))–\(calendar.component(.day, from: last))"
        }
        return "\(first.formatted(.dateTime.month(.abbreviated).day())) – \(last.formatted(.dateTime.month(.abbreviated).day()))"
    }

    private var focusedPreviewDate: Date? {
        if let focusedPreviewDateKey,
           let focused = ScheduleShareDateSelection.date(from: focusedPreviewDateKey, calendar: calendar),
           previewWeekDates.contains(where: { calendar.isDate($0, inSameDayAs: focused) }) {
            return focused
        }
        if let selected = previewWeekDates.first(where: {
            selectedDateKeys.contains(ScheduleShareDateSelection.dateKey(for: $0, calendar: calendar))
        }) {
            return selected
        }
        return previewWeekDates.first(where: { availableDateKeys.contains(
            ScheduleShareDateSelection.dateKey(for: $0, calendar: calendar)
        ) }) ?? previewWeekDates.first
    }

    private var selectionEventSummary: String {
        AppLocalization.string( "\(selectedDateKeys.count) days · \(visiblePreviewBlocks.count) events")
    }

    private var weekPreviewSnapshot: NativeScheduleShareSnapshot? {
        guard let preview,
              let first = previewWeekDates.first,
              let last = previewWeekDates.last,
              let rangeEnd = calendar.date(byAdding: .day, value: 1, to: calendar.startOfDay(for: last))
        else { return nil }

        let rangeStart = calendar.startOfDay(for: first)
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let availabilityWindows = dailyAvailabilityWindows(for: previewWeekDates)
        let blocks = (preview.blocks ?? []).filter { block in
            guard intervalOverlapsWeek(
                start: block.start,
                end: block.end,
                from: rangeStart,
                to: rangeEnd
            ), let start = Date.sideSeatChatISO8601(block.start) else { return false }
            return selectedDateKeys.contains(
                ScheduleShareDateSelection.dateKey(for: start, calendar: calendar)
            ) && availabilityWindows.contains(where: { window in
                guard let blockEnd = Date.sideSeatChatISO8601(block.end) else { return false }
                return start < window.end && blockEnd > window.start
            })
        }.map { block in
            redactedBlock(block)
        }
        let freeSlots = preview.freeSlots.flatMap { slot -> [NativeScheduleShareSlot] in
            guard let slotStart = Date.sideSeatChatISO8601(slot.start),
                  let slotEnd = Date.sideSeatChatISO8601(slot.end)
            else { return [] }
            return availabilityWindows.compactMap { window in
                let start = max(slotStart, window.start)
                let end = min(slotEnd, window.end)
                guard end > start else { return nil }
                return NativeScheduleShareSlot(
                    start: formatter.string(from: start),
                    end: formatter.string(from: end)
                )
            }
        }
        return NativeScheduleShareSnapshot(
            ownerDisplayLabel: preview.ownerDisplayLabel,
            rangeStart: formatter.string(from: rangeStart),
            rangeEnd: formatter.string(from: rangeEnd.addingTimeInterval(-0.001)),
            includedDates: previewWeekDates
                .map { ScheduleShareDateSelection.dateKey(for: $0, calendar: calendar) }
                .filter(selectedDateKeys.contains),
            expiresAt: preview.expiresAt,
            allowGuestProposals: preview.allowGuestProposals,
            freeSlots: freeSlots,
            blocks: blocks
        )
    }

    private func dailyAvailabilityWindows(for dates: [Date]) -> [DateInterval] {
        dates.compactMap { date in
            let day = calendar.startOfDay(for: date)
            guard selectedDateKeys.contains(
                ScheduleShareDateSelection.dateKey(for: day, calendar: calendar)
            ), let start = calendar.date(
                byAdding: .minute,
                value: availabilityStartMinutes,
                to: day
            ), let end = calendar.date(
                byAdding: .minute,
                value: availabilityEndMinutes,
                to: day
            ), end > start else { return nil }
            return DateInterval(start: start, end: end)
        }
    }

    private var revealOptions: [ScheduleShareRevealOption] {
        ScheduleShareRevealSelection.options(
            categories: categoryStore.categories,
            blocks: visiblePreviewBlocks
        )
    }

    private var allRevealOptions: [ScheduleShareRevealOption] {
        ScheduleShareRevealSelection.options(
            categories: categoryStore.categories,
            blocks: preview?.blocks ?? []
        )
    }

    private var effectiveSelectedRevealOptionIDs: Set<String> {
        selectedRevealOptionIDs.intersection(Set(revealOptions.map(\.id)))
    }

    private var allDetailsVisible: Bool {
        !revealOptions.isEmpty && effectiveSelectedRevealOptionIDs.count == revealOptions.count
    }

    private var detailVisibilitySummary: String {
        if revealOptions.isEmpty { return AppLocalization.string( "No events") }
        if effectiveSelectedRevealOptionIDs.isEmpty { return AppLocalization.string( "Busy only") }
        if allDetailsVisible { return AppLocalization.string( "All visible") }
        return AppLocalization.string( "\(effectiveSelectedRevealOptionIDs.count) of \(revealOptions.count) visible")
    }

    private var visiblePreviewBlocks: [NativeScheduleShareBlock] {
        (preview?.blocks ?? []).filter { block in
            guard let start = Date.sideSeatChatISO8601(block.start) else { return false }
            return selectedDateKeys.contains(ScheduleShareDateSelection.dateKey(for: start, calendar: calendar))
        }
    }

    private func sectionHeader<Accessory: View>(
        title: String,
        detail: String?,
        @ViewBuilder accessory: () -> Accessory
    ) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: SideSeatTheme.spaceSM) {
            Text(title)
                .font(.headline)
            if let detail {
                Text(detail)
                    .font(.caption)
                    .foregroundStyle(SideSeatTheme.textSecondary)
            }
            Spacer(minLength: SideSeatTheme.spaceSM)
            accessory()
        }
    }

    private func sectionHeader(title: String, detail: String?) -> some View {
        sectionHeader(title: title, detail: detail) { EmptyView() }
    }

    private func quickDayButton(_ title: LocalizedStringKey, keys: Set<String>) -> some View {
        let isActive = selectedDateKeys == keys
        return Button {
            applyDateSelection(keys)
        } label: {
            Text(title)
                .font(.caption.weight(.semibold))
                .foregroundStyle(isActive ? Color.white : SideSeatTheme.textPrimary)
                .padding(.horizontal, 12)
                .frame(height: 34)
                .background(isActive ? SideSeatTheme.accent : SideSeatTheme.fillTertiary, in: Capsule())
        }
        .buttonStyle(SSPressButtonStyle())
    }

    private func weekDayButton(_ date: Date) -> some View {
        let key = ScheduleShareDateSelection.dateKey(for: date, calendar: calendar)
        let isSelected = selectedDateKeys.contains(key)
        let isFocused = focusedPreviewDate.map { calendar.isDate($0, inSameDayAs: date) } ?? false
        let isSelectable = availableDateKeys.contains(key)
        let eventCount = previewBlocks(on: date).count
        return Button {
            focusedPreviewDateKey = key
            if isSelected {
                selectedDateKeys.remove(key)
            } else if selectedDateKeys.count < ScheduleShareDateSelection.maximumDayCount {
                selectedDateKeys.insert(key)
            }
        } label: {
            VStack(spacing: 3) {
                Text(date, format: .dateTime.weekday(.narrow))
                    .font(.caption2.weight(.semibold))
                Text(date, format: .dateTime.day())
                    .font(.subheadline.weight(.semibold))
                    .monospacedDigit()
                Group {
                    if eventCount > 0 {
                        Text(verbatim: "\(eventCount)")
                    } else {
                        Text(verbatim: " ")
                    }
                }
                .font(.system(size: 9, weight: .bold, design: .rounded))
                .frame(minWidth: 14, minHeight: 13)
                .background(
                    eventCount > 0
                        ? (isSelected ? Color.white.opacity(0.2) : SideSeatTheme.fillTertiary)
                        : Color.clear,
                    in: Capsule()
                )
            }
            .foregroundStyle(isSelected ? Color.white : SideSeatTheme.textPrimary)
            .frame(maxWidth: .infinity, minHeight: 62)
            .background(
                isSelected ? AnyShapeStyle(SideSeatTheme.accent) : AnyShapeStyle(SideSeatTheme.surface),
                in: RoundedRectangle(cornerRadius: SideSeatTheme.controlRadius, style: .continuous)
            )
            .overlay {
                RoundedRectangle(cornerRadius: SideSeatTheme.controlRadius, style: .continuous)
                    .stroke(
                        isFocused ? SideSeatTheme.accent : Color.primary.opacity(0.08),
                        lineWidth: isFocused ? 1.5 : 0.75
                    )
            }
            .opacity(isSelectable ? 1 : 0.32)
        }
        .buttonStyle(SSPressButtonStyle())
        .disabled(!isSelectable)
        .accessibilityLabel(date.formatted(date: .complete, time: .omitted))
        .accessibilityValue(
            "\(isSelected ? AppLocalization.string( "Selected") : AppLocalization.string( "Not selected")), \(eventCount) \(AppLocalization.string( "events"))"
        )
        .accessibilityIdentifier("schedule-share-week-day-\(key)")
    }

    private func applyDateSelection(_ keys: Set<String>) {
        selectedDateKeys = keys
        guard let firstKey = keys.sorted().first,
              let firstDate = ScheduleShareDateSelection.date(from: firstKey, calendar: calendar)
        else { return }
        previewWeekAnchor = firstDate
        focusedPreviewDateKey = firstKey
    }

    private func movePreviewWeek(by offset: Int) {
        guard let target = calendar.date(byAdding: .weekOfYear, value: offset, to: previewWeekAnchor) else {
            return
        }
        previewWeekAnchor = target
        let targetDays = ScheduleShareDateSelection.weekDays(containing: target, calendar: calendar)
        let focused = targetDays.first(where: {
            selectedDateKeys.contains(ScheduleShareDateSelection.dateKey(for: $0, calendar: calendar))
        }) ?? targetDays.first(where: {
            availableDateKeys.contains(ScheduleShareDateSelection.dateKey(for: $0, calendar: calendar))
        })
        focusedPreviewDateKey = focused.map {
            ScheduleShareDateSelection.dateKey(for: $0, calendar: calendar)
        }
    }

    private func canMovePreviewWeek(by offset: Int) -> Bool {
        ScheduleShareDateSelection.weekDays(
            containing: previewWeekAnchor,
            offset: offset,
            calendar: calendar
        ).contains {
            availableDateKeys.contains(ScheduleShareDateSelection.dateKey(for: $0, calendar: calendar))
        }
    }

    private func revealOptionButton(_ option: ScheduleShareRevealOption) -> some View {
        let isSelected = selectedRevealOptionIDs.contains(option.id)
        return Button {
            if isSelected {
                selectedRevealOptionIDs.remove(option.id)
            } else {
                selectedRevealOptionIDs.insert(option.id)
            }
        } label: {
            HStack(spacing: 6) {
                Circle()
                    .fill(Color(hex: option.colorHex) ?? SideSeatTheme.textSecondary)
                    .frame(width: 8, height: 8)
                Text(option.name)
                    .font(.caption.weight(.semibold))
                    .lineLimit(1)
                    .foregroundStyle(isSelected ? SideSeatTheme.textPrimary : SideSeatTheme.textSecondary)
                Image(systemName: isSelected ? "checkmark" : "eye.slash")
                    .font(.caption2.weight(.bold))
                    .foregroundStyle(isSelected ? SideSeatTheme.accentText : SideSeatTheme.textSecondary)
            }
            .padding(.horizontal, 12)
            .frame(height: 36)
            .background(
                isSelected ? SideSeatTheme.Chat.selectedChipFill : SideSeatTheme.fillTertiary,
                in: Capsule()
            )
        }
        .buttonStyle(SSPressButtonStyle())
        .accessibilityValue(isSelected ? AppLocalization.string( "Details visible") : AppLocalization.string( "Busy only"))
        .accessibilityIdentifier("schedule-share-category-\(option.id)")
    }

    private func previewBlocks(on day: Date) -> [NativeScheduleShareBlock] {
        guard let dayInterval = calendar.dateInterval(of: .day, for: day) else { return [] }
        return (preview?.blocks ?? []).filter {
            intervalOverlapsWeek(
                start: $0.start,
                end: $0.end,
                from: dayInterval.start,
                to: dayInterval.end
            )
        }.sorted {
            (Date.sideSeatChatISO8601($0.start) ?? .distantPast)
                < (Date.sideSeatChatISO8601($1.start) ?? .distantPast)
        }
    }

    private func intervalOverlapsWeek(
        start: String,
        end: String,
        from rangeStart: Date,
        to rangeEnd: Date
    ) -> Bool {
        guard let startDate = Date.sideSeatChatISO8601(start),
              let endDate = Date.sideSeatChatISO8601(end)
        else { return false }
        return startDate < rangeEnd && endDate > rangeStart
    }

    private func selectionPreviewBlockRow(_ block: NativeScheduleShareBlock) -> some View {
        let start = Date.sideSeatChatISO8601(block.start)
        let end = Date.sideSeatChatISO8601(block.end)
        return HStack(alignment: .top, spacing: SideSeatTheme.spaceMD) {
            VStack(alignment: .trailing, spacing: 2) {
                Text(start?.formatted(date: .omitted, time: .shortened) ?? "--")
                    .font(.caption.weight(.semibold))
                    .monospacedDigit()
                Text(end?.formatted(date: .omitted, time: .shortened) ?? "--")
                    .font(.caption2)
                    .monospacedDigit()
                    .foregroundStyle(SideSeatTheme.textSecondary)
            }
            .frame(width: 46, alignment: .trailing)

            Capsule()
                .fill(blockColor(block))
                .frame(width: 3, height: 36)

            VStack(alignment: .leading, spacing: 2) {
                Text(block.title ?? AppLocalization.string( "Busy"))
                    .font(.subheadline.weight(.semibold))
                    .lineLimit(2)
                if let location = block.location, !location.isEmpty {
                    Label(location, systemImage: "mappin.and.ellipse")
                        .font(.caption)
                        .foregroundStyle(SideSeatTheme.textSecondary)
                        .lineLimit(1)
                }
            }
            Spacer(minLength: 0)
        }
        .padding(.horizontal, SideSeatTheme.spaceMD)
        .padding(.vertical, 10)
    }

    private func isBlockDetailRevealed(_ block: NativeScheduleShareBlock) -> Bool {
        guard let optionID = ScheduleShareRevealSelection.optionID(for: block) else { return false }
        return selectedRevealOptionIDs.contains(optionID)
    }

    private func redactedBlock(_ block: NativeScheduleShareBlock) -> NativeScheduleShareBlock {
        let revealsDetails = isBlockDetailRevealed(block)
        return NativeScheduleShareBlock(
            kind: revealsDetails ? "busy_detail" : "busy_anonymous",
            start: block.start,
            end: block.end,
            title: revealsDetails ? block.title : nil,
            location: revealsDetails ? block.location : nil,
            categoryId: revealsDetails ? block.categoryId : nil,
            categoryPresetKey: revealsDetails ? block.categoryPresetKey : nil,
            categoryName: revealsDetails ? block.categoryName : nil,
            categoryColor: revealsDetails ? block.categoryColor : nil
        )
    }

    private func blockColor(_ block: NativeScheduleShareBlock) -> Color {
        if let color = block.categoryColor.flatMap(Color.init(hex:)) { return color }
        if let preset = block.categoryPresetKey {
            return Color(hex: presetColor(preset)) ?? SideSeatTheme.courseFallback
        }
        return SideSeatTheme.textSecondary
    }

    private func presetColor(_ preset: String) -> String {
        switch preset {
        case "course": "#3385DB"
        case "personal": "#EA580C"
        case "work": "#16A34A"
        case "important": "#DC2626"
        case "other": "#7C3AED"
        default: "#64748B"
        }
    }

    private func issueText(_ text: String) -> some View {
        Label(text, systemImage: "exclamationmark.circle")
            .font(.footnote)
            .foregroundStyle(SideSeatTheme.danger)
            .frame(maxWidth: .infinity, alignment: .leading)
            .accessibilityIdentifier("schedule-share-issue")
    }

    @MainActor
    private func load() async {
        guard preview == nil, !isLoading else { return }
        isLoading = true
        issue = nil
        defer { isLoading = false }

        if initialConnectionID == nil, !isEditingExistingLink {
            await contactsStore.load(using: session)
        }
        await categoryStore.load(using: session)

        if isEditingExistingLink {
            await loadExistingShare()
            return
        }

        await loadPreview()
        initializeRevealOptionsIfNeeded()
    }

    @MainActor
    private func loadExistingShare() async {
        guard let editingLinkID else { return }

        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("--ui-testing-authenticated") {
            let snapshot = Self.uiTestingPreview(calendar: calendar)
            let dates = ScheduleShareDateSelection.nextDays(3, calendar: calendar)
            guard let range = ScheduleShareDateSelection.range(for: dates, calendar: calendar) else {
                return
            }
            let formatter = ISO8601DateFormatter()
            formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
            applyOwnerPayload(
                NativeScheduleShareOwnerPayload(
                    snapshot: snapshot,
                    settings: NativeScheduleShareOwnerSettings(
                        rangeStart: formatter.string(from: range.start),
                        rangeEnd: formatter.string(from: range.end),
                        revealConfig: NativeScheduleShareRevealConfigRequest(
                            categoryIds: ["ui-calendar-custom"],
                            presetKeys: ["none"],
                            hideAllDetails: false,
                            includedDates: dates.sorted(),
                            availabilityStartMinutes: 9 * 60,
                            availabilityEndMinutes: 21 * 60
                        ),
                        allowGuestProposals: true,
                        usageLimit: "UNLIMITED",
                        expiresAt: formatter.string(
                            from: calendar.date(byAdding: .day, value: 14, to: Date()) ?? Date()
                        )
                    ),
                    linkId: editingLinkID,
                    pendingProposalCount: ProcessInfo.processInfo.arguments.contains(
                        "--ui-testing-schedule-share-pending"
                    ) ? 2 : 0,
                    updatedAt: formatter.string(from: Date()),
                    isUpdated: true
                )
            )
            return
        }
        #endif

        do {
            let encoded = editingLinkID.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed)
                ?? editingLinkID
            let response: APIEnvelope<NativeScheduleShareOwnerPayload> = try await session.sendAuthorized(
                "api/v1/schedule-shares/owner/\(encoded)"
            )
            applyOwnerPayload(response.data)
        } catch {
            issue = error.localizedDescription
        }
    }

    @MainActor
    private func applyOwnerPayload(_ payload: NativeScheduleShareOwnerPayload) {
        preview = payload.snapshot
        ownerSettings = payload.settings
        pendingProposalCount = payload.pendingProposalCount

        let configuredDates = Set(payload.settings.revealConfig.includedDates)
        if configuredDates.isEmpty,
           let start = Date.sideSeatChatISO8601(payload.settings.rangeStart),
           let end = Date.sideSeatChatISO8601(payload.settings.rangeEnd) {
            selectedDateKeys = Set(
                ScheduleShareDateSelection.dates(from: start, through: end, calendar: calendar)
                    .map { ScheduleShareDateSelection.dateKey(for: $0, calendar: calendar) }
            )
        } else {
            selectedDateKeys = configuredDates
        }

        let reveal = payload.settings.revealConfig
        if !reveal.hideAllDetails, reveal.categoryIds.isEmpty, reveal.presetKeys.isEmpty {
            selectedRevealOptionIDs = Set(allRevealOptions.map(\.id))
        } else if reveal.hideAllDetails {
            selectedRevealOptionIDs = []
        } else {
            let categoryIDs = Set(reveal.categoryIds)
            let presetKeys = Set(reveal.presetKeys)
            selectedRevealOptionIDs = Set(allRevealOptions.compactMap { option in
                if categoryIDs.contains(option.id) { return option.id }
                if option.id == ScheduleShareRevealOption.courseSourceID,
                   presetKeys.contains("course") {
                    return option.id
                }
                if option.id == ScheduleShareRevealOption.uncategorizedID,
                   presetKeys.contains("none") {
                    return option.id
                }
                return nil
            })
        }

        allowGuestProposals = payload.settings.allowGuestProposals
        usageLimit = payload.settings.usageLimit
        availabilityStartMinutes = payload.settings.revealConfig.availabilityStartMinutes ?? 0
        availabilityEndMinutes = payload.settings.revealConfig.availabilityEndMinutes ?? 24 * 60
        originalExpiresAt = Date.sideSeatChatISO8601(payload.settings.expiresAt)
        expiryDays = nearestExpiryOption(to: originalExpiresAt)
        originalExpiryDays = expiryDays
        originalSelectedDateKeys = selectedDateKeys
        originalSelectedRevealOptionIDs = selectedRevealOptionIDs
        originalAllowsGuestProposals = allowGuestProposals
        originalUsageLimit = usageLimit
        originalAvailabilityStartMinutes = availabilityStartMinutes
        originalAvailabilityEndMinutes = availabilityEndMinutes
        didInitializeRevealOptions = true
        didConfigureExternalLinkDefaults = true
        isLinkSettingsExpanded = true

        if let firstKey = selectedDateKeys.sorted().first,
           let firstDate = ScheduleShareDateSelection.date(from: firstKey, calendar: calendar) {
            previewWeekAnchor = firstDate
            focusedPreviewDateKey = firstKey
        }
    }

    private func nearestExpiryOption(to date: Date?) -> Int {
        guard let date else { return 14 }
        let remainingDays = max(1, Int(ceil(date.timeIntervalSinceNow / 86_400)))
        return [7, 14, 30].min(by: {
            abs($0 - remainingDays) < abs($1 - remainingDays)
        }) ?? 14
    }

    @MainActor
    private func loadPreview() async {
        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("--ui-testing-authenticated") {
            preview = Self.uiTestingPreview(calendar: calendar)
            return
        }
        #endif

        do {
            let response: APIEnvelope<NativeScheduleShareOwnerPreviewPayload> = try await session.sendAuthorized(
                "api/v1/schedule-shares/owner-preview"
            )
            preview = response.data.snapshot
        } catch {
            issue = error.localizedDescription
        }
    }

    @MainActor
    private func initializeRevealOptionsIfNeeded() {
        guard !didInitializeRevealOptions else { return }
        didInitializeRevealOptions = true
        selectedRevealOptionIDs = []
    }

    @MainActor
    private func performPrimaryAction(for route: ScheduleShareRoute) async {
        guard !isSending else { return }

        switch route.kind {
        case .contact:
            guard let connectionID = route.connectionID else { return }
            await sendToContact(
                connectionID: connectionID,
                recipientName: route.displayName ?? AppLocalization.string( "This chat")
            )
        case .contacts:
            break
        case .editor:
            if isEditingExistingLink {
                await requestExistingShareUpdate()
            } else {
                showShareDestinations = true
            }
        }
    }

    @MainActor
    private func requestExistingShareUpdate() async {
        guard let request = makeCreateRequest(), ownerSettings != nil else { return }
        let currentRevealOptionIDs = effectiveSelectedRevealOptionIDs
        let expandsVisibility = ScheduleShareEditImpact.expandsVisibilityOrAccess(
            originalDates: originalSelectedDateKeys,
            newDates: selectedDateKeys,
            originalRevealOptionIDs: originalSelectedRevealOptionIDs,
            newRevealOptionIDs: currentRevealOptionIDs,
            originalAllowsProposals: originalAllowsGuestProposals,
            newAllowsProposals: allowGuestProposals,
            originalUsageLimit: originalUsageLimit,
            newUsageLimit: usageLimit,
            originalExpiresAt: originalExpiresAt,
            newExpiresAt: Date.sideSeatChatISO8601(request.expiresAt),
            originalAvailabilityStartMinutes: originalAvailabilityStartMinutes,
            newAvailabilityStartMinutes: availabilityStartMinutes,
            originalAvailabilityEndMinutes: originalAvailabilityEndMinutes,
            newAvailabilityEndMinutes: availabilityEndMinutes
        )
        let affectsProposals = ScheduleShareEditImpact.canAffectPendingProposals(
            pendingProposalCount: pendingProposalCount,
            originalDates: originalSelectedDateKeys,
            newDates: selectedDateKeys,
            originalAllowsProposals: originalAllowsGuestProposals,
            newAllowsProposals: allowGuestProposals,
            originalAvailabilityStartMinutes: originalAvailabilityStartMinutes,
            newAvailabilityStartMinutes: availabilityStartMinutes,
            originalAvailabilityEndMinutes: originalAvailabilityEndMinutes,
            newAvailabilityEndMinutes: availabilityEndMinutes
        )

        guard expandsVisibility || affectsProposals else {
            await updateExistingShare()
            return
        }

        var messages: [String] = []
        if expandsVisibility {
            messages.append(
                AppLocalization.string(
                    "This will reveal additional dates or event details, or make the link accessible more broadly."
                )
            )
        }
        if affectsProposals {
            messages.append(
                AppLocalization.string(
                    "\(pendingProposalCount) pending proposals may be affected by changes to the shared dates."
                )
            )
        }
        editConfirmationMessage = messages.joined(separator: "\n\n")
        showEditConfirmation = true
    }

    @MainActor
    private func selectShareDestination(_ destination: ScheduleShareDestination) {
        if case .imagePreview = destination {
            openScheduleImagePreview()
            return
        }

        showShareDestinations = false
        Task { @MainActor in
            try? await Task.sleep(nanoseconds: 250_000_000)
            switch destination {
            case .contacts:
                routePath.append(.contacts)
            case .copyLink:
                await useShareLink(copyOnly: true)
            case .shareLink:
                await useShareLink(copyOnly: false)
            case .imagePreview:
                break
            }
        }
    }

    @MainActor
    private func selectShareContact(_ contact: NativeContactRow) {
        showShareDestinations = false
        Task { @MainActor in
            try? await Task.sleep(nanoseconds: 250_000_000)
            await sendToContact(
                connectionID: contact.connectionId,
                recipientName: contact.displayName
            )
        }
    }

    private func makeCreateRequest() -> NativeScheduleShareCreateRequest? {
        guard let range = ScheduleShareDateSelection.range(for: selectedDateKeys, calendar: calendar) else {
            return nil
        }

        let revealSelection = ScheduleShareRevealSelection.requestSelection(
            options: revealOptions,
            selectedOptionIDs: selectedRevealOptionIDs
        )
        let revealConfig: NativeScheduleShareRevealConfigRequest
        if isEditingExistingLink,
           selectedRevealOptionIDs == originalSelectedRevealOptionIDs,
           let originalReveal = ownerSettings?.revealConfig {
            revealConfig = NativeScheduleShareRevealConfigRequest(
                categoryIds: originalReveal.categoryIds,
                presetKeys: originalReveal.presetKeys,
                hideAllDetails: originalReveal.hideAllDetails,
                includedDates: selectedDateKeys.sorted(),
                availabilityStartMinutes: availabilityStartMinutes,
                availabilityEndMinutes: availabilityEndMinutes
            )
        } else {
            revealConfig = NativeScheduleShareRevealConfigRequest(
                categoryIds: revealSelection.categoryIDs,
                presetKeys: revealSelection.presetKeys,
                hideAllDetails: effectiveSelectedRevealOptionIDs.isEmpty,
                includedDates: selectedDateKeys.sorted(),
                availabilityStartMinutes: availabilityStartMinutes,
                availabilityEndMinutes: availabilityEndMinutes
            )
        }
        let expiration: Date
        if isEditingExistingLink,
           usageLimit == originalUsageLimit,
           expiryDays == originalExpiryDays,
           let originalExpiresAt {
            expiration = originalExpiresAt
        } else {
            expiration = calendar.date(
                byAdding: .day,
                value: usageLimit == "SINGLE_USE" ? 14 : expiryDays,
                to: Date()
            ) ?? Date().addingTimeInterval(14 * 86_400)
        }
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return NativeScheduleShareCreateRequest(
            rangeStart: formatter.string(from: range.start),
            rangeEnd: formatter.string(from: range.end),
            revealConfig: revealConfig,
            allowGuestProposals: allowGuestProposals,
            usageLimit: usageLimit,
            expiresAt: formatter.string(from: expiration)
        )
    }

    @MainActor
    private func updateExistingShare() async {
        guard let editingLinkID, let request = makeCreateRequest(), !isSending else { return }
        isSending = true
        issue = nil
        defer { isSending = false }

        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("--ui-testing-authenticated") {
            postShareUpdateNotification(linkID: editingLinkID)
            onUpdated()
            dismiss()
            return
        }
        #endif

        do {
            let encoded = editingLinkID.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed)
                ?? editingLinkID
            let response: APIEnvelope<NativeScheduleShareOwnerPayload> = try await session.sendAuthorized(
                "api/v1/schedule-shares/owner/\(encoded)",
                method: .patch,
                body: request
            )
            applyOwnerPayload(response.data)
            postShareUpdateNotification(linkID: response.data.linkId)
            onUpdated()
            dismiss()
        } catch {
            issue = error.localizedDescription
        }
    }

    private func postShareUpdateNotification(linkID: String) {
        NotificationCenter.default.post(
            name: .sideSeatScheduleShareDidUpdate,
            object: nil,
            userInfo: [ScheduleShareNotificationKey.linkID: linkID]
        )
    }

    @MainActor
    private func sendToContact(connectionID: String, recipientName: String) async {
        guard let request = makeCreateRequest(), !isSending else { return }

        isSending = true
        sendingConnectionID = connectionID
        issue = nil
        defer {
            isSending = false
            sendingConnectionID = nil
        }

        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("--ui-testing-authenticated") {
            onSent(recipientName)
            dismiss()
            return
        }
        #endif

        do {
            let encodedConnectionID = connectionID.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed)
                ?? connectionID
            let _: APIEnvelope<NativeScheduleShareCreatePayload> = try await session.sendAuthorized(
                "api/v1/connections/\(encodedConnectionID)/schedule-shares",
                method: .post,
                body: request,
                idempotencyKey: UUID().uuidString
            )
            onSent(recipientName)
            dismiss()
        } catch {
            issue = error.localizedDescription
        }
    }

    @MainActor
    private func useShareLink(copyOnly: Bool) async {
        let url: URL
        if let createdShareURL {
            url = createdShareURL
        } else if let createdURL = await createShareLink() {
            url = createdURL
        } else {
            return
        }

        if copyOnly {
            UIPasteboard.general.url = url
            didCopyLink.toggle()
            showShareNotice(AppLocalization.string( "Link copied"))
        } else {
            presentLinkShare(url)
        }
    }

    @MainActor
    private func createShareLink() async -> URL? {
        guard let request = makeCreateRequest(), !isSending else { return nil }

        isSending = true
        issue = nil
        defer { isSending = false }

        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("--ui-testing-authenticated") {
            let url = URL(string: "https://www.sideseat.de/share/view/ui-schedule-share")!
            createdShareURL = url
            return url
        }
        #endif

        do {
            let response: APIEnvelope<NativeScheduleShareLinkCreatePayload> = try await session.sendAuthorized(
                "api/v1/schedule-shares",
                method: .post,
                body: request,
                idempotencyKey: UUID().uuidString
            )
            guard let url = URL(string: response.data.shareUrl) else {
                issue = AppLocalization.string( "The server returned an invalid share link.")
                return nil
            }
            createdShareURL = url
            return url
        } catch {
            issue = error.localizedDescription
            return nil
        }
    }

    @MainActor
    private func presentLinkShare(_ url: URL) {
        sharePayload = SSSharePayload(items: [AppLocalization.string("View my SideSeat availability"), url])
    }

    @MainActor
    private func openScheduleImagePreview() {
        guard !isSending, !showImagePreview else { return }
        imagePreviewImages = []
        imagePreviewIssue = nil
        imagePreviewNotice = nil
        issue = nil
        showImagePreview = true
        startScheduleImagePreviewGeneration()
    }

    @MainActor
    private func startScheduleImagePreviewGeneration() {
        guard imagePreviewTask == nil, !isSending else { return }
        cancelScheduleImageSave()
        imagePreviewImages = []
        imagePreviewIssue = nil
        imagePreviewNotice = nil

        let operationID = UUID()
        imagePreviewOperationID = operationID
        isPreparingImagePreview = true

        imagePreviewTask = Task { @MainActor in
            defer {
                if imagePreviewOperationID == operationID {
                    imagePreviewTask = nil
                    imagePreviewOperationID = nil
                    isPreparingImagePreview = false
                }
            }

            do {
                // Let the full-screen preview finish its presentation before image rendering.
                #if DEBUG
                let previewDelay: UInt64 = ProcessInfo.processInfo.arguments.contains(
                    "--ui-testing-slow-image-preview"
                ) ? 5_000_000_000 : 120_000_000
                #else
                let previewDelay: UInt64 = 120_000_000
                #endif
                try await Task.sleep(nanoseconds: previewDelay)
            } catch {
                return
            }

            let posterShareURL: URL
            if let createdShareURL {
                posterShareURL = createdShareURL
            } else {
                let createdURL = await createShareLink()
                guard !Task.isCancelled,
                      imagePreviewOperationID == operationID else {
                    issue = nil
                    return
                }
                guard let createdURL else {
                    imagePreviewIssue = issue ?? AppLocalization.string(
                        "The schedule image could not be created."
                    )
                    issue = nil
                    return
                }
                posterShareURL = createdURL
            }

            guard !Task.isCancelled,
                  imagePreviewOperationID == operationID else { return }
            let images = makeScheduleShareImages(shareURL: posterShareURL)
            guard !Task.isCancelled,
                  imagePreviewOperationID == operationID else { return }
            if images.isEmpty {
                if imagePreviewIssue == nil {
                    imagePreviewIssue = AppLocalization.string(
                        "The schedule image could not be created."
                    )
                }
                return
            }
            imagePreviewImages = images
        }
    }

    @MainActor
    private func makeScheduleShareImages(shareURL: URL) -> [UIImage] {
        guard !Task.isCancelled else { return [] }

        let renderStartedAt = ProcessInfo.processInfo.systemUptime
        ScheduleSharePhotoSaveDiagnostics.logger.notice(
            "event=preview_started event_count=\(self.visiblePreviewBlocks.count) selected_day_count=\(self.selectedDateKeys.count)"
        )

        let entries = visiblePreviewBlocks.compactMap { block -> ScheduleSharePosterEntry? in
            guard let start = Date.sideSeatChatISO8601(block.start),
                  let end = Date.sideSeatChatISO8601(block.end) else { return nil }
            let revealsDetails = isBlockDetailRevealed(block)
            return ScheduleSharePosterEntry(
                id: block.id,
                start: start,
                end: end,
                title: revealsDetails
                    ? (block.title ?? AppLocalization.string("Busy"))
                    : AppLocalization.string("Busy"),
                location: revealsDetails ? block.location : nil,
                color: revealsDetails ? blockColor(block) : SideSeatTheme.textSecondary.opacity(0.55),
                isHidden: !revealsDetails
            )
        }
        let selectedDates = selectedDateKeys.compactMap {
            ScheduleShareDateSelection.date(from: $0, calendar: calendar)
        }.sorted()
        let freeSlots = (preview?.freeSlots ?? []).compactMap { slot -> ScheduleSharePosterFreeSlot? in
            guard let start = Date.sideSeatChatISO8601(slot.start),
                  let end = Date.sideSeatChatISO8601(slot.end),
                  selectedDateKeys.contains(
                    ScheduleShareDateSelection.dateKey(for: start, calendar: calendar)
                  ) else { return nil }
            return ScheduleSharePosterFreeSlot(id: slot.id, start: start, end: end)
        }
        let images = ScheduleSharePosterRenderer.images(
            entries: entries,
            freeSlots: freeSlots,
            selectedDates: selectedDates,
            hiddenCount: entries.filter(\.isHidden).count,
            ownerDisplayLabel: preview?.ownerDisplayLabel ?? AppLocalization.string("You"),
            shareURL: shareURL
        )
        guard let firstImage = images.first else {
            let renderDuration = ScheduleSharePhotoSaveDiagnostics.elapsedMilliseconds(since: renderStartedAt)
            ScheduleSharePhotoSaveDiagnostics.logger.error(
                "stage=render outcome=failure duration_ms=\(renderDuration)"
            )
            imagePreviewIssue = AppLocalization.string("The schedule image could not be created.")
            return []
        }
        let renderDuration = ScheduleSharePhotoSaveDiagnostics.elapsedMilliseconds(since: renderStartedAt)
        let pixelWidth = Int(firstImage.size.width * firstImage.scale)
        let pixelHeight = Int(firstImage.size.height * firstImage.scale)
        ScheduleSharePhotoSaveDiagnostics.logger.notice(
            "stage=render outcome=success duration_ms=\(renderDuration) page_count=\(images.count) pixel_width=\(pixelWidth) pixel_height=\(pixelHeight)"
        )
        return images
    }

    @MainActor
    private func startScheduleImageSave() {
        guard imageSaveTask == nil,
              !imagePreviewImages.isEmpty,
              !isPreparingImagePreview else { return }
        let operationID = UUID()
        let images = imagePreviewImages
        imageSaveOperationID = operationID
        isSavingImage = true
        imagePreviewIssue = nil
        imagePreviewNotice = nil

        imageSaveTask = Task { @MainActor in
            let didSave = await saveScheduleImagesToPhotos(images)
            guard imageSaveOperationID == operationID else { return }
            imageSaveTask = nil
            imageSaveOperationID = nil
            isSavingImage = false
            if didSave {
                showImagePreviewNotice(AppLocalization.string("Saved to Photos"))
            }
        }
    }

    private func cancelScheduleImageSave() {
        imageSaveTask?.cancel()
        imageSaveTask = nil
        imageSaveOperationID = nil
        isSavingImage = false
    }

    private func closeScheduleImagePreview() {
        imagePreviewTask?.cancel()
        imagePreviewTask = nil
        imagePreviewOperationID = nil
        isPreparingImagePreview = false
        cancelScheduleImageSave()
        showImagePreview = false
    }

    private func cancelScheduleImageFlow() {
        imagePreviewTask?.cancel()
        imagePreviewTask = nil
        imagePreviewOperationID = nil
        imagePreviewImages = []
        imagePreviewIssue = nil
        imagePreviewNotice = nil
        isPreparingImagePreview = false
        cancelScheduleImageSave()
    }

    @MainActor
    private func showImagePreviewNotice(_ text: String) {
        withAnimation(.easeOut(duration: 0.2)) {
            imagePreviewNotice = text
        }
        Task { @MainActor in
            try? await Task.sleep(nanoseconds: 2_000_000_000)
            withAnimation(.easeIn(duration: 0.2)) {
                if imagePreviewNotice == text {
                    imagePreviewNotice = nil
                }
            }
        }
    }

    @MainActor
    private func saveScheduleImagesToPhotos(_ images: [UIImage]) async -> Bool {
        guard !Task.isCancelled, !images.isEmpty else { return false }

        let totalStartedAt = ProcessInfo.processInfo.systemUptime
        ScheduleSharePhotoSaveDiagnostics.logger.notice(
            "event=save_started page_count=\(images.count)"
        )

        #if DEBUG
        let arguments = ProcessInfo.processInfo.arguments
        if arguments.contains("--ui-testing-authenticated"),
           !arguments.contains("--ui-testing-real-photo-save") {
            let delay: UInt64 = arguments.contains("--ui-testing-slow-photo-save")
                ? 5_000_000_000
                : 800_000_000
            try? await Task.sleep(nanoseconds: delay)
            guard !Task.isCancelled else { return false }
            let totalDuration = ScheduleSharePhotoSaveDiagnostics.elapsedMilliseconds(since: totalStartedAt)
            ScheduleSharePhotoSaveDiagnostics.logger.notice(
                "event=finished outcome=simulated_success duration_ms=\(totalDuration)"
            )
            return true
        }
        #endif

        let encodeStartedAt = ProcessInfo.processInfo.systemUptime
        let imageDataPages = images.compactMap { $0.pngData() }
        guard imageDataPages.count == images.count else {
            let encodeDuration = ScheduleSharePhotoSaveDiagnostics.elapsedMilliseconds(since: encodeStartedAt)
            ScheduleSharePhotoSaveDiagnostics.logger.error(
                "stage=encode outcome=failure duration_ms=\(encodeDuration)"
            )
            imagePreviewIssue = AppLocalization.string("The schedule image could not be created.")
            return false
        }
        let encodeDuration = ScheduleSharePhotoSaveDiagnostics.elapsedMilliseconds(since: encodeStartedAt)
        let encodedByteCount = imageDataPages.reduce(0) { $0 + $1.count }
        ScheduleSharePhotoSaveDiagnostics.logger.notice(
            "stage=encode outcome=success duration_ms=\(encodeDuration) page_count=\(imageDataPages.count) byte_count=\(encodedByteCount)"
        )

        let photoLibrary = SystemScheduleSharePhotoLibraryClient()
        let authorizationStartedAt = ProcessInfo.processInfo.systemUptime
        let initialAuthorization = photoLibrary.authorizationStatus()
        let authorization: PHAuthorizationStatus
        if initialAuthorization == .notDetermined {
            authorization = await photoLibrary.requestAuthorization()
        } else {
            authorization = initialAuthorization
        }
        let authorizationDuration = ScheduleSharePhotoSaveDiagnostics.elapsedMilliseconds(since: authorizationStartedAt)
        ScheduleSharePhotoSaveDiagnostics.logger.notice(
            "stage=authorization initial=\(ScheduleSharePhotoSaveDiagnostics.label(for: initialAuthorization), privacy: .public) final=\(ScheduleSharePhotoSaveDiagnostics.label(for: authorization), privacy: .public) duration_ms=\(authorizationDuration)"
        )
        guard !Task.isCancelled else { return false }
        guard authorization == .authorized || authorization == .limited else {
            let totalDuration = ScheduleSharePhotoSaveDiagnostics.elapsedMilliseconds(since: totalStartedAt)
            ScheduleSharePhotoSaveDiagnostics.logger.error(
                "event=finished outcome=authorization_denied duration_ms=\(totalDuration)"
            )
            imagePreviewIssue = AppLocalization.string("Photo access is required to save this image.")
            return false
        }

        let writeStartedAt = ProcessInfo.processInfo.systemUptime
        do {
            let photoPages = imageDataPages.enumerated().map { index, imageData in
                let filename = imageDataPages.count == 1
                    ? "SideSeat Schedule.png"
                    : "SideSeat Schedule \(index + 1) of \(imageDataPages.count).png"
                return ScheduleSharePhotoPage(data: imageData, filename: filename)
            }
            try Task.checkCancellation()
            try await photoLibrary.save(photoPages)
            let writeDuration = ScheduleSharePhotoSaveDiagnostics.elapsedMilliseconds(since: writeStartedAt)
            let totalDuration = ScheduleSharePhotoSaveDiagnostics.elapsedMilliseconds(since: totalStartedAt)
            ScheduleSharePhotoSaveDiagnostics.logger.notice(
                "stage=photo_write outcome=success duration_ms=\(writeDuration) total_duration_ms=\(totalDuration)"
            )
            guard !Task.isCancelled else { return false }
            return true
        } catch is CancellationError {
            let totalDuration = ScheduleSharePhotoSaveDiagnostics.elapsedMilliseconds(since: totalStartedAt)
            ScheduleSharePhotoSaveDiagnostics.logger.notice(
                "event=finished outcome=cancelled duration_ms=\(totalDuration)"
            )
            return false
        } catch ScheduleSharePhotoLibraryError.timedOut {
            let writeDuration = ScheduleSharePhotoSaveDiagnostics.elapsedMilliseconds(since: writeStartedAt)
            ScheduleSharePhotoSaveDiagnostics.logger.error(
                "stage=photo_write outcome=timeout duration_ms=\(writeDuration)"
            )
            imagePreviewIssue = AppLocalization.string("Saving took too long. Please try again.")
            return false
        } catch {
            let writeDuration = ScheduleSharePhotoSaveDiagnostics.elapsedMilliseconds(since: writeStartedAt)
            ScheduleSharePhotoSaveDiagnostics.logger.error(
                "stage=photo_write outcome=failure duration_ms=\(writeDuration) error=\(String(describing: error), privacy: .public)"
            )
            imagePreviewIssue = AppLocalization.string("The schedule image could not be saved.")
            return false
        }
    }

    private func invalidateCreatedLink() {
        guard !isEditingExistingLink else { return }
        guard createdShareURL != nil else { return }
        createdShareURL = nil
    }

    @MainActor
    private func showShareNotice(_ text: String) {
        withAnimation(.easeOut(duration: 0.2)) {
            shareNotice = text
        }
        Task { @MainActor in
            try? await Task.sleep(nanoseconds: 2_000_000_000)
            withAnimation(.easeIn(duration: 0.2)) {
                if shareNotice == text {
                    shareNotice = nil
                }
            }
        }
    }

    private func configureDefaultsIfNeeded(for route: ScheduleShareRoute) {
        guard route.kind == .editor,
              initialConnectionID == nil,
              !isEditingExistingLink,
              !didConfigureExternalLinkDefaults else { return }
        didConfigureExternalLinkDefaults = true
    }

    #if DEBUG
    private static func uiTestingPreview(calendar: Calendar) -> NativeScheduleShareSnapshot {
        let today = calendar.startOfDay(for: Date())
        let tomorrow = calendar.date(byAdding: .day, value: 1, to: today) ?? Date()
        let nextDay = calendar.date(byAdding: .day, value: 1, to: tomorrow) ?? tomorrow
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]

        func at(_ hour: Int, on day: Date) -> String {
            formatter.string(from: calendar.date(bySettingHour: hour, minute: 0, second: 0, of: day) ?? day)
        }

        var blocks = [
            NativeScheduleShareBlock(
                kind: "busy_detail",
                start: at(9, on: today),
                end: at(11, on: today),
                title: "Project seminar",
                location: "Library",
                categoryId: "ui-calendar-custom",
                categoryPresetKey: nil,
                categoryName: "Project",
                categoryColor: "#2563EB"
            ),
            NativeScheduleShareBlock(
                kind: "busy_detail",
                start: at(16, on: nextDay),
                end: at(18, on: nextDay),
                title: "Gym",
                location: nil,
                categoryId: "ui-calendar-personal",
                categoryPresetKey: "personal",
                categoryName: "Personal",
                categoryColor: "#EA580C"
            ),
            NativeScheduleShareBlock(
                kind: "busy_detail",
                start: at(19, on: nextDay),
                end: at(20, on: nextDay),
                title: "Dinner",
                location: "Home",
                categoryId: nil,
                categoryPresetKey: "none",
                categoryName: nil,
                categoryColor: nil
            ),
        ]

        if ProcessInfo.processInfo.arguments.contains("--ui-testing-dense-schedule-share") {
            blocks = (0..<7).flatMap { dayOffset -> [NativeScheduleShareBlock] in
                let day = calendar.date(byAdding: .day, value: dayOffset, to: today) ?? today
                return (0..<14).map { index in
                    let startMinute = 15 + index * 95
                    let start = calendar.date(byAdding: .minute, value: startMinute, to: day) ?? day
                    let end = calendar.date(byAdding: .minute, value: 45, to: start) ?? start
                    return NativeScheduleShareBlock(
                        kind: index.isMultiple(of: 4) ? "busy_anonymous" : "busy_detail",
                        start: formatter.string(from: start),
                        end: formatter.string(from: end),
                        title: "Dense event \(dayOffset)-\(index)",
                        location: index.isMultiple(of: 3) ? "Campus" : nil,
                        categoryId: index.isMultiple(of: 2)
                            ? "ui-calendar-custom"
                            : "ui-calendar-personal",
                        categoryPresetKey: index.isMultiple(of: 2) ? nil : "personal",
                        categoryName: index.isMultiple(of: 2) ? "Project" : "Personal",
                        categoryColor: index.isMultiple(of: 2) ? "#2563EB" : "#EA580C"
                    )
                }
            }
        }

        return NativeScheduleShareSnapshot(
            ownerDisplayLabel: "You",
            rangeStart: at(0, on: today),
            rangeEnd: at(23, on: calendar.date(byAdding: .day, value: 30, to: tomorrow) ?? nextDay),
            includedDates: [],
            expiresAt: nil,
            allowGuestProposals: true,
            freeSlots: [NativeScheduleShareSlot(start: at(12, on: tomorrow), end: at(14, on: tomorrow))],
            blocks: blocks
        )
    }
    #endif
}

private struct ScheduleShareImagePreviewView: View {
    let images: [UIImage]
    let isPreparing: Bool
    let isSaving: Bool
    let issue: String?
    let notice: String?
    let onRetry: () -> Void
    let onSave: () -> Void
    let onCancelSave: () -> Void
    let onClose: () -> Void

    @State private var selectedPage = 0
    @State private var sharePayload: SSSharePayload?

    var body: some View {
        NavigationStack {
            ZStack {
                SideSeatTheme.bgGrouped
                    .ignoresSafeArea()

                previewContent

                if let notice {
                    Label(notice, systemImage: "checkmark.circle.fill")
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(SideSeatTheme.textPrimary)
                        .padding(.horizontal, SideSeatTheme.spaceMD)
                        .frame(minHeight: 42)
                        .background(.regularMaterial, in: Capsule())
                        .shadow(color: .black.opacity(0.12), radius: 12, y: 4)
                        .frame(maxHeight: .infinity, alignment: .top)
                        .padding(.top, SideSeatTheme.spaceSM)
                        .transition(.move(edge: .top).combined(with: .opacity))
                        .accessibilityIdentifier("schedule-share-image-preview-notice")
                }
            }
            .navigationTitle("Preview")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(action: onClose) {
                        Image(systemName: "xmark")
                    }
                    .accessibilityLabel("Close")
                    .accessibilityIdentifier("schedule-share-image-preview-close")
                }
            }
            .safeAreaInset(edge: .bottom, spacing: 0) {
                if !images.isEmpty {
                    previewActionBar
                }
            }
        }
        .sheet(item: $sharePayload) { payload in
            SSActivityView(items: payload.items)
        }
        .onChange(of: images.count) { _, count in
            selectedPage = min(selectedPage, max(count - 1, 0))
        }
        .accessibilityIdentifier("schedule-share-image-preview")
    }

    @ViewBuilder
    private var previewContent: some View {
        if isPreparing && images.isEmpty {
            VStack(spacing: SideSeatTheme.spaceMD) {
                ProgressView()
                    .controlSize(.large)
                    .ssNeutralProgressTint()
                Text("Preparing image…")
                    .font(.headline)
                    .foregroundStyle(SideSeatTheme.textPrimary)
            }
            .accessibilityElement(children: .combine)
            .accessibilityIdentifier("schedule-share-image-preview-loading")
        } else if images.isEmpty, let issue {
            VStack(spacing: SideSeatTheme.spaceMD) {
                Image(systemName: "exclamationmark.triangle")
                    .font(.system(size: 28, weight: .semibold))
                    .foregroundStyle(SideSeatTheme.statusWarningText)
                Text(issue)
                    .font(.body)
                    .foregroundStyle(SideSeatTheme.textPrimary)
                    .multilineTextAlignment(.center)
                Button("Try again", action: onRetry)
                    .buttonStyle(.borderedProminent)
                    .tint(SideSeatTheme.accent)
                    .accessibilityIdentifier("schedule-share-image-preview-retry")
            }
            .padding(SideSeatTheme.spaceXL)
            .accessibilityIdentifier("schedule-share-image-preview-error")
        } else {
            TabView(selection: $selectedPage) {
                ForEach(images.indices, id: \.self) { index in
                    ScheduleShareZoomableImage(image: images[index])
                        .padding(.horizontal, SideSeatTheme.spaceLG)
                        .padding(.vertical, SideSeatTheme.spaceMD)
                        .tag(index)
                        .accessibilityLabel("Preview \(index + 1) of \(images.count)")
                }
            }
            .tabViewStyle(.page(indexDisplayMode: .never))
            .overlay(alignment: .bottom) {
                if images.count > 1 {
                    Text("\(selectedPage + 1) / \(images.count)")
                        .font(.caption.weight(.semibold).monospacedDigit())
                        .foregroundStyle(SideSeatTheme.textPrimary)
                        .padding(.horizontal, SideSeatTheme.spaceSM)
                        .frame(height: 28)
                        .background(.regularMaterial, in: Capsule())
                        .padding(.bottom, SideSeatTheme.spaceLG)
                }
            }
            .accessibilityIdentifier("schedule-share-image-preview-pages")
        }
    }

    private var previewActionBar: some View {
        VStack(spacing: SideSeatTheme.spaceSM) {
            if let issue {
                Label(issue, systemImage: "exclamationmark.circle")
                    .font(.footnote)
                    .foregroundStyle(SideSeatTheme.statusDangerText)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }

            HStack(spacing: SideSeatTheme.spaceSM) {
                Button {
                    sharePayload = SSSharePayload(items: images.map { $0 as Any })
                } label: {
                    Label("Share", systemImage: "square.and.arrow.up")
                        .font(.body.weight(.semibold))
                        .foregroundStyle(SideSeatTheme.textPrimary)
                        .frame(maxWidth: .infinity)
                        .frame(height: 48)
                        .background(
                            SideSeatTheme.fillTertiary,
                            in: RoundedRectangle(
                                cornerRadius: SideSeatTheme.controlRadius,
                                style: .continuous
                            )
                        )
                }
                .buttonStyle(SSPressButtonStyle())
                .disabled(isSaving)
                .accessibilityIdentifier("schedule-share-image-preview-share")

                if isSaving {
                    Button(action: onCancelSave) {
                        HStack(spacing: SideSeatTheme.spaceSM) {
                            ProgressView()
                                .tint(SideSeatTheme.onAccent)
                                .accessibilityIdentifier("schedule-share-image-saving")
                            Text("Cancel")
                        }
                        .font(.body.weight(.semibold))
                        .foregroundStyle(SideSeatTheme.onAccent)
                        .frame(maxWidth: .infinity)
                        .frame(height: 48)
                        .background(
                            SideSeatTheme.accent,
                            in: RoundedRectangle(
                                cornerRadius: SideSeatTheme.controlRadius,
                                style: .continuous
                            )
                        )
                    }
                    .buttonStyle(SSPressButtonStyle())
                    .accessibilityIdentifier("schedule-share-image-save-cancel")
                } else {
                    Button(action: onSave) {
                        Label("Save to Photos", systemImage: "photo.badge.arrow.down")
                            .font(.body.weight(.semibold))
                            .foregroundStyle(SideSeatTheme.onAccent)
                            .frame(maxWidth: .infinity)
                            .frame(height: 48)
                            .background(
                                SideSeatTheme.accent,
                                in: RoundedRectangle(
                                    cornerRadius: SideSeatTheme.controlRadius,
                                    style: .continuous
                                )
                            )
                    }
                    .buttonStyle(SSPressButtonStyle())
                    .accessibilityIdentifier("schedule-share-image-preview-save")
                }
            }
        }
        .padding(.horizontal, SideSeatTheme.screenHorizontal)
        .padding(.top, SideSeatTheme.spaceSM)
        .padding(.bottom, SideSeatTheme.spaceMD)
        .background(.bar)
    }
}

private struct ScheduleShareZoomableImage: View {
    let image: UIImage

    @State private var settledScale: CGFloat = 1
    @GestureState private var gestureScale: CGFloat = 1

    private var scale: CGFloat {
        min(max(settledScale * gestureScale, 1), 4)
    }

    var body: some View {
        GeometryReader { proxy in
            Image(uiImage: image)
                .resizable()
                .interpolation(.high)
                .scaledToFit()
                .frame(width: proxy.size.width, height: proxy.size.height)
                .scaleEffect(scale)
                .gesture(
                    MagnificationGesture()
                        .updating($gestureScale) { value, state, _ in
                            state = value
                        }
                        .onEnded { value in
                            settledScale = min(max(settledScale * value, 1), 4)
                        }
                )
                .onTapGesture(count: 2) {
                    withAnimation(.easeOut(duration: 0.2)) {
                        settledScale = settledScale > 1 ? 1 : 2
                    }
                }
                .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
                .shadow(color: .black.opacity(0.12), radius: 10, y: 4)
        }
        .clipped()
    }
}

struct ScheduleSharePosterEntry: Identifiable {
    let id: String
    let start: Date
    let end: Date
    let title: String
    let location: String?
    let color: Color
    let isHidden: Bool
}

struct ScheduleSharePosterFreeSlot: Identifiable {
    let id: String
    let start: Date
    let end: Date
}

enum ScheduleSharePosterPresentation {
    private static let mergeTolerance: TimeInterval = 60

    static func datePages(
        for selectedDates: [Date],
        calendar: Calendar = .sideSeatBerlin
    ) -> [[Date]] {
        let dates = selectedDates
            .map(calendar.startOfDay(for:))
            .sorted()
            .reduce(into: [Date]()) { result, date in
                if result.last != date {
                    result.append(date)
                }
            }
        guard let first = dates.first, let last = dates.last else { return [] }

        let span = (calendar.dateComponents([.day], from: first, to: last).day ?? 0) + 1
        if span <= 7 {
            return [(0..<span).compactMap { calendar.date(byAdding: .day, value: $0, to: first) }]
        }

        var pages: [[Date]] = []
        var pageStart = first
        while pageStart <= last {
            let proposedEnd = calendar.date(byAdding: .day, value: 6, to: pageStart) ?? pageStart
            let pageEnd = min(proposedEnd, last)
            let pageSpan = (calendar.dateComponents([.day], from: pageStart, to: pageEnd).day ?? 0) + 1
            let pageDates = (0..<pageSpan).compactMap {
                calendar.date(byAdding: .day, value: $0, to: pageStart)
            }
            if pageDates.contains(where: { pageDate in
                dates.contains(where: { calendar.isDate($0, inSameDayAs: pageDate) })
            }) {
                pages.append(pageDates)
            }
            guard let nextPage = calendar.date(byAdding: .day, value: 7, to: pageStart) else { break }
            pageStart = nextPage
        }
        return pages
    }

    static func mergedFreeSlots(
        _ slots: [ScheduleSharePosterFreeSlot],
        on date: Date,
        calendar: Calendar = .sideSeatBerlin
    ) -> [ScheduleSharePosterFreeSlot] {
        guard let interval = calendar.dateInterval(of: .day, for: date) else { return [] }
        let candidates = slots
            .filter { $0.start < interval.end && $0.end > interval.start }
            .map { slot in
                ScheduleSharePosterFreeSlot(
                    id: slot.id,
                    start: max(slot.start, interval.start),
                    end: min(slot.end, interval.end)
                )
            }
            .sorted { $0.start < $1.start }

        return candidates.reduce(into: [ScheduleSharePosterFreeSlot]()) { result, slot in
            guard let last = result.last,
                  slot.start.timeIntervalSince(last.end) <= mergeTolerance else {
                result.append(slot)
                return
            }
            result[result.count - 1] = ScheduleSharePosterFreeSlot(
                id: "\(last.id)+\(slot.id)",
                start: min(last.start, slot.start),
                end: max(last.end, slot.end)
            )
        }
    }

    static func mergedHiddenEntries(
        _ entries: [ScheduleSharePosterEntry],
        on date: Date,
        calendar: Calendar = .sideSeatBerlin
    ) -> [ScheduleSharePosterEntry] {
        guard let interval = calendar.dateInterval(of: .day, for: date) else { return [] }
        let candidates = entries
            .filter {
                $0.isHidden && $0.start < interval.end && $0.end > interval.start
            }
            .map { entry in
                ScheduleSharePosterEntry(
                    id: entry.id,
                    start: max(entry.start, interval.start),
                    end: min(entry.end, interval.end),
                    title: entry.title,
                    location: entry.location,
                    color: entry.color,
                    isHidden: true
                )
            }
            .sorted { $0.start < $1.start }

        return candidates.reduce(into: [ScheduleSharePosterEntry]()) { result, entry in
            guard let last = result.last,
                  entry.start.timeIntervalSince(last.end) <= mergeTolerance else {
                result.append(entry)
                return
            }
            result[result.count - 1] = ScheduleSharePosterEntry(
                id: "\(last.id)+\(entry.id)",
                start: min(last.start, entry.start),
                end: max(last.end, entry.end),
                title: last.title,
                location: nil,
                color: last.color,
                isHidden: true
            )
        }
    }

    static func timelineEntries(
        _ entries: [ScheduleSharePosterEntry],
        on date: Date,
        calendar: Calendar = .sideSeatBerlin
    ) -> [ScheduleSharePosterEntry] {
        guard let interval = calendar.dateInterval(of: .day, for: date) else { return [] }
        let publicEntries = entries
            .filter {
                !$0.isHidden && $0.start < interval.end && $0.end > interval.start
            }
            .map { entry in
                ScheduleSharePosterEntry(
                    id: entry.id,
                    start: max(entry.start, interval.start),
                    end: min(entry.end, interval.end),
                    title: entry.title,
                    location: entry.location,
                    color: entry.color,
                    isHidden: false
                )
            }
        let hiddenEntries = mergedHiddenEntries(entries, on: date, calendar: calendar)
        return (publicEntries + hiddenEntries).sorted { $0.start < $1.start }
    }
}

@MainActor
enum ScheduleSharePosterRenderer {
    static func images(
        entries: [ScheduleSharePosterEntry],
        freeSlots: [ScheduleSharePosterFreeSlot],
        selectedDates: [Date],
        hiddenCount: Int,
        ownerDisplayLabel: String,
        shareURL: URL
    ) -> [UIImage] {
        let pages = ScheduleSharePosterPresentation.datePages(for: selectedDates)
        return pages.enumerated().compactMap { index, displayDates in
            let poster = ScheduleSharePoster(
                entries: entries,
                freeSlots: freeSlots,
                selectedDates: selectedDates,
                displayDates: displayDates,
                hiddenCount: hiddenCount,
                ownerDisplayLabel: ownerDisplayLabel,
                pageIndex: index + 1,
                pageCount: pages.count,
                shareURL: shareURL
            )
            .frame(width: 360, height: 480)
            .environment(\.colorScheme, .light)
            let renderer = ImageRenderer(content: poster)
            renderer.scale = 3
            renderer.isOpaque = true
            return renderer.uiImage
        }
    }
}

private struct ScheduleSharePoster: View {
    let entries: [ScheduleSharePosterEntry]
    let freeSlots: [ScheduleSharePosterFreeSlot]
    let selectedDates: [Date]
    let displayDates: [Date]
    let hiddenCount: Int
    let ownerDisplayLabel: String
    let pageIndex: Int
    let pageCount: Int
    let shareURL: URL

    private let ink = Color(red: 0.09, green: 0.08, blue: 0.11)
    private let secondary = Color(red: 0.39, green: 0.37, blue: 0.43)
    private let canvas = Color(red: 0.975, green: 0.973, blue: 0.982)
    private let accent = Color(red: 1.00, green: 0.31, blue: 0.53)
    private let green = Color(red: 0.12, green: 0.47, blue: 0.31)
    private let calendar = Calendar.sideSeatBerlin

    var body: some View {
        ZStack {
            Color.white
            VStack(alignment: .leading, spacing: 0) {
                header
                    .frame(height: 72, alignment: .topLeading)

                availabilityCalendar
                    .frame(height: 278)
                    .padding(.top, 10)

                footer
                    .frame(height: 74)
                    .padding(.top, 10)
            }
            .padding(18)
        }
        .frame(width: 360, height: 480)
        .clipped()
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 7) {
                SideSeatBrandMark(size: 22, showsShadow: false)
                Text("SideSeat")
                    .font(.system(size: 14, weight: .bold, design: .rounded))
                    .foregroundStyle(ink)

                Spacer(minLength: 8)

                if pageCount > 1 {
                    Text("\(pageIndex) / \(pageCount)")
                        .font(.system(size: 9, weight: .bold, design: .rounded))
                        .foregroundStyle(secondary)
                        .padding(.horizontal, 8)
                        .frame(height: 22)
                        .background(canvas, in: Capsule())
                }
            }

            Text(ownerAvailabilityLabel)
                .font(.system(size: 24, weight: .bold, design: .rounded))
                .foregroundStyle(ink)
                .lineLimit(1)
                .minimumScaleFactor(0.75)
                .padding(.top, 8)

            Text(dateRangeLabel)
                .font(.system(size: 10, weight: .semibold))
                .foregroundStyle(secondary)
                .lineLimit(1)
                .padding(.top, 2)
        }
    }

    private var availabilityCalendar: some View {
        VStack(spacing: 0) {
            HStack(spacing: 8) {
                Text("Available times")
                    .font(.system(size: 12, weight: .bold))
                    .foregroundStyle(ink)
                Spacer(minLength: 4)
                timelineLegend(color: green, label: "Free")
                timelineLegend(color: secondary.opacity(0.55), label: "Busy")
            }
            .frame(height: 22)

            calendarGrid
                .padding(.top, 6)
        }
    }

    private var calendarGrid: some View {
        VStack(spacing: 0) {
            HStack(spacing: 0) {
                Color.clear
                    .frame(width: 28, height: 32)
                    .overlay(alignment: .trailing) {
                        verticalGridLine
                    }

                ForEach(displayDates.indices, id: \.self) { index in
                    dateHeader(displayDates[index])
                        .overlay(alignment: .leading) {
                            if index > 0 {
                                verticalGridLine
                            }
                        }
                }
            }
            .frame(height: 32)

            Rectangle()
                .fill(secondary.opacity(0.14))
                .frame(height: 0.5)
                .padding(.leading, 28)

            HStack(spacing: 0) {
                timelineAxis
                    .frame(width: 28, height: timelineHeight)
                    .overlay(alignment: .trailing) {
                        verticalGridLine
                    }

                ForEach(displayDates.indices, id: \.self) { index in
                    posterTimelineDay(displayDates[index])
                        .frame(maxWidth: .infinity)
                        .frame(height: timelineHeight)
                        .overlay(alignment: .leading) {
                            if index > 0 {
                                verticalGridLine
                            }
                        }
                }
            }
        }
        .background(canvas)
        .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 8, style: .continuous)
                .strokeBorder(secondary.opacity(0.18), lineWidth: 0.75)
        }
    }

    private func dateHeader(_ date: Date) -> some View {
        let selected = isSelected(date)
        return VStack(spacing: 1) {
            Text(date.formatted(.dateTime.weekday(.narrow)))
                .font(.system(size: 7, weight: .semibold))
            Text(date.formatted(.dateTime.day()))
                .font(.system(size: 10, weight: .bold, design: .rounded))
                .monospacedDigit()
        }
        .foregroundStyle(selected ? ink : secondary.opacity(0.45))
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(selected ? Color.white.opacity(0.58) : secondary.opacity(0.025))
        .overlay(alignment: .bottom) {
            if selected {
                Capsule()
                    .fill(accent)
                    .frame(width: 12, height: 2)
                    .padding(.bottom, 2)
            }
        }
    }

    private var verticalGridLine: some View {
        Rectangle()
            .fill(secondary.opacity(0.12))
            .frame(width: 0.5)
    }

    private func timelineLegend(color: Color, label: LocalizedStringKey) -> some View {
        HStack(spacing: 3) {
            RoundedRectangle(cornerRadius: 2, style: .continuous)
                .fill(color)
                .frame(width: 8, height: 8)
            Text(label)
                .font(.system(size: 8, weight: .semibold))
                .foregroundStyle(secondary)
        }
    }

    private var timelineAxis: some View {
        GeometryReader { proxy in
            ForEach(timelineTicks, id: \.self) { hour in
                Text(hour.formatted())
                    .font(.system(size: 7, weight: .medium, design: .rounded))
                    .foregroundStyle(secondary)
                    .monospacedDigit()
                    .position(
                        x: 10,
                        y: min(
                            max(timelineY(forHour: Double(hour), height: proxy.size.height), 5),
                            proxy.size.height - 5
                        )
                    )
            }
        }
    }

    private func posterTimelineDay(_ date: Date) -> some View {
        let selected = isSelected(date)
        return GeometryReader { proxy in
            ZStack(alignment: .topLeading) {
                Rectangle()
                    .fill(selected ? Color.white.opacity(0.58) : secondary.opacity(0.025))

                ForEach(timelineTicks, id: \.self) { hour in
                    Rectangle()
                        .fill(secondary.opacity(0.12))
                        .frame(height: 0.5)
                        .offset(y: timelineY(forHour: Double(hour), height: proxy.size.height))
                }

                if selected {
                    ForEach(timelineFreeSlots(on: date)) { slot in
                        freeSlotBlock(slot, on: date, height: proxy.size.height)
                    }
                    ForEach(timelineEvents(on: date)) { entry in
                        eventBlock(entry, on: date, height: proxy.size.height)
                    }
                } else {
                    Image(systemName: "minus")
                        .font(.system(size: 7, weight: .bold))
                        .foregroundStyle(secondary.opacity(0.30))
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                }
            }
        }
    }

    private func freeSlotBlock(
        _ slot: ScheduleSharePosterFreeSlot,
        on date: Date,
        height: CGFloat
    ) -> some View {
        let geometry = timelineGeometry(start: slot.start, end: slot.end, on: date, height: height)
        return RoundedRectangle(cornerRadius: 2, style: .continuous)
            .fill(green.opacity(0.14))
            .overlay {
                RoundedRectangle(cornerRadius: 2, style: .continuous)
                    .strokeBorder(green.opacity(0.72), lineWidth: 0.8)
            }
            .frame(height: geometry.height)
            .padding(.horizontal, 2)
            .offset(y: geometry.top)
    }

    private func eventBlock(
        _ entry: ScheduleSharePosterEntry,
        on date: Date,
        height: CGFloat
    ) -> some View {
        let geometry = timelineGeometry(start: entry.start, end: entry.end, on: date, height: height)
        let color = entry.isHidden ? secondary : entry.color
        return RoundedRectangle(cornerRadius: 2, style: .continuous)
            .fill(color.opacity(entry.isHidden ? 0.16 : 0.18))
            .overlay(alignment: .leading) {
                Rectangle()
                    .fill(color.opacity(0.88))
                    .frame(width: 2)
            }
            .overlay(alignment: .topLeading) {
                if showsEventTitles, geometry.height >= 15 {
                    Text(entry.title)
                        .font(.system(size: 7, weight: .semibold))
                        .foregroundStyle(ink.opacity(0.84))
                        .lineLimit(geometry.height >= 25 ? 2 : 1)
                        .padding(.leading, 5)
                        .padding(.trailing, 2)
                        .padding(.top, 2)
                }
            }
            .frame(height: geometry.height)
            .padding(.horizontal, 2)
            .offset(y: geometry.top)
    }

    private func timelineGeometry(
        start: Date,
        end: Date,
        on date: Date,
        height: CGFloat
    ) -> (top: CGFloat, height: CGFloat) {
        let dayStart = calendar.startOfDay(for: date)
        let dayEnd = calendar.date(byAdding: .day, value: 1, to: dayStart) ?? dayStart
        let startValue = start <= dayStart ? 0 : timelineHourValue(start)
        let rawEndValue = end >= dayEnd ? 24 : timelineHourValue(end)
        let endValue = max(rawEndValue, startValue + 0.25)
        let top = timelineY(forHour: startValue, height: height)
        let bottom = timelineY(forHour: endValue, height: height)
        return (top, max(bottom - top, 2))
    }

    private var footer: some View {
        HStack(alignment: .center, spacing: 10) {
            VStack(alignment: .leading, spacing: 3) {
                Label(
                    hiddenCount > 0
                        ? AppLocalization.string( "Hidden details are shown as Busy")
                        : AppLocalization.string( "Only selected days are included"),
                    systemImage: hiddenCount > 0 ? "lock.fill" : "checkmark.shield.fill"
                )
                .font(.system(size: 8, weight: .medium))
                .foregroundStyle(secondary)

                Text("Scan to view and choose a time")
                    .font(.system(size: 12, weight: .bold))
                    .foregroundStyle(ink)
                    .lineLimit(1)
                    .minimumScaleFactor(0.82)
                Text("Live schedule on sideseat.de")
                    .font(.system(size: 9, weight: .medium))
                    .foregroundStyle(secondary)
            }
            Spacer(minLength: 0)
            SSQRCode(url: shareURL)
                .frame(width: 46, height: 46)
                .padding(4)
                .background(Color.white)
                .clipShape(RoundedRectangle(cornerRadius: 5, style: .continuous))
                .overlay {
                    RoundedRectangle(cornerRadius: 5, style: .continuous)
                        .strokeBorder(secondary.opacity(0.20), lineWidth: 0.75)
                }
        }
        .padding(.top, 10)
        .overlay(alignment: .top) {
            Rectangle()
                .fill(secondary.opacity(0.18))
                .frame(height: 0.75)
        }
    }

    private func timelineFreeSlots(on date: Date) -> [ScheduleSharePosterFreeSlot] {
        ScheduleSharePosterPresentation.mergedFreeSlots(
            freeSlots,
            on: date,
            calendar: calendar
        )
    }

    private func timelineEvents(on date: Date) -> [ScheduleSharePosterEntry] {
        ScheduleSharePosterPresentation.timelineEntries(
            entries,
            on: date,
            calendar: calendar
        )
    }

    private func isSelected(_ date: Date) -> Bool {
        selectedDates.contains { calendar.isDate($0, inSameDayAs: date) }
    }

    private var showsEventTitles: Bool {
        displayDates.count <= 3
    }

    private let timelineHeight: CGFloat = 217

    private var timelineStartHour: Int {
        let earliest = allTimelineDates.map {
            calendar.component(.hour, from: $0)
        }.min() ?? ScheduleShareProposalTime.defaultDisplayStartHour
        return max(0, min(ScheduleShareProposalTime.defaultDisplayStartHour, earliest))
    }

    private var timelineEndHour: Int {
        let latest = allTimelineEndDates.map { date -> Int in
            let components = calendar.dateComponents([.hour, .minute], from: date)
            let hour = components.hour ?? ScheduleShareProposalTime.defaultDisplayEndHour
            return hour + ((components.minute ?? 0) > 0 ? 1 : 0)
        }.max() ?? ScheduleShareProposalTime.defaultDisplayEndHour
        let latestStart = allTimelineDates.map { date -> Int in
            let components = calendar.dateComponents([.hour, .minute], from: date)
            return min((components.hour ?? 0) + 1, 24)
        }.max() ?? ScheduleShareProposalTime.defaultDisplayEndHour
        return min(24, max(ScheduleShareProposalTime.defaultDisplayEndHour, latest, latestStart))
    }

    private var timelineTicks: [Int] {
        var ticks = Array(stride(from: timelineStartHour, through: timelineEndHour, by: 4))
        if ticks.last != timelineEndHour {
            ticks.append(timelineEndHour)
        }
        return ticks
    }

    private var allTimelineDates: [Date] {
        displayDates.flatMap { date in
            timelineEvents(on: date).map(\.start) + timelineFreeSlots(on: date).map(\.start)
        }
    }

    private var allTimelineEndDates: [Date] {
        displayDates.flatMap { date in
            timelineEvents(on: date).map(\.end) + timelineFreeSlots(on: date).map(\.end)
        }
    }

    private func timelineHourValue(_ date: Date) -> Double {
        let components = calendar.dateComponents([.hour, .minute], from: date)
        return Double(components.hour ?? 0) + (Double(components.minute ?? 0) / 60)
    }

    private func timelineY(forHour hour: Double, height: CGFloat) -> CGFloat {
        let duration = max(Double(timelineEndHour - timelineStartHour), 1)
        let clamped = min(max(hour, Double(timelineStartHour)), Double(timelineEndHour))
        return CGFloat((clamped - Double(timelineStartHour)) / duration) * height
    }

    private var ownerAvailabilityLabel: String {
        let owner = ownerDisplayLabel.trimmingCharacters(in: .whitespacesAndNewlines)
        if owner.isEmpty || owner.caseInsensitiveCompare("You") == .orderedSame {
            return AppLocalization.string("My availability")
        }
        return String(
            format: AppLocalization.string("%@'s availability"),
            locale: AppLocalization.selectedLanguage.locale,
            owner
        )
    }

    private var dateRangeLabel: String {
        guard let first = displayDates.first else { return AppLocalization.string("Available times") }
        guard let last = displayDates.last,
              !Calendar.sideSeatBerlin.isDate(first, inSameDayAs: last) else {
            return first.formatted(.dateTime.weekday(.wide).month(.abbreviated).day())
        }
        return "\(first.formatted(.dateTime.month(.abbreviated).day())) – \(last.formatted(.dateTime.month(.abbreviated).day()))"
    }
}
