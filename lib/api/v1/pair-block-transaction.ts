import "server-only";

import type { Prisma } from "@prisma/client";

import { convergeLockedPairPeerBlock } from "@/lib/api/v1/connection-block-transaction";
import {
  CanonicalConnectionIntegrityError,
  userConnectionSafetyLocks,
} from "@/lib/connections/canonical-connection";
import {
  pairSafetyLock,
} from "@/lib/v2/action-coordination/db-locks";

export type InstallPairPeerBlockResult =
  | Readonly<{ kind: "blocked"; blockedId: string; connectionId: string | null }>
  | Readonly<{ kind: "invalid_connection" }>
  | Readonly<{ kind: "self_block" }>;

/**
 * Pair-first Block command used when a caller may not know a Connection ID.
 * It is linearized against canonical Connection creation in either commit
 * order: an existing ACTIVE row is terminalized; an absent row receives the
 * durable Block barrier before any later creator may pass its safety recheck.
 */
export async function installPairPeerBlock(
  tx: Prisma.TransactionClient,
  options: Readonly<{
    userId: string;
    blockedId: string;
    connectionId?: string;
    reason?: string | null;
    endedAt: Date;
  }>,
): Promise<InstallPairPeerBlockResult> {
  if (options.userId === options.blockedId) {
    return Object.freeze({ kind: "self_block" });
  }

  await userConnectionSafetyLocks(tx, [options.userId, options.blockedId]);
  const pair = await pairSafetyLock(tx, options.userId, options.blockedId);
  // Deliberately do not lock Connection before the Action/Interest hierarchy.
  // The pair lock prevents canonical creation while this snapshot is resolved.
  const connections = await tx.connection.findMany({
    where: {
      OR: [
        { userAId: pair.minUserId, userBId: pair.maxUserId },
        { userAId: pair.maxUserId, userBId: pair.minUserId },
      ],
    },
    select: { id: true },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
  if (connections.length > 1) {
    throw new CanonicalConnectionIntegrityError("DUPLICATE_PAIR");
  }
  const connection = connections[0] ?? null;
  if (
    options.connectionId &&
    (!connection || connection.id !== options.connectionId)
  ) {
    return Object.freeze({ kind: "invalid_connection" });
  }

  // The external timestamp remains accepted for compatibility. ADR-BL-001
  // samples the authoritative time from PostgreSQL inside the locked command.
  void options.endedAt;
  await convergeLockedPairPeerBlock(tx, {
    pair,
    userId: options.userId,
    blockedId: options.blockedId,
    connectionId: connection?.id ?? null,
    reason: options.reason,
  });
  return Object.freeze({
    kind: "blocked",
    blockedId: options.blockedId,
    connectionId: connection?.id ?? null,
  });
}
