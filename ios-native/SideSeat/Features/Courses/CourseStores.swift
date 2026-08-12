import Foundation
import Observation

@MainActor
@Observable
final class CourseListStore {
    private(set) var payload: NativeCourseList?
    private(set) var isLoading = false
    private(set) var mutatingCourseID: String?
    private(set) var issue: String?
    private var latestRequestID: UUID?

    func load(
        using session: SessionStore,
        scope: NativeCourseScope,
        school: String?,
        query: String
    ) async {
        let requestID = UUID()
        latestRequestID = requestID
        if payload?.scope != scope
            || payload?.query != query
            || (school != nil && payload?.school != school)
        {
            payload = nil
        }
        isLoading = true
        issue = nil
        defer {
            if latestRequestID == requestID {
                isLoading = false
            }
        }

        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("--ui-testing-authenticated") {
            let fixture = NativeCourseList.uiTestingFixture
            guard latestRequestID == requestID else { return }
            let showsEmptyFixture = ProcessInfo.processInfo.arguments.contains("--ui-testing-empty-courses")
            let fixtureCourses = fixture.courses.map { course in
                guard scope == .archived else { return course }
                return NativeCourseSummary(
                    id: course.id,
                    code: course.code,
                    name: course.name,
                    instructorSummary: course.instructorSummary,
                    school: course.school,
                    semesterLabel: "WS 2025/26",
                    memberCount: course.memberCount,
                    viewer: NativeCourseViewerState(
                        enrolled: false,
                        saved: false,
                        canRestore: true
                    ),
                    sessions: course.sessions,
                    communitySubmitted: course.communitySubmitted
                )
            }
            payload = NativeCourseList(
                school: school ?? fixture.school,
                semesterLabel: fixture.semesterLabel,
                scope: scope,
                query: query,
                schools: fixture.schools,
                courses: !showsEmptyFixture
                    && (query.isEmpty || fixtureCourses.contains {
                        $0.name.localizedCaseInsensitiveContains(query)
                            || $0.code?.localizedCaseInsensitiveContains(query) == true
                    })
                    ? fixtureCourses
                    : [],
                nextCursor: nil,
                semesterReview: fixture.semesterReview
            )
            return
        }
        #endif

        do {
            var queryItems = [
                URLQueryItem(name: "scope", value: scope.rawValue),
                URLQueryItem(name: "limit", value: "30")
            ]
            if let school { queryItems.append(URLQueryItem(name: "school", value: school)) }
            if !query.isEmpty { queryItems.append(URLQueryItem(name: "q", value: query)) }
            let response: APIEnvelope<NativeCourseList> = try await session.sendAuthorized(
                "api/v1/courses",
                queryItems: queryItems
            )
            guard latestRequestID == requestID else { return }
            payload = response.data
        } catch is CancellationError {
            return
        } catch {
            guard latestRequestID == requestID else { return }
            issue = error.localizedDescription
        }
    }

    func restoreArchivedCourse(_ courseID: String, using session: SessionStore) async -> Bool {
        await mutateArchivedCourse(courseID, method: .post, using: session)
    }

    func removeArchivedCourse(_ courseID: String, using session: SessionStore) async -> Bool {
        await mutateArchivedCourse(
            courseID,
            method: .delete,
            pathSuffix: "archive",
            using: session
        )
    }

    private func mutateArchivedCourse(
        _ courseID: String,
        method: HTTPMethod,
        pathSuffix: String = "enrollment",
        using session: SessionStore
    ) async -> Bool {
        guard mutatingCourseID == nil else { return false }
        mutatingCourseID = courseID
        issue = nil
        defer { mutatingCourseID = nil }

        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("--ui-testing-authenticated") {
            removeCourseFromPayload(courseID)
            return true
        }
        #endif

        do {
            let _: APIEnvelope<LooseMutationResponse> = try await session.sendAuthorized(
                "api/v1/courses/\(courseID)/\(pathSuffix)",
                method: method,
                idempotencyKey: UUID().uuidString
            )
            removeCourseFromPayload(courseID)
            return true
        } catch {
            issue = error.localizedDescription
            return false
        }
    }

