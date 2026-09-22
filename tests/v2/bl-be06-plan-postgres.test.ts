import assert from "node:assert/strict";
import test from "node:test";

import { PrismaClient } from "@prisma/client";
import pg from "pg";

import { fixedActionCoordinationClock } from "../../lib/v2/action-coordination/command";
import {
  BusinessFunnelEventConflictError,
  businessFunnelEventKeys,
  deterministicBusinessEventClientId,
} from "../../lib/v2/funnel-event-producer";
import {
  finalizeStablePlanCommitment,
  finalizeStablePlanRevision,
} from "../../lib/v2/plan-lifecycle-finalizer";

const { Client } = pg;
const localDatabaseUrl = localPostgresUrl(process.env.DATABASE_URL);
const fixedNow = new Date("2026-08-30T20:15:16.789Z");
const transactionOptions = { maxWait: 5_000, timeout: 10_000 } as const;

test("BL-BE-06 Plan tests refuse non-local effective database targets", () => {
  assert.equal(
    localPostgresUrl("postgresql://user:password@example.invalid:5432/database"),
    undefined,
  );
  assert.equal(localPostgresUrl("mysql://localhost/database"), undefined);
  assert.equal(
    localPostgresUrl(
      "postgresql://user:password@localhost:5433/database?host=prod.example",
    ),
    undefined,
  );
  assert.equal(
    localPostgresUrl(
      "postgresql://user:password@127.0.0.1:5433/database?schema=public",
    ),
    "postgresql://user:password@127.0.0.1:5433/database?schema=public",
  );
});

test(
  "stale INITIAL closes empty negotiation and atomically emits one event plus two ID-only notifications",
  { skip: localDatabaseUrl ? false : "requires a localhost PostgreSQL DATABASE_URL" },
  async () => {
    await withFixtureSchema(1, async ({ admin, prisma: [db] }) => {
      await seedInitial(admin, {
        commitmentId: "commitment-initial",
        revisionId: "revision-initial",
        startTime: new Date(fixedNow.getTime() - 60_000),
      });
      const before = await untouchedState(admin, "commitment-initial");

      const result = await finalizeStablePlanRevision("revision-initial", {
        db,
        clock: fixedActionCoordinationClock(fixedNow),
        transactionOptions,
      });
      assert.deepEqual(result, {
        kind: "applied",
        value: {
          commitmentId: "commitment-initial",
          revisionId: "revision-initial",
          revisionKind: "INITIAL",
          resolutionReason: "TIME_EXPIRED",
          commitmentStatus: "CLOSED",
          derivedCompleted: false,
        },
      });

      assert.deepEqual(await revisionState(admin, "revision-initial"), {
        status: "EXPIRED",
        resolutionReason: "TIME_EXPIRED",
        resolvedAt: fixedNow.toISOString(),
        resolvedByUserId: null,
      });
      assert.deepEqual(await commitmentState(admin, "commitment-initial"), {
        status: "CLOSED",
        currentAcceptedRevisionId: null,
        currentPendingRevisionId: null,
      });
      assert.deepEqual(await untouchedState(admin, "commitment-initial"), before);

      const events = await admin.query<{
        businessEventKey: string;
        actorId: string;
        name: string;
        surface: string;
        sourceKind: string;
        sourceId: string;
        connectionId: string;
        planCommitmentId: string;
        planRevisionId: string;
        coordinationPolicy: string;
        policySchemaVersion: number;
        experimentKey: string;
        experimentVariant: string;
      }>(`
        SELECT
          "businessEventKey", "actorId", "name", "surface", "sourceKind",
          "sourceId", "connectionId", "planCommitmentId", "planRevisionId",
          "coordinationPolicy", "policySchemaVersion", "experimentKey",
          "experimentVariant"
        FROM "ProductFunnelEvent"
      `);
      assert.deepEqual(events.rows, [
        {
          businessEventKey: "plan-revision:revision-initial:expired",
          actorId: "user-a",
          name: "PLAN_EXPIRED",
          surface: "PLAN_CENTER",
          sourceKind: "PLAN",
          sourceId: "revision-initial",
          connectionId: "connection-1",
          planCommitmentId: "commitment-initial",
          planRevisionId: "revision-initial",
          coordinationPolicy: "CREATOR_GATED_V2",
          policySchemaVersion: 2,
          experimentKey: "action_to_plan_creator_gated_v2",
          experimentVariant: "TREATMENT",
        },
      ]);

      const outbox = await admin.query<{
        recipientId: string;
        kind: string;
        destination: Record<string, string>;
        payload: Record<string, never>;
      }>(`
        SELECT "recipientId", "kind", "destination", "payload"
        FROM "NotificationOutbox"
        ORDER BY "recipientId"
      `);
      assert.deepEqual(outbox.rows, [
        {
          recipientId: "user-a",
          kind: "PLAN_EXPIRED",
          destination: {
            type: "PLAN",
            connectionId: "connection-1",
            commitmentId: "commitment-initial",
            revisionId: "revision-initial",
          },
          payload: {},
        },
        {
          recipientId: "user-b",
          kind: "PLAN_EXPIRED",
          destination: {
            type: "PLAN",
            connectionId: "connection-1",
            commitmentId: "commitment-initial",
            revisionId: "revision-initial",
          },
          payload: {},
        },
      ]);

      const repeated = await finalizeStablePlanCommitment("commitment-initial", {
        db,
        clock: fixedActionCoordinationClock(
          new Date(fixedNow.getTime() + 60_000),
        ),
        transactionOptions,
      });
      assert.equal(repeated.kind, "not_applicable");
      assert.deepEqual(await effectCounts(admin), { events: 1, outbox: 2 });
    });
  },
);

