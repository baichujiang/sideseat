import type { Prisma, PrismaClient } from "@prisma/client";
import { addDays, max as maxDate, min as minDate, startOfDay } from "date-fns";

import { normalizeCalendarCategoryHex } from "@/lib/calendar/calendar-category-colors";
import { isCalendarCourseMirrorRow } from "@/lib/calendar/calendar-course-mirror";
import { scheduleDateKeyInBerlin } from "@/lib/calendar/schedule-berlin";
import { shareDateKeysInInclusiveRange } from "@/lib/schedule-share/share-selected-days";
import { loadIcsSubscriptionStudyEntries } from "@/lib/calendar/load-ics-subscription-entries";
import {
  type NormalizedRevealConfig,
  isBlockRevealed,
  shareIncludedDateKeySet,
} from "@/lib/schedule-share/reveal-config";

export type InternalScheduleBlock = {
  start: Date;
  end: Date;
  title?: string | null;
  location?: string | null;
  internalCategoryId?: string | null;
  internalPresetKey?: string | null;
  internalCategoryColor?: string | null;
  internalCategoryName?: string | null;
  internalSource?: string;
};

export type PublicScheduleBlockKind = "busy_anonymous" | "busy_detail";

export type PublicScheduleBlock = {
  kind: PublicScheduleBlockKind;
  start: string;
  end: string;
  title?: string;
  location?: string;
  categoryId?: string | null;
  categoryName?: string;
  categoryColor?: string;
};

export type PublicScheduleShareSnapshot = {
  ownerDisplayLabel: string;
  rangeStart: string;
  rangeEnd: string;
  /** Berlin yyyy-MM-dd keys actually shared (may be non-contiguous). */
  includedDates: string[];
  expiresAt: string | null;
  allowGuestProposals: boolean;
  blocks: PublicScheduleBlock[];
  freeSlots: { start: string; end: string }[];
};

type Db = PrismaClient | Prisma.TransactionClient;

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

function mergeIntervals(intervals: Array<{ start: Date; end: Date }>): Array<{ start: Date; end: Date }> {
  if (intervals.length === 0) return [];
  const sorted = [...intervals].sort((a, b) => a.start.getTime() - b.start.getTime());
  const merged: Array<{ start: Date; end: Date }> = [{ start: sorted[0]!.start, end: sorted[0]!.end }];
  for (const interval of sorted.slice(1)) {
    const last = merged[merged.length - 1]!;
    if (interval.start.getTime() <= last.end.getTime()) {
      if (interval.end.getTime() > last.end.getTime()) {
        last.end = interval.end;
      }
    } else {
      merged.push({ start: interval.start, end: interval.end });
    }
  }
  return merged;
}

function clipBlock(
  start: Date,
  end: Date,
  rangeStart: Date,
  rangeEnd: Date,
): { start: Date; end: Date } | null {
  const s = maxDate([start, rangeStart]);
  const e = minDate([end, rangeEnd]);
  if (e.getTime() <= s.getTime()) return null;
  return { start: s, end: e };
}

function computeFreeRanges(
  rangeStart: Date,
  rangeEnd: Date,
  busyMerged: Array<{ start: Date; end: Date }>,
): Array<{ start: Date; end: Date }> {
  const free: Array<{ start: Date; end: Date }> = [];
  let cursor = rangeStart.getTime();

  for (const b of busyMerged) {
    const bs = b.start.getTime();
    const be = b.end.getTime();
    if (be <= cursor) continue;
    if (bs >= rangeEnd.getTime()) break;
    if (bs > cursor) {
      free.push({ start: new Date(cursor), end: new Date(Math.min(bs, rangeEnd.getTime())) });
    }
    cursor = Math.max(cursor, be);
    if (cursor >= rangeEnd.getTime()) break;
  }

  if (cursor < rangeEnd.getTime()) {
    free.push({ start: new Date(cursor), end: rangeEnd });
  }

  return free.filter((f) => f.end.getTime() > f.start.getTime());
}

export function scheduleShareOwnerDisplayLabel(user: {
  nickname: string | null;
  username: string;
}): string | null {
  const n = user.nickname?.trim();
  if (n) return n;
  const u = user.username?.trim();
  if (u) return u;
  return null;
}

