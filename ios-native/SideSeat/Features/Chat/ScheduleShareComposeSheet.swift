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
                    name: String(localized: "Course timetable"),
                    colorHex: "#3385DB",
                    presetKey: "course"
                )
            )
        }

        if blocks.contains(where: isUncategorized) {
            options.append(
                ScheduleShareRevealOption(
                    id: ScheduleShareRevealOption.uncategorizedID,
                    name: String(localized: "No category"),
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
    case saveImage
}

struct ScheduleShareComposeSheet: View {
    @Environment(SessionStore.self) private var session
    @Environment(\.dismiss) private var dismiss

    private let initialConnectionID: String?
    private let fixedRecipientName: String?
    private let onSent: (String) -> Void

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
    @State private var usageLimit = "SINGLE_USE"
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
    @State private var imageSaveTask: Task<Void, Never>?
    @State private var imageSaveOperationID: UUID?
    @State private var isSavingImage = false

    private let calendar = Calendar.sideSeatBerlin

    init(
        connectionID: String,
        recipientName: String? = nil,
        onSent: @escaping () -> Void
    ) {
        initialConnectionID = connectionID
        fixedRecipientName = recipientName
        self.onSent = { _ in onSent() }
    }

    init(initialDates: [Date] = [], onSent: @escaping (String) -> Void) {
        initialConnectionID = nil
        fixedRecipientName = nil
        self.onSent = onSent

        let calendar = Calendar.sideSeatBerlin
        let today = calendar.startOfDay(for: Date())
        let latest = calendar.date(byAdding: .day, value: 13, to: today) ?? today
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

    var body: some View {
        NavigationStack(path: $routePath) {
            Group {
                if initialConnectionID == nil {
                    shareSettingsScreen(for: .editor)
                } else {
                    shareSettingsScreen(
                        for: .contact(
                            connectionID: initialConnectionID ?? "",
                            displayName: fixedRecipientName ?? String(localized: "This chat")
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
        .onChange(of: expiryDays) { _, _ in invalidateCreatedLink() }
    }

    private func shareSettingsScreen(for route: ScheduleShareRoute) -> some View {
        shareSettings(for: route)
            .accessibilityElement(children: .contain)
            .accessibilityIdentifier("schedule-share-settings")
            .navigationTitle("Share schedule")
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
                                        .buttonStyle(.plain)
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
                        Divider().padding(.leading, 60)
                        shareDestinationRow(
                            title: "Save image to Photos",
                            subtitle: "Save the schedule preview directly to your photo library.",
                            systemImage: "photo.badge.arrow.down",
                            accessibilityID: "schedule-share-destination-save-image",
                            isDisabled: isSavingImage
                        ) {
                            selectShareDestination(.saveImage)
                        }
                        if isSavingImage {
                            imageSaveProgressRow
                        }
                    }
                    .background(
                        SideSeatTheme.surface,
                        in: RoundedRectangle(cornerRadius: SideSeatTheme.controlRadius, style: .continuous)
                    )

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
        .onDisappear {
            if isSavingImage {
                cancelScheduleImageSave()
            }
        }
        .accessibilityIdentifier("schedule-share-destination-picker")
    }

    private var imageSaveProgressRow: some View {
        HStack(spacing: SideSeatTheme.spaceMD) {
            ProgressView()
                .controlSize(.small)
                .ssNeutralProgressTint()
            VStack(alignment: .leading, spacing: 2) {
                Text("Saving image…")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(SideSeatTheme.textPrimary)
                Text("You can cancel if Photos takes too long.")
                    .font(.caption)
                    .foregroundStyle(SideSeatTheme.textSecondary)
            }
            Spacer(minLength: SideSeatTheme.spaceSM)
            Button("Cancel") {
                cancelScheduleImageSave()
            }
            .font(.subheadline.weight(.semibold))
            .accessibilityIdentifier("schedule-share-image-save-cancel")
        }
        .padding(.horizontal, SideSeatTheme.spaceMD)
        .padding(.vertical, 10)
        .background(SideSeatTheme.accent.opacity(0.06))
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("schedule-share-image-saving")
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
                    .foregroundStyle(SideSeatTheme.accent)
                    .frame(width: 36, height: 36)
                    .background(SideSeatTheme.accent.opacity(0.10), in: RoundedRectangle(cornerRadius: 8))
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
        .buttonStyle(.plain)
        .disabled(isSending || isDisabled)
        .accessibilityIdentifier(accessibilityID)
    }

    private var recipientPicker: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: SideSeatTheme.spaceLG) {
                VStack(alignment: .leading, spacing: SideSeatTheme.spaceXS) {
                    Text("Choose a chat")
                        .font(SideSeatTheme.Text.titleSmall)
                    Text("The schedule will be sent as a private card in this conversation.")
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
                            ? "Add a classmate before sharing your schedule privately."
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
                                            .foregroundStyle(SideSeatTheme.accent)
                                    }
                                }
                                .padding(.horizontal, SideSeatTheme.spaceMD)
                                .padding(.vertical, 10)
                                .contentShape(Rectangle())
                            }
                            .buttonStyle(.plain)
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
                if route.kind == .editor, let createdShareURL {
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
                .foregroundStyle(SideSeatTheme.accent)
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
                route.displayName ?? String(localized: "This chat"),
                String(localized: "Send an interactive schedule card in SideSeat.")
            )
        case .contacts:
            return (
                "person.2",
                String(localized: "Send in SideSeat"),
                String(localized: "Choose a contact to continue.")
            )
        case .editor:
            return (
                "square.and.arrow.up",
                String(localized: "Share schedule"),
                String(localized: "Choose a destination after reviewing your schedule.")
            )
        }
    }

    private var daySelection: some View {
        VStack(alignment: .leading, spacing: SideSeatTheme.spaceMD) {
            sectionHeader(
                title: String(localized: "Days to share"),
                detail: String(localized: "\(selectedDateKeys.count) selected")
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
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
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
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
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

            Button {
                withAnimation(.snappy(duration: 0.24)) {
                    isWeekPreviewExpanded.toggle()
                }
            } label: {
                HStack(spacing: SideSeatTheme.spaceSM) {
                    Image(systemName: "calendar.day.timeline.left")
                        .foregroundStyle(SideSeatTheme.accent)
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Shared calendar preview")
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
            .buttonStyle(.plain)
            .background(
                SideSeatTheme.surface,
                in: RoundedRectangle(cornerRadius: SideSeatTheme.controlRadius, style: .continuous)
            )
            .accessibilityValue(isWeekPreviewExpanded ? String(localized: "Expanded") : String(localized: "Collapsed"))
            .accessibilityIdentifier("schedule-share-week-preview-toggle")

            if isWeekPreviewExpanded {
                selectionWeekPreview
                    .transition(.opacity.combined(with: .move(edge: .top)))
            }
        }
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
                            .foregroundStyle(isIncluded ? SideSeatTheme.accent : SideSeatTheme.textSecondary)
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
                        Text(String(localized: "\(blocks.count - 4) more events"))
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
                title: String(localized: "Event details"),
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
                    .tint(SideSeatTheme.accent)
                    .accessibilityIdentifier("schedule-share-allow-proposals")

                Picker("Link use", selection: $usageLimit) {
                    Text("One view").tag("SINGLE_USE")
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
                    .foregroundStyle(SideSeatTheme.accent)
                VStack(alignment: .leading, spacing: 2) {
                    Text("Link settings")
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(SideSeatTheme.textPrimary)
                    Text(linkSettingsSummary)
                        .font(.caption)
                        .foregroundStyle(SideSeatTheme.textSecondary)
                }
            }
        }
        .tint(SideSeatTheme.textSecondary)
        .padding(.horizontal, SideSeatTheme.spaceMD)
        .padding(.vertical, SideSeatTheme.spaceMD)
        .background(
            SideSeatTheme.surface,
            in: RoundedRectangle(cornerRadius: SideSeatTheme.controlRadius, style: .continuous)
        )
        .accessibilityIdentifier("schedule-share-link-settings")
    }

    private var linkSettingsSummary: String {
        if usageLimit == "SINGLE_USE" {
            return String(localized: "One view · expires in 14 days")
        }
        return String(localized: "Reusable · expires in \(expiryDays) days")
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
            (String(localized: "Send schedule"), "schedule-share-send")
        case .contacts:
            (String(localized: "Continue"), "schedule-share-continue")
        case .editor:
            (String(localized: "Share"), "schedule-share-open-destinations")
        }
    }

    private func createdLinkCard(_ url: URL) -> some View {
        VStack(alignment: .leading, spacing: SideSeatTheme.spaceMD) {
            sectionHeader(title: String(localized: "Link ready"), detail: nil)
            HStack(spacing: SideSeatTheme.spaceSM) {
                Image(systemName: "link")
                    .foregroundStyle(SideSeatTheme.accent)
                Text(url.host.map { "\($0)\(url.path)" } ?? url.absoluteString)
                    .font(.footnote.monospaced())
                    .lineLimit(1)
                    .truncationMode(.middle)
                Spacer(minLength: SideSeatTheme.spaceSM)
                Button {
                    UIPasteboard.general.url = url
                    didCopyLink.toggle()
                    showShareNotice(String(localized: "Link copied"))
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
        return (0..<14).compactMap { calendar.date(byAdding: .day, value: $0, to: today) }
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
        String(localized: "\(selectedDateKeys.count) days · \(visiblePreviewBlocks.count) events")
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
        let blocks = (preview.blocks ?? []).filter { block in
            guard intervalOverlapsWeek(
                start: block.start,
                end: block.end,
                from: rangeStart,
                to: rangeEnd
            ), let start = Date.sideSeatChatISO8601(block.start) else { return false }
            return selectedDateKeys.contains(
                ScheduleShareDateSelection.dateKey(for: start, calendar: calendar)
            )
        }.map { block in
            redactedBlock(block)
        }
        let freeSlots = preview.freeSlots.filter { slot in
            guard intervalOverlapsWeek(
                start: slot.start,
                end: slot.end,
                from: rangeStart,
                to: rangeEnd
            ), let start = Date.sideSeatChatISO8601(slot.start) else { return false }
            return selectedDateKeys.contains(
                ScheduleShareDateSelection.dateKey(for: start, calendar: calendar)
            )
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
        if revealOptions.isEmpty { return String(localized: "No events") }
        if effectiveSelectedRevealOptionIDs.isEmpty { return String(localized: "Busy only") }
        if allDetailsVisible { return String(localized: "All visible") }
        return String(localized: "\(effectiveSelectedRevealOptionIDs.count) of \(revealOptions.count) visible")
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
        .buttonStyle(.plain)
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
        .buttonStyle(.plain)
        .disabled(!isSelectable)
        .accessibilityLabel(date.formatted(date: .complete, time: .omitted))
        .accessibilityValue(
            "\(isSelected ? String(localized: "Selected") : String(localized: "Not selected")), \(eventCount) \(String(localized: "events"))"
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
                    .foregroundStyle(isSelected ? SideSeatTheme.accent : SideSeatTheme.textSecondary)
            }
            .padding(.horizontal, 12)
            .frame(height: 36)
            .background(
                isSelected ? SideSeatTheme.Chat.selectedChipFill : SideSeatTheme.fillTertiary,
                in: Capsule()
            )
        }
        .buttonStyle(.plain)
        .accessibilityValue(isSelected ? String(localized: "Details visible") : String(localized: "Busy only"))
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
                Text(block.title ?? String(localized: "Busy"))
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

        if initialConnectionID == nil {
            await contactsStore.load(using: session)
        }
        await categoryStore.load(using: session)
        await loadPreview()
        initializeRevealOptionsIfNeeded()
        isLoading = false
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
        selectedRevealOptionIDs = Set(allRevealOptions.map(\.id))
    }

    @MainActor
    private func performPrimaryAction(for route: ScheduleShareRoute) async {
        guard !isSending else { return }

        switch route.kind {
        case .contact:
            guard let connectionID = route.connectionID else { return }
            await sendToContact(
                connectionID: connectionID,
                recipientName: route.displayName ?? String(localized: "This chat")
            )
        case .contacts:
            break
        case .editor:
            showShareDestinations = true
        }
    }

    @MainActor
    private func selectShareDestination(_ destination: ScheduleShareDestination) {
        if case .saveImage = destination {
            startScheduleImageSave()
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
            case .saveImage:
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
        let expiration = calendar.date(
            byAdding: .day,
            value: usageLimit == "SINGLE_USE" ? 14 : expiryDays,
            to: Date()
        ) ?? Date().addingTimeInterval(14 * 86_400)
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return NativeScheduleShareCreateRequest(
            rangeStart: formatter.string(from: range.start),
            rangeEnd: formatter.string(from: range.end),
            revealConfig: NativeScheduleShareRevealConfigRequest(
                categoryIds: revealSelection.categoryIDs,
                presetKeys: revealSelection.presetKeys,
                hideAllDetails: effectiveSelectedRevealOptionIDs.isEmpty,
                includedDates: selectedDateKeys.sorted()
            ),
            allowGuestProposals: allowGuestProposals,
            usageLimit: usageLimit,
            expiresAt: formatter.string(from: expiration)
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
            showShareNotice(String(localized: "Link copied"))
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
                issue = String(localized: "The server returned an invalid share link.")
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
        sharePayload = SSSharePayload(items: [String(localized: "View my SideSeat schedule"), url])
    }

    @MainActor
    private func startScheduleImageSave() {
        guard imageSaveTask == nil, !isSending else { return }
        let operationID = UUID()
        imageSaveOperationID = operationID
        isSavingImage = true
        issue = nil

        imageSaveTask = Task { @MainActor in
            let posterShareURL: URL
            if let createdShareURL {
                posterShareURL = createdShareURL
            } else if let createdURL = await createShareLink() {
                posterShareURL = createdURL
            } else {
                guard imageSaveOperationID == operationID else { return }
                imageSaveTask = nil
                imageSaveOperationID = nil
                isSavingImage = false
                return
            }

            guard !Task.isCancelled else { return }
            let didSave = await saveScheduleImageToPhotos(shareURL: posterShareURL)
            guard imageSaveOperationID == operationID else { return }
            imageSaveTask = nil
            imageSaveOperationID = nil
            isSavingImage = false
            if didSave {
                showShareDestinations = false
            }
        }
    }

    private func cancelScheduleImageSave() {
        imageSaveTask?.cancel()
        imageSaveTask = nil
        imageSaveOperationID = nil
        isSavingImage = false
    }

    @MainActor
    private func saveScheduleImageToPhotos(shareURL: URL) async -> Bool {
        guard !Task.isCancelled else { return false }

        let totalStartedAt = ProcessInfo.processInfo.systemUptime
        ScheduleSharePhotoSaveDiagnostics.logger.notice(
            "event=started event_count=\(self.visiblePreviewBlocks.count) selected_day_count=\(self.selectedDateKeys.count)"
        )

        let entries = visiblePreviewBlocks.compactMap { block -> ScheduleSharePosterEntry? in
            guard let start = Date.sideSeatChatISO8601(block.start),
                  let end = Date.sideSeatChatISO8601(block.end) else { return nil }
            let revealsDetails = isBlockDetailRevealed(block)
            return ScheduleSharePosterEntry(
                id: block.id,
                start: start,
                end: end,
                title: revealsDetails ? (block.title ?? String(localized: "Busy")) : String(localized: "Busy"),
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
                  selectedDateKeys.contains(ScheduleShareDateSelection.dateKey(for: start, calendar: calendar))
            else { return nil }
            return ScheduleSharePosterFreeSlot(id: slot.id, start: start, end: end)
        }
        let renderStartedAt = ProcessInfo.processInfo.systemUptime
        let image = ScheduleSharePosterRenderer.image(
            entries: entries,
            freeSlots: freeSlots,
            selectedDates: selectedDates,
            totalEventCount: entries.count,
            hiddenCount: entries.filter(\.isHidden).count,
            shareURL: shareURL
        )
        guard let image else {
            let renderDuration = ScheduleSharePhotoSaveDiagnostics.elapsedMilliseconds(since: renderStartedAt)
            ScheduleSharePhotoSaveDiagnostics.logger.error(
                "stage=render outcome=failure duration_ms=\(renderDuration)"
            )
            issue = String(localized: "The schedule image could not be created.")
            return false
        }
        let renderDuration = ScheduleSharePhotoSaveDiagnostics.elapsedMilliseconds(since: renderStartedAt)
        let pixelWidth = Int(image.size.width * image.scale)
        let pixelHeight = Int(image.size.height * image.scale)
        ScheduleSharePhotoSaveDiagnostics.logger.notice(
            "stage=render outcome=success duration_ms=\(renderDuration) pixel_width=\(pixelWidth) pixel_height=\(pixelHeight)"
        )

        guard !Task.isCancelled else { return false }

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
            showShareNotice(String(localized: "Saved to Photos"))
            return true
        }
        #endif

        let encodeStartedAt = ProcessInfo.processInfo.systemUptime
        guard let imageData = image.pngData() else {
            let encodeDuration = ScheduleSharePhotoSaveDiagnostics.elapsedMilliseconds(since: encodeStartedAt)
            ScheduleSharePhotoSaveDiagnostics.logger.error(
                "stage=encode outcome=failure duration_ms=\(encodeDuration)"
            )
            issue = String(localized: "The schedule image could not be created.")
            return false
        }
        let encodeDuration = ScheduleSharePhotoSaveDiagnostics.elapsedMilliseconds(since: encodeStartedAt)
        ScheduleSharePhotoSaveDiagnostics.logger.notice(
            "stage=encode outcome=success duration_ms=\(encodeDuration) byte_count=\(imageData.count)"
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
            issue = String(localized: "Photo access is required to save this image.")
            return false
        }

        let writeStartedAt = ProcessInfo.processInfo.systemUptime
        do {
            try await photoLibrary.save(imageData)
            let writeDuration = ScheduleSharePhotoSaveDiagnostics.elapsedMilliseconds(since: writeStartedAt)
            let totalDuration = ScheduleSharePhotoSaveDiagnostics.elapsedMilliseconds(since: totalStartedAt)
            ScheduleSharePhotoSaveDiagnostics.logger.notice(
                "stage=photo_write outcome=success duration_ms=\(writeDuration) total_duration_ms=\(totalDuration)"
            )
            guard !Task.isCancelled else { return false }
            showShareNotice(String(localized: "Saved to Photos"))
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
            issue = String(localized: "Saving took too long. Please try again.")
            return false
        } catch {
            let writeDuration = ScheduleSharePhotoSaveDiagnostics.elapsedMilliseconds(since: writeStartedAt)
            ScheduleSharePhotoSaveDiagnostics.logger.error(
                "stage=photo_write outcome=failure duration_ms=\(writeDuration) error=\(String(describing: error), privacy: .public)"
            )
            issue = String(localized: "The schedule image could not be saved.")
            return false
        }
    }

    private func invalidateCreatedLink() {
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
              !didConfigureExternalLinkDefaults else { return }
        didConfigureExternalLinkDefaults = true
        usageLimit = "UNLIMITED"
        allowGuestProposals = false
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

private struct ScheduleSharePosterEntry: Identifiable {
    let id: String
    let start: Date
    let end: Date
    let title: String
    let location: String?
    let color: Color
    let isHidden: Bool
}

private struct ScheduleSharePosterFreeSlot: Identifiable {
    let id: String
    let start: Date
    let end: Date
}

@MainActor
private enum ScheduleSharePosterRenderer {
    static func image(
        entries: [ScheduleSharePosterEntry],
        freeSlots: [ScheduleSharePosterFreeSlot],
        selectedDates: [Date],
        totalEventCount: Int,
        hiddenCount: Int,
        shareURL: URL
    ) -> UIImage? {
        let poster = ScheduleSharePoster(
            entries: entries,
            freeSlots: freeSlots,
            selectedDates: selectedDates,
            totalEventCount: totalEventCount,
            hiddenCount: hiddenCount,
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

private struct ScheduleSharePoster: View {
    let entries: [ScheduleSharePosterEntry]
    let freeSlots: [ScheduleSharePosterFreeSlot]
    let selectedDates: [Date]
    let totalEventCount: Int
    let hiddenCount: Int
    let shareURL: URL

    private let ink = Color(red: 0.11, green: 0.10, blue: 0.14)
    private let secondary = Color(red: 0.38, green: 0.37, blue: 0.42)
    private let canvas = Color(red: 0.97, green: 0.97, blue: 0.98)
    private let green = Color(red: 0.16, green: 0.50, blue: 0.34)
    private let calendar = Calendar.sideSeatBerlin

    var body: some View {
        ZStack {
            canvas
            VStack(alignment: .leading, spacing: 0) {
                HStack(spacing: 8) {
                    SSShareMark()
                    Spacer(minLength: 8)
                    Label("Shared schedule", systemImage: "calendar")
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundStyle(secondary)
                }

                Text("My schedule")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(secondary)
                    .padding(.top, 17)

                Text(dateRangeLabel)
                    .font(.system(size: 26, weight: .bold, design: .rounded))
                    .foregroundStyle(ink)
                    .lineLimit(2)
                    .minimumScaleFactor(0.8)
                    .padding(.top, 3)

                availabilityCalendar
                    .padding(.top, 14)

                Text("Agenda")
                    .font(.system(size: 12, weight: .bold))
                    .foregroundStyle(ink)
                .padding(.top, 8)

                if entries.isEmpty {
                    Text("No events on these days")
                        .font(.system(size: 10, weight: .semibold))
                        .foregroundStyle(green)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.top, 5)
                } else {
                    VStack(spacing: 3) {
                        ForEach(displayedAgendaEntries) { entry in
                            posterAgendaEntry(entry)
                        }
                        if remainingEventCount > 0 {
                            Text(String(localized: "And \(remainingEventCount) more events"))
                                .font(.system(size: 9, weight: .semibold))
                                .foregroundStyle(secondary)
                                .padding(.top, 2)
                        }
                    }
                    .padding(.top, 4)
                }

                Spacer(minLength: 5)
                footer
            }
            .padding(22)
        }
        .frame(width: 360, height: 480)
        .clipped()
    }

    private var availabilityCalendar: some View {
        VStack(spacing: 5) {
            HStack(spacing: 8) {
                Text("Available times")
                    .font(.system(size: 11, weight: .bold))
                    .foregroundStyle(ink)
                Spacer(minLength: 4)
                timelineLegend(color: green, label: "Free")
                timelineLegend(color: secondary.opacity(0.55), label: "Busy")
            }

            HStack(spacing: 3) {
                Color.clear.frame(width: 24, height: 24)
                ForEach(timelineDates, id: \.self) { date in
                    let isSelected = isSelected(date)
                    VStack(spacing: 0) {
                        Text(date.formatted(.dateTime.weekday(.narrow)))
                            .font(.system(size: 7, weight: .semibold))
                        Text(date.formatted(.dateTime.day()))
                            .font(.system(size: 10, weight: .bold, design: .rounded))
                            .monospacedDigit()
                    }
                    .foregroundStyle(isSelected ? ink : secondary.opacity(0.45))
                    .frame(maxWidth: .infinity)
                    .frame(height: 24)
                    .background(
                        isSelected ? SideSeatTheme.rose.opacity(0.10) : Color.clear,
                        in: RoundedRectangle(cornerRadius: 5, style: .continuous)
                    )
                }
            }

            HStack(spacing: 3) {
                timelineAxis
                    .frame(width: 24, height: timelineHeight)
                ForEach(timelineDates, id: \.self) { date in
                    posterTimelineDay(date)
                        .frame(maxWidth: .infinity)
                        .frame(height: timelineHeight)
                }
            }
        }
    }

    private func timelineLegend(color: Color, label: LocalizedStringKey) -> some View {
        HStack(spacing: 3) {
            RoundedRectangle(cornerRadius: 2, style: .continuous)
                .fill(color)
                .frame(width: 8, height: 8)
            Text(label)
                .font(.system(size: 7, weight: .semibold))
                .foregroundStyle(secondary)
        }
    }

    private var timelineAxis: some View {
        GeometryReader { proxy in
            ForEach(timelineTicks, id: \.self) { hour in
                Text(hour.formatted())
                    .font(.system(size: 6, weight: .medium, design: .rounded))
                    .foregroundStyle(secondary)
                    .monospacedDigit()
                    .position(x: 9, y: timelineY(forHour: Double(hour), height: proxy.size.height))
            }
        }
    }

    private func posterTimelineDay(_ date: Date) -> some View {
        let selected = isSelected(date)
        return GeometryReader { proxy in
            ZStack(alignment: .topLeading) {
                RoundedRectangle(cornerRadius: 5, style: .continuous)
                    .fill(selected ? Color.white : Color.white.opacity(0.32))

                ForEach(timelineTicks, id: \.self) { hour in
                    Rectangle()
                        .fill(secondary.opacity(0.10))
                        .frame(height: 0.5)
                        .offset(y: timelineY(forHour: Double(hour), height: proxy.size.height))
                }

                if selected {
                    ForEach(timelineFreeSlots(on: date)) { slot in
                        timelineBlock(
                            start: slot.start,
                            end: slot.end,
                            on: date,
                            color: green.opacity(0.80),
                            height: proxy.size.height
                        )
                    }
                    ForEach(timelineEvents(on: date)) { entry in
                        timelineBlock(
                            start: entry.start,
                            end: entry.end,
                            on: date,
                            color: entry.isHidden ? secondary.opacity(0.55) : entry.color.opacity(0.82),
                            height: proxy.size.height
                        )
                    }
                } else {
                    Image(systemName: "minus")
                        .font(.system(size: 7, weight: .bold))
                        .foregroundStyle(secondary.opacity(0.30))
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                }
            }
            .clipShape(RoundedRectangle(cornerRadius: 5, style: .continuous))
        }
    }

    private func timelineBlock(
        start: Date,
        end: Date,
        on date: Date,
        color: Color,
        height: CGFloat
    ) -> some View {
        let dayStart = calendar.startOfDay(for: date)
        let dayEnd = calendar.date(byAdding: .day, value: 1, to: dayStart) ?? dayStart
        let startValue = start <= dayStart ? 0 : timelineHourValue(start)
        let rawEndValue = end >= dayEnd ? 24 : timelineHourValue(end)
        let endValue = max(rawEndValue, startValue + 0.25)
        let top = timelineY(forHour: startValue, height: height)
        let bottom = timelineY(forHour: endValue, height: height)
        return RoundedRectangle(cornerRadius: 2, style: .continuous)
            .fill(color)
            .overlay(alignment: .leading) {
                Rectangle()
                    .fill(Color.white.opacity(0.48))
                    .frame(width: 1)
            }
            .frame(height: max(bottom - top, 2))
            .padding(.horizontal, 2)
            .offset(y: top)
    }

    private func posterAgendaEntry(_ entry: ScheduleSharePosterEntry) -> some View {
        HStack(spacing: 7) {
            VStack(spacing: 0) {
                Text(entry.start.formatted(.dateTime.weekday(.narrow)))
                    .font(.system(size: 7, weight: .bold))
                    .foregroundStyle(secondary)
                Text(entry.start.formatted(.dateTime.day()))
                    .font(.system(size: 10, weight: .bold, design: .rounded))
                    .foregroundStyle(ink)
                    .monospacedDigit()
            }
            .frame(width: 22)
            Capsule()
                .fill(entry.color)
                .frame(width: 3, height: 23)
            VStack(alignment: .leading, spacing: 1) {
                HStack(alignment: .firstTextBaseline, spacing: 5) {
                    Text(entry.title)
                        .font(.system(size: 10, weight: .semibold))
                        .foregroundStyle(ink)
                        .lineLimit(1)
                    Spacer(minLength: 3)
                    Text(timeLabel(entry.start, entry.end))
                        .font(.system(size: 8, weight: .semibold))
                        .foregroundStyle(secondary)
                        .lineLimit(1)
                        .monospacedDigit()
                }
                if let location = entry.location, !location.isEmpty {
                    Label(location, systemImage: "mappin.and.ellipse")
                        .font(.system(size: 8, weight: .medium))
                        .foregroundStyle(secondary)
                        .lineLimit(1)
                } else if entry.isHidden {
                    Label("Hidden as Busy", systemImage: "lock.fill")
                        .font(.system(size: 8, weight: .medium))
                        .foregroundStyle(secondary)
                        .lineLimit(1)
                } else {
                    Text(" ")
                        .font(.system(size: 8))
                }
            }
        }
        .padding(.horizontal, 7)
        .padding(.vertical, 3)
        .background(Color.white, in: RoundedRectangle(cornerRadius: 7, style: .continuous))
    }

    private var footer: some View {
        HStack(alignment: .center, spacing: 10) {
            VStack(alignment: .leading, spacing: 4) {
                Label(
                    hiddenCount > 0
                        ? String(localized: "Hidden details are shown as Busy")
                        : String(localized: "Only selected days are included"),
                    systemImage: hiddenCount > 0 ? "lock.fill" : "checkmark.shield.fill"
                )
                .font(.system(size: 8, weight: .medium))
                .foregroundStyle(secondary)

                Text("Plan together on SideSeat")
                    .font(.system(size: 11, weight: .bold))
                    .foregroundStyle(ink)
                Text("sideseat.de")
                    .font(.system(size: 8, weight: .medium))
                    .foregroundStyle(secondary)
            }
            Spacer(minLength: 0)
            SSQRCode(url: shareURL)
                .frame(width: 42, height: 42)
        }
        .padding(.top, 8)
        .overlay(alignment: .top) {
            Rectangle()
                .fill(Color(red: 0.88, green: 0.88, blue: 0.90))
                .frame(height: 1)
        }
    }

    private var timelineDates: [Date] {
        guard let first = selectedDates.first, let last = selectedDates.last else { return [] }
        let start = calendar.startOfDay(for: first)
        let end = calendar.startOfDay(for: last)
        let span = (calendar.dateComponents([.day], from: start, to: end).day ?? 0) + 1
        if span <= 7 {
            return (0..<span).compactMap { calendar.date(byAdding: .day, value: $0, to: start) }
        }
        guard selectedDates.count > 7 else { return selectedDates }
        return Array(selectedDates.prefix(6)) + [last]
    }

    private var displayedAgendaEntries: [ScheduleSharePosterEntry] {
        Array(entries.sorted { $0.start < $1.start }.prefix(2))
    }

    private var remainingEventCount: Int {
        max(totalEventCount - displayedAgendaEntries.count, 0)
    }

    private func events(on date: Date) -> [ScheduleSharePosterEntry] {
        entries
            .filter { calendar.isDate($0.start, inSameDayAs: date) }
            .sorted { $0.start < $1.start }
    }

    private func eventCount(on date: Date) -> Int {
        events(on: date).count
    }

    private func timelineFreeSlots(on date: Date) -> [ScheduleSharePosterFreeSlot] {
        guard let interval = calendar.dateInterval(of: .day, for: date) else { return [] }
        return freeSlots.filter { $0.start < interval.end && $0.end > interval.start }
    }

    private func timelineEvents(on date: Date) -> [ScheduleSharePosterEntry] {
        guard let interval = calendar.dateInterval(of: .day, for: date) else { return [] }
        return entries.filter { $0.start < interval.end && $0.end > interval.start }
    }

    private func isSelected(_ date: Date) -> Bool {
        selectedDates.contains { calendar.isDate($0, inSameDayAs: date) }
    }

    private let timelineHeight: CGFloat = 128

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
        entries.map(\.start) + freeSlots.map(\.start)
    }

    private var allTimelineEndDates: [Date] {
        entries.map(\.end) + freeSlots.map(\.end)
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

    private func timeLabel(_ start: Date, _ end: Date) -> String {
        "\(start.formatted(date: .omitted, time: .shortened))–\(end.formatted(date: .omitted, time: .shortened))"
    }

    private var dateRangeLabel: String {
        guard let first = selectedDates.first else { return String(localized: "My schedule") }
        guard let last = selectedDates.last,
              !Calendar.sideSeatBerlin.isDate(first, inSameDayAs: last) else {
            return first.formatted(.dateTime.weekday(.wide).month(.abbreviated).day())
        }
        return "\(first.formatted(.dateTime.month(.abbreviated).day())) – \(last.formatted(.dateTime.month(.abbreviated).day()))"
    }
}
