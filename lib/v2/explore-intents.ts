import "server-only";

import { formatInTimeZone } from "date-fns-tz";
import { INTERNAL_ACCOUNT_PREFIXES, INTERNAL_ACCOUNT_USERNAMES, isInternalAccount } from "@/lib/analytics/layer2-outcome-pilot";
import { prisma } from "@/lib/db/prisma";
import { readTimePreference } from "@/lib/v2/intent-timing";

const MAX_FREE_EXPLORE_RESULTS = 5;

type RawWindow = { startAt?: unknown; endAt?: unknown };

function broadPeriod(date: Date, timeZone: string): "MORNING" | "AFTERNOON" | "EVENING" | "ANY" {
  const hour = Number(formatInTimeZone(date, timeZone, "H"));
  if (!Number.isFinite(hour)) return "ANY";
  if (hour >= 6 && hour < 12) return "MORNING";
  if (hour >= 12 && hour < 18) return "AFTERNOON";
  if (hour >= 18 || hour < 1) return "EVENING";
  return "ANY";
}

function safeTimeContext(row: { timeWindows: unknown; timePreference: unknown; timeZone: string }) {
  const preference = readTimePreference(row.timePreference);
  if (preference.kind === "FLEXIBLE") {
    return { kind: "FLEXIBLE" as const, startDate: preference.startDate, endDate: preference.endDate, period: preference.period };
  }
  if (preference.kind === "UNDECIDED") {
    return { kind: "UNDECIDED" as const, startDate: null, endDate: null, period: "ANY" as const };
  }
  const windows = Array.isArray(row.timeWindows)
    ? (row.timeWindows as RawWindow[]).flatMap(window => {
        if (typeof window.startAt !== "string" || typeof window.endAt !== "string") return [];
        const start = new Date(window.startAt); const end = new Date(window.endAt);
        return Number.isFinite(start.getTime()) && Number.isFinite(end.getTime()) ? [{ start, end }] : [];
      })
    : [];
  if (windows.length === 0) return { kind: "UNDECIDED" as const, startDate: null, endDate: null, period: "ANY" as const };
  windows.sort((a, b) => a.start.getTime() - b.start.getTime());
  const periods = new Set(windows.map(window => broadPeriod(window.start, row.timeZone)));
  return {
    kind: "EXACT" as const,
    startDate: formatInTimeZone(windows[0]!.start, row.timeZone, "yyyy-MM-dd"),
    endDate: formatInTimeZone(windows[windows.length - 1]!.end, row.timeZone, "yyyy-MM-dd"),
    period: periods.size === 1 ? [...periods][0]! : "ANY" as const,
  };
}

export async function listExploreIntents(userId: string, requestedLimit = 3) {
  const limit = Math.max(1, Math.min(MAX_FREE_EXPLORE_RESULTS, requestedLimit));
  const viewer = await prisma.user.findUnique({
    where: { id: userId },
    select: { username: true, school: true, verifiedStudent: true, hideFromDiscovery: true },
  });
  if (!viewer?.verifiedStudent || viewer.hideFromDiscovery || !viewer.school) return { intents: [], hasMore: false };
  const now = new Date();
  const rows = await prisma.weeklyIntent.findMany({
    where: {
      userId: { not: userId }, status: "ACTIVE", exploreVisible: true, expiresAt: { gt: now },
      user: {
        school: viewer.school, onboardingComplete: true, isGuest: false, verifiedStudent: true,
        hideFromDiscovery: false, hideFromRecommendations: false,
        moderationBlocks: { none: { isActive: true } },
        // Synthetic QA supply is visible only to the existing internal-account cohort.
        ...(!isInternalAccount(viewer.username) ? { NOT: { OR: [
          { username: { in: [...INTERNAL_ACCOUNT_USERNAMES], mode: "insensitive" as const } },
          ...INTERNAL_ACCOUNT_PREFIXES.map(prefix => ({ username: { startsWith: prefix, mode: "insensitive" as const } })),
        ] } } : {}),
      },
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 32,
    select: {
      id: true, topic: true, togetherMode: true, studyGoal: true, activityText: true,
      sportTag: true, sportOtherNote: true, timeWindows: true, timePreference: true,
      timeZone: true, note: true, expiresAt: true, createdAt: true,
      course: { select: { code: true, name: true } },
      user: { select: { id: true, school: true, verifiedStudent: true, userLanguages: { select: { tag: true }, orderBy: { tag: "asc" } } } },
    },
  });
  const candidateUserIds = [...new Set(rows.map(row => row.user.id))];
  const blocks = candidateUserIds.length === 0 ? [] : await prisma.block.findMany({
    where: { OR: [
      { blockerId: userId, blockedId: { in: candidateUserIds } },
      { blockedId: userId, blockerId: { in: candidateUserIds } },
    ] },
    select: { blockerId: true, blockedId: true },
  });
  const blocked = new Set(blocks.flatMap(row => [row.blockerId, row.blockedId]).filter(id => id !== userId));
  const visible = rows.filter(row => !blocked.has(row.user.id));
  const selected = visible.slice(0, limit);
  return {
    intents: selected.map(row => ({
      id: row.id,
      topic: row.topic,
      togetherMode: row.togetherMode,
      studyGoal: row.studyGoal,
      activityText: row.activityText,
      sportTag: row.sportTag,
      sportOtherNote: row.sportOtherNote,
      course: row.course,
      time: safeTimeContext(row),
      descriptionPreview: row.note?.trim().slice(0, 96) || null,
      campus: row.user.school,
      verifiedStudent: row.user.verifiedStudent,
      languages: row.user.userLanguages.slice(0, 1).map(language => language.tag),
      expiresAt: row.expiresAt.toISOString(),
      createdAt: row.createdAt.toISOString(),
    })),
    hasMore: visible.length > selected.length,
  };
}
