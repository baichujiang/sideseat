import "server-only";

import type { CalendarRepeatRule, Prisma, PrismaClient } from "@prisma/client";

import { calendarOccurrenceId } from "@/lib/calendar/calendar-occurrence-id";
import {
  calendarSearchMatchRank,
  compareCalendarSearchSortKeys,
} from "@/lib/calendar/calendar-search-ranking";
import {
  calendarOccurrenceAtOrAfter,
  calendarOccurrenceAtOrBefore,
  type CalendarOccurrence,
  type CalendarRecurrenceSeed,
} from "@/lib/calendar/calendar-recurrence";

type CalendarDb = Prisma.TransactionClient | PrismaClient;

const searchEntrySelect = {
  id: true,
  title: true,
  eventType: true,
  location: true,
  note: true,
  repeatRule: true,
  repeatUntil: true,
  recurrenceGroupId: true,
  isRecurrenceMaster: true,
  recurrenceMasterId: true,
  recurrenceOriginalStartAt: true,
  startAt: true,
  endAt: true,
  categoryId: true,
  discoverActivityId: true,
  category: {
    select: { name: true, color: true },
  },
  companions: {
    orderBy: { createdAt: "asc" as const },
    select: { userId: true, displayName: true },
  },
} satisfies Prisma.CalendarEntrySelect;

type SearchEntry = Prisma.CalendarEntryGetPayload<{
  select: typeof searchEntrySelect;
}>;

export type NativeCalendarSearchResult = {
  id: string;
  title: string;
  location: string | null;
  withLabel: string | null;
  note: string | null;
  repeatRule: CalendarRepeatRule;
  repeatUntilISO: string | null;
  eventParticipants: Array<{ userId: string | null; name: string }>;
  eventType: SearchEntry["eventType"];
  startISO: string;
  endISO: string;
  categoryId: string | null;
  categoryColor: string | null;
  categoryName: string | null;
  discoverActivityId: string | null;
};

type RankedPresentation = {
  result: NativeCalendarSearchResult;
  rank: number;
  distance: number;
  pastPriority: number;
};

type SeriesPresentation = {
  entry: SearchEntry;
  id: string;
  startAt: Date;
  endAt: Date;
};

const SEARCH_RESULT_LIMIT = 30;

function recurrenceSeed(entry: SearchEntry): CalendarRecurrenceSeed {
  return {
    startAt: entry.startAt,
    endAt: entry.endAt,
    repeat: entry.repeatRule,
    repeatUntil: entry.repeatUntil,
  };
}

function temporalDistance(startAt: Date, endAt: Date, now: Date) {
  if (startAt <= now && endAt >= now) return 0;
  if (startAt > now) return startAt.getTime() - now.getTime();
  return now.getTime() - endAt.getTime();
}

function compareTemporal(
  left: Pick<SeriesPresentation, "startAt" | "endAt">,
  right: Pick<SeriesPresentation, "startAt" | "endAt">,
  now: Date,
) {
  const distance =
    temporalDistance(left.startAt, left.endAt, now) -
    temporalDistance(right.startAt, right.endAt, now);
  if (distance !== 0) return distance;
  const leftPast = left.endAt < now ? 1 : 0;
  const rightPast = right.endAt < now ? 1 : 0;
  if (leftPast !== rightPast) return leftPast - rightPast;
  return left.startAt.getTime() - right.startAt.getTime();
}

function nextUsableGeneratedOccurrence(
  seed: CalendarRecurrenceSeed,
  boundary: Date,
  direction: "before" | "after",
  excludedOriginalStarts: Set<number>,
): CalendarOccurrence | null {
  let nextBoundary = boundary;
  for (let inspected = 0; inspected < 1_000; inspected += 1) {
    const occurrence = direction === "after"
      ? calendarOccurrenceAtOrAfter(seed, nextBoundary)
      : calendarOccurrenceAtOrBefore(seed, nextBoundary);
    if (!occurrence) return null;
    if (!excludedOriginalStarts.has(occurrence.startAt.getTime())) return occurrence;
    nextBoundary = new Date(
      occurrence.startAt.getTime() + (direction === "after" ? 1 : -1),
    );
  }
  return null;
}