    private func removeCourseFromPayload(_ courseID: String) {
        guard let payload else { return }
        self.payload = NativeCourseList(
            school: payload.school,
            semesterLabel: payload.semesterLabel,
            scope: payload.scope,
            query: payload.query,
            schools: payload.schools,
            courses: payload.courses.filter { $0.id != courseID },
            nextCursor: payload.nextCursor,
            semesterReview: payload.semesterReview
        )
    }
}

@MainActor
@Observable
final class CourseSemesterReviewStore {
    private(set) var review: NativeCourseSemesterReview?
    private(set) var selectedCourseIDs: Set<String> = []
    private(set) var isLoading = false
    private(set) var isSaving = false
    private(set) var issue: String?

    func load(using session: SessionStore) async {
        guard !isLoading else { return }
        isLoading = true
        issue = nil
        defer { isLoading = false }

        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("--ui-testing-authenticated") {
            let course = NativeCourseList.uiTestingFixture.courses[0]
            let fixture = NativeCourseSemesterReview(
                semesterLabel: "SS 2026",
                required: true,
                courseCount: 1,
                courses: [
                    NativeCourseSemesterReviewCourse(
                        id: course.id,
                        code: course.code,
                        name: course.name,
                        school: course.school,
                        previousSemesterLabel: "WS 2025/26",
                        activeUntil: "2026-03-31T21:59:59Z",
                        sessions: course.sessions
                    )
                ]
            )
            review = fixture
            selectedCourseIDs = Set(fixture.courses.map(\.id))
            return
        }
        #endif

        do {
            let response: APIEnvelope<NativeCourseSemesterReview> = try await session.sendAuthorized(
                "api/v1/courses/semester-review"
            )
            review = response.data
            selectedCourseIDs = Set(response.data.courses.map(\.id))
        } catch {
            issue = error.localizedDescription
        }
    }

    func toggle(_ courseID: String) {
        if selectedCourseIDs.contains(courseID) {
            selectedCourseIDs.remove(courseID)
        } else {
            selectedCourseIDs.insert(courseID)
        }
    }

    func confirm(using session: SessionStore) async -> Bool {
        guard !isSaving else { return false }
        isSaving = true
        issue = nil
        defer { isSaving = false }

        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("--ui-testing-authenticated") {
            return true
        }
        #endif

        do {
            let _: APIEnvelope<NativeCourseSemesterReviewResult> = try await session.sendAuthorized(
                "api/v1/courses/semester-review",
                method: .post,
                body: NativeCourseSemesterReviewRequest(
                    courseIds: selectedCourseIDs.sorted()
                ),
                idempotencyKey: UUID().uuidString
            )
            return true
        } catch {
            issue = error.localizedDescription
            return false
        }
    }
}

@MainActor
@Observable
final class CourseManualAddStore {
    private(set) var isSaving = false
    private(set) var issue: String?

    func create(
        name: String,
        code: String,
        using session: SessionStore
    ) async -> String? {
        guard !isSaving else { return nil }
        let name = name.trimmingCharacters(in: .whitespacesAndNewlines)
        let code = code.trimmingCharacters(in: .whitespacesAndNewlines)
        guard name.count >= 2 else {
            issue = String(localized: "Enter the course name.")
            return nil
        }

        isSaving = true
        issue = nil
        defer { isSaving = false }

        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("--ui-testing-authenticated") {
            return "ui-community-course"
        }
        #endif

        do {
            let response: APIEnvelope<NativeCourseManualCreateResult> = try await session.sendAuthorized(
                "api/v1/courses/manual",
                method: .post,
                body: NativeCourseManualCreateRequest(name: name, code: code),
                idempotencyKey: UUID().uuidString
            )
            return response.data.courseId
        } catch {
            issue = error.localizedDescription
            return nil
        }
    }
}

@MainActor
@Observable
final class CourseDetailStore {
    private(set) var detail: NativeCourseDetail?
    private(set) var isLoading = false
    private(set) var isMutating = false
    private(set) var issue: String?

    func load(courseID: String, using session: SessionStore) async {
        guard !isLoading else { return }
        isLoading = true
        issue = nil
        defer { isLoading = false }

        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("--ui-testing-authenticated") {
            detail = .uiTestingFixture
            return
        }
        #endif

        do {
            let response: APIEnvelope<NativeCourseDetail> = try await session.sendAuthorized(
                "api/v1/courses/\(courseID)"
            )
            detail = response.data
        } catch {
            issue = error.localizedDescription
        }
    }

