import assert from "node:assert/strict";
import test from "node:test";

import { Prisma, PrismaClient } from "@prisma/client";
import pg from "pg";

import {
  appliedWorkerTransition,
  buildActionCoordinationCommandIdentity,
  fixedActionCoordinationClock,
  runAtomicActionCoordinationCommand,
  runGuardedActionCoordinationWorkerTransition,
  skippedWorkerTransition,
  type ActionCoordinationCommandRequest,
} from "../../lib/v2/action-coordination/command";
import { pairSafetyLock } from "../../lib/v2/action-coordination/db-locks";
import { ActionCoordinationConflict } from "../../lib/v2/action-coordination/errors";
import { actionCoordinationConflictResult } from "../../lib/v2/action-coordination/route-adapter";

const { Client } = pg;
const localDatabaseUrl = localPostgresUrl(process.env.DATABASE_URL);

const fixedNow = new Date("2026-08-30T14:15:16.789Z");
const transactionOptions = { maxWait: 5_000, timeout: 10_000 } as const;

test("BL-BE-04 PostgreSQL tests refuse non-local effective database targets", () => {
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
  "pairSafetyLock serializes a reverse pair and releases on rollback",
  {
    skip: localDatabaseUrl
      ? false
      : "requires a localhost PostgreSQL DATABASE_URL",
  },
  async () => {
    await withFixtureSchema(2, async ({ admin, prisma: [firstDb, secondDb] }) => {
      const firstLocked = deferred<void>();
      const releaseFirst = deferred<void>();
      const secondPid = deferred<number>();
      let secondAcquired = false;

      const first = firstDb.$transaction(async (tx) => {
        await pairSafetyLock(tx, "user-a", "user-b");
        firstLocked.resolve();
        await releaseFirst.promise;
      }, transactionOptions);
      await firstLocked.promise;

      const second = secondDb.$transaction(async (tx) => {
        const pidRows = await tx.$queryRaw<Array<{ pid: number }>>(Prisma.sql`
          SELECT pg_backend_pid()::integer AS "pid"
        `);
        secondPid.resolve(pidRows[0].pid);
        await pairSafetyLock(tx, "user-b", "user-a");
        secondAcquired = true;
      }, transactionOptions);

      try {
        await waitForAdvisoryLockWait(admin, await secondPid.promise);
        assert.equal(secondAcquired, false);
      } finally {
        releaseFirst.resolve();
      }
      await Promise.all([first, second]);
      assert.equal(secondAcquired, true);

      await assert.rejects(
        firstDb.$transaction(async (tx) => {
          await pairSafetyLock(tx, "rollback-a", "rollback-b");
          throw new Error("force pair transaction rollback");
        }, transactionOptions),
        /force pair transaction rollback/,
      );
      await secondDb.$transaction(async (tx) => {
        await pairSafetyLock(tx, "rollback-b", "rollback-a");
      }, transactionOptions);
    });
  },
);

test(
  "pairSafetyLock does not serialize different canonical pairs",
  {
    skip: localDatabaseUrl
      ? false
      : "requires a localhost PostgreSQL DATABASE_URL",
  },
  async () => {
    await withFixtureSchema(2, async ({ prisma: [firstDb, secondDb] }) => {
      const firstLocked = deferred<void>();
      const releaseFirst = deferred<void>();

      const first = firstDb.$transaction(async (tx) => {
        await pairSafetyLock(tx, "shared-user", "pair-one");
        firstLocked.resolve();
        await releaseFirst.promise;
      }, transactionOptions);
      await firstLocked.promise;

      const second = secondDb.$transaction(async (tx) => {
        await pairSafetyLock(tx, "shared-user", "pair-two");
        return "acquired" as const;
      }, transactionOptions);

      try {
        assert.equal(
          await Promise.race([
            second,
            delay(1_000).then(() => "timed-out" as const),
          ]),
          "acquired",
        );
      } finally {
        releaseFirst.resolve();
      }
      await first;
    });
  },
);

test(
  "atomic commands replay once, isolate namespaces, cache expected 409, and roll back receipt with domain state",
  {
    skip: localDatabaseUrl
      ? false
      : "requires a localhost PostgreSQL DATABASE_URL",
  },
  async () => {
    await withFixtureSchema(2, async ({ admin, prisma: [firstDb, secondDb] }) => {
      const request = commandRequest({
        idempotencyKey: "same-gesture-0001",
        body: { value: "original" },
      });
      let executed = 0;
      const firstExecuteEntered = deferred<void>();
      const releaseFirstExecute = deferred<void>();
      const executeOnce = async ({ tx, now }: AtomicContext) => {
        executed += 1;
        await tx.$executeRaw(Prisma.sql`
          INSERT INTO "CommandProbe" ("id", "value", "observedAt")
          VALUES ('concurrent-probe', 'created-once', ${now})
        `);
        firstExecuteEntered.resolve();
        await releaseFirstExecute.promise;
        return {
          status: 201,
          body: { probeId: "concurrent-probe", observedAt: now.toISOString() },
        } as const;
      };

      const dependencies = (db: PrismaClient) => ({
        db,
        clock: fixedActionCoordinationClock(fixedNow),
        receiptTtlMs: 60 * 60_000,
        transactionOptions,
      });
      const forwardPromise = runAtomicActionCoordinationCommand(
        { request, pairs: [["user-a", "user-b"]], execute: executeOnce },
        dependencies(firstDb),
      );
      await firstExecuteEntered.promise;

      // Neither the claimed receipt nor the domain row is visible before the
      // transaction commits. A helper that claimed in a separate transaction
      // would expose a receipt here and fail this assertion.
      assert.equal(await tableCount(admin, "ApiIdempotencyRecord"), 0);
      assert.equal(await tableCount(admin, "CommandProbe"), 0);

      const reversePromise = runAtomicActionCoordinationCommand(
        { request, pairs: [["user-b", "user-a"]], execute: executeOnce },
        dependencies(secondDb),
      );
      try {
        await waitForAnyAdvisoryLockWait(admin);
        assert.equal(executed, 1);
      } finally {
        releaseFirstExecute.resolve();
      }
      const [forward, reverse] = await Promise.all([
        forwardPromise,
        reversePromise,
      ]);

      assert.deepEqual(
        [forward.kind, reverse.kind].sort(),
        ["executed", "replayed"],
      );
      assert.equal(executed, 1);
      assert.ok("body" in forward);
      assert.ok("body" in reverse);
      assert.deepEqual(forward.body, reverse.body);
      assert.equal(await tableCount(admin, "CommandProbe"), 1);
      assert.equal(await tableCount(admin, "ApiIdempotencyRecord"), 1);
      const expiry = await admin.query<{ expiresAt: Date }>(`
        SELECT "expiresAt" FROM "ApiIdempotencyRecord"
      `);
      assert.equal(
        new Date(expiry.rows[0].expiresAt).toISOString(),
        "2026-08-30T15:15:16.789Z",
      );

      let conflictingCallbackRan = false;
      const conflict = await runAtomicActionCoordinationCommand(
        {
          request: { ...request, body: { value: "different" } },
          pairs: [["user-a", "user-b"]],
          execute: async () => {
            conflictingCallbackRan = true;
            return { status: 200, body: { impossible: true } };
          },
        },
        dependencies(firstDb),
      );
      assert.equal(conflict.kind, "idempotency_conflict");
      assert.equal(conflict.status, 409);
      assert.equal(conflictingCallbackRan, false);

      const namespaceVariants: ActionCoordinationCommandRequest[] = [
        { ...request, actorId: "actor-b" },
        {
          ...request,
          operation: { method: "DELETE", operationId: "withdrawActionInterest" },
        },
        {
          ...request,
          canonicalResource: { kind: "ACTION", id: "action-2" },
        },
        { ...request, idempotencyKey: "same-gesture-0002" },
      ];
      for (const [index, variant] of namespaceVariants.entries()) {
        const probeId = `namespace-${index}`;
        const result = await runAtomicActionCoordinationCommand(
          {
            request: variant,
            execute: async ({ tx, now }) => {
              await tx.$executeRaw(Prisma.sql`
                INSERT INTO "CommandProbe" ("id", "value", "observedAt")
                VALUES (${probeId}, 'isolated', ${now})
              `);
              return { status: 200, body: { probeId } };
            },
          },
          dependencies(firstDb),
        );
        assert.equal(result.kind, "executed");
      }
      assert.equal(await tableCount(admin, "ApiIdempotencyRecord"), 5);

      const expectedConflictRequest = commandRequest({
        idempotencyKey: "expected-409-0001",
        canonicalResourceId: "context-with-plan",
      });
      const expectedStateConflict = new ActionCoordinationConflict(
        "CONTEXT_PLAN_PENDING",
        "The context has an actionable Plan.",
        { coordinationState: "OPEN" },
        {
          action: "OPEN_PLAN",
          focus: {
            type: "PLAN",
            connectionId: "connection-1",
            commitmentId: "commitment-1",
          },
        },
      );
      const authoritative409 = actionCoordinationConflictResult(
        expectedStateConflict,
      ).body;
      let expected409Executions = 0;
      const first409 = await runAtomicActionCoordinationCommand(
        {
          request: expectedConflictRequest,
          execute: async () => {
            expected409Executions += 1;
            throw expectedStateConflict;
          },
        },
        dependencies(firstDb),
      );
      const replay409 = await runAtomicActionCoordinationCommand(
        {
          request: expectedConflictRequest,
          execute: async () => {
            expected409Executions += 1;
            return { status: 200, body: { incorrect: true } };
          },
        },
        dependencies(secondDb),
      );
      assert.equal(first409.kind, "executed");
      assert.equal(first409.status, 409);
      assert.equal(replay409.kind, "replayed");
      assert.equal(replay409.status, 409);
      assert.deepEqual(replay409.body, authoritative409);
      assert.equal(expected409Executions, 1);

      const rollbackRequest = commandRequest({
        idempotencyKey: "rollback-gesture-0001",
        canonicalResourceId: "rollback-resource",
      });
      const rollbackIdentity = buildActionCoordinationCommandIdentity(rollbackRequest);
      await assert.rejects(
        runAtomicActionCoordinationCommand(
          {
            request: rollbackRequest,
            execute: async ({ tx, now }) => {
              await tx.$executeRaw(Prisma.sql`
                INSERT INTO "CommandProbe" ("id", "value", "observedAt")
                VALUES ('rolled-back-probe', 'must-disappear', ${now})
              `);
              throw new Error("force atomic command rollback");
            },
          },
          dependencies(firstDb),
        ),
        /force atomic command rollback/,
      );
      assert.equal(await rowCount(admin, "CommandProbe", "id", "rolled-back-probe"), 0);
      assert.equal(
        await rowCount(
          admin,
          "ApiIdempotencyRecord",
          "id",
          rollbackIdentity.recordId,
        ),
        0,
      );

      const retry = await runAtomicActionCoordinationCommand(
        {
          request: rollbackRequest,
          execute: async ({ tx, now }) => {
            await tx.$executeRaw(Prisma.sql`
              INSERT INTO "CommandProbe" ("id", "value", "observedAt")
              VALUES ('rolled-back-probe', 'retry-won', ${now})
            `);
            return { status: 201, body: { retry: "won" } };
          },
        },
        dependencies(secondDb),
      );
      assert.equal(retry.kind, "executed");
      assert.equal(await rowCount(admin, "CommandProbe", "id", "rolled-back-probe"), 1);

      const invalidServerResultRequest = commandRequest({
        idempotencyKey: "server-result-0001",
        canonicalResourceId: "server-result-resource",
      });
      const invalidServerResultIdentity =
        buildActionCoordinationCommandIdentity(invalidServerResultRequest);
      await assert.rejects(
        runAtomicActionCoordinationCommand(
          {
            request: invalidServerResultRequest,
            execute: async ({ tx, now }) => {
              await tx.$executeRaw(Prisma.sql`
                INSERT INTO "CommandProbe" ("id", "value", "observedAt")
                VALUES ('server-result-probe', 'must-roll-back', ${now})
              `);
              return { status: 500, body: { error: "unexpected" } };
            },
          },
          dependencies(firstDb),
        ),
        /only expected 2xx or 4xx/i,
      );
      assert.equal(
        await rowCount(admin, "CommandProbe", "id", "server-result-probe"),
        0,
      );
      assert.equal(
        await rowCount(
          admin,
          "ApiIdempotencyRecord",
          "id",
          invalidServerResultIdentity.recordId,
        ),
        0,
      );
    });
  },
);

test(
  "guarded workers have exactly one CAS winner and never create HTTP receipts",
  {
    skip: localDatabaseUrl
      ? false
      : "requires a localhost PostgreSQL DATABASE_URL",
  },
  async () => {
    await withFixtureSchema(2, async ({ admin, prisma: [firstDb, secondDb] }) => {
      await admin.query(`
        INSERT INTO "WorkerProbe" ("id", "state") VALUES ('lease-1', 'READY')
      `);

      async function attempt(db: PrismaClient, winner: string) {
        return runGuardedActionCoordinationWorkerTransition(
          {
            pairs: [["worker-user-a", "worker-user-b"]],
            transition: async ({ tx, now }) => {
              const rows = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
                UPDATE "WorkerProbe"
                SET "state" = 'DONE', "winner" = ${winner}, "observedAt" = ${now}
                WHERE "id" = 'lease-1' AND "state" = 'READY'
                RETURNING "id"
              `);
              if (rows[0]) return appliedWorkerTransition({ winner });
              const current = await tx.$queryRaw<Array<{ state: string }>>(Prisma.sql`
                SELECT "state" FROM "WorkerProbe" WHERE "id" = 'lease-1'
              `);
              return skippedWorkerTransition({ state: current[0]?.state ?? "MISSING" });
            },
          },
          {
            db,
            clock: fixedActionCoordinationClock(fixedNow),
            transactionOptions,
          },
        );
      }

      const outcomes = await Promise.all([
        attempt(firstDb, "worker-a"),
        attempt(secondDb, "worker-b"),
      ]);
      assert.deepEqual(
        outcomes.map((outcome) => outcome.kind).sort(),
        ["applied", "not_applicable"],
      );

      const probe = await admin.query<{
        state: string;
        winner: string;
        observedAt: Date;
      }>(`
        SELECT "state", "winner", "observedAt" FROM "WorkerProbe" WHERE "id" = 'lease-1'
      `);
      assert.equal(probe.rows[0].state, "DONE");
      assert.ok(new Set(["worker-a", "worker-b"]).has(probe.rows[0].winner));
      assert.equal(
        new Date(probe.rows[0].observedAt).toISOString(),
        fixedNow.toISOString(),
      );
      assert.equal(await tableCount(admin, "ApiIdempotencyRecord"), 0);
    });
  },
);

type AtomicContext = Parameters<
  Parameters<typeof runAtomicActionCoordinationCommand>[0]["execute"]
>[0];

function commandRequest(
  overrides: {
    actorId?: string;
    idempotencyKey?: string;
    canonicalResourceId?: string;
    body?: ActionCoordinationCommandRequest["body"];
  } = {},
): ActionCoordinationCommandRequest {
  const canonicalResourceId = overrides.canonicalResourceId ?? "action-1";
  return {
    actorId: overrides.actorId ?? "actor-a",
    idempotencyKey: overrides.idempotencyKey ?? "gesture-key-0001",
    operation: { method: "POST", operationId: "createActionInterest" },
    canonicalResource: { kind: "ACTION", id: canonicalResourceId },
    pathParameters: { actionId: canonicalResourceId },
    query: { source: "ACTION_DETAIL" },
    body: overrides.body ?? { interestSurface: "ACTION_DETAIL" },
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
  const schema = `bl_be04_${process.pid}_${Math.random().toString(36).slice(2, 10)}`;
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
    await Promise.all(clients.map((client) => client.$disconnect().catch(() => undefined)));
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

    CREATE TABLE "CommandProbe" (
      "id" TEXT NOT NULL,
      "value" TEXT NOT NULL,
      "observedAt" TIMESTAMP(3) NOT NULL,
      CONSTRAINT "CommandProbe_pkey" PRIMARY KEY ("id")
    );

    CREATE TABLE "WorkerProbe" (
      "id" TEXT NOT NULL,
      "state" TEXT NOT NULL,
      "winner" TEXT,
      "observedAt" TIMESTAMP(3),
      CONSTRAINT "WorkerProbe_pkey" PRIMARY KEY ("id")
    );
  `);
}

async function waitForAdvisoryLockWait(
  admin: InstanceType<typeof Client>,
  pid: number,
): Promise<void> {
  let last: unknown;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const result = await admin.query<{
      state: string | null;
      wait_event_type: string | null;
      wait_event: string | null;
    }>(`
      SELECT state, wait_event_type, wait_event
      FROM pg_stat_activity
      WHERE pid = $1
    `, [pid]);
    last = result.rows[0];
    if (
      result.rows[0]?.wait_event_type === "Lock" &&
      result.rows[0]?.wait_event?.toLowerCase() === "advisory"
    ) {
      return;
    }
    await delay(20);
  }
  assert.fail(`backend ${pid} never waited for advisory lock: ${JSON.stringify(last)}`);
}

async function waitForAnyAdvisoryLockWait(
  admin: InstanceType<typeof Client>,
): Promise<void> {
  let last: unknown;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const result = await admin.query<{
      pid: number;
      state: string | null;
      wait_event_type: string | null;
      wait_event: string | null;
    }>(`
      SELECT pid, state, wait_event_type, wait_event
      FROM pg_stat_activity
      WHERE datname = current_database()
        AND pid <> pg_backend_pid()
        AND wait_event_type = 'Lock'
        AND LOWER(COALESCE(wait_event, '')) = 'advisory'
    `);
    last = result.rows;
    if (result.rows.length > 0) return;
    await delay(20);
  }
  assert.fail(`no backend waited for an advisory lock: ${JSON.stringify(last)}`);
}

async function tableCount(
  client: InstanceType<typeof Client>,
  table: "ApiIdempotencyRecord" | "CommandProbe",
): Promise<number> {
  const result = await client.query<{ count: string }>(
    `SELECT COUNT(*)::TEXT AS count FROM "${table}"`,
  );
  return Number(result.rows[0].count);
}

async function rowCount(
  client: InstanceType<typeof Client>,
  table: "ApiIdempotencyRecord" | "CommandProbe",
  column: "id",
  value: string,
): Promise<number> {
  const result = await client.query<{ count: string }>(
    `SELECT COUNT(*)::TEXT AS count FROM "${table}" WHERE "${column}" = $1`,
    [value],
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

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
