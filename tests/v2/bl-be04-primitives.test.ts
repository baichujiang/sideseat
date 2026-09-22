import assert from "node:assert/strict";
import test from "node:test";

import {
  canonicalPair,
  canonicalPairResourceId,
  pairSafetyLockKey,
  stableCanonicalPairs,
  stableLockIds,
} from "../../lib/v2/action-coordination/db-locks";
import {
  buildActionCoordinationCommandIdentity,
  canonicalActionCoordinationJson,
  fixedActionCoordinationClock,
  type ActionCoordinationCommandRequest,
} from "../../lib/v2/action-coordination/command";
import type {
  RouteFocusDTO,
  RouteRecoveryDTO,
} from "../../lib/v2/action-coordination/dto";
import {
  ActionCoordinationConflict,
  safetyUnavailable,
} from "../../lib/v2/action-coordination/errors";
import {
  actionCoordinationConflictResult,
  actionCoordinationFailureResult,
} from "../../lib/v2/action-coordination/route-adapter";

test("canonical pairs are unordered, unambiguous, and stable for non-ASCII IDs", () => {
  const forward = canonicalPair("user-z", "user-a");
  const reverse = canonicalPair("user-a", "user-z");
  assert.deepEqual(forward, reverse);
  assert.deepEqual(forward, { minUserId: "user-a", maxUserId: "user-z" });
  assert.equal(
    canonicalPairResourceId(forward),
    canonicalPairResourceId(reverse),
  );
  assert.equal(pairSafetyLockKey(forward), pairSafetyLockKey(reverse));

  // A delimiter-only encoding would alias both pairs. Length-prefixed material
  // must preserve their different canonical identities.
  const splitAfterTwo = canonicalPair("ab", "c");
  const splitAfterOne = canonicalPair("a", "bc");
  assert.notEqual(
    canonicalPairResourceId(splitAfterTwo),
    canonicalPairResourceId(splitAfterOne),
  );
  assert.notEqual(pairSafetyLockKey(splitAfterTwo), pairSafetyLockKey(splitAfterOne));

  const unicodeForward = canonicalPair("用户-🧪", "user-ä");
  const unicodeReverse = canonicalPair("user-ä", "用户-🧪");
  assert.deepEqual(unicodeForward, unicodeReverse);

  assert.throws(() => canonicalPair("same", "same"), /two different users/i);
  assert.throws(() => canonicalPair("", "other"), /non-empty user ID/i);
});

test("bulk lock helpers deduplicate and use a deterministic byte order", () => {
  assert.deepEqual(stableLockIds(["z", "a", "z", "ä"]), ["a", "z", "ä"]);
  assert.deepEqual(
    stableCanonicalPairs([
      ["z", "a"],
      ["a", "z"],
      { firstUserId: "c", secondUserId: "b" },
    ]),
    [
      { minUserId: "a", maxUserId: "z" },
      { minUserId: "b", maxUserId: "c" },
    ],
  );
});

const baseCommandRequest: ActionCoordinationCommandRequest = {
  actorId: "actor-a",
  idempotencyKey: "gesture-key-0001",
  operation: {
    method: "POST",
    operationId: "createActionInterest",
  },
  canonicalResource: { kind: "ACTION", id: "action-1" },
  pathParameters: { actionId: "action-1" },
  query: { surface: "feed", page: 1 },
  body: { nested: { two: 2, one: 1 }, values: [true, null, "three"] },
};

test("command receipts isolate actor, operation, resource, and gesture key", () => {
  const base = buildActionCoordinationCommandIdentity(baseCommandRequest);
  const variants: ActionCoordinationCommandRequest[] = [
    { ...baseCommandRequest, actorId: "actor-b" },
    {
      ...baseCommandRequest,
      operation: { method: "DELETE", operationId: "withdrawActionInterest" },
    },
    {
      ...baseCommandRequest,
      canonicalResource: { kind: "ACTION", id: "action-2" },
    },
    { ...baseCommandRequest, idempotencyKey: "gesture-key-0002" },
  ];

  for (const variant of variants) {
    const identity = buildActionCoordinationCommandIdentity(variant);
    assert.notEqual(identity.recordId, base.recordId);
  }

  // Length-scoped namespace parts cannot alias if a delimiter appears in an ID.
  const delimiterA = buildActionCoordinationCommandIdentity({
    ...baseCommandRequest,
    operation: { method: "POST", operationId: "op|4:value" },
    canonicalResource: { kind: "kind", id: "resource" },
  });
  const delimiterB = buildActionCoordinationCommandIdentity({
    ...baseCommandRequest,
    operation: { method: "POST", operationId: "op" },
    canonicalResource: { kind: "4:value|kind", id: "resource" },
  });
  assert.notEqual(delimiterA.scope, delimiterB.scope);
  assert.notEqual(delimiterA.recordId, delimiterB.recordId);
});

