import type {
  ActionCoordinationPolicy,
  ExperimentVariant,
  Prisma,
} from "@prisma/client";

export const CREATOR_GATED_ACTION_EXPERIMENT_KEY =
  "action_to_plan_creator_gated_v2" as const;
export const ACTION_COORDINATION_CAPABILITY_TOKEN =
  "action-coordination-v2" as const;
export const CREATOR_GATED_MAX_ACTIVE_COORDINATIONS = 2 as const;

export type ActionPolicyTuple = Readonly<{
  coordinationPolicy?: ActionCoordinationPolicy | null;
  policySchemaVersion?: number | null;
  policyParametersSnapshot?: Prisma.JsonValue | null;
  experimentKeySnapshot?: string | null;
  experimentVariantSnapshot?: ExperimentVariant | null;
  clientCapabilitySnapshot?: Prisma.JsonValue | null;
  policySnapshottedAt?: Date | null;
}>;

export type DirectConversationPolicyTupleKind =
  | "HISTORICAL_UNSNAPSHOTTED"
  | "SNAPSHOTTED_DIRECT"
  | "INVALID";

export type ActionPolicyTupleKind = Exclude<
  DirectConversationPolicyTupleKind,
  "INVALID"
> | "SNAPSHOTTED_CREATOR_GATED" | "INVALID";

export function isPolicyJsonRecord(
  value: Prisma.JsonValue | null | undefined,
): value is Prisma.JsonObject {
  return (
    value !== null &&
    value !== undefined &&
    typeof value === "object" &&
    !Array.isArray(value)
  );
}

export function numericVersionParts(
  value: string | null | undefined,
): number[] | null {
  if (!value || !/^\d+(?:\.\d+)*$/.test(value)) return null;
  const parts = value.split(".").map(Number);
  if (parts.some((part) => !Number.isSafeInteger(part))) return null;
  return parts;
}

export function numericVersionAtLeast(value: string, floor: string): boolean {
  const valueParts = numericVersionParts(value);
  const floorParts = numericVersionParts(floor);
  if (!valueParts || !floorParts) return false;
  const length = Math.max(valueParts.length, floorParts.length);
  for (let index = 0; index < length; index += 1) {
    const actual = valueParts[index] ?? 0;
    const required = floorParts[index] ?? 0;
    if (actual > required) return true;
    if (actual < required) return false;
  }
  return true;
}

const CAPABILITY_SNAPSHOT_KEYS = Object.freeze([
  "appVersion",
  "build",
  "capability",
  "declared",
  "minimumAppVersion",
  "minimumBuild",
  "platform",
  "reason",
  "schemaVersion",
  "supported",
] as const);

export function isExactCreatorGatedCapabilitySnapshot(
  value: Prisma.JsonValue | null | undefined,
): value is Prisma.JsonObject {
  if (!isPolicyJsonRecord(value)) return false;
  const keys = Object.keys(value).sort();
  if (
    keys.length !== CAPABILITY_SNAPSHOT_KEYS.length ||
    keys.some((key, index) => key !== CAPABILITY_SNAPSHOT_KEYS[index])
  ) {
    return false;
  }
  const appVersion = value.appVersion;
  const build = value.build;
  const minimumAppVersion = value.minimumAppVersion;
  const minimumBuild = value.minimumBuild;
  return (
    value.schemaVersion === 1 &&
    value.capability === ACTION_COORDINATION_CAPABILITY_TOKEN &&
    value.declared === true &&
    value.platform === "ios" &&
    value.supported === true &&
    value.reason === "CAPABLE" &&
    typeof appVersion === "string" &&
    typeof build === "string" &&
    typeof minimumAppVersion === "string" &&
    typeof minimumBuild === "string" &&
    numericVersionAtLeast(appVersion, minimumAppVersion) &&
    numericVersionAtLeast(build, minimumBuild)
  );
}

