"use client";

import { BookOpen, CalendarClock, MapPin } from "lucide-react";

import type { DayTimelineItem } from "@/components/home/schedule-day-timeline";
import {
  SCHEDULE_EVENT_TONE_STYLES,
  scheduleVisualToneKey,
} from "@/lib/schedule-event-card-tone";
import { isLongOrAllDayTimedMinutes } from "@/lib/calendar/long-calendar-block";
import { cn } from "@/lib/utils";

function formatItemTimeRange(item: DayTimelineItem): string {
  if (
    item.kind === "study" &&
    item.source === "calendar" &&
    isLongOrAllDayTimedMinutes(item.startMinute, item.endMinute)
  ) {
    return "All day";
  }
  const fmt = (total: number) => {
    const h = Math.floor(total / 60);
    const m = total % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  };
  return `${fmt(item.startMinute)}–${fmt(item.endMinute)}`;
}

/** Compact list of a single day’s events (for month view — no hour axis). */
export function ScheduleDayEventList({
  items,
  onOpenItem,
}: {
  items: DayTimelineItem[];
  onOpenItem: (item: DayTimelineItem) => void;
}) {
  if (items.length === 0) {
    return (
      <div className="rounded-2xl border border-[#E7E0D6] bg-white/90 px-3 py-3.5 text-center text-[12px] text-[#5F6B7A] shadow-[0_2px_8px_rgba(15,23,42,0.04)] dark:border-border dark:bg-card/80 dark:text-muted-foreground">
        No events this day
      </div>
    );
  }

  return (
    <ul className="space-y-2">
      {items.map((item) => {
        const isStudy = item.kind === "study";
        const toneKey = scheduleVisualToneKey({
          source: item.source,
          kind: isStudy ? "study" : "class",
          title: item.title,
        });
        const tone = SCHEDULE_EVENT_TONE_STYLES[toneKey];
        const Icon = isStudy ? CalendarClock : BookOpen;
        const catHex = item.source === "calendar" ? item.categoryColor?.trim() : undefined;
        const railStyle = catHex ? { backgroundColor: catHex } : undefined;
        const railClass = cn(
          "w-1 shrink-0 self-stretch rounded-l-2xl",
          !catHex && tone.rail,
        );
        return (
          <li key={`${item.kind}-${item.id}`}>
            <button
              type="button"
              onClick={() => onOpenItem(item)}
              className={cn(
                "flex w-full items-stretch overflow-hidden rounded-2xl p-0 text-left transition",
                tone.card,
                "hover:brightness-[0.98] active:brightness-95",
              )}
            >
              <span aria-hidden className={railClass} style={railStyle} />
              <span className="flex min-w-0 flex-1 items-start gap-2.5 px-3 py-2">
                <span
                  className={cn(
                    "mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-current",
                    item.source === "course"
                      ? "border-2 border-blue-600/35 bg-classmates-blue-soft shadow-sm dark:border-blue-400/40 dark:bg-blue-950/50"
                      : null,
                    tone.accentColor,
                  )}
                >
                  {item.source === "course" && item.courseShortLabel ? (
                    <span className="text-[12px] font-bold tabular-nums leading-none text-classmates-blue dark:text-blue-200">
                      {item.courseShortLabel}
                    </span>
                  ) : (
                    <Icon className="h-4 w-4" strokeWidth={2.25} aria-hidden />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span
                    className={cn(
                      "block text-xs font-medium tabular-nums leading-none",
                      tone.accentColor,
                    )}
                  >
                    {formatItemTimeRange(item)}
                  </span>
                  <span className={cn("mt-1 block text-sm font-semibold leading-snug", tone.title)}>
                    {item.source === "course" && item.courseName?.trim()
                      ? item.courseName.trim()
                      : item.title}
                  </span>
                  {item.location ? (
                    <span className="mt-1 flex items-center gap-1 truncate text-xs text-[#111827]/65 dark:text-muted-foreground">
                      <MapPin className="h-3 w-3 shrink-0 opacity-80" aria-hidden />
                      <span className="truncate">{item.location}</span>
                    </span>
                  ) : null}
                </span>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
