import type { Prisma } from "@prisma/client";

import {
  type CanonicalUserPair,
  pairSafetyLock,
  userConnectionSafetyLocks,
} from "@/lib/v2/action-coordination/db-locks";
import { terminalizeCreatorGatedSafetyState } from "@/lib/v2/action-coordination/safety-terminalizer";
import { terminalizeConnectionAndDirectV1Contexts } from "@/lib/v2/direct-v1-context-sync";
import {
  enqueuePlanSafetyEndedNotification,
  planSafetyTransactionTime,
  terminalizePairPlanCommitmentsForSafety,
  type PlanSafetyTerminationResult,
} from "@/lib/v2/plan-safety-terminalizer";

export type InstallConnectionPeerBlockResult =
  | Readonly<{ kind: "blocked"; blockedId: string }>
  | Readonly<{ kind: "not_found" }>
  | Readonly<{ kind: "invalid_counterparty" }>
  | Readonly<{ kind: "self_block" }>;

export type ConvergedPairPeerBlock = Readonly<{
  blockId: string;
  planSafety: PlanSafetyTerminationResult;
}>;

/**
 * Shared convergence core for callers that already own both endpoint user
 * locks and the canonical pair lock. The directed Block is installed first so
 * every later mutation observes the durable barrier and Plan audit rows can
 * retain its stable ID in the same transaction.
 */
export async function convergeLockedPairPeerBlock(
  tx: Prisma.TransactionClient,
  options: Readonly<{
    pair: CanonicalUserPair;
    userId: string;
    blockedId: string;
    connectionId: string | null;
    reason?: string | null;
  }>,
): Promise<ConvergedPairPeerBlock> {
  const occurredAt = await planSafetyTransactionTime(tx);
  const block = await tx.block.upsert({
    where: {
      blockerId_blockedId: {
        blockerId: options.userId,
        blockedId: options.blockedId,
      },
    },
    create: {
      blockerId: options.userId,
      blockedId: options.blockedId,
      connectionId: options.connectionId,
      reason: options.reason?.trim() || null,
    },
    update: {
      connectionId: options.connectionId,
      reason: options.reason?.trim() || null,
    },
    select: { id: true },
  });

  await terminalizeCreatorGatedSafetyState(tx, {
    pairs: [options.pair],
    occurredAt,
  });
  if (options.connectionId) {
    const transition = await terminalizeConnectionAndDirectV1Contexts(tx, {
      connectionId: options.connectionId,
      targetStatus: "BLOCKED",
      connectionEndedById: options.userId,
      endedAt: occurredAt,
      requiredParticipantId: options.userId,
      requiredCounterpartyId: options.blockedId,
    });
    if (transition.kind === "not_found" || transition.kind === "not_authorized") {
      throw new Error(
        "Connection changed after its pair safety lock was acquired.",
      );
    }
  }

  const planSafety = await terminalizePairPlanCommitmentsForSafety(tx, {
    pair: options.pair,
    occurredAt,
    safetyBlockId: block.id,
  });
  await enqueuePlanSafetyEndedNotification(tx, {
    recipientId: options.blockedId,
    auditIdentity: `peer-block-${block.id}`,
    canceledCommitmentIds: planSafety.canceledCommitmentIds,
    availableAt: occurredAt,
  });
  return Object.freeze({ blockId: block.id, planSafety });
}

/**
 * Install the durable, directed Block barrier for one authorized Connection
 * participant. The caller owns the transaction.
 *
 * Connection lookup is deliberately status-agnostic. The DIRECT compatibility
 * synchronizer acquires the canonical pair safety lock and revalidates the pair;
 * an authorized `already_terminal` result still installs the Block so an
 * ordinary End cannot win a race by weakening the safety operation.
 */
export async function installConnectionPeerBlock(
  tx: Prisma.TransactionClient,
  options: Readonly<{
    userId: string;
    connectionId: string;
    blockedId?: string;
    reason?: string | null;
    endedAt: Date;
  }>,
): Promise<InstallConnectionPeerBlockResult> {
  // This is only a non-locking pair-resolution snapshot. The terminalizer takes
  // the pair lock, then locks and revalidates the Connection before returning.
  const connection = await tx.connection.findUnique({
    where: { id: options.connectionId },
    select: { id: true, userAId: true, userBId: true },
  });
  if (
    !connection ||
    (connection.userAId !== options.userId &&
      connection.userBId !== options.userId)
  ) {
    return Object.freeze({ kind: "not_found" });
  }

  const peerId =
    connection.userAId === options.userId
      ? connection.userBId
      : connection.userAId;
  const blockedId = options.blockedId ?? peerId;
  if (blockedId !== peerId) {
    return Object.freeze({ kind: "invalid_counterparty" });
  }
  if (blockedId === options.userId) {
    return Object.freeze({ kind: "self_block" });
  }

  await userConnectionSafetyLocks(tx, [options.userId, blockedId]);
  const pair = await pairSafetyLock(tx, options.userId, blockedId);
  // endedAt remains accepted for wire compatibility, but the convergence core
  // deliberately samples PostgreSQL transaction time after the pair lock.
  void options.endedAt;
  await convergeLockedPairPeerBlock(tx, {
    pair,
    userId: options.userId,
    blockedId,
    connectionId: connection.id,
    reason: options.reason,
  });

  return Object.freeze({ kind: "blocked", blockedId });
}
