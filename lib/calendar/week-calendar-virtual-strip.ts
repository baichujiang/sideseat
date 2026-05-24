import { addDays, differenceInCalendarDays } from "date-fns";

import { berlinCalendarDayStart } from "@/lib/calendar/week-calendar-day-columns";
import {
  HOME_CALENDAR_DATA_WINDOW_FUTURE_DAYS,
  HOME_CALENDAR_DATA_WINDOW_PAST_DAYS,
  WEEK_CALENDAR_VIRTUAL_EXTEND_CHUNK_DAYS,
  WEEK_CALENDAR_VIRTUAL_INITIAL_BUFFER_DAYS,
  WEEK_CALENDAR_VIRTUAL_MAX_COLUMNS,
} from "@/lib/calendar/week-calendar-constants";

export {
  HOME_CALENDAR_DATA_WINDOW_FUTURE_DAYS,
  HOME_CALENDAR_DATA_WINDOW_PAST_DAYS,
  WEEK_CALENDAR_VIRTUAL_EXTEND_CHUNK_DAYS,
  WEEK_CALENDAR_VIRTUAL_EXTEND_THRESHOLD_DAYS,
  WEEK_CALENDAR_VIRTUAL_INITIAL_BUFFER_DAYS,
  WEEK_CALENDAR_VIRTUAL_MAX_COLUMNS,
} from "@/lib/calendar/week-calendar-constants";

export type VirtualStripBounds = { start: Date; end: Date };

export type VirtualStripScrollAdjust = {
  prependDays: number;
  trimStartDays: number;
};

export function virtualStripDayCount(bounds: VirtualStripBounds): number {
  return differenceInCalendarDays(bounds.end, bounds.start) + 1;
}

export function focusInVirtualStrip(focusDate: Date, bounds: VirtualStripBounds): boolean {
  const focus = berlinCalendarDayStart(focusDate);
  return focus >= bounds.start && focus <= bounds.end;
}

function clampToRange(
  bounds: VirtualStripBounds,
  rangeStart?: Date,
  rangeEnd?: Date,
): VirtualStripBounds {
  let start = bounds.start;
  let end = bounds.end;
  if (rangeStart) {
    const rs = berlinCalendarDayStart(rangeStart);
    if (start < rs) start = rs;
  }
  if (rangeEnd) {
    const re = berlinCalendarDayStart(rangeEnd);
    if (end > re) end = re;
  }
  if (start > end) {
    const fallback = rangeStart ? berlinCalendarDayStart(rangeStart) : bounds.start;
    return { start: fallback, end: fallback };
  }
  return { start, end };
}

export function buildInitialVirtualStrip(
  focusDate: Date,
  rangeStart?: Date,
  rangeEnd?: Date,
): VirtualStripBounds {
  const focus = berlinCalendarDayStart(focusDate);
  return clampToRange(
    {
      start: addDays(focus, -WEEK_CALENDAR_VIRTUAL_INITIAL_BUFFER_DAYS),
      end: addDays(focus, WEEK_CALENDAR_VIRTUAL_INITIAL_BUFFER_DAYS),
    },
    rangeStart,
    rangeEnd,
  );
}

export function canExtendVirtualStripLeft(bounds: VirtualStripBounds, rangeStart?: Date): boolean {
  if (!rangeStart) return true;
  return bounds.start > berlinCalendarDayStart(rangeStart);
}

export function canExtendVirtualStripRight(bounds: VirtualStripBounds, rangeEnd?: Date): boolean {
  if (!rangeEnd) return true;
  return bounds.end < berlinCalendarDayStart(rangeEnd);
}

export function extendVirtualStripLeft(
  bounds: VirtualStripBounds,
  rangeStart: Date | undefined,
  rangeEnd: Date | undefined,
  chunkDays = WEEK_CALENDAR_VIRTUAL_EXTEND_CHUNK_DAYS,
  maxColumns = WEEK_CALENDAR_VIRTUAL_MAX_COLUMNS,
): { bounds: VirtualStripBounds; scrollAdjust: VirtualStripScrollAdjust } {
  const rs = rangeStart ? berlinCalendarDayStart(rangeStart) : null;
  let newStart = addDays(bounds.start, -chunkDays);
  if (rs && newStart < rs) newStart = rs;
  const prependDays = differenceInCalendarDays(bounds.start, newStart);
  if (prependDays <= 0) {
    return { bounds, scrollAdjust: { prependDays: 0, trimStartDays: 0 } };
  }

  let next = clampToRange({ start: newStart, end: bounds.end }, rangeStart, rangeEnd);
  const count = virtualStripDayCount(next);
  if (count > maxColumns) {
    const trimEndDays = count - maxColumns;
    next = { start: next.start, end: addDays(next.end, -trimEndDays) };
  }

  return { bounds: next, scrollAdjust: { prependDays, trimStartDays: 0 } };
}

export function extendVirtualStripRight(
  bounds: VirtualStripBounds,
  rangeStart: Date | undefined,
  rangeEnd: Date | undefined,
  chunkDays = WEEK_CALENDAR_VIRTUAL_EXTEND_CHUNK_DAYS,
  maxColumns = WEEK_CALENDAR_VIRTUAL_MAX_COLUMNS,
): { bounds: VirtualStripBounds; scrollAdjust: VirtualStripScrollAdjust } {
  const re = rangeEnd ? berlinCalendarDayStart(rangeEnd) : null;
  let newEnd = addDays(bounds.end, chunkDays);
  if (re && newEnd > re) newEnd = re;
  const appendDays = differenceInCalendarDays(newEnd, bounds.end);
  if (appendDays <= 0) {
    return { bounds, scrollAdjust: { prependDays: 0, trimStartDays: 0 } };
  }

  let next = clampToRange({ start: bounds.start, end: newEnd }, rangeStart, rangeEnd);
  const count = virtualStripDayCount(next);
  if (count > maxColumns) {
    const trimStartDays = count - maxColumns;
    next = { start: addDays(next.start, trimStartDays), end: next.end };
    return { bounds: next, scrollAdjust: { prependDays: 0, trimStartDays } };
  }

  return { bounds: next, scrollAdjust: { prependDays: 0, trimStartDays: 0 } };
}
