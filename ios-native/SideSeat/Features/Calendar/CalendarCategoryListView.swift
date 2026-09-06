import SwiftUI
import UIKit

private struct CalendarCategoryEditorDestination: Identifiable, Hashable {
    let id = UUID()
    let category: NativeCalendarCategory?
}

private enum CalendarConnectionNoticeStyle {
    case confirmation
    case failure
    case neutral
}

struct CalendarCategoryListView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(SessionStore.self) private var session
    @State private var store = CalendarCategoryStore()
    @State private var editor: CalendarCategoryEditorDestination?

    private let onChanged: @MainActor () async -> Void

    init(onChanged: @escaping @MainActor () async -> Void) {
        self.onChanged = onChanged
    }

    var body: some View {
        NavigationStack {
            List {
                if let issue = store.issue, store.categories.isEmpty {
                    ContentUnavailableView {
                        Label("Could not load calendars", systemImage: "wifi.exclamationmark")
                    } description: {
                        Text(issue)
                    } actions: {
                        Button("Try again") { Task { await store.load(using: session) } }
                    }
                    .ssListPageStateRow()
                } else if (!store.hasLoaded || store.isLoading), store.categories.isEmpty {
                    SSLoadingState("Loading calendars")
                        .frame(maxWidth: .infinity)
                        .ssListPageStateRow()
                } else {
                    categorySection("My calendars", categories: store.categories)
                }

                if let issue = store.issue, !store.categories.isEmpty {
                    Section {
                        Label(issue, systemImage: "exclamationmark.triangle")
                            .foregroundStyle(SideSeatTheme.danger)
                    }
                }
            }
            .navigationTitle("Calendar categories")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Done") { dismiss() }
                }
                ToolbarItem(placement: .primaryAction) {
                    Button {
                        editor = CalendarCategoryEditorDestination(category: nil)
                    } label: {
                        Image(systemName: "plus")
                    }
                    .accessibilityLabel("New calendar")
                    .accessibilityIdentifier("calendar-add")
                }
            }
            .refreshable { await store.load(using: session) }
            .task {
                if store.categories.isEmpty {
                    await store.load(using: session)
                }
            }
            .navigationDestination(item: $editor) { destination in
                CalendarCategoryEditorView(
                    category: destination.category,
                    store: store,
                    onSaved: onChanged
                )
            }
            .accessibilityIdentifier("calendar-list")
        }
        .presentationDetents([.large])
        .presentationDragIndicator(.visible)
    }

    @ViewBuilder
    private func categorySection(_ title: LocalizedStringKey, categories: [NativeCalendarCategory])
        -> some View
    {
        if !categories.isEmpty {
            Section(title) {
                ForEach(categories) { category in
                    Button {
                        editor = CalendarCategoryEditorDestination(category: category)
                    } label: {
                        CalendarCategoryRow(category: category)
                    }
                    .buttonStyle(SSPressButtonStyle())
                    .accessibilityIdentifier("calendar-row-\(category.id)")
                }
            }
        }
    }

}

