import {
  Prisma,
  type ActionCoordinationPolicy,
  type ActionCoordinationState,
  type ActionInterestSurface,
  type ActionInterestTerminalReason,
  type ClassmatePostCategory,
  type ClassmatePostStatus,
  type ExperimentVariant,
  type PrismaClient,
  type ProductFunnelSourceKind,
} from "@prisma/client";

import { prisma } from "@/lib/db/prisma";

import {
  appliedWorkerTransition,
  runGuardedActionCoordinationWorkerTransition,
  skippedWorkerTransition,
  type ActionCoordinationClock,
  type ActionCoordinationDatabase,
  type ActionCoordinationTransactionContext,
  type ActionCoordinationTransactionOptions,
  type GuardedWorkerTransitionResult,
} from "./action-coordination/command";
import {
  canonicalPairResourceId,
  stableCanonicalPairs,
  stableLockIds,
  type CanonicalUserPair,
  type UserPairInput,
} from "./action-coordination/db-locks";
import {
  businessFunnelEventKeys,
  recordServerFunnelEvent,
} from "./funnel-event-producer";

type LifecycleDatabase = ActionCoordinationDatabase &
  Pick<PrismaClient, "$queryRaw">;

export type ActionLifecycleFinalizerDependencies = Readonly<{
  db?: LifecycleDatabase;
  clock?: ActionCoordinationClock;
  transactionOptions?: ActionCoordinationTransactionOptions;
  /** A changed non-locking pair snapshot is retried in a fresh transaction. */
  maxSnapshotAttempts?: number;
}>;

export type ActionExpiryPairSnapshot = Readonly<{
  actionId: string;
  creatorId: string;
  pairs: readonly CanonicalUserPair[];
}>;

export type ActionExpiryApplied = Readonly<{
  actionId: string;
  previousStatus: "ACTIVE" | "CLOSED";
  expiredAt: Date;
  unavailableContextIds: readonly string[];
  releasedContextIds: readonly string[];
  terminalizedActivationIds: readonly string[];
}>;

export type LeaseRecoveryApplied = Readonly<{
  actionId: string;
  contextId: string;
  reservationGeneration: number;
  releasedAt: Date;
}>;

type SnapshotRow = {
  actionId: string;
  creatorId: string;
  responderId: string | null;
};

type LockedActionRow = {
  id: string;
  creatorId: string;
  category: ClassmatePostCategory;
  status: ClassmatePostStatus;
  expiresAt: Date;
  expiredAt: Date | null;
  coordinationPolicy: ActionCoordinationPolicy | null;
  policySchemaVersion: number | null;
  experimentKeySnapshot: string | null;
  experimentVariantSnapshot: ExperimentVariant | null;
};

type LockedUnresolvedContextRow = {
  contextId: string;
  contextState: ActionCoordinationState;
  reservationGeneration: number;
  interestId: string;
  responderId: string;
  activationId: string;
  activationConnectedAt: Date | null;
  activationTerminalReason: ActionInterestTerminalReason | null;
  interestSurface: ActionInterestSurface;
};

type LeaseSnapshotRow = {
  actionId: string;
  creatorId: string;
  responderId: string;
};

type LockedLeaseRow = LockedUnresolvedContextRow & {
  actionId: string;
  creatorId: string;
  category: ClassmatePostCategory;
  reservationId: string | null;
  leaseExpiresAt: Date | null;
  coordinationPolicy: ActionCoordinationPolicy | null;
  policySchemaVersion: number | null;
  experimentKeySnapshot: string | null;
  experimentVariantSnapshot: ExperimentVariant | null;
};

export type ReservationReleaseGuard = Readonly<{
  expectedReservationId?: string;
  expectedCreatorId?: string;
  onlyWhenExpired?: boolean;
}>;

class ChangedActionPairSnapshotError extends Error {
  constructor(readonly actionId: string) {
    super(`Action ${actionId} acquired a new affected pair after its snapshot.`);
    this.name = "ChangedActionPairSnapshotError";
  }
}

function sourceKindForCategory(
  category: ClassmatePostCategory,
): ProductFunnelSourceKind {
  return category === "SHARED_COURSES" ? "COURSE_ACTION" : "BUDDY_POST";
}

