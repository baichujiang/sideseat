import Link from "next/link";
import type { Route } from "next";
import { CalendarClock, Sparkles, SquarePen } from "lucide-react";

import { cn } from "@/lib/utils";

function CountBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  const label = count > 99 ? "99+" : String(count);
  return (
    <span className="flex min-h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-[#F43F5E] px-1.5 text-[11px] font-semibold leading-none text-white">
      {label}
    </span>
  );
}

function CountText({ count }: { count: number }) {
  return <span className="text-[12px] font-semibold text-current/80">{count}</span>;
}

export function InboxQuickChips({
  unreadTotal,
  plansNeedingYourAction,
  activePostCount,
}: {
  unreadTotal: number;
  plansNeedingYourAction: number;
  activePostCount: number;
}) {
  return (
    <section className="grid grid-cols-3 gap-2">
      <Link
        href={"/inbox/unread" as Route}
        title="Chats with new messages and plan invites to respond to"
        aria-label={`New messages${unreadTotal > 0 ? `, ${unreadTotal} total` : ""}. Open filtered list.`}
        className={cn(
          "inline-flex h-10 w-full items-center justify-between gap-1.5 rounded-full border border-classmates-blue-border/80 bg-classmates-blue-soft px-3 py-2 text-sm font-semibold text-classmates-blue-body transition-opacity active:opacity-80",
          "[@media(hover:hover)]:hover:opacity-90 dark:border-blue-800/50 dark:bg-blue-950/35 dark:text-blue-100",
        )}
      >
        <span className="inline-flex items-center gap-1.5">
          <Sparkles className="h-[18px] w-[18px] shrink-0 text-[#2563EB]" strokeWidth={2} aria-hidden />
          <span className="whitespace-nowrap">New</span>
        </span>
        <CountBadge count={unreadTotal} />
      </Link>

      <Link
        href={"/inbox/plans" as Route}
        className={cn(
          "inline-flex h-10 w-full items-center justify-between gap-1.5 rounded-full border border-classmates-teal-border/70 bg-classmates-teal-soft px-3 py-2 text-sm font-semibold text-classmates-teal transition-colors active:bg-teal-50/90",
          "[@media(hover:hover)]:hover:bg-teal-50 dark:border-teal-800/60 dark:bg-teal-950/40 dark:text-teal-100 dark:active:bg-teal-950/55 [@media(hover:hover)]:dark:hover:bg-teal-950/50",
        )}
      >
        <span className="inline-flex items-center gap-1.5">
          <CalendarClock className="h-[18px] w-[18px] shrink-0 text-[#0F766E]" strokeWidth={2} aria-hidden />
          <span className="whitespace-nowrap">Plans</span>
        </span>
        <CountText count={plansNeedingYourAction} />
      </Link>

      <Link
        href={"/inbox/my-posts" as Route}
        className={cn(
          "inline-flex h-10 w-full items-center justify-between gap-1.5 rounded-full border border-[#E7E0D6] bg-white px-3 py-2 text-sm font-semibold text-[#5F6B7A] transition-colors active:bg-[#FAF9F6]",
          "[@media(hover:hover)]:hover:bg-[#FAF9F6] dark:border-border dark:bg-card dark:text-zinc-300 dark:active:bg-muted/40 [@media(hover:hover)]:dark:hover:bg-muted/30",
        )}
      >
        <span className="inline-flex items-center gap-1.5">
          <SquarePen className="h-[18px] w-[18px] shrink-0 text-[#D97706]" strokeWidth={2} aria-hidden />
          <span className="whitespace-nowrap">Posts</span>
        </span>
        <CountText count={activePostCount} />
      </Link>
    </section>
  );
}
