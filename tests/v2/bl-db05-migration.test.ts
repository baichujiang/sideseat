import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

import pg from "pg";

const { Client } = pg;

const migrationPath = join(
  process.cwd(),
  "prisma",
  "migrations",
  "20260831020000_blight_plan_commitment_backfill_constraints",
  "migration.sql",
);
const schemaPath = join(process.cwd(), "prisma", "schema.prisma");
const localDatabaseUrl = localPostgresUrl(process.env.DATABASE_URL);

test("BL-DB-05 freezes a compatibility-only, preflight-first migration", async () => {
  const [sql, schema] = await Promise.all([
    readFile(migrationPath, "utf8"),
    readFile(schemaPath, "utf8"),
  ]);
  const executable = stripSqlComments(sql);

  assert.equal(sql.match(/^\s*BEGIN\s*;/gim)?.length, 1);
  assert.equal(sql.match(/^\s*COMMIT\s*;/gim)?.length, 1);
  assert.equal(sql.match(/^\s*ROLLBACK\s*;/gim)?.length ?? 0, 0);
  const lockOrder = [
    "User",
    "Connection",
    "ClassmatePost",
    "ActionInterest",
    "ActionCoordinationContext",
    "PlanCommitment",
    "PlanRequest",
    "CalendarEntry",
    "PlanOutcomeResponse",
  ].map((table) => executable.indexOf(`LOCK TABLE "${table}"`));
  assert.ok(lockOrder.every((position) => position >= 0));
  assert.deepEqual(lockOrder, [...lockOrder].sort((left, right) => left - right));
  assert.ok(
    lockOrder.at(-1)! < executable.indexOf('CREATE TEMP TABLE "_bl_db05_chain_map"'),
  );
  for (const table of [
    "User",
    "Connection",
    "ClassmatePost",
    "ActionInterest",
    "ActionCoordinationContext",
  ]) {
    assert.match(executable, new RegExp(`LOCK TABLE "${table}" IN SHARE MODE`));
  }
  for (const table of [
    "PlanCommitment",
    "PlanRequest",
    "CalendarEntry",
    "PlanOutcomeResponse",
  ]) {
    assert.match(
      executable,
      new RegExp(`LOCK TABLE "${table}" IN SHARE ROW EXCLUSIVE MODE`),
    );
  }
  assert.ok(
    executable.indexOf("$preflight$") <
      executable.indexOf('INSERT INTO "PlanCommitment"'),
  );
  assert.ok(
    executable.lastIndexOf("$preflight$") <
      executable.indexOf('INSERT INTO "PlanCommitment"'),
  );
  assert.match(executable, /WITH RECURSIVE chain AS/);
  assert.match(executable, /counter chain contains a cycle or has no provable root/);
  assert.match(executable, /counter chain branches/);
  assert.match(executable, /source IDs conflict inside a counter chain/);
  assert.match(executable, /exactly two Calendar projections are required/);
  assert.match(executable, /duplicate participant responses would collapse/);

  assert.match(
    executable,
    /SET[\s\S]*?"revisionKind" = 'INITIAL'/,
  );
  assert.doesNotMatch(
    executable.slice(0, executable.indexOf("CREATE FUNCTION")),
    /"revisionKind"\s*=\s*'RESCHEDULE'/,
  );
  assert.match(
    executable,
    /"confirmedAt"[\s\S]*?SELECT[\s\S]*?NULL,[\s\S]*?facts\."createdAt"/,
  );

  for (const indexName of [
    "PlanRequest_one_pending_per_origin_action",
    "PlanRequest_one_pending_per_commitment",
    "CalendarEntry_userId_planCommitmentId_key",
    "PlanOutcomeResponse_planCommitmentId_userId_key",
  ]) {
    assert.match(executable, new RegExp(`CREATE UNIQUE INDEX "${indexName}"`));
  }
  assert.match(
    executable,
    /PlanRequest_one_pending_per_origin_action"[\s\S]*WHERE "originActionId" IS NOT NULL AND "status" = 'PENDING'/,
  );
  assert.match(
    executable,
    /PlanRequest_one_pending_per_commitment"[\s\S]*WHERE "commitmentId" IS NOT NULL AND "status" = 'PENDING'/,
  );
  assert.match(executable, /PlanCommitment_pointer_shape_check/);
  assert.match(executable, /PlanRequest_commitment_revision_kind_check/);
  assert.match(
    executable,
    /CREATE CONSTRAINT TRIGGER "PlanCommitment_revision_pointer_state"[\s\S]*DEFERRABLE INITIALLY DEFERRED/,
  );
  assert.match(
    executable,
    /CREATE CONSTRAINT TRIGGER "PlanRequest_commitment_pointer_state"[\s\S]*DEFERRABLE INITIALLY DEFERRED/,
  );

  // DB-05 is the last compatibility hardening step, not another expansion.
  assert.doesNotMatch(executable, /CREATE\s+(?:TYPE|TABLE)\b/i);
  assert.doesNotMatch(executable, /ALTER\s+TYPE\b/i);
  assert.doesNotMatch(executable, /ALTER\s+COLUMN[\s\S]*SET\s+NOT\s+NULL/i);
  assert.doesNotMatch(executable, /UPDATE\s+"ClassmatePost"/i);
  assert.doesNotMatch(executable, /UPDATE\s+"ProductFunnelEvent"/i);
  assert.doesNotMatch(executable, /"fulfilledByPlanId"\s*=/i);
  assert.doesNotMatch(executable, /"resolvedAt"\s*=/i);
  assert.doesNotMatch(executable, /"resolutionReason"\s*=/i);

  const calendar = extractPrismaBlock(schema, "model", "CalendarEntry");
  const outcome = extractPrismaBlock(schema, "model", "PlanOutcomeResponse");
  assert.match(calendar, /@@unique\(\[userId, planCommitmentId\]\)/);
  assert.match(outcome, /@@unique\(\[planCommitmentId, userId\]\)/);
});

