import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import Module from "node:module";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { PrismaClient } from "@prisma/client";

import {
  creatorGatedPolicySnapshot,
  evaluateActionCoordinationCapability,
} from "../../lib/v2/action-coordination/capability";
import { fixedActionCoordinationClock } from "../../lib/v2/action-coordination/command";
import { CREATOR_GATED_ACTION_EXPERIMENT_KEY } from "../../lib/v2/action-coordination/policy-snapshot";

type CommonJsModuleResolver = typeof Module & {
  _resolveFilename: (
    request: string,
    parent: unknown,
    isMain: boolean,
    options?: unknown,
  ) => string;
};

const commonJsModule = Module as CommonJsModuleResolver;
const resolveFilename = commonJsModule._resolveFilename;
const serverOnlyStub = fileURLToPath(
  new URL("./server-only-test-stub.cjs", import.meta.url),
);
commonJsModule._resolveFilename = function resolveForServerContractTest(
  request,
  parent,
  isMain,
  options,
) {
  if (request === "server-only") return serverOnlyStub;
  return resolveFilename.call(this, request, parent, isMain, options);
};

const localDatabaseUrl = localPostgresUrl(process.env.DATABASE_URL);
const transactionOptions = { maxWait: 10_000, timeout: 30_000 } as const;
const baseNow = new Date("2026-09-01T10:00:00.000Z");
const capableClient = evaluateActionCoordinationCapability(
  new Headers({
    "x-sideseat-platform": "ios",
    "x-sideseat-app-version": "2.0",
    "x-sideseat-build": "200",
    "x-sideseat-capabilities": "action-coordination-v2",
  }),
  { minimumAppVersion: "1.0", minimumBuild: "1" },
);

test("BL-PLAN PostgreSQL tests refuse non-local database targets", () => {
  assert.equal(
    localPostgresUrl("postgresql://user:password@example.invalid/database"),
    undefined,
  );
  assert.equal(
    localPostgresUrl("postgresql://user:password@127.0.0.1:5433/database"),
    "postgresql://user:password@127.0.0.1:5433/database",
  );
});

