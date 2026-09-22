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

function localTarget(value: string | undefined) {
  if (!value) return undefined;
  const url = new URL(value);
  return ["postgres:", "postgresql:"].includes(url.protocol) &&
    ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) ? value : undefined;
}
const databaseUrl = localTarget(process.env.DATABASE_URL);
const localOnly = { skip: databaseUrl ? false : "requires localhost PostgreSQL" };

test("Layer 3 internal acceptance refuses remote databases", () => {
  assert.equal(localTarget("postgresql://user:password@db.example.invalid/live"), undefined);
  assert.ok(localTarget("postgresql://user:password@127.0.0.1:5433/test"));
});

async function fixture(run: (f: {
  db: PrismaClient; a: string; b: string; outsider: string; connectionId: string;
  planId: string; activityText: string;
}) => Promise<void>) {
  assert.ok(databaseUrl);
  const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
  const ids = ["a", "b", "other"].map((name) => `layer3-${suffix}-${name}`);
  const [a, b, outsider] = ids as [string, string, string];
  const previousFlag = process.env.V2_MEET_AGAIN_ENABLED;
  process.env.V2_MEET_AGAIN_ENABLED = "1";
  try {
    await db.user.createMany({ data: ids.map((id) => ({
      id, username: `test_${id}`, hashedPassword: "local-fixture-only", nickname: id,
      school: "TUM", onboardingComplete: true, verifiedStudent: true,
    })) });
    await db.userLanguage.createMany({ data: ids.map((userId) => ({ userId, tag: "ENGLISH", proficiency: "FLUENT" })) });
    const connection = await db.connection.create({ data: { userAId: a, userBId: b, status: "ACTIVE", replyLimitUnlockedAt: new Date() } });
    const plan = await db.$transaction(async (tx) => {
      const commitment = await tx.planCommitment.create({ data: {
        connectionId: connection.id, participantAId: a, participantBId: b,
        status: "NEGOTIATING",
      } });
      // Isolated historical fixture, not a real event or production pilot sample.
      const historical = await tx.planRequest.create({ data: {
        connectionId: connection.id, commitmentId: commitment.id, revisionKind: "INITIAL",
        proposerUserId: a, receiverUserId: b, planType: "CUSTOM", title: "Local first encounter",
        status: "ACCEPTED", startTime: new Date(Date.now() - 3 * 3_600_000),
        endTime: new Date(Date.now() - 2 * 3_600_000),
      } });
      await tx.planCommitment.update({ where: { id: commitment.id }, data: {
        status: "CONFIRMED", currentAcceptedRevisionId: historical.id, confirmedAt: historical.startTime,
      } });
      return historical;
    });
    await run({ db, a, b, outsider, connectionId: connection.id, planId: plan.id, activityText: `Local coffee ${suffix}` });
  } finally {
    if (previousFlag === undefined) delete process.env.V2_MEET_AGAIN_ENABLED;
    else process.env.V2_MEET_AGAIN_ENABLED = previousFlag;
    await db.user.deleteMany({ where: { id: { in: ids } } });
    await db.$disconnect();
  }
}

async function newIntents(db: PrismaClient, a: string, b: string, activityText: string) {
  const { createWeeklyIntent } = await import("../../lib/v2/weekly-intents");
  const now = new Date();
  const startsAt = new Date(now.getTime() + 60 * 60_000);
  const endsAt = new Date(startsAt.getTime() + 60 * 60_000);
  const input = {
    topic: "COFFEE" as const, activityText, courseId: null,
    timeWindows: [{ startAt: startsAt.toISOString(), endAt: endsAt.toISOString() }],
    timeZone: "Europe/Berlin", note: null,
  };
  const intents = await Promise.all([createWeeklyIntent(a, input), createWeeklyIntent(b, input)]);
  await db.togetherMatchingSession.createMany({ data: [a, b].map((userId) => ({
    userId, startedAt: now, matchingUntil: new Date(now.getTime() + 48 * 3_600_000),
  })) });
  return { intents, startsAt, endsAt };
}

