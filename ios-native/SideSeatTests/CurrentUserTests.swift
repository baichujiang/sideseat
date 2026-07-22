import Testing
@testable import SideSeat

@Suite("Current user")
struct CurrentUserTests {
    @Test("Prefers a non-empty nickname")
    func displayName() {
        let user = CurrentUser.fixture(nickname: "Ada")
        #expect(user.displayName == "Ada")
    }

    @Test("Falls back to username for blank nickname")
    func blankNickname() {
        let user = CurrentUser.fixture(nickname: "  ")
        #expect(user.displayName == "ada_001")
    }
}

private extension CurrentUser {
    static func fixture(nickname: String?) -> CurrentUser {
        CurrentUser(
            id: "user-1",
            username: "ada_001",
            nickname: nickname,
            email: nil,
            phone: nil,
            avatarUrl: nil,
            tagline: nil,
            school: "TUM",
            degreeLevel: nil,
            major: nil,
            semester: nil,
            gender: "UNSPECIFIED",
            onboardingComplete: true,
            isGuest: false,
            verifiedStudent: true,
            studentVerificationStatus: "VERIFIED",
            usernameUpdatedAt: nil,
            productTutorialDismissedAt: nil,
            locale: "en"
        )
    }
}
