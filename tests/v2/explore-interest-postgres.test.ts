import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import Module from "node:module";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { PrismaClient } from "@prisma/client";

const resolver = Module as typeof Module & { _resolveFilename: (request: string, ...args: unknown[]) => string };
const originalResolve = resolver._resolveFilename;
resolver._resolveFilename = function (request, ...args) {
  return request === "server-only" ? fileURLToPath(new URL("./server-only-test-stub.cjs", import.meta.url))
    : originalResolve.call(this, request, ...args);
};
const url = process.env.DATABASE_URL;
const local = url && ["localhost", "127.0.0.1"].includes(new URL(url).hostname) ? url : undefined;

async function fixture() {
  assert(local);
  const db = new PrismaClient({ datasources: { db: { url: local } } });
  const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
  const flags = ["V2_DISCOVERY_MATCHING_ENABLED", "V2_ACTIVITY_FIT_ENABLED", "V2_FLEXIBLE_TIMING_ENABLED", "V2_AUTOMATIC_MATCHING_ENABLED"];
  const previous = flags.map(key => process.env[key]); flags.forEach(key => { process.env[key] = "1"; });
  const users = await Promise.all(["a", "b", "c"].map(key => db.user.create({ data: {
    username: `explore_interest_${suffix}_${key}`, hashedPassword: "local-only", school: "TUM",
    onboardingComplete: true, verifiedStudent: true,
  } })));
  async function intention(userId: string, automaticMatching = false) {
    return db.weeklyIntent.create({ data: { userId, topic: "COFFEE", activityText: `Coffee ${suffix}`,
      timeWindows: [], timePreference: { kind: "UNDECIDED" }, expiresAt: null,
      exploreVisible: true, automaticMatching } });
  }
  return { db, users, intention, cleanup: async () => {
    await db.user.deleteMany({ where: { id: { in: users.map(u => u.id) } } }); await db.$disconnect();
    flags.forEach((key, i) => { if (previous[i] === undefined) delete process.env[key]; else process.env[key] = previous[i]; });
  } };
}

test("Explore interest is private, deduplicated, not matching supply, and joins the recommendation/chat flow", { skip: !local }, async () => {
  const f = await fixture();
  const { expressExploreInterest, listMutualOpportunities, decideMutualOpportunity, generateMutualOpportunitiesForUser } = await import("../../lib/v2/mutual-opportunities");
  const { listExploreIntents } = await import("../../lib/v2/explore-intents");
  const { loadCurrentWeeklyIntent } = await import("../../lib/v2/weekly-intents");
  try {
    const [author, viewer, third] = f.users;
    const target = await f.intention(author!.id);
    const results = await Promise.all([expressExploreInterest(viewer!.id, target.id), expressExploreInterest(viewer!.id, target.id)]);
    const own = results[0]!.opportunity;
    assert.equal(own.id, results[1]!.opportunity.id); assert.equal(own.state, "DECIDED");
    assert.equal(own.coordination, null);
    assert.equal(own.peer.displayName, "Student"); assert.equal(own.peer.avatarUrl, null);
    const peer = (await listMutualOpportunities(author!.id, false)).opportunities[0]!;
    assert.equal(peer.id, own.id); assert.equal(peer.state, "NEEDS_DECISION"); assert.equal(peer.viewerDecision, null);
    assert.equal("peerDecision" in peer, false);
    const explore = (await listExploreIntents(viewer!.id, 5)).intents.find(i => i.id === target.id)!;
    assert.equal(explore.interest?.opportunityId, own.id); assert.equal(explore.interest?.state, "DECIDED");
    assert.equal((await loadCurrentWeeklyIntent(viewer!.id)).intents.length, 0);
    const backing = await f.db.weeklyIntent.findMany({ where: { userId: viewer!.id } });
    assert.equal(backing.length, 1); assert.equal(backing[0]!.exploreResponseToId, target.id);
    assert.equal(backing[0]!.automaticMatching, false); assert.equal(backing[0]!.exploreVisible, false);
    assert.deepEqual(backing[0]!.timePreference, { kind: "UNDECIDED" });
    await f.db.togetherMatchingSession.create({ data: { userId: viewer!.id, startedAt: new Date(), matchingUntil: new Date(Date.now() + 86400000) } });
    await f.intention(third!.id, true);
    assert.deepEqual(await generateMutualOpportunitiesForUser(viewer!.id), []);
    const mutual = (await decideMutualOpportunity({ userId: author!.id, opportunityId: own.id, decision: "YES" })).opportunity;
    assert.equal(mutual.state, "READY_TO_COORDINATE"); assert(mutual.coordination?.connectionId);
    assert.equal(mutual.peer.displayName, viewer!.username);
    const repeated = await expressExploreInterest(viewer!.id, target.id);
    assert.equal(repeated.opportunity.coordination?.connectionId, mutual.coordination.connectionId);
    assert.equal(repeated.activated, false);
    assert.equal(await f.db.message.count({ where: { mutualOpportunityId: own.id } }), 1);
    assert.equal((await listExploreIntents(viewer!.id)).intents.find(i => i.id === target.id)!.interest?.state, "READY_TO_COORDINATE");
  } finally { await f.cleanup(); }
});

