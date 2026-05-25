import type { Weekday } from "@prisma/client";
import { addDays, startOfDay } from "date-fns";
import { toZonedTime } from "date-fns-tz";

import type { WeekCalendarBlock } from "@/components/calendar/week-calendar";
import {
  berlinStartOfWeek,
  berlinWeekdayFromInstant,
  SCHEDULE_DISPLAY_TZ,
  scheduleDateKeyInBerlin,
} from "@/lib/calendar/schedule-berlin";
import { WEEK_CALENDAR_VIRTUAL_INITIAL_BUFFER_DAYS } from "@/lib/calendar/week-calendar-constants";

export function berlinCalendarDayStart(instant: Date): Date {
  return startOfDay(toZonedTime(instant, SCHEDULE_DISPLAY_TZ));
}

export { WEEK_CALENDAR_CONTINUOUS_BUFFER_DAYS } from "@/lib/calendar/week-calendar-constants";

export type WeekCalendarDayColumn = {
  weekday: Weekday;
  date: Date;
  dateKey: string;
};

export function buildWeekCalendarDayColumns(args: {
  mode: "week" | "continuous";
  weekStartDate: Date;
  focusDate: Date;
  scrollRangeStart?: Date;
  scrollRangeEnd?: Date;
  /** When set (continuous mode), render only these Berlin days — supports sparse share selection. */
  columnDateKeys?: readonly string[];
  /** Virtual-scroll window (continuous mode). When set, only this inclusive day range is rendered. */
  continuousStripStart?: Date;
  continuousStripEnd?: Date;
}): WeekCalendarDayColumn[] {
  if (args.mode === "week") {
    const order: Weekday[] = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];
    return order.map((weekday, index) => {
      const date = addDays(args.weekStartDate, index);
      return { weekday, date, dateKey: scheduleDateKeyInBerlin(date) };
    });
  }

  if (args.columnDateKeys?.length) {
    return args.columnDateKeys.map((dateKey) => {
      const date = berlinCalendarDayStart(
        startOfDay(toZonedTime(new Date(`${dateKey}T12:00:00`), SCHEDULE_DISPLAY_TZ)),
      );
      return {
        weekday: berlinWeekdayFromInstant(date),
        date,
        dateKey,
      };
    });
  }

  const focusDay = berlinCalendarDayStart(args.focusDate);
  const defaultStripStart = addDays(focusDay, -WEEK_CALENDAR_VIRTUAL_INITIAL_BUFFER_DAYS);
  const defaultStripEnd = addDays(focusDay, WEEK_CALENDAR_VIRTUAL_INITIAL_BUFFER_DAYS);
  const windowStart = args.continuousStripStart
    ? berlinCalendarDayStart(args.continuousStripStart)
    : defaultStripStart;
  const windowEnd = args.continuousStripEnd
    ? berlinCalendarDayStart(args.continuousStripEnd)
    : defaultStripEnd;
  const rangeStart = args.scrollRangeStart
    ? berlinCalendarDayStart(args.scrollRangeStart)
    : windowStart;
  const rangeEnd = args.scrollRangeEnd
    ? berlinCalendarDayStart(args.scrollRangeEnd)
    : windowEnd;
  const stripStart = windowStart < rangeStart ? rangeStart : windowStart;
  const stripEnd = windowEnd > rangeEnd ? rangeEnd : windowEnd;

  const columns: WeekCalendarDayColumn[] = [];
  for (let cursor = stripStart; cursor <= stripEnd; cursor = addDays(cursor, 1)) {
    columns.push({
      weekday: berlinWeekdayFromInstant(cursor),
      date: cursor,
      dateKey: scheduleDateKeyInBerlin(cursor),
    });
  }
  return columns;
}

const WEEKDAY_ORDER: Weekday[] = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];

/**
 * Pick how the visible day strip aligns when fewer than seven columns are shown.
 * Workweek (Mon-first) is used only when the focused day fits in Mon..N;
 * otherwise anchor the strip on the focus date (e.g. Sat/Sun with a 5-day phone view).
 */
export function weekCalendarHorizontalModeForFocus(
  focusDate: Date,
  visibleWeekDays: number,
): "workweek" | "include-anchor" {
  const clamped = Math.max(1, Math.min(WEEKDAY_ORDER.length, Math.round(visibleWeekDays)));
  const weekday = berlinWeekdayFromInstant(focusDate);
  const dayIndex = WEEKDAY_ORDER.indexOf(weekday);
  if (dayIndex < 0) return "workweek";
  return dayIndex < clamped ? "workweek" : "include-anchor";
}

export function blockMatchesDayColumn(block: WeekCalendarBlock, column: WeekCalendarDayColumn): boolean {
  const key = block.occurrenceDateKey?.trim();
  if (key) return key === column.dateKey;
  return block.weekday === column.weekday;
}