export function hasValidExperimentSnapshotPair(
  action: Pick<
    ActionPolicyTuple,
    "experimentKeySnapshot" | "experimentVariantSnapshot"
  >,
): boolean {
  const hasKey = action.experimentKeySnapshot != null;
  const hasVariant = action.experimentVariantSnapshot != null;
  return (
    hasKey === hasVariant &&
    (!hasKey || /^[a-z0-9_.:-]{1,64}$/i.test(action.experimentKeySnapshot!))
  );
}

export function isHistoricalUnsnappedActionPolicy(
  action: ActionPolicyTuple,
): boolean {
  return (
    action.coordinationPolicy === null &&
    action.policySchemaVersion === null &&
    action.policyParametersSnapshot === null &&
    action.experimentKeySnapshot === null &&
    action.experimentVariantSnapshot === null &&
    action.clientCapabilitySnapshot === null &&
    action.policySnapshottedAt === null
  );
}

/**
 * Classify only policy tuples that may retain the legacy immediate-chat path.
 * Undefined/partial tuples and unknown schema versions fail closed. The
 * creator-gated experiment may snapshot DIRECT only for its CONTROL cohort.
 */
export function directConversationPolicyTupleKind(
  action: ActionPolicyTuple,
): DirectConversationPolicyTupleKind {
  if (isHistoricalUnsnappedActionPolicy(action)) {
    return "HISTORICAL_UNSNAPSHOTTED";
  }
  const snapshottedAt = action.policySnapshottedAt;
  const parameters = action.policyParametersSnapshot;
  const directSnapshotIsValid =
    action.coordinationPolicy === "DIRECT_CONVERSATION_V1" &&
    action.policySchemaVersion === 1 &&
    isPolicyJsonRecord(parameters) &&
    Object.keys(parameters).length === 0 &&
    snapshottedAt instanceof Date &&
    Number.isFinite(snapshottedAt.getTime()) &&
    hasValidExperimentSnapshotPair(action) &&
    (action.clientCapabilitySnapshot === null ||
      isPolicyJsonRecord(action.clientCapabilitySnapshot)) &&
    !(
      action.experimentKeySnapshot === CREATOR_GATED_ACTION_EXPERIMENT_KEY &&
      action.experimentVariantSnapshot !== "CONTROL"
    );
  return directSnapshotIsValid ? "SNAPSHOTTED_DIRECT" : "INVALID";
}

/** Full immutable Action policy validator shared by read and mutation paths. */
export function actionPolicyTupleKind(
  action: ActionPolicyTuple,
): ActionPolicyTupleKind {
  const directKind = directConversationPolicyTupleKind(action);
  if (directKind !== "INVALID") return directKind;

  const parameters = action.policyParametersSnapshot;
  const capability = action.clientCapabilitySnapshot;
  const snapshottedAt = action.policySnapshottedAt;
  const creatorGatedSnapshotIsValid =
    action.coordinationPolicy === "CREATOR_GATED_V2" &&
    action.policySchemaVersion === 1 &&
    isPolicyJsonRecord(parameters) &&
    Object.keys(parameters).length === 1 &&
    parameters.maxActiveCoordinations ===
      CREATOR_GATED_MAX_ACTIVE_COORDINATIONS &&
    action.experimentKeySnapshot === CREATOR_GATED_ACTION_EXPERIMENT_KEY &&
    action.experimentVariantSnapshot === "TREATMENT" &&
    isExactCreatorGatedCapabilitySnapshot(capability) &&
    snapshottedAt instanceof Date &&
    Number.isFinite(snapshottedAt.getTime());
  return creatorGatedSnapshotIsValid
    ? "SNAPSHOTTED_CREATOR_GATED"
    : "INVALID";
}

export function allowsLegacyDirectConversationForAction(
  action: ActionPolicyTuple,
): boolean {
  return directConversationPolicyTupleKind(action) !== "INVALID";
}
