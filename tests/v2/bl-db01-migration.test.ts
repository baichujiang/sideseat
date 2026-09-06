import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

import pg from "pg";

const { Client } = pg;

const enumMigrationPath = join(
  process.cwd(),
  "prisma",
  "migrations",
  "20260830210000_blight_coordination_enums",
  "migration.sql",
);
const expandMigrationPath = join(
  process.cwd(),
  "prisma",
  "migrations",
  "20260830211000_blight_coordination_expand",
  "migration.sql",
);
const schemaPath = join(process.cwd(), "prisma", "schema.prisma");
const localDatabaseUrl = localPostgresUrl(process.env.DATABASE_URL);

const policyColumns = [
  "clientCapabilitySnapshot",
  "coordinationPolicy",
  "experimentKeySnapshot",
  "experimentVariantSnapshot",
  "policyParametersSnapshot",
  "policySchemaVersion",
  "policySnapshottedAt",
] as const;

const lifecycleColumns = ["expiredAt", "fulfilledAt", "removedAt"] as const;

const funnelColumns = [
  "actionContextId",
  "actionInterestId",
  "businessEventKey",
  "coordinationPolicy",
  "firstContentType",
  "interestActivationId",
  "interestSurface",
  "planCommitmentId",
  "planRevisionId",
  "policySchemaVersion",
  "terminalReason",
] as const;

const newTables = [
  "ActionCoordinationContext",
  "ActionInterestActivation",
  "ActionInterestPresentation",
  "ActionInterestViewReceipt",
  "ActionResponseSnapshot",
  "ActionResponseSnapshotItem",
  "NotificationOutbox",
] as const;

const expectedIndexes = [
  "ActionCoordinationContext_connectionId_state_idx",
  "ActionCoordinationContext_currentActivationId_key",
  "ActionCoordinationContext_interestId_key",
  "ActionCoordinationContext_interestId_state_idx",
  "ActionCoordinationContext_reservationId_key",
  "ActionCoordinationContext_state_leaseExpiresAt_idx",
  "ActionInterestActivation_interestId_ordinal_key",
  "ActionInterestActivation_interestId_startedAt_idx",
  "ActionInterestActivation_terminalReason_terminalAt_idx",
  "ActionInterestPresentation_creatorId_hiddenAt_updatedAt_idx",
  "ActionInterestViewReceipt_activationId_key",
  "ActionInterestViewReceipt_creatorId_viewedAt_idx",
  "ActionInterestViewReceipt_interestId_viewedAt_idx",
  "ActionResponseSnapshot_creatorId_expiresAt_idx",
  "ActionResponseSnapshot_expiresAt_idx",
  "ActionResponseSnapshotItem_snapshotId_actionId_sortOrdinal_idx",
  "ActionResponseSnapshotItem_snapshotId_sortOrdinal_key",
  "ClassmatePost_coordinationPolicy_createdAt_idx",
  "ClassmatePost_status_expiresAt_idx",
  "Message_actionContextId_createdAt_id_idx",
  "NotificationOutbox_availableAt_deliveredAt_deadLetterAt_idx",
  "NotificationOutbox_dedupeKey_key",
  "NotificationOutbox_recipientId_createdAt_idx",
  "ProductFunnelEvent_actionContextId_occurredAt_idx",
  "ProductFunnelEvent_actionInterestId_occurredAt_idx",
  "ProductFunnelEvent_businessEventKey_key",
  "ProductFunnelEvent_interestActivationId_occurredAt_idx",
  "ProductFunnelEvent_planCommitmentId_occurredAt_idx",
  "ProductFunnelEvent_planRevisionId_occurredAt_idx",
] as const;