function nearestSeriesPresentation(args: {
  master: SearchEntry;
  overrides: SearchEntry[];
  cancelledOriginalStarts: Set<number>;
  now: Date;
}): SeriesPresentation | null {
  const { master, overrides, cancelledOriginalStarts, now } = args;
  const overridesByOriginalStart = new Map<number, SearchEntry>();
  for (const override of overrides) {
    if (!override.recurrenceOriginalStartAt) continue;
    const originalMilliseconds = override.recurrenceOriginalStartAt.getTime();
    if (!cancelledOriginalStarts.has(originalMilliseconds)) {
      overridesByOriginalStart.set(originalMilliseconds, override);
    }
  }

  const excluded = new Set(cancelledOriginalStarts);
  for (const originalMilliseconds of overridesByOriginalStart.keys()) {
    excluded.add(originalMilliseconds);
  }

  const candidates: SeriesPresentation[] = [];
  const seed = recurrenceSeed(master);
  for (const occurrence of [
    nextUsableGeneratedOccurrence(seed, now, "before", excluded),
    nextUsableGeneratedOccurrence(seed, now, "after", excluded),
  ]) {
    if (!occurrence) continue;
    candidates.push({
      entry: master,
      id: calendarOccurrenceId(master.id, occurrence.startAt),
      startAt: occurrence.startAt,
      endAt: occurrence.endAt,
    });
  }

  for (const [originalMilliseconds, override] of overridesByOriginalStart) {
    candidates.push({
      entry: override,
      id: calendarOccurrenceId(master.id, new Date(originalMilliseconds)),
      startAt: override.startAt,
      endAt: override.endAt,
    });
  }

  return candidates.sort((left, right) => compareTemporal(left, right, now))[0] ?? null;
}

function formatWithLabel(names: string[]): string | null {
  if (names.length === 0) return null;
  if (names.length === 1) return `With ${names[0]}`;
  return `With ${names[0]} +${names.length - 1}`;
}

function toNativeResult(
  presentation: SeriesPresentation,
  repeatSource: SearchEntry = presentation.entry,
): NativeCalendarSearchResult {
  const entry = presentation.entry;
  const participantNames = entry.companions.map((companion) => companion.displayName);
  return {
    id: presentation.id,
    title: entry.title,
    location: entry.location,
    withLabel: formatWithLabel(participantNames),
    note: entry.note,
    repeatRule: repeatSource.repeatRule,
    repeatUntilISO: repeatSource.repeatUntil?.toISOString() ?? null,
    eventParticipants: entry.companions.map((companion) => ({
      userId: companion.userId,
      name: companion.displayName,
    })),
    eventType: entry.eventType,
    startISO: presentation.startAt.toISOString(),
    endISO: presentation.endAt.toISOString(),
    categoryId: entry.categoryId,
    categoryColor: entry.category?.color ?? null,
    categoryName: entry.category?.name ?? null,
    discoverActivityId: entry.discoverActivityId,
  };
}

function ranked(
  presentation: SeriesPresentation,
  repeatSource: SearchEntry,
  rank: number,
  now: Date,
): RankedPresentation {
  return {
    result: toNativeResult(presentation, repeatSource),
    rank,
    distance: temporalDistance(presentation.startAt, presentation.endAt, now),
    pastPriority: presentation.endAt < now ? 1 : 0,
  };
}

function bestMatchingEntry(entries: SearchEntry[], query: string, now: Date) {
  return entries
    .flatMap((entry) => {
      const rank = calendarSearchMatchRank(entry, query);
      return rank == null ? [] : [{ entry, rank }];
    })
    .sort((left, right) => {
      if (left.rank !== right.rank) return left.rank - right.rank;
      return compareTemporal(left.entry, right.entry, now);
    })[0] ?? null;
}

