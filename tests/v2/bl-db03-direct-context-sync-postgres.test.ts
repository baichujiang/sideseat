import assert from "node:assert/strict";
import Module from "node:module";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { PrismaClient } from "@prisma/client";
import pg from "pg";

import {
  terminalizeConnectionAndDirectV1Contexts,
  terminalizeConnectionsAndDirectV1Contexts,
} from "../../lib/v2/direct-v1-context-sync";

type CommonJsModuleResolver = typeof Module & {
  _resolveFilename: (
    request: string,
    parent: unknown,
    isMain: boolean,
    options?: unknown,
  ) => string;
};

const commonJsModule = Module as CommonJsModuleResolver;
const resolveFilename = commonJsModule._resolveFilename;
const serverOnlyStub = fileURLToPath(
  new URL("./server-only-test-stub.cjs", import.meta.url),
);
commonJsModule._resolveFilename = function resolveForServerContractTest(
  request,
  parent,
  isMain,
  options,
) {
  if (request === "server-only") return serverOnlyStub;
  return resolveFilename.call(this, request, parent, isMain, options);
};

async function installConnectionPeerBlock(
  ...args: Parameters<
    typeof import("../../lib/api/v1/connection-block-transaction").installConnectionPeerBlock
  >
) {
  const blockModule = await import("../../lib/api/v1/connection-block-transaction");
  return blockModule.installConnectionPeerBlock(...args);
}

const { Client } = pg;
const localDatabaseUrl = localPostgresUrl(process.env.DATABASE_URL);
const endedAt = new Date("2026-08-30T20:15:30.000Z");

test("BL-DB-03 DIRECT Context sync refuses non-local database targets", () => {
  assert.equal(
    localPostgresUrl("postgresql://user:password@example.invalid/db"),
    undefined,
  );
  assert.equal(
    localPostgresUrl(
      "postgresql://user:password@127.0.0.1:5433/db?host=prod.example",
    ),
    undefined,
  );
  assert.equal(
    localPostgresUrl(
      "postgresql://user:password@127.0.0.1:5433/db?schema=public",
    ),
    "postgresql://user:password@127.0.0.1:5433/db?schema=public",
  );
});

test(
  "ACTIVE -> ENDED projects only OPEN DIRECT compatibility Contexts with one timestamp and participant actor",
  { skip: localDatabaseUrl ? false : "requires localhost PostgreSQL" },
  async () => {
    await withFixtureSchema(1, async ({ admin, prisma: [db] }) => {
      await seedConnection(admin, "connection-end", "user-a", "user-b");
      await seedContext(admin, {
        suffix: "direct",
        connectionId: "connection-end",
        policy: "DIRECT_CONVERSATION_V1",
      });
      await seedContext(admin, {
        suffix: "legacy-null",
        connectionId: "connection-end",
        policy: null,
      });
      await seedContext(admin, {
        suffix: "partial-policy",
        connectionId: "connection-end",
        policy: null,
      });
      await admin.query(`
        UPDATE "ClassmatePost"
        SET "policySchemaVersion" = 1
        WHERE "id" = 'action-partial-policy'
      `);
      await seedContext(admin, {
        suffix: "creator-gated",
        connectionId: "connection-end",
        policy: "CREATOR_GATED_V2",
        activationId: "activation-creator-gated",
      });
      await seedContext(admin, {
        suffix: "already-ended",
        connectionId: "connection-end",
        policy: "DIRECT_CONVERSATION_V1",
        state: "ENDED",
        previousEndedAt: new Date("2026-08-29T10:00:00.000Z"),
        previousEndedById: "user-b",
        previousEndReason: "PLAN_CONFIRMED",
      });
      await seedSentinels(admin);
      const terminalBefore = (await contextStates(admin)).find(
        ({ id }) => id === "context-already-ended",
      );
      assert.ok(terminalBefore);

      const result = await db.$transaction((tx) =>
        terminalizeConnectionAndDirectV1Contexts(tx, {
          connectionId: "connection-end",
          targetStatus: "ENDED",
          connectionEndedById: "user-a",
          endedAt,
          requiredParticipantId: "user-a",
        }),
      );
      assert.equal(result.kind, "transitioned");
      assert.deepEqual(result.endedContextIds, [
        "context-direct",
        "context-legacy-null",
      ]);

      assert.deepEqual(await connectionState(admin, "connection-end"), {
        status: "ENDED",
        endedById: "user-a",
        endedAt: endedAt.toISOString(),
      });
      assert.deepEqual(await contextStates(admin), [
        terminalBefore,
        {
          id: "context-creator-gated",
          state: "OPEN",
          endedById: null,
          endReason: null,
          endedAt: null,
        },
        {
          id: "context-direct",
          state: "ENDED",
          endedById: "user-a",
          endReason: "USER_ENDED",
          endedAt: endedAt.toISOString(),
        },
        {
          id: "context-legacy-null",
          state: "ENDED",
          endedById: "user-a",
          endReason: "USER_ENDED",
          endedAt: endedAt.toISOString(),
        },
        {
          id: "context-partial-policy",
          state: "OPEN",
          endedById: null,
          endReason: null,
          endedAt: null,
        },
      ]);
      await assertSentinels(admin);

      const repeat = await db.$transaction((tx) =>
        terminalizeConnectionAndDirectV1Contexts(tx, {
          connectionId: "connection-end",
          targetStatus: "BLOCKED",
          connectionEndedById: "user-b",
          endedAt: new Date("2026-08-31T00:00:00.000Z"),
          requiredParticipantId: "user-b",
        }),
      );
      assert.equal(repeat.kind, "already_terminal");
      assert.deepEqual(await connectionState(admin, "connection-end"), {
        status: "ENDED",
        endedById: "user-a",
        endedAt: endedAt.toISOString(),
      });
      await assertSentinels(admin);
    });
  },
);

