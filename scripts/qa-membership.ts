/** Local-only fixture for SocialLiveUITests.testMembershipInviteRedemption. */
import assert from "node:assert/strict";
import { writeFileSync, readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { generateMembershipCode, hashMembershipCode } from "../lib/membership/invite-code";

const url = new URL(process.env.DATABASE_URL ?? "http://invalid");
assert(["localhost", "127.0.0.1"].includes(url.hostname));
assert.equal(url.pathname, "/sideseat_loop_20260926");
const db = new PrismaClient();
const fixturePath = "/tmp/sideseat-membership-ui-fixture.json";
async function main() {
  try {
    if (process.argv[2] === "seed") {
      const suffix = randomUUID().replaceAll("-", "").slice(0, 8);
      const hashedPassword = await bcrypt.hash("Password123", 10);
      const users = [];
      for (const letter of ["a", "b"]) users.push(await db.user.create({ data: {
        username: `memberqa_${suffix}_${letter}`, nickname: `Member ${suffix} ${letter}`, nicknameKey: `member ${suffix} ${letter}`,
        hashedPassword, school: "TUM", studentStatus: "CURRENT_STUDENT", degreeLevel: "BACHELOR", major: "Informatics", semester: 2,
        onboardingComplete: true, verifiedStudent: true, studentVerificationStatus: "VERIFIED", productTutorialDismissedAt: new Date(),
        userLanguages: { create: { tag: "ENGLISH", proficiency: "FLUENT" } },
      } }));
      const code = generateMembershipCode();
      const invitation = await db.membershipInviteCode.create({ data: { codeHash: hashMembershipCode(code), label: `UI QA ${suffix}`, durationDays: 30, maxRedemptions: 1, expiresAt: new Date(Date.now() + 86_400_000) } });
      writeFileSync(fixturePath, JSON.stringify({ usernames: users.map(u => u.username), userIds: users.map(u => u.id), code, codeId: invitation.id }), { mode: 0o600 });
      console.log(`Created local two-account fixture at ${fixturePath}. No membership pre-granted.`);
    } else if (process.argv[2] === "verify") {
      const fixture = JSON.parse(readFileSync(fixturePath, "utf8"));
      const invitation = await db.membershipInviteCode.findUniqueOrThrow({ where: { id: fixture.codeId } });
      assert.equal(invitation.redeemedCount, 1);
      assert.equal(await db.membershipRedemption.count({ where: { codeId: fixture.codeId } }), 1);
      assert((await db.userMembership.findUniqueOrThrow({ where: { userId: fixture.userIds[0] } })).plusExpiresAt > new Date());
      assert.equal(await db.userMembership.findUnique({ where: { userId: fixture.userIds[1] } }), null);
      console.log("PASS: one redemption, one Plus account; second account remains Free; shared capacity remains exactly 1.");
    } else { throw new Error("Use seed or verify"); }
  } finally { await db.$disconnect(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
