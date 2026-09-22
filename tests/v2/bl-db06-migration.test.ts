import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

import pg from "pg";

const { Client } = pg;

const db02EnumMigrationPath = join(
  process.cwd(),
  "prisma",
  "migrations",
  "20260830220000_blight_plan_commitment_enums",
  "migration.sql",
);
const db02ExpandMigrationPath = join(
  process.cwd(),
  "prisma",
  "migrations",
  "20260830221000_blight_plan_commitment_expand",
  "migration.sql",
);
const enumMigrationPath = join(
  process.cwd(),
  "prisma",
  "migrations",
  "20260830230000_blight_plan_safety_enums",
  "migration.sql",
);
const expandMigrationPath = join(
  process.cwd(),
  "prisma",
  "migrations",
  "20260830231000_blight_plan_safety_expand",
  "migration.sql",
);
const schemaPath = join(process.cwd(), "prisma", "schema.prisma");
const localDatabaseUrl = localPostgresUrl(process.env.DATABASE_URL);

const safetyColumns = [
  "cancellationReason",
  "safetyBlockId",
  "safetyRestrictedAt",
] as const;

test("BL-DB-06 schema and migrations keep the approved additive safety boundary", async () => {
  const [enumSql, expandSql, schema] = await Promise.all([
    readFile(enumMigrationPath, "utf8"),
    readFile(expandMigrationPath, "utf8"),
    readFile(schemaPath, "utf8"),
  ]);
  const executableEnumSql = stripSqlComments(enumSql);
  const executableExpandSql = stripSqlComments(expandSql);

  assert.equal(enumSql.match(/^\s*BEGIN\s*;/gim)?.length, 1);
  assert.equal(enumSql.match(/^\s*COMMIT\s*;/gim)?.length, 1);
  assert.match(
    enumSql,
    /ALTER TYPE "PlanRequestStatus" ADD VALUE IF NOT EXISTS 'INVALIDATED'/,
  );
  assert.match(
    enumSql,
    /ALTER TYPE "ProductFunnelEventName" ADD VALUE IF NOT EXISTS 'PLAN_SAFETY_TERMINATED'/,
  );
  assert.match(
    enumSql,
    /CREATE TYPE "PlanCommitmentCancellationReason" AS ENUM/,
  );
  assert.match(enumSql, /'USER_CANCELED'/);
  assert.match(enumSql, /'SAFETY_UNAVAILABLE'/);
  assert.doesNotMatch(executableEnumSql, /\b(?:CREATE|ALTER|DROP)\s+TABLE\b/i);

  assert.equal(expandSql.match(/^\s*BEGIN\s*;/gim)?.length, 1);
  assert.equal(expandSql.match(/^\s*COMMIT\s*;/gim)?.length, 1);
  assert.equal(expandSql.match(/^\s*ROLLBACK\s*;/gim)?.length ?? 0, 0);
  assert.match(expandSql, /ALTER TABLE "PlanCommitment"/);
  for (const column of safetyColumns) {
    assert.match(expandSql, new RegExp(`ADD COLUMN "${column}"`));
  }
  assert.match(
    expandSql,
    /FOREIGN KEY \("safetyBlockId"\) REFERENCES "Block"\("id"\)[\s\S]*ON DELETE SET NULL/,
  );
  assert.match(
    expandSql,
    /CREATE INDEX "PlanCommitment_safetyBlockId_idx"[\s\S]*\("safetyBlockId"\)/,
  );
  assert.match(
    expandSql,
    /CREATE INDEX "PlanCommitment_cancellationReason_canceledAt_idx"[\s\S]*\("cancellationReason", "canceledAt"\)/,
  );

  // This migration only makes the approved persistence vocabulary available.
  // BL-SAFE-01 owns orchestration, transitions, reads, and participant DTOs.
  for (const sql of [executableEnumSql, executableExpandSql]) {
    assert.doesNotMatch(sql, /^\s*(?:INSERT|UPDATE|DELETE|TRUNCATE)\b/gim);
    assert.doesNotMatch(sql, /\bDROP\s+(?:TABLE|COLUMN|TYPE)\b/i);
  }
  assert.doesNotMatch(executableExpandSql, /CREATE\s+TABLE/i);
  assert.doesNotMatch(
    executableExpandSql,
    /\bSET\s+"?(?:status|projectionStatus)"?\b/i,
  );
  assert.doesNotMatch(executableExpandSql, /\b(?:NOT NULL|DEFAULT)\b/i);
  assert.doesNotMatch(
    `${enumSql}\n${expandSql}`,
    /SafetyAudit|PlanSafetyAudit/i,
  );

  const cancellationReason = extractPrismaBlock(
    schema,
    "enum",
    "PlanCommitmentCancellationReason",
  );
  assert.match(cancellationReason, /^\s*USER_CANCELED\s*$/m);
  assert.match(cancellationReason, /^\s*SAFETY_UNAVAILABLE\s*$/m);
  assert.match(
    extractPrismaBlock(schema, "enum", "PlanRequestStatus"),
    /^\s*INVALIDATED\s*$/m,
  );
  assert.match(
    extractPrismaBlock(schema, "enum", "ProductFunnelEventName"),
    /^\s*PLAN_SAFETY_TERMINATED\s*$/m,
  );

  const commitment = extractPrismaBlock(schema, "model", "PlanCommitment");
  assert.match(
    commitment,
    /^\s*cancellationReason\s+PlanCommitmentCancellationReason\?\s*$/m,
  );
  assert.match(commitment, /^\s*safetyRestrictedAt\s+DateTime\?\s*$/m);
  assert.match(commitment, /^\s*safetyBlockId\s+String\?\s*$/m);
  for (const column of safetyColumns) {
    const line =
      commitment.match(new RegExp(`^\\s*${column}\\s+[^\\n]+$`, "m"))?.[0] ??
      "";
    assert.doesNotMatch(line, /@default/);
  }
  assert.match(
    commitment,
    /safetyBlock\s+Block\?[\s\S]*@relation\("PlanCommitmentSafetyBlock",[\s\S]*onDelete: SetNull\)/,
  );
  assert.match(commitment, /@@index\(\[safetyBlockId\]\)/);
  assert.match(commitment, /@@index\(\[cancellationReason, canceledAt\]\)/);
  assert.match(
    extractPrismaBlock(schema, "model", "Block"),
    /safetyRestrictedPlanCommitments\s+PlanCommitment\[\][^\n]*@relation\("PlanCommitmentSafetyBlock"\)/,
  );
});