test(
  "stale RESCHEDULE preserves accepted Plan, CONFIRMED commitment, and Calendar projections",
  { skip: localDatabaseUrl ? false : "requires a localhost PostgreSQL DATABASE_URL" },
  async () => {
    await withFixtureSchema(1, async ({ admin, prisma: [db] }) => {
      await seedReschedule(admin, {
        commitmentId: "commitment-reschedule",
        acceptedRevisionId: "revision-accepted",
        pendingRevisionId: "revision-reschedule",
        acceptedStart: new Date(fixedNow.getTime() + 3_600_000),
        acceptedEnd: new Date(fixedNow.getTime() + 7_200_000),
        pendingStart: new Date(fixedNow.getTime() - 1_000),
        pendingEnd: new Date(fixedNow.getTime() + 3_599_000),
      });
      const before = await untouchedState(admin, "commitment-reschedule");

      const result = await finalizeStablePlanCommitment(
        "commitment-reschedule",
        {
          db,
          clock: fixedActionCoordinationClock(fixedNow),
          transactionOptions,
        },
      );
      assert.equal(result.kind, "applied");
      if (result.kind !== "applied") return;
      assert.equal(result.value.resolutionReason, "TIME_EXPIRED");
      assert.equal(result.value.derivedCompleted, false);
      assert.deepEqual(await commitmentState(admin, "commitment-reschedule"), {
        status: "CONFIRMED",
        currentAcceptedRevisionId: "revision-accepted",
        currentPendingRevisionId: null,
      });
      assert.deepEqual(await revisionState(admin, "revision-accepted"), {
        status: "ACCEPTED",
        resolutionReason: null,
        resolvedAt: null,
        resolvedByUserId: null,
      });
      assert.deepEqual(await revisionState(admin, "revision-reschedule"), {
        status: "EXPIRED",
        resolutionReason: "TIME_EXPIRED",
        resolvedAt: fixedNow.toISOString(),
        resolvedByUserId: null,
      });
      assert.deepEqual(await untouchedState(admin, "commitment-reschedule"), before);
      assert.deepEqual(await effectCounts(admin), { events: 1, outbox: 2 });
    });
  },
);

