import { createHash } from "node:crypto";

import { Prisma, type PrismaClient } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";
import {
  pairSafetyLocks,
  stableCanonicalPairs,
  userConnectionSafetyLocks,
  type CanonicalUserPair,
  type UserPairInput,
} from "./db-locks";
import type {
  ActionCoordinationJsonObject,
  ActionCoordinationJsonValue,
} from "./dto";
import {
  isActionCoordinationConflict,
  isActionCoordinationFailure,
} from "./errors";
import {
  actionCoordinationConflictResult,
  actionCoordinationFailureResult,
  type ActionCoordinationExpectedFailurePayload,
} from "./route-adapter";

export type ActionCoordinationMutationMethod =
  | "POST"
  | "PUT"
  | "PATCH"
  | "DELETE";

export type ActionCoordinationCommandRequest = {
  actorId: string;
  idempotencyKey: string;
  operation: Readonly<{
    method: ActionCoordinationMutationMethod;
    operationId: string;
  }>;
  canonicalResource: Readonly<{
    kind: string;
    id: string;
  }>;
  pathParameters?: ActionCoordinationJsonObject;
  query?: ActionCoordinationJsonValue;
  body?: ActionCoordinationJsonValue;
};

export type ActionCoordinationCommandIdentity = Readonly<{
  recordId: string;
  scope: string;
  requestHash: string;
  operation: ActionCoordinationCommandRequest["operation"];
  canonicalResource: ActionCoordinationCommandRequest["canonicalResource"];
}>;

type ClockTransaction = Pick<Prisma.TransactionClient, "$queryRaw">;

export interface ActionCoordinationClock {
  now(tx: ClockTransaction): Promise<Date>;
}

export const databaseActionCoordinationClock: ActionCoordinationClock = {
  async now(tx) {
    const rows = await tx.$queryRaw<Array<{ now: Date | string }>>(Prisma.sql`
      SELECT clock_timestamp() AS "now"
    `);
    const value = rows[0]?.now;
    const result = value instanceof Date ? new Date(value) : new Date(value ?? NaN);
    if (!Number.isFinite(result.getTime())) {
      throw new Error("Database clock did not return a valid timestamp.");
    }
    return result;
  },
};

