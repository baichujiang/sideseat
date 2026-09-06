import assert from "node:assert/strict";
import Module from "node:module";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { PrismaClient, type Prisma } from "@prisma/client";

import {
  acceptLegacyPlanRevision,
  counterLegacyPlanRevision,
  declineLegacyPlanRevision,
  LegacyPlanPolicyUnsupportedError,
  LegacyPlanTransitionConflictError,
  upsertLegacyPlanOutcome,
} from "../../lib/plans/legacy-plan-commitment-compat";
import { materializePlanCalendarEntries } from "../../lib/queries/chat-planning";
import {
  creatorGatedPolicySnapshot,
  directConversationPolicySnapshot,
  evaluateActionCoordinationCapability,
} from "../../lib/v2/action-coordination/capability";
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
const policyNow = new Date("2026-09-01T10:00:00.000Z");
const capableClient = evaluateActionCoordinationCapability(
  new Headers({
    "x-sideseat-platform": "ios",
    "x-sideseat-app-version": "2.0",
    "x-sideseat-build": "200",
    "x-sideseat-capabilities": "action-coordination-v2",
  }),
  { minimumAppVersion: "1.0", minimumBuild: "1" },
);

test("legacy Plan compatibility tests refuse non-local database targets", () => {
  assert.equal(
    localPostgresUrl("postgresql://user:password@example.invalid:5432/database"),
    undefined,
  );
  assert.equal(localPostgresUrl("mysql://localhost/database"), undefined);
  assert.equal(
    localPostgresUrl(
      "postgresql://user:password@127.0.0.1:5433/database?schema=public",
    ),
    "postgresql://user:password@127.0.0.1:5433/database?schema=public",
  );
});

test(
  "DB-05 INITIAL accept updates the stable Commitment and creates exactly two projections",
  { skip: localDatabaseUrl ? false : "requires a localhost PostgreSQL DATABASE_URL" },
  async () => {
    await withFixture(async ({ db, ids }) => {
      const planId = `${ids.prefix}-accept`;
      const commitmentId = `${ids.prefix}-accept-commitment`;
      await seedStableInitial(db, ids, { planId, commitmentId });

      await db.$transaction(async (tx) => {
        const transition = await acceptLegacyPlanRevision(tx, planId);
        assert.equal(transition.planCommitmentId, commitmentId);
        await materializePlanCalendarEntries(tx, {
          planRequestId: planId,
          planCommitmentId: commitmentId,
          proposerUserId: ids.userA,
          proposerName: "A",
          receiverUserId: ids.userB,
          receiverName: "B",
          title: "Coffee",
          planType: "MEAL",
          location: "Mensa",
          note: "See you",
          startTime: new Date("2026-09-01T10:00:00.000Z"),
          endTime: new Date("2026-09-01T11:00:00.000Z"),
        });
      });

      const commitment = await db.planCommitment.findUniqueOrThrow({
        where: { id: commitmentId },
        select: {
          status: true,
          currentAcceptedRevisionId: true,
          currentPendingRevisionId: true,
          confirmedAt: true,
        },
      });
      assert.equal(commitment.status, "CONFIRMED");
      assert.equal(commitment.currentAcceptedRevisionId, planId);
      assert.equal(commitment.currentPendingRevisionId, null);
      assert.ok(commitment.confirmedAt);
      assert.equal(
        await db.calendarEntry.count({ where: { planCommitmentId: commitmentId } }),
        2,
      );
      const projections = await db.calendarEntry.findMany({
        where: { planCommitmentId: commitmentId },
        orderBy: { userId: "asc" },
        select: { userId: true, planRequestId: true, projectionStatus: true },
      });
      assert.deepEqual(projections, [
        { userId: ids.userA, planRequestId: planId, projectionStatus: "ACTIVE" },
        { userId: ids.userB, planRequestId: planId, projectionStatus: "ACTIVE" },
      ]);
    });
  },
);