test(
  "ACTIVE -> BLOCKED removes the actor from DIRECT Context history and leaves creator-gated Context open",
  { skip: localDatabaseUrl ? false : "requires localhost PostgreSQL" },
  async () => {
    await withFixtureSchema(1, async ({ admin, prisma: [db] }) => {
      await seedConnection(admin, "connection-block", "blocker", "blocked");
      await seedContext(admin, {
        suffix: "safety-direct",
        connectionId: "connection-block",
        policy: "DIRECT_CONVERSATION_V1",
      });
      await seedContext(admin, {
        suffix: "safety-gated",
        connectionId: "connection-block",
        policy: "CREATOR_GATED_V2",
        activationId: "activation-safety-gated",
      });

      const result = await db.$transaction((tx) =>
        terminalizeConnectionAndDirectV1Contexts(tx, {
          connectionId: "connection-block",
          targetStatus: "BLOCKED",
          connectionEndedById: "blocker",
          endedAt,
          requiredParticipantId: "blocker",
          requiredCounterpartyId: "blocked",
        }),
      );
      assert.equal(result.kind, "transitioned");
      assert.deepEqual(await connectionState(admin, "connection-block"), {
        status: "BLOCKED",
        endedById: "blocker",
        endedAt: endedAt.toISOString(),
      });
      const states = await contextStates(admin);
      assert.deepEqual(states, [
        {
          id: "context-safety-direct",
          state: "ENDED",
          endedById: null,
          endReason: "SAFETY_UNAVAILABLE",
          endedAt: endedAt.toISOString(),
        },
        {
          id: "context-safety-gated",
          state: "OPEN",
          endedById: null,
          endReason: null,
          endedAt: null,
        },
      ]);
    });
  },
);

test(
  "authorization mismatch changes neither Connection nor Context",
  { skip: localDatabaseUrl ? false : "requires localhost PostgreSQL" },
  async () => {
    await withFixtureSchema(1, async ({ admin, prisma: [db] }) => {
      await seedConnection(admin, "connection-auth", "user-a", "user-b");
      await seedContext(admin, {
        suffix: "auth",
        connectionId: "connection-auth",
        policy: "DIRECT_CONVERSATION_V1",
      });

      const result = await db.$transaction((tx) =>
        terminalizeConnectionAndDirectV1Contexts(tx, {
          connectionId: "connection-auth",
          targetStatus: "BLOCKED",
          connectionEndedById: "user-a",
          endedAt,
          requiredParticipantId: "user-a",
          requiredCounterpartyId: "not-user-b",
        }),
      );
      assert.equal(result.kind, "not_authorized");
      assert.deepEqual(await connectionState(admin, "connection-auth"), {
        status: "ACTIVE",
        endedById: null,
        endedAt: null,
      });
      assert.equal((await contextStates(admin))[0]?.state, "OPEN");
    });
  },
);