test("fingerprints include canonical path, query, resource, and body", () => {
  const base = buildActionCoordinationCommandIdentity(baseCommandRequest);
  const reordered = buildActionCoordinationCommandIdentity({
    ...baseCommandRequest,
    pathParameters: { actionId: "action-1" },
    query: { page: 1, surface: "feed" },
    body: { values: [true, null, "three"], nested: { one: 1, two: 2 } },
  });
  assert.equal(reordered.requestHash, base.requestHash);
  assert.equal(reordered.recordId, base.recordId);

  const fingerprintVariants: ActionCoordinationCommandRequest[] = [
    { ...baseCommandRequest, pathParameters: { actionId: "action-else" } },
    { ...baseCommandRequest, query: { surface: "detail", page: 1 } },
    { ...baseCommandRequest, body: { nested: { one: 9, two: 2 } } },
    {
      ...baseCommandRequest,
      canonicalResource: { kind: "ACTION", id: "action-else" },
    },
  ];
  for (const variant of fingerprintVariants) {
    assert.notEqual(
      buildActionCoordinationCommandIdentity(variant).requestHash,
      base.requestHash,
    );
  }

  assert.equal(
    canonicalActionCoordinationJson({ z: 1, a: { y: 2, x: 3 } }),
    '{"a":{"x":3,"y":2},"z":1}',
  );
  assert.throws(
    () => canonicalActionCoordinationJson({ invalid: undefined }),
    /not normalized JSON/i,
  );
  assert.throws(
    () => canonicalActionCoordinationJson({ invalid: new Date() }),
    /non-JSON object/i,
  );
});

test("fixed clock is deterministic and returns defensive Date instances", async () => {
  const clock = fixedActionCoordinationClock("2026-08-30T12:34:56.789Z");
  const transactionIsUnusedByFixedClock = {} as never;
  const first = await clock.now(transactionIsUnusedByFixedClock);
  first.setUTCFullYear(2035);
  const second = await clock.now(transactionIsUnusedByFixedClock);

  assert.equal(second.toISOString(), "2026-08-30T12:34:56.789Z");
  assert.notEqual(first, second);
  assert.throws(
    () => fixedActionCoordinationClock("not-a-timestamp"),
    /valid timestamp/i,
  );
});

test("all six RouteFocus variants keep exact discriminator-specific shapes", () => {
  const cases: RouteFocusDTO[] = [
    { type: "ACTION_RESPONSES", actionId: "action-1", interestId: "interest-1" },
    { type: "INTEREST", interestId: "interest-1" },
    {
      type: "COORDINATION_SHELL",
      interestId: "interest-1",
      reservationId: "reservation-1",
    },
    {
      type: "ACTION_CONTEXT",
      connectionId: "connection-1",
      contextId: "context-1",
    },
    {
      type: "MESSAGE",
      connectionId: "connection-1",
      messageId: "message-1",
    },
    {
      type: "PLAN",
      connectionId: "connection-1",
      commitmentId: "commitment-1",
      revisionId: "revision-1",
    },
  ];

  assert.equal(new Set(cases.map((focus) => focus.type)).size, 6);
  for (const focus of cases) {
    assert.deepEqual(JSON.parse(JSON.stringify(focus)), focus);
  }

  // The recovery union couples the action with the only legal focus variant.
  const invalidRecovery: RouteRecoveryDTO = {
    action: "OPEN_PLAN",
    // @ts-expect-error OPEN_PLAN may not recover to an Interest focus.
    focus: { type: "INTEREST", interestId: "interest-1" },
  };
  assert.ok(invalidRecovery);
});

test("409 conflicts preserve authoritative state and the typed recovery pair", () => {
  const recoveries: RouteRecoveryDTO[] = [
    {
      action: "OPEN_PLAN",
      focus: {
        type: "PLAN",
        connectionId: "connection-1",
        commitmentId: "commitment-1",
        revisionId: "revision-1",
      },
    },
    {
      action: "REACTIVATE_INTEREST",
      focus: { type: "INTEREST", interestId: "interest-1" },
    },
  ];

  for (const recovery of recoveries) {
    const conflict = new ActionCoordinationConflict(
      recovery.action === "OPEN_PLAN"
        ? "CONTEXT_PLAN_PENDING"
        : "INTEREST_NOT_ACTIVE",
      "Authoritative state changed.",
      { state: "CURRENT", version: 7 },
      recovery,
    );
    const result = actionCoordinationConflictResult(conflict);
    assert.equal(result.status, 409);
    assert.deepEqual(result.body.currentState, { state: "CURRENT", version: 7 });
    assert.deepEqual(result.body.recovery, recovery);
    assert.equal(result.body.error.retryable, false);
  }
});

test("safety-unavailable mapping cannot serialize Block or moderation details", () => {
  const failure = safetyUnavailable(404);
  assert.throws(
    () => Object.defineProperty(failure, "message", { value: "Blocked by user X" }),
    TypeError,
  );
  const result = actionCoordinationFailureResult(failure);
  assert.deepEqual(result, {
    status: 404,
    body: {
      error: {
        code: "SAFETY_UNAVAILABLE",
        message: "The requested coordination is unavailable.",
        retryable: false,
      },
    },
  });
  assert.doesNotMatch(JSON.stringify(result), /block|moderation|actor/i);
});

test("RouteFocus serialization strips structural extra fields", () => {
  const focusWithInternalFields = {
    type: "PLAN" as const,
    connectionId: "connection-1",
    commitmentId: "commitment-1",
    safetyBlockId: "must-not-leak",
    blockReason: "must-not-leak",
  };
  const conflict = new ActionCoordinationConflict(
    "CONTEXT_PLAN_PENDING",
    "An actionable Plan already exists.",
    { coordinationState: "OPEN" },
    { action: "OPEN_PLAN", focus: focusWithInternalFields },
  );
  const result = actionCoordinationConflictResult(conflict);

  assert.deepEqual(result.body.recovery, {
    action: "OPEN_PLAN",
    focus: {
      type: "PLAN",
      connectionId: "connection-1",
      commitmentId: "commitment-1",
    },
  });
  assert.doesNotMatch(JSON.stringify(result), /must-not-leak|blockReason/i);
});
