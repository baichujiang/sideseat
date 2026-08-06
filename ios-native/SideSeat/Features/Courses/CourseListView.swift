import SwiftUI

struct CourseListView: View {
    @Environment(SessionStore.self) private var session
    @Environment(RouterPath.self) private var router
    @State private var store = CourseListStore()
    @State private var scope: NativeCourseScope = .popular
    @State private var selectedSchool: String?
    @State private var query = ""
    @State private var showsSemesterReview = false
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
            } else if store.isLoading, store.payload == nil {
                SSLoadingState("Loading courses")
                    .frame(maxWidth: .infinity)
                    .ssListPageStateRow()
            } else if courses.isEmpty {
                SSEmptyState(
                    title: query.isEmpty ? "No courses" : "No results",
                    systemImage: "books.vertical",
                    description: query.isEmpty
                        ? "Courses will appear here."
                        : "Try another course code or name."
                )
                .ssListPageStateRow()
            } else {
                Section {
                    ForEach(courses) { course in
                        NavigationLink(value: AppRoute.course(courseID: course.id)) {
                            CourseSummaryRow(course: course)
                        }
                        .buttonStyle(.plain)
                        .accessibilityIdentifier("course-row-\(course.id)")
                    }
                }
            }
        }
        .listStyle(.insetGrouped)
        .navigationTitle("Courses")
        .navigationBarTitleDisplayMode(.inline)
        .searchable(
            text: $query,
            placement: .navigationBarDrawer(displayMode: .always),
            prompt: "Course code or name"
        )
        .refreshable { await load() }
        .sheet(isPresented: $showsSemesterReview) {
            CourseSemesterReviewSheet {
                await load()
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
            Picker("Course list", selection: $scope) {
                ForEach(NativeCourseScope.allCases) { value in
                    Text(value.title).tag(value)
                }
            }
            .pickerStyle(.segmented)
            .accessibilityIdentifier("course-scope")

            if let schools = store.payload?.schools, schools.count > 1 {
                Picker("School", selection: schoolBinding) {
                    ForEach(schools) { school in
                        Text(school.shortLabel).tag(Optional(school.code))
                    }
                }
                .accessibilityIdentifier("course-school")
            }
        }
    }

    private var schoolBinding: Binding<String?> {
        Binding(
            get: { selectedSchool ?? store.payload?.school },
            set: { selectedSchool = $0 }
        )
    }

    private func semesterReviewPrompt(_ review: NativeCourseSemesterReviewSummary) -> some View {
        Section {
            Button {
                showsSemesterReview = true
            } label: {
                HStack(spacing: SideSeatTheme.spaceMD) {
                    Image(systemName: "calendar.badge.clock")
                        .font(.title3)
                        .foregroundStyle(SideSeatTheme.accent)
                        .frame(width: 34)
                    VStack(alignment: .leading, spacing: 3) {
                        Text(String(
                            format: String(localized: "Confirm %@ courses"),
                            review.semesterLabel
                        ))
                            .font(.body.weight(.semibold))
                            .foregroundStyle(.primary)
                        Text(String(
                            format: String(localized: "Review %d previous courses"),
                            review.courseCount
                        ))
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                    Spacer(minLength: 0)
                    Image(systemName: "chevron.right")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(.tertiary)
                }
            }
            .accessibilityIdentifier("course-semester-review")
        }
    }

    private var courses: [NativeCourseSummary] { store.payload?.courses ?? [] }

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
                                                ? SideSeatTheme.accent
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
                                                .foregroundStyle(.tertiary)
                                        }
                                    }
                                    .padding(.vertical, 3)
                                }
                                .buttonStyle(.plain)
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
            .navigationTitle(store.review?.semesterLabel ?? String(localized: "Course review"))
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
                    .accessibilityIdentifier("course-review-confirm")
                }
            }
        }
        .task { await store.load(using: session) }
    }

    private var confirmTitle: String {
        let count = store.selectedCourseIDs.count
        return count == 0
            ? String(localized: "Archive all")
            : String(format: String(localized: "Keep %d"), count)
    }
}

private struct CourseListLoadKey: Hashable {
    let scope: NativeCourseScope
    let school: String?
    let query: String
}

private struct CourseSummaryRow: View {
    let course: NativeCourseSummary

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                if let code = course.code, !code.isEmpty {
                    Text(code)
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(SideSeatTheme.courseFallback)
                }
                Text(course.name)
                    .font(.body.weight(.medium))
                    .foregroundStyle(.primary)
                    .lineLimit(2)
            }
            HStack(spacing: 10) {
                Label("\(course.memberCount)", systemImage: "person.2")
                if course.viewer.enrolled {
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
            .foregroundStyle(.secondary)
        }
        .padding(.vertical, 3)
    }
}
