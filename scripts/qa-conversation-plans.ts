/** Real HTTP read-contract checks in the isolated repeat-flow database. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const url = new URL(process.env.DATABASE_URL ?? "http://invalid");
assert.equal(url.hostname, "127.0.0.1");
assert.equal(url.pathname, "/sideseat_repeat_fix_20261003");
const base = "http://127.0.0.1:3033";
const db = new PrismaClient();
const prefix = `queryqa_${randomUUID().slice(0, 8)}`;
const password = randomUUID();
const users: string[] = [];
const headers = { "Content-Type": "application/json", "x-forwarded-for": "198.51.100.188" };

async function login(username: string) {
  const response = await fetch(`${base}/api/v1/auth/login`, { method: "POST", headers,
    body: JSON.stringify({ identifier: username, password,
      device: { id: `qa-${username}`, name: "Local contract QA", appVersion: "1", platformVersion: "26", platform: "ios" } }) });
  assert.equal(response.status, 200);
  return (await response.json()).data.tokens.accessToken as string;
}

async function main() {
  const hashedPassword = await bcrypt.hash(password, 10);
  for (let i = 0; i < 3; i++) {
    const user = await db.user.create({ data: { username: `${prefix}_${i}`, nickname: `${prefix}_${i}`,
      nicknameKey: `${prefix}_${i}`, hashedPassword, onboardingComplete: true,
      school: "TUM", verifiedStudent: true, studentVerificationStatus: "VERIFIED" } });
    users.push(user.id);
  }
  const connection = await db.connection.create({ data: { userAId: users[0], userBId: users[1], status: "ACTIVE" } });
  const unrelated = await db.connection.create({ data: { userAId: users[0], userBId: users[2], status: "ACTIVE" } });
  const start = new Date(Date.now() + 48 * 3_600_000), end = new Date(start.getTime() + 3_600_000);
  const data = { connectionId: connection.id, proposerUserId: users[0], receiverUserId: users[1],
    planType: "CUSTOM" as const, title: "Scoped invitation", startTime: start, endTime: end };
  await db.planRequest.createMany({ data: Array.from({ length: 105 }, () => ({ ...data, status: "PENDING" as const })) });
  await db.planRequest.create({ data: { ...data, connectionId: unrelated.id, receiverUserId: users[2], title: "Different conversation" } });
  await db.planRequest.create({ data: { ...data, title: "Stale invitation", startTime: new Date(Date.now() - 3_600_000), endTime: new Date() } });
  await db.planRequest.create({ data: { ...data, title: "Canceled", status: "CANCELED" } });
  const { commitment, accepted } = await db.$transaction(async tx => {
    const commitment = await tx.planCommitment.create({ data: { connectionId: connection.id,
      participantAId: users[0], participantBId: users[1] } });
    const accepted = await tx.planRequest.create({ data: { ...data, title: "Original confirmed time", status: "ACCEPTED",
      commitmentId: commitment.id, revisionKind: "INITIAL" } });
    const counter = await tx.planRequest.create({ data: { ...data, title: "Proposed new time",
      commitmentId: commitment.id, counterOfId: accepted.id, revisionKind: "RESCHEDULE" } });
    await tx.planRequest.create({ data: { ...data, title: "Non-current revision", status: "ACCEPTED",
      commitmentId: commitment.id, revisionKind: "RESCHEDULE" } });
    await tx.planCommitment.update({ where: { id: commitment.id }, data: {
      status: "CONFIRMED", currentAcceptedRevisionId: accepted.id, currentPendingRevisionId: counter.id } });
    return { commitment, accepted };
  });

  const token = await login(`${prefix}_0`), outsider = await login(`${prefix}_2`);
  async function get(path: string, auth = token, status = 200) {
    const response = await fetch(`${base}/api/v1/plans${path}`, { headers: { ...headers, Authorization: `Bearer ${auth}` } });
    assert.equal(response.status, status);
    return response.json();
  }
  const found: { id: string; connectionId: string; title: string; commitmentId: string | null }[] = [];
  let cursor: string | null = null;
  let pages = 0;
  do {
    const result = await get(`?connectionId=${connection.id}${cursor ? `&cursor=${cursor}` : ""}`);
    assert(result.data.plans.length <= 50);
    assert(Object.hasOwn(result.data, "nextCursor"));
    found.push(...result.data.plans);
    cursor = result.data.nextCursor;
    pages++;
    assert(pages <= 3);
  } while (cursor);
  assert.equal(found.length, 107);
  assert.equal(new Set(found.map(p => p.id)).size, 107);
  assert(found.every(p => p.connectionId === connection.id));
  assert.equal(found.filter(p => p.commitmentId === commitment.id).length, 2);
  assert(!found.some(p => ["Different conversation", "Stale invitation", "Canceled", "Non-current revision"].includes(p.title)));
  await get(`?connectionId=${connection.id}`, outsider, 404);
  await get("?connectionId=bad", token, 422);
  await get(`?cursor=${accepted.id}`, token, 422);
  await db.planCommitment.update({ where: { id: commitment.id }, data: { safetyRestrictedAt: new Date() } });
  // A restricted current revision must not be visible through the connection query.
  let visibleRestricted = false;
  cursor = null;
  do {
    const result = await get(`?connectionId=${connection.id}${cursor ? `&cursor=${cursor}` : ""}`);
    visibleRestricted ||= result.data.plans.some((p: { commitmentId: string }) => p.commitmentId === commitment.id);
    cursor = result.data.nextCursor;
  } while (cursor);
  assert.equal(visibleRestricted, false);
  await db.connection.update({ where: { id: connection.id }, data: { status: "ENDED" } });
  await get(`?connectionId=${connection.id}`, token, 404);
  console.log(JSON.stringify({ result: "PASS", pages, currentPlans: found.length,
    checks: ["connection scope", "more than 100 results", "current revisions", "reschedule grouping data", "no foreign access", "input validation", "restricted revisions", "ended connection"] }, null, 2));
}

main().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  if (users.length) await db.user.deleteMany({ where: { id: { in: users } } });
  await db.$disconnect();
});