export function fixedActionCoordinationClock(
  value: Date | string | number,
): ActionCoordinationClock {
  const timestamp = new Date(value);
  if (!Number.isFinite(timestamp.getTime())) {
    throw new TypeError("Fixed clock requires a valid timestamp.");
  }
  const milliseconds = timestamp.getTime();
  return {
    async now() {
      return new Date(milliseconds);
    },
  };
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function compareCanonicalKeys(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

/** Canonical JSON for normalized path/query/body fingerprints. */
export function canonicalActionCoordinationJson(value: unknown): string {
  const visiting = new WeakSet<object>();

  function encode(current: unknown, path: string): string {
    if (current === null) return "null";
    if (typeof current === "string" || typeof current === "boolean") {
      return JSON.stringify(current);
    }
    if (typeof current === "number") {
      if (!Number.isFinite(current)) {
        throw new TypeError(`${path} contains a non-finite number.`);
      }
      return JSON.stringify(current);
    }
    if (typeof current !== "object") {
      throw new TypeError(`${path} is not normalized JSON.`);
    }
    if (visiting.has(current)) {
      throw new TypeError(`${path} contains a circular reference.`);
    }
    visiting.add(current);
    try {
      if (Array.isArray(current)) {
        return `[${current
          .map((item, index) => encode(item, `${path}[${index}]`))
          .join(",")}]`;
      }
      const prototype = Object.getPrototypeOf(current);
      if (prototype !== Object.prototype && prototype !== null) {
        throw new TypeError(`${path} contains a non-JSON object.`);
      }
      const record = current as Record<string, unknown>;
      return `{${Object.keys(record)
        .sort(compareCanonicalKeys)
        .map(
          (key) =>
            `${JSON.stringify(key)}:${encode(record[key], `${path}.${key}`)}`,
        )
        .join(",")}}`;
    } finally {
      visiting.delete(current);
    }
  }

  return encode(value, "command input");
}

function assertIdentityPart(
  value: string,
  label: string,
  maximumBytes: number,
): void {
  if (typeof value !== "string" || value.length === 0) {
    throw new TypeError(`${label} must be a non-empty string.`);
  }
  if (Buffer.byteLength(value, "utf8") > maximumBytes) {
    throw new TypeError(`${label} is too long.`);
  }
}

export function isActionCoordinationIdempotencyKey(
  value: string | null | undefined,
): value is string {
  return /^[A-Za-z0-9._:-]{8,128}$/.test(value ?? "");
}

function lengthScoped(value: string): string {
  return `${Buffer.byteLength(value, "utf8")}:${value}`;
}

export function buildActionCoordinationCommandIdentity(
  request: ActionCoordinationCommandRequest,
): ActionCoordinationCommandIdentity {
  assertIdentityPart(request.actorId, "actorId", 512);
  if (!isActionCoordinationIdempotencyKey(request.idempotencyKey)) {
    throw new TypeError(
      "idempotencyKey must contain 8–128 safe ASCII characters.",
    );
  }
  if (
    !new Set<ActionCoordinationMutationMethod>([
      "POST",
      "PUT",
      "PATCH",
      "DELETE",
    ]).has(request.operation.method)
  ) {
    throw new TypeError("operation method must be a mutation HTTP method.");
  }
  assertIdentityPart(request.operation.operationId, "operationId", 256);
  assertIdentityPart(request.canonicalResource.kind, "resource kind", 128);
  assertIdentityPart(request.canonicalResource.id, "resource id", 2_048);

  const operation = Object.freeze({
    method: request.operation.method,
    operationId: request.operation.operationId,
  });
  const canonicalResource = Object.freeze({
    kind: request.canonicalResource.kind,
    id: request.canonicalResource.id,
  });

  const scope = [
    "sideseat-action-coordination-v2",
    operation.method,
    operation.operationId,
    canonicalResource.kind,
    canonicalResource.id,
  ]
    .map(lengthScoped)
    .join("|");

  // Path/resource are fingerprinted as well as namespaced. This prevents a
  // route from accidentally hashing only its JSON body.
  const requestHash = sha256(
    canonicalActionCoordinationJson({
      canonicalResource,
      pathParameters: request.pathParameters ?? {},
      query: request.query ?? null,
      body: request.body ?? null,
    }),
  );
  const recordId = sha256(
    canonicalActionCoordinationJson({
      version: 2,
      actorId: request.actorId,
      idempotencyKey: request.idempotencyKey,
      operation,
      canonicalResource,
    }),
  );

  return Object.freeze({
    recordId,
    scope,
    requestHash,
    operation,
    canonicalResource,
  });
}

type StoredReceipt = {
  id: string;
  requestHash: string;
  responseStatus: number | null;
  responseBody: Prisma.JsonValue | null;
};

type ReceiptClaim =
  | { kind: "owner" }
  | { kind: "replay"; status: number; body: Prisma.JsonValue }
  | { kind: "conflict" }
  | { kind: "in_progress" };

async function claimReceipt(
  tx: Prisma.TransactionClient,
  identity: ActionCoordinationCommandIdentity,
  now: Date,
  ttlMs: number,
): Promise<ReceiptClaim> {
  const expiresAt = new Date(now.getTime() + ttlMs);
  const inserted = await tx.$queryRaw<StoredReceipt[]>(Prisma.sql`
    INSERT INTO "ApiIdempotencyRecord"
      ("id", "scope", "requestHash", "expiresAt", "createdAt", "updatedAt")
    VALUES
      (${identity.recordId}, ${identity.scope}, ${identity.requestHash}, ${expiresAt}, ${now}, ${now})
    ON CONFLICT ("id") DO UPDATE SET
      "scope" = EXCLUDED."scope",
      "requestHash" = EXCLUDED."requestHash",
      "responseStatus" = NULL,
      "responseBody" = NULL,
      "expiresAt" = EXCLUDED."expiresAt",
      "createdAt" = EXCLUDED."createdAt",
      "updatedAt" = EXCLUDED."updatedAt"
    WHERE "ApiIdempotencyRecord"."expiresAt" <= ${now}
    RETURNING "id", "requestHash", "responseStatus", "responseBody"
  `);
  if (inserted[0]) return { kind: "owner" };

  const existing = await tx.$queryRaw<StoredReceipt[]>(Prisma.sql`
    SELECT "id", "requestHash", "responseStatus", "responseBody"
    FROM "ApiIdempotencyRecord"
    WHERE "id" = ${identity.recordId}
    LIMIT 1
  `);
  const receipt = existing[0];
  if (!receipt) {
    throw new Error("Idempotency receipt disappeared while it was being claimed.");
  }
  if (receipt.requestHash !== identity.requestHash) return { kind: "conflict" };
  if (receipt.responseStatus === null || receipt.responseBody === null) {
    return { kind: "in_progress" };
  }
  return {
    kind: "replay",
    status: receipt.responseStatus,
    body: receipt.responseBody,
  };
}

function assertCacheableStatus(status: number): void {
  const expected =
    Number.isInteger(status) &&
    ((status >= 200 && status <= 299) || (status >= 400 && status <= 499));
  if (!expected) {
    throw new RangeError(
      "Atomic commands may persist only expected 2xx or 4xx wire results.",
    );
  }
}

async function completeReceipt<TBody extends ActionCoordinationJsonObject>(
  tx: Prisma.TransactionClient,
  identity: ActionCoordinationCommandIdentity,
  response: { status: number; body: TBody },
): Promise<void> {
  assertCacheableStatus(response.status);
  // Validate at runtime too: callers can cross a TypeScript boundary through a
  // parsed payload or an `any`, and receipt replay must never normalize it later.
  canonicalActionCoordinationJson(response.body);
  await tx.apiIdempotencyRecord.update({
    where: { id: identity.recordId },
    data: {
      responseStatus: response.status,
      responseBody: response.body as Prisma.InputJsonObject,
    },
  });
}

const privacySafeInterestTombstone = Object.freeze({
  kind: "TOMBSTONE" as const,
});

/**
 * Remove private Action fields from every still-live HTTP receipt that can
 * replay one of the supplied Interests. Safety transitions run under the same
 * user/pair locks as commands, so the redaction commits atomically with the
 * durable Interest tombstone and wins every create/reactivate replay race.
 *
 * The receipt itself is deliberately retained: its request hash, status and
 * expiry continue to enforce the original idempotency identity. A service may
 * subsequently refresh the tombstoned envelope from authoritative state when
 * replaying it, but the database never keeps the old title/location/course in
 * the interim.
 */
export async function tombstoneActionCoordinationInterestReceipts(
  tx: Prisma.TransactionClient,
  interestIds: readonly string[],
  occurredAt: Date,
): Promise<number> {
  const ids = [...new Set(interestIds)].sort(compareCanonicalKeys);
  if (ids.length === 0) return 0;
  if (ids.some((id) => typeof id !== "string" || id.length === 0)) {
    throw new TypeError("Receipt tombstones require non-empty Interest IDs.");
  }
  const timestamp = new Date(occurredAt);
  if (!Number.isFinite(timestamp.getTime())) {
    throw new TypeError("Receipt tombstones require a valid timestamp.");
  }
  const tombstoneJson = JSON.stringify(privacySafeInterestTombstone);
  return tx.$executeRaw(Prisma.sql`
    UPDATE "ApiIdempotencyRecord" receipt
    SET
      "responseBody" = CASE
        WHEN receipt."responseBody" #>> '{interest,id}' IN (${Prisma.join(ids)})
          THEN jsonb_set(
            jsonb_set(
              receipt."responseBody",
              '{interest,context}',
              CAST(${tombstoneJson} AS jsonb),
              FALSE
            ),
            '{interest,planDraft}',
            CAST(${tombstoneJson} AS jsonb),
            FALSE
          )
        WHEN receipt."responseBody" #>> '{currentState,id}' IN (${Prisma.join(ids)})
          THEN jsonb_set(
            jsonb_set(
              receipt."responseBody",
              '{currentState,context}',
              CAST(${tombstoneJson} AS jsonb),
              FALSE
            ),
            '{currentState,planDraft}',
            CAST(${tombstoneJson} AS jsonb),
            FALSE
          )
        WHEN receipt."responseBody" #>> '{reservation,focus,interestId}' IN (${Prisma.join(ids)})
          THEN jsonb_set(
            jsonb_set(
              receipt."responseBody",
              '{reservation,actionContextPreview}',
              CAST(${tombstoneJson} AS jsonb),
              FALSE
            ),
            '{reservation,planDraft}',
            CAST(${tombstoneJson} AS jsonb),
            FALSE
          )
        ELSE receipt."responseBody"
      END,
      "updatedAt" = ${timestamp}
    WHERE receipt."responseBody" IS NOT NULL
      AND (
        receipt."responseBody" #>> '{interest,id}' IN (${Prisma.join(ids)})
        OR receipt."responseBody" #>> '{currentState,id}' IN (${Prisma.join(ids)})
        OR receipt."responseBody" #>> '{reservation,focus,interestId}' IN (${Prisma.join(ids)})
      )
  `);
}

export type ActionCoordinationAtomicCommandResult<
  TBody extends ActionCoordinationJsonObject,
> =
  | {
      kind: "executed";
      status: number;
      body: TBody | ActionCoordinationExpectedFailurePayload;
      identity: ActionCoordinationCommandIdentity;
    }
  | {
      kind: "replayed";
      status: number;
      body: TBody | ActionCoordinationExpectedFailurePayload;
      identity: ActionCoordinationCommandIdentity;
    }
  | {
      kind: "idempotency_conflict";
      status: 409;
      code: "IDEMPOTENCY_CONFLICT";
      identity: ActionCoordinationCommandIdentity;
    }
  | {
      kind: "in_progress";
      status: 409;
      code: "REQUEST_IN_PROGRESS";
      retryAfterSeconds: 1;
      identity: ActionCoordinationCommandIdentity;
    };

export type ActionCoordinationTransactionContext = Readonly<{
  tx: Prisma.TransactionClient;
  now: Date;
  pairs: readonly CanonicalUserPair[];
}>;

export type ActionCoordinationDatabase = Pick<PrismaClient, "$transaction">;

export type ActionCoordinationTransactionOptions = Readonly<{
  maxWait?: number;
  timeout?: number;
  isolationLevel?: Prisma.TransactionIsolationLevel;
}>;

export const DEFAULT_ACTION_COORDINATION_TRANSACTION_OPTIONS = Object.freeze({
  maxWait: 5_000,
  timeout: 15_000,
} satisfies ActionCoordinationTransactionOptions);

export type ActionCoordinationCommandDependencies = Readonly<{
  db?: ActionCoordinationDatabase;
  clock?: ActionCoordinationClock;
  receiptTtlMs?: number;
  transactionOptions?: ActionCoordinationTransactionOptions;
}>;

export type ActionCoordinationReplayResponse<
  TBody extends ActionCoordinationJsonObject,
> = Readonly<{
  status: number;
  body: TBody | ActionCoordinationExpectedFailurePayload;
}>;

/**
 * Execute one externally requested mutation. The pair lock(s), sampled clock,
 * receipt, domain writes, prescribed events/outbox writes, and response receipt
 * all share this one database transaction. The callback must not perform an
 * outbound side effect; it may be retried only by a new invocation using the
 * same receipt identity.
 */
export async function runAtomicActionCoordinationCommand<
  TBody extends ActionCoordinationJsonObject,
>(
  options: {
    request: ActionCoordinationCommandRequest;
    pairs?: readonly UserPairInput[];
    execute: (
      context: ActionCoordinationTransactionContext,
    ) => Promise<{ status: number; body: TBody }>;
    refreshReplay?: (
      context: ActionCoordinationTransactionContext,
      replay: ActionCoordinationReplayResponse<TBody>,
    ) => Promise<ActionCoordinationReplayResponse<TBody>>;
  },
  dependencies: ActionCoordinationCommandDependencies = {},
): Promise<ActionCoordinationAtomicCommandResult<TBody>> {
  const identity = buildActionCoordinationCommandIdentity(options.request);
  const db = dependencies.db ?? prisma;
  const clock = dependencies.clock ?? databaseActionCoordinationClock;
  const ttlMs = dependencies.receiptTtlMs ?? 24 * 60 * 60_000;
  if (!Number.isFinite(ttlMs) || ttlMs <= 0) {
    throw new TypeError("receiptTtlMs must be a positive duration.");
  }
  const transactionOptions =
    dependencies.transactionOptions ??
    DEFAULT_ACTION_COORDINATION_TRANSACTION_OPTIONS;

  return db.$transaction(async (tx) => {
    // All pair-scoped commands use this shared order. The service callback must
    // now re-read/revalidate the narrower resource before locking it.
    const requestedPairs = stableCanonicalPairs(options.pairs ?? []);
    await userConnectionSafetyLocks(
      tx,
      requestedPairs.flatMap((pair) => [pair.minUserId, pair.maxUserId]),
    );
    const pairs = await pairSafetyLocks(tx, requestedPairs);
    const sampled = await clock.now(tx);
    const timestamp = new Date(sampled);
    if (!Number.isFinite(timestamp.getTime())) {
      throw new Error("Action coordination clock returned an invalid timestamp.");
    }
    const now = new Date(timestamp.getTime());
    const claim = await claimReceipt(tx, identity, now, ttlMs);

    if (claim.kind === "conflict") {
      return {
        kind: "idempotency_conflict",
        status: 409,
        code: "IDEMPOTENCY_CONFLICT",
        identity,
      } as const;
    }
    if (claim.kind === "in_progress") {
      return {
        kind: "in_progress",
        status: 409,
        code: "REQUEST_IN_PROGRESS",
        retryAfterSeconds: 1,
        identity,
      } as const;
    }
    if (claim.kind === "replay") {
      const replay = options.refreshReplay
        ? await options.refreshReplay(
            { tx, now: new Date(now.getTime()), pairs },
            {
              status: claim.status,
              body: claim.body as TBody | ActionCoordinationExpectedFailurePayload,
            },
          )
        : {
            status: claim.status,
            body: claim.body as TBody | ActionCoordinationExpectedFailurePayload,
          };
      if (options.refreshReplay) {
        await completeReceipt(tx, identity, replay);
      }
      return {
        kind: "replayed",
        status: replay.status,
        body: replay.body,
        identity,
      } as const;
    }

    let response: {
      status: number;
      body: TBody | ActionCoordinationExpectedFailurePayload;
    };
    try {
      response = await options.execute({
        tx,
        now: new Date(now.getTime()),
        pairs,
      });
    } catch (cause) {
      if (isActionCoordinationConflict(cause)) {
        response = actionCoordinationConflictResult(cause);
      } else if (isActionCoordinationFailure(cause)) {
        response = actionCoordinationFailureResult(cause);
      } else {
        throw cause;
      }
    }
    await completeReceipt(tx, identity, response);
    return { kind: "executed", ...response, identity } as const;
  }, transactionOptions);
}

export type GuardedWorkerTransitionResult<TValue> =
  | { kind: "applied"; value: TValue }
  | {
      kind: "not_applicable";
      currentState?: ActionCoordinationJsonObject;
    };

export function appliedWorkerTransition<TValue>(
  value: TValue,
): GuardedWorkerTransitionResult<TValue> {
  return { kind: "applied", value };
}

export function skippedWorkerTransition<TValue = never>(
  currentState?: ActionCoordinationJsonObject,
): GuardedWorkerTransitionResult<TValue> {
  return currentState
    ? { kind: "not_applicable", currentState }
    : { kind: "not_applicable" };
}

/**
 * Worker/lazy-finalizer entry point. It intentionally has no actor, HTTP key,
 * receipt identity, or response cache. The callback must use a conditional
 * state transition and return not_applicable when another worker already won.
 */
export async function runGuardedActionCoordinationWorkerTransition<TValue>(
  options: {
    pairs?: readonly UserPairInput[];
    transition: (
      context: ActionCoordinationTransactionContext,
    ) => Promise<GuardedWorkerTransitionResult<TValue>>;
  },
  dependencies: Omit<
    ActionCoordinationCommandDependencies,
    "receiptTtlMs"
  > = {},
): Promise<GuardedWorkerTransitionResult<TValue>> {
  const db = dependencies.db ?? prisma;
  const clock = dependencies.clock ?? databaseActionCoordinationClock;
  const transactionOptions =
    dependencies.transactionOptions ??
    DEFAULT_ACTION_COORDINATION_TRANSACTION_OPTIONS;

  return db.$transaction(async (tx) => {
    const requestedPairs = stableCanonicalPairs(options.pairs ?? []);
    await userConnectionSafetyLocks(
      tx,
      requestedPairs.flatMap((pair) => [pair.minUserId, pair.maxUserId]),
    );
    const pairs = await pairSafetyLocks(tx, requestedPairs);
    const sampled = await clock.now(tx);
    const timestamp = new Date(sampled);
    if (!Number.isFinite(timestamp.getTime())) {
      throw new Error("Action coordination clock returned an invalid timestamp.");
    }
    return options.transition({
      tx,
      now: new Date(timestamp.getTime()),
      pairs,
    });
  }, transactionOptions);
}