const expectedForeignKeys = [
  "ActionCoordinationContext_connectionId_fkey",
  "ActionCoordinationContext_currentActivationId_fkey",
  "ActionCoordinationContext_endedById_fkey",
  "ActionCoordinationContext_interestId_fkey",
  "ActionInterestActivation_interestId_fkey",
  "ActionInterestPresentation_creatorId_fkey",
  "ActionInterestPresentation_interestId_fkey",
  "ActionInterestViewReceipt_activationId_fkey",
  "ActionInterestViewReceipt_creatorId_fkey",
  "ActionInterestViewReceipt_interestId_fkey",
  "ActionInterest_connectionId_fkey",
  "ActionResponseSnapshotItem_actionId_fkey",
  "ActionResponseSnapshotItem_activationId_fkey",
  "ActionResponseSnapshotItem_interestId_fkey",
  "ActionResponseSnapshotItem_snapshotId_fkey",
  "ActionResponseSnapshot_actionIdFilter_fkey",
  "ActionResponseSnapshot_creatorId_fkey",
  "Message_actionContextId_fkey",
  "NotificationOutbox_recipientId_fkey",
  "ProductFunnelEvent_actionContextId_fkey",
  "ProductFunnelEvent_actionInterestId_fkey",
  "ProductFunnelEvent_interestActivationId_fkey",
] as const;

test("BL-DB-01 schema and migrations keep the expand-only boundary", async () => {
  const [enumSql, expandSql, schema] = await Promise.all([
    readFile(enumMigrationPath, "utf8"),
    readFile(expandMigrationPath, "utf8"),
    readFile(schemaPath, "utf8"),
  ]);
  const executableExpandSql = stripSqlComments(expandSql);

  assert.match(enumSql, /CREATE TYPE "ActionCoordinationPolicy"/);
  assert.match(enumSql, /ALTER TYPE "ClassmatePostStatus" ADD VALUE IF NOT EXISTS 'FULFILLED'/);
  assert.match(enumSql, /ALTER TYPE "ClassmatePostStatus" ADD VALUE IF NOT EXISTS 'REMOVED'/);
  assert.equal(enumSql.match(/^\s*BEGIN\s*;/gim)?.length, 1);
  assert.equal(enumSql.match(/^\s*COMMIT\s*;/gim)?.length, 1);
  assert.doesNotMatch(stripSqlComments(enumSql), /\b(?:CREATE|ALTER|DROP)\s+TABLE\b/i);

  assert.equal(executableExpandSql.match(/^\s*BEGIN\s*;/gim)?.length, 1);
  assert.equal(executableExpandSql.match(/^\s*COMMIT\s*;/gim)?.length, 1);
  assert.equal(executableExpandSql.match(/^\s*ROLLBACK\s*;/gim)?.length ?? 0, 0);
  assert.match(
    executableExpandSql,
    /ALTER TABLE "ActionInterest"[\s\S]*ALTER COLUMN "connectionId" DROP NOT NULL/,
  );
  assert.match(
    executableExpandSql,
    /CONSTRAINT "ActionInterest_connectionId_fkey"[\s\S]*ON DELETE SET NULL/,
  );

  // BL-DB-03/04 own history-dependent checks and repaired-data uniqueness.
  assert.doesNotMatch(executableExpandSql, /\bCHECK\s*\(/i);
  assert.doesNotMatch(executableExpandSql, /CREATE\s+UNIQUE\s+INDEX[\s\S]*?\bWHERE\b/i);
  assert.doesNotMatch(executableExpandSql, /ACTION_INTEREST_CARD/);
  assert.doesNotMatch(executableExpandSql, /(?:ALTER TABLE|ON)\s+"Connection"/);

  // BL-DB-02 owns the stable commitment aggregate.
  assert.doesNotMatch(executableExpandSql, /CREATE TABLE "PlanCommitment"/);

  assert.match(extractPrismaBlock(schema, "model", "ActionInterest"), /connectionId\s+String\?/);
  assert.match(extractPrismaBlock(schema, "model", "Message"), /actionContextId\s+String\?/);
  for (const column of [...policyColumns, ...lifecycleColumns]) {
    assert.match(
      extractPrismaBlock(schema, "model", "ClassmatePost"),
      new RegExp(`^\\s*${column}\\s+[^\\n]+\\?`, "m"),
    );
  }
  for (const column of funnelColumns) {
    assert.match(
      extractPrismaBlock(schema, "model", "ProductFunnelEvent"),
      new RegExp(`^\\s*${column}\\s+[^\\n]+\\?`, "m"),
    );
  }
  for (const table of newTables) {
    assert.match(schema, new RegExp(`^model ${table}\\s*\\{`, "m"));
    assert.match(expandSql, new RegExp(`CREATE TABLE "${table}"`));
  }
  assert.match(
    extractPrismaBlock(schema, "model", "NotificationOutbox"),
    /dedupeKey\s+String\s+@unique/,
  );
});

test("BL-DB-01 integration test refuses any non-local PostgreSQL URL", () => {
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
    localPostgresUrl("postgresql://user:password@localhost:5433/database?port=5432"),
    undefined,
  );
  assert.equal(
    localPostgresUrl("postgresql://user:password@localhost:5433/database?schema=public"),
    "postgresql://user:password@localhost:5433/database?schema=public",
  );
});