struct CalendarConnectionView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(\.openURL) private var openURL
    @Environment(SessionStore.self) private var session

    @State private var connectionStore = CalendarConnectionStore()
    @State private var transferStore = CalendarTransferStore()
    @State private var pendingRevocation: NativeCalendarSubscriptionConnection?
    @State private var isShowingImporter = false
    @State private var isShowingExportYearSheet = false
    @State private var isShowingExporter = false
    @State private var selectedExportYear = CalendarExportYearOptions.currentYear()
    @State private var pendingExportYear: Int?
    @State private var exportDocument: CalendarICSFileDocument?
    @State private var exportFilename = "sideseat-schedule"
    @State private var connectionNotice: String?
    @State private var connectionNoticeStyle = CalendarConnectionNoticeStyle.neutral

    private let onChanged: @MainActor () async -> Void

    init(onChanged: @escaping @MainActor () async -> Void) {
        self.onChanged = onChanged
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                LazyVStack(alignment: .leading, spacing: SideSeatTheme.spaceXL) {
                    appleCalendarCard

                    if connectionStore.isLoading, connectionStore.connections.isEmpty {
                        loadingConnectionsCard
                    } else if !connectionStore.connections.isEmpty {
                        activeConnectionsSection
                    }

                    calendarFilesSection

                    if let issue = connectionStore.issue {
                        Label(issue, systemImage: "exclamationmark.triangle.fill")
                            .font(.footnote.weight(.medium))
                            .foregroundStyle(SideSeatTheme.danger)
                            .padding(.horizontal, SideSeatTheme.spaceXS)
                    }

                    securityNote
                }
                .padding(.horizontal, SideSeatTheme.screenHorizontal)
                .padding(.top, SideSeatTheme.spaceMD)
                .padding(.bottom, SideSeatTheme.spaceXXL)
            }
            .accessibilityIdentifier("calendar-connections")
            .background(SideSeatTheme.bgGrouped)
            .navigationTitle("Calendar connections")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Done") { dismiss() }
                }
            }
            .task { await connectionStore.load(using: session) }
            .refreshable { await connectionStore.load(using: session) }
            .fileImporter(
                isPresented: $isShowingImporter,
                allowedContentTypes: [.sideSeatICalendar],
                allowsMultipleSelection: false
            ) { result in
                importSelection(result)
            }
            .sheet(
                isPresented: $isShowingExportYearSheet,
                onDismiss: beginPendingExport
            ) {
                CalendarExportYearSheet(
                    selectedYear: $selectedExportYear
                ) { year in
                    pendingExportYear = year
                    isShowingExportYearSheet = false
                }
            }
            .fileExporter(
                isPresented: $isShowingExporter,
                document: exportDocument,
                contentType: .sideSeatICalendar,
                defaultFilename: exportFilename
            ) { result in
                if case .success = result {
                    transferStore.reportExportSaved()
                } else if case .failure(let error) = result {
                    transferStore.reportFileError(error)
                }
                exportDocument = nil
            }
            .ssActionPrompt(
                isPresented: transferMessageBinding,
                title: AppLocalization.string("Calendar transfer"),
                message: transferStore.message,
                systemImage: "arrow.up.arrow.down.circle.fill",
                dismissOnTapOutside: true,
                onDismiss: { transferStore.clearMessage() },
                accessibilityIdentifier: "calendar-transfer-prompt"
            ) {
                [
                    SSActionPromptAction(
                        id: "calendar-transfer-ok",
                        title: AppLocalization.string("OK"),
                        role: .cancel
                    ) { transferStore.clearMessage() }
                ]
            }
            .ssActionPrompt(
                isPresented: revocationBinding,
                title: AppLocalization.string("Revoke calendar connection?"),
                message: AppLocalization.string("Apple Calendar will stop receiving updates from this private link."),
                systemImage: "link.badge.minus",
                dismissOnTapOutside: true,
                onDismiss: { pendingRevocation = nil },
                accessibilityIdentifier: "calendar-connection-revoke-prompt"
            ) {
                [
                    SSActionPromptAction(
                        id: "calendar-connection-revoke-cancel",
                        title: AppLocalization.string("Cancel"),
                        role: .cancel
                    ) { pendingRevocation = nil },
                    SSActionPromptAction(
                        id: "calendar-connection-revoke-confirm",
                        title: AppLocalization.string("Revoke"),
                        role: .destructive
                    ) {
                        guard let connection = pendingRevocation else { return }
                        pendingRevocation = nil
                        Task { _ = await connectionStore.revoke(connection, using: session) }
                    },
                ]
            }
            .ssActionPrompt(
                isPresented: noticeBinding,
                title: AppLocalization.string("Calendar connection"),
                message: connectionNotice,
                systemImage: connectionNoticeSystemImage,
                tint: connectionNoticeTint,
                dismissOnTapOutside: true,
                onDismiss: { connectionNotice = nil },
                accessibilityIdentifier: "calendar-connection-notice"
            ) {
                [
                    SSActionPromptAction(
                        id: "calendar-connection-notice-ok",
                        title: AppLocalization.string("OK"),
                        role: .cancel
                    ) { connectionNotice = nil }
                ]
            }
        }
        .presentationDetents([.large])
        .presentationDragIndicator(.visible)
    }

    private var transferMessageBinding: Binding<Bool> {
        Binding(
            get: { transferStore.message != nil },
            set: { if !$0 { transferStore.clearMessage() } }
        )
    }

    private var revocationBinding: Binding<Bool> {
        Binding(
            get: { pendingRevocation != nil },
            set: { if !$0 { pendingRevocation = nil } }
        )
    }

    private var noticeBinding: Binding<Bool> {
        Binding(
            get: { connectionNotice != nil },
            set: { if !$0 { connectionNotice = nil } }
        )
    }

    private var connectionTint: Color {
        SideSeatTheme.HubTint.privacySchedule
    }

    private var appleCalendarCard: some View {
        VStack(alignment: .leading, spacing: SideSeatTheme.spaceLG) {
            appleCalendarHeader

            Text("View SideSeat events in Apple Calendar. Apple refreshes updates periodically.")
                .font(.subheadline)
                .foregroundStyle(SideSeatTheme.textSecondaryStrong)
                .fixedSize(horizontal: false, vertical: true)

            Button {
                Task { await connectAppleCalendar() }
            } label: {
                HStack(spacing: SideSeatTheme.spaceSM) {
                    if connectionStore.isMutating {
                        ProgressView()
                            .tint(SideSeatTheme.onAccent)
                    } else {
                        Image(systemName: "calendar.badge.plus")
                            .font(.subheadline.weight(.semibold))
                    }
                    Text(
                        connectionStore.connections.isEmpty
                            ? "Add to Apple Calendar"
                            : "Add another Apple Calendar"
                    )
                    .font(.body.weight(.semibold))
                    Spacer(minLength: SideSeatTheme.spaceSM)
                    Image(systemName: "arrow.up.right")
                        .font(.caption.weight(.bold))
                }
                .foregroundStyle(SideSeatTheme.onAccent)
                .padding(.horizontal, SideSeatTheme.spaceLG)
                .frame(maxWidth: .infinity)
                .frame(minHeight: 50)
                .background(SideSeatTheme.accent, in: RoundedRectangle(
                    cornerRadius: SideSeatTheme.controlRadius,
                    style: .continuous
                ))
                .contentShape(Rectangle())
            }
            .buttonStyle(SSPressButtonStyle())
            .disabled(connectionStore.isMutating)
            .accessibilityIdentifier("calendar-connection-add-apple")

            if let url = connectionStore.latestSubscriptionURL {
                Divider()
                Button {
                    UIPasteboard.general.url = url
                    showConnectionNotice(
                        AppLocalization.string("Private calendar link copied."),
                        style: .neutral
                    )
                } label: {
                    Label("Copy private subscription link", systemImage: "doc.on.doc")
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(SideSeatTheme.textPrimary)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .frame(minHeight: 44)
                        .contentShape(Rectangle())
                }
                .buttonStyle(SSPressButtonStyle())
                .accessibilityIdentifier("calendar-connection-copy-link")
            }
        }
        .padding(SideSeatTheme.spaceLG)
        .calendarConnectionCard()
    }

    private var appleCalendarHeader: some View {
        HStack(spacing: SideSeatTheme.spaceMD) {
            appleCalendarIcon
            Text("Apple Calendar")
                .font(.headline)
                .foregroundStyle(SideSeatTheme.textPrimary)
            Spacer(minLength: SideSeatTheme.spaceSM)
            readOnlyBadge
        }
    }

    private var appleCalendarIcon: some View {
        ZStack {
            RoundedRectangle(cornerRadius: SideSeatTheme.controlRadius, style: .continuous)
                .fill(connectionTint.opacity(0.14))
            Image(systemName: "apple.logo")
                .font(.title3.weight(.semibold))
                .foregroundStyle(connectionTint)
        }
        .frame(width: 48, height: 48)
        .accessibilityHidden(true)
    }

    private var readOnlyBadge: some View {
        Text("Read-only")
            .font(.caption2.weight(.semibold))
            .foregroundStyle(SideSeatTheme.textPrimary)
            .padding(.horizontal, 9)
            .padding(.vertical, 6)
            .background(connectionTint.opacity(0.18), in: Capsule())
            .fixedSize(horizontal: true, vertical: false)
    }

    private var loadingConnectionsCard: some View {
        HStack(spacing: SideSeatTheme.spaceMD) {
            ProgressView()
            Text("Loading connections")
                .font(.subheadline.weight(.medium))
                .foregroundStyle(SideSeatTheme.textSecondaryStrong)
            Spacer()
        }
        .padding(SideSeatTheme.spaceLG)
        .frame(minHeight: 64)
        .calendarConnectionCard()
    }

    private var activeConnectionsSection: some View {
        VStack(alignment: .leading, spacing: SideSeatTheme.spaceSM) {
            calendarConnectionSectionHeader(
                "Active connections",
                trailing: "\(connectionStore.connections.count)"
            )

            VStack(spacing: 0) {
                ForEach(Array(connectionStore.connections.enumerated()), id: \.element.id) { index, connection in
                    connectionRow(connection)
                    if index < connectionStore.connections.count - 1 {
                        Divider()
                            .padding(.leading, 64)
                    }
                }
            }
            .calendarConnectionCard()
        }
    }

    private var calendarFilesSection: some View {
        VStack(alignment: .leading, spacing: SideSeatTheme.spaceSM) {
            calendarConnectionSectionHeader("Calendar files")

            VStack(spacing: 0) {
                calendarFileAction(
                    title: "Import iCalendar",
                    systemImage: "square.and.arrow.down",
                    accessibilityIdentifier: "calendar-import"
                ) {
                    isShowingImporter = true
                }

                Divider()
                    .padding(.leading, 64)

                calendarFileAction(
                    title: "Export iCalendar",
                    systemImage: "square.and.arrow.up",
                    accessibilityIdentifier: "calendar-export"
                ) {
                    isShowingExportYearSheet = true
                }
            }
            .calendarConnectionCard()
        }
    }

    private var securityNote: some View {
        HStack(alignment: .top, spacing: SideSeatTheme.spaceSM) {
            Image(systemName: "lock.shield.fill")
                .font(.footnote.weight(.semibold))
                .foregroundStyle(connectionTint)
                .accessibilityHidden(true)
            Text("Subscription links are private and can be revoked anytime.")
                .font(.footnote)
                .foregroundStyle(SideSeatTheme.textSecondaryStrong)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(.horizontal, SideSeatTheme.spaceXS)
        .accessibilityElement(children: .combine)
    }

    private func calendarConnectionSectionHeader(
        _ title: LocalizedStringKey,
        trailing: String? = nil
    ) -> some View {
        HStack(alignment: .firstTextBaseline) {
            Text(title)
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(SideSeatTheme.textPrimary)
            Spacer()
            if let trailing {
                Text(trailing)
                    .font(.caption.weight(.semibold).monospacedDigit())
                    .foregroundStyle(SideSeatTheme.textSecondaryStrong)
            }
        }
        .padding(.horizontal, SideSeatTheme.spaceXS)
    }

    private func calendarFileAction(
        title: LocalizedStringKey,
        systemImage: String,
        accessibilityIdentifier: String,
        action: @escaping () -> Void
    ) -> some View {
        Button(action: action) {
            HStack(spacing: SideSeatTheme.spaceMD) {
                ZStack {
                    Circle()
                        .fill(connectionTint.opacity(0.12))
                    Image(systemName: systemImage)
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(connectionTint)
                }
                .frame(width: 40, height: 40)
                .accessibilityHidden(true)

                Text(title)
                    .font(.body.weight(.semibold))
                    .foregroundStyle(SideSeatTheme.textPrimary)
                    .layoutPriority(1)

                Spacer(minLength: SideSeatTheme.spaceSM)

                Image(systemName: "chevron.right")
                    .font(.caption.weight(.bold))
                    .foregroundStyle(.tertiary)
                    .accessibilityHidden(true)
            }
            .padding(.horizontal, SideSeatTheme.spaceMD)
            .padding(.vertical, 12)
            .frame(minHeight: 56)
            .contentShape(Rectangle())
        }
        .buttonStyle(SSPressButtonStyle())
        .disabled(transferStore.isWorking)
        .accessibilityIdentifier(accessibilityIdentifier)
    }

    @ViewBuilder
    private func connectionRow(_ connection: NativeCalendarSubscriptionConnection) -> some View {
        HStack(spacing: SideSeatTheme.spaceMD) {
            ZStack {
                Circle()
                    .fill(connectionTint.opacity(0.12))
                Image(systemName: "link")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(connectionTint)
            }
            .frame(width: 40, height: 40)
            .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 3) {
                Text(connection.label)
                    .font(.body.weight(.semibold))
                    .foregroundStyle(SideSeatTheme.textPrimary)
                Text(connectionStatus(connection))
                    .font(.footnote)
                    .foregroundStyle(SideSeatTheme.textSecondaryStrong)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .layoutPriority(1)
            Spacer(minLength: 8)
            Button(role: .destructive) {
                pendingRevocation = connection
            } label: {
                Image(systemName: "trash")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(SideSeatTheme.danger)
                    .frame(width: 36, height: 36)
                    .background(SideSeatTheme.danger.opacity(0.09), in: Circle())
                    .frame(width: 44, height: 44)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Revoke")
            .accessibilityIdentifier("calendar-connection-revoke-\(connection.id)")
        }
        .padding(.horizontal, SideSeatTheme.spaceMD)
        .padding(.vertical, 10)
        .frame(minHeight: 64)
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("calendar-connection-\(connection.id)")
    }

    private func connectionStatus(_ connection: NativeCalendarSubscriptionConnection) -> String {
        if let accessed = connection.lastAccessedAt.flatMap(Date.sideSeatChatISO8601) {
            return String(
                format: AppLocalization.string("Last refreshed %@"),
                accessed.formatted(date: .abbreviated, time: .shortened)
            )
        }
        return AppLocalization.string("Waiting for first refresh")
    }

    private var connectionNoticeSystemImage: String {
        switch connectionNoticeStyle {
        case .confirmation:
            "calendar.badge.checkmark"
        case .failure:
            "exclamationmark.triangle.fill"
        case .neutral:
            "doc.on.doc.fill"
        }
    }

    private var connectionNoticeTint: Color {
        switch connectionNoticeStyle {
        case .confirmation, .neutral:
            connectionTint
        case .failure:
            SideSeatTheme.danger
        }
    }

    @MainActor
    private func connectAppleCalendar() async {
        guard let httpsURL = await connectionStore.create(using: session) else {
            showConnectionNotice(
                connectionStore.issue
                    ?? AppLocalization.string(
                        "Could not create the Apple Calendar connection. Please try again."
                    ),
                style: .failure
            )
            return
        }

        guard let webcalURL = CalendarSubscriptionLink.appleCalendarURL(from: httpsURL) else {
            UIPasteboard.general.url = httpsURL
            showConnectionNotice(
                AppLocalization.string(
                    "Apple Calendar could not open, so the private link was copied."
                ),
                style: .failure
            )
            return
        }

        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("--ui-testing-authenticated") {
            showConnectionNotice(
                AppLocalization.string(
                    "Continue in Apple Calendar and confirm the subscription."
                ),
                style: .confirmation
            )
            return
        }
        #endif

        openURL(webcalURL) { accepted in
            Task { @MainActor in
                if accepted {
                    showConnectionNotice(
                        AppLocalization.string(
                            "Continue in Apple Calendar and confirm the subscription."
                        ),
                        style: .confirmation
                    )
                } else {
                    UIPasteboard.general.url = httpsURL
                    showConnectionNotice(
                        AppLocalization.string(
                            "Apple Calendar could not open, so the private link was copied."
                        ),
                        style: .failure
                    )
                }
            }
        }
    }

    private func showConnectionNotice(
        _ message: String,
        style: CalendarConnectionNoticeStyle
    ) {
        connectionNoticeStyle = style
        connectionNotice = message
    }

    private func importSelection(_ result: Result<[URL], Error>) {
        switch result {
        case .failure(let error):
            transferStore.reportFileError(error)
        case .success(let urls):
            guard let url = urls.first else { return }
            Task { await importCalendar(from: url) }
        }
    }

    @MainActor
    private func importCalendar(from url: URL) async {
        let hasAccess = url.startAccessingSecurityScopedResource()
        defer { if hasAccess { url.stopAccessingSecurityScopedResource() } }
        do {
            let ics = try await Task.detached(priority: .userInitiated) {
                try CalendarTransferFileReader.readICS(from: url)
            }.value
            if await transferStore.importICS(ics, using: session) {
                await onChanged()
            }
        } catch {
            transferStore.reportFileError(error)
        }
    }

    @MainActor
    private func beginPendingExport() {
        guard let year = pendingExportYear else { return }
        pendingExportYear = nil
        Task { await prepareExport(year: year) }
    }

    @MainActor
    private func prepareExport(year: Int) async {
        guard let exported = await transferStore.prepareExport(year: year, using: session) else {
            return
        }
        exportDocument = CalendarICSFileDocument(ics: exported.ics)
        exportFilename = (exported.filename as NSString).deletingPathExtension
        isShowingExporter = true
    }
}

private struct CalendarExportYearSheet: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    @Binding var selectedYear: Int
    let onExport: (Int) -> Void

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: SideSeatTheme.spaceXL) {
                    exportYearSelection
                        .padding(.horizontal, SideSeatTheme.spaceMD)
                        .padding(.vertical, 10)
                        .frame(minHeight: 64)
                        .calendarConnectionCard()

                    VStack(spacing: SideSeatTheme.spaceSM) {
                        SSPrimaryButton(
                            title: AppLocalization.string("Export iCalendar"),
                            fill: .product,
                            accessibilityID: "calendar-export-confirm"
                        ) {
                            onExport(selectedYear)
                        }

                        Button {
                            dismiss()
                        } label: {
                            Text("Cancel")
                                .font(.body.weight(.semibold))
                                .foregroundStyle(SideSeatTheme.textPrimary)
                                .frame(maxWidth: .infinity, minHeight: 52)
                                .background(
                                    SideSeatTheme.fillTertiary,
                                    in: RoundedRectangle(
                                        cornerRadius: SideSeatTheme.controlRadius,
                                        style: .continuous
                                    )
                                )
                                .contentShape(Rectangle())
                        }
                        .buttonStyle(SSPressButtonStyle())
                        .accessibilityIdentifier("calendar-export-cancel")
                    }
                }
                .frame(maxWidth: .infinity)
                .padding(.horizontal, SideSeatTheme.screenHorizontal)
                .padding(.top, SideSeatTheme.spaceLG)
                .padding(.bottom, SideSeatTheme.spaceLG)
            }
            .scrollIndicators(.hidden)
            .background(SideSeatTheme.bgGrouped.ignoresSafeArea())
            .navigationTitle("Export iCalendar")
            .navigationBarTitleDisplayMode(.inline)
        }
        .presentationDetents(presentationDetents)
        .presentationDragIndicator(.visible)
        .presentationBackground(SideSeatTheme.bgGrouped)
        .presentationContentInteraction(.scrolls)
        .accessibilityIdentifier("calendar-export-year-sheet")
    }

    private var presentationDetents: Set<PresentationDetent> {
        dynamicTypeSize.isAccessibilitySize ? [.large] : [.height(300)]
    }

    private var exportYearSelection: some View {
        ViewThatFits(in: .horizontal) {
            HStack(spacing: SideSeatTheme.spaceMD) {
                exportYearHeader
                Spacer(minLength: SideSeatTheme.spaceSM)
                exportYearStepper
            }

            VStack(alignment: .leading, spacing: SideSeatTheme.spaceSM) {
                exportYearHeader
                exportYearStepper
                    .frame(maxWidth: .infinity, alignment: .trailing)
            }
        }
    }

    private var exportYearHeader: some View {
        HStack(spacing: SideSeatTheme.spaceMD) {
            ZStack {
                Circle()
                    .fill(SideSeatTheme.HubTint.privacySchedule.opacity(0.12))
                Image(systemName: "calendar")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(SideSeatTheme.HubTint.privacySchedule)
            }
            .frame(width: 40, height: 40)
            .accessibilityHidden(true)

            Text("Year")
                .font(.body.weight(.semibold))
                .foregroundStyle(SideSeatTheme.textPrimary)
        }
    }

    private var exportYearStepper: some View {
        HStack(spacing: 2) {
            exportYearButton(
                systemImage: "minus",
                accessibilityLabel: "Previous year",
                accessibilityIdentifier: "calendar-export-year-decrement",
                isDisabled: selectedYear == CalendarExportYearOptions.supportedYears.lowerBound
            ) {
                selectedYear -= 1
            }

            Text(String(selectedYear))
                .font(.body.weight(.semibold).monospacedDigit())
                .foregroundStyle(SideSeatTheme.textPrimary)
                .frame(minWidth: 58, minHeight: 44)
                .accessibilityLabel("Year")
                .accessibilityValue(String(selectedYear))
                .accessibilityIdentifier("calendar-export-year-picker")

            exportYearButton(
                systemImage: "plus",
                accessibilityLabel: "Next year",
                accessibilityIdentifier: "calendar-export-year-increment",
                isDisabled: selectedYear == CalendarExportYearOptions.supportedYears.upperBound
            ) {
                selectedYear += 1
            }
        }
        .padding(.horizontal, 2)
        .background(SideSeatTheme.fillTertiary, in: Capsule(style: .continuous))
        .accessibilityElement(children: .contain)
    }

    private func exportYearButton(
        systemImage: String,
        accessibilityLabel: LocalizedStringKey,
        accessibilityIdentifier: String,
        isDisabled: Bool,
        action: @escaping () -> Void
    ) -> some View {
        Button(action: action) {
            Image(systemName: systemImage)
                .font(.subheadline.weight(.semibold))
                .frame(width: 44, height: 44)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .foregroundStyle(isDisabled ? SideSeatTheme.textSecondary : SideSeatTheme.accent)
        .disabled(isDisabled)
        .buttonRepeatBehavior(.enabled)
        .accessibilityLabel(accessibilityLabel)
        .accessibilityIdentifier(accessibilityIdentifier)
    }
}

