import { addDays } from "date-fns";

import { SCHEDULE_SHARE_MIN_PROPOSAL_MINUTES } from "@/lib/schedule-share/constants";

import type { WeekCalendarBlock } from "@/components/calendar/week-calendar";
import type { ScheduleShareProposalSelection } from "@/lib/schedule-share/proposal-selection";
import {
  berlinClockMinutes,
  berlinEndOfWeek,
  berlinStartOfWeek,
  berlinWeekdayFromInstant,
  scheduleDateKeyInBerlin,
} from "@/lib/calendar/schedule-berlin";
import { normalizeCalendarCategoryHex } from "@/lib/calendar/calendar-category-colors";
import { isValidCategoryHex } from "@/lib/calendar/category-visual";
import { DRAFT_PREVIEW_COURSE_ID } from "@/lib/calendar/draft-preview-block";
import type { PublicScheduleBlock } from "@/lib/schedule-share/build-schedule-share-snapshot";

const ANONYMOUS_BUSY_COLOR = "#94A3B8";
const DETAIL_BUSY_COLOR = "#3B82F6";

function weekDateKeys(weekStart: Date): Set<string> {
  const keys = new Set<string>();
  for (let i = 0; i < 7; i++) {
    keys.add(scheduleDateKeyInBerlin(addDays(weekStart, i)));
  }
  return keys;
}

export function publicBlocksToWeekCalendarBlocks(args: {
  blocks: PublicScheduleBlock[];
  /** Legacy: only blocks in this ISO week. */
  weekStart?: Date;
  /** Continuous strip: include every block on these Berlin calendar days (inclusive). */
  rangeStart?: Date;
  rangeEnd?: Date;
  /** When set, only blocks on these Berlin yyyy-MM-dd days are shown (sparse selection). */
  includedDateKeys?: ReadonlySet<string>;
  busyAnonymousLabel: string;
}): WeekCalendarBlock[] {
  const rangeStartKey = args.rangeStart
    ? scheduleDateKeyInBerlin(args.rangeStart)
    : null;
  const rangeEndKey = args.rangeEnd ? scheduleDateKeyInBerlin(args.rangeEnd) : null;
  const includedDateKeys = args.includedDateKeys;
  const weekKeys = args.weekStart ? weekDateKeys(args.weekStart) : null;
  const out: WeekCalendarBlock[] = [];

  args.blocks.forEach((block, index) => {
    const start = new Date(block.start);
    const end = new Date(block.end);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return;

    const dateKey = scheduleDateKeyInBerlin(start);
    if (weekKeys && !weekKeys.has(dateKey)) return;
    if (rangeStartKey && dateKey < rangeStartKey) return;
    if (rangeEndKey && dateKey > rangeEndKey) return;
    if (includedDateKeys && !includedDateKeys.has(dateKey)) return;

    const weekday = berlinWeekdayFromInstant(start);
    const startMinute = berlinClockMinutes(start);
    let endMinute = berlinClockMinutes(end);
    if (endMinute <= startMinute) {
      endMinute = Math.min(startMinute + 15, 24 * 60);
    }

    const revealed = block.kind === "busy_detail";
    const title = revealed ? (block.title?.trim() || args.busyAnonymousLabel) : args.busyAnonymousLabel;
    const rawHex = block.categoryColor?.trim();
    const catHex =
      rawHex && isValidCategoryHex(rawHex)
        ? normalizeCalendarCategoryHex(rawHex) ?? rawHex
        : null;
    const useCategoryColor = revealed && Boolean(catHex);
    const categoryName = revealed
      ? block.categoryName?.trim() || title
      : args.busyAnonymousLabel;

    out.push({
      courseId: `share-${dateKey}-${index}`,
      courseName: title,
      courseCode: null,
      source: "calendar",
      weekday,
      startMinute,
      endMinute,
      location: revealed ? block.location?.trim() ?? null : null,
      withLabel: null,
      note: null,
      repeatLabel: null,
      repeatRule: "NONE",
      repeatUntilISO: null,
      eventParticipants: [],
      kind: "study",
      categoryId: block.categoryId ?? null,
      categoryName,
      categoryColor: useCategoryColor ? catHex : revealed ? DETAIL_BUSY_COLOR : ANONYMOUS_BUSY_COLOR,
      calendarEntryId: null,
      occurrenceDateKey: dateKey,
    });
  });

  return out;
}

export function proposalSelectionToPreviewBlock(
  selection: ScheduleShareProposalSelection,
  label: string,
): WeekCalendarBlock {
  const start = selection.start;
  const end = selection.end;
  const weekday = berlinWeekdayFromInstant(start);
  const startMinute = berlinClockMinutes(start);
  let endMinute = berlinClockMinutes(end);
  if (endMinute <= startMinute) {
    endMinute = Math.min(startMinute + 15, 24 * 60);
  }

  return {
    courseId: DRAFT_PREVIEW_COURSE_ID,
    courseName: label,
    courseCode: null,
    source: "calendar",
    weekday,
    startMinute,
    endMinute,
    location: null,
    withLabel: null,
    note: null,
    repeatLabel: null,
    repeatRule: "NONE",
    repeatUntilISO: null,
    eventParticipants: [],
    kind: "study",
    categoryId: null,
    categoryName: label,
    categoryColor: null,
    calendarEntryId: null,
    occurrenceDateKey: scheduleDateKeyInBerlin(start),
  };
}

