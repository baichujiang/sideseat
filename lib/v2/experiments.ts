import "server-only";

import {
  Prisma,
  type ExperimentEligibilityReason,
  type ExperimentVariant,
  type PrismaClient,
  type User,
} from "@prisma/client";

import { prisma } from "@/lib/db/prisma";
import {
  type ActionCoordinationCapability,
  isCreatorGatedAssignmentEligible,
  readOrEnrollStableAssignment,
} from "@/lib/v2/action-coordination/capability";
import {
  isCreatorGatedExperimentEnrollmentEnabled,
  isV2ExperimentEnabled,
  isV2FeatureEnabled,
  isV2PilotUser,
  isV2SmallGroupPilotUser,
  v2ClientFeatures,
  v2TogetherClientFeatures,
} from "@/lib/v2/feature-flags";
import { stableExperimentVariant } from "@/lib/v2/experiment-bucketing";

export const ACTION_TO_PLAN_EXPERIMENT_KEY = "action_to_plan_v2";
export const ACTION_TO_PLAN_CREATOR_GATED_EXPERIMENT_KEY =
  "action_to_plan_creator_gated_v2";

type AssignmentDb = Prisma.TransactionClient | PrismaClient;
type StableAssignment = Readonly<{
  id: string;
  experimentKey: string;
  eligible: boolean;
  variant: ExperimentVariant;
  assignedAt: Date;
}>;
type StableAssignmentResult = Readonly<{
  assignment: StableAssignment;
  created: boolean;
}>;

export type CreatorGatedEligibilityObservation = Readonly<{
  eligible: boolean;
  reason: ExperimentEligibilityReason;
}>;

export function creatorGatedEligibilityObservation(input: Readonly<{
  capabilitySupported: boolean;
  enrollmentEnabled: boolean;
  pilotUser: boolean;
}>): CreatorGatedEligibilityObservation {
  const eligible = isCreatorGatedAssignmentEligible(input);
  return {
    eligible,
    reason: !input.capabilitySupported
      ? "CLIENT_UNSUPPORTED"
      : !input.enrollmentEnabled
        ? "ENROLLMENT_DISABLED"
        : !input.pilotUser
          ? "PILOT_NOT_ELIGIBLE"
          : "ELIGIBLE",
  };
}

function hasTransactionRunner(db: AssignmentDb): db is PrismaClient {
  return typeof (db as PrismaClient).$transaction === "function";
}

async function withAssignmentTransaction<T>(
  db: AssignmentDb,
  operation: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  return hasTransactionRunner(db)
    ? db.$transaction((tx) => operation(tx))
    : operation(db);
}

async function createOrReadStableAssignment(options: {
  db: Prisma.TransactionClient;
  userId: string;
  experimentKey: string;
  eligibleAtAssignment: boolean;
}): Promise<StableAssignmentResult> {
  const variant = stableExperimentVariant(
    options.userId,
    options.experimentKey,
  );
  const inserted = await options.db.experimentAssignment.createMany({
    data: [
      {
        userId: options.userId,
        experimentKey: options.experimentKey,
        eligible: options.eligibleAtAssignment,
        variant,
      },
    ],
    skipDuplicates: true,
  });
  const assignment = await options.db.experimentAssignment.findUniqueOrThrow({
    where: {
      userId_experimentKey: {
        userId: options.userId,
        experimentKey: options.experimentKey,
      },
    },
    select: {
      id: true,
      experimentKey: true,
      eligible: true,
      variant: true,
      assignedAt: true,
    },
  });
  return { assignment, created: inserted.count === 1 };
}

async function databaseObservationTime(
  tx: Prisma.TransactionClient,
): Promise<Date> {
  const rows = await tx.$queryRaw<Array<{ now: Date | string }>>(Prisma.sql`
    SELECT clock_timestamp() AS "now"
  `);
  const result = new Date(rows[0]?.now ?? NaN);
  if (!Number.isFinite(result.getTime())) {
    throw new Error("Database clock did not return an eligibility timestamp.");
  }
  return result;
}

