import "server-only";

import { creatorGatedEnrollmentGatesAllow } from "@/lib/v2/action-coordination/capability";

export const V2_FEATURE_KEYS = [
  "v2ActionInterest",
  "v2PlanInheritance",
  "v2SocialPreferences",
  "v2WeeklyIntent",
  "v2MutualOpportunity",
  "v2Recommendations",
  "v2SmallGroupPilot",
] as const;

export type V2FeatureKey = (typeof V2_FEATURE_KEYS)[number];
export type V2TogetherFeatureKey =
  | "v2WeeklyIntent"
  | "v2MutualOpportunity";

export type V2OperationGate = "ENROLLMENT" | "SAFE_DRAIN";

const ENV_BY_FEATURE: Record<V2FeatureKey, string> = {
  v2ActionInterest: "V2_ACTION_INTEREST_ENABLED",
  v2PlanInheritance: "V2_PLAN_INHERITANCE_ENABLED",
  v2SocialPreferences: "V2_SOCIAL_PREFERENCES_ENABLED",
  v2WeeklyIntent: "V2_WEEKLY_INTENT_ENABLED",
  v2MutualOpportunity: "V2_MUTUAL_OPPORTUNITY_ENABLED",
  v2Recommendations: "V2_RECOMMENDATIONS_ENABLED",
  v2SmallGroupPilot: "V2_SMALL_GROUP_PILOT_ENABLED",
};

export function isV2FeatureEnabled(key: V2FeatureKey): boolean {
  if (isV2GlobalKillSwitchActive()) return false;
  return process.env[ENV_BY_FEATURE[key]] === "1";
}

export function isV2GlobalKillSwitchActive(): boolean {
  return process.env.V2_GLOBAL_KILL_SWITCH === "1";
}

/**
 * New enrollment and forward-only workflow steps obey both their feature flag
 * and the global kill switch.
 */
export function isV2EnrollmentOperationAllowed(key: V2FeatureKey): boolean {
  return isV2FeatureEnabled(key);
}

/**
 * Safe-drain operations (read, withdraw, release, resolve, safety and workers)
 * stay available while enrollment is disabled. Callers must still enforce the
 * operation's normal authorization and state contract.
 */
export function isV2SafeDrainOperationAllowed(): boolean {
  return true;
}

export function v2ClientFeatures(): Record<V2FeatureKey, boolean> {
  return Object.fromEntries(
    V2_FEATURE_KEYS.map((key) => [key, isV2FeatureEnabled(key)]),
  ) as Record<V2FeatureKey, boolean>;
}

/**
 * Together is a core authenticated surface rather than a per-account pilot.
 * These global flags remain independent emergency switches.
 */
export function v2TogetherClientFeatures(): Record<
  V2TogetherFeatureKey,
  boolean
> {
  return {
    v2WeeklyIntent: isV2FeatureEnabled("v2WeeklyIntent"),
    v2MutualOpportunity: isV2FeatureEnabled("v2MutualOpportunity"),
  };
}

export function isV2ExperimentEnabled(): boolean {
  return (
    !isV2GlobalKillSwitchActive() &&
    process.env.V2_ACTION_TO_PLAN_EXPERIMENT_ENABLED === "1"
  );
}

export function isCreatorGatedExperimentEnrollmentEnabled(): boolean {
  return creatorGatedEnrollmentGatesAllow({
    globalKillSwitchActive: isV2GlobalKillSwitchActive(),
    legacyExperimentEnabled: isV2ExperimentEnabled(),
    actionInterestEnabled:
      isV2EnrollmentOperationAllowed("v2ActionInterest"),
    creatorGatedExperimentEnabled:
      process.env.V2_CREATOR_GATED_EXPERIMENT_ENABLED === "1",
  });
}

export function isCreatorGatedSafeDrainAllowed(): boolean {
  return isV2SafeDrainOperationAllowed();
}

export function v2PilotAllowlist(): Set<string> {
  return new Set(
    (process.env.V2_TESTFLIGHT_ALLOWLIST ?? "")
      .split(",")
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean),
  );
}

export function isV2PilotUser(user: {
  id: string;
  email?: string | null;
  username?: string | null;
}): boolean {
  if (process.env.V2_TESTFLIGHT_ALLOW_ALL === "1") return true;
  const allowlist = v2PilotAllowlist();
  return [user.id, user.email, user.username]
    .filter((value): value is string => Boolean(value?.trim()))
    .some((value) => allowlist.has(value.trim().toLowerCase()));
}

export function isV2SmallGroupPilotUser(user: {
  id: string;
  email?: string | null;
  username?: string | null;
}): boolean {
  if (process.env.V2_SMALL_GROUP_ALLOW_ALL === "1") return true;
  const allowlist = new Set(
    (process.env.V2_SMALL_GROUP_ALLOWLIST ?? "")
      .split(",")
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean),
  );
  return [user.id, user.email, user.username]
    .filter((value): value is string => Boolean(value?.trim()))
    .some((value) => allowlist.has(value.trim().toLowerCase()));
}
