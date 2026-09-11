import "server-only";

import {
  Prisma,
  SocialIntentTopic,
  SportTag,
  TogetherMode,
  type PrismaClient,
} from "@prisma/client";

import { prisma } from "@/lib/db/prisma";
import type {
  WeeklyIntentCreateInput,
  WeeklyIntentPatchInput,
} from "@/lib/validators/weekly-intent";
import {
  normalizeWeeklyIntentWindows,
  weeklyIntentExpiry,
  weeklyIntentWindowsFitLifecycle,
} from "@/lib/v2/weekly-intent-policy";
import { matchAndNotifyForUser } from "@/lib/v2/mutual-opportunity-auto-match";
import { readTimePreference, recentIntentExpiry, flexiblePreferenceFitsLifecycle } from "@/lib/v2/intent-timing";

const CURRENT_POLICY_VERSION = 1;
// This is a hidden abuse guard, not a product-level weekly quota. A normal
// user may express several independent intentions (for example, one per
// course) and each one is matched independently.
const MAX_NON_TERMINAL_INTENTS_PER_USER = 12;
const NON_TERMINAL_STATES = ["ACTIVE", "PAUSED"] as const;

type WeeklyIntentDb = Prisma.TransactionClient | PrismaClient;

export type WeeklyIntentErrorCode =
  | "WEEKLY_INTENT_LIMIT_REACHED"
  | "WEEKLY_INTENT_NOT_FOUND"
  | "WEEKLY_INTENT_VERSION_CONFLICT"
  | "WEEKLY_INTENT_TERMINAL"
  | "WEEKLY_INTENT_STATE_INVALID"
  | "WEEKLY_INTENT_WINDOW_INVALID"
  | "WEEKLY_INTENT_COURSE_INVALID"
  | "WEEKLY_INTENT_ACTIVITY_INVALID"
  | "WEEKLY_INTENT_SPORT_INVALID"
  | "WEEKLY_INTENT_STUDY_GOAL_INVALID"
  | "WEEKLY_INTENT_TOGETHER_MODE_INVALID";

export class WeeklyIntentError extends Error {
  constructor(public readonly code: WeeklyIntentErrorCode) {
    super(code);
  }
}

