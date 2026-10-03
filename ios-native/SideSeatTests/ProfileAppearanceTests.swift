import Foundation
import Testing
@testable import SideSeat

@Suite("Profile personalization")
struct ProfileAppearanceTests {
    @Test("Expired Plus falls back while retaining the saved style")
    func expiryFallback() {
        let saved = NativeProfileAppearance(theme: "ocean", icon: "moon", style: "outline", showMembershipBadge: false)
        #expect(saved.requiresPlus)
        #expect(saved.effective(isPlus: true) == saved)
        #expect(saved.effective(isPlus: false) == NativeProfileAppearance(showMembershipBadge: false))
        #expect(NativeProfileAppearance(theme: "rose", icon: "sun").requiresPlus == false)
    }

    @Test("Profile edits preserve appearance")
    func preservesAppearance() throws {
        let style = NativeProfileAppearance(theme: "forest", icon: "leaf", style: "spotlight")
        let original = NativeCurrentProfile.uiTestingFixture.applying(NativeProfileUpdateRequest(appearance: style))
        let edited = original.applying(NativeProfileUpdateRequest(bio: "Hello campus"))
        #expect(edited.appearance == style)
        #expect(edited.tagline == "Hello campus")
        let body = try JSONEncoder().encode(NativeProfileUpdateRequest(appearance: style))
        let json = try #require(JSONSerialization.jsonObject(with: body) as? [String: Any])
        #expect(json.keys.sorted() == ["appearance"])
    }
}
