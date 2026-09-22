import { ConnectionStatus, type PrismaClient } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";

type DirectMessageReadClient = Pick<PrismaClient, "connection">;

export async function markDirectConversationRead(
  connectionId: string,
  userId: string,
  client: DirectMessageReadClient = prisma,
) {
  const connection = await client.connection.findFirst({
    where: {
      id: connectionId,
      status: ConnectionStatus.ACTIVE,
      OR: [{ userAId: userId }, { userBId: userId }],
    },
    select: { id: true, userAId: true },
  });
  if (!connection) return null;

  const readAt = new Date();
  await client.connection.update({
    where: { id: connection.id },
    data: connection.userAId === userId ? { readByAAt: readAt } : { readByBAt: readAt },
  });
  return { readAt };
}
