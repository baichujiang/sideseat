import assert from "node:assert/strict";
import test from "node:test";
import { defaultProfileAppearance, effectiveProfileAppearance, profileAppearanceSchema, requiresPlus } from "../../lib/profile/appearance";

test("free selections stay available; Plus styles fall back without losing saved choices", () => {
  const free = { ...defaultProfileAppearance, theme: "rose", icon: "sun" } as const;
  assert.equal(requiresPlus(free), false);
  assert.deepEqual(effectiveProfileAppearance(free, false), free);
  const plus = { theme: "ocean", icon: "moon", style: "outline", showMembershipBadge: false } as const;
  assert.equal(requiresPlus(plus), true);
  assert.deepEqual(effectiveProfileAppearance(plus, true), plus);
  assert.deepEqual(effectiveProfileAppearance(plus, false), { ...defaultProfileAppearance, showMembershipBadge: false });
  assert.equal(plus.theme, "ocean");
  assert.deepEqual(effectiveProfileAppearance(null, false), defaultProfileAppearance);
});

test("appearance is a strict catalog, with no client-owned membership fields", () => {
  assert.equal(profileAppearanceSchema.safeParse({ ...defaultProfileAppearance, isPlus: true }).success, false);
  assert.equal(profileAppearanceSchema.safeParse({ ...defaultProfileAppearance, theme: "unknown" }).success, false);
});
