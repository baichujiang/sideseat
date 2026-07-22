import PhotosUI
import SwiftUI
import UIKit

struct DiscoverBuddyCreateView: View {
    @Environment(SessionStore.self) private var session
    @Environment(\.dismiss) private var dismiss
    @State private var store = DiscoverCreateStore()
    @State private var title = ""
    @State private var bodyText = ""
    @State private var expiresAt = Calendar.current.date(byAdding: .day, value: 7, to: .now) ?? .now
    @State private var selectedPhotos: [PhotosPickerItem] = []
    @State private var imageDrafts: [NativeDiscoverBuddyImageDraft] = []
    @State private var isPreparingImages = false
    @State private var localIssue: String?
    let onCreated: () async -> Void

    var body: some View {
        Form {
            Section {
                TextField(
                    "Title",
                    text: $title,
                    prompt: Text("e.g. someone to study with, a lunch buddy on weekdays")
                )
                .accessibilityIdentifier("buddy-title")
                PlaceholderTextEditor(
                    text: $bodyText,
                    placeholder: "Add timing, location, preferences, or anything else helpful."
                )
                .frame(minHeight: 100)
                .accessibilityIdentifier("buddy-body")
            }
            Section {
                DatePicker("Expires", selection: $expiresAt, in: Date.now..., displayedComponents: [.date, .hourAndMinute])
            }
            Section("Photos") {
                PhotosPicker(
                    selection: $selectedPhotos,
                    maxSelectionCount: max(0, 3 - imageDrafts.count),
                    matching: .images
                ) {
                    Label("Add photos", systemImage: "photo.badge.plus")
                }
                .disabled(imageDrafts.count >= 3 || isPreparingImages || store.isSaving)
                .accessibilityIdentifier("buddy-add-photos")

                if !imageDrafts.isEmpty {
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 12) {
                            ForEach(imageDrafts) { draft in
                                BuddyImageDraftThumbnail(draft: draft) {
                                    imageDrafts.removeAll { $0.id == draft.id }
                                }
                            }
                        }
                        .padding(.vertical, 4)
                    }
                    .accessibilityIdentifier("buddy-photo-preview-list")
                }
                if isPreparingImages {
                    ProgressView("Preparing photos")
                }
            }
            if let localIssue {
                Section { Text(localIssue).foregroundStyle(SideSeatTheme.danger) }
            }
            if let issue = store.issue {
                Section { Text(issue).foregroundStyle(SideSeatTheme.danger) }
            }
        }
        .navigationTitle("Find buddies")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .cancellationAction) {
                Button("Cancel") { dismiss() }
            }
            ToolbarItem(placement: .confirmationAction) {
                Button("Post") {
                    Task {
                        if await store.createBuddy(
                            title: title,
                            body: bodyText,
                            expiresAt: expiresAt,
                            images: imageDrafts,
                            using: session
                        ) {
                            await onCreated()
                        }
                    }
                }
                .disabled(title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || isPreparingImages || store.isSaving)
                .accessibilityIdentifier("buddy-submit")
            }
        }
        .interactiveDismissDisabled(store.isSaving)
        .accessibilityIdentifier("buddy-create-view")
        .onChange(of: selectedPhotos) { _, items in
            Task { await prepareSelectedPhotos(items) }
        }
    }

    private func prepareSelectedPhotos(_ items: [PhotosPickerItem]) async {
        guard !items.isEmpty else { return }
        isPreparingImages = true
        localIssue = nil
        defer {
            isPreparingImages = false
            selectedPhotos = []
        }

        var nextDrafts = imageDrafts
        for item in items where nextDrafts.count < 3 {
            do {
                guard let data = try await item.loadTransferable(type: Data.self),
                      let draft = DiscoverImagePreprocessor.makeDraft(from: data)
                else {
                    localIssue = "That photo could not be read."
                    continue
                }
                nextDrafts.append(draft)
            } catch {
                localIssue = "That photo could not be read."
            }
        }
        imageDrafts = nextDrafts
    }
}