test("BL-DB-05 PostgreSQL test refuses any non-local effective target", () => {
  assert.equal(
    localPostgresUrl("postgresql://user:password@example.invalid:5432/db"),
    undefined,
  );
  assert.equal(localPostgresUrl("mysql://localhost/db"), undefined);
  assert.equal(
    localPostgresUrl(
      "postgresql://user:password@localhost:5433/db?host=prod.example&port=6543",
    ),
    undefined,
  );
  assert.equal(
    localPostgresUrl("postgresql://user:password@127.0.0.1:5433/db?schema=public"),
    "postgresql://user:password@127.0.0.1:5433/db?schema=public",
  );
});

test(
  "BL-DB-05 backfills one provable legacy chain without rewriting personal Calendar fields",
  { skip: localDatabaseUrl ? false : "requires a localhost PostgreSQL DATABASE_URL" },
  async () => {
    await withFixtureSchema(async (client) => {
      await seedProvableAcceptedChain(client);
      await client.query(await readFile(migrationPath, "utf8"));

      const commitment = await client.query<{
        id: string;
        connectionId: string;
        participantAId: string;
        participantBId: string;
        originActionId: string | null;
        originContextId: string | null;
        status: string;
        currentAcceptedRevisionId: string | null;
        currentPendingRevisionId: string | null;
        confirmedAt: Date | null;
      }>(`
        SELECT
          "id", "connectionId", "participantAId", "participantBId",
          "originActionId", "originContextId", "status",
          "currentAcceptedRevisionId", "currentPendingRevisionId", "confirmedAt"
        FROM "PlanCommitment"
      `);
      assert.deepEqual(commitment.rows, [
        {
          id: "legacy-plan:plan-root",
          connectionId: "connection-1",
          participantAId: "user-a",
          participantBId: "user-b",
          originActionId: "action-1",
          originContextId: "context-1",
          status: "CONFIRMED",
          currentAcceptedRevisionId: "plan-counter",
          currentPendingRevisionId: null,
          confirmedAt: null,
        },
      ]);

      const revisions = await client.query(`
        SELECT
          "id", "commitmentId", "revisionKind", "originActionId", "originContextId"
        FROM "PlanRequest"
        ORDER BY "id"
      `);
      assert.deepEqual(revisions.rows, [
        {
          id: "plan-counter",
          commitmentId: "legacy-plan:plan-root",
          revisionKind: "INITIAL",
          originActionId: "action-1",
          originContextId: "context-1",
        },
        {
          id: "plan-root",
          commitmentId: "legacy-plan:plan-root",
          revisionKind: "INITIAL",
          originActionId: "action-1",
          originContextId: "context-1",
        },
      ]);

      const calendar = await client.query(`
        SELECT
          "id", "userId", "planCommitmentId", "projectionStatus",
          "note", "categoryId", "reminder15mSentAt"
        FROM "CalendarEntry"
        ORDER BY "id"
      `);
      assert.equal(calendar.rows.length, 2);
      assert.deepEqual(
        calendar.rows.map((row) => ({
          id: row.id,
          userId: row.userId,
          planCommitmentId: row.planCommitmentId,
          projectionStatus: row.projectionStatus,
          note: row.note,
          categoryId: row.categoryId,
          hasReminder: row.reminder15mSentAt instanceof Date,
        })),
        [
          {
            id: "calendar-a",
            userId: "user-a",
            planCommitmentId: "legacy-plan:plan-root",
            projectionStatus: "ACTIVE",
            note: "Alice private note",
            categoryId: "category-a",
            hasReminder: true,
          },
          {
            id: "calendar-b",
            userId: "user-b",
            planCommitmentId: "legacy-plan:plan-root",
            projectionStatus: "ACTIVE",
            note: "Bob private note",
            categoryId: "category-b",
            hasReminder: false,
          },
        ],
      );

      const outcomes = await client.query(`
        SELECT "id", "planId", "planCommitmentId", "userId"
        FROM "PlanOutcomeResponse"
        ORDER BY "id"
      `);
      assert.deepEqual(outcomes.rows, [
        {
          id: "outcome-a",
          planId: "plan-counter",
          planCommitmentId: "legacy-plan:plan-root",
          userId: "user-a",
        },
        {
          id: "outcome-b",
          planId: "plan-counter",
          planCommitmentId: "legacy-plan:plan-root",
          userId: "user-b",
        },
      ]);

      for (const index of [
        "PlanRequest_one_pending_per_origin_action",
        "PlanRequest_one_pending_per_commitment",
        "CalendarEntry_userId_planCommitmentId_key",
        "PlanOutcomeResponse_planCommitmentId_userId_key",
      ]) {
        assert.equal(await indexExists(client, index), true, index);
      }
      assert.equal(
        await deferredConstraintTriggerExists(
          client,
          "PlanCommitment_revision_pointer_state",
        ),
        true,
      );
      assert.equal(
        await deferredConstraintTriggerExists(
          client,
          "PlanRequest_commitment_pointer_state",
        ),
        true,
      );

      await assertHardConstraints(client);
    });
  },
);

