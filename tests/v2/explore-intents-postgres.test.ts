import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import Module from "node:module";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { PrismaClient } from "@prisma/client";

const resolver = Module as typeof Module & { _resolveFilename: (request: string, ...args: unknown[]) => string };
const originalResolve = resolver._resolveFilename;
resolver._resolveFilename = function (request, ...args) {
  return request === "server-only"
    ? fileURLToPath(new URL("./server-only-test-stub.cjs", import.meta.url))
    : originalResolve.call(this, request, ...args);
};
const rawURL = process.env.DATABASE_URL;
const local = rawURL && ["localhost", "127.0.0.1"].includes(new URL(rawURL).hostname) ? rawURL : undefined;

async function fixture() {
  assert.ok(local, "Explore write tests require a local PostgreSQL database");
  const db = new PrismaClient({ datasources: { db: { url: local } } });
  const run = randomUUID().replaceAll("-", "").slice(0, 10);
  const school = `Explore QA ${run}`;
  const ids: string[] = [];
  async function user(key: string, internal = false) {
    const row = await db.user.create({ data: {
      username: `${internal ? "qa_mutual_" : "explore_"}${run}_${key}`,
      hashedPassword: "local-fixture-only", school,
      onboardingComplete: true, verifiedStudent: true, studentVerificationStatus: "VERIFIED",
    }, select: { id: true } });
    ids.push(row.id); return row.id;
  }
  return { db, user, cleanup: async () => {
    await db.user.deleteMany({ where: { id: { in: ids } } }); await db.$disconnect();
  } };
}

test("Explore real PostgreSQL publication, privacy projection, pause/resume and opt-out", {
  skip: local ? false : "requires localhost PostgreSQL",
}, async () => {
  const f = await fixture();
  const { createWeeklyIntent, patchWeeklyIntent } = await import("../../lib/v2/weekly-intents");
  const { listExploreIntents } = await import("../../lib/v2/explore-intents");
  const { weeklyIntentCreateSchema } = await import("../../lib/validators/weekly-intent");
  try {
    const author = await f.user("author"); const viewer = await f.user("viewer");
    const start = new Date(Date.now() + 86400000); const end = new Date(start.getTime() + 7200000);
    let { intent } = await createWeeklyIntent(author, weeklyIntentCreateSchema.parse({
      topic: "COFFEE", activityText: "QA coffee", timeZone: "Europe/Berlin",
      timeWindows: [{ startAt: start.toISOString(), endAt: end.toISOString() }],
      timePreference: { kind: "EXACT" }, note: "A short activity preview",
    }));
    assert.equal(intent.exploreVisible, false);
    assert.equal((await listExploreIntents(viewer)).intents.length, 0);
    ({ intent } = await patchWeeklyIntent(author, intent.id, { action: "EDIT", expectedVersion: intent.version, exploreVisible: true }));
    const visible = await listExploreIntents(viewer);
    assert.equal(visible.intents.length, 1);
    const card = visible.intents[0]!;
    assert.equal(card.activityText, "QA coffee");
    for (const key of ["user", "userId", "username", "nickname", "avatarUrl", "email", "phone", "timeWindows", "timeZone"])
      assert.equal(key in card, false, `Must not expose ${key}`);
    assert.match(card.time.startDate!, /^\d{4}-\d{2}-\d{2}$/);
    assert.doesNotMatch(JSON.stringify(card.time), /\d{2}:\d{2}/);
    assert.equal("startAt" in card.time, false);
    assert.equal((await listExploreIntents(author)).intents.length, 0);
    ({ intent } = await patchWeeklyIntent(author, intent.id, { action: "PAUSE", expectedVersion: intent.version }));
    assert.equal((await listExploreIntents(viewer)).intents.length, 0);
    ({ intent } = await patchWeeklyIntent(author, intent.id, { action: "RESUME", expectedVersion: intent.version }));
    assert.equal((await listExploreIntents(viewer)).intents.length, 1);
    await patchWeeklyIntent(author, intent.id, { action: "EDIT", expectedVersion: intent.version, exploreVisible: false });
    assert.equal((await listExploreIntents(viewer)).intents.length, 0);
  } finally { await f.cleanup(); }
});

test("Explore isolates synthetic QA from ordinary readers and respects bilateral blocks and limits", {
  skip: local ? false : "requires localhost PostgreSQL",
}, async () => {
  const f = await fixture();
  const { listExploreIntents } = await import("../../lib/v2/explore-intents");
  try {
    const author = await f.user("author", true); const qa = await f.user("reader", true);
    const ordinary = await f.user("ordinary");
    await f.db.weeklyIntent.createMany({ data: Array.from({ length: 7 }, (_, i) => ({
      userId: author, topic: "COFFEE" as const, activityText: `QA activity ${i}`, exploreVisible: true,
      timeWindows: [], timePreference: { kind: "UNDECIDED" }, expiresAt: new Date(Date.now() + 86400000),
    })) });
    assert.equal((await listExploreIntents(ordinary)).intents.length, 0);
    const result = await listExploreIntents(qa, 100);
    assert.equal(result.intents.length, 5); assert.equal(result.hasMore, true);
    const block = await f.db.block.create({ data: { blockerId: author, blockedId: qa } });
    assert.equal((await listExploreIntents(qa)).intents.length, 0);
    await f.db.block.delete({ where: { id: block.id } });
    await f.db.block.create({ data: { blockerId: qa, blockedId: author } });
    assert.equal((await listExploreIntents(qa)).intents.length, 0);
  } finally { await f.cleanup(); }
});
