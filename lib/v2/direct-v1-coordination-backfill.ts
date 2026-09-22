import {
  Prisma,
  type ActionCoordinationEndReason,
  type ActionCoordinationState,
  type ActionInterestStatus,
  type ClassmatePostCategory,
  type ClassmatePostStatus,
  type ConnectionStatus,
  type PrismaClient,
} from "@prisma/client";

import { prisma } from "@/lib/db/prisma";

import type {
  ActionCoordinationDatabase,
  ActionCoordinationTransactionOptions,
} from "./action-coordination/command";
import {
  canonicalPairResourceId,
  pairSafetyLock,
  pairSafetyLocks,
  stableCanonicalPairs,
  type CanonicalUserPair,
} from "./action-coordination/db-locks";
import {
  actionPolicyTupleKind,
  directConversationPolicyTupleKind,
} from "./action-coordination/policy-snapshot";
import { parseActionContextSnapshot } from "./action-context-snapshot";

export type DirectV1BackfillMode = "dry-run" | "apply";
export type DirectV1BackfillPhase = "actions" | "interests";
export type DirectV1BackfillNextPhase = DirectV1BackfillPhase | "complete";

export type DirectV1BackfillCursor = Readonly<{
  createdAt: Date | string;
  id: string;
}>;

export type DirectV1BackfillFindingCode =
  | "ACTION_TERMINAL_UNSAFE_TO_INFER"
  | "ACTION_CREATOR_GATED_EVIDENCE"
  | "ACTION_PARTIAL_OR_INVALID_POLICY"
  | "ACTION_POLICY_MISSING"
  | "INTEREST_SELF_PAIR"
  | "INTEREST_PAIR_CHANGED"
  | "INTEREST_ACTION_NOT_DIRECT"
  | "INTEREST_MISSING_CONNECTION"
  | "INTEREST_CONNECTION_NOT_FOUND"
  | "INTEREST_CONNECTION_PAIR_MISMATCH"
  | "INTEREST_ORIGIN_SNAPSHOT_INVALID"
  | "INTEREST_ACTIVE_CONNECTION_HAS_END_FIELDS"
  | "INTEREST_TERMINAL_CONNECTION_MISSING_ENDED_AT"
  | "INTEREST_TERMINAL_CONNECTION_ENDS_BEFORE_INTEREST"
  | "INTEREST_CONNECTION_ENDED_BY_MISMATCH"
  | "INTEREST_CONTEXT_CONFLICT"
  | "INTEREST_CONTEXT_MISSING";

export type DirectV1BackfillFinding = Readonly<{
  severity: "quarantine" | "violation";
  code: DirectV1BackfillFindingCode;
  entityKind: "action" | "interest";
  entityId: string;
}>;

type DirectV1BackfillDatabase = ActionCoordinationDatabase &
  Pick<PrismaClient, "$queryRaw">;

export type DirectV1BackfillDependencies = Readonly<{
  db?: DirectV1BackfillDatabase;
  transactionOptions?: ActionCoordinationTransactionOptions;
}>;

type DirectV1BackfillBaseOptions = DirectV1BackfillDependencies &
  Readonly<{
    phase?: DirectV1BackfillPhase;
    batchSize?: number;
    through: Date | string;
    cursor?: DirectV1BackfillCursor | null;
    maxFindings?: number;
  }>;

export type DirectV1BackfillOptions = DirectV1BackfillBaseOptions &
  Readonly<{ mode?: DirectV1BackfillMode }>;

export type DirectV1VerificationOptions = DirectV1BackfillBaseOptions;

type PageResult = Readonly<{
  phase: DirectV1BackfillPhase;
  through: Date;
  cursor: Readonly<{ createdAt: Date; id: string }> | null;
  nextCursor: Readonly<{ createdAt: Date; id: string }> | null;
  nextPhase: DirectV1BackfillNextPhase;
  hasMore: boolean;
}>;

export type DirectV1BackfillBatchReport = PageResult &
  Readonly<{
    mode: DirectV1BackfillMode;
    scannedActions: number;
    snapshottedActions: number;
    noOpActions: number;
    skippedNonDirectActions: number;
    scannedInterests: number;
    createdContexts: number;
    noOpContexts: number;
    skippedNonDirectInterests: number;
    quarantined: number;
    findingsTruncated: boolean;
    findings: readonly DirectV1BackfillFinding[];
  }>;

export type DirectV1VerificationReport = PageResult &
  Readonly<{
    scannedActions: number;
    scannedInterests: number;
    verifiedActions: number;
    verifiedContexts: number;
    skippedNonDirectActions: number;
    skippedNonDirectInterests: number;
    quarantined: number;
    violations: number;
    findingsTruncated: boolean;
    findings: readonly DirectV1BackfillFinding[];
  }>;

type PageRow = { id: string; createdAt: Date };

