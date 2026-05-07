import Link from "next/link";
import type { Route } from "next";
import { format } from "date-fns";

import { PresetAvatar } from "@/components/ui/preset-avatar";
import { cn } from "@/lib/utils";

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
  const todayLine = format(nowDate, "EEEE, MMMM d");

  return (
    <header className="flex items-center justify-between gap-3">
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-medium uppercase tracking-[0.1em] text-[#8A94A6] dark:text-muted-foreground/80">
          {todayLine}
        </p>
        <h1
          className={cn(
            "mt-0.5 truncate text-[20px] font-bold leading-tight tracking-tight text-[#111827]",
            "dark:text-foreground",
          )}
        >
          {greeting}, {name}
        </h1>
      </div>
      <Link
        href={"/profile" as Route}
        aria-label="Open profile"
        className={cn(
          "shrink-0 rounded-full p-1.5 -m-1.5 touch-manipulation transition hover:opacity-90 active:opacity-85",
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
    </header>
  );
}

function greetingFor(hour: number): string {
  if (hour < 5) return "Good night";
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}