test(
  "DB-05 INITIAL decline closes the Commitment while counter preserves its identity and source",
  { skip: localDatabaseUrl ? false : "requires a localhost PostgreSQL DATABASE_URL" },
  async () => {
    await withFixture(async ({ db, ids }) => {
      const declinedPlanId = `${ids.prefix}-decline`;
      const declinedCommitmentId = `${ids.prefix}-decline-commitment`;
      await seedStableInitial(db, ids, {
        planId: declinedPlanId,
        commitmentId: declinedCommitmentId,
      });
      await db.$transaction((tx) =>
        declineLegacyPlanRevision(tx, declinedPlanId),
      );
      assert.deepEqual(
        await db.planCommitment.findUniqueOrThrow({
          where: { id: declinedCommitmentId },
          select: { status: true, currentPendingRevisionId: true },
        }),
        { status: "CLOSED", currentPendingRevisionId: null },
      );

      const originalId = `${ids.prefix}-counter-original`;
      const counterId = `${ids.prefix}-counter-new`;
      const commitmentId = `${ids.prefix}-counter-commitment`;
      await seedStableInitial(db, ids, {
        planId: originalId,
        commitmentId,
        source: true,
      });
      await db.$transaction((tx) =>
        counterLegacyPlanRevision(tx, {
          planRequestId: originalId,
          createCounter: (inheritance) => {
            assert.ok(inheritance);
            return tx.planRequest.create({
              data: {
                id: counterId,
                connectionId: ids.connection,
                counterOfId: originalId,
                proposerUserId: ids.userB,
                receiverUserId: ids.userA,
                planType: "STUDY",
                title: "Later",
                startTime: new Date("2026-09-02T12:00:00.000Z"),
                endTime: new Date("2026-09-02T13:00:00.000Z"),
                ...inheritance,
              },
            });
          },
        }),
      );

      assert.equal(
        (await db.planRequest.findUniqueOrThrow({ where: { id: originalId } }))
          .status,
        "COUNTER_PROPOSED",
      );
      const counter = await db.planRequest.findUniqueOrThrow({
        where: { id: counterId },
      });
      assert.equal(counter.commitmentId, commitmentId);
      assert.equal(counter.revisionKind, "INITIAL");
      assert.equal(counter.originKind, "AVAILABILITY_SHARE");
      assert.equal(counter.originId, "share-source");
      assert.deepEqual(counter.originSnapshot, { source: "trusted" });
      assert.equal(
        (
          await db.planCommitment.findUniqueOrThrow({
            where: { id: commitmentId },
          })
        ).currentPendingRevisionId,
        counterId,
      );
    });
  },
);

test(
  "legacy accept, decline, and counter reject trusted CREATOR_GATED_V2 revisions without mutation",
  { skip: localDatabaseUrl ? false : "requires a localhost PostgreSQL DATABASE_URL" },
  async () => {
    await withFixture(async ({ db, ids }) => {
      const policy = creatorGatedPolicySnapshot({
        capability: capableClient,
        experiment: {
          key: CREATOR_GATED_ACTION_EXPERIMENT_KEY,
          variant: "TREATMENT",
        },
        now: policyNow,
      });
      const cases = ["accept", "decline", "counter"] as const;
      const resources = new Map<
        (typeof cases)[number],
        { actionId: string; planId: string; commitmentId: string }
      >();
      for (const operation of cases) {
        const resource = {
          actionId: `${ids.prefix}-v2-${operation}-action`,
          planId: `${ids.prefix}-v2-${operation}-plan`,
          commitmentId: `${ids.prefix}-v2-${operation}-commitment`,
        };
        resources.set(operation, resource);
        await seedPolicyAction(db, ids, resource.actionId, policy);
        await seedStableInitial(db, ids, {
          planId: resource.planId,
          commitmentId: resource.commitmentId,
          originActionId: resource.actionId,
        });
      }

      const accept = resources.get("accept")!;
      await expectCreatorGatedLegacyRejection(
        db.$transaction((tx) => acceptLegacyPlanRevision(tx, accept.planId)),
        {
          connectionId: ids.connection,
          commitmentId: accept.commitmentId,
          revisionId: accept.planId,
        },
      );
      const decline = resources.get("decline")!;
      await expectCreatorGatedLegacyRejection(
        db.$transaction((tx) => declineLegacyPlanRevision(tx, decline.planId)),
        {
          connectionId: ids.connection,
          commitmentId: decline.commitmentId,
          revisionId: decline.planId,
        },
      );
      const counter = resources.get("counter")!;
      let createCounterCalled = false;
      await expectCreatorGatedLegacyRejection(
        db.$transaction((tx) =>
          counterLegacyPlanRevision(tx, {
            planRequestId: counter.planId,
            createCounter: async () => {
              createCounterCalled = true;
              return { id: `${ids.prefix}-must-not-exist` };
            },
          }),
        ),
        {
          connectionId: ids.connection,
          commitmentId: counter.commitmentId,
          revisionId: counter.planId,
        },
      );
      assert.equal(createCounterCalled, false);

      assert.deepEqual(
        await db.planRequest.findMany({
          where: { id: { in: [...resources.values()].map((value) => value.planId) } },
          orderBy: { id: "asc" },
          select: { status: true },
        }),
        cases.map(() => ({ status: "PENDING" })),
      );
      assert.deepEqual(
        await db.planCommitment.findMany({
          where: {
            id: {
              in: [...resources.values()].map((value) => value.commitmentId),
            },
          },
          orderBy: { id: "asc" },
          select: { status: true },
        }),
        cases.map(() => ({ status: "NEGOTIATING" })),
      );
    });
  },
);