function snapshotAttribution(action: {
  coordinationPolicy: ActionCoordinationPolicy | null;
  policySchemaVersion: number | null;
  experimentKeySnapshot: string | null;
  experimentVariantSnapshot: ExperimentVariant | null;
}) {
  return {
    ...(action.coordinationPolicy
      ? { coordinationPolicy: action.coordinationPolicy }
      : {}),
    ...(action.policySchemaVersion
      ? { policySchemaVersion: action.policySchemaVersion }
      : {}),
    ...(action.experimentKeySnapshot && action.experimentVariantSnapshot
      ? {
          experimentKey: action.experimentKeySnapshot,
          experimentVariant: action.experimentVariantSnapshot,
        }
      : {}),
  };
}

function pairSet(pairs: readonly CanonicalUserPair[]): Set<string> {
  return new Set(pairs.map(canonicalPairResourceId));
}

function assertAllAffectedPairsAreLocked(
  actionId: string,
  creatorId: string,
  responderIds: readonly string[],
  lockedPairs: readonly CanonicalUserPair[],
): void {
  const locked = pairSet(lockedPairs);
  for (const pair of stableCanonicalPairs(
    responderIds.map((responderId) => [creatorId, responderId] as const),
  )) {
    if (!locked.has(canonicalPairResourceId(pair))) {
      throw new ChangedActionPairSnapshotError(actionId);
    }
  }
}

function positiveAttemptCount(value: number | undefined): number {
  const attempts = value ?? 3;
  if (!Number.isSafeInteger(attempts) || attempts < 1 || attempts > 10) {
    throw new TypeError("maxSnapshotAttempts must be an integer from 1 to 10.");
  }
  return attempts;
}

/** Prisma raw Date parameters are timestamptz; persist the shared UTC wall-time convention. */
function utcDatabaseTimestamp(value: Date): Prisma.Sql {
  return Prisma.sql`(CAST(${value} AS timestamptz) AT TIME ZONE 'UTC')`;
}

/**
 * Take the required non-locking pair snapshot for every existing Interest.
 * This includes every Context state (especially OPEN) and also safely covers a
 * legacy/repair row whose Context has not been materialized. OPEN is preserved
 * by expiry, but its pair lock still serializes Plan mutation with Action expiry.
 */
export async function snapshotActionExpiryPairs(
  actionId: string,
  db: Pick<PrismaClient, "$queryRaw"> = prisma,
): Promise<ActionExpiryPairSnapshot | null> {
  const rows = await db.$queryRaw<SnapshotRow[]>(Prisma.sql`
    SELECT
      action."id" AS "actionId",
      action."userId" AS "creatorId",
      interest."userId" AS "responderId"
    FROM "ClassmatePost" action
    LEFT JOIN "ActionInterest" interest
      ON interest."classmatePostId" = action."id"
    WHERE action."id" = ${actionId}
    ORDER BY interest."userId" ASC NULLS FIRST
  `);
  const first = rows[0];
  if (!first) return null;
  const responders = rows.flatMap((row) =>
    row.responderId ? [row.responderId] : [],
  );
  return Object.freeze({
    actionId: first.actionId,
    creatorId: first.creatorId,
    pairs: Object.freeze(
      stableCanonicalPairs(
        responders.map((responderId) => [first.creatorId, responderId] as const),
      ),
    ),
  });
}

/**
 * Transaction core shared by lazy mutation paths and the lifecycle worker.
 * The caller must have acquired every pair from a prior non-locking snapshot.
 */
