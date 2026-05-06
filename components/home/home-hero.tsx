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
    <header className="flex items-start justify-between gap-3">
      <div className="min-w-0 flex-1 pr-1">
        <h1
          className={cn(
            "truncate text-[30px] font-bold leading-[1.12] tracking-tight text-[#111827]",
            "sm:text-[32px] dark:text-foreground",
          )}
        >
          {greeting}, {name}
        </h1>
        <p
          className={cn(
            "mt-1 text-sm leading-snug text-[#5F6B7A]",
            "dark:text-muted-foreground",
          )}
        >
          Plan your day and keep track of study sessions.
        </p>
        <p
          className={cn(
            "mt-1 text-xs font-medium leading-tight text-[#8A94A6]",
            "dark:text-muted-foreground/90",
          )}
        >
          {todayLine}
        </p>
      </div>
      <Link
        href={"/profile" as Route}
        aria-label="Open profile"
        className="shrink-0 rounded-full transition hover:opacity-90 active:opacity-85"
      >
        <span
          className={cn(
            "inline-flex h-16 w-16 items-center justify-center overflow-hidden rounded-full",
            "border border-[#E7E0D6] bg-white shadow-[0_4px_14px_rgba(15,23,42,0.08)]",
            "dark:border-border dark:bg-card dark:shadow-[0_4px_14px_rgba(0,0,0,0.25)]",
          )}
        >
          <PresetAvatar id={avatarUrl} size={64} className="h-16 w-16" />
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