private enum CalendarTransferFileReader {
    nonisolated static func readICS(from url: URL) throws -> String {
        let values = try url.resourceValues(forKeys: [.fileSizeKey, .isRegularFileKey])
        guard values.isRegularFile == true else {
            throw CocoaError(.fileReadUnsupportedScheme)
        }
        if let fileSize = values.fileSize,
            fileSize > CalendarTransferStore.maximumImportBytes
        {
            throw CalendarTransferFileError.tooLarge
        }
        let data = try Data(contentsOf: url, options: .mappedIfSafe)
        guard data.count <= CalendarTransferStore.maximumImportBytes else {
            throw CalendarTransferFileError.tooLarge
        }
        guard let ics = String(data: data, encoding: .utf8) else {
            throw CalendarTransferFileError.invalidEncoding
        }
        return ics
    }
}

private enum CalendarTransferFileError: LocalizedError {
    case tooLarge
    case invalidEncoding

    var errorDescription: String? {
        switch self {
        case .tooLarge:
            AppLocalization.string( "The iCalendar file is larger than 512 KB.")
        case .invalidEncoding:
            AppLocalization.string( "The iCalendar file is not valid UTF-8 text.")
        }
    }
}

private struct CalendarCategoryRow: View {
    let category: NativeCalendarCategory