test(
  "admin-style batch takes all pair locks first and converges every affected DIRECT Context",
  { skip: localDatabaseUrl ? false : "requires localhost PostgreSQL" },
  async () => {
    await withFixtureSchema(1, async ({ admin, prisma: [db] }) => {
      await seedConnection(admin, "connection-z", "reported", "user-z");
      await seedConnection(admin, "connection-a", "user-a", "reported");
      await seedContext(admin, {
        suffix: "z",
        connectionId: "connection-z",
        policy: "DIRECT_CONVERSATION_V1",
      });
      await seedContext(admin, {
        suffix: "a",
        connectionId: "connection-a",
        policy: "DIRECT_CONVERSATION_V1",
      });

      const result = await db.$transaction((tx) =>
        terminalizeConnectionsAndDirectV1Contexts(tx, [
          {
            connectionId: "connection-z",
            targetStatus: "BLOCKED",
            connectionEndedById: null,
            endedAt,
            requiredParticipantId: "reported",
          },
          {
            connectionId: "connection-a",
            targetStatus: "BLOCKED",
            connectionEndedById: null,
            endedAt,
            requiredParticipantId: "reported",
          },
        ]),
      );
      assert.deepEqual(
        result.map(({ connectionId, kind }) => ({ connectionId, kind })),
        [
          { connectionId: "connection-a", kind: "transitioned" },
          { connectionId: "connection-z", kind: "transitioned" },
        ],
      );
      assert.ok(
        (await contextStates(admin)).every(
          (context) =>
            context.state === "ENDED" &&
            context.endReason === "SAFETY_UNAVAILABLE" &&
            context.endedById === null &&
            context.endedAt === endedAt.toISOString(),
        ),
      );
    });
  },
);

test(
  "Context failure rolls the Connection transition back atomically",
  { skip: localDatabaseUrl ? false : "requires localhost PostgreSQL" },
  async () => {
    await withFixtureSchema(1, async ({ admin, prisma: [db] }) => {
      await seedConnection(admin, "connection-rollback", "user-a", "user-b");
      await seedContext(admin, {
        suffix: "rollback",
        connectionId: "connection-rollback",
        policy: "DIRECT_CONVERSATION_V1",
      });
      await admin.query(`
        CREATE FUNCTION reject_context_end() RETURNS trigger AS $$
        BEGIN
          RAISE EXCEPTION 'injected Context failure';
        END;
        $$ LANGUAGE plpgsql;
        CREATE TRIGGER reject_context_end
          BEFORE UPDATE ON "ActionCoordinationContext"
          FOR EACH ROW EXECUTE FUNCTION reject_context_end();
      `);

      await assert.rejects(
        db.$transaction((tx) =>
          terminalizeConnectionAndDirectV1Contexts(tx, {
            connectionId: "connection-rollback",
            targetStatus: "ENDED",
            connectionEndedById: "user-a",
            endedAt,
            requiredParticipantId: "user-a",
          }),
        ),
        /injected Context failure/,
      );
      assert.deepEqual(await connectionState(admin, "connection-rollback"), {
        status: "ACTIVE",
        endedById: null,
        endedAt: null,
      });
      assert.equal((await contextStates(admin))[0]?.state, "OPEN");
    });
  },
);