test(
  "BL-DB-01 enum migration rolls back partial type creation",
  { skip: localDatabaseUrl ? false : "requires a localhost PostgreSQL DATABASE_URL" },
  async () => {
    await withFixtureSchema(async (client) => {
      await client.query("CREATE TYPE \"ActionInterestSurface\" AS ENUM ('EXISTING')");
      const enumSql = await readFile(enumMigrationPath, "utf8");

      await assert.rejects(client.query(enumSql), /already exists/i);
      await client.query("ROLLBACK");

      const types = await client.query<{ typname: string }>(`
        SELECT typname
        FROM pg_type
        WHERE typnamespace = current_schema()::regnamespace
          AND typname IN (
            'ActionCoordinationPolicy',
            'ActionCoordinationState',
            'ActionInterestSurface'
          )
        ORDER BY typname
      `);
      assert.deepEqual(types.rows, [{ typname: "ActionInterestSurface" }]);
    });
  },
);

test(
  "BL-DB-01 upgrades populated legacy rows without fabricating B-light state",
  { skip: localDatabaseUrl ? false : "requires a localhost PostgreSQL DATABASE_URL" },
  async () => {
    await withFixtureSchema(async (client) => {
      await seedLegacyFixture(client);
      await runMigrations(client);

      await assertLegacyInterestPreserved(client);
      await assertClassmatePostExpandedWithoutBackfill(client);
      await assertNullableMessageAndFunnelDimensions(client);
      await assertTablesIndexesAndForeignKeys(client);
      await assertDeferredConstraintsAreAbsent(client);
      await assertOutboxDedupeIsUnique(client);
      await assertInterestDeleteCascadesCoordinationGraph(client);
      await assertConnectionDeleteSetsInterestNull(client);
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
  if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") return undefined;
  if (!new Set(["127.0.0.1", "localhost", "::1"]).has(parsed.hostname)) return undefined;
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
  if ([...parsed.searchParams.keys()].some((key) => targetOverrides.has(key.toLowerCase()))) {
    return undefined;
  }
  return value;
}

function stripSqlComments(sql: string): string {
  return sql.replace(/^\s*--.*$/gm, "");
}

function extractPrismaBlock(source: string, kind: "model" | "enum", name: string): string {
  const match = source.match(new RegExp(`^${kind} ${name}\\s*\\{[\\s\\S]*?^\\}`, "m"));
  assert.ok(match, `${kind} ${name} must exist in prisma/schema.prisma`);
  return match[0];
}

async function withFixtureSchema(
  run: (client: InstanceType<typeof Client>) => Promise<void>,
): Promise<void> {
  assert.ok(localDatabaseUrl);
  const client = new Client({ connectionString: localDatabaseUrl });
  const schema = `bl_db01_${process.pid}_${Math.random().toString(36).slice(2, 10)}`;
  assert.match(schema, /^[a-z0-9_]+$/);
  await client.connect();
  try {
    await client.query(`CREATE SCHEMA "${schema}"`);
    await client.query(`SET search_path TO "${schema}"`);
    await createLegacyFixtureSchema(client);
    await run(client);
  } finally {
    await client.query("ROLLBACK").catch(() => undefined);
    await client.query("RESET search_path").catch(() => undefined);
    await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`).catch(() => undefined);
    await client.end();
  }
}

async function createLegacyFixtureSchema(client: InstanceType<typeof Client>): Promise<void> {
  await client.query(`
    CREATE TYPE "ClassmatePostStatus" AS ENUM ('ACTIVE', 'CLOSED');
    CREATE TYPE "ExperimentVariant" AS ENUM ('CONTROL', 'TREATMENT');

    CREATE TABLE "User" (
      "id" TEXT NOT NULL,
      CONSTRAINT "User_pkey" PRIMARY KEY ("id")
    );

    CREATE TABLE "Connection" (
      "id" TEXT NOT NULL,
      CONSTRAINT "Connection_pkey" PRIMARY KEY ("id")
    );

    CREATE TABLE "ClassmatePost" (
      "id" TEXT NOT NULL,
      "status" "ClassmatePostStatus" NOT NULL DEFAULT 'ACTIVE',
      "expiresAt" TIMESTAMP(3) NOT NULL,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "ClassmatePost_pkey" PRIMARY KEY ("id")
    );

    CREATE TABLE "ActionInterest" (
      "id" TEXT NOT NULL,
      "userId" TEXT NOT NULL,
      "classmatePostId" TEXT NOT NULL,
      "connectionId" TEXT NOT NULL,
      CONSTRAINT "ActionInterest_pkey" PRIMARY KEY ("id"),
      CONSTRAINT "ActionInterest_connectionId_fkey"
        FOREIGN KEY ("connectionId") REFERENCES "Connection"("id")
        ON DELETE CASCADE ON UPDATE CASCADE
    );

    CREATE TABLE "Message" (
      "id" TEXT NOT NULL,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
    );

    CREATE TABLE "ProductFunnelEvent" (
      "id" TEXT NOT NULL,
      "occurredAt" TIMESTAMP(3) NOT NULL,
      CONSTRAINT "ProductFunnelEvent_pkey" PRIMARY KEY ("id")
    );
  `);
}

async function seedLegacyFixture(client: InstanceType<typeof Client>): Promise<void> {
  await client.query('INSERT INTO "User" ("id") VALUES (\'creator\'), (\'responder\')');
  await client.query('INSERT INTO "Connection" ("id") VALUES (\'legacy-connection\')');
  await client.query(`
    INSERT INTO "ClassmatePost" ("id", "status", "expiresAt")
    VALUES ('legacy-action', 'ACTIVE', '2026-09-15T18:00:00.000Z')
  `);
  await client.query(`
    INSERT INTO "ActionInterest" (
      "id", "userId", "classmatePostId", "connectionId"
    ) VALUES (
      'legacy-interest', 'responder', 'legacy-action', 'legacy-connection'
    )
  `);
  await client.query(`
    INSERT INTO "Message" ("id") VALUES ('legacy-message');
    INSERT INTO "ProductFunnelEvent" ("id", "occurredAt")
    VALUES ('legacy-event', '2026-08-30T10:00:00.000Z');
  `);
}

async function runMigrations(client: InstanceType<typeof Client>): Promise<void> {
  const [enumSql, expandSql] = await Promise.all([
    readFile(enumMigrationPath, "utf8"),
    readFile(expandMigrationPath, "utf8"),
  ]);
  await client.query(enumSql);
  await client.query(expandSql);
}

async function assertLegacyInterestPreserved(
  client: InstanceType<typeof Client>,
): Promise<void> {
  const rows = await client.query<{ id: string; connectionId: string | null }>(
    'SELECT "id", "connectionId" FROM "ActionInterest" ORDER BY "id"',
  );
  assert.deepEqual(rows.rows, [
    { id: "legacy-interest", connectionId: "legacy-connection" },
  ]);
  assert.equal(await columnNullable(client, "ActionInterest", "connectionId"), true);
  assert.equal(
    await foreignKeyDeleteRule(client, "ActionInterest_connectionId_fkey"),
    "SET NULL",
  );
}

async function assertClassmatePostExpandedWithoutBackfill(
  client: InstanceType<typeof Client>,
): Promise<void> {
  const expectedNullableColumns = [...policyColumns, ...lifecycleColumns];
  for (const column of expectedNullableColumns) {
    assert.equal(await columnNullable(client, "ClassmatePost", column), true, column);
  }

  const result = await client.query<Record<string, unknown>>(
    `SELECT "status", ${expectedNullableColumns.map((column) => `"${column}"`).join(", ")}
     FROM "ClassmatePost" WHERE "id" = 'legacy-action'`,
  );
  assert.equal(result.rowCount, 1);
  assert.equal(result.rows[0]?.status, "ACTIVE");
  for (const column of expectedNullableColumns) {
    assert.equal(result.rows[0]?.[column], null, `${column} must not be fabricated`);
  }
}

async function assertNullableMessageAndFunnelDimensions(
  client: InstanceType<typeof Client>,
): Promise<void> {
  assert.equal(await columnNullable(client, "Message", "actionContextId"), true);
  for (const column of funnelColumns) {
    assert.equal(await columnNullable(client, "ProductFunnelEvent", column), true, column);
  }

  const message = await client.query<{ actionContextId: string | null }>(
    'SELECT "actionContextId" FROM "Message" WHERE "id" = \'legacy-message\'',
  );
  assert.deepEqual(message.rows, [{ actionContextId: null }]);

  const event = await client.query<Record<string, unknown>>(
    `SELECT ${funnelColumns.map((column) => `"${column}"`).join(", ")}
     FROM "ProductFunnelEvent" WHERE "id" = 'legacy-event'`,
  );
  assert.equal(event.rowCount, 1);
  for (const column of funnelColumns) {
    assert.equal(event.rows[0]?.[column], null, `${column} must remain null on legacy rows`);
  }
}

async function assertTablesIndexesAndForeignKeys(
  client: InstanceType<typeof Client>,
): Promise<void> {
  const tables = await client.query<{ table_name: string }>(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = current_schema()
      AND table_type = 'BASE TABLE'
  `);
  const tableNames = new Set(tables.rows.map((row) => row.table_name));
  for (const table of newTables) assert.equal(tableNames.has(table), true, table);

  const indexes = await client.query<{ indexname: string }>(`
    SELECT index_relation.relname AS indexname
    FROM pg_index index_row
    INNER JOIN pg_class table_relation
      ON table_relation.oid = index_row.indrelid
    INNER JOIN pg_class index_relation
      ON index_relation.oid = index_row.indexrelid
    INNER JOIN pg_namespace namespace
      ON namespace.oid = table_relation.relnamespace
    WHERE namespace.nspname = current_schema()
  `);
  const indexNames = new Set(indexes.rows.map((row) => row.indexname));
  for (const index of expectedIndexes) assert.equal(indexNames.has(index), true, index);

  const foreignKeys = await client.query<{ conname: string }>(`
    SELECT conname
    FROM pg_constraint
    WHERE connamespace = current_schema()::regnamespace
      AND contype = 'f'
  `);
  const foreignKeyNames = new Set(foreignKeys.rows.map((row) => row.conname));
  for (const foreignKey of expectedForeignKeys) {
    assert.equal(foreignKeyNames.has(foreignKey), true, foreignKey);
  }
}

async function assertDeferredConstraintsAreAbsent(
  client: InstanceType<typeof Client>,
): Promise<void> {
  const checks = await client.query<{ conname: string }>(`
    SELECT conname
    FROM pg_constraint
    WHERE connamespace = current_schema()::regnamespace
      AND contype = 'c'
  `);
  assert.deepEqual(checks.rows, []);

  const partialUniqueIndexes = await client.query<{ indexname: string }>(`
    SELECT index_relation.relname AS indexname
    FROM pg_index index_row
    INNER JOIN pg_class table_relation
      ON table_relation.oid = index_row.indrelid
    INNER JOIN pg_class index_relation
      ON index_relation.oid = index_row.indexrelid
    INNER JOIN pg_namespace namespace
      ON namespace.oid = table_relation.relnamespace
    WHERE namespace.nspname = current_schema()
      AND index_row.indisunique
      AND index_row.indpred IS NOT NULL
  `);
  assert.deepEqual(partialUniqueIndexes.rows, []);

  const connectionIndexes = await client.query<{ indexname: string }>(`
    SELECT index_relation.relname AS indexname
    FROM pg_index index_row
    INNER JOIN pg_class table_relation
      ON table_relation.oid = index_row.indrelid
    INNER JOIN pg_class index_relation
      ON index_relation.oid = index_row.indexrelid
    INNER JOIN pg_namespace namespace
      ON namespace.oid = table_relation.relnamespace
    WHERE namespace.nspname = current_schema()
      AND table_relation.relname = 'Connection'
    ORDER BY index_relation.relname
  `);
  assert.deepEqual(connectionIndexes.rows, [{ indexname: "Connection_pkey" }]);

  const planCommitments = await client.query<{ count: string }>(`
    SELECT COUNT(*)::TEXT AS count
    FROM information_schema.tables
    WHERE table_schema = current_schema()
      AND table_name = 'PlanCommitment'
  `);
  assert.deepEqual(planCommitments.rows, [{ count: "0" }]);
}

async function assertOutboxDedupeIsUnique(
  client: InstanceType<typeof Client>,
): Promise<void> {
  const insert = `
    INSERT INTO "NotificationOutbox" (
      "id", "dedupeKey", "kind", "recipientId", "destination", "payloadVersion", "payload"
    ) VALUES ($1, 'same-domain-event', 'ACTION_STATE', 'creator', '{}'::JSONB, 1, '{}'::JSONB)
  `;
  await client.query(insert, ["outbox-1"]);
  await assert.rejects(
    client.query(insert, ["outbox-2"]),
    (error: unknown) => error instanceof Error && "code" in error && error.code === "23505",
  );
}

async function assertConnectionDeleteSetsInterestNull(
  client: InstanceType<typeof Client>,
): Promise<void> {
  await client.query('DELETE FROM "Connection" WHERE "id" = \'legacy-connection\'');
  const result = await client.query<{ connectionId: string | null }>(
    'SELECT "connectionId" FROM "ActionInterest" WHERE "id" = \'legacy-interest\'',
  );
  assert.deepEqual(result.rows, [{ connectionId: null }]);
}

async function assertInterestDeleteCascadesCoordinationGraph(
  client: InstanceType<typeof Client>,
): Promise<void> {
  await client.query(`
    INSERT INTO "ActionInterest" (
      "id", "userId", "classmatePostId", "connectionId"
    ) VALUES (
      'cascade-interest', 'responder', 'legacy-action', 'legacy-connection'
    );

    INSERT INTO "ActionInterestActivation" (
      "id", "interestId", "ordinal", "interestSurface"
    ) VALUES (
      'cascade-activation', 'cascade-interest', 1, 'ACTION_DETAIL'
    );

    INSERT INTO "ActionCoordinationContext" (
      "id", "interestId", "currentActivationId", "updatedAt"
    ) VALUES (
      'cascade-context', 'cascade-interest', 'cascade-activation', CURRENT_TIMESTAMP
    );
  `);

  await client.query('DELETE FROM "ActionInterest" WHERE "id" = \'cascade-interest\'');

  const remaining = await client.query<{ activations: string; contexts: string }>(`
    SELECT
      (SELECT COUNT(*)::TEXT FROM "ActionInterestActivation"
       WHERE "id" = 'cascade-activation') AS activations,
      (SELECT COUNT(*)::TEXT FROM "ActionCoordinationContext"
       WHERE "id" = 'cascade-context') AS contexts
  `);
  assert.deepEqual(remaining.rows, [{ activations: "0", contexts: "0" }]);
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

async function foreignKeyDeleteRule(
  client: InstanceType<typeof Client>,
  constraintName: string,
): Promise<string> {
  const result = await client.query<{ delete_rule: string }>(
    `
      SELECT delete_rule
      FROM information_schema.referential_constraints
      WHERE constraint_schema = current_schema()
        AND constraint_name = $1
    `,
    [constraintName],
  );
  assert.equal(result.rowCount, 1, `${constraintName} must exist`);
  return result.rows[0]?.delete_rule ?? "";
}
