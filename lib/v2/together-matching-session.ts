import "server-only";

import { Prisma, type PrismaClient } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";

export const TOGETHER_MATCHING_SESSION_DURATION_MS = 48 * 60 * 60 * 1_000;

type MatchingSessionDb = Prisma.TransactionClient | PrismaClient;

type MatchingSessionRow = Readonly<{
  startedAt: Date;
  matchingUntil: Date;
  stoppedAt: Date | null;
  version: number;
}>;

export type TogetherMatchingSessionState = "IDLE" | "MATCHING" | "EXPIRED";

export type TogetherMatchingSessionResponse = Readonly<{
  state: TogetherMatchingSessionState;
  startedAt: string | null;
  matchingUntil: string | null;
  stoppedAt: string | null;
  version: number;
}>;

export class TogetherMatchingSessionError extends Error {
  constructor(public readonly code: "TOGETHER_MATCHING_SESSION_NO_ACTIVE_INTENTS") {
    super(code);
  }
}

export function projectTogetherMatchingSession(
  row: MatchingSessionRow | null,
  now = new Date(),
): TogetherMatchingSessionResponse {
  if (!row) {
    return {
      state: "IDLE",
      startedAt: null,
      matchingUntil: null,
      stoppedAt: null,
      version: 0,
    };
  }

  const state: TogetherMatchingSessionState = row.stoppedAt
    ? "IDLE"
    : row.matchingUntil.getTime() <= now.getTime()
      ? "EXPIRED"
      : "MATCHING";

  return {
    state,
    startedAt: row.startedAt.toISOString(),
    matchingUntil: row.matchingUntil.toISOString(),
    stoppedAt: row.stoppedAt?.toISOString() ?? null,
    version: row.version,
  };
}

/**
 * Shared matcher gate. Passing the matcher's transaction client allows the
 * final opportunity insert to re-check both participants without a race-prone
 * out-of-transaction cache.
 */
export async function hasActiveTogetherMatchingSession(
  db: MatchingSessionDb,
  userId: string,
  now = new Date(),
): Promise<boolean> {
  const session = await db.togetherMatchingSession.findFirst({
    where: {
      userId,
      stoppedAt: null,
      matchingUntil: { gt: now },
    },
    select: { id: true },
  });
  return session !== null;
}

export async function loadTogetherMatchingSession(
  userId: string,
  now = new Date(),
): Promise<TogetherMatchingSessionResponse> {
  const row = await prisma.togetherMatchingSession.findUnique({
    where: { userId },
    select: {
      startedAt: true,
      matchingUntil: true,
      stoppedAt: true,
      version: true,
    },
  });
  return projectTogetherMatchingSession(row, now);
}

export async function startTogetherMatchingSession(
  userId: string,
  now = new Date(),
): Promise<TogetherMatchingSessionResponse> {
  const matchingUntil = new Date(
    now.getTime() + TOGETHER_MATCHING_SESSION_DURATION_MS,
  );

  const row = await prisma.$transaction(async (tx) => {
    const activeIntentCount = await tx.weeklyIntent.count({
      where: {
        userId,
        status: "ACTIVE",
        expiresAt: { gt: now },
      },
    });
    if (activeIntentCount === 0) {
      throw new TogetherMatchingSessionError(
        "TOGETHER_MATCHING_SESSION_NO_ACTIVE_INTENTS",
      );
    }

    return tx.togetherMatchingSession.upsert({
      where: { userId },
      create: {
        userId,
        startedAt: now,
        matchingUntil,
      },
      update: {
        startedAt: now,
        matchingUntil,
        stoppedAt: null,
        version: { increment: 1 },
      },
      select: {
        startedAt: true,
        matchingUntil: true,
        stoppedAt: true,
        version: true,
      },
    });
  });

  return projectTogetherMatchingSession(row, now);
}

export async function stopTogetherMatchingSession(
  userId: string,
  now = new Date(),
): Promise<TogetherMatchingSessionResponse> {
  const row = await prisma.$transaction(async (tx) => {
    // A user returning to a shipped client still expects Stop to stop supply.
    // Lock intentions before sessions, in the same order as the matcher.
    const published = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT "id" FROM "WeeklyIntent"
      WHERE "userId" = ${userId} AND "automaticMatching" = true AND "status" = 'ACTIVE'
      ORDER BY "id" FOR UPDATE
    `);
    if (published.length > 0) {
      const ids = published.map(intent => intent.id);
      await tx.weeklyIntent.updateMany({
        where: { id: { in: ids } },
        data: { status: "PAUSED", pausedAt: now, version: { increment: 1 } },
      });
      await tx.mutualOpportunity.updateMany({
        where: { status: "PENDING", OR: [{ intentAId: { in: ids } }, { intentBId: { in: ids } }] },
        data: { status: "UNAVAILABLE", terminalAt: now, version: { increment: 1 } },
      });
    }
    await tx.togetherMatchingSession.updateMany({
      where: {
        userId,
        stoppedAt: null,
        matchingUntil: { gt: now },
      },
      data: {
        stoppedAt: now,
        version: { increment: 1 },
      },
    });
    return tx.togetherMatchingSession.findUnique({
      where: { userId },
      select: {
        startedAt: true,
        matchingUntil: true,
        stoppedAt: true,
        version: true,
      },
    });
  });

  return projectTogetherMatchingSession(row, now);
}
