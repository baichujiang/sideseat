import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import Module from "node:module";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { generateMembershipCode, hashMembershipCode } from "../../lib/membership/invite-code";

const resolver = Module as typeof Module & { _resolveFilename: (request: string, ...args: unknown[]) => string };
const originalResolve = resolver._resolveFilename;
resolver._resolveFilename = function(request, ...args) {
  return request === "server-only" ? fileURLToPath(new URL("../v2/server-only-test-stub.cjs", import.meta.url)) : originalResolve.call(this, request, ...args);
};
const url = process.env.DATABASE_URL;
const local = url && ["localhost", "127.0.0.1"].includes(new URL(url).hostname);

async function fixture(count = 3) {
  assert(local, "Use a local test database");
  const db = new PrismaClient();
  const key = randomUUID().replaceAll("-", "").slice(0, 12);
  const hashedPassword = await bcrypt.hash("Password123", 4);
  const users = await Promise.all(Array.from({ length: count }, (_, i) => db.user.create({ data: {
    username: `membership_${key}_${i}`, hashedPassword, onboardingComplete: true,
  } })));
  const codes: string[] = [];
  async function invite(maxRedemptions = 2, durationDays = 30, expiresAt = new Date(Date.now() + 86_400_000), raw = generateMembershipCode()) {
    const row = await db.membershipInviteCode.create({ data: { codeHash: hashMembershipCode(raw), label: `test-${key}`, durationDays, maxRedemptions, expiresAt } });
    codes.push(row.id);
    return { ...row, raw };
  }
  return { db, users, invite, cleanup: async () => {
    await db.user.deleteMany({ where: { id: { in: users.map(u => u.id) } } });
    await db.membershipInviteCode.deleteMany({ where: { id: { in: codes } } });
    await db.$disconnect();
  } };
}

test("Free becomes Plus, expiry returns Free, and retry never renews or spends another use", { skip: !local }, async () => {
  const f = await fixture();
  const { getMembership, redeemMembershipCode, membershipStatus } = await import("../../lib/membership/service");
  try {
    const id = f.users[0]!.id, code = await f.invite();
    assert.equal((await getMembership(id)).tier, "FREE");
    const before = Date.now();
    const result = await redeemMembershipCode(id, ` ${code.raw.toLowerCase()} `);
    assert.equal(result.tier, "PLUS"); assert.equal(result.alreadyRedeemed, false);
    assert(Date.parse(result.plusExpiresAt!) >= before + 30 * 86_400_000);
    assert.equal(membershipStatus(new Date(result.plusExpiresAt!), new Date(result.plusExpiresAt!)).tier, "FREE");
    await f.db.membershipInviteCode.update({ where: { id: code.id }, data: { disabledAt: new Date() } });
    const again = await redeemMembershipCode(id, code.raw);
    assert.equal(again.alreadyRedeemed, true); assert.equal(again.plusExpiresAt, result.plusExpiresAt);
    await f.db.userMembership.update({ where: { userId: id }, data: { plusExpiresAt: new Date(0) } });
    assert.equal((await getMembership(id)).tier, "FREE");
    assert.equal((await redeemMembershipCode(id, code.raw)).tier, "FREE");
    assert.equal((await f.db.membershipInviteCode.findUniqueOrThrow({ where: { id: code.id } })).redeemedCount, 1);
  } finally { await f.cleanup(); }
});