test(
  "counter preserves one INITIAL negotiation and accept fulfills once with exactly two projections",
  { skip: localDatabaseUrl ? false : "requires localhost PostgreSQL" },
  async () => {
    const plans = await import(
      "../../lib/v2/action-coordination/plan-service"
    );
    await withFixture(async (fixture) => {
      await seedActionGraph(fixture, {
        first: "OPEN",
        second: "OPEN",
        third: "WAITING",
        fourth: "INITIATING",
      });
      const created = await fixture.track(
        plans.createActionPlan({
          actorId: fixture.creatorId,
          contextId: fixture.contextIds[0]!,
          idempotencyKey: "bl-plan-create-first",
          input: planInput("First lunch"),
          dependencies: fixture.dependencies(fixture.db[0], baseNow),
        }),
      );
      assert.equal(created.status, 201);
      const initial = successfulPlan(created);

      const countered = await fixture.track(
        plans.counterActionPlan({
          actorId: fixture.responderIds[0]!,
          revisionId: initial.revisionId,
          idempotencyKey: "bl-plan-counter-first",
          input: planInput("Lunch a little later", 14),
          dependencies: fixture.dependencies(fixture.db[0], baseNow),
        }),
      );
      assert.equal(countered.status, 201);
      const counter = successfulPlan(countered);
      assert.equal(counter.commitmentId, initial.commitmentId);

      const chain = await fixture.db[0].planRequest.findMany({
        where: { commitmentId: initial.commitmentId },
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          status: true,
          revisionKind: true,
          counterOfId: true,
          originActionId: true,
          originContextId: true,
        },
      });
      assert.deepEqual(
        chain.map((row) => [
          row.status,
          row.revisionKind,
          row.counterOfId,
          row.originActionId,
          row.originContextId,
        ]),
        [
          [
            "COUNTER_PROPOSED",
            "INITIAL",
            null,
            fixture.actionId,
            fixture.contextIds[0],
          ],
          [
            "PENDING",
            "INITIAL",
            initial.revisionId,
            fixture.actionId,
            fixture.contextIds[0],
          ],
        ],
      );
      assert.equal(
        await fixture.db[0].planRequest.count({
          where: { originActionId: fixture.actionId, status: "PENDING" },
        }),
        1,
      );

      const accepted = await fixture.track(
        plans.acceptActionPlan({
          actorId: fixture.creatorId,
          revisionId: counter.revisionId,
          idempotencyKey: "bl-plan-accept-counter",
          dependencies: fixture.dependencies(fixture.db[0], baseNow),
        }),
      );
      assert.equal(accepted.status, 200);
      assert.equal(successfulPlan(accepted).commitmentStatus, "CONFIRMED");

      const [action, commitment, projections, contexts, activations] =
        await Promise.all([
          fixture.db[0].classmatePost.findUniqueOrThrow({
            where: { id: fixture.actionId },
            select: { status: true, fulfilledByPlanId: true },
          }),
          fixture.db[0].planCommitment.findUniqueOrThrow({
            where: { id: initial.commitmentId },
            select: {
              status: true,
              currentAcceptedRevisionId: true,
              currentPendingRevisionId: true,
            },
          }),
          fixture.db[0].calendarEntry.findMany({
            where: { planCommitmentId: initial.commitmentId },
            select: { userId: true, projectionStatus: true },
            orderBy: { userId: "asc" },
          }),
          fixture.db[0].actionCoordinationContext.findMany({
            where: { interest: { classmatePostId: fixture.actionId } },
            select: { id: true, state: true, endReason: true, reservationId: true },
            orderBy: { id: "asc" },
          }),
          fixture.db[0].actionInterestActivation.findMany({
            where: { interest: { classmatePostId: fixture.actionId } },
            select: { id: true, connectedAt: true, terminalReason: true },
            orderBy: { id: "asc" },
          }),
        ]);
      assert.deepEqual(action, {
        status: "FULFILLED",
        fulfilledByPlanId: initial.commitmentId,
      });
      assert.deepEqual(commitment, {
        status: "CONFIRMED",
        currentAcceptedRevisionId: counter.revisionId,
        currentPendingRevisionId: null,
      });
      assert.deepEqual(
        projections,
        [fixture.creatorId, fixture.responderIds[0]!]
          .sort()
          .map((userId) => ({ userId, projectionStatus: "ACTIVE" })),
      );
      assert.deepEqual(
        contexts.map((row) => [row.id, row.state, row.endReason, row.reservationId]),
        [
          [fixture.contextIds[0], "ENDED", "PLAN_CONFIRMED", null],
          [fixture.contextIds[1], "ENDED", "SOURCE_FULFILLED", null],
          [fixture.contextIds[2], "UNAVAILABLE", null, null],
          [fixture.contextIds[3], "UNAVAILABLE", null, null],
        ].sort((left, right) => String(left[0]).localeCompare(String(right[0]))),
      );
      const activationById = new Map(
        activations.map((activation) => [activation.id, activation]),
      );
      assert.equal(
        activationById.get(fixture.activationIds[0]!)?.terminalReason,
        null,
      );
      assert.equal(
        activationById.get(fixture.activationIds[1]!)?.terminalReason,
        null,
      );
      assert.equal(
        activationById.get(fixture.activationIds[2]!)?.terminalReason,
        "ACTION_FULFILLED_BEFORE_CONNECT",
      );
      assert.equal(
        activationById.get(fixture.activationIds[3]!)?.terminalReason,
        "ACTION_FULFILLED_BEFORE_CONNECT",
      );
      assert.equal(
        await fixture.db[0].productFunnelEvent.count({
          where: {
            actionContextId: fixture.contextIds[0],
            name: "FIRST_HUMAN_RESPONSE",
          },
        }),
        1,
      );
      assert.equal(
        await fixture.db[0].notificationOutbox.count({
          where: {
            recipientId: { in: fixture.responderIds.slice(1) },
            kind: { in: ["PLAN_ACCEPTED", "COORDINATION_ENDED"] },
          },
        }),
        0,
      );
      assert.equal(
        (
          await fixture.db[0].connection.findUniqueOrThrow({
            where: { id: fixture.connectionIds[1] },
            select: { status: true },
          })
        ).status,
        "ACTIVE",
      );
    });
  },
);

