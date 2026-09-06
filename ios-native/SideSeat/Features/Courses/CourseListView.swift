import SwiftUI

struct CourseListView: View {
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    @Environment(SessionStore.self) private var session
    @Environment(RouterPath.self) private var router
    @State private var store = CourseListStore()
    @State private var scope: NativeCourseScope = .enrolled
    @State private var selectedSchool: String?
    @State private var query = ""
    @State private var showsSemesterReview = false
    @State private var showsArchivedCourses = false
    @State private var showsScreenshotImport = false
    @State private var showsManualAdd = false

    var body: some View {
        List {
            controls

            if let review = store.payload?.semesterReview, review.required {
                semesterReviewPrompt(review)
            }

            if let issue = store.issue, store.payload == nil {
                ContentUnavailableView {
                    Label("Could not load courses", systemImage: "wifi.exclamationmark")
                } description: {
                    Text(issue)
                } actions: {
                    Button("Try again") { Task { await load() } }
                }
                .ssListPageStateRow()
            } else if store.payload == nil {
                SSLoadingState("Loading courses")
                    .frame(maxWidth: .infinity)
                    .ssListPageStateRow()
            } else if courses.isEmpty {
                emptyCoursesState
                    .ssListPageStateRow()
            } else {
                Section {
                    ForEach(courses) { course in
                        Button {
                            router.navigate(to: .course(courseID: course.id))
                        } label: {
                            HStack(spacing: SideSeatTheme.spaceSM) {
                                CourseSummaryRow(course: course)
                                    .frame(maxWidth: .infinity, alignment: .leading)
                                if !dynamicTypeSize.isAccessibilitySize {
                                    Image(systemName: "chevron.right")
                                        .font(.subheadline.weight(.semibold))
                                        .foregroundStyle(SideSeatTheme.textSecondary)
                                        .accessibilityHidden(true)
                                }
                            }
                        }
                        .buttonStyle(SSPressButtonStyle())
                        .accessibilityIdentifier("course-row-\(course.id)")
                    }
                }
            }

            archivedCoursesEntry
        }
        .listStyle(.insetGrouped)
        .navigationTitle("Courses")
        .navigationBarTitleDisplayMode(.inline)
        .searchable(
            text: $query,
            placement: .navigationBarDrawer(displayMode: .always),
            prompt: "Search courses"
        )
        .refreshable { await load() }
        .sheet(isPresented: $showsSemesterReview) {
            CourseSemesterReviewSheet {
                await load()
            }
        }
        .sheet(isPresented: $showsArchivedCourses) {
            NavigationStack {
                ArchivedCourseListView(showsDoneButton: true)
            }
        }
        .sheet(isPresented: $showsScreenshotImport) {
            CourseScreenshotImportView(
                school: selectedSchool ?? store.payload?.school,
                onImported: { await load() }
            )
        }
        .sheet(isPresented: $showsManualAdd) {
            CourseManualAddView(
                school: selectedSchool ?? store.payload?.school ?? "School",
                onCreated: { courseID in
                    await load()
                    router.navigate(to: .course(courseID: courseID))
                }
            )
        }
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Menu {
                    Button {
                        showsScreenshotImport = true
                    } label: {
                        Label("Import timetable screenshot", systemImage: "camera.viewfinder")
                    }
                    .accessibilityIdentifier("course-add-screenshot")
                    Button {
                        showsManualAdd = true
                    } label: {
                        Label("Add course manually", systemImage: "square.and.pencil")
                    }
                    .accessibilityIdentifier("course-add-manual")
                } label: {
                    Image(systemName: "plus")
                }
                .accessibilityLabel("Add courses")
                .accessibilityIdentifier("course-add-menu")
            }
        }
        .task(id: loadKey) {
            if !query.isEmpty {
                try? await Task.sleep(for: .milliseconds(300))
                guard !Task.isCancelled else { return }
            }
            await load()
        }
        .accessibilityIdentifier("courses-list")
    }

    private var controls: some View {
        Section {
            schoolContext

            Picker("Course list", selection: $scope) {
                ForEach(NativeCourseScope.primaryCases) { value in
                    Text(value.title).tag(value)
                }
            }
            .pickerStyle(.segmented)
            .accessibilityIdentifier("course-scope")
        }
    }

    @ViewBuilder
    private var schoolContext: some View {
        if let payload = store.payload {
            if payload.schools.count > 1 {
                Menu {
                    ForEach(payload.schools) { school in
                        Button {
                            selectedSchool = school.code
                        } label: {
                            if school.code == activeSchoolCode {
                                Label(school.name, systemImage: "checkmark")
                            } else {
                                Text(school.name)
                            }
                        }
                    }
                } label: {
                    schoolContextLabel(payload: payload, showsDisclosure: true)
                }
                .buttonStyle(SSPressButtonStyle())
                .tint(SideSeatTheme.textPrimary)
                .accessibilityLabel("School")
                .accessibilityValue(activeSchool?.name ?? payload.school)
                .accessibilityIdentifier("course-school")
            } else {
                schoolContextLabel(payload: payload, showsDisclosure: false)
                    .accessibilityElement(children: .combine)
                    .accessibilityLabel("School")
                    .accessibilityValue(activeSchool?.name ?? payload.school)
                    .accessibilityIdentifier("course-school")
            }
        }
    }

    private func schoolContextLabel(
        payload: NativeCourseList,
        showsDisclosure: Bool
    ) -> some View {
        HStack(alignment: .top, spacing: SideSeatTheme.spaceMD) {
            Image(systemName: "building.columns.fill")
                .font(.body.weight(.semibold))
                .foregroundStyle(SideSeatTheme.textSecondary)
                .frame(width: 28, height: 28)

            VStack(alignment: .leading, spacing: 2) {
                Text(activeSchool?.name ?? payload.school)
                    .font(.body.weight(.semibold))
                    .foregroundStyle(SideSeatTheme.textPrimary)
                    .fixedSize(horizontal: false, vertical: true)
                Text("\(activeSchool?.shortLabel ?? payload.school) · \(payload.semesterLabel)")
                    .font(.caption)
                    .foregroundStyle(SideSeatTheme.textSecondaryStrong)
                    .fixedSize(horizontal: false, vertical: true)
            }

            Spacer(minLength: SideSeatTheme.spaceSM)

            if showsDisclosure && !dynamicTypeSize.isAccessibilitySize {
                Image(systemName: "chevron.up.chevron.down")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.tertiary)
            }
        }
        .contentShape(Rectangle())
    }

    private var archivedCoursesEntry: some View {
        Section {
            Button {
                showsArchivedCourses = true
            } label: {
                HStack(spacing: SideSeatTheme.spaceMD) {
                    Image(systemName: "archivebox.fill")
                        .font(.body.weight(.semibold))
                        .foregroundStyle(SideSeatTheme.HubTint.courses)
                        .frame(width: 28, height: 28)
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Archived courses")
                            .font(.body.weight(.medium))
                            .foregroundStyle(.primary)
                        Text("Restore or remove inactive courses")
                            .font(.caption)
                            .foregroundStyle(SideSeatTheme.textSecondaryStrong)
                    }
                    Spacer(minLength: 0)
                    Image(systemName: "chevron.right")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(.tertiary)
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(SSPressButtonStyle())
            .accessibilityIdentifier("course-archived-entry")
        }
    }

    private var activeSchoolCode: String? {
        selectedSchool ?? store.payload?.school
    }

    private var activeSchool: NativeCourseSchool? {
        guard let activeSchoolCode else { return nil }
        return store.payload?.schools.first { $0.code == activeSchoolCode }
    }

    private func semesterReviewPrompt(_ review: NativeCourseSemesterReviewSummary) -> some View {
        Section {
            Button {
                showsSemesterReview = true
            } label: {
                HStack(spacing: SideSeatTheme.spaceMD) {
                    Image(systemName: "calendar.badge.clock")
                        .font(.title3)
                        .foregroundStyle(SideSeatTheme.HubTint.courses)
                        .frame(width: 34)
                    VStack(alignment: .leading, spacing: 3) {
                        Text(String(
                            format: AppLocalization.string( "Confirm %@ courses"),
                            review.semesterLabel
                        ))
                            .font(.body.weight(.semibold))
                            .foregroundStyle(SideSeatTheme.textPrimary)
                        Text(String(
                            format: AppLocalization.string( "Review %d previous courses"),
                            review.courseCount
                        ))
                            .font(.caption)
                            .foregroundStyle(SideSeatTheme.textSecondaryStrong)
                    }
                    Spacer(minLength: 0)
                    Image(systemName: "chevron.right")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(.tertiary)
                }
            }
            .buttonStyle(SSPressButtonStyle())
            .accessibilityIdentifier("course-semester-review")
        }
    }

    private var courses: [NativeCourseSummary] { store.payload?.courses ?? [] }

    @ViewBuilder
    private var emptyCoursesState: some View {
        if !query.isEmpty {
            ContentUnavailableView.search(text: query)
        } else {
            switch scope {
            case .enrolled:
                ContentUnavailableView {
                    Label("No current courses", systemImage: "books.vertical")
                } description: {
                    Text("Browse your school catalog or add courses from a timetable screenshot.")
                } actions: {
                    Button("Browse courses") { scope = .popular }
                        .accessibilityIdentifier("course-empty-browse")
                }
            case .saved:
                ContentUnavailableView {
                    Label("No saved courses", systemImage: "bookmark")
                } description: {
                    Text("Courses you save for later appear here.")
                } actions: {
                    Button("Browse courses") { scope = .popular }
                        .accessibilityIdentifier("course-empty-browse")
                }
            case .popular:
                ContentUnavailableView(
                    "No courses at this school",
                    systemImage: "building.columns",
                    description: Text("Add a course manually when it is missing from the catalog.")
                )
            case .archived:
                ContentUnavailableView(
                    "No archived courses",
                    systemImage: "archivebox",
                    description: Text("Courses removed from a previous semester appear here.")
                )
            }
        }
    }

    private var loadKey: CourseListLoadKey {
        CourseListLoadKey(scope: scope, school: selectedSchool, query: query)
    }

    private func load() async {
        await store.load(
            using: session,
            scope: scope,
            school: selectedSchool,
            query: query.trimmingCharacters(in: .whitespacesAndNewlines)
        )
    }
}

