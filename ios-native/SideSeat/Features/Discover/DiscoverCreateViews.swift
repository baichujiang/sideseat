import PhotosUI
import SwiftUI
import UIKit

private enum BuddyExpiryPreset: String, CaseIterable, Identifiable {
    case threeDays
    case oneWeek
    case oneMonth
    case never

    var id: String { rawValue }

    var title: String {
        switch self {
        case .threeDays: AppLocalization.string( "3d")
        case .oneWeek: AppLocalization.string( "1w")
        case .oneMonth: AppLocalization.string( "1m")
        case .never: AppLocalization.string( "Never")
        }
    }

    var hint: String {
        switch self {
        case .threeDays: AppLocalization.string( "Visible for about 3 days.")
        case .oneWeek: AppLocalization.string( "Visible for about 1 week.")
        case .oneMonth: AppLocalization.string( "Visible for about 1 month.")
        case .never: AppLocalization.string( "Stays visible until you remove it.")
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

    var title: String {
        switch self {
        case .everyone: AppLocalization.string( "Everyone")
        case .verifiedStudents: AppLocalization.string( "Verified students")
        case .sameSchool: AppLocalization.string( "Same school")
        case .coursemates: AppLocalization.string( "Coursemates")
        }
    }

    var hint: String {
        switch self {
        case .everyone: AppLocalization.string( "Anyone in your city can discover this buddy post.")
        case .verifiedStudents: AppLocalization.string( "Only users with a verified student identity.")
        case .sameSchool: AppLocalization.string( "Only students from your school.")
        case .coursemates: AppLocalization.string( "Only students in the courses you select.")
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

private enum BuddyComposerEditor: String, Identifiable {
    case time
    case location
    case people
    case courses
    case settings

    var id: String { rawValue }

    var title: String {
        switch self {
        case .time: AppLocalization.string( "Time")
        case .location: AppLocalization.string( "Location")
        case .people: AppLocalization.string( "People")
        case .courses: AppLocalization.string( "Courses")
        case .settings: AppLocalization.string( "Post settings")
        }
    }
}

private extension Date {
    var endOfDay: Date {
        Calendar.current.date(bySettingHour: 23, minute: 59, second: 59, of: self) ?? self
    }
}

enum DiscoverBuddyComposerMode: Equatable, Sendable {
    case buddyPost
    case courseAction
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
    @State private var presentedEditor: BuddyComposerEditor?
    @State private var showDiscardConfirmation = false
    @State private var showCloseConfirmation = false
    @State private var isClosing = false
    @State private var closeIssue: String?
    @FocusState private var focusedField: BuddyField?

    private enum BuddyField { case title, body }

    private let titleMax = 120
    private let bodyMax = 280

    private let editingPost: NativeDiscoverBuddyPost?
    private let repostingPost: NativeDiscoverBuddyPost?
    private let mode: DiscoverBuddyComposerMode
    private let originalExpiryDate: Date?
    private let initialExpiryPreset: BuddyExpiryPreset
    private let onClose: (() async -> Bool)?
    let onCreated: (String) async -> Void

    init(
        mode: DiscoverBuddyComposerMode = .buddyPost,
        editingPost: NativeDiscoverBuddyPost? = nil,
        repostingPost: NativeDiscoverBuddyPost? = nil,
        onClose: (() async -> Bool)? = nil,
        onCreated: @escaping (String) async -> Void
    ) {
        precondition(editingPost == nil || repostingPost == nil)
        self.mode = mode
        self.editingPost = editingPost
        self.repostingPost = repostingPost
        self.onClose = onClose
        self.onCreated = onCreated

        let sourcePost = editingPost ?? repostingPost
        let sourceIsCourseAction = sourcePost.map {
            $0.category.uppercased() == "SHARED_COURSES"
                || $0.visibility.uppercased() == "COURSEMATES_ONLY"
                || !$0.linkedCourses.isEmpty
        } ?? false
        let now = Date()
        let defaultStart = Date().addingTimeInterval(60 * 60)
        #if DEBUG
        let isDemoDraft = sourcePost == nil && ProcessInfo.processInfo.arguments.contains("--ui-testing-buddy-composer-demo")
        #else
        let isDemoDraft = false
        #endif
        let demoStart = Calendar.current.nextDate(
            after: now,
            matching: DateComponents(hour: 14, weekday: 7),
            matchingPolicy: .nextTime
        ) ?? defaultStart
        let demoEnd = demoStart.addingTimeInterval(4 * 60 * 60)
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

        _title = State(
            initialValue: isDemoDraft
                ? AppLocalization.string( "Saturday library study, then coffee")
                : sourcePost?.title ?? ""
        )
        _bodyText = State(
            initialValue: isDemoDraft
                ? AppLocalization.string( "Reviewing algorithms at the TUM main library. Looking for 1–2 people who enjoy focused study, with a coffee break after. #study #exams #coffee")
                : sourcePost?.body ?? ""
        )
        _visibilityPreset = State(
            initialValue: isDemoDraft
                ? .verifiedStudents
                : sourcePost.flatMap { BuddyVisibilityPreset(rawValue: $0.visibility) }
                    ?? (mode == .courseAction || sourceIsCourseAction ? .coursemates : .everyone)
        )
        _selectedCourseIds = State(initialValue: Set(sourcePost?.linkedCourses.map(\.id) ?? []))
        _hasSchedule = State(initialValue: isDemoDraft || (canReuseSchedule && sourceStart != nil && sourceEnd != nil))
        _startsAt = State(initialValue: isDemoDraft ? demoStart : start)
        _endsAt = State(initialValue: isDemoDraft ? demoEnd : end)
        _location = State(initialValue: isDemoDraft ? AppLocalization.string( "TUM Main Library") : sourcePost?.location ?? "")
        _hasCapacityLimit = State(initialValue: isDemoDraft || sourcePost?.capacity != nil)
        _capacity = State(initialValue: sourcePost?.capacity ?? 4)
        _expiryPreset = State(initialValue: expiryPreset)
        _imageDrafts = State(initialValue: isDemoDraft ? Self.demoImageDrafts() : [])
        _existingImageURLs = State(initialValue: sourcePost?.imageUrls ?? [])
    }

    private static func demoImageDrafts() -> [NativeDiscoverBuddyImageDraft] {
        #if DEBUG
        guard let image = UIImage(named: "DiscoverStudyFixture1"),
              let data = image.jpegData(compressionQuality: 0.86)
        else { return [] }

        return [
            NativeDiscoverBuddyImageDraft(
                id: UUID(),
                data: data,
                mimeType: "image/jpeg",
                fileName: "buddy-composer-demo.jpg"
            )
        ]
        #else
        return []
        #endif
    }

    private var trimmedTitle: String { title.trimmingCharacters(in: .whitespacesAndNewlines) }
    private var enrolledCourses: [NativeCourseSummary] { courseStore.payload?.courses ?? [] }
    private var visibilityPresets: [BuddyVisibilityPreset] {
        if isCourseActionFlow {
            return [.coursemates]
        }
        return [.everyone, .verifiedStudents, .sameSchool]
    }
    private var normalizedTags: [String] {
        BuddyHashtagParser.tags(in: "\(title)\n\(bodyText)")
    }
    private var isEditing: Bool { editingPost != nil }
    private var isReposting: Bool { repostingPost != nil }
    private var sourcePost: NativeDiscoverBuddyPost? { editingPost ?? repostingPost }
    private var isCourseActionFlow: Bool {
        mode == .courseAction
            || sourcePost?.category.uppercased() == "SHARED_COURSES"
            || sourcePost?.visibility.uppercased() == "COURSEMATES_ONLY"
            || !(sourcePost?.linkedCourses.isEmpty ?? true)
    }
    private var needsCourseSelection: Bool { isCourseActionFlow }
    private var createCategory: String {
        isCourseActionFlow ? "SHARED_COURSES" : "OTHER"
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
            !store.isSaving &&
            !isClosing
    }

    private var hasDraftContent: Bool {
        !title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ||
            !bodyText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ||
            totalImageCount > 0 ||
            hasSchedule ||
            !location.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ||
            hasCapacityLimit
    }

    private var selectedCourseNames: [String] {
        enrolledCourses
            .filter { selectedCourseIds.contains($0.id) }
            .map { course in
                if let code = course.code, !code.isEmpty { return code }
                return course.name
            }
    }

    private var scheduleSummary: String {
        let day = startsAt.formatted(.dateTime.weekday(.abbreviated).month(.abbreviated).day())
        let start = startsAt.formatted(date: .omitted, time: .shortened)
        let end = endsAt.formatted(date: .omitted, time: .shortened)
        if Calendar.current.isDate(startsAt, inSameDayAs: endsAt) {
            return "\(day), \(start)\u{2013}\(end)"
        }
        return "\(day), \(start)"
    }

    var body: some View {
        planForm
        .navigationTitle(composerTitle)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .cancellationAction) {
                Button("Cancel") {
                    focusedField = nil
                    if hasDraftContent {
                        showDiscardConfirmation = true
                    } else {
                        dismiss()
                    }
                }
                    .tint(SideSeatTheme.textPrimary)
                    .disabled(store.isSaving || isClosing)
                    .accessibilityIdentifier("buddy-cancel")
            }

            ToolbarItem(placement: .confirmationAction) {
                Button {
                    Task { await submit() }
                } label: {
                    if store.isSaving {
                        ProgressView()
                            .controlSize(.small)
                    } else {
                        Text(isEditing ? "Save" : (isReposting ? "Repost" : "Post"))
                    }
                }
                .disabled(!canSubmit)
                .ssConfirmationActionStyle()
                .accessibilityIdentifier("buddy-submit")
            }

            ToolbarItemGroup(placement: .keyboard) {
                Spacer()
                Button("Done") { focusedField = nil }
                    .accessibilityIdentifier("buddy-keyboard-done")
            }
        }
        .interactiveDismissDisabled(store.isSaving || isClosing)
        .sensoryFeedback(.success, trigger: didSucceed)
        .ssActionPrompt(
            isPresented: Binding(
                get: { submitIssue != nil },
                set: { isPresented in
                    if !isPresented { submitIssue = nil }
                }
            ),
            title: isEditing
                ? AppLocalization.string("Couldn't save changes")
                : (isReposting
                    ? AppLocalization.string("Couldn't repost buddy post")
                    : AppLocalization.string("Couldn't publish buddy post")),
            message: submitIssue ?? AppLocalization.string("Please try again."),
            systemImage: "exclamationmark.triangle.fill",
            tint: SideSeatTheme.danger,
            dismissOnTapOutside: true,
            onDismiss: { submitIssue = nil },
            accessibilityIdentifier: "buddy-submit-error-prompt"
        ) {
            [
                SSActionPromptAction(
                    id: "buddy-submit-error-ok",
                    title: AppLocalization.string("OK"),
                    role: .cancel,
                    perform: { submitIssue = nil }
                ),
            ]
        }
        .ssActionPrompt(
            isPresented: $showDiscardConfirmation,
            title: AppLocalization.string("Discard your changes?"),
            message: AppLocalization.string("Your changes will not be saved."),
            systemImage: "arrow.uturn.backward.circle.fill",
            tint: SideSeatTheme.warning,
            dismissOnTapOutside: true,
            onDismiss: { showDiscardConfirmation = false },
            accessibilityIdentifier: "buddy-discard-prompt"
        ) {
            [
                SSActionPromptAction(
                    id: "buddy-discard-cancel",
                    title: AppLocalization.string("Keep editing"),
                    role: .cancel,
                    perform: {}
                ),
                SSActionPromptAction(
                    id: "buddy-discard-confirm",
                    title: AppLocalization.string("Discard changes"),
                    systemImage: "trash",
                    role: .destructive,
                    perform: { dismiss() }
                ),
            ]
        }
        .ssActionPrompt(
            isPresented: $showCloseConfirmation,
            title: AppLocalization.string("Close this buddy post?"),
            message: AppLocalization.string("This buddy post will move to Past and stop accepting responses."),
            systemImage: "lock.fill",
            tint: SideSeatTheme.danger,
            dismissOnTapOutside: true,
            onDismiss: { showCloseConfirmation = false },
            accessibilityIdentifier: "buddy-close-prompt"
        ) {
            [
                SSActionPromptAction(
                    id: "buddy-close-cancel",
                    title: AppLocalization.string("Cancel"),
                    role: .cancel,
                    perform: {}
                ),
                SSActionPromptAction(
                    id: "buddy-close-confirm",
                    title: AppLocalization.string("Close buddy post"),
                    systemImage: "lock",
                    role: .destructive,
                    perform: { closeCurrentPost() }
                ),
            ]
        }
        .ssActionPrompt(
            isPresented: Binding(
                get: { closeIssue != nil },
                set: { isPresented in
                    if !isPresented { closeIssue = nil }
                }
            ),
            title: AppLocalization.string("Couldn't close post"),
            message: closeIssue ?? AppLocalization.string("Please try again."),
            systemImage: "exclamationmark.triangle.fill",
            tint: SideSeatTheme.danger,
            dismissOnTapOutside: true,
            onDismiss: { closeIssue = nil },
            accessibilityIdentifier: "buddy-close-error-prompt"
        ) {
            [
                SSActionPromptAction(
                    id: "buddy-close-error-ok",
                    title: AppLocalization.string("OK"),
                    role: .cancel,
                    perform: { closeIssue = nil }
                ),
            ]
        }
        .sheet(item: $presentedEditor) { editor in
            buddyEditorSheet(editor)
                .presentationDetents(editor == .settings || editor == .courses ? [.medium, .large] : [.medium])
                .presentationDragIndicator(.visible)
                .presentationCornerRadius(SideSeatTheme.cardRadius)
        }
        .onChange(of: selectedPhotos) { _, items in
            Task { await prepareSelectedPhotos(items) }
        }
        .task {
            await courseStore.load(using: session, scope: .enrolled, school: nil, query: "")
            if isReposting {
                selectedCourseIds.formIntersection(Set(enrolledCourses.map(\.id)))
            } else if selectedCourseIds.isEmpty, editingPost == nil, isCourseActionFlow {
                if enrolledCourses.count == 1, let course = enrolledCourses.first {
                    selectedCourseIds = [course.id]
                }
            }
        }
    }

    private var composerTitle: LocalizedStringKey {
        if isEditing { return "Edit buddy post" }
        if isReposting { return "Repost buddy post" }
        return mode == .courseAction ? "Start course action" : "Post to find buddies"
    }

    private var planForm: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 0) {
            if isReposting {
                VStack(alignment: .leading, spacing: SideSeatTheme.spaceSM) {
                    HStack(spacing: SideSeatTheme.spaceSM) {
                        Image(systemName: "arrow.clockwise.circle.fill")
                            .foregroundStyle(SideSeatTheme.HubTint.posts)
                        Text("Ready to repost")
                            .foregroundStyle(SideSeatTheme.textPrimary)
                    }
                        .font(.headline)
                    Text("Review who can see this buddy post and choose current courses before publishing.")
                        .font(.footnote)
                        .foregroundStyle(SideSeatTheme.textSecondaryStrong)
                }
                .padding(SideSeatTheme.spaceLG)
                .background(SideSeatTheme.fillSubtle, in: RoundedRectangle(cornerRadius: 8, style: .continuous))
                .padding(.horizontal, SideSeatTheme.screenHorizontal)
                .padding(.top, SideSeatTheme.spaceMD)
                .accessibilityIdentifier("buddy-repost-notice")
            }

            composerIdentity
                .padding(.horizontal, SideSeatTheme.screenHorizontal)
                .padding(.top, SideSeatTheme.spaceLG)

            VStack(alignment: .leading, spacing: SideSeatTheme.spaceMD) {
                VStack(alignment: .leading, spacing: 6) {
                    PlaceholderTextEditor(
                        text: $title,
                        placeholder: "What do you want to do?",
                        accessibilityLabel: "Title",
                        focusValue: BuddyField.title,
                        focusedField: $focusedField,
                        minimumHeight: 48,
                        focusedMinimumHeight: 62,
                        font: .title3.weight(.semibold)
                    )
                    .onChange(of: title) { _, next in
                        let normalized = next.replacingOccurrences(of: "\n", with: " ")
                        if normalized != next || normalized.count > titleMax {
                            title = String(normalized.prefix(titleMax))
                        }
                    }
                    .accessibilityIdentifier("buddy-title")

                    if focusedField == .title || title.count >= 96 {
                        characterCount(title.count, limit: titleMax)
                            .frame(maxWidth: .infinity, alignment: .trailing)
                    }
                }

                VStack(alignment: .leading, spacing: 6) {
                    PlaceholderTextEditor(
                        text: $bodyText,
                        placeholder: "Describe who you're looking for, what you want to do, and add #tags…",
                        accessibilityLabel: "Details",
                        focusValue: BuddyField.body,
                        focusedField: $focusedField,
                        minimumHeight: 150,
                        focusedMinimumHeight: 180
                    )
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

                    if focusedField == .body || bodyText.count >= 224 {
                        characterCount(bodyText.count, limit: bodyMax)
                            .frame(maxWidth: .infinity, alignment: .trailing)
                    }
                }

                photoPreview
            }
            .padding(.horizontal, SideSeatTheme.screenHorizontal)
            .padding(.top, SideSeatTheme.spaceMD)

            composerTools
                .padding(.top, SideSeatTheme.spaceLG)

            if hasSchedule || !location.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || hasCapacityLimit || needsCourseSelection {
                selectedDetailChips
                    .padding(.top, SideSeatTheme.spaceMD)
            }

            postSettingsRow
                .padding(.horizontal, SideSeatTheme.screenHorizontal)
                .padding(.top, SideSeatTheme.spaceLG)

            if isPreparingImages {
                HStack(spacing: SideSeatTheme.spaceSM) {
                    ProgressView()
                    Text("Preparing photos")
                }
                .font(.footnote)
                .foregroundStyle(SideSeatTheme.textSecondaryStrong)
                .padding(.horizontal, SideSeatTheme.screenHorizontal)
                .padding(.top, SideSeatTheme.spaceMD)
            }

            if let localIssue {
                composerIssue(localIssue)
            }
            if let issue = store.issue {
                composerIssue(issue)
            }

            if isEditing, onClose != nil {
                closePostSection
            }

            Color.clear
                .frame(height: SideSeatTheme.spaceXL)
            }
        }
        .background(SideSeatTheme.bg)
        .scrollDismissesKeyboard(.interactively)
        .accessibilityIdentifier(
            isEditing ? "buddy-edit-view" : (isReposting ? "buddy-repost-view" : "buddy-create-view")
        )
    }

