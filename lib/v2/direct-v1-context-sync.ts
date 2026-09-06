import {
  Prisma,
  type ConnectionStatus,
} from "@prisma/client";

import {
  pairSafetyLocks,
  stableLockIds,
} from "./action-coordination/db-locks";

export type DirectV1ConnectionTerminalStatus = Extract<
  ConnectionStatus,
  "ENDED" | "BLOCKED"
>;

export type DirectV1ConnectionTerminalTransition = Readonly<{
  connectionId: string;
  targetStatus: DirectV1ConnectionTerminalStatus;
  endedAt: Date;
  /** The Connection audit actor. Safety-blocked Contexts never retain it. */
  connectionEndedById: string | null;
  /** When supplied, the Connection must contain this participant. */
  requiredParticipantId?: string;
  /** When supplied, the other participant must be this user. */
  requiredCounterpartyId?: string;
}>;

export type DirectV1ConnectionTerminalTransitionResult = Readonly<{
  connectionId: string;
  kind: "transitioned" | "not_found" | "not_authorized" | "already_terminal";
  previousStatus?: ConnectionStatus;
  targetStatus?: DirectV1ConnectionTerminalStatus;
  endedAt?: Date;
  endedContextIds: readonly string[];
}>;

type ConnectionSnapshot = {
  id: string;
  userAId: string;
  userBId: string;
  status: ConnectionStatus;
  endedAt: Date | null;
};

type OpenDirectContextRow = {
  id: string;
  connectionId: string;
};

type DirectContextEvidenceRow = OpenDirectContextRow & {
  interestId: string;
  actionId: string;
};

function assertTimestamp(value: Date): Date {
  const timestamp = new Date(value);
  if (!Number.isFinite(timestamp.getTime())) {
    throw new TypeError("endedAt must be a valid timestamp.");
  }
  return timestamp;
}

/** Prisma Date parameters are timestamptz; persist the shared UTC-naive convention. */
function utcDatabaseTimestamp(value: Date): Prisma.Sql {
  return Prisma.sql`(CAST(${value} AS timestamptz) AT TIME ZONE 'UTC')`;
}

function transitionMap(
  transitions: readonly DirectV1ConnectionTerminalTransition[],
): Map<string, DirectV1ConnectionTerminalTransition> {
  const unique = new Map<string, DirectV1ConnectionTerminalTransition>();
  for (const transition of transitions) {
    if (!transition.connectionId) {
      throw new TypeError("connectionId must be non-empty.");
    }
    assertTimestamp(transition.endedAt);
    const previous = unique.get(transition.connectionId);
    if (previous) {
      const same =
        previous.targetStatus === transition.targetStatus &&
        previous.connectionEndedById === transition.connectionEndedById &&
        previous.requiredParticipantId === transition.requiredParticipantId &&
        previous.requiredCounterpartyId === transition.requiredCounterpartyId &&
        previous.endedAt.getTime() === transition.endedAt.getTime();
      if (!same) {
        throw new TypeError(
          `Conflicting terminal transitions for Connection ${transition.connectionId}.`,
        );
      }
      continue;
    }
    unique.set(transition.connectionId, transition);
  }
  return unique;
}

function participantMatch(
  connection: Pick<ConnectionSnapshot, "userAId" | "userBId">,
  transition: DirectV1ConnectionTerminalTransition,
): boolean {
  const participantId = transition.requiredParticipantId;
  if (
    participantId &&
    participantId !== connection.userAId &&
    participantId !== connection.userBId
  ) {
    return false;
  }
  const counterpartyId = transition.requiredCounterpartyId;
  if (!counterpartyId) return true;
  if (!participantId) {
    return (
      counterpartyId === connection.userAId ||
      counterpartyId === connection.userBId
    );
  }
  return (
    (participantId === connection.userAId &&
      counterpartyId === connection.userBId) ||
    (participantId === connection.userBId &&
      counterpartyId === connection.userAId)
  );
}