struct ArchivedCourseListView: View {
    @Environment(SessionStore.self) private var session
    @Environment(\.dismiss) private var dismiss
    var showsDoneButton = false
    @State private var store = CourseListStore()
    @State private var query = ""
    @State private var pendingRemoval: NativeCourseSummary?

    var body: some View {
        List {
            Section {
                Text("Archived courses keep their history but stay out of matching, course chat, and your calendar.")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }

            if let issue = store.issue, store.payload == nil {
                ContentUnavailableView {
                    Label("Could not load courses", systemImage: "wifi.exclamationmark")
                } description: {
                    Text(issue)
                } actions: {
                    Button("Try again") { Task { await load() } }
                }
                .ssListPageStateRow()
            } else if store.payload == nil {
                SSLoadingState("Loading courses")
                    .frame(maxWidth: .infinity)
                    .ssListPageStateRow()
            } else if courses.isEmpty {
                SSEmptyState(
                    title: query.isEmpty ? "No archived courses" : "No results",
                    systemImage: "archivebox",
                    description: query.isEmpty
                        ? "Courses you archive or leave will appear here."
                        : "Try another course code or name."
                )
                .ssListPageStateRow()
            } else {
                Section {
                    ForEach(courses) { course in
                        archivedCourseRow(course)
                            .swipeActions(edge: .trailing, allowsFullSwipe: false) {
                                Button(role: .destructive) {
                                    pendingRemoval = course
                                } label: {
                                    Label("Remove from archive", systemImage: "trash")
                                }
                                .accessibilityIdentifier("course-archived-remove-\(course.id)")
                            }
                    }
                }
            }

            if let issue = store.issue, store.payload != nil {
                Section {
                    Label(issue, systemImage: "exclamationmark.triangle")
                        .font(.footnote)
                        .foregroundStyle(SideSeatTheme.danger)
                }
            }
        }
        .listStyle(.insetGrouped)
        .navigationTitle("Archived courses")
        .navigationBarTitleDisplayMode(.inline)
        .searchable(text: $query, prompt: "Search courses")
        .toolbar {
            if showsDoneButton {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                        .accessibilityIdentifier("course-archived-done")
                }
            }
        }
        .task(id: query.trimmingCharacters(in: .whitespacesAndNewlines)) {
            if !query.isEmpty {
                try? await Task.sleep(for: .milliseconds(300))
                guard !Task.isCancelled else { return }
            }
            await load()
        }
        .ssActionPrompt(
            isPresented: removalConfirmationPresented,
            title: AppLocalization.string("Remove archived course?"),
            message: AppLocalization.string("This removes the course from your archive. Existing message history is not deleted."),
            systemImage: "trash.fill",
            tint: SideSeatTheme.danger,
            onDismiss: { pendingRemoval = nil },
            accessibilityIdentifier: "course-archived-remove-prompt",
            actions: { archivedCourseRemovalActions }
        )
        .accessibilityIdentifier("course-archived-list")
    }

    private var courses: [NativeCourseSummary] { store.payload?.courses ?? [] }

    private var removalConfirmationPresented: Binding<Bool> {
        Binding(
            get: { pendingRemoval != nil },
            set: { if !$0 { pendingRemoval = nil } }
        )
    }

    private var archivedCourseRemovalActions: [SSActionPromptAction] {
        guard let courseID = pendingRemoval?.id else { return [] }

        return [
            SSActionPromptAction(
                id: "course-archived-cancel-remove",
                title: AppLocalization.string("Cancel"),
                systemImage: "xmark",
                role: .cancel
            ) {
                pendingRemoval = nil
            },
            SSActionPromptAction(
                id: "course-archived-confirm-remove",
                title: AppLocalization.string("Remove from archive"),
                systemImage: "trash",
                role: .destructive
            ) {
                Task { _ = await store.removeArchivedCourse(courseID, using: session) }
            },
        ]
    }

    private func archivedCourseRow(_ course: NativeCourseSummary) -> some View {
        VStack(alignment: .leading, spacing: SideSeatTheme.spaceSM) {
            CourseSummaryRow(course: course, showsArchivedStatus: true)
            if course.viewer.canRestore == true {
                Button {
                    Task { _ = await store.restoreArchivedCourse(course.id, using: session) }
                } label: {
                    Label("Restore", systemImage: "arrow.counterclockwise")
                        .font(.subheadline.weight(.semibold))
                }
                .buttonStyle(SSPressButtonStyle())
                .disabled(store.mutatingCourseID != nil)
                .accessibilityIdentifier("course-archived-restore-\(course.id)")
            } else if course.viewer.restoreBlockReason == "ACTIVE_EQUIVALENT" {
                Label("A current version of this course is already active.", systemImage: "checkmark.circle.fill")
                    .font(.caption)
                    .foregroundStyle(SideSeatTheme.success)
            } else {
                Label(
                    String(format: AppLocalization.string( "Switch to %@ to restore"), course.school),
                    systemImage: "building.columns"
                )
                .font(.caption)
                .foregroundStyle(.secondary)
            }
        }
        .padding(.vertical, 3)
    }

    private func load() async {
        await store.load(
            using: session,
            scope: .archived,
            school: nil,
            query: query.trimmingCharacters(in: .whitespacesAndNewlines)
        )
    }
}

