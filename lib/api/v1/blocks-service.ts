import "server-only";

import type { Prisma } from "@prisma/client";

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
  db: Prisma.TransactionClient | typeof import("@/lib/db/prisma").prisma;
  blockerId: string;
  blockedId: string;
}): Promise<{ unblocked: true; blockedId: string } | null> {
  const existing = await options.db.block.findUnique({
    where: {
      blockerId_blockedId: {
        blockerId: options.blockerId,
        blockedId: options.blockedId,
      },
    },
    select: { id: true },
  });
  if (!existing) return null;

  await options.db.block.delete({
    where: {
      blockerId_blockedId: {
        blockerId: options.blockerId,
        blockedId: options.blockedId,
      },
    },
  });

  return { unblocked: true, blockedId: options.blockedId };
}