    func setSaved(_ saved: Bool, courseID: String, using session: SessionStore) async -> Bool {
        await mutate(
            path: "api/v1/courses/\(courseID)/saved",
            method: saved ? .post : .delete,
            body: nil,
            courseID: courseID,
            using: session
        )
    }

    func setEnrolled(_ enrolled: Bool, courseID: String, using session: SessionStore) async -> Bool {
        await mutate(
            path: "api/v1/courses/\(courseID)/enrollment",
            method: enrolled ? .post : .delete,
            body: nil,
            courseID: courseID,
            using: session
        )
    }

    func applySchedule(
        _ variant: NativeCourseScheduleVariant,
        courseID: String,
        using session: SessionStore
    ) async -> Bool {
        await mutate(
            path: "api/v1/courses/\(courseID)/schedule",
            method: .patch,
            body: NativeCourseScheduleRequest(variantFingerprint: variant.fingerprint),
            courseID: courseID,
            using: session
        )
    }

    private func mutate(
        path: String,
        method: HTTPMethod,
        body: (any Encodable & Sendable)?,
        courseID: String,
        using session: SessionStore
    ) async -> Bool {
        guard !isMutating else { return false }
        isMutating = true
        issue = nil
        defer { isMutating = false }

        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("--ui-testing-authenticated") {
            applyUITestingMutation(path: path, method: method)
            return true
        }
        #endif

        do {
            let _: APIEnvelope<LooseMutationResponse> = try await session.sendAuthorized(
                path,
                method: method,
                body: body,
                idempotencyKey: UUID().uuidString
            )
            await load(courseID: courseID, using: session)
            return true
        } catch {
            issue = error.localizedDescription
            return false
        }
    }

    #if DEBUG
    private func applyUITestingMutation(path: String, method: HTTPMethod) {
        guard let current = detail else { return }
        let course = current.course

        if path.hasSuffix("/enrollment") {
            let enrolled = method == .post
            detail = NativeCourseDetail(
                course: NativeCourseSummary(
                    id: course.id,
                    code: course.code,
                    name: course.name,
                    instructorSummary: course.instructorSummary,
                    school: course.school,
                    semesterLabel: course.semesterLabel,
                    memberCount: max(0, course.memberCount + (enrolled ? 1 : -1)),
                    viewer: NativeCourseViewerState(enrolled: enrolled, saved: course.viewer.saved),
                    sessions: course.sessions,
                    officialScheduleSyncedAt: course.officialScheduleSyncedAt
                ),
                membership: enrolled
                    ? NativeCourseMembership(id: "ui-membership", intentions: [], sessions: [])
                    : nil,
                officialScheduleVariants: current.officialScheduleVariants,
                members: current.members,
                chat: NativeCourseChatState(
                    available: enrolled,
                    unreadCount: enrolled ? 2 : 0
                )
            )
            return
        }

        if path.hasSuffix("/saved") {
            let saved = method == .post
            detail = NativeCourseDetail(
                course: NativeCourseSummary(
                    id: course.id,
                    code: course.code,
                    name: course.name,
                    instructorSummary: course.instructorSummary,
                    school: course.school,
                    semesterLabel: course.semesterLabel,
                    memberCount: course.memberCount,
                    viewer: NativeCourseViewerState(enrolled: course.viewer.enrolled, saved: saved),
                    sessions: course.sessions,
                    officialScheduleSyncedAt: course.officialScheduleSyncedAt
                ),
                membership: current.membership,
                officialScheduleVariants: current.officialScheduleVariants,
                members: current.members,
                chat: current.chat
            )
            return
        }

        if path.hasSuffix("/schedule"), let membership = current.membership {
            let sessions = current.officialScheduleVariants.first?.sessions ?? membership.sessions
            detail = NativeCourseDetail(
                course: course,
                membership: NativeCourseMembership(
                    id: membership.id,
                    intentions: membership.intentions,
                    sessions: sessions
                ),
                officialScheduleVariants: current.officialScheduleVariants,
                members: current.members,
                chat: current.chat
            )
        }
    }
    #endif
}

private struct LooseMutationResponse: Decodable, Sendable {
    let courseId: String
}
