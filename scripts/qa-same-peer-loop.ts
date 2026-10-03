/** Local real-UI 1→2→3→6→3 fixture, time compression and independent persistence checks. */
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const url = new URL(process.env.DATABASE_URL ?? "http://invalid");
assert(["localhost", "127.0.0.1"].includes(url.hostname));
assert(["/sideseat_same_peer_20261003", "/sideseat_repeat_fix_20261003"].includes(url.pathname));
const db = new PrismaClient();
const firstTitle = "[loop-qa] Campus coffee";
const secondTitle = "[same-peer] Coffee again";

async function firstPlan() {
  const plan = await db.planRequest.findFirstOrThrow({ where: { title: firstTitle, status: "ACCEPTED" } });
  assert.equal(plan.originKind, "MUTUAL_OPPORTUNITY");
  assert(plan.commitmentId && plan.originId);
  const commitment = await db.planCommitment.findUniqueOrThrow({ where: { id: plan.commitmentId } });
  assert.equal(commitment.status, "CONFIRMED");
  const entries = await db.calendarEntry.findMany({ where: { planCommitmentId: plan.commitmentId } });
  assert.equal(entries.length, 2);
  assert.deepEqual(new Set(entries.map(e => e.userId)), new Set([plan.proposerUserId, plan.receiverUserId]));
  assert(entries.every(e => e.projectionStatus === "ACTIVE"));
  assert.equal(await db.weeklyIntent.count(), 2);
  assert.equal(await db.weeklyIntent.count({ where: { status: "ENDED" } }), 2);
  assert.equal(await db.mutualOpportunityBookmark.count(), 1);
  for (const body of ["[loop-qa] Hello, may I join?", "[loop-qa] Yes, let's meet!"]) {
    assert.equal(await db.message.count({ where: { connectionId: plan.connectionId, body } }), 1);
  }
  return { plan, entries };
}

