import assert from "node:assert/strict";
import test from "node:test";
import { compatibleIntentTiming, flexiblePreferenceFitsLifecycle, recentIntentExpiry, type IntentTimePreference } from "../../lib/v2/intent-timing";
import { weeklyIntentCreateSchema, weeklyIntentPatchSchema } from "../../lib/validators/weekly-intent";

const now = new Date("2026-09-09T10:00:00Z");
const expiry = recentIntentExpiry(now);
const source = (timePreference: IntentTimePreference, timeWindows: unknown = []) => ({
  timePreference, timeWindows, timeZone: "Europe/Berlin", expiresAt: expiry,
});
const undecided = source({ kind: "UNDECIDED" });
const dates = (startDate: string, endDate = startDate, period: "ANY" | "MORNING" | "AFTERNOON" | "EVENING" = "ANY") =>
  source({ kind: "FLEXIBLE", startDate, endDate, period });
const exact = source({ kind: "EXACT" }, [{ startAt: "2026-09-10T08:00:00Z", endAt: "2026-09-10T09:00:00Z" }]);

test("undecided is valid input with no availability and has a 14-day lifecycle", () => {
  const input = { topic: "COFFEE", activityText: "Coffee", timeZone: "Europe/Berlin", timeWindows: [], timePreference: { kind: "UNDECIDED" } };
  assert.equal(weeklyIntentCreateSchema.safeParse(input).success, true);
  assert.equal(weeklyIntentCreateSchema.safeParse({ ...input, timePreference: undefined }).success, false);
  assert.equal(weeklyIntentCreateSchema.safeParse({ ...input, timeWindows: exact.timeWindows }).success, false);
  assert.equal(weeklyIntentPatchSchema.safeParse({ action: "EXTEND", expectedVersion: 1 }).success, true);
  assert.equal(expiry.toISOString(), "2026-09-23T10:00:00.000Z");
});

test("undecided and broad dates match without inventing appointment timestamps", () => {
  for (const [a, b] of [[undecided, undecided], [undecided, dates("2026-09-10")], [dates("2026-09-14", "2026-09-20"), dates("2026-09-16")], [undecided, exact], [dates("2026-09-10", "2026-09-10", "MORNING"), exact]]) {
    const result = compatibleIntentTiming(a!, b!, now);
    assert.ok(result);
    assert.equal(result.startsAt, null);
    assert.equal(result.endsAt, null);
    assert.equal(result.overlapMinutes, null);
    assert.ok(result.expiresAt <= new Date(now.getTime() + 48 * 3600000));
  }
  assert.equal(compatibleIntentTiming(undecided, undecided, now)?.context.kind, "UNDECIDED");
});

test("explicit date / period conflicts remain incompatible, exact overlap remains exact", () => {
  assert.equal(compatibleIntentTiming(dates("2026-09-10"), dates("2026-09-11"), now), null);
  assert.equal(compatibleIntentTiming(dates("2026-09-10", "2026-09-10", "EVENING"), exact, now), null);
  assert.equal(compatibleIntentTiming(exact, exact, now)?.startsAt?.toISOString(), "2026-09-10T08:00:00.000Z");
  assert.equal(compatibleIntentTiming(exact, exact, now)?.overlapMinutes, 60);
  assert.equal(flexiblePreferenceFitsLifecycle(dates("2026-09-14", "2026-09-20").timePreference, "Europe/Berlin", now, expiry), true);
  assert.equal(flexiblePreferenceFitsLifecycle(dates("2026-09-20", "2026-09-14").timePreference, "Europe/Berlin", now, expiry), false);
  assert.equal(flexiblePreferenceFitsLifecycle(dates("2026-09-24").timePreference, "Europe/Berlin", now, expiry), false);
});
