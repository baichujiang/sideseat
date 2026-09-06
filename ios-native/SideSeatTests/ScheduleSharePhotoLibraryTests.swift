import Foundation
import SwiftUI
import Testing
import UIKit
@testable import SideSeat

@Suite("Schedule share photo saving")
@MainActor
struct ScheduleSharePhotoLibraryTests {
    @Test("A successful Photos callback completes the save")
    func successfulCallbackCompletes() async throws {
        let operation = ScheduleSharePhotoWriteOperation()

        try await operation.run(timeout: 1) { completion in
            completion(true, nil)
        }
    }

    @Test("A missing Photos callback times out instead of hanging")
    func missingCallbackTimesOut() async {
        let operation = ScheduleSharePhotoWriteOperation()

        do {
            try await operation.run(timeout: 0.03) { _ in }
            Issue.record("Expected the photo save to time out")
        } catch let error as ScheduleSharePhotoLibraryError {
            #expect(error == .timedOut)
        } catch {
            Issue.record("Unexpected error: \(error)")
        }
    }

    @Test("Cancelling the task releases a pending Photos save")
    func cancellationReleasesWaiter() async {
        let task = Task {
            let operation = ScheduleSharePhotoWriteOperation()
            try await operation.run(timeout: 10) { _ in }
        }

        await Task.yield()
        task.cancel()

        do {
            try await task.value
            Issue.record("Expected cancellation")
        } catch is CancellationError {
            // Expected.
        } catch {
            Issue.record("Unexpected error: \(error)")
        }
    }

    @Test("Long schedule ranges paginate without dropping dates")
    func longRangesPaginate() throws {
        let start = try #require(sampleDate(day: 18))
        let dates = try (0..<17).map { offset in
            try #require(Calendar.sideSeatBerlin.date(byAdding: .day, value: offset, to: start))
        }

        let pages = ScheduleSharePosterPresentation.datePages(for: dates)

        #expect(pages.count == 3)
        #expect(pages.map(\.count) == [7, 7, 3])
        #expect(pages.flatMap { $0 }.count == 17)
    }

    @Test("Contiguous ranges merge only when their calendar meaning matches")
    func contiguousRangesMergeByMeaning() throws {
        let day = try #require(sampleDate(day: 18))
        let ten = try at(hour: 10, on: day)
        let eleven = try at(hour: 11, on: day)
        let noon = try at(hour: 12, on: day)
        let thirteen = try at(hour: 13, on: day)
        let fourteen = try at(hour: 14, on: day)

        let mergedSlots = ScheduleSharePosterPresentation.mergedFreeSlots(
            [
                ScheduleSharePosterFreeSlot(id: "free-a", start: ten, end: eleven),
                ScheduleSharePosterFreeSlot(id: "free-b", start: eleven, end: noon),
                ScheduleSharePosterFreeSlot(id: "free-c", start: thirteen, end: fourteen),
            ],
            on: day
        )

        #expect(mergedSlots.count == 2)
        #expect(mergedSlots[0].start == ten)
        #expect(mergedSlots[0].end == noon)
        #expect(mergedSlots[1].start == thirteen)
        #expect(mergedSlots[1].end == fourteen)

        let timelineEntries = ScheduleSharePosterPresentation.timelineEntries(
            [
                ScheduleSharePosterEntry(
                    id: "busy-a",
                    start: ten,
                    end: eleven,
                    title: "Busy",
                    location: nil,
                    color: .gray,
                    isHidden: true
                ),
                ScheduleSharePosterEntry(
                    id: "busy-b",
                    start: eleven,
                    end: noon,
                    title: "Busy",
                    location: nil,
                    color: .gray,
                    isHidden: true
                ),
                ScheduleSharePosterEntry(
                    id: "public-a",
                    start: noon,
                    end: thirteen,
                    title: "Seminar",
                    location: nil,
                    color: .blue,
                    isHidden: false
                ),
                ScheduleSharePosterEntry(
                    id: "public-b",
                    start: thirteen,
                    end: fourteen,
                    title: "Interview",
                    location: nil,
                    color: .orange,
                    isHidden: false
                ),
            ],
            on: day
        )

        #expect(timelineEntries.count == 3)
        #expect(timelineEntries[0].isHidden)
        #expect(timelineEntries[0].start == ten)
        #expect(timelineEntries[0].end == noon)
        #expect(timelineEntries[1].id == "public-a")
        #expect(timelineEntries[2].id == "public-b")
    }

