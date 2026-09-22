import assert from "node:assert/strict";
import test from "node:test";

import { ClassmatePostStatus } from "@prisma/client";

import {
  classmatePostStatusAfterAuthorClose,
  getBuddyRequestDisplayStatus,
} from "../../lib/discover/buddy-request-status";

test("author close never rewrites terminal Action states", () => {
  assert.equal(
    classmatePostStatusAfterAuthorClose(ClassmatePostStatus.ACTIVE),
    ClassmatePostStatus.CLOSED,
  );
  for (const status of [
    ClassmatePostStatus.CLOSED,
    ClassmatePostStatus.EXPIRED,
    ClassmatePostStatus.FULFILLED,
    ClassmatePostStatus.REMOVED,
  ]) {
    assert.equal(classmatePostStatusAfterAuthorClose(status), status);
  }
});

test("terminal Actions remain closed for legacy display without changing storage", () => {
  const now = new Date("2026-08-30T12:00:00.000Z");
  for (const status of [
    ClassmatePostStatus.FULFILLED,
    ClassmatePostStatus.REMOVED,
  ]) {
    assert.equal(
      getBuddyRequestDisplayStatus({
        status,
        expiresAt: new Date("2026-08-31T12:00:00.000Z"),
        now,
      }),
      "closed",
    );
  }
});