test(
  "concurrent end/block attempts have one ACTIVE winner and never rewrite its terminal Context",
  { skip: localDatabaseUrl ? false : "requires localhost PostgreSQL" },
  async () => {
    await withFixtureSchema(2, async ({ admin, prisma: [first, second] }) => {
      await seedConnection(admin, "connection-race", "user-a", "user-b");
      await seedContext(admin, {
        suffix: "race",
        connectionId: "connection-race",
        policy: "DIRECT_CONVERSATION_V1",
      });

      const [endResult, blockResult] = await Promise.all([
        first.$transaction((tx) =>
          terminalizeConnectionAndDirectV1Contexts(tx, {
            connectionId: "connection-race",
            targetStatus: "ENDED",
            connectionEndedById: "user-a",
            endedAt,
            requiredParticipantId: "user-a",
          }),
        ),
        second.$transaction((tx) =>
          terminalizeConnectionAndDirectV1Contexts(tx, {
            connectionId: "connection-race",
            targetStatus: "BLOCKED",
            connectionEndedById: "user-b",
            endedAt: new Date("2026-08-30T20:16:00.000Z"),
            requiredParticipantId: "user-b",
            requiredCounterpartyId: "user-a",
          }),
        ),
      ]);
      assert.deepEqual(
        [endResult.kind, blockResult.kind].sort(),
        ["already_terminal", "transitioned"],
      );

      const connection = await connectionState(admin, "connection-race");
      const context = (await contextStates(admin))[0];
      assert.equal(context.state, "ENDED");
      if (connection.status === "BLOCKED") {
        assert.equal(context.endReason, "SAFETY_UNAVAILABLE");
        assert.equal(context.endedById, null);
      } else {
        assert.equal(connection.status, "ENDED");
        assert.equal(context.endReason, "USER_ENDED");
        assert.equal(context.endedById, "user-a");
      }
      assert.equal(context.endedAt, connection.endedAt);
    });
  },
);

test(
  "native Block installs its pair-wide barrier when ordinary End commits first",
  { skip: localDatabaseUrl ? false : "requires localhost PostgreSQL" },
  async () => {
    await withFixtureSchema(1, async ({ admin, prisma: [db] }) => {
      await seedConnection(admin, "connection-end-before-block", "user-a", "user-b");
      await seedContext(admin, {
        suffix: "end-before-block",
        connectionId: "connection-end-before-block",
        policy: "DIRECT_CONVERSATION_V1",
      });

      const endResult = await db.$transaction((tx) =>
        terminalizeConnectionAndDirectV1Contexts(tx, {
          connectionId: "connection-end-before-block",
          targetStatus: "ENDED",
          connectionEndedById: "user-a",
          endedAt,
          requiredParticipantId: "user-a",
        }),
      );
      assert.equal(endResult.kind, "transitioned");

      const blockAt = new Date("2026-08-30T20:16:00.000Z");
      const blockResult = await db.$transaction((tx) =>
        installConnectionPeerBlock(tx, {
          userId: "user-b",
          connectionId: "connection-end-before-block",
          blockedId: "user-a",
          reason: "  safety reason  ",
          endedAt: blockAt,
        }),
      );
      assert.deepEqual(blockResult, { kind: "blocked", blockedId: "user-a" });
      assert.deepEqual(await connectionState(admin, "connection-end-before-block"), {
        status: "ENDED",
        endedById: "user-a",
        endedAt: endedAt.toISOString(),
      });
      assert.deepEqual(await contextStates(admin), [
        {
          id: "context-end-before-block",
          state: "ENDED",
          endedById: "user-a",
          endReason: "USER_ENDED",
          endedAt: endedAt.toISOString(),
        },
      ]);
      assert.deepEqual(await blockStates(admin), [
        {
          blockerId: "user-b",
          blockedId: "user-a",
          connectionId: "connection-end-before-block",
          reason: "safety reason",
        },
      ]);

      const repeated = await db.$transaction((tx) =>
        installConnectionPeerBlock(tx, {
          userId: "user-b",
          connectionId: "connection-end-before-block",
          blockedId: "user-a",
          reason: "updated",
          endedAt: new Date("2026-08-30T20:17:00.000Z"),
        }),
      );
      assert.equal(repeated.kind, "blocked");
      assert.deepEqual(await blockStates(admin), [
        {
          blockerId: "user-b",
          blockedId: "user-a",
          connectionId: "connection-end-before-block",
          reason: "updated",
        },
      ]);
    });
  },
);

