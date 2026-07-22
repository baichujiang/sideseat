import SwiftUI

struct CourseListView: View {
    @Environment(SessionStore.self) private var session
    @State private var store = CourseListStore()
    @State private var scope: NativeCourseScope = .popular
    @State private var selectedSchool: String?
    @State private var query = ""

    var body: some View {
        List {
            controls

            if let issue = store.issue, store.payload == nil {
                ContentUnavailableView {
                    Label("Could not load courses", systemImage: "wifi.exclamationmark")
                } description: {
                    Text(issue)
                } actions: {
                    Button("Try again") { Task { await load() } }
                }
                .listRowBackground(Color.clear)
            } else if store.isLoading, store.payload == nil {
                ProgressView("Loading courses")
                    .frame(maxWidth: .infinity)
                    .listRowBackground(Color.clear)
            } else if courses.isEmpty {
                SSEmptyState(
                    title: query.isEmpty ? "No courses" : "No results",
                    systemImage: "books.vertical",
                    description: query.isEmpty
                        ? "Courses will appear here."
                        : "Try another course code or name."
                )
                .listRowBackground(Color.clear)
            } else {
                Section {
                    ForEach(courses) { course in
                        NavigationLink(value: AppRoute.course(courseID: course.id)) {
                            CourseSummaryRow(course: course)
                        }
                        .accessibilityIdentifier("course-row-\(course.id)")
                    }
                } header: {
                    if let payload = store.payload {
                        Text(payload.semesterLabel)
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
                        .foregroundStyle(SideSeatTheme.verifiedSeal)
                }
                Text(course.name)
                    .font(.body.weight(.medium))
                    .lineLimit(2)
            }
            HStack(spacing: 10) {
                Label("\(course.memberCount)", systemImage: "person.2")
                if course.viewer.enrolled {
                    Label("Joined", systemImage: "checkmark.circle.fill")
                        .foregroundStyle(SideSeatTheme.success)
                } else if course.viewer.saved {
                    Label("Saved", systemImage: "bookmark.fill")
                        .foregroundStyle(SideSeatTheme.verifiedSeal)
                }
            }
            .font(.caption)
            .foregroundStyle(.secondary)
        }
        .padding(.vertical, 3)
    }
}
