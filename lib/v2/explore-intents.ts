import "server-only";

import { formatInTimeZone } from "date-fns-tz";
import { realExploreIntentWhere } from "@/lib/v2/explore-intent-access";
import { prisma } from "@/lib/db/prisma";
import { EXPLORE_EXAMPLE_AUTHORS, EXPLORE_EXAMPLE_CASES, EXPLORE_EXAMPLE_MARKER, EXPLORE_EXAMPLE_NOTE, exploreExampleIntentId } from "@/lib/v2/explore-example-catalog";
import { readTimePreference } from "@/lib/v2/intent-timing";

const MAX_FREE_EXPLORE_RESULTS = 5;

const exploreIntentSelect = {
      id: true, topic: true, togetherMode: true, studyGoal: true, activityText: true,
      sportTag: true, sportOtherNote: true, timeWindows: true, timePreference: true,
      timeZone: true, note: true, expiresAt: true, createdAt: true,
      course: { select: { code: true, name: true } },
      user: { select: { id: true, school: true, verifiedStudent: true, userLanguages: { select: { tag: true }, orderBy: { tag: "asc" } } } },
    } as const;

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
    where: realExploreIntentWhere(userId, { username: viewer.username, school: viewer.school }, now),
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 32,
    select: exploreIntentSelect,
  });
  // A separate, tightly scoped sample source. It never opens the general QA cohort
  // or hidden/private student profiles to ordinary readers. These owners are guests,
  // unverified and hidden from all people/matching surfaces, with no login sessions.
  const exampleAuthor = EXPLORE_EXAMPLE_AUTHORS.find(author => author.school === viewer.school);
  const exampleRows = exampleAuthor ? await prisma.weeklyIntent.findMany({
    where: {
      id: { in: EXPLORE_EXAMPLE_CASES.map(item => exploreExampleIntentId(exampleAuthor.id, item.key)) },
      userId: exampleAuthor.id, status: "ACTIVE", exploreVisible: true, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      automaticMatching: false, note: EXPLORE_EXAMPLE_NOTE,
      user: {
        id: exampleAuthor.id, username: exampleAuthor.username, school: viewer.school,
        studentVerificationNotes: EXPLORE_EXAMPLE_MARKER, isGuest: true, verifiedStudent: false,
        hideFromDiscovery: true, hideFromRecommendations: true,
        moderationBlocks: { none: { isActive: true } },
      },
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: exploreIntentSelect,
  }) : [];
  const exampleIds = new Set(exampleRows.map(row => row.id));
  const candidateUserIds = [...new Set([...rows, ...exampleRows].map(row => row.user.id))];
  const blocks = candidateUserIds.length === 0 ? [] : await prisma.block.findMany({
    where: { OR: [
      { blockerId: userId, blockedId: { in: candidateUserIds } },
      { blockedId: userId, blockerId: { in: candidateUserIds } },
    ] },
    select: { blockerId: true, blockedId: true },
  });
  const blocked = new Set(blocks.flatMap(row => [row.blockerId, row.blockedId]).filter(id => id !== userId));
  const visible = rows.filter(row => !blocked.has(row.user.id));
  // Genuine published intentions always precede examples; samples fill spare slots.
  const examples = exampleRows.filter(row => !blocked.has(row.user.id));
  const selected = [...visible, ...examples].slice(0, limit);
  const selectedIds = selected.map(row => row.id);
  const opportunities = await prisma.mutualOpportunity.findMany({
    where: { AND: [
      { OR: [{ userAId: userId }, { userBId: userId }] },
      { OR: [{ intentAId: { in: selectedIds } }, { intentBId: { in: selectedIds } }] },
      { OR: [{ status: { in: ["PENDING", "MUTUAL"] } },
        { createdAt: { gte: new Date(now.getTime() - 14 * 86400000) } }] },
    ] },
    select: { id: true, intentAId: true, intentBId: true, status: true, expiresAt: true,
      startsAt: true, connectionId: true,
      intentA: { select: { status: true } }, intentB: { select: { status: true } },
      decisions: { where: { userId }, select: { value: true } } },
    orderBy: { createdAt: "desc" },
  });
  function interestFor(intentId: string) {
    const opportunity = opportunities.find(row => row.intentAId === intentId || row.intentBId === intentId);
    if (!opportunity) return null;
    const state = opportunity.status === "MUTUAL" && opportunity.connectionId ? "READY_TO_COORDINATE"
      : opportunity.status !== "PENDING" || opportunity.expiresAt <= now ||
        (opportunity.startsAt && opportunity.startsAt <= now) ||
        opportunity.intentA.status !== "ACTIVE" || opportunity.intentB.status !== "ACTIVE" ? "UNAVAILABLE"
      : opportunity.decisions[0]?.value === "YES" ? "DECIDED" : "NEEDS_DECISION";
    return { opportunityId: opportunity.id, state,
      coordination: state === "READY_TO_COORDINATE" ? { connectionId: opportunity.connectionId! } : null };
  }
  return {
    intents: selected.map(row => ({
      id: row.id,
      isExample: exampleIds.has(row.id),
      interest: exampleIds.has(row.id) ? null : interestFor(row.id),
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
      expiresAt: row.expiresAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
    })),
    // Unseen demonstration cards are not a reason to advertise a Plus upgrade.
    hasMore: visible.length > limit,
  };
}
