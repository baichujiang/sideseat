import assert from "node:assert/strict";
import test from "node:test";
import { discoveryFit } from "../../lib/v2/discovery-fit";
import { activityFitProjection } from "../../lib/v2/activity-fit";

const now = new Date("2026-09-09T10:00:00Z");
const coffee = {
  topic: "COFFEE" as const, activityText: "Coffee", sportTag: null, sportOtherNote: null,
  togetherMode: "SAME_ACTIVITY" as const, studyGoal: null, courseId: null,
  timePreference: { kind: "EXACT" }, timeZone: "Europe/Berlin",
  timeWindows: [{ startAt: "2026-09-10T10:00:00Z", endAt: "2026-09-10T11:00:00Z" }],
  expiresAt: new Date("2026-09-23T10:00:00Z"),
  user: { school: "TUM", userLanguages: [{ tag: "ENGLISH" }] },
};
test("zero-relevance discovery remains deliverable without inventing any agreement", () => {
  const sport = { ...coffee, topic: "SPORTS" as const, activityText: null, sportTag: "BASKETBALL" as const,
    timeWindows: [{ startAt: "2026-09-11T10:00:00Z", endAt: "2026-09-11T11:00:00Z" }],
    user: { school: "LMU", userLanguages: [{ tag: "CHINESE" }] } };
  const low = discoveryFit(coffee, sport, now);
  const high = discoveryFit(coffee, coffee, now);
  assert.equal(low.snapshot.score, 0);
  assert.equal(high.snapshot.score, 100);
  assert.deepEqual(low.snapshot.differences, ["ACTIVITY", "TIME", "LANGUAGE", "SCHOOL"]);
  assert.equal(low.timing.startsAt, null);
  assert.equal(low.timing.endsAt, null);
  assert.equal(low.timing.overlapMinutes, null);
  const a = activityFitProjection({ activityFit: low.snapshot }, true)!;
  const b = activityFitProjection({ activityFit: low.snapshot }, false)!;
  assert.equal(a.score, b.score);
  assert.ok("viewerActivity" in a && "peerActivity" in b);
  assert.deepEqual(a.viewerActivity, b.peerActivity);
  assert.equal(JSON.stringify(a).includes("intentAActivity"), false);
});
test("unknown timing is explained, not reported as a conflict or claimed availability", () => {
  const result = discoveryFit(coffee, { ...coffee, timePreference: { kind: "UNDECIDED" }, timeWindows: [] }, now);
  assert.equal(result.snapshot.timePoints, 0);
  assert.deepEqual(result.snapshot.differences, ["TIME_UNDECIDED"]);
  assert.equal(result.timing.startsAt, null);
});
test("pre-concrete intentions do not receive invented exact-activity points", () => {
  const legacy = { ...coffee, activityText: null };
  const result = discoveryFit(legacy, legacy, now);
  assert.equal(result.snapshot.activityPoints, 10, "only the shared category is known");
  assert.equal(result.snapshot.basis, "DIFFERENT_ACTIVITY");
});
test("sports and strict study differences are suggestions, not exact matches", () => {
  const basketball = { ...coffee, topic: "SPORTS" as const, activityText: null, sportTag: "BASKETBALL" as const };
  const badminton = { ...basketball, sportTag: "BADMINTON" as const };
  assert.equal(discoveryFit(basketball, badminton, now).snapshot.basis, "DIFFERENT_ACTIVITY");
  const study = { ...coffee, topic: "STUDY" as const, activityText: null, studyGoal: "Math", courseId: "first-course" };
  const result = discoveryFit(study, { ...study, studyGoal: "History", courseId: "second-course" }, now);
  assert.equal(result.classification.sharedContext, null);
  assert.deepEqual(result.snapshot.differences, ["ACTIVITY", "COURSE"]);
});
