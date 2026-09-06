import assert from "node:assert/strict";
import test from "node:test";

import { projectActionPolicyFields } from "../../lib/v2/action-coordination/action-fields";

test("DIRECT policy preserves legacy course, reply, and capacity semantics", () => {
  const fields = projectActionPolicyFields({
    policy: "DIRECT_CONVERSATION_V1",
    category: "SHARED_COURSES",
    courseIds: ["course-a", "course-b"],
    replyPreference: "DIRECT_MESSAGE",
    capacity: 8,
  });

  assert.equal(fields.courseSelectionValid, true);
  assert.deepEqual(fields.courseIds, ["course-a", "course-b"]);
  assert.equal(fields.replyPreference, "DIRECT_MESSAGE");
  assert.equal(fields.capacity, 8);
});

test("creator-gated Course Actions require exactly one unique course", () => {
  const none = projectActionPolicyFields({
    policy: "CREATOR_GATED_V2",
    category: "SHARED_COURSES",
    courseIds: [],
    replyPreference: "DIRECT_MESSAGE",
    capacity: 20,
  });
  const many = projectActionPolicyFields({
    policy: "CREATOR_GATED_V2",
    category: "SHARED_COURSES",
    courseIds: ["course-a", "course-b"],
    replyPreference: "VERIFIED_ONLY",
    capacity: 4,
  });
  const oneUnique = projectActionPolicyFields({
    policy: "CREATOR_GATED_V2",
    category: "SHARED_COURSES",
    courseIds: ["course-a", "course-a"],
    replyPreference: "DIRECT_MESSAGE",
    capacity: 12,
  });

  assert.equal(none.courseSelectionValid, false);
  assert.equal(many.courseSelectionValid, false);
  assert.equal(oneUnique.courseSelectionValid, true);
  assert.deepEqual(oneUnique.courseIds, ["course-a"]);
});

test("creator-gated Actions neutralize legacy parallel-response fields", () => {
  const fields = projectActionPolicyFields({
    policy: "CREATOR_GATED_V2",
    category: "MEALS",
    courseIds: [],
    replyPreference: "DIRECT_MESSAGE",
    capacity: 50,
  });

  assert.equal(fields.courseSelectionValid, true);
  assert.equal(fields.replyPreference, "REQUEST_FIRST");
  assert.equal(fields.capacity, null);
});
