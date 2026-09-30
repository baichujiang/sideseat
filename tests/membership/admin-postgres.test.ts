import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import Module from "node:module";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { PrismaClient } from "@prisma/client";
const resolver = Module as typeof Module & { _resolveFilename: (request: string, ...args: unknown[]) => string };
const originalResolve = resolver._resolveFilename;
resolver._resolveFilename = function(request, ...args) {
  return request === "server-only" ? fileURLToPath(new URL("../v2/server-only-test-stub.cjs", import.meta.url)) : originalResolve.call(this, request, ...args);
};
const local = process.env.DATABASE_URL && ["localhost", "127.0.0.1"].includes(new URL(process.env.DATABASE_URL).hostname);

test("Invitation batches create once, export no secrets on reads, paginate, disable and audit", { skip: !local }, async () => {
  const { createInviteBatch, getInviteBatch, disableInvite } = await import("../../lib/membership/admin");
  const { redeemMembershipCode, getMembership } = await import("../../lib/membership/service");
  const db = new PrismaClient();
  const admin = { id: randomUUID(), username: "local_admin" };
  const users = await Promise.all([0, 1].map(i => db.user.create({ data: { username: `invite_domain_${admin.id.slice(0, 8)}_${i}`, hashedPassword: "local-only", onboardingComplete: true } })));
  try {
    const input = { requestKey: randomUUID(), label: "Local batch", mode: "INDIVIDUAL" as const, quantity: 26, durationDays: 7, expiresAt: new Date(Date.now() + 86_400_000).toISOString() };
    const results = await Promise.all([createInviteBatch(admin, input), createInviteBatch(admin, input)]);
    assert.equal(results[0]!.batchId, results[1]!.batchId);
    assert.equal(results.filter(r => !r.alreadyCreated).length, 1);
    const created = results.find(r => !r.alreadyCreated)!;
    assert.equal(created.codes.length, 26);
    assert.equal(new Set(created.codes.map(row => row.code)).size, 26);
    assert.equal(await db.membershipInviteAudit.count({ where: { batchId: created.batchId } }), 1);
    await assert.rejects(createInviteBatch(admin, { ...input, quantity: 25 }), { status: 409 });
    const first = await getInviteBatch(created.batchId, "codes", 1);
    const second = await getInviteBatch(created.batchId, "codes", 2);
    assert.equal(first.entries.length, 25); assert.equal(second.entries.length, 1);
    assert(!JSON.stringify(first).includes("codeHash"));
    assert(!JSON.stringify(first).includes(created.codes[0]!.code));
    const code = created.codes[0]!;
    await redeemMembershipCode(users[0]!.id, code.code);
    await disableInvite(admin, created.batchId, created.codes[1]!.id);
    await assert.rejects(redeemMembershipCode(users[1]!.id, created.codes[1]!.code));
    const record = await getInviteBatch(created.batchId, "redemptions", 1);
    assert.equal(record.total, 1);
    await Promise.all([disableInvite(admin, created.batchId), disableInvite(admin, created.batchId)]);
    assert.equal(await db.membershipInviteAudit.count({ where: { batchId: created.batchId, action: "DISABLE_BATCH" } }), 1);
    await assert.rejects(redeemMembershipCode(users[1]!.id, created.codes[2]!.code));
    assert.equal((await getMembership(users[0]!.id)).tier, "PLUS");
    const audits = await getInviteBatch(created.batchId, "audit", 1);
    assert.equal(audits.total, 3);
  } finally {
    await db.user.deleteMany({ where: { id: { in: users.map(u => u.id) } } });
    const where = { createdById: admin.id };
    await db.membershipInviteAudit.deleteMany({ where: { batch: where } });
    await db.membershipInviteCode.deleteMany({ where: { batch: where } });
    await db.membershipInviteBatch.deleteMany({ where });
    await db.$disconnect();
  }
});

test("Fixed-ID administrator survives rename; another Pipi username does not gain access", async () => {
  process.env.ADMIN_USER_IDS = "owner-fixed-id";
  process.env.ADMIN_USERNAMES = ""; process.env.ADMIN_EMAILS = "";
  const { isConfiguredAdmin } = await import("../../lib/constants/app");
  assert.equal(isConfiguredAdmin({ id: "owner-fixed-id", username: "renamed", email: null }), true);
  assert.equal(isConfiguredAdmin({ id: "other-id", username: "Pipi", email: null }), false);
});