test(
  "accepted completion wins over replacement TIME_EXPIRED and stays a derived CONFIRMED history fact",
  { skip: localDatabaseUrl ? false : "requires a localhost PostgreSQL DATABASE_URL" },
  async () => {
    await withFixtureSchema(1, async ({ admin, prisma: [db] }) => {
      await seedReschedule(admin, {
        commitmentId: "commitment-completed",
        acceptedRevisionId: "revision-completed",
        pendingRevisionId: "revision-after-completion",
        acceptedStart: new Date(fixedNow.getTime() - 7_200_000),
        acceptedEnd: new Date(fixedNow.getTime() - 1),
        pendingStart: new Date(fixedNow.getTime() - 60_000),
        pendingEnd: new Date(fixedNow.getTime() + 60_000),
      });

      const result = await finalizeStablePlanRevision(
        "revision-after-completion",
        {
          db,
          clock: fixedActionCoordinationClock(fixedNow),
          transactionOptions,
        },
      );
      assert.equal(result.kind, "applied");
      if (result.kind !== "applied") return;
      assert.equal(result.value.resolutionReason, "COMMITMENT_COMPLETED");
      assert.equal(result.value.derivedCompleted, true);
      assert.equal(result.value.commitmentStatus, "CONFIRMED");
      assert.deepEqual(await revisionState(admin, "revision-after-completion"), {
        status: "EXPIRED",
        resolutionReason: "COMMITMENT_COMPLETED",
        resolvedAt: fixedNow.toISOString(),
        resolvedByUserId: null,
      });
      assert.deepEqual(await commitmentState(admin, "commitment-completed"), {
        status: "CONFIRMED",
        currentAcceptedRevisionId: "revision-completed",
        currentPendingRevisionId: null,
      });
    });
  },
);

test(
  "legacy, null-kind, and non-current revision targets are conservative no-ops",
  { skip: localDatabaseUrl ? false : "requires a localhost PostgreSQL DATABASE_URL" },
  async () => {
    await withFixtureSchema(1, async ({ admin, prisma: [db] }) => {
      await seedInitial(admin, {
        commitmentId: "commitment-null-kind",
        revisionId: "revision-null-kind",
        startTime: new Date(fixedNow.getTime() - 60_000),
        revisionKind: null,
      });
      await insertRevision(admin, {
        id: "revision-legacy",
        commitmentId: null,
        revisionKind: null,
        status: "PENDING",
        proposerUserId: "user-a",
        receiverUserId: "user-b",
        startTime: new Date(fixedNow.getTime() - 60_000),
        endTime: new Date(fixedNow.getTime() + 60_000),
      });
      await insertRevision(admin, {
        id: "revision-not-current",
        commitmentId: "commitment-null-kind",
        revisionKind: "INITIAL",
        status: "PENDING",
        proposerUserId: "user-a",
        receiverUserId: "user-b",
        startTime: new Date(fixedNow.getTime() - 60_000),
        endTime: new Date(fixedNow.getTime() + 60_000),
      });
      await admin.query(
        `
          INSERT INTO "PlanCommitment" (
            "id", "connectionId", "participantAId", "participantBId",
            "originActionId", "status", "currentAcceptedRevisionId",
            "currentPendingRevisionId", "updatedAt"
          ) VALUES (
            'commitment-pointer-mismatch', 'connection-1', 'user-a', 'user-b',
            NULL, 'NEGOTIATING', NULL, 'revision-pointer-mismatch', $1
          )
        `,
        [pgTimestamp(fixedNow)],
      );
      await insertRevision(admin, {
        id: "revision-pointer-mismatch",
        commitmentId: "commitment-null-kind",
        revisionKind: "INITIAL",
        status: "PENDING",
        proposerUserId: "user-a",
        receiverUserId: "user-b",
        startTime: new Date(fixedNow.getTime() - 60_000),
        endTime: new Date(fixedNow.getTime() + 60_000),
      });

      for (const revisionId of [
        "revision-null-kind",
        "revision-legacy",
        "revision-not-current",
      ]) {
        const result = await finalizeStablePlanRevision(revisionId, {
          db,
          clock: fixedActionCoordinationClock(fixedNow),
          transactionOptions,
        });
        assert.equal(result.kind, "not_applicable");
      }
      const pointerMismatch = await finalizeStablePlanCommitment(
        "commitment-pointer-mismatch",
        {
          db,
          clock: fixedActionCoordinationClock(fixedNow),
          transactionOptions,
        },
      );
      assert.equal(pointerMismatch.kind, "not_applicable");
      assert.equal(
        (await revisionState(admin, "revision-null-kind")).status,
        "PENDING",
      );
      assert.deepEqual(await effectCounts(admin), { events: 0, outbox: 0 });
    });
  },
);

