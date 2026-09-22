import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  computeScheduleShareFreeRanges,
  internalBlocksToPublicSnapshot,
} from "../../lib/schedule-share/build-schedule-share-snapshot";

describe("schedule share free ranges", () => {
  it("subtracts busy time inside each Berlin sharing day", () => {
    const slots = computeScheduleShareFreeRanges({
      rangeStart: new Date("2026-08-09T22:00:00.000Z"),
      rangeEnd: new Date("2026-08-10T22:00:00.000Z"),
      includedDates: ["2026-08-10"],
      busy: [
        {
          start: new Date("2026-08-10T08:00:00.000Z"),
          end: new Date("2026-08-10T09:30:00.000Z"),
        },
      ],
    });

    assert.deepEqual(
      slots.map((slot) => [slot.start.toISOString(), slot.end.toISOString()]),
      [
        ["2026-08-09T22:00:00.000Z", "2026-08-10T08:00:00.000Z"],
        ["2026-08-10T09:30:00.000Z", "2026-08-10T22:00:00.000Z"],
      ],
    );
  });

  it("keeps non-contiguous selected dates as separate daily windows", () => {
    const slots = computeScheduleShareFreeRanges({
      rangeStart: new Date("2026-08-09T22:00:00.000Z"),
      rangeEnd: new Date("2026-08-12T22:00:00.000Z"),
      includedDates: ["2026-08-10", "2026-08-12"],
      busy: [],
    });

    assert.deepEqual(
      slots.map((slot) => [slot.start.toISOString(), slot.end.toISOString()]),
      [
        ["2026-08-09T22:00:00.000Z", "2026-08-10T22:00:00.000Z"],
        ["2026-08-11T22:00:00.000Z", "2026-08-12T22:00:00.000Z"],
      ],
    );
  });

  it("merges adjacent selected days so proposals can cross midnight", () => {
    const slots = computeScheduleShareFreeRanges({
      rangeStart: new Date("2026-08-09T22:00:00.000Z"),
      rangeEnd: new Date("2026-08-11T22:00:00.000Z"),
      includedDates: ["2026-08-10", "2026-08-11"],
      busy: [],
    });

    assert.deepEqual(
      slots.map((slot) => [slot.start.toISOString(), slot.end.toISOString()]),
      [["2026-08-09T22:00:00.000Z", "2026-08-11T22:00:00.000Z"]],
    );
  });

  it("drops fragments that are too short to submit as a proposal", () => {
    const slots = computeScheduleShareFreeRanges({
      rangeStart: new Date("2026-08-09T22:00:00.000Z"),
      rangeEnd: new Date("2026-08-10T22:00:00.000Z"),
      includedDates: ["2026-08-10"],
      busy: [
        {
          start: new Date("2026-08-09T22:10:00.000Z"),
          end: new Date("2026-08-10T22:00:00.000Z"),
        },
      ],
    });

    assert.deepEqual(slots, []);
  });

  it("keeps an overnight busy event when it overlaps a selected day", () => {
    const snapshot = internalBlocksToPublicSnapshot({
      internal: [
        {
          start: new Date("2026-08-10T21:00:00.000Z"),
          end: new Date("2026-08-11T07:00:00.000Z"),
          title: "Overnight trip",
        },
      ],
      rangeStart: new Date("2026-08-09T22:00:00.000Z"),
      rangeEnd: new Date("2026-08-11T22:00:00.000Z"),
      reveal: {
        categoryIds: [],
        presetKeys: [],
        hideAllDetails: true,
        includedDates: ["2026-08-11"],
        availabilityStartMinutes: 0,
        availabilityEndMinutes: 24 * 60,
      },
      ownerDisplayLabel: "Mina",
      linkExpiresAt: null,
      allowGuestProposals: true,
    });

    assert.equal(snapshot.blocks.length, 1);
    assert.deepEqual(snapshot.freeSlots, [
      {
        start: "2026-08-11T07:00:00.000Z",
        end: "2026-08-11T22:00:00.000Z",
      },
    ]);
  });

  it("only treats the owner's explicit 09:00–21:00 window as shareable", () => {
    const slots = computeScheduleShareFreeRanges({
      rangeStart: new Date("2026-08-09T22:00:00.000Z"),
      rangeEnd: new Date("2026-08-10T22:00:00.000Z"),
      includedDates: ["2026-08-10"],
      availabilityStartMinutes: 9 * 60,
      availabilityEndMinutes: 21 * 60,
      busy: [
        {
          start: new Date("2026-08-10T10:00:00.000Z"),
          end: new Date("2026-08-10T11:00:00.000Z"),
        },
      ],
    });

    assert.deepEqual(
      slots.map((slot) => [slot.start.toISOString(), slot.end.toISOString()]),
      [
        ["2026-08-10T07:00:00.000Z", "2026-08-10T10:00:00.000Z"],
        ["2026-08-10T11:00:00.000Z", "2026-08-10T19:00:00.000Z"],
      ],
    );
  });

  it("constructs daily hours in Berlin across daylight-saving changes", () => {
    const spring = computeScheduleShareFreeRanges({
      rangeStart: new Date("2026-03-28T23:00:00.000Z"),
      rangeEnd: new Date("2026-03-29T22:00:00.000Z"),
      includedDates: ["2026-03-29"],
      availabilityStartMinutes: 9 * 60,
      availabilityEndMinutes: 21 * 60,
      busy: [],
    });

    assert.deepEqual(
      spring.map((slot) => [slot.start.toISOString(), slot.end.toISOString()]),
      [["2026-03-29T07:00:00.000Z", "2026-03-29T19:00:00.000Z"]],
    );
  });
});