test("Explore reuses an existing recommendation and completes an independently chosen YES", { skip: !local }, async () => {
  const f = await fixture();
  const { expressExploreInterest, generateMutualOpportunitiesForUser, decideMutualOpportunity } = await import("../../lib/v2/mutual-opportunities");
  try {
    const [author, viewer] = f.users;
    const target = await f.intention(author!.id, true); await f.intention(viewer!.id, true);
    const matches = await generateMutualOpportunitiesForUser(viewer!.id); assert.equal(matches.length, 1);
    const id = matches[0]!.opportunityId;
    await decideMutualOpportunity({ userId: author!.id, opportunityId: id, decision: "YES" });
    const result = await expressExploreInterest(viewer!.id, target.id);
    assert.equal(result.opportunity.id, id); assert.equal(result.opportunity.state, "READY_TO_COORDINATE");
    assert.equal(result.activated, true);
    assert.equal(await f.db.weeklyIntent.count({ where: { userId: viewer!.id } }), 1);
    assert.equal(await f.db.mutualOpportunity.count({ where: { OR: [{ userAId: viewer!.id }, { userBId: viewer!.id }] } }), 1);
  } finally { await f.cleanup(); }
});

test("Withdraw in recommendations updates Explore; private, paused, blocked and example owners cannot receive interest", { skip: !local }, async () => {
  const f = await fixture();
  const { expressExploreInterest, withdrawMutualOpportunityDecision } = await import("../../lib/v2/mutual-opportunities");
  const { listExploreIntents } = await import("../../lib/v2/explore-intents");
  try {
    const [author, viewer, third] = f.users;
    const target = await f.intention(author!.id);
    const result = await expressExploreInterest(viewer!.id, target.id);
    await withdrawMutualOpportunityDecision({ userId: viewer!.id, opportunityId: result.opportunity.id });
    assert.equal((await listExploreIntents(viewer!.id)).intents.find(i => i.id === target.id)!.interest?.state, "UNAVAILABLE");
    await assert.rejects(expressExploreInterest(viewer!.id, target.id), { code: "NO_LONGER_AVAILABLE" });
    await f.db.weeklyIntent.update({ where: { id: target.id }, data: { exploreVisible: false } });
    await assert.rejects(expressExploreInterest(third!.id, target.id), { code: "NOT_FOUND" });
    await f.db.weeklyIntent.update({ where: { id: target.id }, data: { exploreVisible: true, status: "PAUSED" } });
    await assert.rejects(expressExploreInterest(third!.id, target.id), { code: "NOT_FOUND" });
    await f.db.weeklyIntent.update({ where: { id: target.id }, data: { status: "ACTIVE" } });
    const block = await f.db.block.create({ data: { blockerId: author!.id, blockedId: third!.id } });
    await assert.rejects(expressExploreInterest(third!.id, target.id), { code: "NOT_FOUND" });
    await f.db.block.delete({ where: { id: block.id } });
    await f.db.user.update({ where: { id: author!.id }, data: { isGuest: true, verifiedStudent: false } });
    await assert.rejects(expressExploreInterest(third!.id, target.id), { code: "NOT_FOUND" });
    assert.equal(await f.db.weeklyIntent.count({ where: { userId: third!.id } }), 0);
  } finally { await f.cleanup(); }
});
