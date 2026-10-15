import Foundation
import Testing
@testable import SideSeat

struct When2meetTests {
    @Test("Shared provider event links open in-app without accepting lookalike hosts")
    func eventLinks() {
        #expect(When2meetLink.eventURL(from: "https://when2meet.com/?12345-AbC12&tracking=unused#section")?.absoluteString == "https://www.when2meet.com/?12345-AbC12")
        #expect(When2meetLink.firstEvent(in: "Let's meet: https://www.when2meet.com/?12345-AbC12") != nil)
        for value in ["https://when2meet.com.evil.test/?12345-AbC12", "https://when2meet.com@evil.test/?12345-AbC12", "javascript:alert(1)", "https://www.when2meet.com/SaveTimes.php?12345-AbC12", "https://www.when2meet.com/?not-an-event"] {
            #expect(When2meetLink.eventURL(from: value) == nil)
        }
    }

    @MainActor @Test("The last real poll persists for its owner without crossing SideSeat accounts")
    func recentPollPersistence() throws {
        let name = "when2meet-test-\(UUID().uuidString)"
        let defaults = try #require(UserDefaults(suiteName: name))
        defer { defaults.removePersistentDomain(forName: name) }
        let url = try #require(When2meetLink.eventURL(from: "https://www.when2meet.com/?12345-AbC12"))
        let owner = When2meetBrowserState(initialURL: When2meetLink.home, userID: "owner", defaults: defaults)
        owner.currentURL = url
        owner.remember(title: "Study together")
        let reopened = When2meetBrowserState(initialURL: When2meetLink.home, userID: "owner", defaults: defaults)
        #expect(reopened.recentPoll?.url == url)
        #expect(reopened.recentPoll?.title == "Study together")
        #expect(When2meetBrowserState(initialURL: When2meetLink.home, userID: "another", defaults: defaults).recentPoll == nil)
        let firstLoad = owner.loadID
        owner.open(When2meetLink.home)
        #expect(owner.loadID != firstLoad)
        #expect(owner.eventURL == nil)
    }
}