    var body: some View {
        HStack(spacing: 12) {
            Circle()
                .fill(Color(hex: category.color) ?? .secondary)
                .frame(width: 14, height: 14)
                .overlay {
                    Circle()
                        .strokeBorder(SideSeatTheme.separator.opacity(0.55), lineWidth: 0.75)
                }
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 3) {
                Text(category.displayName)
                    .foregroundStyle(.primary)
                if category.icsSubscriptionUrl != nil {
                    Label("Subscribed", systemImage: "link")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
            Spacer()
            Image(systemName: "chevron.right")
                .font(.caption.weight(.semibold))
                .foregroundStyle(.tertiary)
        }
        .contentShape(Rectangle())
        .padding(.vertical, 2)
    }
}

private struct CalendarCategoryEditorView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(SessionStore.self) private var session

    let category: NativeCalendarCategory?
    let store: CalendarCategoryStore
    let onSaved: @MainActor () async -> Void

    @State private var name: String
    @State private var color: String
    @State private var subscriptionURL: String
    @State private var showDeleteConfirmation = false

    init(
        category: NativeCalendarCategory?,
        store: CalendarCategoryStore,
        onSaved: @escaping @MainActor () async -> Void
    ) {
        self.category = category
        self.store = store
        self.onSaved = onSaved
        _name = State(initialValue: category?.displayName ?? "")
        _color = State(initialValue: category?.color ?? CalendarCategoryPalette.colors[7])
        _subscriptionURL = State(initialValue: category?.icsSubscriptionUrl ?? "")
    }

