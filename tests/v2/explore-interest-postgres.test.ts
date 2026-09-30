import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import Module from "node:module";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { PrismaClient } from "@prisma/client";

const resolver = Module as typeof Module & { _resolveFilename: (request: string, ...args: unknown[]) => string };
const originalResolve = resolver._resolveFilename;
resolver._resolveFilename = function (request, ...args) {
  if (request === "next/server") return fileURLToPath(new URL("./next-server-after-test-stub.cjs", import.meta.url));
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

test("Explore draft and bookmark stay private, do not reserve supply, and only a written reply opens chat", { skip: !local }, async () => {
  const f = await fixture();
  const { prepareExploreOpportunity, listMutualOpportunities, listOpportunityMessageRequests, interactWithOpportunity,
    decideMutualOpportunity, generateMutualOpportunitiesForUser } = await import("../../lib/v2/mutual-opportunities");
  const { listExploreIntents } = await import("../../lib/v2/explore-intents");
  const { loadCurrentWeeklyIntent } = await import("../../lib/v2/weekly-intents");
  try {
    const [author, viewer, third] = f.users;
    const target = await f.intention(author!.id, true);
    const results = await Promise.all([prepareExploreOpportunity(viewer!.id, target.id), prepareExploreOpportunity(viewer!.id, target.id)]);
    const own = results[0]!;
    assert.equal(own.id, results[1]!.id);
    assert.equal(own.state, "NEEDS_DECISION"); assert.equal(own.viewerDecision, null);
    assert.equal(own.coordination, null); assert.equal(own.isBookmarked, false); assert.equal(own.messageRequest, null);
    assert.equal((await f.db.mutualOpportunity.findUniqueOrThrow({ where: { id: own.id } })).status, "DRAFT");
    const act = (userId: string, action: "BOOKMARK" | "UNBOOKMARK" | "SEND" | "REPLY", body?: string) =>
      interactWithOpportunity({ userId, opportunityId: own.id, action, body });
    assert.equal((await listMutualOpportunities(author!.id, false)).opportunities.length, 0);
    assert.equal((await listOpportunityMessageRequests(author!.id)).length, 0);
    await assert.rejects(act(author!.id, "BOOKMARK"), { code: "NOT_FOUND" });
    assert.equal((await act(viewer!.id, "BOOKMARK")).isBookmarked, true);
    assert.equal((await listMutualOpportunities(author!.id, false)).opportunities.length, 0);
    assert.equal((await prepareExploreOpportunity(viewer!.id, target.id)).isBookmarked, true);
    assert.equal((await listExploreIntents(viewer!.id, 5)).intents.some(i => i.id === target.id), false);
    assert.equal((await listMutualOpportunities(viewer!.id, false)).opportunities.find(i => i.id === own.id)?.isBookmarked, true);
    assert.equal((await loadCurrentWeeklyIntent(viewer!.id)).intents.length, 0);
    const backing = await f.db.weeklyIntent.findMany({ where: { userId: viewer!.id } });
    assert.equal(backing.length, 1); assert.equal(backing[0]!.exploreResponseToId, target.id);
    assert.equal(backing[0]!.automaticMatching, false); assert.equal(backing[0]!.exploreVisible, false);
    assert.deepEqual(backing[0]!.timePreference, { kind: "UNDECIDED" });
    assert.deepEqual(await generateMutualOpportunitiesForUser(viewer!.id), []);
    await f.intention(third!.id, true);
    assert.equal((await generateMutualOpportunitiesForUser(third!.id)).length, 1, "private saving must not reserve the author's intention");
    assert.equal(await f.db.mutualOpportunityDecision.count({ where: { opportunityId: own.id } }), 0);
    assert.equal((await act(viewer!.id, "UNBOOKMARK")).isBookmarked, false);
    const restored = (await listExploreIntents(viewer!.id, 5)).intents.find(i => i.id === target.id)!;
    assert.equal(restored.interest?.opportunityId, own.id);
    const sent = await act(viewer!.id, "SEND", "Hi, can I join you?");
    assert.equal(sent.isBookmarked, false); assert.equal(sent.coordination, null);
    const requests = await listOpportunityMessageRequests(author!.id);
    assert.equal(requests.length, 1); assert.equal(requests[0]!.messageRequest?.body, "Hi, can I join you?");
    assert.equal(requests[0]!.peer.displayName, viewer!.username);
    await assert.rejects(act(viewer!.id, "SEND", "Again"), { code: "DECISION_FINAL" });
    await assert.rejects(decideMutualOpportunity({ userId: author!.id, opportunityId: own.id, decision: "YES" }), { code: "DECISION_FINAL" });
    const mutual = await act(author!.id, "REPLY", "Yes, see you there!");
    assert.equal(mutual.state, "READY_TO_COORDINATE"); assert(mutual.coordination?.connectionId);
    assert.equal((await prepareExploreOpportunity(viewer!.id, target.id)).coordination?.connectionId, mutual.coordination.connectionId);
    const messages = await f.db.message.findMany({ where: { connectionId: mutual.coordination.connectionId }, orderBy: { createdAt: "asc" } });
    assert.deepEqual(messages.map(m => m.body), ["", "Hi, can I join you?", "Yes, see you there!"]);
    assert.equal((await listExploreIntents(viewer!.id)).intents.some(i => i.id === target.id), false);
  } finally { await f.cleanup(); }
});

test("Explore preparation reuses a recommendation without a YES decision or message", { skip: !local }, async () => {
  const f = await fixture();
  const { prepareExploreOpportunity, generateMutualOpportunitiesForUser } = await import("../../lib/v2/mutual-opportunities");
  try {
    const [author, viewer] = f.users;
    const target = await f.intention(author!.id, true); await f.intention(viewer!.id, true);
    const matches = await generateMutualOpportunitiesForUser(viewer!.id); assert.equal(matches.length, 1);
    const id = matches[0]!.opportunityId;
    const result = await prepareExploreOpportunity(viewer!.id, target.id);
    assert.equal(result.id, id); assert.equal(result.state, "NEEDS_DECISION");
    assert.equal(result.viewerDecision, null); assert.equal(result.messageRequest, null);
    assert.equal(await f.db.weeklyIntent.count({ where: { userId: viewer!.id } }), 1);
    assert.equal(await f.db.mutualOpportunity.count({ where: { OR: [{ userAId: viewer!.id }, { userBId: viewer!.id }] } }), 1);
  } finally { await f.cleanup(); }
});

test("Drafts recheck public visibility and blocks before sending; removing a saved unavailable intention remains possible", { skip: !local }, async () => {
  const f = await fixture();
  const { prepareExploreOpportunity, interactWithOpportunity } = await import("../../lib/v2/mutual-opportunities");
  try {
    const [author, viewer, third] = f.users;
    const target = await f.intention(author!.id);
    const own = await prepareExploreOpportunity(viewer!.id, target.id);
    await interactWithOpportunity({ userId: viewer!.id, opportunityId: own.id, action: "BOOKMARK" });
    await f.db.weeklyIntent.update({ where: { id: target.id }, data: { exploreVisible: false } });
    await assert.rejects(prepareExploreOpportunity(third!.id, target.id), { code: "NOT_FOUND" });
    await assert.rejects(interactWithOpportunity({ userId: viewer!.id, opportunityId: own.id, action: "SEND", body: "Hi" }), { code: "NO_LONGER_AVAILABLE" });
    await f.db.weeklyIntent.update({ where: { id: target.id }, data: { exploreVisible: true, status: "PAUSED" } });
    await assert.rejects(prepareExploreOpportunity(third!.id, target.id), { code: "NOT_FOUND" });
    await f.db.weeklyIntent.update({ where: { id: target.id }, data: { status: "ACTIVE" } });
    const block = await f.db.block.create({ data: { blockerId: author!.id, blockedId: third!.id } });
    await assert.rejects(prepareExploreOpportunity(third!.id, target.id), { code: "NOT_FOUND" });
    await f.db.block.delete({ where: { id: block.id } });
    await f.db.user.update({ where: { id: author!.id }, data: { isGuest: true, verifiedStudent: false } });
    await assert.rejects(prepareExploreOpportunity(third!.id, target.id), { code: "NOT_FOUND" });
    assert.equal(await f.db.weeklyIntent.count({ where: { userId: third!.id } }), 0);
    assert.equal((await interactWithOpportunity({ userId: viewer!.id, opportunityId: own.id, action: "UNBOOKMARK" })).isBookmarked, false);
    assert.equal(await f.db.mutualOpportunityMessageRequest.count({ where: { opportunityId: own.id } }), 0);
  } finally { await f.cleanup(); }
});


test("Saved and contacted exploration cards leave the feed, fill the next slot, and keep saved/chat access", { skip: !local }, async () => {
  const f = await fixture();
  const { listExploreIntents } = await import("../../lib/v2/explore-intents");
  const { prepareExploreOpportunity, interactWithOpportunity, listMutualOpportunities,
    listOpportunityMessageRequests, getOpportunityConversation } = await import("../../lib/v2/mutual-opportunities");
  try {
    const [author, viewer] = f.users;
    await f.db.user.updateMany({ where: { id: { in: f.users.map(u => u.id) } }, data: { school: `Feed-${viewer!.id}` } });
    const intents = [];
    for (let i = 0; i < 4; i++) {
      const intent = await f.intention(author!.id);
      await f.db.weeklyIntent.update({ where: { id: intent.id }, data: { createdAt: new Date(Date.now() - i * 60000) } });
      intents.push(intent);
    }
    const target = intents[0]!;
    const feed = () => listExploreIntents(viewer!.id, 3);
    assert.deepEqual((await feed()).intents.map(i => i.id), intents.slice(0, 3).map(i => i.id));
    const opportunity = await prepareExploreOpportunity(viewer!.id, target.id);
    const act = (userId: string, action: "BOOKMARK" | "SEND" | "REPLY", body?: string) =>
      interactWithOpportunity({ userId, opportunityId: opportunity.id, action, body });
    await act(viewer!.id, "BOOKMARK");
    assert.deepEqual((await feed()).intents.map(i => i.id), intents.slice(1).map(i => i.id));
    await act(viewer!.id, "SEND", "Hi, can I join?");
    assert.deepEqual((await feed()).intents.map(i => i.id), intents.slice(1).map(i => i.id));
    assert.equal((await listMutualOpportunities(viewer!.id, false)).opportunities.find(i => i.id === opportunity.id)?.isBookmarked, true);
    assert.equal((await listOpportunityMessageRequests(viewer!.id)).some(i => i.id === opportunity.id), true);
    const reply = await act(author!.id, "REPLY", "Yes, let's meet!");
    assert.equal((await feed()).intents.some(i => i.id === target.id), false);
    assert.equal((await getOpportunityConversation(viewer!.id, opportunity.id)).coordination?.connectionId, reply.coordination?.connectionId);
  } finally { await f.cleanup(); }
});

test("Recommendation and bookmark badges use current membership, including expiry", { skip: !local }, async () => {
  const f = await fixture();
  const { prepareExploreOpportunity, interactWithOpportunity, listMutualOpportunities } = await import("../../lib/v2/mutual-opportunities");
  const { listExploreIntents } = await import("../../lib/v2/explore-intents");
  try {
    const [author, viewer] = f.users;
    const intent = await f.intention(author!.id);
    await f.db.userMembership.create({ data: { userId: author!.id, plusExpiresAt: new Date(Date.now() + 86400000) } });
    assert.equal((await listExploreIntents(viewer!.id)).intents.find(row => row.id === intent.id)?.isPlus, true);
    const opportunity = await prepareExploreOpportunity(viewer!.id, intent.id);
    assert.equal(opportunity.peer.isPlus, true);
    assert.equal("membership" in opportunity.peer, false);
    assert.equal("plusExpiresAt" in opportunity.peer, false);
    await interactWithOpportunity({ userId: viewer!.id, opportunityId: opportunity.id, action: "BOOKMARK" });
    assert.equal((await listMutualOpportunities(viewer!.id, false)).opportunities.find(row => row.id === opportunity.id)?.peer.isPlus, true);
    await f.db.userMembership.update({ where: { userId: author!.id }, data: { plusExpiresAt: new Date(0) } });
    assert.equal((await listMutualOpportunities(viewer!.id, false)).opportunities.find(row => row.id === opportunity.id)?.peer.isPlus, false);
  } finally { await f.cleanup(); }
});

test("Expired intentions retain history and bookmarks; republishing creates independent public supply", { skip: !local }, async () => {
  const f = await fixture();
  const { prepareExploreOpportunity, interactWithOpportunity, listMutualOpportunities } = await import("../../lib/v2/mutual-opportunities");
  const { loadCurrentWeeklyIntent, createWeeklyIntent, patchWeeklyIntent } = await import("../../lib/v2/weekly-intents");
  const { listExploreIntents } = await import("../../lib/v2/explore-intents");
  try {
    const [author, viewer] = f.users;
    const old = await f.intention(author!.id);
    const saved = await prepareExploreOpportunity(viewer!.id, old.id);
    await interactWithOpportunity({ userId: viewer!.id, opportunityId: saved.id, action: "BOOKMARK" });
    await f.db.weeklyIntent.update({ where: { id: old.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    const history = await loadCurrentWeeklyIntent(author!.id);
    assert.equal(history.intents.length, 0);
    assert.equal(history.expiredIntents[0]?.id, old.id);
    assert.equal(history.expiredIntents[0]?.status, "EXPIRED");
    assert.equal((await listExploreIntents(viewer!.id)).intents.some(i => i.id === old.id), false);
    const bookmarked = (await listMutualOpportunities(viewer!.id, false)).opportunities.find(i => i.id === saved.id)!;
    assert.equal(bookmarked.isBookmarked, true);
    assert.equal(bookmarked.isExpired, true);
    assert.equal(bookmarked.peerIntention?.activity.activityText, old.activityText);
    await assert.rejects(interactWithOpportunity({ userId: viewer!.id, opportunityId: saved.id, action: "SEND", body: "Too late" }));
    const startAt = new Date(Date.now() + 86400000).toISOString();
    const endAt = new Date(Date.now() + 90000000).toISOString();
    const fresh = (await createWeeklyIntent(author!.id, {
      topic: "COFFEE", activityText: old.activityText!, timeWindows: [{ startAt, endAt }],
      timePreference: { kind: "EXACT" }, timeZone: "Europe/Berlin", note: "Coffee again",
      automaticMatching: true, exploreVisible: true,
    })).intent;
    assert.notEqual(fresh.id, old.id);
    assert.equal(fresh.expiresAt, endAt);
    assert.equal(fresh.exploreVisible, true);
    const next = await prepareExploreOpportunity(viewer!.id, fresh.id);
    assert.notEqual(next.id, saved.id);
    assert.equal(next.isBookmarked, false);
    assert.equal(next.messageRequest, null);
    const collection = await loadCurrentWeeklyIntent(author!.id);
    assert.equal(collection.intents[0]?.id, fresh.id);
    assert.equal(collection.expiredIntents[0]?.id, old.id);
    const movedStart = new Date(Date.parse(startAt) + 86400000).toISOString();
    const movedEnd = new Date(Date.parse(endAt) + 86400000).toISOString();
    const edited = await patchWeeklyIntent(author!.id, fresh.id, { action: "EDIT", expectedVersion: fresh.version,
      timeWindows: [{ startAt: movedStart, endAt: movedEnd }] });
    assert.equal(edited.intent.expiresAt, movedEnd, "Editing time updates the deadline too");
    // The deadline takes effect without deleting either record.
    const later = await loadCurrentWeeklyIntent(author!.id, new Date(Date.parse(movedEnd) + 1));
    assert.equal(later.intents.length, 0);
    assert.equal(later.expiredIntents.length, 2);
  } finally { await f.cleanup(); }
});
