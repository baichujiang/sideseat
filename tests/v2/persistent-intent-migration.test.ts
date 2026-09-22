import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import pg from "pg";

const url = process.env.DATABASE_URL;
const local = url && ["localhost", "127.0.0.1", "::1"].includes(new URL(url).hostname);

test("persistent intention migration preserves participation and historical states", {
  skip: local ? false : "requires localhost PostgreSQL",
}, async () => {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    await client.query("BEGIN");
    await client.query(`
      CREATE TEMP TABLE "WeeklyIntent" (
        id text PRIMARY KEY, status text, "expiresAt" timestamp NOT NULL,
        "endedAt" timestamp, "pausedAt" timestamp, version integer DEFAULT 1,
        "updatedAt" timestamp, "automaticMatching" boolean, "exploreVisible" boolean
      ) ON COMMIT DROP;
      CREATE TEMP TABLE "MutualOpportunity" (
        id text PRIMARY KEY, status text, "intentAId" text, "intentBId" text,
        "terminalAt" timestamp, version integer DEFAULT 1, "updatedAt" timestamp
      ) ON COMMIT DROP;
      INSERT INTO "WeeklyIntent" (id, status, "expiresAt", "automaticMatching", "exploreVisible") VALUES
        ('active', 'ACTIVE', CURRENT_TIMESTAMP + interval '1 day', true, true),
        ('paused', 'PAUSED', CURRENT_TIMESTAMP + interval '1 day', true, false),
        ('private', 'ACTIVE', CURRENT_TIMESTAMP + interval '1 day', false, false),
        ('elapsed', 'ACTIVE', CURRENT_TIMESTAMP - interval '1 day', true, true),
        ('ended', 'ENDED', CURRENT_TIMESTAMP + interval '1 day', true, true),
        ('expired', 'EXPIRED', CURRENT_TIMESTAMP - interval '1 day', true, true);
      INSERT INTO "MutualOpportunity" (id, status, "intentAId", "intentBId") VALUES
        ('current', 'PENDING', 'active', 'private'),
        ('stale', 'PENDING', 'elapsed', 'active'),
        ('mutual', 'MUTUAL', 'elapsed', 'active');
    `);
    await client.query(readFileSync(new URL("../../prisma/migrations/20260912010000_persistent_intentions/migration.sql", import.meta.url), "utf8"));
    const rows = (await client.query('SELECT * FROM "WeeklyIntent" ORDER BY id')).rows;
    for (const id of ["active", "paused", "private"]) {
      assert.equal(rows.find(row => row.id === id).expiresAt, null);
    }
    assert.equal(rows.find(row => row.id === "paused").status, "PAUSED");
    assert.equal(rows.find(row => row.id === "private").automaticMatching, false);
    assert.equal(rows.find(row => row.id === "private").exploreVisible, false);
    for (const id of ["elapsed", "expired"]) {
      assert.equal(rows.find(row => row.id === id).status, "EXPIRED");
      assert.ok(rows.find(row => row.id === id).expiresAt);
    }
    assert.equal(rows.find(row => row.id === "ended").status, "ENDED");
    assert.deepEqual((await client.query('SELECT id, status FROM "MutualOpportunity" ORDER BY id')).rows,
      [{ id: "current", status: "PENDING" }, { id: "mutual", status: "MUTUAL" }, { id: "stale", status: "EXPIRED" }]);
  } finally {
    await client.query("ROLLBACK");
    await client.end();
  }
});
