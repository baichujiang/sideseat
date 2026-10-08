import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const url = new URL(process.env.DATABASE_URL ?? "http://invalid");
assert(["localhost", "127.0.0.1"].includes(url.hostname) && url.pathname === "/sideseat_loop_20260926");
const db = new PrismaClient();
async function main() {
  try {
    const suffix = randomUUID().slice(0, 8);
    const hashedPassword = await bcrypt.hash("Password123", 10);
    const users = [];
    for (const role of ["admin", "member", "peer"]) {
      users.push(await db.user.create({ data: { username: `inviteqa_${role}_${suffix}`, hashedPassword,
        onboardingComplete: true, school: "TUM", productTutorialDismissedAt: new Date() } }));
    }
    writeFileSync("/tmp/sideseat-invite-admin-fixture.json", JSON.stringify({ users: users.map(u => ({ id: u.id, username: u.username })) }), { mode: 0o600 });
    console.log("Created three local QA accounts. Administrator ID must be explicitly passed to the test server.");
  } finally { await db.$disconnect(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
