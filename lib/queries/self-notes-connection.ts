import "server-only";

import { ConnectionStatus } from "@prisma/client";

import {
  withConnectionTransaction,
  withSelfNotesConnectionScope,
} from "@/lib/connections/canonical-connection";
import { prisma } from "@/lib/db/prisma";

/**
 * A single ACTIVE connection with both endpoints set to the same user — the
 * same storage model as 1:1 chats, reused for "notes to self" / saved messages.
 */
export async function findOrCreateSelfNotesConnection(
  userId: string,
): Promise<{ connectionId: string; created: boolean }> {
  return withConnectionTransaction(prisma, (tx) =>
    withSelfNotesConnectionScope(tx, userId, async (scope) => {
      if (scope.existing?.status === ConnectionStatus.ACTIVE) {
        return { connectionId: scope.existing.id, created: false };
      }
      if (scope.existing) {
        throw new Error("The self-notes conversation is no longer available.");
      }
      const row = await scope.createActive();
      return { connectionId: row.id, created: row.created };
    }),
  );
}

export function isSelfNotesConnection(connection: { userAId: string; userBId: string }) {
  return connection.userAId === connection.userBId;
}
