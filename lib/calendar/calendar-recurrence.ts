import {
  addDays,
  addMonths,
  addWeeks,
  addYears,
  differenceInCalendarDays,
  differenceInCalendarMonths,
  differenceInCalendarYears,
} from "date-fns";
import { fromZonedTime, toZonedTime } from "date-fns-tz";

import { SCHEDULE_DISPLAY_TZ } from "@/lib/calendar/schedule-berlin";
import type { CalendarEventInput } from "@/lib/validators/calendar";

export type CalendarOccurrence = {
  startAt: Date;
  endAt: Date;
};

export type RepeatRule = CalendarEventInput["repeat"];

export type CalendarRecurrenceSeed = {
  startAt: Date | string;
  endAt: Date | string;
  repeat: RepeatRule;
  repeatUntil?: Date | string | null;
};

function asDate(value: Date | string): Date {
  return new Date(value);
}

function occurrenceLocalStart(anchor: Date, repeat: RepeatRule, index: number) {
  const localAnchor = toZonedTime(anchor, SCHEDULE_DISPLAY_TZ);
  if (repeat === "DAILY") return addDays(localAnchor, index);
  if (repeat === "WEEKLY") return addWeeks(localAnchor, index);
  if (repeat === "BIWEEKLY") return addWeeks(localAnchor, index * 2);
  if (repeat === "MONTHLY") return addMonths(localAnchor, index);
  if (repeat === "YEARLY") return addYears(localAnchor, index);
  return localAnchor;
}

export function calendarOccurrenceAtIndex(
  anchor: Date,
  repeat: RepeatRule,
  index: number,
): Date {
  if (index <= 0 || repeat === "NONE") return new Date(anchor);
  return fromZonedTime(occurrenceLocalStart(anchor, repeat, index), SCHEDULE_DISPLAY_TZ);
}

function approximateOccurrenceIndex(anchor: Date, repeat: RepeatRule, boundary: Date) {
  if (repeat === "NONE" || boundary <= anchor) return 0;
  const localAnchor = toZonedTime(anchor, SCHEDULE_DISPLAY_TZ);
  const localBoundary = toZonedTime(boundary, SCHEDULE_DISPLAY_TZ);
  if (repeat === "DAILY") {
    return Math.max(0, differenceInCalendarDays(localBoundary, localAnchor));
  }
  if (repeat === "WEEKLY") {
    return Math.max(0, Math.floor(differenceInCalendarDays(localBoundary, localAnchor) / 7));
  }
  if (repeat === "BIWEEKLY") {
    return Math.max(0, Math.floor(differenceInCalendarDays(localBoundary, localAnchor) / 14));
  }
  if (repeat === "MONTHLY") {
    return Math.max(0, differenceInCalendarMonths(localBoundary, localAnchor));
  }
  return Math.max(0, differenceInCalendarYears(localBoundary, localAnchor));
}

function parsedSeed(seed: CalendarRecurrenceSeed) {
  const startAt = asDate(seed.startAt);
  const endAt = asDate(seed.endAt);
  const repeatUntil = seed.repeatUntil ? asDate(seed.repeatUntil) : null;
  return {
    startAt,
    endAt,
    repeatUntil,
    durationMs: endAt.getTime() - startAt.getTime(),
  };
}

/**
 * Expands only the occurrences intersecting a requested view window. An empty
 * repeatUntil means the series has no end; the finite query window still keeps
 * work bounded.
 */
export function expandCalendarRecurrenceInWindow(
  seed: CalendarRecurrenceSeed,
  windowStart: Date,
  windowEnd: Date,
): CalendarOccurrence[] {
  const { startAt, endAt, repeatUntil, durationMs } = parsedSeed(seed);
  if (
    Number.isNaN(startAt.getTime()) ||
    Number.isNaN(endAt.getTime()) ||
    durationMs <= 0 ||
    windowEnd <= windowStart
  ) {
    return [];
  }

  if (seed.repeat === "NONE") {
    return startAt < windowEnd && endAt > windowStart ? [{ startAt, endAt }] : [];
  }

  const expansionBoundary = new Date(windowStart.getTime() - durationMs);
  let index = Math.max(
    0,
    approximateOccurrenceIndex(startAt, seed.repeat, expansionBoundary) - 2,
  );
  const occurrences: CalendarOccurrence[] = [];

  // A 120-day API window normally yields at most 121 daily instances. The
  // guard protects internal callers if that boundary is accidentally removed.
  for (let inspected = 0; inspected < 10_000; inspected += 1, index += 1) {
    const occurrenceStart = calendarOccurrenceAtIndex(startAt, seed.repeat, index);
    if (repeatUntil && occurrenceStart > repeatUntil) break;
    if (occurrenceStart >= windowEnd) break;
    const occurrenceEnd = new Date(occurrenceStart.getTime() + durationMs);
    if (occurrenceEnd > windowStart) {
      occurrences.push({ startAt: occurrenceStart, endAt: occurrenceEnd });
    }
  }

  return occurrences;
}

