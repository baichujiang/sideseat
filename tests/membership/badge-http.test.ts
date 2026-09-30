import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { isPlusMember } from "../../lib/membership/status";

test("Plus badge ends exactly at expiry", () => {
  const now = new Date("2026-09-26T12:00:00Z");
  assert.equal(isPlusMember(null, now), false);
  assert.equal(isPlusMember(now, now), false);
  assert.equal(isPlusMember(new Date(now.getTime() + 1), now), true);
});
const base = process.env.MEMBERSHIP_TEST_API_URL;
const local = process.env.DATABASE_URL && ["localhost", "127.0.0.1"].includes(new URL(process.env.DATABASE_URL).hostname);
test("Public profile, inbox and chat reflect active and expired membership without exposing private details", { skip: !base || !local }, async () => {
  assert(["localhost", "127.0.0.1"].includes(new URL(base!).hostname));
  const db = new PrismaClient();
  const ids: string[] = [];
  try {
    const key = randomUUID().slice(0, 8);
    const hashedPassword = await bcrypt.hash("Password123", 4);
    const users = await Promise.all(["viewer", "peer"].map(async name => {
      const user = await db.user.create({ data: { username: `badges_${key}_${name}`, hashedPassword, school: "TUM", onboardingComplete: true, verifiedStudent: true } });
      ids.push(user.id); return user;
    }));
    const [viewer, peer] = users;
    const [userAId, userBId] = [...ids].sort();
    const connection = await db.connection.create({ data: { userAId: userAId!, userBId: userBId! } });
    const login = await fetch(`${base}/api/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ identifier: viewer!.username, password: "Password123" }) });
    assert.equal(login.status, 200);
    const token = (await login.json()).data.accessToken;
    const headers = { Authorization: `Bearer ${token}` };
    type Person = { isPlus?: boolean };
    type Payload = { profile: Person; conversations: Array<{ id: string; peer: Person }>; connection: { peer: Person } };
    for (const state of ["FREE", "PLUS", "EXPIRED"]) {
      if (state !== "FREE") {
        const plusExpiresAt = new Date(Date.now() + (state === "PLUS" ? 86400000 : -60000));
        await db.userMembership.upsert({ where: { userId: peer!.id }, create: { userId: peer!.id, plusExpiresAt }, update: { plusExpiresAt } });
      }
      for (const [path, select] of [
        [`/api/v1/users/${peer!.id}/profile`, (data: Payload) => data.profile],
        ["/api/v1/inbox", (data: Payload) => data.conversations.find((row) => row.id === connection.id)!.peer],
        [`/api/v1/connections/${connection.id}/messages`, (data: Payload) => data.connection.peer],
      ] as const) {
        const response = await fetch(`${base}${path}`, { headers });
        assert.equal(response.status, 200, path);
        const person = select((await response.json()).data);
        assert.equal(person.isPlus, state === "PLUS", `${state} ${path}`);
        assert.equal("membership" in person, false);
        assert.equal("plusExpiresAt" in person, false);
      }
    }
  } finally { await db.user.deleteMany({ where: { id: { in: ids } } }); await db.$disconnect(); }
});
