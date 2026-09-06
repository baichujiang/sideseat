import "server-only";

import { createHash } from "node:crypto";

import {
  Prisma,
  type CalendarProjectionStatus,
  type PlanCommitmentStatus,
  type PlanRequestStatus,
  type PlanRevisionKind,
} from "@prisma/client";

import {
  enqueueNotificationOutboxItem,
  notificationOutboxSourceKeys,
} from "@/lib/v2/notification-outbox-producer";
import {
  canonicalPair,
  stableLockIds,
  type CanonicalUserPair,
} from "@/lib/v2/action-coordination/db-locks";

type LockedCommitment = {
  id: string;
  connectionId: string;
  participantAId: string;
  participantBId: string;
  status: PlanCommitmentStatus;
  currentAcceptedRevisionId: string | null;
  currentPendingRevisionId: string | null;
  safetyRestrictedAt: Date | null;
  safetyBlockId: string | null;
};

type LockedRevision = {
  id: string;
  commitmentId: string;
  status: PlanRequestStatus;
  revisionKind: PlanRevisionKind | null;
  startTime: Date;
  endTime: Date;
};

type LockedProjection = {
  id: string;
  planCommitmentId: string;
  userId: string;
  projectionStatus: CalendarProjectionStatus;
};

export type PlanSafetyTerminationResult = Readonly<{
  safetyRestrictedCommitmentIds: readonly string[];
  invalidatedPendingRevisionIds: readonly string[];
  completedPendingRevisionIds: readonly string[];
  canceledCommitmentIds: readonly string[];
  canceledProjectionIds: readonly string[];
  repairCommitmentIds: readonly string[];
  /**
   * ADR-BL-001 requires a system-owned event, but ProductFunnelEvent.actorId is
   * currently non-null. These IDs make the gap observable without attributing
   * a safety action to either participant or expanding the schema here.
   */
  analyticsDeferredCommitmentIds: readonly string[];
}>;

export type PlanSafetyNotificationResult = Readonly<{
  notificationBatchId: string;
  created: boolean;
}>;

function assertPair(
  supplied: CanonicalUserPair,
  leftUserId: string,
  rightUserId: string,
): void {
  const actual = canonicalPair(leftUserId, rightUserId);
  if (
    actual.minUserId !== supplied.minUserId ||
    actual.maxUserId !== supplied.maxUserId
  ) {
    throw new Error("Plan safety terminalizer observed a commitment outside its locked pair.");
  }
}

function validTimestamp(value: Date): boolean {
  return value instanceof Date && Number.isFinite(value.getTime());
}

/** Read the one authoritative PostgreSQL transaction time used by the command. */
export async function planSafetyTransactionTime(
  tx: Prisma.TransactionClient,
): Promise<Date> {
  const rows = await tx.$queryRaw<Array<{ occurredAt: Date }>>(Prisma.sql`
    SELECT (transaction_timestamp() AT TIME ZONE 'UTC') AS "occurredAt"
  `);
  const occurredAt = rows[0]?.occurredAt;
  if (!occurredAt || !validTimestamp(occurredAt)) {
    throw new Error("PostgreSQL did not return a valid Plan safety transaction time.");
  }
  return new Date(occurredAt);
}

function planSafetyBatchId(
  auditIdentity: string,
  canceledCommitmentIds: readonly string[],
): string {
  const digest = createHash("sha256")
    .update("sideseat:plan-safety-notification:v1\0", "utf8")
    .update(auditIdentity, "utf8")
    .update("\0", "utf8")
    .update(stableLockIds(canceledCommitmentIds).join("\0"), "utf8")
    .digest("hex");
  return `plan-safety-${digest}`;
}

/**
 * Enqueue exactly one privacy-bounded logistical notification for one affected
 * counterparty. The caller must only invoke this when at least one previously
 * CONFIRMED, not-ended commitment was canceled in the owning transaction.
 */
export async function enqueuePlanSafetyEndedNotification(
  tx: Prisma.TransactionClient,
  options: Readonly<{
    recipientId: string;
    auditIdentity: string;
    canceledCommitmentIds: readonly string[];
    availableAt: Date;
  }>,
): Promise<PlanSafetyNotificationResult | null> {
  const canceledCommitmentIds = stableLockIds(options.canceledCommitmentIds);
  if (canceledCommitmentIds.length === 0) return null;
  const notificationBatchId = planSafetyBatchId(
    options.auditIdentity,
    canceledCommitmentIds,
  );
  const enqueued = await enqueueNotificationOutboxItem(tx, {
    kind: "PLAN_SAFETY_ENDED",
    recipientId: options.recipientId,
    sourceKey: notificationOutboxSourceKeys.planSafetyBatch(notificationBatchId),
    destination: { type: "PLAN_SAFETY_ENDED", notificationBatchId },
    availableAt: options.availableAt,
  });
  return Object.freeze({
    notificationBatchId,
    created: enqueued.created,
  });
}