type LockedActionRow = {
  id: string;
  creatorId: string;
  category: ClassmatePostCategory;
  status: ClassmatePostStatus;
  coordinationPolicy: "DIRECT_CONVERSATION_V1" | "CREATOR_GATED_V2" | null;
  policySchemaVersion: number | null;
  policyParametersSnapshot: Prisma.JsonValue | null;
  experimentKeySnapshot: string | null;
  experimentVariantSnapshot: "CONTROL" | "TREATMENT" | null;
  clientCapabilitySnapshot: Prisma.JsonValue | null;
  policySnapshottedAt: Date | null;
  createdAt: Date;
};

type LockedInterestRow = {
  id: string;
  responderId: string;
  actionId: string;
  connectionId: string | null;
  originSnapshot: Prisma.JsonValue;
  status: ActionInterestStatus;
  withdrawnAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

type LockedContextRow = {
  id: string;
  interestId: string;
  currentActivationId: string | null;
  state: ActionCoordinationState;
  reservationId: string | null;
  reservationGeneration: number;
  leaseExpiresAt: Date | null;
  connectionId: string | null;
  activatedAt: Date | null;
  firstCounterpartResponseAt: Date | null;
  endedAt: Date | null;
  endedById: string | null;
  endReason: ActionCoordinationEndReason | null;
  createdAt: Date;
  updatedAt: Date;
};

type LockedConnectionRow = {
  id: string;
  userAId: string;
  userBId: string;
  status: ConnectionStatus;
  endedById: string | null;
  endedAt: Date | null;
};

type ActionProcessResult =
  | Readonly<{ kind: "snapshotted" }>
  | Readonly<{ kind: "noop" }>
  | Readonly<{ kind: "skipped-non-direct" }>
  | Readonly<{ kind: "missing" }>
  | Readonly<{ kind: "quarantined"; finding: DirectV1BackfillFinding }>;

type InterestProcessResult =
  | Readonly<{ kind: "created" }>
  | Readonly<{ kind: "noop" }>
  | Readonly<{ kind: "skipped-non-direct" }>
  | Readonly<{ kind: "missing" }>
  | Readonly<{ kind: "quarantined"; finding: DirectV1BackfillFinding }>;

type ExpectedContext = Readonly<{
  state: "OPEN" | "ENDED";
  activatedAt: Date;
  endedAt: Date | null;
  endedById: string | null;
  endReason: "USER_ENDED" | "SAFETY_UNAVAILABLE" | null;
  updatedAt: Date;
}>;

const DEFAULT_BATCH_SIZE = 100;
const DEFAULT_MAX_FINDINGS = 100;

class ChangedBackfillPairSnapshotError extends Error {
  constructor(readonly entityId: string) {
    super(`Backfill pair snapshot changed for ${entityId}.`);
    this.name = "ChangedBackfillPairSnapshotError";
  }
}

function validDate(value: Date | string, label: string): Date {
  const parsed = value instanceof Date ? new Date(value) : new Date(value);
  if (!Number.isFinite(parsed.getTime())) {
    throw new TypeError(`${label} must be a valid timestamp.`);
  }
  return parsed;
}

function positiveBoundedInteger(
  value: number | undefined,
  fallback: number,
  label: string,
  maximum: number,
): number {
  const result = value ?? fallback;
  if (!Number.isSafeInteger(result) || result < 1 || result > maximum) {
    throw new TypeError(`${label} must be an integer from 1 to ${maximum}.`);
  }
  return result;
}

function boundedFindingCount(value: number | undefined): number {
  const result = value ?? DEFAULT_MAX_FINDINGS;
  if (!Number.isSafeInteger(result) || result < 0 || result > 1_000) {
    throw new TypeError("maxFindings must be an integer from 0 to 1000.");
  }
  return result;
}

function normalizedCursor(
  cursor: DirectV1BackfillCursor | null | undefined,
): Readonly<{ createdAt: Date; id: string }> | null {
  if (!cursor) return null;
  if (typeof cursor.id !== "string" || cursor.id.length === 0) {
    throw new TypeError("cursor.id must be a non-empty string.");
  }
  return Object.freeze({
    createdAt: validDate(cursor.createdAt, "cursor.createdAt"),
    id: cursor.id,
  });
}

/** Prisma raw Date parameters are timestamptz; compare against UTC-naive columns. */
function utcDatabaseTimestamp(value: Date): Prisma.Sql {
  return Prisma.sql`(CAST(${value} AS timestamptz) AT TIME ZONE 'UTC')`;
}

function pagePredicate(
  through: Date,
  cursor: Readonly<{ createdAt: Date; id: string }> | null,
): Prisma.Sql {
  const throughSql = utcDatabaseTimestamp(through);
  if (!cursor) {
    return Prisma.sql`"createdAt" <= ${throughSql}`;
  }
  const cursorSql = utcDatabaseTimestamp(cursor.createdAt);
  return Prisma.sql`
    "createdAt" <= ${throughSql}
    AND ("createdAt", "id") > (${cursorSql}, ${cursor.id})
  `;
}

async function loadPage(
  db: Pick<PrismaClient, "$queryRaw">,
  phase: DirectV1BackfillPhase,
  through: Date,
  cursor: Readonly<{ createdAt: Date; id: string }> | null,
  batchSize: number,
): Promise<Readonly<{ rows: readonly PageRow[]; hasMore: boolean }>> {
  const table =
    phase === "actions"
      ? Prisma.raw('"ClassmatePost"')
      : Prisma.raw('"ActionInterest"');
  const rows = await db.$queryRaw<PageRow[]>(Prisma.sql`
    SELECT "id", "createdAt"
    FROM ${table}
    WHERE ${pagePredicate(through, cursor)}
    ORDER BY "createdAt", "id"
    LIMIT ${batchSize + 1}
  `);
  return Object.freeze({
    rows: Object.freeze(rows.slice(0, batchSize)),
    hasMore: rows.length > batchSize,
  });
}

function finding(
  code: DirectV1BackfillFindingCode,
  entityKind: "action" | "interest",
  entityId: string,
  severity: "quarantine" | "violation" = "quarantine",
): DirectV1BackfillFinding {
  return Object.freeze({ severity, code, entityKind, entityId });
}

function appendFinding(
  findings: DirectV1BackfillFinding[],
  value: DirectV1BackfillFinding,
  maxFindings: number,
): void {
  if (findings.length < maxFindings) findings.push(value);
}

function actionHasEmptyHistoricalTuple(action: LockedActionRow): boolean {
  return directConversationPolicyTupleKind(action) === "HISTORICAL_UNSNAPSHOTTED";
}

/** Keep migration acceptance identical to the production Action resolver. */
function actionHasExactDirectPolicy(action: LockedActionRow): boolean {
  return directConversationPolicyTupleKind(action) === "SNAPSHOTTED_DIRECT";
}

function terminalActionStatus(status: ClassmatePostStatus): boolean {
  return status === "FULFILLED" || status === "REMOVED";
}

async function lockAction(
  tx: Prisma.TransactionClient,
  actionId: string,
): Promise<LockedActionRow | null> {
  const rows = await tx.$queryRaw<LockedActionRow[]>(Prisma.sql`
    SELECT
      "id",
      "userId" AS "creatorId",
      "category",
      "status",
      "coordinationPolicy",
      "policySchemaVersion",
      "policyParametersSnapshot",
      "experimentKeySnapshot",
      "experimentVariantSnapshot",
      "clientCapabilitySnapshot",
      "policySnapshottedAt",
      "createdAt"
    FROM "ClassmatePost"
    WHERE "id" = ${actionId}
    FOR UPDATE
  `);
  return rows[0] ?? null;
}

async function hasCreatorGatedEvidence(
  tx: Prisma.TransactionClient,
  actionId: string,
): Promise<boolean> {
  const rows = await tx.$queryRaw<Array<{ found: boolean }>>(Prisma.sql`
    SELECT EXISTS (
      SELECT 1
      FROM "ActionInterest" interest
      INNER JOIN "ClassmatePost" action
        ON action."id" = interest."classmatePostId"
      LEFT JOIN "ActionCoordinationContext" context
        ON context."interestId" = interest."id"
      LEFT JOIN "ActionInterestActivation" activation
        ON activation."interestId" = interest."id"
      WHERE interest."classmatePostId" = ${actionId}
        AND (
          interest."userId" = action."userId"
          OR
          interest."connectionId" IS NULL
          OR context."currentActivationId" IS NOT NULL
          OR context."state" IN (
            CAST('WAITING' AS "ActionCoordinationState"),
            CAST('INITIATING' AS "ActionCoordinationState"),
            CAST('UNAVAILABLE' AS "ActionCoordinationState")
          )
          OR activation."id" IS NOT NULL
        )
    ) AS "found"
  `);
  return rows[0]?.found === true;
}

async function snapshotActionPairs(
  db: Pick<PrismaClient, "$queryRaw">,
  actionId: string,
): Promise<
  Readonly<{
    creatorId: string;
    pairs: readonly CanonicalUserPair[];
    hasInterests: boolean;
    hasSelfPair: boolean;
  }> | null
> {
  const rows = await db.$queryRaw<
    Array<{ creatorId: string; responderId: string | null }>
  >(Prisma.sql`
    SELECT action."userId" AS "creatorId", interest."userId" AS "responderId"
    FROM "ClassmatePost" action
    LEFT JOIN "ActionInterest" interest
      ON interest."classmatePostId" = action."id"
    WHERE action."id" = ${actionId}
    ORDER BY interest."userId" ASC NULLS FIRST, interest."id" ASC NULLS FIRST
  `);
  const first = rows[0];
  if (!first) return null;
  const responders = rows.flatMap((row) =>
    row.responderId === null ? [] : [row.responderId],
  );
  return Object.freeze({
    creatorId: first.creatorId,
    pairs: Object.freeze(
      stableCanonicalPairs(
        responders
          .filter((responderId) => responderId !== first.creatorId)
          .map((responderId) => [first.creatorId, responderId] as const),
      ),
    ),
    hasInterests: responders.length > 0,
    hasSelfPair: responders.includes(first.creatorId),
  });
}

function samePairSet(
  left: readonly CanonicalUserPair[],
  right: readonly CanonicalUserPair[],
): boolean {
  const leftIds = left.map(canonicalPairResourceId);
  const rightIds = right.map(canonicalPairResourceId);
  return (
    leftIds.length === rightIds.length &&
    leftIds.every((value, index) => value === rightIds[index])
  );
}

async function processAction(
  db: DirectV1BackfillDatabase,
  actionId: string,
  mode: DirectV1BackfillMode,
  transactionOptions?: ActionCoordinationTransactionOptions,
): Promise<ActionProcessResult> {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const snapshot = await snapshotActionPairs(db, actionId);
    if (!snapshot) return { kind: "missing" };
    try {
      return await db.$transaction(async (tx) => {
        const lockedPairs = await pairSafetyLocks(tx, snapshot.pairs);
        const action = await lockAction(tx, actionId);
        if (!action) return { kind: "missing" } as const;
        const currentRows = await tx.$queryRaw<Array<{ responderId: string }>>(
          Prisma.sql`
            SELECT "userId" AS "responderId"
            FROM "ActionInterest"
            WHERE "classmatePostId" = ${action.id}
            ORDER BY "userId", "id"
          `,
        );
        const currentResponderIds = currentRows.map((row) => row.responderId);
        const currentHasSelfPair = currentResponderIds.includes(action.creatorId);
        const currentPairs = stableCanonicalPairs(
          currentResponderIds
            .filter((responderId) => responderId !== action.creatorId)
            .map((responderId) => [action.creatorId, responderId] as const),
        );
        if (
          action.creatorId !== snapshot.creatorId ||
          currentHasSelfPair !== snapshot.hasSelfPair ||
          !samePairSet(currentPairs, lockedPairs)
        ) {
          throw new ChangedBackfillPairSnapshotError(action.id);
        }
        const policyKind = actionPolicyTupleKind(action);
        if (policyKind === "SNAPSHOTTED_DIRECT") {
          return { kind: "noop" } as const;
        }
        if (policyKind === "SNAPSHOTTED_CREATOR_GATED") {
          // DB03 certifies DIRECT_V1 reconstruction only. A valid V2 policy is
          // healthy but outside that scope; do not count it as a verified
          // DIRECT Action or as a DIRECT no-op.
          return { kind: "skipped-non-direct" } as const;
        }
        if (
          actionHasEmptyHistoricalTuple(action) &&
          terminalActionStatus(action.status) &&
          snapshot.hasInterests
        ) {
          return {
            kind: "quarantined",
            finding: finding(
              "ACTION_TERMINAL_UNSAFE_TO_INFER",
              "action",
              action.id,
            ),
          } as const;
        }

        const creatorGatedEvidence =
          policyKind === "HISTORICAL_UNSNAPSHOTTED" &&
          (snapshot.hasSelfPair || (await hasCreatorGatedEvidence(tx, action.id)));
        if (creatorGatedEvidence) {
          return {
            kind: "quarantined",
            finding: finding(
              "ACTION_CREATOR_GATED_EVIDENCE",
              "action",
              action.id,
            ),
          } as const;
        }
        if (!actionHasEmptyHistoricalTuple(action)) {
          return {
            kind: "quarantined",
            finding: finding(
              "ACTION_PARTIAL_OR_INVALID_POLICY",
              "action",
              action.id,
            ),
          } as const;
        }
        if (mode === "apply") {
          await tx.$executeRaw(Prisma.sql`
            UPDATE "ClassmatePost"
            SET
              "coordinationPolicy" = CAST(
                'DIRECT_CONVERSATION_V1' AS "ActionCoordinationPolicy"
              ),
              "policySchemaVersion" = 1,
              "policyParametersSnapshot" = '{}'::jsonb,
              "policySnapshottedAt" = "createdAt"
            WHERE "id" = ${action.id}
              AND "coordinationPolicy" IS NULL
              AND "policySchemaVersion" IS NULL
              AND "policyParametersSnapshot" IS NULL
              AND "experimentKeySnapshot" IS NULL
              AND "experimentVariantSnapshot" IS NULL
              AND "clientCapabilitySnapshot" IS NULL
              AND "policySnapshottedAt" IS NULL
          `);
        }
        return { kind: "snapshotted" } as const;
      }, transactionOptions);
    } catch (cause) {
      if (cause instanceof ChangedBackfillPairSnapshotError && attempt < 3) {
        continue;
      }
      throw cause;
    }
  }
  throw new Error("Action backfill snapshot retry loop exited unexpectedly.");
}

