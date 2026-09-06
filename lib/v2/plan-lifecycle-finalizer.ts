import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";
import {
  appliedWorkerTransition,
  runGuardedActionCoordinationWorkerTransition,
  skippedWorkerTransition,
  type ActionCoordinationCommandDependencies,
  type ActionCoordinationTransactionContext,
  type GuardedWorkerTransitionResult,
} from "@/lib/v2/action-coordination/command";
import {
  canonicalPair,
  stableLockIds,
} from "@/lib/v2/action-coordination/db-locks";
import {
  businessFunnelEventKeys,
  recordServerFunnelEvent,
} from "@/lib/v2/funnel-event-producer";
import {
  enqueueNotificationOutboxItem,
  notificationOutboxSourceKeys,
} from "@/lib/v2/notification-outbox-producer";

export type StablePlanLifecycleTarget =
  | Readonly<{ revisionId: string }>
  | Readonly<{ commitmentId: string }>;

export type StablePlanLifecycleFinalization = Readonly<{
  commitmentId: string;
  revisionId: string;
  revisionKind: "INITIAL" | "RESCHEDULE";
  resolutionReason: "TIME_EXPIRED" | "COMMITMENT_COMPLETED";
  commitmentStatus: "CLOSED" | "CONFIRMED";
  derivedCompleted: boolean;
}>;

export type PlanLifecycleFinalizerDependencies = Omit<
  ActionCoordinationCommandDependencies,
  "receiptTtlMs"
>;

type ActionSnapshot = Readonly<{
  id: string;
  fulfilledByPlanId: string | null;
  coordinationPolicy: "DIRECT_CONVERSATION_V1" | "CREATOR_GATED_V2" | null;
  policySchemaVersion: number | null;
  experimentKeySnapshot: string | null;
  experimentVariantSnapshot: "CONTROL" | "TREATMENT" | null;
}>;

type LockedCommitment = Readonly<{
  id: string;
  connectionId: string;
  participantAId: string;
  participantBId: string;
  originActionId: string | null;
  status: "NEGOTIATING" | "CONFIRMED" | "CLOSED" | "CANCELED";
  currentAcceptedRevisionId: string | null;
  currentPendingRevisionId: string | null;
}>;

type LockedRevision = Readonly<{
  id: string;
  connectionId: string;
  commitmentId: string | null;
  revisionKind: "INITIAL" | "RESCHEDULE" | null;
  status:
    | "PENDING"
    | "ACCEPTED"
    | "DECLINED"
    | "COUNTER_PROPOSED"
    | "CANCELED"
    | "EXPIRED"
    | "INVALIDATED";
  proposerUserId: string;
  receiverUserId: string;
  actionInterestId: string | null;
  startTime: Date;
  endTime: Date;
}>;

const commitmentSelection = {
  id: true,
  connectionId: true,
  participantAId: true,
  participantBId: true,
  originActionId: true,
  status: true,
  currentAcceptedRevisionId: true,
  currentPendingRevisionId: true,
} as const;

const revisionSelection = {
  id: true,
  connectionId: true,
  commitmentId: true,
  revisionKind: true,
  status: true,
  proposerUserId: true,
  receiverUserId: true,
  actionInterestId: true,
  startTime: true,
  endTime: true,
} as const;

const actionSelection = {
  id: true,
  fulfilledByPlanId: true,
  coordinationPolicy: true,
  policySchemaVersion: true,
  experimentKeySnapshot: true,
  experimentVariantSnapshot: true,
} as const;

function isValidDate(value: Date): boolean {
  return Number.isFinite(value.getTime());
}

function sameParticipantPair(
  commitment: Pick<LockedCommitment, "participantAId" | "participantBId">,
  revision: Pick<LockedRevision, "proposerUserId" | "receiverUserId">,
): boolean {
  return (
    (revision.proposerUserId === commitment.participantAId &&
      revision.receiverUserId === commitment.participantBId) ||
    (revision.proposerUserId === commitment.participantBId &&
      revision.receiverUserId === commitment.participantAId)
  );
}