test("BL-DB-06 integration test refuses any non-local effective PostgreSQL target", () => {
  assert.equal(
    localPostgresUrl(
      "postgresql://user:password@example.invalid:5432/database",
    ),
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
      "postgresql://user:password@localhost:5433/database?port=5432",
    ),
    undefined,
  );
  assert.equal(
    localPostgresUrl(
      "postgresql://user:password@localhost:5433/database?service=production",
    ),
    undefined,
  );
  assert.equal(
    localPostgresUrl(
      "postgresql://user:password@localhost:5433/database?schema=public",
    ),
    "postgresql://user:password@localhost:5433/database?schema=public",
  );
});

test(
  "BL-DB-06 enum migration rolls back every new type and enum value after a mid-flight failure",
  {
    skip: localDatabaseUrl
      ? false
      : "requires a localhost PostgreSQL DATABASE_URL",
  },
  async () => {
    await withFixtureSchema(async (client) => {
      const enumSql = injectFailureBeforeCommit(
        await readFile(enumMigrationPath, "utf8"),
      );

      await assert.rejects(
        client.query(enumSql),
        (error: unknown) => postgresErrorCode(error) === "22012",
      );
      await client.query("ROLLBACK");

      const type = await client.query<{ count: string }>(`
        SELECT COUNT(*)::TEXT AS count
        FROM pg_type
        WHERE typnamespace = current_schema()::regnamespace
          AND typname = 'PlanCommitmentCancellationReason'
      `);
      assert.deepEqual(type.rows, [{ count: "0" }]);
      assert.equal(
        await enumHasValue(client, "PlanRequestStatus", "INVALIDATED"),
        false,
      );
      assert.equal(
        await enumHasValue(
          client,
          "ProductFunnelEventName",
          "PLAN_SAFETY_TERMINATED",
        ),
        false,
      );
    });
  },
);