function expectedSourceKind(category: ClassmatePostCategory): string {
  return category === "SHARED_COURSES" ? "COURSE_ACTION" : "BUDDY_POST";
}

function validOriginSnapshot(
  value: Prisma.JsonValue,
  action: LockedActionRow,
  interest: LockedInterestRow,
): boolean {
  const context = parseActionContextSnapshot(value);
  if (!context) return false;
  const participants = context.participantIds;
  return (
    context.sourceKind === expectedSourceKind(action.category) &&
    context.sourceId === action.id &&
    context.author.id === action.creatorId &&
    ((participants[0] === interest.responderId &&
      participants[1] === action.creatorId) ||
      (participants[0] === action.creatorId &&
        participants[1] === interest.responderId))
  );
}

function sameInstant(left: Date | null, right: Date | null): boolean {
  return left === null
    ? right === null
    : right !== null && left.getTime() === right.getTime();
}

function samePair(
  connection: Pick<LockedConnectionRow, "userAId" | "userBId">,
  creatorId: string,
  responderId: string,
): boolean {
  return (
    (connection.userAId === creatorId && connection.userBId === responderId) ||
    (connection.userAId === responderId && connection.userBId === creatorId)
  );
}

function expectedContextForConnection(
  interest: LockedInterestRow,
  connection: LockedConnectionRow,
):
  | Readonly<{ kind: "expected"; value: ExpectedContext }>
  | Readonly<{ kind: "invalid"; code: DirectV1BackfillFindingCode }> {
  if (connection.status === "ACTIVE") {
    if (connection.endedAt !== null || connection.endedById !== null) {
      return {
        kind: "invalid",
        code: "INTEREST_ACTIVE_CONNECTION_HAS_END_FIELDS",
      };
    }
    return {
      kind: "expected",
      value: {
        state: "OPEN",
        activatedAt: interest.createdAt,
        endedAt: null,
        endedById: null,
        endReason: null,
        updatedAt: interest.updatedAt,
      },
    };
  }
  if (connection.endedAt === null) {
    return {
      kind: "invalid",
      code: "INTEREST_TERMINAL_CONNECTION_MISSING_ENDED_AT",
    };
  }
  if (connection.endedAt.getTime() < interest.createdAt.getTime()) {
    return {
      kind: "invalid",
      code: "INTEREST_TERMINAL_CONNECTION_ENDS_BEFORE_INTEREST",
    };
  }
  if (
    connection.status === "ENDED" &&
    connection.endedById !== null &&
    connection.endedById !== connection.userAId &&
    connection.endedById !== connection.userBId
  ) {
    return {
      kind: "invalid",
      code: "INTEREST_CONNECTION_ENDED_BY_MISMATCH",
    };
  }
  return {
    kind: "expected",
    value: {
      state: "ENDED",
      activatedAt: interest.createdAt,
      endedAt: connection.endedAt,
      endedById:
        connection.status === "BLOCKED" ? null : connection.endedById,
      endReason:
        connection.status === "BLOCKED"
          ? "SAFETY_UNAVAILABLE"
          : "USER_ENDED",
      updatedAt: connection.endedAt,
    },
  };
}