async function main() {
  const mode = process.argv[2];
  if (mode === "reset-before-plan") {
    assert.equal(await db.planRequest.count(), 0, "Preserve completed plan evidence");
    assert.equal(await db.user.count({ where: { username: { notIn: ["loopqa_a", "loopqa_b"] } } }), 0);
    await db.user.deleteMany({ where: { username: { in: ["loopqa_a", "loopqa_b"] } } });
    console.log("Reset only this run's two QA users before any plan was created.");
    return;
  }
  if (mode === "seed") {
    assert.equal(await db.user.count(), 0, "Only seed this empty isolated database");
    const password = process.env.SIDESEAT_QA_PASSWORD;
    assert(password, "Set SIDESEAT_QA_PASSWORD to the local UI fixture password before seeding");
    const hashedPassword = await bcrypt.hash(password, 10);
    for (const [username, nickname, avatarUrl] of [["loopqa_a", "Loop Alex", "p02"], ["loopqa_b", "Loop Mia", "p03"]]) {
      await db.user.create({ data: { username, nickname, nicknameKey: nickname.toLowerCase(), hashedPassword,
        school: "TUM", avatarUrl, studentStatus: "CURRENT_STUDENT", degreeLevel: "BACHELOR", major: "Informatics", semester: 2,
        onboardingComplete: true, verifiedStudent: true, studentVerificationStatus: "VERIFIED",
        productTutorialDismissedAt: new Date(), userLanguages: { create: { tag: "ENGLISH", proficiency: "FLUENT" } } } });
    }
    console.log(JSON.stringify({ mode, users: 2, intentions: 0, connections: 0, plans: 0 }));
    return;
  }
  const { plan, entries } = await firstPlan();
  if (mode === "check-first" || mode === "advance") {
    assert.equal(await db.planRequest.count(), 1);
    assert.equal(await db.planOutcomeResponse.count(), 0);
    assert.equal(await db.sharedEncounter.count(), 0);
    if (mode === "advance") {
      const startTime = new Date(Date.now() - 90 * 60_000);
      const endTime = new Date(Date.now() - 30 * 60_000);
      await db.$transaction(async tx => {
        await tx.planRequest.update({ where: { id: plan.id }, data: { startTime, endTime } });
        await tx.calendarEntry.updateMany({ where: { planCommitmentId: plan.commitmentId }, data: { startAt: startTime, endAt: endTime } });
      });
      console.log(JSON.stringify({ mode, changed: "Only first plan and its two calendar times", startTime, endTime }));
    }
    console.log(JSON.stringify({ result: "PASS", mode, firstPlan: plan.id, connection: plan.connectionId,
      calendarOwners: entries.map(e => e.userId), sourceIntentions: "ENDED", noOutcomesYet: true }, null, 2));
    return;
  }
  assert(["check-second-pending", "verify"].includes(mode));
  const outcomes = await db.planOutcomeResponse.findMany({ where: { planId: plan.id } });
  assert.equal(outcomes.length, 2);
  assert(outcomes.every(o => o.value === "OCCURRED"));
  assert.equal(await db.sharedEncounter.count({ where: { planId: plan.id } }), 1);
  const second = await db.planRequest.findFirstOrThrow({ where: {
    title: secondTitle, status: mode === "check-second-pending" ? "PENDING" : "ACCEPTED",
  } });
  assert.notEqual(second.id, plan.id);
  assert.equal(second.connectionId, plan.connectionId);
  assert.equal(second.counterOfId, null, "The second meeting is not a revision of the first");
  assert.equal(second.originKind, null, "A repeat invitation must not consume the first intention again");
  assert.equal(second.originId, null);
  assert.equal(second.message, null, "Old notes are not copied into the new invitation");
  assert.deepEqual(new Set([second.proposerUserId, second.receiverUserId]), new Set([plan.proposerUserId, plan.receiverUserId]));
  const nextEntries = await db.calendarEntry.findMany({ where: { planRequestId: second.id } });
  if (mode === "check-second-pending") {
    assert.equal(nextEntries.length, 0, "A proposal must not add either participant's calendar entry");
    assert.equal(await db.calendarEntry.count(), 2, "The first meeting's history remains intact");
    assert.equal(await db.connection.count(), 1);
    console.log(JSON.stringify({ result: "PASS", mode, secondPlan: second.id,
      status: second.status, sameConnection: plan.connectionId, secondPlanCalendarEntries: 0,
      retainedFirstPlanCalendarEntries: 2, firstPlanOutcomes: 2 }, null, 2));
    return;
  }
  assert.equal(nextEntries.length, 2);
  assert.deepEqual(new Set(nextEntries.map(e => e.userId)), new Set([plan.proposerUserId, plan.receiverUserId]));
  assert(nextEntries.every(e => e.startAt.getTime() === second.startTime.getTime() && e.endAt.getTime() === second.endTime.getTime()));
  assert.equal(await db.planRequest.count(), 2);
  assert.equal(await db.calendarEntry.count(), 4);
  assert.equal(await db.connection.count(), 1, "Reuse the original conversation");
  assert.equal(await db.mutualOpportunity.count(), 1, "No second matching round");
  assert.equal(await db.planOutcomeResponse.count({ where: { planId: second.id } }), 0);
  assert.equal((await db.connection.findUniqueOrThrow({ where: { id: plan.connectionId } })).status, "ACTIVE");
  for (const body of ["[same-peer] Thanks for today!", "[same-peer] Let's meet again!"]) {
    assert.equal(await db.message.count({ where: { connectionId: plan.connectionId, body } }), 1);
  }
  console.log(JSON.stringify({ result: "PASS", firstPlan: plan.id, secondPlan: second.id,
    sameConnection: plan.connectionId, intentions: 2, opportunities: 1, acceptedPlans: 2,
    calendarEntries: 4, firstPlanOutcomes: 2, sharedEncounters: 1, secondPlanOutcomes: 0 }, null, 2));
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => db.$disconnect());