export async function finalizeActionExpiryInTransaction(
  context: ActionCoordinationTransactionContext,
  actionId: string,
): Promise<GuardedWorkerTransitionResult<ActionExpiryApplied>> {
  const actions = await context.tx.$queryRaw<LockedActionRow[]>(Prisma.sql`
    SELECT
      "id",
      "userId" AS "creatorId",
      "category",
      "status",
      "expiresAt",
      "expiredAt",
      "coordinationPolicy",
      "policySchemaVersion",
      "experimentKeySnapshot",
      "experimentVariantSnapshot"
    FROM "ClassmatePost"
    WHERE "id" = ${actionId}
    FOR UPDATE
  `);
  const action = actions[0];
  if (!action) {
    return skippedWorkerTransition({ actionId, missing: true });
  }

  // Revalidate the complete Interest pair set after the Action row is locked.
  // New Action-scoped mutations now wait on this Action, while every pair that
  // existed in the non-locking snapshot is already held in stable order.
  const allInterestPairs = await context.tx.$queryRaw<
    Array<{ responderId: string }>
  >(Prisma.sql`
    SELECT interest."userId" AS "responderId"
    FROM "ActionInterest" interest
    WHERE interest."classmatePostId" = ${actionId}
    ORDER BY interest."userId", interest."id"
  `);
  assertAllAffectedPairsAreLocked(
    actionId,
    action.creatorId,
    allInterestPairs.map((row) => row.responderId),
    context.pairs,
  );

  if (
    (action.status !== "ACTIVE" && action.status !== "CLOSED") ||
    action.expiresAt.getTime() > context.now.getTime()
  ) {
    return skippedWorkerTransition({
      actionId,
      status: action.status,
      expiresAt: action.expiresAt.toISOString(),
    });
  }

  const unresolved = await context.tx.$queryRaw<LockedUnresolvedContextRow[]>(
    Prisma.sql`
      SELECT
        context."id" AS "contextId",
        context."state" AS "contextState",
        context."reservationGeneration",
        interest."id" AS "interestId",
        interest."userId" AS "responderId",
        activation."id" AS "activationId",
        activation."connectedAt" AS "activationConnectedAt",
        activation."terminalReason" AS "activationTerminalReason",
        activation."interestSurface"
      FROM "ActionInterest" interest
      INNER JOIN "ActionCoordinationContext" context
        ON context."interestId" = interest."id"
      INNER JOIN "ActionInterestActivation" activation
        ON activation."id" = context."currentActivationId"
      WHERE interest."classmatePostId" = ${actionId}
        AND context."state" IN (
          CAST('WAITING' AS "ActionCoordinationState"),
          CAST('INITIATING' AS "ActionCoordinationState")
        )
      -- The global pair locks already exclude cross-pair deadlocks. The
      -- remaining one-to-one rows use one immutable composite ID order so
      -- every finalizer locks this same Interest/Activation/Context set alike.
      ORDER BY interest."id", activation."id", context."id"
      FOR UPDATE OF interest, context, activation
    `,
  );
  const previousStatus = action.status;
  const databaseNow = utcDatabaseTimestamp(context.now);
  const expired = await context.tx.$queryRaw<Array<{ expiredAt: Date }>>(
    Prisma.sql`
      UPDATE "ClassmatePost"
      SET
        "status" = CAST('EXPIRED' AS "ClassmatePostStatus"),
        "expiredAt" = COALESCE("expiredAt", ${databaseNow}),
        "updatedAt" = ${databaseNow}
      WHERE "id" = ${actionId}
        AND "status" IN (
          CAST('ACTIVE' AS "ClassmatePostStatus"),
          CAST('CLOSED' AS "ClassmatePostStatus")
        )
        AND "expiresAt" <= ${databaseNow}
      RETURNING "expiredAt"
    `,
  );
  if (!expired[0]) {
    return skippedWorkerTransition({ actionId, status: action.status });
  }

  const releasedContextIds: string[] = [];
  const terminalizedActivationIds: string[] = [];
  const sourceKind = sourceKindForCategory(action.category);
  const attribution = snapshotAttribution(action);

  for (const row of unresolved) {
    const changed = await context.tx.$queryRaw<Array<{ id: string }>>(
      Prisma.sql`
        UPDATE "ActionCoordinationContext"
        SET
          "state" = CAST('UNAVAILABLE' AS "ActionCoordinationState"),
          "reservationId" = NULL,
          "leaseExpiresAt" = NULL,
          "updatedAt" = ${databaseNow}
        WHERE "id" = ${row.contextId}
          AND "state" = CAST(${row.contextState} AS "ActionCoordinationState")
        RETURNING "id"
      `,
    );
    if (!changed[0]) continue;

    if (row.contextState === "INITIATING") {
      await recordServerFunnelEvent(context.tx, {
        businessEventKey: businessFunnelEventKeys.coordinationReleased(
          row.contextId,
          row.reservationGeneration,
        ),
        actorId: action.creatorId,
        name: "COORDINATION_RELEASED",
        surface: "ACTION_DETAIL",
        sourceKind,
        sourceId: actionId,
        actionInterestId: row.interestId,
        interestActivationId: row.activationId,
        actionContextId: row.contextId,
        ...attribution,
        occurredAt: context.now,
      });
      releasedContextIds.push(row.contextId);
    }

    if (
      row.activationConnectedAt === null &&
      row.activationTerminalReason === null
    ) {
      const terminalized = await context.tx.$queryRaw<Array<{ id: string }>>(
        Prisma.sql`
          UPDATE "ActionInterestActivation"
          SET
            "terminalReason" = CAST(
              'ACTION_EXPIRED_BEFORE_CONNECT'
              AS "ActionInterestTerminalReason"
            ),
            "terminalAt" = ${databaseNow}
          WHERE "id" = ${row.activationId}
            AND "connectedAt" IS NULL
            AND "terminalReason" IS NULL
          RETURNING "id"
        `,
      );
      if (terminalized[0]) {
        await recordServerFunnelEvent(context.tx, {
          businessEventKey:
            businessFunnelEventKeys.actionInterestTerminated(row.activationId),
          actorId: row.responderId,
          name: "ACTION_INTEREST_TERMINATED",
          surface: "ACTION_DETAIL",
          sourceKind,
          sourceId: actionId,
          actionInterestId: row.interestId,
          interestActivationId: row.activationId,
          actionContextId: row.contextId,
          interestSurface: row.interestSurface,
          terminalReason: "ACTION_EXPIRED_BEFORE_CONNECT",
          ...attribution,
          occurredAt: context.now,
        });
        terminalizedActivationIds.push(row.activationId);
      }
    }
  }

  return appliedWorkerTransition(
    Object.freeze({
      actionId,
      previousStatus,
      expiredAt: new Date(expired[0].expiredAt),
      unavailableContextIds: Object.freeze(
        stableLockIds(unresolved.map((row) => row.contextId)),
      ),
      releasedContextIds: Object.freeze(stableLockIds(releasedContextIds)),
      terminalizedActivationIds: Object.freeze(
        stableLockIds(terminalizedActivationIds),
      ),
    }),
  );
}