test("two private permissions + new intents → fresh consent → new Plan → both Calendars → second Shared Encounter", localOnly, async () => {
  const plans = await import("../../lib/api/v1/plans-service");
  const matching = await import("../../lib/v2/mutual-opportunities");
  await fixture(async ({ db, a, b, outsider, connectionId, planId, activityText }) => {
    await assert.rejects(plans.recordPlanMeetAgain({ userId: a, planId, value: "YES" }));
    await plans.recordPlanOutcome({ userId: a, planId, value: "OCCURRED" });
    await plans.recordPlanMeetAgain({ userId: a, planId, value: "YES" });
    const firstView = await plans.getPlanRequest({ userId: a, planId });
    const peerView = await plans.getPlanRequest({ userId: b, planId });
    assert.equal(firstView.viewerMeetAgain, "YES");
    assert.equal(firstView.meetAgainAvailable, true);
    assert.equal(peerView.viewerMeetAgain, null);
    assert.equal(peerView.viewerOutcome, null);
    assert.equal(peerView.meetAgainAvailable, false);
    assert.equal("meetAgainPermissions" in peerView, false);
    await assert.rejects(plans.recordPlanMeetAgain({ userId: outsider, planId, value: "YES" }));
    const window = await newIntents(db, a, b, activityText);
    assert.deepEqual(await matching.generateMutualOpportunitiesForUser(a), []);
    await plans.recordPlanOutcome({ userId: b, planId, value: "DID_NOT_OCCUR" });
    assert.equal(await db.sharedEncounter.count({ where: { planId } }), 0);
    await assert.rejects(plans.recordPlanMeetAgain({ userId: b, planId, value: "YES" }));
    await plans.recordPlanOutcome({ userId: b, planId, value: "OCCURRED" });
    assert.equal(await db.sharedEncounter.count({ where: { planId } }), 1);
    assert.deepEqual(await matching.generateMutualOpportunitiesForUser(a), []);
    await plans.recordPlanMeetAgain({ userId: b, planId, value: "YES" });
    await plans.recordPlanMeetAgain({ userId: b, planId, value: "YES" });
    assert.equal(await db.meetAgainPermission.count({ where: { planId } }), 2);
    assert.equal(await db.message.count({ where: { connectionId } }), 0, "permissions do not create a source card or notification");
    assert.equal(await db.mutualOpportunity.count({ where: { userAId: a } }), 0, "permissions do not automatically join matching");

    process.env.V2_MEET_AGAIN_ENABLED = "0";
    assert.deepEqual(await matching.generateMutualOpportunitiesForUser(a), [], "disabled repeats cannot fall back to first-encounter matching");
    process.env.V2_MEET_AGAIN_ENABLED = "1";
    await db.weeklyIntent.update({ where: { id: window.intents[0]!.intent.id }, data: {
      createdAt: new Date(Date.now() - 4 * 3_600_000),
    } });
    assert.deepEqual(await matching.generateMutualOpportunitiesForUser(a), [], "both intents must be new after the encounter");
    await db.weeklyIntent.update({ where: { id: window.intents[0]!.intent.id }, data: { createdAt: new Date() } });

    const created = await matching.generateMutualOpportunitiesForUser(a);
    assert.equal(created.length, 1);
    const opportunityId = created[0]!.opportunityId;
    const persisted = await db.mutualOpportunity.findUniqueOrThrow({ where: { id: opportunityId } });
    assert.equal(persisted.repeatOfPlanId, planId);
    assert.equal(persisted.connectionId, null);
    assert.equal((persisted.contextSnapshot as { isRepeat: boolean }).isRepeat, true);
    const unilateral = await matching.decideMutualOpportunity({ userId: a, opportunityId, decision: "YES" });
    assert.equal(unilateral.opportunity.coordination, null);
    const peerOpportunity = (await matching.listMutualOpportunities(b, false)).opportunities[0]!;
    assert.equal(peerOpportunity.viewerDecision, null);
    assert.equal(peerOpportunity.state, "NEEDS_DECISION");
    assert.equal("repeatOfPlanId" in peerOpportunity, false);
    assert.equal(peerOpportunity.isRepeat, true);
    const mutual = await matching.decideMutualOpportunity({ userId: b, opportunityId, decision: "YES" });
    assert.equal(mutual.opportunity.coordination?.connectionId, connectionId);
    assert.equal(await db.message.count({ where: { connectionId, mutualOpportunityId: opportunityId } }), 1);
    const next = await plans.createDirectPlanRequest({
      userId: a, connectionId, receiverUserId: b, title: activityText, planType: "CUSTOM",
      startTime: window.startsAt.toISOString(), endTime: window.endsAt.toISOString(),
      origin: { kind: "MUTUAL_OPPORTUNITY", id: opportunityId },
    });
    assert.notEqual(next.plan.id, planId);
    assert.equal(next.plan.origin?.id, opportunityId);
    const accepted = await plans.acceptPlanRequest({ userId: b, planId: next.plan.id });
    assert.ok(accepted.commitmentId);
    assert.equal(await db.calendarEntry.count({ where: { planCommitmentId: accepted.commitmentId, projectionStatus: "ACTIVE" } }), 2);
    // Simulate passage of time in this explicitly isolated fixture only.
    await db.planRequest.update({ where: { id: accepted.id }, data: {
      startTime: new Date(Date.now() - 60 * 60_000), endTime: new Date(Date.now() - 30 * 60_000),
    } });
    await plans.recordPlanOutcome({ userId: a, planId: accepted.id, value: "OCCURRED" });
    assert.equal(await db.sharedEncounter.count({ where: { planId: accepted.id } }), 0);
    await plans.recordPlanOutcome({ userId: b, planId: accepted.id, value: "OCCURRED" });
    assert.equal(await db.sharedEncounter.count({ where: { planId: { in: [planId, accepted.id] } } }), 2);
    const { repeatEligibility } = await import("../../lib/plans/repeat-eligibility");
    const latest = await db.$transaction((tx) => repeatEligibility(tx, a, b, new Date()));
    assert.equal(latest.source, null, "older permission cannot override the unanswered latest encounter");
  });
});

