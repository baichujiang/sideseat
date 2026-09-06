import assert from "node:assert/strict";
import test from "node:test";

import { PrismaClient } from "@prisma/client";
import pg from "pg";

import { fixedActionCoordinationClock } from "../../lib/v2/action-coordination/command";
import {
  finalizeActionExpiry,
  recoverExpiredReservationLease,
} from "../../lib/v2/action-lifecycle-finalizer";

const { Client } = pg;
const localDatabaseUrl = localPostgresUrl(process.env.DATABASE_URL);
const fixedNow = new Date("2026-08-30T18:00:00.000Z");
const transactionOptions = { maxWait: 5_000, timeout: 10_000 } as const;

type ContextStateRow = {
  id: string;
  state: string;
  reservationId: string | null;
  reservationGeneration: number;
  leaseExpiresAt: Date | null;
};

type ActivationStateRow = {
  id: string;
  terminalReason: string | null;
  terminalAt: string | null;
};

test("BL-BE-06 Action lifecycle tests refuse non-local database targets", () => {
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
  "Action expiry persists EXPIRED, drains only pre-Connect contexts, and emits no rejection notification",
  { skip: localDatabaseUrl ? false : "requires a localhost PostgreSQL DATABASE_URL" },
  async () => {
    await withFixtureSchema(1, async ({ admin, prisma: [db] }) => {
      await seedAction(admin, {
        actionId: "action-due",
        status: "ACTIVE",
        expiresAt: new Date("2026-08-30T17:59:00.000Z"),
      });
      await seedCoordination(admin, {
        suffix: "waiting",
        actionId: "action-due",
        responderId: "responder-waiting",
        state: "WAITING",
        generation: 1,
      });
      await seedCoordination(admin, {
        suffix: "initiating",
        actionId: "action-due",
        responderId: "responder-initiating",
        state: "INITIATING",
        generation: 4,
        reservationId: "123e4567-e89b-42d3-a456-426614174001",
        leaseExpiresAt: new Date("2026-08-30T18:04:00.000Z"),
      });
      await seedCoordination(admin, {
        suffix: "open",
        actionId: "action-due",
        responderId: "responder-open",
        state: "OPEN",
        generation: 2,
        connectedAt: new Date("2026-08-30T17:30:00.000Z"),
      });
      await seedCoordination(admin, {
        suffix: "historical-terminal",
        actionId: "action-due",
        responderId: "responder-historical",
        state: "WAITING",
        generation: 1,
        terminalReason: "INTEREST_WITHDRAWN_BEFORE_CONNECT",
        terminalAt: new Date("2026-08-30T17:45:00.000Z"),
      });

      const first = await finalizeActionExpiry(
        "action-due",
        lifecycleDependencies(db),
      );
      assert.equal(first.kind, "applied", JSON.stringify(first));
      assert.deepEqual(
        first.kind === "applied" ? first.value : null,
        {
          actionId: "action-due",
          previousStatus: "ACTIVE",
          expiredAt: fixedNow,
          unavailableContextIds: [
            "context-historical-terminal",
            "context-initiating",
            "context-waiting",
          ],
          releasedContextIds: ["context-initiating"],
          terminalizedActivationIds: [
            "activation-initiating",
            "activation-waiting",
          ],
        },
      );

      const action = await row(admin, `
        SELECT "status",
          to_char("expiredAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "expiredAt"
        FROM "ClassmatePost" WHERE "id" = 'action-due'
      `);
      assert.equal(action.status, "EXPIRED");
      assert.equal(action.expiredAt, fixedNow.toISOString());

      const contexts = await admin.query<ContextStateRow>(`
        SELECT "id", "state", "reservationId", "reservationGeneration", "leaseExpiresAt"
        FROM "ActionCoordinationContext"
        ORDER BY "id"
      `);
      assert.deepEqual(
        contexts.rows.map((item: ContextStateRow) => ({
          ...item,
          leaseExpiresAt: item.leaseExpiresAt?.toISOString() ?? null,
        })),
        [
          {
            id: "context-historical-terminal",
            state: "UNAVAILABLE",
            reservationId: null,
            reservationGeneration: 1,
            leaseExpiresAt: null,
          },
          {
            id: "context-initiating",
            state: "UNAVAILABLE",
            reservationId: null,
            reservationGeneration: 4,
            leaseExpiresAt: null,
          },
          {
            id: "context-open",
            state: "OPEN",
            reservationId: null,
            reservationGeneration: 2,
            leaseExpiresAt: null,
          },
          {
            id: "context-waiting",
            state: "UNAVAILABLE",
            reservationId: null,
            reservationGeneration: 1,
            leaseExpiresAt: null,
          },
        ],
      );

      const activations = await admin.query<ActivationStateRow>(`
        SELECT "id", "terminalReason",
          to_char("terminalAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "terminalAt"
        FROM "ActionInterestActivation"
        ORDER BY "id"
      `);
      assert.deepEqual(
        activations.rows.map((item: ActivationStateRow) => ({
          id: item.id,
          terminalReason: item.terminalReason,
          terminalAt: item.terminalAt,
        })),
        [
          {
            id: "activation-historical-terminal",
            terminalReason: "INTEREST_WITHDRAWN_BEFORE_CONNECT",
            terminalAt: "2026-08-30T17:45:00.000Z",
          },
          {
            id: "activation-initiating",
            terminalReason: "ACTION_EXPIRED_BEFORE_CONNECT",
            terminalAt: fixedNow.toISOString(),
          },
          { id: "activation-open", terminalReason: null, terminalAt: null },
          {
            id: "activation-waiting",
            terminalReason: "ACTION_EXPIRED_BEFORE_CONNECT",
            terminalAt: fixedNow.toISOString(),
          },
        ],
      );
      assert.equal(
        await scalarCount(admin, `SELECT COUNT(*) FROM "ActionInterest" WHERE "status" = 'ACTIVE'`),
        4,
      );

      const events = await admin.query<{
        name: string;
        actorId: string;
        actionContextId: string;
        terminalReason: string | null;
      }>(`
        SELECT "name", "actorId", "actionContextId", "terminalReason"
        FROM "ProductFunnelEvent"
        ORDER BY "name", "actionContextId"
      `);
      assert.deepEqual(events.rows, [
        {
          name: "COORDINATION_RELEASED",
          actorId: "creator-1",
          actionContextId: "context-initiating",
          terminalReason: null,
        },
        {
          name: "ACTION_INTEREST_TERMINATED",
          actorId: "responder-initiating",
          actionContextId: "context-initiating",
          terminalReason: "ACTION_EXPIRED_BEFORE_CONNECT",
        },
        {
          name: "ACTION_INTEREST_TERMINATED",
          actorId: "responder-waiting",
          actionContextId: "context-waiting",
          terminalReason: "ACTION_EXPIRED_BEFORE_CONNECT",
        },
      ]);
      assert.equal(await scalarCount(admin, `SELECT COUNT(*) FROM "NotificationOutbox"`), 0);

      const repeat = await finalizeActionExpiry(
        "action-due",
        lifecycleDependencies(db),
      );
      assert.equal(repeat.kind, "not_applicable");
      assert.equal(await scalarCount(admin, `SELECT COUNT(*) FROM "ProductFunnelEvent"`), 3);
    });
  },
);

test(
  "Action expiry accepts CLOSED due Actions but never overwrites future, FULFILLED, or REMOVED state",
  { skip: localDatabaseUrl ? false : "requires a localhost PostgreSQL DATABASE_URL" },
  async () => {
    await withFixtureSchema(1, async ({ admin, prisma: [db] }) => {
      await seedAction(admin, {
        actionId: "action-closed",
        status: "CLOSED",
        expiresAt: new Date("2026-08-30T17:00:00.000Z"),
      });
      await seedAction(admin, {
        actionId: "action-future",
        status: "ACTIVE",
        expiresAt: new Date("2026-08-31T17:00:00.000Z"),
      });
      await seedAction(admin, {
        actionId: "action-fulfilled",
        status: "FULFILLED",
        expiresAt: new Date("2026-08-30T17:00:00.000Z"),
      });
      await seedAction(admin, {
        actionId: "action-removed",
        status: "REMOVED",
        expiresAt: new Date("2026-08-30T17:00:00.000Z"),
      });

      assert.equal(
        (await finalizeActionExpiry("action-closed", lifecycleDependencies(db))).kind,
        "applied",
      );
      for (const actionId of [
        "action-future",
        "action-fulfilled",
        "action-removed",
      ]) {
        assert.equal(
          (await finalizeActionExpiry(actionId, lifecycleDependencies(db))).kind,
          "not_applicable",
        );
      }
      const states = await admin.query<{ id: string; status: string }>(`
        SELECT "id", "status" FROM "ClassmatePost" ORDER BY "id"
      `);
      assert.deepEqual(states.rows, [
        { id: "action-closed", status: "EXPIRED" },
        { id: "action-fulfilled", status: "FULFILLED" },
        { id: "action-future", status: "ACTIVE" },
        { id: "action-removed", status: "REMOVED" },
      ]);
    });
  },
);

test(
  "concurrent Action finalizers converge on one transition and deterministic events",
  { skip: localDatabaseUrl ? false : "requires a localhost PostgreSQL DATABASE_URL" },
  async () => {
    await withFixtureSchema(2, async ({ admin, prisma: [firstDb, secondDb] }) => {
      await seedAction(admin, {
        actionId: "action-concurrent",
        status: "ACTIVE",
        expiresAt: new Date("2026-08-30T17:00:00.000Z"),
      });
      await seedCoordination(admin, {
        suffix: "concurrent",
        actionId: "action-concurrent",
        responderId: "responder-concurrent",
        state: "INITIATING",
        generation: 2,
        reservationId: "123e4567-e89b-42d3-a456-426614174002",
        leaseExpiresAt: new Date("2026-08-30T18:05:00.000Z"),
      });

      const results = await Promise.all([
        finalizeActionExpiry("action-concurrent", lifecycleDependencies(firstDb)),
        finalizeActionExpiry("action-concurrent", lifecycleDependencies(secondDb)),
      ]);
      assert.deepEqual(
        results.map((result) => result.kind).sort(),
        ["applied", "not_applicable"],
        JSON.stringify(results),
      );
      assert.equal(await scalarCount(admin, `SELECT COUNT(*) FROM "ProductFunnelEvent"`), 2);
      assert.equal(
        await scalarCount(
          admin,
          `SELECT COUNT(*) FROM "ProductFunnelEvent" WHERE "businessEventKey" IS NOT NULL`,
        ),
        2,
      );
      assert.equal(await scalarCount(admin, `SELECT COUNT(*) FROM "NotificationOutbox"`), 0);
    });
  },
);

test(
  "unknown expiry failure rolls back Action, Context, Activation, and events atomically",
  { skip: localDatabaseUrl ? false : "requires a localhost PostgreSQL DATABASE_URL" },
  async () => {
    await withFixtureSchema(1, async ({ admin, prisma: [db] }) => {
      await seedAction(admin, {
        actionId: "action-invalid-generation",
        status: "ACTIVE",
        expiresAt: new Date("2026-08-30T17:00:00.000Z"),
      });
      await seedCoordination(admin, {
        suffix: "invalid-generation",
        actionId: "action-invalid-generation",
        responderId: "responder-invalid-generation",
        state: "INITIATING",
        generation: 0,
        reservationId: "123e4567-e89b-42d3-a456-426614174003",
        leaseExpiresAt: new Date("2026-08-30T18:05:00.000Z"),
      });

      await assert.rejects(
        finalizeActionExpiry(
          "action-invalid-generation",
          lifecycleDependencies(db),
        ),
        /reservation generation must be a positive safe integer/,
      );
      const action = await row(admin, `
        SELECT "status", "expiredAt" FROM "ClassmatePost"
        WHERE "id" = 'action-invalid-generation'
      `);
      assert.deepEqual(action, { status: "ACTIVE", expiredAt: null });
      const context = await row(admin, `
        SELECT "state", "reservationId", "leaseExpiresAt"
        FROM "ActionCoordinationContext" WHERE "id" = 'context-invalid-generation'
      `);
      assert.equal(context.state, "INITIATING");
      assert.equal(context.reservationId, "123e4567-e89b-42d3-a456-426614174003");
      assert.notEqual(context.leaseExpiresAt, null);
      const activation = await row(admin, `
        SELECT "terminalReason", "terminalAt" FROM "ActionInterestActivation"
        WHERE "id" = 'activation-invalid-generation'
      `);
      assert.deepEqual(activation, { terminalReason: null, terminalAt: null });
      assert.equal(await scalarCount(admin, `SELECT COUNT(*) FROM "ProductFunnelEvent"`), 0);
    });
  },
);

test(
  "expired reservation lease returns INITIATING to WAITING without terminalizing the activation",
  { skip: localDatabaseUrl ? false : "requires a localhost PostgreSQL DATABASE_URL" },
  async () => {
    await withFixtureSchema(2, async ({ admin, prisma: [firstDb, secondDb] }) => {
      await seedAction(admin, {
        actionId: "action-lease",
        status: "ACTIVE",
        expiresAt: new Date("2026-08-31T17:00:00.000Z"),
      });
      await seedCoordination(admin, {
        suffix: "expired-lease",
        actionId: "action-lease",
        responderId: "responder-expired-lease",
        state: "INITIATING",
        generation: 7,
        reservationId: "123e4567-e89b-42d3-a456-426614174007",
        leaseExpiresAt: new Date("2026-08-30T17:59:59.000Z"),
      });
      await seedCoordination(admin, {
        suffix: "live-lease",
        actionId: "action-lease",
        responderId: "responder-live-lease",
        state: "INITIATING",
        generation: 8,
        reservationId: "123e4567-e89b-42d3-a456-426614174008",
        leaseExpiresAt: new Date("2026-08-30T18:05:00.000Z"),
      });

      const results = await Promise.all([
        recoverExpiredReservationLease(
          "context-expired-lease",
          lifecycleDependencies(firstDb),
        ),
        recoverExpiredReservationLease(
          "context-expired-lease",
          lifecycleDependencies(secondDb),
        ),
      ]);
      assert.deepEqual(
        results.map((result) => result.kind).sort(),
        ["applied", "not_applicable"],
        JSON.stringify(results),
      );
      assert.equal(
        (
          await recoverExpiredReservationLease(
            "context-live-lease",
            lifecycleDependencies(firstDb),
          )
        ).kind,
        "not_applicable",
      );

      const expired = await row(admin, `
        SELECT "state", "reservationId", "reservationGeneration", "leaseExpiresAt"
        FROM "ActionCoordinationContext" WHERE "id" = 'context-expired-lease'
      `);
      assert.deepEqual(expired, {
        state: "WAITING",
        reservationId: null,
        reservationGeneration: 7,
        leaseExpiresAt: null,
      });
      const live = await row(admin, `
        SELECT "state", "reservationId", "reservationGeneration",
          to_char("leaseExpiresAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "leaseExpiresAt"
        FROM "ActionCoordinationContext" WHERE "id" = 'context-live-lease'
      `);
      assert.equal(live.state, "INITIATING");
      assert.equal(live.reservationGeneration, 8);
      assert.equal(live.reservationId, "123e4567-e89b-42d3-a456-426614174008");
      assert.equal(live.leaseExpiresAt, "2026-08-30T18:05:00.000Z");
      assert.deepEqual(
        await row(admin, `
          SELECT "terminalReason", "terminalAt" FROM "ActionInterestActivation"
          WHERE "id" = 'activation-expired-lease'
        `),
        { terminalReason: null, terminalAt: null },
      );
      assert.equal(
        await scalarCount(
          admin,
          `SELECT COUNT(*) FROM "ProductFunnelEvent" WHERE "name" = 'COORDINATION_RELEASED'`,
        ),
        1,
      );
      assert.equal(
        await scalarCount(
          admin,
          `SELECT COUNT(*) FROM "ProductFunnelEvent" WHERE "name" = 'ACTION_INTEREST_TERMINATED'`,
        ),
        0,
      );
      assert.equal(await scalarCount(admin, `SELECT COUNT(*) FROM "NotificationOutbox"`), 0);
    });
  },
);

function lifecycleDependencies(db: PrismaClient) {
  return {
    db,
    clock: fixedActionCoordinationClock(fixedNow),
    transactionOptions,
  };
}

async function seedAction(
  client: InstanceType<typeof Client>,
  input: {
    actionId: string;
    status: "ACTIVE" | "CLOSED" | "FULFILLED" | "REMOVED";
    expiresAt: Date;
  },
): Promise<void> {
  await client.query(
    `
      INSERT INTO "ClassmatePost" (
        "id", "userId", "category", "status", "expiresAt", "createdAt", "updatedAt",
        "coordinationPolicy", "policySchemaVersion", "experimentKeySnapshot",
        "experimentVariantSnapshot"
      ) VALUES ($1, 'creator-1', 'OTHER', $2, $3, $4, $4,
        'CREATOR_GATED_V2', 1, 'action_to_plan_creator_gated_v2', 'TREATMENT')
    `,
    [
      input.actionId,
      input.status,
      wallTimestamp(input.expiresAt),
      "2026-08-30 12:00:00.000",
    ],
  );
}

async function seedCoordination(
  client: InstanceType<typeof Client>,
  input: {
    suffix: string;
    actionId: string;
    responderId: string;
    state: "WAITING" | "INITIATING" | "OPEN";
    generation: number;
    reservationId?: string;
    leaseExpiresAt?: Date;
    connectedAt?: Date;
    terminalReason?: string;
    terminalAt?: Date;
  },
): Promise<void> {
  const interestId = `interest-${input.suffix}`;
  const activationId = `activation-${input.suffix}`;
  const contextId = `context-${input.suffix}`;
  await client.query(
    `
      INSERT INTO "ActionInterest" (
        "id", "userId", "classmatePostId", "status", "originSnapshot", "createdAt", "updatedAt"
      ) VALUES ($1, $2, $3, 'ACTIVE', '{}'::jsonb, $4, $4)
    `,
    [
      interestId,
      input.responderId,
      input.actionId,
      "2026-08-30 12:30:00.000",
    ],
  );
  await client.query(
    `
      INSERT INTO "ActionInterestActivation" (
        "id", "interestId", "ordinal", "interestSurface", "startedAt", "connectedAt",
        "terminalReason", "terminalAt"
      ) VALUES ($1, $2, 1, 'ACTION_DETAIL', $3, $4, $5, $6)
    `,
    [
      activationId,
      interestId,
      "2026-08-30 12:30:00.000",
      input.connectedAt ? wallTimestamp(input.connectedAt) : null,
      input.terminalReason ?? null,
      input.terminalAt ? wallTimestamp(input.terminalAt) : null,
    ],
  );
  await client.query(
    `
      INSERT INTO "ActionCoordinationContext" (
        "id", "interestId", "currentActivationId", "state", "reservationId",
        "reservationGeneration", "leaseExpiresAt", "connectionId", "createdAt", "updatedAt"
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9)
    `,
    [
      contextId,
      interestId,
      activationId,
      input.state,
      input.reservationId ?? null,
      input.generation,
      input.leaseExpiresAt ? wallTimestamp(input.leaseExpiresAt) : null,
      input.connectedAt ? `connection-${input.suffix}` : null,
      "2026-08-30 12:30:00.000",
    ],
  );
}

function wallTimestamp(value: Date): string {
  return value.toISOString().replace("T", " ").replace("Z", "");
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
  const schema = `bl_be06_action_${process.pid}_${Math.random().toString(36).slice(2, 10)}`;
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
    CREATE TYPE "ClassmatePostCategory" AS ENUM (
      'STUDY', 'MEALS', 'LANGUAGE', 'SPORTS', 'SHARED_COURSES', 'OTHER'
    );
    CREATE TYPE "ClassmatePostStatus" AS ENUM (
      'ACTIVE', 'CLOSED', 'EXPIRED', 'FULFILLED', 'REMOVED'
    );
    CREATE TYPE "ActionInterestStatus" AS ENUM ('ACTIVE', 'WITHDRAWN');
    CREATE TYPE "ActionCoordinationState" AS ENUM (
      'WAITING', 'INITIATING', 'OPEN', 'ENDED', 'UNAVAILABLE'
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
      'DISCOVER_RECOMMENDED', 'DISCOVER_EXPLORE', 'ACTION_DETAIL',
      'CHAT', 'PLAN_CENTER', 'SMALL_GROUP'
    );
    CREATE TYPE "ProductFunnelSourceKind" AS ENUM (
      'BUDDY_POST', 'COURSE_ACTION', 'DISCOVER_ACTIVITY', 'PLAN', 'SMALL_GROUP'
    );

    CREATE TABLE "ClassmatePost" (
      "id" TEXT PRIMARY KEY,
      "userId" TEXT NOT NULL,
      "category" "ClassmatePostCategory" NOT NULL,
      "status" "ClassmatePostStatus" NOT NULL,
      "expiresAt" TIMESTAMP(3) NOT NULL,
      "expiredAt" TIMESTAMP(3),
      "coordinationPolicy" "ActionCoordinationPolicy",
      "policySchemaVersion" INTEGER,
      "experimentKeySnapshot" TEXT,
      "experimentVariantSnapshot" "ExperimentVariant",
      "createdAt" TIMESTAMP(3) NOT NULL,
      "updatedAt" TIMESTAMP(3) NOT NULL
    );

    CREATE TABLE "ActionInterest" (
      "id" TEXT PRIMARY KEY,
      "userId" TEXT NOT NULL,
      "classmatePostId" TEXT NOT NULL,
      "status" "ActionInterestStatus" NOT NULL,
      "originSnapshot" JSONB NOT NULL,
      "createdAt" TIMESTAMP(3) NOT NULL,
      "updatedAt" TIMESTAMP(3) NOT NULL
    );

    CREATE TABLE "ActionInterestActivation" (
      "id" TEXT PRIMARY KEY,
      "interestId" TEXT NOT NULL,
      "ordinal" INTEGER NOT NULL,
      "interestSurface" "ActionInterestSurface" NOT NULL,
      "startedAt" TIMESTAMP(3) NOT NULL,
      "connectedAt" TIMESTAMP(3),
      "firstContentType" "ActionFirstContentType",
      "terminalReason" "ActionInterestTerminalReason",
      "terminalAt" TIMESTAMP(3)
    );

    CREATE TABLE "ActionCoordinationContext" (
      "id" TEXT PRIMARY KEY,
      "interestId" TEXT NOT NULL UNIQUE,
      "currentActivationId" TEXT NOT NULL UNIQUE,
      "state" "ActionCoordinationState" NOT NULL,
      "reservationId" UUID UNIQUE,
      "reservationGeneration" INTEGER NOT NULL,
      "leaseExpiresAt" TIMESTAMP(3),
      "connectionId" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL,
      "updatedAt" TIMESTAMP(3) NOT NULL
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
      "id" TEXT PRIMARY KEY,
      "dedupeKey" VARCHAR(191) NOT NULL UNIQUE,
      "kind" VARCHAR(64) NOT NULL,
      "recipientId" TEXT NOT NULL,
      "destination" JSONB NOT NULL,
      "payloadVersion" INTEGER NOT NULL,
      "payload" JSONB NOT NULL,
      "attemptCount" INTEGER NOT NULL DEFAULT 0,
      "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
}

async function scalarCount(
  client: InstanceType<typeof Client>,
  query: string,
): Promise<number> {
  const result = await client.query<{ count: string }>(query);
  return Number(result.rows[0].count);
}

async function row(
  client: InstanceType<typeof Client>,
  query: string,
): Promise<Record<string, string | number | Date | null>> {
  const result = await client.query(query);
  assert.equal(result.rows.length, 1);
  return result.rows[0];
}
