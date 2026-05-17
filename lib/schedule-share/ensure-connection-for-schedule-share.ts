import { ConnectionStatus, type PrismaClient } from "@prisma/client";
import { subMinutes } from "date-fns";

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

type Db = Pick<
  PrismaClient,
  "user" | "block" | "moderationBlock" | "connection"
>;

/**
 * Opens or reuses an ACTIVE 1:1 thread for a schedule-share plan proposal.
 * Unlike connections/open, cross-school is allowed; blocks and new-thread rate limits apply.
 */
export async function ensureActiveConnectionForScheduleShare(
  db: Db,
  proposerUserId: string,
  ownerUserId: string,
): Promise<EnsureScheduleShareConnectionResult> {
  if (proposerUserId === ownerUserId) {
    return { ok: false, reason: "peer_unavailable" };
  }

  const [peer, mutualBlock, peerModerated, existingConnection] = await Promise.all([
    db.user.findUnique({
      where: { id: ownerUserId },
      select: { id: true, onboardingComplete: true },
    }),
    db.block.findFirst({
      where: {
        OR: [
          { blockerId: proposerUserId, blockedId: ownerUserId },
          { blockerId: ownerUserId, blockedId: proposerUserId },
        ],
      },
      select: { id: true },
    }),
    db.moderationBlock.findFirst({
      where: {
        userId: { in: [proposerUserId, ownerUserId] },
        isActive: true,
      },
      select: { id: true },
    }),
    db.connection.findFirst({
      where: {
        OR: [
          { userAId: proposerUserId, userBId: ownerUserId },
          { userAId: ownerUserId, userBId: proposerUserId },
        ],
      },
      select: { id: true, status: true },
    }),
  ]);

  if (!peer?.onboardingComplete) {
    return { ok: false, reason: "peer_unavailable" };
  }

  if (mutualBlock || peerModerated) {
    return { ok: false, reason: "blocked" };
  }

  if (existingConnection?.status === ConnectionStatus.ACTIVE) {
    return { ok: true, connectionId: existingConnection.id, created: false };
  }

  if (existingConnection) {
    return { ok: false, reason: "conversation_unavailable" };
  }

  const since = subMinutes(new Date(), NEW_THREAD_RATE_LIMIT_WINDOW_MINUTES);
  const recentCount = await db.connection.count({
    where: {
      createdAt: { gte: since },
      OR: [{ userAId: proposerUserId }, { userBId: proposerUserId }],
    },
  });
  if (recentCount >= NEW_THREAD_RATE_LIMIT_COUNT) {
    return { ok: false, reason: "rate_limited" };
  }

  const connection = await db.connection.create({
    data: {
      userAId: proposerUserId,
      userBId: ownerUserId,
      status: ConnectionStatus.ACTIVE,
    },
    select: { id: true },
  });

  return { ok: true, connectionId: connection.id, created: true };
}