test(
  "decline and proposer withdrawal close an INITIAL negotiation without ending its OPEN Context",
  { skip: localDatabaseUrl ? false : "requires localhost PostgreSQL" },
  async () => {
    const plans = await import(
      "../../lib/v2/action-coordination/plan-service"
    );
    await withFixture(async (fixture) => {
      await seedActionGraph(fixture, { first: "OPEN" });
      const first = successfulPlan(
        await fixture.track(
          plans.createActionPlan({
            actorId: fixture.creatorId,
            contextId: fixture.contextIds[0]!,
            idempotencyKey: "bl-plan-decline-create",
            input: planInput("Decline me"),
            dependencies: fixture.dependencies(fixture.db[0], baseNow),
          }),
        ),
      );
      const declined = await fixture.track(
        plans.declineActionPlan({
          actorId: fixture.responderIds[0]!,
          revisionId: first.revisionId,
          idempotencyKey: "bl-plan-decline",
          dependencies: fixture.dependencies(fixture.db[0], baseNow),
        }),
      );
      assert.deepEqual(
        [declined.status, successfulPlan(declined).commitmentStatus],
        [200, "CLOSED"],
      );
      assert.ok(
        (
          await fixture.db[0].connection.findUniqueOrThrow({
            where: { id: fixture.connectionIds[0] },
            select: { replyLimitUnlockedAt: true },
          })
        ).replyLimitUnlockedAt,
      );

      const second = successfulPlan(
        await fixture.track(
          plans.createActionPlan({
            actorId: fixture.creatorId,
            contextId: fixture.contextIds[0]!,
            idempotencyKey: "bl-plan-withdraw-create",
            input: planInput("Withdraw me", 15),
            dependencies: fixture.dependencies(fixture.db[0], baseNow),
          }),
        ),
      );
      const proposalCard = await fixture.db[0].message.findFirstOrThrow({
        where: {
          connectionId: fixture.connectionIds[0],
          senderId: fixture.creatorId,
          planRequestId: second.revisionId,
          type: "PLAN_REQUEST_CARD",
        },
        select: { id: true },
      });
      const [messageCountBefore, replyGateBefore, realtimeCountBefore] =
        await Promise.all([
          fixture.db[0].message.count({
            where: { connectionId: fixture.connectionIds[0] },
          }),
          fixture.db[0].connection.findUniqueOrThrow({
            where: { id: fixture.connectionIds[0] },
            select: { replyLimitUnlockedAt: true },
          }),
          fixture.db[0].chatRealtimeEvent.count({
            where: {
              conversationKind: "DIRECT",
              conversationId: fixture.connectionIds[0],
              messageId: proposalCard.id,
            },
          }),
        ]);
      const withdrawn = await fixture.track(
        plans.withdrawActionPlan({
          actorId: fixture.creatorId,
          revisionId: second.revisionId,
          idempotencyKey: "bl-plan-withdraw",
          dependencies: fixture.dependencies(fixture.db[0], baseNow),
        }),
      );
      assert.deepEqual(
        [withdrawn.status, successfulPlan(withdrawn).revisionStatus],
        [200, "CANCELED"],
      );
      const [proposalAfter, messageCountAfter, replyGateAfter, realtimeAfter] =
        await Promise.all([
          fixture.db[0].message.findUniqueOrThrow({
            where: { id: proposalCard.id },
            select: {
              id: true,
              planRequest: { select: { status: true } },
            },
          }),
          fixture.db[0].message.count({
            where: { connectionId: fixture.connectionIds[0] },
          }),
          fixture.db[0].connection.findUniqueOrThrow({
            where: { id: fixture.connectionIds[0] },
            select: { replyLimitUnlockedAt: true },
          }),
          fixture.db[0].chatRealtimeEvent.findMany({
            where: {
              conversationKind: "DIRECT",
              conversationId: fixture.connectionIds[0],
              messageId: proposalCard.id,
            },
            select: { eventType: true },
            orderBy: { sequence: "asc" },
          }),
        ]);
      assert.deepEqual(proposalAfter, {
        id: proposalCard.id,
        planRequest: { status: "CANCELED" },
      });
      assert.equal(messageCountAfter, messageCountBefore);
      assert.deepEqual(replyGateAfter, replyGateBefore);
      assert.equal(realtimeAfter.length, realtimeCountBefore + 1);
      assert.equal(realtimeAfter.at(-1)?.eventType, "UPSERT");
      assert.deepEqual(
        await fixture.db[0].actionCoordinationContext.findUniqueOrThrow({
          where: { id: fixture.contextIds[0] },
          select: { state: true, endReason: true },
        }),
        { state: "OPEN", endReason: null },
      );
      assert.equal(
        await fixture.db[0].planRequest.count({
          where: { originActionId: fixture.actionId, status: "PENDING" },
        }),
        0,
      );
    });
  },
);

