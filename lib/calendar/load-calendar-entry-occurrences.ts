import type { Prisma, PrismaClient } from "@prisma/client";

import { calendarOccurrenceId } from "@/lib/calendar/calendar-occurrence-id";
import { expandCalendarRecurrenceInWindow } from "@/lib/calendar/calendar-recurrence";

type CalendarDb = Prisma.TransactionClient | PrismaClient;

const calendarEntryInclude = {
  companions: { orderBy: { createdAt: "asc" as const } },
  category: { select: { id: true, name: true, color: true, presetKey: true } },
  planRequest: { select: { connectionId: true } },
  planCommitment: { select: { connectionId: true, safetyRestrictedAt: true } },
} satisfies Prisma.CalendarEntryInclude;

type StoredCalendarEntry = Prisma.CalendarEntryGetPayload<{
  include: typeof calendarEntryInclude;
}>;

export type CalendarEntryOccurrence = StoredCalendarEntry & {
  /** Series master for generated/modified instances; null for a stored one-off. */
  seriesMasterId: string | null;
  /** Stable pre-modification occurrence start, used by scoped mutations/reminders. */
  originalStartAt: Date | null;
};

function intersects(startAt: Date, endAt: Date, windowStart: Date, windowEnd: Date) {
  return startAt < windowEnd && endAt > windowStart;
}

function privacySafeEntry(entry: StoredCalendarEntry): StoredCalendarEntry {
  if (!entry.planCommitment?.safetyRestrictedAt) return entry;
  return {
    ...entry,
    title: "Shared plan",
    location: null,
    note: null,
    companions: [],
  };
}

function occurrenceFromMaster(
  master: StoredCalendarEntry,
  startAt: Date,
  endAt: Date,
): CalendarEntryOccurrence {
  return {
    ...master,
    id: calendarOccurrenceId(master.id, startAt),
    isRecurrenceMaster: false,
    recurrenceMasterId: master.id,
    recurrenceOriginalStartAt: startAt,
    reminder15mSentAt: null,
    startAt,
    endAt,
    seriesMasterId: master.id,
    originalStartAt: startAt,
  };
}

function occurrenceFromOverride(
  master: StoredCalendarEntry,
  override: StoredCalendarEntry,
): CalendarEntryOccurrence {
  const originalStartAt = override.recurrenceOriginalStartAt ?? override.startAt;
  return {
    ...override,
    id: calendarOccurrenceId(master.id, originalStartAt),
    repeatRule: master.repeatRule,
    repeatUntil: master.repeatUntil,
    recurrenceGroupId: master.recurrenceGroupId,
    seriesMasterId: master.id,
    originalStartAt,
  };
}

/**
 * Returns concrete one-offs plus generated recurring occurrences intersecting
 * one finite calendar window. Series masters themselves never leak into UI or
 * availability results.
 */