test(
  "BL-DB-05 atomically refuses an ambiguous branch before stable ownership is written",
  { skip: localDatabaseUrl ? false : "requires a localhost PostgreSQL DATABASE_URL" },
  async () => {
    await withFixtureSchema(async (client) => {
      await seedBasePair(client);
      await client.query(`
        INSERT INTO "PlanRequest" (
          "id", "connectionId", "proposerUserId", "receiverUserId",
          "title", "startTime", "endTime", "status", "createdAt", "updatedAt"
        ) VALUES (
          'branch-root', 'connection-1', 'user-a', 'user-b', 'Root',
          '2026-09-02T10:00:00Z', '2026-09-02T11:00:00Z', 'COUNTER_PROPOSED', NOW(), NOW()
        ), (
          'branch-a', 'connection-1', 'user-b', 'user-a', 'A',
          '2026-09-02T12:00:00Z', '2026-09-02T13:00:00Z', 'DECLINED', NOW(), NOW()
        ), (
          'branch-b', 'connection-1', 'user-b', 'user-a', 'B',
          '2026-09-02T14:00:00Z', '2026-09-02T15:00:00Z', 'PENDING', NOW(), NOW()
        );
        UPDATE "PlanRequest" SET "counterOfId" = 'branch-root'
        WHERE "id" IN ('branch-a', 'branch-b');
      `);
      const before = await fixtureFingerprint(client);

      await assert.rejects(
        client.query(await readFile(migrationPath, "utf8")),
        /counter chain branches/,
      );
      await client.query("ROLLBACK");

      assert.deepEqual(await fixtureFingerprint(client), before);
      assert.equal(
        await indexExists(client, "PlanRequest_one_pending_per_commitment"),
        false,
      );
    });
  },
);

