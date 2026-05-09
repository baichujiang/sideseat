import { ConnectionStatus } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";

export type DirectContactRow = {
  peerId: string;
  connectionId: string;
  nickname: string | null;
  username: string;
  avatarUrl: string | null;
};

/**
 * Active direct connections for inbox-style pickers (excludes self-notes thread).
 */
export async function listDirectContactsExcludingSelfNotes(userId: string): Promise<DirectContactRow[]> {
  const connections = await prisma.connection.findMany({
    where: {
      status: ConnectionStatus.ACTIVE,
      OR: [{ userAId: userId }, { userBId: userId }],
      NOT: { userAId: userId, userBId: userId },
    },
    include: {
      userA: true,
      userB: true,
    },
  });

  const rows: DirectContactRow[] = connections.map((connection) => {
    const peer = connection.userAId === userId ? connection.userB : connection.userA;
    return {
      peerId: peer.id,
      connectionId: connection.id,
      nickname: peer.nickname,
      username: peer.username,
      avatarUrl: peer.avatarUrl,
    };
  });

  rows.sort((a, b) =>
    (a.nickname?.trim() || a.username).localeCompare(b.nickname?.trim() || b.username, undefined, {
      sensitivity: "base",
    }),
  );

  return rows;
}
