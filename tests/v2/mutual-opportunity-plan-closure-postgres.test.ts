import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import Module from "node:module";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { PrismaClient, type Prisma } from "@prisma/client";

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
const nextServerStub = fileURLToPath(
  new URL("./next-server-after-test-stub.cjs", import.meta.url),
);
commonJsModule._resolveFilename = function resolveForServerContractTest(
  request,
  parent,
  isMain,
  options,
) {
  if (request === "server-only") return serverOnlyStub;
  if (request === "next/server") return nextServerStub;
  return resolveFilename.call(this, request, parent, isMain, options);
};

const localDatabaseUrl = localPostgresUrl(process.env.DATABASE_URL);
const transactionOptions = { maxWait: 10_000, timeout: 30_000 } as const;

test("Mutual Plan closure PostgreSQL tests refuse non-local database targets", () => {
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
  "Mutual source creates one stable Plan, accept closes only its discovery supply, and Block cancels both projections",
  { skip: localDatabaseUrl ? false : "requires localhost PostgreSQL" },
  async () => {
    const plans = await import("../../lib/api/v1/plans-service");
    const opportunities = await import("../../lib/v2/mutual-opportunities");
    const { installPairPeerBlock } = await import(
      "../../lib/api/v1/pair-block-transaction"
    );

    await withFixture(async ({ db, ids }) => {
      const graph = await seedMutualGraph(db, ids);
      const planStart = new Date(Date.now() + 2 * 3_600_000);
      const planEnd = new Date(planStart.getTime() + 3_600_000);
      const createInput = {
        userId: ids.userA,
        connectionId: ids.connection,
        receiverUserId: ids.userB,
        title: "Study together",
        location: "Library",
        message: "Bring notes",
        startTime: planStart.toISOString(),
        endTime: planEnd.toISOString(),
        planType: "STUDY" as const,
        origin: {
          kind: "MUTUAL_OPPORTUNITY" as const,
          id: graph.sourceOpportunity,
        },
      };

      const created = await plans.createDirectPlanRequest(createInput);
      assert.ok(created.plan.commitmentId);
      assert.equal(created.plan.origin?.id, graph.sourceOpportunity);
      const commitmentId = created.plan.commitmentId;
      const planId = created.plan.id;

      assert.deepEqual(
        await db.planCommitment.findUniqueOrThrow({
          where: { id: commitmentId },
          select: {
            status: true,
            participantAId: true,
            participantBId: true,
            currentAcceptedRevisionId: true,
            currentPendingRevisionId: true,
          },
        }),
        {
          status: "NEGOTIATING",
          participantAId: ids.userA,
          participantBId: ids.userB,
          currentAcceptedRevisionId: null,
          currentPendingRevisionId: planId,
        },
      );
      assert.deepEqual(
        await db.planRequest.findUniqueOrThrow({
          where: { id: planId },
          select: {
            status: true,
            revisionKind: true,
            commitmentId: true,
            originKind: true,
            originId: true,
          },
        }),
        {
          status: "PENDING",
          revisionKind: "INITIAL",
          commitmentId,
          originKind: "MUTUAL_OPPORTUNITY",
          originId: graph.sourceOpportunity,
        },
      );

      await expectPlanConflict(
        plans.createDirectPlanRequest(createInput),
        plans.PlansServiceError,
      );
      assert.equal(
        await db.planRequest.count({
          where: {
            originKind: "MUTUAL_OPPORTUNITY",
            originId: graph.sourceOpportunity,
            status: "PENDING",
          },
        }),
        1,
      );

      const accepted = await plans.acceptPlanRequest({
        userId: ids.userB,
        planId,
      });
      assert.equal(accepted.status, "ACCEPTED");
      assert.equal(accepted.commitmentId, commitmentId);
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
          currentAcceptedRevisionId: planId,
          currentPendingRevisionId: null,
        },
      );
      assert.deepEqual(
        await db.calendarEntry.findMany({
          where: { planCommitmentId: commitmentId },
          select: { userId: true, projectionStatus: true },
          orderBy: { userId: "asc" },
        }),
        [ids.userA, ids.userB]
          .sort()
          .map((userId) => ({ userId, projectionStatus: "ACTIVE" })),
      );

      const intentRows = await db.weeklyIntent.findMany({
        where: {
          id: {
            in: [
              graph.sourceIntentA,
              graph.sourceIntentB,
              graph.otherIntentA,
              graph.otherIntentB,
            ],
          },
        },
        select: { id: true, status: true },
      });
      const statusByIntent = new Map(
        intentRows.map((row) => [row.id, row.status]),
      );
      assert.equal(statusByIntent.get(graph.sourceIntentA), "ENDED");
      assert.equal(statusByIntent.get(graph.sourceIntentB), "ENDED");
      assert.equal(statusByIntent.get(graph.otherIntentA), "ACTIVE");
      assert.equal(statusByIntent.get(graph.otherIntentB), "ACTIVE");
      assert.equal(
        (
          await db.mutualOpportunity.findUniqueOrThrow({
            where: { id: graph.sourceSiblingOpportunity },
            select: { status: true },
          })
        ).status,
        "UNAVAILABLE",
      );
      assert.equal(
        (
          await db.mutualOpportunity.findUniqueOrThrow({
            where: { id: graph.unrelatedOpportunity },
            select: { status: true },
          })
        ).status,
        "PENDING",
      );
      assert.equal(
        (
          await db.mutualOpportunity.findUniqueOrThrow({
            where: { id: graph.sourceOpportunity },
            select: { status: true },
          })
        ).status,
        "MUTUAL",
      );

      const together = await opportunities.listMutualOpportunities(
        ids.userA,
        false,
      );
      assert.equal(
        together.opportunities.some(
          (opportunity) => opportunity.id === graph.sourceOpportunity,
        ),
        false,
      );
      await expectPlanConflict(
        plans.createDirectPlanRequest(createInput),
        plans.PlansServiceError,
      );

      const blocked = await db.$transaction(
        (tx) =>
          installPairPeerBlock(tx, {
            userId: ids.userA,
            blockedId: ids.userB,
            connectionId: ids.connection,
            endedAt: new Date(),
          }),
        transactionOptions,
      );
      assert.equal(blocked.kind, "blocked");
      assert.deepEqual(
        await db.planCommitment.findUniqueOrThrow({
          where: { id: commitmentId },
          select: { status: true, cancellationReason: true },
        }),
        { status: "CANCELED", cancellationReason: "SAFETY_UNAVAILABLE" },
      );
      assert.equal(
        await db.calendarEntry.count({
          where: {
            planCommitmentId: commitmentId,
            projectionStatus: "ACTIVE",
          },
        }),
        0,
      );
      assert.equal(
        await db.calendarEntry.count({
          where: {
            planCommitmentId: commitmentId,
            projectionStatus: "CANCELED",
          },
        }),
        2,
      );
    });
  },
);