test(
  "concurrent guarded finalizers converge on one revision transition, one event, and two notifications",
  { skip: localDatabaseUrl ? false : "requires a localhost PostgreSQL DATABASE_URL" },
  async () => {
    await withFixtureSchema(2, async ({ admin, prisma: [firstDb, secondDb] }) => {
      await seedInitial(admin, {
        commitmentId: "commitment-concurrent",
        revisionId: "revision-concurrent",
        startTime: new Date(fixedNow.getTime() - 60_000),
      });
      const finalize = (db: PrismaClient) =>
        finalizeStablePlanRevision("revision-concurrent", {
          db,
          clock: fixedActionCoordinationClock(fixedNow),
          transactionOptions,
        });
      const results = await Promise.all([finalize(firstDb), finalize(secondDb)]);
      assert.deepEqual(
        results.map((result) => result.kind).sort(),
        ["applied", "not_applicable"],
      );
      assert.deepEqual(await effectCounts(admin), { events: 1, outbox: 2 });
      assert.equal(
        (await revisionState(admin, "revision-concurrent")).status,
        "EXPIRED",
      );
    });
  },
);

test(
  "an authoritative event identity conflict rolls back revision and commitment writes",
  { skip: localDatabaseUrl ? false : "requires a localhost PostgreSQL DATABASE_URL" },
  async () => {
    await withFixtureSchema(1, async ({ admin, prisma: [db] }) => {
      await seedInitial(admin, {
        commitmentId: "commitment-rollback",
        revisionId: "revision-rollback",
        startTime: new Date(fixedNow.getTime() - 60_000),
      });
      const key = businessFunnelEventKeys.planExpired("revision-rollback");
      await admin.query(
        `
          INSERT INTO "ProductFunnelEvent" (
            "id", "clientEventId", "businessEventKey", "actorId", "name",
            "surface", "sourceKind", "sourceId", "connectionId",
            "planRequestId", "planCommitmentId", "planRevisionId", "occurredAt"
          ) VALUES (
            'conflicting-event', $1, $2, 'wrong-actor', 'PLAN_EXPIRED',
            'PLAN_CENTER', 'PLAN', 'revision-rollback', 'connection-1',
            'revision-rollback', 'commitment-rollback', 'revision-rollback', $3
          )
        `,
        [deterministicBusinessEventClientId(key), key, pgTimestamp(fixedNow)],
      );

      await assert.rejects(
        finalizeStablePlanRevision("revision-rollback", {
          db,
          clock: fixedActionCoordinationClock(fixedNow),
          transactionOptions,
        }),
        BusinessFunnelEventConflictError,
      );
      assert.equal(
        (await revisionState(admin, "revision-rollback")).status,
        "PENDING",
      );
      assert.deepEqual(await commitmentState(admin, "commitment-rollback"), {
        status: "NEGOTIATING",
        currentAcceptedRevisionId: null,
        currentPendingRevisionId: "revision-rollback",
      });
      assert.deepEqual(await effectCounts(admin), { events: 1, outbox: 0 });
    });
  },
);

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

function prismaUrlForSchema(value: string, schema: string): string {
  const parsed = new URL(value);
  parsed.searchParams.set("schema", schema);
  return parsed.toString();
}

function pgUrl(value: string): string {
  const parsed = new URL(value);
  parsed.searchParams.delete("schema");
  return parsed.toString();
}

