/** Local-only test fixture and database assertions for SocialLiveUITests.testClosedLoop*. */
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const url = new URL(process.env.DATABASE_URL ?? "http://invalid");
assert(["localhost", "127.0.0.1"].includes(url.hostname));
assert(["/sideseat_new_intent_20261003", "/sideseat_return_flow_20261003", "/sideseat_return_flow_retry_20261003"].includes(url.pathname), "Use a dedicated closed-loop database");
const db = new PrismaClient();
const names = ["loopqa_a", "loopqa_b", "loopqa_c"];
const mode = process.argv[2];

async function confirmedPlan() {
  const plan = await db.planRequest.findFirstOrThrow({ where: { title: "[loop-qa] Campus coffee", status: "ACCEPTED" } });
  assert.equal(await db.planRequest.count(), 1, "Exactly one proposal, no duplicates");
  assert.equal(plan.originKind, "MUTUAL_OPPORTUNITY");
  assert(plan.commitmentId && plan.originId);
  const commitment = await db.planCommitment.findUniqueOrThrow({ where: { id: plan.commitmentId } });
  assert.equal(commitment.status, "CONFIRMED");
  const entries = await db.calendarEntry.findMany({ where: { planCommitmentId: plan.commitmentId } });
  assert.equal(entries.length, 2);
  assert.deepEqual(new Set(entries.map(e => e.userId)), new Set([plan.proposerUserId, plan.receiverUserId]));
  for (const e of entries) assert.equal(e.projectionStatus, "ACTIVE");
  const opportunity = await db.mutualOpportunity.findUniqueOrThrow({ where: { id: plan.originId } });
  const intentions = await db.weeklyIntent.findMany({ where: { id: { in: [opportunity.intentAId, opportunity.intentBId] } } });
  assert.equal(intentions.length, 2);
  assert(intentions.every(i => i.status === "ENDED" && i.activityText === "[loop-qa] Campus coffee"), "Accepted plan consumes its source intentions without rewriting them");
  assert.equal(await db.mutualOpportunityBookmark.count(), 1);
  const messages = await db.message.findMany({ where: { connectionId: plan.connectionId } });
  for (const body of ["[loop-qa] Hello, may I join?", "[loop-qa] Yes, let's meet!"]) {
    assert.equal(messages.filter(m => m.body === body).length, 1, "Greeting/reply preserved exactly once");
  }
  return { plan, entries, opportunity };
}

