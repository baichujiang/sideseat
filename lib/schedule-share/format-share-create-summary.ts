import { formatInTimeZone } from "date-fns-tz";

import { SCHEDULE_DISPLAY_TZ, scheduleDateKeyInBerlin } from "@/lib/calendar/schedule-berlin";
import type { AppLocale } from "@/lib/i18n/app-locale";

function berlinKeys(d: Date) {
  const key = scheduleDateKeyInBerlin(d);
  return {
    year: key.slice(0, 4),
    month: key.slice(5, 7),
    day: key.slice(8, 10),
  };
}

function fmtTime(d: Date, locale: AppLocale): string {
  if (locale === "zh-CN") {
    return formatInTimeZone(d, SCHEDULE_DISPLAY_TZ, "M月d日 HH:mm");
  }
  return formatInTimeZone(d, SCHEDULE_DISPLAY_TZ, "MMM d, HH:mm");
}

function fmtDate(d: Date, locale: AppLocale, withYear: boolean): string {
  if (locale === "zh-CN") {
    return formatInTimeZone(d, SCHEDULE_DISPLAY_TZ, withYear ? "yyyy年M月d日" : "M月d日");
  }
  return formatInTimeZone(d, SCHEDULE_DISPLAY_TZ, withYear ? "MMM d, yyyy" : "MMM d");
}

function fmtDateTime(d: Date, locale: AppLocale, withYear: boolean): string {
  if (locale === "zh-CN") {
    return formatInTimeZone(d, SCHEDULE_DISPLAY_TZ, withYear ? "yyyy年M月d日 HH:mm" : "M月d日 HH:mm");
  }
  return formatInTimeZone(
    d,
    SCHEDULE_DISPLAY_TZ,
    withYear ? "MMM d, yyyy, HH:mm" : "MMM d, HH:mm",
  );
}

/**
 * Dialog summary for shared range — Berlin wall time, locale-aware.
 * Handles same day, cross-month, and cross-year.
 */
export function formatShareCreateRangeSummary(
  rangeStart: Date,
  rangeEnd: Date,
  locale: AppLocale,
): string {
  const startK = berlinKeys(rangeStart);
  const endK = berlinKeys(rangeEnd);
  const sameDay = startK.year === endK.year && startK.month === endK.month && startK.day === endK.day;
  const sameYear = startK.year === endK.year;
  const sameMonth = sameYear && startK.month === endK.month;

  if (sameDay) {
    const datePart = fmtDate(rangeStart, locale, !sameYear);
    const startTime = formatInTimeZone(rangeStart, SCHEDULE_DISPLAY_TZ, "HH:mm");
    const endTime = formatInTimeZone(rangeEnd, SCHEDULE_DISPLAY_TZ, "HH:mm");
    return `${datePart} ${startTime} – ${endTime}`;
  }

  if (sameMonth) {
    if (locale === "zh-CN") {
      const monthDayStart = formatInTimeZone(rangeStart, SCHEDULE_DISPLAY_TZ, "M月d日 HH:mm");
      const endPart = formatInTimeZone(rangeEnd, SCHEDULE_DISPLAY_TZ, "d日 HH:mm");
      return `${monthDayStart} – ${endPart}`;
    }
    const startPart = formatInTimeZone(rangeStart, SCHEDULE_DISPLAY_TZ, "MMM d, HH:mm");
    const endPart = formatInTimeZone(rangeEnd, SCHEDULE_DISPLAY_TZ, "d, HH:mm");
    return `${startPart} – ${endPart}`;
  }

  if (sameYear) {
    return `${fmtDateTime(rangeStart, locale, false)} – ${fmtDateTime(rangeEnd, locale, false)}`;
  }

  return `${fmtDateTime(rangeStart, locale, true)} – ${fmtDateTime(rangeEnd, locale, true)}`;
}

/** Expiry datetime for link summary row. */
export function formatShareExpirySummary(expires: Date, locale: AppLocale): string {
  return fmtTime(expires, locale);
}
