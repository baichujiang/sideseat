import "server-only";

import { Prisma, type PrismaClient } from "@prisma/client";

import {
  actionContextTombstoneSnapshot,
} from "@/lib/v2/action-context-snapshot";
import {
  tombstoneActionCoordinationInterestReceipts,
} from "@/lib/v2/action-coordination/command";
import {
  canonicalPair,
  canonicalPairResourceId,
  stableCanonicalPairs,
  stableLockIds,
  type CanonicalUserPair,
  type UserPairInput,
} from "@/lib/v2/action-coordination/db-locks";
import {
  businessFunnelEventKeys,
  recordServerFunnelEvent,
} from "@/lib/v2/funnel-event-producer";

type SafetyInterestRow = {
  interestId: string;
  responderId: string;
  actionId: string;
  creatorId: string;
  category: "STUDY" | "MEALS" | "LANGUAGE" | "SPORTS" | "SHARED_COURSES" | "OTHER";
  policySchemaVersion: number | null;
  experimentKeySnapshot: string | null;
  experimentVariantSnapshot: "CONTROL" | "TREATMENT" | null;
  contextId: string;
  contextState: "WAITING" | "INITIATING" | "OPEN" | "ENDED" | "UNAVAILABLE";
  reservationGeneration: number;
  connectionId: string | null;
  activationId: string;
  activationConnectedAt: Date | null;
  activationTerminalReason:
    | "ACTION_FULFILLED_BEFORE_CONNECT"
    | "ACTION_EXPIRED_BEFORE_CONNECT"
    | "INTEREST_WITHDRAWN_BEFORE_CONNECT"
    | "SAFETY_UNAVAILABLE_BEFORE_CONNECT"
    | null;
  interestSurface: "FEED_CARD" | "ACTION_DETAIL";
};

export type CreatorGatedSafetySnapshot = Readonly<{
  pairs: readonly CanonicalUserPair[];
  ownedActionIds: readonly string[];
}>;

export type CreatorGatedSafetyTransitionResult = Readonly<{
  removedActionIds: readonly string[];
  tombstonedInterestIds: readonly string[];
  unavailableContextIds: readonly string[];
  endedOpenContextIds: readonly string[];
  terminalizedActivationIds: readonly string[];
}>;

function sourceKindForCategory(
  category: SafetyInterestRow["category"],
): "BUDDY_POST" | "COURSE_ACTION" {
  return category === "SHARED_COURSES" ? "COURSE_ACTION" : "BUDDY_POST";
}

function funnelSurface(surface: SafetyInterestRow["interestSurface"]) {
  return surface === "FEED_CARD" ? "DISCOVER_EXPLORE" : "ACTION_DETAIL";
}

function pairPredicate(
  pairs: readonly CanonicalUserPair[],
  creatorColumn: Prisma.Sql,
  responderColumn: Prisma.Sql,
): Prisma.Sql {
  if (pairs.length === 0) return Prisma.sql`FALSE`;
  return Prisma.join(
    pairs.map(
      (pair) => Prisma.sql`(
        ${creatorColumn} = ${pair.minUserId}
        AND ${responderColumn} = ${pair.maxUserId}
      ) OR (
        ${creatorColumn} = ${pair.maxUserId}
        AND ${responderColumn} = ${pair.minUserId}
      )`,
    ),
    " OR ",
  );
}

function removedActionPredicate(actionIds: readonly string[]): Prisma.Sql {
  return actionIds.length === 0
    ? Prisma.sql`FALSE`
    : Prisma.sql`action."id" IN (${Prisma.join(actionIds)})`;
}

function assertPairsLocked(
  rows: readonly Pick<SafetyInterestRow, "creatorId" | "responderId">[],
  pairs: readonly CanonicalUserPair[],
): void {
  const locked = new Set(pairs.map(canonicalPairResourceId));
  for (const row of rows) {
    if (row.creatorId === row.responderId) continue;
    const pair = canonicalPair(row.creatorId, row.responderId);
    if (!locked.has(canonicalPairResourceId(pair))) {
      throw new Error(
        "Creator-gated safety snapshot changed before every pair lock was acquired.",
      );
    }
  }
}

