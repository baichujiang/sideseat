import type { Prisma, PrismaClient } from "@prisma/client";
import { addDays, max as maxDate, min as minDate, startOfDay } from "date-fns";
import { fromZonedTime } from "date-fns-tz";

import { normalizeCalendarCategoryHex } from "@/lib/calendar/calendar-category-colors";
import { isCalendarCourseMirrorRow } from "@/lib/calendar/calendar-course-mirror";
import { loadCalendarEntryOccurrences } from "@/lib/calendar/load-calendar-entry-occurrences";
import { SCHEDULE_DISPLAY_TZ } from "@/lib/calendar/schedule-berlin";
import { activeCourseMembershipWhere } from "@/lib/courses/active-membership";
import { SCHEDULE_SHARE_MIN_PROPOSAL_MINUTES } from "@/lib/schedule-share/constants";
import { shareDateKeysInInclusiveRange } from "@/lib/schedule-share/share-selected-days";
import { loadIcsSubscriptionStudyEntries } from "@/lib/calendar/load-ics-subscription-entries";
import {
  UNCATEGORIZED_REVEAL_PRESET_KEY,
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
  categoryPresetKey?: string | null;
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

function berlinStartOfDateKey(dateKey: string): Date {
  return fromZonedTime(`${dateKey}T00:00:00`, SCHEDULE_DISPLAY_TZ);
}

function berlinTimeOnDateKey(dateKey: string, minuteOfDay: number): Date {
  if (minuteOfDay >= 24 * 60) {
    return berlinStartOfDateKey(nextDateKey(dateKey));
  }
  const hours = Math.floor(minuteOfDay / 60);
  const minutes = minuteOfDay % 60;
  return fromZonedTime(
    `${dateKey}T${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:00`,
    SCHEDULE_DISPLAY_TZ,
  );
}

function nextDateKey(dateKey: string): string {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(year!, month! - 1, day! + 1)).toISOString().slice(0, 10);
}

function scheduleShareAvailabilityWindows(args: {
  rangeStart: Date;
  rangeEnd: Date;
  includedDates?: readonly string[];
  availabilityStartMinutes?: number;
  availabilityEndMinutes?: number;
}): Array<{ start: Date; end: Date }> {
  const keys = args.includedDates?.length
    ? [...new Set(args.includedDates)].sort()
    : [...shareDateKeysInInclusiveRange(args.rangeStart, args.rangeEnd)].sort();

  return keys.flatMap((dateKey) => {
    const availabilityStartMinutes = args.availabilityStartMinutes ?? 0;
    const availabilityEndMinutes = args.availabilityEndMinutes ?? 24 * 60;
    const start = maxDate([
      berlinTimeOnDateKey(dateKey, availabilityStartMinutes),
      args.rangeStart,
    ]);
    const end = minDate([
      berlinTimeOnDateKey(dateKey, availabilityEndMinutes),
      args.rangeEnd,
    ]);
    return end.getTime() > start.getTime() ? [{ start, end }] : [];
  });
}