export async function loadCalendarEntryOccurrences(
  db: CalendarDb,
  args: { userId: string; windowStart: Date; windowEnd: Date },
): Promise<CalendarEntryOccurrence[]> {
  const { userId, windowStart, windowEnd } = args;
  const [concreteRows, masters, legacySeriesRows] = await Promise.all([
    db.calendarEntry.findMany({
      where: {
        userId,
        projectionStatus: "ACTIVE",
        isRecurrenceMaster: false,
        recurrenceMasterId: null,
        startAt: { lt: windowEnd },
        endAt: { gt: windowStart },
      },
      include: calendarEntryInclude,
      orderBy: { startAt: "asc" },
    }),
    db.calendarEntry.findMany({
      where: {
        userId,
        projectionStatus: "ACTIVE",
        isRecurrenceMaster: true,
        startAt: { lt: windowEnd },
        OR: [{ repeatUntil: null }, { repeatUntil: { gte: windowStart } }],
      },
      include: calendarEntryInclude,
      orderBy: { startAt: "asc" },
    }),
    // Compatibility path: old releases stored up to 120 concrete rows. We
    // extend only after the last stored row, where no detached legacy instance
    // can be accidentally resurrected.
    db.calendarEntry.findMany({
      where: {
        userId,
        projectionStatus: "ACTIVE",
        isRecurrenceMaster: false,
        recurrenceMasterId: null,
        recurrenceGroupId: { not: null },
        repeatRule: { not: "NONE" },
        startAt: { lt: windowEnd },
        OR: [{ repeatUntil: null }, { repeatUntil: { gte: windowStart } }],
      },
      include: calendarEntryInclude,
      orderBy: [{ recurrenceGroupId: "asc" }, { startAt: "asc" }],
    }),
  ]);

  const output: CalendarEntryOccurrence[] = concreteRows.map((entry) => ({
    ...privacySafeEntry(entry),
    seriesMasterId: null,
    originalStartAt: null,
  }));

  if (masters.length > 0) {
    const masterIDs = masters.map((master) => master.id);
    const [overrides, cancellations] = await Promise.all([
      db.calendarEntry.findMany({
        where: {
          userId,
          projectionStatus: "ACTIVE",
          recurrenceMasterId: { in: masterIDs },
        },
        include: calendarEntryInclude,
        orderBy: { startAt: "asc" },
      }),
      db.calendarRecurrenceCancellation.findMany({
        where: { userId, recurrenceMasterId: { in: masterIDs } },
        select: { recurrenceMasterId: true, originalStartAt: true },
      }),
    ]);

    const overridesByMaster = new Map<string, Map<number, StoredCalendarEntry>>();
    for (const override of overrides) {
      if (!override.recurrenceMasterId || !override.recurrenceOriginalStartAt) continue;
      const byStart = overridesByMaster.get(override.recurrenceMasterId) ?? new Map();
      byStart.set(
        override.recurrenceOriginalStartAt.getTime(),
        privacySafeEntry(override),
      );
      overridesByMaster.set(override.recurrenceMasterId, byStart);
    }
    const cancellationsByMaster = new Map<string, Set<number>>();
    for (const cancellation of cancellations) {
      const starts = cancellationsByMaster.get(cancellation.recurrenceMasterId) ?? new Set();
      starts.add(cancellation.originalStartAt.getTime());
      cancellationsByMaster.set(cancellation.recurrenceMasterId, starts);
    }

    for (const storedMaster of masters) {
      const master = privacySafeEntry(storedMaster);
      const generatedStarts = new Set<number>();
      const overrideMap = overridesByMaster.get(master.id) ?? new Map();
      const cancellationSet = cancellationsByMaster.get(master.id) ?? new Set();
      const generated = expandCalendarRecurrenceInWindow(
        {
          startAt: master.startAt,
          endAt: master.endAt,
          repeat: master.repeatRule,
          repeatUntil: master.repeatUntil,
        },
        windowStart,
        windowEnd,
      );
      for (const occurrence of generated) {
        const occurrenceKey = occurrence.startAt.getTime();
        generatedStarts.add(occurrenceKey);
        if (cancellationSet.has(occurrenceKey)) continue;
        const override = overrideMap.get(occurrenceKey);
        if (override) {
          if (intersects(override.startAt, override.endAt, windowStart, windowEnd)) {
            output.push(occurrenceFromOverride(master, override));
          }
        } else {
          output.push(
            occurrenceFromMaster(master, occurrence.startAt, occurrence.endAt),
          );
        }
      }

      // An occurrence can be moved into this window from a date outside it.
      for (const [originalMilliseconds, override] of overrideMap) {
        if (generatedStarts.has(originalMilliseconds)) continue;
        if (intersects(override.startAt, override.endAt, windowStart, windowEnd)) {
          output.push(occurrenceFromOverride(master, override));
        }
      }
    }
  }

  const legacyGroups = new Map<string, StoredCalendarEntry[]>();
  for (const entry of legacySeriesRows) {
    if (!entry.recurrenceGroupId) continue;
    const group = legacyGroups.get(entry.recurrenceGroupId) ?? [];
    group.push(privacySafeEntry(entry));
    legacyGroups.set(entry.recurrenceGroupId, group);
  }
  for (const group of legacyGroups.values()) {
    const anchor = group[0];
    const last = group[group.length - 1];
    if (!anchor || !last) continue;
    const generated = expandCalendarRecurrenceInWindow(
      {
        startAt: anchor.startAt,
        endAt: anchor.endAt,
        repeat: anchor.repeatRule,
        repeatUntil: anchor.repeatUntil,
      },
      windowStart,
      windowEnd,
    );
    for (const occurrence of generated) {
      if (occurrence.startAt <= last.startAt) continue;
      output.push(occurrenceFromMaster(anchor, occurrence.startAt, occurrence.endAt));
    }
  }

  return output.sort(
    (left, right) => left.startAt.getTime() - right.startAt.getTime() || left.id.localeCompare(right.id),
  );
}