function validParticipantActor(
  connection: Pick<ConnectionSnapshot, "userAId" | "userBId">,
  actorId: string | null,
): string | null {
  return actorId === connection.userAId || actorId === connection.userBId
    ? actorId
    : null;
}

function sameParticipantPair(
  left: Pick<ConnectionSnapshot, "userAId" | "userBId">,
  right: Pick<ConnectionSnapshot, "userAId" | "userBId">,
): boolean {
  return (
    (left.userAId === right.userAId && left.userBId === right.userBId) ||
    (left.userAId === right.userBId && left.userBId === right.userAId)
  );
}

/**
 * Lock the source hierarchy for every qualifying compatibility Context before
 * any Connection row is locked. Identification is performed only after all
 * pair locks are held; the final Context query repeats every eligibility
 * predicate after Action and Interest locks, so a stale join can never cause a
 * creator-gated or otherwise changed Context to be projected.
 */
async function lockOpenDirectContexts(
  tx: Prisma.TransactionClient,
  connectionIds: readonly string[],
): Promise<readonly OpenDirectContextRow[]> {
  if (connectionIds.length === 0) return Object.freeze([]);

  const evidence = await tx.$queryRaw<DirectContextEvidenceRow[]>(Prisma.sql`
    SELECT
      context."id",
      context."connectionId",
      interest."id" AS "interestId",
      action."id" AS "actionId"
    FROM "ActionCoordinationContext" context
    INNER JOIN "ActionInterest" interest
      ON interest."id" = context."interestId"
      AND interest."connectionId" = context."connectionId"
    INNER JOIN "ClassmatePost" action
      ON action."id" = interest."classmatePostId"
    WHERE context."connectionId" IN (${Prisma.join(connectionIds)})
      AND context."state" = CAST('OPEN' AS "ActionCoordinationState")
      AND context."currentActivationId" IS NULL
      AND (
        action."coordinationPolicy" = CAST(
          'DIRECT_CONVERSATION_V1' AS "ActionCoordinationPolicy"
        )
        OR (
          action."coordinationPolicy" IS NULL
          AND action."policySchemaVersion" IS NULL
          AND action."policyParametersSnapshot" IS NULL
          AND action."experimentKeySnapshot" IS NULL
          AND action."experimentVariantSnapshot" IS NULL
          AND action."clientCapabilitySnapshot" IS NULL
          AND action."policySnapshottedAt" IS NULL
        )
      )
    ORDER BY context."id"
  `);
  if (evidence.length === 0) return Object.freeze([]);

  const actionIds = stableLockIds(evidence.map((row) => row.actionId));
  await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT "id"
    FROM "ClassmatePost"
    WHERE "id" IN (${Prisma.join(actionIds)})
    ORDER BY "id"
    FOR UPDATE
  `);

  const interestIds = stableLockIds(evidence.map((row) => row.interestId));
  await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT "id"
    FROM "ActionInterest"
    WHERE "id" IN (${Prisma.join(interestIds)})
    ORDER BY "id"
    FOR UPDATE
  `);

  const contextIds = stableLockIds(evidence.map((row) => row.id));
  const contexts = await tx.$queryRaw<OpenDirectContextRow[]>(Prisma.sql`
    SELECT context."id", context."connectionId"
    FROM "ActionCoordinationContext" context
    INNER JOIN "ActionInterest" interest
      ON interest."id" = context."interestId"
      AND interest."connectionId" = context."connectionId"
    INNER JOIN "ClassmatePost" action
      ON action."id" = interest."classmatePostId"
    WHERE context."id" IN (${Prisma.join(contextIds)})
      AND context."connectionId" IN (${Prisma.join(connectionIds)})
      AND context."state" = CAST('OPEN' AS "ActionCoordinationState")
      AND context."currentActivationId" IS NULL
      AND (
        action."coordinationPolicy" = CAST(
          'DIRECT_CONVERSATION_V1' AS "ActionCoordinationPolicy"
        )
        OR (
          action."coordinationPolicy" IS NULL
          AND action."policySchemaVersion" IS NULL
          AND action."policyParametersSnapshot" IS NULL
          AND action."experimentKeySnapshot" IS NULL
          AND action."experimentVariantSnapshot" IS NULL
          AND action."clientCapabilitySnapshot" IS NULL
          AND action."policySnapshottedAt" IS NULL
        )
      )
    ORDER BY context."id"
    FOR UPDATE OF context
  `);
  return Object.freeze(contexts);
}