function nearestLegacyPresentation(
  rows: SearchEntry[],
  anchor: SearchEntry,
  now: Date,
): SeriesPresentation {
  const sortedRows = [...rows].sort(
    (left, right) => left.startAt.getTime() - right.startAt.getTime(),
  );
  const candidates: SeriesPresentation[] = sortedRows.map((entry) => ({
    entry,
    id: entry.id,
    startAt: entry.startAt,
    endAt: entry.endAt,
  }));
  const last = sortedRows.at(-1) ?? anchor;

  // Legacy releases stored a bounded set of rows. Extend only after the last
  // stored row, matching the normal schedule read path without duplicating it.
  if (now > last.startAt) {
    const seed = recurrenceSeed(anchor);
    for (const occurrence of [
      calendarOccurrenceAtOrBefore(seed, now),
      calendarOccurrenceAtOrAfter(seed, now),
    ]) {
      if (!occurrence || occurrence.startAt <= last.startAt) continue;
      candidates.push({
        entry: anchor,
        id: calendarOccurrenceId(anchor.id, occurrence.startAt),
        startAt: occurrence.startAt,
        endAt: occurrence.endAt,
      });
    }
  }

  return candidates.sort((left, right) => compareTemporal(left, right, now))[0]!;
}

export async function searchCalendarEntriesForUser(
  db: CalendarDb,
  options: { userId: string; query: string; now?: Date; limit?: number },
): Promise<NativeCalendarSearchResult[]> {
  const query = options.query.trim();
  if (!query) return [];
  const now = options.now ?? new Date();
  const limit = Math.min(Math.max(options.limit ?? SEARCH_RESULT_LIMIT, 1), SEARCH_RESULT_LIMIT);

  const matchingRows = await db.calendarEntry.findMany({
    where: {
      userId: options.userId,
      projectionStatus: "ACTIVE",
      courseScheduleMirrorKey: null,
      source: { not: "course_mirror" },
      AND: [
        {
          OR: [
            { title: { contains: query, mode: "insensitive" } },
            { location: { contains: query, mode: "insensitive" } },
            { note: { contains: query, mode: "insensitive" } },
          ],
        },
        {
          OR: [
            { planCommitmentId: null },
            { planCommitment: { is: { safetyRestrictedAt: null } } },
          ],
        },
      ],
    },
    select: searchEntrySelect,
  });
  if (matchingRows.length === 0) return [];

  const matchingByID = new Map(matchingRows.map((entry) => [entry.id, entry]));
  const masterIDs = [...new Set(matchingRows.flatMap((entry) => {
    if (entry.isRecurrenceMaster) return [entry.id];
    return entry.recurrenceMasterId ? [entry.recurrenceMasterId] : [];
  }))];
  const legacyGroupIDs = [...new Set(matchingRows.flatMap((entry) =>
    !entry.isRecurrenceMaster && !entry.recurrenceMasterId && entry.recurrenceGroupId
      ? [entry.recurrenceGroupId]
      : [],
  ))];

  const [masters, overrides, cancellations, legacyRows] = await Promise.all([
    masterIDs.length
      ? db.calendarEntry.findMany({
          where: {
            userId: options.userId,
            projectionStatus: "ACTIVE",
            id: { in: masterIDs },
            isRecurrenceMaster: true,
          },
          select: searchEntrySelect,
        })
      : Promise.resolve([] as SearchEntry[]),
    masterIDs.length
      ? db.calendarEntry.findMany({
          where: {
            userId: options.userId,
            projectionStatus: "ACTIVE",
            recurrenceMasterId: { in: masterIDs },
          },
          select: searchEntrySelect,
        })
      : Promise.resolve([] as SearchEntry[]),
    masterIDs.length
      ? db.calendarRecurrenceCancellation.findMany({
          where: { userId: options.userId, recurrenceMasterId: { in: masterIDs } },
          select: { recurrenceMasterId: true, originalStartAt: true },
        })
      : Promise.resolve([]),
    legacyGroupIDs.length
      ? db.calendarEntry.findMany({
          where: {
            userId: options.userId,
            projectionStatus: "ACTIVE",
            recurrenceGroupId: { in: legacyGroupIDs },
            recurrenceMasterId: null,
          },
          select: searchEntrySelect,
        })
      : Promise.resolve([] as SearchEntry[]),
  ]);

  const overridesByMaster = new Map<string, SearchEntry[]>();
  for (const entry of overrides) {
    if (!entry.recurrenceMasterId) continue;
    const rows = overridesByMaster.get(entry.recurrenceMasterId) ?? [];
    rows.push(entry);
    overridesByMaster.set(entry.recurrenceMasterId, rows);
  }
  const cancellationsByMaster = new Map<string, Set<number>>();
  for (const cancellation of cancellations) {
    const starts = cancellationsByMaster.get(cancellation.recurrenceMasterId) ?? new Set();
    starts.add(cancellation.originalStartAt.getTime());
    cancellationsByMaster.set(cancellation.recurrenceMasterId, starts);
  }
  const legacyRowsByGroup = new Map<string, SearchEntry[]>();
  for (const entry of legacyRows) {
    if (!entry.recurrenceGroupId) continue;
    const rows = legacyRowsByGroup.get(entry.recurrenceGroupId) ?? [];
    rows.push(entry);
    legacyRowsByGroup.set(entry.recurrenceGroupId, rows);
  }

  const handledIDs = new Set<string>();
  const presentations: RankedPresentation[] = [];

  for (const master of masters) {
    const seriesOverrides = overridesByMaster.get(master.id) ?? [];
    handledIDs.add(master.id);
    for (const override of seriesOverrides) handledIDs.add(override.id);

    const masterRank = matchingByID.has(master.id)
      ? calendarSearchMatchRank(master, query)
      : null;
    const bestOverride = bestMatchingEntry(
      seriesOverrides.filter((entry) => matchingByID.has(entry.id)),
      query,
      now,
    );

    if (bestOverride && (masterRank == null || bestOverride.rank < masterRank)) {
      const originalStart = bestOverride.entry.recurrenceOriginalStartAt;
      if (!originalStart) continue;
      presentations.push(ranked({
        entry: bestOverride.entry,
        id: calendarOccurrenceId(master.id, originalStart),
        startAt: bestOverride.entry.startAt,
        endAt: bestOverride.entry.endAt,
      }, master, bestOverride.rank, now));
      continue;
    }

    if (masterRank == null) continue;
    const nearest = nearestSeriesPresentation({
      master,
      overrides: seriesOverrides,
      cancelledOriginalStarts: cancellationsByMaster.get(master.id) ?? new Set(),
      now,
    });
    if (nearest) presentations.push(ranked(nearest, master, masterRank, now));
  }

  for (const rows of legacyRowsByGroup.values()) {
    for (const row of rows) handledIDs.add(row.id);
    const anchor = [...rows].sort(
      (left, right) => left.startAt.getTime() - right.startAt.getTime(),
    )[0];
    if (!anchor) continue;
    const best = bestMatchingEntry(
      rows.filter((entry) => matchingByID.has(entry.id)),
      query,
      now,
    );
    if (!best) continue;
    const anchorRank = matchingByID.has(anchor.id)
      ? calendarSearchMatchRank(anchor, query)
      : null;
    if (anchorRank == null || best.rank < anchorRank) {
      presentations.push(ranked({
        entry: best.entry,
        id: best.entry.id,
        startAt: best.entry.startAt,
        endAt: best.entry.endAt,
      }, anchor, best.rank, now));
    } else {
      presentations.push(ranked(
        nearestLegacyPresentation(rows, anchor, now),
        anchor,
        anchorRank,
        now,
      ));
    }
  }

  for (const entry of matchingRows) {
    if (handledIDs.has(entry.id)) continue;
    const rank = calendarSearchMatchRank(entry, query);
    if (rank == null) continue;
    if (entry.repeatRule !== "NONE") {
      const nearest = nearestSeriesPresentation({
        master: entry,
        overrides: [],
        cancelledOriginalStarts: new Set(),
        now,
      });
      if (nearest) presentations.push(ranked(nearest, entry, rank, now));
      continue;
    }
    presentations.push(ranked({
      entry,
      id: entry.id,
      startAt: entry.startAt,
      endAt: entry.endAt,
    }, entry, rank, now));
  }

  return presentations
    .sort((left, right) => compareCalendarSearchSortKeys(
      { ...left, startISO: left.result.startISO, id: left.result.id },
      { ...right, startISO: right.result.startISO, id: right.result.id },
    ))
    .slice(0, limit)
    .map((entry) => entry.result);
}
