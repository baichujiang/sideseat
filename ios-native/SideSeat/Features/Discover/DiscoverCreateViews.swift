import PhotosUI
import SwiftUI
import UIKit

private enum BuddyExpiryPreset: String, CaseIterable, Identifiable {
    case threeDays
    case oneWeek
    case oneMonth
    case never

    var id: String { rawValue }

    var title: LocalizedStringKey {
        switch self {
        case .threeDays: "3d"
        case .oneWeek: "1w"
        case .oneMonth: "1m"
        case .never: "Never"
        }
    }

    var hint: LocalizedStringKey {
        switch self {
        case .threeDays: "Visible for about 3 days."
        case .oneWeek: "Visible for about 1 week."
        case .oneMonth: "Visible for about 1 month."
        case .never: "Stays visible until you remove it."
        }
    }

    func expiresAt(from now: Date = .now) -> Date {
        let calendar = Calendar.current
        switch self {
        case .threeDays:
            return calendar.date(byAdding: .day, value: 3, to: now)?.endOfDay ?? now
        case .oneWeek:
            return calendar.date(byAdding: .day, value: 7, to: now)?.endOfDay ?? now
        case .oneMonth:
            return calendar.date(byAdding: .day, value: 30, to: now)?.endOfDay ?? now
        case .never:
            return Date(timeIntervalSince1970: 4_102_444_799) // 2099-12-31
        }
    }

    static func preset(for expiry: Date?, now: Date = .now) -> BuddyExpiryPreset {
        guard let expiry else { return .oneWeek }
        if Calendar.current.component(.year, from: expiry) >= 2090 { return .never }
        let remainingDays = max(0, expiry.timeIntervalSince(now) / 86_400)
        if remainingDays <= 4 { return .threeDays }
        if remainingDays <= 14 { return .oneWeek }
        return .oneMonth
    }
}

private enum BuddyVisibilityPreset: String, CaseIterable, Identifiable {
    case everyone = "CITY_INTERNATIONALS"
    case verifiedStudents = "VERIFIED_ONLY"
    case sameSchool = "SCHOOL_ONLY"
    case coursemates = "COURSEMATES_ONLY"

    var id: String { rawValue }

    var title: LocalizedStringKey {
        switch self {
        case .everyone: "Everyone"
        case .verifiedStudents: "Verified students"
        case .sameSchool: "Same school"
        case .coursemates: "Coursemates"
        }
    }

    var hint: LocalizedStringKey {
        switch self {
        case .everyone: "Anyone in your city can discover this plan."
        case .verifiedStudents: "Only users with a verified student identity."
        case .sameSchool: "Only students from your school."
        case .coursemates: "Only students in the courses you select."
        }
    }

    var systemImage: String {
        switch self {
        case .everyone: "globe"
        case .verifiedStudents: "checkmark.seal.fill"
        case .sameSchool: "building.columns.fill"
        case .coursemates: "person.2.fill"
        }
    }
}

private extension Date {
    var endOfDay: Date {
        Calendar.current.date(bySettingHour: 23, minute: 59, second: 59, of: self) ?? self
    }
}

struct DiscoverPlanCreateView: View {
    @Environment(SessionStore.self) private var session
    @Environment(\.dismiss) private var dismiss
    @State private var store = DiscoverCreateStore()
    @State private var courseStore = CourseListStore()
    @State private var title = ""
    @State private var bodyText = ""
    @State private var visibilityPreset: BuddyVisibilityPreset = .everyone
    @State private var selectedCourseIds = Set<String>()
    @State private var hasSchedule = false
    @State private var startsAt = Date().addingTimeInterval(60 * 60)
    @State private var endsAt = Date().addingTimeInterval(2 * 60 * 60)
    @State private var location = ""
    @State private var hasCapacityLimit = false
    @State private var capacity = 4
    @State private var expiryPreset: BuddyExpiryPreset = .oneWeek
    @State private var selectedPhotos: [PhotosPickerItem] = []
    @State private var imageDrafts: [NativeDiscoverBuddyImageDraft] = []
    @State private var existingImageURLs: [String] = []
    @State private var isPreparingImages = false
    @State private var localIssue: String?
    @State private var submitIssue: String?
    @State private var didSucceed = false
    @FocusState private var focusedField: BuddyField?