/**
 * Terminalize ACTIVE Connections and their legacy DIRECT compatibility Contexts.
 *
 * This is intentionally transaction-only: the Connection transition and Context
 * projection must commit or roll back together. All affected pair locks are taken
 * before stable Action -> Interest -> Context -> Connection row locks, so the
 * admin multi-Connection path follows the same global order as Action commands
 * and cannot invert Connection/Context locks against an Interest mutation.
 *
 * Only OPEN, activation-less Contexts whose source Action is DIRECT_V1 (or a
 * pre-backfill null legacy policy) are projected. Creator-gated and already
 * terminal Contexts, Interests, Plans, Messages, events, and outbox rows are not
 * mutated here.
 */
export async function terminalizeConnectionsAndDirectV1Contexts(
  tx: Prisma.TransactionClient,
  transitions: readonly DirectV1ConnectionTerminalTransition[],
): Promise<readonly DirectV1ConnectionTerminalTransitionResult[]> {
  const requested = transitionMap(transitions);
  const requestedIds = stableLockIds([...requested.keys()]);
  if (requestedIds.length === 0) return Object.freeze([]);

  // This first read is only the pair-lock snapshot. The rows are re-read with
  // FOR UPDATE after every pair safety lock is held.
  const snapshots = await tx.connection.findMany({
    where: { id: { in: requestedIds } },
    select: {
      id: true,
      userAId: true,
      userBId: true,
      status: true,
      endedAt: true,
    },
  });
  await pairSafetyLocks(
    tx,
    snapshots
      .filter((connection) => connection.userAId !== connection.userBId)
      .map(
        (connection) =>
          [connection.userAId, connection.userBId] as const,
      ),
  );

  const snapshotById = new Map(
    snapshots.map((connection) => [connection.id, connection]),
  );
  const contextCandidateIds = stableLockIds(
    requestedIds.filter((connectionId) => {
      const snapshot = snapshotById.get(connectionId);
      const transition = requested.get(connectionId)!;
      return (
        snapshot !== undefined &&
        snapshot.userAId !== snapshot.userBId &&
        snapshot.status === "ACTIVE" &&
        participantMatch(snapshot, transition)
      );
    }),
  );
  const openContexts = await lockOpenDirectContexts(tx, contextCandidateIds);

  // Connection is deliberately the final row-lock level. Re-read and validate
  // the pair, authorization, and status after all earlier locks are held.
  const locked = await tx.$queryRaw<ConnectionSnapshot[]>(Prisma.sql`
    SELECT "id", "userAId", "userBId", "status", "endedAt"
    FROM "Connection"
    WHERE "id" IN (${Prisma.join(requestedIds)})
    ORDER BY "id"
    FOR UPDATE
  `);
  const byId = new Map(locked.map((connection) => [connection.id, connection]));
  const contextCandidateSet = new Set(contextCandidateIds);
  const eligible: Array<{
    connection: ConnectionSnapshot;
    transition: DirectV1ConnectionTerminalTransition;
    endedAt: Date;
  }> = [];
  const results = new Map<
    string,
    DirectV1ConnectionTerminalTransitionResult
  >();

  for (const connectionId of requestedIds) {
    const transition = requested.get(connectionId)!;
    const connection = byId.get(connectionId);
    if (!connection) {
      results.set(connectionId, {
        connectionId,
        kind: "not_found",
        endedContextIds: Object.freeze([]),
      });
      continue;
    }
    const snapshot = snapshotById.get(connectionId);
    if (
      !snapshot ||
      snapshot.userAId === snapshot.userBId ||
      !sameParticipantPair(snapshot, connection) ||
      !participantMatch(connection, transition)
    ) {
      results.set(connectionId, {
        connectionId,
        kind: "not_authorized",
        previousStatus: connection.status,
        endedContextIds: Object.freeze([]),
      });
      continue;
    }
    if (connection.status !== "ACTIVE") {
      results.set(connectionId, {
        connectionId,
        kind: "already_terminal",
        previousStatus: connection.status,
        endedAt: connection.endedAt ?? undefined,
        endedContextIds: Object.freeze([]),
      });
      continue;
    }
    if (!contextCandidateSet.has(connectionId)) {
      results.set(connectionId, {
        connectionId,
        kind: "not_authorized",
        previousStatus: connection.status,
        endedContextIds: Object.freeze([]),
      });
      continue;
    }
    eligible.push({
      connection,
      transition,
      endedAt: assertTimestamp(transition.endedAt),
    });
  }

  const contextsByConnection = new Map<string, string[]>();
  for (const context of openContexts) {
    const ids = contextsByConnection.get(context.connectionId) ?? [];
    ids.push(context.id);
    contextsByConnection.set(context.connectionId, ids);
  }

  for (const { connection, transition, endedAt } of eligible) {
    const endedAtSql = utcDatabaseTimestamp(endedAt);
    const connectionUpdateCount = await tx.$executeRaw(Prisma.sql`
      UPDATE "Connection"
      SET
        "status" = CAST(${transition.targetStatus} AS "ConnectionStatus"),
        "endedAt" = ${endedAtSql},
        "endedById" = ${transition.connectionEndedById},
        "updatedAt" = ${endedAtSql}
      WHERE "id" = ${connection.id}
        AND "status" = CAST('ACTIVE' AS "ConnectionStatus")
    `);
    if (connectionUpdateCount !== 1) {
      results.set(connection.id, {
        connectionId: connection.id,
        kind: "already_terminal",
        previousStatus: connection.status,
        endedContextIds: Object.freeze([]),
      });
      continue;
    }

    const contextIds = stableLockIds(contextsByConnection.get(connection.id) ?? []);
    if (contextIds.length > 0) {
      const safetyEnded = transition.targetStatus === "BLOCKED";
      const contextEndedById = safetyEnded
        ? null
        : validParticipantActor(connection, transition.connectionEndedById);
      const endReason = safetyEnded ? "SAFETY_UNAVAILABLE" : "USER_ENDED";
      await tx.$executeRaw(Prisma.sql`
        UPDATE "ActionCoordinationContext"
        SET
          "state" = CAST('ENDED' AS "ActionCoordinationState"),
          "endedAt" = ${endedAtSql},
          "endedById" = ${contextEndedById},
          "endReason" = CAST(${endReason} AS "ActionCoordinationEndReason"),
          "updatedAt" = ${endedAtSql}
        WHERE "id" IN (${Prisma.join(contextIds)})
          AND "state" = CAST('OPEN' AS "ActionCoordinationState")
          AND "currentActivationId" IS NULL
      `);
    }

    results.set(connection.id, {
      connectionId: connection.id,
      kind: "transitioned",
      previousStatus: connection.status,
      targetStatus: transition.targetStatus,
      endedAt,
      endedContextIds: Object.freeze(contextIds),
    });
  }

  return Object.freeze(
    requestedIds.map((connectionId) => results.get(connectionId)!),
  );
}

export async function terminalizeConnectionAndDirectV1Contexts(
  tx: Prisma.TransactionClient,
  transition: DirectV1ConnectionTerminalTransition,
): Promise<DirectV1ConnectionTerminalTransitionResult> {
  const results = await terminalizeConnectionsAndDirectV1Contexts(tx, [
    transition,
  ]);
  return results[0]!;
}