test(
  "legacy accept, decline, and counter remain compatible with trusted DIRECT_CONVERSATION_V1 revisions",
  { skip: localDatabaseUrl ? false : "requires a localhost PostgreSQL DATABASE_URL" },
  async () => {
    await withFixture(async ({ db, ids }) => {
      const policy = directConversationPolicySnapshot({ now: policyNow });
      const resources = Object.fromEntries(
        ["accept", "decline", "counter"].map((operation) => [
          operation,
          {
            actionId: `${ids.prefix}-direct-${operation}-action`,
            planId: `${ids.prefix}-direct-${operation}-plan`,
            commitmentId: `${ids.prefix}-direct-${operation}-commitment`,
          },
        ]),
      ) as Record<
        "accept" | "decline" | "counter",
        { actionId: string; planId: string; commitmentId: string }
      >;
      for (const resource of Object.values(resources)) {
        await seedPolicyAction(db, ids, resource.actionId, policy);
        await seedStableInitial(db, ids, {
          planId: resource.planId,
          commitmentId: resource.commitmentId,
          originActionId: resource.actionId,
        });
      }

      await db.$transaction((tx) =>
        acceptLegacyPlanRevision(tx, resources.accept.planId),
      );
      await db.$transaction((tx) =>
        declineLegacyPlanRevision(tx, resources.decline.planId),
      );
      const counterId = `${ids.prefix}-direct-counter-new`;
      await db.$transaction((tx) =>
        counterLegacyPlanRevision(tx, {
          planRequestId: resources.counter.planId,
          createCounter: (inheritance) => {
            assert.ok(inheritance);
            return tx.planRequest.create({
              data: {
                id: counterId,
                connectionId: ids.connection,
                counterOfId: resources.counter.planId,
                proposerUserId: ids.userB,
                receiverUserId: ids.userA,
                planType: "STUDY",
                title: "Direct counter",
                startTime: new Date("2026-09-12T10:00:00.000Z"),
                endTime: new Date("2026-09-12T11:00:00.000Z"),
                ...inheritance,
              },
            });
          },
        }),
      );

      assert.equal(
        (
          await db.planCommitment.findUniqueOrThrow({
            where: { id: resources.accept.commitmentId },
          })
        ).status,
        "CONFIRMED",
      );
      assert.equal(
        (
          await db.planCommitment.findUniqueOrThrow({
            where: { id: resources.decline.commitmentId },
          })
        ).status,
        "CLOSED",
      );
      assert.deepEqual(
        await db.planCommitment.findUniqueOrThrow({
          where: { id: resources.counter.commitmentId },
          select: { status: true, currentPendingRevisionId: true },
        }),
        { status: "NEGOTIATING", currentPendingRevisionId: counterId },
      );
      assert.equal(
        (
          await db.planRequest.findUniqueOrThrow({ where: { id: counterId } })
        ).originActionId,
        resources.counter.actionId,
      );
    });
  },
);

