/** Disposable local accounts and independent persistence checks for the native Together journey. */
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const url = new URL(process.env.DATABASE_URL ?? "http://invalid");
assert.equal(url.hostname, "127.0.0.1");
assert.equal(url.pathname, "/sideseat_together_20261020");
const db = new PrismaClient();
const [mode, logPath] = process.argv.slice(2);
const out = process.env.SIDESEAT_QA_OUTPUT ?? "docs/qa/evidence/2026-10-20-together01";
async function main() {
await fs.mkdir(out, { recursive: true });
try {
  if (mode === "reset-before-plan") {
    assert.equal(await db.planRequest.count({ where: { status: "ACCEPTED" } }), 0, "Preserve completed plan evidence.");
    assert.equal(await db.user.count({ where: { username: { notIn: ["loopqa_a", "loopqa_b"] } } }), 0);
    await fs.writeFile(`${out}/unsuccessful-state-before-reset.json`, JSON.stringify({
      users: await db.user.count(), intentions: await db.weeklyIntent.count(), plans: await db.planRequest.count(),
      calendars: await db.calendarEntry.count(), at: new Date().toISOString()
    }, null, 2));
    await db.user.deleteMany();
    console.log("Removed this unsuccessful run's disposable accounts; no accepted plan evidence was removed.");
  } else if (mode === "reset-dismiss") {
    const users = await db.user.findMany({ where: { username: { startsWith: "dismissqa_" } } });
    const ids = users.map(u => u.id);
    assert.equal(await db.connection.count({ where: { OR: [{ userAId: { in: ids } }, { userBId: { in: ids } }] } }), 0);
    await db.user.deleteMany({ where: { id: { in: ids } } });
    console.log("Reset only the unfinished dismissal cohort; first-stage evidence preserved.");
  } else if (mode === "seed-dismiss") {
    assert.equal(await db.user.count({ where: { username: { startsWith: "dismissqa_" } } }), 0);
    const hashedPassword = await bcrypt.hash("Password123", 10);
    for (const [username, nickname] of [["dismissqa_a", "Dismiss Alex"], ["dismissqa_b", "Dismiss Mia"], ["dismissqa_c", "Dismiss Lee"]]) {
      await db.user.create({ data: { username, nickname, nicknameKey: nickname.toLowerCase(), hashedPassword,
        school: "TUM", avatarUrl: "p02", studentStatus: "CURRENT_STUDENT", degreeLevel: "BACHELOR",
        major: "Informatics", semester: 2, onboardingComplete: true, verifiedStudent: true,
        studentVerificationStatus: "VERIFIED", productTutorialDismissedAt: new Date(),
        userLanguages: { create: { tag: "ENGLISH", proficiency: "FLUENT" } } } });
    }
    console.log("Prepared three fresh dismissal QA accounts; first-stage evidence remains intact.");
  } else if (mode === "observe-dismiss") {
    assert(logPath);
    const users = await db.user.findMany({ where: { username: { startsWith: "dismissqa_" } } });
    assert.equal(users.length, 3); const ids = users.map(u => u.id);
    const checks: object[] = [];
    for (const phase of ["undo", "dismissed", "replied"]) {
      const deadline = Date.now() + 15 * 60_000;
      while (!(await fs.readFile(logPath, "utf8").catch(() => "")).includes(`TOGETHER02_PHASE ${phase}`)) {
        assert(Date.now() < deadline, `Timed out waiting for ${phase}`);
        await new Promise(resolve => setTimeout(resolve, 200));
      }
      let no = 0, connections = 0, requests = 0;
      const expectedNo = phase === "undo" ? 0 : 1, expectedContact = phase === "replied" ? 1 : 0;
      const persistedBy = Date.now() + 8_000;
      do {
        no = await db.mutualOpportunityDecision.count({ where: { userId: { in: ids }, value: "NO" } });
        connections = await db.connection.count({ where: { userAId: { in: ids }, userBId: { in: ids } } });
        requests = await db.mutualOpportunityMessageRequest.count({ where: { senderId: { in: ids } } });
        if (no === expectedNo && connections === expectedContact && requests === expectedContact) break;
        await new Promise(resolve => setTimeout(resolve, 100));
      } while (Date.now() < persistedBy);
      assert.equal(no, phase === "undo" ? 0 : 1);
      assert.equal(connections, phase === "replied" ? 1 : 0);
      assert.equal(requests, phase === "replied" ? 1 : 0);
      checks.push({ phase, privateRejections: no, connections, messageRequests: requests, at: new Date().toISOString() });
      await fs.writeFile(`${out}/api-boundaries.json`, JSON.stringify({ passed: checks.length === 3, checks }, null, 2));
      console.log(`Together dismissal boundary passed: ${phase}`);
    }
  } else if (mode === "seed") {
    assert.equal(await db.user.count(), 0);
    const hashedPassword = await bcrypt.hash("Password123", 10);
    for (const [username, nickname] of [["loopqa_a", "Loop Alex"], ["loopqa_b", "Loop Mia"]]) {
      await db.user.create({ data: { username, nickname, nicknameKey: nickname.toLowerCase(), hashedPassword,
        school: "TUM", avatarUrl: "p02", studentStatus: "CURRENT_STUDENT", degreeLevel: "BACHELOR",
        major: "Informatics", semester: 2, onboardingComplete: true, verifiedStudent: true,
        studentVerificationStatus: "VERIFIED", productTutorialDismissedAt: new Date(),
        userLanguages: { create: { tag: "ENGLISH", proficiency: "FLUENT" } } } });
    }
    console.log("Prepared two complete disposable local accounts; no product records.");
  } else if (mode === "observe") {
    assert(logPath);
    const checks: object[] = [];
    for (const phase of ["bookmarked", "greeted", "replied"]) {
      const deadline = Date.now() + 12 * 60_000;
      while (!(await fs.readFile(logPath, "utf8").catch(() => "")).includes(`TOGETHER_QA_PHASE ${phase}`)) {
        assert(Date.now() < deadline, `Timed out waiting for ${phase}`);
        await new Promise(resolve => setTimeout(resolve, 200));
      }
      const bookmarks = await db.mutualOpportunityBookmark.findMany();
      const requests = await db.mutualOpportunityMessageRequest.findMany();
      const connections = await db.connection.count();
      assert.equal(bookmarks.length, 1);
      const owner = await db.user.findUniqueOrThrow({ where: { username: "loopqa_b" } });
      assert.equal(bookmarks[0].userId, owner.id);
      assert.equal(requests.length, phase === "bookmarked" ? 0 : 1);
      assert.equal(connections, phase === "replied" ? 1 : 0);
      assert.equal(await db.planRequest.count(), 0);
      assert.equal(await db.calendarEntry.count(), 0);
      checks.push({ phase, privateBookmarks: bookmarks.length, requests: requests.length, connections,
        plans: 0, calendarEntries: 0, at: new Date().toISOString() });
      await fs.writeFile(`${out}/api-boundaries.json`, JSON.stringify({ passed: checks.length === 3, checks }, null, 2));
      console.log(`Together boundary passed: ${phase}`);
    }
  } else if (mode === "verify") {
    const plan = await db.planRequest.findFirstOrThrow({ where: { title: "[loop-qa] Campus coffee", status: "ACCEPTED" } });
    assert.equal(await db.planRequest.count(), 1);
    assert.equal(plan.originKind, "MUTUAL_OPPORTUNITY");
    const entries = await db.calendarEntry.findMany({ where: { planRequestId: plan.id } });
    assert.equal(entries.length, 2);
    assert.deepEqual(new Set(entries.map(e => e.userId)), new Set([plan.proposerUserId, plan.receiverUserId]));
    assert.equal(await db.connection.count(), 1);
    assert.equal(await db.mutualOpportunityBookmark.count(), 1);
    for (const body of ["[loop-qa] Hello, may I join?", "[loop-qa] Yes, let's meet!"]) {
      assert.equal(await db.message.count({ where: { connectionId: plan.connectionId, body } }), 1);
    }
    const result = { passed: true, acceptedPlans: 1, connections: 1, calendarEntries: entries.length,
      privateBookmarks: 1, greetingAndReplyStoredOnce: true, at: new Date().toISOString() };
    await fs.writeFile(`${out}/persistence.json`, JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result));
  } else throw new Error("Expected seed, observe <log>, or verify.");
} finally { await db.$disconnect(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
