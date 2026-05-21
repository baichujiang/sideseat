import { addDays, endOfDay, startOfDay } from "date-fns";

import {
  berlinStartOfCalendarDay,
  scheduleDateKeyInBerlin,
} from "@/lib/calendar/schedule-berlin";
import { SCHEDULE_SHARE_MAX_RANGE_DAYS } from "@/lib/schedule-share/constants";
import { shareRangeForPreset } from "@/lib/schedule-share/share-range-presets";

const ISO_DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

export function berlinDateFromDateKey(dateKey: string): Date {
  if (!ISO_DATE_ONLY.test(dateKey)) {
    throw new Error(`Invalid Berlin date key: ${dateKey}`);
  }
  return startOfDay(new Date(`${dateKey}T12:00:00`));
}

/** Every Berlin calendar day from rangeStart through rangeEnd (inclusive). */
/** Berlin days shown on the owner share-settings calendar (selection uses blue chrome only). */
export function shareOwnerCalendarPickerRange(baseNow = new Date()): {
  rangeStart: Date;
  rangeEnd: Date;
} {
  const rangeStart = berlinStartOfCalendarDay(baseNow);
  const rangeEnd = endOfDay(addDays(rangeStart, SCHEDULE_SHARE_MAX_RANGE_DAYS - 1));
  return { rangeStart, rangeEnd };
}

export function shareDateKeysInInclusiveRange(rangeStart: Date, rangeEnd: Date): Set<string> {
  const keys = new Set<string>();
  for (let cursor = startOfDay(rangeStart); cursor.getTime() <= endOfDay(rangeEnd).getTime(); cursor = addDays(cursor, 1)) {
    keys.add(scheduleDateKeyInBerlin(cursor));
    if (keys.size > SCHEDULE_SHARE_MAX_RANGE_DAYS + 1) break;
  }
  return keys;
}

export type ShareDayQuickPreset = "next_3_days" | "next_7_days" | "next_week";

/** Berlin calendar days starting on `anchorDay` (inclusive), `count` days long. */
export function shareDateKeysForDayCount(
  count: number,
  anchorDay: Date = berlinStartOfCalendarDay(new Date()),
): Set<string> {
  const capped = Math.min(Math.max(1, count), SCHEDULE_SHARE_MAX_RANGE_DAYS);
  const keys = new Set<string>();
  let cursor = berlinStartOfCalendarDay(anchorDay);
  for (let i = 0; i < capped; i++) {
    keys.add(scheduleDateKeyInBerlin(cursor));
    cursor = addDays(cursor, 1);
  }
  return keys;
}

/** `count` Berlin days starting tomorrow (relative to `baseNow`). */
export function shareDateKeysForNextDayCount(count: number, baseNow = new Date()): Set<string> {
  return shareDateKeysForDayCount(count, addDays(berlinStartOfCalendarDay(baseNow), 1));
}

export function shareDateKeysForQuickPreset(
  preset: ShareDayQuickPreset,
  baseNow = new Date(),
): Set<string> {
  switch (preset) {
    case "next_3_days":
      return shareDateKeysForNextDayCount(3, baseNow);
    case "next_7_days":
      return shareDateKeysForNextDayCount(7, baseNow);
    case "next_week": {
      const { start, end } = shareRangeForPreset("next_week", baseNow);
      return shareDateKeysInInclusiveRange(start, end);
    }
  }
}

export function initialShareSelectedDateKeys(
  _rangeStart: Date,
  _rangeEnd: Date,
  includedDates?: string[] | null,
): Set<string> {
  if (includedDates?.length) {
    return new Set(includedDates.filter((k) => ISO_DATE_ONLY.test(k)).sort());
  }
  return shareDateKeysForNextDayCount(3);
}

export function shareRangeFromSelectedDateKeys(selected: ReadonlySet<string>): {
  rangeStart: Date;
  rangeEnd: Date;
} {
  const sorted = [...selected].sort();
  if (sorted.length === 0) {
    const today = startOfDay(new Date());
    return { rangeStart: today, rangeEnd: endOfDay(today) };
  }
  return {
    rangeStart: berlinDateFromDateKey(sorted[0]!),
    rangeEnd: endOfDay(berlinDateFromDateKey(sorted[sorted.length - 1]!)),
  };
}

export function toggleShareDaySelection(
  selected: ReadonlySet<string>,
  tapped: Date,
): { next: Set<string>; atCapacity: boolean } {
  const key = scheduleDateKeyInBerlin(tapped);
  const next = new Set(selected);
  if (next.has(key)) {
    if (next.size <= 1) return { next, atCapacity: false };
    next.delete(key);
    return { next, atCapacity: false };
  }
  if (next.size >= SCHEDULE_SHARE_MAX_RANGE_DAYS) {
    return { next: new Set(selected), atCapacity: true };
  }
  next.add(key);
  return { next, atCapacity: false };
}

export function sortedShareIncludedDates(selected: ReadonlySet<string>): string[] {
  return [...selected].sort();
}

/** Group sorted Berlin date keys into maximal contiguous calendar-day runs. */
export function groupConsecutiveBerlinDateKeys(
  sortedDateKeys: readonly string[],
): Array<{ startKey: string; endKey: string }> {
  if (sortedDateKeys.length === 0) return [];

  const runs: Array<{ startKey: string; endKey: string }> = [];
  let runStart = sortedDateKeys[0]!;
  let runEnd = sortedDateKeys[0]!;

  for (let i = 1; i < sortedDateKeys.length; i++) {
    const key = sortedDateKeys[i]!;
    const nextDayKey = scheduleDateKeyInBerlin(addDays(berlinDateFromDateKey(runEnd), 1));
    if (key === nextDayKey) {
      runEnd = key;
      continue;
    }
    runs.push({ startKey: runStart, endKey: runEnd });
    runStart = key;
    runEnd = key;
  }
  runs.push({ startKey: runStart, endKey: runEnd });
  return runs;
}
