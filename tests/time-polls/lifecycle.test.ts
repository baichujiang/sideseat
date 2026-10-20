import assert from "node:assert/strict";
import { test } from "node:test";
import { timePollExpiresAt, timePollPhase } from "../../lib/time-polls/lifecycle";

const poll = { phase: "INVITING", chosenStart: new Date("2030-10-20T10:00:00Z"), dates: ["2030-10-20"], timeZone: "Europe/Berlin", endMinute: 1020 };

test("unconfirmed invitations expire at the start; confirmed and cancelled facts stay intact", () => {
  assert.equal(timePollPhase(poll, new Date("2030-10-20T09:59:59.999Z")), "INVITING");
  assert.equal(timePollPhase(poll, poll.chosenStart), "EXPIRED");
  for (const phase of ["CONFIRMED", "CANCELLED"]) {
    assert.equal(timePollExpiresAt({ ...poll, phase }), null);
    assert.equal(timePollPhase({ ...poll, phase }, new Date("2030-11-20T00:00:00Z")), phase);
  }
});

test("collection expires only after the last configured window, respecting zone, DST and midnight", () => {
  const collecting = { ...poll, phase: "COLLECTING", chosenStart: null, dates: ["2026-10-25", "2026-10-24"], endMinute: 1440 };
  assert.equal(timePollExpiresAt(collecting)!.toISOString(), "2026-10-25T23:00:00.000Z");
  assert.equal(timePollPhase(collecting, new Date("2026-10-25T22:59:59Z")), "COLLECTING");
  assert.equal(timePollPhase(collecting, new Date("2026-10-25T23:00:00Z")), "EXPIRED");
});

// A set time expires at its start even while the group is still choosing an activity.
test("fixed-time activity collection expires at its chosen start", () => {
  const draft = { ...poll, phase: "COLLECTING" };
  assert.equal(timePollExpiresAt(draft)!.toISOString(), poll.chosenStart.toISOString());
  assert.equal(timePollPhase(draft, new Date(poll.chosenStart.getTime() - 1)), "COLLECTING");
  assert.equal(timePollPhase(draft, poll.chosenStart), "EXPIRED");
});
