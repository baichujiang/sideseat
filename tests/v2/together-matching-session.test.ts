import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import Module from "node:module";
import test from "node:test";
import { fileURLToPath } from "node:url";

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

const source = (path: string) =>
  readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

test("matching session projects IDLE, MATCHING, EXPIRED, and stopped states", async () => {
  const {
    projectTogetherMatchingSession,
    TOGETHER_MATCHING_SESSION_DURATION_MS,
  } = await import("../../lib/v2/together-matching-session");
  const now = new Date("2026-09-01T12:00:00.000Z");

  assert.equal(TOGETHER_MATCHING_SESSION_DURATION_MS, 48 * 60 * 60 * 1_000);
  assert.deepEqual(projectTogetherMatchingSession(null, now), {
    state: "IDLE",
    startedAt: null,
    matchingUntil: null,
    stoppedAt: null,
    version: 0,
  });

  const base = {
    startedAt: new Date("2026-09-01T00:00:00.000Z"),
    matchingUntil: new Date("2026-09-03T00:00:00.000Z"),
    stoppedAt: null,
    version: 1,
  };
  assert.equal(projectTogetherMatchingSession(base, now).state, "MATCHING");
  assert.equal(
    projectTogetherMatchingSession(base, base.matchingUntil).state,
    "EXPIRED",
  );
  assert.equal(
    projectTogetherMatchingSession(
      { ...base, stoppedAt: new Date("2026-09-01T06:00:00.000Z") },
      now,
    ).state,
    "IDLE",
  );
});

test("matching session is additive, user-scoped, and preserves intent rows", () => {
  const schema = source("prisma/schema.prisma");
  const migration = source(
    "prisma/migrations/20260901170000_together_matching_session/migration.sql",
  );
  assert.match(schema, /model TogetherMatchingSession/);
  assert.match(schema, /userId\s+String\s+@unique/);
  assert.match(schema, /matchingUntil\s+DateTime/);
  assert.match(schema, /stoppedAt\s+DateTime\?/);
  assert.match(migration, /CREATE TABLE "TogetherMatchingSession"/);
  assert.doesNotMatch(migration, /UPDATE\s+"WeeklyIntent"/i);
  assert.doesNotMatch(migration, /DELETE\s+FROM\s+"WeeklyIntent"/i);
});

test("matching session route starts explicitly, invokes matching, and stops independently", () => {
  const route = source("app/api/v1/me/together-matching-session/route.ts");
  assert.match(route, /export async function GET/);
  assert.match(route, /export async function POST/);
  assert.match(route, /export async function DELETE/);
  assert.match(route, /scope: "together-matching-session-start-v1"/);
  assert.match(route, /scope: "together-matching-session-stop-v1"/);
  assert.match(
    route,
    /startTogetherMatchingSession\(auth\.user\.id\)[\s\S]*matchAndNotifyForUser\(auth\.user\.id\)/,
  );
  assert.match(route, /TogetherMatchingSessionError/);
});

test("OpenAPI exposes one stable no-body GET, POST, and DELETE contract", () => {
  const contract = JSON.parse(source("openapi/v1.json"));
  const path = contract.paths["/api/v1/me/together-matching-session"];
  assert.equal(path.get.operationId, "getTogetherMatchingSession");
  assert.equal(path.post.operationId, "startTogetherMatchingSession");
  assert.equal(path.delete.operationId, "stopTogetherMatchingSession");
  assert.equal(path.post["x-sideseat-empty-request-body"], true);
  assert.equal(path.delete["x-sideseat-empty-request-body"], true);
  assert.equal(path.post.parameters[0].name, "Idempotency-Key");
  assert.equal(path.delete.parameters[0].name, "Idempotency-Key");

  const session = contract.components.schemas.TogetherMatchingSession;
  assert.deepEqual(session.properties.state.enum, [
    "IDLE",
    "MATCHING",
    "EXPIRED",
  ]);
  assert.deepEqual(session.required, [
    "state",
    "startedAt",
    "matchingUntil",
    "stoppedAt",
    "version",
  ]);
});
