import Foundation
import Testing
@testable import SideSeat

@Suite("Courses")
struct CourseModelsTests {
    @Test("Decodes catalog and nullable membership contracts")
    func decodesContracts() throws {
        let list = try JSONDecoder().decode(
            APIEnvelope<NativeCourseList>.self,
            from: Data(
                #"{"data":{"school":"TUM","semesterLabel":"SS 2026","scope":"popular","query":"","schools":[{"code":"TUM","shortLabel":"TUM","name":"Technical University of Munich"}],"courses":[{"id":"course-1","code":"IN2346","name":"Deep Learning","instructorSummary":null,"school":"TUM","semesterLabel":"SS 2026","memberCount":3,"viewer":{"enrolled":false,"saved":true},"sessions":[]}],"nextCursor":null,"semesterReview":{"semesterLabel":"SS 2026","required":true,"courseCount":1}}}"#.utf8
            )
        )
        #expect(list.data.courses.first?.viewer.saved == true)
        #expect(list.data.scope == .popular)
        #expect(list.data.semesterReview?.required == true)

        let detail = try JSONDecoder().decode(
            APIEnvelope<NativeCourseDetail>.self,
            from: Data(
                #"{"data":{"course":{"id":"course-1","code":"IN2346","name":"Deep Learning","instructorSummary":null,"school":"TUM","semesterLabel":"SS 2026","memberCount":3,"viewer":{"enrolled":false,"saved":true},"sessions":[],"officialScheduleSyncedAt":null},"membership":null,"officialScheduleVariants":[],"members":[],"chat":{"available":false,"unreadCount":0}}}"#.utf8
            )
        )
        #expect(detail.data.membership == nil)
        #expect(detail.data.chat.available == false)
    }

    @Test("Decodes archived course restore state")
    func decodesArchivedRestoreState() throws {
        let list = try JSONDecoder().decode(
            APIEnvelope<NativeCourseList>.self,
            from: Data(
                #"{"data":{"school":"TUM","semesterLabel":"SS 2026","scope":"archived","query":"","schools":[],"courses":[{"id":"course-old","code":"IN2346","name":"Deep Learning","instructorSummary":null,"school":"LMU","semesterLabel":"WS 2025/26","memberCount":0,"viewer":{"enrolled":false,"saved":false,"canRestore":false,"restoreBlockReason":"SCHOOL_MISMATCH"},"sessions":[]}],"nextCursor":null,"semesterReview":null}}"#.utf8
            )
        )

        #expect(list.data.scope == .archived)
        #expect(list.data.courses.first?.viewer.canRestore == false)
        #expect(list.data.courses.first?.viewer.restoreBlockReason == "SCHOOL_MISMATCH")
    }

    @Test("Changing filters never presents stale courses when the new request fails")
    @MainActor
    func clearsStalePayloadAcrossFilters() async {
        let transport = CourseListTestTransport()
        let session = makeSession(transport: transport)
        await session.login(identifier: "test_001", password: "Password123")
        let store = CourseListStore()

        await store.load(using: session, scope: .popular, school: nil, query: "")
        #expect(store.payload?.scope == .popular)

        await transport.setFailingScopes([NativeCourseScope.enrolled.rawValue])
        await store.load(using: session, scope: .enrolled, school: nil, query: "")

        #expect(store.payload == nil)
        #expect(store.issue != nil)
    }

    @Test("Refreshing the same filter keeps visible courses when the request fails")
    @MainActor
    func preservesPayloadForSameFilterRefresh() async {
        let transport = CourseListTestTransport()
        let session = makeSession(transport: transport)
        await session.login(identifier: "test_001", password: "Password123")
        let store = CourseListStore()

        await store.load(using: session, scope: .popular, school: nil, query: "")
        await transport.setFailingScopes([NativeCourseScope.popular.rawValue])
        await store.load(using: session, scope: .popular, school: nil, query: "")

        #expect(store.payload?.scope == .popular)
        #expect(store.payload?.courses.map(\.id) == ["course-1"])
        #expect(store.issue != nil)
    }

    @MainActor
    private func makeSession(transport: CourseListTestTransport) -> SessionStore {
        SessionStore(
            apiClient: APIClient(
                environment: AppEnvironment(
                    deployment: .development,
                    apiBaseURL: URL(string: "https://api.sideseat.test")!,
                    bundleIdentifier: "app.sideseat.mobile.tests",
                    appVersion: "1.0.0",
                    buildNumber: "1"
                ),
                transport: transport
            ),
            credentialStore: CourseListMemoryCredentialStore(),
            device: NativeDevice(
                id: "course-list-device",
                name: "Test iPhone",
                appVersion: "1.0.0",
                platformVersion: "26.5"
            )
        )
    }
}

private actor CourseListMemoryCredentialStore: CredentialStore {
    private var token: String?

    func refreshToken() -> String? { token }
    func save(refreshToken: String) { token = refreshToken }
    func clear() { token = nil }
}

private actor CourseListTestTransport: APITransport {
    private var failingScopes: Set<String> = []

    func setFailingScopes(_ scopes: Set<String>) {
        failingScopes = scopes
    }

    func data(for request: URLRequest) async throws -> (Data, URLResponse) {
        switch request.url?.path {
        case "/api/v1/auth/login":
            return response(
                for: request,
                status: 200,
                body: #"{"data":{"user":{"id":"user-1","username":"test_001","nickname":"Test User","gender":"UNSPECIFIED","onboardingComplete":true,"isGuest":false,"verifiedStudent":true,"studentVerificationStatus":"VERIFIED","locale":"en"},"tokens":{"accessToken":"access-token","accessExpiresIn":900,"refreshToken":"refresh-token","refreshExpiresAt":"2026-08-16T00:00:00.000Z"}}}"#
            )
        case "/api/v1/courses":
            let components = URLComponents(url: request.url!, resolvingAgainstBaseURL: false)
            let scope = components?.queryItems?.first(where: { $0.name == "scope" })?.value ?? "popular"
            if failingScopes.contains(scope) {
                return response(
                    for: request,
                    status: 503,
                    body: #"{"error":{"code":"UNAVAILABLE","message":"Try again","field":null,"retryable":true,"requestId":"request-1"}}"#
                )
            }
            return response(
                for: request,
                status: 200,
                body: #"{"data":{"school":"TUM","semesterLabel":"SS 2026","scope":"\#(scope)","query":"","schools":[],"courses":[{"id":"course-1","code":"IN2346","name":"Deep Learning","instructorSummary":null,"school":"TUM","semesterLabel":"SS 2026","memberCount":3,"viewer":{"enrolled":false,"saved":false},"sessions":[]}],"nextCursor":null,"semesterReview":null}}"#
            )
        default:
            return response(
                for: request,
                status: 404,
                body: #"{"error":{"code":"NOT_FOUND","message":"Missing","field":null,"retryable":false,"requestId":"request-1"}}"#
            )
        }
    }

    private func response(
        for request: URLRequest,
        status: Int,
        body: String
    ) -> (Data, URLResponse) {
        let response = HTTPURLResponse(
            url: request.url!,
            statusCode: status,
            httpVersion: "HTTP/1.1",
            headerFields: ["Content-Type": "application/json"]
        )!
        return (Data(body.utf8), response)
    }
}