test(
  "completed accepted Plan rejects a pending RESCHEDULE without changing either pointer",
  { skip: localDatabaseUrl ? false : "requires a localhost PostgreSQL DATABASE_URL" },
  async () => {
    await withFixture(async ({ db, ids }) => {
      const commitmentId = `${ids.prefix}-ended-reschedule-commitment`;
      const acceptedId = `${ids.prefix}-ended-accepted`;
      const pendingId = `${ids.prefix}-ended-pending`;
      await seedStableReschedule(db, ids, {
        commitmentId,
        acceptedId,
        pendingId,
        acceptedEndTime: new Date(Date.now() - 60_000),
      });

      await assert.rejects(
        db.$transaction((tx) => acceptLegacyPlanRevision(tx, pendingId)),
        LegacyPlanTransitionConflictError,
      );
      assert.deepEqual(
        await db.planCommitment.findUniqueOrThrow({
          where: { id: commitmentId },
          select: {
            status: true,
            currentAcceptedRevisionId: true,
            currentPendingRevisionId: true,
          },
        }),
        {
          status: "CONFIRMED",
          currentAcceptedRevisionId: acceptedId,
          currentPendingRevisionId: pendingId,
        },
      );
      assert.deepEqual(
        await db.planRequest.findMany({
          where: { id: { in: [acceptedId, pendingId] } },
          orderBy: { id: "asc" },
          select: { id: true, status: true },
        }),
        [
          { id: acceptedId, status: "ACCEPTED" },
          { id: pendingId, status: "PENDING" },
        ].sort((left, right) => left.id.localeCompare(right.id)),
      );
    });
  },
);

test(
  "valid RESCHEDULE moves the stable projection while preserving each participant's private note",
  { skip: localDatabaseUrl ? false : "requires a localhost PostgreSQL DATABASE_URL" },
  async () => {
    await withFixture(async ({ db, ids }) => {
      const commitmentId = `${ids.prefix}-valid-reschedule-commitment`;
      const acceptedId = `${ids.prefix}-valid-accepted`;
      const pendingId = `${ids.prefix}-valid-pending`;
      const confirmedAt = new Date("2026-08-01T09:00:00.000Z");
      await seedStableReschedule(db, ids, {
        commitmentId,
        acceptedId,
        pendingId,
        acceptedEndTime: new Date(Date.now() + 3_600_000),
        confirmedAt,
        calendarNotes: ["A private note", "B private note"],
      });

      const newStart = new Date(Date.now() + 7_200_000);
      const newEnd = new Date(newStart.getTime() + 3_600_000);
      await db.$transaction(async (tx) => {
        const transition = await acceptLegacyPlanRevision(tx, pendingId);
        await materializePlanCalendarEntries(tx, {
          planRequestId: pendingId,
          planCommitmentId: transition.planCommitmentId,
          proposerUserId: ids.userB,
          proposerName: "B",
          receiverUserId: ids.userA,
          receiverName: "A",
          title: "Updated shared title",
          planType: "MEAL",
          location: "Updated shared place",
          note: "Must not replace private notes",
          startTime: newStart,
          endTime: newEnd,
        });
      });

      const commitment = await db.planCommitment.findUniqueOrThrow({
        where: { id: commitmentId },
        select: {
          currentAcceptedRevisionId: true,
          currentPendingRevisionId: true,
          confirmedAt: true,
        },
      });
      assert.equal(commitment.currentAcceptedRevisionId, pendingId);
      assert.equal(commitment.currentPendingRevisionId, null);
      assert.equal(commitment.confirmedAt?.toISOString(), confirmedAt.toISOString());
      const projections = await db.calendarEntry.findMany({
        where: { planCommitmentId: commitmentId },
        orderBy: { userId: "asc" },
        select: {
          userId: true,
          planRequestId: true,
          title: true,
          location: true,
          eventType: true,
          startAt: true,
          endAt: true,
          note: true,
        },
      });
      assert.deepEqual(
        projections.map((projection) => ({
          ...projection,
          startAt: projection.startAt.toISOString(),
          endAt: projection.endAt.toISOString(),
        })),
        [
          {
            userId: ids.userA,
            planRequestId: pendingId,
            title: "Updated shared title",
            location: "Updated shared place",
            eventType: "MEAL",
            startAt: newStart.toISOString(),
            endAt: newEnd.toISOString(),
            note: "A private note",
          },
          {
            userId: ids.userB,
            planRequestId: pendingId,
            title: "Updated shared title",
            location: "Updated shared place",
            eventType: "MEAL",
            startAt: newStart.toISOString(),
            endAt: newEnd.toISOString(),
            note: "B private note",
          },
        ],
      );
    });
  },
);

