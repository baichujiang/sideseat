import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import Module from "node:module";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { PrismaClient } from "@prisma/client";

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
commonJsModule._resolveFilename = function resolveServerOnly(
  request,
  parent,
  isMain,
  options,
) {
  if (request === "server-only") return serverOnlyStub;
  return resolveFilename.call(this, request, parent, isMain, options);
};

const localDatabaseUrl = localPostgresUrl(process.env.DATABASE_URL);

test("matching session PostgreSQL test refuses non-local databases", () => {
  assert.equal(
    localPostgresUrl("postgresql://user:password@example.invalid/database"),
    undefined,
  );
});

test(
  "start requires an active intent, fixes 48 hours, restarts, and stops",
  { skip: localDatabaseUrl ? false : "requires localhost PostgreSQL" },
  async () => {
    assert.ok(localDatabaseUrl);
    const {
      loadTogetherMatchingSession,
      startTogetherMatchingSession,
      stopTogetherMatchingSession,
      TogetherMatchingSessionError,
    } = await import("../../lib/v2/together-matching-session");
    const db = new PrismaClient({
      datasources: { db: { url: localDatabaseUrl } },
    });
    const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
    const userId = `matching-session-${suffix}`;
    const startedAt = new Date("2026-09-01T08:00:00.000Z");

    await db.$connect();
    try {
      await db.user.create({
        data: {
          id: userId,
          username: `matching_session_${suffix}`,
          hashedPassword: "fixture",
        },
      });

      assert.deepEqual(await loadTogetherMatchingSession(userId, startedAt), {
        state: "IDLE",
        startedAt: null,
        matchingUntil: null,
        stoppedAt: null,
        version: 0,
      });
      await assert.rejects(
        startTogetherMatchingSession(userId, startedAt),
        (cause) =>
          cause instanceof TogetherMatchingSessionError &&
          cause.code === "TOGETHER_MATCHING_SESSION_NO_ACTIVE_INTENTS",
      );

      await db.weeklyIntent.create({
        data: {
          userId,
          topic: "COFFEE",
          timeWindows: [{
            startAt: "2026-09-02T10:00:00.000Z",
            endAt: "2026-09-02T11:00:00.000Z",
          }],
          expiresAt: new Date("2026-09-06T21:59:59.999Z"),
        },
      });

      const first = await startTogetherMatchingSession(userId, startedAt);
      assert.equal(first.state, "MATCHING");
      assert.equal(first.startedAt, "2026-09-01T08:00:00.000Z");
      assert.equal(first.matchingUntil, "2026-09-03T08:00:00.000Z");
      assert.equal(first.version, 1);

      const restartedAt = new Date("2026-09-01T09:00:00.000Z");
      const restarted = await startTogetherMatchingSession(userId, restartedAt);
      assert.equal(restarted.matchingUntil, "2026-09-03T09:00:00.000Z");
      assert.equal(restarted.version, 2);

      const stopped = await stopTogetherMatchingSession(
        userId,
        new Date("2026-09-01T10:00:00.000Z"),
      );
      assert.equal(stopped.state, "IDLE");
      assert.equal(stopped.stoppedAt, "2026-09-01T10:00:00.000Z");
      assert.equal(stopped.version, 3);
    } finally {
      await db.user.deleteMany({ where: { id: userId } });
      await db.$disconnect();
    }
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
  if (parsed.hostname !== "127.0.0.1" && parsed.hostname !== "localhost") {
    return undefined;
  }
  return parsed.toString();
}