export function buildBlocksByDateKey(
  blocks: WeekCalendarBlock[],
  columns: WeekCalendarDayColumn[],
): Map<string, WeekCalendarBlock[]> {
  const map = new Map<string, WeekCalendarBlock[]>();
  const dateKeysByWeekday = new Map<Weekday, string[]>();

  for (const column of columns) {
    map.set(column.dateKey, []);
    const weekdayKeys = dateKeysByWeekday.get(column.weekday) ?? [];
    weekdayKeys.push(column.dateKey);
    dateKeysByWeekday.set(column.weekday, weekdayKeys);
  }

  for (const block of blocks) {
    const occurrenceKey = block.occurrenceDateKey?.trim();
    if (occurrenceKey) {
      const list = map.get(occurrenceKey);
      if (list) list.push(block);
      continue;
    }
    const matchingKeys = dateKeysByWeekday.get(block.weekday);
    if (!matchingKeys) continue;
    for (const dateKey of matchingKeys) {
      map.get(dateKey)!.push(block);
    }
  }

  return map;
}

export function horizontalScrollIndexForFocus(
  columns: WeekCalendarDayColumn[],
  focusDate: Date,
  horizontalMode: "workweek" | "include-anchor",
  visibleWeekDays: number,
): number {
  if (columns.length === 0) return 0;
  const focusKey = scheduleDateKeyInBerlin(focusDate);
  const focusIdx = columns.findIndex((column) => column.dateKey === focusKey);
  if (focusIdx < 0) return 0;
  const maxStart = Math.max(columns.length - visibleWeekDays, 0);
  if (horizontalMode === "include-anchor") {
    return Math.min(Math.max(focusIdx - (visibleWeekDays - 1), 0), maxStart);
  }
  const mondayKey = scheduleDateKeyInBerlin(berlinStartOfWeek(focusDate));
  const mondayIdx = columns.findIndex((column) => column.dateKey === mondayKey);
  return mondayIdx >= 0 ? Math.min(mondayIdx, maxStart) : Math.min(focusIdx, maxStart);
}

/** Berlin date key of the leftmost day column at `scrollLeft` (stable anchor for width changes). */
export function leftmostVisibleColumnDateKey(
  columns: WeekCalendarDayColumn[],
  scrollLeft: number,
  columnWidthPx: number,
): string | null {
  if (columns.length === 0 || columnWidthPx <= 0) return null;
  const index = Math.max(
    0,
    Math.min(columns.length - 1, Math.floor(scrollLeft / columnWidthPx + 1e-6)),
  );
  return columns[index]?.dateKey ?? null;
}

/** Left-edge scroll for the column matching `dateKey`, or a scaled fallback when the key is missing. */
export function horizontalScrollLeftForColumnDateKey(
  columns: WeekCalendarDayColumn[],
  dateKey: string | null | undefined,
  fallbackScrollLeft: number,
  dayColumnWidthPx: number,
  viewportWidthPx: number,
): number {
  if (columns.length === 0 || dayColumnWidthPx <= 0) {
    return fallbackScrollLeft;
  }
  const maxScrollLeft = Math.max(0, columns.length * dayColumnWidthPx - viewportWidthPx);
  if (!dateKey) {
    return Math.min(Math.max(0, fallbackScrollLeft), maxScrollLeft);
  }
  const columnIndex = columns.findIndex((column) => column.dateKey === dateKey);
  if (columnIndex < 0) {
    return Math.min(Math.max(0, fallbackScrollLeft), maxScrollLeft);
  }
  return Math.min(Math.max(0, columnIndex * dayColumnWidthPx), maxScrollLeft);
}

/** Snap horizontal scroll to the nearest whole day-column boundary. */
export function snapWeekCalendarHorizontalScrollLeft(
  scrollLeft: number,
  dayColumnWidthPx: number,
  maxScrollLeft: number,
): number {
  if (dayColumnWidthPx <= 0) {
    return Math.max(0, Math.min(maxScrollLeft, scrollLeft));
  }
  const snapped = Math.round(scrollLeft / dayColumnWidthPx) * dayColumnWidthPx;
  return Math.max(0, Math.min(maxScrollLeft, snapped));
}

/** Minimal horizontal scroll so `date` column is fully inside the day-strip viewport. */
export function horizontalScrollLeftToRevealDay(
  columns: WeekCalendarDayColumn[],
  date: Date,
  currentScrollLeft: number,
  viewportWidthPx: number,
  dayColumnWidthPx: number,
): number {
  if (columns.length === 0 || dayColumnWidthPx <= 0 || viewportWidthPx <= 0) {
    return currentScrollLeft;
  }
  const targetKey = scheduleDateKeyInBerlin(date);
  const targetIdx = columns.findIndex((column) => column.dateKey === targetKey);
  if (targetIdx < 0) return currentScrollLeft;

  const colStart = targetIdx * dayColumnWidthPx;
  const colEnd = colStart + dayColumnWidthPx;
  const viewStart = currentScrollLeft;
  const viewEnd = viewStart + viewportWidthPx;

  if (colStart >= viewStart && colEnd <= viewEnd) {
    return currentScrollLeft;
  }

  const maxScrollLeft = Math.max(0, columns.length * dayColumnWidthPx - viewportWidthPx);

  if (targetIdx * dayColumnWidthPx < viewStart || colEnd <= viewStart) {
    // Target is left of the viewport — pan right until today is included.
    return Math.min(colStart, maxScrollLeft);
  }

  // Target is right of the viewport — pan left until today is included.
  return Math.min(Math.max(0, colEnd - viewportWidthPx), maxScrollLeft);
}