function exactCompatibilityContext(
  context: LockedContextRow,
  interest: LockedInterestRow,
  expected: ExpectedContext,
): boolean {
  return (
    context.interestId === interest.id &&
    context.currentActivationId === null &&
    context.state === expected.state &&
    context.reservationId === null &&
    context.reservationGeneration === 0 &&
    context.leaseExpiresAt === null &&
    context.connectionId === interest.connectionId &&
    sameInstant(context.activatedAt, expected.activatedAt) &&
    context.firstCounterpartResponseAt === null &&
    sameInstant(context.endedAt, expected.endedAt) &&
    context.endedById === expected.endedById &&
    context.endReason === expected.endReason &&
    sameInstant(context.createdAt, interest.createdAt) &&
    contextUpdatedAtMatchesLifecycle(context, interest, expected)
  );
}

/**
 * DIRECT_V1 withdrawal only changes the Interest; it deliberately does not end
 * the already-open conversation or mutate its compatibility Context. A Context
 * created before withdrawal therefore retains its prior lifecycle timestamp,
 * while a backfill performed after withdrawal uses the Interest's then-current
 * timestamp. Reactivation followed by another withdrawal can leave any genuine
 * Context update between those bounds. The exact value is unknowable from the
 * legacy row, so the safe invariant is the closed interval from first Interest
 * creation through its current update, backed by a valid withdrawal timestamp.
 *
 * Terminal Context timestamps remain authoritative and must exactly match the
 * Connection end timestamp.
 */
