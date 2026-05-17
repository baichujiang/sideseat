import { addWeeks, endOfWeek, startOfWeek } from "date-fns";
import { formatInTimeZone, toZonedTime } from "date-fns-tz";

import { SCHEDULE_DISPLAY_TZ, scheduleDateKeyInBerlin } from "@/lib/calendar/schedule-berlin";
import type { AppLocale } from "@/lib/i18n/app-locale";
import { formatMessage } from "@/lib/i18n/messages";
import type { AppMessages } from "@/lib/i18n/messages";

export type SharePublicHeadline = {
  /** Main page title, e.g. “Lin shared their schedule for next week with you”. */
  headline: string;
  /** Exact shared window, e.g. “Mar 10, 2026 – Mar 16, 2026”. */
  rangeDetail: string;
};

function weekBoundsBerlin(anchor: Date) {
  const zoned = toZonedTime(anchor, SCHEDULE_DISPLAY_TZ);
  return {
    start: startOfWeek(zoned, { weekStartsOn: 1 }),
    end: endOfWeek(zoned, { weekStartsOn: 1 }),
  };
}

function sameBerlinCalendarDay(a: Date, b: Date): boolean {
  return scheduleDateKeyInBerlin(a) === scheduleDateKeyInBerlin(b);
}

function rangeMatchesWeek(rangeStart: Date, rangeEnd: Date, weekStart: Date, weekEnd: Date): boolean {
  return sameBerlinCalendarDay(rangeStart, weekStart) && sameBerlinCalendarDay(rangeEnd, weekEnd);
}

function formatRangeDetail(rangeStart: Date, rangeEnd: Date, locale: AppLocale): string {
  const tz = SCHEDULE_DISPLAY_TZ;
  const startKey = scheduleDateKeyInBerlin(rangeStart);
  const endKey = scheduleDateKeyInBerlin(rangeEnd);
  const sameYear = startKey.slice(0, 4) === endKey.slice(0, 4);

  if (locale === "zh-CN") {
    const startFmt = formatInTimeZone(rangeStart, tz, sameYear ? "M月d日" : "yyyy年M月d日");
    const endFmt = formatInTimeZone(
      rangeEnd,
      tz,
      sameYear ? "M月d日" : "yyyy年M月d日",
    );
    return `${startFmt} – ${endFmt}`;
  }

  const startFmt = formatInTimeZone(rangeStart, tz, sameYear ? "MMM d" : "MMM d, yyyy");
  const endFmt = formatInTimeZone(rangeEnd, tz, sameYear ? "MMM d, yyyy" : "MMM d, yyyy");
  return `${startFmt} – ${endFmt}`;
}

function resolveRangePhrase(
  rangeStart: Date,
  rangeEnd: Date,
  now: Date,
  locale: AppLocale,
  s: AppMessages["scheduleShare"],
): string {
  const thisWeek = weekBoundsBerlin(now);
  const nextWeek = weekBoundsBerlin(addWeeks(now, 1));

  if (rangeMatchesWeek(rangeStart, rangeEnd, nextWeek.start, nextWeek.end)) {
    return s.publicShareRangeNextWeek;
  }
  if (rangeMatchesWeek(rangeStart, rangeEnd, thisWeek.start, thisWeek.end)) {
    return s.publicShareRangeThisWeek;
  }

  return formatRangeDetail(rangeStart, rangeEnd, locale);
}

export function buildSharePublicHeadline(args: {
  ownerDisplayLabel: string;
  ownerFallback: string;
  rangeStart: Date;
  rangeEnd: Date;
  now?: Date;
  locale: AppLocale;
  messages: AppMessages;
}): SharePublicHeadline {
  const owner = args.ownerDisplayLabel.trim() || args.ownerFallback;
  const now = args.now ?? new Date();
  const s = args.messages.scheduleShare;

  const rangePhrase = resolveRangePhrase(args.rangeStart, args.rangeEnd, now, args.locale, s);
  const headline = formatMessage(s.publicShareHeadline, { name: owner, range: rangePhrase });
  const rangeDetail = formatRangeDetail(args.rangeStart, args.rangeEnd, args.locale);

  return { headline, rangeDetail };
}