test(
  "an elapsed Mutual proposal is lazily finalized before the same source is proposed again",
  { skip: localDatabaseUrl ? false : "requires localhost PostgreSQL" },
  async () => {
    const plans = await import("../../lib/api/v1/plans-service");
    await withFixture(async ({ db, ids }) => {
      const graph = await seedMutualGraph(db, ids);
      const firstStart = new Date(Date.now() + 90 * 60_000);
      const first = await plans.createDirectPlanRequest({
        userId: ids.userA,
        connectionId: ids.connection,
        receiverUserId: ids.userB,
        title: "First proposal",
        startTime: firstStart.toISOString(),
        endTime: new Date(firstStart.getTime() + 60 * 60_000).toISOString(),
        origin: {
          kind: "MUTUAL_OPPORTUNITY",
          id: graph.sourceOpportunity,
        },
      });
      assert.ok(first.plan.commitmentId);

      const elapsedStart = new Date(Date.now() - 2 * 60_000);
      await db.planRequest.update({
        where: { id: first.plan.id },
        data: {
          startTime: elapsedStart,
          endTime: new Date(elapsedStart.getTime() + 60 * 60_000),
        },
      });

      const secondStart = new Date(Date.now() + 3 * 3_600_000);
      const second = await plans.createDirectPlanRequest({
        userId: ids.userA,
        connectionId: ids.connection,
        receiverUserId: ids.userB,
        title: "Replacement proposal",
        startTime: secondStart.toISOString(),
        endTime: new Date(secondStart.getTime() + 60 * 60_000).toISOString(),
        origin: {
          kind: "MUTUAL_OPPORTUNITY",
          id: graph.sourceOpportunity,
        },
      });
      assert.ok(second.plan.commitmentId);
      assert.notEqual(second.plan.commitmentId, first.plan.commitmentId);
      assert.deepEqual(
        await db.planRequest.findUniqueOrThrow({
          where: { id: first.plan.id },
          select: { status: true, resolutionReason: true },
        }),
        { status: "EXPIRED", resolutionReason: "TIME_EXPIRED" },
      );
      assert.deepEqual(
        await db.planCommitment.findUniqueOrThrow({
          where: { id: first.plan.commitmentId },
          select: { status: true, currentPendingRevisionId: true },
        }),
        { status: "CLOSED", currentPendingRevisionId: null },
      );
      assert.deepEqual(
        await db.planCommitment.findUniqueOrThrow({
          where: { id: second.plan.commitmentId },
          select: { status: true, currentPendingRevisionId: true },
        }),
        { status: "NEGOTIATING", currentPendingRevisionId: second.plan.id },
      );
    });
  },
);