    @Test("Schedule share poster renders at social sharing resolution")
    func posterRendersAtHighResolution() throws {
        let dates = try sampleWeek()
        let images = ScheduleSharePosterRenderer.images(
            entries: try sampleEntries(in: dates),
            freeSlots: try sampleFreeSlots(in: dates),
            selectedDates: dates,
            hiddenCount: 1,
            ownerDisplayLabel: "Mina",
            shareURL: try #require(URL(string: "https://www.sideseat.de/schedule/sample"))
        )

        let image = try #require(images.first)
        #expect(images.count == 1)
        #expect(image.size == CGSize(width: 360, height: 480))
        #expect(image.cgImage?.width == 1_080)
        #expect(image.cgImage?.height == 1_440)
    }

    private func sampleWeek() throws -> [Date] {
        let start = try #require(sampleDate(day: 18))
        return try (0..<7).map { offset in
            try #require(Calendar.sideSeatBerlin.date(byAdding: .day, value: offset, to: start))
        }
    }

    private func sampleEntries(in dates: [Date]) throws -> [ScheduleSharePosterEntry] {
        [
            ScheduleSharePosterEntry(
                id: "algorithms",
                start: try at(hour: 9, on: dates[0]),
                end: try at(hour: 11, on: dates[0]),
                title: "Algorithms lecture",
                location: "Main Campus",
                color: Color(red: 0.20, green: 0.52, blue: 0.86),
                isHidden: false
            ),
            ScheduleSharePosterEntry(
                id: "project",
                start: try at(hour: 14, on: dates[1]),
                end: try at(hour: 15, minute: 30, on: dates[1]),
                title: "Project meeting",
                location: "Library",
                color: Color(red: 0.48, green: 0.35, blue: 0.75),
                isHidden: false
            ),
            ScheduleSharePosterEntry(
                id: "hidden",
                start: try at(hour: 10, on: dates[2]),
                end: try at(hour: 12, on: dates[2]),
                title: "Busy",
                location: nil,
                color: .gray,
                isHidden: true
            ),
            ScheduleSharePosterEntry(
                id: "interview",
                start: try at(hour: 13, on: dates[4]),
                end: try at(hour: 14, on: dates[4]),
                title: "Interview",
                location: "Online",
                color: Color(red: 0.91, green: 0.46, blue: 0.22),
                isHidden: false
            ),
            ScheduleSharePosterEntry(
                id: "gym",
                start: try at(hour: 18, on: dates[5]),
                end: try at(hour: 19, minute: 30, on: dates[5]),
                title: "Gym",
                location: nil,
                color: Color(red: 0.14, green: 0.58, blue: 0.48),
                isHidden: false
            ),
        ]
    }

    private func sampleFreeSlots(in dates: [Date]) throws -> [ScheduleSharePosterFreeSlot] {
        [
            ScheduleSharePosterFreeSlot(
                id: "free-1",
                start: try at(hour: 11, minute: 30, on: dates[0]),
                end: try at(hour: 13, minute: 30, on: dates[0])
            ),
            ScheduleSharePosterFreeSlot(
                id: "free-2",
                start: try at(hour: 16, on: dates[1]),
                end: try at(hour: 18, on: dates[1])
            ),
            ScheduleSharePosterFreeSlot(
                id: "free-3",
                start: try at(hour: 14, on: dates[3]),
                end: try at(hour: 17, on: dates[3])
            ),
            ScheduleSharePosterFreeSlot(
                id: "free-4",
                start: try at(hour: 10, on: dates[6]),
                end: try at(hour: 12, on: dates[6])
            ),
        ]
    }

    private func sampleDate(day: Int) -> Date? {
        Calendar.sideSeatBerlin.date(
            from: DateComponents(
                timeZone: Calendar.sideSeatBerlin.timeZone,
                year: 2026,
                month: 8,
                day: day
            )
        )
    }

    private func at(hour: Int, minute: Int = 0, on day: Date) throws -> Date {
        try #require(
            Calendar.sideSeatBerlin.date(
                bySettingHour: hour,
                minute: minute,
                second: 0,
                of: day
            )
        )
    }
}

