import type {
  ActionCoordinationPolicy,
  ExperimentVariant,
} from "@prisma/client";

import {
  ACTION_COORDINATION_POLICY_SCHEMA_VERSION,
  type ActionCoordinationCapability,
} from "./capability";
import {
  actionPolicyTupleKind,
  type ActionPolicyTuple,
} from "./policy-snapshot";

export type ActionCoordinationReadOnlyReason =
  | "CLIENT_UPDATE_REQUIRED"
  | "PILOT_UNAVAILABLE";

export type ActionCoordinationInteractionMode =
  | "DIRECT_CONVERSATION"
  | "EXPRESS_INTEREST"
  | "READ_ONLY";

export type ActionCoordinationReadModel = Readonly<{
  policy: ActionCoordinationPolicy;
  schemaVersion: number;
  interactionMode: ActionCoordinationInteractionMode;
  readOnlyReason: ActionCoordinationReadOnlyReason | null;
}>;

export type ActionCoordinationViewerAssignment = Readonly<{
  eligible: boolean;
  variant: ExperimentVariant;
}>;

/**
 * Capability-aware policy projection used by Discover serializers.
 *
 * Historical null snapshots retain their legacy DIRECT semantics. A
 * CREATOR_GATED_V2 Action is fail-closed unless this request comes from a
 * supported client in the active treatment cohort. This is presentation-only:
 * every mutation must still repeat the authoritative eligibility checks.
 */
export function actionCoordinationReadModel(options: {
  action: ActionPolicyTuple;
  capability?: ActionCoordinationCapability | null;
  assignment?: ActionCoordinationViewerAssignment | null;
}): ActionCoordinationReadModel {
  const policy = options.action.coordinationPolicy ?? "DIRECT_CONVERSATION_V1";
  const schemaVersion =
    options.action.policySchemaVersion ?? ACTION_COORDINATION_POLICY_SCHEMA_VERSION;

  const tupleKind = actionPolicyTupleKind(options.action);
  if (
    tupleKind === "HISTORICAL_UNSNAPSHOTTED" ||
    tupleKind === "SNAPSHOTTED_DIRECT"
  ) {
    return Object.freeze({
      policy: "DIRECT_CONVERSATION_V1",
      schemaVersion: ACTION_COORDINATION_POLICY_SCHEMA_VERSION,
      interactionMode: "DIRECT_CONVERSATION",
      readOnlyReason: null,
    });
  }

  if (
    tupleKind !== "SNAPSHOTTED_CREATOR_GATED" ||
    options.capability?.supported !== true ||
    schemaVersion !== ACTION_COORDINATION_POLICY_SCHEMA_VERSION
  ) {
    return Object.freeze({
      policy,
      schemaVersion,
      interactionMode: "READ_ONLY",
      readOnlyReason: "CLIENT_UPDATE_REQUIRED",
    });
  }

  if (
    options.assignment?.eligible !== true ||
    options.assignment.variant !== "TREATMENT"
  ) {
    return Object.freeze({
      policy,
      schemaVersion,
      interactionMode: "READ_ONLY",
      readOnlyReason: "PILOT_UNAVAILABLE",
    });
  }

  return Object.freeze({
    policy,
    schemaVersion,
    interactionMode: "EXPRESS_INTEREST",
    readOnlyReason: null,
  });
}