async function withFixtureSchema(
  clientCount: number,
  run: (fixture: {
    admin: InstanceType<typeof Client>;
    prisma: PrismaClient[];
  }) => Promise<void>,
): Promise<void> {
  assert.ok(localDatabaseUrl);
  const schema = `bl_be06_plan_${process.pid}_${Math.random().toString(36).slice(2, 10)}`;
  assert.match(schema, /^[a-z0-9_]+$/);
  const admin = new Client({ connectionString: pgUrl(localDatabaseUrl) });
  const clients = Array.from(
    { length: clientCount },
    () =>
      new PrismaClient({
        datasources: {
          db: { url: prismaUrlForSchema(localDatabaseUrl, schema) },
        },
      }),
  );
  await admin.connect();
  try {
    await admin.query(`CREATE SCHEMA "${schema}"`);
    await admin.query(`SET search_path TO "${schema}"`);
    await admin.query(`SET TIME ZONE 'UTC'`);
    await createFixtureTables(admin);
    await Promise.all(clients.map((client) => client.$connect()));
    await run({ admin, prisma: clients });
  } finally {
    await Promise.all(
      clients.map((client) => client.$disconnect().catch(() => undefined)),
    );
    await admin.query("ROLLBACK").catch(() => undefined);
    await admin.query("RESET search_path").catch(() => undefined);
    await admin
      .query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`)
      .catch(() => undefined);
    await admin.end();
  }
}

async function createFixtureTables(
  client: InstanceType<typeof Client>,
): Promise<void> {
  await client.query(`
    CREATE TYPE "PlanRequestStatus" AS ENUM (
      'PENDING', 'ACCEPTED', 'DECLINED', 'COUNTER_PROPOSED', 'CANCELED',
      'EXPIRED', 'INVALIDATED'
    );
    CREATE TYPE "PlanResolutionReason" AS ENUM (
      'PROPOSER_WITHDREW', 'RECEIVER_DECLINED', 'COMMITMENT_CANCELED',
      'COMMITMENT_COMPLETED', 'SOURCE_FULFILLED', 'SOURCE_REMOVED',
      'SAFETY_UNAVAILABLE', 'TIME_EXPIRED'
    );
    CREATE TYPE "PlanCommitmentStatus" AS ENUM (
      'NEGOTIATING', 'CONFIRMED', 'CLOSED', 'CANCELED'
    );
    CREATE TYPE "PlanRevisionKind" AS ENUM ('INITIAL', 'RESCHEDULE');
    CREATE TYPE "ActionCoordinationPolicy" AS ENUM (
      'DIRECT_CONVERSATION_V1', 'CREATOR_GATED_V2'
    );
    CREATE TYPE "ExperimentVariant" AS ENUM ('CONTROL', 'TREATMENT');
    CREATE TYPE "ProductFunnelEventName" AS ENUM (
      'OPPORTUNITY_IMPRESSION', 'OPPORTUNITY_OPEN', 'ACTION_INTERESTED',
      'ACTION_INTEREST_WITHDRAWN', 'ACTION_RESPONSE_VIEWED',
      'ACTION_RESPONSE_HIDDEN', 'ACTION_RESPONSE_RESTORED',
      'COORDINATION_RESERVED', 'COORDINATION_RELEASED', 'ACTION_CONNECTED',
      'FIRST_HUMAN_RESPONSE', 'COORDINATION_ENDED',
      'ACTION_INTEREST_TERMINATED', 'CONVERSATION_OPENED', 'PLAN_PROPOSED',
      'PLAN_ACCEPTED', 'PLAN_COUNTERED', 'PLAN_DECLINED', 'PLAN_WITHDRAWN',
      'PLAN_EXPIRED', 'PLAN_RESCHEDULE_PROPOSED', 'PLAN_RESCHEDULE_ACCEPTED',
      'PLAN_CANCELED', 'PLAN_SAFETY_TERMINATED', 'OUTCOME_RECORDED'
    );
    CREATE TYPE "ProductFunnelSurface" AS ENUM (
      'DISCOVER_RECOMMENDED', 'DISCOVER_EXPLORE', 'ACTION_DETAIL', 'CHAT',
      'PLAN_CENTER', 'SMALL_GROUP'
    );
    CREATE TYPE "ProductFunnelSourceKind" AS ENUM (
      'BUDDY_POST', 'COURSE_ACTION', 'DISCOVER_ACTIVITY', 'PLAN', 'SMALL_GROUP'
    );
    CREATE TYPE "ActionInterestSurface" AS ENUM ('FEED_CARD', 'ACTION_DETAIL');
    CREATE TYPE "ActionFirstContentType" AS ENUM ('MESSAGE', 'PLAN');
    CREATE TYPE "ActionInterestTerminalReason" AS ENUM (
      'ACTION_FULFILLED_BEFORE_CONNECT', 'ACTION_EXPIRED_BEFORE_CONNECT',
      'INTEREST_WITHDRAWN_BEFORE_CONNECT', 'SAFETY_UNAVAILABLE_BEFORE_CONNECT'
    );

    CREATE TABLE "ClassmatePost" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "fulfilledByPlanId" TEXT,
      "coordinationPolicy" "ActionCoordinationPolicy",
      "policySchemaVersion" INTEGER,
      "experimentKeySnapshot" TEXT,
      "experimentVariantSnapshot" "ExperimentVariant"
    );

    CREATE TABLE "PlanCommitment" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "connectionId" TEXT NOT NULL,
      "participantAId" TEXT NOT NULL,
      "participantBId" TEXT NOT NULL,
      "originActionId" TEXT,
      "status" "PlanCommitmentStatus" NOT NULL,
      "currentAcceptedRevisionId" TEXT,
      "currentPendingRevisionId" TEXT,
      "updatedAt" TIMESTAMP(3) NOT NULL
    );

    CREATE TABLE "PlanRequest" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "connectionId" TEXT NOT NULL,
      "commitmentId" TEXT,
      "revisionKind" "PlanRevisionKind",
      "status" "PlanRequestStatus" NOT NULL,
      "resolutionReason" "PlanResolutionReason",
      "resolvedAt" TIMESTAMP(3),
      "resolvedByUserId" TEXT,
      "proposerUserId" TEXT NOT NULL,
      "receiverUserId" TEXT NOT NULL,
      "actionInterestId" TEXT,
      "startTime" TIMESTAMP(3) NOT NULL,
      "endTime" TIMESTAMP(3) NOT NULL,
      "updatedAt" TIMESTAMP(3) NOT NULL
    );

    CREATE TABLE "Connection" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "marker" TEXT NOT NULL
    );
    CREATE TABLE "ActionCoordinationContext" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "connectionId" TEXT NOT NULL,
      "marker" TEXT NOT NULL
    );
    CREATE TABLE "CalendarEntry" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "planCommitmentId" TEXT,
      "userId" TEXT NOT NULL,
      "marker" TEXT NOT NULL
    );

    CREATE TABLE "ProductFunnelEvent" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "clientEventId" UUID NOT NULL UNIQUE,
      "businessEventKey" VARCHAR(191) UNIQUE,
      "actorId" TEXT NOT NULL,
      "name" "ProductFunnelEventName" NOT NULL,
      "surface" "ProductFunnelSurface" NOT NULL,
      "sourceKind" "ProductFunnelSourceKind",
      "sourceId" TEXT,
      "connectionId" TEXT,
      "planRequestId" TEXT,
      "actionInterestId" TEXT,
      "interestActivationId" TEXT,
      "actionContextId" TEXT,
      "planCommitmentId" TEXT,
      "planRevisionId" TEXT,
      "interestSurface" "ActionInterestSurface",
      "firstContentType" "ActionFirstContentType",
      "terminalReason" "ActionInterestTerminalReason",
      "coordinationPolicy" "ActionCoordinationPolicy",
      "policySchemaVersion" INTEGER,
      "experimentKey" TEXT,
      "experimentVariant" "ExperimentVariant",
      "metadata" JSONB,
      "occurredAt" TIMESTAMP(3) NOT NULL,
      "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE "NotificationOutbox" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "dedupeKey" VARCHAR(191) NOT NULL UNIQUE,
      "kind" VARCHAR(64) NOT NULL,
      "recipientId" TEXT NOT NULL,
      "destination" JSONB NOT NULL,
      "payloadVersion" INTEGER NOT NULL,
      "payload" JSONB NOT NULL,
      "attemptCount" INTEGER NOT NULL DEFAULT 0,
      "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "lastAttemptAt" TIMESTAMP(3),
      "deliveredAt" TIMESTAMP(3),
      "deadLetterAt" TIMESTAMP(3),
      "lastErrorCode" VARCHAR(64),
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
}

