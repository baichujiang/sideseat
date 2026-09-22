import assert from "node:assert/strict";
import test from "node:test";

import { formatInTimeZone } from "date-fns-tz";

import { recommendScheduleShareCandidates } from "../../lib/schedule-share/recommended-candidates";

test("recommends concrete one-hour slots with at most two per Berlin day", () => {
  const candidates = recommendScheduleShareCandidates(
    [
      { start: "2026-09-01T06:00:00.000Z", end: "2026-09-01T21:30:00.000Z" },
      { start: "2026-09-02T07:00:00.000Z", end: "2026-09-02T19:00:00.000Z" },
      { start: "2026-09-03T07:00:00.000Z", end: "2026-09-03T19:00:00.000Z" },
    ],
    new Date("2026-08-31T10:00:00.000Z"),
  );

  assert.equal(candidates.length, 5);
  const perDay = new Map<string, number>();
  for (const candidate of candidates) {
    assert.equal(candidate.end.getTime() - candidate.start.getTime(), 60 * 60 * 1_000);
    const day = formatInTimeZone(candidate.start, "Europe/Berlin", "yyyy-MM-dd");
    const hour = Number(formatInTimeZone(candidate.start, "Europe/Berlin", "H"));
    assert.ok(hour >= 9 && hour < 21);
    perDay.set(day, (perDay.get(day) ?? 0) + 1);
  }
  assert.ok([...perDay.values()].every((count) => count <= 2));
});

test("does not recommend overnight times from legacy full-day links", () => {
  const candidates = recommendScheduleShareCandidates(
    [{ start: "2026-09-01T00:00:00.000Z", end: "2026-09-01T23:59:59.000Z" }],
    new Date("2026-08-31T10:00:00.000Z"),
  );

  assert.ok(candidates.length > 0);
  for (const candidate of candidates) {
    const minutes = Number(formatInTimeZone(candidate.start, "Europe/Berlin", "H")) * 60
      + Number(formatInTimeZone(candidate.start, "Europe/Berlin", "m"));
    assert.ok(minutes >= 9 * 60 && minutes + 60 <= 21 * 60);
  }
});