test(
  "concurrent INITIAL acceptance has one winner and cannot duplicate Calendar projections",
  { skip: localDatabaseUrl ? false : "requires localhost PostgreSQL" },
  async () => {
    const plans = await import(
      "../../lib/v2/action-coordination/plan-service"
    );
    await withFixture(async (fixture) => {
      await seedActionGraph(fixture, { first: "OPEN" });
      const pending = successfulPlan(
        await fixture.track(
          plans.createActionPlan({
            actorId: fixture.creatorId,
            contextId: fixture.contextIds[0]!,
            idempotencyKey: "bl-plan-race-create",
            input: planInput("Only one acceptance"),
            dependencies: fixture.dependencies(fixture.db[0], baseNow),
          }),
        ),
      );
      const results = await Promise.all([
        fixture.track(
          plans.acceptActionPlan({
            actorId: fixture.responderIds[0]!,
            revisionId: pending.revisionId,
            idempotencyKey: "bl-plan-race-accept-a",
            dependencies: fixture.dependencies(fixture.db[0], baseNow),
          }),
        ),
        fixture.track(
          plans.acceptActionPlan({
            actorId: fixture.responderIds[0]!,
            revisionId: pending.revisionId,
            idempotencyKey: "bl-plan-race-accept-b",
            dependencies: fixture.dependencies(fixture.db[1], baseNow),
          }),
        ),
      ]);
      assert.deepEqual(
        results.map((result) => result.status).sort((left, right) => left - right),
        [200, 409],
      );
      assert.equal(
        await fixture.db[0].calendarEntry.count({
          where: {
            planCommitmentId: pending.commitmentId,
            projectionStatus: "ACTIVE",
          },
        }),
        2,
      );
      assert.equal(
        await fixture.db[0].productFunnelEvent.count({
          where: {
            planCommitmentId: pending.commitmentId,
            name: "PLAN_ACCEPTED",
          },
        }),
        1,
      );
      assert.ok(
        (
          await fixture.db[0].connection.findUniqueOrThrow({
            where: { id: fixture.connectionIds[0] },
            select: { replyLimitUnlockedAt: true },
          })
        ).replyLimitUnlockedAt,
      );
    });
  },
);

test(
  "fulfilled Action recovery routes winning participants exactly and leaks no Plan identity to another responder",
  { skip: localDatabaseUrl ? false : "requires localhost PostgreSQL" },
  async () => {
    const plans = await import(
      "../../lib/v2/action-coordination/plan-service"
    );
    await withFixture(async (fixture) => {
      await seedActionGraph(fixture, { first: "OPEN", second: "OPEN" });
      const winning = successfulPlan(
        await fixture.track(
          plans.createActionPlan({
            actorId: fixture.creatorId,
            contextId: fixture.contextIds[0]!,
            idempotencyKey: "bl-plan-fulfilled-recovery-create",
            input: planInput("Winning Plan"),
            dependencies: fixture.dependencies(fixture.db[0], baseNow),
          }),
        ),
      );
      assert.equal(
        (
          await fixture.track(
            plans.acceptActionPlan({
              actorId: fixture.responderIds[0]!,
              revisionId: winning.revisionId,
              idempotencyKey: "bl-plan-fulfilled-recovery-accept",
              dependencies: fixture.dependencies(fixture.db[0], baseNow),
            }),
          )
        ).status,
        200,
      );

      const creatorResult = await fixture.track(
        plans.createActionPlan({
          actorId: fixture.creatorId,
          contextId: fixture.contextIds[1]!,
          idempotencyKey: "bl-plan-fulfilled-recovery-creator",
          input: planInput("Cannot create another", 15),
          dependencies: fixture.dependencies(fixture.db[0], baseNow),
        }),
      );
      assert.equal(creatorResult.status, 409);
      assert.equal(errorCode(creatorResult), "ACTION_FULFILLED");
      assert.deepEqual(resultBody(creatorResult).recovery, {
        action: "OPEN_PLAN",
        focus: {
          type: "PLAN",
          connectionId: fixture.connectionIds[0],
          commitmentId: winning.commitmentId,
          revisionId: winning.revisionId,
        },
      });

      const losingResponderResult = await fixture.track(
        plans.createActionPlan({
          actorId: fixture.responderIds[1]!,
          contextId: fixture.contextIds[1]!,
          idempotencyKey: "bl-plan-fulfilled-recovery-loser",
          input: planInput("Cannot see winner", 16),
          dependencies: fixture.dependencies(fixture.db[0], baseNow),
        }),
      );
      assert.equal(losingResponderResult.status, 409);
      assert.equal(errorCode(losingResponderResult), "ACTION_FULFILLED");
      assert.equal("recovery" in resultBody(losingResponderResult), false);
      assert.equal("currentState" in resultBody(losingResponderResult), false);
      assertNoPlanIdentity(losingResponderResult, [
        fixture.connectionIds[0]!,
        winning.commitmentId,
        winning.revisionId,
      ]);
    });
  },
);