test("Previously issued long codes still redeem alongside eight-character codes", { skip: !local }, async () => {
  const f = await fixture(1);
  const { redeemMembershipCode } = await import("../../lib/membership/service");
  try {
    const legacy = await f.invite(1, 1, new Date(Date.now() + 86_400_000), "0123-4567-89AB-CDEF-0123-4567-89AB-CDEF");
    const first = await redeemMembershipCode(f.users[0]!.id, legacy.raw.toLowerCase());
    const short = await f.invite(1, 1);
    assert.match(short.raw, /^[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{4}$/);
    const second = await redeemMembershipCode(f.users[0]!.id, short.raw.replace("-", " ").toLowerCase());
    assert.equal(Date.parse(second.plusExpiresAt!), Date.parse(first.plusExpiresAt!) + 86_400_000);
  } finally { await f.cleanup(); }
});

test("Concurrent users cannot redeem beyond the code's capacity", { skip: !local }, async () => {
  const f = await fixture(8);
  const { redeemMembershipCode, MembershipCodeError } = await import("../../lib/membership/service");
  try {
    const code = await f.invite(3);
    const results = await Promise.allSettled(f.users.map(user => redeemMembershipCode(user.id, code.raw)));
    assert.equal(results.filter(r => r.status === "fulfilled").length, 3);
    for (const result of results) if (result.status === "rejected") assert(result.reason instanceof MembershipCodeError);
    assert.equal(await f.db.membershipRedemption.count({ where: { codeId: code.id } }), 3);
    assert.equal(await f.db.userMembership.count({ where: { userId: { in: f.users.map(u => u.id) } } }), 3);
    assert.equal((await f.db.membershipInviteCode.findUniqueOrThrow({ where: { id: code.id } })).redeemedCount, 3);
    // Account deletion must not restore the shared code's capacity.
    const used = await f.db.membershipRedemption.findFirstOrThrow({ where: { codeId: code.id } });
    await f.db.user.delete({ where: { id: used.userId } });
    assert.equal((await f.db.membershipInviteCode.findUniqueOrThrow({ where: { id: code.id } })).redeemedCount, 3);
  } finally { await f.cleanup(); }
});

test("Same-account retries are idempotent; different codes extend without lost days", { skip: !local }, async () => {
  const f = await fixture();
  const { redeemMembershipCode } = await import("../../lib/membership/service");
  try {
    const id = f.users[0]!.id, code = await f.invite();
    const responses = await Promise.all(Array.from({ length: 4 }, () => redeemMembershipCode(id, code.raw)));
    assert.equal(responses.filter(r => !r.alreadyRedeemed).length, 1);
    assert.equal(new Set(responses.map(r => r.plusExpiresAt)).size, 1);
    const codes = await Promise.all([f.invite(1, 10), f.invite(1, 20)]);
    await Promise.all(codes.map(c => redeemMembershipCode(id, c.raw)));
    const member = await f.db.userMembership.findUniqueOrThrow({ where: { userId: id } });
    assert.equal(member.plusExpiresAt.getTime(), Date.parse(responses[0]!.plusExpiresAt!) + 30 * 86_400_000);
  } finally { await f.cleanup(); }
});

test("Invalid, expired and disabled codes do not grant membership or consume capacity", { skip: !local }, async () => {
  const f = await fixture();
  const { redeemMembershipCode, MembershipCodeError } = await import("../../lib/membership/service");
  try {
    const expired = await f.invite(1, 30, new Date(0));
    const disabled = await f.invite();
    await f.db.membershipInviteCode.update({ where: { id: disabled.id }, data: { disabledAt: new Date() } });
    for (const code of ["bad", generateMembershipCode(), expired.raw, disabled.raw]) {
      await assert.rejects(redeemMembershipCode(f.users[0]!.id, code), MembershipCodeError);
    }
    assert.equal(await f.db.userMembership.count({ where: { userId: f.users[0]!.id } }), 0);
    assert.equal((await f.db.membershipInviteCode.findUniqueOrThrow({ where: { id: expired.id } })).redeemedCount, 0);
    assert.equal((await f.db.membershipInviteCode.findUniqueOrThrow({ where: { id: disabled.id } })).redeemedCount, 0);
  } finally { await f.cleanup(); }
});

const api = process.env.MEMBERSHIP_TEST_API_URL;
test("Real HTTP requires login, redeems persistently, rejects client privilege input and rate limits attempts", { skip: !local || !api }, async () => {
  assert(["localhost", "127.0.0.1"].includes(new URL(api!).hostname));
  const f = await fixture();
  try {
    for (const method of ["GET", "POST"]) {
      assert.equal((await fetch(`${api}/api/v1/me/membership${method === "POST" ? "/redeem" : ""}`, { method })).status, 401);
    }
    const login = await fetch(`${api}/api/v1/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
      identifier: f.users[0]!.username, password: "Password123", device: { id: randomUUID(), name: "Membership test", appVersion: "1.0.0", platformVersion: "26.5" },
    }) });
    assert.equal(login.status, 200);
    const auth = await login.json();
    const headers = { Authorization: `Bearer ${auth.data.tokens.accessToken}`, "Content-Type": "application/json" };
    const call = (body?: unknown) => fetch(`${api}/api/v1/me/membership${body ? "/redeem" : ""}`, { method: body ? "POST" : "GET", headers, ...(body ? { body: JSON.stringify(body) } : {}) });
    const initial = await call();
    const initialBody = await initial.json();
    assert.equal(initial.status, 200, JSON.stringify(initialBody));
    assert.equal(initialBody.data.tier, "FREE");
    const code = await f.invite(1);
    assert.equal((await call({ code: code.raw, userId: f.users[1]!.id, tier: "PLUS" })).status, 422);
    const redeemed = await call({ code: code.raw });
    assert.equal(redeemed.status, 200); assert.equal((await redeemed.json()).data.tier, "PLUS");
    assert.equal((await (await call({ code: code.raw })).json()).data.alreadyRedeemed, true);
    assert.equal((await (await call()).json()).data.tier, "PLUS");
    assert.equal(await f.db.userMembership.count({ where: { userId: f.users[1]!.id } }), 0);
    let last: Response | undefined;
    for (let i = 0; i < 8; i++) last = await call({ code: "wrong" });
    assert.equal(last!.status, 429); assert(last!.headers.get("Retry-After"));
    assert.equal((await f.db.membershipInviteCode.findUniqueOrThrow({ where: { id: code.id } })).redeemedCount, 1);
  } finally { await f.cleanup(); }
});