function contextUpdatedAtMatchesLifecycle(
  context: LockedContextRow,
  interest: LockedInterestRow,
  expected: ExpectedContext,
): boolean {
  if (expected.state === "ENDED") {
    return sameInstant(context.updatedAt, expected.updatedAt);
  }
  if (interest.status === "ACTIVE") {
    return (
      interest.withdrawnAt === null &&
      sameInstant(context.updatedAt, expected.updatedAt)
    );
  }
  if (interest.withdrawnAt === null) return false;

  const createdAt = interest.createdAt.getTime();
  const withdrawnAt = interest.withdrawnAt.getTime();
  const interestUpdatedAt = interest.updatedAt.getTime();
  const contextUpdatedAt = context.updatedAt.getTime();
  if (
    withdrawnAt < createdAt ||
    interestUpdatedAt < withdrawnAt
  ) {
    return false;
  }
  return (
    contextUpdatedAt >= createdAt && contextUpdatedAt <= interestUpdatedAt
  );
}

async function snapshotInterestPair(
  db: Pick<PrismaClient, "$queryRaw">,
  interestId: string,
): Promise<Readonly<{
  actionId: string;
  creatorId: string;
  responderId: string;
}> | null> {
  const rows = await db.$queryRaw<
    Array<{ actionId: string; creatorId: string; responderId: string }>
  >(Prisma.sql`
    SELECT
      interest."classmatePostId" AS "actionId",
      action."userId" AS "creatorId",
      interest."userId" AS "responderId"
    FROM "ActionInterest" interest
    INNER JOIN "ClassmatePost" action
      ON action."id" = interest."classmatePostId"
    WHERE interest."id" = ${interestId}
    LIMIT 1
  `);
  return rows[0] ?? null;
}