/** Worker/lazy wrapper. It retries only when the non-locking pair snapshot grew. */
export async function finalizeActionExpiry(
  actionId: string,
  dependencies: ActionLifecycleFinalizerDependencies = {},
): Promise<GuardedWorkerTransitionResult<ActionExpiryApplied>> {
  const db = dependencies.db ?? prisma;
  const attempts = positiveAttemptCount(dependencies.maxSnapshotAttempts);
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const snapshot = await snapshotActionExpiryPairs(actionId, db);
    if (!snapshot) {
      return skippedWorkerTransition({ actionId, missing: true });
    }
    try {
      return await runGuardedActionCoordinationWorkerTransition(
        {
          pairs: snapshot.pairs,
          transition: (context) =>
            finalizeActionExpiryInTransaction(context, actionId),
        },
        {
          db,
          clock: dependencies.clock,
          transactionOptions: dependencies.transactionOptions,
        },
      );
    } catch (cause) {
      if (cause instanceof ChangedActionPairSnapshotError && attempt < attempts) {
        continue;
      }
      throw cause;
    }
  }
  throw new Error("Action expiry snapshot retry loop exited unexpectedly.");
}

async function snapshotLeasePair(
  contextId: string,
  db: Pick<PrismaClient, "$queryRaw">,
): Promise<LeaseSnapshotRow | null> {
  const rows = await db.$queryRaw<LeaseSnapshotRow[]>(Prisma.sql`
    SELECT
      action."id" AS "actionId",
      action."userId" AS "creatorId",
      interest."userId" AS "responderId"
    FROM "ActionCoordinationContext" context
    INNER JOIN "ActionInterest" interest ON interest."id" = context."interestId"
    INNER JOIN "ClassmatePost" action ON action."id" = interest."classmatePostId"
    WHERE context."id" = ${contextId}
    LIMIT 1
  `);
  return rows[0] ?? null;
}

/**
 * Context-only lease core. It never acquires the Action row after the pair lock;
 * the unlocked joins only revalidate which canonical pair owns the Context.
 */
