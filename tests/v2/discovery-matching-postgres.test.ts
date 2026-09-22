import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import Module from "node:module";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { PrismaClient } from "@prisma/client";

const resolver = Module as typeof Module & { _resolveFilename: (...args: unknown[]) => string };
const originalResolve = resolver._resolveFilename;
resolver._resolveFilename = function (request, ...args) {
  if (request === "server-only") return fileURLToPath(new URL("./server-only-test-stub.cjs", import.meta.url));
  if (request === "next/server") return fileURLToPath(new URL("./next-server-after-test-stub.cjs", import.meta.url));
  return originalResolve.call(this, request, ...args);
};
const url = process.env.DATABASE_URL;
const local = url && ["localhost", "127.0.0.1", "[::1]"].includes(new URL(url).hostname);
const localOnly = { skip: local ? false : "requires localhost PostgreSQL" };
async function fixture(run: (f: { db: PrismaClient; a: string; b: string; c: string }) => Promise<void>) {
  assert.ok(local);
  const db = new PrismaClient({ datasourceUrl: url });
  const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
  const [a, b, c] = ["a", "b", "c"].map(letter => `discovery-${suffix}-${letter}`) as [string, string, string];
  const flags = ["V2_DISCOVERY_MATCHING_ENABLED", "V2_WEEKLY_INTENT_ENABLED", "V2_MUTUAL_OPPORTUNITY_ENABLED", "V2_AUTOMATIC_MATCHING_ENABLED", "V2_FLEXIBLE_TIMING_ENABLED", "V2_MEET_AGAIN_ENABLED"];
  const previous = flags.map(key => process.env[key]);
  flags.forEach(key => { process.env[key] = "1"; });
  try {
    await db.user.createMany({ data: [a, b, c].map(id => ({ id, username: id, hashedPassword: "local-fixture-only",
      nickname: id === a ? "Local A" : id === b ? "Local B" : "Local C", school: id === b ? "LMU" : "TUM",
      onboardingComplete: true, verifiedStudent: true })) });
    await db.userLanguage.createMany({ data: [a, b, c].map(userId => ({ userId, tag: userId === b ? "CHINESE" : "ENGLISH", proficiency: "FLUENT" })) });
    await run({ db, a, b, c });
  } finally {
    flags.forEach((key, index) => { if (previous[index] === undefined) delete process.env[key]; else process.env[key] = previous[index]; });
    await db.user.deleteMany({ where: { id: { in: [a, b, c] } } });
    await db.$disconnect();
  }
}
function input(day = 1) {
  const start = new Date(Date.now() + day * 86400_000);
  return { topic: "COFFEE" as const, activityText: "Coffee", automaticMatching: true as const,
    timeZone: "Europe/Berlin", timePreference: { kind: "EXACT" as const },
    timeWindows: [{ startAt: start.toISOString(), endAt: new Date(start.getTime() + 3600_000).toISOString() }] };
}
async function history(db: PrismaClient, a: string, b: string) {
  const connection = await db.connection.create({ data: { userAId: a, userBId: b, replyLimitUnlockedAt: new Date() } });
  return db.planRequest.create({ data: {
    connectionId: connection.id, proposerUserId: a, receiverUserId: b,
    status: "ACCEPTED", title: "Local historical fixture", planType: "CUSTOM",
    startTime: new Date(Date.now() - 3 * 3600_000), endTime: new Date(Date.now() - 2 * 3600_000),
  } });
}

test("zero-relevance publication with unanswered history reaches chat, a new Plan and both Calendars", localOnly, async () => {
  const { createWeeklyIntent } = await import("../../lib/v2/weekly-intents");
  const matching = await import("../../lib/v2/mutual-opportunities");
  const plans = await import("../../lib/api/v1/plans-service");
  await fixture(async ({ db, a, b }) => {
    const old = await history(db, a, b);
    await createWeeklyIntent(a, input());
    assert.equal((await matching.listMutualOpportunities(a, false)).opportunities.length, 0);
    await createWeeklyIntent(b, { ...input(2), topic: "SPORTS", activityText: undefined, sportTag: "BASKETBALL" });
    const card = (await matching.listMutualOpportunities(a, false)).opportunities[0]!;
    assert.ok(card, "second publication must immediately produce a discovery");
    assert.equal(card.matchFit?.score, 0);
    assert.equal(card.startsAt, null);
    assert.equal(card.endsAt, null);
    assert.equal(card.isRepeat, false, "unanswered history is not a fabricated repeat encounter");
    assert.equal(await db.planOutcomeResponse.count({ where: { planId: old.id } }), 0);
    assert.equal(await db.sharedEncounter.count({ where: { planId: old.id } }), 0);
    assert.equal(await db.togetherMatchingSession.count({ where: { userId: { in: [a, b] } } }), 0);
    assert.deepEqual(await matching.generateMutualOpportunitiesForUser(a), []);
    assert.equal((await matching.decideMutualOpportunity({ userId: a, opportunityId: card.id, decision: "YES" })).opportunity.coordination, null);
    const peer = (await matching.listMutualOpportunities(b, false)).opportunities[0]!;
    assert.equal(peer.viewerDecision, null);
    assert.ok(peer.matchFit?.policyVersion === "DISCOVERY_FIT_V1");
    assert.equal(peer.matchFit.viewerActivity.topic, "SPORTS");
    assert.equal(peer.matchFit.peerActivity.topic, "COFFEE");
    const mutual = await matching.decideMutualOpportunity({ userId: b, opportunityId: card.id, decision: "YES" });
    const connectionId = mutual.opportunity.coordination?.connectionId;
    assert.ok(connectionId);
    const message = await db.message.findFirstOrThrow({ where: { mutualOpportunityId: card.id } });
    assert.equal(message.type, "MUTUAL_OPPORTUNITY_CARD");
    const snapshot = await db.mutualOpportunity.findUniqueOrThrow({ where: { id: card.id } });
    assert.equal((snapshot.contextSnapshot as { title: string }).title, "Do something together");
    const time = input(3).timeWindows[0]!;
    const created = await plans.createDirectPlanRequest({ userId: a, receiverUserId: b, connectionId,
      title: "Agreed new activity", startTime: time.startAt, endTime: time.endAt, planType: "CUSTOM",
      origin: { kind: "MUTUAL_OPPORTUNITY", id: card.id } });
    assert.equal(created.plan.status, "PENDING");
    const accepted = await plans.acceptPlanRequest({ userId: b, planId: created.plan.id });
    assert.ok(accepted.commitmentId);
    assert.equal(await db.calendarEntry.count({ where: { planCommitmentId: accepted.commitmentId, projectionStatus: "ACTIVE" } }), 2);
    assert.equal(await db.planOutcomeResponse.count({ where: { planId: old.id } }), 0);
  });
});

