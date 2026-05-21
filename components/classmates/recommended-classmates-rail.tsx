import type { Route } from "next";
import Link from "next/link";

import { PresetAvatar } from "@/components/ui/preset-avatar";
import { VerifiedBadge } from "@/components/ui/verified-badge";
import type { RecommendedClassmateRow } from "@/lib/queries/recommended-classmates";
import { cn } from "@/lib/utils";

function RecommendedClassmateCard({
  row,
  returnTo,
}: {
  row: RecommendedClassmateRow;
  returnTo: string;
}) {
  const profileHref =
    `/users/${row.userId}?returnTo=${encodeURIComponent(returnTo)}` as Route;

  return (
    <Link
      href={profileHref}
      aria-label={`View ${row.nickname}'s profile`}
      className={cn(
        "flex w-max min-w-[4.75rem] max-w-[11rem] shrink-0 flex-col items-center gap-1.5 rounded-2xl border border-[#E7E0D6] bg-white px-3 py-2.5 shadow-[0_2px_10px_rgba(15,23,42,0.04)] transition active:scale-[0.98] active:opacity-90",
        "dark:border-border dark:bg-card dark:shadow-[0_2px_10px_rgba(0,0,0,0.14)]",
        "[@media(hover:hover)]:hover:border-[#D4C9BA] [@media(hover:hover)]:hover:shadow-[0_4px_14px_rgba(15,23,42,0.06)]",
        "dark:[@media(hover:hover)]:hover:border-zinc-600",
      )}
    >
      <PresetAvatar
        id={row.avatarUrl}
        size={52}
        className="shrink-0 ring-2 ring-classmates-blue-soft dark:ring-blue-950/60"
      />
      <span className="flex w-full flex-col items-center gap-0.5">
        <span className="text-center text-[13px] font-semibold leading-snug [overflow-wrap:anywhere] text-classmates-ink dark:text-foreground">
          {row.nickname}
        </span>
        <VerifiedBadge
          size="xs"
          school={row.school}
          verifiedStudent={row.verifiedStudent}
          status={row.studentVerificationStatus}
        />
      </span>
    </Link>
  );
}

export function RecommendedClassmatesRail({
  rows,
  title,
  returnTo,
  className,
}: {
  rows: RecommendedClassmateRow[];
  title: string;
  returnTo: string;
  className?: string;
}) {
  if (rows.length === 0) return null;

  return (
    <section className={cn("space-y-2", className)}>
      <p className="text-[12px] font-semibold tracking-tight text-foreground">{title}</p>
      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {rows.map((row) => (
          <RecommendedClassmateCard key={row.userId} row={row} returnTo={returnTo} />
        ))}
      </div>
    </section>
  );
}