/**
 * Converge every stable two-person Plan for a pair after its durable safety
 * barrier has been installed. The caller owns both endpoint user locks and the
 * canonical pair lock, and has already terminalized Action/Context/Connection.
 * Row locks are acquired Commitment -> Revision -> Calendar in stable order.
 */
export async function terminalizePairPlanCommitmentsForSafety(
  tx: Prisma.TransactionClient,
  options: Readonly<{
    pair: CanonicalUserPair;
    occurredAt: Date;
    safetyBlockId?: string | null;
  }>,
): Promise<PlanSafetyTerminationResult> {
  const pair = canonicalPair(options.pair.minUserId, options.pair.maxUserId);
  const occurredAt = new Date(options.occurredAt);
  if (!validTimestamp(occurredAt)) {
    throw new TypeError("Plan safety terminalization requires a valid transaction time.");
  }

  const commitments = await tx.$queryRaw<LockedCommitment[]>(Prisma.sql`
    SELECT
      commitment."id",
      commitment."connectionId",
      commitment."participantAId",
      commitment."participantBId",
      commitment."status",
      commitment."currentAcceptedRevisionId",
      commitment."currentPendingRevisionId",
      commitment."safetyRestrictedAt",
      commitment."safetyBlockId"
    FROM "PlanCommitment" commitment
    WHERE (
      commitment."participantAId" = ${pair.minUserId}
      AND commitment."participantBId" = ${pair.maxUserId}
    ) OR (
      commitment."participantAId" = ${pair.maxUserId}
      AND commitment."participantBId" = ${pair.minUserId}
    )
    ORDER BY commitment."id"
    FOR UPDATE
  `);
  if (commitments.length === 0) {
    return Object.freeze({
      safetyRestrictedCommitmentIds: Object.freeze([]),
      invalidatedPendingRevisionIds: Object.freeze([]),
      completedPendingRevisionIds: Object.freeze([]),
      canceledCommitmentIds: Object.freeze([]),
      canceledProjectionIds: Object.freeze([]),
      repairCommitmentIds: Object.freeze([]),
      analyticsDeferredCommitmentIds: Object.freeze([]),
    });
  }
  for (const commitment of commitments) {
    assertPair(pair, commitment.participantAId, commitment.participantBId);
  }

  const commitmentIds = stableLockIds(commitments.map(({ id }) => id));
  const pointerRevisionIds = stableLockIds(
    commitments.flatMap((commitment) => [
      ...(commitment.currentAcceptedRevisionId
        ? [commitment.currentAcceptedRevisionId]
        : []),
      ...(commitment.currentPendingRevisionId
        ? [commitment.currentPendingRevisionId]
        : []),
    ]),
  );
  const revisions = await tx.$queryRaw<LockedRevision[]>(Prisma.sql`
    SELECT
      revision."id",
      revision."commitmentId",
      revision."status",
      revision."revisionKind",
      revision."startTime",
      revision."endTime"
    FROM "PlanRequest" revision
    WHERE revision."commitmentId" IN (${Prisma.join(commitmentIds)})
      AND (
        revision."status" = CAST('PENDING' AS "PlanRequestStatus")
        ${pointerRevisionIds.length > 0
          ? Prisma.sql`OR revision."id" IN (${Prisma.join(pointerRevisionIds)})`
          : Prisma.empty}
      )
    ORDER BY revision."id"
    FOR UPDATE
  `);
  const projections = await tx.$queryRaw<LockedProjection[]>(Prisma.sql`
    SELECT
      calendar."id",
      calendar."planCommitmentId",
      calendar."userId",
      calendar."projectionStatus"
    FROM "CalendarEntry" calendar
    WHERE calendar."planCommitmentId" IN (${Prisma.join(commitmentIds)})
    ORDER BY calendar."planCommitmentId", calendar."id"
    FOR UPDATE
  `);

  const revisionById = new Map(revisions.map((revision) => [revision.id, revision]));
  const revisionsByCommitment = new Map<string, LockedRevision[]>();
  for (const revision of revisions) {
    const owned = revisionsByCommitment.get(revision.commitmentId) ?? [];
    owned.push(revision);
    revisionsByCommitment.set(revision.commitmentId, owned);
  }
  const projectionsByCommitment = new Map<string, LockedProjection[]>();
  for (const projection of projections) {
    const owned = projectionsByCommitment.get(projection.planCommitmentId) ?? [];
    owned.push(projection);
    projectionsByCommitment.set(projection.planCommitmentId, owned);
  }

  const safetyRestrictedCommitmentIds: string[] = [];
  const invalidatedPendingRevisionIds: string[] = [];
  const completedPendingRevisionIds: string[] = [];
  const canceledCommitmentIds: string[] = [];
  const canceledProjectionIds: string[] = [];
  const repairCommitmentIds: string[] = [];
  const analyticsDeferredCommitmentIds: string[] = [];

  for (const commitment of commitments) {
    const ownedRevisions = revisionsByCommitment.get(commitment.id) ?? [];
    const pending = ownedRevisions.filter((revision) => revision.status === "PENDING");
    const accepted = commitment.currentAcceptedRevisionId
      ? revisionById.get(commitment.currentAcceptedRevisionId) ?? null
      : null;
    const acceptedTimelineValid =
      accepted !== null &&
      accepted.status === "ACCEPTED" &&
      validTimestamp(accepted.startTime) &&
      validTimestamp(accepted.endTime) &&
      accepted.endTime.getTime() > accepted.startTime.getTime();
    const completed =
      commitment.status === "CONFIRMED" &&
      acceptedTimelineValid &&
      accepted.endTime.getTime() <= occurredAt.getTime();
    const corruptConfirmed =
      commitment.status === "CONFIRMED" && !acceptedTimelineValid;

    if (pending.length > 0) {
      const completedHistory = completed && !corruptConfirmed;
      await tx.planRequest.updateMany({
        where: { id: { in: pending.map(({ id }) => id) }, status: "PENDING" },
        data: {
          status: completedHistory ? "EXPIRED" : "INVALIDATED",
          resolutionReason: completedHistory
            ? "COMMITMENT_COMPLETED"
            : "SAFETY_UNAVAILABLE",
          resolvedAt: occurredAt,
          resolvedByUserId: null,
          updatedAt: occurredAt,
        },
      });
      (completedHistory
        ? completedPendingRevisionIds
        : invalidatedPendingRevisionIds
      ).push(...pending.map(({ id }) => id));
    }

    const safetyMarker = {
      safetyRestrictedAt: commitment.safetyRestrictedAt ?? occurredAt,
      safetyBlockId: commitment.safetyBlockId ?? options.safetyBlockId ?? null,
      updatedAt: occurredAt,
    } as const;

    if (commitment.status === "NEGOTIATING") {
      await tx.planCommitment.update({
        where: { id: commitment.id },
        data: {
          status: "CLOSED",
          currentPendingRevisionId: null,
          ...safetyMarker,
        },
      });
      safetyRestrictedCommitmentIds.push(commitment.id);
      analyticsDeferredCommitmentIds.push(commitment.id);
      continue;
    }

    if (commitment.status === "CONFIRMED" && !completed) {
      const activeProjectionIds = (projectionsByCommitment.get(commitment.id) ?? [])
        .filter(({ projectionStatus }) => projectionStatus === "ACTIVE")
        .map(({ id }) => id);
      if (activeProjectionIds.length > 0) {
        await tx.calendarEntry.updateMany({
          where: {
            id: { in: activeProjectionIds },
            projectionStatus: "ACTIVE",
          },
          data: { projectionStatus: "CANCELED" },
        });
        canceledProjectionIds.push(...activeProjectionIds);
      }

      if (corruptConfirmed && commitment.currentAcceptedRevisionId === null) {
        // This shape is impossible after BL-DB-05, but closing it is safer than
        // leaving an actionable commitment if a legacy database skipped that
        // migration. CANCELED requires an accepted pointer by constraint.
        await tx.planCommitment.update({
          where: { id: commitment.id },
          data: {
            status: "CLOSED",
            currentPendingRevisionId: null,
            ...safetyMarker,
          },
        });
      } else {
        await tx.planCommitment.update({
          where: { id: commitment.id },
          data: {
            status: "CANCELED",
            currentPendingRevisionId: null,
            canceledAt: occurredAt,
            canceledByUserId: null,
            cancellationReason: "SAFETY_UNAVAILABLE",
            ...safetyMarker,
          },
        });
      }
      if (corruptConfirmed) repairCommitmentIds.push(commitment.id);
      safetyRestrictedCommitmentIds.push(commitment.id);
      canceledCommitmentIds.push(commitment.id);
      analyticsDeferredCommitmentIds.push(commitment.id);
      continue;
    }

    const needsSafetyMarker =
      commitment.safetyRestrictedAt === null ||
      (commitment.safetyBlockId === null && Boolean(options.safetyBlockId));
    if (pending.length > 0 || needsSafetyMarker) {
      await tx.planCommitment.update({
        where: { id: commitment.id },
        data: {
          currentPendingRevisionId: null,
          ...safetyMarker,
        },
      });
    }
    safetyRestrictedCommitmentIds.push(commitment.id);
  }

  return Object.freeze({
    safetyRestrictedCommitmentIds: Object.freeze(
      stableLockIds(safetyRestrictedCommitmentIds),
    ),
    invalidatedPendingRevisionIds: Object.freeze(
      stableLockIds(invalidatedPendingRevisionIds),
    ),
    completedPendingRevisionIds: Object.freeze(
      stableLockIds(completedPendingRevisionIds),
    ),
    canceledCommitmentIds: Object.freeze(stableLockIds(canceledCommitmentIds)),
    canceledProjectionIds: Object.freeze(stableLockIds(canceledProjectionIds)),
    repairCommitmentIds: Object.freeze(stableLockIds(repairCommitmentIds)),
    analyticsDeferredCommitmentIds: Object.freeze(
      stableLockIds(analyticsDeferredCommitmentIds),
    ),
  });
}
