"use client";
import type { CalendarRepeatRule } from "@prisma/client";
import { addMinutes } from "date-fns";
import { BookOpen, CalendarClock, MapPin } from "lucide-react";
import { useEffect, useRef, useState } from "react";

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
};

const MINUTE_PX = 0.72;
const VISUAL_PADDING_MINUTES = 30;
const FULL_DAY_MINUTES = 24 * 60;
const DEFAULT_VIEW_START = 8 * 60;
const DEFAULT_VIEW_END = 21 * 60;

const COURSE_TONE = {
  soft: "border-amber-300/70 bg-amber-100/70 text-amber-950 before:absolute before:bottom-0 before:left-0 before:top-0 before:w-1 before:bg-amber-400",
  solid: "border-amber-400 bg-amber-400 text-white",
};
const STUDY_TONE = {
  soft: "border-dashed border-foreground/25 bg-muted/55 text-foreground before:absolute before:bottom-0 before:left-0 before:top-0 before:w-1 before:bg-foreground/35",
  solid: "border-foreground/80 bg-foreground text-background",
};

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

  const isEmpty = items.length === 0;

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

  return (
    <div className="rounded-2xl border border-border/60 bg-card p-2">
      <div
        ref={scrollRef}
        className="overflow-y-auto overscroll-contain"
        style={{ height: `${viewportHeight}px` }}
      >
        <div
          className="relative grid gap-px"
          style={{
            gridTemplateColumns: "2.25rem minmax(0, 1fr)",
            height: `${fullHeight}px`,
          }}
        >
          <div className="relative">
            {hourLabels.map((m) => {
              const hiddenByNow =
                hasNowLine && Math.abs(m - nowMinute) < 28;
              if (hiddenByNow) return null;
              const top = ((m - visualStartMinute) / totalMinutes) * 100;
              return (
                <div
                  key={m}
                  className="absolute -translate-y-1/2 pr-1 text-right text-[10px] font-medium text-muted-foreground"
                  style={{ top: `${top}%`, right: 0, left: 0 }}
                >
                  {m === FULL_DAY_MINUTES ? "24:00" : formatHM(m)}
                </div>
              );
            })}

            {hasNowLine ? (
              <div
                className="pointer-events-none absolute left-0 right-0 z-20 -translate-y-1/2 pr-1 text-right text-[10px] font-semibold tabular-nums text-rose-500"
                style={{ top: `${((nowMinute - visualStartMinute) / totalMinutes) * 100}%` }}
              >
                {formatHM(nowMinute)}
              </div>
            ) : null}
          </div>

          <div className="relative border-l border-border/60 bg-background/40">
            <button
              type="button"
              aria-label="Create event"
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

            {hourLabels.slice(1, -1).map((m) => {
              const top = ((m - visualStartMinute) / totalMinutes) * 100;
              return (
                <div
                  key={m}
                  className="absolute left-0 right-0 border-t border-border/25"
                  style={{ top: `${top}%` }}
                />
              );
            })}

            {hasNowLine ? (
              <div
                className="absolute left-0 right-0 z-20 h-px bg-rose-500"
                style={{
                  top: `${((nowMinute - visualStartMinute) / totalMinutes) * 100}%`,
                }}
              >
                <span className="absolute -left-1 -top-[3px] h-[7px] w-[7px] rounded-full bg-rose-500" />
              </div>
            ) : null}

            {isEmpty ? (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-4 text-center">
                <p className="rounded-full bg-muted/70 px-3 py-1 text-[11px] font-medium text-muted-foreground">
                  {isToday ? "Nothing scheduled today" : "Nothing scheduled"}
                </p>
              </div>
            ) : null}

            {items.map((item) => (
              <TimelineBlock
                key={`${item.kind}-${item.id}`}
                item={item}
                dayStart={visualStartMinute}
                totalMinutes={totalMinutes}
                isToday={isToday}
                nowMinute={nowMinute}
                selected={selectedItemId === item.id}
                onSelect={() => {
                  setSelectedItemId(item.id);
                  onOpenItem?.(item);
                }}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function TimelineBlock({
  item,
  dayStart,
  totalMinutes,
  isToday,
  nowMinute,
  selected,
  onSelect,
}: {
  item: DayTimelineItem;
  dayStart: number;
  totalMinutes: number;
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

  const tone = isStudy ? STUDY_TONE : COURSE_TONE;
  const toneClass = cn(
    "absolute left-0.5 right-0.5 overflow-hidden rounded-[2px] border px-2 py-1 text-left text-[11px] leading-tight shadow-sm transition",
    selected ? tone.solid : tone.soft,
    state === "past" ? "opacity-55" : undefined,
    state === "ongoing"
      ? "ring-2 ring-primary/40 ring-offset-1 ring-offset-background"
      : undefined,
    "hover:brightness-95 active:brightness-90",
  );

  // Minimum visual height so a 30-min block doesn't collapse into illegibility.
  // We cap at what fits instead of overflowing.
  const minHeightPct = Math.min(4, height);
  const effectiveHeight = Math.max(height, minHeightPct);
  const showTimeRow = effectiveHeight > 0;
  const showLocationRow = effectiveHeight > 9 && item.location;
  const showWithRow = effectiveHeight > 11 && item.withLabel;

  const inner = (
    <>
      {showTimeRow ? (
        <div className="truncate text-left text-[10px] tabular-nums opacity-75">
          {formatHM(item.startMinute)}
        </div>
      ) : null}
      <div className="flex items-center gap-1">
        <Icon
          className={cn(
            "h-3 w-3 shrink-0",
            selected
              ? "text-current"
              : state === "ongoing"
                ? "text-primary"
                : "text-foreground/70",
          )}
          strokeWidth={2.25}
        />
        <span
          className={cn(
            "truncate text-left font-semibold",
            !selected && state === "ongoing" ? "text-primary" : undefined,
          )}
        >
          {item.title}
        </span>
      </div>
      {showLocationRow ? (
        <div className="flex items-center gap-1 truncate text-[10px] opacity-75">
          <MapPin className="h-2.5 w-2.5 shrink-0" strokeWidth={2.25} />
          <span className="truncate">{item.location}</span>
        </div>
      ) : null}
      {showWithRow ? <div className="truncate text-[10px] opacity-70">{item.withLabel}</div> : null}
    </>
  );

  const style = { top: `${top}%`, height: `${effectiveHeight}%` };
  const title = `${item.title} · ${formatHM(item.startMinute)}`;

  return (
    <button
      type="button"
      className={toneClass}
      style={style}
      title={title}
      onClick={onSelect}
    >
      <div className="flex h-full flex-col items-start justify-start">{inner}</div>
    </button>
  );
}

function formatHM(minutes: number): string {
  const h = Math.floor(minutes / 60).toString().padStart(2, "0");
  const m = (minutes % 60).toString().padStart(2, "0");
  return `${h}:${m}`;
}
