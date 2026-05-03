import "server-only";

import { ConnectionStatus, Prisma } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";

/**
 * A single ACTIVE connection with both endpoints set to the same user — the
 * same storage model as 1:1 chats, reused for "notes to self" / saved messages.
 */
export async function findOrCreateSelfNotesConnection(
  userId: string,
): Promise<{ connectionId: string; created: boolean }> {
  return prisma.$transaction(
    async (tx) => {
      const existing = await tx.connection.findFirst({
        where: {
          userAId: userId,
          userBId: userId,
          status: ConnectionStatus.ACTIVE,
        },
        select: { id: true },
      });
      if (existing) {
        return { connectionId: existing.id, created: false };
      }

      const row = await tx.connection.create({
        data: {
          userAId: userId,
          userBId: userId,
          status: ConnectionStatus.ACTIVE,
        },
        select: { id: true },
      });
      return { connectionId: row.id, created: true };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}

export function isSelfNotesConnection(connection: { userAId: string; userBId: string }) {
  return connection.userAId === connection.userBId;
}
