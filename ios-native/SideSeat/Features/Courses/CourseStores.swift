import Foundation
import Observation

@MainActor
@Observable
final class CourseListStore {
    private(set) var payload: NativeCourseList?
    private(set) var isLoading = false
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
            payload = NativeCourseList(
                school: school ?? fixture.school,
                semesterLabel: fixture.semesterLabel,
                scope: scope,
                query: query,
                schools: fixture.schools,
                courses: query.isEmpty || fixture.courses[0].name.localizedCaseInsensitiveContains(query)
                    ? fixture.courses
                    : [],
                nextCursor: nil
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