test(
  "stable outcome is owned by the current accepted Commitment revision",
  { skip: localDatabaseUrl ? false : "requires a localhost PostgreSQL DATABASE_URL" },
  async () => {
    await withFixture(async ({ db, ids }) => {
      const planId = `${ids.prefix}-outcome`;
      const commitmentId = `${ids.prefix}-outcome-commitment`;
      await seedStableInitial(db, ids, {
        planId,
        commitmentId,
        ended: true,
      });
      await db.$transaction((tx) => acceptLegacyPlanRevision(tx, planId));

      await db.$transaction((tx) =>
        upsertLegacyPlanOutcome(tx, {
          planId,
          userId: ids.userA,
          value: "OCCURRED",
        }),
      );
      const updated = await db.$transaction((tx) =>
        upsertLegacyPlanOutcome(tx, {
          planId,
          userId: ids.userA,
          value: "DID_NOT_OCCUR",
        }),
      );
      assert.equal(updated.planId, planId);
      assert.equal(updated.planCommitmentId, commitmentId);
      assert.equal(updated.value, "DID_NOT_OCCUR");
      assert.equal(
        await db.planOutcomeResponse.count({
          where: { planCommitmentId: commitmentId, userId: ids.userA },
        }),
        1,
      );

      const replacementId = `${ids.prefix}-accepted-replacement`;
      await db.$transaction(async (tx) => {
        await tx.planRequest.create({
          data: {
            id: replacementId,
            connectionId: ids.connection,
            commitmentId,
            revisionKind: "RESCHEDULE",
            proposerUserId: ids.userB,
            receiverUserId: ids.userA,
            planType: "STUDY",
            title: "Replacement",
            startTime: new Date("2026-08-01T10:00:00.000Z"),
            endTime: new Date("2026-08-01T11:00:00.000Z"),
            status: "ACCEPTED",
          },
        });
        await tx.planCommitment.update({
          where: { id: commitmentId },
          data: { currentAcceptedRevisionId: replacementId },
        });
      });
      await assert.rejects(
        db.$transaction((tx) =>
          upsertLegacyPlanOutcome(tx, {
            planId,
            userId: ids.userA,
            value: "OCCURRED",
          }),
        ),
        LegacyPlanTransitionConflictError,
      );
    });
  },
);

