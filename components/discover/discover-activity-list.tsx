"use client";

import { CalendarDays } from "lucide-react";

import { DiscoverActivityCard } from "@/components/discover/discover-activity-card";
import type { DiscoverActivityRow } from "@/lib/discover/discover-activity-row";
import { useAppMessages } from "@/hooks/use-app-locale";

export function DiscoverActivityList({
  activities,
  filteredEmpty,
}: {
  activities: DiscoverActivityRow[];
  /** True when search/filter removed all rows but supply exists. */
  filteredEmpty?: boolean;
}) {
  const m = useAppMessages();
  const da = m.discoverActivity;

  if (activities.length === 0) {
    return (
      <div className="rounded-2xl border border-[#E7E0D6] bg-white px-4 py-8 text-center shadow-[0_4px_16px_rgba(15,23,42,0.04)] dark:border-border/80 dark:bg-card">
        <span className="mx-auto mb-3 inline-flex h-12 w-12 items-center justify-center rounded-full bg-classmates-blue-soft text-classmates-blue">
          <CalendarDays className="h-5 w-5" strokeWidth={2.25} aria-hidden />
        </span>
        <p className="text-[15px] font-semibold text-foreground">
          {filteredEmpty ? da.filteredEmptyTitle : da.emptyTitle}
        </p>
        <p className="mx-auto mt-2 max-w-[18rem] text-[13px] leading-relaxed text-muted-foreground">
          {filteredEmpty ? da.filteredEmptyBody : da.emptyBody}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {activities.map((activity) => (
        <DiscoverActivityCard key={activity.id} activity={activity} />
      ))}
    </div>
  );
}
