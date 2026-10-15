import assert from "node:assert/strict";
import test from "node:test";
import { SocialIntentTopic, SportTag } from "@prisma/client";
import { isInternalAccount } from "../../lib/analytics/layer2-outcome-pilot";
import { classifyActivityMatch } from "../../lib/v2/mutual-opportunity-activity-compatibility";
import { weeklyIntentCreateSchema } from "../../lib/validators/weekly-intent";
import {
  TOGETHER_DEMO_CASES,
  demoBatch,
  demoIntentInput,
} from "../../scripts/lib/together-demo-catalog";

test("demo catalog covers all six topics and all fifteen sports without exceeding batch quotas", () => {
  assert.deepEqual(
    new Set(TOGETHER_DEMO_CASES.map((item) => item.topic)),
    new Set(Object.values(SocialIntentTopic)),
  );
  assert.deepEqual(
    new Set(
      TOGETHER_DEMO_CASES.flatMap((item) =>
        item.sportTag ? [item.sportTag] : [],
      ),
    ),
    new Set(Object.values(SportTag)),
  );
  assert.equal(TOGETHER_DEMO_CASES.length, 20);
  assert.equal(demoBatch("categories").length, 6);
  assert.equal(
    new Set(demoBatch("categories").map((item) => item.topic)).size,
    6,
  );
  assert.equal(demoBatch("sports-a").length, 8);
  assert.equal(demoBatch("sports-b").length, 7);
});

test("every fixture passes the real API input contract, has an exact activity peer and is QA-excluded", () => {
  const window = {
    startAt: "2026-09-09T16:00:00.000Z",
    endAt: "2026-09-09T18:00:00.000Z",
  };
  for (const item of TOGETHER_DEMO_CASES) {
    const input = weeklyIntentCreateSchema.parse(
      demoIntentInput(item, "qa-course", window, "catalog"),
    );
    assert.equal(input.courseId, "qa-course");
    assert.ok(input.note?.startsWith("QA-DEMO:catalog:"));
    assert.ok(isInternalAccount(`qa_mutual_demo_catalog_${item.key}`));
    const activity = {
      topic: input.topic,
      sportTag: input.sportTag ?? null,
      sportOtherNote: input.sportOtherNote ?? null,
      activityText: input.activityText ?? null,
      studyGoal: input.studyGoal ?? null,
      togetherMode: input.togetherMode ?? null,
    };
    assert.equal(
      classifyActivityMatch(activity, activity, true)?.matchKind,
      "EXACT_ACTIVITY",
    );
  }
});
