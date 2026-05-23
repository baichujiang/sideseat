import assert from "node:assert/strict";

import type { DiscoverActivityStatus } from "@prisma/client";

import {
  canSignup,
  deriveActivityPhase,
  isVisibleInFeed,
  nextStatusAfterCancel,
  nextStatusAfterSignup,
} from "../lib/discover/discover-activity-state";

const now = new Date("2026-06-01T12:00:00Z");
const future = new Date("2026-06-10T12:00:00Z");
const past = new Date("2026-05-01T12:00:00Z");

function activity(overrides: Partial<{
  status: DiscoverActivityStatus;
  startAt: Date;
  capacity: number | null;
  organizerId: string;
  school: string;
}>) {
  return {
    id: "a1",
    organizerId: "org",
    school: "TUM",
    status: "OPEN" as const,
    startAt: future,
    capacity: 2 as number | null,
    ...overrides,
  };
}

assert.equal(deriveActivityPhase(activity({ startAt: past }), now), "expired");
assert.equal(isVisibleInFeed(activity({ startAt: past }), now), false);
assert.equal(isVisibleInFeed(activity({ status: "CLOSED" }), now), false);
assert.equal(isVisibleInFeed(activity({ status: "OPEN" }), now), true);

assert.equal(nextStatusAfterSignup("OPEN", 2, 2), "FULL");
assert.equal(nextStatusAfterCancel("FULL", 1, 2), "OPEN");

const viewer = { userId: "u2", isGuest: false, school: "TUM" };
const signupCtx = {
  ...activity({ capacity: 2 }),
  goingCount: 0,
  viewerSignupStatus: null,
};
assert.deepEqual(canSignup(viewer, signupCtx, now), { ok: true });

const crossSchool = canSignup({ ...viewer, school: "LMU" }, signupCtx, now);
assert.equal(crossSchool.ok, false);
if (!crossSchool.ok) assert.equal(crossSchool.code, "CROSS_SCHOOL");

console.log("discover-activity-state: ok");