type FixtureIds = Readonly<{
  prefix: string;
  userA: string;
  userB: string;
  userC: string;
  userD: string;
  connection: string;
}>;

type MutualGraph = Readonly<{
  sourceIntentA: string;
  sourceIntentB: string;
  otherIntentA: string;
  otherIntentB: string;
  sourceOpportunity: string;
  sourceSiblingOpportunity: string;
  unrelatedOpportunity: string;
}>;

async function withFixture(
  run: (fixture: { db: PrismaClient; ids: FixtureIds }) => Promise<void>,
): Promise<void> {
  assert.ok(localDatabaseUrl);
  const prefix = `mutual-plan-${randomUUID().replaceAll("-", "").slice(0, 12)}`;
  const ids = {
    prefix,
    userA: `${prefix}-a`,
    userB: `${prefix}-b`,
    userC: `${prefix}-c`,
    userD: `${prefix}-d`,
    connection: `${prefix}-connection`,
  } as const;
  const db = new PrismaClient({
    datasources: { db: { url: localDatabaseUrl } },
  });
  await db.$connect();
  try {
    await db.user.createMany({
      data: [
        { id: ids.userA, username: `${prefix}_a`, hashedPassword: "test" },
        { id: ids.userB, username: `${prefix}_b`, hashedPassword: "test" },
        { id: ids.userC, username: `${prefix}_c`, hashedPassword: "test" },
        { id: ids.userD, username: `${prefix}_d`, hashedPassword: "test" },
      ],
    });
    await db.connection.create({
      data: {
        id: ids.connection,
        userAId: ids.userA,
        userBId: ids.userB,
      },
    });
    await run({ db, ids });
  } finally {
    await db.user.deleteMany({
      where: {
        id: { in: [ids.userA, ids.userB, ids.userC, ids.userD] },
      },
    });
    await db.$disconnect();
  }
}

