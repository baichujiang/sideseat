import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { join } from "node:path";

import pg from "pg";

const { Client } = pg;
const migrationPath = join(
  process.cwd(),
  "prisma",
  "migrations",
  "20260830203000_reconcile_schema_history",
  "migration.sql",
);
const localDatabaseUrl = localPostgresUrl(process.env.DATABASE_URL);

type AvailabilityState =
  | "SELECTED_ONLY"
  | "INCLUDED_ONLY"
  | "BOTH_CONSISTENT"
  | "BOTH_CONFLICTING";

type AvailabilityFixture = {
  id: string;
  selectedDates?: string[];
  includedDates?: string[] | null;
};

test("schema reconciliation migration owns one explicit transaction boundary", async () => {
  const sql = await readFile(migrationPath, "utf8");
  assert.match(sql, /AvailabilityShare/);
  assert.match(sql, /SchoolEmailVerification/);
  assert.equal(sql.match(/^\s*BEGIN\s*;/gim)?.length, 1);
  assert.equal(sql.match(/^\s*COMMIT\s*;/gim)?.length, 1);
  assert.equal(sql.match(/^\s*ROLLBACK\s*;/gim)?.length ?? 0, 0);
});

test("schema reconciliation fixtures reject connection target overrides", () => {
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
  "selectedDates-only databases preserve dates and normalize an empty array to null",
  { skip: localDatabaseUrl ? false : "requires a local PostgreSQL DATABASE_URL" },
  async () => {
    await withFixtureSchema("SELECTED_ONLY", async (client) => {
      await insertAvailabilityFixture(client, {
        id: "empty",
        selectedDates: [],
      });
      await insertAvailabilityFixture(client, {
        id: "nonempty",
        selectedDates: ["2026-09-02", "2026-09-04"],
      });

      await runMigration(client);

      await assertCanonicalAvailabilityColumns(client);
      const rows = await loadAvailabilityRows(client);
      assert.deepEqual(rows, [
        { id: "empty", includedDates: null },
        {
          id: "nonempty",
          includedDates: ["2026-09-02", "2026-09-04"],
        },
      ]);
      await assertDefaultsAfterMigration(client);
    });
  },
);

test(
  "includedDates-only databases remain unchanged",
  { skip: localDatabaseUrl ? false : "requires a local PostgreSQL DATABASE_URL" },
  async () => {
    await withFixtureSchema("INCLUDED_ONLY", async (client) => {
      await insertAvailabilityFixture(client, {
        id: "existing-null",
        includedDates: null,
      });
      await insertAvailabilityFixture(client, {
        id: "existing-dates",
        includedDates: ["2026-09-07", "2026-09-08"],
      });

      await runMigration(client);

      await assertCanonicalAvailabilityColumns(client);
      assert.deepEqual(await loadAvailabilityRows(client), [
        {
          id: "existing-dates",
          includedDates: ["2026-09-07", "2026-09-08"],
        },
        { id: "existing-null", includedDates: null },
      ]);
      await assertDefaultsAfterMigration(client);
    });
  },
);

test(
  "matching selectedDates and includedDates columns reconcile without data loss",
  { skip: localDatabaseUrl ? false : "requires a local PostgreSQL DATABASE_URL" },
  async () => {
    await withFixtureSchema("BOTH_CONSISTENT", async (client) => {
      await insertAvailabilityFixture(client, {
        id: "both-empty",
        selectedDates: [],
        includedDates: null,
      });
      await insertAvailabilityFixture(client, {
        id: "both-dates",
        selectedDates: ["2026-09-09", "2026-09-10"],
        includedDates: ["2026-09-09", "2026-09-10"],
      });

      await runMigration(client);

      await assertCanonicalAvailabilityColumns(client);
      assert.deepEqual(await loadAvailabilityRows(client), [
        {
          id: "both-dates",
          includedDates: ["2026-09-09", "2026-09-10"],
        },
        { id: "both-empty", includedDates: null },
      ]);
      await assertDefaultsAfterMigration(client);
    });
  },
);

test(
  "conflicting columns abort atomically and leave both the data and defaults untouched",
  { skip: localDatabaseUrl ? false : "requires a local PostgreSQL DATABASE_URL" },
  async () => {
    await withFixtureSchema("BOTH_CONFLICTING", async (client) => {
      await insertAvailabilityFixture(client, {
        id: "conflict",
        selectedDates: ["2026-09-11"],
        includedDates: ["2026-09-12"],
      });

      await assert.rejects(runMigration(client), /conflict|mismatch|differ/i);

      assert.deepEqual(await loadAvailabilityColumnNames(client), [
        "id",
        "includedDates",
        "selectedDates",
      ]);
      const result = await client.query<{
        id: string;
        selectedDates: string[];
        includedDates: string[];
      }>(
        'SELECT "id", "selectedDates", "includedDates" FROM "AvailabilityShare" ORDER BY "id"',
      );
      assert.deepEqual(result.rows, [
        {
          id: "conflict",
          selectedDates: ["2026-09-11"],
          includedDates: ["2026-09-12"],
        },
      ]);
      const schoolDefault = await columnDefault(
        client,
        "SchoolEmailVerification",
        "school",
      );
      const usageLimitDefault = await columnDefault(
        client,
        "ScheduleShareLink",
        "usageLimit",
      );
      assert.ok(schoolDefault !== null);
      assert.ok(usageLimitDefault !== null);
      assert.match(schoolDefault, /TUM/);
      assert.match(usageLimitDefault, /UNLIMITED/);
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

async function withFixtureSchema(
  state: AvailabilityState,
  run: (client: InstanceType<typeof Client>) => Promise<void>,
): Promise<void> {
  assert.ok(localDatabaseUrl);
  const client = new Client({ connectionString: localDatabaseUrl });
  const schema = `schema_reconcile_${process.pid}_${Math.random().toString(36).slice(2, 10)}`;
  assert.match(schema, /^[a-z0-9_]+$/);
  await client.connect();
  try {
    await client.query(`CREATE SCHEMA "${schema}"`);
    await client.query(`SET search_path TO "${schema}"`);
    await createFixtureTables(client, state);
    await run(client);
  } finally {
    await client.query("ROLLBACK").catch(() => undefined);
    await client.query("RESET search_path").catch(() => undefined);
    await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`).catch(() => undefined);
    await client.end();
  }
}

async function createFixtureTables(
  client: InstanceType<typeof Client>,
  state: AvailabilityState,
): Promise<void> {
  const availabilityColumns = ["\"id\" TEXT PRIMARY KEY"];
  if (state !== "INCLUDED_ONLY") {
    availabilityColumns.push(
      '\"selectedDates\" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[]',
    );
  }
  if (state !== "SELECTED_ONLY") {
    availabilityColumns.push('\"includedDates\" JSONB');
  }
  await client.query(`CREATE TABLE "AvailabilityShare" (${availabilityColumns.join(", ")})`);
  await client.query(`
    CREATE TABLE "SchoolEmailVerification" (
      "id" TEXT PRIMARY KEY,
      "school" TEXT NOT NULL DEFAULT 'TUM'
    )
  `);
  await client.query(
    'CREATE TYPE "ScheduleShareUsageLimit" AS ENUM (\'SINGLE_USE\', \'UNLIMITED\')',
  );
  await client.query(`
    CREATE TABLE "ScheduleShareLink" (
      "id" TEXT PRIMARY KEY,
      "usageLimit" "ScheduleShareUsageLimit" NOT NULL DEFAULT 'UNLIMITED'
    )
  `);
}

async function insertAvailabilityFixture(
  client: InstanceType<typeof Client>,
  fixture: AvailabilityFixture,
): Promise<void> {
  const columns = ['"id"'];
  const values: unknown[] = [fixture.id];
  const placeholders = ["$1"];
  if (Object.hasOwn(fixture, "selectedDates")) {
    columns.push('"selectedDates"');
    values.push(fixture.selectedDates);
    placeholders.push(`$${values.length}::TEXT[]`);
  }
  if (Object.hasOwn(fixture, "includedDates")) {
    columns.push('"includedDates"');
    values.push(fixture.includedDates === null ? null : JSON.stringify(fixture.includedDates));
    placeholders.push(`$${values.length}::JSONB`);
  }
  await client.query(
    `INSERT INTO "AvailabilityShare" (${columns.join(", ")}) VALUES (${placeholders.join(", ")})`,
    values,
  );
}

async function runMigration(client: InstanceType<typeof Client>): Promise<void> {
  const sql = await readFile(migrationPath, "utf8");
  try {
    await client.query(sql);
  } catch (cause) {
    // A failed statement after the migration's BEGIN leaves the connection in
    // PostgreSQL's aborted transaction state. Roll back so the fixture can
    // assert that no statement in the migration was partially committed.
    await client.query("ROLLBACK");
    throw cause;
  }
}

async function assertCanonicalAvailabilityColumns(
  client: InstanceType<typeof Client>,
): Promise<void> {
  assert.deepEqual(await loadAvailabilityColumnNames(client), ["id", "includedDates"]);
  const type = await client.query<{ data_type: string; is_nullable: string }>(`
    SELECT data_type, is_nullable
    FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'AvailabilityShare'
      AND column_name = 'includedDates'
  `);
  assert.deepEqual(type.rows, [{ data_type: "jsonb", is_nullable: "YES" }]);
}

async function loadAvailabilityColumnNames(
  client: InstanceType<typeof Client>,
): Promise<string[]> {
  const result = await client.query<{ column_name: string }>(`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'AvailabilityShare'
    ORDER BY column_name
  `);
  return result.rows.map((row) => row.column_name);
}

async function loadAvailabilityRows(
  client: InstanceType<typeof Client>,
): Promise<Array<{ id: string; includedDates: string[] | null }>> {
  const result = await client.query<{ id: string; includedDates: string[] | null }>(
    'SELECT "id", "includedDates" FROM "AvailabilityShare" ORDER BY "id"',
  );
  return result.rows;
}

async function assertDefaultsAfterMigration(
  client: InstanceType<typeof Client>,
): Promise<void> {
  assert.equal(await columnDefault(client, "SchoolEmailVerification", "school"), null);
  const usageLimitDefault = await columnDefault(
    client,
    "ScheduleShareLink",
    "usageLimit",
  );
  assert.ok(usageLimitDefault !== null);
  assert.match(usageLimitDefault, /UNLIMITED/);
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
  assert.equal(result.rowCount, 1);
  return result.rows[0]?.column_default ?? null;
}
