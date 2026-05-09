import "server-only";

import { ConnectionStatus } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";

/**
 * Peers in `peerIds` that have an active 1:1 connection with the viewer
 * (same rule as creating a group chat).
 */
export async function activeContactPeerIdsForViewer(
  viewerId: string,
  peerIds: readonly string[],
): Promise<Set<string>> {
  if (peerIds.length === 0) {
    return new Set();
  }
  const allowedConnections = await prisma.connection.findMany({
    where: {
      status: ConnectionStatus.ACTIVE,
      OR: [
        { userAId: viewerId, userBId: { in: [...peerIds] } },
        { userAId: { in: [...peerIds] }, userBId: viewerId },
      ],
    },
    select: { userAId: true, userBId: true },
  });

  const reachable = new Set<string>();
  for (const connection of allowedConnections) {
    reachable.add(connection.userAId === viewerId ? connection.userBId : connection.userAId);
  }
  return reachable;
}
