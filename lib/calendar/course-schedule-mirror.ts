import type { Weekday } from "@prisma/client";
import { addDays, addWeeks, max as maxDate } from "date-fns";

const WEEKDAY_TO_JS: Record<Weekday, number> = {
  MON: 1,
  TUE: 2,
  WED: 3,
  THU: 4,
  FRI: 5,
  SAT: 6,
  SUN: 0,
};

export function courseScheduleMirrorKey(courseId: string, weekday: Weekday, startMinute: number): string {
  return `${courseId}_${weekday}_${startMinute}`;
}

function startOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** First calendar date on or after `from` (date-only) whose weekday matches `weekday`. */
function firstWeekdayOnOrAfter(from: Date, weekday: Weekday): Date {
  const base = startOfLocalDay(from);
  const want = WEEKDAY_TO_JS[weekday];
  const cur = base.getDay();
  const add = (want - cur + 7) % 7;
  return addDays(base, add);
}

function applyClock(baseDay: Date, minuteOfDay: number): Date {
  const d = startOfLocalDay(baseDay);
  const h = Math.floor(minuteOfDay / 60);
  const m = minuteOfDay % 60;
  d.setHours(h, m, 0, 0);
  return d;
}

/**
 * Materialized start/end instants for a weekly class slot from semester bounds (same as Home semester).
 */
export function materializeWeeklyCourseSlot(params: {
  semesterStart: Date;
  semesterEnd: Date;
  /** Skip occurrences strictly before this instant (use `new Date()` to avoid past blocks). */
  notBefore: Date;
  weekday: Weekday;
  startMinute: number;
  endMinute: number;
  maxOccurrences?: number;
}): Array<{ startAt: Date; endAt: Date }> {
  const maxOcc = params.maxOccurrences ?? 120;
  const semStart = startOfLocalDay(params.semesterStart);
  const semEnd = params.semesterEnd;
  const lower = maxDate([semStart, startOfLocalDay(params.notBefore)]);

  let cursor = firstWeekdayOnOrAfter(lower, params.weekday);

  const out: Array<{ startAt: Date; endAt: Date }> = [];
  let count = 0;
  let safety = 0;
  while (count < maxOcc && safety < 160) {
    safety += 1;
    const startAt = applyClock(cursor, params.startMinute);
    let endAt = applyClock(cursor, params.endMinute);
    if (endAt <= startAt) {
      endAt = addDays(endAt, 1);
    }
    if (startAt > semEnd) break;
    if (startAt >= params.notBefore) {
      out.push({ startAt, endAt });
      count += 1;
    }
    cursor = addWeeks(cursor, 1);
  }
  return out;
}