test(
  "BL-DB-05 maps a pending singleton to one NEGOTIATING INITIAL commitment",
  { skip: localDatabaseUrl ? false : "requires a localhost PostgreSQL DATABASE_URL" },
  async () => {
    await withFixtureSchema(async (client) => {
      await seedBasePair(client);
      await client.query(`
        INSERT INTO "PlanRequest" (
          "id", "connectionId", "proposerUserId", "receiverUserId",
          "title", "startTime", "endTime", "status", "createdAt", "updatedAt"
        ) VALUES (
          'pending-singleton', 'connection-1', 'user-a', 'user-b', 'Coffee',
          '2026-09-06T10:00:00Z', '2026-09-06T11:00:00Z', 'PENDING', NOW(), NOW()
        );
      `);
      await client.query(await readFile(migrationPath, "utf8"));

      const result = await client.query(`
        SELECT
          commitment."status",
          commitment."currentAcceptedRevisionId",
          commitment."currentPendingRevisionId",
          revision."commitmentId",
          revision."revisionKind"
        FROM "PlanCommitment" commitment
        JOIN "PlanRequest" revision ON revision."id" = 'pending-singleton'
      `);
      assert.deepEqual(result.rows, [
        {
          status: "NEGOTIATING",
          currentAcceptedRevisionId: null,
          currentPendingRevisionId: "pending-singleton",
          commitmentId: "legacy-plan:pending-singleton",
          revisionKind: "INITIAL",
        },
      ]);
    });
  },
);