    private enum BuddyField { case title, body }

    private let titleMax = 120
    private let bodyMax = 280

    private let editingPost: NativeDiscoverBuddyPost?
    private let repostingPost: NativeDiscoverBuddyPost?
    private let originalExpiryDate: Date?
    private let initialExpiryPreset: BuddyExpiryPreset
    let onCreated: (String) async -> Void

    init(
        editingPost: NativeDiscoverBuddyPost? = nil,
        repostingPost: NativeDiscoverBuddyPost? = nil,
        onCreated: @escaping (String) async -> Void
    ) {
        precondition(editingPost == nil || repostingPost == nil)
        self.editingPost = editingPost
        self.repostingPost = repostingPost
        self.onCreated = onCreated

        let sourcePost = editingPost ?? repostingPost
        let now = Date()
        let defaultStart = Date().addingTimeInterval(60 * 60)
        let sourceStart = sourcePost?.startDate
        let sourceEnd = sourcePost?.endDate
        let canReuseSchedule = editingPost != nil || (
            sourceStart.map { $0 > now } == true &&
            sourceEnd.map { end in sourceStart.map { end > $0 } == true } == true
        )
        let start = canReuseSchedule ? (sourceStart ?? defaultStart) : defaultStart
        let end = canReuseSchedule ? (sourceEnd ?? start.addingTimeInterval(60 * 60)) : start.addingTimeInterval(60 * 60)
        let expiry = editingPost?.expiryDate
        let expiryPreset = BuddyExpiryPreset.preset(for: expiry)
        originalExpiryDate = expiry
        initialExpiryPreset = expiryPreset

        _title = State(initialValue: sourcePost?.title ?? "")
        _bodyText = State(initialValue: sourcePost?.body ?? "")
        _visibilityPreset = State(
            initialValue: sourcePost.flatMap { BuddyVisibilityPreset(rawValue: $0.visibility) } ?? .everyone
        )
        _selectedCourseIds = State(initialValue: Set(sourcePost?.linkedCourses.map(\.id) ?? []))
        _hasSchedule = State(initialValue: canReuseSchedule && sourceStart != nil && sourceEnd != nil)
        _startsAt = State(initialValue: start)
        _endsAt = State(initialValue: end)
        _location = State(initialValue: sourcePost?.location ?? "")
        _hasCapacityLimit = State(initialValue: sourcePost?.capacity != nil)
        _capacity = State(initialValue: sourcePost?.capacity ?? 4)
        _expiryPreset = State(initialValue: expiryPreset)
        _existingImageURLs = State(initialValue: sourcePost?.imageUrls ?? [])
    }

    private var trimmedTitle: String { title.trimmingCharacters(in: .whitespacesAndNewlines) }
    private var enrolledCourses: [NativeCourseSummary] { courseStore.payload?.courses ?? [] }
    private var visibilityPresets: [BuddyVisibilityPreset] {
        enrolledCourses.isEmpty
            ? [.everyone, .verifiedStudents, .sameSchool]
            : BuddyVisibilityPreset.allCases
    }
    private var normalizedTags: [String] {
        BuddyHashtagParser.tags(in: "\(title)\n\(bodyText)")
    }
    private var isEditing: Bool { editingPost != nil }
    private var isReposting: Bool { repostingPost != nil }
    private var sourcePost: NativeDiscoverBuddyPost? { editingPost ?? repostingPost }
    private var needsCourseSelection: Bool {
        visibilityPreset == .coursemates || sourcePost?.category == "SHARED_COURSES"
    }
    private var createCategory: String {
        repostingPost?.category == "SHARED_COURSES" ? "SHARED_COURSES" : "OTHER"
    }
    private var totalImageCount: Int { existingImageURLs.count + imageDrafts.count }
    private var earliestStart: Date { isEditing ? min(Date(), startsAt) : Date() }
    private var selectedExpiryDate: Date {
        if isEditing,
           expiryPreset == initialExpiryPreset,
           let originalExpiryDate,
           originalExpiryDate > Date() {
            return originalExpiryDate
        }
        return expiryPreset.expiresAt()
    }