    private var closePostSection: some View {
        VStack(alignment: .leading, spacing: 4) {
            Button(role: .destructive) {
                focusedField = nil
                showCloseConfirmation = true
            } label: {
                HStack(spacing: SideSeatTheme.spaceSM) {
                    Image(systemName: "lock")
                    Text("Close buddy post")
                    Spacer(minLength: 0)
                    if isClosing {
                        ProgressView()
                            .tint(SideSeatTheme.danger)
                    }
                }
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(SideSeatTheme.danger)
                .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
            }
            .buttonStyle(SSPressButtonStyle())
            .disabled(store.isSaving || isClosing)
            .accessibilityIdentifier("buddy-close-post")

            Text("This buddy post will move to Past and stop accepting responses.")
                .font(.caption)
                .foregroundStyle(SideSeatTheme.textSecondaryStrong)
        }
        .padding(.horizontal, SideSeatTheme.screenHorizontal)
        .padding(.top, SideSeatTheme.spaceXL)
    }

    private var composerIdentity: some View {
        HStack(alignment: .top, spacing: SideSeatTheme.spaceMD) {
            let user = session.currentUser
            InitialAvatar(
                name: user?.displayName ?? AppLocalization.string( "You"),
                url: user?.avatarUrl,
                size: 44
            )

            VStack(alignment: .leading, spacing: 6) {
                Text(user?.displayName ?? AppLocalization.string( "You"))
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(SideSeatTheme.textPrimary)
                    .lineLimit(1)

                if let user {
                    SchoolIdentityBadge(
                        school: user.school,
                        verifiedStudent: user.verifiedStudent,
                        status: user.studentVerificationStatus,
                        compact: true
                    )
                }

                Button {
                    focusedField = nil
                    presentedEditor = .settings
                } label: {
                    HStack(spacing: 5) {
                        Image(systemName: visibilityPreset.systemImage)
                        Text(visibilityPreset.title)
                            .lineLimit(1)
                        Image(systemName: "chevron.down")
                            .font(.caption2.weight(.bold))
                    }
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(SideSeatTheme.textPrimary)
                    .padding(.horizontal, 10)
                    .frame(minHeight: 34)
                    .background(SideSeatTheme.fillTertiary, in: Capsule())
                }
                .buttonStyle(SSPressButtonStyle())
                .accessibilityIdentifier("buddy-visibility-summary")
            }

            Spacer(minLength: 0)
        }
    }

