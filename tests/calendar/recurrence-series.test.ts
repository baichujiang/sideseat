import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  calendarOccurrenceId,
  parseCalendarOccurrenceId,
} from "../../lib/calendar/calendar-occurrence-id";
import {
  calendarOccurrenceAtOrAfter,
  calendarOccurrenceAtOrBefore,
  calendarOccurrenceBefore,
  expandCalendarRecurrenceInWindow,
} from "../../lib/calendar/calendar-recurrence";
import {
  calendarSearchMatchRank,
  compareCalendarSearchSortKeys,
} from "../../lib/calendar/calendar-search-ranking";
import { calendarEventSchema } from "../../lib/validators/calendar";

describe("windowed calendar recurrence", () => {
  it("supports a never-ending daily series years later without materializing its history", () => {
    const occurrences = expandCalendarRecurrenceInWindow(
      {
        startAt: "2026-01-01T08:00:00.000Z",
        endAt: "2026-01-01T09:00:00.000Z",
        repeat: "DAILY",
        repeatUntil: null,
      },
      new Date("2036-02-01T00:00:00.000Z"),
      new Date("2036-02-04T00:00:00.000Z"),
    );

    assert.equal(occurrences.length, 3);
    assert.deepEqual(
      occurrences.map((occurrence) => occurrence.startAt.toISOString()),
      [
        "2036-02-01T08:00:00.000Z",
        "2036-02-02T08:00:00.000Z",
        "2036-02-03T08:00:00.000Z",
      ],
    );
  });

  it("preserves Berlin wall time and elapsed duration through spring DST", () => {
    const occurrences = expandCalendarRecurrenceInWindow(
      {
        startAt: "2026-03-22T22:30:00.000Z",
        endAt: "2026-03-23T00:00:00.000Z",
        repeat: "WEEKLY",
        repeatUntil: null,
      },
      new Date("2026-03-20T00:00:00.000Z"),
      new Date("2026-04-07T00:00:00.000Z"),
    );

    assert.deepEqual(
      occurrences.map((occurrence) => occurrence.startAt.toISOString()),
      [
        "2026-03-22T22:30:00.000Z",
        "2026-03-29T21:30:00.000Z",
        "2026-04-05T21:30:00.000Z",
      ],
    );
    assert.ok(
      occurrences.every(
        (occurrence) => occurrence.endAt.getTime() - occurrence.startAt.getTime() === 90 * 60_000,
      ),
    );
  });

  it("honors a bounded series and includes an occurrence overlapping the window", () => {
    const occurrences = expandCalendarRecurrenceInWindow(
      {
        startAt: "2026-08-01T22:00:00.000Z",
        endAt: "2026-08-03T02:00:00.000Z",
        repeat: "WEEKLY",
        repeatUntil: "2026-08-08T22:00:00.000Z",
      },
      new Date("2026-08-02T00:00:00.000Z"),
      new Date("2026-08-16T00:00:00.000Z"),
    );

    assert.deepEqual(
      occurrences.map((occurrence) => occurrence.startAt.toISOString()),
      ["2026-08-01T22:00:00.000Z", "2026-08-08T22:00:00.000Z"],
    );
  });

  it("finds the prior generated occurrence for future-scope splits", () => {
    const previous = calendarOccurrenceBefore(
      {
        startAt: "2026-03-22T22:30:00.000Z",
        endAt: "2026-03-23T00:00:00.000Z",
        repeat: "WEEKLY",
        repeatUntil: null,
      },
      new Date("2026-04-05T21:30:00.000Z"),
    );
    assert.equal(previous?.toISOString(), "2026-03-29T21:30:00.000Z");
  });

  it("resolves the nearest occurrence around a search reference without expanding history", () => {
    const seed = {
      startAt: "2026-01-05T08:00:00.000Z",
      endAt: "2026-01-05T09:00:00.000Z",
      repeat: "WEEKLY" as const,
      repeatUntil: null,
    };
    const reference = new Date("2036-02-01T12:00:00.000Z");

    assert.equal(
      calendarOccurrenceAtOrBefore(seed, reference)?.startAt.toISOString(),
      "2036-01-28T08:00:00.000Z",
    );
    assert.equal(
      calendarOccurrenceAtOrAfter(seed, reference)?.startAt.toISOString(),
      "2036-02-04T08:00:00.000Z",
    );
  });

  it("honors repeat boundaries when resolving search occurrences", () => {
    const seed = {
      startAt: "2026-08-03T08:00:00.000Z",
      endAt: "2026-08-03T09:00:00.000Z",
      repeat: "WEEKLY" as const,
      repeatUntil: "2026-08-17T08:00:00.000Z",
    };
    const reference = new Date("2027-01-01T00:00:00.000Z");

    assert.equal(calendarOccurrenceAtOrAfter(seed, reference), null);
    assert.equal(
      calendarOccurrenceAtOrBefore(seed, reference)?.startAt.toISOString(),
      "2026-08-17T08:00:00.000Z",
    );
  });

  it("round-trips a stable generated occurrence identifier", () => {
    const originalStartAt = new Date("2036-02-01T08:00:00.000Z");
    const id = calendarOccurrenceId("cmaster123", originalStartAt);
    assert.deepEqual(parseCalendarOccurrenceId(id), {
      seriesId: "cmaster123",
      originalStartAt,
    });
    assert.equal(parseCalendarOccurrenceId("cmaster123_occ_not-a-time"), null);
  });

  it("accepts Never but still validates an explicitly supplied repeat boundary", () => {
    const base = {
      title: "Weekly review",
      startAt: "2026-08-31T08:00:00.000Z",
      endAt: "2026-08-31T09:00:00.000Z",
      repeat: "WEEKLY" as const,
      withUserIds: [],
    };
    assert.equal(calendarEventSchema.safeParse({ ...base, repeatUntil: "" }).success, true);
    assert.equal(
      calendarEventSchema.safeParse({
        ...base,
        repeatUntil: "2026-08-30T08:00:00.000Z",
      }).success,
      false,
    );
  });
});

describe("calendar search ranking", () => {
  it("orders title, location and note matches by the product hierarchy", () => {
    const fields = (title: string, location: string | null, note: string | null) => ({
      title,
      location,
      note,
    });

    assert.equal(calendarSearchMatchRank(fields("Review", null, null), "review"), 0);
    assert.equal(calendarSearchMatchRank(fields("Review session", null, null), "review"), 1);
    assert.equal(calendarSearchMatchRank(fields("Weekly review", null, null), "review"), 2);
    assert.equal(calendarSearchMatchRank(fields("Study", "Review room", null), "review"), 3);
    assert.equal(calendarSearchMatchRank(fields("Study", null, "Review notes"), "review"), 4);
  });

  it("uses distance within one relevance tier and prefers future on an exact tie", () => {
    const base = { rank: 2, startISO: "2026-08-29T12:00:00.000Z" };
    const future = { ...base, id: "future", distance: 3_600_000, pastPriority: 0 };
    const past = { ...base, id: "past", distance: 3_600_000, pastPriority: 1 };
    const farther = { ...base, id: "farther", distance: 7_200_000, pastPriority: 0 };

    assert.deepEqual(
      [past, farther, future].sort(compareCalendarSearchSortKeys).map((entry) => entry.id),
      ["future", "past", "farther"],
    );
  });
});