const ownerSelect = {
  id: true,
  topic: true,
  togetherMode: true,
  studyGoal: true,
  activityText: true,
  sportTag: true,
  sportOtherNote: true,
  courseId: true,
  course: { select: { id: true, code: true, name: true } },
  timeWindows: true,
  timePreference: true,
  automaticMatching: true,
  exploreVisible: true,
  timeZone: true,
  note: true,
  status: true,
  policyVersion: true,
  version: true,
  expiresAt: true,
  pausedAt: true,
  endedAt: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.WeeklyIntentSelect;

type OwnerRow = Prisma.WeeklyIntentGetPayload<{ select: typeof ownerSelect }>;

function ownerResponse(row: OwnerRow) {
  return {
    ...row,
    expiresAt: row.expiresAt.toISOString(),
    pausedAt: row.pausedAt?.toISOString() ?? null,
    endedAt: row.endedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function ownerCollection(rows: OwnerRow[]) {
  const ordered = [...rows].sort((left, right) => {
    if (left.status !== right.status) {
      return left.status === "ACTIVE" ? -1 : 1;
    }
    return right.createdAt.getTime() - left.createdAt.getTime() ||
      right.id.localeCompare(left.id);
  });
  const intents = ordered.map(ownerResponse);
  return {
    // Keep the legacy singular projection until old TestFlight builds age out.
    intent: intents[0] ?? null,
    intents,
  };
}

function normalizedWindows(
  input: WeeklyIntentCreateInput["timeWindows"],
): Prisma.InputJsonValue {
  return normalizeWeeklyIntentWindows(input);
}

function normalizedSportSelection(
  topic: SocialIntentTopic,
  sportTag: SportTag | null | undefined,
  sportOtherNote: string | null | undefined,
) {
  if (topic !== SocialIntentTopic.SPORTS) {
    return { sportTag: null, sportOtherNote: null };
  }

  const normalizedOtherNote = sportOtherNote?.trim() || null;
  if (sportTag === SportTag.OTHER) {
    if (!normalizedOtherNote) {
      throw new WeeklyIntentError("WEEKLY_INTENT_SPORT_INVALID");
    }
    return { sportTag, sportOtherNote: normalizedOtherNote };
  }
  if (normalizedOtherNote) {
    throw new WeeklyIntentError("WEEKLY_INTENT_SPORT_INVALID");
  }
  // NULL intentionally represents an intent created by an older client. It
  // remains readable/editable but is not a concrete sport match candidate.
  return { sportTag: sportTag ?? null, sportOtherNote: null };
}

function normalizedStudySelection(
  topic: SocialIntentTopic,
  togetherMode: TogetherMode | undefined,
  studyGoal: string | null | undefined,
) {
  const normalizedGoal = studyGoal?.trim() || null;
  if (topic !== SocialIntentTopic.STUDY) {
    if (normalizedGoal) {
      throw new WeeklyIntentError("WEEKLY_INTENT_STUDY_GOAL_INVALID");
    }
    if (
      togetherMode !== undefined &&
      togetherMode !== TogetherMode.SAME_ACTIVITY
    ) {
      throw new WeeklyIntentError("WEEKLY_INTENT_TOGETHER_MODE_INVALID");
    }
    return {
      togetherMode: TogetherMode.SAME_ACTIVITY,
      studyGoal: null,
    };
  }
  return {
    togetherMode: togetherMode ?? TogetherMode.SAME_ACTIVITY,
    studyGoal: normalizedGoal,
  };
}

function normalizedActivityText(
  topic: SocialIntentTopic,
  activityText: string | null | undefined,
) {
  const normalized = activityText?.trim() || null;
  if (
    topic === SocialIntentTopic.STUDY ||
    topic === SocialIntentTopic.SPORTS
  ) {
    if (normalized) {
      throw new WeeklyIntentError("WEEKLY_INTENT_ACTIVITY_INVALID");
    }
    return null;
  }
  // NULL is retained only for old clients. Current clients require a concrete
  // action before enabling Save, and the matcher never pairs NULL with text.
  return normalized;
}

async function autoMatchAfterMutation(userId: string) {
  try {
    await matchAndNotifyForUser(userId);
  } catch (cause) {
    // The intent transaction already committed. Returning success keeps an
    // idempotent create/edit from being replayed into a duplicate; GET/list
    // provides the retry path. Only explicitly published active intentions or
    // legacy intentions with an active session participate.
    console.error("Weekly Intent auto-match failed after mutation", cause);
  }
}

function assertWindowsWithinLifecycle(
  windows: WeeklyIntentCreateInput["timeWindows"],
  now: Date,
  expiresAt: Date,
) {
  if (!weeklyIntentWindowsFitLifecycle(windows, now, expiresAt)) {
    throw new WeeklyIntentError("WEEKLY_INTENT_WINDOW_INVALID");
  }
}

function assertTiming(windows: WeeklyIntentCreateInput["timeWindows"], preference: unknown,
  timeZone: string, now: Date, expiresAt: Date) {
  const timing = readTimePreference(preference);
  if (timing.kind === "EXACT") {
    if (!windows.length) throw new WeeklyIntentError("WEEKLY_INTENT_WINDOW_INVALID");
    assertWindowsWithinLifecycle(windows, now, expiresAt);
  } else if (windows.length || !flexiblePreferenceFitsLifecycle(timing, timeZone, now, expiresAt)) {
    throw new WeeklyIntentError("WEEKLY_INTENT_WINDOW_INVALID");
  }
}

async function lockUser(tx: Prisma.TransactionClient, userId: string) {
  await tx.$queryRaw(Prisma.sql`
    SELECT "id" FROM "User" WHERE "id" = ${userId} FOR UPDATE
  `);
}

async function lockUserIntents(
  tx: Prisma.TransactionClient,
  userId: string,
) {
  await tx.$queryRaw(Prisma.sql`
    SELECT "id"
    FROM "WeeklyIntent"
    WHERE "userId" = ${userId}
    ORDER BY "id"
    FOR UPDATE
  `);
}

async function expireCurrentRows(
  db: Prisma.TransactionClient,
  userId: string,
  now: Date,
) {
  const stale = await db.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT "id"
    FROM "WeeklyIntent"
    WHERE "userId" = ${userId}
      AND "status" IN ('ACTIVE', 'PAUSED')
      AND "expiresAt" <= ${now}
    ORDER BY "id"
    FOR UPDATE
  `);
  if (stale.length === 0) return;
  const staleIds = stale.map((row) => row.id);
  await db.weeklyIntent.updateMany({
    where: {
      id: { in: staleIds },
      userId,
      status: { in: [...NON_TERMINAL_STATES] },
    },
    data: {
      status: "EXPIRED",
      endedAt: now,
      pausedAt: null,
      version: { increment: 1 },
    },
  });
  await db.mutualOpportunity.updateMany({
    where: {
      status: "PENDING",
      OR: [{ intentAId: { in: staleIds } }, { intentBId: { in: staleIds } }],
    },
    data: {
      status: "EXPIRED",
      terminalAt: now,
      version: { increment: 1 },
    },
  });
}

async function invalidatePendingOpportunities(
  tx: Prisma.TransactionClient,
  intentId: string,
  now: Date,
) {
  await tx.mutualOpportunity.updateMany({
    where: {
      status: "PENDING",
      OR: [{ intentAId: intentId }, { intentBId: intentId }],
    },
    data: {
      status: "UNAVAILABLE",
      terminalAt: now,
      version: { increment: 1 },
    },
  });
}

async function assertCurrentCourse(
  db: WeeklyIntentDb,
  userId: string,
  courseId: string | null | undefined,
  now: Date,
) {
  if (!courseId) return;
  const membership = await db.userCourse.findFirst({
    where: {
      userId,
      courseId,
      OR: [{ activeUntil: null }, { activeUntil: { gt: now } }],
    },
    select: { id: true },
  });
  if (!membership) {
    throw new WeeklyIntentError("WEEKLY_INTENT_COURSE_INVALID");
  }
}

export async function loadCurrentWeeklyIntent(
  userId: string,
  now = new Date(),
) {
  return prisma.$transaction(async (tx) => {
    await lockUser(tx, userId);
    await lockUserIntents(tx, userId);
    await expireCurrentRows(tx, userId, now);
    const rows = await tx.weeklyIntent.findMany({
      where: { userId, status: { in: [...NON_TERMINAL_STATES] } },
      select: ownerSelect,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });
    return ownerCollection(rows);
  });
}

export async function createWeeklyIntent(
  userId: string,
  input: WeeklyIntentCreateInput,
  now = new Date(),
) {
  const expiresAt = input.timePreference || input.automaticMatching ? recentIntentExpiry(now) : weeklyIntentExpiry(input.timeZone, now);
  assertTiming(input.timeWindows, input.timePreference, input.timeZone, now, expiresAt);
  const sport = normalizedSportSelection(
    input.topic,
    input.sportTag,
    input.sportOtherNote,
  );
  const study = normalizedStudySelection(
    input.topic,
    input.togetherMode,
    input.studyGoal,
  );
  const activityText = normalizedActivityText(input.topic, input.activityText);

  const result = await prisma.$transaction(async (tx) => {
    await lockUser(tx, userId);
    await lockUserIntents(tx, userId);
    await expireCurrentRows(tx, userId, now);
    const currentCount = await tx.weeklyIntent.count({
      where: { userId, status: { in: [...NON_TERMINAL_STATES] } },
    });
    if (currentCount >= MAX_NON_TERMINAL_INTENTS_PER_USER) {
      throw new WeeklyIntentError("WEEKLY_INTENT_LIMIT_REACHED");
    }
    await assertCurrentCourse(tx, userId, input.courseId, now);
    const row = await tx.weeklyIntent.create({
      data: {
        userId,
        topic: input.topic,
        togetherMode: study.togetherMode,
        studyGoal: study.studyGoal,
        activityText,
        sportTag: sport.sportTag,
        sportOtherNote: sport.sportOtherNote,
        courseId: input.courseId ?? null,
        timeWindows: normalizedWindows(input.timeWindows),
        ...(input.timePreference ? { timePreference: input.timePreference } : {}),
        automaticMatching: input.automaticMatching ?? false,
        exploreVisible: input.exploreVisible ?? false,
        timeZone: input.timeZone,
        note: input.note || null,
        policyVersion: CURRENT_POLICY_VERSION,
        expiresAt,
      },
      select: ownerSelect,
    });
    return { intent: ownerResponse(row) };
  });
  await autoMatchAfterMutation(userId);
  return result;
}

export async function patchWeeklyIntent(
  userId: string,
  intentId: string,
  input: WeeklyIntentPatchInput,
  now = new Date(),
) {
  const result = await prisma.$transaction(async (tx) => {
    await lockUser(tx, userId);
    await lockUserIntents(tx, userId);
    await expireCurrentRows(tx, userId, now);
    const current = await tx.weeklyIntent.findFirst({
      where: { id: intentId, userId },
      select: ownerSelect,
    });
    if (!current) throw new WeeklyIntentError("WEEKLY_INTENT_NOT_FOUND");
    if (current.version !== input.expectedVersion) {
      throw new WeeklyIntentError("WEEKLY_INTENT_VERSION_CONFLICT");
    }
    if (current.status === "ENDED" || current.status === "EXPIRED") {
      throw new WeeklyIntentError("WEEKLY_INTENT_TERMINAL");
    }

    let data: Prisma.WeeklyIntentUpdateInput;
    if (input.action === "PAUSE") {
      if (current.status !== "ACTIVE") {
        throw new WeeklyIntentError("WEEKLY_INTENT_STATE_INVALID");
      }
      data = { status: "PAUSED", pausedAt: now, version: { increment: 1 } };
    } else if (input.action === "RESUME") {
      if (current.status !== "PAUSED") {
        throw new WeeklyIntentError("WEEKLY_INTENT_STATE_INVALID");
      }
      data = { status: "ACTIVE", pausedAt: null, version: { increment: 1 },
        ...(input.automaticMatching ? { automaticMatching: true } : {}) };
    } else if (input.action === "EXTEND") {
      data = { expiresAt: recentIntentExpiry(now), version: { increment: 1 } };
    } else {
      const nextWindows = input.timeWindows ??
        (current.timeWindows as WeeklyIntentCreateInput["timeWindows"]);
      const nextPreference = input.timePreference ?? current.timePreference;
      assertTiming(nextWindows, nextPreference, input.timeZone ?? current.timeZone, now, current.expiresAt);
      const nextCourseId = input.courseId === undefined
        ? current.courseId
        : input.courseId;
      await assertCurrentCourse(tx, userId, nextCourseId, now);
      const nextTopic = input.topic ?? current.topic;
      const nextTogetherMode = nextTopic === SocialIntentTopic.STUDY
        ? input.togetherMode ??
          (current.topic === SocialIntentTopic.STUDY
            ? current.togetherMode
            : TogetherMode.SAME_ACTIVITY)
        : input.togetherMode ?? TogetherMode.SAME_ACTIVITY;
      const nextStudyGoal = nextTopic === SocialIntentTopic.STUDY
        ? input.studyGoal !== undefined
          ? input.studyGoal
          : current.topic === SocialIntentTopic.STUDY
            ? current.studyGoal
            : null
        : input.studyGoal ?? null;
      const study = normalizedStudySelection(
        nextTopic,
        nextTogetherMode,
        nextStudyGoal,
      );
      const nextActivityText =
        nextTopic !== SocialIntentTopic.STUDY &&
        nextTopic !== SocialIntentTopic.SPORTS
          ? input.activityText !== undefined
            ? input.activityText
            : current.topic !== SocialIntentTopic.STUDY &&
                current.topic !== SocialIntentTopic.SPORTS
              ? current.activityText
              : null
          : input.activityText ?? null;
      const activityText = normalizedActivityText(
        nextTopic,
        nextActivityText,
      );
      const nextSportTag = nextTopic === SocialIntentTopic.SPORTS
        ? input.sportTag !== undefined
          ? input.sportTag
          : current.topic === SocialIntentTopic.SPORTS
            ? current.sportTag
            : null
        : null;
      if (
        input.sportOtherNote != null &&
        nextSportTag !== SportTag.OTHER
      ) {
        throw new WeeklyIntentError("WEEKLY_INTENT_SPORT_INVALID");
      }
      const nextSportOtherNote = nextSportTag === SportTag.OTHER
        ? input.sportOtherNote !== undefined
          ? input.sportOtherNote
          : current.topic === SocialIntentTopic.SPORTS &&
              current.sportTag === SportTag.OTHER
            ? current.sportOtherNote
            : null
        : null;
      const sport = normalizedSportSelection(
        nextTopic,
        nextSportTag,
        nextSportOtherNote,
      );
      data = {
        ...(input.topic !== undefined ? { topic: input.topic } : {}),
        togetherMode: study.togetherMode,
        studyGoal: study.studyGoal,
        activityText,
        sportTag: sport.sportTag,
        sportOtherNote: sport.sportOtherNote,
        ...(input.courseId !== undefined
          ? { course: input.courseId
              ? { connect: { id: input.courseId } }
              : { disconnect: true } }
          : {}),
        ...(input.timeWindows !== undefined
          ? { timeWindows: normalizedWindows(input.timeWindows) }
          : {}),
        ...(input.timeZone !== undefined ? { timeZone: input.timeZone } : {}),
        ...(input.timePreference !== undefined ? { timePreference: input.timePreference } : {}),
        ...(input.automaticMatching ? { automaticMatching: true } : {}),
        ...(input.exploreVisible !== undefined ? { exploreVisible: input.exploreVisible } : {}),
        ...(input.note !== undefined ? { note: input.note || null } : {}),
        version: { increment: 1 },
      };
    }

    const row = await tx.weeklyIntent.update({
      where: { id: current.id },
      data,
      select: ownerSelect,
    });
    if (input.action === "PAUSE" || input.action === "EDIT") {
      await invalidatePendingOpportunities(tx, current.id, now);
    }
    return { intent: ownerResponse(row) };
  });
  if (input.action === "EDIT" || input.action === "RESUME" || input.action === "EXTEND") {
    await autoMatchAfterMutation(userId);
  }
  return result;
}

export async function endWeeklyIntent(
  userId: string,
  intentId: string,
  expectedVersion: number,
  now = new Date(),
) {
  return prisma.$transaction(async (tx) => {
    await lockUser(tx, userId);
    await lockUserIntents(tx, userId);
    await expireCurrentRows(tx, userId, now);
    const current = await tx.weeklyIntent.findFirst({
      where: { id: intentId, userId },
      select: ownerSelect,
    });
    if (!current) throw new WeeklyIntentError("WEEKLY_INTENT_NOT_FOUND");
    if (current.version !== expectedVersion) {
      throw new WeeklyIntentError("WEEKLY_INTENT_VERSION_CONFLICT");
    }
    if (current.status === "ENDED" || current.status === "EXPIRED") {
      await invalidatePendingOpportunities(tx, current.id, now);
      return { intent: ownerResponse(current) };
    }
    const row = await tx.weeklyIntent.update({
      where: { id: current.id },
      data: {
        status: "ENDED",
        endedAt: now,
        pausedAt: null,
        version: { increment: 1 },
      },
      select: ownerSelect,
    });
    await invalidatePendingOpportunities(tx, current.id, now);
    return { intent: ownerResponse(row) };
  });
}