    private var canSubmit: Bool {
        !trimmedTitle.isEmpty &&
            trimmedTitle.count <= titleMax &&
            bodyText.count <= bodyMax &&
            (!needsCourseSelection || !selectedCourseIds.isEmpty) &&
            (!hasSchedule || endsAt > startsAt) &&
            !isPreparingImages &&
            !store.isSaving
    }

    var body: some View {
        VStack(spacing: 0) {
            planForm
            submitBar
        }
        .navigationTitle(isEditing ? "Edit plan" : (isReposting ? "Repost plan" : "Create plan"))
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .cancellationAction) {
                Button("Cancel") { dismiss() }
                    .tint(SideSeatTheme.textPrimary)
                    .disabled(store.isSaving)
                    .accessibilityIdentifier("buddy-cancel")
            }
            if focusedField != nil {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { focusedField = nil }
                        .accessibilityIdentifier("buddy-keyboard-done")
                }
            }
        }
        .interactiveDismissDisabled(store.isSaving)
        .sensoryFeedback(.success, trigger: didSucceed)
        .alert(
            isEditing ? "Couldn't save changes" : (isReposting ? "Couldn't repost plan" : "Couldn't create plan"),
            isPresented: Binding(
                get: { submitIssue != nil },
                set: { isPresented in
                    if !isPresented { submitIssue = nil }
                }
            )
        ) {
            Button("OK", role: .cancel) {}
        } message: {
            Text(submitIssue ?? "Please try again.")
        }
        .onChange(of: selectedPhotos) { _, items in
            Task { await prepareSelectedPhotos(items) }
        }
        .task {
            await courseStore.load(using: session, scope: .enrolled, school: nil, query: "")
            if isReposting {
                selectedCourseIds.formIntersection(Set(enrolledCourses.map(\.id)))
            } else if selectedCourseIds.isEmpty, editingPost == nil {
                selectedCourseIds = Set(enrolledCourses.map(\.id))
            }
        }
    }

    private var planForm: some View {
        Form {
            if isReposting {
                Section {
                    HStack(spacing: SideSeatTheme.spaceSM) {
                        Image(systemName: "arrow.clockwise.circle.fill")
                            .foregroundStyle(SideSeatTheme.accent)
                        Text("Ready to repost")
                            .foregroundStyle(SideSeatTheme.textPrimary)
                    }
                        .font(.headline)
                    Text("Review who can see this plan and choose current courses before posting.")
                        .font(.footnote)
                        .foregroundStyle(SideSeatTheme.textSecondaryStrong)
                }
                .accessibilityIdentifier("buddy-repost-notice")
            }

            Section {
                VStack(alignment: .leading, spacing: 6) {
                    HStack {
                        Text("Title")
                            .font(.caption.weight(.medium))
                            .foregroundStyle(SideSeatTheme.textSecondaryStrong)
                        Spacer()
                        Text("\(title.count)/\(titleMax)")
                            .font(SideSeatTheme.Text.monoDigitCaption)
                            .foregroundStyle(charCountColor(title.count, limit: titleMax))
                    }
                    PlaceholderTextEditor(
                        text: $title,
                        placeholder: "Plan title",
                        accessibilityLabel: "Title",
                        focusValue: BuddyField.title,
                        focusedField: $focusedField,
                        minimumHeight: 56,
                        focusedMinimumHeight: 88
                    )
                    .onChange(of: title) { _, next in
                        let normalized = next.replacingOccurrences(of: "\n", with: " ")
                        if normalized != next || normalized.count > titleMax {
                            title = String(normalized.prefix(titleMax))
                        }
                    }
                    .accessibilityIdentifier("buddy-title")
                }
                .listRowInsets(EdgeInsets(top: 12, leading: 16, bottom: 12, trailing: 16))

                VStack(alignment: .leading, spacing: 6) {
                    HStack {
                        Text("Details")
                            .font(.caption.weight(.medium))
                            .foregroundStyle(SideSeatTheme.textSecondaryStrong)
                        Spacer()
                        Text("\(bodyText.count)/\(bodyMax)")
                            .font(SideSeatTheme.Text.monoDigitCaption)
                            .foregroundStyle(charCountColor(bodyText.count, limit: bodyMax))
                    }
                    PlaceholderTextEditor(
                        text: $bodyText,
                        placeholder: "Describe your plan and add #tags, for example #study or #coffee.",
                        accessibilityLabel: "Details",
                        focusValue: BuddyField.body,
                        focusedField: $focusedField
                    )
                    .frame(minHeight: 110)
                    .onChange(of: bodyText) { _, next in
                        if next.count > bodyMax {
                            bodyText = String(next.prefix(bodyMax))
                        }
                    }
                    .accessibilityIdentifier("buddy-body")

                    if !normalizedTags.isEmpty {
                        BuddyDetectedTagChips(tags: normalizedTags)
                            .transition(.opacity.combined(with: .move(edge: .top)))
                    }
                }
                .listRowInsets(EdgeInsets(top: 12, leading: 16, bottom: 12, trailing: 16))

                HStack(spacing: SideSeatTheme.spaceMD) {
                    PhotosPicker(
                        selection: $selectedPhotos,
                        maxSelectionCount: max(0, 3 - totalImageCount),
                        matching: .images
                    ) {
                        HStack(spacing: SideSeatTheme.spaceSM) {
                            Image(systemName: "photo.badge.plus")
                                .foregroundStyle(SideSeatTheme.accent)
                            Text("Add photos")
                                .foregroundStyle(SideSeatTheme.textPrimary)
                                .accessibilityIdentifier("buddy-add-photos-label")
                        }
                        .font(.subheadline.weight(.semibold))
                        .frame(minHeight: 44)
                        .contentShape(Rectangle())
                    }
                    .frame(minHeight: 44)
                    .disabled(totalImageCount >= 3 || isPreparingImages || store.isSaving)
                    .accessibilityIdentifier("buddy-add-photos")

                    Spacer()
                    Text("\(totalImageCount)/3")
                        .font(SideSeatTheme.Text.monoDigitCaption)
                        .foregroundStyle(SideSeatTheme.textSecondaryStrong)
                        .accessibilityIdentifier("buddy-photo-count")
                }

                if totalImageCount > 0 {
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 12) {
                            ForEach(existingImageURLs, id: \.self) { url in
                                BuddyExistingImageThumbnail(url: url) {
                                    withAnimation(.easeOut(duration: 0.18)) {
                                        existingImageURLs.removeAll { $0 == url }
                                    }
                                }
                            }
                            ForEach(imageDrafts) { draft in
                                BuddyImageDraftThumbnail(draft: draft) {
                                    withAnimation(.easeOut(duration: 0.18)) {
                                        imageDrafts.removeAll { $0.id == draft.id }
                                    }
                                }
                            }
                        }
                        .padding(.vertical, 4)
                    }
                    .accessibilityIdentifier("buddy-photo-preview-list")
                }
                if isPreparingImages {
                    SSLoadingState("Preparing photos")
                }
            }

            Section {
                Toggle("Set time and place", isOn: $hasSchedule)
                    .accessibilityIdentifier("plan-has-schedule")
                if hasSchedule {
                    DatePicker("Starts", selection: $startsAt, in: earliestStart...)
                        .accessibilityIdentifier("plan-starts-at")
                    DatePicker("Ends", selection: $endsAt, in: startsAt...)
                        .accessibilityIdentifier("plan-ends-at")
                    TextField("Location (optional)", text: $location)
                        .accessibilityIdentifier("plan-location")
                    Toggle("Limit participants", isOn: $hasCapacityLimit)
                    if hasCapacityLimit {
                        Stepper("Up to \(capacity) people", value: $capacity, in: 2...500)
                            .accessibilityIdentifier("plan-capacity")
                    }
                }
            } header: {
                Text("Plan details")
                    .font(.headline)
                    .foregroundStyle(SideSeatTheme.textSecondaryStrong)
                    .textCase(nil)
                    .accessibilityIdentifier("buddy-section-plan-details")
            } footer: {
                Text("Leave this off when you are still looking for people before choosing a time.")
                    .font(.footnote)
                    .foregroundStyle(SideSeatTheme.textSecondaryStrong)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityIdentifier("buddy-footer-plan-details")
            }

            Section {
                BuddyVisibilitySelector(
                    selection: $visibilityPreset,
                    presets: visibilityPresets
                )
                if needsCourseSelection {
                    if courseStore.isLoading {
                        SSLoadingState("Loading courses")
                    } else if enrolledCourses.isEmpty {
                        Text("Join at least one course to use coursemate visibility.")
                            .font(.footnote)
                            .foregroundStyle(SideSeatTheme.textSecondaryStrong)
                    } else {
                        HStack {
                            Text("\(selectedCourseIds.count)/\(enrolledCourses.count) selected")
                                .font(.caption)
                                .foregroundStyle(SideSeatTheme.textSecondaryStrong)
                            Spacer()
                            Button(selectedCourseIds.count == enrolledCourses.count ? "Deselect all" : "Select all") {
                                if selectedCourseIds.count == enrolledCourses.count {
                                    selectedCourseIds.removeAll()
                                } else {
                                    selectedCourseIds = Set(enrolledCourses.map(\.id))
                                }
                            }
                            .font(.caption.weight(.semibold))
                        }
                        ScrollView(.horizontal, showsIndicators: false) {
                            HStack(spacing: 8) {
                                ForEach(enrolledCourses) { course in
                                    CourseVisibilityChip(
                                        course: course,
                                        isSelected: selectedCourseIds.contains(course.id)
                                    ) {
                                        if selectedCourseIds.contains(course.id) {
                                            selectedCourseIds.remove(course.id)
                                        } else {
                                            selectedCourseIds.insert(course.id)
                                        }
                                    }
                                }
                            }
                            .padding(.vertical, 2)
                        }
                    }
                }
            } header: {
                Text("Who can see this")
                    .font(.headline)
                    .foregroundStyle(SideSeatTheme.textSecondaryStrong)
                    .textCase(nil)
                    .accessibilityIdentifier("buddy-section-visibility")
            }

            Section {
                FlowExpiryChips(selection: $expiryPreset)
            } header: {
                Text("Expires")
                    .font(.headline)
                    .foregroundStyle(SideSeatTheme.textSecondaryStrong)
                    .textCase(nil)
                    .accessibilityIdentifier("buddy-section-expiry")
            } footer: {
                Text(expiryPreset.hint)
                    .font(.footnote)
                    .foregroundStyle(SideSeatTheme.textSecondaryStrong)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityIdentifier("buddy-footer-expiry")
            }

            if let localIssue {
                Section { Text(localIssue).foregroundStyle(SideSeatTheme.danger) }
            }
            if let issue = store.issue {
                Section { Text(issue).foregroundStyle(SideSeatTheme.danger) }
            }
        }
        .scrollDismissesKeyboard(.interactively)
        .accessibilityIdentifier(
            isEditing ? "buddy-edit-view" : (isReposting ? "buddy-repost-view" : "buddy-create-view")
        )
    }

    private var submitBar: some View {
        SSPrimaryButton(
            title: store.isSaving
                ? String(localized: isEditing ? "Saving…" : (isReposting ? "Reposting…" : "Posting…"))
                : String(localized: isEditing ? "Save changes" : (isReposting ? "Repost" : "Post")),
            isLoading: store.isSaving,
            fill: .product,
            chrome: .rounded,
            accessibilityID: "buddy-submit"
        ) {
            Task { await submit() }
        }
        .disabled(!canSubmit)
        .padding(.horizontal, SideSeatTheme.screenHorizontal)
        .padding(.vertical, SideSeatTheme.spaceMD)
        .background(.bar)
    }

    private func submit() async {
        guard canSubmit else { return }
        focusedField = nil
        let courseIDs = needsCourseSelection
            ? Array(selectedCourseIds)
            : []
        let ok: Bool
        if let editingPost {
            ok = await store.updateBuddy(
                post: editingPost,
                title: title,
                body: bodyText,
                tags: normalizedTags,
                visibility: visibilityPreset.rawValue,
                courseIds: courseIDs,
                startsAt: hasSchedule ? startsAt : nil,
                endsAt: hasSchedule ? endsAt : nil,
                location: hasSchedule ? location : nil,
                capacity: hasSchedule && hasCapacityLimit ? capacity : nil,
                expiresAt: selectedExpiryDate,
                existingImageURLs: existingImageURLs,
                images: imageDrafts,
                using: session
            )
        } else {
            ok = await store.createBuddy(
                category: createCategory,
                title: title,
                body: bodyText,
                tags: normalizedTags,
                visibility: visibilityPreset.rawValue,
                replyPreference: "DIRECT_MESSAGE",
                courseIds: courseIDs,
                startsAt: hasSchedule ? startsAt : nil,
                endsAt: hasSchedule ? endsAt : nil,
                location: hasSchedule ? location : nil,
                capacity: hasSchedule && hasCapacityLimit ? capacity : nil,
                expiresAt: selectedExpiryDate,
                existingImageURLs: existingImageURLs,
                images: imageDrafts,
                using: session
            )
        }
        if ok {
            guard let savedPostID = store.savedPostID else {
                submitIssue = String(localized: "The saved plan could not be opened. Please refresh Discover.")
                return
            }
            didSucceed = true
            await onCreated(savedPostID)
        } else {
            submitIssue = store.issue ?? String(
                localized: isEditing
                    ? "The plan could not be updated. Please try again."
                    : (isReposting
                        ? "The plan could not be reposted. Please try again."
                        : "The plan could not be created. Please try again.")
            )
        }
    }

    private func charCountColor(_ count: Int, limit: Int) -> Color {
        if count > limit { return SideSeatTheme.statusDangerText }
        let remaining = limit - count
        if remaining <= Swift.max(1, Int(ceil(Double(limit) * 0.12))) {
            return SideSeatTheme.statusWarningText
        }
        return SideSeatTheme.textSecondaryStrong
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
                      let draft = await DiscoverImagePreprocessor.makeDraftAsync(from: data)
                else {
                    localIssue = "That photo could not be read."
                    continue
                }
                nextDrafts.append(draft)
            } catch {
                localIssue = "That photo could not be read."
            }
        }
        withAnimation(.easeOut(duration: 0.2)) {
            imageDrafts = nextDrafts
        }
    }
}