@Suite("Schedule share editing")
struct ScheduleShareEditImpactTests {
    @Test("Adding a date or revealing another category requires confirmation")
    func expandedVisibilityRequiresConfirmation() {
        let base = Date(timeIntervalSince1970: 1_800_000_000)

        #expect(
            ScheduleShareEditImpact.expandsVisibilityOrAccess(
                originalDates: ["2027-01-01"],
                newDates: ["2027-01-01", "2027-01-02"],
                originalRevealOptionIDs: ["study"],
                newRevealOptionIDs: ["study"],
                originalAllowsProposals: false,
                newAllowsProposals: false,
                originalUsageLimit: "UNLIMITED",
                newUsageLimit: "UNLIMITED",
                originalExpiresAt: base,
                newExpiresAt: base
            )
        )

        #expect(
            ScheduleShareEditImpact.expandsVisibilityOrAccess(
                originalDates: ["2027-01-01"],
                newDates: ["2027-01-01"],
                originalRevealOptionIDs: ["study"],
                newRevealOptionIDs: ["study", "personal"],
                originalAllowsProposals: false,
                newAllowsProposals: false,
                originalUsageLimit: "UNLIMITED",
                newUsageLimit: "UNLIMITED",
                originalExpiresAt: base,
                newExpiresAt: base
            )
        )
    }

    @Test("Tightening an existing share does not require privacy confirmation")
    func tightenedVisibilitySavesDirectly() {
        let base = Date(timeIntervalSince1970: 1_800_000_000)

        #expect(
            !ScheduleShareEditImpact.expandsVisibilityOrAccess(
                originalDates: ["2027-01-01", "2027-01-02"],
                newDates: ["2027-01-01"],
                originalRevealOptionIDs: ["study", "personal"],
                newRevealOptionIDs: ["study"],
                originalAllowsProposals: true,
                newAllowsProposals: false,
                originalUsageLimit: "UNLIMITED",
                newUsageLimit: "SINGLE_USE",
                originalExpiresAt: base,
                newExpiresAt: base.addingTimeInterval(-86_400)
            )
        )
    }

    @Test("Only changes that can invalidate pending proposals trigger their warning")
    func pendingProposalImpactIsScoped() {
        #expect(
            ScheduleShareEditImpact.canAffectPendingProposals(
                pendingProposalCount: 2,
                originalDates: ["2027-01-01"],
                newDates: ["2027-01-02"],
                originalAllowsProposals: true,
                newAllowsProposals: true
            )
        )
        #expect(
            !ScheduleShareEditImpact.canAffectPendingProposals(
                pendingProposalCount: 2,
                originalDates: ["2027-01-01"],
                newDates: ["2027-01-01"],
                originalAllowsProposals: true,
                newAllowsProposals: true
            )
        )
    }

    @Test("Changing daily availability participates in privacy and proposal warnings")
    func dailyAvailabilityImpactIsScoped() {
        let base = Date(timeIntervalSince1970: 1_800_000_000)
        let expandsAvailability = ScheduleShareEditImpact.expandsVisibilityOrAccess(
            originalDates: ["2027-01-01"],
            newDates: ["2027-01-01"],
            originalRevealOptionIDs: [],
            newRevealOptionIDs: [],
            originalAllowsProposals: true,
            newAllowsProposals: true,
            originalUsageLimit: "UNLIMITED",
            newUsageLimit: "UNLIMITED",
            originalExpiresAt: base,
            newExpiresAt: base,
            originalAvailabilityStartMinutes: 9 * 60,
            newAvailabilityStartMinutes: 8 * 60,
            originalAvailabilityEndMinutes: 21 * 60,
            newAvailabilityEndMinutes: 21 * 60
        )
        #expect(expandsAvailability)

        let affectsPendingProposal = ScheduleShareEditImpact.canAffectPendingProposals(
            pendingProposalCount: 1,
            originalDates: ["2027-01-01"],
            newDates: ["2027-01-01"],
            originalAllowsProposals: true,
            newAllowsProposals: true,
            originalAvailabilityStartMinutes: 9 * 60,
            newAvailabilityStartMinutes: 10 * 60,
            originalAvailabilityEndMinutes: 21 * 60,
            newAvailabilityEndMinutes: 20 * 60
        )
        #expect(affectsPendingProposal)
    }
}