test(
  "BL-DB-05 atomically refuses an accepted chain with incomplete Calendar history",
  { skip: localDatabaseUrl ? false : "requires a localhost PostgreSQL DATABASE_URL" },
  async () => {
    await withFixtureSchema(async (client) => {
      await seedBasePair(client);
      await client.query(`
        INSERT INTO "PlanRequest" (
          "id", "connectionId", "proposerUserId", "receiverUserId",
          "title", "startTime", "endTime", "status", "createdAt", "updatedAt"
        ) VALUES (
          'accepted-without-calendar', 'connection-1', 'user-a', 'user-b', 'Missing',
          '2026-09-03T10:00:00Z', '2026-09-03T11:00:00Z', 'ACCEPTED', NOW(), NOW()
        );
      `);
      const before = await fixtureFingerprint(client);

      await assert.rejects(
        client.query(await readFile(migrationPath, "utf8")),
        /exactly two Calendar projections are required/,
      );
      await client.query("ROLLBACK");

      assert.deepEqual(await fixtureFingerprint(client), before);
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
  if (
    [...parsed.searchParams.keys()].some((key) =>
      forbidden.has(key.toLowerCase()),
    )
  ) {
    return undefined;
  }
  return value;
}

function stripSqlComments(sql: string): string {
  return sql.replace(/^\s*--.*$/gm, "");
}

function extractPrismaBlock(
  schema: string,
  kind: "model" | "enum",
  name: string,
): string {
  const match = schema.match(new RegExp(`${kind} ${name} \\{([\\s\\S]*?)\\n\\}`));
  assert.ok(match, `${kind} ${name} must exist`);
  return match[1] ?? "";
}

async function withFixtureSchema(
  run: (client: InstanceType<typeof Client>) => Promise<void>,
): Promise<void> {
  assert.ok(localDatabaseUrl);
  const client = new Client({ connectionString: localDatabaseUrl });
  const schema = `bl_db05_${process.pid}_${Math.random().toString(36).slice(2, 10)}`;
  assert.match(schema, /^[a-z0-9_]+$/);
  await client.connect();
  try {
    await client.query(`CREATE SCHEMA "${schema}"`);
    await client.query(`SET search_path TO "${schema}"`);
    await createFixtureSchema(client);
    await run(client);
  } finally {
    await client.query("ROLLBACK").catch(() => undefined);
    await client.query("RESET search_path").catch(() => undefined);
    await client
      .query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`)
      .catch(() => undefined);
    await client.end();
  }
}

async function createFixtureSchema(
  client: InstanceType<typeof Client>,
): Promise<void> {
  await client.query(`
    CREATE TYPE "PlanRequestStatus" AS ENUM (
      'PENDING', 'ACCEPTED', 'DECLINED', 'COUNTER_PROPOSED',
      'CANCELED', 'EXPIRED', 'INVALIDATED'
    );
    CREATE TYPE "PlanCommitmentStatus" AS ENUM (
      'NEGOTIATING', 'CONFIRMED', 'CLOSED', 'CANCELED'
    );
    CREATE TYPE "PlanRevisionKind" AS ENUM ('INITIAL', 'RESCHEDULE');
    CREATE TYPE "CalendarProjectionStatus" AS ENUM ('ACTIVE', 'CANCELED');
    CREATE TYPE "PlanOriginKind" AS ENUM (
      'ACTION_INTEREST', 'CLASSMATE_POST', 'DISCOVER_ACTIVITY',
      'AVAILABILITY_SHARE', 'SCHEDULE_SHARE', 'SMALL_GROUP'
    );

    CREATE TABLE "User" ("id" TEXT PRIMARY KEY);
    CREATE TABLE "Connection" (
      "id" TEXT PRIMARY KEY,
      "userAId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
      "userBId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE
    );
    CREATE TABLE "ClassmatePost" (
      "id" TEXT PRIMARY KEY,
      "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE
    );
    CREATE TABLE "ActionInterest" (
      "id" TEXT PRIMARY KEY,
      "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
      "classmatePostId" TEXT NOT NULL REFERENCES "ClassmatePost"("id") ON DELETE CASCADE,
      "connectionId" TEXT REFERENCES "Connection"("id") ON DELETE SET NULL
    );
    CREATE TABLE "ActionCoordinationContext" (
      "id" TEXT PRIMARY KEY,
      "interestId" TEXT NOT NULL UNIQUE REFERENCES "ActionInterest"("id") ON DELETE CASCADE,
      "connectionId" TEXT REFERENCES "Connection"("id") ON DELETE SET NULL
    );
    CREATE TABLE "PlanRequest" (
      "id" TEXT PRIMARY KEY,
      "connectionId" TEXT NOT NULL REFERENCES "Connection"("id") ON DELETE CASCADE,
      "counterOfId" TEXT REFERENCES "PlanRequest"("id") ON DELETE SET NULL,
      "actionInterestId" TEXT REFERENCES "ActionInterest"("id") ON DELETE SET NULL,
      "commitmentId" TEXT,
      "revisionKind" "PlanRevisionKind",
      "originActionId" TEXT REFERENCES "ClassmatePost"("id") ON DELETE SET NULL,
      "originContextId" TEXT REFERENCES "ActionCoordinationContext"("id") ON DELETE SET NULL,
      "originKind" "PlanOriginKind",
      "originId" TEXT,
      "proposerUserId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
      "receiverUserId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
      "title" TEXT NOT NULL,
      "location" TEXT,
      "startTime" TIMESTAMP(3) NOT NULL,
      "endTime" TIMESTAMP(3) NOT NULL,
      "status" "PlanRequestStatus" NOT NULL DEFAULT 'PENDING',
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE "PlanCommitment" (
      "id" TEXT PRIMARY KEY,
      "connectionId" TEXT NOT NULL REFERENCES "Connection"("id") ON DELETE CASCADE,
      "participantAId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
      "participantBId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
      "originActionId" TEXT REFERENCES "ClassmatePost"("id") ON DELETE SET NULL,
      "originContextId" TEXT REFERENCES "ActionCoordinationContext"("id") ON DELETE SET NULL,
      "status" "PlanCommitmentStatus" NOT NULL DEFAULT 'NEGOTIATING',
      "currentAcceptedRevisionId" TEXT UNIQUE,
      "currentPendingRevisionId" TEXT UNIQUE,
      "confirmedAt" TIMESTAMP(3),
      "canceledAt" TIMESTAMP(3),
      "canceledByUserId" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    ALTER TABLE "PlanRequest"
      ADD CONSTRAINT "PlanRequest_commitmentId_fkey"
      FOREIGN KEY ("commitmentId") REFERENCES "PlanCommitment"("id") ON DELETE CASCADE;
    ALTER TABLE "PlanCommitment"
      ADD CONSTRAINT "PlanCommitment_currentAcceptedRevisionId_fkey"
      FOREIGN KEY ("currentAcceptedRevisionId") REFERENCES "PlanRequest"("id") ON DELETE NO ACTION;
    ALTER TABLE "PlanCommitment"
      ADD CONSTRAINT "PlanCommitment_currentPendingRevisionId_fkey"
      FOREIGN KEY ("currentPendingRevisionId") REFERENCES "PlanRequest"("id") ON DELETE NO ACTION;

    CREATE TABLE "CalendarEntry" (
      "id" TEXT PRIMARY KEY,
      "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
      "planRequestId" TEXT REFERENCES "PlanRequest"("id") ON DELETE SET NULL,
      "planCommitmentId" TEXT REFERENCES "PlanCommitment"("id") ON DELETE SET NULL,
      "projectionStatus" "CalendarProjectionStatus" NOT NULL DEFAULT 'ACTIVE',
      "title" TEXT NOT NULL,
      "location" TEXT,
      "note" TEXT,
      "categoryId" TEXT,
      "startAt" TIMESTAMP(3) NOT NULL,
      "endAt" TIMESTAMP(3) NOT NULL,
      "reminder15mSentAt" TIMESTAMP(3)
    );
    CREATE TABLE "PlanOutcomeResponse" (
      "id" TEXT PRIMARY KEY,
      "planId" TEXT NOT NULL REFERENCES "PlanRequest"("id") ON DELETE CASCADE,
      "planCommitmentId" TEXT REFERENCES "PlanCommitment"("id") ON DELETE CASCADE,
      "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE
    );
  `);
}

async function seedBasePair(client: InstanceType<typeof Client>): Promise<void> {
  await client.query(`
    INSERT INTO "User" ("id") VALUES ('user-a'), ('user-b');
    INSERT INTO "Connection" ("id", "userAId", "userBId")
    VALUES ('connection-1', 'user-a', 'user-b');
  `);
}

async function seedProvableAcceptedChain(
  client: InstanceType<typeof Client>,
): Promise<void> {
  await seedBasePair(client);
  await client.query(`
    INSERT INTO "ClassmatePost" ("id", "userId") VALUES ('action-1', 'user-a');
    INSERT INTO "ActionInterest" (
      "id", "userId", "classmatePostId", "connectionId"
    ) VALUES ('interest-1', 'user-b', 'action-1', 'connection-1');
    INSERT INTO "ActionCoordinationContext" ("id", "interestId", "connectionId")
    VALUES ('context-1', 'interest-1', 'connection-1');

    INSERT INTO "PlanRequest" (
      "id", "connectionId", "actionInterestId", "originKind", "originId",
      "proposerUserId", "receiverUserId", "title", "location",
      "startTime", "endTime", "status", "createdAt", "updatedAt"
    ) VALUES (
      'plan-root', 'connection-1', 'interest-1', 'ACTION_INTEREST', 'interest-1',
      'user-b', 'user-a', 'Lunch', 'Mensa',
      '2026-09-01T10:00:00Z', '2026-09-01T11:00:00Z', 'COUNTER_PROPOSED',
      '2026-08-30T10:00:00Z', '2026-08-30T11:00:00Z'
    ), (
      'plan-counter', 'connection-1', 'interest-1', 'ACTION_INTEREST', 'interest-1',
      'user-a', 'user-b', 'Lunch later', 'Mensa',
      '2026-09-01T12:00:00Z', '2026-09-01T13:00:00Z', 'ACCEPTED',
      '2026-08-30T11:00:00Z', '2026-08-30T12:00:00Z'
    );
    UPDATE "PlanRequest"
    SET "counterOfId" = 'plan-root', "originActionId" = 'action-1', "originContextId" = 'context-1'
    WHERE "id" = 'plan-counter';

    INSERT INTO "CalendarEntry" (
      "id", "userId", "planRequestId", "title", "location", "note", "categoryId",
      "startAt", "endAt", "reminder15mSentAt"
    ) VALUES (
      'calendar-a', 'user-a', 'plan-counter', 'Lunch later', 'Mensa',
      'Alice private note', 'category-a', '2026-09-01T12:00:00Z',
      '2026-09-01T13:00:00Z', '2026-09-01T11:45:00Z'
    ), (
      'calendar-b', 'user-b', 'plan-counter', 'Lunch later', 'Mensa',
      'Bob private note', 'category-b', '2026-09-01T12:00:00Z',
      '2026-09-01T13:00:00Z', NULL
    );
    INSERT INTO "PlanOutcomeResponse" ("id", "planId", "userId") VALUES
      ('outcome-a', 'plan-counter', 'user-a'),
      ('outcome-b', 'plan-counter', 'user-b');
  `);
}

async function assertHardConstraints(
  client: InstanceType<typeof Client>,
): Promise<void> {
  await assert.rejects(
    client.query(`
      INSERT INTO "CalendarEntry" (
        "id", "userId", "planCommitmentId", "title", "startAt", "endAt"
      ) VALUES (
        'duplicate-calendar', 'user-a', 'legacy-plan:plan-root', 'Duplicate',
        '2026-09-01T12:00:00Z', '2026-09-01T13:00:00Z'
      )
    `),
    (error: unknown) => postgresErrorCode(error) === "23505",
  );
  await assert.rejects(
    client.query(`
      INSERT INTO "PlanOutcomeResponse" (
        "id", "planId", "planCommitmentId", "userId"
      ) VALUES (
        'duplicate-outcome', 'plan-counter', 'legacy-plan:plan-root', 'user-a'
      )
    `),
    (error: unknown) => postgresErrorCode(error) === "23505",
  );

  // The status invariant is deferred so a new stable Plan can be assembled in
  // the only FK-safe order: Commitment, revision, then pending pointer.
  await client.query("BEGIN");
  await client.query(`
    INSERT INTO "PlanCommitment" (
      "id", "connectionId", "participantAId", "participantBId", "status"
    ) VALUES (
      'new-negotiation', 'connection-1', 'user-a', 'user-b', 'NEGOTIATING'
    );
    INSERT INTO "PlanRequest" (
      "id", "connectionId", "commitmentId", "revisionKind",
      "proposerUserId", "receiverUserId", "title", "startTime", "endTime", "status"
    ) VALUES (
      'new-initial', 'connection-1', 'new-negotiation', 'INITIAL',
      'user-a', 'user-b', 'New plan', '2026-09-04T12:00:00Z',
      '2026-09-04T13:00:00Z', 'PENDING'
    );
    UPDATE "PlanCommitment"
    SET "currentPendingRevisionId" = 'new-initial'
    WHERE "id" = 'new-negotiation';
  `);
  await client.query("COMMIT");

  await assert.rejects(
    client.query(`
      INSERT INTO "PlanRequest" (
        "id", "connectionId", "commitmentId", "revisionKind",
        "proposerUserId", "receiverUserId", "title", "startTime", "endTime", "status"
      ) VALUES (
        'second-pending', 'connection-1', 'new-negotiation', 'INITIAL',
        'user-b', 'user-a', 'Second pending', '2026-09-05T12:00:00Z',
        '2026-09-05T13:00:00Z', 'PENDING'
      )
    `),
    (error: unknown) => postgresErrorCode(error) === "23505",
  );

  await client.query("BEGIN");
  await client.query(`
    UPDATE "PlanRequest"
    SET "status" = 'PENDING', "revisionKind" = 'RESCHEDULE'
    WHERE "id" = 'plan-counter';
    UPDATE "PlanCommitment"
    SET "status" = 'NEGOTIATING',
        "currentAcceptedRevisionId" = NULL,
        "currentPendingRevisionId" = 'plan-counter'
    WHERE "id" = 'legacy-plan:plan-root';
  `);
  await assert.rejects(
    client.query("COMMIT"),
    (error: unknown) => postgresErrorCode(error) === "23514",
  );
  await client.query("ROLLBACK");

  await client.query("BEGIN");
  await client.query(`
    INSERT INTO "PlanRequest" (
      "id", "connectionId", "commitmentId", "revisionKind",
      "proposerUserId", "receiverUserId", "title", "startTime", "endTime", "status"
    ) VALUES (
      'pending-reschedule', 'connection-1', 'legacy-plan:plan-root', 'RESCHEDULE',
      'user-a', 'user-b', 'New time', '2026-09-02T12:00:00Z',
      '2026-09-02T13:00:00Z', 'PENDING'
    );
  `);
  await assert.rejects(
    client.query("COMMIT"),
    (error: unknown) => postgresErrorCode(error) === "23514",
  );
  await client.query("ROLLBACK");
}

async function fixtureFingerprint(
  client: InstanceType<typeof Client>,
): Promise<Record<string, unknown>> {
  const result = await client.query(`
    SELECT jsonb_build_object(
      'requests', (
        SELECT COALESCE(jsonb_agg(row_to_json(row) ORDER BY row."id"), '[]'::jsonb)
        FROM (SELECT * FROM "PlanRequest") row
      ),
      'commitments', (
        SELECT COALESCE(jsonb_agg(row_to_json(row) ORDER BY row."id"), '[]'::jsonb)
        FROM (SELECT * FROM "PlanCommitment") row
      ),
      'calendar', (
        SELECT COALESCE(jsonb_agg(row_to_json(row) ORDER BY row."id"), '[]'::jsonb)
        FROM (SELECT * FROM "CalendarEntry") row
      ),
      'outcomes', (
        SELECT COALESCE(jsonb_agg(row_to_json(row) ORDER BY row."id"), '[]'::jsonb)
        FROM (SELECT * FROM "PlanOutcomeResponse") row
      )
    ) AS fingerprint
  `);
  return result.rows[0]?.fingerprint as Record<string, unknown>;
}

async function indexExists(
  client: InstanceType<typeof Client>,
  indexName: string,
): Promise<boolean> {
  const result = await client.query<{ present: boolean }>(`
    SELECT EXISTS (
      SELECT 1
      FROM pg_class index_row
      JOIN pg_namespace namespace_row ON namespace_row.oid = index_row.relnamespace
      WHERE namespace_row.nspname = current_schema()
        AND index_row.relkind = 'i'
        AND index_row.relname = $1
    ) AS present
  `, [indexName]);
  return result.rows[0]?.present ?? false;
}

async function deferredConstraintTriggerExists(
  client: InstanceType<typeof Client>,
  triggerName: string,
): Promise<boolean> {
  const result = await client.query<{ present: boolean }>(`
    SELECT EXISTS (
      SELECT 1
      FROM pg_trigger trigger_row
      JOIN pg_class table_row ON table_row.oid = trigger_row.tgrelid
      JOIN pg_namespace namespace_row ON namespace_row.oid = table_row.relnamespace
      WHERE namespace_row.nspname = current_schema()
        AND trigger_row.tgname = $1
        AND trigger_row.tgconstraint <> 0
        AND trigger_row.tgdeferrable
        AND trigger_row.tginitdeferred
    ) AS present
  `, [triggerName]);
  return result.rows[0]?.present ?? false;
}

function postgresErrorCode(error: unknown): string | undefined {
  return typeof error === "object" && error !== null && "code" in error
    ? String((error as { code?: unknown }).code)
    : undefined;
}