private struct BuddyExistingImageThumbnail: View {
    let url: String
    let onRemove: () -> Void

    var body: some View {
        ZStack(alignment: .topTrailing) {
            AsyncImage(url: URL(string: url)) { phase in
                if let image = phase.image {
                    image.resizable().scaledToFill()
                } else if phase.error != nil {
                    Image(systemName: "photo")
                        .font(.title2)
                        .foregroundStyle(.secondary)
                } else {
                    ProgressView()
                }
            }
            .frame(width: 76, height: 76)
            .background(SideSeatTheme.fillTertiary)
            .clipShape(RoundedRectangle(cornerRadius: SideSeatTheme.mediaRadius, style: .continuous))

            Button(action: onRemove) {
                Image(systemName: "xmark.circle.fill")
                    .font(.title3)
                    .symbolRenderingMode(.palette)
                    .foregroundStyle(.white, .black.opacity(0.45))
            }
            .buttonStyle(.plain)
            .offset(x: 4, y: -4)
            .accessibilityLabel("Remove photo")
        }
    }
}

private struct BuddyDetectedTagChips: View {
    let tags: [String]

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: SideSeatTheme.spaceSM) {
                ForEach(tags, id: \.self) { tag in
                    Text("#\(tag)")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(SideSeatTheme.textPrimary)
                        .padding(.horizontal, 9)
                        .padding(.vertical, 5)
                        .background(SideSeatTheme.accent.opacity(0.10), in: Capsule())
                }
            }
        }
        .accessibilityIdentifier("buddy-detected-tags")
    }
}

