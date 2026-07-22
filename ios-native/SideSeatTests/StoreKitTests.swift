import Foundation
import Testing
@testable import SideSeat

@Suite("StoreKit")
struct StoreKitTests {
    @Test("Exposes the fixed consumable product IDs")
    func productIDs() {
        #expect(StoreKitProductIDs.all == [
            "app.sideseat.support.tier1",
            "app.sideseat.support.tier3",
            "app.sideseat.support.tier5"
        ])
        #expect(StoreKitProductIDs.finishPath == "app")
    }
}