test(
  "pending Action Plan recovery is exact for the creator and neutral for another Context responder",
  { skip: localDatabaseUrl ? false : "requires localhost PostgreSQL" },
  async () => {
    const plans = await import(
      "../../lib/v2/action-coordination/plan-service"
    );
    await withFixture(async (fixture) => {
      await seedActionGraph(fixture, { first: "OPEN", second: "OPEN" });
      const pending = successfulPlan(
        await fixture.track(
          plans.createActionPlan({
            actorId: fixture.creatorId,
            contextId: fixture.contextIds[0]!,
            idempotencyKey: "bl-plan-pending-recovery-create",
            input: planInput("Pending Plan"),
            dependencies: fixture.dependencies(fixture.db[0], baseNow),
          }),
        ),
      );

      const creatorResult = await fixture.track(
        plans.createActionPlan({
          actorId: fixture.creatorId,
          contextId: fixture.contextIds[1]!,
          idempotencyKey: "bl-plan-pending-recovery-creator",
          input: planInput("Second Plan", 15),
          dependencies: fixture.dependencies(fixture.db[0], baseNow),
        }),
      );
      assert.equal(creatorResult.status, 409);
      assert.equal(errorCode(creatorResult), "ACTION_PLAN_PENDING");
      assert.deepEqual(resultBody(creatorResult).recovery, {
        action: "OPEN_PLAN",
        focus: {
          type: "PLAN",
          connectionId: fixture.connectionIds[0],
          commitmentId: pending.commitmentId,
          revisionId: pending.revisionId,
        },
      });

      const losingResponderResult = await fixture.track(
        plans.createActionPlan({
          actorId: fixture.responderIds[1]!,
          contextId: fixture.contextIds[1]!,
          idempotencyKey: "bl-plan-pending-recovery-loser",
          input: planInput("Private Plan", 16),
          dependencies: fixture.dependencies(fixture.db[0], baseNow),
        }),
      );
      assert.equal(losingResponderResult.status, 409);
      assert.equal(errorCode(losingResponderResult), "ACTION_PLAN_PENDING");
      assert.equal("recovery" in resultBody(losingResponderResult), false);
      assert.equal("currentState" in resultBody(losingResponderResult), false);
      assertNoPlanIdentity(losingResponderResult, [
        fixture.connectionIds[0]!,
        pending.commitmentId,
        pending.revisionId,
      ]);
    });
  },
);

test(
  "persisted Plan conflict replay becomes a neutral tombstone after pair safety terminalization",
  { skip: localDatabaseUrl ? false : "requires localhost PostgreSQL" },
  async () => {
    const [plans, blocks] = await Promise.all([
      import("../../lib/v2/action-coordination/plan-service"),
      import("../../lib/api/v1/pair-block-transaction"),
    ]);
    await withFixture(async (fixture) => {
      await seedActionGraph(fixture, { first: "OPEN", second: "OPEN" });
      const pending = successfulPlan(
        await fixture.track(
          plans.createActionPlan({
            actorId: fixture.creatorId,
            contextId: fixture.contextIds[0]!,
            idempotencyKey: "bl-plan-conflict-replay-pending",
            input: planInput("Private pending Plan"),
            dependencies: fixture.dependencies(fixture.db[0], baseNow),
          }),
        ),
      );
      const conflictInput = planInput("Conflicting Plan", 15);
      const conflict = await fixture.track(
        plans.createActionPlan({
          actorId: fixture.creatorId,
          contextId: fixture.contextIds[1]!,
          idempotencyKey: "bl-plan-conflict-replay-block",
          input: conflictInput,
          dependencies: fixture.dependencies(fixture.db[0], baseNow),
        }),
      );
      assert.equal(conflict.kind, "executed");
      assert.equal(conflict.status, 409);
      assert.equal(errorCode(conflict), "ACTION_PLAN_PENDING");
      assert.deepEqual(resultBody(conflict).recovery, {
        action: "OPEN_PLAN",
        focus: {
          type: "PLAN",
          connectionId: fixture.connectionIds[0],
          commitmentId: pending.commitmentId,
          revisionId: pending.revisionId,
        },
      });

      const installed = await fixture.db[0].$transaction((tx) =>
        blocks.installPairPeerBlock(tx, {
          userId: fixture.creatorId,
          blockedId: fixture.responderIds[0]!,
          connectionId: fixture.connectionIds[0],
          endedAt: new Date(baseNow.getTime() + 60_000),
        }),
      );
      assert.equal(installed.kind, "blocked");
      assert.ok(
        (
          await fixture.db[0].planCommitment.findUniqueOrThrow({
            where: { id: pending.commitmentId },
            select: { safetyRestrictedAt: true },
          })
        ).safetyRestrictedAt,
      );

      const replay = await fixture.track(
        plans.createActionPlan({
          actorId: fixture.creatorId,
          contextId: fixture.contextIds[1]!,
          idempotencyKey: "bl-plan-conflict-replay-block",
          input: conflictInput,
          dependencies: fixture.dependencies(
            fixture.db[1],
            new Date(baseNow.getTime() + 120_000),
          ),
        }),
      );
      assert.equal(replay.kind, "replayed");
      assert.equal(replay.status, 404);
      assert.equal(errorCode(replay), "SAFETY_UNAVAILABLE");
      assert.equal("recovery" in resultBody(replay), false);
      assert.equal("currentState" in resultBody(replay), false);
      assertNoPlanIdentity(replay, [
        fixture.connectionIds[0]!,
        pending.commitmentId,
        pending.revisionId,
      ]);
      const receipt = await fixture.db[0].apiIdempotencyRecord.findUniqueOrThrow({
        where: { id: replay.identity.recordId },
        select: { responseStatus: true, responseBody: true },
      });
      assert.equal(receipt.responseStatus, 404);
      assert.equal(JSON.stringify(receipt.responseBody).includes(pending.commitmentId), false);
    });
  },
);

