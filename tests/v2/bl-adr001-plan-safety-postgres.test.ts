import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import Module from "node:module";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { PrismaClient } from "@prisma/client";

import {
  acceptLegacyPlanRevision,
  LegacyPlanTransitionConflictError,
  upsertLegacyPlanOutcome,
} from "../../lib/plans/legacy-plan-commitment-compat";
import { materializePlanCalendarEntries } from "../../lib/queries/chat-planning";

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

test("ADR-BL-001 PostgreSQL tests refuse non-local database targets", () => {
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
  "peer Block converges pending, upcoming, and completed Plans without reopening a fulfilled Action",
  { skip: localDatabaseUrl ? false : "requires localhost PostgreSQL" },
  async () => {
    const { installPairPeerBlock } = await import(
      "../../lib/api/v1/pair-block-transaction"
    );
    const { unblockUserForActor } = await import(
      "../../lib/api/v1/blocks-service"
    );
    const { loadCalendarEntryOccurrences } = await import(
      "../../lib/calendar/load-calendar-entry-occurrences"
    );
    const { searchCalendarEntriesForUser } = await import(
      "../../lib/api/v1/calendar-search-service"
    );

    await withFixture(async ({ db, ids }) => {
      const now = new Date();
      const pending = await seedNegotiating(db[0], ids, "pending", {
        startTime: new Date(now.getTime() + 3_600_000),
      });
      const upcoming = await seedConfirmed(db[0], ids, "upcoming", {
        startTime: new Date(now.getTime() + 7_200_000),
        endTime: new Date(now.getTime() + 10_800_000),
        title: "Private upcoming title",
      });
      const inProgress = await seedConfirmed(db[0], ids, "in-progress", {
        startTime: new Date(now.getTime() - 3_600_000),
        endTime: new Date(now.getTime() + 3_600_000),
        title: "Private in-progress title",
        pendingReschedule: true,
      });
      const completed = await seedConfirmed(db[0], ids, "completed", {
        startTime: new Date(now.getTime() - 7_200_000),
        endTime: new Date(now.getTime() - 3_600_000),
        title: "Private completed title",
        pendingReschedule: true,
      });
      const fulfilledActionId = `${ids.prefix}-fulfilled-action`;
      await db[0].classmatePost.create({
        data: {
          id: fulfilledActionId,
          userId: ids.userA,
          city: "Munich",
          category: "MEALS",
          title: "Fulfilled action",
          status: "FULFILLED",
          fulfilledAt: now,
          fulfilledByPlanId: upcoming.commitmentId,
          coordinationPolicy: "CREATOR_GATED_V2",
          expiresAt: new Date(now.getTime() + 86_400_000),
        },
      });

      await db[0].$transaction(
        (tx) =>
          installPairPeerBlock(tx, {
            userId: ids.userA,
            blockedId: ids.userB,
            connectionId: ids.connection,
            endedAt: new Date(0),
          }),
        transactionOptions,
      );

      const block = await db[0].block.findUniqueOrThrow({
        where: {
          blockerId_blockedId: {
            blockerId: ids.userA,
            blockedId: ids.userB,
          },
        },
        select: { id: true },
      });
      const pendingCommitment = await db[0].planCommitment.findUniqueOrThrow({
        where: { id: pending.commitmentId },
        select: {
          status: true,
          currentPendingRevisionId: true,
          safetyRestrictedAt: true,
          safetyBlockId: true,
        },
      });
      assert.ok(pendingCommitment.safetyRestrictedAt);
      assert.deepEqual(
        { ...pendingCommitment, safetyRestrictedAt: true },
        {
          status: "CLOSED",
          currentPendingRevisionId: null,
          safetyRestrictedAt: true,
          safetyBlockId: block.id,
        },
      );
      assert.deepEqual(
        await db[0].planRequest.findUniqueOrThrow({
          where: { id: pending.pendingRevisionId },
          select: { status: true, resolutionReason: true },
        }),
        { status: "INVALIDATED", resolutionReason: "SAFETY_UNAVAILABLE" },
      );

      const upcomingCommitment = await db[0].planCommitment.findUniqueOrThrow({
        where: { id: upcoming.commitmentId },
        select: {
          status: true,
          currentAcceptedRevisionId: true,
          currentPendingRevisionId: true,
          canceledByUserId: true,
          cancellationReason: true,
          safetyBlockId: true,
        },
      });
      assert.deepEqual(upcomingCommitment, {
        status: "CANCELED",
        currentAcceptedRevisionId: upcoming.acceptedRevisionId,
        currentPendingRevisionId: null,
        canceledByUserId: null,
        cancellationReason: "SAFETY_UNAVAILABLE",
        safetyBlockId: block.id,
      });
      assert.equal(
        await db[0].calendarEntry.count({
          where: {
            planCommitmentId: upcoming.commitmentId,
            projectionStatus: "ACTIVE",
          },
        }),
        0,
      );
      assert.equal(
        await db[0].calendarEntry.count({
          where: {
            planCommitmentId: upcoming.commitmentId,
            projectionStatus: "CANCELED",
          },
        }),
        2,
      );
      assert.deepEqual(
        await db[0].planCommitment.findUniqueOrThrow({
          where: { id: inProgress.commitmentId },
          select: {
            status: true,
            currentPendingRevisionId: true,
            cancellationReason: true,
          },
        }),
        {
          status: "CANCELED",
          currentPendingRevisionId: null,
          cancellationReason: "SAFETY_UNAVAILABLE",
        },
      );
      assert.deepEqual(
        await db[0].planRequest.findUniqueOrThrow({
          where: { id: inProgress.pendingRevisionId! },
          select: { status: true, resolutionReason: true },
        }),
        { status: "INVALIDATED", resolutionReason: "SAFETY_UNAVAILABLE" },
      );
      assert.equal(
        await db[0].calendarEntry.count({
          where: {
            planCommitmentId: inProgress.commitmentId,
            projectionStatus: "ACTIVE",
          },
        }),
        0,
      );

      const completedCommitment = await db[0].planCommitment.findUniqueOrThrow({
        where: { id: completed.commitmentId },
        select: {
          status: true,
          currentAcceptedRevisionId: true,
          currentPendingRevisionId: true,
          cancellationReason: true,
          safetyRestrictedAt: true,
        },
      });
      assert.ok(completedCommitment.safetyRestrictedAt);
      assert.deepEqual(
        { ...completedCommitment, safetyRestrictedAt: true },
        {
          status: "CONFIRMED",
          currentAcceptedRevisionId: completed.acceptedRevisionId,
          currentPendingRevisionId: null,
          cancellationReason: null,
          safetyRestrictedAt: true,
        },
      );
      assert.deepEqual(
        await db[0].planRequest.findUniqueOrThrow({
          where: { id: completed.pendingRevisionId! },
          select: { status: true, resolutionReason: true },
        }),
        { status: "EXPIRED", resolutionReason: "COMMITMENT_COMPLETED" },
      );
      assert.equal(
        await db[0].calendarEntry.count({
          where: {
            planCommitmentId: completed.commitmentId,
            projectionStatus: "ACTIVE",
          },
        }),
        2,
      );
      assert.deepEqual(
        await db[0].classmatePost.findUniqueOrThrow({
          where: { id: fulfilledActionId },
          select: { status: true, fulfilledByPlanId: true },
        }),
        { status: "FULFILLED", fulfilledByPlanId: upcoming.commitmentId },
      );

      const outbox = await db[0].notificationOutbox.findMany({
        where: { recipientId: ids.userB, kind: "PLAN_SAFETY_ENDED" },
        select: { destination: true, payload: true },
      });
      assert.equal(outbox.length, 1);
      assert.deepEqual(outbox[0]?.payload, {});
      assert.deepEqual(Object.keys(outbox[0]?.destination as object).sort(), [
        "notificationBatchId",
        "type",
      ]);

      const activeUpcoming = await loadCalendarEntryOccurrences(db[0], {
        userId: ids.userA,
        windowStart: new Date(now.getTime() + 3_600_000),
        windowEnd: new Date(now.getTime() + 14_400_000),
      });
      assert.equal(
        activeUpcoming.some((entry) => entry.planCommitmentId === upcoming.commitmentId),
        false,
      );
      const completedHistory = await loadCalendarEntryOccurrences(db[0], {
        userId: ids.userA,
        windowStart: new Date(now.getTime() - 10_800_000),
        windowEnd: now,
      });
      const safeHistory = completedHistory.find(
        (entry) => entry.planCommitmentId === completed.commitmentId,
      );
      assert.equal(safeHistory?.title, "Shared plan");
      assert.equal(safeHistory?.location, null);
      assert.equal(safeHistory?.note, null);
      assert.deepEqual(safeHistory?.companions, []);
      assert.deepEqual(
        await searchCalendarEntriesForUser(db[0], {
          userId: ids.userA,
          query: "Private completed title",
        }),
        [],
      );

      await db[0].$transaction(
        (tx) =>
          installPairPeerBlock(tx, {
            userId: ids.userA,
            blockedId: ids.userB,
            connectionId: ids.connection,
            endedAt: new Date(),
          }),
        transactionOptions,
      );
      assert.equal(
        await db[0].notificationOutbox.count({
          where: { recipientId: ids.userB, kind: "PLAN_SAFETY_ENDED" },
        }),
        1,
      );

      assert.deepEqual(
        await unblockUserForActor({
          db: db[0],
          blockerId: ids.userA,
          blockedId: ids.userB,
        }),
        { unblocked: true, blockedId: ids.userB },
      );
      const afterUnblock = await db[0].planCommitment.findUniqueOrThrow({
        where: { id: upcoming.commitmentId },
        select: { status: true, safetyRestrictedAt: true, safetyBlockId: true },
      });
      assert.ok(afterUnblock.safetyRestrictedAt);
      assert.deepEqual(
        { ...afterUnblock, safetyRestrictedAt: true },
        { status: "CANCELED", safetyRestrictedAt: true, safetyBlockId: null },
      );
      assert.equal(
        await db[0].productFunnelEvent.count({
          where: { name: "PLAN_SAFETY_TERMINATED" },
        }),
        0,
        "analytics actor is intentionally deferred until a system actor can be persisted",
      );
    });
  },
);

test(
  "the pair lock linearizes accept-first and Block-first commit orders",
  { skip: localDatabaseUrl ? false : "requires localhost PostgreSQL" },
  async () => {
    const { installPairPeerBlock } = await import(
      "../../lib/api/v1/pair-block-transaction"
    );

    await withFixture(async ({ db, ids }) => {
      const plan = await seedNegotiating(db[0], ids, "accept-first", {
        startTime: new Date(Date.now() + 7_200_000),
      });
      let releaseAccept!: () => void;
      let acceptLocked!: () => void;
      const release = new Promise<void>((resolve) => { releaseAccept = resolve; });
      const locked = new Promise<void>((resolve) => { acceptLocked = resolve; });
      const accept = db[0].$transaction(async (tx) => {
        const transition = await acceptLegacyPlanRevision(
          tx,
          plan.pendingRevisionId,
          {
            afterConnectionSafety: async () => {
              acceptLocked();
              await release;
            },
          },
        );
        await materializePlanCalendarEntries(tx, {
          planRequestId: plan.pendingRevisionId,
          planCommitmentId: transition.planCommitmentId,
          proposerUserId: ids.userA,
          proposerName: "A",
          receiverUserId: ids.userB,
          receiverName: "B",
          title: "Accepted before Block",
          planType: "STUDY",
          location: null,
          note: null,
          startTime: plan.startTime,
          endTime: plan.endTime,
        });
      }, transactionOptions);
      await locked;
      const block = db[1].$transaction(
        (tx) => installPairPeerBlock(tx, {
          userId: ids.userA,
          blockedId: ids.userB,
          endedAt: new Date(),
        }),
        transactionOptions,
      );
      releaseAccept();
      await Promise.all([accept, block]);
      assert.deepEqual(
        await db[0].planCommitment.findUniqueOrThrow({
          where: { id: plan.commitmentId },
          select: { status: true, cancellationReason: true },
        }),
        { status: "CANCELED", cancellationReason: "SAFETY_UNAVAILABLE" },
      );
      assert.equal(
        await db[0].calendarEntry.count({
          where: {
            planCommitmentId: plan.commitmentId,
            projectionStatus: "ACTIVE",
          },
        }),
        0,
      );
    });

    await withFixture(async ({ db, ids }) => {
      const plan = await seedNegotiating(db[0], ids, "block-first", {
        startTime: new Date(Date.now() + 7_200_000),
      });
      let releaseBlock!: () => void;
      let blockConverged!: () => void;
      const release = new Promise<void>((resolve) => { releaseBlock = resolve; });
      const converged = new Promise<void>((resolve) => { blockConverged = resolve; });
      const block = db[0].$transaction(async (tx) => {
        await installPairPeerBlock(tx, {
          userId: ids.userA,
          blockedId: ids.userB,
          endedAt: new Date(),
        });
        blockConverged();
        await release;
      }, transactionOptions);
      await converged;
      const accept = db[1].$transaction(
        (tx) => acceptLegacyPlanRevision(tx, plan.pendingRevisionId),
        transactionOptions,
      );
      releaseBlock();
      await block;
      await assert.rejects(accept, LegacyPlanTransitionConflictError);
      assert.deepEqual(
        await db[0].planCommitment.findUniqueOrThrow({
          where: { id: plan.commitmentId },
          select: { status: true, currentPendingRevisionId: true },
        }),
        { status: "CLOSED", currentPendingRevisionId: null },
      );
      assert.deepEqual(
        await db[0].planRequest.findUniqueOrThrow({
          where: { id: plan.pendingRevisionId },
          select: { status: true, resolutionReason: true },
        }),
        { status: "INVALIDATED", resolutionReason: "SAFETY_UNAVAILABLE" },
      );
    });
  },
);

test(
  "legacy Plan presentation and mutations fail closed for safety-restricted history",
  { skip: localDatabaseUrl ? false : "requires localhost PostgreSQL" },
  async () => {
    const { getPlanRequest, listPlansForUser, PlansServiceError } = await import(
      "../../lib/api/v1/plans-service"
    );

    await withFixture(async ({ db, ids }) => {
      const pending = await seedNegotiating(db[0], ids, "presentation", {
        startTime: new Date(Date.now() + 7_200_000),
      });
      await db[0].planCommitment.update({
        where: { id: pending.commitmentId },
        data: { safetyRestrictedAt: new Date() },
      });

      const listed = await listPlansForUser(ids.userA);
      assert.equal(
        listed.some((plan) => plan.id === pending.pendingRevisionId),
        false,
      );
      await assert.rejects(
        getPlanRequest({ userId: ids.userA, planId: pending.pendingRevisionId }),
        (cause: unknown) =>
          cause instanceof PlansServiceError && cause.code === "NOT_FOUND",
      );
      await assert.rejects(
        db[0].$transaction((tx) =>
          acceptLegacyPlanRevision(tx, pending.pendingRevisionId),
        ),
        LegacyPlanTransitionConflictError,
      );

      const now = Date.now();
      const completed = await seedConfirmed(db[0], ids, "outcome-restricted", {
        startTime: new Date(now - 7_200_000),
        endTime: new Date(now - 3_600_000),
        title: "Restricted completed plan",
      });
      await db[0].planCommitment.update({
        where: { id: completed.commitmentId },
        data: { safetyRestrictedAt: new Date() },
      });
      await assert.rejects(
        db[0].$transaction((tx) =>
          upsertLegacyPlanOutcome(tx, {
            planId: completed.acceptedRevisionId,
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
  "queued direct and Plan pushes are suppressed by current pair safety state",
  { skip: localDatabaseUrl ? false : "requires localhost PostgreSQL" },
  async () => {
    const { installPairPeerBlock } = await import(
      "../../lib/api/v1/pair-block-transaction"
    );
    const { isDirectChatNotificationDeliverable } = await import(
      "../../lib/push/notify-user"
    );

    await withFixture(async ({ db, ids }) => {
      assert.equal(
        await isDirectChatNotificationDeliverable({
          connectionId: ids.connection,
          senderId: ids.userA,
        }),
        true,
      );

      const plan = await seedNegotiating(db[0], ids, "push-restricted", {
        startTime: new Date(Date.now() + 7_200_000),
      });
      await db[0].planCommitment.update({
        where: { id: plan.commitmentId },
        data: { safetyRestrictedAt: new Date() },
      });
      assert.equal(
        await isDirectChatNotificationDeliverable({
          connectionId: ids.connection,
          senderId: ids.userA,
          planId: plan.pendingRevisionId,
        }),
        false,
      );

      const moderation = await db[0].moderationBlock.create({
        data: {
          userId: ids.userB,
          reason: "test",
          createdByEmail: "safety-test@example.invalid",
        },
      });
      assert.equal(
        await isDirectChatNotificationDeliverable({
          connectionId: ids.connection,
          senderId: ids.userA,
        }),
        false,
      );
      await db[0].moderationBlock.delete({ where: { id: moderation.id } });

      await db[0].$transaction(
        (tx) =>
          installPairPeerBlock(tx, {
            userId: ids.userA,
            blockedId: ids.userB,
            endedAt: new Date(),
          }),
        transactionOptions,
      );
      assert.equal(
        await isDirectChatNotificationDeliverable({
          connectionId: ids.connection,
          senderId: ids.userA,
        }),
        false,
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
  run: (fixture: { db: readonly [PrismaClient, PrismaClient]; ids: FixtureIds }) => Promise<void>,
) {
  assert.ok(localDatabaseUrl);
  const prefix = `adr001-${randomUUID().replaceAll("-", "").slice(0, 12)}`;
  const ids = {
    prefix,
    userA: `${prefix}-a`,
    userB: `${prefix}-b`,
    connection: `${prefix}-connection`,
  } as const;
  const db = [
    new PrismaClient({ datasources: { db: { url: localDatabaseUrl } } }),
    new PrismaClient({ datasources: { db: { url: localDatabaseUrl } } }),
  ] as const;
  await Promise.all(db.map((client) => client.$connect()));
  try {
    await db[0].user.createMany({
      data: [
        { id: ids.userA, username: `${prefix}_a`, hashedPassword: "test" },
        { id: ids.userB, username: `${prefix}_b`, hashedPassword: "test" },
      ],
    });
    await db[0].connection.create({
      data: { id: ids.connection, userAId: ids.userA, userBId: ids.userB },
    });
    await run({ db, ids });
  } finally {
    await db[0].user.deleteMany({ where: { id: { in: [ids.userA, ids.userB] } } });
    await Promise.all(db.map((client) => client.$disconnect()));
  }
}

async function seedNegotiating(
  db: PrismaClient,
  ids: FixtureIds,
  suffix: string,
  options: { startTime: Date },
) {
  const commitmentId = `${ids.prefix}-${suffix}-commitment`;
  const pendingRevisionId = `${ids.prefix}-${suffix}-revision`;
  const endTime = new Date(options.startTime.getTime() + 3_600_000);
  await db.$transaction(async (tx) => {
    await tx.planCommitment.create({
      data: {
        id: commitmentId,
        connectionId: ids.connection,
        participantAId: ids.userA,
        participantBId: ids.userB,
      },
    });
    await tx.planRequest.create({
      data: {
        id: pendingRevisionId,
        connectionId: ids.connection,
        commitmentId,
        revisionKind: "INITIAL",
        proposerUserId: ids.userA,
        receiverUserId: ids.userB,
        planType: "STUDY",
        title: "Pending plan",
        startTime: options.startTime,
        endTime,
      },
    });
    await tx.planCommitment.update({
      where: { id: commitmentId },
      data: { currentPendingRevisionId: pendingRevisionId },
    });
  });
  return { commitmentId, pendingRevisionId, startTime: options.startTime, endTime };
}

async function seedConfirmed(
  db: PrismaClient,
  ids: FixtureIds,
  suffix: string,
  options: {
    startTime: Date;
    endTime: Date;
    title: string;
    pendingReschedule?: boolean;
  },
) {
  const commitmentId = `${ids.prefix}-${suffix}-commitment`;
  const acceptedRevisionId = `${ids.prefix}-${suffix}-accepted`;
  const pendingRevisionId = options.pendingReschedule
    ? `${ids.prefix}-${suffix}-reschedule`
    : null;
  await db.$transaction(async (tx) => {
    await tx.planCommitment.create({
      data: {
        id: commitmentId,
        connectionId: ids.connection,
        participantAId: ids.userA,
        participantBId: ids.userB,
      },
    });
    await tx.planRequest.create({
      data: {
        id: acceptedRevisionId,
        connectionId: ids.connection,
        commitmentId,
        revisionKind: "INITIAL",
        proposerUserId: ids.userA,
        receiverUserId: ids.userB,
        planType: "STUDY",
        title: options.title,
        location: "Private place",
        message: "Private note",
        startTime: options.startTime,
        endTime: options.endTime,
        status: "ACCEPTED",
      },
    });
    if (pendingRevisionId) {
      await tx.planRequest.create({
        data: {
          id: pendingRevisionId,
          connectionId: ids.connection,
          commitmentId,
          revisionKind: "RESCHEDULE",
          counterOfId: acceptedRevisionId,
          proposerUserId: ids.userB,
          receiverUserId: ids.userA,
          planType: "STUDY",
          title: "Later",
          startTime: new Date(Date.now() + 86_400_000),
          endTime: new Date(Date.now() + 90_000_000),
        },
      });
    }
    await tx.planCommitment.update({
      where: { id: commitmentId },
      data: {
        status: "CONFIRMED",
        currentAcceptedRevisionId: acceptedRevisionId,
        currentPendingRevisionId: pendingRevisionId,
        confirmedAt: new Date(),
      },
    });
    await tx.calendarEntry.createMany({
      data: [ids.userA, ids.userB].map((userId) => ({
        userId,
        planRequestId: acceptedRevisionId,
        planCommitmentId: commitmentId,
        title: options.title,
        eventType: "STUDY" as const,
        source: "plan_request",
        location: "Private place",
        note: "Private note",
        startAt: options.startTime,
        endAt: options.endTime,
      })),
    });
    const calendarEntries = await tx.calendarEntry.findMany({
      where: { planCommitmentId: commitmentId },
      select: { id: true, userId: true },
    });
    await tx.calendarEntryCompanion.createMany({
      data: calendarEntries.map((entry) => ({
        id: `${entry.id}-companion`,
        calendarEntryId: entry.id,
        userId: entry.userId === ids.userA ? ids.userB : ids.userA,
        displayName: "Private person",
      })),
    });
  });
  return { commitmentId, acceptedRevisionId, pendingRevisionId };
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
  const forbidden = new Set([
    "database",
    "dbname",
    "host",
    "hostaddr",
    "password",
    "port",
    "service",
    "user",
  ]);
  if ([...parsed.searchParams.keys()].some((key) => forbidden.has(key.toLowerCase()))) {
    return undefined;
  }
  return value;
}
