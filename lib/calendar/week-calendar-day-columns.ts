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

function berlinCalendarDayStart(instant: Date): Date {
  return startOfDay(toZonedTime(instant, SCHEDULE_DISPLAY_TZ));
}

/** Days rendered on each side of `focusDate` in continuous horizontal scroll mode. */
export const WEEK_CALENDAR_CONTINUOUS_BUFFER_DAYS = 70;

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

  const bufferStart = berlinCalendarDayStart(
    addDays(args.focusDate, -WEEK_CALENDAR_CONTINUOUS_BUFFER_DAYS),
  );
  const bufferEnd = berlinCalendarDayStart(
    addDays(args.focusDate, WEEK_CALENDAR_CONTINUOUS_BUFFER_DAYS),
  );
  const rangeStart = args.scrollRangeStart
    ? berlinCalendarDayStart(args.scrollRangeStart)
    : bufferStart;
  const rangeEnd = args.scrollRangeEnd
    ? berlinCalendarDayStart(args.scrollRangeEnd)
    : bufferEnd;
  const stripStart = rangeStart > bufferStart ? rangeStart : bufferStart;
  const stripEnd = rangeEnd < bufferEnd ? rangeEnd : bufferEnd;

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
  for (const column of columns) {
    map.set(column.dateKey, []);
  }
  for (const block of blocks) {
    for (const column of columns) {
      if (!blockMatchesDayColumn(block, column)) continue;
      map.get(column.dateKey)!.push(block);
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
  const idx = columns.findIndex((column) => column.dateKey === targetKey);
  if (idx < 0) return currentScrollLeft;

  const colStart = idx * dayColumnWidthPx;
  const colEnd = colStart + dayColumnWidthPx;
  const viewStart = currentScrollLeft;
  const viewEnd = viewStart + viewportWidthPx;

  if (colStart >= viewStart && colEnd <= viewEnd) {
    return currentScrollLeft;
  }
  if (colStart < viewStart) {
    return colStart;
  }
  return Math.max(0, colEnd - viewportWidthPx);
}
