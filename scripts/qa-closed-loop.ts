/** Local-only test fixture and database assertions for SocialLiveUITests.testClosedLoop*. */
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const url = new URL(process.env.DATABASE_URL ?? "http://invalid");
assert(["localhost", "127.0.0.1"].includes(url.hostname));
assert.equal(url.pathname, "/sideseat_loop_20260926", "Use the dedicated closed-loop database");
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
  assert(intentions.every(i => i.status === "ENDED"), "Accepted plan consumes its source intentions");
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
    const hashedPassword = await bcrypt.hash("Password123", 10);
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
    console.log(JSON.stringify({ checked: mode, planId: plan.id, connectionId: plan.connectionId, calendarOwners: entries.map(e => e.userId) }, null, 2));
  } else if (mode === "verify") {
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
    const a = await db.user.findUniqueOrThrow({ where: { username: names[0] } });
    const c = await db.user.findUniqueOrThrow({ where: { username: names[2] } });
    const next = await db.mutualOpportunity.findFirstOrThrow({ where: { OR: [
      { userAId: a.id, userBId: c.id }, { userAId: c.id, userBId: a.id },
    ], status: "PENDING" } });
    assert.equal(await db.connection.count(), 1, "New recommendation does not silently open a chat");
    console.log(JSON.stringify({ result: "PASS", planId: plan.id, bilateralOutcomes: outcomes.length,
      sharedEncounters: 1, continuedConversation: connection.id, newOpportunity: next.id }, null, 2));
  } else throw new Error("Usage: qa-closed-loop.ts seed|check-plan|advance|verify");
} finally { await db.$disconnect(); }

}
main().catch(error => { console.error(error); process.exitCode = 1; });