async function seedInitial(
  client: InstanceType<typeof Client>,
  options: {
    commitmentId: string;
    revisionId: string;
    startTime: Date;
    revisionKind?: "INITIAL" | null;
  },
): Promise<void> {
  await seedSharedRows(client, options.commitmentId);
  await client.query(
    `
      INSERT INTO "PlanCommitment" (
        "id", "connectionId", "participantAId", "participantBId",
        "originActionId", "status", "currentAcceptedRevisionId",
        "currentPendingRevisionId", "updatedAt"
      ) VALUES ($1, 'connection-1', 'user-a', 'user-b', 'action-1',
        'NEGOTIATING', NULL, $2, $3)
    `,
    [options.commitmentId, options.revisionId, pgTimestamp(fixedNow)],
  );
  await insertRevision(client, {
    id: options.revisionId,
    commitmentId: options.commitmentId,
    revisionKind:
      options.revisionKind === undefined ? "INITIAL" : options.revisionKind,
    status: "PENDING",
    proposerUserId: "user-a",
    receiverUserId: "user-b",
    startTime: options.startTime,
    endTime: new Date(options.startTime.getTime() + 3_600_000),
  });
}

async function seedReschedule(
  client: InstanceType<typeof Client>,
  options: {
    commitmentId: string;
    acceptedRevisionId: string;
    pendingRevisionId: string;
    acceptedStart: Date;
    acceptedEnd: Date;
    pendingStart: Date;
    pendingEnd: Date;
  },
): Promise<void> {
  await seedSharedRows(client, options.commitmentId, options.commitmentId);
  await client.query(
    `
      INSERT INTO "PlanCommitment" (
        "id", "connectionId", "participantAId", "participantBId",
        "originActionId", "status", "currentAcceptedRevisionId",
        "currentPendingRevisionId", "updatedAt"
      ) VALUES ($1, 'connection-1', 'user-a', 'user-b', 'action-1',
        'CONFIRMED', $2, $3, $4)
    `,
    [
      options.commitmentId,
      options.acceptedRevisionId,
      options.pendingRevisionId,
      pgTimestamp(fixedNow),
    ],
  );
  await insertRevision(client, {
    id: options.acceptedRevisionId,
    commitmentId: options.commitmentId,
    revisionKind: "INITIAL",
    status: "ACCEPTED",
    proposerUserId: "user-b",
    receiverUserId: "user-a",
    startTime: options.acceptedStart,
    endTime: options.acceptedEnd,
  });
  await insertRevision(client, {
    id: options.pendingRevisionId,
    commitmentId: options.commitmentId,
    revisionKind: "RESCHEDULE",
    status: "PENDING",
    proposerUserId: "user-a",
    receiverUserId: "user-b",
    startTime: options.pendingStart,
    endTime: options.pendingEnd,
  });
}

