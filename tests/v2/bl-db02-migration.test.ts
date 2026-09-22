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
  "20260830220000_blight_plan_commitment_enums",
  "migration.sql",
);
const expandMigrationPath = join(
  process.cwd(),
  "prisma",
  "migrations",
  "20260830221000_blight_plan_commitment_expand",
  "migration.sql",
);
const schemaPath = join(process.cwd(), "prisma", "schema.prisma");
const localDatabaseUrl = localPostgresUrl(process.env.DATABASE_URL);

const planRequestColumns = [
  "commitmentId",
  "originActionId",
  "originContextId",
  "resolutionReason",
  "resolvedAt",
  "resolvedByUserId",
  "revisionKind",
] as const;

const expectedForeignKeys = [
  ["CalendarEntry", "planCommitmentId", "PlanCommitment"],
  ["ClassmatePost", "fulfilledByPlanId", "PlanCommitment"],
  ["PlanCommitment", "canceledByUserId", "User"],
  ["PlanCommitment", "connectionId", "Connection"],
  ["PlanCommitment", "currentAcceptedRevisionId", "PlanRequest"],
  ["PlanCommitment", "currentPendingRevisionId", "PlanRequest"],
  ["PlanCommitment", "originActionId", "ClassmatePost"],
  ["PlanCommitment", "originContextId", "ActionCoordinationContext"],
  ["PlanCommitment", "participantAId", "User"],
  ["PlanCommitment", "participantBId", "User"],
  ["PlanOutcomeResponse", "planCommitmentId", "PlanCommitment"],
  ["PlanRequest", "commitmentId", "PlanCommitment"],
  ["PlanRequest", "originActionId", "ClassmatePost"],
  ["PlanRequest", "originContextId", "ActionCoordinationContext"],
  ["PlanRequest", "resolvedByUserId", "User"],
  ["ProductFunnelEvent", "planCommitmentId", "PlanCommitment"],
  ["ProductFunnelEvent", "planRevisionId", "PlanRequest"],
] as const;

