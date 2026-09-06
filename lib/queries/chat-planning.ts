import type { Prisma } from "@prisma/client";
import { PlanType } from "@prisma/client";
import {
  addDays,
  endOfDay,
  format,
  isSameDay,
  startOfDay,
  startOfWeek,
} from "date-fns";

import { activeCourseMembershipWhere } from "@/lib/courses/active-membership";
import { loadCalendarEntryOccurrences } from "@/lib/calendar/load-calendar-entry-occurrences";

type DbClient = Prisma.TransactionClient;

const DAY_START_MINUTE = 8 * 60;
const DAY_END_MINUTE = 22 * 60;
const MIN_SLOT_MINUTES = 30;

type BusyInterval = {
  start: Date;
  end: Date;
};

export type AvailabilitySlot = {
  startTime: Date;
  endTime: Date;
  status: "available";
  canSuggest: true;
};

export type AvailabilityDay = {
  date: string;
  slots: AvailabilitySlot[];
};

export function isAvailabilityShareActive(share: {
  expiresAt: Date | null;
  isRevoked: boolean;
}) {
  return !share.isRevoked && (!share.expiresAt || share.expiresAt.getTime() > Date.now());
}

/** When `includedDates` is set, only those yyyy-MM-dd keys are materialized (sparse days). */
export async function getAvailabilityDaysForUser(
  db: DbClient,
  userId: string,
  rangeStart: Date,
  rangeEnd: Date,
  includedDates?: string[] | null,
): Promise<AvailabilityDay[]> {
  const busy = await getBusyIntervalsForUser(db, userId, rangeStart, rangeEnd);
  return materializeAvailabilityDays(rangeStart, rangeEnd, busy, includedDates);
}

export function normalizeAvailabilityIncludedDates(value: unknown): string[] | null {
  if (!value || !Array.isArray(value)) return null;
  const keys = value.filter((x): x is string => typeof x === "string" && /^\d{4}-\d{2}-\d{2}$/.test(x));
  return keys.length ? [...new Set(keys)].sort() : null;
}

export async function isUserAvailableForRange(
  db: DbClient,
  userId: string,
  startTime: Date,
  endTime: Date,
) {
  const busy = await getBusyIntervalsForUser(db, userId, startTime, endTime);
  return !busy.some((interval) => overlaps(interval.start, interval.end, startTime, endTime));
}

export function rangeFitsAvailability(
  days: AvailabilityDay[],
  startTime: Date,
  endTime: Date,
) {
  const day = days.find((entry) => entry.date === format(startTime, "yyyy-MM-dd"));
  if (!day) return false;
  return day.slots.some(
    (slot) =>
      slot.startTime.getTime() <= startTime.getTime() &&
      slot.endTime.getTime() >= endTime.getTime(),
  );
}

export async function materializePlanCalendarEntries(
  db: DbClient,
  args: {
    planRequestId: string;
    planCommitmentId?: string | null;
    proposerUserId: string;
    proposerName: string | null;
    receiverUserId: string;
    receiverName: string | null;
    title: string;
    planType: PlanType;
    location: string | null;
    note: string | null;
    startTime: Date;
    endTime: Date;
  },
) {
  const projectionData = [args.proposerUserId, args.receiverUserId].map(
    (userId) => ({
      userId,
      planRequestId: args.planRequestId,
      planCommitmentId: args.planCommitmentId ?? null,
      projectionStatus: "ACTIVE" as const,
      title: args.title,
      eventType: args.planType,
      source: "plan_request",
      location: args.location,
      note: args.note,
      startAt: args.startTime,
      endAt: args.endTime,
    }),
  );

  if (args.planCommitmentId) {
    for (const data of projectionData) {
      await db.calendarEntry.upsert({
        where: {
          userId_planCommitmentId: {
            userId: data.userId,
            planCommitmentId: args.planCommitmentId,
          },
        },
        create: data,
        update: {
          planRequestId: data.planRequestId,
          projectionStatus: data.projectionStatus,
          title: data.title,
          eventType: data.eventType,
          source: data.source,
          location: data.location,
          startAt: data.startAt,
          endAt: data.endAt,
        },
      });
    }
  } else {
    await db.calendarEntry.createMany({
      data: projectionData,
      skipDuplicates: true,
    });
  }

  const entries = await db.calendarEntry.findMany({
    where: args.planCommitmentId
      ? {
          planCommitmentId: args.planCommitmentId,
          userId: { in: [args.proposerUserId, args.receiverUserId] },
        }
      : {
          planRequestId: args.planRequestId,
          userId: { in: [args.proposerUserId, args.receiverUserId] },
        },
    select: { id: true, userId: true },
  });

  for (const entry of entries) {
    const other =
      entry.userId === args.proposerUserId
        ? {
            userId: args.receiverUserId,
            displayName: args.receiverName?.trim() || "Classmate",
          }
        : {
            userId: args.proposerUserId,
            displayName: args.proposerName?.trim() || "Classmate",
          };

    await db.calendarEntryCompanion.upsert({
      where: {
        id: `${entry.id}:${other.userId}`,
      },
      create: {
        id: `${entry.id}:${other.userId}`,
        calendarEntryId: entry.id,
        userId: other.userId,
        displayName: other.displayName,
      },
      update: {
        displayName: other.displayName,
      },
    });
  }
}