private struct BuddyImageDraftThumbnail: View {
    let draft: NativeDiscoverBuddyImageDraft
    let onRemove: () -> Void

    var body: some View {
        ZStack(alignment: .topTrailing) {
            Group {
                if let image = UIImage(data: draft.data) {
                    Image(uiImage: image)
                        .resizable()
                        .scaledToFill()
                } else {
                    Image(systemName: "photo")
                        .font(.title2)
                        .foregroundStyle(.secondary)
                }
            }
            .frame(width: 72, height: 72)
            .clipShape(RoundedRectangle(cornerRadius: SideSeatTheme.controlRadius, style: .continuous))

            Button(action: onRemove) {
                Image(systemName: "xmark.circle.fill")
                    .font(.title3)
                    .symbolRenderingMode(.palette)
                    .foregroundStyle(.white, .black.opacity(0.45))
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Remove photo")
        }
    }
}

struct DiscoverActivityCreateView: View {
    @Environment(SessionStore.self) private var session
    @Environment(\.dismiss) private var dismiss
    @State private var store = DiscoverCreateStore()
    @State private var title = ""
    @State private var descriptionText = ""
    @State private var startAt = Date.now.addingTimeInterval(2 * 60 * 60)
    @State private var location = ""
    @State private var unlimitedCapacity = true
    @State private var capacity = 8
    let onCreated: () async -> Void

    var body: some View {
        Form {
            Section {
                TextField(
                    "Title",
                    text: $title,
                    prompt: Text("e.g. Sunday coffee study session")
                )
                .accessibilityIdentifier("activity-title")
                PlaceholderTextEditor(
                    text: $descriptionText,
                    placeholder: "What to bring, who it's for, meetup spot…"
                )
                .frame(minHeight: 100)
                .accessibilityIdentifier("activity-description")
            }
            Section {
                DatePicker(
                    "Starts",
                    selection: $startAt,
                    in: Date.now.addingTimeInterval(60 * 60)...,
                    displayedComponents: [.date, .hourAndMinute]
                )
                TextField(
                    "Location",
                    text: $location,
                    prompt: Text("Campus café, library, park…")
                )
                .accessibilityIdentifier("activity-location")
            }
            Section {
                Toggle("Unlimited capacity", isOn: $unlimitedCapacity)
                if !unlimitedCapacity {
                    Stepper("Capacity: \(capacity)", value: $capacity, in: 2...50)
                }
            }
            if let issue = store.issue {
                Section { Text(issue).foregroundStyle(SideSeatTheme.danger) }
            }
        }
        .navigationTitle("New activity")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .cancellationAction) {
                Button("Cancel") { dismiss() }
            }
            ToolbarItem(placement: .confirmationAction) {
                Button("Create") {
                    Task {
                        if await store.createActivity(
                            title: title,
                            description: descriptionText,
                            startAt: startAt,
                            location: location,
                            unlimitedCapacity: unlimitedCapacity,
                            capacity: capacity,
                            using: session
                        ) {
                            await onCreated()
                        }
                    }
                }
                .disabled(!canSubmit || store.isSaving)
                .accessibilityIdentifier("activity-submit")
            }
        }
        .interactiveDismissDisabled(store.isSaving)
        .accessibilityIdentifier("activity-create-view")
    }

    private var canSubmit: Bool {
        !title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty &&
            !descriptionText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty &&
            !location.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }
}

private struct PlaceholderTextEditor: View {
    @Binding var text: String
    let placeholder: LocalizedStringKey

    var body: some View {
        ZStack(alignment: .topLeading) {
            if text.isEmpty {
                Text(placeholder)
                    .foregroundStyle(.tertiary)
                    .padding(.top, 8)
                    .padding(.leading, 5)
                    .allowsHitTesting(false)
            }
            TextEditor(text: $text)
                .scrollContentBackground(.hidden)
        }
    }
}