test("BL-DB-02 schema and migrations keep the Plan expand boundary", async () => {
  const [enumSql, expandSql, schema] = await Promise.all([
    readFile(enumMigrationPath, "utf8"),
    readFile(expandMigrationPath, "utf8"),
    readFile(schemaPath, "utf8"),
  ]);
  const executableEnumSql = stripSqlComments(enumSql);
  const executableExpandSql = stripSqlComments(expandSql);

  for (const enumName of [
    "CalendarProjectionStatus",
    "PlanCommitmentStatus",
    "PlanResolutionReason",
    "PlanRevisionKind",
  ]) {
    assert.match(enumSql, new RegExp(`CREATE TYPE "${enumName}"`));
  }
  assert.equal(enumSql.match(/^\s*BEGIN\s*;/gim)?.length, 1);
  assert.equal(enumSql.match(/^\s*COMMIT\s*;/gim)?.length, 1);
  assert.doesNotMatch(executableEnumSql, /\b(?:CREATE|ALTER|DROP)\s+TABLE\b/i);
  assert.doesNotMatch(executableEnumSql, /ALTER\s+TYPE\s+"PlanRequestStatus"/i);
  assert.doesNotMatch(executableEnumSql, /\bINVALIDATED\b/i);

  assert.equal(expandSql.match(/^\s*BEGIN\s*;/gim)?.length, 1);
  assert.equal(expandSql.match(/^\s*COMMIT\s*;/gim)?.length, 1);
  assert.equal(expandSql.match(/^\s*ROLLBACK\s*;/gim)?.length ?? 0, 0);
  assert.match(executableExpandSql, /CREATE TABLE "PlanCommitment"/);

  // Expand does not invent stable ownership or rewrite any legacy row.
  assert.doesNotMatch(
    executableExpandSql,
    /^\s*(?:INSERT|UPDATE|DELETE|TRUNCATE)\b/gim,
  );
  assert.doesNotMatch(executableExpandSql, /DROP\s+(?:TABLE|COLUMN)\b/i);

  // BL-DB-05 owns repaired-data uniqueness and pointer-state constraints.
  assert.doesNotMatch(
    executableExpandSql,
    /CREATE\s+UNIQUE\s+INDEX[\s\S]*?\bWHERE\b/i,
  );
  assert.doesNotMatch(
    executableExpandSql,
    /CHECK\s*\([^;]*(?:currentAcceptedRevisionId|currentPendingRevisionId)/i,
  );
  assert.doesNotMatch(executableExpandSql, /PlanRequest_one_pending_per_/i);

  // BL-DB-06 owns post-confirmation safety cancellation storage.
  assert.doesNotMatch(
    `${enumSql}\n${expandSql}`,
    /PlanCommitmentCancellationReason|safetyCanceledBy|canceledByBlock|safetyActorId/i,
  );

  const commitment = extractPrismaBlock(schema, "model", "PlanCommitment");
  assert.match(commitment, /^\s*connectionId\s+String\s*$/m);
  assert.match(commitment, /^\s*participantAId\s+String\s*$/m);
  assert.match(commitment, /^\s*participantBId\s+String\s*$/m);
  assert.match(commitment, /^\s*originActionId\s+String\?\s*$/m);
  assert.match(commitment, /^\s*originContextId\s+String\?\s*$/m);
  assert.match(
    commitment,
    /^\s*status\s+PlanCommitmentStatus(?:\s+@default\(NEGOTIATING\))?\s*$/m,
  );
  assert.match(commitment, /^\s*currentAcceptedRevisionId\s+String\?[^\n]*$/m);
  assert.match(commitment, /^\s*currentPendingRevisionId\s+String\?[^\n]*$/m);
  assert.match(commitment, /^\s*canceledByUserId\s+String\?\s*$/m);

  const planRequest = extractPrismaBlock(schema, "model", "PlanRequest");
  for (const column of planRequestColumns) {
    assert.match(planRequest, new RegExp(`^\\s*${column}\\s+[^\\n]+\\?`, "m"));
  }
  const revisionKindLine =
    planRequest.match(/^\s*revisionKind\s+[^\n]+$/m)?.[0] ?? "";
  assert.doesNotMatch(revisionKindLine, /@default/);

  const calendarEntry = extractPrismaBlock(schema, "model", "CalendarEntry");
  assert.match(calendarEntry, /^\s*planCommitmentId\s+String\?\s*$/m);
  assert.match(
    calendarEntry,
    /projectionStatus\s+CalendarProjectionStatus\s+@default\(ACTIVE\)/,
  );
  assert.match(calendarEntry, /^\s*planRequestId\s+String\?\s*$/m);

  const outcome = extractPrismaBlock(schema, "model", "PlanOutcomeResponse");
  assert.match(outcome, /^\s*planCommitmentId\s+String\?\s*$/m);
  assert.match(outcome, /^\s*planId\s+String\s*$/m);

  const action = extractPrismaBlock(schema, "model", "ClassmatePost");
  assert.match(action, /^\s*fulfilledByPlanId\s+String\?\s+@unique\s*$/m);
});

test("BL-DB-02 integration test refuses any non-local effective PostgreSQL target", () => {
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
  "BL-DB-02 enum migration rolls back partial type creation",
  {
    skip: localDatabaseUrl
      ? false
      : "requires a localhost PostgreSQL DATABASE_URL",
  },
  async () => {
    await withFixtureSchema(async (client) => {
      await client.query(
        "CREATE TYPE \"PlanRevisionKind\" AS ENUM ('EXISTING')",
      );
      const enumSql = await readFile(enumMigrationPath, "utf8");

      await assert.rejects(client.query(enumSql), /already exists/i);
      await client.query("ROLLBACK");

      const types = await client.query<{ typname: string }>(`
        SELECT typname
        FROM pg_type
        WHERE typnamespace = current_schema()::regnamespace
          AND typname IN (
            'CalendarProjectionStatus',
            'PlanCommitmentStatus',
            'PlanResolutionReason',
            'PlanRevisionKind'
          )
        ORDER BY typname
      `);
      assert.deepEqual(types.rows, [{ typname: "PlanRevisionKind" }]);
    });
  },
);

test(
  "BL-DB-02 upgrades populated legacy Plan data without fabricating commitments",
  {
    skip: localDatabaseUrl
      ? false
      : "requires a localhost PostgreSQL DATABASE_URL",
  },
  async () => {
    await withFixtureSchema(async (client) => {
      await seedLegacyFixture(client);
      await runMigrations(client);

      await assertLegacyRowsPreserved(client);
      await assertExpandColumnContracts(client);
      await assertRequiredIndexes(client);
      await assertRequiredForeignKeys(client);
      await assertDeferredConstraintsAreAbsent(client);
      await assertNewRelationsAcceptValidReferences(client);
      await assertParticipantDeletionDrainsCommitmentGraph(client);
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

async function withFixtureSchema(
  run: (client: InstanceType<typeof Client>) => Promise<void>,
): Promise<void> {
  assert.ok(localDatabaseUrl);
  const client = new Client({ connectionString: localDatabaseUrl });
  const schema = `bl_db02_${process.pid}_${Math.random().toString(36).slice(2, 10)}`;
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
    await client
      .query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`)
      .catch(() => undefined);
    await client.end();
  }
}

async function createLegacyFixtureSchema(
  client: InstanceType<typeof Client>,
): Promise<void> {
  await client.query(`
    CREATE TYPE "PlanRequestStatus" AS ENUM (
      'PENDING', 'ACCEPTED', 'DECLINED', 'COUNTER_PROPOSED', 'CANCELED', 'EXPIRED'
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
      "planCommitmentId" TEXT,
      "planRevisionId" TEXT,
      CONSTRAINT "ProductFunnelEvent_pkey" PRIMARY KEY ("id")
    );
  `);
}

async function seedLegacyFixture(
  client: InstanceType<typeof Client>,
): Promise<void> {
  await client.query(`
    INSERT INTO "User" ("id") VALUES ('user-a'), ('user-b');
    INSERT INTO "Connection" ("id", "userAId", "userBId")
      VALUES ('legacy-connection', 'user-a', 'user-b');
    INSERT INTO "ClassmatePost" ("id") VALUES ('legacy-action');
    INSERT INTO "ActionCoordinationContext" ("id") VALUES ('legacy-context');
    INSERT INTO "PlanRequest" ("id", "status") VALUES ('legacy-plan', 'ACCEPTED');
    INSERT INTO "CalendarEntry" ("id", "userId", "planRequestId", "title")
      VALUES ('legacy-calendar', 'user-a', 'legacy-plan', 'Legacy title');
    INSERT INTO "PlanOutcomeResponse" ("id", "planId", "userId")
      VALUES ('legacy-outcome', 'legacy-plan', 'user-a');
    INSERT INTO "ProductFunnelEvent" ("id", "planCommitmentId", "planRevisionId")
      VALUES ('legacy-event', NULL, NULL);
  `);
}

async function runMigrations(
  client: InstanceType<typeof Client>,
): Promise<void> {
  const [enumSql, expandSql] = await Promise.all([
    readFile(enumMigrationPath, "utf8"),
    readFile(expandMigrationPath, "utf8"),
  ]);
  await client.query(enumSql);
  await client.query(expandSql);
}

async function assertLegacyRowsPreserved(
  client: InstanceType<typeof Client>,
): Promise<void> {
  const commitmentCount = await client.query<{ count: string }>(
    'SELECT COUNT(*)::TEXT AS count FROM "PlanCommitment"',
  );
  assert.deepEqual(commitmentCount.rows, [{ count: "0" }]);

  const plan = await client.query<Record<string, unknown>>(`
    SELECT "status", ${planRequestColumns.map((column) => `"${column}"`).join(", ")}
    FROM "PlanRequest"
    WHERE "id" = 'legacy-plan'
  `);
  assert.equal(plan.rowCount, 1);
  assert.equal(plan.rows[0]?.status, "ACCEPTED");
  for (const column of planRequestColumns) {
    assert.equal(
      plan.rows[0]?.[column],
      null,
      `${column} must not be fabricated`,
    );
  }

  const calendar = await client.query<{
    planCommitmentId: string | null;
    planRequestId: string | null;
    projectionStatus: string;
    title: string;
  }>(`
    SELECT "planCommitmentId", "planRequestId", "projectionStatus", "title"
    FROM "CalendarEntry"
    WHERE "id" = 'legacy-calendar'
  `);
  assert.deepEqual(calendar.rows, [
    {
      planCommitmentId: null,
      planRequestId: "legacy-plan",
      projectionStatus: "ACTIVE",
      title: "Legacy title",
    },
  ]);

  const outcome = await client.query<{
    planCommitmentId: string | null;
    planId: string;
  }>(`
    SELECT "planCommitmentId", "planId"
    FROM "PlanOutcomeResponse"
    WHERE "id" = 'legacy-outcome'
  `);
  assert.deepEqual(outcome.rows, [
    { planCommitmentId: null, planId: "legacy-plan" },
  ]);

  const action = await client.query<{ fulfilledByPlanId: string | null }>(`
    SELECT "fulfilledByPlanId"
    FROM "ClassmatePost"
    WHERE "id" = 'legacy-action'
  `);
  assert.deepEqual(action.rows, [{ fulfilledByPlanId: null }]);
}

async function assertExpandColumnContracts(
  client: InstanceType<typeof Client>,
): Promise<void> {
  for (const column of planRequestColumns) {
    assert.equal(
      await columnNullable(client, "PlanRequest", column),
      true,
      column,
    );
  }
  assert.equal(
    await columnDefault(client, "PlanRequest", "revisionKind"),
    null,
  );
  assert.equal(
    await columnNullable(client, "CalendarEntry", "planCommitmentId"),
    true,
  );
  assert.equal(
    await columnNullable(client, "CalendarEntry", "projectionStatus"),
    false,
  );
  assert.match(
    (await columnDefault(client, "CalendarEntry", "projectionStatus")) ?? "",
    /'ACTIVE'/,
  );
  assert.equal(
    await columnNullable(client, "PlanOutcomeResponse", "planCommitmentId"),
    true,
  );
  assert.equal(
    await columnNullable(client, "ClassmatePost", "fulfilledByPlanId"),
    true,
  );

  const statuses = await client.query<{ enumlabel: string }>(`
    SELECT enumlabel
    FROM pg_enum
    WHERE enumtypid = '"PlanRequestStatus"'::regtype
    ORDER BY enumsortorder
  `);
  assert.equal(
    statuses.rows.some((row) => row.enumlabel === "INVALIDATED"),
    false,
  );
}

async function assertRequiredIndexes(
  client: InstanceType<typeof Client>,
): Promise<void> {
  await assertIndex(client, "PlanCommitment", [
    "participantAId",
    "status",
    "updatedAt",
  ]);
  await assertIndex(client, "PlanCommitment", [
    "participantBId",
    "status",
    "updatedAt",
  ]);
  await assertIndex(client, "PlanCommitment", ["originActionId"]);
  await assertIndexPrefix(client, "PlanRequest", ["commitmentId"]);
  await assertIndexPrefix(client, "PlanRequest", ["originActionId"]);
  await assertIndexPrefix(client, "PlanRequest", ["originContextId"]);
  await assertIndexPrefix(client, "CalendarEntry", ["planCommitmentId"]);
  await assertIndexPrefix(client, "PlanOutcomeResponse", ["planCommitmentId"]);
  await assertIndex(client, "ClassmatePost", ["fulfilledByPlanId"], {
    unique: true,
  });
  await assertIndex(client, "PlanCommitment", ["currentAcceptedRevisionId"], {
    unique: true,
  });
  await assertIndex(client, "PlanCommitment", ["currentPendingRevisionId"], {
    unique: true,
  });
}

async function assertRequiredForeignKeys(
  client: InstanceType<typeof Client>,
): Promise<void> {
  const result = await client.query<{
    column_name: string;
    foreign_table_name: string;
    table_name: string;
  }>(`
    SELECT
      source.relname AS table_name,
      source_column.attname AS column_name,
      target.relname AS foreign_table_name
    FROM pg_constraint constraint_row
    JOIN pg_class source ON source.oid = constraint_row.conrelid
    JOIN pg_class target ON target.oid = constraint_row.confrelid
    JOIN LATERAL unnest(constraint_row.conkey) WITH ORDINALITY source_key(attnum, ord)
      ON TRUE
    JOIN LATERAL unnest(constraint_row.confkey) WITH ORDINALITY target_key(attnum, ord)
      ON target_key.ord = source_key.ord
    JOIN pg_attribute source_column
      ON source_column.attrelid = source.oid AND source_column.attnum = source_key.attnum
    WHERE constraint_row.contype = 'f'
      AND constraint_row.connamespace = current_schema()::regnamespace
  `);
  const actual = new Set(
    result.rows.map(
      (row) =>
        `${row.table_name}.${row.column_name}->${row.foreign_table_name}`,
    ),
  );
  for (const [table, column, target] of expectedForeignKeys) {
    assert.equal(
      actual.has(`${table}.${column}->${target}`),
      true,
      `${table}.${column}`,
    );
  }
}

async function assertDeferredConstraintsAreAbsent(
  client: InstanceType<typeof Client>,
): Promise<void> {
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

  const indexes = await readIndexes(client);
  assert.equal(
    indexes.some(
      (index) =>
        index.tableName === "CalendarEntry" &&
        index.unique &&
        sameColumns(index.columns, ["userId", "planCommitmentId"]),
    ),
    false,
  );
  assert.equal(
    indexes.some(
      (index) =>
        index.tableName === "PlanOutcomeResponse" &&
        index.unique &&
        sameColumns(index.columns, ["planCommitmentId", "userId"]),
    ),
    false,
  );

  const pointerChecks = await client.query<{ definition: string }>(`
    SELECT pg_get_constraintdef(oid) AS definition
    FROM pg_constraint
    WHERE connamespace = current_schema()::regnamespace
      AND contype = 'c'
      AND conrelid = '"PlanCommitment"'::regclass
  `);
  for (const row of pointerChecks.rows) {
    assert.doesNotMatch(
      row.definition,
      /currentAcceptedRevisionId|currentPendingRevisionId/,
    );
  }
}

async function assertNewRelationsAcceptValidReferences(
  client: InstanceType<typeof Client>,
): Promise<void> {
  await client.query(`
    INSERT INTO "PlanCommitment" (
      "id", "connectionId", "participantAId", "participantBId",
      "originActionId", "originContextId", "status", "createdAt", "updatedAt"
    ) VALUES (
      'commitment-1', 'legacy-connection', 'user-a', 'user-b',
      'legacy-action', 'legacy-context', 'NEGOTIATING', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
    );

    UPDATE "PlanRequest"
    SET
      "commitmentId" = 'commitment-1',
      "revisionKind" = 'INITIAL',
      "originActionId" = 'legacy-action',
      "originContextId" = 'legacy-context'
    WHERE "id" = 'legacy-plan';

    UPDATE "PlanCommitment"
    SET "currentAcceptedRevisionId" = 'legacy-plan'
    WHERE "id" = 'commitment-1';

    UPDATE "CalendarEntry"
    SET "planCommitmentId" = 'commitment-1'
    WHERE "id" = 'legacy-calendar';

    UPDATE "PlanOutcomeResponse"
    SET "planCommitmentId" = 'commitment-1'
    WHERE "id" = 'legacy-outcome';

    UPDATE "ClassmatePost"
    SET "fulfilledByPlanId" = 'commitment-1'
    WHERE "id" = 'legacy-action';

    UPDATE "ProductFunnelEvent"
    SET
      "planCommitmentId" = 'commitment-1',
      "planRevisionId" = 'legacy-plan'
    WHERE "id" = 'legacy-event';

    INSERT INTO "CalendarEntry" (
      "id", "userId", "planRequestId", "planCommitmentId", "title"
    ) VALUES (
      'counterpart-calendar', 'user-b', 'legacy-plan', 'commitment-1', 'Shared title'
    );
  `);

  await assert.rejects(
    client.query(`
      UPDATE "CalendarEntry"
      SET "planCommitmentId" = 'missing-commitment'
      WHERE "id" = 'legacy-calendar'
    `),
    (error: unknown) =>
      error instanceof Error && "code" in error && error.code === "23503",
  );
}

async function assertParticipantDeletionDrainsCommitmentGraph(
  client: InstanceType<typeof Client>,
): Promise<void> {
  await client.query('DELETE FROM "User" WHERE "id" = \'user-a\'');

  const domainRows = await client.query<{
    commitments: string;
    outcomes: string;
    revisions: string;
  }>(`
    SELECT
      (SELECT COUNT(*)::TEXT FROM "PlanCommitment"
       WHERE "id" = 'commitment-1') AS commitments,
      (SELECT COUNT(*)::TEXT FROM "PlanRequest"
       WHERE "id" = 'legacy-plan') AS revisions,
      (SELECT COUNT(*)::TEXT FROM "PlanOutcomeResponse"
       WHERE "id" = 'legacy-outcome') AS outcomes
  `);
  assert.deepEqual(domainRows.rows, [
    { commitments: "0", outcomes: "0", revisions: "0" },
  ]);

  const calendars = await client.query<{
    id: string;
    planCommitmentId: string | null;
    planRequestId: string | null;
  }>(`
    SELECT "id", "planCommitmentId", "planRequestId"
    FROM "CalendarEntry"
    ORDER BY "id"
  `);
  assert.deepEqual(calendars.rows, [
    {
      id: "counterpart-calendar",
      planCommitmentId: null,
      planRequestId: null,
    },
  ]);

  const action = await client.query<{ fulfilledByPlanId: string | null }>(`
    SELECT "fulfilledByPlanId"
    FROM "ClassmatePost"
    WHERE "id" = 'legacy-action'
  `);
  assert.deepEqual(action.rows, [{ fulfilledByPlanId: null }]);

  const event = await client.query<{
    planCommitmentId: string | null;
    planRevisionId: string | null;
  }>(`
    SELECT "planCommitmentId", "planRevisionId"
    FROM "ProductFunnelEvent"
    WHERE "id" = 'legacy-event'
  `);
  assert.deepEqual(event.rows, [
    { planCommitmentId: null, planRevisionId: null },
  ]);
}

type IndexRecord = {
  columns: string[];
  tableName: string;
  unique: boolean;
};

async function assertIndex(
  client: InstanceType<typeof Client>,
  tableName: string,
  columns: string[],
  options: { unique?: boolean } = {},
): Promise<void> {
  const indexes = await readIndexes(client);
  assert.equal(
    indexes.some(
      (index) =>
        index.tableName === tableName &&
        sameColumns(index.columns, columns) &&
        (options.unique === undefined || index.unique === options.unique),
    ),
    true,
    `${tableName} index (${columns.join(", ")})`,
  );
}

async function assertIndexPrefix(
  client: InstanceType<typeof Client>,
  tableName: string,
  columns: string[],
): Promise<void> {
  const indexes = await readIndexes(client);
  assert.equal(
    indexes.some(
      (index) =>
        index.tableName === tableName &&
        columns.every((column, position) => index.columns[position] === column),
    ),
    true,
    `${tableName} index prefix (${columns.join(", ")})`,
  );
}

async function readIndexes(
  client: InstanceType<typeof Client>,
): Promise<IndexRecord[]> {
  const result = await client.query<{
    columns: string[];
    is_unique: boolean;
    table_name: string;
  }>(`
    SELECT
      table_row.relname AS table_name,
      index_row.indisunique AS is_unique,
      array_agg(column_row.attname::TEXT ORDER BY index_key.ord) AS columns
    FROM pg_index index_row
    JOIN pg_class table_row ON table_row.oid = index_row.indrelid
    JOIN LATERAL unnest(index_row.indkey) WITH ORDINALITY index_key(attnum, ord)
      ON index_key.attnum > 0
    JOIN pg_attribute column_row
      ON column_row.attrelid = table_row.oid AND column_row.attnum = index_key.attnum
    WHERE table_row.relnamespace = current_schema()::regnamespace
    GROUP BY table_row.relname, index_row.indexrelid, index_row.indisunique
  `);
  return result.rows.map((row) => ({
    columns: row.columns,
    tableName: row.table_name,
    unique: row.is_unique,
  }));
}

function sameColumns(left: string[], right: string[]): boolean {
  return (
    left.length === right.length &&
    left.every((column, index) => column === right[index])
  );
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
