import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import Module from "node:module";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { PrismaClient } from "@prisma/client";
import { defaultProfileAppearance } from "../../lib/profile/appearance";

const resolver = Module as typeof Module & { _resolveFilename: (request: string, ...args: unknown[]) => string };
const originalResolve = resolver._resolveFilename;
resolver._resolveFilename = function(request, ...args) {
  return request === "server-only" ? fileURLToPath(new URL("../v2/server-only-test-stub.cjs", import.meta.url)) : originalResolve.call(this, request, ...args);
};
const url = process.env.DATABASE_URL;
const local = url && ["localhost", "127.0.0.1"].includes(new URL(url).hostname);

test("persisted profile style, real Plus authorization, public rendering and expiry", { skip: !local }, async () => {
  const db = new PrismaClient();
  const { prisma } = await import("../../lib/db/prisma");
  const { updateNativeCurrentProfile, loadNativeCurrentProfile, loadNativePublicProfile, NativeProfileUpdateError } = await import("../../lib/api/v1/profile-service");
  const key = randomUUID().replaceAll("-", "").slice(0, 12);
  const owner = await db.user.create({ data: {
    username: `style_${key}`, hashedPassword: "unused-test-password", school: "TUM", onboardingComplete: true,
    nickname: "Style test", bio: "Campus introduction", major: "Computer Science", studentStatus: "CURRENT_STUDENT", degreeLevel: "MASTER", semester: 2,
  } });
  const viewer = await db.user.create({ data: { username: `viewer_${key}`, hashedPassword: "unused-test-password", school: "TUM", onboardingComplete: true } });
  const plusStyle = { theme: "ocean", icon: "moon", style: "outline", showMembershipBadge: false } as const;
  try {
    const freeStyle = { ...defaultProfileAppearance, theme: "rose", icon: "sun" } as const;
    const saved = await updateNativeCurrentProfile({ user: owner, locale: "en", values: { appearance: freeStyle } });
    assert.deepEqual(saved.appearance, freeStyle);
    assert.equal(saved.tagline, "Campus introduction");
    assert.equal(saved.major, "Computer Science");
    assert.deepEqual((await loadNativeCurrentProfile({ user: owner, locale: "en" }))?.appearance, freeStyle);
    await assert.rejects(updateNativeCurrentProfile({ user: owner, locale: "en", values: { appearance: plusStyle } }),
      (error: unknown) => error instanceof NativeProfileUpdateError && error.code === "PLUS_REQUIRED");
    assert.deepEqual((await loadNativeCurrentProfile({ user: owner, locale: "en" }))?.appearance, freeStyle);
    await db.userMembership.create({ data: { userId: owner.id, plusExpiresAt: new Date(Date.now() + 86400000) } });
    await updateNativeCurrentProfile({ user: owner, locale: "en", values: { appearance: plusStyle } });
    const publicActive = await loadNativePublicProfile({ viewer, peerUserId: owner.id });
    assert.equal(publicActive?.profile.isPlus, true);
    assert.deepEqual(publicActive?.profile.appearance, plusStyle);
    assert.equal("plusExpiresAt" in publicActive!.profile, false);
    await db.userMembership.update({ where: { userId: owner.id }, data: { plusExpiresAt: new Date(0) } });
    const publicExpired = await loadNativePublicProfile({ viewer, peerUserId: owner.id });
    assert.equal(publicExpired?.profile.isPlus, false);
    assert.deepEqual(publicExpired?.profile.appearance, { ...defaultProfileAppearance, showMembershipBadge: false });
    assert.deepEqual((await loadNativeCurrentProfile({ user: owner, locale: "en" }))?.appearance, plusStyle);
    await updateNativeCurrentProfile({ user: owner, locale: "en", values: { bio: "Updated intro" } });
    assert.deepEqual((await loadNativeCurrentProfile({ user: owner, locale: "en" }))?.appearance, plusStyle);
  } finally {
    await db.user.deleteMany({ where: { id: { in: [owner.id, viewer.id] } } });
    await db.$disconnect();
    await prisma.$disconnect();
  }
});