test(
  "repeated unresponded proposal-withdraw cycles cannot bypass the direct reply gate",
  { skip: localDatabaseUrl ? false : "requires localhost PostgreSQL" },
  async () => {
    const plans = await import(
      "../../lib/v2/action-coordination/plan-service"
    );
    await withFixture(async (fixture) => {
      await seedActionGraph(fixture, { first: "OPEN" });
      for (let index = 0; index < 2; index += 1) {
        const pending = successfulPlan(
          await fixture.track(
            plans.createActionPlan({
              actorId: fixture.creatorId,
              contextId: fixture.contextIds[0]!,
              idempotencyKey: `bl-plan-gate-create-${index}`,
              input: planInput(`Attempt ${index + 1}`, 13 + index),
              dependencies: fixture.dependencies(fixture.db[0], baseNow),
            }),
          ),
        );
        assert.equal(
          (
            await fixture.track(
              plans.withdrawActionPlan({
                actorId: fixture.creatorId,
                revisionId: pending.revisionId,
                idempotencyKey: `bl-plan-gate-withdraw-${index}`,
                dependencies: fixture.dependencies(fixture.db[0], baseNow),
              }),
            )
          ).status,
          200,
        );
      }
      const blocked = await fixture.track(
        plans.createActionPlan({
          actorId: fixture.creatorId,
          contextId: fixture.contextIds[0]!,
          idempotencyKey: "bl-plan-gate-create-third",
          input: planInput("Third unresponded proposal", 16),
          dependencies: fixture.dependencies(fixture.db[0], baseNow),
        }),
      );
      assert.equal(blocked.status, 403);
      assert.equal(errorCode(blocked), "PEER_REPLY_REQUIRED");
      assert.equal(
        await fixture.db[0].message.count({
          where: {
            connectionId: fixture.connectionIds[0],
            senderId: fixture.creatorId,
            type: "PLAN_REQUEST_CARD",
          },
        }),
        2,
      );
      assert.equal(
        await fixture.db[0].planRequest.count({
          where: { originActionId: fixture.actionId, status: "PENDING" },
        }),
        0,
      );
    });
  },
);

test(
  "Block makes pending Plan transitions fail closed without changing commitment or Calendar state",
  { skip: localDatabaseUrl ? false : "requires localhost PostgreSQL" },
  async () => {
    const plans = await import(
      "../../lib/v2/action-coordination/plan-service"
    );
    await withFixture(async (fixture) => {
      await seedActionGraph(fixture, { first: "OPEN" });
      const pending = successfulPlan(
        await fixture.track(
          plans.createActionPlan({
            actorId: fixture.creatorId,
            contextId: fixture.contextIds[0]!,
            idempotencyKey: "bl-plan-block-create",
            input: planInput("Blocked transition"),
            dependencies: fixture.dependencies(fixture.db[0], baseNow),
          }),
        ),
      );
      await fixture.db[0].block.create({
        data: {
          blockerId: fixture.creatorId,
          blockedId: fixture.responderIds[0]!,
          connectionId: fixture.connectionIds[0],
        },
      });
      const blocked = await fixture.track(
        plans.acceptActionPlan({
          actorId: fixture.responderIds[0]!,
          revisionId: pending.revisionId,
          idempotencyKey: "bl-plan-block-accept",
          dependencies: fixture.dependencies(fixture.db[0], baseNow),
        }),
      );
      assert.equal(blocked.status, 404);
      assert.deepEqual(
        await fixture.db[0].planCommitment.findUniqueOrThrow({
          where: { id: pending.commitmentId },
          select: { status: true, currentPendingRevisionId: true },
        }),
        { status: "NEGOTIATING", currentPendingRevisionId: pending.revisionId },
      );
      assert.equal(
        await fixture.db[0].calendarEntry.count({
          where: { planCommitmentId: pending.commitmentId },
        }),
        0,
      );
    });
  },
);