test(
  "native Block commits first and a later ordinary End cannot downgrade safety state",
  { skip: localDatabaseUrl ? false : "requires localhost PostgreSQL" },
  async () => {
    await withFixtureSchema(1, async ({ admin, prisma: [db] }) => {
      await seedConnection(admin, "connection-block-before-end", "user-a", "user-b");
      await seedContext(admin, {
        suffix: "block-before-end",
        connectionId: "connection-block-before-end",
        policy: "DIRECT_CONVERSATION_V1",
      });

      const blockAt = new Date("2026-08-30T20:14:00.000Z");
      const blockResult = await db.$transaction((tx) =>
        installConnectionPeerBlock(tx, {
          userId: "user-a",
          connectionId: "connection-block-before-end",
          endedAt: blockAt,
        }),
      );
      assert.deepEqual(blockResult, { kind: "blocked", blockedId: "user-b" });

      const endResult = await db.$transaction((tx) =>
        terminalizeConnectionAndDirectV1Contexts(tx, {
          connectionId: "connection-block-before-end",
          targetStatus: "ENDED",
          connectionEndedById: "user-b",
          endedAt,
          requiredParticipantId: "user-b",
        }),
      );
      assert.equal(endResult.kind, "already_terminal");
      const blockedConnection = await connectionState(
        admin,
        "connection-block-before-end",
      );
      assert.deepEqual({ ...blockedConnection, endedAt: true }, {
        status: "BLOCKED",
        endedById: "user-a",
        endedAt: true,
      });
      assert.ok(Number.isFinite(Date.parse(blockedConnection.endedAt!)));
      const contexts = await contextStates(admin);
      assert.deepEqual(contexts.map((context) => ({ ...context, endedAt: true })), [
        {
          id: "context-block-before-end",
          state: "ENDED",
          endedById: null,
          endReason: "SAFETY_UNAVAILABLE",
          endedAt: true,
        },
      ]);
      assert.equal(contexts[0]?.endedAt, blockedConnection.endedAt);
      assert.deepEqual(await blockStates(admin), [
        {
          blockerId: "user-a",
          blockedId: "user-b",
          connectionId: "connection-block-before-end",
          reason: null,
        },
      ]);
    });
  },
);

test(
  "native Block keeps participant and exact-peer authorization on terminal Connections",
  { skip: localDatabaseUrl ? false : "requires localhost PostgreSQL" },
  async () => {
    await withFixtureSchema(1, async ({ admin, prisma: [db] }) => {
      await seedConnection(admin, "connection-terminal-auth", "user-a", "user-b");
      await admin.query(`
        UPDATE "Connection"
        SET "status" = 'ENDED', "endedAt" = CURRENT_TIMESTAMP
        WHERE "id" = 'connection-terminal-auth'
      `);

      const outsider = await db.$transaction((tx) =>
        installConnectionPeerBlock(tx, {
          userId: "outsider",
          connectionId: "connection-terminal-auth",
          blockedId: "user-a",
          endedAt,
        }),
      );
      assert.equal(outsider.kind, "not_found");

      const wrongPeer = await db.$transaction((tx) =>
        installConnectionPeerBlock(tx, {
          userId: "user-a",
          connectionId: "connection-terminal-auth",
          blockedId: "outsider",
          endedAt,
        }),
      );
      assert.equal(wrongPeer.kind, "invalid_counterparty");
      assert.deepEqual(await blockStates(admin), []);
    });
  },
);

test(
  "native Block upsert failure rolls Connection and Context safety projection back atomically",
  { skip: localDatabaseUrl ? false : "requires localhost PostgreSQL" },
  async () => {
    await withFixtureSchema(1, async ({ admin, prisma: [db] }) => {
      await seedConnection(admin, "connection-block-rollback", "user-a", "user-b");
      await seedContext(admin, {
        suffix: "block-upsert-rollback",
        connectionId: "connection-block-rollback",
        policy: "DIRECT_CONVERSATION_V1",
      });
      await admin.query(`
        CREATE FUNCTION reject_block_insert() RETURNS trigger AS $$
        BEGIN
          RAISE EXCEPTION 'injected Block failure';
        END;
        $$ LANGUAGE plpgsql;
        CREATE TRIGGER reject_block_insert
          BEFORE INSERT ON "Block"
          FOR EACH ROW EXECUTE FUNCTION reject_block_insert();
      `);

      await assert.rejects(
        db.$transaction((tx) =>
          installConnectionPeerBlock(tx, {
            userId: "user-a",
            connectionId: "connection-block-rollback",
            blockedId: "user-b",
            endedAt,
          }),
        ),
        /injected Block failure/,
      );
      assert.deepEqual(await connectionState(admin, "connection-block-rollback"), {
        status: "ACTIVE",
        endedById: null,
        endedAt: null,
      });
      assert.deepEqual(await contextStates(admin), [
        {
          id: "context-block-upsert-rollback",
          state: "OPEN",
          endedById: null,
          endReason: null,
          endedAt: null,
        },
      ]);
      assert.deepEqual(await blockStates(admin), []);
    });
  },
);