test("rank all of the owner's intentions together: a newer exact match beats an older low-relevance intention", localOnly, async () => {
  const { createWeeklyIntent } = await import("../../lib/v2/weekly-intents");
  const matching = await import("../../lib/v2/mutual-opportunities");
  await fixture(async ({ a, b, c }) => {
    process.env.V2_AUTOMATIC_MATCHING_ENABLED = "0";
    const exact = input();
    await createWeeklyIntent(b, { ...input(3), topic: "SPORTS", activityText: undefined, sportTag: "BADMINTON" });
    await createWeeklyIntent(a, { ...input(2), topic: "SPORTS", activityText: undefined, sportTag: "BASKETBALL" });
    const best = await createWeeklyIntent(a, exact);
    await createWeeklyIntent(c, exact);
    process.env.V2_AUTOMATIC_MATCHING_ENABLED = "1";
    await matching.generateMutualOpportunitiesForUser(a);
    const cards = (await matching.listMutualOpportunities(a, false)).opportunities;
    const card = cards[0]!;
    assert.equal(card.viewerIntentId, best.intent.id);
    assert.equal(card.matchFit?.score, 100);
    assert.equal(cards.length, 2);
    assert.equal(cards[1]?.peer.displayName, "Local B");
    assert.equal(cards[1]?.matchFit?.score, 10, "the less-relevant person remains discoverable, after the exact match");
  });
});

test("privacy opt-out, pause, block and explicit refusal remain hard stops; rollout off retains old eligibility", localOnly, async () => {
  const { createWeeklyIntent, patchWeeklyIntent } = await import("../../lib/v2/weekly-intents");
  const matching = await import("../../lib/v2/mutual-opportunities");
  for (const boundary of ["privacy", "pause", "block", "refusal", "off"]) {
    await fixture(async ({ db, a, b }) => {
      if (boundary === "privacy") await db.user.update({ where: { id: b }, data: { hideFromDiscovery: true } });
      if (boundary === "block") await db.block.create({ data: { blockerId: b, blockedId: a } });
      if (boundary === "refusal") {
        const old = await history(db, a, b);
        await db.meetAgainPermission.create({ data: { planId: old.id, userId: b, value: "NO" } });
      }
      if (boundary === "off") process.env.V2_DISCOVERY_MATCHING_ENABLED = "0";
      const first = await createWeeklyIntent(a, input());
      if (boundary === "pause") await patchWeeklyIntent(a, first.intent.id, { action: "PAUSE", expectedVersion: first.intent.version });
      await createWeeklyIntent(b, input(2));
      assert.equal((await matching.listMutualOpportunities(a, true)).opportunities.length, 0, boundary);
    });
  }
});

test("ignore advances to another participant and a later private refusal invalidates pending discovery", localOnly, async () => {
  const { createWeeklyIntent } = await import("../../lib/v2/weekly-intents");
  const matching = await import("../../lib/v2/mutual-opportunities");
  const plans = await import("../../lib/api/v1/plans-service");
  await fixture(async ({ db, a, b, c }) => {
    const old = await history(db, a, b);
    await createWeeklyIntent(a, input());
    await createWeeklyIntent(b, input(2));
    const first = (await matching.listMutualOpportunities(a, false)).opportunities[0]!;
    assert.ok(first);
    await plans.recordPlanOutcome({ userId: b, planId: old.id, value: "OCCURRED" });
    await plans.recordPlanMeetAgain({ userId: b, planId: old.id, value: "NO" });
    assert.equal((await matching.listMutualOpportunities(a, false)).opportunities.length, 0);
    await assert.rejects(matching.decideMutualOpportunity({ userId: a, opportunityId: first.id, decision: "YES" }));
    await createWeeklyIntent(c, input());
    const next = (await matching.listMutualOpportunities(a, false)).opportunities[0]!;
    assert.equal(next.peer.displayName, "Local C");
    await matching.decideMutualOpportunity({ userId: a, opportunityId: next.id, decision: "NO" });
    await createWeeklyIntent(c, input(3));
    assert.equal((await matching.listMutualOpportunities(a, true)).opportunities.length, 0, "republishing does not override Ignore");
  });
});
