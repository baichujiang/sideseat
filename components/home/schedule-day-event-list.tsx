"use client";

import { BookOpen, CalendarClock, MapPin } from "lucide-react";

import type { DayTimelineItem } from "@/components/home/schedule-day-timeline";
import {
  inferScheduleEventToneKey,
  SCHEDULE_EVENT_TONE_STYLES,
} from "@/lib/schedule-event-card-tone";
import { cn } from "@/lib/utils";

function formatRange(startMinute: number, endMinute: number) {
  const fmt = (total: number) => {
    const h = Math.floor(total / 60);
    const m = total % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  };
  return `${fmt(startMinute)}–${fmt(endMinute)}`;
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
        const toneKey = inferScheduleEventToneKey({
          kind: isStudy ? "study" : "class",
          title: item.title,
        });
        const tone = SCHEDULE_EVENT_TONE_STYLES[toneKey];
        const Icon = isStudy ? CalendarClock : BookOpen;
        const catHex = item.categoryColor?.trim();
        return (
          <li key={`${item.kind}-${item.id}`}>
            <button
              type="button"
              onClick={() => onOpenItem(item)}
              className={cn(
                "flex w-full items-start gap-2.5 px-3 py-2 text-left transition",
                tone.card,
                catHex && "border-l-[3px]",
                "hover:brightness-[0.98] active:brightness-95",
              )}
              style={catHex ? { borderLeftColor: catHex } : undefined}
            >
              <span
                className={cn(
                  "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-current",
                  tone.accentColor,
                )}
              >
                <Icon className="h-4 w-4" strokeWidth={2.25} aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span
                  className={cn(
                    "block text-xs font-medium tabular-nums leading-none",
                    tone.accentColor,
                  )}
                >
                  {formatRange(item.startMinute, item.endMinute)}
                </span>
                <span className={cn("mt-1 block text-sm font-semibold leading-snug", tone.title)}>
                  {item.title}
                </span>
                {item.location ? (
                  <span className="mt-1 flex items-center gap-1 truncate text-xs text-[#111827]/65 dark:text-muted-foreground">
                    <MapPin className="h-3 w-3 shrink-0 opacity-80" aria-hidden />
                    <span className="truncate">{item.location}</span>
                  </span>
                ) : null}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
