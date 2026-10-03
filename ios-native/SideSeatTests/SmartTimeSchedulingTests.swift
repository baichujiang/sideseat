import Foundation
import Testing
@testable import SideSeat

@Suite("Smart time scheduling")
struct SmartTimeSchedulingTests {
    private func slot(_ start: String, _ end: String) -> NativeScheduleShareSlot { .init(start: start, end: end) }
    private func date(_ value: String) -> Date { Date.sideSeatChatISO8601(value)! }

    @Test("Only the intersection is offered, never a private busy interval")
    func intersectsBothCalendars() {
        let peer = [slot("2026-10-05T07:00:00Z", "2026-10-05T18:00:00Z")]
        let own = [slot("2026-10-05T08:00:00Z", "2026-10-05T09:00:00Z"), slot("2026-10-05T12:00:00Z", "2026-10-05T16:00:00Z")]
        let common = SmartTimeMatcher.commonSlots(peer, own)
        #expect(common == own)
        let suggestions = SmartTimeMatcher.candidates(slots: common, now: date("2026-10-04T00:00:00Z"))
        #expect(!suggestions.isEmpty)
        #expect(suggestions.allSatisfy { SmartTimeMatcher.contains(start: $0.start, end: $0.end, in: own, now: date("2026-10-04T00:00:00Z")) })
    }

    @Test("Short gaps, adjacent boundaries and no shared permission produce no suggestion")
    func noSuitableGap() {
        let peer = [slot("2026-10-05T07:00:00Z", "2026-10-05T08:00:00Z")]
        #expect(SmartTimeMatcher.commonSlots(peer, []).isEmpty)
        #expect(SmartTimeMatcher.commonSlots(peer, [slot("2026-10-05T08:00:00Z", "2026-10-05T09:00:00Z")]).isEmpty)
        let short = [slot("2026-10-05T07:00:00Z", "2026-10-05T07:29:00Z")]
        #expect(SmartTimeMatcher.candidates(slots: short, durationMinutes: 30, now: date("2026-10-04T00:00:00Z")).isEmpty)
    }

    @Test("Recommendations honor duration, daylight preference, lead time and different days")
    func preferencesAndLeadTime() {
        let slots = (5...7).map { slot("2026-10-0\($0)T07:00:00Z", "2026-10-0\($0)T19:00:00Z") }
        let now = date("2026-10-05T11:15:00Z")
        let values = SmartTimeMatcher.candidates(slots: slots, durationMinutes: 90, period: .afternoon, now: now)
        #expect(values.count >= 3)
        let calendar = Calendar.sideSeatBerlin
        #expect(Set(values.prefix(3).map { calendar.startOfDay(for: $0.start) }).count == 3)
        #expect(values.allSatisfy { $0.end.timeIntervalSince($0.start) == 90 * 60 && $0.start >= now.addingTimeInterval(3600) })
        #expect(values.allSatisfy { calendar.component(.hour, from: $0.start) >= 12 && calendar.component(.hour, from: $0.end) <= 18 })
    }

    @Test("Berlin clock times remain stable over the daylight-saving change")
    func daylightSaving() {
        let slots = [slot("2026-10-24T00:00:00Z", "2026-10-26T22:00:00Z")]
        let suggestions = SmartTimeMatcher.candidates(slots: slots, period: .morning, now: date("2026-10-23T00:00:00Z"))
        let first = Array(suggestions.prefix(3))
        #expect(first.map { Calendar.sideSeatBerlin.component(.hour, from: $0.start) } == [9, 9, 9])
        #expect(first[1].start.timeIntervalSince(first[0].start) == 25 * 3600)
    }

    @Test("Overlapping free slots do not duplicate suggestions")
    func mergesOverlaps() {
        let free = [slot("2026-10-05T07:00:00Z", "2026-10-05T10:00:00Z"), slot("2026-10-05T09:00:00Z", "2026-10-05T12:00:00Z")]
        let common = SmartTimeMatcher.commonSlots(free, free)
        #expect(common.count == 1)
        let candidates = SmartTimeMatcher.candidates(slots: common, now: date("2026-10-04T00:00:00Z"))
        #expect(Set(candidates.map(\.start)).count == candidates.count)
    }

    @Test("A refreshed busy or expired selection cannot be sent")
    func staleSelection() {
        let start = date("2026-10-05T10:00:00Z"), end = date("2026-10-05T11:00:00Z")
        #expect(!SmartTimeMatcher.contains(start: start, end: end, in: [], now: date("2026-10-04T00:00:00Z")))
        #expect(!SmartTimeMatcher.contains(start: start, end: end, in: [slot("2026-10-05T09:00:00Z", "2026-10-05T12:00:00Z")], now: end))
    }
    @Test("Direct recommendations keep concrete three- and four-hour free windows")
    func wholeFreeWindows() {
        let now = date("2026-10-04T00:00:00Z")
        let free = [slot("2026-10-05T07:00:00Z", "2026-10-05T10:00:00Z"), slot("2026-10-06T11:00:00Z", "2026-10-06T15:00:00Z")]
        let windows = SmartTimeWindow.recommendations(from: free, now: now)
        #expect(windows.count == 2)
        #expect(windows.map { $0.end.timeIntervalSince($0.start) } == [3 * 3600, 4 * 3600])
        #expect(windows[0].start == date(free[0].start))
        #expect(windows[1].end == date(free[1].end))
    }

    @Test("Busy gaps stay excluded and overlapping source intervals are merged")
    func realBusyGaps() {
        let free = [slot("2026-10-05T07:00:00Z", "2026-10-05T08:00:00Z"), slot("2026-10-05T09:00:00Z", "2026-10-05T10:00:00Z"), slot("2026-10-05T09:30:00Z", "2026-10-05T10:00:00Z")]
        let windows = SmartTimeWindow.recommendations(from: free, now: date("2026-10-04T00:00:00Z"))
        #expect(windows.count == 2)
        #expect(windows.allSatisfy { $0.end.timeIntervalSince($0.start) == 3600 })
        #expect(windows[0].end < windows[1].start)
        #expect(SmartTimeWindow.recommendations(from: [], now: date("2026-10-04T00:00:00Z")).isEmpty)
    }

    @Test("Direct recommendations span dates, stay in the next seven days and respect Berlin DST")
    func windowDatesAndDaylightSaving() {
        let now = date("2026-10-23T00:00:00Z")
        let free = [slot("2026-10-22T00:00:00Z", "2026-11-01T22:00:00Z")]
        let windows = SmartTimeWindow.recommendations(from: free, now: now)
        let calendar = Calendar.sideSeatBerlin
        #expect(windows.count == 21)
        #expect(Set(windows.prefix(3).map { calendar.startOfDay(for: $0.start) }).count == 3)
        #expect(calendar.component(.hour, from: windows[0].start) == 9)
        #expect(calendar.component(.hour, from: windows[1].start) == 12)
        #expect(calendar.component(.hour, from: windows[2].start) == 17)
        #expect(windows.allSatisfy { calendar.component(.day, from: $0.start) >= 24 && calendar.component(.day, from: $0.end) <= 30 })
    }

}
