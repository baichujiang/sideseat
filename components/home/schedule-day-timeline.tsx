"use client";
import type { CalendarRepeatRule } from "@prisma/client";
import { addMinutes } from "date-fns";
import { BookOpen, CalendarClock, MapPin } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import {
  categoryAccentColor,
  categoryBlockSurfaceStyle,
} from "@/lib/calendar/category-visual";
import { computeEventOverlapLayout } from "@/lib/calendar/event-overlap-layout";
import {
  inferScheduleEventToneKey,
  SCHEDULE_EVENT_TONE_STYLES,
} from "@/lib/schedule-event-card-tone";
import { isLongOrAllDayTimedMinutes } from "@/lib/calendar/long-calendar-block";
import { cn } from "@/lib/utils";

/**
 * A single item on a day timeline. Same shape as the old list view so the
 * parent can feed it either renderer without rebuilding the data.
 */
export type DayTimelineItem = {
  id: string;
  kind: "class" | "study";
  source: "course" | "calendar";
  startMinute: number;
  endMinute: number;
  title: string;
  location: string | null;
  withLabel?: string | null;
  note?: string | null;
  repeatLabel?: string | null;
  repeatRule?: CalendarRepeatRule;
  repeatUntilISO?: string | null;
  eventParticipants?: Array<{ userId: string | null; name: string }>;
  courseId?: string | null;
  categoryId?: string | null;
  categoryName?: string | null;
  categoryColor?: string | null;
};

function isAllDayStyleTimelineItem(item: DayTimelineItem): boolean {
  return (
    item.kind === "study" &&
    item.source === "calendar" &&
    isLongOrAllDayTimedMinutes(item.startMinute, item.endMinute)
  );
}

const MINUTE_PX = 0.72;
const VISUAL_PADDING_MINUTES = 30;
const FULL_DAY_MINUTES = 24 * 60;
/** Initial scroll window: 08:00–20:00 (content still spans −0:30…24:30 for label clearance). */
const DEFAULT_VIEW_START = 8 * 60;
const DEFAULT_VIEW_END = 20 * 60;
const TIME_COL_PX = 60;

/**
 * Day-view timeline. A single-column version of the week grid: hour axis on
 * the left, events positioned and sized proportionally on the right. This
 * is strictly better than the list form for two things the list can't do:
 *
 *   1. Show gaps between events ("where am I free?"). Empty ~4-hour stretches
 *      are visible at a glance.
 *   2. Handle "empty day" gracefully — even with no events, the axis gives
 *      the eye a structure, and the now-line tells you where "right now"
 *      sits in the emptiness.
 *
 * Tradeoff: it's taller than a list. We mitigate with a compact pixel/min
 * ratio (0.9) and auto-fit to the content envelope ±hour padding.
 */
