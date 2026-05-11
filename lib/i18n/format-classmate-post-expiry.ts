import { format } from "date-fns";
import { enUS } from "date-fns/locale";

import type { AppLocale } from "@/lib/i18n/app-locale";

/**
 * Month + day for Discover post validity chips (`postActiveUntil` `{date}`).
 * zh-CN: `5月11日` (always includes `日`). en: `May 11`.
 */
export function formatClassmatePostExpiryMonthDay(date: Date, locale: AppLocale): string {
  if (locale === "zh-CN") {
    return `${date.getMonth() + 1}月${date.getDate()}日`;
  }
  return format(date, "MMM d", { locale: enUS });
}

/**
 * Full calendar date for post detail / My posts expiry lines.
 * zh-CN: `2026年5月11日`. en: `May 11, 2026`.
 */
export function formatClassmatePostExpiryFullDate(date: Date, locale: AppLocale): string {
  if (locale === "zh-CN") {
    return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
  }
  return format(date, "MMM d, yyyy", { locale: enUS });
}
