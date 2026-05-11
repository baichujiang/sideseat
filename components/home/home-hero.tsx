"use client";

import Link from "next/link";
import type { Route } from "next";
import { format } from "date-fns";
import { enUS, zhCN } from "date-fns/locale";

import { useLocaleContext } from "@/components/i18n/locale-provider";
import { PresetAvatar } from "@/components/ui/preset-avatar";
import type { AppMessages } from "@/lib/i18n/messages";
import { cn } from "@/lib/utils";

/** Compact desk-calendar visual for Home (date also exposed via `aria-label`). */
export function HomeCalendarVisual({
  date,
  className,
}: {
  date: Date;
  className?: string;
}) {
  const { locale } = useLocaleContext();
  const dfLocale = locale === "zh-CN" ? zhCN : enUS;
  const month = format(date, "MMM", { locale: dfLocale });
  const dayNum = format(date, "d");
  const weekday = format(date, "EEE", { locale: dfLocale });
  const label = format(date, "PPPP", { locale: dfLocale });

  return (
    <div
      className={cn(
        "pointer-events-none flex aspect-square h-20 w-20 shrink-0 select-none flex-col overflow-hidden rounded-xl border border-blue-200/90 bg-white shadow-[0_2px_10px_rgba(37,99,235,0.12)]",
        "dark:border-blue-800/55 dark:bg-card dark:shadow-[0_2px_10px_rgba(0,0,0,0.2)]",
        className,
      )}
      aria-label={label}
      role="img"
    >
      <div className="shrink-0 bg-[#2563EB] px-2 py-1.5 text-center text-[13px] font-semibold uppercase leading-none tracking-wide text-white dark:bg-blue-500">
        {month}
      </div>
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-1 py-1.5">
        <span className="text-[28px] font-bold leading-none tabular-nums text-[#111827] dark:text-foreground">
          {dayNum}
        </span>
        <span className="mt-1 text-[10px] font-semibold uppercase leading-none tracking-wide text-[#8A94A6] dark:text-muted-foreground">
          {weekday}
        </span>
      </div>
    </div>
  );
}

function greetingForHour(hour: number, home: AppMessages["home"]): string {
  if (hour < 5) return home.greetingNight;
  if (hour < 12) return home.greetingMorning;
  if (hour < 18) return home.greetingAfternoon;
  return home.greetingEvening;
}

/**
 * Greeting line + profile shortcut (used on Home inside the schedule header row).
 */
export function HomeGreetingHeading({
  nickname,
  avatarUrl,
  nowDate,
}: {
  nickname: string | null;
  avatarUrl: string | null;
  nowDate: Date;
}) {
  const { messages } = useLocaleContext();
  const name = nickname?.trim() || messages.common.studentFallback;
  const greeting = greetingForHour(nowDate.getHours(), messages.home);

  return (
    <div className="flex min-w-0 flex-1 items-center justify-start gap-1.5">
      <h1
        className={cn(
          "min-w-0 shrink truncate text-[20px] font-bold leading-tight tracking-tight text-[#111827]",
          "dark:text-foreground",
        )}
      >
        {greeting}, {name}
      </h1>
      <Link
        href={"/profile" as Route}
        aria-label={messages.home.openProfileAria}
        className={cn(
          "shrink-0 rounded-full p-1 -m-1 touch-manipulation transition hover:opacity-90 active:opacity-85",
          "inline-flex items-center justify-center",
        )}
      >
        <span
          className={cn(
            "inline-flex h-14 w-14 items-center justify-center overflow-hidden rounded-full",
            "border border-[#E7E0D6] bg-white shadow-[0_2px_8px_rgba(15,23,42,0.08)]",
            "dark:border-border dark:bg-card dark:shadow-[0_2px_8px_rgba(0,0,0,0.25)]",
          )}
        >
          <PresetAvatar id={avatarUrl} size={56} className="h-14 w-14" />
        </span>
      </Link>
    </div>
  );
}

/**
 * Home hero — contextual greeting + light hint toward the schedule below.
 *
 * `nowDate` is injected so the server can render with a stable "now"
 * snapshot; the greeting is computed from the user's local hour.
 */
export function HomeHero({
  nickname,
  avatarUrl,
  nowDate,
}: {
  nickname: string | null;
  avatarUrl: string | null;
  nowDate: Date;
}) {
  return (
    <header className="flex items-center justify-between gap-3">
      <HomeGreetingHeading nickname={nickname} avatarUrl={avatarUrl} nowDate={nowDate} />
      <HomeCalendarVisual date={nowDate} />
    </header>
  );
}