    @ViewBuilder
    private var photoPreview: some View {
        if totalImageCount > 0 {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: SideSeatTheme.spaceMD) {
                    ForEach(Array(existingImageURLs.enumerated()), id: \.element) { index, url in
                        BuddyExistingImageThumbnail(url: url, isCover: index == 0) {
                            withAnimation(.easeOut(duration: 0.18)) {
                                existingImageURLs.removeAll { $0 == url }
                            }
                        }
                    }
                    ForEach(Array(imageDrafts.enumerated()), id: \.element.id) { index, draft in
                        BuddyImageDraftThumbnail(
                            draft: draft,
                            isCover: existingImageURLs.isEmpty && index == 0
                        ) {
                            withAnimation(.easeOut(duration: 0.18)) {
                                imageDrafts.removeAll { $0.id == draft.id }
                            }
                        }
                    }
                    if totalImageCount < 3 {
                        photoPickerTile
                    }
                }
                .padding(.vertical, 4)
            }
            .accessibilityIdentifier("buddy-photo-preview-list")
        }
    }

    private var photoPickerTile: some View {
        PhotosPicker(
            selection: $selectedPhotos,
            maxSelectionCount: max(0, 3 - totalImageCount),
            matching: .images
        ) {
            VStack(spacing: 6) {
                Image(systemName: "photo.badge.plus")
                    .font(.title3.weight(.medium))
                Text("Add")
                    .font(.caption.weight(.semibold))
                    .accessibilityIdentifier("buddy-add-photos-label")
            }
            .foregroundStyle(SideSeatTheme.textSecondaryStrong)
            .frame(width: 104, height: 104)
            .background(SideSeatTheme.fillTertiary, in: RoundedRectangle(cornerRadius: SideSeatTheme.mediaRadius, style: .continuous))
            .overlay {
                RoundedRectangle(cornerRadius: SideSeatTheme.mediaRadius, style: .continuous)
                    .strokeBorder(SideSeatTheme.separator.opacity(0.55), style: StrokeStyle(lineWidth: 1, dash: [5]))
            }
        }
        .disabled(totalImageCount >= 3 || isPreparingImages || store.isSaving)
        .accessibilityIdentifier("buddy-add-photos")
    }

    private var composerTools: some View {
        let hasSelectedPhotos = totalImageCount > 0

        return ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: SideSeatTheme.spaceSM) {
                PhotosPicker(
                    selection: $selectedPhotos,
                    maxSelectionCount: max(0, 3 - totalImageCount),
                    matching: .images
                ) {
                    BuddyComposerToolLabel(
                        title: AppLocalization.string( "Photos"),
                        systemImage: "photo",
                        isActive: hasSelectedPhotos
                    )
                }
                .disabled(totalImageCount >= 3 || isPreparingImages || store.isSaving)
                .accessibilityIdentifier("buddy-tool-photos")

                composerTool(
                    title: AppLocalization.string( "Time"),
                    systemImage: "calendar",
                    isActive: hasSchedule,
                    editor: .time
                )
                composerTool(
                    title: AppLocalization.string( "Location"),
                    systemImage: "mappin.and.ellipse",
                    isActive: !location.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
                    editor: .location
                )
                composerTool(
                    title: AppLocalization.string( "People"),
                    systemImage: "person.2",
                    isActive: hasCapacityLimit,
                    editor: .people
                )
                if needsCourseSelection {
                    composerTool(
                        title: AppLocalization.string("Course"),
                        systemImage: "book.closed",
                        isActive: !selectedCourseIds.isEmpty,
                        editor: .courses
                    )
                }
            }
            .padding(.horizontal, SideSeatTheme.screenHorizontal)
        }
        .accessibilityIdentifier("buddy-section-plan-details")
    }

    private func composerTool(
        title: String,
        systemImage: String,
        isActive: Bool,
        editor: BuddyComposerEditor
    ) -> some View {
        Button {
            focusedField = nil
            if editor == .time, !hasSchedule { hasSchedule = true }
            if editor == .people, !hasCapacityLimit { hasCapacityLimit = true }
            if editor == .courses { visibilityPreset = .coursemates }
            presentedEditor = editor
        } label: {
            BuddyComposerToolLabel(title: title, systemImage: systemImage, isActive: isActive)
        }
        .buttonStyle(SSPressButtonStyle())
        .accessibilityIdentifier("buddy-tool-\(editor.rawValue)")
    }

    private var selectedDetailChips: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: SideSeatTheme.spaceSM) {
                if hasSchedule {
                    detailChip(title: scheduleSummary, systemImage: "calendar", editor: .time)
                }
                let trimmedLocation = location.trimmingCharacters(in: .whitespacesAndNewlines)
                if !trimmedLocation.isEmpty {
                    detailChip(title: trimmedLocation, systemImage: "mappin", editor: .location)
                }
                if hasCapacityLimit {
                    detailChip(
                        title: AppLocalization.string( "Up to \(capacity) people"),
                        systemImage: "person.2",
                        editor: .people
                    )
                }
                if needsCourseSelection {
                    let summary = selectedCourseNames.isEmpty
                        ? AppLocalization.string( "Choose courses")
                        : selectedCourseNames.prefix(2).joined(separator: ", ")
                    detailChip(title: summary, systemImage: "book.closed", editor: .courses)
                }
            }
            .padding(.horizontal, SideSeatTheme.screenHorizontal)
        }
        .accessibilityIdentifier("buddy-selected-details")
    }

    private func detailChip(title: String, systemImage: String, editor: BuddyComposerEditor) -> some View {
        Button {
            focusedField = nil
            presentedEditor = editor
        } label: {
            Label(title, systemImage: systemImage)
                .font(.caption.weight(.medium))
                .foregroundStyle(SideSeatTheme.textPrimary)
                .lineLimit(1)
                .padding(.horizontal, 10)
                .frame(minHeight: 34)
                .background(SideSeatTheme.fillTertiary, in: Capsule())
        }
        .buttonStyle(SSPressButtonStyle())
    }

    private var postSettingsRow: some View {
        Button {
            focusedField = nil
            presentedEditor = .settings
        } label: {
            HStack(spacing: SideSeatTheme.spaceMD) {
                Image(systemName: "slider.horizontal.3")
                    .font(.body.weight(.medium))
                    .foregroundStyle(SideSeatTheme.textSecondaryStrong)
                    .frame(width: 28)

                VStack(alignment: .leading, spacing: 3) {
                    Text("Post settings")
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(SideSeatTheme.textPrimary)
                    Text("\(visibilityPreset.title) \u{00b7} \(expiryPreset.title)")
                        .font(.caption)
                        .foregroundStyle(SideSeatTheme.textSecondaryStrong)
                }

                Spacer()
                Image(systemName: "chevron.right")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.tertiary)
            }
            .padding(.horizontal, SideSeatTheme.spaceLG)
            .frame(minHeight: 62)
            .background(SideSeatTheme.fillSubtle, in: RoundedRectangle(cornerRadius: 8, style: .continuous))
        }
        .buttonStyle(SSPressButtonStyle())
        .accessibilityIdentifier("buddy-post-settings")
    }

    private func composerIssue(_ issue: String) -> some View {
        Label(issue, systemImage: "exclamationmark.circle.fill")
            .font(.footnote)
            .foregroundStyle(SideSeatTheme.statusDangerText)
            .fixedSize(horizontal: false, vertical: true)
            .padding(.horizontal, SideSeatTheme.screenHorizontal)
            .padding(.top, SideSeatTheme.spaceMD)
    }

    private func characterCount(_ count: Int, limit: Int) -> some View {
        Text("\(count)/\(limit)")
            .font(SideSeatTheme.Text.monoDigitCaption)
            .foregroundStyle(charCountColor(count, limit: limit))
    }

    @ViewBuilder
    private func buddyEditorSheet(_ editor: BuddyComposerEditor) -> some View {
        NavigationStack {
            Group {
                switch editor {
                case .time:
                    timeEditor
                case .location:
                    locationEditor
                case .people:
                    peopleEditor
                case .courses:
                    coursesEditor
                case .settings:
                    settingsEditor
                }
            }
            .navigationTitle(editor.title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { presentedEditor = nil }
                        .fontWeight(.semibold)
                        .accessibilityIdentifier("buddy-editor-done")
                }
            }
        }
    }

    private var timeEditor: some View {
        Form {
            Section {
                Toggle("Add a specific time", isOn: $hasSchedule)
                    .tint(SideSeatTheme.accentText)
                    .accessibilityIdentifier("plan-has-schedule")
                if hasSchedule {
                    DatePicker("Starts", selection: $startsAt, in: earliestStart...)
                        .accessibilityIdentifier("plan-starts-at")
                    DatePicker("Ends", selection: $endsAt, in: startsAt...)
                        .accessibilityIdentifier("plan-ends-at")
                }
            } footer: {
                Text("Leave this off if you want to decide the time together later.")
            }
        }
    }

    private var locationEditor: some View {
        Form {
            Section {
                TextField("Location (optional)", text: $location)
                    .textInputAutocapitalization(.words)
                    .accessibilityIdentifier("plan-location")
                if !location.isEmpty {
                    Button("Remove location", role: .destructive) { location = "" }
                }
            } footer: {
                Text("Add a campus, neighborhood, or meeting point. You can decide the exact spot in chat.")
            }
        }
    }

    private var peopleEditor: some View {
        Form {
            Section {
                Toggle("Limit participants", isOn: $hasCapacityLimit)
                    .tint(SideSeatTheme.accentText)
                if hasCapacityLimit {
                    Stepper("Up to \(capacity) people", value: $capacity, in: 2...500)
                        .accessibilityIdentifier("plan-capacity")
                }
            } footer: {
                Text("Leave this off when any number of people can reach out.")
            }
        }
    }

    private var coursesEditor: some View {
        Form {
            Section {
                if courseStore.isLoading {
                    SSLoadingState("Loading courses")
                } else if enrolledCourses.isEmpty {
                    Text("Join at least one course to find coursemates.")
                        .foregroundStyle(SideSeatTheme.textSecondaryStrong)
                } else {
                    ForEach(enrolledCourses) { course in
                        Button {
                            selectedCourseIds = [course.id]
                            visibilityPreset = .coursemates
                        } label: {
                            HStack {
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(course.name)
                                        .foregroundStyle(SideSeatTheme.textPrimary)
                                    if let code = course.code, !code.isEmpty {
                                        Text(code)
                                            .font(.caption)
                                            .foregroundStyle(SideSeatTheme.textSecondaryStrong)
                                    }
                                }
                                Spacer()
                                Image(systemName: selectedCourseIds.contains(course.id) ? "checkmark.circle.fill" : "circle")
                                    .foregroundStyle(selectedCourseIds.contains(course.id) ? SideSeatTheme.accentText : SideSeatTheme.textSecondary)
                            }
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(SSPressButtonStyle())
                        .accessibilityIdentifier("buddy-course-\(course.id)")
                    }
                }
            } footer: {
                Text("Only students in the selected courses will see this post.")
            }
        }
    }

    private var settingsEditor: some View {
        Form {
            Section {
                BuddyVisibilitySelector(selection: $visibilityPreset, presets: visibilityPresets)
            } header: {
                Text("Who can see this")
                    .accessibilityIdentifier("buddy-section-visibility")
            }

            if needsCourseSelection {
                Section {
                    if courseStore.isLoading {
                        SSLoadingState("Loading courses")
                    } else if enrolledCourses.isEmpty {
                        Text("Join at least one course to use coursemate visibility.")
                            .foregroundStyle(SideSeatTheme.textSecondaryStrong)
                    } else {
                        ForEach(enrolledCourses) { course in
                            CourseVisibilityChip(
                                course: course,
                                isSelected: selectedCourseIds.contains(course.id)
                            ) {
                                selectedCourseIds = [course.id]
                            }
                        }
                    }
                } header: {
                    Text("Courses")
                }
            }

            Section {
                FlowExpiryChips(selection: $expiryPreset)
            } header: {
                Text("Expires")
                    .accessibilityIdentifier("buddy-section-expiry")
            } footer: {
                Text(expiryPreset.hint)
                    .accessibilityIdentifier("buddy-footer-expiry")
            }
        }
    }

    @MainActor
    private func closeCurrentPost() {
        guard let onClose, !isClosing else { return }
        isClosing = true
        closeIssue = nil

        Task { @MainActor in
            let didClose = await onClose()
            isClosing = false
            if didClose {
                dismiss()
            } else {
                closeIssue = AppLocalization.string("The buddy post could not be closed. Please try again.")
            }
        }
    }

    private func submit() async {
        guard canSubmit else { return }
        focusedField = nil
        let courseIDs = needsCourseSelection
            ? Array(selectedCourseIds.sorted().prefix(1))
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
                location: location,
                capacity: hasCapacityLimit ? capacity : nil,
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
                location: location,
                capacity: hasCapacityLimit ? capacity : nil,
                expiresAt: selectedExpiryDate,
                existingImageURLs: existingImageURLs,
                images: imageDrafts,
                using: session
            )
        }
        if ok {
            guard let savedPostID = store.savedPostID else {
                submitIssue = AppLocalization.string( "The saved buddy post could not be opened. Please refresh Discover.")
                return
            }
            didSucceed = true
            await onCreated(savedPostID)
        } else {
            if let issue = store.issue {
                submitIssue = issue
            } else if isEditing {
                submitIssue = AppLocalization.string("The buddy post could not be updated. Please try again.")
            } else if isReposting {
                submitIssue = AppLocalization.string("The buddy post could not be reposted. Please try again.")
            } else {
                submitIssue = AppLocalization.string("The buddy post could not be published. Please try again.")
            }
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
    var isCover = false
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
            .frame(width: 104, height: 104)
            .background(SideSeatTheme.fillTertiary)
            .clipShape(RoundedRectangle(cornerRadius: SideSeatTheme.mediaRadius, style: .continuous))

            if isCover {
                Text("Cover")
                    .font(.caption2.weight(.semibold))
                    .foregroundStyle(.white)
                    .padding(.horizontal, 7)
                    .padding(.vertical, 4)
                    .background(.black.opacity(0.58), in: Capsule())
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottomLeading)
                    .padding(6)
            }

            Button(action: onRemove) {
                Image(systemName: "xmark.circle.fill")
                    .font(.title3)
                    .symbolRenderingMode(.palette)
                    .foregroundStyle(.white, .black.opacity(0.45))
            }
            .buttonStyle(SSPressButtonStyle())
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
                        .background(SideSeatTheme.fillTertiary, in: Capsule())
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
                            .foregroundStyle(selection == preset ? SideSeatTheme.accentText : SideSeatTheme.textSecondary)
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
                .buttonStyle(SSPressButtonStyle())
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
                    .buttonStyle(SSPressButtonStyle())
                    .accessibilityAddTraits(selection == preset ? .isSelected : [])
                }
            }
        }
        .listRowInsets(EdgeInsets(top: 10, leading: 16, bottom: 10, trailing: 16))
    }
}

