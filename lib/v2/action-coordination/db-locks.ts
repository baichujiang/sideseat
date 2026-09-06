import { createHash } from "node:crypto";

import { Prisma } from "@prisma/client";

export type CanonicalUserPair = Readonly<{
  minUserId: string;
  maxUserId: string;
}>;

export type UserPairInput =
  | CanonicalUserPair
  | readonly [firstUserId: string, secondUserId: string]
  | Readonly<{ firstUserId: string; secondUserId: string }>;

type PairLockTransaction = Pick<Prisma.TransactionClient, "$executeRaw">;

/**
 * Normative lock order. USER_CONNECTION_SAFETY is an optional but mandatory
 * pre-layer for Connection creation and user-global moderation commands.
 *
 * Commands may skip irrelevant levels, but may never acquire a later level and
 * then return to an earlier one. Rows at one level are locked by immutable ID.
 */
export const ACTION_COORDINATION_LOCK_ORDER = Object.freeze([
  "USER_CONNECTION_SAFETY",
  "PAIR_SAFETY",
  "BLOCK_BARRIER",
  "ACTION",
  "INTEREST_ACTIVATION_CONTEXT",
  "CONNECTION",
  "PLAN_COMMITMENT",
  "PLAN_REVISION",
  "CALENDAR_PROJECTION",
] as const);

const PAIR_LOCK_DOMAIN = Buffer.from(
  "sideseat/action-coordination/pair-safety-lock/v1\0",
  "utf8",
);
const USER_CONNECTION_SAFETY_LOCK_DOMAIN = Buffer.from(
  "sideseat/connections/user-safety-lock/v1\0",
  "utf8",
);

function assertUserId(value: string, label: string): void {
  if (typeof value !== "string" || value.length === 0) {
    throw new TypeError(`${label} must be a non-empty user ID.`);
  }
  if (Buffer.byteLength(value, "utf8") > 512) {
    throw new TypeError(`${label} is too long to form a pair safety lock.`);
  }
}

function compareUtf8(left: string, right: string): number {
  return Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));
}

export function canonicalPair(
  firstUserId: string,
  secondUserId: string,
): CanonicalUserPair {
  assertUserId(firstUserId, "firstUserId");
  assertUserId(secondUserId, "secondUserId");
  if (firstUserId === secondUserId) {
    throw new TypeError("A pair safety lock requires two different users.");
  }
  return compareUtf8(firstUserId, secondUserId) < 0
    ? Object.freeze({ minUserId: firstUserId, maxUserId: secondUserId })
    : Object.freeze({ minUserId: secondUserId, maxUserId: firstUserId });
}

function normalizePairInput(input: UserPairInput): CanonicalUserPair {
  if (Array.isArray(input)) {
    const tuple = input as readonly [string, string];
    return canonicalPair(tuple[0], tuple[1]);
  }
  if ("minUserId" in input) {
    return canonicalPair(input.minUserId, input.maxUserId);
  }
  const named = input as Readonly<{
    firstUserId: string;
    secondUserId: string;
  }>;
  return canonicalPair(named.firstUserId, named.secondUserId);
}

function lengthPrefixedUtf8(value: string): Buffer {
  const bytes = Buffer.from(value, "utf8");
  const length = Buffer.allocUnsafe(4);
  length.writeUInt32BE(bytes.length, 0);
  return Buffer.concat([length, bytes]);
}

function userConnectionSafetyLockKey(userId: string): bigint {
  assertUserId(userId, "userId");
  return createHash("sha256")
    .update(USER_CONNECTION_SAFETY_LOCK_DOMAIN)
    .update(lengthPrefixedUtf8(userId))
    .digest()
    .readBigInt64BE(0);
}

/** Global safety layer acquired before every pair lock for its endpoints. */
export async function userConnectionSafetyLocks(
  tx: PairLockTransaction,
  userIds: readonly string[],
): Promise<readonly string[]> {
  const stableUserIds = stableLockIds(userIds);
  for (const userId of stableUserIds) {
    const key = userConnectionSafetyLockKey(userId).toString();
    await tx.$executeRaw(Prisma.sql`
      SELECT pg_advisory_xact_lock(CAST(${key} AS bigint))
    `);
  }
  return Object.freeze(stableUserIds);
}

export function pairSafetyLockMaterial(pair: CanonicalUserPair): Buffer {
  const normalized = canonicalPair(pair.minUserId, pair.maxUserId);
  return Buffer.concat([
    PAIR_LOCK_DOMAIN,
    lengthPrefixedUtf8(normalized.minUserId),
    lengthPrefixedUtf8(normalized.maxUserId),
  ]);
}

/** Signed PostgreSQL bigint key used by pg_advisory_xact_lock(bigint). */
export function pairSafetyLockKey(pair: CanonicalUserPair): bigint {
  return createHash("sha256")
    .update(pairSafetyLockMaterial(pair))
    .digest()
    .readBigInt64BE(0);
}

/**
 * Collision-free canonical pair identity for idempotency resources and logs.
 * It is separate from the 64-bit advisory key, whose collision mode is merely
 * extra serialization.
 */
export function canonicalPairResourceId(pair: CanonicalUserPair): string {
  return pairSafetyLockMaterial(pair).toString("base64url");
}

export function stableLockIds(ids: readonly string[]): string[] {
  return [...new Set(ids)].sort(compareUtf8);
}

function comparePairs(left: CanonicalUserPair, right: CanonicalUserPair): number {
  return (
    compareUtf8(left.minUserId, right.minUserId) ||
    compareUtf8(left.maxUserId, right.maxUserId)
  );
}

export function stableCanonicalPairs(
  inputs: readonly UserPairInput[],
): CanonicalUserPair[] {
  const unique = new Map<string, CanonicalUserPair>();
  for (const input of inputs) {
    const pair = normalizePairInput(input);
    unique.set(canonicalPairResourceId(pair), pair);
  }
  return [...unique.values()].sort(comparePairs);
}

/**
 * Acquire the one canonical transaction-scoped lock for an unordered user pair.
 * This function must be called from an interactive database transaction. The
 * xact-scoped lock is released automatically on commit or rollback.
 */
export async function pairSafetyLock(
  tx: PairLockTransaction,
  firstUserId: string,
  secondUserId: string,
): Promise<CanonicalUserPair> {
  const pair = canonicalPair(firstUserId, secondUserId);
  const key = pairSafetyLockKey(pair).toString();
  // executeRaw deliberately discards the PostgreSQL `void` result; queryRaw
  // would ask Prisma to deserialize that pseudo-type on some engine versions.
  await tx.$executeRaw(Prisma.sql`
    SELECT pg_advisory_xact_lock(CAST(${key} AS bigint))
  `);
  return pair;
}

/**
 * Acquire several pair locks in one stable global order. Callers taking an
 * Action snapshot must supply the complete pair set, then revalidate it after
 * these locks are held; a newly discovered pair requires rollback and retry.
 */
export async function pairSafetyLocks(
  tx: PairLockTransaction,
  inputs: readonly UserPairInput[],
): Promise<CanonicalUserPair[]> {
  const pairs = stableCanonicalPairs(inputs);
  for (const pair of pairs) {
    await pairSafetyLock(tx, pair.minUserId, pair.maxUserId);
  }
  return pairs;
}