type ContextSeedState = "OPEN" | "WAITING" | "INITIATING";
type Fixture = Awaited<ReturnType<typeof makeFixture>>;

async function makeFixture() {
  const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
  const db = [new PrismaClient(), new PrismaClient()];
  const creatorId = `blplan-creator-${suffix}`;
  const responderIds = Array.from(
    { length: 4 },
    (_, index) => `blplan-responder-${index}-${suffix}`,
  );
  const actionId = `blplan-action-${suffix}`;
  const interestIds = responderIds.map(
    (_, index) => `blplan-interest-${index}-${suffix}`,
  );
  const activationIds = responderIds.map(
    (_, index) => `blplan-activation-${index}-${suffix}`,
  );
  const contextIds = responderIds.map(
    (_, index) => `blplan-context-${index}-${suffix}`,
  );
  const connectionIds = responderIds.map(
    (_, index) => `blplan-connection-${index}-${suffix}`,
  );
  const receiptIds = new Set<string>();
  return {
    db,
    creatorId,
    responderIds,
    actionId,
    interestIds,
    activationIds,
    contextIds,
    connectionIds,
    dependencies(client: PrismaClient, now: Date) {
      return {
        db: client,
        clock: fixedActionCoordinationClock(now),
        transactionOptions,
      };
    },
    async track<T extends { identity: { recordId: string } }>(
      promise: Promise<T>,
    ): Promise<T> {
      const result = await promise;
      receiptIds.add(result.identity.recordId);
      return result;
    },
    receiptIds,
  };
}

async function withFixture(run: (fixture: Fixture) => Promise<void>) {
  const fixture = await makeFixture();
  try {
    await fixture.db[0].user.createMany({
      data: [
        {
          id: fixture.creatorId,
          username: `blplan_creator_${fixture.creatorId.slice(-8)}`,
          nickname: "Creator",
          hashedPassword: "x",
          school: "TUM",
          onboardingComplete: true,
          verifiedStudent: true,
        },
        ...fixture.responderIds.map((id, index) => ({
          id,
          username: `blplan_responder_${index}_${id.slice(-8)}`,
          nickname: `Responder ${index + 1}`,
          hashedPassword: "x",
          school: "TUM",
          onboardingComplete: true,
          verifiedStudent: true,
        })),
      ],
    });
    await run(fixture);
  } finally {
    await fixture.db[0].apiIdempotencyRecord
      .deleteMany({ where: { id: { in: [...fixture.receiptIds] } } })
      .catch(() => undefined);
    await fixture.db[0].user
      .deleteMany({
        where: {
          id: { in: [fixture.creatorId, ...fixture.responderIds] },
        },
      })
      .catch(() => undefined);
    await Promise.all(fixture.db.map((client) => client.$disconnect()));
  }
}