test(
  "Context-first compatibility work cannot deadlock the terminal projection on Connection",
  { skip: localDatabaseUrl ? false : "requires localhost PostgreSQL" },
  async () => {
    await withFixtureSchema(2, async ({ admin, prisma: [first, second] }) => {
      await seedConnection(admin, "connection-lock-order", "user-a", "user-b");
      await seedContext(admin, {
        suffix: "lock-order",
        connectionId: "connection-lock-order",
        policy: "DIRECT_CONVERSATION_V1",
      });

      const contextLocked = deferred<void>();
      const continueToConnection = deferred<void>();
      const contextFirst = first.$transaction(
        async (tx) => {
          await tx.$queryRaw<Array<{ id: string }>>`
            SELECT "id"
            FROM "ActionCoordinationContext"
            WHERE "id" = 'context-lock-order'
            FOR UPDATE
          `;
          contextLocked.resolve();
          await continueToConnection.promise;
          await tx.$queryRaw<Array<{ id: string }>>`
            SELECT "id"
            FROM "Connection"
            WHERE "id" = 'connection-lock-order'
            FOR UPDATE
          `;
        },
        { maxWait: 5_000, timeout: 10_000 },
      );
      await contextLocked.promise;

      const terminalBackend = deferred<number>();
      const terminal = second.$transaction(
        async (tx) => {
          const rows = await tx.$queryRaw<Array<{ pid: number }>>`
            SELECT pg_backend_pid()::int AS "pid"
          `;
          terminalBackend.resolve(rows[0]!.pid);
          return terminalizeConnectionAndDirectV1Contexts(tx, {
            connectionId: "connection-lock-order",
            targetStatus: "ENDED",
            connectionEndedById: "user-a",
            endedAt,
            requiredParticipantId: "user-a",
          });
        },
        { maxWait: 5_000, timeout: 10_000 },
      );

      try {
        await waitForBackendLock(admin, await terminalBackend.promise);
      } finally {
        // With the required order, the terminal path is waiting on Context and
        // does not yet hold Connection, so this transaction can finish first.
        continueToConnection.resolve();
      }
      const [, terminalResult] = await withTimeout(
        Promise.all([contextFirst, terminal]),
        5_000,
      );
      assert.equal(terminalResult.kind, "transitioned");
      assert.deepEqual(await connectionState(admin, "connection-lock-order"), {
        status: "ENDED",
        endedById: "user-a",
        endedAt: endedAt.toISOString(),
      });
      assert.equal((await contextStates(admin))[0]?.state, "ENDED");
    });
  },
);