    var body: some View {
        Form {
            Section {
                TextField("Calendar name", text: $name)
                    .accessibilityIdentifier("calendar-name")
            }

            Section("Color") {
                LazyVGrid(columns: Array(repeating: GridItem(.flexible()), count: 6), spacing: 14) {
                    ForEach(palette, id: \.self) { value in
                        Button {
                            color = value
                        } label: {
                            ZStack {
                                Circle()
                                    .fill(Color(hex: value) ?? .secondary)
                                    .frame(width: 34, height: 34)
                                    .overlay {
                                        Circle()
                                            .strokeBorder(
                                                SideSeatTheme.separator.opacity(0.55),
                                                lineWidth: 0.75
                                            )
                                    }
                                if color.caseInsensitiveCompare(value) == .orderedSame {
                                    Image(systemName: "checkmark")
                                        .font(.caption.bold())
                                        .foregroundStyle(.white)
                                        .shadow(color: .black.opacity(0.55), radius: 1)
                                }
                            }
                            .ssIconButtonHitTarget()
                        }
                        .buttonStyle(SSPressButtonStyle())
                        .accessibilityLabel(value)
                        .accessibilityIdentifier("calendar-color-swatch-\(swatchID(value))")
                        .accessibilityAddTraits(
                            color.caseInsensitiveCompare(value) == .orderedSame ? .isSelected : []
                        )
                    }
                }
                .padding(.vertical, 6)

                ColorPicker(
                    "Custom color",
                    selection: customColorBinding,
                    supportsOpacity: false
                )
                .frame(minHeight: 44)
                .accessibilityIdentifier("calendar-color-custom")
            }

            if category?.isPreset != true {
                Section("Subscription") {
                    TextField("https:// or webcal://", text: $subscriptionURL)
                        .textInputAutocapitalization(.never)
                        .keyboardType(.URL)
                        .autocorrectionDisabled()
                        .accessibilityIdentifier("calendar-subscription-url")
                }
            }

            if let issue = store.issue {
                Section {
                    Label(issue, systemImage: "exclamationmark.triangle")
                        .foregroundStyle(SideSeatTheme.danger)
                }
            }

            if category != nil {
                Section {
                    Button("Delete calendar", role: .destructive) {
                        showDeleteConfirmation = true
                    }
                    .accessibilityIdentifier("calendar-delete")
                    .disabled(store.isMutating)
                }
            }
        }
        .navigationTitle(category == nil ? "New calendar" : "Edit calendar")
        .navigationBarTitleDisplayMode(.inline)
        .interactiveDismissDisabled(store.isMutating)
        .toolbar {
            ToolbarItem(placement: .confirmationAction) {
                Button("Save") { Task { await save() } }
                    .accessibilityIdentifier("calendar-save")
                    .disabled(store.isMutating || trimmedName.isEmpty)
                    .ssConfirmationActionStyle()
            }
        }
        .ssActionPrompt(
            isPresented: $showDeleteConfirmation,
            title: AppLocalization.string("Delete this calendar?"),
            message: AppLocalization.string(
                "Events in this calendar will remain and become uncategorized."
            ),
            systemImage: "trash.fill",
            tint: SideSeatTheme.danger,
            onDismiss: { showDeleteConfirmation = false },
            accessibilityIdentifier: "calendar-delete-prompt"
        ) {
            [
                SSActionPromptAction(
                    id: "calendar-delete-cancel",
                    title: AppLocalization.string("Cancel"),
                    role: .cancel
                ) {
                    showDeleteConfirmation = false
                },
                SSActionPromptAction(
                    id: "calendar-delete-confirm",
                    title: AppLocalization.string("Delete calendar"),
                    systemImage: "trash",
                    role: .destructive
                ) {
                    Task { await delete() }
                },
            ]
        }
        .onAppear { store.clearIssue() }
    }

