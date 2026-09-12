import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import Module from "node:module";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { PrismaClient } from "@prisma/client";
import { EXPLORE_EXAMPLE_AUTHORS, EXPLORE_EXAMPLE_CASES, EXPLORE_EXAMPLE_MARKER,
  EXPLORE_EXAMPLE_NOTE, exploreExampleIntentId } from "../../lib/v2/explore-example-catalog";

const resolver = Module as typeof Module & { _resolveFilename: (request: string, ...args: unknown[]) => string };
const original = resolver._resolveFilename;
resolver._resolveFilename = function (request, ...args) {
  return request === "server-only" ? fileURLToPath(new URL("./server-only-test-stub.cjs", import.meta.url))
    : original.call(this, request, ...args);
};
const url = process.env.DATABASE_URL;
const local = url && ["localhost", "127.0.0.1"].includes(new URL(url).hostname)
  && new URL(url).pathname.includes("explore_examples") ? url : undefined;

test("Explicit examples reach ordinary and QA readers without exposing hidden QA or claiming verification", {
  skip: local ? false : "requires isolated localhost explore_examples database",
}, async () => {
  assert.ok(local);
  const db = new PrismaClient({ datasources: { db: { url: local } } });
  const { listExploreIntents } = await import("../../lib/v2/explore-intents");
  const suffix = randomUUID().replaceAll("-", "");
  const userIds: string[] = [];
  const expiresAt = new Date(Date.now() + 86_400_000);
  async function reader(key: string, school = "TUM", verifiedStudent = true) {
    const row = await db.user.create({ data: { username: `${key}_${suffix}`, hashedPassword: "local-fixture",
      school, verifiedStudent, onboardingComplete: true }, select: { id: true } });
    userIds.push(row.id); return row.id;
  }
  try {
    for (const author of EXPLORE_EXAMPLE_AUTHORS) {
      await db.user.create({ data: { ...author, hashedPassword: "local-fixture", isGuest: true,
        verifiedStudent: false, hideFromDiscovery: true, hideFromRecommendations: true,
        studentVerificationNotes: EXPLORE_EXAMPLE_MARKER } });
      userIds.push(author.id);
      for (const { key, period: _period, ...activity } of EXPLORE_EXAMPLE_CASES) {
        await db.weeklyIntent.create({ data: { ...activity, id: exploreExampleIntentId(author.id, key),
          userId: author.id, note: EXPLORE_EXAMPLE_NOTE, timeWindows: [], timePreference: { kind: "UNDECIDED" },
          exploreVisible: true, automaticMatching: false, expiresAt } });
      }
    }
    const ordinary = await reader("ordinary"); const qa = await reader("test_reader");
    const lmu = await reader("ordinary_lmu", "LMU"); const unverified = await reader("unverified", "TUM", false);
    for (const [viewer, school] of [[ordinary, "TUM"], [qa, "TUM"], [lmu, "LMU"]]) {
      const result = await listExploreIntents(viewer!, 5);
      assert.equal(result.intents.length, 5); assert.equal(result.hasMore, false);
      assert.ok(result.intents.every(row => row.isExample && row.verifiedStudent === false && row.campus === school));
      for (const row of result.intents) {
        assert.ok(row.descriptionPreview?.startsWith("示例 / Demo"));
        for (const key of ["username", "userId", "email", "phone", "avatarUrl", "timeWindows"])
          assert.equal(key in row, false);
      }
    }
    assert.equal((await listExploreIntents(unverified, 5)).intents.length, 0);
    const tum = EXPLORE_EXAMPLE_AUTHORS[0];
    const paused = exploreExampleIntentId(tum.id, "coffee");
    await db.weeklyIntent.update({ where: { id: paused }, data: { status: "PAUSED" } });
    assert.equal((await listExploreIntents(ordinary, 5)).intents.length, 4);
    await db.weeklyIntent.update({ where: { id: paused }, data: { status: "ACTIVE", exploreVisible: false } });
    assert.equal((await listExploreIntents(ordinary, 5)).intents.length, 4);
    await db.weeklyIntent.update({ where: { id: paused }, data: { exploreVisible: true, expiresAt: new Date(0) } });
    assert.equal((await listExploreIntents(ordinary, 5)).intents.length, 4);
    await db.weeklyIntent.update({ where: { id: paused }, data: { expiresAt } });
    const block = await db.block.create({ data: { blockerId: ordinary, blockedId: tum.id } });
    assert.equal((await listExploreIntents(ordinary, 5)).intents.length, 0);
    await db.block.delete({ where: { id: block.id } });
    const reverse = await db.block.create({ data: { blockerId: tum.id, blockedId: ordinary } });
    assert.equal((await listExploreIntents(ordinary, 5)).intents.length, 0);
    await db.block.delete({ where: { id: reverse.id } });
    const realAuthor = await reader("real_author"); const qaAuthor = await reader("qa_mutual_author");
    for (const author of [realAuthor, qaAuthor]) await db.weeklyIntent.create({ data: {
      userId: author, topic: "COFFEE", activityText: "Published coffee", exploreVisible: true,
      timeWindows: [], timePreference: { kind: "UNDECIDED" }, expiresAt,
    } });
    const filled = await listExploreIntents(ordinary, 5);
    assert.equal(filled.intents[0]!.isExample, false);
    assert.equal(filled.intents.filter(row => !row.isExample).length, 1);
    assert.equal((await listExploreIntents(qa, 5)).intents.filter(row => !row.isExample).length, 2);
    assert.equal(await db.togetherMatchingSession.count({ where: { userId: tum.id } }), 0);
  } finally {
    await db.user.deleteMany({ where: { id: { in: userIds } } }); await db.$disconnect();
  }
});
