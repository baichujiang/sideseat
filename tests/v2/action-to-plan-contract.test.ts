import assert from "node:assert/strict";
import test from "node:test";

import { productFunnelBatchSchema } from "../../lib/validators/product-funnel";
import { socialGroupResponseSchema } from "../../lib/validators/social-group";
import { socialPreferencesPatchSchema } from "../../lib/validators/social-preferences";
import { stableExperimentVariant } from "../../lib/v2/experiment-bucketing";

const baseEvent = {
  clientEventId: "00000000-0000-4000-8000-000000000001",
  name: "OPPORTUNITY_IMPRESSION",
  surface: "DISCOVER_RECOMMENDED",
  sourceKind: "BUDDY_POST",
  sourceId: "post-1",
  occurredAt: "2026-08-29T18:00:00.000Z",
  metadata: { reasonCodes: ["MATCHES_INTEREST"], visibilityDurationMs: 500 },
};

test("funnel events accept identifiers and reason codes without user content", () => {
  const result = productFunnelBatchSchema.safeParse({ events: [baseEvent] });
  assert.equal(result.success, true);
});

test("funnel events reject text, exact location, and calendar payload fields", () => {
  for (const forbidden of [
    { body: "private post text" },
    { message: "private chat text" },
    { location: "exact private address" },
    { calendarTitle: "medical appointment" },
  ]) {
    const result = productFunnelBatchSchema.safeParse({
      events: [
        { ...baseEvent, metadata: { ...baseEvent.metadata, ...forbidden } },
      ],
    });
    assert.equal(result.success, false);
  }
});

test("client funnel ingestion accepts only impression and open events", () => {
  assert.equal(
    productFunnelBatchSchema.safeParse({
      events: [{ ...baseEvent, name: "OPPORTUNITY_OPEN" }],
    }).success,
    true,
  );

  for (const name of ["PLAN_ACCEPTED", "PLAN_SAFETY_TERMINATED"]) {
    const result = productFunnelBatchSchema.safeParse({
      events: [{ ...baseEvent, name }],
    });
    assert.equal(result.success, false, name);
  }
});

test("social preferences require valid unique declared availability windows", () => {
  const valid = {
    topics: ["COFFEE", "STUDY"],
    meetingPreference: "BOTH",
    weeklyWindows: [{ weekday: 1, startMinutes: 540, endMinutes: 720 }],
    timeZone: "Europe/Berlin",
  };
  assert.equal(socialPreferencesPatchSchema.safeParse(valid).success, true);
  assert.equal(
    socialPreferencesPatchSchema.safeParse({
      ...valid,
      weeklyWindows: [valid.weeklyWindows[0], valid.weeklyWindows[0]],
    }).success,
    false,
  );
  assert.equal(
    socialPreferencesPatchSchema.safeParse({ ...valid, timeZone: "not/a-zone" })
      .success,
    false,
  );
});

test("small-group candidate responses are limited to explicit pilot states", () => {
  for (const status of ["INTERESTED", "DECLINED", "WITHDRAWN"]) {
    assert.equal(socialGroupResponseSchema.safeParse({ status }).success, true);
  }
  assert.equal(
    socialGroupResponseSchema.safeParse({ status: "CONFIRMED" }).success,
    false,
  );
});

test("experiment bucketing is stable and separates at least two users", () => {
  const experiment = "action_to_plan_v2";
  const users = Array.from({ length: 32 }, (_, index) => `user-${index}`);
  const first = users.map((user) => stableExperimentVariant(user, experiment));
  const second = users.map((user) => stableExperimentVariant(user, experiment));
  assert.deepEqual(second, first);
  assert.equal(new Set(first).has("CONTROL"), true);
  assert.equal(new Set(first).has("TREATMENT"), true);
});
