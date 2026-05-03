import Link from "next/link";
import type { Route } from "next";

import { PresetAvatar } from "@/components/ui/preset-avatar";

/**
 * Home hero. Replaces the old profile-preview card with a greeting that
 * makes Home feel contextual instead of static.
 *
 * Layout:
 *   ┌──────────────────────────────┐
 *   │ Good afternoon, Lin     [av] │
 *   │ 2 classes left today         │
 *   └──────────────────────────────┘
 *
 * The avatar is a small tap target (40 px) tucked into the corner — the
 * dedicated Me tab owns the profile surface, so we don't waste vertical
 * space repeating what users already see in the navbar.
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
    <header className="flex items-center gap-3 pt-1">
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-[22px] font-semibold leading-tight tracking-tight">
          {greeting}, {name}
        </h1>
      </div>
      <Link
        href={"/profile" as Route}
        aria-label="Open profile"
        className="shrink-0 rounded-full ring-1 ring-border/50 transition hover:ring-border active:opacity-85"
      >
        <PresetAvatar id={avatarUrl} size={40} />
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