test("withdrawal, Outcome editing, feature kill switch and Block retain private safe behavior", localOnly, async () => {
  const plans = await import("../../lib/api/v1/plans-service");
  const matching = await import("../../lib/v2/mutual-opportunities");
  await fixture(async ({ db, a, b, planId, activityText, connectionId }) => {
    for (const userId of [a, b]) {
      await plans.recordPlanOutcome({ userId, planId, value: "OCCURRED" });
      await plans.recordPlanMeetAgain({ userId, planId, value: "YES" });
    }
    await newIntents(db, a, b, activityText);
    const [created] = await matching.generateMutualOpportunitiesForUser(a);
    assert.ok(created);
    await matching.decideMutualOpportunity({ userId: a, opportunityId: created.opportunityId, decision: "YES" });
    process.env.V2_MEET_AGAIN_ENABLED = "0";
    await assert.rejects(matching.decideMutualOpportunity({ userId: b, opportunityId: created.opportunityId, decision: "YES" }));
    await plans.recordPlanMeetAgain({ userId: b, planId, value: "WITHDRAWN" });
    assert.equal((await db.mutualOpportunity.findUniqueOrThrow({ where: { id: created.opportunityId } })).status, "UNAVAILABLE");
    assert.equal((await plans.getPlanRequest({ userId: a, planId })).viewerMeetAgain, "YES");
    assert.equal(await db.sharedEncounter.count({ where: { planId } }), 1);
    process.env.V2_MEET_AGAIN_ENABLED = "1";
    await assert.rejects(matching.decideMutualOpportunity({ userId: b, opportunityId: created.opportunityId, decision: "YES" }));
    await plans.recordPlanOutcome({ userId: a, planId, value: "PREFER_NOT_TO_SAY" });
    assert.equal((await plans.getPlanRequest({ userId: a, planId })).viewerMeetAgain, "WITHDRAWN");
    assert.equal(await db.sharedEncounter.count({ where: { planId } }), 0);
    await plans.recordPlanOutcome({ userId: a, planId, value: "OCCURRED" });
    assert.equal((await plans.getPlanRequest({ userId: a, planId })).viewerMeetAgain, "WITHDRAWN");
    await db.block.create({ data: { blockerId: a, blockedId: b, connectionId } });
    await assert.rejects(plans.recordPlanMeetAgain({ userId: b, planId, value: "YES" }));
    assert.deepEqual(await matching.generateMutualOpportunitiesForUser(a), []);
  });
});

const httpBase = process.env.LAYER3_LOCAL_HTTP_URL;
test("local HTTP route authenticates, keeps permission private and replays idempotently", {
  skip: databaseUrl && httpBase ? false : "requires localhost database and LAYER3_LOCAL_HTTP_URL",
  timeout: 120_000,
}, async () => {
  assert.ok(httpBase);
  assert.equal(new URL(httpBase).protocol, "http:");
  assert.ok(["127.0.0.1", "localhost", "[::1]"].includes(new URL(httpBase).hostname));
  const { signAccessToken } = await import("../../lib/auth/access-token");
  await fixture(async ({ db, a, b, outsider, planId }) => {
    const endpoint = `${httpBase}/api/v1/plans/${planId}`;
    const post = (token: string | null, suffix: string, value: string, key = randomUUID()) => fetch(`${endpoint}/${suffix}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json", "Idempotency-Key": key,
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ value }),
    });
    assert.equal((await post(null, "meet-again", "YES")).status, 401);
    const tokenA = (await signAccessToken(a)).token;
    const tokenB = (await signAccessToken(b)).token;
    const tokenOther = (await signAccessToken(outsider)).token;
    assert.equal((await post(tokenA, "outcome", "OCCURRED")).status, 200);
    const key = randomUUID();
    const first = await post(tokenA, "meet-again", "YES", key);
    assert.equal(first.status, 200);
    const saved = await first.json();
    assert.deepEqual(Object.keys(saved.data.meetAgain).sort(), ["planId", "updatedAt", "value"]);
    const replay = await post(tokenA, "meet-again", "YES", key);
    assert.equal(replay.status, 200);
    assert.deepEqual((await replay.json()).data, saved.data);
    assert.equal((await post(tokenA, "meet-again", "NO", key)).status, 409);
    assert.equal((await post(tokenOther, "meet-again", "YES")).status, 403);
    const peer = await fetch(endpoint, { headers: { Authorization: `Bearer ${tokenB}` } });
    assert.equal(peer.status, 200);
    const peerPlan = (await peer.json()).data.plan;
    assert.equal(peerPlan.viewerMeetAgain, null);
    assert.equal(peerPlan.meetAgainAvailable, false);
    assert.equal("meetAgainPermissions" in peerPlan, false);
    assert.equal((await post(tokenA, "meet-again", "WITHDRAWN")).status, 200);
    assert.equal((await db.meetAgainPermission.findUniqueOrThrow({
      where: { planId_userId: { planId, userId: a } },
    })).value, "WITHDRAWN");
    await db.apiIdempotencyRecord.deleteMany({ where: { scope: { in: [`plan-meet-again:${planId}`, `plan-outcome:${planId}`] } } });
  });
});
