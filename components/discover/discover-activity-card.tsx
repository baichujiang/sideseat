"use client";

import Link from "next/link";
import type { Route } from "next";
import { CalendarDays, MapPin, Users } from "lucide-react";
import { format } from "date-fns";

import { PresetAvatar } from "@/components/ui/preset-avatar";
import type { DiscoverActivityRow } from "@/lib/discover/discover-activity-row";
import { discoverActivityCategoryLabel, shouldShowActivityCategory } from "@/lib/discover/discover-activity-category-labels";
import { formatMessage } from "@/lib/i18n/messages";
import { useAppMessages } from "@/hooks/use-app-locale";
import { cn } from "@/lib/utils";

export function DiscoverActivityCard({ activity }: { activity: DiscoverActivityRow }) {
  const m = useAppMessages();
  const da = m.discoverActivity;
  const start = new Date(activity.startAtISO);
  const href = `/discover/activities/${activity.id}` as Route;
  const categoryLabel = shouldShowActivityCategory(activity.category)
    ? discoverActivityCategoryLabel(activity.category, da.categories)
    : null;
  const showHeaderRow = Boolean(categoryLabel) || activity.phase === "full";
  const capacityLabel =
    activity.capacity == null
      ? da.capacityUnlimited
      : formatMessage(da.capacityGoing, {
          going: activity.goingCount,
          capacity: activity.capacity,
        });

  return (
    <Link
      href={href}
      className={cn(
        "block rounded-2xl border border-[#E7E0D6] bg-white px-4 py-3.5 shadow-[0_4px_16px_rgba(15,23,42,0.04)] transition",
        "hover:border-classmates-blue-border/60 dark:border-border/80 dark:bg-card",
      )}
    >
      {showHeaderRow ? (
        <div className="mb-1.5 flex items-start justify-between gap-2">
          {categoryLabel ? (
            <span className="inline-flex rounded-full border border-classmates-blue-border/70 bg-classmates-blue-soft px-2.5 py-0.5 text-[11px] font-medium text-classmates-blue">
              {categoryLabel}
            </span>
          ) : (
            <span aria-hidden />
          )}
          {activity.phase === "full" ? (
            <span className="text-[11px] font-semibold text-amber-700 dark:text-amber-400">
              {da.badgeFull}
            </span>
          ) : null}
        </div>
      ) : null}
      <h3 className="text-[15px] font-semibold leading-snug text-foreground">{activity.title}</h3>
      {activity.description?.trim() ? (
        <p className="mt-1 line-clamp-2 text-[13px] leading-snug text-muted-foreground">
          {activity.description.trim()}
        </p>
      ) : null}
      <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[13px] text-muted-foreground">
        <span className="inline-flex min-w-0 items-center gap-1.5">
          <CalendarDays className="h-3.5 w-3.5 shrink-0" aria-hidden />
          <span className="min-w-0 truncate">{format(start, "EEE, d MMM · HH:mm")}</span>
        </span>
        <span className="inline-flex min-w-0 items-center gap-1.5">
          <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden />
          <span className="min-w-0 truncate">{activity.location}</span>
        </span>
      </div>
      <div className="mt-2.5 flex items-center justify-between gap-2 border-t border-border/50 pt-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <PresetAvatar id={activity.organizerAvatarUrl} size={32} className="h-8 w-8 shrink-0" />
          <div className="min-w-0">
            <p className="truncate text-[13px] font-medium leading-tight text-foreground">
              {activity.organizerNickname}
            </p>
            <p className="text-[11px] leading-tight text-muted-foreground">{da.organizerLabel}</p>
          </div>
        </div>
        <span className="inline-flex shrink-0 items-center gap-1 text-[12px] font-medium text-muted-foreground">
          <Users className="h-3.5 w-3.5" aria-hidden />
          {capacityLabel}
        </span>
      </div>
    </Link>
  );
}