async function main() {
try {
  if (mode === "seed") {
    assert.equal(await db.user.count(), 0, "Seed only an empty isolated database");
    const password = process.env.SIDESEAT_QA_PASSWORD;
    assert(password, "Set the isolated UI fixture password via SIDESEAT_QA_PASSWORD");
    const hashedPassword = await bcrypt.hash(password, 10);
    for (let i = 0; i < names.length; i++) {
      await db.user.create({ data: { username: names[i]!, nickname: ["Loop Alex", "Loop Mia", "Loop Lee"][i]!,
        nicknameKey: ["loop alex", "loop mia", "loop lee"][i]!, hashedPassword, school: "TUM", avatarUrl: `p0${i + 2}`,
        studentStatus: "CURRENT_STUDENT", degreeLevel: "BACHELOR", major: "Informatics", semester: 2,
        onboardingComplete: true, verifiedStudent: true, studentVerificationStatus: "VERIFIED",
        productTutorialDismissedAt: new Date(), userLanguages: { create: { tag: "ENGLISH", proficiency: "FLUENT" } } } });
    }
    console.log("Seeded three isolated test users; no intentions, connections or plans.");
  } else if (mode === "check-plan" || mode === "advance") {
    const { plan, entries } = await confirmedPlan();
    assert.equal(await db.weeklyIntent.count(), 2, "Opening/canceling drafts adds no intention");
    assert.equal(await db.mutualOpportunity.count(), 1);
    assert.equal(await db.connection.count(), 1);
    assert.equal(await db.calendarEntry.count(), 2);
    assert.equal(await db.planOutcomeResponse.count(), 0);
    assert.equal(await db.sharedEncounter.count(), 0);
    if (mode === "advance") {
      // Only test time is compressed. Neither outcome nor conversation is synthesized.
      const startTime = new Date(Date.now() - 90 * 60_000);
      const endTime = new Date(Date.now() - 30 * 60_000);
      await db.$transaction(async tx => {
        await tx.planRequest.update({ where: { id: plan.id }, data: { startTime, endTime } });
        await tx.calendarEntry.updateMany({ where: { planCommitmentId: plan.commitmentId }, data: { startAt: startTime, endAt: endTime } });
      });
    }
    console.log(JSON.stringify({ checked: mode, planId: plan.id, connectionId: plan.connectionId,
      intentions: 2, opportunities: 1, connections: 1, plans: 1, calendarEntries: 2, outcomes: 0,
      calendarOwners: entries.map(e => e.userId) }, null, 2));
  } else if (mode === "check-peer-ready") {
    await confirmedPlan();
    const c = await db.user.findUniqueOrThrow({ where: { username: names[2] } });
    const active = await db.weeklyIntent.findMany({ where: { status: "ACTIVE" } });
    assert.equal(active.length, 1);
    assert.equal(active[0]!.userId, c.id);
    assert.equal(active[0]!.activityText, "[new-loop] Library coffee");
    assert.equal(await db.weeklyIntent.count(), 3);
    assert.equal(await db.mutualOpportunity.count(), 1);
    assert.equal(await db.connection.count(), 1);
    assert.equal(await db.planOutcomeResponse.count(), 2);
    console.log(JSON.stringify({ result: "PASS", resume: "Alex has not published; only Lee's UI-created intention is active", intentions: 3, opportunities: 1, plans: 1, calendarEntries: 2 }, null, 2));
  } else if (mode === "verify" || mode === "check-return") {
    const { plan } = await confirmedPlan();
    const outcomes = await db.planOutcomeResponse.findMany({ where: { planId: plan.id } });
    assert.equal(outcomes.length, 2);
    assert(outcomes.every(o => o.value === "OCCURRED"));
    assert.equal(await db.sharedEncounter.count({ where: { planId: plan.id } }), 1);
    const connection = await db.connection.findUniqueOrThrow({ where: { id: plan.connectionId } });
    assert.equal(connection.status, "ACTIVE");
    for (const content of ["[loop-qa] Thanks for today!", "[loop-qa] Great to meet you!"]) {
      assert.equal(await db.message.count({ where: { connectionId: plan.connectionId, body: content } }), 1);
    }
    if (mode === "check-return") {
      assert.equal(await db.weeklyIntent.count(), 2, "Canceled drafts must not create intentions");
      assert.equal(await db.mutualOpportunity.count(), 1, "Drafts must not start another matching round");
      assert.equal(await db.connection.count(), 1);
      assert.equal(await db.planRequest.count(), 1);
      assert.equal(await db.calendarEntry.count(), 2);
      console.log(JSON.stringify({ result: "PASS", mode, bilateralOutcomes: 2, sharedEncounters: 1,
        originalEndedIntents: 2, newIntentions: 0, plans: 1, calendarEntries: 2, originalChatPreserved: true }, null, 2));
      return;
    }
    const a = await db.user.findUniqueOrThrow({ where: { username: names[0] } });
    const c = await db.user.findUniqueOrThrow({ where: { username: names[2] } });
    const next = await db.mutualOpportunity.findFirstOrThrow({ where: { OR: [
      { userAId: a.id, userBId: c.id }, { userAId: c.id, userBId: a.id },
    ], status: "PENDING" } });
    assert.notEqual(next.id, plan.originId);
    const nextIntents = await db.weeklyIntent.findMany({ where: { id: { in: [next.intentAId, next.intentBId] } } });
    assert.equal(nextIntents.length, 2);
    assert.deepEqual(new Set(nextIntents.map(i => i.userId)), new Set([a.id, c.id]));
    assert(nextIntents.every(i => i.automaticMatching && Array.isArray(i.timeWindows) && i.timeWindows.length === 0));
    assert(nextIntents.every(i => (i.timePreference as { kind?: string } | null)?.kind === "UNDECIDED"));
    assert(nextIntents.every(i => i.status === "ACTIVE" && i.activityText === "[new-loop] Library coffee"));
    assert.equal(await db.weeklyIntent.count(), 4);
    assert.equal(await db.weeklyIntent.count({ where: { status: "ENDED" } }), 2);
    assert.equal(await db.mutualOpportunity.count(), 2);
    assert.equal(await db.meetAgainPermission.count(), 0, "New discovery does not require permission to meet the old peer again");
    assert.equal(await db.planRequest.count(), 1, "Publishing a new intention does not create another plan");
    assert.equal(await db.calendarEntry.count(), 2, "The first plan's two calendar entries remain intact");
    assert.equal(await db.connection.count(), 1, "New recommendation does not silently open a chat");
    console.log(JSON.stringify({ result: "PASS", planId: plan.id, bilateralOutcomes: outcomes.length,
      sharedEncounters: 1, continuedConversation: connection.id, newOpportunity: next.id,
      intentions: { total: 4, originalEnded: 2, newActive: 2 }, connections: 1, plans: 1, calendarEntries: 2, meetAgainPermissions: 0 }, null, 2));
  } else throw new Error("Usage: qa-new-intent-loop.ts seed|check-plan|advance|check-return|check-peer-ready|verify");
} finally { await db.$disconnect(); }

}
main().catch(error => { console.error(error); process.exitCode = 1; });
