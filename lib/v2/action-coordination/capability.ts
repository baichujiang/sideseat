import type {
  ActionCoordinationPolicy,
  ExperimentVariant,
  Prisma,
} from "@prisma/client";
import {
  ACTION_COORDINATION_CAPABILITY_TOKEN,
  CREATOR_GATED_MAX_ACTIVE_COORDINATIONS,
  numericVersionAtLeast,
  numericVersionParts,
} from "./policy-snapshot";

export {
  ACTION_COORDINATION_CAPABILITY_TOKEN,
  CREATOR_GATED_MAX_ACTIVE_COORDINATIONS,
} from "./policy-snapshot";

export const ACTION_COORDINATION_POLICY_SCHEMA_VERSION = 1 as const;

export const ACTION_COORDINATION_IOS_MIN_VERSION_ENV =
  "V2_ACTION_COORDINATION_IOS_MIN_VERSION" as const;
export const ACTION_COORDINATION_IOS_MIN_BUILD_ENV =
  "V2_ACTION_COORDINATION_IOS_MIN_BUILD" as const;

export type ActionCoordinationCapabilityReason =
  | "CAPABLE"
  | "SERVER_FLOOR_UNCONFIGURED"
  | "CAPABILITY_NOT_DECLARED"
  | "UNSUPPORTED_PLATFORM"
  | "INVALID_CLIENT_VERSION"
  | "INVALID_CLIENT_BUILD"
  | "VERSION_BELOW_FLOOR"
  | "BUILD_BELOW_FLOOR";

export type ActionCoordinationCapabilitySnapshot = Readonly<{
  schemaVersion: 1;
  capability: typeof ACTION_COORDINATION_CAPABILITY_TOKEN;
  declared: boolean;
  platform: string | null;
  appVersion: string | null;
  build: string | null;
  minimumAppVersion: string | null;
  minimumBuild: string | null;
  supported: boolean;
  reason: ActionCoordinationCapabilityReason;
}>;

export type ActionCoordinationCapability = Readonly<{
  supported: boolean;
  snapshot: ActionCoordinationCapabilitySnapshot;
}>;

export type ActionPolicySnapshot = Readonly<{
  coordinationPolicy: ActionCoordinationPolicy;
  policySchemaVersion: 1;
  policyParametersSnapshot: Prisma.InputJsonObject;
  experimentKeySnapshot: string | null;
  experimentVariantSnapshot: ExperimentVariant | null;
  clientCapabilitySnapshot: Prisma.InputJsonObject | null;
  policySnapshottedAt: Date;
}>;

export type DirectContextConflictReason =
  | "HAS_ACTIVATION"
  | "CONNECTION_MISMATCH"
  | "STATE_MISMATCH";

type CapabilityFloor = Readonly<{
  minimumAppVersion?: string;
  minimumBuild?: string;
}>;

function boundedHeader(headers: Headers, name: string): string | null {
  const value = headers.get(name)?.trim();
  if (!value || value.length > 64) return null;
  return value;
}

function capabilityTokens(headers: Headers): Set<string> {
  return new Set(
    (headers.get("x-sideseat-capabilities") ?? "")
      .split(",")
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean),
  );
}

/**
 * Capability declarations are necessary but never sufficient. Enrollment is
 * fail-closed until both server-side iOS floors are explicitly configured and
 * the declared client meets them.
 */
export function evaluateActionCoordinationCapability(
  headers: Headers,
  floor: CapabilityFloor = {
    minimumAppVersion:
      process.env[ACTION_COORDINATION_IOS_MIN_VERSION_ENV],
    minimumBuild: process.env[ACTION_COORDINATION_IOS_MIN_BUILD_ENV],
  },
): ActionCoordinationCapability {
  const platform = boundedHeader(headers, "x-sideseat-platform")?.toLowerCase() ?? null;
  const appVersion = boundedHeader(headers, "x-sideseat-app-version");
  const build = boundedHeader(headers, "x-sideseat-build");
  const minimumAppVersion = floor.minimumAppVersion?.trim() || null;
  const minimumBuild = floor.minimumBuild?.trim() || null;
  const declared = capabilityTokens(headers).has(
    ACTION_COORDINATION_CAPABILITY_TOKEN,
  );

  let reason: ActionCoordinationCapabilityReason = "CAPABLE";
  if (
    !numericVersionParts(minimumAppVersion) ||
    !numericVersionParts(minimumBuild)
  ) {
    reason = "SERVER_FLOOR_UNCONFIGURED";
  } else if (!declared) {
    reason = "CAPABILITY_NOT_DECLARED";
  } else if (platform !== "ios") {
    reason = "UNSUPPORTED_PLATFORM";
  } else if (!numericVersionParts(appVersion)) {
    reason = "INVALID_CLIENT_VERSION";
  } else if (!numericVersionParts(build)) {
    reason = "INVALID_CLIENT_BUILD";
  } else if (!numericVersionAtLeast(appVersion!, minimumAppVersion!)) {
    reason = "VERSION_BELOW_FLOOR";
  } else if (!numericVersionAtLeast(build!, minimumBuild!)) {
    reason = "BUILD_BELOW_FLOOR";
  }

  const snapshot: ActionCoordinationCapabilitySnapshot = {
    schemaVersion: 1,
    capability: ACTION_COORDINATION_CAPABILITY_TOKEN,
    declared,
    platform,
    appVersion,
    build,
    minimumAppVersion,
    minimumBuild,
    supported: reason === "CAPABLE",
    reason,
  };
  return { supported: snapshot.supported, snapshot };
}

