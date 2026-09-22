import Foundation
import Testing
import UIKit
@testable import SideSeat

@Suite("Discover plan sharing")
struct DiscoverPlanShareTests {
    @Test("Derives remaining spots from the latest post snapshot")
    func derivesRemainingSpots() {
        let post = NativeDiscoverFeed.uiTestingFixture.buddies[0]
        let now = Date(timeIntervalSince1970: 1_786_800_000)

        #expect(DiscoverPlanSharePresentation.availableSpots(for: post, now: now) == 1)
        #expect(
            DiscoverPlanSharePresentation.availableSpots(
                for: post.withSaved(false, interestedCount: 20),
                now: now
            ) == 0
        )
        #expect(
            DiscoverPlanSharePresentation.availableSpots(
                for: post.withStatus("CLOSED"),
                now: now
            ) == nil
        )
    }

    @MainActor
    @Test("Renders a 3:4 high-resolution share poster")
    func rendersPoster() throws {
        let cover = UIGraphicsImageRenderer(size: CGSize(width: 900, height: 600)).image { context in
            UIColor.systemTeal.setFill()
            context.fill(CGRect(x: 0, y: 0, width: 900, height: 600))
        }

        let poster = try #require(
            DiscoverPlanShareRenderer.image(
                for: NativeDiscoverFeed.uiTestingFixture.buddies[0],
                coverImage: cover
            )
        )

        #expect(poster.size == CGSize(width: 360, height: 480))
        #expect(poster.cgImage?.width == 1_080)
        #expect(poster.cgImage?.height == 1_440)
    }
}
