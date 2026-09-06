import { ConnectionStatus } from "@prisma/client";
import { subMinutes } from "date-fns";

import {
  type ConnectionDatabase,
  withCanonicalConnectionScope,
  withConnectionTransaction,
} from "@/lib/connections/canonical-connection";
import {
  NEW_THREAD_RATE_LIMIT_COUNT,
  NEW_THREAD_RATE_LIMIT_WINDOW_MINUTES,
} from "@/lib/constants/app";

export type EnsureScheduleShareConnectionError =
  | "peer_unavailable"
  | "blocked"
  | "conversation_unavailable"
  | "rate_limited";

export type EnsureScheduleShareConnectionResult =
  | { ok: true; connectionId: string; created: boolean }
  | { ok: false; reason: EnsureScheduleShareConnectionError };

/**
 * Opens or reuses an ACTIVE 1:1 thread for a schedule-share plan proposal.
 * Unlike connections/open, cross-school is allowed; blocks and new-thread rate limits apply.
 */
export async function ensureActiveConnectionForScheduleShare(
  db: ConnectionDatabase,
  proposerUserId: string,
  ownerUserId: string,
): Promise<EnsureScheduleShareConnectionResult> {
  if (proposerUserId === ownerUserId) {
    return { ok: false, reason: "peer_unavailable" };
  }

  return withConnectionTransaction(db, (tx) =>
    withCanonicalConnectionScope(
      tx,
      proposerUserId,
      ownerUserId,
      async (scope) => {
        const [proposer, owner, mutualBlock, peerModerated] = await Promise.all([
          tx.user.findUnique({
            where: { id: proposerUserId },
            select: { id: true, onboardingComplete: true },
          }),
          tx.user.findUnique({
            where: { id: ownerUserId },
            select: { id: true, onboardingComplete: true },
          }),
          tx.block.findFirst({
            where: {
              OR: [
                { blockerId: proposerUserId, blockedId: ownerUserId },
                { blockerId: ownerUserId, blockedId: proposerUserId },
              ],
            },
            select: { id: true },
          }),
          tx.moderationBlock.findFirst({
            where: {
              userId: { in: [proposerUserId, ownerUserId] },
              isActive: true,
            },
            select: { id: true },
          }),
        ]);

        if (!proposer?.onboardingComplete || !owner?.onboardingComplete) {
          return { ok: false, reason: "peer_unavailable" } as const;
        }
        if (mutualBlock || peerModerated) {
          return { ok: false, reason: "blocked" } as const;
        }
        if (scope.existing?.status === ConnectionStatus.ACTIVE) {
          return {
            ok: true,
            connectionId: scope.existing.id,
            created: false,
          } as const;
        }
        if (scope.existing) {
          return { ok: false, reason: "conversation_unavailable" } as const;
        }

        const since = subMinutes(new Date(), NEW_THREAD_RATE_LIMIT_WINDOW_MINUTES);
        const recentCount = await tx.connection.count({
          where: {
            createdAt: { gte: since },
            OR: [{ userAId: proposerUserId }, { userBId: proposerUserId }],
          },
        });
        if (recentCount >= NEW_THREAD_RATE_LIMIT_COUNT) {
          return { ok: false, reason: "rate_limited" } as const;
        }

        const connection = await scope.createActive();
        return {
          ok: true,
          connectionId: connection.id,
          created: connection.created,
        } as const;
      },
    ),
  );
}