export function ScheduleDayTimeline({
  items,
  isToday,
  nowMinute,
  date,
  onCreateEvent,
  onOpenItem,
}: {
  items: DayTimelineItem[];
  /** Whether the day being viewed is "today" — gates now-line + state styling. */
  isToday: boolean;
  nowMinute: number;
  date: Date;
  onCreateEvent?: (start: Date, end: Date) => void;
  onOpenItem?: (item: DayTimelineItem) => void;
}) {
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const holdTimerRef = useRef<number | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const visualStartMinute = -VISUAL_PADDING_MINUTES;
  const visualEndMinute = FULL_DAY_MINUTES + VISUAL_PADDING_MINUTES;
  const totalMinutes = visualEndMinute - visualStartMinute;

  const hourLabels: number[] = [];
  for (let m = 0; m <= FULL_DAY_MINUTES; m += 60) hourLabels.push(m);

  const fullHeight = totalMinutes * MINUTE_PX;
  const viewportHeight =
    (DEFAULT_VIEW_END - DEFAULT_VIEW_START + VISUAL_PADDING_MINUTES * 2) * MINUTE_PX;

  useEffect(() => {
    const node = scrollRef.current;
    if (!node) return;
    node.scrollTop =
      (DEFAULT_VIEW_START - VISUAL_PADDING_MINUTES - visualStartMinute) * MINUTE_PX;
  }, [date, visualStartMinute]);

  const hasNowLine =
    isToday && nowMinute >= 0 && nowMinute <= FULL_DAY_MINUTES;

  const allDayItems = items.filter(isAllDayStyleTimelineItem);
  const timedItems = items.filter((i) => !isAllDayStyleTimelineItem(i));

  function clearHoldTimer() {
    if (holdTimerRef.current !== null) {
      window.clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
  }

  function startMouseHold(clientY: number, rect: DOMRect) {
    if (!onCreateEvent) return;
    clearHoldTimer();
    holdTimerRef.current = window.setTimeout(() => {
      createFromPointer(clientY, rect);
      holdTimerRef.current = null;
    }, 380);
  }

  function createFromPointer(clientY: number, rect: DOMRect) {
    if (!onCreateEvent) return;
    const y = clientY - rect.top;
    const rawMinute = visualStartMinute + (y / rect.height) * totalMinutes;
    const snappedMinute = Math.max(
      0,
      Math.min(FULL_DAY_MINUTES - 60, Math.round(rawMinute / 60) * 60),
    );
    const start = new Date(date);
    start.setHours(0, snappedMinute, 0, 0);
    const end = addMinutes(start, 60);
    onCreateEvent(start, end);
  }

  const positionedItems = computeTimelineColumns(timedItems);

  return (
    <div
      className={cn(
        "mt-4 overflow-hidden rounded-2xl border border-[#E7E0D6] bg-white p-2 shadow-[0_8px_24px_rgba(15,23,42,0.05)]",
        "dark:border-border dark:bg-card dark:shadow-[0_8px_24px_rgba(0,0,0,0.12)]",
      )}
    >
      {allDayItems.length > 0 ? (
        <div className="mb-2 flex flex-col gap-1.5 rounded-xl border border-[#F0ECE6] bg-[#FAFAF8] px-2.5 py-2 dark:border-white/[0.08] dark:bg-muted/25">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            All day
          </p>
          <div className="flex flex-wrap gap-1.5">
            {allDayItems.map((item) => {
              const isStudy = item.kind === "study";
              const toneKey = inferScheduleEventToneKey({
                kind: isStudy ? "study" : "class",
                title: item.title,
              });
              const tone = SCHEDULE_EVENT_TONE_STYLES[toneKey];
              const catHex = item.categoryColor?.trim();
              const useCategory = Boolean(catHex);
              return (
                <button
                  key={`${item.kind}-${item.id}`}
                  type="button"
                  onClick={() => {
                    if (item.id === "__draft-preview__") return;
                    setSelectedItemId(item.id);
                    onOpenItem?.(item);
                  }}
                  className={cn(
                    "max-w-full truncate rounded-lg px-2.5 py-1.5 text-left text-[12px] font-semibold leading-snug transition",
                    "hover:brightness-[0.98] active:brightness-95",
                    !useCategory && tone.card,
                    useCategory && "border border-black/10 shadow-sm dark:border-white/10",
                  )}
                  style={
                    useCategory && catHex ? categoryBlockSurfaceStyle(catHex, false) : undefined
                  }
                >
                  {item.title}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
      <div
        ref={scrollRef}
        className="overflow-y-auto overscroll-contain"
        style={{ height: `${viewportHeight}px` }}
      >
        <>
          <div
            className="relative grid"
            style={{
              gridTemplateColumns: `${TIME_COL_PX}px minmax(0, 1fr)`,
              height: `${fullHeight}px`,
            }}
          >
          <div
            className="relative cursor-default border-r border-[#F0ECE6] bg-[#FAF9F6] dark:border-white/[0.08] dark:bg-muted/25"
            onClick={() => setSelectedItemId(null)}
          >
            {hourLabels.map((m) => {
              const hiddenByNow =
                hasNowLine && Math.abs(m - nowMinute) < 28;
              if (hiddenByNow) return null;
              const top = ((m - visualStartMinute) / totalMinutes) * 100;
              return (
                <div
                  key={m}
                  className="pointer-events-none absolute inset-x-0 -translate-y-1/2 px-1.5 text-right tabular-nums"
                  style={{ top: `${top}%` }}
                >
                  <span className="text-xs font-medium text-[#5F6B7A] dark:text-muted-foreground">
                    {m === FULL_DAY_MINUTES ? "24:00" : formatHM(m)}
                  </span>
                </div>
              );
            })}

            {hasNowLine ? (
              <div
                className="pointer-events-none absolute inset-x-0 z-20 -translate-y-1/2 px-1 text-right tabular-nums"
                style={{ top: `${((nowMinute - visualStartMinute) / totalMinutes) * 100}%` }}
              >
                <span className="inline-block rounded-full bg-[#E53935] px-2 py-0.5 text-[11px] font-semibold tabular-nums leading-none text-white shadow-sm dark:bg-red-500">
                  {formatHM(nowMinute)}
                </span>
              </div>
            ) : null}
          </div>

          <div className="relative border-l border-[#F3EFE8] bg-white/90 dark:border-white/[0.07] dark:bg-card/80">
            <button
              type="button"
              aria-label="Create event"
              onClick={() => setSelectedItemId(null)}
              onDoubleClick={(event) => {
                createFromPointer(
                  event.clientY,
                  event.currentTarget.getBoundingClientRect(),
                );
              }}
              onTouchStart={(event) => {
                if (!onCreateEvent) return;
                const touch = event.touches[0];
                const rect = event.currentTarget.getBoundingClientRect();
                clearHoldTimer();
                holdTimerRef.current = window.setTimeout(() => {
                  createFromPointer(touch.clientY, rect);
                  holdTimerRef.current = null;
                }, 380);
              }}
              onTouchMove={clearHoldTimer}
              onTouchEnd={clearHoldTimer}
              onTouchCancel={clearHoldTimer}
              onMouseDown={(event) => {
                startMouseHold(
                  event.clientY,
                  event.currentTarget.getBoundingClientRect(),
                );
              }}
              onMouseUp={clearHoldTimer}
              onMouseLeave={clearHoldTimer}
              className="absolute inset-0 z-0 cursor-default"
            />

            {hourLabels.map((m) => {
              const top = ((m - visualStartMinute) / totalMinutes) * 100;
              return (
                <div
                  key={m}
                  className="pointer-events-none absolute left-0 right-0 border-t border-[#F0ECE6] dark:border-white/[0.08]"
                  style={{ top: `${top}%` }}
                />
              );
            })}

            {hasNowLine ? (
              <div
                className="pointer-events-none absolute inset-x-0 z-20"
                style={{
                  top: `${((nowMinute - visualStartMinute) / totalMinutes) * 100}%`,
                }}
              >
                <div className="relative h-0 w-full -translate-y-1/2">
                  <span
                    className="absolute left-0 top-1/2 -translate-y-1/2 border-y-[4px] border-y-transparent border-l-[6px] border-l-[#E53935] dark:border-l-red-400"
                    aria-hidden
                  />
                  <div className="absolute left-2 right-0 top-1/2 h-px -translate-y-1/2 bg-[#E53935]/90 dark:bg-red-400/90" />
                </div>
              </div>
            ) : null}

            {timedItems.length === 0 ? (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-4 text-center">
                <p className="rounded-full bg-muted/70 px-3 py-1 text-[11px] font-medium text-muted-foreground">
                  {allDayItems.length > 0
                    ? "No timed events — see All day above"
                    : isToday
                      ? "Nothing scheduled today"
                      : "Nothing scheduled"}
                </p>
              </div>
            ) : null}

            {positionedItems.map((item) => (
              <TimelineBlock
                key={`${item.kind}-${item.id}`}
                item={item}
                dayStart={visualStartMinute}
                totalMinutes={totalMinutes}
                columnIndex={item.columnIndex}
                columnCount={item.columnCount}
                stackDepth={item.stackDepth}
                hasShortOverlap={item.hasShortOverlap}
                isToday={isToday}
                nowMinute={nowMinute}
                selected={selectedItemId === item.id}
                onSelect={() => {
                  if (item.id === "__draft-preview__") return;
                  setSelectedItemId(item.id);
                  onOpenItem?.(item);
                }}
              />
            ))}
          </div>
        </div>
        <div className="h-24 shrink-0" aria-hidden />
        </>
      </div>
    </div>
  );
}

function TimelineBlock({
  item,
  dayStart,
  totalMinutes,
  columnIndex,
  columnCount,
  stackDepth,
  hasShortOverlap,
  isToday,
  nowMinute,
  selected,
  onSelect,
}: {
  item: DayTimelineItem;
  dayStart: number;
  totalMinutes: number;
  columnIndex: number;
  columnCount: number;
  stackDepth: number;
  hasShortOverlap: boolean;
  isToday: boolean;
  nowMinute: number;
  selected: boolean;
  onSelect: () => void;
}) {
  const top = ((item.startMinute - dayStart) / totalMinutes) * 100;
  const height = ((item.endMinute - item.startMinute) / totalMinutes) * 100;

  const state: "past" | "ongoing" | "upcoming" = !isToday
    ? "upcoming"
    : item.endMinute <= nowMinute
      ? "past"
      : item.startMinute <= nowMinute
        ? "ongoing"
        : "upcoming";

  const isStudy = item.kind === "study";
  const Icon = isStudy ? CalendarClock : BookOpen;

  const toneKey = inferScheduleEventToneKey({
    kind: isStudy ? "study" : "class",
    title: item.title,
  });
  const tone = SCHEDULE_EVENT_TONE_STYLES[toneKey];
  const isDraftNewTone = toneKey === "draftNew";
  const catHex = item.categoryColor?.trim();
  const useCategoryColor = Boolean(catHex);
  const toneClass = cn(
    "absolute overflow-hidden rounded-2xl px-2 py-1.5 text-left transition",
    !useCategoryColor && (selected ? tone.cardSelected : tone.card),
    useCategoryColor && "shadow-sm",
    state === "past" ? "opacity-55" : undefined,
    state === "ongoing"
      ? "ring-2 ring-[#E53935]/30 ring-offset-1 ring-offset-background dark:ring-red-400/35"
      : undefined,
    "hover:brightness-[0.98] active:brightness-95",
  );

  // Minimum visual height so a 30-min block doesn't collapse into illegibility.
  // We cap at what fits instead of overflowing.
  const minHeightPct = Math.min(4, height);
  const effectiveHeight = Math.max(height, minHeightPct);
  const showTimeRow = effectiveHeight > 0;
  const showLocationRow = effectiveHeight > 9 && item.location;
  const showWithRow = effectiveHeight > 11 && item.withLabel;

  const metaCls = cn(
    "truncate text-xs",
    useCategoryColor
      ? selected
        ? "text-white/85"
        : "text-[#111827]/65 dark:text-muted-foreground"
      : selected && !isDraftNewTone
        ? "text-white/80"
        : "text-[#111827]/65 dark:text-muted-foreground",
  );

  const inner = (
    <>
      {showTimeRow ? (
        <p
          className={cn(
            "truncate text-left text-[12px] font-medium tabular-nums leading-none",
            !useCategoryColor && (selected ? tone.accentColorSelected : tone.accentColor),
          )}
          style={
            useCategoryColor && catHex
              ? { color: selected ? "#ffffff" : categoryAccentColor(catHex) }
              : undefined
          }
        >
          {formatHM(item.startMinute)}
        </p>
      ) : null}
      <div className="mt-0.5 flex min-h-0 items-center gap-1.5">
        <Icon
          className={cn(
            "h-3.5 w-3.5 shrink-0",
            !useCategoryColor && (selected ? tone.accentColorSelected : tone.accentColor),
          )}
          style={
            useCategoryColor && catHex
              ? { color: selected ? "#ffffff" : categoryAccentColor(catHex) }
              : undefined
          }
          strokeWidth={2.25}
        />
        <p
          className={cn(
            "min-w-0 flex-1 truncate text-left text-[13px] font-bold leading-snug",
            !useCategoryColor && (selected ? tone.titleSelected : tone.title),
            useCategoryColor && (selected ? "text-white" : "text-[#111827] dark:text-foreground"),
          )}
        >
          {item.title}
        </p>
      </div>
      {showLocationRow ? (
        <div className={cn("mt-1 flex items-center gap-1 truncate", metaCls)}>
          <MapPin className="h-3 w-3 shrink-0 opacity-80" strokeWidth={2.25} />
          <span className="truncate">{item.location}</span>
        </div>
      ) : null}
      {showWithRow ? <p className={cn("mt-0.5 truncate", metaCls)}>{item.withLabel}</p> : null}
    </>
  );

  const columnWidth = 100 / Math.max(columnCount, 1);
  const horizontalGapPct = columnCount > 1 ? 0.8 : 0;
  const widthPct = Math.max(8, columnWidth - horizontalGapPct);
  const stackInsetPx = hasShortOverlap ? Math.min(stackDepth * 8, 18) : 0;
  const positionStyle = {
    top: `${top}%`,
    height: `${effectiveHeight}%`,
    left: `calc(${columnIndex * columnWidth}% + ${stackInsetPx}px)`,
    width: `calc(${widthPct}% - ${stackInsetPx}px)`,
    zIndex: selected ? 4 : columnIndex * 10 + stackDepth + 1,
  };
  const surfaceStyle =
    useCategoryColor && catHex
      ? { ...positionStyle, ...categoryBlockSurfaceStyle(catHex, selected) }
      : positionStyle;
  const title = `${item.title} · ${formatHM(item.startMinute)}`;

  return (
    <button
      type="button"
      className={cn(
        toneClass,
        "z-[1]",
        hasShortOverlap && !selected && "shadow-[0_12px_28px_-18px_rgba(15,23,42,0.45)]",
      )}
      style={surfaceStyle}
      title={title}
      onClick={(e) => {
        e.stopPropagation();
        onSelect();
      }}
    >
      <div className="flex h-full flex-col items-start justify-start">{inner}</div>
    </button>
  );
}

type PositionedTimelineItem = DayTimelineItem & {
  columnIndex: number;
  columnCount: number;
  stackDepth: number;
  hasShortOverlap: boolean;
};

function computeTimelineColumns(items: DayTimelineItem[]): PositionedTimelineItem[] {
  return computeEventOverlapLayout(items);
}

function formatHM(minutes: number): string {
  const h = Math.floor(minutes / 60).toString().padStart(2, "0");
  const m = (minutes % 60).toString().padStart(2, "0");
  return `${h}:${m}`;
}
