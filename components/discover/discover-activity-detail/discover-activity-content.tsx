"use client";

import { format } from "date-fns";
import { CalendarDays, MapPin, Users } from "lucide-react";

import { PresetAvatar } from "@/components/ui/preset-avatar";
import type { DiscoverActivityRow } from "@/lib/discover/discover-activity-row";
import { discoverActivityCategoryLabel, shouldShowActivityCategory } from "@/lib/discover/discover-activity-category-labels";
import { formatMessage } from "@/lib/i18n/messages";
import { useAppMessages } from "@/hooks/use-app-locale";
import { cn } from "@/lib/utils";

export function DiscoverActivityContent({
  activity,
  goingAttendees,
}: {
  activity: DiscoverActivityRow;
  goingAttendees: Array<{ userId: string; nickname: string; avatarUrl: string | null }>;
}) {
  const da = useAppMessages().discoverActivity;
  const start = new Date(activity.startAtISO);
  const end = new Date(activity.endAtISO);
  const categoryLabel = shouldShowActivityCategory(activity.category)
    ? discoverActivityCategoryLabel(activity.category, da.categories)
    : null;
  const capacityLabel =
    activity.capacity == null
      ? formatMessage(da.goingCountUnlimited, { count: activity.goingCount })
      : formatMessage(da.goingCountCapped, {
          count: activity.goingCount,
          capacity: activity.capacity,
        });

  return (
    <div className="space-y-4">
      <div>
        {categoryLabel ? (
          <span className="inline-flex rounded-full border border-classmates-blue-border/70 bg-classmates-blue-soft px-2.5 py-0.5 text-[11px] font-medium text-classmates-blue">
            {categoryLabel}
          </span>
        ) : null}
        <h1 className={cn("text-[22px] font-bold leading-tight text-foreground", categoryLabel && "mt-2")}>
          {activity.title}
        </h1>
      </div>

      <div className="rounded-2xl border border-border/70 bg-card/50 px-4 py-3">
        <p className="text-[11px] font-medium text-muted-foreground">{da.detailDescription}</p>
        <p className="mt-1.5 whitespace-pre-wrap text-[14px] leading-relaxed text-foreground">
          {activity.description?.trim() ? activity.description.trim() : da.detailDescriptionEmpty}
        </p>
      </div>

      <div className="rounded-2xl border border-border/70 bg-card/50 px-4 py-3 space-y-2.5">
        <Row icon={CalendarDays} label={da.detailWhen} value={`${format(start, "EEE, d MMM · HH:mm")} – ${format(end, "HH:mm")}`} />
        <Row icon={MapPin} label={da.detailWhere} value={activity.location} />
        <Row icon={Users} label={da.detailAttendees} value={capacityLabel} />
      </div>

      <div className="rounded-2xl border border-border/70 bg-card/50 px-4 py-3">
        <p className="mb-2 text-[11px] font-medium text-muted-foreground">{da.detailOrganizer}</p>
        <div className="flex items-center gap-3">
          <PresetAvatar id={activity.organizerAvatarUrl} size={48} className="h-12 w-12 shrink-0" />
          <p className="text-[15px] font-semibold text-foreground">{activity.organizerNickname}</p>
        </div>
      </div>

      {goingAttendees.length > 0 ? (
        <div className="rounded-2xl border border-border/70 bg-card/50 px-4 py-3">
          <p className="mb-2 text-[11px] font-medium text-muted-foreground">{da.detailGoingList}</p>
          <ul className="space-y-2">
            {goingAttendees.map((a) => (
              <li key={a.userId} className="flex items-center gap-2">
                <PresetAvatar id={a.avatarUrl} size={32} className="h-8 w-8 shrink-0" />
                <span className="text-[13px] font-medium text-foreground">{a.nickname}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function Row({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof CalendarDays;
  label: string;
  value: string;
}) {
  return (
    <div className="flex gap-2.5">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
      <div className="min-w-0">
        <p className="text-[11px] font-medium text-muted-foreground">{label}</p>
        <p className="text-[14px] text-foreground">{value}</p>
      </div>
    </div>
  );
}