    private var palette: [String] {
        CalendarCategoryPalette.colors.contains { $0.caseInsensitiveCompare(color) == .orderedSame }
            ? CalendarCategoryPalette.colors
            : [color] + CalendarCategoryPalette.colors
    }

    private var customColorBinding: Binding<Color> {
        Binding(
            get: {
                Color(hex: color)
                    ?? Color(hex: CalendarCategoryPalette.colors[7])
                    ?? SideSeatTheme.accent
            },
            set: { selected in
                guard let hex = CalendarCategoryColorCodec.hex(from: selected) else { return }
                color = hex
            }
        )
    }

    private func swatchID(_ value: String) -> String {
        value.trimmingCharacters(in: CharacterSet(charactersIn: "#")).lowercased()
    }

    private var trimmedName: String {
        name.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private var normalizedSubscription: String? {
        let value = subscriptionURL.trimmingCharacters(in: .whitespacesAndNewlines)
        return value.isEmpty ? nil : value
    }

    private var nameForSave: String {
        guard let category, category.isPreset, trimmedName == category.displayName else {
            return trimmedName
        }
        return category.name
    }

    private func save() async {
        let succeeded: Bool
        if let category {
            succeeded = await store.update(
                category,
                name: nameForSave,
                color: color,
                subscriptionURL: normalizedSubscription,
                using: session
            )
        } else {
            succeeded = await store.create(
                name: trimmedName,
                color: color,
                subscriptionURL: normalizedSubscription,
                using: session
            )
        }
        guard succeeded else { return }
        await onSaved()
        dismiss()
    }

    private func delete() async {
        guard let category, await store.delete(category, using: session) else { return }
        await onSaved()
        dismiss()
    }
}

enum CalendarCategoryColorCodec {
    static func hex(from color: Color) -> String? {
        var red: CGFloat = 0
        var green: CGFloat = 0
        var blue: CGFloat = 0
        var alpha: CGFloat = 0
        guard UIColor(color).getRed(&red, green: &green, blue: &blue, alpha: &alpha) else {
            return nil
        }

        func component(_ value: CGFloat) -> Int {
            Int((min(max(value, 0), 1) * 255).rounded())
        }

        return String(
            format: "#%02X%02X%02X",
            component(red),
            component(green),
            component(blue)
        )
    }
}

private struct CalendarConnectionCardModifier: ViewModifier {
    func body(content: Content) -> some View {
        content
            .background(
                SideSeatTheme.surface,
                in: RoundedRectangle(
                    cornerRadius: SideSeatTheme.cardRadius,
                    style: .continuous
                )
            )
            .overlay {
                RoundedRectangle(
                    cornerRadius: SideSeatTheme.cardRadius,
                    style: .continuous
                )
                .strokeBorder(SideSeatTheme.separator.opacity(0.22), lineWidth: 0.5)
            }
            .clipShape(
                RoundedRectangle(
                    cornerRadius: SideSeatTheme.cardRadius,
                    style: .continuous
                )
            )
    }
}

private extension View {
    func calendarConnectionCard() -> some View {
        modifier(CalendarConnectionCardModifier())
    }
}