/**
 * Snapshot every pair that a user-global moderation command can affect. The
 * caller must already hold that user's global safety advisory lock; B-light
 * commands acquire the same endpoint locks before their pair locks.
 */
export async function snapshotCreatorGatedSafetyForUser(
  tx: Prisma.TransactionClient,
  userId: string,
): Promise<CreatorGatedSafetySnapshot> {
  const [interestPairs, connectionPairs, ownedActions] = await Promise.all([
    tx.$queryRaw<Array<{ creatorId: string; responderId: string }>>(Prisma.sql`
      SELECT DISTINCT
        action."userId" AS "creatorId",
        interest."userId" AS "responderId"
      FROM "ActionInterest" interest
      INNER JOIN "ClassmatePost" action
        ON action."id" = interest."classmatePostId"
      WHERE action."coordinationPolicy" = CAST(
          'CREATOR_GATED_V2' AS "ActionCoordinationPolicy"
        )
        AND (
          action."userId" = ${userId}
          OR interest."userId" = ${userId}
        )
        AND action."userId" <> interest."userId"
      ORDER BY action."userId", interest."userId"
    `),
    tx.connection.findMany({
      where: {
        OR: [{ userAId: userId }, { userBId: userId }],
        NOT: { userAId: userId, userBId: userId },
      },
      select: { userAId: true, userBId: true },
    }),
    tx.classmatePost.findMany({
      where: { userId, coordinationPolicy: "CREATOR_GATED_V2" },
      select: { id: true },
      orderBy: { id: "asc" },
    }),
  ]);
  return Object.freeze({
    pairs: Object.freeze(
      stableCanonicalPairs([
        ...interestPairs.map(
          (row) => [row.creatorId, row.responderId] as const,
        ),
        ...connectionPairs.map(
          (row) => [row.userAId, row.userBId] as const,
        ),
      ]),
    ),
    ownedActionIds: Object.freeze(ownedActions.map((row) => row.id)),
  });
}

/**
 * Privacy/safety convergence core. The caller owns the transaction and every
 * supplied pair lock. It mutates CREATOR_GATED_V2 only; DIRECT compatibility
 * rows remain the responsibility of the existing connection synchronizer.
 *
 * ADR-BL-001 makes Block a pair-wide hard stop. OPEN contexts are therefore
 * ended here even when they own a Plan; the later Commitment terminalizer
 * invalidates/cancels that Plan in the same transaction.
 */