export function directConversationPolicySnapshot(
  options: {
    capability?: ActionCoordinationCapability;
    experiment?: Readonly<{
      key: string;
      variant: ExperimentVariant;
    }>;
    now?: Date;
  } = {},
): ActionPolicySnapshot {
  return {
    coordinationPolicy: "DIRECT_CONVERSATION_V1",
    policySchemaVersion: ACTION_COORDINATION_POLICY_SCHEMA_VERSION,
    policyParametersSnapshot: {},
    experimentKeySnapshot: options.experiment?.key ?? null,
    experimentVariantSnapshot: options.experiment?.variant ?? null,
    clientCapabilitySnapshot:
      (options.capability?.snapshot as Prisma.InputJsonObject | undefined) ?? null,
    policySnapshottedAt: options.now ?? new Date(),
  };
}

export function creatorGatedPolicySnapshot(options: {
  capability: ActionCoordinationCapability;
  experiment: Readonly<{ key: string; variant: "TREATMENT" }>;
  now?: Date;
}): ActionPolicySnapshot {
  if (!options.capability.supported) {
    throw new TypeError("A creator-gated policy requires a capable client.");
  }
  return {
    coordinationPolicy: "CREATOR_GATED_V2",
    policySchemaVersion: ACTION_COORDINATION_POLICY_SCHEMA_VERSION,
    policyParametersSnapshot: {
      maxActiveCoordinations: CREATOR_GATED_MAX_ACTIVE_COORDINATIONS,
    },
    experimentKeySnapshot: options.experiment.key,
    experimentVariantSnapshot: options.experiment.variant,
    clientCapabilitySnapshot:
      options.capability.snapshot as Prisma.InputJsonObject,
    policySnapshottedAt: options.now ?? new Date(),
  };
}

export function actionPolicySnapshotForCreation(options: {
  capability: ActionCoordinationCapability;
  assignment:
    | Readonly<{
        key: string;
        eligible: boolean;
        variant: ExperimentVariant;
      }>
    | null;
  now?: Date;
}): ActionPolicySnapshot {
  if (
    options.capability.supported &&
    options.assignment?.eligible === true &&
    options.assignment.variant === "TREATMENT"
  ) {
    return creatorGatedPolicySnapshot({
      capability: options.capability,
      experiment: {
        key: options.assignment.key,
        variant: options.assignment.variant,
      },
      now: options.now,
    });
  }
  return directConversationPolicySnapshot({
    capability: options.capability,
    experiment:
      options.capability.supported && options.assignment?.eligible === true
        ? {
            key: options.assignment.key,
            variant: options.assignment.variant,
          }
        : undefined,
    now: options.now,
  });
}

export function isCreatorGatedAssignmentEligible(options: {
  capabilitySupported: boolean;
  enrollmentEnabled: boolean;
  pilotUser: boolean;
}): boolean {
  return (
    options.capabilitySupported &&
    options.enrollmentEnabled &&
    options.pilotUser
  );
}

export function creatorGatedEnrollmentGatesAllow(options: {
  globalKillSwitchActive: boolean;
  legacyExperimentEnabled: boolean;
  actionInterestEnabled: boolean;
  creatorGatedExperimentEnabled: boolean;
}): boolean {
  return (
    !options.globalKillSwitchActive &&
    options.legacyExperimentEnabled &&
    options.actionInterestEnabled &&
    options.creatorGatedExperimentEnabled
  );
}

export async function readOrEnrollStableAssignment<Row>(options: {
  eligible: boolean;
  readExisting: () => Promise<Row | null>;
  enrollOnce: () => Promise<Row>;
}): Promise<Row | null> {
  return options.eligible
    ? options.enrollOnce()
    : options.readExisting();
}

export function directContextConflictReason(
  existing: Readonly<{
    currentActivationId: string | null;
    connectionId: string | null;
    state: string;
    reservationId?: string | null;
    reservationGeneration?: number;
    leaseExpiresAt?: Date | null;
    activatedAt?: Date | null;
    firstCounterpartResponseAt?: Date | null;
    endedAt?: Date | null;
    endedById?: string | null;
    endReason?: string | null;
    createdAt?: Date;
  }> | null,
  expectedConnectionId: string,
  expectedActivatedAt?: Date,
): DirectContextConflictReason | null {
  if (!existing) return null;
  if (existing.currentActivationId !== null) return "HAS_ACTIVATION";
  if (existing.connectionId !== expectedConnectionId) {
    return "CONNECTION_MISMATCH";
  }
  if (existing.state !== "OPEN") return "STATE_MISMATCH";
  if (
    existing.reservationId != null ||
    (existing.reservationGeneration !== undefined &&
      existing.reservationGeneration !== 0) ||
    existing.leaseExpiresAt != null ||
    existing.firstCounterpartResponseAt != null ||
    existing.endedAt != null ||
    existing.endedById != null ||
    existing.endReason != null
  ) {
    return "STATE_MISMATCH";
  }
  if (
    expectedActivatedAt &&
    (existing.activatedAt?.getTime() !== expectedActivatedAt.getTime() ||
      existing.createdAt?.getTime() !== expectedActivatedAt.getTime())
  ) {
    return "STATE_MISMATCH";
  }
  return null;
}
