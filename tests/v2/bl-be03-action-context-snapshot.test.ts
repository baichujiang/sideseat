import assert from "node:assert/strict";
import test from "node:test";

import {
  actionContextTombstoneSnapshot,
  parseActionContextSnapshot,
  parseActionOriginSnapshot,
} from "../../lib/v2/action-context-snapshot";

function validSnapshot(): Record<string, unknown> {
  return {
    version: 1,
    sourceKind: "COURSE_ACTION",
    sourceId: "action-1",
    title: "Review algorithms",
    startsAt: "2026-09-01T10:00:00.000Z",
    endsAt: "2026-09-01T11:00:00+00:00",
    location: "Library",
    planType: "STUDY",
    participantIds: ["responder-1", "creator-1"],
    author: { id: "creator-1", displayName: "Creator" },
    course: { id: "course-1", code: "IN001", name: "Algorithms" },
  };
}

test("the immutable Action context parser accepts only the complete wire shape", () => {
  assert.deepEqual(parseActionContextSnapshot(validSnapshot()), validSnapshot());

  const missingTitle = validSnapshot();
  delete missingTitle.title;
  assert.equal(parseActionContextSnapshot(missingTitle), null);
  assert.equal(
    parseActionContextSnapshot({ ...validSnapshot(), unexpected: true }),
    null,
  );
  assert.equal(
    parseActionContextSnapshot({ ...validSnapshot(), startsAt: "tomorrow" }),
    null,
  );
  assert.equal(
    parseActionContextSnapshot({
      ...validSnapshot(),
      startsAt: "2026-02-31T10:00:00.000Z",
    }),
    null,
  );
  assert.equal(
    parseActionContextSnapshot({ ...validSnapshot(), planType: "DINNER" }),
    null,
  );
  assert.equal(
    parseActionContextSnapshot({
      ...validSnapshot(),
      author: { id: "creator-1" },
    }),
    null,
  );
  assert.equal(
    parseActionContextSnapshot({
      ...validSnapshot(),
      course: { id: "course-1", code: null },
    }),
    null,
  );
});

test("nullable scheduling fields remain valid without weakening their types", () => {
  assert.ok(
    parseActionContextSnapshot({
      ...validSnapshot(),
      startsAt: null,
      endsAt: null,
      location: null,
      course: null,
    }),
  );
  assert.equal(
    parseActionContextSnapshot({ ...validSnapshot(), participantIds: ["one"] }),
    null,
  );
  assert.equal(
    parseActionContextSnapshot({
      ...validSnapshot(),
      course: { id: "course-1", code: 42, name: "Algorithms" },
    }),
    null,
  );
});

test("privacy tombstones form a strict discriminated union without live fields", () => {
  const tombstone = actionContextTombstoneSnapshot({
    sourceKind: "COURSE_ACTION",
    sourceId: "action-1",
  });
  assert.deepEqual(parseActionOriginSnapshot(tombstone), {
    kind: "TOMBSTONE",
    snapshot: tombstone,
  });
  assert.equal(parseActionContextSnapshot(tombstone), null);
  assert.equal(
    parseActionOriginSnapshot({ ...tombstone, title: "must not survive" }),
    null,
  );
  assert.deepEqual(parseActionOriginSnapshot(validSnapshot()), {
    kind: "LIVE",
    snapshot: validSnapshot(),
  });
});
