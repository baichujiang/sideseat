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
}
