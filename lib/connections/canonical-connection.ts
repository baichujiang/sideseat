import "server-only";

import { createHash } from "node:crypto";

import { ConnectionStatus, Prisma, type PrismaClient } from "@prisma/client";

import {
  canonicalPair,
  pairSafetyLock,
  userConnectionSafetyLocks,
  type CanonicalUserPair,
} from "@/lib/v2/action-coordination/db-locks";

export { userConnectionSafetyLocks } from "@/lib/v2/action-coordination/db-locks";

export type CanonicalConnectionRow = Readonly<{
  id: string;
  userAId: string;
  userBId: string;
  status: ConnectionStatus;
  originCourseId: string | null;
}>;

export class CanonicalConnectionIntegrityError extends Error {
  constructor(
    readonly code:
      | "DUPLICATE_PAIR"
      | "CONNECTION_ALREADY_EXISTS"
      | "SELF_NOTES_ALREADY_EXISTS",
  ) {
    super(code);
    this.name = "CanonicalConnectionIntegrityError";
  }
}

type ConnectionTransaction = Pick<
  Prisma.TransactionClient,
  "connection" | "$executeRaw" | "$queryRaw"
>;

export type ConnectionDatabase = PrismaClient | Prisma.TransactionClient;

export type CreateCanonicalConnectionInput = Readonly<{
  originCourseId?: string | null;
}>;

export type CanonicalConnectionCreateResult = CanonicalConnectionRow &
  Readonly<{ created: boolean }>;

export type CanonicalConnectionScope = Readonly<{
  pair: CanonicalUserPair;
  existing: CanonicalConnectionRow | null;
  createActive: (
    input?: CreateCanonicalConnectionInput,
  ) => Promise<CanonicalConnectionCreateResult>;
}>;

export type SelfNotesConnectionScope = Readonly<{
  userId: string;
  existing: CanonicalConnectionRow | null;
  createActive: () => Promise<CanonicalConnectionCreateResult>;
}>;

const SELF_NOTES_LOCK_DOMAIN = Buffer.from(
  "sideseat/connections/self-notes-lock/v1\0",
  "utf8",
);

function lengthPrefixedUtf8(value: string): Buffer {
  const bytes = Buffer.from(value, "utf8");
  const length = Buffer.allocUnsafe(4);
  length.writeUInt32BE(bytes.length, 0);
  return Buffer.concat([length, bytes]);
}

function selfNotesLockKey(userId: string): bigint {
  if (typeof userId !== "string" || userId.length === 0) {
    throw new TypeError("userId must be a non-empty user ID.");
  }
  if (Buffer.byteLength(userId, "utf8") > 512) {
    throw new TypeError("userId is too long to form a self-notes lock.");
  }
  return createHash("sha256")
    .update(SELF_NOTES_LOCK_DOMAIN)
    .update(lengthPrefixedUtf8(userId))
    .digest()
    .readBigInt64BE(0);
}

async function lockSelfNotes(
  tx: Pick<Prisma.TransactionClient, "$executeRaw">,
  userId: string,
): Promise<void> {
  const key = selfNotesLockKey(userId).toString();
  await tx.$executeRaw(Prisma.sql`
    SELECT pg_advisory_xact_lock(CAST(${key} AS bigint))
  `);
}

async function lockDistinctPairConnections(
  tx: ConnectionTransaction,
  pair: CanonicalUserPair,
): Promise<CanonicalConnectionRow[]> {
  return tx.$queryRaw<CanonicalConnectionRow[]>(Prisma.sql`
    SELECT "id", "userAId", "userBId", "status", "originCourseId"
    FROM "Connection"
    WHERE
      ("userAId" = ${pair.minUserId} AND "userBId" = ${pair.maxUserId})
      OR
      ("userAId" = ${pair.maxUserId} AND "userBId" = ${pair.minUserId})
    ORDER BY "createdAt" ASC, "id" ASC
    FOR UPDATE
  `);
}

async function lockSelfNotesConnections(
  tx: ConnectionTransaction,
  userId: string,
): Promise<CanonicalConnectionRow[]> {
  return tx.$queryRaw<CanonicalConnectionRow[]>(Prisma.sql`
    SELECT "id", "userAId", "userBId", "status", "originCourseId"
    FROM "Connection"
    WHERE "userAId" = ${userId} AND "userBId" = ${userId}
    ORDER BY "createdAt" ASC, "id" ASC
    FOR UPDATE
  `);
}

