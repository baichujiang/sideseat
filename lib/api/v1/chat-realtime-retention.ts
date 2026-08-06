import "server-only";

import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";

const DEFAULT_RETENTION_DAYS = 14;
const MIN_RETENTION_DAYS = 1;
const MAX_RETENTION_DAYS = 90;
const DEFAULT_BATCH_SIZE = 2_000;
const MAX_BATCH_SIZE = 10_000;
const DEFAULT_MAX_BATCHES = 10;
const MAX_BATCHES = 50;

type CleanupRow = {
  deletedCount: number;
  conversations: string[];
};

function boundedInteger(raw: string | undefined, fallback: number, min: number, max: number) {
  const parsed = Number.parseInt(raw ?? "", 10);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
}

export function chatRealtimeRetentionDays() {
  return boundedInteger(
    process.env.CHAT_REALTIME_RETENTION_DAYS,
    DEFAULT_RETENTION_DAYS,
    MIN_RETENTION_DAYS,
    MAX_RETENTION_DAYS,
  );
}

export async function cleanupChatRealtimeEvents(options: {
  now?: Date;
  retentionDays?: number;
  batchSize?: number;
  maxBatches?: number;
} = {}) {
  const retentionDays = Math.min(
    MAX_RETENTION_DAYS,
    Math.max(MIN_RETENTION_DAYS, options.retentionDays ?? chatRealtimeRetentionDays()),
  );
  const batchSize = Math.min(
    MAX_BATCH_SIZE,
    Math.max(1, options.batchSize ?? DEFAULT_BATCH_SIZE),
  );
  const maxBatches = Math.min(
    MAX_BATCHES,
    Math.max(1, options.maxBatches ?? DEFAULT_MAX_BATCHES),
  );
  const now = options.now ?? new Date();
  const cutoff = new Date(now.getTime() - retentionDays * 24 * 60 * 60 * 1_000);
  let deletedCount = 0;
  let batches = 0;
  const conversations = new Set<string>();

  for (let batch = 0; batch < maxBatches; batch += 1) {
    const rows = await prisma.$queryRaw<CleanupRow[]>(Prisma.sql`
      WITH candidates AS MATERIALIZED (
        SELECT "sequence"
        FROM "ChatRealtimeEvent"
        WHERE "occurredAt" < ${cutoff}
        ORDER BY "sequence" ASC
        LIMIT ${batchSize}
        FOR UPDATE SKIP LOCKED
      ), deleted AS (
        DELETE FROM "ChatRealtimeEvent" AS event
        USING candidates
        WHERE event."sequence" = candidates."sequence"
        RETURNING
          event."conversationKind",
          event."conversationId",
          event."sequence"
      ), boundaries AS (
        SELECT
          "conversationKind",
          "conversationId",
          MAX("sequence") AS "retainedAfterSequence"
        FROM deleted
        GROUP BY "conversationKind", "conversationId"
      ), persisted AS (
        INSERT INTO "ChatRealtimeRetention" (
          "conversationKind",
          "conversationId",
          "retainedAfterSequence",
          "updatedAt"
        )
        SELECT
          "conversationKind",
          "conversationId",
          "retainedAfterSequence",
          NOW()
        FROM boundaries
        ON CONFLICT ("conversationKind", "conversationId") DO UPDATE SET
          "retainedAfterSequence" = GREATEST(
            "ChatRealtimeRetention"."retainedAfterSequence",
            EXCLUDED."retainedAfterSequence"
          ),
          "updatedAt" = NOW()
        RETURNING "conversationKind", "conversationId"
      )
      SELECT
        (SELECT COUNT(*)::INTEGER FROM deleted) AS "deletedCount",
        COALESCE(
          (SELECT ARRAY_AGG("conversationKind" || ':' || "conversationId") FROM persisted),
          ARRAY[]::TEXT[]
        ) AS "conversations"
    `);
    const row = rows[0] ?? { deletedCount: 0, conversations: [] };
    deletedCount += row.deletedCount;
    batches += 1;
    row.conversations.forEach((conversation) => conversations.add(conversation));
    if (row.deletedCount < batchSize) break;
  }

  return {
    cutoff: cutoff.toISOString(),
    retentionDays,
    deletedCount,
    conversationCount: conversations.size,
    batches,
    hasMore: batches === maxBatches && deletedCount === batchSize * maxBatches,
  };
}
