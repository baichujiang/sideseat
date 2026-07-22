import SwiftUI

struct CourseDetailView: View {
    @Environment(SessionStore.self) private var session
    @Environment(RouterPath.self) private var router
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
                ProgressView("Loading course")
            }
        }
        .navigationTitle("Course")
        .navigationBarTitleDisplayMode(.inline)
        .task { if store.detail == nil { await load() } }
        .confirmationDialog("Leave this course?", isPresented: $confirmingLeave) {
            Button("Leave course", role: .destructive) {
                Task { _ = await store.setEnrolled(false, courseID: courseID, using: session) }
            }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("Your personal timetable for this course will be removed.")
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

            if detail.course.viewer.enrolled {
                Section("Classmates") {
                    if detail.members.isEmpty {
                        Text("No classmates have joined yet.")
                            .foregroundStyle(.secondary)
                    } else {
                        ForEach(detail.members) { member in
                            CourseMemberRow(member: member)
                        }
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
                        .foregroundStyle(SideSeatTheme.verifiedSeal)
                }
                Text(course.name)
                    .font(.title2.weight(.semibold))
                HStack(spacing: 12) {
                    Text(course.school)
                    Text(course.semesterLabel)
                    Label("\(course.memberCount)", systemImage: "person.2")
                }
                .font(.subheadline)
                .foregroundStyle(.secondary)
                if let instructor = course.instructorSummary, !instructor.isEmpty {
                    Text(instructor)
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
            }
            .padding(.vertical, 5)
            .accessibilityIdentifier("course-detail-header")
        }
    }

    private func actions(_ detail: NativeCourseDetail) -> some View {
        Section {
            if detail.chat.available {
                Button {
                    router.navigate(to: .courseChat(courseID: courseID))
                } label: {
                    HStack {
                        Label("Course chat", systemImage: "bubble.left.and.bubble.right")
                        Spacer()
                        if detail.chat.unreadCount > 0 {
                            Text(detail.chat.unreadCount > 99 ? "99+" : "\(detail.chat.unreadCount)")
                                .font(.caption2.weight(.bold))
                                .foregroundStyle(.white)
                                .padding(.horizontal, 6)
                                .padding(.vertical, 2)
                                .background(Capsule().fill(SideSeatTheme.accent))
                                .accessibilityLabel("\(detail.chat.unreadCount) unread")
                        }
                    }
                }
                .accessibilityIdentifier("course-open-chat")
            }

            if detail.course.viewer.enrolled {
                Button("Leave course", systemImage: "rectangle.portrait.and.arrow.right", role: .destructive) {
                    confirmingLeave = true
                }
                .disabled(store.isMutating)
                .accessibilityIdentifier("course-leave")
            } else {
                Button("Join course", systemImage: "plus.circle.fill") {
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

private struct CourseMemberRow: View {
    let member: NativeCourseMember

    var body: some View {
        HStack(spacing: 11) {
            AsyncImage(url: member.avatarUrl.flatMap(URL.init(string:))) { image in
                image.resizable().scaledToFill()
            } placeholder: {
                Circle()
                    .fill(SideSeatTheme.fillSubtle)
                    .overlay(Text(String(member.displayName.prefix(1))).font(.headline))
            }
            .frame(width: 42, height: 42)
            .clipShape(Circle())

            VStack(alignment: .leading, spacing: 3) {
                Text(member.displayName)
                    .font(.body.weight(.medium))
                if let tagline = member.tagline, !tagline.isEmpty {
                    Text(tagline)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                } else if let major = member.major, !major.isEmpty {
                    Text(major)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
        }
        .accessibilityElement(children: .combine)
    }
}
