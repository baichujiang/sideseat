import assert from "node:assert/strict";
import test from "node:test";

import { Prisma, PrismaClient } from "@prisma/client";
import pg from "pg";

import {
  appliedWorkerTransition,
  fixedActionCoordinationClock,
  runAtomicActionCoordinationCommand,
  runGuardedActionCoordinationWorkerTransition,
  skippedWorkerTransition,
} from "../../lib/v2/action-coordination/command";
import {
  BusinessFunnelEventConflictError,
  businessFunnelEventKeys,
  recordServerFunnelEvent,
} from "../../lib/v2/funnel-event-producer";
import {
  NotificationOutboxConflictError,
  enqueueNotificationOutboxItem,
  notificationOutboxSourceKeys,
} from "../../lib/v2/notification-outbox-producer";

const { Client } = pg;
const localDatabaseUrl = localPostgresUrl(process.env.DATABASE_URL);
const fixedNow = new Date("2026-08-30T20:15:16.789Z");
const transactionOptions = { maxWait: 5_000, timeout: 10_000 } as const;

test("BL-BE-05 PostgreSQL tests refuse non-local effective database targets", () => {
  assert.equal(
    localPostgresUrl("postgresql://user:password@example.invalid:5432/database"),
    undefined,
  );
  assert.equal(localPostgresUrl("mysql://localhost/database"), undefined);
  assert.equal(
    localPostgresUrl(
      "postgresql://user:password@localhost:5433/database?host=prod.example&port=6543",
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
  "domain, receipt, authoritative event, and outbox are one visible atomic commit",
  { skip: localDatabaseUrl ? false : "requires a localhost PostgreSQL DATABASE_URL" },
  async () => {
    await withFixtureSchema(2, async ({ admin, prisma: [commandDb] }) => {
      const entered = deferred<void>();
      const release = deferred<void>();
      const event = interestEvent("atomic-event", "atomic-activation");
      const notification = interestNotification(event.businessEventKey, "atomic-notification");
      const request = commandRequest("atomic-commit-0001", "atomic-resource");

      const pending = runAtomicActionCoordinationCommand(
        {
          request,
          pairs: [["creator-1", "interested-1"]],
          execute: async ({ tx, now }) => {
            await tx.$executeRaw(Prisma.sql`
              INSERT INTO "DomainProbe" ("id", "state", "observedAt")
              VALUES ('atomic-domain', 'COMMITTED', ${now})
            `);
            await recordServerFunnelEvent(tx, event);
            await enqueueNotificationOutboxItem(tx, notification);
            entered.resolve();
            await release.promise;
            return { status: 201, body: { id: "atomic-domain" } };
          },
        },
        {
          db: commandDb,
          clock: fixedActionCoordinationClock(fixedNow),
          transactionOptions,
        },
      );
      await entered.promise;
      assert.deepEqual(await effectCounts(admin), {
        receipts: 0,
        domain: 0,
        events: 0,
        outbox: 0,
      });
      release.resolve();
      const result = await pending;
      assert.equal(result.kind, "executed");
      assert.deepEqual(await effectCounts(admin), {
        receipts: 1,
        domain: 1,
        events: 1,
        outbox: 1,
      });
    });
  },
);

test(
  "an unknown failure rolls domain, receipt, event, and outbox back and the request can retry",
  { skip: localDatabaseUrl ? false : "requires a localhost PostgreSQL DATABASE_URL" },
  async () => {
    await withFixtureSchema(1, async ({ admin, prisma: [commandDb] }) => {
      const request = commandRequest("atomic-rollback-0001", "rollback-resource");
      const event = interestEvent("rollback-event", "rollback-activation");
      const notification = interestNotification(
        event.businessEventKey,
        "rollback-notification",
      );
      let fail = true;
      const execute = async ({ tx, now }: AtomicContext) => {
        await tx.$executeRaw(Prisma.sql`
          INSERT INTO "DomainProbe" ("id", "state", "observedAt")
          VALUES ('rollback-domain', 'COMMITTED', ${now})
        `);
        await recordServerFunnelEvent(tx, event);
        await enqueueNotificationOutboxItem(tx, notification);
        if (fail) throw new Error("injected transition failure");
        return { status: 201, body: { id: "rollback-domain" } } as const;
      };
      const dependencies = {
        db: commandDb,
        clock: fixedActionCoordinationClock(fixedNow),
        transactionOptions,
      };

      await assert.rejects(
        runAtomicActionCoordinationCommand(
          { request, pairs: [["creator-1", "interested-1"]], execute },
          dependencies,
        ),
        /injected transition failure/,
      );
      assert.deepEqual(await effectCounts(admin), {
        receipts: 0,
        domain: 0,
        events: 0,
        outbox: 0,
      });

      fail = false;
      const retried = await runAtomicActionCoordinationCommand(
        { request, pairs: [["interested-1", "creator-1"]], execute },
        dependencies,
      );
      assert.equal(retried.kind, "executed");
      assert.deepEqual(await effectCounts(admin), {
        receipts: 1,
        domain: 1,
        events: 1,
        outbox: 1,
      });
    });
  },
);

test(
  "event and outbox retries deduplicate, while key reuse for another fact aborts",
  { skip: localDatabaseUrl ? false : "requires a localhost PostgreSQL DATABASE_URL" },
  async () => {
    await withFixtureSchema(1, async ({ prisma: [db] }) => {
      const event = interestEvent("dedupe-event", "dedupe-activation");
      const notification = interestNotification(
        event.businessEventKey,
        "dedupe-notification",
      );
      await db.$transaction(async (tx) => {
        const firstEvent = await recordServerFunnelEvent(tx, event);
        const secondEvent = await recordServerFunnelEvent(tx, {
          ...event,
          occurredAt: new Date(fixedNow.getTime() + 5_000),
        });
        assert.equal(firstEvent.created, true);
        assert.equal(secondEvent.created, false);
        assert.equal(firstEvent.event.id, secondEvent.event.id);

        const firstNotification = await enqueueNotificationOutboxItem(
          tx,
          notification,
        );
        const secondNotification = await enqueueNotificationOutboxItem(tx, {
          ...notification,
          availableAt: new Date(fixedNow.getTime() + 5_000),
        });
        assert.equal(firstNotification.created, true);
        assert.equal(secondNotification.created, false);
        assert.equal(firstNotification.item.id, secondNotification.item.id);
      });
      assert.equal(await tableCount(db, "ProductFunnelEvent"), 1);
      assert.equal(await tableCount(db, "NotificationOutbox"), 1);

      await assert.rejects(
        db.$transaction((tx) =>
          recordServerFunnelEvent(tx, { ...event, actorId: "another-user" }),
        ),
        BusinessFunnelEventConflictError,
      );
      await assert.rejects(
        db.$transaction((tx) =>
          enqueueNotificationOutboxItem(tx, {
            ...notification,
            destination: {
              type: "ACTION_RESPONSES",
              actionId: "another-action",
              interestId: "interest-1",
            },
          }),
        ),
        NotificationOutboxConflictError,
      );
      assert.equal(await tableCount(db, "ProductFunnelEvent"), 1);
      assert.equal(await tableCount(db, "NotificationOutbox"), 1);
    });
  },
);

test(
  "concurrent producer retries converge to one event and one outbox item",
  { skip: localDatabaseUrl ? false : "requires a localhost PostgreSQL DATABASE_URL" },
  async () => {
    await withFixtureSchema(2, async ({ admin, prisma: [firstDb, secondDb] }) => {
      const event = interestEvent("concurrent-event", "concurrent-activation");
      const notification = interestNotification(
        event.businessEventKey,
        "concurrent-notification",
      );
      const write = (db: PrismaClient) =>
        db.$transaction(async (tx) => ({
          event: await recordServerFunnelEvent(tx, event),
          outbox: await enqueueNotificationOutboxItem(tx, notification),
        }));
      const [first, second] = await Promise.all([write(firstDb), write(secondDb)]);
      assert.deepEqual(
        [first.event.created, second.event.created].sort(),
        [false, true],
      );
      assert.deepEqual(
        [first.outbox.created, second.outbox.created].sort(),
        [false, true],
      );
      assert.equal(first.event.event.id, second.event.event.id);
      assert.equal(first.outbox.item.id, second.outbox.item.id);
      assert.equal(await tableCount(admin, "ProductFunnelEvent"), 1);
      assert.equal(await tableCount(admin, "NotificationOutbox"), 1);
    });
  },
);

test(
  "a guarded worker transition has one domain winner, one event/outbox, and no HTTP receipt",
  { skip: localDatabaseUrl ? false : "requires a localhost PostgreSQL DATABASE_URL" },
  async () => {
    await withFixtureSchema(2, async ({ admin, prisma: [firstDb, secondDb] }) => {
      await admin.query(`
        INSERT INTO "WorkerProbe" ("id", "state") VALUES ('worker-transition', 'PENDING')
      `);
      const eventKey = businessFunnelEventKeys.coordinationEnded("context-1");
      const transition = (db: PrismaClient) =>
        runGuardedActionCoordinationWorkerTransition(
          {
            transition: async ({ tx, now }) => {
              const winners = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
                UPDATE "WorkerProbe"
                SET "state" = 'ENDED', "observedAt" = ${now}
                WHERE "id" = 'worker-transition' AND "state" = 'PENDING'
                RETURNING "id"
              `);
              if (!winners[0]) return skippedWorkerTransition();
              await recordServerFunnelEvent(tx, {
                businessEventKey: eventKey,
                actorId: "creator-1",
                name: "COORDINATION_ENDED",
                surface: "CHAT",
                connectionId: "connection-1",
                actionContextId: "context-1",
                coordinationPolicy: "CREATOR_GATED_V2",
                policySchemaVersion: 1,
                occurredAt: now,
              });
              await enqueueNotificationOutboxItem(tx, {
                kind: "COORDINATION_ENDED",
                recipientId: "interested-1",
                sourceKey:
                  notificationOutboxSourceKeys.forBusinessEvent(eventKey),
                destination: {
                  type: "ACTION_CONTEXT",
                  connectionId: "connection-1",
                  contextId: "context-1",
                },
                availableAt: now,
              });
              return appliedWorkerTransition(winners[0].id);
            },
          },
          {
            db,
            clock: fixedActionCoordinationClock(fixedNow),
            transactionOptions,
          },
        );
      const results = await Promise.all([transition(firstDb), transition(secondDb)]);
      assert.deepEqual(
        results.map((result) => result.kind).sort(),
        ["applied", "not_applicable"],
      );
      assert.deepEqual(await effectCounts(admin), {
        receipts: 0,
        domain: 0,
        events: 1,
        outbox: 1,
      });
    });
  },
);

type AtomicContext = Parameters<
  Parameters<typeof runAtomicActionCoordinationCommand>[0]["execute"]
>[0];

function commandRequest(idempotencyKey: string, resourceId: string) {
  return {
    actorId: "creator-1",
    idempotencyKey,
    operation: { method: "POST" as const, operationId: "testBlBe05Effects" },
    canonicalResource: { kind: "ACTION", id: resourceId },
    pathParameters: { actionId: resourceId },
    body: { interestSurface: "ACTION_DETAIL" },
  };
}

function interestEvent(suffix: string, activationId: string) {
  return {
    businessEventKey: businessFunnelEventKeys.actionInterested(activationId),
    actorId: "interested-1",
    name: "ACTION_INTERESTED" as const,
    surface: "ACTION_DETAIL" as const,
    sourceKind: "BUDDY_POST" as const,
    sourceId: `post-${suffix}`,
    actionInterestId: `interest-${suffix}`,
    interestActivationId: activationId,
    interestSurface: "ACTION_DETAIL" as const,
    coordinationPolicy: "CREATOR_GATED_V2" as const,
    policySchemaVersion: 1,
    experimentKey: "action_to_plan_creator_gated_v2",
    experimentVariant: "TREATMENT" as const,
    occurredAt: fixedNow,
  };
}

function interestNotification(
  businessEventKey: ReturnType<
    typeof businessFunnelEventKeys.actionInterested
  >,
  suffix: string,
) {
  return {
    kind: "ACTION_INTERESTED" as const,
    recipientId: "creator-1",
    sourceKey:
      notificationOutboxSourceKeys.forBusinessEvent(businessEventKey),
    destination: {
      type: "ACTION_RESPONSES" as const,
      actionId: `post-${suffix}`,
      interestId: `interest-${suffix}`,
    },
    availableAt: fixedNow,
  };
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
  const schema = `bl_be05_${process.pid}_${Math.random().toString(36).slice(2, 10)}`;
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
    CREATE TYPE "ProductFunnelEventName" AS ENUM (
      'OPPORTUNITY_IMPRESSION',
      'OPPORTUNITY_OPEN',
      'ACTION_INTERESTED',
      'ACTION_INTEREST_WITHDRAWN',
      'ACTION_RESPONSE_VIEWED',
      'ACTION_RESPONSE_HIDDEN',
      'ACTION_RESPONSE_RESTORED',
      'COORDINATION_RESERVED',
      'COORDINATION_RELEASED',
      'ACTION_CONNECTED',
      'FIRST_HUMAN_RESPONSE',
      'COORDINATION_ENDED',
      'ACTION_INTEREST_TERMINATED',
      'CONVERSATION_OPENED',
      'PLAN_PROPOSED',
      'PLAN_ACCEPTED',
      'PLAN_COUNTERED',
      'PLAN_DECLINED',
      'PLAN_WITHDRAWN',
      'PLAN_EXPIRED',
      'PLAN_RESCHEDULE_PROPOSED',
      'PLAN_RESCHEDULE_ACCEPTED',
      'PLAN_CANCELED',
      'PLAN_SAFETY_TERMINATED',
      'OUTCOME_RECORDED'
    );
    CREATE TYPE "ProductFunnelSurface" AS ENUM (
      'DISCOVER_RECOMMENDED', 'DISCOVER_EXPLORE', 'ACTION_DETAIL',
      'CHAT', 'PLAN_CENTER', 'SMALL_GROUP'
    );
    CREATE TYPE "ProductFunnelSourceKind" AS ENUM (
      'BUDDY_POST', 'COURSE_ACTION', 'DISCOVER_ACTIVITY', 'PLAN', 'SMALL_GROUP'
    );
    CREATE TYPE "ActionInterestSurface" AS ENUM ('FEED_CARD', 'ACTION_DETAIL');
    CREATE TYPE "ActionFirstContentType" AS ENUM ('MESSAGE', 'PLAN');
    CREATE TYPE "ActionInterestTerminalReason" AS ENUM (
      'ACTION_FULFILLED_BEFORE_CONNECT',
      'ACTION_EXPIRED_BEFORE_CONNECT',
      'INTEREST_WITHDRAWN_BEFORE_CONNECT',
      'SAFETY_UNAVAILABLE_BEFORE_CONNECT'
    );
    CREATE TYPE "ActionCoordinationPolicy" AS ENUM (
      'DIRECT_CONVERSATION_V1', 'CREATOR_GATED_V2'
    );
    CREATE TYPE "ExperimentVariant" AS ENUM ('CONTROL', 'TREATMENT');

    CREATE TABLE "ApiIdempotencyRecord" (
      "id" TEXT NOT NULL,
      "scope" TEXT NOT NULL,
      "requestHash" TEXT NOT NULL,
      "responseStatus" INTEGER,
      "responseBody" JSONB,
      "expiresAt" TIMESTAMP(3) NOT NULL,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL,
      CONSTRAINT "ApiIdempotencyRecord_pkey" PRIMARY KEY ("id")
    );

    CREATE TABLE "DomainProbe" (
      "id" TEXT NOT NULL,
      "state" TEXT NOT NULL,
      "observedAt" TIMESTAMP(3) NOT NULL,
      CONSTRAINT "DomainProbe_pkey" PRIMARY KEY ("id")
    );

    CREATE TABLE "WorkerProbe" (
      "id" TEXT NOT NULL,
      "state" TEXT NOT NULL,
      "observedAt" TIMESTAMP(3),
      CONSTRAINT "WorkerProbe_pkey" PRIMARY KEY ("id")
    );

    CREATE TABLE "ProductFunnelEvent" (
      "id" TEXT NOT NULL,
      "clientEventId" UUID NOT NULL,
      "businessEventKey" VARCHAR(191),
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
      "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "ProductFunnelEvent_pkey" PRIMARY KEY ("id"),
      CONSTRAINT "ProductFunnelEvent_clientEventId_key" UNIQUE ("clientEventId"),
      CONSTRAINT "ProductFunnelEvent_businessEventKey_key" UNIQUE ("businessEventKey")
    );

    CREATE TABLE "NotificationOutbox" (
      "id" TEXT NOT NULL,
      "dedupeKey" VARCHAR(191) NOT NULL,
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
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "NotificationOutbox_pkey" PRIMARY KEY ("id"),
      CONSTRAINT "NotificationOutbox_dedupeKey_key" UNIQUE ("dedupeKey")
    );
  `);
}

async function effectCounts(client: InstanceType<typeof Client>) {
  // pg clients execute one query at a time; keep this sequential so the test
  // itself does not depend on the deprecated implicit query queue.
  const receipts = await tableCount(client, "ApiIdempotencyRecord");
  const domain = await tableCount(client, "DomainProbe");
  const events = await tableCount(client, "ProductFunnelEvent");
  const outbox = await tableCount(client, "NotificationOutbox");
  return { receipts, domain, events, outbox };
}

async function tableCount(
  client: InstanceType<typeof Client> | PrismaClient,
  table:
    | "ApiIdempotencyRecord"
    | "DomainProbe"
    | "ProductFunnelEvent"
    | "NotificationOutbox",
): Promise<number> {
  if (client instanceof PrismaClient) {
    const rows = await client.$queryRaw<Array<{ count: bigint }>>(Prisma.sql`
      SELECT COUNT(*)::BIGINT AS "count" FROM ${Prisma.raw(`"${table}"`)}
    `);
    return Number(rows[0].count);
  }
  const result = await client.query<{ count: string }>(
    `SELECT COUNT(*)::TEXT AS count FROM "${table}"`,
  );
  return Number(result.rows[0].count);
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}
