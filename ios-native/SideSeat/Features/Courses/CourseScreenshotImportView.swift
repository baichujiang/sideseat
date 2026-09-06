import PhotosUI
import SwiftUI

struct CourseScreenshotImportView: View {
    @Environment(SessionStore.self) private var session
    @Environment(\.dismiss) private var dismiss

    let school: String?
    let onImported: () async -> Void

    @State private var store = CourseScreenshotImportStore()
    @State private var selectedPhoto: PhotosPickerItem?
    @State private var selectedImageData: Data?
    @State private var imageIssue: String?

    var body: some View {
        NavigationStack {
            List {
                photoSection

                if store.isAnalyzing {
                    SSLoadingState("Reading timetable")
                        .frame(maxWidth: .infinity)
                        .ssListPageStateRow()
                } else if !store.matches.isEmpty {
                    matchesSection
                    detectedTextSection
                } else if selectedImageData != nil, store.issue == nil {
                    ContentUnavailableView(
                        "No course matches",
                        systemImage: "text.magnifyingglass",
                        description: Text("Try a clearer screenshot or add the course by name.")
                    )
                    .ssListPageStateRow()
                    detectedTextSection
                }

                if let issue = imageIssue ?? store.issue {
                    Section {
                        Label(issue, systemImage: "exclamationmark.triangle")
                            .foregroundStyle(SideSeatTheme.danger)
                    }
                }
            }
            .listStyle(.insetGrouped)
            .navigationTitle("Import timetable")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                        .disabled(store.isImporting)
                        .accessibilityIdentifier("course-screenshot-import-cancel")
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(addButtonTitle) {
                        Task {
                            if await store.importSelected(using: session) {
                                await onImported()
                                dismiss()
                            }
                        }
                    }
                    .disabled(store.selectedCourseIDs.isEmpty || store.isImporting)
                    .ssConfirmationActionStyle()
                    .accessibilityIdentifier("course-screenshot-import-confirm")
                }
            }
            .overlay {
                if store.isImporting {
                    SSLoadingState("Adding courses")
                        .padding(18)
                        .background(.regularMaterial)
                        .clipShape(RoundedRectangle(cornerRadius: SideSeatTheme.controlRadius, style: .continuous))
                }
            }
        }
        .onChange(of: selectedPhoto) { _, item in
            guard let item else { return }
            Task { await load(item) }
        }
        .accessibilityIdentifier("course-screenshot-import")
    }

    private var photoSection: some View {
        Section {
            if let data = selectedImageData, let image = UIImage(data: data) {
                Image(uiImage: image)
                    .resizable()
                    .scaledToFit()
                    .frame(maxHeight: 180)
                    .clipShape(RoundedRectangle(cornerRadius: SideSeatTheme.mediaRadius, style: .continuous))
                    .frame(maxWidth: .infinity)
            }

            if selectedImageData == nil {
                PhotosPicker(selection: $selectedPhoto, matching: .images) {
                    Label("Choose timetable screenshot", systemImage: "photo.on.rectangle")
                }
                .disabled(store.isAnalyzing || store.isImporting)
                .accessibilityIdentifier("course-screenshot-picker")
            } else {
                PhotosPicker(selection: $selectedPhoto, matching: .images) {
                    Label("Choose another screenshot", systemImage: "photo.on.rectangle")
                }
                .disabled(store.isAnalyzing || store.isImporting)
                .accessibilityIdentifier("course-screenshot-picker")
            }
        }
    }

    private var matchesSection: some View {
        Section {
            ForEach(store.matches) { match in
                Button {
                    guard !match.course.viewer.enrolled else { return }
                    store.toggle(match.id)
                } label: {
                    HStack(alignment: .top, spacing: SideSeatTheme.spaceMD) {
                        Image(systemName: selectionIcon(for: match))
                            .font(.title3)
                            .foregroundStyle(selectionColor(for: match))
                            .frame(width: 26)
                        VStack(alignment: .leading, spacing: 4) {
                            HStack(alignment: .firstTextBaseline, spacing: 8) {
                                if let code = match.course.code {
                                    Text(code)
                                        .font(.caption.weight(.semibold))
                                        .foregroundStyle(SideSeatTheme.courseFallback)
                                }
                                Text(match.course.name)
                                    .font(.body.weight(.medium))
                                    .foregroundStyle(.primary)
                            }
                            Text(
                                match.course.viewer.enrolled
                                    ? "Already in my courses"
                                    : AppLocalization.string(resource: match.confidenceLabel)
                            )
                                .font(.caption)
                                .foregroundStyle(match.course.viewer.enrolled ? SideSeatTheme.success : .secondary)
                            Text(match.evidence)
                                .font(.caption2)
                                .foregroundStyle(SideSeatTheme.textSecondaryStrong)
                                .lineLimit(1)
                        }
                    }
                    .padding(.vertical, 2)
                }
                .buttonStyle(SSPressButtonStyle())
                .disabled(match.course.viewer.enrolled)
                .accessibilityIdentifier("course-screenshot-match-\(match.id)")
            }
        } header: {
            Text("Course matches")
        } footer: {
            Text("Check each match before adding it to your current courses.")
        }
    }

    @ViewBuilder
    private var detectedTextSection: some View {
        if !store.recognizedLines.isEmpty {
            Section {
                DisclosureGroup("Detected text") {
                    ForEach(Array(store.recognizedLines.prefix(16).enumerated()), id: \.offset) { _, line in
                        Text(line)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
            }
        }
    }

    private var addButtonTitle: String {
        String(format: AppLocalization.string( "Add %d"), store.selectedCourseIDs.count)
    }

    private func selectionIcon(for match: CourseScreenshotMatch) -> String {
        if match.course.viewer.enrolled { return "checkmark.circle.fill" }
        return store.selectedCourseIDs.contains(match.id) ? "checkmark.circle.fill" : "circle"
    }

    private func selectionColor(for match: CourseScreenshotMatch) -> Color {
        if match.course.viewer.enrolled { return SideSeatTheme.success }
        return store.selectedCourseIDs.contains(match.id) ? SideSeatTheme.accentText : .secondary
    }

    private func load(_ item: PhotosPickerItem) async {
        imageIssue = nil
        do {
            guard let data = try await item.loadTransferable(type: Data.self) else {
                throw CourseScreenshotImportViewError.unreadableImage
            }
            selectedImageData = data
            await store.analyze(imageData: data, school: school, using: session)
        } catch {
            selectedImageData = nil
            imageIssue = error.localizedDescription
        }
    }
}

private enum CourseScreenshotImportViewError: LocalizedError {
    case unreadableImage

    var errorDescription: String? { AppLocalization.string( "The selected image could not be read.") }
}