private struct CourseSemesterReviewSheet: View {
    @Environment(SessionStore.self) private var session
    @Environment(\.dismiss) private var dismiss
    let onComplete: () async -> Void
    @State private var store = CourseSemesterReviewStore()

    var body: some View {
        NavigationStack {
            Group {
                if let review = store.review {
                    List {
                        Section {
                            ForEach(review.courses) { course in
                                Button {
                                    store.toggle(course.id)
                                } label: {
                                    HStack(alignment: .top, spacing: SideSeatTheme.spaceMD) {
                                        Image(
                                            systemName: store.selectedCourseIDs.contains(course.id)
                                                ? "checkmark.circle.fill"
                                                : "circle"
                                        )
                                        .font(.title3)
                                        .foregroundStyle(
                                            store.selectedCourseIDs.contains(course.id)
                                                ? SideSeatTheme.accentText
                                                : Color.secondary
                                        )
                                        VStack(alignment: .leading, spacing: 4) {
                                            Text(course.code ?? course.name)
                                                .font(.body.weight(.semibold))
                                                .foregroundStyle(.primary)
                                            if course.code != nil {
                                                Text(course.name)
                                                    .font(.subheadline)
                                                    .foregroundStyle(.secondary)
                                                    .lineLimit(2)
                                            }
                                            Text("\(course.school) · \(course.previousSemesterLabel)")
                                                .font(.caption)
                                                .foregroundStyle(SideSeatTheme.textSecondaryStrong)
                                        }
                                    }
                                    .padding(.vertical, 3)
                                }
                                .buttonStyle(SSPressButtonStyle())
                                .accessibilityIdentifier("course-review-row-\(course.id)")
                            }
                        } header: {
                            Text("Still taking this semester")
                        } footer: {
                            Text("Courses you leave unchecked keep their history and stop appearing in current matching and course chat.")
                        }

                        if let issue = store.issue {
                            Section {
                                Label(issue, systemImage: "exclamationmark.triangle")
                                    .font(.footnote)
                                    .foregroundStyle(SideSeatTheme.danger)
                            }
                        }
                    }
                } else if store.isLoading {
                    SSLoadingState("Loading courses")
                } else {
                    ContentUnavailableView(
                        "Could not load courses",
                        systemImage: "wifi.exclamationmark",
                        description: Text(store.issue ?? "Try again shortly.")
                    )
                }
            }
            .navigationTitle(store.review?.semesterLabel ?? AppLocalization.string( "Course review"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                        .accessibilityIdentifier("course-review-cancel")
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(confirmTitle) {
                        Task {
                            if await store.confirm(using: session) {
                                await onComplete()
                                dismiss()
                            }
                        }
                    }
                    .disabled(store.review == nil || store.isSaving)
                    .ssConfirmationActionStyle()
                    .accessibilityIdentifier("course-review-confirm")
                }
            }
        }
        .task { await store.load(using: session) }
    }