/** Default proposal length when tapping an empty slot (matches course mini grid). */
export const PROPOSAL_DEFAULT_DURATION_MINUTES = 90;
const TAP_SLOT_SNAP_MINUTES = 30;

export function snapMinuteToTapSlot(minute: number): number {
  const snapped = Math.floor(minute / TAP_SLOT_SNAP_MINUTES) * TAP_SLOT_SNAP_MINUTES;
  return Math.max(0, Math.min(24 * 60 - TAP_SLOT_SNAP_MINUTES, snapped));
}

/**
 * Build a guest proposal selection from a calendar tap, clamped to the smallest
 * free window that contains the click instant (course-style slot pick).
 */
export function buildProposalSelectionFromClick(
  freeSlots: { start: string; end: string }[],
  clickInstant: Date,
  durationMinutes = PROPOSAL_DEFAULT_DURATION_MINUTES,
): ScheduleShareProposalSelection | null {
  const point = clickInstant.getTime();
  const containing = freeSlots.filter((slot) => {
    const ss = new Date(slot.start).getTime();
    const se = new Date(slot.end).getTime();
    return point >= ss && point < se;
  });
  if (containing.length === 0) return null;

  containing.sort((a, b) => {
    const spanA = new Date(a.end).getTime() - new Date(a.start).getTime();
    const spanB = new Date(b.end).getTime() - new Date(b.start).getTime();
    return spanA - spanB;
  });
  const bounds = containing[0]!;
  const bs = new Date(bounds.start).getTime();
  const be = new Date(bounds.end).getTime();
  const minSpan = SCHEDULE_SHARE_MIN_PROPOSAL_MINUTES * 60_000;
  const preferredSpan = durationMinutes * 60_000;

  let startMs = Math.max(point, bs);
  let endMs = Math.min(startMs + preferredSpan, be);
  if (endMs - startMs < minSpan) {
    startMs = bs;
    endMs = Math.min(bs + preferredSpan, be);
    if (endMs - startMs < minSpan) {
      endMs = be;
      if (endMs - startMs < minSpan) return null;
    }
  }

  const start = new Date(startMs);
  const end = new Date(endMs);
  return {
    start,
    end: clampProposalEndToBounds(start, end, bounds),
    bounds: { start: bounds.start, end: bounds.end },
  };
}

export function proposalRangeFitsFreeSlots(
  freeSlots: { start: string; end: string }[],
  start: Date,
  end: Date,
): boolean {
  const ps = start.getTime();
  const pe = end.getTime();
  if (pe <= ps) return false;
  return freeSlots.some((slot) => {
    const ss = new Date(slot.start).getTime();
    const se = new Date(slot.end).getTime();
    return ps >= ss && pe <= se;
  });
}

/** Smallest free window that fully contains the proposed meeting (for editable duration). */
export function findContainingFreeSlot(
  freeSlots: { start: string; end: string }[],
  start: Date,
  end: Date,
): { start: string; end: string } | null {
  const ps = start.getTime();
  const pe = end.getTime();
  if (pe <= ps) return null;

  const matches = freeSlots.filter((slot) => {
    const ss = new Date(slot.start).getTime();
    const se = new Date(slot.end).getTime();
    return ps >= ss && pe <= se;
  });
  if (matches.length === 0) return null;

  matches.sort((a, b) => {
    const spanA = new Date(a.end).getTime() - new Date(a.start).getTime();
    const spanB = new Date(b.end).getTime() - new Date(b.start).getTime();
    return spanA - spanB;
  });
  return matches[0] ?? null;
}

export function clampProposalEndToBounds(
  start: Date,
  end: Date,
  bounds: { start: string; end: string },
): Date {
  const bs = new Date(bounds.start).getTime();
  const be = new Date(bounds.end).getTime();
  let pe = end.getTime();
  const ps = start.getTime();
  if (pe <= ps) pe = ps + 15 * 60_000;
  if (pe > be) return new Date(be);
  if (ps < bs) return new Date(Math.min(bs + 15 * 60_000, be));
  return new Date(pe);
}

export function clampDateToShareRange(date: Date, rangeStart: Date, rangeEnd: Date): Date {
  const t = date.getTime();
  if (t < rangeStart.getTime()) return new Date(rangeStart);
  if (t > rangeEnd.getTime()) return new Date(rangeEnd);
  return date;
}

/** First week row to show: week that contains the first shared day (or range start). */
export function initialShareViewDate(
  rangeStart: Date,
  _rangeEnd: Date,
  includedDates?: readonly string[],
): Date {
  const firstKey = includedDates?.[0];
  if (firstKey) {
    return berlinStartOfWeek(new Date(`${firstKey}T12:00:00`));
  }
  return berlinStartOfWeek(rangeStart);
}

export function shareRangeOccupiesSingleBerlinWeek(rangeStart: Date, rangeEnd: Date): boolean {
  return berlinStartOfWeek(rangeStart).getTime() === berlinStartOfWeek(rangeEnd).getTime();
}