async function seedSharedRows(
  client: InstanceType<typeof Client>,
  commitmentId: string,
  fulfilledByPlanId: string | null = null,
): Promise<void> {
  await client.query(
    `
      INSERT INTO "ClassmatePost" (
        "id", "fulfilledByPlanId", "coordinationPolicy",
        "policySchemaVersion", "experimentKeySnapshot",
        "experimentVariantSnapshot"
      ) VALUES (
        'action-1', $1, 'CREATOR_GATED_V2', 2,
        'action_to_plan_creator_gated_v2', 'TREATMENT'
      )
    `,
    [fulfilledByPlanId],
  );
  await client.query(`
    INSERT INTO "Connection" ("id", "marker")
      VALUES ('connection-1', 'connection-unchanged');
    INSERT INTO "ActionCoordinationContext" ("id", "connectionId", "marker")
      VALUES ('context-1', 'connection-1', 'context-unchanged')
  `);
  await client.query(
    `
      INSERT INTO "CalendarEntry" ("id", "planCommitmentId", "userId", "marker")
      VALUES
        ('calendar-a', $1, 'user-a', 'calendar-a-unchanged'),
        ('calendar-b', $1, 'user-b', 'calendar-b-unchanged')
    `,
    [commitmentId],
  );
}

async function insertRevision(
  client: InstanceType<typeof Client>,
  options: {
    id: string;
    commitmentId: string | null;
    revisionKind: "INITIAL" | "RESCHEDULE" | null;
    status: "PENDING" | "ACCEPTED";
    proposerUserId: string;
    receiverUserId: string;
    startTime: Date;
    endTime: Date;
  },
): Promise<void> {
  await client.query(
    `
      INSERT INTO "PlanRequest" (
        "id", "connectionId", "commitmentId", "revisionKind", "status",
        "proposerUserId", "receiverUserId", "actionInterestId",
        "startTime", "endTime", "updatedAt"
      ) VALUES ($1, 'connection-1', $2, $3, $4, $5, $6, 'interest-1', $7, $8, $9)
    `,
    [
      options.id,
      options.commitmentId,
      options.revisionKind,
      options.status,
      options.proposerUserId,
      options.receiverUserId,
      pgTimestamp(options.startTime),
      pgTimestamp(options.endTime),
      pgTimestamp(fixedNow),
    ],
  );
}