private struct BuddyImageDraftThumbnail: View {
    let draft: NativeDiscoverBuddyImageDraft
    var isCover = false
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
            .frame(width: 104, height: 104)
            .clipShape(RoundedRectangle(cornerRadius: SideSeatTheme.mediaRadius, style: .continuous))

            if isCover {
                Text("Cover")
                    .font(.caption2.weight(.semibold))
                    .foregroundStyle(.white)
                    .padding(.horizontal, 7)
                    .padding(.vertical, 4)
                    .background(.black.opacity(0.58), in: Capsule())
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottomLeading)
                    .padding(6)
            }

            Button(action: onRemove) {
                Image(systemName: "xmark.circle.fill")
                    .font(.title3)
                    .symbolRenderingMode(.palette)
                    .foregroundStyle(.white, .black.opacity(0.45))
            }
            .buttonStyle(SSPressButtonStyle())
            .offset(x: 4, y: -4)
            .accessibilityLabel("Remove photo")
        }
    }
}

private struct BuddyComposerToolLabel: View {
    let title: String
    let systemImage: String
    let isActive: Bool

    var body: some View {
        Label(title, systemImage: systemImage)
            .font(.subheadline.weight(.medium))
            .foregroundStyle(isActive ? SideSeatTheme.accentText : SideSeatTheme.textPrimary)
            .padding(.horizontal, 12)
            .frame(minHeight: 40)
            .background(
                isActive ? SideSeatTheme.accent.opacity(0.10) : SideSeatTheme.fillTertiary,
                in: Capsule()
            )
            .overlay {
                Capsule()
                    .strokeBorder(isActive ? SideSeatTheme.accent.opacity(0.25) : .clear, lineWidth: 1)
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
        .buttonStyle(SSPressButtonStyle())
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
                    .tint(SideSeatTheme.accentText)
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
    var font: Font = .body

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
                .font(font)
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