export async function collectInternalScheduleBlocks(
  db: Db,
  ownerUserId: string,
  rangeStart: Date,
  rangeEnd: Date,
): Promise<InternalScheduleBlock[]> {
  const [calendarCategories, mirroredRows, memberships, calendarEntries] = await Promise.all([
    db.userCalendarCategory.findMany({
      where: { userId: ownerUserId },
      select: {
        id: true,
        presetKey: true,
        name: true,
        color: true,
        icsSubscriptionUrl: true,
      },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    }),
    db.calendarEntry.findMany({
      where: { userId: ownerUserId, courseScheduleMirrorKey: { not: null } },
      select: { courseScheduleMirrorKey: true },
    }),
    db.userCourse.findMany({
      where: { userId: ownerUserId },
      include: {
        course: true,
        sessions: { orderBy: [{ weekday: "asc" }, { startMinute: "asc" }] },
      },
    }),
    db.calendarEntry.findMany({
      where: {
        userId: ownerUserId,
        AND: [{ startAt: { lt: rangeEnd } }, { endAt: { gt: rangeStart } }],
      },
      include: {
        category: { select: { id: true, presetKey: true } },
      },
      orderBy: { startAt: "asc" },
    }),
  ]);

  const courseCategoryId = calendarCategories.find((c) => c.presetKey === "course")?.id ?? null;
  const presetByCategoryId = Object.fromEntries(
    calendarCategories.map((c) => [c.id, c.presetKey ?? null] as const),
  );
  const colorByCategoryId = Object.fromEntries(
    calendarCategories.map(
      (c) => [c.id, normalizeCalendarCategoryHex(c.color) ?? "#64748B"] as const,
    ),
  );
  const nameByCategoryId = Object.fromEntries(
    calendarCategories.map((c) => [c.id, c.name] as const),
  );

  function categoryMeta(categoryId: string | null | undefined) {
    if (!categoryId) return { color: null as string | null, name: null as string | null };
    return {
      color: colorByCategoryId[categoryId] ?? null,
      name: nameByCategoryId[categoryId] ?? null,
    };
  }

  const mirroredSlotKeySet = new Set(
    mirroredRows.map((r) => r.courseScheduleMirrorKey).filter((k): k is string => Boolean(k)),
  );

  const blocks: InternalScheduleBlock[] = [];

  for (const e of calendarEntries) {
    const clipped = clipBlock(e.startAt, e.endAt, rangeStart, rangeEnd);
    if (!clipped) continue;
    const mirror = isCalendarCourseMirrorRow(e);
    const internalPresetKey = mirror ? "course" : (e.category?.presetKey ?? null);
    const internalCategoryId = mirror ? courseCategoryId : e.categoryId;
    const meta = categoryMeta(internalCategoryId);
    blocks.push({
      start: clipped.start,
      end: clipped.end,
      title: e.title,
      location: e.location,
      internalCategoryId,
      internalPresetKey,
      internalCategoryColor: meta.color,
      internalCategoryName: meta.name,
      internalSource: "calendar_entry",
    });
  }

  for (
    let cursor = startOfDay(rangeStart);
    cursor.getTime() <= rangeEnd.getTime();
    cursor = addDays(cursor, 1)
  ) {
    const weekday = weekdayForDate(cursor);
    for (const m of memberships) {
      for (const s of m.sessions) {
        if (s.weekday !== weekday) continue;
        const key = `${m.course.id}_${s.weekday}_${s.startMinute}`;
        if (mirroredSlotKeySet.has(key)) continue;
        const start = new Date(cursor);
        start.setHours(0, s.startMinute, 0, 0);
        const end = new Date(cursor);
        end.setHours(0, s.endMinute, 0, 0);
        const clipped = clipBlock(start, end, rangeStart, rangeEnd);
        if (!clipped) continue;
        const titleParts = [m.course.code ? `[${m.course.code}]` : null, m.course.name].filter(Boolean);
        const courseMeta = categoryMeta(courseCategoryId);
        blocks.push({
          start: clipped.start,
          end: clipped.end,
          title: titleParts.join(" ") || m.course.name,
          location: s.location,
          internalCategoryId: courseCategoryId,
          internalPresetKey: "course",
          internalCategoryColor: courseMeta.color,
          internalCategoryName: courseMeta.name,
          internalSource: "course_session",
        });
      }
    }
  }

  const icsEntries = await loadIcsSubscriptionStudyEntries({
    categories: calendarCategories.map((c) => ({
      id: c.id,
      name: c.name,
      color: c.color,
      icsSubscriptionUrl: c.icsSubscriptionUrl,
    })),
    windowStart: rangeStart,
    windowEnd: rangeEnd,
  });

  for (const ev of icsEntries) {
    const start = new Date(ev.startISO);
    const end = new Date(ev.endISO);
    const clipped = clipBlock(start, end, rangeStart, rangeEnd);
    if (!clipped) continue;
    const catId = ev.categoryId;
    const icsMeta = categoryMeta(catId);
    blocks.push({
      start: clipped.start,
      end: clipped.end,
      title: ev.title,
      location: ev.location,
      internalCategoryId: catId,
      internalPresetKey: catId ? (presetByCategoryId[catId] ?? null) : null,
      internalCategoryColor: icsMeta.color,
      internalCategoryName: icsMeta.name,
      internalSource: "ics_subscription",
    });
  }

  return blocks;
}