async function revisionState(
  client: InstanceType<typeof Client>,
  revisionId: string,
) {
  const result = await client.query<{
    status: string;
    resolutionReason: string | null;
    resolvedAt: string | null;
    resolvedByUserId: string | null;
  }>(
    `
      SELECT
        "status",
        "resolutionReason",
        CASE
          WHEN "resolvedAt" IS NULL THEN NULL
          ELSE to_char("resolvedAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
        END AS "resolvedAt",
        "resolvedByUserId"
      FROM "PlanRequest" WHERE "id" = $1
    `,
    [revisionId],
  );
  return result.rows[0];
}

async function commitmentState(
  client: InstanceType<typeof Client>,
  commitmentId: string,
) {
  const result = await client.query<{
    status: string;
    currentAcceptedRevisionId: string | null;
    currentPendingRevisionId: string | null;
  }>(
    `
      SELECT "status", "currentAcceptedRevisionId", "currentPendingRevisionId"
      FROM "PlanCommitment" WHERE "id" = $1
    `,
    [commitmentId],
  );
  return result.rows[0];
}

async function untouchedState(
  client: InstanceType<typeof Client>,
  commitmentId: string,
) {
  const action = await client.query(
    `SELECT * FROM "ClassmatePost" ORDER BY "id"`,
  );
  const connection = await client.query(
    `SELECT * FROM "Connection" ORDER BY "id"`,
  );
  const context = await client.query(
    `SELECT * FROM "ActionCoordinationContext" ORDER BY "id"`,
  );
  const calendar = await client.query(
    `SELECT * FROM "CalendarEntry" WHERE "planCommitmentId" = $1 ORDER BY "id"`,
    [commitmentId],
  );
  return {
    action: action.rows,
    connection: connection.rows,
    context: context.rows,
    calendar: calendar.rows,
  };
}

async function effectCounts(client: InstanceType<typeof Client>) {
  const events = await tableCount(client, "ProductFunnelEvent");
  const outbox = await tableCount(client, "NotificationOutbox");
  return { events, outbox };
}

async function tableCount(
  client: InstanceType<typeof Client>,
  table: "ProductFunnelEvent" | "NotificationOutbox",
): Promise<number> {
  const result = await client.query<{ count: string }>(
    `SELECT COUNT(*)::TEXT AS count FROM "${table}"`,
  );
  return Number(result.rows[0].count);
}

function pgTimestamp(value: Date): string {
  return value.toISOString().replace("T", " ").replace(/Z$/, "");
}