private struct BuddyVisibilitySelector: View {
    @Binding var selection: BuddyVisibilityPreset
    let presets: [BuddyVisibilityPreset]

    var body: some View {
        VStack(spacing: 0) {
            ForEach(Array(presets.enumerated()), id: \.element.id) { index, preset in
                Button {
                    withAnimation(.easeOut(duration: 0.15)) {
                        selection = preset
                    }
                } label: {
                    HStack(spacing: SideSeatTheme.spaceMD) {
                        Image(systemName: preset.systemImage)
                            .font(.body.weight(.semibold))
                            .foregroundStyle(selection == preset ? SideSeatTheme.accent : SideSeatTheme.textSecondary)
                            .frame(width: 28, height: 28)
                            .background(
                                selection == preset
                                    ? SideSeatTheme.accent.opacity(0.10)
                                    : SideSeatTheme.fillTertiary,
                                in: RoundedRectangle(cornerRadius: 8, style: .continuous)
                            )

                        VStack(alignment: .leading, spacing: 2) {
                            Text(preset.title)
                                .font(.subheadline.weight(.semibold))
                                .foregroundStyle(SideSeatTheme.textPrimary)
                            Text(preset.hint)
                                .font(.caption)
                                .foregroundStyle(SideSeatTheme.textSecondaryStrong)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                        Spacer(minLength: SideSeatTheme.spaceSM)
                        Image(systemName: selection == preset ? "checkmark.circle.fill" : "circle")
                            .foregroundStyle(
                                selection == preset ? SideSeatTheme.accent : SideSeatTheme.textSecondary.opacity(0.45)
                            )
                    }
                    .contentShape(Rectangle())
                    .padding(.vertical, 10)
                }
                .buttonStyle(.plain)
                .accessibilityAddTraits(selection == preset ? .isSelected : [])

                if index < presets.count - 1 {
                    Divider()
                        .padding(.leading, 40)
                }
            }
        }
    }
}

private struct FlowExpiryChips: View {
    @Binding var selection: BuddyExpiryPreset

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 8) {
                ForEach(BuddyExpiryPreset.allCases) { preset in
                    Button {
                        withAnimation(.easeOut(duration: 0.15)) {
                            selection = preset
                        }
                    } label: {
                        Text(preset.title)
                            .font(.subheadline.weight(.semibold))
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 10)
                            .background(
                                RoundedRectangle(cornerRadius: SideSeatTheme.controlRadius, style: .continuous)
                                    .fill(
                                        selection == preset
                                            ? SideSeatTheme.accent.opacity(0.14)
                                            : SideSeatTheme.fillTertiary
                                    )
                            )
                            .overlay(
                                RoundedRectangle(cornerRadius: SideSeatTheme.controlRadius, style: .continuous)
                                    .strokeBorder(
                                        selection == preset
                                            ? SideSeatTheme.accent.opacity(0.45)
                                            : Color.clear,
                                        lineWidth: 1
                                    )
                            )
                            .foregroundStyle(
                                SideSeatTheme.textPrimary
                            )
                    }
                    .buttonStyle(.plain)
                    .accessibilityAddTraits(selection == preset ? .isSelected : [])
                }
            }
        }
        .listRowInsets(EdgeInsets(top: 10, leading: 16, bottom: 10, trailing: 16))
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
            .frame(width: 76, height: 76)
            .clipShape(RoundedRectangle(cornerRadius: SideSeatTheme.mediaRadius, style: .continuous))

            Button(action: onRemove) {
                Image(systemName: "xmark.circle.fill")
                    .font(.title3)
                    .symbolRenderingMode(.palette)
                    .foregroundStyle(.white, .black.opacity(0.45))
            }
            .buttonStyle(.plain)
            .offset(x: 4, y: -4)
            .accessibilityLabel("Remove photo")
        }
    }
}