async function recordEligibilityObservation(options: {
  tx: Prisma.TransactionClient;
  assignment: StableAssignment;
  assignmentCreated: boolean;
  observation: CreatorGatedEligibilityObservation;
}) {
  await options.tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT "id"
    FROM "ExperimentAssignment"
    WHERE "id" = ${options.assignment.id}
    FOR UPDATE
  `);

  let state = await options.tx.experimentEligibilityState.findUnique({
    where: { assignmentId: options.assignment.id },
  });
  if (!state) {
    const baseline = options.assignmentCreated
      ? options.observation
      : {
          eligible: options.assignment.eligible,
          reason: "ASSIGNMENT_BASELINE" as const,
        };
    state = await options.tx.experimentEligibilityState.create({
      data: {
        assignmentId: options.assignment.id,
        eligible: baseline.eligible,
        reason: baseline.reason,
        version: 1,
        observedAt: options.assignment.assignedAt,
        updatedAt: options.assignment.assignedAt,
      },
    });
    await options.tx.experimentEligibilityTransition.create({
      data: {
        assignmentId: options.assignment.id,
        version: 1,
        eligible: baseline.eligible,
        reason: baseline.reason,
        observedAt: options.assignment.assignedAt,
      },
    });
  }

  // History is an eligibility transition log, not a request/diagnostic log.
  // A different bounded reason for the same boolean state must not create a
  // new version or per-read noise.
  if (state.eligible === options.observation.eligible) {
    return state;
  }

  const observedAt = await databaseObservationTime(options.tx);
  const version = state.version + 1;
  const next = await options.tx.experimentEligibilityState.update({
    where: { assignmentId: options.assignment.id },
    data: {
      eligible: options.observation.eligible,
      reason: options.observation.reason,
      version,
      observedAt,
      updatedAt: observedAt,
    },
  });
  await options.tx.experimentEligibilityTransition.create({
    data: {
      assignmentId: options.assignment.id,
      version,
      eligible: options.observation.eligible,
      reason: options.observation.reason,
      observedAt,
    },
  });
  return next;
}

export async function getActionToPlanAssignment(
  user: Pick<User, "id" | "email" | "username">,
) {
  const pilotUser = isV2PilotUser(user);
  const eligible = isV2ExperimentEnabled() && pilotUser;
  const variant: ExperimentVariant = eligible
    ? stableExperimentVariant(user.id, ACTION_TO_PLAN_EXPERIMENT_KEY)
    : "CONTROL";
  const assignment = await prisma.experimentAssignment.upsert({
    where: {
      userId_experimentKey: {
        userId: user.id,
        experimentKey: ACTION_TO_PLAN_EXPERIMENT_KEY,
      },
    },
    create: {
      userId: user.id,
      experimentKey: ACTION_TO_PLAN_EXPERIMENT_KEY,
      eligible,
      variant,
    },
    update: { eligible, variant },
  });

  return {
    key: assignment.experimentKey,
    eligible: assignment.eligible,
    variant: assignment.variant,
    assignedAt: assignment.assignedAt.toISOString(),
    features: {
      ...v2ClientFeatures(),
      // Together is now a core authenticated capability. Its two global
      // feature flags remain kill switches, but account pilot membership must
      // not turn the primary product surface into an unavailable page.
      ...v2TogetherClientFeatures(),
      v2SmallGroupPilot:
        isV2FeatureEnabled("v2SmallGroupPilot") && isV2SmallGroupPilotUser(user),
    },
  };
}

/**
 * Resolve the separately versioned creator-gated cohort. Capability and the
 * current enrollment gate are checked before a row is first bucketed. Existing
 * rows remain immutable and are merely inactive when current eligibility is
 * false.
 */
export async function getCreatorGatedActionToPlanAssignment(
  user: Pick<User, "id" | "email" | "username">,
  capability: ActionCoordinationCapability,
  db: AssignmentDb = prisma,
): Promise<{
  key: typeof ACTION_TO_PLAN_CREATOR_GATED_EXPERIMENT_KEY;
  eligible: boolean;
  variant: ExperimentVariant;
  assignedAt: string | null;
  persisted: boolean;
}> {
  const observation = creatorGatedEligibilityObservation({
    capabilitySupported: capability.supported,
    enrollmentEnabled: isCreatorGatedExperimentEnrollmentEnabled(),
    pilotUser: isV2PilotUser(user),
  });
  const where = {
    userId_experimentKey: {
      userId: user.id,
      experimentKey: ACTION_TO_PLAN_CREATOR_GATED_EXPERIMENT_KEY,
    },
  } as const;
  const assignmentResult = await withAssignmentTransaction(db, async (tx) => {
    const result = await readOrEnrollStableAssignment({
      eligible: observation.eligible,
      enrollOnce: () =>
        createOrReadStableAssignment({
          db: tx,
          userId: user.id,
          experimentKey: ACTION_TO_PLAN_CREATOR_GATED_EXPERIMENT_KEY,
          eligibleAtAssignment: true,
        }),
      readExisting: async () => {
        const assignment = await tx.experimentAssignment.findUnique({
          where,
          select: {
            id: true,
            experimentKey: true,
            eligible: true,
            variant: true,
            assignedAt: true,
          },
        });
        return assignment ? { assignment, created: false } : null;
      },
    });
    if (!result) return null;
    await recordEligibilityObservation({
      tx,
      assignment: result.assignment,
      assignmentCreated: result.created,
      observation,
    });
    return result.assignment;
  });

  return {
    key: ACTION_TO_PLAN_CREATOR_GATED_EXPERIMENT_KEY,
    eligible: observation.eligible,
    variant: assignmentResult?.variant ?? "CONTROL",
    assignedAt: assignmentResult?.assignedAt.toISOString() ?? null,
    persisted: Boolean(assignmentResult),
  };
}
