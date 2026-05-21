"use client";

import {
  WEEK_CALENDAR_VISIBLE_DAY_MAX,
  WEEK_CALENDAR_VISIBLE_DAY_MIN,
  clampWeekCalendarVisibleDayCount,
} from "@/lib/calendar/week-calendar-constants";
import { useLocaleContext } from "@/components/i18n/locale-provider";
import { formatMessage, type AppMessages } from "@/lib/i18n/messages";
import type { AppLocale } from "@/lib/i18n/app-locale";
import { cn } from "@/lib/utils";

export function WeekVisibleDaysBar({
  value,
  onChange,
  scheduleSch,
  locale,
}: {
  value: number;
  onChange: (next: number) => void;
  scheduleSch?: AppMessages["schedule"];
  locale?: AppLocale;
}) {
  const ctx = useLocaleContext();
  const sch = scheduleSch ?? ctx.messages.schedule;
  const loc = locale ?? ctx.locale;

  const safeValue = clampWeekCalendarVisibleDayCount(value);
  const valueTemplate =
    sch.visibleDaysValue ?? (loc === "zh-CN" ? "{count} 天" : "{count} days");
  const valueText = formatMessage(valueTemplate, { count: safeValue });
  const thumbRatio =
    (safeValue - WEEK_CALENDAR_VISIBLE_DAY_MIN) /
    (WEEK_CALENDAR_VISIBLE_DAY_MAX - WEEK_CALENDAR_VISIBLE_DAY_MIN);

  return (
    <div
      className={cn(
        "shrink-0 rounded-xl border border-[#E7E0D6] bg-white px-2 py-1.5 shadow-[0_2px_8px_rgba(15,23,42,0.03)]",
        "dark:border-border dark:bg-card dark:shadow-[0_2px_8px_rgba(0,0,0,0.1)]",
      )}
    >
      <div className="relative h-9 px-[2.125rem]">
        <div
          className="pointer-events-none absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-blue-100 dark:bg-blue-950/40"
          aria-hidden
        />
        <div className="relative h-full w-full">
          <input
            type="range"
            min={WEEK_CALENDAR_VISIBLE_DAY_MIN}
            max={WEEK_CALENDAR_VISIBLE_DAY_MAX}
            step={1}
            value={safeValue}
            aria-label={
              sch.visibleDaysAria ??
              (loc === "zh-CN" ? "周视图显示天数" : "Visible days in week calendar")
            }
            aria-valuetext={valueText}
            onChange={(event) => {
              onChange(clampWeekCalendarVisibleDayCount(Number(event.target.value)));
            }}
            className={cn(
              "absolute inset-0 z-20 m-0 h-full w-full cursor-grab touch-none appearance-none bg-transparent",
              "active:cursor-grabbing",
              "[&::-webkit-slider-runnable-track]:h-1.5 [&::-webkit-slider-runnable-track]:rounded-full",
              "[&::-webkit-slider-runnable-track]:bg-transparent",
              "[&::-webkit-slider-thumb]:appearance-none",
              "[&::-webkit-slider-thumb]:h-9 [&::-webkit-slider-thumb]:w-[4.25rem]",
              "[&::-webkit-slider-thumb]:-mt-[calc(1.125rem-0.1875rem)]",
              "[&::-webkit-slider-thumb]:cursor-grab [&::-webkit-slider-thumb]:opacity-0",
              "[&::-moz-range-track]:h-1.5 [&::-moz-range-track]:rounded-full",
              "[&::-moz-range-track]:bg-transparent",
              "[&::-moz-range-thumb]:h-9 [&::-moz-range-thumb]:w-[4.25rem]",
              "[&::-moz-range-thumb]:cursor-grab [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:opacity-0",
            )}
          />
          <div
            className="pointer-events-none absolute top-1/2 z-10 -translate-y-1/2"
            style={{ left: `${thumbRatio * 100}%` }}
            aria-hidden
          >
            <span
              className={cn(
                "inline-flex w-[4.25rem] -translate-x-1/2 items-center justify-center",
                "rounded-md bg-[#2563EB] px-2 py-1.5 text-[11px] font-semibold leading-none text-white tabular-nums",
                "shadow-[0_2px_8px_rgba(37,99,235,0.35)]",
                "dark:bg-blue-500",
              )}
            >
              {valueText}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
