import { format, isSameYear, isYesterday } from "date-fns";
import type { Locale } from "date-fns";
import { enUS, zhCN } from "date-fns/locale";

import type { AppLocale } from "@/lib/i18n/app-locale";
import { formatMessage } from "@/lib/i18n/messages";

export type ListRelativeTimeMessages = {
  justNow: string;
  /** `{count}` — minutes, ≥ 1 */
  minutesAgo: string;
  hoursAgoOne: string;
  /** `{count}` — hours, ≥ 2 */
  hoursAgoMany: string;
  yesterday: string;
};

const dateFnsLocales: Record<AppLocale, Locale> = {
  en: enUS,
  "zh-CN": zhCN,
};

function formatMediumCalendarDate(date: Date, locale: AppLocale, base: Date): string {
  const dfLocale = dateFnsLocales[locale] ?? enUS;
  if (locale === "zh-CN") {
    return isSameYear(date, base)
      ? format(date, "M月d日", { locale: dfLocale })
      : format(date, "yyyy年M月d日", { locale: dfLocale });
  }
  return isSameYear(date, base)
    ? format(date, "MMM d", { locale: dfLocale })
    : format(date, "MMM d, yyyy", { locale: dfLocale });
}

/** True when `date` is at most one minute before `base` (same as list “just now” tier). */
export function isListRelativeJustNow(date: Date, base: Date = new Date()): boolean {
  const diffMs = base.getTime() - date.getTime();
  return diffMs >= 0 && diffMs < 60_000;
}

/**
 * Human-readable relative / calendar labels for chat list timestamps and similar UI.
 * Uses wall-clock tiers under 24h, then calendar “yesterday”, then medium local dates.
 */
export function formatListRelativeTime(
  date: Date,
  locale: AppLocale,
  t: ListRelativeTimeMessages,
  base: Date = new Date(),
): string {
  const diffMs = base.getTime() - date.getTime();
  if (diffMs < 0) {
    return formatMediumCalendarDate(date, locale, base);
  }

  const totalMinutes = Math.floor(diffMs / 60_000);
  if (totalMinutes < 1) return t.justNow;
  if (totalMinutes < 60) {
    return formatMessage(t.minutesAgo, { count: totalMinutes });
  }

  const totalHours = Math.floor(totalMinutes / 60);
  if (totalHours < 24) {
    return totalHours === 1 ? t.hoursAgoOne : formatMessage(t.hoursAgoMany, { count: totalHours });
  }

  if (isYesterday(date)) {
    return t.yesterday;
  }

  return formatMediumCalendarDate(date, locale, base);
}