export async function terminalizeCreatorGatedSafetyState(
  tx: Prisma.TransactionClient,
  options: Readonly<{
    pairs: readonly CanonicalUserPair[];
    removedActionIds?: readonly string[];
    occurredAt: Date;
  }>,
): Promise<CreatorGatedSafetyTransitionResult> {
  const pairs = stableCanonicalPairs(options.pairs as readonly UserPairInput[]);
  const removedActionIds = stableLockIds(options.removedActionIds ?? []);
  const pairWhere = pairPredicate(
    pairs,
    Prisma.sql`action."userId"`,
    Prisma.sql`interest."userId"`,
  );
  const removedWhere = removedActionPredicate(removedActionIds);

  const candidateActions = await tx.$queryRaw<Array<{ actionId: string }>>(
    Prisma.sql`
      SELECT DISTINCT action."id" AS "actionId"
      FROM "ClassmatePost" action
      LEFT JOIN "ActionInterest" interest
        ON interest."classmatePostId" = action."id"
      WHERE action."coordinationPolicy" = CAST(
          'CREATOR_GATED_V2' AS "ActionCoordinationPolicy"
        )
        AND (
          (${removedWhere})
          OR (interest."id" IS NOT NULL AND (${pairWhere}))
        )
      ORDER BY action."id"
    `,
  );
  const actionIds = stableLockIds(
    candidateActions.map((row) => row.actionId),
  );
  if (actionIds.length > 0) {
    await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT "id"
      FROM "ClassmatePost"
      WHERE "id" IN (${Prisma.join(actionIds)})
      ORDER BY "id"
      FOR UPDATE
    `);
  }

  const interestKeys = actionIds.length === 0
    ? []
    : await tx.$queryRaw<Array<{
        interestId: string;
        creatorId: string;
        responderId: string;
      }>>(Prisma.sql`
        SELECT
          interest."id" AS "interestId",
          action."userId" AS "creatorId",
          interest."userId" AS "responderId"
        FROM "ActionInterest" interest
        INNER JOIN "ClassmatePost" action
          ON action."id" = interest."classmatePostId"
        WHERE action."id" IN (${Prisma.join(actionIds)})
          AND action."coordinationPolicy" = CAST(
            'CREATOR_GATED_V2' AS "ActionCoordinationPolicy"
          )
          AND ((${removedWhere}) OR (${pairWhere}))
        ORDER BY interest."id"
      `);
  assertPairsLocked(interestKeys, pairs);
  const interestIds = stableLockIds(
    interestKeys.map((row) => row.interestId),
  );
  if (interestIds.length > 0) {
    await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT "id"
      FROM "ActionInterest"
      WHERE "id" IN (${Prisma.join(interestIds)})
      ORDER BY "id"
      FOR UPDATE
    `);
  }

  const rows = interestIds.length === 0
    ? []
    : await tx.$queryRaw<SafetyInterestRow[]>(Prisma.sql`
        SELECT
          interest."id" AS "interestId",
          interest."userId" AS "responderId",
          action."id" AS "actionId",
          action."userId" AS "creatorId",
          action."category",
          action."policySchemaVersion",
          action."experimentKeySnapshot",
          action."experimentVariantSnapshot",
          context."id" AS "contextId",
          context."state" AS "contextState",
          context."reservationGeneration",
          context."connectionId",
          activation."id" AS "activationId",
          activation."connectedAt" AS "activationConnectedAt",
          activation."terminalReason" AS "activationTerminalReason",
          activation."interestSurface"
        FROM "ActionInterest" interest
        INNER JOIN "ClassmatePost" action
          ON action."id" = interest."classmatePostId"
        INNER JOIN "ActionCoordinationContext" context
          ON context."interestId" = interest."id"
        INNER JOIN "ActionInterestActivation" activation
          ON activation."id" = context."currentActivationId"
        WHERE interest."id" IN (${Prisma.join(interestIds)})
        ORDER BY interest."id", activation."id", context."id"
        FOR UPDATE OF context, activation
      `);

  const occurredAt = new Date(options.occurredAt);
  if (!Number.isFinite(occurredAt.getTime())) {
    throw new TypeError("Creator-gated safety terminalization requires a valid time.");
  }
  const removedSet = new Set(removedActionIds);
  const actualRemoved = actionIds.filter((id) => removedSet.has(id));
  if (actualRemoved.length > 0) {
    await tx.classmatePost.updateMany({
      where: {
        id: { in: actualRemoved },
        coordinationPolicy: "CREATOR_GATED_V2",
        status: { not: "REMOVED" },
      },
      data: {
        status: "REMOVED",
        removedAt: occurredAt,
        updatedAt: occurredAt,
      },
    });
  }

  const tombstonedInterestIds: string[] = [];
  const unavailableContextIds: string[] = [];
  const endedOpenContextIds: string[] = [];
  const terminalizedActivationIds: string[] = [];

  for (const interestId of interestIds) {
    const row = rows.find((candidate) => candidate.interestId === interestId);
    if (!row) {
      throw new Error(
        "A creator-gated safety Interest has no authoritative Context activation.",
      );
    }
    const sourceKind = sourceKindForCategory(row.category);
    await tx.actionInterest.update({
      where: { id: row.interestId },
      data: {
        originSnapshot: actionContextTombstoneSnapshot({
          sourceKind,
          sourceId: row.actionId,
        }) as Prisma.InputJsonObject,
        updatedAt: occurredAt,
      },
    });
    tombstonedInterestIds.push(row.interestId);

    const attribution = {
      coordinationPolicy: "CREATOR_GATED_V2" as const,
      ...(row.policySchemaVersion
        ? { policySchemaVersion: row.policySchemaVersion }
        : {}),
      ...(row.experimentKeySnapshot && row.experimentVariantSnapshot
        ? {
            experimentKey: row.experimentKeySnapshot,
            experimentVariant: row.experimentVariantSnapshot,
          }
        : {}),
    };
    if (row.contextState === "WAITING" || row.contextState === "INITIATING") {
      await tx.actionCoordinationContext.update({
        where: { id: row.contextId },
        data: {
          state: "UNAVAILABLE",
          reservationId: null,
          leaseExpiresAt: null,
          updatedAt: occurredAt,
        },
      });
      unavailableContextIds.push(row.contextId);
      if (row.contextState === "INITIATING") {
        await recordServerFunnelEvent(tx, {
          businessEventKey: businessFunnelEventKeys.coordinationReleased(
            row.contextId,
            row.reservationGeneration,
          ),
          actorId: row.creatorId,
          name: "COORDINATION_RELEASED",
          surface: funnelSurface(row.interestSurface),
          sourceKind,
          sourceId: row.actionId,
          actionInterestId: row.interestId,
          interestActivationId: row.activationId,
          actionContextId: row.contextId,
          ...attribution,
          occurredAt,
        });
      }
      if (
        row.activationConnectedAt === null &&
        row.activationTerminalReason === null
      ) {
        const changed = await tx.actionInterestActivation.updateMany({
          where: {
            id: row.activationId,
            connectedAt: null,
            terminalReason: null,
          },
          data: {
            terminalReason: "SAFETY_UNAVAILABLE_BEFORE_CONNECT",
            terminalAt: occurredAt,
          },
        });
        if (changed.count === 1) {
          terminalizedActivationIds.push(row.activationId);
          await recordServerFunnelEvent(tx, {
            businessEventKey:
              businessFunnelEventKeys.actionInterestTerminated(row.activationId),
            actorId: row.responderId,
            name: "ACTION_INTEREST_TERMINATED",
            surface: funnelSurface(row.interestSurface),
            sourceKind,
            sourceId: row.actionId,
            actionInterestId: row.interestId,
            interestActivationId: row.activationId,
            actionContextId: row.contextId,
            interestSurface: row.interestSurface,
            terminalReason: "SAFETY_UNAVAILABLE_BEFORE_CONNECT",
            ...attribution,
            occurredAt,
          });
        }
      }
      continue;
    }

    if (row.contextState === "OPEN") {
      await tx.actionCoordinationContext.update({
        where: { id: row.contextId },
        data: {
          state: "ENDED",
          reservationId: null,
          leaseExpiresAt: null,
          endedAt: occurredAt,
          endedById: null,
          endReason: removedSet.has(row.actionId)
            ? "SOURCE_REMOVED"
            : "SAFETY_UNAVAILABLE",
          updatedAt: occurredAt,
        },
      });
      endedOpenContextIds.push(row.contextId);
    }
  }

  // Cached create/reactivate success envelopes contain the immutable LIVE
  // Action snapshot. Scrub them in the same safety transaction so a retry of
  // the original Idempotency-Key can never replay title/location/course after
  // the durable Interest has become a privacy tombstone.
  await tombstoneActionCoordinationInterestReceipts(
    tx,
    tombstonedInterestIds,
    occurredAt,
  );

  return Object.freeze({
    removedActionIds: Object.freeze(actualRemoved),
    tombstonedInterestIds: Object.freeze(stableLockIds(tombstonedInterestIds)),
    unavailableContextIds: Object.freeze(stableLockIds(unavailableContextIds)),
    endedOpenContextIds: Object.freeze(stableLockIds(endedOpenContextIds)),
    terminalizedActivationIds: Object.freeze(
      stableLockIds(terminalizedActivationIds),
    ),
  });
}

export type CreatorGatedSafetyDatabase = Pick<PrismaClient, "$transaction">;
