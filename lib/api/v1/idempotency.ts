import "server-only";

import { createHash } from "crypto";
import { Prisma, type PrismaClient } from "@prisma/client";

type IdempotencyDb = Pick<PrismaClient, "$queryRaw">;

type StoredIdempotencyRecord = {
  id: string;
  requestHash: string;
  responseStatus: number | null;
  responseBody: Prisma.JsonValue | null;
};

export type IdempotencyClaim =
  | { kind: "owner"; recordId: string; requestHash: string }
  | { kind: "replay"; status: number; body: Prisma.JsonValue }
  | { kind: "conflict" }
  | { kind: "in_progress" };

function sha256(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
    .join(",")}}`;
}

export function readIdempotencyKey(request: Request) {
  const key = request.headers.get("idempotency-key")?.trim() ?? "";
  return /^[A-Za-z0-9._:-]{8,128}$/.test(key) ? key : null;
}

export function hashIdempotencyRequest(value: unknown) {
  return sha256(stableJson(value));
}

export async function claimIdempotency(
  db: IdempotencyDb,
  options: {
    scope: string;
    actorId: string;
    key: string;
    requestHash: string;
    now?: Date;
    ttlMs?: number;
  },
): Promise<IdempotencyClaim> {
  const now = options.now ?? new Date();
  const expiresAt = new Date(now.getTime() + (options.ttlMs ?? 24 * 60 * 60_000));
  const recordId = sha256(`${options.scope}\0${options.actorId}\0${options.key}`);

  const inserted = await db.$queryRaw<StoredIdempotencyRecord[]>(Prisma.sql`
    INSERT INTO "ApiIdempotencyRecord"
      ("id", "scope", "requestHash", "expiresAt", "createdAt", "updatedAt")
    VALUES
      (${recordId}, ${options.scope}, ${options.requestHash}, ${expiresAt}, ${now}, ${now})
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
  if (inserted[0]) {
    return { kind: "owner", recordId, requestHash: options.requestHash };
  }

  const existing = await db.$queryRaw<StoredIdempotencyRecord[]>(Prisma.sql`
    SELECT "id", "requestHash", "responseStatus", "responseBody"
    FROM "ApiIdempotencyRecord"
    WHERE "id" = ${recordId}
    LIMIT 1
  `);
  const record = existing[0];
  if (!record) {
    throw new Error("Idempotency claim disappeared before it could be read.");
  }
  if (record.requestHash !== options.requestHash) return { kind: "conflict" };
  if (record.responseStatus === null || record.responseBody === null) return { kind: "in_progress" };
  return { kind: "replay", status: record.responseStatus, body: record.responseBody };
}

export async function completeIdempotency(
  db: Pick<PrismaClient, "apiIdempotencyRecord">,
  claim: Extract<IdempotencyClaim, { kind: "owner" }>,
  response: { status: number; body: Prisma.InputJsonValue },
) {
  await db.apiIdempotencyRecord.update({
    where: { id: claim.recordId },
    data: {
      responseStatus: response.status,
      responseBody: response.body,
    },
  });
}
