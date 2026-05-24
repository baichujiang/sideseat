"use client";

import { useState } from "react";
import { BookOpen, CalendarClock, MapPin } from "lucide-react";

import type { DayTimelineItem } from "@/components/home/schedule-day-timeline";
import {
  categoryAccentColor,
  categoryBlockSurfaceStyle,
} from "@/lib/calendar/category-visual";
import {
  SCHEDULE_EVENT_CARD_RADIUS,
  SCHEDULE_EVENT_LIST_INNER_PAD,
  SCHEDULE_EVENT_LIST_TIME_CLASS,
  SCHEDULE_EVENT_LIST_TITLE_SIZE,
  SCHEDULE_EVENT_TONE_STYLES,
  scheduleEventRailClass,
  scheduleVisualToneKey,
} from "@/lib/schedule-event-card-tone";
import { isLongOrAllDayTimedMinutes } from "@/lib/calendar/long-calendar-block";
import { cn } from "@/lib/utils";

const LIST_LONG_PRESS_MS = 450;
const LIST_POINTER_SLOP_PX = 14;

function attachListTapOrLongPress(
  e: React.PointerEvent,
  onTap: () => void,
  onLongPress: () => void,
) {
  if (e.pointerType === "mouse" && e.button !== 0) return;
  e.stopPropagation();
  const pointerId = e.pointerId;
  const x0 = e.clientX;
  const y0 = e.clientY;
  let longPressFired = false;
  let timer: number | null = window.setTimeout(() => {
    timer = null;
    longPressFired = true;
    onLongPress();
  }, LIST_LONG_PRESS_MS);

  const clearTimer = () => {
    if (timer != null) {
      window.clearTimeout(timer);
      timer = null;
    }
  };

  const detach = () => {
    document.removeEventListener("pointermove", onMove);
    document.removeEventListener("pointerup", onUp);
    document.removeEventListener("pointercancel", onUp);
  };

  const onMove = (ev: PointerEvent) => {
    if (ev.pointerId !== pointerId) return;
    if (Math.hypot(ev.clientX - x0, ev.clientY - y0) > LIST_POINTER_SLOP_PX) {
      clearTimer();
      detach();
    }
  };

  const onUp = (ev: PointerEvent) => {
    if (ev.pointerId !== pointerId) return;
    clearTimer();
    detach();
    if (!longPressFired) {
      onTap();
    }
  };

  document.addEventListener("pointermove", onMove);
  document.addEventListener("pointerup", onUp);
  document.addEventListener("pointercancel", onUp);
}

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
  onLongPressItem,
}: {
  items: DayTimelineItem[];
  /** Long-press opens edit (calendar) or detail (course). Tap selects row to expand text. */
  onLongPressItem: (item: DayTimelineItem, anchorEl?: HTMLElement | null) => void;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
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
        const useCategory = Boolean(catHex);
        const rowSelected = selectedId === item.id;
        const railStyle = useCategory && catHex ? { backgroundColor: categoryAccentColor(catHex) } : undefined;
        const railClass = scheduleEventRailClass({
          tone,
          highlighted: rowSelected,
          useToneRail: !useCategory,
        });
        return (
          <li key={`${item.kind}-${item.id}`}>
            <button
              type="button"
              onPointerDown={(e) => {
                if (item.id === "__draft-preview__") return;
                attachListTapOrLongPress(
                  e,
                  () => setSelectedId(item.id),
                  () => onLongPressItem(item, e.currentTarget as HTMLElement),
                );
              }}
              onKeyDown={(ev) => {
                if (ev.key === "Enter" || ev.key === " ") {
                  ev.preventDefault();
                  if (item.id === "__draft-preview__") return;
                  onLongPressItem(item, ev.currentTarget as HTMLElement);
                }
              }}
              className={cn(
                "flex w-full items-stretch p-0 text-left transition",
                SCHEDULE_EVENT_CARD_RADIUS,
                rowSelected ? "z-[1] overflow-visible ring-2 ring-[#2563EB]/30 ring-offset-2 ring-offset-background dark:ring-blue-400/35" : "overflow-hidden",
                !useCategory && tone.card,
                !useCategory && rowSelected && tone.cardSelected,
                useCategory && "border border-black/10 shadow-sm dark:border-white/10",
                "hover:brightness-[0.98] active:brightness-95",
              )}
              style={
                useCategory && catHex
                  ? categoryBlockSurfaceStyle(catHex, rowSelected)
                  : undefined
              }
            >
              <span aria-hidden className={railClass} style={railStyle} />
              <span
                className={cn(
                  "flex min-w-0 flex-1 items-start gap-2.5",
                  SCHEDULE_EVENT_LIST_INNER_PAD,
                )}
              >
                {item.source === "course" && item.courseCode?.trim() ? (
                  <span
                    className={cn(
                      "mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border-2 border-blue-600/35 bg-classmates-blue-soft text-[11px] font-bold tabular-nums leading-none text-classmates-blue shadow-sm dark:border-blue-400/40 dark:bg-blue-950/50 dark:text-blue-200",
                    )}
                    aria-hidden
                  >
                    {item.courseShortLabel ?? item.courseCode.trim().slice(0, 3)}
                  </span>
                ) : (
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
                )}
                <span className="min-w-0 flex-1">
                  <span
                    className={cn(
                      SCHEDULE_EVENT_LIST_TIME_CLASS,
                      !useCategory && tone.accentColor,
                    )}
                    style={
                      useCategory && catHex
                        ? { color: rowSelected ? "#ffffff" : categoryAccentColor(catHex) }
                        : undefined
                    }
                  >
                    {formatItemTimeRange(item)}
                  </span>
                  {item.source === "course" && item.courseCode?.trim() ? (
                    <>
                      <span
                        className={cn(
                          "mt-1 block font-bold tabular-nums text-classmates-blue dark:text-blue-200",
                          SCHEDULE_EVENT_LIST_TITLE_SIZE,
                          !rowSelected && "truncate",
                          rowSelected && "whitespace-normal break-words",
                        )}
                      >
                        {item.courseCode.trim()}
                      </span>
                      <span
                        className={cn(
                          "mt-0.5 block font-semibold",
                          SCHEDULE_EVENT_LIST_TITLE_SIZE,
                          tone.title,
                          !rowSelected && "truncate",
                          rowSelected && "whitespace-normal break-words",
                        )}
                      >
                        {item.courseName?.trim() || item.title}
                      </span>
                    </>
                  ) : (
                    <span
                      className={cn(
                        "mt-1 block font-semibold",
                        SCHEDULE_EVENT_LIST_TITLE_SIZE,
                        !useCategory && tone.title,
                        useCategory &&
                          (rowSelected ? "text-white" : "text-[#111827] dark:text-foreground"),
                        !rowSelected && "truncate",
                        rowSelected && "whitespace-normal break-words",
                      )}
                    >
                      {item.title}
                    </span>
                  )}
                  {item.location ? (
                    <span
                      className={cn(
                        "mt-1 flex items-start gap-1 text-xs text-[#111827]/65 dark:text-muted-foreground",
                        !rowSelected && "truncate",
                        rowSelected && "whitespace-normal break-words",
                      )}
                    >
                      <MapPin className="mt-0.5 h-3 w-3 shrink-0 opacity-80" aria-hidden />
                      <span className={cn(!rowSelected && "truncate")}>{item.location}</span>
                    </span>
                  ) : null}
                  {rowSelected && item.note?.trim() ? (
                    <span className="mt-1 block whitespace-normal break-words text-xs text-[#111827]/65 dark:text-muted-foreground">
                      {item.note.trim()}
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
