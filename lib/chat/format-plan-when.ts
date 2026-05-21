import { format, isToday, isTomorrow } from "date-fns";
import { enUS, zhCN } from "date-fns/locale";

import type { AppLocale } from "@/lib/i18n/app-locale";

const LOCALE = { en: enUS, "zh-CN": zhCN } as const;

const DAY = {
  en: { today: "Today", tomorrow: "Tomorrow" },
  "zh-CN": { today: "今天", tomorrow: "明天" },
} as const;

/** Compact time range for inbox rows and cards (Berlin-agnostic wall clock from ISO). */
export function formatPlanWhenCompact(
  startISO: string | Date,
  endISO: string | Date,
  appLocale: AppLocale,
): string {
  const start = startISO instanceof Date ? startISO : new Date(startISO);
  const end = endISO instanceof Date ? endISO : new Date(endISO);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return "";

  const loc = LOCALE[appLocale];
  const labels = DAY[appLocale];
  const dayLabel = isToday(start)
    ? labels.today
    : isTomorrow(start)
      ? labels.tomorrow
      : format(start, appLocale === "zh-CN" ? "M月d日 EEE" : "EEE, MMM d", { locale: loc });

  return `${dayLabel} · ${format(start, "HH:mm", { locale: loc })}–${format(end, "HH:mm", { locale: loc })}`;
}