/**
 * Runs on either an existing interactive transaction or a new transaction.
 * This keeps ActionInterest's outer pair-locked transaction re-entrant while
 * making every standalone production writer acquire a transaction-scoped lock.
 */
export async function withConnectionTransaction<T>(
  db: ConnectionDatabase,
  callback: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  if (typeof (db as PrismaClient).$transaction !== "function") {
    return callback(db as Prisma.TransactionClient);
  }
  return (db as PrismaClient).$transaction(callback);
}

/**
 * The only supported distinct-user Connection creation scope.
 *
 * It serializes the unordered pair, re-reads and locks all legacy orientations,
 * fails closed on duplicate rows, and stores new rows in canonical endpoint
 * order. An ACTIVE row is available for caller reuse. A terminal row remains
 * visible to the caller, while createActive refuses to replace or resurrect it.
 */
export async function withCanonicalConnectionScope<T>(
  tx: Prisma.TransactionClient,
  firstUserId: string,
  secondUserId: string,
  callback: (scope: CanonicalConnectionScope) => Promise<T>,
): Promise<T> {
  const pair = canonicalPair(firstUserId, secondUserId);
  await userConnectionSafetyLocks(tx, [pair.minUserId, pair.maxUserId]);
  await pairSafetyLock(tx, pair.minUserId, pair.maxUserId);
  const rows = await lockDistinctPairConnections(tx, pair);
  if (rows.length > 1) {
    throw new CanonicalConnectionIntegrityError("DUPLICATE_PAIR");
  }

  const existing = rows[0] ?? null;
  let created = false;
  const createActive = async (
    input: CreateCanonicalConnectionInput = {},
  ): Promise<CanonicalConnectionCreateResult> => {
    if (existing || created) {
      throw new CanonicalConnectionIntegrityError("CONNECTION_ALREADY_EXISTS");
    }
    created = true;
    const inserted = await tx.connection.createMany({
      data: [{
        userAId: pair.minUserId,
        userBId: pair.maxUserId,
        status: ConnectionStatus.ACTIVE,
        originCourseId: input.originCourseId ?? null,
      }],
      skipDuplicates: true,
    });
    // ON CONFLICT DO NOTHING can wait for a rolling-deploy legacy writer
    // without aborting this transaction. Re-read the committed winner under a
    // row lock instead of catching P2002 in an already-failed transaction.
    const winners = await lockDistinctPairConnections(tx, pair);
    if (winners.length !== 1) {
      throw new CanonicalConnectionIntegrityError("DUPLICATE_PAIR");
    }
    const winner = winners[0];
    if (winner.status !== ConnectionStatus.ACTIVE) {
      throw new CanonicalConnectionIntegrityError("CONNECTION_ALREADY_EXISTS");
    }
    return Object.freeze({ ...winner, created: inserted.count === 1 });
  };

  return callback(Object.freeze({ pair, existing, createActive }));
}

/** Self-notes is the sole same-user exception to the distinct-pair primitive. */
export async function withSelfNotesConnectionScope<T>(
  tx: Prisma.TransactionClient,
  userId: string,
  callback: (scope: SelfNotesConnectionScope) => Promise<T>,
): Promise<T> {
  await lockSelfNotes(tx, userId);
  const rows = await lockSelfNotesConnections(tx, userId);
  if (rows.length > 1) {
    throw new CanonicalConnectionIntegrityError("DUPLICATE_PAIR");
  }

  const existing = rows[0] ?? null;
  let created = false;
  const createActive = async (): Promise<CanonicalConnectionCreateResult> => {
    if (existing || created) {
      throw new CanonicalConnectionIntegrityError("SELF_NOTES_ALREADY_EXISTS");
    }
    created = true;
    const inserted = await tx.connection.createMany({
      data: [{
        userAId: userId,
        userBId: userId,
        status: ConnectionStatus.ACTIVE,
      }],
      skipDuplicates: true,
    });
    const winners = await lockSelfNotesConnections(tx, userId);
    if (winners.length !== 1) {
      throw new CanonicalConnectionIntegrityError("DUPLICATE_PAIR");
    }
    const winner = winners[0];
    if (winner.status !== ConnectionStatus.ACTIVE) {
      throw new CanonicalConnectionIntegrityError("SELF_NOTES_ALREADY_EXISTS");
    }
    return Object.freeze({ ...winner, created: inserted.count === 1 });
  };

  return callback(Object.freeze({ userId, existing, createActive }));
}