function transactionHoldsPair(
  context: Pick<ActionCoordinationTransactionContext, "pairs">,
  firstUserId: string,
  secondUserId: string,
): boolean {
  let expected;
  try {
    expected = canonicalPair(firstUserId, secondUserId);
  } catch {
    return false;
  }
  return context.pairs.some(
    (pair) =>
      pair.minUserId === expected.minUserId &&
      pair.maxUserId === expected.maxUserId,
  );
}

async function lockRow(
  tx: Prisma.TransactionClient,
  table: "ClassmatePost" | "PlanCommitment" | "PlanRequest",
  id: string,
): Promise<boolean> {
  const rows = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT "id"
    FROM ${Prisma.raw(`"${table}"`)}
    WHERE "id" = ${id}
    FOR UPDATE
  `);
  return rows.length === 1;
}

async function resolveCommitmentId(
  tx: Prisma.TransactionClient,
  target: StablePlanLifecycleTarget,
): Promise<string | null> {
  if ("commitmentId" in target) return target.commitmentId;
  const revision = await tx.planRequest.findUnique({
    where: { id: target.revisionId },
    select: { commitmentId: true },
  });
  return revision?.commitmentId ?? null;
}

/**
 * Transaction-local Plan finalizer. The caller must already hold the canonical
 * pair safety lock supplied in `context.pairs`. This function then follows the
 * narrower global order: optional originating Action, Commitment, and accepted
 * plus pending revisions in stable ID order.
 *
 * Legacy or partially migrated rows are intentionally ignored. In particular,
 * a revision must have a stable commitment ID, revision kind, and be the exact
 * currentPendingRevision of that commitment before any transition is written.
 */
export async function finalizeStablePlanLifecycleInTransaction(
  context: ActionCoordinationTransactionContext,
  target: StablePlanLifecycleTarget,
): Promise<GuardedWorkerTransitionResult<StablePlanLifecycleFinalization>> {
  const commitmentId = await resolveCommitmentId(context.tx, target);
  if (!commitmentId) return skippedWorkerTransition();

  // This snapshot resolves earlier lock levels without taking a narrow lock.
  // Every value that matters is revalidated after its row is locked.
  const commitmentSnapshot = await context.tx.planCommitment.findUnique({
    where: { id: commitmentId },
    select: commitmentSelection,
  });
  if (
    !commitmentSnapshot ||
    !transactionHoldsPair(
      context,
      commitmentSnapshot.participantAId,
      commitmentSnapshot.participantBId,
    )
  ) {
    return skippedWorkerTransition();
  }

  let actionSnapshot: ActionSnapshot | null = null;
  if (commitmentSnapshot.originActionId) {
    actionSnapshot = await context.tx.classmatePost.findUnique({
      where: { id: commitmentSnapshot.originActionId },
      select: actionSelection,
    });
    if (!actionSnapshot) return skippedWorkerTransition();

    // An unfulfilled originating Action is an earlier lock level because
    // expiring INITIAL releases its one-pending-Plan constraint. A fulfilled
    // Action is immutable and needs no Action lock for a reschedule expiry.
    if (actionSnapshot.fulfilledByPlanId === null) {
      if (
        !(await lockRow(
          context.tx,
          "ClassmatePost",
          commitmentSnapshot.originActionId,
        ))
      ) {
        return skippedWorkerTransition();
      }
      actionSnapshot = await context.tx.classmatePost.findUnique({
        where: { id: commitmentSnapshot.originActionId },
        select: actionSelection,
      });
      if (!actionSnapshot) return skippedWorkerTransition();
    }
    if (
      actionSnapshot.fulfilledByPlanId !== null &&
      actionSnapshot.fulfilledByPlanId !== commitmentId
    ) {
      return skippedWorkerTransition();
    }
  }

  if (!(await lockRow(context.tx, "PlanCommitment", commitmentId))) {
    return skippedWorkerTransition();
  }
  const commitment = (await context.tx.planCommitment.findUnique({
    where: { id: commitmentId },
    select: commitmentSelection,
  })) as LockedCommitment | null;
  if (
    !commitment ||
    commitment.originActionId !== commitmentSnapshot.originActionId ||
    !transactionHoldsPair(
      context,
      commitment.participantAId,
      commitment.participantBId,
    ) ||
    !commitment.currentPendingRevisionId ||
    ("revisionId" in target &&
      target.revisionId !== commitment.currentPendingRevisionId)
  ) {
    return skippedWorkerTransition();
  }

  const revisionIds = stableLockIds(
    [
      commitment.currentAcceptedRevisionId,
      commitment.currentPendingRevisionId,
    ].filter((id): id is string => id !== null),
  );
  for (const revisionId of revisionIds) {
    if (!(await lockRow(context.tx, "PlanRequest", revisionId))) {
      return skippedWorkerTransition();
    }
  }
  const revisions = (await context.tx.planRequest.findMany({
    where: { id: { in: revisionIds } },
    select: revisionSelection,
  })) as LockedRevision[];
  const revisionsById = new Map(
    revisions.map((revision) => [revision.id, revision] as const),
  );
  const pending = revisionsById.get(commitment.currentPendingRevisionId);
  const accepted = commitment.currentAcceptedRevisionId
    ? revisionsById.get(commitment.currentAcceptedRevisionId)
    : undefined;

  if (
    !pending ||
    pending.commitmentId !== commitment.id ||
    pending.status !== "PENDING" ||
    pending.revisionKind === null ||
    pending.connectionId !== commitment.connectionId ||
    !sameParticipantPair(commitment, pending) ||
    !isValidDate(pending.startTime) ||
    !isValidDate(pending.endTime) ||
    pending.endTime <= pending.startTime
  ) {
    return skippedWorkerTransition();
  }

  let resolutionReason: "TIME_EXPIRED" | "COMMITMENT_COMPLETED";
  let commitmentStatus: "CLOSED" | "CONFIRMED";
  let derivedCompleted = false;

  if (pending.revisionKind === "INITIAL") {
    if (
      commitment.status !== "NEGOTIATING" ||
      commitment.currentAcceptedRevisionId !== null ||
      accepted !== undefined ||
      pending.startTime > context.now
    ) {
      return skippedWorkerTransition();
    }
    resolutionReason = "TIME_EXPIRED";
    commitmentStatus = "CLOSED";
  } else {
    if (
      commitment.status !== "CONFIRMED" ||
      !commitment.currentAcceptedRevisionId ||
      !accepted ||
      accepted.commitmentId !== commitment.id ||
      accepted.status !== "ACCEPTED" ||
      accepted.revisionKind === null ||
      accepted.connectionId !== commitment.connectionId ||
      !sameParticipantPair(commitment, accepted) ||
      !isValidDate(accepted.startTime) ||
      !isValidDate(accepted.endTime) ||
      accepted.endTime <= accepted.startTime
    ) {
      return skippedWorkerTransition();
    }

    // Completion has priority even when the replacement's own start time has
    // also elapsed. A completed accepted Plan cannot be revived by reschedule.
    derivedCompleted = accepted.endTime <= context.now;
    if (!derivedCompleted && pending.startTime > context.now) {
      return skippedWorkerTransition();
    }
    resolutionReason = derivedCompleted
      ? "COMMITMENT_COMPLETED"
      : "TIME_EXPIRED";
    commitmentStatus = "CONFIRMED";
  }

  const updatedRevision = await context.tx.planRequest.updateMany({
    where: {
      id: pending.id,
      commitmentId: commitment.id,
      revisionKind: pending.revisionKind,
      status: "PENDING",
    },
    data: {
      status: "EXPIRED",
      resolutionReason,
      resolvedAt: context.now,
      resolvedByUserId: null,
    },
  });
  if (updatedRevision.count !== 1) {
    throw new Error("Locked pending Plan revision changed during finalization.");
  }

  const updatedCommitment = await context.tx.planCommitment.updateMany({
    where: {
      id: commitment.id,
      status: commitment.status,
      currentPendingRevisionId: pending.id,
      currentAcceptedRevisionId: commitment.currentAcceptedRevisionId,
    },
    data: {
      currentPendingRevisionId: null,
      ...(pending.revisionKind === "INITIAL" ? { status: "CLOSED" } : {}),
    },
  });
  if (updatedCommitment.count !== 1) {
    throw new Error("Locked Plan commitment changed during finalization.");
  }

  const businessEventKey = businessFunnelEventKeys.planExpired(pending.id);
  await recordServerFunnelEvent(context.tx, {
    businessEventKey,
    actorId: pending.proposerUserId,
    name: "PLAN_EXPIRED",
    surface: "PLAN_CENTER",
    sourceKind: "PLAN",
    sourceId: pending.id,
    connectionId: commitment.connectionId,
    planRequestId: pending.id,
    planCommitmentId: commitment.id,
    planRevisionId: pending.id,
    actionInterestId: pending.actionInterestId ?? undefined,
    coordinationPolicy: actionSnapshot?.coordinationPolicy ?? undefined,
    policySchemaVersion: actionSnapshot?.policySchemaVersion ?? undefined,
    experimentKey: actionSnapshot?.experimentKeySnapshot ?? undefined,
    experimentVariant:
      actionSnapshot?.experimentVariantSnapshot ?? undefined,
    occurredAt: context.now,
  });

  for (const recipientId of stableLockIds([
    commitment.participantAId,
    commitment.participantBId,
  ])) {
    await enqueueNotificationOutboxItem(context.tx, {
      kind: "PLAN_EXPIRED",
      recipientId,
      sourceKey: notificationOutboxSourceKeys.forBusinessEvent(businessEventKey),
      destination: {
        type: "PLAN",
        connectionId: commitment.connectionId,
        commitmentId: commitment.id,
        revisionId: pending.id,
      },
      availableAt: context.now,
    });
  }

  return appliedWorkerTransition({
    commitmentId: commitment.id,
    revisionId: pending.id,
    revisionKind: pending.revisionKind,
    resolutionReason,
    commitmentStatus,
    derivedCompleted,
  });
}

async function resolveTargetPair(
  target: StablePlanLifecycleTarget,
  dependencies: PlanLifecycleFinalizerDependencies,
): Promise<readonly [string, string] | null> {
  const db = dependencies.db ?? prisma;
  return db.$transaction(async (tx) => {
    const commitmentId = await resolveCommitmentId(tx, target);
    if (!commitmentId) return null;
    const commitment = await tx.planCommitment.findUnique({
      where: { id: commitmentId },
      select: { participantAId: true, participantBId: true },
    });
    if (
      !commitment ||
      commitment.participantAId === commitment.participantBId
    ) {
      return null;
    }
    return [commitment.participantAId, commitment.participantBId] as const;
  });
}

async function runStablePlanLifecycleFinalizer(
  target: StablePlanLifecycleTarget,
  dependencies: PlanLifecycleFinalizerDependencies = {},
): Promise<GuardedWorkerTransitionResult<StablePlanLifecycleFinalization>> {
  const pair = await resolveTargetPair(target, dependencies);
  if (!pair) return skippedWorkerTransition();
  return runGuardedActionCoordinationWorkerTransition(
    {
      pairs: [pair],
      transition: (context) =>
        finalizeStablePlanLifecycleInTransaction(context, target),
    },
    dependencies,
  );
}

/** Guarded lazy/worker entry point for one explicit stable revision ID. */
export function finalizeStablePlanRevision(
  revisionId: string,
  dependencies: PlanLifecycleFinalizerDependencies = {},
): Promise<GuardedWorkerTransitionResult<StablePlanLifecycleFinalization>> {
  return runStablePlanLifecycleFinalizer({ revisionId }, dependencies);
}

/** Guarded lazy/worker entry point for one explicit stable commitment ID. */
export function finalizeStablePlanCommitment(
  commitmentId: string,
  dependencies: PlanLifecycleFinalizerDependencies = {},
): Promise<GuardedWorkerTransitionResult<StablePlanLifecycleFinalization>> {
  return runStablePlanLifecycleFinalizer({ commitmentId }, dependencies);
}
