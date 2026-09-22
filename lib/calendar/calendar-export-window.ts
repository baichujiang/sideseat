import { formatInTimeZone, fromZonedTime } from "date-fns-tz";

import { SCHEDULE_DISPLAY_TZ } from "@/lib/calendar/schedule-berlin";

export const MIN_CALENDAR_EXPORT_YEAR = 2000;
export const MAX_CALENDAR_EXPORT_YEAR = 2100;

export type CalendarExportWindow = {
  /** Inclusive instant for CalendarEntry occurrence queries. */
  start: Date;
  /** Exclusive instant for CalendarEntry occurrence queries. */
  end: Date;
  firstYear: number;
  lastYear: number;
};

function berlinYearBoundary(year: number): Date {
  return fromZonedTime(`${year}-01-01T00:00:00.000`, SCHEDULE_DISPLAY_TZ);
}

export function calendarYearInBerlin(now: Date = new Date()): number {
  return Number(formatInTimeZone(now, SCHEDULE_DISPLAY_TZ, "yyyy"));
}

export function calendarExportFilename(year: number): string {
  return `sideseat-schedule-${year}.ics`;
}

/** Missing means the current Berlin year; malformed or unsupported values fail. */
export function parseCalendarExportYear(
  rawYear: string | null,
  now: Date = new Date(),
): number | null {
  if (rawYear === null) return calendarYearInBerlin(now);
  if (!/^\d{4}$/.test(rawYear)) return null;
  const year = Number(rawYear);
  return year >= MIN_CALENDAR_EXPORT_YEAR && year <= MAX_CALENDAR_EXPORT_YEAR
    ? year
    : null;
}

export function calendarYearExportWindow(year: number): CalendarExportWindow {
  return {
    start: berlinYearBoundary(year),
    end: berlinYearBoundary(year + 1),
    firstYear: year,
    lastYear: year,
  };
}

/** Rolling Apple subscription window: previous, current, and next Berlin years. */
export function calendarSubscriptionExportWindow(
  now: Date = new Date(),
): CalendarExportWindow {
  const currentYear = calendarYearInBerlin(now);
  return {
    start: berlinYearBoundary(currentYear - 1),
    end: berlinYearBoundary(currentYear + 2),
    firstYear: currentYear - 1,
    lastYear: currentYear + 1,
  };
}

/**
 * Lecture periods are civil-date ranges. Clip them with process-local year
 * boundaries so the resulting floating ICS dates never leak across Jan 1.
 */
export function clipLecturePeriodToExportWindow(
  lecturePeriod: { start: Date; end: Date },
  exportWindow: Pick<CalendarExportWindow, "firstYear" | "lastYear">,
): { start: Date; end: Date } | null {
  const yearStart = new Date(exportWindow.firstYear, 0, 1, 0, 0, 0, 0);
  const yearEndExclusive = new Date(
    exportWindow.lastYear + 1,
    0,
    1,
    0,
    0,
    0,
    0,
  );
  const start = lecturePeriod.start > yearStart ? lecturePeriod.start : yearStart;
  const endExclusive = new Date(lecturePeriod.end.getTime() + 1);
  const clippedEndExclusive =
    endExclusive < yearEndExclusive ? endExclusive : yearEndExclusive;
  if (clippedEndExclusive <= start) return null;
  return { start, end: new Date(clippedEndExclusive.getTime() - 1) };
}
