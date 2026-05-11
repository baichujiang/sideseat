import Link from "next/link";
import type { Route } from "next";
import { format } from "date-fns";

import { PresetAvatar } from "@/components/ui/preset-avatar";
import { cn } from "@/lib/utils";

/** Compact desk-calendar visual for Home (date also exposed via `aria-label`). */
function HomeCalendarVisual({ date }: { date: Date }) {
  const month = format(date, "MMM");
  const dayNum = format(date, "d");
  const weekday = format(date, "EEE");
  const label = format(date, "EEEE, MMMM d, yyyy");

  return (
    <div
      className={cn(
        "pointer-events-none flex w-[5.375rem] shrink-0 select-none flex-col overflow-hidden rounded-2xl border border-blue-200/90 bg-white shadow-[0_3px_14px_rgba(37,99,235,0.14)]",
        "dark:border-blue-800/55 dark:bg-card dark:shadow-[0_3px_14px_rgba(0,0,0,0.22)]",
      )}
      aria-label={label}
      role="img"
    >
      <div className="bg-[#2563EB] px-1.5 py-1.5 text-center text-[11px] font-semibold uppercase tracking-wide text-white dark:bg-blue-500">
        {month}
      </div>
      <div className="flex flex-col items-center justify-center py-2">
        <span className="text-[26px] font-bold leading-none tabular-nums text-[#111827] dark:text-foreground">
          {dayNum}
        </span>
        <span className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-[#8A94A6] dark:text-muted-foreground">
          {weekday}
        </span>
      </div>
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
  const name = nickname?.trim() || "Student";
  const greeting = greetingFor(nowDate.getHours());

  return (
    <header className="flex items-center justify-between gap-3">
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
          aria-label="Open profile"
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
      <HomeCalendarVisual date={nowDate} />
    </header>
  );
}

function greetingFor(hour: number): string {
  if (hour < 5) return "Good night";
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}
