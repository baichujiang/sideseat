import Foundation
import Testing
@testable import SideSeat

@Suite("Calendar categories")
struct CalendarCategoryModelsTests {
    @Test("Built-in identity follows the server preset key")
    func builtInIdentity() {
        let builtIn = NativeCalendarCategory(
            id: "personal",
            name: "Personal",
            color: "#EA580C",
            sortOrder: 0,
            presetKey: "personal",
            icsSubscriptionUrl: nil
        )
        let custom = NativeCalendarCategory(
            id: "custom",
            name: "Project",
            color: "#2563EB",
            sortOrder: 4,
            presetKey: nil,
            icsSubscriptionUrl: nil
        )

        #expect(builtIn.isBuiltIn)
        #expect(!custom.isBuiltIn)
    }

    @Test("Custom updates encode an explicit null to remove a subscription")
    func explicitSubscriptionRemoval() throws {
        let custom = NativeCalendarCategoryPatchRequest(
            name: "Project",
            color: "#2563EB",
            icsSubscriptionUrl: nil,
            includesSubscription: true
        )
        let builtIn = NativeCalendarCategoryPatchRequest(
            name: "Personal",
            color: "#EA580C",
            icsSubscriptionUrl: nil,
            includesSubscription: false
        )
        let customObject = try #require(
            JSONSerialization.jsonObject(with: JSONEncoder().encode(custom)) as? [String: Any]
        )
        let builtInObject = try #require(
            JSONSerialization.jsonObject(with: JSONEncoder().encode(builtIn)) as? [String: Any]
        )

        #expect(customObject["icsSubscriptionUrl"] is NSNull)
        #expect(builtInObject["icsSubscriptionUrl"] == nil)
    }
}