    private var confirmTitle: String {
        let count = store.selectedCourseIDs.count
        return count == 0
            ? AppLocalization.string( "Archive all")
            : String(format: AppLocalization.string( "Keep %d"), count)
    }
}

private struct CourseListLoadKey: Hashable {
    let scope: NativeCourseScope
    let school: String?
    let query: String
}

private struct CourseSummaryRow: View {
    let course: NativeCourseSummary
    var showsArchivedStatus = false

    var body: some View {
        VStack(alignment: .leading, spacing: SideSeatTheme.spaceSM) {
            Text(course.name)
                .font(.headline)
                .foregroundStyle(SideSeatTheme.textPrimary)
                .multilineTextAlignment(.leading)
                .accessibilityIdentifier("course-title-visual-\(course.id)")

            Text(metadataLine)
            .font(.subheadline)
            .foregroundStyle(SideSeatTheme.textSecondaryStrong)
            .fixedSize(horizontal: false, vertical: true)
            .accessibilityIdentifier("course-metadata-visual-\(course.id)")

            if let instructor = course.instructorSummary, !instructor.isEmpty {
                Text(instructor)
                    .font(.caption)
                    .foregroundStyle(SideSeatTheme.textSecondaryStrong)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityIdentifier("course-instructor-visual-\(course.id)")
            }

            if showsArchivedStatus || course.viewer.enrolled || course.viewer.saved || course.communitySubmitted == true {
                HStack(spacing: 10) {
                    if showsArchivedStatus {
                        Label("Archived", systemImage: "archivebox.fill")
                            .foregroundStyle(.secondary)
                    } else if course.viewer.enrolled {
                        Label("Joined", systemImage: "checkmark.circle.fill")
                            .foregroundStyle(SideSeatTheme.success)
                    } else if course.viewer.saved {
                        Label("Saved", systemImage: "bookmark.fill")
                            .foregroundStyle(SideSeatTheme.HubTint.plans)
                    }
                    if course.communitySubmitted == true {
                        Label("Community", systemImage: "person.2.badge.plus")
                            .foregroundStyle(SideSeatTheme.HubTint.courses)
                    }
                }
                .font(.caption)
                .foregroundStyle(SideSeatTheme.textSecondaryStrong)
            }
        }
        .padding(.vertical, 5)
    }

    private var metadataLine: String {
        [course.code, course.school, course.semesterLabel]
            .compactMap { value in
                guard let value, !value.isEmpty else { return nil }
                return value
            }
            .joined(separator: " · ")
    }
}