test(
  "legacy direct Plan creation rejects a trusted creator-gated Action origin before creating a card",
  { skip: localDatabaseUrl ? false : "requires a localhost PostgreSQL DATABASE_URL" },
  async () => {
    const plans = await import("../../lib/api/v1/plans-service");
    await withFixture(async ({ db, ids }) => {
      const actionId = `${ids.prefix}-create-v2-action`;
      const interestId = `${ids.prefix}-create-v2-interest`;
      const activationId = `${ids.prefix}-create-v2-activation`;
      const contextId = `${ids.prefix}-create-v2-context`;
      const policy = creatorGatedPolicySnapshot({
        capability: capableClient,
        experiment: {
          key: CREATOR_GATED_ACTION_EXPERIMENT_KEY,
          variant: "TREATMENT",
        },
        now: policyNow,
      });
      await seedPolicyAction(db, ids, actionId, policy);
      await db.$transaction(async (tx) => {
        await tx.actionInterest.create({
          data: {
            id: interestId,
            userId: ids.userB,
            classmatePostId: actionId,
            connectionId: ids.connection,
            originSnapshot: {
              version: 1,
              sourceKind: "BUDDY_POST",
              sourceId: actionId,
              title: "Creator-gated source",
              startsAt: "2026-09-10T10:00:00.000Z",
              endsAt: "2026-09-10T11:00:00.000Z",
              location: "Campus",
              planType: "STUDY",
              participantIds: [ids.userA, ids.userB],
              author: { id: ids.userA, displayName: "A" },
              course: null,
            },
          },
        });
        await tx.actionInterestActivation.create({
          data: {
            id: activationId,
            interestId,
            ordinal: 1,
            interestSurface: "ACTION_DETAIL",
            connectedAt: policyNow,
            firstContentType: "MESSAGE",
          },
        });
        await tx.actionCoordinationContext.create({
          data: {
            id: contextId,
            interestId,
            currentActivationId: activationId,
            state: "OPEN",
            connectionId: ids.connection,
            activatedAt: policyNow,
          },
        });
      });

      await assert.rejects(
        plans.createDirectPlanRequest({
          userId: ids.userA,
          connectionId: ids.connection,
          title: "Must use v2",
          startTime: "2026-09-10T10:00:00.000Z",
          endTime: "2026-09-10T11:00:00.000Z",
          receiverUserId: ids.userB,
          origin: { kind: "ACTION_INTEREST", id: interestId },
        }),
        (cause: unknown) => {
          assert.ok(cause instanceof plans.PlansServiceError);
          assert.equal(cause.code, "COORDINATION_POLICY_UNSUPPORTED");
          assert.deepEqual(cause.recovery, {
            action: "OPEN_ACTION_CONTEXT",
            focus: {
              type: "ACTION_CONTEXT",
              connectionId: ids.connection,
              contextId,
            },
          });
          return true;
        },
      );
      assert.equal(
        await db.planRequest.count({ where: { actionInterestId: interestId } }),
        0,
      );
      assert.equal(
        await db.message.count({ where: { connectionId: ids.connection } }),
        0,
      );
    });
  },
);

test(
  "unbound legacy revisions keep null stable identities across accept, decline, counter, Calendar, and outcome",
  { skip: localDatabaseUrl ? false : "requires a localhost PostgreSQL DATABASE_URL" },
  async () => {
    await withFixture(async ({ db, ids }) => {
      const acceptedId = `${ids.prefix}-legacy-accept`;
      const declinedId = `${ids.prefix}-legacy-decline`;
      const originalId = `${ids.prefix}-legacy-counter`;
      const counterId = `${ids.prefix}-legacy-counter-new`;
      for (const planId of [acceptedId, declinedId, originalId]) {
        await seedLegacyPending(db, ids, planId);
      }

      await db.$transaction(async (tx) => {
        const accepted = await acceptLegacyPlanRevision(tx, acceptedId);
        assert.equal(accepted.planCommitmentId, null);
        await materializePlanCalendarEntries(tx, {
          planRequestId: acceptedId,
          proposerUserId: ids.userA,
          proposerName: "A",
          receiverUserId: ids.userB,
          receiverName: "B",
          title: "Legacy",
          planType: "CUSTOM",
          location: null,
          note: null,
          startTime: new Date("2026-08-01T10:00:00.000Z"),
          endTime: new Date("2026-08-01T11:00:00.000Z"),
        });
      });
      await db.$transaction((tx) => declineLegacyPlanRevision(tx, declinedId));
      await db.$transaction((tx) =>
        counterLegacyPlanRevision(tx, {
          planRequestId: originalId,
          createCounter: (inheritance) => {
            assert.equal(inheritance, null);
            return tx.planRequest.create({
              data: {
                id: counterId,
                connectionId: ids.connection,
                counterOfId: originalId,
                proposerUserId: ids.userB,
                receiverUserId: ids.userA,
                planType: "CUSTOM",
                title: "Legacy counter",
                startTime: new Date("2026-08-02T10:00:00.000Z"),
                endTime: new Date("2026-08-02T11:00:00.000Z"),
              },
            });
          },
        }),
      );
      const outcome = await db.$transaction((tx) =>
        upsertLegacyPlanOutcome(tx, {
          planId: acceptedId,
          userId: ids.userA,
          value: "OCCURRED",
        }),
      );

      assert.equal(outcome.planCommitmentId, null);
      assert.equal(
        await db.planCommitment.count({
          where: { connectionId: ids.connection },
        }),
        0,
      );
      for (const planId of [acceptedId, declinedId, originalId, counterId]) {
        const plan = await db.planRequest.findUniqueOrThrow({ where: { id: planId } });
        assert.equal(plan.commitmentId, null);
        assert.equal(plan.revisionKind, null);
      }
      assert.equal(
        await db.calendarEntry.count({
          where: { planRequestId: acceptedId, planCommitmentId: null },
        }),
        2,
      );
    });
  },
);