test(
  "BL-DB-06 expand migration rolls back columns, indexes, and foreign key after a mid-flight failure",
  {
    skip: localDatabaseUrl
      ? false
      : "requires a localhost PostgreSQL DATABASE_URL",
  },
  async () => {
    await withFixtureSchema(async (client) => {
      await runDb02Migrations(client);
      await client.query(await readFile(enumMigrationPath, "utf8"));
      const expandSql = injectFailureBeforeCommit(
        await readFile(expandMigrationPath, "utf8"),
      );

      await assert.rejects(
        client.query(expandSql),
        (error: unknown) => postgresErrorCode(error) === "22012",
      );
      await client.query("ROLLBACK");

      for (const column of safetyColumns) {
        assert.equal(
          await columnExists(client, "PlanCommitment", column),
          false,
          column,
        );
      }
      assert.equal(
        await indexExists(client, "PlanCommitment_safetyBlockId_idx"),
        false,
      );
      assert.equal(
        await indexExists(
          client,
          "PlanCommitment_cancellationReason_canceledAt_idx",
        ),
        false,
      );
      assert.equal(
        await constraintExists(client, "PlanCommitment_safetyBlockId_fkey"),
        false,
      );
    });
  },
);

test(
  "BL-DB-06 upgrades populated DB-02 data and preserves safety evidence across Block deletion",
  {
    skip: localDatabaseUrl
      ? false
      : "requires a localhost PostgreSQL DATABASE_URL",
  },
  async () => {
    await withFixtureSchema(async (client) => {
      await seedLegacyFixture(client);
      await runDb02Migrations(client);
      await seedDb02StableFixture(client);
      await runDb06Migrations(client);

      await assertOrdinaryCanceledGraphPreserved(client);
      await assertSafetyColumnContracts(client);
      await assertCancellationValuesAndBlockLifecycle(client);
      await assertDedupeKeysRemainUnique(client);
      await assertAccountDeletionHasNoCascadeConflict(client);
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
  if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:")
    return undefined;
  if (!new Set(["127.0.0.1", "localhost", "::1"]).has(parsed.hostname))
    return undefined;
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

function stripSqlComments(sql: string): string {
  return sql.replace(/^\s*--.*$/gm, "");
}

function injectFailureBeforeCommit(sql: string): string {
  assert.match(sql, /COMMIT\s*;\s*$/i);
  return sql.replace(
    /COMMIT\s*;\s*$/i,
    'SELECT 1 / 0 AS "forced_failure";\nCOMMIT;',
  );
}

function extractPrismaBlock(
  source: string,
  kind: "model" | "enum",
  name: string,
): string {
  const match = source.match(
    new RegExp(`^${kind} ${name}\\s*\\{[\\s\\S]*?^\\}`, "m"),
  );
  assert.ok(match, `${kind} ${name} must exist in prisma/schema.prisma`);
  return match[0];
}

function postgresErrorCode(error: unknown): string | undefined {
  return error instanceof Error &&
    "code" in error &&
    typeof error.code === "string"
    ? error.code
    : undefined;
}

async function withFixtureSchema(
  run: (client: InstanceType<typeof Client>) => Promise<void>,
): Promise<void> {
  assert.ok(localDatabaseUrl);
  const client = new Client({ connectionString: localDatabaseUrl });
  const schema = `bl_db06_${process.pid}_${Math.random().toString(36).slice(2, 10)}`;
  assert.match(schema, /^[a-z0-9_]+$/);
  await client.connect();
  try {
    await client.query(`CREATE SCHEMA "${schema}"`);
    await client.query(`SET search_path TO "${schema}"`);
    await createDb02InputSchema(client);
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

async function createDb02InputSchema(
  client: InstanceType<typeof Client>,
): Promise<void> {
  await client.query(`
    CREATE TYPE "PlanRequestStatus" AS ENUM (
      'PENDING', 'ACCEPTED', 'DECLINED', 'COUNTER_PROPOSED', 'CANCELED', 'EXPIRED'
    );
    CREATE TYPE "ProductFunnelEventName" AS ENUM (
      'OPPORTUNITY_IMPRESSION', 'PLAN_ACCEPTED', 'OUTCOME_RECORDED'
    );

    CREATE TABLE "User" (
      "id" TEXT NOT NULL,
      CONSTRAINT "User_pkey" PRIMARY KEY ("id")
    );

    CREATE TABLE "Connection" (
      "id" TEXT NOT NULL,
      "userAId" TEXT NOT NULL,
      "userBId" TEXT NOT NULL,
      CONSTRAINT "Connection_pkey" PRIMARY KEY ("id"),
      CONSTRAINT "Connection_userAId_fkey"
        FOREIGN KEY ("userAId") REFERENCES "User"("id")
        ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT "Connection_userBId_fkey"
        FOREIGN KEY ("userBId") REFERENCES "User"("id")
        ON DELETE CASCADE ON UPDATE CASCADE
    );

    CREATE TABLE "Block" (
      "id" TEXT NOT NULL,
      "blockerId" TEXT NOT NULL,
      "blockedId" TEXT NOT NULL,
      "connectionId" TEXT,
      CONSTRAINT "Block_pkey" PRIMARY KEY ("id"),
      CONSTRAINT "Block_blockerId_blockedId_key" UNIQUE ("blockerId", "blockedId"),
      CONSTRAINT "Block_blockerId_fkey"
        FOREIGN KEY ("blockerId") REFERENCES "User"("id")
        ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT "Block_blockedId_fkey"
        FOREIGN KEY ("blockedId") REFERENCES "User"("id")
        ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT "Block_connectionId_fkey"
        FOREIGN KEY ("connectionId") REFERENCES "Connection"("id")
        ON DELETE SET NULL ON UPDATE CASCADE
    );

    CREATE TABLE "ClassmatePost" (
      "id" TEXT NOT NULL,
      CONSTRAINT "ClassmatePost_pkey" PRIMARY KEY ("id")
    );

    CREATE TABLE "ActionCoordinationContext" (
      "id" TEXT NOT NULL,
      CONSTRAINT "ActionCoordinationContext_pkey" PRIMARY KEY ("id")
    );

    CREATE TABLE "PlanRequest" (
      "id" TEXT NOT NULL,
      "status" "PlanRequestStatus" NOT NULL DEFAULT 'PENDING',
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "PlanRequest_pkey" PRIMARY KEY ("id")
    );

    CREATE TABLE "CalendarEntry" (
      "id" TEXT NOT NULL,
      "userId" TEXT NOT NULL,
      "planRequestId" TEXT,
      "title" TEXT NOT NULL,
      CONSTRAINT "CalendarEntry_pkey" PRIMARY KEY ("id"),
      CONSTRAINT "CalendarEntry_userId_fkey"
        FOREIGN KEY ("userId") REFERENCES "User"("id")
        ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT "CalendarEntry_planRequestId_fkey"
        FOREIGN KEY ("planRequestId") REFERENCES "PlanRequest"("id")
        ON DELETE SET NULL ON UPDATE CASCADE
    );

    CREATE TABLE "PlanOutcomeResponse" (
      "id" TEXT NOT NULL,
      "planId" TEXT NOT NULL,
      "userId" TEXT NOT NULL,
      CONSTRAINT "PlanOutcomeResponse_pkey" PRIMARY KEY ("id"),
      CONSTRAINT "PlanOutcomeResponse_planId_fkey"
        FOREIGN KEY ("planId") REFERENCES "PlanRequest"("id")
        ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT "PlanOutcomeResponse_userId_fkey"
        FOREIGN KEY ("userId") REFERENCES "User"("id")
        ON DELETE CASCADE ON UPDATE CASCADE
    );

    CREATE TABLE "ProductFunnelEvent" (
      "id" TEXT NOT NULL,
      "businessEventKey" TEXT,
      "name" "ProductFunnelEventName" NOT NULL,
      "planCommitmentId" TEXT,
      "planRevisionId" TEXT,
      CONSTRAINT "ProductFunnelEvent_pkey" PRIMARY KEY ("id"),
      CONSTRAINT "ProductFunnelEvent_businessEventKey_key" UNIQUE ("businessEventKey")
    );

    CREATE TABLE "NotificationOutbox" (
      "id" TEXT NOT NULL,
      "dedupeKey" TEXT NOT NULL,
      CONSTRAINT "NotificationOutbox_pkey" PRIMARY KEY ("id"),
      CONSTRAINT "NotificationOutbox_dedupeKey_key" UNIQUE ("dedupeKey")
    );
  `);
}

async function seedLegacyFixture(
  client: InstanceType<typeof Client>,
): Promise<void> {
  await client.query(`
    INSERT INTO "User" ("id") VALUES ('user-a'), ('user-b'), ('safety-actor');
    INSERT INTO "Connection" ("id", "userAId", "userBId")
      VALUES ('connection-main', 'user-a', 'user-b');
    INSERT INTO "Block" ("id", "blockerId", "blockedId", "connectionId")
      VALUES ('safety-block', 'safety-actor', 'user-b', 'connection-main');
    INSERT INTO "ClassmatePost" ("id") VALUES ('legacy-action');
    INSERT INTO "ActionCoordinationContext" ("id") VALUES ('legacy-context');
    INSERT INTO "PlanRequest" ("id", "status") VALUES ('ordinary-plan', 'ACCEPTED');
    INSERT INTO "CalendarEntry" ("id", "userId", "planRequestId", "title")
      VALUES ('ordinary-calendar', 'user-a', 'ordinary-plan', 'Original title');
    INSERT INTO "PlanOutcomeResponse" ("id", "planId", "userId")
      VALUES ('ordinary-outcome', 'ordinary-plan', 'user-a');
    INSERT INTO "ProductFunnelEvent" (
      "id", "businessEventKey", "name", "planCommitmentId", "planRevisionId"
    ) VALUES ('legacy-event', 'legacy-business-key', 'PLAN_ACCEPTED', NULL, NULL);
    INSERT INTO "NotificationOutbox" ("id", "dedupeKey")
      VALUES ('legacy-outbox', 'legacy-outbox-key');
  `);
}

async function seedDb02StableFixture(
  client: InstanceType<typeof Client>,
): Promise<void> {
  await client.query(`
    INSERT INTO "PlanCommitment" (
      "id", "connectionId", "participantAId", "participantBId", "status",
      "currentAcceptedRevisionId", "confirmedAt", "canceledAt", "canceledByUserId",
      "createdAt", "updatedAt"
    ) VALUES (
      'ordinary-commitment', 'connection-main', 'user-a', 'user-b', 'CANCELED',
      'ordinary-plan', '2026-08-29T09:00:00.000Z', '2026-08-29T10:00:00.000Z', 'user-a',
      '2026-08-28T09:00:00.000Z', '2026-08-29T10:00:00.000Z'
    );

    UPDATE "PlanRequest"
    SET "commitmentId" = 'ordinary-commitment', "revisionKind" = 'INITIAL'
    WHERE "id" = 'ordinary-plan';
    UPDATE "CalendarEntry"
    SET "planCommitmentId" = 'ordinary-commitment'
    WHERE "id" = 'ordinary-calendar';
    UPDATE "PlanOutcomeResponse"
    SET "planCommitmentId" = 'ordinary-commitment'
    WHERE "id" = 'ordinary-outcome';
  `);
}

async function runDb02Migrations(
  client: InstanceType<typeof Client>,
): Promise<void> {
  const [enumSql, expandSql] = await Promise.all([
    readFile(db02EnumMigrationPath, "utf8"),
    readFile(db02ExpandMigrationPath, "utf8"),
  ]);
  await client.query(enumSql);
  await client.query(expandSql);
}

async function runDb06Migrations(
  client: InstanceType<typeof Client>,
): Promise<void> {
  const [enumSql, expandSql] = await Promise.all([
    readFile(enumMigrationPath, "utf8"),
    readFile(expandMigrationPath, "utf8"),
  ]);
  await client.query(enumSql);
  await client.query(expandSql);
}

async function assertOrdinaryCanceledGraphPreserved(
  client: InstanceType<typeof Client>,
): Promise<void> {
  const commitment = await client.query<{
    canceledAt: string;
    canceledByUserId: string | null;
    cancellationReason: string | null;
    safetyBlockId: string | null;
    safetyRestrictedAt: Date | null;
    status: string;
  }>(`
    SELECT
      "status", "canceledAt"::TEXT AS "canceledAt", "canceledByUserId", "cancellationReason",
      "safetyRestrictedAt", "safetyBlockId"
    FROM "PlanCommitment"
    WHERE "id" = 'ordinary-commitment'
  `);
  assert.equal(commitment.rowCount, 1);
  assert.equal(commitment.rows[0]?.status, "CANCELED");
  assert.equal(commitment.rows[0]?.canceledAt, "2026-08-29 10:00:00");
  assert.equal(commitment.rows[0]?.canceledByUserId, "user-a");
  assert.equal(commitment.rows[0]?.cancellationReason, null);
  assert.equal(commitment.rows[0]?.safetyRestrictedAt, null);
  assert.equal(commitment.rows[0]?.safetyBlockId, null);

  const calendar = await client.query<{
    planCommitmentId: string | null;
    planRequestId: string | null;
    projectionStatus: string;
    title: string;
  }>(`
    SELECT "planCommitmentId", "planRequestId", "projectionStatus", "title"
    FROM "CalendarEntry"
    WHERE "id" = 'ordinary-calendar'
  `);
  assert.deepEqual(calendar.rows, [
    {
      planCommitmentId: "ordinary-commitment",
      planRequestId: "ordinary-plan",
      projectionStatus: "ACTIVE",
      title: "Original title",
    },
  ]);

  const outcome = await client.query<{
    planCommitmentId: string | null;
    planId: string;
  }>(`
    SELECT "planCommitmentId", "planId"
    FROM "PlanOutcomeResponse"
    WHERE "id" = 'ordinary-outcome'
  `);
  assert.deepEqual(outcome.rows, [
    { planCommitmentId: "ordinary-commitment", planId: "ordinary-plan" },
  ]);
}

async function assertSafetyColumnContracts(
  client: InstanceType<typeof Client>,
): Promise<void> {
  for (const column of safetyColumns) {
    assert.equal(
      await columnNullable(client, "PlanCommitment", column),
      true,
      column,
    );
    assert.equal(
      await columnDefault(client, "PlanCommitment", column),
      null,
      column,
    );
  }
  assert.equal(
    await enumHasValue(client, "PlanRequestStatus", "INVALIDATED"),
    true,
  );
  assert.equal(
    await enumHasValue(
      client,
      "ProductFunnelEventName",
      "PLAN_SAFETY_TERMINATED",
    ),
    true,
  );
  assert.deepEqual(
    await enumValues(client, "PlanCommitmentCancellationReason"),
    ["USER_CANCELED", "SAFETY_UNAVAILABLE"],
  );
  assert.equal(
    await indexExists(client, "PlanCommitment_safetyBlockId_idx"),
    true,
  );
  assert.equal(
    await indexExists(
      client,
      "PlanCommitment_cancellationReason_canceledAt_idx",
    ),
    true,
  );

  const foreignKey = await client.query<{ delete_action: string }>(`
    SELECT rc.delete_rule AS delete_action
    FROM information_schema.referential_constraints rc
    WHERE rc.constraint_schema = current_schema()
      AND rc.constraint_name = 'PlanCommitment_safetyBlockId_fkey'
  `);
  assert.deepEqual(foreignKey.rows, [{ delete_action: "SET NULL" }]);
}

async function assertCancellationValuesAndBlockLifecycle(
  client: InstanceType<typeof Client>,
): Promise<void> {
  await client.query(`
    UPDATE "PlanCommitment"
    SET "cancellationReason" = 'USER_CANCELED'
    WHERE "id" = 'ordinary-commitment';

    INSERT INTO "PlanCommitment" (
      "id", "connectionId", "participantAId", "participantBId", "status",
      "canceledAt", "canceledByUserId", "cancellationReason",
      "safetyRestrictedAt", "safetyBlockId", "createdAt", "updatedAt"
    ) VALUES (
      'safety-commitment', 'connection-main', 'user-a', 'user-b', 'CANCELED',
      '2026-08-30T10:00:00.000Z', NULL, 'SAFETY_UNAVAILABLE',
      '2026-08-30T10:00:00.000Z', 'safety-block',
      '2026-08-29T10:00:00.000Z', '2026-08-30T10:00:00.000Z'
    );
  `);

  const beforeDelete = await client.query<{
    canceledByUserId: string | null;
    cancellationReason: string | null;
    safetyBlockId: string | null;
    safetyRestrictedAt: string | null;
  }>(`
    SELECT
      "canceledByUserId", "cancellationReason",
      "safetyRestrictedAt"::TEXT AS "safetyRestrictedAt", "safetyBlockId"
    FROM "PlanCommitment"
    WHERE "id" = 'safety-commitment'
  `);
  assert.equal(beforeDelete.rows[0]?.canceledByUserId, null);
  assert.equal(beforeDelete.rows[0]?.cancellationReason, "SAFETY_UNAVAILABLE");
  assert.equal(beforeDelete.rows[0]?.safetyBlockId, "safety-block");
  assert.equal(beforeDelete.rows[0]?.safetyRestrictedAt, "2026-08-30 10:00:00");

  await assert.rejects(
    client.query(`
      UPDATE "PlanCommitment"
      SET "safetyBlockId" = 'missing-block'
      WHERE "id" = 'safety-commitment'
    `),
    (error: unknown) => postgresErrorCode(error) === "23503",
  );

  await client.query(`DELETE FROM "Block" WHERE "id" = 'safety-block'`);
  const afterDelete = await client.query<{
    cancellationReason: string | null;
    safetyBlockId: string | null;
    safetyRestrictedAt: string | null;
  }>(`
    SELECT
      "cancellationReason", "safetyRestrictedAt"::TEXT AS "safetyRestrictedAt", "safetyBlockId"
    FROM "PlanCommitment"
    WHERE "id" = 'safety-commitment'
  `);
  assert.equal(afterDelete.rows[0]?.cancellationReason, "SAFETY_UNAVAILABLE");
  assert.equal(afterDelete.rows[0]?.safetyBlockId, null);
  assert.equal(afterDelete.rows[0]?.safetyRestrictedAt, "2026-08-30 10:00:00");

  const ordinary = await client.query<{ cancellationReason: string | null }>(`
    SELECT "cancellationReason"
    FROM "PlanCommitment"
    WHERE "id" = 'ordinary-commitment'
  `);
  assert.deepEqual(ordinary.rows, [{ cancellationReason: "USER_CANCELED" }]);
}

async function assertDedupeKeysRemainUnique(
  client: InstanceType<typeof Client>,
): Promise<void> {
  await assert.rejects(
    client.query(`
      INSERT INTO "ProductFunnelEvent" ("id", "businessEventKey", "name")
      VALUES ('duplicate-event', 'legacy-business-key', 'PLAN_SAFETY_TERMINATED')
    `),
    (error: unknown) => postgresErrorCode(error) === "23505",
  );
  await assert.rejects(
    client.query(`
      INSERT INTO "NotificationOutbox" ("id", "dedupeKey")
      VALUES ('duplicate-outbox', 'legacy-outbox-key')
    `),
    (error: unknown) => postgresErrorCode(error) === "23505",
  );
}

async function assertAccountDeletionHasNoCascadeConflict(
  client: InstanceType<typeof Client>,
): Promise<void> {
  await client.query(`
    INSERT INTO "Block" ("id", "blockerId", "blockedId", "connectionId")
      VALUES ('delete-block', 'user-a', 'user-b', 'connection-main');
    INSERT INTO "PlanRequest" ("id", "status", "revisionKind")
      VALUES ('delete-plan', 'ACCEPTED', 'INITIAL');
    INSERT INTO "PlanCommitment" (
      "id", "connectionId", "participantAId", "participantBId", "status",
      "currentAcceptedRevisionId", "canceledAt", "cancellationReason",
      "safetyRestrictedAt", "safetyBlockId", "createdAt", "updatedAt"
    ) VALUES (
      'delete-commitment', 'connection-main', 'user-a', 'user-b', 'CANCELED',
      'delete-plan', '2026-08-30T12:00:00.000Z', 'SAFETY_UNAVAILABLE',
      '2026-08-30T12:00:00.000Z', 'delete-block', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
    );
    UPDATE "PlanRequest"
    SET "commitmentId" = 'delete-commitment'
    WHERE "id" = 'delete-plan';
    INSERT INTO "CalendarEntry" (
      "id", "userId", "planRequestId", "planCommitmentId", "title"
    ) VALUES (
      'counterpart-calendar', 'user-b', 'delete-plan', 'delete-commitment', 'Counterpart'
    );
    INSERT INTO "PlanOutcomeResponse" (
      "id", "planId", "planCommitmentId", "userId"
    ) VALUES (
      'delete-outcome', 'delete-plan', 'delete-commitment', 'user-a'
    );
  `);

  await client.query(`DELETE FROM "User" WHERE "id" = 'user-a'`);

  const graph = await client.query<{
    blocks: string;
    commitments: string;
    connections: string;
    outcomes: string;
    revisions: string;
  }>(`
    SELECT
      (SELECT COUNT(*)::TEXT FROM "Block" WHERE "id" = 'delete-block') AS blocks,
      (SELECT COUNT(*)::TEXT FROM "Connection" WHERE "id" = 'connection-main') AS connections,
      (SELECT COUNT(*)::TEXT FROM "PlanCommitment") AS commitments,
      (SELECT COUNT(*)::TEXT FROM "PlanRequest") AS revisions,
      (SELECT COUNT(*)::TEXT FROM "PlanOutcomeResponse") AS outcomes
  `);
  assert.deepEqual(graph.rows, [
    {
      blocks: "0",
      commitments: "0",
      connections: "0",
      outcomes: "0",
      revisions: "0",
    },
  ]);

  const counterpartCalendar = await client.query<{
    planCommitmentId: string | null;
    planRequestId: string | null;
    userId: string;
  }>(`
    SELECT "userId", "planRequestId", "planCommitmentId"
    FROM "CalendarEntry"
    WHERE "id" = 'counterpart-calendar'
  `);
  assert.deepEqual(counterpartCalendar.rows, [
    { planCommitmentId: null, planRequestId: null, userId: "user-b" },
  ]);
}

async function enumHasValue(
  client: InstanceType<typeof Client>,
  enumName: string,
  value: string,
): Promise<boolean> {
  const result = await client.query<{ count: string }>(
    `
      SELECT COUNT(*)::TEXT AS count
      FROM pg_enum enum_value
      JOIN pg_type enum_type ON enum_type.oid = enum_value.enumtypid
      WHERE enum_type.typnamespace = current_schema()::regnamespace
        AND enum_type.typname = $1
        AND enum_value.enumlabel = $2
    `,
    [enumName, value],
  );
  return result.rows[0]?.count === "1";
}

async function enumValues(
  client: InstanceType<typeof Client>,
  enumName: string,
): Promise<string[]> {
  const result = await client.query<{ enumlabel: string }>(
    `
      SELECT enum_value.enumlabel
      FROM pg_enum enum_value
      JOIN pg_type enum_type ON enum_type.oid = enum_value.enumtypid
      WHERE enum_type.typnamespace = current_schema()::regnamespace
        AND enum_type.typname = $1
      ORDER BY enum_value.enumsortorder
    `,
    [enumName],
  );
  return result.rows.map((row) => row.enumlabel);
}

async function columnExists(
  client: InstanceType<typeof Client>,
  tableName: string,
  columnName: string,
): Promise<boolean> {
  const result = await client.query<{ count: string }>(
    `
      SELECT COUNT(*)::TEXT AS count
      FROM information_schema.columns
      WHERE table_schema = current_schema()
        AND table_name = $1
        AND column_name = $2
    `,
    [tableName, columnName],
  );
  return result.rows[0]?.count === "1";
}

async function columnNullable(
  client: InstanceType<typeof Client>,
  tableName: string,
  columnName: string,
): Promise<boolean> {
  const result = await client.query<{ is_nullable: "YES" | "NO" }>(
    `
      SELECT is_nullable
      FROM information_schema.columns
      WHERE table_schema = current_schema()
        AND table_name = $1
        AND column_name = $2
    `,
    [tableName, columnName],
  );
  assert.equal(result.rowCount, 1, `${tableName}.${columnName} must exist`);
  return result.rows[0]?.is_nullable === "YES";
}

async function columnDefault(
  client: InstanceType<typeof Client>,
  tableName: string,
  columnName: string,
): Promise<string | null> {
  const result = await client.query<{ column_default: string | null }>(
    `
      SELECT column_default
      FROM information_schema.columns
      WHERE table_schema = current_schema()
        AND table_name = $1
        AND column_name = $2
    `,
    [tableName, columnName],
  );
  assert.equal(result.rowCount, 1, `${tableName}.${columnName} must exist`);
  return result.rows[0]?.column_default ?? null;
}

async function indexExists(
  client: InstanceType<typeof Client>,
  indexName: string,
): Promise<boolean> {
  const result = await client.query<{ count: string }>(
    `
      SELECT COUNT(*)::TEXT AS count
      FROM pg_class index_row
      WHERE index_row.relnamespace = current_schema()::regnamespace
        AND index_row.relkind = 'i'
        AND index_row.relname = $1
    `,
    [indexName],
  );
  return result.rows[0]?.count === "1";
}

async function constraintExists(
  client: InstanceType<typeof Client>,
  constraintName: string,
): Promise<boolean> {
  const result = await client.query<{ count: string }>(
    `
      SELECT COUNT(*)::TEXT AS count
      FROM pg_constraint
      WHERE connamespace = current_schema()::regnamespace
        AND conname = $1
    `,
    [constraintName],
  );
  return result.rows[0]?.count === "1";
}
