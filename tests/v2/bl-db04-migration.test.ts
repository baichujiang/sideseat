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
  "20260831010000_blight_canonical_connection_hardening",
  "migration.sql",
);
const localDatabaseUrl = localPostgresUrl(process.env.DATABASE_URL);

const connectionChildren = [
  "ActionCoordinationContext",
  "ActionInterest",
  "AvailabilityShare",
  "Block",
  "ContactExchangeRequest",
  "FriendLink",
  "Message",
  "PlanCommitment",
  "PlanRequest",
  "ProductFunnelEvent",
  "Report",
  "StudySessionProposal",
] as const;

test("BL-DB-04 migration freezes the conservative atomic repair boundary", async () => {
  const sql = await readFile(migrationPath, "utf8");
  const executable = stripSqlComments(sql);

  assert.equal(sql.match(/^\s*BEGIN\s*;/gim)?.length, 1);
  assert.equal(sql.match(/^\s*COMMIT\s*;/gim)?.length, 1);
  assert.equal(sql.match(/^\s*ROLLBACK\s*;/gim)?.length ?? 0, 0);
  assert.ok(
    executable.indexOf("$preflight_activation$") <
      executable.search(/^\s*(?:UPDATE|DELETE)\b/im),
  );
  assert.match(executable, /ORDER BY connection\."createdAt" ASC, connection\."id" ASC/);
  assert.doesNotMatch(
    executable,
    /ORDER BY[\s\S]{0,120}(?:BLOCKED|ACTIVE|ENDED)/i,
  );

  for (const table of connectionChildren) {
    assert.match(
      executable,
      new RegExp(
        table === "FriendLink"
          ? `UPDATE\\s+"${table}"[\\s\\S]*?"connectionId"`
          : `UPDATE\\s+"${table}"\\s+child[\\s\\S]*?"connectionId"`,
      ),
      table,
    );
  }
  assert.match(executable, /UPDATE "ChatRealtimeEvent"/);
  assert.match(executable, /INSERT INTO "ChatRealtimeRetention"/);
  assert.match(executable, /UPDATE "NotificationOutbox"/);
  assert.match(executable, /UPDATE "ApiIdempotencyRecord"/);
  assert.match(
    executable,
    /ADD COLUMN "directTransitionGeneration" INTEGER NOT NULL DEFAULT 0/,
  );
  assert.match(
    executable,
    /ActionInterest_directTransitionGeneration_nonnegative_check/,
  );
  assert.match(executable, /LEFT JOIN "_bl_db04_connection_map" message_map/);
  assert.match(executable, /LEFT JOIN "_bl_db04_connection_map" interest_map/);
  assert.match(executable, /LEFT JOIN "_bl_db04_connection_map" context_map/);
  assert.match(
    executable,
    /effective_context\."interestId" = interest\."id"/,
  );
  assert.ok(
    executable.indexOf('CREATE TEMP TABLE "_bl_db04_connection_map"') <
      executable.indexOf("$preflight_source_cards$"),
  );
  assert.ok(
    executable.lastIndexOf("$preflight_source_cards$") <
      executable.indexOf('ALTER TABLE "ActionInterest"'),
  );
  assert.match(executable, /jsonb_set\([\s\S]*?'\{connectionId\}'/);
  assert.doesNotMatch(executable, /jsonb_path|#>|#>>/i);

  assert.match(executable, /CREATE UNIQUE INDEX "Connection_unordered_user_pair_key"/);
  assert.match(executable, /CREATE UNIQUE INDEX "Message_actionInterest_source_card_key"/);
  assert.match(executable, /CREATE UNIQUE INDEX "Message_actionContext_source_card_key"/);
  assert.match(
    executable,
    /CREATE CONSTRAINT TRIGGER "Message_action_interest_card_context_attribution"[\s\S]*DEFERRABLE INITIALLY DEFERRED/,
  );
  assert.match(executable, /ActionInterestActivation_connected_content_check/);
  assert.match(executable, /ActionInterestActivation_connected_terminal_exclusive_check/);
  assert.match(executable, /ActionInterestActivation_terminal_pair_check/);

  // BL-DB-04 only changes Connection ownership. It must not infer Plan origin.
  assert.doesNotMatch(executable, /SET[\s\S]{0,100}"originActionId"\s*=/i);
  assert.doesNotMatch(executable, /SET[\s\S]{0,100}"originContextId"\s*=/i);
  assert.doesNotMatch(executable, /SET[\s\S]{0,100}"originKind"\s*=/i);
});

test("BL-DB-04 PostgreSQL test refuses a non-local effective target", () => {
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
    localPostgresUrl("postgresql://user:password@localhost:5433/db?schema=public"),
    "postgresql://user:password@localhost:5433/db?schema=public",
  );
});

test(
  "BL-DB-04 repairs a reversible pair, preserves every child, and installs hard invariants",
  { skip: localDatabaseUrl ? false : "requires a localhost PostgreSQL DATABASE_URL" },
  async () => {
    await withFixtureSchema(async (client) => {
      await seedRepairableFixture(client);
      await client.query(await readFile(migrationPath, "utf8"));

      const connections = await client.query<{
        id: string;
        userAId: string;
        userBId: string;
        invitationId: string | null;
        originCourseId: string | null;
        contactRemarkByA: string | null;
        contactRemarkByB: string | null;
        pinnedByAAt: string | null;
        pinnedByBAt: string | null;
        readByAAt: string | null;
        readByBAt: string | null;
        replyLimitUnlockedAt: string | null;
        updatedAt: string;
      }>(`
        SELECT
          "id", "userAId", "userBId", "invitationId", "originCourseId",
          "contactRemarkByA", "contactRemarkByB",
          TO_CHAR("pinnedByAAt", 'YYYY-MM-DD"T"HH24:MI:SS') AS "pinnedByAAt",
          TO_CHAR("pinnedByBAt", 'YYYY-MM-DD"T"HH24:MI:SS') AS "pinnedByBAt",
          TO_CHAR("readByAAt", 'YYYY-MM-DD"T"HH24:MI:SS') AS "readByAAt",
          TO_CHAR("readByBAt", 'YYYY-MM-DD"T"HH24:MI:SS') AS "readByBAt",
          TO_CHAR("replyLimitUnlockedAt", 'YYYY-MM-DD"T"HH24:MI:SS') AS "replyLimitUnlockedAt",
          TO_CHAR("updatedAt", 'YYYY-MM-DD"T"HH24:MI:SS') AS "updatedAt"
        FROM "Connection"
        ORDER BY "id"
      `);
      assert.equal(connections.rows.length, 1);
      assert.deepEqual(
        {
          id: connections.rows[0]?.id,
          a: connections.rows[0]?.userAId,
          b: connections.rows[0]?.userBId,
          invitation: connections.rows[0]?.invitationId,
          course: connections.rows[0]?.originCourseId,
          remarkA: connections.rows[0]?.contactRemarkByA,
          remarkB: connections.rows[0]?.contactRemarkByB,
        },
        {
          id: "connection-a",
          a: "user-a",
          b: "user-b",
          invitation: "invitation-1",
          course: "course-1",
          remarkA: "Alice private",
          remarkB: "Bob private",
        },
      );
      assert.equal(connections.rows[0]?.pinnedByAAt, "2026-08-03T00:00:00");
      assert.equal(connections.rows[0]?.pinnedByBAt, "2026-08-04T00:00:00");
      assert.equal(connections.rows[0]?.readByAAt, "2026-08-05T00:00:00");
      assert.equal(connections.rows[0]?.readByBAt, "2026-08-06T00:00:00");
      assert.equal(
        connections.rows[0]?.replyLimitUnlockedAt,
        "2026-08-07T00:00:00",
      );
      assert.equal(connections.rows[0]?.updatedAt, "2026-08-08T00:00:00");
      const transitionGenerations = await client.query(`
        SELECT "id", "directTransitionGeneration"
        FROM "ActionInterest"
        ORDER BY "id"
      `);
      assert.deepEqual(transitionGenerations.rows, [
        { id: "interest-1", directTransitionGeneration: 0 },
        { id: "interest-2", directTransitionGeneration: 0 },
      ]);

      for (const table of connectionChildren) {
        const result = await client.query<{ count: string; connectionId: string }>(`
          SELECT COUNT(*)::TEXT AS count, MIN("connectionId") AS "connectionId"
          FROM "${table}"
        `);
        const expectedCount =
          table === "Message"
            ? "4"
            : table === "ActionInterest" || table === "ActionCoordinationContext"
              ? "2"
              : "1";
        assert.deepEqual(result.rows, [
          { count: expectedCount, connectionId: "connection-a" },
        ], table);
      }

      const friend = await client.query<{
        id: string;
        status: string;
        requesterId: string;
        responderId: string;
        createdAt: string;
        updatedAt: string;
      }>(`
        SELECT
          "id", "status", "requesterId", "responderId",
          TO_CHAR("createdAt", 'YYYY-MM-DD"T"HH24:MI:SS') AS "createdAt",
          TO_CHAR("updatedAt", 'YYYY-MM-DD"T"HH24:MI:SS') AS "updatedAt"
        FROM "FriendLink"
      `);
      assert.deepEqual(friend.rows, [
        {
          id: "friend-a",
          status: "ACCEPTED",
          requesterId: "user-a",
          responderId: "user-b",
          createdAt: "2026-08-02T00:00:00",
          updatedAt: "2026-08-05T00:00:00",
        },
      ]);

      const cards = await client.query<{
        id: string;
        type: string;
        body: string;
        deletedAt: Date | null;
        actionInterestId: string | null;
        actionContextId: string | null;
      }>(`
        SELECT "id", "type", "body", "deletedAt", "actionInterestId", "actionContextId"
        FROM "Message"
        WHERE "id" IN ('message-card-a', 'message-card-b')
        ORDER BY "id"
      `);
      assert.deepEqual(
        cards.rows.map((row) => ({
          id: row.id,
          type: row.type,
          body: row.body,
          deleted: row.deletedAt !== null,
          interest: row.actionInterestId,
          context: row.actionContextId,
        })),
        [
          {
            id: "message-card-a",
            type: "ACTION_INTEREST_CARD",
            body: "",
            deleted: false,
            interest: "interest-1",
            context: "context-1",
          },
          {
            id: "message-card-b",
            type: "SYSTEM",
            body: "",
            deleted: true,
            interest: null,
            context: null,
          },
        ],
      );
      const standaloneContextCard = await client.query(`
        SELECT "actionInterestId", "actionContextId", "type"
        FROM "Message"
        WHERE "id" = 'message-context-only'
      `);
      assert.deepEqual(standaloneContextCard.rows, [
        {
          actionInterestId: "interest-2",
          actionContextId: "context-2",
          type: "ACTION_INTEREST_CARD",
        },
      ]);
      const creatorGatedConnections = await client.query(`
        SELECT
          (SELECT "connectionId" FROM "ActionInterest" WHERE "id" = 'interest-2')
            AS interest_connection,
          (SELECT "connectionId" FROM "ActionCoordinationContext" WHERE "id" = 'context-2')
            AS context_connection,
          (SELECT "connectionId" FROM "Message" WHERE "id" = 'message-context-only')
            AS message_connection
      `);
      assert.deepEqual(creatorGatedConnections.rows, [
        {
          interest_connection: null,
          context_connection: "connection-a",
          message_connection: "connection-a",
        },
      ]);
      const replyAndReport = await client.query(`
        SELECT
          (SELECT "replyToId" FROM "Message" WHERE "id" = 'message-reply') AS reply,
          (SELECT "messageId" FROM "Report" WHERE "id" = 'report-1') AS report
      `);
      assert.deepEqual(replyAndReport.rows, [
        { reply: "message-card-b", report: "message-card-b" },
      ]);

      const realtime = await client.query(`
        SELECT "conversationKind", "conversationId", "messageId"
        FROM "ChatRealtimeEvent"
        ORDER BY "conversationKind", "messageId"
      `);
      assert.deepEqual(realtime.rows, [
        {
          conversationKind: "COURSE",
          conversationId: "connection-b",
          messageId: "course-message",
        },
        {
          conversationKind: "DIRECT",
          conversationId: "connection-a",
          messageId: "message-card-b",
        },
      ]);
      const retention = await client.query(`
        SELECT
          "conversationKind", "conversationId", "retainedAfterSequence",
          TO_CHAR("updatedAt", 'YYYY-MM-DD"T"HH24:MI:SS') AS "updatedAt"
        FROM "ChatRealtimeRetention"
        ORDER BY "conversationKind"
      `);
      assert.equal(retention.rows.length, 2);
      assert.deepEqual(
        retention.rows.map((row) => ({
          kind: row.conversationKind,
          id: row.conversationId,
          boundary: String(row.retainedAfterSequence),
          updatedAt: row.updatedAt,
        })),
        [
          {
            kind: "COURSE",
            id: "connection-b",
            boundary: "30",
            updatedAt: "2026-08-10T00:00:00",
          },
          {
            kind: "DIRECT",
            id: "connection-a",
            boundary: "20",
            updatedAt: "2026-08-09T00:00:00",
          },
        ],
      );

      const jsonReferences = await client.query(`
        SELECT
          (SELECT "destination" ->> 'connectionId' FROM "NotificationOutbox" WHERE "id" = 'outbox-top') AS outbox_top,
          (SELECT "destination" #>> '{nested,connectionId}' FROM "NotificationOutbox" WHERE "id" = 'outbox-nested') AS outbox_nested,
          (SELECT "responseBody" ->> 'connectionId' FROM "ApiIdempotencyRecord" WHERE "id" = 'receipt-top') AS receipt_top,
          (SELECT "responseBody" #>> '{nested,connectionId}' FROM "ApiIdempotencyRecord" WHERE "id" = 'receipt-nested') AS receipt_nested
      `);
      assert.deepEqual(jsonReferences.rows, [
        {
          outbox_top: "connection-a",
          outbox_nested: "connection-b",
          receipt_top: "connection-a",
          receipt_nested: "connection-b",
        },
      ]);

      const planOrigin = await client.query(`
        SELECT
          (SELECT "originActionId" FROM "PlanCommitment" WHERE "id" = 'commitment-1') AS commitment_action,
          (SELECT "originContextId" FROM "PlanCommitment" WHERE "id" = 'commitment-1') AS commitment_context,
          (SELECT "originActionId" FROM "PlanRequest" WHERE "id" = 'request-1') AS request_action,
          (SELECT "originContextId" FROM "PlanRequest" WHERE "id" = 'request-1') AS request_context
      `);
      assert.deepEqual(planOrigin.rows, [
        {
          commitment_action: null,
          commitment_context: null,
          request_action: null,
          request_context: null,
        },
      ]);

      await assertCatalogInvariants(client);
      await assertHardInvariantsRejectInvalidWrites(client);
    });
  },
);

test(
  "BL-DB-04 preflight conflict rolls back before any persistent repair",
  { skip: localDatabaseUrl ? false : "requires a localhost PostgreSQL DATABASE_URL" },
  async () => {
    await withFixtureSchema(async (client) => {
      await seedRepairableFixture(client);
      await client.query(`
        UPDATE "Connection"
        SET "status" = 'ENDED', "endedAt" = '2026-08-11T00:00:00Z', "endedById" = 'user-a'
        WHERE "id" = 'connection-b'
      `);
      const before = await fixtureFingerprint(client);

      await assert.rejects(
        client.query(await readFile(migrationPath, "utf8")),
        /conflicting status, terminal metadata, invitation, or course/,
      );
      await client.query("ROLLBACK");

      assert.deepEqual(await fixtureFingerprint(client), before);
      assert.equal(await indexExists(client, "Connection_unordered_user_pair_key"), false);
      assert.equal(
        await constraintExists(
          client,
          "ActionInterestActivation_connected_content_check",
        ),
        false,
      );
      assert.equal(
        await columnExists(client, "ActionInterest", "directTransitionGeneration"),
        false,
      );
    });
  },
);

test(
  "BL-DB-04 refuses invalid Activation history without guessing first content",
  { skip: localDatabaseUrl ? false : "requires a localhost PostgreSQL DATABASE_URL" },
  async () => {
    await withFixtureSchema(async (client) => {
      await seedRepairableFixture(client);
      await client.query(`
        INSERT INTO "ActionInterestActivation" (
          "id", "interestId", "connectedAt", "firstContentType"
        ) VALUES ('activation-invalid', 'interest-1', '2026-08-10T00:00:00Z', NULL)
      `);
      const before = await fixtureFingerprint(client);

      await assert.rejects(
        client.query(await readFile(migrationPath, "utf8")),
        /invalid ActionInterestActivation terminal state/,
      );
      await client.query("ROLLBACK");

      assert.deepEqual(await fixtureFingerprint(client), before);
    });
  },
);

test(
  "BL-DB-04 rolls back an unresolved context-only source card",
  { skip: localDatabaseUrl ? false : "requires a localhost PostgreSQL DATABASE_URL" },
  async () => {
    await withFixtureSchema(async (client) => {
      await seedRepairableFixture(client);
      await client.query(`
        ALTER TABLE "Message" DROP CONSTRAINT "Message_actionContextId_fkey";
        INSERT INTO "Message" (
          "id", "connectionId", "senderId", "body", "type",
          "actionInterestId", "actionContextId", "createdAt"
        ) VALUES (
          'message-unresolved-context', 'connection-a', 'user-a', '',
          'ACTION_INTEREST_CARD', NULL, 'missing-context', '2026-08-06T00:00:00Z'
        )
      `);
      const before = await fixtureFingerprint(client);

      await assert.rejects(
        client.query(await readFile(migrationPath, "utf8")),
        /ACTION_INTEREST_CARD attribution is inconsistent/,
      );
      await client.query("ROLLBACK");

      assert.deepEqual(await fixtureFingerprint(client), before);
      assert.equal(
        await indexExists(client, "Message_actionInterest_source_card_key"),
        false,
      );
    });
  },
);

test(
  "BL-DB-04 rolls back a source card attributed to another Connection pair",
  { skip: localDatabaseUrl ? false : "requires a localhost PostgreSQL DATABASE_URL" },
  async () => {
    await withFixtureSchema(async (client) => {
      await seedRepairableFixture(client);
      await client.query(`
        INSERT INTO "Connection" (
          "id", "userAId", "userBId", "status", "createdAt", "updatedAt"
        ) VALUES (
          'connection-other', 'user-a', 'user-c', 'ACTIVE',
          '2026-08-01T00:00:00Z', '2026-08-01T00:00:00Z'
        );
        INSERT INTO "Message" (
          "id", "connectionId", "senderId", "body", "type",
          "actionInterestId", "actionContextId", "createdAt"
        ) VALUES (
          'message-cross-pair', 'connection-other', 'user-a', '',
          'ACTION_INTEREST_CARD', 'interest-2', NULL, '2026-08-02T12:00:00Z'
        )
      `);
      const before = await fixtureFingerprint(client);

      await assert.rejects(
        client.query(await readFile(migrationPath, "utf8")),
        /ACTION_INTEREST_CARD attribution is inconsistent/,
      );
      await client.query("ROLLBACK");

      assert.deepEqual(await fixtureFingerprint(client), before);
      assert.equal(await indexExists(client, "Connection_unordered_user_pair_key"), false);
    });
  },
);

test(
  "BL-DB-04 is a no-data-rewrite migration on an already canonical fresh case",
  { skip: localDatabaseUrl ? false : "requires a localhost PostgreSQL DATABASE_URL" },
  async () => {
    await withFixtureSchema(async (client) => {
      await client.query(`
        INSERT INTO "Connection" (
          "id", "userAId", "userBId", "status", "createdAt", "updatedAt"
        ) VALUES (
          'single-connection', 'user-a', 'user-b', 'ACTIVE',
          '2026-08-01T00:00:00Z', '2026-08-02T00:00:00Z'
        );
        INSERT INTO "ActionInterest" ("id", "connectionId")
        VALUES ('single-interest', 'single-connection');
      `);
      const before = await fixtureFingerprint(client);
      await client.query(await readFile(migrationPath, "utf8"));
      assert.deepEqual(await fixtureFingerprint(client), before);
      await assertCatalogInvariants(client);
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

async function withFixtureSchema(
  run: (client: InstanceType<typeof Client>) => Promise<void>,
): Promise<void> {
  assert.ok(localDatabaseUrl);
  const client = new Client({ connectionString: localDatabaseUrl });
  const schema = `bl_db04_${process.pid}_${Math.random().toString(36).slice(2, 10)}`;
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
    CREATE TYPE "ConnectionStatus" AS ENUM ('ACTIVE', 'ENDED', 'BLOCKED');
    CREATE TYPE "FriendLinkStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED');
    CREATE TYPE "MessageType" AS ENUM (
      'TEXT', 'IMAGE', 'LOCATION', 'AVAILABILITY_CARD', 'SCHEDULE_SHARE_CARD',
      'ACTION_INTEREST_CARD', 'PLAN_REQUEST_CARD', 'PLAN_CONFIRMED_CARD', 'SYSTEM'
    );
    CREATE TYPE "ActionFirstContentType" AS ENUM ('MESSAGE', 'PLAN');
    CREATE TYPE "ActionInterestTerminalReason" AS ENUM (
      'ACTION_FULFILLED_BEFORE_CONNECT', 'ACTION_EXPIRED_BEFORE_CONNECT',
      'INTEREST_WITHDRAWN_BEFORE_CONNECT', 'SAFETY_UNAVAILABLE_BEFORE_CONNECT'
    );

    CREATE TABLE "Connection" (
      "id" TEXT PRIMARY KEY,
      "invitationId" TEXT UNIQUE,
      "originCourseId" TEXT,
      "userAId" TEXT NOT NULL,
      "userBId" TEXT NOT NULL,
      "status" "ConnectionStatus" NOT NULL DEFAULT 'ACTIVE',
      "pinnedByAAt" TIMESTAMP(3),
      "pinnedByBAt" TIMESTAMP(3),
      "contactRemarkByA" VARCHAR(64),
      "contactRemarkByB" VARCHAR(64),
      "readByAAt" TIMESTAMP(3),
      "readByBAt" TIMESTAMP(3),
      "replyLimitUnlockedAt" TIMESTAMP(3),
      "endedById" TEXT,
      "endedAt" TIMESTAMP(3),
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE "ActionInterest" (
      "id" TEXT PRIMARY KEY,
      "connectionId" TEXT REFERENCES "Connection"("id") ON DELETE SET NULL ON UPDATE CASCADE
    );
    CREATE TABLE "ActionInterestActivation" (
      "id" TEXT PRIMARY KEY,
      "interestId" TEXT NOT NULL REFERENCES "ActionInterest"("id") ON DELETE CASCADE,
      "connectedAt" TIMESTAMP(3),
      "firstContentType" "ActionFirstContentType",
      "terminalReason" "ActionInterestTerminalReason",
      "terminalAt" TIMESTAMP(3)
    );
    CREATE TABLE "ActionCoordinationContext" (
      "id" TEXT PRIMARY KEY,
      "interestId" TEXT NOT NULL UNIQUE REFERENCES "ActionInterest"("id") ON DELETE CASCADE,
      "connectionId" TEXT REFERENCES "Connection"("id") ON DELETE SET NULL ON UPDATE CASCADE
    );
    CREATE TABLE "AvailabilityShare" (
      "id" TEXT PRIMARY KEY,
      "connectionId" TEXT NOT NULL REFERENCES "Connection"("id") ON DELETE CASCADE ON UPDATE CASCADE
    );
    CREATE TABLE "PlanCommitment" (
      "id" TEXT PRIMARY KEY,
      "connectionId" TEXT NOT NULL REFERENCES "Connection"("id") ON DELETE CASCADE ON UPDATE CASCADE,
      "originActionId" TEXT,
      "originContextId" TEXT
    );
    CREATE TABLE "PlanRequest" (
      "id" TEXT PRIMARY KEY,
      "connectionId" TEXT NOT NULL REFERENCES "Connection"("id") ON DELETE CASCADE ON UPDATE CASCADE,
      "originActionId" TEXT,
      "originContextId" TEXT
    );
    CREATE TABLE "ProductFunnelEvent" (
      "id" TEXT PRIMARY KEY,
      "connectionId" TEXT REFERENCES "Connection"("id") ON DELETE SET NULL ON UPDATE CASCADE
    );
    CREATE TABLE "ContactExchangeRequest" (
      "id" TEXT PRIMARY KEY,
      "connectionId" TEXT NOT NULL REFERENCES "Connection"("id") ON DELETE CASCADE ON UPDATE CASCADE
    );
    CREATE TABLE "FriendLink" (
      "id" TEXT PRIMARY KEY,
      "connectionId" TEXT NOT NULL UNIQUE REFERENCES "Connection"("id") ON DELETE CASCADE ON UPDATE CASCADE,
      "requesterId" TEXT NOT NULL,
      "responderId" TEXT NOT NULL,
      "status" "FriendLinkStatus" NOT NULL,
      "createdAt" TIMESTAMP(3) NOT NULL,
      "updatedAt" TIMESTAMP(3) NOT NULL
    );
    CREATE TABLE "Block" (
      "id" TEXT PRIMARY KEY,
      "connectionId" TEXT REFERENCES "Connection"("id") ON DELETE SET NULL ON UPDATE CASCADE
    );
    CREATE TABLE "StudySessionProposal" (
      "id" TEXT PRIMARY KEY,
      "connectionId" TEXT REFERENCES "Connection"("id") ON DELETE CASCADE ON UPDATE CASCADE
    );

    CREATE TABLE "Message" (
      "id" TEXT PRIMARY KEY,
      "connectionId" TEXT NOT NULL REFERENCES "Connection"("id") ON DELETE CASCADE ON UPDATE CASCADE,
      "senderId" TEXT NOT NULL,
      "body" TEXT NOT NULL DEFAULT '',
      "type" "MessageType" NOT NULL DEFAULT 'TEXT',
      "imageUrl" TEXT,
      "locationLat" DOUBLE PRECISION,
      "locationLng" DOUBLE PRECISION,
      "locationName" TEXT,
      "availabilityShareId" TEXT,
      "planRequestId" TEXT,
      "actionInterestId" TEXT REFERENCES "ActionInterest"("id") ON DELETE SET NULL,
      "actionContextId" TEXT,
      "replyToId" TEXT REFERENCES "Message"("id") ON DELETE SET NULL,
      "deletedAt" TIMESTAMP(3),
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "Message_actionContextId_fkey"
        FOREIGN KEY ("actionContextId")
        REFERENCES "ActionCoordinationContext"("id") ON DELETE SET NULL
    );
    CREATE TABLE "Report" (
      "id" TEXT PRIMARY KEY,
      "connectionId" TEXT REFERENCES "Connection"("id") ON DELETE SET NULL ON UPDATE CASCADE,
      "messageId" TEXT REFERENCES "Message"("id") ON DELETE SET NULL
    );

    CREATE TABLE "ChatRealtimeEvent" (
      "sequence" BIGSERIAL PRIMARY KEY,
      "conversationKind" VARCHAR(16) NOT NULL,
      "conversationId" TEXT NOT NULL,
      "messageId" TEXT NOT NULL,
      "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE "ChatRealtimeRetention" (
      "conversationKind" VARCHAR(16) NOT NULL,
      "conversationId" TEXT NOT NULL,
      "retainedAfterSequence" BIGINT NOT NULL,
      "updatedAt" TIMESTAMP(3) NOT NULL,
      PRIMARY KEY ("conversationKind", "conversationId")
    );
    CREATE TABLE "NotificationOutbox" (
      "id" TEXT PRIMARY KEY,
      "destination" JSONB NOT NULL
    );
    CREATE TABLE "ApiIdempotencyRecord" (
      "id" TEXT PRIMARY KEY,
      "responseBody" JSONB
    );
  `);
}

async function seedRepairableFixture(
  client: InstanceType<typeof Client>,
): Promise<void> {
  await client.query(`
    INSERT INTO "Connection" (
      "id", "userAId", "userBId", "status", "pinnedByAAt", "pinnedByBAt",
      "contactRemarkByA", "contactRemarkByB", "readByAAt", "readByBAt",
      "replyLimitUnlockedAt", "createdAt", "updatedAt"
    ) VALUES (
      'connection-a', 'user-a', 'user-b', 'ACTIVE',
      '2026-08-01T00:00:00Z', '2026-08-02T00:00:00Z',
      'Alice private', NULL,
      '2026-08-01T00:00:00Z', '2026-08-02T00:00:00Z',
      '2026-08-01T00:00:00Z', '2026-08-01T00:00:00Z', '2026-08-02T00:00:00Z'
    ), (
      'connection-b', 'user-b', 'user-a', 'ACTIVE',
      '2026-08-04T00:00:00Z', '2026-08-03T00:00:00Z',
      'Bob private', 'Alice private',
      '2026-08-06T00:00:00Z', '2026-08-05T00:00:00Z',
      '2026-08-07T00:00:00Z', '2026-08-02T00:00:00Z', '2026-08-08T00:00:00Z'
    );
    UPDATE "Connection"
    SET "invitationId" = 'invitation-1', "originCourseId" = 'course-1'
    WHERE "id" = 'connection-b';

    INSERT INTO "ActionInterest" ("id", "connectionId")
    VALUES ('interest-1', 'connection-b'), ('interest-2', NULL);
    INSERT INTO "ActionCoordinationContext" ("id", "interestId", "connectionId")
    VALUES
      ('context-1', 'interest-1', 'connection-b'),
      ('context-2', 'interest-2', 'connection-b');
    INSERT INTO "ActionInterestActivation" (
      "id", "interestId", "connectedAt", "firstContentType"
    ) VALUES (
      'activation-valid', 'interest-1', '2026-08-03T00:00:00Z', 'MESSAGE'
    );
    INSERT INTO "AvailabilityShare" VALUES ('availability-1', 'connection-b');
    INSERT INTO "PlanCommitment" VALUES ('commitment-1', 'connection-b', NULL, NULL);
    INSERT INTO "PlanRequest" VALUES ('request-1', 'connection-b', NULL, NULL);
    INSERT INTO "ProductFunnelEvent" VALUES ('funnel-1', 'connection-b');
    INSERT INTO "ContactExchangeRequest" VALUES ('contact-1', 'connection-b');
    INSERT INTO "Block" VALUES ('block-1', 'connection-b');
    INSERT INTO "StudySessionProposal" VALUES ('study-1', 'connection-b');

    INSERT INTO "FriendLink" VALUES (
      'friend-a', 'connection-a', 'user-a', 'user-b', 'ACCEPTED',
      '2026-08-02T00:00:00Z', '2026-08-04T00:00:00Z'
    ), (
      'friend-b', 'connection-b', 'user-a', 'user-b', 'ACCEPTED',
      '2026-08-03T00:00:00Z', '2026-08-05T00:00:00Z'
    );

    INSERT INTO "Message" (
      "id", "connectionId", "senderId", "body", "type",
      "actionInterestId", "actionContextId", "createdAt"
    ) VALUES (
      'message-card-a', 'connection-a', 'user-a', '', 'ACTION_INTEREST_CARD',
      NULL, 'context-1', '2026-08-03T00:00:00Z'
    ), (
      'message-card-b', 'connection-b', 'user-a', 'redundant', 'ACTION_INTEREST_CARD',
      'interest-1', NULL, '2026-08-04T00:00:00Z'
    ), (
      'message-context-only', 'connection-b', 'user-b', '', 'ACTION_INTEREST_CARD',
      NULL, 'context-2', '2026-08-03T12:00:00Z'
    );
    INSERT INTO "Message" (
      "id", "connectionId", "senderId", "body", "type", "replyToId", "createdAt"
    ) VALUES (
      'message-reply', 'connection-b', 'user-b', 'reply', 'TEXT',
      'message-card-b', '2026-08-05T00:00:00Z'
    );
    INSERT INTO "Report" VALUES ('report-1', 'connection-b', 'message-card-b');

    INSERT INTO "ChatRealtimeEvent" (
      "conversationKind", "conversationId", "messageId", "occurredAt"
    ) VALUES
      ('DIRECT', 'connection-b', 'message-card-b', '2026-08-05T00:00:00Z'),
      ('COURSE', 'connection-b', 'course-message', '2026-08-05T00:00:00Z');
    INSERT INTO "ChatRealtimeRetention" VALUES
      ('DIRECT', 'connection-a', 10, '2026-08-08T00:00:00Z'),
      ('DIRECT', 'connection-b', 20, '2026-08-09T00:00:00Z'),
      ('COURSE', 'connection-b', 30, '2026-08-10T00:00:00Z');

    INSERT INTO "NotificationOutbox" VALUES
      ('outbox-top', '{"type":"PLAN","connectionId":"connection-b"}'),
      ('outbox-nested', '{"type":"OTHER","nested":{"connectionId":"connection-b"}}');
    INSERT INTO "ApiIdempotencyRecord" VALUES
      ('receipt-top', '{"connectionId":"connection-b","created":true}'),
      ('receipt-nested', '{"nested":{"connectionId":"connection-b"}}');
  `);
}

async function assertCatalogInvariants(
  client: InstanceType<typeof Client>,
): Promise<void> {
  for (const index of [
    "Connection_unordered_user_pair_key",
    "Message_actionInterest_source_card_key",
    "Message_actionContext_source_card_key",
  ]) {
    assert.equal(await indexExists(client, index), true, index);
  }
  assert.equal(
    await triggerExists(
      client,
      "Message_action_interest_card_context_attribution",
    ),
    true,
  );
  for (const constraint of [
    "ActionInterest_directTransitionGeneration_nonnegative_check",
    "ActionInterestActivation_connected_content_check",
    "ActionInterestActivation_connected_terminal_exclusive_check",
    "ActionInterestActivation_terminal_pair_check",
  ]) {
    assert.equal(await constraintExists(client, constraint), true, constraint);
  }
}

async function assertHardInvariantsRejectInvalidWrites(
  client: InstanceType<typeof Client>,
): Promise<void> {
  await assert.rejects(
    client.query(`
      INSERT INTO "Connection" (
        "id", "userAId", "userBId", "status", "createdAt", "updatedAt"
      ) VALUES (
        'reverse-duplicate', 'user-b', 'user-a', 'ACTIVE', NOW(), NOW()
      )
    `),
    (error: unknown) => postgresErrorCode(error) === "23505",
  );

  for (const [id, columns] of [
    ["bad-connected", "'2026-08-12T00:00:00Z', NULL, NULL, NULL"],
    ["bad-exclusive", "'2026-08-12T00:00:00Z', 'PLAN', 'SAFETY_UNAVAILABLE_BEFORE_CONNECT', '2026-08-12T00:00:00Z'"],
    ["bad-terminal", "NULL, NULL, 'INTEREST_WITHDRAWN_BEFORE_CONNECT', NULL"],
  ] as const) {
    await assert.rejects(
      client.query(`
        INSERT INTO "ActionInterestActivation" (
          "id", "interestId", "connectedAt", "firstContentType", "terminalReason", "terminalAt"
        ) VALUES ('${id}', 'interest-1', ${columns})
      `),
      (error: unknown) => postgresErrorCode(error) === "23514",
    );
  }

  await assert.rejects(
    client.query(`
      INSERT INTO "Message" (
        "id", "connectionId", "senderId", "body", "type",
        "actionInterestId", "actionContextId", "createdAt"
      ) VALUES (
        'duplicate-source', 'connection-a', 'user-a', '', 'ACTION_INTEREST_CARD',
        'interest-1', 'context-1', NOW()
      )
    `),
    (error: unknown) => postgresErrorCode(error) === "23505",
  );

  await client.query(`
    INSERT INTO "ActionInterest" ("id", "connectionId")
    VALUES ('check-interest', 'connection-a');
    INSERT INTO "ActionCoordinationContext" ("id", "interestId", "connectionId")
    VALUES ('check-context', 'check-interest', 'connection-a')
  `);
  await client.query("BEGIN");
  await client.query(`
    INSERT INTO "Message" (
      "id", "connectionId", "senderId", "body", "type",
      "actionInterestId", "actionContextId", "createdAt"
    ) VALUES (
      'context-only-invalid', 'connection-a', 'user-a', '',
      'ACTION_INTEREST_CARD', NULL, 'check-context', NOW()
    )
  `);
  await assert.rejects(
    client.query("COMMIT"),
    (error: unknown) => postgresErrorCode(error) === "23514",
  );
  await client.query("ROLLBACK");

  // Historical attribution may be cleared by ON DELETE SET NULL. The CHECK
  // therefore forbids only context-only cards, not a fully unattributed row.
  await client.query(`
    INSERT INTO "Message" (
      "id", "connectionId", "senderId", "body", "type",
      "actionInterestId", "actionContextId", "createdAt"
    ) VALUES (
      'historical-unattributed-card', 'connection-a', 'user-a', '',
      'ACTION_INTEREST_CARD', NULL, NULL, NOW()
    )
  `);

  await client.query(`DELETE FROM "ActionInterest" WHERE "id" = 'interest-2'`);
  const preservedAfterInterestDelete = await client.query(`
    SELECT "type", "actionInterestId", "actionContextId"
    FROM "Message"
    WHERE "id" = 'message-context-only'
  `);
  assert.deepEqual(preservedAfterInterestDelete.rows, [
    {
      type: "ACTION_INTEREST_CARD",
      actionInterestId: null,
      actionContextId: null,
    },
  ]);

  await assert.rejects(
    client.query(`
      UPDATE "ActionInterest"
      SET "directTransitionGeneration" = -1
      WHERE "id" = 'interest-1'
    `),
    (error: unknown) => postgresErrorCode(error) === "23514",
  );
}

async function fixtureFingerprint(
  client: InstanceType<typeof Client>,
): Promise<Record<string, unknown>> {
  const result = await client.query(`
    SELECT jsonb_build_object(
      'connections', (SELECT jsonb_agg(row_to_json(row) ORDER BY row."id") FROM (SELECT * FROM "Connection") row),
      'messages', (SELECT jsonb_agg(row_to_json(row) ORDER BY row."id") FROM (SELECT * FROM "Message") row),
      'interests', (SELECT jsonb_agg(row_to_json(row) ORDER BY row."id") FROM (SELECT "id", "connectionId" FROM "ActionInterest") row),
      'activations', (SELECT jsonb_agg(row_to_json(row) ORDER BY row."id") FROM (SELECT * FROM "ActionInterestActivation") row),
      'friends', (SELECT jsonb_agg(row_to_json(row) ORDER BY row."id") FROM (SELECT * FROM "FriendLink") row)
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
      JOIN pg_namespace namespace_row
        ON namespace_row.oid = index_row.relnamespace
      WHERE namespace_row.nspname = current_schema()
        AND index_row.relkind = 'i'
        AND index_row.relname = $1
    ) AS present
  `, [indexName]);
  return result.rows[0]?.present ?? false;
}

async function constraintExists(
  client: InstanceType<typeof Client>,
  constraintName: string,
): Promise<boolean> {
  const result = await client.query<{ present: boolean }>(`
    SELECT EXISTS (
      SELECT 1
      FROM pg_constraint constraint_row
      WHERE constraint_row.connamespace = current_schema()::regnamespace
        AND constraint_row.conname = $1
    ) AS present
  `, [constraintName]);
  return result.rows[0]?.present ?? false;
}

async function columnExists(
  client: InstanceType<typeof Client>,
  tableName: string,
  columnName: string,
): Promise<boolean> {
  const result = await client.query<{ present: boolean }>(`
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = current_schema()
        AND table_name = $1
        AND column_name = $2
    ) AS present
  `, [tableName, columnName]);
  return result.rows[0]?.present ?? false;
}

async function triggerExists(
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