async function seedMutualGraph(
  db: PrismaClient,
  ids: FixtureIds,
): Promise<MutualGraph> {
  const graph = {
    sourceIntentA: `${ids.prefix}-intent-a-source`,
    sourceIntentB: `${ids.prefix}-intent-b-source`,
    otherIntentA: `${ids.prefix}-intent-a-other`,
    otherIntentB: `${ids.prefix}-intent-b-other`,
    sourceOpportunity: `${ids.prefix}-opportunity-source`,
    sourceSiblingOpportunity: `${ids.prefix}-opportunity-source-sibling`,
    unrelatedOpportunity: `${ids.prefix}-opportunity-unrelated`,
  } as const;
  const startsAt = new Date(Date.now() + 6 * 3_600_000);
  const endsAt = new Date(startsAt.getTime() + 2 * 3_600_000);
  const expiresAt = new Date(startsAt.getTime() - 15 * 60_000);
  const intentExpiresAt = new Date(Date.now() + 6 * 24 * 3_600_000);
  const timeWindows = [
    { startAt: startsAt.toISOString(), endAt: endsAt.toISOString() },
  ] satisfies Prisma.InputJsonArray;
  await db.weeklyIntent.createMany({
    data: [
      {
        id: graph.sourceIntentA,
        userId: ids.userA,
        topic: "STUDY",
        timeWindows,
        expiresAt: intentExpiresAt,
      },
      {
        id: graph.sourceIntentB,
        userId: ids.userB,
        topic: "STUDY",
        timeWindows,
        expiresAt: intentExpiresAt,
      },
      {
        id: graph.otherIntentA,
        userId: ids.userA,
        topic: "COFFEE",
        timeWindows,
        expiresAt: intentExpiresAt,
      },
      {
        id: graph.otherIntentB,
        userId: ids.userB,
        topic: "COFFEE",
        timeWindows,
        expiresAt: intentExpiresAt,
      },
      {
        id: `${ids.prefix}-intent-c-source`,
        userId: ids.userC,
        topic: "STUDY",
        timeWindows,
        expiresAt: intentExpiresAt,
      },
    ],
  });
  const snapshot = {
    version: 1,
    sourceKind: "MUTUAL_OPPORTUNITY",
    title: "Study together",
    startsAt: startsAt.toISOString(),
    endsAt: endsAt.toISOString(),
    location: null,
    planType: "STUDY",
    participantIds: [ids.userA, ids.userB],
  } satisfies Prisma.InputJsonObject;
  await db.mutualOpportunity.createMany({
    data: [
      {
        id: graph.sourceOpportunity,
        userAId: ids.userA,
        userBId: ids.userB,
        intentAId: graph.sourceIntentA,
        intentBId: graph.sourceIntentB,
        topic: "STUDY",
        startsAt,
        endsAt,
        expiresAt,
        status: "MUTUAL",
        contextSnapshot: {
          ...snapshot,
          sourceId: graph.sourceOpportunity,
        },
        connectionId: ids.connection,
        activatedAt: new Date(),
      },
      {
        id: graph.sourceSiblingOpportunity,
        userAId: ids.userA,
        userBId: ids.userC,
        intentAId: graph.sourceIntentA,
        intentBId: `${ids.prefix}-intent-c-source`,
        topic: "STUDY",
        startsAt,
        endsAt,
        expiresAt,
        status: "PENDING",
        contextSnapshot: {
          ...snapshot,
          sourceId: graph.sourceSiblingOpportunity,
          participantIds: [ids.userA, ids.userC],
        },
      },
      {
        id: graph.unrelatedOpportunity,
        userAId: ids.userA,
        userBId: ids.userB,
        intentAId: graph.otherIntentA,
        intentBId: graph.otherIntentB,
        topic: "COFFEE",
        startsAt,
        endsAt,
        expiresAt,
        status: "PENDING",
        contextSnapshot: {
          ...snapshot,
          sourceId: graph.unrelatedOpportunity,
          title: "Coffee together",
          planType: "CUSTOM",
        },
      },
    ],
  });
  return graph;
}

async function expectPlanConflict(
  operation: Promise<unknown>,
  PlansServiceError: new (...args: never[]) => Error & { code: string },
): Promise<void> {
  await assert.rejects(operation, (cause: unknown) => {
    assert.ok(cause instanceof PlansServiceError);
    assert.equal(cause.code, "CONFLICT");
    return true;
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