function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
} {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

async function waitForBackendLock(
  client: InstanceType<typeof Client>,
  pid: number,
): Promise<void> {
  const deadline = Date.now() + 3_000;
  while (Date.now() < deadline) {
    const result = await client.query<{ waitEventType: string | null }>(
      `
        SELECT wait_event_type AS "waitEventType"
        FROM pg_stat_activity
        WHERE pid = $1
      `,
      [pid],
    );
    if (result.rows[0]?.waitEventType === "Lock") return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("Terminal projection did not reach its expected row lock.");
}

async function withTimeout<T>(promise: Promise<T>, milliseconds: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("Concurrent lock-order test timed out.")),
      milliseconds,
    );
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (cause: unknown) => {
        clearTimeout(timer);
        reject(cause);
      },
    );
  });
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
  const overrides = new Set([
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
      overrides.has(key.toLowerCase()),
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
  const schema = `bl_db03_sync_${process.pid}_${Math.random().toString(36).slice(2, 10)}`;
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
    CREATE TYPE "ConnectionStatus" AS ENUM ('ACTIVE', 'ENDED', 'BLOCKED');
    CREATE TYPE "ActionCoordinationPolicy" AS ENUM (
      'DIRECT_CONVERSATION_V1', 'CREATOR_GATED_V2'
    );
    CREATE TYPE "ActionCoordinationState" AS ENUM (
      'WAITING', 'INITIATING', 'OPEN', 'ENDED', 'UNAVAILABLE'
    );
    CREATE TYPE "ActionCoordinationEndReason" AS ENUM (
      'USER_ENDED', 'PLAN_CONFIRMED', 'SOURCE_FULFILLED',
      'SOURCE_REMOVED', 'SAFETY_UNAVAILABLE'
    );

    CREATE TABLE "Connection" (
      "id" TEXT PRIMARY KEY,
      "userAId" TEXT NOT NULL,
      "userBId" TEXT NOT NULL,
      "status" "ConnectionStatus" NOT NULL DEFAULT 'ACTIVE',
      "endedById" TEXT,
      "endedAt" TIMESTAMP(3),
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE "ClassmatePost" (
      "id" TEXT PRIMARY KEY,
      "userId" TEXT NOT NULL DEFAULT 'fixture-action-author',
      "coordinationPolicy" "ActionCoordinationPolicy",
      "policySchemaVersion" INTEGER,
      "policyParametersSnapshot" JSONB,
      "experimentKeySnapshot" TEXT,
      "experimentVariantSnapshot" TEXT,
      "clientCapabilitySnapshot" JSONB,
      "policySnapshottedAt" TIMESTAMP(3)
    );
    CREATE TABLE "ActionInterest" (
      "id" TEXT PRIMARY KEY,
      "classmatePostId" TEXT NOT NULL,
      "userId" TEXT NOT NULL DEFAULT 'fixture-action-responder',
      "connectionId" TEXT
    );
    CREATE TABLE "ActionCoordinationContext" (
      "id" TEXT PRIMARY KEY,
      "interestId" TEXT NOT NULL UNIQUE,
      "currentActivationId" TEXT,
      "state" "ActionCoordinationState" NOT NULL,
      "connectionId" TEXT,
      "endedAt" TIMESTAMP(3),
      "endedById" TEXT,
      "endReason" "ActionCoordinationEndReason",
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE "Block" (
      "id" TEXT PRIMARY KEY,
      "blockerId" TEXT NOT NULL,
      "blockedId" TEXT NOT NULL,
      "connectionId" TEXT,
      "reason" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "Block_blockerId_blockedId_key" UNIQUE ("blockerId", "blockedId")
    );

    -- ADR-BL-001 scans the pair-wide stable Plan owner after Connection
    -- convergence. This focused fixture has no Plans, but retains the empty
    -- ownership surface so native Block exercises the production command.
    CREATE TABLE "PlanCommitment" (
      "id" TEXT PRIMARY KEY,
      "connectionId" TEXT NOT NULL,
      "participantAId" TEXT NOT NULL,
      "participantBId" TEXT NOT NULL,
      "status" TEXT NOT NULL,
      "currentAcceptedRevisionId" TEXT,
      "currentPendingRevisionId" TEXT,
      "safetyRestrictedAt" TIMESTAMP(3),
      "safetyBlockId" TEXT
    );

    CREATE TABLE "Message" ("id" TEXT PRIMARY KEY, "body" TEXT NOT NULL);
    CREATE TABLE "PlanRequest" ("id" TEXT PRIMARY KEY, "status" TEXT NOT NULL);
    CREATE TABLE "ProductFunnelEvent" ("id" TEXT PRIMARY KEY, "name" TEXT NOT NULL);
    CREATE TABLE "NotificationOutbox" ("id" TEXT PRIMARY KEY, "kind" TEXT NOT NULL);
  `);
}

async function seedConnection(
  client: InstanceType<typeof Client>,
  id: string,
  userAId: string,
  userBId: string,
): Promise<void> {
  await client.query(
    `INSERT INTO "Connection" ("id", "userAId", "userBId") VALUES ($1, $2, $3)`,
    [id, userAId, userBId],
  );
}

async function seedContext(
  client: InstanceType<typeof Client>,
  options: {
    suffix: string;
    connectionId: string;
    policy: "DIRECT_CONVERSATION_V1" | "CREATOR_GATED_V2" | null;
    activationId?: string | null;
    state?: "OPEN" | "ENDED";
    previousEndedAt?: Date;
    previousEndedById?: string;
    previousEndReason?: string;
  },
): Promise<void> {
  const actionId = `action-${options.suffix}`;
  const interestId = `interest-${options.suffix}`;
  await client.query(
    `INSERT INTO "ClassmatePost" ("id", "coordinationPolicy") VALUES ($1, $2)`,
    [actionId, options.policy],
  );
  await client.query(
    `INSERT INTO "ActionInterest" ("id", "classmatePostId", "connectionId") VALUES ($1, $2, $3)`,
    [interestId, actionId, options.connectionId],
  );
  await client.query(
    `
      INSERT INTO "ActionCoordinationContext" (
        "id", "interestId", "currentActivationId", "state", "connectionId",
        "endedAt", "endedById", "endReason"
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `,
    [
      `context-${options.suffix}`,
      interestId,
      options.activationId ?? null,
      options.state ?? "OPEN",
      options.connectionId,
      options.previousEndedAt ?? null,
      options.previousEndedById ?? null,
      options.previousEndReason ?? null,
    ],
  );
}

async function seedSentinels(client: InstanceType<typeof Client>): Promise<void> {
  await client.query(`
    INSERT INTO "Message" VALUES ('message-sentinel', 'unchanged');
    INSERT INTO "PlanRequest" VALUES ('plan-sentinel', 'PENDING');
    INSERT INTO "ProductFunnelEvent" VALUES ('event-sentinel', 'SENTINEL');
    INSERT INTO "NotificationOutbox" VALUES ('outbox-sentinel', 'SENTINEL');
  `);
}

async function assertSentinels(client: InstanceType<typeof Client>): Promise<void> {
  for (const table of [
    "Message",
    "PlanRequest",
    "ProductFunnelEvent",
    "NotificationOutbox",
  ]) {
    const result = await client.query(`SELECT COUNT(*)::int AS count FROM "${table}"`);
    assert.equal(result.rows[0]?.count, 1, table);
  }
}

async function connectionState(
  client: InstanceType<typeof Client>,
  connectionId: string,
): Promise<{ status: string; endedById: string | null; endedAt: string | null }> {
  const result = await client.query<{
    status: string;
    endedById: string | null;
    endedAt: string | null;
  }>(
    `
      SELECT "status", "endedById",
        to_char("endedAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "endedAt"
      FROM "Connection" WHERE "id" = $1
    `,
    [connectionId],
  );
  assert.equal(result.rows.length, 1);
  return {
    status: result.rows[0].status,
    endedById: result.rows[0].endedById,
    endedAt: result.rows[0].endedAt,
  };
}

async function contextStates(client: InstanceType<typeof Client>): Promise<
  Array<{
    id: string;
    state: string;
    endedById: string | null;
    endReason: string | null;
    endedAt: string | null;
  }>
> {
  const result = await client.query<{
    id: string;
    state: string;
    endedById: string | null;
    endReason: string | null;
    endedAt: string | null;
  }>(`
    SELECT "id", "state", "endedById", "endReason",
      to_char("endedAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "endedAt"
    FROM "ActionCoordinationContext"
    ORDER BY "id"
  `);
  return result.rows.map((row) => ({
    id: row.id,
    state: row.state,
    endedById: row.endedById,
    endReason: row.endReason,
    endedAt: row.endedAt,
  }));
}

async function blockStates(client: InstanceType<typeof Client>): Promise<
  Array<{
    blockerId: string;
    blockedId: string;
    connectionId: string | null;
    reason: string | null;
  }>
> {
  const result = await client.query<{
    blockerId: string;
    blockedId: string;
    connectionId: string | null;
    reason: string | null;
  }>(`
    SELECT "blockerId", "blockedId", "connectionId", "reason"
    FROM "Block"
    ORDER BY "blockerId", "blockedId"
  `);
  return result.rows;
}
