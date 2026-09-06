import SwiftUI

struct CourseDetailView: View {
    @Environment(SessionStore.self) private var session
    @State private var store = CourseDetailStore()
    @State private var confirmingLeave = false

    let courseID: String

    var body: some View {
        Group {
            if let detail = store.detail {
                detailList(detail)
            } else if let issue = store.issue {
                ContentUnavailableView {
                    Label("Could not load course", systemImage: "wifi.exclamationmark")
                } description: {
                    Text(issue)
                } actions: {
                    Button("Try again") { Task { await load() } }
                }
            } else {
                SSLoadingState("Loading course")
            }
        }
        .navigationTitle("Course")
        .navigationBarTitleDisplayMode(.inline)
        .task { if store.detail == nil { await load() } }
        .ssActionPrompt(
            isPresented: $confirmingLeave,
            title: AppLocalization.string("Remove this course?"),
            message: AppLocalization.string("It will be removed from your current courses, timetable, and course-action matching."),
            systemImage: "rectangle.portrait.and.arrow.right",
            tint: SideSeatTheme.danger,
            onDismiss: { confirmingLeave = false },
            accessibilityIdentifier: "course-leave-prompt"
        ) {
            [
                SSActionPromptAction(
                    id: "course-leave-cancel",
                    title: AppLocalization.string("Cancel"),
                    systemImage: "xmark",
                    role: .cancel
                ) {},
                SSActionPromptAction(
                    id: "course-leave-confirm",
                    title: AppLocalization.string("Remove course"),
                    systemImage: "rectangle.portrait.and.arrow.right",
                    role: .destructive
                ) {
                    Task { _ = await store.setEnrolled(false, courseID: courseID, using: session) }
                },
            ]
        }
        .accessibilityIdentifier("course-detail")
    }

    private func detailList(_ detail: NativeCourseDetail) -> some View {
        List {
            header(detail.course)
            actions(detail)

            if !detail.membershipSessions.isEmpty {
                sessionsSection(title: "My timetable", sessions: detail.membershipSessions)
            }

            if !detail.officialScheduleVariants.isEmpty {
                Section("Official timetables") {
                    ForEach(detail.officialScheduleVariants) { variant in
                        VStack(alignment: .leading, spacing: 9) {
                            Text(variant.label)
                                .font(.headline)
                            ForEach(variant.sessions, id: \.self) { session in
                                CourseSessionLabel(session: session)
                            }
                            Button("Use timetable") {
                                Task {
                                    _ = await store.applySchedule(variant, courseID: courseID, using: session)
                                }
                            }
                            .buttonStyle(.bordered)
                            .disabled(!detail.course.viewer.enrolled || store.isMutating)
                            .accessibilityIdentifier("course-use-schedule-\(variant.id)")
                        }
                        .padding(.vertical, 4)
                    }
                }
            }

            if let issue = store.issue {
                Section {
                    Label(issue, systemImage: "exclamationmark.triangle")
                        .foregroundStyle(SideSeatTheme.danger)
                }
            }
        }
        .listStyle(.insetGrouped)
        .refreshable { await load() }
    }

    private func header(_ course: NativeCourseSummary) -> some View {
        Section {
            VStack(alignment: .leading, spacing: 8) {
                if let code = course.code, !code.isEmpty {
                    Text(code)
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(SideSeatTheme.courseFallback)
                }
                Text(course.name)
                    .font(.title2.weight(.semibold))
                    .foregroundStyle(.primary)
                Text(course.school)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                if let instructor = course.instructorSummary, !instructor.isEmpty {
                    Text(instructor)
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
                if course.communitySubmitted == true {
                    Label("Community-added course", systemImage: "person.2.badge.plus")
                        .font(.caption)
                        .foregroundStyle(SideSeatTheme.HubTint.courses)
                }
            }
            .padding(.vertical, 5)
            .accessibilityIdentifier("course-detail-header")
        }
    }

    private func actions(_ detail: NativeCourseDetail) -> some View {
        Section {
            if detail.course.viewer.enrolled {
                Button("Remove from my courses", systemImage: "rectangle.portrait.and.arrow.right", role: .destructive) {
                    confirmingLeave = true
                }
                .disabled(store.isMutating)
                .accessibilityIdentifier("course-leave")
            } else {
                Button("Add to my courses", systemImage: "plus.circle.fill") {
                    Task { _ = await store.setEnrolled(true, courseID: courseID, using: session) }
                }
                .disabled(store.isMutating)
                .accessibilityIdentifier("course-join")

                Button(
                    detail.course.viewer.saved ? "Remove bookmark" : "Save course",
                    systemImage: detail.course.viewer.saved ? "bookmark.slash" : "bookmark"
                ) {
                    Task {
                        _ = await store.setSaved(!detail.course.viewer.saved, courseID: courseID, using: session)
                    }
                }
                .disabled(store.isMutating)
                .accessibilityIdentifier("course-save")
            }

            if store.isMutating {
                ProgressView()
                    .frame(maxWidth: .infinity)
            }
        }
    }

    private func sessionsSection(title: LocalizedStringKey, sessions: [NativeCourseSession]) -> some View {
        Section(title) {
            ForEach(sessions, id: \.self) { session in
                CourseSessionLabel(session: session)
            }
        }
    }

    private func load() async {
        await store.load(courseID: courseID, using: session)
    }
}

private extension NativeCourseDetail {
    var membershipSessions: [NativeCourseSession] { membership?.sessions ?? [] }
}

private struct CourseSessionLabel: View {
    let session: NativeCourseSession

    var body: some View {
        HStack(alignment: .firstTextBaseline) {
            Text(session.weekday.shortName)
                .font(.subheadline.weight(.semibold))
                .frame(width: 38, alignment: .leading)
            Text("\(time(session.startMinute))–\(time(session.endMinute))")
                .font(.subheadline.monospacedDigit())
            Spacer()
            if let location = session.location, !location.isEmpty {
                Text(location)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }
        }
        .accessibilityElement(children: .combine)
    }

    private func time(_ minute: Int) -> String {
        String(format: "%02d:%02d", minute / 60, minute % 60)
    }
}