async function lockInterest(
  tx: Prisma.TransactionClient,
  interestId: string,
): Promise<LockedInterestRow | null> {
  const rows = await tx.$queryRaw<LockedInterestRow[]>(Prisma.sql`
    SELECT
      "id",
      "userId" AS "responderId",
      "classmatePostId" AS "actionId",
      "connectionId",
      "originSnapshot",
      "status",
      "withdrawnAt",
      "createdAt",
      "updatedAt"
    FROM "ActionInterest"
    WHERE "id" = ${interestId}
    FOR UPDATE
  `);
  return rows[0] ?? null;
}

async function lockContext(
  tx: Prisma.TransactionClient,
  interestId: string,
): Promise<LockedContextRow | null> {
  const rows = await tx.$queryRaw<LockedContextRow[]>(Prisma.sql`
    SELECT
      "id",
      "interestId",
      "currentActivationId",
      "state",
      "reservationId",
      "reservationGeneration",
      "leaseExpiresAt",
      "connectionId",
      "activatedAt",
      "firstCounterpartResponseAt",
      "endedAt",
      "endedById",
      "endReason",
      "createdAt",
      "updatedAt"
    FROM "ActionCoordinationContext"
    WHERE "interestId" = ${interestId}
    FOR UPDATE
  `);
  return rows[0] ?? null;
}

async function lockConnection(
  tx: Prisma.TransactionClient,
  connectionId: string,
): Promise<LockedConnectionRow | null> {
  const rows = await tx.$queryRaw<LockedConnectionRow[]>(Prisma.sql`
    SELECT "id", "userAId", "userBId", "status", "endedById", "endedAt"
    FROM "Connection"
    WHERE "id" = ${connectionId}
    FOR UPDATE
  `);
  return rows[0] ?? null;
}