type FixtureIds = Readonly<{
  prefix: string;
  userA: string;
  userB: string;
  connection: string;
}>;

async function withFixture(
  run: (fixture: { db: PrismaClient; ids: FixtureIds }) => Promise<void>,
): Promise<void> {
  assert.ok(localDatabaseUrl);
  const prefix = `bl05compat-${process.pid}-${Math.random().toString(36).slice(2, 9)}`;
  const ids = {
    prefix,
    userA: `${prefix}-a`,
    userB: `${prefix}-b`,
    connection: `${prefix}-connection`,
  } as const;
  const db = new PrismaClient({ datasources: { db: { url: localDatabaseUrl } } });
  await db.$connect();
  try {
    await db.user.createMany({
      data: [
        { id: ids.userA, username: `${prefix}-a`, hashedPassword: "test" },
        { id: ids.userB, username: `${prefix}-b`, hashedPassword: "test" },
      ],
    });
    await db.connection.create({
      data: { id: ids.connection, userAId: ids.userA, userBId: ids.userB },
    });
    await run({ db, ids });
  } finally {
    await db.user.deleteMany({ where: { id: { in: [ids.userA, ids.userB] } } });
    await db.$disconnect();
  }
}

async function seedStableInitial(
  db: PrismaClient,
  ids: FixtureIds,
  options: {
    planId: string;
    commitmentId: string;
    source?: boolean;
    ended?: boolean;
    originActionId?: string;
  },
): Promise<void> {
  const startTime = options.ended
    ? new Date("2026-08-01T10:00:00.000Z")
    : new Date("2026-09-01T10:00:00.000Z");
  await db.$transaction(async (tx) => {
    await tx.planCommitment.create({
      data: {
        id: options.commitmentId,
        connectionId: ids.connection,
        participantAId: ids.userA,
        participantBId: ids.userB,
        originActionId: options.originActionId,
      },
    });
    await tx.planRequest.create({
      data: {
        id: options.planId,
        connectionId: ids.connection,
        commitmentId: options.commitmentId,
        revisionKind: "INITIAL",
        originActionId: options.originActionId,
        originKind: options.source ? "AVAILABILITY_SHARE" : null,
        originId: options.source ? "share-source" : null,
        originSnapshot: options.source
          ? ({ source: "trusted" } satisfies Prisma.InputJsonValue)
          : undefined,
        proposerUserId: ids.userA,
        receiverUserId: ids.userB,
        planType: "STUDY",
        title: "Study",
        startTime,
        endTime: new Date(startTime.getTime() + 3_600_000),
      },
    });
    await tx.planCommitment.update({
      where: { id: options.commitmentId },
      data: { currentPendingRevisionId: options.planId },
    });
  });
}

async function seedPolicyAction(
  db: PrismaClient,
  ids: FixtureIds,
  actionId: string,
  policy: ReturnType<typeof directConversationPolicySnapshot>,
): Promise<void> {
  await db.classmatePost.create({
    data: {
      id: actionId,
      userId: ids.userA,
      city: "Munich",
      category: "STUDY",
      title: "Policy source",
      body: "Trusted source body",
      visibility: "SCHOOL_ONLY",
      status: "ACTIVE",
      startsAt: new Date("2026-09-10T10:00:00.000Z"),
      endsAt: new Date("2026-09-10T11:00:00.000Z"),
      expiresAt: new Date("2026-09-30T00:00:00.000Z"),
      ...policy,
      clientCapabilitySnapshot: policy.clientCapabilitySnapshot ?? undefined,
    },
  });
}