/** Finds the generated occurrence immediately before a known occurrence. */
export function calendarOccurrenceBefore(
  seed: CalendarRecurrenceSeed,
  occurrenceStart: Date,
): Date | null {
  const { startAt } = parsedSeed(seed);
  if (seed.repeat === "NONE" || occurrenceStart <= startAt) return null;
  let index = Math.max(
    0,
    approximateOccurrenceIndex(startAt, seed.repeat, occurrenceStart) - 3,
  );
  let previous: Date | null = null;
  for (let inspected = 0; inspected < 12; inspected += 1, index += 1) {
    const candidate = calendarOccurrenceAtIndex(startAt, seed.repeat, index);
    if (candidate >= occurrenceStart) return previous;
    previous = candidate;
  }
  return previous;
}

/** Returns the first generated occurrence whose start is at or after `boundary`. */
export function calendarOccurrenceAtOrAfter(
  seed: CalendarRecurrenceSeed,
  boundary: Date,
): CalendarOccurrence | null {
  const { startAt, endAt, repeatUntil, durationMs } = parsedSeed(seed);
  if (
    Number.isNaN(startAt.getTime()) ||
    Number.isNaN(endAt.getTime()) ||
    Number.isNaN(boundary.getTime()) ||
    durationMs <= 0
  ) {
    return null;
  }

  if (seed.repeat === "NONE") {
    return startAt >= boundary ? { startAt, endAt } : null;
  }

  let index = Math.max(
    0,
    approximateOccurrenceIndex(startAt, seed.repeat, boundary) - 2,
  );
  for (let inspected = 0; inspected < 32; inspected += 1, index += 1) {
    const occurrenceStart = calendarOccurrenceAtIndex(startAt, seed.repeat, index);
    if (repeatUntil && occurrenceStart > repeatUntil) return null;
    if (occurrenceStart >= boundary) {
      return {
        startAt: occurrenceStart,
        endAt: new Date(occurrenceStart.getTime() + durationMs),
      };
    }
  }
  return null;
}

/** Returns the last generated occurrence whose start is at or before `boundary`. */
export function calendarOccurrenceAtOrBefore(
  seed: CalendarRecurrenceSeed,
  boundary: Date,
): CalendarOccurrence | null {
  const { startAt, endAt, repeatUntil, durationMs } = parsedSeed(seed);
  if (
    Number.isNaN(startAt.getTime()) ||
    Number.isNaN(endAt.getTime()) ||
    Number.isNaN(boundary.getTime()) ||
    durationMs <= 0 ||
    startAt > boundary
  ) {
    return null;
  }

  if (seed.repeat === "NONE") return { startAt, endAt };

  const effectiveBoundary = repeatUntil && repeatUntil < boundary ? repeatUntil : boundary;
  let index = Math.max(
    0,
    approximateOccurrenceIndex(startAt, seed.repeat, effectiveBoundary) + 2,
  );
  for (let inspected = 0; inspected < 32 && index >= 0; inspected += 1, index -= 1) {
    const occurrenceStart = calendarOccurrenceAtIndex(startAt, seed.repeat, index);
    if (occurrenceStart > effectiveBoundary) continue;
    return {
      startAt: occurrenceStart,
      endAt: new Date(occurrenceStart.getTime() + durationMs),
    };
  }
  return null;
}

/**
 * Legacy bounded expansion retained for old materialized-series conversion.
 * User-facing reads must use expandCalendarRecurrenceInWindow instead.
 */
export function expandCalendarRecurrence(
  values: Pick<CalendarEventInput, "startAt" | "endAt" | "repeat" | "repeatUntil">,
  maxOccurrences = 120,
): CalendarOccurrence[] {
  const startAt = new Date(values.startAt);
  const endAt = new Date(values.endAt);
  const repeatUntil = values.repeatUntil ? new Date(values.repeatUntil) : null;
  const durationMs = endAt.getTime() - startAt.getTime();
  const occurrences: CalendarOccurrence[] = [];

  for (let index = 0; index < maxOccurrences; index += 1) {
    const occurrenceStart = calendarOccurrenceAtIndex(startAt, values.repeat, index);
    if (values.repeat !== "NONE" && repeatUntil && occurrenceStart > repeatUntil) break;
    occurrences.push({
      startAt: occurrenceStart,
      endAt: new Date(occurrenceStart.getTime() + durationMs),
    });
    if (values.repeat === "NONE") break;
  }

  return occurrences;
}