export async function releaseInitiatingReservationInTransaction(
  context: ActionCoordinationTransactionContext,
  contextId: string,
  guard: ReservationReleaseGuard = {},
): Promise<GuardedWorkerTransitionResult<LeaseRecoveryApplied>> {
  const rows = await context.tx.$queryRaw<LockedLeaseRow[]>(Prisma.sql`
    SELECT
      context."id" AS "contextId",
      context."state" AS "contextState",
      context."reservationGeneration",
      context."reservationId",
      context."leaseExpiresAt",
      interest."id" AS "interestId",
      interest."userId" AS "responderId",
      activation."id" AS "activationId",
      activation."connectedAt" AS "activationConnectedAt",
      activation."terminalReason" AS "activationTerminalReason",
      activation."interestSurface",
      action."id" AS "actionId",
      action."userId" AS "creatorId",
      action."category",
      action."coordinationPolicy",
      action."policySchemaVersion",
      action."experimentKeySnapshot",
      action."experimentVariantSnapshot"
    FROM "ActionCoordinationContext" context
    INNER JOIN "ActionInterest" interest ON interest."id" = context."interestId"
    INNER JOIN "ActionInterestActivation" activation
      ON activation."id" = context."currentActivationId"
    INNER JOIN "ClassmatePost" action ON action."id" = interest."classmatePostId"
    WHERE context."id" = ${contextId}
    FOR UPDATE OF context
  `);
  const row = rows[0];
  if (!row) {
    return skippedWorkerTransition({ contextId, missing: true });
  }
  assertAllAffectedPairsAreLocked(
    row.actionId,
    row.creatorId,
    [row.responderId],
    context.pairs,
  );
  if (
    row.contextState !== "INITIATING" ||
    row.reservationId === null ||
    row.leaseExpiresAt === null ||
    (guard.expectedReservationId !== undefined &&
      row.reservationId !== guard.expectedReservationId) ||
    (guard.expectedCreatorId !== undefined &&
      row.creatorId !== guard.expectedCreatorId) ||
    (guard.onlyWhenExpired === true &&
      row.leaseExpiresAt.getTime() > context.now.getTime())
  ) {
    return skippedWorkerTransition({
      contextId,
      state: row.contextState,
      leaseExpiresAt: row.leaseExpiresAt?.toISOString() ?? null,
    });
  }

  const released = await context.tx.$queryRaw<Array<{ id: string }>>(
    Prisma.sql`
      UPDATE "ActionCoordinationContext"
      SET
        "state" = CAST('WAITING' AS "ActionCoordinationState"),
        "reservationId" = NULL,
        "leaseExpiresAt" = NULL,
        "updatedAt" = ${utcDatabaseTimestamp(context.now)}
      WHERE "id" = ${contextId}
        AND "state" = CAST('INITIATING' AS "ActionCoordinationState")
        AND "reservationId" = CAST(${row.reservationId} AS UUID)
        ${
          guard.onlyWhenExpired === true
            ? Prisma.sql`AND "leaseExpiresAt" <= ${utcDatabaseTimestamp(context.now)}`
            : Prisma.empty
        }
      RETURNING "id"
    `,
  );
  if (!released[0]) {
    return skippedWorkerTransition({ contextId, state: row.contextState });
  }

  await recordServerFunnelEvent(context.tx, {
    businessEventKey: businessFunnelEventKeys.coordinationReleased(
      contextId,
      row.reservationGeneration,
    ),
    actorId: row.creatorId,
    name: "COORDINATION_RELEASED",
    surface:
      row.interestSurface === "FEED_CARD"
        ? "DISCOVER_EXPLORE"
        : "ACTION_DETAIL",
    sourceKind: sourceKindForCategory(row.category),
    sourceId: row.actionId,
    actionInterestId: row.interestId,
    interestActivationId: row.activationId,
    actionContextId: contextId,
    ...snapshotAttribution(row),
    occurredAt: context.now,
  });

  return appliedWorkerTransition(
    Object.freeze({
      actionId: row.actionId,
      contextId,
      reservationGeneration: row.reservationGeneration,
      releasedAt: new Date(context.now),
    }),
  );
}

export async function recoverExpiredReservationLeaseInTransaction(
  context: ActionCoordinationTransactionContext,
  contextId: string,
): Promise<GuardedWorkerTransitionResult<LeaseRecoveryApplied>> {
  return releaseInitiatingReservationInTransaction(context, contextId, {
    onlyWhenExpired: true,
  });
}

export async function recoverExpiredReservationLease(
  contextId: string,
  dependencies: Omit<
    ActionLifecycleFinalizerDependencies,
    "maxSnapshotAttempts"
  > = {},
): Promise<GuardedWorkerTransitionResult<LeaseRecoveryApplied>> {
  const db = dependencies.db ?? prisma;
  const snapshot = await snapshotLeasePair(contextId, db);
  if (!snapshot) {
    return skippedWorkerTransition({ contextId, missing: true });
  }
  const pair: UserPairInput = [snapshot.creatorId, snapshot.responderId];
  return runGuardedActionCoordinationWorkerTransition(
    {
      pairs: [pair],
      transition: (context) =>
        recoverExpiredReservationLeaseInTransaction(context, contextId),
    },
    {
      db,
      clock: dependencies.clock,
      transactionOptions: dependencies.transactionOptions,
    },
  );
}