async function seedActionGraph(
  fixture: Fixture,
  states: Partial<Record<"first" | "second" | "third" | "fourth", ContextSeedState>>,
) {
  const stateValues = [states.first, states.second, states.third, states.fourth];
  const snapshot = creatorGatedPolicySnapshot({
    capability: capableClient,
    experiment: {
      key: CREATOR_GATED_ACTION_EXPERIMENT_KEY,
      variant: "TREATMENT",
    },
    now: baseNow,
  });
  await fixture.db[0].classmatePost.create({
    data: {
      id: fixture.actionId,
      userId: fixture.creatorId,
      city: "Munich",
      category: "MEALS",
      title: "Lunch together",
      body: "Private body",
      visibility: "SCHOOL_ONLY",
      status: "ACTIVE",
      startsAt: new Date("2026-09-02T12:00:00.000Z"),
      endsAt: new Date("2026-09-02T13:00:00.000Z"),
      location: "Mensa",
      expiresAt: new Date("2026-09-05T00:00:00.000Z"),
      ...snapshot,
      clientCapabilitySnapshot: snapshot.clientCapabilitySnapshot!,
    },
  });
  await fixture.db[0].$transaction(async (tx) => {
    for (const [index, state] of stateValues.entries()) {
      if (!state) continue;
      const responderId = fixture.responderIds[index]!;
      const isOpen = state === "OPEN";
      if (isOpen) {
        await tx.connection.create({
          data: {
            id: fixture.connectionIds[index],
            userAId: fixture.creatorId,
            userBId: responderId,
            status: "ACTIVE",
          },
        });
      }
      await tx.actionInterest.create({
        data: {
          id: fixture.interestIds[index],
          userId: responderId,
          classmatePostId: fixture.actionId,
          connectionId: isOpen ? fixture.connectionIds[index] : null,
          status: "ACTIVE",
          originSnapshot: {
            version: 1,
            sourceKind: "BUDDY_POST",
            sourceId: fixture.actionId,
            title: "Lunch together",
            startsAt: "2026-09-02T12:00:00.000Z",
            endsAt: "2026-09-02T13:00:00.000Z",
            location: "Mensa",
            planType: "MEAL",
            participantIds: [fixture.creatorId, responderId],
            author: { id: fixture.creatorId, displayName: "Creator" },
            course: null,
          },
        },
      });
      await tx.actionInterestActivation.create({
        data: {
          id: fixture.activationIds[index],
          interestId: fixture.interestIds[index],
          ordinal: 1,
          interestSurface: "ACTION_DETAIL",
          connectedAt: isOpen ? baseNow : null,
          firstContentType: isOpen ? "MESSAGE" : null,
        },
      });
      await tx.actionCoordinationContext.create({
        data: {
          id: fixture.contextIds[index],
          interestId: fixture.interestIds[index],
          currentActivationId: fixture.activationIds[index],
          state,
          reservationId: state === "INITIATING" ? randomUUID() : null,
          reservationGeneration: state === "INITIATING" ? 1 : 0,
          leaseExpiresAt:
            state === "INITIATING"
              ? new Date(baseNow.getTime() + 5 * 60_000)
              : null,
          connectionId: isOpen ? fixture.connectionIds[index] : null,
          activatedAt: isOpen ? baseNow : null,
        },
      });
    }
  });
}

function planInput(title: string, hour = 13) {
  return {
    planType: "MEAL" as const,
    title,
    location: "Mensa",
    message: "See you there",
    startTime: `2026-09-02T${String(hour).padStart(2, "0")}:00:00.000Z`,
    endTime: `2026-09-02T${String(hour + 1).padStart(2, "0")}:00:00.000Z`,
  };
}

function successfulPlan(result: { status: number; body?: unknown }) {
  assert.ok("body" in result);
  const body = result.body;
  assert.ok(body && typeof body === "object" && "plan" in body);
  const plan = (body as { plan?: unknown }).plan;
  assert.ok(plan && typeof plan === "object");
  return plan as {
    commitmentId: string;
    revisionId: string;
    commitmentStatus: string;
    revisionStatus: string;
  };
}

function errorCode(result: object): string | null {
  if (!("body" in result)) return null;
  const body = result.body;
  if (!body || typeof body !== "object" || !("error" in body)) return null;
  const error = (body as { error?: unknown }).error;
  if (!error || typeof error !== "object" || !("code" in error)) return null;
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" ? code : null;
}

function resultBody(result: object): Record<string, unknown> {
  assert.ok("body" in result);
  const body = result.body;
  assert.ok(body && typeof body === "object" && !Array.isArray(body));
  return body as Record<string, unknown>;
}

function assertNoPlanIdentity(result: object, identifiers: readonly string[]) {
  const serialized = JSON.stringify(resultBody(result));
  for (const identifier of identifiers) {
    assert.equal(serialized.includes(identifier), false);
  }
}

function localPostgresUrl(value: string | undefined): string | undefined {
  if (!value) return undefined;
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return undefined;
  }
  if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") {
    return undefined;
  }
  if (!new Set(["127.0.0.1", "localhost", "::1"]).has(parsed.hostname)) {
    return undefined;
  }
  const targetOverrides = new Set([
    "database",
    "dbname",
    "host",
    "hostaddr",
    "password",
    "port",
    "service",
    "user",
  ]);
  if (
    [...parsed.searchParams.keys()].some((key) =>
      targetOverrides.has(key.toLowerCase()),
    )
  ) {
    return undefined;
  }
  return value;
}
