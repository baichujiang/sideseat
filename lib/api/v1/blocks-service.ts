import "server-only";

import type { Prisma, PrismaClient } from "@prisma/client";

import {
  pairSafetyLock,
  userConnectionSafetyLocks,
} from "@/lib/v2/action-coordination/db-locks";

export type BlockedUserV1 = {
  id: string;
  blockedId: string;
  nickname: string | null;
  username: string;
  avatarUrl: string | null;
  createdAt: string;
};

export async function listBlockedUsersForUser(
  db: Prisma.TransactionClient | typeof import("@/lib/db/prisma").prisma,
  blockerId: string,
): Promise<BlockedUserV1[]> {
  const blocks = await db.block.findMany({
    where: { blockerId },
    include: {
      blocked: {
        select: {
          id: true,
          username: true,
          nickname: true,
          avatarUrl: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return blocks.map((block) => ({
    id: block.id,
    blockedId: block.blocked.id,
    nickname: block.blocked.nickname,
    username: block.blocked.username,
    avatarUrl: block.blocked.avatarUrl,
    createdAt: block.createdAt.toISOString(),
  }));
}

export async function unblockUserForActor(options: {
  db: Prisma.TransactionClient | PrismaClient;
  blockerId: string;
  blockedId: string;
}): Promise<{ unblocked: true; blockedId: string } | null> {
  if (options.blockerId === options.blockedId) return null;
  const run = async (tx: Prisma.TransactionClient) => {
    await userConnectionSafetyLocks(tx, [options.blockerId, options.blockedId]);
    await pairSafetyLock(tx, options.blockerId, options.blockedId);
    const deleted = await tx.block.deleteMany({
      where: {
        blockerId: options.blockerId,
        blockedId: options.blockedId,
      },
    });
    if (deleted.count === 0) return null;

    // Deliberately do not touch Context, Connection, Plan, or Calendar state.
    // Removing the barrier only permits a future explicit coordination action.
    return { unblocked: true as const, blockedId: options.blockedId };
  };

  if ("$transaction" in options.db) {
    return options.db.$transaction((tx) => run(tx));
  }
  return run(options.db);
}