private struct CourseVisibilityChip: View {
    let course: NativeCourseSummary
    let isSelected: Bool
    let action: () -> Void

    private var title: String {
        if let code = course.code, !code.isEmpty {
            return "\(code) · \(course.name)"
        }
        return course.name
    }

    var body: some View {
        Button(action: action) {
            Text(title)
                .font(.caption.weight(.semibold))
                .lineLimit(1)
                .foregroundStyle(isSelected ? SideSeatTheme.textPrimary : SideSeatTheme.textSecondary)
                .padding(.horizontal, 10)
                .padding(.vertical, 6)
                .background(
                    isSelected ? SideSeatTheme.accent.opacity(0.12) : SideSeatTheme.fillTertiary,
                    in: Capsule()
                )
                .overlay {
                    Capsule()
                        .stroke(isSelected ? SideSeatTheme.accent.opacity(0.3) : .clear, lineWidth: 1)
                }
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier("buddy-course-\(course.id)")
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
    @State private var didSucceed = false
    @FocusState private var focusedField: ActivityField?

    private enum ActivityField { case title, description, location }

    let onCreated: () async -> Void

    private var canSubmit: Bool {
        !title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty &&
            !descriptionText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty &&
            !location.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty &&
            !store.isSaving
    }

    var body: some View {
        VStack(spacing: 0) {
            activityForm
            submitBar
        }
        .navigationTitle("New activity")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .cancellationAction) {
                Button("Cancel") { dismiss() }
                    .tint(SideSeatTheme.textPrimary)
                    .disabled(store.isSaving)
                    .accessibilityIdentifier("activity-cancel")
            }
            if focusedField != nil {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { focusedField = nil }
                        .accessibilityIdentifier("activity-keyboard-done")
                }
            }
        }
        .interactiveDismissDisabled(store.isSaving)
        .sensoryFeedback(.success, trigger: didSucceed)
        .task { focusedField = .title }
    }

    private var activityForm: some View {
        Form {
            Section {
                TextField(
                    "Title",
                    text: $title,
                    prompt: Text("e.g. Sunday coffee study session")
                )
                .focused($focusedField, equals: .title)
                .accessibilityIdentifier("activity-title")

                PlaceholderTextEditor(
                    text: $descriptionText,
                    placeholder: "What to bring, who it's for, meetup spot…",
                    accessibilityLabel: "Description",
                    focusValue: ActivityField.description,
                    focusedField: $focusedField
                )
                .frame(minHeight: 100)
                .accessibilityIdentifier("activity-description")
            } header: {
                Text("Activity")
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
                .focused($focusedField, equals: .location)
                .accessibilityIdentifier("activity-location")
            }

            Section {
                Toggle("Unlimited capacity", isOn: $unlimitedCapacity)
                    .tint(SideSeatTheme.accent)
                if !unlimitedCapacity {
                    Stepper("Capacity: \(capacity)", value: $capacity, in: 2...50)
                        .transition(.opacity.combined(with: .move(edge: .top)))
                }
            } header: {
                Text("Capacity")
            }

            if let issue = store.issue {
                Section { Text(issue).foregroundStyle(SideSeatTheme.danger) }
            }
        }
        .animation(.easeOut(duration: 0.2), value: unlimitedCapacity)
        .scrollDismissesKeyboard(.interactively)
        .accessibilityIdentifier("activity-create-view")
    }

    private var submitBar: some View {
        SSPrimaryButton(
            title: store.isSaving ? "Creating…" : "Create",
            isLoading: store.isSaving,
            fill: .product,
            chrome: .rounded,
            accessibilityID: "activity-submit"
        ) {
            Task { await submit() }
        }
        .disabled(!canSubmit)
        .padding(.horizontal, SideSeatTheme.screenHorizontal)
        .padding(.vertical, SideSeatTheme.spaceMD)
        .background(.bar)
    }

    private func submit() async {
        guard canSubmit else { return }
        focusedField = nil
        let ok = await store.createActivity(
            title: title,
            description: descriptionText,
            startAt: startAt,
            location: location,
            unlimitedCapacity: unlimitedCapacity,
            capacity: capacity,
            using: session
        )
        if ok {
            didSucceed = true
            await onCreated()
        }
    }
}

private struct PlaceholderTextEditor<FocusValue: Hashable>: View {
    @Binding var text: String
    let placeholder: LocalizedStringKey
    let accessibilityLabel: LocalizedStringKey
    var focusValue: FocusValue
    var focusedField: FocusState<FocusValue?>.Binding
    var minimumHeight: CGFloat = 100
    var focusedMinimumHeight: CGFloat = 130

    var body: some View {
        ZStack(alignment: .topLeading) {
            if text.isEmpty {
                Text(placeholder)
                    .foregroundStyle(SideSeatTheme.placeholderText)
                    .padding(.top, 8)
                    .padding(.leading, 5)
                    .allowsHitTesting(false)
            }
            TextEditor(text: $text)
                .font(.body)
                .accessibilityLabel(Text(accessibilityLabel))
                .focused(focusedField, equals: focusValue)
                .scrollContentBackground(.hidden)
                .frame(
                    minHeight: focusedField.wrappedValue == focusValue
                        ? focusedMinimumHeight
                        : minimumHeight
                )
                .animation(.easeOut(duration: 0.2), value: focusedField.wrappedValue == focusValue)
        }
    }
}
