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
                #"{"data":{"school":"TUM","semesterLabel":"SS 2026","scope":"popular","query":"","schools":[{"code":"TUM","shortLabel":"TUM","name":"Technical University of Munich"}],"courses":[{"id":"course-1","code":"IN2346","name":"Deep Learning","instructorSummary":null,"school":"TUM","semesterLabel":"SS 2026","memberCount":3,"viewer":{"enrolled":false,"saved":true},"sessions":[]}],"nextCursor":null}}"#.utf8
            )
        )
        #expect(list.data.courses.first?.viewer.saved == true)
        #expect(list.data.scope == .popular)

        let detail = try JSONDecoder().decode(
            APIEnvelope<NativeCourseDetail>.self,
            from: Data(
                #"{"data":{"course":{"id":"course-1","code":"IN2346","name":"Deep Learning","instructorSummary":null,"school":"TUM","semesterLabel":"SS 2026","memberCount":3,"viewer":{"enrolled":false,"saved":true},"sessions":[],"officialScheduleSyncedAt":null},"membership":null,"officialScheduleVariants":[],"members":[],"chat":{"available":false,"unreadCount":0}}}"#.utf8
            )
        )
        #expect(detail.data.membership == nil)
        #expect(detail.data.chat.available == false)
    }
}