async function expectCreatorGatedLegacyRejection(
  operation: Promise<unknown>,
  expectedFocus: {
    connectionId: string;
    commitmentId: string;
    revisionId: string;
  },
): Promise<void> {
  await assert.rejects(operation, (cause: unknown) => {
    assert.ok(cause instanceof LegacyPlanPolicyUnsupportedError);
    assert.equal(cause.code, "COORDINATION_POLICY_UNSUPPORTED");
    assert.deepEqual(cause.recovery, {
      action: "OPEN_PLAN",
      focus: { type: "PLAN", ...expectedFocus },
    });
    return true;
  });
}

async function seedStableReschedule(
  db: PrismaClient,
  ids: FixtureIds,
  options: {
    commitmentId: string;
    acceptedId: string;
    pendingId: string;
    acceptedEndTime: Date;
    confirmedAt?: Date;
    calendarNotes?: readonly [string, string];
  },
): Promise<void> {
  const acceptedStartTime = new Date(options.acceptedEndTime.getTime() - 3_600_000);
  const pendingStartTime = new Date(Date.now() + 7_200_000);
  await db.$transaction(async (tx) => {
    await tx.planCommitment.create({
      data: {
        id: options.commitmentId,
        connectionId: ids.connection,
        participantAId: ids.userA,
        participantBId: ids.userB,
      },
    });
    await tx.planRequest.create({
      data: {
        id: options.acceptedId,
        connectionId: ids.connection,
        commitmentId: options.commitmentId,
        revisionKind: "INITIAL",
        proposerUserId: ids.userA,
        receiverUserId: ids.userB,
        planType: "STUDY",
        title: "Accepted",
        startTime: acceptedStartTime,
        endTime: options.acceptedEndTime,
        status: "ACCEPTED",
      },
    });
    await tx.planRequest.create({
      data: {
        id: options.pendingId,
        connectionId: ids.connection,
        commitmentId: options.commitmentId,
        revisionKind: "RESCHEDULE",
        counterOfId: options.acceptedId,
        proposerUserId: ids.userB,
        receiverUserId: ids.userA,
        planType: "MEAL",
        title: "Pending replacement",
        startTime: pendingStartTime,
        endTime: new Date(pendingStartTime.getTime() + 3_600_000),
      },
    });
    await tx.planCommitment.update({
      where: { id: options.commitmentId },
      data: {
        status: "CONFIRMED",
        currentAcceptedRevisionId: options.acceptedId,
        currentPendingRevisionId: options.pendingId,
        confirmedAt: options.confirmedAt ?? new Date("2026-08-01T09:00:00.000Z"),
      },
    });
    if (options.calendarNotes) {
      await tx.calendarEntry.createMany({
        data: [
          {
            userId: ids.userA,
            planRequestId: options.acceptedId,
            planCommitmentId: options.commitmentId,
            title: "Old shared title",
            eventType: "STUDY",
            source: "plan_request",
            location: "Old shared place",
            note: options.calendarNotes[0],
            startAt: acceptedStartTime,
            endAt: options.acceptedEndTime,
          },
          {
            userId: ids.userB,
            planRequestId: options.acceptedId,
            planCommitmentId: options.commitmentId,
            title: "Old shared title",
            eventType: "STUDY",
            source: "plan_request",
            location: "Old shared place",
            note: options.calendarNotes[1],
            startAt: acceptedStartTime,
            endAt: options.acceptedEndTime,
          },
        ],
      });
    }
  });
}

async function seedLegacyPending(
  db: PrismaClient,
  ids: FixtureIds,
  planId: string,
): Promise<void> {
  await db.planRequest.create({
    data: {
      id: planId,
      connectionId: ids.connection,
      proposerUserId: ids.userA,
      receiverUserId: ids.userB,
      planType: "CUSTOM",
      title: "Legacy",
      startTime: new Date("2026-08-01T10:00:00.000Z"),
      endTime: new Date("2026-08-01T11:00:00.000Z"),
    },
  });
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