async function processInterest(
  db: DirectV1BackfillDatabase,
  interestId: string,
  mode: DirectV1BackfillMode,
  transactionOptions?: ActionCoordinationTransactionOptions,
): Promise<InterestProcessResult> {
  const pair = await snapshotInterestPair(db, interestId);
  if (!pair) return { kind: "missing" };
  if (pair.creatorId === pair.responderId) {
    return {
      kind: "quarantined",
      finding: finding("INTEREST_SELF_PAIR", "interest", interestId),
    };
  }

  return db.$transaction(async (tx) => {
    await pairSafetyLock(tx, pair.creatorId, pair.responderId);
    // Normative narrower order: Action -> Interest/Context -> Connection.
    const action = await lockAction(tx, pair.actionId);
    if (!action) return { kind: "missing" } as const;
    const interest = await lockInterest(tx, interestId);
    if (!interest) return { kind: "missing" } as const;
    const context = await lockContext(tx, interest.id);

    if (
      action.creatorId !== pair.creatorId ||
      interest.responderId !== pair.responderId ||
      interest.actionId !== pair.actionId
    ) {
      return {
        kind: "quarantined",
        finding: finding("INTEREST_PAIR_CHANGED", "interest", interest.id),
      } as const;
    }
    const policyKind = actionPolicyTupleKind(action);
    if (policyKind === "SNAPSHOTTED_CREATOR_GATED") {
      // DB03 only reconstructs DIRECT_V1 compatibility Contexts. A valid V2
      // Interest is intentionally connectionless until its creator starts
      // coordination, so it is outside this verifier/backfill's scope.
      return { kind: "skipped-non-direct" } as const;
    }
    const dryRunWouldSnapshotAction =
      mode === "dry-run" &&
      policyKind === "HISTORICAL_UNSNAPSHOTTED" &&
      !(await hasCreatorGatedEvidence(tx, action.id));
    if (
      terminalActionStatus(action.status) ||
      (!actionHasExactDirectPolicy(action) && !dryRunWouldSnapshotAction)
    ) {
      return {
        kind: "quarantined",
        finding: finding(
          "INTEREST_ACTION_NOT_DIRECT",
          "interest",
          interest.id,
        ),
      } as const;
    }
    if (interest.connectionId === null) {
      return {
        kind: "quarantined",
        finding: finding(
          "INTEREST_MISSING_CONNECTION",
          "interest",
          interest.id,
        ),
      } as const;
    }
    const connection = await lockConnection(tx, interest.connectionId);
    if (!connection) {
      return {
        kind: "quarantined",
        finding: finding(
          "INTEREST_CONNECTION_NOT_FOUND",
          "interest",
          interest.id,
        ),
      } as const;
    }
    if (!samePair(connection, action.creatorId, interest.responderId)) {
      return {
        kind: "quarantined",
        finding: finding(
          "INTEREST_CONNECTION_PAIR_MISMATCH",
          "interest",
          interest.id,
        ),
      } as const;
    }
    if (!validOriginSnapshot(interest.originSnapshot, action, interest)) {
      return {
        kind: "quarantined",
        finding: finding(
          "INTEREST_ORIGIN_SNAPSHOT_INVALID",
          "interest",
          interest.id,
        ),
      } as const;
    }
    const expected = expectedContextForConnection(interest, connection);
    if (expected.kind === "invalid") {
      return {
        kind: "quarantined",
        finding: finding(expected.code, "interest", interest.id),
      } as const;
    }
    if (context) {
      return exactCompatibilityContext(context, interest, expected.value)
        ? ({ kind: "noop" } as const)
        : ({
            kind: "quarantined",
            finding: finding(
              "INTEREST_CONTEXT_CONFLICT",
              "interest",
              interest.id,
            ),
          } as const);
    }
    if (mode === "apply") {
      await tx.actionCoordinationContext.create({
        data: {
          interestId: interest.id,
          currentActivationId: null,
          state: expected.value.state,
          reservationId: null,
          reservationGeneration: 0,
          leaseExpiresAt: null,
          connectionId: connection.id,
          activatedAt: expected.value.activatedAt,
          firstCounterpartResponseAt: null,
          endedAt: expected.value.endedAt,
          endedById: expected.value.endedById,
          endReason: expected.value.endReason,
          createdAt: interest.createdAt,
          updatedAt: expected.value.updatedAt,
        },
        select: { id: true },
      });
    }
    return { kind: "created" } as const;
  }, transactionOptions);
}

function pageMetadata(
  phase: DirectV1BackfillPhase,
  through: Date,
  cursor: Readonly<{ createdAt: Date; id: string }> | null,
  rows: readonly PageRow[],
  hasMore: boolean,
): PageResult {
  const last = rows.at(-1);
  const nextCursor = last
    ? Object.freeze({ createdAt: new Date(last.createdAt), id: last.id })
    : cursor;
  return Object.freeze({
    phase,
    through: new Date(through),
    cursor,
    nextCursor,
    hasMore,
    nextPhase: hasMore ? phase : phase === "actions" ? "interests" : "complete",
  });
}

/**
 * Process one deterministic keyset page. `dry-run` is the default and performs
 * no persistent writes. A resumable caller must persist phase + nextCursor,
 * finish actions, then begin interests with an empty cursor.
 */