export function computeScheduleShareFreeRanges(args: {
  rangeStart: Date;
  rangeEnd: Date;
  busy: Array<{ start: Date; end: Date }>;
  includedDates?: readonly string[];
  availabilityStartMinutes?: number;
  availabilityEndMinutes?: number;
}): Array<{ start: Date; end: Date }> {
  const busyMerged = mergeIntervals(args.busy);
  const minimumSpanMs = SCHEDULE_SHARE_MIN_PROPOSAL_MINUTES * 60_000;

  const free = scheduleShareAvailabilityWindows(args).flatMap((window) =>
    computeFreeRanges(window.start, window.end, busyMerged),
  );
  return mergeIntervals(free).filter(
    (slot) => slot.end.getTime() - slot.start.getTime() >= minimumSpanMs,
  );
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
      where: {
        userId: ownerUserId,
        projectionStatus: "ACTIVE",
        courseScheduleMirrorKey: { not: null },
      },
      select: { courseScheduleMirrorKey: true },
    }),
    db.userCourse.findMany({
      where: { userId: ownerUserId, ...activeCourseMembershipWhere(rangeStart) },
      include: {
        course: true,
        sessions: { orderBy: [{ weekday: "asc" }, { startMinute: "asc" }] },
      },
    }),
    loadCalendarEntryOccurrences(db, {
      userId: ownerUserId,
      windowStart: rangeStart,
      windowEnd: rangeEnd,
    }),
  ]);

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
    const internalPresetKey = mirror
      ? "course"
      : (e.category?.presetKey ?? (e.categoryId ? null : UNCATEGORIZED_REVEAL_PRESET_KEY));
    const internalCategoryId = mirror ? null : e.categoryId;
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
        blocks.push({
          start: clipped.start,
          end: clipped.end,
          title: titleParts.join(" ") || m.course.name,
          location: s.location,
          internalCategoryId: null,
          internalPresetKey: "course",
          internalCategoryColor: null,
          internalCategoryName: null,
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
      internalPresetKey: catId
        ? (presetByCategoryId[catId] ?? null)
        : UNCATEGORIZED_REVEAL_PRESET_KEY,
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
  const sharedDayWindows = scheduleShareAvailabilityWindows({
    rangeStart,
    rangeEnd,
    includedDates,
    availabilityStartMinutes: reveal.availabilityStartMinutes,
    availabilityEndMinutes: reveal.availabilityEndMinutes,
  });
  const scopedInternal = includedKeys
    ? internal.filter((block) =>
        sharedDayWindows.some(
          (window) => block.start.getTime() < window.end.getTime()
            && block.end.getTime() > window.start.getTime(),
        ),
      )
    : internal;

  const freeRanges = computeScheduleShareFreeRanges({
    rangeStart,
    rangeEnd,
    busy: scopedInternal.map((b) => ({ start: b.start, end: b.end })),
    includedDates,
    availabilityStartMinutes: reveal.availabilityStartMinutes,
    availabilityEndMinutes: reveal.availabilityEndMinutes,
  });
  const freeSlots = freeRanges.map((f) => ({ start: f.start.toISOString(), end: f.end.toISOString() }));

  const detailBlocks: PublicScheduleBlock[] = [];

  for (const b of scopedInternal) {
    const revealed = forOwnerPreview || isBlockRevealed(b, reveal);
    detailBlocks.push({
      kind: revealed ? "busy_detail" : "busy_anonymous",
      start: b.start.toISOString(),
      end: b.end.toISOString(),
      ...(revealed && b.title?.trim() ? { title: b.title.trim() } : {}),
      ...(revealed && b.location?.trim() ? { location: b.location.trim() } : {}),
      ...(revealed && b.internalCategoryId ? { categoryId: b.internalCategoryId } : {}),
      ...(revealed && b.internalPresetKey ? { categoryPresetKey: b.internalPresetKey } : {}),
      ...(revealed && b.internalCategoryName ? { categoryName: b.internalCategoryName } : {}),
      ...(revealed && b.internalCategoryColor ? { categoryColor: b.internalCategoryColor } : {}),
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
    includedDates?: readonly string[];
    availabilityStartMinutes?: number;
    availabilityEndMinutes?: number;
  },
): Promise<boolean> {
  const internal = await collectInternalScheduleBlocks(db, args.ownerUserId, args.rangeStart, args.rangeEnd);
  const freeRanges = computeScheduleShareFreeRanges({
    rangeStart: args.rangeStart,
    rangeEnd: args.rangeEnd,
    busy: internal.map((b) => ({ start: b.start, end: b.end })),
    includedDates: args.includedDates,
    availabilityStartMinutes: args.availabilityStartMinutes,
    availabilityEndMinutes: args.availabilityEndMinutes,
  });
  const ps = args.proposalStart.getTime();
  const pe = args.proposalEnd.getTime();
  return freeRanges.some((slot) => ps >= slot.start.getTime() && pe <= slot.end.getTime());
}
