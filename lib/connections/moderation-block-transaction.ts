import "server-only";

import type { Prisma } from "@prisma/client";

import { userConnectionSafetyLocks } from "@/lib/connections/canonical-connection";
import { pairSafetyLocks } from "@/lib/v2/action-coordination/db-locks";
import {
  snapshotCreatorGatedSafetyForUser,
  terminalizeCreatorGatedSafetyState,
} from "@/lib/v2/action-coordination/safety-terminalizer";
import { terminalizeConnectionsAndDirectV1Contexts } from "@/lib/v2/direct-v1-context-sync";
import {
  enqueuePlanSafetyEndedNotification,
  planSafetyTransactionTime,
  terminalizePairPlanCommitmentsForSafety,
} from "@/lib/v2/plan-safety-terminalizer";

export type InstallUserModerationBlockResult = Readonly<{
  moderationBlockId: string;
  created: boolean;
}>;

/**
 * Atomically installs a user-global moderation barrier and terminalizes every
 * currently ACTIVE distinct-user Connection. The user-safety advisory lock is
 * also acquired by every canonical Connection creator before its pair lock, so
 * neither commit order can leave a new ACTIVE conversation behind the barrier.
 */
export async function installUserModerationBlock(
  tx: Prisma.TransactionClient,
  options: Readonly<{
    userId: string;
    reportId: string;
    reason: string | null;
    createdByEmail: string;
    endedAt: Date;
  }>,
): Promise<InstallUserModerationBlockResult> {
  await userConnectionSafetyLocks(tx, [options.userId]);

  const creatorGated = await snapshotCreatorGatedSafetyForUser(
    tx,
    options.userId,
  );
  await pairSafetyLocks(tx, creatorGated.pairs);
  const existing = await tx.moderationBlock.findFirst({
    where: { userId: options.userId, isActive: true },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: { id: true },
  });
  const moderationBlock = existing ?? await tx.moderationBlock.create({
    data: {
      userId: options.userId,
      reportId: options.reportId,
      reason: options.reason?.trim() || null,
      createdByEmail: options.createdByEmail,
    },
    select: { id: true },
  });
  const occurredAt = await planSafetyTransactionTime(tx);
  const affectedConnections = await tx.connection.findMany({
    where: {
      status: "ACTIVE",
      OR: [{ userAId: options.userId }, { userBId: options.userId }],
      NOT: { userAId: options.userId, userBId: options.userId },
    },
    select: { id: true },
  });
  await terminalizeCreatorGatedSafetyState(tx, {
    pairs: creatorGated.pairs,
    removedActionIds: creatorGated.ownedActionIds,
    occurredAt,
  });
  await terminalizeConnectionsAndDirectV1Contexts(
    tx,
    affectedConnections.map(({ id }) => ({
      connectionId: id,
      targetStatus: "BLOCKED" as const,
      connectionEndedById: null,
      endedAt: occurredAt,
      requiredParticipantId: options.userId,
    })),
  );

  for (const pair of creatorGated.pairs) {
    const planSafety = await terminalizePairPlanCommitmentsForSafety(tx, {
      pair,
      occurredAt,
      // safetyBlockId is intentionally reserved for the directed peer Block
      // FK. ModerationBlock remains the restricted user-global audit barrier.
      safetyBlockId: null,
    });
    const counterpartId =
      pair.minUserId === options.userId ? pair.maxUserId : pair.minUserId;
    await enqueuePlanSafetyEndedNotification(tx, {
      recipientId: counterpartId,
      auditIdentity: `moderation-block-${moderationBlock.id}`,
      canceledCommitmentIds: planSafety.canceledCommitmentIds,
      availableAt: occurredAt,
    });
  }

  // Even an existing barrier runs the convergence scan above. This repairs any
  // legacy/raced ACTIVE row instead of treating "block exists" as sufficient.
  void options.endedAt;
  return Object.freeze({
    moderationBlockId: moderationBlock.id,
    created: existing === null,
  });
}

/** Unblocking shares the same user-global linearization point as creation. */
export async function deactivateUserModerationBlock(
  tx: Prisma.TransactionClient,
  options: Readonly<{ userId: string; moderationBlockId: string }>,
): Promise<boolean> {
  await userConnectionSafetyLocks(tx, [options.userId]);
  const updated = await tx.moderationBlock.updateMany({
    where: {
      id: options.moderationBlockId,
      userId: options.userId,
      isActive: true,
    },
    data: { isActive: false },
  });
  return updated.count === 1;
}
