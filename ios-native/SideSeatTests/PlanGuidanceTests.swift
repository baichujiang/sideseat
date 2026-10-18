import Foundation
import Testing
@testable import SideSeat

struct PlanGuidanceTests {
    private func item(_ changes: [String: Any] = [:]) throws -> NativeTimePollList.Item {
        var json: [String: Any] = ["token": "plan", "title": "Dinner", "timeZone": "Europe/Berlin", "dates": ["2030-01-02"],
            "updatedAt": "2030-01-01T12:00:00Z", "shareUrl": "https://www.sideseat.de/time-polls/plan",
            "phase": "COLLECTING", "isOwner": true, "didRespond": false, "respondedCount": 0, "planningMode": "COLLECT"]
        json.merge(changes) { _, new in new }
        let decoder = JSONDecoder(); decoder.dateDecodingStrategy = .iso8601
        return try decoder.decode(NativeTimePollList.Item.self, from: JSONSerialization.data(withJSONObject: json))
    }
    private let now = Date(timeIntervalSince1970: 1_000)

    @Test("Organizer's task changes from filling to sharing to choosing after a friend responds")
    func organizerJourney() throws {
        #expect(try item().nextStep(at: now) == .fillAvailability)
        #expect(try item(["didRespond": true, "respondedCount": 1]).nextStep(at: now) == .shareAvailability)
        #expect(try item(["didRespond": true, "respondedCount": 2]).nextStep(at: now) == .chooseTime)
    }
    @Test("A participant who filled in waits for an invitation rather than being asked to repeat")
    func participantJourney() throws {
        #expect(try item(["isOwner": false]).nextStep(at: now) == .fillAvailability)
        #expect(try item(["isOwner": false, "didRespond": true]).nextStep(at: now) == .waitForOrganizer)
        let pending = try item(["phase": "INVITING", "isOwner": false, "isIncluded": true, "myInvitationStatus": "INVITED"])
        #expect(pending.nextStep(at: now) == .confirm)
        #expect(pending.nextStep(at: now).needsYou)
        for status in ["ACCEPTED", "DECLINED"] {
            #expect(try item(["phase": "INVITING", "isOwner": false, "myInvitationStatus": status]).nextStep(at: now) == .waitForReplies)
        }
    }
    @Test("Open fixed invitations use expected count, collected invitations use the actual roster")
    func actualConfirmationTarget() throws {
        #expect(try item(["phase": "INVITING", "planningMode": "FIXED", "invitedCount": 1, "expectedCount": 5]).confirmationTarget == 5)
        #expect(try item(["phase": "INVITING", "invitedCount": 2, "expectedCount": 5]).confirmationTarget == 2)
    }
    @Test("Terminal and elapsed plans do not ask for input")
    func closedPlans() throws {
        for phase in ["CONFIRMED", "CANCELLED", "EXPIRED"] {
            #expect(try item(["phase": phase]).nextStep(at: now) == .viewPlan)
        }
        #expect(try item(["phase": "INVITING", "myInvitationStatus": "INVITED", "expiresAt": "1970-01-01T00:01:00Z"]).nextStep(at: now) == .viewPlan)
    }
}