export function internalBlocksToPublicSnapshot(args: {
  internal: InternalScheduleBlock[];
  rangeStart: Date;
  rangeEnd: Date;
  reveal: NormalizedRevealConfig;
  ownerDisplayLabel: string;
  linkExpiresAt: Date | null;
  allowGuestProposals: boolean;
  /** When false, all days in [rangeStart, rangeEnd] are included (owner edit preview). */
  scopeToIncludedDates?: boolean;
  /** Owner settings calendar: show real titles/colors for every block (not guest privacy). */
  forOwnerPreview?: boolean;
}): PublicScheduleShareSnapshot {
  const {
    internal,
    rangeStart,
    rangeEnd,
    reveal,
    ownerDisplayLabel,
    linkExpiresAt,
    allowGuestProposals,
    scopeToIncludedDates = true,
    forOwnerPreview = false,
  } = args;

  const includedKeys = scopeToIncludedDates ? shareIncludedDateKeySet(reveal) : null;
  const includedDates =
    includedKeys && includedKeys.size > 0
      ? [...includedKeys].sort()
      : [...shareDateKeysInInclusiveRange(rangeStart, rangeEnd)].sort();
  const scopedInternal = includedKeys
    ? internal.filter((b) => includedKeys.has(scheduleDateKeyInBerlin(b.start)))
    : internal;

  const revealedInternal = scopedInternal.filter((b) => isBlockRevealed(b, reveal));
  const busyMerged = mergeIntervals(revealedInternal.map((b) => ({ start: b.start, end: b.end })));
  let freeRanges = computeFreeRanges(rangeStart, rangeEnd, busyMerged);
  if (includedKeys && includedKeys.size > 0) {
    freeRanges = freeRanges.filter((f) => includedKeys.has(scheduleDateKeyInBerlin(f.start)));
  }
  const freeSlots = freeRanges.map((f) => ({ start: f.start.toISOString(), end: f.end.toISOString() }));

  const detailBlocks: PublicScheduleBlock[] = [];

  for (const b of revealedInternal) {
    detailBlocks.push({
      kind: "busy_detail",
      start: b.start.toISOString(),
      end: b.end.toISOString(),
      ...(b.title?.trim() ? { title: b.title.trim() } : {}),
      ...(b.location?.trim() ? { location: b.location.trim() } : {}),
      ...(b.internalCategoryId ? { categoryId: b.internalCategoryId } : {}),
      ...(b.internalCategoryName ? { categoryName: b.internalCategoryName } : {}),
      ...(b.internalCategoryColor ? { categoryColor: b.internalCategoryColor } : {}),
    });
  }

  const blocks = detailBlocks.sort((a, b) => a.start.localeCompare(b.start));

  return {
    ownerDisplayLabel,
    rangeStart: rangeStart.toISOString(),
    rangeEnd: rangeEnd.toISOString(),
    includedDates,
    expiresAt: linkExpiresAt ? linkExpiresAt.toISOString() : null,
    allowGuestProposals,
    blocks,
    freeSlots,
  };
}

export async function rangeFitsScheduleShareSnapshot(
  db: Db,
  args: {
    ownerUserId: string;
    rangeStart: Date;
    rangeEnd: Date;
    proposalStart: Date;
    proposalEnd: Date;
  },
): Promise<boolean> {
  const internal = await collectInternalScheduleBlocks(db, args.ownerUserId, args.rangeStart, args.rangeEnd);
  const busyMerged = mergeIntervals(internal.map((b) => ({ start: b.start, end: b.end })));
  const freeRanges = computeFreeRanges(args.rangeStart, args.rangeEnd, busyMerged);
  const ps = args.proposalStart.getTime();
  const pe = args.proposalEnd.getTime();
  return freeRanges.some((slot) => ps >= slot.start.getTime() && pe <= slot.end.getTime());
}