export async function backfillDirectV1CoordinationBatch(
  options: DirectV1BackfillOptions,
): Promise<DirectV1BackfillBatchReport> {
  const db = options.db ?? prisma;
  const mode = options.mode ?? "dry-run";
  if (mode !== "dry-run" && mode !== "apply") {
    throw new TypeError("mode must be dry-run or apply.");
  }
  const phase = options.phase ?? "actions";
  const through = validDate(options.through, "through");
  const cursor = normalizedCursor(options.cursor);
  const batchSize = positiveBoundedInteger(
    options.batchSize,
    DEFAULT_BATCH_SIZE,
    "batchSize",
    1_000,
  );
  const maxFindings = boundedFindingCount(options.maxFindings);
  const page = await loadPage(db, phase, through, cursor, batchSize);
  const findings: DirectV1BackfillFinding[] = [];
  let snapshottedActions = 0;
  let noOpActions = 0;
  let skippedNonDirectActions = 0;
  let createdContexts = 0;
  let noOpContexts = 0;
  let skippedNonDirectInterests = 0;
  let quarantined = 0;

  for (const row of page.rows) {
    if (phase === "actions") {
      const result = await processAction(
        db,
        row.id,
        mode,
        options.transactionOptions,
      );
      if (result.kind === "snapshotted") snapshottedActions += 1;
      if (result.kind === "noop") noOpActions += 1;
      if (result.kind === "skipped-non-direct") skippedNonDirectActions += 1;
      if (result.kind === "quarantined") {
        quarantined += 1;
        appendFinding(findings, result.finding, maxFindings);
      }
    } else {
      const result = await processInterest(
        db,
        row.id,
        mode,
        options.transactionOptions,
      );
      if (result.kind === "created") createdContexts += 1;
      if (result.kind === "noop") noOpContexts += 1;
      if (result.kind === "skipped-non-direct") skippedNonDirectInterests += 1;
      if (result.kind === "quarantined") {
        quarantined += 1;
        appendFinding(findings, result.finding, maxFindings);
      }
    }
  }

  return Object.freeze({
    mode,
    ...pageMetadata(phase, through, cursor, page.rows, page.hasMore),
    scannedActions: phase === "actions" ? page.rows.length : 0,
    snapshottedActions,
    noOpActions,
    skippedNonDirectActions,
    scannedInterests: phase === "interests" ? page.rows.length : 0,
    createdContexts,
    noOpContexts,
    skippedNonDirectInterests,
    quarantined,
    findingsTruncated: quarantined > findings.length,
    findings: Object.freeze(findings),
  });
}

/** Read-only post-backfill verifier over one resumable keyset page. */
export async function verifyDirectV1CoordinationBackfill(
  options: DirectV1VerificationOptions,
): Promise<DirectV1VerificationReport> {
  const db = options.db ?? prisma;
  const phase = options.phase ?? "actions";
  const through = validDate(options.through, "through");
  const cursor = normalizedCursor(options.cursor);
  const batchSize = positiveBoundedInteger(
    options.batchSize,
    DEFAULT_BATCH_SIZE,
    "batchSize",
    1_000,
  );
  const maxFindings = boundedFindingCount(options.maxFindings);
  const page = await loadPage(db, phase, through, cursor, batchSize);
  const findings: DirectV1BackfillFinding[] = [];
  let verifiedActions = 0;
  let verifiedContexts = 0;
  let skippedNonDirectActions = 0;
  let skippedNonDirectInterests = 0;
  let quarantined = 0;
  let violations = 0;

  for (const row of page.rows) {
    if (phase === "actions") {
      const result = await processAction(
        db,
        row.id,
        "dry-run",
        options.transactionOptions,
      );
      if (result.kind === "noop") verifiedActions += 1;
      if (result.kind === "skipped-non-direct") skippedNonDirectActions += 1;
      if (result.kind === "snapshotted") {
        violations += 1;
        appendFinding(
          findings,
          finding("ACTION_POLICY_MISSING", "action", row.id, "violation"),
          maxFindings,
        );
      }
      if (result.kind === "quarantined") {
        quarantined += 1;
        appendFinding(findings, result.finding, maxFindings);
      }
    } else {
      const result = await processInterest(
        db,
        row.id,
        "dry-run",
        options.transactionOptions,
      );
      if (result.kind === "noop") verifiedContexts += 1;
      if (result.kind === "skipped-non-direct") skippedNonDirectInterests += 1;
      if (result.kind === "created") {
        violations += 1;
        appendFinding(
          findings,
          finding(
            "INTEREST_CONTEXT_MISSING",
            "interest",
            row.id,
            "violation",
          ),
          maxFindings,
        );
      }
      if (result.kind === "quarantined") {
        quarantined += 1;
        appendFinding(findings, result.finding, maxFindings);
      }
    }
  }

  return Object.freeze({
    ...pageMetadata(phase, through, cursor, page.rows, page.hasMore),
    scannedActions: phase === "actions" ? page.rows.length : 0,
    scannedInterests: phase === "interests" ? page.rows.length : 0,
    verifiedActions,
    verifiedContexts,
    skippedNonDirectActions,
    skippedNonDirectInterests,
    quarantined,
    violations,
    findingsTruncated: quarantined + violations > findings.length,
    findings: Object.freeze(findings),
  });
}