async function getBusyIntervalsForUser(
  db: DbClient,
  userId: string,
  rangeStart: Date,
  rangeEnd: Date,
): Promise<BusyInterval[]> {
  const [calendarEntries, memberships] = await Promise.all([
    loadCalendarEntryOccurrences(db, {
      userId,
      windowStart: rangeStart,
      windowEnd: rangeEnd,
    }),
    db.userCourse.findMany({
      where: {
        userId,
        ...activeCourseMembershipWhere(rangeStart),
      },
      include: {
        sessions: {
          orderBy: [{ weekday: "asc" }, { startMinute: "asc" }],
        },
      },
    }),
  ]);

  const intervals: BusyInterval[] = calendarEntries.map((entry) => ({
    start: entry.startAt,
    end: entry.endAt,
  }));

  for (
    let cursor = startOfDay(rangeStart);
    cursor.getTime() <= rangeEnd.getTime();
    cursor = addDays(cursor, 1)
  ) {
    const weekday = weekdayForDate(cursor);
    for (const membership of memberships) {
      for (const session of membership.sessions) {
        if (session.weekday !== weekday) continue;
        const start = new Date(cursor);
        start.setHours(0, session.startMinute, 0, 0);
        const end = new Date(cursor);
        end.setHours(0, session.endMinute, 0, 0);
        if (end <= rangeStart || start >= rangeEnd) continue;
        intervals.push({ start, end });
      }
    }
  }

  return mergeIntervals(intervals);
}

function materializeAvailabilityDays(
  rangeStart: Date,
  rangeEnd: Date,
  busy: BusyInterval[],
  includedDates?: string[] | null,
): AvailabilityDay[] {
  const days: AvailabilityDay[] = [];
  const allow =
    includedDates && includedDates.length > 0 ? new Set(includedDates) : null;

  for (
    let cursor = startOfDay(rangeStart);
    cursor.getTime() <= rangeEnd.getTime();
    cursor = addDays(cursor, 1)
  ) {
    const dateKey = format(cursor, "yyyy-MM-dd");
    if (allow && !allow.has(dateKey)) continue;

    const dayStart = new Date(cursor);
    dayStart.setHours(0, DAY_START_MINUTE, 0, 0);
    const dayEnd = new Date(cursor);
    dayEnd.setHours(0, DAY_END_MINUTE, 0, 0);

    const visibleStart = dayStart < rangeStart && isSameDay(dayStart, rangeStart) ? rangeStart : dayStart;
    const visibleEnd = dayEnd > rangeEnd && isSameDay(dayEnd, rangeEnd) ? rangeEnd : dayEnd;
    if (visibleEnd <= visibleStart) continue;

    const dayBusy = busy
      .filter((interval) => overlaps(interval.start, interval.end, visibleStart, visibleEnd))
      .map((interval) => ({
        start: interval.start < visibleStart ? visibleStart : interval.start,
        end: interval.end > visibleEnd ? visibleEnd : interval.end,
      }));

    const slots = invertIntervals(visibleStart, visibleEnd, dayBusy).filter(
      (slot) =>
        slot.endTime.getTime() - slot.startTime.getTime() >= MIN_SLOT_MINUTES * 60 * 1000,
    );

    days.push({
      date: dateKey,
      slots,
    });
  }

  return days;
}

function invertIntervals(
  start: Date,
  end: Date,
  busy: Array<{ start: Date; end: Date }>,
): AvailabilitySlot[] {
  if (busy.length === 0) {
    return [
      {
        startTime: start,
        endTime: end,
        status: "available",
        canSuggest: true,
      },
    ];
  }

  const merged = mergeIntervals(busy);
  const slots: AvailabilitySlot[] = [];
  let cursor = start;

  for (const interval of merged) {
    if (interval.start > cursor) {
      slots.push({
        startTime: cursor,
        endTime: interval.start,
        status: "available",
        canSuggest: true,
      });
    }
    if (interval.end > cursor) {
      cursor = interval.end;
    }
  }

  if (cursor < end) {
    slots.push({
      startTime: cursor,
      endTime: end,
      status: "available",
      canSuggest: true,
    });
  }

  return slots;
}

function mergeIntervals(intervals: Array<{ start: Date; end: Date }>): BusyInterval[] {
  if (intervals.length === 0) return [];
  const sorted = [...intervals].sort((a, b) => a.start.getTime() - b.start.getTime());
  const merged: BusyInterval[] = [{ start: sorted[0]!.start, end: sorted[0]!.end }];

  for (const interval of sorted.slice(1)) {
    const last = merged[merged.length - 1]!;
    if (interval.start.getTime() <= last.end.getTime()) {
      if (interval.end.getTime() > last.end.getTime()) {
        last.end = interval.end;
      }
      continue;
    }
    merged.push({ start: interval.start, end: interval.end });
  }

  return merged;
}

function overlaps(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date) {
  return aStart.getTime() < bEnd.getTime() && aEnd.getTime() > bStart.getTime();
}

function weekdayForDate(date: Date) {
  return ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"][date.getDay()] as
    | "SUN"
    | "MON"
    | "TUE"
    | "WED"
    | "THU"
    | "FRI"
    | "SAT";
}

export function defaultShareRange(preset: "TODAY" | "NEXT_3_DAYS" | "NEXT_7_DAYS") {
  const now = new Date();
  if (preset === "TODAY") {
    return {
      rangeStart: now,
      rangeEnd: endOfDay(now),
    };
  }
  return {
    rangeStart: now,
    rangeEnd: endOfDay(addDays(now, preset === "NEXT_3_DAYS" ? 2 : 6)),
  };
}

/** Next Mon–Sun calendar week after the current week (weeks start Monday). */
export function nextCalendarWeekRange(now: Date = new Date()) {
  const thisMonday = startOfWeek(now, { weekStartsOn: 1 });
  const nextMonday = addDays(thisMonday, 7);
  const nextSunday = addDays(nextMonday, 6);
  return { rangeStart: startOfDay(nextMonday), rangeEnd: endOfDay(nextSunday) };
}
