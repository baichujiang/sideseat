import SwiftUI

private struct CalendarCategoryEditorDestination: Identifiable {
    let id = UUID()
    let category: NativeCalendarCategory?
}

struct CalendarCategoryListView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(SessionStore.self) private var session
    @State private var store = CalendarCategoryStore()
    @State private var transferStore = CalendarTransferStore()
    @State private var editor: CalendarCategoryEditorDestination?
    @State private var isShowingImporter = false
    @State private var isShowingExporter = false
    @State private var exportDocument: CalendarICSFileDocument?
    @State private var exportFilename = "sideseat-schedule"

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
                } else if store.isLoading, store.categories.isEmpty {
                    SSLoadingState("Loading calendars")
                        .frame(maxWidth: .infinity)
                        .ssListPageStateRow()
                } else {
                    categorySection("Built-in", categories: store.categories.filter(\.isBuiltIn))
                    categorySection("Custom", categories: store.categories.filter { !$0.isBuiltIn })
                }

                if let issue = store.issue, !store.categories.isEmpty {
                    Section {
                        Label(issue, systemImage: "exclamationmark.triangle")
                            .foregroundStyle(SideSeatTheme.danger)
                    }
                }
            }
            .navigationTitle("Calendars")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Done") { dismiss() }
                }
                ToolbarItemGroup(placement: .primaryAction) {
                    Menu {
                        Button {
                            isShowingImporter = true
                        } label: {
                            Label("Import iCalendar", systemImage: "square.and.arrow.down")
                        }
                        .accessibilityIdentifier("calendar-import")

                        Button {
                            Task { await prepareExport() }
                        } label: {
                            Label("Export iCalendar", systemImage: "square.and.arrow.up")
                        }
                        .accessibilityIdentifier("calendar-export")
                    } label: {
                        if transferStore.isWorking {
                            ProgressView()
                        } else {
                            Image(systemName: "ellipsis.circle")
                        }
                    }
                    .accessibilityLabel("Calendar actions")
                    .accessibilityIdentifier("calendar-actions")
                    .disabled(transferStore.isWorking)

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
            .sheet(item: $editor) { destination in
                CalendarCategoryEditorView(
                    category: destination.category,
                    store: store,
                    onSaved: onChanged
                )
            }
            .fileImporter(
                isPresented: $isShowingImporter,
                allowedContentTypes: [.sideSeatICalendar],
                allowsMultipleSelection: false
            ) { result in
                importSelection(result)
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
            .alert("Calendar transfer", isPresented: transferMessageBinding) {
                Button("OK", role: .cancel) { transferStore.clearMessage() }
            } message: {
                Text(transferStore.message ?? "")
            }
            .accessibilityIdentifier("calendar-list")
        }
    }

    @ViewBuilder
    private func categorySection(_ title: LocalizedStringKey, categories: [NativeCalendarCategory]) -> some View {
        if !categories.isEmpty {
            Section(title) {
                ForEach(categories) { category in
                    Button {
                        editor = CalendarCategoryEditorDestination(category: category)
                    } label: {
                        CalendarCategoryRow(category: category)
                    }
                    .buttonStyle(.plain)
                    .accessibilityIdentifier("calendar-row-\(category.id)")
                }
            }
        }
    }

    private var transferMessageBinding: Binding<Bool> {
        Binding(
            get: { transferStore.message != nil },
            set: { if !$0 { transferStore.clearMessage() } }
        )
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
        defer {
            if hasAccess { url.stopAccessingSecurityScopedResource() }
        }

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
    private func prepareExport() async {
        guard let exported = await transferStore.prepareExport(using: session) else { return }
        exportDocument = CalendarICSFileDocument(ics: exported.ics)
        exportFilename = (exported.filename as NSString).deletingPathExtension
        isShowingExporter = true
    }
}

private enum CalendarTransferFileReader {
    nonisolated static func readICS(from url: URL) throws -> String {
        let values = try url.resourceValues(forKeys: [.fileSizeKey, .isRegularFileKey])
        guard values.isRegularFile == true else {
            throw CocoaError(.fileReadUnsupportedScheme)
        }
        if let fileSize = values.fileSize,
           fileSize > CalendarTransferStore.maximumImportBytes {
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
            String(localized: "The iCalendar file is larger than 512 KB.")
        case .invalidEncoding:
            String(localized: "The iCalendar file is not valid UTF-8 text.")
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
            VStack(alignment: .leading, spacing: 3) {
                Text(category.name)
                    .foregroundStyle(.primary)
                if category.icsSubscriptionUrl != nil {
                    Label("Subscribed", systemImage: "link")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
            Spacer()
            Image(systemName: category.isBuiltIn ? "lock" : "chevron.right")
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
        _name = State(initialValue: category?.name ?? "")
        _color = State(initialValue: category?.color ?? CalendarCategoryPalette.colors[7])
        _subscriptionURL = State(initialValue: category?.icsSubscriptionUrl ?? "")
    }

    var body: some View {
        NavigationStack {
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
                                    if color.caseInsensitiveCompare(value) == .orderedSame {
                                        Image(systemName: "checkmark")
                                            .font(.caption.bold())
                                            .foregroundStyle(.white)
                                    }
                                }
                            }
                            .buttonStyle(.plain)
                            .accessibilityLabel(value)
                            .accessibilityAddTraits(
                                color.caseInsensitiveCompare(value) == .orderedSame ? .isSelected : []
                            )
                        }
                    }
                    .padding(.vertical, 6)
                }

                if category?.isBuiltIn != true {
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

                if let category, !category.isBuiltIn {
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
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                        .disabled(store.isMutating)
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") { Task { await save() } }
                        .accessibilityIdentifier("calendar-save")
                        .disabled(store.isMutating || trimmedName.isEmpty)
                }
            }
            .confirmationDialog(
                "Delete this calendar?",
                isPresented: $showDeleteConfirmation,
                titleVisibility: .visible
            ) {
                Button("Delete calendar", role: .destructive) {
                    Task { await delete() }
                }
                .accessibilityIdentifier("calendar-delete-confirm")
                Button("Cancel", role: .cancel) {}
            }
            .onAppear { store.clearIssue() }
        }
    }

    private var palette: [String] {
        CalendarCategoryPalette.colors.contains { $0.caseInsensitiveCompare(color) == .orderedSame }
            ? CalendarCategoryPalette.colors
            : [color] + CalendarCategoryPalette.colors
    }

    private var trimmedName: String {
        name.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private var normalizedSubscription: String? {
        let value = subscriptionURL.trimmingCharacters(in: .whitespacesAndNewlines)
        return value.isEmpty ? nil : value
    }

    private func save() async {
        let succeeded: Bool
        if let category {
            succeeded = await store.update(
                category,
                name: trimmedName,
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
